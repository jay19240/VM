import { UT } from '../core/utils';

/** Modes de projection pris en charge par une vue 3D. */
export enum Gfx3ProjectionMode {
  PERSPECTIVE = 'PERSPECTIVE',
  ORTHOGRAPHIC = 'ORTHOGRAPHIC'
};

/** Rectangle de vue exprimé par des facteurs normalisés de la surface de rendu. */
export interface Gfx3Viewport {
  xFactor: number;
  yFactor: number;
  widthFactor: number;
  heightFactor: number;
};

/** Regroupe la caméra, le viewport, la projection et la couleur de fond d'une vue 3D. */
export class Gfx3View {
  cameraMatrix: mat4;
  clipOffset: vec2;
  minClipOffset: vec2;
  maxClipOffset: vec2;
  viewport: Gfx3Viewport;
  projectionMode: Gfx3ProjectionMode;
  perspectiveFovy: number;
  perspectiveNear: number;
  perspectiveFar: number;
  orthographicSize: number;
  orthographicDepth: number;
  bgColor: vec4;
  screenSize: vec2;

  /** Crée une vue perspective plein écran avec des paramètres par défaut. */
  constructor() {
    this.cameraMatrix = UT.MAT4_IDENTITY();
    this.clipOffset = [0.0, 0.0];
    this.minClipOffset = [-Infinity, -Infinity];
    this.maxClipOffset = [+Infinity, +Infinity];
    this.viewport = { xFactor: 0, yFactor: 0, widthFactor: 1, heightFactor: 1 };
    this.projectionMode = Gfx3ProjectionMode.PERSPECTIVE;
    this.perspectiveFovy = Math.PI / 4;
    this.perspectiveNear = 0.1;
    this.perspectiveFar = 2000;
    this.orthographicSize = 1;
    this.orthographicDepth = 700;
    this.bgColor = [0.0, 0.0, 0.0, 1.0];
    this.screenSize = [0, 0];
  }

  /** Renvoie la position extraite de la matrice de caméra. */
  getCameraPosition(): vec3 {
    return [
      this.cameraMatrix[12],
      this.cameraMatrix[13],
      this.cameraMatrix[14]
    ];
  }

  /** Renvoie le décalage appliqué dans l'espace de découpage. */
  getClipOffset(): vec2 {
    return this.clipOffset;
  }

  /** Renvoie la composante X du décalage de découpage. */
  getClipOffsetX(): number {
    return this.clipOffset[0];
  }

  /**
   * Définit la composante X du décalage de découpage.
   *
   * @param x - Nouvelle composante X.
   */
  setClipOffsetX(x: number): void {
    this.clipOffset[0] = x;
  }

  /** Renvoie la composante Y du décalage de découpage. */
  getClipOffsetY(): number {
    return this.clipOffset[1];
  }

  /**
   * Définit la composante Y du décalage de découpage.
   *
   * @param y - Nouvelle composante Y.
   */
  setClipOffsetY(y: number): void {
    this.clipOffset[1] = y;
  }

  /**
   * Ajuste et borne le décalage de découpage afin de recentrer la vue sur une cible.
   *
   * @param target - Position cible dans l'espace monde.
   */
  clipToTarget(target: vec3): void {
    let targetScreenPosition = this.getScreenNormalizedPosition(target[0], target[1], target[2]);
    this.setClipOffsetX(UT.CLAMP(targetScreenPosition[0] + this.clipOffset[0], this.minClipOffset[0], this.maxClipOffset[0]));
    this.setClipOffsetY(UT.CLAMP(targetScreenPosition[1] + this.clipOffset[1], this.minClipOffset[1], this.maxClipOffset[1]));
  }

  /** Renvoie la limite minimale du décalage de découpage. */
  getMinClipOffset(): vec2 {
    return this.minClipOffset;
  }

  /**
   * Définit la limite minimale sur X du décalage de découpage.
   *
   * @param x - Limite minimale sur X.
   */
  setMinClipOffsetX(x: number): void {
    this.minClipOffset[0] = x;
  }

  /**
   * Définit la limite minimale sur Y du décalage de découpage.
   *
   * @param y - Limite minimale sur Y.
   */
  setMinClipOffsetY(y: number): void {
    this.minClipOffset[1] = y;
  }

  /** Renvoie la limite maximale du décalage de découpage. */
  getMaxClipOffset(): vec2 {
    return this.maxClipOffset;
  }

