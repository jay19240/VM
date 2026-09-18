import { gfx2Manager } from '../gfx2/gfx2_manager';
import { gfx2TextureManager } from '../gfx2/gfx2_texture_manager';
import { UT } from '../core/utils';
import { Tween } from '../core/tween';
import { Gfx2Drawable } from '../gfx2/gfx2_drawable';

/** Modes de calcul de la vélocité initiale des particules. */
export enum Gfx2ParticlesVelocity {
  CLASSIC = 'CLASSIC',
  EXPLODE = 'EXPLODE'
};

/** Formes disponibles pour répartir les positions initiales des particules. */
export enum Gfx2ParticlesPosition {
  SQUARE = 'SQUARE',
  CIRCLE = 'CIRCLE'
};

/** Paramètres de génération, d'évolution et de durée de vie d'un émetteur de particules 2D. */
export interface Gfx2ParticlesOptions {
  texture: ImageBitmap | HTMLImageElement;
  globalCompositeOperation: GlobalCompositeOperation | '';
  positionStyle: Gfx2ParticlesPosition;
  positionBase: vec2;
  positionSpread: vec2;
  positionCircleRadiusBase: number;
  positionRadiusSpread: number;
  velocityStyle: Gfx2ParticlesVelocity;
  velocityBase: vec2;
  velocitySpread: vec2;
  velocityExplodeSpeedBase: number;
  velocityExplodeSpeedSpread: number;
  colorBase: vec3;
  colorSpread: vec3;
  colorTween: Tween<vec3>;
  sizeBase: number;
  sizeSpread: number;
  sizeTween: Tween<number>;
  opacityBase: number;
  opacitySpread: number;
  opacityTween: Tween<number>;
  accelerationBase: vec2;
  accelerationSpread: vec2;
  accelerationTween: Tween<vec2>;
  angleBase: number;
  angleSpread: number;
  angleVelocityBase: number;
  angleVelocitySpread: number;
  angleAccelerationBase: number;
  angleAccelerationSpread: number;
  particleDeathAge: number;
  particlesPerSecond: number;
  particleQuantity: number;
  emitterDeathAge: number;
};

/**
 * État individuel d'une particule 2D gérée par l'émetteur.
 */
class Gfx2Particle {
  position: vec2;
  velocity: vec2; // units per second
  acceleration: vec2;
  accelerationTween: Tween<vec2>;
  angle: number;
  angleVelocity: number; // degrees per second
  angleAcceleration: number; // degrees per second, per second
  color: vec3;
  colorTween: Tween<vec3>;
  size: number;
  sizeTween: Tween<number>;
  opacity: number;
  opacityTween: Tween<number>;
  age: number;
  alive: number; // use float instead of boolean for shader purposes

  constructor() {
    this.position = [0, 0];
    this.velocity = [0, 0];
    this.acceleration = [0, 0];
    this.accelerationTween = new Tween<vec2>();
    this.angle = 0;
    this.angleVelocity = 0;
    this.angleAcceleration = 0;
    this.color = [0, 0, 0];
    this.colorTween = new Tween<vec3>();
    this.size = 16.0;
    this.sizeTween = new Tween<number>();
    this.opacity = 1.0;
    this.opacityTween = new Tween<number>();
    this.age = 0;
    this.alive = 0;
  }

  /**
   * Met à jour la position, la vélocité, l'âge et les interpolations de la particule.
   *
   * @param {number} ts - Temps écoulé depuis la dernière mise à jour, en millisecondes.
   */
  update(ts: number) {
    this.position = UT.VEC2_ADD(this.position, UT.VEC2_SCALE(this.velocity, ts / 1000.0));
    this.velocity = UT.VEC2_ADD(this.velocity, UT.VEC2_SCALE(this.acceleration, ts / 1000.0));

    this.angle += this.angleVelocity * UT.DEG_TO_RAD_RATIO * (ts / 1000.0);
    this.angleVelocity += this.angleAcceleration * UT.DEG_TO_RAD_RATIO * (ts / 1000.0);
    this.age += ts / 1000.0;

    if (!this.colorTween.isEmpty()) {
      this.color = this.colorTween.interpolate(this.age);
    }

    if (!this.sizeTween.isEmpty()) {
      this.size = this.sizeTween.interpolate(this.age);
    }

    if (!this.opacityTween.isEmpty()) {
      this.opacity = this.opacityTween.interpolate(this.age);
    }

    if (!this.accelerationTween.isEmpty()) {
      this.acceleration = this.accelerationTween.interpolate(this.age);
    }
  }
}

