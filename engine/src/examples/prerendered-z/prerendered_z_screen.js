import { coreManager } from '@lib/core/core_manager';
import { gfx3Manager } from '@lib/gfx3/gfx3_manager';
import { gfx3DebugRenderer } from '@lib/gfx3/gfx3_debug_renderer';
import { gfx3MeshRenderer } from '@lib/gfx3_mesh/gfx3_mesh_renderer';
import { gfx3PostRenderer } from '@lib/gfx3_post/gfx3_post_renderer';
import { Screen } from '@lib/screen/screen';
// ---------------------------------------------------------------------------------------
import { Room } from './room';
// ---------------------------------------------------------------------------------------

const POST_SHADER_INSERT_END = `
// Explaination:
// main = character + front
// channel 1 = background
// We filter and keep only pixel from character that are in front of the "front map" and background.

if (tag.r != 2.0f)
{
  outputColor = ch1;
}`;
// ---------------------------------------------------------------------------------------

class PrerenderedZScreen extends Screen {
  constructor() {
    super();
    this.room = new Room();
  }

  async onEnter() {
    coreManager.enableScanlines(false);
    gfx3PostRenderer.setShaderInserts({ INSERT_END: POST_SHADER_INSERT_END });
    await this.room.loadFromFile('./examples/prerendered-z/scene.room', 'Spawn0000');
  }

  update(ts) {
    this.room.update(ts);
  }

  draw() {
    gfx3Manager.beginDrawing();
    this.room.draw();
    gfx3Manager.endDrawing();
  }

  render(ts) {
    gfx3Manager.beginRender();
    gfx3Manager.setDestinationTexture(gfx3PostRenderer.getSourceTexture());
    gfx3Manager.beginPassRender(0);
    gfx3DebugRenderer.render();
    gfx3MeshRenderer.render(ts);
    gfx3Manager.endPassRender();
    gfx3PostRenderer.render(ts, gfx3Manager.getCurrentRenderingTexture());
    gfx3Manager.endRender();
  }
}

export { PrerenderedZScreen };