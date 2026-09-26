# Legacy Studio — plateforme Express

Plateforme Express de création de jeux à comptes privés et projets multiples. Les abonnements et packs **Lemon Squeezy** alimentent un portefeuille commun ; les générations utilisent **OpenAI GPT-6 Astra via l’API officielle Responses**, avec comptage de l’usage. Les clients HTTP utilisent `fetch` natif, sans SDK fournisseur. Une chaîne d’agents intégrée prépare chaque prompt, recherche le contexte, modifie le brouillon puis le fait vérifier par l’hôte. Aucun CLI Aider/Auggie, environnement Python, framework d’agents ou Docker n’est requis.

Le dossier racine `engine/` reste un **modèle jamais modifié par la plateforme** : chaque projet utilise sa copie privée. Les comptes, sessions, projets, crédits et historiques persistent dans SQLite et le stockage local.

## Démarrer

- Prérequis : **Node.js >= 22.13** (SQLite natif ; avertissement expérimental possible), npm et un stockage local persistant. **Linux avec `/proc/self/fd` est obligatoire pour les outils IA** ; aucun repli non sécurisé n’est prévu sur un autre système.
- Installation existante : suivre **Migration avant mise à niveau** ci-dessous avant de démarrer cette version.
- Installer les dépendances à la racine avec `npm ci`.
- Copier `.env.example` vers `.env` et adapter la configuration locale. Ne jamais versionner de secrets.
- Lancer `npm start`, puis ouvrir `http://localhost:3000`.
- S’inscrire, créer un projet, puis ajouter ses assets. Les comptes commencent avec **zéro crédit**.
- Sans configuration Lemon Squeezy/OpenAI, l’authentification, les projets et les uploads restent disponibles sur une installation sans obligations Stripe à réconcilier ; les paiements et générations sont explicitement indisponibles. Il n’existe pas de fausse génération ni de bouton public d’attribution gratuite de crédits.

`APP_URL` doit correspondre exactement à l’origine visitée, port compris : elle protège les requêtes mutantes et détermine le retour du Checkout. En production, utiliser `NODE_ENV=production`, une URL HTTPS et un reverse proxy. Express écoute par défaut sur `127.0.0.1`. Fournir les secrets uniquement dans une configuration locale protégée ou un gestionnaire de secrets, jamais dans le dépôt.

## Migration avant mise à niveau

**Aucune migration automatique des abonnements Stripe vers Lemon Squeezy, aucun ancien handler de webhooks Stripe.** Le simple remplacement des clés n’arrête pas les prélèvements existants.

1. Planifier la bascule, bloquer les nouveaux achats et demandes sur l’ancienne version, et réconcilier les obligations Stripe **avant le déploiement** : abonnements, paiements/Checkouts en cours, clients en création, remboursements et périodes déjà payées. Organiser la fin des anciens prélèvements et le parcours de souscription Lemon avec les clients, sans double facturation. Cette version refuse de démarrer si ses tables historiques indiquent encore un abonnement non terminal ou une opération Stripe ambiguë, même sans clés Lemon.
2. **Avec l’ancienne version encore disponible**, arrêter et réconcilier ses workers Auggie/Docker et leurs réservations/publications, puis arrêter proprement l’ancien serveur. Une tâche historique `billing_mode='fixed'` encore `running` bloque le démarrage du nouveau runner : il ne sait pas arrêter l’ancien worker. Ne pas attendre la mise à niveau pour le découvrir ; ne pas supprimer des lignes ou un verrou pour contourner ce contrôle.
3. Sauvegarder ensemble SQLite et les projets après cet arrêt contrôlé. Préserver comptes, soldes, journal de crédits et tables historiques. **Définir explicitement la migration de valeur des crédits déjà vendus** : conserver leur nombre n’autorise pas à remplacer silencieusement « coût fixe par génération » ou une ancienne hypothèse en EUR par un budget USD.
4. Retirer les anciennes variables `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PLANS`, `STRIPE_CREDIT_PACKS`, `AUGGIE_DOCKER_IMAGE`, `AUGMENT_SESSION_AUTH`, `GENERATION_CREDITS` et `MAX_PROJECT_ASSET_BYTES`. Toute valeur non vide, y compris `[]`, est refusée. Les anciens réglages `AI_UID`/`AI_GID` ne sont plus utilisés. Configurer les nouvelles variables de `.env.example`.
5. Valider la bascule sur une copie isolée des données avant la production. L’évolution du schéma SQLite ajoute le mode `metered`, les snapshots de tarifs et l’usage par réponse ; elle **conserve l’historique `fixed`**, les soldes et le journal sans les recalculer ni convertir des abonnements. Une nouvelle génération fige son budget et ses tarifs lors de sa réservation.

