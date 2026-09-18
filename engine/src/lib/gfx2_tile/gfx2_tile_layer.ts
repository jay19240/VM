import { Gfx2TileObject } from './gfx2_tile_object';

/** Représente les données d'une couche de tuiles d'une carte. */
export class Gfx2TileLayer {
  name: string;
  rows: number;
  offsetX: number;
  offsetY: number;
  columns: number;
  visible: boolean;
  frameDuration: number;
  grid: Array<number>;
  objects: Array<Gfx2TileObject>;

  /** Crée une couche vide avec ses valeurs par défaut. */
  constructor() {
    this.name = '';
    this.rows = 0;
    this.columns = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.visible = true;
    this.frameDuration = 0;
    this.grid = [];
    this.objects = [];
  }

  /**
   * Charge la couche depuis un objet de données JTM.
   *
   * @param {any} data - Données décrivant la couche et ses objets.
   */
  loadFromData(data: any): void {
    this.name = data['Name'];
    this.rows = data['Rows'];
    this.columns = data['Columns'];
    this.offsetX = data['OffsetX'] ?? 0;
    this.offsetY = data['OffsetY'] ?? 0;
    this.visible = data['Visible'] ?? true;
    this.frameDuration = data['FrameDuration'] ?? 0;
    this.grid = data['Grid'];

    if (data['Objects'] && data['Objects'].length > 0) {
      for (const obj of data['Objects']) {
        const object = new Gfx2TileObject();
        object.loadFromData(obj);
        this.objects.push(object);
      }
    }
  }

  /**
   * Obtient l'identifiant de la tuile à une position de la grille.
   *
   * @param {number} col - Indice de la colonne.
   * @param {number} row - Indice de la ligne.
   * @returns L'identifiant stocké à cette position.
   */
  getTile(col: number, row: number) {
    return this.grid[col + (row * this.columns)];
  }

  /**
   * Définit la tuile à une position de la grille.
   *
   * @param {number} col - Indice de la colonne.
   * @param {number} row - Indice de la ligne.
   * @param {number} tileId - Identifiant de la tuile à enregistrer.
   */
  setTile(col: number, row: number, tileId: number) {
    this.grid[col + (row * this.columns)] = tileId;
  }

  /**
   * Renvoie le nom de la couche.
   *
   * @returns Le nom de la couche.
   */
  getName(): string {
    return this.name;
  }

  /**
   * Renvoie le nombre de lignes de la couche.
   *
   * @returns Le nombre de lignes de la couche.
   */
  getRows(): number {
    return this.rows;
  }

  /**
   * Renvoie le décalage horizontal de la couche.
   *
   * @returns Le décalage horizontal de la couche en pixels.
   */
  getOffsetX(): number {
    return this.offsetX;
  }

  /**
   * Renvoie le décalage vertical de la couche.
   *
   * @returns Le décalage vertical de la couche en pixels.
   */
  getOffsetY(): number {
    return this.offsetY;
  }

  /**
   * Renvoie le nombre de colonnes de la couche.
   *
   * @returns Le nombre de colonnes de la couche.
   */
  getColumns(): number {
    return this.columns;
  }

  /**
   * Indique si la couche doit être affichée.
   *
   * @returns `true` si la couche doit être affichée, sinon `false`.
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Renvoie la durée d'une image des tuiles animées.
   *
   * @returns La durée d'une image des tuiles animées, en millisecondes.
   */
  getFrameDuration(): number {
    return this.frameDuration;
  }

  /**
   * Renvoie la grille linéarisée de la couche.
   *
   * @returns La grille linéarisée des identifiants de tuiles.
   */
  getGrid(): Array<number> {
    return this.grid;
  }

  /**
   * Renvoie les objets placés sur la couche.
   *
   * @returns Les objets placés sur la couche.
   */
  getObjects(): Array<Gfx2TileObject> {
    return this.objects;
  }
}