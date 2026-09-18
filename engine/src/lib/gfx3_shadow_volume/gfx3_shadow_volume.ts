import { gfx3DebugRenderer } from '../gfx3/gfx3_debug_renderer';
import { gfx3ShadowVolumeRenderer } from './gfx3_shadow_volume_renderer';
import { Gfx3Drawable } from '../gfx3/gfx3_drawable';
import { SV_SHADER_VERTEX_ATTR_COUNT } from './gfx3_shadow_volume_shader';

/**
 * Représente le maillage 3D d'un volume d'ombre et sa visualisation de débogage.
 */
export class Gfx3ShadowVolume extends Gfx3Drawable {
  debugEnabled: boolean;
  debugVertices: Array<number>;
  debugVertexCount: number;

  /** Initialise un volume d'ombre vide avec le débogage activé. */
  constructor() {
    super(SV_SHADER_VERTEX_ATTR_COUNT);
    this.debugEnabled = true;
    this.debugVertices = [];
    this.debugVertexCount = 0;
  }

  /**
   * Charge les données d'un volume d'ombre depuis un fichier JSON JSV.
   *
   * @param path - Chemin du fichier JSV.
   * @returns Une promesse résolue une fois les données chargées.
   * @throws Si le fichier ne possède pas l'identifiant JSV attendu.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'JSV') {
      throw new Error('Gfx3ShadowVolume::loadFromFile(): File not valid !');
    }

    this.beginVertices(json['NumVertices']);

    for (let i = 0; i < json['NumVertices']; i++) {
      this.defineVertex(
        json['Vertices'][i * 3 + 0],
        json['Vertices'][i * 3 + 1],
        json['Vertices'][i * 3 + 2],
        json['Colors'][i * 3 + 0],
        json['Colors'][i * 3 + 1],
        json['Colors'][i * 3 + 2]
      );
    }

    this.endVertices();
    this.#generateDebugVertices(json['NumVertices'], json['Vertices']);
  }

  /**
   * Charge les données d'un volume d'ombre depuis un fichier binaire BSV.
   *
   * @param path - Chemin du fichier BSV.
   * @returns Une promesse résolue une fois les données chargées.
   */
  async loadFromBinaryFile(path: string): Promise<void> {
    const response = await fetch(path);
    const buffer = await response.arrayBuffer();
    const data = new Float32Array(buffer);
    const dataInt = new Int32Array(buffer);
    let offset = 0;

    const numVertices = dataInt[0];
    offset += 1;

    const vertices = [];
    for (let i = 0; i < numVertices; i++) {
      vertices.push(data[offset + (i * 3) + 0], data[offset + (i * 3) + 1], data[offset + (i * 3) + 2]);
    }

    offset += numVertices * 3;

    const colors = [];
    for (let i = 0; i < numVertices; i++) {
      colors.push(data[offset + (i * 3) + 0], data[offset + (i * 3) + 1], data[offset + (i * 3) + 2]);
    }

    this.beginVertices(numVertices);

    for (let i = 0; i < numVertices; i++) {
      this.defineVertex(
        vertices[i * 3 + 0],
        vertices[i * 3 + 1],
        vertices[i * 3 + 2],
        colors[i * 3 + 0],
        colors[i * 3 + 1],
        colors[i * 3 + 2],
      );
    }

    this.endVertices();
    this.#generateDebugVertices(numVertices, vertices);
  }

  /**
   * Libère les ressources allouées par l'objet.
   *
   * Cette méthode doit être appelée lorsque le volume n'est plus utilisé.
   */
  delete(): void {
    super.delete();
  }

  /** Dessine la géométrie de débogage et ajoute le volume à la prochaine passe de rendu. */
  draw(): void {
    if (this.debugEnabled) {
      gfx3DebugRenderer.drawVertices(this.debugVertices, this.debugVertexCount, this.getTransformMatrix());
    }

    gfx3ShadowVolumeRenderer.drawShadowVolume(this);
  }

  #generateDebugVertices(numVertices: number, vertices: Array<number>): void {
    this.debugVertices = [];
    this.debugVertexCount = 0;

    for (let i = 0; i < numVertices / 3; i++) {
      const v1 = [vertices[i * 9 + 0], vertices[i * 9 + 1], vertices[i * 9 + 2]];
      const v2 = [vertices[i * 9 + 3], vertices[i * 9 + 4], vertices[i * 9 + 5]];
      const v3 = [vertices[i * 9 + 6], vertices[i * 9 + 7], vertices[i * 9 + 8]];
      this.debugVertices.push(v1[0], v1[1], v1[2], 1, 1, 1);
      this.debugVertices.push(v2[0], v2[1], v2[2], 1, 1, 1);
      this.debugVertices.push(v1[0], v1[1], v1[2], 1, 1, 1);
      this.debugVertices.push(v3[0], v3[1], v3[2], 1, 1, 1);
      this.debugVertices.push(v2[0], v2[1], v2[2], 1, 1, 1);
      this.debugVertices.push(v3[0], v3[1], v3[2], 1, 1, 1);
      this.debugVertexCount += 6;
    }
  }
}