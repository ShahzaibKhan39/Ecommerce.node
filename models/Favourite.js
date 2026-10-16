// Shopfluence – Favourite (user -> company | salesman | product)
const mongoose = require('mongoose');

const favouriteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: ['company', 'salesman', 'product'], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true }
);

favouriteSchema.index({ user: 1, targetType: 1, targetId: 1 }, { unique: true });

favouriteSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Favourite', favouriteSchema);
