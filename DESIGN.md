# CAPSED — interface de bureau dans le navigateur

## Direction

Un espace de travail de facturation, avec navigation permanente, commandes courtes, registre et panneau contextuel. La fenêtre disponible détermine la composition. Les contenus longs défilent dans la zone de travail ; la navigation et la barre d’état restent en place sur ordinateur.

## Références étudiées avec Firecrawl

- [Microsoft — tailles de fenêtres et grille de quatre pixels](https://learn.microsoft.com/en-us/windows/apps/design/layout/screen-sizes-and-breakpoints-for-responsive-design) : dimensions selon la fenêtre, rythme de quatre pixels et trois classes de largeur. Diagramme téléchargé dans `design/references/windows-grid.svg`.
- [IBM Carbon — tableaux de données](https://carbondesignsystem.com/components/data-table/usage/) : barre d’outils près des données, densité régulière, en-têtes et alignement des valeurs.
- [Zoho Books — flux des factures](https://www.zoho.com/us/books/help/invoice/) : création depuis le registre, client existant, lignes de prestations, suivi des paiements, impression et avoirs.
- [Zoho Invoice — format des documents](https://www.zoho.com/us/invoice/help/settings/templates.html) : séparation des réglages et du document, configuration de bannière et pied de page avec aperçu. Capture de référence téléchargée dans `design/references/zoho-workspace.png` ; cette capture est documentaire, elle n’est pas une image de notre produit.

## Règles

| Élément | Règle |
| --- | --- |
| Police | Segoe UI, puis Inter/Arial ; texte courant 13 px |
| Titres de vues | 22 px, graisse 600, hauteur 28 px |
| Libellés et texte secondaire | 11–12 px ; métadonnées 10 px |
| Espacements | 4, 8, 12, 16, 20, 24, 32 px |
| Navigation | 216 px ; repliée 64 px ; entrées 36 px |
| Barre supérieure / état | 48 px / 28 px |
| Champs / boutons | 34 px sur bureau ; 40 px pour les principaux contrôles mobiles |
| Registre | Lignes 52 px ; barre de recherche 60 px ; détails 264 px |
| Arrondis | 5–6 px sur contrôles et panneaux ; 8 px sur dialogues |
| Couleurs | Graphite pour la navigation, gris neutres pour les surfaces, bleu pour les actions et la sélection |
| Statuts | Vert : soldé ; ambre : partiel ; gris : à payer ; libellé toujours visible |

Les dimensions et la typographie des documents A4 sont indépendantes de l’interface. Aucun changement de numérotation, de stockage ou de calcul comptable n’est impliqué par ce redesign.

## Flux

1. Le registre affiche le mois et les onglets Factures/Avoirs.
2. Un clic sur une ligne sélectionne son document et affiche ses détails à droite sur grand écran. Le bouton flèche, Entrée ou un double clic ouvre le document complet.
3. Le panneau donne accès au compte client, au document imprimable, à la saisie d’un paiement et à l’émission d’un avoir.
4. La saisie conserve les étapes client, prestations, règlement, avec un récapitulatif latéral stable.
5. Le format conserve une configuration unique, présentée comme un panneau de réglages à côté de la page A4 avec zoom.

Sur une fenêtre plus étroite, le panneau de détails se masque et les commandes d’ouverture restent accessibles. Sur téléphone, les lignes deviennent des fiches. Aucun contrôle de fenêtre factice n’est ajouté : le produit demeure un site web.
