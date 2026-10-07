# CAPSED — design system (v2)

Product truth lives in `PRODUCT.md`. This file records the visual system the app now uses. Mode: **Operate** (people complete tasks). Tone: a calm, premium business tool (references studied: Odoo, Invoice Ninja, Xero, Linear, Stripe dashboard). Built with the installed skills in `.claude/skills/` (impeccable, frontend-design, web-design-guidelines, ui-ux-pro-max); run `/impeccable critique` or `/web-design-guidelines app/v2` before shipping UI changes.

## Two surfaces

- **Office (Facturation, Encaissement): a desktop window** (future Tauri app).
  - Frame: light 232 px sidebar (logo, labelled destinations, sync state, user and « Se déconnecter »), one scrolling work area `#contenu`, a status bar (« Données enregistrées sur ce poste », shortcuts, help).
  - Every page has a sticky white header bar: title, tools (month, search), actions on the right.
  - Shortcuts: F1 help, Ctrl+F search on this page, Ctrl+N new invoice.
  - Split views:
    - Register: invoice table with an invoice panel on the right, from 1360 px.
    - Clients: client list beside the account, from 1180 px.
    - Demandes: list beside the detail.
  - Narrower windows open the same page full width. Base 14 px, controls 32 px.
- **Old invoices** (« ⋯ » then « Ajouter une ancienne facture », office and Direction): the same 4-step composer with the original number and date. The number must be unique; automatic numbering ignores old invoices and skips any number they use. They carry an « Ancienne » tag and sync like any invoice.
- **Things to check, never refused**: two computers can still produce a payment entered twice, an old invoice number used twice, or an invoice made in a month another computer had closed. The cloud keeps all of it; the Direction's « Nouveau à valider » says « N points à vérifier », marks each one in red (« Doublon possible » with « Annuler ce doublon », « Numéro en double » with « Corriger le numéro », « Faite dans un mois déjà clôturé »), and leaves them unticked so « Valider » never passes them unseen.
- **Desktop updates**: installed apps read only the release « bureau-latest ». A build lands there on purpose only (merge into main, « Run workflow » with a note, or a commit marked [publier]); every other build goes to « bureau-test ». The app only reads latest.json and says « Nouvelle version … disponible » with the note; « Plus tard » hides it for 3 days (the help panel can bring it back). Nothing is downloaded or installed on its own: « Installer » downloads with a progress screen (cancellable), checks the SHA-256, starts the installer directly and the app reopens; an attempt that did not take is reported.
- **Start-up**: the page itself shows the CAPSED mark and a thin progress bar from the first frame; the Windows window stays hidden until the page is drawn, and opening the app twice brings the open window forward. App icon: plum rounded tile with the white open delta, drawn bolder at 16–48 px.
- **Direction: a website**, with a phone layout and a desktop layout.
  - It uses normal page scroll: never `overflow:hidden` on html/body.
  - Phones: bottom navigation (Accueil, Factures, Situation, Réglages); the validation total bar sits above it. Forms open as bottom sheets.
  - From 1024 px: tabs in the header and two columns:
    - Home: hero and « À faire » | clients.
    - Client: balance and actions | invoices and payments.
    - Invoice: payment summary | the whole A4 document, payments, history.
    - Factures: new to validate | every invoice, month by month.
  - Factures is one tab for reading and validating. On top, « Nouveau à valider » lists new or modified invoices and new payments with checkboxes. Below, every invoice the office issued, month by month with two arrows; the search covers all months.
  - Validation is a review, never a gate: nothing not yet validated is blocked or left out of balances and statements. A validated payment can no longer be corrected by Encaissement; a validated invoice stays editable and comes back to validate when it changes. The Direction reads invoices itself and never asks the office for one.
  - The Direction can also create invoices (« Nouvelle facture » on Factures and on a client page) with the same 4-step composer; its own invoices are validated at creation. The wizard hides the bottom navigation while it is open.
  - Situation has one switch: « Les clients » (statement with HT, TVA and TTC, on screen and on paper) or « L’équipe » (what each person did in the office apps over a period, then the journal, exportable to Excel).
  - Payment deadline: 60 days by default, changed by the Direction in Réglages, and per invoice at step 3 of the composer. It is internal only: never printed on the invoice. Lateness (« N j de retard », « Relancer », the aging bar) counts from this deadline.
  - Réglages is an index of five pages, one question each: Équipe et accès (people, passwords, office computers), Règles et dérogations (payment deadline, closed months, every rule lifted with « Revenir en arrière »), Entreprise et factures, Données et sauvegarde (when each computer last sent data), Aide.
  - Équipe et accès: each password is shown masked with an eye and a copy icon, and copies alone. A password is made by the app or chosen by the Direction (« Je le choisis », at least 6 characters, no space). Office computers only ever receive its hash.
  - Linking a computer: the code window waits live (« En attente de l’ordinateur… ») and turns into « Ordinateur relié » by itself. Only the code expires (24 h, single use); the link does not.
  - Rules the Direction can lift (unlock a validated payment, restore a cancelled one, reopen a closed month) always ask for a reason, state the exact effect, are written in the journal and can be undone.
  - Freshness is always visible: the Direction site says « Situation au … » and when each office computer last sent data, and warns when one has sent nothing for a day or when the phone is offline. The office status bar says « Tout est envoyé · 14:32 » or how many changes wait to be sent.
  - Base 15 px, controls 40–44 px.

