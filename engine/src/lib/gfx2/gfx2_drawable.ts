import { gfx2Manager } from './gfx2_manager';
import { Poolable } from '../core/object_pool';
import { UT } from '../core/utils';
import { Gfx2BoundingRect } from '../gfx2/gfx2_bounding_rect';

/**
 * Objet 2D positionnable et restituable sur le canevas.
 */
export class Gfx2Drawable implements Poolable<Gfx2Drawable> {
  tag: number;
  position: vec2;
  rotation: number;
  scale: vec2;
  flip: [boolean, boolean];
  offset: vec2;
  offsetFactor: vec2;
  offsetFactorEnabled: boolean;
  visible: boolean;
  opacity: number;
  z: number;
  elevation: number;
  boundingRect: Gfx2BoundingRect;

  /** Initialise un objet visible avec des transformations neutres et un rectangle englobant vide. */
  constructor() {
    this.tag = 0;
    this.position = [0, 0];
    this.rotation = 0;
    this.scale = [1, 1];
    this.flip = [false, false];
    this.offset = [0, 0];
    this.offsetFactor = [0, 0];
    this.offsetFactorEnabled = false;
    this.visible = true;
    this.opacity = 1;
    this.z = 0;
    this.elevation = 0;
    this.boundingRect = new Gfx2BoundingRect();
  }

  /**
   * Met à jour l'objet ; les sous-classes peuvent redéfinir cette méthode.
   *
   * @param {number} ts - Temps écoulé depuis la dernière mise à jour, en millisecondes.
   */
  update(ts: number): void {}

  /**
   * Restitue le contenu propre à l'objet après application des transformations.
   *
   * Les sous-classes peuvent redéfinir cette méthode.
   */
  onRender(): void {}

  /**
   * Applique l'opacité et les transformations de l'objet, puis appelle {@link onRender} s'il est visible.
   */
  render(): void {
    if (!this.isVisible()) {
      return;
    }

    if (this.offsetFactorEnabled) {
      this.offset[0] = this.boundingRect.getWidth() * this.offsetFactor[0];
      this.offset[1] = this.boundingRect.getHeight() * this.offsetFactor[1];
    }

    const ctx = gfx2Manager.getContext();
    ctx.save();
    ctx.globalAlpha = this.opacity;

    ctx.translate(this.position[0], this.position[1]);
    ctx.rotate(this.rotation);
    ctx.scale(this.scale[0], this.scale[1]);
    ctx.translate(-this.offset[0], -this.offset[1]);
    this.onRender();
    ctx.globalAlpha = 1.0;
    ctx.restore();
  }

  /**
   * Ajoute l'objet à la file de rendu 2D.
   */
  draw(): void {
    gfx2Manager.draw(this);
  }

  /** Renvoie l'étiquette numérique de l'objet. @returns L'étiquette courante. */
  getTag(): number {
    return this.tag;
  }

  /**
   * Définit l'étiquette numérique, généralement utilisée pour le classement.
   *
   * @param {number} tag - Nouvelle étiquette.
   */
  setTag(tag: number): void {
    this.tag = tag;
  }

  /** Renvoie la position de l'objet. @returns Les coordonnées courantes. */
  getPosition(): vec2 {
    return this.position;
  }

  /** Renvoie la coordonnée horizontale. @returns La coordonnée horizontale courante. */
  getPositionX(): number {
    return this.position[0];
  }

  /** Renvoie la coordonnée verticale. @returns La coordonnée verticale courante. */
  getPositionY(): number {
    return this.position[1];
  }

  /**
   * Définit la position de l'objet.
   *
   * @param {number} x - Coordonnée horizontale.
   * @param {number} y - Coordonnée verticale.
   */
  setPosition(x: number, y: number): void {
    this.position[0] = x;
    this.position[1] = y;
  }

  /** Définit la coordonnée horizontale. @param {number} x - Nouvelle coordonnée horizontale. */
  setPositionX(x: number) {
    this.position[0] = x;
  }

  /** Définit la coordonnée verticale. @param {number} y - Nouvelle coordonnée verticale. */
  setPositionY(y: number) {
    this.position[1] = y;
  }

  /**
   * Déplace l'objet relativement à sa position actuelle.
   *
   * @param {number} x - Translation horizontale.
   * @param {number} y - Translation verticale.
   */
  translate(x: number, y: number): void {
    this.position[0] += x;
    this.position[1] += y;
  }

