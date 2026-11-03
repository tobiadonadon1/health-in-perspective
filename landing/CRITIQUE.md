# Critique (v2)

## Round 1 (independent critic, 2026-11-03)
Scores: first-screen value 7, polish 5, consistency 4, glass craft 6, copy 7, mobile 5, conversion 6.
Top findings and what changed:
1. Feature screenshots unreadable, light rasters in dark cards → rebuilt 01 to 03 as live glass boards with 28 to 54px numbers.
2. Example data labelled inconsistently → "Example" on every sample, board and the chat.
3. Blood work missing from the hero facts → four facts: wearables, nutrition, blood work, AI.
4. Left edges misaligned → one `--content` edge for nav, hero, features, price, FAQ, footer.
5. Empty middle in the pinned section → replaced by stacked sticky cards; content centred.
6. Phone hero: second action became a text link, portrait shortened, compact example row.
7. Chip meta aligned with its bubble; tablet row gap 48px.
8. Commas in headings and three "finally" → "Everything you measure in one place", "Wearable data you can read at a glance"; footer columns labelled, legal line inside the card, wordmark on the content edge.
Also: nav opacity raised over stone, price rows merged into one card, FAQ icons outlined, CTA under "Questions", Recovery card moved off the face.

## Scan (v3-r4): no FAILs. Warnings answered
- Frosted glass on 7 to 10 surfaces: glass is the brief (owner's references); it is used only on data (samples, chips, boards), never on plain text blocks.
- Nested boxes: the example boards are product UI, which nests by nature.
- "Icon + heading + paragraph card grid" (the three blood markers): it is a data table of results, not feature cards.
- Shadows: only the floating glass and the stacked night cards cast them.

## Not verified
Real Windows ClearType, real iOS Safari scroll timelines (Safari shows the static state), screen readers on a device, real-network performance.
