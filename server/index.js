const express      = require('express');
const cors         = require('cors');
const path         = require('path');

const accountsRouter     = require('./routes/accounts');
const transactionsRouter = require('./routes/transactions');
const categoriesRouter   = require('./routes/categories');

const app  = express();
const PORT = process.env.PORT || 4000;

/* ---- Middleware ---- */
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

app.use(express.json());

/* ---- Simple API key auth ---- */
const API_KEY = process.env.API_KEY;
app.use('/api', (req, res, next) => {
  if (!API_KEY) return next(); // no key set → open (dev only)
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

/* ---- Routes ---- */
app.use('/api/accounts',     accountsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/categories',   categoriesRouter);

/* ---- Health check ---- */
app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

/* ---- Serve static frontend in production ---- */
if (process.env.SERVE_FRONTEND === 'true') {
  const frontendPath = path.join(__dirname, '..');
  app.use(express.static(frontendPath));
  app.get('*', (_, res) => res.sendFile(path.join(frontendPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`FinTrack server running on port ${PORT}`);
});
