# Courtside

A private three-court pickleball tournament MVP built with React, TypeScript, Vite/Vinext and Cloudflare D1.

## Features
- Organizer-owned tournament with custom category names and 2–16 entries per bracket, singles or doubles, with automatic byes.
- Three manually assigned courts, side-out or rally scoring, targets 11/15/21, win by two.
- Permanent court QR links, six-digit PIN, named court sessions expiring after 12 hours, organizer session release.
- Server-side score validation, optimistic concurrency, undo, signature capture and automatic bracket progression.
- Read-only scoreboard polling every 2.5 seconds. Signatures are returned only to the organizer.

## Try it
Open the deployed private app while signed in. Set an umpire PIN to initialize a fictional eight-team sample tournament. Assign a match, open Court access, enter the PIN and score a match. At game point, enter a winning player's name and signature to confirm the result. Add real categories separately.

The hosting audience is owner-private. Other umpires and spectators cannot access this deployment until sharing is configured. QR access itself does not bypass hosting permissions. Organizer identity uses the hosting platform's authenticated user headers. The first initializer owns the tournament; do not make an uninitialized deployment public.

## Development
Install with pnpm; `pnpm db:migrate`; `pnpm db:check`; `pnpm dev`. See LOCAL_SETUP.md for Windows instructions. `pnpm build` builds the app; `pnpm exec tsc --noEmit` checks types.
Run scoring tests: `node --experimental-strip-types scripts/test-tournament.mjs`.
Run API tests: `node --experimental-strip-types scripts/test-api.mjs`.
Requires Node.js 22.13+ and pnpm. The API tests use an isolated in-memory database adapter; they do not modify hosted tournament data.
D1 migration source is in `drizzle/`; see hosting scripts for local migration application.

## Current limits
One tournament per deployment; one game per match; no round robin, double elimination, multi-game matches, offline scoring, player accounts or payments. Entry order determines pairings and bye recipients. Groups are editable labels in a combined bracket; they do not create separate competitions. Category names, player names, groups and rules can be edited before any match in that category is live or completed. The sample category is retained. Confirmed results cannot currently be reopened. The PIN cannot currently be reset in the UI. Signature capture is acknowledgment, not identity verification. Production release should add PIN rotation, result correction with re-signing, archival/export, and retention controls. This is an MVP for organizer evaluation, not a fully hardened public SaaS.

Data is stored in D1, not Supabase. The Vite app uses Vinext for API routes and the hosting integration. Source is maintained at https://github.com/masteroil/pickleball-tournament-web-app. The existing private preview is hosted with Sites. Pushing to GitHub does not automatically deploy the app.
