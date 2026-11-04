# Deploying Free and Pro (branch `pro-tier-whoop`)

**Deployed 4 November 2026:** steps 1–5, 7 and 8 are done (migration, secrets, API, WHOOP disconnect of all 11 members,
Stripe webhook `we_1UY5xyB7HQhkKmiFBSuF0Y34` + payment-link redirect, web app, schedules via
`supabase/migrations/20261104120000_pro_schedules.sql`). Still open: `STRIPE_SECRET_KEY` (restricted key, enables
"Manage plan"), the Stripe customer portal, Garmin (step 6 + keys), Google Health keys, Resend for report emails.
The Stripe account also bills other businesses: without `STRIPE_SECRET_KEY`, a checkout only counts when it came from
the Xeyo payment link (`STRIPE_PAYMENT_LINK_ID`, default `plink_1UXozfB7HQhkKmiFQafwm1uD`).
Do the steps in this order: the database first, then secrets, then the API, then the WHOOP disconnect, then the web app.

## 0. Before you start
- Supabase project `pisvrssqmlspuahyvbrx`, Vercel project `health-in-perspective`.
- Tests: `npm test` (the end-to-end tests need `postgres`, `postgrest` and `deno` on PATH; `brew install postgresql@17 postgrest deno`).

## 1. Database
```sh
supabase db push --project-ref pisvrssqmlspuahyvbrx      # applies supabase/migrations/20261103120000_free_and_pro.sql
```
(or paste that file into the SQL editor). It only adds tables and functions, adds two nullable columns to
`wearable_secrets`, and replaces the `health_readings` read policy (Free: 30 days; manual entries always; Pro: all).
No rows are deleted. **From this moment Free members see 30 days of wearable history**, so do steps 2–4 promptly.

## 2. Secrets (Supabase → Edge Functions → Secrets, or `supabase secrets set --project-ref pisvrssqmlspuahyvbrx K=V …`)
| Name | Value |
|---|---|
| `WHOOP_SEAT_CAP` | `10` now; `100` once WHOOP approves Build (no code change) |
| `ADMIN_TASK_SECRET` | 40+ random characters (`openssl rand -hex 24`), for the disconnect and the maintenance job |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the webhook endpoint in step 5 |
| `STRIPE_SECRET_KEY` | a **restricted** key: Subscriptions *read*, Customer portal *write* |
| `STRIPE_PAYMENT_LINK` | optional; defaults to `https://buy.stripe.com/4gMeVcevV71hce2g0j0RG04` |
| `STRIPE_PRO_PRODUCT` | optional; defaults to `prod_VYwqqND3EY7S3r` |
| `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET` | from the Garmin developer portal |
| `GARMIN_WEBHOOK_TOKEN` | 32+ random characters; part of the push URL in step 6 |
| `RESEND_API_KEY`, `REPORT_FROM_EMAIL` | optional, for the weekly report email (e.g. `Xeyo <reports@xeyo.ai>`, domain verified in Resend) |
| `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET` | still pending from the Fitbit setup |

## 3. API
```sh
supabase functions deploy health-api --project-ref pisvrssqmlspuahyvbrx --use-api
```

## 4. Disconnect every live WHOOP connection (data kept)
Dry run again (read-only), then apply inside the API, where `TOKEN_ENCRYPTION_KEY` lives:
```sh
export SUPABASE_URL=https://pisvrssqmlspuahyvbrx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=…            # Project settings → API keys → service_role
node scripts/disconnect-whoop.mjs              # dry run: lists user id, email, connected date
ADMIN_TASK_SECRET=… node scripts/disconnect-whoop.mjs --apply --via-function
node scripts/disconnect-whoop.mjs              # should now list 0
```
Each member: revoke at WHOOP, tokens deleted, pending authorizations cancelled, seat freed, one-time notice queued.
Re-running is safe. Add `--force` only if WHOOP refuses a revoke and you still want the tokens gone.

## 5. Stripe
- Developers → Webhooks → Add endpoint:
  `https://pisvrssqmlspuahyvbrx.supabase.co/functions/v1/health-api?hook=stripe`
  Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`. Copy the signing secret
  into `STRIPE_WEBHOOK_SECRET`.
- Payment link → After payment → "Don't show confirmation page" → redirect to `https://app.xeyo.ai/?checkout=success`.
- Settings → Billing → Customer portal: turn it on (cancel subscription allowed).
- Payments made from the website (no Xeyo account id) are linked to the Xeyo account with the same verified email.

## 6. Garmin developer portal
- Redirect URL: `https://app.xeyo.ai/garmin-callback.html`
- Push URL (every summary type set to PUSH: Dailies, Sleeps, HRV, Body Comps, Pulse Ox, Respiration, Activities,
  Manually Updated Activities, Deregistrations, User Permissions Change):
  `https://pisvrssqmlspuahyvbrx.supabase.co/functions/v1/health-api?hook=garmin&token=<GARMIN_WEBHOOK_TOKEN>`
- If the first token exchange fails, the token host is the one unverified constant: switch `GARMIN_TOKEN_URL` in
  `supabase/functions/health-api/garmin.mjs` between `connectapi.garmin.com` and `diauth.garmin.com`.

## 7. Web app
```sh
git push github pro-tier-whoop        # Vercel builds a preview first — check it
# then merge to main when you're happy; Vercel deploys app.xeyo.ai and xeyo.ai
```

## 8. Schedules (Supabase → Integrations → Cron, needs pg_cron + pg_net)
Store the admin secret in Vault as `xeyo_admin_task_secret`, then:
```sql
select cron.schedule('xeyo-pro-daily','15 3 * * *',$$select net.http_post(
 url:='https://pisvrssqmlspuahyvbrx.supabase.co/functions/v1/health-api',
 headers:=jsonb_build_object('Content-Type','application/json','x-xeyo-admin',(select decrypted_secret from vault.decrypted_secrets where name='xeyo_admin_task_secret')),
 body:='{"action":"pro-maintenance"}'::jsonb)$$);
select cron.schedule('xeyo-weekly-report','0 7 * * 1',$$select net.http_post(
 url:='https://pisvrssqmlspuahyvbrx.supabase.co/functions/v1/health-api',
 headers:=jsonb_build_object('Content-Type','application/json','x-xeyo-admin',(select decrypted_secret from vault.decrypted_secrets where name='xeyo_admin_task_secret')),
 body:='{"action":"pro-maintenance","weekly":true}'::jsonb)$$);
```
The daily job disconnects anyone whose Pro ran out without a webhook; whoop-sync also enforces it on every sync.

## 9. Check it
- Sign in as a Free account: WHOOP card shows "Upload WHOOP export" and the seat count; 90-day/1-year charts and CSV are locked.
- `select * from public.onboarding_funnel;` shows the onboarding funnel; `select * from public.whoop_waitlist order by joined_at;` the waitlist.
- Give yourself Pro for testing without paying:
  `insert into public.subscriptions(stripe_subscription_id,user_id,status,current_period_end) values('manual_owner','<your user id>','active',now()+interval '1 year');`
