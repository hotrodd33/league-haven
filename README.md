# ZVBL Baseball Roster Manager

A React app for managing baseball team rosters that syncs with SportsPress on WordPress.

## Features

- Sign in with WordPress Application Password
- Select from existing SportsPress teams
- View, add, edit, and remove players from rosters
- Player fields: Name, Jersey #, Position, Date of Birth, Batting/Throwing Hand, Parent Email, Parent Phone

## Setup

### 1. WordPress Plugin (Required)

Copy the `wp-plugin/zvbl-roster-api.php` file to your WordPress site:

```
wp-content/plugins/zvbl-roster-api.php
```

Then activate it from **Plugins** in the WordPress admin. This plugin:
- Exposes SportsPress player meta fields to the REST API
- Adds custom fields (parent email/phone, batting/throwing hand, DOB)
- Handles CORS so the React app can make API calls

### 2. Application Password

In WordPress admin, go to **Users → Profile → Application Passwords** and generate a new password. You'll use this to sign in to the roster app.

### 3. Run the App

```bash
cd baseball-roster-app
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

### 4. Production Build

```bash
npm run build
```

Output goes to `dist/`. Deploy to any static host or your WordPress server.

## Player Fields

| Field | SportsPress Meta Key | Notes |
|-------|---------------------|-------|
| Name | Post title | Standard WP field |
| Jersey # | `sp_number` | Built-in SportsPress |
| Position | `sp_position` taxonomy | Built-in SportsPress |
| Date of Birth | `zvbl_date_of_birth` | Custom (via plugin) |
| Batting Hand | `zvbl_batting_hand` | Custom — R, L, or S |
| Throwing Hand | `zvbl_throwing_hand` | Custom — R or L |
| Parent Email | `zvbl_parent_email` | Custom (via plugin) |
| Parent Phone | `zvbl_parent_phone` | Custom (via plugin) |

## CORS Configuration

The plugin allows requests from:
- `http://localhost:3000` (Vite dev)
- `http://localhost:5173` (Vite default)
- `https://roster.zvbl.org` (production — update as needed)

To add more origins, use the `zvbl_roster_cors_origins` filter in your theme or another plugin.
