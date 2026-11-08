# Design: Scan-aware grid

> **Status:** Draft. Open questions are listed at the end and are unresolved.

Scope: how the package grid behaves while a library scan is running. The grid
shows a stable layout from the first moment, and card animation reflects scan
state only. Touches `CardGrid.tsx`, `PackageCard.tsx`, `PackageSkeleton.tsx`,
`usePackages.ts`, `useFilters.ts`, `FilterContext.tsx`, and later the scan
events in the backend.

## Goals

1. **Determinism.** A package appears in its final slot. A package that is
   newly scanned or discovered never moves a package that is already placed.
   Slots fill top-to-bottom, left-to-right, in the user's sort order and filters.
2. **No decorative motion.** Animation only communicates scan state on a card.
   Data already known from the SQLite cache renders final, without animation.
3. **Mobile first and cheap.** CSS-only, visible page only, honours
   `prefers-reduced-motion`, honours the privacy toggles (names are content).

## Current behaviour (problems)

- `usePackages` paints the cache first, then merges `package:discovered`
  (Light Pass), `package:scanned` (Hard Pass) and one `scan:analysis:complete`
  batch (Link Pass). Every merge replaces `packages`, and `useFilters` re-sorts
  and re-filters the whole list, so discovered rows land at arbitrary positions
  and shift existing ones.
- `CardGrid` wraps every item in a `motion.div` that fades and slides in
  (`hidden` to `visible`) on every mount, including page changes and cache rows.
  This is the decorative animation and it conflicts with goal 2.
- `PackageSkeleton` exists but is not rendered anywhere. `PackageCard` handles
  `scanPhase === 'discovered'` ad hoc with a "..." placeholder.
- Sort modes today are `name`, `size` and `date` only. All three derive from
  enumeration data (file name, size, mtime), with `filePath` as tie-breaker.
  Sort therefore never depends on content that needs identification. Only
  filters can (search tokens such as `type:`, `tag:`, `status:`, and sidebar
  category, creator and status filters).

## Card state model

One derived value, `cardState`, computed by a pure helper next to
`getPackageStatus` in `features/library/utils.ts`. Components never branch on
`scanPhase` directly.

| State | Meaning | Shows | Maps to today |
| --- | --- | --- | --- |
| `reserved` | Slot is known, nothing about the package is | Empty card shell, no text, no pulse beyond a single low-contrast shimmer | New. Backend ordered keys exist, row not yet received |
| `listed` | Enumerated: path, size, mtime, and name, creator, version parsed from the file name | Name, creator, version, size. Thumbnail area empty (shimmer) | `scanPhase: 'discovered'` |
| `identified` | Archive opened: `meta.json`, categories, tags, thumbnail availability | Thumbnail (when present), type badge, remaining details. No shimmer | `scanPhase: 'scanned'` and `hasThumbnail` resolved |
| `linked` | Dependency, duplicate and obsolescence analysis applied | Status tint and badges | `scanPhase: 'analyzed'` |
| `settled` | Cache row, or scan finished for this row | Final card | `scanPhase: 'analyzed'` from cache |
| `failed` | Open or parse error (corrupt archive, unreadable file) | Name from file name, corrupt status badge, no shimmer | `isCorrupt` |

Rules:

- `settled` and `linked` render identically. The distinction exists only so the
  transition `identified` to `linked` can add badges without moving anything.
  If this proves unnecessary, the two collapse into one.
- Transitions are forward-only per scan: `reserved`, `listed`, `identified`,
  `linked`. A cache row starts at `settled` and a re-scan that confirms
  identical data keeps it there (the existing `pkgSignature` check already
  skips no-op merges).
- Each transition is one opacity change (about 150 ms) on the content that
  appeared, never on the card box. Card dimensions are fixed in `reserved`, so
  nothing reflows.
- `hasThumbnail` stays a content flag. The thumbnail shimmer shows only while
  `cardState` is `listed`. After `identified`, no thumbnail means the existing
  "no image" placeholder, not a loading state.
- Privacy: with names hidden, `listed` renders the existing masked name. The
  shimmer shows in the same place so state is still visible without exposing
  content. Thumbnails stay blurred or censored per the existing toggles, and
  the shimmer never reveals a thumbnail early.

## Slot and ordering contract

For the grid to reserve every slot before identification, the backend must
provide, once enumeration completes (or in streamed chunks plus a final count):

- `totalCount` of packages in the library.
- The **ordered keys** (`filePath`) for the active sort mode, using the same
  comparator as the frontend, including the `filePath` tie-breaker.

