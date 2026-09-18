import { gfx3TextureManager } from '../gfx3/gfx3_texture_manager';
import { gfx3DebugRenderer } from '../gfx3/gfx3_debug_renderer';
import { gfx3MeshRenderer } from '../gfx3_mesh/gfx3_mesh_renderer';
import { Poolable } from '../core/object_pool';
import { UT } from '../core/utils';
import { Gfx3BoundingBox } from '../gfx3/gfx3_bounding_box';
import { Gfx3Material } from './gfx3_mesh_material';
import { Gfx3MatParam } from './gfx3_mesh_shader';
import { Gfx3Mesh, Gfx3Group } from './gfx3_mesh';
import { Gfx3BoundingCylinder } from '../gfx3/gfx3_bounding_cylinder';

class OBJObject {
  name: string;
  coords: Array<number>;
  colors: Array<number>;
  texcoords: Array<number>;
  normals: Array<number>;
  lines: Array<vec3>;
  groups: Array<Gfx3Group>;
  materialName: string;
  vertexCount: number;

  constructor() {
    this.name = '';
    this.coords = new Array<number>();
    this.colors = new Array<number>();
    this.texcoords = new Array<number>();
    this.normals = new Array<number>();
    this.lines = new Array<vec3>();
    this.groups = new Array<Gfx3Group>();
    this.materialName = '';
    this.vertexCount = 0;
  }
}

/**
 * Représente un modèle 3D Wavefront OBJ composé d'un sous-maillage par objet.
 *
 * Les sous-maillages peuvent être manipulés séparément ou par l'intermédiaire de
 * ce maillage racine. Le chargeur OBJ prend en charge plusieurs objets, les normales
 * et couleurs de sommets facultatives ainsi que les groupes de lissage.
 *
 * Le chargeur MTL interprète `Kd` comme la couleur diffuse, `Ks` comme la couleur
 * spéculaire, `Ns` comme la brillance, `Ke` comme l'émission, `d` comme l'opacité,
 * `map_Kd` comme la texture d'albédo, `map_Ns` comme la texture spéculaire et
 * `map_Bump` comme la texture de normales.
 */
export class Gfx3MeshOBJ extends Gfx3Mesh implements Poolable<Gfx3MeshOBJ> {
  coords: Array<number>;
  colors: Array<number>;
  texcoords: Array<number>;
  normals: Array<number>;
  objects: Map<string, OBJObject>;
  materials: Map<string, Gfx3Material>;
  meshes: Map<string, Gfx3Mesh>;
  debugVertices: Array<number>;
  debugVertexCount: number;

  /** Crée un modèle OBJ vide. */
  constructor() {
    super();
    this.coords = new Array<number>();
    this.colors = new Array<number>();
    this.texcoords = new Array<number>();
    this.normals = new Array<number>();
    this.objects = new Map<string, OBJObject>();
    this.materials = new Map<string, Gfx3Material>();
    this.meshes = new Map<string, Gfx3Mesh>();
    this.debugVertices = new Array<number>();
    this.debugVertexCount = 0;
  }

  /**
   * Charge de façon asynchrone les fichiers OBJ et MTL, puis construit les sous-maillages.
   *
   * @param objPath - Chemin du fichier OBJ.
   * @param mtlPath - Chemin du fichier MTL.
   * @returns Une promesse résolue lorsque le modèle est construit.
   * @throws Si le fichier OBJ contient une face non triangulaire.
   */
  async loadFromFile(objPath: string, mtlPath: string) {
    await this.#loadMaterials(mtlPath);
    await this.#loadObjects(objPath);
    this.#build();
  }

  /**
   * Libère les ressources de tous les sous-maillages et celles du maillage racine.
   *
   * Cette méthode doit être appelée explicitement pour libérer les allocations de l'objet.
   */
  delete() {
    for (const mesh of this.meshes.values()) {
      mesh.delete();
    }

    super.delete();
  }

  /**
   * Met à jour tous les sous-maillages.
   *
   * @param ts - Pas de temps écoulé, en millisecondes.
   */
  update(ts: number): void {
    for (const mesh of this.meshes.values()) {
      mesh.update(ts);
    }
  }

  /** Ajoute tous les sous-maillages et les lignes de débogage à leurs files de rendu. */
  draw(): void {
    for (const mesh of this.meshes.values()) {
      const transform = UT.MAT4_MULTIPLY(this.getTransformMatrix(), mesh.getTransformMatrix());
      gfx3MeshRenderer.drawMesh(mesh, transform);
    }

    if (this.debugVertexCount > 0) {
      gfx3DebugRenderer.drawVertices(this.debugVertices, this.debugVertexCount, this.getTransformMatrix());
    }
  }

