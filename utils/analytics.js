// Shopfluence – analytics helpers (company/manager scope and salesman stats)
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { STATUSES } = require('../models/Order');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const INVALID = ['cancelled', 'refunded']; // excluded from revenue
const LOW_STOCK = 5;
const round2 = (n) => Math.round((n || 0) * 100) / 100;

function lastNDays(n) {
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

async function statusCounts(match) {
  const rows = await Order.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
  const out = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  rows.forEach((r) => { out[r._id] = r.count; });
  return out;
}

async function companyAnalytics(companyId) {
  const company = oid(companyId);
  const valid = { company, status: { $nin: INVALID } };
  const since = new Date(Date.now() - 29 * 24 * 3600 * 1000);
  since.setUTCHours(0, 0, 0, 0);

  const [totalsRows, dayRows, perProductRows, affiliateRows, bySalesmanRows, byStatus, products] = await Promise.all([
    Order.aggregate([
      { $match: valid },
      { $unwind: '$items' },
      { $group: {
        _id: '$_id', total: { $first: '$total' }, units: { $sum: '$items.quantity' },
        profit: { $sum: { $multiply: ['$items.lineTotal', { $divide: ['$items.profitMargin', 100] }] } },
        affiliateCommission: { $first: '$affiliateCommission' }, platformCommission: { $first: '$platformCommission' },
      } },
      { $group: {
        _id: null, orders: { $sum: 1 }, revenue: { $sum: '$total' }, units: { $sum: '$units' }, grossProfit: { $sum: '$profit' },
        affiliateCommission: { $sum: '$affiliateCommission' }, platformCommission: { $sum: '$platformCommission' },
      } },
    ]),
    Order.aggregate([
      { $match: { ...valid, createdAt: { $gte: since } } },
      { $unwind: '$items' },
      { $group: {
        _id: { id: '$_id', day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } } },
        total: { $first: '$total' }, units: { $sum: '$items.quantity' },
      } },
      { $group: { _id: '$_id.day', revenue: { $sum: '$total' }, orders: { $sum: 1 }, units: { $sum: '$units' } } },
    ]),
    Order.aggregate([
      { $match: valid },
      { $unwind: '$items' },
      { $group: {
        _id: '$items.product', units: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' },
        profit: { $sum: { $multiply: ['$items.lineTotal', { $divide: ['$items.profitMargin', 100] }] } },
      } },
    ]),
    Order.aggregate([
      { $match: { ...valid, affiliateSalesman: { $ne: null } } },
      { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$total' }, commission: { $sum: '$affiliateCommission' } } },
    ]),
    Order.aggregate([
      { $match: { ...valid, affiliateSalesman: { $ne: null } } },
      { $group: { _id: '$affiliateSalesman', orders: { $sum: 1 }, revenue: { $sum: '$total' }, commission: { $sum: '$affiliateCommission' } } },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
      { $project: { _id: 0, salesmanId: '$_id', name: { $arrayElemAt: ['$u.name', 0] }, uniqueSailorId: { $arrayElemAt: ['$u.uniqueSailorId', 0] }, orders: 1, revenue: 1, commission: 1 } },
    ]),
    statusCounts({ company }),
    Product.find({ company }).sort({ createdAt: -1 }),
  ]);

  const t = totalsRows[0] || {};
  const dayMap = new Map(dayRows.map((r) => [r._id, r]));
  const salesByDay = lastNDays(30).map((date) => {
    const r = dayMap.get(date);
    return { date, revenue: round2(r && r.revenue), orders: r ? r.orders : 0, units: r ? r.units : 0 };
  });
  const ppMap = new Map(perProductRows.map((r) => [String(r._id), r]));
  const perProduct = products.map((p) => {
    const s = ppMap.get(String(p._id)) || {};
    return {
      id: String(p._id), title: p.title, category: p.category, price: p.price, isActive: p.isActive,
      stockIn: p.stockIn, stockOut: p.stockOut, stockLeft: p.stockLeft, totalSales: p.totalSales,
      profitMargin: p.profitMargin, unitsSold: s.units || 0, revenue: round2(s.revenue), profit: round2(s.profit),
    };
  });
  const a = affiliateRows[0] || {};
  return {
    totals: {
      orders: t.orders || 0, revenue: round2(t.revenue), unitsSold: t.units || 0, grossProfit: round2(t.grossProfit),
      averageOrderValue: t.orders ? round2(t.revenue / t.orders) : 0,
      platformCommission: round2(t.platformCommission), products: products.length,
      activeProducts: products.filter((p) => p.isActive).length,
    },
    salesByDay,
    perProduct,
    affiliate: { orders: a.orders || 0, revenue: round2(a.revenue), commission: round2(a.commission), topSalesmen: bySalesmanRows.map((r) => ({ ...r, revenue: round2(r.revenue), commission: round2(r.commission) })) },
    ordersByStatus: byStatus,
    lowStock: perProduct.filter((p) => p.isActive && p.stockLeft <= LOW_STOCK).map(({ id, title, stockLeft }) => ({ id, title, stockLeft })),
    lowStockThreshold: LOW_STOCK,
  };
}

function weekStartUTC(d) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

async function salesmanStats(salesmanId, weeks = 8) {
  const salesman = oid(salesmanId);
  const valid = { affiliateSalesman: salesman, status: { $nin: INVALID } };
  const startWeek = weekStartUTC(new Date());
  startWeek.setUTCDate(startWeek.getUTCDate() - 7 * (weeks - 1));

  const [totRows, weekRows, byStatus] = await Promise.all([
    Order.aggregate([{ $match: valid }, { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$total' }, commission: { $sum: '$affiliateCommission' } } }]),
    Order.aggregate([
      { $match: { ...valid, createdAt: { $gte: startWeek } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: { $dateTrunc: { date: '$createdAt', unit: 'week', startOfWeek: 'monday', timezone: 'UTC' } } } },
        orders: { $sum: 1 }, revenue: { $sum: '$total' }, commission: { $sum: '$affiliateCommission' },
      } },
    ]),
    statusCounts({ affiliateSalesman: salesman }),
  ]);
  const wm = new Map(weekRows.map((r) => [r._id, r]));
  const weekly = [];
  for (let i = 0; i < weeks; i++) {
    const d = new Date(startWeek);
    d.setUTCDate(d.getUTCDate() + 7 * i);
    const key = d.toISOString().slice(0, 10);
    const r = wm.get(key);
    weekly.push({ weekStart: key, orders: r ? r.orders : 0, revenue: round2(r && r.revenue), commission: round2(r && r.commission) });
  }
  const t = totRows[0] || {};
  const delivered = await Order.aggregate([
    { $match: { affiliateSalesman: salesman, status: 'delivered' } },
    { $group: { _id: null, commission: { $sum: '$affiliateCommission' } } },
  ]);
  return {
    totals: { orders: t.orders || 0, revenue: round2(t.revenue), commission: round2(t.commission), commissionEarned: round2(delivered[0] && delivered[0].commission) },
    weekly,
    ordersByStatus: byStatus,
  };
}

module.exports = { companyAnalytics, salesmanStats, statusCounts, LOW_STOCK };
