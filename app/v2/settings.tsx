import { useState } from "react";
import { Download, FolderOpen, Image as ImageIcon, RotateCcw } from "lucide-react";
import { imageData } from "../document-model";
import { Button, Confirm, Field, Notice, NumberInput, Paper, TextInput, toast } from "./ui";
import { DEFAULT_TERM, commit, fromBackup, getData, nowIso, setData, todayIso, useData } from "./store";
import type { Company } from "./store";

export function downloadBackup() {
  const { snapshot: _s, ...data } = getData(); void _s;
  const url = URL.createObjectURL(new Blob([JSON.stringify({ ...data, exportedAt: nowIso() }, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = `capsed-sauvegarde-${todayIso()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Sauvegarde téléchargée.");
}

export function CompanySettings({ by }: { by: string }) {
  const d = useData(), [company, setCompany] = useState<Company>(d.company);
  const dirty = JSON.stringify(company) !== JSON.stringify(d.company);
  const fields: [keyof Company, string, boolean?][] = [["name", "Nom de l’entreprise"], ["subtitle", "Activité", true], ["address", "Adresse", true], ["phone", "Téléphone"], ["email", "E-mail"], ["website", "Site web"], ["niu", "NIU"], ["rc", "RCCM"]];
  return <section className="cx-section" aria-labelledby="set-company">
    <div className="cx-section-head"><h2 id="set-company">Coordonnées de l’entreprise</h2><p>Imprimées sur les prochaines factures.</p></div>
    <form className="cx-form-grid" onSubmit={e => { e.preventDefault(); if (!dirty) return; commit(by, () => ({ company }), { text: "Coordonnées de l’entreprise modifiées" }); toast("Coordonnées enregistrées."); }}>
      {fields.map(([k, label, wide]) => <Field key={k} label={label} wide={wide}><TextInput value={company[k]} onChange={v => setCompany(c => ({ ...c, [k]: v }))} /></Field>)}
      <div className="cx-form-actions cx-span2"><Button kind="quiet" disabled={!dirty} onClick={() => setCompany(d.company)}>Annuler</Button><Button kind="primary" type="submit" disabled={!dirty}>Enregistrer les coordonnées</Button></div>
    </form>
  </section>;
}

/** Default internal payment deadline. Used for lateness only, never printed on an invoice. */
export function TermSettings({ by }: { by: string }) {
  const d = useData(), saved = d.paymentTerm ?? DEFAULT_TERM, [days, setDays] = useState(saved), ok = Number.isSafeInteger(days) && days >= 0 && days <= 365;
  return <section className="cx-section" aria-labelledby="set-term">
    <div className="cx-section-head"><h2 id="set-term">Délai de paiement</h2><p>Usage interne : sert à repérer les retards, n’est jamais imprimé sur les factures. Chaque facture peut avoir son propre délai.</p></div>
    <form className="cx-form-grid" onSubmit={e => { e.preventDefault(); if (!ok || days === saved) return; commit(by, () => ({ paymentTerm: days }), { text: `Délai de paiement par défaut : ${days} jours` }); toast("Délai de paiement enregistré."); }}>
      <Field label="Délai par défaut" hint="S’applique aux factures qui n’ont pas leur propre délai." error={ok ? undefined : "Entre 0 et 365 jours."}><NumberInput value={days} onChange={setDays} unit="jours" /></Field>
      <div className="cx-form-actions cx-span2"><Button kind="quiet" disabled={days === saved} onClick={() => setDays(saved)}>Annuler</Button><Button kind="primary" type="submit" disabled={!ok || days === saved}>Enregistrer le délai</Button></div>
    </form>
  </section>;
}

export function FormatSettings({ by }: { by: string }) {
  const d = useData(), [err, setErr] = useState(""), sample = d.invoices.at(-1);
  async function upload(file?: File) { if (!file) return; try { const data = await imageData(file); commit(by, x => ({ format: { ...x.format, banner: data } }), { text: "Bannière de facture remplacée" }); setErr(""); toast("Nouvelle bannière enregistrée."); } catch (e) { setErr((e as Error).message); } }
  return <section className="cx-section" aria-labelledby="set-format">
    <div className="cx-section-head"><h2 id="set-format">En-tête des factures</h2><p>Le papier CAPSED est utilisé par défaut. Le pied de page officiel est toujours imprimé.</p></div>
    <img className="cx-banner" src={d.format.banner || "capsed-header.webp"} alt={d.format.banner ? "Bannière choisie" : "En-tête officiel CAPSED"} width="1191" height="218" />
    <div className="cx-form-actions cx-left">
      <label className="cx-btn cx-btn-secondary cx-file"><ImageIcon size={17} aria-hidden="true" /><span>Choisir une autre image</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
      {d.format.banner && <Button kind="quiet" icon={<RotateCcw size={16} aria-hidden="true" />} onClick={() => { commit(by, x => ({ format: { ...x.format, banner: "" } }), { text: "En-tête officiel rétabli" }); toast("En-tête officiel CAPSED rétabli."); }}>Revenir à l’en-tête officiel</Button>}
    </div>
    {err && <Notice tone="bad">{err}</Notice>}
    {sample && <details className="cx-disclosure"><summary>Voir une facture avec cet en-tête</summary><Paper invoice={{ ...sample, template: undefined }} title="Exemple de facture" /></details>}
  </section>;
}

export function BackupSettings() {
  const [restore, setRestore] = useState<Record<string, unknown> | null>(null);
  async function pick(file?: File) { if (!file) return; try { const raw = JSON.parse(await file.text()); if (!Array.isArray(raw.clients) || !Array.isArray(raw.invoices) || typeof raw.company?.name !== "string") throw new Error("Ce fichier n’est pas une sauvegarde de CAPSED Facture."); setRestore(raw); } catch (e) { toast((e as Error).message || "Impossible de lire ce fichier.", "warn"); } }
  return <section className="cx-section" aria-labelledby="set-backup">
    <div className="cx-section-head"><h2 id="set-backup">Sauvegarde</h2><p>Un fichier avec tous les clients, factures, avoirs et paiements. Les sauvegardes du premier prototype sont acceptées.</p></div>
    <div className="cx-form-actions cx-left"><Button kind="primary" icon={<Download size={17} aria-hidden="true" />} onClick={downloadBackup}>Télécharger une sauvegarde</Button>
      <label className="cx-btn cx-btn-secondary cx-file"><FolderOpen size={17} aria-hidden="true" /><span>Restaurer une sauvegarde</span><input type="file" accept="application/json,.json" onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
    {restore && <Confirm title="Remplacer toutes les données ?" confirm="Restaurer cette sauvegarde" cancel="Garder les données actuelles" onClose={() => setRestore(null)} onConfirm={() => { setData(fromBackup(restore, getData())); setRestore(null); toast("Sauvegarde restaurée."); }}>
      <p>Les données actuelles seront remplacées par celles du fichier : {(restore.invoices as unknown[]).length} factures et {(restore.clients as unknown[]).length} clients.</p><p className="cx-muted">Téléchargez d’abord une sauvegarde des données actuelles si vous voulez les garder.</p></Confirm>}
  </section>;
}
