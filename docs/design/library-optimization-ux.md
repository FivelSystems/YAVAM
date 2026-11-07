# Design: Library optimization flow (copy, previews, review)

> **Status:** Draft — open questions listed at the end; runs in parallel with an
> `architect` review of the same files for backend correctness (issue #86).

Scope: `frontend/src/features/settings/OptimizationModal.tsx` and
`OptimizationProgressModal.tsx` — the "merge duplicates / resolve version
conflicts" flow reachable from the sidebar ("Resolve All") and from a single
package's context menu ("Resolve conflicts"). This spec covers copy, the
estimate-vs-confirmed distinction, large-library browsing/undo UX, and a
secondary styling finding. It does not redesign *(a)* the backend execution
logic in `usePackageActions.ts` — that is `architect`'s side of this review —
or *(b)* fold this flow into the future Pockets system
(`docs/roadmap/pockets.md`, Later horizon, not started).

## Why this is wrong today (confirmed, not my finding — context for the rest of this doc)

Every destructive action in this flow — "Merge Duplicates", "Keep Latest
(DELETE Others)" in the Resolution Strategy dropdown — ends up calling
`DeleteFileToRecycleBin` / `window.go.main.App.DeleteFileToRecycleBin`
(`usePackageActions.ts`, `handleConfirmOptimization`). There is no code path in
this flow that performs a true permanent delete. Two consequences the copy
must stop misrepresenting:

1. **"DELETE permanently" / "PERMANENTLY DELETE" is false.** Everything this
   modal does is recoverable from the Windows Recycle Bin until the user empties
   it (manually, today — outside the app).
2. **The savings counter is an estimate, not a result.** `potentialMergeSavings`
   / `potentialVersionSavings` / `totalExpectedSavings` sum the size of files
   that are *about to be sent to the Recycle Bin*. On NTFS, a file in the
   Recycle Bin still occupies the same volume — the number shown pre-operation
   is not freed space, and nothing today re-measures the disk afterward to
   report what was *actually* freed. `OptimizationProgressModal`'s "Disk
   Cleaned" stat (`spaceSaved`) is the same sum carried forward, not a
   verification — it inherits the same inaccuracy post-operation, which is how
   the external user's report ("promised space didn't match reality") happened.

The rest of this document is the honest version of this flow, built around
those two facts.

## 1. Copy rewrite — per strategy and in the review tab

Ground rules for every string below:
- Never say "permanently" about a Recycle Bin operation. Say what's actually
  true: **recoverable** (goes to the Recycle Bin, can be restored) vs. the one
  action that is genuinely **not recoverable** (emptying the Recycle Bin,
  §2).
- Don't manufacture false comfort either — "safe" is the wrong word for an
  operation on 10k+ files the user can't fully preview today. Say exactly what
  will happen and where to check it, and let the preview (§3) carry the
  reassurance instead of adjectives.
- Replace the dropdown's ALL-CAPS ("DELETE Others") — caps read as alarm, not
  information, and train the user to tune out emphasis. Use a small
  **Recoverable** / **Not undoable from inside YAVAM** tag instead (visual
  design in §4).

### Resolution Strategy dropdown (`OptimizationModal.tsx` ~line 192)

| Value | Current label | New label |
|---|---|---|
| `latest` | Keep Latest (Disable Others) | Keep latest, disable the rest |
| `delete-older` | Keep Latest (DELETE Others) | Keep latest, **send the rest to Recycle Bin** |
| `manual` | Manual Selection | Choose per package |
| `none` | Do Nothing | Don't touch versions |

### Strategy explainer box (~line 199-208, the `AlertTriangle` panel)

Replace the icon+copy per strategy. Keep the box, drop the implied urgency
color for non-destructive strategies (amber/red reserved for the one genuinely
destructive choice — see §4):

- **`latest`**: *"Older versions stay on disk but disabled — YAVAM won't load
  them. Nothing is deleted or moved. Re-enable any of them later from the
  package itself."*
- **`delete-older`**: *"Older versions are sent to the Windows Recycle Bin.
  They stop counting toward enabled content immediately, but the disk space
  isn't freed until the Recycle Bin is emptied — which YAVAM does not do
  automatically. You can restore any of them from the Recycle Bin until then."*
- **`manual`**: *"Pick which version to keep for each package below. Versions
  you don't select are disabled, not deleted."*
- **`none`**: *"No version changes. Duplicates (above) are unaffected by this
  setting."*

### `renderVersionPreview()` header (~line 82)

- `delete-older` → was *"Versions to be DELETED:"* → **"Versions to be sent to
  Recycle Bin:"**
- `latest` → was *"Versions to be DISABLED:"* → unchanged, already accurate.

### Merge Duplicates panel (~line 160)

Was: *"will be moved to the Recycle Bin. One copy of each will be preserved in
the root."* — already accurate; keep as the template for the rest. Only
change: make clear this is the same Recycle Bin, not a separate "merge trash",
so the user builds one mental model for the whole flow: *"…will be moved to
the Recycle Bin (same one `delete-older` uses below) — recoverable until it's
emptied."*

### Review tab summary (~line 263-273)

Was:
```
- Disable older versions, keeping only the latest.
- PERMANENTLY DELETE older versions, keeping only the latest.
```
New:
```
- Merge N duplicate files to the Recycle Bin, keeping one copy of each.
- Send N older versions to the Recycle Bin, keeping only the latest.
  (Recoverable from the Recycle Bin — see "What happens to space" below.)
```
Directly beneath the bullet list, add a one-line, non-collapsible note (not
another alert box — this is informational, not a warning):

> *Estimated space to reclaim: **{formatBytes(totalExpectedSavings)}**. This
> counts files headed to the Recycle Bin — actual free disk space won't change
> until it's emptied. YAVAM will show you the real number after this
> finishes.*

This directly replaces the current "Confirm Optimization (X GB)" framing,
which states the estimate as if it were the result (§2 covers the button
label itself).

## 2. Estimated vs. confirmed savings — the core fix

### Before the operation (`OptimizationModal.tsx`)

Rename every occurrence of "savings"/"Save X" in the pre-operation UI to make
clear it's a forecast, not a receipt:
- `"Save {formatBytes(totalExpectedSavings)}"` (review tab header, ~line 246)
  → `"~{formatBytes(totalExpectedSavings)} queued for Recycle Bin"`.
- `"Confirm Optimization (X GB)"` button (~line 278) →
  `"Confirm — send ~{formatBytes(totalExpectedSavings)} to Recycle Bin"`.
  The `~` is load-bearing: it's doing in one character what the copy above
  does in a sentence, and it should appear everywhere a number like this is
  shown pre-operation.

### After the operation (`OptimizationProgressModal.tsx`)

This is the part that needs an actual behavior change, not just copy, to stop
being misleading — flagging it here because it changes what data the modal
needs, even though implementing it is `web-developer`'s / `architect`'s job:

1. **Snapshot real free space before the run.** The backend already exposes
   `GetDiskSpace(path) → { free, total, totalFree }`
   (`pkg/services/system/system.go`, already wired into Wails bindings and
   used today in `UploadModal.tsx` / `InstallPackageModal.tsx` for pre-flight
   checks — this is not new plumbing, just a new call site). Call it once when
   `OptimizationModal` opens and again when `OptimizationProgressModal` reaches
   `completed`. Call it a third time if the user opts into "empty Recycle Bin
   now" (below), after that step.
2. **Show three numbers, clearly separated, once completed**, instead of the
   single "Disk Cleaned" stat:
   - **Sent to Recycle Bin**: sum of file sizes processed (what today's
     `spaceSaved` already is) — keep this number, just relabel it. It's useful
     on its own merit (confirms *how much got moved*), just not as "freed".
   - **Free space before → after this run**: the `GetDiskSpace` delta. This
     will normally read **~0 GB** right after the run (expected and correct,
     since the Recycle Bin held the files) — the copy must say so explicitly,
     or the user will read "0 GB freed" as a failure:
     *"Free space didn't change yet — that's expected, the files are in the
     Recycle Bin. Empty it below to actually reclaim the space."*
   - **If "empty Recycle Bin now" was used** (see below): a final, real
     "Space freed: X GB" line from the post-empty `GetDiskSpace` delta — this
     is the only number in the whole flow allowed to claim actual space was
     freed, because it is the only one checked against the disk.
3. Rename the stat card from "Disk Cleaned" to **"Sent to Recycle Bin"**
   (icon can stay `HardDrive`), and only show a "Disk Cleaned" figure once it
   is the verified post-empty number.

### Optional, explicit, opt-in: "Empty Recycle Bin now"

Add this as a new, clearly separate step **only reachable from
`OptimizationProgressModal` once `completed === true`** — never bundled into
the main confirm action, and never defaulted on:

- A secondary button, visually distinct from "Okay, Close" (outline/ghost
  style, not the primary blue fill) — e.g. **"Empty Recycle Bin & verify space
  freed"** — with its own confirmation step (reuse the existing confirm
  pattern from `DeletePackageModal.tsx`'s "Force Delete" styling: red fill,
  explicit copy), because this is the one action in the entire flow that is
  genuinely irreversible:
  *"This permanently deletes everything currently in the Windows Recycle Bin —
  not just what YAVAM just sent there. This cannot be undone. Continue?"*
  That caveat ("not just what YAVAM just sent there") is necessary: the
  Recycle Bin is shared OS state, the user may have unrelated files in it, and
  the copy must not imply this only touches YAVAM's own output.