## Organisation des fichiers

| Emplacement | Rôle |
| --- | --- |
| `server.js` | Démarrage HTTP et arrêt contrôlé |
| `server/` | Authentification, SQLite, projets, crédits, Lemon Squeezy et runner OpenAI |
| `web/` | Interface française sans dépendance frontend ni CDN |
| `engine/` | Modèle original : jamais modifié par la plateforme |
| `data/platform.sqlite` | Utilisateurs, sessions, projets, crédits, demandes et facturation |
| `data/users/<user-id>/<project-id>/engine/` | Copie privée et indépendante du moteur |
| `…/engine/src/game/` | Code du jeu propre à ce projet |
| `…/engine/public/game/` | Assets ajoutés par le propriétaire |
| `…/<project-id>/generations/<job-id>/` | Brouillon et ancienne version conservée pour reprise |

Les identifiants UUID, et non l’adresse e-mail ou le nom du projet, déterminent les chemins. La copie conserve les sources et assets du moteur mais exclut `node_modules`, builds, dossiers Git et configurations privées cachées. Une copie n’installe pas automatiquement ses dépendances. Les assets fournis par le modèle sont copiés ; la bibliothèque web liste les **uploads de l’utilisateur**, pas tous les assets internes du moteur.

Le dossier de données ne doit pas être placé dans `web/`, dans `engine/`, dans les sources du serveur ni au-dessus de ces répertoires. Ces chevauchements sont refusés, y compris via les liens symboliques existants. Ne pas exposer `data/` via Nginx/Apache.

## Comptes et sécurité HTTP

- Mots de passe hachés par scrypt avec sel aléatoire ; minimum 12 caractères, maximum 128 octets.
- Sessions persistantes de sept jours. Cookie HttpOnly, SameSite=Lax, Secure et préfixe `__Host-` sous HTTPS ; aucun jeton stocké dans localStorage.
- Contrôle strict de l’origine, jeton CSRF pour les mutations authentifiées, limites de tentatives de connexion et de création.
- Vérification du propriétaire sur **chaque** accès à un projet, un asset et ses générations. Un projet appartenant à un autre compte répond 404.
- Upload borné, refus d’écrasement, chemins relatifs contrôlés, refus des liens symboliques, quota configurable.
- Téléchargements authentifiés en pièces jointes, pas d’exécution d’assets HTML/SVG sur l’origine du studio.
- CSP restrictive, pas de code utilisateur interpolé dans du HTML côté frontend.

L’authentification par ancien mot de passe partagé a été supprimée. Les anciennes routes globales `/api/generate`, `/api/upload` et `/api/uploads` ne sont plus utilisées : les opérations sont sous `/api/projects/:projectId/…`.

## Crédits et coût IA mesuré

Les [règles économiques et décisions restant à prendre](docs/PRICING.md) remplacent l’ancienne grille prévisionnelle Stripe/Auggie. **Aucun prix de vente ni volume de crédits commercial n’est prescrit ou activé** : les catalogues d’exemple restent vides.

