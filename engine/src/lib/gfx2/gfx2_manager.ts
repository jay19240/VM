import { UT } from '../core/utils';
import { Gfx2Drawable } from './gfx2_drawable';

/** Modes de tri disponibles pour le rendu 2D. */
export enum Gfx2RenderingMode {
  ISOMETRIC = 'ISOMETRIC',
  ORTHOGRAPHIC = 'ORTHOGRAPHIC'
};

/** Décrit un segment affiché par le rendu de débogage. */
export interface Gfx2DebugLine {
  from: vec2;
  to: vec2;
  color: string;
  width: number;
}

/**
 * Gestionnaire singleton du contexte, de la caméra et de la file de rendu 2D.
 */
export class Gfx2Manager {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  drawables: Array<Gfx2Drawable>;
  drawCommands: Array<(ctx: CanvasRenderingContext2D) => void>;
  drawDebugLines: Array<Gfx2DebugLine>;
  mode: Gfx2RenderingMode;
  cameraTransform: mat3;
  cameraScale: vec2;
  cameraRotation: number;
  cameraPosition: vec2;
  bgColor: vec4;
  offCanvas: OffscreenCanvas;
  offCtx: OffscreenCanvasRenderingContext2D;

  /**
   * Initialise les canevas, les contextes de rendu et l'état de la caméra.
   *
   * @throws Une erreur si le navigateur ne prend pas en charge le contexte Canvas 2D.
   */
  constructor() {
    this.canvas = <HTMLCanvasElement>document.getElementById('CANVAS_2D')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.drawables = [];
    this.drawCommands = [];
    this.drawDebugLines = [];
    this.mode = Gfx2RenderingMode.ORTHOGRAPHIC;
    this.cameraTransform = UT.MAT3_IDENTITY();
    this.cameraScale = [1, 1];
    this.cameraRotation = 0;
    this.cameraPosition = [0, 0];
    this.bgColor = [0, 0, 0, 1];
    this.offCanvas = new OffscreenCanvas(this.canvas.clientWidth, this.canvas.clientHeight);
    this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;

    if (!this.ctx) {
      UT.FAIL('This browser does not support canvas');
      throw new Error('Gfx2Manager::Gfx2Manager: Your browser not support 2D');
    }
  }

  /**
   * Met à jour le gestionnaire 2D.
   *
   * @param {number} ts - Temps écoulé depuis la dernière mise à jour, en millisecondes.
   */
  update(ts: number): void { }

