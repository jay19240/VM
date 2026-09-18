import { inputManager } from '../input/input_manager';
import { eventManager } from '../core/event_manager';
import { Gfx3Camera } from './gfx3_camera';
import { UT } from '../core/utils';

/** Caméra 3D orbitale contrôlable à la souris autour d'une cible. */
export class Gfx3CameraOrbit extends Gfx3Camera {
  rotationSpeed: number;
  frictionCoefficient: number;
  maxPitch: number;
  minPitch: number;
  target: vec3;
  distance: number;
  zoomSpeed: number;
  velocityPhi: number;
  velocityTheta: number;
  phi: number;
  theta: number;
  lastDragTimestamp: number;
  // ----------------------------------------------
  modeCardinal: boolean;
  phiTarget: number;
  phiOrigin: number;
  thetaTarget: number;
  transitionSpeed: number;
  targetPitch: number;
  targetRoll: number;

  /**
   * Crée une caméra orbitale et l'associe à une vue.
   *
   * @param viewIndex - Indice de la vue à piloter.
   */
  constructor(viewIndex: number) {
    super(viewIndex);
    this.rotationSpeed = 2;
    this.frictionCoefficient = 0.99;
    this.maxPitch = Math.PI * 0.5 - 0.01;
    this.minPitch = Math.PI * -0.5 + 0.01;
    this.target = [0, 0, 0];
    this.distance = 10;
    this.zoomSpeed = 0.1;
    this.velocityPhi = 0;
    this.velocityTheta = 0;
    this.phi = Math.PI * 0.5;
    this.theta = 0;
    this.lastDragTimestamp = 0;
    // cardinal ----------------------------------------------
    this.modeCardinal = false;
    this.phiTarget = Math.PI * 0.5;
    this.phiOrigin = Math.PI * 0.5;
    this.thetaTarget = this.theta;
    this.transitionSpeed = 0.12;
    this.targetPitch = 0;
    this.targetRoll = 0;

    eventManager.subscribe(inputManager, 'E_MOUSE_WHEEL', this, this.#handleMouseWheel);
    eventManager.subscribe(inputManager, 'E_MOUSE_UP', this, this.#handleMouseUp);
    eventManager.subscribe(inputManager, 'E_MOUSE_DOWN', this, this.#handleMouseDown);
    eventManager.subscribe(inputManager, 'E_MOUSE_DRAG', this, this.#handleMouseDrag);
  }

  /**
   * Désabonne la caméra de tous les événements de souris.
   * Attention : cette méthode doit être appelée explicitement lorsque la caméra n'est plus utilisée.
   */
  delete(): void {
    eventManager.unsubscribe(inputManager, 'E_MOUSE_WHEEL', this);
    eventManager.unsubscribe(inputManager, 'E_MOUSE_UP', this);
    eventManager.unsubscribe(inputManager, 'E_MOUSE_DOWN', this);
    eventManager.unsubscribe(inputManager, 'E_MOUSE_DRAG', this);
  }

  /**
   * Actualise la position orbitale, l'orientation et l'inertie de la caméra.
   *
   * @param ts - Durée écoulée depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number): void {
    if (this.modeCardinal) {
      this.phi = UT.LERP(this.phi, this.phiTarget, this.transitionSpeed);
      this.theta = UT.LERP(this.theta, this.thetaTarget, this.transitionSpeed);
    }

    const pos = UT.VEC3_ROTATE_AROUND(this.target, this.distance, this.phi, this.theta);

    if (this.modeCardinal) {
      this.#applyTargetRotation(pos, this.targetPitch, this.targetRoll);
    }

    this.setPosition(pos[0], pos[1], pos[2]);
    this.lookAt(this.target[0], this.target[1], this.target[2]);

    if (!this.modeCardinal && !inputManager.isMouseDown()) {
      this.velocityTheta *= Math.pow(1 - this.frictionCoefficient, ts / 1000);
      this.velocityPhi *= Math.pow(1 - this.frictionCoefficient, ts / 1000);
      this.theta -= this.velocityTheta;
      this.phi -= this.velocityPhi;
    }
  }

  /**
   * Définit la sensibilité de rotation à la souris.
   *
   * @param rotationSpeed - Vitesse de rotation.
   */
  setRotationSpeed(rotationSpeed: number): void {
    this.rotationSpeed = rotationSpeed;
  }

  /**
   * Définit le coefficient de friction de l'inertie ; une valeur élevée freine davantage la caméra.
   *
   * @param frictionCoefficient - Coefficient de friction.
   */
  setFrictionCoefficient(frictionCoefficient: number): void {
    this.frictionCoefficient = frictionCoefficient;
  }

  /**
   * Définit l'angle vertical maximal de l'orbite.
   *
   * @param maxPitch - Angle maximal en radians.
   */
  setMaxPitch(maxPitch: number): void {
    this.maxPitch = maxPitch;
  }

  /**
   * Définit l'angle vertical minimal de l'orbite.
   *
   * @param minPitch - Angle minimal en radians.
   */
  setMinPitch(minPitch: number): void {
    this.minPitch = minPitch;
  }

  /**
   * Définit le point autour duquel la caméra orbite et vers lequel elle regarde.
   *
   * @param target - Position de la cible dans l'espace monde.
   */
  setTarget(target: vec3): void {
    this.target = target;
  }

  /**
   * Définit l'angle horizontal autour de la cible.
   *
   * @param phi - Angle horizontal en radians.
   */
  setPhi(phi: number): void {
    this.phi = phi;
  }

  /**
   * Définit l'angle vertical autour de la cible.
   *
   * @param theta - Angle vertical en radians.
   */
  setTheta(theta: number): void {
    this.theta = theta;
  }

  /**
   * Définit la distance entre la caméra et sa cible.
   *
   * @param distance - Distance orbitale.
   */
  setDistance(distance: number): void {
    this.distance = distance;
  }

  /**
   * Définit la sensibilité du zoom à la molette.
   *
   * @param zoomSpeed - Vitesse de zoom.
   */
  setZoomSpeed(zoomSpeed: number): void {
    this.zoomSpeed = this.zoomSpeed;
  }

  /** Renvoie la vitesse de rotation. */
  getRotationSpeed(): number {
    return this.rotationSpeed;
  }

  /** Renvoie le coefficient de friction de l'inertie. */
  getFrictionCoefficient(): number {
    return this.frictionCoefficient;
  }

  /** Renvoie l'angle vertical maximal en radians. */
  getMaxPitch(): number {
    return this.maxPitch;
  }

  /** Renvoie l'angle vertical minimal en radians. */
  getMinPitch(): number {
    return this.minPitch;
  }

  /** Renvoie la position de la cible dans l'espace monde. */
  getTarget(): vec3 {
    return this.target;
  }

  /** Renvoie la distance entre la caméra et sa cible. */
  getDistance(): number {
    return this.distance;
  }

  /** Renvoie la vitesse de zoom. */
  getZoomSpeed(): number {
    return this.zoomSpeed;
  }

  /** Renvoie l'angle orbital vertical `theta`, en radians. */
  getTheta(): number {
    return this.theta;
  }

  /** Renvoie l'angle orbital horizontal `phi`, en radians. */
  getPhi(): number {
    return this.phi;
  }

  /** Oriente progressivement la caméra vers le côté gauche de la cible. */
  lookLeft() {
    this.phiTarget = this.phiOrigin + Math.PI * 0.5;
    this.modeCardinal = true;
  }

  /** Oriente progressivement la caméra vers le côté droit de la cible. */
  lookRight() {
    this.phiTarget = this.phiOrigin - Math.PI * 0.5;
    this.modeCardinal = true;
  }

  /** Oriente progressivement la caméra vers l'arrière de la cible. */
  lookBack() {
    this.phiTarget = this.phiOrigin + Math.PI;
    this.modeCardinal = true;
  }

  /** Oriente progressivement la caméra vers l'avant de la cible. */
  lookFront() {
    this.phiTarget = this.phiOrigin;
    this.modeCardinal = true;
  }

  /** Désactive les orientations cardinales et rétablit le contrôle orbital libre. */
  lookFree() {
    this.modeCardinal = false;
  }

  /**
   * Définit l'angle horizontal de référence et y place immédiatement la caméra.
   * L'origine, l'angle courant et l'angle cible sont réinitialisés ensemble.
   *
   * @param phiOrigin - Nouvel angle horizontal de référence, en radians.
   */
  setPhiOrigin(phiOrigin: number): void {
    this.phiOrigin = phiOrigin;
    this.phi = phiOrigin;
    this.phiTarget = phiOrigin;
  }

  /**
   * Définit l'angle vertical cible, limité entre les inclinaisons minimale et maximale.
   * La caméra interpole progressivement vers cette valeur.
   *
   * @param theta - Angle vertical cible en radians.
   */
  setThetaTarget(theta: number): void {
    this.thetaTarget = UT.CLAMP(theta, this.minPitch, this.maxPitch);
  }

  /**
   * Règle la vitesse d'interpolation des transitions cardinales.
   * Une valeur plus élevée rend les mouvements plus rapides et réactifs.
   *
   * @param transitionSpeed - Facteur d'interpolation appliqué à chaque mise à jour.
   */
  setTransitionSpeed(transitionSpeed: number): void {
    this.transitionSpeed = transitionSpeed;
  }

  /**
   * Définit le tangage de la cible appliqué au plan orbital.
   * Il aligne l'axe vertical de la caméra sur l'inclinaison longitudinale de la cible.
   *
   * @param targetPitch - Angle de tangage en radians.
   */
  setTargetPitch(targetPitch: number): void {
    this.targetPitch = targetPitch;
  }

  /**
   * Définit le roulis de la cible appliqué au plan orbital.
   * L'orbite horizontale reste ainsi synchronisée avec l'inclinaison latérale de la cible.
   *
   * @param targetRoll - Angle de roulis en radians.
   */
  setTargetRoll(targetRoll: number): void {
    this.targetRoll = targetRoll;
  }

  #applyTargetRotation(position: vec3, pitch: number, roll: number): void {
    // Rotate X (Pitch)
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const y1 = position[1] * cosP - position[2] * sinP;
    const z1 = position[1] * sinP + position[2] * cosP;

    // Rotate Z (Roll)
    const cosR = Math.cos(roll);
    const sinR = Math.sin(roll);
    const x2 = position[0] * cosR - y1 * sinR;
    const y2 = position[0] * sinR + y1 * cosR;

    position[0] = x2;
    position[1] = y2;
    position[2] = z1;
  }

  #handleMouseUp(): void {
    if (this.modeCardinal) {
      return;
    }

    const delta = Date.now()  - this.lastDragTimestamp;
    if (delta >= 100) {
      this.velocityTheta = 0;
      this.velocityPhi = 0;
    }
  }

  #handleMouseDown(): void {
    if (this.modeCardinal) {
      return;
    }

    this.velocityPhi = 0;
    this.velocityTheta = 0;
  }

  #handleMouseDrag(data: any): void {
    if (this.modeCardinal) {
      return;
    }

    this.velocityTheta = data.movementY * this.rotationSpeed / 1000;
    this.velocityPhi = data.movementX * this.rotationSpeed / 1000;

    this.theta -= this.velocityTheta;
    this.phi -= this.velocityPhi;
    this.theta = UT.CLAMP(this.theta, this.minPitch, this.maxPitch);
    this.lastDragTimestamp = Date.now();
  }

  #handleMouseWheel(data: any): void {
    this.distance *= 1 + data.delta * this.zoomSpeed;
  }
}