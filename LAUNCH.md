# Neka: implementation and launch status

This is an application foundation and hosted preview, **not a production-ready health service**. Supabase account services are connected to a staging project. Verification email remains restricted to approved test addresses until a custom sender is configured. The hosted site remains private.

## Implemented
- Luminous sage/peach glass surfaces, smooth orange energy orb with no visible wordmark, desktop/mobile layouts. Generated editorial human portrait on Home/sign-in, with clickable health signals. Dedicated proportion-preserving digestive illustration in a compact card.
- Optional real local 3D scanned bust in Body → 3D study, with orbit/zoom controls and attribution; no image-plane illusion. Appearance is a display material, not a body-composition measurement.
- Account UI wired to Supabase email/password sign-up, sign-in, email confirmation and password reset. Disabled if configuration is absent.
- Nutrition label entry, meal deletion, daily calorie/macronutrient totals and energy-share chart.
- Server-side USDA search; optional AI food-query extraction; AI label extraction and audio transcription. Explicit review before saving. Mixed meals are logged ingredient by ingredient.
- Private PDF/photo storage and short-lived downloads; delete-record flow.
- User-owned meals/records and read-only imported measurements protected by PostgreSQL row-level security.
- Server-side WHOOP OAuth, one-use state, AES-GCM encrypted tokens, refresh, import of up to 25 recent recovery/sleep records, manual sync and local disconnect.
- Fictional demo workspace isolated from live accounts. Demo meals are deliberately in-memory, not persistent.

## Not complete / not verified live
- Supabase is connected. `neka-staging` (`pisvrssqmlspuahyvbrx`) was created in the user-selected `healthapp` organization in US East. Core tables, ownership policies and the `health-api` Edge Function are deployed.
- Storage provisioning is blocked: the dashboard reports “Missing tenant config” and the `storage.buckets` / `storage.objects` tables are absent. Supabase reported an ongoing API Gateway / Project Creation incident. The storage migration is not applied; uploads are gated by `VITE_STORAGE_READY=false`. Do not create replacement storage system tables manually.
- Site URL and four exact hosted/local authentication redirect URLs are configured. Email confirmation is on, minimum password length is 12, and secure password changes are enabled. Custom SMTP is not configured.
- End-to-end account confirmation/recovery, cloud persistence, actual wearable authorization and AI requests require credentials and testing.
- WHOOP needs an approved developer app and real-user tests. Scheduled sync, pagination/backfill and webhooks are not implemented.
- Fitbit's legacy API retires October 30, 2026. The Google Health integration is not implemented; it needs a Google Health project and a current approved API contract.
- Apple Watch needs a separate iPhone HealthKit companion. That native app is not built here.
- Photo-to-3D likeness reconstruction is not implemented. The bust is an attributed generic scan. Photos are private reference files only.
- No glucose, inflammation, water-retention or fat-distribution inference is performed from food or photos.
- No automatic clinical interpretation of lab reports. Original files are stored.
- Operator privacy notice, retention/deletion policy, support contact, account-erasure flow, monitoring, backups, abuse controls, production load/security review and any applicable clinical/regulatory review remain launch work.

## Activate backend
1. Use the already created `neka-staging` project in `healthapp`; do not create a duplicate.
2. Core migrations `initial_health_core` and `index_oauth_state_ownership` are already applied. After Supabase storage provisioning recovers, apply only the storage bucket/policy section of `database/schema.sql`. Run `tests/staging-rls.sql`, then set `VITE_STORAGE_READY=true`. Do not rerun the whole schema against existing tables.
3. Site URL, redirect URLs, email confirmation and the 12-character password minimum are set. Configure a custom SMTP sender and appropriate signup limits/CAPTCHA before public registration. Test sign-up, expired/reused links, sign-in and recovery with two real test accounts. Keep `VITE_AUTH_AUDIENCE=testing` until that is complete.
4. Local `.env.local` contains the public Supabase project URL and publishable key; it is ignored by Git. Rebuild after configuration changes. Server secrets must never be VITE variables.
5. `supabase/functions/health-api/index.ts` is deployed as `health-api` version 1. Redeploy when server code changes. POST requests validate bearer tokens via `auth.getUser`; the OAuth callback instead consumes a one-use server-side state. Do not remove these checks.
6. Configure server-only secrets: `APP_ORIGIN`, `USDA_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL` (a chat/vision model supporting JSON mode), `OPENAI_TRANSCRIPTION_MODEL`, `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (base64 32 random bytes). Supabase provides its URL and service-role secret to the function runtime. Never expose secrets as VITE variables.
7. WHOOP redirect URI: `https://<project-ref>.supabase.co/functions/v1/health-api`. Requested scopes: `read:recovery read:sleep offline`.
8. Run real cross-account isolation, file access, provider failure/revocation/refresh, API limits, consent, sign-out, mobile and browser tests before public enrollment. Disconnect removes our stored token; revoke authorization in WHOOP to invalidate the provider grant.

## Run locally
`npm ci`, `npm test`, `npm run dev` → http://localhost:3001.
`npm run build` creates static hosting output in `dist/`.

## Verification performed
- Visual revision checked at 1440 × 900 and 390 × 844: portrait metric markers, metric period switching, digestive detail → nutrition navigation, portrait/3D display switch, and sign-in presentation. Fixed a masked-out anatomy image and mobile glow overflow; mobile document width now equals the 390 px viewport. Browser console had no errors.
- Vite production build.
- Node domain tests: nutrition validation, per-100g serving conversion, totals, upload restrictions and HTML escaping.
- PostgreSQL (PGlite) execution of the actual schema with two user roles: cross-user SELECT/INSERT/UPDATE denied, foreign-file access denied, forged wearable writes denied, secrets inaccessible, anonymous access denied, 40/hour API credit limit enforced. This is local SQL verification, not a substitute for testing the hosted Supabase project.
- Browser checks at desktop and 390 px phone width: sample meal creation/removal and totals, account configuration gating, accessible navigation, modal sizing, metric periods, actual 3D rotation. Fixed issues found during these checks.
- Live staging SQL test (`tests/staging-core-rls.sql`): synthetic users isolated, ownership reassignment and forged measurements denied, token tables inaccessible. Fixtures are rolled back. Storage awaits provisioning.
- Live HTTP tests: anonymous meals read 401; unsigned/invalid API tokens 401; short signup password 422 with the required 12-character minimum. No confirmation email was sent by these tests.
- Security advisor reports three expected informational notices: RLS with no client policies on server-only `wearable_secrets`, `oauth_states`, and `api_usage`. Their deny-by-default state is intentional. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Deno type-check of the Edge Function. External provider requests and actual email delivery remain unverified.

## Sources
- WHOOP: https://developer.whoop.com/docs/developing/oauth/ and https://developer.whoop.com/api/
- Fitbit migration: https://dev.fitbit.com/build/reference/web-api/authorization/
- Google Health: https://developers.google.com/health
- Apple HealthKit: https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data
- Nutrition: https://fdc.nal.usda.gov/api-guide/
- Bust license and source: `public/models/ATTRIBUTION.txt`.

## Owner setup
See `infrastructure/PROVIDER-SETUP.md` for prepared WHOOP registration values and the remaining email/AI/Google/Apple account setup. No paid subscriptions or provider agreements have been activated.
