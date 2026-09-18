import { gfx3MeshRenderer } from './gfx3_mesh_renderer';
import { UT } from '../core/utils';
import { Poolable } from '../core/object_pool';
import { Gfx3Drawable } from '../gfx3/gfx3_drawable';
import { Gfx3Material } from './gfx3_mesh_material';
import { MESH_SHADER_VERTEX_ATTR_COUNT } from './gfx3_mesh_shader';

/** Décrit une face triangulaire et les indices de ses attributs de sommets. */
export interface Gfx3Face {
  v: vec3;
  t: vec3;
  n: vec3;
  smoothGroup: number;
};

/** Regroupe des faces de maillage partageant un nom et un lissage. */
export interface Gfx3Group {
  name: string;
  faces: Array<Gfx3Face>;
  vertexCount: number;
};

/** Contient la géométrie préparée dans le format de sommets du moteur. */
export interface Gfx3MeshBuild {
  vertices: Array<number>;
  indexes: Array<number>;
  coords: Array<number>;
  texcoords?: Array<number>;
  colors?: Array<number>;
  normals?: Array<number>;
};

/** Représente le maillage 3D de base rendu par le moteur. */
export class Gfx3Mesh extends Gfx3Drawable implements Poolable<Gfx3Mesh> {
  billboard: boolean;
  viewInversion: boolean;
  material: Gfx3Material;
  geo: Gfx3MeshBuild;

  /** Crée un maillage vide doté d'un matériau par défaut. */
  constructor() {
    super(MESH_SHADER_VERTEX_ATTR_COUNT);
    this.billboard = false;
    this.viewInversion = false;
    this.material = new Gfx3Material({});
    this.geo = { vertices: [], indexes: [], coords: [] };
  }