- Les crédits sont internes à la plateforme, pas des tokens ni un solde OpenAI transférable. `AI_MICRO_USD_PER_CREDIT=10000` signifie par défaut **0,01 USD d’usage comptabilisé par crédit** ; ce n’est ni un prix de vente en EUR, ni un taux de change, ni une valeur de remboursement.
- Le portefeuille est commun à tous les projets. Abonnements et packs s’y ajoutent ; les crédits inutilisés n’expirent pas et une résiliation ne les efface pas.
- Préparation du prompt, lecture du contexte, génération et éventuelle correction partagent **un seul budget et une seule comptabilité**. Le changement d’agent ne remet ni le budget, ni les arrondis, ni les protections anti-rejeu à zéro. Les extraits de code et le plan envoyés au modèle font partie des tokens d’entrée mesurés.
- Le client choisit un budget entier positif au plus égal à `GENERATION_MAX_CREDITS` (**200 par défaut**, soit 2 USD avec la conversion par défaut). Sans `budgetCredits`, l’API réserve ce plafond ; l’interface permet un choix inférieur. Le solde disponible doit couvrir **toute** la réservation, pas seulement un coût moyen supposé.
- À l’acceptation, une transaction fige budget, conversion et tarifs dans le job `metered`. Disponible = solde − réservations. Une requête répétée avec le même identifiant conserve sa demande et son snapshot ; changer projet, prompt ou budget avec cet identifiant est refusé.
- Seul le champ structuré `usage` d’une réponse fournisseur validée fonde la comptabilité, **jamais le texte généré par le modèle**. Entrée, lecture/écriture du cache, sortie et raisonnement sont contrôlés ; le raisonnement est déjà inclus dans la sortie, pas ajouté une seconde fois. Les identifiants de réponse et données comptables sont persistés de façon synchrone dans SQLite **avant tout outil, contrôle de complétion ou publication**. Un usage valide reçu pour une réponse ensuite refusée reste enregistré.
- Les calculs utilisent des entiers exacts `BigInt` et des numérateurs persistés : on cumule le coût exact de **toutes** les réponses du job, puis on arrondit **une seule fois au crédit supérieur**. Les micro-USD affichés sont aussi issus de l’arrondi du total, pas d’une somme d’arrondis par requête.
- Le débit intervient uniquement après publication de modifications valides, sans dépasser le budget réservé ; le reliquat est libéré. Échec, timeout, fichiers refusés ou absence de changement : **zéro crédit débité au client** et réservation libérée après résolution de l’état. Une publication ou un stockage incertain peut conserver la réservation et bloquer les générations pour réconciliation ; ne pas annoncer de remboursement avant d’avoir établi l’état réel.
- Une génération à la fois par projet, concurrence globale bornée. Journal append-only applicatif avec références uniques et transactions ; l’interface montre les 100 dernières opérations et la base garde l’historique complet. L’interface affiche budget choisi/réservé, débit, reliquat, usage fournisseur reçu et quotas globaux.

### Tarifs techniques et contrôle du risque

Valeurs par défaut de `server/config.js` et `server/ai-pricing.js`, pour le service standard et le contexte court :

| Élément | Réglage / règle | Coût par million de tokens |
| --- | --- | ---: |
| Entrée hors cache | `OPENAI_INPUT_MICRO_USD_PER_MILLION=10000000` | 10 USD |
| Lecture du cache | `OPENAI_CACHED_INPUT_MICRO_USD_PER_MILLION=1000000` | 1 USD |
| Écriture du cache | 1,25 × tarif d’entrée, facteur fixé dans le code | 12,50 USD |
| Sortie, raisonnement inclus | `OPENAI_OUTPUT_MICRO_USD_PER_MILLION=50000000` | 50 USD |

**Vérifier les tarifs, l’accès au modèle et le schéma d’usage dans les sources officielles au déploiement**, puis configurer les valeurs applicables ; le serveur ne les actualise pas automatiquement. Le runner impose `service_tier='default'`, limite le contexte estimé à 272 000 tokens d’entrée et refuse les modes/outils non pris en charge. Si un usage long contexte est néanmoins reçu, il est enregistré avec les multiplicateurs codés (entrée/cache ×2, sortie ×1,5), puis le runner refuse la réponse avant ses outils.

