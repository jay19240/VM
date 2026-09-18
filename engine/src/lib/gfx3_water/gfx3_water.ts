import { gfx3Manager } from '../gfx3/gfx3_manager';
import { gfx3TextureManager } from '../gfx3/gfx3_texture_manager';
import { gfx3WaterRenderer } from './gfx3_water_renderer';
import { Gfx3StaticGroup } from '../gfx3/gfx3_group';
import { Gfx3Drawable } from '../gfx3/gfx3_drawable';
import { Gfx3Texture } from '../gfx3/gfx3_texture';
import { Gfx3WaterParam, Gfx3WaterImpact, WATER_SHADER_VERTEX_ATTR_COUNT, WATER_MAX_IMPACTS, WATER_CUSTOM_PARAMS } from './gfx3_water_shader';

interface WaterImpact {
  x: number;
  z: number;
  strength: number;
  radius: number;
  lifetime: number;
  startTime: number;
}

/**
 * Représente une surface d'eau animée, réfléchissante et sensible aux impacts.
 */
export class Gfx3Water extends Gfx3Drawable {
  texturesChanged: boolean;
  impacts: Array<WaterImpact>;
  impactsBuffer: Float32Array;
  params: Float32Array;
  grp2: Gfx3StaticGroup;
  envMap: Gfx3Texture;
  normalMap: Gfx3Texture;
  s0Texture: Gfx3Texture;
  s1Texture: Gfx3Texture;

  /** Initialise une surface d'eau vide et ses ressources de texture. */
  constructor() {
    super(WATER_SHADER_VERTEX_ATTR_COUNT);
    this.texturesChanged = false;
    this.impacts = [];
    this.impactsBuffer = new Float32Array(Gfx3WaterImpact.COUNT * WATER_MAX_IMPACTS);
    this.params = new Float32Array(Gfx3WaterParam.COUNT + 8);

    this.grp2 = gfx3Manager.createStaticGroup('WATER_PIPELINE', 2);
    this.envMap = this.grp2.setTexture(0, 'ENV_MAP_TEXTURE', gfx3Manager.createCubeMapFromBitmap(), { dimension: 'cube' });
    this.envMap = this.grp2.setSampler(1, 'ENV_MAP_SAMPLER', this.envMap);
    this.normalMap = this.grp2.setTexture(2, 'NORMAL_MAP_TEXTURE', gfx3Manager.createTextureFromBitmap());
    this.normalMap = this.grp2.setSampler(3, 'NORMAL_MAP_SAMPLER', this.normalMap);
    this.s0Texture = this.grp2.setTexture(4, 'S0_TEXTURE', gfx3Manager.createTextureFromBitmap());
    this.s0Texture = this.grp2.setSampler(5, 'S0_TEXTURE_SAMPLER', this.s0Texture);
    this.s1Texture = this.grp2.setTexture(6, 'S1_TEXTURE', gfx3Manager.createTextureFromBitmap());
    this.s1Texture = this.grp2.setSampler(7, 'S1_TEXTURE_SAMPLER', this.s1Texture);
    this.grp2.allocate();
  }

