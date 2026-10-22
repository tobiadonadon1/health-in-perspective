# Launch status — 22 October 2026

This is a real account-based application under activation, not a completed public service. See README.md for installation and current behavior.

## Implemented and deployed
- Supabase email/password accounts with confirmation and reset flow, resend cooldown and duplicate-submit prevention.
- Private report/photo bucket with ownership policies and expiring downloads. The earlier Supabase storage provisioning incident is resolved.
- Structured blood results: values, units, dates, optional lab reference ranges, laboratory and notes; create/edit/delete and same-unit history.
- Persisted dated nutrition journal and complete JSON export.
- No sample account, demo data or preview login.
- WHOOP server OAuth, encrypted tokens, refresh, exact return-origin validation, one-use expiring state, 90-day paginated imports, manual sync and provider revocation on disconnect.
- WHOOP developer application registered with read-only recovery/sleep scopes and the production callback. Client credentials and token encryption key saved in Supabase server secrets; never in the frontend or Git.
- Public website and public GitHub source are available. GitHub Actions passed on the deployed source.
- Charts display recorded data only; unavailable integrations and AI controls are not presented as working.
- Branded confirmation and password-reset email HTML prepared in supabase/templates; not active until custom SMTP or a qualifying plan is configured.
- Data-use notice at /privacy.html.

## Verified
- 20 automated tests: email flow, nutrition, lab validation and range handling, true-data charts, WHOOP pagination/mapping/invalid responses, exact CORS allowlist, and PostgreSQL ownership isolation.
- Live staging transaction verifies cross-account blood-result, meal and file isolation, denies client-forged wearable measurements and access to server tokens. Fixtures rolled back.
- Deno Edge Function type check; frontend production build.
- HTTP CORS allows configured localhost, rejects unrelated origins; invalid user tokens and anonymous database reads are rejected.

## Activation still required
- A live WHOOP member authorization/import test. The application is configured; WHOOP's initial sandbox permits 10 connected members until the provider approves a higher tier.
- Custom transactional email sender. Supabase default delivery cannot register arbitrary public addresses; styling is disabled on the current free/default-mail configuration. Do not change VITE_AUTH_AUDIENCE to public until non-team delivery is tested.
- The owner's account is confirmed and has signed in. The test browser still needs an authenticated session to verify the full WHOOP and file upload/download flows.
- AI/USDA credentials for optional automation. Manual nutrition is functional independently.
- Fitbit/Google Health and an Apple HealthKit companion are not implemented.
- Account erasure is currently an operator request. Monitoring, backups, retention decisions and broader production hardening remain required before commercial launch.

Do not describe this as finished or broadly open for enrollment while these items remain unresolved.