Avant chaque requête, une estimation conservatrice du contexte, y compris le raisonnement opaque précédent, réserve l’entrée au tarif le plus défavorable et réduit la sortie autorisée selon le budget restant. Si même 16 tokens de sortie ne tiennent plus, aucun appel supplémentaire n’est envoyé. **C’est un garde-fou local, pas une garantie sur la facture OpenAI.** Aucun retry HTTP automatique d’une requête payante : après une coupure, un timeout ou une réponse inexploitable, un traitement fournisseur peut avoir eu lieu sans usage reçu. Un usage local absent/à zéro ne prouve donc pas l’absence de coût.

L’exploitant assume les coûts des échecs, écarts et usages inconnus. **Configurer des plafonds de dépense d’organisation OpenAI et des alertes avant activation**, vérifier leur portée réelle et prévoir supervision, rapprochement fournisseur et arrêt d’urgence. Un budget par job, une limite de tours ou l’annulation locale ne remplacent pas ces contrôles.

## Lemon Squeezy : configuration et paiements

Le Checkout hébergé propose notamment **carte et PayPal selon la disponibilité du fournisseur**, du compte, du pays et du parcours ; le serveur ne promet pas un moyen universel. Aucun produit, prix, abonnement ou webhook réel n’est créé par la configuration de ce dépôt.

1. Commencer dans une boutique/environnement Lemon Squeezy de test et une base isolée. Renseigner `LEMON_API_KEY`, `LEMON_WEBHOOK_SECRET`, `LEMON_STORE_ID` (chaîne numérique positive) ; `LEMON_TEST_MODE=true` est le défaut de développement. En production, utiliser **`LEMON_TEST_MODE=false`**, des identifiants live cohérents et HTTPS. Ne pas mélanger les données de test et réelles.
2. Créer les offres approuvées par l’exploitant : boutique en **EUR**, une variante distincte par offre, un seul prix standard par variante. Abonnement **mensuel**, quantité 1, sans essai, remise, frais de mise en service, paliers, tarification à l’usage ni prorata. Les packs sont des achats standard ponctuels, non récurrents.
3. Définir `LEMON_PLANS` et/ou `LEMON_CREDIT_PACKS` comme tableaux JSON. Les deux valent `[]` dans l’exemple ; il est possible de ne proposer que des packs. Le serveur relit boutique, produit, variante et prix avant d’exposer le catalogue ou créer un Checkout, et refuse les incohérences. Ne pas changer silencieusement une variante déjà vendue.
4. Configurer le webhook POST `/api/billing/webhook` sur l’origine publique et les événements ci-dessous. Le corps JSON doit parvenir **brut, sans resérialisation**, avec l’en-tête **`x-signature`** Lemon Squeezy.
5. Valider le portail client fourni par Lemon pour les moyens de paiement et la résiliation en fin de période. Ne pas proposer de changements d’offre/quantité ou proratas non pris en charge. Le serveur relit l’abonnement avant de fournir l’URL du portail ; il ne configure ni ne certifie automatiquement toutes les options du portail fournisseur.

### Schéma des offres

| Clé | `LEMON_PLANS` | `LEMON_CREDIT_PACKS` |
| --- | --- | --- |
| `id` | Identifiant interne unique, 1–40 caractères `a-z`, `0-9`, `_`, `-` | Idem, unique dans le catalogue des packs |
| `name` | Nom public non vide, 80 caractères maximum | Idem |
| `variantId` | **Chaîne numérique positive**, entier sûr ; distincte de toutes les autres offres | Idem |
| `credits` | Entier positif, maximum 1 000 000 000, par mois payé | Idem, par achat validé |
| `amount` | Entier positif en **centimes EUR**, maximum 100 000 000 | Idem |
| `currency` | Exactement `eur` | Exactement `eur` |
| `maxProjects` | Entier de 1 à 1 000, obligatoire | Omettre : aucun droit supplémentaire |
| `assetQuotaBytes` | Entier de 1 à 100 Gio en octets, **global par utilisateur**, obligatoire | Omettre : aucun quota supplémentaire |

