# CAPSED Facturation — conception de la V1

## But de cette version

Faire essayer le parcours à des utilisateurs non techniques avant de développer l’application desktop en Rust. Les données affichées au premier lancement sont des exemples. Chaque navigateur conserve séparément les clients, les factures et les réglages saisis pour cette démonstration.

## Parcours à faire valider

1. Ouvrir **Factures** : voir le mois, l’historique et le prochain numéro.
2. Ajouter un client une fois dans **Clients**.
3. Cliquer sur **Nouvelle facture**, choisir ce client, saisir une ou plusieurs prestations et renseigner la TVA ou une avance.
4. Émettre la facture : le numéro mensuel est attribué, les coordonnées du client et de l’entreprise sont copiées dans la facture.
5. Ouvrir la facture et utiliser **Imprimer / PDF** pour l’enregistrer en PDF depuis le navigateur.
6. En fin de période, clôturer le mois afin de bloquer les nouvelles émissions pour cette période.

7. Dans **Mon modèle**, ajouter une bannière, choisir l’un des trois styles, changer le titre, le libellé du règlement, la couleur ou le texte de pied de page ; l’aperçu de la facture se met à jour immédiatement.

L’interface privilégie les actions nommées, les champs visibles et les informations reprises automatiquement. Les données de la photo servent de référence pour les rubriques du document : contrat, désignation, destination, volume, prix unitaire, montant, total HT, TVA, total TTC et mode de règlement.

## Modèle prévu pour la version desktop

- **Entreprise** : coordonnées et logo éditables.
- **Client** : fiche réutilisable, avec nom, contact, adresse, téléphone, e-mail, NIU et RCCM.
- **Facture** : date, période, numéro, client et entreprise figés au moment de l’émission, lignes, TVA, avance, paiement et notes.
- **Modèle de facture** : bannière, textes, couleur et style sélectionnés ; chaque facture émise conserve une copie de ces réglages.
- **Période mensuelle** : état ouvert ou clôturé.
- **Numérotation** : compteur par période, réservé dans une transaction avec l’enregistrement de la facture. Un brouillon ne consomme aucun numéro. Une facture émise reste dans l’historique, même si elle doit ensuite être annulée, pour éviter une rupture de séquence.
- **Archivage** : base locale sauvegardable et PDF de chaque facture. Une restauration doit préserver l’historique et les numéros.

Pour la version desktop, les numéros devront être attribués par la base de données. La V1 web les simule dans le navigateur pour valider le parcours ; elle ne garantit pas une séquence commune entre plusieurs ordinateurs.

Le paquet web partageable est généré avec `node scripts/build-static.mjs` dans `dist/`. Il fonctionne sans serveur applicatif ; l'impression du navigateur permet d'enregistrer une facture en PDF.

## Points à décider après les retours utilisateurs

- Format définitif des numéros : par exemple `2026-09-001`, et règle exacte lors du changement de mois.
- Champs obligatoires du client et des lignes de facture.
- Traitement de l’avance : montant déjà encaissé, affichage du reste à payer et éventuel reçu séparé.
- Traitement d’une facture à corriger après émission : annulation ou avoir, sans réutiliser son numéro.
- Aspect final du PDF : logo officiel, mentions légales, signature, couleurs et emplacement des coordonnées.
