# 🎮 Guide du Cube Rotatif 3D

Bienvenue dans cet exemple de cube rotatif 3D réalisé avec **LegacyGPU** !

## 📋 Description

Cet exemple démontre les bases de la création d'une scène 3D avec un objet animé. Un cube texturé tourne en continu sur plusieurs axes avec un éclairage directionnel réaliste.

## 🎯 Ce que vous allez apprendre

- ✅ Charger un modèle 3D (format JSM)
- ✅ Appliquer une texture sur un objet 3D
- ✅ Configurer une caméra 3D
- ✅ Animer un objet avec des rotations
- ✅ Configurer l'éclairage directionnel
- ✅ Comprendre la boucle de jeu (update/draw/render)

## 📁 Fichiers de l'exemple

```
public/examples/rotating-cube/
├── cube.jsm          # Modèle 3D du cube (format JSON Static Mesh)
├── cube.png          # Texture appliquée sur le cube
├── README.md         # Documentation technique (anglais)
└── GUIDE.md          # Ce guide (français)

src/examples/rotating-cube/
├── rotating_cube_screen.js  # Exemple original (anglais)
└── cube_rotatif.js         # Exemple commenté en français
```

## 🚀 Comment lancer l'exemple

### Méthode 1 : Via le menu des exemples

1. Démarrez le serveur de développement :
   ```bash
   npm run dev
   ```

2. Ouvrez votre navigateur à l'adresse indiquée (généralement `http://localhost:5173`)

3. Ouvrez `examples.html`

4. Sélectionnez "3D Rotating Cube" dans le menu

### Méthode 2 : Intégrer dans votre code

Vous pouvez importer et utiliser le screen dans votre propre code :

```javascript
import { screenManager } from '@lib/screen/screen_manager';
import { CubeRotatifScreen } from '@examples/rotating-cube/cube_rotatif';

// Changer vers l'écran du cube rotatif
screenManager.requestSetScreen(new CubeRotatifScreen());
```

## 🔧 Comment ça fonctionne

### 1. Structure de base d'un Screen

Tout écran dans LegacyGPU hérite de la classe `Screen` et implémente ces méthodes :

- **`onEnter()`** : Appelée une fois lors de l'entrée dans l'écran (chargement des ressources)
- **`update(ts)`** : Appelée à chaque frame pour mettre à jour la logique
- **`draw()`** : Prépare les objets à dessiner
- **`render(ts)`** : Effectue le rendu GPU réel

### 2. Initialisation de la scène

```javascript
async onEnter() {
  // Position de la caméra
  this.camera.setPosition(0, 0, 30);
  
  // Chargement du cube
  this.cube = await this.creerCube(0, 0, 0);
  
  // Configuration de l'éclairage
  gfx3MeshRenderer.setDirLight(true, [0, -1, -1], [1, 1, 1], [0.2, 0.2, 0.2]);
}
```

### 3. Animation du cube

```javascript
update(ts) {
  this.angle += ts / 1000; // Incrémente l'angle
  this.cube.setRotation(this.angle * 0.5, this.angle, 0); // Applique la rotation
}
```

### 4. Rendu de la scène

```javascript
draw() {
  gfx3Manager.beginDrawing();
  this.cube.draw(); // Ajoute le cube à la file de rendu
  gfx3Manager.endDrawing();
}

render(ts) {
  gfx3Manager.beginRender();
  gfx3Manager.beginPassRender(0);
  gfx3MeshRenderer.render(ts); // Rendu de tous les meshes
  gfx3Manager.endPassRender();
  gfx3Manager.endRender();
}
```

## 🎨 Personnalisation

### Modifier la vitesse de rotation

Dans la méthode `update()`, changez les multiplicateurs :

```javascript
// Rotation plus rapide
this.cube.setRotation(this.angle * 2, this.angle * 3, 0);

// Rotation plus lente
this.cube.setRotation(this.angle * 0.2, this.angle * 0.3, 0);
```

### Changer la taille du cube

Dans la méthode `creerCube()`, modifiez le scale :

```javascript
mesh.setScale(16, 16, 16); // Cube 2x plus grand
mesh.setScale(4, 4, 4);    // Cube 2x plus petit
```

### Modifier l'éclairage

```javascript
// Lumière plus intense
gfx3MeshRenderer.setDirLight(true, [0, -1, -1], [2, 2, 2], [0.5, 0.5, 0.5]);

// Lumière colorée (rouge)
gfx3MeshRenderer.setDirLight(true, [0, -1, -1], [1, 0.3, 0.3], [0.2, 0.1, 0.1]);
```

### Changer la texture

Remplacez `cube.png` par votre propre texture, ou modifiez le chemin :

```javascript
const texture = await gfx3TextureManager.loadTexture('./path/to/your/texture.png');
```

## 📚 Concepts clés

### Format JSM (JSON Static Mesh)

Le format JSM contient :
- **Vertices** : Coordonnées des sommets (x, y, z)
- **Normals** : Vecteurs normaux pour l'éclairage
- **TextureCoords** : Coordonnées UV pour la texture
- **Colors** : Couleurs des sommets (optionnel)

### Système de coordonnées

- **X** : Gauche (-) / Droite (+)
- **Y** : Bas (-) / Haut (+)
- **Z** : Loin (-) / Proche (+)

### Rotation (en radians)

- `setRotation(x, y, z)` accepte des angles en radians
- 2π radians = 360 degrés
- Pour convertir : `degrés * Math.PI / 180`

## 🐛 Dépannage

### Le cube n'apparaît pas

- Vérifiez que la caméra est bien positionnée (z > 0)
- Vérifiez que le cube est à l'échelle (scale > 0)
- Vérifiez que les fichiers cube.jsm et cube.png existent

### Le cube est tout noir

- Vérifiez que l'éclairage est activé
- Vérifiez que le paramètre `LIGHT_ENABLED` est à 1.0

### La rotation ne fonctionne pas

- Vérifiez que `update()` est bien appelée
- Vérifiez que `ts` (timestep) est bien passé à la méthode

## 🎓 Pour aller plus loin

- Ajoutez plusieurs cubes à la scène
- Implémentez des contrôles clavier/souris
- Ajoutez d'autres types d'éclairage (point light, spot light)
- Créez vos propres modèles 3D dans Blender et exportez-les en JSM

## 📖 Ressources

- [Documentation LegacyGPU](../../README.md)
- [Autres exemples](../../../src/examples/)
- [Plugin Blender pour JSM](../../../legacygpu-plugin-blender/)

---

**Bon code ! 🚀**
