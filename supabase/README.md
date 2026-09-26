# Supabase Setup

## Link and deploy

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

## Admin sign-in (usernames)

The admin at `/admin` signs in with a **username and password**, set by the site owner and handed to each person. There's no sign-up and no email of any kind: no invites, no password-reset emails.

- Supabase Auth only knows emails, so each admin's auth email is **`<username>@admin.shahsnutrition.food`** (e.g. `sunit@admin.shahsnutrition.food`). The sign-in page turns a username with no `@` into that address (`src/admin/username.ts`); a full email still works.
- `admin.shahsnutrition.food` has **no MX or A record**, so nothing can ever be delivered there. Keep it that way (check with `dig +short MX admin.shahsnutrition.food`).
- Who's an admin is `public.admin_users`, linked to `auth.users` **by user id**. `display_name` is how the admin greets them.
- Sessions stay signed in on each device (supabase-js keeps and refreshes them). Signing out signs out that device only.

**Setting or resetting a password** (the only way; there's no self-service reset). From the repo, logged in to the Supabase CLI (`supabase login`):

```bash
node scripts/set-admin-password.mjs sunit
```

It asks for the new password twice (hidden), needs at least 10 characters, fetches the service key from the CLI at run time, and never prints the key or the password. Each person can later change their own password in the admin under Settings → Change password.

**Adding someone.** Pick a username (lowercase letters, digits, `.`, `_` or `-`), then:

1. Create the auth user with the synthetic email and `email_confirm: true`, so no email is sent. Use the Auth admin API with the service key, or **Authentication → Users → Add user → Create new user** in the dashboard with "Auto Confirm User" ticked. Either way, leave the password to step 3.
2. Add them to `admin_users` in the SQL editor:

   ```sql
   insert into public.admin_users (id, email, display_name)
   select id, email, 'Owner'
   from auth.users
   where email = 'owner@admin.shahsnutrition.food'
   on conflict (id) do nothing;
   ```
3. Set their password: `node scripts/set-admin-password.mjs owner`.
4. Their Home: everyone gets the full `admin` Home by default. For the cook's Home ("what do I need to make?"), set it by user id:

   ```sql
   update public.admin_users set home_view = 'cook' where id = '<their auth user id>';
   ```
   Switch back with `home_view = 'admin'`. It takes effect the next time they open the admin.

Removing someone: delete their `admin_users` row (they can no longer open the admin), or the auth user as well.

The admin is at `/admin` once `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in the deployment environment. Signed in but not in `admin_users` shows "This account can't open the admin".

## Required production configuration

- Enable email/password Auth. No SMTP is needed for the admin (it never sends email).
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- **Turn public sign-ups off** in the dashboard (**Authentication → Sign In / Providers → Email → Allow new users to sign up**). They're on today; nobody can see data through them, but there's no reason to allow them.
- The public RPCs are `submit_waitlist_member`, `track_site_event`, `check_coupon`, `submit_order` and `get_product_stock`. Each write is rate-limited in SQL; add a CAPTCHA (e.g. Turnstile on `submit_order`) if junk shows up.
- Configure Loops for waitlist double opt-in. Supabase remains the source of truth for members and admin data.

## Email functions

```bash
supabase functions deploy sync-waitlist-loops
supabase functions deploy loops-webhook --no-verify-jwt
supabase secrets set LOOPS_FORM_ENDPOINT="https://app.loops.so/api/newsletter-form/<form-id>" LOOPS_WAITLIST_MAILING_LIST_ID=<mailing-list-id>
supabase secrets set LOOPS_SIGNING_SECRET=<signing-secret>
supabase secrets set RESEND_API_KEY=... WAITLIST_OWNER_EMAIL="pranjalishah25@gmail.com,owner@example.com" EMAIL_FROM="Shah's Nutrition <hello@shahsnutrition.food>"
```

`sync-waitlist-loops` is invoked after Supabase stores a new signup and is non-blocking. It submits the email, Waitlist mailing list ID, and optional source as `application/x-www-form-urlencoded` to the Loops Form endpoint. Loops owns double opt-in; provider errors are logged and reported as `stored: true` so they never falsely undo a stored signup. Set the endpoint and list ID as Supabase secrets, not frontend variables. Because the function is callable with the public anon key, it only posts to Loops (and sends the owner alert) for an active member whose `signed_up_at`, or `verified_at` after a resubscribe, is within the last 10 minutes. Every other call, including an unknown email, gets the same `202 { "accepted": true }`, so it cannot be used to re-send Loops emails to people already on the list or to check whether an address is on it. The old `send-waitlist-confirmation`, `verify-waitlist-email`, `send-admin-email` and `unsubscribe` functions are retired and should not be deployed (Loops handles unsubscribes).

The same function sends a separate owner-only alert through Resend after confirming the member exists in Supabase. Loops does not provide an appropriate internal-notification path here; its Form endpoint is for contacts and double opt-in. `RESEND_API_KEY` and `WAITLIST_OWNER_EMAIL` stay server-side. Set `WAITLIST_OWNER_EMAIL` to one address or a comma-separated list (for example, `pranjalishah25@gmail.com,owner@example.com`) to send one alert to each recipient. Alerts use a member-based Resend idempotency key and are retried when delivery or status recording fails; they never block the signup or create a fake Loops contact.

In Loops, open **Settings → Webhooks**, set the endpoint to `https://<project-ref>.supabase.co/functions/v1/loops-webhook`, save the generated signing secret as `LOOPS_SIGNING_SECRET`, and enable `contact.created`, `contact.mailingList.unsubscribed`, `contact.unsubscribed`, `email.unsubscribed`, `email.spamReported`, and `email.hardBounced`. The webhook verifies `Webhook-Id`, `Webhook-Timestamp`, and `Webhook-Signature`, marks confirmed members verified, and syncs unsubscribe, spam, and hard-bounce states by normalized email. Test events and duplicate deliveries are acknowledged safely.

The published Loops double opt-in email is branded as follows: `Pranjali from Shah’s Nutrition` sends from `hello@mail.shahsnutrition.food` and replies to `pranjalishah25@gmail.com`. Its subject is `Confirm your Shah’s Nutrition waitlist spot`, the preview says `One quick click to confirm your email and save your spot.`, and the body asks the subscriber to confirm before receiving launch updates and early access. The confirmation button uses the Shah’s Nutrition gold accent. Loops automatically adds the configured company name and physical address footer.

## Orders and the admin

Migrations `20260926000000` to `000004` add the order book and remove the old waitlist-era admin (its CRM, campaign and unsubscribe functions, and the empty `email_campaigns`, `email_log` and `waitlist_email_tokens` tables). `analytics_sessions` and its rows are kept, but nothing writes to it any more.

**Tables** (RLS on, no policies, all grants revoked; the only ways in are the functions below):

| Table | What |
|---|---|
| `orders` | One row per order. `code` (`SN-7KQ4M`, `-2` on a clash), `source` (`site`, `whatsapp`, `call`, `instagram`, `in_person`), `status` (`new`, `confirmed`, `sent`, `delivered`, `cancelled`), `paid_at` (null = not paid), `kept_at` ("Still waiting"), name, pincode, phone, note, amount (whole rupees, private), coupon. Never auto-deleted. |
| `order_lines` | Product id, size and quantity per order. Checked for shape only; names come from `src/data/products.ts`. |
| `order_events` | History, written only by a trigger: created, each status, paid/unpaid, kept/unkept, with who did it. |
| `product_stock` | Product and size that are off the site. A missing row means in stock. |
| `order_rate_limits` | Hashed IPs for about an hour, cleared by `purge_site_events()`. |

**Public RPCs:**
- `submit_order(p_code, p_lines, p_name, p_pincode, p_coupon)`: the popup's Send. 10 per IP per hour, 300 per hour overall (`PT429`). Bad input raises `22023`. A repeat of the same order does nothing; a different order with a taken code is stored as `-2`, `-3`… A malformed coupon is dropped, not an error.
- `get_product_stock(apikey text default null)`: `[{product_id, size, since}]` for what's off, `[]` when all is in. It's `stable`, so the site calls it with a plain GET, `/rest/v1/rpc/get_product_stock?apikey=<anon key>`. The `apikey` parameter is ignored; it's there because PostgREST treats every query-string key as an argument, and a gateway that passes `?apikey=` through would otherwise answer 404.

**Admin RPCs** (granted to `authenticated` only; each checks `is_admin()`):

| Function | Purpose |
|---|---|
| `get_admin_me()` | Who's signed in (the admin's auth gate), with `home_view`: `admin` (the default, everything) or `cook` (what to make). Set it in `admin_users` by user id. |
| `get_admin_users()` | Who has access |
| `get_admin_orders(p_view, p_status, p_paid, p_search, p_phone, p_source, p_from, p_to, p_before, p_limit, p_product)` | Orders with their lines. Views `todo`, `done`, `all`. Search by code, name or phone. `p_product` (e.g. `raggi-jaggi`) keeps orders containing that product, any size. `p_from` inclusive, `p_to` exclusive. Page with `next_before`; a page can run slightly over `p_limit` so it never splits orders saved at the same moment. |
| `get_admin_order(p_code)` | One order with history and a phone suggestion; null if none |
| `update_admin_order(p_id, p_changes)` | Quick changes: status, paid, kept, phone, amount, note, name, pincode (only the keys sent change). Also Undo. |
| `save_admin_order(p_id, p_order)` | Add by hand (`p_id` null) or a full edit. Call with named arguments. |
| `delete_admin_order(p_id)` | Deletes one order for good |
| `get_admin_overview()` | Home and the badge: what's waiting, this week (Monday start, India time), what's selling and coupons (30 days, confirmed and later), done counts, email count |
| `get_admin_totals()` | Home's per-product numbers: each product's orders, packs, grams and packs by size in each stage; the same stages overall with money (amount, without amount, paid, unpaid); this week, last week and last week so far (orders, packs, money in), with 7 days on this and last week, per-product packs on this week and last week so far, `first_order_at`, and up to 3 first names waiting on a total or a payment |
| `get_admin_customers(p_search)` | People grouped by phone |
| `set_admin_stock(p_product_id, p_size, p_in_stock)` | The stock switch |
| `get_admin_coupons()`, `create_admin_coupon`, `update_admin_coupon`, `set_admin_coupon_active` | Coupons, with how often each was used |
| `get_admin_email_list()` | Email list members and counts |

