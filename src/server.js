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
const AppError = require('./utils/AppError');

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
   SECURITY
───────────────────────────────────────────── */
app.use(
  helmet({
    contentSecurityPolicy: false, // IMPORTANT for Vite React build
  })
);

app.use(mongoSanitize());
app.set('trust proxy', 1);

/* ─────────────────────────────────────────────
   RATE LIMITING
───────────────────────────────────────────── */
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
});

app.use('/api/', limiter);
app.use('/api/public/', apiLimiter);

/* ─────────────────────────────────────────────
   CORS (DEV ONLY)
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
   FRONTEND BUILD PATH (FIXED)
───────────────────────────────────────────── */
const frontendDistPath = path.join(__dirname, 'frontend', 'dist');
const indexPath = path.join(frontendDistPath, 'index.html');

if (fs.existsSync(indexPath)) {
  console.log('Serving frontend from:', frontendDistPath);

  /* STEP 1: serve static files correctly */
  app.use(
    express.static(frontendDistPath, {
      maxAge: '1d',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
          res.setHeader('Content-Type', 'text/javascript');
        }
        if (filePath.endsWith('.css')) {
          res.setHeader('Content-Type', 'text/css');
        }
      },
    })
  );

  /* STEP 2: SPA fallback */
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
// 1. API routes FIRST
app.use('/api/v1', routes);

// 2. STATIC frontend
app.use(express.static(frontendDistPath));

// 3. SPA fallback LAST (CRITICAL)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).end();

  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

/* ─────────────────────────────────────────────
   ERROR HANDLER
───────────────────────────────────────────── */
app.use(errorHandler);

/* ─────────────────────────────────────────────
   START SERVER
───────────────────────────────────────────── */
const PORT = process.env.PORT || 5001;

const start = async () => {
  await connectDB();
  await ensureSuperAdmin();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Frontend: http://localhost:${PORT}`);
  });
};

start();

module.exports = app;