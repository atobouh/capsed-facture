# CAPSED Facturation — conception de la V1

## But de cette version

Faire essayer le parcours à des utilisateurs non techniques avant de développer l’application desktop en Rust. Les données affichées au premier lancement sont des exemples. Chaque navigateur conserve séparément les clients, les factures et les réglages saisis pour cette démonstration.

## Parcours à faire valider

1. Ouvrir **Factures** : voir le mois, l’historique et le prochain numéro.
2. Ajouter un client une fois dans **Clients**.
3. Cliquer sur **Nouvelle facture**, choisir ce client, saisir une ou plusieurs prestations et renseigner la TVA ou une avance.
4. Émettre la facture : le numéro mensuel est attribué, les coordonnées du client et de l’entreprise sont copiées dans la facture.
5. Ouvrir la facture et utiliser **Imprimer / PDF** pour l’enregistrer en PDF depuis le navigateur.
6. En fin de période, clôturer le mois : la période devient non modifiable et le mois suivant est ouvert.

7. Dans **Modèles**, créer un modèle depuis une page blanche ou une base prédéfinie. Glisser les blocs, les redimensionner et double-cliquer un texte pour écrire sur la page.
8. Ajouter ses images, textes libres, tableaux personnalisés et blocs de facturation. Le client, le numéro, la date, les prestations, la TVA et les totaux sont alimentés par la facture choisie.
9. Choisir le modèle lors de la création d’une facture. Une copie du modèle est conservée à l’émission ; modifier le modèle ensuite ne change pas les factures existantes.
10. Télécharger une sauvegarde JSON (clients, modèles, factures et périodes), ou restaurer une sauvegarde. Les factures individuelles peuvent aussi être imprimées ou enregistrées en PDF.

L’interface privilégie les actions nommées, les champs visibles et les informations reprises automatiquement. Les données de la photo servent de référence pour les rubriques du document : contrat, désignation, destination, volume, prix unitaire, montant, total HT, TVA, total TTC et mode de règlement.

## Modèle prévu pour la version desktop

- **Entreprise** : coordonnées et logo éditables.
- **Client** : fiche réutilisable, avec nom, contact, adresse, téléphone, e-mail, NIU et RCCM.
- **Facture** : date, période, numéro, client et entreprise figés au moment de l’émission, lignes, TVA, avance, paiement et notes.
- **Modèle de facture** : document A4 composé de blocs positionnés et redimensionnables : textes avec valeurs dynamiques, images, traits, tableaux libres et blocs de facturation. Typographie, couleur, alignement, titres de colonnes et ordre des calques sont éditables. Annuler/rétablir, duplication de blocs et de modèles, et modèle par défaut.
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


## Limites du prototype de composition

Les données restent dans le stockage de ce navigateur, sans compte ni synchronisation. Les sauvegardes JSON servent au transfert ou à la restauration. Les images sont réduites avant enregistrement. Les longues factures répartissent les prestations sur plusieurs pages en fonction des dimensions du bloc ; une désignation exceptionnellement longue ou un bloc volontairement trop petit demande d’adapter la mise en page et de vérifier l’aperçu avant impression. Les placements sont libres : un modèle vide n’ajoute aucun élément implicitement. Les factures de démonstration existantes conservent leur présentation précédente.
