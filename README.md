# Shopfluence Backend

REST API for **Shopfluence**, a multi-role marketplace where buyers shop from companies, companies hire managers and salesmen, salesmen earn affiliate commission, and **Shopfluence Management** controls the platform and the storefront's look.

Stack: Node 18+, Express 4, Mongoose 8 (MongoDB **5.0+** – the salesman weekly stats use `$dateTrunc`), JWT (httpOnly cookie `token`, Bearer fallback), bcryptjs (cost 12), helmet, cors, express-rate-limit, multer.

## Setup

```bash
cd shopfluence-backend
npm install
cp .env.example .env        # then edit MONGO_URI, JWT_SECRET and the admin credentials
npm run seed:shopfluence    # admin + sample companies/products/users + default storefront config
npm run dev                 # node --watch   (or: npm start)
```

| Env key | Required | Default | Notes |
|---|---|---|---|
| `MONGO_URI` | yes | – | MongoDB connection string |
| `JWT_SECRET` | yes | – | long random string |
| `PORT` | no | `5000` | |
| `JWT_EXPIRES` | no | `7d` | |
| `CLIENT_URL` | no | `http://localhost:5173` | comma-separated list of allowed frontend origins |
| `DEFAULT_COMMISSION_RATE` | no | `5` | default company affiliate rate and platform commission (%) |
| `SHOPFLUENCE_ADMIN_NAME` / `_EMAIL` / `_PASSWORD` | for seeding | name defaults to "Shopfluence Management" | the admin account created by the seed |
| `SEED_SAMPLE_PASSWORD`, `SEED_SAMPLE_DATA` | no | – | sample-account password; sample data is skipped in production unless `SEED_SAMPLE_DATA=true` |

**Six ready-made stores:** `npm run seed:stores` creates the store owners `sk0963401@gmail.com` … `sk0963406@gmail.com` (one shared password – `SEED_STORE_PASSWORD`, default `Store@12345`; `--reset-password` resets it on existing accounts), their stores (Volt Tech Hub, Urban Threads, Fresh Basket Grocers, Little Wonders Toys, Home & Hearth Furniture, Deal Dock) with different ratings, and 5 products each (30 in total, covering Tech, Clothes, Groceries, Toys, Furniture, Offers and Accessories) with generated placeholder pictures and a few scheduled offers. Safe to run again.

Seed flags: `--reset-ui` restores the default storefront config, `--no-sample` seeds only the admin and the config. Sample accounts are `techtonic|threadline|manager|salesman|applicant|buyer@shopfluence.local`.

**Auth**: the JWT is set as httpOnly cookie `token` (`secure` + `sameSite=none` in production, `lax` otherwise). Send `credentials: 'include'` from the frontend, or use `Authorization: Bearer <token>`.
**Errors** always look like `{ "message": "...", "errors": [{ "field": "...", "message": "..." }] }` (400 bad input, 401 not signed in, 403 forbidden, 404, 409 conflict/duplicate, 422 validation, 429 rate limited).
**Users** are returned as `{ user: { id, name, email, role, ... } }` – `id`, never `_id`.

## Roles

`buyer`, `company`, `manager`, `salesman` (self-register) and `shopfluence_management` ("Shopfluence Management", created only by the seed). Managers and salesmen must be **hired** (`isHired` + `assignedCompany`) to use company features. Guard order on every route: `protect → authorize(...) → (requireHired | attachCompanyScope)`.

## API reference

### Auth – `/api/auth` (rate limited: 50 / 15 min)
| Method & path | Who | Body / notes |
|---|---|---|
| `POST /register` | public | `{name, email, password (min 8), role: buyer\|company\|manager\|salesman, companyName (company only), phone?}` → `201 {user}`. Salesmen get an affiliate code `SAIL-XXXXXX` (`uniqueSailorId`). |
| `POST /login` | public | `{email, password}` → `{user}` |
| `POST /logout` | public | clears the cookie |
| `GET /me` | any | `{user}` |
| `POST /change-password` | any | `{currentPassword, newPassword}` (used to replace one-time credentials) |

### Companies – `/api/companies`
| | |
|---|---|
| `GET /?hiring=true&sort=rating&q=&page=&limit=` | public. `sort`: `rating` (default, top-listed), `reviews`, `newest`, `name`. `q` searches the company name. |
| `GET /:id`, `GET /:id/reviews` | public |
| `POST /:id/rate` | buyer with a **delivered** order from that company. `{rating 1-5, comment?}`. One review per buyer per company (re-rating updates it); the company's average `rating`/`ratingCount` is recomputed. |

