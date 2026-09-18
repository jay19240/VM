import { eventManager } from '../core/event_manager';
import { FormatJAS, fromAseprite, fromEzSpriteSheet } from '../core/format_jas';
import { UT } from '../core/utils';
import { Poolable } from '../core/object_pool';
import { Gfx3BoundingBox } from '../gfx3/gfx3_bounding_box';
import { Gfx3Sprite } from './gfx3_sprite';
import { Gfx3BoundingCylinder } from '../gfx3/gfx3_bounding_cylinder';

/** Rectangle d'une image d'animation dans la feuille de sprites. */
export interface Gfx3JASFrame {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Décrit une animation, ses images et ses volumes englobants. */
export interface Gfx3JASAnimation {
  name: string;
  frames: Array<Gfx3JASFrame>;
  frameDuration: number;
  boundingBoxes: Array<Gfx3BoundingBox>;
  boundingCylinders: Array<Gfx3BoundingCylinder>;
};

/**
 * Représente un sprite 3D animé à partir d'une feuille de sprites.
 * Émet l'événement `E_FINISHED` lorsque la dernière image est atteinte.
 */
export class Gfx3SpriteJAS extends Gfx3Sprite implements Poolable<Gfx3SpriteJAS> {
  animations: Array<Gfx3JASAnimation>;
  currentAnimation: Gfx3JASAnimation | null;
  currentAnimationFrameIndex: number;
  looped: boolean;
  frameProgress: number;
  finished: boolean;
  boundingShapesDynamicMode: boolean;

  /** Initialise un sprite animé sans animation chargée. */
  constructor() {
    super();
    this.animations = [];
    this.currentAnimation = null;
    this.currentAnimationFrameIndex = 0;
    this.looped = false;
    this.frameProgress = 0;
    this.finished = false;
    this.boundingShapesDynamicMode = false;
  }

  /**
   * Charge les animations depuis un fichier JSON JAS.
   *
   * @param path - Chemin du fichier JAS.
   * @returns Une promesse résolue une fois les animations chargées.
   * @throws Si les données chargées ne possèdent pas l'identifiant JAS attendu.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();
    this.loadFromData(json);
  }

  /**
   * Charge et convertit les animations depuis un fichier Aseprite.
   *
   * @param path - Chemin du fichier Aseprite.
   * @returns Une promesse résolue une fois les animations chargées.
   * @throws Si les données converties ne possèdent pas l'identifiant JAS attendu.
   */
  async loadFromAsepriteFile(path: string): Promise<void> {
    const data = await fromAseprite(path);
    this.loadFromData(data);
  }

  /**
   * Charge et convertit les animations depuis un fichier EZ Sprite Sheet.
   *
   * @param path - Chemin du fichier JSON EZ Sprite Sheet.
   * @returns Une promesse résolue une fois les animations chargées.
   * @throws Si les données converties ne possèdent pas l'identifiant JAS attendu.
   */
  async loadFromEzSpriteSheet(path: string): Promise<void> {
    const data = await fromEzSpriteSheet(path);
    this.loadFromData(data);
  }

  /**
   * Initialise le sprite à partir de données au format JAS.
   *
   * @param data - Données JAS décrivant les images et les animations.
   * @throws Si les données ne possèdent pas l'identifiant JAS attendu.
   */
  loadFromData(data: FormatJAS): void {
    if (!data.hasOwnProperty('Ident') || data['Ident'] != 'JAS') {
      throw new Error('Gfx3SpriteJAS::loadFromData(): Data not valid !');
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
      const animation: Gfx3JASAnimation = {
        name: obj['Name'],
        frames: [],
        frameDuration: Number(obj['FrameDuration']),
        boundingBoxes: [],
        boundingCylinders: []
      };

      for (const frame of obj['Frames']) {
        animation.frames.push({
          x: frame['X'],
          y: frame['Y'],
          width: frame['Width'],
          height: frame['Height']
        });

        const bb = Gfx3BoundingBox.createFromCoord(frame['X'], frame['Y'], 0, frame['Width'], frame['Height'], 0);
        animation.boundingBoxes.push(bb);
        animation.boundingCylinders.push(Gfx3BoundingCylinder.createFromBoundingBox(bb));
      }

      this.animations.push(animation);
    }

    this.beginVertices(6);
    this.endVertices();

    this.currentAnimation = null;
    this.currentAnimationFrameIndex = 0;
    this.frameProgress = 0;
    this.finished = false;
    this.frameChanged = false;
  }

