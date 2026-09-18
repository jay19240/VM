import { eventManager } from '../core/event_manager';
import { gfx2Manager } from '../gfx2/gfx2_manager';
import { FormatJAS, fromAseprite, fromEzSpriteSheet } from '../core/format_jas';
import { Poolable } from '../core/object_pool';
import { Gfx2Drawable } from '../gfx2/gfx2_drawable';
import { Gfx2BoundingRect } from '../gfx2/gfx2_bounding_rect';

/** Décrit la zone d'une image d'animation dans la texture source. */
export interface Gfx2JASFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Décrit une animation, ses images, sa cadence et ses rectangles englobants. */
export interface Gfx2JASAnimation {
  name: string;
  frames: Array<Gfx2JASFrame>;
  frameDuration: number;
  boundingRects: Array<Gfx2BoundingRect>;
}

/**
 * Sprite 2D animé à partir d'une succession de zones de texture.
 *
 * Émet l'événement `E_FINISHED` lorsque l'animation atteint sa dernière image.
 */
export class Gfx2SpriteJAS extends Gfx2Drawable implements Poolable<Gfx2SpriteJAS> {
  animations: Array<Gfx2JASAnimation>;
  texture: ImageBitmap | HTMLImageElement;
  tintedTexture: ImageBitmap | HTMLImageElement;
  blendColor: vec3;
  blendColorMode: GlobalCompositeOperation | '';
  currentAnimation: Gfx2JASAnimation | null;
  currentAnimationFrameIndex: number;
  looped: boolean;
  frameProgress: number;
  finished: boolean;
  boundingRectDynamicMode: boolean;

  /** Crée un sprite animé vide utilisant la texture par défaut. */
  constructor() {
    super();
    this.animations = [];
    this.texture = gfx2Manager.getDefaultTexture();
    this.tintedTexture = gfx2Manager.getDefaultTexture();
    this.blendColor = [1, 1, 1];
    this.blendColorMode = '';
    this.currentAnimation = null;
    this.currentAnimationFrameIndex = 0;
    this.looped = false;
    this.frameProgress = 0;
    this.finished = false;
    this.boundingRectDynamicMode = false;
  }

  /**
   * Charge de manière asynchrone les données d'un sprite depuis un fichier JSON au format JAS.
   *
   * @param {string} path - Chemin du fichier à charger.
   * @throws Une erreur si les données chargées ne sont pas au format JAS.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();
    this.loadFromData(json);
  }

  /**
   * Charge de manière asynchrone les données d'un sprite depuis un fichier Aseprite.
   *
   * @param {string} path - Chemin du fichier à charger.
   * @throws Une erreur si la conversion échoue ou si les données obtenues ne sont pas au format JAS.
   */
  async loadFromAsepriteFile(path: string): Promise<void> {
    const data = await fromAseprite(path);
    this.loadFromData(data);
  }

  /**
   * Charge de manière asynchrone les données d'un sprite depuis un fichier ez-sprite-sheet.
   *
   * @param {string} path - Chemin du fichier JSON à charger.
   * @throws Une erreur si la conversion échoue ou si les données obtenues ne sont pas au format JAS.
   */
  async loadFromEzSpriteSheet(path: string): Promise<void> {
    const data = await fromEzSpriteSheet(path);
    this.loadFromData(data);
  }

