import { UT } from '../core/utils';
import { Poolable } from '../core/object_pool';
import { Gfx3BoundingBox } from '../gfx3/gfx3_bounding_box';
import { Gfx3Texture } from '../gfx3/gfx3_texture';
import { Gfx3Sprite } from './gfx3_sprite';

/**
 * Représente un sprite 3D statique, sans animation.
 */
export class Gfx3SpriteJSS extends Gfx3Sprite implements Poolable<Gfx3SpriteJSS> {
  textureRect: vec4;

  /** Initialise un sprite statique utilisant l'intégralité de sa texture. */
  constructor() {
    super();
    this.textureRect = [0, 0, 1, 1];
  }

  /**
   * Charge la région de texture et les propriétés du sprite depuis un fichier JSON JSS.
   *
   * @param path - Chemin du fichier JSS.
   * @returns Une promesse résolue une fois le sprite chargé.
   * @throws Si le fichier ne possède pas l'identifiant JSS attendu.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'JSS') {
      throw new Error('Gfx3SpriteJSS::loadFromFile(): File not valid !');
    }

    this.textureRect[0] = json['X'];
    this.textureRect[1] = json['Y'];
    this.textureRect[2] = json['Width'];
    this.textureRect[3] = json['Height'];

    this.offset[0] = json['OffsetX'] ?? 0;
    this.offset[1] = json['OffsetY'] ?? 0;

    this.flip[0] = json['FlipX'] ?? false;
    this.flip[1] = json['FlipY'] ?? false;

    this.offsetFactor[0] = json['OffsetFactorX'] ?? 0;
    this.offsetFactor[1] = json['OffsetFactorY'] ?? 0;
    this.offsetFactorEnabled = json['OffsetFactorEnabled'] ? true : false;

    this.boundingBox = Gfx3BoundingBox.createFromCoord(
      json['X'],
      json['Y'],
      0,
      json['Width'],
      json['Height'],
      0
    );

    this.beginVertices(6);
    this.endVertices();

    this.frameChanged = true;
  }

  /** Met à jour la géométrie et les coordonnées de texture lorsque l'image a changé. */
  update(): void {
    if (!this.texture) {
      return;
    }

    if (this.frameChanged || this.textureChanged) {
      const minX = 0;
      const minY = 0;
      const maxX = this.textureRect[2];
      const maxY = this.textureRect[3];
      const ux = (this.textureRect[0] / this.texture.gpuTexture.width);
      const uy = (this.textureRect[1] / this.texture.gpuTexture.height);
      const vx = (this.textureRect[0] + this.textureRect[2]) / this.texture.gpuTexture.width;
      const vy = (this.textureRect[1] + this.textureRect[3]) / this.texture.gpuTexture.height;
      const fux = this.flip[0] ? 1 - ux : ux;
      const fuy = this.flip[1] ? 1 - uy : uy;
      const fvx = this.flip[0] ? 1 - vx : vx;
      const fvy = this.flip[1] ? 1 - vy : vy;

      this.setVertices([
        minX, maxY, 0, fux, fuy,
        minX, minY, 0, fux, fvy,
        maxX, minY, 0, fvx, fvy,
        maxX, minY, 0, fvx, fvy,
        maxX, maxY, 0, fvx, fuy,
        minX, maxY, 0, fux, fuy
      ]);

      this.frameChanged = false;
    }

    if (this.offsetFactorEnabled) {
      this.offset[0] = this.textureRect[2] * this.offsetFactor[0];
      this.offset[1] = this.textureRect[3] * this.offsetFactor[1];
    }
  }

  /**
   * Obtient le rectangle utilisé dans la texture.
   *
   * @returns Les coordonnées gauche, haut, largeur et hauteur du rectangle.
   */
  getTextureRect(): vec4 {
    return this.textureRect;
  }

  /**
   * Obtient la largeur de la région de texture.
   *
   * @returns La largeur, en pixels.
   */
  getTextureRectWidth(): number {
    return this.textureRect[2];
  }

  /**
   * Obtient la hauteur de la région de texture.
   *
   * @returns La hauteur, en pixels.
   */
  getTextureRectHeight(): number {
    return this.textureRect[3];
  }

  /**
   * Définit la région de la texture affichée par le sprite.
   *
   * @param left - Abscisse du coin supérieur gauche, en pixels.
   * @param top - Ordonnée du coin supérieur gauche, en pixels.
   * @param width - Largeur du rectangle, en pixels.
   * @param height - Hauteur du rectangle, en pixels.
   */
  setTextureRect(left: number, top: number, width: number, height: number): void {
    this.textureRect = [left, top, width, height];
    this.boundingBox = Gfx3BoundingBox.createFromCoord(this.textureRect[0], this.textureRect[1], 0, this.textureRect[2], this.textureRect[3], 0);
    this.frameChanged = true;
  }

  /**
   * Définit la texture et adopte ses dimensions lorsque le rectangle est vide.
   *
   * @param texture - Nouvelle texture du sprite.
   */
  setTexture(texture: Gfx3Texture): void {
    if (this.textureRect[2] == 0 && this.textureRect[3] == 0) {
      this.textureRect[2] = texture.gpuTexture.width;
      this.textureRect[3] = texture.gpuTexture.height;
      this.boundingBox = Gfx3BoundingBox.createFromCoord(this.textureRect[0], this.textureRect[1], 0, this.textureRect[2], this.textureRect[3], 0);
    }

    super.setTexture(texture);
  }

  /**
   * Copie l'état de ce sprite statique dans un autre objet.
   *
   * @param jss - Objet qui reçoit la copie.
   * @param transformMatrix - Transformation supplémentaire appliquée pendant la copie.
   * @returns Le sprite statique cloné.
   */
  clone(jss: Gfx3SpriteJSS = new Gfx3SpriteJSS(), transformMatrix: mat4 = UT.MAT4_IDENTITY()): Gfx3SpriteJSS {
    super.clone(jss, transformMatrix);
    jss.textureRect[0] = this.textureRect[0];
    jss.textureRect[1] = this.textureRect[1];
    jss.textureRect[2] = this.textureRect[2];
    jss.textureRect[3] = this.textureRect[3];
    return jss;
  }
}