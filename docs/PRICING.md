# Crédits et coûts — Legacy Studio

Le SaaS utilise Aider dans Docker et Lemon Squeezy pour les paiements. Ce guide décrit le code, **pas une nouvelle offre commerciale**.
Les catalogues `LEMON_PLANS` et `LEMON_CREDIT_PACKS` restent vides dans [`.env.example`](../.env.example) jusqu’à validation par l’exploitant.

## Conversion et réservation

| Réglage | Défaut | Sens |
| --- | ---: | --- |
| `AI_MICRO_USD_PER_CREDIT` | 10 000 | 0,01 USD d’usage IA estimé par crédit |
| `GENERATION_MAX_CREDITS` | 200 | Budget maximal réservé par génération ; choix inférieur possible |

Cette conversion **n’est ni un prix de vente en EUR, ni un taux EUR/USD, ni une valeur de remboursement**.
Un crédit n’est pas un token, un prompt ou une génération garantie. Avec les défauts, 200 crédits représentent 2 USD de budget comptable.
Les abonnements et packs alimentent un portefeuille commun à tous les projets ; les crédits inutilisés n’expirent pas, même après résiliation.
Disponible = solde − réservations. Le budget entier positif doit être intégralement disponible ; sans budget explicite, l’API utilise le plafond.
À l’acceptation, une transaction fige budget, conversion et source `aider`. Le même identifiant de demande ne réserve ni ne débite deux fois.

## Source du coût et arrondis

La source est le JSON local d’Aider : événements `message_send`, propriété **`total_cost` cumulative pour la session** et compteurs de tokens.
C’est une **estimation Aider**, pas une facture fournisseur vérifiée, ni une extraction du texte généré par le modèle.
Le serveur vérifie la forme et la progression des compteurs et persiste l’estimation avant publication ; cela ne certifie pas les tarifs utilisés par Aider.

1. Convertir le **total de session** USD en micro-USD, arrondi au supérieur ; les nouveaux totaux remplacent les précédents, ils ne s’additionnent pas.
2. Après publication de changements valides seulement, diviser ce total par la conversion figée et arrondir **une fois au crédit supérieur** avec des entiers `BigInt`.
3. Débiter au plus le budget réservé et libérer le reliquat. Aucun arrondi de coût par appel fournisseur n’est additionné aux autres.

Exemple arithmétique : estimation finale **0,025 USD** → 25 000 micro-USD → **3 crédits** à la conversion par défaut. Ce n’est pas le prix garanti d’un jeu.
Estimation absente, nulle, invalide ou hors budget, échec, timeout, fichiers refusés ou aucun changement : **pas de publication ni de débit client**.
Une publication, un stockage ou un nettoyage Docker incertain peut retenir la réservation : réconcilier l’état avant de la libérer.
Les estimations valides déjà reçues restent enregistrées même après échec ; « zéro crédit débité » ne signifie pas « fournisseur gratuit ».

## Risque fournisseur

Un lancement CLI peut faire plusieurs appels et Aider peut réessayer en interne. Le contrôle de budget intervient à réception de l’estimation, pas comme plafond contractuel chez le fournisseur.
**La dépense réelle peut dépasser la réservation**, y compris après interruption locale, erreur ou absence d’usage reçu. L’exploitant assume cet écart et les générations échouées.
Configurer des plafonds et alertes fournisseur **indépendants**, vérifier leur portée, superviser les coûts et prévoir un arrêt d’urgence.
Rapprocher les estimations des relevés fournisseur ; vérifier accès au modèle et tarifs avant activation. Ne promettre ni IA illimitée ni nombre fixe de générations.

## Offres Lemon Squeezy

- Ventes en EUR : `amount` en centimes, `currency` exactement `eur`, variante distincte par offre. Le prix de vente doit couvrir aussi change, paiement, hébergement, stockage, support, taxes et risque.
- Abonnement mensuel simple : quantité 1, sans essai, remise, frais de mise en service ni prorata. Champs : `id`, `name`, `variantId` (chaîne numérique positive), `credits`, `amount`, `currency`, `maxProjects`, `assetQuotaBytes`.
- Pack ponctuel : mêmes champs **sans** `maxProjects` ni `assetQuotaBytes`. Achetable avec ou sans abonnement ; il ajoute des crédits, pas des quotas.
- Les crédits viennent uniquement d’une commande de pack payée ou d’une facture d’abonnement payée et vérifiée, pas d’une redirection navigateur. Le serveur vérifie signature du webhook et ressources fournisseur.
- Les prix et taxes doivent correspondre aux données fournisseur ; `amount` n’est pas une promesse universelle de prix TTC. Carte/PayPal dépendent du Checkout et du compte fournisseur.
- Commencer avec `LEMON_TEST_MODE=true` sur une base isolée ; utiliser `false` et les identifiants live pour vendre. Voir le [README](../README.md) pour configuration et événements.
- Paiement ambigu, remboursement ou litige : intervention opérateur, sans relance silencieuse ni retrait automatique des crédits déjà attribués. Conserver les écritures pour rapprochement.

## Données, quotas et migration

Par défaut : **2 projets, 500 Mio d’uploads enregistrés par utilisateur, 20 Mio par fichier** ; ce sont des limites techniques configurables, pas une offre adoptée ici.
Les quotas d’un abonnement payé éligible sont partagés entre projets. Copies du moteur, brouillons, versions précédentes et sauvegardes consomment du disque hors quota d’uploads.
Prévoir quotas disque, sauvegardes et rétention manuelle : aucune suppression automatique des versions conservées. Une baisse de droits n’efface pas les données existantes.

Les historiques `fixed` et anciens `metered`, usages et **journal de crédits sont conservés, jamais effacés ou recalculés par cette bascule** ; l’interface n’affiche que les 100 dernières écritures.
Avant migration, arrêter/réconcilier les anciens workers et le service, sauvegarder correctement SQLite avec les projets, puis suivre le [README](../README.md). Un ancien job `fixed` actif peut bloquer le démarrage.
Préserver les soldes ne vaut pas accord sur leur valeur : faire approuver et communiquer toute évolution des crédits déjà vendus. Réconcilier séparément les anciennes obligations Stripe.
Les anciennes grilles Stripe/Auggie et les tarifs de l’ancien runner OpenAI ne décrivent pas ce service. Aucun taux de change, prix commercial ou frais fournisseur n’est inventé ici.
