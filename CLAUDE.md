# Steady — notes for Claude

Plain HTML/CSS/JS personal finance PWA (no framework, no build step). Run `npm start` to serve, `npm test` for the Playwright suite. Third-party files are self-hosted in `vendor/` — never load anything from a CDN at runtime.

Online features (Claude assistant, live prices, encrypted Gist backup) live in `online.js` and are opt-in. Keep keys and tokens in the `steady_connections` storage entry, never in `state`; say in the UI what each feature sends; mock every service in tests. Claude calls use the vendored Anthropic SDK (`vendor/anthropic-sdk/`), default model `claude-opus-5-5`.

## Brand

Full guide: the `brand` skill (`.claude/skills/brand/SKILL.md`). In short:

| Name | Hex | Use it for |
|---|---|---|
| Cream | `#F5EFE4` | Main background |
| Sand | `#EDE3D3` | Cards and panels on the cream background |
| Espresso | `#3D2914` | Darkest text, dark backgrounds |
| Brown | `#4F3D29` | Headings and body text |
| Saddle | `#6B4226` | Primary accent: buttons, links, the top bar |
| Rust | `#A0612F` | Highlight words, active states |
| Tan | `#B08968` | Borders, dividers, icons and decoration |

Fonts: **Poppins** for headings (`--font-heading`), **Source Sans 3** for body text (`--font-main`).

- Use the CSS tokens at the top of `style.css`, never raw hex in components.
- Light theme = the cream palette; dark theme = its Espresso counterpart. Keep both light token blocks identical.
- Small Rust text uses `--color-accent-ink` to meet 4.5:1 contrast.

## Buttons

Follow the `button-hierarchy` skill: one primary action per screen, never two equally weighted buttons side by side.