  /**
   * Assemble les attributs de sommets au format du moteur et calcule les normales,
   * tangentes et binormales manquantes.
   *
   * @param vertexCount - Nombre total de sommets du maillage.
   * @param coords - Coordonnées des sommets, à raison de trois composantes par sommet.
   * @param texcoords - Coordonnées de texture facultatives, à raison de deux composantes par sommet.
   * @param colors - Couleurs facultatives, à raison de trois composantes par sommet.
   * @param normals - Normales facultatives, à raison de trois composantes par sommet.
   * @param groups - Groupes de faces facultatifs utilisés notamment pour le lissage.
   * @returns La géométrie assemblée et ses données sources.
   */
  static buildVertices(vertexCount: number, coords: Array<number>, texcoords?: Array<number>, colors?: Array<number>, normals?: Array<number>, groups?: Array<Gfx3Group>): Gfx3MeshBuild {
    const vertices = new Array<number>();
    const indexes = new Array<number>();
    const finalCoords = new Array<vec3>();
    const finalUVs = new Array<vec2>();
    const finalColors = new Array<vec3>();
    const finalNorms = new Array<vec3>();
    const finalTangs = new Array<vec3>();
    const finalFlips = new Array<number>();
    const finalBinorms = new Array<vec3>();
    const finalNormsByGroup = new Array<Array<vec3>>();
    const finalTangsByGroup = new Array<Array<vec3>>();

    if (!groups) {
      groups = [{ name: 'default', faces: [], vertexCount: vertexCount }];
      for (let i = 0; i < vertexCount; i += 3) {
        groups[0].faces.push({
          v: [i + 0, i + 1, i + 2],
          t: [i + 0, i + 1, i + 2],
          n: [i + 0, i + 1, i + 2],
          smoothGroup: 0
        });
      }
    }

    for (const group of groups) {
      for (const f of group.faces) {
        finalCoords.push([coords[f.v[0] * 3 + 0], coords[f.v[0] * 3 + 1], coords[f.v[0] * 3 + 2]]);
        finalCoords.push([coords[f.v[1] * 3 + 0], coords[f.v[1] * 3 + 1], coords[f.v[1] * 3 + 2]]);
        finalCoords.push([coords[f.v[2] * 3 + 0], coords[f.v[2] * 3 + 1], coords[f.v[2] * 3 + 2]]);

        if (texcoords && texcoords.length > 0) {
          finalUVs.push([texcoords[f.t[0] * 2 + 0], texcoords[f.t[0] * 2 + 1]]);
          finalUVs.push([texcoords[f.t[1] * 2 + 0], texcoords[f.t[1] * 2 + 1]]);
          finalUVs.push([texcoords[f.t[2] * 2 + 0], texcoords[f.t[2] * 2 + 1]]);
        }
        else {
          finalUVs.push([0.0, 0.0]);
          finalUVs.push([0.0, 0.0]);
          finalUVs.push([0.0, 0.0]);
        }

        if (colors && colors.length > 0) {
          finalColors.push([colors[f.v[0] * 3 + 0], colors[f.v[0] * 3 + 1], colors[f.v[0] * 3 + 2]]);
          finalColors.push([colors[f.v[1] * 3 + 0], colors[f.v[1] * 3 + 1], colors[f.v[1] * 3 + 2]]);
          finalColors.push([colors[f.v[2] * 3 + 0], colors[f.v[2] * 3 + 1], colors[f.v[2] * 3 + 2]]);
        }
        else {
          finalColors.push([1.0, 1.0, 1.0]);
          finalColors.push([1.0, 1.0, 1.0]);
          finalColors.push([1.0, 1.0, 1.0]);
        }

        const c01 = UT.VEC3_SUBSTRACT(finalCoords.at(-2)!, finalCoords.at(-3)!);
        const c02 = UT.VEC3_SUBSTRACT(finalCoords.at(-1)!, finalCoords.at(-3)!);
        const uv01 = UT.VEC2_SUBSTRACT(finalUVs.at(-2)!, finalUVs.at(-3)!);
        const uv02 = UT.VEC2_SUBSTRACT(finalUVs.at(-1)!, finalUVs.at(-3)!);

        if (normals && normals.length > 0) {
          finalNorms.push([normals[f.n[0] * 3 + 0], normals[f.n[0] * 3 + 1], normals[f.n[0] * 3 + 2]]);
          finalNorms.push([normals[f.n[1] * 3 + 0], normals[f.n[1] * 3 + 1], normals[f.n[1] * 3 + 2]]);
          finalNorms.push([normals[f.n[2] * 3 + 0], normals[f.n[2] * 3 + 1], normals[f.n[2] * 3 + 2]]);
        }
        else {
          const fnorm = UT.VEC3_NORMALIZE(UT.VEC3_CROSS(c01, c02));
          finalNorms.push(fnorm);
          finalNorms.push(fnorm);
          finalNorms.push(fnorm);
        }

        const ftang: vec3 = [0, 0, 0];
        const fflip = COMPUTE_FACE_TANGENT(c01, c02, uv01, uv02, ftang);
        finalFlips.push(fflip);
        finalFlips.push(fflip);
        finalFlips.push(fflip);
        finalTangs.push(ftang);
        finalTangs.push(ftang);
        finalTangs.push(ftang);

        if (f.smoothGroup) {
          finalNormsByGroup[f.smoothGroup] = finalNormsByGroup[f.smoothGroup] || [];
          finalNormsByGroup[f.smoothGroup][f.v[0]] = finalNormsByGroup[f.smoothGroup][f.v[0]] ? UT.VEC3_ADD(finalNormsByGroup[f.smoothGroup][f.v[0]], finalNorms.at(-3)!) : finalNorms.at(-3)!;
          finalNormsByGroup[f.smoothGroup][f.v[1]] = finalNormsByGroup[f.smoothGroup][f.v[1]] ? UT.VEC3_ADD(finalNormsByGroup[f.smoothGroup][f.v[1]], finalNorms.at(-2)!) : finalNorms.at(-2)!;
          finalNormsByGroup[f.smoothGroup][f.v[2]] = finalNormsByGroup[f.smoothGroup][f.v[2]] ? UT.VEC3_ADD(finalNormsByGroup[f.smoothGroup][f.v[2]], finalNorms.at(-1)!) : finalNorms.at(-1)!;
          finalTangsByGroup[f.smoothGroup] = finalTangsByGroup[f.smoothGroup] || [];
          finalTangsByGroup[f.smoothGroup][f.v[0]] = finalTangsByGroup[f.smoothGroup][f.v[0]] ? UT.VEC3_ADD(finalTangsByGroup[f.smoothGroup][f.v[0]], ftang) : ftang;
          finalTangsByGroup[f.smoothGroup][f.v[1]] = finalTangsByGroup[f.smoothGroup][f.v[1]] ? UT.VEC3_ADD(finalTangsByGroup[f.smoothGroup][f.v[1]], ftang) : ftang;
          finalTangsByGroup[f.smoothGroup][f.v[2]] = finalTangsByGroup[f.smoothGroup][f.v[2]] ? UT.VEC3_ADD(finalTangsByGroup[f.smoothGroup][f.v[2]], ftang) : ftang;
        }

        indexes.push(f.v[0], f.v[1], f.v[2]);
      }
    }

    for (let i = 0, n = 0; i < groups.length; i++) {
      for (const f of groups[i].faces) {
        for (let j = 0; j < 3; j++) {
          if (f.smoothGroup) {
            finalNorms[n] = UT.VEC3_NORMALIZE(finalNormsByGroup[f.smoothGroup][f.v[j]]);
            finalTangs[n] = UT.VEC3_NORMALIZE(finalTangsByGroup[f.smoothGroup][f.v[j]]);
          }

          finalBinorms[n] = UT.VEC3_SCALE(UT.VEC3_CROSS(finalNorms[n], finalTangs[n]), finalFlips[n]);
          vertices.push(finalCoords[n][0], finalCoords[n][1], finalCoords[n][2], finalUVs[n][0], finalUVs[n][1], finalColors[n][0], finalColors[n][1], finalColors[n][2], finalNorms[n][0], finalNorms[n][1], finalNorms[n][2], finalTangs[n][0], finalTangs[n][1], finalTangs[n][2], finalBinorms[n][0], finalBinorms[n][1], finalBinorms[n][2]);
          n++;
        }
      }
    }

    return {
      vertices: vertices,
      indexes: indexes,
      coords: coords,
      texcoords: texcoords,
      colors: colors,
      normals: normals
    };
  }

