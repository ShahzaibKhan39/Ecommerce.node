// Shopfluence – UIConfig: single global document keyed 'global'
const mongoose = require('mongoose');
const env = require('../config/env');
const { DEFAULTS } = require('../config/themePresets');

const { Mixed } = mongoose.Schema.Types;

const heroItemSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    alt: { type: String, maxlength: 120, default: '' },
    link: { type: String, default: '' },
    caption: { type: String, maxlength: 140, default: '' },
    overlayColor: { type: String, default: '#000000' },
    overlayOpacity: { type: Number, min: 0, max: 0.8, default: 0.3 },
    textColor: { type: String, default: '#ffffff' },
    textAlign: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
  },
  { _id: false }
);

const uiConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true, immutable: true },
    heroImages: {
      type: [heroItemSchema],
      default: [],
      validate: [(v) => v.length <= 8, 'A maximum of 8 hero images is allowed'],
    },
    theme: { type: Mixed, default: () => JSON.parse(JSON.stringify(DEFAULTS.theme)) },
    cardDesign: { type: Mixed, default: () => JSON.parse(JSON.stringify(DEFAULTS.cardDesign)) },
    animation: { type: Mixed, default: () => JSON.parse(JSON.stringify(DEFAULTS.animation)) },
    navbar: { type: Mixed, default: () => JSON.parse(JSON.stringify(DEFAULTS.navbar)) },
    footer: { type: Mixed, default: () => JSON.parse(JSON.stringify(DEFAULTS.footer)) },
    categories: { type: Mixed, default: () => [] }, // [{ name, emoji, tone, visible }] - `visible: false` hides a category storefront-wide
    storefront: { type: Mixed, default: () => JSON.parse(JSON.stringify(DEFAULTS.storefront)) }, // homepage layout (management only)
    platformCommission: {
      rate: { type: Number, min: 0, max: 50, default: env.DEFAULT_COMMISSION_RATE },
    },
    customCSS: { type: String, maxlength: 5000, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

uiConfigSchema.statics.getGlobal = function getGlobal() {
  return this.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global', heroImages: DEFAULTS.placeholderHero } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.model('UIConfig', uiConfigSchema);
