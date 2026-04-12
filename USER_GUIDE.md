# ZVBL Roster Manager — User Guide

A step-by-step guide to managing your league with the ZVBL Roster Manager. This guide covers every feature of the application organized by workflow.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard](#dashboard)
3. [Organizations](#organizations)
4. [Teams](#teams)
5. [Rosters & Players](#rosters--players)
6. [Coaches & Staff](#coaches--staff)
7. [Field Locations](#field-locations)
8. [Seasons & Divisions](#seasons--divisions)
9. [Game Schedule](#game-schedule)
10. [Live Scoring & Pitch Tracking](#live-scoring--pitch-tracking)
11. [Pitch Count Rules & Rest](#pitch-count-rules--rest)
12. [Standings](#standings)
13. [Directory & Contact](#directory--contact)
14. [Officials & Umpires](#officials--umpires)
15. [Umpire Dashboard (Self-Service)](#umpire-dashboard)
16. [GameChanger Import](#gamechanger-import)
17. [Data Manager (Bulk Operations)](#data-manager)
18. [User Management & Permissions](#user-management--permissions)
19. [League Configuration](#league-configuration)
20. [Public Site](#public-site)
21. [Account Settings](#account-settings)

---

## Getting Started

### Creating Your Account

1. Navigate to the app login page
2. Click **Register** to create a new account
3. Fill in your username, full name, email, and password (8+ characters, must include uppercase, lowercase, and a number)
4. Your account will be created with **Score Reporter** access by default
5. A league administrator can upgrade your role and assign you to specific teams/organizations

### Registering as an Umpire

1. On the login page, click **Register as Umpire**
2. Fill in your name, email, phone, date of birth, and umpire details (certification status, years of experience)
3. Select the organization you umpire for
4. An official profile will be created and linked to your user account automatically

### Logging In

1. Enter your username and password
2. Click **Sign In**
3. You'll be taken to the Dashboard

### Forgot Password

1. Click **Forgot Password** on the login page
2. Enter your email address
3. Check your email for a reset link (valid for 1 hour)
4. Click the link and set a new password

---

## Dashboard

The Dashboard is your home screen. It displays:

- **Greeting** with your name and the current season
- **Stat cards** — total teams, games this week, games played, and organization count
- **Upcoming games** — next 5 games with team logos, dates, times, and locations
- **Quick actions** — shortcuts to schedule a game, manage teams, import from GameChanger, and view standings
- **Season overview** — progress bar showing completed vs. total games
- **Recent results** — last 5 completed games with final scores

---

## Organizations

### Creating an Organization

1. Go to **Organizations** from the sidebar
2. Click the **+ New Organization** button
3. Fill in the organization name (required), abbreviation, and contact details
4. Optionally upload a logo (max 512KB, will be displayed throughout the app)
5. Add address, phone, email, website, and notes as needed
6. Click **Save**

### Managing Organizations

- Click any organization card to expand it and see its teams
- Use the **Edit** button (pencil icon) to update organization details
- Use the **Delete** button to remove an organization (this will not delete its teams)

---

## Teams

### Creating a Team

1. Go to **Teams** from the sidebar
2. In the left panel, click **+ New Team**
3. Fill in the required fields:
   - **Org** — select the parent organization
   - **City** — team city name (e.g., "Rochester")
   - **Color** — team color (e.g., "Red")
   - **Mascot** — team mascot (e.g., "Hawks")
4. The full name is auto-generated from City + Color + Mascot
5. Optionally set:
   - **Age Group** (8U, 9U, 10U, etc.)
   - **Level** (Recreational, Competitive, Elite, etc.)
   - **Division** — the hierarchical division the team plays in
   - **Primary/Secondary Colors** for UI display
6. Click **Save**

### Team Page Tabs

Each team has 5 tabs:

| Tab | What it shows |
|-----|--------------|
| **Overview** | Team info, recent games, staff contacts |
| **Schedule** | Team-specific game schedule |
| **Pitching** | Pitcher rest status and pitch log |
| **Roster** | Player list with add/edit/remove |
| **Coaches** | Staff assignments |

---

## Rosters & Players

### Adding a Player

1. Navigate to a team's **Roster** tab
2. Click **+ Add Player**
3. Fill in the player form:
   - **First Name** and **Last Name** (required)
   - **Jersey Number** — specific to this team
   - **Date of Birth** and **Grade** (K through 9)
   - **Batting Hand** (Right / Left / Switch) and **Throwing Hand** (Right / Left)
   - **Positions** — select multiple positions from the dropdown
   - **Parent Contact** — name, email, and phone
4. Click **Save**

### Bulk Roster Import (Paste)

1. On the Roster tab, click **Paste Roster**
2. Paste a list in the format: `FirstName LastName, #Jersey` (one per line)
3. Players will be created and added to the team

### Multi-Team Players

Players can belong to multiple teams. When adding a player who already exists (matched by name), they'll be linked to the additional team with a separate jersey number.

### Editing & Removing Players

- Click the **Edit** button on any player card to update their info
- Click **Remove** to remove them from the team (the player record is preserved if they're on other teams)

---

## Coaches & Staff

### Adding Staff

1. Navigate to a team's **Coaches** tab
2. Click **+ Add Staff**
3. Fill in their name, role (Head Coach, Assistant Coach, Travel Director), email, and phone
4. Click **Save**

### Staff Roles

- **Head Coach** — primary team contact
- **Assistant Coach** — additional coaching staff
- **Travel Director** — handles team logistics

Staff members can be assigned to multiple teams.

---

## Field Locations

### Adding a Field

1. Go to **Organizations**, then click **Field Locations** within an org
2. Click **+ New Location**
3. Enter the field name, address, city, state, and zip
4. Optionally add GPS coordinates (latitude/longitude) for map display
5. Click **Save**

### Using Maps

- Fields with GPS coordinates show an interactive **Leaflet map** on their detail view
- Click the **Directions** button to open Google Maps navigation to the field

---

## Seasons & Divisions

### Creating a Season

1. Go to **League Config** → **Seasons** tab (admin only)
2. Click **+ Add Season**
3. Enter the season year and name (e.g., "2026 Spring")
4. Toggle **Active** to make it the current season (only one can be active)
5. Click **Save**

### Creating Divisions

1. Go to **League Config** → **Divisions** tab
2. Click **+ Add Division**
3. Enter the division name and select a parent division (for hierarchy)
4. Select the season this division belongs to
5. Divisions support a tree structure (e.g., "10U" → "10U AA" → "10U AA East")

---

## Game Schedule

### Scheduling a Game

1. Go to **Schedule** from the sidebar
2. Click **+ New Game**
3. Fill in:
   - **Home Team** and **Away Team**
   - **Date** and **Time**
   - **Location** (field)
   - **Season** (auto-selects current)
   - **Notes** (optional)
4. Click **Save**

### Filtering Games

Use the filter bar at the top to narrow games by:
- **Team** — show only one team's games
- **Season** — switch between seasons
- **Status** — Scheduled, In Progress, Completed, Cancelled, Postponed
- **Date Range** — filter to a specific window

### Game Status Workflow

Games follow this lifecycle:

```
Scheduled → In Progress → Completed
                        → Cancelled
                        → Postponed
```

### Editing a Game

- Click a game card to open game details
- Click **Edit** to change date, time, location, or teams
- **When the date or time changes**, staff for both teams automatically receive an email notification

### Umpire Assignments

From the game detail view, you can:
- See which umpires are assigned
- See which umpires have expressed interest
- Assign or remove umpires from the game

---

## Live Scoring & Pitch Tracking

### Entering Scores

1. Open a game from the schedule
2. Click **Start Game** to move it to "In Progress"
3. Enter the score for each team as the game progresses
4. When done, click **Final** to complete the game

### Pitch Tracker

1. During an in-progress game, click **Pitch Tracker**
2. The tracker shows:
   - Current inning and score
   - Active pitcher for each team
   - Running pitch count
3. Tap the **+** button each time a pitch is thrown
4. Switch pitchers or advance innings as the game progresses
5. Pitch counts are saved automatically and feed into the rest rules system

---

## Pitch Count Rules & Rest

### How Pitch Rules Work

The league sets age-based pitch limits in **League Config → Age Groups**. Example defaults:

| Age Group | Daily Limit | Rest After |
|-----------|-------------|------------|
| 9U–12U | 50 pitches | Thresholds vary |
| 13U–15U | 65 pitches | Thresholds vary |

- Pitchers cannot throw more than 2 consecutive calendar days
- Rest days are calculated automatically based on pitch counts

### Viewing Pitcher Status

1. Navigate to a team's **Pitching** tab
2. **Pitcher Rest** shows each pitcher's status:
   - 🟢 **Available** — can pitch today
   - 🟡 **Resting** — must rest (shows when they'll be available)
   - 🔴 **Unavailable** — at their limit
3. **Pitch Log** shows a rolling 10-day view (7 past + 3 future) with daily counts per pitcher

---

## Standings

### Viewing Standings

1. Go to **Standings** from the sidebar
2. Select a **Season** and optionally a **Division**
3. The standings table shows:
   - Team name and logo
   - Wins, Losses, Ties
   - Points (W=3, T=2, L=1)
   - Win percentage
   - Runs For / Runs Against

Standings are calculated automatically from completed game results.

---

## Directory & Contact

### Team Directory

1. Go to **Directory** from the sidebar
2. All teams are listed grouped by organization
3. Expand any org to see its teams and staff contacts
4. Contact info shows email and phone with clickable action links

### Printing the Directory

Click the **Print** button to open a formatted, printer-friendly version of the entire directory.

### Sending Emails

1. Click the **Email** icon on any contact, team, or organization
2. The Contact Modal opens with:
   - **Scope** — Individual, Team, Organization, or League-wide
   - **Recipients** — preview who will receive the email
   - **Subject** and **Message** fields
3. Multiple recipients are BCC'd for privacy
4. Emails use a branded HTML template with the ZVBL header

---

## Officials & Umpires

### Managing Officials (Admin/Accountant)

1. Go to **Officials** from the sidebar
2. The listing shows all officials with stat chips:
   - **$ Owed** — money due for completed unpaid games
   - **Assigned** — number of upcoming assigned games
   - **Interested** — games they've expressed interest in
   - **Completed** — finished games
   - **Age Groups** — which age groups they can umpire
3. Click **+ New Official** to add an official profile
4. Fill in: name, email, phone, Venmo ID, rate per game, DOB, certification, experience, notes
5. Select age group eligibility (which levels they can umpire)

### Official Detail Page

Click an official to see their detail page with:

- **Profile card** — all contact info, rate, certification status
- **Financial summary** — total earnings, payments, and amount due
- **Three tabs:**
  - **Upcoming** — games assigned but not yet played; you can click "✕ Remove" to unassign
  - **Completed** — finished games with Fee, Paid, and No Show checkboxes
  - **Interested** — games they want to ump; click **Assign** to assign them

### Payment Tracking

- Click the **Fee** amount on any game to edit the per-game rate
- Check **Paid** to mark a game as paid
- Check **No Show** if the umpire didn't show up — the fee will display as ~~strikethrough~~ in red and won't count toward earnings/payments

### Fee Hierarchy

Fees are calculated in this priority order:
1. **Game fee override** — per-game custom amount
2. **Official's personal rate** — their default rate per game
3. **Age group rate** — the rate set on the age group in League Config
4. **$50 default** — fallback if nothing else is set

---

## Umpire Dashboard

For users with the **Umpire** role, the dashboard shows their personal umpire portal.

### Profile

Your profile card shows your name, age, certification status, years of experience, and contact info.

### Game Tabs

| Tab | Description |
|-----|-------------|
| **Completed** | Games you've umpired with scores and dates |
| **Assigned** | Upcoming games you're assigned to |
| **Interested** | Games you've expressed interest in but aren't assigned to yet |
| **Available** | Games that need umpires — click **Interested** to express interest |

### Expressing Interest

1. Go to the **Available** tab
2. Browse upcoming games that need umpires
3. Click the **Interested** button on any game
4. The game moves to your **Interested** tab
5. A league admin will review and assign you from the Officials page

### Season Filter

Use the season dropdown to filter games by season.

---

## GameChanger Import

### Starting an Import

1. Click **Import from GameChanger** from the Dashboard or the Data Manager
2. Choose the import type: **Box Score**

### Import Steps

1. **Upload** — Upload a GameChanger PDF, paste box score text, or provide a URL
2. **Team Mapping** — The system auto-matches teams by name, abbreviation, or saved alias. Manually map any unmatched teams
3. **Player Mapping** — Players are auto-matched by full name, jersey number, or partial formats. Map any unmatched players
4. **Preview** — Review all parsed data (batting stats, pitching stats, pitch counts, scores)
5. **Import** — Confirm to import the data
6. **Success** — See a summary of what was imported

### What Gets Imported

- Final score (home and away)
- Batting statistics per player
- Pitching statistics per player
- Pitch counts per pitcher (feeds into rest calculations)

---

## Data Manager

### Exporting Data (CSV)

1. Go to **Data Manager** → **Export** tab (admin only)
2. Choose an entity: Organizations, Teams, Players, Staff, Games, Seasons, Divisions, Locations
3. Click **Download CSV**

### Importing Data (CSV)

1. Go to **Data Manager** → **Import** tab
2. Choose the entity to import
3. Upload a CSV file (must match the expected column format)
4. Choose **Create** mode (add new) or **Update** mode (update existing)
5. For teams, use the format `Team Name (Org Name)` to disambiguate

### Clearing Data

1. Go to **Data Manager** → **Clear** tab
2. Choose a preset group:
   - **All League Data** — wipes everything
   - **Games Only** — removes games but keeps teams and rosters
   - **Rosters Only** — removes players and staff
3. Confirm to delete (this cannot be undone)

---

## User Management & Permissions

### Roles

| Role | Access Level |
|------|-------------|
| **Super Admin** | Full access to everything |
| **Accountant** | Officials page with full payment management |
| **Org Admin** | Manage their organization's teams, games, and officials |
| **Team Manager** | Manage their assigned teams |
| **Score Reporter** | Enter scores for their assigned teams |
| **Umpire** | Umpire dashboard with interest/availability |

### Creating a User

1. Go to **Users** from the sidebar (admin only)
2. Click **+ New User**
3. Fill in username, full name, email, password, and role
4. Optionally check **Is Umpire** to give them umpire dashboard access regardless of role
5. Click **Save**

### Assigning Permissions

1. Edit a user from the Users page
2. Under **Permissions**, assign:
   - **Organization access** — allows managing all teams in that org
   - **Team access** — allows managing specific teams
3. Permissions control what teams/orgs the user can view and edit

### Inviting a User

1. Click the **Invite** button on a user
2. A temporary password is generated
3. The user receives an email with their login credentials
4. They can change their password after logging in

---

## League Configuration

Available under **League Config** in the sidebar (admin only).

### Branding

- Set the **App Name** displayed in the sidebar and emails
- Upload a **Logo** shown in the sidebar header and email templates

### Scheduling Settings

- **Start Time** / **End Time** — the window for scheduling games
- **Time Increment** — step size for the time picker (5, 10, 15, 30, 60, or 120 minutes)

### Age Groups

- Create age groups (8U, 9U, 10U, etc.) with sort order
- Set **Umpire Rate** per age group (default fee for games at that level)
- Toggle **Ump Required** (if off, games at that age group won't show umpire assignment options)

### Levels

- Create competitive levels (Recreational, Competitive, Elite, etc.)
- Set sort order for display

### Seasons

- Create seasons with year, name, and active status
- Only one season can be **Active** at a time
- The active season is the default filter across the app

### Divisions

- Create a hierarchical division tree
- Each division belongs to a season
- Supports nesting: "10U" → "10U AA" → "10U AA East"
- Teams are assigned to divisions, and standings are grouped by division

---

## Public Site

The public site is a separate, standalone website that requires **no login**. It provides read-only access to:

- **Standings** — current season standings with division filtering and team logos
- **Scores** — game results and upcoming schedule with season/status filters
- **Teams** — all teams grouped by organization with filtering

The public site URL is separate from the admin app.

---

## Account Settings

### Changing Your Password

1. Click your name/avatar in the top-right corner
2. Click **Change Password**
3. Enter your current password and your new password
4. Password requirements: 8+ characters, at least one uppercase, one lowercase, and one number
5. Click **Update**

### About & Help

- Click your name/avatar in the top-right corner
- Click **About** to see what the app does (features overview)
- Click **User Guide** to see this detailed instructions guide
