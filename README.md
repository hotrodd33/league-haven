# ZVBL Roster Manager

A full-featured baseball league management application for the Zumbro Valley Baseball League. Manage organizations, teams, rosters, schedules, field calendars, live scoring, pitch tracking, umpire assignments, standings, weather forecasts, league fees, announcements, and more — all from a responsive dark-themed web interface.

## Features

### Organizations & Teams
- **Organizations** — Create and manage league orgs with logos (base64, 512KB limit), contact info, addresses, notes, and per-org officials toggle
- **Teams** — Structured naming (City + Color + Mascot) with auto-generated long names, abbreviations, and city abbreviations; primary/secondary UI colors; logo uploads; age group, level, and division classification
- **Field Locations** — Full-page field management with interactive Leaflet map, org-colored markers, age group filtering, GPS coordinate picker via map click, Google Maps directions, and inline field calendar access
- **Field Calendar** — Per-field monthly calendar/list view with color-coded event types (game holds, practices, events, maintenance); create/edit/delete reservations; auto-generated game hold blocks
- **Team Directory** — Collapsible org-grouped view of all teams and staff with contact actions and a printable HTML view

### Rosters & Staff
- **Players** — Full player profiles with DOB, grade (Pre K–12), batting hand (R/L/S), throwing hand (R/L), jersey/hat sizing (YXS–A3XL, fitted hat sizes), "needs new jersey" / "needs new hat" toggles, and parent contact info; multi-team support via junction table with per-team jersey numbers
- **Player Detail Page** — Tabbed player profile with Info (inline edit, team assignments), Contacts (full CRUD with relationship types), Stats (per-game stat display), Documents (upload birth certs, waivers — PNG/JPEG/GIF/WebP/PDF, 2MB limit), and Notes (timestamped, author-attributed)
- **Players Directory** — League-wide searchable player list with org/team filters, sortable columns (name, age, grade, B/T, team, org), and pitch rest status badges
- **Positions** — Many-to-many player ↔ position assignments
- **Coaches & Staff** — Standalone staff profiles (head coach, assistant coach, travel director) that can be assigned to multiple teams independently

### Scheduling & Field Reservations
- **Unified Scheduling** — Both the Game Schedule and Field Calendar support scheduling games, practices, events, and maintenance via an event type toggle
- **Game Schedule** — Create games with home/away teams, location, date/time, season, and notes; list and monthly calendar views; filter by team, season, status, date range
- **Field Conflict Detection** — Automatic checking for overlapping field reservations (including 3-hour prep windows) when scheduling games, with contact links to reservation owners
- **iCal Subscription** — Subscribe to game/practice schedules via webcal:// URL from any calendar app (Google, Apple, Outlook); filterable by team, season, location, org
- **Status Workflow** — `scheduled` → `in_progress` → `completed` / `cancelled` / `postponed`
- **Live Scoring** — In-game score entry with pitch count tracking per pitcher per inning
- **Game Change Notifications** — Automatic email and push notifications to staff when game date/time changes or games are cancelled/postponed
- **Standings** — Auto-calculated W/L/T standings with points system (W=3, T=2, L=1), win %, runs for/against; grouped by hierarchical division paths via recursive CTE

### Weather Integration
- **Game Weather Forecasts** — Automatic weather data from Open-Meteo for games within a 16-day window, displayed on game cards and scoreboards
- **Baseball Playability Scoring** — 0–100 rating (good/fair/poor/unplayable) based on rain probability, precipitation, thunderstorms, temperature extremes, wind gusts, and fog
- **Dashboard Weather Alerts** — Today's games with poor/unplayable conditions are flagged prominently
- **Caching** — 15-minute cache for current weather, 1-hour cache for forecasts

### Pitch Counting & Eligibility
- **Age-Based Pitch Rules** — Configurable daily limits and rest thresholds per age group (e.g., 9U–12U: 50/day, 13U–15U: 65/day); max 2 consecutive calendar days
- **Eligibility Checker** — Per-player availability status with reasons (available / resting / unavailable)
- **Live Pitch Tracker** — Real-time counter UI during games, tracking pitches, score, and innings
- **Pitcher Rest Dashboard** — Color-coded availability badges with recent history
- **Pitch Log** — Rolling 10-day view (7 past + 3 future) showing daily counts and rest requirements per pitcher

