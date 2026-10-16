// Shopfluence – customCSS sanitizer
const MAX_CSS = 5000;

/**
 * Strips constructs that can load remote resources or execute script:
 * @import, url(), expression(), behavior, -moz-binding, javascript:, </style>, HTML tags.
 * Repeats until stable so nested/obfuscated payloads cannot survive one pass.
 */
function sanitizeCss(input) {
  if (input == null) return '';
  let css = String(input);
  // remove comments first (they can be used to split keywords)
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const patterns = [
    /@import[^;]*;?/gi,
    /url\s*\([^)]*\)?/gi,
    /expression\s*\([^)]*\)?/gi,
    /behaviou?r\s*:[^;}]*;?/gi,
    /-moz-binding\s*:[^;}]*;?/gi,
    /javascript\s*:/gi,
    /vbscript\s*:/gi,
    /<\s*\/?\s*style[^>]*>/gi,
    /<[^>]*>/g,
    /\\/g, // CSS escapes used to hide keywords
  ];
  let prev;
  do {
    prev = css;
    for (const p of patterns) css = css.replace(p, '');
  } while (css !== prev);
  return css.trim().slice(0, MAX_CSS);
}

module.exports = { sanitizeCss, MAX_CSS };
