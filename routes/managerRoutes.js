// Shopfluence – /api/managers
const router = require('express').Router();
const c = require('../controllers/managerController');
const { protect } = require('../middlewares/auth');
const { authorize, requireHired } = require('../middlewares/rbac');

router.use(protect, authorize('manager'), requireHired);

router.post('/create-salesman', c.createSalesman);
router.get('/salesmen', c.listSalesmen);
router.delete('/salesmen/:id', c.removeSalesman);
router.get('/analytics', c.analytics);

module.exports = router;
