// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const { notFound, errorHandler } = require('./middleware/errorHandler');
const api = require('./routes');
const pool = require('./config/database');

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],

        // Allow fetch/XHR/WebSocket
        connectSrc: [
          "'self'",
          "blob:",
          "https://router.project-osrm.org",
        ],

        // Google Fonts
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],

        // Images / tiles
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://tile.openstreetmap.org",
          "https://*.tile.openstreetmap.org",
          "https://*.basemaps.cartocdn.com",
        ],

        workerSrc: ["'self'", "blob:"],
        childSrc: ["'self'", "blob:"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  })
);

app.use(cors());

// ---- body parsing
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- logs
app.use(morgan('dev'));

// ---- serve uploaded images
app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    setHeaders(res) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

// ---- health checks
app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    res.json({
      ok: true,
      message: '✅ API + DB connection working',
      time: result.rows[0].now,
    });
  } catch (err) {
    console.error('DB health check error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- API
app.use('/api', api);

// ---- 404 + error handlers
app.use(notFound);
app.use(errorHandler);

// ---- Export for Vercel serverless
module.exports = app;

// ---- Start server (only in non-serverless environment)
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}/api`);
  });
}
