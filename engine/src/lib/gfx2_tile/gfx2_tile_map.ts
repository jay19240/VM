import { PH } from '../core/physics';
import { FormatJTM, fromSpriteFusion, fromTilekit } from './format_jtm';
import { Gfx2TileLayer } from './gfx2_tile_layer';
import { Gfx2Tileset } from './gfx2_tile_set';

/** Résultat d'une résolution de collision entre un rectangle mobile et une couche de tuiles. */
export interface Gfx2TileCollision {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
  horizontalRow: number;
  horizontalCol: number;
  verticalRow: number;
  verticalCol: number;
  isGrounded: boolean;
  isAgainstWall: null | 'right' | 'left' | 'top' | 'bottom';
  mx: number;
  my: number;
};

/** Représente une carte composée de couches de tuiles et de leur jeu de tuiles. */
export class Gfx2TileMap {
  rows: number;
  columns: number;
  tileHeight: number;
  tileWidth: number;
  tileLayers: Array<Gfx2TileLayer>;
  tileset: Gfx2Tileset;

  /** Crée une carte de tuiles vide. */
  constructor() {
    this.rows = 0;
    this.columns = 0;
    this.tileHeight = 0;
    this.tileWidth = 0;
    this.tileLayers = [];
    this.tileset = new Gfx2Tileset();
  }

  /**
   * Charge de façon asynchrone une carte depuis un fichier JSON au format JTM.
   *
   * @param {string} path - Chemin du fichier JTM.
   * @throws Une erreur si les données chargées ne sont pas au format JTM.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();
    await this.loadFromData(json);
  }

  /**
   * Charge de façon asynchrone une carte depuis un fichier JSON Tilekit.
   *
   * @param {string} path - Chemin du fichier Tilekit.
   * @param {string} textureDir - Répertoire contenant la texture référencée par le fichier.
   * @throws Une erreur si les données converties ne sont pas au format JTM.
   */
  async loadFromTileKit(path: string, textureDir: string = ''): Promise<void> {
    const data = await fromTilekit(path, textureDir);
    await this.loadFromData(data);
  }

  /**
   * Charge de façon asynchrone une carte depuis un fichier JSON Sprite Fusion.
   *
   * @param {string} path - Chemin du fichier Sprite Fusion.
   * @param {string} texturePath - Chemin du fichier de texture associé.
   * @throws Une erreur si les données converties ne sont pas au format JTM.
   */
  async loadFromSpriteFusion(path: string, texturePath: string = ''): Promise<void> {
    const data = await fromSpriteFusion(path, texturePath);
    await this.loadFromData(data);
  }

  /**
   * Charge la carte depuis des données au format JTM.
   *
   * @param {FormatJTM} json - Données JTM à charger.
   * @throws Une erreur si l'identifiant du format est absent ou différent de `JTM`.
   */
  async loadFromData(json: FormatJTM) {
    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'JTM') {
      throw new Error('Gfx2TileMap::loadFromData(): Data not valid !');
    }

    this.rows = json['Rows'];
    this.columns = json['Columns'];
    this.tileHeight = json['TileHeight'];
    this.tileWidth = json['TileWidth'];

    this.tileLayers = [];
    for (const obj of json['Layers']) {
      const tileLayer = new Gfx2TileLayer();
      tileLayer.loadFromData(obj);
      this.tileLayers.push(tileLayer);
    }

