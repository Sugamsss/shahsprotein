# Shah's Nutrition website: technical spec

The public site for Shah's Nutrition, a small healthy-food brand from Satara. The brand launched on **2026-09-23**. The site's job is to **help people order on WhatsApp**, and to answer the questions of people holding a pack (the URL is printed on every pack). Email sign-up is a smaller, secondary choice for people who aren't ready to order yet.

Stack: Vite + React + TypeScript (`src/`), deployed on Vercel from this repo. Supabase stores email sign-ups and runs the owner dashboard (`/admin`). Loops sends the double opt-in email.

---

## 1. Brand and voice

- **Name:** Shah's Nutrition. **Tagline:** "Tasty food. Healthy habits. A brighter you." (`siteConfig.tagline`)
- **Voice:** first-person founder (Pranjali). Warm, simple, honest, a bit personal. No hype, no exclamation spam.
- **Honesty rules:** no invented food, health or allergen claims. Food, allergen, delivery and payment wording comes from the founder (see `src/data/faqs.ts` and `src/data/products.ts`). Jaggery counts as added sugar, so never say "no added sugar". No prices are shown yet.

## 2. Themes and design tokens

Tokens live in `src/styles/tokens.css` (type, spacing, radii, z-index) and per theme in `src/styles/light-theme.css` and `src/styles/dark-theme.css`. The theme is stored in `localStorage` (`shahsnutrition_theme`), falling back to the system setting. `index.html` applies it before first paint.

- **Dark:** obsidian surface (`#1f1f1f`), warm gold accent (`#d4af37` to `#b89327`) with dark button text.
- **Light:** soft sky-to-blush canvas (`#eef4fc` base), blue accent (`#3b82f6` to `#2563eb`) with white button text.
- Surfaces are frosted glass cards (`.glass-card`, `--color-bg-card`, `--glass-backdrop`).
- **Order buttons** use the brand accent gradient with a white or dark WhatsApp glyph, not WhatsApp green (`.order-btn` in `global.css`).

CSS order gotcha: `responsive.css` is `@import`ed at the top of `global.css`, so base rules added later in `global.css` override it. Put new breakpoint rules next to their base rules in `global.css`.

## 3. Ordering and contact

All contact details live in one place, `siteConfig.contact` (`src/data/siteConfig.ts`):

| Line | Number | Links | Where it shows |
|---|---|---|---|
| **Order** | 98503 59899 | `https://wa.me/919850359899` | Header, hero, product cards, product popup, FAQ, bottom banner, footer |
| **Customer care** | 98811 91999 | `tel:+919881191999`, `https://wa.me/919881191999` | Under the FAQ list and in the footer only |

Rules:
- A phone number is **always shown with its label** ("Order" or "Customer care").
- Customer care **never** appears in the header or hero, where it would compete with ordering.

Links are built by `src/utils/contact.ts` (the message is URL-encoded):
- General order buttons prefill `Hi! I'd like to place an order.`
- Product buttons prefill `Hi! I'd like to order <Product>.`
- "Ask us on WhatsApp" links (FAQ, missing-nutrition note) open the order chat with nothing prefilled, since they're questions, not orders.

Every order link renders through `OrderLink` (`src/components/ui/OrderLink.tsx`), which opens in a new tab and fires `whatsapp_order_click` with a `source`. Sources: `header`, `hero`, `product:<id>`, `product-details:<id>`, `nutrition:<id>`, `faq`, `banner`, `footer`. `CustomerCareLinks` renders the care line's Call and WhatsApp actions.

**Order click tracking:** `trackOrderClick` calls `AnalyticsService.trackSiteEvent`, which posts `{ p_event, p_source, p_device_type, p_theme }` to the Supabase RPC `track_site_event` with `fetch(..., { keepalive: true })`. It is fire and forget: never awaited, errors ignored, so it can't delay opening WhatsApp. Rows go to `site_events` (migration `20260924000000`) and hold no PII: no IP, user agent, session key or link to a member.

- **Only the live site writes.** Events are sent when the build is a production build *and* the host is `shahsnutrition.food` or `www.shahsnutrition.food` (`PRODUCTION_HOSTS` in `analyticsService.ts`). Local dev, `vite preview` and Vercel preview deploys only log to the console, because `.env.local` and previews point at the production Supabase. **If the domain changes, update `PRODUCTION_HOSTS` or clicks stop being recorded.** `VITE_TRACK_EVENTS=true` forces sending, for testing against a local Supabase only.
- **The source list is enforced in the database.** `track_site_event` rejects unknown events and any source outside the list above (product ids: lowercase letters, digits and dashes). A new button with a new kind of source needs a migration that updates the check in both the function and the `site_events` table.
- **Rate limits:** 60 clicks per IP per hour (hashed IP, kept about an hour in `site_event_rate_limits`, never joined to events) and 3,000 clicks per hour overall. Over the limit, clicks are dropped quietly.
- **Retention:** 13 months, purged daily at 03:15 UTC by the `purge-site-events` cron job.

Other events (`waitlist_submission_*`, `render_error`) still only log in development. Section dwell time is only stored alongside an email sign-up.

## 4. Page sections (top to bottom)

