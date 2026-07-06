# Localization (i18n)

> **Status:** 🗄️ Backlog · **Horizon:** Later · **Targets:** 2.0.
> [Roadmap index](../ROADMAP.md) · **Spec:** [design/localization.md](../design/localization.md).

Community-translatable UI, with languages compiled into the portable binary and live
switching (no restart).

## Delivers

- Translation layer backed by embedded CSV locales and a frontend i18n context,
  falling back to English.
- Language selector in Settings → Appearance that re-renders live.
- Contribution workflow: translators edit values only, keys freeze once published,
  and missing keys never crash the app.

Format, embedding, and key-lifecycle rules are in the [spec](../design/localization.md).
