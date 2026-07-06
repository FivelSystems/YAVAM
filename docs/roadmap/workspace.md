# Modular layout + split view + dependency graph

> **Status:** 🗄️ Backlog · **Horizon:** Later · **Targets:** 2.0 (capstone) · **Risk:** high.
> [Roadmap index](../ROADMAP.md).

Turn the fixed desktop layout into a user-arrangeable workspace, add an optional
side-by-side split view, and provide a dependency graph.

## Delivers

- **Modular layout.** Named panel types (library grid, right sidebar, pocket, graph,
  discover, cleanup) arranged by the user; the layout tree is persisted.
- **Split view.** Optional mode with two library grids side by side, each with its
  own active library (same library allowed in both, for comparing filters).
  Drag-and-drop between panels opens the pocket modal pre-set to install.
  Single-panel stays the default; split is never permanent.
- **Dependency graph.** Pannable, zoomable, viewport-virtualised for large
  libraries; nodes are dependency-layout cards, edges colour-coded by resolution
  state (resolved / missing / circular).

## Mobile is excluded

Modular layout, docking, and split view are **desktop-only** — not shimmed onto
mobile. Mobile keeps its fixed single-panel layout (library grid + right sidebar), a
bottom action bar in place of the icon sidebar, and search/filter via that bar. All
library actions stay available there.
