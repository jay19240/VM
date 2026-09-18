import { gfx3Manager } from '../gfx3/gfx3_manager';
import { UT } from '../core/utils';
import { Gfx3RendererAbstract } from '../gfx3/gfx3_renderer_abstract';
import { Gfx3StaticGroup, Gfx3DynamicGroup } from '../gfx3/gfx3_group';
import { Gfx3RenderingTexture } from '../gfx3/gfx3_texture';
import { Gfx3Water } from './gfx3_water';
import { Gfx3WaterParam, WATER_PIPELINE_DESC, WATER_VERTEX_SHADER, WATER_FRAGMENT_SHADER, WATER_MAX_IMPACTS, WATER_SHADER_INSERTS, WATER_CUSTOM_PARAMS, Gfx3WaterImpact } from './gfx3_water_shader';

/**
 * Rend les surfaces d'eau mises en file d'attente au moyen d'une instance partagée.
 */
export class Gfx3WaterRenderer extends Gfx3RendererAbstract {
  waters: Array<Gfx3Water>;
  grp0: Gfx3StaticGroup;
  vpcMatrix: Float32Array;
  cameraPos: Float32Array;
  timeInfos: Float32Array;
  grp1: Gfx3DynamicGroup;
  mMatrix: Float32Array;
  tag: Float32Array;
  params: Float32Array;
  impacts: Float32Array;

  /** Initialise la pipeline et les groupes de liaison du moteur de rendu de l'eau. */
  constructor() {
    super('WATER_PIPELINE', WATER_VERTEX_SHADER, WATER_FRAGMENT_SHADER, WATER_PIPELINE_DESC, { ...WATER_CUSTOM_PARAMS, ...WATER_SHADER_INSERTS });
    this.waters = [];

    this.grp0 = gfx3Manager.createStaticGroup('WATER_PIPELINE', 0);
    this.vpcMatrix = this.grp0.setFloat(0, 'VPC_MATRIX', 16);
    this.cameraPos = this.grp0.setFloat(1, 'CAMERA_POS', 3);
    this.timeInfos = this.grp0.setFloat(2, 'TIME_INFOS', 1);

    this.grp1 = gfx3Manager.createDynamicGroup('WATER_PIPELINE', 1);
    this.mMatrix = this.grp1.setFloat(0, 'M_MATRIX', 16);
    this.tag = this.grp1.setFloat(1, 'TAG', 4);
    this.params = this.grp1.setFloat(2, 'PARAMS', Gfx3WaterParam.COUNT + Object.values(WATER_CUSTOM_PARAMS).length);
    this.impacts = this.grp1.setFloat(3, 'IMPACTS', Gfx3WaterImpact.COUNT * WATER_MAX_IMPACTS);

    this.grp0.allocate();
    this.grp1.allocate();
  }

  /**
   * Rend les surfaces d'eau en attente, puis vide la file.
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

    passEncoder.setPipeline(this.pipeline);

    UT.MAT4_COPY(currentView.getViewProjectionClipMatrix(), this.vpcMatrix);
    UT.VEC3_COPY(currentView.getCameraPosition(), this.cameraPos);
    UT.VEC1_COPY(performance.now() / 1000, this.timeInfos);

    this.grp0.beginWrite();
    this.grp0.write(0, this.vpcMatrix);
    this.grp0.write(1, this.cameraPos);
    this.grp0.write(2, this.timeInfos);
    this.grp0.endWrite();
    passEncoder.setBindGroup(0, this.grp0.getBindGroup());

    if (this.grp1.getSize() < this.waters.length) {
      this.grp1.allocate(this.waters.length);
    }

    this.grp1.beginWrite();

    for (let i = 0; i < this.waters.length; i++) {
      const water = this.waters[i];

      UT.MAT4_COPY(water.getTransformMatrix(), this.mMatrix);
      UT.VEC4_COPY(water.getTag(), this.tag);

      this.grp1.write(0, this.mMatrix);
      this.grp1.write(1, this.tag);
      this.grp1.write(2, water.params);
      this.grp1.write(3, water.impactsBuffer);

      passEncoder.setBindGroup(1, this.grp1.getBindGroup(i));
      passEncoder.setBindGroup(2, water.getGroup02().getBindGroup());

      passEncoder.setVertexBuffer(0, gfx3Manager.getVertexBuffer(), water.getVertexSubBufferOffset(), water.getVertexSubBufferSize());
      passEncoder.draw(water.getVertexCount());
    }

    this.grp1.endWrite();
    this.waters = [];

    if (destinationTexture) {
      passEncoder.end();
    }
  }

  /**
   * Définit les insertions de code des shaders et recharge la pipeline.
   *
   * @param data - Données personnalisées injectées dans le gabarit des shaders.
   */
  setShaderInserts(data: Partial<typeof WATER_SHADER_INSERTS> = {}): void {
    Object.assign(WATER_SHADER_INSERTS, data);
    super.reload(WATER_VERTEX_SHADER, WATER_FRAGMENT_SHADER, WATER_PIPELINE_DESC, WATER_SHADER_INSERTS);
    this.grp0.setPipeline(this.pipeline);
    this.grp1.setPipeline(this.pipeline);
    this.grp0.allocate();
    this.grp1.allocate();
  }

  /**
   * Définit les variables de paramètres personnalisés et recharge la pipeline.
   *
   * @param data - Association entre emplacements personnalisés et noms WGSL.
   */
  setCustomParams(data: Partial<typeof WATER_CUSTOM_PARAMS> = {}): void {
    Object.assign(WATER_CUSTOM_PARAMS, data);
    super.reload(WATER_VERTEX_SHADER, WATER_FRAGMENT_SHADER, WATER_PIPELINE_DESC, { ...WATER_CUSTOM_PARAMS, ...WATER_SHADER_INSERTS });
    this.grp0.setPipeline(this.pipeline);
    this.grp1.setPipeline(this.pipeline);
    this.grp0.allocate();
    this.grp1.allocate();
  }

  /**
   * Ajoute une surface d'eau à la prochaine passe de rendu.
   *
   * @param water - Surface d'eau à dessiner.
   */
  drawWater(water: Gfx3Water): void {
    this.waters.push(water);
  }
}

/** Instance partagée du moteur de rendu des surfaces d'eau. */
export const gfx3WaterRenderer = new Gfx3WaterRenderer();