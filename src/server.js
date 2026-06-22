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
const { initCallQueue } = require('./queue/callQueue');

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

app.set('trust proxy', 1);

// Body parsing MUST run before rate limiting (auth limiter keys on req.body.email)
// and before mongoSanitize (which sanitizes the parsed body).
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());

/* ─────────────────────────────────────────────
   RATE LIMITING
   Keyed by authenticated user (Bearer token) when present, else by IP — so a
   whole call center behind ONE shared NAT IP does not share a single budget
   (which previously locked everyone out for minutes once 100 reqs were hit).
───────────────────────────────────────────── */
const keyByUserOrIp = (req /*, res */) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return `tok:${auth.slice(7)}`;
  return `ip:${req.ip || 'unknown'}`;
};

// General authenticated API traffic — generous, per-minute, per-user.
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 600, // per user/IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  // Public ingestion + health have their own handling.
  skip: (req) => {
    const u = req.originalUrl || '';
    return u === '/health' || u.startsWith('/api/v1/public');
  },
});

// Public lead ingestion — high throughput so 100+ concurrent posts aren't blocked.
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      parseInt(process.env.PUBLIC_RATE_LIMIT_MAX) || 2000, // per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
});

// Brute-force protection on auth — counts only FAILED attempts, keyed by IP+email
// so a shared office IP can't be locked out by one bad actor.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `auth:${req.ip}:${(req.body && req.body.email) || ''}`,
});

app.use('/api/v1/public', publicLimiter);
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/', apiLimiter);

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
   LOGGING
───────────────────────────────────────────── */
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
app.all(/^\/callTimeStamp=/, (req, res, next) => {
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
  initCallQueue();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API: http://0.0.0.0:${PORT}/api/v1`);
    console.log(`Frontend: http://0.0.0.0:${PORT}`);
  });
};

start();

module.exports = app;