### Company panel – `/api/company` (role `company`)
`GET|PUT /me` (multipart `logo`; `name, description, isHiring, commissionRate 0-50`) · `PATCH /hiring {isHiring}` · `GET /applications?status=` · `PUT /applications/:id {status: interview_scheduled\|approved\|rejected, interviewAt (required for interview_scheduled, future date-time), interviewNote?, assignedManagerId?}` (pending → interview_scheduled → approved/rejected; approval sets `isHired`, `assignedCompany`, optional `assignedManager`). **Only manager applications get an interview** – salesman applications are approved/rejected directly (`interview_scheduled` is rejected with 409) · `GET /salesmen`, `DELETE /salesmen/:id` · `GET /managers`, `DELETE /managers/:id` · **`POST /salesmen`** and **`POST /managers`** `{name, email, phone?, password?}` add staff directly with no application → `{salesman|manager, credentials}` (one-time credentials, `mustChangePassword`) · `GET /analytics`.
Removing staff releases them from the company (`isHired=false`, `status=unassigned`); the account itself is kept.

### Applications – `/api/applications` (manager, salesman)
`POST /apply {companyId, type, message?}` (company must be hiring; `type` = your role) · `GET /mine`.

### Managers – `/api/managers` (hired manager)
`POST /create-salesman {name, email, phone?, password?}` → `{salesman, credentials}` (one-time credentials; a password is generated if omitted; `mustChangePassword` is set) · `GET /salesmen` · `DELETE /salesmen/:id` · `GET /analytics`.

### Salesmen – `/api/salesmen` (hired salesman)
`GET /stats` (totals, commission, **weekly breakdown** for 8 weeks, orders by status) · `GET /orders` (orders placed with your affiliate code) · `GET /products` (active products of the store that hired you, with `commissionPerSale`, clicks per product and clicks / orders / commission per social platform).

### Affiliate tracking – `/api/affiliate` (public, 60 req/min)
`POST /click {code, productId?, source?}` → `204`. Records one visit that arrived through a salesman link (`source`: `instagram | facebook | twitter | youtube | tiktok | direct`). `POST /api/orders` also accepts `affiliateSource` next to `affiliateCode`, so orders are credited to the platform that produced them.

### Products – `/api/products`
| | |
|---|---|
| `GET /?q=&category=&company=&onOffer=&minPrice=&maxPrice=&sort=&page=&limit=` | public. `onOffer=true` = only products whose scheduled offer is running now. Every product carries `offerPercent`, `offerStartsAt`, `offerEndsAt`, `offerStatus` (`none\|scheduled\|active\|expired`) and `salePrice` (the price charged right now). `q` matches the product name; `category` is case-insensitive (`tech, clothes, groceries, accessories, toys, offers, furniture`); `sort`: `newest, price_asc, price_desc, popular`. Hides `stockIn, stockOut, totalSales, profitMargin`, inactive and sold-out items. |
| `GET /:id` | public |
| `GET /manage/mine?active=` | company owner / hired manager – full details |
| `POST /` | company owner / hired manager. Multipart: `title, description, category, price, stockIn, profitMargin, images[]` (max 6), optional scheduled offer `offerPercent (1-90), offerStartsAt, offerEndsAt` |
| `PUT /:id` | same (send `offerPercent=0` to clear an offer); `existingImages` (JSON array of URLs to keep) + new `images[]`; removed files are deleted |
| `PATCH /:id/stock {quantity}` | adds to `stockIn` |
| `PATCH /:id/active {isActive}` · `DELETE /:id` | reactivate / deactivate |

### Orders – `/api/orders`
| | |
|---|---|
| `POST /` | buyer. `{items:[{productId, quantity}], shippingAddress?, affiliateCode?}` → `201 {orders, order?}`. Prices come from the DB; stock is reserved atomically and rolled back on failure; **one order per company**. Affiliate commission applies only if the salesman works for the selling company, at that company's `commissionRate`. |
| `GET /mine` | buyer (`?status=`) |
| `GET /` | company / hired manager – orders placed with their company (`?status=&page=&limit=`) |
| `GET /:id` | buyer (own), company scope, or admin |
| `PATCH /:id/status {status, note?}` | company / hired manager. **Forward-only**: pending → confirmed → shipped → delivered. Cancel/refund are rejected here. |
| `POST /:id/dispute {reason}` | buyer, once shipped/delivered |