  /** Renvoie la rotation de l'objet. @returns L'angle en radians. */
  getRotation(): number {
    return this.rotation;
  }

  /** Définit la rotation de l'objet. @param {number} rotation - Angle en radians. */
  setRotation(rotation: number): void {
    this.rotation = rotation;
  }

  /** Ajoute un angle à la rotation actuelle. @param {number} a - Angle à ajouter, en radians. */
  rotate(a: number): void {
    this.rotation += a;
  }

  /** Renvoie l'échelle de l'objet. @returns Les facteurs horizontal et vertical. */
  getScale(): vec2 {
    return this.scale;
  }

  /** Renvoie le facteur d'échelle horizontal. @returns Le facteur horizontal. */
  getScaleX(): number {
    return this.scale[0];
  }

  /** Renvoie le facteur d'échelle vertical. @returns Le facteur vertical. */
  getScaleY(): number {
    return this.scale[1];
  }

  /**
   * Définit l'échelle de l'objet.
   *
   * @param {number} x - Facteur d'échelle horizontal.
   * @param {number} y - Facteur d'échelle vertical.
   */
  setScale(x: number, y: number): void {
    this.scale[0] = x;
    this.scale[1] = y;
  }

  /** Définit l'échelle horizontale. @param {number} x - Nouveau facteur horizontal. */
  setScaleX(x: number) {
    this.scale[0] = x;
  }

  /** Définit l'échelle verticale. @param {number} y - Nouveau facteur vertical. */
  setScaleY(y: number) {
    this.scale[1] = y;
  }

  /**
   * Ajoute des valeurs aux facteurs d'échelle actuels.
   *
   * @param {number} x - Valeur ajoutée au facteur horizontal.
   * @param {number} y - Valeur ajoutée au facteur vertical.
   */
  zoom(x: number, y: number): void {
    this.scale[0] += x;
    this.scale[1] += y;
  }

  /** Indique si l'objet est retourné horizontalement. @returns L'état du retournement horizontal. */
  getFlipX(): boolean {
    return this.flip[0];
  }

  /** Indique si l'objet est retourné verticalement. @returns L'état du retournement vertical. */
  getFlipY(): boolean {
    return this.flip[1];
  }

  /** Renvoie les états de retournement. @returns Les indicateurs horizontal puis vertical. */
  getFlip(): [boolean, boolean] {
    return this.flip;
  }

  /** Définit le retournement horizontal. @param {boolean} x - Nouvel état. */
  setFlipX(x: boolean): void {
    this.flip[0] = x;
  }

  /** Définit le retournement vertical. @param {boolean} y - Nouvel état. */
  setFlipY(y: boolean): void {
    this.flip[1] = y;
  }

  /** Renvoie le décalage de l'origine. @returns Le décalage en pixels. */
  getOffset(): vec2 {
    return this.offset;
  }

  /** Renvoie le décalage horizontal de l'origine. @returns Le décalage horizontal. */
  getOffsetX(): number {
    return this.offset[0];
  }

  /** Renvoie le décalage vertical de l'origine. @returns Le décalage vertical. */
  getOffsetY(): number {
    return this.offset[1];
  }

  /**
   * Définit le décalage absolu de l'origine et désactive le décalage normalisé.
   *
   * @param {number} x - Décalage horizontal.
   * @param {number} y - Décalage vertical.
   */
  setOffset(x: number, y: number): void {
    this.offset[0] = x;
    this.offset[1] = y;
    this.offsetFactorEnabled = false;
  }

  /** Définit le décalage horizontal absolu de l'origine. @param {number} x - Décalage horizontal. */
  setOffsetX(x: number): void {
    this.offset[0] = x;
    this.offsetFactorEnabled = false;
  }

  /** Définit le décalage vertical absolu de l'origine. @param {number} y - Décalage vertical. */
  setOffsetY(y: number): void {
    this.offset[1] = y;
    this.offsetFactorEnabled = false;
  }

  /** Renvoie le décalage horizontal normalisé. @returns Le facteur horizontal. */
  getNormalizedOffsetX(): number {
    return this.offsetFactor[0]
  }

  /** Renvoie le décalage vertical normalisé. @returns Le facteur vertical. */
  getNormalizedOffsetY(): number {
    return this.offsetFactor[1];
  }

