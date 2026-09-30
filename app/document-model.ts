export type BlockKind = "text" | "image" | "company" | "client" | "reference" | "lines" | "totals" | "payment" | "words" | "footer" | "signature" | "rule" | "table";
export type DocumentBlock = {
  id: string; kind: BlockKind; x: number; y: number; w: number; h: number;
  text: string; fontSize: number; color: string; bold: boolean;
  align: "left" | "center" | "right"; image?: string; imageFit?: "contain" | "cover"; cells?: string[][]; headers?: string[];
};
export type DocumentModel = { id: string; name: string; blocks: DocumentBlock[] };
export const PAGE_W = 794, PAGE_H = 1123;
export const BLOCKS: { kind: BlockKind; label: string; hint: string }[] = [
  { kind: "text", label: "Texte libre", hint: "Titre, mention, paragraphe" },
  { kind: "image", label: "Image / bannière", hint: "Votre logo ou votre image" },
  { kind: "company", label: "Entreprise", hint: "Logo et coordonnées" },
  { kind: "client", label: "Client", hint: "Coordonnées automatiques" },
  { kind: "reference", label: "Numéro et date", hint: "Numérotation automatique" },
  { kind: "lines", label: "Prestations", hint: "Tableau de la facture" },
  { kind: "totals", label: "Totaux et avance", hint: "Calculs automatiques" },
  { kind: "payment", label: "Règlement", hint: "Mode de paiement et note" },
  { kind: "words", label: "Montant en lettres", hint: "Rempli automatiquement" },
  { kind: "signature", label: "Signature", hint: "Une zone pour signer" },
  { kind: "footer", label: "Pied de page", hint: "Identifiants de l’entreprise" },
  { kind: "rule", label: "Trait", hint: "Séparer deux sections" },
  { kind: "table", label: "Tableau libre", hint: "Vos propres cases et textes" },
];
export function makeBlock(kind: BlockKind, x = 48, y = 48): DocumentBlock {
  const sizes: Partial<Record<BlockKind, [number, number]>> = {
    company: [698, 110], client: [330, 160], reference: [300, 80], lines: [698, 270],
    totals: [300, 190], payment: [330, 100], words: [698, 65], footer: [698, 55],
    signature: [200, 100], rule: [698, 8], image: [698, 110], table: [420, 130],
  };
  const [w, h] = sizes[kind] ?? [320, 65];
  return { id: crypto.randomUUID(), kind, x: Math.min(x, PAGE_W - w), y: Math.min(y, PAGE_H - h), w, h,
    text: kind === "text" ? "Votre texte" : kind === "signature" ? "La Direction" : "", fontSize: kind === "text" ? 22 : 12,
    color: "#263c40", bold: kind === "text", align: "left", ...(kind === "table" ? { cells: [["Libellé", "Valeur"], ["", ""], ["", ""]] } : {}) };
}
export function createModel(style: "reference" | "editorial" | "blank", name?: string): DocumentModel {
  const blocks: DocumentBlock[] = [];
  const add = (kind: BlockKind, x: number, y: number, extra: Partial<DocumentBlock> = {}) => blocks.push({ ...makeBlock(kind, x, y), ...extra });
  if (style !== "blank") {
    add("company", 48, 45, { h: 110, align: style === "reference" ? "center" : "left" });
    add("rule", 48, 165);
    add("text", 48, 195, { text: "FACTURE", w: 300, h: 50, fontSize: 32 });
    add("reference", 446, 195, { w: 300, align: "right" });
    add("client", 48, 280, { h: 155 });
    add("lines", 48, 465, { h: 260 });
    add("payment", 48, 745, { h: 130 });
    add("totals", 446, 745, { h: 190 });
    add("words", 48, 945, { w: 440, h: 80 });
    add("signature", 546, 950, { align: "center", h: 85 });
    add("rule", 48, 1050);
    add("footer", 48, 1065, { h: 40, fontSize: 9, align: "center" });
    if (style === "editorial") { blocks.forEach(b => b.color = "#285a50"); }
  }
  return { id: crypto.randomUUID(), name: name ?? (style === "blank" ? "Mon modèle" : style === "reference" ? "CAPSED · classique" : "Éditorial"), blocks };
}
export function interpolate(text: string, invoice: any) {
  const values: Record<string, string> = { client: invoice.client.name, entreprise: invoice.company.name, numero: invoice.number, date: new Date(invoice.date + "T12:00:00").toLocaleDateString("fr-FR"), paiement: invoice.payment };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (original, key) => values[key] ?? original);
}
export const formatMoney = (n: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n))} FCFA`;
export async function imageData(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choisissez une image PNG, JPG ou WebP.");
  if (file.size > 15_000_000) throw new Error("Cette image est trop volumineuse (15 Mo maximum).");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ratio = Math.min(1, 1400 / bitmap.width, 1400 / bitmap.height);
  canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return canvas.toDataURL("image/webp", .8);
}
