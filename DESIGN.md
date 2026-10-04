# CAPSED — design system (v2)

Product truth lives in `PRODUCT.md`. This file records the visual system the app now uses. Mode: **Operate** (people complete tasks). Built with the installed skills in `.claude/skills/` (impeccable, frontend-design, web-design-guidelines, ui-ux-pro-max); run `/impeccable critique` or `/web-design-guidelines app/v2` before shipping UI changes.

## Principles

1. One primary button per screen, top right of the page header (first on phones). Rare actions go in « Autres actions ».
2. Each role only sees its own menu: Facturation (Factures, Clients, Demandes), Encaissement (Clients et paiements, Demandes), Direction (Clients, À valider, Situation, Réglages).
3. Big and bold: body 17 px, labels 17 px bold, page titles 36 px (30 px on phones), amounts 21 to 52 px. Nothing under 14 px. Tap targets 52 px or more.
4. Surfaces have depth: white cards with a soft plum shadow on a lavender ground; the amount still due is the one plum card in a row of facts.
5. Direction is phone first: one column, a plum hero with the total, alert cards, client rows with initials, a large bottom bar. Tables become one card per line under 700 px.
6. The A4 document is always shown whole, scaled to the width (`FitPaper`), never cropped or scrolled inside a box.
7. Serious actions confirm with their exact effect. Nothing is deleted.
8. Colour carries meaning: plum for the primary action and selection, green / amber / red pills for status, always with a word.

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

Button (primary / secondary / quiet / link, 52 px), text button, field with visible label and inline error, money input with live spacing, choice (radio cards; compact without dot for 5 options), search, segmented tabs, hero card, alert cards, client initials, bottom bar (phone), panel + table, list row (main text left, amount right), facts row, notice, disclosure, modal (focused tasks only: payment, credit note, confirmation, request), toast (bottom centre).
