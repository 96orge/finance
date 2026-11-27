---
name: brand
description: "Brand colours and fonts for Steady (this finance app). Use whenever adding or changing anything visual — colours, CSS, buttons, charts, icons, headings, fonts, the theme, the PWA manifest/theme-color — or reviewing a UI change for brand consistency."
---

# Steady brand: colours and type

## Palette

| Name | Hex | Use it for | Token (light theme) |
|---|---|---|---|
| Cream | `#F5EFE4` | Main background | `--bg-primary` |
| Sand | `#EDE3D3` | Cards and panels on the cream background | `--bg-secondary`, `--bg-glass` |
| Espresso | `#3D2914` | Darkest text, dark backgrounds | `--bg-primary` in the dark theme |
| Brown | `#4F3D29` | Headings and body text | `--text-primary` |
| Saddle | `#6B4226` | Primary accent: buttons, links, the top bar | `--color-primary`, `--color-primary-ink`, `--topbar-bg` |
| Rust | `#A0612F` | Highlight words, active states | `--color-accent`, `--focus-ring` |
| Tan | `#B08968` | Borders, dividers, icons and decoration | `--color-decor`, `--border-glass` (tinted) |

## Fonts

- **Poppins** for headings (`h1`–`h6`) and the "Steady" wordmark → `var(--font-heading)`.
- **Source Sans 3** for body text and everything else, including Chart.js labels → `var(--font-main)`.
- Both are self-hosted in `vendor/poppins/` (static 500–800) and `vendor/source-sans-3/` (variable 200–900). Never load them from Google Fonts at runtime: the app must work offline and contact no other server. If you add a Poppins weight, add its files, its `@font-face` rules, and the paths to `SHELL_ASSETS` in `sw.js`, then bump `CACHE_VERSION`.

## Rules

1. **Use tokens, never raw hex, in components.** All colours live in the token blocks at the top of `style.css`. The light block appears twice (OS-preference media query and `[data-theme="light"]`); keep them identical.
2. **Light theme is the cream brand palette; dark theme is its Espresso counterpart.** In dark mode: Espresso page, Brown cards, Cream text, and lifted shades of Tan/Rust for primary/accent, because Saddle and Rust are too dark to read on Espresso.
3. **Saddle = action, Rust = state.** Buttons, links and the top bar use primary (Saddle). The active nav item, selected states and highlighted words use accent (Rust).
4. **Text contrast ≥ 4.5:1.** Rust on Sand/Cream is just under 4.5:1, so for small Rust *text* use `--color-accent-ink` (`#8A5226` in light). Fills take `--on-primary` / `--on-accent` text. Tan is for borders and decoration, never body text.
5. **Semantic colours stay semantic.** Success, danger and warning are warm-tuned green/red/amber tokens (`--color-success`, `--color-danger`, `--color-warning`); tint them with `color-mix(in srgb, var(--color-…) N%, transparent)` rather than hard-coded rgba.
6. **Shadows and scrims are warm**, based on `rgba(20, 12, 4, …)` / `--scrim`, not pure black.
7. **Browser chrome uses Saddle:** `<meta name="theme-color">`, `manifest.webmanifest` `theme_color`, and `applyTheme()` in `app.js` all use `#6B4226`. The manifest `background_color` is Espresso.
8. User-chosen category and goal colours are user data; don't restyle them to the palette.

See also the `button-hierarchy` skill for which button variant to use.
