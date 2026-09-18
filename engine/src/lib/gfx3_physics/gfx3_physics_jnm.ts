import { gfx3DebugRenderer } from '../gfx3/gfx3_debug_renderer';
import { UT } from '../core/utils';
import { PH } from '../core/physics';
import { Gfx3BoundingBox } from '../gfx3/gfx3_bounding_box';
import { Gfx3TreePartition } from '../gfx3/gfx3_tree_partition';

/** Triangle de collision d'un maillage JNM, avec sa boîte englobante et ses vecteurs directeurs. */
export class Gfx3JNMFrag extends Gfx3BoundingBox {
  index: number;
  v1: vec3;
  v2: vec3;
  v3: vec3;
  n: vec3;
  t: vec3;

  /**
   * Crée un fragment triangulaire.
   *
   * @param index - Indice du fragment dans le maillage.
   * @param a - Premier sommet du triangle.
   * @param b - Deuxième sommet du triangle.
   * @param c - Troisième sommet du triangle.
   */
  constructor(index: number, a: vec3, b: vec3, c: vec3) {
    super();
    this.index = index;
    this.v1 = a;
    this.v2 = b;
    this.v3 = c;
    this.n = UT.VEC3_NORMALIZE(PH.TRI3_NORMAL(this.v1, this.v2, this.v3));
    this.t = UT.VEC3_NORMALIZE(UT.VEC3_CROSS([0, 1, 0], this.n));
    super.fromVertices([...this.v1, ...this.v2, ...this.v3], 3);
  }
}

/** Résultat de la résolution du déplacement d'une boîte contre le maillage. */
export interface Gfx3JNMResolveBox {
  move: vec3;
  collideFloor: boolean;
  collideTop: boolean;
  collideWall: boolean;
  fragIndex: number
};

/** Intersection la plus proche entre un rayon et le maillage de collision. */
export interface Gfx3JNMResolveRaycast {
  hit: vec3;
  distance: number;
  fragIndex: number;
};

/** Élévation détectée sur un fragment du maillage de collision. */
export interface Gfx3JNMResolveElevation {
  hit: vec3;
  distance: number;
  fragIndex: number
};

/**
 * Gère un maillage de collision 3D triangulé et son partitionnement spatial.
 */
export class Gfx3PhysicsJNM {
  boundingBox: Gfx3BoundingBox;
  frags: Array<Gfx3JNMFrag>;
  fragColors: Array<vec3>;
  btree: Gfx3TreePartition;
  debugMeshEnabled: boolean;
  debugBspEnabled: boolean;
  debugVertices: Array<number>;
  debugVertexCount: number;

  /** Initialise un maillage de collision vide avec les affichages de débogage activés. */
  constructor() {
    this.boundingBox = new Gfx3BoundingBox();
    this.frags = [];
    this.fragColors = [];
    this.btree = new Gfx3TreePartition(0, 0);
    this.debugBspEnabled = true;
    this.debugMeshEnabled = true;
    this.debugVertices = [];
    this.debugVertexCount = 0;
  }

