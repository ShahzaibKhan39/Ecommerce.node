// Shopfluence – /api/messages (company owner, hired managers and salesmen of one company)
const router = require('express').Router();
const c = require('../controllers/messageController');
const { protect } = require('../middlewares/auth');
const { authorize, requireHired } = require('../middlewares/rbac');

router.use(protect, authorize('company', 'manager', 'salesman'), requireHired);

router.get('/contacts', c.contacts);
router.get('/conversations', c.conversations);
router.post('/conversations', c.start);
router.get('/:conversationId', c.getMessages);
router.post('/:conversationId', c.send);

module.exports = router;
