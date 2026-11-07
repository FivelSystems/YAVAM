# Design: Left sidebar filter panel layout

> **Status:** Implemented on `feature/ui-rework`.
> **Roadmap:** [Smart search + sidebar redesign](../roadmap/search.md) (the
> icon-only sidebar described there is a later, larger rework; this spec covers
> the current full-width sidebar's filter panel and is a compatible stepping
> stone, not a competing direction).

Scope: `frontend/src/features/library/Sidebar.tsx`, specifically the filter
panel below the library switcher (everything inside the
`<div className="flex-1 overflow-y-auto ...">` block). The library switcher
header, the library-reorder dropdown, and the context menu are unchanged.

This spec resolves four findings from a prior visual review, as one coherent
redesign rather than four independent patches:

1. Status is one data model (`status:*` tokens, same field, OR-combined —
   confirmed in [search-syntax.md](search-syntax.md)) rendered as two different
   UI patterns: a popover checkbox list for six values, permanent switches for
   two more.
2. Inverted hierarchy: all headers share one style; primary filter labels are
   dimmer than secondary toggle labels; three accent colors (blue/yellow/pink)
   compete.
3. Inconsistent density: dropdowns are contained chips, Rating is bare
   floating buttons, section breaks follow no rule, count badges are pills
   everywhere except Standalone/Removable.
4. The three booleans (favourites, standalone, removable) read as structural
   siblings with no grouping cues.

## Decision on #1: fold Standalone/Removable into the Status dropdown

**Standalone and Removable become two more checkable rows inside the existing
Status `FilterDropdown`, not a promotion of Status to inline chips, and not a
third pattern.**

