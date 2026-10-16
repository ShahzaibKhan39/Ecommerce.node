// Shopfluence – colour helpers (hex parsing + WCAG contrast)

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const isHex = (v) => typeof v === 'string' && HEX_RE.test(v.trim());

/** Normalise 3/6-digit hex to lowercase 6-digit "#rrggbb". Returns null if invalid. */
function normalizeHex(v) {
  if (!isHex(v)) return null;
  let h = v.trim().slice(1).toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h}`;
}

function hexToRgb(hex) {
  const n = normalizeHex(hex);
  if (!n) return null;
  return [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16));
}

/** WCAG relative luminance */
function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1–21) */
function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const AA_NORMAL = 4.5;

/**
 * Check the required WCAG AA pairs for a colour set.
 * Returns an array of {pair, foreground, background, ratio, required} for failures.
 */
function checkThemeContrast(colors) {
  const pairs = [
    ['text on background', 'text', 'background'],
    ['text on surface', 'text', 'surface'],
    ['primaryContrast on primary', 'primaryContrast', 'primary'],
  ];
  const failures = [];
  for (const [label, fg, bg] of pairs) {
    const ratio = contrastRatio(colors[fg], colors[bg]);
    if (ratio == null || ratio < AA_NORMAL) {
      failures.push({
        pair: label,
        foreground: colors[fg],
        background: colors[bg],
        ratio: ratio == null ? null : Math.round(ratio * 100) / 100,
        required: AA_NORMAL,
      });
    }
  }
  return failures;
}

module.exports = { isHex, normalizeHex, hexToRgb, luminance, contrastRatio, checkThemeContrast, AA_NORMAL };