  /**
   * Libère toutes les ressources détenues par le maillage.
   *
   * Cette méthode doit être appelée explicitement pour libérer les allocations de l'objet.
   */
  delete(): void {
    this.material.delete();
    super.delete();
  }

  /**
   * Remplace le matériau du maillage après avoir libéré le précédent.
   *
   * @param material - Nouveau matériau à affecter au maillage.
   */
  setMaterial(material: Gfx3Material): void {
    this.material.delete();
    this.material = material;
  }

  /**
   * Charge de façon asynchrone un matériau depuis un fichier JSON au format MAT.
   *
   * @param path - Chemin du fichier de matériau.
   * @param textureDir - Répertoire préfixant les chemins des textures.
   * @returns Une promesse résolue lorsque le matériau est chargé et affecté.
   * @throws Si le fichier ne contient pas un matériau MAT valide.
   */
  async setMaterialFromFile(path: string, textureDir: string = ''): Promise<void> {
    this.material.delete();
    this.material = await Gfx3Material.createFromFile(path, textureDir);
  }

  /**
   * Met à jour le matériau du maillage.
   *
   * @param ts - Pas de temps écoulé, en millisecondes.
   */
  update(ts: number): void {
    this.material.update(ts);
  }

  /** Ajoute le maillage à la file de rendu. */
  draw(): void {
    gfx3MeshRenderer.drawMesh(this);
  }

