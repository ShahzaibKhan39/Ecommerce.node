// Shopfluence – /api/companies (public directory + ratings)
const router = require('express').Router();
const c = require('../controllers/companyController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/rbac');

router.get('/', c.list);                       // ?hiring=true&sort=rating&q=name
router.get('/:id', c.getOne);
router.get('/:id/reviews', c.reviews);
router.post('/:id/rate', protect, authorize('buyer'), c.rate);

module.exports = router;
