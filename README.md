# Xeyo — Health in Perspective

A real, account-based health workspace: WHOOP measurements, a nutrition journal, manual body measurements, private blood records and structured blood-test results. Vite + JavaScript, Supabase Auth/Postgres/Storage, and a Deno Edge Function. There is no demo login or sample data path.

## Current status

Account services, private storage, per-user data policies and the API are deployed. Email/password signup opens a session immediately; email confirmation is disabled. A real WHOOP account has authorized and imported readings. Recovery and sleep permissions also supply skin temperature, sleep stages, performance, efficiency, consistency, sleep need and sleep debt. WHOOP currently permits up to 10 connected members in its sandbox. Nutrition accepts descriptions, dish/label photos and voice recordings using each user's own OpenAI API key. Users can choose, resize and order up to 16 dashboard widgets; preferences are saved to their account. Apple Health XML/ZIP and selected Fitbit/Google Health JSON/CSV exports can be imported as snapshots. Automatic Apple Health and Fitbit sync are not implemented.

Hosted app: https://xeyo.ai/ · Source: https://github.com/tobiadonadon1/health-in-perspective

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
6. Register one operator-owned WHOOP application with callback `https://YOUR_PROJECT.supabase.co/functions/v1/health-api`, a public privacy notice, and `read:recovery` / `read:sleep` scopes. The OAuth flow requests `offline` for refresh. The callback never links an account by itself: it returns the code to the app, which finishes with the authenticated `whoop-complete` action. That action only succeeds for the signed-in user who started the flow, so a forwarded authorization link cannot attach someone else's WHOOP data to another account. Each end user connects their own ordinary WHOOP account through OAuth; **end users never enter API keys**. New apps begin in WHOOP's sandbox tier and may need provider approval for more members.
7. Each user connects an OpenAI secret API key in Profile → OpenAI · Nutrition & portraits. Keys are validated, encrypted with `TOKEN_ENCRYPTION_KEY`, and stored in the server-only `ai_credentials` table. There is no shared operator API key. Optional server settings `OPENAI_MODEL` and `OPENAI_TRANSCRIPTION_MODEL` override the defaults (`gpt-4.1-mini` and `gpt-transcribe`). Users pay their own provider usage. Manual nutrition works without a key.
8. Set frontend `VITE_STORAGE_READY=true` once the private bucket and ownership policies have been verified. Set `VITE_AUTH_AUDIENCE=public` for the current immediate-signup experience. Deploy `dist/` to a static host, and update `APP_ORIGIN`, callback return origins, and Auth redirect URLs accordingly.

## Data model and protections

- `meals`: user-owned entries with date, calories, macros and source.
- `lab_results`: user-owned numeric results, original units, collection date, laboratory, optional reference range and notes. Unit changes are not silently converted.
- `records` and private `health-records` bucket: original PDF/images, maximum 10 MB. Download links expire in 60 seconds.
- `health_readings`: direct table writes remain forbidden to clients; sourced from WHOOP, explicitly marked file imports, or manual body entries through narrow RPCs. Import endpoints validate measured units, values, timestamps and ownership. They cannot claim WHOOP provenance. Re-importing the same source/day updates without duplicates.
- Imports run in a browser worker, extracting supported measurements from the last 90 days. Original archives are not uploaded. Apple Health archives of any size are streamed: the ZIP central directory is read, then `export.xml` is inflated and scanned chunk by chunk (verified with a 2.7 GB export.xml / 101 MB export.zip: ~30 s, bounded memory). Apple Watch sleep stages, steps, activity-ring energy and sleeping wrist temperature are included. Fitbit archives are limited to 200 MB per file and 1.5 GB extracted. Apple HRV SDNN stays separate from WHOOP/Fitbit RMSSD. Ambiguous Fitbit weight units must be selected explicitly. Unsupported data is skipped. No end-to-end real Apple/Fitbit export has been tested yet.
- `wearable_secrets`: encrypted access/refresh tokens; no client table access.
- `ai_credentials`: encrypted per-user OpenAI keys; no client table access. Only the authenticated owner can use or remove their key through the API.
- The conversational nutrition assistant saves estimated macros after text, photo or push-to-talk input. Clarifying questions are asked for unidentified food. Saved results include inline Edit and Undo controls. Images are resized and re-encoded; meal photos/audio are processed transiently. Responses use `store:false`. Provider service/abuse retention policies still apply.
- `oauth_states`: one-use state bound to the initiating user and an exact allowlisted return origin.
- WHOOP imports up to 90 days, follows pagination, refreshes tokens and upserts idempotently. Sync runs on sign-in, page reload and manual Refresh; background webhooks/scheduled synchronization are not implemented. Disconnect revokes provider access, then removes stored tokens.