  /** Renvoie le nombre total de sommets des sous-maillages. */
  getVertexCount(): number {
    let vertexCount = 0;
    for (const mesh of this.meshes.values()) {
      vertexCount += mesh.getVertexCount();
    }

    return vertexCount;
  }

  /** Renvoie les données de sommets réunies de tous les sous-maillages. */
  getVertices(): Array<number> {
    let vertices = new Array<number>();
    for (const mesh of this.meshes.values()) {
      vertices.concat(mesh.getVertices());
    }

    return vertices;
  }

  /**
   * Recherche un sous-maillage par son nom.
   *
   * @param name - Nom du sous-maillage.
   * @returns Le sous-maillage correspondant.
   * @throws Si aucun sous-maillage ne porte ce nom.
   */
  getMesh(name: string): Gfx3Mesh {
    if (!this.meshes.has(name)) {
      throw new Error('Gfx3MeshOBJ::getMesh(): The mesh object doesn\'t exist !');
    }

    return this.meshes.get(name)!;
  }

  /** Renvoie un itérateur sur tous les sous-maillages. */
  getMeshes(): IterableIterator<Gfx3Mesh> {
    return this.meshes.values();
  }

  /**
   * Recherche les données OBJ d'un objet par son nom.
   *
   * @param name - Nom de l'objet.
   * @returns Les données OBJ correspondantes.
   * @throws Si aucun objet ne porte ce nom.
   */
  getObject(name: string): OBJObject {
    if (!this.objects.has(name)) {
      throw new Error('Gfx3MeshOBJ::getObject(): The object doesn\'t exist !');
    }

    return this.objects.get(name)!;
  }

  /** Renvoie la boîte englobante réunissant tous les sous-maillages. */
  getBoundingBox(): Gfx3BoundingBox {
    const boxes = new Array<Gfx3BoundingBox>();

    for (const mesh of this.meshes.values()) {
      boxes.push(mesh.getBoundingBox());
    }

    return Gfx3BoundingBox.merge(boxes);
  }

  /** Renvoie la boîte englobante de tous les sous-maillages dans l'espace monde. */
  getWorldBoundingBox(): Gfx3BoundingBox {
    const boxes = new Array<Gfx3BoundingBox>();

    for (const mesh of this.meshes.values()) {
      boxes.push(mesh.getWorldBoundingBox());
    }

    return Gfx3BoundingBox.merge(boxes);
  }

  /** Renvoie le cylindre englobant réunissant tous les sous-maillages. */
  getBoundingCylinder(): Gfx3BoundingCylinder {
    const cylinders = new Array<Gfx3BoundingCylinder>();

    for (const mesh of this.meshes.values()) {
      cylinders.push(mesh.getBoundingCylinder());
    }

    return Gfx3BoundingCylinder.merge(cylinders);
  }

  /** Renvoie le cylindre englobant de tous les sous-maillages dans l'espace monde. */
  getWorldBoundingCylinder(): Gfx3BoundingCylinder {
    const cylinders = new Array<Gfx3BoundingCylinder>();

    for (const mesh of this.meshes.values()) {
      cylinders.push(mesh.getWorldBoundingCylinder());
    }

    return Gfx3BoundingCylinder.merge(cylinders);
  }

  /**
   * Copie ce modèle OBJ dans une instance cible.
   *
   * @param obj - Instance qui reçoit la copie.
   * @param transformMatrix - Matrice de transformation appliquée aux sous-maillages copiés.
   * @returns L'instance de modèle OBJ copiée.
   */
  clone(obj: Gfx3MeshOBJ = new Gfx3MeshOBJ(), transformMatrix: mat4 = UT.MAT4_IDENTITY()): Gfx3MeshOBJ {
    obj.coords = this.coords;
    obj.colors = this.colors;
    obj.texcoords = this.texcoords;
    obj.normals = this.normals;
    obj.objects  = this.objects;
    obj.materials = this.materials;

    for (const key in this.meshes) {
      const mesh = this.meshes.get(key)!;
      obj.meshes.set(key, mesh.clone(new Gfx3Mesh(), transformMatrix));
    }

    obj.debugVertices = this.debugVertices;
    obj.debugVertexCount = this.debugVertexCount;
    return obj;
  }