  /**
   * Configure le mode billboard et la compensation de translation de la vue.
   *
   * @param billboard - Indique si l'objet doit faire face à la caméra.
   * @param viewInversion - Indique si la translation de la vue doit être compensée.
   */
  setBillboard(billboard: boolean, viewInversion: boolean = false): void {
    this.billboard = billboard;
    this.viewInversion = viewInversion;
  }

  /** Indique si le mode billboard est activé. */
  isBillboard(): boolean {
    return this.billboard;
  }

  /** Indique si la translation de la vue est compensée. */
  hasViewInversion(): boolean {
    return this.viewInversion;
  }

  /** Renvoie toutes les données géométriques du maillage. */
  getGeo(): Gfx3MeshBuild {
    return this.geo;
  }

  /** Renvoie les coordonnées des sommets. */
  getCoords(): Array<number> {
    return this.geo.coords;
  }

  /** Renvoie les indices des sommets. */
  getIndexes(): Array<number> {
    return this.geo.indexes;
  }

  /** Renvoie les normales des sommets, ou `undefined` lorsqu'elles sont absentes. */
  getNormals(): Array<number> | void {
    return this.geo.normals;
  }

  /**
   * Modifie un paramètre du matériau associé.
   *
   * @param name - Indice du paramètre.
   * @param value - Nouvelle valeur du paramètre.
   */
  setMaterialParam(name: number, value: number): void {
    this.material.setParam(name, value);
  }

  /**
   * Lit un paramètre du matériau associé.
   *
   * @param name - Indice du paramètre.
   * @returns La valeur du paramètre.
   */
  getMaterialParam(name: number): number {
    return this.material.getParam(name);
  }

  /**
   * Modifie un paramètre personnalisé du matériau associé.
   *
   * @param name - Nom du paramètre personnalisé.
   * @param value - Nouvelle valeur du paramètre.
   * @throws Si aucun paramètre personnalisé ne porte ce nom.
   */
  setMaterialCustomParam(name: string, value: number): void {
    this.material.setCustomParamValue(name, value);
  }

  /**
   * Lit un paramètre personnalisé du matériau associé.
   *
   * @param name - Nom du paramètre personnalisé.
   * @returns La valeur du paramètre.
   * @throws Si aucun paramètre personnalisé ne porte ce nom.
   */
  getMaterialCustomParam(name: string): number {
    return this.material.getCustomParamValue(name);
  }

  /**
   * Copie ce maillage dans une instance cible.
   *
   * @param mesh - Instance qui reçoit la copie.
   * @param transformMatrix - Matrice de transformation appliquée à la copie.
   * @returns L'instance de maillage copiée.
   */
  clone(mesh: Gfx3Mesh = new Gfx3Mesh(), transformMatrix: mat4 = UT.MAT4_IDENTITY()): Gfx3Mesh {
    super.clone(mesh, transformMatrix);
    mesh.material = this.material;
    mesh.geo = this.geo;
    return mesh;
  }

  /** Renvoie le matériau associé au maillage. */
  get mat(): Gfx3Material {
    return this.material;
  }
}

// -------------------------------------------------------------------------------------------
// HELPFUL
// -------------------------------------------------------------------------------------------

function COMPUTE_FACE_TANGENT(v01: vec3, v02: vec3, uv01: vec2, uv02: vec2, out: vec3): number {
  const uv2xArea = ((uv01[0] * uv02[1]) - (uv01[1] * uv02[0]));
  if (Math.abs(uv2xArea) > UT.EPSILON) {
    const r = 1.0 / uv2xArea;
    const flip = uv2xArea > 0 ? 1 : -1;

    const tx = ((v01[0] * uv02[1]) - (v02[0] * uv01[1])) * r;
    const ty = ((v01[1] * uv02[1]) - (v02[1] * uv01[1])) * r;
    const tz = ((v01[2] * uv02[1]) - (v02[2] * uv01[1])) * r;

    const ftang = UT.VEC3_NORMALIZE([tx, ty, tz]);
    out[0] = ftang[0];
    out[1] = ftang[1];
    out[2] = ftang[2];
    return flip;
  }

  return -1;
}
