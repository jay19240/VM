import { eventManager } from '../core/event_manager';
import { UT } from '../core/utils';

/**
 * Déplace un point le long d'une suite de positions tridimensionnelles.
 * Émet `E_FINISHED` lorsque le parcours non bouclé atteint son terme.
 */
export class Motion {
  vertices: Array<number>;
  points: Array<vec3>;
  speed: number;
  looped: boolean;
  running: boolean;
  finished: boolean;
  currentPosition: vec3;
  currentMove: vec3;
  currentPointIndex: number;
  currentSegmentTime: number;

  /**
   * Crée un mouvement le long d'un parcours.
   *
   * @param {Array<vec3>} points - Suite ordonnée des points du parcours.
   * @param {boolean} looped - `true` pour reprendre le parcours en boucle après son dernier point.
   */
  constructor(points: Array<vec3> = [], looped: boolean = false) {
    this.vertices = [];
    this.points = points;
    this.speed = 1;
    this.looped = looped;
    this.running = false;
    this.finished = false;
    this.currentPosition = [0, 0, 0];
    this.currentMove = [0, 0, 0];
    this.currentPointIndex = 1;
    this.currentSegmentTime = 0;
  }

  /**
   * Charge de façon asynchrone un parcours depuis un fichier JSON au format JLM.
   *
   * @param {string} path - Chemin du fichier JLM.
   * @throws Une erreur si l'identifiant du fichier est absent ou différent de `JLM`.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'JLM') {
      throw new Error('Motion::loadFromFile(): File not valid !');
    }

    this.setPoints(json['Points']);
  }

  /**
   * Charge de façon asynchrone un parcours depuis un fichier binaire BLM de triplets flottants.
   *
   * @param {string} path - Chemin du fichier BLM.
   */
  async loadFromBinaryFile(path: string): Promise<void> {
    const response = await fetch(path);
    const buffer = await response.arrayBuffer();
    const data = new Float32Array(buffer);

    const points: Array<vec3> = [];
    for (var i = 0; i < data.length; i += 3) {
      points.push([data[i + 0], data[i + 1], data[i + 2]])
    }

    this.setPoints(points);
  }

  /**
   * Fait progresser la position courante le long du parcours lorsque le mouvement est actif.
   *
   * @param {number} ts - Temps écoulé depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number): void {
    if (!this.running) {
      this.currentMove = [0, 0, 0];
      return;
    }

    const currentSegment = UT.VEC3_SUBSTRACT(this.points[this.currentPointIndex], this.points[this.currentPointIndex - 1]);
    const currentSegmentDir = UT.VEC3_NORMALIZE(currentSegment);
    const currentSegmentLength = UT.VEC3_LENGTH(currentSegment);
    const progress = UT.VEC3_SUBSTRACT(this.currentPosition, this.points[this.currentPointIndex - 1]);
    const progressLength = UT.VEC3_LENGTH(progress);

    this.currentMove = UT.VEC3_SCALE(currentSegmentDir, this.speed * (ts / 1000));
    this.currentPosition[0] += this.currentMove[0];
    this.currentPosition[1] += this.currentMove[1];
    this.currentPosition[2] += this.currentMove[2];
    this.currentSegmentTime = progressLength / currentSegmentLength;

    if (progressLength > currentSegmentLength) {
      if (this.currentPointIndex == this.points.length - 1) {
        this.currentPointIndex = this.looped ? 1 : this.points.length - 1;
        this.running = this.looped ? true : false;
        this.finished = this.looped ? false : true;
        eventManager.emit(this, 'E_FINISHED');
      }
      else {
        this.currentPointIndex = this.currentPointIndex + 1;
      }
    }
  }

  /**
   * Démarre le mouvement depuis le premier point du parcours.
   *
   * @throws Une erreur si le parcours contient moins de deux points.
   */
  run(): void {
    if (this.points.length < 2) {
      throw new Error('Motion::play(): points is not defined.');
    }

    this.running = true;
    this.finished = false;
    this.currentPosition[0] = this.points[0][0];
    this.currentPosition[1] = this.points[0][1];
    this.currentPosition[2] = this.points[0][2];
    this.currentMove = [0, 0, 0];
    this.currentPointIndex = 1;
    this.currentSegmentTime = 0;
  }

  /**
   * Définit la vitesse de déplacement.
   *
   * @param {number} speed - Distance parcourue par seconde.
   */
  setSpeed(speed: number): void {
    this.speed = speed;
  }

