import { gfx3Manager } from '../gfx3/gfx3_manager';
import { gfx3SpriteRenderer } from './gfx3_sprite_renderer';
import { Poolable } from '../core/object_pool';
import { Gfx3StaticGroup } from '../gfx3/gfx3_group';
import { UT } from '../core/utils';
import { Gfx3Drawable } from '../gfx3/gfx3_drawable';
import { Gfx3Texture } from '../gfx3/gfx3_texture';
import { SPRITE_SHADER_VERTEX_ATTR_COUNT } from './gfx3_sprite_shader';

/**
 * Classe de base d'un sprite 3D texturé, orientable ou affiché en billboard.
 */
export class Gfx3Sprite extends Gfx3Drawable implements Poolable<Gfx3Sprite> {
  textureChanged: boolean;
  frameChanged: boolean;
  blendColor: vec4;
  blendColorMode: number;
  offset: vec2;
  offsetFactor: vec2;
  offsetFactorEnabled: boolean;
  flip: [boolean, boolean];
  pixelsPerUnit: number;
  billboardMode: boolean;
  grp1: Gfx3StaticGroup;
  texture: Gfx3Texture;

  /** Initialise un sprite vide avec ses paramètres d'affichage par défaut. */
  constructor() {
    super(SPRITE_SHADER_VERTEX_ATTR_COUNT);
    this.textureChanged = false;
    this.frameChanged = false;
    this.blendColor = [1, 1, 1, 1];
    this.blendColorMode = 1.0;
    this.offset = [0, 0];
    this.offsetFactor = [0, 0];
    this.offsetFactorEnabled = false;
    this.flip = [false, false];
    this.pixelsPerUnit = 100;
    this.billboardMode = false;
    this.grp1 = gfx3Manager.createStaticGroup('SPRITE_PIPELINE', 1);
    this.texture = this.grp1.setTexture(0, 'TEXTURE', gfx3Manager.createTextureFromBitmap());
    this.texture = this.grp1.setSampler(1, 'SAMPLER', this.texture);
    this.grp1.allocate();
  }

  /**
   * Libère le groupe de liaison et les ressources allouées par l'objet.
   *
   * Cette méthode doit être appelée lorsque le sprite n'est plus utilisé.
   */
  delete(): void {
    this.grp1.delete();
    super.delete();
  }

  /** Ajoute ce sprite à la prochaine passe de rendu. */
  draw(): void {
    gfx3SpriteRenderer.drawSprite(this);
  }

  /**
   * Calcule la matrice de transformation en tenant compte de l'échelle en pixels et du point d'origine.
   *
   * @returns La matrice de transformation du sprite.
   */
  getTransformMatrix(): mat4 {
    const matrix = UT.MAT4_IDENTITY();
    UT.MAT4_MULTIPLY(matrix, UT.MAT4_TRANSLATE(this.position[0], this.position[1], this.position[2]), matrix);
    UT.MAT4_MULTIPLY(matrix, UT.MAT4_ROTATE_Y(this.rotation[1]), matrix);
    UT.MAT4_MULTIPLY(matrix, UT.MAT4_ROTATE_X(this.rotation[0]), matrix); // y -> x -> z
    UT.MAT4_MULTIPLY(matrix, UT.MAT4_ROTATE_Z(this.rotation[2]), matrix);
    UT.MAT4_MULTIPLY(matrix, UT.MAT4_SCALE(this.scale[0], this.scale[1], this.scale[2]), matrix);
    UT.MAT4_MULTIPLY(matrix, UT.MAT4_SCALE(1 / this.pixelsPerUnit, 1 / this.pixelsPerUnit, 1 / this.pixelsPerUnit), matrix);
    UT.MAT4_MULTIPLY(matrix, UT.MAT4_TRANSLATE(-this.offset[0], -this.offset[1], 0), matrix);
    return matrix;
  }

  /**
   * Obtient la couleur de mélange.
   *
   * @returns Les composantes RVBA de la couleur de mélange.
   */
  getBlendColor(): vec4 {
    return this.blendColor;
  }

  /**
   * Obtient le mode numérique de mélange de la couleur.
   *
   * @returns `1` pour la multiplication ou `2` pour l'addition.
   */
  getBlendColorMode(): number {
    return this.blendColorMode;
  }

  /**
   * Définit la couleur et l'opération de mélange appliquées à la texture.
   *
   * @param r - Composante rouge.
   * @param g - Composante verte.
   * @param b - Composante bleue.
   * @param a - Composante alpha.
   * @param blendColorMode - Opération d'addition ou de multiplication appliquée à la texture.
   */
  setBlendColor(r: number, g: number, b: number, a: number, blendColorMode: 'add' | 'mul'): void {
    this.blendColor = [r, g, b, a];
    this.blendColorMode = blendColorMode == 'mul' ? 1.0 : 2.0;
  }

  /**
   * Obtient le décalage du point d'origine.
   *
   * @returns Le décalage horizontal et vertical, en pixels.
   */
  getOffset(): vec2 {
    return this.offset;
  }

