import { gfx3DebugRenderer } from '../gfx3/gfx3_debug_renderer';
import { UT } from '../core/utils';
import { PH } from '../core/physics';
import { Gfx2BoundingRect } from '../gfx2/gfx2_bounding_rect';
import { Gfx2TreePartition } from '../gfx2/gfx2_tree_partition';

/** Secteur triangulaire d'un walkmesh, avec son rectangle englobant projeté sur le plan XZ. */
export class Gfx3JWMSector extends Gfx2BoundingRect {
  index: number;
  v1: vec3;
  v2: vec3;
  v3: vec3;
  n: vec3;
  t: vec3;

  /**
   * Crée un secteur triangulaire.
   *
   * @param index - Indice du secteur dans le walkmesh.
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
    super.fromVertices([this.v1[0], this.v1[2], this.v2[0], this.v2[2], this.v3[0], this.v3[2]]);
  }
}

/** Indices des secteurs voisins sur les trois arêtes d'un secteur. */
export interface Gfx3JWMNeighbor {
  s1: number;
  s2: number;
  s3: number;
};

/** Liste des secteurs accessibles lors de la résolution d'un déplacement. */
export interface Gfx3JWMShared {
  sectorIds: Array<number>
};

/** Point mobile contraint à la surface du walkmesh. */
export interface Gfx3JWMPoint {
  sectorIndex: number;
  x: number;
  y: number;
  z: number;
};

/** Déambulateur rectangulaire composé d'un centre et de quatre coins contraints au walkmesh. */
export interface Gfx3JWMRect {
  id: string;
  width: number;
  depth: number;
  points: Array<Gfx3JWMPoint>;
};

/** Résultat du déplacement d'un déambulateur rectangulaire. */
export interface Gfx3JWMResolveRect {
  walker: Gfx3JWMRect;
  move: vec3;
  collide: boolean;
};

/** Résultat du déplacement réel ou simulé d'un point contraint au walkmesh. */
export interface Gfx3JWMResolvePoint {
  point: Gfx3JWMPoint;
  move: vec3;
  collide: boolean;
};

/** Intersection la plus proche entre un rayon et le walkmesh. */
export interface Gfx3JWMResolveRaycast {
  sectorIndex: number;
  distance: number;
  hit: vec3;
};

/** Élévation et secteur détectés à une position du walkmesh. */
export interface Gfx3JWMResolveElevation {
  sectorIndex: number;
  y: number;
};

/**
 * Gère un walkmesh 3D triangulé et les déplacements contraints à sa surface.
 * Lors d'une collision, le déplacement glisse le long des bordures afin de conserver un mouvement fluide.
 */
export class Gfx3PhysicsJWM {
  boundingRect: Gfx2BoundingRect;
  sectors: Array<Gfx3JWMSector>;
  sectorColors: Array<vec3>;
  neighborPool: Array<Gfx3JWMNeighbor>;
  sharedPool: Array<Gfx3JWMShared>;
  btree: Gfx2TreePartition;
  walkPoints: Map<string, Gfx3JWMPoint>;
  walkRects: Map<string, Gfx3JWMRect>;
  debugVertices: Array<number>;
  debugVertexCount: number;

  /** Initialise un walkmesh vide et ses collections de déambulateurs. */
  constructor() {
    this.boundingRect = new Gfx2BoundingRect();
    this.sectors = [];
    this.sectorColors = [];
    this.neighborPool = [];
    this.sharedPool = [];
    this.btree = new Gfx2TreePartition(0, 0);
    this.walkPoints = new Map<string, Gfx3JWMPoint>();
    this.walkRects = new Map<string, Gfx3JWMRect>();
    this.debugVertices = [];
    this.debugVertexCount = 0;
  }

  /**
   * Charge un walkmesh depuis un fichier JSON JWM.
   *
   * @param path - Chemin du fichier JWM.
   * @param bspMaxChildren - Nombre maximal d'enfants par nœud de partitionnement.
   * @param bspMaxDepth - Profondeur maximale de l'arbre de partitionnement.
   * @returns Une promesse résolue une fois le walkmesh chargé.
   * @throws Si le fichier ne possède pas l'identifiant JWM attendu.
   */
  async loadFromFile(path: string, bspMaxChildren: number = 20, bspMaxDepth: number = 10): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'JWM') {
      throw new Error('Gfx3PhysicsJWM::loadFromFile(): File not valid !');
    }