### Player Game Stats
- **Configurable Stat Definitions** — Admin-defined batting and pitching stat fields with abbreviations, data types, sort order, and GameChanger column mapping
- **Per-Game Stats** — Record and view player stats per game with upsert support
- **Stats Tab** — Viewable on the Player Detail page

### Officials & Umpires
- **Official Profiles** — Name, contact info, mailing address, Venmo ID, rate/game, DOB, certification status, years of experience, notes
- **Organization Scoping** — League-wide officials (visible everywhere) vs. org-specific officials
- **Age Group Eligibility** — Restrict officials to specific age groups with chip-style multi-select; per-age-group umpire rate and `ump_required` flag (e.g., 8U skips umpires)
- **Payment Tracking** — Per-game fee override or cascading rate hierarchy (game fee → age group rate → personal rate → $50 default); `is_paid` flag, no-show tracking, and total owed calculation
- **Listing Cards** — Stats chips showing $ owed, assigned games, interested games, completed games, and eligible age groups; filterable by scope and age group
- **Link to User Accounts** — Officials can be linked to umpire-role users for self-service
- **Umpire Dashboard** — Umpires see assigned games, interested games, and available (unassigned) games; express/remove interest; season filter; org-scoped umpires only see their org's games

### League Fees & Registration
- **Team Registration** — Track team registrations per season with fee assignment
- **Fee Management** — Per-team fee overrides or age-group default fees; payment recording with amount, method, check number, and notes
- **Bulk Registration** — Register multiple teams at once for a season
- **Financial Dashboard** — Summary stats: total fees, collected, outstanding; filter by season, age group, and payment status
- **Accountant Role** — Dedicated role with read access to financial data

### Announcements
- **Admin Announcements** — Create announcements with title, body, priority (low/normal/high/urgent), active toggle, and expiration date
- **Dashboard Display** — Active announcements shown prominently on the dashboard with priority-based styling and badges
- **Push Integration** — Announcements can trigger push notifications to subscribers

### GameChanger Import
- **Multi-Input Parsing** — Upload box score PDFs, paste text, or provide a URL
- **Box Score Import** — Batting stats, pitching stats, pitch counts, and final scores
- **Smart Matching** — Auto-matches teams via name, abbreviation, or saved aliases; auto-matches players by full name, jersey number, or partial formats
- **Manual Mapping** — UI for mapping unmatched teams and players before import
- **Column Mapping** — Flexible CSV column mapping for non-standard import formats
- **Preview & Confirm** — Review all parsed data with match status before committing
- **Import Wizard** — Step-by-step flow: upload → type → settings → team mapping → player mapping → preview → import → success

### Bulk Data Manager
- **CSV Export** — Download any entity as CSV: organizations, teams, players, staff, games, seasons, divisions, locations
- **CSV Import** — Bulk import with create/update modes; smart team name matching with `Team (Org)` disambiguation
- **Clear Data** — Bulk delete with preset groups ("All League Data", "Games Only", "Rosters Only") and FK-safe ordering

### Contact & Email
- **Scoped Email** — Send to an individual, team, organization, or entire league
- **Recipient Preview** — See who will receive the email before sending
- **BCC Privacy** — Multiple recipients are BCC'd
- **Branded Templates** — HTML emails with ZVBL header and sender info
- **Deduplication** — Recipients are deduplicated by email address
- **Automated Emails** — Welcome, invite (with temp password), password reset/changed, game schedule change notifications, email confirmation

### PWA & Push Notifications
- **Progressive Web App** — Installable from any browser; "Add to Home Screen" on mobile for native app feel
- **Service Worker** — Background push event handling, notification display even when app is closed
- **Push Subscriptions** — Users opt in via My Account page; subscriptions stored per-device
- **Granular Notification Preferences** — Individual toggles for schedule changes, cancellations, and announcements; test notification button
- **Schedule Change Alerts** — Automatic push when game date/time is updated
- **Cancellation/Postponement Alerts** — Automatic push when a game is cancelled or postponed
- **Admin Broadcast** — Admins can send push notifications to a team, org, or entire league
- **Fallback** — Works alongside email notifications; gracefully degrades if push not supported