  /**
   * Définit la limite maximale sur X du décalage de découpage.
   *
   * @param x - Limite maximale sur X.
   */
  setMaxClipOffsetX(x: number): void {
    this.maxClipOffset[0] = x;
  }

  /**
   * Définit la limite maximale sur Y du décalage de découpage.
   *
   * @param y - Limite maximale sur Y.
   */
  setMaxClipOffsetY(y: number): void {
    this.maxClipOffset[1] = y;
  }

  /** Renvoie la matrice de transformation de la caméra. */
  getCameraMatrix(): mat4 {
    return this.cameraMatrix;
  }

  /**
   * Définit la matrice de transformation de la caméra.
   *
   * @param cameraMatrix - Nouvelle matrice de caméra.
   */
  setCameraMatrix(cameraMatrix: mat4): void {
    this.cameraMatrix = cameraMatrix;
  }

  /** Renvoie le rectangle de vue normalisé. */
  getViewport(): Gfx3Viewport {
    return this.viewport;
  }

  /**
   * Définit le rectangle de vue normalisé.
   *
   * @param viewport - Nouveau viewport.
   */
  setViewport(viewport: Gfx3Viewport): void {
    this.viewport = viewport;
  }

  /** Renvoie le mode de projection courant. */
  getProjectionMode(): Gfx3ProjectionMode {
    return this.projectionMode;
  }

  /**
   * Définit le mode de projection.
   *
   * @param projectionMode - Mode perspective ou orthographique.
   */
  setProjectionMode(projectionMode: Gfx3ProjectionMode): void {
    this.projectionMode = projectionMode;
  }

  /** Renvoie l'angle d'ouverture vertical en perspective, en radians. */
  getPerspectiveFovy(): number {
    return this.perspectiveFovy;
  }

  /**
   * Définit l'angle d'ouverture vertical de la projection perspective.
   *
   * @param perspectiveFovy - Angle en radians.
   */
  setPerspectiveFovy(perspectiveFovy: number): void {
    this.perspectiveFovy = perspectiveFovy;
  }

  /** Renvoie la distance du plan de découpage proche en perspective. */
  getPerspectiveNear(): number {
    return this.perspectiveNear;
  }

  /**
   * Définit la distance du plan de découpage proche en perspective.
   *
   * @param perspectiveNear - Distance du plan proche.
   */
  setPerspectiveNear(perspectiveNear: number): void {
    this.perspectiveNear = perspectiveNear;
  }

  /** Renvoie la distance du plan de découpage lointain en perspective. */
  getPerspectiveFar(): number {
    return this.perspectiveFar;
  }

  /**
   * Définit la distance maximale de rendu en perspective.
   *
   * @param perspectiveFar - Distance du plan lointain.
   */
  setPerspectiveFar(perspectiveFar: number): void {
    this.perspectiveFar = perspectiveFar;
  }

  /** Renvoie l'étendue visible de la projection orthographique. */
  getOrthographicSize(): number {
    return this.orthographicSize;
  }

  /**
   * Définit l'étendue visible de la projection orthographique.
   *
   * @param orthographicSize - Taille du volume visible.
   */
  setOrthographicSize(orthographicSize: number): void {
    this.orthographicSize = orthographicSize;
  }

  /** Renvoie la profondeur de la projection orthographique. */
  getOrthographicDepth(): number {
    return this.orthographicDepth;
  }

  /**
   * Définit la profondeur de la projection orthographique.
   *
   * @param orthographicDepth - Profondeur du volume de vue.
   */
  setOrthographicDepth(orthographicDepth: number): void {
    this.orthographicDepth = orthographicDepth;
  }

  /** Renvoie la couleur de fond RGBA normalisée. */
  getBgColor(): vec4 {
    return this.bgColor;
  }

  /**
   * Définit la couleur utilisée pour effacer la vue.
   *
   * @param r - Composante rouge entre 0 et 1.
   * @param g - Composante verte entre 0 et 1.
   * @param b - Composante bleue entre 0 et 1.
   * @param a - Composante alpha entre 0 et 1.
   */
  setBgColor(r: number, g: number, b: number, a: number): void {
    this.bgColor[0] = r;
    this.bgColor[1] = g;
    this.bgColor[2] = b;
    this.bgColor[3] = a;
  }

  /** Renvoie la résolution de la surface de rendu en pixels physiques. */
  getScreenSize(): vec2 {
    return this.screenSize;
  }

