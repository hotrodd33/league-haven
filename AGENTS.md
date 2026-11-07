# AGENTS.md

Shared context for anyone changing LeagueHaven. Read this before editing. Stay inside the task. A drive-by refactor, formatting sweep, dependency upgrade, or schema tweak in an unrelated file is a bug.

LeagueHaven is a baseball league manager: organizations, teams, rosters, schedules, live scoring, pitch tracking, umpires, field prep, fees, chat, and a public site. The product name in the UI is LeagueHaven. The npm package is still `baseball-roster-app`. Do not rename either unless that is the task.

## Tech stack

| Layer | What it actually is |
|---|---|
| Portal UI | React 19, Vite 6, Tailwind CSS v4, TanStack Query v5. Entry: `src/main.jsx`, `src/App.jsx`. |
| Public site | A second Vite/React app in `public-site/`. No login, no TanStack Query. Built into `dist/site` and served at `/site`. |
| API | Node.js, Express 5, CommonJS. Entry: `server/index.js`. Vercel runs it through `api/index.js`. |
| Database | PostgreSQL on Neon, via `pg`. Not SQLite. |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs`. Bearer token. No sessions, no cookies. |
| Email | SendGrid (`@sendgrid/mail`) through `server/email.js` only. |
| Push | `web-push` (VAPID) + `public/sw.js`. |
| Chat | Pusher (`pusher` on the server, `pusher-js` in the portal). |
| Maps | Leaflet + React-Leaflet. Geocoding is OpenStreetMap Nominatim. |
| Weather | Open-Meteo, proxied by `server/routes/weather.js`. |
| PDF import | `unpdf` in `server/parsers/boxscore-pdf.js`. |
| Hosting | Vercel. `vercel.json` builds with `npm run build`, rewrites `/api/*` to the Express function, `/site/*` to the public app, and everything else to the portal SPA. |
| WordPress | `wp-plugin/zvbl-roster-api.php` is a separate SportsPress plugin. Leave it alone unless the task is about that plugin. |

Node 18+ is the documented floor. There is no `engines` field. Do not add one unless asked.

Local dev:

```bash
npm install
npm run dev:all    # Express on :3001 and Vite on :3000 (Vite proxies /api)
npm test
```

`npm run server` is the API alone. `npm run dev` is the portal alone. The public site is `cd public-site && npm run dev` (port 3002, also proxies `/api`).

## Dependencies

Root runtime dependencies and why they are here:

- `react`, `react-dom` — portal UI
- `@tanstack/react-query` — portal server state
- `express`, `cors`, `helmet`, `compression`, `dotenv` — API
- `pg`, `@vercel/functions` — Neon pool; `attachDatabasePool` closes sockets when a Vercel instance freezes
- `jsonwebtoken`, `bcryptjs` — auth
- `@sendgrid/mail` — email
- `web-push` — push
- `pusher`, `pusher-js` — chat
- `leaflet`, `react-leaflet` — field map
- `multer` — logo and document uploads (memory storage, not disk)
- `marked` — in-app help renders README and USER_GUIDE
- `unpdf` — GameChanger box-score PDFs
- `tailwindcss`, `@tailwindcss/vite` — styling

Root dev dependencies: `vite`, `@vitejs/plugin-react`, `concurrently`, and `@types/react` / `@types/react-dom` for the editor only. This repo is JavaScript, not TypeScript.

`public-site/package.json` is intentionally small: `react`, `react-dom`, Vite, and Tailwind. Do not add portal dependencies (Query, Leaflet, Pusher, auth libraries) to the public site.

Do not add a dependency for something the repo already does itself:

- class names: `src/lib/cn.js` (do not add `clsx` or `classnames`)
- routing: `src/hooks/useAppNavigation.js` (do not add React Router)
- HTTP: `src/api/index.js` (do not add axios)
- tests: `node:test` (do not add Jest, Vitest, or Playwright)
- ORM: parameterized `pg` queries (do not add Prisma, Drizzle, or Knex)

A new dependency needs a reason the existing stack cannot cover, and it belongs in the PR description.

## Architecture

Two frontends, one API, one database.

```
src/                  portal (authenticated)
public-site/src/      public pages (no auth)
server/index.js       mounts every /api router
server/db.js          pool + local auto-migration
server/auth.js        JWT and permission helpers
server/routes/*.js    one router per resource
server/migrations/    idempotent SQL run by hand against Neon
api/index.js          re-exports the Express app for Vercel
```

### Request path

`server/index.js` applies helmet (CSP disabled here; real CSP is in `vercel.json`), compression, CORS, a 10mb JSON/text body limit, and a default `Cache-Control: private, max-age=60, stale-while-revalidate=30` on GET. Then `ensureReady()` runs, then the routers. Public list endpoints override the cache header to `public, s-maxage=...` so the CDN can cache them. Authenticated responses stay private.

CORS allows same-origin requests plus `CORS_ORIGINS` (comma-separated). Local fallbacks are localhost ports 3000, 3001, 4173, and 5173. Do not open CORS to `*`.

### Database

`server/db.js` creates a `pg` Pool. On Vercel the pool max is 1, idle timeout is 5s, `allowExitOnIdle` is true, and `keepAlive` is false. Direct Neon hosts (no `-pooler` in the hostname) pin a backend and keep compute awake. Use the pooled connection string.

`data/roster.db`, `data/roster.db-shm`, and `data/roster.db-wal` are committed leftovers. Nothing in the app reads them. Do not query, edit, or commit changes to those files, and do not add new database binaries.

Schema changes have two homes, and both are required:

1. `server/db.js` `migrate()` — runs on local/dev requests. `ensureReady()` returns immediately when `NODE_ENV=production`, so production never applies this function.
2. A new idempotent file in `server/migrations/` (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Production databases are updated by running that SQL. `node server/migrations/run_indexes.js` can apply a file when `SQL_FILE` is set. Targets are `DATABASE_URL` (default), `DATABASE_URL_STAGE`, `DATABASE_URL_ZVBL`, and `DATABASE_URL_LCYSBA`.

Do not drop columns, rewrite history, or add a migration framework. Name files `add_<thing>.sql`. State in the PR which databases still need the script.

### Games

Statuses are exactly `unscheduled`, `scheduled`, `in_progress`, `completed`, `cancelled`, `postponed`. Games are soft-deleted with `games.deleted_at`. Every list, calendar, standings, dashboard, and umpire query filters `deleted_at IS NULL` unless it is the super-admin restore view. Do not `DELETE FROM games` for a user-facing delete.

`feature_game_delete` defaults to false. Non-super-admins cannot delete games while it is off. Super admins can restore.

`BASE_SELECT` in `server/routes/games.js` is the full game row (detail, edit). `SLIM_SELECT` is the list/public shape. The public site calls `/api/games?...&slim=true`. Do not add heavy joins to `SLIM_SELECT`, and do not remove fields the portal edit form reads back (`official_ids` is one of them).

Default game duration is 150 minutes (`app_branding.default_game_duration_minutes`). Conflict checks and ICS end times use the game's duration, not a fixed window. League timezone defaults to `America/Chicago` and is stored on `app_branding`. ICS export must use that timezone.

`game_date` is a `YYYY-MM-DD` date. Compare dates as dates. Do not coerce through a timezone-shifted `Date` when deciding "today" or "past."

### Auth and roles

Roles in active use: `super_admin`, `org_admin`, `team_manager`, `score_reporter`, `accountant`, `umpire`, `guardian`. `is_umpire` on the user is also treated as an umpire. Scope lives in `user_permissions` (`org_id` / `team_id`) plus approved `guardian_claims`.

Use the helpers in `server/auth.js`: `authMiddleware`, `optionalAuth`, `requireAdmin` (super admin only), `requireRole`, `getUserPermissions`, `canEditOrg`, `canEditTeam`, `canScoreGame`. A new mutating route needs one of these. Do not invent a parallel check in the handler.

The portal stores the session in `localStorage` under `zvbl_roster_auth`. Do not rename that key. `src/api/index.js` `apiFetch` attaches the bearer token, clears the key and reloads on 401 (except login/register/reset), and throws `Error` with `status` and `details`. Add new portal calls there. Add public-site calls in `public-site/src/api/index.js`, which sends no auth header.

Password rules live in `validatePassword`: 8+ characters, upper, lower, and a digit. Password-reset tokens are SHA-256 hashed with a 1-hour expiry.

### Privacy

Public routes (teams list, organizations, seasons, standings, games with `slim=true`, branding, travel, calendar ICS) are readable without a token. They must not return parent contacts, guardian contacts, staff private phone/email beyond what that endpoint already returns, documents, notes, payment amounts, Venmo IDs, or user records.

Guardian contact info is visible to coaches and admins, not to other guardians. Roster contact fields are role-restricted. Keep those filters when you add columns to a SELECT.

Emails go through `sendEmail` in `server/email.js`. It honors `app_branding.email_redirect` (staging sends everything to one address and prefixes the subject). Multi-recipient mail is BCC. Do not call SendGrid from a route.

### Feature flags

Flags live on the single `app_branding` row (`id = 1`) and are returned by `/api/league-config/branding`. The portal reads them in `src/hooks/useBranding.js` (`DEFAULT_FEATURES`). `FeatureRouter` and the sidebar hide disabled features.

Current flags: `feature_live_scoring`, `feature_pitch_tracking`, `feature_officials`, `feature_stats`, `feature_documents`, `feature_financials`, `feature_registration`, `feature_public_site`, `feature_push_notifications`, `feature_game_delete` (default false), `feature_chat`, `feature_field_prep`.

A new user-facing feature that leagues may turn off needs a `feature_*` boolean, a league-config field, a `DEFAULT_FEATURES` entry, and a gate in the router/sidebar. Default it on only when the feature is safe to expose to every league. `feature_game_delete` stays off.

### Caching and Neon

`server/cache.js` is an in-memory TTL map on one instance. It is not shared across Vercel isolates. Bust it on writes (`cache.del` / `invalidatePrefix`). Do not store user-specific data in a global key.

Portal queries use TanStack Query. Defaults in `src/main.jsx`: `staleTime` 60s, `retry` 1, `refetchOnWindowFocus: false`. Per-query times come from `STALE` in `src/lib/queryConfig.js`. Do not turn focus-refetch back on. Do not add polling on a hidden or idle tab. `useTabActive` exists for that. After a mutation, patch the cache with `setQueriesData` or invalidate the existing query key. Reuse the key the screen already uses (`['branding']`, `['player', id]`, and the games keys). Do not create a second key for the same data.

Do not add timers, crons, or background jobs that query Neon. The scoring-claim sweep is opt-in behind `ENABLE_SCORER_SWEEP_CRON` and `CRON_SECRET` because a warm cron keeps compute from suspending. Client polling follows the same rule: only while the tab is active, and only for data that is already polled.

### Portal UI

Navigation is the History API in `useAppNavigation`: `/`, `/:page`, `/rosters/:id`, `/schedule/:id`, `/players/:id`. New pages are a `case` in `src/components/FeatureRouter.jsx` plus a sidebar entry. Do not add a router library. Each page is wrapped in `ErrorBoundary`.

Design system barrel: `src/components/ui` (`Button`, `Card`, `Input`, `Select`, `Badge`, `Modal`, `Drawer`, `Table`, `Scoreboard`, and the rest). Use it before inventing a new button or modal. Variants are `primary`, `secondary`, `ghost`, `danger`, `warn`, `chrome`. Legacy names `dirt`, `navy`, `field`, and `strike` are aliases. Keep them working.

Tokens live in `src/App.css` under `@theme` (`action`, `chrome`, `accent`, `signal`, `sport`, plus the legacy `field` / `blue` / `dirt` aliases). Composites that are not utilities live in `src/leaguehaven.css`. The app is dark (`theme_color` `#1b2a4a`). Do not introduce a light theme or a second palette.

Logos are base64 data URLs (512KB multer limit). Player documents are base64 (PNG/JPEG/GIF/WebP/PDF, 2MB). Do not move them to object storage unless asked.

Chat keeps one Pusher client for the session (`getPusherClient` in `src/components/Chat.jsx`). Do not construct `new Pusher()` inside a component render or effect that remounts per channel.

### Public site

`public-site` is a separate app with `base: '/site/'` and `outDir: '../dist/site'`. The root `npm run build` builds the portal, then installs and builds the public site. If you change an API response the public site reads (teams, orgs, seasons, divisions, standings, games, branding, travel, a single game, pitch counts), update `public-site/src/api/index.js` and the screen that renders it in the same change.

`public-site/vercel.json` is a standalone deploy that proxies `/api` to `https://portal.zvbl.org`. The embedded site must remain frameable by `https://zvbl.org` and `https://www.zvbl.org`. Do not tighten `frame-ancestors` in a way that breaks that embed, and do not loosen the portal CSP.

### Environment

From `.env.example` and the code. Never commit values, and never log them.

| Name | Role |
|---|---|
| `DATABASE_URL` | Pooled Neon URL for this app |
| `DATABASE_URL_STAGE`, `DATABASE_URL_ZVBL`, `DATABASE_URL_LCYSBA` | Other leagues the migration scripts can target |
| `JWT_SECRET` | Required on Vercel. Local dev falls back to an insecure default and warns. |
| `PORT` | API port, default 3001 |
| `SENDGRID_API_KEY`, `FROM_EMAIL`, `APP_URL` | Mail |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Push |
| `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER` | Server chat |
| `VITE_PUSHER_KEY`, `VITE_PUSHER_CLUSTER` | Browser chat |
| `CORS_ORIGINS` | Extra allowed origins |
| `DISCORD_WEBHOOK_URL` | Bug reports |
| `ENABLE_SCORER_SWEEP_CRON`, `CRON_SECRET` | Optional scoring-lock sweep |
| `IMPORT_DEBUG` | Verbose import logs when `true` |

`driving_distance_api_key` is a column on `app_branding`, not an env var. Travel defaults to Haversine miles.

## Code style

Match the file you are editing. Do not reformat a file you are not otherwise changing.

- JavaScript and JSX only. Do not rename files to `.ts` or `.tsx`. Do not add TypeScript, ESLint, or Prettier config.
- Server code is CommonJS (`require`, `module.exports`). The root `package.json` has no `"type": "module"`. Portal and public-site code are ESM. Do not mix the two inside one file.
- Semicolons are used. Prefer single quotes. `src/App.jsx` is an older double-quote, 4-space file; leave its style alone when you touch it.
- New files use 2-space indent. UI components that export one component use `export default`. Multi-piece modules (`Card`, `Table`) use named exports and are re-exported from `src/components/ui/index.js`.
- Imports stay at the top of the file.
- Route handlers are `async (req, res)` wrapped in `try/catch`. On failure, `console.error(err)` and `res.status(500).json({ error: 'Internal server error' })`. Validation is 400 `{ error }`. Permission failure is 403 `{ error }`. Missing auth is 401. Do not put SQL or stack traces in the JSON body.
- SQL uses `$1` placeholders. Never concatenate request input into a query string. `ANY($1)` for id lists.
- Section banners (`// ── Teams ──`) are the local comment style in large files. Do not add comments that restate the code.
- User-facing copy stays consistent with `README.md` and `USER_GUIDE.md`: Scheduling Contact, Guardian Home, Schedule It!, age groups like `10U`, roles by their existing labels.
- A `switch` on a role, status, or feature flag should handle every known value. Do not add a new status string without updating `VALID_STATUSES`, labels, and `src/constants/statusClasses.js`.

## Testing requirements

`npm test` runs Node's built-in test runner:

```json
"test": "node --test server/routes/calendar-ics.test.js"
```

That is the only automated test. It uses `node:test` and `node:assert/strict`. The test file sits next to `server/routes/calendar-ics.js` and exercises pure functions with no database, network, or env secrets.

When you change behavior:

- Run `npm test` before you finish. If you changed `calendar-ics.js`, those tests must pass.
- New pure logic (date formatting, eligibility, name matching, ICS, CSV mapping, permission predicates that do not need a pool) gets a colocated `*.test.js` written the same way. Add the file to the `test` script so `npm test` runs it. A test file that the script does not invoke does not count.
- Tests must not connect to Neon, SendGrid, Pusher, or the network, and must not read `.env`.
- Do not add Jest, Vitest, Testing Library, Playwright, or a CI test workflow unless asked.
- There is no lint script. Do not add one as a side effect.

UI and API changes also need a manual check of the path you touched:

- Portal: sign-in gate, the role that should see the change, and a role that should not.
- Empty, error, and permission-denied states, not only the happy path.
- If the data is shared, check the public site screen that reads it.
- Schedule and game edits: confirm a soft-deleted game stays hidden, and that saving a game does not wipe umpire or prep assignments.
- Schema changes: say which of default, stage, zvbl, and lcysba still need the SQL file. Do not run those scripts against a live database unless the task says to.

## PR standards

Recent history is the standard. Subjects look like `fix(games): preserve umpire assignments when editing` or `feat: unified payments report`. Imperative mood, the area in parentheses when it fits, and the user-visible effect in the summary. Merge commits from `develop` into `main` are how releases have landed. Vercel auto-deploys `main`. Do not push to `main`, force-push, or retarget a PR onto a release branch unless asked.

One concern per PR. Leave unrelated cleanup for another change.

PR description:

- What changed and why.
- How to verify it (`npm test`, plus the clicks or API calls that show the fix).
- Schema: the new SQL file, and which databases still need it.
- Feature flags, auth, public-response shape, caching, or Neon-wakeup impact. Say "none" when none apply.
- User-visible changes get an entry under `## [Unreleased / develop]` in `RELEASES.md`, in the same shape as the existing notes (New Features, Bug Fixes, Performance).
- Update `README.md` only when setup, structure, or documented behavior changed. Do not rewrite it.

Do not commit `.env`, `node_modules`, `dist`, or edits to `data/roster.db*`. `.github/workflows/sync-to-ado.yml` mirrors every push to Azure DevOps. There is no other CI gate, so `npm test` is the check that has to be green locally.

Before submitting, confirm the diff does not:

- Change a public endpoint's JSON shape without updating `public-site`.
- Drop `deleted_at IS NULL` from a game query.
- Send email except through `server/email.js`.
- Add a timer or cron that queries Neon.
- Widen CORS or the portal CSP, or remove `frame-ancestors` for `zvbl.org` on `/site`.
- Rename `zvbl_roster_auth`, role strings, or game statuses.
- Upgrade or add dependencies for style or preference.
- Reformat untouched files.

## Out of scope unless the task says so

`wp-plugin/`, `USER_GUIDE.md` tone rewrites, the design-token rename from legacy `field`/`dirt`/`blue` names, splitting `server/routes/games.js`, replacing base64 uploads, and deleting the unused SQLite files. Those are real follow-ups. They are not part of an unrelated fix.
