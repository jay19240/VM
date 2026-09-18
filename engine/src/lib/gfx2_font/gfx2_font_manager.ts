import { $Font, Font } from 'bdfparser';
// ---------------------------------------------------------------------------------------
import { gfx2Manager } from '../gfx2/gfx2_manager';
// ---------------------------------------------------------------------------------------

/** Options de positionnement, d'alignement et de rendu d'un texte bitmap. */
export interface Gfx2FontOptions {
  x?: number;
  y?: number;
  backgroundColor?: string;
  textColor?: string;
  glowColor?: string;
  hasGlow?: boolean;
  glowMode?: 0 | 1;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  [key: string]: any;
}

/**
 * Gestionnaire singleton des polices bitmap.
 */
export class Gfx2FontManager {
  fonts: Map<string, Font>;

  /** Crée un gestionnaire dont le cache de polices est vide. */
  constructor() {
    this.fonts = new Map<string, Font>();
  }

  /**
   * Charge une police de manière asynchrone, la met en cache et la renvoie sous forme de `Font`.
   *
   * @param {string} path - Chemin de la police à charger.
   * @param {string} storePath - Clé de cache facultative ; le chemin de la police est utilisé par défaut.
   * @returns La police chargée ou sa version déjà présente dans le cache.
   */
  async loadFont(path: string, storePath: string = ''): Promise<Font> {
    storePath = storePath ? storePath : path;
    if (this.fonts.has(storePath)) {
      return this.fonts.get(storePath)!;
    }

    const lines = readLinesFromUrl(path);
    const font = await $Font(lines);
    this.fonts.set(storePath, font);

    return font;
  }

  /**
   * Renvoie une police présente dans le cache.
   *
   * @param {string} path - Clé de cache de la police.
   * @returns La police demandée.
   * @throws Une erreur si la police n'existe pas.
   */
  getFont(path: string): Font | null {
    if (!this.fonts.has(path)) {
      throw new Error('Gfx2FontManager::getFont(): Font not found !');
    }

    return this.fonts.get(path)!;
  }

  /**
   * Supprime une police du cache.
   *
   * @param {string} path - Clé de cache de la police.
   * @throws Une erreur si la police n'existe pas.
   */
  deleteFont(path: string): void {
    if (!this.fonts.has(path)) {
      throw new Error('Gfx2FontManager::deleteFont(): The font file doesn\'t exist, cannot delete !');
    }

    this.fonts.delete(path);
  }

  /**
   * Indique si une police est présente dans le cache.
   *
   * @param {string} path - Clé de cache de la police.
   * @returns `true` si la police existe, sinon `false`.
   */
  hasFont(path: string): boolean {
    return this.fonts.has(path);
  }

  /**
   * Dessine un texte bitmap avec la police et les options indiquées.
   *
   * @param {string} path - Clé de cache de la police.
   * @param {string} text - Texte à dessiner.
   * @param {Gfx2FontOptions} options - Position, couleurs, alignement et effet lumineux du texte.
   * @throws Une erreur si la police n'existe pas.
   */
  draw(path: string, text: string, options: Gfx2FontOptions = {}) {
    const font = this.fonts.get(path);
    if (!font) {
      throw new Error('Gfx2FontManager::draw(): Font not found !');
    }

    const ctx = gfx2Manager.getContext();
    const bitmapText = font.draw(text, options as any);

    if (options.hasGlow) {
      bitmapText.glow(options.glowMode ?? 0);
    }

    let offsetX = options.x ?? 0;
    let offsetY = options.y ?? 0;

    if (options.align && options.align == 'center') {
      offsetX -= bitmapText.width() / 2;
    }
    if (options.align && options.align == 'right') {
      offsetX -= bitmapText.width();
    }

    if (options.valign && options.valign == 'middle') {
      offsetY -= bitmapText.height() / 2;
    }
    if (options.valign && options.valign == 'bottom') {
      offsetY -= bitmapText.height();
    }

    ctx.save();
    ctx.translate(offsetX, offsetY);
    bitmapText.draw2canvas(gfx2Manager.getContext(), {
      '0': options.backgroundColor ?? null,
      '1': options.textColor ?? 'white',
      '2': options.glowColor ?? 'red'
    });
    ctx.restore();
  }

  /**
   * Supprime toutes les polices mises en cache.
   */
  releaseFonts(): void {
    for (const path of this.fonts.keys()) {
      this.fonts.delete(path);
    }
  }
}

/** Instance partagée du gestionnaire de polices bitmap. */
export const gfx2FontManager = new Gfx2FontManager();

// ---------------------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------------------
async function* readLinesFromUrl(url: string): AsyncIterableIterator<string> {
  const response = await fetch(url);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      yield line;
    }
  }

  if (buffer.length > 0) {
    yield buffer;
  }
}