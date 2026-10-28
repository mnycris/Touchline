# Touchline design standard

How Touchline should look, read and behave, and how to check a change against it. Read this before any interface
work; run the review at the end of it after.

## What Touchline is

A dark, premium football app with a broadcast's confidence. Keep these; they are the identity:

- **Type:** Barlow Condensed, uppercase, for titles, labels, numbers that matter and the big moments. Inter for
  reading. Tabular figures wherever numbers line up.
- **Colour:** near-black surfaces, the club's own colour as the atmosphere (the fog at the top of screens, the hero
  cards, the progress of its season), green for the action you take, gold for silverware. Competitions wear their own
  identities (fields, marks, motion) on their cards, match days and pages.
- **Football-native visuals:** the pitch, crests, FUT-style player cards, W/D/L pips, rating chips, score lines,
  league-table zone markers. A football fact is shown the way football shows it.
- **Motion with a reason:** screen transitions that show where you came from, the system's own swipe back,
  celebrations for real achievements, nothing that loops in a list.

The standard: **the spectacular moments are spectacular, the everyday screens are effortless and exact, and every small
detail is intentional.**

## Why some screens read as generated

Generated interfaces converge on the most common choice for everything (Anthropic calls it distributional convergence).
None of the patterns below is wrong in itself; what reads as generated is using them by default, everywhere, with no
reason. Before adding any of these, say what it is for.

| Default | What it costs | In Touchline instead |
|---|---|---|
| Every fact, link or action in its own rounded card | Nothing is grouped, everything weighs the same | One card per group; cells divided by hairlines (`Facts`, `Shortcuts`, `.jgrid`) |
| Icon in a rounded tile above a title and a paragraph | The universal template; says nothing about football | The glyph on its own, beside its name; drop the paragraph |
| Big faded icon in a card's background | Decoration repeating the icon already in the header | Nothing |
| Coloured stripe down the side of a rounded card | The most recognisable generated tell | Say the state once: a coloured label, a tinted surface, a coloured icon. Stripes stay only where football uses them: zones on table rows |
| Several encodings of one state (stripe, border, badge, ring, label) | Shouting | One, maybe two |
| Glow, mesh, grid or blob backgrounds | Atmosphere without a source | Club fog and competition art, which come from the club and the competition |
| Rings, sparklines and gauges as the default widget | Looks like data, tells little | The number itself, a bar where a range matters, real values (his last five ratings, not a line through them) |
| Random bright avatar colours | Arbitrary colour has no meaning | Your club's colour for your people, neutral for outsiders |
| Crests and logos on dark rounded plates | A box around something that has its own shape | The crest on the surface itself |
| Helper paragraphs under headings and toggles | Filler; the screen reads like documentation | One short line saying what it does; the how and why behind an (i) (`InfoTip`) |
| Badges and pills on every row | Repeated labels stop meaning anything | Mark the exception, not the default (a training plan other than Balanced, a contract that is due) |
| The same visual weight for everything | No hierarchy | One clear first thing per screen; secondary actions quieter (`.ct-quiet`, ghost buttons, links) |

## Rules

**Layout and hierarchy**
- One primary thing per screen, at the top. Group by proximity before boxing; box only what is a unit.
- A card holds a group. Facts are a grid inside one card, links a list inside one card, never a scatter of boxes.
- Spacing: tight inside a group, generous between groups. Section labels sit with what they label.
- Respect the phone: 390pt wide (check 320 too), 16px side gutter, nothing clipped, names never truncated where a
  second line or a shorter form (a league's `short`, a player's call name) would do.

**Colour**
- Colour carries meaning, the same meaning everywhere: green your action and good, red bad, amber attention, gold
  silverware, the club's colour for the club, a competition's palette for that competition.
- Decorative gradients are allowed where they come from something (club, competition, the kit colours of a match).
  Never a ramp that implies a judgement it doesn't make (red-to-green for "matchday 23 of 38").
- Zero is not news: a count of nobody is quiet.

**Type**
- Barlow Condensed uppercase for titles, labels, kickers and display numbers; Inter for sentences.
- Few sizes, clear steps. Numbers that are compared use tabular figures and right or centre alignment.

**Icons and controls**
- The custom icon set only (24px grid, 1.8 strokes, `src/ui/icons/Icon.tsx`). One icon means one thing.
- Top-bar buttons are round, with a little material and no outline, like the system's.
- Prefer the system's patterns: the native swipe back, sheets, segmented controls, lists with chevrons.

**Writing**
- Short, plain, specific. A verb on buttons. Sentence case in sentences, uppercase only in display labels.
- Say a thing once per screen. Don't restate the heading; don't explain the obvious.
- The game's voice is a football club's: calm, direct, a little dry. No jokes in system messages, no "Oops",
  no exclamation marks outside celebrations.
- Copy must be true: if it says "tap the star", the button is a star.
- Explanations a player needs once go behind an (i). Rules that change a decision stay visible, in one line.

**States**
- Every list has an empty state: the screen's glyph, what is missing, and the way to change it (a button when there
  is one). `Empty` in `atoms.tsx`.
- Check loading, empty, one item, many items, long names, unusual data (a free agent, a national team, a club with
  no stadium) and the screen under a sheet.

**Ambition where it belongs**
- Hero moments (competition cards, match days, celebrations, season review, the menu) can be rich: art, motion,
  colour. When one is, the screen around it supports it (same palette, same type, nothing generic beside it).
- Everyday controls (settings rows, stat tables, lists) are compact, exact and quiet.

## Shared pieces

- `Shortcuts` (layout): ways into other screens as one control, icon over name, hairline dividers.
- `Facts` (layout) and `.jgrid.c2/.c3/.c4`: facts or cells in one card, hairline grid.
- `Empty` (atoms): the empty state.
- `InfoTip` (components/InfoTip): the (i) with the longer explanation in a sheet.
- `Avatar` (atoms): monogram in the club's colour unless given another.
- `Sheet`, `Confirm`, `Seg`, `Tabs`, `Chips`, `Toggle`, `Stepper` (layout).

## Reviewing a change

1. Before changing a screen, screenshot it: `node scripts/qa/design-review.mjs <save> <dir> [screens]` (top, middle
   and end of each screen, plus a contact sheet per screen in `<dir>/sheets`).
2. Look at the whole screen first, then each section, then the details (alignment, truncation, radii, seams,
   crest sizes, spacing rhythm, wording).
3. Consider more than one direction for anything weak; pick the strongest, or combine.
4. After the change, screenshot again and compare side by side (`scripts/qa/shot-sheet.mjs`), the whole screen, not
   only the part changed. Check the states above and 320pt width. If it isn't clearly better, rethink it.
5. `npx tsc --noEmit -p tsconfig.app.json`, `npx oxlint`, `npm run build`.

Ask of every element: does it exist for a reason, does it say something about football, would a good product designer
keep it exactly as it is?