  /**
   * Charge de façon asynchrone les matériaux d'un fichier MTL.
   *
   * @param path - Chemin du fichier MTL.
   * @returns Une promesse résolue lorsque les matériaux sont chargés.
   */
  async #loadMaterials(path: string) {
    const response = await fetch(path);
    const text = await response.text();
    const lines = text.split('\n');

    this.materials.clear();

    let curMat = null;
    let curMatName = null;
    path = path.split('/').slice(0, -1).join('/') + '/';

    for (const line of lines) {
      if (line.startsWith('newmtl ')) {
        curMatName = extract(line, 7);
        curMat = new Gfx3Material({ lightEnabled: true });
        this.materials.set(curMatName, curMat);
      }

      if (!curMat) {
        continue;
      }

      if (line.startsWith('Kd ')) {
        const a = extract(line, 3).split(' ');
        curMat.setParam(Gfx3MatParam.LIGHT_DIFFUSE_R, parseFloat(a[0]));
        curMat.setParam(Gfx3MatParam.LIGHT_DIFFUSE_G, parseFloat(a[1]));
        curMat.setParam(Gfx3MatParam.LIGHT_DIFFUSE_B, parseFloat(a[2]));
      }

      if (line.startsWith('Ks ')) {
        const a = extract(line, 3).split(' ');
        curMat.setParam(Gfx3MatParam.LIGHT_SPECULAR_R, parseFloat(a[0]));
        curMat.setParam(Gfx3MatParam.LIGHT_SPECULAR_G, parseFloat(a[1]));
        curMat.setParam(Gfx3MatParam.LIGHT_SPECULAR_B, parseFloat(a[2]));
      }

      if (line.startsWith('Ns ')) {
        const a = extract(line, 3);
        curMat.setParam(Gfx3MatParam.LIGHT_SPECULAR_FACTOR, parseFloat(a));
      }

      if (line.startsWith('d')) {
        const a = extract(line, 1);
        curMat.setParam(Gfx3MatParam.OPACITY, parseFloat(a));
      }

      if (line.startsWith('Ke ')) {
        const a = extract(line, 3).split(' ');
        curMat.setParam(Gfx3MatParam.LIGHT_EMISSIVE_R, parseFloat(a[0]));
        curMat.setParam(Gfx3MatParam.LIGHT_EMISSIVE_G, parseFloat(a[1]));
        curMat.setParam(Gfx3MatParam.LIGHT_EMISSIVE_B, parseFloat(a[2]));
      }

      if (line.startsWith('map_Kd ')) {
        const a = extract(line, 7);
        curMat.setTexture(await gfx3TextureManager.loadTexture(path + a));
      }

      if (line.startsWith('map_Ns ')) {
        const a = extract(line, 7);
        curMat.setSpecularMap(await gfx3TextureManager.loadTexture(path + a, {}, true));
      }

      if (line.startsWith('map_Bump ')) {
        const a = line.split(' ');
        let i = 1;

        while (a[i][0] == '-') {
          const flag = a[i].substring(1);
          if (flag == 'bm') {
            curMat.setParam(Gfx3MatParam.NORMAL_MAP_INTENSITY, parseFloat(a[i + 1]));
          }

          i++;
        }

        const url = a.join(' ');
        curMat.setNormalMap(await gfx3TextureManager.loadTexture(path + url));
      }
    }
  }

  /**
   * Charge de façon asynchrone les objets et leurs attributs depuis un fichier OBJ.
   *
   * @param path - Chemin du fichier OBJ.
   * @returns Une promesse résolue lorsque les objets sont analysés.
   * @throws Si une face du fichier n'est pas triangulaire.
   */
  async #loadObjects(path: string): Promise<void> {
    const response = await fetch(path);
    const text = await response.text();
    const lines = text.split('\n');

    this.coords = [];
    this.colors = [];
    this.texcoords = [];
    this.normals = [];
    this.objects.clear();

    let currentGroup: Gfx3Group = { name: 'default', faces: [], vertexCount: 0 };
    let currentSmoothGroup = 0;
    let currentObject = new OBJObject();
    currentObject.groups = [currentGroup];

    for (const line of lines) {
      if (line.startsWith('o ')) {
        const object = new OBJObject();
        object.name = extract(line, 2);
        object.groups = [{ name: 'default', faces: [], vertexCount: 0 }];
        currentObject = object;
        currentGroup = object.groups[0];
        this.objects.set(object.name, object);
      }

      if (line.startsWith('usemtl ')) {
        currentObject.materialName = extract(line, 7);
      }

      if (line.startsWith('v ')) {
        const a = extract(line, 2).split(' ');
        const x = parseFloat(a[0]);
        const y = parseFloat(a[1]);
        const z = parseFloat(a[2]);
        this.coords.push(x, y, z);
        currentObject.coords.push(x, y, z);

        if (a.length > 3) {
          const r = parseFloat(a[3]);
          const g = parseFloat(a[4]);
          const b = parseFloat(a[5]);
          this.colors.push(r, g, b);
          currentObject.colors.push(r, g, b);
        }
      }

      if (line.startsWith('vt ')) {
        const a = extract(line, 3).split(' ');
        const u = parseFloat(a[0]);
        const v = 1 - parseFloat(a[1]);
        this.texcoords.push(u, v);
        currentObject.texcoords.push(u, v);
      }

      if (line.startsWith('vn ')) {
        const a = extract(line, 3).split(' ');
        const x = parseFloat(a[0]);
        const y = parseFloat(a[1]);
        const z = parseFloat(a[2]);
        this.normals.push(x, y, z);
        currentObject.normals.push(x, y, z);
      }

      if (line.startsWith('s ')) {
        const a = extract(line, 2);
        currentSmoothGroup = parseInt(a);
      }

      if (line.startsWith('g ')) {
        const a = extract(line, 2);
        const group = currentObject.groups.find(g => g.name == a);

        if (group) {
          currentGroup = group;
        }
        else {
          const newGroup: Gfx3Group = { name: a, faces: [], vertexCount: 0 };
          currentObject.groups.push(newGroup);
          currentGroup = newGroup;
        }
      }

      if (line.startsWith('f ')) {
        const a = extract(line, 2).split(' ');
        if (a.length > 3) {
          throw new Error('Gfx3MeshOBJ::loadObjects(): No support of quad faces !');
        }

        const va = a[0].split('/');
        const vb = a[1].split('/');
        const vc = a[2].split('/');

        currentGroup.faces.push({
          v: [parseInt(va[0]) - 1, parseInt(vb[0]) - 1, parseInt(vc[0]) - 1],
          t: [parseInt(va[1]) - 1, parseInt(vb[1]) - 1, parseInt(vc[1]) - 1],
          n: [parseInt(va[2]) - 1, parseInt(vb[2]) - 1, parseInt(vc[2]) - 1],
          smoothGroup: currentSmoothGroup
        });

        currentGroup.vertexCount += 3;
        currentObject.vertexCount += 3;
      }

      if (line.startsWith('l ')) {
        const a = extract(line, 2).split(' ');
        const ax = this.coords[(parseInt(a[0]) - 1) * 3 + 0];
        const ay = this.coords[(parseInt(a[0]) - 1) * 3 + 1];
        const az = this.coords[(parseInt(a[0]) - 1) * 3 + 2];
        const bx = this.coords[(parseInt(a[1]) - 1) * 3 + 0];
        const by = this.coords[(parseInt(a[1]) - 1) * 3 + 1];
        const bz = this.coords[(parseInt(a[1]) - 1) * 3 + 2];
        currentObject.lines.push([ax, ay, az]);
        currentObject.lines.push([bx, by, bz]);
        currentObject.vertexCount += 2;
      }
    }
  }

  #build(): void {
    this.meshes.clear();
    this.debugVertices = [];
    this.debugVertexCount = 0;

    for (const object of this.objects.values()) {
      if (object.lines.length > 0) {
        for (const line of object.lines) {
          this.debugVertices.push(line[0], line[1], line[2], 1, 1, 1);
          this.debugVertexCount++;
        }
      }
      else {
        const mesh = new Gfx3Mesh();
        const material = this.materials.get(object.materialName);
        if (material) {
          mesh.material.delete();
          mesh.material = material;
        }

        const texcoords = object.texcoords.length > 0 ? this.texcoords : undefined; // texcoords are optionnals
        const normals = object.normals.length > 0 ? this.normals : undefined; // normals are optionnals
        const colors = object.colors.length > 0 ? this.colors : undefined; // colors are optionnals

        mesh.geo = Gfx3Mesh.buildVertices(object.vertexCount, this.coords, texcoords, colors, normals, object.groups);
        mesh.beginVertices(object.vertexCount);
        mesh.setVertices(mesh.geo.vertices);
        mesh.endVertices();
        this.meshes.set(object.name, mesh);
      }
    }
  }
}

// -------------------------------------------------------------------------------------------
// HELPFUL
// -------------------------------------------------------------------------------------------

function extract(line: string, start: number): string {
  return line.substring(start).replace('\r', '');
}