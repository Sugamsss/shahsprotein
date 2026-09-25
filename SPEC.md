# Shah's Nutrition website: technical spec

The public site for Shah's Nutrition, a small healthy-food brand from Satara. The brand launched on **2026-09-23**. The site's job is to **help people order on WhatsApp**, and to answer the questions of people holding a pack (the URL is printed on every pack). Email sign-up is a smaller, secondary choice for people who aren't ready to order yet.

Stack: Vite + React + TypeScript (`src/`), deployed on Vercel from this repo. Supabase stores email sign-ups and runs the owner dashboard (`/admin`). Loops sends the double opt-in email.

---

## 1. Brand and voice

- **Name:** Shah's Nutrition. **Tagline:** "Tasty food. Healthy habits. A brighter you." (`siteConfig.tagline`)
- **Voice:** first-person founder (Pranjali). Warm, simple, honest, a bit personal. No hype, no exclamation spam.
- **Ordering copy says "we".** Orders go to Sunit on the order number, so the "Your order" popup names Sunit as the one who gets the message and says "we" for replying ("We'll reply with the total…"). The WhatsApp message itself is the customer speaking.
- **Honesty rules:** no invented food, health or allergen claims. Food, allergen, delivery and payment wording comes from the founder (see `src/data/faqs.ts` and `src/data/products.ts`). Jaggery counts as added sugar, so never say "no added sugar". No prices are shown yet.

## 2. Themes and design tokens

Tokens live in `src/styles/tokens.css` (type, spacing, radii, z-index) and per theme in `src/styles/light-theme.css` and `src/styles/dark-theme.css`. The theme is stored in `localStorage` (`shahsnutrition_theme`), falling back to the system setting. `index.html` applies it before first paint.

- **Dark:** obsidian surface (`#1f1f1f`), warm gold accent (`#d4af37` to `#b89327`) with dark button text.
- **Light:** soft sky-to-blush canvas (`#eef4fc` base), blue accent (`#3b82f6` to `#2563eb`) with white button text.
- Surfaces are frosted glass cards (`.glass-card`, `--color-bg-card`, `--glass-backdrop`).
- **Order buttons** use the brand accent gradient with a white or dark WhatsApp glyph, not WhatsApp green (`.order-btn` in `global.css`).

CSS order: `global.css` imports tokens, then themes, then animations. Each section's tablet and desktop rules sit next to its base rules, and phone fixes go in the "Phones, tablets and short screens" block at the end (see `AGENTS.md`).

## 3. Ordering and contact

All contact details live in one place, `siteConfig.contact` (`src/data/siteConfig.ts`):

| Line | Number | Links | Where it shows |
|---|---|---|---|
| **Order** | 9850359899 | `https://wa.me/919850359899` | The "Your order" popup's Send, FAQ, bottom banner ("save our order number"), footer |
| **Customer care** | 9881191999 | `tel:+919881191999`, `https://wa.me/919881191999` | Under the FAQ list and in the footer only |

Rules:
- A phone number is **always shown with its label** ("Order" or "Customer care").
- Customer care **never** appears in the header or hero, where it would compete with ordering.

### The "Your order" popup

