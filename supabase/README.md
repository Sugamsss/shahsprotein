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
4. Their Home: everyone gets the full `admin` Home by default. For the cook's Home (the kitchen: Log cooking and spare), set it by user id:

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

Migrations `20260926000000` to `000004` add the order book and remove the old waitlist-era admin (its CRM, campaign and unsubscribe functions, and the empty `email_campaigns`, `email_log` and `waitlist_email_tokens` tables). `analytics_sessions` and its rows are kept, but nothing writes to it any more. `20260929000001` moves the order book to the kitchen's stages and adds batches, spare stock and samples (see **The kitchen** below). Its status rename has no down migration: back up `orders`, `order_lines`, `order_events` and `order_payments` (`supabase db dump --data-only`) before pushing it.

**Tables** (RLS on, no policies, all grants revoked; the only ways in are the functions below):

| Table | What |
|---|---|
| `orders` | One row per order. `code` (`SN-7KQ4M`, `-2` on a clash), `source` (`site`, `whatsapp`, `call`, `instagram`, `in_person`), `status` (`cooking`, `packing`, `ready`, `delivered`, `cancelled`; default `cooking`), `free_sample` (every line is a sample: no total, no coupon, no payments), `priority` (skips the line in the kitchen; see **The kitchen**), `kitchen_hold` (true only in Cooking, set by a person moving a Packing order back; since `20260930000000`, see **Held in Cooking**; a trigger clears it on any status change, and a check refuses it outside Cooking), `paid_at` (null = not paid in full), `paid_method` (`upi`, `cash`, `bank`, `other`), `paid_note` (only with `other`). Since `20260928000000` these three are worked out from `order_payments` by triggers, on every write: `paid_at` is when the payments first covered the total, and the method and note are that payment's. Never write them directly. Name, pincode, phone, note, amount (whole rupees, private), coupon. Never auto-deleted. |
| `order_payments` | One row per payment (`20260928000000`): `amount` (whole rupees; null only while the order has no total, and typing the total fills it in), `method` and `note` (as on orders; null method only on payments copied from orders paid before methods), `paid_at` (when the money came in), `created_at`, `created_by`. Paid = at least one payment and they cover the total (or there's no total). A total can't be cleared while payments with amounts exist. Every order paid before this migration became one payment. |
| `order_lines` | Product id, size (`250 g`, `1 kg`, or `sample`: admin only) and quantity per order, plus `grams_each`, filled on insert from the size or, for a sample, the product's sample weight at that moment. An edit keeps the weight of the samples it keeps. Checked for shape only; names come from `src/data/products.ts`. |
| `order_events` | History, written only by a trigger: created, each status, paid/unpaid, with who did it. `auto` is true when the kitchen rules moved it (a batch or spare covered it, a batch fix took food back), not a person. Old events (`new`, `confirmed`, `sent`, `kept`, `unkept`) stay as history. |
| `product_stock` | Product and size that are off the site. A missing row means in stock. |
| `product_prices` | Base price per product and size (`20260928000001`): whole rupees, 1 to 99,999, with `updated_at` and `updated_by`. A missing row means no price yet. Admin only; kept apart from `product_stock` because the site reads stock. |
| `coupon_prices` | A coupon's price per product and size (`20260928000001`), same shape plus `coupon_id`. A missing row means that size uses the base price. Deleted with its coupon. `check_coupon()` never reads it. |
| `order_rate_limits` | Hashed IPs for about an hour, cleared by `purge_site_events()`. |
| `kitchen_products` | Per product: `sample_grams` (1 to 500) and shelf life (`shelf_life_amount` + `shelf_life_unit`, `days` or `months`; both null means it never expires). Starts at Raggi Jaggi 20 g / 6 months, Muesli 20 g / 6 months, Date Bites 15 g / 15 days. Only these products can have batches or samples. |
| `kitchen_batches` | One cooking: product, `grams` (1 to 50,000), `made_on` (India date, not in the future, at most 60 days back), who and when. |
| `kitchen_allocations` | Grams of one product given to one order from one batch; `batch_id` null means covered by hand. One row per order, product and batch. A deferred check refuses a batch that gives out more than it holds. |
| `kitchen_writeoffs` | Spare marked used up or thrown out (`reason`), per batch. |
| `kitchen_actions`, `kitchen_action_steps` | The undo log: one action per kitchen call, one step per row it changed. Kept 7 days. |

**Public RPCs:**
- `submit_order(p_code, p_lines, p_name, p_pincode, p_coupon)`: the popup's Send. 10 per IP per hour, 300 per hour overall (`PT429`). Bad input (a sample, or a pack over 1 kg) raises `22023`. A repeat of the same order does nothing; a different order with a taken code is stored as `-2`, `-3`… A malformed coupon is dropped, not an error. The order lands in Cooking and takes from spare; covered on every product, it goes straight to Packing.
- `get_product_stock(apikey text default null)`: `[{product_id, size, since}]` for what's off, `[]` when all is in. It's `stable`, so the site calls it with a plain GET, `/rest/v1/rpc/get_product_stock?apikey=<anon key>`. The `apikey` parameter is ignored; it's there because PostgREST treats every query-string key as an argument, and a gateway that passes `?apikey=` through would otherwise answer 404.

**Admin RPCs** (granted to `authenticated` only; each checks `is_admin()`):

| Function | Purpose |
|---|---|
| `get_admin_me()` | Who's signed in (the admin's auth gate), with `home_view`: `admin` (the default, everything) or `cook` (the kitchen). Set it in `admin_users` by user id. The cook is also the only one who can mark spare used up or thrown out (anyone can while nobody is set as cook). Also `notes_seen`: the id of the last "What's new" note they saw, or null (`20260929000000`). |
| `set_admin_notes_seen(p_id)` | Saves the last "What's new" note this person saw, on their own row, so it follows them across phones and the home-screen app. Ids look like `2026-09-29-contacts-button` (date, then a lowercase slug); anything else is `22023`. It stores what it's given; the admin decides what's newest. |
| `get_admin_users()` | Who has access |
| `get_admin_orders(p_view, p_status, p_paid, p_search, p_phone, p_source, p_from, p_to, p_before, p_limit, p_product, p_free_sample, p_samples)` | Orders with their lines. Views `todo` (in the kitchen, or delivered with money due), `done` (delivered and paid in full, or a delivered free sample order; or cancelled), `all`. `p_free_sample`: true only free sample orders, false without them. `p_samples`: true every order carrying a sample (free sample orders and paid orders with a taster; the Free samples list), false orders with none. Search by code, name or phone. `p_product` (e.g. `raggi-jaggi`) keeps orders containing that product, any size. `p_from` inclusive, `p_to` exclusive. Page with `next_before`; a page can run slightly over `p_limit` so it never splits orders saved at the same moment. |
| `get_admin_order(p_code)` | One order with history (each event with `auto`) and a phone suggestion; null if none |
| `update_admin_order(p_id, p_changes)` | Quick changes: status, paid, phone, amount, note, name, pincode, priority (only the keys sent change). Also Undo of anything but a kitchen move. A status or priority change runs the kitchen rules (see **The kitchen**); Packing or Ready to Cooking puts the order in Cooking held (see **Held in Cooking**). Every order answer (this one, `get_admin_order`, `get_admin_orders`, `save_admin_order`, the payment calls) carries `held` (boolean, since `20260930000000`; absent on an older database). The answer carries `kitchen_effects`: what it did to the kitchen, with an `action_id` for `undo_admin_kitchen()` on every status or priority change (null only when neither changed). Undo through it: it puts the status, when it began and priority back exactly, and removes the history the move wrote. A plain reverse still works: send the old value, and for a status its old `status_changed_at` (only with `status`). `paid_method` and `paid_note` go only with `paid: true` in the same call: `{ paid: true, paid_method: 'upi' }` marks paid or changes the method, and `other` needs a note. `paid: true` alone keeps the method, `paid_method: null` clears it, and `paid: false` clears both. Since `20260928000000`: `paid: true` on an order not paid in full records one payment for the rest; on a paid order a method changes the payment that completed it; `paid: false` removes every payment. |
| `save_admin_order(p_id, p_order)` | Add by hand (`p_id` null) or a full edit. Call with named arguments. Lines may have `size: 'sample'`; samples only makes a free sample order. Every product must have a `kitchen_products` row (a new product's migration adds one), or it's refused. A new order starts in Cooking and takes from spare (or, sent further along, is covered by hand). An edit re-balances the kitchen (a pack added after cooking waits only for the missing grams). `priority` (true/false) is optional: a new order isn't priority unless it's sent, an edit without it keeps it. Not undoable; Undo of an add is delete. On add, `paid_method` and `paid_note` work as in `update_admin_order` (sent empty with paid off is fine), and `paid: true` records one payment for the total; an edit ignores them, like `paid`, and leaves the payments alone. |
| `delete_admin_order(p_id)` | Deletes one order for good, with its payments. Like a cancel for the kitchen; a delivered order's batch grams are recorded as used up, so spare doesn't grow. |
| `add_admin_payment(p_order_id, p_payment)` | "Part payment…": `{ amount, method, note?, paid_at? }`. Needs the order's total first. More than what's due is fine (it shows as `amount_extra`). Returns the order. |
| `pay_admin_order_rest(p_order_id, p_payment)` | "Mark paid": one payment for whatever is left, `{ method, note?, paid_at? }`. No amount when the order has no total. Refuses an order that's already paid. Returns the order. |
| `delete_admin_payment(p_id, p_undo)` | Removes one payment (mistakes are fixed by deleting and adding again). `p_undo: true` is the Undo of Mark paid / Part payment: it writes no history and removes the paid line that payment wrote (`20260929000001`). Returns the order. |
| `restore_admin_payments(p_order_id, p_payments)` | Undo: `[{ id, amount, method, note, paid_at }]` as the order listed them. A payment whose id is already there is skipped. It writes no history, and removes the unpaid line the removal wrote. Returns the order. |
| `get_admin_overview()` | Home and the badge: `queue` (`cooking {count, oldest}`, `packing {count, paid, part_paid}`, `ready {count, not_paid, part_paid, oldest_since, oldest {code, name, since}}` (`since` is when it became Ready), `to_collect {count, amount, amount_due, part_paid, without_amount, people, oldest}`, `free_samples {total, open, sent_this_month, grams_this_month}`: orders carrying a sample: `total` not cancelled (what the Free samples list shows), on their way, delivered this month, and those samples' grams), this week (Monday start, India time), what's selling and coupons (30 days, not cancelled), done counts, email count |
| `get_admin_totals()` | Home's per-product numbers: each product's orders, packs, samples, grams and packs by size in each stage; the same stages overall with money (amount, without amount, paid, unpaid, `amount_due`, `part_paid`); this week, last week and last week so far (orders, packs, money in, `grams_made`, `samples`), with 7 days on this and last week, per-product packs on this week and last week so far, this week's money in by how it was paid (`amount_by_method`, `20260926000008`), `first_order_at`, up to 3 first names waiting on a total or a payment, and `kitchen` (the same object as `get_admin_kitchen()`) |
| `get_admin_metrics()` | Home's metrics block (`20261001000000`): `{ as_of, first_order_at, periods }` with `today`, `week`, `month`, `year` and `lifetime`, each `{ starts_at, ends_at, totals, previous, products, chart }`. `totals`: real orders, packs, grams, `sales` (₹ on orders with a total), `with_total`, `without_total`, `paid_of_sales` (paid so far on the period's orders with a total, each capped at its total; not the same as `came_in`), `samples {orders, packs}` and `came_in {amount, payments, without_amount, by_method}`. `previous` is the same up to the same moment in the previous period, or null when there's no comparison. `products`: orders, packs and grams per product (no ₹), with `previous`. `chart`: `grain` (`hour`, `day`, `week` or `month`), `now_index`, `current` (the whole period) and `previous` (the whole previous period, the ghost); each bucket has `orders`, `with_total`, `packs`, `sales`, `came_in`, `came_in_by_method` and `products` (packs per product). Shape and definitions: `temp/home-metrics/contract.md` until it ships. |
| `get_admin_customers(p_search)` | People grouped by phone. Free sample orders don't count as orders; they show as `samples`. |
| `get_admin_kitchen()` | `{ can_write_off, today, products: [{product_id, sample_grams, shelf_life, to_cook, waiting_packs, queue, spare, spare_batches}], batches }`: per product the grams still to cook, the packs and the people waiting (in fill order: priority first, then oldest first), each with `priority`, `short`, `also_waiting` (its other products still short) and `covered` (its other products already covered), usable spare, and every batch with food on the shelf (with `expires_on`, `days_left` and `state`: `fresh`, `near`, `past`); plus `batches`, those made or logged in the last 14 days, to fix, each with `to_orders`, `spare`, `written_off` and `orders` (how many orders it fed). |
| `log_admin_batches(p_batches, p_preview)` | "Log cooking": `[{product_id, grams, made_on?}]`, 1 to 10; `made_on` is `YYYY-MM-DD`, today when left out. Returns the **effects**. |
| `update_admin_batch(p_id, p_changes, p_preview)` | Fix a batch: `{grams?, made_on?}`. Returns the effects. |
| `delete_admin_batch(p_id, p_preview)` | Delete a batch logged by mistake, with its used up / thrown out rows. Returns the effects. |
| `write_off_admin_spare(p_batch_id, p_grams, p_reason)` | Used up (`used_up`) or thrown out (`thrown_out`): some of a batch's spare, or all of it with `p_grams` null. The cook only. Returns the effects. |
| `undo_admin_kitchen(p_action_id)` | Undo of any kitchen call: `{ undone, kitchen }`. A second tap does nothing. Refused ("Something changed since, so this can't be undone.") if a row it changed has moved since. |
| `give_admin_priority(p_order_id, p_preview)` | "Give it to Meera": a priority order in Cooking that's still short takes whole packed pouches from non-priority orders in Packing or Ready, of the same product and pack size as a pack it's missing and only where they fit, newest order first. Never Delivered, never another priority order. An order that gives one goes back to Cooking (unless still covered). The app asks with `p_preview: true` (nothing changes) right after Priority is set or a priority order is added, and commits on yes. Returns the kitchen effects plus `pouches: [{order_id, code, name, from, product_id, size, grams_each, count}]` (`[]`: nothing to offer); Undo with `undo_admin_kitchen(action_id)`. |
| `set_admin_kitchen_product(p_product_id, p_settings)` | Products page: `{sample_grams?, shelf_life?: {amount, unit} or null}`. Returns the kitchen. |
| `set_admin_stock(p_product_id, p_size, p_in_stock)` | The stock switch |
| `get_admin_coupons()`, `create_admin_coupon`, `update_admin_coupon`, `set_admin_coupon_active` | Coupons, with how often each was used (orders that aren't cancelled) and (since `20260928000002`) `kind`. Create and update take a last `p_kind` (`repeat` or `one_time`): left out, create makes One-time and update keeps the kind. |
| `get_admin_coupon_uses(p_phone)` | `[{order_id, order_code, coupon_code, created_at}]`: one number's orders that carried a coupon, not cancelled, website orders included, newest first, at most 50 (`20260928000002`). The phone is cleaned like the order form's; anything else is `[]`. Add order uses it for the Repeat fill-in and the One-time note. |
| `get_admin_prices()` | `{ base: [{product_id, size, price}], coupons: [{coupon_id, product_id, size, price}] }`, sorted by product and size (coupons by code first). Empty lists are `[]`. |
| `set_admin_prices(p_prices)` | `[{ coupon_id, product_id, size, price }]`, 1 to 200, exactly those keys. `coupon_id` null is the base price; `price` null deletes that row, a whole number 1–99,999 sets it. An unknown coupon or the same pack twice is an error, and one bad item saves nothing. Returns the same as `get_admin_prices()`. |
| `get_admin_email_list()` | Email list members and counts |

- **Errors:** plain messages for people use errcode `22023` and are shown as they come. **Not an admin comes back as HTTP 400, code `P0001`, message `Unauthorized`** (anon gets 401). The admin matches on the message.
- **Stages (`get_admin_totals()`)**: `cooking`, `packing` and `ready` are the status; `to_collect` is Delivered, not paid in full and not a free sample. Done is delivered and paid in full, or a delivered free sample order; cancelled and done orders are in no stage. Weight is `order_lines.grams_each`. Packs leave samples out (they're counted as `samples`); grams include them. Money is per order, so it's only in `overall`, and a free sample order never adds to money, `without_amount` or the names. Weeks start Monday 00:00 IST; their orders and packs are every order that isn't cancelled or a free sample, by `created_at`; `grams_made` is batches by `made_on`; `samples` is free sample orders and sample packs on any order. Money in (`amount_in`) is every payment on a not-cancelled order, in the week it came in (`order_payments.paid_at`; before `20260928000000` it was the order's whole amount by the day it was marked paid, which gives the same numbers for orders paid in one go). This week's `amount_by_method` splits that money in by each payment's method (`upi`, `cash`, `bank`, `other`, and `not_recorded` for payments from orders marked paid before `20260926000007`); payments with no amount add nothing, so the five add up to `amount_in`. `paid_orders` still counts orders paid in full in the week. `to_collect` is Delivered and not paid in full, so it includes part-paid orders; `amount_due` is what's still owed on a stage's orders with a total, and `part_paid` counts orders with a payment that isn't the whole total. `get_admin_overview()` has the same `amount_due` and `part_paid` on its queue. Empty means zeros, not nulls.
- **Metrics (`get_admin_metrics()`)**: the definitions are `get_admin_totals()`'s weeks, for five periods. Real orders (not cancelled, not a free sample, any stage) by `created_at`; packs and grams leave samples out; `sales` is each order's total as it is now, in the period it was placed; `came_in` is every payment on a not-cancelled order by its own `paid_at`. All cut in India time; weeks start Monday. The previous period runs to the same moment, and when that day doesn't exist there (31 March, 29 February) to the end of that month. No comparison (`previous` null) until the first real order is before the previous period's start. Profit, avg order, share and change % are the browser's. The work is in `admin_metrics_json(p_now)`, which has no grants so the tests can pin "now".
- **`get_waitlist_count_stats()` is internal.** No role can call it through the API (migration `20260926000005`); `get_admin_email_list()` uses it inside the database for its counts.

**Testing locally.** `supabase start`, `supabase db reset`, then `supabase test db` runs the pgTAP files in `supabase/tests/`. They cover grants, rate limits, repeat saves, clashes, the overview, the Home totals and their week boundaries, the product filter, how an order was paid (`20260926000007`), this week's money by method (`20260926000008`), part payments (`20260928000000`: the backfill, part to full, extra, delete and Undo, money by the week each payment came in), prices (`20260928000001`: set, get and delete, all or nothing, a coupon's prices going with it, `check_coupon()` unchanged), coupon kinds (`20260928000002`: One-time by default, create and update with and without a kind, one signature each, one number's coupon orders), the last note seen (`20260929000000`: own row only, bad ids refused), the kitchen (`20260929000001`: the stage mapping, site orders taking spare, the fill order, priority (taking from Cooking orders, packed pouches only on a yes: same size, newest first, never Delivered), preview, undo and when it's refused, the batch check at commit as a real admin, the cook and anon, cancel and delete, edits after cooking, batch fixes, moves by hand, write-offs, free samples and sample weights), held in Cooking (`20260930000000`: the move from Packing and from Ready, never promoted, not a donor, Undo, cancel, reopen, batch changes, edits, priority, the flag's guards), and every admin RPC. For demo data to click through (the kitchen scenario from the design brief, every payment state, two local sign-ins), load `supabase/seeds/local-demo.sql` by hand after a reset, with `psql -v ON_ERROR_STOP=1 --single-transaction -f`, so a failure leaves nothing half loaded. It isn't in the seed paths, so it never runs anywhere else. Each test file clears the order tables inside its own transaction and rolls back, so local test data survives. To add a migration without wiping local data, use `supabase migration up`, and never `db reset` a local stack other sessions are using.

### The kitchen

Migration `20260929000001`. Orders go **Cooking → Packing → Ready → Delivered**, and a delivered order is done once it's paid in full (a free sample order at once). There's no confirm step: every order, the website's included, starts in Cooking.

- **Fill rule.** Per product, in grams: Cooking orders short of it, priority orders first, oldest first within each, take usable spare, oldest batch first (by made-on day). A Cooking order covered on every product moves to Packing by itself (an `auto` event). It runs after every change that adds food or need: a new order, a batch, a cancel, an edit, a longer shelf life. So spare is never left while a Cooking order is short of that product. **Priority** orders fill first; one still short then takes food from non-priority Cooking orders, newest first, but only when that completes its line for the product (they wait for the next batch; Undo puts it back exactly). Otherwise it takes nothing and gets the next batch first. Samples are never taken (a giver keeps its samples' grams). Packed food (Packing, Ready) only moves on a yes, through `give_admin_priority()`, pack sizes only; Delivered orders are never touched. The kitchen's queue lists priority orders first.
- **Spare** is a batch's grams less what it gave to orders and what's written off. It keeps the batch's made-on day. `expires_on` is made-on plus the shelf life (months are calendar months); it's `past` from that day and `near` when a fifth of the shelf life or less is left (at least 2 days). Past spare stays on the shelf, with its warning, but never fills an order. Nothing is ever thrown out by itself.
- **Past Cooking, an order is always fully covered**: batch grams where they came from a batch, a by-hand row for the rest. Moving an order out of Cooking by hand covers the short part by hand (never from spare). Back to Cooking by hand drops only the by-hand part. From Delivered it's refused when batches cover it all; from Packing or Ready it's allowed and the order is held (below).
- **Cancel** from Cooking, Packing or Ready: batch grams go back to spare with their made-on day, and the fill runs. From Delivered: nothing comes back (the food left).
- **An edit** that needs more takes it from spare, and if still short goes back to Cooking waiting only for the missing grams. One that needs less gives back by-hand grams first, then the newest batch grams, and the fill runs. A delivered order's edit only moves its by-hand part.
- **A batch fixed smaller, or deleted**, takes grams back in the reverse of the fill: normal orders before priority ones, youngest first. Cooking and Packing orders go back to Cooking (and may fill again from other spare); Ready and Delivered ones keep the food as by hand.
- **Effects.** Batch calls, write-offs and a status change return `{ preview, action_id, batches: [{id, product_id, grams, made_on, to_orders, spare, written_off, deleted}], orders: [{id, code, name, from, to, grams: [{product_id, change}], waiting}], kitchen }`. `grams` is the net change in batch grams (by-hand rows aren't food); `waiting` is what a Cooking order still needs. "Covers 4 orders, 200 g left over" is the orders going `cooking` → `packing` plus the batch's `spare`.
- **Preview** (`p_preview: true`) runs the real call and rolls it back, so it can't disagree with the commit, and leaves nothing behind. It returns `action_id: null`.
- **Undo.** Each kitchen call records its row changes (triggers, while an action is open). `undo_admin_kitchen()` replays them backwards, each only if its row is still as the call left it, and refuses if an order it touched would end up holding more than it needs; then it runs the fill (for a write-off too, through its batch). It writes no history of its own and removes the `order_events` the action wrote (`order_events.action_id`), so an order's history reads as if the mistake never happened. An order that gave a packed pouch has `detail` on its return to Cooking (`{reason: 'gave_priority', to_code, to_name, items}`), returned in `get_admin_order()`'s history. Actions are kept 7 days.
- **Held in Cooking** (migration `20260930000000`). A person moving an order Packing or Ready to Cooking (`update_admin_order {status:'cooking'}`) puts it in Cooking **held** (`orders.kitchen_hold`, `held` in the order JSON). It keeps its batch food (nothing becomes spare), loses only its by-hand part (for a Ready order that includes food a smaller batch turned into by-hand while it was Ready: the existing Ready to Cooking rule, kept), and the kitchen never moves it to Packing by itself: `kitchen_promote()` skips it, however covered. It is also never a donor to a priority order (`kitchen_fill()`), though it is topped up from spare like any short Cooking order, and a batch fixed smaller or deleted takes grams off it as off any Cooking order (it stays held). It leaves Cooking only by a person: Move to Packing (the short part is covered by hand, as before), another status, or cancel. A trigger clears the flag on any status change, so cancel, Undo, the rules and a reopen all leave it false, and a check refuses a hold outside Cooking. The flag is set in the same update as the status, before the fill runs. Only Packing or Ready to Cooking holds: Delivered to Cooking (refused while batches cover it all), and every automatic move back to Cooking (a smaller batch, an edit, giving a pouch), are not held and are promoted by the next batch as before. A held order that's fully covered is Cooking with short 0, so it's not in `to_cook` or the queue; one that's short is in both. Undo is exact, including `status_changed_at` (Ready's "waiting N days"): order steps in the undo log also record `kitchen_hold` (a step logged earlier has no key and reads false) and match on it. A priority order that's held may still take packed pouches through `give_admin_priority()`; it stays held and isn't promoted. Priority on a held order, an edit and Undo's closing fill all leave it held.
- **Locks.** Every path that touches the kitchen takes one advisory lock per kitchen product, all of them in sorted order, before locking any order row. Two phones logging and moving at once wait their turn instead of deadlocking.
- **Existing orders** at the migration: New and Confirmed became Cooking, Sent became Ready, and a site order that was stale (it never came through) became Cancelled, with an auto event. Ready and Delivered orders are covered by hand for everything they hold; spare starts at zero, so everything in Cooking starts as to cook.
- **Deploy order.** The admin and this migration ship together: back up the order tables, `supabase db push` while the owners aren't mid-work, then push the admin to `main` right after, and ask them to reload (the old admin shows the wrong lanes against it). The website keeps working throughout: `submit_order()` is the same on the outside.

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
- **Repeat or One-time** (`kind`, migration `20260928000002`). Repeat is a
  standing offer: Add order fills it in for a number that used it on their
  latest coupon order, while it's on and not ended. One-time is once per phone
  number: Add order notes (never blocks) when a number uses it again. Coupons
  made before the migration are One-time. From the SQL editor:
  `update public.coupons set kind = 'repeat' where upper(code) = 'EXAMPLE10';`
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
