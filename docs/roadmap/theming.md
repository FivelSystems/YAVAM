# Appearance & theme system

> **Status:** 🗄️ Backlog · **Horizon:** Later · **Targets:** 2.0.
> [Roadmap index](../ROADMAP.md) · **Spec:** [design/theming.md](../design/theming.md).

Restyle YAVAM through a safe, bounded set of colour variables, with built-in themes
and community theme files — no arbitrary CSS injection.

## Delivers

- Theming expressed entirely through a fixed `--yavam-*` custom-property whitelist.
- Built-in themes: Dark (default), AMOLED, Light, Catppuccin Mocha, Catppuccin
  Latte, Base16 Ocean.
- External community `.css` files, from which **only** recognised `--yavam-*`
  definitions are extracted and applied — everything else is ignored, so a theme
  file cannot inject arbitrary styles.

Full property list and the external-file safety model are in the
[spec](../design/theming.md).
