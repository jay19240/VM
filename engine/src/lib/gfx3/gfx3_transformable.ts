import { UT } from '../core/utils';

enum Gfx3Axis {
  FORWARD = 'FORWARD',
  BACKWARD = 'BACKWARD',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  UP = 'UP',
  DOWN = 'DOWN'
};

/** Objet 3D transformable par position, rotation, échelle, visée ou matrice manuelle. */
export class Gfx3Transformable {
  position: vec3;
  rotation: vec3;
  scale: vec3;
  lookTarget: vec3 | null;
  lookUp: vec3;
  transformMatrix: mat4;
  useTransformMatrix: boolean;

  /** Initialise une transformation identité à l'origine. */
  constructor() {
    this.position = [0.0, 0.0, 0.0];
    this.rotation = [0.0, 0.0, 0.0];
    this.scale = [1.0, 1.0, 1.0];
    this.lookTarget = null;
    this.lookUp = [0, 1, 0];
    this.transformMatrix = UT.MAT4_IDENTITY();
    this.useTransformMatrix = false;
  }

  /** Renvoie la position dans l'espace parent. */
  getPosition(): vec3 {
    return this.position;
  }

  /** Renvoie la coordonnée X de la position. */
  getPositionX(): number {
    return this.position[0];
  }

  /** Renvoie la coordonnée Y de la position. */
  getPositionY(): number {
    return this.position[1];
  }

  /** Renvoie la coordonnée Z de la position. */
  getPositionZ(): number {
    return this.position[2];
  }

 /**
   * Définit la position dans l'espace parent.
   *
   * @param x - Coordonnée X.
   * @param y - Coordonnée Y.
   * @param z - Coordonnée Z.
   */
  setPosition(x: number, y: number, z: number): void {
    this.position[0] = x;
    this.position[1] = y;
    this.position[2] = z;
  }

  /**
   * Définit la coordonnée X de la position.
   *
   * @param x - Nouvelle coordonnée X.
   */
  setPositionX(x: number) {
    this.position[0] = x;
  }

  /**
   * Définit la coordonnée Y de la position.
   *
   * @param y - Nouvelle coordonnée Y.
   */
  setPositionY(y: number) {
    this.position[1] = y;
  }

  /**
   * Définit la coordonnée Z de la position.
   *
   * @param z - Nouvelle coordonnée Z.
   */
  setPositionZ(z: number) {
    this.position[2] = z;
  }

  /**
   * Ajoute une translation à la position.
   *
   * @param x - Déplacement sur X.
   * @param y - Déplacement sur Y.
   * @param z - Déplacement sur Z.
   */
  translate(x: number, y: number, z: number): void {
    this.position[0] += x;
    this.position[1] += y;
    this.position[2] += z;
  }

  /** Renvoie les angles d'Euler en radians. */
  getRotation(): vec3 {
    return this.rotation;
  }

  /** Renvoie la rotation sur X en radians. */
  getRotationX(): number {
    return this.rotation[0];
  }

  /** Renvoie la rotation sur Y en radians. */
  getRotationY(): number {
    return this.rotation[1];
  }

  /** Renvoie la rotation sur Z en radians. */
  getRotationZ(): number {
    return this.rotation[2];
  }

  /**
   * Définit les angles d'Euler et désactive la visée vers une cible.
   *
   * @param x - Rotation sur X en radians.
   * @param y - Rotation sur Y en radians.
   * @param z - Rotation sur Z en radians.
   */
  setRotation(x: number, y: number, z: number): void {
    this.rotation[0] = x;
    this.rotation[1] = y;
    this.rotation[2] = z;
    this.lookTarget = null;
  }

  /**
   * Définit la rotation sur X et désactive la visée.
   *
   * @param x - Angle en radians.
   */
  setRotationX(x: number) {
    this.rotation[0] = x;
    this.lookTarget = null;
  }

  /**
   * Définit la rotation sur Y et désactive la visée.
   *
   * @param y - Angle en radians.
   */
  setRotationY(y: number) {
    this.rotation[1] = y;
    this.lookTarget = null;
  }

  /**
   * Définit la rotation sur Z et désactive la visée.
   *
   * @param z - Angle en radians.
   */
  setRotationZ(z: number) {
    this.rotation[2] = z;
    this.lookTarget = null;
  }

  /**
   * Ajoute des angles d'Euler et désactive la visée.
   *
   * @param x - Rotation ajoutée sur X en radians.
   * @param y - Rotation ajoutée sur Y en radians.
   * @param z - Rotation ajoutée sur Z en radians.
   */
  rotate(x: number, y: number, z: number): void {
    this.rotation[0] += x;
    this.rotation[1] += y;
    this.rotation[2] += z;
    this.lookTarget = null;
  }

  /** Renvoie les facteurs d'échelle sur les trois axes. */
  getScale(): vec3 {
    return this.scale;
  }

  /** Renvoie le facteur d'échelle sur X. */
  getScaleX(): number {
    return this.scale[0];
  }

  /** Renvoie le facteur d'échelle sur Y. */
  getScaleY(): number {
    return this.scale[1];
  }

  /** Renvoie le facteur d'échelle sur Z. */
  getScaleZ(): number {
    return this.scale[2];
  }

  /**
   * Définit les facteurs d'échelle sur les trois axes.
   *
   * @param x - Facteur sur X.
   * @param y - Facteur sur Y.
   * @param z - Facteur sur Z.
   */
  setScale(x: number, y: number, z: number): void {
    this.scale[0] = x;
    this.scale[1] = y;
    this.scale[2] = z;
  }

