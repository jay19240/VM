import { FormatJTMObject } from './format_jtm';

/** Représente un objet placé sur une couche d'une carte de tuiles. */
export class Gfx2TileObject {
  id: string;
  position: vec2;
  name: string;
  type: string;
  visible: boolean;
  size: vec2;
  properties: Map<string, any>;

  /** Crée un objet de tuile vide avec ses valeurs par défaut. */
  constructor() {
    this.id = '';
    this.position = [0, 0];
    this.name = '';
    this.type = '';
    this.visible = true;
    this.size = [0, 0];
    this.properties = new Map<string, any>();
  }

  /**
   * Charge les propriétés de l'objet depuis des données JTM.
   *
   * @param {FormatJTMObject} data - Données JTM décrivant l'objet.
   */
  loadFromData(data: FormatJTMObject): void {
    this.id = data['Id'] ?? '';
    this.position = data['Position'] ?? [0, 0];
    this.name = data['Name'] ?? '';
    this.type = data['Type'] ?? '';
    this.visible = data['Visible'] ? true : false;
    this.size = data['Size'] ?? [0, 0];

    for (const key in data['Properties']) {
      this.properties.set(key, data['Properties'][key]);
    }
  }

  /**
   * Renvoie l'identifiant de l'objet.
   *
   * @returns L'identifiant de l'objet.
   */
  getId(): string {
    return this.id;
  }

  /**
   * Renvoie la position de l'objet.
   *
   * @returns La position de l'objet dans la carte ou sur le canevas.
   */
  getPosition(): vec2 {
    return this.position;
  }

  /**
   * Renvoie le nom de l'objet.
   *
   * @returns Le nom de l'objet.
   */
  getName(): string {
    return this.name;
  }

  /**
   * Renvoie le type de l'objet.
   *
   * @returns Le type de l'objet.
   */
  getType(): string {
    return this.type;
  }

  /**
   * Indique si l'objet est visible.
   *
   * @returns `true` si l'objet est visible, sinon `false`.
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Renvoie les dimensions de l'objet.
   *
   * @returns Les dimensions de l'objet.
   */
  getSize(): vec2 {
    return this.size;
  }

  /**
   * Renvoie les propriétés personnalisées de l'objet.
   *
   * @returns Les propriétés personnalisées de l'objet, indexées par leur nom.
   */
  getProperties(): Map<string, any> {
    return this.properties;
  }
}