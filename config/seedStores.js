// Shopfluence – seed the 6 ready-made stores:  npm run seed:stores
//   Creates 6 store-owner accounts (sk0963401..06@gmail.com, one shared password), their stores and 5 products each
//   (30 products covering Tech, Clothes, Groceries, Toys, Furniture, Offers and Accessories), with placeholder pictures.
//   Idempotent: existing accounts / stores / products are kept.  Flags:
//     --reset-password   set the shared password again on accounts that already exist
// Password: SEED_STORE_PASSWORD in .env (default below). Change it after the first login.
const mongoose = require('mongoose');
const connectDB = require('./db');
const User = require('../models/User');
const Company = require('../models/Company');
const Product = require('../models/Product');
const { STORES, imageUrlFor } = require('./storeSeedData');
const { ensureProductImages } = require('../utils/placeholderImage');

const STORE_PASSWORD = process.env.SEED_STORE_PASSWORD || 'Store@12345';
const resetPassword = process.argv.includes('--reset-password');
const DAY = 24 * 60 * 60 * 1000;

async function seedStore(def) {
  let owner = await User.findOne({ email: def.email }).select('+password');
  let created = false;
  if (!owner) {
    owner = new User({ name: def.ownerName, email: def.email, password: STORE_PASSWORD, role: 'company', status: 'active' });
    await owner.save();
    created = true;
  } else {
    if (owner.role !== 'company') throw new Error(`${def.email} already exists with role "${owner.role}" - it cannot own a store`);
    if (resetPassword) { owner.password = STORE_PASSWORD; owner.mustChangePassword = false; await owner.save(); }
  }

  let company = await Company.findOne({ owner: owner._id });
  if (!company) {
    company = await Company.create({ name: def.name, owner: owner._id, description: def.description, isHiring: def.isHiring, rating: def.rating, ratingCount: def.ratingCount });
  }

  let added = 0;
  for (const p of def.products) {
    const doc = {
      company: company._id, title: p.title, description: p.description, category: p.category, price: p.price,
      stockIn: p.stock, profitMargin: p.margin, images: [imageUrlFor(p.title)],
    };
    // eslint-disable-next-line no-await-in-loop
    const r = await Product.updateOne({ company: company._id, title: p.title }, { $setOnInsert: doc }, { upsert: true });
    if (r.upsertedCount) added += 1;
    if (p.offer) { // (re)open the scheduled offer window relative to today
      const now = Date.now();
      const startsAt = new Date(now + p.offer.startsInDays * DAY);
      const endsAt = new Date(startsAt.getTime() + p.offer.lastsDays * DAY);
      // eslint-disable-next-line no-await-in-loop
      await Product.updateOne({ company: company._id, title: p.title }, { $set: { offerPercent: p.offer.percent, offerStartsAt: startsAt, offerEndsAt: endsAt } });
    }
  }
  console.log(`[Shopfluence] ${created ? 'created ' : 'exists  '} ${def.email.padEnd(24)} -> ${company.name} (${added} new product${added === 1 ? '' : 's'})`);
}

(async () => {
  try {
    const imgs = ensureProductImages();
    if (imgs) console.log(`[Shopfluence] generated ${imgs} product placeholder image(s)`);
    await connectDB();
    for (const def of STORES) {
      // eslint-disable-next-line no-await-in-loop
      await seedStore(def);
    }
    console.log(`[Shopfluence] Store seed complete. All 6 store accounts use the password from SEED_STORE_PASSWORD${process.env.SEED_STORE_PASSWORD ? '' : ' (default: ' + STORE_PASSWORD + ')'}`);
  } catch (e) {
    console.error('[Shopfluence] Store seed failed:', e.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
