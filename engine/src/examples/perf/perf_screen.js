import { gfx3TextureManager } from '@lib/gfx3/gfx3_texture_manager';
import { gfx3Manager } from '@lib/gfx3/gfx3_manager';
import { gfx3MeshRenderer } from '@lib/gfx3_mesh/gfx3_mesh_renderer';
import { UT } from '@lib/core/utils';
import { Screen } from '@lib/screen/screen';
import { Gfx3CameraWASD } from '@lib/gfx3_camera/gfx3_camera_wasd';
import { MESH_SHADER_VERTEX_ATTR_COUNT } from '@lib/gfx3_mesh/gfx3_mesh_shader';
import { Gfx3Mesh } from '@lib/gfx3_mesh/gfx3_mesh';
import { Gfx3MeshJSM } from '@lib/gfx3_mesh/gfx3_mesh_jsm';
import { Gfx3Material } from '@lib/gfx3_mesh/gfx3_mesh_material';
import { Gfx3MatParam } from '@lib/gfx3_mesh/gfx3_mesh_shader';
// ---------------------------------------------------------------------------------------

const GRID_WIDTH = 300;
const GRID_HEIGHT = 300;
const GRID_SPACE = 5;

class Transform {
  constructor(p = [0, 0, 0], a = [0, 0, 0], s = [0, 0, 0]) {
    this.p = p;
    this.a = a;
    this.s = s;
    this.m = UT.MAT4_IDENTITY();
  }
}

class PerfScreen extends Screen {
  constructor() {
    super();
    this.camera = new Gfx3CameraWASD(0);
    this.mode = 1;
    this.colFac = 0;
    this.obj = null;
    this.bigMesh = null;
    this.skySphere = null;
    this.transformations = [];
    this.matrices = [];
    this.handleKeyUpCb = this.handleKeyUp.bind(this);
  }

  async onEnter() {
    const view = gfx3Manager.getView(0);
    view.setPerspectiveFar(700);
    view.setPerspectiveNear(0.1);
    this.camera.setPosition(0, 10, 0);

    this.skySphere = new Gfx3MeshJSM();
    this.skySphere.mat.setTexture(await gfx3TextureManager.loadTexture('./examples/perf/sky_sphere.jpg'));
    await this.skySphere.loadFromFile('./examples/perf/sky_sphere.jsm');

    this.obj = new Gfx3MeshJSM();
    this.obj.mat.setTexture(await gfx3TextureManager.loadTexture('./examples/perf/cube.png'));
    this.obj.mat.setParam(Gfx3MatParam.LIGHT_ENABLED, 1.0);
    await this.obj.loadFromFile('./examples/perf/cube.jsm');

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const mx = (x - GRID_WIDTH / 2) * GRID_SPACE;
        const my = (y - GRID_WIDTH / 2) * GRID_SPACE;

        const p = [mx, 0, my, 1];
        const a = [x, 0, y];
        const s = [1, 1, 1];

        this.transformations.push(new Transform(p, a, s));
      }
    }

    const bigMeshMatrices = this.transformations.map(t => UT.MAT4_TRANSFORM(t.p, t.a, t.s));
    this.bigMesh = DUPE(this.obj, bigMeshMatrices);

    gfx3MeshRenderer.setDirLight(true, [0, -1, 0.2], [0.8, 0.6, 0.4], [0.8, 0.6, 0.4]);

    document.addEventListener('keyup', this.handleKeyUpCb);
  }

  onExit() {
    document.removeEventListener('keyup', this.handleKeyUpCb);
  }

  update(ts) {
    const c1 = (Math.sin(this.colFac) + 1.0) * 0.5;
    const c2 = (Math.cos(this.colFac) + 1.0) * 0.5;
    this.obj.mat.setParam(Gfx3MatParam.SPECULAR_R, c1);
    this.obj.mat.setParam(Gfx3MatParam.SPECULAR_G, c2);
    this.obj.mat.setParam(Gfx3MatParam.SPECULAR_B, 0);
    this.obj.mat.setParam(Gfx3MatParam.DIFFUSE_R, 0);
    this.obj.mat.setParam(Gfx3MatParam.DIFFUSE_G, c1);
    this.obj.mat.setParam(Gfx3MatParam.DIFFUSE_B, c2);

    const r = Math.PI * 2 * 4 / this.transformations.length;
    let n = 0;

    this.matrices = [];

    for (const t of this.transformations) {
      t.a[0] += ts / 500.0;
      t.a[2] += ts / 1000.0;
      t.p[1] = Math.sin(n + this.colFac) * 3;
      this.matrices.push(UT.MAT4_TRANSFORM(t.p, t.a, t.s, t.m));
      n += r;
    }

    this.colFac += ts * 0.003;
    this.camera.update(ts);
  }

  draw() {
    gfx3Manager.beginDrawing();
    this.skySphere.draw();

    if (this.mode == 0) {
      this.bigMesh.draw();
    }
    else {
      gfx3MeshRenderer.drawInstanceMesh(this.obj, this.matrices);
    }

    gfx3Manager.endDrawing();
  }

  render(ts) {
    gfx3Manager.beginRender();
    gfx3Manager.beginPassRender(0);
    gfx3MeshRenderer.render(ts);
    gfx3Manager.endPassRender();
    gfx3Manager.endRender();
  }

  handleKeyUp(e) {
    if (e.code === 'KeyR') {
      this.mode = this.mode == 1 ? 0 : 1;
    }
  }
}

export { PerfScreen };

// -------------------------------------------------------------------------------------------
// HELPFUL
// -------------------------------------------------------------------------------------------

function DUPE(mesh, matrices) {
  const outMesh = new Gfx3Mesh();
  const vertices = mesh.getVertices();

  outMesh.beginVertices(mesh.getVertexCount() * matrices.length);

  for (const matrix of matrices) {
    for (let i = 0; i < vertices.length; i += MESH_SHADER_VERTEX_ATTR_COUNT) {
      const v = UT.MAT4_MULTIPLY_BY_VEC4(matrix, UT.VEC4_CREATE(vertices[i + 0], vertices[i + 1], vertices[i + 2], 1.0));
      outMesh.defineVertex(v[0], v[1], v[2], vertices[i + 3], vertices[i + 4], vertices[i + 5], vertices[i + 6], vertices[i + 7], vertices[i + 8], vertices[i + 9], vertices[i + 10], vertices[i + 11], vertices[i + 12], vertices[i + 13], vertices[i + 14], vertices[i + 15], vertices[i + 16]);
    }
  }

  outMesh.endVertices();
  outMesh.material = mesh.material;
  return outMesh;
}