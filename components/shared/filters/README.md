# Shared filter toolbar

Sonar, Scanner and Stream show the same controls. They used to show four copies of them, and the
copies drifted — always silently, always found by comparing two screenshots weeks later:

- the same class-row pill was `accent-chip` on one surface and `accent-soft` on another;
- the Scanner's ZAP group sat two shades darker because its container class was written out twice;
- the min/max card lost the zero-coverage state on the Sonar and the focus guard on the Scanner;
- `MultiSelectFilter` kept calling `getSonarAccent()` in one copy after the others had moved to the
  CSS-variable utilities;
- and the one that actually costs money: adding the CORR filter meant the same edit in four files.
  Forget one and that surface has a filter button that rejects nothing, which looks exactly like a
  filter that works.

`npm run check:ui` (also part of `npm run lint`) fails if any of that starts again. See
`scripts/check-shared-ui.mjs`.

## What lives here

| File | Owns |
| --- | --- |
| `styles.ts` | Group/pill/input class strings and the per-group colour tones. **The only place those literals may appear.** |
| `FilterFlagsRow.tsx` | The toggle row: exclusions, REP/CORR + its threshold box, regions. |
| `FilterRatingRow.tsx` | The rating row: ACTIVE/INACTIVE/ALL strip, MINRATE/MINTOTAL steppers, ρ/β/σ ranges. |
| `ActiveTickerCard.tsx` | The active-ticker strip under the toolbar. |

Two more shared pieces live outside this folder for historical reasons and are guarded the same way:

| File | Owns |
| --- | --- |
| `components/scanner/shared/ui.tsx` | `MinMaxRow` (the min/max card), `MultiSelectFilter`, `GlassInput`. |
| `components/scanner/shell/panels/ScannerHeader.tsx` | Title, STREAM/SCANNER/SONAR nav, IGN/APP/PIN, run button. |

## The seam

Shared: **what changes together.** Adding or restyling a filter toggle should be one edit.

Slotted: **what is genuinely per-surface.** `selectsSlot`, `sortSlot`, `zapSlot`, and the card's
`children` take whatever the host already renders — the Scanner's `MultiSelectFilter` has a
`panelWidth`, the sort control has different option sets per surface, ZAP is an Arbitrage statistic
with no OpenDoor equivalent, and the card's expanded body is a live-snapshot grid only the Sonar
has. Forcing those into the shared component would mean a per-strategy conditional inside it, which
is the thing worth avoiding.

## Adding a filter to all three surfaces

1. Add the toggle to the `exclusions` array at each call site (or to the model the caller builds).
2. Add the rule to the shared predicate in `lib/filters/` — `borrow.ts`, `sectorCorr.ts`,
   `reportTiming.ts` are the existing examples. **Never** re-implement the rule per surface: the
   report rule needs the session date on the Scanner and today on the live surfaces, and that is a
   parameter, not a second copy.
3. Run `npm run check:ui`.

## Layout rules the check enforces

**No phantom gap.** A wrapper that always renders but whose only child is conditional is an EMPTY
flex child when that condition is false — and the parent's `gap-*` still reserves the space, so the
row above it reads as having more padding below than above. Hoist the condition outside the wrapper:

```jsx
{meta && (
  <div className="...">...</div>
)}
```

not

```jsx
<div className="...">
  {meta && (...)}
</div>
```

It was in 18 files before it was noticed, and it was reported as "why is the bottom padding larger"
— the symptom points at the row, not at the empty element under it. `scripts/lib/no-phantom-gap.mjs`
now fails `npm run check:ui` on it. A div with SEVERAL conditional children is a different case:
each can appear on its own, so guard the wrapper on all of them together rather than hoisting one.

## Known duplication

`scripts/check-shared-ui.mjs` holds a ratchet for controls that are still forked:
`GlassSelect` (3), `SingleSelectFilter` (2), `FilterButton` (2). The check fails if a count grows.
Lower a number when you unify one; never raise one.
