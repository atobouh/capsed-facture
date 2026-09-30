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


## Suivi client et paiements

La page **Clients & paiements** permet d’ouvrir le compte de chaque client. Le compte additionne toutes ses factures, indépendamment du mois : total TTC, avances et paiements reçus, reste à payer. Chaque paiement comporte un montant entier en FCFA, une date, un mode et une référence facultative. Le montant est rattaché à une facture précise et ne peut dépasser son solde.

Les statuts sont calculés : **À payer**, **Partiellement payée**, **Payée**. Les avances saisies à l’émission sont comptées une seule fois. Une saisie de paiement erronée peut être annulée ; l’entrée reste dans l’historique et le solde se recalcule. Clôturer le mois interdit de nouvelles émissions pour ce mois, mais permet de recevoir des paiements sur ses factures. Le document original de la facture reste inchangé ; le solde courant est présenté dans le compte et au-dessus de l’aperçu. Les paiements sont conservés dans le stockage local et dans les sauvegardes JSON.

Le redesign privilégie trois entrées : Factures, Clients & paiements, Modèles. Les réglages et sauvegardes sont regroupés dans Réglages. L’atelier affiche les éléments usuels en premier ; les autres éléments et les réglages avancés restent disponibles à la demande.


## Simplification : format unique et avoirs

La configuration actuelle remplace l’atelier de modèles par **Format de facture** : une mise en page A4 fixe, une bannière personnelle et un pied de page en texte ou en image. Aucun choix de modèle à l’émission et aucun logo à saisir dans les coordonnées de l’entreprise. Les anciens documents conservent leur copie de présentation. Les anciennes configurations sont lues pour récupérer la bannière et le pied de page. Le menu se replie sur ordinateur et reste accessible via le menu mobile.

Les nouveaux modes de règlement sont Banque, Espèces, MTN Mobile Money et Orange Money. Les modes déjà enregistrés sur les documents historiques ne sont pas réécrits.

Depuis une facture ou le compte client, **Créer un avoir** demande un montant TTC, un motif et une date. L’avoir reçoit un numéro distinct `AV-AAAA-MM-001`, référence le numéro et la date de la facture d’origine, conserve les coordonnées et le format, et peut être imprimé en PDF. Le montant HT et la TVA sont ventilés d’après la taxe de la facture ; le cumul ne peut dépasser les montants d’origine. Les avoirs figurent dans le compte client, la liste mensuelle et les sauvegardes.

Le solde est `total TTC − avoirs − avances − paiements`. Un solde positif est à recevoir ; un excédent de paiement est affiché comme montant à restituer. La facture originale reste inchangée. Ce prototype affiche le montant à restituer mais ne gère pas encore l’enregistrement des remboursements ni le report de cet excédent vers une autre facture.

## Finition de la navigation et des aperçus

La rubrique **Factures & avoirs** propose deux onglets toujours visibles, avec leurs compteurs. Seule la liste sélectionnée apparaît. L’onglet Avoirs permet de choisir la facture d’origine, y compris dans un autre mois. Sur téléphone, les listes deviennent des fiches lisibles sans défilement horizontal.

Le format, les factures et les avoirs disposent de commandes de zoom, d’ajustement à la largeur et d’agrandissement. Le zoom concerne uniquement l’écran ; l’impression conserve les dimensions A4. Les tableaux sont répartis sur plusieurs pages selon la hauteur mesurée des lignes, avec les totaux sur la dernière page.

Vérification navigateur : navigation et zoom sur ordinateur et téléphone, émission locale d’une facture de douze lignes avec une désignation longue (quatre pages, douze lignes conservées), absence de débordement de tableau, remise à zéro du zoom en mode impression et création d’un avoir depuis le nouvel onglet. Aucun message d’erreur JavaScript relevé. Les données utilisées pour ces essais ont été restaurées ensuite.

## Redesign en espace de travail de bureau

Le site adopte une navigation graphite compacte, une barre supérieure de 48 px, des contrôles cohérents, des tableaux et un panneau de détails contextuel. Le registre sélectionne une facture d’un clic et expose ses actions dans le panneau : ouverture, compte client, paiement et avoir. Les vues clients, saisie, format et réglages utilisent la même échelle. Sur ordinateur, seule la zone de travail défile ; le menu et la barre d’état restent visibles. Le système visuel et les références de recherche sont documentés dans `DESIGN.md`. La génération du site a abouti ; aucune nouvelle vérification navigateur n’a été exécutée pour cette étape.
