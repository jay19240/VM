import { gfx2Manager } from '../gfx2/gfx2_manager';
import { Gfx2Drawable } from '../gfx2/gfx2_drawable';

/** Paramètres nécessaires à la création d'une tuile isométrique 2D. */
export interface Gfx2TileIsoOptions {
  texture: ImageBitmap | HTMLImageElement;
  animation: Array<number>;
  elevation: number;
  col: number;
  row: number;
  sx: number
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  ox: number;
  oy: number;
  dw: number;
  dh: number;
};

/** Représente une tuile isométrique pouvant être dessinée en 2D. */
export class Gfx2TileIso extends Gfx2Drawable implements Gfx2TileIsoOptions {
  texture: ImageBitmap | HTMLImageElement;
  animation: Array<number>;
  elevation: number;
  col: number;
  row: number;
  sx: number
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  ox: number;
  oy: number;
  dw: number;
  dh: number;

  /**
   * Crée une tuile isométrique à partir de ses paramètres graphiques et spatiaux.
   *
   * @param {Gfx2TileIsoOptions} options - Paramètres de configuration de la tuile.
   */
  constructor(options: Gfx2TileIsoOptions) {
    super();
    this.texture = options.texture;
    this.animation = options.animation;
    this.elevation = options.elevation;
    this.col = options.col;
    this.row = options.row;
    this.sx = options.sx;
    this.sy = options.sy;
    this.sw = options.sw;
    this.sh = options.sh;
    this.position[0] = this.dx = options.dx;
    this.position[1] = this.dy = options.dy;
    this.offset[0] = this.ox = options.ox;
    this.offset[1] = this.oy = options.oy;
    this.dw = options.dw;
    this.dh = options.dh;
  }

  /** Dessine la portion de texture de la tuile dans le contexte graphique 2D courant. */
  onRender(): void {
    if (!this.texture) {
      return;
    }

    const ctx = gfx2Manager.getContext();
    ctx.save();
    ctx.translate(-this.dw * 0.5, -this.dh);
    ctx.drawImage(this.texture, this.sx, this.sy, this.sw, this.sh, 0, 0, this.dw, this.dh);
    ctx.restore();
  }
}