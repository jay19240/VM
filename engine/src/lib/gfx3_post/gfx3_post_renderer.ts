import { coreManager } from '../core/core_manager';
import { em } from '../engine/engine_manager';
import { eventManager } from '../core/event_manager';
import { gfx3Manager } from '../gfx3/gfx3_manager';
import { gfx3ShadowVolumeRenderer } from '../gfx3_shadow_volume/gfx3_shadow_volume_renderer';
import { Gfx3RendererAbstract } from '../gfx3/gfx3_renderer_abstract';
import { Gfx3StaticGroup } from '../gfx3/gfx3_group';
import { Gfx3Texture, Gfx3RenderingTexture } from '../gfx3/gfx3_texture';
import { POST_VERTEX_SHADER, POST_FRAGMENT_SHADER, POST_PIPELINE_DESC, POST_SHADER_VERTEX_ATTR_COUNT, POST_CUSTOM_PARAMS, POST_SHADER_INSERTS, Gfx3PostParam } from './gfx3_post_shader';
import { POST_MIDDLE_FRAGMENT_SHADER, POST_MIDDLE_PIPELINE_DESC, Gfx3PostMiddleParam } from './gfx3_post_shader';
import { POST_FINAL_FRAGMENT_SHADER, POST_FINAL_PIPELINE_DESC, Gfx3PostFinalParam } from './gfx3_post_shader';

/** Modes de composition des ombres volumétriques avec la couleur de la scène. */
export enum Gfx3PostShadowVolumeBlendMode {
  MUL = 0,
  ADD = 1
};

/** Moteur de rendu singleton qui enchaîne jusqu'à trois passes de post-traitement plein écran. */
export class Gfx3PostRenderer extends Gfx3RendererAbstract {
  device: GPUDevice;
  vertexBuffer: GPUBuffer;
  grp0: Gfx3StaticGroup;
  params: Float32Array;
  infos: Float32Array;
  sourceTexture: Gfx3RenderingTexture;
  normalsTexture: Gfx3RenderingTexture;
  tagsTexture: Gfx3RenderingTexture;
  depthTexture: Gfx3RenderingTexture;
  channel1Texture: Gfx3RenderingTexture;
  grp1: Gfx3StaticGroup;
  shadowVolFactorTexture: Gfx3RenderingTexture;
  shadowVolDepthCWTexture: Gfx3RenderingTexture;
  shadowVolDepthCCWTexture: Gfx3RenderingTexture;
  grp2: Gfx3StaticGroup;
  s0Texture: Gfx3Texture;
  s1Texture: Gfx3Texture;
  // ---------------------------------------------------------------------
  middleEnabled: boolean;
  middlePipeline: GPURenderPipeline;
  middleGrp0: Gfx3StaticGroup;
  middleSourceTexture: Gfx3RenderingTexture;
  middleBrightnessTexture: Gfx3RenderingTexture;
  middleParams: Float32Array;
  // ---------------------------------------------------------------------
  finalEnabled: boolean;
  finalPipeline: GPURenderPipeline;
  finalGrp0: Gfx3StaticGroup;
  finalSourceTexture: Gfx3RenderingTexture;
  finalParams: Float32Array;

