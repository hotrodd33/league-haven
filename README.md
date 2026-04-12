# ZVBL Roster Manager

A full-featured baseball league management application for the Zumbro Valley Baseball League. Manage organizations, teams, rosters, schedules, live scoring, pitch tracking, umpire assignments, standings, and more — all from a responsive dark-themed web interface.

## Features

### Organizations & Teams
- **Organizations** — Create and manage league orgs with logos (base64, 512KB limit), contact info, addresses, notes, and per-org officials toggle
- **Teams** — Structured naming (City + Color + Mascot) with auto-generated long names, abbreviations, and city abbreviations; primary/secondary UI colors; logo uploads; age group, level, and division classification
- **Field Locations** — Manage fields with address, GPS coordinates, interactive Leaflet maps, and Google Maps directions links
- **Team Directory** — Collapsible org-grouped view of all teams and staff with contact actions and a printable HTML view

### Rosters & Staff
- **Players** — Full player profiles with DOB, grade (K–9), batting hand (R/L/S), throwing hand (R/L), parent contact info; multi-team support via junction table with per-team jersey numbers
- **Positions** — Many-to-many player ↔ position assignments
- **Coaches & Staff** — Standalone staff profiles (head coach, assistant coach, travel director) that can be assigned to multiple teams independently

### Scheduling & Scoring
- **Game Schedule** — Create games with home/away teams, location, date/time, season, and notes; filter by team, season, status, date range
- **Status Workflow** — `scheduled` → `in_progress` → `completed` / `cancelled` / `postponed`
- **Live Scoring** — In-game score entry with pitch count tracking per pitcher per inning
- **Game Change Notifications** — Automatic email notifications to staff when game date/time changes
- **Standings** — Auto-calculated W/L/T standings with points system (W=3, T=2, L=1), win %, runs for/against; grouped by hierarchical division paths via recursive CTE

### Pitch Counting & Eligibility
- **Age-Based Pitch Rules** — Configurable daily limits and rest thresholds per age group (e.g., 9U–12U: 50/day, 13U–15U: 65/day); max 2 consecutive calendar days
- **Eligibility Checker** — Per-player availability status with reasons (available / resting / unavailable)
- **Live Pitch Tracker** — Real-time counter UI during games, tracking pitches, score, and innings
- **Pitcher Rest Dashboard** — Color-coded availability badges with recent history
- **Pitch Log** — Rolling 10-day view (7 past + 3 future) showing daily counts and rest requirements per pitcher

### Officials & Umpires
- **Official Profiles** — Name, contact info, mailing address, Venmo ID, rate/game, DOB, certification status, years of experience, notes
- **Scope System** — League-wide officials (visible everywhere) vs. org-specific officials
- **Age Group Eligibility** — Restrict officials to specific age groups with chip-style multi-select; per-age-group umpire rate and `ump_required` flag (e.g., 8U skips umpires)
- **Payment Tracking** — Per-game fee override or cascading rate hierarchy (game fee → age group rate → personal rate → $50 default); `is_paid` flag and total owed calculation
- **Listing Cards** — Stats chips showing $ owed, assigned games, interested games, completed games, and eligible age groups; filterable by scope and age group
- **Link to User Accounts** — Officials can be linked to umpire-role users for self-service
- **Umpire Dashboard** — Umpires see assigned games, interested games, and available (unassigned) games; express/remove interest; season filter; org-scoped umpires only see their org's games

### GameChanger Import
- **Multi-Input Parsing** — Upload box score PDFs, paste text, or provide a URL
- **Box Score Import** — Batting stats, pitching stats, pitch counts, and final scores
- **Smart Matching** — Auto-matches teams via name, abbreviation, or saved aliases; auto-matches players by full name, jersey number, or partial formats
- **Manual Mapping** — UI for mapping unmatched teams and players before import
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
- **Automated Emails** — Welcome, invite (with temp password), password reset/changed, game schedule change notifications

### Auth & Permissions
- **5-tier role system** — `super_admin`, `org_admin`, `team_manager`, `score_reporter`, `umpire`
- **Self-registration** — Creates score_reporter account; umpire self-registration creates umpire role + linked official profile
- **Password reset** — Secure token (SHA-256 hashed, 1-hour expiry) via email
- **Admin invite** — Generate temp password and send credentials via email
- **Granular permissions** — Org-level and team-level permission grants per user
- **Roster privacy** — Contact info restricted by role

### League Configuration
- **App Branding** — Configurable app name and logo
- **Scheduling Settings** — Game start/end time window, time increment (5–120 min)
- **Age Groups** — CRUD with sort order, umpire rate, and `ump_required` toggle
- **Levels** — CRUD (Recreational, Competitive, Elite, etc.) with sort order
- **Seasons** — CRUD with year, name, `is_active` flag (one active at a time)
- **Divisions** — Hierarchical tree structure with parent/child relationships, season scoping, breadcrumb paths ("10U AA / East")

### Public Site
- Standalone public-facing pages (separate Vite/React app, no login required):
  - **Standings** — Season standings with division filtering, win %, team logos
  - **Scores** — Game results and upcoming schedule with season/status filters
  - **Teams** — All teams grouped by organization with org filter

