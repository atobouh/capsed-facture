import { useState } from "react";
import { Check, Image, Trash2 } from "lucide-react";
import { createModel, imageData } from "./document-model";
import { DocumentPages } from "./document-renderer";
import DocumentPreview from "./document-preview";

export type InvoiceFormat = { banner: string; footerText: string; footerImage: string; stationery?: string | false };
export const defaultFormat: InvoiceFormat = { banner: "", footerText: "", footerImage: "", stationery: "/capsed-letterhead.webp" };
export function restoreFormat(data: any): InvoiceFormat {
  if (data.format) return { ...defaultFormat, ...data.format, footerText: data.format.footerText?.startsWith("Pied de page provisoire") ? "" : data.format.footerText || "" };
  const model = data.models?.find((m: any) => m.id === data.activeModelId) ?? data.models?.[0];
  return { banner: model?.blocks?.find((b: any) => b.kind === "image")?.image || data.template?.banner || "", footerText: model?.blocks?.find((b: any) => b.kind === "footer")?.text || data.template?.footer || defaultFormat.footerText, footerImage: "" };
}
export function fixedModel(format: InvoiceFormat) {
  const model = createModel("reference", "Format de facture");
  model.id = "format-unique"; model.stationery = format.stationery ?? defaultFormat.stationery;
  if (format.banner) model.blocks = model.blocks.map(b => b.kind === "company" ? { ...b, kind: "image", image: format.banner } : b);
  model.blocks = model.blocks.map(b => b.kind === "footer" ? format.footerImage ? { ...b, kind: "image", y: 1059, h: 55, image: format.footerImage } : { ...b, y: 1058, h: 56, text: format.footerText || " ", fontSize: 10 } : b);
  return model;
}
export default function FormatSettings({ format, onChange, invoice, words }: { format: InvoiceFormat; onChange: (f: InvoiceFormat) => void; invoice: any; words: (n: number) => string }) {
  const [error, setError] = useState("");
  async function upload(file: File | undefined, key: "banner" | "footerImage") { if (!file) return; try { const data = await imageData(file); onChange({ ...format, [key]: data }); setError(""); } catch (e) { setError((e as Error).message); } }
  return <><div className="heading"><div><small>UN FORMAT POUR TOUTES VOS FACTURES</small><h1>Format de facture</h1></div></div><div className="fixed-format-layout"><section className="card fixed-format-controls"><div className="format-section"><h2>Papier à en-tête</h2><p>Le document CAPSED fourni est intégré. Une bannière ou un pied de page personnalisé peut le remplacer.</p><div className="format-upload-preview">{format.banner ? <img src={format.banner} alt="Votre bannière" /> : <div><Image size={28} /><span>Bannière officielle CAPSED</span></div>}</div><label className="outline format-upload"><Image size={16} /> {format.banner ? "Remplacer la bannière" : "Choisir la bannière"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => upload(e.target.files?.[0], "banner")} /></label>{format.banner && <button className="format-remove" onClick={() => onChange({ ...format, banner: "" })}><Trash2 size={13} /> Retirer</button>}</div><div className="format-section"><h2>Pied de page</h2><label className="field"><span>Texte</span><textarea rows={4} value={format.footerText} onChange={e => onChange({ ...format, footerText: e.target.value })} placeholder="Laissez vide pour utiliser le pied de page officiel" /></label><label className="outline format-upload"><Image size={16} />{format.footerImage ? "Remplacer l’image" : "Utiliser une image"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => upload(e.target.files?.[0], "footerImage")} /></label>{format.footerImage && <><img className="footer-image-preview" src={format.footerImage} alt="Votre pied de page" /><p className="format-hint">L’image remplace le texte ci-dessus sur la facture.</p><button className="format-remove" onClick={() => onChange({ ...format, footerImage: "" })}><Trash2 size={13} /> Retirer l’image</button></>}</div>{error && <p className="payment-error" role="alert">{error}</p>}<div className="format-save-note"><Check size={16} /><span>Pour les prochaines factures uniquement.</span></div></section><section className="fixed-format-preview"><DocumentPreview title="Aperçu de votre facture"><DocumentPages model={fixedModel(format)} invoice={{ ...invoice, company: { ...invoice.company, logo: "" } }} words={words} /></DocumentPreview><p className="format-example-note">Données d’exemple.</p></section></div></>;
}