/**
 * Émetteur qui génère, anime et restitue un ensemble de particules 2D.
 */
export class Gfx2Particles extends Gfx2Drawable implements Gfx2ParticlesOptions {
  texture: ImageBitmap | HTMLImageElement;
  globalCompositeOperation: GlobalCompositeOperation | '';
  positionStyle: Gfx2ParticlesPosition;
  positionBase: vec2;
  positionSpread: vec2;
  positionCircleRadiusBase: number;
  positionRadiusSpread: number;
  velocityStyle: Gfx2ParticlesVelocity;
  velocityBase: vec2;
  velocitySpread: vec2;
  velocityExplodeSpeedBase: number;
  velocityExplodeSpeedSpread: number;
  colorBase: vec3;
  colorSpread: vec3;
  colorTween: Tween<vec3>;
  sizeBase: number;
  sizeSpread: number;
  sizeTween: Tween<number>;
  opacityBase: number;
  opacitySpread: number;
  opacityTween: Tween<number>;
  accelerationBase: vec2;
  accelerationSpread: vec2;
  accelerationTween: Tween<vec2>;
  angleBase: number;
  angleSpread: number;
  angleVelocityBase: number;
  angleVelocitySpread: number;
  angleAccelerationBase: number;
  angleAccelerationSpread: number;
  particleDeathAge: number;
  particlesPerSecond: number;
  particleQuantity: number;
  emitterDeathAge: number;
  // ---------------------------------------------------------------------
  tintedTextures: Map<string, ImageBitmap | HTMLImageElement>;
  particleAlivedCount: number;
  particleArray: Array<Gfx2Particle>;
  emitterAge: number;
  emitterAlive: boolean;

  /**
   * Crée un émetteur et préalloue les particules selon la configuration fournie.
   *
   * @param options - Options partielles de génération et d'évolution du nuage de particules.
   */
  constructor(options: Partial<Gfx2ParticlesOptions>) {
    super();
    this.texture = options.texture ?? gfx2Manager.getDefaultTexture();
    this.globalCompositeOperation = options.globalCompositeOperation ?? '';
    this.positionStyle = options.positionStyle ?? Gfx2ParticlesPosition.SQUARE;
    this.positionBase = options.positionBase ?? [0, 0];
    this.positionSpread = options.positionSpread ?? [0, 0];
    this.positionCircleRadiusBase = options.positionCircleRadiusBase ?? 0.0;
    this.positionRadiusSpread = options.positionRadiusSpread ?? 0.0;
    this.velocityStyle = options.velocityStyle ?? Gfx2ParticlesVelocity.CLASSIC;
    this.velocityBase = options.velocityBase ?? [0, 0];
    this.velocitySpread = options.velocitySpread ?? [0, 0];
    this.velocityExplodeSpeedBase = options.velocityExplodeSpeedBase ?? 0.0;
    this.velocityExplodeSpeedSpread = options.velocityExplodeSpeedSpread ?? 0.0;
    this.colorBase = options.colorBase ?? [0, 0, 0];
    this.colorSpread = options.colorSpread ?? [0, 0, 0];
    this.colorTween = options.colorTween ?? new Tween<vec3>();
    this.sizeBase = options.sizeBase ?? 1.0;
    this.sizeSpread = options.sizeSpread ?? 0.0;
    this.sizeTween = options.sizeTween ?? new Tween<number>();
    this.opacityBase = options.opacityBase ?? 1.0;
    this.opacitySpread = options.opacitySpread ?? 0.0;
    this.opacityTween = options.opacityTween ?? new Tween<number>();
    this.accelerationBase = options.accelerationBase ?? [0, 0];
    this.accelerationSpread = options.accelerationSpread ?? [0, 0];
    this.accelerationTween = options.accelerationTween ?? new Tween<vec2>();
    this.angleBase = options.angleBase ?? 0.0;
    this.angleSpread = options.angleSpread ?? 0.0;
    this.angleVelocityBase = options.angleVelocityBase ?? 0.0;
    this.angleVelocitySpread = options.angleVelocitySpread ?? 0.0;
    this.angleAccelerationBase = options.angleAccelerationBase ?? 0.0;
    this.angleAccelerationSpread = options.angleAccelerationSpread ?? 0.0;
    this.particleDeathAge = options.particleDeathAge ?? 1.0;
    this.particlesPerSecond = options.particlesPerSecond ?? 30;
    this.particleQuantity = options.particleQuantity ?? 100;
    this.emitterDeathAge = options.emitterDeathAge ?? 60;
    // -------------------------------------------------------------------------------
    this.tintedTextures = new Map();
    this.particleAlivedCount = 0;
    this.particleArray = [];
    this.emitterAge = 0.0;
    this.emitterAlive = true;

    for (let i = 0; i < this.particleQuantity; i++) {
      this.particleArray[i] = this.#createParticle();
    }

    if (!this.colorTween.isEmpty()) {
      for (let i = 0; i <= this.particleDeathAge; i += 0.1) {
        const color = this.colorTween.interpolate(i);
        const texture = gfx2Manager.getTintedTexture(this.texture, color[0], color[1], color[2]);
        this.tintedTextures.set(i.toFixed(1), texture);
      }
    }
  }

