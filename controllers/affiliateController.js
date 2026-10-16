// Shopfluence – affiliate promotion: click tracking (public) + the salesman's store-products dashboard
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Company = require('../models/Company');
const Order = require('../models/Order');
const AffiliateClick = require('../models/AffiliateClick');
const { SOURCES } = AffiliateClick;
const { ApiError, asyncHandler } = require('../middlewares/errorHandler');

const isId = (v) => mongoose.isValidObjectId(v);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const normSource = (s) => (SOURCES.includes(String(s || '').toLowerCase()) ? String(s).toLowerCase() : 'direct');

// POST /api/affiliate/click { code, productId?, source? }   (public, rate limited in the route)
// Always answers 204 so the endpoint cannot be used to probe which codes exist.
exports.trackClick = asyncHandler(async (req, res) => {
  const { code, productId, source } = req.body || {};
  if (typeof code === 'string' && User.SAIL_RE.test(code.trim().toUpperCase())) {
    const salesman = await User.findOne({ uniqueSailorId: code.trim().toUpperCase(), role: 'salesman', isHired: true }).select('_id assignedCompany');
    if (salesman && salesman.assignedCompany) {
      let product = null;
      if (productId && isId(productId)) {
        const p = await Product.findOne({ _id: productId, company: salesman.assignedCompany }).select('_id');
        product = p ? p._id : null;
      }
      await AffiliateClick.create({ salesman: salesman._id, company: salesman.assignedCompany, product, source: normSource(source) });
    }
  }
  res.status(204).end();
});

// GET /api/salesmen/products  (hired salesman: the products of the store that hired them + promotion stats)
exports.salesmanProducts = asyncHandler(async (req, res) => {
  const me = req.user;
  const company = await Company.findById(me.assignedCompany).select('name logo commissionRate rating');
  if (!company) throw ApiError.notFound('Your store could not be found');

  const [products, clickRows, orderRows] = await Promise.all([
    Product.find({ company: company._id, isActive: true }).sort({ createdAt: -1 }),
    AffiliateClick.aggregate([
      { $match: { salesman: me._id } },
      { $group: { _id: { product: '$product', source: '$source' }, clicks: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { affiliateSalesman: me._id, status: { $nin: ['cancelled', 'refunded'] } } },
      { $group: { _id: '$affiliateSource', orders: { $sum: 1 }, commission: { $sum: '$affiliateCommission' } } },
    ]),
  ]);

  const bySource = {};
  SOURCES.forEach((s) => { bySource[s] = { clicks: 0, orders: 0, commission: 0 }; });
  const clicksByProduct = new Map();
  clickRows.forEach((r) => {
    const s = normSource(r._id.source);
    bySource[s].clicks += r.clicks;
    const key = r._id.product ? String(r._id.product) : null;
    if (key) clicksByProduct.set(key, (clicksByProduct.get(key) || 0) + r.clicks);
  });
  orderRows.forEach((r) => {
    const s = normSource(r._id);
    bySource[s].orders += r.orders;
    bySource[s].commission = round2(bySource[s].commission + r.commission);
  });

  const rate = company.commissionRate || 0;
  res.json({
    code: me.uniqueSailorId,
    company: { id: String(company._id), name: company.name, logo: company.logo, commissionRate: rate, rating: company.rating },
    products: products.map((p) => ({
      id: String(p._id),
      title: p.title,
      description: p.description,
      category: p.category,
      price: p.price,
      images: p.images,
      stockLeft: p.stockLeft,
      commissionPerSale: round2((p.price * rate) / 100),
      clicks: clicksByProduct.get(String(p._id)) || 0,
    })),
    totals: {
      clicks: Object.values(bySource).reduce((n, v) => n + v.clicks, 0),
      bySource,
    },
  });
});
