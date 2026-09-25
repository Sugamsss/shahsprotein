# AGENTS.md: Shah's Nutrition

The one-page guide for anyone (agent or person) working in this repo. Read it before you change anything.

## What this is

Shah's Nutrition is a small Indian food brand (Raggi Jaggi, Muesli, Date Bites) from Satara. This repo is its website: a single landing page plus a small admin area. The brand launched on 2026-09-23. People build an order in the **"Your order" popup** and send it on **WhatsApp**. There's no checkout, no payment and no prices on the site. The order goes to Sunit on the order number, and we reply in the chat with the total, delivery and how to pay. People can also join an email list for news.

The voice is first-person founder (Pranjali): warm, honest, everyday Indian. Not corporate, not gym talk. The ordering copy is the exception: it says "we", and names Sunit as the one who gets the message. `SPEC.md` has the full brand, color and component spec. It's the source of truth for the product.

## Stack and commands

React 18 + TypeScript + Vite + plain CSS + Lucide icons. Supabase handles data and admin. Loops and Resend handle email. The site is hosted on Vercel.

```bash
npm run dev      # local dev server (Vite)
npm run build    # tsc + vite build → dist/  (run this before every commit)
npm run lint     # type check only
npm test         # Vitest: order message and cart logic (src/**/*.test.ts)
```

**A push to `main` deploys to production** at **https://www.shahsnutrition.food**, the one canonical address. `shahsprotein.vercel.app` redirects there (308, set in `vercel.json` by host), so share the www link; Vercel preview deploys use other hosts and keep working. There's no staging. Check your work in a browser at phone and desktop sizes, in light and dark, before you push.

## Where things live

```
src/
├── App.tsx              # Routes: "/" landing page, "/admin/*" admin (Supabase auth, lazy), "*" 404 page
├── components/
│   ├── layout/          # Header (with mobile drawer + Order button), Footer, Container
│   ├── sections/        # Hero, Products (cards + product popup), Values, Story, FAQ, Newsletter
│   ├── ui/              # Primitives: Button, Input, Modal (bottom sheet on phones), ThemeToggle, Toast, OrderLink…
│   ├── order/           # The "Your order" popup (lazy-loaded): lines, tiles, details, coupon, message preview, sent panel
│   ├── pages/           # NotFound (the 404 page)
│   └── admin/           # Admin dashboard, waitlist CRM, campaigns, coupons, analytics
├── data/                # ALL copy and content: products, faqs, values, siteConfig (phone numbers, wa.me links)
├── context/             # ThemeContext, WaitlistContext, OrderContext (cart, details, coupon, popup state)
├── services/            # waitlistService (signup), couponService (coupon check), analyticsService (incl. WhatsApp order clicks)
├── utils/               # contact (wa.me links, click tracking), orderCart and orderMessage (pure, tested), themeAssets (logo + hero paths per theme)
├── hooks/               # useScrollReveal, useSectionSettle (desktop section settle)
├── styles/              # global.css imports tokens → themes → animations; admin-dashboard.css is admin-only
└── types/
supabase/                # migrations, edge functions, README (backend setup and secrets)
public/assets/           # images (WebP) and self-hosted fonts used by the site
Design/, Assets/         # reference designs and asset prompts, not shipped
```

## Rules

- **Copy and data live in `src/data/`, never in JSX.** Phone numbers live only in `siteConfig`. Build WhatsApp links with the helper there.
- **Colors come from tokens** (`tokens.css`, `light-theme.css`, `dark-theme.css`). No hex in components; feedback colours are tokens too (`--color-error`, `--color-success`).
- **Both themes must look right.** Theme is set with `data-theme` on `<html>`.
- **Don't change nutrition panels or product facts** without the founder. Some were restored on purpose.
- **Don't invent facts** such as prices, delivery promises or storage advice. Leave them out until they're confirmed.
- **No prices on the site.** No ₹, totals, delivery costs or payment anywhere, including the order popup and the WhatsApp message. That's the founder's call. Coupon descriptions never show an amount either (the database rejects ₹, Rs and INR).
- **Coupon codes live only in Supabase.** Never put a real code in the code, tests, seeds, docs or commit messages: the repo is public. Use `EXAMPLE10`-style placeholders.
- **Section order is fixed:** Hero → Products → Values → Story → FAQ → Newsletter → Footer. No "building in public" section, even though the reference designs show one.
- The email list code is still named "waitlist" (`useWaitlist`, `waitlistService`, admin screens). That's intentional. Don't rename it.
- **Wrap every `localStorage` / `sessionStorage` access in try/catch**, including the inline script in `index.html`. Browsers that block site storage throw a SecurityError, and one unguarded read blanks the page. A failed read means "nothing saved"; a failed write is skipped.
- Accessibility basics stay: `aria-label` on each section, focus trap and restore in Modal, 44px touch targets on phones, and `:focus-visible` rings.

## Gotchas

