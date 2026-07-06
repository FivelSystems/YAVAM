# Design: Internationalisation (i18n)

> **Status:** Design — not yet implemented.
> **Roadmap:** [Localization](../roadmap/localization.md).

## Architecture

- Translations are CSV files (`locales/en.csv`, `locales/zh.csv`, …) with two
  columns: `key,value`.
- `//go:embed locales/*.csv` in `pkg/i18n/` compiles every language into the
  binary — no external files to ship.
- A frontend i18n React context resolves keys; the active language is stored in
  `localStorage`, falling back to `en`.
- Changing language re-renders immediately (no restart).
- Key naming is dotted and hierarchical: `sidebar.status.enabled`,
  `modal.pocket.button.submit`, `search.syntax.hint`.

## Adding a language

1. Copy `en.csv` → `xx.csv`.
2. Translate the value column only — never change keys.
3. Add the locale to the Settings → Appearance language selector.
4. Rebuild; the locale embeds automatically.
5. CI is unaffected — CSVs are static assets and the binary signature is unchanged.

## Key-lifecycle rules

- Every new user-visible string must have a key in `en.csv` before its change
  merges. Hardcoded strings are treated as defects.
- When a key is added to `en.csv`, the same key is added to every other locale with
  an `[UNTRANSLATED]` placeholder value, so the app never crashes on a missing key.
- Keys are frozen once published; community translators edit only the value column.

## Escaping in values

No HTML in values. Use `{count}`, `{name}` for placeholders; double a brace (`{{`)
to emit a literal brace.
