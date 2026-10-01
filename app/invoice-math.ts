export type TaxMode = "ht" | "ttc";
export type FinancialLine = { id?: string; quantity: number; unitPrice: number };
export type FinancialInvoice = { lines: FinancialLine[]; taxRate: number; advance: number; taxMode?: TaxMode; discountRate?: number };
export const paymentMethods = ["Chèque", "Virement", "OM", "MoMo", "Espèces"];
export const normalizePayment = (value: string) => value === "Banque" || value === "Virement bancaire" ? "Virement" : value === "Orange Money" ? "OM" : value === "MTN Mobile Money" ? "MoMo" : value || "Espèces";
export const moneyRound = (value: number) => Math.round((Number(value) || 0) + Number.EPSILON);
export const lineAmount = (line: FinancialLine) => moneyRound(Number(line.quantity) * Number(line.unitPrice));
export const quantityLabel = (value: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 8 }).format(value);
export function invoiceTotals(invoice: FinancialInvoice) {
  const subtotal = invoice.lines.reduce((sum, line) => sum + lineAmount(line), 0);
  const discount = Math.min(subtotal, Math.max(0, moneyRound(subtotal * (invoice.discountRate || 0) / 100)));
  const ht = subtotal - discount;
  const taxMode: TaxMode = invoice.taxMode ?? (invoice.taxRate > 0 ? "ttc" : "ht");
  const tax = taxMode === "ttc" ? moneyRound(ht * invoice.taxRate / 100) : 0;
  const ttc = ht + tax;
  return { subtotal, discount, ht, tax, ttc, taxMode, due: Math.max(0, ttc - moneyRound(invoice.advance)), totalLabel: taxMode === "ttc" ? "Total TTC" : "Total hors taxe" };
}
export function allocatedLines(invoice: FinancialInvoice) {
  const totals = invoiceTotals(invoice);
  let grossPrefix = 0, netPrefix = 0, lastDiscount = 0, lastTax = 0;
  return invoice.lines.map(line => {
    const gross = lineAmount(line);
    grossPrefix += gross;
    const cumulativeDiscount = totals.subtotal ? moneyRound(totals.discount * grossPrefix / totals.subtotal) : 0;
    const discount = cumulativeDiscount - lastDiscount;
    lastDiscount = cumulativeDiscount;
    const ht = gross - discount;
    netPrefix += ht;
    const cumulativeTax = totals.ht ? moneyRound(totals.tax * netPrefix / totals.ht) : 0;
    const tax = cumulativeTax - lastTax;
    lastTax = cumulativeTax;
    return { ...line, gross, discount, ht, tax, amount: ht + tax };
  });
}
export type CreditArticle = { sourceLineId: string; designation: string; destination: string; quantity: number; unitPrice: number; ht: number; tax: number; amount: number };
export function creditSelection(invoice: any, credits: any[], quantities: Record<string, number>) {
  const previous = credits.filter(c => c.invoiceId === invoice.id);
  const lines: CreditArticle[] = [];
  const available = allocatedLines(invoice).map((line: any) => {
    const used = previous.flatMap(c => c.lines ?? []).filter((l: any) => l.sourceLineId === line.id);
    const usedQuantity = used.reduce((n: number, l: any) => n + l.quantity, 0);
    const remaining = Math.max(0, Number((line.quantity - usedQuantity).toFixed(8)));
    const quantity = Number(quantities[line.id] || 0);
    if (quantity > 0 && quantity <= remaining) {
      const cumulative = Math.min(line.quantity, usedQuantity + quantity);
      const ht = Math.max(0, moneyRound(line.ht * cumulative / line.quantity) - used.reduce((n: number, l: any) => n + l.ht, 0));
      const tax = Math.max(0, moneyRound(line.tax * cumulative / line.quantity) - used.reduce((n: number, l: any) => n + l.tax, 0));
      lines.push({ sourceLineId: line.id, designation: invoice.lines.find((l:any)=>l.id===line.id)?.designation ?? "", destination: invoice.lines.find((l:any)=>l.id===line.id)?.destination ?? "", quantity, unitPrice: line.unitPrice, ht, tax, amount: ht + tax });
    }
    return { ...line, remaining };
  });
  return { available, lines, ht: lines.reduce((n,l)=>n+l.ht,0), tax: lines.reduce((n,l)=>n+l.tax,0), amount: lines.reduce((n,l)=>n+l.amount,0) };
}

export const printedAmount=(n:number)=>new Intl.NumberFormat("fr-FR",{maximumFractionDigits:0}).format(Math.round(n));
export function printedQuantity(value:number):string {
 if(Number.isInteger(value))return printedAmount(value);
 const precision=String(Number(value.toFixed(8))).split(".")[1]?.length||0,den=Math.pow(10,precision),num=Math.round(value*den);
 const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a,d=gcd(num,den);
 const whole=Math.floor(value),fraction=Number((value-whole).toFixed(8));if(fraction===0.5)return (whole?printedAmount(whole):"")+"½";if(fraction===0.25)return (whole?printedAmount(whole):"")+"¼";if(fraction===0.75)return (whole?printedAmount(whole):"")+"¾";return printedAmount(num/d)+"/"+printedAmount(den/d);
}