- **Errors:** plain messages for people use errcode `22023` and are shown as they come. **Not an admin comes back as HTTP 400, code `P0001`, message `Unauthorized`** (anon gets 401). The admin matches on the message.
- **"Didn't come through?"**: a site order that's been New for 48 hours, and wasn't marked "Still waiting" in the last 48 hours (`order_is_stale()`). Orders added by hand (WhatsApp, call, Instagram, in person) never go stale: they already came through.
- **Stages (`get_admin_totals()`)**: `to_confirm` is New and not stale, `to_send` Confirmed, `on_the_way` Sent, `to_collect` Delivered and not paid, `stale` is `order_is_stale()`; cancelled and done orders are in none. Weight comes from the size (`1 kg` is 1000 g). Money is per order, so it's only in `overall`, and stale orders carry none. Weeks start Monday 00:00 IST; their orders and packs are confirmed, sent or delivered orders by `created_at`, money in is `amount` on not-cancelled orders by `paid_at`. Empty means zeros, not nulls.
- **`get_waitlist_count_stats()` is internal.** No role can call it through the API (migration `20260926000005`); `get_admin_email_list()` uses it inside the database for its counts.

**Testing locally.** `supabase start`, `supabase db reset`, then `supabase test db` runs the pgTAP files in `supabase/tests/`. They cover grants, rate limits, repeat saves, clashes, the stale rule, the overview, the Home totals and their week boundaries, the product filter, and every admin RPC. Each test file clears the order tables inside its own transaction and rolls back, so local test data survives. To add a migration without wiping local data, use `supabase migration up`.

