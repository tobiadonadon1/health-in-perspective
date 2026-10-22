# Xeyo — Health in Perspective

A real, account-based health workspace: WHOOP measurements, a nutrition journal, private reports and structured blood-test results. Vite + JavaScript, Supabase Auth/Postgres/Storage, and a Deno Edge Function. There is no demo login or sample data path.

## Current status

Account services, private storage, per-user data policies and the API are deployed. Email/password signup opens a session immediately; email confirmation is disabled. A real WHOOP account has authorized and imported readings. Recovery and sleep permissions also supply skin temperature, sleep stages, performance, efficiency, consistency, sleep need and sleep debt. WHOOP currently permits up to 10 connected members in its sandbox. Nutrition accepts descriptions, dish/label photos and voice recordings using each user's own OpenAI API key. Users can choose and order up to 12 dashboard widgets; preferences are saved to their account. Apple Health XML/ZIP and selected Fitbit/Google Health JSON/CSV exports can be imported as snapshots. Automatic Apple Health and Fitbit sync are not implemented.

Hosted app: https://neka-health-platform.tobi10donadon.chatgpt.site/ · Source: https://github.com/tobiadonadon1/health-in-perspective

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
2. Set Auth Site URL and exact email redirect URLs for your frontend, including `/?reset=1`. Set email confirmation off to match this deployment and use a minimum password length of 12. Set frontend `VITE_EMAIL_CONFIRMATION=false` to match.
3. Signup does not require email delivery. To support reliable password-reset delivery to all users, configure custom SMTP with your verified sender, then install the HTML in `supabase/templates/confirmation.html` and `recovery.html` in Auth → Emails. Set appropriate sending limits and abuse controls. Templates are source-controlled; adding them to this repository does not activate them in a hosted project automatically.
4. Deploy `supabase/functions/health-api` with the included `config.toml`. Gateway JWT verification is disabled only because the OAuth callback has no JWT; every POST validates the user's bearer token with Supabase Auth. GET callbacks consume a random, expiring, single-use OAuth state.
5. Set **server secrets**: `APP_ORIGIN`, optional comma-separated `ALLOWED_ORIGINS`, `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, and `TOKEN_ENCRYPTION_KEY` (base64-encoded random 32-byte key). Set `ALLOWED_ORIGINS` explicitly in production so localhost is not included. The Supabase runtime supplies its own service-role secret.
6. Register one operator-owned WHOOP application with callback `https://YOUR_PROJECT.supabase.co/functions/v1/health-api`, a public privacy notice, and `read:recovery` / `read:sleep` scopes. The OAuth flow requests `offline` for refresh. Each end user connects their own ordinary WHOOP account through OAuth; **end users never enter API keys**. New apps begin in WHOOP's sandbox tier and may need provider approval for more members.
7. Each user connects an OpenAI secret API key in Settings → Nutrition assistant. Keys are validated, encrypted with `TOKEN_ENCRYPTION_KEY`, and stored in the server-only `ai_credentials` table. There is no shared operator API key. Optional server settings `OPENAI_MODEL` and `OPENAI_TRANSCRIPTION_MODEL` override the defaults (`gpt-4.1-mini` and `gpt-transcribe`). Users pay their own provider usage. Manual nutrition works without a key.
8. Set frontend `VITE_STORAGE_READY=true` once the private bucket and ownership policies have been verified. Set `VITE_AUTH_AUDIENCE=public` for the current immediate-signup experience. Deploy `dist/` to a static host, and update `APP_ORIGIN`, callback return origins, and Auth redirect URLs accordingly.

## Data model and protections

- `meals`: user-owned entries with date, calories, macros and source.
- `lab_results`: user-owned numeric results, original units, collection date, laboratory, optional reference range and notes. Unit changes are not silently converted.
- `records` and private `health-records` bucket: original PDF/images, maximum 10 MB. Download links expire in 60 seconds.
- `health_readings`: client read-only; sourced from WHOOP or explicitly marked file imports. Import endpoints validate measured units, values, timestamps and ownership. They cannot claim WHOOP provenance. Re-importing the same source/day updates without duplicates.
- Imports run in a browser worker, extracting supported measurements from the last 90 days. Original archives are not uploaded. Limits: 100 MB per input, 200 MB extracted. Apple HRV SDNN stays separate from WHOOP/Fitbit RMSSD. Ambiguous Fitbit weight units must be selected explicitly. Unsupported data is skipped. No end-to-end real Apple/Fitbit export has been tested yet.
- `wearable_secrets`: encrypted access/refresh tokens; no client table access.
- `ai_credentials`: encrypted per-user OpenAI keys; no client table access. Only the authenticated owner can use or remove their key through the API.
- The conversational nutrition assistant saves estimated macros after text, photo or push-to-talk input. Clarifying questions are asked for unidentified food. Saved results include inline Edit and Undo controls. Images are resized and re-encoded; meal photos/audio are processed transiently. Responses use `store:false`. Provider service/abuse retention policies still apply.
- `oauth_states`: one-use state bound to the initiating user and an exact allowlisted return origin.
- WHOOP imports up to 90 days, follows pagination, refreshes tokens and upserts idempotently. Sync is user-triggered; background webhooks/scheduled synchronization are not implemented. Disconnect revokes provider access, then removes stored tokens.

## Verification and limits

35 automated tests plus live staging SQL ownership checks cover cross-user reads/writes, file paths, fabricated wearable writes, lab validation, OAuth origin filtering, pagination, revoked access, correct measurement mapping, AI response validation, request bounds, and denied client access to personal API keys. See `tests/staging-rls.sql`: fixtures are rolled back.