Au plus 20 offres par tableau. `amount` doit correspondre au `unit_price` fournisseur et au `subtotal` payé, pas à une déclaration du navigateur. La TVA **incluse ou ajoutée** est acceptée seulement si l’arithmétique est cohérente : taxes entières non négatives ; total = subtotal si `tax_inclusive=true` (taxe ≤ total), sinon total = subtotal + taxe. Remises, frais supplémentaires et conversion de devise sont hors périmètre. Ne pas annoncer systématiquement le montant configuré comme TTC : la fiscalité et l’affichage final dépendent du paramétrage fournisseur et doivent être validés avant vente.

### Événements exacts traités

| Ressource Lemon | Événements à activer |
| --- | --- |
| Commandes | `order_created`, `order_refunded` |
| Factures d’abonnement | `subscription_payment_success`, `subscription_payment_recovered`, `subscription_payment_failed`, `subscription_payment_refunded` |
| Cycle d’abonnement | `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`, `subscription_expired`, `subscription_paused`, `subscription_unpaused` |

La signature HMAC-SHA256 sur le corps brut est vérifiée en temps constant, **puis les ressources sont relues auprès du fournisseur** : signature seule et page de retour ne suffisent pas. Boutique, mode test/live, produit, variante, prix, quantité, commande, client et abonnement doivent correspondre aux bindings persistants. L’identité n’est pas reconstruite depuis une simple adresse e-mail ou un `user_id` reçu.

Une intention persistante fige offre, montant, crédits et quotas, avec un binding aléatoire dont seul le hash est conservé localement. La déduplication combine empreinte du corps signé, identifiants fournisseur, références uniques du journal et période mensuelle. Les crédits d’abonnement viennent uniquement d’une facture initiale/renouvelée payée et validée (`success` ou `recovered`), **jamais de `order_created`**. Une facture arrivant avant son binding est conservée en attente pour reprise après la commande ou l’abonnement signé. Les états anciens ne remplacent pas une version fournisseur plus récente.

Pour un pack, seule une commande payée conforme et non remboursée déclenche l’attribution ; commande, portefeuille et événement sont traités transactionnellement. Les packs sont accessibles avec ou sans abonnement et ne changent pas les quotas. Les endpoints authentifiés sont `GET /api/billing/credit-packs` et `POST /api/billing/credit-checkout` (`packId`, `requestId` UUID v4, cookie et CSRF). L’abonnement utilise `POST /api/billing/checkout` avec `planId` ; l’interface fournit aussi un `requestId`.

### Paiements ambigus et intervention opérateur

**Pas de retry automatique du POST Checkout**, ni de promesse de clé d’idempotence fournisseur : le client natif utilise l’API JSON:API Lemon Squeezy. Une intention déjà ouverte peut reprendre le même Checkout par relecture. Une création incertaine reste `creating` et bloque même un nouvel identifiant de demande du même type pour ce compte, plutôt que risquer un double paiement. Un Checkout expiré nécessite une nouvelle demande explicite ; `review` exige une réconciliation. Ne pas supprimer l’intention ni relancer silencieusement un achat pour « débloquer » un client.

Les changements d’offre, quantité, ancrage, essais, pauses ou proratas ne constituent pas un workflow commercial automatisé. Une anomalie peut refuser le traitement, laisser une facture en attente, produire un résultat `ignored` dans `lemon_invoices` ou placer l’achat/l’abonnement en `review`. Surveiller et rapprocher ces états. Un remboursement détecté conserve un état de revue et **ne retire pas automatiquement des crédits déjà attribués ou consommés** ; remboursements et litiges nécessitent une procédure opérateur. Retirer une offre du catalogue ne supprime pas les bindings ni les obligations d’achats déjà acceptés.

## Génération OpenAI et isolation des outils

Configurer `OPENAI_API_KEY` et vérifier l’accès à `OPENAI_MODEL=gpt-6-astra` (ou un identifiant daté compatible). Le défaut de raisonnement est `medium` ; les valeurs autorisées sont `low`, `medium`, `high`, `xhigh`, `max`. Par défaut : **12 tours au total pour toute la chaîne**, dont au plus **5 tours de préparation**, **1 tentative de correction** après validation échouée, 4 096 tokens de sortie maximum par requête, 100 000 octets de contexte sérialisé, timeout HTTP de 120 secondes, timeout du job de 600 secondes et 2 jobs concurrents.

