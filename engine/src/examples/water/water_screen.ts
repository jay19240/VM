import { gfx3Manager } from '@lib/gfx3/gfx3_manager';
import { gfx3TextureManager } from '@lib/gfx3/gfx3_texture_manager';
import { gfx3DebugRenderer } from '@lib/gfx3/gfx3_debug_renderer';
import { gfx3MeshRenderer } from '@lib/gfx3_mesh/gfx3_mesh_renderer';
import { gfx3SkyboxRenderer } from '@lib/gfx3_skybox/gfx3_skybox_renderer';
import { gfx3WaterRenderer } from '@lib/gfx3_water/gfx3_water_renderer';
import { uiManager } from '@lib/ui/ui_manager';
import { UT } from '@lib/core/utils';
import { Screen } from '@lib/screen/screen';
import { Gfx3CameraOrbit } from '@lib/gfx3_camera/gfx3_camera_orbit';
import { Gfx3Skybox } from '@lib/gfx3_skybox/gfx3_skybox';
import { Gfx3Water } from '@lib/gfx3_water/gfx3_water';
import { CREATE_WATER_TWEAK_PANEL } from './water_panel';
// ---------------------------------------------------------------------------------------

class WaterScreen extends Screen {
  camera: Gfx3CameraOrbit;
  skybox: Gfx3Skybox;
  water: Gfx3Water;
  tweakPanel: HTMLElement | null;
  impactStrength: number;
  impactRadius: number;
  impactLifetime: number;

  constructor() {
    super();
    this.camera = new Gfx3CameraOrbit(0);
    this.skybox = new Gfx3Skybox();
    this.water = new Gfx3Water();
    this.tweakPanel = null;
    this.impactStrength = 1.0;
    this.impactRadius = 6.0;
    this.impactLifetime = 3.0;
  }

  async onEnter() {
    const view = gfx3Manager.getView(0);
    view.setBgColor(0.4, 0.6, 0.8, 1.0);
    view.setPerspectiveFar(500);

    this.camera.setTarget([0, 0, 0]);
    this.camera.setDistance(35);
    this.camera.setTheta(0.45);
    this.camera.setPhi(Math.PI * 0.5);

    this.skybox = new Gfx3Skybox();
    this.skybox.setCubemap(await gfx3TextureManager.loadCubemapTexture({
      right: './examples/water/sky_right.png',
      left: './examples/water/sky_left.png',
      top: './examples/water/sky_top.png',
      bottom: './examples/water/sky_bottom.png',
      front: './examples/water/sky_front.png',
      back: './examples/water/sky_back.png'
    }));

    this.water = new Gfx3Water();
    await this.water.loadFromBinaryFile('./examples/water/mesh.bwa');
    this.water.setEnvMap(await gfx3TextureManager.loadCubemapTexture({
      right: './examples/water/sky_right.png',
      left: './examples/water/sky_left.png',
      top: './examples/water/sky_top.png',
      bottom: './examples/water/sky_bottom.png',
      front: './examples/water/sky_front.png',
      back: './examples/water/sky_back.png'
    }));

    this.water.setNormalMap(await gfx3TextureManager.loadTexture('./textures/default_waternormals.jpg', { addressModeU: 'repeat', addressModeV: 'repeat' }));

    gfx3MeshRenderer.setDirLight(true, [0, -1, -0.3], [1, 1, 1], [0.2, 0.25, 0.3]);

    const tweakPanel = CREATE_WATER_TWEAK_PANEL(this.water, {
      getStrength: () => this.impactStrength,
      setStrength: (v: number) => { this.impactStrength = v; },
      getRadius: () => this.impactRadius,
      setRadius: (v: number) => { this.impactRadius = v; },
      getLifetime: () => this.impactLifetime,
      setLifetime: (v: number) => { this.impactLifetime = v; },
      dropRandom: () => this.dropRandomImpact()
    });

    uiManager.addNode(tweakPanel, 'position:absolute; right:0; bottom:0');
    this.tweakPanel = tweakPanel;

  }

  onExit() {
    if (this.tweakPanel) uiManager.removeNode(this.tweakPanel);
  }

  dropRandomImpact() {
    const aabb = this.water.getBoundingBox();
    const wx = UT.LERP(aabb.min[0], aabb.max[0], Math.random());
    const wz = UT.LERP(aabb.min[2], aabb.max[2], Math.random());
    this.water.addImpact(wx, wz, this.impactStrength, this.impactRadius, this.impactLifetime);
  }

  update(ts: number) {
    this.camera.update(ts);
    this.water.update(ts);
  }

  draw() {
    gfx3Manager.beginDrawing();
    this.skybox.draw();
    this.water.draw();
    gfx3DebugRenderer.drawGrid(UT.MAT4_ROTATE_X(Math.PI * 0.5), 30, 1);
    gfx3Manager.endDrawing();
  }

  render(ts: number) {
    gfx3Manager.beginRender();
    gfx3Manager.beginPassRender(0);
    gfx3SkyboxRenderer.render();
    gfx3MeshRenderer.render(ts);
    gfx3WaterRenderer.render();
    gfx3DebugRenderer.render();
    gfx3Manager.endPassRender();
    gfx3Manager.endRender();
  }
}

export { WaterScreen };