# Crédits, coûts et offres — Legacy Studio

Guide du comportement actuel, mis à jour le 26 septembre 2026 à partir de la configuration et du serveur. **Ce document ne fixe ni n’active une nouvelle offre commerciale.** Les catalogues `LEMON_PLANS` et `LEMON_CREDIT_PACKS` restent vides dans `.env.example`. Voir le [README](../README.md) pour la configuration, les événements exacts et la migration.

> **Anciennes hypothèses archivées, non applicables :** la grille Découverte/Premium/Pro, les packs chiffrés, « 1 crédit = 0,01 € », les frais Stripe, le minimum/les frais Augment et les simulations de marge relevaient de l’ancien scénario Stripe/Auggie. Ils ne décrivent ni des prix actifs, ni l’économie OpenAI/Lemon Squeezy actuelle. Les tableaux obsolètes sont retirés de ce guide, pas transposés en nouvelles promesses. Aucun calcul de salaire, de rentabilité ou de nombre de clients nécessaire n’est refait ici.

## Unités : budget IA en USD, ventes en EUR

La plateforme utilise **OpenAI GPT-6 Astra, API Responses officielle, via `fetch` natif**, sans SDK ni CLI Auggie/Docker. Les comptes, projets et crédits restent locaux et persistants ; le paiement fournisseur est à la charge de l’exploitant.

| Réglage actuel | Défaut technique | Sens |
| --- | ---: | --- |
| `AI_MICRO_USD_PER_CREDIT` | 10 000 micro-USD | **0,01 USD** d’usage IA comptabilisé par crédit |
| `GENERATION_MAX_CREDITS` | 200 crédits | Budget maximal réservé par job ; choix client inférieur possible |
| `OPENAI_INPUT_MICRO_USD_PER_MILLION` | 10 000 000 | 10 USD / million de tokens d’entrée hors cache |
| `OPENAI_CACHED_INPUT_MICRO_USD_PER_MILLION` | 1 000 000 | 1 USD / million de tokens lus en cache |
| Écriture du cache | Entrée × 1,25, facteur fixé dans le code | 12,50 USD / million avec les défauts |
| `OPENAI_OUTPUT_MICRO_USD_PER_MILLION` | 50 000 000 | 50 USD / million de tokens de sortie, raisonnement inclus |

Ce sont des **valeurs du code pour le service standard/contexte court**, pas un tarif fournisseur garanti dans le temps. **Revérifier modèle, tarifs, règles de cache/contexte et schéma d’usage sur les pages officielles au déploiement.** Le serveur ne met pas les tarifs à jour automatiquement. Le runner borne le contexte estimé à 272 000 tokens d’entrée ; un usage fournisseur dépassant ce seuil est enregistré avec les majorations codées (entrée/cache ×2, sortie ×1,5), puis refusé avant outils/publication.

Un crédit n’est ni un token, ni un prompt, ni une génération garantie, ni un crédit transférable chez OpenAI. Sa conversion en budget USD **n’est pas son prix de vente en EUR**, un taux de change ou une valeur de remboursement. Le prix commercial doit aussi couvrir logiciel, hébergement, support, frais de paiement, fiscalité, change et risque.

## Réservation, usage et débit

1. L’utilisateur choisit un budget entier positif dans la limite serveur ; sans budget explicite, l’API utilise le plafond, soit 200 crédits par défaut. La totalité doit être disponible. Le portefeuille est partagé entre tous ses projets.
2. Une transaction réserve ce budget et fige conversion/tarifs dans le job `metered`. Les répétitions d’une même demande restent idempotentes ; un changement de prompt, projet ou budget exige une nouvelle demande.
3. Les comptes de tokens structurés reçus d’OpenAI sont validés et persistés **avant les outils et avant la validation finale de réponse**. Jamais de facturation déduite du texte du modèle. Le raisonnement, déjà compris dans les tokens de sortie, n’est pas facturé deux fois.
4. Les coûts exacts de toutes les réponses sont cumulés avec `BigInt` et leurs numérateurs persistés. Après publication valide seulement, le total exact est divisé par la valeur du crédit, puis **arrondi une seule fois au crédit supérieur**, et non réponse par réponse. Le débit ne dépasse pas la réservation ; le reste est libéré.
5. Échec, timeout ou aucun changement publié : **zéro crédit débité au client**. L’usage fournisseur reçu reste dans l’historique, même pour un job échoué. Une publication/écriture durable incertaine exige réconciliation avant de libérer une réservation.

