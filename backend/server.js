'use strict';

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const db = require('./config/db');

const app = express();
const basePort = parseInt(process.env.PORT, 10);
const preferredPort = Number.isFinite(basePort) && basePort > 0 ? basePort : 3000;

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

app.use('/uploads', express.static(UPLOAD_DIR));

const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');
const paymentRouter = require('./routes/payment');
const uploadRouter = require('./routes/upload');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const siteRouter = require('./routes/site');

/* Mount /api/admin before the generic /api site router so /api/admin/* always reaches the admin API. */
app.use('/api/admin', adminRouter);
app.use('/api', siteRouter);
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/auth', authRouter);

const { getMinOrderAed } = require('./services/orderLines');

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Masaarna Supermarket',
    time: new Date().toISOString(),
    minOrderAed: getMinOrderAed()
  });
});

app.get('/payment/callback', async (req, res) => {
  const orderNumber = req.query.order || req.query.ref;
  const status = String(req.query.status || req.query.orderStatus || '').toUpperCase();
  const fail = ['FAILED', 'DECLINED', 'CANCELLED', 'CANCELED', 'FAILURE'].some((s) => status.includes(s));
  if (fail && orderNumber) {
    return res.redirect(`/checkout.html?error=payment_failed&order=${encodeURIComponent(orderNumber)}`);
  }
  const ok =
    !status ||
    ['CAPTURED', 'AUTHORISED', 'AUTHORIZED', 'SUCCESS', 'PURCHASED', 'PAID', 'COMPLETE'].includes(status);
  try {
    if (orderNumber && ok) {
      await db.runAsync(
        `UPDATE orders SET payment_status = 'paid', status = 'confirmed', updated_at = datetime('now')
         WHERE order_number = ? AND payment_method = 'card'`,
        orderNumber
      );
    }
  } catch (e) {
    console.error(e);
  }
  if (orderNumber) {
    res.redirect(`/order-confirmation.html?order=${encodeURIComponent(orderNumber)}&method=card`);
  } else {
    res.redirect('/checkout.html?error=payment_unknown');
  }
});

const FRONTEND_PATH = path.join(__dirname, '../frontend');

app.get('/admin', (req, res) => res.redirect(302, '/admin.html'));
app.get('/admin-cms.html', (req, res) => res.redirect(301, '/admin.html'));

app.use(express.static(FRONTEND_PATH, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

const server = http.createServer(app);
let listenPort = preferredPort;
const maxPortAttempts = 20;
let portAttempts = 0;
let bootLogged = false;

function startListening() {
  server.once('error', onListenError);
  server.listen(listenPort, () => {
    server.removeListener('error', onListenError);
    if (bootLogged) return;
    bootLogged = true;
    console.log(`\n🌐 http://localhost:${listenPort}  (storefront + /api)`);
    console.log('   SQLite DB is created automatically on first run (no separate DB install).\n');
  });
}

function onListenError(err) {
  if (err.code === 'EADDRINUSE' && portAttempts < maxPortAttempts) {
    portAttempts++;
    const taken = listenPort;
    listenPort++;
    console.warn(
      `Port ${taken} is already in use (another Node app or an old server). Trying ${listenPort}…`
    );
    server.close(() => {
      startListening();
    });
    return;
  }
  console.error('\nCould not start server:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(
      'Hint: close the other program using this port, or set PORT in .env (e.g. PORT=3001).\n'
    );
  }
  process.exit(1);
}

startListening();

app.httpServer = server;
module.exports = app;
