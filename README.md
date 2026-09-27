# Legacy Studio — Aider dans Docker

Un SaaS simple : comptes privés, projets de jeux, assets et portefeuille de crédits avec Lemon Squeezy.
**Node/Express reste sur l’hôte** ; chaque demande lance Aider dans un conteneur Docker éphémère.
Pas de framework d’agents ni de chaîne d’orchestration maison. SQLite et les fichiers locaux conservent les données.

## Démarrage local

Prérequis : **Linux, Node.js >= 22.13, npm et Docker local** accessibles au compte du serveur, avec stockage persistant.
Pour une installation existante, lire la migration ci-dessous **avant** de démarrer.
À la racine du dépôt :

<augment_code_snippet mode="EXCERPT">
````sh
npm ci
docker pull paulgauthier/aider:v0.86.2
cp -n .env.example .env
chmod 600 .env
````
</augment_code_snippet>

`cp -n` conserve un éventuel `.env` existant : ne pas l’écraser lors d’une mise à jour.
Dans un éditeur local, renseigner `ANTHROPIC_API_KEY` dans ce fichier protégé, ou utiliser un gestionnaire de secrets.
Ne jamais coller la clé dans une commande, un chat, un journal ou le dépôt ; aucune clé d’exemple n’est nécessaire.
Le modèle par défaut est `AIDER_MODEL=anthropic/claude-sonnet-4-6` ; vérifier son accès sur le compte fournisseur.
**Claude 3.7 est retiré de l’API Anthropic.** L’alternative `openai/<modèle-compatible>` utilise `OPENAI_API_KEY`.

<augment_code_snippet mode="EXCERPT">
````sh
npm start
````
</augment_code_snippet>

Ouvrir **http://localhost:3000**, s’inscrire, créer un projet et ajouter ses assets.
Les comptes commencent à **zéro crédit** ; les paiements doivent être configurés pour alimenter le portefeuille.
Si la clé IA manque, si Docker est indisponible ou si l’image n’est pas téléchargée, les générations sont désactivées, sans réservation de crédits.
L’authentification, les projets et les uploads restent utilisables ; aucun faux résultat IA n’est produit.

## Configuration utile

[`.env.example`](.env.example) décrit les réglages ; [`server/config.js`](server/config.js) fait autorité.

| Variable | Défaut / rôle |
| --- | --- |
| `HOST`, `PORT` | `127.0.0.1`, `3000` |
| `APP_URL` | `http://localhost:3000` ; origine exacte du navigateur, port compris |
| `DATA_DIR` | `./data` ; stockage privé persistant, jamais exposé par le serveur web |
| `AIDER_DOCKER_IMAGE` | `paulgauthier/aider:v0.86.2` ; image à télécharger avant démarrage |
| `AIDER_MODEL` | `anthropic/claude-sonnet-4-6` |
| `JOB_TIMEOUT_SECONDS` | `600` secondes par génération |
| `MAX_CONCURRENT_JOBS` | `2` globalement ; une seule génération active par projet |
| `GENERATION_MAX_CREDITS` | `200` ; plafond du budget choisi par le client |
| `AI_MICRO_USD_PER_CREDIT` | `10000` ; 0,01 USD d’usage estimé par crédit, pas un prix EUR |

## Ce que fait une génération

1. Le serveur vérifie le propriétaire et réserve le budget, puis copie `src/game` dans un brouillon propre au job.
2. Il lance **un seul appel CLI Aider**, avec la demande dans un fichier en lecture seule : `--message-file` équivaut au mode ponctuel `--message`, sans placer le prompt dans une commande shell.
3. Dans `/app`, un **dépôt Git temporaire** indexe les sources pour le contexte automatique / repo-map d’Aider. Aucun historique Git du projet ni orchestrateur supplémentaire n’est requis.
4. Aider reçoit `src/game/main.js` comme fichier initial. Parmi les montages du projet, **seul le brouillon `src/game` est en lecture-écriture** ; `src/lib`, `src/examples`, `doc` et `public`, s’ils existent, sont en lecture seule.
5. Les commits automatiques, lint, tests automatiques et suggestions de commandes shell sont désactivés. Le parcours n’exécute **ni le code généré ni des commandes de test du projet** ; seul l’amorçage Git/Aider est lancé dans le conteneur.
6. L’hôte contrôle les fichiers et la syntaxe JS/TS/JSON, exige un changement effectif, puis publie par renommages avec conservation de la version précédente. Le débit arrive après publication réussie.

Un appel CLI peut contenir **plusieurs appels fournisseur et des retries internes à Aider** : ce n’est pas un seul appel API.
La validation n’est ni un build, ni un typecheck complet, ni un test de jouabilité ; aucune réparation orchestrée après validation n’est ajoutée.
Elle refuse liens, fichiers spéciaux/cachés et extensions non autorisées ; limites : 200 fichiers, 2 Mio par fichier, 10 Mio au total, profondeur 12, `main.js` obligatoire.
Le modèle racine `engine/` reste inchangé. L’interface suit les états par SSE ; **aucun aperçu jouable par projet n’est implémenté**.

