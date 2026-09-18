/**
 * EXEMPLE SIMPLE : CUBE ROTATIF 3D
 * 
 * Ce fichier montre comment créer un cube rotatif basique
 * avec LegacyGPU de manière simple et commentée.
 */

import { gfx3TextureManager } from '@lib/gfx3/gfx3_texture_manager';
import { gfx3Manager } from '@lib/gfx3/gfx3_manager';
import { gfx3MeshRenderer } from '@lib/gfx3_mesh/gfx3_mesh_renderer';
import { Screen } from '@lib/screen/screen';
import { Gfx3MeshJSM } from '@lib/gfx3_mesh/gfx3_mesh_jsm';
import { Gfx3Camera } from '@lib/gfx3_camera/gfx3_camera';

class SimpleCubeScreen extends Screen {
  constructor() {
    super();
    // Créer une caméra
    this.camera = new Gfx3Camera(0);
    
    // Le cube (mesh 3D)
    this.cube = new Gfx3MeshJSM();
    
    // Angle de rotation actuel
    this.angle = 0;
  }

  async onEnter() {
    // ÉTAPE 1: Positionner la caméra
    this.camera.setPosition(0, 0, 30); // X, Y, Z

    // ÉTAPE 2: Charger le modèle 3D
    await this.cube.loadFromFile('./examples/rotating-cube/cube.jsm');
    
    // ÉTAPE 3: Positionner et dimensionner le cube
    this.cube.setPosition(0, 0, 0);
    this.cube.setScale(8, 8, 8);
    
    // ÉTAPE 4: Charger et appliquer une texture
    const texture = await gfx3TextureManager.loadTexture('./examples/rotating-cube/cube.png');
    this.cube.mat.setTexture(texture);
    
    // ÉTAPE 5: Configurer l'éclairage
    const enabled = true;
    const direction = [0, -1, -1]; // Direction de la lumière
    const color = [1, 1, 1];       // Couleur blanche
    const ambient = [0.2, 0.2, 0.2]; // Lumière ambiante
    gfx3MeshRenderer.setDirLight(enabled, direction, color, ambient);
  }

  update(ts) {
    // Mettre à jour le cube
    this.cube.update(ts);
    
    // Calculer le nouvel angle (ts est en millisecondes)
    this.angle += ts / 1000;
    
    // Appliquer la rotation
    // Rotation sur X, Y et Z pour un effet plus dynamique
    this.cube.setRotation(
      this.angle * 0.5,  // Rotation X (lente)
      this.angle,        // Rotation Y (normale)
      0                  // Pas de rotation Z
    );
  }

  draw() {
    // Commencer à enregistrer les commandes de dessin
    gfx3Manager.beginDrawing();
    
    // Ajouter le cube à dessiner
    this.cube.draw();
    
    // Terminer l'enregistrement
    gfx3Manager.endDrawing();
  }

  render(ts) {
    // Commencer le rendu
    gfx3Manager.beginRender();
    
    // Passe de rendu principale
    gfx3Manager.beginPassRender(0);
    gfx3MeshRenderer.render(ts);
    gfx3Manager.endPassRender();
    
    // Terminer le rendu
    gfx3Manager.endRender();
  }
}

export { SimpleCubeScreen };

/**
 * NOTES POUR LES DÉBUTANTS :
 * 
 * 1. FICHIERS REQUIS
 *    - cube.jsm : Le modèle 3D (géométrie du cube)
 *    - cube.png : La texture (image appliquée sur le cube)
 * 
 * 2. CYCLE DE VIE D'UN SCREEN
 *    - onEnter() : Appelé une fois au début, pour charger les ressources
 *    - update(ts) : Appelé à chaque frame, pour la logique
 *    - draw() : Appelé après update, pour enregistrer quoi dessiner
 *    - render(ts) : Appelé après draw, pour effectuer le rendu GPU
 * 
 * 3. SYSTÈME DE COORDONNÉES
 *    - X : axe horizontal (gauche/droite)
 *    - Y : axe vertical (haut/bas)
 *    - Z : axe de profondeur (proche/loin)
 * 
 * 4. ROTATION
 *    - Les angles sont en radians
 *    - 2π radians = 360 degrés
 *    - setRotation(x, y, z) applique une rotation sur chaque axe
 * 
 * 5. ÉCLAIRAGE
 *    - Directionnel : simule une source de lumière distante (comme le soleil)
 *    - Ambient : lumière de base présente partout
 * 
 * 6. POUR ALLER PLUS LOIN
 *    - Essayez de modifier la vitesse de rotation
 *    - Changez la position ou l'échelle du cube
 *    - Modifiez les couleurs de l'éclairage
 *    - Ajoutez plusieurs cubes !
 */