  /**
   * Charge de manière asynchrone un fichier JSON au format PRT et crée l'émetteur correspondant.
   *
   * @param {string} path - Chemin du fichier PRT à charger.
   * @param {string} textureDir - Répertoire à préfixer au chemin de la texture référencée.
   * @returns L'émetteur configuré à partir du fichier.
   * @throws Une erreur si le fichier ne contient pas l'identifiant `PRT` attendu.
   */
  static async createFromFile(path: string, textureDir: string = ''): Promise<Gfx2Particles> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'PRT') {
      throw new Error('Gfx2Particles::createFromFile(): File not valid !');
    }

    const particle = new Gfx2Particles({
      texture: json['Texture'] ? await gfx2TextureManager.loadTexture(textureDir + json['Texture']) : undefined,
      positionStyle: json['PositionStyle'],
      positionBase: json['PositionBase'],
      positionSpread: json['PositionSpread'],
      positionCircleRadiusBase: json['PositionCircleRadiusBase'],
      positionRadiusSpread: json['PositionRadiusSpread'],
      velocityStyle: json['VelocityStyle'],
      velocityBase: json['VelocityBase'],
      velocitySpread: json['VelocitySpread'],
      velocityExplodeSpeedBase: json['VelocityExploseSpeedBase'],
      velocityExplodeSpeedSpread: json['VelocityExploseSpeedSpread'],
      colorBase: json['ColorBase'],
      colorSpread: json['ColorSpread'],
      colorTween: new Tween<vec3>(json['ColorTweenTimes'], json['ColorTweenValues'], json['ColorTweenTransition']),
      sizeBase: json['SizeBase'],
      sizeSpread: json['SizeSpread'],
      sizeTween: new Tween<number>(json['SizeTweenTimes'], json['SizeTweenValues'], json['SizeTweenTransition']),
      opacityBase: json['OpacityBase'],
      opacitySpread: json['OpacitySpread'],
      opacityTween: new Tween<number>(json['OpacityTweenTimes'], json['OpacityTweenValues'], json['OpacityTweenTransition']),
      accelerationBase: json['AccelerationBase'],
      accelerationSpread: json['AccelerationSpread'],
      accelerationTween: new Tween<vec2>(json['AccelerationTweenTimes'], json['AccelerationTweenValues'], json['AccelerationTweenTransition']),
      angleBase: json['AngleBase'],
      angleSpread: json['AngleSpread'],
      angleVelocityBase: json['AngleVelocityBase'],
      angleVelocitySpread: json['AngleVelocitySpread'],
      angleAccelerationBase: json['AngleAccelerationBase'],
      angleAccelerationSpread: json['AngleAccelerationSpread'],
      particleDeathAge: json['ParticleDeathAge'],
      particlesPerSecond: json['ParticlesPerSecond'],
      particleQuantity: json['ParticleQuantity'],
      emitterDeathAge: json['EmitterDeathAge']
    });

    return particle;
  }

  /**
   * Met à jour les particules actives, recycle celles arrivées en fin de vie et fait progresser l'émetteur.
   *
   * @param {number} ts - Temps écoulé depuis la dernière mise à jour, en millisecondes.
   */
  update(ts: number): void {
    const recycleIndices = [];

    for (let i = 0; i < this.particleQuantity; i++) {
      if (this.particleArray[i].alive) {
        this.particleArray[i].update(ts);

        if (this.particleArray[i].age > this.particleDeathAge) { // check if particle should expire; could also use: death by size<0 or alpha < 0.
          this.particleArray[i].alive = 0.0;
          this.particleAlivedCount--;
          recycleIndices.push(i);
        }
      }
    }

    if (!this.emitterAlive) { // check if particle emitter is still running
      return;
    }

    if (this.emitterAge < this.particleDeathAge) { // if no particles have died yet, then there are still particles to activate
      let startIndex = Math.round(this.particlesPerSecond * (this.emitterAge + 0)); // determine indices of particles to activate
      let endIndex = Math.round(this.particlesPerSecond * (this.emitterAge + ts / 1000.0));
      if (endIndex > this.particleQuantity) {
        endIndex = this.particleQuantity;
      }

      for (let i = startIndex; i < endIndex; i++) {
        this.particleArray[i].alive = 1.0;
        this.particleAlivedCount++;
      }
    }

    for (let i = 0; i < recycleIndices.length; i++) { // if any particles have died while the emitter is still running, we imediately recycle them
      const idx = recycleIndices[i];
      this.particleArray[idx] = this.#createParticle();
      this.particleArray[idx].alive = 1.0; // activate right away
      this.particleAlivedCount++;
    }

    this.emitterAge += ts / 1000.0;

    if (this.emitterAge > this.emitterDeathAge) { // stop emitter ?
      this.emitterAlive = false;
    }
  }

  /** Dessine toutes les particules actives avec leur taille, leur teinte et leur opacité courantes. */
  onRender(): void {
    const ctx = gfx2Manager.getContext();

    for (let i = 0; i < this.particleQuantity; i++) {
      const particle = this.particleArray[i];
      if (particle.alive) {
        const opacity = particle.opacity;
        const position = particle.position;
        const size = particle.size;
        const angle = particle.angle;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.rotate(angle);

        if (this.globalCompositeOperation) {
          ctx.globalCompositeOperation = this.globalCompositeOperation;
        }

        if (particle.colorTween.isEmpty()) {
          ctx.drawImage(this.texture, position[0] - size * 0.5, position[1] - size * 0.5, size, size);
        }
        else {
          const textureIndex = particle.age.toFixed(1);
          const texture = this.tintedTextures.get(textureIndex);
          if (texture) {
            ctx.drawImage(texture, position[0] - size * 0.5, position[1] - size * 0.5, size, size);
          }
        }

        ctx.restore();
      }
    }
  }

  /** Renvoie la texture des particules. @returns La texture source courante. */
  getTexture(): ImageBitmap | HTMLImageElement | null {
    return this.texture;
  }

  /** Renvoie les particules préallouées par l'émetteur. @returns La liste interne des particules. */
  getParticles(): Array<Gfx2Particle> {
    return this.particleArray;
  }

  /**
   * Crée une particule dont la position, la vélocité et les autres propriétés sont tirées de la configuration de l'émetteur.
   *
   * @returns La particule initialisée mais inactive.
   */
  #createParticle(): Gfx2Particle {
    const particle = new Gfx2Particle();

    if (this.positionStyle == Gfx2ParticlesPosition.SQUARE) {
      particle.position = UT.VEC2_SPREAD(this.positionBase, this.positionSpread);
    }
    else if (this.positionStyle == Gfx2ParticlesPosition.CIRCLE) {
      const positionRadius = UT.SPREAD(this.positionCircleRadiusBase, this.positionRadiusSpread);
      const a = Math.PI * 2 * Math.random();
      particle.position = UT.VEC2_ADD(this.positionBase, [positionRadius * Math.cos(a), positionRadius * Math.sin(a)]);
    }

    if (this.velocityStyle == Gfx2ParticlesVelocity.CLASSIC) {
      particle.velocity = UT.VEC2_SPREAD(this.velocityBase, this.velocitySpread);
    }
    else if (this.velocityStyle == Gfx2ParticlesVelocity.EXPLODE) {
      const direction = UT.VEC2_SUBSTRACT(particle.position, this.positionBase);
      const velocitySpeed = UT.SPREAD(this.velocityExplodeSpeedBase, this.velocityExplodeSpeedSpread);
      particle.velocity = UT.VEC2_SCALE(UT.VEC2_NORMALIZE(direction), velocitySpeed);
    }

    particle.size = UT.SPREAD(this.sizeBase, this.sizeSpread);
    particle.sizeTween = this.sizeTween;
    particle.opacity = UT.SPREAD(this.opacityBase, this.opacitySpread);
    particle.opacityTween = this.opacityTween;
    particle.acceleration = UT.VEC2_SPREAD(this.accelerationBase, this.accelerationSpread);
    particle.accelerationTween = this.accelerationTween;
    particle.color = UT.VEC3_SPREAD(this.colorBase, this.colorSpread);
    particle.colorTween = this.colorTween;
    particle.angle = UT.SPREAD(this.angleBase, this.angleSpread);
    particle.angleVelocity = UT.SPREAD(this.angleVelocityBase, this.angleVelocitySpread);
    particle.angleAcceleration = UT.SPREAD(this.angleAccelerationBase, this.angleAccelerationSpread);
    particle.age = 0;
    particle.alive = 0;
    return particle;
  }
}