  /**
   * Prépare le canevas et applique la transformation de caméra avant le rendu.
   *
   * Cette méthode doit être appelée avant toute commande de dessin.
   */
  beginRender(): void {
    if (this.canvas.width != this.canvas.clientWidth || this.canvas.height != this.canvas.clientHeight) {
      this.canvas.width = this.canvas.clientWidth;
      this.canvas.height = this.canvas.clientHeight;
      this.offCanvas.width = this.canvas.clientWidth;
      this.offCanvas.height = this.canvas.clientHeight;
    }

    this.ctx.imageSmoothingEnabled = false;

    this.ctx.save();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = `rgba(${this.bgColor[0]}, ${this.bgColor[1]}, ${this.bgColor[2]}, ${this.bgColor[3]})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.transform(this.cameraTransform[0], this.cameraTransform[1], this.cameraTransform[3], this.cameraTransform[4], this.cameraTransform[6], this.cameraTransform[7]);
    this.ctx.translate(this.canvas.width * 0.5, this.canvas.height * 0.5);
    this.ctx.scale(this.cameraScale[0], this.cameraScale[1]);
    this.ctx.rotate(this.cameraRotation);
    this.ctx.translate(-this.cameraPosition[0], -this.cameraPosition[1]);
  }

  /**
   * Trie puis restitue les objets, les commandes personnalisées et les lignes de débogage en attente.
   */
  render(): void {
    const sortFn = this.mode == Gfx2RenderingMode.ISOMETRIC ? ISOMETRIC_SORT : ORTHOGRAPHIC_SORT;
    this.drawables.sort(sortFn);

    for (const drawable of this.drawables) {
      drawable.render();
    }

    for (const drawCmd of this.drawCommands) {
      drawCmd(this.ctx);
    }

    for (const line of this.drawDebugLines) {
      this.ctx.beginPath();
      this.ctx.strokeStyle = line.color;
      this.ctx.lineWidth = line.width;
      this.ctx.moveTo(line.from[0], line.from[1]);
      this.ctx.lineTo(line.to[0], line.to[1]);
      this.ctx.stroke();
    }

    this.drawDebugLines = [];
  }

  /**
   * Termine la phase de rendu, restaure le contexte et vide les files de dessin.
   */
  endRender(): void {
    this.ctx.restore();
    this.drawables = [];
    this.drawCommands = [];
  }

  /**
   * Ajoute un objet à la file de rendu.
   *
   * @param {Gfx2Drawable} drawable - Objet à restituer.
   */
  draw(drawable: Gfx2Drawable): void {
    this.drawables.push(drawable);
  }

  /**
   * Ajoute un segment à la file de rendu de débogage.
   *
   * @param {number} x1 - Coordonnée horizontale du point de départ.
   * @param {number} y1 - Coordonnée verticale du point de départ.
   * @param {number} x2 - Coordonnée horizontale du point d'arrivée.
   * @param {number} y2 - Coordonnée verticale du point d'arrivée.
   * @param {string} color - Couleur CSS du segment.
   * @param {number} width - Épaisseur du segment.
   */
  drawDebugLine(x1: number, y1: number, x2: number, y2: number, color: string = 'red', width: number = 0.05) {
    this.drawDebugLines.push({
      from: [x1, y1],
      to: [x2, y2],
      color: color,
      width: width
    });
  }

  /**
   * Ajoute une commande personnalisée à la file de rendu.
   *
   * @param {(ctx: CanvasRenderingContext2D) => void} drawCmd - Fonction appelée avec le contexte Canvas 2D.
   */
  drawCommand(drawCmd: (ctx: CanvasRenderingContext2D) => void): void {
    this.drawCommands.push(drawCmd);
  }

  /**
   * Définit le mode de tri des objets à restituer.
   *
   * @param {Gfx2RenderingMode} mode - Mode de rendu orthographique ou isométrique.
   */
  setMode(mode: Gfx2RenderingMode): void {
    this.mode = mode;
  }

  /**
   * Déplace la caméra relativement à sa position actuelle.
   *
   * @param {number} x - Déplacement horizontal.
   * @param {number} y - Déplacement vertical.
   */
  moveCamera(x: number, y: number): void {
    this.cameraPosition[0] += x;
    this.cameraPosition[1] += y;
  }

  /**
   * Définit la propriété CSS `filter` du canevas.
   *
   * @param {string} filter - Filtre CSS à appliquer, par exemple un flou, une luminosité ou un contraste.
   */
  setFilter(filter: string): void {
    this.canvas.style.filter = filter;
  }

  /**
   * Indique si le canevas possède un filtre CSS actif.
   *
   * @returns `true` si un filtre est appliqué, sinon `false`.
   */
  hasFilter(): boolean {
    return this.canvas.style.filter != '' && this.canvas.style.filter != 'none';
  }

  /**
   * Convertit des coordonnées de la zone cliente en coordonnées du monde.
   *
   * @param {number} clientX - Coordonnée horizontale dans la zone cliente.
   * @param {number} clientY - Coordonnée verticale dans la zone cliente.
   * @returns La position correspondante dans le monde.
   */
  getWorldPosFromDocument(clientX: number, clientY: number): vec2 {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.x) / this.cameraScale[0]) + this.cameraPosition[0] - this.canvas.width * 0.5;
    const y = ((clientY - rect.y) / this.cameraScale[1]) + this.cameraPosition[1] - this.canvas.height * 0.5;
    return [x, y];
  }

  /**
   * Convertit une position relative au centre du canevas en coordonnées du monde.
   *
   * @param {number} x - Coordonnée horizontale relative au centre du canevas.
   * @param {number} y - Coordonnée verticale relative au centre du canevas.
   * @returns La position correspondante dans le monde.
   */
  getWorldPosFromCanvasCenter(x: number, y: number): vec2 {
    const wx = (x / this.cameraScale[0]) + this.cameraPosition[0];
    const wy = (y / this.cameraScale[1]) + this.cameraPosition[1];
    return [wx, wy];
  }

  /**
   * Renvoie la largeur d'affichage du canevas.
   *
   * @returns La largeur en pixels CSS.
   */
  getWidth(): number {
    return this.canvas.clientWidth;
  }

  /**
   * Renvoie la hauteur d'affichage du canevas.
   *
   * @returns La hauteur en pixels CSS.
   */
  getHeight(): number {
    return this.canvas.clientHeight;
  }

  /**
   * Renvoie le contexte de rendu du canevas.
   *
   * @returns Le contexte Canvas 2D principal.
   */
  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  /**
   * Définit la matrice appliquée avant la position, la rotation et l'échelle de la caméra.
   *
   * @param {mat3} cameraTransform - Matrice de transformation de la caméra.
   */
  setCameraTransform(cameraTransform: mat3): void {
    this.cameraTransform = cameraTransform;
  }

  /**
   * Renvoie la matrice de transformation de la caméra.
   *
   * @returns La matrice appliquée avant les autres transformations.
   */
  getCameraTransform(): mat3 {
    return this.cameraTransform;
  }

  /**
   * Définit la position de la caméra.
   *
   * @param {number} x - Coordonnée horizontale.
   * @param {number} y - Coordonnée verticale.
   */
  setCameraPosition(x: number, y: number): void {
    this.cameraPosition[0] = x;
    this.cameraPosition[1] = y;
  }

  /**
   * Renvoie la position de la caméra.
   *
   * @returns Les coordonnées de la caméra dans le monde.
   */
  getCameraPosition(): vec2 {
    return this.cameraPosition;
  }

  /**
   * Renvoie la coordonnée horizontale de la caméra.
   *
   * @returns La coordonnée horizontale dans le monde.
   */
  getCameraPositionX(): number {
    return this.cameraPosition[0];
  }

  /**
   * Renvoie la coordonnée verticale de la caméra.
   *
   * @returns La coordonnée verticale dans le monde.
   */
  getCameraPositionY(): number {
    return this.cameraPosition[1];
  }

  /**
   * Définit l'échelle de la caméra.
   *
   * @param {number} x - Facteur d'échelle horizontal.
   * @param {number} y - Facteur d'échelle vertical.
   */
  setCameraScale(x: number, y: number): void {
    this.cameraScale[0] = x;
    this.cameraScale[1] = y;
  }

  /**
   * Renvoie l'échelle de la caméra.
   *
   * @returns Les facteurs d'échelle horizontal et vertical.
   */
  getCameraScale(): vec2 {
    return this.cameraScale;
  }

  /**
   * Renvoie le facteur d'échelle horizontal de la caméra.
   *
   * @returns Le facteur d'échelle horizontal.
   */
  getCameraScaleX(): number {
    return this.cameraScale[0];
  }

  /**
   * Renvoie le facteur d'échelle vertical de la caméra.
   *
   * @returns Le facteur d'échelle vertical.
   */
  getCameraScaleY(): number {
    return this.cameraScale[1];
  }

  /**
   * Définit la rotation de la caméra.
   *
   * @param {number} cameraRotation - Angle de rotation en radians.
   */
  setCameraRotation(cameraRotation: number): void {
    this.cameraRotation = cameraRotation;
  }

  /**
   * Renvoie la rotation de la caméra.
   *
   * @returns L'angle de rotation en radians.
   */
  getCameraRotation(): number {
    return this.cameraRotation;
  }

  /**
   * Définit la couleur d'arrière-plan à partir de composantes RGBA.
   *
   * @param {number} r - Composante rouge.
   * @param {number} g - Composante verte.
   * @param {number} b - Composante bleue.
   * @param {number} a - Composante alpha.
   */
  setBgColor(r: number, g: number, b: number, a: number): void {
    this.bgColor[0] = r;
    this.bgColor[1] = g;
    this.bgColor[2] = b;
    this.bgColor[3] = a;
  }

  /**
   * Renvoie la couleur d'arrière-plan.
   *
   * @returns Les composantes RGBA courantes.
   */
  getBgColor(): vec4 {
    return this.bgColor;
  }

  /**
   * Crée la texture transparente par défaut.
   *
   * @returns Une image GIF transparente d'un pixel.
   */
  getDefaultTexture(): HTMLImageElement {
    const image = new Image();
    image.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    return image;
  }

  /**
   * Crée une copie de texture teintée par multiplication de ses canaux colorimétriques.
   *
   * @param texture - Texture source.
   * @param r - Multiplicateur du canal rouge.
   * @param g - Multiplicateur du canal vert.
   * @param b - Multiplicateur du canal bleu.
   * @returns Une nouvelle texture teintée.
   */
  getTintedTexture(texture: HTMLImageElement | ImageBitmap, r: number, g: number, b: number): ImageBitmap {
    this.offCanvas.width = texture.width;
    this.offCanvas.height = texture.height;
    this.offCtx.drawImage(texture, 0, 0);

    const imageData = this.offCtx.getImageData(0, 0, texture.width, texture.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      data[i + 0] *= r;
      data[i + 1] *= g;
      data[i + 2] *= b;
    }

    this.offCtx.putImageData(imageData, 0, 0);
    return this.offCanvas.transferToImageBitmap();
  }
}

/** Instance partagée du gestionnaire graphique 2D. */
export const gfx2Manager = new Gfx2Manager();

// -------------------------------------------------------------------------------------------
// HELPFUL
// -------------------------------------------------------------------------------------------

function ISOMETRIC_SORT(a: Gfx2Drawable, b: Gfx2Drawable): number {
  if (a.getElevation() < b.getElevation()) {
    return -1;
  }

  if (a.getElevation() > b.getElevation()) {
    return 1;
  }

  return a.getPositionY() - b.getPositionY();
}

function ORTHOGRAPHIC_SORT(a: Gfx2Drawable, b: Gfx2Drawable): number {
  return a.getPositionZ() - b.getPositionZ();
}