import { gfx2Manager } from '../gfx2/gfx2_manager';
import { Gfx2Drawable } from '../gfx2/gfx2_drawable';
import { Gfx2TileMap } from './gfx2_tile_map';

/**
 * Représente une couche de carte de tuiles pouvant être dessinée en 2D.
 */
export class Gfx2TileMapLayer extends Gfx2Drawable {
  tilemap: Gfx2TileMap;
  layerIndex: number;
  frameIndex: number;
  frameProgress: number;

  /** Crée une couche de rendu vide, associée par défaut à une nouvelle carte. */
  constructor() {
    super();
    this.tilemap = new Gfx2TileMap();
    this.layerIndex = 0;
    this.frameIndex = 0;
    this.frameProgress = 0;
  }

  /**
   * Associe la couche de rendu à une couche d'une carte de tuiles.
   *
   * @param {Gfx2TileMap} tilemap - Carte de tuiles à afficher.
   * @param {number} layerIndex - Indice de la couche à afficher dans la carte.
   */
  loadFromTileMap(tilemap: Gfx2TileMap, layerIndex: number): void {
    this.tilemap = tilemap;
    this.layerIndex = layerIndex;
    this.frameIndex = 0;
    this.frameProgress = 0;

    const tileLayer = tilemap.getTileLayer(layerIndex);
    this.offset[0] = tileLayer.getOffsetX();
    this.offset[1] = tileLayer.getOffsetY();
  }

  /**
   * Met à jour l'image courante des tuiles animées.
   *
   * @param {number} ts - Temps écoulé depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number): void {
    const tilelayer = this.tilemap.getTileLayer(this.layerIndex);
    if (!tilelayer) {
      return;
    }

    if (this.frameProgress > tilelayer.getFrameDuration()) {
      this.frameIndex = this.frameIndex + 1;
      this.frameProgress = 0;
    }

    this.frameProgress += ts;
  }

  /** Dessine la couche visible dans le contexte graphique 2D courant. */
  onRender(): void {
    const tilelayer = this.tilemap.getTileLayer(this.layerIndex);
    if (!tilelayer) {
      return;
    }
    if (!tilelayer.isVisible()) {
      return;
    }

    const ctx = gfx2Manager.getContext();
    const tileset = this.tilemap.getTileset();

    for (let i = 0; i < tilelayer.getRows(); i++) {
      for (let j = 0; j < tilelayer.getColumns(); j++) {
        let tileId = tilelayer.getTile(j, i);
        if (tileId <= 0) {
          continue;
        }

        const animation = tileset.getAnimation(tileId);
        if (animation) {
          tileId = animation[this.frameIndex % animation.length];
        }

        ctx.drawImage(
          tileset.getTexture(),
          tileset.getTilePositionX(tileId),
          tileset.getTilePositionY(tileId),
          tileset.getTileWidth(),
          tileset.getTileHeight(),
          j * this.tilemap.getTileWidth(),
          i * this.tilemap.getTileHeight(),
          this.tilemap.getTileWidth(),
          this.tilemap.getTileHeight()
        );
      }
    }
  }
}