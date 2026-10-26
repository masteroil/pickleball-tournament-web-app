# Courtside email/password login

Supabase project: `courtside-pickleball` (`ymfagiodobwfpyuiokqv`).
Authentication is Supabase; tournament data remains in the existing Cloudflare D1 database. No data migration or reset is necessary.

## Supabase dashboard setup

Open https://supabase.com/dashboard/project/ymfagiodobwfpyuiokqv/auth/url-configuration

Set Site URL to:
`https://courtside-pickleball-aizem.grandtoast11.chatgpt.site/`

Add Redirect URLs:
- `https://courtside-pickleball-aizem.grandtoast11.chatgpt.site/`
- `http://localhost:5173/`
- `http://127.0.0.1:5173/`

Keep the Email provider and email confirmation enabled. Configure custom SMTP for real email delivery. Supabase's default mail service restricts recipients to project organization members; the organizer's address must be an allowed recipient or custom SMTP must be configured.

Use **Organizer login → Create account** with `aizemdairo@gmail.com`, choose a password privately, confirm the email, then log in. Alternatively, create the confirmed organizer account through Supabase's Users dashboard using your own password. Never commit or share your password in chat.

The connected Supabase tools do not expose Auth URL settings or SMTP configuration; these dashboard settings require manual configuration.

## Access rules

This version supports one organizer. The server-only allowlist in `app/organizer-auth.ts` uses the existing site owner's verified email, `aizemdairo@gmail.com`. Every organizer request validates its bearer token against Supabase Auth and checks confirmed email. Other registered users receive no organizer privileges. User metadata, old ChatGPT headers, and local mock identities do not grant access.

Existing D1 owner IDs are retained for history but no longer determine authorization. The verified allowlisted organizer controls the existing tournament. This is deliberate for this single-organizer app, not a multi-tenant ownership model.

Public viewers can see brackets and scores. Umpires use court QR + name + PIN. Signatures and signer names remain organizer-only. Making hosted access public removes the platform's ChatGPT gate; deploy the protected API before changing hosting access.

The browser uses a public publishable key in `app/supabase-config.ts`. No service-role key is needed. The SDK persists/refreshes the session; the API validates it independently. The default browser storage means shared-device users should sign out after use.

## Local update

```sh
git pull --ff-only origin master
pnpm install
pnpm db:migrate
pnpm dev
```

Log in through the button at `http://localhost:5173`. The old `/signin-with-chatgpt` local shortcut no longer grants organizer privileges.

## Verification

```sh
node --experimental-strip-types scripts/test-auth.mjs
node --experimental-strip-types scripts/test-api.mjs
node --experimental-strip-types scripts/test-tournament.mjs
pnpm exec tsc --noEmit
```

Tests exercise mocked identity/D1 boundaries; real signup, confirmation mail, recovery, and authenticated login must be verified after dashboard setup with the organizer's own account.
