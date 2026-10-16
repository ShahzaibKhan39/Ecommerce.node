// Shopfluence – environment configuration
require('dotenv').config();

const required = ['MONGO_URI', 'JWT_SECRET'];

function loadEnv({ strict = true } = {}) {
  const missing = required.filter((k) => !process.env[k]);
  if (strict && missing.length) {
    throw new Error(`Shopfluence: missing required env var(s): ${missing.join(', ')}`);
  }
  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    isProd: process.env.NODE_ENV === 'production',
    PORT: parseInt(process.env.PORT, 10) || 5000,
    MONGO_URI: process.env.MONGO_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES: process.env.JWT_EXPIRES || '7d',
    CLIENT_URLS: (process.env.CLIENT_URL || 'http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    DEFAULT_COMMISSION_RATE: Number.isFinite(parseFloat(process.env.DEFAULT_COMMISSION_RATE))
      ? parseFloat(process.env.DEFAULT_COMMISSION_RATE)
      : 5,
    SHOPFLUENCE_ADMIN_NAME: process.env.SHOPFLUENCE_ADMIN_NAME || 'Shopfluence Management',
    SHOPFLUENCE_ADMIN_EMAIL: process.env.SHOPFLUENCE_ADMIN_EMAIL,
    SHOPFLUENCE_ADMIN_PASSWORD: process.env.SHOPFLUENCE_ADMIN_PASSWORD,
  };
}

module.exports = loadEnv();
module.exports.loadEnv = loadEnv;
