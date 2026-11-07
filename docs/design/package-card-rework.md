# Design: Package card rework (phase 3)

> **Status:** Draft — open decisions listed at the end are unresolved, including
> one roadmap conflict that needs reconciling before implementation starts.
> **Roadmap:** [SQLite foundation + card rework](../roadmap/sqlite-foundation.md)
> (Now) is where "card rework" is tracked; this phase also delivers the mobile
> entry point promised by [Favourites, ratings, license filter](../roadmap/ratings-favorites.md)
> (Next) — see "Roadmap conflict to resolve" below before treating either
> capability doc as current.

Scope: `frontend/src/features/library/PackageCard.tsx` (grid + list layouts),
the shared rating/favourite control it uses, and the mobile entry point to
package actions. Builds directly on phases 1–2 (shipped): the sidebar filter
panel and the DB-backed rating/favourite layer
(`SetPackageRating`/`SetPackageFavorite`, `patchFamily`, `user_metadata`
keyed by family).

## Roadmap conflict to resolve (read first)

`docs/roadmap/sqlite-foundation.md` states a **"Card cleanliness rule"**:
*"Cards show only thumbnail, name, creator, status tint, size, and type badge.
Ratings, favourites, and license badges live in the details panel, never on a
card."* `docs/roadmap/ratings-favorites.md` repeats the same "never on the
card" framing.

That rule is already superseded by shipped code and by this phase's own brief:
`RatingFavoriteBadge` has been on `PackageCard.tsx` since phase 2 (shipped,
`TODO.md`: *"Surface rating/favourite directly on the card"*), and this spec
makes it interactive rather than removing it. This document proceeds on the
basis that **the roadmap text is stale, not the implementation** — putting
rating/favourite on the card is the agreed direction. Before implementation,
both roadmap docs need a follow-up edit to drop the cleanliness rule (or
narrow it to license badges only, which genuinely still live in the details
panel only, per this spec). Flagging rather than silently editing those
roadmap files myself, since reconciling roadmap text is a strategy-level call,
not a UI/UX design-spec one.

Separately, `sqlite-foundation.md` also describes a larger unification: *"One
`<PackageCard>` with `grid` / `list` / `dependency` layouts, replacing the
divergent implementations"* — i.e. folding `DependencyRow.tsx`/
`DependencyGroup.tsx` (the dependency-list rows in `RightSidebar.tsx`) into
`PackageCard` as a third layout mode. That has not happened and **is not part
of this spec** (non-goal, below) — the current `TODO.md` phase-3 entry doesn't
ask for it, and it's a separate-sized refactor. Noting it so the roadmap gap
is visible, not silently dropped.

## What this phase actually needs to fix (found while reading the code)

The brief says "hover-reveal star row + favourite heart, with a long-press /
overflow menu on mobile." Two things became clear while scoping that are
bigger than "add hover interactivity to a badge," and shape the rest of this
document:

1. **Mobile/web has zero package actions today, not just missing
   rating/favourite.** `ContextMenu.tsx` and `RightSidebar.tsx` both gate their
   rating/favourite UI behind `!isWeb` ("web has no persistence endpoint yet",
   `#56`), but the deeper issue is that the entire context menu — Enable/Disable,
   Delete, Open Folder, Copy Path, Copy/Cut File, Download, Merge, Resolve — is
   *only* reachable via right-click. There is no double-click/long-press
   fallback anywhere in the codebase today (confirmed: no `onDoubleClick`, no
   touch-gesture handling exists). A phone/tablet user connected to the local
   web server cannot currently enable/disable, delete, or download a package at
   all. "Long-press / overflow menu on mobile" is therefore the mobile client's
   *only* access point to package actions in general, not a rating-specific
   add-on. The sheet this spec adds carries the full action list, not just
   rating/favourite (see "Action sheet" below) — flagging this explicitly since
   it's a larger scope than a literal reading of the one-line TODO entry, but
   it's what actually fulfils "long-press/overflow has no touch equivalent"
   rather than leaving everything except rating/favourite still desktop-only.