    this.boundingRect = new Gfx2BoundingRect(json['Min'], json['Max']);
    this.btree = new Gfx2TreePartition(bspMaxChildren, bspMaxDepth, this.boundingRect);

    this.sectors = [];
    for (let i = 0; i < json['NumSectors']; i++) {
      const obj = json['Sectors'][i];
      const sector = new Gfx3JWMSector(i, obj[0], obj[1], obj[2]);
      this.btree.addChild(sector);
      this.sectors.push(sector);
    }

    this.sectorColors = [];
    for (let i = 0; i < json['NumSectorColors']; i++) {
      const obj = json['SectorColors'][i];
      this.sectorColors.push([obj[0], obj[1], obj[2]]);
    }

    this.neighborPool = [];
    for (const obj of json['NeighborPool']) {
      this.neighborPool.push({
        s1: obj[0],
        s2: obj[1],
        s3: obj[2]
      });
    }

    this.sharedPool = [];
    for (const obj of json['SharedPool']) {
      this.sharedPool.push({
        sectorIds: obj
      });
    }
  }

  /**
   * Charge un walkmesh depuis un fichier binaire BWM.
   *
   * @param path - Chemin du fichier BWM.
   * @param bspMaxChildren - Nombre maximal d'enfants par nœud de partitionnement.
   * @param bspMaxDepth - Profondeur maximale de l'arbre de partitionnement.
   * @returns Une promesse résolue une fois le walkmesh chargé.
   */
  async loadFromBinaryFile(path: string, bspMaxChildren: number = 20, bspMaxDepth: number = 10): Promise<void> {
    const response = await fetch(path);
    const buffer = await response.arrayBuffer();
    const data = new Float32Array(buffer);
    let offset = 0;

    const numSectors = data[0];
    const numSectorColors = data[1];
    offset += 2;

    const minX = data[offset + 0];
    const minZ = data[offset + 1];
    const maxX = data[offset + 2];
    const maxZ = data[offset + 3];
    offset += 4;

    this.boundingRect = new Gfx2BoundingRect([minX, minZ], [maxX, maxZ]);
    this.btree = new Gfx2TreePartition(bspMaxChildren, bspMaxDepth, this.boundingRect);

    this.sectors = [];
    for (let i = 0; i < numSectors; i++) {
      const v0: vec3 = [data[offset + (i * 9) + 0], data[offset + (i * 9) + 1], data[offset + (i * 9) + 2]];
      const v1: vec3 = [data[offset + (i * 9) + 3], data[offset + (i * 9) + 4], data[offset + (i * 9) + 5]];
      const v2: vec3 = [data[offset + (i * 9) + 6], data[offset + (i * 9) + 7], data[offset + (i * 9) + 8]];
      const sector = new Gfx3JWMSector(i, v0, v1, v2);
      this.btree.addChild(sector);
      this.sectors.push(sector);
    }

    offset += numSectors * 9;

    this.sectorColors = [];
    for (let i = 0; i < numSectorColors; i++) {
      this.sectorColors.push([data[offset + (i * 3) + 0], data[offset + (i * 3) + 1], data[offset + (i * 3) + 2]]);
    }

    offset += numSectorColors * 9;

    this.neighborPool = [];
    for (let i = 0; i < numSectors; i++) {
      this.neighborPool.push({
        s1: data[offset + (i * 3) + 0],
        s2: data[offset + (i * 3) + 1],
        s3: data[offset + (i * 3) + 2]
      });
    }

    offset += numSectors * 3;

    this.sharedPool = [];
    for (let i = 0; i < numSectors; i++) {
      const size = data[offset];
      const indexes = [];
      offset += 1;
      for (let j = 0; j < size; j++) indexes.push(data[offset++]);
      this.sharedPool.push({ sectorIds: indexes });
    }
  }

  /** Reconstruit la géométrie de débogage du walkmesh et des déambulateurs rectangulaires. */
  update(): void {
    this.debugVertices = [];
    this.debugVertexCount = 0;

    for (const sector of this.sectors) {
      this.debugVertices.push(sector.v1[0], sector.v1[1], sector.v1[2], 1, 1, 1);
      this.debugVertices.push(sector.v2[0], sector.v2[1], sector.v2[2], 1, 1, 1);
      this.debugVertices.push(sector.v1[0], sector.v1[1], sector.v1[2], 1, 1, 1);
      this.debugVertices.push(sector.v3[0], sector.v3[1], sector.v3[2], 1, 1, 1);
      this.debugVertices.push(sector.v2[0], sector.v2[1], sector.v2[2], 1, 1, 1);
      this.debugVertices.push(sector.v3[0], sector.v3[1], sector.v3[2], 1, 1, 1);
      this.debugVertexCount += 6;
    }

    for (const walker of this.walkRects.values()) {
      this.debugVertices.push(walker.points[1].x, walker.points[1].y, walker.points[1].z, 1, 1, 1);
      this.debugVertices.push(walker.points[2].x, walker.points[2].y, walker.points[2].z, 1, 1, 1);
      this.debugVertices.push(walker.points[2].x, walker.points[2].y, walker.points[2].z, 1, 1, 1);
      this.debugVertices.push(walker.points[3].x, walker.points[3].y, walker.points[3].z, 1, 1, 1);
      this.debugVertices.push(walker.points[3].x, walker.points[3].y, walker.points[3].z, 1, 1, 1);
      this.debugVertices.push(walker.points[4].x, walker.points[4].y, walker.points[4].z, 1, 1, 1);
      this.debugVertices.push(walker.points[4].x, walker.points[4].y, walker.points[4].z, 1, 1, 1);
      this.debugVertices.push(walker.points[1].x, walker.points[1].y, walker.points[1].z, 1, 1, 1);
      this.debugVertexCount += 8;
    }
  }

  /** Dessine le walkmesh et les points mobiles à des fins de débogage. */
  draw(): void {
    gfx3DebugRenderer.drawVertices(this.debugVertices, this.debugVertexCount);

    for (const point of this.walkPoints.values()) {
      gfx3DebugRenderer.drawSphere(UT.MAT4_TRANSLATE(point.x, point.y, point.z), 0.01, 2);
    }
  }

  /**
   * Ajoute un point mobile à la surface du walkmesh.
   *
   * @param id - Identifiant unique du point.
   * @param x - Position initiale sur l'axe X.
   * @param z - Position initiale sur l'axe Z.
   * @returns Le point créé avec son élévation et son secteur.
   * @throws Si l'identifiant est déjà utilisé.
   */
  addWalkPoint(id: string, x: number, z: number): Gfx3JWMPoint {
    if (this.walkPoints.has(id)) {
      throw new Error('Gfx3PhysicsJWM::addWalkPoint: point with id ' + id + ' already exist.');
    }

    const point = this.#utilsCreateWalkPoint(x, z);
    this.walkPoints.set(id, point);
    return point;
  }

  /**
   * Supprime un point mobile.
   *
   * @param id - Identifiant unique du point.
   * @throws Si aucun point ne porte cet identifiant.
   */
  removeWalkPoint(id: string): void {
    if (!this.walkPoints.has(id)) {
      throw new Error('Gfx3PhysicsJWM::removeWalkPoint(): point not exist !');
    }

    this.walkPoints.delete(id);
  }

  /**
   * Obtient un point mobile.
   *
   * @param id - Identifiant unique du point.
   * @returns Le point correspondant.
   * @throws Si aucun point ne porte cet identifiant.
   */
  getWalkPoint(id: string): Gfx3JWMPoint {
    const point = this.walkPoints.get(id);
    if (!point) {
      throw new Error('Gfx3PhysicsJWM::getWalkPoint: point with id ' + id + ' not exist.');
    }

    return point;
  }

  /**
   * Simule le déplacement et la rotation d'un point sans modifier celui-ci.
   *
   * @param point - Point à tester.
   * @param mx - Déplacement demandé sur l'axe X.
   * @param mz - Déplacement demandé sur l'axe Z.
   * @param angle - Angle de rotation, en radians.
   * @param centerX - Abscisse du centre de rotation.
   * @param centerZ - Profondeur du centre de rotation.
   * @returns Le déplacement corrigé et l'état de collision.
   */
  testWalkPoint(point: Gfx3JWMPoint, mx: number, mz: number, angle: number = 0, centerX: number = 0, centerZ: number = 0): Gfx3JWMResolvePoint {
    if (angle != 0) {
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const dx = point.x - centerX;
      const dz = point.z - centerZ;

      const rx = dx * cosA - dz * sinA;
      const rz = dx * sinA + dz * cosA;

      const gx = centerX + rx;
      const gz = centerZ + rz;

      mx += gx - point.x;
      mz += gz - point.z;
    }

    const moveInfo = this.#utilsMove(point.sectorIndex, point.x, point.z, mx, mz);

    return {
      point: point,
      move: [moveInfo.mx, moveInfo.elevation - point.y, moveInfo.mz],
      collide: mx != moveInfo.mx || mz != moveInfo.mz
    };
  }

  /**
   * Déplace et fait pivoter un point en le contraignant au walkmesh.
   *
   * @param point - Point à déplacer.
   * @param mx - Déplacement demandé sur l'axe X.
   * @param mz - Déplacement demandé sur l'axe Z.
   * @param angle - Angle de rotation, en radians.
   * @param centerX - Abscisse du centre de rotation.
   * @param centerZ - Profondeur du centre de rotation.
   * @returns Le point mis à jour, le déplacement corrigé et l'état de collision.
   */
  moveWalkPoint(point: Gfx3JWMPoint, mx: number, mz: number, angle: number = 0, centerX: number = 0, centerZ: number = 0): Gfx3JWMResolvePoint {
    if (angle != 0) {
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const dx = point.x - centerX;
      const dz = point.z - centerZ;

      const rx = dx * cosA - dz * sinA;
      const rz = dx * sinA + dz * cosA;

      const gx = centerX + rx;
      const gz = centerZ + rz;

      mx += gx - point.x;
      mz += gz - point.z;
    }

    const moveInfo = this.#utilsMove(point.sectorIndex, point.x, point.z, mx, mz);
    point.sectorIndex = moveInfo.sectorIndex;
    point.x += moveInfo.mx;
    point.y = moveInfo.elevation;
    point.z += moveInfo.mz;

    return {
      point: point,
      move: [moveInfo.mx, moveInfo.elevation - point.y, moveInfo.mz],
      collide: mx != moveInfo.mx || mz != moveInfo.mz
    };
  }

  /**
   * Ajoute un déambulateur rectangulaire composé d'un centre et de quatre coins solidaires.
   *
   * @param id - Identifiant unique du déambulateur.
   * @param x - Position initiale de son centre sur l'axe X.
   * @param z - Position initiale de son centre sur l'axe Z.
   * @param width - Largeur du rectangle.
   * @param depth - Profondeur du rectangle, ou largeur si elle vaut zéro.
   * @returns Le déambulateur créé.
   * @throws Si l'identifiant est déjà utilisé.
   */
  addWalkRect(id: string, x: number, z: number, width: number, depth: number = 0): Gfx3JWMRect {
    if (this.walkRects.has(id)) {
      throw new Error('Gfx3PhysicsJWM::addWalkRect: walker with id ' + id + ' already exist.');
    }

    if (depth == 0) {
      depth = width;
    }

    const walker: Gfx3JWMRect = {
      id: id,
      width: width,
      depth: depth,
      points: [
        this.#utilsCreateWalkPoint(x, z),
        this.#utilsCreateWalkPoint(x + width * 0.5, z + depth * 0.5),
        this.#utilsCreateWalkPoint(x + width * 0.5, z - depth * 0.5),
        this.#utilsCreateWalkPoint(x - width * 0.5, z - depth * 0.5),
        this.#utilsCreateWalkPoint(x - width * 0.5, z + depth * 0.5)
      ]
    };

    this.walkRects.set(id, walker);
    return walker;
  }

  /**
   * Supprime un déambulateur rectangulaire.
   *
   * @param id - Identifiant unique du déambulateur.
   * @throws Si aucun déambulateur ne porte cet identifiant.
   */
  removeWalkRect(id: string): void {
    if (!this.walkRects.has(id)) {
      throw new Error('Gfx3PhysicsJWM::removeWalkRect(): Walker not exist !');
    }

    this.walkRects.delete(id);
  }

  /**
   * Obtient un déambulateur rectangulaire.
   *
   * @param id - Identifiant unique du déambulateur.
   * @returns Le déambulateur correspondant.
   * @throws Si aucun déambulateur ne porte cet identifiant.
   */
  getWalkRect(id: string): Gfx3JWMRect {
    if (!this.walkRects.has(id)) {
      throw new Error('Gfx3PhysicsJWM::getWalkRect: walker with id ' + id + ' not exist.');
    }

    return this.walkRects.get(id)!;
  }

  /**
   * Déplace un déambulateur rectangulaire en maintenant ses points sur le walkmesh.
   *
   * @param walker - Déambulateur à déplacer.
   * @param mx - Déplacement demandé sur l'axe X.
   * @param mz - Déplacement demandé sur l'axe Z.
   * @returns Le déambulateur mis à jour, le déplacement corrigé et l'état de collision.
   */
  moveWalkRect(walker: Gfx3JWMRect, mx: number, mz: number): Gfx3JWMResolveRect {
    let fmx = mx;
    let fmz = mz;
    let fmy = 0;
    let numDeviations = 0;
    let deviantPoints = [];
    let moveInfoPoints = [];
    let i = 0;

    while (i < walker.points.length) {
      let deviation = false;

      if (!deviantPoints[i]) {
        const moveInfo = this.#utilsMove(walker.points[i].sectorIndex, walker.points[i].x, walker.points[i].z, fmx, fmz);
        if (moveInfo.mx == 0 && moveInfo.mz == 0) {
          fmx = 0;
          fmz = 0;
          moveInfoPoints = [];
          break;
        }

        if (moveInfo.mx != fmx || moveInfo.mz != fmz) {
          numDeviations++;
          fmx = moveInfo.mx;
          fmz = moveInfo.mz;
          deviation = true;
          deviantPoints[i] = true;
        }

        moveInfoPoints[i] = moveInfo;
        fmy = moveInfoPoints[0].elevation - walker.points[0].y;
      }

      // if two points or more are deviated it is a dead-end, no reasons to continue...
      if (numDeviations >= 2) {
        fmx = 0;
        fmz = 0;
        moveInfoPoints = [];
        break;
      }

      // if deviation, we need to restart from 0 to update other points with new mx,mz.
      i = deviation ? 0 : i + 1;
    }

    for (let i = 0; i < moveInfoPoints.length; i++) {
      walker.points[i].sectorIndex = moveInfoPoints[i].sectorIndex;
      walker.points[i].x += fmx;
      walker.points[i].y = moveInfoPoints[i].elevation;
      walker.points[i].z += fmz;
    }

    return {
      walker: walker,
      move: [fmx, fmy, fmz],
      collide: mx != fmx || mz != fmz
    };
  }

  /** Supprime tous les points et déambulateurs rectangulaires enregistrés. */
  clearWalkers(): void {
    this.walkPoints.clear();
    this.walkRects.clear();
  }

  /**
   * Recherche l'élévation du walkmesh à une position donnée.
   *
   * @param x - Coordonnée sur l'axe X.
   * @param z - Coordonnée sur l'axe Z.
   * @returns L'élévation et l'indice du secteur trouvé, ou des valeurs sentinelles hors du walkmesh.
   */
  getElevation(x: number, z: number): Gfx3JWMResolveElevation {
    const loc = this.#utilsFindLocationInfo(x, z);
    return {
      sectorIndex: loc.sectorIndex,
      y: loc.elev
    };
  }

  /**
   * Recherche l'intersection la plus proche d'un rayon avec le walkmesh.
   *
   * @param origin - Origine du rayon.
   * @param dir - Direction du rayon.
   * @param offset - Décalage ajouté à l'origine du rayon.
   * @returns Les informations de l'intersection la plus proche, ou `null` en l'absence d'impact.
   */
  raycast(origin: vec3, dir: vec3, offset: vec3 = [0, 0, 0]): Gfx3JWMResolveRaycast | null {
    const o = UT.VEC3_ADD(origin, offset);
    const sectors = this.btree.search(new Gfx2BoundingRect(
      [o[0] - 1, o[2] - 1],
      [o[0] + 1, o[2] + 1]
    )) as Array<Gfx3JWMSector>;

    let minSector = null;
    let minSectorLength = Infinity;
    let outIntersectPoint: vec3 = [0, 0, 0];

    for (const sector of sectors) {
      const out: vec3 = [0, 0, 0];

      if (PH.RAY_TRIANGLE(o, dir, sector.v1, sector.v2, sector.v3, true, out)) {
        const pen = UT.VEC3_SUBSTRACT(out, o);
        const penLength = UT.VEC3_LENGTH(pen);
        if (penLength < minSectorLength) {
          minSectorLength = penLength;
          minSector = sector;
          outIntersectPoint = out;
        }
      }
    }

    return minSector ? { hit: outIntersectPoint, distance: minSectorLength, sectorIndex: minSector.index } : null;
  }

  /**
   * Obtient un secteur du walkmesh.
   *
   * @param sectorIndex - Indice du secteur.
   * @returns Le secteur correspondant.
   */
  getSector(sectorIndex: number): Gfx3JWMSector {
    return this.sectors[sectorIndex];
  }

  /**
   * Obtient la couleur associée à un secteur.
   *
   * @param sectorIndex - Indice du secteur.
   * @returns La couleur RVB correspondante.
   */
  getSectorColor(sectorIndex: number): vec3 {
    return this.sectorColors[sectorIndex];
  }

  /**
   * Obtient l'arbre de partitionnement spatial.
   *
   * @returns L'arbre contenant les secteurs du walkmesh.
   */
  getBinaryTree(): Gfx2TreePartition {
    return this.btree;
  }

  #utilsMove(sectorIndex: number, x: number, z: number, mx: number, mz: number, i: number = 0): { sectorIndex: number, mx: number, mz: number, elevation: number } {
    if (mx > -UT.BIG_EPSILON && mx < +UT.BIG_EPSILON && mz > -UT.BIG_EPSILON && mz < +UT.BIG_EPSILON) {
      return { sectorIndex: sectorIndex, mx: 0, mz: 0, elevation: Infinity };
    }

    if (i >= this.sharedPool[sectorIndex].sectorIds.length) {
      return { sectorIndex: sectorIndex, mx: 0, mz: 0, elevation: Infinity };
    }

    const sharedSectorIndex = this.sharedPool[sectorIndex].sectorIds[i];
    const a = this.sectors[sharedSectorIndex].v1;
    const b = this.sectors[sharedSectorIndex].v2;
    const c = this.sectors[sharedSectorIndex].v3;

    const inside = PH.TRI2_POINT_INSIDE([x + mx, z + mz], [a[0], a[2]], [b[0], b[2]], [c[0], c[2]]);
    if (inside == 1) {
      const elevation = PH.TRI3_POINT_ELEVATION([x + mx, z + mz], a, b, c);
      return { sectorIndex: sharedSectorIndex, mx: mx, mz: mz, elevation: elevation };
    }

    const ab: vec2 = [b[0] - a[0], b[2] - a[2]];
    const bc: vec2 = [c[0] - b[0], c[2] - b[2]];
    const ca: vec2 = [a[0] - c[0], a[2] - c[2]];

    if (this.neighborPool[sharedSectorIndex].s1 == -1 && PH.LINES_COLLIDE([a[0], a[2]], [b[0], b[2]], [x, z], [x + mx, z + mz])) {
      [mx, mz] = UT.VEC2_PROJECTION_COS([mx, mz], ab);
      return this.#utilsMove(sectorIndex, x, z, mx, mz, 0);
    }
    else if (this.neighborPool[sharedSectorIndex].s2 == -1 && PH.LINES_COLLIDE([b[0], b[2]], [c[0], c[2]], [x, z], [x + mx, z + mz])) {
      [mx, mz] = UT.VEC2_PROJECTION_COS([mx, mz], bc);
      return this.#utilsMove(sectorIndex, x, z, mx, mz, 0);
    }
    else if (this.neighborPool[sharedSectorIndex].s3 == -1 && PH.LINES_COLLIDE([c[0], c[2]], [a[0], a[2]], [x, z], [x + mx, z + mz])) {
      [mx, mz] = UT.VEC2_PROJECTION_COS([mx, mz], ca);
      return this.#utilsMove(sectorIndex, x, z, mx, mz, 0);
    }

    return this.#utilsMove(sectorIndex, x, z, mx, mz, i + 1);
  }

  #utilsCreateWalkPoint(x: number, z: number): Gfx3JWMPoint {
    const loc = this.#utilsFindLocationInfo(x, z);
    return {
      sectorIndex: loc.sectorIndex,
      x: x,
      y: loc.elev,
      z: z
    };
  }

  #utilsFindLocationInfo(x: number, z: number): { sectorIndex: number, elev: number } {
    const sectors = this.btree.search(new Gfx2BoundingRect(
      [x - 1, z - 1],
      [x + 1, z + 1]
    )) as Array<Gfx3JWMSector>;

    for (const sector of sectors) {
      const a = sector.v1;
      const b = sector.v2;
      const c = sector.v3;
      if (PH.TRI2_POINT_INSIDE([x, z], [a[0], a[2]], [b[0], b[2]], [c[0], c[2]]) == 1) {
        return { sectorIndex: sector.index, elev: PH.TRI3_POINT_ELEVATION([x, z], a, b, c) };
      }
    }

    return { sectorIndex: -1, elev: Infinity };
  }
}