  /** Initialise les pipelines, paramètres, textures intermédiaires et groupes de liaison des trois passes. */
  constructor() {
    super('POST_PIPELINE', POST_VERTEX_SHADER, POST_FRAGMENT_SHADER, POST_PIPELINE_DESC, { ...POST_CUSTOM_PARAMS, ...POST_SHADER_INSERTS });
    this.device = gfx3Manager.getDevice();
    this.vertexBuffer = this.device.createBuffer({ size: 6 * POST_SHADER_VERTEX_ATTR_COUNT * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });

    this.grp0 = gfx3Manager.createStaticGroup('POST_PIPELINE', 0);
    this.params = this.grp0.setFloat(0, 'PARAMS', Gfx3PostParam.COUNT + 16);
    this.params[Gfx3PostParam.ENABLED] = 1.0;
    this.params[Gfx3PostParam.PIXELATION_ENABLED] = 0.0;
    this.params[Gfx3PostParam.PIXELATION_WIDTH] = 400.0;
    this.params[Gfx3PostParam.PIXELATION_HEIGHT] = 400.0;
    this.params[Gfx3PostParam.COLOR_ENABLED] = 0.0;
    this.params[Gfx3PostParam.COLOR_PRECISION] = 32.0;
    this.params[Gfx3PostParam.DITHER_ENABLED] = 0.0;
    this.params[Gfx3PostParam.DITHER_PATTERN_INDEX] = 0.0;
    this.params[Gfx3PostParam.DITHER_THRESHOLD] = 1.0;
    this.params[Gfx3PostParam.DITHER_SCALE_X] = 1.0;
    this.params[Gfx3PostParam.DITHER_SCALE_Y] = 1.0;
    this.params[Gfx3PostParam.OUTLINE_ENABLED] = 0.0;
    this.params[Gfx3PostParam.OUTLINE_THICKNESS] = 120.0;
    this.params[Gfx3PostParam.OUTLINE_R] = 0.0;
    this.params[Gfx3PostParam.OUTLINE_G] = 0.0;
    this.params[Gfx3PostParam.OUTLINE_B] = 0.0;
    this.params[Gfx3PostParam.OUTLINE_CONSTANT] = 0.0;
    this.params[Gfx3PostParam.SHADOW_VOLUME_ENABLED] = 1.0;
    this.params[Gfx3PostParam.SHADOW_VOLUME_BLEND_MODE] = Gfx3PostShadowVolumeBlendMode.MUL;
    this.params[Gfx3PostParam.BRIGHTNESS_ENABLED] = 0.0;
    this.params[Gfx3PostParam.BRIGHTNESS_THRESHOLD] = 0.8;
    this.infos = this.grp0.setFloat(1, 'INFOS', 6);
    this.sourceTexture = this.grp0.setRenderingTexture(2, 'SOURCE_TEXTURE', gfx3Manager.createRenderingTexture());
    this.sourceTexture = this.grp0.setRenderingSampler(3, 'SOURCE_SAMPLER', this.sourceTexture);
    this.normalsTexture = this.grp0.setRenderingTexture(4, 'NORMALS_TEXTURE', gfx3Manager.getNormalsTexture());
    this.normalsTexture = this.grp0.setRenderingSampler(5, 'NORMALS_SAMPLER', this.normalsTexture);
    this.tagsTexture = this.grp0.setRenderingTexture(6, 'TAGS_TEXTURE', gfx3Manager.getTagsTexture());
    this.tagsTexture = this.grp0.setRenderingSampler(7, 'TAGS_SAMPLER', this.tagsTexture);
    this.depthTexture = this.grp0.setRenderingTexture(8, 'DEPTH_TEXTURE', gfx3Manager.getDepthTexture());
    this.channel1Texture = this.grp0.setRenderingTexture(9, 'CHANNEL1_TEXTURE', gfx3Manager.getChannel1Texture());
    this.channel1Texture = this.grp0.setRenderingSampler(10, 'CHANNEL1_SAMPLER', this.channel1Texture);
    this.grp0.allocate();

    this.grp1 = gfx3Manager.createStaticGroup('POST_PIPELINE', 1);
    this.shadowVolFactorTexture = this.grp1.setRenderingTexture(0, 'SHADOW_VOL_TEXTURE', gfx3ShadowVolumeRenderer.getShadowTexture());
    this.shadowVolFactorTexture = this.grp1.setRenderingSampler(1, 'SHADOW_VOL_SAMPLER', this.shadowVolFactorTexture);
    this.shadowVolDepthCCWTexture = this.grp1.setRenderingTexture(2, 'SHADOW_VOL_DEPTH_CCW_TEXTURE', gfx3ShadowVolumeRenderer.getDepthCCWTexture());
    this.shadowVolDepthCWTexture = this.grp1.setRenderingTexture(3, 'SHADOW_VOL_DEPTH_CW_TEXTURE', gfx3ShadowVolumeRenderer.getDepthCWTexture());
    this.grp1.allocate();

    this.grp2 = gfx3Manager.createStaticGroup('POST_PIPELINE', 2);
    this.s0Texture = this.grp2.setTexture(0, 'S0_TEXTURE', gfx3Manager.createTextureFromBitmap());
    this.s0Texture = this.grp2.setSampler(1, 'S0_SAMPLER', this.s0Texture);
    this.s1Texture = this.grp2.setTexture(2, 'S1_TEXTURE', gfx3Manager.createTextureFromBitmap());
    this.s1Texture = this.grp2.setSampler(3, 'S1_SAMPLER', this.s1Texture);
    this.grp2.allocate();

    this.device.queue.writeBuffer(this.vertexBuffer, 0, new Float32Array([
      -1.0, 1.0, 0.0, 0.0, // first tri -> top left
      1.0, 1.0, 1.0, 0.0, // first tri -> top right
      -1.0, -1.0, 0.0, 1.0, // first tri -> bottom left
      -1.0, -1.0, 0.0, 1.0, // second tri -> bottom left
      1.0, 1.0, 1.0, 0.0, // second tri -> top right
      1.0, -1.0, 1.0, 1.0 // second tri -> bottom right
    ]));

    // -----------------------------------------------------------------------------------------------------------------
    // MIDDLE ----------------------------------------------------------------------------------------------------------
    // -----------------------------------------------------------------------------------------------------------------

    this.middleEnabled = false;
    this.middlePipeline = gfx3Manager.loadPipeline('POST_MIDDLE_PIPELINE', POST_VERTEX_SHADER({}), POST_MIDDLE_FRAGMENT_SHADER({}), POST_MIDDLE_PIPELINE_DESC);
    this.middleSourceTexture = gfx3Manager.createRenderingTexture();
    this.middleBrightnessTexture = gfx3Manager.createRenderingTexture('rgba16float', { magFilter: 'linear', minFilter: 'linear' });

    this.middleGrp0 = gfx3Manager.createStaticGroup('POST_MIDDLE_PIPELINE', 0);
    this.middleParams = this.middleGrp0.setFloat(0, 'PARAMS', Gfx3PostMiddleParam.COUNT);
    this.middleParams[Gfx3PostMiddleParam.BLOOM_ENABLED] = 0.0;
    this.middleParams[Gfx3PostMiddleParam.BLOOM_INTENSITY] = 1.0;
    this.middleParams[Gfx3PostMiddleParam.BLOOM_RADIUS] = 2.0;
    this.middleGrp0.setRenderingTexture(1, 'SOURCE_TEXTURE', this.middleSourceTexture);
    this.middleGrp0.setRenderingSampler(2, 'SOURCE_SAMPLER', this.middleSourceTexture);
    this.middleGrp0.setRenderingTexture(3, 'BRIGHTNESS_TEXTURE', this.middleBrightnessTexture);
    this.middleGrp0.setRenderingSampler(4, 'BRIGHTNESS_SAMPLER', this.middleBrightnessTexture);
    this.middleGrp0.allocate();

    // -----------------------------------------------------------------------------------------------------------------
    // FINAL -----------------------------------------------------------------------------------------------------------
    // -----------------------------------------------------------------------------------------------------------------

    this.finalEnabled = false;
    this.finalPipeline = gfx3Manager.loadPipeline('POST_FINAL_PIPELINE', POST_VERTEX_SHADER({}), POST_FINAL_FRAGMENT_SHADER({}), POST_FINAL_PIPELINE_DESC);
    this.finalSourceTexture = gfx3Manager.createRenderingTexture();

    this.finalGrp0 = gfx3Manager.createStaticGroup('POST_FINAL_PIPELINE', 0);
    this.finalParams = this.finalGrp0.setFloat(0, 'PARAMS', Gfx3PostFinalParam.COUNT);
    this.finalParams[Gfx3PostFinalParam.RADIALBLUR_ENABLED] = 0.0;
    this.finalParams[Gfx3PostFinalParam.RADIALBLUR_STRENGTH] = 0.1;
    this.finalParams[Gfx3PostFinalParam.RADIALBLUR_SAMPLES] = 6.0;
    this.finalParams[Gfx3PostFinalParam.RADIALBLUR_CENTER_X] = 0.5;
    this.finalParams[Gfx3PostFinalParam.RADIALBLUR_CENTER_Y] = 0.5;
    this.finalParams[Gfx3PostFinalParam.HDR_ENABLED] = 0.0;
    this.finalParams[Gfx3PostFinalParam.HDR_EXPOSURE] = 1.0;
    this.finalParams[Gfx3PostFinalParam.HDR_GAMMA] = 2.2;

    this.finalGrp0.setRenderingTexture(1, 'FINAL_SOURCE_TEXTURE', this.finalSourceTexture);
    this.finalGrp0.setRenderingSampler(2, 'FINAL_SOURCE_SAMPLER', this.finalSourceTexture);
    this.finalGrp0.allocate();

    eventManager.subscribe(coreManager, 'E_RESIZE', this, this.#handleWindowResize);
  }

  /**
   * Exécute les passes activées et écrit le résultat dans la texture de destination.
   *
   * @param ts - Durée écoulée depuis l'image précédente, transmise au shader.
   * @param destinationTexture - Texture qui reçoit le résultat final.
   */
  render(ts: number, destinationTexture: Gfx3RenderingTexture): void {
    const firstPassView = this.middleEnabled
      ? this.middleSourceTexture.gpuTextureView
      : (this.finalEnabled ? this.finalSourceTexture.gpuTextureView : destinationTexture.gpuTextureView);

    const currentView = gfx3Manager.getCurrentView();
    const commandEncoder = gfx3Manager.getCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: firstPassView,
        loadOp: 'clear',
        storeOp: 'store'
      }, {
        view: this.middleBrightnessTexture.gpuTextureView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    const vpSize = currentView.getViewportSize();
    this.infos[0] = vpSize[0];
    this.infos[1] = vpSize[1];
    this.infos[2] = currentView.getPerspectiveNear();
    this.infos[3] = currentView.getPerspectiveFar();
    this.infos[4] = ts;
    this.infos[5] = em.getTimeStamp();

    passEncoder.setPipeline(this.pipeline);
    this.grp0.beginWrite();
    this.grp0.write(0, this.params);
    this.grp0.write(1, this.infos);
    this.grp0.endWrite();
    passEncoder.setBindGroup(0, this.grp0.getBindGroup());
    passEncoder.setBindGroup(1, this.grp1.getBindGroup());
    passEncoder.setBindGroup(2, this.grp2.getBindGroup());
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.draw(6);
    passEncoder.end();

    if (this.middleEnabled) {
      const bloomDestView = this.finalEnabled ? this.finalSourceTexture.gpuTextureView : destinationTexture.gpuTextureView;
      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: bloomDestView,
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });

      passEncoder.setPipeline(this.middlePipeline);
      this.middleGrp0.beginWrite();
      this.middleGrp0.write(0, this.middleParams);
      this.middleGrp0.endWrite();
      passEncoder.setBindGroup(0, this.middleGrp0.getBindGroup());
      passEncoder.setVertexBuffer(0, this.vertexBuffer);
      passEncoder.draw(6);
      passEncoder.end();
    }