### Dashboard
- Time-of-day greeting with user name
- Stat cards: total teams, organizations, games this week, completed games
- Upcoming games (next 5) and recent results (last 5) with team logos and scores
- Quick action links to schedule, import, and data manager

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
| Maps | Leaflet + React-Leaflet |
| PDF Parsing | pdf-parse (GameChanger box scores) |
| Hosting | Vercel (auto-deploy from GitHub) |

## Project Structure

```
baseball-roster-app/
├── server/
│   ├── index.js              # Express entry point (Vercel serverless)
│   ├── db.js                 # Neon Postgres pool + auto-migration (27 tables)
│   ├── auth.js               # JWT middleware, role helpers
│   ├── email.js              # SendGrid email service + templates
│   ├── parsers/
│   │   └── boxscore-pdf.js   # GameChanger PDF box score parser
│   └── routes/
│       ├── auth.js           # Login, register, password reset
│       ├── teams.js          # Team CRUD + logo upload
│       ├── players.js        # Player CRUD + multi-team assignments
│       ├── staff.js          # Staff CRUD + team role assignments
│       ├── organizations.js  # Org CRUD + directory
│       ├── locations.js      # Field locations + GPS
│       ├── games.js          # Schedule, scoring, standings, pitch counts
│       ├── league-config.js  # Seasons, divisions, age groups, levels, branding
│       ├── pitch-rules.js    # Pitch count rest rules + eligibility
│       ├── officials.js      # Official profiles, payments, age group eligibility
│       ├── umpires.js        # Umpire dashboard, interest, available games
│       ├── users.js          # User management, permissions, invites
│       ├── contact.js        # Scoped email sending
│       ├── import.js         # GameChanger import wizard
│       ├── data-manager.js   # Bulk CSV import/export/clear
│       ├── positions.js      # Position lookup
│       └── seed.js           # Demo data seeder
├── src/
│   ├── App.jsx               # Main app with tab navigation
│   ├── api/index.js          # API client functions
│   ├── context/AuthContext.jsx
│   └── components/           # React components
│       ├── Dashboard.jsx         # Home dashboard with stats + upcoming games
│       ├── GameSchedule.jsx      # Schedule management + filters
│       ├── GameDetail.jsx        # Single game view + scoring
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
│       ├── RosterList.jsx        # Team roster view
│       ├── PlayerForm.jsx        # Player add/edit form
│       ├── StaffList.jsx         # Staff management
│       ├── FieldLocations.jsx    # Field locations + map
│       ├── Directory.jsx         # Team directory + print
│       ├── LeagueConfig.jsx      # League settings + config
│       ├── UserManager.jsx       # User + permission management
│       ├── DataManager.jsx       # Bulk import/export/clear
│       ├── ContactModal.jsx      # Email sending modal
│       ├── Login.jsx             # Login + registration
│       ├── ResetPassword.jsx     # Password reset flow
│       ├── ChangePassword.jsx    # Change password
│       ├── import/               # GameChanger import wizard (8 components)
│       └── ui/                   # Design system (AppShell, Card, Modal, etc.)
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
npm run build      # Output to dist/
```

### Deployment

Deployed to Vercel with auto-deploys from the `main` branch. The Express server runs as a Vercel serverless function via `api/index.js`.

## Database

Tables are auto-created/migrated on first request via `server/db.js`. No manual migration step needed. The schema includes 27 tables:

| Table | Purpose |
|-------|---------|
| `users` | User accounts with roles and umpire flag |
| `user_permissions` | Org-level and team-level permission grants |
| `password_reset_tokens` | Secure password reset flow (SHA-256, 1hr expiry) |
| `organizations` | League member organizations with officials toggle |
| `teams` | Teams with name components, colors, and logos |
| `players` | Player profiles (DOB, grade, handedness, contacts) |
| `team_players` | Player ↔ team junction with jersey number |
| `player_positions` | Player ↔ position junction |
| `positions` | Position lookup (P, C, 1B, etc.) |
| `staff_members` | Coach/staff profiles |
| `team_staff_assignments` | Staff ↔ team junction with role |
| `field_locations` | Playing fields with GPS coordinates |
| `games` | Game schedule with scores and status |
| `game_pitch_counts` | Per-player pitch counts per game |
| `game_import_log` | GameChanger import source tracking |
| `game_official_assignments` | Official ↔ game junction with fee/paid tracking |
| `officials` | Umpire/official profiles (rate, Venmo, cert, etc.) |
| `official_age_groups` | Official ↔ age group eligibility junction |
| `umpire_game_interests` | Umpire expression of interest in games |
| `league_age_groups` | Age group config with umpire rate and ump_required |
| `league_levels` | Level config (Rec, Competitive, etc.) |
| `league_seasons` | Season config with is_active flag |
| `league_divisions` | Hierarchical division tree with parent_id |
| `team_divisions` | Team ↔ division junction |
| `team_name_aliases` | External name → team mapping for imports |
| `team_staff` | Legacy staff table |
| `app_branding` | App name, logo, and scheduling settings |
