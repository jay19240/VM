import { gfx3Manager } from '../gfx3/gfx3_manager';
import { gfx3FlareRenderer } from './gfx3_flare_renderer';
import { Gfx3StaticGroup } from '../gfx3/gfx3_group';
import { Gfx3Drawable } from '../gfx3/gfx3_drawable';
import { Gfx3Texture } from '../gfx3/gfx3_texture';
import { FLARE_SHADER_VERTEX_ATTR_COUNT } from './gfx3_flare_shader';

/** Élément texturé 2D rendu dans le plan de l'écran pour produire un halo ou un effet de superposition. */
export class Gfx3Flare extends Gfx3Drawable {
  textureChanged: boolean;
  size2D: vec2;
  position2D: vec2;
  scale2D: vec2;
  rotation2D: number;
  offset2D: vec2;
  color: vec4;
  grp2: Gfx3StaticGroup;
  texture: Gfx3Texture;

  /** Crée un halo unitaire blanc doté d'une texture par défaut et de ses ressources GPU. */
  constructor() {
    super(FLARE_SHADER_VERTEX_ATTR_COUNT);
    this.textureChanged = false;
    this.size2D = [0, 0];
    this.position2D = [0.0, 0.0];
    this.scale2D = [1.0, 1.0];
    this.rotation2D = 0;
    this.offset2D = [0.0, 0.0];
    this.color = [1.0, 1.0, 1.0, 1.0];
    this.grp2 = gfx3Manager.createStaticGroup('FLARE_PIPELINE', 2);
    this.texture = this.grp2.setTexture(0, 'TEXTURE', gfx3Manager.createTextureFromBitmap());
    this.texture = this.grp2.setSampler(1, 'SAMPLER', this.texture);

    this.beginVertices(6);
    this.defineVertex(0.0, 0.0, 0.0, 0.0);
    this.defineVertex(1.0, 0.0, 1.0, 0.0);
    this.defineVertex(0.0, 1.0, 0.0, 1.0);
    this.defineVertex(0.0, 1.0, 0.0, 1.0);
    this.defineVertex(1.0, 0.0, 1.0, 0.0);
    this.defineVertex(1.0, 1.0, 1.0, 1.0);
    this.endVertices();

    this.grp2.allocate();
  }

  /**
   * Libère les groupes de liaison et le sous-tampon de sommets.
   * Attention : cette méthode doit être appelée explicitement pour libérer les ressources GPU.
   */
  delete(): void {
    this.grp2.delete();
    super.delete();
  }

  /** Ajoute ce halo à la file du moteur de rendu des halos. */
  draw(): void {
    gfx3FlareRenderer.drawFlare(this);
  }

  /**
   * Définit la position en coordonnées écran, dont l'origine se trouve dans le coin supérieur gauche.
   *
   * @param x - Coordonnée horizontale en pixels.
   * @param y - Coordonnée verticale en pixels.
   */
  setPosition2D(x: number, y: number): void {
    this.position2D[0] = x;
    this.position2D[1] = y;
  }

  /**
   * Renvoie la position en coordonnées écran, relative au coin supérieur gauche.
   *
   * @returns La position en pixels.
   */
  getPosition2D(): vec2 {
    return this.position2D;
  }

  /**
   * Définit les facteurs d'échelle horizontale et verticale.
   *
   * @param x - Facteur d'échelle sur l'axe X.
   * @param y - Facteur d'échelle sur l'axe Y.
   */
  setScale2D(x: number, y: number): void {
    this.scale2D[0] = x;
    this.scale2D[1] = y;
  }

  /** Renvoie les facteurs d'échelle 2D. */
  getScale2D(): vec2 {
    return this.scale2D;
  }

  /**
   * Définit l'angle de rotation dans le plan de l'écran.
   *
   * @param angle - Angle de rotation en radians.
   */
  setRotation2D(angle: number): void {
    this.rotation2D = angle;
  }

  /** Renvoie l'angle de rotation en radians. */
  getRotation2D(): number {
    return this.rotation2D;
  }

  /**
   * Déplace l'origine du halo, située par défaut dans son coin supérieur gauche.
   *
   * @param x - Décalage horizontal en pixels.
   * @param y - Décalage vertical en pixels.
   */
  setOffset2D(x: number, y: number): void {
    this.offset2D[0] = -x;
    this.offset2D[1] = -y;
  }

  /**
   * Déplace l'origine selon des proportions normalisées de la taille du halo.
   *
   * @param x - Décalage horizontal normalisé.
   * @param y - Décalage vertical normalisé.
   */
  setOffset2DNormalized(x: number, y: number): void {
    this.offset2D[0] = -x * this.size2D[0];
    this.offset2D[1] = -y * this.size2D[1];
  }

  /** Renvoie le décalage de l'origine en pixels, avec le signe appliqué au rendu. */
  getOffset2D(): vec2 {
    return this.offset2D;
  }

  /**
   * Définit la teinte multiplicative du halo avec des composantes normalisées.
   *
   * @param r - Composante rouge entre 0 et 1.
   * @param g - Composante verte entre 0 et 1.
   * @param b - Composante bleue entre 0 et 1.
   * @param a - Composante alpha entre 0 et 1.
   */
  setColor(r: number, g: number, b: number, a: number): void {
    this.color[0] = r;
    this.color[1] = g;
    this.color[2] = b;
    this.color[3] = a;
  }

  /** Renvoie la teinte multiplicative RGBA du halo. */
  getColor(): vec4 {
    return this.color;
  }

  /**
   * Affecte une texture au halo et adopte ses dimensions en pixels.
   *
   * @param texture - Nouvelle texture du halo.
   */
  setTexture(texture: Gfx3Texture): void {
    this.texture = texture;
    this.size2D[0] = texture.gpuTexture.width;
    this.size2D[1] = texture.gpuTexture.height;
    this.textureChanged = true;
  }

  /** Renvoie la texture actuellement affectée au halo. */
  getTexture(): Gfx3Texture {
    return this.texture;
  }

  /** Renvoie la taille du halo en pixels. */
  getSize2D(): vec2 {
    return this.size2D;
  }

  /**
   * Définit la taille logique du halo en pixels.
   *
   * @param w - Largeur du halo.
   * @param h - Hauteur du halo.
   */
  setSize2D(w: number, h: number): void {
    this.size2D[0] = w;
    this.size2D[1] = h;
  }

  /**
   * Met à jour si nécessaire les liaisons de texture, puis renvoie le groupe de liaison 2.
   *
   * @returns Le groupe de liaison contenant la texture et son échantillonneur.
   */
  getGroup02(): Gfx3StaticGroup {
    if (this.textureChanged) {
      this.grp2.setTexture(0, 'TEXTURE', this.texture);
      this.grp2.allocate();
      this.textureChanged = false;
    }

    return this.grp2;
  }
}