WHOOP authorization/import has been verified live. Nutrition automatic logging, inline editing and Undo were checked with an isolated synthetic fixture; a real OpenAI analysis still requires a user-supplied funded API key. End-to-end multi-account signup and actual file transfer verification remain outstanding. Password reset uses the default Supabase mail service until a custom sender is configured and may be restricted to approved recipients. Provider tier expansion, operational monitoring/backups and account-erasure handling remain commercial-launch work. Complete account deletion is currently an operator request, described in the data-use notice.

No diagnosis, photo-derived body composition, or food-derived glucose/inflammation is provided. The portrait and anatomy are illustrative. Original 3D asset attribution is in `public/models/ATTRIBUTION.txt`.

## Sharing this source

Only public configuration belongs in frontend environment variables. `.env.local`, secrets, build output and user data are excluded from Git. The tracked `.env.production` contains only public UI flags for Xeyo's verified deployment; forks should override these in `.env.production.local` to match their email confirmation and private storage setup. The existing `.openai/hosting.json` identifies the current hosted Site: remove it before creating an unrelated deployment. The setup files mention the current operator and staging project; replace these with your own details for a fork. Do not place keys in issues, screenshots, commits or chat.

## Xeyo interface

The dashboard uses the clear-glass styles in `src/xeyo.css`. The static orange sun is reused for branding and voice input. Nutrition is an inline conversation with the daily balance and food journal beside it; at desktop widths above 1100px and viewport heights of 660px or more the page fills one viewport, with the conversation and journal scrolling independently as they grow. Smaller screens reflow vertically. All meal estimates remain editable and removable.

The compact dashboard charts show up to the latest 21 actual measurements; the detail panel retains its 7/30/90-day history. HRV and sleep use bars, while other signals use lines with an area fill. No synthetic points are inserted.

The live application is available at https://xeyo.ai/ and https://www.xeyo.ai/, with active HTTPS certificates. GoDaddy manages DNS through `ns71.domaincontrol.com` and `ns72.domaincontrol.com`. Supabase's Site URL is `https://xeyo.ai`; exact sign-in and password-recovery redirects allow both hostnames, the existing hosted URL, and local development. The health API permits these same origins. The WHOOP callback remains on the Supabase Edge Function, so the provider's callback URL does not change when the frontend domain changes.


## Personal onboarding, averages and Chatbot

New and existing accounts without a profile complete three steps: representation (private photo by default, illustrative digital human, or statistics only), gender/age, and optional peer participation. Changes persist in `profiles` and remain editable in Settings. The app currently accepts adults aged 18–120. A photo is a display preference, never an inferred body scan. Profile images use private `health-records` storage and renewable signed URLs.

Apply `supabase/migrations/20261022230000_profiles_peers_chat.sql` to existing installations; fresh installations use the complete `database/schema.sql`. Deploy `health-api` with `chat.mjs` alongside its other modules. The public deployment has both changes applied. No new application-wide AI secret is needed: keys are provided by each user, encrypted with the existing `TOKEN_ENCRYPTION_KEY`, and never returned to the browser.

Widgets show a 30-day average. Detail views support 7, 30 and 90 days with an average reference line, recorded-day count and daily range. Averages weight each recorded UTC day equally. Missing days are excluded; providers and units stay separate.

The private Leaderboard uses actual opt-in Xeyo cohorts, not clinical norms or a representative general population. Age bands are 18–29, decade bands through 79, and 80+. Each person needs 7 days in the last 30, with the same source, metric and unit. At least 20 *other* eligible participants are required; smaller counts and all their comparison values are suppressed. The percentile is `(peers below + 0.5 × tied peers) / peers × 100`. A higher value is not a better-health score. Gender is collected for the profile but is not used to rank people. Ages must be reconfirmed yearly. There is no public list of people.

The `peer_percentiles()` security-definer RPC intentionally has no caller-controlled cohort arguments and derives the viewer from `auth.uid()`. Its search path is pinned, ownership and opt-in are checked, anonymous execution is revoked, and only aggregated comparison output is returned. The Supabase security-definer advisory is expected for this bounded aggregate function. Credential tables intentionally have RLS with no client policies or grants. The pre-existing leaked-password protection advisory is outside this feature change: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

Chatbot supports the official OpenAI Responses, Anthropic Messages and Google Gemini GenerateContent APIs, with a user-editable model ID verified against the chosen provider. Providers use fixed URLs; custom proxies are not accepted. API billing belongs to the key owner. Nutrition remains a separate OpenAI connection. Chats are private, persisted, exportable and clearable. Recent history is sent only to its matching provider/model. A separate unchecked control lets users attach 30-day reading averages; profile details, photos and lab reports are excluded. AI cannot edit health records or log meals through this chat.

Provider references: [OpenAI Responses](https://platform.openai.com/docs/api-reference/responses), [Anthropic Messages](https://platform.claude.com/docs/en/api/messages), [Gemini GenerateContent](https://ai.google.dev/api/generate-content).

Validation: `npm test` includes PostgreSQL tests for profile isolation, photo ownership, chat credential isolation, small-cohort suppression, opt-out and percentile arithmetic, plus provider request/response contract tests. `tests/staging-personal.sql` verifies the deployed database in a rollback-only transaction. `tests/live-personal-api.mjs` is a deliberate live smoke test: it creates a disposable API test account, prints only its cleanup ID, and must be followed by deleting that exact QA account through an authorized admin connection. Do not run it as a recurring test. No funded provider key was used for end-to-end AI inference; adapters were verified with deterministic provider responses and real missing-key/authentication behavior.
