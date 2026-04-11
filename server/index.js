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
const gamesRoutes = require('./routes/games');
const pitchRulesRoutes = require('./routes/pitch-rules');
const seedRoutes = require('./routes/seed');
const dataManagerRoutes = require('./routes/data-manager');
const importRoutes = require('./routes/import');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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

// ── Serve React build in local dev only (Vercel serves static files itself) ──
if (!process.env.VERCEL) {
  const distPath = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distPath)) {
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
}

module.exports = app;
