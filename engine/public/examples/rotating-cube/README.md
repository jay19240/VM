# 📦 Exemple de Cube Rotatif 3D

Cet exemple démontre comment créer et animer un cube 3D rotatif avec le moteur LegacyGPU.

## 🎯 Ce que vous allez apprendre

- Charger un modèle 3D (format JSM)
- Appliquer une texture sur un objet 3D
- Animer la rotation d'un objet dans l'espace
- Configurer l'éclairage directionnel
- Utiliser le cycle de vie d'un Screen (onEnter, update, draw, render)

## 📁 Fichiers de l'exemple

- `cube.jsm` - Modèle 3D du cube (géométrie)
- `cube.png` - Texture du cube (image)
- `exemple-simple.js` - Code commenté pour débutants
- `README.md` - Ce fichier

## 🚀 Lancer l'exemple

### Option 1 : Via la galerie d'exemples

1. Démarrer le serveur : `npm run dev`
2. Ouvrir : `http://localhost:5173/examples.html`
3. Sélectionner "3D Rotating Cube" dans le menu

### Option 2 : Via la démo dédiée

1. Démarrer le serveur : `npm run dev`
2. Ouvrir : `http://localhost:5173/rotating-cube-demo.html`

## 💻 Code Principal

Le code se trouve dans : `src/examples/rotating-cube/rotating_cube_screen.js`

### Structure de base

```javascript
class RotatingCubeScreen extends Screen {
  async onEnter() {
    // 1. Configuration initiale
    this.camera.setPosition(0, 0, 30);

    // 2. Charger le cube
    await this.cube.loadFromFile('./examples/rotating-cube/cube.jsm');
    this.cube.setScale(8, 8, 8);

    // 3. Appliquer la texture
    const texture = await gfx3TextureManager.loadTexture('./examples/rotating-cube/cube.png');
    this.cube.mat.setTexture(texture);

    // 4. Configurer l'éclairage
    gfx3MeshRenderer.setDirLight(true, [0, -1, -1], [1, 1, 1], [0.2, 0.2, 0.2]);
  }

  update(ts) {
    // 5. Animer la rotation
    this.angle += ts / 1000;
    this.cube.setRotation(this.angle * 0.5, this.angle, 0);
  }

  draw() {
    // 6. Enregistrer les commandes de dessin
    gfx3Manager.beginDrawing();
    this.cube.draw();
    gfx3Manager.endDrawing();
  }

  render(ts) {
    // 7. Effectuer le rendu GPU
    gfx3Manager.beginRender();
    gfx3Manager.beginPassRender(0);
    gfx3MeshRenderer.render(ts);
    gfx3Manager.endPassRender();
    gfx3Manager.endRender();
  }
}
```

## 🎨 Personnalisation

### Changer la vitesse de rotation

```javascript
// Dans la méthode update()
this.angle += ts / 2000;  // Plus lent
this.angle += ts / 500;   // Plus rapide
```

### Modifier l'axe de rotation

```javascript
// Rotation uniquement sur Y
this.cube.setRotation(0, this.angle, 0);

// Rotation sur tous les axes
this.cube.setRotation(this.angle, this.angle, this.angle);
```

### Changer la taille du cube

```javascript
this.cube.setScale(15, 15, 15);  // Plus grand
this.cube.setScale(4, 4, 4);     // Plus petit
this.cube.setScale(10, 5, 10);   // Rectangulaire
```

### Modifier la position de la caméra

```javascript
this.camera.setPosition(20, 10, 40);  // Vue depuis le côté
this.camera.setPosition(0, 30, 20);   // Vue du dessus
```

## 📚 Concepts Clés

### Système de Coordonnées 3D
- **X** : Axe horizontal (gauche ↔ droite)
- **Y** : Axe vertical (bas ↔ haut)
- **Z** : Axe de profondeur (proche ↔ loin)

### Rotation (en radians)
- `1 tour complet = 2π radians ≈ 6.28`
- `180° = π radians ≈ 3.14`
- `90° = π/2 radians ≈ 1.57`

### Cycle de vie d'un Screen
1. **onEnter()** : Appelé une fois au début (chargement des ressources)
2. **update(ts)** : Appelé à chaque frame (logique du jeu)
3. **draw()** : Appelé après update (enregistrement des dessins)
4. **render(ts)** : Appelé après draw (rendu GPU)

## 🛠️ Dépannage

**Le cube n'apparaît pas ?**
- Vérifiez que les fichiers `cube.jsm` et `cube.png` existent
- Ouvrez la console du navigateur (F12) pour voir les erreurs
- Vérifiez que votre navigateur supporte WebGPU

**Le cube est tout noir ?**
- Assurez-vous que l'éclairage est configuré
- Vérifiez que la texture est bien chargée

**Erreur de chargement de fichier ?**
- Vérifiez les chemins relatifs vers les fichiers
- Assurez-vous que le serveur de développement est lancé

## 📖 Ressources

- [Documentation complète LegacyGPU](https://github.com/aliyah-corp/LegacyGPU)
- [Autres exemples](http://localhost:5173/examples.html)
- Code source détaillé : `src/examples/rotating-cube/rotating_cube_screen.js`
- Code simplifié avec commentaires : `public/examples/rotating-cube/exemple-simple.js`

## ✨ Aller plus loin

1. **Ajouter plusieurs cubes** avec des positions différentes
2. **Changer les couleurs** de l'éclairage
3. **Ajouter des contrôles** clavier pour la rotation manuelle
4. **Essayer d'autres modèles 3D** (charger d'autres fichiers .jsm)
5. **Créer une animation** plus complexe (oscillation, rebond, etc.)

Bon apprentissage avec LegacyGPU ! 🚀
