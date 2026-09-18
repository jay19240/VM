import { gfx3DebugRenderer } from '@lib/legacy';
import { gfx3MeshRenderer } from '@lib/legacy';
import { gfx3Manager } from '@lib/legacy';
import { gfx3MeshShadowRenderer } from '@lib/legacy';
import { gfx3SpriteRenderer } from '@lib/legacy';
import { gfx3SkyboxRenderer } from '@lib/legacy';
import { gfx3FlareRenderer } from '@lib/legacy';
import { gfx3ParticlesRenderer } from '@lib/legacy';
import { gfx3WaterRenderer } from '@lib/legacy';
import { gfx3PostRenderer } from '@lib/legacy';
import { gfx3ShadowVolumeRenderer } from '@lib/legacy';
import { gfx2Manager } from '@lib/legacy';
import { Screen } from '@lib/legacy';
import { Gfx3MeshJSM } from '@lib/legacy';
import { EnginePack3D } from '@lib/legacy';
import { UT } from '@lib/legacy';

import { eventManager, inputManager } from '@lib/legacy';
// ---------------------------------------------------------------------------------------

// Déplacement du joueur (test)
const MOVE_SPEED = 0.005;
const TURN_SPEED = 2.5;

class GameScreen extends Screen {
  pack: EnginePack3D;
  player: Gfx3MeshJSM;

  constructor() {
    super();
    this.pack = new EnginePack3D();
    this.player = new Gfx3MeshJSM();
  }

  async onEnter() {
    gfx2Manager.setBgColor(0, 0, 0, 0);
    this.pack = await EnginePack3D.createFromFile('orbit', './scene.blend.pak');
    this.player = this.pack.jsm.getObject('Player');

    inputManager.registerAction('gamepad0', 'left', 'L_LEFT');

    eventManager.subscribe(inputManager, 'E_ACTION', this, this.handleAction);
  }

  handleAction(data: any) {
    console.log(data);
  }

  update(ts: number) {
    this.updatePlayer(ts);
    this.pack.update(ts);
  }

  updatePlayer(ts: number) {
    const dt = ts / 1000;
    let yaw = this.player.getRotationY();

    if (inputManager.isActiveAction('LEFT')) {
      yaw += TURN_SPEED * dt;
    }
    else if (inputManager.isActiveAction('RIGHT')) {
      yaw -= TURN_SPEED * dt;
    }

    this.player.setRotationY(yaw);

    if (inputManager.isActiveAction('UP') || inputManager.isActiveAction('DOWN')) {
      const dir = inputManager.isActiveAction('UP') ? 1 : -1;
      const forward = UT.VEC3_FORWARD_NEGATIVE_Z(0, yaw);
      const pos = this.player.getPosition();

      this.player.setPosition(
        pos[0] + forward[0] * MOVE_SPEED * ts * dir,
        pos[1],
        pos[2] + forward[2] * MOVE_SPEED * ts * dir
      );
    }
  }

  draw() {
    gfx3Manager.beginDrawing();
    this.pack.draw();
    gfx3Manager.endDrawing();
  }

  render(ts: number) {
    gfx2Manager.beginRender();
    gfx2Manager.render();
    gfx2Manager.endRender();
    // ------------------------------
    gfx3Manager.beginRender();
    gfx3MeshShadowRenderer.render();
    gfx3ShadowVolumeRenderer.render();
    gfx3Manager.setDestinationTexture(gfx3PostRenderer.getSourceTexture());
    gfx3Manager.beginPassRender(0);
    gfx3SkyboxRenderer.render();
    gfx3FlareRenderer.render();
    gfx3MeshRenderer.render(ts);
    gfx3SpriteRenderer.render();
    gfx3ParticlesRenderer.render();
    gfx3WaterRenderer.render();
    gfx3DebugRenderer.render();
    gfx3Manager.endPassRender();
    gfx3PostRenderer.render(ts, gfx3Manager.getCurrentRenderingTexture());
    gfx3Manager.endRender();
  }
}

export { GameScreen };