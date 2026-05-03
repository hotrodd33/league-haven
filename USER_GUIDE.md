# LeagueHaven Roster Manager — User Guide

A complete guide to managing your league. This guide covers every feature, organized as How-To walkthroughs, a Usage reference, and a Frequently Asked Questions section.

---

## Table of Contents

### How-To Guides
1. [Getting Started](#1-getting-started)
2. [Set Up Your League](#2-set-up-your-league)
3. [Manage Organizations & Teams](#3-manage-organizations--teams)
4. [Manage Rosters & Players](#4-manage-rosters--players)
5. [Manage Coaches & Staff](#5-manage-coaches--staff)
6. [Set Up Field Locations](#6-set-up-field-locations)
7. [Schedule Games & Events](#7-schedule-games--events)
8. [Use the Field Calendar](#8-use-the-field-calendar)
9. [Score Games & Track Pitches](#9-score-games--track-pitches)
10. [Manage Pitch Count Rules & Rest](#10-manage-pitch-count-rules--rest)
11. [View Standings](#11-view-standings)
12. [Manage Officials & Umpires](#12-manage-officials--umpires)
13. [Use the Umpire Dashboard](#13-use-the-umpire-dashboard)
14. [Import from GameChanger](#14-import-from-gamechanger)
15. [Use the Data Manager](#15-use-the-data-manager)
16. [Manage Users & Permissions](#16-manage-users--permissions)
17. [Configure League Settings](#17-configure-league-settings)
18. [Manage League Fees & Registration](#18-manage-league-fees--registration)
19. [Create & Manage Announcements](#19-create--manage-announcements)
20. [Subscribe to Calendar Feeds (iCal)](#20-subscribe-to-calendar-feeds-ical)
21. [Enable Push Notifications](#21-enable-push-notifications)
22. [Install as a Mobile App (PWA)](#22-install-as-a-mobile-app-pwa)
23. [Use the Public Site](#23-use-the-public-site)
24. [Manage Your Account](#24-manage-your-account)
25. [Schedule Games Without Dates (Unscheduled Games)](#25-schedule-games-without-dates-unscheduled-games)
26. [Use the Travel Distance Matrix](#26-use-the-travel-distance-matrix)
27. [Use Team Chat](#27-use-team-chat)
28. [Guardian Registration & Player Claims](#28-guardian-registration--player-claims)
29. [Delete & Restore Games](#29-delete--restore-games)

### Usage Reference
30. [Dashboard](#30-dashboard)
31. [Weather Integration](#31-weather-integration)
32. [Player Directory](#32-player-directory)
33. [Team Directory & Contact](#33-team-directory--contact)
34. [Player Stats](#34-player-stats)
35. [Player Documents](#35-player-documents)

### FAQ
36. [Frequently Asked Questions](#36-frequently-asked-questions)

---

# How-To Guides

---

## 1. Getting Started

### How to Create an Account

1. Navigate to the app login page
2. Click **Register** to create a new account
3. Choose your role:
   - **Coach** — for head coaches and assistant coaches
   - **Director / Org Admin** — for organization-level administrators
   - **Scorekeeper** — for score reporters
   - **Umpire** — for officials
4. Fill in your username, full name, email, and password
   - Password must be 8+ characters with at least one uppercase, one lowercase, and one number
5. Follow the role-specific steps (e.g., umpires enter DOB, certification status, and experience)
6. Check your email for a **confirmation link** — you must verify your email before logging in
7. A league administrator can upgrade your role or assign team/org permissions after you register

### How to Log In

1. Enter your username and password
2. Click **Sign In**
3. You'll be taken to the Dashboard

> **First-time login:** If your account was set up by a league admin with a temporary password, you'll be prompted to set a new personal password immediately before accessing the app.

### How to Reset Your Password

1. Click **Forgot Password** on the login page
2. Enter your email address
3. Check your email for a reset link (valid for 1 hour)
4. Click the link and set a new password

---

## 2. Set Up Your League

Follow these steps to set up a new league from scratch:

1. **Create Seasons** — Go to League Config → Seasons → create your first season and mark it Active
2. **Create Age Groups** — Go to League Config → Age Groups → add groups like 8U, 10U, 12U with sort order, umpire rates, and league fees
3. **Create Levels** — Go to League Config → Levels → add Recreational, Competitive, Elite, etc.
4. **Create Divisions** — Go to League Config → Divisions → build your division tree (e.g., "10U" → "10U AA" → "10U AA East")
5. **Create Organizations** — Add each league member organization with contact info and logos
6. **Create Teams** — Add teams under each org with age group, level, and division assignments
7. **Add Field Locations** — Add playing fields with addresses and GPS coordinates
8. **Set Branding** — Go to League Config → Branding → set your app name and upload a logo
9. **Configure Features** — Go to League Config → Feature Toggles → enable/disable features as needed (Live Scoring, Pitch Tracking, Officials, Financials, etc.)
10. **Add Users** — Invite org admins, team managers, and scorekeepers

---

## 3. Manage Organizations & Teams

### How to Create an Organization

1. Go to **Organizations** from the sidebar
2. Click **+ New Organization**
3. Fill in the organization name (required)
4. Optionally add: abbreviation, contact name, email, phone, address, city, state, zip, notes
5. Upload a **logo** (max 512KB — displayed throughout the app on team cards, standings, scoreboards)
6. Toggle **Officials Enabled** if this org manages its own umpires
7. Click **Save**

### How to Create a Team

1. Go to **Teams** from the sidebar
2. Click **+ New Team**
3. Fill in:
   - **Org** — select the parent organization
   - **City** — e.g., "Rochester"
   - **Color** — e.g., "Red"
   - **Mascot** — e.g., "Hawks"
4. The **full name** is auto-generated: "Rochester Red Hawks"
5. Optionally set:
   - **Abbreviation** — short code for the team
   - **Age Group** — 8U, 9U, 10U, etc.
   - **Level** — Recreational, Competitive, Elite, etc.
   - **Division** — the division the team plays in
   - **Primary / Secondary Colors** — hex color codes for UI display
   - **Logo** — upload a team-specific logo
6. Click **Save**

### Team Page Tabs

Each team page has tabs:

| Tab | What it shows |
|-----|---------------|
| **Overview** | Team info, recent games, and a staff contacts card; Roster and Schedule tabs show player/game count badges |
| **Schedule** | Team-specific game schedule with calendar view |
| **Pitching** | Pitcher rest status and 10-day pitch log |
| **Roster** | Player list with add/edit/remove |
| **Coaches** | Staff assignments with scheduling contact checkbox |

---

## 4. Manage Rosters & Players

### How to Add a Player

1. Navigate to a team's **Roster** tab
2. Click **+ Add Player**
3. Fill in the player form:
   - **First Name** and **Last Name** (required)
   - **Jersey Number** — specific to this team
   - **Positions** — select multiple using toggle buttons (P, C, 1B, 2B, etc.)
   - **Date of Birth** — date picker
   - **Bats** — Right / Left / Switch
   - **Throws** — Right / Left
   - **Grade** — Pre K through 12
   - **Jersey Size** — Youth XS through Adult 3XL (YXS, YS, YM, YL, YXL, AS, AM, AL, AXL, A2XL, A3XL)
   - **Hat Size** — Youth, Adult S/M, Adult L/XL, or fitted sizes (6⅜ through 8)
   - **Needs New Jersey** — toggle on if the player needs a replacement jersey
   - **Needs New Hat** — toggle on if the player needs a replacement hat
   - **Contacts** — add parent/guardian contacts with name, relationship, email, phone, and primary flag
4. Click **Add Player**

### How to Edit a Player

1. On the roster, click the **Edit** button (pencil icon) on a player card
2. Update any fields including jersey/hat sizing and "needs new" toggles
3. Click **Update Player**

### How to Add a Player to Multiple Teams

Players can belong to multiple teams. Each team assignment has its own jersey number.

1. Navigate to the second team's **Roster** tab
2. Click **+ Add Player** → **Add Existing**
3. Search for the player by name
4. Select them and assign a jersey number for this team

### How to Remove a Player from a Team

1. On the roster, click **Remove** on the player card
2. The player is removed from this team only — their record is preserved if they're on other teams

### How to Bulk Import Roster (Paste)

1. On the Roster tab, click **Paste Roster**
2. Paste a list in the format: `FirstName LastName, #Jersey` (one per line)
3. Players will be created and added to the team automatically

### How to View a Player's Full Profile

1. Click a player's name on any roster
2. The **Player Detail Page** displays the player's jersey number in the header — click the number to edit it inline (or the edit icon that appears on hover)
3. The page has tabs:
   - **Info** — inline-editable profile fields and team assignments
   - **Contacts** — full CRUD for contacts (parent, guardian, emergency, other) with primary flag
   - **Stats** — per-game batting and pitching stats
   - **Documents** — upload birth certificates, waivers, etc. (PNG, JPEG, GIF, WebP, PDF — max 2MB)
   - **Notes** — timestamped, author-attributed notes

---

## 5. Manage Coaches & Staff

### How to Add Staff

1. Navigate to a team's **Coaches** tab
2. Click **+ Add Staff**
3. Fill in name, email, phone, and role:
   - **Head Coach** — primary team contact
   - **Assistant Coach** — additional coaching staff
   - **Travel Director** — handles team logistics
4. Click **Save**

Staff members can be assigned to multiple teams independently. Staff receive email notifications for game schedule changes.

### How to Set a Scheduling Contact

Any staff member can be designated as the **Scheduling Contact** for their team. Their contact info appears on unscheduled game cards in place of the head coach, making it easy for opposing teams to coordinate scheduling.

1. Navigate to a team's **Coaches** tab
2. Find the staff member you want to designate
3. In the **Sched.** column (desktop) or next to the staff card (mobile), check the checkbox
4. Uncheck the box to remove the designation

Priority order on unscheduled game cards: **Scheduling Contact** → Head Coach → Org Admin.

---

## 6. Set Up Field Locations

### How to Add a Field

1. Go to **Fields** from the sidebar
2. Click **+ Add Location**
3. Enter the field name, address, city, state, and zip
4. Add GPS coordinates:
   - Enter latitude/longitude manually, **or**
   - Click on the interactive map to set the pin, **or**
   - Click **Lookup Coordinates** to auto-geocode from the address (uses OpenStreetMap Nominatim — free, no API key required)
5. Select which age groups can use this field
6. Click **Save**

### How to Use the Map

- The Fields page shows an interactive **Leaflet map** with colored markers for each field (color matches the organization)
- Filter fields by age group using the filter buttons
- Click a marker to see field details
- Click **Directions** to open Google Maps navigation
- Click **Calendar** on a field card to jump to the Field Calendar for that field

---

## 7. Schedule Games & Events

### How to Schedule a Game

1. Go to **Schedule** from the sidebar
2. Click **+ Schedule**
3. The event type defaults to **Game** — keep it selected
4. Fill in:
   - **Season** (auto-selects current active season)
   - **Home Team** and **Away Team**
   - **Date** and **Game Time** (optional — leave blank to create an unscheduled game)
   - **Location** (field) — if the field doesn't exist, click **+ Add Field** to create one inline with the full field form (org, address, age groups, GPS)
   - **Duration** — game length in minutes (defaults to 150 min / 2h 30m); used for field conflict detection
   - **Doubleheader** — check this box for back-to-back games; the away team's field options appear in the location dropdown for convenience
   - **Notes** (optional)
5. Click **Schedule Game**

> **Tip:** Games created without a date, time, or location are saved as **Unscheduled**. See [Schedule Games Without Dates](#25-schedule-games-without-dates-unscheduled-games) for details.

### How to Schedule a Practice, Event, or Maintenance

Admins and Org Admins can schedule non-game events directly from the Schedule page:

1. Click **+ Schedule**
2. Toggle the event type to **Practice**, **Event**, or **Maintenance**
3. Fill in:
   - **Title** — descriptive name
   - **Team** (for practices)
   - **Location** (field)
   - **Date**, **Start Time**, and **End Time**
   - **Duration** — auto-calculated from start/end time
4. To repeat the event, enable **Recurrence** and choose the pattern: Daily, Weekly, or Bi-weekly; set the end date
5. To copy an existing event, use **Clone** from the event's action menu
6. Click **Save**

This creates a field reservation that appears on the Field Calendar.

### How to Filter Games

Use the filter bar to narrow games by:
- **Team** — show only one team's games
- **Season** — switch between seasons
- **Status** — Unscheduled, Scheduled, In Progress, Completed, Cancelled, Postponed
- **Date Range** — filter to a specific time window

Toggle between **List** view and **Calendar** view using the view buttons.

### How to Edit or Cancel a Game

1. Click a game card to open the game detail page
2. Click **Edit** to change date, time, location, or teams
3. To cancel, change the status to **Cancelled** or **Postponed**
4. **When the date/time changes or a game is cancelled/postponed**, staff and subscribed users on both teams automatically receive email and push notifications

### Field Conflict Detection

When scheduling a game, the system automatically checks for overlapping field reservations (including a 3-hour prep window). If a conflict is found:
- You'll see the conflicting event details and contact info for the reservation owner
- Click **Schedule Anyway** to override the conflict

---

## 8. Use the Field Calendar

### How to View a Field's Calendar

1. Go to **Fields** from the sidebar
2. Click the **Calendar** button on any field card, **or**
3. Open a field detail view and click the calendar icon

### How to Create a Reservation

1. On the Field Calendar, click **+ Schedule**
2. Choose the event type: **Practice**, **Event**, **Maintenance**, or **Game**
3. Fill in the required fields for that type
4. Click **Save**

### Calendar Features

- **Monthly calendar** and **list view** toggle
- Color-coded events by type (blue = game holds, green = practices, orange = events, red = maintenance)
- Click any event to edit or delete it
- Auto-generated game hold blocks appear for scheduled games

---

## 9. Score Games & Track Pitches

### How to Enter Scores

1. Open a game from the schedule
2. Click **Start Game** to move it to "In Progress"
3. Enter the score for each team as the game progresses
4. Track **innings played** as the game advances
5. When done, click **Final** to complete the game

### How to Use the Pitch Tracker

1. During an in-progress game, click **Pitch Tracker**
2. The tracker shows:
   - Current inning and score
   - Active pitcher for each team
   - Running pitch count
3. Tap the **+** button each time a pitch is thrown
4. Switch pitchers or advance innings as the game progresses
5. Pitch counts are saved automatically and feed into the rest rules system

---

## 10. Manage Pitch Count Rules & Rest

### How Pitch Rules Work

The league sets age-based pitch limits in **League Config → Age Groups**. Example defaults:

| Age Group | Daily Limit | Rest After |
|-----------|-------------|------------|
| 9U–12U | 50 pitches | Thresholds vary by count |
| 13U–15U | 65 pitches | Thresholds vary by count |

- Pitchers cannot throw on more than 2 consecutive calendar days
- Required rest days are calculated automatically from pitch counts

### How to View Pitcher Rest Status

1. Navigate to a team's **Pitching** tab
2. **Pitcher Rest** shows each pitcher's current status:
   - 🟢 **Available** — can pitch today
   - 🟡 **Resting** — must rest (shows return date)
   - 🔴 **Unavailable** — at their daily or consecutive-day limit
3. **Pitch Log** shows a rolling 10-day view (7 past + 3 future) with daily counts per pitcher

### Dashboard Pitch Alerts

The Dashboard shows a **Pitch Rest Alerts** section listing all players currently on required rest with their return dates.

---

## 11. View Standings

### How to View Standings

1. Go to **Standings** from the sidebar
2. Select a **Season** and optionally a **Division**
3. The standings table shows:
   - Team name and logo
   - Wins, Losses, Ties
   - Points (W=3, T=2, L=1)
   - Win percentage
   - Runs For / Runs Against

Standings are calculated automatically from completed game results and grouped by hierarchical division paths.

---

## 12. Manage Officials & Umpires

### How to Add an Official (Admin/Accountant)

1. Go to **Officials** from the sidebar
2. Click **+ New Official**
3. Fill in: name, email, phone, mailing address, Venmo ID, rate per game, DOB, certification status, years of experience, and notes
4. Select **age group eligibility** — which levels they can umpire
5. Choose **scope**: league-wide (visible to everyone) or org-specific
6. Optionally link to an existing user account
7. Click **Save**

### How to View Official Details

Click an official card to see their detail page with:

- **Profile card** — all contact info, rate, certification status, eligible age groups
- **Financial summary** — total earnings, payments, and amount due
- **Three tabs:**
  - **Upcoming** — assigned games not yet played (click ✕ to unassign)
  - **Completed** — finished games with Fee, Paid, and No Show checkboxes
  - **Interested** — games they want to ump (click **Assign** to assign)

### Official Listing Cards

Each card shows stat chips:
- **$ Owed** — money due for completed unpaid games
- **Assigned** — upcoming assigned games
- **Interested** — games with expressed interest
- **Completed** — finished games
- **Age Groups** — eligible age groups

Filter by scope (league-wide vs. org) and age group.

### How Payment Tracking Works

- Click the **Fee** amount on any game to set a custom per-game rate
- Check **Paid** to mark a game as paid
- Check **No Show** if the umpire didn't appear — the fee shows as strikethrough and doesn't count toward totals

**Fee priority order:**
1. Per-game fee override
2. Official's personal rate
3. Age group rate (from League Config)
4. $50 default fallback

---

## 13. Use the Umpire Dashboard

For users with umpire access, the sidebar shows **Umpire Dashboard**.

### How to Express Interest in a Game

1. Go to your **Umpire Dashboard**
2. Click the **Available** tab to see games needing umpires
3. Click **Interested** on any game
4. The game moves to your **Interested** tab
5. A league admin will review and assign you from the Officials page

### Game Tabs

| Tab | Description |
|-----|-------------|
| **Completed** | Games you've umpired with scores and dates |
| **Assigned** | Upcoming games you're confirmed for |
| **Interested** | Games you want — awaiting admin assignment |
| **Available** | Games needing umpires — express interest here |

Use the **season dropdown** to filter games by season.

---

## 14. Import from GameChanger

### How to Import a Box Score

1. Click **Import from GameChanger** from the Dashboard or Data Manager
2. Choose import method:
   - **Upload PDF** — upload a GameChanger box score PDF
   - **Paste Text** — paste box score text directly
   - **URL** — provide a link
3. **Team Mapping** — The system auto-matches teams by name, abbreviation, or saved alias. Manually map any unmatched teams.
4. **Player Mapping** — Players are auto-matched by full name, jersey number, or partial formats. Map unmatched players.
5. **Preview** — Review all parsed data (batting/pitching stats, pitch counts, scores)
6. **Import** — Confirm to save everything
7. **Success** — Summary of imported data

### What Gets Imported

- Final score (home and away)
- Batting statistics per player
- Pitching statistics per player
- Pitch counts per pitcher (feeds into rest calculations)

### Column Mapping

For non-standard CSV formats, the import wizard provides flexible column mapping so you can match your data to the expected fields.

---

## 15. Use the Data Manager

### How to Export Data (CSV)

1. Go to **Data Manager** → **Export** tab (admin only)
2. Choose an entity: Organizations, Teams, Players, Staff, Games, Seasons, Divisions, Locations
3. Click **Download CSV**

### How to Import Data (CSV)

1. Go to **Data Manager** → **Import** tab
2. Choose the entity to import
3. Upload a CSV file matching the expected column format
4. Choose **Create** mode (add new) or **Update** mode (update existing)
5. For teams, use `Team Name (Org Name)` format to disambiguate teams with the same name

### How to Clear Data

1. Go to **Data Manager** → **Clear** tab
2. Choose a preset group:
   - **All League Data** — wipes everything
   - **Games Only** — removes games but keeps teams/rosters
   - **Rosters Only** — removes players and staff
3. Confirm to delete — **this cannot be undone**

---

## 16. Manage Users & Permissions

### Role Overview

| Role | Access Level |
|------|-------------|
| **Super Admin** | Full access to everything |
| **Org Admin** | Manage their organization's teams, games, and officials |
| **Team Manager** | Manage their assigned teams |
| **Score Reporter** | Enter scores for their assigned teams |
| **Accountant** | Read-only access to financial data + officials payment management |
| **Umpire** | Umpire dashboard with interest/availability |

Any user can also have the **Is Umpire** flag enabled, giving them umpire dashboard access alongside their primary role.

### How to Create a User

1. Go to **Users** from the sidebar (admin only)
2. Click **+ New User**
3. Fill in username, full name, email, password, and role
4. Optionally check **Is Umpire** for umpire dashboard access
5. Optionally assign **Organization** or **Team** permissions — the user will have access immediately after creation (limited to orgs/teams you have permission to manage)
6. Click **Save**

The new user will receive an email with their credentials. They will be prompted to set a new password on their first login.

### How to Assign Permissions

1. Edit a user from the Users page
2. Under **Permissions**, assign:
   - **Organization access** — allows managing all teams in that org
   - **Team access** — allows managing specific teams
3. Permissions control what teams/orgs the user can view and edit

### How to Invite a User

1. Click the **Invite** button on a user card
2. A temporary password is generated automatically
3. The user receives an email with their login credentials
4. They can change their password after first login

---

## 17. Configure League Settings

Available under **League Config** in the sidebar (admin only).

### Branding

- Set the **App Name** displayed in the sidebar and email templates
- Upload a **Logo** shown in the sidebar header, emails, and public site

### Scheduling Settings

- **Start Time** / **End Time** — the daily window for scheduling games
- **Time Increment** — step size for the time picker (5, 10, 15, 30, 60, or 120 minutes)

### Feature Toggles

Enable or disable 11 features independently:
- Live Scoring, Pitch Tracking, Officials, Player Stats, Player Documents, Financials, Team Registration, Public Site, Push Notifications, **Allow Game Deletion**, **Team Chat**

Disabled features are hidden from the sidebar and UI.

### Staging Email Redirect

When you have real data in a staging environment, you can prevent accidental emails to real users:

1. Go to **League Config** → **Branding**
2. Scroll to **Email Redirect (Staging / Testing)**
3. Enter an email address (e.g., your admin address)
4. Click **Save Email Redirect**

When set, **all outbound emails** (invites, password resets, game change notifications, etc.) are sent to that address instead of the real recipient. The subject line is prefixed with the original recipient's address so you know who the email was intended for. Clear the field to restore normal sending.

### Age Groups

- Create age groups (8U, 9U, 10U, etc.) with sort order
- Set **Umpire Rate** per age group (default fee for games at that level)
- Set **League Fee** per age group (for team registration)
- Toggle **Ump Required** — if off, games at that age group skip umpire assignment

### Levels

- Create competitive levels (Recreational, Competitive, Elite, etc.) with sort order

### Seasons

- Create seasons with year, name, and active status
- Only one season can be **Active** at a time — the active season is the default filter across the app

### Divisions

- Build a hierarchical division tree (e.g., "10U" → "10U AA" → "10U AA East")
- Each division belongs to a season
- Teams are assigned to divisions, and standings are grouped by division path

---

## 18. Manage League Fees & Registration

### How to Register Teams for a Season

1. Go to **League Fees** from the sidebar (admin only)
2. Click **Register Teams** to bulk-register multiple teams for the current season
3. Fees are auto-assigned based on the team's age group league fee setting
4. Override fees per-team as needed

### How to Record Payments

1. On the League Fees page, find the team's registration
2. Click **Record Payment**
3. Enter: amount, payment method, check number (if applicable), and notes
4. Click **Save**

### Financial Dashboard

The summary bar shows:
- **Total Fees** — all fees assessed across registered teams
- **Collected** — payments received
- **Outstanding** — remaining balance

Filter by season, age group, and payment status.

---

## 19. Create & Manage Announcements

### How to Create an Announcement

1. Go to **Announcements** from the sidebar (admin only)
2. Click **+ New Announcement**
3. Fill in:
   - **Title** — headline text
   - **Body** — full message
   - **Priority** — Low, Normal, High, or Urgent
   - **Active** — toggle on to display immediately
   - **Expires At** — optional auto-expiration date
4. Click **Save**

### Where Announcements Appear

- Active announcements display prominently at the top of the **Dashboard** with priority-based styling and badges
- High/Urgent announcements can trigger **push notifications** to all subscribers

---

## 20. Subscribe to Calendar Feeds (iCal)

### How to Subscribe

1. From the Schedule page, click the **Subscribe** button (calendar icon)
2. Copy the **webcal:// URL**
3. Add it to your calendar app:
   - **Google Calendar**: Settings → Add calendar → From URL → paste the link
   - **Apple Calendar**: File → New Calendar Subscription → paste the link
   - **Outlook**: Add calendar → Subscribe from web → paste the link

### Filtering the Feed

The iCal URL supports filters — you can subscribe to a specific team, season, location, or organization's games only.

---

## 21. Enable Push Notifications

### How to Subscribe to Push Notifications

1. Go to **My Account** (click your avatar in the top-right)
2. In the **Notifications** section, click **Enable Push Notifications**
3. Your browser will ask for notification permission — click **Allow**
4. Toggle individual notification types:
   - **Schedule Changes** — when a game date/time is updated
   - **Cancellations** — when a game is cancelled or postponed
   - **Announcements** — when a new announcement is posted
5. Click **Test Notification** to verify it works

### Admin Broadcast

Admins can send push notifications to a team, organization, or the entire league from the Push section.

---

## 22. Install as a Mobile App (PWA)

### How to Install on Your Phone

The app is a **Progressive Web App** — you can install it for a native app experience:

**iPhone / Safari:**
1. Open the app in Safari
2. Tap the **Share** button (square with arrow)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add**

**Android / Chrome:**
1. Open the app in Chrome
2. Tap the **three-dot menu** (⋮)
3. Tap **Add to Home Screen** or **Install App**
4. Tap **Install**

The app will appear on your home screen and work even when your network is slow. Push notifications work in the background.

---

## 23. Use the Public Site

The public site is a standalone website at `/site` that requires **no login**. Share this URL with parents and fans.

### Available Pages

- **Standings** — current season standings with division filtering, win %, and team logos
- **Scores** — game results and upcoming schedule with season/status filters
- **Teams** — all teams grouped by organization with org filter; click a team for a detail page showing schedule, roster, and staff
- **Travel Matrix** — interactive distance grid showing proximity between all league organizations; color-coded by distance (green ≤20mi, yellow ≤35mi, orange ≤55mi, red 56+mi); click any org to see a sorted trip planner with average away distance

The public site pulls live data from the same database and uses the league's branding and logos.

> **Note:** The Travel Matrix uses straight-line (Haversine) distances, which may be approximately 20% less than actual driving distances. This is intended for proximity reference, not exact travel planning.

---

## 24. Manage Your Account

### My Account Page

Click your avatar/name in the top-right corner to access My Account:

- **Profile Overview** — avatar, name, username, email, role badge, member since, last login
- **Notification Preferences** — enable/disable push for schedule changes, cancellations, and announcements independently
- **Permissions Summary** — your role and what it grants
- **My Organizations** — orgs you manage
- **My Teams** — teams you have access to with age group, level, and org name

### How to Change Your Password

1. Go to **My Account**
2. Click **Change Password**
3. Enter your current password and new password
4. Requirements: 8+ characters, at least one uppercase, one lowercase, and one number
5. Click **Update**

---

## 25. Schedule Games Without Dates (Unscheduled Games)

Sometimes you need to lock in matchups before dates are finalized — for example, when building a full-season schedule via CSV import.

### How to Create Unscheduled Games

**Manually:**
1. Go to **Schedule** → **+ Schedule**
2. Select home and away teams
3. Leave date, time, and location blank
4. Click **Schedule Game** — the game is saved as **Unscheduled**

**Via CSV Import:**
1. Go to **Data Manager** → **Import** → **Games/Schedule**
2. Upload a CSV with home and away team columns but leave the `game_date` and `game_time` columns empty
3. Games are imported as **Unscheduled**

### How to Recognize Unscheduled Games

- Unscheduled games show a **warning badge** ("Unscheduled") on game cards
- The date displays as **TBD**
- A red **Schedule It!** button appears instead of the Edit button
- **Scheduling contact info** (name, email, phone) appears on the card for easy coordination — shows the team's designated Scheduling Contact, or falls back to Head Coach, then Org Admin

### How to Schedule an Unscheduled Game

1. Click the **Schedule It!** button on the game card (or in the team schedule)
2. The edit modal opens — fill in the date, time, and location
3. Change the status to **Scheduled**
4. Click **Save**

The Track/Live button only appears once a game is in **Scheduled** or **In Progress** status.

---

## 26. Use the Travel Distance Matrix

The Travel Matrix helps schedulers understand travel distances between league organizations.

### How It Works

1. Organizations need **GPS coordinates** (latitude/longitude) set in their profile
2. Go to **Organizations** → edit an org → use the **Lookup Coordinates** button to auto-geocode from the address
3. An admin can calculate distances from the Travel Matrix page (or via the API)
4. Distances are calculated using the Haversine formula (straight-line) and cached in the database

### How to View the Matrix

The Travel Matrix is available on the **public site** under the Travel tab:

- **Color-coded grid** — green (0–20 mi), yellow (21–35 mi), orange (36–55 mi), red (56+ mi)
- **Click any organization** to see a sorted trip planner listing all other orgs by distance
- **Average away distance** is calculated for the selected org
- **Filter buttons** let you show only orgs within a mileage threshold

> **Note:** Straight-line distances are typically ~20% shorter than actual driving distances. The matrix is designed for proximity planning, not exact travel estimates.

---

## 27. Use Team Chat

Team Chat lets coaches, managers, and staff communicate in real time within the app. The Chat feature must be enabled in League Config → Feature Toggles.

### How to Open a Chat Channel

1. Click **Chat** in the sidebar
2. You'll see channels you belong to:
   - **Team channels** — one channel per team you have access to
   - **Org channels** — one channel per organization you manage
   - **Direct messages** — private conversations with individual users
3. Click any channel to open it

### How to Send a Message

1. Type your message in the input box at the bottom
2. Press **Enter** or click **Send**
3. Messages appear in real time for all channel members

### How to Reply, Edit, or Delete a Message

- **Reply** — hover a message and click the reply icon to respond in thread context
- **Edit** — hover your own message and click the edit icon; the message is updated in place
- **Delete** — hover your own message and click the delete icon; the message is removed

### Unread Badges

The sidebar shows a badge with the count of unread messages across all your channels.

---

## 28. Guardian Registration & Player Claims

The Guardian Portal allows parents and guardians to register themselves, link to their player, and get a read-only view of schedule and roster info.

### How to Register as a Guardian

1. On the login page, click **Register**
2. Choose **Guardian / Parent** as your role
3. Fill in your name, email, and password
4. Verify your email via the confirmation link

### How to Submit a Player Claim

After logging in for the first time:

1. You'll be taken to the **Guardian Home** screen
2. Click **Find My Player**
3. Search for your player by first and last name
4. Select the correct player and click **Submit Claim**
5. Your request is sent to the league admin for review

### What Happens After Approval

Once a super admin approves your claim:
- Your account is linked to the player
- **Guardian Home** shows your player's upcoming schedule, team info, and stats (if enabled by the team)

### For Admins: Reviewing Claims

1. Go to **Users** → **Guardian Claims** tab
2. Review pending claims — name, email, and which player they're claiming
3. Click **Approve** or **Deny**
4. Denied claims can include a note explaining why

---

## 29. Delete & Restore Games

Game deletion uses soft delete — games are hidden from all views but not permanently removed, and can be restored.

### Who Can Delete Games

- **Super Admins** — can always delete any game
- **Org Admins / Team Managers** — can delete games for their teams only **if** the `Allow Game Deletion` feature toggle is enabled in League Config

### How to Delete a Game

1. Open a game from the schedule
2. Click **Delete Game** (or the trash icon on the game card)
3. Confirm the deletion
4. The game disappears immediately from all schedule views

### How to Restore a Deleted Game (Super Admin only)

1. Go to **Schedule** and enable the **Show Deleted** filter (if visible)
2. Find the deleted game (shown with a deleted badge)
3. Click **Restore** to bring it back

---

# Usage Reference

---

## 30. Dashboard

The Dashboard is your home screen, showing a time-of-day greeting and the current season name.

| Section | What It Shows |
|---------|--------------|
| **Announcements** | Active announcements with priority-based styling (low/normal/high/urgent) and badges |
| **Stat Cards** | Total teams, games this week, games played, organizations (role-scoped) |
| **Today's Games** | Scoreboard widgets with team logos, colors, and live weather data |
| **Weather Alerts** | Games today with poor or unplayable weather conditions flagged prominently |
| **Pitch Rest Alerts** | Players currently on pitcher rest with return dates |
| **Scores Needed** | Past games still in "scheduled" status that need score entry |
| **Upcoming Games** | Next 5 games as scoreboard widgets with weather forecasts |
| **Quick Actions** | Role-aware shortcuts (enter scores, schedule, manage teams, data manager, standings) |
| **Season Overview** | Game/team counts and season progress bar |
| **Roster Alerts** | Players missing DOB or jersey numbers |
| **Recent Activity** | Merged feed of player adds, game updates, new teams, registrations, and imports with timestamps |
| **Recent Results** | Last 5 completed games as scoreboard widgets |

---

## 31. Weather Integration

Weather data is fetched automatically from **Open-Meteo** for games within a 16-day forecast window.

### Baseball Playability Score

Each game gets a 0–100 playability rating based on:
- Rain probability and precipitation amount
- Thunderstorm risk
- Temperature extremes (too hot or too cold)
- Wind gust speed
- Fog conditions

| Score | Rating | Color |
|-------|--------|-------|
| 75–100 | Good | Green |
| 50–74 | Fair | Yellow |
| 25–49 | Poor | Orange |
| 0–24 | Unplayable | Red |

Weather is shown on game cards, scoreboards, and the dashboard. Games with poor/unplayable conditions are flagged on the Dashboard under **Weather Alerts**.

**Caching:** 15-minute cache for current weather, 1-hour cache for forecasts.

---

## 32. Player Directory

The **Players** page provides a league-wide searchable player directory.

- Search by name across all players
- Filter by organization and team
- Sort by name, age, grade, bats/throws, team, or org
- Pitch rest status badges show which players are currently resting
- Click a player to open their full detail page

---

## 33. Team Directory & Contact

### Team Directory

1. Go to **Directory** from the sidebar
2. All teams are listed grouped by organization with collapsible sections
3. Expand any org to see teams, staff, and contact info
4. Contact info shows email and phone with clickable action links
5. Click **Print** for a formatted, printer-friendly view of the entire directory

### Sending Emails

1. Click the **Email** icon on any contact, team, or organization
2. The Contact Modal shows:
   - **Scope** — Individual, Team, Organization, or League-wide
   - **Recipients** — preview list of who will receive the email
   - **Subject** and **Message** fields
3. Multiple recipients are BCC'd for privacy
4. Emails use a branded HTML template with the league header and sender info
5. Recipients are automatically deduplicated by email address

---

## 34. Player Stats

### Stat Definitions

Admins define stat fields in League Config:
- **Batting Stats** — e.g., AB, H, 2B, 3B, HR, RBI, BB, K, AVG
- **Pitching Stats** — e.g., IP, K, BB, H, ER, ERA
- Each stat has an abbreviation, data type, sort order, and optional GameChanger column mapping

### Viewing Stats

Player stats are viewable on the **Stats** tab of the Player Detail page, showing per-game stat values.

---

## 35. Player Documents

### Supported Files

- **Formats:** PNG, JPEG, GIF, WebP, PDF
- **Max size:** 2MB per file
- **Use cases:** Birth certificates, league waivers, medical forms

### How to Upload

1. Go to a player's detail page → **Documents** tab
2. Click **Upload Document**
3. Choose a file and add a description
4. Click **Upload**

Documents are stored as base64 and can be downloaded or viewed at any time.

---

# FAQ

---

## 36. Frequently Asked Questions

### General

**Q: What browsers are supported?**
A: Any modern browser — Chrome, Firefox, Safari, Edge. The app also works as an installable PWA on iOS and Android.

**Q: Is there a mobile app?**
A: Yes — the app is a Progressive Web App (PWA). Open it in your phone's browser and choose "Add to Home Screen" for a native app experience with push notifications. See [How to Install as a Mobile App](#22-install-as-a-mobile-app-pwa).

**Q: Can parents or fans access the app?**
A: Parents and fans can view the **Public Site** (at `/site`) which shows standings, scores, and teams without requiring a login. The admin portal requires an account.

**Q: How do I get help or report a bug?**
A: Contact your league administrator. The in-app **Help** page (accessible from the user menu) shows this User Guide and the app's feature overview.

---

### Accounts & Permissions

**Q: I can't log in — what should I do?**
A: Make sure you've confirmed your email (check your inbox for a verification link). If you've forgotten your password, click "Forgot Password" on the login page. If problems persist, contact your league admin to check your account status.

**Q: I was given a temporary password but can't get to the dashboard — what's happening?**
A: When you log in for the first time with an admin-assigned temporary password, you'll be required to set a new personal password before the app opens. This is a one-time step. If you don't complete it right away, the system will send a reminder email after 48 hours.

**Q: Why can't I see certain teams or features?**
A: Your access is controlled by your role and assigned permissions. Ask your league admin to grant you access to the teams/organizations you need.

**Q: What's the difference between Org Admin and Team Manager?**
A: An **Org Admin** can manage all teams in their organization plus schedule games and manage org-level officials. A **Team Manager** can only manage the specific teams they've been assigned to.

**Q: Can I have multiple roles?**
A: You have one primary role, but any user can also have the **Is Umpire** flag enabled, giving them access to the Umpire Dashboard alongside their main role.

---

### Rosters & Players

**Q: Can a player be on more than one team?**
A: Yes. Players can be assigned to multiple teams, each with their own jersey number. Use the "Add Existing" option when adding a player who's already in the system.

**Q: What are the jersey and hat size options?**
A: Jersey sizes range from Youth XS (YXS) to Adult 3XL (A3XL). Hat sizes include Youth, Adult S/M, Adult L/XL, and fitted sizes from 6⅜ to 8. You can also toggle "Needs New Jersey" or "Needs New Hat" to flag players needing replacements.

**Q: How do I know which players are missing information?**
A: The Dashboard shows **Roster Alerts** listing players who are missing a date of birth or jersey number.

**Q: Where can I upload a player's birth certificate or waiver?**
A: Go to the player's detail page → **Documents** tab. Supported formats: PNG, JPEG, GIF, WebP, PDF (max 2MB). This feature must be enabled in League Config → Feature Toggles.

---

**Q: Can I import games without dates?**
A: Yes. Leave the `game_date` and `game_time` columns empty in your CSV. Games will be imported as **Unscheduled**. You can add dates later using the "Schedule It!" button on each game card. See [Schedule Games Without Dates](#25-schedule-games-without-dates-unscheduled-games).

**Q: What does the "Schedule It!" button do?**
A: It opens the game edit modal so you can add a date, time, and location to an unscheduled game. Once all fields are set, change the status to "Scheduled" and save.

**Q: How do I see the scheduling contact for a game?**
A: On unscheduled game cards, a priority contact is shown for each team: the staff member flagged as the team's **Scheduling Contact** (if set), otherwise the Head Coach, otherwise the Org Admin. You can designate any staff member as the scheduling contact from the team's Coaches tab using the "Sched." checkbox. Contact info also appears in the game edit modal.

---

**Q: Who can delete games?**
A: Super Admins can always delete any game. Org Admins and Team Managers can delete games for their teams only if the **Allow Game Deletion** feature toggle is enabled in League Config. All deletes are soft deletes — games can be restored by a Super Admin.

**Q: Can I schedule a doubleheader?**
A: Yes. When creating a game, check the **Doubleheader** checkbox. The away team's fields will appear in the location dropdown so you can quickly find a suitable field for back-to-back games.

**Q: How do I schedule recurring practices?**
A: When creating a practice or event, enable **Recurrence** in the form and choose Daily, Weekly, or Bi-weekly. Set the recurrence end date and all events will be created at once.

**Q: Can parents see their child's information?**
A: Yes, via the **Guardian Portal**. Parents register with the Guardian role, submit a player claim, and after admin approval they get a read-only home screen with their player's schedule, team info, and stats (if the team has stats visibility enabled). See [Guardian Registration & Player Claims](#28-guardian-registration--player-claims).

**Q: How do I prevent emails from going to real users in staging?**
A: Go to League Config → Branding → **Email Redirect** and enter your admin email. All outbound emails will be redirected there until you clear the field.


A: On the Schedule page, click **+ Schedule**, then toggle the event type from "Game" to "Practice." You can also create practices from the Field Calendar. Practices create field reservations and show on the calendar.

**Q: What happens when I change a game's date or time?**
A: All staff members on both teams automatically receive an email notification about the change. If push notifications are enabled, subscribed users also get a push notification.

**Q: What happens when I cancel or postpone a game?**
A: Staff and subscribed users on both teams receive email and push notifications. The game status changes accordingly and it no longer counts toward standings.

**Q: How does field conflict detection work?**
A: When scheduling a game, the system checks for overlapping field reservations including a 3-hour prep window. If a conflict exists, you'll see the details and can choose to schedule anyway or pick a different time/field.

**Q: Can I subscribe to the schedule in my phone's calendar?**
A: Yes. On the Schedule page, click the calendar subscribe button. Copy the webcal:// URL and add it to Google Calendar, Apple Calendar, or Outlook. The feed updates automatically. See [Calendar Feeds (iCal)](#20-subscribe-to-calendar-feeds-ical).

---

### Scoring & Pitch Tracking

**Q: Who can enter scores?**
A: Users with the **Score Reporter**, **Team Manager**, **Org Admin**, or **Super Admin** role can enter scores for games they have permission for.

**Q: How are pitch counts tracked?**
A: During a live game, the Pitch Tracker lets you count pitches per pitcher per inning. Counts are also imported automatically from GameChanger box scores. Both sources feed into the rest rules system.

**Q: How are pitcher rest days calculated?**
A: Rest is based on age-group pitch limits set in League Config. Pitchers cannot throw on more than 2 consecutive calendar days. The system automatically calculates when a pitcher is available again based on their recent pitch counts.

---

### Officials & Umpires

**Q: How does the umpire fee get determined?**
A: Fees cascade in this order: (1) per-game override → (2) official's personal rate → (3) age group rate from League Config → (4) $50 default.

**Q: Can umpires sign up for games themselves?**
A: Umpires can express **interest** in available games from their Umpire Dashboard. A league admin then reviews and formally assigns them from the Officials page.

**Q: What does "No Show" mean on a game?**
A: If an umpire was assigned but didn't appear, checking "No Show" marks the fee as voided (shown as strikethrough) so it doesn't count toward earnings or payments owed.

**Q: What does the "Ump Required" toggle on age groups do?**
A: When disabled for an age group (e.g., 8U T-ball), games at that level won't show umpire assignment options. This is useful for younger age groups that don't use official umpires.

---

### GameChanger Import

**Q: What formats can I import?**
A: You can upload a GameChanger PDF box score, paste box score text, or provide a URL. The import wizard walks you through team and player matching.

**Q: What if teams or players aren't matched automatically?**
A: The import wizard shows unmatched items and lets you manually map them to existing teams/players. For teams, you can save aliases so future imports match automatically.

**Q: Does importing update pitch counts?**
A: Yes. Imported pitch counts feed directly into the pitcher rest system. After import, pitcher availability is recalculated.

---

### Data & Bulk Operations

**Q: How do I export all my data?**
A: Go to Data Manager → Export → choose a category (Organizations, Teams, Players, Staff, Games, Seasons, Divisions, Locations) → Download CSV.

**Q: Can I import players in bulk?**
A: Yes, two ways: (1) CSV import via Data Manager → Import tab, or (2) Paste Roster on a team's Roster tab using `FirstName LastName, #Jersey` format.

**Q: Is there an undo for clearing data?**
A: No. Data clearing is permanent. Always export a CSV backup before clearing.

---

### Weather

**Q: Where does weather data come from?**
A: Weather data is fetched from the free **Open-Meteo** API. Game locations must have GPS coordinates (latitude/longitude) set for weather to appear.

**Q: Why don't I see weather for my game?**
A: Weather only appears for games within a 16-day forecast window and only if the game's field location has GPS coordinates configured. Check the field's lat/long in Field Locations.

---

### Push Notifications

**Q: Why am I not receiving push notifications?**
A: Check that: (1) You've enabled notifications in My Account, (2) Your browser allowed notification permissions, (3) The Push Notifications feature is enabled in League Config. Use the **Test Notification** button in My Account to verify.

**Q: Do push notifications work when the app is closed?**
A: Yes. The service worker handles push events in the background, so notifications display even when the app isn't open.

---

### Travel Matrix

**Q: How are travel distances calculated?**
A: Distances use the Haversine formula (straight-line distance between GPS coordinates). These are typically ~20% shorter than actual driving distances but useful for understanding relative proximity.

**Q: Why don't I see distances for some organizations?**
A: Organizations need GPS coordinates (latitude/longitude) set in their profile. Edit the org and click **Lookup Coordinates** to auto-geocode from the address, or set coordinates manually.

**Q: Where can I view the travel matrix?**
A: The Travel Matrix is available on the public site under the Travel tab. It shows an interactive color-coded grid of distances between all organizations with GPS coordinates.

---

### Public Site

**Q: How do I share standings with parents and fans?**
A: Share the public site URL (`yourdomain.com/site`). It shows standings, scores, and teams without requiring a login. The Public Site feature must be enabled in League Config → Feature Toggles.

---

### Troubleshooting

**Q: The app seems slow or unresponsive. What should I do?**
A: Try refreshing the page (Ctrl+R or Cmd+R). If using the PWA, try closing and reopening it. Clear your browser cache if the problem persists.

**Q: I'm getting an error when saving a form. What's wrong?**
A: Check that all required fields (marked with *) are filled in. If the error persists, check your internet connection — the app requires a connection to the server.

**Q: Emails aren't being delivered. What should I check?**
A: Check your spam/junk folder first. If using SendGrid, verify that domain authentication (SPF, DKIM) is configured for your sending domain. Some email providers (especially Yahoo) may temporarily defer emails from new senders — they'll typically deliver within minutes to hours on retry.

**Q: How do I report a data issue or request a correction?**
A: Contact your league's Super Admin. They have access to edit all data and can use the Data Manager for bulk corrections.
