import { inputManager } from '../input/input_manager';
import { eventManager } from '../core/event_manager';
import { Gfx3Camera } from './gfx3_camera';
import { UT } from '../core/utils';

/** Caméra 3D à la première personne, déplacée au clavier et orientée à la souris. */
export class Gfx3CameraWASD extends Gfx3Camera {
  movementSpeed: number;
  rotationSpeed: number;
  frictionCoefficient: number;
  velocity: vec3;
  maxPitch: number;
  minPitch: number;

  /**
   * Crée une caméra à commandes WASD et l'associe à une vue.
   *
   * @param viewIndex - Indice de la vue à piloter.
   */
  constructor(viewIndex: number) {
    super(viewIndex);
    this.movementSpeed = 10;
    this.rotationSpeed = 2;
    this.frictionCoefficient = 0.99;
    this.velocity = [0, 0, 0];
    this.maxPitch = Math.PI * 0.5 - 0.01;
    this.minPitch = Math.PI * -0.5 + 0.01;

    eventManager.subscribe(inputManager, 'E_MOUSE_DRAG', this, this.#handleMouseDrag);
  }

  /**
   * Désabonne la caméra des événements de déplacement de souris.
   * Attention : cette méthode doit être appelée explicitement lorsque la caméra n'est plus utilisée.
   */
  delete(): void {
    eventManager.unsubscribe(inputManager, 'E_MOUSE_DRAG', this);
  }

  /**
   * Actualise la vitesse et la position à partir des actions de déplacement actives.
   *
   * @param ts - Durée écoulée depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number): void {
    const cameraAxies = this.getAxies();
    let move: vec3 = [0, 0, 0];

    if (inputManager.isActiveAction('LEFT')) {
      move = UT.VEC3_ADD_SCALED(move, cameraAxies[0], -this.movementSpeed);
    }

    if (inputManager.isActiveAction('RIGHT')) {
      move = UT.VEC3_ADD_SCALED(move, cameraAxies[0], +this.movementSpeed);
    }

    if (inputManager.isActiveAction('UP')) {
      move = UT.VEC3_ADD_SCALED(move, cameraAxies[2], -this.movementSpeed);
    }

    if (inputManager.isActiveAction('DOWN')) {
      move = UT.VEC3_ADD_SCALED(move, cameraAxies[2], +this.movementSpeed);
    }

    this.velocity = UT.VEC3_LERP(move, this.velocity, Math.pow(1 - this.frictionCoefficient, ts / 1000));
    const finalMove = UT.VEC3_SCALE(this.velocity, ts / 1000);

    this.translate(finalMove[0], finalMove[1], finalMove[2]);
  }

  /**
   * Définit la vitesse de déplacement.
   *
   * @param movementSpeed - Vitesse en unités par seconde.
   */
  setMovementSpeed(movementSpeed: number): void {
    this.movementSpeed = movementSpeed;
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
   * Définit le coefficient de friction du déplacement ; une valeur élevée freine davantage la caméra.
   *
   * @param frictionCoefficient - Coefficient compris entre 0 et 1.
   */
  setFrictionCoefficient(frictionCoefficient: number): void {
    this.frictionCoefficient = frictionCoefficient;
  }

  /**
   * Définit l'angle de tangage maximal.
   *
   * @param maxPitch - Angle maximal en radians.
   */
  setMaxPitch(maxPitch: number): void {
    this.maxPitch = maxPitch;
  }

  /**
   * Définit l'angle de tangage minimal.
   *
   * @param minPitch - Angle minimal en radians.
   */
  setMinPitch(minPitch: number): void {
    this.minPitch = minPitch;
  }

  /** Renvoie la vitesse de déplacement. */
  getMovementSpeed(): number {
    return this.movementSpeed;
  }

  /** Renvoie la vitesse de rotation. */
  getRotationSpeed(): number {
    return this.rotationSpeed;
  }

  /** Renvoie le coefficient de friction du déplacement. */
  getFrictionCoefficient(): number {
    return this.frictionCoefficient;
  }

  /** Renvoie l'angle de tangage maximal en radians. */
  getMaxPitch(): number {
    return this.maxPitch;
  }

  /** Renvoie l'angle de tangage minimal en radians. */
  getMinPitch(): number {
    return this.minPitch;
  }

  #handleMouseDrag(delta: any): void {
    let newRotationX = this.rotation[0] + (delta.movementY / 1000 * this.rotationSpeed);
    let newRotationY = this.rotation[1] + (delta.movementX / 1000 * this.rotationSpeed);

    newRotationY = newRotationY % (Math.PI * 2);
    newRotationX = UT.CLAMP(newRotationX, this.minPitch, this.maxPitch);
    this.setRotation(newRotationX, newRotationY, 0);
  }
}