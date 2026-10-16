// Shopfluence Management – storefront design control, commission, orders overview
const mongoose = require('mongoose');
const UIConfig = require('../models/UIConfig');
const Company = require('../models/Company');
const Order = require('../models/Order');
const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Favourite = require('../models/Favourite');
const Application = require('../models/Application');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { releaseStaff } = require('./staffHelpers');
const { ApiError, asyncHandler } = require('../middlewares/errorHandler');
const { toUrl, removeUploadedUrl, removeUploadedFiles, removeCvFile } = require('../middlewares/upload');
const { DEFAULTS } = require('../config/themePresets');
const ui = require('../utils/uiConfig');

const isId = (v) => mongoose.isValidObjectId(v);
const clone = ui.clone;

const defaultFor = (section) => (section === 'customCSS' ? '' : section === 'categories' ? [] : clone(DEFAULTS[section]));

/** Persist `set` on the single global UIConfig document. */
async function saveConfig({ set, userId }) {
  await UIConfig.updateOne({ key: 'global' }, { $set: { ...set, updatedAt: new Date(), updatedBy: userId } });
}

const sendConfig = async (res, status = 200) => {
  const doc = await UIConfig.getGlobal();
  res.status(status).json(ui.serializeConfig(doc));
};

// GET /api/shopfluence/ui-config  (public, cheap to poll: ETag + short Cache-Control)
exports.getUiConfig = asyncHandler(async (req, res) => {
  const doc = await UIConfig.getGlobal();
  res.set('Cache-Control', 'public, max-age=30, must-revalidate');
  res.json(ui.serializeConfig(doc)); // Express adds a weak ETag and answers 304 on If-None-Match
});

// GET /api/shopfluence/ui-config/presets  (public)
exports.getPresets = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(ui.describeOptions());
});

// PUT /api/shopfluence/ui-config  (admin; JSON or multipart; partial)
exports.updateUiConfig = asyncHandler(async (req, res) => {
  const files = req.files || [];
  try {
    const body = req.body || {};
    const errs = new ui.Errs();
    const doc = await UIConfig.getGlobal();
    const current = doc.toObject();

    const set = {};
    const touched = [];

    // JSON sections (objects, or JSON strings when sent as multipart)
    const parsed = {};
    ['theme', 'cardDesign', 'animation', 'navbar', 'footer', 'categories', 'storefront'].forEach((k) => {
      if (body[k] !== undefined) parsed[k] = ui.parseJsonField(body[k], k);
    });
    if (parsed.theme !== undefined) { set.theme = ui.validateTheme(parsed.theme, current.theme, errs); touched.push('theme'); }
    if (parsed.cardDesign !== undefined) { set.cardDesign = ui.validateCardDesign(parsed.cardDesign, current.cardDesign, errs); touched.push('cardDesign'); }
    if (parsed.animation !== undefined) { set.animation = ui.validateAnimation(parsed.animation, current.animation, errs); touched.push('animation'); }
    if (parsed.navbar !== undefined) { set.navbar = ui.validateNavbar(parsed.navbar, current.navbar, errs); touched.push('navbar'); }
    if (parsed.footer !== undefined) { set.footer = ui.validateFooter(parsed.footer, current.footer, errs); touched.push('footer'); }
    if (parsed.categories !== undefined) { const c = ui.validateCategories(parsed.categories, errs); if (c) set.categories = c; touched.push('categories'); }
    if (parsed.storefront !== undefined) { set.storefront = ui.validateStorefront(parsed.storefront, current.storefront, errs); touched.push('storefront'); }
    if (body.customCSS !== undefined) { const css = ui.validateCustomCss(body.customCSS, errs); if (css != null) set.customCSS = css; touched.push('customCSS'); }

    // hero images
    let removedUrls = [];
    let existingInput = ui.parseJsonField(body.existingHeroImages, 'existingHeroImages');
    const meta = ui.parseJsonField(body.heroImagesMeta, 'heroImagesMeta');
    if (existingInput === undefined && body.heroImages !== undefined) existingInput = ui.parseJsonField(body.heroImages, 'heroImages'); // JSON-only clients
    if (files.length || existingInput !== undefined) {
      const built = ui.buildHeroImages({ existingInput, currentHeroes: current.heroImages, newFiles: files, newMeta: meta, toUrl }, errs);
      if (built) { set.heroImages = built.items; removedUrls = built.removedUrls; }
      touched.push('heroImages');
    }

    if (!touched.length) throw ApiError.badRequest('No changes supplied. Send any of: heroImages, theme, cardDesign, animation, navbar, footer, categories, storefront, customCSS');
    if (!errs.ok) throw ApiError.unprocessable('Validation failed', errs.list);
    if (set.theme) { const ce = ui.contrastError(set.theme.colors); if (ce) throw ce; }

    await saveConfig({ set, userId: req.user._id });
    removedUrls.forEach(removeUploadedUrl); // deleted hero images are removed from disk
    await sendConfig(res);
  } catch (e) {
    removeUploadedFiles(files);
    throw e;
  }
});

