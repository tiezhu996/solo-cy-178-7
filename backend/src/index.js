const express = require('express');
const cors = require('cors');
const { PORTS, ROUTES } = require('./config/constants');
const authRoutes = require('./routes/authRoutes');
const letterRoutes = require('./routes/letterRoutes');
const inboxRoutes = require('./routes/inboxRoutes');
const { startScheduler } = require('./services/scheduler');
const { startDatabasePlaceholder } = require('./data/dbPort');

require('./data/database');

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(ROUTES.AUTH, authRoutes);
app.use(ROUTES.LETTERS, letterRoutes);
app.use(ROUTES.INBOX, inboxRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: '服务器开了个小差' });
});

startDatabasePlaceholder();
startScheduler();

// PORT=0 lets the OS assign a free port (used by the regression tests so
// repeated/parallel runs never collide); production keeps its fixed port.
const server = app.listen(PORTS.BACKEND, '0.0.0.0', () => {
  console.log(`[backend] listening on 0.0.0.0:${server.address().port}`);
});