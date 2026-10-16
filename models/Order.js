// Shopfluence – Order model
const mongoose = require('mongoose');

const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'disputed', 'cancelled', 'refunded'];

const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    title: { type: String, required: true },
    image: { type: String },
    category: { type: String },
    price: { type: Number, required: true, min: 0 },
    profitMargin: { type: Number, default: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byRole: { type: String },
    note: { type: String, maxlength: 500 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    items: { type: [itemSchema], validate: [(v) => v.length > 0, 'Order needs at least one item'] },
    subtotal: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    shippingAddress: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    statusHistory: { type: [historySchema], default: [] },
    // affiliate
    affiliateSalesman: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    affiliateCode: { type: String },
    affiliateSource: { type: String, enum: ['instagram', 'facebook', 'twitter', 'youtube', 'tiktok', 'direct'], default: undefined },
    affiliateCommissionRate: { type: Number, default: 0 },
    affiliateCommission: { type: Number, default: 0 },
    // platform
    platformCommissionRate: { type: Number, default: 0 },
    platformCommission: { type: Number, default: 0 },
    stockRestored: { type: Boolean, default: false },
  },
  { timestamps: true }
);

orderSchema.index({ company: 1, createdAt: -1 });
orderSchema.index({ affiliateSalesman: 1, createdAt: -1 });

orderSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Order', orderSchema);
module.exports.STATUSES = STATUSES;
