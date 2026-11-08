# Fouad portfolio + owner dashboard
Requires Node.js 24 or later.

1. `npm install`
2. `npm run build`
3. Set ADMIN_PASSWORD to your own password (12+ characters).
4. `npm start`

PowerShell example:
```
$env:ADMIN_PASSWORD="YOUR-OWN-LONG-PASSWORD"
npm start
```
Open http://localhost:4173 and /admin. Use HTTPS and NODE_ENV=production when deployed.

SQLite database is saved in data/portfolio.sqlite. Back up that file; keep the data directory private. Deploy the complete Node application on a persistent disk. The static-only Sites Worker does not provide dashboard APIs. Do not upload only dist/client when using the dashboard.

Implemented: login, sessions, profile/project/skill editing, draft saving, authenticated draft preview, publishing, contact inbox, read status. The approved portrait is used unchanged.
Media upload, CV management, social links, experience editing and project case-study editing are implemented. Password recovery uses the ADMIN_PASSWORD environment variable; there is no email reset flow.

## Media and content management
The dashboard now supports PNG/JPEG/WebP images and PDF CV uploads (10 MiB max), experience editing/reordering, social links, and extended project case studies. Files are stored in data/media; back up the entire data folder with the SQLite database. Uploaded files are public by URL, so upload portfolio materials only. Saving a draft does not publish changes. Existing databases gain the experience section without overwriting profile/projects.

## Updating an existing installation
Stop the server, back up data/, replace the application source files and install dependencies. Keep your existing data/ folder and ADMIN_PASSWORD setting, then build and restart. Do not replace your database with test data.

## Complete release
See UPDATE_SUMMARY_AR.md for Arabic instructions and feature summary. START.ps1 assists Windows startup. The content backup export does not include media bytes; back up data/ for a complete backup. Certificates and additional project gallery links are editable. Direct video uploads are not supported; recording links are supported.

`npm run test:dashboard` exercises the backend in a temporary database. `npm run dev` launches both Vite and the API. If ADMIN_PASSWORD is absent during development, a random temporary password is written to .preview-admin-password. Production `npm start` always requires your own ADMIN_PASSWORD. Never publish .preview-admin-password or data/ as static assets.
