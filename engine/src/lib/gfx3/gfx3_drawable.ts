import { gfx3Manager, Gfx3VertexSubBuffer } from './gfx3_manager';
import { UT } from '../core/utils';
import { Poolable } from '../core/object_pool';
import { Gfx3Transformable } from './gfx3_transformable';
import { Gfx3BoundingBox } from './gfx3_bounding_box';
import { Gfx3BoundingCylinder } from './gfx3_bounding_cylinder';

/** Masques binaires des effets de post-traitement applicables à un objet rendu. */
export enum Gfx3DrawableEffect {
  NONE = 0,
  PIXELATION = 2,
  COLOR_LIMITATION = 4,
  DITHER = 8,
  OUTLINE = 16,
  SHADOW_VOLUME = 32,
  CHANNEL1 = 64,
  BRIGHTNESS = 128
};

/** Objet 3D transformable qui possède une géométrie, un tag de rendu et des volumes englobants. */
export class Gfx3Drawable extends Gfx3Transformable implements Poolable<Gfx3Drawable> {
  tag: vec4;
  vertexSubBuffer: Gfx3VertexSubBuffer;
  vertices: Array<number>;
  vertexCount: number;
  vertexStride: number;
  boundingBox: Gfx3BoundingBox;
  boundingCylinder: Gfx3BoundingCylinder;

  /**
   * Crée un objet dessinable et réserve un sous-tampon de sommets vide.
   *
   * @param vertexStride - Nombre de composantes scalaires par sommet.
   */
  constructor(vertexStride: number) {
    super();
    this.tag = [0, 0, 0, 1];
    this.vertexSubBuffer = gfx3Manager.createVertexBuffer(0);
    this.vertices = [];
    this.vertexCount = 0;
    this.vertexStride = vertexStride;
    this.boundingBox = new Gfx3BoundingBox();
    this.boundingCylinder = new Gfx3BoundingCylinder();
  }

  /**
   * Libère le sous-tampon de sommets associé à l'objet.
   * Attention : cette méthode doit être appelée explicitement pour libérer la ressource.
   */
  delete(): void {
    gfx3Manager.destroyVertexBuffer(this.vertexSubBuffer);
  }

  /**
   * Point d'extension de mise à jour destiné aux classes dérivées.
   *
   * @param ts - Durée écoulée depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number): void {}

  /** Point d'extension qui permet aux classes dérivées de soumettre l'objet au rendu. */
  draw(): void {}

  /**
   * Réalloue le sous-tampon et ouvre la définition d'une nouvelle géométrie.
   * Cette méthode doit précéder les appels à `defineVertex`.
   *
   * @param vertexCount - Nombre de sommets à réserver.
   */
  beginVertices(vertexCount: number): void {
    gfx3Manager.destroyVertexBuffer(this.vertexSubBuffer);
    this.vertexSubBuffer = gfx3Manager.createVertexBuffer(vertexCount * this.vertexStride);
    this.vertices = [];
    this.vertexCount = vertexCount;
  }

  /** Efface la copie CPU des sommets tout en conservant l'allocation GPU. */
  flushVertices(): void {
    this.vertices = [];
  }

  /**
   * Ajoute les composantes d'un sommet à la géométrie en cours de définition.
   *
   * @param v - Composantes du sommet dans l'ordre attendu par la pipeline.
   */
  defineVertex(...v: Array<number>) {
    this.vertices.push(...v);
  }

  /** Transfère les sommets au GPU et recalcule les volumes englobants. */
  endVertices(): void {
    gfx3Manager.writeVertexBuffer(this.vertexSubBuffer, this.vertices);
    this.boundingBox = Gfx3BoundingBox.createFromVertices(this.vertices, this.vertexStride);
    this.boundingCylinder = Gfx3BoundingCylinder.createFromBoundingBox(this.boundingBox);
  }

  /**
   * Remplace les composantes des sommets et programme leur transfert vers le GPU.
   *
   * @param vertices - Nouvelles composantes de sommets.
   */
  setVertices(vertices: Array<number>) {
    this.vertices = vertices;
    gfx3Manager.writeVertexBuffer(this.vertexSubBuffer, this.vertices);
  }

  /**
   * Renvoie le décalage du sous-tampon dans le tampon global géré par `Gfx3Manager`.
   *
   * @returns Le décalage en octets dans le tampon de sommets global.
   */
  getVertexSubBufferOffset(): number {
    return this.vertexSubBuffer.offset;
  }

  /** Renvoie la taille du sous-tampon de sommets en octets. */
  getVertexSubBufferSize(): number {
    return this.vertexSubBuffer.vertices.byteLength;
  }

  /** Renvoie la copie CPU des composantes de sommets. */
  getVertices(): Array<number> {
    return this.vertices;
  }

  /** Renvoie le nombre de sommets de la géométrie. */
  getVertexCount(): number {
    return this.vertexCount;
  }

  /**
   * Définit le tag écrit dans l'attachement de rendu dédié.
   * Ce tag permet d'identifier, de filtrer et de regrouper l'objet, ainsi que d'activer plusieurs effets par masque binaire.
   *
   * @param groupId - Identifiant du groupe ou de la catégorie.
   * @param meshId - Identifiant de l'objet au sein du groupe.
   * @param effects - Combinaison d'effets de post-traitement.
   */
  setTag(groupId: number, meshId: number = 0, effects: Gfx3DrawableEffect = 0): void {
    this.tag = [groupId, meshId, effects, 1.0];
  }

