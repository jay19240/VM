# 🎓 Tutoriel : Créer un Cube Rotatif 3D

Bienvenue dans ce tutoriel qui vous apprendra à créer votre premier objet 3D animé avec **LegacyGPU** !

## 📖 Table des matières

1. [Introduction](#introduction)
2. [Prérequis](#prérequis)
3. [Les 3 versions de l'exemple](#les-3-versions-de-lexemple)
4. [Comprendre le code](#comprendre-le-code)
5. [Personnalisation](#personnalisation)
6. [Exercices pratiques](#exercices-pratiques)

---

## 🎯 Introduction

Cet exemple vous montre comment créer une scène 3D simple avec un cube qui tourne en continu. C'est le "Hello World" de la programmation 3D !

**Ce que vous allez apprendre :**
- ✅ Créer et configurer une scène 3D
- ✅ Charger un modèle 3D (format JSM)
- ✅ Appliquer une texture sur un objet
- ✅ Animer un objet avec des rotations
- ✅ Configurer l'éclairage
- ✅ Comprendre la boucle de jeu

---

## 🛠️ Prérequis

### Logiciels requis
- **Node.js** (version 16 ou supérieure)
- Un navigateur moderne supportant **WebGPU** :
  - Chrome 113+
  - Edge 113+
  - Firefox Nightly (avec flag activé)

### Vérifier le support WebGPU
```javascript
if (!navigator.gpu) {
  console.error('WebGPU non supporté sur ce navigateur');
}
```

### Lancer le projet
```bash
# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev

# Ouvrir dans le navigateur
# http://localhost:5173/examples.html
```

---

## 📦 Les 3 versions de l'exemple

Nous proposons 3 versions de complexité croissante :

### 1️⃣ Version MINIMALE (`rotating_cube_minimal.js`)
**Pour qui ?** Débutants absolus en 3D

**Ce qu'elle contient :**
- Un seul cube
- Rotation automatique simple
- Code ultra-commenté
- ~150 lignes de code

**Idéal pour :** Comprendre les bases

---

### 2️⃣ Version STANDARD (`rotating_cube_screen.js`)
**Pour qui ?** Développeurs avec des bases en JavaScript

**Ce qu'elle contient :**
- Un cube avec texture
- Rotation sur plusieurs axes
- Configuration d'éclairage
- Code propre et organisé
- ~120 lignes de code

**Idéal pour :** Comprendre l'architecture du moteur

---

### 3️⃣ Version AVANCÉE (`rotating_cube_advanced.js`)
**Pour qui ?** Développeurs expérimentés

**Ce qu'elle contient :**
- Plusieurs cubes animés
- Contrôles interactifs (clavier)
- Caméra mobile
- Vitesse de rotation réglable
- ~200 lignes de code

**Idéal pour :** Créer des expériences interactives

---

## 🔍 Comprendre le code

### Structure d'un Screen

Tous les "écrans" dans LegacyGPU suivent ce modèle :

```javascript
class MonScreen extends Screen {
  constructor() {
    super();
    // Initialisation des variables
  }

  async onEnter() {
    // Chargement des ressources (1 fois)
  }

  update(ts) {
    // Logique du jeu (chaque frame)
  }

  draw() {
    // Préparation du dessin (chaque frame)
  }

  render(ts) {
    // Rendu GPU (chaque frame)
  }
}
```

### Cycle de vie détaillé

```
┌─────────────┐
│  onEnter()  │  ← Appelé 1 fois au démarrage
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  update(ts) │  ← Logique (60 fois/seconde)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   draw()    │  ← Enregistre les dessins
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ render(ts)  │  ← Rendu GPU final
└──────┬──────┘
       │
       └──────→ Retour à update()
```

### Les 4 étapes essentielles

#### 🚀 Étape 1 : Initialisation (onEnter)

```javascript
async onEnter() {
  // 1. Positionner la caméra
  this.camera.setPosition(0, 0, 30);
  
  // 2. Charger le cube
  this.cube = new Gfx3MeshJSM();
  await this.cube.loadFromFile('./examples/rotating-cube/cube.jsm');
  
  // 3. Appliquer une texture
  const texture = await gfx3TextureManager.loadTexture('./examples/rotating-cube/cube.png');
  this.cube.mat.setTexture(texture);
  
  // 4. Configurer l'éclairage
  gfx3MeshRenderer.setDirLight(true, [0, -1, -1], [1, 1, 1], [0.2, 0.2, 0.2]);
}
```

