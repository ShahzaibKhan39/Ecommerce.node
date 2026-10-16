// Shopfluence – seed script:  npm run seed:shopfluence
//   Creates the Shopfluence Management admin, sample companies/products/users and the default UIConfig.
//   Idempotent. Flags:  --reset-admin  (re-apply admin password/role from env)    --reset-ui  (restore the default storefront config)   --no-sample  (admin + UIConfig only)
// Sample data is skipped in production unless SEED_SAMPLE_DATA=true.
const mongoose = require('mongoose');
const env = require('./env');
const connectDB = require('./db');
const { DEFAULTS } = require('./themePresets');
const User = require('../models/User');
const Company = require('../models/Company');
const Product = require('../models/Product');
const UIConfig = require('../models/UIConfig');

const args = process.argv.slice(2);
const SAMPLE_PASSWORD = process.env.SEED_SAMPLE_PASSWORD || 'Shopfluence#Demo1';
const clone = (o) => JSON.parse(JSON.stringify(o));

async function upsertUser(data) {
  let u = await User.findOne({ email: data.email });
  if (!u) { u = new User(data); await u.save(); return { user: u, created: true }; }
  return { user: u, created: false };
}

async function seedAdmin() {
  const { SHOPFLUENCE_ADMIN_NAME: name, SHOPFLUENCE_ADMIN_EMAIL: email, SHOPFLUENCE_ADMIN_PASSWORD: password } = env;
  if (!email || !password) {
    throw new Error('Set SHOPFLUENCE_ADMIN_EMAIL and SHOPFLUENCE_ADMIN_PASSWORD in .env before seeding');
  }
  if (password.length < 8) throw new Error('SHOPFLUENCE_ADMIN_PASSWORD must be at least 8 characters');
  const { user, created } = await upsertUser({ name, email: email.trim().toLowerCase(), password, role: 'shopfluence_management', status: 'active' });
  // --reset-admin: fix an admin that exists but can't log in (old password, wrong role, blocked)
  if (!created && args.includes('--reset-admin')) {
    user.name = name; user.password = password; user.role = 'shopfluence_management'; user.status = 'active'; user.isBlocked = false;
    await user.save(); // pre-save hook re-hashes the password
    console.log('[Shopfluence] Admin reset: password, role and status restored from .env');
  }
  console.log(`[Shopfluence] Admin (Shopfluence Management) ${created ? 'created' : 'already exists'}: ${user.email}`);
}

async function seedUiConfig() {
  const existing = await UIConfig.exists({ key: 'global' });
  await UIConfig.getGlobal();
  if (!existing || args.includes('--reset-ui')) {
    await UIConfig.updateOne({ key: 'global' }, {
      $set: {
        heroImages: clone(DEFAULTS.placeholderHero),
        theme: clone(DEFAULTS.theme),
        cardDesign: clone(DEFAULTS.cardDesign),
        animation: clone(DEFAULTS.animation),
        navbar: clone(DEFAULTS.navbar),
        footer: clone(DEFAULTS.footer),
        categories: [],
        customCSS: '',
        'platformCommission.rate': env.DEFAULT_COMMISSION_RATE,
        updatedAt: new Date(),
      },
    });
    console.log(`[Shopfluence] Default UIConfig ${existing ? 'reset' : 'created'} (preset shopfluence-blue, 3 placeholder hero entries)`);
  } else {
    console.log('[Shopfluence] UIConfig already exists (use --reset-ui to restore defaults)');
  }
}

async function seedSample() {
  const mk = async (data) => (await upsertUser({ password: SAMPLE_PASSWORD, status: 'active', ...data })).user;

  const owner1 = await mk({ name: 'Techtonic Owner', email: 'techtonic@shopfluence.local', role: 'company' });
  const owner2 = await mk({ name: 'Threadline Owner', email: 'threadline@shopfluence.local', role: 'company' });
  const c1 = (await Company.findOne({ owner: owner1._id })) || (await Company.create({ name: 'Techtonic', owner: owner1._id, description: 'Gadgets and accessories for everyday life.', isHiring: true, rating: 4.7, ratingCount: 12 }));
  const c2 = (await Company.findOne({ owner: owner2._id })) || (await Company.create({ name: 'Threadline Apparel', owner: owner2._id, description: 'Modern clothing, built to last.', isHiring: true, rating: 4.3, ratingCount: 8, commissionRate: 8 }));

  const manager = await mk({ name: 'Mina Manager', email: 'manager@shopfluence.local', role: 'manager', isHired: true, assignedCompany: c1._id });
  await mk({ name: 'Sam Salesman', email: 'salesman@shopfluence.local', role: 'salesman', isHired: true, assignedCompany: c1._id, assignedManager: manager._id });
  await mk({ name: 'Freya Freelancer', email: 'applicant@shopfluence.local', role: 'salesman', status: 'unassigned' });
  await mk({ name: 'Bella Buyer', email: 'buyer@shopfluence.local', role: 'buyer' });

  const products = [
    { company: c1._id, title: 'Aurora Wireless Earbuds', category: 'Tech', price: 59.99, stockIn: 80, profitMargin: 30, description: 'Noise-reducing earbuds with 24h battery.' },
    { company: c1._id, title: 'Pulse Smart Watch', category: 'Tech', price: 129, stockIn: 40, profitMargin: 25, description: 'Fitness tracking and notifications.' },
    { company: c1._id, title: 'Leather Phone Case', category: 'Accessories', price: 19.5, stockIn: 4, profitMargin: 55, description: 'Slim genuine-leather case.' },
    { company: c2._id, title: 'Everyday Hoodie', category: 'Clothes', price: 45, stockIn: 120, profitMargin: 40, description: 'Heavyweight cotton hoodie.' },
    { company: c2._id, title: 'Canvas Tote Bag', category: 'Accessories', price: 15, stockIn: 200, profitMargin: 50, description: 'Sturdy everyday tote.' },
    { company: c2._id, title: 'Weekend Offer Bundle', category: 'Offers', price: 69, stockIn: 30, profitMargin: 20, description: 'Hoodie + tote at a bundle price.' },
    { company: c2._id, title: 'Wooden Building Blocks', category: 'Toys', price: 24, stockIn: 60, profitMargin: 35, description: '100-piece natural wood set.' },
    { company: c1._id, title: 'Organic Coffee Beans 1kg', category: 'Groceries', price: 18, stockIn: 90, profitMargin: 28, description: 'Single-origin medium roast.' },
  ];
  for (const p of products) {
    // eslint-disable-next-line no-await-in-loop
    await Product.updateOne({ company: p.company, title: p.title }, { $setOnInsert: p }, { upsert: true });
  }
  console.log(`[Shopfluence] Sample data ready (companies: ${c1.name}, ${c2.name}; ${products.length} products)`);
  console.log('[Shopfluence] Sample accounts (dev only) – password from SEED_SAMPLE_PASSWORD or the default in this script:');
  ['techtonic', 'threadline', 'manager', 'salesman', 'applicant', 'buyer'].forEach((n) => console.log(`   ${n}@shopfluence.local`));
}

(async () => {
  try {
    await connectDB();
    await seedAdmin();
    await seedUiConfig();
    const sampleAllowed = !args.includes('--no-sample') && (!env.isProd || process.env.SEED_SAMPLE_DATA === 'true');
    if (sampleAllowed) await seedSample(); else console.log('[Shopfluence] Sample data skipped');
    console.log('[Shopfluence] Seed complete');
  } catch (e) {
    console.error('[Shopfluence] Seed failed:', e.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
