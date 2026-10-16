// Shopfluence – Review: a buyer rates a company after a delivered order
const mongoose = require('mongoose');
const Company = require('./Company');

const reviewSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    rating: { type: Number, required: true, min: [1, 'Rating must be 1-5'], max: [5, 'Rating must be 1-5'] },
    comment: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

// One review per buyer per company (re-rating updates it)
reviewSchema.index({ company: 1, buyer: 1 }, { unique: true });

/** Recompute and store the company's average rating */
reviewSchema.statics.recomputeCompanyRating = async function recompute(companyId) {
  const [agg] = await this.aggregate([
    { $match: { company: new mongoose.Types.ObjectId(String(companyId)) } },
    { $group: { _id: '$company', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const rating = agg ? Math.round(agg.avg * 100) / 100 : 0;
  const ratingCount = agg ? agg.count : 0;
  await Company.findByIdAndUpdate(companyId, { rating, ratingCount });
  return { rating, ratingCount };
};

reviewSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Review', reviewSchema);
