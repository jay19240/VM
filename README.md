# Legacy Studio — POC Aider

**Un projet → une instruction → Aider → du code.**
Prototype local pour une seule personne, pas un SaaS : aucun compte, paiement, crédit, abonnement ou base de données.
Le serveur Node/Express lance Aider dans un conteneur Docker temporaire. L’interface affiche `main.js`, sans l’exécuter.

## Démarrer

Prérequis : Linux, Node.js ≥ 22.13, npm et Docker local, accessibles au compte du serveur.

<augment_code_snippet mode="EXCERPT">
````sh
npm ci
docker pull paulgauthier/aider:v0.86.2
cp -n .env.example .env
chmod 600 .env
````
</augment_code_snippet>

Dans un éditeur local, remplir `ANTHROPIC_API_KEY` dans `.env` ; ne jamais partager ni committer la clé.
`cp -n` n’écrase pas un `.env` existant. Pour une ancienne installation, utiliser `DATA_DIR=./data/poc`.

<augment_code_snippet mode="EXCERPT">
````sh
npm start
````
</augment_code_snippet>

Ouvrir **http://localhost:3000**, créer un projet et saisir une demande, par exemple « Ajoute le double saut ».
Le navigateur attend la réponse : garder la page ouverte. Si elle est fermée, le travail peut continuer ; recharger pour lire son état.
Sans clé, Docker ou image disponible au démarrage, on peut créer et lire les projets mais pas générer. Redémarrer après configuration.

Réglages dans `.env.example` : `PORT`, `DATA_DIR`, `AIDER_DOCKER_IMAGE`, `AIDER_MODEL`, `AIDER_TIMEOUT_SECONDS` (600 par défaut).
Le modèle par défaut est `anthropic/claude-sonnet-4-6` ; il doit être accessible sur ton compte. Pour OpenAI, utiliser `openai/<modèle>` et `OPENAI_API_KEY`.

## Code restant

- `server/app.js` : cinq routes HTTP et l’interface statique.
- `server/files.js` : copies de projets, lecture de `main.js` et génération synchrone, sans file de jobs.
- `server/aider.js` : appel CLI Docker ; aucun suivi de tokens ou de coûts.
- `server/config.js` et `server/lock.js` : configuration et verrou pour empêcher deux serveurs d’écrire au même endroit.
- `server.js` : démarrage et arrêt. `web/` : une page, un script, une feuille de style.

Une création ou génération à la fois. Aider reçoit un brouillon de `src/game`, avec le moteur et les assets en lecture seule.
La demande passe par `--message-file`, équivalent au mode ponctuel `--message`, sans injection de prompt dans une commande shell.
Si le processus se termine correctement, le brouillon remplace le jeu ; la version précédente est conservée. En cas d’échec ou de timeout, le jeu reste inchangé.
**Aucun check TypeScript, validation syntaxique, lint, build ou test de gameplay.** Un résultat peut être inchangé, incomplet ou incorrect : à vérifier manuellement.
Seuls des garde-fous de fichiers restent : pas de liens ni de fichiers spéciaux/cachés, `main.js` obligatoire, 200 fichiers / 2 Mio par fichier / 10 Mio au total / profondeur 12.

## Fichiers et limites

- `engine/` reste intact ; chaque projet utilise une copie sans dépendances, builds ni fichiers cachés.
- Projet : `data/poc/projects/<id>/project.json` ; moteur complet dans `engine/`, code du jeu dans `engine/src/game/`.
- Tentative : `…/<id>/attempts/<request-id>/` ; demande, brouillon en cas d’échec et dossier `previous/` après succès. Pas de nettoyage automatique.
- Les autres fichiers générés sont dans le projet sur disque ; l’interface ne montre que `main.js`. Pas d’upload ni d’aperçu jouable intégré.
- Anciennes données : **ni effacées, ni migrées, ni utilisées**. Arrêter l’ancien serveur avant de lancer le POC. La suppression de l’intégration de paiement n’annule pas d’éventuels abonnements chez un fournisseur.
- Après crash, arrêter l’ancien serveur et son conteneur `legacy-aider-<request-id>` avant de retirer manuellement `DATA_DIR/.server.lock`. Ne jamais supprimer un verrou actif. Si le jeu manque après un crash entre les deux renommages, restaurer son dossier `previous/` avant de relancer.

**Local uniquement, sans authentification : ne pas exposer ce serveur via proxy, tunnel ou Internet.** Il écoute sur `127.0.0.1` et refuse les accès API non locaux/cross-origin.
Les conteneurs sont non-root, limités à 1 CPU / 2 Gio / 128 PID, avec racine en lecture seule et sans socket Docker. Docker n’est pas une garantie d’isolation totale ; son réseau bridge peut atteindre l’hôte et le réseau privé.
Les prompts et sources sont envoyés au fournisseur ; ne pas y mettre de secrets. La clé sélectionnée est accessible aux administrateurs Docker.
**Aucun plafond ni calcul de dépense dans ce POC.** Aider peut effectuer plusieurs appels payants, même lors d’un échec : régler les limites et alertes directement chez le fournisseur.

## Vérifications

<augment_code_snippet mode="EXCERPT">
````sh
npm test
npm run check
````
</augment_code_snippet>

Tests ciblés sur les copies, sauvegardes, erreurs, timeout, arrêt, routes HTTP et interface. Les appels Docker sont simulés, pas les routes HTTP.
Docker étant absent de l’environnement de préparation, une vraie génération reste à valider sur l’hôte cible.
