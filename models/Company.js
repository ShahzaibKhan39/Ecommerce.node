// Shopfluence – Company model
const mongoose = require('mongoose');
const env = require('../config/env');

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Store name is required'], unique: true, trim: true, minlength: 2, maxlength: 100 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    logo: { type: String },
    commissionRate: { type: Number, min: 0, max: 50, default: env.DEFAULT_COMMISSION_RATE },
    // Per-company override of the platform commission on sales (null = use the global rate)
    platformCommissionRate: { type: Number, min: 0, max: 50, default: null },
    isHiring: { type: Boolean, default: false },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

companySchema.index({ name: 'text' });
companySchema.index({ rating: -1, ratingCount: -1 });

companySchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Company', companySchema);
