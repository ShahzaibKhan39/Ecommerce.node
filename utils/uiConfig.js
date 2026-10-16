// Shopfluence – storefront (UIConfig) validation, merging and CSS-variable resolution.
// Everything is validated against whitelists; no free-form CSS is ever accepted except
// the sanitized `customCSS` field.
const {
  PRESETS, COLOR_KEYS, OPTIONS, DEFAULTS, SPEED_MULTIPLIER, BASE_DURATION_MS,
  RADIUS_PX, SHADOW_CSS, ASPECT_CSS, FONT_STACKS, STOREFRONT_OPTIONS,
} = require('../config/themePresets');
const { normalizeHex, checkThemeContrast } = require('./colors');
const { sanitizeCss, MAX_CSS } = require('./sanitizeCss');
const { ApiError } = require('../middlewares/errorHandler');
const { CATEGORIES } = require('../models/Product');

const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

class Errs {
  constructor() { this.list = []; }
  add(field, message, extra) { this.list.push({ field, message, ...(extra || {}) }); }
  get ok() { return this.list.length === 0; }
}

/** Parse a JSON-string (multipart) or pass through an object/array. Throws 400 on malformed JSON. */
function parseJsonField(value, name) {
  if (value === undefined) return undefined;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (e) { throw ApiError.badRequest(`Malformed JSON in "${name}"`); }
  }
  return value;
}