  /**
   * Met à jour la résolution de référence de la vue à l'usage interne du gestionnaire graphique.
   * Pour redimensionner l'affichage, utilisez `CoreManager` plutôt que cette méthode.
   *
   * @param width - Largeur en pixels physiques.
   * @param height - Hauteur en pixels physiques.
   */
  setScreenSize(width: number, height: number): void {
    this.screenSize[0] = width;
    this.screenSize[1] = height;
  }

  /** Renvoie les dimensions du viewport en pixels physiques. */
  getViewportSize(): vec2 {
    const w = this.screenSize[0] * this.viewport.widthFactor;
    const h = this.screenSize[1] * this.viewport.heightFactor;
    return [w, h];
  }

  /** Renvoie les dimensions du viewport en pixels CSS. */
  getViewportClientSize(): vec2 {
    const cw = (this.screenSize[0] * this.viewport.widthFactor) / window.devicePixelRatio;
    const ch = (this.screenSize[1] * this.viewport.heightFactor) / window.devicePixelRatio;
    return [cw, ch];
  }

  /** Renvoie la matrice de projection correspondant au mode et au rapport d'aspect courants. */
  getProjectionMatrix(): mat4 {
    const matrix = UT.MAT4_IDENTITY();
    const viewportWidth = this.screenSize[0] * this.viewport.widthFactor;
    const viewportHeight = this.screenSize[1] * this.viewport.heightFactor;
    const viewportAspect = viewportWidth / viewportHeight;

    if (this.projectionMode == Gfx3ProjectionMode.PERSPECTIVE) {
      UT.MAT4_PERSPECTIVE(this.perspectiveFovy, viewportAspect, this.perspectiveNear, this.perspectiveFar, matrix);
    }
    else if (this.projectionMode == Gfx3ProjectionMode.ORTHOGRAPHIC) {
      UT.MAT4_ORTHOGRAPHIC(this.orthographicSize, this.orthographicSize / viewportAspect, this.orthographicDepth, matrix);
    }

    return matrix;
  }

  /** Renvoie la matrice inverse du décalage de découpage. */
  getClipMatrix(): mat4 {
    return UT.MAT4_INVERT(UT.MAT4_TRANSLATE(this.clipOffset[0], this.clipOffset[1], 0));
  }

  /** Renvoie la matrice de vue, inverse de la matrice de caméra. */
  getCameraViewMatrix(): mat4 {
    return UT.MAT4_INVERT(this.cameraMatrix);
  }

  /** Renvoie le produit des matrices de découpage et de projection. */
  getProjectionClipMatrix(): mat4 {
    const matrix = UT.MAT4_IDENTITY();
    UT.MAT4_MULTIPLY(matrix, this.getClipMatrix(), matrix);
    UT.MAT4_MULTIPLY(matrix, this.getProjectionMatrix(), matrix);
    return matrix;
  }

  /** Renvoie le produit des matrices de découpage, de projection et de vue. */
  getViewProjectionClipMatrix(): mat4 {
    const matrix = UT.MAT4_IDENTITY();
    UT.MAT4_MULTIPLY(matrix, this.getClipMatrix(), matrix);
    UT.MAT4_MULTIPLY(matrix, this.getProjectionMatrix(), matrix);
    UT.MAT4_MULTIPLY(matrix, this.getCameraViewMatrix(), matrix);
    return matrix;
  }

  /** Renvoie la matrice de projection-découpage utilisant uniquement la translation de la vue, adaptée aux billboards. */
  getBillboardProjectionClipMatrix(): mat4 {
    const matrix = UT.MAT4_IDENTITY();
    const viewMatrix = this.getCameraViewMatrix();
    UT.MAT4_MULTIPLY(matrix, this.getClipMatrix(), matrix);
    UT.MAT4_MULTIPLY(matrix, this.getProjectionMatrix(), matrix);
    UT.MAT4_MULTIPLY(matrix, UT.MAT4_TRANSLATE(viewMatrix[12], viewMatrix[13], viewMatrix[14]), matrix);
    return matrix;
  }

