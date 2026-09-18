import { gfx3Manager } from '../gfx3/gfx3_manager';
import { Gfx3View, Gfx3ProjectionMode } from '../gfx3/gfx3_view';
import { Gfx3Transformable } from '../gfx3/gfx3_transformable';

/** Caméra 3D qui synchronise ses transformations et paramètres de projection avec une vue. */
export class Gfx3Camera extends Gfx3Transformable {
  view: Gfx3View;
  clipOffset: vec2;
  minClipOffset: vec2;
  maxClipOffset: vec2;
  projectionMode: Gfx3ProjectionMode;
  perspectiveFovy: number;
  perspectiveNear: number;
  perspectiveFar: number;
  orthographicSize: number;
  orthographicDepth: number;

  /**
   * Crée une caméra associée à une vue existante et en reprend les paramètres de projection.
   *
   * @param viewIndex - Indice de la vue à piloter.
   */
  constructor(viewIndex: number) {
    super();
    this.view = gfx3Manager.getView(viewIndex);
    this.clipOffset = this.view.getClipOffset();
    this.minClipOffset = this.view.getMinClipOffset();
    this.maxClipOffset = this.view.getMaxClipOffset();
    this.projectionMode = this.view.getProjectionMode();
    this.perspectiveFovy = this.view.getPerspectiveFovy();
    this.perspectiveNear = this.view.getPerspectiveNear();
    this.perspectiveFar = this.view.getPerspectiveFar();
    this.orthographicSize = this.view.getOrthographicSize();
    this.orthographicDepth = this.view.getOrthographicDepth();
  }

  /**
   * Charge de manière asynchrone les paramètres de caméra depuis un fichier JSON au format JCM.
   *
   * @param path - Chemin du fichier JCM.
   * @returns Une promesse résolue lorsque les paramètres ont été appliqués.
   * @throws Une erreur si le fichier ne porte pas l'identifiant de caméra attendu.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'CAM') {
      throw new Error('Gfx3Camera::loadFromFile(): File not valid !');
    }

    if (json['ClipOffsetX']) {
      this.setClipOffsetX(json['ClipOffsetX']);
    }
    if (json['ClipOffsetY']) {
      this.setClipOffsetY(json['ClipOffsetY']);
    }
    if (json['MinClipOffsetX']) {
      this.setMinClipOffsetX(json['MinClipOffsetX']);
    }
    if (json['MinClipOffsetY']) {
      this.setMinClipOffsetY(json['MinClipOffsetY']);
    }
    if (json['MaxClipOffsetX']) {
      this.setMaxClipOffsetX(json['MaxClipOffsetX']);
    }
    if (json['MaxClipOffsetY']) {
      this.setMaxClipOffsetY(json['MaxClipOffsetY']);
    }

    if (json['ProjectionMode'] == 'PERSPECTIVE') {
      this.setProjectionMode(Gfx3ProjectionMode.PERSPECTIVE);
    }
    else if (json['ProjectionMode'] == 'ORTHOGRAPHIC') {
      this.setProjectionMode(Gfx3ProjectionMode.ORTHOGRAPHIC);
    }

    if (json['PositionX']) {
      this.setPositionX(json['PositionX']);
    }
    if (json['PositionY']) {
      this.setPositionY(json['PositionY']);
    }
    if (json['PositionZ']) {
      this.setPositionZ(json['PositionZ']);
    }

    if (json['RotationX']) {
      this.setRotationX(json['RotationX']);
    }
    if (json['RotationY']) {
      this.setRotationY(json['RotationY']);
    }
    if (json['RotationZ']) {
      this.setRotationZ(json['RotationZ']);
    }

    if (json['ScaleX']) {
      this.setScaleX(json['ScaleX']);
    }
    if (json['ScaleY']) {
      this.setScaleY(json['ScaleY']);
    }
    if (json['ScaleZ']) {
      this.setScaleZ(json['ScaleZ']);
    }

    if (json['PerspectiveFovy']) {
      this.setPerspectiveFovy(json['PerspectiveFovy']);
    }
    if (json['PerspectiveNear']) {
      this.setPerspectiveNear(json['PerspectiveNear']);
    }
    if (json['PerspectiveFar']) {
      this.setPerspectiveFar(json['PerspectiveFar']);
    }

    if (json['OrthographicSize']) {
      this.setOrthographicSize(json['OrthographicSize']);
    }

    if (json['OrthographicDepth']) {
      this.setOrthographicDepth(json['OrthographicDepth']);
    }

    if (json['CameraMatrix']) {
      this.view.setCameraMatrix(json['CameraMatrix']);
    }
  }

  /**
   * Point d'extension appelé à chaque mise à jour de la caméra.
   *
   * @param ts - Durée écoulée depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number): void {}

  /** Renvoie le décalage appliqué dans l'espace de découpage. */
  getClipOffset(): vec2 {
    return this.clipOffset;
  }

