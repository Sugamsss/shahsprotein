# Shah's Nutrition

The website for Shah's Nutrition, a small food brand from Satara making Raggi Jaggi, Muesli and Date Bites. It's live at **https://www.shahsnutrition.food** and launched on 2026-09-23.

The site does two jobs:

- **The landing page** tells the brand's story and lets people build an order. They send it to us on WhatsApp. There are no prices, checkout or payment on the site: we reply in the chat with the total, delivery and how to pay.
- **The order book at `/admin`** is where Pranjali and Sunit keep track of every order, from the first message to "delivered and paid". It replaces the notebook.

## How an order works

1. The customer builds an order in the "Your order" popup and taps **Send order on WhatsApp**.
2. WhatsApp opens with their message, which includes an order code like `SN-7KQ4M`.
3. On the same tap, the order is saved: items, name, pincode, coupon and code. The tap never waits for the save, so WhatsApp always opens even if the save fails.
4. In the admin, Sunit finds the order by its code, adds the phone number and the total he quoted, and moves it along: **New → Confirmed → Sent → Delivered**. Paid is a separate switch, because some people pay on delivery.
5. Orders that come in by WhatsApp, a call, Instagram or in person are added by hand.

The admin also has a home screen ("waiting on you", this week, what's selling), a stock switch per product and size (the site shows "Back soon"), customers, coupons, the email list, and CSV export.

## Getting started

```bash
npm install
npm run dev      # local server
npm run build    # type check + build. Run it before every commit
npm run lint     # type check only
npm test         # Vitest: order message, cart, order code, formats, CSV, Undo
```

Database tests use pgTAP and need a local Supabase: `supabase test db`. Backend setup is in [supabase/README.md](supabase/README.md).

## Stack

React 18, TypeScript, Vite, plain CSS and Lucide icons. Supabase handles the database, admin sign-in and the RPCs for orders, stock, coupons and the email list. Loops runs the email list and Resend sends the owners' sign-up alerts. Vercel hosts the site, with Vercel Web Analytics for page views.

## Deploys

- **A push to `main` deploys to production.** There's no staging.
- Vercel previews talk to the production database, so they **don't save orders or record clicks** unless `VITE_TRACK_EVENTS=true` is set for that preview.
- Database changes go out with `supabase db push`. Always dry-run first.

## Where to look next

- [AGENTS.md](AGENTS.md): the rules and gotchas. Read it before changing anything.
- [SPEC.md](SPEC.md): the brand, product and design spec.
- [supabase/README.md](supabase/README.md): backend setup, the RPCs, and how to add someone to the admin.

The repo is public. Never commit real coupon codes, keys, or anyone's email or phone number.