  /**
   * Définit le décalage normalisé de l'origine.
   *
   * @param {number} offsetXFactor - Facteur horizontal relatif à la largeur.
   * @param {number} offsetYFactor - Facteur vertical relatif à la hauteur.
   */
  setNormalizedOffset(offsetXFactor: number, offsetYFactor: number) {
    this.offsetFactor[0] = offsetXFactor;
    this.offsetFactor[1] = offsetYFactor;
    this.offsetFactorEnabled = true;
  }

  /** Définit le décalage horizontal normalisé de l'origine. @param {number} x - Facteur horizontal. */
  setNormalizedOffsetX(x: number): void {
    this.offsetFactor[0] = x;
    this.offsetFactorEnabled = true;
  }

  /** Définit le décalage vertical normalisé de l'origine. @param {number} y - Facteur vertical. */
  setNormalizedOffsetY(y: number): void {
    this.offsetFactor[1] = y;
    this.offsetFactorEnabled = true;
  }

  /** Indique si l'objet est visible. @returns L'état de visibilité. */
  isVisible(): boolean {
    return this.visible;
  }

  /** Définit la visibilité de l'objet. @param {boolean} visible - Nouvel état de visibilité. */
  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  /** Renvoie l'opacité de l'objet. @returns L'opacité courante. */
  getOpacity(): number {
    return this.opacity;
  }

  /** Définit l'opacité de l'objet. @param {number} opacity - Nouvelle opacité. */
  setOpacity(opacity: number): void {
    this.opacity = opacity;
  }

  /** Définit la profondeur utilisée pour le tri orthographique. @param {number} z - Nouvelle profondeur. */
  setPositionZ(z: number): void {
    this.z = z;
  }

  /** Renvoie la profondeur utilisée pour le tri orthographique. @returns La profondeur courante. */
  getPositionZ(): number {
    return this.z;
  }

  /**
   * Définit l'élévation utilisée pour le rendu isométrique 2D.
   *
   * @param {number} elevation - Nouvelle élévation.
   */
  setElevation(elevation: number): void {
    this.elevation = elevation;
  }

  /**
   * Renvoie l'élévation utilisée pour le rendu isométrique 2D.
   *
   * @returns L'élévation courante.
   */
  getElevation(): number {
    return this.elevation;
  }

  /** Définit le rectangle englobant local. @param {Gfx2BoundingRect} boundingRect - Nouveau rectangle. */
  setBoundingRect(boundingRect: Gfx2BoundingRect): void {
    this.boundingRect = boundingRect;
  }

  /** Renvoie le rectangle englobant local. @returns Le rectangle local. */
  getBoundingRect(): Gfx2BoundingRect {
    return this.boundingRect;
  }

  /** Renvoie le rectangle englobant dans le repère du monde. @returns Le rectangle local transformé. */
  getWorldBoundingRect(): Gfx2BoundingRect {
    return this.boundingRect.transform(UT.MAT3_TRANSFORM(this.position, this.offset, this.rotation, this.scale));
  }

  /**
   * Indique si le rectangle englobant de cet objet intersecte celui d'un autre objet.
   *
   * @param drawable - Objet avec lequel tester la collision.
   * @returns `true` si les rectangles s'intersectent, sinon `false`.
   */
  isCollideAsRect(drawable: Gfx2Drawable): boolean {
    return this.getWorldBoundingRect().intersectBoundingRect(drawable.getWorldBoundingRect());
  }

  /**
   * Copie l'état de cet objet dans une autre instance.
   *
   * @param {Gfx2Drawable} drawable - Instance qui reçoit la copie.
   * @returns L'instance copiée.
   */
  clone(drawable: Gfx2Drawable = new Gfx2Drawable()): Gfx2Drawable {
    drawable.position = [this.position[0], this.position[1]];
    drawable.rotation = this.rotation;
    drawable.flip = [this.flip[0], this.flip[1]];
    drawable.scale = [this.scale[0], this.scale[1]];
    drawable.offset = [this.offset[0], this.offset[1]];
    drawable.offsetFactor = [this.offsetFactor[0], this.offsetFactor[1]];
    drawable.offsetFactorEnabled = this.offsetFactorEnabled;
    drawable.visible = this.visible;
    drawable.opacity = this.opacity;
    drawable.z = this.z;
    drawable.elevation = this.elevation;
    drawable.boundingRect = new Gfx2BoundingRect(this.boundingRect.min, this.boundingRect.max);
    return drawable;
  }
}