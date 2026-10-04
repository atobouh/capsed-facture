# CAPSED — design system (v2)

Product truth lives in `PRODUCT.md`. This file records the visual system the app now uses. Mode: **Operate** (people complete tasks). Built with the installed skills in `.claude/skills/` (impeccable, frontend-design, web-design-guidelines, ui-ux-pro-max); run `/impeccable critique` or `/web-design-guidelines app/v2` before shipping UI changes.

## Principles

1. One primary button per screen, top right of the page header. Rare actions go in « Autres actions ».
2. Each role only sees its own menu: Facturation (Factures, Clients, Demandes), Encaissement (Clients et paiements, Demandes), Direction (Clients, À valider, Situation, Réglages).
3. Lists are plain rows in one panel, never grids of cards. Numbers are a row of labelled facts, never coloured tiles.
4. The A4 document is always shown whole, scaled to the width (`FitPaper`), never cropped or scrolled inside a box.
5. Serious actions confirm with their exact effect (closing a month, validating, archiving). Nothing is deleted.
6. Colour carries meaning only: plum for the primary action, current tab and focus; green / amber / red for status, always with a word.

## Tokens (`app/v2/v2.css`)

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | #f7f6f9 | page ground |
| `--surface` | #ffffff | panels, inputs |
| `--ink` / `--ink-2` / `--muted` | #211a29 / #4c4558 / #686174 | text levels |
| `--line` / `--line-2` | #e8e4ed / #d4cddc | dividers / control borders |
| `--plum` | #6e2882 | primary, selection, focus (CAPSED letterhead) |
| `--azure` | #0a7fbf | signature rule only |
| `--good` `--warn` `--bad` `--info` | #1d7446 #8f5600 #b42318 #0a6aa1 | status dots and notices |
| radius | 8 px controls, 12 px panels | |

Type: **Lexend** (self-hosted in `public/fonts`, chosen for reading fluency and a plain zero), weights 400/600/700, sizes 14 / 16 / 19 / 28 / 36. Playfair Display only on the sign-in title, echoing the letterhead. Tabular figures everywhere.

Signature: the letterhead's double rule (2 px plum over 1 px azure) under the brand in the side menu and under the Direction header. No other decoration: no gradients, no coloured side bars, no eyebrow labels, no shadows except menus and dialogs.

## Components

Button (primary / secondary / quiet / link, 44 px), text button, field with visible label and inline error, money input with live spacing, choice (radio cards; compact without dot for 5 options), search, underline tabs, panel + table, list row (main text left, amount right), facts row, notice, disclosure, modal (focused tasks only: payment, credit note, confirmation, request), toast (bottom centre).
