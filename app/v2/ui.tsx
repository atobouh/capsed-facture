import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Info, MoreHorizontal, Search, X } from "lucide-react";
import { DocumentPages } from "../document-renderer";
import { fixedModel } from "../invoice-format";
import CreditPaper from "../credit-note";
import AccountStatement from "../account-statement";
import type { StatementPeriod } from "../statement-period";
import type { DocumentModel } from "../document-model";
import { words } from "./words";
import { STATUS_TONE, num, timeFr, accountName, getData, monthLabel } from "./store";
import type { CreditNote, Data, Event, Invoice } from "./store";

export type Tone = "neutral" | "info" | "warn" | "good" | "bad";

export function Button({ kind = "secondary", icon, children, onClick, disabled, type = "button", wide, title, size }: { kind?: "primary" | "secondary" | "quiet" | "link" | "accent" | "ghost-light"; icon?: ReactNode; children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; wide?: boolean; title?: string; size?: "sm" }) {
  return <button type={type} className={`cx-btn cx-btn-${kind}${wide ? " cx-wide" : ""}${size ? " cx-btn-sm" : ""}`} onClick={onClick} disabled={disabled} title={title}>{icon}<span>{children}</span></button>;
}
export function Chip({ tone = "neutral", children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) { return <span className={`cx-chip cx-tone-${tone}`}>{icon}{children}</span>; }
/** Final states are stamped like the office cachet; states still moving are a soft pill. */
export function Stamp({ tone, children }: { tone: "good" | "bad" | "plum"; children: ReactNode }) { return <span className={`cx-chip cx-tone-${tone}`}>{children}</span>; }
export function StatusChip({ status }: { status: string }) {
  return <Chip tone={STATUS_TONE[status] ?? "neutral"}>{status}</Chip>;
}
/** Month chosen with two arrows: no calendar widget, no browser-language month names. */
export function MonthStepper({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const shift = (n: number) => { const [y, m] = value.split("-").map(Number), d = new Date(y, m - 1 + n, 1); onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };
  return <div className="cx-monthstep" role="group" aria-label="Mois affiché"><button type="button" onClick={() => shift(-1)} aria-label="Mois précédent"><ChevronLeft size={20} /></button><strong aria-live="polite">{monthLabel(value)}</strong><button type="button" onClick={() => shift(1)} aria-label="Mois suivant"><ChevronRight size={20} /></button></div>;
}
/** True when the window is wide enough to show a list and its detail side by side. */
export function useWide(min = 1180) {
  const q = `(min-width: ${min}px)`;
  return useSyncExternalStore(cb => { const m = window.matchMedia(q); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); }, () => window.matchMedia(q).matches, () => true);
}

export function Field({ label, hint, error, children, required, optional, wide }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; required?: boolean; optional?: boolean; wide?: boolean }) {
  return <label className={`cx-field${error ? " cx-has-error" : ""}${wide ? " cx-span2" : ""}`}>
    <span className="cx-label">{label}{required && <b aria-hidden> *</b>}{optional && <em>, facultatif</em>}</span>
    {children}
    {error ? <span className="cx-error" role="alert"><CircleAlert size={15} />{error}</span> : hint ? <span className="cx-hint">{hint}</span> : null}
  </label>;
}
export function TextInput({ value, onChange, placeholder, autoFocus, inputMode, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; inputMode?: "text" | "tel" | "email" | "numeric"; type?: string }) {
  return <input className="cx-input" type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} inputMode={inputMode} />;
}
export function TextArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea className="cx-input cx-textarea" rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />;
}
export function DateInput({ value, onChange, min, max }: { value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  return <input className="cx-input" type="date" value={value} min={min} max={max} onChange={e => onChange(e.target.value)} />;
}
/** Amount field: digits only, shown with thousands spaces as you type. */
export function MoneyInput({ value, onChange, autoFocus, unit = "FCFA" }: { value: number; onChange: (v: number) => void; autoFocus?: boolean; unit?: string }) {
  return <div className="cx-money"><input className="cx-input cx-input-money" inputMode="numeric" autoFocus={autoFocus} value={value ? num(value) : ""} placeholder="0" onChange={e => onChange(Number(e.target.value.replace(/\D/g, "").slice(0, 12)) || 0)} /><span>{unit}</span></div>;
}
export function NumberInput({ value, onChange, placeholder = "0", decimals, unit }: { value: number; onChange: (v: number) => void; placeholder?: string; decimals?: boolean; unit?: string }) {
  const [text, setText] = useState<string | null>(null), shown = text ?? (value ? String(value).replace(".", ",") : "");
  return <div className="cx-money"><input className="cx-input" inputMode={decimals ? "decimal" : "numeric"} value={shown} placeholder={placeholder} onBlur={() => setText(null)} onChange={e => { const raw = decimals ? e.target.value.replace(/[^\d,.]/g, "") : e.target.value.replace(/\D/g, ""); setText(raw); onChange(Number(raw.replace(",", ".")) || 0); }} />{unit && <span>{unit}</span>}</div>;
}
export function Choice<T extends string>({ options, value, onChange, columns = 2 }: { options: { value: T; label: string; sub?: string }[]; value: T | ""; onChange: (v: T) => void; columns?: number }) {
  return <div className={`cx-choice${columns >= 5 ? " cx-choice-compact" : ""}`} role="radiogroup" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${columns >= 5 ? 72 : columns >= 3 ? 140 : 190}px, 1fr))` }}>
    {options.map(o => <button type="button" role="radio" aria-checked={value === o.value} key={o.value} className={`cx-choice-item${value === o.value ? " cx-on" : ""}`} onClick={() => onChange(o.value)}>
      <span className="cx-choice-dot">{value === o.value && <Check size={13} strokeWidth={3} />}</span><span><strong>{o.label}</strong>{o.sub && <small>{o.sub}</small>}</span>
    </button>)}
  </div>;
}
export function SearchBox({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  return <div className="cx-search"><Search size={19} /><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder} />{value && <button type="button" onClick={() => onChange("")} aria-label="Effacer la recherche"><X size={17} /></button>}</div>;
}
export const norm = (s: string) => s.toLocaleLowerCase("fr").normalize("NFD").replace(/\p{M}/gu, "");
export const matches = (q: string, ...fields: (string | null | undefined)[]) => { const n = norm(q.trim()); return !n || fields.some(f => norm(f ?? "").includes(n)); };

export function Notice({ tone = "info", children, title, action }: { tone?: Tone; children?: ReactNode; title?: string; action?: ReactNode }) {
  return <div className={`cx-notice cx-tone-${tone}`} role={tone === "bad" ? "alert" : "status"}><span className="cx-notice-icon">{tone === "info" ? <Info size={18} /> : tone === "good" ? <Check size={18} /> : <CircleAlert size={18} />}</span><div>{title && <strong>{title}</strong>}{children && <div>{children}</div>}</div>{action}</div>;
}

/** A dialog. `side` slides a form in from the right (a phone shows it as a bottom sheet); without it, a small centred box for confirmations. */
export function Modal({ title, subtitle, children, onClose, actions, wide, side }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; actions?: ReactNode; wide?: boolean; side?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return <div className={`cx-overlay cx-noprint${side ? " cx-overlay-side" : ""}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`cx-modal${wide ? " cx-modal-wide" : ""}${side ? " cx-modal-side" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="cx-icon-btn" onClick={onClose} aria-label="Fermer"><X size={20} /></button></header>
      <div className="cx-modal-body">{children}</div>
      {actions && <footer>{actions}</footer>}
    </div>
  </div>;
}
/** Asks before any serious action and names its exact effect. */
export function Confirm({ title, children, confirm, cancel = "Retour", onConfirm, onClose }: { title: string; children: ReactNode; confirm: string; cancel?: string; onConfirm: () => void; onClose: () => void }) {
  return <Modal title={title} onClose={onClose} actions={<><Button kind="quiet" onClick={onClose}>{cancel}</Button><Button kind="primary" onClick={onConfirm}>{confirm}</Button></>}>{children}</Modal>;
}
/** "More actions" menu. Drawn in a layer above the page (never inside a scrolling panel), flipped to stay on screen. */
export function MoreMenu({ items, label = "Plus d’actions", iconOnly }: { items: { label: string; hint?: string; onClick: () => void; disabled?: boolean }[]; label?: string; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false), btn = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), [pos, setPos] = useState<{ top: number; left: number } | null>(null), [host, setHost] = useState<Element | null>(null);
  useLayoutEffect(() => {
    if (!open || !btn.current || !menu.current) return;
    const r = btn.current.getBoundingClientRect(), m = menu.current.getBoundingClientRect(), pad = 8;
    let left = r.right - m.width; if (left < pad) left = Math.min(r.left, window.innerWidth - m.width - pad);
    let top = r.bottom + 4; if (top + m.height > window.innerHeight - pad) top = Math.max(pad, r.top - m.height - 4);
    setPos({ top, left: Math.max(pad, left) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const close = () => setOpen(false), esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); window.addEventListener("resize", close); window.addEventListener("scroll", close, true); window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); window.removeEventListener("keydown", esc); };
  }, [open]);
  if (!items.length) return null;
  return <>
    <button ref={btn} type="button" className={`cx-btn cx-btn-secondary${iconOnly ? " cx-btn-icon" : ""}`} aria-haspopup="menu" aria-expanded={open} aria-label={iconOnly ? label : undefined} title={iconOnly ? label : undefined} onClick={e => { setHost(e.currentTarget.closest(".cx-app") ?? document.body); setPos(null); setOpen(o => !o); }}><MoreHorizontal size={17} aria-hidden="true" />{!iconOnly && <><span>{label}</span><ChevronDown size={15} aria-hidden="true" /></>}</button>
    {open && host && createPortal(<div ref={menu} className="cx-more-menu" role="menu" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>{items.map(i => <button type="button" role="menuitem" key={i.label} disabled={i.disabled} onClick={() => { setOpen(false); i.onClick(); }}><strong>{i.label}</strong>{i.hint && <small>{i.hint}</small>}</button>)}</div>, host)}
  </>;
}

type Toast = { id: number; text: string; tone: "good" | "warn" };
let toasts: Toast[] = []; const toastListeners = new Set<() => void>();
export function toast(text: string, tone: "good" | "warn" = "good") {
  const id = Date.now() + Math.random(); toasts = [...toasts, { id, text, tone }]; toastListeners.forEach(l => l());
  setTimeout(() => { toasts = toasts.filter(t => t.id !== id); toastListeners.forEach(l => l()); }, 6000);
}
export function ToastHost() {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force(n => n + 1); toastListeners.add(l); return () => { toastListeners.delete(l); }; }, []);
  return <div className="cx-toasts cx-noprint" aria-live="polite">{toasts.map(t => <div key={t.id} className={`cx-toast cx-toast-${t.tone}`}>{t.tone === "good" ? <Check size={18} /> : <CircleAlert size={18} />}<span>{t.text}</span><button type="button" aria-label="Fermer" onClick={() => { toasts = toasts.filter(x => x.id !== t.id); toastListeners.forEach(l => l()); }}><X size={16} /></button></div>)}</div>;
}

export function Timeline({ events, empty = "Rien pour l’instant." }: { events: Event[]; empty?: string }) {
  if (!events.length) return <p className="cx-muted">{empty}</p>;
  return <ol className="cx-timeline">{events.map(e => <li key={e.id}><span className="cx-dot" /><div><p>{e.text}</p><small>{accountName(e.by)}, {timeFr(e.at)}</small></div></li>)}</ol>;
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
/** Round initials for a client: gives each row a quick visual anchor. */
export function Monogram({ name }: { name: string }) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 3; return <span className={`cx-mono cx-mono-${h}`} aria-hidden="true">{initials(name)}</span>; }
export function Stat({ label, value, tone, sub, big }: { label: string; value: string; tone?: Tone; sub?: ReactNode; big?: boolean }) {
  return <div className={`cx-stat${tone ? ` cx-stat-${tone}` : ""}${big ? " cx-stat-big" : ""}`}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}
export function Empty({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return <div className="cx-empty">{icon}<strong>{title}</strong>{children && <p>{children}</p>}{action}</div>;
}
export function PageHead({ title, sub, actions, back, pane, tools }: { kicker?: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { label: string; onClick: () => void }; pane?: boolean; tools?: ReactNode }) {
  return <header className={`cx-page-head cx-noprint${pane ? " cx-pane-head" : ""}`}>
    {back && <button type="button" className="cx-back" onClick={back.onClick}><ChevronLeft size={18} aria-hidden="true" />{back.label}</button>}
    <div className="cx-page-head-row"><div className="cx-page-title">{pane ? <h2>{title}</h2> : <h1>{title}</h1>}{sub && <p>{sub}</p>}</div>{tools && <div className="cx-head-tools">{tools}</div>}{actions && <div className="cx-head-actions">{actions}</div>}</div>
  </header>;
}
/** A row in a list pane: who and what on the left, the amount and its state on the right. */
export function Row({ title, sub, amount, state, current, onClick, lead, todo }: { title: ReactNode; sub?: ReactNode; amount?: ReactNode; state?: ReactNode; current?: boolean; onClick: () => void; lead?: ReactNode; todo?: string }) {
  return <button type="button" className="cx-row" aria-current={current || undefined} onClick={onClick}>{lead}<span className="cx-row-main"><strong>{title}</strong>{sub && <small>{sub}</small>}{todo && <em className="cx-todo">{todo}</em>}</span>{(amount || state) && <span className="cx-row-end">{amount && <strong>{amount}</strong>}{state}</span>}</button>;
}

/** Shows A4 pages whole, scaled to the available width: no inner scroll, nothing cropped. Prints at full size. */
export function FitPaper({ children, label }: { children: ReactNode; label: string }) {
  const outer = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null), [box, setBox] = useState({ scale: 1, height: 0 });
  useEffect(() => {
    const o = outer.current, i = inner.current; if (!o || !i) return;
    const measure = () => { const scale = Math.min(1, o.clientWidth / 794); setBox(b => b.scale === scale && b.height === i.offsetHeight ? b : { scale, height: i.offsetHeight }); };
    const ro = new ResizeObserver(measure); ro.observe(o); ro.observe(i); measure(); return () => ro.disconnect();
  }, []);
  return <figure className="cx-paper" aria-label={label} ref={outer} style={{ height: box.height ? box.height * box.scale : undefined }}>
    <div className="cx-paper-sheet" ref={inner} style={{ transform: `scale(${box.scale})`, marginLeft: box.scale < 1 ? 0 : "auto", marginRight: box.scale < 1 ? 0 : "auto" }}>{children}</div>
  </figure>;
}
export function Paper({ invoice, title }: { invoice: Invoice; title?: string }) {
  const d = getData();
  return <FitPaper label={title ?? `Facture ${invoice.number}`}><DocumentPages model={(invoice.template as { document?: DocumentModel } | undefined)?.document ?? fixedModel(d.format)} invoice={invoice} words={words} /></FitPaper>;
}
export function CreditPaperView({ credit }: { credit: CreditNote }) {
  return <FitPaper label={`Avoir ${credit.number}`}><CreditPaper credit={credit} /></FitPaper>;
}
export function StatementPaper({ d, clientId, period }: { d: Pick<Data, "clients" | "invoices" | "payments" | "credits" | "format">; clientId: string; period: StatementPeriod }) {
  return <FitPaper label={clientId ? "Situation du client" : "Situation des clients"}><AccountStatement clients={d.clients} invoices={d.invoices} payments={d.payments} credits={d.credits} clientId={clientId} format={d.format} period={period} /></FitPaper>;
}
