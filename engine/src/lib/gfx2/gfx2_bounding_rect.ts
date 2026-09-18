import { UT } from '../core/utils';
import { PH } from '../core/physics';

/**
 * Rectangle englobant aligné sur les axes en deux dimensions.
 */
export class Gfx2BoundingRect {
  min: vec2;
  max: vec2;

  /**
   * Crée un rectangle englobant à partir de ses deux sommets extrêmes.
   *
   * @param {vec2} min - Sommet aux coordonnées minimales.
   * @param {vec2} max - Sommet aux coordonnées maximales.
   */
  constructor(min: vec2 = [0, 0], max: vec2 = [0, 0]) {
    this.min = min;
    this.max = max;
  }

  /**
   * Crée un rectangle à partir de ses coordonnées minimales et maximales.
   *
   * @param {number} minx - Coordonnée horizontale minimale.
   * @param {number} miny - Coordonnée verticale minimale.
   * @param {number} maxx - Coordonnée horizontale maximale.
   * @param {number} maxy - Coordonnée verticale maximale.
   * @returns Le nouveau rectangle englobant.
   */
  static createFrom(minx: number, miny: number, maxx: number, maxy: number): Gfx2BoundingRect {
    const rect = new Gfx2BoundingRect();
    rect.min[0] = minx;
    rect.min[1] = miny;
    rect.max[0] = maxx;
    rect.max[1] = maxy;
    return rect;
  }

  /**
   * Crée un rectangle à partir de son sommet supérieur gauche et de ses dimensions.
   *
   * @param {number} x - Coordonnée horizontale du sommet supérieur gauche.
   * @param {number} y - Coordonnée verticale du sommet supérieur gauche.
   * @param {number} w - Largeur du rectangle.
   * @param {number} h - Hauteur du rectangle.
   * @returns Le nouveau rectangle englobant.
   */
  static createFromCoord(x: number, y: number, w: number, h: number): Gfx2BoundingRect {
    const rect = new Gfx2BoundingRect();
    rect.min[0] = x;
    rect.min[1] = y;
    rect.max[0] = x + w;
    rect.max[1] = y + h;
    return rect;
  }

  /**
   * Crée un rectangle à partir de son centre et de ses dimensions.
   *
   * @param {number} x - Coordonnée horizontale du centre.
   * @param {number} y - Coordonnée verticale du centre.
   * @param {number} w - Largeur du rectangle.
   * @param {number} h - Hauteur du rectangle.
   * @returns Le nouveau rectangle englobant.
   */
  static createFromCenter(x: number, y: number, w: number, h: number): Gfx2BoundingRect {
    const rect = new Gfx2BoundingRect();
    rect.min[0] = x - (w * 0.5);
    rect.min[1] = y - (h * 0.5);
    rect.max[0] = x + (w * 0.5);
    rect.max[1] = y + (h * 0.5);
    return rect;
  }

  /**
   * Crée le plus petit rectangle contenant une liste de sommets.
   *
   * @param vertices - Coordonnées des sommets, chaque paire de nombres représentant un point `(x, y)`.
   * @returns Le nouveau rectangle englobant.
   */
  static createFromVertices(vertices: Array<number>): Gfx2BoundingRect {
    const rect = new Gfx2BoundingRect();
    rect.fromVertices(vertices);
    return rect;
  }

  /**
   * Redéfinit les bornes pour englober une liste de sommets.
   *
   * @param vertices - Coordonnées des sommets, chaque paire de nombres représentant un point `(x, y)`.
   */
  fromVertices(vertices: Array<number>): void {
    const min: vec2 = [vertices[0], vertices[1]];
    const max: vec2 = [vertices[0], vertices[1]];

    for (let i = 0; i < vertices.length; i += 2) {
      for (let j = 0; j < 2; j++) {
        const v = vertices[i + j];
        min[j] = Math.min(v, min[j]);
        max[j] = Math.max(v, max[j]);
      }
    }

    this.min = min;
    this.max = max;
  }

  /**
   * Calcule l'union de ce rectangle et d'un autre.
   *
   * @param {Gfx2BoundingRect} rect - Rectangle à réunir avec celui-ci.
   * @returns Un nouveau rectangle englobant les deux rectangles.
   */
  merge(rect: Gfx2BoundingRect): Gfx2BoundingRect {
    const min: vec2 = [this.min[0], this.min[1]];
    const max: vec2 = [this.max[0], this.max[2]];

    for (let i = 0; i < 2; i++) {
      min[i] = Math.min(rect.min[i], min[i]);
      max[i] = Math.max(rect.max[i], max[i]);
    }

    return new Gfx2BoundingRect(min, max);
  }

  /**
   * Renvoie le centre du rectangle.
   *
   * @returns Les coordonnées du centre.
   */
  getCenter(): vec2 {
    const w = this.max[0] - this.min[0];
    const h = this.max[1] - this.min[1];
    const x = this.min[0] + (w * 0.5);
    const y = this.min[1] + (h * 0.5);
    return [x, y];
  }

  /**
   * Renvoie les dimensions du rectangle.
   *
   * @returns Un vecteur contenant la largeur et la hauteur.
   */
  getSize(): vec2 {
    const w = this.max[0] - this.min[0];
    const h = this.max[1] - this.min[1];
    return [w, h];
  }

