// Shopfluence – /api/orders
const router = require('express').Router();
const c = require('../controllers/orderController');
const { protect } = require('../middlewares/auth');
const { authorize, requireHired, attachCompanyScope } = require('../middlewares/rbac');

// attach the company scope only for company/manager callers (buyers and admins pass through)
const optionalScope = (req, res, next) => (['company', 'manager'].includes(req.user.role) ? attachCompanyScope(req, res, next) : next());

router.post('/', protect, authorize('buyer'), c.create);
router.get('/mine', protect, authorize('buyer'), c.mine);
router.get('/', protect, authorize('company', 'manager'), requireHired, attachCompanyScope, c.listForCompany);
router.post('/:id/dispute', protect, authorize('buyer'), c.dispute);
router.patch('/:id/status', protect, authorize('company', 'manager'), requireHired, attachCompanyScope, c.updateStatus);
router.get('/:id', protect, authorize('buyer', 'company', 'manager', 'shopfluence_management'), optionalScope, c.getOne);

module.exports = router;
