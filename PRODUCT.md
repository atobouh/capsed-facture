# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

CAPSED SUARL (Douala, Cameroun), a services company (phytosanitary treatment, pest control, pesticide supply). Three roles, each with its own space:

- **Facturation** (office clerk, desktop app): creates clients, issues invoices and credit notes, prints them, marks them handed to the client. Sees payments read-only.
- **Encaissement** (cashier, desktop app): records cheques, transfers, Orange Money, MTN MoMo and cash against invoices; corrects or cancels own entries before validation; prints a client's statement; answers the manager's requests.
- **Direction** (owner/manager, web site, often on a phone): knows where every client stands without calling the office, validates and locks payments, sends requests to the team, owns company settings, invoice format, team accounts, backups and the global statement.

Users are not technical. The bar set by the client: a child should know where to start and what to do, learnable in two days, with very few surfaces for error.

## Product Purpose

Invoice clients, track what each client has paid and still owes, and let the manager supervise remotely. Success: fewer phone calls to the office, no lost or duplicated payments, invoices that match the official CAPSED paper.

## Operating Context

- Office workstation (future Tauri desktop app, works offline, syncs when online). Manager site reads the last state received from the office and shows its freshness.
- Printed A4 documents on the official CAPSED letterhead: invoices, credit notes (avoirs), statements (situations). The paper layout is fixed and must not change.
- Amounts in FCFA, integers. VAT 19,25 % when the invoice is TTC. Invoice numbers YYYY-MM-NNN per month; credit notes AV-YYYY-MM-NNN.
- Months can be closed; closed months are read-only.

## Capabilities and Constraints

- Every function of the first prototype is kept: monthly register (invoices / credit notes), invoice form (client, date, purchase order, HT/TTC, multi-line articles with destination and contract, discount, VAT rate, advance, payment mode, note), invoice editing with kept versions, credit notes by article or amount, payments with corrections history and cancellation, delivery to the client, period statements (print, Excel, CSV), invoice Excel export, banner format, company details, backup/restore.
- **Nothing is ever deleted.** Clients are archived; payments are cancelled but stay visible; corrections keep the previous value.
- **Requests go only from Direction to the team:** a payment to check (to Encaissement), an invoice to create or a client to create (to Facturation). They never change a balance by themselves.
- Serious actions ask for confirmation and state their exact effect (e.g. closing a month). The client explicitly likes this.
- The 4-step invoice creation flow is liked and must be kept.
- Team logins: Direction generates usernames and passwords, can regenerate and deactivate (never delete). Demo-only storage until the server exists.

## Brand Commitments

- Name CAPSED SUARL; logo and letterhead in `public/capsed-logo.png` and `public/capsed-letterhead.webp`.
- Palette from the letterhead: plum (#6E2882) and azure (#008CD2). The client approved this palette and the branded sign-in screen.
- French interface, plain words ("Reste à payer", not accounting jargon).

## Evidence on Hand

Only fictional demo data. No real clients, testimonials or figures may be invented as real.

## Product Principles

1. One obvious next step per screen; everything else quiet.
2. Each role sees only its own work.
3. Prevent mistakes before they happen; confirm only what is serious.
4. Nothing disappears: every change is visible in the history.
5. The printed CAPSED document is the source of truth and is shown whole, never cropped.

## Accessibility & Inclusion

Low digital literacy users; large readable text, labels always visible, colour never the only signal, works on a phone for Direction.
