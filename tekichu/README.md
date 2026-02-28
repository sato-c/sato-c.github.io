# TEKICHU Local Startup

## Prerequisites
- Node.js (LTS recommended)
- `node -v` and `npm -v` should work

## Start Local Server
Run from `tekichu` directory:

```powershell
cd d:\sato-c.github.io\tekichu
npx --yes serve . -l 4173
```

Open:
- PC: `http://localhost:4173/`
- Mobile (same LAN): `http://<PCのIP>:4173/`

## Important
- Start the server inside `tekichu`.
- If started from repository root, relative paths like `css/style.css` and `js/app.js` may resolve incorrectly and cause `404`.