### Chaîne intégrée par demande

1. **Agent de préparation du prompt** (`server/agents.js`) : outils en lecture seule, recherche littérale bornée et lecture du jeu, de la bibliothèque et des exemples. Il doit avoir consulté ces espaces (ou constaté un espace de référence vide) avant de soumettre un plan utilisateur en français. Les noms de fichiers seuls ne suffisent pas. Le plan précise objectif, étapes, hypothèses et critères de vérification ; ce n’est pas une chaîne de pensée privée.
2. **Passage à l’agent de code** (`server/runner.js`) : le serveur enregistre le plan (8 Kio UTF-8 maximum), ferme les outils de préparation et ouvre ceux du brouillon. Une nouvelle conversation reçoit la demande originale, le plan et au plus 24 Kio d’extraits sélectionnés parmi les lectures/recherches précédentes. Aucun raisonnement chiffré de l’agent de préparation n’est transmis à l’agent de code. Celui-ci peut relire les sources nécessaires.
3. **Validation par le serveur** (`server/jobs.js`) : à la fin annoncée par le codeur, le serveur contrôle le brouillon et le changement effectif, sans exécuter le jeu. Un échec retourne uniquement un code contrôlé et éventuellement un chemin virtuel, jamais stderr, trace native ou chemin absolu. Le codeur peut corriger dans la limite `OPENAI_MAX_REPAIRS` (0 à 3, défaut 1), du budget et des tours restant disponibles. Une correction est un nouvel appel comptabilisé, pas un retry réseau automatique.
4. **Publication** : nouvelle validation indépendante, renommages récupérables, débit après succès. Le statut, le plan et l’étape courante sont disponibles uniquement au propriétaire via ses routes de projet ; l’interface affiche Analyse du prompt, Écriture du jeu, Vérification et Publication. Le plan reste du texte non interprété, sans rendu HTML/Markdown actif.

`OPENAI_MAX_TURNS` est le plafond global (2 à 50), `OPENAI_PLANNING_MAX_TURNS` doit être inférieur à ce plafond ; un plafond trop bas ou un budget insuffisant peut empêcher toute réalisation. Les réparations ne réinitialisent aucune limite. Le runner utilisé par Express est `createAgentRunner` ; `createOpenAIRunner` reste une primitive bas niveau mono-agent pour compatibilité et tests, pas le parcours de génération du studio.

Cette chaîne offre une orchestration **inspirée du fonctionnement d’un assistant de code**, pas une reproduction du moteur de contexte propriétaire d’Augment. La recherche est locale, littérale et bornée : aucun index sémantique/embeddings, repo-map Aider, conversation persistante multi-prompts ou exécution de tests arbitraires n’est installé. Les plans sont persistants pour l’affichage, pas rejoués comme mémoire lors d’une autre demande. La migration SQLite ajoute seulement `agent_phase`/`agent_plan` aux jobs ; les historiques et soldes existants sont conservés.

