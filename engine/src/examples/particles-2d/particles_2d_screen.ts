import { gfx2Manager } from '@lib/gfx2/gfx2_manager';
import { gfx2TextureManager } from '@lib/gfx2/gfx2_texture_manager';
import { eventManager } from '@lib/core/event_manager';
import { inputManager } from '@lib/input/input_manager';
import { Screen } from '@lib/screen/screen';
import { Tween } from '@lib/core/tween';
import { Gfx2Particles, Gfx2ParticlesPosition, Gfx2ParticlesVelocity } from '@lib/gfx2_particles/gfx2_particles';
// ---------------------------------------------------------------------------------------

class Particles2DScreen extends Screen {
  ps1: Gfx2Particles | null;
  ps2: Gfx2Particles | null;

  constructor() {
    super();
    this.ps1 = null;
    this.ps2 = null;
  }

  async onEnter() {
    gfx2Manager.setBgColor(12, 12, 30, 1);


    const smoke = await gfx2TextureManager.loadTexture('./textures/particles/smoke.png');
    const spark = await gfx2TextureManager.loadTexture('./textures/particles/spark.png');

    this.ps1 = new Gfx2Particles({
      texture: smoke,
      positionStyle: Gfx2ParticlesPosition.CIRCLE,
      positionBase: [0, 150],
      positionCircleRadiusBase: 1,
      velocityStyle: Gfx2ParticlesVelocity.CLASSIC,
      velocityBase: [0, -200],
      velocitySpread: [80, 40],
      accelerationBase: [0, 150],
      sizeTween: new Tween<number>([0, 0.3, 1.2], [8, 24, 8]),
      opacityTween: new Tween<number>([0, 0.2, 1.5], [0, 1, 0]),
      angleSpread: 360,
      angleVelocitySpread: 180,
      particlesPerSecond: 120,
      particleQuantity: 240,
      particleDeathAge: 1.5,
      emitterDeathAge: 600
    });

    this.ps2 = new Gfx2Particles({
      texture: spark,
      colorBase: [1, 0, 0],
      colorSpread: [1, 0, 0],
      colorTween: new Tween<vec3>([0.1, 1], [[1, 0, 0], [0, 1, 0]]),
      positionStyle: Gfx2ParticlesPosition.CIRCLE,
      positionBase: [0, -80],
      positionCircleRadiusBase: 2,
      velocityStyle: Gfx2ParticlesVelocity.EXPLODE,
      velocityExplodeSpeedBase: 120,
      velocityExplodeSpeedSpread: 60,
      accelerationBase: [0, 80],
      sizeTween: new Tween<number>([0.5, 0.7, 1.3], [10, 14, 4]),
      opacityTween: new Tween<number>([0.2, 0.7, 2.5], [0.75, 1, 0]),
      particlesPerSecond: 200,
      particleQuantity: 600,
      particleDeathAge: 2.5,
      emitterDeathAge: 200
    });

    eventManager.subscribe(inputManager, 'E_MOUSE_DOWN', this, this.handleMouseDown);
  }

  onExit() {
    eventManager.unsubscribe(inputManager, 'E_MOUSE_DOWN', this);
  }

  handleMouseDown(data: { x: number, y: number }) {
    if (!this.ps1) {
      return;
    }

    const pos = gfx2Manager.getWorldPosFromCanvasCenter(data.x, data.y);
    this.ps1.positionBase = [pos[0], pos[1]];
  }

  update(ts: number) {
    this.ps1?.update(ts);
    this.ps2?.update(ts);
  }

  draw() {
    this.ps1?.draw();
    this.ps2?.draw();
  }

  render() {
    gfx2Manager.beginRender();
    gfx2Manager.render();
    gfx2Manager.endRender();
  }
}

export { Particles2DScreen };
