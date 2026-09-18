import { gfx3Manager } from '../gfx3/gfx3_manager';
import { UT } from '../core/utils';
import { Gfx3RendererAbstract } from './gfx3_renderer_abstract';
import { Gfx3DynamicGroup } from '../gfx3/gfx3_group';
import { DEBUG_PIPELINE_DESC, DEBUG_VERTEX_SHADER, DEBUG_FRAGMENT_SHADER, DEBUG_SHADER_VERTEX_ATTR_COUNT } from './gfx3_debug_shader';

interface Gfx3DebugCommand {
  vertices: Float32Array;
  vertexCount: number;
  matrix: mat4;
};

/** Moteur de rendu singleton qui trace des primitives filaires pour le débogage 3D. */
export class Gfx3DebugRenderer extends Gfx3RendererAbstract {
  device: GPUDevice;
  vertexBuffer: GPUBuffer;
  vertexCount: number;
  commands: Array<Gfx3DebugCommand>;
  showDebug: boolean;
  grp0: Gfx3DynamicGroup;
  mvpcMatrix: Float32Array;

  /** Initialise la pipeline, le tampon de sommets et le groupe de liaison du rendu de débogage. */
  constructor() {
    super('DEBUG_PIPELINE', DEBUG_VERTEX_SHADER, DEBUG_FRAGMENT_SHADER, DEBUG_PIPELINE_DESC);
    this.device = gfx3Manager.getDevice();
    this.vertexBuffer = this.device.createBuffer({ size: 0, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    this.vertexCount = 0;
    this.commands = [];
    this.showDebug = false;
    this.grp0 = gfx3Manager.createDynamicGroup('DEBUG_PIPELINE', 0);
    this.mvpcMatrix = this.grp0.setFloat(0, 'MVPC_MATRIX', 16);
    this.grp0.allocate();
  }

  /** Rend les commandes filaires en attente, puis vide la file et le tampon temporaire. */
  render(): void {
    if (!this.showDebug) {
      return;
    }

    const currentView = gfx3Manager.getCurrentView();
    const passEncoder = gfx3Manager.getPassEncoder();
    const vpcMatrix = currentView.getViewProjectionClipMatrix();
    passEncoder.setPipeline(this.pipeline);

    this.vertexBuffer.destroy();
    this.vertexBuffer = this.device.createBuffer({ size: this.vertexCount * DEBUG_SHADER_VERTEX_ATTR_COUNT * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });

    if (this.grp0.getSize() < this.commands.length) {
      this.grp0.allocate(this.commands.length);
    }

    this.grp0.beginWrite();

    for (let i = 0, offset = 0; i < this.commands.length; i++) {
      const cmd = this.commands[i];
      this.grp0.write(0, UT.MAT4_MULTIPLY(vpcMatrix, cmd.matrix, this.mvpcMatrix) as Float32Array);
      passEncoder.setBindGroup(0, this.grp0.getBindGroup(i));

      this.device.queue.writeBuffer(this.vertexBuffer, offset, cmd.vertices);
      passEncoder.setVertexBuffer(0, this.vertexBuffer, offset, cmd.vertices.byteLength);
      passEncoder.draw(cmd.vertexCount);
      offset += cmd.vertices.byteLength;
    }

    this.grp0.endWrite();

    this.commands = [];
    this.vertexCount = 0;
  }

  /**
   * Ajoute une liste de sommets à rendre selon la topologie `line-list`.
   *
   * @param vertices - Composantes entrelacées position-couleur.
   * @param vertexCount - Nombre de sommets.
   * @param matrix - Matrice de transformation.
   */
  drawVertices(vertices: Array<number>, vertexCount: number, matrix: mat4 = UT.MAT4_IDENTITY()): void {
    this.commands.push({
      vertices: new Float32Array(vertices),
      vertexCount: vertexCount,
      matrix: matrix
    });

    this.vertexCount += vertexCount;
  }

  /**
   * Ajoute un segment coloré à la file de rendu.
   *
   * @param matrix - Matrice de transformation.
   * @param x1 - Coordonnée X du départ.
   * @param y1 - Coordonnée Y du départ.
   * @param z1 - Coordonnée Z du départ.
   * @param x2 - Coordonnée X de l'arrivée.
   * @param y2 - Coordonnée Y de l'arrivée.
   * @param z2 - Coordonnée Z de l'arrivée.
   * @param r - Composante rouge.
   * @param g - Composante verte.
   * @param b - Composante bleue.
   */
  drawLine(matrix: mat4, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, r: number = 1, g: number = 1, b: number = 1): void {
    let vertexCount = 2;
    const vertices: Array<number> = [
      x1, y1, z1, r, g, b,
      x2, y2, z2, r, g, b
    ];

    this.commands.push({
      vertices: new Float32Array(vertices),
      vertexCount: 2,
      matrix: matrix
    });

    this.vertexCount += vertexCount;
  }

  /**
   * Ajoute un cylindre filaire vertical.
   *
   * @param matrix - Matrice de transformation.
   * @param radius - Rayon du cylindre.
   * @param height - Hauteur du cylindre.
   * @param step - Nombre de segments radiaux.
   * @param closed - Ajoute les rayons des deux bases lorsque cette valeur vaut `true`.
   * @param color - Couleur RVB.
   */
  drawCylinder(matrix: mat4, radius: number, height: number, step: number, closed: boolean, color: vec3 = [1, 1, 1]): void {
    let vertexCount = 0;
    const vertices: Array<number> = [];
    const angleStep = (Math.PI * 2) / step;
    const cbx = 0;
    const cby = 0;
    const cbz = 0;
    const ctx = 0;
    const cty = height;
    const ctz = 0;

    for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
      const b1x = radius * Math.cos(angle);
      const b1y = 0;
      const b1z = radius * Math.sin(angle) * -1;

      const b2x = radius * Math.cos(angle + angleStep);
      const b2y = 0;
      const b2z = radius * Math.sin(angle + angleStep) * -1;

      const t1x = radius * Math.cos(angle);
      const t1y = height;
      const t1z = radius * Math.sin(angle) * -1;

      const t2x = radius * Math.cos(angle + angleStep);
      const t2y = height;
      const t2z = radius * Math.sin(angle + angleStep) * -1;

      vertices.push(b1x, b1y, b1z, color[0], color[1], color[2]);
      vertices.push(t1x, t1y, t1z, color[0], color[1], color[2]);
      vertices.push(b1x, b1y, b1z, color[0], color[1], color[2]);
      vertices.push(b2x, b2y, b2z, color[0], color[1], color[2]);
      vertices.push(t1x, t1y, t1z, color[0], color[1], color[2]);
      vertices.push(t2x, t2y, t2z, color[0], color[1], color[2]);
      vertexCount += 6;

      if (closed) {
        vertices.push(cbx, cby, cbz, color[0], color[1], color[2]);
        vertices.push(b1x, b1y, b1z, color[0], color[1], color[2]);
        vertices.push(ctx, cty, ctz, color[0], color[1], color[2]);
        vertices.push(t1x, t1y, t1z, color[0], color[1], color[2]);
        vertexCount += 4;
      }
    }

    this.commands.push({
      vertices: new Float32Array(vertices),
      vertexCount: vertexCount,
      matrix: matrix
    });

    this.vertexCount += vertexCount;
  }

  /**
   * Ajoute une grille filaire carrée centrée sur l'origine locale.
   *
   * @param matrix - Matrice de transformation.
   * @param extend - Nombre de cellules de chaque côté du centre.
   * @param spacing - Espacement entre les lignes.
   * @param color - Couleur RVB.
   */
  drawGrid(matrix: mat4, extend: number = 3, spacing: number = 1, color: vec3 = [1, 1, 1]): void {
    let vertexCount: number = 0;
    const vertices: Array<number> = [];
    const nbCells = extend * 2;
    const gridSize = nbCells * spacing;
    const left = -gridSize * 0.5;
    const top = -gridSize * 0.5;

    for (let i = 0; i <= nbCells; i++) {
      const vLineFromX = left + (i * spacing);
      const vLineFromY = top;
      const vLineFromZ = 0;
      const vLineDestX = left + (i * spacing);
      const vLineDestY = top + gridSize;
      const vLineDestZ = 0;
      const hLineFromX = left;
      const hLineFromY = top + (i * spacing);
      const hLineFromZ = 0;
      const hLineDestX = left + gridSize;
      const hLineDestY = top + (i * spacing);
      const hLineDestZ = 0;
      vertices.push(vLineFromX, vLineFromY, vLineFromZ, color[0], color[1], color[2]);
      vertices.push(vLineDestX, vLineDestY, vLineDestZ, color[0], color[1], color[2]);
      vertices.push(hLineFromX, hLineFromY, hLineFromZ, color[0], color[1], color[2]);
      vertices.push(hLineDestX, hLineDestY, hLineDestZ, color[0], color[1], color[2]);
      vertexCount += 4;
    }

    this.commands.push({
      vertices: new Float32Array(vertices),
      vertexCount: vertexCount,
      matrix: matrix
    });

    this.vertexCount += vertexCount;
  }

  /**
   * Ajoute un repère XYZ coloré.
   *
   * @param matrix - Matrice de transformation.
   * @param size - Longueur de chaque axe.
   */
  drawGizmo(matrix: mat4, size: number = 1): void {
    let vertexCount = 0;
    const vertices: Array<number> = [];
    const axes = [[1 * size, 0, 0], [0, 1 * size, 0], [0, 0, 1 * size]];
    const colors = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

    for (let i = 0; i < axes.length; i++) {
      vertices.push(0, 0, 0, colors[i][0], colors[i][1], colors[i][2]);
      vertices.push(axes[i][0], axes[i][1], axes[i][2], colors[i][0], colors[i][1], colors[i][2]);
      vertexCount += 2;
    }

    this.commands.push({
      vertices: new Float32Array(vertices),
      vertexCount: vertexCount,
      matrix: matrix
    });

    this.vertexCount += vertexCount;
  }

  /**
   * Ajoute un cercle filaire dans le plan XY local.
   *
   * @param matrix - Matrice de transformation.
   * @param radius - Rayon du cercle.
   * @param step - Nombre de segments.
   * @param color - Couleur RVB.
   */
  drawCircle(matrix: mat4, radius: number = 1, step: number = 4, color: vec3 = [1, 1, 1]): void {
    let vertexCount = 0;
    const vertices: Array<number> = [];
    const angleStep = (Math.PI * 2) / step;

    for (let i = 0; i < step; i++) {
      const x1 = Math.cos(i * angleStep) * radius;
      const y1 = Math.sin(i * angleStep) * radius;
      const z1 = 0;
      const x2 = Math.cos((i + 1) * angleStep) * radius;
      const y2 = Math.sin((i + 1) * angleStep) * radius;
      const z2 = 0;

      vertices.push(x1, y1, z1, color[0], color[1], color[2]);
      vertices.push(x2, y2, z2, color[0], color[1], color[2]);
      vertexCount += 2;
    }

    this.commands.push({
      vertices: new Float32Array(vertices),
      vertexCount: vertexCount,
      matrix: matrix
    });

    this.vertexCount += vertexCount;
  }

  /**
   * Ajoute un rectangle englobant filaire dans le plan XZ local.
   *
   * @param matrix - Matrice de transformation.
   * @param min - Borne minimale XZ.
   * @param max - Borne maximale XZ.
   * @param color - Couleur RVB.
   */
  drawBoundingRect(matrix: mat4, min: vec2, max: vec2, color: vec3 = [1, 1, 1]): void {
    let vertexCount = 0;
    const vertices: Array<number> = [];
    const a = [min[0], 0, min[1]];
    const b = [min[0], 0, max[1]];
    const c = [max[0], 0, min[1]];
    const d = [max[0], 0, max[1]];

    vertices.push(a[0], a[1], a[2], color[0], color[1], color[2]);
    vertices.push(b[0], b[1], b[2], color[0], color[1], color[2]);
    vertexCount += 2;

    vertices.push(b[0], b[1], b[2], color[0], color[1], color[2]);
    vertices.push(d[0], d[1], d[2], color[0], color[1], color[2]);
    vertexCount += 2;

    vertices.push(d[0], d[1], d[2], color[0], color[1], color[2]);
    vertices.push(c[0], c[1], c[2], color[0], color[1], color[2]);
    vertexCount += 2;

    vertices.push(c[0], c[1], c[2], color[0], color[1], color[2]);
    vertices.push(a[0], a[1], a[2], color[0], color[1], color[2]);
    vertexCount += 2;

    this.commands.push({
      vertices: new Float32Array(vertices),
      vertexCount: vertexCount,
      matrix: matrix
    });

    this.vertexCount += vertexCount;
  }

  /**
   * Ajoute une sphère filaire.
   *
   * @param matrix - Matrice de transformation.
   * @param radius - Rayon de la sphère.
   * @param step - Niveau de subdivision angulaire.
   * @param color - Couleur RVB.
   */
  drawSphere(matrix: mat4, radius: number = 1, step: number = 4, color: vec3 = [1, 1, 1]): void {
    let vertexCount = 0;
    const vertices: Array<number> = [];
    const points: Array<[number, number, number]> = [];
    const angleStep = (Math.PI * 0.5) / step;

    for (let i = -step; i <= step; i++) {
      const r = Math.cos(i * angleStep) * radius;
      const y = Math.sin(i * angleStep) * radius;
      for (let j = 0; j <= step * 4; j++) {
        const z = Math.sin(j * angleStep) * r;
        const x = Math.cos(j * angleStep) * r;
        points.push([x, y, z]);
      }
    }

    for (let i = -step; i <= step; i++) {
      for (let j = 0; j <= step * 4; j++) {
        const x = Math.cos(j * angleStep) * radius * Math.cos(i * angleStep);
        const y = Math.sin(j * angleStep) * radius;
        const z = Math.cos(j * angleStep) * radius * Math.sin(i * angleStep);
        points.push([x, y, z]);
      }
    }

    for (let i = 0; i < points.length - 1; i++) {
      vertices.push(points[i][0], points[i][1], points[i][2], color[0], color[1], color[2]);
      vertices.push(points[i + 1][0], points[i + 1][1], points[i + 1][2], color[0], color[1], color[2]);
      vertexCount += 2;
    }

    this.commands.push({
      vertices: new Float32Array(vertices),
      vertexCount: vertexCount,
      matrix: matrix
    });

    this.vertexCount += vertexCount;
  }

  /**
   * Ajoute une boîte englobante filaire.
   *
   * @param matrix - Matrice de transformation.
   * @param min - Sommet minimal.
   * @param max - Sommet maximal.
   * @param color - Couleur RVB.
   */
  drawBoundingBox(matrix: mat4, min: vec3, max: vec3, color: vec3 = [1, 1, 1]): void {
    let vertexCount = 0;
    const vertices: Array<number> = [];
    const a = [min[0], min[1], min[2]];
    const b = [max[0], min[1], min[2]];
    const c = [max[0], max[1], min[2]];
    const d = [min[0], max[1], min[2]];
    const e = [min[0], max[1], max[2]];
    const f = [max[0], max[1], max[2]];
    const g = [max[0], min[1], max[2]];
    const h = [min[0], min[1], max[2]];

    vertices.push(a[0], a[1], a[2], color[0], color[1], color[2]);
    vertices.push(b[0], b[1], b[2], color[0], color[1], color[2]);
    vertices.push(h[0], h[1], h[2], color[0], color[1], color[2]);
    vertices.push(g[0], g[1], g[2], color[0], color[1], color[2]);
    vertexCount += 4;

    vertices.push(d[0], d[1], d[2], color[0], color[1], color[2]);
    vertices.push(c[0], c[1], c[2], color[0], color[1], color[2]);
    vertices.push(e[0], e[1], e[2], color[0], color[1], color[2]);
    vertices.push(f[0], f[1], f[2], color[0], color[1], color[2]);
    vertexCount += 4;

    vertices.push(a[0], a[1], a[2], color[0], color[1], color[2]);
    vertices.push(d[0], d[1], d[2], color[0], color[1], color[2]);
    vertices.push(h[0], h[1], h[2], color[0], color[1], color[2]);
    vertices.push(e[0], e[1], e[2], color[0], color[1], color[2]);
    vertexCount += 4;

    vertices.push(b[0], b[1], b[2], color[0], color[1], color[2]);
    vertices.push(c[0], c[1], c[2], color[0], color[1], color[2]);
    vertices.push(g[0], g[1], g[2], color[0], color[1], color[2]);
    vertices.push(f[0], f[1], f[2], color[0], color[1], color[2]);
    vertexCount += 4;

    vertices.push(d[0], d[1], d[2], color[0], color[1], color[2]);
    vertices.push(e[0], e[1], e[2], color[0], color[1], color[2]);
    vertices.push(c[0], c[1], c[2], color[0], color[1], color[2]);
    vertices.push(f[0], f[1], f[2], color[0], color[1], color[2]);
    vertexCount += 4;

    vertices.push(a[0], a[1], a[2], color[0], color[1], color[2]);
    vertices.push(h[0], h[1], h[2], color[0], color[1], color[2]);
    vertices.push(b[0], b[1], b[2], color[0], color[1], color[2]);
    vertices.push(g[0], g[1], g[2], color[0], color[1], color[2]);
    vertexCount += 4;

    this.commands.push({
      vertices: new Float32Array(vertices),
      vertexCount: vertexCount,
      matrix: matrix
    });

    this.vertexCount += vertexCount;
  }

  /**
   * Ajoute une suite de segments reliant les points fournis par paires et entre paires successives.
   *
   * @param matrix - Matrice de transformation.
   * @param lines - Points constituant les segments.
   * @param color - Couleur RVB.
   */
  drawLines(matrix: mat4, lines: Array<vec3>, color: vec3 = [0, 1, 0]): void {
    let vertexCount = 0;
    const vertices: Array<number> = [];

    for (let i = 0; i < lines.length; i += 2) {
      vertices.push(
        lines[i][0], lines[i][1], lines[i][2], color[0], color[1], color[2],
        lines[i + 1][0], lines[i + 1][1], lines[i + 1][2], color[0], color[1], color[2]
      );

      vertexCount += 2;

      if (i + 2 < lines.length) {
        vertices.push(
          lines[i + 1][0], lines[i + 1][1], lines[i + 1][2], color[0], color[1], color[2],
          lines[i + 2][0], lines[i + 2][1], lines[i + 2][2], color[0], color[1], color[2]
        );

        vertexCount += 2;
      }
    }

    this.commands.push({
      vertices: new Float32Array(vertices),
      vertexCount: vertexCount,
      matrix: matrix
    });

    this.vertexCount += vertexCount;
  }

  /** Indique si le rendu de débogage est activé. */
  isShowDebug(): boolean {
    return this.showDebug;
  }

  /**
   * Active ou désactive le rendu des primitives de débogage.
   *
   * @param showDebug - Nouvel état d'affichage.
   */
  setShowDebug(showDebug: boolean): void {
    this.showDebug = showDebug;
  }
}

/** Instance partagée du moteur de rendu de débogage. */
export const gfx3DebugRenderer = new Gfx3DebugRenderer();