2. **Rating/favourite has no backend write path for web at all** —
   `usePackageActions.ts`'s `setPackageRating`/`setPackageFavorite` call
   `window.go.main.App.SetPackageRating`/`SetPackageFavorite` directly and
   show `"...available on the desktop app for now"` when `!window.go`. Building
   a mobile long-press entry point that opens a sheet which still can't persist
   anything is a dead end. See "Backend prerequisite" below — this is the one
   non-frontend piece of this spec, included because `TODO.md`'s own phase-2
   entry already commits to it ("ratings are desktop-only until the card
   rework (phase 3) adds the mobile entry point").

## Current state (for reference)

`RatingFavoriteBadge` (local to `PackageCard.tsx`) already renders a passive
pill — heart (if favourited) + star count (if rated) — top-left in grid view,
inline in the header row in list view. It only appears when a rating or
favourite is already set, and is not interactive. `components/ui/RatingStars.tsx`
(shared since phase 1) and the inline rating-row JSX in `ContextMenu.tsx` and
`RightSidebar.tsx` (star row + `Heart` toggle button, duplicated between the
two) are the only places a rating/favourite is actually editable today, and
both are desktop-only (`!isWeb`).

## Component changes

### 1. Extract `RatingFavoriteControl` (new, `components/ui/`)

`ContextMenu.tsx` and `RightSidebar.tsx` each inline the same pattern — a
`RatingStars` row plus a `Heart` toggle button, same sizing conventions, same
"click active star to clear" rule. This phase adds two more sites that need
the identical control (the card's hover row, and the new action sheet) — four
call sites of the same pattern is well past CLAUDE.md's "if you write it
twice, extract it" line (the same reasoning that produced `RatingStars` itself
in phase 1).

```tsx
interface RatingFavoriteControlProps {
  rating: number;
  isFavorite: boolean;
  onRate: (n: number) => void;
  onToggleFavorite: () => void;
  size?: number;        // passed through to RatingStars; Heart matches via size+2
  layout?: 'row' | 'compact'; // 'row': stars + heart with a gap, for menus/sheets
                              // 'compact': tighter gap, for the card overlay
}
```

Internally this is exactly today's `ContextMenu.tsx` rating block (lines
106–123) made reusable, not new behavior: clicking the currently-active star
clears it, the heart toggles. Replace the inline duplicates in `ContextMenu.tsx`
and `RightSidebar.tsx` with this component as part of this phase (don't leave
three copies of the pattern once a fourth and fifth are added).

### 2. `PackageCard.tsx`: badge stays passive at rest; a click opens an interactive popover (revised after live review)

The crossfade-on-card-hover design below shipped exactly as originally
specified and was reviewed live (`wails dev`, real click-through). Two
problems surfaced — neither is a bug, the code matches the spec — that are
UX calls this section now reverses:

1. **The trigger was the whole card, not the rating element.** `group-hover`
   fires from mousing over the thumbnail, the title, or just passing through
   to reach another card — none of which means "I want to rate this." Because
   the interactive layer rendered unconditionally even when nothing was set
   yet (deliberate, per the original spec below), every unrated card in the
   grid — the majority of a typical library — sprouted a 5-star row the
   instant the pointer passed over it. Combined with the card's other hover
   effects already firing at the same time (`hover:scale-[1.02]`,
   `group-hover:scale-110` on the thumbnail, the bottom hint block's
   `h-0 group-hover:h-auto` expansion), the corner control read as one more
   uninvited thing happening at once rather than a deliberate affordance —
   the root of the "invades" feedback.
2. **The interactive layer had no background chrome.** `RatingFavoriteControl`
   renders bare icons with no wrapping pill, while `RatingFavoriteBadge`, the
   status icon, and the mobile overflow button all share the same
   `bg-gray-900/80 backdrop-blur-sm rounded-full border border-gray-700/50`
   treatment. Swapping the badge for the bare control on hover meant the one
   moment the control was visible, it was also the one element on the card
   floating directly on the thumbnail with no grounding background — the
   "layout isn't well distributed" half of the feedback, and a genuine
   inconsistency against every other overlay on this card, not a stylistic
   nitpick.

**Revised decision: decouple the control from card-hover entirely, trigger it
by clicking the badge itself, and stop rendering anything in this corner for
packages with no rating or favourite yet.**

- **Idle state reverts to phase 2's look, verbatim.** `RatingFavoriteBadge`
  renders exactly as before — pill with heart/star, **only when
  `rating || isFavorite`**, nothing otherwise. No hover effect touches this
  corner anymore.