  /**
   * Charge un maillage de collision depuis un fichier JSON JNM.
   *
   * @param path - Chemin du fichier JNM.
   * @param bspMaxChildren - Nombre maximal d'enfants par nœud de partitionnement.
   * @param bspMaxDepth - Profondeur maximale de l'arbre de partitionnement.
   * @returns Une promesse résolue une fois le maillage chargé.
   * @throws Si le fichier ne possède pas l'identifiant JNM attendu.
   */
  async loadFromFile(path: string, bspMaxChildren: number = 20, bspMaxDepth: number = 10): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'JNM') {
      throw new Error('Gfx3PhysicsJNM::loadFromFile(): File not valid !');
    }

    this.boundingBox = new Gfx3BoundingBox(json['Min'], json['Max']);
    this.btree = new Gfx3TreePartition(bspMaxChildren, bspMaxDepth, this.boundingBox);

    this.frags = [];
    for (let i = 0; i < json['NumFrags']; i++) {
      const obj = json['Frags'][i];
      const v1 = obj[0];
      const v2 = obj[1];
      const v3 = obj[2];
      const frag = new Gfx3JNMFrag(i, v1, v2, v3);
      this.btree.addChild(frag);
      this.frags.push(frag);
    }

    this.fragColors = [];
    for (let i = 0; i < json['NumFragColors']; i++) {
      const obj = json['FragColors'][i];
      this.fragColors.push([obj[0], obj[1], obj[2]]);
    }
  }

  /**
   * Charge un maillage de collision depuis un fichier binaire BNM.
   *
   * @param path - Chemin du fichier BNM.
   * @param bspMaxChildren - Nombre maximal d'enfants par nœud de partitionnement.
   * @param bspMaxDepth - Profondeur maximale de l'arbre de partitionnement.
   * @returns Une promesse résolue une fois le maillage chargé.
   */
  async loadFromBinaryFile(path: string, bspMaxChildren: number = 20, bspMaxDepth: number = 10): Promise<void> {
    const response = await fetch(path);
    const buffer = await response.arrayBuffer();
    const data = new Float32Array(buffer);
    let offset = 0;

    const numFrags = data[0];
    const numFragColors = data[1];
    offset += 2;

    const minX = data[offset + 0];
    const minY = data[offset + 1];
    const minZ = data[offset + 2];
    const maxX = data[offset + 3];
    const maxY = data[offset + 4];
    const maxZ = data[offset + 5];
    offset += 6;

    this.boundingBox = new Gfx3BoundingBox([minX, minY, minZ], [maxX, maxY, maxZ]);
    this.btree = new Gfx3TreePartition(bspMaxChildren, bspMaxDepth, this.boundingBox);

    this.frags = [];
    for (let i = 0; i < numFrags; i++) {
      const v1: vec3 = [data[offset + (i * 9) + 0], data[offset + (i * 9) + 1], data[offset + (i * 9) + 2]];
      const v2: vec3 = [data[offset + (i * 9) + 3], data[offset + (i * 9) + 4], data[offset + (i * 9) + 5]];
      const v3: vec3 = [data[offset + (i * 9) + 6], data[offset + (i * 9) + 7], data[offset + (i * 9) + 8]];
      const frag = new Gfx3JNMFrag(i, v1, v2, v3);
      this.btree.addChild(frag);
      this.frags.push(frag);
    }

    offset += numFrags * 9;

    this.fragColors = [];
    for (let i = 0; i < numFragColors; i++) {
      this.fragColors.push([data[offset + (i * 3) + 0], data[offset + (i * 3) + 1], data[offset + (i * 3) + 2]]);
    }
  }

  /**
   * Reconstruit la géométrie de débogage du maillage.
   *
   * @param ts - Pas de temps de la boucle, en millisecondes.
   */
  update(ts: number): void {
    this.debugVertices = [];
    this.debugVertexCount = 0;

    for (const frag of this.frags) {
      this.debugVertices.push(frag.v1[0], frag.v1[1], frag.v1[2], 1, 1, 1);
      this.debugVertices.push(frag.v2[0], frag.v2[1], frag.v2[2], 1, 1, 1);
      this.debugVertices.push(frag.v1[0], frag.v1[1], frag.v1[2], 1, 1, 1);
      this.debugVertices.push(frag.v3[0], frag.v3[1], frag.v3[2], 1, 1, 1);
      this.debugVertices.push(frag.v2[0], frag.v2[1], frag.v2[2], 1, 1, 1);
      this.debugVertices.push(frag.v3[0], frag.v3[1], frag.v3[2], 1, 1, 1);
      this.debugVertexCount += 6;
    }
  }

  /** Dessine les représentations de débogage activées du maillage et de son arbre. */
  draw(): void {
    if (this.debugBspEnabled) {
      this.btree.draw();
    }

    if (this.debugMeshEnabled) {
      gfx3DebugRenderer.drawVertices(this.debugVertices, this.debugVertexCount);
    }
  }

  /**
   * Translate le maillage, ses fragments et son arbre spatial.
   *
   * @param x - Déplacement sur l'axe X.
   * @param y - Déplacement sur l'axe Y.
   * @param z - Déplacement sur l'axe Z.
   */
  translate(x: number, y: number, z: number): void {
    this.boundingBox.min[0] += x;
    this.boundingBox.min[1] += y;
    this.boundingBox.min[2] += z;

    this.boundingBox.max[0] += x;
    this.boundingBox.max[1] += y;
    this.boundingBox.max[2] += z;

    this.btree.translate(x, y, z);

    for (const frag of this.frags) {
      frag.v1[0] += x;
      frag.v1[1] += y;
      frag.v1[2] += z;

      frag.v2[0] += x;
      frag.v2[1] += y;
      frag.v2[2] += z;

      frag.v3[0] += x;
      frag.v3[1] += y;
      frag.v3[2] += z;

      frag.min[0] += x;
      frag.min[1] += y;
      frag.min[2] += z;

      frag.max[0] += x;
      frag.max[1] += y;
      frag.max[2] += z;
    }
  }

  /**
   * Résout le déplacement d'une boîte en la faisant glisser contre les murs et le sol.
   *
   * @param x - Abscisse du centre de la boîte.
   * @param y - Ordonnée du centre de la boîte.
   * @param z - Profondeur du centre de la boîte.
   * @param size - Demi-dimension horizontale de la boîte.
   * @param height - Hauteur totale de la boîte.
   * @param mx - Déplacement demandé sur l'axe X.
   * @param my - Déplacement demandé sur l'axe Y.
   * @param mz - Déplacement demandé sur l'axe Z.
   * @param lift - Relèvement virtuel permettant de franchir de petites marches ou irrégularités.
   * @param snapFloor - Active l'accrochage de la boîte au sol.
   * @param snapFloorDistance - Distance maximale d'accrochage au sol.
   * @returns Le déplacement corrigé, les collisions détectées et l'indice du fragment de sol.
   */
  box(x: number, y: number, z: number, size: number, height: number, mx: number, my: number, mz: number, lift: number = 0.2, snapFloor: boolean = true, snapFloorDistance: number = 1): Gfx3JNMResolveBox {
    const min: vec3 = [x - size, y - height * 0.5, z - size];
    const max: vec3 = [x + size, y + height * 0.5, z + size];

    min[1] += lift;

    const wallIntersectedFrags = this.btree.search(new Gfx3BoundingBox(
      [min[0] + mx, min[1] + my, min[2] + mz],
      [max[0] + mx, max[1] + my, max[2] + mz]
    )) as Array<Gfx3JNMFrag>;

    let fmx = mx;
    let fmy = my;
    let fmz = mz;
    let collideFloor = false;
    let collideTop = false;
    let collideWall = false;
    let i = 0;

    const bottomPoints: Array<vec3> = [
      [min[0], min[1] + lift, max[2]],
      [min[0], min[1] + lift, min[2]],
      [max[0], min[1] + lift, min[2]],
      [max[0], min[1] + lift, max[2]]
    ];

    const topPoints: Array<vec3> = [
      [min[0], max[1], max[2]],
      [min[0], max[1], min[2]],
      [max[0], max[1], min[2]],
      [max[0], max[1], max[2]]
    ];

    const points: Array<vec3> = [
      ...POINT_SORTING(x, y, z, mx, mz, bottomPoints),
      ...POINT_SORTING(x, y, z, mx, mz, topPoints),
    ];

    while (i < points.length) {
      const xz = this.#moveXZ(wallIntersectedFrags, points[i], [fmx, fmz]);
      if (xz.move[0] != fmx || xz.move[1] != fmz) {
        fmx = xz.move[0];
        fmz = xz.move[1];
        collideWall = true;
        break;
      }

      i++;
    }

    if (my > 0) {
      const topIntersectedFrags = this.btree.search(new Gfx3BoundingBox(
        [x + fmx, min[1], z + fmz],
        [x + fmx, max[1] + 0.1, z + fmz]
      )) as Array<Gfx3JNMFrag>;

      const elevation = this.#getElevation(topIntersectedFrags, [x + fmx, min[1], z + fmz], [0, 1, 0]);
      const delta = elevation ? elevation.value - max[1] : Infinity;

      if (delta < 0 && elevation) {
        collideTop = true;
        fmy = elevation.value - max[1];
      }
    }

    min[1] -= lift;
    snapFloorDistance = snapFloorDistance == 0 ? Math.abs(my) : snapFloorDistance;

    const floorIntersectedFrags = this.btree.search(new Gfx3BoundingBox(
      [x + fmx, min[1] - snapFloorDistance, z + fmz],
      [x + fmx, max[1], z + fmz]
    )) as Array<Gfx3JNMFrag>;

    const elevation = this.#getElevation(floorIntersectedFrags, [x + fmx, max[1], z + fmz]);
    const delta = elevation ? min[1] - elevation.value : Infinity; // climbing on negative, descent on positive

    if (snapFloor && delta < snapFloorDistance && elevation) {
      collideFloor = true;
      fmy = elevation.value - min[1];
    }

    return {
      move: [fmx, fmy, fmz],
      collideWall: collideWall,
      collideTop: collideTop,
      collideFloor: collideFloor,
      fragIndex: elevation ? elevation.fragIndex : -1
    };
  }

  /**
   * Recherche l'intersection la plus proche d'un rayon avec le maillage.
   *
   * @param origin - Origine du rayon.
   * @param dir - Direction du rayon.
   * @param size - Demi-largeur de la zone de recherche horizontale.
   * @param height - Hauteur de la zone de recherche.
   * @param offset - Décalage ajouté à l'origine du rayon.
   * @returns Les informations de l'intersection la plus proche, ou `null` en l'absence d'impact.
   */
  raycast(origin: vec3, dir: vec3, size: number, height: number, offset: vec3 = [0, 0, 0]): Gfx3JNMResolveRaycast | null {
    const o = UT.VEC3_ADD(origin, offset);
    const frags = this.btree.search(new Gfx3BoundingBox(
      [o[0] - size, o[1] - height * 0.5, o[2] - size],
      [o[0] + size, o[1] + height * 0.5, o[2] + size]
    )) as Array<Gfx3JNMFrag>;

    let minFrag = null;
    let minFragLength = Infinity;
    let outIntersectPoint: vec3 = [0, 0, 0];

    for (const frag of frags) {
      const out: vec3 = [0, 0, 0];

      if (PH.RAY_TRIANGLE(o, dir, frag.v1, frag.v2, frag.v3, true, out)) {
        const pen = UT.VEC3_SUBSTRACT(out, o);
        const penLength = UT.VEC3_LENGTH(pen);
        if (penLength < minFragLength) {
          minFragLength = penLength;
          minFrag = frag;
          outIntersectPoint = out;
        }
      }
    }

    return minFrag ? { hit: outIntersectPoint, distance: minFragLength, fragIndex: minFrag.index } : null;
  }

  /**
   * Recherche l'élévation du sol dans une zone de détection.
   *
   * @param x - Abscisse du centre de la zone.
   * @param y - Ordonnée du centre de la zone.
   * @param z - Profondeur du centre de la zone.
   * @param size - Demi-largeur horizontale de la zone.
   * @param height - Hauteur de la zone.
   * @param mx - Décalage de la sonde sur l'axe X.
   * @param mz - Décalage de la sonde sur l'axe Z.
   * @returns Le point détecté, sa distance verticale et l'indice du fragment, ou `null`.
   */
  getElevation(x: number, y: number, z: number, size: number, height: number, mx: number, mz: number): Gfx3JNMResolveElevation | null {
    const floors = this.btree.search(new Gfx3BoundingBox(
      [x - size, y - height * 0.5, z - size],
      [x + size, y + height * 0.5, z + size]
    )) as Array<Gfx3JNMFrag>;

    const elevation = this.#getElevation(floors, [x + mx, y + height, z + mz]);
    if (!elevation) {
      return null;
    }

    return {
      hit: [x + mx, elevation.value, z + mz],
      distance: elevation.value - y,
      fragIndex: elevation ? elevation.fragIndex : -1
    };
  }

  /**
   * Active ou désactive l'affichage de l'arbre de partitionnement.
   *
   * @param enabled - État souhaité de l'affichage.
   */
  enableDebugBsp(enabled: boolean): void {
    this.debugBspEnabled = enabled;
  }

  /**
   * Active ou désactive l'affichage du maillage de collision.
   *
   * @param enabled - État souhaité de l'affichage.
   */
  enableDebugMesh(enabled: boolean): void {
    this.debugMeshEnabled = enabled;
  }

  /**
   * Indique si l'arbre de partitionnement est affiché.
   *
   * @returns `true` lorsque cet affichage de débogage est actif.
   */
  isDebugBspEnabled(): boolean {
    return this.debugBspEnabled;
  }

  /**
   * Indique si le maillage de collision est affiché.
   *
   * @returns `true` lorsque cet affichage de débogage est actif.
   */
  isDebugMeshEnabled(): boolean {
    return this.debugMeshEnabled;
  }

  /**
   * Obtient l'arbre de partitionnement spatial.
   *
   * @returns L'arbre contenant les fragments du maillage.
   */
  getBinaryTree(): Gfx3TreePartition {
    return this.btree;
  }

  /**
   * Obtient un fragment du maillage.
   *
   * @param fragIndex - Indice du fragment.
   * @returns Le fragment correspondant.
   */
  getFrag(fragIndex: number): Gfx3JNMFrag {
    return this.frags[fragIndex];
  }

  /**
   * Obtient la couleur associée à un fragment.
   *
   * @param fragIndex - Indice du fragment.
   * @returns La couleur RVB correspondante.
   */
  getFragColor(fragIndex: number): vec3 {
    return this.fragColors[fragIndex];
  }

  /**
   * Obtient la boîte englobante du maillage.
   *
   * @returns La boîte englobante courante.
   */
  getBoundingBox(): Gfx3BoundingBox {
    return this.boundingBox;
  }

  #moveXZ(frags: Array<Gfx3JNMFrag>, point: vec3, move: vec2, i: number = 0 ): { move: vec2 } {
    let minFrag: Gfx3JNMFrag | null = null;
    let minPenLength = Infinity;

    for (const frag of frags) {
      const out: vec3 = [0, 0, 0];
      if (!PH.RAY_PLAN([point[0] - (move[0] * 4), point[1], point[2] - (move[1] * 4)], [move[0], 0, move[1]], frag.v1, frag.n, true, out)) {
        continue; // ideal solution here is to place the origin ray to point - (move * box length), whatever just * 4 is more fast and seem works for now.
      }

      const p1: vec2 = [out[0] - frag.t[0] * 100, out[2] - frag.t[2] * 100]; // scale by 100 for lines extends
      const q1: vec2 = [out[0] + frag.t[0] * 100, out[2] + frag.t[2] * 100]; // and get very-fast object
      const p2: vec2 = [point[0] - (move[0] * 4), point[2] - (move[1] * 4)];
      const q2: vec2 = [point[0] + (move[0] * 4), point[2] + (move[1] * 4)];

      if (PH.LINES_COLLIDE(p1, q1, p2, q2)) {
        const pen = UT.VEC2_SUBSTRACT([out[0], out[2]], [point[0] + move[0], point[2] + move[1]]);
        const penLength = UT.VEC2_LENGTH(pen);
        const d = UT.VEC2_DOT(pen, move);
        if (d < 0 && penLength < minPenLength) {
          minPenLength = penLength;
          minFrag = frag;
        }
      }
    }

    if (minFrag) {
      const newMove = UT.VEC2_PROJECTION_COS([move[0], move[1]], [minFrag.t[0], minFrag.t[2]]);
      return this.#moveXZ(frags, point, newMove, i + 1);
    }

    return { move: move };
  }

  #getElevation(frags: Array<Gfx3JNMFrag>, point: vec3, dir: vec3 = [0, -1, 0]): { value: number, fragIndex: number } | null {
    let minFrag: Gfx3JNMFrag | null = null;
    let minFragLength = Infinity;
    let outIntersectPoint: vec3 = [0, 0, 0];

    for (const frag of frags) {
      const out: vec3 = [0, 0, 0];
      if (PH.RAY_TRIANGLE(point, dir, frag.v1, frag.v2, frag.v3, true, out)) {
        const pen = UT.VEC3_SUBSTRACT(out, point);
        const penLength = UT.VEC3_LENGTH(pen);
        if (penLength < minFragLength) {
          minFragLength = penLength;
          minFrag = frag;
          outIntersectPoint = out;
        }
      }
    }

    return minFrag != null ? { value: outIntersectPoint[1], fragIndex: minFrag.index } : null;
  }
}

// -------------------------------------------------------------------------------------------
// HELPFUL
// -------------------------------------------------------------------------------------------

function POINT_SORTING(x: number, y: number, z: number, mx: number, mz: number, points: Array<vec3>) {
  return points.sort((a: vec3, b: vec3): number => {
    const centerToA = UT.VEC3_SUBSTRACT(a, [x, y, z]);
    const centerToB = UT.VEC3_SUBSTRACT(b, [x, y, z]);
    const angleA = UT.VEC2_ANGLE_BETWEEN([centerToA[0], centerToA[2]], [mx, mz]);
    const angleB = UT.VEC2_ANGLE_BETWEEN([centerToB[0], centerToB[2]], [mx, mz]);
    return angleA - angleB;
  }).slice(0, 2);
}