## Verification and limits

63 automated tests plus live staging SQL ownership checks cover cross-user reads/writes, file paths, fabricated wearable writes, lab validation, OAuth origin filtering, pagination, revoked access, correct measurement mapping, AI response validation, request bounds, and denied client access to personal API keys. See `tests/staging-rls.sql`: fixtures are rolled back.

WHOOP authorization/import has been verified live. Nutrition automatic logging, inline editing and Undo were checked with an isolated synthetic fixture; a real OpenAI analysis still requires a user-supplied funded API key. End-to-end multi-account signup and actual file transfer verification remain outstanding. Password reset uses the default Supabase mail service until a custom sender is configured and may be restricted to approved recipients. Provider tier expansion, operational monitoring/backups and account-erasure handling remain commercial-launch work. Complete account deletion is currently an operator request, described in the data-use notice.

No diagnosis, photo-derived body composition, or food-derived glucose/inflammation is provided. The portrait and anatomy are illustrative. Original 3D asset attribution is in `public/models/ATTRIBUTION.txt`.

## Sharing this source

Only public configuration belongs in frontend environment variables. `.env.local`, secrets, build output and user data are excluded from Git. The tracked `.env.production` contains only public UI flags for Xeyo's verified deployment; forks should override these in `.env.production.local` to match their email confirmation and private storage setup. The existing `.openai/hosting.json` identifies the current hosted Site: remove it before creating an unrelated deployment. The setup files mention the current operator and staging project; replace these with your own details for a fork. Do not place keys in issues, screenshots, commits or chat.

## Xeyo interface

The dashboard uses the clear-glass styles in `src/xeyo.css`. The static orange sun is reused for branding and voice input. Nutrition is an inline conversation with the daily balance and food journal beside it; at desktop widths above 1100px and viewport heights of 660px or more the page fills one viewport, with the conversation and journal scrolling independently as they grow. Smaller screens reflow vertically. All meal estimates remain editable and removable.

The compact dashboard charts show up to the latest 21 actual measurements; the detail panel retains its 7/30/90-day history. HRV and sleep use bars, while other signals use lines with an area fill. No synthetic points are inserted.

The live application is available at https://xeyo.ai/ and https://www.xeyo.ai/, with active HTTPS certificates. GoDaddy manages DNS through `ns71.domaincontrol.com` and `ns72.domaincontrol.com`. Supabase's Site URL is `https://xeyo.ai`; exact sign-in and password-recovery redirects allow both hostnames, the existing hosted URL, and local development. The health API permits these same origins. The WHOOP callback remains on the Supabase Edge Function, so the provider's callback URL does not change when the frontend domain changes.


## Personal onboarding, averages and Chatbot

New and existing accounts without a profile complete three steps: representation (private photo by default, digital Vitruvian figure, or statistics only), gender/age, and optional peer participation. Changes persist in `profiles` and remain editable in Profile. The app currently accepts adults aged 18–120. A photo is a display preference, never an inferred body scan. Profile images use private `health-records` storage and renewable signed URLs.

