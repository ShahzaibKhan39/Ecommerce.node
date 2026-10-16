// Shopfluence – /api/products
const router = require('express').Router();
const c = require('../controllers/productController');
const { protect } = require('../middlewares/auth');
const { authorize, requireHired, attachCompanyScope } = require('../middlewares/rbac');
const { upload } = require('../middlewares/upload');

// public catalogue
router.get('/', c.list); // ?q=&category=&company=&minPrice=&maxPrice=&sort=&page=&limit=

// company owner + hired manager (guard order: protect -> authorize -> requireHired -> attachCompanyScope)
const manage = [protect, authorize('company', 'manager'), requireHired, attachCompanyScope];
router.get('/manage/mine', ...manage, c.listMine);
router.post('/', ...manage, upload.array('images', 6), c.create);
router.put('/:id', ...manage, upload.array('images', 6), c.update);
router.patch('/:id/stock', ...manage, c.addStock);
router.patch('/:id/active', ...manage, c.setActive);
router.delete('/:id', ...manage, c.deactivate);

router.get('/:id', c.getOne);

module.exports = router;