### My Account
- **Profile Overview** — Avatar, name, username, email, role badge, member since, last login
- **Granular Notification Toggles** — Enable/disable push for schedule changes, cancellations, and announcements independently; test notification
- **Permissions Summary** — View your role and what it grants
- **My Organizations** — See orgs you manage
- **My Teams** — See teams you have access to with age group, level, and org name

### Auth & Permissions
- **6-tier role system** — `super_admin`, `org_admin`, `team_manager`, `score_reporter`, `accountant`, `umpire`
- **Multi-Role Self-Registration** — Step-by-step wizard for coaches, directors/org admins, scorekeepers, and umpires with role-specific flows
- **Email Confirmation** — Token-based email verification required before login; resend support
- **Password reset** — Secure token (SHA-256 hashed, 1-hour expiry) via email
- **Admin invite** — Generate temp password and send credentials via email
- **Granular permissions** — Org-level and team-level permission grants per user
- **Roster privacy** — Contact info restricted by role

### League Configuration
- **App Branding** — Configurable app name and logo
- **Scheduling Settings** — Game start/end time window, time increment (5–120 min)
- **Feature Toggles** — Enable/disable 9 features: Live Scoring, Pitch Tracking, Officials, Player Stats, Player Documents, Financials, Team Registration, Public Site, Push Notifications
- **Age Groups** — CRUD with sort order, umpire rate, league fee, and `ump_required` toggle
- **Levels** — CRUD (Recreational, Competitive, Elite, etc.) with sort order
- **Seasons** — CRUD with year, name, `is_active` flag (one active at a time)
- **Divisions** — Hierarchical tree structure with parent/child relationships, season scoping, breadcrumb paths ("10U AA / East")

### Dashboard
- Time-of-day greeting with user name and current season
- **Announcements** — Active announcements with priority-based styling and badges
- **Stat cards** — Total teams, games this week, games played, organizations (role-scoped)
- **Today's games** — Scoreboard widgets with team logos, colors, and live weather data
- **Weather alerts** — Games with poor/unplayable conditions flagged prominently
- **Pitch rest alerts** — Players currently on pitcher rest with return dates
- **Scores needed** — Past games still in "scheduled" status needing score entry
- **Upcoming games** — Next 5 games as scoreboards with weather forecasts
- **Quick actions** — Role-aware shortcuts (enter scores, schedule, manage teams, data manager, standings)
- **Season overview** — Game/team counts and season progress bar
- **Roster alerts** — Players missing DOB or jersey numbers
- **Recent activity** — Merged feed of player adds, game updates, new teams, registrations, and imports with timestamps
- **Recent results** — Last 5 completed games as scoreboard widgets

### Public Site
- Standalone public-facing pages (separate Vite/React app at `/site`, no login required):
  - **Standings** — Season standings with division filtering, win %, team logos
  - **Scores** — Game results and upcoming schedule with season/status filters
  - **Teams** — All teams grouped by organization with org filter
- Dynamic branding integration and responsive mobile layout

### In-App Help
- **Help Page** — Renders README and User Guide as styled markdown with tabbed navigation ("About" and "User Guide" tabs)

### WordPress Integration
- REST API plugin exposing SportsPress player meta fields (jersey number, DOB, batting/throwing hand)
- CORS support for cross-origin access from the roster manager

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, Tailwind CSS v4 |
| Backend | Node.js, Express 5 |
| Database | PostgreSQL (Neon) |
| Auth | JWT + bcryptjs |
| Email | SendGrid |
| Push | web-push (VAPID) + Service Worker |
| Maps | Leaflet + React-Leaflet |
| Weather | Open-Meteo API with baseball playability scoring |
| PDF Parsing | pdf-parse (GameChanger box scores) |
| Hosting | Vercel (auto-deploy from GitHub) |

## Project Structure