  /**
   * Initialise le sprite à partir de données au format JAS.
   *
   * @param {FormatJAS} data - Données JAS à appliquer.
   * @throws Une erreur si les données ne contiennent pas l'identifiant `JAS` attendu.
   */
  loadFromData(data: FormatJAS): void {
    if (!data.hasOwnProperty('Ident') || data['Ident'] != 'JAS') {
      throw new Error('Gfx2SpriteJAS::loadFromData(): Data not valid !');
    }

    this.offset[0] = data['OffsetX'] ?? 0;
    this.offset[1] = data['OffsetY'] ?? 0;

    this.flip[0] = data['FlipX'] ?? false;
    this.flip[1] = data['FlipY'] ?? false;

    this.offsetFactor[0] = data['OffsetFactorX'] ?? 0;
    this.offsetFactor[1] = data['OffsetFactorY'] ?? 0;
    this.offsetFactorEnabled = data['OffsetFactorEnabled'] ? true : false;

    this.animations = [];
    for (const obj of data['Animations']) {
      const animation: Gfx2JASAnimation = {
        name: obj['Name'],
        frames: [],
        frameDuration: Number(obj['FrameDuration']),
        boundingRects: []
      };

      for (const frame of obj['Frames']) {
        animation.frames.push({
          x: frame['X'],
          y: frame['Y'],
          width: frame['Width'],
          height: frame['Height']
        });

        animation.boundingRects.push(Gfx2BoundingRect.createFromCoord(
          frame['X'],
          frame['Y'],
          frame['Width'],
          frame['Height']
        ));
      }

      this.animations.push(animation);
    }

    this.boundingRect = this.animations[0].boundingRects[0];
    this.currentAnimation = null;
    this.currentAnimationFrameIndex = 0;
    this.frameProgress = 0;
    this.finished = false;
  }

  /**
   * Fait progresser l'animation courante et actualise éventuellement le rectangle englobant.
   *
   * @param {number} ts - Temps écoulé depuis la dernière mise à jour, en millisecondes.
   */
  update(ts: number): void {
    if (!this.currentAnimation || this.finished) {
      return;
    }

    if (this.frameProgress >= this.currentAnimation.frameDuration) {
      if (this.currentAnimationFrameIndex == this.currentAnimation.frames.length - 1) {
        eventManager.emit(this, 'E_FINISHED');
        this.currentAnimationFrameIndex = this.looped ? 0 : this.currentAnimation.frames.length - 1;
        this.frameProgress = 0;
        this.finished = this.looped ? false : true;
      }
      else {
        this.currentAnimationFrameIndex = this.currentAnimationFrameIndex + 1;
        this.frameProgress = 0;
      }

      if (this.boundingRectDynamicMode) {
        this.boundingRect = this.currentAnimation.boundingRects[this.currentAnimationFrameIndex];
      }
    }
    else {
      this.frameProgress += ts;
    }
  }

  /** Dessine l'image courante de l'animation dans le contexte 2D. */
  onRender(): void {
    if (!this.currentAnimation) {
      return;
    }

    const ctx = gfx2Manager.getContext();
    const currentFrame = this.currentAnimation.frames[this.currentAnimationFrameIndex];
    const destX = this.flip[0] ? currentFrame.width * -1 : 0;
    const destY = this.flip[1] ? currentFrame.height * -1 : 0;

    ctx.scale(this.flip[0] ? -1 : 1, this.flip[1] ? -1 : 1);

    if (this.offsetFactorEnabled) {
      this.offset[0] = currentFrame.width * this.offsetFactor[0];
      this.offset[1] = currentFrame.height * this.offsetFactor[1];
    }

    if (this.blendColorMode == '') {
      ctx.drawImage(
        this.texture,
        currentFrame.x,
        currentFrame.y,
        currentFrame.width,
        currentFrame.height,
        destX,
        destY,
        currentFrame.width,
        currentFrame.height
      );
    }
    else {
      ctx.drawImage(
        this.tintedTexture,
        currentFrame.x,
        currentFrame.y,
        currentFrame.width,
        currentFrame.height,
        destX,
        destY,
        currentFrame.width,
        currentFrame.height
      );
    }
  }

