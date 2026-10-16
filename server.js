// Shopfluence – API server
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // images are served to the frontend origin
app.use(cors({
  origin(origin, cb) {
    if (!origin || env.CLIENT_URLS.includes(origin)) return cb(null, true);
    // In development also allow phones / tablets / other PCs opening the site through the machine's LAN address.
    if (!env.isProd && /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later' },
});

app.use('/api/auth', authLimiter, require('./routes/authRoutes'));
app.use('/api/companies', require('./routes/companyRoutes'));
app.use('/api/company', require('./routes/companyPanelRoutes'));
app.use('/api/applications', require('./routes/applicationRoutes'));
app.use('/api/managers', require('./routes/managerRoutes'));
app.use('/api/salesmen', require('./routes/salesmanRoutes'));
app.use('/api/affiliate', require('./routes/affiliateRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/shopfluence', require('./routes/shopfluenceRoutes'));
app.use('/api/favourites', require('./routes/favouriteRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/support', require('./routes/supportRoutes'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'Shopfluence API', time: new Date().toISOString() }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d', index: false }));
app.use('/placeholders', express.static(path.join(__dirname, 'public', 'placeholders'), { maxAge: '1d', index: false }));

app.use(notFound);
app.use(errorHandler);

/** One-time: installs created before the new storefront design still store the old default card variant. */
async function migrateStorefrontDesign() {
  const UIConfig = require('./models/UIConfig');
  await UIConfig.updateOne(
    { key: 'global', 'storefront.cardVariant': 'vertical', 'storefront.designVersion': { $exists: false } },
    { $set: { 'storefront.cardVariant': 'banner', 'storefront.designVersion': 2 } }
  );
}

async function start() {
  await connectDB();
  await migrateStorefrontDesign().catch((e) => console.warn('[Shopfluence] storefront migration skipped:', e.message));
  app.listen(env.PORT, () => console.log(`[Shopfluence] API listening on port ${env.PORT} (${env.NODE_ENV})`));
}

if (require.main === module) {
  start().catch((err) => {
    console.error('[Shopfluence] Failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = app;
