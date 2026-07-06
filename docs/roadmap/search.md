# Smart search + left sidebar redesign

> **Status:** 📋 Todo · **Horizon:** Next · **Targets:** 2.0 · **Depends on:** [SQLite foundation](sqlite-foundation.md).
> [Roadmap index](../ROADMAP.md) · **Spec:** [design/search-syntax.md](../design/search-syntax.md).

The highest-value layer on the DB. Ships in two parts: the **searchbar** first,
then the **sidebar / creator view**.

## Delivers

- Tokenised searchbar with autocomplete (grammar in the
  [spec](../design/search-syntax.md)).
- Icon-only left sidebar with drag-to-reorder icons (order persisted in the DB).
- Tags moved into search (`tag:dress`); no separate tag section.
- Size, license, and multi-select filters plus a "reset all" control.
- **Creator view:** a grid of square `CreatorCard`s (own component, never a
  `PackageCard` variant), each a 2×2 thumbnail quadrant that cycles on hover and
  drills into that creator's packages.
- Dependency-visibility dropdown (`auto` / `packages` / `all`).

## Captured idea (unscheduled)

With reverse "used by" fixed, the details panel's "Needs" / "Used By" lists can grow
large — each could get its own filter field, count, and collapse. Fits the sidebar
half; data is already indexed by family, so filtering is cheap.
