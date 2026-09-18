import { eventManager } from '../core/event_manager';
import { FormatJAS, fromAseprite, fromEzSpriteSheet } from '../core/format_jas';
import { UIWidget } from '../ui/ui_widget';

/** Décrit le rectangle d'une image dans une feuille de sprites. */
export interface UIJASFrame {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Décrit une animation d'interface composée d'images JAS. */
export interface UIJASAnimation {
  name: string;
  frames: Array<UIJASFrame>;
  frameDuration: number;
};

/**
 * Composant affichant un sprite animé.
 * Émet `E_FINISHED` chaque fois que l'animation atteint sa dernière image.
 */
export class UISprite extends UIWidget {
  animations: Array<UIJASAnimation>;
  currentAnimation: UIJASAnimation | null;
  currentAnimationFrameIndex: number;
  looped: boolean;
  timeElapsed: number;
  finished: boolean;
  frameChanged: boolean;

  /**
   * Crée un sprite sans animation chargée.
   *
   * @param options - Option définissant la classe CSS du composant.
   */
  constructor(options: { className?: string } = {}) {
    super({
      className: options.className ?? 'UISprite'
    });

    this.animations = [];
    this.currentAnimation = null;
    this.currentAnimationFrameIndex = 0;
    this.looped = false;
    this.timeElapsed = 0;
    this.finished = false;
    this.frameChanged = false;
  }

  /**
   * Charge une image de façon asynchrone et l'utilise comme arrière-plan.
   *
   * @param {string} imageFile - Chemin du fichier image.
   * @returns Une promesse résolue lorsque l'image est chargée.
   */
  async loadTexture(imageFile: string): Promise<void> {
    return new Promise(resolve => {
      const img = new Image();
      img.src = imageFile;
      img.onload = () => {
        this.node.style.backgroundImage = 'url("' + img.src + '")';
        resolve();
      };
    });
  }

  /**
   * Charge de façon asynchrone des données de sprite depuis un fichier JSON au format JAS.
   *
   * @param {string} path - Chemin du fichier JAS.
   * @returns Une promesse résolue après le chargement et l'initialisation des données.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();
    this.loadFromData(json);
  }

  /**
   * Charge de façon asynchrone des données de sprite depuis un fichier Aseprite.
   *
   * @param {string} path - Chemin du fichier Aseprite.
   * @returns Une promesse résolue après la conversion et l'initialisation des données.
   */
  async loadFromAsepriteFile(path: string): Promise<void> {
    const data = await fromAseprite(path);
    this.loadFromData(data);
  }

  /**
   * Charge de façon asynchrone des données depuis un fichier JSON ez-sprite-sheet.
   *
   * @param {string} path - Chemin du fichier ez-sprite-sheet.
   * @returns Une promesse résolue après la conversion et l'initialisation des données.
   */
  async loadFromEzSpriteSheet(path: string): Promise<void> {
    const data = await fromEzSpriteSheet(path);
    this.loadFromData(data);
  }

  /**
   * Initialise les animations à partir de données au format JAS.
   *
   * @param {FormatJAS} data - Données de sprite au format JAS.
   */
  loadFromData(data: FormatJAS): void {
    this.animations = [];
    for (const obj of data['Animations']) {
      const animation: UIJASAnimation = { name: obj['Name'], frames: [], frameDuration: Number(obj['FrameDuration']) };
      for (const objFrame of obj['Frames']) {
        animation.frames.push({
          x: objFrame['X'],
          y: objFrame['Y'],
          width: objFrame['Width'],
          height: objFrame['Height']
        });
      }

      this.animations.push(animation);
    }

    this.currentAnimation = null;
    this.currentAnimationFrameIndex = 0;
    this.timeElapsed = 0;
    this.finished = false;
    this.frameChanged = false;
  }

  /**
   * Met à jour l'image courante de l'animation et émet `E_FINISHED` en fin de cycle.
   *
   * @param {number} ts - Pas de temps écoulé.
   */
  update(ts: number): void {
    if (!this.currentAnimation || this.finished) {
      return;
    }

    if (this.frameChanged) {
      const currentFrame = this.currentAnimation.frames[this.currentAnimationFrameIndex];
      this.node.style.backgroundPositionX = -currentFrame.x + 'px';
      this.node.style.backgroundPositionY = -currentFrame.y + 'px';
      this.node.style.width = currentFrame.width + 'px';
      this.node.style.height = currentFrame.height + 'px';
      this.frameChanged = false;
    }

    if (this.timeElapsed >= this.currentAnimation.frameDuration) {
      if (this.currentAnimationFrameIndex == this.currentAnimation.frames.length - 1) {
        eventManager.emit(this, 'E_FINISHED');
        this.currentAnimationFrameIndex = this.looped ? 0 : this.currentAnimation.frames.length - 1;
        this.timeElapsed = 0;
        this.finished = this.looped ? false : true;
        this.frameChanged = true;
      }
      else {
        this.currentAnimationFrameIndex = this.currentAnimationFrameIndex + 1;
        this.timeElapsed = 0;
        this.frameChanged = true;
      }
    }
    else {
      this.timeElapsed += ts;
    }
  }

  /**
   * Lance une animation donnée depuis sa première image.
   *
   * @param {string} animationName - Nom de l'animation à lire.
   * @param {boolean} [looped=false] - `true` pour répéter l'animation en boucle.
   * @param {boolean} [preventSameAnimation=false] - `true` pour ne pas relancer l'animation déjà active.
   * @throws {Error} Si aucune animation ne porte ce nom.
   */
  play(animationName: string, looped: boolean = false, preventSameAnimation: boolean = false): void {
    if (preventSameAnimation && this.currentAnimation && animationName == this.currentAnimation.name) {
      return;
    }

    const animation = this.animations.find(animation => animation.name == animationName);
    if (!animation) {
      throw new Error('UISprite::play: animation not found.');
    }

    this.currentAnimation = animation;
    this.currentAnimationFrameIndex = 0;
    this.looped = looped;
    this.timeElapsed = 0;
    this.finished = false;
    this.frameChanged = true;
  }

  /**
   * Renvoie les descripteurs d'animation.
   *
   * @returns La liste des animations disponibles.
   */
  getAnimations(): Array<UIJASAnimation> {
    return this.animations;
  }

  /**
   * Remplace les descripteurs d'animation.
   *
   * @param animations - Nouvelles données d'animation.
   */
  setAnimations(animations: Array<UIJASAnimation>): void {
    this.animations = animations;
  }

  /**
   * Renvoie l'animation courante.
   *
   * @returns L'animation courante, ou `null` si aucune animation n'est active.
   */
  getCurrentAnimation(): UIJASAnimation | null {
    return this.currentAnimation;
  }

  /**
   * Renvoie l'indice de l'image courante.
   *
   * @returns L'indice de l'image courante dans l'animation.
   */
  getCurrentAnimationFrameIndex(): number {
    return this.currentAnimationFrameIndex;
  }

  /**
   * Indique si la lecture de l'animation est terminée.
   *
   * @returns `true` si l'animation est terminée, sinon `false`.
   */
  isFinished(): boolean {
    return this.finished;
  }
}