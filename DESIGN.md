# CAPSED — design system (v2)

Product truth lives in `PRODUCT.md`. This file records the visual system the app now uses. Mode: **Operate** (people complete tasks). Built with the installed skills in `.claude/skills/` (impeccable, frontend-design, web-design-guidelines, ui-ux-pro-max); run `/impeccable critique` or `/web-design-guidelines app/v2` before shipping UI changes.

## Two surfaces

- **Office (Facturation, Encaissement): a desktop window** (future Tauri app). Fixed frame: plum left pane with labelled destinations, one scrolling work area, a status bar (sync state, shortcuts, help). Shortcuts: F1 help, Ctrl+F search on this page, Ctrl+N new invoice. From 1180 px the lists sit beside their detail (list/details, Microsoft Fluent pattern): click a row on the left, the invoice, credit note, client account or request appears whole on the right. Narrower windows stack the same pages. Base 16 px, controls 46 px.
- **Direction: a website, phone first.** Normal page scroll (never `overflow:hidden` on html/body), sticky plum header, large bottom bar on phones, two columns from 1024 px. Base 17 px, controls 52 px, bottom sheets for forms on phones.

## Principles

1. No tab strips. One page per question, with subheadings; rare or finished things collapse at the bottom (archived clients, handled requests). Research basis: NN/g lower-literacy users read word by word and miss options; tabs only when users never compare groups.
2. One primary button per screen, top right of the toolbar (first on phones). Rare actions in « Autres actions ».
3. Each role only sees its own menu: Facturation (Factures, Clients, Demandes), Encaissement (Clients et paiements, Demandes), Direction (Clients, À valider, Situation, Réglages).
4. Final states are stamped like an office cachet (`Stamp`): Payée, Tout payé, Traitée in green ink; Annulé in red; Validé and Remise in plum. States still moving are soft pills (À payer, Partiellement réglée, Nouvelle). The stamp lands with one short ease-out in headings; lists show it still.
5. The A4 document is always shown whole, scaled to the width (`FitPaper`), never cropped or scrolled inside a box.
6. Serious actions confirm with their exact effect. Nothing is deleted.
7. The month is chosen with two arrows (`MonthStepper`), never a browser calendar that speaks the system language.
8. Tables turn into one card per line when their panel is narrower than 760 px (container query), on phones and in detail panes alike.

## Tokens (`app/v2/v2.css`)

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | #f3f0f7 | page ground |
| `--surface` | #ffffff | cards, inputs |
| `--plum-900` / `--plum-800` | #33113f / #471a58 | side menu, Direction header, hero |
| `--plum` | #6e2882 | primary, selection (CAPSED letterhead) |
| `--azure` | #0a7fbf | signature rule, client initials |
| `--ink` / `--ink-2` / `--muted` | #1f1428 / #463b52 / #655b72 | text levels |
| `--line` / `--line-2` | #e6dfee / #d3c9de | dividers / control borders |
| `--good` `--warn` `--bad` `--info` | #17703f #8a5200 #b3261e #0a6aa1 | status pills and notices |
| radius | 14 px controls, 20 px cards, 24 px dialogs | |

Type: **Lexend** (self-hosted in `public/fonts`, plain zero, fluent for low-literacy readers), weights 400 to 800. Playfair Display for the CAPSED wordmark (menu, header, sign-in), echoing the letterhead.

Signature: the letterhead's double rule (plum over azure) under the brand, on the hero card and the sign-in top edge.

## Components

Window frame and status bar (office), list/details split, `Row` (list pane row with current state), `Stamp`, `MonthStepper`, button (primary / secondary / quiet / link), text button, field with visible label and inline error, money input with live spacing, choice (radio cards; compact without dot for 5 options), search, segmented tabs, hero card, alert cards, client initials, bottom bar (phone), panel + table, list row (main text left, amount right), facts row, notice, disclosure, modal (focused tasks only: payment, credit note, confirmation, request), toast (bottom centre).
