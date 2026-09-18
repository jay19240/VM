import { UT } from '../core/utils';
import { Poolable } from '../core/object_pool';
import { Gfx3Mesh } from './gfx3_mesh';

/** Représente un maillage 3D statique aux formats JSM ou BSM. */
export class Gfx3MeshJSM extends Gfx3Mesh implements Poolable<Gfx3MeshJSM> {
  /** Crée un maillage statique vide. */
  constructor() {
    super();
  }

  /**
   * Charge de façon asynchrone un maillage statique depuis un fichier JSON JSM.
   *
   * @param path - Chemin du fichier JSM.
   * @returns Une promesse résolue lorsque le maillage est chargé.
   * @throws Si le fichier ne contient pas un maillage JSM valide.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'JSM') {
      throw new Error('Gfx3MeshJSM::loadFromFile(): File not valid !');
    }

    const geo = Gfx3Mesh.buildVertices(json['NumVertices'], json['Vertices'], json['TextureCoords'], json['Colors'], json['Normals']);

    this.beginVertices(json['NumVertices']);
    this.setVertices(geo.vertices);
    this.endVertices();

    this.geo = geo;
  }

  /**
   * Charge de façon asynchrone un maillage statique depuis un fichier binaire BSM.
   *
   * @param path - Chemin du fichier BSM.
   * @returns Une promesse résolue lorsque le maillage est chargé.
   */
  async loadFromBinaryFile(path: string): Promise<void> {
    const response = await fetch(path);
    const buffer = await response.arrayBuffer();
    const data = new Float32Array(buffer);
    let offset = 0;

    const header = new Int32Array(buffer);
    const numVertices = header[0];
    const numTextureCoords = header[1];
    const numNormals = header[2];
    const numColors = header[3];
    offset += 4;

    const vertices = [];
    for (let i = 0; i < numVertices * 3; i++) {
      vertices.push(data[offset]);
      offset++;
    }

    const textureCoords = [];
    for (let i = 0; i < numTextureCoords * 2; i++) {
      textureCoords.push(data[offset]);
      offset++;
    }

    const normals = [];
    for (let i = 0; i < numNormals * 3; i++) {
      normals.push(data[offset]);
      offset++;
    }

    const colors = [];
    for (let i = 0; i < numColors * 3; i++) {
      colors.push(data[offset]);
      offset++;
    }

    const geo = Gfx3Mesh.buildVertices(numVertices, vertices, textureCoords, colors, normals);
    this.beginVertices(numVertices);
    this.setVertices(geo.vertices);
    this.endVertices();
  }

  /**
   * Copie ce maillage statique dans une instance cible.
   *
   * @param jsm - Instance qui reçoit la copie.
   * @param transformMatrix - Matrice de transformation appliquée à la copie.
   * @returns L'instance de maillage statique copiée.
   */
  clone(jsm: Gfx3MeshJSM = new Gfx3MeshJSM(), transformMatrix: mat4 = UT.MAT4_IDENTITY()): Gfx3MeshJSM {
    super.clone(jsm, transformMatrix);
    return jsm;
  }
}