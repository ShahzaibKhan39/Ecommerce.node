// Shopfluence – Product model
const mongoose = require('mongoose');

const CATEGORIES = ['Tech', 'Clothes', 'Offers', 'Toys', 'Accessories', 'Groceries', 'Furniture'];

const productSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    title: { type: String, required: [true, 'Title is required'], trim: true, minlength: 2, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 3000, default: '' },
    category: { type: String, enum: CATEGORIES, required: [true, 'Category is required'] },
    price: { type: Number, required: [true, 'Price is required'], min: [0, 'Price cannot be negative'] },
    stockIn: { type: Number, default: 0, min: 0 },
    stockOut: { type: Number, default: 0, min: 0 },
    totalSales: { type: Number, default: 0, min: 0 },
    profitMargin: { type: Number, default: 0, min: 0, max: 100 },
    isActive: { type: Boolean, default: true },
    images: { type: [String], default: [] },
    // Scheduled offer: `offerPercent` off the normal price between offerStartsAt and offerEndsAt (set by the store owner or manager)
    offerPercent: { type: Number, min: 0, max: 90, default: 0 },
    offerStartsAt: { type: Date, default: null },
    offerEndsAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

productSchema.virtual('stockLeft').get(function stockLeft() {
  return Math.max(0, (this.stockIn || 0) - (this.stockOut || 0));
});

/** 'none' | 'scheduled' (starts later) | 'active' (running now) | 'expired' */
productSchema.methods.offerState = function offerState(now = new Date()) {
  if (!this.offerPercent || !this.offerStartsAt || !this.offerEndsAt) return 'none';
  if (now < this.offerStartsAt) return 'scheduled';
  if (now > this.offerEndsAt) return 'expired';
  return 'active';
};

/** The price a buyer pays right now (offer applied while it is running). */
productSchema.methods.effectivePrice = function effectivePrice(now = new Date()) {
  if (this.offerState(now) !== 'active') return this.price;
  return Math.round(this.price * (100 - this.offerPercent)) / 100;
};

productSchema.virtual('offerStatus').get(function offerStatus() { return this.offerState(); });
productSchema.virtual('salePrice').get(function salePrice() { return this.effectivePrice(); });

productSchema.index({ title: 'text', description: 'text' });
productSchema.index({ category: 1, isActive: 1 });

const PRIVATE_FIELDS = ['stockIn', 'stockOut', 'totalSales', 'profitMargin'];

/** Public view: hides internal stock/profit figures */
productSchema.methods.toPublic = function toPublic() {
  const o = this.toJSON();
  PRIVATE_FIELDS.forEach((f) => delete o[f]);
  return o;
};

productSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Product', productSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.PRIVATE_FIELDS = PRIVATE_FIELDS;