Because every current sort mode depends only on enumeration data, the order
is final at that point and cannot change during identification. The frontend
therefore does not need to re-sort on `package:scanned` events: rows are
looked up by key into a fixed slot array.

Filtering splits into two classes:

- **Enumeration-knowable**: free-text name or creator, size, and anything
  answered by SQLite for already-cached files (rating, favourite, category,
  tags). Slot membership is final.
- **Identification-dependent**: category, tags, license, status for a file that
  is new or whose mtime or size changed since it was cached. Membership is
  unknown until `identified` (or `linked` for status).

Until the backend contract exists, the frontend prototype derives the order
from rows already received. That can only be deterministic in the cases below
(see "Implementation plan").

## New-packages affordance

Problem: a new or changed file whose filter membership depends on unidentified
content cannot be given a slot. Slotting it live would move placed packages
(or require guessing).

Alternatives evaluated:

| Option | Determinism | Cost to the user | Verdict |
| --- | --- | --- | --- |
| Live reflow when identified | Violates goal 1 | Cards jump while browsing | Rejected |
| Insert only below the visible viewport | Preserves visible positions, but not page positions and page counts, and "visible" is fragile on mobile (viewport resizes, URL bar) | Hidden surprises, scroll anchoring bugs | Rejected |
| Pinned pending row at the top | Deterministic, but occupies the first slots, pushes everything down by a row, and breaks "slots fill top-left" | Constant layout shift on every scan | Rejected |
| **"N new packages" affordance, applied on user action** | Deterministic. The grid is only reordered by an explicit action | One tap, easy to ignore | **Recommended** |

Recommended behaviour:

- Pending files (new or changed, and whose filter or sort membership is not yet
  decidable) are held out of the grid. A compact banner in the toolbar area
  reads "N new packages" with an action "Show" and a dismiss control. It is
  sticky above the grid on mobile, in-flow on desktop, and never overlays cards.
- The count updates in place. It is announced politely to assistive tech
  (see Accessibility).
- Activating the action merges the pending files and re-computes the slots once.
  Scroll position is preserved by key: the first visible card stays in view
  when it still exists, else the page resets to the first page (existing
  `clampPage` rule).
- Files that turn out, once identified, to not match the active filter are
  dropped silently from the count. Files that do match remain counted. A file
  that is merely new with no active filter and a name-based sort is
  enumeration-knowable and is **not** held: it gets its slot only at the next
  slot computation, which is also the user's action or the next library load.
  In other words the affordance covers every addition made during an active
  view, not only identification-dependent ones (see open question 2).
- On the next library load or manual re-scan, pending files are already part
  of the baseline, so the affordance starts at zero.

## Behaviour by event

- **Page change.** Rows already in the cache or already `identified` render
  final immediately with no animation, because the card mounts in its final
  state. The existing `SetCurrentPage` priority call is kept so the backend
  identifies the page being viewed first. Cards on the new page that are still
  `listed` show the thumbnail shimmer only.
- **Library switch.** The grid is replaced, not morphed. Slots come from the new
  library's cache when present, else from `reserved` cards sized by `totalCount`
  as soon as it is known. Events from the previous scan are ignored, using the
  existing session id.
- **Re-scan, unchanged data.** Cache rows stay `settled` and nothing animates.
  Only files whose size or mtime changed go back through `listed`, in place.
- **Cancel.** Cards keep their last state. `reserved` and `listed` cards stop
  shimmering (no state is ever animated without an active scan), and the
  toolbar indicates the scan was cancelled. A later scan resumes forward.
- **Errors and corrupt files.** `failed` is terminal for the scan. The card shows
  the file-name-derived name and the corrupt status, with no shimmer. A
  scan-level error (`scan:error`) stops all shimmer and shows the existing
  error surface, with remaining `reserved` cards removed rather than left
  empty.
- **Deleted files.** Removed from the slot array at `scan:complete`, which is
  the existing prune step. This is the one case where placed packages move.
  It is acceptable because it is not a discovery event, and it is applied with
  the same affordance when the view is active (see open question 3).

## Implementation notes (CSS and performance)

- Shimmer is a single CSS `@keyframes` on a shared class, applied only when
  `cardState` is `reserved` or `listed` and a scan is active. No animation
  libraries. Remove the `motion.div` per-item fade in `CardGrid` entirely.
  This is consistent with the Performance Constraints in the frontend
  architecture doc (no per-item layout animation on large grids).
- Only the current page renders, and `content-visibility: auto` is not needed
  at the existing page sizes. Shimmer is further limited to cards in the
  viewport through the existing `isVisible` signal.
