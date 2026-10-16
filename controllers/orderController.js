// Shopfluence – orders
const mongoose = require('mongoose');
const Order = require('../models/Order');
const { STATUSES } = Order;
const Product = require('../models/Product');
const Company = require('../models/Company');
const User = require('../models/User');
const UIConfig = require('../models/UIConfig');
const { ApiError, asyncHandler } = require('../middlewares/errorHandler');

const isId = (v) => mongoose.isValidObjectId(v);
const round2 = (n) => Math.round(n * 100) / 100;
const FLOW = ['pending', 'confirmed', 'shipped', 'delivered']; // forward-only fulfilment
const TERMINAL = ['cancelled', 'refunded'];
const AFFILIATE_SOURCES = ['instagram', 'facebook', 'twitter', 'youtube', 'tiktok', 'direct'];

async function rollbackReservations(reserved) {
  await Promise.all(reserved.map((r) => Product.updateOne({ _id: r.productId }, { $inc: { stockOut: -r.quantity, totalSales: -r.quantity } })));
}

// POST /api/orders {items:[{productId, quantity}], shippingAddress, affiliateCode?}
// Prices always come from the DB. Stock is reserved atomically (rolled back on failure).
// One order is created per company.
exports.create = asyncHandler(async (req, res) => {
  const { items, shippingAddress, affiliateCode, affiliateSource } = req.body || {};
  const errors = [];
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw ApiError.unprocessable('Validation failed', [{ field: 'items', message: 'items must be an array of 1-50 entries' }]);
  }
  if (shippingAddress !== undefined && shippingAddress !== null && (typeof shippingAddress !== 'string' || shippingAddress.length > 500)) {
    errors.push({ field: 'shippingAddress', message: 'shippingAddress must be a string of at most 500 characters' });
  }
  const wanted = new Map();
  items.forEach((it, i) => {
    const qty = Number(it && it.quantity);
    if (!it || !isId(it.productId)) errors.push({ field: `items[${i}].productId`, message: 'Invalid product id' });
    else if (!Number.isInteger(qty) || qty < 1 || qty > 100) errors.push({ field: `items[${i}].quantity`, message: 'quantity must be an integer between 1 and 100' });
    else wanted.set(String(it.productId), (wanted.get(String(it.productId)) || 0) + qty);
  });
  if (errors.length) throw ApiError.unprocessable('Validation failed', errors);

  const products = await Product.find({ _id: { $in: [...wanted.keys()] }, isActive: true });
  if (products.length !== wanted.size) {
    const found = new Set(products.map((p) => String(p._id)));
    const missing = [...wanted.keys()].filter((id) => !found.has(id));
    throw ApiError.notFound('Some products are unavailable', missing.map((id) => ({ field: 'productId', message: `Product ${id} not found or inactive` })));
  }

  // 1) atomically reserve stock
  const reserved = [];
  const lines = []; // { product(fresh doc), quantity }
  try {
    for (const p of products) {
      const quantity = wanted.get(String(p._id));
      // eslint-disable-next-line no-await-in-loop
      const fresh = await Product.findOneAndUpdate(
        { _id: p._id, isActive: true, $expr: { $gte: [{ $subtract: ['$stockIn', '$stockOut'] }, quantity] } },
        { $inc: { stockOut: quantity, totalSales: quantity } },
        { new: true }
      );
      if (!fresh) throw ApiError.conflict(`Not enough stock for "${p.title}"`);
      reserved.push({ productId: p._id, quantity });
      lines.push({ product: fresh, quantity });
    }
  } catch (e) {
    await rollbackReservations(reserved);
    throw e;
  }

  // 2) create one order per company
  const created = [];
  try {
    const companyIds = [...new Set(lines.map((l) => String(l.product.company)))];
    const [companies, ui] = await Promise.all([Company.find({ _id: { $in: companyIds } }), UIConfig.getGlobal()]);
    const companyMap = new Map(companies.map((c) => [String(c._id), c]));
    const globalRate = ui.platformCommission && Number.isFinite(ui.platformCommission.rate) ? ui.platformCommission.rate : 0;

    let salesman = null;
    if (affiliateCode) {
      if (typeof affiliateCode !== 'string' || !User.SAIL_RE.test(affiliateCode.trim().toUpperCase())) {
        throw ApiError.unprocessable('Validation failed', [{ field: 'affiliateCode', message: 'Affiliate code must look like SAIL-XXXXXX' }]);
      }
      salesman = await User.findOne({ uniqueSailorId: affiliateCode.trim().toUpperCase(), role: 'salesman', isHired: true });
    }

    for (const companyId of companyIds) {
      const company = companyMap.get(companyId);
      if (!company) throw ApiError.notFound('Store not found');
      const own = lines.filter((l) => String(l.product.company) === companyId);
      const orderItems = own.map(({ product, quantity }) => ({
        product: product._id, title: product.title, image: product.images[0], category: product.category,
        price: product.effectivePrice(), profitMargin: product.profitMargin, quantity, lineTotal: round2(product.effectivePrice() * quantity),
      }));
      const subtotal = round2(orderItems.reduce((s, i) => s + i.lineTotal, 0));
      // affiliate applies only if the salesman works for the selling company, at that company's rate
      const affiliateApplies = salesman && String(salesman.assignedCompany) === companyId;
      const affRate = affiliateApplies ? company.commissionRate : 0;
      const platRate = company.platformCommissionRate != null ? company.platformCommissionRate : globalRate;
      // eslint-disable-next-line no-await-in-loop
      const order = await Order.create({
        buyer: req.user._id, company: company._id, items: orderItems, subtotal, total: subtotal,
        shippingAddress: shippingAddress ? shippingAddress.trim() : undefined,
        status: 'pending',
        statusHistory: [{ status: 'pending', by: req.user._id, byRole: 'buyer', note: 'Order placed' }],
        affiliateSalesman: affiliateApplies ? salesman._id : null,
        affiliateCode: affiliateApplies ? salesman.uniqueSailorId : undefined,
        affiliateSource: affiliateApplies ? (AFFILIATE_SOURCES.includes(String(affiliateSource || '').toLowerCase()) ? String(affiliateSource).toLowerCase() : 'direct') : undefined,
        affiliateCommissionRate: affRate,
        affiliateCommission: round2((subtotal * affRate) / 100),
        platformCommissionRate: platRate,
        platformCommission: round2((subtotal * platRate) / 100),
      });
      created.push(order);
    }
  } catch (e) {
    await Order.deleteMany({ _id: { $in: created.map((o) => o._id) } });
    await rollbackReservations(reserved);
    throw e;
  }
  res.status(201).json({ orders: created, order: created.length === 1 ? created[0] : undefined, message: 'Order placed on Shopfluence' });
});

