import { UT } from '../core/utils';
import { PH } from '../core/physics';
import { Gfx3BoundingCylinder } from './gfx3_bounding_cylinder';

/** Boîte englobante 3D alignée sur les axes, définie par ses sommets minimal et maximal. */
export class Gfx3BoundingBox {
  min: vec3;
  max: vec3;

  /**
   * Crée une boîte englobante à partir de ses bornes.
   *
   * @param min - Sommet minimal de la boîte.
   * @param max - Sommet maximal de la boîte.
   */
  constructor(min: vec3 = [0, 0, 0], max: vec3 = [0, 0, 0]) {
    this.min = min;
    this.max = max;
  }

  /**
   * Crée une boîte à partir de son sommet minimal et de ses dimensions.
   *
   * @param x - Coordonnée X du sommet minimal.
   * @param y - Coordonnée Y du sommet minimal.
   * @param z - Coordonnée Z du sommet minimal.
   * @param w - Largeur sur l'axe X.
   * @param h - Hauteur sur l'axe Y.
   * @param d - Profondeur sur l'axe Z.
   * @returns La nouvelle boîte englobante.
   */
  static createFromCoord(x: number, y: number, z: number, w: number, h: number, d: number): Gfx3BoundingBox {
    const aabb = new Gfx3BoundingBox();
    aabb.min[0] = x;
    aabb.min[1] = y;
    aabb.min[2] = z;
    aabb.max[0] = x + w;
    aabb.max[1] = y + h;
    aabb.max[2] = z + d;
    return aabb;
  }

  /**
   * Crée une boîte à partir de son centre et de ses dimensions.
   *
   * @param x - Coordonnée X du centre.
   * @param y - Coordonnée Y du centre.
   * @param z - Coordonnée Z du centre.
   * @param w - Largeur sur l'axe X.
   * @param h - Hauteur sur l'axe Y.
   * @param d - Profondeur sur l'axe Z.
   * @returns La nouvelle boîte englobante.
   */
  static createFromCenter(x: number, y: number, z: number, w: number, h: number, d: number): Gfx3BoundingBox {
    const box = new Gfx3BoundingBox();
    box.fromCenter(x, y, z, w, h, d);
    return box;
  }

  /**
   * Crée la plus petite boîte contenant une liste de sommets entrelacés.
   *
   * @param vertices - Composantes des sommets.
   * @param vertexStride - Nombre de composantes par sommet ; seules les trois premières sont lues.
   * @returns La boîte englobante calculée.
   */
  static createFromVertices(vertices: Float32Array | Array<number>, vertexStride: number): Gfx3BoundingBox {
    const box = new Gfx3BoundingBox();
    box.fromVertices(vertices, vertexStride);
    return box;
  }