  /**
   * Met à jour l'image courante, la géométrie et les volumes englobants dynamiques.
   *
   * @param ts - Pas de temps écoulé, en millisecondes.
   */
  update(ts: number): void {
    if (!this.currentAnimation || !this.texture || this.finished) {
      return;
    }

    const currentFrame = this.currentAnimation.frames[this.currentAnimationFrameIndex];

    if (this.frameChanged || this.textureChanged) {
      const minX = 0;
      const minY = 0;
      const maxX = currentFrame.width;
      const maxY = currentFrame.height;
      const ux = (currentFrame.x / this.texture.gpuTexture.width);
      const uy = (currentFrame.y / this.texture.gpuTexture.height);
      const vx = (currentFrame.x + currentFrame.width) / this.texture.gpuTexture.width;
      const vy = (currentFrame.y + currentFrame.height) / this.texture.gpuTexture.height;
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
      this.offset[0] = currentFrame.width * this.offsetFactor[0];
      this.offset[1] = currentFrame.height * this.offsetFactor[1];
    }

    if (this.frameProgress >= this.currentAnimation.frameDuration) {
      if (this.currentAnimationFrameIndex == this.currentAnimation.frames.length - 1) {
        eventManager.emit(this, 'E_FINISHED');
        this.currentAnimationFrameIndex = this.looped ? 0 : this.currentAnimation.frames.length - 1;
        this.frameProgress = 0;
        this.finished = this.looped ? false : true;
        this.frameChanged = true;
      }
      else {
        this.currentAnimationFrameIndex = this.currentAnimationFrameIndex + 1;
        this.frameProgress = 0;
        this.frameChanged = true;
      }

      if (this.boundingShapesDynamicMode) {
        this.boundingBox = this.currentAnimation.boundingBoxes[this.currentAnimationFrameIndex];
        this.boundingCylinder = this.currentAnimation.boundingCylinders[this.currentAnimationFrameIndex];
      }
    }
    else {
      this.frameProgress += ts;
    }
  }

  /**
   * Lance une animation depuis sa première image.
   *
   * @param animationName - Nom de l'animation à lire.
   * @param looped - `true` pour reprendre l'animation après sa dernière image.
   * @param preventSameAnimation - `true` pour ne pas redémarrer l'animation déjà en cours.
   * @throws Si aucune animation ne porte le nom demandé.
   */
  play(animationName: string, looped: boolean = false, preventSameAnimation: boolean = false): void {
    if (preventSameAnimation && this.currentAnimation && animationName == this.currentAnimation.name) {
      return;
    }

    const animation = this.animations.find(animation => animation.name == animationName);
    if (!animation) {
      throw new Error('Gfx3SpriteJAS::play: animation not found.');
    }

    this.currentAnimation = animation;
    this.currentAnimationFrameIndex = 0;
    this.looped = looped;
    this.frameProgress = 0;
    this.finished = false;
    this.frameChanged = true;
  }

  /**
   * Obtient les descripteurs d'animation.
   *
   * @returns La liste des animations disponibles.
   */
  getAnimations(): Array<Gfx3JASAnimation> {
    return this.animations;
  }

  /**
   * Remplace les descripteurs d'animation et réinitialise l'animation courante.
   *
   * @param animations - Nouvelles animations disponibles.
   */
  setAnimations(animations: Array<Gfx3JASAnimation>): void {
    this.animations = animations;
    this.currentAnimation = null;
  }

  /**
   * Obtient l'animation en cours.
   *
   * @returns L'animation courante, ou `null` si aucune animation n'est lancée.
   */
  getCurrentAnimation(): Gfx3JASAnimation | null {
    return this.currentAnimation;
  }

  /**
   * Obtient l'indice de l'image courante.
   *
   * @returns L'indice dans la séquence de l'animation courante.
   */
  getCurrentAnimationFrameIndex(): number {
    return this.currentAnimationFrameIndex;
  }

  /**
   * Active l'ajustement en temps réel des volumes englobants à l'image courante.
   *
   * @param dynamicMode - `true` pour employer les volumes de l'image d'animation courante.
   */
  setBoundingShapesDynamicMode(dynamicMode: boolean) {
    if (dynamicMode == false) {
      this.boundingBox = this.animations[0].boundingBoxes[0];
      this.boundingCylinder = this.animations[0].boundingCylinders[0];
    }

    this.boundingShapesDynamicMode = dynamicMode;
  }

  /**
   * Indique si l'animation non bouclée est terminée.
   *
   * @returns `true` lorsque la dernière image a été atteinte.
   */
  isFinished(): boolean {
    return this.finished;
  }

  /**
   * Copie l'état de ce sprite animé dans un autre objet.
   *
   * @param jas - Objet qui reçoit la copie.
   * @param transformMatrix - Transformation supplémentaire appliquée pendant la copie.
   * @returns Le sprite animé cloné.
   */
  clone(jas: Gfx3SpriteJAS = new Gfx3SpriteJAS(), transformMatrix: mat4 = UT.MAT4_IDENTITY()): Gfx3SpriteJAS {
    super.clone(jas, transformMatrix);
    jas.animations = this.animations;
    jas.currentAnimation = null;
    jas.currentAnimationFrameIndex = 0;
    jas.looped = false;
    jas.frameProgress = 0;
    jas.finished = this.finished;
    return jas;
  }
}