- This requires a new backend call (`SHEmptyRecycleBinW` or equivalent) that
  does not exist in `pkg/fs` today — noting for `architect`/`web-developer`,
  not implementing here.
- If the user skips this (closes with "Okay, Close" instead), nothing is lost
  — the Recycle Bin stays as the durable "undo" record described in §3.

## 3. Large-library UX (10k+ packages, near-full disk)

### Full affected-file list, not just the truncated preview

`max-h-40` / `max-h-60` previews (`OptimizationModal.tsx` lines 80, 163, 215)
are fine as an *inline glance*, but on a 10k+ library "merge 340 duplicates
across 90 groups" currently has no way to see the full list before
committing — the user has to trust a scrollable 160px box. Add an explicit
**"View all N files"** link/button next to each preview header that opens a
full list in `size="lg"` (reuse `components/ui/Modal.tsx`, see §4) with:
- Search/filter-as-you-type across the list (plain substring match on package
  name — no need for the full tokenised search syntax here).
- Grouped by package identity (creator + name), matching how the data is
  already structured in `mergePlan`/`resolveGroups` — don't re-flatten it.
- Each row shows the path, size, and version, so "what exactly is going to
  Recycle Bin" is answerable before confirming, not after.

### A dry-run / preview-only mode

Given the user's genuine fear of data loss and their explicit avoidance of
destructive actions so far, the **first time** this modal is opened (or behind
a persistent "Preview mode" toggle `localStorage`-backed, per-device per the
project's settings-split convention), default to a **review-only** state: the
"Confirm" button is replaced with **"This is a preview — nothing has been
touched. Exit preview to enable Confirm."** and a toggle to leave preview mode.
This turns "I'm scared to click the real button" into "I can look at exactly
what would happen, as many times as I want, before the button exists." Once
the user has completed a real run at least once, this can stop being the
default — forcing it every time would turn into friction for an experienced
user.

### Progress and the ability to stop

`OptimizationProgressModal` already shows a running total (`current`/`total`)
but no cancel — for a 10k+ library, a batch of "resolve all" conflicts could
be hundreds of operations and the user has no way to stop midway if they
notice something wrong in file 12 of 400. Add a **"Stop after current file"**
button during the run (not an abrupt cancel — in-flight file-system calls
shouldn't be aborted mid-write): it sets a flag the loop checks between
iterations, and the completed screen distinguishes *"Stopped early by you
(N/400 processed)"* from *"Completed (400/400)"* so it's clear partial runs
aren't silently reported as full successes.

### An undoable record of what moved

Today, once `OptimizationProgressModal` closes, there is no durable list of
*which specific files* this run sent to the Recycle Bin — if the user later
notices something is missing, they're searching the Recycle Bin by eye among
everything else in it. Add a **"Copy list of moved files"** action on the
completed screen (plain text, one path per line — cheap to build from data
the hook already has in `deletedPaths`) so the user has an external record to
search the Recycle Bin against, or to hand to `architect`/support if something
needs restoring. This is a low-effort, high-trust addition: it costs one
button and a clipboard write, and it's the kind of "at least I can check"
affordance that matters most to a user who has been avoiding this feature out
of fear.

### Visual distinction: reversible vs. not

See §4 for the concrete tokens — the point here is the principle: today every
destructive-sounding string gets the same `AlertTriangle` + ambiguous color.
After this rewrite there are exactly two tiers, and they must look
different everywhere they appear (dropdown tag, explainer box, review bullet,
confirm button):
- **Reversible** (disable, Recycle Bin): neutral/blue, informational icon.
- **Not undoable from inside YAVAM** (emptying the Recycle Bin only): red/amber,
  warning icon, always paired with an explicit extra confirmation step.

## 4. Secondary finding: component reuse, not a theming-tokens gap

The task brief frames this as "hardcoded Tailwind vs. the `--yavam-*` theming
variables the rest of the reworked UI already adopted." Checked
`docs/design/theming.md` / `docs/roadmap/theming.md` before acting on that:
theming is still **🗄️ Backlog / Later / "not yet implemented"** — a repo-wide
grep for `yavam-bg`, `yavam-accent`, `yavam-text` returns zero matches
anywhere in `frontend/src`. No component has migrated to theme tokens yet, so
there's nothing to be inconsistent *with* on that front yet, and migrating
just this modal ahead of the rest of the app would be premature (and the
wrong layer to decide that in a UX spec for one feature).

The real, smaller inconsistency: `OptimizationModal.tsx` and
`OptimizationProgressModal.tsx` each hand-roll their own modal shell
(`fixed inset-0 z-[100] ... bg-black/60 backdrop-blur-sm`, its own
`motion.div` enter/exit, its own close-on-backdrop handling) instead of using
the shared `components/ui/Modal.tsx` primitive that the rest of the reworked UI
uses. That primitive already provides, for free: the mobile-responsive `full`
size variant (fullscreen on phone widths, centered dialog on desktop —
directly relevant since this app is also a mobile web client), Escape-to-close,
body-scroll lock, and a consistent header/footer slot. Recommend both files
adopt `<Modal>` (size `lg` for `OptimizationModal`'s multi-tab body, `sm` for
the progress modal) rather than re-centering raw hardcoded colors — this is
the DRY/component-reuse fix the project's conventions call for, not a
theming-token migration.

## 5. Flow/structure — kept, not redesigned

The three-tab accordion (Merge → Versions → Review) is sound and shouldn't
change shape: it already matches the backend's two independent passes (merge
then version-resolve), keeps each decision scoped to one screen's worth of
information, and the Review tab correctly surfaces a single combined
confirmation point. The changes above are content and detail density within
that structure (copy, a details-drilldown, a dry-run gate, an opt-in
Recycle-Bin-empty step), not a re-architecture of the tabs. If `architect`'s
parallel review surfaces a reason the merge/resolve passes need to become a
single combined plan (e.g. ordering bugs between the two), that would be the
trigger to revisit tab structure — out of scope here absent that.

## Open questions (for `architect` / before `web-developer` implements)

1. Does `GetDiskSpace`'s before/after delta stay reliable when other
   processes write to the same volume during a long batch run (10k+ library)?
   If not, the "didn't change yet, that's expected" copy in §2 needs a caveat
   for "or something else changed space on this disk during the run" —
   `architect`'s call on how noisy that is in practice.
2. `SHEmptyRecycleBinW` (or equivalent) doesn't exist in `pkg/fs` yet — new
   backend surface, needs its own security/permissions look (it's a
   system-wide, not YAVAM-scoped, irreversible action) before `web-developer`
   wires the button in §2.
3. The dry-run/preview-mode default (§3) needs a decision on where its
   persistent flag lives — `localStorage` (view preference) fits the project's
   settings split, but flagging since "have you done a real run before" is
   arguably host-level state (`config.json`) if the intent is "trust bar, not
   per-device preference." Leaning `localStorage` since it's about this
   browser/device session's comfort level, not the library itself, but this is
   a product call worth confirming before implementation.