Apply `supabase/migrations/20261022230000_profiles_peers_chat.sql` to existing installations; fresh installations use the complete `database/schema.sql`. Deploy `health-api` with `chat.mjs` alongside its other modules. The public deployment has both changes applied. No new application-wide AI secret is needed: keys are provided by each user, encrypted with the existing `TOKEN_ENCRYPTION_KEY`, and never returned to the browser.

Widgets show a 30-day average. Detail views support 7, 30 and 90 days with an average reference line, recorded-day count and daily range. Averages weight each recorded UTC day equally. Missing days are excluded; providers and units stay separate.

The private comparison in Profile uses actual opt-in Xeyo cohorts, not clinical norms or a representative general population. Age bands are 18–29, decade bands through 79, and 80+. Each person needs 7 days in the last 30, with the same source, metric and unit. At least 20 *other* eligible participants are required; smaller counts and all their comparison values are suppressed. The percentile is `(peers below + 0.5 × tied peers) / peers × 100`. A higher value is not a better-health score. Gender is collected for the profile but is not used to rank people. Ages must be reconfirmed yearly. There is no public list of people.

The `peer_percentiles()` security-definer RPC intentionally has no caller-controlled cohort arguments and derives the viewer from `auth.uid()`. Its search path is pinned, ownership and opt-in are checked, anonymous execution is revoked, and only aggregated comparison output is returned. The Supabase security-definer advisory is expected for this bounded aggregate function. Credential tables intentionally have RLS with no client policies or grants. The pre-existing leaked-password protection advisory is outside this feature change: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

Chatbot supports the official OpenAI Responses, Anthropic Messages and Google Gemini GenerateContent APIs, plus OpenRouter, Mistral, Groq, xAI and DeepSeek through their fixed OpenAI-compatible Chat Completions endpoints, with a user-editable model ID verified against the chosen provider. Providers use fixed URLs; custom proxies are not accepted. API billing belongs to the key owner. The same connection also analyzes meals (text and photos) when no dedicated OpenAI nutrition key is stored; voice transcription and portraits still require an OpenAI key. "Find my models" lists the models the pasted key can use. Chats are private, persisted, exportable and clearable. Recent history is sent only to its matching provider/model. A separate unchecked control lets users attach 30-day reading averages; profile details, photos and lab reports are excluded. AI cannot edit health records or log meals through this chat.

