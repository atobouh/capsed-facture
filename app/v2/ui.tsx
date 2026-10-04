import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronDown, CircleAlert, Info, MoreHorizontal, Search, X } from "lucide-react";
import { DocumentPages } from "../document-renderer";
import DocumentPreview from "../document-preview";
import { defaultFormat, fixedModel } from "../invoice-format";
import { words } from "./words";
import { STATUS_TONE, num, timeFr, userName } from "./store";
import type { Event, Invoice, Status } from "./store";

export type Tone = "neutral" | "info" | "warn" | "good" | "bad";

export function Button({ kind = "secondary", icon, children, onClick, disabled, type = "button", wide, title }: { kind?: "primary" | "secondary" | "quiet" | "link"; icon?: ReactNode; children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; wide?: boolean; title?: string }) {
  return <button type={type} className={`cx-btn cx-btn-${kind}${wide ? " cx-wide" : ""}`} onClick={onClick} disabled={disabled} title={title}>{icon}<span>{children}</span></button>;
}
export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) { return <span className={`cx-chip cx-tone-${tone}`}>{children}</span>; }
export function StatusChip({ status }: { status: Status }) { return <Chip tone={STATUS_TONE[status]}>{status}</Chip>; }

export function Field({ label, hint, error, children, required, optional }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; required?: boolean; optional?: boolean }) {
  return <label className={`cx-field${error ? " cx-has-error" : ""}`}>
    <span className="cx-label">{label}{required && <b aria-hidden> *</b>}{optional && <em> · facultatif</em>}</span>
    {children}
    {error ? <span className="cx-error" role="alert"><CircleAlert size={16} />{error}</span> : hint ? <span className="cx-hint">{hint}</span> : null}
  </label>;
}
export function TextInput({ value, onChange, placeholder, autoFocus, inputMode, maxLength }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; inputMode?: "text" | "tel" | "email" | "numeric"; maxLength?: number }) {
  return <input className="cx-input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} inputMode={inputMode} maxLength={maxLength} />;
}
/** Amount field: digits only, shown with thousands spaces as you type. */
export function MoneyInput({ value, onChange, autoFocus }: { value: number; onChange: (v: number) => void; autoFocus?: boolean }) {
  return <div className="cx-money"><input className="cx-input cx-input-money" inputMode="numeric" autoFocus={autoFocus} value={value ? num(value) : ""} placeholder="0" onChange={e => onChange(Number(e.target.value.replace(/\D/g, "").slice(0, 12)) || 0)} /><span>FCFA</span></div>;
}
export function NumberInput({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return <input className="cx-input" inputMode="numeric" value={value ? num(value) : ""} placeholder={String(min)} onChange={e => onChange(Number(e.target.value.replace(/\D/g, "").slice(0, 9)) || 0)} />;
}
export function Choice<T extends string>({ options, value, onChange, columns }: { options: { value: T; label: string; sub?: string }[]; value: T | ""; onChange: (v: T) => void; columns?: number }) {
  return <div className="cx-choice" role="radiogroup" style={columns ? { gridTemplateColumns: `repeat(auto-fit, minmax(${columns >= 5 ? 112 : columns >= 3 ? 140 : 180}px, 1fr))` } : undefined}>
    {options.map(o => <button type="button" role="radio" aria-checked={value === o.value} key={o.value} className={`cx-choice-item${value === o.value ? " cx-on" : ""}`} onClick={() => onChange(o.value)}>
      <span className="cx-choice-dot">{value === o.value && <Check size={14} />}</span><span><strong>{o.label}</strong>{o.sub && <small>{o.sub}</small>}</span>
    </button>)}
  </div>;
}
export function SearchBox({ value, onChange, placeholder, autoFocus = true }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  return <div className="cx-search"><Search size={20} /><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder} />{value && <button type="button" onClick={() => onChange("")} aria-label="Effacer la recherche"><X size={18} /></button>}</div>;
}
export const matches = (q: string, ...fields: (string | null | undefined)[]) => { const n = q.trim().toLocaleLowerCase("fr").normalize("NFD").replace(/\p{M}/gu, ""); return !n || fields.some(f => (f ?? "").toLocaleLowerCase("fr").normalize("NFD").replace(/\p{M}/gu, "").includes(n)); };

