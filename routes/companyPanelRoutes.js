// Shopfluence – /api/company (company owner panel)
const router = require('express').Router();
const c = require('../controllers/companyController');
const { protect } = require('../middlewares/auth');
const { authorize, attachCompanyScope } = require('../middlewares/rbac');
const { upload } = require('../middlewares/upload');

router.use(protect, authorize('company'), attachCompanyScope);

router.get('/me', c.me);
router.put('/me', upload.single('logo'), c.updateMe);
router.patch('/hiring', c.setHiring);
router.get('/applications', c.listApplications);
router.put('/applications/:id', c.reviewApplication);
router.get('/applications/:id/cv', c.downloadCv);
router.get('/salesmen', c.listSalesmen);
router.post('/salesmen', c.createSalesman);
router.delete('/salesmen/:id', c.removeSalesman);
router.get('/managers', c.listManagers);
router.post('/managers', c.createManager);
router.delete('/managers/:id', c.removeManager);
router.get('/analytics', c.analytics);

module.exports = router;
