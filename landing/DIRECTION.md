# Xeyo landing page: direction

## Brief (owner-given, 2026-11-02; no questions asked by request)
- **What:** a 5-section conversion landing page for Xeyo, a web health dashboard sold at **$5** (assumed per month; one constant to change).
- **Visitor:** someone who already wears a WHOOP or an Apple Watch and gets lots of numbers but no clear daily answer.
- **One job:** in ten seconds, understand "Xeyo tells me each morning whether to push, hold steady or rest, from my own data, for $5", then buy.
- **Feel:** warm, precise, premium (Superpower-level). References: owner's image 1 (portrait on an orange-red field behind a framed glass screen, thin big numerals, a glass timeline band), image 2 (tall frosted panels over warm light, thin line diagrams, film grain), image 3 (frosted pane over glowing amber spheres on black).
- **Assets:** the app's own portrait (`human-portrait.png`, transparent cutout), the orange orb logo, real screens captured from the app's fixture. No paid image generation used.
- **Checkout URL:** not yet supplied. Every buy link uses `href="#checkout"` and `data-buy`; swap in one place (see Hand-off).

## Refused category default
The top health pages (Superpower, Function, WHOOP, Oura, Bevel) share: a dark or bone-white ground, a big centred claim over a lifestyle photo or a phone mockup, a logo/press strip, a stats strip of round numbers, three feature cards with icons, testimonials, FAQ accordions. Category colour cliché: clinical white-and-teal or black-and-neon. Slop faces this brief falls into: the Launch Page (dark + glow + glass nav), the Paper Edition (bone + serif). Refused: no stats strip, no logo strip, no testimonials (there are no real ones yet), no icon feature cards, no accordions, no gradient text, no glowing orbs.

## Concept
**Xeyo is a pane of glass held over your body**: you see yourself through it, and it shows the read. Source family: **media** (a lit studio portrait). Every content surface is that pane: frosted, one hairline of light on the edge, over warm light.

Explorations: the owner fixed the look with image 1 ("literally the look we're going for"), so the three-direction exploration was replaced by variations inside that direction, recorded here instead of `explore/`.

## Tokens
- **Ground:** `--field` orange-red radial field (`#ff7a2e` → `#f0471d` → `#b3200f`) for the hero and the price bookend; `--ember` `#120a08` warm black with orange light pools and film grain for sections 2 to 4.
- **Glass:** fill `rgb(255 255 255 / .14)` (on field) / `.06` (on ember); `backdrop-filter: blur(24px) saturate(150%)`; 1px border `rgb(255 255 255 / .32)`; top inner highlight; one shadow level.
- **Ink:** `#fff` on field and ember; secondary `rgb(255 255 255 / .78)` (measured ≥ 4.5:1 on the darkest field stop and on ember).
- **Accent:** `#ff6a1a` (Xeyo orange, from the app), one job: today/now markers and the buy button on ember. On the field the buy button is white with ink text.
- **Type:** Hanken Grotesk (variable 100–900), because its light weights give the thin, instrument-like numerals of the reference and of the app's big readings, and it stays crisp at body sizes. Scale: 13 / 15 / 17 / 20 / 28 / 40 / clamp(44–88) / clamp(96–200) numerals. Display at 250–300, tracking −0.035em; body 400; labels 500.
- **Radius family:** frame 36, panels 28, inner tiles 18, pills 999.
- **Grid:** 12 columns, max 1320px content, 24px frame inset.

## Grammar (5 sections, each answers the visitor's next question)
1. **Hero: "What is this and what does it cost?"** Portrait on the field inside a framed glass screen; the H1, the price, the buy button; a glass recovery widget by the head; a glass week band over the shoulders.
2. **Problem: "Why would I need it? My tracker already gives me numbers."** Three frosted panels on ember: no baseline, scattered data, numbers vs feeling.
3. **How: "How does it work?"** Three steps beside the real dashboard in a glass frame, with the "how you feel wins" card floating over it.
4. **Inside: "What else do I get?"** One glass showcase with pill tabs (Food, Body, Mood, Blood, Ask), each the real screen plus two lines.
5. **Price + answers: "Is it worth $5 and is it safe?"** Field again: $5, what's included, the buy button, and the questions people ask (visible, not accordions).

