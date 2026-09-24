# Supabase Setup

## Link and deploy

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Create the first owner account in Supabase Auth, then add that user to `public.admin_users` from the SQL editor:

```sql
insert into public.admin_users (id, email, display_name)
select id, email, 'Owner'
from auth.users
where email = 'owner@example.com';
```

The owner dashboard is available at `/admin/login` after setting `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the deployment environment.

## Required production configuration

- Enable email/password Auth and configure a production SMTP provider.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- Add a CAPTCHA or edge rate limit before opening the public RPC to high traffic.
- Configure Loops for waitlist double opt-in. Supabase remains the source of truth for members and admin data.

## Email functions

```bash
supabase functions deploy sync-waitlist-loops
supabase functions deploy loops-webhook --no-verify-jwt
supabase functions deploy unsubscribe --no-verify-jwt
supabase secrets set LOOPS_FORM_ENDPOINT="https://app.loops.so/api/newsletter-form/<form-id>" LOOPS_WAITLIST_MAILING_LIST_ID=<mailing-list-id>
supabase secrets set LOOPS_SIGNING_SECRET=<signing-secret>
supabase secrets set RESEND_API_KEY=... WAITLIST_OWNER_EMAIL="pranjalishah25@gmail.com,sugamsh08@gmail.com" EMAIL_FROM="Shah's Nutrition <hello@shahsnutrition.food>"
```

`sync-waitlist-loops` is invoked after Supabase stores a new signup and is non-blocking. It submits the email, Waitlist mailing list ID, and optional source as `application/x-www-form-urlencoded` to the Loops Form endpoint. Loops owns double opt-in; provider errors are logged and reported as `stored: true` so they never falsely undo a stored signup. Set the endpoint and list ID as Supabase secrets, not frontend variables. The old `send-waitlist-confirmation` and `verify-waitlist-email` functions are retired and should not be deployed. Keep `unsubscribe` deployed: `send-admin-email` still uses it as the fallback unsubscribe handler for custom Resend campaign URLs.

The same function sends a separate owner-only alert through Resend after confirming the member exists in Supabase. Loops does not provide an appropriate internal-notification path here; its Form endpoint is for contacts and double opt-in. `RESEND_API_KEY` and `WAITLIST_OWNER_EMAIL` stay server-side. Set `WAITLIST_OWNER_EMAIL` to one address or a comma-separated list (for example, `pranjalishah25@gmail.com,sugamsh08@gmail.com`) to send one alert to each recipient. Alerts use a member-based Resend idempotency key and are retried when delivery or status recording fails; they never block the signup or create a fake Loops contact.

In Loops, open **Settings → Webhooks**, set the endpoint to `https://<project-ref>.supabase.co/functions/v1/loops-webhook`, save the generated signing secret as `LOOPS_SIGNING_SECRET`, and enable `contact.created`, `contact.mailingList.unsubscribed`, `contact.unsubscribed`, `email.unsubscribed`, `email.spamReported`, and `email.hardBounced`. The webhook verifies `Webhook-Id`, `Webhook-Timestamp`, and `Webhook-Signature`, marks confirmed members verified, and syncs unsubscribe, spam, and hard-bounce states by normalized email. Test events and duplicate deliveries are acknowledged safely.

The published Loops double opt-in email is branded as follows: `Pranjali from Shah’s Nutrition` sends from `hello@mail.shahsnutrition.food` and replies to `pranjalishah25@gmail.com`. Its subject is `Confirm your Shah’s Nutrition waitlist spot`, the preview says `One quick click to confirm your email and save your spot.`, and the body asks the subscriber to confirm before receiving launch updates and early access. The confirmation button uses the Shah’s Nutrition gold accent. Loops automatically adds the configured company name and physical address footer.

## CRM admin functions

Migration `20260727000003` adds member tags/notes/status tracking, `email_campaigns` and `email_log` tables, and admin-safe RPCs.

### Deploy the send-admin-email edge function

```bash
supabase functions deploy send-admin-email
supabase secrets set RESEND_API_KEY=... PUBLIC_SITE_URL=https://www.shahsnutrition.food EMAIL_FROM="Shah's Nutrition <hello@shahsnutrition.food>" EMAIL_REPLY_TO=pranjalishah25@gmail.com
```

The function validates the caller is an admin via JWT, accepts up to 100 member IDs, excludes unsubscribed/non-consenting/bounced/spam members, sends via Resend with unsubscribe links, logs delivery/failure to `email_log`, and returns per-member results.

### Admin RPCs available

| Function | Purpose |
|---|---|
| `get_admin_waitlist(p_page, p_per_page, p_search, p_source, p_theme, p_marketing_consent, p_status)` | List members with session stats and new fields |
| `get_admin_member_detail(p_member_id)` | Full member profile + sessions + email log |
| `update_admin_member(p_member_id, p_tags, p_notes, p_status, p_marketing_consent, p_product_id, p_theme)` | Update member fields |
| `get_admin_campaigns(p_page, p_per_page)` | List campaigns with delivery stats |
| `get_admin_campaign_log(p_campaign_id, p_page, p_per_page)` | Campaign delivery log |
| `get_waitlist_count_stats()` | Consistent count breakdown (active, bounced, etc.) |
| `get_admin_order_clicks(p_days)` | WhatsApp order clicks by source and device; `p_days = null` for all time |

All admin RPCs check `public.is_admin()` and return 401 for non-admins.

Migration `20260727000006` enables `pg_cron`, restricts
`purge_waitlist_retention()` execution to `service_role`, and schedules the
existing retention cleanup daily at **03:00 UTC** under the
`purge-waitlist-retention` job name. The migration replaces an existing job
with that name when rerun; no external scheduler is required.

## WhatsApp order click tracking

Migration `20260924000000` adds `site_events` (anonymous, no PII) and the public
RPC `track_site_event(p_event, p_source, p_device_type, p_theme)`, which the site
calls when someone taps "Order on WhatsApp". Anon users can call the RPC but can't
read, change or delete any rows. The RPC accepts only `whatsapp_order_click` and
the known button sources, and rate-limits to 60 clicks per IP per hour and 3,000
per hour overall. It also schedules `purge_site_events()` daily at **03:15 UTC**
(`purge-site-events` job), which keeps 13 months of events.

After `supabase db push`, check it from the SQL editor:

```sql
select jobname, schedule from cron.job where jobname = 'purge-site-events';
select event, source, device_type, created_at from public.site_events order by created_at desc limit 10;
```

