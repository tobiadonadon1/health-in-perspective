# Health in Perspective

A real, account-based health workspace: WHOOP measurements, a nutrition journal, private reports and structured blood-test results. Vite + JavaScript, Supabase Auth/Postgres/Storage, and a Deno Edge Function. There is no demo login or sample data path.

## Current status

Account services, private storage, per-user data policies and the API are deployed to the connected Supabase project. Live SQL isolation tests pass. Public enrollment still requires a transactional email sender. WHOOP requires the operator's developer application credentials and a live authorization test. Until configured, the UI accurately shows activation pending. Fitbit and Apple Watch are not available in this release.

## Local development

```sh
npm ci
cp .env.example .env.local
# Fill the public Supabase URL and publishable key only.
npm run dev
```

The development server uses http://localhost:3001. `npm test` runs domain, email-flow, WHOOP pagination/mapping and PostgreSQL ownership tests. `npm run build` produces `dist/` for static hosting. Server validation: `deno check supabase/functions/health-api/index.ts`.

## Deploy your own instance

1. Create a Supabase project. Apply `database/schema.sql` once to a fresh project. Existing installations use only the unapplied migrations; do not run the fresh schema twice.
2. Set Auth Site URL and exact email redirect URLs for your frontend, including `/?reset=1`. Keep email confirmation enabled and use a minimum password length of 12.
3. Configure custom SMTP with your verified sender, then install the HTML in `supabase/templates/confirmation.html` and `recovery.html` in Auth → Emails. Set appropriate sending limits and abuse controls. Templates are source-controlled; adding them to this repository does not activate them in a hosted project automatically.
4. Deploy `supabase/functions/health-api` with the included `config.toml`. Gateway JWT verification is disabled only because the OAuth callback has no JWT; every POST validates the user's bearer token with Supabase Auth. GET callbacks consume a random, expiring, single-use OAuth state.
5. Set **server secrets**: `APP_ORIGIN`, optional comma-separated `ALLOWED_ORIGINS`, `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, and `TOKEN_ENCRYPTION_KEY` (base64-encoded random 32-byte key). Set `ALLOWED_ORIGINS` explicitly in production so localhost is not included. The Supabase runtime supplies its own service-role secret.
6. Register one operator-owned WHOOP application with callback `https://YOUR_PROJECT.supabase.co/functions/v1/health-api`, a public privacy notice, and `read:recovery` / `read:sleep` scopes. The OAuth flow requests `offline` for refresh. Each end user connects their own ordinary WHOOP account through OAuth; **end users never enter API keys**. New apps begin in WHOOP's sandbox tier and may need provider approval for more members.
7. Optional food search uses `USDA_API_KEY`; optional AI extraction uses `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_TRANSCRIPTION_MODEL`. Without them, manual nutrition entry remains available and unavailable controls are hidden.
8. Set frontend `VITE_STORAGE_READY=true` once the private bucket and ownership policies have been verified. Set `VITE_AUTH_AUDIENCE=public` only after testing email delivery to a non-team user. Deploy `dist/` to a static host, and update `APP_ORIGIN`, callback return origins, and Auth redirect URLs accordingly.

## Data model and protections

- `meals`: user-owned entries with date, calories, macros and source.
- `lab_results`: user-owned numeric results, original units, collection date, laboratory, optional reference range and notes. Unit changes are not silently converted.
- `records` and private `health-records` bucket: original PDF/images, maximum 10 MB. Download links expire in 60 seconds.
- `health_readings`: client read-only; sourced from WHOOP. No fabricated medical values.
- `wearable_secrets`: encrypted access/refresh tokens; no client table access.
- `oauth_states`: one-use state bound to the initiating user and an exact allowlisted return origin.
- WHOOP imports up to 90 days, follows pagination, refreshes tokens and upserts idempotently. Sync is user-triggered; background webhooks/scheduled synchronization are not implemented. Disconnect revokes provider access, then removes stored tokens.

## Verification and limits

20 automated tests plus live staging SQL ownership checks cover cross-user reads/writes, file paths, fabricated wearable writes, lab validation, OAuth origin filtering, pagination, revoked access and correct measurement mapping. See `tests/staging-rls.sql`: fixtures are rolled back.

These are not a claim of completed live WHOOP testing or general production readiness. Before inviting customers: test two real confirmed accounts and actual file transfers, complete provider setup, configure public email delivery, review privacy/retention commitments, enable operational monitoring/backups, and test account-erasure handling. Complete account deletion is currently an operator request, described in the data-use notice.

No diagnosis, photo-derived body composition, or food-derived glucose/inflammation is provided. The portrait and anatomy are illustrative. Original 3D asset attribution is in `public/models/ATTRIBUTION.txt`.

## Sharing this source

Only public configuration belongs in frontend environment variables. `.env.local`, secrets, build output and user data are excluded from Git. The existing `.openai/hosting.json` identifies the current hosted Site: remove it before creating an unrelated deployment. The setup files mention the current operator and staging project; replace these with your own details for a fork. Do not place keys in issues, screenshots, commits or chat.