  /**
   * Renvoie la largeur du rectangle.
   *
   * @returns La largeur.
   */
  getWidth(): number {
    return this.max[0] - this.min[0];
  }

  /**
   * Renvoie la hauteur du rectangle.
   *
   * @returns La hauteur.
   */
  getHeight(): number {
    return this.max[1] - this.min[1];
  }

  /**
   * Renvoie le rayon du cercle circonscrit au rectangle.
   *
   * @returns La moitié de la longueur de la diagonale.
   */
  getRadius(): number {
    return UT.VEC2_DISTANCE(this.min, this.max) * 0.5;
  }

  /**
   * Renvoie le périmètre du rectangle.
   *
   * @returns Le périmètre.
   */
  getPerimeter(): number {
    const w = this.max[0] - this.min[0];
    const h = this.max[1] - this.min[1];
    return w + w + h + h;
  }

  /**
   * Renvoie l'aire du rectangle.
   *
   * @returns Le produit de la largeur par la hauteur.
   */
  getVolume(): number {
    return (this.max[0] - this.min[0]) * (this.max[1] - this.min[1]);
  }

  /**
   * Calcule le rectangle aligné sur les axes qui englobe ce rectangle après transformation.
   *
   * @param {mat3} matrix - Matrice appliquée aux sommets du rectangle.
   * @returns Le rectangle englobant transformé.
   */
  transform(matrix: mat3): Gfx2BoundingRect {
    const points: Array<[number, number]> = [];
    points.push([this.min[0], this.min[1]]);
    points.push([this.max[0], this.min[1]]);
    points.push([this.max[0], this.max[1]]);
    points.push([this.min[0], this.max[1]]);

    const transformedPoints = points.map((p) => {
      return UT.MAT3_MULTIPLY_BY_VEC3(matrix, [p[0], p[1], 1]);
    });

    const min: vec2 = [transformedPoints[0][0], transformedPoints[0][1]];
    const max: vec2 = [transformedPoints[0][0], transformedPoints[0][1]];

    for (let i = 0; i < transformedPoints.length; i++) {
      for (let j = 0; j < 2; j++) {
        const v = transformedPoints[i][j];
        min[j] = Math.min(v, min[j]);
        max[j] = Math.max(v, max[j]);
      }
    }

    return new Gfx2BoundingRect(min, max);
  }

  /**
   * Divise le rectangle en deux moitiés le long de l'axe horizontal.
   *
   * @returns Les rectangles gauche et droit.
   */
  splitVertical(): Array<Gfx2BoundingRect> {
    const size = this.getSize();
    const center = this.getCenter();

    return [
      Gfx2BoundingRect.createFromCoord(this.min[0], this.min[1], size[0] * 0.5, size[1]),
      Gfx2BoundingRect.createFromCoord(center[0], this.min[1], size[0] * 0.5, size[1])
    ];
  }

  /**
   * Divise le rectangle en deux moitiés le long de l'axe vertical.
   *
   * @returns Les rectangles supérieur et inférieur.
   */
  splitHorizontal(): Array <Gfx2BoundingRect> {
    const size = this.getSize();
    const center = this.getCenter();

    return [
      Gfx2BoundingRect.createFromCoord(this.min[0], this.min[1], size[0], size[1] * 0.5),
      Gfx2BoundingRect.createFromCoord(this.min[0], center[1], size[0], size[1] * 0.5)
    ];
  }

  /**
   * Indique si un point appartient au rectangle.
   *
   * @param {number} x - Coordonnée horizontale du point.
   * @param {number} y - Coordonnée verticale du point.
   * @returns `true` si le point se trouve dans le rectangle, sinon `false`.
   */
  isPointInside(x: number, y: number): boolean {
    return PH.RECT_POINT_COLLIDE([x, y], this.min, this.max);
  }

  /**
   * Indique si ce rectangle en intersecte un autre.
   *
   * @param {Gfx2BoundingRect} aabr - Autre rectangle à tester.
   * @returns `true` si les rectangles s'intersectent, sinon `false`.
   */
  intersectBoundingRect(aabr: Gfx2BoundingRect): boolean {
    return PH.RECTS_COLLIDE(this.min, this.max, aabr.min, aabr.max);
  }

  /**
   * Indique si ce rectangle intersecte un cercle.
   *
   * @param {vec2} center - Centre du cercle.
   * @param {number} radius - Rayon du cercle.
   * @returns `true` si le rectangle et le cercle s'intersectent, sinon `false`.
   */
  intersectCircle(center: vec2, radius: number): boolean {
    return PH.RECT_CIRCLE_COLLIDE(this.min, this.max, center, radius);
  }

  /**
   * Renvoie les quatre côtés du rectangle sous forme de segments.
   *
   * @returns Les segments gauche, supérieur, droit et inférieur.
   */
  getLines(): { l: [vec2, vec2], t: [vec2, vec2], r: [vec2, vec2], b: [vec2, vec2] } {
    return PH.LINES_FROM_RECT(this.min[0], this.min[1], this.max[0], this.max[1]);
  }
}