  /**
   * Définit la composante X du décalage de découpage et la transmet à la vue.
   *
   * @param x - Nouvelle composante X.
   */
  setClipOffsetX(x: number): void {
    this.clipOffset[0] = x;
    this.view.setClipOffsetX(this.clipOffset[0]);
  }

  /**
   * Définit la composante Y du décalage de découpage et la transmet à la vue.
   *
   * @param y - Nouvelle composante Y.
   */
  setClipOffsetY(y: number): void {
    this.clipOffset[1] = y;
    this.view.setClipOffsetY(this.clipOffset[1]);
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
    this.view.setMinClipOffsetX(this.minClipOffset[0]);
  }

  /**
   * Définit la limite minimale sur Y du décalage de découpage.
   *
   * @param y - Limite minimale sur Y.
   */
  setMinClipOffsetY(y: number): void {
    this.minClipOffset[1] = y;
    this.view.setMinClipOffsetY(this.minClipOffset[1]);
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
    this.view.setMaxClipOffsetX(this.maxClipOffset[0]);
  }

  /**
   * Définit la limite maximale sur Y du décalage de découpage.
   *
   * @param y - Limite maximale sur Y.
   */
  setMaxClipOffsetY(y: number): void {
    this.maxClipOffset[1] = y;
    this.view.setMaxClipOffsetY(this.maxClipOffset[1]);
  }

  /** Renvoie le mode de projection courant. */
  getProjectionMode(): Gfx3ProjectionMode {
    return this.projectionMode;
  }

  /**
   * Définit le mode de projection de la caméra et de sa vue.
   *
   * @param projectionMode - Mode perspective ou orthographique.
   */
  setProjectionMode(projectionMode: Gfx3ProjectionMode): void {
    this.projectionMode = projectionMode;
    this.view.setProjectionMode(projectionMode);
  }

  /** Renvoie l'angle d'ouverture vertical de la projection perspective, en radians. */
  getPerspectiveFovy(): number {
    return this.perspectiveFovy;
  }

  /**
   * Définit l'angle d'ouverture vertical de la projection perspective.
   *
   * @param perspectiveFovy - Angle d'ouverture en radians.
   */
  setPerspectiveFovy(perspectiveFovy: number): void {
    this.perspectiveFovy = perspectiveFovy;
    this.view.setPerspectiveFovy(this.perspectiveFovy);
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
    this.view.setPerspectiveNear(perspectiveNear);
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
    this.view.setPerspectiveFar(perspectiveFar);
  }

  /** Renvoie l'étendue visible de la projection orthographique. */
  getOrthographicSize(): number {
    return this.orthographicSize;
  }

  /**
   * Définit l'étendue visible de la projection orthographique.
   *
   * @param orthographicSize - Taille du volume de vue orthographique.
   */
  setOrthographicSize(orthographicSize: number): void {
    this.orthographicSize = orthographicSize;
    this.view.setOrthographicSize(orthographicSize);
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
    this.view.setOrthographicDepth(orthographicDepth);
  }