  /**
   * Projette un point du monde en pixels physiques du viewport.
   *
   * @param x - Coordonnée X dans le monde.
   * @param y - Coordonnée Y dans le monde.
   * @param z - Coordonnée Z dans le monde.
   * @returns La position écran, ou `[-Infinity, -Infinity]` si le point se trouve derrière la caméra.
   */
  getScreenPosition(x: number, y: number, z: number): vec2 {
    const matrix = UT.MAT4_IDENTITY();
    UT.MAT4_MULTIPLY(matrix, this.getClipMatrix(), matrix);
    UT.MAT4_MULTIPLY(matrix, this.getProjectionMatrix(), matrix);
    UT.MAT4_MULTIPLY(matrix, this.getCameraViewMatrix(), matrix);

    const pos = UT.MAT4_MULTIPLY_BY_VEC4(matrix, [x, y, z, 1]);
    if (pos[3] <= 0) {
      return [-Infinity, -Infinity];
    }

    const viewportSize = this.getViewportSize();

    pos[0] = pos[0] / pos[3];
    pos[1] = pos[1] / pos[3];
    pos[0] = ((pos[0] + 1.0) * viewportSize[0]) / (2.0);
    pos[1] = viewportSize[1] - ((pos[1] + 1.0) * viewportSize[1]) / (2.0);
    return [pos[0], pos[1]];
  }

  /**
   * Projette un point du monde en pixels CSS du viewport.
   *
   * @param x - Coordonnée X dans le monde.
   * @param y - Coordonnée Y dans le monde.
   * @param z - Coordonnée Z dans le monde.
   * @returns La position dans l'espace client du viewport.
   */
  getClientScreenPosition(x: number, y: number, z: number): vec2 {
    const matrix = UT.MAT4_IDENTITY();
    UT.MAT4_MULTIPLY(matrix, this.getClipMatrix(), matrix);
    UT.MAT4_MULTIPLY(matrix, this.getProjectionMatrix(), matrix);
    UT.MAT4_MULTIPLY(matrix, this.getCameraViewMatrix(), matrix);

    const pos = UT.MAT4_MULTIPLY_BY_VEC4(matrix, [x, y, z, 1]);
    const viewportClientSize = this.getViewportClientSize();

    pos[0] = pos[0] / pos[3];
    pos[1] = pos[1] / pos[3];
    pos[0] = ((pos[0] + 1.0) * viewportClientSize[0]) / (2.0);
    pos[1] = viewportClientSize[1] - ((pos[1] + 1.0) * viewportClientSize[1]) / (2.0);
    return [pos[0], pos[1]];
  }

  /**
   * Projette un point du monde dans l'espace écran normalisé compris entre -1 et 1.
   *
   * @param x - Coordonnée X dans le monde.
   * @param y - Coordonnée Y dans le monde.
   * @param z - Coordonnée Z dans le monde.
   * @returns Les coordonnées normalisées du point.
   */
  getScreenNormalizedPosition(x: number, y: number, z: number): vec2 {
    const matrix = UT.MAT4_IDENTITY();
    UT.MAT4_MULTIPLY(matrix, this.getClipMatrix(), matrix);
    UT.MAT4_MULTIPLY(matrix, this.getProjectionMatrix(), matrix);
    UT.MAT4_MULTIPLY(matrix, this.getCameraViewMatrix(), matrix);

    const pos = UT.MAT4_MULTIPLY_BY_VEC4(matrix, [x, y, z, 1]);
    return [pos[0] / pos[3], pos[1] / pos[3]];
  }

  /**
   * Projette un point du monde dans l'espace écran normalisé compris entre 0 et 1.
   *
   * @param x - Coordonnée X dans le monde.
   * @param y - Coordonnée Y dans le monde.
   * @param z - Coordonnée Z dans le monde.
   * @returns Les coordonnées normalisées du point.
   */
  getScreenNormalizedPositionZeroToOne(x: number, y: number, z: number): vec2 {
    const matrix = UT.MAT4_IDENTITY();
    UT.MAT4_MULTIPLY(matrix, this.getClipMatrix(), matrix);
    UT.MAT4_MULTIPLY(matrix, this.getProjectionMatrix(), matrix);
    UT.MAT4_MULTIPLY(matrix, this.getCameraViewMatrix(), matrix);

    const pos = UT.MAT4_MULTIPLY_BY_VEC4(matrix, [x, y, z, 1]);
    pos[0] = pos[0] / pos[3];
    pos[1] = pos[1] / pos[3];
    pos[0] = (pos[0] + 1) / 2;
    pos[1] = (pos[1] + 1) / 2;
    return [pos[0], pos[1]];
  }
}