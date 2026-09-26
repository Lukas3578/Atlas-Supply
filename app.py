import os
import sqlite3
from datetime import datetime
from functools import wraps

from flask import Flask, g, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")
app.config.update(
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("RENDER", "") != "" or os.environ.get("FORCE_SECURE_COOKIE") == "1",
)

TURSO_DATABASE_URL = os.environ.get("TURSO_DATABASE_URL")
TURSO_AUTH_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")
DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "atlas.db"))
USE_TURSO = bool(TURSO_DATABASE_URL and TURSO_AUTH_TOKEN)

if USE_TURSO:
    import libsql

STOCK_LABELS = {"in": "In stock", "low": "Low stock", "out": "Out of stock"}


class RowWrapper:
    """Makes a plain tuple row behave like sqlite3.Row (dict-style + index access)."""

    def __init__(self, columns, values):
        self._columns = columns
        self._values = values

    def __getitem__(self, key):
        if isinstance(key, str):
            return self._values[self._columns.index(key)]
        return self._values[key]

    def keys(self):
        return self._columns


class ConnWrapper:
    """Thin wrapper so libsql connections support the same .execute(...).fetchall()/
    fetchone() pattern with dict-like rows that the rest of this app relies on
    (mirroring sqlite3.Row behavior), regardless of which backend is active."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=()):
        cur = self._conn.execute(sql, params)
        return CursorWrapper(cur)

    def executemany(self, sql, seq_of_params):
        cur = self._conn.executemany(sql, seq_of_params)
        return CursorWrapper(cur)

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


class CursorWrapper:
    def __init__(self, cur):
        self._cur = cur
        self._columns = [d[0] for d in (cur.description or [])]

    def fetchone(self):
        row = self._cur.fetchone()
        if row is None:
            return None
        return RowWrapper(self._columns, row)

    def fetchall(self):
        rows = self._cur.fetchall()
        return [RowWrapper(self._columns, r) for r in rows]

    @property
    def lastrowid(self):
        return self._cur.lastrowid


def make_connection():
    if USE_TURSO:
        raw = libsql.connect(database=TURSO_DATABASE_URL, auth_token=TURSO_AUTH_TOKEN)
        return ConnWrapper(raw)
    raw = sqlite3.connect(DB_PATH)
    raw.row_factory = sqlite3.Row
    return raw


def get_db():
    if "db" not in g:
        g.db = make_connection()
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = make_connection()
    db.execute(
        """CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            unit TEXT NOT NULL,
            price INTEGER NOT NULL,
            stock TEXT NOT NULL DEFAULT 'in'
        )"""
    )
    db.execute(
        """CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            contact TEXT NOT NULL,
            note TEXT,
            items_json TEXT NOT NULL,
            total INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'new',
            created_at TEXT NOT NULL
        )"""
    )
    db.execute(
        """CREATE TABLE IF NOT EXISTS admin (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            password_hash TEXT NOT NULL
        )"""
    )
    db.execute(
        """CREATE TABLE IF NOT EXISTS delivery_regions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            radius_km REAL NOT NULL DEFAULT 30,
            note TEXT
        )"""
    )
    # migrate older databases that were created before radius_km existed
    try:
        db.execute("ALTER TABLE delivery_regions ADD COLUMN radius_km REAL NOT NULL DEFAULT 30")
        db.commit()
    except Exception:
        pass

    # seed default admin password if none exists yet
    row = db.execute("SELECT * FROM admin WHERE id = 1").fetchone()
    if row is None:
        default_password = os.environ.get("ADMIN_DEFAULT_PASSWORD", "changeme123")
        db.execute(
            "INSERT INTO admin (id, password_hash) VALUES (1, ?)",
            (generate_password_hash(default_password),),
        )

    # seed a few example products if the table is empty
    count = db.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    if count == 0:
        db.executemany(
            "INSERT INTO products (name, unit, price, stock) VALUES (?, ?, ?, ?)",
            [
                ("Concrete", "per bag", 45, "in"),
                ("Steel beam", "per piece", 120, "low"),
                ("Bricks", "per pallet", 80, "in"),
            ],
        )

    count = db.execute("SELECT COUNT(*) FROM delivery_regions").fetchone()[0]
    if count == 0:
        db.executemany(
            "INSERT INTO delivery_regions (label, lat, lon, radius_km, note) VALUES (?, ?, ?, ?, ?)",
            [
                ("Munich, Germany", 48.1351, 11.5820, 30, ""),
            ],
        )

    db.commit()
    db.close()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("is_admin"):
            return jsonify({"error": "not authenticated"}), 401
        return view(*args, **kwargs)

    return wrapped


# ---------- pages ----------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/warenkorb")
def warenkorb_page():
    return render_template("warenkorb.html")


@app.route("/karte")
def karte_page():
    return render_template("karte.html")


@app.route("/admin")
def admin_page():
    return render_template("admin.html")


# ---------- public product listing ----------

@app.route("/api/products", methods=["GET"])
def list_products():
    db = get_db()
    rows = db.execute("SELECT * FROM products ORDER BY id").fetchall()
    return jsonify([dict(r) for r in rows])


# ---------- public delivery regions ----------

@app.route("/api/delivery-regions", methods=["GET"])
def list_delivery_regions():
    db = get_db()
    rows = db.execute("SELECT * FROM delivery_regions ORDER BY id").fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/admin/delivery-regions", methods=["POST"])
@login_required
def add_delivery_region():
    data = request.get_json(silent=True) or {}
    label = (data.get("label") or "").strip()
    note = (data.get("note") or "").strip()
    try:
        lat = float(data.get("lat"))
        lon = float(data.get("lon"))
        radius_km = float(data.get("radius_km", 30))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid coordinates or radius"}), 400

    if not label or lat < -90 or lat > 90 or lon < -180 or lon > 180 or radius_km <= 0:
        return jsonify({"error": "invalid region data"}), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO delivery_regions (label, lat, lon, radius_km, note) VALUES (?, ?, ?, ?, ?)",
        (label, lat, lon, radius_km, note),
    )
    db.commit()
    return jsonify({"ok": True, "id": cur.lastrowid}), 201


@app.route("/api/admin/delivery-regions/<int:region_id>", methods=["PATCH"])
@login_required
def update_delivery_region(region_id):
    data = request.get_json(silent=True) or {}
    db = get_db()
    row = db.execute("SELECT * FROM delivery_regions WHERE id = ?", (region_id,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404

    label = data.get("label", row["label"])
    lat = row["lat"]
    lon = row["lon"]
    radius_km = row["radius_km"]
    if "lat" in data:
        try:
            lat = float(data.get("lat"))
        except (TypeError, ValueError):
            return jsonify({"error": "invalid lat"}), 400
    if "lon" in data:
        try:
            lon = float(data.get("lon"))
        except (TypeError, ValueError):
            return jsonify({"error": "invalid lon"}), 400
    if "radius_km" in data:
        try:
            radius_km = float(data.get("radius_km"))
        except (TypeError, ValueError):
            return jsonify({"error": "invalid radius"}), 400

    if not str(label).strip() or lat < -90 or lat > 90 or lon < -180 or lon > 180 or radius_km <= 0:
        return jsonify({"error": "invalid region data"}), 400

    db.execute(
        "UPDATE delivery_regions SET label = ?, lat = ?, lon = ?, radius_km = ? WHERE id = ?",
        (str(label).strip(), lat, lon, radius_km, region_id),
    )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/admin/delivery-regions/<int:region_id>", methods=["DELETE"])
@login_required
def delete_delivery_region(region_id):
    db = get_db()
    db.execute("DELETE FROM delivery_regions WHERE id = ?", (region_id,))
    db.commit()
    return jsonify({"ok": True})


# ---------- orders ----------

@app.route("/api/orders", methods=["POST"])
def create_order():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    contact = (data.get("contact") or "").strip()
    note = (data.get("note") or "").strip()
    items = data.get("items") or []

    if not name or not contact:
        return jsonify({"error": "name and contact are required"}), 400
    if not isinstance(items, list) or len(items) == 0:
        return jsonify({"error": "cart is empty"}), 400

    db = get_db()
    product_rows = db.execute("SELECT * FROM products").fetchall()
    products_by_id = {r["id"]: r for r in product_rows}

    order_items = []
    total = 0
    for item in items:
        try:
            pid = int(item.get("id"))
            qty = int(item.get("qty"))
        except (TypeError, ValueError):
            return jsonify({"error": "invalid item"}), 400
        if qty < 1:
            return jsonify({"error": "invalid quantity"}), 400
        product = products_by_id.get(pid)
        if not product:
            return jsonify({"error": f"unknown product id {pid}"}), 400
        line_total = product["price"] * qty
        total += line_total
        order_items.append(
            {
                "name": product["name"],
                "unit": product["unit"],
                "qty": qty,
                "price": product["price"],
            }
        )

    import json

    db.execute(
        """INSERT INTO orders (customer_name, contact, note, items_json, total, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'new', ?)""",
        (name, contact, note, json.dumps(order_items), total, datetime.utcnow().isoformat()),
    )
    db.commit()

    return jsonify({"ok": True, "total": total}), 201


# ---------- auth ----------

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    password = data.get("password") or ""

    db = get_db()
    row = db.execute("SELECT * FROM admin WHERE id = 1").fetchone()
    if row and check_password_hash(row["password_hash"], password):
        session["is_admin"] = True
        return jsonify({"ok": True})
    return jsonify({"error": "invalid password"}), 401


@app.route("/api/logout", methods=["POST"])
def logout():
    session.pop("is_admin", None)
    return jsonify({"ok": True})


@app.route("/api/session", methods=["GET"])
def session_status():
    return jsonify({"is_admin": bool(session.get("is_admin"))})


# ---------- admin: products ----------

@app.route("/api/admin/products", methods=["POST"])
@login_required
def add_product():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    unit = (data.get("unit") or "").strip()
    stock = data.get("stock") or "in"

    try:
        price = int(round(float(data.get("price"))))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid price"}), 400

    if not name or not unit or price < 0 or stock not in STOCK_LABELS:
        return jsonify({"error": "invalid product data"}), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO products (name, unit, price, stock) VALUES (?, ?, ?, ?)",
        (name, unit, price, stock),
    )
    db.commit()
    return jsonify({"ok": True, "id": cur.lastrowid}), 201


@app.route("/api/admin/products/<int:product_id>", methods=["PATCH"])
@login_required
def update_product(product_id):
    data = request.get_json(silent=True) or {}
    db = get_db()
    row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not row:
        return jsonify({"error": "not found"}), 404

    name = data.get("name", row["name"])
    unit = data.get("unit", row["unit"])
    stock = data.get("stock", row["stock"])
    price = row["price"]
    if "price" in data:
        try:
            price = int(round(float(data.get("price"))))
        except (TypeError, ValueError):
            return jsonify({"error": "invalid price"}), 400

    if not str(name).strip() or not str(unit).strip() or price < 0 or stock not in STOCK_LABELS:
        return jsonify({"error": "invalid product data"}), 400

    db.execute(
        "UPDATE products SET name = ?, unit = ?, price = ?, stock = ? WHERE id = ?",
        (str(name).strip(), str(unit).strip(), price, stock, product_id),
    )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/admin/products/<int:product_id>", methods=["DELETE"])
@login_required
def delete_product(product_id):
    db = get_db()
    db.execute("DELETE FROM products WHERE id = ?", (product_id,))
    db.commit()
    return jsonify({"ok": True})


# ---------- admin: orders ----------

@app.route("/api/admin/orders", methods=["GET"])
@login_required
def list_orders():
    db = get_db()
    rows = db.execute("SELECT * FROM orders ORDER BY id DESC").fetchall()
    import json

    result = []
    for r in rows:
        d = dict(r)
        d["items"] = json.loads(d.pop("items_json"))
        result.append(d)
    return jsonify(result)


@app.route("/api/admin/orders/<int:order_id>", methods=["PATCH"])
@login_required
def update_order(order_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in ("new", "done"):
        return jsonify({"error": "invalid status"}), 400
    db = get_db()
    db.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
    db.commit()
    return jsonify({"ok": True})


# ---------- admin: change password ----------

@app.route("/api/admin/password", methods=["POST"])
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    new_password = data.get("password") or ""
    if len(new_password) < 4:
        return jsonify({"error": "password too short"}), 400
    db = get_db()
    db.execute(
        "UPDATE admin SET password_hash = ? WHERE id = 1",
        (generate_password_hash(new_password),),
    )
    db.commit()
    return jsonify({"ok": True})


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
