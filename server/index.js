const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');

// Initialize DB (lazy migration)
const { ensureReady } = require('./db');

const authRoutes = require('./routes/auth');
const teamsRoutes = require('./routes/teams');
const positionsRoutes = require('./routes/positions');
const playersRoutes = require('./routes/players');
const staffRoutes = require('./routes/staff');
const orgsRoutes = require('./routes/organizations');
const locationsRoutes = require('./routes/locations');
const usersRoutes = require('./routes/users');
const leagueConfigRoutes = require('./routes/league-config');
const { router: gamesRoutes, expireStaleScorers } = require('./routes/games');
const pitchRulesRoutes = require('./routes/pitch-rules');
const seedRoutes = require('./routes/seed');
const dataManagerRoutes = require('./routes/data-manager');
const importRoutes = require('./routes/import');
const contactRoutes = require('./routes/contact');
const officialsRoutes = require('./routes/officials');
const umpireRoutes = require('./routes/umpires');
const registrationsRoutes = require('./routes/registrations');
const reservationsRoutes = require('./routes/reservations');
const calendarRoutes = require('./routes/calendar');
const playerContactsRoutes = require('./routes/player-contacts');
const playerNotesRoutes = require('./routes/player-notes');
const playerDocumentsRoutes = require('./routes/player-documents');
const statsRoutes = require('./routes/stats');
const pushRoutes = require('./routes/push');
const dashboardRoutes = require('./routes/dashboard');
const announcementsRoutes = require('./routes/announcements');
const weatherRoutes = require('./routes/weather');
const travelRoutes = require('./routes/travel');
const bugReportRoutes = require('./routes/bug-report');
const guardianClaimsRoutes = require('./routes/guardian-claims');
const chatRoutes = require('./routes/chat');

const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3001;

// Build allowed origins list from env var (comma-separated) or fall back to localhost for dev
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:3001', 'http://localhost:4173'];

app.use(helmet());
app.use(compression());
app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin requests (no Origin header) and explicitly listed origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));

// Default Cache-Control for all GET responses — aligns with React Query staleTime.
// Browser HTTP cache intercepts re-requests within the TTL so Vercel Functions
// aren't invoked unnecessarily (no Fast Origin Transfer billed for cached hits).
// Public endpoints (no auth) override this to 'public, s-maxage=N' in their handlers.
app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=30');
  }
  next();
});

// Wait for DB migration before handling requests
app.use(async (req, res, next) => {
  try { await ensureReady(); next(); }
  catch (err) {
    console.error('DB not ready:', err.message);
    res.status(503).json({ error: 'Database not ready', detail: err.message });
  }
});

// ── API Routes ──
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/organizations', orgsRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/league-config', leagueConfigRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/pitch-rules', pitchRulesRoutes);
app.use('/api/seed', seedRoutes);
app.use('/api/data-manager', dataManagerRoutes);
app.use('/api/import', importRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/officials', officialsRoutes);
app.use('/api/umpires', umpireRoutes);
app.use('/api/registrations', registrationsRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/player-contacts', playerContactsRoutes);
app.use('/api/player-notes', playerNotesRoutes);
app.use('/api/player-documents', playerDocumentsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/travel', travelRoutes);
app.use('/api/bug-report', bugReportRoutes);
app.use('/api/guardian-claims', guardianClaimsRoutes);
app.use('/api/chat', chatRoutes);

// ── Serve React build in local dev only (Vercel serves static files itself) ──
if (!process.env.VERCEL) {
  const distPath = path.join(__dirname, '..', 'dist');
  const publicSitePath = path.join(distPath, 'site');
  if (fs.existsSync(distPath)) {
    // Serve public site at /site (must come before catch-all)
    if (fs.existsSync(publicSitePath)) {
      app.use('/site', express.static(publicSitePath));
      app.get('/site/{*splat}', (req, res) => {
        res.sendFile(path.join(publicSitePath, 'index.html'));
      });
    }
    app.use(express.static(distPath));
    app.get('/{*splat}', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// Only start listener in local dev (Vercel uses the export)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Background sweep for stale live-scoring claims (Vercel uses cron instead)
  setInterval(() => expireStaleScorers().catch(() => {}), 5 * 60 * 1000);
}

module.exports = app;
