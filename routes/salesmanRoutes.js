// Shopfluence – /api/salesmen (salesman self-service)
const router = require('express').Router();
const c = require('../controllers/managerController');
const affiliate = require('../controllers/affiliateController');
const { protect } = require('../middlewares/auth');
const { authorize, requireHired } = require('../middlewares/rbac');

router.use(protect, authorize('salesman'), requireHired);

router.get('/stats', c.salesmanStats);
router.get('/orders', c.salesmanOrders);
router.get('/products', affiliate.salesmanProducts); // products of the hiring store + promotion stats

module.exports = router;