// POST /api/shopfluence/ui-config/reset {section: theme|cardDesign|animation|storefront|categories|heroImages|all}
exports.resetUiConfig = asyncHandler(async (req, res) => {
  const section = (req.body || {}).section;
  const allowed = ['theme', 'cardDesign', 'animation', 'navbar', 'footer', 'storefront', 'categories', 'heroImages', 'all'];
  if (!allowed.includes(section)) throw ApiError.unprocessable('Validation failed', [{ field: 'section', message: `section must be one of: ${allowed.join(', ')}` }]);
  const doc = await UIConfig.getGlobal();
  const current = doc.toObject();
  const set = {};
  let removedUrls = [];
  const sections = section === 'all' ? ['theme', 'cardDesign', 'animation', 'navbar', 'footer', 'categories', 'storefront', 'customCSS', 'heroImages'] : [section];
  sections.forEach((s) => {
    if (s === 'heroImages') {
      removedUrls = (current.heroImages || []).map((h) => h.url);
      set.heroImages = clone(DEFAULTS.placeholderHero);
    } else set[s] = defaultFor(s);
  });
  await saveConfig({ set, userId: req.user._id });
  removedUrls.forEach(removeUploadedUrl); // only /uploads/ files are touched; placeholders are left alone
  await sendConfig(res);
});

// PUT /api/shopfluence/commission
// { rate }                                         -> platform commission on sales (0-50)
// { companyId, platformCommissionRate|null }       -> per-company platform commission override (null clears)
// { companyId, commissionRate }                    -> that company's affiliate (salesman) commission rate
exports.setCommission = asyncHandler(async (req, res) => {
  const { rate, companyId, platformCommissionRate, commissionRate } = req.body || {};
  const errors = [];
  const num = (v, f) => {
    const n = Number(v);
    if (v === '' || v === undefined || !Number.isFinite(n) || n < 0 || n > 50) { errors.push({ field: f, message: `${f} must be a number between 0 and 50` }); return undefined; }
    return n;
  };
  const result = {};
  if (rate !== undefined) {
    const n = num(rate, 'rate');
    if (!errors.length) {
      await UIConfig.getGlobal();
      await UIConfig.updateOne({ key: 'global' }, { $set: { 'platformCommission.rate': n, updatedAt: new Date(), updatedBy: req.user._id } });
      result.platformCommission = { rate: n };
    }
  }
  if (companyId !== undefined) {
    if (!isId(companyId)) errors.push({ field: 'companyId', message: 'A valid companyId is required' });
    const update = {};
    if (platformCommissionRate !== undefined) update.platformCommissionRate = platformCommissionRate === null ? null : num(platformCommissionRate, 'platformCommissionRate');
    if (commissionRate !== undefined) update.commissionRate = num(commissionRate, 'commissionRate');
    if (!Object.keys(update).length) errors.push({ field: 'companyId', message: 'Provide platformCommissionRate and/or commissionRate for the store' });
    if (!errors.length) {
      const c = await Company.findByIdAndUpdate(companyId, { $set: update }, { new: true });
      if (!c) throw ApiError.notFound('Store not found');
      result.company = { id: String(c._id), name: c.name, commissionRate: c.commissionRate, platformCommissionRate: c.platformCommissionRate };
    }
  }
  if (rate === undefined && companyId === undefined) errors.push({ field: 'rate', message: 'Provide rate and/or companyId' });
  if (errors.length) throw ApiError.unprocessable('Validation failed', errors);
  const cfg = await UIConfig.getGlobal();
  res.json({ platformCommission: cfg.platformCommission, ...result });
});

