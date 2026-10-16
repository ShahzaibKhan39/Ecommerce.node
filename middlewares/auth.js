// Shopfluence – authentication (JWT in httpOnly cookie `token`, Bearer fallback)
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const { ApiError, asyncHandler } = require('./errorHandler');

const COOKIE_NAME = 'token';

function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES });
}

function cookieOptions() {
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  // The frontend (e.g. Vercel) and API (e.g. Render) are on different sites, so the cookie must be
  // Secure + SameSite=None or the browser silently drops it. Treat any https client origin as cross-site.
  const crossSite = env.isProd || env.CLIENT_URLS.some((u) => u.startsWith('https://'));
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? 'none' : 'lax',
    maxAge: sevenDays,
    path: '/',
  };
}

function setAuthCookie(res, userId) {
  const token = signToken(userId);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  return token;
}

function clearAuthCookie(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE_NAME, opts);
}

function extractToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

/** protect: loads the user from the JWT */
const protect = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Not authenticated – please log in');
  const decoded = jwt.verify(token, env.JWT_SECRET);
  const user = await User.findById(decoded.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (user.isBlocked) throw ApiError.forbidden('This account has been suspended');
  req.user = user;
  next();
});

/** optionalAuth: like protect but a guest gets req.user = null instead of a 401 (keeps the console clean) */
const optionalAuth = asyncHandler(async (req, res, next) => {
  req.user = null;
  const token = extractToken(req);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(decoded.sub);
    if (user && !user.isBlocked) req.user = user;
  } catch (_) { /* invalid / expired token => guest */ }
  next();
});

module.exports = { optionalAuth, protect, signToken, setAuthCookie, clearAuthCookie, COOKIE_NAME };