    if (this.finalEnabled) {
      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: destinationTexture.gpuTextureView,
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });

      passEncoder.setPipeline(this.finalPipeline);
      this.finalGrp0.beginWrite();
      this.finalGrp0.write(0, this.finalParams);
      this.finalGrp0.endWrite();
      passEncoder.setBindGroup(0, this.finalGrp0.getBindGroup());
      passEncoder.setVertexBuffer(0, this.vertexBuffer);
      passEncoder.draw(6);
      passEncoder.end();
    }
  }

  /**
   * Modifie les fragments de code injectés dans le shader principal, puis recharge sa pipeline.
   *
   * @param data - Code associé aux points d'insertion à remplacer.
   */
  setShaderInserts(data: Partial<typeof POST_SHADER_INSERTS> = {}): void {
    Object.assign(POST_SHADER_INSERTS, data);
    super.reload(POST_VERTEX_SHADER, POST_FRAGMENT_SHADER, POST_PIPELINE_DESC, { ...POST_CUSTOM_PARAMS, ...POST_SHADER_INSERTS });
    this.grp0.setPipeline(this.pipeline);
    this.grp1.setPipeline(this.pipeline);
    this.grp2.setPipeline(this.pipeline);
    this.grp0.allocate();
    this.grp1.allocate();
    this.grp2.allocate();
  }

  /**
   * Renomme les paramètres personnalisés du shader principal, puis recharge sa pipeline.
   *
   * @param data - Correspondance partielle des noms de paramètres.
   */
  setParamsVars(data: Partial<typeof POST_CUSTOM_PARAMS> = {}): void {
    Object.assign(POST_CUSTOM_PARAMS, data);
    super.reload(POST_VERTEX_SHADER, POST_FRAGMENT_SHADER, POST_PIPELINE_DESC, { ...POST_CUSTOM_PARAMS, ...POST_SHADER_INSERTS });
    this.grp0.setPipeline(this.pipeline);
    this.grp1.setPipeline(this.pipeline);
    this.grp2.setPipeline(this.pipeline);
    this.grp0.allocate();
    this.grp1.allocate();
    this.grp2.allocate();
  }

  /**
   * Active ou désactive chacune des trois passes de post-traitement.
   *
   * @param firstPassEnabled - État de la passe principale.
   * @param middlePassEnabled - État de la passe intermédiaire de bloom.
   * @param finalPassEnabled - État de la passe finale.
   */
  enable(firstPassEnabled: boolean, middlePassEnabled: boolean, finalPassEnabled: boolean): void {
    this.params[Gfx3PostParam.ENABLED] = firstPassEnabled ? 1.0 : 0.0;
    this.middleEnabled = middlePassEnabled;
    this.finalEnabled = finalPassEnabled;
  }

  /**
   * Définit un paramètre de la passe principale.
   *
   * @param index - Indice du paramètre.
   * @param value - Nouvelle valeur.
   */
  setParam(index: Gfx3PostParam, value: number): void {
    this.params[index] = value;
  }

  /**
   * Définit un paramètre de la passe intermédiaire.
   *
   * @param index - Indice du paramètre.
   * @param value - Nouvelle valeur.
   */
  setMiddleParam(index: Gfx3PostMiddleParam, value: number): void {
    this.middleParams[index] = value;
  }

  /**
   * Définit un paramètre de la passe finale.
   *
   * @param index - Indice du paramètre.
   * @param value - Nouvelle valeur.
   */
  setFinalParam(index: Gfx3PostFinalParam, value: number): void {
    this.finalParams[index] = value;
  }

  /**
   * Renvoie un paramètre de la passe principale.
   *
   * @param index - Indice du paramètre.
   * @returns Sa valeur courante.
   */
  getParam(index: Gfx3PostParam): number {
    return this.params[index];
  }

  /**
   * Renvoie un paramètre de la passe intermédiaire.
   *
   * @param index - Indice du paramètre.
   * @returns Sa valeur courante.
   */
  getMiddleParam(index: Gfx3PostMiddleParam): number {
    return this.middleParams[index];
  }

  /**
   * Renvoie un paramètre de la passe finale.
   *
   * @param index - Indice du paramètre.
   * @returns Sa valeur courante.
   */
  getFinalParam(index: Gfx3PostFinalParam): number {
    return this.finalParams[index];
  }

  /**
   * Définit la valeur d'un paramètre personnalisé de la passe principale.
   *
   * @param name - Nom injecté du paramètre.
   * @param value - Nouvelle valeur.
   * @throws Une erreur si le nom n'est pas déclaré dans `POST_CUSTOM_PARAMS`.
   */
  setCustomParamValue(name: string, value: number): void {
    const paramIndex = Object.values(POST_CUSTOM_PARAMS).findIndex(n => n == name);
    if (paramIndex == -1) {
      throw new Error('Gfx3PostRenderer::setCustomParamValue(): Custom param name not found !');
    }

    this.params[Gfx3PostParam.COUNT + paramIndex] = value;
  }

  /**
   * Renvoie la valeur d'un paramètre personnalisé de la passe principale.
   *
   * @param name - Nom injecté du paramètre.
   * @returns Sa valeur courante.
   * @throws Une erreur si le nom n'est pas déclaré dans `POST_CUSTOM_PARAMS`.
   */
  getCustomParamValue(name: string): number {
    const paramIndex = Object.values(POST_CUSTOM_PARAMS).findIndex(n => n == name);
    if (paramIndex == -1) {
      throw new Error('Gfx3PostRenderer::getCustomParamValue(): Custom param name not found !');
    }

    return this.params[Gfx3PostParam.COUNT + paramIndex];
  }

  /**
   * Affecte jusqu'à deux textures personnalisées au shader principal.
   *
   * @param textures - Textures facultatives indexées par 0 et 1.
   */
  setCustomTextures(textures: { 0?: Gfx3Texture, 1?: Gfx3Texture }): void {
    if (textures[0]) {
      this.s0Texture = this.grp2.setTexture(0, 'S0_TEXTURE', textures[0]);
    }

    if (textures[1]) {
      this.s1Texture = this.grp2.setTexture(2, 'S1_TEXTURE', textures[1]);
    }

    this.grp2.allocate();
  }

  /**
   * Renvoie la texture intermédiaire dans laquelle une passe précédente peut rendre sa sortie.
   * Elle permet d'enchaîner plusieurs effets.
   *
   * @returns La texture source gérée par ce moteur.
   */
  getSourceTexture(): Gfx3RenderingTexture {
    return this.sourceTexture;
  }

  /**
   * Remplace la texture source, détruit l'ancienne et recrée les liaisons correspondantes.
   *
   * @param sourceTexture - Nouvelle texture source de rendu.
   */
  setSourceTexture(sourceTexture: Gfx3RenderingTexture): void {
    this.sourceTexture.gpuTexture.destroy();
    this.sourceTexture = this.grp0.setRenderingTexture(2, 'SOURCE_TEXTURE', sourceTexture);
    this.sourceTexture = this.grp0.setRenderingSampler(3, 'SOURCE_SAMPLER', this.sourceTexture);
    this.grp0.allocate();
  }

  #handleWindowResize(): void {
    this.infos[0] = gfx3Manager.getWidth();
    this.infos[1] = gfx3Manager.getHeight();

    this.sourceTexture.gpuTexture.destroy();
    this.sourceTexture = this.grp0.setRenderingTexture(2, 'SOURCE_TEXTURE', gfx3Manager.createRenderingTexture());
    this.normalsTexture = this.grp0.setRenderingTexture(4, 'NORMALS_TEXTURE', gfx3Manager.getNormalsTexture());
    this.tagsTexture = this.grp0.setRenderingTexture(6, 'TAGS_TEXTURE', gfx3Manager.getTagsTexture());
    this.depthTexture = this.grp0.setRenderingTexture(8, 'DEPTH_TEXTURE', gfx3Manager.getDepthTexture());
    this.channel1Texture = this.grp0.setRenderingTexture(9, 'CHANNEL1_TEXTURE', gfx3Manager.getChannel1Texture());
    this.grp0.allocate();

    this.shadowVolFactorTexture = this.grp1.setRenderingTexture(0, 'SHADOW_VOL_TEXTURE', gfx3ShadowVolumeRenderer.getShadowTexture());
    this.shadowVolDepthCCWTexture = this.grp1.setRenderingTexture(2, 'SHADOW_VOL_DEPTH_CCW_TEXTURE', gfx3ShadowVolumeRenderer.getDepthCCWTexture());
    this.shadowVolDepthCWTexture = this.grp1.setRenderingTexture(3, 'SHADOW_VOL_DEPTH_CW_TEXTURE', gfx3ShadowVolumeRenderer.getDepthCWTexture());
    this.grp1.allocate();

    this.middleSourceTexture.gpuTexture.destroy();
    this.middleSourceTexture = this.middleGrp0.setRenderingTexture(1, 'SOURCE_TEXTURE', gfx3Manager.createRenderingTexture());
    this.middleBrightnessTexture.gpuTexture.destroy();
    this.middleBrightnessTexture = this.middleGrp0.setRenderingTexture(3, 'BRIGHTNESS_TEXTURE', this.middleBrightnessTexture = gfx3Manager.createRenderingTexture('rgba16float', { magFilter: 'linear', minFilter: 'linear' }));
    this.middleGrp0.allocate();

    this.finalSourceTexture.gpuTexture.destroy();
    this.finalSourceTexture = this.finalGrp0.setRenderingTexture(1, 'FINAL_SOURCE_TEXTURE', gfx3Manager.createRenderingTexture());
    this.finalGrp0.allocate();
  }
}

/** Instance partagée du moteur de post-traitement. */
export const gfx3PostRenderer = new Gfx3PostRenderer();