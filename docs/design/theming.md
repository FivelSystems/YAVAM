# Design: Appearance & theme system

> **Status:** Design — not yet implemented.
> **Roadmap:** [Theming](../roadmap/theming.md).

Themes are expressed entirely through a fixed whitelist of `--yavam-*` CSS custom
properties. This keeps theming safe (no arbitrary CSS injection) and forward
compatible.

## Custom property whitelist

```css
/* Backgrounds */
--yavam-bg-primary          --yavam-bg-secondary
--yavam-bg-card             --yavam-bg-modal

/* Accents */
--yavam-accent              --yavam-accent-secondary

/* Text */
--yavam-text-primary        --yavam-text-secondary
--yavam-text-muted

/* Package card state tints */
--yavam-card-enabled        --yavam-card-disabled
--yavam-card-corrupt        --yavam-card-missing-deps
--yavam-card-duplicate      --yavam-card-obsolete
--yavam-card-standalone     /* "Standalone" in UI; internal code: isOrphan */

/* UI chrome */
--yavam-creator-label-bg    --yavam-sidebar-icon-active
--yavam-pocket-badge        --yavam-scrollbar
--yavam-border
```

## Built-in themes

Dark (default), AMOLED, Light, Catppuccin Mocha, Catppuccin Latte, Base16 Ocean.

## External theme files — safety model

A community `.css` file (Catppuccin, Base16, etc.) may be loaded, but **only its
`--yavam-*` variable definitions are extracted** and applied via
`element.style.setProperty()`. Any other CSS in the file is ignored, so an external
theme cannot inject arbitrary styles or selectors. The whitelist above is the
complete set of properties a theme can influence.

## Storage

Active theme name → `localStorage` (per-device). Custom CSS file path → `ui_layout`
DB table.
