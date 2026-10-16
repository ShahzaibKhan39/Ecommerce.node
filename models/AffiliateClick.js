// Shopfluence – AffiliateClick: one row per visit that arrived through a salesman's affiliate link
const mongoose = require('mongoose');

const SOURCES = ['instagram', 'facebook', 'twitter', 'youtube', 'tiktok', 'direct'];

const affiliateClickSchema = new mongoose.Schema(
  {
    salesman: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    source: { type: String, enum: SOURCES, default: 'direct' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

affiliateClickSchema.index({ salesman: 1, createdAt: -1 });

module.exports = mongoose.model('AffiliateClick', affiliateClickSchema);
module.exports.SOURCES = SOURCES;
