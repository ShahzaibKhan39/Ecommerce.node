// Shopfluence – /api/support (buyers, companies, managers, salesmen)
const router = require('express').Router();
const c = require('../controllers/supportController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/rbac');

router.use(protect, authorize('buyer', 'company', 'manager', 'salesman'));
router.post('/', c.create);
router.get('/mine', c.mine);
router.get('/:id', c.getMine);
router.post('/:id/reply', c.replyMine);

module.exports = router;