- **The badge becomes the click target when present.** Clicking it
  (`e.stopPropagation()`, same reasoning as before — it's nested in the
  card's own `onClick`) opens a small floating popover anchored just below
  it, containing `RatingFavoriteControl` (`layout="compact"`, `size={14}`),
  wrapped in the *same* pill chrome as the badge
  (`bg-gray-900/95 backdrop-blur-sm rounded-full border border-gray-700/50
  px-2 py-1 shadow-lg`) so the closed and open states read as the same
  object, not an unthemed control replacing a themed one. Close on outside
  click (the `mousedown`-listener idiom `ContextMenu.tsx` already uses) or
  `Escape`.
- **Packages with no rating or favourite get nothing new in this corner.**
  This is the one real functional trade-off against the original brief
  ("a never-rated card can be rated directly from the grid"): there is no
  longer an ambient way to start rating an untouched package from a bare
  hover. The existing right-click `ContextMenu` (desktop) and long-press/
  overflow `ActionSheet` (mobile) already carry the full
  `RatingFavoriteControl` and are both already a direct, on-the-grid action —
  neither requires opening the details panel or selecting the package first.
  Routing the *first* rating through one of those instead of a hover reveal
  removes essentially all of the ambient pop-in for the common case (an
  unrated library) while keeping "rate without leaving the grid" true in
  substance — one explicit click (right-click/long-press) instead of an
  incidental hover.
- This is a different shape from the alternative rejected in the original
  spec below ("a passive pill plus a separate always-present editable layer
  reads as two redundant displays"): the popover is ephemeral and only one
  state is ever on screen at a time (closed pill, or open popover), not a
  second permanent layer competing with the first — so that rejection reason
  doesn't carry over to this design.
- Transition: `AnimatePresence` + a short scale/opacity entrance
  (`initial={{ opacity: 0, scale: 0.9 }}` → `animate={{ opacity: 1, scale: 1
  }}`, ~120ms), matching the `motion.div` idiom the card already uses
  elsewhere rather than introducing a new transition primitive.

List view: same model. The badge sits in the existing
`flex items-center gap-1.5 shrink-0` header cluster; clicking it opens the
same popover (anchored below the cluster, not inline) instead of swapping for
an inline `RatingFavoriteControl` row on hover. This also fixes a second,
list-specific issue found while reviewing this feedback: the previous
`hidden group-hover:block` control sat inline in a fixed-width flex row
alongside the title, status icon, and (on mobile widths) the overflow
button — on hover it had to inject a 5-star-plus-heart block into that same
row, which is exactly the crowding the "layout not well distributed"
complaint describes, independently of the grid-view issue above. Anchoring
the control in a floating popover instead of an inline row removes that
reflow entirely — the header cluster's width is now constant regardless of
state.

Mobile overflow button (`MoreVertical`, `top-2 right-2`, `md:hidden`): no
change needed. It never shared a trigger with the rating corner even before
this revision (`md:hidden` vs. `group-hover`, which doesn't fire on touch),
so it wasn't contributing to "invades" directly — confirmed by re-reading
both conditions side by side. It gains an incidental benefit from this
revision anyway: since the rating control is now click-triggered rather than
hover-triggered, there's no longer a scenario (e.g. a hover-capable
touchscreen tablet at ≥768px width) where a hover-revealed rating row and the
touch-only overflow button could both render at once.

<details>
<summary>Original spec (superseded by the revision above, kept for context)</summary>

Decision on the brief's open question ("badge becomes interactive, or is
joined by a separate layer"): **the existing badge slot becomes interactive
in place, via crossfade — not a second element.** A passive pill plus a
separate always-present editable row in another corner would read as two
redundant rating displays once a rating exists, which cuts against the same
"legibility pass" this phase is supposed to deliver.

Grid view, top-left corner (unchanged position):

```tsx
<div className="absolute top-2 left-2 z-10">
  {/* Passive pill — idle state, hidden entirely on hover */}
  <div className={clsx(
    "transition-opacity duration-150",
    "opacity-100 group-hover:opacity-0 group-hover:pointer-events-none"
  )}>
    <RatingFavoriteBadge rating={pkg.rating} isFavorite={pkg.isFavorite} />
  </div>

  {/* Interactive control — hover only; hover-capable pointers only, via group-hover */}
  <div className={clsx(
    "absolute inset-0 transition-opacity duration-150",
    "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
  )}>
    <RatingFavoriteControl
      rating={pkg.rating ?? 0}
      isFavorite={!!pkg.isFavorite}
      onRate={(n) => { /* stopPropagation, call the same handler ContextMenu uses */ }}
      onToggleFavorite={() => { /* same */ }}
      layout="compact"
      size={14}
    />
  </div>
</div>
```

Notes:
- Both layers occupy the same absolutely-positioned slot (crossfade via
  opacity, not mount/unmount), so there is no layout shift and no element
  jumping between corners depending on state.
- The control renders unconditionally on hover — even with no rating yet — so
  a never-rated card can be rated directly from the grid, not just ones that
  already have a badge to click on. The passive pill still only renders *inside
  its layer* when `rating || isFavorite` (unchanged rule from today), it's just
  that the layer now lives beside a second layer instead of being the only one.
- `onRate`/`onToggleFavorite` must call `e.stopPropagation()` before invoking
  the action — unlike `ContextMenu`/`RightSidebar`, this control is nested
  inside the card's own `onClick` (which selects the package), so an
  unguarded click would both rate *and* select/deselect.
- No new local echo state (`useState` + resync `useEffect`), unlike
  `ContextMenu`/`RightSidebar`'s current pattern. `PackageCard`'s `pkg` prop
  is already the live object — `CardGrid` receives `currentSlice`, sliced from
  `filteredPkgs`, which is a `useMemo` over the live `packages` array
  (`useFilters.ts`) — so `pkg.rating`/`pkg.isFavorite` update in place the
  instant `patchFamily` runs, same as the grid's status icons already do.
  Reading directly off `pkg` is simpler and avoids the staleness bugs this
  session already fixed once in `ContextMenu`/`RightSidebar`.
- Because this relies on `group-hover:`, it naturally never activates on
  touch (no hover event fires) — no JS pointer-type branch needed to suppress
  it there, consistent with how `.group-hover:h-auto` hover-hint block already
  behaves on this card today.

List view: same crossfade, but inline in the existing
`flex items-center gap-1.5 shrink-0` cluster next to the status icon instead
of absolutely positioned (more room, no overlay needed).

</details>

### 3. Mobile overflow entry point (new, on the card)

A persistent round icon button, **not hover-gated**, shown only below `md`
(`md:hidden` — matching the width-based mobile/desktop split already used by
`RightSidebar.tsx`'s `w-full md:w-[35%] md:relative` and `Modal.tsx`'s `full`
size, rather than introducing a new `pointer: coarse` media-query convention
nothing else in the codebase uses):

- Grid view: `absolute top-2 right-2 z-10` (top-left stays reserved for the
  rating/favourite slot above; top-right is free today — the status icon
  lives at the bottom next to the title, not in a corner).
- List view: appended to the same header cluster, after the status icon.
- Same chrome as the existing badge pill: `bg-gray-900/80 backdrop-blur-sm
  rounded-full border border-gray-700/50`, `MoreVertical` icon (`lucide-react`,
  already a dependency), `size={14}`, `p-1.5` (≈32px tap target — matches the
  app's existing icon-button density, e.g. `RightSidebar`'s close button; not
  WCAG's 44px ideal, but consistent rather than introducing a new, larger
  standard only here).
- `onClick`: `e.stopPropagation()`, opens the action sheet (below) for this
  package.
- Always rendered (not conditional on an existing rating), since it's the only
  way to reach *any* package action on mobile — unlike the rating control, it
  can't be hidden when "there's nothing to show."

### 4. Long-press gesture (new hook, `hooks/useLongPress.ts`)

A ~500 ms press-and-hold anywhere on the card also opens the action sheet —
the direct "touch equivalent" the TODO brief calls out as missing. This is a
second entry point to the same sheet, not a separate menu; the overflow
button exists for discoverability (long-press has poor affordance — nothing
on screen suggests you can do it), the gesture exists for users who already
have the "right-click == more options" instinct from desktop/web.

```ts
// Pointer Events, not Touch Events, so it works uniformly; explicitly
// skips mouse/pen so it never fights the existing native contextmenu
// (right-click) handler already wired to the same card.
useLongPress(onLongPress: () => void, options?: { thresholdMs?: number; moveToleranceMs?: number })
  => { onPointerDown, onPointerUp, onPointerMove, onPointerLeave, onPointerCancel }
```

- Ignore `e.pointerType !== 'touch'`.
- Cancel the pending timer if the pointer moves more than ~10px (so a
  scroll/drag on a touch device doesn't accidentally fire it).
- On fire: set a short-lived "suppress next click" flag so the tap's
  subsequent synthetic click doesn't also call `onSelect` immediately after
  the sheet opens.

Wire `onLongPress` through the same prop chain `onContextMenu` already uses
(`PackageCard` → `CardGrid` → `PackageLayout`/`Dashboard`), landing on a new
`handleLongPress` in `useSelection.ts` alongside the existing
`handleContextMenu`.

### 5. Action sheet (new, `components/ui/ActionSheet.tsx`)

A bottom-anchored sheet (slide up, backdrop, portal — reuse `Modal.tsx`'s
body-scroll-lock / Escape-to-close / backdrop-click-to-close idioms rather
than reinventing them) that is the mobile presentation of "what the right-click
menu shows on desktop," for the same package.

Content, top to bottom:

1. Header: package name (truncated), same as `ContextMenu`'s current title row.
2. `RatingFavoriteControl` (`layout="row"`, larger `size` than the card's
   hover row — this is the dedicated touch surface, so it should be easy to
   hit, unlike the compact hover-only card overlay).
3. Divider.
4. The rest of the package actions, as full-width rows (icon + label,
   comfortable row height — this is the one surface in this phase where a
   larger touch target *is* warranted, since it's the sole mobile action
   entry point, not a secondary affordance).

**Don't duplicate the action list.** Extract the action-item data —
`{ key, icon, label, tone?, onClick, hidden? }[]` — out of `ContextMenu.tsx`'s
JSX into a shared `hooks/usePackageActionItems.ts` that takes the same
callbacks `ContextMenu` already receives as props (`onToggle`, `onDelete`,
`onOpenFolder`, etc.) plus `pkg`/`selectedCount`/`isWeb`, and returns the
ordered list with the same conditionals already in `ContextMenu.tsx` (merge
actions only on `isExactDuplicate`, resolve only on `isDuplicate`, folder/copy/
cut hidden when `isWeb`, etc.). `ContextMenu` renders that list as its existing
absolute-positioned popover rows; `ActionSheet` renders the same list as
full-width sheet rows. One source of truth for "what can you do to a
package," two presentations — this is also a first, small step toward the
already-filed `TODO.md` chore *"Unify right-click context menus into one core
system"*, without attempting that item's full scope (which also covers
`Sidebar.tsx`'s separate group-action menu — out of scope here).

State plumbing: generalize `useSelection.ts`'s `contextMenu` state with a
`trigger: 'rightclick' | 'longpress' | 'overflow'` field (or reuse one `open`
flag and a `mode: 'anchored' | 'sheet'` derived from trigger) instead of a
second parallel piece of state — `Dashboard.tsx` renders `<ContextMenu>` or
`<ActionSheet>` off the same state object depending on `mode`.

## Backend prerequisite (flagged, not fully specced here)

This is UI/UX design scope, but the sheet is non-functional for its primary
job (rating/favourite on mobile) without this, and `TODO.md`'s phase-2 entry
already commits to delivering it here. Minimal shape, mirroring the existing
`/api/contents` and `zip-bundling.md`'s `/api/bundle` precedent:

- `POST /api/package-rating` and `POST /api/package-favorite`, authenticated
  via the existing `AuthMiddleware`, body `{ family: string, rating?: number,
  favorite?: boolean }`, calling the same `SetRating`/`SetFavorite` DB methods
  `App.SetPackageRating`/`SetPackageFavorite` already use.
- `usePackageActions.ts`'s `setPackageRating`/`setPackageFavorite` branch on
  `window.go` the same way `RightSidebar.tsx`'s content-fetch already does
  (`fetchWithAuth` fallback), instead of showing the "desktop app for now"
  toast unconditionally when `!window.go`.
- Once this lands, the `!isWeb` gates hiding rating/favourite UI entirely in
  `ContextMenu.tsx` and `RightSidebar.tsx` (comment `#56` in both) should be
  removed — they were correct while there was no write path; they become
  wrong once there is one.
- `Manager.ValidatePath`-style input validation isn't needed here (family is
  an opaque string key, not a filesystem path), but reject empty/malformed
  `family` and out-of-range `rating` (outside 0–5) server-side regardless of
  what the client sends.

Exact route naming/request shape is left to whoever implements this against
current `pkg/server` conventions — flagging the requirement and its shape,
not mandating the final signature.

## Legibility pass

Concrete findings from reading the current component (not a general
typography rewrite — nothing else about the existing title/creator/version
treatment is broken):

- **The hover-only status hint block (`h-0 group-hover:h-auto`, grid view)
  is invisible on mobile today, with no fallback.** It's the only place
  "X Missing," "Duplicate," "Obsolete," "Disabled," and file size render — a
  touch user never sees any of it, since there is no hover event on touch at
  all. This is the same hover-only-on-touch gap this phase is already fixing
  for rating/favourite, found on the same component while doing that work.
  Recommend: below `md`, render this block unconditionally open (`h-auto`,
  no `group-hover:` gate) rather than leaving it hover-only; above `md`, keep
  today's progressive-disclosure behavior unchanged. Flagging this as a
  judgment call rather than deciding it silently — it's a bigger piece of
  "legibility" than spacing/type (it's an information-parity bug across
  platforms), even though it's a natural, narrowly-scoped consequence of
  reworking this exact hover mechanism, not an unrelated addition.
- **New corner elements don't crowd the layout at small grid sizes.** The
  gridSize slider can shrink cards well below their default size, but the
  rating slot and overflow button are both fixed-pixel absolute overlays
  (not scaled with card width), so they stay legible/tappable regardless of
  how small the grid is set — confirmed by inspection, no change needed here.
- No other spacing/typography issues found on this component worth changing;
  the existing `text-sm sm:text-base` title, `line-clamp-2`, and creator/size/
  version row already read fine at both the card's default size and shrunk
  via the grid-size slider.

## Non-goals

- Folding `DependencyRow.tsx`/`DependencyGroup.tsx` into `PackageCard` as a
  third "dependency" layout — that's `sqlite-foundation.md`'s larger
  unification, not asked for by the current `TODO.md` entry; flagged above,
  not attempted here.
- Fully unifying `ContextMenu.tsx` with `Sidebar.tsx`'s bespoke group-action
  menu — the existing `TODO.md` chore item covers that; this phase only
  extracts the *package* action list into something `ActionSheet` can also
  consume, which is a subset of that chore, not the whole thing.
- Keyboard/screen-reader accessibility for card interactions in general.
  Cards are plain `div`s with no `tabIndex`/`role`, so hover-only and
  long-press affordances are both already inaccessible to keyboard-only users
  today, independent of this phase. Not fixed here — flagged as a pre-existing
  gap for a future pass, not newly introduced by this spec.
- License badges — `ratings-favorites.md` scopes those to the details panel
  only; nothing here changes that.
- Any change to the search/filter sidebar, searchbar, or `search:`/`tag:`
  handling.

## Open questions to confirm before implementation

1. **Roadmap text** ("Roadmap conflict to resolve" above): confirm this spec's
   direction (rating/favourite stay on the card, interactively) is correct,
   so `sqlite-foundation.md`/`ratings-favorites.md` can be updated to match
   rather than left contradicting shipped code.
2. **Backend scope**: should the `/api/package-rating`/`/api/package-favorite`
   endpoints ship as part of this same phase/PR (as `TODO.md`'s phase-2 entry
   implies), or should the frontend entry point ship first with the existing
   "desktop app for now" toast still showing on mobile, as a separate
   follow-up? Shipping the sheet without the backend means mobile gets a
   working *actions* menu (enable/disable, delete, download, etc. — real,
   immediate value) but rating/favourite inside it still no-ops with a toast,
   same as today.
3. **`ActionSheet` accessibility**: `Modal.tsx` (the closest existing
   precedent) has no `role="dialog"`/`aria-modal` today. Add them on the new
   component anyway (cheap, nothing to regress since it's new), or match
   `Modal.tsx` exactly for consistency and address both together later?
4. **Sheet row touch-target height**: no existing component sets a hard
   minimum (e.g. 44px) for tappable rows; this spec recommends "comfortable,"
   larger than the card's compact hover row, but doesn't mandate an exact
   value. Pick one during implementation and keep it consistent across all
   sheet rows.

## Test impact

- `Sidebar.webHidesRating.test.tsx`/any test asserting the `#56` `!isWeb`
  gate on rating/favourite UI will need updating once the backend prerequisite
  lands and those gates are removed from `ContextMenu.tsx`/`RightSidebar.tsx`.
- New: `useLongPress` threshold/cancel-on-move behavior, `usePackageActionItems`
  conditional list construction (mirroring whatever coverage `ContextMenu`
  already has for its conditional rows, if any), `ActionSheet` open/close and
  backdrop-dismiss.
- `PackageCard` rating badge: renders nothing when unrated/unfavourited,
  renders the pill when either is set, click opens the popover, outside-click
  and `Escape` close it, `stopPropagation` prevents the click from also
  selecting the card (grid + list). Mobile-overflow-button rendering per
  breakpoint is unaffected by this revision and keeps its existing coverage.