Provider references: [OpenAI Responses](https://platform.openai.com/docs/api-reference/responses), [Anthropic Messages](https://platform.claude.com/docs/en/api/messages), [Gemini GenerateContent](https://ai.google.dev/api/generate-content).

Validation: `npm test` includes PostgreSQL tests for profile isolation, photo ownership, chat credential isolation, small-cohort suppression, opt-out and percentile arithmetic, plus provider request/response contract tests. `tests/staging-personal.sql` verifies the deployed database in a rollback-only transaction. `tests/live-personal-api.mjs` is a deliberate live smoke test: it creates a disposable API test account, prints only its cleanup ID, and must be followed by deleting that exact QA account through an authorized admin connection. Do not run it as a recurring test. No funded provider key was used for end-to-end AI inference; adapters were verified with deterministic provider responses and real missing-key/authentication behavior.

### Widget board, refresh and personal portraits

The **Digital human** representation replaces the generic WebGL bust on Home and Body. Purpose-generated, transparent male and female digital Vitruvian renders use the Xeyo palette, without the old circle and square. Selecting Woman during onboarding or profile editing previews and displays the female figure. The artwork remains a 2D asset rather than an interactive 3D model. The persisted `digital` preference key is retained for compatibility: existing profiles automatically see the new artwork without a migration. Photo portraits and statistics-only layouts are unchanged.


- **Edit dashboard** opens an inline widget board. Add from a searchable gallery, remove, drag by the handle (mouse or touch), move with keyboard arrows, and choose small/medium/large. Done saves a versioned `dashboard_layout` to the signed-in user's metadata; Cancel discards the draft. Legacy metric choices migrate on first edit. Nutrition and journal cards are widgets too.
- **Refresh** fetches WHOOP and then reloads private records. The same flow runs after sign-in and full page reload. The frontend coalesces concurrent requests, and a server-side database lease prevents two tabs from refreshing a WHOOP token at once. Successful syncs are reused for 30 seconds. Import-only sources are clearly distinguished from live sources. Provider failures retain the saved readings and expose a retry state.
- **Portrait studio** uses an uploaded private reference photo as the identity input and `public/images/human-portrait.png` as art direction. It calls OpenAI image edits with `gpt-image-2`, high quality, transparent WebP output. A connected personal OpenAI key (nutrition or OpenAI Chatbot connection) with image permissions and API billing is required. Generate explicitly sends the two images to OpenAI; it may create an API charge. Users review the result and select Use this portrait. Original photos are never rendered as dashboard portraits.
- Portrait jobs run through `EdgeRuntime.waitUntil`, with a 115-second provider timeout, a three-minute interrupted-job expiry, a one-active-job-per-user constraint, and five generations/hour. This is bounded background processing, not a durable queue: an interrupted job shows a retry state. The prior accepted portrait remains visible when a subsequent attempt fails. Renders live in a private server-write-only storage bucket, with owner-only reads and expiring URLs. Deleting a reference through the app also deletes its generated images. This produces a 2D illustration of the person, not a 3D mesh or body-composition inference.
- Deploy `20261023140255_portrait_renders_and_sync_leases.sql`, then all `health-api` modules, then the frontend. Fresh installations can use `database/schema.sql`.

Provider references: [OpenAI image edits](https://developers.openai.com/api/reference/resources/images/methods/edit), [Supabase background tasks](https://supabase.com/docs/guides/functions/background-tasks), [Edge runtime limits](https://supabase.com/docs/guides/functions/limits).


### Journal and interactive trends
- Metric details support pointer/touch scrubbing and keyboard arrows / Home / End. The headline shows the selected reading’s UTC date and formatted value; periods filter actual observations from the same source and unit. The dashed guide is the mean of daily means, excluding missing days. Every metric has a short explanation and an official source link.
- The Health journal widget replaces the old digestive card while preserving existing dashboard layouts (`digestive` remains its stored widget ID). Notes support private creation, editing, deletion and export. AI reflections use the user’s Chatbot provider, falling back to their OpenAI nutrition connection. Wearable context is opt-in for each reflection. No AI key is required to save notes.
- `journal_entries` has ownership RLS. Clients cannot write generated reflections. The server checks ownership before looking up credentials. A unique active reflection prevents duplicate concurrent provider calls, and stale jobs can retry after three minutes. Editing a note removes its prior reflection; a database trigger rejects a late response for changed/deleted content.
- The original human remains as a labelled style preview until a personal portrait is approved. Personal generation still requires a user-selected photo and their OpenAI key. Portrait style v2 uses natural bare shoulders and a non-sexual crop above the breast line, with no invented clothing or body-fat measurements.

Release verification: `npm test` covers chart selection, source separation, journal context, all three provider adapters, cross-user journal access and stale reflection rejection. `node tests/live-personal-api.mjs` creates a disposable account for live persistence checks; delete the printed cleanup user ID using the admin connector after running. Real paid AI responses require a funded user API connection and are not substituted with sample output.

### Focused workspace and manual body measurements
- Sidebar: Home, Vitals, Body, Nutrition, Journal, Sleep, Blood records. The account dropdown opens Profile, Integrations and Privacy. Age-group comparisons and private reference photos appear only in Profile. Blood records lists lab documents only.
- Ask Xeyo is a floating Home widget with the existing private conversation, provider selection and optional reading context. Nutrition keeps its own conversational logger.
- Body cards accept weight (kg), body fat (%) and lean body mass (kg), with measurement date, editing, deletion and trend access. Apply `20261023165718_manual_body_measurements.sql` before deploying this frontend. The RPC derives the owner from `auth.uid()`, permits only those three kinds, fixes units/provenance, and refuses updates/deletion of provider readings or another account’s entries.
- Wearable values and averages display as whole numbers; sleep hours, skin temperature and body measurements retain one decimal. Stored precision is unchanged. Default desktop dashboards with at most three widget rows fit the viewport at 1280×720 and 1440×900; larger custom boards and narrow screens retain natural scrolling.
- `node tests/live-measurements-api.mjs` deliberately creates two disposable accounts and checks real persistence, edits, deletion and account isolation. Delete exactly the printed QA IDs with the admin connector afterward. This check passed on the deployed database; no personal measurements were modified.

### Any AI, Apple Watch-size imports and 3D avatars (2026-10-25)
- Apply `supabase/migrations/20261025120000_any_ai_provider.sql` before deploying the new `health-api`; it widens the provider check on `chat_connections` and `journal_reflections`. Then deploy all `health-api` modules, then the frontend. Without the migration, connecting a new provider fails with a save error; existing connections keep working.
- Import batches are up to 2,000 rows (the client falls back to 500 against an older function). Rows are capped at 25,000 per import, newest first.
- Portrait studio offers a **3D avatar** style (default, `xeyo-avatar-3d-v1`) and the existing photoreal style. Both use the person's photo as identity and the existing framing/safety rules. Photos are re-encoded on the device before upload (max 2048 px JPEG, EXIF/GPS removed, HEIC accepted where the browser can decode it).
- Dashboard cards use one accent and icon per metric (`src/metric-style.js`, `src/cards.css`), a neutral change-vs-30-day chip, and ring gauges for 0–100 scores. Colours identify the signal, never a judgement.

### User-test fixes and features (2026-10-26)
- Apply `supabase/migrations/20261026120000_journal_mood_and_signed_labs.sql` before deploying this frontend. It adds an optional `mood` to `journal_entries` (changing only the mood keeps an AI reflection) and lets lab results and reference limits be negative within the same ±1e9 bound.
- Every section has an address (`/#/vitals`, `/#/labs`…). Plain paths such as `/vitals` or `/login` are redirected by `public/404.html` on hosts that serve it for unknown paths, and by the app itself on hosts that serve `index.html` for every path. Anything else shows a branded not-found page.
- Without an AI key, chat explains what is missing and Send opens the connection; meals can always be added manually. Chat, meal analysis, journal reflections and the optional OpenAI key for portraits/voice share one **AI** setting.
- Sample data (`src/demo.js`) is offered only while an account has no readings, is generated in the browser, labelled everywhere and never saved.
- Readings older than three days show as "last recorded" and move to the end of their page; values outside about two standard deviations of the person's own 30-day range are marked unusual (`src/insights.js`). Home lists up to three such changes and a weekly summary.
- Sleep page goals (sleep hours, recovery %) are stored in the account's `user_metadata.preferences`; sleep debt adds up shortfalls over the last 7 nights.
- Forms show inline messages instead of browser bubbles (`src/form-errors.js`). Data export is available as JSON or a ZIP of CSV files.

### Card redesign (2026-10-26)
- Metric cards are `vcard`s (`src/vcards.js`, `src/vcards.css`): one saturated colour field per signal, film grain, a large light number, a status pill against the person's own 30-day average, and a data-driven 1px line drawing (stacked rings for recovery/HRV, waves for blood oxygen, a range arc for respiratory rate and skin temperature, stage bars for sleep). One accent marks today: lime with a portrait, orange in the statistics view.
- Home is a bento board packed by `packBento` (`src/board.js`): the hero (recovery, else HRV) spans two rows; wide cards fill rows the small ones cannot. Portrait users get a foggy figure whose callouts point to their cards, plus "Today's data"; statistics users get a 14-day trend card and a figure card instead.
- Card text was checked against WCAG AA on the rendered gradients (all palettes ≥4.4:1 for small text).
