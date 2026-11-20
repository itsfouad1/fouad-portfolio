# Supabase migration patch for Fouad Portfolio

This patch moves **documents, messages, admin sessions, and uploaded media** to Supabase while retaining SQLite as a local fallback and keeping the existing API routes.

## Files in this patch

- `server/index.mjs` — replace the current file with this version.
- `scripts/migrate-to-supabase.mjs` — one-time migration script that reads the existing local SQLite database and uploads local media.
- No frontend files are changed. Existing `/api/*` routes remain compatible.

## 1. Apply the files safely

1. Confirm your terminal is on `feature/supabase-migration`.
2. Keep your current backup of `data/portfolio.sqlite` and `data/media/`.
3. Copy the two files from this patch into the matching paths in your project, replacing only `server/index.mjs` and adding `scripts/migrate-to-supabase.mjs`.
4. Do not replace `src/App.jsx`, `src/styles.css`, or `src/BuyMeCoffee.jsx`.

## 2. Install the pinned Supabase client

From the project root:

```powershell
npm install --save-exact @supabase/supabase-js@2.119.0
```

This updates both `package.json` and `package-lock.json`.

## 3. Set local environment variables for the migration

In PowerShell, in the same terminal window:

```powershell
$env:SUPABASE_URL="https://jzanuwmxqffmshpeqjds.supabase.co"
$env:SUPABASE_SECRET_KEY="PASTE_YOUR_SUPABASE_SECRET_KEY_HERE"
```

Paste the secret key only into your terminal. Never put it in frontend code, commit it, or send it in chat.

## 4. Run the one-time migration from your computer

```powershell
node scripts/migrate-to-supabase.mjs
```

The script:
- Reads `data/portfolio.sqlite` without changing its documents or messages.
- Uploads files in `data/media/` to the `portfolio-media` bucket.
- Rewrites `/media/<filename>` references in the draft and published documents to their public Supabase Storage URLs.
- Copies local messages if the Supabase messages table is empty.
- Does not migrate old admin sessions; you will sign in again.
- Can be run again for documents and media; it avoids duplicating messages when the destination already contains messages.

Do not delete or rename `data/` after migration.

## 5. Configure Render

Keep these server-side environment variables in Render:

- `SUPABASE_URL` = `https://jzanuwmxqffmshpeqjds.supabase.co`
- `SUPABASE_SECRET_KEY` = your Supabase secret key
- `ADMIN_PASSWORD` = your existing admin password (at least 12 characters)

Do not prefix the secret key with `VITE_` or `NEXT_PUBLIC_`.

## 6. Verify before removing anything

After Render deploys:
1. Open the public portfolio and confirm content and existing media appear.
2. Sign in to the admin dashboard.
3. Change a harmless draft field and save it.
4. Publish only if you intend the change to become public.
5. Submit a test contact message.
6. Restart/redeploy the Render service, then confirm the draft, published content, message, and media remain.
7. Download an export from the admin dashboard.

Keep your original SQLite file and `data/media/` backup until every check passes.

## 7. Local development and tests

Without `SUPABASE_URL` and `SUPABASE_SECRET_KEY`, the server continues to use SQLite locally. This keeps the existing dashboard test isolated from your live Supabase project.

```powershell
npm run test:dashboard
npm run build
npm start
```

If Supabase environment variables are set locally, the server uses Supabase instead of SQLite for documents, messages, and sessions.