## Principles

1. No tab strips inside a page. One page per question, with subheadings; rare or finished things collapse at the bottom (paid invoices, archived clients, handled requests, history).
2. One primary button per screen. Rare actions go in the « ⋯ » menu. The menu is portalled and fixed, flips to stay on screen and never gets clipped.
3. The office app lists every tab once (Factures, Clients / Clients et paiements, Demandes) and the login decides which show (`canBill`, `canCash` in `store.ts`):
   - Facturation: Factures, Clients, Demandes.
   - Encaissement: Clients et paiements, Demandes.
   - Facturation et encaissement (full mode, role `bureau`): Factures, Clients et paiements, Demandes, with both sets of actions.
   - Direction: Accueil, Factures, Situation, Réglages.
4. Status pills:
   - Settled states take the green pill: Payée, Validé par la Direction (with a lock), Traitée.
   - Moving states take a warm or blue pill: À payer, Partiellement réglée, Nouvelle.
   - Late states take a red pill: « 61 j de retard ».
5. The A4 document is always shown whole, scaled to the width (`FitPaper`), never cropped and never restyled.
6. Serious actions confirm with their exact effect. Nothing is deleted.
7. The month is chosen with two arrows (`MonthStepper`).
8. Forms that edit a record (client, payment, credit note, request, member) open as a right-hand drawer, or a bottom sheet under 640 px. Confirmations stay centred.
9. Tables adapt to their container, not the window:
   - Under 880 px the date column hides.
   - Under 700 px the amount column of an account hides.
   - Under 560 px each line becomes a card.
10. No button may wrap or be cut. Every release is checked with the Playwright audit at 1440/1280/1024 (office) and 1440/1024/768/390/360 (Direction). The audit reports cut text, elements off screen, clipped elements, horizontal page scroll and menus off screen.

## Tokens (`app/v2/v2.css`)

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | #F6F5F7 | page ground |
| `--surface` | #FFFFFF | cards, header bars, inputs |
| `--ink` / `--muted` | #1B1820 / #6F6878 | text levels |
| `--line` | #E7E4EA | dividers, card borders |
| `--plum` | #5E3A6B | primary, selection, links (dimmed CAPSED plum) |
| `--plum-tint` / `--plum-soft` | #F4EFF5 / #EADFEC | selected row, active nav |
| `--aubergine` | #3A2443 | Direction hero, sign-in panel |
| good | #1F6B42 on #E6F2EA | paid, validated |
| warn | #8A5A0B on #FBF0DC | partially paid, new |
| bad | #A8322A on #FBE9E7 | late, cancel |
| info | #1F5F86 on #E7F0F6 | to pay, read |
| radius | 8 px controls, 12 px cards, 999 px pills | |

Type: **Geist** variable (self-hosted in `public/fonts/Geist-Variable.woff2`, OFL), weights 400/500/600 only, tabular numbers for amounts. Playfair Display for the CAPSED wordmark on the sign-in page, echoing the letterhead.

## Components

- **Window and layout:** window frame and status bar (office), sticky page header with tools, `.cx-strip` totals, list/details splits, side panel.
- **Lists and tables:** `.cx-table` (container-query responsive), `Row` (list row with current state), `.cx-kv` key/value lines, `.cx-fold` disclosure.
- **Status and feedback:** pill (`Chip` / `Stamp`), notice, toast.
- **Controls:** `MonthStepper`, `SearchBox`, button (primary / secondary / quiet / link / icon), field with visible label and inline error, money input with live spacing, choice (radio cards; segmented compact for 5 payment modes), `MoreMenu`.
- **Overlays:** `Modal` (centred confirm, `side` drawer, phone bottom sheet).
- **Direction:** hero with aging bar, payment check cards, total action bar.
