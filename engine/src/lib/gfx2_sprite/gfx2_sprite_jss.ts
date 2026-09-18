import { gfx2Manager } from '../gfx2/gfx2_manager';
import { Poolable } from '../core/object_pool';
import { Gfx2Drawable } from '../gfx2/gfx2_drawable';
import { Gfx2BoundingRect } from '../gfx2/gfx2_bounding_rect';

/**
 * Sprite 2D statique affichant une zone d'une texture, sans animation.
 */
export class Gfx2SpriteJSS extends Gfx2Drawable implements Poolable<Gfx2SpriteJSS> {
  texture: ImageBitmap | HTMLImageElement;
  tintedTexture: ImageBitmap | HTMLImageElement;
  textureRect: vec4;
  blendColor: vec3;
  blendColorMode: GlobalCompositeOperation | '';

  /** Crée un sprite statique vide utilisant la texture par défaut. */
  constructor() {
    super();
    this.texture = gfx2Manager.getDefaultTexture();
    this.tintedTexture = gfx2Manager.getDefaultTexture();
    this.textureRect = [0, 0, 0, 0];
    this.blendColor = [1, 1, 1];
    this.blendColorMode = '';
  }

  /**
   * Charge de manière asynchrone les données du sprite depuis un fichier JSON au format JSS.
   *
   * @param {string} path - Chemin du fichier à charger.
   * @throws Une erreur si le fichier ne contient pas l'identifiant `JSS` attendu.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'JSS') {
      throw new Error('Gfx2SpriteJSS::loadFromFile(): File not valid !');
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

    this.boundingRect = Gfx2BoundingRect.createFromCoord(
      json['X'],
      json['Y'],
      json['Width'],
      json['Height']
    );
  }

  /** Dessine la zone de texture du sprite dans le contexte 2D. */
  onRender(): void {
    const ctx = gfx2Manager.getContext();
    ctx.scale(this.flip[0] ? -1 : 1, this.flip[1] ? -1 : 1);

    if (this.offsetFactorEnabled) {
      this.offset[0] = this.textureRect[2] * this.offsetFactor[0];
      this.offset[1] = this.textureRect[3] * this.offsetFactor[1];
    }

    if (this.blendColorMode == '') {
      ctx.drawImage(
        this.texture,
        this.textureRect[0],
        this.textureRect[1],
        this.textureRect[2],
        this.textureRect[3],
        this.flip[0] ? this.textureRect[2] * -1 : 0,
        this.flip[1] ? this.textureRect[3] * -1 : 0,
        this.textureRect[2],
        this.textureRect[3]
      );
    }
    else {
      ctx.drawImage(
        this.tintedTexture,
        this.textureRect[0],
        this.textureRect[1],
        this.textureRect[2],
        this.textureRect[3],
        this.flip[0] ? this.textureRect[2] * -1 : 0,
        this.flip[1] ? this.textureRect[3] * -1 : 0,
        this.textureRect[2],
        this.textureRect[3]
      );
    }
  }

  /** Renvoie la zone utilisée dans la texture. @returns Les coordonnées gauche, haute, la largeur et la hauteur. */
  getTextureRect(): vec4 {
    return this.textureRect;
  }

  /** Renvoie la largeur de la zone de texture. @returns La largeur en pixels. */
  getTextureRectWidth(): number {
    return this.textureRect[2];
  }

  /** Renvoie la hauteur de la zone de texture. @returns La hauteur en pixels. */
  getTextureRectHeight(): number {
    return this.textureRect[3];
  }

  /**
   * Définit la zone à prélever dans la texture et actualise le rectangle englobant.
   *
   * @param {number} left - Coordonnée horizontale du sommet supérieur gauche.
   * @param {number} top - Coordonnée verticale du sommet supérieur gauche.
   * @param {number} width - Largeur de la zone.
   * @param {number} height - Hauteur de la zone.
   */
  setTextureRect(left: number, top: number, width: number, height: number): void {
    this.textureRect = [left, top, width, height];
    this.boundingRect = Gfx2BoundingRect.createFromCoord(left, top, width, height);
  }

  /**
   * Définit la texture source et initialise ses dimensions si aucune zone n'est encore définie.
   *
   * @param {ImageBitmap | HTMLImageElement} texture - Nouvelle texture source.
   */
  setTexture(texture: ImageBitmap | HTMLImageElement): void {
    if (this.textureRect[2] == 0 && this.textureRect[3] == 0) {
      this.textureRect[2] = texture.width;
      this.textureRect[3] = texture.height;
      this.boundingRect = Gfx2BoundingRect.createFromCoord(this.textureRect[0], this.textureRect[1], this.textureRect[2], this.textureRect[3]);
    }

    this.texture = texture;
  }

  /** Renvoie la texture du sprite. @returns La texture source courante. */
  getTexture(): ImageBitmap | HTMLImageElement {
    return this.texture;
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
   * Copie la configuration du sprite dans une autre instance.
   *
   * @param {Gfx2SpriteJSS} jss - Instance qui reçoit la copie.
   * @returns Le sprite copié.
   */
  clone(jss: Gfx2SpriteJSS = new Gfx2SpriteJSS()): Gfx2SpriteJSS {
    super.clone(jss);
    jss.texture = this.texture;
    jss.tintedTexture = this.tintedTexture;
    jss.textureRect = [this.textureRect[0], this.textureRect[1], this.textureRect[2], this.textureRect[3]];
    jss.blendColor = [this.blendColor[0], this.blendColor[1], this.blendColor[2]];
    jss.blendColorMode = this.blendColorMode;
    return jss;
  }
}