  /**
   * Obtient le décalage horizontal du point d'origine.
   *
   * @returns Le décalage sur l'axe X, en pixels.
   */
  getOffsetX(): number {
    return this.offset[0];
  }

  /**
   * Obtient le décalage vertical du point d'origine.
   *
   * @returns Le décalage sur l'axe Y, en pixels.
   */
  getOffsetY(): number {
    return this.offset[1];
  }

  /**
   * Définit le décalage absolu du point d'origine et désactive le décalage normalisé.
   *
   * @param offsetX - Décalage horizontal, en pixels.
   * @param offsetY - Décalage vertical, en pixels.
   */
  setOffset(offsetX: number, offsetY: number): void {
    this.offset = [offsetX, offsetY];
    this.offsetFactorEnabled = false;
  }

  /**
   * Définit le décalage du point d'origine relativement aux dimensions de l'image.
   *
   * @param offsetXFactor - Facteur horizontal normalisé.
   * @param offsetYFactor - Facteur vertical normalisé.
   */
  setNormalizedOffset(offsetXFactor: number, offsetYFactor: number) {
    this.offsetFactor[0] = offsetXFactor;
    this.offsetFactor[1] = offsetYFactor;
    this.offsetFactorEnabled = true;
  }

  /**
   * Obtient les états de retournement de l'image.
   *
   * @returns Un tuple contenant les indicateurs de retournement horizontal puis vertical.
   */
  getFlip(): [boolean, boolean] {
    return this.flip;
  }

  /**
   * Active ou désactive le retournement horizontal.
   *
   * @param x - État du retournement horizontal.
   */
  setFlipX(x: boolean): void {
    this.flip[0] = x;
    this.frameChanged = true;
  }

 /**
   * Active ou désactive le retournement vertical.
   *
   * @param y - État du retournement vertical.
   */
  setFlipY(y: boolean): void {
    this.flip[1] = y;
    this.frameChanged = true;
  }

  /**
   * Obtient le nombre de pixels correspondant à une unité du monde.
   *
   * @returns Le facteur de conversion des pixels en unités.
   */
  getPixelsPerUnit(): number {
    return this.pixelsPerUnit;
  }

  /**
   * Définit le nombre de pixels correspondant à une unité du monde.
   *
   * @param pixelsPerUnit - Facteur qui détermine l'échelle d'affichage du sprite.
   */
  setPixelsPerUnit(pixelsPerUnit: number): void {
    this.pixelsPerUnit = pixelsPerUnit;
  }

  /**
   * Indique si le sprite est affiché en billboard.
   *
   * @returns `true` si le sprite fait toujours face à la caméra.
   */
  getBillboardMode(): boolean {
    return this.billboardMode;
  }

  /**
   * Active ou désactive l'orientation automatique vers la caméra.
   *
   * @param billboardMode - `true` pour afficher le sprite en billboard indépendamment de son orientation.
   */
  setBillboardMode(billboardMode: boolean): void {
    this.billboardMode = billboardMode;
  }

  /**
   * Définit la texture du sprite.
   *
   * @param texture - Nouvelle texture du sprite.
   */
  setTexture(texture: Gfx3Texture): void {
    this.texture = texture;
    this.textureChanged = true;
  }

  /**
   * Obtient la texture du sprite.
   *
   * @returns La texture courante.
   */
  getTexture(): Gfx3Texture {
    return this.texture;
  }

  /**
   * Obtient le groupe de liaison 1 et actualise sa texture si nécessaire.
   *
   * @returns Le groupe de liaison contenant la texture et son échantillonneur.
   */
  getGroup01(): Gfx3StaticGroup {
    if (this.textureChanged) {
      this.grp1.setTexture(0, 'TEXTURE', this.texture);
      this.grp1.allocate();
      this.textureChanged = false;
    }

    return this.grp1;
  }

  /**
   * Copie l'état de ce sprite dans un autre objet.
   *
   * @param sprite - Objet qui reçoit la copie.
   * @param transformMatrix - Transformation supplémentaire appliquée pendant la copie.
   * @returns Le sprite cloné.
   */
  clone(sprite: Gfx3Sprite = new Gfx3Sprite(), transformMatrix: mat4 = UT.MAT4_IDENTITY()): Gfx3Sprite {
    super.clone(sprite, transformMatrix);
    sprite.textureChanged = true;
    sprite.frameChanged = true;
    sprite.blendColor = [this.blendColor[0], this.blendColor[1], this.blendColor[2], this.blendColor[3]];
    sprite.blendColorMode = this.blendColorMode;
    sprite.offset = [this.offset[0], this.offset[1]];
    sprite.offsetFactor = [this.offsetFactor[0], this.offsetFactor[1]];
    sprite.offsetFactorEnabled = this.offsetFactorEnabled;
    sprite.flip = [this.flip[0], this.flip[1]];
    sprite.pixelsPerUnit = this.pixelsPerUnit;
    sprite.billboardMode = this.billboardMode;
    sprite.texture = this.texture;
    return sprite;
  }
}