  /**
   * Remplace les points du parcours, réinitialise son état et déduit s'il est fermé.
   *
   * @param {Array<vec3>} points - Nouvelle suite ordonnée de points.
   */
  setPoints(points: Array<vec3>): void {
    this.points = points;
    this.looped = UT.VEC3_ISEQUAL(points.at(-1)!, points.at(0)!);
    this.running = false;
    this.finished = false;

    this.vertices = [];
    for (const point of points) {
      this.vertices.push(point[0], point[0], point[2]);
    }
  }

  /** Interrompt le déplacement à sa position courante. */
  stop(): void {
    this.running = false;
  }

  /** Reprend le déplacement à sa position courante. */
  continue(): void {
    this.running = true;
  }

  /**
   * Indique si le mouvement progresse actuellement le long du parcours.
   *
   * @returns `true` si le mouvement progresse actuellement le long du parcours.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Indique si un parcours non bouclé est arrivé à son terme.
   *
   * @returns `true` si un parcours non bouclé est arrivé à son terme.
   */
  isFinished(): boolean {
    return this.finished;
  }

  /**
   * Renvoie les sommets linéarisés du parcours.
   *
   * @returns Les sommets linéarisés produits à partir des points du parcours.
   */
  getVertices(): Array<number> {
    return this.vertices;
  }

  /**
   * Renvoie les points ordonnés du parcours.
   *
   * @returns Les points ordonnés du parcours.
   */
  getPoints(): Array<vec3> {
    return this.points;
  }

  /**
   * Renvoie la position courante sur le parcours.
   *
   * @returns La position courante sur le parcours.
   */
  getCurrentPosition(): vec3 {
    return this.currentPosition;
  }

  /**
   * Renvoie la coordonnée X de la position courante.
   *
   * @returns La coordonnée X de la position courante.
   */
  getCurrentPositionX(): number {
    return this.currentPosition[0];
  }

  /**
   * Renvoie la coordonnée Y de la position courante.
   *
   * @returns La coordonnée Y de la position courante.
   */
  getCurrentPositionY(): number {
    return this.currentPosition[1];
  }

  /**
   * Renvoie la coordonnée Z de la position courante.
   *
   * @returns La coordonnée Z de la position courante.
   */
  getCurrentPositionZ(): number {
    return this.currentPosition[2];
  }

  /**
   * Renvoie le déplacement appliqué pendant la dernière mise à jour.
   *
   * @returns Le déplacement appliqué pendant la dernière mise à jour.
   */
  getCurrentMove(): vec3 {
    return this.currentMove;
  }

  /**
   * Renvoie la composante X du dernier déplacement.
   *
   * @returns La composante X du dernier déplacement.
   */
  getCurrentMoveX(): number {
    return this.currentMove[0];
  }

  /**
   * Renvoie la composante Y du dernier déplacement.
   *
   * @returns La composante Y du dernier déplacement.
   */
  getCurrentMoveY(): number {
    return this.currentMove[1];
  }

  /**
   * Renvoie la composante Z du dernier déplacement.
   *
   * @returns La composante Z du dernier déplacement.
   */
  getCurrentMoveZ(): number {
    return this.currentMove[2];
  }

  /**
   * Calcule l'angle d'orientation courant autour de l'axe Y.
   *
   * @returns L'angle d'orientation courant autour de l'axe Y, en radians.
   */
  getCurrentRotationY(): number {
    return UT.VEC2_ANGLE([this.currentMove[0], this.currentMove[2]]);
  }

  /**
   * Calcule l'angle d'orientation courant autour de l'axe Z.
   *
   * @returns L'angle d'orientation courant autour de l'axe Z, en radians.
   */
  getCurrentRotationZ(): number {
    return UT.VEC2_ANGLE([this.currentMove[0], this.currentMove[1]]);
  }

  /**
   * Renvoie l'indice du point situé au début du segment courant.
   *
   * @returns L'indice du point situé au début du segment courant.
   */
  getPrevPointIndex(): number {
    return this.currentPointIndex - 1;
  }

  /**
   * Renvoie l'indice du point situé à la fin du segment courant.
   *
   * @returns L'indice du point situé à la fin du segment courant.
   */
  getNextPointIndex(): number {
    return this.currentPointIndex;
  }

  /**
   * Renvoie le point situé au début du segment courant.
   *
   * @returns Le point situé au début du segment courant.
   */
  getPrevPoint(): vec3 {
    return this.points[this.currentPointIndex - 1];
  }

  /**
   * Renvoie le point situé à la fin du segment courant.
   *
   * @returns Le point situé à la fin du segment courant.
   */
  getNextPoint(): vec3 {
    return this.points[this.currentPointIndex];
  }

  /**
   * Renvoie la progression normalisée sur le segment courant.
   *
   * @returns La progression normalisée sur le segment courant, généralement comprise entre 0 et 1.
   */
  getCurrentSegmentTime(): number {
    return this.currentSegmentTime;
  }
}