Rejected alternative — promote Status to inline toggle chips (matching
Standalone/Removable's current treatment): an 8-option chip row is
permanently taller than Creators/Categories' one-line dropdown trigger, which
costs the whole panel fixed vertical space on every screen, including the
narrow mobile viewport where the sidebar is a full-height drawer and height is
the scarce axis. It would also make Status diverge in *shape* from Creators
and Categories even though all three are "pick one or more values for a
field" controls — reintroducing a different inconsistency in place of the one
being fixed.

Reasons for folding into the dropdown instead:

- **It matches the data.** `search-syntax.md` already documents
  `status:standalone` / `status:removable` alongside `status:enabled` /
  `status:corrupt` as the same token family, same OR-combining rule. One field
  should have one widget.
- **It scales flat.** Categories already lists more than eight values as a
  flat checkbox list with no trouble; eight Status values is not a density
  problem for a popover the way it is for permanent chips.
- **It fixes a second, smaller bug for free.** Status options are hidden at
  zero count unless active (`statusOptions`'s existing `count > 0 ||
  statusActive(value)` rule, kept from fixing #53). Standalone/Removable
  currently have no such rule — they sit as two permanently-visible, often
  inert switches even at a 0 count. Folding them into `statusOptions` applies
  the same rule to them automatically.
- **It fixes a latent dead-interaction gap.** Every `FilterDropdown` row
  supports right-click → bulk actions (`onOptionContextMenu`). Standalone and
  Removable, as bespoke `Toggle`s, never got this. Moving them into the
  dropdown gives them the same bulk-action menu as every other status for
  free (see "Logic follow-ups" below for the one change this requires).
- **Active state stays visible.** The closed trigger shows a live summary
  (`Status: Removable, +1`), which communicates an active Standalone/Removable
  filter at least as clearly as a permanent switch did — and unlike the old
  switches, says nothing extra when neither is active, instead of occupying
  dead space.

### New Status option list

Order (unchanged lifecycle cluster first, relationship axis appended at the
end — no divider needed inside the list; see "Typographic scale" for why a
flat list is sufficient here):

```
Enabled            (no tone)
Disabled           (no tone)
Missing Deps       (tone: error)
Conflicts          (tone: warning)
Duplicates         (tone: warning)
Corrupt            (tone: error)
Standalone         (no tone)   ← moved from permanent toggle
Removable          (no tone)   ← moved from permanent toggle
```

`label` is just `"Standalone"` / `"Removable"` — drop the current
`` `Standalone (${count})` `` string interpolation; the count renders as the
badge every other row already gets, per the single count-badge rule below.

**Tooltips carry over.** The current wrapping `<div title="…">` on each
toggle explains what the state means ("Self-contained: declares no
dependencies of its own." / "No other package depends on these, so removing
them won't break anything."). Add an optional `title?: string` to
`FilterOption` (`components/ui/FilterDropdown.tsx`) and render it as the
native `title` attribute on the option's `<button>`. This is the same
plain-tooltip idiom already used elsewhere in this file (`SidebarLibraryItem`'s
`title={lib}`), not a new pattern — and it's generically useful for any future
status value that needs a one-line explanation, not just these two.

### Logic follow-up this decision requires (not visual, but caused by it)

`Sidebar.tsx`'s context-menu `isPackageInContext` switch (the block handling
`contextMenu.groupType === 'status'`) only has cases for the six original
`STATUS_FILTERS`. Once Standalone/Removable are real dropdown rows with
`onOptionContextMenu` wired (inherited automatically from the shared
`FilterDropdown`), right-clicking them opens a context menu — it needs two
more cases (`STANDALONE`, `REMOVABLE`) using the same predicates already
computed in `statusCounts` (`isStandalone`, `p.isRemovable`), or the menu opens
with zero eligible actions, which reads as broken rather than "nothing to do
here."

## Typographic & spacing scale

Three levels, used consistently everywhere in the panel — the current bug is
that there are only two visual treatments for three different jobs.

| Level | Used for | Style |
| --- | --- | --- |
| **1 — Panel header** | The single `"Filters"` label at the top of the scroll area | `text-xs font-semibold uppercase tracking-wider text-gray-400`. Appears **once** for the whole panel. |
| **2 — Group header** | `"Rating"`, `"Favourites"` | `text-[11px] font-medium uppercase tracking-wide text-gray-500`. Smaller, not semibold, narrower tracking than Level 1 — reads as subordinate at a glance, not just "the same label again." |
| **3 — Item label** | `FilterDropdown` trigger text (`Status`/`Creators`/`Categories`), every option row's text, `Toggle` labels | `text-sm font-medium`. Color is **state-driven, not component-driven**: `text-gray-300` at rest, `text-white` (or the control's own active accent, e.g. `text-blue-300` for a dropdown summary) when that control is active/checked. |

This directly fixes the reported inversion: today `Toggle` labels are
hardcoded `text-white` regardless of checked state, while `FilterDropdown`'s
idle label is `text-gray-300` — so an *off* toggle reads brighter than an
*active* filter button. Level 3's rule removes the discrepancy by tying
brightness to state for every item-level control, not to which component
renders it.

Status gets no internal sub-divider between the lifecycle values and the two
relationship values at the end of the list — introducing a divider there would
partially re-introduce "two patterns for one field." Eight flat rows is well
within what the Categories dropdown already handles comfortably with no
sub-grouping.

### Implementation note: `Toggle` needs a state-aware label

`components/ui/Toggle.tsx` currently renders `label` as `<h4 className="text-sm
font-medium text-white ...">` unconditionally. Level 3 requires the label
color to depend on `checked`. Since `Toggle` is a shared primitive used
outside the sidebar too (e.g. settings screens), change its **default**
behavior (`text-gray-300` unchecked → `text-white` checked) rather than adding
a sidebar-only override — an "on" switch should look on partly through its
label brightness everywhere it's used, not just here. Check other `Toggle`
call sites when implementing to confirm none are relying on the label being
permanently white regardless of state.

## Color system: one active-filter color, two icon-only accents

- **Blue is the only "this is actively filtering the grid" signal.** It
  applies uniformly to: `FilterDropdown` trigger + selected rows, the Rating
  row's container and count badge when a rating filter is set, and `Toggle`'s
  "on" track (already `bg-blue-600` — unchanged).
- **Yellow is confined to the star glyphs themselves** (`RatingStars`'s
  `fill-yellow-400`, already correct). It must never spread to surrounding
  chrome: the `"N stars"` indicator becomes a standard blue count badge (see
  below), not yellow text.
- **Pink is confined to the heart glyph fill** (already correct:
  `fill-pink-400` applied only to the `Heart` icon in the current code). The
  "Only favourites" row's "on" affordance is the same blue `Toggle` track
  everyone else uses — pink never spreads to the row background or label.
- **Warning/error tones** (the existing `yellow-500/20` / `red-500/20` pill
  backgrounds in `FilterDropdown`'s `badgeTone`) are unchanged and stay
  reserved exclusively for counts that flag packages needing attention
  (Missing Deps, Conflicts, Duplicates, Corrupt).

Net effect: exactly one color means "I am filtering," and the two colors that
used to compete with it are now strictly iconography (a yellow star, a pink
heart are universally legible on their own), never chrome.

## One container style for every row

Every top-level control in the panel — the three `FilterDropdown` triggers,
the Rating row, and the Favourites row — uses the **same container recipe**
`FilterDropdown`'s trigger already has:

```
rounded-md border px-3 py-2
idle:   bg-gray-900/40  border-gray-700       text-gray-300
active: bg-blue-600/10  border-blue-600/30    text-blue-300 (per Level 3)
```

- **Rating row:** wrap `RatingStars` in this container. Idle by default;
  switches to the active tint when `rating > 0`.
- **Favourites row:** wrap the `Toggle` in this container, same idle/active
  rule keyed on `favoriteActive`.

This removes the "dropdowns are chips, Rating floats bare" inconsistency —
there is one row shape in the entire panel, and whether a row is a
dropdown-trigger, a star-rating control, or a switch stops being visible in
its container chrome.

## Single count-badge treatment

Adopt `FilterDropdown`'s existing pill exactly, everywhere a count appears in
this panel: `text-[10px] px-1.5 py-0.5 rounded-full border`, tone-colored via
the existing `badgeTone` function. Concretely:

- Status/Creators/Categories option counts: unchanged (already this pattern).
- Standalone/Removable counts: inherited automatically once they're
  `FilterOption`s (see decision above) — no separate styling needed.
- The Rating section's `"N stars"` indicator: converted from plain
  `text-gray-500` text to this same pill (`tone: 'normal'`, so it picks up the
  blue selected treatment via `badgeTone(undefined, true)` when `rating > 0`).

No bare/plain-text count is left anywhere in the panel.
(The library-switcher's package-count pill, above this panel, is a different
part of the sidebar and out of scope here — it already uses a close variant
of this pattern and can be reconciled in a later pass if touched.)

## Grouping: two top-level groups, not three

Resolving #4 doesn't mean drawing a box around "favourites + standalone +
removable" — Standalone and Removable no longer exist as sibling toggles once
folded into Status (previous section), so there is no dependency-pair left to
box. What remains is `Rating` and `Only favourites`, which the data model
(`CLAUDE.md`'s data model: both are per-user metadata stored in
`user_metadata`) and the code (both already gated by the same `!isWeb` check,
comment `#56`) already say belong together. The fix is to **put them in one
group, each with its own Level-2 header**, instead of Favourites being
appended after an unrelated dependency-relationship block.

Final structure, top to bottom, inside the scrollable filter panel:

```
[Level 1] "Filters"                                    Clear all (if active)
  FilterDropdown  Status      (8 options, see above)
  FilterDropdown  Creators
  FilterDropdown  Categories

── divider (border-t pt-4) ──────────────────────────── only when !isWeb

  [Level 2] "Rating"
    [container row] RatingStars · "N star(s)" badge (right-aligned)

  [Level 2] "Favourites"
    [container row] Toggle "Only favourites"  (heart icon, pink fill only when on)
```

Collapse the current two separate `{!isWeb && (...)}` checks (one around
Rating, one around the Favourites `Toggle`) into one guard around this whole
second group — they were always the same condition for the same reason
(`#56`); having one guard instead of two makes that fact visible in the code
instead of implicit.

There is exactly one divider in the panel, between these two groups. No
divider appears between a Level-2 header and its own row(s) — that's ordinary
`mb-1.5` spacing, not a section break; using a divider there was part of what
made the old "section-break conventions differ with no apparent rule"
complaint true.

## Test impact (structural, not visual — flag for whoever implements)

Three existing `Sidebar.*.test.tsx` files encode the **current** toggle-based
structure as their expected contract and will need updating alongside the
implementation, not treated as a frozen spec themselves:

- `Sidebar.statusFilter.test.tsx` (#53): unaffected — it only exercises the
  Status dropdown's enabled/disabled reactivity, which doesn't change.
- `Sidebar.favouritesToggle.test.tsx` (#58): asserts "Only favourites" uses
  the shared `Toggle`, matching "the adjacent Standalone/Removable rows." That
  comparison point disappears once Standalone/Removable move into the Status
  dropdown. Update the assertion to check Favourites renders a `Toggle` on its
  own terms (switch shape), not by comparing it to rows that no longer sit
  beside it.
- `Sidebar.webHidesRating.test.tsx` (#56): asserts
  `screen.getByText(/Standalone/)).toBeInTheDocument()` with the Status
  dropdown closed. Once Standalone/Removable are popover rows, that text only
  exists in the DOM while the popover is open (same as every other status
  option today). Update to open the Status dropdown first (same pattern
  `Sidebar.statusFilter.test.tsx` already uses), then assert the row is
  present there — the behavior being protected (Standalone/Removable aren't
  gated by `isWeb`) still holds, it just needs to be checked through the new
  location.

## Sidebar visibility: navigation state, not a persisted display preference

> **Status of this section:** decided during a post-implementation review;
> not yet implemented. Scope: `frontend/src/hooks/useLayoutSettings.ts`'s
> `isSidebarOpen` only. Everything above this section (the filter panel's
> contents) is unaffected and stays implemented as specced.

`useLayoutSettings.ts` currently treats `isSidebarOpen` the same way it treats
`gridSize`, `viewMode`, and `sortMode`: a per-device value read from
`localStorage` on mount and written back on every explicit toggle, so a
desktop session remembers whatever open/closed state it was left in the
previous launch. A live review of this pattern raised a reasonable objection:
the sidebar isn't a display setting like the others, it's the application's
only access point to the library switcher — `Dashboard.tsx` wraps the entire
`<Sidebar>` (switcher header *and* filter panel together) inside
`SidebarContainer`, so collapsing it hides both, not just the filter panel
this document otherwise covers.

**Decision: drop persistence for this value. On desktop (`≥768px`),
`isSidebarOpen` always initializes to `true` on load, regardless of what was
stored on a previous visit.** The in-session toggle (the open/close button in
`FilterToolbar.tsx`) and the existing cross-breakpoint resize behavior (fixed
in `1414147`, which closes the drawer live when resizing into the mobile
range and restores the desktop value when resizing back out) are unaffected —
this is only about what the *initial* value is on a fresh load, not about
removing the ability to close it during a session or touching the resize
sync.

Reasoning:

- **It gates access to other content, unlike every other layout setting in
  this hook.** `gridSize`, `viewMode`, and `sortMode` only change how
  already-reachable content is displayed; getting one of them "wrong" costs
  nothing more than an extra click to adjust it. Getting `isSidebarOpen`
  "wrong" after the fact means the library switcher — not just the filter
  panel this document specs — is gone with no on-screen cue that anything is
  hidden beyond a plain toggle icon in the toolbar, which is easy to miss if
  the user wasn't the one who closed it, or doesn't remember doing so days or
  launches later. That's a materially worse failure mode than the one
  persistence is meant to prevent (an unnecessary extra click).
- **The reopen control isn't lost, which makes this a low-cost change for the
  power-user case it removes.** `FilterToolbar`'s toggle renders outside
  `SidebarContainer`, so it stays visible and reachable even while the
  sidebar is collapsed — a user who deliberately wants a single-pane layout
  is one click away from it every launch, not locked out. The trade-off is a
  single extra click per session for that user, in exchange for removing a
  confusing, cumulative trap for everyone else.
- **There's an existing precedent for context-sensitive defaults over a
  blanket remembered value.** `viewMode`'s own initializer already special-
  cases the sub-768px default (`list` instead of the stored/`grid` default).
  Making `isSidebarOpen` default to the breakpoint-appropriate value instead
  of a remembered one is consistent with that existing pattern, not a new one.
- Mobile (`≤768px`) is unchanged — it already hardcodes `false` on initial
  load regardless of storage (the drawer-over-content model never treated
  this as a remembered preference there to begin with), so this decision only
  changes the desktop default.

This is scoped to the sidebar's *current* full-width, full-hide form. If the
icon-only sidebar rail described in
[roadmap/search.md](../roadmap/search.md) ships later, collapsing it costs
far less screen real estate and far less "what disappeared" ambiguity than
fully hiding the current sidebar does — persisting a rail's collapsed state
may well be the right call then. This decision applies to the sidebar as it
exists today, not as a permanent ban on ever persisting a collapse state for
this element.

Implementation note: remove the `localStorage.getItem('layout_isSidebarOpen')`
read from the initializer and the `localStorage.setItem` call from the
wrapped `setIsSidebarOpen`, for both the explicit-toggle path and the
resize-resync effect's "restore desktop value" branch (which should now just
set `true` rather than reading storage). No migration is needed for the
now-unused `layout_isSidebarOpen` key already present in some users'
`localStorage` — it simply stops being read.

## Non-goals

- No change to the library switcher, library-reorder dropdown, or context
  menu — out of scope.
- No change to `search:`/`tag:` handling or the searchbar itself.
- Does not implement the icon-only sidebar from
  [roadmap/search.md](../roadmap/search.md); that is a larger, separate
  rework this spec is compatible with but does not attempt.
