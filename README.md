# Atlas Supply

Flask backend + frontend for the Atlas Supply shop (Capital Rift). Orders,
products, and delivery regions are stored in a shared database, so every
visitor sees the same data and every order lands in one place. The admin
panel uses a real server-side session with a hashed password (no
client-side PIN).

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

Open http://localhost:5000. Log in to the Admin tab with the password above,
then change it right away under Admin > Settings.

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
5. Deploy. Render gives you a `https://your-app.onrender.com` URL.

With Turso configured, there's no persistent-disk concern: your data lives
in Turso's cloud database, not on Render's filesystem, so it survives every
redeploy and restart automatically.

## Admin panel

- Shop tab: public product listing, no login needed.
- Cart tab: customers add items and submit an order with their name and
  Discord contact.
- Delivery Map tab: public world map (simplified continent outlines drawn
  as inline SVG, no external map tiles needed) showing every location
  Atlas Supply delivers to.
- Admin tab: password-protected. Add/edit/delete products, manage delivery
  locations shown on the map, view and manage incoming orders (mark as
  done), and change the admin password.

### Adding a delivery location

In Admin > Delivery regions, enter a name (e.g. "Paris, France") plus its
latitude and longitude, then click Add location. If you don't know the
coordinates offhand, search "[city name] latitude longitude" — any result
works, decimal degrees like `48.8566, 2.3522`.

Note: the map uses a simplified, hand-drawn continent outline for a clean
industrial look — it's for showing general delivery regions, not precise
geographic borders.

