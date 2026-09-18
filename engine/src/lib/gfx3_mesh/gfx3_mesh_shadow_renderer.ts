import { gfx3Manager } from '../gfx3/gfx3_manager';
import { gfx3MeshRenderer } from './gfx3_mesh_renderer';
import { UT } from '../core/utils';
import { Gfx3DynamicGroup } from '../gfx3/gfx3_group';
import { Gfx3RendererAbstract } from '../gfx3/gfx3_renderer_abstract';
import { Gfx3Texture, Gfx3RenderingTexture } from '../gfx3/gfx3_texture';
import { Gfx3Mesh } from './gfx3_mesh';
import { MESH_SHADOW_PIPELINE_DESC, MESH_SHADOW_VERTEX_SHADER } from './gfx3_mesh_shadow_shader';

interface Gfx3MeshShadowCommand {
  mesh: Gfx3Mesh;
  matrix: mat4;
};

/** Centralise le rendu des maillages dans la carte d'ombres. */
export class Gfx3MeshShadowRenderer extends Gfx3RendererAbstract {
  position: vec3;
  target: vec3;
  size: number;
  depth: number;
  depthTextureSize: number;
  depthTexture: Gfx3RenderingTexture;
  meshCommands: Array<Gfx3MeshShadowCommand>;
  grp0: Gfx3DynamicGroup;
  lvpMatrix: Float32Array;
  mMatrix: Float32Array;

  /** Crée le moteur de rendu des ombres et sa texture de profondeur par défaut. */
  constructor() {
    super('MESH_SHADOW_MAP_PIPELINE', MESH_SHADOW_VERTEX_SHADER, () => '', MESH_SHADOW_PIPELINE_DESC);
    this.position = [0, 0, 0];
    this.target = [0, 0, 0];
    this.size = 600;
    this.depth = 200;
    this.depthTextureSize = 2048.0;
    this.depthTexture = gfx3Manager.createRenderingTexture('depth32float', { magFilter: 'nearest', minFilter: 'nearest', compare: 'less' }, this.depthTextureSize, this.depthTextureSize);
    this.meshCommands = [];

    this.grp0 = gfx3Manager.createDynamicGroup('MESH_SHADOW_MAP_PIPELINE', 0);
    this.lvpMatrix = this.grp0.setFloat(0, 'LVP_MATRIX', 16);
    this.mMatrix = this.grp0.setFloat(1, 'M_MATRIX', 16);
  }

  /** Exécute les commandes accumulées dans la carte d'ombres, puis vide la file. */
  render(): void {
    const commandEncoder = gfx3Manager.getCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.depthTexture.gpuTextureView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    passEncoder.setPipeline(this.pipeline);

    if (this.grp0.getSize() < this.meshCommands.length) {
      this.grp0.allocate(this.meshCommands.length);
    }

    this.grp0.beginWrite();

    for (let i = 0; i < this.meshCommands.length; i++) {
      const command = this.meshCommands[i];
      this.grp0.write(0, this.lvpMatrix);
      this.grp0.write(1, UT.MAT4_COPY(command.matrix, this.mMatrix) as Uint32Array);
      passEncoder.setBindGroup(0, this.grp0.getBindGroup(i));
      passEncoder.setVertexBuffer(0, gfx3Manager.getVertexBuffer(), command.mesh.getVertexSubBufferOffset(), command.mesh.getVertexSubBufferSize());
      passEncoder.draw(command.mesh.getVertexCount());
    }

    this.grp0.endWrite();
    this.meshCommands = [];

    passEncoder.end();
  }

  /**
   * Ajoute un maillage à la file de rendu de la carte d'ombres.
   *
   * @param mesh - Maillage à rendre.
   * @param matrix - Matrice de transformation, ou `null` pour utiliser celle du maillage.
   */
  drawMesh(mesh: Gfx3Mesh, matrix: mat4 | null = null): void {
    const meshMatrix = matrix ? matrix : mesh.getTransformMatrix();
    this.meshCommands.push({ mesh: mesh, matrix: meshMatrix });
  }

  /**
   * Configure la projection orthographique de la carte d'ombres.
   *
   * @param position - Position de la source de projection.
   * @param target - Point visé par la projection.
   * @param size - Largeur et hauteur de la projection.
   * @param depth - Profondeur de la projection.
   */
  setShadowProjection(position: vec3, target: vec3, size: number = 600, depth: number = 200): void {
    this.position = position;
    this.target = target;
    this.size = size;
    this.depth = depth;
    this.#computeShadowProjection();
  }

  /**
   * Définit la position de la source de projection des ombres.
   *
   * @param x - Abscisse de la source.
   * @param y - Ordonnée de la source.
   * @param z - Profondeur de la source.
   */
  setShadowPosition(x: number, y: number, z: number): void {
    this.position = [x, y, z];
    this.#computeShadowProjection();
  }

  /**
   * Définit le point visé par la projection des ombres.
   *
   * @param x - Abscisse de la cible.
   * @param y - Ordonnée de la cible.
   * @param z - Profondeur de la cible.
   */
  setShadowTarget(x: number, y: number, z: number): void {
    this.target = [x, y, z];
    this.#computeShadowProjection();
  }

  /**
   * Définit la largeur et la hauteur de la projection des ombres.
   *
   * @param size - Dimension de la projection.
   */
  setShadowSize(size: number): void {
    this.size = size;
    this.#computeShadowProjection();
  }

  /**
   * Définit la profondeur de la projection des ombres.
   *
   * @param depth - Profondeur de la projection.
   */
  setShadowDepth(depth: number): void {
    this.depth = depth;
    this.#computeShadowProjection();
  }

  /**
   * Recrée la texture de profondeur carrée de la carte d'ombres.
   *
   * Une résolution supérieure produit des contours d'ombre plus précis au prix de davantage de mémoire.
   *
   * @param depthTextureSize - Largeur et hauteur, en pixels, de la texture.
   */
  setDepthTextureSize(depthTextureSize: number): void {
    this.depthTexture = gfx3Manager.createRenderingTexture('depth32float', { magFilter: 'nearest', minFilter: 'nearest', compare: 'less' }, depthTextureSize, depthTextureSize);
    this.depthTextureSize = depthTextureSize;
    gfx3MeshRenderer.setShadowMap(this.depthTexture);
  }

  /** Renvoie la texture de profondeur de la carte d'ombres. */
  getDepthTexture(): Gfx3Texture {
    return this.depthTexture;
  }

  /** Renvoie la matrice de vue-projection de la source lumineuse. */
  getLVPMatrix(): Float32Array {
    return this.lvpMatrix;
  }

  /** Recalcule la matrice de projection de la carte d'ombres. */
  #computeShadowProjection(): void {
    const lightProjectionMatrix = UT.MAT4_ORTHOGRAPHIC(this.size, this.size, this.depth);
    const lightViewMatrix = UT.MAT4_INVERT(UT.MAT4_LOOKAT(this.position, this.target, [0, 1, 0]));
    UT.MAT4_MULTIPLY(lightProjectionMatrix, lightViewMatrix, this.lvpMatrix);
  }
}

/** Instance partagée du moteur de rendu de la carte d'ombres. */
export const gfx3MeshShadowRenderer = new Gfx3MeshShadowRenderer();