  /**
   * Lance une animation depuis sa première image.
   *
   * @param {string} animationName - Nom de l'animation à lancer.
   * @param {boolean} [looped=false] - Indique si l'animation doit recommencer en boucle.
   * @param {boolean} [preventSameAnimation=false] - Empêche de relancer l'animation si elle est déjà active.
   * @throws Une erreur si aucune animation ne porte le nom indiqué.
   */
  play(animationName: string, looped: boolean = false, preventSameAnimation: boolean = false): void {
    if (preventSameAnimation && this.currentAnimation && animationName == this.currentAnimation.name) {
      return;
    }

    const animation = this.animations.find(animation => animation.name == animationName);
    if (!animation) {
      throw new Error('Gfx2SpriteJAS::play: animation not found.');
    }

    this.currentAnimation = animation;
    this.currentAnimationFrameIndex = 0;
    this.looped = looped;
    this.frameProgress = 0;
    this.finished = false;
  }

  /** Renvoie les descripteurs d'animation. @returns La liste des animations disponibles. */
  getAnimations(): Array<Gfx2JASAnimation> {
    return this.animations;
  }

  /** Définit les descripteurs d'animation. @param animations - Nouvelles données d'animation. */
  setAnimations(animations: Array<Gfx2JASAnimation>): void {
    this.animations = animations;
  }

  /** Renvoie l'animation courante. @returns L'animation active, ou `null` si aucune n'est lancée. */
  getCurrentAnimation(): Gfx2JASAnimation | null {
    return this.currentAnimation;
  }

  /** Renvoie l'indice de l'image courante. @returns L'indice dans l'animation active. */
  getCurrentAnimationFrameIndex(): number {
    return this.currentAnimationFrameIndex;
  }

  /** Renvoie la texture du sprite. @returns La texture source courante. */
  getTexture(): ImageBitmap | HTMLImageElement {
    return this.texture;
  }

  /** Définit la texture du sprite. @param {ImageBitmap} texture - Nouvelle texture source. */
  setTexture(texture: ImageBitmap): void {
    this.texture = texture;
  }

  /** Renvoie la couleur de mélange. @returns Les multiplicateurs rouge, vert et bleu. */
  getBlendColor(): vec3 {
    return this.blendColor;
  }

  /** Renvoie le mode de composition de la teinte. @returns Le mode de composition courant. */
  getBlendColorMode(): GlobalCompositeOperation | '' {
    return this.blendColorMode;
  }

  /**
   * Applique une teinte multiplicative à la texture.
   *
   * @param {number} r - Multiplicateur du canal rouge.
   * @param {number} g - Multiplicateur du canal vert.
   * @param {number} b - Multiplicateur du canal bleu.
   */
  setBlendColor(r: number, g: number, b: number): void {
    this.blendColor = [r, g, b];
    this.blendColorMode = 'multiply';
    this.tintedTexture = gfx2Manager.getTintedTexture(this.texture, r, g, b);
  }

  /**
   * Active ou désactive l'ajustement du rectangle englobant à l'image d'animation courante.
   *
   * @param {boolean} dynamicMode - `true` pour suivre chaque image, `false` pour reprendre le premier rectangle.
   */
  setBoundingRectDynamicMode(dynamicMode: boolean) {
    if (dynamicMode == false) {
      this.boundingRect = this.animations[0].boundingRects[0];
    }

    this.boundingRectDynamicMode = dynamicMode;
  }

  /** Indique si l'animation courante est terminée. @returns `true` lorsqu'elle est terminée, sinon `false`. */
  isFinished(): boolean {
    return this.finished;
  }

  /**
   * Copie la configuration du sprite dans une autre instance et réinitialise son animation.
   *
   * @param {Gfx2SpriteJAS} jas - Instance qui reçoit la copie.
   * @returns Le sprite copié.
   */
  clone(jas: Gfx2SpriteJAS = new Gfx2SpriteJAS()): Gfx2SpriteJAS {
    super.clone(jas);
    jas.animations = this.animations;
    jas.texture = this.texture;
    jas.tintedTexture = this.tintedTexture;
    jas.blendColor = [this.blendColor[0], this.blendColor[1], this.blendColor[2]];
    jas.blendColorMode = this.blendColorMode;
    jas.currentAnimation = null;
    jas.currentAnimationFrameIndex = 0;
    jas.looped = false;
    jas.frameProgress = 0;
    jas.finished = false;
    return jas;
  }
}