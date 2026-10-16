// Shopfluence – /api/affiliate (public click tracking for salesman links)
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/affiliateController');

const limiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests' } });

router.post('/click', limiter, c.trackClick);

module.exports = router;
