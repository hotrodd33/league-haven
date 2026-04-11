# ZVBL Roster Manager

A full-featured baseball league management application for the Zumbro Valley Baseball League. Manage organizations, teams, rosters, game schedules, standings, pitch counts, and more — all from a responsive web interface.

## Features

### Core
- **Organizations** — Create and manage league orgs with logos, contacts, and field locations
- **Teams** — Structured team names (City + Color + Mascot), auto-generated short names & abbreviations, logo uploads, age group / level classification
- **Rosters** — Assign players to teams with jersey numbers, batting/throwing hand, DOB, parent contact info
- **Coaches & Staff** — Head coach, assistant coach, travel director assignments per team
- **Field Locations** — Manage fields with address, GPS coordinates, and interactive Leaflet maps

### Scheduling & Scoring
- **Game Schedule** — Create games with home/away teams, location, date/time, season & division assignment
- **Live Scoring** — In-game score entry with pitch count tracking per pitcher per inning
- **Standings** — Auto-calculated W/L/T standings with points system, grouped by division
- **Pitch Log** — 7-day rolling pitch count tracker with configurable rest rules per age group

### League Administration
- **Seasons & Divisions** — Hierarchical division trees (e.g. 10U AA / East), season management
- **Age Groups & Levels** — Configurable league structure
- **Team Directory** — Collapsible org-grouped view of all teams and staff, printable

### Data Management
- **Bulk Import/Export** — CSV import/export for all entities (orgs, teams, players, staff, locations, seasons, divisions, games)
- **Team disambiguation** — Exports use `Team (Org)` format; imports accept both bare and qualified names
- **Clear Data** — Bulk delete with preset groups and FK-safe ordering

### Auth & Permissions
- **4-tier role system** — `super_admin`, `org_admin`, `team_manager`, `score_reporter`
- **Self-registration** with email verification
- **Password reset** via email (SendGrid)
- **Admin invite** with temporary password
- **Roster privacy** — contact info restricted by role

### Public Site
- Standalone public-facing pages for scores, standings, and team directory (no login required)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, Tailwind CSS v4 |
| Backend | Node.js, Express 5 |
| Database | PostgreSQL (Neon) |
| Auth | JWT + bcryptjs |
| Email | SendGrid |
| Maps | Leaflet + React-Leaflet |
| Hosting | Vercel (auto-deploy from GitHub) |

## Project Structure

```
baseball-roster-app/
├── server/
│   ├── index.js          # Express entry point (Vercel serverless)
│   ├── db.js             # Neon Postgres pool + auto-migration
│   ├── auth.js           # JWT middleware, role helpers
│   ├── email.js          # SendGrid email service
│   └── routes/           # API routes
│       ├── auth.js       # Login, register, password reset
│       ├── teams.js      # Team CRUD + logo upload
│       ├── players.js    # Player CRUD
│       ├── staff.js      # Staff CRUD + team assignments
│       ├── organizations.js
│       ├── locations.js  # Field locations
│       ├── games.js      # Schedule, scoring, standings
│       ├── league-config.js  # Seasons, divisions, age groups, levels
│       ├── pitch-rules.js    # Pitch count rest rules
│       ├── users.js      # User management + invites
│       ├── data-manager.js   # Bulk CSV import/export/clear
│       ├── positions.js
│       └── seed.js       # Demo data seeder
├── src/
│   ├── App.jsx           # Main app with tab navigation
│   ├── api/index.js      # API client functions
│   ├── context/AuthContext.jsx
│   └── components/       # 19 React components
├── public-site/          # Standalone public pages
│   └── src/components/   # Scores, Standings, Teams
├── api/index.js          # Vercel serverless adapter
├── vercel.json           # Vercel config
└── .env.example          # Environment variable template
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

Tables are auto-created/migrated on first request via `server/db.js`. No manual migration step needed. The schema includes 18 tables covering users, organizations, teams, players, staff, games, divisions, pitch counts, and more.
