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
- Configure Resend or another email provider before sending verification or launch campaigns.

## Email functions

```bash
supabase functions deploy send-waitlist-confirmation
supabase functions deploy verify-waitlist-email --no-verify-jwt
supabase functions deploy unsubscribe --no-verify-jwt
supabase secrets set RESEND_API_KEY=... PUBLIC_SITE_URL=https://www.shahsnutrition.food EMAIL_FROM="Shah's Nutrition <hello@shahsnutrition.food>" EMAIL_REPLY_TO=pranjalishah25@gmail.com
```

The confirmation function is invoked after a successful signup and is non-blocking. Verification and unsubscribe links update the corresponding member fields through service-role-only database functions.

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

All admin RPCs check `public.is_admin()` and return 401 for non-admins.

Schedule `select public.purge_waitlist_retention();` daily with Supabase Cron or an external scheduled job.