// ---------- small validators ----------
function checkUnknown(obj, allowed, path, errs, ignore = []) {
  Object.keys(obj).forEach((k) => {
    if (!allowed.includes(k) && !ignore.includes(k)) errs.add(`${path}.${k}`, 'Unknown field');
  });
}
function checkEnum(v, allowed, path, errs) {
  if (!allowed.includes(v)) { errs.add(path, `Must be one of: ${allowed.join(', ')}`); return false; }
  return true;
}
function checkBool(v, path, errs) {
  if (typeof v !== 'boolean') { errs.add(path, 'Must be a boolean'); return false; }
  return true;
}
function checkInt(v, min, max, path, errs) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    errs.add(path, `Must be an integer between ${min} and ${max}`); return false;
  }
  return true;
}
function checkNumber(v, min, max, path, errs) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    errs.add(path, `Must be a number between ${min} and ${max}`); return false;
  }
  return true;
}
function checkHex(v, path, errs) {
  const n = normalizeHex(v);
  if (!n) errs.add(path, 'Must be a 3 or 6 digit hex colour such as #2563eb');
  return n;
}
function checkString(v, max, path, errs, { allowEmpty = true } = {}) {
  if (typeof v !== 'string') { errs.add(path, 'Must be a string'); return null; }
  const t = v.trim();
  if (!allowEmpty && !t) { errs.add(path, 'Must not be empty'); return null; }
  if (t.length > max) { errs.add(path, `Must be at most ${max} characters`); return null; }
  return t;
}
/** internal path ("/x") or https URL */
function checkLink(v, path, errs, { allowEmpty = true } = {}) {
  const s = checkString(v, 500, path, errs, { allowEmpty });
  if (s == null) return null;
  if (s === '') return '';
  const internal = /^\/(?!\/)[^\s<>"']*$/.test(s);
  const https = /^https:\/\/[^\s<>"']+$/i.test(s);
  if (!internal && !https) { errs.add(path, 'Must be an internal path (starting with "/") or an https:// URL'); return null; }
  return s;
}

// ---------- THEME ----------
function validateTheme(input, current, errs) {
  const path = 'theme';
  const out = clone(current);
  if (!isObj(input)) { errs.add(path, 'Must be an object'); return out; }
  checkUnknown(input, ['mode', 'preset', 'colors', 'gradient', 'fontFamily'], path, errs);

  if (input.mode !== undefined && checkEnum(input.mode, OPTIONS.theme.mode, `${path}.mode`, errs)) out.mode = input.mode;
  if (input.fontFamily !== undefined && checkEnum(input.fontFamily, OPTIONS.theme.fontFamily, `${path}.fontFamily`, errs)) out.fontFamily = input.fontFamily;

  // preset / colours
  let colorsInput;
  if (input.colors !== undefined) {
    if (!isObj(input.colors)) errs.add(`${path}.colors`, 'Must be an object');
    else { checkUnknown(input.colors, COLOR_KEYS, `${path}.colors`, errs); colorsInput = input.colors; }
  }
  let preset = input.preset;
  if (preset !== undefined && !checkEnum(preset, OPTIONS.theme.preset, `${path}.preset`, errs)) preset = undefined;
  if (preset === undefined && colorsInput) preset = 'custom'; // sending colours alone means "custom"

  if (preset && preset !== 'custom') {
    out.preset = preset;
    out.colors = clone(PRESETS[preset].colors); // derived from the preset
  } else if (preset === 'custom') {
    out.preset = 'custom';
    const merged = { ...out.colors };
    if (colorsInput) {
      Object.keys(colorsInput).filter((k) => COLOR_KEYS.includes(k)).forEach((k) => {
        const n = checkHex(colorsInput[k], `${path}.colors.${k}`, errs);
        if (n) merged[k] = n;
      });
    }
    out.colors = merged;
  }

  // gradient
  if (input.gradient !== undefined) {
    const g = input.gradient;
    if (!isObj(g)) errs.add(`${path}.gradient`, 'Must be an object');
    else {
      checkUnknown(g, ['enabled', 'from', 'to', 'angle'], `${path}.gradient`, errs);
      const next = { ...(out.gradient || DEFAULTS.theme.gradient) };
      if (g.enabled !== undefined && checkBool(g.enabled, `${path}.gradient.enabled`, errs)) next.enabled = g.enabled;
      if (g.from !== undefined) { const n = checkHex(g.from, `${path}.gradient.from`, errs); if (n) next.from = n; }
      if (g.to !== undefined) { const n = checkHex(g.to, `${path}.gradient.to`, errs); if (n) next.to = n; }
      if (g.angle !== undefined && checkNumber(g.angle, 0, 360, `${path}.gradient.angle`, errs)) next.angle = g.angle;
      out.gradient = next;
    }
  }
  return out;
}

/** Returns an ApiError (422) if the colour combination fails WCAG AA, otherwise null. */
function contrastError(colors) {
  const failures = checkThemeContrast(colors);
  if (!failures.length) return null;
  const first = failures[0];
  const msg = `Colour combination fails WCAG AA (4.5:1): ${first.pair} is ${first.ratio ?? 'invalid'}:1`
    + (failures.length > 1 ? ` (+${failures.length - 1} more)` : '');
  return ApiError.unprocessable(msg, failures.map((f) => ({
    field: 'theme.colors',
    pair: f.pair, foreground: f.foreground, background: f.background, ratio: f.ratio, required: f.required,
    message: `${f.pair}: contrast ${f.ratio}:1 is below the required ${f.required}:1`,
  })));
}

// ---------- CARD DESIGN ----------
const CARD_KEYS = ['variant', 'radius', 'shadow', 'imageAspect', 'imageFit', 'showRating', 'showCompany',
  'showQuickAdd', 'showFavourite', 'priceStyle', 'badgeColor', 'accentColor', 'columns'];

function validateCardBlock(input, current, path, errs) {
  const out = clone(current);
  if (!isObj(input)) { errs.add(path, 'Must be an object'); return out; }
  checkUnknown(input, CARD_KEYS, path, errs);
  const enums = {
    variant: OPTIONS.card.variant, radius: OPTIONS.card.radius, shadow: OPTIONS.card.shadow,
    imageAspect: OPTIONS.card.imageAspect, imageFit: OPTIONS.card.imageFit, priceStyle: OPTIONS.card.priceStyle,
  };
  Object.entries(enums).forEach(([k, allowed]) => {
    if (input[k] !== undefined && checkEnum(input[k], allowed, `${path}.${k}`, errs)) out[k] = input[k];
  });
  ['showRating', 'showCompany', 'showQuickAdd', 'showFavourite'].forEach((k) => {
    if (input[k] !== undefined && checkBool(input[k], `${path}.${k}`, errs)) out[k] = input[k];
  });
  ['badgeColor', 'accentColor'].forEach((k) => {
    if (input[k] !== undefined) { const n = checkHex(input[k], `${path}.${k}`, errs); if (n) out[k] = n; }
  });
  if (input.columns !== undefined) {
    if (!isObj(input.columns)) errs.add(`${path}.columns`, 'Must be an object');
    else {
      checkUnknown(input.columns, ['mobile', 'tablet', 'desktop'], `${path}.columns`, errs);
      ['mobile', 'tablet', 'desktop'].forEach((bp) => {
        if (input.columns[bp] !== undefined) {
          const { min, max } = OPTIONS.card.columns[bp];
          if (checkInt(input.columns[bp], min, max, `${path}.columns.${bp}`, errs)) out.columns[bp] = input.columns[bp];
        }
      });
    }
  }
  return out;
}

function validateCardDesign(input, current, errs) {
  const path = 'cardDesign';
  const out = clone(current);
  if (!isObj(input)) { errs.add(path, 'Must be an object'); return out; }
  checkUnknown(input, ['product', 'company'], path, errs);
  if (input.product !== undefined) out.product = validateCardBlock(input.product, out.product, `${path}.product`, errs);
  if (input.company !== undefined) out.company = validateCardBlock(input.company, out.company, `${path}.company`, errs);
  return out;
}

// ---------- ANIMATION ----------
function validateAnimation(input, current, errs) {
  const path = 'animation';
  const out = clone(current);
  delete out.resolved;
  delete out.respectReducedMotion;
  if (!isObj(input)) { errs.add(path, 'Must be an object'); return out; }
  // `resolved` and `respectReducedMotion` are computed/read-only; tolerated so GET -> PUT round-trips work.
  checkUnknown(input, ['enabled', 'speed', 'hero', 'cardHover', 'pageTransition', 'entrance', 'staggerDelayMs',
    'buttonEffect'], path, errs, ['resolved', 'respectReducedMotion', 'staggerMs']);
  if (input.staggerDelayMs === undefined && input.staggerMs !== undefined) input = { ...input, staggerDelayMs: input.staggerMs }; // frontend alias
  if (input.enabled !== undefined && checkBool(input.enabled, `${path}.enabled`, errs)) out.enabled = input.enabled;
  if (input.speed !== undefined && checkEnum(input.speed, OPTIONS.animation.speed, `${path}.speed`, errs)) out.speed = input.speed;
  if (input.cardHover !== undefined && checkEnum(input.cardHover, OPTIONS.animation.cardHover, `${path}.cardHover`, errs)) out.cardHover = input.cardHover;
  if (input.pageTransition !== undefined && checkEnum(input.pageTransition, OPTIONS.animation.pageTransition, `${path}.pageTransition`, errs)) out.pageTransition = input.pageTransition;
  if (input.entrance !== undefined && checkEnum(input.entrance, OPTIONS.animation.entrance, `${path}.entrance`, errs)) out.entrance = input.entrance;
  if (input.buttonEffect !== undefined && checkEnum(input.buttonEffect, OPTIONS.animation.buttonEffect, `${path}.buttonEffect`, errs)) out.buttonEffect = input.buttonEffect;
  if (input.staggerDelayMs !== undefined) {
    const { min, max } = OPTIONS.animation.staggerDelayMs;
    if (checkInt(input.staggerDelayMs, min, max, `${path}.staggerDelayMs`, errs)) out.staggerDelayMs = input.staggerDelayMs;
  }
  if (input.hero !== undefined) {
    const h = input.hero;
    if (!isObj(h)) errs.add(`${path}.hero`, 'Must be an object');
    else {
      checkUnknown(h, ['transition', 'autoplay', 'intervalMs', 'pauseOnHover'], `${path}.hero`, errs);
      out.hero = { ...(out.hero || DEFAULTS.animation.hero) };
      if (h.transition !== undefined && checkEnum(h.transition, OPTIONS.animation.heroTransition, `${path}.hero.transition`, errs)) out.hero.transition = h.transition;
      if (h.autoplay !== undefined && checkBool(h.autoplay, `${path}.hero.autoplay`, errs)) out.hero.autoplay = h.autoplay;
      if (h.pauseOnHover !== undefined && checkBool(h.pauseOnHover, `${path}.hero.pauseOnHover`, errs)) out.hero.pauseOnHover = h.pauseOnHover;
      if (h.intervalMs !== undefined) {
        const { min, max } = OPTIONS.animation.heroIntervalMs;
        if (checkInt(h.intervalMs, min, max, `${path}.hero.intervalMs`, errs)) out.hero.intervalMs = h.intervalMs;
      }
    }
  }
  return out;
}

// ---------- NAVBAR / FOOTER / CATEGORIES / CSS ----------
function validateLinks(arr, path, errs, max = 8) {
  if (!Array.isArray(arr)) { errs.add(path, 'Must be an array'); return null; }
  if (arr.length > max) { errs.add(path, `At most ${max} links allowed`); return null; }
  const out = [];
  arr.forEach((l, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(l)) { errs.add(p, 'Must be an object {label, href}'); return; }
    checkUnknown(l, ['label', 'href', 'to'], p, errs);
    const label = checkString(l.label, 30, `${p}.label`, errs, { allowEmpty: false });
    const href = checkLink(l.href ?? l.to, `${p}.href`, errs, { allowEmpty: false });
    if (label && href) out.push({ label, href });
  });
  return out;
}

const NAV_HIDE_KEYS = ['menu', 'search', 'category', 'language', 'region', 'colorMode', 'favourites', 'cart', 'account', 'links'];

function validateNavbar(input, current, errs) {
  const path = 'navbar';
  const out = mergeNavbar(current);
  if (!isObj(input)) { errs.add(path, 'Must be an object'); return out; }
  checkUnknown(input, ['searchPlaceholder', 'links', 'bgColor', 'bgColor2', 'height', 'maxWidth', 'hide'], path, errs);
  if (input.searchPlaceholder !== undefined) {
    const s = checkString(input.searchPlaceholder, 100, `${path}.searchPlaceholder`, errs);
    if (s != null) out.searchPlaceholder = s;
  }
  if (input.links !== undefined) { const l = validateLinks(input.links, `${path}.links`, errs); if (l) out.links = l; }
  // colours: '' clears the override (falls back to the layout's default navbar colour)
  ['bgColor', 'bgColor2'].forEach((k) => {
    if (input[k] === undefined) return;
    if (input[k] === '' || input[k] === null) { out[k] = ''; return; }
    const n = checkHex(input[k], `${path}.${k}`, errs); if (n) out[k] = n;
  });
  if (input.height !== undefined && checkInt(input.height, 0, 160, `${path}.height`, errs)) out.height = input.height; // 0 = automatic
  if (input.maxWidth !== undefined && checkInt(input.maxWidth, 0, 2560, `${path}.maxWidth`, errs)) out.maxWidth = input.maxWidth; // 0 = full width
  if (input.hide !== undefined) {
    if (!isObj(input.hide)) errs.add(`${path}.hide`, 'Must be an object');
    else {
      checkUnknown(input.hide, NAV_HIDE_KEYS, `${path}.hide`, errs);
      const hide = { ...(out.hide || {}) };
      NAV_HIDE_KEYS.forEach((k) => { if (input.hide[k] !== undefined && checkBool(input.hide[k], `${path}.hide.${k}`, errs)) hide[k] = input.hide[k]; });
      out.hide = hide;
    }
  }
  return out;
}

function validateFooter(input, current, errs) {
  const path = 'footer';
  const out = mergeFooter(current);
  if (!isObj(input)) { errs.add(path, 'Must be an object'); return out; }
  checkUnknown(input, ['about', 'tagline', 'email', 'phone', 'address', 'copyright', 'columns', 'social'], path, errs);
  ['tagline', 'email', 'phone', 'address'].forEach((k) => { if (input[k] !== undefined) { const v = checkString(input[k], 200, `${path}.${k}`, errs); if (v != null) out[k] = v; } });
  if (input.about !== undefined) { const s = checkString(input.about, 500, `${path}.about`, errs); if (s != null) out.about = s; }
  if (input.copyright !== undefined) { const s = checkString(input.copyright, 100, `${path}.copyright`, errs); if (s != null) out.copyright = s; }
  if (input.columns !== undefined) {
    if (!Array.isArray(input.columns) || input.columns.length > 4) errs.add(`${path}.columns`, 'Must be an array of at most 4 columns');
    else {
      const cols = [];
      input.columns.forEach((c, i) => {
        const p = `${path}.columns[${i}]`;
        if (!isObj(c)) { errs.add(p, 'Must be an object {title, links}'); return; }
        checkUnknown(c, ['title', 'links'], p, errs);
        const title = checkString(c.title, 40, `${p}.title`, errs, { allowEmpty: false });
        const links = validateLinks(c.links || [], `${p}.links`, errs);
        if (title && links) cols.push({ title, links });
      });
      out.columns = cols;
    }
  }
  if (input.social !== undefined) {
    if (!Array.isArray(input.social) || input.social.length > 8) errs.add(`${path}.social`, 'Must be an array of at most 8 entries');
    else {
      const soc = [];
      input.social.forEach((s, i) => {
        const p = `${path}.social[${i}]`;
        if (!isObj(s)) { errs.add(p, 'Must be an object {platform, url}'); return; }
        checkUnknown(s, ['platform', 'url'], p, errs);
        const platform = checkString(s.platform, 30, `${p}.platform`, errs, { allowEmpty: false });
        const url = typeof s.url === 'string' && /^https:\/\/[^\s<>"']+$/i.test(s.url.trim()) ? s.url.trim() : null;
        if (!url) errs.add(`${p}.url`, 'Must be an https:// URL');
        if (platform && url) soc.push({ platform, url });
      });
      out.social = soc;
    }
  }
  return out;
}

function validateCategories(input, errs) {
  const path = 'categories';
  if (!Array.isArray(input)) { errs.add(path, 'Must be an array'); return null; }
  if (input.length > CATEGORIES.length) { errs.add(path, `At most ${CATEGORIES.length} entries`); return null; }
  const seen = new Set();
  const out = [];
  input.forEach((c, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(c)) { errs.add(p, 'Must be an object {name, emoji, tone}'); return; }
    checkUnknown(c, ['name', 'label', 'emoji', 'tone', 'visible'], p, errs);
    const canonical = typeof c.name === 'string' ? CATEGORIES.find((x) => x.toLowerCase() === c.name.trim().toLowerCase()) : null;
    if (!canonical) { errs.add(`${p}.name`, `Must be one of: ${CATEGORIES.join(', ')}`); return; }
    if (seen.has(canonical)) { errs.add(`${p}.name`, 'Duplicate category'); return; }
    seen.add(canonical);
    const entry = { name: canonical };
    if (c.label !== undefined) { const s = checkString(c.label, 40, `${p}.label`, errs); if (s != null) entry.label = s; }
    if (c.emoji !== undefined) { const s = checkString(c.emoji, 8, `${p}.emoji`, errs); if (s != null) entry.emoji = s; }
    if (c.tone !== undefined) { const n = checkHex(c.tone, `${p}.tone`, errs); if (n) entry.tone = n; }
    if (c.visible !== undefined && checkBool(c.visible, `${p}.visible`, errs)) entry.visible = c.visible;
    out.push(entry);
  });
  return out;
}

function validateStorefront(input, current, errs) {
  const path = 'storefront';
  const out = mergeStorefront(current);
  if (!isObj(input)) { errs.add(path, 'Must be an object'); return out; }
  checkUnknown(input, ['layout', 'sidebarEnabled', 'sidebarPosition', 'cardVariant', 'portfolioDark', 'designVersion', 'page', 'cards'], path, errs);
  if (input.layout !== undefined && checkEnum(input.layout, STOREFRONT_OPTIONS.layout, `${path}.layout`, errs)) out.layout = input.layout;
  if (input.sidebarPosition !== undefined && checkEnum(input.sidebarPosition, STOREFRONT_OPTIONS.sidebarPosition, `${path}.sidebarPosition`, errs)) out.sidebarPosition = input.sidebarPosition;
  if (input.cardVariant !== undefined && checkEnum(input.cardVariant, STOREFRONT_OPTIONS.cardVariant, `${path}.cardVariant`, errs)) out.cardVariant = input.cardVariant;
  if (input.sidebarEnabled !== undefined && checkBool(input.sidebarEnabled, `${path}.sidebarEnabled`, errs)) out.sidebarEnabled = input.sidebarEnabled;
  if (input.portfolioDark !== undefined && checkBool(input.portfolioDark, `${path}.portfolioDark`, errs)) out.portfolioDark = input.portfolioDark;

  // Page + grid-card sizing (px). 0 means "automatic / theme default".
  const sizeBlock = (key, spec) => {
    if (input[key] === undefined) return;
    const b = input[key];
    if (!isObj(b)) { errs.add(`${path}.${key}`, 'Must be an object'); return; }
    checkUnknown(b, Object.keys(spec), `${path}.${key}`, errs);
    const next = { ...(isObj(out[key]) ? out[key] : {}) };
    Object.entries(spec).forEach(([f, [min, max]]) => {
      if (b[f] !== undefined && checkInt(b[f], min, max, `${path}.${key}.${f}`, errs)) next[f] = b[f];
    });
    out[key] = next;
  };
  sizeBlock('page', { maxWidth: [0, 2560], paddingX: [0, 120], paddingY: [0, 160], marginTop: [0, 160], marginBottom: [0, 160] });
  sizeBlock('cards', { minWidth: [0, 480], imageHeight: [0, 600], gap: [0, 64], padding: [0, 48], margin: [0, 48] });
  return out;
}

function validateCustomCss(input, errs) {
  if (typeof input !== 'string') { errs.add('customCSS', 'Must be a string'); return null; }
  if (input.length > MAX_CSS) { errs.add('customCSS', `Must be at most ${MAX_CSS} characters`); return null; }
  return sanitizeCss(input);
}

// ---------- HERO IMAGES ----------
const HERO_KEYS = ['url', 'alt', 'link', 'caption', 'overlayColor', 'overlayOpacity', 'textColor', 'textAlign'];
const HERO_DEFAULT = { alt: '', link: '', caption: '', overlayColor: '#000000', overlayOpacity: 0.3, textColor: '#ffffff', textAlign: 'left' };

/** Validate the settings part of a hero item (everything except url). Returns a clean object. */
function validateHeroSettings(input, base, path, errs) {
  const out = { ...HERO_DEFAULT, ...base };
  if (!isObj(input)) return out;
  checkUnknown(input, HERO_KEYS, path, errs, ['_id', 'id']);
  if (input.alt !== undefined) { const s = checkString(input.alt, OPTIONS.hero.altMax, `${path}.alt`, errs); if (s != null) out.alt = s; }
  if (input.caption !== undefined) { const s = checkString(input.caption, OPTIONS.hero.captionMax, `${path}.caption`, errs); if (s != null) out.caption = s; }
  if (input.link !== undefined) { const s = checkLink(input.link, `${path}.link`, errs); if (s != null) out.link = s; }
  if (input.overlayColor !== undefined) { const n = checkHex(input.overlayColor, `${path}.overlayColor`, errs); if (n) out.overlayColor = n; }
  if (input.textColor !== undefined) { const n = checkHex(input.textColor, `${path}.textColor`, errs); if (n) out.textColor = n; }
  if (input.overlayOpacity !== undefined && checkNumber(input.overlayOpacity, 0, 0.8, `${path}.overlayOpacity`, errs)) out.overlayOpacity = input.overlayOpacity;
  if (input.textAlign !== undefined && checkEnum(input.textAlign, OPTIONS.hero.textAlign, `${path}.textAlign`, errs)) out.textAlign = input.textAlign;
  return out;
}

/**
 * Build the new ordered hero list.
 * @param existingInput ordered array of URL strings or {url, ...settings}; only URLs already stored are allowed
 * @param currentHeroes currently stored items
 * @param newFiles      uploaded files (multer), appended after the kept items
 * @param newMeta       optional array of settings aligned with newFiles
 * @returns { items, removedUrls }
 */
function buildHeroImages({ existingInput, currentHeroes, newFiles, newMeta, toUrl }, errs) {
  const current = (currentHeroes || []).map((h) => (h.toObject ? h.toObject() : h));
  const byUrl = new Map(current.map((h) => [h.url, h]));
  let kept;
  if (existingInput === undefined) kept = current; // not provided -> keep everything as is
  else if (!Array.isArray(existingInput)) { errs.add('existingHeroImages', 'Must be an ordered JSON array'); return null; }
  else {
    kept = [];
    const seen = new Set();
    existingInput.forEach((entry, i) => {
      const p = `existingHeroImages[${i}]`;
      const url = typeof entry === 'string' ? entry : isObj(entry) ? entry.url : undefined;
      if (typeof url !== 'string' || !byUrl.has(url)) { errs.add(p, 'Unknown image URL – only currently stored hero images can be kept'); return; }
      if (seen.has(url)) { errs.add(p, 'Duplicate image'); return; }
      seen.add(url);
      const base = byUrl.get(url);
      kept.push(isObj(entry) ? { url, ...validateHeroSettings(entry, base, p, errs) } : { ...base });
    });
  }
  const files = newFiles || [];
  if (kept.length + files.length > OPTIONS.hero.max) {
    errs.add('heroImages', `A maximum of ${OPTIONS.hero.max} hero images is allowed (kept ${kept.length} + new ${files.length})`);
    return null;
  }
  if (newMeta !== undefined && !Array.isArray(newMeta)) { errs.add('heroImagesMeta', 'Must be a JSON array aligned with the uploaded files'); return null; }
  const added = files.map((f, i) => ({
    url: toUrl(f),
    ...validateHeroSettings(newMeta && newMeta[i], { alt: '' }, `heroImagesMeta[${i}]`, errs),
  }));
  const items = [...kept, ...added];
  const keptUrls = new Set(items.map((h) => h.url));
  const removedUrls = current.filter((h) => !keptUrls.has(h.url)).map((h) => h.url);
  return { items, removedUrls };
}

// ---------- SERIALISATION ----------
const kebab = (s) => s.replace(/([A-Z])/g, '-$1').toLowerCase();

function resolveAnimation(anim) {
  const enabled = !!anim.enabled;
  const mult = enabled ? SPEED_MULTIPLIER[anim.speed] ?? 1 : 0;
  const ms = (base) => Math.round(base * mult);
  return {
    enabled,
    multiplier: mult,
    durationMs: { base: ms(BASE_DURATION_MS), hover: ms(200), button: ms(250), page: ms(350), entrance: ms(500), heroTransition: ms(800) },
  };
}

function resolveCssVars(cfg) {
  const vars = {};
  const t = cfg.theme;
  COLOR_KEYS.forEach((k) => { vars[`--color-${kebab(k)}`] = t.colors[k]; });
  vars['--font-family'] = FONT_STACKS[t.fontFamily] || FONT_STACKS.system;
  vars['--gradient'] = t.gradient && t.gradient.enabled
    ? `linear-gradient(${t.gradient.angle}deg, ${t.gradient.from}, ${t.gradient.to})` : 'none';
  vars['--gradient-from'] = t.gradient.from;
  vars['--gradient-to'] = t.gradient.to;

  const cardVars = (prefix, c) => {
    vars[`--${prefix}-radius`] = `${RADIUS_PX[c.radius]}px`;
    vars[`--${prefix}-shadow`] = c.variant === 'flat' || c.variant === 'outlined' ? 'none' : SHADOW_CSS[c.shadow];
    vars[`--${prefix}-aspect`] = ASPECT_CSS[c.imageAspect];
    vars[`--${prefix}-image-fit`] = c.imageFit;
    vars[`--${prefix}-badge-color`] = c.badgeColor;
    vars[`--${prefix}-accent-color`] = c.accentColor;
    vars[`--${prefix}-cols-mobile`] = String(c.columns.mobile);
    vars[`--${prefix}-cols-tablet`] = String(c.columns.tablet);
    vars[`--${prefix}-cols-desktop`] = String(c.columns.desktop);
  };
  cardVars('product-card', cfg.cardDesign.product);
  cardVars('company-card', cfg.cardDesign.company);
  cardVars('card', cfg.cardDesign.product); // generic alias -> product card

  const r = resolveAnimation(cfg.animation);
  vars['--anim-speed'] = String(r.multiplier);
  vars['--anim-duration'] = `${r.durationMs.base}ms`;
  vars['--anim-hover-duration'] = `${r.durationMs.hover}ms`;
  vars['--anim-button-duration'] = `${r.durationMs.button}ms`;
  vars['--anim-page-duration'] = `${r.durationMs.page}ms`;
  vars['--anim-entrance-duration'] = `${r.durationMs.entrance}ms`;
  vars['--anim-hero-duration'] = `${r.durationMs.heroTransition}ms`;
  vars['--anim-hero-interval'] = `${cfg.animation.hero.intervalMs}ms`;
  vars['--anim-stagger-delay'] = r.enabled ? `${cfg.animation.staggerDelayMs}ms` : '0ms';
  return vars;
}

function resolveClassNames(cfg) {
  const a = cfg.animation;
  const card = (c) => ['card', `card-${c.variant}`, `card-radius-${c.radius}`, `card-shadow-${c.shadow}`,
    `card-aspect-${c.imageAspect}`, `card-fit-${c.imageFit}`, `price-${c.priceStyle}`,
    a.enabled ? `card-hover-${a.cardHover}` : 'card-hover-none'].join(' ');
  return {
    root: [`theme-${cfg.theme.mode}`, `preset-${cfg.theme.preset}`, `font-${String(cfg.theme.fontFamily).toLowerCase()}`,
      a.enabled ? 'anim-on' : 'anim-off', `anim-speed-${a.speed}`,
      `page-${a.enabled ? a.pageTransition : 'none'}`, `entrance-${a.enabled ? a.entrance : 'none'}`,
      `btn-${a.enabled ? a.buttonEffect : 'none'}`].join(' '),
    heroTransition: a.enabled ? a.hero.transition : 'none',
    productCard: card(cfg.cardDesign.product),
    companyCard: card(cfg.cardDesign.company),
  };
}

/** Older documents miss the newer fields; fill them from DEFAULTS so every client sees a complete object. */
function mergeNavbar(n) {
  const cur = isObj(n) ? clone(n) : {};
  return { ...clone(DEFAULTS.navbar), ...cur, hide: { ...DEFAULTS.navbar.hide, ...(isObj(cur.hide) ? cur.hide : {}) } };
}
function mergeFooter(f) {
  const cur = isObj(f) ? clone(f) : {};
  const out = { ...clone(DEFAULTS.footer), ...cur };
  // Footers saved before the new defaults (empty columns / social / old copyright) get the default content.
  if (!Array.isArray(cur.columns) || !cur.columns.length) out.columns = clone(DEFAULTS.footer.columns);
  if (!Array.isArray(cur.social) || !cur.social.length) out.social = clone(DEFAULTS.footer.social);
  if (!cur.copyright || cur.copyright === '© Shopfluence') out.copyright = DEFAULTS.footer.copyright;
  return out;
}
function mergeStorefront(sf) {
  const cur = isObj(sf) ? sf : {};
  const d = DEFAULTS.storefront;
  return { ...d, ...cur, page: { ...d.page, ...(isObj(cur.page) ? cur.page : {}) }, cards: { ...d.cards, ...(isObj(cur.cards) ? cur.cards : {}) } };
}

/** Public/admin representation of the global config (no history, no internals). */
function serializeConfig(doc) {
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const cfg = {
    heroImages: (o.heroImages || []).map((h) => ({ ...h })),
    theme: clone(o.theme),
    cardDesign: clone(o.cardDesign),
    animation: clone(o.animation),
    navbar: mergeNavbar(o.navbar),
    footer: mergeFooter(o.footer),
    categories: clone(o.categories || []),
    storefront: mergeStorefront(o.storefront), // older documents fall back to defaults
    customCSS: o.customCSS || '',
  };
  delete cfg.animation.resolved;
  cfg.animation.respectReducedMotion = true; // always true, read-only
  cfg.animation.resolved = resolveAnimation(cfg.animation);
  return {
    ...cfg,
    cssVars: resolveCssVars(cfg),
    classNames: resolveClassNames(cfg),
    updatedAt: o.updatedAt,
  };
}

/** Allowed values for the admin UI */
function describeOptions() {
  return {
    presets: Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label, colors: p.colors })),
    options: {
      theme: OPTIONS.theme,
      colorKeys: COLOR_KEYS,
      wcagMinContrast: 4.5,
      card: OPTIONS.card,
      animation: { ...OPTIONS.animation, speedMultipliers: SPEED_MULTIPLIER, respectReducedMotion: 'always true (read-only)' },
      hero: OPTIONS.hero,
      storefront: STOREFRONT_OPTIONS,
      categories: CATEGORIES,
      customCSS: { maxLength: MAX_CSS },
      upload: { field: 'heroImages', maxFiles: OPTIONS.hero.max, maxFileSizeMB: 5, types: ['png', 'jpg', 'webp', 'gif', 'avif'] },
    },
    defaults: {
      theme: DEFAULTS.theme, cardDesign: DEFAULTS.cardDesign, animation: DEFAULTS.animation,
      navbar: DEFAULTS.navbar, footer: DEFAULTS.footer, storefront: DEFAULTS.storefront,
    },
  };
}

module.exports = {
  Errs, isObj, clone, parseJsonField,
  validateTheme, contrastError, validateCardDesign, validateAnimation, validateNavbar, validateFooter,
  validateCategories, validateStorefront, validateCustomCss, buildHeroImages,
  serializeConfig, resolveCssVars, resolveClassNames, describeOptions,
};
