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

## Allègement et lisibilité

Les vues ont moins de textes répétés. Une aide contextuelle accessible dans la barre supérieure présente trois gestes essentiels. Contrat et destination sont des champs facultatifs à déplier dans chaque prestation ; leurs valeurs sont conservées. L’échelle de l’interface augmente modérément : titres de 24 px, contrôles de 38 px, lignes de registre de 56 px. Les documents A4 conservent leurs dimensions. La génération du site a abouti ; aucun nouveau test navigateur n’a été exécuté pour cette étape.

## Supervision et notifications — parcours de démonstration

Le livrable choisi est la validation du tableau de contrôle et des notifications sur le site, avant leur connexion à l’application desktop. Les deux nouvelles rubriques partagent une simulation explicite, sans serveur distant ni authentification. Les demandes, réponses, verrous et déclarations de remise durent uniquement pendant la session et disparaissent au rechargement.

Le contrôle présente une copie séparée des clients, factures et paiements. Modifier une facture ou enregistrer un paiement côté équipe ne change cette copie qu’après une synchronisation simulée. Le poste peut être déclaré connecté ou hors ligne dans la simulation. Un état ancien n’est jamais présenté comme preuve que l’équipe a oublié un paiement.

Le responsable crée une demande liée au client et à la facture, avec montant, date, mode et référence. Elle attend la synchronisation avant d’apparaître dans les notifications de l’équipe. La lecture et la réponse restent locales jusqu’à une nouvelle synchronisation. Traiter une demande ne crée aucune écriture de paiement ; le traitement demande un résultat explicite, puis son historique est visible côté responsable.

Le responsable peut valider et verrouiller un versement connu sur un poste simulé connecté, à condition que l’écriture corresponde encore à celle du poste. Ce geste transmet immédiatement le verrou dans la simulation et empêche l’annulation via l’interface ainsi que via l’action de confirmation. Un verrou n’est pas un statut de solde : une facture partiellement payée peut comporter un paiement verrouillé. Les avances sont déjà intégrées aux factures émises ; elles ne sont pas présentées comme de nouveaux versements à valider.

Une remise de document peut être simulée depuis l’aperçu. Elle apparaît dans le contrôle après synchronisation comme « remise déclarée », sans prétendre confirmer une réception par le client.

L’architecture de la connexion réelle, la numérotation hors ligne, l’authentification, les conflits et les accusés de réception sont décrits dans `ARCHITECTURE-SYNC.md`. Aucune application de bureau, API partagée ou connexion Cloudflare du client n’est livrée à cette étape. La compilation et la syntaxe du paquet web sont vérifiées ; aucun nouveau test navigateur n’est exécuté pour cette étape.

## Contrôle mobile et navigation entre espaces

La barre supérieure propose Facturation, Gestion et Contrôle, avec une cloche de notifications au même niveau. Le contrôle quitte le menu de bureau pour un espace dédié : liste de clients, ouverture d’une fiche, retour explicite à la liste. Aucun client n’est ouvert par défaut. Les tableaux et statistiques globales sont remplacés par des fiches lisibles sur téléphone ; les factures et demandes se déplient. L’action principale est Signaler un paiement et les versements connus peuvent être validés individuellement. La date de l’état reçu et l’avertissement hors ligne restent visibles. Les commandes de simulation sont regroupées dans Connexion et essai.

Les notifications ouvrent un panneau superposé depuis la cloche, sans navigation latérale ni changement de l’espace sous-jacent. Les règles de synchronisation et de verrouillage de la simulation sont conservées. La génération du site et la syntaxe JavaScript sont vérifiées ; aucune nouvelle vérification navigateur n’est exécutée à cette étape.


## Retour de séance : facture CAPSED et situations clients

Le PDF fourni sert de papier à en-tête officiel (bannière, filigrane, pied de page). Il est intégré en WebP de 86 Ko. Une bannière et un pied de page personnalisés restent possibles ; chaque facture conserve son format au moment de son émission.

La saisie propose explicitement une facture hors taxe, sans ligne TVA, ou TTC. Les prix unitaires sont hors taxe. Les quantités et taux acceptent des décimales ; les montants FCFA sont arrondis à l'unité. Les articles sont arrondis individuellement, la remise globale est calculée sur leur somme, puis la TVA sur le montant après remise. Tous les écrans utilisent le même calcul. Les modes proposés sont Chèque, OM, MoMo et Espèces. Les anciens versements bancaires restent décrits avec leur mode historique.

Désignation et destination acceptent plusieurs lignes dans un même article, avec une quantité et un prix communs. Le bon de commande est facultatif et imprimé sous son intitulé complet. Les lignes de TVA, remise et avance sont conditionnelles. Le mode de règlement souligné et La Direction apparaissent à la fin. Le montant en lettres suit la phrase, avec retour naturel à la ligne si nécessaire.

Modifier est accessible depuis le registre et l'aperçu. Le numéro et les versions précédentes sont conservés ; la date reste dans le mois du numéro. Un mois clôturé reste immuable. Les factures avec paiements ou avoirs gardent leur client. Une facture ayant des avoirs par article conserve ses données financières pour préserver la répartition de remise et TVA ; ses textes peuvent être modifiés.

Un avoir peut porter sur certains articles et quantités, ou sur un montant libre. Le motif et la facture d'origine sont enregistrés et imprimés. Les quantités déjà créditées sont déduites des disponibilités. Remise et taxe sont réparties entre articles avec arrondis cumulés pour conserver exactement les totaux. L'avoir ne peut pas dépasser le montant encore facturé.

Clients et paiements propose Situation globale ; chaque compte propose Imprimer la situation. Ces vues A4 incluent un export CSV et l'impression/enregistrement PDF du navigateur. La situation individuelle détaille factures, avances, avoirs et paiements non annulés, avec solde chronologique. Les états couvrent toutes les factures, indépendamment du mois ouvert. Les montants à restituer sont distingués des sommes encore dues.

Cette livraison reste le prototype web avec sauvegarde dans le navigateur et export JSON. Elle ne crée pas de serveur partagé ni de synchronisation réelle entre les trois ordinateurs. Le paquet statique compile ; le contrôle TypeScript ne relève aucune erreur dans les nouveaux composants, mais les déclarations Next.js préexistantes du projet sont incomplètes. Aucun test ou contrôle interactif du navigateur n'a été ajouté.


## Coordonnées facultatives et alignements

Les sélecteurs ont une seule flèche positionnée dans le champ, avec une géométrie CSS explicite compatible avec la version statique. Les boutons, champs et mentions facultatives sont alignés dans le formulaire.

Seul le nom du client est nécessaire pour créer sa fiche. Les coordonnées absentes ou composées d'espaces sont retirées du document sans paragraphe vide ni préfixe NIU/RCCM isolé, dans les factures et avoirs. La situation individuelle omet également sa ligne de coordonnées si elle est vide. Modifier les coordonnées est accessible pendant la création/modification d'une facture. Lors d'un enregistrement explicite, la facture prend les coordonnées actuelles ; la version précédente reste dans l'historique. Modifier une fiche seule ne réécrit pas les factures déjà émises.