    this.tileset = new Gfx2Tileset();
    if (json['Tileset']) {
      await this.tileset.loadFromData(json['Tileset']);
    }
  }

  /**
   * Calcule la hauteur totale de la carte.
   *
   * @returns La hauteur totale de la carte en pixels.
   */
  getHeight(): number {
    return this.rows * this.tileHeight;
  }

  /**
   * Calcule la largeur totale de la carte.
   *
   * @returns La largeur totale de la carte en pixels.
   */
  getWidth(): number {
    return this.columns * this.tileWidth;
  }

  /**
   * Renvoie le nombre de lignes de la carte.
   *
   * @returns Le nombre de lignes de la carte.
   */
  getRows(): number {
    return this.rows;
  }

  /**
   * Renvoie le nombre de colonnes de la carte.
   *
   * @returns Le nombre de colonnes de la carte.
   */
  getColumns(): number {
    return this.columns;
  }

  /**
   * Renvoie la hauteur d'une tuile.
   *
   * @returns La hauteur d'une tuile en pixels.
   */
  getTileHeight(): number {
    return this.tileHeight;
  }

  /**
   * Renvoie la largeur d'une tuile.
   *
   * @returns La largeur d'une tuile en pixels.
   */
  getTileWidth(): number {
    return this.tileWidth;
  }

  /**
   * Obtient la couche située à un indice donné.
   *
   * @param {number} index - Indice de la couche.
   * @returns La couche de tuiles correspondante.
   */
  getTileLayer(index: number): Gfx2TileLayer {
    return this.tileLayers[index];
  }

  /**
   * Renvoie toutes les couches de tuiles de la carte.
   *
   * @returns Toutes les couches de tuiles de la carte.
   */
  getTileLayers(): Array<Gfx2TileLayer> {
    return this.tileLayers;
  }

  /**
   * Recherche une couche par son nom.
   *
   * @param {string} name - Nom de la couche recherchée.
   * @returns La première couche correspondante, ou `undefined` si elle n'existe pas.
   */
  findTileLayer(name: string): Gfx2TileLayer | undefined {
    return this.tileLayers.find(tileLayer => tileLayer.getName() == name);
  }

  /**
   * Renvoie le jeu de tuiles associé à la carte.
   *
   * @returns Le jeu de tuiles associé à la carte.
   */
  getTileset(): Gfx2Tileset {
    return this.tileset;
  }

  /**
   * Convertit un indice de colonne en coordonnée horizontale, depuis l'origine en haut à gauche.
   *
   * @param {number} col - Indice de la colonne.
   * @returns La coordonnée horizontale en pixels.
   */
  getPositionX(col: number): number {
    return col * this.tileWidth;
  }

  /**
   * Convertit un indice de ligne en coordonnée verticale, depuis l'origine en haut à gauche.
   *
   * @param {number} row - Indice de la ligne.
   * @returns La coordonnée verticale en pixels.
   */
  getPositionY(row: number): number {
    return row * this.tileHeight;
  }

  /**
   * Convertit une coordonnée horizontale en indice de colonne.
   *
   * @param {number} x - Coordonnée horizontale en pixels.
   * @returns L'indice de la colonne correspondante.
   */
  getLocationCol(x: number): number {
    return Math.floor(x / this.tileWidth);
  }

  /**
   * Convertit une coordonnée verticale en indice de ligne.
   *
   * @param {number} y - Coordonnée verticale en pixels.
   * @returns L'indice de la ligne correspondante.
   */
  getLocationRow(y: number): number {
    return Math.floor(y / this.tileHeight);
  }

  /**
   * Convertit les indices d'une tuile en position projetée isométrique.
   *
   * @param {number} row - Indice de la ligne.
   * @param {number} col - Indice de la colonne.
   * @returns La position projetée en pixels.
   */
  getPositionIso(row: number, col: number): vec2 {
    const x = Math.ceil((col - row) * (this.tileWidth * 0.5));
    const y = Math.ceil((col + row) * (this.tileHeight * 0.5));
    return [x, y];
  }

  /**
   * Convertit une position isométrique en indices de colonne et de ligne.
   *
   * @param {number} x - Coordonnée horizontale projetée en pixels.
   * @param {number} y - Coordonnée verticale projetée en pixels.
   * @returns Un vecteur contenant la colonne puis la ligne correspondantes.
   */
  getLocationFromIso(x: number, y: number): vec2 {
    const divY = y / this.tileHeight;
    const divX = x / this.tileWidth;
    const col = Math.ceil(divY + divX);
    const row = Math.ceil(divY - divX);
    return [col, row];
  }

  /**
   * Résout le déplacement d'un rectangle contre les tuiles solides d'une couche.
   *
   * @param {number} mx - Déplacement horizontal demandé.
   * @param {number} my - Déplacement vertical demandé.
   * @param {number} layerIndex - Indice de la couche utilisée pour les collisions.
   * @param {number} l - Bord gauche du rectangle.
   * @param {number} r - Bord droit du rectangle.
   * @param {number} t - Bord supérieur du rectangle.
   * @param {number} b - Bord inférieur du rectangle.
   * @param {number} gap - Marge conservée entre le rectangle et les tuiles rencontrées.
   * @returns Les côtés touchés, les tuiles concernées et le déplacement corrigé.
   */
  box(mx: number, my: number, layerIndex: number, l: number, r: number, t: number, b: number, gap: number = 0.01): Gfx2TileCollision {
    const bottom = this.getLocationRow(b + my);
    const top = this.getLocationRow(t + my);
    const right = this.getLocationCol(r + mx);
    const left = this.getLocationCol(l + mx);

    const collisions: Gfx2TileCollision = {
      left: false,
      right: false,
      top: false,
      bottom: false,
      horizontalRow: -1,
      horizontalCol: -1,
      verticalRow: -1,
      verticalCol: -1,
      isGrounded: false,
      isAgainstWall: null,
      mx: mx,
      my: my
    };

    const layer = this.getTileLayer(layerIndex);

    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        const tileId = layer.getTile(col, row);
        if (tileId == 0) continue;
        if (col != left && col != right && row != top && row != bottom) continue;

        const tileX = col * this.tileWidth;
        const tileY = row * this.tileHeight;
        const slope = this.tileset.getSlope(tileId);
        const collideH = PH.RECTS_COLLIDE([l + mx, t], [r + mx, b], [tileX, tileY], [tileX + this.tileWidth, tileY + this.tileHeight]);
        const collideV = PH.RECTS_COLLIDE([l, t + my], [r, b + my], [tileX, tileY], [tileX + this.tileWidth, tileY + this.tileHeight]);

        if ((collideH || collideV) && slope) {
          const y1 = tileY + slope[0];
          const y2 = tileY + slope[1];
          const s = y1 < y2 ? l : r;
          const t = Math.min((s - tileX) / this.tileWidth, 1.0);

          if (s - tileX < this.tileWidth + (r - l)) {
            const slopePosY = y1 + ((y2 - y1) * t);
            collisions.bottom = (b + my) >= slopePosY;
            collisions.isGrounded = collisions.bottom;
            collisions.verticalRow = row;
            collisions.verticalCol = col;
            collisions.my = collisions.bottom ? slopePosY - b - gap : collisions.my;
            return collisions;
          }
        }

        if (collideV && my > 0) {
          collisions.bottom = true;
          collisions.isGrounded = true;
          collisions.verticalRow = row;
          collisions.verticalCol = col;
          collisions.my = tileY - b - gap;
        }
        else if (collideV && my < 0) {
          collisions.top = true;
          collisions.verticalRow = row;
          collisions.verticalCol = col;
          collisions.my = (tileY + this.tileHeight) - t + gap;
        }

        if (collideH && mx < 0) {
          collisions.left = true;
          collisions.horizontalRow = row;
          collisions.horizontalCol = col;
          collisions.mx = (tileX + this.tileWidth) - l + gap;
        }
        else if (collideH && mx > 0) {
          collisions.right = true;
          collisions.horizontalRow = row;
          collisions.horizontalCol = col;
          collisions.mx = tileX - r - gap;
        }
      }

      const leftEdgeCol = this.getLocationCol(l - 0.1);
      const isWallLeft = layer.getTile(leftEdgeCol, row) !== 0;
      if (isWallLeft) {
        collisions.isAgainstWall = 'left';
      }

      const rightEdgeCol = this.getLocationCol(r + 0.1);
      const isWallRight = layer.getTile(rightEdgeCol, row) !== 0;
      if (isWallRight) {
        collisions.isAgainstWall = 'right';
      }
    }

    return collisions;
  }
}