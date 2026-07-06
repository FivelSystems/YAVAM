# Pocket system + unified action modal

> **Status:** 🗄️ Backlog · **Horizon:** Later · **Targets:** 2.0 · **Risk:** high.
> [Roadmap index](../ROADMAP.md) · **Spec:** [design/pocket-system.md](../design/pocket-system.md).

Replace scattered bulk actions with one model: a **pocket** (a curated set of
packages plus optional dependencies) and a single modal where every bulk operation
is configured, reviewed, and executed. One confirmation surface for enable, disable,
delete, install, uninstall, and (web-only) download.

[Zip bundling](../design/zip-bundling.md) is the on-ramp — it shares the
closure-and-stream core a pocket download reuses.

## Delivers

- A session-scoped pocket holding anything from one package to whole libraries,
  without loading it all into memory.
- The unified action modal: mode dropdown, Include-dependencies toggle,
  mode-specific options, and a colour-coded preview of exactly what will happen.
- Remappable hotkeys, and a context-menu bridge that turns right-click actions into
  "configure and open the modal" shortcuts rather than direct executions.

Storage model, deduplication, modal layout, and hotkeys are in the
[spec](../design/pocket-system.md).
