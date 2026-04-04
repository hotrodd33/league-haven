const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Initialize DB (runs migration)
const { ready } = require('./db');

const authRoutes = require('./routes/auth');
const teamsRoutes = require('./routes/teams');
const positionsRoutes = require('./routes/positions');
const playersRoutes = require('./routes/players');
const staffRoutes = require('./routes/staff');
const orgsRoutes = require('./routes/organizations');
const locationsRoutes = require('./routes/locations');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Wait for DB migration before handling requests
app.use(async (req, res, next) => {
  try { await ready; next(); }
  catch (err) { res.status(503).json({ error: 'Database not ready' }); }
});

// ── API Routes ──
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/organizations', orgsRoutes);
app.use('/api/locations', locationsRoutes);

// ── Serve React build in production ──
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Only start listener in local dev (Vercel uses the export)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;

module.exports = app;
