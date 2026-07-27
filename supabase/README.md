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
supabase secrets set RESEND_API_KEY=... PUBLIC_SITE_URL=https://shahsnutrition.com EMAIL_FROM="Shah's Nutrition <hello@shahsnutrition.com>"
```

The confirmation function is invoked after a successful signup and is non-blocking. Verification and unsubscribe links update the corresponding member fields through service-role-only database functions.

Schedule `select public.purge_waitlist_retention();` daily with Supabase Cron or an external scheduled job.
