/** Check document snapshots before any register or payment view dereferences them. */
export function documentIssues(data: { invoices: unknown[]; credits: unknown[] }): string[] {
  const issues: string[] = [];
  for (const [kind, records] of [['Facture', data.invoices], ['Avoir', data.credits]] as const) {
    for (const raw of records) {
      const r = raw as Record<string, unknown>;
      const client = r?.client as Record<string, unknown> | undefined;
      const label = typeof r?.number === 'string' ? r.number : typeof r?.id === 'string' ? r.id : '(sans référence)';
      if (!client || typeof client !== 'object' || typeof client.id !== 'string' || typeof client.name !== 'string') {
        issues.push(`${kind} ${label} : fiche client absente ou incomplète.`);
      }
      const company = r?.company as Record<string, unknown> | undefined;
      if (!company || typeof company !== 'object' || typeof company.name !== 'string') issues.push(`${kind} ${label} : fiche entreprise absente ou incomplète.`);
      if (typeof r?.number !== 'string' || typeof r?.date !== 'string') issues.push(`${kind} ${label} : numéro ou date absent.`);
      if (kind === 'Facture' && (!Array.isArray(r?.lines) || !r.lines.every(line => line && typeof line === 'object' && typeof line.designation === 'string' && typeof line.quantity === 'number' && Number.isFinite(line.quantity) && typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice)))) issues.push(`${kind} ${label} : lignes de facturation incomplètes.`);
    }
  }
  return issues;
}
