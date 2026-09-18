import { gfx3Manager } from '../gfx3/gfx3_manager';
import { UT } from '../core/utils';
import { Gfx3Texture } from '../gfx3/gfx3_texture';
import { Gfx3Flare } from './gfx3_flare';

const CENTER_SCREEN: vec2 = [0.5, 0.5];

/** Décrit la texture, l'échelle et la position relative d'un élément de halo solaire. */
export interface Gfx3FlareSunItem {
  texture: Gfx3Texture;
  scale: number;
  step: number
}

/** Gère un ensemble de halos optiques alignés entre le soleil projeté et le centre de l'écran. */
export class Gfx3FlareSun {
  flares: Array<Gfx3Flare>;
  flareItems: Array<Gfx3FlareSunItem>;
  sunFlare: Gfx3Flare;
  sunItem: Gfx3FlareSunItem | null;
  sunWorldPos: vec3;
  scaleStepFactor: number;
  maxDistanceBrightness: number;

  /** Crée un gestionnaire de halo solaire vide avec ses réglages par défaut. */
  constructor() {
    this.flares = [];
    this.flareItems = [];
    this.sunFlare = new Gfx3Flare();
    this.sunItem = null;
    this.sunWorldPos = [0, 0, 0];
    this.scaleStepFactor = 0.1;
    this.maxDistanceBrightness = 0.7;
  }

  /**
   * Configure le halo solaire et crée les halos secondaires selon la taille de la vue courante.
   *
   * @param sunPos - Position du soleil dans l'espace monde.
   * @param sun - Configuration du disque solaire principal.
   * @param items - Configurations des halos secondaires.
   * @returns Une promesse résolue lorsque tous les halos sont configurés.
   */
  async startup(sunPos: vec3, sun: Gfx3FlareSunItem, items: Array<Gfx3FlareSunItem>): Promise<void> {
    this.flareItems = items;
    this.sunItem = sun;
    this.sunWorldPos = sunPos;

    const currentView = gfx3Manager.getCurrentView();
    const viewportSize = currentView.getViewportSize();
    const minViewportSize = Math.min(viewportSize[0], viewportSize[1]);

    this.sunFlare = new Gfx3Flare();
    this.sunFlare.setTexture(sun.texture);
    this.sunFlare.setSize2D(1, 1); // special case for lens flares
    this.sunFlare.setOffset2DNormalized(0.5, 0.5);
    this.sunFlare.setScale2D(sun.scale * minViewportSize, sun.scale * minViewportSize); // special case for lens flares

    this.flares = [];
    for (const item of items) {
      const flare = new Gfx3Flare();
      flare.setTexture(item.texture);
      flare.setSize2D(1, 1);
      flare.setOffset2DNormalized(0.5, 0.5);
      flare.setScale2D(item.scale * minViewportSize, item.scale * minViewportSize);
      this.flares.push(flare);
    }
  }

  /** Projette le soleil à l'écran et met en file les halos visibles avec leur luminosité calculée. */
  draw(): void {
    const currentView = gfx3Manager.getCurrentView();
    const viewportSize = currentView.getViewportSize();

    const sunPosPx = currentView.getScreenPosition(this.sunWorldPos[0], this.sunWorldPos[1], this.sunWorldPos[2]);
    const sunPosN: vec2 = [sunPosPx[0] / viewportSize[0], sunPosPx[1] / viewportSize[1]];
    const sunToCenterN = UT.VEC2_SUBSTRACT(CENTER_SCREEN, sunPosN);
    const brightness = 1 - UT.VEC2_LENGTH(sunToCenterN) / this.maxDistanceBrightness;

    if (brightness <= 0) {
      return;
    }

    for (let i = 0; i < this.flares.length; i++) {
      const directionScaled = UT.VEC2_SCALE(sunToCenterN, this.flareItems[i].step);
      this.flares[i].setColor(1, 1, 1, brightness);

      const flarePosN = UT.VEC2_ADD(sunPosN, directionScaled);
      const flarePosPx = [flarePosN[0] * viewportSize[0], flarePosN[1] * viewportSize[1]];
      this.flares[i].setPosition2D(flarePosPx[0], flarePosPx[1]);
      this.flares[i].setColor(1, 1, 1, brightness);
      this.flares[i].draw();
    }

    this.sunFlare.setPosition2D(sunPosPx[0], sunPosPx[1]);
    this.sunFlare.draw();
  }

  /**
   * Définit la position du soleil dans l'espace monde.
   *
   * @param x - Coordonnée X.
   * @param y - Coordonnée Y.
   * @param z - Coordonnée Z.
   */
  setSunWorldPosition(x: number, y: number, z: number): void {
    this.sunWorldPos = [x, y, z];
  }

  /**
   * Définit le facteur d'échelle progressif des halos.
   *
   * @param scaleStepFactor - Facteur d'échelle à appliquer.
   */
  setScaleStepFactor(scaleStepFactor: number): void {
    this.scaleStepFactor = scaleStepFactor;
  }

  /**
   * Définit la distance normalisée au centre à laquelle la luminosité devient nulle.
   *
   * @param maxDistanceBrightness - Distance maximale de visibilité.
   */
  setMaxDistanceBrightness(maxDistanceBrightness: number): void {
    this.maxDistanceBrightness = maxDistanceBrightness;
  }

  /**
   * Remplace les halos créés par une liste personnalisée.
   *
   * @param flares - Nouvelle liste de halos.
   */
  setFlares(flares: Array<Gfx3Flare>): void {
    this.flares = flares;
  }
}