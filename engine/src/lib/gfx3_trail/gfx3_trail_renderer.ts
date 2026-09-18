import { gfx3Manager } from '../gfx3/gfx3_manager';
import { UT } from '../core/utils';
import { Gfx3RendererAbstract } from '../gfx3/gfx3_renderer_abstract';
import { Gfx3StaticGroup, Gfx3DynamicGroup } from '../gfx3/gfx3_group';
import { Gfx3RenderingTexture } from '../gfx3/gfx3_texture';
import { Gfx3Trail } from './gfx3_trail';
import { TRAIL_PIPELINE_DESC, TRAIL_VERTEX_SHADER, TRAIL_FRAGMENT_SHADER, TRAIL_SHADER_INSERTS } from './gfx3_trail_shader';

/**
 * Rend les traînées mises en file d'attente au moyen d'une instance partagée.
 */
export class Gfx3TrailRenderer extends Gfx3RendererAbstract {
  trailList: Array<Gfx3Trail>;
  grp0: Gfx3StaticGroup;
  vpcMatrix: Float32Array;
  grp1: Gfx3DynamicGroup;
  tag: Float32Array;

  /** Initialise la pipeline et les groupes de liaison du moteur de rendu des traînées. */
  constructor() {
    super('TRAIL_PIPELINE', TRAIL_VERTEX_SHADER, TRAIL_FRAGMENT_SHADER, TRAIL_PIPELINE_DESC, TRAIL_SHADER_INSERTS);
    this.trailList = [];

    this.grp0 = gfx3Manager.createStaticGroup('TRAIL_PIPELINE', 0);
    this.vpcMatrix = this.grp0.setFloat(0, 'VPC_MATRIX', 16);

    this.grp1 = gfx3Manager.createDynamicGroup('TRAIL_PIPELINE', 1);
    this.tag = this.grp1.setFloat(0, 'TAG', 4);

    this.grp0.allocate();
    this.grp1.allocate();
  }

  /**
   * Rend les traînées en attente, puis vide la file.
   *
   * @param destinationTexture - Texture cible, ou cible de la passe courante si elle est absente.
   */
  render(destinationTexture: Gfx3RenderingTexture | null = null): void {
    const currentView = gfx3Manager.getCurrentView();
    const commandEncoder = gfx3Manager.getCommandEncoder();
    const passEncoder = destinationTexture ? commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: destinationTexture.gpuTextureView,
        loadOp: 'clear',
        storeOp: 'store'
      }]
    }) : gfx3Manager.getPassEncoder();

    const vpcMatrix = currentView.getViewProjectionClipMatrix();
    passEncoder.setPipeline(this.pipeline);

    this.grp0.beginWrite();
    this.grp0.write(0, UT.MAT4_COPY(vpcMatrix, this.vpcMatrix) as Float32Array);
    this.grp0.endWrite();
    passEncoder.setBindGroup(0, this.grp0.getBindGroup());

    if (this.grp1.getSize() < this.trailList.length) {
      this.grp1.allocate(this.trailList.length);
    }

    this.grp1.beginWrite();

    for (let i = 0; i < this.trailList.length; i++) {
      const trail = this.trailList[i];
      if (trail.getVertexCount() === 0) {
        continue;
      }

      this.grp1.write(0, UT.VEC4_COPY(trail.getTag(), this.tag) as Float32Array);
      passEncoder.setBindGroup(1, this.grp1.getBindGroup(i));

      const grp2 = trail.getGroup02();
      passEncoder.setBindGroup(2, grp2.getBindGroup());

      passEncoder.setVertexBuffer(0, gfx3Manager.getVertexBuffer(), trail.getVertexSubBufferOffset(), trail.getVertexSubBufferSize());
      passEncoder.draw(trail.getVertexCount());
    }

    this.grp1.endWrite();
    this.trailList = [];

    if (destinationTexture) {
      passEncoder.end();
    }
  }

  /**
   * Définit les insertions de code des shaders et recharge la pipeline.
   *
   * @param data - Données personnalisées injectées dans le gabarit des shaders.
   */
  setShaderInserts(data: Partial<typeof TRAIL_SHADER_INSERTS> = {}): void {
    super.reload(TRAIL_VERTEX_SHADER, TRAIL_FRAGMENT_SHADER, TRAIL_PIPELINE_DESC, Object.assign(TRAIL_SHADER_INSERTS, data));
    this.grp0.setPipeline(this.pipeline);
    this.grp1.setPipeline(this.pipeline);
    this.grp0.allocate();
    this.grp1.allocate();
  }

  /**
   * Ajoute une traînée à la prochaine passe de rendu.
   *
   * @param trail - Traînée à dessiner.
   */
  drawTrail(trail: Gfx3Trail): void {
    this.trailList.push(trail);
  }
}

/** Instance partagée du moteur de rendu des traînées. */
export const gfx3TrailRenderer = new Gfx3TrailRenderer();