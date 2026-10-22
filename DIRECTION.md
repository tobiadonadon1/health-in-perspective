# Xeyo visual direction

## Brief and current design
The user selected the supplied portrait-led health dashboard as the direction, then requested an evolution: clear glossy glass, green/peach refraction, no heavy white outlines, a static orange sun, the name Xeyo, and nutrition without desktop page scrolling. The reference direction is already chosen; unrelated three-concept explorations and removal of cards/orbs would contradict that brief.

Keep: real accounts and WHOOP measurements, all navigation, customizable metrics, human portrait and digestive anatomy, private labs/files, personal AI keys, imports, truthful provenance. Lose: thick uniform white borders, matte beige/green haze, modal-first meal entry, anonymous branding. No domain changes inferred from browser context: user confirmed xeyo.ai explicitly.

## Material and typography
Xeyo is a daylight health workspace. White/cool green canvas (#f8faf8), green-black ink (#26312e), warm sun as the brand and voice affordance. Green/peach card tints echo the reference; metric type supplies identity rather than an invented health judgement. DM Sans is retained for its rounded, open numerals and continuity with the accepted reference. Tabular numerals align changing values.

Panels use three distinct cues: translucent body, asymmetric reflected light, and a faint darker lower lip. Edges are light directional masks, not white strokes. The material stays CSS-only and legible without backdrop-filter. Main panel radius 18px; nested controls smaller; voice controls circular. Motion is limited to interaction feedback; the user explicitly required a static sun.

## Content and layout
Home: personal greeting, illustrative human, source-backed metric board, nutrition and digestive panels. Cards plot up to 21 recorded measurements with source/date; detail exposes longer real history.
Nutrition: What’s on your plate? / Tell me in your own words. I’ll take care of the numbers. Single composer: I ate…, attach, hold to talk, send. Right: Your daily balance and Your food journal. No sample account in production. Key setup remains explicit when missing.
Empty, busy, error, result, edit and undo retain the existing real provider contract. Original media are transient. User/auth changes clear transient conversation state.

## Verification and constraints
35 existing tests; local isolated fixture verifies inline entry/edit/undo and sidebar navigation. Desktop nutrition was measured at 1280×720 with scrollHeight exactly 720. 390px mobile has no horizontal overflow and composer controls above y632. Browser viewport override was inconsistent for additional sizes; no full cross-engine or OS matrix is claimed. Private test fixture is ignored and excluded from production dist.
