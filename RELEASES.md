# LeagueHaven — Release Notes

All notable changes to LeagueHaven are documented here, newest first. Dates reflect the approximate merge date into `develop`.

---

## [Unreleased / develop]

---

## 2025-05-03 — Staging & Performance Release

### New Features
- **Staging Email Redirect** — League Config → Branding now has an "Email Redirect" field. When set, all outbound emails are sent to that address instead of real recipients (subject is prefixed with the original recipient). Useful for staging environments with real data.

### Performance
- **Org Stats endpoint** — Organizations page no longer fetches all games; a dedicated `/games/org-stats` aggregation endpoint returns only the counts needed (fixes OOM crash on Vercel for large leagues).
- **Server-side team filter on Schedule** — `My Teams` view now sends `?team_ids=` to the server instead of fetching all games and filtering client-side.
- **Optimistic cache patch on game save** — Game edits now instantly update the schedule list via `setQueriesData` before the background refetch, eliminating the 1–2s blank period.
- **Delete flash fix** — `refetchType: 'none'` on delete prevents deleted games from briefly reappearing in the list.

### Bug Fixes
- Pitch eligibility no longer throws 400 errors when `game_date` is null.
- Box score 404s are now silently ignored; the request is skipped entirely for games without a GameChanger import.

---

## 2025-04-30 — Chat, Guardians & Misc Improvements

### New Features
- **Team Chat** — Real-time in-app messaging with team channels, org channels, and direct messages. Unread badges, reply threading, message editing and deletion. Gated by the `feature_chat` toggle.
- **Guardian Portal** — New `guardian` role for parents. Self-registration flow, player claims with admin approval workflow, dedicated Guardian Home screen showing player schedule/roster/stats. Coaches can view the Guardians page scoped to their team. Stats visibility is configurable per team.
- **Box Score PDF improvements** — Better parsing and matching for GameChanger box score imports; stored full box score JSON in `game_box_scores` table for in-app viewing.
- **Push notification improvements** — More reliable subscription handling, better error recovery, UI polish.

---

## 2025-04-25 — Scheduling & Roster Improvements

### New Features
- **Practice Recurrence** — Practices and events can be created with daily, weekly, or bi-weekly recurrence. Practice creation is consolidated into the main GameForm (PracticeAddModal removed).
- **Clone Event** — Clone any existing practice or event from its action menu.
- **Game Duration** — Configurable duration per game/reservation (default 150 min). Field conflict detection now uses actual duration instead of a fixed 3-hour window.
- **Doubleheader Checkbox** — Mark a game as a doubleheader from the game form; away team fields appear in the location dropdown.
- **Home Game Green Border** — Team schedule highlights home games with a green left border for quick visual scanning.
- **Field/Weather on Team Schedule** — Field name and current weather are displayed on team schedule game cards.
- **Configurable League Timezone** — League Config → Branding now includes a timezone selector used for ICS calendar exports.

### Bug Fixes
- Calendar game titles now use the standardized `level + city abbr` format (e.g., "10U LC vs RW").
- Fixed ICS calendar exports using the wrong timezone.
- Fixed practice date headers showing "TBD" on the schedule page.

---

## 2025-04-23 — Game Delete, Data Manager, and Scheduling Contact

### New Features
- **Soft Delete & Restore for Games** — Games are soft-deleted (hidden, not destroyed); super admins can restore them.
- **Allow Game Deletion Toggle** — New feature toggle (`feature_game_delete`) gates non-super-admin game deletes; off by default.
- **Division Filter in Data Manager** — Game exports now support filtering by division. Teams are enforced to be globally unique.
- **Org-Level Scheduling Contact** — Any staff member can be flagged as the org's scheduling contact via a boolean checkbox in the Coaches tab. Priority on unscheduled game cards: Scheduling Contact → Head Coach → Org Admin.
- **Coaches Page** — Dedicated Coaches page for viewing all staff across teams; enhanced Guardians page.

