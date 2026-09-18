import { coreManager } from '../core/core_manager';
import { eventManager } from '../core/event_manager';
import { gfx3Manager } from '../gfx3/gfx3_manager';
import { UT } from '../core/utils';
import { Gfx3DynamicGroup } from '../gfx3/gfx3_group';
import { Gfx3RenderingTexture } from '../gfx3/gfx3_texture';
import { SV_VERTEX_SHADER, SV_FRAGMENT_SHADER, SV_PIPELINE_CW_DESC, SV_PIPELINE_CCW_DESC } from './gfx3_shadow_volume_shader';
import { Gfx3ShadowVolume } from './gfx3_shadow_volume';

/** Ressources GPU associées à une orientation de faces des volumes d'ombre. */
export interface ShadowVolumePipeline {
  gpu: GPURenderPipeline;
  grp0: Gfx3DynamicGroup;
  shadowTexture: Gfx3RenderingTexture;
  depthTexture: Gfx3RenderingTexture;
};

/**
 * Rend les volumes d'ombre selon les orientations horaire et antihoraire.
 */
export class Gfx3ShadowVolumeRenderer {
  pipelineCW: ShadowVolumePipeline;
  pipelineCCW: ShadowVolumePipeline;
  shadowVolumes: Array<Gfx3ShadowVolume>;
  mvpcMatrix: Float32Array;

  /** Initialise les deux pipelines et leurs textures de rendu. */
  constructor() {
    this.pipelineCW = {
      gpu: gfx3Manager.loadPipeline('SHADOW_VOLUME_CW_PIPELINE', SV_VERTEX_SHADER, SV_FRAGMENT_SHADER, SV_PIPELINE_CW_DESC),
      grp0: gfx3Manager.createDynamicGroup('SHADOW_VOLUME_CW_PIPELINE', 0),
      shadowTexture: gfx3Manager.createRenderingTexture('rgba16float'),
      depthTexture: gfx3Manager.createRenderingTexture('depth24plus')
    };

    this.pipelineCCW = {
      gpu: gfx3Manager.loadPipeline('SHADOW_VOLUME_CCW_PIPELINE', SV_VERTEX_SHADER, SV_FRAGMENT_SHADER, SV_PIPELINE_CCW_DESC),
      grp0: gfx3Manager.createDynamicGroup('SHADOW_VOLUME_CCW_PIPELINE', 0),
      shadowTexture: gfx3Manager.createRenderingTexture('rgba16float'),
      depthTexture: gfx3Manager.createRenderingTexture('depth24plus')
    };

    this.shadowVolumes = [];
    this.mvpcMatrix = this.pipelineCW.grp0.setFloat(0, 'MVPC_MATRIX', 16);
    this.mvpcMatrix = this.pipelineCCW.grp0.setFloat(0, 'MVPC_MATRIX', 16);

    this.pipelineCW.grp0.allocate();
    this.pipelineCCW.grp0.allocate();

    eventManager.subscribe(coreManager, 'E_RESIZE', this, this.#handleWindowResize);
  }

  /**
   * Rend les volumes d'ombre en attente dans les deux pipelines, puis vide la file.
   */
  render(): void {
    this.#renderPipeline(this.pipelineCW);
    this.#renderPipeline(this.pipelineCCW);
    this.shadowVolumes = [];
  }

  /**
   * Ajoute un volume d'ombre à la prochaine passe de rendu.
   *
   * @param sv - Volume d'ombre à dessiner.
   */
  drawShadowVolume(sv: Gfx3ShadowVolume): void {
    this.shadowVolumes.push(sv);
  }

  /**
   * Obtient la texture d'ombre produite pour les faces antihoraires.
   *
   * @returns La texture d'ombre.
   */
  getShadowTexture(): Gfx3RenderingTexture {
    return this.pipelineCCW.shadowTexture;
  }

  /**
   * Obtient la texture de profondeur des faces horaires.
   *
   * @returns La texture de profondeur correspondante.
   */
  getDepthCWTexture(): Gfx3RenderingTexture {
    return this.pipelineCW.depthTexture;
  }

  /**
   * Obtient la texture de profondeur des faces antihoraires.
   *
   * @returns La texture de profondeur correspondante.
   */
  getDepthCCWTexture(): Gfx3RenderingTexture {
    return this.pipelineCCW.depthTexture;
  }

  #renderPipeline(pipeline: ShadowVolumePipeline): void {
    const currentView = gfx3Manager.getCurrentView();
    const commandEncoder = gfx3Manager.getCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: pipeline.shadowTexture.gpuTextureView,
        clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }],
      depthStencilAttachment: {
        view: pipeline.depthTexture.gpuTextureView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    const vpcMatrix = currentView.getViewProjectionClipMatrix();
    passEncoder.setPipeline(pipeline.gpu);

    if (pipeline.grp0.getSize() < this.shadowVolumes.length) {
      pipeline.grp0.allocate(this.shadowVolumes.length);
    }

    pipeline.grp0.beginWrite();

    for (let i = 0; i < this.shadowVolumes.length; i++) {
      const sv = this.shadowVolumes[i];
      UT.MAT4_MULTIPLY(vpcMatrix, sv.getTransformMatrix(), this.mvpcMatrix);
      pipeline.grp0.write(0, this.mvpcMatrix);
      passEncoder.setBindGroup(0, pipeline.grp0.getBindGroup(i));
      passEncoder.setVertexBuffer(0, gfx3Manager.getVertexBuffer(), sv.getVertexSubBufferOffset(), sv.getVertexSubBufferSize());
      passEncoder.draw(sv.getVertexCount());
    }

    pipeline.grp0.endWrite();
    passEncoder.end();
  }

  #handleWindowResize(): void {
    this.pipelineCCW.shadowTexture.gpuTexture.destroy();
    this.pipelineCCW.shadowTexture = gfx3Manager.createRenderingTexture('rgba16float');
    this.pipelineCCW.depthTexture.gpuTexture.destroy();
    this.pipelineCCW.depthTexture = gfx3Manager.createRenderingTexture('depth24plus');

    this.pipelineCW.shadowTexture.gpuTexture.destroy();
    this.pipelineCW.shadowTexture = gfx3Manager.createRenderingTexture('rgba16float');
    this.pipelineCW.depthTexture.gpuTexture.destroy();
    this.pipelineCW.depthTexture = gfx3Manager.createRenderingTexture('depth24plus');
  }
}

/** Instance partagée du moteur de rendu des volumes d'ombre. */
export const gfx3ShadowVolumeRenderer = new Gfx3ShadowVolumeRenderer();