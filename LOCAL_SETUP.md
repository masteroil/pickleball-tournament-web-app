# Run Courtside locally

Requires Node.js 22.13+ and pnpm. Run these commands from the project root (the folder containing package.json). On Windows, use the VS Code PowerShell terminal.

1. Stop an existing development server with Ctrl+C.
2. Install dependencies: `pnpm install`.
3. Create the database tables: `pnpm db:migrate`. Confirm if Wrangler prompts to apply migrations.
4. Verify the table: `pnpm db:check`. A new database reports `tournament_count: 0`.
5. Start: `pnpm dev`.
6. Open `http://localhost:5173` and select **Organizer login**. Use your Supabase email/password account. See `AUTH_SETUP.md` for first-time account and redirect setup.
7. Once logged in as the authorized organizer, choose your six-digit umpire PIN and create the sample tournament. Existing tournament data is preserved.

No preliminary build is required. The migration command and Vite share the same database ID and `.wrangler/state` storage directory. The local database is separate from the deployed website's database and does not need cloud credentials. Future starts only require `pnpm dev`; run `pnpm db:migrate` when new migrations are added.

## Fixing `no such table: tournaments`

The application has reached D1, but its schema has not been created in that local database. Stop the server, run `pnpm db:migrate`, then `pnpm db:check` and restart `pnpm dev`.

If you cloned the repository, get the update using `git pull --ff-only origin master`. If you downloaded a ZIP, copy the updated `package.json`, `vite.config.ts`, `wrangler.local.json`, and `scripts/local-db.mjs` into your existing project. Preserve your `.wrangler` directory because it contains local data. Do not overwrite files with unsaved custom changes.

Wrangler records applied migrations and skips them on subsequent runs. If you previously executed the SQL file manually and now see `table tournaments already exists`, stop and inspect the existing database before attempting to adopt its migration history. Do not delete the database to silence that error.

## Scope

This config is for local development only. A hosted shared database and access from umpire phones outside localhost require a deployment with the appropriate authentication and access configuration. Scanning a localhost QR code on another phone does not point to your computer.
