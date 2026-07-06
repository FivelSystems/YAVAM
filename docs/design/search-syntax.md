# Design: Tokenised search syntax

> **Status:** Design — not yet implemented.
> **Roadmap:** [Smart search](../roadmap/search.md).

The smart searchbar parses a space-separated list of tokens. Combining rule:
**different token types are AND-ed; multiple tokens of the same type are OR-ed.**

## Operators

```
token              → AND (must match)
+token             → OR  (at least one of the +group must match)
-token             → NOT (exclude)
```

## Token types

```
status:enabled     status:disabled  status:missing  status:corrupt  status:standalone
status:hidden      status:visible
creator:acidbubbles
type:scene
tag:dress
license:cc-by      license:pc       license:pc-ea
rating:>=4
favorite:true
size:>500mb        size:10mb..100mb
```

- `tag:` is available through search only; there is no dedicated tag sidebar
  section.
- `size:` supports a single bound (`size:>100mb`) or a range (`size:10mb..500mb`).
- `status:standalone` narrows to standalone packages even when the dependency
  visibility mode is `all`.

## Examples

```
creator:callimohu type:scene                      → both must match (AND)
creator:callimohu +creator:picovam -status:corrupt → either creator, not corrupt
tag:dress +tag:clothing license:cc-by             → dress OR clothing, AND cc-by
favorite:true rating:>=3                          → favourite AND rated 3+
```

## Free-text words

A bareword with no `field:` prefix is free text, matched as a substring against
the package name, package title, and creator. Multiple free-text words are AND-ed
(a search box is expected to treat `red dress` as "both", not "either").

Free-text words always sort to the **end** of the query, after the field tokens,
and are grouped together regardless of typing order:

```
type:scene red creator:shaper dress → type:scene creator:shaper red dress
```

## Structured tokens vs. plain text (chips)

The searchbar is a hybrid, not an all-chips box:

- **`field:value` tokens become chips.** Completing a structured token — by
  Space after `creator:shaper`, Enter, or picking it from autocomplete — lifts it
  out of the input into a removable chip.
- **Plain text stays in the input.** Barewords are never chipped; they remain
  editable text at the end of the bar and filter live as typed, like a normal
  search field. (They still sort after the field tokens in the serialised query.)

Backspace on an empty input removes the last chip.

## The sidebar composes the same query

The left sidebar is not a parallel filter system: clicking a status facet, a
creator, or a category toggles the corresponding `status:` / `creator:` / `type:`
token in the one query the searchbar owns. A facet reads as active when its token
is present, and facets stack (two creators OR together, matching the same-field
rule). "All Packages" clears the `status:` tokens. This keeps a single source of
truth — whatever the sidebar highlights is visible as chips in the bar and vice
versa.

## Autocomplete

The searchbar suggests as you type. A bareword offers field completions
(`cr` → `creator:`) and **implicit value matches across every value field** —
typing `shap` surfaces `creator:shaper`, `scen` surfaces `type:scene`, `dress`
surfaces `tag:dress` — so a field prefix is never required to reach a value.
After a `field:` prefix, only that field's values are suggested.

**Nothing is preselected.** No suggestion is highlighted by default, so pressing
Enter or Space keeps the word as plain text; a `creator:`/`type:`/`tag:` filter is
applied only when the user deliberately arrows to a suggestion or clicks it. A
normal text search is therefore never hijacked into a tag filter by accident.
Tags are the lowest-priority value pool.

## Future operators (not yet implemented)

`^` (intersect) — a binary set operator that keeps only packages present on **both**
sides, matched by package identity (`creator.name.version`) rather than by row:

```
library:first_library ^ library:second_library   → packages in both libraries
```

Unlike `+`/`-`, which test one row, `^` groups matches by identity across its two
operands and returns the overlap — the natural way to surface the same package
installed in more than one library. It generalises to any field but only pays off
where an identity can appear on both sides. It depends on the `library:` token,
which itself waits on the scan/validation rework that switching libraries needs.

## Not-yet-backed tokens

`rating:`, `favorite:`, and `license:` are parsed and shown as chips but do not
filter until the ratings/favourites data layer exists; they are inert no-ops
until then. `status:standalone`, `status:hidden`, and `status:visible` likewise
wait on the dependency-visibility mode.

## Related: dependency-visibility mode

Which packages the grid shows is governed by a separate top-toolbar dropdown
(stored in `localStorage`, a per-client preference — not a search token):

| Mode | Label | Behaviour |
|---|---|---|
| `auto` | `Packages (auto)` | **Default.** Standalone only; auto-expands to all packages while the searchbar has input or any filter is active, then reverts. |
| `packages` | `Packages` | Always standalone only; never auto-expands. |
| `all` | `All packages` | Always everything, including dependencies. |

When `auto` has auto-expanded, the label reads `Packages (auto) — expanded` so the
user knows why more rows appeared. A deliberate switch to `packages` or `all` is
never overridden silently.