## Crédits et paiements

- Le portefeuille est partagé entre les projets ; abonnements et packs l’alimentent. Les crédits inutilisés n’expirent pas et une résiliation ne les efface pas.
- Disponible = solde − réservations. Le budget entier positif est figé avec la conversion à l’acceptation ; sans `budgetCredits`, l’API réserve le plafond.
- La source est l’événement JSON `message_send` d’Aider et son `total_cost` cumulé : **estimation Aider, pas facture fournisseur vérifiée**, ni montant déduit du texte du modèle. Un tube nommé temporaire transmet ces événements sans conserver les logs du fournisseur.
- Le total de session est arrondi au micro-USD supérieur, puis au crédit supérieur lors du débit ; on ne somme pas des arrondis par appel. Le débit ne dépasse jamais la réservation.
- Estimation absente, nulle, invalide ou hors budget, échec, délai dépassé ou aucun changement : **pas de publication ni de débit client**. Le reliquat est libéré après résolution de l’état ; une publication ou un nettoyage incertain peut retenir la réservation pour réconciliation.
- **La facture fournisseur peut dépasser le budget local**, même sans débit client. Configurer séparément plafonds fournisseur, alertes et arrêt d’urgence ; les échecs restent à la charge de l’exploitant.

Voir [docs/PRICING.md](docs/PRICING.md) pour la conversion, les offres et les risques. Aucun prix commercial n’est imposé.

### Activer Lemon Squeezy

- Garder `LEMON_PLANS=[]` et `LEMON_CREDIT_PACKS=[]` tant que les offres ne sont pas approuvées ; leur schéma est dans `.env.example`.
- Configurer localement `LEMON_API_KEY`, `LEMON_WEBHOOK_SECRET`, `LEMON_STORE_ID` ; commencer avec `LEMON_TEST_MODE=true` et une base isolée. Passer à `false` avec les identifiants live avant les ventes réelles.
- Utiliser des variantes EUR distinctes : abonnements mensuels simples et/ou packs ponctuels, quantité 1, sans essai, remise ni prorata. Carte/PayPal dépendent des disponibilités du Checkout fournisseur.
- Envoyer les webhooks à `POST /api/billing/webhook`, corps brut et en-tête `x-signature`. La signature et les ressources fournisseur sont vérifiées avant attribution ; une page de retour ne suffit pas.
- Événements commandes : `order_created`, `order_refunded` ; factures : `subscription_payment_success`, `subscription_payment_recovered`, `subscription_payment_failed`, `subscription_payment_refunded`.
- Cycle d’abonnement : `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`, `subscription_expired`, `subscription_paused`, `subscription_unpaused`.
- Réconcilier manuellement achats ambigus, remboursements et litiges ; ne pas supprimer les intentions ni relancer un paiement incertain pour le débloquer.

## Stockage et exploitation

| Chemin | Contenu |
| --- | --- |
| `server/`, `web/` | API Express, suivi SSE et interface française |
| `engine/` | Modèle original copié à la création d’un projet |
| `data/platform.sqlite` | Comptes, sessions, crédits, journal, jobs et facturation |
| `data/users/<user-id>/<project-id>/engine/` | Copie privée du moteur ; jeu dans `src/game`, uploads dans `public/game` |
| `…/<project-id>/generations/<job-id>/` | Brouillon, demande et version `previous` conservée après publication |

Un seul serveur par `DATA_DIR`, sans cluster PM2 ni disque partagé multi-hôte. Le verrou est `DATA_DIR/.server.lock`.
**Ne jamais supprimer ce verrou sans vérifier que l’ancien serveur est réellement arrêté**, y compris son gestionnaire de service.
Les conteneurs sont nommés `legacy-aider-<UUID-du-job>` ; le nettoyage normal et la reprise ciblent ce **nom exact**, jamais un préfixe large.
Si une intervention est nécessaire, identifier le job et vérifier son état avant de supprimer uniquement son conteneur ; pas de nettoyage Docker global.
Un nettoyage impossible bloque les générations et peut retenir les crédits réservés ; rétablir Docker puis réconcilier avant toute libération manuelle.

Quotas par défaut : **2 projets**, **500 Mio d’uploads enregistrés par utilisateur**, **20 Mio par fichier**.
Les packs n’augmentent pas ces quotas ; un abonnement payé éligible peut les modifier. Les quotas d’assets excluent copies du moteur, brouillons et versions précédentes.
Prévoir des **quotas disque système** séparés. Sauvegardes externes et politique de rétention sont à organiser manuellement ; aucune suppression automatique des versions conservées n’est prévue.
Sauvegarder ensemble tout `DATA_DIR` : arrêter proprement le service et fermer SQLite avant une copie à froid ; ne jamais copier uniquement `platform.sqlite` en activité en ignorant son WAL.
Tester la restauration sur une copie isolée et protéger aussi les sauvegardes contenant données personnelles et prompts.