  /** Renvoie le tag de rendu sous forme `[groupe, objet, effets, activation]`. */
  getTag(): vec4 {
    return this.tag;
  }

  /**
   * Définit l'identifiant de groupe du tag.
   *
   * @param groupId - Nouvel identifiant de groupe.
   */
  setGroupId(groupId: number): void {
    this.tag[0] = groupId;
  }

  /**
   * Définit l'identifiant d'objet du tag.
   *
   * @param meshId - Nouvel identifiant d'objet.
   */
  setMeshId(meshId: number): void {
    this.tag[1] = meshId;
  }

  /**
   * Définit le masque des effets de post-traitement.
   *
   * @param effects - Combinaison de masques `Gfx3DrawableEffect`.
   */
  setEffects(effects: number): void {
    this.tag[2] = effects;
  }

  /** Désactive l'écriture fonctionnelle du tag pour cet objet. */
  disableTag(): void {
    this.tag[3] = 0.0;
  }

  /** Renvoie l'identifiant de groupe du tag. */
  getGroupId(): number {
    return this.tag[0];
  }

  /** Renvoie l'identifiant d'objet du tag. */
  getMeshId(): number {
    return this.tag[1];
  }

  /** Renvoie le masque numérique des effets activés. */
  getEffects(): number {
    return this.tag[2];
  }

  /** Indique si le tag est activé. */
  isTagEnabled(): boolean {
    return !!this.tag[3];
  }

  /** Renvoie les quatre composantes du tag concaténées sous forme de chaîne. */
  getTagAsString(): string {
    return '' + this.tag[0] + '' + this.tag[1] + '' + this.tag[2] + '' + this.tag[3] + '';
  }

  /**
   * Remplace la boîte englobante locale.
   *
   * @param boundingBox - Nouvelle boîte englobante.
   */
  setBoundingBox(boundingBox: Gfx3BoundingBox): void {
    this.boundingBox = boundingBox;
  }

  /** Renvoie la boîte englobante dans l'espace local. */
  getBoundingBox(): Gfx3BoundingBox {
    return this.boundingBox;
  }

  /** Renvoie la boîte englobante alignée sur les axes dans l'espace monde. */
  getWorldBoundingBox(): Gfx3BoundingBox {
    return this.boundingBox.transform(this.getTransformMatrix());
  }

  /** Renvoie le cylindre englobant dans l'espace local. */
  getBoundingCylinder(): Gfx3BoundingCylinder {
    return this.boundingCylinder;
  }

  /** Renvoie le cylindre englobant vertical dans l'espace monde. */
  getWorldBoundingCylinder(): Gfx3BoundingCylinder {
    return this.boundingCylinder.transform(this.getTransformMatrix());
  }

  /**
   * Teste la collision entre les cylindres englobants mondiaux de deux objets.
   *
   * @param drawable - Objet à tester.
   * @param slideVelocity - Vecteur de sortie recevant la réponse de collision dans le plan XZ.
   * @returns `true` si les cylindres se chevauchent.
   */
  isCollideAsCylinder(drawable: Gfx3Drawable, slideVelocity: vec2 = [0, 0]): boolean {
    return this.getWorldBoundingCylinder().intersectBoundingCylinder(drawable.getWorldBoundingCylinder(), slideVelocity);
  }

  /**
   * Teste la collision entre les boîtes englobantes mondiales de deux objets.
   *
   * @param drawable - Objet à tester.
   * @returns `true` si les boîtes se chevauchent.
   */
  isCollideAsBox(drawable: Gfx3Drawable): boolean {
    return this.getWorldBoundingBox().intersectBoundingBox(drawable.getWorldBoundingBox());
  }

  /**
   * Clone la transformation, le tag, les volumes et la géométrie dans un autre objet.
   *
   * @param drawable - Objet de destination, ou nouvelle instance par défaut.
   * @param transformMatrix - Matrice appliquée aux positions des sommets copiés.
   * @returns L'objet de destination renseigné.
   */
  clone(drawable: Gfx3Drawable = new Gfx3Drawable(this.vertexStride), transformMatrix: mat4 = UT.MAT4_IDENTITY()): Gfx3Drawable {
    super.clone(drawable);
    drawable.tag = this.tag;
    drawable.boundingBox = new Gfx3BoundingBox(this.boundingBox.min, this.boundingBox.max);
    drawable.boundingCylinder = new Gfx3BoundingCylinder(this.boundingCylinder.position, this.boundingCylinder.height, this.boundingCylinder.radius);

    drawable.beginVertices(this.vertexCount);

    for (let i = 0; i < this.vertices.length; i += this.vertexStride) {
      const v = UT.MAT4_MULTIPLY_BY_VEC4(transformMatrix, [this.vertices[i + 0], this.vertices[i + 1], this.vertices[i + 2], 1.0]);
      drawable.defineVertex(v[0], v[1], v[2], ...this.vertices.slice(3, this.vertexStride));
    }

    drawable.endVertices();
    return drawable;
  }
}