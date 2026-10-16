// Shopfluence – data for `npm run seed:stores` (6 ready-made stores x 5 products = 30 products, all 7 categories covered)
// Pure data (no database access) so it can also be used to generate the product placeholder images.

const STORE_EMAILS = [
  'sk0963401@gmail.com', 'sk0963402@gmail.com', 'sk0963403@gmail.com',
  'sk0963404@gmail.com', 'sk0963405@gmail.com', 'sk0963406@gmail.com',
];

// tone = [from, to] gradient colours of the generated placeholder image
const TONES = {
  Tech: ['#1e3a8a', '#3b82f6'], Clothes: ['#7c2d12', '#fb923c'], Groceries: ['#14532d', '#4ade80'],
  Toys: ['#86198f', '#f0abfc'], Furniture: ['#44403c', '#d6a56b'], Offers: ['#9f1239', '#fb7185'], Accessories: ['#0f766e', '#5eead4'],
};

// offer: { percent, startsInDays, lastsDays } – a scheduled offer (negative startsInDays = already running)
const STORES = [
  {
    email: STORE_EMAILS[0], ownerName: 'Volt Tech Hub Owner', name: 'Volt Tech Hub', rating: 4.9, ratingCount: 128, isHiring: true,
    description: 'Phones, audio and smart gadgets from trusted brands, with fast delivery.',
    products: [
      { title: 'Aurora Wireless Earbuds', category: 'Tech', price: 59.99, stock: 80, margin: 30, emoji: '🎧', description: 'Noise-reducing earbuds with 24-hour battery life.' },
      { title: 'Pulse Smart Watch', category: 'Tech', price: 129, stock: 40, margin: 25, emoji: '⌚', description: 'Fitness tracking, heart-rate monitor and phone notifications.' },
      { title: 'Nova 10000mAh Power Bank', category: 'Tech', price: 24.5, stock: 150, margin: 35, emoji: '🔋', description: 'Slim fast-charge power bank with two USB ports.' },
      { title: 'Echo Bluetooth Speaker', category: 'Tech', price: 45, stock: 60, margin: 32, emoji: '🔊', description: 'Waterproof speaker with deep bass and 12-hour playtime.', offer: { percent: 15, startsInDays: 3, lastsDays: 7 } },
      { title: 'Leather Phone Case', category: 'Accessories', price: 19.5, stock: 120, margin: 55, emoji: '📱', description: 'Slim genuine-leather case with card slot.' },
    ],
  },
  {
    email: STORE_EMAILS[1], ownerName: 'Urban Threads Owner', name: 'Urban Threads', rating: 4.8, ratingCount: 96, isHiring: true,
    description: 'Everyday fashion for men, women and kids - built to last.',
    products: [
      { title: 'Everyday Cotton Hoodie', category: 'Clothes', price: 45, stock: 120, margin: 40, emoji: '🧥', description: 'Heavyweight cotton hoodie in four colours.' },
      { title: 'Slim Fit Denim Jeans', category: 'Clothes', price: 39.9, stock: 90, margin: 42, emoji: '👖', description: 'Stretch denim with a modern slim cut.' },
      { title: 'Classic White Sneakers', category: 'Clothes', price: 64, stock: 70, margin: 38, emoji: '👟', description: 'Clean leather-look sneakers for every outfit.' },
      { title: 'Linen Summer Shirt', category: 'Clothes', price: 29.5, stock: 100, margin: 45, emoji: '👕', description: 'Breathable linen shirt, perfect for hot days.' },
      { title: 'Printed Lawn Kurta', category: 'Clothes', price: 34, stock: 80, margin: 48, emoji: '👗', description: 'Soft printed lawn kurta with embroidered neckline.' },
    ],
  },
  {
    email: STORE_EMAILS[2], ownerName: 'Fresh Basket Owner', name: 'Fresh Basket Grocers', rating: 4.7, ratingCount: 210, isHiring: false,
    description: 'Farm-fresh groceries and pantry staples delivered to your door.',
    products: [
      { title: 'Organic Coffee Beans 1kg', category: 'Groceries', price: 18, stock: 90, margin: 28, emoji: '☕', description: 'Single-origin medium roast, freshly packed.' },
      { title: 'Basmati Rice 5kg', category: 'Groceries', price: 12.5, stock: 200, margin: 18, emoji: '🍚', description: 'Long-grain aged basmati rice.' },
      { title: 'Extra Virgin Olive Oil 1L', category: 'Groceries', price: 14.75, stock: 110, margin: 24, emoji: '🫒', description: 'Cold-pressed olive oil in a dark glass bottle.' },
      { title: 'Mixed Dry Fruits 500g', category: 'Groceries', price: 16, stock: 140, margin: 30, emoji: '🥜', description: 'Almonds, cashews, pistachios and raisins.' },
      { title: 'Wildflower Honey 500g', category: 'Groceries', price: 9.9, stock: 160, margin: 33, emoji: '🍯', description: 'Raw, unfiltered honey from local beekeepers.' },
    ],
  },
  {
    email: STORE_EMAILS[3], ownerName: 'Little Wonders Owner', name: 'Little Wonders Toys', rating: 4.6, ratingCount: 74, isHiring: true,
    description: 'Safe, creative toys that help kids learn while they play.',
    products: [
      { title: 'Wooden Building Blocks (100 pcs)', category: 'Toys', price: 24, stock: 60, margin: 35, emoji: '🧱', description: 'Natural wood block set in a storage bag.' },
      { title: 'Remote Control Racing Car', category: 'Toys', price: 32.5, stock: 55, margin: 36, emoji: '🏎️', description: 'Rechargeable RC car with 25 km/h top speed.' },
      { title: 'Plush Teddy Bear 40cm', category: 'Toys', price: 15.9, stock: 130, margin: 44, emoji: '🧸', description: 'Super-soft hypoallergenic teddy bear.' },
      { title: '500-Piece World Map Puzzle', category: 'Toys', price: 18.25, stock: 75, margin: 40, emoji: '🧩', description: 'Colourful puzzle with country facts on every piece.' },
      { title: 'Kids Art & Craft Kit', category: 'Toys', price: 21, stock: 85, margin: 41, emoji: '🎨', description: 'Paints, crayons, stickers and paper for hours of creativity.' },
    ],
  },
  {
    email: STORE_EMAILS[4], ownerName: 'Home & Hearth Owner', name: 'Home & Hearth Furniture', rating: 4.5, ratingCount: 58, isHiring: true,
    description: 'Comfortable, well-made furniture and home decor at fair prices.',
    products: [
      { title: 'Ergonomic Office Chair', category: 'Furniture', price: 149, stock: 25, margin: 30, emoji: '🪑', description: 'Mesh-back chair with lumbar support and adjustable arms.' },
      { title: 'Solid Wood Coffee Table', category: 'Furniture', price: 189, stock: 18, margin: 33, emoji: '🛋️', description: 'Sheesham wood table with a natural oak finish.' },
      { title: 'Queen Size Storage Bed', category: 'Furniture', price: 399, stock: 10, margin: 28, emoji: '🛏️', description: 'Upholstered bed frame with two large storage drawers.' },
      { title: 'Floating Wall Bookshelf Set', category: 'Furniture', price: 54.5, stock: 60, margin: 38, emoji: '📚', description: 'Set of three floating shelves with hidden brackets.' },
      { title: 'Minimal LED Floor Lamp', category: 'Furniture', price: 48, stock: 45, margin: 40, emoji: '💡', description: 'Dimmable floor lamp with warm and cool light modes.' },
    ],
  },
  {
    email: STORE_EMAILS[5], ownerName: 'Deal Dock Owner', name: 'Deal Dock', rating: 4.4, ratingCount: 143, isHiring: true,
    description: 'Daily deals and bundle offers on everyday essentials and accessories.',
    products: [
      { title: 'Weekend Hoodie + Tote Bundle', category: 'Offers', price: 69, stock: 30, margin: 20, emoji: '🛍️', description: 'Hoodie and canvas tote together at a bundle price.', offer: { percent: 25, startsInDays: -1, lastsDays: 14 } },
      { title: 'Home Starter Kitchen Combo', category: 'Offers', price: 59, stock: 40, margin: 22, emoji: '🍳', description: 'Non-stick pan, knife and chopping board combo.', offer: { percent: 20, startsInDays: -1, lastsDays: 10 } },
      { title: 'Mega Stationery Pack', category: 'Offers', price: 22, stock: 100, margin: 30, emoji: '✏️', description: '60-piece school and office stationery pack.', offer: { percent: 30, startsInDays: -1, lastsDays: 21 } },
      { title: 'Canvas Everyday Tote Bag', category: 'Accessories', price: 15, stock: 200, margin: 50, emoji: '👜', description: 'Sturdy cotton canvas tote with inner pocket.' },
      { title: 'Polarised Aviator Sunglasses', category: 'Accessories', price: 27, stock: 90, margin: 52, emoji: '🕶️', description: 'UV400 polarised lenses with a lightweight metal frame.' },
    ],
  },
];

const slugify = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const imageUrlFor = (title) => `/placeholders/products/${slugify(title)}.svg`;

module.exports = { STORE_EMAILS, STORES, TONES, slugify, imageUrlFor };