Exemple purement arithmétique avec la conversion par défaut : un coût exact cumulé de **0,025 USD** pour un job publié donne **3 crédits**, quel que soit le nombre de réponses composant ce coût. Ce n’est pas une estimation du prix d’un jeu. Un plafond de 200 crédits représente 2 USD de budget comptable, pas 200 générations.

Les crédits inutilisés, d’abonnement comme de pack, restent reportables sans expiration. Résilier ne retire pas le solde existant. Leur consommation future reste à provisionner ; un solde non utilisé n’est pas une marge acquise. L’interface affiche budget/réservation, débit/reliquat et usage reçu, ainsi que les quotas globaux.

## Risque fournisseur à provisionner

Le runner estime prudemment l’entrée de chaque requête et réduit la sortie autorisée selon le budget restant. Il n’effectue **aucun retry automatique d’un appel payant**, n’utilise pas le mode background et envoie `store:false`. Ces limites réduisent le risque mais **ne garantissent ni une facture OpenAI plafonnée au budget local ni l’arrêt distant après annulation**.

Une coupure réseau, un timeout ou une réponse invalide peut laisser une consommation fournisseur inconnue. Une valeur locale nulle ou absente ne signifie pas forcément « fournisseur gratuit ». Les coûts des jobs échoués, écarts et usages non reçus restent supportés par l’exploitant ; rapprocher les écritures locales des relevés fournisseur.

**Avant activation : configurer plafonds de dépense d’organisation OpenAI et alertes**, vérifier leur portée et prévoir surveillance et arrêt d’urgence. Mesurer des demandes représentatives, succès comme échecs, avant toute promesse commerciale. Ne pas promettre d’IA illimitée ni un nombre de générations par abonnement.

Prompts et extraits de code lus sont transmis à OpenAI ; `store:false` n’est pas une garantie générale de non-rétention fournisseur. Le raisonnement chiffré reste éphémère dans le runner. Valider les conditions d’usage, la confidentialité et les informations aux clients ; du code moteur lisible peut être recopié par l’IA malgré l’interdiction d’écriture dans le modèle racine.

## Offres Lemon Squeezy à décider explicitement

- **Abonnements mensuels simples** : quantité 1, prix standard en EUR, sans essai, remise, frais de mise en service ou prorata. Le Checkout hébergé propose carte/PayPal selon les disponibilités et limites du fournisseur.
- `LEMON_PLANS` exige `id`, `name`, `variantId` (**chaîne numérique positive**), `credits`, `amount` (**entier en centimes EUR**), `currency` exactement `eur`, `maxProjects` et `assetQuotaBytes` (quota global en octets).
- `LEMON_CREDIT_PACKS` utilise les mêmes champs **sans les quotas** : omettre `maxProjects` et `assetQuotaBytes`. Les variantes sont ponctuelles et distinctes ; les packs sont achetables avec ou sans abonnement et ne prolongent pas de droits de stockage/projets.
- Les variantes/prix sont relus et validés côté serveur. `amount` doit égaler le prix unitaire et le `subtotal` fournisseur. Une taxe incluse ou ajoutée n’est acceptée que si les montants sont cohérents : total = subtotal pour une taxe incluse, sinon subtotal + taxe. La configuration n’est donc pas une promesse générale de prix TTC.
- Seuls des paiements vérifiés accordent des crédits : facture initiale/renouvelée pour l’abonnement, commande payée pour un pack. Une redirection ou la seule signature du webhook ne suffit pas ; le serveur relit les ressources et contrôle les bindings persistants.
- Les traitements sont idempotents localement. Une création de Checkout ambiguë n’est **pas relancée silencieusement**, même avec un nouvel identifiant : intervention opérateur. Factures ignorées/en attente, modifications d’offre, remboursements et litiges exigent surveillance/réconciliation ; pas de retrait automatique de crédits déjà attribués après remboursement.