  /**
   * Charge la géométrie, les paramètres et les textures depuis un fichier JSON JWA.
   *
   * @param path - Chemin du fichier JWA.
   * @param textureDir - Répertoire préfixé aux chemins des textures.
   * @returns Une promesse résolue une fois la surface chargée.
   * @throws Si le fichier ne possède pas l'identifiant JWA attendu.
   */
  async loadFromFile(path: string, textureDir: string = ''): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'JWA') {
      throw new Error('Gfx3Water::loadFromFile(): File not valid !');
    }

    let envMap = undefined;
    if (json['EnvMapRight'] && json['EnvMapLeft'] && json['EnvMapTop'] && json['EnvMapBottom'] && json['EnvMapFront'] && json['EnvMapBack']) {
      envMap = await gfx3TextureManager.loadCubemapTexture({
        right: textureDir + json['EnvMapRight'],
        left: textureDir + json['EnvMapLeft'],
        top: textureDir + json['EnvMapTop'],
        bottom: textureDir + json['EnvMapBottom'],
        front: textureDir + json['EnvMapFront'],
        back: textureDir + json['EnvMapBack']
      }, json['EnvMapRight'] + json['EnvMapLeft'] + json['EnvMapTop'] + json['EnvMapBottom'] + json['EnvMapFront'] + json['EnvMapBack']);
    }

    this.params[Gfx3WaterParam.WAVE_AMPLITUDE] = json['WaveAmplitude'];
    this.params[Gfx3WaterParam.WAVE_SCALE] = json['WaveScale'];
    this.params[Gfx3WaterParam.WAVE_SPEED] = json['WaveSpeed'];
    this.params[Gfx3WaterParam.WAVE_CHOPPINESS] = json['WaveChoppiness'];
    this.params[Gfx3WaterParam.WAVE_STEP_X] = json['WaveStepX'];
    this.params[Gfx3WaterParam.WAVE_STEP_Z] = json['WaveStepZ'];
    this.params[Gfx3WaterParam.NORMAL_MAP_SCROLL_X] = json['NormalMapScrollX'];
    this.params[Gfx3WaterParam.NORMAL_MAP_SCROLL_Y] = json['NormalMapScrollY'];
    this.params[Gfx3WaterParam.NORMAL_MAP_INTENSITY] = json['NormalMapIntensity'];
    this.params[Gfx3WaterParam.NORMAL_MAP_SCALE] = json['NormalMapScale'];
    this.params[Gfx3WaterParam.SURFACE_COLOR_ENABLED] = json['SurfaceColorEnabled'];
    this.params[Gfx3WaterParam.SURFACE_COLOR_R] = json['SurfaceColorR'];
    this.params[Gfx3WaterParam.SURFACE_COLOR_G] = json['SurfaceColorG'];
    this.params[Gfx3WaterParam.SURFACE_COLOR_B] = json['SurfaceColorB'];
    this.params[Gfx3WaterParam.SURFACE_COLOR_FACTOR] = json['SurfaceColorFactor'];
    this.params[Gfx3WaterParam.OPTICS_ENV_INTENSITY] = json['EnvMapIntensity'];
    this.params[Gfx3WaterParam.OPTICS_FRESNEL_POWER] = json['FresnelPower'];
    this.params[Gfx3WaterParam.OPTICS_FRESNEL_BIAS] = json['FresnelBiais'];
    this.params[Gfx3WaterParam.SUN_ENABLED] = json['SunEnabled'];
    this.params[Gfx3WaterParam.SUN_DIRECTION_X] = json['SunDirectionX'];
    this.params[Gfx3WaterParam.SUN_DIRECTION_Y] = json['SunDirectionY'];
    this.params[Gfx3WaterParam.SUN_DIRECTION_Z] = json['SunDirectionZ'];
    this.params[Gfx3WaterParam.SUN_COLOR_R] = json['SunColorR'];
    this.params[Gfx3WaterParam.SUN_COLOR_G] = json['SunColorG'];
    this.params[Gfx3WaterParam.SUN_COLOR_B] = json['SunColorB'];
    this.params[Gfx3WaterParam.SUN_COLOR_FACTOR] = json['SunColorFactor'];

    this.normalMap = json['NormalMap'] ?
      await gfx3TextureManager.loadTexture(textureDir + json['NormalMap'], { addressModeU: 'repeat', addressModeV: 'repeat' }) :
      gfx3Manager.createTextureFromBitmap();

    this.envMap = envMap ?
      envMap :
      gfx3Manager.createCubeMapFromBitmap();

    this.s0Texture = json['S0Texture'] ?
      await gfx3TextureManager.loadTexture(textureDir + json['S0Texture'], { addressModeU: 'repeat', addressModeV: 'repeat' }) :
      gfx3Manager.createTextureFromBitmap();

    this.s1Texture = json['S1Texture'] ?
      await gfx3TextureManager.loadTexture(textureDir + json['S1Texture'], { addressModeU: 'repeat', addressModeV: 'repeat' }) :
      gfx3Manager.createTextureFromBitmap();

    this.texturesChanged = true;

    this.params[Gfx3WaterParam.NORMAL_MAP_ENABLED] = json['NormalMap'] ? 1.0 : 0.0;
    this.params[Gfx3WaterParam.OPTICS_ENV_MAP_ENABLED] = envMap ? 1.0 : 0.0;
    this.params[Gfx3WaterParam.S0_TEXTURE_EXIST] = json['S0Texture'] ? 1.0 : 0.0;
    this.params[Gfx3WaterParam.S1_TEXTURE_EXIST] = json['S1Texture'] ? 1.0 : 0.0;

    if (json['CustomParams']) {
      for (const p of json['CustomParams']) {
        const paramIndex = Object.values(WATER_CUSTOM_PARAMS).findIndex(n => n == p.name);
        if (paramIndex != -1) {
          this.params[Gfx3WaterParam.COUNT + paramIndex] = p.value ?? 0.0;
        }
      }
    }

    this.beginVertices(json['NumVertices']);

    for (let i = 0; i < json['NumVertices']; i++) {
      this.defineVertex(
        json['Vertices'][i * 3 + 0],
        json['Vertices'][i * 3 + 1],
        json['Vertices'][i * 3 + 2],
        json['TextureCoords'][i * 2 + 0],
        json['TextureCoords'][i * 2 + 1],
        json['Colors'][i * 3 + 0],
        json['Colors'][i * 3 + 1],
        json['Colors'][i * 3 + 2]
      );
    }

    this.endVertices();
  }

  /**
   * Charge la géométrie, les paramètres et les textures depuis un fichier binaire BWA.
   *
   * @param path - Chemin du fichier BWA.
   * @param textureDir - Répertoire préfixé aux chemins des textures.
   * @returns Une promesse résolue une fois la surface chargée.
   */
  async loadFromBinaryFile(path: string, textureDir: string = ''): Promise<void> {
    const response = await fetch(path);
    const buffer = await response.arrayBuffer();
    const view = new DataView(buffer);
    let offset = 0;

    const numVertices = view.getFloat32(offset, true);
    offset += 4;

    this.params[Gfx3WaterParam.WAVE_AMPLITUDE] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.WAVE_SCALE] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.WAVE_SPEED] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.WAVE_CHOPPINESS] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.WAVE_STEP_X] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.WAVE_STEP_Z] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.NORMAL_MAP_SCROLL_X] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.NORMAL_MAP_SCROLL_Y] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.NORMAL_MAP_INTENSITY] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.NORMAL_MAP_SCALE] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.SURFACE_COLOR_ENABLED] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.SURFACE_COLOR_R] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.SURFACE_COLOR_G] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.SURFACE_COLOR_B] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.SURFACE_COLOR_FACTOR] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.OPTICS_ENV_INTENSITY] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.OPTICS_FRESNEL_POWER] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.OPTICS_FRESNEL_BIAS] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.SUN_ENABLED] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.SUN_DIRECTION_X] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.SUN_DIRECTION_Y] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.SUN_DIRECTION_Z] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.SUN_COLOR_R] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.SUN_COLOR_G] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.SUN_COLOR_B] = view.getFloat32(offset, true); offset += 4;
    this.params[Gfx3WaterParam.SUN_COLOR_FACTOR] = view.getFloat32(offset, true); offset += 4;

    const decoder = new TextDecoder('utf-8');
    const readString = (): string => {
      const len = view.getInt32(offset, true);
      offset += 4;
      const str = decoder.decode(new Uint8Array(buffer, offset, len));
      offset += len;
      return str;
    };

    const normalMap = readString();
    const envMapRight = readString();
    const envMapLeft = readString();
    const envMapTop = readString();
    const envMapBottom = readString();
    const envMapFront = readString();
    const envMapBack = readString();

    const s00K = readString();
    const s00V = readString();
    const s01K = readString();
    const s01V = readString();
    const s02K = readString();
    const s02V = readString();
    const s03K = readString();
    const s03V = readString();
    const s04K = readString();
    const s04V = readString();
    const s05K = readString();
    const s05V = readString();
    const s06K = readString();
    const s06V = readString();
    const s07K = readString();
    const s07V = readString();
    const s0Texture = readString();
    const s1Texture = readString();

    let envMapTexture = undefined;
    if (envMapRight && envMapLeft && envMapTop && envMapBottom && envMapFront && envMapBack) {
      envMapTexture = await gfx3TextureManager.loadCubemapTexture({
        right: textureDir + envMapRight,
        left: textureDir + envMapLeft,
        top: textureDir + envMapTop,
        bottom: textureDir + envMapBottom,
        front: textureDir + envMapFront,
        back: textureDir + envMapBack
      }, envMapRight + envMapLeft + envMapTop + envMapBottom + envMapFront + envMapBack);
    }

    this.normalMap = normalMap ?
      await gfx3TextureManager.loadTexture(textureDir + normalMap, { addressModeU: 'repeat', addressModeV: 'repeat' }) :
      gfx3Manager.createTextureFromBitmap();

    this.envMap = envMapTexture ?
      envMapTexture :
      gfx3Manager.createCubeMapFromBitmap();

    this.s0Texture = s0Texture ?
      await gfx3TextureManager.loadTexture(textureDir + s0Texture, { addressModeU: 'repeat', addressModeV: 'repeat' }) :
      gfx3Manager.createTextureFromBitmap();

    this.s1Texture = s1Texture ?
      await gfx3TextureManager.loadTexture(textureDir + s1Texture, { addressModeU: 'repeat', addressModeV: 'repeat' }) :
      gfx3Manager.createTextureFromBitmap();

    this.texturesChanged = true;

    this.params[Gfx3WaterParam.NORMAL_MAP_ENABLED] = normalMap ? 1.0 : 0.0;
    this.params[Gfx3WaterParam.OPTICS_ENV_MAP_ENABLED] = envMapTexture ? 1.0 : 0.0;
    this.params[Gfx3WaterParam.S0_TEXTURE_EXIST] = s0Texture ? 1.0 : 0.0;
    this.params[Gfx3WaterParam.S1_TEXTURE_EXIST] = s1Texture ? 1.0 : 0.0;

    const customParams: any = [];
    customParams.push({ name: s00K, value: s00V });
    customParams.push({ name: s01K, value: s01V });
    customParams.push({ name: s02K, value: s02V });
    customParams.push({ name: s03K, value: s03V });
    customParams.push({ name: s04K, value: s04V });
    customParams.push({ name: s05K, value: s05V });
    customParams.push({ name: s06K, value: s06V });
    customParams.push({ name: s07K, value: s07V });

    for (const p of customParams) {
      const paramIndex = Object.values(WATER_CUSTOM_PARAMS).findIndex(n => n == p.name);
      if (paramIndex != -1) {
        this.params[Gfx3WaterParam.COUNT + paramIndex] = p.value ?? 0.0;
      }
    }

    const vertices: Array<number> = [];
    for (let i = 0; i < numVertices * 3; i++) {
      vertices.push(view.getFloat32(offset, true));
      offset += 4;
    }

    const texcoords: Array<number> = [];
    for (let i = 0; i < numVertices * 2; i++) {
      texcoords.push(view.getFloat32(offset, true));
      offset += 4;
    }

    const colors: Array<number> = [];
    for (let i = 0; i < numVertices * 3; i++) {
      colors.push(view.getFloat32(offset, true));
      offset += 4;
    }

    this.beginVertices(numVertices);

    for (let i = 0; i < numVertices; i++) {
      this.defineVertex(
        vertices[i * 3 + 0],
        vertices[i * 3 + 1],
        vertices[i * 3 + 2],
        texcoords[i * 2 + 0],
        texcoords[i * 2 + 1],
        colors[i * 3 + 0],
        colors[i * 3 + 1],
        colors[i * 3 + 2]
      );
    }

    this.endVertices();
  }

  /** Libère le groupe de liaison et les ressources allouées par l'objet. */
  delete(): void {
    this.grp2.delete();
    super.delete();
  }

  /** Ajoute cette surface d'eau à la prochaine passe de rendu. */
  draw(): void {
    gfx3WaterRenderer.drawWater(this);
  }

  /**
   * Met à jour l'âge des impacts et le tampon transmis au shader.
   *
   * @param ts - Pas de temps de la boucle, en millisecondes.
   */
  update(ts: number): void {
    const time = performance.now() / 1000;
    this.impacts = this.impacts.filter(im => time - im.startTime < im.lifetime);

    let count = 0;

    for (let i = 0; i < this.impacts.length && count < WATER_MAX_IMPACTS; i++) {
      const im = this.impacts[i];
      const age = time - im.startTime;
      if (age <= 0 || age >= im.lifetime) {
        continue;
      }

      const base = count * Gfx3WaterImpact.COUNT;
      this.impactsBuffer[base + Gfx3WaterImpact.X] = im.x;
      this.impactsBuffer[base + Gfx3WaterImpact.Z] = im.z;
      this.impactsBuffer[base + Gfx3WaterImpact.STRENGTH] = im.strength;
      this.impactsBuffer[base + Gfx3WaterImpact.RADIUS] = im.radius;
      this.impactsBuffer[base + Gfx3WaterImpact.LIFETIME] = im.lifetime;
      this.impactsBuffer[base + Gfx3WaterImpact.AGE] = age;
      this.impactsBuffer[base + Gfx3WaterImpact.PAD1] = 0;
      this.impactsBuffer[base + Gfx3WaterImpact.PAD2] = 0;
      count++;
    }

    this.params[Gfx3WaterParam.WAVE_IMPACT_COUNT] = count;

    for (let i = count * Gfx3WaterImpact.COUNT; i < this.impactsBuffer.length; i++) {
      this.impactsBuffer[i] = 0;
    }
  }

  /**
   * Définit la valeur d'un paramètre de rendu.
   *
   * @param key - Indice du paramètre, généralement issu de {@link Gfx3WaterParam}.
   * @param value - Nouvelle valeur du paramètre.
   */
  setParam(key: number, value: number): void {
    this.params[key] = value;
  }

  /**
   * Obtient la valeur d'un paramètre de rendu.
   *
   * @param key - Indice du paramètre, généralement issu de {@link Gfx3WaterParam}.
   * @returns La valeur courante du paramètre.
   */
  getParam(key: number): number {
    return this.params[key];
  }

  /**
   * Définit la valeur d'un paramètre personnalisé du shader.
   *
   * @param name - Nom associé à un emplacement de {@link WATER_CUSTOM_PARAMS}.
   * @param value - Nouvelle valeur du paramètre.
   * @throws Si aucun emplacement personnalisé ne porte ce nom.
   */
  setCustomParamValue(name: string, value: number): void {
    const paramIndex = Object.values(WATER_CUSTOM_PARAMS).findIndex(n => n == name);
    if (paramIndex == -1) {
      throw new Error('Gfx3Water::setCustomParamValue(): Custom param name not found !');
    }

    this.params[Gfx3WaterParam.COUNT + paramIndex] = value;
  }

  /**
   * Obtient la valeur d'un paramètre personnalisé du shader.
   *
   * @param name - Nom associé à un emplacement de {@link WATER_CUSTOM_PARAMS}.
   * @returns La valeur courante du paramètre.
   * @throws Si aucun emplacement personnalisé ne porte ce nom.
   */
  getCustomParamValue(name: string): number {
    const paramIndex = Object.values(WATER_CUSTOM_PARAMS).findIndex(n => n == name);
    if (paramIndex == -1) {
      throw new Error('Gfx3Water::getCustomParamValue(): Custom param name not found !');
    }

    return this.params[Gfx3WaterParam.COUNT + paramIndex];
  }

  /**
   * Enregistre un impact aux coordonnées locales XZ et évince le plus ancien si nécessaire.
   *
   * @param x - Coordonnée locale sur l'axe X.
   * @param z - Coordonnée locale sur l'axe Z.
   * @param strength - Amplitude ajoutée au centre, en unités du monde.
   * @param radius - Rayon d'influence, en unités du monde.
   * @param lifetime - Durée totale de l'impact, en secondes.
   */
  addImpact(x: number, z: number, strength: number, radius: number = 6.0, lifetime: number = 3.0): void {
    if (this.impacts.length >= WATER_MAX_IMPACTS) {
      this.impacts.shift();
    }

    this.impacts.push({
      x: x,
      z: z,
      strength: strength,
      radius: radius,
      lifetime: lifetime,
      startTime: performance.now() / 1000
    });
  }

  /**
   * Définit la texture cubique de l'environnement et active les réflexions.
   *
   * @param texture - Nouvelle texture cubique de l'environnement.
   */
  setEnvMap(texture: Gfx3Texture): void {
    this.envMap = texture;
    this.params[Gfx3WaterParam.OPTICS_ENV_MAP_ENABLED] = 1;
    this.texturesChanged = true;
  }

  /**
   * Définit la texture de normales en espace tangent et active son utilisation.
   *
   * @param texture - Nouvelle texture de normales.
   */
  setNormalMap(texture: Gfx3Texture): void {
    this.normalMap = texture;
    this.params[Gfx3WaterParam.NORMAL_MAP_ENABLED] = 1;
    this.texturesChanged = true;
  }

  /**
   * Définit les deux textures personnalisées optionnelles du shader.
   *
   * @param textures - Textures indexées par les emplacements `0` et `1`.
   */
  setCustomTextures(textures: { 0?: Gfx3Texture, 1?: Gfx3Texture }): void {
    if (textures[0]) {
      this.s0Texture = textures[0];
      this.texturesChanged = true;
    }

    if (textures[1]) {
      this.s1Texture = textures[1];
      this.texturesChanged = true;
    }

    this.params[Gfx3WaterParam.S0_TEXTURE_EXIST] = textures[0] ? 1 : 0;
    this.params[Gfx3WaterParam.S1_TEXTURE_EXIST] = textures[1] ? 1 : 0;
  }

  /**
   * Obtient le groupe de liaison 2 et actualise ses textures si nécessaire.
   *
   * @returns Le groupe de liaison contenant les textures et leurs échantillonneurs.
   */
  getGroup02(): Gfx3StaticGroup {
    if (this.texturesChanged) {
      this.grp2.setTexture(0, 'ENV_MAP_TEXTURE', this.envMap, { dimension: 'cube' });
      this.grp2.setSampler(1, 'ENV_MAP_SAMPLER', this.envMap);
      this.grp2.setTexture(2, 'NORMAL_MAP_TEXTURE', this.normalMap);
      this.grp2.setSampler(3, 'NORMAL_MAP_SAMPLER', this.normalMap);
      this.grp2.setTexture(4, 'S0_TEXTURE', this.s0Texture);
      this.grp2.setSampler(5, 'S0_SAMPLER', this.s0Texture);
      this.grp2.setTexture(6, 'S1_TEXTURE', this.s1Texture);
      this.grp2.setSampler(7, 'S1_SAMPLER', this.s1Texture);
      this.grp2.allocate();
      this.texturesChanged = false;
    }

    return this.grp2;
  }
}