## WhatsApp order click tracking

Migration `20260924000000` adds `site_events` (anonymous, no PII) and the public
RPC `track_site_event(p_event, p_source, p_device_type, p_theme)`, which the site
calls when something opens WhatsApp to order. Anon users can call the RPC but can't
read, change or delete any rows. The RPC accepts only `whatsapp_order_click` and
the known button sources, and rate-limits to 60 clicks per IP per hour and 3,000
per hour overall. It also schedules `purge_site_events()` daily at **03:15 UTC**
(`purge-site-events` job), which keeps 13 months of events.

After `supabase db push`, check it from the SQL editor:

```sql
select jobname, schedule from cron.job where jobname = 'purge-site-events';
select event, source, device_type, created_at from public.site_events order by created_at desc limit 10;
```

Migrations `20260925000001` and `20260925000003` widen the allowed sources for
the "Your order" popup: its Send is `order-popup`, or `order-popup:<place>` for
the button that opened it (header, hero, banner, footer, product,
product-details), and its "Message me on WhatsApp" link is `order-popup:chat`.
Buttons that only open the popup record nothing. The older sources stay allowed
so past rows still count.


## Coupons

Migration `20260925000000` adds `coupons`, `coupon_check_rate_limits` and the
public RPC `check_coupon(p_code)`, which the "Your order" popup calls when
someone types a code. Both tables have RLS on with no policies and all grants
revoked from anon and authenticated, so the site can't list codes or read any
row. The only way in is the RPC, and it returns only `{"valid": true,
"description": "..."}` or `{"valid": false}`. Expiry dates, notes and ids never
leave the database.

