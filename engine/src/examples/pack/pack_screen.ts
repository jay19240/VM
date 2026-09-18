import { gfx3DebugRenderer } from '@lib/gfx3/gfx3_debug_renderer';
import { gfx3MeshRenderer } from '@lib/gfx3_mesh/gfx3_mesh_renderer';
import { gfx3Manager } from '@lib/gfx3/gfx3_manager';
import { gfx3MeshShadowRenderer } from '@lib/gfx3_mesh/gfx3_mesh_shadow_renderer';
import { gfx3SpriteRenderer } from '@lib/gfx3_sprite/gfx3_sprite_renderer';
import { gfx3SkyboxRenderer } from '@lib/gfx3_skybox/gfx3_skybox_renderer';
import { gfx3FlareRenderer } from '@lib/gfx3_flare/gfx3_flare_renderer';
import { gfx3ParticlesRenderer } from '@lib/gfx3_particles/gfx3_particles_renderer';
import { gfx3PostRenderer } from '@lib/gfx3_post/gfx3_post_renderer';
import { gfx3ShadowVolumeRenderer } from '@lib/gfx3_shadow_volume/gfx3_shadow_volume_renderer';
import { UT } from '@lib/core/utils';
import { Screen } from '@lib/screen/screen';
import { EnginePack3D } from '@lib/engine/engine_pack_3d';
// ---------------------------------------------------------------------------------------

class PackScreen extends Screen {
  pack: EnginePack3D;

  constructor() {
    super();
    this.pack = new EnginePack3D();
  }

  async onEnter() {
    this.pack = await EnginePack3D.createFromFile('wasd', './examples/pack/Untitled.blend.zip');
  }

  update(ts: number) {
    this.pack.update(ts);
  }

  draw() {
    gfx3Manager.beginDrawing();
    this.pack.draw();
    gfx3DebugRenderer.drawGrid(UT.MAT4_ROTATE_X(Math.PI * 0.5), 20, 1);
    gfx3Manager.endDrawing();
  }

  render(ts: number) {
    gfx3Manager.beginRender();
    gfx3MeshShadowRenderer.render();
    gfx3ShadowVolumeRenderer.render();
    gfx3Manager.setDestinationTexture(gfx3PostRenderer.getSourceTexture());
    gfx3Manager.beginPassRender(0);
    gfx3SkyboxRenderer.render();
    gfx3DebugRenderer.render();
    gfx3FlareRenderer.render();
    gfx3MeshRenderer.render(ts);
    gfx3SpriteRenderer.render();
    gfx3ParticlesRenderer.render();    
    gfx3Manager.endPassRender();
    gfx3PostRenderer.render(ts, gfx3Manager.getCurrentRenderingTexture());
    gfx3Manager.endRender();
  }
}

export { PackScreen };