- Appels directs à `https://api.openai.com/v1/responses` avec `fetch` natif : pas de SDK, CLI, image Docker ou fallback Auggie. Requêtes non streamées, **`store:false` et `background:false`**. Le raisonnement chiffré est rejoué seulement en mémoire pendant le job ; ni ce raisonnement, ni les réponses brutes, ni les arguments d’outils ne sont persistés comme usage ou exposés au navigateur.
- **Les prompts et extraits de code lus sont envoyés à OpenAI.** `store:false` ne signifie pas absence de traitement/rétention selon les politiques du fournisseur : vérifier contrat, confidentialité et règles de données du compte. Le prompt utilisateur reste dans l’historique local. Ne pas placer de secrets dans les fichiers accessibles au modèle.
- Le modèle dispose exclusivement d’outils bornés fournis par l’hôte : lister, lire, chercher du texte, lister les chemins d’assets, écrire/supprimer un fichier du brouillon. **Aucun outil hébergé OpenAI, interpréteur, `eval`, shell, commande, installation ou accès réseau arbitraire n’est une capacité IA.** Le transport OpenAI reste effectué par le serveur, pas par un outil contrôlé par le modèle.
- Lecture limitée aux espaces virtuels `src/game`, `src/lib`, `examples` et `docs` de la copie privée ; `src/game` désigne le brouillon. Les espaces `examples`/`docs` ciblent `src/examples`/`doc` dans le moteur, avec compatibilité des anciens layouts. Pour les assets publics, seuls les chemins sont listables, pas leur contenu.
- Écriture/suppression uniquement dans le brouillon de `src/game`, distinct du moteur du projet et du modèle racine. Les opérations utilisent des **descripteurs vérifiés sous Linux via `/proc/self/fd`**, refusent liens symboliques, liens physiques/fichiers spéciaux et traversées, contrôlent les ancêtres et les limites de taille/nombre/profondeur. Il s’agit d’un contrôle de capacités côté hôte, pas de l’ancienne isolation par conteneur.
- Le modèle racine et `src/lib` ne sont pas modifiables par ces outils, mais **le code lisible n’est pas confidentiel vis-à-vis de l’IA** : elle peut en recopier des extraits dans le jeu. Un moteur exécuté dans un navigateur est également récupérable par le client.

Avant publication, `inspectGame` refuse fichiers cachés, liens/fichiers spéciaux et extensions non autorisées ; il limite profondeur (12), nombre (200), taille par fichier (2 Mio) et total (10 Mio). Entrée `main.js` et changement effectif obligatoires. La validation finale **parse JavaScript, TypeScript effaçable pris en charge par Node et JSON sans exécuter le jeu** ; ce n’est **ni un typecheck complet, ni une suite de tests, ni un build, ni une validation jouable**. Une version précédente est conservée et les renommages de publication sont réconciliés au redémarrage.

## Quotas de projets et d’assets

Sans droit d’abonnement payé applicable : **2 projets** (`MAX_PROJECTS_PER_USER`) et **500 Mio** d’uploads enregistrés (`MAX_USER_ASSET_BYTES`) par utilisateur par défaut. Chaque fichier est limité à **20 Mio** (`MAX_ASSET_BYTES`). Ce sont des défauts techniques, pas une nouvelle offre commerciale.

Un abonnement éligible applique les quotas figés à l’achat pour une période effectivement créditée et encore valide ; le seul statut « actif » ne suffit pas. Les droits peuvent rester jusqu’à la fin de la période payée après résiliation, puis reviennent au socle. Les packs n’étendent jamais ces droits.

Le quota est **global entre tous les projets du compte**. Les uploads sont sérialisés par utilisateur, y compris entre projets, et ne peuvent pas se mêler à une génération active sur le projet. Seules les tailles des uploads **enregistrés dans la table des assets** sont additionnées : copies du modèle, assets d’exemple, brouillons et versions conservées sont exclus, mais occupent réellement le disque.

Une baisse de droits empêche de nouveaux projets ou uploads dépassant les nouvelles limites, **sans suppression automatique de l’existant**. Elle ne transforme pas les fichiers existants en quota supplémentaire et n’interdit pas à elle seule les générations dans un projet existant. L’interface affiche utilisation et plafond globaux ainsi que le nombre maximal de projets ; prévoir des quotas disque système séparés.

## Exploitation et limites

