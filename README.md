# Pickleball Tournament Live

A mobile-first React / TypeScript tournament desk with a spectator scoreboard, manual referee scoring and confirmed-result playoff advancement. The app starts with an isolated El Nido practice tournament. The seven-division format from the event guide is available in the creation wizard.

## Test umpire scoring on a phone with GitHub Codespaces

1. Open this branch on GitHub. Choose **Code → Codespaces → Create codespace** on the demo branch. The development container starts the included preview automatically.
2. In the **Ports** panel, open the forwarded address for port **4173** on the computer. Leave **Live courts** visible.
3. Open that same HTTPS address on the phone and authenticate to GitHub as the Codespace owner when prompted. In the tournament app choose **Staff sign in → referee → Sign in**. Open **P5**, award one point and watch **Court 1** on the computer update. Tap **Undo last action** to return the practice score.
4. Stop the Codespace when finished. If you restart the preview manually, run `node preview.cjs` at the repository root. For a local test on one computer, use the instructions below.

The default private port is suitable for testing with your own GitHub account on both devices. Codespaces usage counts against the owner's allowance. Tournament test accounts are shared practice logins.

## Start the local demo

**Fastest preview** — with Node 22.12+ installed, open a terminal in the extracted folder and run:

```sh
node preview.cjs
```

Open http://127.0.0.1:4173 in your browser. This prebuilt demo needs no npm install or Firebase account. For source development with hot reload, run:

```sh
npm ci
npm ci --prefix functions
npm run dev
```

Open the local address Vite prints. Choose **Staff sign in**, choose a practice account, then **Sign in**. The buttons fill the email and password. Use admin@demo.test, referee@demo.test or referee2@demo.test with password Courtside26!. The demo server persists data in .demo-state.json. Restarting it ends demo login sessions. The demo server and these shared accounts are for local practice only.

For the fastest walkthrough open two browsers on the same demo server. Leave the first on Live courts. In the second, sign in as referee, open match P5 and tap +1. Court 1 updates in the spectator browser. Undo returns both to the previous score. A referee can only operate their assigned matches. Losing connectivity locks the scoring controls and preserves the last score on screen.

## Run a tournament

1. Sign in and select **Create tournament**. Enter the organizer, venue, date, timezone and comma-separated court names.
2. Choose a custom division or the seven-division El Nido preset. Custom defaults to eight teams and two pools. Edit placeholder names and register the actual players. Adjust the pool draw before scheduling.
3. From **Manage**, generate the schedule. Add divisions separately if needed. Under **Referee permissions**, grant the referee account UID access to this tournament. In **Schedule**, assign its UID to a match. Court and referee conflicts are checked across divisions.
4. Referees start a match, award or undo points, start subsequent games and review the winner before confirmation. Public scores and standings update automatically. A flagged forfeit, retirement or withdrawal goes to the desk for adjudication.
5. When every pool result is confirmed, generate playoffs. Resolve statistical ties in Manage by entering the ordered team IDs and reason. Confirming a semifinal advances its winner. The championship card names the champion.
6. Reopen an erroneous result, correct the game scores with a reason and confirm again. Check affected bracket matches and record the desk decision. Use QR codes for tournament or court access. TV mode provides large, dark court cards.

Pool schedules use sixteen half-hour slots per day from 09:00 local venue time, rolling over to 09:00 the next day. Manual slot edits control the day and time. Arrange breaks before broadcasting the schedule.

## El Nido event preset

The division rows govern the draw. They total 20 pools, 132 pool matches and 25 knockout matches, for 157 matches and 139 player slots. The printed guide summary gives inconsistent stage counts. The eight-team practice event is a separate dataset.

| Division | Pools | Qualifiers |
|---|---|---|
| Open Combined Singles | 4, 4, 4, 4, 5 | Five winners and three best runners-up |
| Novice Mixed Doubles | 4, 4, 4 | Three winners and one runner-up |
| Novice Men's, Beginner Mixed, Beginner Men's Doubles | 4, 4, 3 each | Three winners and one runner-up per division |
| Beginner Women's Doubles | 5, 4 | Top two per pool, crossed semifinals |
| Novice Women's Doubles | 5 | Top four |

Three-entry pools in the specified divisions play twice. Local ranking uses win percentage, points won percentage and eligible head-to-head results. Unresolved places require a recorded decision. Pool games and singles quarterfinals go to 15, win by two. Semifinals and finals use best of three to 11, win by two.

## Firebase development

Install a Java 21 JDK for Firestore. Use the demo project ID **demo-courtside**. To work against emulators, place the following in .env.local and restart Vite:

```ini
VITE_FIREBASE_PROJECT_ID=demo-courtside
VITE_FIREBASE_API_KEY=local-demo-key
VITE_FIREBASE_APP_ID=local-demo-app
VITE_FIREBASE_AUTH_DOMAIN=demo-courtside.firebaseapp.com
VITE_USE_EMULATORS=true
```

Run `npm run emulators` in one terminal and `npm run dev` in another. Use the setup script `node scripts/seed-emulators.mjs` while the emulators are running to create local Auth accounts and the practice event. Open /#live/demo/mixed. The script is limited to this local emulator project. Remove .env.local and restart to return to standalone demo mode.

### Production setup for the project owner