## Signature
**The morning read settles.** On load: the recovery bars rise from the baseline one by one (60 ms stagger, 700 ms ease-out), the week band's marker slides from Tuesday to today (900 ms, cubic-bezier(.2,.8,.2,1)) and "Steady day" fades in when it lands. The field's light breathes on a 14 s loop. Reduced motion: the settled frame, no drift, no breathing. No JS: the settled frame.

## Voice
Talks like a good coach who read your numbers before you woke up: short, specific, no hype.

## Content
See index.html (written before layout, in this order). Key lines:
- H1: "All your health data, clear in one place."
- Sub: "Xeyo makes use of your wearable data to provide clarity and direction. Activity, sleep, nutrition and blood work together, with an AI that knows your numbers." (owner's wording, 2026-11-03)
- Buy: "Get Xeyo for $5 a month".

## Owner revisions (2026-11-03)
- No dark bezel: the hero is full-bleed with rounded bottom corners; the price section mirrors it with rounded top corners.
- No pointer drift: the hero holds still.
- Positioning: one clear place for every health metric (activity, sleep, nutrition, blood work), AI included; the daily call is one feature, not the headline.
- Sections 2 to 4 are monochrome: neutral black (#0b0b0c), white light pools, white step numerals. Orange belongs to the hero and price fields only.
- Problem cards replaced by one frosted slab with three readouts (58 ms with 30 unused days, a where-it-lives table, a struck-through 82%), rows aligned with subgrid.

## Version 2 (owner revisions, 2026-11-03)
- **Positioning:** all your health data in one place, easy to read: wearables, nutrition, blood work, AI included. Nutrition is the gap the wearable apps leave.
- **Look:** Superpower's structure, simplified. Copenhagen stone ground (`--stone #ebe7e1`) with warm-black night cards lit orange from behind (hero, features, footer). Hanken Grotesk at 400 for headings.
- **Sections:** 1 hero (portrait, three example readings, a four-fact strip), 2 how it works (four square tiles with glass chips), 3 features (four night cards that stack on scroll, each a live example board), 4 price (one card, six rows), 5 FAQ (folded), then the footer card with the wordmark.
- **Example data** is labelled "Example" everywhere it appears.
- **Motion:** hero settles on load; sections rise in on scroll (CSS scroll timelines, no JS); the hero recedes as it leaves; feature cards stick and the covered card sinks back as the next arrives; the footer wordmark lifts in. Everything is visible without JS and still for reduced motion.
- **One content edge** (`--content:1144px`) shared by the nav, the cards and the footer.
- Portrait cutout defringed (pale halo removed from the hair).
- v1 files are in `work/v1/`. The page is built from `work/index.template.html` by `work/build.py`, which writes the FAQ into both the page and the FAQPage JSON-LD.

## Version 3: the subject and liquid glass (2026-11-03)
- **Hero:** the man stays as the subject being read, not a cutout with stickers. His light (`.halo`) and a slowly turning instrument ring (`.reticle`) move with him at every width. One liquid-glass pane (`.lens`) sits across his chest with this morning's three readings (recovery, eaten, vitamin D), marked "Example", with a scan line passing through every 7 s.
- **Liquid glass** (`.lg`, `.lg-light`): a conic specular rim brightest top-left and bottom-right, a sheen, inner edge light, high saturation and light blur. In Chromium an SVG displacement pass (`#lg-lens`, enabled by the `refract` class in main.js) bends what is behind it; Safari and Firefox keep the frost. Used on the nav, hero pane, how-it-works chips, feature boards, price card and FAQ list.
- **Warm light** (`.lit` / `.light`) drifts behind the glass on the stone sections, so the milk glass has colour to refract.
