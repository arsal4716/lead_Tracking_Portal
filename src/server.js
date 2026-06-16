'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const connectDB = require('./config/db');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const User = require('./models/User');
const { ROLES } = require('./models/User');

const app = express();

/* ─────────────────────────────────────────────
   SUPER ADMIN SEED
───────────────────────────────────────────── */
const ensureSuperAdmin = async () => {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('SUPER_ADMIN credentials not set');
    return;
  }

  const exists = await User.findOne({ role: ROLES.SUPER_ADMIN });
  if (exists) return;

  await User.create({
    name: 'Super Admin',
    email,
    password,
    role: ROLES.SUPER_ADMIN,
  });

  console.log('Super Admin created');
};

/* ─────────────────────────────────────────────
   SECURITY (FIXED FOR IP / HTTP)
───────────────────────────────────────────── */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
  })
);

// Remove problematic headers for HTTP/IP setups
app.use((req, res, next) => {
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.removeHeader('Origin-Agent-Cluster');
  next();
});

app.use(mongoSanitize());
app.set('trust proxy', 1);

/* ─────────────────────────────────────────────
   RATE LIMITING
───────────────────────────────────────────── */
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
});

app.use('/api/', limiter);
app.use('/api/public/', apiLimiter);

/* ─────────────────────────────────────────────
   CORS (ONLY DEV OR CROSS CLIENT USE)
───────────────────────────────────────────── */
const isDev = process.env.NODE_ENV === 'development';

if (isDev) {
  app.use(
    cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    })
  );
}

/* ─────────────────────────────────────────────
   BODY + LOGGING
───────────────────────────────────────────── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(isDev ? 'dev' : 'combined'));
}

/* ─────────────────────────────────────────────
   HEALTH CHECK
───────────────────────────────────────────── */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
  });
});

/* ─────────────────────────────────────────────
   API ROUTES
───────────────────────────────────────────── */
app.use('/api/v1', routes);

/* ─────────────────────────────────────────────
   CALL-TRACKING WEBHOOK (PATH-STYLE)
   Some providers (CallGrid) fire the pixel as:
     /callTimeStamp=<ms>&publisherName=<x>&callerId=<y>
   i.e. the params are baked into the PATH with no "?" separator.
   Parse them out and hand off to the normal call ingest handler.
───────────────────────────────────────────── */
const querystring = require('querystring');
const callController = require('./controllers/call.controller');
app.get(/^\/callTimeStamp=/, (req, res, next) => {
  const raw = req.originalUrl.replace(/^\/+/, '');
  req.rawCallParams = querystring.parse(raw);
  return callController.ingestCall(req, res, next);
});

/* ─────────────────────────────────────────────
   FRONTEND BUILD (CLEAN + SINGLE SOURCE)
───────────────────────────────────────────── */
const frontendDistPath = path.join(__dirname, 'frontend', 'dist');
const indexPath = path.join(frontendDistPath, 'index.html');

if (fs.existsSync(indexPath)) {
  console.log('Serving frontend from:', frontendDistPath);

  // Serve static assets
  app.use(
    express.static(frontendDistPath, {
      maxAge: '1d',
    })
  );

  // SPA fallback (IMPORTANT)
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).end();
    res.sendFile(indexPath);
  });
} else {
  console.log('Frontend not built!');
  console.log('Expected:', indexPath);
}

/* ─────────────────────────────────────────────
   API 404 HANDLER
───────────────────────────────────────────── */
app.all('/api/*', (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: 'API route not found',
  });
});

/* ─────────────────────────────────────────────
   GLOBAL ERROR HANDLER
───────────────────────────────────────────── */
app.use(errorHandler);

/* ─────────────────────────────────────────────
   START SERVER
───────────────────────────────────────────── */
const PORT = process.env.PORT || 7001;

const start = async () => {
  await connectDB();
  await ensureSuperAdmin();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API: http://0.0.0.0:${PORT}/api/v1`);
    console.log(`Frontend: http://0.0.0.0:${PORT}`);
  });
};

start();

module.exports = app;