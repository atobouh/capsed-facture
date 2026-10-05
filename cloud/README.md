# CAPSED cloud

The Direction website, the office app served at `/bureau/` (until the Windows installer exists), and the API that keeps
every office computer and the Direction in step. Cloudflare Workers + D1. Nothing is ever deleted: every version of every
record is kept in `versions`.

## How data travels

- Every change in the app (an invoice, a payment, a validation…) becomes a small record (about 0.5 KB) in an outbox on the
  computer or phone. Invoices travel as their data; the A4 page is rebuilt from it wherever it is opened.
- The outbox is sent in compressed batches of 50. A send cut by the network is sent again; the cloud recognises each change
  by its id and does not count it twice.
- Changes made elsewhere come back from a cursor, so only what is new travels.
- When two people changed the same record, fields are merged (each keeps what they changed). A payment corrected offline
  after the Direction validated it is kept and goes back to the Direction to validate.
- Permissions are checked by the server for every change (`src/rules.ts`). An office computer acts for the person signed in
  on it and can never act as the Direction.

## Deploying

Pushing to `main` (or the working branch) runs `.github/workflows/cloud.yml`. It needs, in GitHub, Settings > Secrets and
variables > Actions > **Secrets**:

| Name | What |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare token with Workers Scripts Edit, D1 Edit (template « Edit Cloudflare Workers » plus D1). |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id (a variable is also accepted). |
| `RECOVERY_KEY` | Optional. A long random text (24+ characters) known only to the developer. Enables `https://<site>/secours/<RECOVERY_KEY>` to set a new Direction password. |

The workflow builds, creates the D1 database the first time, applies migrations, deploys, sets the recovery key and checks
the live site. First visit to the site: create the Direction account. Then Réglages > Équipe et accès: add the team, and
« Relier un ordinateur » to get a 6-digit code for each office computer.

## Working locally

```bash
npm run build:cloud                       # dist-site (Direction) + dist-site/bureau (office app)
cd cloud
npx wrangler d1 migrations apply DB --local
npx wrangler dev --var RECOVERY_KEY:test-recovery-key-0123456789abcdef
# in another terminal, on a fresh database:
npm run test:cloud                        # API tests
node cloud/test/e2e.mjs                   # browser tests: offline, cut sends, slow network, conflicts, overrides
```

## Invoice numbers

Each office computer that issues invoices offline has its own series so numbers never collide: the first computer keeps
`2026-10-001`, the next ones `2026-10-B001`, `C`, `E`, `F`… The Direction website uses `D`. A replaced computer, linked
again after the old one is removed, takes over the free series and continues it.