- **Full-screen sections settle with JS, not CSS scroll snap.** On desktop, every section is `min-height: 100vh`. When a scroll stops within a quarter of a screen *before* the next section in the direction you're going, `useSectionSettle` glides it to that section's top. It never pulls back against the direction you scrolled, so it can't trap you. It only runs at ≥901px wide, ≥601px tall, with a fine pointer and without reduced motion; phones, short screens and touch screens scroll freely. It waits until the wheel has been quiet for 180ms before settling (a fast wheel fires `scrollend` between notches), and a notch that lands mid-glide cancels the glide, so no notch is lost. Don't bring back CSS `scroll-snap-type` in any form. `mandatory` fought trackpad momentum. `proximity` trapped mouse wheels: the browser's snap zone is a third of the screen (Chrome) and pulls both ways, so every ~100px wheel step out of a section was pulled straight back.
- **Entrance animations fill `backwards`, never `forwards`.** A filled last keyframe keeps a `transform` on the wrapper, which makes it a backdrop root: the frosted blur on the header pill, the phone menu and the hero card quietly turns off. `.header-entrance` and `.hero-card-entrance` use `backwards` for this reason. Don't put a transform, opacity, filter or `will-change` on an ancestor of a glass surface.
- **Hover rules go inside `@media (hover: hover)`.** On phones and tablets a bare `:hover` sticks after a tap. Keep `:active` press states outside it, so touch still feels a tap. Only clickable surfaces react to hover (product cards, closed FAQ rows via `.glass-card.interactive`); static glass cards stay still.
- **The reveal animation moves the inner `.container`, not the section.** Moving the section's box breaks anchor links (the heading lands under the fixed header) and makes the page load already scrolled. See the end of `animations.css`.
- **Where the CSS lives.** `tokens.css` holds the fonts, tokens and the token breakpoints (title size and column width at ≤1024/≤768/≤480). `global.css` goes base rules first, then each section's own tablet and desktop rules next to it, then the **phones, tablets and short screens block at the end** ("Phones, tablets and short screens"), then reduced motion last. Phone fixes go in that end block, so they win ties by source order. There is no `responsive.css` any more.
- **No `!important` and no layout inline styles.** Components use classes; the only inline style left on the landing page is the ingredient sprite position in the product popup. If a rule doesn't apply, fix the order or the selector instead of reaching for `!important`.
- **Popups (product details and "Your order"):** at every size the title and close button form a sticky row (`.modal-head`) and the bottom bar is pinned (`.popup-bar`: the product popup's size switch + "Add to order", or Send); on screens ≤480px tall both scroll instead. "Add to order" switches the product popup to "Your order" in place (`openedFrom: 'product-details'`; the shared `OrderDialog` stays shut for that opener), and `Modal` moves focus to the new title. On phones (≤600px) the popup is a bottom sheet. Closing plays a 240ms exit animation (`EXIT_MS` in `Modal.tsx`, matched in CSS), instant with reduced motion. Test scrolling inside the popup at 320px.
- **Size switch and taps:** the 250 g / 500 g switch (`SizeChoice`) is native radios; the white thumb is the fieldset's `::before`, slid by `--size-index` via `:has()`. In "Your order", a product's only line is keyed by product (not `lineKey`) so changing its size updates the row in place and the thumb slides; keep that key. The browser tap highlight is off site-wide (`html`), so any new control needs its own `:active` press state (and any hover goes inside `@media (hover: hover)`).
- **Phone header and menu:** at ≤400px the theme toggle leaves the header and shows as an "Appearance" row in the menu, a two-half switch with a sliding thumb (`.segmented::before`, moved by `--seg-index` via `:has()`). The section links come from `siteConfig.nav` (header and menu both). While the menu is open, `.mobile-drawer-scrim` (inside the header, `z-index: -1`) covers the page: a tap on it only closes the menu, so it never opens whatever was under the finger.
- **Theme switch:** `ThemeContext` wraps the change in `document.startViewTransition` (a 250ms crossfade), skipped for reduced motion and in browsers without it. The theme's logo and hero art paths live only in `src/utils/themeAssets.ts`; `warmTheme` preloads the other theme's files when someone points at or focuses a switch.
- **Checking glass in WebKit:** Playwright's WebKit (headless or headed) doesn't paint `backdrop-filter` at all, even on a bare test page, so its screenshots can't show whether the blur works. Check the computed styles there, and look at real Safari or an iPhone for the pixels.
- **The order popup.** State is in `OrderContext`; only the cart is saved (localStorage `shahs-order-v1`, every access guarded). Name, pincode and the coupon stay in memory and must never be saved. Lines always show in product order, then pack size (`sortLines`), in the popup and the message. The quantity limit is 10 per line (`siteConfig.order.maxQuantity`). The message is built only by `buildOrderMessage`, and the preview uses the same parts (`orderMessageParts`), so they can't drift apart; `npm test` checks the exact text. If you change the wording in `siteConfig.order.message`, update the tests with it.
- **What counts as an order click.** Only things that open WhatsApp to order: the popup's Send (`trackOrderSend`), its "Message us on WhatsApp" (`trackOrderChat`) and the direct `OrderLink`s. A button that only opens the popup must not call `trackOrderClick`. A new source needs a migration, because `site_events` and `track_site_event` both check it.
- **Sign-up feedback is inline.** Validation errors, success and "already on our list" show under the form (copy in `siteConfig.signup`). The toast is only for server or network failures and stays until closed.
- **Several sessions may share this folder.** Other agents or people may have uncommitted work here. Don't `checkout`, `stash` or `reset` a tree you didn't start in. For parallel work, use a `git worktree` in a sibling folder, and leave untracked files you don't own alone.
- **`Private/` is git-ignored and never published.** It holds pack label drafts, story illustration ideas and unreleased product data. The repo is public, and everything in `public/` is served on the site, so work files, drafts and print artwork go in `Private/`, not in `public/`. Only add a final, compressed image to `public/assets/` when the site actually uses it.
- `temp/` is scratch space for working notes. It isn't product docs.

## Images, fonts and bundle size

- **`/assets/*` is cached for a year as `immutable`.** Never overwrite a file there. A changed image or font gets a new name (`-v2`, `-1200w`), and the code points to it.
- **New images ship as WebP, sized for their slot.** Export at about 3x the largest CSS size the image shows at, or at native size if that's smaller: `cwebp -q 85 -m 6 -sharp_yuv in.png -o out.webp` (`-q 90` for the logo). Transparency is kept, which the sprites and logo need. Keep the PNG master.
- **Adding an image:** export it as above, give it a new file name under `public/assets/` (add a width suffix like `-1200w` for `srcSet` sets), reference it with `width`/`height`, and `loading="lazy" decoding="async"` unless it's above the fold. Never reuse an old name.
- **Share card:** `public/og/shahs-nutrition-v1.jpg`, 1200x630 JPEG under 200 KB, with absolute URLs in `index.html`. WhatsApp caches previews, so a new card needs a new file name (`-v2`) and updated tags.
- **How each image is served:**
  - The hero art has 828/1242/1672w files per theme and is preloaded (same `imagesrcset`) from the inline theme script in `index.html`. If you rename or resize it, change `src/utils/themeAssets.ts` too (Hero and the theme warm-up read it), or it downloads twice. The viewport `<meta>` must stay above that script, or the preload picks the 1672w file on phones.
  - Product cards each get their own crop at the card's 1.3 ratio, in `public/assets/product-cards/`.
  - The story image has an 800/1200/1672w `srcSet` and a fixed `aspectRatio`.
  - Ingredient sprites use 216px per tile, so they're 648px wide.
  - Order popup: the order lines and empty-order rows use square 192w thumbnails (`order-thumbs/`). The "Add something else" tiles use 4:5 shots of the whole pouch (`order-tiles/`, 180/360/540w) with `srcSet`; `TILE_SIZES` in `OrderShelf.tsx` must follow the tile width in CSS. Masters and crop notes are in `Private/order-tiles/`.
- **Below the fold:** `<img loading="lazy" decoding="async">` with `width` and `height`.
- **Fonts are self-hosted:** latin variable woff2 in `public/assets/fonts/`, `@font-face` in `tokens.css`, and a preload in `index.html`. Don't add the Google Fonts link back.
- **Serif:** `--font-family-serif` is `Georgia, 'Gelasio', …`. Gelasio (metric-matched to Georgia) only downloads where Georgia is missing, which is Android. Don't preload it, or everyone downloads it.
- **Admin routes and Supabase are lazy-loaded.** Landing-page code must not import `supabaseClient` statically; `waitlistService` and `couponService` import it when they need it. The "Your order" popup body is its own chunk (`orderPanelLoader.ts`), preloaded when the browser is idle. The landing entry chunk is about 252 kB (82 kB gzipped). A new 500 kB warning means something heavy leaked back in.

## Backend (email list and analytics)

- Supabase is the source of truth for sign-ups, admin access, CRM and analytics. Signups go through the Supabase RPC in `waitlistService.ts`, then the `sync-waitlist-loops` edge function.
- Loops runs double opt-in and the mailing list. `loops-webhook` syncs confirm, unsubscribe and bounce events back.
- WhatsApp order clicks are recorded through a rate-limited RPC into `site_events`, fire and forget. No names, pincodes or codes.
- Coupons: the popup calls `check_coupon` (rate-limited, answers only valid + description). The founder manages codes at `/admin/coupons` through admin-only RPCs. `couponService` lazy-imports Supabase, like `waitlistService`.
- Page views use **Vercel Web Analytics** (cookieless), loaded by `AnalyticsService.startPageViews()` on the landing page only, on the production hosts only. It's Vercel's own `/_vercel/insights/script.js`, so there's no npm package. It records nothing until Web Analytics is enabled for the project in the Vercel dashboard.
- `sync-waitlist-loops` only acts for a member who joined in the last 10 minutes, so the public anon key can't be used to re-send Loops emails.
- Secrets live only in Supabase. Never put them in frontend env vars or commits. Setup and deploy details are in `supabase/README.md`.