Codes are matched ignoring case and spaces around them (`example10` finds
`EXAMPLE10`), and must be unique ignoring case. A code is 3 to 24 letters,
digits or hyphens.

### From the admin area

Migration `20260925000002` adds admin-only RPCs (listed above) for the coupon
screen in the admin area. There you can list every code, add one,
turn it on or off, set or clear its expiry, and keep a private minimum note and
internal note. Codes are saved in capitals. A few rules:

- **No delete.** Turn a code off to retire it. That keeps its history, and the
  same code can't come back later meaning something else.
- **The code can't be changed** after it's added. For a different code, add a
  new one.
- A new code's expiry must be in the future. When editing, a past date is
  allowed, which ends the code straight away.
- Problems (a code that already exists, a rupee amount in the description, a
  bad code) come back as plain messages (errcode `22023`) that the screen shows
  as-is.

### From the SQL editor (fallback)

Add a code:

```sql
insert into public.coupons (code, description, expires_at, minimum_note)
values ('EXAMPLE10', '10% off your order', '2026-10-31 23:59+05:30', '2 packs or more');
```

`expires_at` is a `timestamptz`, so write the `+05:30` for India time; leave it
out (or `null`) for a code that doesn't expire. `minimum_note` and
`internal_note` are private reminders for you; the customer never sees them,
so check the minimum yourself in the WhatsApp chat.

Turn a code off, or back on:

```sql
update public.coupons set active = false where upper(code) = 'EXAMPLE10';
```

The description is shown to the customer, up to 60 characters. It can't
mention `₹`, `Rs` or `INR`: the site doesn't show prices, so a flat-off code
reads as "Flat discount on your order" and the amount goes in the chat. The
insert fails with a check-constraint error if it does.

`check_coupon` allows 30 checks per IP per rolling hour (calls with no IP share
one bucket). Past that it returns HTTP 429, which the site shows as "couldn't
check", never as "not valid".