// GET /api/orders/mine
exports.mine = asyncHandler(async (req, res) => {
  const filter = { buyer: req.user._id };
  if (req.query.status) {
    if (!STATUSES.includes(req.query.status)) throw ApiError.badRequest('Invalid status filter');
    filter.status = req.query.status;
  }
  const orders = await Order.find(filter).sort({ createdAt: -1 }).populate('company', 'name logo');
  res.json({ orders });
});

// GET /api/orders  (company owner / hired manager – scoped to their company)
exports.listForCompany = asyncHandler(async (req, res) => {
  const filter = { company: req.companyId };
  if (req.query.status) {
    if (!STATUSES.includes(req.query.status)) throw ApiError.badRequest('Invalid status filter');
    filter.status = req.query.status;
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('buyer', 'name email phone').populate('affiliateSalesman', 'name uniqueSailorId'),
    Order.countDocuments(filter),
  ]);
  res.json({ orders, total, page, pages: Math.ceil(total / limit) || 1 });
});

// GET /api/orders/:id (buyer who owns it, company scope, or admin)
exports.getOne = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid order id');
  const order = await Order.findById(req.params.id).populate('company', 'name logo').populate('buyer', 'name email');
  if (!order) throw ApiError.notFound('Order not found');
  const u = req.user;
  const buyerId = order.buyer._id || order.buyer;
  const companyId = order.company._id || order.company;
  const allowed = u.role === 'shopfluence_management'
    || (u.role === 'buyer' && String(buyerId) === String(u._id))
    || (['company', 'manager'].includes(u.role) && String(companyId) === String(req.companyId));
  if (!allowed) throw ApiError.forbidden('You cannot view this order');
  res.json({ order });
});

