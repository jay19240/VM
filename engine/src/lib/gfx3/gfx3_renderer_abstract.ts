import { gfx3Manager } from '../gfx3/gfx3_manager';

/** Classe de base de tous les moteurs de rendu 3D. */
export abstract class Gfx3RendererAbstract {
  pipeline: GPURenderPipeline;
  pipelineId: string;
  data: any;

  /**
   * Crée un moteur de rendu et charge sa pipeline WebGPU.
   *
   * @param pipelineId - Identifiant unique de la pipeline de rendu.
   * @param vertexShader - Générateur du code du shader de sommets.
   * @param fragmentShader - Générateur du code du shader de fragments.
   * @param pipelineDesc - Configuration de la pipeline, notamment les formats, shaders et primitives.
   * @param data - Données injectées dans les modèles de shaders.
   */
  constructor(pipelineId: string, vertexShader: (data: any) => string, fragmentShader: (data: any) => string, pipelineDesc: GPURenderPipelineDescriptor, data: any = {}) {
    this.pipeline = gfx3Manager.loadPipeline(pipelineId, vertexShader(data), fragmentShader(data), pipelineDesc);
    this.pipelineId = pipelineId;
    this.data = data;
  }

  /**
   * Supprime puis recrée la pipeline avec de nouveaux shaders et paramètres.
   *
   * @param vertexShader - Générateur du code du shader de sommets.
   * @param fragmentShader - Générateur du code du shader de fragments.
   * @param pipelineDesc - Nouvelle configuration de la pipeline.
   * @param data - Données injectées dans les modèles de shaders.
   */
  reload(vertexShader: (options: any) => string, fragmentShader: (options: any) => string, pipelineDesc: GPURenderPipelineDescriptor, data: any = {}): void {
    gfx3Manager.deletePipeline(this.pipelineId);
    this.pipeline = gfx3Manager.loadPipeline(this.pipelineId, vertexShader(data), fragmentShader(data), pipelineDesc);
    this.data = data;
  }

  /**
   * Convertit les membres d'une énumération TypeScript, hormis `COUNT`, en champs WGSL de type `f32`.
   *
   * @param e - Énumération à convertir.
   * @returns Les déclarations de champs destinées à une structure WGSL.
   */
  static generateWGSLStructFromEnum(e: any): string {
    return Object.keys(e)
      .filter(key => isNaN(Number(key)) && key !== 'COUNT')
      .map(key => `${key}: f32,`)
      .join('\n  ');
  }
}