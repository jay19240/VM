import { gfx2Manager } from '../gfx2/gfx2_manager';
import { gfx2TextureManager } from '../gfx2/gfx2_texture_manager';
import { FormatJTMTileSet } from './format_jtm';

/** Regroupe la texture, les animations, les pentes et les propriétés d'un jeu de tuiles. */
export class Gfx2Tileset {
  columns: number;
  tileWidth: number;
  tileHeight: number;
  texture: ImageBitmap | HTMLImageElement;
  animations: Map<number, Array<number>>;
  slopes: Map<number, Array<number>>;
  properties: Map<number, any>;

  /** Crée un jeu de tuiles vide utilisant la texture par défaut. */
  constructor() {
    this.columns = 0;
    this.tileWidth = 0;
    this.tileHeight = 0;
    this.texture = gfx2Manager.getDefaultTexture();
    this.animations = new Map<number, Array<number>>;
    this.slopes = new Map<number, Array<number>>;
    this.properties = new Map<number, any>();
  }

  /**
   * Charge de façon asynchrone un jeu de tuiles depuis des données JTM.
   *
   * @param {FormatJTMTileSet} data - Données du jeu de tuiles à charger.
   */
  async loadFromData(data: FormatJTMTileSet): Promise<void> {
    this.tileWidth = Number(data['TileWidth']);
    this.tileHeight = Number(data['TileHeight']);
    this.texture = await gfx2TextureManager.loadTexture(data['TextureFile']);
    this.columns = data['Columns'] ? Number(data['Columns']) : this.texture.width / this.tileWidth;

    this.animations.clear();
    for (const tileId in data['Animations']) {
      this.animations.set(Number(tileId), data['Animations'][tileId] ?? []);
    }

    this.slopes.clear();
    for (const tileId in data['Slopes']) {
      this.slopes.set(Number(tileId), data['Slopes'][tileId] ?? []);
    }

    this.properties.clear();
    for (const tileId in data['Properties']) {
      this.properties.set(Number(tileId), data['Properties'][tileId]);
    }
  }

  /**
   * Initialise de façon asynchrone le jeu de tuiles à partir d'une texture seule.
   *
   * @param {string} texturePath - Chemin de la texture.
   * @param {number} tileWidth - Largeur d'une tuile en pixels.
   * @param {number} tileHeight - Hauteur d'une tuile en pixels.
   */
  async loadFromTexture(texturePath: string, tileWidth: number, tileHeight: number): Promise<void> {
    this.texture = await gfx2TextureManager.loadTexture(texturePath);
    this.columns = this.texture.width / tileWidth;
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
  }

  /**
   * Calcule la coordonnée horizontale d'une tuile dans la texture.
   *
   * @param {number} tileId - Identifiant de la tuile, numéroté à partir de 1.
   * @returns La coordonnée horizontale en pixels.
   */
  getTilePositionX(tileId: number): number {
    return ((tileId - 1) % this.columns) * this.tileWidth;
  }

  /**
   * Calcule la coordonnée verticale d'une tuile dans la texture.
   *
   * @param {number} tileId - Identifiant de la tuile, numéroté à partir de 1.
   * @returns La coordonnée verticale en pixels.
   */
  getTilePositionY(tileId: number): number {
    return Math.floor((tileId - 1) / this.columns) * this.tileHeight;
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
   * Renvoie le nombre de colonnes de tuiles dans la texture.
   *
   * @returns Le nombre de colonnes de tuiles dans la texture.
   */
  getColumns(): number {
    return this.columns;
  }

  /**
   * Renvoie la texture du jeu de tuiles.
   *
   * @returns La texture du jeu de tuiles.
   */
  getTexture(): ImageBitmap | HTMLImageElement {
    return this.texture;
  }

  /**
   * Obtient la séquence d'animation associée à une tuile.
   *
   * @param {number} tileId - Identifiant de la tuile.
   * @returns La liste des identifiants d'images, ou `undefined` si aucune animation n'est définie.
   */
  getAnimation(tileId: number): Array<number> | undefined {
    return this.animations.get(tileId);
  }

  /**
   * Obtient la pente associée à une tuile.
   *
   * @param {number} tileId - Identifiant de la tuile.
   * @returns Les hauteurs de la pente, ou `undefined` si aucune pente n'est définie.
   */
  getSlope(tileId: number): Array<number> | undefined {
    return this.slopes.get(tileId);
  }

  /**
   * Obtient toutes les propriétés associées à une tuile.
   *
   * @param {number} tileId - Identifiant de la tuile.
   * @returns Les propriétés de la tuile.
   * @throws Une erreur si la tuile ne possède aucune entrée de propriétés.
   */
  getProperties(tileId: number): any {
    const properties = this.properties.get(tileId);
    if (!properties) {
      throw new Error('Gfx2TileMap::getProperties(): Properties not found for this tile');
    }

    return properties;
  }

  /**
   * Obtient une propriété particulière d'une tuile.
   *
   * @param {number} tileId - Identifiant de la tuile.
   * @param {string} key - Nom de la propriété.
   * @returns La valeur de la propriété, éventuellement `undefined` si la clé est absente.
   * @throws Une erreur si la tuile ne possède aucune entrée de propriétés.
   */
  getProperty(tileId: number, key: string): any {
    const properties = this.properties.get(tileId);
    if (!properties) {
      throw new Error('Gfx2TileMap::getProperty(): Properties not found for this tile');
    }

    return properties[key];
  }
}