## Sécurité : limites à connaître

- Par conteneur : **1 CPU, 2 Gio de mémoire, 128 PID**, utilisateur non-root, racine en lecture seule, capacités supprimées et `no-new-privileges` ; `/tmp` et `/app` utilisent des espaces temporaires bornés.
- **Docker n’est pas une frontière absolue entre locataires.** Pour la production, prévoir Docker rootless ou un hôte d’exécution dédié, avec les volumes locaux nécessaires ; le runner actuel n’est pas un ordonnanceur distant.
- Le réseau Docker **`bridge` n’est pas « Internet seulement »** : il peut atteindre l’hôte et des réseaux privés. Imposer hors de l’application des restrictions de sortie bloquant réseaux privés, adresses locales et métadonnées cloud, tout en autorisant le fournisseur nécessaire.
- Protéger le démon Docker et limiter son accès aux administrateurs autorisés ; **aucun socket Docker n’est monté dans Aider**. Seule la clé du fournisseur sélectionné est transmise, jamais les secrets de paiement.
- Cette clé reste dans l’environnement et les **métadonnées du conteneur**, lisibles par les administrateurs Docker : ce n’est pas un coffre-fort. Ne pas exposer le démon ni publier ses sorties d’inspection.
- Prompts et sources utiles sont envoyés au fournisseur choisi. Ne pas y placer de secrets ; les montages en lecture seule empêchent l’écriture, pas la lecture ou la recopie du moteur par l’IA.
- Comptes, contrôle de propriété, origine/CSRF et téléchargements authentifiés protègent l’accès HTTP ; ils ne remplacent pas le durcissement de l’hôte, la supervision et les sauvegardes.
- En production : `NODE_ENV=production`, `APP_URL` HTTPS exacte et reverse proxy. `TRUST_PROXY=loopback` seulement derrière un proxy local maîtrisé qui réécrit `X-Forwarded-For`.
- Sur `/api/events`, désactiver cache et buffering du proxy et prévoir un délai supérieur au heartbeat ; ce flux suit les jobs, pas un jeu en direct.

Cette configuration **n’est pas présentée comme durcie pour une production multi-tenant**. Valider isolation, réseau, capacité et procédures opérateur avant ouverture.

## Migration d’une ancienne installation

1. Suspendre achats et demandes ; avec l’ancienne version disponible, terminer ou arrêter puis réconcilier **manuellement** les anciennes générations et leurs workers. Un job `billing_mode='fixed'` encore `running` bloque le démarrage : ne pas contourner ce contrôle par suppression de lignes.
2. Arrêter l’ancien service et ses redémarrages automatiques, vérifier l’absence de processus actif, puis sauvegarder tout `DATA_DIR` avec SQLite fermé comme indiqué plus haut. Garder une copie restaurable avant toute mise à niveau.
3. Remplacer les anciens réglages de pilotage/tarification `OPENAI_*` par ceux de `.env.example` : notamment `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`, les `OPENAI_MAX_*`, `OPENAI_PLANNING_MAX_TURNS`, `OPENAI_REQUEST_TIMEOUT_SECONDS` et anciens tarifs par million sont refusés s’ils sont non vides. **`OPENAI_API_KEY` reste accepté** pour le fournisseur alternatif.
4. Retirer aussi les anciens réglages Stripe/Auggie, `AUGMENT_SESSION_AUTH`, `GENERATION_CREDITS` et `MAX_PROJECT_ASSET_BYTES` ; la liste exacte des rejets est dans `server/config.js`. Ne pas écraser le `.env` existant avec l’exemple.
5. Si Stripe était utilisé, réconcilier abonnements et paiements avant bascule : aucun transfert automatique vers Lemon, ni arrêt des anciens prélèvements par simple changement de clés. Les obligations historiques non résolues peuvent bloquer le démarrage.
6. Conserver soldes, journal et usages historiques `fixed`/`metered` : **ils ne sont ni effacés ni recalculés**. Faire approuver explicitement toute évolution de valeur des crédits déjà vendus, puis tester la migration sur une copie isolée.

## Vérifications

<augment_code_snippet mode="EXCERPT">
````sh
npm test
npm run check
````
</augment_code_snippet>

Les tests Node couvrent notamment l’appel Docker simulé et le tube de coûts sous utilisateur non-root (`test/aider.test.js`), la comptabilité Aider (`test/aider-metering.test.js`), la reprise (`test/recovery.test.js`) et le démarrage HTTP réel (`test/startup.test.js`).
`check` contrôle la syntaxe du serveur et de l’interface, pas un build du moteur. Les doubles de test ne prouvent pas une génération ou un paiement réels.
**Docker n’était pas installé dans l’environnement de préparation : aucun smoke test Docker réel n’est revendiqué.**
Avant ouverture, vérifier sur l’hôte cible l’image, les montages, les sorties réseau, le nettoyage, Lemon en mode test et une génération contrôlée avec autorisation de dépense.
