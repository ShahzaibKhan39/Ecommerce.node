// Shopfluence – manager and salesman panels
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const { ApiError, asyncHandler } = require('../middlewares/errorHandler');
const { companyAnalytics, salesmanStats } = require('../utils/analytics');
const { releaseStaff, createStaffMember } = require('./staffHelpers');

// POST /api/managers/create-salesman {name, email, phone?, password?}
// Salesmen are added directly (no interview). Returns one-time credentials; the salesman must change the password at first login.
exports.createSalesman = asyncHandler(async (req, res) => {
  const { user, credentials } = await createStaffMember({
    role: 'salesman', body: req.body, companyId: req.user.assignedCompany, managerId: req.user._id, createdBy: req.user._id,
  });
  res.status(201).json({ salesman: user.toPublic(), credentials });
});

// GET /api/managers/salesmen
exports.listSalesmen = asyncHandler(async (req, res) => {
  const filter = { role: 'salesman', assignedCompany: req.user.assignedCompany, isHired: true };
  if (req.query.mine === 'true') filter.assignedManager = req.user._id;
  const users = await User.find(filter).sort({ createdAt: -1 });
  res.json({ salesmen: users.map((u) => u.toPublic()) });
});

// DELETE /api/managers/salesmen/:id  (releases a salesman of the manager's own company)
exports.removeSalesman = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw ApiError.badRequest('Invalid salesman id');
  const s = await User.findOne({ _id: req.params.id, role: 'salesman', assignedCompany: req.user.assignedCompany });
  if (!s) throw ApiError.notFound('Salesman not found in your store');
  await releaseStaff(s);
  res.json({ message: 'Salesman removed from the store', salesman: s.toPublic() });
});

// GET /api/managers/analytics
exports.analytics = asyncHandler(async (req, res) => {
  res.json({ analytics: await companyAnalytics(req.user.assignedCompany) });
});

// ---------- salesman ----------
// GET /api/salesmen/stats
exports.salesmanStats = asyncHandler(async (req, res) => {
  const stats = await salesmanStats(req.user._id);
  res.json({ uniqueSailorId: req.user.uniqueSailorId, stats });
});

// GET /api/salesmen/orders  (orders placed with this salesman's affiliate code)
exports.salesmanOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ affiliateSalesman: req.user._id }).sort({ createdAt: -1 }).limit(100).select('-buyer');
  res.json({ orders });
});
