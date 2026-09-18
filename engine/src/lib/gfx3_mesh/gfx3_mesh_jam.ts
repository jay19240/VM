import { eventManager } from '../core/event_manager';
import { em } from '../engine/engine_manager';
import { UT } from '../core/utils';
import { Poolable } from '../core/object_pool';
import { Gfx3BoundingBox } from '../gfx3/gfx3_bounding_box';
import { Gfx3Mesh, Gfx3MeshBuild } from './gfx3_mesh';
import { Gfx3Material } from './gfx3_mesh_material';
import { Gfx3BoundingCylinder } from '../gfx3/gfx3_bounding_cylinder';

/** Décrit une séquence d'animation par sommets d'un maillage JAM. */
export interface Gfx3JAMAnimation {
  name: String;
  startFrame: number;
  endFrame: number;
  frameDuration: number;
};

/**
 * Représente un maillage 3D animé par sommets.
 *
 * Émet l'événement `E_FINISHED` à la fin d'une séquence d'animation.
 */
export class Gfx3MeshJAM extends Gfx3Mesh implements Poolable<Gfx3MeshJAM> {
  frames: Array<number>;
  animations: Array<Gfx3JAMAnimation>;
  interpolated: boolean;
  looped: boolean;
  currentAnimation: Gfx3JAMAnimation | null;
  currentFrameIndex: number;
  frameProgress: number;
  geos: Array<Gfx3MeshBuild>;
  boundingBoxes: Array<Gfx3BoundingBox>;
  boundingCylinders: Array<Gfx3BoundingCylinder>;
  boundingShapesDynamicMode: boolean;

  /** Crée un maillage animé vide avec interpolation et bouclage activés. */
  constructor() {
    super();
    this.frames = [];
    this.animations = [];
    this.interpolated = true;
    this.looped = true;
    this.currentAnimation = null;
    this.currentFrameIndex = 0;
    this.frameProgress = 0;
    this.geos = [];
    this.boundingBoxes = [];
    this.boundingCylinders = [];
    this.boundingShapesDynamicMode = false;
  }

  /**
   * Charge de façon asynchrone un maillage animé depuis un fichier JSON JAM.
   *
   * @param path - Chemin du fichier JAM.
   * @returns Une promesse résolue lorsque le maillage et ses animations sont chargés.
   * @throws Si le fichier ne contient pas un maillage JAM valide.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'JAM') {
      throw new Error('Gfx3MeshJAM::loadFromFile(): File not valid !');
    }

    this.frames = [];
    this.geos = [];
    this.boundingBoxes = [];
    this.boundingCylinders = [];

    for (const obj of json['Frames']) {
      const vertices = obj['Vertices'] ?? json['Vertices'];
      const textureCoords = obj['TextureCoords'] ?? json['TextureCoords'];
      const colors = obj['Colors'] ?? json['Colors'];
      const normals = obj['Normals'] ?? json['Normals'];
      const geo = Gfx3Mesh.buildVertices(json['NumVertices'], vertices, textureCoords, colors, normals);
      const bb = Gfx3BoundingBox.createFromVertices(vertices, 3);
      const bc = Gfx3BoundingCylinder.createFromBoundingBox(bb);
      this.geos.push(geo);
      this.frames.push(...geo.vertices);
      this.boundingBoxes.push(bb);
      this.boundingCylinders.push(bc);
    }

    this.animations = [];
    for (const obj of json['Animations']) {
      this.animations.push({
        name: obj['Name'],
        startFrame: parseInt(obj['StartFrame']),
        endFrame: parseInt(obj['EndFrame']),
        frameDuration: parseInt(obj['FrameDuration'])
      });
    }

    this.beginVertices(json['NumVertices']);
    this.setVertices(this.geos[0].vertices);
    this.endVertices();

    this.material.setJamFrames(this.frames);

    this.currentAnimation = null;
    this.interpolated = true;
    this.looped = true;
    this.currentFrameIndex = 0;
    this.frameProgress = 0;
  }

  /**
   * Charge de façon asynchrone un maillage animé depuis un fichier binaire BAM.
   *
   * @param path - Chemin du fichier BAM.
   * @returns Une promesse résolue lorsque le maillage et ses animations sont chargés.
   */
  async loadFromBinaryFile(path: string): Promise<void> {
    const response = await fetch(path);
    const buffer = await response.arrayBuffer();
    const data = new Float32Array(buffer);
    const dataInt = new Uint32Array(buffer);
    let offset = 0;

    const numVertices = dataInt[0];
    const numFrames = dataInt[1];
    const numAnimations = dataInt[2];
    offset += 3;

    const textureCoords = [];
    for (let i = 0; i < numVertices * 2; i++) {
      textureCoords.push(data[offset]);
      offset++;
    }

    this.frames = [];
    this.geos = [];
    this.boundingBoxes = [];
    this.boundingCylinders = [];

    for (let i = 0; i < numFrames; i++) {
      const vertices = [];
      for (let i = 0; i < numVertices * 3; i++) {
        vertices.push(data[offset]);
        offset++;
      }

      const normals = [];
      for (let i = 0; i < numVertices * 3; i++) {
        normals.push(data[offset]);
        offset++;
      }

      const geo = Gfx3Mesh.buildVertices(numVertices, vertices, textureCoords, undefined, normals);
      const bb = Gfx3BoundingBox.createFromVertices(vertices, 3);
      const bc = Gfx3BoundingCylinder.createFromBoundingBox(bb);

      this.geos.push(geo);
      this.frames.push(...geo.vertices);
      this.boundingBoxes.push(bb);
      this.boundingCylinders.push(bc);
    }

    this.animations = [];
    for (let i = 0; i < numAnimations; i++) {
      const nameLength = dataInt[offset];
      offset += 1;

      let name = '';
      for (let j = 0; j < nameLength; j++) {
        name += String.fromCharCode(dataInt[offset++]);
      }

      this.animations.push({
        name: name,
        startFrame: dataInt[offset++],
        endFrame: dataInt[offset++],
        frameDuration: dataInt[offset++]
      });
    }

    this.beginVertices(numVertices);
    this.setVertices(this.geos[0].vertices);
    this.endVertices();

    this.material.setJamFrames(this.frames);

    this.currentAnimation = null;
    this.interpolated = true;
    this.looped = true;
    this.currentFrameIndex = 0;
    this.frameProgress = 0;
  }

