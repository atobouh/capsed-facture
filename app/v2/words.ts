// Montant en lettres (repris du prototype).
export function words(n: number): string {
  n = Math.round(n); if (!n) return "zéro";
  const u = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
  const below100 = (v: number): string => { if (v < 20) return u[v]; if (v < 70) { const d = Math.floor(v / 10), r = v % 10; return ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"][d] + (r === 1 ? " et un" : r ? "-" + u[r] : ""); } if (v < 80) return v === 71 ? "soixante et onze" : "soixante-" + below100(v - 60); return "quatre-vingt" + (v === 80 ? "s" : "-" + below100(v - 80)); };
  const below1000 = (v: number): string => v < 100 ? below100(v) : (Math.floor(v / 100) === 1 ? "cent" : u[Math.floor(v / 100)] + " cent" + (v % 100 ? "" : "s")) + (v % 100 ? " " + below100(v % 100) : "");
  if (n >= 1e9) return new Intl.NumberFormat("fr-FR").format(n);
  const parts: string[] = []; const m = Math.floor(n / 1e6), k = Math.floor((n % 1e6) / 1000), r = n % 1000;
  if (m) parts.push(m === 1 ? "un million" : below1000(m) + " millions"); if (k) parts.push(k === 1 ? "mille" : below1000(k).replace(/cents$/, "cent") + " mille"); if (r) parts.push(below1000(r)); return parts.join(" ");
}