1. Create or select your Firebase project. Register a Web app and copy its web config into .env.local using .env.example. Set VITE_USE_EMULATORS=false.
2. Enable Email/Password in Firebase Authentication. Create a tournament organizer account and referee accounts. The account that creates a tournament becomes its administrator. Share the tournament URL directly with assigned staff for private events.
3. Create the default Cloud Firestore **Standard edition** database in Native mode. Choose the database location before creating it. Functions in this project use us-central1 by default. Select infrastructure locations and review costs before any deployment.
4. With your own approval for billing and deployment, select the intended project explicitly in the commands below. Cloud Functions deployment requires the Blaze plan. A build alone runs locally.
5. Sign in, create an event, grant each referee UID tournament access, assign matches, and test a point from a real mobile connection before opening registration.

```sh
npm run build
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes,functions,hosting --project YOUR_PROJECT_ID
```

[Firebase setup](https://firebase.google.com/docs/functions/get-started) · [Standard edition](https://firebase.google.com/docs/firestore/quickstart) · [Local emulators](https://firebase.google.com/docs/functions/local-emulator)

## Architecture

| Path | Responsibility |
|---|---|
| src/main.tsx and src/forms.tsx | Hash routes, public and staff screens, draw registration and multi-step setup |
| src/gateway.ts, src/remote.ts | Local SSE transport, Firebase email/password, onSnapshot subscriptions and callable commands |
| shared/model.ts, shared/engine.ts | Typed match lifecycle, game wins, best-of series, authorization, correction and advancement |
| shared/schedule.ts, shared/ranking.ts | Round robin, byes, seeded knockout tree, local and official tiebreak calculations |
| shared/seed.ts | Eight-team demo and seven guide divisions |
| shared/service.ts | Input validation and cross-division court allocation |
| functions/src/index.ts | Authenticated transactional commands, immutable audit and retry receipts |
| scripts/demo.ts | Local practice accounts, notifications and atomic file persistence |
| public/ | Installable manifest, icons and offline application shell |
| tests/, scripts/emulator-test.mjs | Vitest, Playwright and Firebase integration checks |

The Firestore schema uses one bounded event aggregate per division so a match and its advancement can commit atomically. Array-of-array game scores are serialized as JSON to preserve tuple order in Firestore.

| Document | Example contents |
|---|---|
| tournaments/demo | name, venue, date, timezone, organizer, courts, owner, visible, paused |
| tournaments/demo/staff/referee | role = referee. Account email and password are managed by Firebase Auth. |
| tournaments/demo/events/mixed | name and serialized Division state with teams, pool assignments, matches and bracket links |
| tournaments/demo/events/mixed/audit/{actor_request} | match, actor, before/after scores, reason, operation and commit timestamp |
| tournaments/demo/events/mixed/standings/current | published, revision and serialized pool tables |
| tournaments/demo/requests/{actor_request} | exact request and prior response for retry safety |

Browser writes are denied by default. Functions resolve staff membership from Firestore and require the match assignment for referee updates. Scoring checks the expected version, records the request ID and recalculates the derived result in the same transaction. The public can see scores and player names of visible events. Publication controls the standings display and derived standings document. Raw match scores remain visible. Staff audit documents are access controlled.

## Tests

```sh
npm test
npm run build
npx playwright install chromium
npm run e2e
npm run test:firebase
```

Set CHROMIUM_PATH to use an existing compatible Chromium binary. Playwright starts its own isolated demo server. The Firebase suite uses real Auth and Firestore emulators and callable endpoints. For containers that disallow the Functions emulator's local Unix socket, run the same HTTP endpoint tests through the included loopback-only test host:

```sh
GCLOUD_PROJECT=demo-courtside LOCAL_CALLABLE_TEST_HOST=1 npx firebase emulators:exec --only auth,firestore --project demo-courtside "node scripts/emulator-test.mjs"
```

## Operating limits

- Standard side-out scoring is manually officiated. The custom preset permits a one-point margin. The official preset implements supported 2026 match formats and ranking rules. Full sanctioning certification, service rotation, line calls and automatic incident rulings remain outside this release. [2026 official rules](https://usapickleball.org/docs/rules/USAP-Official-Rulebook.pdf?court=2026)
- This version targets small events. One transaction reads the tournament's divisions for court coordination. Before larger deployments, split live match documents from division configuration, scope audit queries by selected match, and load-test concurrent courts.
- The PWA shell supports offline viewing of an open scoreboard. Reconnect before submitting. A fresh offline launch may lack tournament data.
- Schedules are division-based. Entries have division-local IDs. Organizers should check individual players entered in multiple categories for conflicting personal commitments.
- Synthetic roster names, reproducible demo timestamps and projected playoff slots are practice data. Enter the real draw before using the event preset.

## Verification for this release

The client and Cloud Functions compiled. All 34 Vitest checks and three mobile-sized Chromium workflows passed. Browser checks cover a separate spectator session, offline lockout and reconnect, tournament creation and court assignment, result confirmation, administrator correction and audit history. Firebase integration checks passed against the Auth and Firestore emulators, including a spectator onSnapshot update, concurrent requests, retry deduplication, access revocation and re-derived standings. The hosted runner blocks the Functions emulator's Unix socket, so its callable HTTP handlers were exercised using the documented local TCP host. Production hosting and physical iPhone/Android installation were outside these checks.
