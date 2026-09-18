import { gfx3Manager } from '@lib/gfx3/gfx3_manager';
import { gfx3DebugRenderer } from '@lib/gfx3/gfx3_debug_renderer';
import { gfx3MeshRenderer } from '@lib/gfx3_mesh/gfx3_mesh_renderer';
import { gfx3NoiseManager, Gfx3NoiseParams } from '@lib/gfx3_noise/gfx3_noise_manager';
import { uiManager } from '@lib/ui/ui_manager';
import { Screen } from '@lib/screen/screen';
import { Gfx3CameraOrbit } from '@lib/gfx3_camera/gfx3_camera_orbit';
import { Gfx3MeshJSM } from '@lib/gfx3_mesh/gfx3_mesh_jsm';
import { Gfx3MatParam } from '@lib/gfx3_mesh/gfx3_mesh_shader';
import { Gfx3Texture } from '@lib/gfx3/gfx3_texture';
import { CREATE_NOISE_TWEAK_PANEL } from './noise_panel';
// ---------------------------------------------------------------------------------------

const TEXTURE_SIZE = 512;

class NoiseScreen extends Screen {
  camera: Gfx3CameraOrbit;
  cube: Gfx3MeshJSM;
  texture: Gfx3Texture;
  params: Required<Gfx3NoiseParams>;
  animate: boolean;
  angle: number;
  panel: HTMLElement | null;

  constructor() {
    super();
    this.camera = new Gfx3CameraOrbit(0);
    this.cube = new Gfx3MeshJSM();
    this.texture = {} as Gfx3Texture;
    this.params = {
      colors: ['#d9eda5', '#8cd4c4', '#fae684', '#eba86b', '#a18c70', '#6b545e'],
      scale: 3.5,
      speed: 0.15,
      time: 0.0,
      numBands: 12.0,
      warpStrength: 1.2,
      smoothness: 1.0,
      showContours: false,
      greyscaleMode: false
    };
    this.animate = true;
    this.angle = 0;
    this.panel = null;
  }

  async onEnter() {
    const view = gfx3Manager.getView(0);
    view.setBgColor(0.09, 0.09, 0.09, 1.0);

    this.camera.setTarget([0, 0, 0]);
    this.camera.setDistance(50);
    this.camera.setTheta(0.4);
    this.camera.setPhiOrigin(Math.PI * 0.5);

    this.texture = gfx3NoiseManager.createNoiseTexture(TEXTURE_SIZE, TEXTURE_SIZE, this.params);

    this.cube = new Gfx3MeshJSM();
    await this.cube.loadFromFile('./examples/rotating-cube/cube.jsm');
    this.cube.setScale(8, 8, 8);
    this.cube.mat.setTexture(this.texture);
    this.cube.mat.setParam(Gfx3MatParam.LIGHT_ENABLED, 1.0);

    gfx3MeshRenderer.setDirLight(true, [0, -1, -1], [1, 1, 1], [0.2, 0.2, 0.2]);

    this.panel = CREATE_NOISE_TWEAK_PANEL({
      params: this.params,
      getAnimate: () => this.animate,
      setAnimate: (v: boolean) => { this.animate = v; },
      onChange: () => this.regenerate()
    });
    uiManager.addNode(this.panel, 'position:absolute; bottom:0; right:0');
  }

  onExit() {
    if (this.panel) uiManager.removeNode(this.panel);
    this.texture.gpuTexture.destroy();
  }

  update(ts: number) {
    this.camera.update(ts);

    this.angle += ts / 1000;
    this.cube.setRotation(this.angle * 0.3, this.angle * 0.5, 0);
    this.cube.update(ts);

    if (this.animate) {
      this.params.time += ts / 1000;
      this.regenerate();
    }
  }

  regenerate() {
    gfx3NoiseManager.regenerateNoiseTexture(this.texture, this.params);
  }

  draw() {
    gfx3Manager.beginDrawing();
    this.cube.draw();
    gfx3Manager.endDrawing();
  }

  render(ts: number) {
    gfx3Manager.beginRender();
    gfx3Manager.beginPassRender(0);
    gfx3MeshRenderer.render(ts);
    gfx3DebugRenderer.render();
    gfx3Manager.endPassRender();
    gfx3Manager.endRender();
  }
}

export { NoiseScreen };