### Favourites – `/api/favourites` (any signed-in user)
`POST /toggle {targetType: company\|salesman\|product, targetId}` → `{favourited}` · `GET /mine` → `{favourites, companies, products, salesmen}`.

### Messages – `/api/messages` (company owner, hired managers, salesmen of the **same** company)
`GET /contacts` · `POST /conversations {recipientId}` (start or fetch) · `GET /conversations` (with `unreadCount`) · `GET /:conversationId?before=&limit=` (marks as read) · `POST /:conversationId {body}`.
Access is re-checked on every call, so people released from the company lose access.

### Support – `/api/support` (buyer, company, manager, salesman)
`POST / {type: problem\|feedback, subject, message, priority?}` · `GET /mine` · `GET /:id` · `POST /:id/reply {message}`.

### Shopfluence Management – `/api/shopfluence`
| | |
|---|---|
| `GET /ui-config` | **public**. Full storefront config + `cssVars`, `classNames`, `updatedAt`. Sends an ETag (304 on `If-None-Match`) and `Cache-Control: public, max-age=30`. |
| `GET /ui-config/presets` | **public**. Built-in presets and every allowed option value (for building admin controls). |
| `PUT /ui-config` | admin, rate limited. JSON or multipart, partial (see below). |
| `POST /ui-config/reset {section}` | admin. `theme \| cardDesign \| animation \| storefront \| categories \| heroImages \| all` |
| `GET\|PUT /commission` | admin. `{rate}` = platform commission on sales (0-50). `{companyId, platformCommissionRate\|null}` = per-company platform override. `{companyId, commissionRate}` = that company's affiliate rate. |
| `GET /orders` · `PATCH /orders/:id/override {status, note?}` | admin. Any status except out of cancelled/refunded; `cancelled`/`refunded` restore stock and sales exactly once. |
| `GET /support?role=&status=&priority=&type=&q=` · `GET /support/:id` · `POST /support/:id/reply {message, status?}` · `PATCH /support/:id {status?, priority?}` | admin |
| `GET /overview` | admin – counts and platform earnings |

## Customising the storefront

Management changes the storefront without a deploy. All values are validated against whitelists (never free-form CSS) and stored in the single global `UIConfig` document. The frontend reads `GET /api/shopfluence/ui-config` and applies `cssVars` (CSS custom properties) and `classNames`.

`PUT /api/shopfluence/ui-config` is a **partial update**: only the sections present are changed and each is deep-merged. Send JSON, or multipart where JSON sections are JSON strings (malformed JSON → `400`). Validation problems → `422 {message, errors}`. Every change snapshots the previous config (last 10 kept; hero images are not snapshotted).

### `heroImages` (max 8)
Upload files in the multipart field **`heroImages`** (≤ 8 files, 5 MB each, png/jpg/webp/gif/avif). **`existingHeroImages`** is a JSON ordered array of the URLs (or `{url, ...settings}` objects) to keep, which sets order and per-image settings; stored images not listed are deleted from disk. New files are appended in upload order; optional **`heroImagesMeta`** (JSON array aligned with the files) sets their settings. Kept + new > 8 is rejected.

| Field | Allowed |
|---|---|
| `alt` | string ≤ 120 |
| `link` | internal path (`/products`) or `https://` URL |
| `caption` | string ≤ 140 |
| `overlayColor`, `textColor` | hex (`#fff` or `#ffffff`) |
| `overlayOpacity` | 0 – 0.8 |
| `textAlign` | `left`, `center`, `right` |

### `theme`
| Field | Allowed |
|---|---|
| `mode` | `light`, `dark`, `auto` |
| `preset` | `shopfluence-blue` (default), `midnight`, `ocean`, `sunset`, `forest`, `mono`, `custom`. A built-in preset **derives** `colors`; sending only `colors` switches to `custom`. |
| `colors` (custom) | `primary, primaryContrast, secondary, accent, background, surface, text, mutedText, border, success, danger` – 3/6-digit hex |
| `gradient` | `{enabled: bool, from: hex, to: hex, angle: 0-360}` |
| `fontFamily` | `Poppins`, `Inter`, `Roboto`, `Montserrat`, `system` (no custom font URLs) |

