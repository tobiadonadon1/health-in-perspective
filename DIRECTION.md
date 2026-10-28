# Xeyo visual direction

## Reference
The user chose a framed health dashboard (Metrics.IQ style, `public/reference.png` is the earlier reference; the
current one is described here) and asked us to copy its UI with pride, using Xeyo's own components, data and
features. Clean and simple: no clutter, no fine print, nothing hidden.

What defines it:
- **The frame is the whole page** (off-white, edge to edge — no outer grey margin). The top bar sits at its head:
  brand, a labelled pill navigation, an "Ask Xeyo" field, refresh and account circles. No sidebar, no footer.
- **Home is one screen with no scrolling** at laptop sizes and up (≥1100×700): six signal tiles the person
  chooses (default: Recovery, HRV, Resting heart rate, Sleep, Strain, Heart rate — what WHOOP members check
  daily), the month over their portrait, Calories (eaten vs burned), Weight (type it or drag the ruler) and Today
  (notable changes + check-in). Value first: every tile is a big number with its last 14 days underneath.
- **White cards are the default.** Dark (`.card.dark`) and forest (`.card.forest`) cards are focal pieces —
  at most one or two per page. Never a different saturated colour per metric.
- **One accent: orange** (the Xeyo sun). It marks the card title (`.marker`), deltas (`.badge`), the primary
  data series and the single active/primary row. Violet, green and blue appear only as additional data series.
- **Light numbers** (`.stat b`, weight 300, tight tracking) with a unit after them (`/kcal`, `hours`).
- **Two chart types**, always under a big number and over the same 14-day window: bars from zero for amounts
  (sleep, strain, calories, recovery; latest bar orange) and a line for vitals (latest point orange), each with
  the person's average as a dashed, labelled line (`miniChart`). The Vitals hero uses `trendChart` (usual-range
  band, above-average fill). Dot share grids (`dotShare`) for macro shares. All in `src/charts.js`.
- **Changes** use one baseline everywhere (`latestChange`): neutral badge for ordinary changes, orange only when
  the reading is unusual for the person. Colour never means good or bad.
- Pill controls everywhere: `.chip`, `.btn` (dark pill), `.btn.light`, `.btn.accent`, `.icon-btn` circles,
  list rows as rounded pills (`.check-row`, `.signal-row`).

## System files (read these before styling anything)
- `src/ui/base.css` — tokens (`--canvas --frame --surface --well --line --ink --ink-2 --ink-3 --dark --on-dark
  --accent --accent-fill --accent-soft --accent-deep --violet --green --blue --forest`, radii, gap), element
  defaults, `.btn`, `.icon-btn`, `.text-button`, `.badge`, `.chip`, `.field`, `.form-grid`, `.error`, `.eyebrow`.
- `src/ui/card.css` — `.card` (+ `.dark`, `.forest`), `.card-head` + `.marker`, `.stat`, `.stat-caption`,
  `.legend`, tones `.t-accent/.t-violet/.t-green/.t-blue`, `.dot-matrix`, `.sparkline`, `.card-empty`, `.panel`.
- `src/ui/shell.css` — frame, top bar, nav, ask field, account menu, `.page-head`, demo banner, chat drawer,
  `#modal` / `.dialog` / `.dialog-footer` / `.tabs`, `#toast`.
- `src/ui/home.css` — Home only. It is the worked example of the system: copy its patterns.

## Rules
- Typography: DM Sans. Page title 30px/400. Card titles 16px/400 with the orange marker. Body 14px. Captions
  and metadata **never below 11px**, secondary text uses `--ink-2`/`--ink-3` (both pass contrast on white).
- Spacing: card padding 22px, grid gap 16px, card radius 20, rows 14, controls pill.
- Every number keeps its source and date somewhere legible. Sample data stays labelled.
- Keep every feature and every `data-action` / `data-nav` / `data-metric` / id hook working. Change markup
  freely, but not behaviour or data.
- No new colours outside the tokens; no gradients except `--accent-fill`, `--forest`, and the dark card.
- Responsive: 3 columns ≥1180px, 2 columns ≥760px, 1 column below; no horizontal scroll at 390px.
- One stylesheet per surface in `src/ui/`, imported from `src/main.js`. No `!important` (except forced-colors),
  no overriding another surface's file. Remove classes and code that nothing uses.

## Verification
Fixture preview: `npx vite --config .design-preview/vite.config.js --port 3005` renders the real app with
synthetic data. `npm test` must stay green.
