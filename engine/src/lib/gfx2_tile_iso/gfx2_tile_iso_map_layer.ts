import { gfx2Manager } from '../gfx2/gfx2_manager';
import { Gfx2Drawable } from '../gfx2/gfx2_drawable';
import { Gfx2TileMap } from '../gfx2_tile/gfx2_tile_map';
import { Gfx2TileIso } from './gfx2_tile_iso';

/** Représente une couche de carte de tuiles pouvant être dessinée en projection isométrique. */
export class Gfx2TileIsoMapLayer extends Gfx2Drawable {
  tilemap: Gfx2TileMap;
  layerIndex: number;
  tiles: Array<Gfx2TileIso>;
  frameIndex: number;
  frameProgress: number;
  showDebug: boolean;
  colorDebug: string;
  lineWidthDebug: number;

  /** Crée une couche isométrique vide avec les options de débogage par défaut. */
  constructor() {
    super();
    this.tilemap = new Gfx2TileMap();
    this.layerIndex = 0;
    this.tiles = [];
    this.frameIndex = 0;
    this.frameProgress = 0;
    this.showDebug = false;
    this.colorDebug = 'blue';
    this.lineWidthDebug = 0.5;
  }

  /**
   * Associe la couche de rendu à une couche de carte et prépare ses tuiles isométriques.
   *
   * @param {Gfx2TileMap} tilemap - Carte de tuiles à afficher.
   * @param {number} layerIndex - Indice de la couche à afficher dans la carte.
   */
  loadFromTileMap(tilemap: Gfx2TileMap, layerIndex: number): void {
    this.tilemap = tilemap;
    this.layerIndex = layerIndex;
    this.tiles = [];
    this.frameIndex = 0;
    this.frameProgress = 0;

    const tilelayer = tilemap.getTileLayer(layerIndex);

    this.offset[0] = tilelayer.getOffsetX();
    this.offset[1] = tilelayer.getOffsetY();

    for (let i = 0; i < tilelayer.getRows(); i++) {
      for (let j = 0; j < tilelayer.getColumns(); j++) {
        const tileId = tilelayer.getTile(j, i);
        if (tileId < 0) {
          continue;
        }

        this.placeTile(tileId, i, j);
      }
    }
  }

  /**
   * Met à jour l'image courante des tuiles animées.
   *
   * @param {number} ts - Temps écoulé depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number): void {
    const tileset = this.tilemap.getTileset();
    const tilelayer = this.tilemap.getTileLayer(this.layerIndex);
    if (!tileset || !tilelayer) {
      return;
    }

    if (this.frameProgress > tilelayer.getFrameDuration()) {
      this.frameIndex = this.frameIndex + 1;
      this.frameProgress = 0;
    }

    for (const tile of this.tiles) {
      if (tile.animation.length > 0) {
        const tileId = tile.animation[this.frameIndex % tile.animation.length];
        tile.sx = tileset.getTilePositionX(tileId);
        tile.sy = tileset.getTilePositionY(tileId);
      }
    }

    this.frameProgress += ts;
  }

  /** Dessine la couche isométrique et, s'il est activé, son quadrillage de débogage. */
  onRender(): void {
    const tilelayer = this.tilemap.getTileLayer(this.layerIndex);
    if (!tilelayer) {
      return;
    }

    const ctx = gfx2Manager.getContext();

    if (tilelayer.isVisible()) {
      const tileset = this.tilemap.getTileset();
      const scale = this.tilemap.getTileWidth() / tileset.getTileWidth();

      for (let i = 0; i < tilelayer.getRows(); i++) {
        for (let j = 0; j < tilelayer.getColumns(); j++) {
          let tileId = tilelayer.getTile(j, i);
          if (tileId < 0) {
            continue;
          }

          const position = this.tilemap.getPositionIso(i, j);
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
            position[0] - this.tilemap.getTileWidth() / 2,
            position[1] - this.tilemap.getTileHeight(),
            this.tilemap.getTileWidth(),
            tileset.getTileHeight() * scale
          );
        }
      }
    }

