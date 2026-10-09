/** « Exporter toutes les données »: one zip the Direction keeps outside the cloud.
 *  - capsed-sauvegarde.json: everything, readable again by « Restaurer une sauvegarde » (passwords left out);
 *  - one table per kind of data (.csv, opens in Excel): invoices, invoice lines, payments, credit notes, clients, journal;
 *  - LISEZMOI.txt: what each file is. */
import { downloadBlob, zip } from "../receipt-export";
import { invoiceTotals } from "../invoice-math";
import { accountName, balance, dueDateOf, getData, methodName, nowIso, todayIso } from "./store";

type Cell = string | number | undefined | null;
// Semicolons and a BOM: what Excel in French expects, accents included.
const csv = (head: string[], rows: Cell[][]) => "﻿" + [head, ...rows].map(r => r.map(v => {
  const t = v === undefined || v === null ? "" : String(v);
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}).join(";")).join("\r\n") + "\r\n";
const day = (iso?: string) => iso ? iso.slice(0, 10) : "";

export function exportAll() {
  const d = getData(), at = nowIso();
  const { snapshot: _s, ...rest } = d; void _s;
  // No password of any kind leaves in this file, not even scrambled.
  const accounts = d.accounts.map(({ password: _p, visiblePassword: _v, pwHash: _h, pwSalt: _a, pwIter: _i, ...a }) => { void _p; void _v; void _h; void _a; void _i; return a; });
  const backup = JSON.stringify({ ...rest, accounts, exportedAt: at }, null, 1);
  const invoices = [...d.invoices].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  const files: Record<string, string> = {
    "capsed-sauvegarde.json": backup,
    "factures.csv": csv(["Numéro", "Date", "Client", "NIU du client", "Type", "Montant HT", "TVA", "Total", "Avance", "Avoirs", "Encaissé", "Reste à payer", "Statut", "Échéance (interne)", "Ancienne facture", "Validée par la Direction", "Créée par", "Bon de commande"],
      invoices.map(i => { const t = invoiceTotals(i), b = balance(i, d.payments, d.credits); return [i.number, i.date, i.client.name, i.client.niu, t.taxMode === "ttc" ? "TTC" : "HT", t.ht, t.tax, b.total, i.advance, b.credited, b.received, b.due, b.status, dueDateOf(i), i.legacy ? "oui" : "", i.validatedAt ? day(i.validatedAt) : "", accountName(i.createdBy), i.purchaseOrder]; })),
    "lignes-des-factures.csv": csv(["Facture", "Date", "Client", "Désignation", "Destination", "Quantité", "Prix unitaire HT", "Montant HT", "Contrat"],
      invoices.flatMap(i => i.lines.map(l => [i.number, i.date, i.client.name, l.designation, l.destination, l.quantity, l.unitPrice, l.quantity * l.unitPrice, l.contract]))),
    "paiements.csv": csv(["Date", "Facture", "Client", "Montant", "Mode", "Référence", "Saisi par", "Saisi le", "Annulé le", "Validé le"],
      [...d.payments].sort((a, b) => a.date.localeCompare(b.date)).map(p => { const i = d.invoices.find(x => x.id === p.invoiceId); return [p.date, i?.number, i?.client.name, p.amount, methodName(p.method), p.reference, accountName(p.by), day(p.at), day(p.cancelledAt), day(p.lockedAt)]; })),
    "avoirs.csv": csv(["Numéro", "Date", "Facture", "Client", "Montant", "Motif"],
      [...d.credits].sort((a, b) => a.date.localeCompare(b.date)).map(c => [c.number, c.date, c.invoiceNumber, c.client?.name, c.amount, c.reason])),
    "clients.csv": csv(["Nom", "Contact", "Adresse", "Téléphone", "E-mail", "NIU", "RCCM", "Archivé"],
      [...d.clients].sort((a, b) => a.name.localeCompare(b.name)).map(c => [c.name, c.contact, c.address, c.phone, c.email, c.niu, c.rc, c.archived ? "oui" : ""])),
    "journal.csv": csv(["Date et heure", "Personne", "Action"], [...d.events].sort((a, b) => a.at.localeCompare(b.at)).map(e => [e.at.replace("T", " ").slice(0, 19), accountName(e.by), e.text])),
    "LISEZMOI.txt": [
      `CAPSED, export complet du ${todayIso()}`,
      "",
      `capsed-sauvegarde.json  Toutes les données (${d.invoices.length} factures, ${d.payments.length} paiements, ${d.credits.length} avoirs, ${d.clients.length} clients).`,
      "                        Se recharge avec Réglages > Données et sauvegarde > « Restaurer une sauvegarde ».",
      "                        Aucun mot de passe n’y figure.",
      "factures.csv            Une ligne par facture : montants, encaissé, reste à payer, statut.",
      "lignes-des-factures.csv Le détail des articles de chaque facture.",
      "paiements.csv           Chaque paiement, annulé ou non.",
      "avoirs.csv              Les avoirs.",
      "clients.csv             Les clients et leurs coordonnées.",
      "journal.csv             Qui a fait quoi, et quand.",
      "",
      "Les fichiers .csv s’ouvrent dans Excel (double-clic). Montants en francs CFA.",
      "Gardez ce fichier en lieu sûr, hors de Cloudflare : clé USB, disque, Google Drive…",
    ].join("\r\n"),
  };
  downloadBlob(zip(files, "application/zip"), `capsed-export-complet-${todayIso()}.zip`);
  return { invoices: d.invoices.length, clients: d.clients.length };
}
