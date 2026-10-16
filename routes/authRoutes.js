// Shopfluence – /api/auth
const router = require('express').Router();
const c = require('../controllers/authController');
const { protect, optionalAuth } = require('../middlewares/auth');

router.post('/register', c.register);
router.post('/login', c.login);
router.post('/logout', c.logout);
router.get('/me', optionalAuth, c.me);
router.post('/change-password', protect, c.changePassword);

module.exports = router;