// GET /api/shopfluence/commission
exports.getCommission = asyncHandler(async (req, res) => {
  const cfg = await UIConfig.getGlobal();
  const companies = await Company.find().select('name commissionRate platformCommissionRate').sort({ name: 1 });
  res.json({ platformCommission: cfg.platformCommission, companies: companies.map((c) => ({ id: String(c._id), name: c.name, commissionRate: c.commissionRate, platformCommissionRate: c.platformCommissionRate })) });
});

// GET /api/shopfluence/orders?status=&company=
exports.listOrders = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) { if (!Order.STATUSES.includes(req.query.status)) throw ApiError.badRequest('Invalid status filter'); filter.status = req.query.status; }
  if (req.query.company) { if (!isId(req.query.company)) throw ApiError.badRequest('Invalid store id'); filter.company = req.query.company; }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('company', 'name').populate('buyer', 'name email'),
    Order.countDocuments(filter),
  ]);
  res.json({ orders, total, page, pages: Math.ceil(total / limit) || 1 });
});

// GET /api/shopfluence/overview
exports.overview = asyncHandler(async (req, res) => {
  const [users, companies, orders, tickets, revenue] = await Promise.all([
    User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
    Company.countDocuments(),
    Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    SupportTicket.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { status: { $nin: ['cancelled', 'refunded'] } } }, { $group: { _id: null, gross: { $sum: '$total' }, platformCommission: { $sum: '$platformCommission' } } }]),
  ]);
  const toMap = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
  res.json({
    usersByRole: toMap(users), companies, ordersByStatus: toMap(orders), ticketsByStatus: toMap(tickets),
    grossSales: revenue[0] ? revenue[0].gross : 0, platformCommissionEarned: revenue[0] ? Math.round(revenue[0].platformCommission * 100) / 100 : 0,
  });
});


// GET /api/shopfluence/users?role=&q=&limit=
exports.listUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = String(req.query.role);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(limit);
  res.json({ users: users.map((u) => u.toPublic()) });
});


// DELETE /api/shopfluence/companies/:id
// Removes the company, its products, reviews, applications (+CV files), chats and favourites,
// releases its hired managers/salesmen back to "unassigned", and deletes the owner account.
// Refused while the company still has unfinished orders. Finished orders are kept for the buyers' history.
const OPEN_ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'disputed'];
exports.deleteCompany = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid store id');
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound('Store not found');

  const openOrders = await Order.countDocuments({ company: company._id, status: { $in: OPEN_ORDER_STATUSES } });
  if (openOrders > 0) {
    throw ApiError.conflict(`Cannot delete "${company.name}": it still has ${openOrders} unfinished order(s). Cancel or complete them first.`);
  }

  const products = await Product.find({ company: company._id }).select('images');
  const productIds = products.map((p) => p._id);
  products.forEach((p) => (p.images || []).forEach(removeUploadedUrl));

  const convs = await Conversation.find({ company: company._id }).select('_id');
  const apps = await Application.find({ company: company._id });
  apps.forEach((a) => a.cv && removeCvFile(a.cv.filename));

  const staff = await User.find({ assignedCompany: company._id });
  for (const u of staff) await releaseStaff(u); // eslint-disable-line no-await-in-loop

  await Promise.all([
    Product.deleteMany({ company: company._id }),
    Review.deleteMany({ company: company._id }),
    Application.deleteMany({ company: company._id }),
    Message.deleteMany({ conversation: { $in: convs.map((c) => c._id) } }),
    Conversation.deleteMany({ company: company._id }),
    Favourite.deleteMany({ $or: [{ targetType: 'company', targetId: company._id }, { targetType: 'product', targetId: { $in: productIds } }] }),
  ]);

  removeUploadedUrl(company.logo);
  const ownerId = company.owner;
  await Company.deleteOne({ _id: company._id });
  if (ownerId) {
    await Favourite.deleteMany({ user: ownerId });
    await User.deleteOne({ _id: ownerId, role: 'company' });
  }
  res.json({ message: `Company "${company.name}" deleted`, releasedStaff: staff.length, deletedProducts: productIds.length });
});
