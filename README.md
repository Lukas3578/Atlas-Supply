# Atlas Supply

Flask backend + frontend for the Atlas Supply shop (Capital Rift). Orders and
products are stored in a shared SQLite database, so every visitor sees the
same product list and every order lands in one place. The admin panel uses a
real server-side session with a hashed password (no client-side PIN).

## Local development

```bash
cd atlas-supply
python -m venv venv
source venv/bin/activate      # on Windows: venv\Scripts\activate
pip install -r requirements.txt

# optional: set a custom starting admin password (default: changeme123)
export ADMIN_DEFAULT_PASSWORD="your-password-here"

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
5. Deploy. Render gives you a `https://your-app.onrender.com` URL.

### Important: persistent disk

Render's free web services have an **ephemeral filesystem** — the SQLite
file (`atlas.db`) is wiped on every redeploy or restart unless you attach a
persistent disk:

1. In the Render dashboard, go to your service > Disks > Add Disk.
2. Mount path: `/opt/render/project/src` (or any path you like).
3. Set the `DB_PATH` environment variable to point inside that mount, e.g.
   `/opt/render/project/src/atlas.db`.

Without a persistent disk, products and orders will reset every time you
redeploy. Persistent disks are available on Render's paid plans, not the
free tier — if you're on the free tier, consider Render's managed Postgres
instead for real durability (this app currently uses SQLite for simplicity).

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
