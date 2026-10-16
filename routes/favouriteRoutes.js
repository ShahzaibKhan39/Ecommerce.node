// Shopfluence – /api/favourites
const router = require('express').Router();
const c = require('../controllers/favouriteController');
const { protect } = require('../middlewares/auth');

router.use(protect);
router.post('/toggle', c.toggle);
router.get('/mine', c.mine);

module.exports = router;
