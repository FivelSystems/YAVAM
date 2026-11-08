# Pagination footer

> **Status:** Draft

UX specification for the pagination footer of the package grid, covering the
desktop app and the mobile web client. Tracks issue #65. Out-of-range pages
(#137) are already fixed and only re-verified here.

Implementation lives in `frontend/src/components/common/Pagination.tsx`, the
footer wrapper in `frontend/src/features/layout/PackageLayout.tsx`, and page
state in `frontend/src/context/FilterContext.tsx` (helpers in
`frontend/src/utils/pagination.ts`).

This document is a design only. Open decisions are listed as options with a
recommendation; none is decided.

## 1. Current behaviour

- The footer renders only when `filteredPkgs.length > itemsPerPage`. `Pagination`
  also returns `null` when there is a single page, so the two guards agree.
- Controls: first, previous, next, last (icon-only, `w-8 h-8` = 32 px), plus up to
  9 numbered buttons with `...` gaps on screens at or above the `sm` breakpoint.
  Below `sm` the numbers are hidden and a `current / total` text is shown.
- The footer is `absolute bottom-0` over the scroll container. The container
  reserves space with a fixed `pb-32 md:pb-24`, regardless of whether the footer
  is present.
- Keyboard: `prev_page` / `next_page` keybinds exist (`SelectionContext`). The
  footer itself has no keyboard or ARIA semantics beyond native `<button>`.
- Page state: `requestedPage` is stored, `currentPage` is derived with
  `clampPage` on every render. Page resets to 1 when the search query or the
  page size changes.

## 2. Findings

### 2.1 Out-of-range page (#137) — verified fixed, with caveats

`clampPage(requestedPage, filteredPkgs.length, itemsPerPage)` is applied during
render, so any change that shrinks the filtered list or enlarges the page size
yields a valid page in the same frame. Covered inputs:

| Trigger | Mechanism | Result |
| --- | --- | --- |
| Search / token filters | `searchQuery` effect resets to page 1, clamp as backstop | OK |
| Page-size change | explicit reset to 1 | OK |
| Sort change | no reset; list length unchanged | OK (stays on same page number) |
| Library switch | list length changes, clamp only | Valid, but see below |
| Package removal / scan shrinking the list | clamp | Valid, but see below |

Caveats (behavioural, not out-of-range):

- The clamp writes the clamped value back into state
  (`if (currentPage !== requestedPage) setCurrentPage(currentPage)`). A
  transient empty or short list (for example while a scan holds results) therefore
  permanently loses the user's page, rather than restoring it once the list
  grows back. Needs confirmation in a live scan before being treated as a defect.
- Switching library does not reset to page 1; it keeps the previous page number
  when the new library is large enough. Whether this is wanted is a preference
  (see section 4.9).

### 2.2 Concrete defects (verified in code)

| # | Defect | Evidence |
| --- | --- | --- |
| D1 | Touch targets are 32 px on mobile, above the WCAG 2.2 AA minimum (24 px) but below the 44 px (WCAG 2.5.5 AAA) / 48 dp touch guidance; adjacent buttons have only a 4 px gap | `w-8 h-8`, `gap-1` in `Pagination.tsx` |
| D2 | Icon-only buttons are labelled with `title` only, which is not reliably exposed on touch or to screen readers; no `aria-label` | `Pagination.tsx` |
| D3 | The current page is signalled by colour only; no `aria-current="page"` | `renderPageButton` |
| D4 | No `<nav>` landmark or accessible name for the control group | root `div` |
| D5 | Strings are hard-coded English and not shared with other UI copy | `title="First Page"` etc. |
| D6 | Scroll container reserves `pb-32 md:pb-24` even when the footer is absent (single page), leaving 96-128 px of dead space under the grid | `PackageLayout.tsx` |
| D7 | The reserved padding is a magic number, not tied to the footer's real height; any change in footer height (larger touch targets, safe-area inset) silently re-introduces overlap | `PackageLayout.tsx` |
| D8 | No bottom safe-area handling in the footer (home-indicator devices) | footer wrapper has `p-3` only |
| D9 | `...` gaps are plain text, not controls; with 9 visible pages, reaching a distant page requires many clicks | `Pagination.tsx` |
| D10 | Stale comments in the component and layout (`Hide on Mobile if needed`, scroll comments) contradict the code | `Pagination.tsx`, `PackageLayout.tsx` |

D1 and D6/D7 are the ones that affect mobile directly. D2-D4 are accessibility
gaps with no design dependency.

### 2.3 Preferences (not defects)

| # | Observation | Why it is a preference |
| --- | --- | --- |
| P1 | Show the item range ("51-100 of 1,234") | Information gain, no current failure |
| P2 | Mobile shows only `n / total`, no numbered buttons | Intentional; a design choice to revisit |
| P3 | Footer hides entirely on a single page | Valid either way (section 4.4) |
| P4 | Overlay footer with blur vs. a docked footer | Both work if the padding is correct |
| P5 | Page resets on library switch | Behaviour choice (section 4.9) |
| P6 | Jump-to-page input | New capability |

Each item of issue #65 should be mapped onto D1-D10 / P1-P6 when the issue is
triaged; items that match neither are new findings.

## 3. Reuse check

Existing primitives in `frontend/src/components/ui/`:

- `Button` — has `sm` (h-8) / `md` (h-10) / `lg` (h-12) sizes and a focus ring.
  The pagination buttons re-implement the same look by hand. Recommended: use
  `Button` (`variant="secondary"`, with a new icon-only size, see 4.1) instead of
  a new button pattern.
- `Input` — reusable for a jump-to-page field.
- `ActionSheet` — existing mobile bottom-sheet pattern, candidate for the mobile
  jump-to-page.
- `AnchoredMenu` / `FilterDropdown` — candidate for the desktop popover.
- `Modal` — fallback only; heavy for a one-field interaction.
- `Pagination` currently sits in `components/common/`, not `components/ui/`.
  Recommended to stay where it is (it is feature-specific), but it should
  compose the `ui/` primitives.

No new visual pattern is required for any proposal below.

## 4. Proposal and open decisions

### 4.1 Touch targets — DECIDED (B)

Targets must be at least 44 px on touch viewports. Desktop may stay compact.

| Option | Description | Tradeoffs |
| --- | --- | --- |
| A | 44 px square on all viewports | Simple, one code path; footer grows 12 px on desktop |
| B | 44 px below `md`, 32 px at `md` and above | Keeps desktop density; two sizes to maintain, uses breakpoint classes only |
| C | 48 px below `md`, 32 px above | Matches Material 48 dp; footer taller on small phones, more grid hidden |

Recommendation: **B**. The app is first-class on mobile (project rule) and the
desktop footer is already tuned; a breakpoint switch costs one class pair. Spacing
between targets at least 8 px on touch.

Mobile control set: previous, next, and a central page indicator that is itself a
button (4.5). First/last are optional on mobile and can move into the jump
control.

### 4.2 Current page and total clarity

- Always expose `Page N of M` in text, on every viewport. Desktop keeps the
  numbered buttons; the text sits on the side or in a visually-hidden live region.
- Use `aria-current="page"` on the active number, and a distinct non-colour
  indicator (for example a ring or bold weight) in addition to the fill.
- Replace the `/` shorthand on mobile by `N of M` when width allows; keep
  `N / M` as the narrow fallback.

### 4.3 Item range — DECIDED (A)

Show "51-100 of 1,234" using the filtered count (the same number that drives
paging). Use locale-aware number formatting.

| Option | Description | Tradeoffs |
| --- | --- | --- |
| A | Range inside the footer, desktop only | Zero mobile cost; mobile users lose the information |
| B | Range inside the footer on all viewports, stacked above controls on mobile | Information everywhere; footer height +16-20 px, interacts with 4.7 |
| C | Range in the toolbar/header, not the footer | Footer stays slim; range is far from the control it describes |

Recommendation: **A** for the first iteration, because it adds no footer height on
mobile, plus the `N of M` text from 4.2. Revisit B once the footer height is
tokenised (4.7).

### 4.4 Single-page state — DECIDED (A)

| Option | Description | Tradeoffs |
| --- | --- | --- |
| A | Hide the footer (current) | Maximum space; page-size and count information vanish |
| B | Show a slim count-only footer ("Showing all 37 items") | Consistent anchor; consumes a row on every small library |
| C | Hide the footer, show the count in the toolbar | Space preserved; depends on 4.3 option C |

Recommendation: **A**, but remove the unconditional bottom padding when the footer
is absent (defect D6).

### 4.5 Jump-to-page — DECIDED (desktop A, mobile A)

Needed because 9 numbered buttons plus first/last cannot reach an arbitrary page
in a large library (defect D9).

Desktop:

| Option | Description | Tradeoffs |
| --- | --- | --- |
| A | Make the `...` gap a button opening a popover with a number `Input` | Discoverable where the gap is; uses `AnchoredMenu` + `Input` |
| B | Persistent small "Go to" input in the footer | Always visible; permanently uses footer width |
| C | Click the `N of M` text to turn it into an inline input | Compact; low discoverability |

Mobile:

| Option | Description | Tradeoffs |
| --- | --- | --- |
| A | Tap the `N of M` indicator to open an `ActionSheet` with a numeric input and a slider | Reuses existing sheet; thumb-friendly, supports coarse scrubbing |
| B | Native `<input type="number" inputmode="numeric">` inline | Simple; keyboard covers the footer |
| C | No jump on mobile | Cheapest; large libraries stay painful |

Decision: desktop **A**, mobile **A**, confirmed by the maintainer. Both are triggered by an element the
user is already looking at, and both reuse existing primitives. Validation: clamp
with `clampPage`, accept Enter to confirm, Escape to cancel, no error state needed
because out-of-range input clamps.

### 4.6 Keyboard and ARIA

Not decision-dependent; recommended as-is.

- Wrap in `<nav aria-label="Pagination">`.
- Every icon button gets an `aria-label` ("First page", "Previous page", ...) and
  keeps `title` for pointer hover.
- Active page: `aria-current="page"`. Disabled controls use `disabled` (already),
  never `aria-disabled` on a still-focusable element.
- Announce page changes with a polite live region ("Page 3 of 12").
- Visible `focus-visible` ring consistent with `Button`.
- Existing `prev_page` / `next_page` keybinds stay; add Home/End only if no
  conflict with grid navigation, otherwise leave to a later pass.
- After a page change the scroll container already scrolls to top; focus should
  stay on the activated control (no focus theft).
- Strings move to the shared copy location used by other UI text.

### 4.7 Footer and grid overlap — DECIDED (B, with constraints)

Decided by the maintainer: option B, with these constraints. The footer must work
on desktop and mobile, sit in the same place on every viewport, and never be
affected by the grid items (no overlap, no shifting with row count or scroll).
The result must look finished, not improvised.

Defects D6-D8. The footer overlays the grid with a blur. The fixed `pb-32/pb-24`
is a guess.

| Option | Description | Tradeoffs |
| --- | --- | --- |
| A | Keep absolute footer; apply bottom padding only when the footer renders, sized from a single named constant (footer height + safe-area inset) | Smallest change; the constant must be kept in sync with the footer |
| B | Make the footer a normal flex child below the scroll container | No overlap possible, no constant; loses the blur-over-content look, grid area is slightly smaller |
| C | Absolute footer, height measured with `ResizeObserver` and exposed as a CSS variable | Always correct; more machinery for a static value |

Recommendation: **B**. It removes the entire class of overlap defects (D6, D7),
the layout already is a flex column, and a docked footer is the more predictable
mobile pattern. If the overlay look is valued, **A** is the fallback.
Independent of the option, add `env(safe-area-inset-bottom)` to the footer
padding (D8) and keep the footer at `z-20` below modals and menus.

### 4.8 Mobile viewport checks

Acceptance must be checked at 320, 360, 390 and 768 px widths, in portrait and
landscape, with the on-screen keyboard open for the jump control. The details
panel (right sidebar) narrows the grid area on desktop; the footer must follow the
grid width, not the window width (it does today because it is inside the grid
column).

### 4.9 Page on library switch — DECIDED (reset to 1 via page-intent reducer)

Decided by the maintainer: reset to page 1 on library switch, implemented through
the page-intent reducer described below so that locate-in-another-library keeps
priority. It may ship as a separate change from the visual redesign.

| Option | Description | Tradeoffs |
| --- | --- | --- |
| A | Reset to page 1 on library switch | Predictable; loses place when toggling back and forth |
| B | Keep the number, clamp (current) | Accidental landing mid-list in an unrelated library |
| C | Remember last page per library for the session | Best continuity; extra state |

Recommendation: **A** (simple, expected). **C** is a candidate if users switch
libraries frequently.

Constraint: any reset must not conflict with locate-package-in-another-library, which
switches library and lands on the page that contains the target package. The
interaction (event ordering, the clamp writing state back, the target list possibly
not yet loaded) is more involved than it looks and needs an architecture review
before implementation. Until then this section stays open.

Architecture review findings (recommended shape adopted):

- A reactive reset on `activeLibraryPath` only coexists with locate through async
  ordering, and fails with nested libraries (the stale list matches first).
- The clamp writes back to state: while the grid is held (cold library),
  `filteredPkgs` is empty, so any target page is clamped to 1 and stored. Locate
  already lands on page 1 in that case, with no reset involved.
- Recommended shape: a single page-intent state in `FilterContext` (reducer with
  `goToPage`, `locate`, `libraryChanged`, `searchChanged`) where a pending locate
  outranks a reset, which outranks the clamp. A locate resolves to a page only once
  the view is settled for the target library (needs a `loadedLibraryPath` from
  `usePackages`). The clamp must not write back while a locate is pending or the
  grid is held. Pure helpers live in `utils/pagination.ts`.
- Related existing defects, out of scope for this section and candidates for
  separate issues: locate drops to page 1 when it has to clear the search; locate
  on a cold library lands on page 1; the target page is computed on a different
  list than the one displayed; a pending locate is never cleared if the package
  never appears; a duplicated sort in `Dashboard.tsx`; dead `useNavigation.ts`.

## 5. Fit with #64 (paging / lazy-load) — PENDING

> **PENDING.** Not specified. Depends on whether #64 keeps client-side slicing of
> the full filtered list, moves to server-side pages, or replaces pages with
> incremental loading. The item range (4.3), the `N of M` text (4.2) and the page
> prioritisation hook in `FilterContext` all assume a known total count and
> client-side slicing. To be written once #64's direction is set.

## 6. Behaviour while the library scans — PENDING

> **PENDING.** Not specified. Open questions: whether the total and page count may
> change under the user's feet while results are held back (`pendingCount`), whether
> the footer should show a "results still loading" hint, and whether the clamp
> should stop overwriting the requested page during a scan (see caveat in 2.1). To
> be written after the scan-hold behaviour is reviewed live.

## 7. Acceptance criteria (for the decided parts only)

- All pagination controls are at least 44 px with at least 8 px spacing at widths
  below `md` (if 4.1 B is adopted).
- Every control has an accessible name; the active page exposes
  `aria-current="page"`; the group is a labelled `nav`.
- With a single page, no space is reserved under the grid.
- The last grid row is never covered by the footer at 320-768 px widths and with
  the details panel open.
- Page remains valid after every trigger in table 2.1; existing tests in
  `FilterContext.test.tsx` keep passing.
- Existing `ui/` primitives are used; no new button pattern is introduced.

## 8. Handoff

Implementation is frontend-only. Sections 4.1 and 4.3-4.7 are decided and
ready to implement; 4.9 is decided and needs the architecture-reviewed reducer;
sections 5 and 6 wait for their prerequisites.
