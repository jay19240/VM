import { gfx3MeshRenderer } from './gfx3_mesh_renderer';
import { Gfx3Transformable } from '../gfx3/gfx3_transformable';

/** Énumère les types de sources lumineuses locales pris en charge. */
export enum Gfx3LightType {
  POINT = 'POINT',
  SPOT = 'SPOT'
};

/** Représente une source lumineuse ponctuelle ou conique dans la scène 3D. */
export class Gfx3MeshLight extends Gfx3Transformable {
  type: Gfx3LightType;
  diffuse: vec3;
  specular: vec3;
  intensity: number;
  constant: number;
  linear: number;
  exp: number;
  groupId: number;
  spotCutoff: number;
  spotDirection: vec3;

  /** Crée une lumière ponctuelle avec les paramètres d'atténuation par défaut. */
  constructor() {
    super();
    this.type = Gfx3LightType.POINT;
    this.diffuse = [0.7, 0.7, 0.7];
    this.specular = [1.0, 1.0, 1.0];
    this.intensity = 1.0;
    this.constant = 1;
    this.linear = 0;
    this.exp = 0;
    this.groupId = 0;
    this.spotCutoff = 12.5;
    this.spotDirection = [0, -1, 0];
  }

  /**
   * Charge de façon asynchrone une lumière depuis un fichier JSON JLT.
   *
   * @param path - Chemin du fichier JLT.
   * @returns Une promesse résolue lorsque la lumière est chargée.
   * @throws Si le fichier ne contient pas une lumière JLT valide.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'JLT') {
      throw new Error('Gfx3MeshLight::loadFromFile(): File not valid !');
    }

    this.type = json['Type'] == 'POINT' ? Gfx3LightType.POINT : Gfx3LightType.SPOT;
    this.position[0] = json['PositionX'];
    this.position[1] = json['PositionY'];
    this.position[2] = json['PositionZ'];
    this.diffuse[0] = json['DiffuseColorR'];
    this.diffuse[1] = json['DiffuseColorG'];
    this.diffuse[2] = json['DiffuseColorB'];
    this.specular[0] = json['SpecularColorR'];
    this.specular[1] = json['SpecularColorG'];
    this.specular[2] = json['SpecularColorB'];
    this.intensity = json['Intensity'];
    this.constant = json['Constant'];
    this.linear = json['Linear'];
    this.exp = json['Exp'];
    this.groupId = json['GroupId'];
    this.spotCutoff = json['SpotCutoff'];
    this.spotDirection[0] = json['SpotDirectionX'];
    this.spotDirection[0] = json['SpotDirectionY'];
    this.spotDirection[0] = json['SpotDirectionZ'];
  }

  /** Ajoute cette lumière à la file de rendu appropriée à son type. */
  draw(): void {
    if (this.type == Gfx3LightType.POINT) {
      gfx3MeshRenderer.drawPointLight(
        this.position,
        this.diffuse,
        this.specular,
        this.intensity,
        this.groupId,
        this.constant,
        this.linear,
        this.exp
      );
    }
    else {
      gfx3MeshRenderer.drawSpotLight(
        this.position,
        this.spotDirection,
        this.spotCutoff,
        this.diffuse,
        this.specular,
        this.intensity,
        this.groupId,
        this.constant,
        this.linear,
        this.exp
      );
    }
  }

  /**
   * Définit le type de la lumière.
   *
   * @param type - Type de lumière à utiliser.
   */
  setType(type: Gfx3LightType): void {
    this.type = type;
  }

  /**
   * Définit la couleur diffuse.
   *
   * @param r - Composante rouge.
   * @param g - Composante verte.
   * @param b - Composante bleue.
   */
  setDiffuse(r: number, g: number, b: number): void {
    this.diffuse[0] = r;
    this.diffuse[1] = g;
    this.diffuse[2] = b;
  }

  /**
   * Définit la couleur spéculaire.
   *
   * @param r - Composante rouge.
   * @param g - Composante verte.
   * @param b - Composante bleue.
   */
  setSpecular(r: number, g: number, b: number): void {
    this.specular[0] = r;
    this.specular[1] = g;
    this.specular[2] = b;
  }

  /**
   * Définit l'intensité lumineuse.
   *
   * @param intensity - Intensité à appliquer.
   */
  setIntensity(intensity: number): void {
    this.intensity = intensity;
  }

  /**
   * Définit le coefficient d'atténuation constant.
   *
   * @param constant - Coefficient constant.
   */
  setConstant(constant: number): void {
    this.constant = constant;
  }

  /**
   * Définit le coefficient d'atténuation linéaire.
   *
   * @param linear - Coefficient linéaire.
   */
  setLinear(linear: number): void {
    this.linear = linear;
  }

  /**
   * Définit le coefficient d'atténuation quadratique.
   *
   * @param exp - Coefficient quadratique.
   */
  setExp(exp: number): void {
    this.exp = exp;
  }

  /**
   * Définit le groupe de maillages éclairé.
   *
   * Le groupe `0` est le groupe par défaut et affecte tous les maillages.
   *
   * @param groupId - Identifiant du groupe cible.
   */
  setGroup(groupId: number): void {
    this.groupId = groupId;
  }

  /**
   * Définit l'angle d'ouverture d'une lumière conique.
   *
   * @param cutoff - Angle d'ouverture en radians.
   */
  setCutoff(cutoff: number): void {
    this.spotCutoff = cutoff;
  }

  /**
   * Définit la direction d'une lumière conique.
   *
   * @param x - Composante X de la direction.
   * @param y - Composante Y de la direction.
   * @param z - Composante Z de la direction.
   */
  setDirection(x: number, y: number, z: number): void {
    this.spotDirection[0] = x;
    this.spotDirection[1] = y;
    this.spotDirection[2] = z;
  }

  /** Renvoie le type de la lumière. */
  getType(): Gfx3LightType {
    return this.type;
  }

  /** Renvoie la couleur diffuse. */
  getDiffuse(): vec3 {
    return this.diffuse;
  }

  /** Renvoie la couleur spéculaire. */
  getSpecular(): vec3 {
    return this.specular;
  }

  /** Renvoie l'intensité lumineuse. */
  getIntensity(): number {
    return this.intensity;
  }

  /** Renvoie le coefficient d'atténuation constant. */
  getConstant(): number {
    return this.constant;
  }

  /** Renvoie le coefficient d'atténuation linéaire. */
  getLinear(): number {
    return this.linear;
  }

  /** Renvoie le coefficient d'atténuation quadratique. */
  getExp(): number {
    return this.exp;
  }

  /** Renvoie l'identifiant du groupe éclairé. */
  getGroup(): number {
    return this.groupId;
  }

  /** Renvoie l'angle d'ouverture de la lumière conique, en radians. */
  getCutoff(): number {
    return this.spotCutoff;
  }

  /** Renvoie la direction de la lumière conique. */
  getDirection(): vec3 {
    return this.spotDirection;
  }
}