export function Notice({ tone = "info", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <div className={`cx-notice cx-tone-${tone}`} role={tone === "bad" ? "alert" : "status"}>{tone === "info" ? <Info size={20} /> : tone === "good" ? <Check size={20} /> : <CircleAlert size={20} />}<div>{title && <strong>{title}</strong>}<div>{children}</div></div></div>;
}

/** Same frame for every task: title, progress, one step at a time, Back on the left, the named action on the right. */
export function Wizard({ title, steps, step, onBack, onExit, children, next }: { title: string; steps: string[]; step: number; onBack: () => void; onExit: () => void; children: ReactNode; next: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); if (step > 0) onBack(); else onExit(); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [step, onBack, onExit]);
  return <section className="cx-wizard">
    <header className="cx-wizard-head cx-noprint">
      <div><h1>{title}</h1><p>Étape {step + 1} sur {steps.length} · {steps[step]}</p></div>
      <button type="button" className="cx-btn cx-btn-quiet" onClick={onExit}><X size={18} /><span>Quitter</span></button>
    </header>
    <ol className="cx-steps cx-noprint" aria-label="Étapes">{steps.map((s, i) => <li key={s} className={i < step ? "cx-done" : i === step ? "cx-now" : ""}><span>{i < step ? <Check size={14} /> : i + 1}</span>{s}</li>)}</ol>
    <div className="cx-wizard-body">{children}</div>
    <footer className="cx-wizard-foot cx-noprint">
      <button type="button" className="cx-btn cx-btn-link" onClick={step > 0 ? onBack : onExit}>{step > 0 ? "← Retour" : "Annuler"}</button>
      <div>{next}</div>
    </footer>
  </section>;
}

export function Modal({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return <div className="cx-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="cx-modal" role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button type="button" className="cx-icon-btn" onClick={onClose} aria-label="Fermer"><X size={20} /></button></header>
      <div className="cx-modal-body">{children}</div>
      <footer>{actions}</footer>
    </div>
  </div>;
}

/** Rare actions live here, away from the main button. */
export function MoreMenu({ items }: { items: { label: string; hint?: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const k = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", k); return () => document.removeEventListener("mousedown", k); }, [open]);
  if (!items.length) return null;
  return <div className="cx-more" ref={ref}>
    <button type="button" className="cx-btn cx-btn-quiet" aria-expanded={open} onClick={() => setOpen(o => !o)}><MoreHorizontal size={18} /><span>Plus…</span><ChevronDown size={16} /></button>
    {open && <div className="cx-more-menu" role="menu">{items.map(i => <button type="button" role="menuitem" key={i.label} onClick={() => { setOpen(false); i.onClick(); }}><strong>{i.label}</strong>{i.hint && <small>{i.hint}</small>}</button>)}</div>}
  </div>;
}

// ——— Toasts: every save says exactly what happened ———
type Toast = { id: number; text: string; action?: { label: string; onClick: () => void } };
let toasts: Toast[] = []; const toastListeners = new Set<() => void>();
export function toast(text: string, action?: Toast["action"]) {
  const id = Date.now() + Math.random(); toasts = [...toasts, { id, text, action }]; toastListeners.forEach(l => l());
  setTimeout(() => { toasts = toasts.filter(t => t.id !== id); toastListeners.forEach(l => l()); }, 8000);
}
export function ToastHost() {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force(n => n + 1); toastListeners.add(l); return () => { toastListeners.delete(l); }; }, []);
  return <div className="cx-toasts cx-noprint" aria-live="polite">{toasts.map(t => <div key={t.id} className="cx-toast"><Check size={20} /><span>{t.text}</span>{t.action && <button type="button" onClick={t.action.onClick}>{t.action.label}</button>}</div>)}</div>;
}

export function Timeline({ events, empty = "Rien pour l’instant." }: { events: Event[]; empty?: string }) {
  if (!events.length) return <p className="cx-muted">{empty}</p>;
  return <ol className="cx-timeline">{events.map(e => <li key={e.id}><span className="cx-dot" /><div><p>{e.text}</p><small>{userName(e.by)} · {timeFr(e.at)}</small></div></li>)}</ol>;
}
export function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: Tone; sub?: string }) {
  return <div className={`cx-stat${tone ? ` cx-stat-${tone}` : ""}`}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="cx-empty"><strong>{title}</strong>{children && <p>{children}</p>}{action}</div>;
}
export function InvoicePaper({ invoice }: { invoice: Invoice }) {
  const printable = { ...invoice, number: invoice.number ?? "BROUILLON", client: invoice.client };
  return <div className="cx-paper"><DocumentPreview title={invoice.number ? `Facture ${invoice.number}` : "Aperçu avant émission"}><DocumentPages model={fixedModel(defaultFormat)} invoice={printable} words={words} /></DocumentPreview></div>;
}
