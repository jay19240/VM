import { gfx3Manager } from '@lib/gfx3/gfx3_manager';
import { gfx3TrailRenderer } from '@lib/gfx3_trail/gfx3_trail_renderer';
import { gfx3TextureManager } from '@lib/gfx3/gfx3_texture_manager';
import { Screen } from '@lib/screen/screen';
import { Gfx3Camera } from '@lib/gfx3_camera/gfx3_camera';
import { Gfx3Trail } from '@lib/gfx3_trail/gfx3_trail';
// ---------------------------------------------------------------------------------------

const TRAIL_CONFIGS = [
  { color: [1.0, 0.3, 0.1], radius: 8,  speed: 1.0,  width: 0.6, lifetime: 1.2, orbit: 'xz' },
  { color: [0.2, 0.6, 1.0], radius: 5,  speed: -1.5, width: 0.5, lifetime: 1.0, orbit: 'xz' },
  { color: [0.2, 1.0, 0.4], radius: 6,  speed: 0.8,  width: 0.4, lifetime: 0.9, orbit: 'xy' },
  { color: [1.0, 0.9, 0.1], radius: 10, speed: 0.5,  width: 0.8, lifetime: 1.5, orbit: 'xz' }
];

class TrailsTestScreen extends Screen {
  constructor() {
    super();
    this.camera = new Gfx3Camera(0);
    this.trails = [];
    this.angles = TRAIL_CONFIGS.map(() => 0);
    this.time = 0;
  }

  async onEnter() {
    this.camera.setPosition(0, 14, 20);
    this.camera.lookAt(0, 0, 0);

    for (const cfg of TRAIL_CONFIGS) {
      const trail = new Gfx3Trail({
        texture: await gfx3TextureManager.loadTexture('./examples/trails/texture.jpg'),
        maxPoints: 60,
        width: cfg.width,
        color: cfg.color,
        opacity: 0.9,
        defaultPointLifetime: cfg.lifetime
      });

      this.trails.push(trail);
    }
  }

  onExit() {
    for (const trail of this.trails) {
      trail.delete();
    }

    this.trails = [];
  }

  update(ts) {
    this.time += ts / 1000;

    for (let i = 0; i < this.trails.length; i++) {
      const cfg = TRAIL_CONFIGS[i];
      this.angles[i] += cfg.speed * (ts / 1000);

      const a = this.angles[i];
      let pos;

      if (cfg.orbit === 'xy') {
        pos = [
          Math.cos(a) * cfg.radius,
          Math.sin(a) * cfg.radius,
          Math.sin(a * 0.5) * 3
        ];
      } else {
        pos = [
          Math.cos(a) * cfg.radius,
          Math.sin(a * 2) * 2,
          Math.sin(a) * cfg.radius
        ];
      }

      this.trails[i].addPoint(pos);
      this.trails[i].update(ts);
    }

    // Camera orbits slowly — one full revolution every ~30s to clearly show all angles
    const camAngle = this.time * (Math.PI * 2 / 30);
    const camDist = 22;
    this.camera.setPosition(Math.cos(camAngle) * camDist, 14, Math.sin(camAngle) * camDist);
    this.camera.lookAt(0, 0, 0);
  }

  draw() {
    gfx3Manager.beginDrawing();

    for (const trail of this.trails) {
      trail.draw();
    }
    
    gfx3Manager.endDrawing();
  }

  render(ts) {
    gfx3Manager.beginRender();
    gfx3Manager.beginPassRender(0);
    gfx3TrailRenderer.render();
    gfx3Manager.endPassRender();
    gfx3Manager.endRender();
  }
}

export { TrailsTestScreen };