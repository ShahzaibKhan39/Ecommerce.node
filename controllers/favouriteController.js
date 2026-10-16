// Shopfluence – favourites
const mongoose = require('mongoose');
const Favourite = require('../models/Favourite');
const Company = require('../models/Company');
const Product = require('../models/Product');
const User = require('../models/User');
const { ApiError, asyncHandler } = require('../middlewares/errorHandler');

const TYPES = ['company', 'salesman', 'product'];

async function targetExists(type, id) {
  if (type === 'company') return !!(await Company.exists({ _id: id }));
  if (type === 'product') return !!(await Product.exists({ _id: id, isActive: true }));
  return !!(await User.exists({ _id: id, role: 'salesman', isHired: true }));
}

// POST /api/favourites/toggle {targetType, targetId}
exports.toggle = asyncHandler(async (req, res) => {
  const { targetType, targetId } = req.body || {};
  if (!TYPES.includes(targetType)) throw ApiError.unprocessable('Validation failed', [{ field: 'targetType', message: `targetType must be one of: ${TYPES.join(', ')}` }]);
  if (!mongoose.isValidObjectId(targetId)) throw ApiError.unprocessable('Validation failed', [{ field: 'targetId', message: 'A valid targetId is required' }]);

  const removed = await Favourite.findOneAndDelete({ user: req.user._id, targetType, targetId });
  if (removed) return res.json({ favourited: false, targetType, targetId });

  if (!(await targetExists(targetType, targetId))) throw ApiError.notFound(`${targetType} not found`);
  try {
    await Favourite.create({ user: req.user._id, targetType, targetId });
  } catch (e) {
    if (e.code !== 11000) throw e; // a concurrent toggle already created it
  }
  res.status(201).json({ favourited: true, targetType, targetId });
});

// GET /api/favourites/mine
exports.mine = asyncHandler(async (req, res) => {
  const favs = await Favourite.find({ user: req.user._id }).sort({ createdAt: -1 });
  const ids = (t) => favs.filter((f) => f.targetType === t).map((f) => f.targetId);
  const [companies, products, salesmen] = await Promise.all([
    Company.find({ _id: { $in: ids('company') } }),
    Product.find({ _id: { $in: ids('product') } }).populate('company', 'name logo rating ratingCount'),
    User.find({ _id: { $in: ids('salesman') }, role: 'salesman' }).populate('assignedCompany', 'name'),
  ]);
  const out = {
    companies: companies.map((c) => ({ id: String(c._id), name: c.name, description: c.description, logo: c.logo, rating: c.rating, ratingCount: c.ratingCount, isHiring: c.isHiring })),
    products: products.map((p) => { const o = p.toPublic(); return o; }),
    salesmen: salesmen.map((s) => ({ id: String(s._id), name: s.name, uniqueSailorId: s.uniqueSailorId, isHired: s.isHired, company: s.assignedCompany ? { id: String(s.assignedCompany._id), name: s.assignedCompany.name } : null })),
  };
  res.json({
    favourites: favs.map((f) => ({ id: String(f._id), targetType: f.targetType, targetId: String(f.targetId), createdAt: f.createdAt })),
    ...out,
  });
});
