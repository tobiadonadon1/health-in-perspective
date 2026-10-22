# Neka: implementation and launch status

This is an application foundation and hosted preview, **not a production-ready health service**. No live personal health data is collected while account configuration is missing.

## Implemented
- New sage/peach translucent visual treatment, orange animated sphere, desktop/mobile layouts.
- Real local 3D scanned bust with orbit/zoom controls and attribution; no image-plane illusion. Appearance is a display material, not a body-composition measurement.
- Account UI wired to Supabase email/password sign-up, sign-in, email confirmation and password reset. Disabled if configuration is absent.
- Nutrition label entry, meal deletion, daily calorie/macronutrient totals and energy-share chart.
- Server-side USDA search; optional AI food-query extraction; AI label extraction and audio transcription. Explicit review before saving. Mixed meals are logged ingredient by ingredient.
- Private PDF/photo storage and short-lived downloads; delete-record flow.
- User-owned meals/records and read-only imported measurements protected by PostgreSQL row-level security.
- Server-side WHOOP OAuth, one-use state, AES-GCM encrypted tokens, refresh, import of up to 25 recent recovery/sleep records, manual sync and local disconnect.
- Fictional demo workspace isolated from live accounts. Demo meals are deliberately in-memory, not persistent.

## Not complete / not verified live
- Supabase connector returned UNAUTHORIZED; no project, deployed schema, email system or Edge Function was provisioned.
- End-to-end account confirmation/recovery, cloud persistence, actual wearable authorization and AI requests require credentials and testing.
- WHOOP needs an approved developer app and real-user tests. Scheduled sync, pagination/backfill and webhooks are not implemented.
- Fitbit's legacy API retires October 30, 2026. The Google Health integration is not implemented; it needs a Google Health project and a current approved API contract.
- Apple Watch needs a separate iPhone HealthKit companion. That native app is not built here.
- Photo-to-3D likeness reconstruction is not implemented. The bust is an attributed generic scan. Photos are private reference files only.
- No glucose, inflammation, water-retention or fat-distribution inference is performed from food or photos.
- No automatic clinical interpretation of lab reports. Original files are stored.
- Operator privacy notice, retention/deletion policy, support contact, account-erasure flow, monitoring, backups, abuse controls, production load/security review and any applicable clinical/regulatory review remain launch work.

## Activate backend
1. Reconnect Supabase in Codex; select a dedicated project/organization.
2. Apply `database/schema.sql` to that empty project. Inspect policies and run Supabase advisors.
3. Set Auth site URL and allowed redirect URLs to the deployed origin. Enable email confirmation, a minimum 12-character password, appropriate rate limits/CAPTCHA and custom SMTP for production email. Test sign-up, expired/reused links, sign-in and recovery with two accounts.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env.example`; rebuild. Only these public client values belong in the frontend.
5. Deploy `supabase/functions/health-api/index.ts` with the matching config. POST requests validate bearer tokens via `auth.getUser`; the OAuth callback instead consumes a one-use server-side state. Do not remove these checks.
6. Configure server-only secrets: `APP_ORIGIN`, `USDA_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL` (a chat/vision model supporting JSON mode), `OPENAI_TRANSCRIPTION_MODEL`, `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (base64 32 random bytes). Supabase provides its URL and service-role secret to the function runtime. Never expose secrets as VITE variables.
7. WHOOP redirect URI: `https://<project-ref>.supabase.co/functions/v1/health-api`. Requested scopes: `read:recovery read:sleep offline`.
8. Run real cross-account isolation, file access, provider failure/revocation/refresh, API limits, consent, sign-out, mobile and browser tests before public enrollment. Disconnect removes our stored token; revoke authorization in WHOOP to invalidate the provider grant.

## Run locally
`npm ci`, `npm test`, `npm run dev` → http://localhost:3001.
`npm run build` creates static hosting output in `dist/`.

## Verification performed
- Vite production build.
- Node domain tests: nutrition validation, per-100g serving conversion, totals, upload restrictions and HTML escaping.
- PostgreSQL (PGlite) execution of the actual schema with two user roles: cross-user SELECT/INSERT/UPDATE denied, foreign-file access denied, forged wearable writes denied, secrets inaccessible, anonymous access denied, 40/hour API credit limit enforced. This is local SQL verification, not a substitute for testing the hosted Supabase project.
- Browser sample meal creation and totals update; account configuration gating; responsive and 3D visual checks.

## Sources
- WHOOP: https://developer.whoop.com/docs/developing/oauth/ and https://developer.whoop.com/api/
- Fitbit migration: https://dev.fitbit.com/build/reference/web-api/authorization/
- Google Health: https://developers.google.com/health
- Apple HealthKit: https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data
- Nutrition: https://fdc.nal.usda.gov/api-guide/
- Bust license and source: `public/models/ATTRIBUTION.txt`.