People build their order on the site and send Sunit one tidy WhatsApp message on the order number. **There are no prices, totals, delivery costs or payment on the site** (the founder's call): we reply on WhatsApp with the total, delivery and how to pay. WhatsApp stays the last step. There are no accounts and no order database.

- **Opening it.** The product card's **+ Add** and the product popup's **Add to order** add a pack and open "Your order" (the product popup switches to it in place). The header **Order** button (with a pack count when there's something in the order), and **Order on WhatsApp** in the hero, bottom banner and footer Quick links, open it too.
- **Inside.** Lines (thumbnail, name, pack size, quantity 1 to 10, remove with undo), three tiles to add more, then name, pincode (6 digits, so we can quote delivery), an optional coupon, and "See your message", which shows the exact text. **Send order on WhatsApp** opens `wa.me` with the message. The empty popup offers the three products and "Rather just chat? Message us on WhatsApp", which opens the chat with `Hi! I'd like to place an order.`
- **Order of lines.** Always product order (Raggi Jaggi, Muesli, Date Bites), smaller pack first, in the popup and in the message (`sortLines`).
- **What's kept.** Only the cart (product, pack size, quantity) is saved, in localStorage (`shahs-order-v1`), and it still works when storage is blocked. Name, pincode and the coupon stay in memory for the visit and are never saved. At Send the cart is cleared, and a snapshot stays in memory so the "Now press send in WhatsApp" panel can offer **Try again**. Saved lines whose product or pack size no longer exists are dropped, with a one-time notice.
- **The message** comes from `buildOrderMessage` (`src/utils/orderMessage.ts`), with its words in `siteConfig.order.message`:

  ```
  Hi! I'm Anjali, and I'd like to place an order:

  • Raggi Jaggi 250 g × 1
  • Muesli 250 g × 2

  Coupon: EXAMPLE10
  Pincode: 415001

  Could you send me the total?
  ```

  A code the server couldn't check reads `Coupon: EXAMPLE10 (not checked yet)`. A code it rejected is left out.
- **State** lives in `OrderContext` (`src/context/OrderContext.tsx`). All popup copy is in `siteConfig.order`. The popup body is lazy-loaded.

### Coupons

Codes live **only in Supabase** (`public.coupons`), never in the site code or this repo. The popup asks `check_coupon(p_code)`, which answers valid with a short public description (like "10% off your order") or not valid, and nothing else. Descriptions can't mention an amount (₹, Rs or INR are rejected), because the site shows no prices; we work out the discount in the chat. The check allows 30 tries per IP per hour. When it can't answer (offline, timeout, rate limit), the popup says so and the code goes in the message as not checked yet. Pranjali manages codes at `/admin/coupons` (see §7).

### Direct WhatsApp links

"Ask us on WhatsApp" (FAQ, missing-nutrition note) and the footer's "Order 9850359899" open the order chat directly through `OrderLink` (`src/components/ui/OrderLink.tsx`), with nothing prefilled for questions. `CustomerCareLinks` renders the care line's Call and WhatsApp actions. Links are built by `src/utils/contact.ts` (the message is URL-encoded).

**Order click tracking.** A `whatsapp_order_click` is recorded only when something actually opens WhatsApp to order: the popup's Send (`trackOrderSend`, source `order-popup:<place that opened it>`, or `order-popup`), the empty popup's chat link (`order-popup:chat`), and the direct links (`faq`, `nutrition:<id>`, `footer`). Buttons that only open the popup record nothing. The name, pincode and coupon are never recorded. `trackOrderClick` calls `AnalyticsService.trackSiteEvent`, which posts `{ p_event, p_source, p_device_type, p_theme }` to the Supabase RPC `track_site_event` with `fetch(..., { keepalive: true })`. It is fire and forget: never awaited, errors ignored, so it can't delay opening WhatsApp. Rows go to `site_events` (migration `20260924000000`) and hold no PII: no IP, user agent, session key or link to a member.

- **Only the live site writes.** Events are sent when the build is a production build *and* the host is `shahsnutrition.food` or `www.shahsnutrition.food` (`PRODUCTION_HOSTS` in `analyticsService.ts`). Local dev, `vite preview` and Vercel preview deploys only log to the console, because `.env.local` and previews point at the production Supabase. **If the domain changes, update `PRODUCTION_HOSTS` or clicks stop being recorded.** `VITE_TRACK_EVENTS=true` forces sending, for testing against a local Supabase only.
- **The source list is enforced in the database.** `track_site_event` rejects unknown events and any source outside the allowed list: `header`, `hero`, `faq`, `banner`, `footer`, `product:<id>`, `product-details:<id>`, `nutrition:<id>`, `order-popup`, and `order-popup:` + `header`, `hero`, `banner`, `footer`, `product`, `product-details` or `chat` (product ids: lowercase letters, digits and dashes). The older sources stay allowed so past rows still count (migrations `20260925000001` and `000003`). A new button with a new kind of source needs a migration that updates the check in both the function and the `site_events` table.
- **Rate limits:** 60 clicks per IP per hour (hashed IP, kept about an hour in `site_event_rate_limits`, never joined to events) and 3,000 clicks per hour overall. Over the limit, clicks are dropped quietly.
- **Retention:** 13 months, purged daily at 03:15 UTC by the `purge-site-events` cron job.

Other events (`waitlist_submission_*`, `render_error`) still only log in development. Section dwell time is only stored alongside an email sign-up.

## 4. Page sections (top to bottom)

1. **Header** (`layout/Header.tsx`): floating glass pill. Logo, centred links (Products, Our Principles, Our Story), theme toggle, Instagram and email icons, and an **Order** button (WhatsApp glyph, 32px) that opens "Your order". When the order has packs in it, the glyph becomes a count chip ("9+" above 9). On phones the Order button stays visible next to the menu button. Between 769px and 880px the Instagram and email icons are hidden so the nav doesn't collide.
2. **Hero** (`sections/HeroSection.tsx`): badge "NOW TAKING ORDERS" (swap back to "GOOD FOOD. BRIGHTER DAYS." after the first month or so), heading from `siteConfig.heroHeading`, motto, **Order on WhatsApp** (48px, full width on phones, opens "Your order"), a quiet "See the range" link to `#products`, and the line "Made fresh in small batches. Delivered across India." No email form or avatars.
3. **Products** (`sections/ProductsSection.tsx`, `#products`): three cards (Raggi Jaggi, Muesli, Date Bites), each with "View details" (opens the popup; the whole card is clickable) and a small **+ Add** button (adds one 250 g pack and opens "Your order"). The popup shows tagline, description, ingredients (sprite art), **Good to know** (shelf life, contains, pack sizes), nutrition, and a pinned bar with the pack size and **Add to order**, which switches the popup to "Your order". Date Bites comes in one size, so it shows "250 g pack" instead of a switch. When a nutrition panel isn't ready, the popup says so and offers "Ask us on WhatsApp".
4. **Values** (`sections/ValuesSection.tsx`, `#values`): "What we believe", three cards from `src/data/values.ts`.
5. **Our Story** (`sections/StorySection.tsx`, `#our-story`): founder story from `siteConfig.story`, key phrases highlighted with `.story-highlight`.
6. **FAQ** (`sections/FAQSection.tsx`, `#faq`): eight questions from `src/data/faqs.ts` (first one open). Under the list: "Have another question? Ask us on WhatsApp." (order chat) and "Need help with an order you've placed? Customer care: 9881191999" with Call and WhatsApp.
7. **Bottom banner** (`sections/NewsletterSection.tsx`, `#order`): "Ready to give it a try?", **Order on WhatsApp** (opens "Your order"), "Or save our order number: 9850359899". Underneath, the email row (`#updates`): "Not ready yet? Hear about new launches.", email field, consent checkbox, "Keep me posted".
8. **Footer** (`layout/Footer.tsx`): logo and tagline. **Quick Links:** Products, Our Story, Order on WhatsApp (opens "Your order"), Get updates (`#updates`). **Get in touch:** Order 9850359899 (WhatsApp), Customer care 9881191999 (tap to call), Instagram, email. Each row is one link. **For Business Inquiries:** email.

## 5. Products (`src/data/products.ts`, type in `src/types/product.ts`)

| Product | Pack sizes | Stays fresh | Contains |
|---|---|---|---|
| Raggi Jaggi | 250 g, 500 g | 6 months | Tree nuts (cashew), dairy (ghee) |
| Muesli | 250 g, 500 g | 6 months | Tree nuts (almonds; may contain traces of cashews), dairy (ghee), gluten (oats) |
| Date Bites | 250 g | 15 days (on purpose) | Tree nuts (almonds, cashew), dairy (ghee) |

- No preservatives, made fresh in small batches. Muesli has added sugar and tutti frutti (candied fruit).
- Nutrition panel: Raggi Jaggi and Muesli. Date Bites shows the "still adding" note.
- `weightOptions` holds pack sizes. Prices are not published yet. When they are, cards and the popup can read them from here.
- **Ingredient sprites** (`public/assets/ingredients/`) are a 3-column grid, row-major, in the same order as `ingredients`; `ingredientSprite.rows` must match. `/assets/*` is served with a one-year `immutable` cache (`vercel.json`), so **a changed sprite must get a new filename** (hence `muesli-v2.webp`, then `muesli-v3.webp`, and `date-bites-v2.webp`). The site loads a copy exported at 216px per tile (3x the 72px tile), named `-648w.webp` (e.g. `muesli-v3-648w.webp`). Keep the full-size sprite as the master.
- **Card images** (`image`) are per-product crops in `public/assets/product-cards/`, cut at the card's 1.3 ratio from `english-product-portfolio.png`. Image rules for the whole site are in `AGENTS.md` under "Images, fonts and bundle size".

```ts
interface Product {
  id: string; name: string; tagline: string;
  shortDescription: string; fullDescription: string;
  iconType: 'leaf' | 'wheat' | 'dumbbell' | 'currency';
  image: string; features: string[]; ingredients: string[];
  ingredientSprite: { image: string; rows: number };
  nutritionFacts: { label: string; per100g: string; perServing: string; isSubItem?: boolean }[];
  weightOptions: string[];   // pack sizes, e.g. "250 g"
  shelfLife: string;
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

`/admin` (Supabase Auth, `admin_users`) shows members, campaigns, coupons and analytics. It still says "waitlist", which is fine because only the founder sees it. Setup is in `supabase/README.md`.

**Analytics** (`/admin/analytics`, `AdminAnalytics.tsx`) opens with **WhatsApp order clicks**: total clicks, a mobile/desktop/tablet split, and clicks per button (e.g. "Product card · Raggi Jaggi") with the last click time, for the last 7 days, last 30 days or all time. It reads through the admin-only RPC `get_admin_order_clicks(p_days)`. Popup sends show as "Order popup, sent · <button that opened it>". Consented sessions are listed below it.

**Coupons** (`/admin/coupons`, `AdminCoupons.tsx`) lists every code with its public description, status (On, Off, or Ended once its end date has passed), end date and private minimum note. Pranjali can add a code, edit it, or turn it on and off. There's no delete: turning a code off retires it and keeps its history, and a code can't be renamed. The end date is stored as the end of that day in India time. It uses admin-only RPCs (`get_admin_coupons`, `create_admin_coupon`, `update_admin_coupon`, `set_admin_coupon_active`), and server errors are written for her and shown as they come.

## 8. Meta

`index.html` description: "Raggi Jaggi, Muesli and Date Bites from Shah's Nutrition: wholesome everyday foods made with real ingredients and honest nutrition. Order on WhatsApp." Open Graph and Twitter descriptions also end with "Order on WhatsApp."
