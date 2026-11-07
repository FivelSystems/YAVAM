# Anchored menu primitive

> **Status:** Done — implemented per the [Architecture decision](#architecture-decision) (issue #94)

## Problem

The frontend has two independent implementations of "right-click menu pinned to
a point", each re-solving positioning, edge-flip, portalling, and dismissal on
its own:

1. **`components/ui/ContextMenu.tsx`** — per-package actions (toggle, open
   folder, download, delete, merge, …). Triggered from `PackageCard`,
   `RightSidebar`, `DependencyRow`/`DependencyGroup` — all of these route a
   single `(x, y, pkg)` into one `contextMenu` state owned by `Dashboard.tsx`,
   which renders the one `<ContextMenu>` instance. So there is exactly **one**
   package-menu implementation, just with several trigger sites.
2. **`features/library/Sidebar.tsx`** (bottom of the file, `contextMenu &&`
   block) — per-group bulk actions (Enable All, Disable All, Package Cleanup,
   Install All to Library, Delete All Corrupt) for a right-clicked
   creator/type/status facet in the sidebar. A second, from-scratch `<div
   className="fixed z-50 ...">` with its own position state and its own
   dismissal wiring.

A grep for `ContextMenu` confirmed no third implementation: `DependencyRow`,
`DependencyGroup`, and `RightSidebar` only forward an `onContextMenu` callback
upward; they don't render anything themselves. `usePackageActionItems`
(Phase 3) already unified the *list of actions* consumed by `ContextMenu` and
`ActionSheet`. What's left, and what this doc scopes, is the *shell*: how a
menu is positioned, kept on-screen, portalled, and dismissed.

### Concrete divergences found

| | `ContextMenu.tsx` | `Sidebar.tsx` group menu |
|---|---|---|
| Positioning | `useLayoutEffect` measures its own rect, flips left/top if it would overflow right/bottom | None — renders at raw `contextMenu.x`/`contextMenu.y`, no measurement |
| Edge-flip | Both axes | **None** — a menu opened near the right or bottom edge of the sidebar gets clipped or pushed off-screen |
| Portal | **No** — mounts wherever `Dashboard.tsx` places it in the tree | **No** — mounts inline inside `Sidebar.tsx`'s `<aside>` |
| Dismiss on outside click | `document.addEventListener('mousedown', ...)` + `ref.contains` check | `window.addEventListener('click', ...)` (different event, fires later than `mousedown`) + the panel itself calls `e.stopPropagation()` so the two schemes don't cross-trigger each other, but they *are* two schemes |
| Dismiss on Escape | **No** | **No** |
| Touch (mobile) dismiss | Not implemented in `ContextMenu`; mobile already gets a different presentation (`ActionSheet`, a bottom-sheet opened via long-press, not this component) | **Not implemented at all** — the sidebar's group menu has no mobile equivalent; on a touch device a long-press that fires a native `contextmenu` event would open it un-flipped, right at the touch point, with no affordance to dismiss other than tapping elsewhere |

**Does the missing portal cause a real bug today?** For `ContextMenu.tsx`, no
known clipping — `Dashboard.tsx` mounts it near the tree root with no
`overflow: hidden` ancestor in between. For the **Sidebar menu, yes,
plausibly**: `Sidebar.tsx`'s `<aside>` is a scrollable column; a menu opened
while the list is scrolled, or near the bottom of a short viewport (a mobile
web client sidebar drawer in particular), has no portal to escape the
container and no edge-flip to compensate — it can be visually cut off or
rendered partly under other chrome. This is the component most likely to be
reported as broken on mobile widths.

### Prior art already in the codebase

`components/ui/FilterDropdown.tsx` already solves a sibling problem — a
popover anchored to a *trigger element* (not a raw point) — with the shape
this issue should converge on: `useLayoutEffect` to measure and flip
(top/bottom only, since it opens from a fixed-width sidebar button),
`createPortal(..., document.body)`, and a single outside-interaction effect
that handles `mousedown` **and** `touchstart` **and** `Escape` **and**
viewport-width resize, all cleaned up together. `components/ui/Modal.tsx`
separately establishes the portal + Escape-to-close pattern for dialogs. There
is no excuse for a third, weaker variant of this in `Sidebar.tsx` — it is
copy-drift, not a deliberate design choice.

### Dead code found in passing

`features/layout/GlobalOverlays.tsx` is an orphaned earlier copy of the
`ContextMenu` mounting code (older prop shape, no `selectedCount`-per-package
logic, no `ActionSheet`/`mode` split) — it is not imported anywhere
(`Dashboard.tsx` owns the real render path). Flagging for `web-developer` to
delete alongside this work; not otherwise part of this proposal.

## Proposed primitive: `AnchoredMenu`

A single component, `components/ui/AnchoredMenu.tsx`, that owns *only* the
shell — position, edge-flip, portal, dismissal — and renders caller-supplied
content. It does not know about packages, groups, or actions; `ContextMenu`
and the Sidebar's group menu become two thin configurations that each build
their own section/item markup (reusing `PackageActionItem`-style button
styling) and hand it to `AnchoredMenu` as children.

```tsx
interface AnchoredMenuProps {
  anchor: { x: number; y: number } | null; // null / undefined = closed
  onClose: () => void;
  children: React.ReactNode;
  className?: string; // width/min-width stays caller-defined (56 vs 40 Tailwind units today)
}

function AnchoredMenu({ anchor, onClose, children, className }: AnchoredMenuProps) {
  // 1. ref + useLayoutEffect: measure own rect after mount/anchor change,
  //    flip left/top if it would overflow right/bottom, clamp to a minimum
  //    inset from all four edges (mirrors ContextMenu.tsx's existing 10px rule).
  // 2. One effect, mirroring FilterDropdown's: mousedown + touchstart outside
  //    the panel ref → onClose; keydown Escape → onClose. Single cleanup.
  // 3. createPortal(..., document.body) — always, no exceptions, so no
  //    future consumer can reintroduce a clipping bug by mounting it inside
  //    a scrollable/overflow-hidden ancestor.
  // 4. Renders null when `anchor` is null — callers don't need a separate
  //    `open` boolean.
}
```

Design decisions for `architect` to confirm or override:

1. **Point-anchored only, not rect-anchored.** `FilterDropdown`'s popover
   anchors to a *trigger element's* `getBoundingClientRect()` and only flips
   vertically (it's always opened from a fixed horizontal position in the
   sidebar). `AnchoredMenu` anchors to a raw `(x, y)` point (where the user
   clicked/long-pressed) and flips on **both** axes, since a context menu can
   open anywhere in the viewport. These are genuinely different inputs, so the
   proposal is **not** to fold `FilterDropdown` into this primitive — but the
   *dismissal* logic (outside pointer + Escape + the touch-safe double
   listener) is identical in shape across all three components and is worth
   extracting as a small shared hook (`useDismissOnOutsideOrEscape(ref,
   onClose)` in `frontend/src/hooks/`) that `AnchoredMenu` **and**
   `FilterDropdown` both call, removing the last bit of copy-paste even if
   the two components stay separate. Flagging this as a scope question for
   `architect`: fold into this issue's deliverable, or file as a quick
   follow-up.
2. **Children, not a configured item list, as the content API.** `ContextMenu`
   needs a non-item slot (the rating/favourite row) above its action list;
   the Sidebar menu needs a header label plus several independently-shown
   sections (Enable/Disable, Cleanup, Install, conditional Delete) separated
   by dividers, not just the current two-tone (regular/danger) split
   `ContextMenu` uses. Baking a single item-list shape into `AnchoredMenu`
   would force one of the two call sites to contort its content to fit.
   Letting both compose arbitrary JSX inside `AnchoredMenu` keeps the
   primitive honestly about the shell only, and leaves the "list of
   sections/dividers" question to each caller (optionally sharing a small
   `<MenuSection>`/`<MenuItem>` presentational pair for the button styling
   that's currently duplicated verbatim between the two files — `w-full
   text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-sm
   ...` appears near-identically in both).
3. **Escape-to-close is new behaviour for both consumers**, not a regression
   risk — neither implementation has it today. Low-risk addition, consistent
   with `Modal` and `FilterDropdown`.
4. **Mobile.** Right-click doesn't exist on touch; both existing menus rely
   on the browser's synthetic `contextmenu` event from a long-press, which is
   inconsistent across mobile browsers and was explicitly *not* used for the
   package menu (that has `ActionSheet` + `useLongPress` instead, a deliberate
   different presentation for small viewports). The Sidebar group menu has no
   such alternative today. This doc does not propose adding a bottom-sheet
   presentation for group actions — that's a product decision (does "Enable
   All for this creator" warrant a mobile-specific affordance at all?) outside
   an infra-unification issue — but `AnchoredMenu` must at minimum not make
   mobile worse: full-viewport edge-flip + portal fixes the clipping risk
   called out above, and the shared dismiss hook adds `touchstart` handling
   that neither implementation fully has today (`ContextMenu` has none;
   Sidebar's menu only listens for `click`, which does fire after a tap, but
   not before a scroll-triggered dismissal the way `touchstart` would).
   Recommend flagging real mobile-affordance-for-group-actions as a separate
   roadmap item if it comes up, not solving it here.

## Migration shape (for `web-developer`, after `architect` sign-off)

- `ContextMenu.tsx`: keep its header (filename/count) + rating row +
  `usePackageActionItems`-driven sections as its own render content; replace
  its bespoke `useState<position>` + `useLayoutEffect` + `useEffect(mousedown)`
  block with `<AnchoredMenu anchor={pkg ? { x, y } : null} onClose={onClose}>`.
- `Sidebar.tsx`: extract its inline `contextMenu &&` block into a small
  `SidebarGroupMenu` component (own file or co-located), built the same way —
  its own header/sections, wrapped in the same `<AnchoredMenu>`. This also
  resolves its current dismissal mismatch (`window.addEventListener('click')`
  vs. `ContextMenu`'s `mousedown`) for free, since both now go through the one
  shared effect.
- Both call sites keep their own open/close state shape (`{ x, y, pkg }` vs.
  `{ x, y, groupType, key }`) — `AnchoredMenu` only cares about `{ x, y } |
  null`.
- No change proposed to `FilterDropdown.tsx` itself beyond the optional shared
  dismiss hook in point 1 above, pending `architect`'s call on scope.

## Open questions for `architect`

1. Fold `FilterDropdown`'s dismiss logic into the shared hook now, or keep
   this issue scoped strictly to the two context-menu implementations and
   file the hook extraction separately?
2. Any objection to deleting `features/layout/GlobalOverlays.tsx` as part of
   this work (dead code, zero imports), or should that be its own
   `chore(frontend)` commit?
3. Confirm `AnchoredMenu` lives in `components/ui/` (it's a generic primitive,
   not library-feature-specific) — matches where `ContextMenu`, `ActionSheet`,
   `Modal`, and `FilterDropdown` already live.

## Architecture decision

The proposal is accepted in its core shape: a shell-only, point-anchored,
always-portalled `AnchoredMenu` with `children` as the content API, and
`ContextMenu` / `SidebarGroupMenu` as two thin configurations of it. The
alternatives weighed, the answers to the open questions, and the adjustments
to the proposal follow.

### Alternatives considered

| Option | Verdict | Why |
|---|---|---|
| **A. Shell-only primitive, `children` content** (proposed) | **Chosen** | The two consumers share *only* the shell. Their content differs structurally (rating slot vs. conditional sections), so a shared shell with free-form content is the smallest abstraction that removes the duplication without forcing either side into a shape. |
| B. Configured item list (`items: MenuItem[]`, sections, tones) | Rejected | Would need escape hatches for the rating row and for per-section visibility — a schema growing to describe JSX. `usePackageActionItems` already owns the *package* action list; a second, generic list type on top would duplicate it. |
| C. One component covering both point- and rect-anchored popovers (fold `FilterDropdown` in) | Rejected | Different inputs (point vs. trigger rect), different flip rules (both axes vs. vertical only), different lifecycle (`FilterDropdown` owns its open state and trigger; menus are opened by a caller). Merging would add mode flags for a third consumer that does not exist. The *dismissal* logic is the one genuinely identical part, and it is shared via a hook instead (see Q1). |
| D. Headless library (Radix / Floating UI) | Rejected for now | Solves positioning, focus, and keyboard nav well, but adds a dependency to replace roughly 60 lines of measured, already-understood code. Worth revisiting only if full keyboard navigation (roving focus, type-ahead) becomes a requirement. |

### Q1 — Shared dismiss hook: **in scope, extract now**

Extract the dismissal logic into `frontend/src/hooks/useDismissOnOutsideInteraction.ts`
as part of this issue, and migrate `FilterDropdown` onto it.

Reasoning: `AnchoredMenu` needs this logic on day one. Writing it inline in
`AnchoredMenu` and extracting it in a follow-up means writing it twice and
leaving a third copy in the codebase in between — exactly the copy-drift this
issue exists to remove. The risk of touching `FilterDropdown` is low because
its dismissal behaviour is already pinned by tests (`FilterDropdown.test.tsx`:
width-only resize, height-only resize ignored, outside `touchstart`), which
must keep passing unchanged.

Contract:

```ts
interface DismissOptions {
  /** Elements whose pointer/scroll events count as "inside" (panel, and trigger if any). */
  insideRefs: React.RefObject<HTMLElement>[];
  onDismiss: () => void;
  /** Listeners are attached only while enabled. Default `true`. */
  enabled?: boolean;
}

function useDismissOnOutsideInteraction(options: DismissOptions): void;
```

Behaviour (the union of what `FilterDropdown` does today, which becomes the
single definition for every anchored overlay):

- `mousedown` and `touchstart` on `document` whose target is outside every
  `insideRefs` element → dismiss.
- `keydown` `Escape` → dismiss.
- `resize` → dismiss **only on a width change** relative to the width at
  attach time (the #55 virtual-keyboard rule).
- `scroll` (capture phase on `window`) → dismiss, **unless the scroll target
  is inside one of `insideRefs`**. A fixed-position overlay detaches from the
  content it refers to when that content scrolls, so closing is correct; but
  scrolling the overlay's own content must not close it. The capture-phase
  listener `FilterDropdown` uses today receives scroll events from *every*
  element, including its own `overflow-y-auto` option list; whether that
  closes the popover mid-scroll in practice must be verified during the
  migration, and the inside-target check closes the gap either way.
- `onDismiss` is read through a ref (latest-callback pattern), so the
  listeners are attached once per open, not on every render. Today's
  consumers pass inline arrows (`Dashboard.tsx`:
  `onClose={() => setContextMenu({ ...contextMenu, open: false })}`), which
  makes `ContextMenu`'s current effect detach and reattach its listener on
  every parent render.

Explicitly **not** in the hook: `FilterDropdown`'s coarse-pointer
autofocus rule. That is about focus, not dismissal, and stays in
`FilterDropdown`.

### Q2 — Delete `GlobalOverlays.tsx`: **same PR, own commit, first**

Delete `features/layout/GlobalOverlays.tsx` on the #94 branch as a separate
`chore(frontend)` commit, ordered **before** the `ContextMenu` refactor.

It is not independent of this work: it imports `ContextMenu` and passes
props to it, so it is still type-checked by `tsc --noEmit`. Leaving it in
place would mean either keeping a dead file compiling against `ContextMenu`
during the refactor or editing dead code to match. Removing it first makes
the refactor commits smaller and their diffs honest. A separate commit
(rather than folding it into the refactor) keeps it trivially revertable and
keeps the history readable. A separate PR would be ceremony for a zero-import
deletion.

### Q3 — Location: **confirmed**

- `frontend/src/components/ui/AnchoredMenu.tsx` — generic primitive, sits
  next to `ContextMenu`, `ActionSheet`, `Modal`, `FilterDropdown`.
- `frontend/src/hooks/useDismissOnOutsideInteraction.ts` — next to
  `useLongPress`, `useLiveRatingFavorite`.
- `SidebarGroupMenu` — **co-located in `features/library/`** as its own file
  (`features/library/SidebarGroupMenu.tsx`), not in `components/ui/`. It
  knows about status filters, `handleSidebarAction`, and corrupt-package
  deletion; it is library-feature code, not a primitive.

### Adjustments to the proposal

1. **Required anchor, conditional mount — no `null` anchor.** The proposal
   has `anchor: {x,y} | null` with "null renders nothing". Both call sites
   already mount the menu conditionally (`Dashboard.tsx` gates on
   `contextMenu.open && contextMenu.pkg && mode === 'anchored'`; `Sidebar.tsx`
   gates on `contextMenu &&`). Supporting a mounted-but-closed state adds a
   state nobody uses and means position state must be reset across opens.
   Make `anchor: { x: number; y: number }` required; callers mount
   `<AnchoredMenu>` only while open. Each open is a fresh mount, so position
   state starts clean and the dismiss hook attaches exactly while visible.
   `ContextMenu`'s `pkg: VarPackage | null` prop may tighten to non-null for
   the same reason (its only live caller already guarantees it).
2. **Flip, then clamp.** `ContextMenu` today *clamps* (slides the menu back
   inside the viewport), which on an overflow puts the menu under the
   cursor. `AnchoredMenu` should match native context menus: if the menu
   would overflow the right edge, open it to the **left** of the anchor
   (`x - width`); if it would overflow the bottom, open it **above**
   (`y - height`); then clamp the result into
   `[EDGE_INSET, viewport - size - EDGE_INSET]` on both axes. Name the 10 px
   as a constant (`EDGE_INSET_PX`), per the no-magic-numbers rule.
3. **Cap height to the viewport.** The package menu is roughly a dozen rows;
   on a short window (small desktop window, landscape phone) it can exceed
   the viewport, and clamping alone cannot fix that. Apply
   `maxHeight: innerHeight - 2 * EDGE_INSET_PX` with `overflow-y-auto` on
   the panel. This is why the dismiss hook must ignore scrolls inside the
   panel.
4. **Share `MenuItem` and `MenuDivider`, nothing more.** The button markup
   is duplicated verbatim between the two menus — the CLAUDE.md
   "written twice, extract it" rule applies. Export them as named exports
   from `AnchoredMenu.tsx` (they only make sense inside it):
   `MenuItem` takes `icon`, `label`/children, `onSelect`, and
   `tone?: 'default' | 'danger'`; `MenuDivider` is the separator. The
   panel also exposes `role="menu"`, items `role="menuitem"`. **No**
   `MenuSection` abstraction with automatic separator logic — each caller
   decides its own grouping, which is plain conditional JSX.
5. **`MenuItem` closes the menu, callers don't.** Both menus currently
   repeat `item.onClick(); onClose()` / `handleSidebarAction(...);
   setContextMenu(null)` on every button. `AnchoredMenu` provides its
   `onClose` through a small context that `MenuItem` reads, so selecting an
   item always closes the menu. Ordering: close first, then run the action —
   this matches the existing "Delete All Corrupt" button (which closes before
   opening the delete confirmation modal) and avoids the menu lingering
   under a modal.
6. **Fix the Sidebar double-divider while extracting.** The current block
   renders both dividers unconditionally, so a group with no Cleanup action
   shows two adjacent separators, and a group with neither Enable nor
   Disable starts with one. `SidebarGroupMenu` renders a divider only
   between non-empty groups. Also remove the `window` `click` listener and
   the panel's `stopPropagation` from `Sidebar.tsx`; the shared hook
   replaces both.
7. **Move the group-matching predicate out of render.** The
   `isPackageInContext` function currently lives inside an IIFE in
   `Sidebar.tsx`'s JSX. It moves with the menu into `SidebarGroupMenu` (as a
   plain function of `(pkg, groupType, key)`), so it can be unit-tested
   directly. Moving it further into `pkg`/`utils`-style shared code is not
   warranted until a second consumer needs it.

### Out of scope (deliberately)

- **Keyboard navigation** (arrow keys, roving focus, type-ahead). Escape and
  ARIA roles are added; full menu keyboard semantics are a separate
  accessibility item, and the point at which a headless library (option D)
  becomes worth its weight.
- **A mobile presentation for group actions** (bottom sheet like
  `ActionSheet`). Product decision, as the proposal says; belongs in the
  roadmap if raised.
- **`ActionSheet` adopting `MenuItem`.** Its rows are sized for touch targets
  and it is a different presentation; sharing the button component would
  couple two intentionally different densities.
- **A global "only one menu open" manager.** Not needed: opening any menu
  starts with a `mousedown`/`touchstart` that the open menu's dismiss hook
  already treats as outside.

### Implementation order (one PR, one commit each)

1. `chore(frontend)`: delete `GlobalOverlays.tsx`.
2. `refactor(frontend)`: add `useDismissOnOutsideInteraction` with unit tests;
   migrate `FilterDropdown` onto it. Existing `FilterDropdown.test.tsx` passes
   unchanged; add a test that scrolling inside the popover list does not close it.
3. `refactor(frontend)`: add `AnchoredMenu` (+ `MenuItem`, `MenuDivider`)
   with tests — portals to `document.body`; outside `mousedown` and
   `touchstart` close; inside does not; Escape closes; inside scroll does not
   close; flip on both axes with mocked `getBoundingClientRect` and viewport
   size. Migrate `ContextMenu`; `ContextMenu.test.tsx` passes.
4. `fix(frontend)`: extract `SidebarGroupMenu` onto `AnchoredMenu` — this is
   the commit that changes user-visible behaviour (edge-flip, portal escape
   from the scrollable sidebar, Escape, divider fix), hence `fix`, not
   `refactor`.

Before merge, a manual click-through is required in addition to the test
suite: package menu and group menu near each viewport edge on desktop, and the
group menu via long-press on a touch device through the web client (long-press
inside an open `FilterDropdown` option → dropdown closes, group menu opens and
stays open after the finger lifts).