```
baseball-roster-app/
├── server/
│   ├── index.js              # Express entry point (Vercel serverless)
│   ├── db.js                 # Neon Postgres pool + auto-migration (38 tables)
│   ├── auth.js               # JWT middleware, role helpers
│   ├── email.js              # SendGrid email service + templates
│   ├── push.js               # Web Push notification service (VAPID)
│   ├── parsers/
│   │   └── boxscore-pdf.js   # GameChanger PDF box score parser
│   └── routes/
│       ├── auth.js           # Login, register, password reset, email confirmation
│       ├── teams.js          # Team CRUD + logo upload
│       ├── players.js        # Player CRUD + multi-team + jersey/hat sizing
│       ├── player-contacts.js # Player contact CRUD
│       ├── player-notes.js   # Player notes CRUD
│       ├── player-documents.js # Player document upload/download
│       ├── staff.js          # Staff CRUD + team role assignments
│       ├── organizations.js  # Org CRUD + directory
│       ├── locations.js      # Field locations + GPS
│       ├── reservations.js   # Field reservations (practices, events, maintenance)
│       ├── calendar.js       # iCal (.ics) feed for calendar subscriptions
│       ├── games.js          # Schedule, scoring, standings, pitch counts
│       ├── league-config.js  # Seasons, divisions, age groups, levels, branding, feature toggles
│       ├── pitch-rules.js    # Pitch count rest rules + eligibility
│       ├── stats.js          # Stat definitions + player game stats
│       ├── officials.js      # Official profiles, payments, age group eligibility
│       ├── umpires.js        # Umpire dashboard, interest, available games
│       ├── users.js          # User management, permissions, invites
│       ├── registrations.js  # Team season registrations + fee tracking
│       ├── contact.js        # Scoped email sending
│       ├── push.js           # Push subscription + admin broadcast
│       ├── announcements.js  # Announcement CRUD
│       ├── dashboard.js      # Dashboard activity feed
│       ├── weather.js        # Weather API proxy + playability scoring
│       ├── import.js         # GameChanger import wizard
│       ├── data-manager.js   # Bulk CSV import/export/clear
│       ├── positions.js      # Position lookup
│       └── seed.js           # Demo data seeder
├── src/
│   ├── App.jsx               # Main app with tab navigation + feature toggles
│   ├── api/index.js          # API client functions
│   ├── context/AuthContext.jsx
│   ├── hooks/
│   │   └── usePushNotifications.js  # Push subscribe/unsubscribe hook
│   └── components/           # React components
│       ├── Dashboard.jsx         # Home dashboard with weather, alerts, activity
│       ├── GameSchedule.jsx      # Unified schedule (games + practices + events)
│       ├── GameDetail.jsx        # Single game view + scoring + umpire assignments
│       ├── TeamSchedule.jsx      # Per-team schedule
│       ├── TeamSelector.jsx      # Team picker
│       ├── TeamPage.jsx          # Tabbed team view (schedule, roster, pitching)
│       ├── Standings.jsx         # Division standings
│       ├── PitchTracker.jsx      # Live pitch counter
│       ├── PitcherRest.jsx       # Pitcher rest dashboard
│       ├── PitchLog.jsx          # Rolling pitch log
│       ├── OfficialsManager.jsx  # Official listing + form
│       ├── OfficialDetail.jsx    # Official detail + payment tracking
│       ├── UmpireDashboard.jsx   # Umpire self-service portal
│       ├── OrgManager.jsx        # Organization management
│       ├── FieldsPage.jsx        # Full-page field map + calendar access
│       ├── FieldCalendar.jsx     # Per-field reservation calendar
│       ├── RosterList.jsx        # Team roster view
│       ├── PlayerForm.jsx        # Player add/edit form (with sizing)
│       ├── PlayerDetail.jsx      # Player profile (contacts, stats, docs, notes)
│       ├── PlayersPage.jsx       # League-wide player directory
│       ├── StaffList.jsx         # Staff management
│       ├── FieldLocations.jsx    # Field locations + map
│       ├── Directory.jsx         # Team directory + print
│       ├── LeagueConfig.jsx      # League settings + feature toggles
│       ├── LeagueFees.jsx        # Registration fees + payment tracking
│       ├── ManageAnnouncements.jsx # Announcement CRUD
│       ├── UserManager.jsx       # User + permission management
│       ├── DataManager.jsx       # Bulk import/export/clear
│       ├── ContactModal.jsx      # Email sending modal
│       ├── TeamRegistration.jsx  # Multi-role self-registration wizard
│       ├── Login.jsx             # Login + registration + email confirmation
│       ├── ConfirmEmail.jsx      # Email verification page
│       ├── ResetPassword.jsx     # Password reset flow
│       ├── ChangePassword.jsx    # Change password
│       ├── MyAccount.jsx         # Account profile + notification preferences
│       ├── HelpPage.jsx          # In-app README/guide viewer
│       ├── TeamLogo.jsx          # Logo display with color fallback
│       ├── import/               # GameChanger import wizard (10 components)
│       └── ui/                   # Design system (AppShell, Card, Modal, Scoreboard, etc.)
├── public-site/              # Standalone public pages (Scores, Standings, Teams)
├── wp-plugin/                # WordPress SportsPress integration plugin
├── api/index.js              # Vercel serverless adapter
├── vercel.json               # Vercel config
└── .env.example              # Environment variable template
```

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL database (or [Neon](https://neon.tech) account)
- SendGrid API key (optional, for emails)

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
DATABASE_URL=postgresql://...     # Neon connection string
JWT_SECRET=your-secret-key        # JWT signing key
SENDGRID_API_KEY=SG.xxx           # SendGrid API key (optional)
FROM_EMAIL=noreply@example.com    # Sender email address
APP_URL=http://localhost:5173     # App URL (for email links)
VAPID_PUBLIC_KEY=BPxxx...         # VAPID public key (generate with: npx web-push generate-vapid-keys)
VAPID_PRIVATE_KEY=xxx...          # VAPID private key
```

### Local Development

```bash
npm install
npm run dev:all    # Starts both Vite (5173) and Express (3001)
```

Or run separately:
```bash
npm run server     # Express API on port 3001
npm run dev        # Vite dev server on port 5173
```

### Production Build

```bash
npm run build      # Output to dist/ (portal + public site)
```

### Deployment

Deployed to Vercel with auto-deploys from the `main` branch. The Express server runs as a Vercel serverless function via `api/index.js`.

## Database

Tables are auto-created/migrated on first request via `server/db.js`. No manual migration step needed. The schema includes 38 tables:

| Table | Purpose |
|-------|---------|
| `users` | User accounts with roles, umpire flag, email confirmation |
| `user_permissions` | Org-level and team-level permission grants |
| `password_reset_tokens` | Secure password reset flow (SHA-256, 1hr expiry) |
| `organizations` | League member organizations with officials toggle |
| `teams` | Teams with name components, colors, logos |
| `players` | Player profiles (DOB, grade, handedness, jersey/hat sizing) |
| `team_players` | Player ↔ team junction with jersey number |
| `player_positions` | Player ↔ position junction |
| `player_contacts` | Player contacts with relationship types and primary flag |
| `player_notes` | Timestamped player notes with author |
| `player_documents` | Player document storage (birth certs, waivers — base64) |
| `player_game_stats` | Per-player, per-game stat values |
| `positions` | Position lookup (P, C, 1B, etc.) |
| `stat_definitions` | Admin-configurable stat fields (batting/pitching) |
| `staff_members` | Coach/staff profiles |
| `team_staff_assignments` | Staff ↔ team junction with role |
| `field_locations` | Playing fields with GPS coordinates |
| `field_reservations` | Field reservations (practices, events, maintenance) |
| `field_age_groups` | Field ↔ age group filtering |
| `games` | Game schedule with scores and status |
| `game_pitch_counts` | Per-player pitch counts per game |
| `game_import_log` | GameChanger import source tracking |
| `game_official_assignments` | Official ↔ game junction with fee/paid/no-show tracking |
| `officials` | Umpire/official profiles (rate, Venmo, cert, etc.) |
| `official_age_groups` | Official ↔ age group eligibility junction |
| `official_organizations` | Official ↔ org scoping |
| `umpire_game_interests` | Umpire expression of interest in games |
| `league_age_groups` | Age group config (umpire rate, league fee, ump_required) |
| `league_levels` | Level config (Rec, Competitive, etc.) |
| `league_seasons` | Season config with is_active flag |
| `league_divisions` | Hierarchical division tree with parent_id |
| `team_divisions` | Team ↔ division junction |
| `team_registrations` | Per-team season registrations with fee/payment tracking |
| `team_name_aliases` | External name → team mapping for imports |
| `app_branding` | App name, logo, scheduling settings, feature toggles |
| `push_subscriptions` | Push notification subscriptions per user/device |
| `announcements` | Admin announcements with priority and expiration |
