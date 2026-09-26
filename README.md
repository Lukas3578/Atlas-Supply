# Atlas Supply

Flask backend + frontend for the Atlas Supply shop (Capital Rift). Orders,
products, and delivery regions are stored in a shared database, so every
visitor sees the same data and every order lands in one place. Every part
of the site is its own page with its own URL. The admin panel is
protected by a real server-side session with a hashed password (no
client-side PIN).

## Pages

| URL          | Page                                               |
|--------------|-----------------------------------------------------|
| `/`          | Shop — product listing                              |
| `/warenkorb` | Cart — review items and submit an order              |
| `/karte`     | Delivery Map — rotating 3D globe with delivery zones |
| `/admin`     | Admin panel — products, regions, orders, password    |

The cart is kept in the browser's `localStorage` so it survives navigating
between these separate pages; placing an order still sends everything to
the server.

## Project structure

```
app.py                      Flask app: routes, database, auth
templates/_nav.html         Shared header/nav, included on every page
templates/index.html        Shop page (/)
templates/warenkorb.html    Cart page (/warenkorb)
templates/karte.html        Delivery map page (/karte)
templates/admin.html        Admin panel (/admin)
static/style.css            Shared styles for all pages
static/common.js            Shared helpers: API calls, cart storage, nav highlighting
static/shop.js               Shop page logic (product grid)
static/cart.js               Cart page logic (order form)
static/globe.js               Delivery map logic (3D globe)
static/admin.js              Admin panel logic (login, product & region CRUD)
```

## Database: Turso or local SQLite

This app supports two database backends, chosen automatically:

- **Turso** (recommended for deployment) — set `TURSO_DATABASE_URL` and
  `TURSO_AUTH_TOKEN` as environment variables. The app then talks to your
  Turso database over the network via `libsql`. This is the setup you want
  on Render, since it avoids the "ephemeral filesystem" problem entirely —
  no persistent disk needed.
- **Local SQLite file** (default, good for local development) — if the two
  Turso variables aren't set, the app falls back to a local `atlas.db`
  file (path controlled by `DB_PATH`, defaults to a file next to `app.py`).

### Getting your Turso credentials

```bash
# install the Turso CLI if you haven't
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login

# list your databases (or create one)
turso db list
turso db create atlas-supply

# get the database URL
turso db show atlas-supply
# -> look for the "URL" line, e.g. libsql://atlas-supply-yourname.turso.io

# create an auth token
turso db tokens create atlas-supply
```

Or use the Turso web dashboard at https://app.turso.tech — open your
database, copy the URL, and use "Create Token".

## Local development

```bash
cd atlas-supply
python -m venv venv
source venv/bin/activate      # on Windows: venv\Scripts\activate
pip install -r requirements.txt

# optional: set a custom starting admin password (default: changeme123)
export ADMIN_DEFAULT_PASSWORD="your-password-here"

# optional: use Turso instead of local SQLite
export TURSO_DATABASE_URL="libsql://your-db-yourname.turso.io"
export TURSO_AUTH_TOKEN="your-token-here"

python app.py
```

Open http://localhost:5000 for the shop. The other pages are at
http://localhost:5000/warenkorb, http://localhost:5000/karte, and
http://localhost:5000/admin. Log in with the password above, then change
it right away under Settings.

## Deploying on Render

1. Push this folder to a GitHub repo.
2. On Render: New > Web Service > connect the repo.
3. Render should auto-detect `render.yaml`. If not, set manually:
   - Build command: `pip install -r requirements.txt`
   - Start command: `gunicorn app:app`
4. Set environment variables (Render dashboard > Environment):
   - `SECRET_KEY` — any long random string (Render can auto-generate this)
   - `ADMIN_DEFAULT_PASSWORD` — the password used the very first time the
     database is created. Change it immediately after first login.
   - `TURSO_DATABASE_URL` — your Turso database URL (e.g.
     `libsql://atlas-supply-yourname.turso.io`)
   - `TURSO_AUTH_TOKEN` — your Turso auth token
5. Deploy. Render gives you a `https://your-app.onrender.com` URL, and the
   admin panel lives at `https://your-app.onrender.com/admin`.

With Turso configured, there's no persistent-disk concern: your data lives
in Turso's cloud database, not on Render's filesystem, so it survives every
redeploy and restart automatically.

Render sets its own `RENDER` environment variable automatically, which this
app uses to enable `Secure` session cookies (required for login to work
correctly over HTTPS). You don't need to set this yourself.

## Site pages

- **Shop** (`/`): public product listing, no login needed.
- **Cart**: customers add items and submit an order with their name and
  Discord contact.
- **Delivery Map**: a rotating 3D globe with real country borders. Delivery
  regions are drawn as solid red circles (center point + radius in km);
  everywhere else on the globe stays green, meaning "we don't deliver
  there."
- **Admin** (`/admin`, separate page): password-protected. Add/edit/delete
  products, manage delivery regions shown on the globe, view and manage
  incoming orders (mark as done), and change the admin password.

### Adding a delivery region

In `/admin` > Delivery regions, enter a name (e.g. "Munich, Germany"), its
latitude and longitude, and a radius in kilometers (e.g. 30). Everything
within that radius shows up red on the public globe; everything else stays
green. If you don't know the coordinates offhand, search "[city name]
latitude longitude" — any result works, decimal degrees like
`48.1351, 11.5820`.

You can edit a region's label, coordinates, or radius directly in the
admin table — changes save automatically when you click out of the field.


