// Shopfluence – products (public catalogue + company/manager management)
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { CATEGORIES } = Product;
const { ApiError, asyncHandler } = require('../middlewares/errorHandler');
const { toUrl, removeUploadedUrl, removeUploadedFiles } = require('../middlewares/upload');
const { parseJsonField } = require('../utils/uiConfig');

const MAX_IMAGES = 6;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isId = (v) => mongoose.isValidObjectId(v);
const SOLD_OUT_EXCLUDED = { $expr: { $gt: [{ $subtract: ['$stockIn', '$stockOut'] }, 0] } };

function normalizeCategory(v) {
  if (typeof v !== 'string') return null;
  return CATEGORIES.find((c) => c.toLowerCase() === v.trim().toLowerCase()) || null;
}

function publicProduct(p) {
  const o = p.toPublic();
  const c = o.company;
  if (c && typeof c === 'object' && (c.id || c._id)) {
    o.company = { id: String(c.id || c._id), name: c.name, logo: c.logo, rating: c.rating, ratingCount: c.ratingCount };
  }
  return o;
}

function intField(v, name, { min = 0, max = 1e7, required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw ApiError.unprocessable('Validation failed', [{ field: name, message: `${name} is required` }]);
    return undefined;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw ApiError.unprocessable('Validation failed', [{ field: name, message: `${name} must be an integer between ${min} and ${max}` }]);
  }
  return n;
}

function numField(v, name, { min = 0, max = 1e9 } = {}) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw ApiError.unprocessable('Validation failed', [{ field: name, message: `${name} must be a number between ${min} and ${max}` }]);
  }
  return n;
}


/**
 * Scheduled offer fields (store owner or manager): offerPercent (1-90) + offerStartsAt + offerEndsAt.
 * offerPercent = 0 / '' clears the offer. Returns undefined when the request does not touch the offer at all.
 */
function parseOffer(b, current = {}) {
  const touched = ['offerPercent', 'offerStartsAt', 'offerEndsAt'].some((k) => b[k] !== undefined);
  if (!touched) return undefined;
  const percentRaw = b.offerPercent !== undefined ? b.offerPercent : current.offerPercent;
  if (percentRaw === '' || percentRaw === null || Number(percentRaw) === 0) {
    return { offerPercent: 0, offerStartsAt: null, offerEndsAt: null };
  }
  const percent = Number(percentRaw);
  const bad = (field, message) => ApiError.unprocessable('Validation failed', [{ field, message }]);
  if (!Number.isFinite(percent) || percent < 1 || percent > 90) throw bad('offerPercent', 'Offer discount must be between 1 and 90 percent');
  const startsRaw = b.offerStartsAt !== undefined ? b.offerStartsAt : current.offerStartsAt;
  const endsRaw = b.offerEndsAt !== undefined ? b.offerEndsAt : current.offerEndsAt;
  const startsAt = startsRaw ? new Date(startsRaw) : null;
  const endsAt = endsRaw ? new Date(endsRaw) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) throw bad('offerStartsAt', 'Choose when the offer starts (date and time)');
  if (!endsAt || Number.isNaN(endsAt.getTime())) throw bad('offerEndsAt', 'Choose when the offer ends (date and time)');
  if (endsAt <= startsAt) throw bad('offerEndsAt', 'The offer must end after it starts');
  return { offerPercent: Math.round(percent * 100) / 100, offerStartsAt: startsAt, offerEndsAt: endsAt };
}

// ---------- public ----------
// GET /api/products?q=&category=&company=&minPrice=&maxPrice=&sort=&page=&limit=
exports.list = asyncHandler(async (req, res) => {
  const { q, category, company, sort = 'newest' } = req.query;
  const filter = { isActive: true, ...SOLD_OUT_EXCLUDED };
  if (q !== undefined && String(q).trim()) {
    const term = String(q).trim().slice(0, 100);
    // Every word must match the product name, description or category (case-insensitive), so "red shirt" / "SHIRT" both work.
    const words = term.split(/\s+/).filter(Boolean).slice(0, 6);
    filter.$and = words.map((w) => {
      const rx = { $regex: `(^|[^a-z0-9])${escapeRegex(w)}`, $options: 'i' }; // word-start match: "men" does not match "women"
      return { $or: [{ title: rx }, { description: rx }, { category: rx }] };
    });
  }
  if (category && String(category).toLowerCase() !== 'all') {
    const cat = normalizeCategory(String(category));
    if (!cat) throw ApiError.badRequest(`Unknown category. Allowed: ${CATEGORIES.map((c) => c.toLowerCase()).join(', ')}`);
    filter.category = cat;
  }
  if (company) {
    if (!isId(company)) throw ApiError.badRequest('Invalid store id');
    filter.company = company;
  }
  if (req.query.onOffer === 'true') { // only products whose scheduled offer is running right now
    const now = new Date();
    filter.offerPercent = { $gt: 0 };
    filter.offerStartsAt = { $lte: now };
    filter.offerEndsAt = { $gte: now };
  }
  const min = numField(req.query.minPrice, 'minPrice');
  const max = numField(req.query.maxPrice, 'maxPrice');
  if (min !== undefined || max !== undefined) {
    filter.price = {};
    if (min !== undefined) filter.price.$gte = min;
    if (max !== undefined) filter.price.$lte = max;
  }
  const sorts = { newest: { createdAt: -1 }, price_asc: { price: 1 }, price_desc: { price: -1 }, popular: { totalSales: -1, createdAt: -1 } };
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const [items, total] = await Promise.all([
    Product.find(filter).sort(sorts[sort] || sorts.newest).skip((page - 1) * limit).limit(limit)
      .populate('company', 'name logo rating ratingCount'),
    Product.countDocuments(filter),
  ]);
  res.json({ products: items.map(publicProduct), total, page, pages: Math.ceil(total / limit) || 1 });
});

