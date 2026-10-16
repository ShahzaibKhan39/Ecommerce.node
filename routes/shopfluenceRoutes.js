// Shopfluence – /api/shopfluence (Shopfluence Management)
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/shopfluenceController');
const orders = require('../controllers/orderController');
const support = require('../controllers/supportController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/rbac');
const { upload } = require('../middlewares/upload');

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many changes, please slow down' },
});
const admin = [protect, authorize('shopfluence_management')];

// public storefront config
router.get('/ui-config', c.getUiConfig);
router.get('/ui-config/presets', c.getPresets);

// admin: design control (all writes are rate limited)
router.put('/ui-config', ...admin, writeLimiter, upload.array('heroImages', 8), c.updateUiConfig);
router.post('/ui-config/reset', ...admin, writeLimiter, c.resetUiConfig);

// admin: commission
router.get('/commission', ...admin, c.getCommission);
router.put('/commission', ...admin, writeLimiter, c.setCommission);

// admin: orders (override restores stock on cancel/refund)
router.get('/orders', ...admin, c.listOrders);
router.patch('/orders/:id/override', ...admin, writeLimiter, orders.adminOverride);

// admin: support portal
router.get('/support', ...admin, support.adminList);
router.get('/support/:id', ...admin, support.adminGet);
router.post('/support/:id/reply', ...admin, writeLimiter, support.adminReply);
router.patch('/support/:id', ...admin, writeLimiter, support.adminUpdate);

router.get('/overview', ...admin, c.overview);
router.get('/users', ...admin, c.listUsers);

// admin: delete a company (cascades; see controller)
router.delete('/companies/:id', ...admin, writeLimiter, c.deleteCompany);

module.exports = router;