  /**
   * Définit la position de la caméra et actualise sa matrice dans la vue.
   *
   * @param x - Coordonnée X.
   * @param y - Coordonnée Y.
   * @param z - Coordonnée Z.
   */
  setPosition(x: number, y: number, z: number): void {
    super.setPosition(x, y, z);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Définit la coordonnée X de la caméra et actualise la vue.
   *
   * @param x - Nouvelle coordonnée X.
   */
  setPositionX(x: number): void {
    super.setPositionX(x);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Définit la coordonnée Y de la caméra et actualise la vue.
   *
   * @param y - Nouvelle coordonnée Y.
   */
  setPositionY(y: number): void {
    super.setPositionY(y);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Définit la coordonnée Z de la caméra et actualise la vue.
   *
   * @param z - Nouvelle coordonnée Z.
   */
  setPositionZ(z: number): void {
    super.setPositionZ(z);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Translate la caméra et actualise sa matrice dans la vue.
   *
   * @param x - Déplacement sur l'axe X.
   * @param y - Déplacement sur l'axe Y.
   * @param z - Déplacement sur l'axe Z.
   */
  translate(x: number, y: number, z: number): void {
    super.translate(x, y, z);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Définit les angles d'Euler de la caméra et actualise la vue.
   *
   * @param x - Rotation sur X en radians.
   * @param y - Rotation sur Y en radians.
   * @param z - Rotation sur Z en radians.
   */
  setRotation(x: number, y: number, z: number): void {
    super.setRotation(x, y, z);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Définit la rotation sur X et actualise la vue.
   *
   * @param x - Angle en radians.
   */
  setRotationX(x: number): void {
    super.setRotationX(x);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Définit la rotation sur Y et actualise la vue.
   *
   * @param y - Angle en radians.
   */
  setRotationY(y: number): void {
    super.setRotationY(y);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Définit la rotation sur Z et actualise la vue.
   *
   * @param z - Angle en radians.
   */
  setRotationZ(z: number): void {
    super.setRotationZ(z);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Ajoute des rotations d'Euler et actualise la vue.
   *
   * @param x - Rotation ajoutée sur X en radians.
   * @param y - Rotation ajoutée sur Y en radians.
   * @param z - Rotation ajoutée sur Z en radians.
   */
  rotate(x: number, y: number, z: number): void {
    super.rotate(x, y, z);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Définit l'échelle de la caméra et actualise la vue.
   *
   * @param x - Facteur sur X.
   * @param y - Facteur sur Y.
   * @param z - Facteur sur Z.
   */
  setScale(x: number, y: number, z: number): void {
    super.setScale(x, y, z);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Définit l'échelle sur X et actualise la vue.
   *
   * @param x - Facteur sur X.
   */
  setScaleX(x: number): void {
    super.setScaleX(x);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Définit l'échelle sur Y et actualise la vue.
   *
   * @param y - Facteur sur Y.
   */
  setScaleY(y: number): void {
    super.setScaleY(y);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Définit l'échelle sur Z et actualise la vue.
   *
   * @param z - Facteur sur Z.
   */
  setScaleZ(z: number): void {
    super.setScaleZ(z);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Ajoute des valeurs à l'échelle de la caméra et actualise la vue.
   *
   * @param x - Valeur ajoutée sur X.
   * @param y - Valeur ajoutée sur Y.
   * @param z - Valeur ajoutée sur Z.
   */
  zoom(x: number, y: number, z: number): void {
    super.zoom(x, y, z);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Associe la caméra à une autre vue et lui transmet tous ses paramètres courants.
   *
   * @param viewIndex - Indice de la nouvelle vue.
   */
  changeView(viewIndex: number): void {
    this.view = gfx3Manager.getView(viewIndex);

    this.view.setClipOffsetX(this.clipOffset[0]);
    this.view.setClipOffsetY(this.clipOffset[1]);
    this.view.setMinClipOffsetX(this.minClipOffset[0]);
    this.view.setMinClipOffsetY(this.minClipOffset[1]);
    this.view.setMaxClipOffsetX(this.maxClipOffset[0]);
    this.view.setMaxClipOffsetY(this.maxClipOffset[1]);

    this.view.setProjectionMode(this.projectionMode);
    this.view.setPerspectiveFovy(this.perspectiveFovy);
    this.view.setPerspectiveNear(this.perspectiveNear);
    this.view.setPerspectiveFar(this.perspectiveFar);
    this.view.setOrthographicSize(this.orthographicSize);
    this.view.setOrthographicDepth(this.orthographicDepth);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /**
   * Oriente la caméra vers une cible puis actualise la vue.
   * Ce mode remplace l'orientation par angles d'Euler.
   *
   * @param x - Coordonnée X de la cible.
   * @param y - Coordonnée Y de la cible.
   * @param z - Coordonnée Z de la cible.
   * @param up - Vecteur définissant la verticale de la caméra.
   */
  lookAt(x: number, y: number, z:number, up: vec3 = [0, 1, 0]): void {
    super.lookAt(x, y, z, up);
    this.view.setCameraMatrix(this.getTransformMatrix());
  }

  /** Renvoie la matrice de transformation de caméra conservée par la vue. */
  getCameraMatrix(): mat4 {
    return this.view.getCameraMatrix();
  }

  /** Renvoie la vue actuellement pilotée par la caméra. */
  getView(): Gfx3View {
    return this.view;
  }
}