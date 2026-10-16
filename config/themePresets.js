// Shopfluence – built-in theme presets and allowed design options.
// Every preset satisfies WCAG AA for text/background, text/surface and primaryContrast/primary.

const PRESETS = {
  'shopfluence-blue': {
    label: 'Shopfluence Blue',
    colors: {
      primary: '#2563eb', primaryContrast: '#ffffff', secondary: '#0f172a', accent: '#0ea5e9',
      background: '#ffffff', surface: '#f8fafc', text: '#0a0a0a', mutedText: '#475569',
      border: '#e2e8f0', success: '#15803d', danger: '#b91c1c',
    },
  },
  midnight: {
    label: 'Midnight',
    colors: {
      primary: '#818cf8', primaryContrast: '#0b1020', secondary: '#c7d2fe', accent: '#f472b6',
      background: '#0b1020', surface: '#151b33', text: '#f1f5f9', mutedText: '#a5b4cf',
      border: '#2a3355', success: '#4ade80', danger: '#f87171',
    },
  },
  ocean: {
    label: 'Ocean',
    colors: {
      primary: '#0e7490', primaryContrast: '#ffffff', secondary: '#164e63', accent: '#06b6d4',
      background: '#f0fdff', surface: '#ffffff', text: '#083344', mutedText: '#3f6674',
      border: '#bae6fd', success: '#15803d', danger: '#b91c1c',
    },
  },
  sunset: {
    label: 'Sunset',
    colors: {
      primary: '#c2410c', primaryContrast: '#ffffff', secondary: '#7c2d12', accent: '#f59e0b',
      background: '#fffaf5', surface: '#ffffff', text: '#1c1210', mutedText: '#6b4a3a',
      border: '#fed7aa', success: '#15803d', danger: '#b91c1c',
    },
  },
  forest: {
    label: 'Forest',
    colors: {
      primary: '#15803d', primaryContrast: '#ffffff', secondary: '#14532d', accent: '#84cc16',
      background: '#f7fbf7', surface: '#ffffff', text: '#0f1f13', mutedText: '#47604d',
      border: '#bbf7d0', success: '#166534', danger: '#b91c1c',
    },
  },
  mono: {
    label: 'Mono',
    colors: {
      primary: '#111111', primaryContrast: '#ffffff', secondary: '#404040', accent: '#737373',
      background: '#ffffff', surface: '#f5f5f5', text: '#000000', mutedText: '#525252',
      border: '#d4d4d4', success: '#15803d', danger: '#b91c1c',
    },
  },
};

const COLOR_KEYS = [
  'primary', 'primaryContrast', 'secondary', 'accent', 'background',
  'surface', 'text', 'mutedText', 'border', 'success', 'danger',
];

const OPTIONS = {
  theme: {
    mode: ['light', 'dark', 'auto'],
    preset: [...Object.keys(PRESETS), 'custom'],
    fontFamily: ['Poppins', 'Inter', 'Roboto', 'Montserrat', 'system'],
    gradient: { angle: { min: 0, max: 360 } },
  },
  card: {
    variant: ['flat', 'elevated', 'outlined', 'glass'],
    radius: ['none', 'sm', 'md', 'lg', 'xl', 'full'],
    shadow: ['none', 'sm', 'md', 'lg'],
    imageAspect: ['square', 'portrait', 'landscape'],
    imageFit: ['cover', 'contain'],
    priceStyle: ['plain', 'badge', 'highlight'],
    columns: { mobile: { min: 1, max: 2 }, tablet: { min: 2, max: 4 }, desktop: { min: 3, max: 6 } },
  },
  animation: {
    speed: ['slow', 'normal', 'fast'],
    heroTransition: ['fade', 'slide', 'zoom', 'kenburns', 'none'],
    heroIntervalMs: { min: 2000, max: 15000 },
    cardHover: ['none', 'lift', 'zoom', 'glow', 'tilt'],
    pageTransition: ['none', 'fade', 'slide-up'],
    entrance: ['none', 'fade-up', 'stagger'],
    staggerDelayMs: { min: 0, max: 200 },
    buttonEffect: ['none', 'ripple', 'pulse'],
  },
  hero: {
    max: 8,
    textAlign: ['left', 'center', 'right'],
    overlayOpacity: { min: 0, max: 0.8 },
    altMax: 120,
    captionMax: 140,
  },
};

const SPEED_MULTIPLIER = { slow: 1.6, normal: 1, fast: 0.6 };
const BASE_DURATION_MS = 300;

const RADIUS_PX = { none: 0, sm: 4, md: 8, lg: 16, xl: 24, full: 9999 };
const SHADOW_CSS = {
  none: 'none',
  sm: '0 1px 2px rgba(0,0,0,0.08)',
  md: '0 4px 12px rgba(0,0,0,0.12)',
  lg: '0 12px 32px rgba(0,0,0,0.18)',
};
const ASPECT_CSS = { square: '1 / 1', portrait: '3 / 4', landscape: '4 / 3' };
const FONT_STACKS = {
  Poppins: "'Poppins', system-ui, sans-serif",
  Inter: "'Inter', system-ui, sans-serif",
  Roboto: "'Roboto', system-ui, sans-serif",
  Montserrat: "'Montserrat', system-ui, sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
};

