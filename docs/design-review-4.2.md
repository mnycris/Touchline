# Design review, 4.2

A pass over every screen of a mid-season career (Arsenal, February) at 390 and 320pt, looking for what reads as
generated rather than designed. The standard it applied is in [DESIGN.md](DESIGN.md).

## What was found

Touchline's identity held up: the competition cards, match day, the live match, the player card, New Career and the
menu are designed for this game. What dragged the rest down was a handful of defaults repeated across screens:

- **Boxes for everything.** Facts as separate tiles (player ×6, club, manager, negotiation, national team, finances,
  records), boxes inside cards (message facts, opponent report).
- **Decoration without a source.** Giant faded icons behind Central's tiles, a blueprint grid behind the board,
  random Tailwind-bright monogram colours, crests on dark plates in the inbox and lists.
- **Side stripes on rounded cards.** News by kind, quotes, inbox "needs you", scout cards, transfer rows, tactical
  tips, the half-time call, chat bubbles.
- **Widgets standing in for numbers.** Three rings and a two-point sparkline for a player's condition, five rings
  for the board, sparklines for development.
- **Too many words.** Settings explained every toggle in three lines, Training opened with a paragraph, the FIFA
  ranking ended with one, empty states told you what you already knew, and a release note joked about biscuits.
- **Everything at the same volume.** Renew on all 23 contracts, a plan pill on every training row, zero counts as
  loud as real ones, "Player of the Month" repeated in every month's card.
- **Small untruths.** The transfers tile said the window "Opens 3 Feb" when none was due; a lost Community Shield
  said "Eliminated"; a red-to-green ramp measured the matchday count; "Tap the star" pointed at a bookmark.

## What changed

- New shared pieces: `Facts` and the `.jgrid` hairline grid (one card, divided cells); the `Empty` state redrawn
  (plain glyph, title, one line, an action); `InfoTip` usable in the top bar.
- Top-bar buttons are round and outline-free.
- Central: the tiles lost their watermarks, zero counts are quiet, the week strip lost its placeholder dots, the cup
  card says which leg and the aggregate.
- Player: facts in one card; condition as numbers with meters and the last five ratings.
- Club, manager, coach, negotiation, national team, finances, records: facts joined into one card each.
- Board: overall confidence once, each area's confidence beside its objectives; no rings row, no grid.
- News, inbox, transfers, scouting, tactics tips, half-time call, chat: the tone said once, without stripes; crests
  and logos bare; club-coloured monograms.
- Training: one control for everyone's plan, the plan shown in colour only when it isn't Balanced, the explanation
  behind an (i). Development shows what each player has gained.
- Contracts grouped by the summer they run to, Renew emphasised only where it is due.
- Awards as one table with its column names said once.
- Settings, checkpoints, followed leagues, FIFA ranking: one line visible, the detail behind an (i); image sources
  collapsed to one row.
- Writing: empty states, helper lines and the game-world note rewritten plainly; the monthly awards story written as
  sentences; competition statuses ("Runners-up", "Out in the third round") corrected.
- Shouts: the glyph beside the name, no tiles.
- New Career: badge colours are kit colours; the club's facts are one card.
- 320pt: the board, awards and transfer budget fit without wrapping.

## Taken back

The shortcut tiles (Central, Squad, Transfers, Season) and match day's three buttons were first joined into one
control with hairlines. That took away part of the look rather than a generic default, so they are back exactly as
they were, and DESIGN.md now names them as identity. The lesson, in the standard as "refine, never strip": a pass
like this removes what reads as generated and keeps what makes Touchline look like Touchline.

## How to repeat it

`node scripts/qa/design-review.mjs <save> <out> [screens]` before and after, `scripts/qa/defects.mjs <save> <out> 320`
for the narrow phone, and the checklist at the end of DESIGN.md.