Ne pas recycler les anciennes hypothèses de frais Stripe pour Lemon Squeezy. Vérifier auprès du fournisseur les frais effectifs, conditions de paiement/versement, taxes, remboursements, éventuels suppléments et obligations contractuelles applicables. Aucun taux de frais ni taux EUR/USD actuel n’est supposé ici.

## Quotas et capacité réelle

Le socle sans abonnement payé applicable est actuellement **2 projets et 500 Mio d’uploads enregistrés par utilisateur**, avec **20 Mio maximum par fichier**. Ce sont les défauts configurables du serveur, pas les anciennes propositions ni une offre commerciale adoptée par ce document.

Les droits de l’abonnement sont figés dans l’intention d’achat et ne s’appliquent que sur une période payée créditée encore éligible. Le quota d’uploads est **partagé entre tous les projets** ; les uploads d’un même compte sont sérialisés entre projets. Une baisse de droits bloque les nouveaux projets/uploads au-delà des limites, **sans effacer automatiquement les données existantes** ni les crédits. Les générations restent possibles dans un projet existant si leurs propres conditions sont remplies.

Seuls les uploads inscrits dans la base sont décomptés. Les copies privées du modèle, assets d’exemple, brouillons, versions retenues, base, journaux et sauvegardes consomment aussi du disque, hors quota d’assets. Prévoir capacité globale, marge libre, quotas système, sauvegardes et rétention ; mesurer les copies réelles et la charge avant de dimensionner. L’ancienne estimation VPS/stockage n’est pas un devis ni une capacité validée pour cette architecture. Linux est requis pour les outils IA et Node.js >= 22.13 pour SQLite natif.

## Migration et prérequis avant vente

- **Abonnements Stripe existants : migration opérateur avant déploiement.** Pas de transfert automatique ni d’ancien handler Stripe ; les obligations non réconciliées peuvent bloquer le démarrage.
- **Workers historiques : arrêter et réconcilier avec l’ancienne version avant la mise à niveau.** Une tâche `fixed` encore `running` bloque le nouveau runner. Préserver comptes, projets, journal et réservations ; ne pas contourner par suppression de lignes.
- La nouvelle comptabilité SQLite conserve l’historique à coût fixe et ajoute snapshots/usage mesuré. Préserver les soldes ne résout pas la **migration explicite de valeur des crédits déjà vendus** ; faire approuver et communiquer cette décision avant la bascule.
- Fixer séparément prix EUR, volumes de crédits, quotas et conditions de conservation ; laisser les catalogues vides tant que ces décisions ne sont pas validées. Tester d’abord Lemon avec `LEMON_TEST_MODE=true` et une base isolée ; utiliser `false` avec les identifiants live en production.
- Exécuter les vérifications locales et les parcours fournisseur contrôlés avant ouverture, sans confondre un double de test avec une transaction réelle. La validation des fichiers générés parse JS/TS/JSON ; ce n’est pas un build, un typecheck complet ou un test du jeu.

Ce guide n’active aucun produit, paiement, service externe ou déploiement et ne revendique aucun résultat de tests. Il ne modifie pas `engine/`.

## Sources officielles à revérifier au déploiement

- Modèle GPT-6 Astra : https://developers.openai.com/api/docs/models/gpt-6-astra
- Tarifs OpenAI : https://developers.openai.com/api/docs/pricing
- Cache : https://developers.openai.com/api/docs/guides/prompt-caching
- Lemon Squeezy, moyens de paiement : https://docs.lemonsqueezy.com/help/checkout/payment-methods
- Abonnements PayPal : https://docs.lemonsqueezy.com/help/orders/paypal-subscriptions
- Prix Lemon Squeezy et frais applicables : https://www.lemonsqueezy.com/pricing
- Référence de configuration et migration : [README](../README.md), [exemple d’environnement](../.env.example)
