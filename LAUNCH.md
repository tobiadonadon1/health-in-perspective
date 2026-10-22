# Launch status — 22 October 2026

A working experimental health workspace. This is not a claim of general commercial readiness. See README.md for installation and behavior.

## Implemented
- Email/password signup without email verification, password confirmation, resend cooldown for legacy flows and duplicate-submit prevention.
- Private report/photo bucket with ownership policies and expiring downloads; structured blood results and same-unit history.
- Persisted dated nutrition journal and JSON export; no sample account or demo-data path.
- Nutrition from text, dish/label photo or recorded speech, through one conversational composer. Estimates log automatically, with inline edits and Undo.
- Each user connects their own OpenAI API key. Keys are encrypted in a server-only table and can be replaced/removed. No shared operator key is required. Manual entry works independently.
- WHOOP OAuth, encrypted tokens, refresh, exact return-origin validation, one-use state, 90-day paginated imports, manual sync and provider revocation.
- Muted static orange energy symbol, full-height background, stronger glass highlights and a chest-level heart marker. Account-persisted widget selection/order and an expanded sleep dashboard.
- Public website, GitHub source and data-use notice.

## Verified
- 35 automated tests covering auth flow, nutrition and laboratory validation, AI schema/refusal/error handling, WHOOP pagination/mapping, origin allowlist and PostgreSQL isolation.
- Live staging transaction denies cross-account meal, result and file access, fabricated wearable writes, and client access to tokens/API keys. Fixtures rolled back.
- Real WHOOP member authorized and 722 readings across 9 metric types imported.
- Email confirmation disabled and persisted in the hosted Auth settings.
- Production build and Deno Edge Function type check.
- Conversational nutrition auto-log/edit/undo interactions tested in an isolated synthetic browser fixture; no fixture data is inserted into a user's account.

## Remaining limits
- Real AI requests require a user's funded OpenAI API key. No live photo/text/voice provider request has been verified with a real key in this release.
- WHOOP's sandbox allows 10 connected members pending provider tier approval; synchronization is manual.
- Password-reset delivery to arbitrary recipients requires a configured sender. Signup itself does not depend on email. Styled email templates are prepared in source but are not activated on the default mail service.
- End-to-end multi-account signup and actual private-file transfers still need live verification.
- Apple Health and Fitbit file-import adapters are implemented and tested on synthetic fixtures; real exported files still need end-to-end verification. Automatic Fitbit OAuth and Apple HealthKit sync are not implemented. The portrait is illustrative; no photo-derived fat measurement, glucose prediction or diagnosis is provided.
- Account erasure is an operator request. Monitoring, backups, retention decisions and broader production hardening remain commercial-launch work.
