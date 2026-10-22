# Shah's Nutrition

The website for Shah's Nutrition, a small food brand from Satara making Raggi Jaggi, Muesli and Date Bites. It's live at **https://www.shahsnutrition.food** and launched on 2026-09-23.

The site does two jobs:

- **The landing page** tells the brand's story and lets people build an order. They send it to us on WhatsApp. There are no prices, checkout or payment on the site: we reply in the chat with the total, delivery and how to pay.
- **The order book at `/admin`** is where Pranjali and Sunit manage website requests and active orders through "delivered and paid". Requests are separate from kitchen work until Sunit confirms after receiving the WhatsApp message.

## How an order works

1. The customer enters their phone and delivery address and taps **Continue to WhatsApp**. Address suggestions are optional; manual entry works without Google configuration.
2. WhatsApp opens with a draft containing their details and an order code. The customer must press Send there; the website cannot tell whether the message arrived.
3. The tap saves a pending request (never a kitchen order). It does not wait for the save, so WhatsApp opens even if saving fails.
4. After the message arrives, Sunit finds the request in `/admin/requests` and explicitly confirms it. Confirmation creates an active order; kitchen rules may allocate food or move it straight to Packing. Dismissed requests remain available in the inbox filter. Confirmation has no instant Undo because it can reserve food; correct an accidental confirmation with normal order cancellation.
5. Sunit moves active orders along: **Cooking → Packing → Ready → Delivered**. Marking one Delivered opens a bill, which can be shared or downloaded as a PNG and reopened from the order. It is a receipt, not a tax invoice; the public site has no prices. Payments are recorded separately, including part payments, because some people pay on delivery.
6. Orders that come in by WhatsApp, a call, Instagram or in person are added by hand.

The admin's Home is different for each person. Pranjali (`home_view = cook`) sees what to make per product, in kilos and packs. Sunit and anyone else (`admin`) sees every order and rupee per product and stage. Each product card opens that product's orders. The admin also has a stock switch per product and size (the site shows "Back soon"), customers, coupons, the email list, and CSV export.

Pranjali and Sunit sign in with a username (`pranjali`, `sunit`) and a password. There's no email reset: Sugam sets or resets a password with `node scripts/set-admin-password.mjs <username>` (needs `supabase login`). How to add someone is in [supabase/README.md](supabase/README.md).

To keep the admin on a phone like an app, open `/admin` in Safari (or Chrome on Android), tap Share → **Add to Home Screen**, and sign in once inside the new "Shah's Orders" icon.

## Getting started

Use Node.js 22 LTS or 24 and newer (Node 23 is not supported by Vitest). Supabase already requires Node 22 or newer; the test runner has the same minimum.

```bash
npm ci           # install the versions in package-lock.json
npm run dev      # local server
npm run build    # type check + build. Run it before every commit
npm run lint     # type check only
npm test         # Vitest: order message, cart, order code, formats, CSV, Undo
```

The landing page runs without any settings. The admin, coupons, stock and order saves need `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` (`vercel env pull` fills them in). They point at production: local dev never saves orders or clicks, but the admin run locally works on the real order book.

The optional address search uses Google Places only when `VITE_GOOGLE_MAPS_API_KEY` is configured with approved API and referrer restrictions. Without it, customers can still enter every delivery field manually. Do not activate paid Google Maps APIs or billing without separate approval; this repository intentionally contains no key.

Database tests use pgTAP and need a local Supabase: `supabase test db`. Backend setup is in [supabase/README.md](supabase/README.md).

## Stack

React 18, TypeScript, Vite, plain CSS and Lucide icons. Supabase handles the database, admin sign-in and the RPCs for orders, stock, coupons and the email list. Loops runs the email list and Resend sends the owners' sign-up alerts. Vercel hosts the site.

## Deploys

- **A push to `main` deploys to production.** There's no staging.
- Vercel previews talk to the production database, so they **don't save orders or record clicks**. Never set `VITE_TRACK_EVENTS` on a preview: it would write test orders into the real order book. It's for a local Supabase only (see `.env.example`).
- Website request rollout uses a separate admin-first order: deploy the UI with missing-RPC gating, apply and verify the additive request migration, then release the public request form. The migration is the safety cutover for old clients too: legacy `submit_order` calls must create pending, incomplete requests, never active orders. Do not restore the pre-cutover function body on rollback. Confirm only after WhatsApp receipt; no real production change is part of local implementation verification.
- Database changes go out with `supabase db push`. Always dry-run first and follow the request-specific rollout in [supabase/README.md](supabase/README.md).

## Where to look next

- [AGENTS.md](AGENTS.md): the rules and gotchas. Read it before changing anything.
- [SPEC.md](SPEC.md): the brand, product and design spec.
- [supabase/README.md](supabase/README.md): backend setup, the RPCs, and how to add someone to the admin.

The repo is public. Never commit real coupon codes, keys, or anyone's email or phone number.
