require('dotenv').config();
const express = require('express');
const mongoose = require('./mockMongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import routes
const profileRoutes = require('./routes/api/profile');
const chatRoutes = require('./routes/api/chat');
const diagnosisRoutes = require('./routes/api/diagnosis');
const settingsRoutes = require('./routes/api/settings');
const translateRoutes = require('./routes/api/translate');
const adviceRoutes = require('./routes/api/advice');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ─── Security Middleware ────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https://api.infermedica.com", "https://generativelanguage.googleapis.com", "https://api.sarvam.ai"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ─── Rate Limiting ─────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: isProd ? 60 : 1000,   // 60 req/min in prod, unlimited in dev
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});

// Stricter limiter for AI endpoints (Gemini costs money)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI advice rate limit reached. Please wait a moment.' }
});

// ─── Core Middleware ───────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use('/api/', (req, res, next) => {
  if (!isProd) console.log(`📡 ${req.method} ${req.originalUrl}`);
  next();
});

// Cache control — static assets can cache, API never caches
app.use('/api/', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Serve static files with proper caching in production
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProd ? '1d' : 0,
  etag: true
}));

// ─── API Routes ───────────────────────────────────────────
app.use('/api/', apiLimiter);
app.use('/api/profile', profileRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/diagnosis', diagnosisRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/advice', aiLimiter, adviceRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    env: process.env.NODE_ENV || 'development'
  });
});

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error Handling ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(err.status || 500).json({
    error: isProd ? 'Internal server error' : err.message,
    ...(!isProd && { stack: err.stack })
  });
});

// ─── Database & Server Startup ────────────────────────────
async function startServer() {
  try {
    await mongoose.connect();
    console.log('✅ Connected to local JSON database');

    const User = require('./models/User');
    const Settings = require('./models/Settings');
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      const defaultUser = await User.create({
        name: 'Arjun Sharma',
        email: 'arjun@bharathealth.app',
        age: 28,
        bloodType: 'O+',
        weight: 72,
        height: 175,
        allergies: ['Penicillin', 'Peanuts'],
        conditions: ['Mild Asthma'],
        emergencyContact: {
          name: 'Priya Sharma',
          phone: '+91 98765 43210',
          relation: 'Spouse'
        }
      });
      await Settings.create({ userId: defaultUser._id });
      console.log('🌱 Seeded default user and settings');
    }

    app.listen(PORT, () => {
      console.log(`\n🏥 ═══════════════════════════════════════════════`);
      console.log(`   Bharat Health Server running in ${process.env.NODE_ENV || 'development'} mode`);
      console.log(`   URL: http://localhost:${PORT}`);
      console.log(`   API: http://localhost:${PORT}/api/health`);
      console.log(`🏥 ═══════════════════════════════════════════════\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();