const DEFAULT_CARD = {
  variant: 'elevated',
  radius: 'lg',
  shadow: 'md',
  imageAspect: 'square',
  imageFit: 'cover',
  showRating: true,
  showCompany: true,
  showQuickAdd: true,
  showFavourite: true,
  priceStyle: 'plain',
  badgeColor: '#2563eb',
  accentColor: '#0ea5e9',
  columns: { mobile: 2, tablet: 3, desktop: 4 },
};

// Homepage layout chosen by Shopfluence Management (served to every visitor via ui-config).
const STOREFRONT_OPTIONS = {
  layout: ['standard', 'artisans', 'portfolio'],
  sidebarPosition: ['left', 'right'],
  cardVariant: ['vertical', 'grid', 'banner'],
};

const DEFAULTS = {
  storefront: {
    layout: 'standard', sidebarEnabled: true, sidebarPosition: 'left', cardVariant: 'banner', portfolioDark: true, designVersion: 2,
    page: { maxWidth: 0, paddingX: 0, paddingY: 0, marginTop: 0, marginBottom: 0 },
    cards: { minWidth: 0, imageHeight: 0, gap: 0, padding: 0, margin: 0 },
  },
  theme: {
    mode: 'light',
    preset: 'shopfluence-blue',
    colors: { ...PRESETS['shopfluence-blue'].colors },
    gradient: { enabled: false, from: '#2563eb', to: '#0ea5e9', angle: 135 },
    fontFamily: 'Inter',
  },
  cardDesign: {
    product: { ...DEFAULT_CARD, columns: { ...DEFAULT_CARD.columns } },
    company: { ...DEFAULT_CARD, imageAspect: 'landscape', showQuickAdd: false, showCompany: false, columns: { mobile: 1, tablet: 2, desktop: 3 } },
  },
  animation: {
    enabled: true,
    speed: 'normal',
    hero: { transition: 'fade', autoplay: true, intervalMs: 5000, pauseOnHover: true },
    cardHover: 'lift',
    pageTransition: 'fade',
    entrance: 'fade-up',
    staggerDelayMs: 60,
    buttonEffect: 'ripple',
  },
  navbar: {
    searchPlaceholder: 'Search products or stores…',
    bgColor: '', bgColor2: '', height: 0, maxWidth: 0,
    hide: { menu: false, search: false, category: false, language: false, region: false, colorMode: false, favourites: false, cart: false, account: false, links: false },
    links: [
      { label: 'Home', href: '/' },
      { label: 'Stores', href: '/stores' },
      { label: 'Offers', href: '/search?category=Offers' },
    ],
  },
  footer: {
    about: 'Shopfluence – where brands, managers, salesmen and buyers meet.',
    tagline: 'Shopfluence – where brands, managers, salesmen and buyers meet.',
    email: '', phone: '', address: '',
    copyright: '© All rights reserved by Shopfluence 2026',
    columns: [
      { title: 'Shop', links: [
        { label: 'Tech', href: '/search?category=Tech' }, { label: 'Clothes', href: '/search?category=Clothes' },
        { label: 'Groceries', href: '/search?category=Groceries' }, { label: 'Offers', href: '/search?category=Offers' },
      ] },
      { title: 'Info', links: [
        { label: 'About Shopfluence', href: '/stores' }, { label: 'Stores', href: '/stores' }, { label: 'Sell with us', href: '/register' },
      ] },
      { title: 'Support', links: [
        { label: 'Help centre', href: '/support' }, { label: 'My orders', href: '/orders' }, { label: 'Contact support', href: '/support' },
      ] },
    ],
    social: [
      { platform: 'Facebook', url: 'https://www.facebook.com/shopfluence' },
      { platform: 'Instagram', url: 'https://www.instagram.com/shopfluence' },
      { platform: 'X', url: 'https://x.com/shopfluence' },
      { platform: 'YouTube', url: 'https://www.youtube.com/@shopfluence' },
    ],
  },
  categories: [],
  placeholderHero: [
    { url: '/placeholders/hero-1.svg', alt: 'Shopfluence hero 1', link: '/', caption: 'Discover trending brands', overlayColor: '#000000', overlayOpacity: 0.3, textColor: '#ffffff', textAlign: 'left' },
    { url: '/placeholders/hero-2.svg', alt: 'Shopfluence hero 2', link: '/search', caption: 'Fresh arrivals every day', overlayColor: '#000000', overlayOpacity: 0.3, textColor: '#ffffff', textAlign: 'center' },
    { url: '/placeholders/hero-3.svg', alt: 'Shopfluence hero 3', link: '/stores', caption: 'Shop from top-rated stores', overlayColor: '#000000', overlayOpacity: 0.3, textColor: '#ffffff', textAlign: 'right' },
  ],
};

module.exports = {
  PRESETS, COLOR_KEYS, OPTIONS, DEFAULTS, DEFAULT_CARD, STOREFRONT_OPTIONS,
  SPEED_MULTIPLIER, BASE_DURATION_MS, RADIUS_PX, SHADOW_CSS, ASPECT_CSS, FONT_STACKS,
};
