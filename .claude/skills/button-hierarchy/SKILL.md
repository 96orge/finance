---
name: button-hierarchy
description: "Button hierarchy and primary-action rules for this finance app. Use when designing, building, or reviewing any screen, form, or modal that has buttons or actions — deciding which action is primary, picking a button variant, laying out a confirmation flow, or adding a money-movement screen (transfer, payment, transaction entry)."
---

# Button Hierarchy & Primary Action Rules

This app's button and action design follows 5 rules, enforced through the button
variants already defined in `style.css` (the "Buttons System" block starting at
`style.css:1066`). Don't hand-roll one-off button styles per screen — extend that
block if a new variant is genuinely needed.

## When to apply

Any time you're adding or reviewing a screen, modal, or form in `index.html` /
`app.js` / `style.css` that includes a button, action row, or multi-step flow
(especially anything that moves or edits money — transactions, transfers, budgets,
debts, goals).

## The 5 rules

1. **Every screen has one obvious primary action.** If a screen seems to need two
   equally important actions, one of them isn't actually primary — demote it.
2. **The primary button looks more important than everything around it.** Solid
   fill, clear visual weight. Never let a secondary or link action compete with it.
3. **Hide advanced options until the user actually needs them.** Rare or advanced
   actions go behind a "More" affordance, not inline on the main screen.
4. **Never place several equally weighted buttons side by side.** If two buttons
   sit next to each other, they must look visually different (e.g. one filled, one
   outlined) — never two filled buttons, never two outlined buttons.
5. **If an option isn't relevant, don't show it.** Don't disable-and-show as the
   default for irrelevant options — omit them. Disabling is for options that
   *could* apply once a condition is met (see the form-validity rule below), not
   for options that don't apply at all.

## Button hierarchy → existing classes in this repo

| Role | Rule | Class(es) to use | Where it already appears |
|---|---|---|---|
| **Primary** | Solid brand fill, full width, one per screen, placed at the bottom (thumb rest on mobile) | `.btn.btn-primary` + `.btn-full` | `style.css:1083` |
| **Secondary** | Outlined/tonal, visibly quieter than primary | `.btn.btn-outline` | `style.css:1094` |
| **Link** | Plain text — "Cancel", "Skip", "Learn more" | `.btn-text` | `style.css:1115` |
| **Destructive** | Red, kept apart from the primary action, always confirmed in a dialog | `.btn-danger`, confirmed inside a `.modal-content` dialog | `style.css:1105`, modal block at `style.css:1139` |
| **Icon-only / close** | Quiet, circular, for dismiss affordances | `.btn-close-modal` | `style.css:1186` |
| **Row-level actions** | Small inline edit/delete on cards/lists | `.btn-action`, `.btn-card-action` (pair with `-delete`/`-edit` modifiers) | `style.css:1379`, `style.css:1626` |
| **More options** | Rare/advanced actions tucked away | `.more-menu-list` / `.more-menu-btn` (mobile "More" menu) | `style.css:2452` |

Two buttons on the same row must come from **different** rows of this table
(e.g. primary + text, or outline + text) — never two from the same row.

## Finance-specific extras

- **Confirm every money movement with a summary screen** (amount, recipient/category, fee if any) before the final confirming button. Build this as a review step inside the existing modal pattern, not a native `confirm()`.
- **Disable the primary button until the form is valid, and say why inline.** There's no `:disabled` button styling in `style.css` yet — add it to the Buttons System block (visually muted `.btn-primary`, `cursor: not-allowed`) rather than inventing a new class, and pair it with inline helper/error text near the field that's incomplete.
- **Make amounts the largest text on screen, with consistent currency formatting.** Reuse the existing `nairaFormatter` (`app.js:526`, `Intl.NumberFormat('en-NG', …)`) and the `.transfer-amount` / `.income-source-amount` sizing precedent (`style.css:2925`, `:2273`) — don't format currency ad hoc with `toLocaleString()` in new code.
- **Show clear success, pending, and failed states after every transaction.** The toast system already exists for this — `showToast(message, type)` at `app.js:1651` with a `type` of `success`/etc. Extend it with `pending` and `error`/`failed` variants (and matching `--color-*` tokens) rather than building a separate notification mechanism.

## Tip

Treat `.btn`, `.btn-primary`, `.btn-outline`, `.btn-danger`, `.btn-text` as the
only button variants in this app. If a screen seems to need a new look, check
whether it's actually a misuse of hierarchy (rule 4) before adding CSS.