// GET /api/products/:id
exports.getOne = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid product id');
  const p = await Product.findOne({ _id: req.params.id, isActive: true }).populate('company', 'name logo rating ratingCount');
  if (!p) throw ApiError.notFound('Product not found');
  res.json({ product: publicProduct(p) });
});

// ---------- company / manager ----------
// GET /api/products/manage/mine  (full details incl. stock, profit, inactive items)
exports.listMine = asyncHandler(async (req, res) => {
  const filter = { company: req.companyId };
  if (req.query.active === 'true') filter.isActive = true;
  if (req.query.active === 'false') filter.isActive = false;
  const products = await Product.find(filter).sort({ createdAt: -1 });
  res.json({ products });
});

async function loadOwned(req) {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid product id');
  const p = await Product.findOne({ _id: req.params.id, company: req.companyId });
  if (!p) throw ApiError.notFound('Product not found in your store');
  return p;
}

// POST /api/products   (multipart: images[])
exports.create = asyncHandler(async (req, res) => {
  const files = req.files || [];
  try {
    const b = req.body;
    const category = normalizeCategory(b.category);
    if (!category) throw ApiError.unprocessable('Validation failed', [{ field: 'category', message: `Category must be one of: ${CATEGORIES.join(', ')}` }]);
    if (files.length > MAX_IMAGES) throw ApiError.unprocessable('Validation failed', [{ field: 'images', message: `At most ${MAX_IMAGES} images` }]);
    const price = numField(b.price, 'price');
    if (price === undefined) throw ApiError.unprocessable('Validation failed', [{ field: 'price', message: 'price is required' }]);
    const offer = parseOffer(b);
    const product = await Product.create({
      ...(offer || {}),
      company: req.companyId,
      title: b.title,
      description: b.description,
      category,
      price,
      stockIn: intField(b.stockIn, 'stockIn') ?? 0,
      profitMargin: numField(b.profitMargin, 'profitMargin', { min: 0, max: 100 }) ?? 0,
      images: files.map(toUrl),
    });
    res.status(201).json({ product });
  } catch (e) {
    removeUploadedFiles(files);
    throw e;
  }
});

// PUT /api/products/:id   (multipart ok: images[], existingImages=JSON array)
exports.update = asyncHandler(async (req, res) => {
  const files = req.files || [];
  try {
    const p = await loadOwned(req);
    const b = req.body;
    if (b.title !== undefined) p.title = b.title;
    if (b.description !== undefined) p.description = b.description;
    if (b.category !== undefined) {
      const c = normalizeCategory(b.category);
      if (!c) throw ApiError.unprocessable('Validation failed', [{ field: 'category', message: `Category must be one of: ${CATEGORIES.join(', ')}` }]);
      p.category = c;
    }
    const price = numField(b.price, 'price');
    if (price !== undefined) p.price = price;
    const pm = numField(b.profitMargin, 'profitMargin', { min: 0, max: 100 });
    if (pm !== undefined) p.profitMargin = pm;
    if (b.isActive !== undefined) p.isActive = b.isActive === true || b.isActive === 'true';
    const offer = parseOffer(b, p);
    if (offer) Object.assign(p, offer);

    let removed = [];
    let images = p.images;
    const existing = parseJsonField(b.existingImages, 'existingImages');
    if (existing !== undefined) {
      if (!Array.isArray(existing) || existing.some((u) => !p.images.includes(u))) {
        throw ApiError.unprocessable('Validation failed', [{ field: 'existingImages', message: 'Must be an array of this product\'s current image URLs' }]);
      }
      removed = p.images.filter((u) => !existing.includes(u));
      images = existing;
    }
    images = [...images, ...files.map(toUrl)];
    if (images.length > MAX_IMAGES) throw ApiError.unprocessable('Validation failed', [{ field: 'images', message: `At most ${MAX_IMAGES} images` }]);
    p.images = images;
    await p.save();
    removed.forEach(removeUploadedUrl);
    res.json({ product: p });
  } catch (e) {
    removeUploadedFiles(files);
    throw e;
  }
});

// PATCH /api/products/:id/stock  {quantity}  -> adds to stockIn
exports.addStock = asyncHandler(async (req, res) => {
  const quantity = intField(req.body.quantity, 'quantity', { min: 1, max: 1e6, required: true });
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid product id');
  const p = await Product.findOneAndUpdate({ _id: req.params.id, company: req.companyId }, { $inc: { stockIn: quantity } }, { new: true });
  if (!p) throw ApiError.notFound('Product not found in your store');
  res.json({ product: p, message: `Added ${quantity} units of stock` });
});

// PATCH /api/products/:id/active  {isActive}
exports.setActive = asyncHandler(async (req, res) => {
  if (typeof req.body.isActive !== 'boolean') throw ApiError.badRequest('isActive (boolean) is required');
  const p = await loadOwned(req);
  p.isActive = req.body.isActive;
  await p.save();
  res.json({ product: p });
});

// DELETE /api/products/:id  -> deactivates (history and orders keep their snapshots)
exports.deactivate = asyncHandler(async (req, res) => {
  const p = await loadOwned(req);
  p.isActive = false;
  await p.save();
  res.json({ message: 'Product deactivated', product: p });
});

exports.helpers = { normalizeCategory, SOLD_OUT_EXCLUDED };