### Bug Fixes
- Game deletes now reflect immediately across all schedule page views.
- Away team LATERAL join used wrong alias — fixed scheduling contact not appearing for away teams.
- Fixed portal modals/drawers being clipped by sticky stacking contexts.

---

## 2025-04-22 — Performance, Unscheduled Games, Travel Matrix

### New Features
- **Unscheduled Games** — Create games without a date/time; "Schedule It!" button and scheduling contact info on game cards.
- **Travel Distance Matrix** — Public site Travel tab with Haversine distance grid, trip planner, and color-coded proximity.
- **Driving Distance API Integration** — Optional API key for actual driving distances instead of straight-line.

### Performance
- Global query caching with `GAMES_TTL` across all major routes.
- Non-admins default to their own teams on the Schedule page (avoids full table scan).
- Organizations page load time reduced.
- Reduced Vercel Fast Origin Transfer usage.

---

## 2025-04-20 — PWA, Push Notifications, and Announcements

### New Features
- **Progressive Web App (PWA)** — Installable on iOS and Android from any browser.
- **Push Notifications** — VAPID-based push via service worker. Per-user granular preferences (schedule changes, cancellations, announcements). Admin broadcast to team/org/league.
- **Announcements** — Admin-created announcements with priority levels, active toggle, and expiration. Displayed on Dashboard with priority styling.
- **My Account page** — Profile overview, notification preference toggles, permissions summary, my orgs/teams.

---

## 2025-04-15 — Officials, Financials, and GameChanger Import

### New Features
- **Officials Management** — Full official profiles with certification, rates, Venmo, age group eligibility, and org scoping.
- **Umpire Dashboard** — Self-service portal for umpires to express interest and view assigned games.
- **Payment Tracking** — Per-game fee overrides, paid/no-show flags, financial summary.
- **League Fees & Registration** — Team season registration with fee assignment and payment recording.
- **Accountant Role** — Read-only financial access role.
- **GameChanger Import Wizard** — 7-step import flow: PDF/text/URL → team mapping → player mapping → preview → import. Imports scores, batting/pitching stats, and pitch counts.

---

## 2025-04-10 — Rosters, Pitch Tracking, and Scheduling

### New Features
- **Player Jersey & Hat Sizing** — YXS–A3XL jerseys, fitted hat sizes, "needs new" toggles.
- **Player Documents** — Upload birth certificates and waivers (PNG/JPEG/GIF/WebP/PDF, 2MB limit).
- **Player Notes** — Timestamped, author-attributed notes per player.
- **Pitch Tracking** — Age-based daily limits, consecutive-day rules, pitcher rest dashboard, rolling 10-day pitch log.
- **Live Scoring** — In-game score entry with pitch tracker.
- **Weather Integration** — Open-Meteo forecasts with baseball playability scoring on game cards.
- **iCal Calendar Subscriptions** — Subscribe to schedules via webcal:// URL.
- **Field Calendar** — Per-field monthly/list calendar with color-coded event types.
- **Standings** — Auto-calculated from game results, grouped by hierarchical division paths.

---

## 2025-04-01 — Foundation

### New Features
- **Organizations & Teams** — Structured team naming, logos, colors, org management.
- **Roster Management** — Full player profiles with DOB, positions, batting/throwing hand, multi-team support.
- **Staff Management** — Coach/staff profiles with team role assignments.
- **Field Locations** — Interactive Leaflet map with GPS coordinate picker and address geocoding.
- **Game Schedule** — List and calendar views, status workflow, game change notifications.
- **Auth System** — 6-tier role system, JWT auth, email confirmation, password reset, admin invite with first-login password change.
- **League Configuration** — Seasons, age groups, levels, divisions, branding, feature toggles.
- **Data Manager** — Bulk CSV import/export/clear.
- **Public Site** — Standalone public pages for standings, scores, and teams.
- **WordPress Plugin** — SportsPress integration for player meta fields.