  /**
   * Calcule l'union d'une liste de boîtes.
   *
   * @param aabbs - Boîtes à réunir ; la liste doit contenir au moins un élément.
   * @returns La boîte englobant toutes les boîtes fournies.
   */
  static merge(aabbs: Array<Gfx3BoundingBox>): Gfx3BoundingBox {
    const min: vec3 = [aabbs[0].min[0], aabbs[0].min[1], aabbs[0].min[2]];
    const max: vec3 = [aabbs[0].max[0], aabbs[0].max[1], aabbs[0].max[2]];

    for (const aabb of aabbs) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(aabb.min[i], min[i]);
        max[i] = Math.max(aabb.max[i], max[i]);
      }
    }

    return new Gfx3BoundingBox(min, max);
  }

  /**
   * Redéfinit la boîte à partir de son centre et de ses dimensions.
   *
   * @param x - Coordonnée X du centre.
   * @param y - Coordonnée Y du centre.
   * @param z - Coordonnée Z du centre.
   * @param w - Largeur sur X.
   * @param h - Hauteur sur Y.
   * @param d - Profondeur sur Z.
   */
  fromCenter(x: number, y: number, z: number, w: number, h: number, d: number) {
    this.min[0] = x - (w * 0.5);
    this.min[1] = y - (h * 0.5);
    this.min[2] = z - (d * 0.5);
    this.max[0] = x + (w * 0.5);
    this.max[1] = y + (h * 0.5);
    this.max[2] = z + (d * 0.5);
  }

  /**
   * Recalcule les bornes minimales et maximales depuis des sommets entrelacés.
   *
   * @param vertices - Composantes des sommets.
   * @param vertexStride - Nombre de composantes par sommet ; seules les trois premières sont lues.
   */
  fromVertices(vertices: Float32Array | Array<number>, vertexStride: number): void {
    const min: vec3 = [vertices[0], vertices[1], vertices[2]];
    const max: vec3 = [vertices[0], vertices[1], vertices[2]];

    for (let i = 0; i < vertices.length; i += vertexStride) {
      for (let j = 0; j < 3; j++) {
        const v = vertices[i + j];
        min[j] = Math.min(v, min[j]);
        max[j] = Math.max(v, max[j]);
      }
    }

    this.min = min;
    this.max = max;
  }

  /**
   * Calcule l'union de cette boîte avec une autre sans modifier les deux opérandes.
   *
   * @param aabb - Seconde boîte.
   * @returns Une nouvelle boîte couvrant les deux boîtes.
   */
  merge(aabb: Gfx3BoundingBox): Gfx3BoundingBox {
    const min: vec3 = [this.min[0], this.min[1], this.min[2]];
    const max: vec3 = [this.max[0], this.max[1], this.max[2]];

    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(aabb.min[i], min[i]);
      max[i] = Math.max(aabb.max[i], max[i]);
    }

    return new Gfx3BoundingBox(min, max);
  }

  /** Renvoie le centre géométrique de la boîte. */
  getCenter(): vec3 {
    const x = (this.min[0] + this.max[0]) * 0.5;
    const y = (this.min[1] + this.max[1]) * 0.5;
    const z = (this.min[2] + this.max[2]) * 0.5;
    return [x, y, z];
  }

  /** Renvoie les dimensions de la boîte sur les axes X, Y et Z. */
  getSize(): vec3 {
    const w = this.max[0] - this.min[0];
    const h = this.max[1] - this.min[1];
    const d = this.max[2] - this.min[2];
    return [w, h, d];
  }

  /**
   * Redimensionne la boîte autour de son centre actuel.
   *
   * @param w - Nouvelle largeur.
   * @param h - Nouvelle hauteur.
   * @param d - Nouvelle profondeur.
   */
  setSize(w: number, h: number, d: number) {
    const center = this.getCenter();
    this.min = [center[0] - w * 0.5, center[1] - h * 0.5, center[2] - d * 0.5];
    this.max = [center[0] + w * 0.5, center[1] + h * 0.5, center[2] + d * 0.5];
  }

  /** Renvoie la largeur de la boîte sur l'axe X. */
  getWidth(): number {
    return this.max[0] - this.min[0];
  }

  /**
   * Modifie la largeur tout en conservant le centre.
   *
   * @param w - Nouvelle largeur.
   */
  setWidth(w: number) {
    const center = this.getCenter();
    this.min[0] = center[0] - (w * 0.5);
    this.max[0] = center[0] + (w * 0.5);
  }

  /** Renvoie la hauteur de la boîte sur l'axe Y. */
  getHeight(): number {
    return this.max[1] - this.min[1];
  }

  /**
   * Modifie la hauteur tout en conservant le centre.
   *
   * @param h - Nouvelle hauteur.
   */
  setHeight(h: number) {
    const center = this.getCenter();
    this.min[1] = center[1] - (h * 0.5);
    this.max[1] = center[1] + (h * 0.5);
  }

  /** Renvoie la profondeur de la boîte sur l'axe Z. */
  getDepth(): number {
    return this.max[2] - this.min[2];
  }

  /**
   * Modifie la profondeur tout en conservant le centre.
   *
   * @param d - Nouvelle profondeur.
   */
  setDepth(d: number) {
    const center = this.getCenter();
    this.min[2] = center[2] - (d * 0.5);
    this.max[2] = center[2] + (d * 0.5);
  }

  /** Renvoie la moitié de la diagonale spatiale, utilisée comme rayon circonscrit. */
  getRadius(): number {
    return UT.VEC3_DISTANCE(this.min, this.max) * 0.5;
  }

  /** Renvoie le périmètre de la projection de la boîte dans le plan XZ. */
  getPerimeter(): number {
    const w = this.max[0] - this.min[0];
    const d = this.max[2] - this.min[2];
    return w + w + d + d;
  }

  /** Renvoie le volume de la boîte. */
  getVolume(): number {
    const w = this.max[0] - this.min[0];
    const h = this.max[1] - this.min[1];
    const d = this.max[2] - this.min[2];
    return w * h * d;
  }

  /**
   * Transforme les huit sommets puis calcule leur nouvelle boîte alignée sur les axes.
   *
   * @param matrix - Matrice de transformation.
   * @returns La boîte englobante transformée.
   */
  transform(matrix: mat4): Gfx3BoundingBox {
    const points: Array<[number, number, number]> = [];
    points.push([this.min[0], this.min[1], this.min[2]]);
    points.push([this.max[0], this.min[1], this.min[2]]);
    points.push([this.max[0], this.max[1], this.min[2]]);
    points.push([this.min[0], this.max[1], this.min[2]]);
    points.push([this.min[0], this.max[1], this.max[2]]);
    points.push([this.max[0], this.max[1], this.max[2]]);
    points.push([this.max[0], this.min[1], this.max[2]]);
    points.push([this.min[0], this.min[1], this.max[2]]);

    const transformedPoints = points.map((p) => {
      return UT.MAT4_MULTIPLY_BY_VEC4(matrix, [p[0], p[1], p[2], 1]);
    });

    const min: vec3 = [transformedPoints[0][0], transformedPoints[0][1], transformedPoints[0][2]];
    const max: vec3 = [transformedPoints[0][0], transformedPoints[0][1], transformedPoints[0][2]];

    for (let i = 0; i < transformedPoints.length; i++) {
      for (let j = 0; j < 3; j++) {
        const v = transformedPoints[i][j];
        min[j] = Math.min(v, min[j]);
        max[j] = Math.max(v, max[j]);
      }
    }

    return new Gfx3BoundingBox(min, max);
  }

  /**
   * Applique une échelle autour du centre de la boîte.
   *
   * @param x - Facteur sur X.
   * @param y - Facteur sur Y.
   * @param z - Facteur sur Z.
   */
  scale(x: number = 1, y: number = 1, z: number = 1) {
    const center = this.getCenter();
    const size = this.getSize();
    const halfW = (size[0] * x) * 0.5;
    const halfH = (size[1] * y) * 0.5;
    const halfD = (size[2] * z) * 0.5;

    this.min[0] = center[0] - halfW;
    this.min[1] = center[1] - halfH;
    this.min[2] = center[2] - halfD;

    this.max[0] = center[0] + halfW;
    this.max[1] = center[1] + halfH;
    this.max[2] = center[2] + halfD;
  }

  /**
   * Indique si un point appartient à la boîte.
   *
   * @param x - Coordonnée X du point.
   * @param y - Coordonnée Y du point.
   * @param z - Coordonnée Z du point.
   * @returns `true` si le point se trouve dans la boîte.
   */
  isPointInside(x: number, y: number, z: number): boolean {
    return PH.BOX_POINT_COLLIDE([x, y, z], this.min, this.max);
  }

  /**
   * Teste l'intersection avec une autre boîte alignée sur les axes.
   *
   * @param aabb - Boîte à tester.
   * @returns `true` si les boîtes se chevauchent.
   */
  intersectBoundingBox(aabb: Gfx3BoundingBox): boolean {
    return PH.BOXES_COLLIDE(this.min, this.max, aabb.min, aabb.max);
  }

  /**
   * Teste l'intersection avec un cylindre englobant vertical.
   *
   * @param cylinder - Cylindre à tester.
   * @returns `true` si les volumes se chevauchent.
   */
  intersectBoundingCylinder(cylinder: Gfx3BoundingCylinder): boolean {
    return PH.BOX_CYLINDER_COLLIDE(this.min, this.max, cylinder.getPosition(), cylinder.getRadius(), cylinder.getHeight());
  }

  /** Réinitialise les deux bornes à l'origine. */
  reset(): void {
    this.min = [0, 0, 0];
    this.max = [0, 0, 0];
  }

  /** Renvoie les deux moitiés obtenues en divisant la boîte sur l'axe X. */
  splitVertical(): Array<Gfx3BoundingBox> {
    const size = this.getSize();
    const center = this.getCenter();

    return [
      Gfx3BoundingBox.createFromCoord(this.min[0], this.min[1], this.min[2], size[0] * 0.5, size[1], size[2]),
      Gfx3BoundingBox.createFromCoord(center[0], this.min[1], this.min[2], size[0] * 0.5, size[1], size[2])
    ];
  }

  /** Renvoie les deux moitiés obtenues en divisant la boîte sur l'axe Y. */
  splitHorizontal(): Array<Gfx3BoundingBox> {
    const size = this.getSize();
    const center = this.getCenter();

    return [
      Gfx3BoundingBox.createFromCoord(this.min[0], this.min[1], this.min[2], size[0], size[1] * 0.5, size[2]),
      Gfx3BoundingBox.createFromCoord(this.min[0], center[1], this.min[2], size[0], size[1] * 0.5, size[2])
    ];
  }

  /** Renvoie les deux moitiés obtenues en divisant la boîte sur l'axe Z. */
  splitDepth(): Array<Gfx3BoundingBox> {
    const size = this.getSize();
    const center = this.getCenter();

    return [
      Gfx3BoundingBox.createFromCoord(this.min[0], this.min[1], this.min[2], size[0], size[1], size[2] * 0.5),
      Gfx3BoundingBox.createFromCoord(this.min[0], this.min[1], center[2], size[0], size[1], size[2] * 0.5)
    ];
  }
}