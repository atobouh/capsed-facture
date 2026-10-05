import { useState } from "react";
import { Download } from "lucide-react";
import { invoiceTotals } from "../invoice-math";
import { downloadExcel } from "../receipt-export";
import { periodTitle } from "../statement-period";
import { Button, DateInput, Empty, Monogram, Notice, PageHead } from "./ui";
import { ROLE_LABEL, ago, dateValid, money, todayIso, useData } from "./store";
import type { Account, Event } from "./store";

/** What each action in the log is. Every change goes through `commit`, which writes these texts. */
const KINDS: { key: string; test: RegExp; one: string; many: string }[] = [
  { key: "emise", test: /^Facture \S+ émise/, one: "facture émise", many: "factures émises" },
  { key: "modifiee", test: /^Facture \S+ modifiée/, one: "facture modifiée", many: "factures modifiées" },
  { key: "remise", test: /^Facture \S+ remise au client/, one: "remise au client", many: "remises au client" },
  { key: "remise-annulee", test: /^Remise de la facture/, one: "remise annulée", many: "remises annulées" },
  { key: "avoir", test: /^Avoir /, one: "avoir émis", many: "avoirs émis" },
  { key: "paiement", test: /^Paiement de .+ (par|sur) /, one: "paiement saisi", many: "paiements saisis" },
  { key: "correction", test: /^Paiement corrigé/, one: "paiement corrigé", many: "paiements corrigés" },
  { key: "annulation", test: /annulé \(saisie erronée\)/, one: "paiement annulé", many: "paiements annulés" },
  { key: "client", test: /^Client .+ ajouté/, one: "client ajouté", many: "clients ajoutés" },
  { key: "fiche", test: /^Coordonnées de /, one: "fiche client modifiée", many: "fiches client modifiées" },
  { key: "demande", test: /^Demande traitée/, one: "demande traitée", many: "demandes traitées" },
  { key: "cloture", test: / clôturé$/, one: "mois clôturé", many: "mois clôturés" },
];
const localDay = (iso: string) => { const t = new Date(iso); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const hour = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayTitle = (day: string) => { const t = new Date(day + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); };

/** Team situation: what each person did in the office apps over a period, then the detailed journal. */
export function TeamReport() {
  const d = useData(), today = todayIso(), [period, setPeriod] = useState({ from: today.slice(0, 8) + "01", to: today }), [who, setWho] = useState(""), [shown, setShown] = useState(60);
  const valid = dateValid(period.from) && dateValid(period.to) && period.from <= period.to;
  const team = d.accounts.filter(a => a.role !== "responsable");
  const inPeriod = (e: Event) => { const day = localDay(e.at); return day >= period.from && day <= period.to; };
  const events = valid ? d.events.filter(e => team.some(a => a.id === e.by) && inPeriod(e)) : [];
  const journal = events.filter(e => !who || e.by === who);
  const lines = (a: Account) => {
    const mine = events.filter(e => e.by === a.id), counts = KINDS.map(k => ({ ...k, n: mine.filter(e => k.test.test(e.text)).length })).filter(k => k.n);
    const billed = mine.filter(e => /^Facture \S+ émise/.test(e.text)).reduce((n, e) => { const i = d.invoices.find(x => x.id === e.invoiceId); return n + (i ? invoiceTotals(i).ttc : 0); }, 0);
    const cashed = d.payments.filter(p => p.by === a.id && p.at && !p.cancelledAt && inPeriod({ at: p.at } as Event)).reduce((n, p) => n + p.amount, 0);
    const last = d.events.find(e => e.by === a.id);
    return { mine, counts, billed, cashed, last };
  };
  const days = [...new Set(journal.slice(0, shown).map(e => localDay(e.at)))];
  const name = (id: string) => d.accounts.find(a => a.id === id)?.name ?? "Équipe";
  function exportJournal() {
    downloadExcel([[`Situation de l’équipe · ${periodTitle(period)}`], ["Jour", "Heure", "Personne", "Espace", "Action"], ...journal.map(e => { const a = d.accounts.find(x => x.id === e.by); return [localDay(e.at), hour(e.at), a?.name ?? "", a ? ROLE_LABEL[a.role] : "", e.text]; })], `situation-equipe-${period.from}-${period.to}.xlsx`);
  }
  return <div className="cx-page cx-team">
    <PageHead title="Situation de l’équipe" sub={valid ? `Ce que chacun a fait dans son application. ${periodTitle(period)}.` : undefined}
      actions={valid && journal.length ? <Button icon={<Download size={16} aria-hidden="true" />} onClick={exportJournal}>Exporter en Excel</Button> : undefined} />
    <div className="cx-toolbar cx-noprint">
      <label className="cx-month"><span>Du</span><DateInput value={period.from} onChange={v => setPeriod(p => ({ ...p, from: v }))} /></label>
      <label className="cx-month"><span>Au</span><DateInput value={period.to} min={period.from} onChange={v => setPeriod(p => ({ ...p, to: v }))} /></label>
      <div className="cx-quick"><button type="button" className="cx-pill" onClick={() => setPeriod({ from: today, to: today })}>Aujourd’hui</button><button type="button" className="cx-pill" onClick={() => setPeriod({ from: today.slice(0, 8) + "01", to: today })}>Ce mois-ci</button><button type="button" className="cx-pill" onClick={() => setPeriod({ from: today.slice(0, 5) + "01-01", to: today })}>Cette année</button></div>
    </div>
    {!valid ? <Notice tone="bad">La date de début doit être avant la date de fin.</Notice> : <>
      <div className="cx-team-grid">{team.map(a => { const r = lines(a); return <section key={a.id} className={`cx-card cx-team-card${who === a.id ? " cx-on" : ""}`} aria-label={a.name}>
        <header><Monogram name={a.name} /><div><strong>{a.name}{!a.active && <span className="cx-chip">Désactivé</span>}</strong><small>{ROLE_LABEL[a.role]} · {r.last ? `dernière action ${ago(r.last.at)}` : "aucune action"}</small></div></header>
        {r.mine.length ? <dl className="cx-sum-kv">
          {r.counts.map(k => <div key={k.key}><dt>{k.n > 1 ? k.many.charAt(0).toUpperCase() + k.many.slice(1) : k.one.charAt(0).toUpperCase() + k.one.slice(1)}</dt><dd>{k.n}{k.key === "emise" && r.billed ? ` · ${money(r.billed)}` : k.key === "paiement" && r.cashed ? ` · ${money(r.cashed)}` : ""}</dd></div>)}
        </dl> : <p className="cx-team-none">Aucune action sur la période.</p>}
        {r.mine.length > 0 && <button type="button" className="cx-link-btn" onClick={() => { setWho(who === a.id ? "" : a.id); setShown(60); }}>{who === a.id ? "Voir toute l’équipe" : "Voir son journal"}</button>}
      </section>; })}</div>
      <section aria-labelledby="journal-title" className="cx-team-journal">
        <div className="cx-sec-head"><h2 id="journal-title" className="cx-sec-title">Journal{who ? ` de ${name(who)}` : " de l’équipe"} <em>({journal.length})</em></h2>
          <label className="cx-select"><span className="cx-sr">Personne</span><select value={who} onChange={e => { setWho(e.target.value); setShown(60); }}><option value="">Toute l’équipe</option>{team.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
        {journal.length ? <div className="cx-card cx-card-flush">{days.map(day => <div key={day} className="cx-journal-day"><h3>{dayTitle(day)}</h3>
          {journal.slice(0, shown).filter(e => localDay(e.at) === day).map(e => <p key={e.id} className="cx-journal-row"><time dateTime={e.at}>{hour(e.at)}</time><span><strong>{e.text}</strong><small>{name(e.by)}</small></span></p>)}</div>)}
          {journal.length > shown && <div className="cx-journal-more"><Button size="sm" onClick={() => setShown(n => n + 60)}>Afficher plus ({journal.length - shown})</Button></div>}</div>
          : <div className="cx-card"><Empty title="Aucune action sur la période.">Choisissez d’autres dates.</Empty></div>}
      </section>
    </>}
  </div>;
}