1. **Header** (`layout/Header.tsx`): floating glass pill. Logo, centred links (Products, Our Principles, Our Story), theme toggle, Instagram and email icons, and an **Order** button (WhatsApp glyph, 32px). On phones the Order button stays visible next to the menu button. Between 769px and 880px the Instagram and email icons are hidden so the nav doesn't collide.
2. **Hero** (`sections/HeroSection.tsx`): badge "NOW TAKING ORDERS" (swap back to "GOOD FOOD. BRIGHTER DAYS." after the first month or so), heading from `siteConfig.heroHeading`, motto, **Order on WhatsApp** (48px, full width on phones), a quiet "See the range" link to `#products`, and the line "Made fresh in small batches. Delivered across India." No email form or avatars.
3. **Products** (`sections/ProductsSection.tsx`, `#products`): three cards (Raggi Jaggi, Muesli, Date Bites), each with "View details" (opens the popup; the whole card is clickable) and a small **Order** button. The popup shows tagline, description, ingredients (sprite art), **Good to know** (shelf life, contains, pack sizes), nutrition, and an **Order <Product> on WhatsApp** button, pinned to the bottom of the popup on phones. When a nutrition panel isn't ready, the popup says so and offers "Ask us on WhatsApp".
4. **Values** (`sections/ValuesSection.tsx`, `#values`): "What we believe", three cards from `src/data/values.ts`.
5. **Our Story** (`sections/StorySection.tsx`, `#our-story`): founder story from `siteConfig.story`, key phrases highlighted with `.story-highlight`.
6. **FAQ** (`sections/FAQSection.tsx`, `#faq`): eight questions from `src/data/faqs.ts` (first one open). Under the list: "Still wondering about something? Ask us on WhatsApp." (order chat) and "Already ordered and need a hand? Customer care: 98811 91999" with Call and WhatsApp.
7. **Bottom banner** (`sections/NewsletterSection.tsx`, `#order`): "Ready to give it a try?", **Order on WhatsApp**, "Or save our order number: 98503 59899". Underneath, the email row (`#updates`): "Not ready yet? Hear about new launches.", email field, consent checkbox, "Keep me posted".
8. **Footer** (`layout/Footer.tsx`): logo and tagline. **Quick Links:** Products, Our Story, Order on WhatsApp, Get updates (`#updates`). **Get in touch:** Order 98503 59899, Customer care 98811 91999 (Call, WhatsApp), Instagram, email. **For Business Inquiries:** email.

## 5. Products (`src/data/products.ts`, type in `src/types/product.ts`)

| Product | Pack sizes | Stays fresh | Contains |
|---|---|---|---|
| Raggi Jaggi | 250 g, 500 g | 60 days | Tree nuts (cashew), dairy (ghee) |
| Muesli | 250 g, 500 g | 60 days | Tree nuts (almonds), dairy (ghee), wheat (gluten) |
| Date Bites | 250 g | 15 days (on purpose) | Tree nuts (almonds, cashew), dairy (ghee) |

- No preservatives, made fresh in small batches. Muesli's cranberries are sweetened.
- Nutrition panel: Raggi Jaggi only for now. Muesli and Date Bites show the "still adding" note.
- `weightOptions` holds pack sizes. Prices are not published yet. When they are, cards and the popup can read them from here.
- **Ingredient sprites** (`public/assets/ingredients/`) are a 3-column grid, row-major, in the same order as `ingredients`; `ingredientSprite.rows` must match. `/assets/*` is served with a one-year `immutable` cache (`vercel.json`), so **a changed sprite must get a new filename** (hence `muesli-v2.webp`, `date-bites-v2.webp`).

```ts
interface Product {
  id: string; name: string; tagline: string;
  shortDescription: string; fullDescription: string;
  iconType: 'leaf' | 'wheat' | 'dumbbell' | 'currency';
  image: string; features: string[]; ingredients: string[];
  ingredientSprite: { image: string; rows: number };
  nutritionFacts: { label: string; per100g: string; perServing: string; isSubItem?: boolean }[];
  weightOptions: string[];   // pack sizes, e.g. "250 g"
  shelfLifeDays: number;
  contains: string;          // allergen line for "Good to know"
  isPopular?: boolean;
}
```

## 6. Email sign-up (updates list)

The email row still runs the original waitlist plumbing (code names like `useWaitlist` and `waitlistService` are kept on purpose):

1. `WaitlistService.submitEmail` calls the Supabase RPC `submit_waitlist_member` with the email, `source` (`footer_newsletter`), consent flag, and `p_consent_version = 'updates-v1'`.
2. On a new sign-up, it calls the `sync-waitlist-loops` Edge Function, which adds the contact to the Loops list. Loops sends the double opt-in email; the member is pending until they tap the link.
3. Messages: success "Almost there. We've sent you an email. Tap the link inside to confirm."; duplicate "This email is already on our list. If you haven't confirmed yet, look for our email in your inbox (or spam)."; error "Sorry, that didn't go through. Please try again in a moment."

Consent versions stored per member:
- `waitlist-v1`: "I agree to receive an email about the product launch." (pre-launch)
- `updates-v1`: "Email me about new products from Shah's Nutrition. I can unsubscribe anytime."

The public page no longer fetches or shows a sign-up count. The confirmation email's wording lives in Loops, not in this repo.

## 7. Owner dashboard

`/admin` (Supabase Auth, `admin_users`) shows members, campaigns and analytics. It still says "waitlist", which is fine because only the founder sees it. Setup is in `supabase/README.md`.

**Analytics** (`/admin/analytics`, `AdminAnalytics.tsx`) opens with **WhatsApp order clicks**: total clicks, a mobile/desktop/tablet split, and clicks per button (e.g. "Product card · Raggi Jaggi") with the last click time, for the last 7 days, last 30 days or all time. It reads through the admin-only RPC `get_admin_order_clicks(p_days)`. Consented sessions are listed below it.

## 8. Meta

`index.html` description: "Raggi Jaggi, Muesli and Date Bites from Shah's Nutrition: wholesome everyday foods made with real ingredients and honest nutrition. Order on WhatsApp." Open Graph and Twitter descriptions also end with "Order on WhatsApp."