- `@media (prefers-reduced-motion: reduce)`: no shimmer and no opacity
  transitions. States are conveyed by static treatment (muted text colour for
  `listed`, empty area for `reserved`).
- Reuse `PackageSkeleton` for `reserved` (extend it, do not add a second
  skeleton). Check `components/ui/` before adding any new primitive; no new
  pattern is expected. The banner can reuse the existing Toast/alert styling
  or a small inline strip if no existing component fits.
- Grid and list modes both need the states. The list row has less room, so
  `listed` shows name and creator only, and size appears at `identified`.

## Accessibility

- A card in `reserved` is `aria-hidden` and not focusable. From `listed` on it
  is a normal focusable card, so keyboard order follows slot order and never
  changes as states advance.
- Shimmer is decorative. The scan state is also exposed as text for assistive
  tech: a single `role="status"` region ("Scanning, 1,240 of 3,000 identified"),
  throttled so it does not announce per card. It is polite, not assertive.
- The "N new packages" banner is a `role="status"` region with a real button.
  The count change is announced politely and throttled.
- Touch targets in the banner are at least 44 px. Contrast of the muted `listed`
  text meets AA, since the information is real.
- Reduced-motion users get the same information with no animation (above).

## Implementation plan

Small, independently shippable steps.

1. **Remove the decorative fade.** Delete the per-item `motion` fade in
   `CardGrid`. Cache rows and page changes mount final. Smallest change that
   satisfies the cache-no-animation requirement.
2. **`cardState` helper and tests.** Pure function from `scanPhase`,
   `isCorrupt` and `hasThumbnail`, with unit tests for each row of the table.
3. **Card states in `PackageCard`.** Replace ad hoc `scanPhase` checks with
   `cardState`. Add the shared shimmer class and the reduced-motion rule.
   Render `listed` with name, creator and version, and a shimmering thumbnail.
4. **Frontend-only ordering prototype.** In `usePackages`, stop re-sorting on
   every merge: keep rows in a stable order array and append later arrivals
   rather than re-sort while a scan is active, then settle at `scan:complete`.
   This is deterministic for a cache-seeded library. For a cold library, order
   is only final once enumeration completes, so the prototype shows `listed`
   cards after enumeration and defers the grid until then. Limitation:
   it does not satisfy goal 1 for cold libraries, and this step exists to
   validate the card states and the hook structure.
5. **"N new packages" affordance.** Hold files that appear after the baseline
   during an active view. Add the banner and the apply action, including
   scroll preservation by key.
6. **Backend contract.** Emit `scan:slots` (total and ordered keys for the
   active sort) at the end of enumeration, before identification. Add the
   events or fields needed for `reserved`. Keep the existing events as the
   `listed` and `identified` sources. Add Go tests on ordering parity with the
   frontend comparator.
7. **Reserved cards and the status region.** Render `reserved` cards from the
   slot array and add the polite status region.
8. **Sort and filter parity.** Share the comparator definition between backend
   and frontend (single source, tested), and move enumeration-knowable filters
   to the slot computation.

## Open questions

1. **Backend stages.** Issue 135 and issue 136 were not available to the author
   of this draft. The stage names (enumeration, identification, linking) and the
   `scan:*` events above are taken from the current code. The contract in step 6
   needs to be reconciled with the issues before implementation.
2. **Scope of the affordance.** Should it cover only identification-dependent
   additions, or every file added while a view is open (including ones with a
   known slot)? The second is simpler to explain and fully deterministic, at
   the cost of holding back files that could be placed.
3. **Deletions.** Should files removed from disk during a scan be removed live
   (positions shift) or collected into a "N removed" counterpart to the banner?
4. **Cold libraries.** On a first scan with no cache there is nothing to
   display until enumeration finishes. Is a full-grid wait (progress bar only)
   acceptable, or is a partial display with a known-incomplete order desired?
5. **Order authority.** Should the backend compute the ordered keys (requires
   every sort and filter in Go), or only supply enumeration data and let the
   frontend compute slots once enumeration completes? The latter avoids
   duplicating comparators but cannot reserve slots earlier than the last
   enumeration batch.
6. **`settled` versus `linked`.** Is the visual distinction worth keeping?
7. **Hidden-name mode.** Should state shimmer remain visible when names are
   hidden, or should the card stay entirely neutral to avoid hinting at content?
8. **Sort extensions.** Future sorts by rating, favourite, or category change
   the analysis above for content-dependent keys. Are they in scope for the
   same ordering contract?