**Contrast**: a colour set is rejected with `422` unless text/background, text/surface and primaryContrast/primary are ≥ **4.5:1** (WCAG AA). The error names the failing pair and its ratio.

### `cardDesign` – `product` and `company` blocks (same shape)
| Field | Allowed |
|---|---|
| `variant` | `flat`, `elevated`, `outlined`, `glass` |
| `radius` | `none`, `sm`, `md`, `lg`, `xl`, `full` |
| `shadow` | `none`, `sm`, `md`, `lg` |
| `imageAspect` | `square`, `portrait`, `landscape` |
| `imageFit` | `cover`, `contain` |
| `showRating`, `showCompany`, `showQuickAdd`, `showFavourite` | boolean |
| `priceStyle` | `plain`, `badge`, `highlight` |
| `badgeColor`, `accentColor` | hex |
| `columns` | `{mobile: 1-2, tablet: 2-4, desktop: 3-6}` |

### `animation`
| Field | Allowed |
|---|---|
| `enabled` | boolean (master switch) |
| `speed` | `slow` (×1.6), `normal` (×1), `fast` (×0.6) – the response includes resolved milliseconds in `animation.resolved` |
| `hero` | `{transition: fade\|slide\|zoom\|kenburns\|none, autoplay: bool, intervalMs: 2000-15000, pauseOnHover: bool}` |
| `cardHover` | `none`, `lift`, `zoom`, `glow`, `tilt` |
| `pageTransition` | `none`, `fade`, `slide-up` |
| `entrance` | `none`, `fade-up`, `stagger` |
| `staggerDelayMs` | 0 – 200 |
| `buttonEffect` | `none`, `ripple`, `pulse` |
| `respectReducedMotion` | always `true`, read-only (honour `prefers-reduced-motion`) |

### Other sections
- `navbar`: `{searchPlaceholder ≤ 100, links: [{label ≤ 30, href}]}` (≤ 8 links; `href` = internal path or https URL)
- `footer`: `{about ≤ 500, copyright ≤ 100, columns: [{title, links}] (≤ 4), social: [{platform, url (https)}] (≤ 8)}`
- `categories`: `[{name: Tech\|Clothes\|Offers\|Toys\|Accessories\|Groceries\|Furniture, label?, emoji?, tone?: hex, visible?: boolean}]` (`visible: false` hides that category from the storefront's cards, menus and filters; its products stay in the database)
- `customCSS`: string ≤ 5000 chars; `@import`, `url()`, `expression()`, `behavior`, `-moz-binding`, `javascript:`, `</style>` and HTML tags are stripped.

### What `GET /ui-config` returns
`heroImages, theme, cardDesign, animation, navbar, footer, categories, customCSS, cssVars, classNames, updatedAt`. Example `cssVars`: `--color-primary`, `--color-primary-contrast`, … `--font-family`, `--gradient`, `--product-card-radius`, `--product-card-shadow`, `--product-card-aspect`, `--product-card-cols-desktop` (and the same for `--company-card-*`; `--card-*` mirrors the product card), `--anim-speed` (`0` when animations are disabled), `--anim-duration`, `--anim-hero-interval`, `--anim-stagger-delay`. `classNames` has `root`, `productCard`, `companyCard` and `heroTransition`.

## Project layout

```
config/       env, db, seedShopfluence, themePresets
middlewares/  auth, rbac, upload, errorHandler
controllers/  auth, company, application, manager(+salesman), product, order, favourite, message, support, shopfluence
models/       User, Company, Application, Product, Order, SupportTicket, UIConfig, Conversation, Message, Favourite, Review
routes/       one router per mount point (see server.js)
utils/        colors, sanitizeCss, uiConfig, analytics
public/       placeholder hero SVGs served at /placeholders
uploads/      uploaded images (git-ignored, .gitkeep kept)
```

## Notes
- Stock is reserved with an atomic conditional `$inc`; no multi-document transactions are used, so it works on a standalone MongoDB. Failed orders roll the reservation back.
- Sample companies are seeded with fixed ratings so the "top-listed" ordering is visible; real ratings replace them as soon as a buyer reviews the company.
- Set `NODE_ENV=production` behind HTTPS so cookies are `secure` + `sameSite=none`; `trust proxy` is set to `1`.
#   E c o m m e r c e . n o d e  
 