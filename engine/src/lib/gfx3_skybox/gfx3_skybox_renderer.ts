import { gfx3Manager } from '../gfx3/gfx3_manager';
import { UT } from '../core/utils';
import { Gfx3RendererAbstract } from '../gfx3/gfx3_renderer_abstract';
import { Gfx3StaticGroup } from '../gfx3/gfx3_group';
import { Gfx3RenderingTexture } from '../gfx3/gfx3_texture';
import { Gfx3Skybox } from './gfx3_skybox';
import { SKYBOX_PIPELINE_DESC, SKYBOX_VERTEX_SHADER, SKYBOX_FRAGMENT_SHADER, SKYBOX_SHADER_INSERTS } from './gfx3_skybox_shader';

/**
 * Rend une boîte céleste au moyen d'une instance partagée.
 */
export class Gfx3SkyboxRenderer extends Gfx3RendererAbstract {
  skybox: Gfx3Skybox | null;
  grp0: Gfx3StaticGroup;
  vpcInverseMatrix: Float32Array;
  tag: Float32Array;

  /** Initialise la pipeline et le groupe de liaison de la boîte céleste. */
  constructor() {
    super('SKYBOX_PIPELINE', SKYBOX_VERTEX_SHADER, SKYBOX_FRAGMENT_SHADER, SKYBOX_PIPELINE_DESC, { ...SKYBOX_SHADER_INSERTS });
    this.skybox = null;
    this.grp0 = gfx3Manager.createStaticGroup('SKYBOX_PIPELINE', 0);
    this.vpcInverseMatrix = this.grp0.setFloat(0, 'VPC_INVERSE_MATRIX', 16);
    this.tag = this.grp0.setFloat(1, 'TAG', 4);
    this.grp0.allocate();
  }

  /**
   * Rend la boîte céleste courante si elle est définie.
   *
   * @param destinationTexture - Texture cible, ou cible de la passe courante si elle est absente.
   */
  render(destinationTexture: Gfx3RenderingTexture | null = null): void {
    if (!this.skybox) {
      return;
    }

    const currentView = gfx3Manager.getCurrentView();
    const commandEncoder = gfx3Manager.getCommandEncoder();
    const passEncoder = destinationTexture ? commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: destinationTexture.gpuTextureView,
        loadOp: 'clear',
        storeOp: 'store'
      }]
    }) : gfx3Manager.getPassEncoder();

    passEncoder.setPipeline(this.pipeline);

    const viewMatrix = new Float32Array(currentView.getCameraViewMatrix());
    viewMatrix[12] = viewMatrix[13] = viewMatrix[14] = 0;
    const vpcMatrix = UT.MAT4_MULTIPLY(currentView.getProjectionClipMatrix(), viewMatrix);

    this.grp0.beginWrite();
    this.grp0.write(0, UT.MAT4_INVERT(vpcMatrix, this.vpcInverseMatrix) as Float32Array);
    this.grp0.write(1, UT.VEC4_COPY(this.skybox.getTag(), this.tag) as Float32Array);
    this.grp0.endWrite();
    passEncoder.setBindGroup(0, this.grp0.getBindGroup());

    const grp1 = this.skybox.getGroup01();
    passEncoder.setBindGroup(1, grp1.getBindGroup());

    passEncoder.setVertexBuffer(0, gfx3Manager.getVertexBuffer(), this.skybox.getVertexSubBufferOffset(), this.skybox.getVertexSubBufferSize());
    passEncoder.draw(this.skybox.getVertexCount());

    if (destinationTexture) {
      passEncoder.end();
    }
  }

  /**
   * Définit les insertions de code des shaders et recharge la pipeline.
   *
   * @param data - Données personnalisées injectées dans le gabarit des shaders.
   */
  setShaderInserts(data: Partial<typeof SKYBOX_SHADER_INSERTS> = {}): void {
    super.reload(SKYBOX_VERTEX_SHADER, SKYBOX_FRAGMENT_SHADER, SKYBOX_PIPELINE_DESC, Object.assign(SKYBOX_SHADER_INSERTS, data));
    this.grp0.setPipeline(this.pipeline);
    this.grp0.allocate();
  }

  /**
   * Définit la boîte céleste à dessiner lors de la prochaine passe.
   *
   * @param skybox - Boîte céleste à dessiner.
   */
  draw(skybox: Gfx3Skybox): void {
    this.skybox = skybox;
  }
}

/** Instance partagée du moteur de rendu de la boîte céleste. */
export const gfx3SkyboxRenderer = new Gfx3SkyboxRenderer();