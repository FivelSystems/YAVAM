# YAVAM Roadmap

> The living index for YAVAM's future. Items are sorted into three horizons —
> **Now / Next / Later** — plus **Ideas**, and each links to a per-capability file.
> Forward-looking ideas and plans live here; `TODO.md` is only for tasks doable today.
>
> Baseline v1.3.19 → milestone `2.0`. Last updated: 2026-07-03.

## Status legend

Every capability carries a status, shown in its header and the tables below:

| | Status | Meaning |
|---|---|---|
| ✅ | **Done** | Released; see the CHANGELOG. |
| 🔨 | **Building** | Actively in progress. |
| 📋 | **Todo** | Committed, not started. |
| 🗄️ | **Backlog** | Planned, unscheduled. |
| 💡 | **Idea** | Unshaped; not yet a commitment. |
| 🗑️ | **Discarded** | Considered and dropped. |

## How this roadmap works

- **Capabilities, not numbered phases.** Each item has a stable, descriptive
  filename (`search.md`, `pockets.md`) — never a sequence number — so priority can
  change without renaming files or breaking links.
- **Horizons carry ordering; status carries progress.** The horizon (Now/Next/Later)
  is *when* we intend to work on it; the status is *how far along* it is. Items flow
  **Later → Next → Now**, and land in **Shipped** as ✅ Done.
- **Milestones are tags.** `Targets: 2.0` says which release an item aims at. `2.0`
  means "the vision is substantially delivered," not "a fixed list is done." Post-2.0
  work gets a new file and a horizon slot — the roadmap never dead-ends.
- **Off-roadmap work is first-class.** Anything never in the 2.0 vision (update
  channels, bug waves, one-offs) lives in these same horizons.

## Now — actively building

| Status | Capability | Targets | Notes |
|---|---|---|---|
| 🔨 | [SQLite foundation + card rework](roadmap/sqlite-foundation.md) | 2.0 | Foundational. Finishing the P0 regression below. |
| 🔨 | Update channels (Stable/Unstable) | — | Off-roadmap; landed on `main`, verifying. See [RELEASING.md](RELEASING.md). |

## Next

| Status | Capability | Targets | Notes |
|---|---|---|---|
| 📋 | [Smart search + sidebar redesign](roadmap/search.md) | 2.0 | Highest-value layer on the DB; searchbar first, then creator view. |
| 📋 | [Favourites, ratings, license filter](roadmap/ratings-favorites.md) | 2.0 | Thin layer on the same DB. |

## Later

| Status | Capability | Targets | Notes |
|---|---|---|---|
| 🗄️ | [Advanced library management](roadmap/library-management.md) | 2.0 | Security-sensitive; needs a review. |
| 🗄️ | [Pocket system + action modal](roadmap/pockets.md) | 2.0 | Centralises every bulk action; high risk. |
| 🗄️ | [Hub integration + Discover + Cleanup](roadmap/hub-cleanup.md) | 2.0 | Builds on pockets. |
| 🗄️ | [Localization (i18n)](roadmap/localization.md) | 2.0 | Embedded community translations. |
| 🗄️ | [Appearance & themes](roadmap/theming.md) | 2.0 | Bounded `--yavam-*` whitelist. |
| 🗄️ | [Modular layout + split view + graph](roadmap/workspace.md) | 2.0 | Capstone; desktop-only. |

## Ideas

| Status | Idea | Notes |
|---|---|---|
| 💡 | [Zip bundling](design/zip-bundling.md) | On-ramp to pockets (shares the closure-and-stream core). Promote to **Next** once the sub-dependency fix lands. |

## Shipped

| Status | What | Where |
|---|---|---|
| ✅ | Immediate fixes (1.3.19) — bulk-op per-item results, reliable `RestartApp()`, dependency-row context menu (#29), image carousel (#27), `CTRL+C` file copy (#35), model completeness | [CHANGELOG.md](../CHANGELOG.md) |
| ✅ | Project docs & branching — Conventional Branch adopted | [BRANCHING.md](BRANCHING.md), [RELEASING.md](RELEASING.md), [WORKFLOWS.md](WORKFLOWS.md) |

## 🟡 P0 — Finish the SQLite foundation (regression)

**Status:** 🔨 substantially done, on `feat/sqlite-read-path`.

The SQLite migration regressed core behaviour, blocking everything built on it.
Data-model detail is in [design/database-schema.md](design/database-schema.md).

1. **Dependencies never written** → ✅ Fixed, then redesigned for
   [#45](https://github.com/FivelSystems/YAVAM/issues/45). The scan persists the
   graph (`persistDependencies` in
   [scan_orchestrator.go](../pkg/services/library/scan_orchestrator.go)),
   **family-anchored** (migration v3): edges store `dependency_family`
   (`creator.name`), not the versioned string — VaM deps use `.latest`/pinned
   versions that rarely match the installed copy, which is why reverse "used by" was
   empty. Resolution is cross-library
   ([dependency_graph.go](../pkg/services/library/dependency_graph.go)).
2. **Frontend looked empty** (read path half-migrated) → ✅ Fixed.
   `GetCachedPackages` ([read.go](../pkg/services/library/read.go)) rebuilds packages
   and dependency maps from the index via the same `LinkPass` a live scan uses. The
   grid paints cache-first, then a launch scan revalidates against disk; deleted
   files prune on `scan:complete`.
3. **Library path casing inconsistent** → ✅ Fixed via one canonical-path helper
   ([utils.CanonPath](../pkg/utils/path.go)) and a `path_norm` column (migration v2),
   so the matching key can never drift from display casing.

**Remaining:** manual in-app verification (cache-first paint, deletion pruning,
casing-variant libraries — the #45 "used by" fix is verified live); optionally extend
cache-first to web mode (`/api/packages`), today desktop-only.

## Milestone: 2.0

`2.0` is delivered when the capabilities tagged `Targets: 2.0` are substantially in
users' hands. Versioning stays decoupled from horizons: a minor bump ships a
capability set, a patch ships fixes. Nothing here pre-commits a capability to a fixed
version number.