// PATCH /api/orders/:id/status  {status, note}  (company/manager; forward-only)
exports.updateStatus = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid order id');
  const { status, note } = req.body || {};
  if (!STATUSES.includes(status)) throw ApiError.unprocessable('Validation failed', [{ field: 'status', message: `status must be one of: ${STATUSES.join(', ')}` }]);
  if (TERMINAL.includes(status)) throw ApiError.forbidden('Cancellations and refunds can only be done by Shopfluence Management');
  const order = await Order.findOne({ _id: req.params.id, company: req.companyId });
  if (!order) throw ApiError.notFound('Order not found');
  const idx = FLOW.indexOf(order.status);
  if (idx === -1) throw ApiError.conflict(`Order is ${order.status} – contact Shopfluence Management`);
  if (FLOW[idx + 1] !== status) {
    throw ApiError.conflict(idx === FLOW.length - 1 ? 'Order is already delivered'
      : `Fulfilment is forward-only: ${order.status} can only move to ${FLOW[idx + 1]}`);
  }
  // atomic guard against concurrent updates
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { $set: { status }, $push: { statusHistory: { status, by: req.user._id, byRole: req.user.role, note: typeof note === 'string' ? note.slice(0, 500) : undefined } } },
    { new: true }
  );
  if (!updated) throw ApiError.conflict('Order was updated by someone else – refresh and retry');
  res.json({ order: updated });
});

// POST /api/orders/:id/dispute {reason}  (buyer, once shipped/delivered)
exports.dispute = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid order id');
  const reason = typeof (req.body || {}).reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 5 || reason.length > 500) throw ApiError.unprocessable('Validation failed', [{ field: 'reason', message: 'reason must be 5-500 characters' }]);
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, buyer: req.user._id, status: { $in: ['shipped', 'delivered'] } },
    { $set: { status: 'disputed' }, $push: { statusHistory: { status: 'disputed', by: req.user._id, byRole: 'buyer', note: reason } } },
    { new: true }
  );
  if (!order) throw ApiError.conflict('Only your shipped or delivered orders can be disputed');
  res.json({ order, message: 'Dispute sent to Shopfluence Management' });
});

/**
 * Shopfluence Management override: any status change except out of cancelled/refunded.
 * Cancelling/refunding restores stock and sales exactly once.
 */
exports.adminOverride = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid order id');
  const { status, note } = req.body || {};
  if (!STATUSES.includes(status)) throw ApiError.unprocessable('Validation failed', [{ field: 'status', message: `status must be one of: ${STATUSES.join(', ')}` }]);
  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found');
  if (TERMINAL.includes(order.status)) throw ApiError.conflict(`Order is already ${order.status}`);
  if (order.status === status) throw ApiError.conflict(`Order is already ${status}`);

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { $set: { status }, $push: { statusHistory: { status, by: req.user._id, byRole: req.user.role, note: typeof note === 'string' ? note.slice(0, 500) : 'Shopfluence Management override' } } },
    { new: true }
  );
  if (!updated) throw ApiError.conflict('Order changed concurrently – retry');

  if (TERMINAL.includes(status)) {
    // restore exactly once
    const flag = await Order.findOneAndUpdate({ _id: order._id, stockRestored: false }, { $set: { stockRestored: true } }, { new: true });
    if (flag) {
      await Promise.all(order.items.map((i) => Product.updateOne({ _id: i.product }, { $inc: { stockOut: -i.quantity, totalSales: -i.quantity } })));
      updated.stockRestored = true;
    }
  }
  res.json({ order: updated, message: `Order set to ${status} by Shopfluence Management` });
});

exports.FLOW = FLOW;
