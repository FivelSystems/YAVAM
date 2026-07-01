# YAVAM Roadmap

> **Living overview.** The detailed per-phase vision (specs, schema, UI) lives in
> [roadmap/YAVAM-2.0-vision.md](roadmap/YAVAM-2.0-vision.md). This file is the
> current, reprioritized plan and status — update it as things ship.
>
> Last updated: 2026-07-01

## Status snapshot

**Last released version: 1.3.19.** 1.4.0 is **in development** (Unstable channel
only) — nothing below is shipped to Stable users yet.

| Phase (vision) | Theme | Status |
| --- | --- | --- |
| 1 | Immediate fixes | ✅ Released (1.3.19) |
| 2 | SQLite foundation + card rework | 🚧 **In progress (1.4.0-dev)** — incomplete, see below |
| — | **Update channels (Stable/Unstable)** | 🚧 In progress (1.4.0-dev) — *not originally in the roadmap* |
| 3 | Advanced library management | ⏳ Not started |
| 4 | Smart search + sidebar redesign | ⏳ Not started — **priority raised (see below)** |
| 5 | Favorites / ratings / license filter | ⏳ Not started |
| 6 | Pocket system + action modal | ⏳ Not started |
| 7 | Hub integration + cleanup view | ⏳ Not started |
| 8–10 | i18n, themes, modular/split/graph | ⏳ Not started |

### Landed on `main` this session (unreleased, part of 1.4.0-dev)
- SQLite core: `pkg/database` with schema + append-only migrations; libraries
  mirrored from `config.json`; packages indexed on scan. **(incomplete — see P0)**
- **Update channels** — Stable/Unstable selector, channel-aware updater with full
  SemVer (incl. pre-release) comparison. See [RELEASING.md](RELEASING.md).
- Project docs: [BRANCHING.md](BRANCHING.md), [RELEASING.md](RELEASING.md),
  [WORKFLOWS.md](WORKFLOWS.md), [CLAUDE.md](../CLAUDE.md),
  [.github/CONTRIBUTING.md](../.github/CONTRIBUTING.md); Conventional Branch adopted.

## 🟡 P0 — Finish Phase 2 (regression) — **substantially done, on `feat/sqlite-read-path`**

The SQLite migration regressed core behavior. This blocked everything above it in
the value chain (search, cleanup, pocket all depend on reliable package +
dependency data). Original diagnosis and the fixes applied this session:

1. ~~**The `dependencies` table is never written.**~~ ✅ **Fixed, then redesigned
   for [#45](https://github.com/FivelSystems/YAVAM/issues/45).** The scan persists
   the dependency graph (`persistDependencies` in
   [scan_orchestrator.go](../pkg/services/library/scan_orchestrator.go)), scoped by
   dependent key so re-scanning one library refreshes only its edges. Crucially the
   graph is now **family-anchored** (migration v3): edges store `dependency_family`
   (`creator.name`) as the matching key, not the versioned string — because VaM
   deps use `.latest`/pinned versions that rarely match the installed copy, which
   is exactly why reverse "used by" was empty. Resolution is **cross-library and
   derived globally** (`DependencyGraph`/`AnalyzePackages` in
   [dependency_graph.go](../pkg/services/library/dependency_graph.go)): a dep is
   satisfied iff any package of that family exists in any library, and "used by"
   spans libraries. `LinkPass` keeps duplicate/obsolete detection.
2. ~~**Frontend looks empty/missing** (read path half-migrated).~~ ✅ **Fixed.**
   The read path is wired: `GetCachedPackages`
   ([read.go](../pkg/services/library/read.go)) reconstructs the package list from
   the index, rebuilds each package's dependency map from the persisted graph, and
   runs the **same `LinkPass`** a live scan uses — so the cached view's analysis is
   identical to a fresh scan. The grid is painted **cache-first**, then a launch
   scan **revalidates** against disk (chosen model: cache-first + rescan-on-launch);
   files deleted since the last scan are pruned on `scan:complete`.
3. ~~**Library path casing is inconsistent**, breaking the library↔package
   association.~~ ✅ **Fixed.** A single canonical-path helper
   ([utils.CanonPath](../pkg/utils/path.go)) is now the one definition of "same
   path"; `Manager.ValidatePath` and the DB layer both call it. `libraries.path`
   keeps its original display casing; a new `path_norm` column (migration v2) is the
   case-insensitive matching key, backfilled/deduped in Go on open
   (`reconcilePathNorm`) so it can never drift from lookups.

**Remaining before calling Phase 2 fully closed:**
- Manual verification in the running app (cache-first paint, deletion pruning,
  casing-variant libraries). ✅ Dependency "used by" fix (#45) **verified live in the
  app by the user** — works well.
- ✅ `referencedBy`/`obsoletedBy` now carried by `models.VarPackage`, so the cached
  view has them too.
- Optional: extend cache-first to **web mode** (`/api/packages`); today it's
  desktop-only (guarded by `window.go`).

## My perspective (what you asked)

**Versioning is artificial.** Mapping phases 1→10 onto `1.4.0, 1.4.5, 1.5.0 … 2.0.0`
pre-commits version numbers to work that hasn't happened. Recommendation: **decouple
versions from phases.** A version is just what ships — minor bump for a feature set,
patch for fixes. Keep phases as a *priority-ordered backlog*, and let `2.0.0` mean
"the vision is substantially delivered," not "phase 10."

**Priority order is off — here's the reorder I'd make:**
1. **Finish Phase 2 (P0 above).** Non-negotiable; the foundation is currently broken.
2. **Phase 4 — Smart search (raised, per your call).** Once package + dependency data
   is reliable, search is the highest user-value feature and it sits directly on that
   foundation. Bring it *ahead* of Phase 3 (library management) and Phase 5
   (ratings/favorites). Suggest splitting it: **4a smart searchbar** (tokens, filters)
   first — high value, self-contained — then **4b sidebar redesign / creator view**.
   - **Idea (captured, not scheduled):** now that #45 is fixed, the details panel's
     **"Needs" and "Used By" lists can get large** — a package can have dozens of
     dependents. Each list wants its own **filter/search field** (and likely
     count + collapse). Good fit for 4b (sidebar redesign); the data is already
     indexed by family, so filtering is cheap.
3. Phase 5 (ratings/favorites/license) — small, rides on the same DB, good quick wins.
4. Phase 3 (library management) — valuable but heavier and security-sensitive.
5. Phases 6–10 as before.

Rationale: search and ratings are *thin* layers on a solid data model and deliver
visible value fast; library-management and pocket are *thick* and can wait until the
foundation is proven. Do the boring foundational fix first, then the fun search work
lands on something trustworthy — "more accurate, faster, reliable than before," which
is exactly the goal.
