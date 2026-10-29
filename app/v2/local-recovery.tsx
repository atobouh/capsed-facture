import { useSyncExternalStore } from 'react';
import { Button, Notice } from './ui';
import { getLocalHealth, recoveryExport, subscribeLocalHealth } from './local-storage';
import { recoverSync, useSync } from './sync';
export function useLocalHealth() { return useSyncExternalStore(subscribeLocalHealth, getLocalHealth, getLocalHealth); }
export function RepairAction() {
  const health = useLocalHealth(), sync = useSync();
  return <>
    <button type="button" className="cx-link-btn" disabled={sync.busy || sync.repairing} title="Conserver une sauvegarde locale, envoyer les modifications valides et récupérer les données du serveur." onClick={() => { void recoverSync(); }}>{sync.repairing ? 'Réparation en cours…' : 'Synchroniser et réparer'}</button>
    {health.some(v => v.backupKey && v.code !== 'REPAIR_SNAPSHOT') && <button type="button" className="cx-link-btn" onClick={exportBackup}>Exporter les sauvegardes de données</button>}
  </>;
}
function exportBackup() {
  const blob = new Blob([JSON.stringify(recoveryExport(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'capsed-recuperation-locale.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function label(key: string) {
  if (key.endsWith('-sync-outbox')) return 'Modifications en attente d’envoi';
  if (key.endsWith('-data')) return 'Données de facturation';
  if (key.endsWith('-device')) return 'Configuration de connexion';
  if (key.includes('-sync-')) return 'État de synchronisation';
  return 'Paramètres de récupération';
}
export function LocalRecovery({ linked = true }: { linked?: boolean }) {
  const health = useLocalHealth(), sync = useSync(), active = health.filter(v => !v.resolved);
  return <section className="cx-signin-form" role="status">
    <h2>{active.length ? 'La copie locale nécessite une réparation' : health.length ? 'Sauvegardes de récupération' : 'Synchronisation et réparation'}</h2>
    <Notice tone="warn">{active.length ? 'Certains enregistrements locaux sont illisibles ou incompatibles. CAPSED reste ouvert en mode récupération ; les écrans de facturation sont suspendus pour éviter des totaux incorrects.' : health.length ? 'Les originaux archivés restent disponibles ; une donnée illisible non envoyée peut nécessiter une récupération manuelle.' : 'Récupérez une copie complète depuis le serveur. Les saisies valides en attente d’envoi et une sauvegarde locale sont conservées.'}</Notice>
    <ul>{health.map((v, i) => <li key={i}>{label(v.key)} : {v.resolved ? 'copie archivée' : v.code}{v.backupKey ? ' · sauvegarde conservée' : ''}</li>)}</ul>
    {sync.error && <Notice tone="warn">{sync.error}</Notice>}
    {linked ? <RepairAction /> : <p>La configuration de connexion manque ou est endommagée. Reliez ce poste ci-dessous avec un code de la Direction ; aucune donnée métier n’est effacée.</p>}
    {!linked && health.some(v => v.backupKey) && <Button kind="quiet" onClick={exportBackup}>Exporter les sauvegardes de données</Button>}
  </section>;
}
