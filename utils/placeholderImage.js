// Shopfluence – generates simple SVG product pictures (used by the store seed until real photos are uploaded)
const fs = require('fs');
const path = require('path');
const { STORES, TONES, slugify } = require('../config/storeSeedData');

const DIR = path.join(__dirname, '..', 'public', 'placeholders', 'products');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(title, max = 22) {
  const words = String(title).split(/\s+/);
  const lines = [];
  let cur = '';
  words.forEach((w) => {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  });
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function svgFor(product, storeName) {
  const [c1, c2] = TONES[product.category] || TONES.Tech;
  const lines = wrap(product.title);
  const text = lines.map((l, i) => `<text x="400" y="${600 + i * 44}" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="36" font-weight="700" fill="#ffffff">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" role="img" aria-label="${esc(product.title)}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="650" cy="140" r="170" fill="#ffffff" opacity="0.08"/>
  <circle cx="120" cy="700" r="210" fill="#000000" opacity="0.08"/>
  <text x="400" y="400" text-anchor="middle" font-size="230">${esc(product.emoji || '🛍️')}</text>
  ${text}
  <text x="400" y="${600 + lines.length * 44 + 20}" text-anchor="middle" font-family="Poppins, Arial, sans-serif" font-size="24" fill="#ffffff" opacity="0.8">${esc(storeName)}</text>
</svg>
`;
}

/** Writes any missing product picture; returns the number of files written. */
function ensureProductImages({ overwrite = false } = {}) {
  fs.mkdirSync(DIR, { recursive: true });
  let n = 0;
  STORES.forEach((s) => s.products.forEach((p) => {
    const file = path.join(DIR, `${slugify(p.title)}.svg`);
    if (overwrite || !fs.existsSync(file)) { fs.writeFileSync(file, svgFor(p, s.name)); n += 1; }
  }));
  return n;
}

module.exports = { ensureProductImages };