  /**
   * Définit le facteur d'échelle sur X.
   *
   * @param x - Nouveau facteur sur X.
   */
  setScaleX(x: number) {
    this.scale[0] = x;
  }

  /**
   * Définit le facteur d'échelle sur Y.
   *
   * @param y - Nouveau facteur sur Y.
   */
  setScaleY(y: number) {
    this.scale[1] = y;
  }

  /**
   * Définit le facteur d'échelle sur Z.
   *
   * @param z - Nouveau facteur sur Z.
   */
  setScaleZ(z: number) {
    this.scale[2] = z;
  }

  /**
   * Ajoute des valeurs aux facteurs d'échelle.
   *
   * @param x - Valeur ajoutée sur X.
   * @param y - Valeur ajoutée sur Y.
   * @param z - Valeur ajoutée sur Z.
   */
  zoom(x: number, y: number, z: number): void {
    this.scale[0] += x;
    this.scale[1] += y;
    this.scale[2] += z;
  }

  /**
   * Calcule ou renvoie la matrice selon le mode manuel, la visée ou les composantes usuelles.
   *
   * @returns La matrice de transformation courante.
   */
  getTransformMatrix(): mat4 {
    if (this.useTransformMatrix) {
      return this.transformMatrix;
    }

    if (this.lookTarget) {
      UT.MAT4_LOOKAT(this.position, this.lookTarget, this.lookUp, this.transformMatrix);
      UT.MAT4_MULTIPLY(this.transformMatrix, UT.MAT4_SCALE(this.scale[0], this.scale[1], this.scale[2]), this.transformMatrix);
    }
    else {
      UT.MAT4_TRANSFORM(this.position, this.rotation, this.scale, this.transformMatrix);
    }

    return this.transformMatrix;
  }

  /**
   * Active le mode manuel avec une matrice de transformation explicite.
   *
   * @param matrix - Matrice à utiliser telle quelle.
   */
  enableManualTransform(matrix: mat4): void {
    this.transformMatrix = matrix;
    this.useTransformMatrix = true;
  }

  /** Désactive le mode manuel et rétablit le calcul de la matrice depuis les composantes. */
  disableManualTransform(): void {
    this.useTransformMatrix = false;
  }

  /**
   * Oriente l'objet vers une cible plutôt que d'utiliser ses angles d'Euler.
   *
   * @param x - Coordonnée X de la cible.
   * @param y - Coordonnée Y de la cible.
   * @param z - Coordonnée Z de la cible.
   * @param up - Vecteur définissant la verticale de l'objet.
   */
  lookAt(x: number, y: number, z:number, up: vec3 = [0, 1, 0]): void {
    this.lookTarget = [x, y, z];
    this.lookUp = up;
  }

  /** Renvoie les trois axes locaux, échelle comprise. */
  getAxies(): Array<vec3> {
    const matrix = this.getTransformMatrix();
    return [
      [matrix[0], matrix[1], matrix[2]],
      [matrix[4], matrix[5], matrix[6]],
      [matrix[8], matrix[9], matrix[10]]
    ];
  }

  /** Renvoie les trois axes locaux normalisés. */
  getNormalizedAxies(): Array<vec3> {
    const matrix = this.getTransformMatrix();
    return [
      UT.VEC3_NORMALIZE([matrix[0], matrix[1], matrix[2]]),
      UT.VEC3_NORMALIZE([matrix[4], matrix[5], matrix[6]]),
      UT.VEC3_NORMALIZE([matrix[8], matrix[9], matrix[10]])
    ];
  }

  /**
   * Renvoie un axe local orienté selon la direction demandée.
   *
   * @param axis - Direction locale recherchée.
   * @returns Le vecteur de l'axe, échelle comprise.
   */
  getAxis(axis: Gfx3Axis): vec3 {
    const axies = this.getAxies();

    if (axis == Gfx3Axis.FORWARD) {
      return [-axies[2][0], -axies[2][1], -axies[2][2]];
    }
    else if (axis == Gfx3Axis.BACKWARD) {
      return [axies[2][0], axies[2][1], axies[2][2]];
    }
    else if (axis == Gfx3Axis.LEFT) {
      return [-axies[0][0], -axies[0][1], -axies[0][2]];
    }
    else if (axis == Gfx3Axis.RIGHT) {
      return [axies[0][0], axies[0][1], axies[0][2]];
    }
    else if (axis == Gfx3Axis.UP) {
      return [axies[1][0], axies[1][1], axies[1][2]];
    }
    else {
      return [-axies[1][0], -axies[1][1], -axies[1][2]];
    }
  }

  /**
   * Copie toutes les composantes de transformation dans un autre objet.
   *
   * @param transformable - Objet de destination, ou nouvelle instance par défaut.
   * @returns L'objet de destination renseigné.
   */
  clone(transformable: Gfx3Transformable = new Gfx3Transformable()): Gfx3Transformable {
    transformable.position = [this.position[0], this.position[1], this.position[2]];
    transformable.rotation = [this.rotation[0], this.rotation[1], this.rotation[2]];
    transformable.scale = [this.scale[0], this.scale[1], this.scale[2]];
    transformable.lookTarget = this.lookTarget ? [this.lookTarget[0], this.lookTarget[1], this.lookTarget[2]] : null;
    transformable.lookUp = [this.lookUp[0], this.lookUp[1], this.lookUp[2]];
    transformable.transformMatrix = UT.MAT4_COPY(this.transformMatrix, transformable.transformMatrix);
    transformable.useTransformMatrix = this.useTransformMatrix;
    return transformable;
  }
}