    if (this.showDebug) {
      for (let i = 0; i < tilelayer.getRows(); i++) {
        for (let j = 0; j < tilelayer.getColumns(); j++) {
          const position = this.tilemap.getPositionIso(i, j);
          ctx.save();
          ctx.translate(position[0], position[1]);
          ctx.strokeStyle = this.colorDebug;
          ctx.lineWidth = this.lineWidthDebug;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(this.tilemap.getTileWidth() / 2, -this.tilemap.getTileHeight() / 2);
          ctx.lineTo(0, -this.tilemap.getTileHeight());
          ctx.lineTo(-this.tilemap.getTileWidth() / 2, -this.tilemap.getTileHeight() / 2);
          ctx.lineTo(0, 0);
          ctx.stroke();
          ctx.closePath();
          ctx.restore();
        }
      }
    }
  }

  /**
   * Ajoute une tuile dessinable à une position de la grille isométrique.
   *
   * @param {number} tileId - Identifiant de la tuile.
   * @param {number} row - Indice de la ligne.
   * @param {number} col - Indice de la colonne.
   */
  placeTile(tileId: number, row: number, col: number): void {
    const tilelayer = this.tilemap.getTileLayer(this.layerIndex);
    const tileset = this.tilemap.getTileset();
    const scale = this.tilemap.getTileWidth() / tileset.getTileWidth();
    const animation = tileset.getAnimation(tileId);
    const position = this.tilemap.getPositionIso(row, col);

    this.tiles.push(new Gfx2TileIso({
      texture: tileset.getTexture(),
      animation: animation ?? [],
      elevation: this.layerIndex,
      col: col,
      row: row,
      sx: tileset.getTilePositionX(tileId),
      sy: tileset.getTilePositionY(tileId),
      sw: tileset.getTileWidth(),
      sh: tileset.getTileHeight(),
      dx: position[0],
      dy: position[1],
      ox: tilelayer.getOffsetX(),
      oy: tilelayer.getOffsetY(),
      dw: this.tilemap.getTileWidth(),
      dh: tileset.getTileHeight() * scale
    }));
  }

  /**
   * Retire la première tuile dessinable située à une position donnée.
   *
   * @param {number} row - Indice de la ligne.
   * @param {number} col - Indice de la colonne.
   */
  removeTileAt(row: number, col: number): void {
    const index = this.tiles.findIndex(t => t.col == col && t.row == row);
    if (index == -1) {
      return;
    }

    this.tiles.splice(index, 1);
  }

  /**
   * Renvoie toutes les tuiles dessinables de la couche.
   *
   * @returns Toutes les tuiles dessinables de la couche.
   */
  getTiles(): Array<Gfx2TileIso> {
    return this.tiles;
  }

  /**
   * Indique si le quadrillage de débogage est affiché.
   *
   * @returns `true` si le quadrillage de débogage est affiché.
   */
  isShowDebug(): boolean {
    return this.showDebug;
  }

  /**
   * Active ou désactive le quadrillage de débogage.
   *
   * @param {boolean} showDebug - `true` pour afficher le quadrillage.
   */
  setShowDebug(showDebug: boolean): void {
    this.showDebug = showDebug;
  }

  /**
   * Renvoie la couleur des lignes de débogage.
   *
   * @returns La couleur des lignes de débogage.
   */
  getColorDebug(): string {
    return this.colorDebug;
  }

  /**
   * Définit la couleur des lignes de débogage.
   *
   * @param {string} colorDebug - Couleur CSS à appliquer.
   */
  setColorDebug(colorDebug: string): void {
    this.colorDebug = colorDebug;
  }

  /**
   * Renvoie l'épaisseur des lignes de débogage.
   *
   * @returns L'épaisseur des lignes de débogage.
   */
  getLineWidthDebug(): number {
    return this.lineWidthDebug;
  }

  /**
   * Définit l'épaisseur des lignes de débogage.
   *
   * @param {number} lineWidthDebug - Épaisseur des lignes en pixels.
   */
  setLineWidthDebug(lineWidthDebug: number): void {
    this.lineWidthDebug = lineWidthDebug;
  }
}