- Un seul processus Express doit coordonner un `DATA_DIR`. Un verrou exclusif l’impose ; ne pas utiliser le mode cluster PM2 sur ce stockage. SQLite/WAL convient à cette première instance, pas à une architecture multi-hôte partageant un disque réseau.
- Le processus `api-backend` de `ecosystem.config.js` sert maintenant le studio sur le port 3000. L’ancien `web-frontend` Vite est conservé pour compatibilité, **mais ce n’est pas un aperçu privé des projets** : ne pas l’exposer publiquement comme accès au studio ou aux jeux.
- L’aperçu jouable par projet n’est pas implémenté. Il faudra une origine distincte de celle des comptes/paiements et des builds isolés, sans secrets.
- Le moteur navigateur reste récupérable dans le code exécuté par un client. L’isolation d’écriture ne protège pas sa confidentialité, et l’IA autorisée à le lire peut en recopier des extraits.
- Restent à prévoir avant ouverture large : vérification d’e-mail/récupération de mot de passe, politique RGPD et suppression de compte, contrôles anti-abus distribués, restrictions réseau du service hôte, quotas disque système et politique de rétention des brouillons/versions. Superviser les usages fournisseur inconnus, paiements en attente/ignorés/en revue et réservations bloquées.
- Les limites d’upload concernent les fichiers ajoutés. Les copies du modèle et les versions conservées occupent aussi du disque : prévoir la capacité correspondante et des quotas au niveau du stockage. Aucun nettoyage destructif automatique des projets n’est activé.
- Sauvegarder **ensemble** la base et les projets ; pour une sauvegarde par copie de fichiers, arrêter proprement le serveur afin de ne pas omettre les écritures WAL. Ne pas supprimer un verrou de données tant qu’un autre processus peut être actif.
- L’arrêt normal bloque les nouvelles requêtes, attend les handlers HTTP, annule les tâches et ferme SQLite. La reprise réconcilie publications et réservations depuis les fichiers et données persistés ; elle ne relance pas automatiquement un appel OpenAI interrompu et ne prouve pas l’arrêt du traitement distant. Pour les anciens workers, suivre impérativement la migration avant mise à niveau.
- Par défaut `trust proxy` est désactivé : les en-têtes `X-Forwarded-For` ne permettent pas de contourner les limites. Derrière un reverse proxy local de confiance qui **réécrit** cet en-tête, configurer `TRUST_PROXY=loopback` afin de distinguer les IP des utilisateurs. Ne pas activer cette option avec un proxy non maîtrisé ou une autre topologie.

## Vérifications

`npm test` lance les tests Node natifs ; `npm run check` vérifie la syntaxe de `server.js`, `server/app.js` et `web/app.js`, pas un build/typecheck du moteur. Les tests concernés incluent `test/agent-runner.test.js`, `test/agent-progress.test.js`, `test/billing.test.js`, `test/lemon-client.test.js`, `test/runner.test.js`, `test/metering.test.js`, `test/recovery.test.js` et `test/platform.test.js` : doubles fournisseur, signature brute, bindings/idempotence, usage exact, limites d’outils, reprise, comptes, permissions et quotas. Utiliser les fixtures temporaires, jamais le modèle racine comme cible d’écriture.

Ces commandes sont des **vérifications à exécuter**, pas une attestation de réussite ni de paiement/génération réels. Avant ouverture : exécuter les tests sur Linux/Node cible, valider le parcours navigateur, les webhooks et le portail en mode test Lemon, puis une intégration OpenAI contrôlée avec autorisation de dépense. Aucun nombre de tests réussis n’est annoncé ici.

## Sources officielles à revérifier au déploiement

- OpenAI Responses : https://developers.openai.com/api/reference/resources/responses/methods/create
- Modèle et règles de contexte GPT-6 Astra : https://developers.openai.com/api/docs/models/gpt-6-astra
- Tarifs OpenAI : https://developers.openai.com/api/docs/pricing
- Cache : https://developers.openai.com/api/docs/guides/prompt-caching
- Lemon Squeezy, moyens de paiement : https://docs.lemonsqueezy.com/help/checkout/payment-methods
- Limitations PayPal : https://docs.lemonsqueezy.com/help/orders/paypal-subscriptions
- Création du Checkout : https://docs.lemonsqueezy.com/api/checkouts/create-checkout
- Signature des webhooks : https://docs.lemonsqueezy.com/help/webhooks/signing-requests
- Factures d’abonnement : https://docs.lemonsqueezy.com/api/subscription-invoices/the-subscription-invoice-object
