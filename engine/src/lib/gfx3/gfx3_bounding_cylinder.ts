import { UT } from '../core/utils';
import { PH } from '../core/physics';
import { Gfx3BoundingBox } from './gfx3_bounding_box';

/** Cylindre englobant 3D vertical, défini par le centre de sa base, sa hauteur et son rayon. */
export class Gfx3BoundingCylinder {
  position: vec3;
  height: number;
  radius: number;

  /**
   * Crée un cylindre englobant vertical.
   *
   * @param position - Position du centre de la base.
   * @param height - Hauteur du cylindre.
   * @param radius - Rayon du cylindre.
   */
  constructor(position: vec3 = [0, 0, 0], height: number = 1, radius: number = 1) {
    this.position = position;
    this.height = height;
    this.radius = radius;
  }

  /**
   * Crée un cylindre à partir de son centre géométrique, de sa hauteur et de son rayon.
   *
   * @param x - Coordonnée X du centre.
   * @param y - Coordonnée Y du centre.
   * @param z - Coordonnée Z du centre.
   * @param h - Hauteur.
   * @param r - Rayon.
   * @returns Le nouveau cylindre englobant.
   */
  static createFromCenter(x: number, y: number, z: number, h: number, r: number): Gfx3BoundingCylinder {
    const cylinder = new Gfx3BoundingCylinder();
    cylinder.position = [x, y - (h * 0.5), z];
    cylinder.height = h;
    cylinder.radius = r;
    return cylinder;
  }

  /**
   * Crée un cylindre vertical qui englobe une boîte alignée sur les axes.
   *
   * @param aabb - Boîte à englober.
   * @returns Le nouveau cylindre englobant.
   */
  static createFromBoundingBox(aabb: Gfx3BoundingBox): Gfx3BoundingCylinder {
    const cylinder = new Gfx3BoundingCylinder();
    const center = aabb.getCenter();
    cylinder.position = [center[0], aabb.min[1], center[2]];
    cylinder.height = aabb.getHeight();
    cylinder.radius = aabb.getRadius();
    return cylinder;
  }

  /**
   * Calcule un cylindre vertical contenant tous les cylindres fournis.
   *
   * @param cylinders - Cylindres à réunir ; la liste doit contenir au moins un élément.
   * @returns Leur cylindre englobant commun.
   */
  static merge(cylinders: Array<Gfx3BoundingCylinder>): Gfx3BoundingCylinder {
    let minY = cylinders[0].position[1];
    let maxY = cylinders[0].position[1] + cylinders[0].height;
    const xs: number[] = [];
    const zs: number[] = [];

    for (const cyl of cylinders) {
      minY = Math.min(minY, cyl.position[1]);
      maxY = Math.max(maxY, cyl.position[1] + cyl.height);
      xs.push(cyl.position[0]);
      zs.push(cyl.position[2]);
    }

    const centerX = (Math.min(...xs) + Math.max(...xs)) * 0.5;
    const centerZ = (Math.min(...zs) + Math.max(...zs)) * 0.5;

    let maxRadius = 0;
    for (const cyl of cylinders) {
      const dx = cyl.position[0] - centerX;
      const dz = cyl.position[2] - centerZ;
      maxRadius = Math.max(maxRadius, Math.sqrt(dx * dx + dz * dz) + cyl.radius);
    }

    const height = maxY - minY;
    return new Gfx3BoundingCylinder([centerX, minY, centerZ], height, maxRadius);
  }

  /**
   * Redéfinit le cylindre à partir de son centre géométrique et de ses dimensions.
   *
   * @param x - Coordonnée X du centre.
   * @param y - Coordonnée Y du centre.
   * @param z - Coordonnée Z du centre.
   * @param h - Hauteur.
   * @param r - Rayon.
   */
  fromCenter(x: number, y: number, z: number, h: number, r: number) {
    this.position = [x, y - (h * 0.5), z];
    this.height = h;
    this.radius = r;
  }

  /**
   * Redéfinit ce cylindre pour englober une boîte alignée sur les axes.
   *
   * @param aabb - Boîte à convertir.
   */
  fromBoundingBox(aabb: Gfx3BoundingBox) {
    const center = aabb.getCenter();
    this.position = [center[0], aabb.min[1], center[2]];
    this.height = aabb.getHeight();
    this.radius = aabb.getRadius();
  }

