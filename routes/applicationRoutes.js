// Shopfluence – /api/applications (applicant side)
const router = require('express').Router();
const c = require('../controllers/applicationController');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/rbac');
const { uploadCv } = require('../middlewares/upload');

router.use(protect, authorize('manager', 'salesman'));
router.post('/apply', uploadCv.single('cv'), c.apply);
router.get('/mine', c.mine);

module.exports = router;