  /**
   * Fait progresser l'animation courante et actualise les volumes englobants.
   *
   * @param ts - Pas de temps écoulé, en millisecondes.
   */
  update(ts: number): void {
    if (!this.currentAnimation) {
      return;
    }

    const interpolateFactor = this.frameProgress / this.currentAnimation.frameDuration;
    let nextFrameIndex = 0;

    if (this.currentFrameIndex == this.currentAnimation.endFrame) {
      eventManager.emit(this, 'E_FINISHED');
      nextFrameIndex = this.looped ? this.currentAnimation.startFrame : this.currentAnimation.endFrame;
    }
    else {
      nextFrameIndex = this.currentFrameIndex + 1;
    }

    if (interpolateFactor === 0) {
      this.material.setJamInfos(
        this.currentFrameIndex,
        nextFrameIndex,
        true,
        this.interpolated,
        em.getTimeStamp(),
        this.currentAnimation.frameDuration,
        this.vertexCount
      );

      this.boundingBox = this.boundingBoxes[this.currentFrameIndex];
      this.boundingCylinder = this.boundingCylinders[this.currentFrameIndex];
    }

    if (interpolateFactor >= 1) {
      this.currentFrameIndex = nextFrameIndex;
      this.frameProgress = 0;
    }
    else {
      this.frameProgress += ts;
    }

    super.update(ts);
  }

  /**
   * Lance une animation nommée.
   *
   * @param animationName - Nom de l'animation à lancer.
   * @param looped - Indique si l'animation doit boucler.
   * @param preventSameAnimation - Empêche de relancer l'animation déjà en cours.
   * @param interpolated - Active l'interpolation entre les images.
   * @throws Si aucune animation ne porte le nom demandé.
   */
  play(animationName: string, looped: boolean = false, preventSameAnimation: boolean = false, interpolated: boolean = true): void {
    if (preventSameAnimation && this.currentAnimation && this.currentAnimation.name == animationName) {
      return;
    }

    const animation = this.animations.find(animation => animation.name == animationName);
    if (!animation) {
      throw new Error('Gfx3MeshJAM::play: animation not found !');
    }

    this.currentAnimation = animation;
    this.interpolated = interpolated;
    this.looped = looped;
    this.currentFrameIndex = animation.startFrame;
    this.frameProgress = 0;
  }

  /**
   * Remplace le matériau et lui transmet les images d'animation du maillage.
   *
   * @param material - Nouveau matériau à affecter au maillage.
   */
  setMaterial(material: Gfx3Material): void {
    material.setJamFrames(this.frames);
    this.material.delete();
    this.material = material;
  }

  /** Indique si l'interpolation entre les images est activée. */
  isInterpolated(): boolean {
    return this.interpolated;
  }

  /** Indique si l'animation courante est configurée pour boucler. */
  getLooped(): boolean {
    return this.looped;
  }

  /** Renvoie l'animation courante, ou `null` si aucune animation n'est active. */
  getCurrentAnimation(): Gfx3JAMAnimation | null {
    return this.currentAnimation;
  }

  /** Renvoie l'indice de l'image courante. */
  getCurrentFrameIndex(): number {
    return this.currentFrameIndex;
  }

  /** Renvoie le temps écoulé dans l'image courante, en millisecondes. */
  getFrameProgress(): number {
    return this.frameProgress;
  }

  /**
   * Configure l'adaptation en temps réel des volumes englobants à l'image animée.
   *
   * @param dynamicMode - Active l'utilisation des volumes de l'image courante.
   */
  setBoundingShapesDynamicMode(dynamicMode: boolean) {
    if (dynamicMode == false) {
      this.boundingBox = this.boundingBoxes[0];
      this.boundingCylinder = this.boundingCylinders[0];
    }

    this.boundingShapesDynamicMode = dynamicMode;
  }

  /**
   * Copie ce maillage animé dans une instance cible.
   *
   * @param jam - Instance qui reçoit la copie.
   * @param transformMatrix - Matrice de transformation appliquée à la copie.
   * @returns L'instance de maillage animé copiée.
   */
  clone(jam: Gfx3MeshJAM = new Gfx3MeshJAM(), transformMatrix: mat4 = UT.MAT4_IDENTITY()): Gfx3MeshJAM {
    super.clone(jam, transformMatrix);
    jam.frames = this.frames;
    jam.animations = this.animations;
    jam.interpolated = this.interpolated;
    jam.looped = false;
    jam.currentAnimation = null;
    jam.currentFrameIndex = 0;
    jam.frameProgress = 0;
    jam.geos = this.geos;
    jam.boundingBoxes = this.boundingBoxes;
    jam.boundingCylinders = this.boundingCylinders;
    return jam;
  }
}