  /**
   * Transforme des points caractéristiques puis calcule un cylindre vertical englobant le résultat.
   * Le cylindre obtenu reste aligné sur l'axe Y.
   *
   * @param matrix - Matrice de transformation.
   * @returns Le cylindre englobant transformé.
   */
  transform(matrix: mat4): Gfx3BoundingCylinder {
    const cx = this.position[0];
    const cy = this.position[1];
    const cz = this.position[2];
    const topY = cy + this.height;

    const points: Array<[number, number, number]> = [
      // Bottom center
      [cx, cy, cz],
      // Top center
      [cx, topY, cz],
      // Bottom circle cardinal points
      [cx + this.radius, cy, cz],
      [cx - this.radius, cy, cz],
      [cx, cy, cz + this.radius],
      [cx, cy, cz - this.radius],
      // Top circle cardinal points
      [cx + this.radius, topY, cz],
      [cx - this.radius, topY, cz],
      [cx, topY, cz + this.radius],
      [cx, topY, cz - this.radius]
    ];

    const transformed = points.map(p =>
      UT.MAT4_MULTIPLY_BY_VEC4(matrix, [p[0], p[1], p[2], 1])
    );

    const min: vec3 = [...transformed[0].slice(0, 3)] as vec3;
    const max: vec3 = [...transformed[0].slice(0, 3)] as vec3;

    for (let i = 1; i < transformed.length; i++) {
      for (let j = 0; j < 3; j++) {
        const v = transformed[i][j];
        min[j] = Math.min(min[j], v);
        max[j] = Math.max(max[j], v);
      }
    }

    return Gfx3BoundingCylinder.createFromBoundingBox(new Gfx3BoundingBox(min, max));
  }

  /**
   * Applique une échelle radiale et verticale autour du centre du cylindre.
   * Le cylindre reste aligné sur l'axe Y.
   *
   * @param xz - Facteur appliqué au rayon dans le plan XZ.
   * @param y - Facteur appliqué à la hauteur.
   */
  scale(xz: number = 1, y: number = 1): void {
    const centerY = this.position[1] + this.height * 0.5;
    const newHeight = this.height * y;
    const newRadius = this.radius * xz;

    this.position[1] = centerY - (newHeight * 0.5);
    this.height = newHeight;
    this.radius = newRadius;
  }

  /**
   * Indique si un point appartient au cylindre.
   *
   * @param x - Coordonnée X du point.
   * @param y - Coordonnée Y du point.
   * @param z - Coordonnée Z du point.
   * @returns `true` si le point se trouve dans le cylindre.
   */
  isPointInside(x: number, y: number, z: number): boolean {
    return PH.CYLINDER_POINT_COLLIDE(this.position, this.height, this.radius, [x, y, z]);
  }

  /**
   * Teste l'intersection avec un autre cylindre et peut calculer la réponse élastique dans le plan XZ.
   *
   * @param cylinder - Cylindre à tester.
   * @param outVelocityImpact - Vecteur de sortie recevant la vitesse d'impact.
   * @returns `true` si les cylindres se chevauchent.
   */
  intersectBoundingCylinder(cylinder: Gfx3BoundingCylinder, outVelocityImpact: vec2 = [0, 0]): boolean {
    return PH.CYLINDERS_COLLIDE(
      this.position,
      this.radius,
      this.height,
      cylinder.getPosition(),
      cylinder.getRadius(),
      cylinder.getHeight(),
      outVelocityImpact
    );
  }

  /**
   * Teste l'intersection avec une boîte alignée sur les axes.
   *
   * @param aabb - Boîte à tester.
   * @returns `true` si les volumes se chevauchent.
   */
  intersectBoundingBox(aabb: Gfx3BoundingBox): boolean {
    return PH.CYLINDER_BOX_COLLIDE(this.position, this.radius, this.height, aabb.min, aabb.max);
  }

  /** Rétablit un cylindre unitaire centré à la base sur l'origine. */
  reset(): void {
    this.position = [0, 0, 0];
    this.height = 1;
    this.radius = 1;
  }

  /** Renvoie la position du centre de la base. */
  getPosition(): vec3 {
    return this.position;
  }

  /** Renvoie la hauteur du cylindre. */
  getHeight(): number {
    return this.height;
  }

  /** Renvoie le rayon du cylindre. */
  getRadius(): number {
    return this.radius;
  }

  /**
   * Définit la position du centre de la base.
   *
   * @param x - Coordonnée X.
   * @param y - Coordonnée Y.
   * @param z - Coordonnée Z.
   */
  setPosition(x: number, y: number, z: number): void {
    this.position = [x, y, z];
  }

  /**
   * Définit la hauteur du cylindre.
   *
   * @param height - Nouvelle hauteur.
   */
  setHeight(height: number): void {
    this.height = height;
  }

  /**
   * Définit le rayon du cylindre.
   *
   * @param radius - Nouveau rayon.
   */
  setRadius(radius: number): void {
    this.radius = radius;
  }
}