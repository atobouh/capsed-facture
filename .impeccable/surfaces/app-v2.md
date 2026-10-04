---
version: 1
slug: "app-v2"
primary_target: "app/v2"
related_targets: []
---

Scope: app/v2, two surfaces. Office (Facturation, Encaissement) is a Tauri desktop window, mode Operate. Direction is a website, phone first, mode Operate.
Audience: office clerk and cashier at CAPSED Douala, low digital literacy; owner on a phone between sites.
Job: issue and print invoices, record payments, answer Direction requests; owner sees who owes what and validates payments.
Constraints: every first-prototype function kept; nothing deleted; 4-step invoice flow kept; official A4 paper unchanged; plum/azure letterhead palette and branded sign-in approved.

## Direction contract
THESIS: Each office screen answers one question with the list on the left and the thing itself on the right, inside a calm desktop window; the owner reads a pocket ledger with one thumb. Refuses tab strips, equal-card dashboards and web-page scrolling inside the office app.
OWN-WORLD: CAPSED letterhead: plum ink rail, azure hairline rule, white A4 paper on a lilac desk; final states stamped like an office cachet (bordered uppercase ink, Payée green, Annulé red, Validé plum); Lexend for work, Playfair only for the wordmark.
STORY: Open the app, see this month's invoices, click one, it appears whole beside the list with its next action; the owner opens the site and the first line says how much is still owed.
FIRST VIEWPORT: Office: window toolbar (title, search, one primary), list pane, detail pane with paper and stamp, status bar with sync and help. Direction phone: total owed, actionable alerts, client rows, bottom bar.
SIGNATURE: the cachet stamp landing on an invoice when it is paid or handed over.
RISK: split panes on small office screens; fall back to stacked pages under 1180 px.
SEED: c71220e6
