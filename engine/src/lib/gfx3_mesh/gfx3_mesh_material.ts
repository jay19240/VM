import { eventManager } from '../core/event_manager';
import { gfx3TextureManager } from '../gfx3/gfx3_texture_manager';
import { gfx3Manager } from '../gfx3/gfx3_manager';
import { Gfx3StaticGroup } from '../gfx3/gfx3_group';
import { Gfx3Texture } from '../gfx3/gfx3_texture';
import { Gfx3MatParam, MESH_MAT_CUSTOM_PARAMS } from './gfx3_mesh_shader';

/** Énumère les textures pouvant recevoir une animation de type flipbook. */
export enum Gfx3MatFlipbookTarget {
  TEXTURE = 'Texture',
  SECONDARY_TEXTURE = 'SecondaryTexture',
  DISPLACEMENT_MAP = 'DisplacementMap',
  DISSOLVE_MAP = 'DissolveMap'
};

/** Énumère les modes de fusion disponibles pour les textures et les couleurs. */
export enum Gfx3MatBlendingMode {
  NONE,
  ADD,
  MUL,
  MIX
};

/** Regroupe les options de création et les paramètres initiaux d'un matériau. */
export interface Gfx3MatOptions {
  shadowCasting?: boolean;
  flipbooks?: Array<Gfx3MatFlipbook>;
  customParams?: Array<{ name: string, value: number }>;
  // --------------------------------------
  id?: number;
  opacity?: number;
  // --------------------------------------
  shadowEnabled?: boolean;
  // --------------------------------------
  decalEnabled?: boolean;
  decalGroup?: number;
  // --------------------------------------
  lightEnabled?: boolean;
  lightGroup?: number;
  lightGouraudShadingEnabled?: boolean;
  lightEmissiveFactor?: number;
  lightEmissiveR?: number;
  lightEmissiveG?: number;
  lightEmissiveB?: number;
  lightAmbientR?: number;
  lightAmbientG?: number;
  lightAmbientB?: number;
  lightDiffuseR?: number;
  lightDiffuseG?: number;
  lightDiffuseB?: number;
  lightSpecularFactor?: number;
  lightSpecularR?: number;
  lightSpecularG?: number;
  lightSpecularB?: number;
  // --------------------------------------
  texture?: Gfx3Texture;
  textureScrollAngle?: number;
  textureScrollRate?: number;
  textureOffsetX?: number;
  textureOffsetY?: number;
  textureScaleX?: number;
  textureScaleY?: number;
  textureRotationAngle?: number;
  textureOpacity?: number;
  textureBlendColorR?: number,
  textureBlendColorG?: number,
  textureBlendColorB?: number,
  textureBlendColorMode?: Gfx3MatBlendingMode;
  textureBlendColorMix?: number,
  // --------------------------------------
  secondaryTexture?: Gfx3Texture;
  secondaryTextureScrollAngle?: number;
  secondaryTextureScrollRate?: number;
  secondaryTextureOffsetX?: number;
  secondaryTextureOffsetY?: number;
  secondaryTextureScaleX?: number;
  secondaryTextureScaleY?: number;
  secondaryTextureRotationAngle?: number;
  secondaryTextureOpacity?: number;
  secondaryTextureBlendMode?: Gfx3MatBlendingMode;
  secondaryTextureBlendColorR?: number,
  secondaryTextureBlendColorG?: number,
  secondaryTextureBlendColorB?: number,
  secondaryTextureBlendColorMode?: Gfx3MatBlendingMode;
  secondaryTextureBlendColorMix?: number,
  // --------------------------------------
  envMap?: Gfx3Texture;
  envMapOpacity?: number;
  // --------------------------------------
  normalMap?: Gfx3Texture;
  normalMapScrollAngle?: number;
  normalMapScrollRate?: number;
  normalMapOffsetX?: number;
  normalMapOffsetY?: number;
  normalMapScaleX?: number;
  normalMapScaleY?: number;
  normalMapRotationAngle?: number;
  normalMapIntensity?: number;
  // --------------------------------------
  displacementMap?: Gfx3Texture;
  displacementMapScrollAngle?: number;
  displacementMapScrollRate?: number;
  displacementMapOffsetX?: number;
  displacementMapOffsetY?: number;
  displacementMapScaleX?: number;
  displacementMapScaleY?: number;
  displacementMapRotationAngle?: number;
  displacementMapFactor?: number;
  displaceTextureEnabled?: boolean;
  displaceSecondaryTextureEnabled?: boolean;
  displaceNormalMapEnabled?: boolean;
  displaceDissolveMapEnabled?: boolean;
  displaceEnvMapEnabled?: boolean;
  // --------------------------------------
  dissolveMap?: Gfx3Texture;
  dissolveMapScrollAngle?: number;
  dissolveMapScrollRate?: number;
  dissolveMapOffsetX?: number;
  dissolveMapOffsetY?: number;
  dissolveMapScaleX?: number;
  dissolveMapScaleY?: number;
  dissolveMapRotationAngle?: number;
  dissolveGlowR?: number;
  dissolveGlowG?: number;
  dissolveGlowB?: number;
  dissolveGlowRange?: number;
  dissolveGlowFalloff?: number;
  dissolveAmount?: number;
  // --------------------------------------
  toonMap?: Gfx3Texture;
  toonMapOpacity?: number;
  toonLightDirX?: number;
  toonLightDirY?: number;
  toonLightDirZ?: number;
  // --------------------------------------
  emissiveMap?: Gfx3Texture;
  // --------------------------------------
  diffuseMap?: Gfx3Texture;
  // --------------------------------------
  specularMap?: Gfx3Texture;
  // --------------------------------------
  thuneMap?: Gfx3Texture;
  thuneMapShininessEnabled?: boolean;
  thuneMapArcadeEnabled?: boolean;
  thuneMapReflectiveEnabled?: boolean;
  // --------------------------------------
  alphaBlendEnabled?: number;
  alphaBlendFacing?: number;
  alphaBlendDistance?: number;
  // --------------------------------------
  jitterVertexEnabled?: boolean;
  jitterVertexLevel?: number;
  // --------------------------------------
  arcadeEnabled?: boolean;
  arcadeStartColorR?: number;
  arcadeStartColorG?: number;
  arcadeStartColorB?: number;
  arcadeEndColorR?: number;
  arcadeEndColorG?: number;
  arcadeEndColorB?: number;
  arcadeSharpColorR?: number;
  arcadeSharpColorG?: number;
  arcadeSharpColorB?: number;
  // --------------------------------------
  jamFrameIndexA?: number;
  jamFrameIndexB?: number;
  jamIsAnimated?: boolean;
  jamInterpolated?: boolean;
  jamLastFrameTime?: number;
  jamFrameDuration?: number;
  jamNumVertices?: number;
  // --------------------------------------
  s0Texture?: Gfx3Texture;
  s1Texture?: Gfx3Texture;
};

/** Décrit la disposition et la cadence d'une animation de texture en flipbook. */
export interface Gfx3MatFlipbook {
  textureTarget: Gfx3MatFlipbookTarget;
  frameWidth: number;
  frameHeight: number;
  numCol: number;
  numRow: number;
  numFrames: number;
  frameDuration: number;
};

/** Décrit l'état d'exécution d'une animation de texture en flipbook. */
export interface Gfx3MatAnimation {
  flipbook: Gfx3MatFlipbook;
  currentFrameIndex: number;
  looped: boolean;
  frameProgress: number;
  blendingStartAt: number;
  offsetParams: [number, number];
  offsetNextParams: [number, number];
  offsetBlendingParam: number;
};

/**
 * Représente le matériau de surface d'un maillage et ses ressources GPU.
 *
 * Émet l'événement `E_FINISHED` à la fin d'une animation de texture.
 */
export class Gfx3Material {
  shadowCasting: boolean;
  flipbooks: Array<Gfx3MatFlipbook>;
  animations: Map<Gfx3MatFlipbookTarget, Gfx3MatAnimation>;
  dataChanged: boolean;
  texturesChanged: boolean;
  jamFramesChanged: boolean;
  grp2: Gfx3StaticGroup;
  params: Float32Array;
  grp3: Gfx3StaticGroup;
  envMap: Gfx3Texture;
  normalMap: Gfx3Texture;
  texture: Gfx3Texture;
  secondaryTexture: Gfx3Texture;
  displacementMap: Gfx3Texture;
  dissolveMap: Gfx3Texture;
  toonMap: Gfx3Texture;
  emissiveMap: Gfx3Texture;
  diffuseMap: Gfx3Texture;
  specularMap: Gfx3Texture;
  thuneMap: Gfx3Texture;
  s0Texture: Gfx3Texture;
  s1Texture: Gfx3Texture;
  jamFrames: Float32Array;

  /**
   * Crée un matériau et alloue ses groupes de ressources GPU.
   *
   * @param options - Options de configuration initiale du matériau.
   */
  constructor(options: Gfx3MatOptions) {
    this.shadowCasting = options.shadowCasting ?? false;
    this.flipbooks = options.flipbooks ?? [];
    this.animations = new Map();
    this.dataChanged = true;
    this.texturesChanged = false;
    this.jamFramesChanged = false;

    this.grp2 = gfx3Manager.createStaticGroup('MESH_PIPELINE', 2);
    this.params = this.grp2.setFloat(0, 'MAT_PARAMS', Gfx3MatParam.COUNT + Object.values(MESH_MAT_CUSTOM_PARAMS).length);
    this.params[Gfx3MatParam.ID] = options.id ?? 0;
    this.params[Gfx3MatParam.OPACITY] = options.opacity ?? 1.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.SHADOW_ENABLED] = options.shadowEnabled ? 1.0 : 0.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.DECAL_ENABLED] = options.decalEnabled ? 1.0 : 0.0;
    this.params[Gfx3MatParam.DECAL_GROUP] = options.decalGroup ?? 0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.LIGHT_ENABLED] = options.lightEnabled ? 1.0 : 0.0;
    this.params[Gfx3MatParam.LIGHT_GROUP] = options.lightGroup ?? 0;
    this.params[Gfx3MatParam.LIGHT_GOURAUD_SHADING_ENABLED] = options.lightGouraudShadingEnabled ? 1.0 : 0.0;
    this.params[Gfx3MatParam.LIGHT_EMISSIVE_FACTOR] = options.lightEmissiveFactor ?? 1.0;
    this.params[Gfx3MatParam.LIGHT_EMISSIVE_R] = options.lightEmissiveR ?? 0.0;
    this.params[Gfx3MatParam.LIGHT_EMISSIVE_G] = options.lightEmissiveG ?? 0.0;
    this.params[Gfx3MatParam.LIGHT_EMISSIVE_B] = options.lightEmissiveB ?? 0.0;
    this.params[Gfx3MatParam.LIGHT_AMBIENT_R] = options.lightAmbientR ?? 0.5;
    this.params[Gfx3MatParam.LIGHT_AMBIENT_G] = options.lightAmbientG ?? 0.5;
    this.params[Gfx3MatParam.LIGHT_AMBIENT_B] = options.lightAmbientB ?? 0.5;
    this.params[Gfx3MatParam.LIGHT_DIFFUSE_R] = options.lightDiffuseR ?? 1.0;
    this.params[Gfx3MatParam.LIGHT_DIFFUSE_G] = options.lightDiffuseG ?? 1.0;
    this.params[Gfx3MatParam.LIGHT_DIFFUSE_B] = options.lightDiffuseB ?? 1.0;
    this.params[Gfx3MatParam.LIGHT_SPECULAR_FACTOR] = options.lightSpecularFactor ?? 1.0;
    this.params[Gfx3MatParam.LIGHT_SPECULAR_R] = options.lightSpecularR ?? 0.0;
    this.params[Gfx3MatParam.LIGHT_SPECULAR_G] = options.lightSpecularG ?? 0.0;
    this.params[Gfx3MatParam.LIGHT_SPECULAR_B] = options.lightSpecularB ?? 0.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.TEXTURE_EXIST] = options.texture ? 1.0 : 0.0;
    this.params[Gfx3MatParam.TEXTURE_SCROLL_ANGLE] = options.textureScrollAngle ?? 0.0;
    this.params[Gfx3MatParam.TEXTURE_SCROLL_RATE] = options.textureScrollRate ?? 0.0;
    this.params[Gfx3MatParam.TEXTURE_OFFSET_X] = options.textureOffsetX ?? 0.0;
    this.params[Gfx3MatParam.TEXTURE_OFFSET_Y] = options.textureOffsetY ?? 0.0;
    this.params[Gfx3MatParam.TEXTURE_OFFSET_NEXT_X] = 0.0;
    this.params[Gfx3MatParam.TEXTURE_OFFSET_NEXT_Y] = 0.0;
    this.params[Gfx3MatParam.TEXTURE_OFFSET_BLENDING] = 0.0;
    this.params[Gfx3MatParam.TEXTURE_SCALE_X] = options.textureScaleX ?? 1.0;
    this.params[Gfx3MatParam.TEXTURE_SCALE_Y] = options.textureScaleY ?? 1.0;
    this.params[Gfx3MatParam.TEXTURE_ROTATION_ANGLE] = options.textureRotationAngle ?? 0.0;
    this.params[Gfx3MatParam.TEXTURE_OPACITY] = options.textureOpacity ?? 1.0;
    this.params[Gfx3MatParam.TEXTURE_BLEND_COLOR_R] = options.textureBlendColorR ?? 1.0;
    this.params[Gfx3MatParam.TEXTURE_BLEND_COLOR_G] = options.textureBlendColorG ?? 1.0;
    this.params[Gfx3MatParam.TEXTURE_BLEND_COLOR_B] = options.textureBlendColorB ?? 1.0;
    this.params[Gfx3MatParam.TEXTURE_BLEND_COLOR_MODE] = options.textureBlendColorMode ?? 0.0;
    this.params[Gfx3MatParam.TEXTURE_BLEND_COLOR_MIX] = options.textureBlendColorMix ?? 1.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_EXIST] = options.secondaryTexture ? 1.0 : 0.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_SCROLL_ANGLE] = options.secondaryTextureScrollAngle ?? 0.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_SCROLL_RATE] = options.secondaryTextureScrollRate ?? 0.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_OFFSET_X] = options.secondaryTextureOffsetX ?? 0.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_OFFSET_Y] = options.secondaryTextureOffsetY ?? 0.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_OFFSET_NEXT_X] = 0.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_OFFSET_NEXT_Y] = 0.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_OFFSET_BLENDING] = 0.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_SCALE_X] = options.secondaryTextureScaleX ?? 1.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_SCALE_Y] = options.secondaryTextureScaleY ?? 1.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_ROTATION_ANGLE] = options.secondaryTextureRotationAngle ?? 0.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_OPACITY] = options.secondaryTextureOpacity ?? 1.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_BLEND_MODE] = options.secondaryTextureBlendMode ?? 0.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_BLEND_COLOR_R] = options.secondaryTextureBlendColorR ?? 1.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_BLEND_COLOR_G] = options.secondaryTextureBlendColorG ?? 1.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_BLEND_COLOR_B] = options.secondaryTextureBlendColorB ?? 1.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_BLEND_COLOR_MODE] = options.secondaryTextureBlendColorMode ?? 0.0;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_BLEND_COLOR_MIX] = options.secondaryTextureBlendColorMix ?? 1.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.ENV_MAP_EXIST] = options.envMap ? 1.0 : 0.0;
    this.params[Gfx3MatParam.ENV_MAP_OPACITY] = options.envMapOpacity ?? 1.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.NORMAL_MAP_EXIST] = options.normalMap ? 1.0 : 0.0;
    this.params[Gfx3MatParam.NORMAL_MAP_SCROLL_ANGLE] = options.normalMapScrollAngle ?? 0.0;
    this.params[Gfx3MatParam.NORMAL_MAP_SCROLL_RATE] = options.normalMapScrollRate ?? 0.0;
    this.params[Gfx3MatParam.NORMAL_MAP_OFFSET_X] = options.normalMapOffsetX ?? 0.0;
    this.params[Gfx3MatParam.NORMAL_MAP_OFFSET_Y] = options.normalMapOffsetY ?? 0.0;
    this.params[Gfx3MatParam.NORMAL_MAP_SCALE_X] = options.normalMapScaleX ?? 1.0;
    this.params[Gfx3MatParam.NORMAL_MAP_SCALE_Y] = options.normalMapScaleY ?? 1.0;
    this.params[Gfx3MatParam.NORMAL_MAP_ROTATION_ANGLE] = options.normalMapRotationAngle ?? 0.0;
    this.params[Gfx3MatParam.NORMAL_MAP_INTENSITY] = options.normalMapIntensity ?? 1.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.DISPLACEMENT_MAP_EXIST] = options.displacementMap ? 1.0 : 0.0;
    this.params[Gfx3MatParam.DISPLACEMENT_MAP_SCROLL_ANGLE] = options.displacementMapScrollAngle ?? 0.0;
    this.params[Gfx3MatParam.DISPLACEMENT_MAP_SCROLL_RATE] = options.displacementMapScrollRate ?? 0.0;
    this.params[Gfx3MatParam.DISPLACEMENT_MAP_OFFSET_X] = options.displacementMapOffsetX ?? 0.0;
    this.params[Gfx3MatParam.DISPLACEMENT_MAP_OFFSET_Y] = options.displacementMapOffsetY ?? 0.0;
    this.params[Gfx3MatParam.DISPLACEMENT_MAP_SCALE_X] = options.displacementMapScaleX ?? 1.0;
    this.params[Gfx3MatParam.DISPLACEMENT_MAP_SCALE_Y] = options.displacementMapScaleY ?? 1.0;
    this.params[Gfx3MatParam.DISPLACEMENT_MAP_ROTATION_ANGLE] = options.displacementMapRotationAngle ?? 0.0;
    this.params[Gfx3MatParam.DISPLACEMENT_MAP_FACTOR] = options.displacementMapFactor ?? 1.0;
    this.params[Gfx3MatParam.DISPLACE_TEXTURE_ENABLED] = options.displaceTextureEnabled ? 1.0 : 0.0;
    this.params[Gfx3MatParam.DISPLACE_SECONDARY_TEXTURE_ENABLED] = options.displaceSecondaryTextureEnabled ? 1.0 : 0.0;
    this.params[Gfx3MatParam.DISPLACE_NORMAL_MAP_ENABLED] = options.displaceNormalMapEnabled ? 1.0 : 0.0;
    this.params[Gfx3MatParam.DISPLACE_DISSOLVE_MAP_ENABLED] = options.displaceDissolveMapEnabled ? 1.0 : 0.0;
    this.params[Gfx3MatParam.DISPLACE_ENV_MAP_ENABLED] = options.displaceEnvMapEnabled ? 1.0 : 0.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.DISSOLVE_MAP_EXIST] = options.dissolveMap ? 1.0 : 0.0;
    this.params[Gfx3MatParam.DISSOLVE_MAP_SCROLL_ANGLE] = options.dissolveMapScrollAngle ?? 0.0;
    this.params[Gfx3MatParam.DISSOLVE_MAP_SCROLL_RATE] = options.dissolveMapScrollRate ?? 0.0;
    this.params[Gfx3MatParam.DISSOLVE_MAP_OFFSET_X] = options.dissolveMapOffsetX ?? 0.0;
    this.params[Gfx3MatParam.DISSOLVE_MAP_OFFSET_Y] = options.dissolveMapOffsetY ?? 0.0;
    this.params[Gfx3MatParam.DISSOLVE_MAP_SCALE_X] = options.dissolveMapScaleX ?? 1.0;
    this.params[Gfx3MatParam.DISSOLVE_MAP_SCALE_Y] = options.dissolveMapScaleY ?? 1.0;
    this.params[Gfx3MatParam.DISSOLVE_MAP_ROTATION_ANGLE] = options.dissolveMapRotationAngle ?? 0.0;
    this.params[Gfx3MatParam.DISSOLVE_GLOW_R] = options.dissolveGlowR ?? 1.0;
    this.params[Gfx3MatParam.DISSOLVE_GLOW_G] = options.dissolveGlowG ?? 1.0;
    this.params[Gfx3MatParam.DISSOLVE_GLOW_B] = options.dissolveGlowB ?? 1.0;
    this.params[Gfx3MatParam.DISSOLVE_GLOW_RANGE] = options.dissolveGlowRange ?? 0.0;
    this.params[Gfx3MatParam.DISSOLVE_GLOW_FALLOFF] = options.dissolveGlowFalloff ?? 0.0;
    this.params[Gfx3MatParam.DISSOLVE_AMOUNT] = options.dissolveAmount ?? 0.5;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.TOON_MAP_EXIST] = options.toonMap ? 1.0 : 0.0;
    this.params[Gfx3MatParam.TOON_MAP_OPACITY] = options.toonMapOpacity ?? 1.0;
    this.params[Gfx3MatParam.TOON_LIGHT_DIR_X] = options.toonLightDirX ?? 0.0;
    this.params[Gfx3MatParam.TOON_LIGHT_DIR_Y] = options.toonLightDirY ?? 0.0;
    this.params[Gfx3MatParam.TOON_LIGHT_DIR_Z] = options.toonLightDirZ ?? 0.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.EMISSIVE_MAP_EXIST] = options.emissiveMap ? 1.0 : 0.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.DIFFUSE_MAP_EXIST] = options.diffuseMap ? 1.0 : 0.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.SPECULAR_MAP_EXIST] = options.specularMap ? 1.0 : 0.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.THUNE_MAP_EXIST] = options.thuneMap ? 1.0 : 0.0;
    this.params[Gfx3MatParam.THUNE_MAP_SHININESS_ENABLED] = options.thuneMapShininessEnabled ? 1.0 : 0.0;
    this.params[Gfx3MatParam.THUNE_MAP_ARCADE_ENABLED] = options.thuneMapArcadeEnabled ? 1.0 : 0.0;
    this.params[Gfx3MatParam.THUNE_MAP_REFLECTIVE_ENABLED] = options.thuneMapReflectiveEnabled ? 1.0 : 0.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.ALPHA_BLEND_ENABLED] = options.alphaBlendEnabled ? 1.0 : 0.0;
    this.params[Gfx3MatParam.ALPHA_BLEND_FACING] = options.alphaBlendFacing ?? 1.0;
    this.params[Gfx3MatParam.ALPHA_BLEND_DISTANCE] = options.alphaBlendFacing ?? 0.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.JITTER_VERTEX_ENABLED] = options.jitterVertexEnabled ? 1.0 : 0.0;
    this.params[Gfx3MatParam.JITTER_VERTEX_LEVEL] = options.jitterVertexLevel ?? 120.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.ARCADE_ENABLED] = options.arcadeEnabled ? 1.0 : 0.0;
    this.params[Gfx3MatParam.ARCADE_START_COLOR_R] = options.arcadeStartColorR ?? 0.0;
    this.params[Gfx3MatParam.ARCADE_START_COLOR_G] = options.arcadeStartColorG ?? 0.0;
    this.params[Gfx3MatParam.ARCADE_START_COLOR_B] = options.arcadeStartColorB ?? 0.0;
    this.params[Gfx3MatParam.ARCADE_END_COLOR_R] = options.arcadeEndColorR ?? 0.0;
    this.params[Gfx3MatParam.ARCADE_END_COLOR_G] = options.arcadeEndColorG ?? 0.0;
    this.params[Gfx3MatParam.ARCADE_END_COLOR_B] = options.arcadeEndColorB ?? 0.0;
    this.params[Gfx3MatParam.ARCADE_SHARP_COLOR_R] = options.arcadeSharpColorR ?? 0.0;
    this.params[Gfx3MatParam.ARCADE_SHARP_COLOR_G] = options.arcadeSharpColorG ?? 0.0;
    this.params[Gfx3MatParam.ARCADE_SHARP_COLOR_B] = options.arcadeSharpColorB ?? 0.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.JAM_FRAME_INDEX_A] = options.jamFrameIndexA ?? 0.0;
    this.params[Gfx3MatParam.JAM_FRAME_INDEX_B] = options.jamFrameIndexB ?? 0.0;
    this.params[Gfx3MatParam.JAM_IS_ANIMATED] = options.jamIsAnimated ? 1.0 : 0.0;
    this.params[Gfx3MatParam.JAM_INTERPOLATED] = options.jamInterpolated ? Number(options.jamInterpolated) : 1.0;
    this.params[Gfx3MatParam.JAM_LAST_FRAME_TIME] = options.jamLastFrameTime ?? 0.0;
    this.params[Gfx3MatParam.JAM_FRAME_DURATION] = options.jamFrameDuration ?? 0.0;
    this.params[Gfx3MatParam.JAM_NUM_VERTICES] = options.jamNumVertices ?? 0.0;
    // --------------------------------------------------------------------------------------------------------
    this.params[Gfx3MatParam.S0_TEXTURE_EXIST] = options.s0Texture ? 1.0 : 0.0;
    this.params[Gfx3MatParam.S1_TEXTURE_EXIST] = options.s1Texture ? 1.0 : 0.0;
    // --------------------------------------------------------------------------------------------------------
    if (options.customParams) {
      for (const p of options.customParams) {
        const paramIndex = Object.values(MESH_MAT_CUSTOM_PARAMS).findIndex(n => n == p.name);
        if (paramIndex != -1) {
          this.params[Gfx3MatParam.COUNT + paramIndex] = p.value ?? 0.0;
        }
      }
    }

    this.grp3 = gfx3Manager.createStaticGroup('MESH_PIPELINE', 3, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    this.texture = this.grp3.setTexture(0, 'MAT_TEXTURE', options.texture ?? gfx3Manager.createTextureFromBitmap());
    this.texture = this.grp3.setSampler(1, 'MAT_TEXTURE_SAMPLER', this.texture);
    this.secondaryTexture = this.grp3.setTexture(2, 'MAT_SECONDARY_TEXTURE', options.secondaryTexture ?? gfx3Manager.createTextureFromBitmap());
    this.secondaryTexture = this.grp3.setSampler(3, 'MAT_SECONDARY_TEXTURE_SAMPLER', this.secondaryTexture);
    this.displacementMap = this.grp3.setTexture(4, 'MAT_DISPLACEMENT_MAP', options.displacementMap ?? gfx3Manager.createTextureFromBitmap());
    this.displacementMap = this.grp3.setSampler(5, 'MAT_DISPLACEMENT_MAP_SAMPLER', this.displacementMap);
    this.diffuseMap = this.grp3.setTexture(6, 'MAT_DIFFUSE_MAP', options.diffuseMap ?? gfx3Manager.createTextureFromBitmap());
    this.diffuseMap = this.grp3.setSampler(7, 'MAT_DIFFUSE_MAP_SAMPLER', this.diffuseMap);
    this.specularMap = this.grp3.setTexture(8, 'MAT_SPECULAR_MAP', options.specularMap ?? gfx3Manager.createTextureFromBitmap());
    this.specularMap = this.grp3.setSampler(9, 'MAT_SPECULAR_MAP_SAMPLER', this.specularMap);
    this.emissiveMap = this.grp3.setTexture(10, 'MAT_EMISSIVE_MAP', options.emissiveMap ?? gfx3Manager.createTextureFromBitmap());
    this.emissiveMap = this.grp3.setSampler(11, 'MAT_EMISSIVE_MAP_SAMPLER', this.emissiveMap);
    this.normalMap = this.grp3.setTexture(12, 'MAT_NORMAL_MAP', options.normalMap ?? gfx3Manager.createTextureFromBitmap());
    this.normalMap = this.grp3.setSampler(13, 'MAT_NORMAL_MAP_SAMPLER', this.normalMap);
    this.envMap = this.grp3.setTexture(14, 'MAT_ENV_MAP', options.envMap ?? gfx3Manager.createCubeMapFromBitmap(), { dimension: 'cube' });
    this.envMap = this.grp3.setSampler(15, 'MAT_ENV_MAP_SAMPLER', this.envMap);
    this.toonMap = this.grp3.setTexture(16, 'MAT_TOON_MAP', options.toonMap ?? gfx3Manager.createTextureFromBitmap());
    this.toonMap = this.grp3.setSampler(17, 'MAT_TOON_MAP_SAMPLER', this.toonMap);
    this.dissolveMap = this.grp3.setTexture(18, 'MAT_DISSOLVE_MAP', options.dissolveMap ?? gfx3Manager.createTextureFromBitmap());
    this.dissolveMap = this.grp3.setSampler(19, 'MAT_DISSOLVE_MAP_SAMPLER', this.dissolveMap);
    this.thuneMap = this.grp3.setTexture(20, 'MAT_THUNE_MAP', options.thuneMap ?? gfx3Manager.createTextureFromBitmap());
    this.thuneMap = this.grp3.setSampler(21, 'MAT_THUNE_MAP_SAMPLER', this.thuneMap);
    this.s0Texture = this.grp3.setTexture(22, 'MAT_S0_TEXTURE', gfx3Manager.createTextureFromBitmap());
    this.s0Texture = this.grp3.setSampler(23, 'MAT_S0_TEXTURE_SAMPLER', this.s0Texture);
    this.s1Texture = this.grp3.setTexture(24, 'MAT_S1_TEXTURE', gfx3Manager.createTextureFromBitmap());
    this.s1Texture = this.grp3.setSampler(25, 'MAT_S1_TEXTURE_SAMPLER', this.s1Texture);
    this.jamFrames = this.grp3.setStorageFloat(26, 'MAT_JAM_FRAMES', 1);

    this.grp2.allocate();
    this.grp3.allocate();
  }

  /**
   * Charge de façon asynchrone un fichier JSON MAT et crée le matériau correspondant.
   *
   * @param path - Chemin du fichier MAT.
   * @param textureDir - Répertoire préfixant les chemins des textures.
   * @returns Le matériau chargé et prêt à être utilisé.
   * @throws Si le fichier ne contient pas un matériau MAT valide.
   */
  static async createFromFile(path: string, textureDir: string = ''): Promise<Gfx3Material> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'MAT') {
      throw new Error('Gfx3Material::loadFromFile(): File not valid !');
    }

    const flipbooks = new Array<Gfx3MatFlipbook>();
    for (const obj of json['Flipbooks']) {
      flipbooks.push({
        textureTarget: obj['TextureTarget'],
        frameWidth: parseInt(obj['FrameWidth']),
        frameHeight: parseInt(obj['FrameHeight']),
        numCol: parseInt(obj['NumCol']),
        numRow: parseInt(obj['NumRow']),
        numFrames: parseInt(obj['NumFrames']),
        frameDuration: parseInt(obj['FrameDuration'])
      });
    }

    const customParams = new Array<{ name: string, value: number }>();
    for (const obj of json['CustomParams']) {
      customParams.push({
        name: obj['Name'],
        value: obj['Value']
      });
    }

    let envMap = undefined;
    if (json['EnvMapName'] && json['EnvMapRight'] && json['EnvMapLeft'] && json['EnvMapTop'] && json['EnvMapBottom'] && json['EnvMapFront'] && json['EnvMapBack']) {
      envMap = await gfx3TextureManager.loadCubemapTexture({
        right: textureDir + json['EnvMapRight'],
        left: textureDir + json['EnvMapLeft'],
        top: textureDir + json['EnvMapTop'],
        bottom: textureDir + json['EnvMapBottom'],
        front: textureDir + json['EnvMapFront'],
        back: textureDir + json['EnvMapBack']
      }, json['EnvMapRight'] + json['EnvMapLeft'] + json['EnvMapTop'] + json['EnvMapBottom'] + json['EnvMapFront'] + json['EnvMapBack']);
    }

    return new Gfx3Material({
      flipbooks: flipbooks,
      customParams: customParams,
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      id: json['Id'],
      opacity: json['Opacity'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      shadowEnabled: json['ShadowEnabled'],
      shadowCasting: json['ShadowCasting'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      decalEnabled: json['DecalEnabled'],
      decalGroup: json['DecalGroup'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      lightEnabled: json['LightEnabled'],
      lightGroup: json['LightGroup'],
      lightGouraudShadingEnabled: json['LightGouraudShadingEnabled'],
      lightEmissiveFactor: json['LightEmissiveFactor'],
      lightEmissiveR: json['LightEmissiveR'],
      lightEmissiveG: json['LightEmissiveG'],
      lightEmissiveB: json['LightEmissiveB'],
      lightAmbientR: json['LightAmbientR'],
      lightAmbientG: json['LightAmbientG'],
      lightAmbientB: json['LightAmbientB'],
      lightDiffuseR: json['LightDiffuseR'],
      lightDiffuseG: json['LightDiffuseG'],
      lightDiffuseB: json['LightDiffuseB'],
      lightSpecularFactor: json['LightSpecularFactor'],
      lightSpecularR: json['LightSpecularR'],
      lightSpecularG: json['LightSpecularG'],
      lightSpecularB: json['LightSpecularB'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      texture: json['Texture'] ? await gfx3TextureManager.loadTexture(textureDir + json['Texture']) : undefined,
      textureScrollAngle: json['TextureScrollAngle'],
      textureScrollRate: json['TextureScrollRate'],
      textureOffsetX: json['TextureOffsetX'],
      textureOffsetY: json['TextureOffsetY'],
      textureScaleX: json['TextureScaleX'],
      textureScaleY: json['TextureScaleY'],
      textureRotationAngle: json['TextureRotationAngle'],
      textureOpacity: json['TextureOpacity'],
      textureBlendColorR: json['TextureBlendColorR'],
      textureBlendColorG: json['TextureBlendColorG'],
      textureBlendColorB: json['TextureBlendColorB'],
      textureBlendColorMode: json['TextureBlendColorMode'],
      textureBlendColorMix: json['TextureBlendColorMix'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      secondaryTexture: json['SecondaryTexture'] ? await gfx3TextureManager.loadTexture(textureDir + json['SecondaryTexture']) : undefined,
      secondaryTextureScrollAngle: json['SecondaryTextureScrollAngle'],
      secondaryTextureScrollRate: json['SecondaryTextureScrollRate'],
      secondaryTextureOffsetX: json['SecondaryTextureOffsetX'],
      secondaryTextureOffsetY: json['SecondaryTextureOffsetY'],
      secondaryTextureScaleX: json['SecondaryTextureScaleX'],
      secondaryTextureScaleY: json['SecondaryTextureScaleY'],
      secondaryTextureRotationAngle: json['SecondaryTextureRotationAngle'],
      secondaryTextureOpacity: json['SecondaryTextureOpacity'],
      secondaryTextureBlendMode: json['SecondaryTextureBlendMode'],
      secondaryTextureBlendColorR: json['SecondaryTextureBlendColorR'],
      secondaryTextureBlendColorG: json['SecondaryTextureBlendColorG'],
      secondaryTextureBlendColorB: json['SecondaryTextureBlendColorB'],
      secondaryTextureBlendColorMode: json['SecondaryTextureBlendColorMode'],
      secondaryTextureBlendColorMix: json['SecondaryTextureBlendColorMix'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      envMap: envMap,
      envMapOpacity: json['EnvMapOpacity'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      normalMap: json['NormalMap'] ? await gfx3TextureManager.loadTexture(textureDir + json['NormalMap']) : undefined,
      normalMapScrollAngle: json['NormalMapScrollAngle'],
      normalMapScrollRate: json['NormalMapScrollRate'],
      normalMapOffsetX: json['NormalMapOffsetX'],
      normalMapOffsetY: json['NormalMapOffsetY'],
      normalMapScaleX: json['NormalMapScaleX'],
      normalMapScaleY: json['NormalMapScaleY'],
      normalMapRotationAngle: json['NormalMapRotationAngle'],
      normalMapIntensity: json['NormalMapIntensity'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      displacementMap: json['DisplacementMap'] ? await gfx3TextureManager.loadTexture(textureDir + json['DisplacementMap']) : undefined,
      displacementMapScrollAngle: json['DisplacementMapScrollAngle'],
      displacementMapScrollRate: json['DisplacementMapScrollRate'],
      displacementMapOffsetX: json['DisplacementMapOffsetX'],
      displacementMapOffsetY: json['DisplacementMapOffsetY'],
      displacementMapScaleX: json['DisplacementMapScaleX'],
      displacementMapScaleY: json['DisplacementMapScaleY'],
      displacementMapRotationAngle: json['DisplacementMapRotationAngle'],
      displacementMapFactor: json['DisplacementMapFactor'],
      displaceTextureEnabled: json['DisplaceTextureEnabled'],
      displaceSecondaryTextureEnabled: json['DisplaceSecondaryTextureEnabled'],
      displaceNormalMapEnabled: json['DisplaceNormalMapEnabled'],
      displaceDissolveMapEnabled: json['DisplaceDissolveMapEnabled'],
      displaceEnvMapEnabled: json['DisplaceEnvMapEnabled'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      dissolveMap: json['DissolveMap'] ? await gfx3TextureManager.loadTexture(textureDir + json['DissolveMap']) : undefined,
      dissolveMapScrollAngle: json['DissolveMapScrollAngle'],
      dissolveMapScrollRate: json['DissolveMapScrollRate'],
      dissolveMapOffsetX: json['DissolveMapOffsetX'],
      dissolveMapOffsetY: json['DissolveMapOffsetY'],
      dissolveMapScaleX: json['DissolveMapScaleX'],
      dissolveMapScaleY: json['DissolveMapScaleY'],
      dissolveMapRotationAngle: json['DissolveMapRotationAngle'],
      dissolveGlowR: json['DissolveGlowR'],
      dissolveGlowG: json['DissolveGlowG'],
      dissolveGlowB: json['DissolveGlowB'],
      dissolveGlowRange: json['DissolveGlowRange'],
      dissolveGlowFalloff: json['DissolveGlowFalloff'],
      dissolveAmount: json['DissolveAmount'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      toonMap: json['ToonMap'] ? await gfx3TextureManager.loadTexture(textureDir + json['ToonMap']) : undefined,
      toonMapOpacity: json['ToonMapOpacity'],
      toonLightDirX: json['ToonLightDirX'],
      toonLightDirY: json['ToonLightDirY'],
      toonLightDirZ: json['ToonLightDirZ'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      emissiveMap: json['EmissiveMap'] ? await gfx3TextureManager.loadTexture(textureDir + json['EmissiveMap']) : undefined,
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      diffuseMap: json['DiffuseMap'] ? await gfx3TextureManager.loadTexture(textureDir + json['DiffuseMap']) : undefined,
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      specularMap: json['SpecularMap'] ? await gfx3TextureManager.loadTexture(textureDir + json['SpecularMap']) : undefined,
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      thuneMap: json['ThuneMap'] ? await gfx3TextureManager.loadTexture(textureDir + json['ThuneMap']) : undefined,
      thuneMapShininessEnabled: json['ThuneMapShininessEnabled'],
      thuneMapArcadeEnabled: json['ThuneMapArcadeEnabled'],
      thuneMapReflectiveEnabled: json['ThuneMapReflectiveEnabled'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      alphaBlendEnabled: json['AlphaBlendEnabled'],
      alphaBlendFacing: json['AlphaBlendFacing'],
      alphaBlendDistance: json['AlphaBlendDistance'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      jitterVertexEnabled: json['JitterVertexEnabled'],
      jitterVertexLevel: json['JitterVertexLevel'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      arcadeEnabled: json['ArcadeEnabled'],
      arcadeStartColorR: json['ArcadeStartColorR'],
      arcadeStartColorG: json['ArcadeStartColorG'],
      arcadeStartColorB: json['ArcadeStartColorB'],
      arcadeEndColorR: json['ArcadeEndColorR'],
      arcadeEndColorG: json['ArcadeEndColorG'],
      arcadeEndColorB: json['ArcadeEndColorB'],
      arcadeSharpColorR: json['ArcadeSharpColorR'],
      arcadeSharpColorG: json['ArcadeSharpColorG'],
      arcadeSharpColorB: json['ArcadeSharpColorB'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      jamFrameIndexA: json['JamFrameIndexA'],
      jamFrameIndexB: json['JamFrameIndexB'],
      jamIsAnimated: json['JamIsAnimated'],
      jamInterpolated: json['JamInterpolated'],
      jamLastFrameTime: json['JamLastFrameTime'],
      jamFrameDuration: json['JamFrameDuration'],
      jamNumVertices: json['JamNumVertices'],
      // ----------------------------------------------------------------------------------------------------------------------------------------------
      s0Texture: json['S0Texture'] ? await gfx3TextureManager.loadTexture(textureDir + json['S0Texture']) : undefined,
      s1Texture: json['S1Texture'] ? await gfx3TextureManager.loadTexture(textureDir + json['S1Texture']) : undefined,
    });
  }

  /**
   * Libère toutes les ressources GPU détenues par le matériau.
   *
   * Cette méthode doit être appelée explicitement pour libérer les allocations de l'objet.
   */
  delete(): void {
    this.grp2.delete();
    this.grp3.delete();
  }

  /**
   * Fait progresser les animations de texture actives.
   *
   * @param ts - Pas de temps écoulé, en millisecondes.
   */
  update(ts: number): void {
    for (const animation of this.animations.values()) {
      if (animation.frameProgress == 0) {
        const offsetX = animation.flipbook.frameWidth * (animation.currentFrameIndex % animation.flipbook.numCol);
        const offsetY = animation.flipbook.frameHeight * Math.floor(animation.currentFrameIndex / animation.flipbook.numCol);

        const nextFrameIndex = (animation.currentFrameIndex + 1) % animation.flipbook.numFrames;
        const nextOffsetX = animation.flipbook.frameWidth * (nextFrameIndex % animation.flipbook.numCol);
        const nextOffsetY = animation.flipbook.frameHeight * Math.floor(nextFrameIndex / animation.flipbook.numCol);

        this.params[animation.offsetParams[0]] = offsetX / this.texture.gpuTexture.width;
        this.params[animation.offsetParams[1]] = offsetY / this.texture.gpuTexture.height;
        this.params[animation.offsetNextParams[0]] = nextOffsetX / this.texture.gpuTexture.width;
        this.params[animation.offsetNextParams[1]] = nextOffsetY / this.texture.gpuTexture.height;
        this.dataChanged = true;
      }

      const progressNormalized = animation.frameProgress / animation.flipbook.frameDuration;

      if (animation.blendingStartAt > 0.0 && animation.blendingStartAt <= progressNormalized) {
        const blending = (progressNormalized - animation.blendingStartAt) / (1.0 - animation.blendingStartAt);
        this.params[animation.offsetBlendingParam] = blending;
        this.dataChanged = true;
      }
      else {
        this.params[animation.offsetBlendingParam] = 0.0;
        this.dataChanged = true;
      }

      if (animation.frameProgress >= animation.flipbook.frameDuration) {
        if (animation.currentFrameIndex == animation.flipbook.numFrames - 1) {
          if (animation.looped) {
            animation.currentFrameIndex = 0;
            animation.frameProgress = 0;
          }
          else {
            this.animations.delete(animation.flipbook.textureTarget);
          }

          eventManager.emit(this, 'E_FINISHED');
        }
        else {
          animation.currentFrameIndex = animation.currentFrameIndex + 1;
          animation.frameProgress = 0;
        }
      }
      else {
        animation.frameProgress += ts;
      }
    }
  }

  /**
   * Définit si le matériau participe au rendu de la carte d'ombres.
   *
   * @param shadowCasting - Indique si les maillages utilisant ce matériau projettent des ombres.
   */
  setShadowCasting(shadowCasting: boolean): void {
    this.shadowCasting = shadowCasting;
  }

  /** Indique si les maillages utilisant ce matériau projettent des ombres. */
  isShadowCasting(): boolean {
    return this.shadowCasting;
  }

  /**
   * Lance l'animation flipbook d'une texture.
   *
   * @param textureTarget - Texture cible de l'animation.
   * @param looped - Indique si l'animation doit boucler.
   * @param preventSameAnimation - Empêche de relancer une animation déjà active sur cette cible.
   * @param blendingStartAt - Progression normalisée à partir de laquelle fondre vers l'image suivante.
   * @throws Si aucun flipbook n'est défini pour la texture cible.
   */
  playAnimation(textureTarget: Gfx3MatFlipbookTarget, looped: boolean = false, preventSameAnimation: boolean = false, blendingStartAt: number = 0.0): void {
    const flipbook = this.flipbooks.find(f => f.textureTarget == textureTarget);
    if (!flipbook) {
      throw new Error('Gfx3Material::playAnimation: flipbook not exist for this texture target.');
    }

    if (preventSameAnimation && this.animations.has(flipbook.textureTarget)) {
      return;
    }

    let offsetParams: vec2 = [Gfx3MatParam.TEXTURE_OFFSET_X, Gfx3MatParam.TEXTURE_OFFSET_Y];
    let offsetNextParams: vec2 = [Gfx3MatParam.TEXTURE_OFFSET_NEXT_X, Gfx3MatParam.TEXTURE_OFFSET_NEXT_Y];
    let offsetBlendingParam = Gfx3MatParam.TEXTURE_OFFSET_BLENDING;

    if (flipbook.textureTarget == Gfx3MatFlipbookTarget.SECONDARY_TEXTURE) {
      offsetParams = [Gfx3MatParam.SECONDARY_TEXTURE_OFFSET_X, Gfx3MatParam.SECONDARY_TEXTURE_OFFSET_Y];
      offsetNextParams = [Gfx3MatParam.SECONDARY_TEXTURE_OFFSET_NEXT_X, Gfx3MatParam.SECONDARY_TEXTURE_OFFSET_NEXT_Y];
      offsetBlendingParam = Gfx3MatParam.SECONDARY_TEXTURE_OFFSET_BLENDING;
    }
    else if (flipbook.textureTarget == Gfx3MatFlipbookTarget.DISPLACEMENT_MAP) {
      offsetParams = [Gfx3MatParam.DISPLACEMENT_MAP_OFFSET_X, Gfx3MatParam.DISPLACEMENT_MAP_OFFSET_Y];
    }
    else if (flipbook.textureTarget == Gfx3MatFlipbookTarget.DISSOLVE_MAP) {
      offsetParams = [Gfx3MatParam.DISSOLVE_MAP_OFFSET_X, Gfx3MatParam.DISSOLVE_MAP_OFFSET_Y];
    }

    this.animations.set(flipbook.textureTarget, {
      flipbook: flipbook,
      currentFrameIndex: 0,
      looped: looped,
      frameProgress: 0,
      blendingStartAt: blendingStartAt,
      offsetParams: offsetParams,
      offsetNextParams: offsetNextParams,
      offsetBlendingParam: offsetBlendingParam
    });
  }

  /**
   * Arrête l'animation de la texture indiquée et réinitialise ses décalages.
   *
   * @param textureTarget - Texture cible de l'animation.
   * @throws Si aucune animation n'est active sur cette cible.
   */
  stopAnimation(textureTarget: Gfx3MatFlipbookTarget): void {
    const animation = this.animations.get(textureTarget);
    if (!animation) {
      throw new Error('Gfx3Material::stopAnimation: animation not found on this texture target.');
    }

    this.params[animation.offsetParams[0]] = 0.0;
    this.params[animation.offsetParams[1]] = 0.0;
    this.params[animation.offsetBlendingParam] = 0.0;

    this.animations.delete(textureTarget);
    this.dataChanged = true;
  }

  /**
   * Remplace la liste des animations flipbook disponibles.
   *
   * @param flipbooks - Nouvelle liste de flipbooks.
   */
  setFlipbooks(flipbooks: Array<Gfx3MatFlipbook>): void {
    this.flipbooks = flipbooks;
  }

  /**
   * Modifie un paramètre uniforme du matériau.
   *
   * @param key - Indice du paramètre.
   * @param value - Nouvelle valeur du paramètre.
   */
  setParam(key: number, value: number): void {
    this.params[key] = value;
    this.dataChanged = true;
  }

  /**
   * Lit un paramètre uniforme du matériau.
   *
   * @param key - Indice du paramètre.
   * @returns La valeur du paramètre.
   */
  getParam(key: number): number {
    return this.params[key];
  }

  /**
   * Modifie un paramètre personnalisé du matériau.
   *
   * @param name - Nom du paramètre personnalisé.
   * @param value - Nouvelle valeur du paramètre.
   * @throws Si aucun paramètre personnalisé ne porte ce nom.
   */
  setCustomParamValue(name: string, value: number): void {
    const paramIndex = Object.values(MESH_MAT_CUSTOM_PARAMS).findIndex(n => n == name);
    if (paramIndex == -1) {
      throw new Error('Gfx3Material::setCustomParamValue(): Custom param name not found !');
    }

    this.params[Gfx3MatParam.COUNT + paramIndex] = value;
  }

  /**
   * Lit un paramètre personnalisé du matériau.
   *
   * @param name - Nom du paramètre personnalisé.
   * @returns La valeur du paramètre.
   * @throws Si aucun paramètre personnalisé ne porte ce nom.
   */
  getCustomParamValue(name: string): number {
    const paramIndex = Object.values(MESH_MAT_CUSTOM_PARAMS).findIndex(n => n == name);
    if (paramIndex == -1) {
      throw new Error('Gfx3Material::getCustomParamValue(): Custom param name not found !');
    }

    return this.params[Gfx3MatParam.COUNT + paramIndex];
  }

  /**
   * Transfère dans un tampon de stockage les données aplaties de toutes les images d'animation.
   *
   * Le matériau conserve volontairement ces données afin que l'interpolation des images soit
   * calculée sur le GPU, malgré le couplage supplémentaire que cela implique.
   *
   * @param frames - Données de sommets concaténées de toutes les images.
   */
  setJamFrames(frames: Array<number>): void {
    this.jamFrames = this.grp3.setStorageFloat(26, 'MAT_JAM_FRAMES', frames.length);
    this.jamFrames.set(frames);
    this.grp3.allocate();
    this.jamFramesChanged = true;
  }

  /**
   * Met à jour les paramètres nécessaires à l'interpolation GPU des images d'animation.
   *
   * Le matériau porte volontairement ces informations afin d'effectuer l'interpolation sur le GPU.
   *
   * @param frameIndexA - Indice de l'image courante.
   * @param frameIndexB - Indice de l'image suivante.
   * @param isAnimated - Indique si l'animation est active.
   * @param interpolated - Active ou désactive l'interpolation entre les images.
   * @param frameTimeStamp - Horodatage du dernier changement d'image.
   * @param frameDuration - Durée d'une image, en millisecondes.
   * @param numVertices - Nombre de sommets par image.
   */
  setJamInfos(frameIndexA: number, frameIndexB: number, isAnimated: boolean, interpolated: boolean, frameTimeStamp: number, frameDuration: number, numVertices: number): void {
    this.params[Gfx3MatParam.JAM_FRAME_INDEX_A] = frameIndexA;
    this.params[Gfx3MatParam.JAM_FRAME_INDEX_B] = frameIndexB;
    this.params[Gfx3MatParam.JAM_IS_ANIMATED] = isAnimated ? 1.0 : 0.0;
    this.params[Gfx3MatParam.JAM_INTERPOLATED] = interpolated ? 1.0 : 0.0;
    this.params[Gfx3MatParam.JAM_LAST_FRAME_TIME] = frameTimeStamp;
    this.params[Gfx3MatParam.JAM_FRAME_DURATION] = frameDuration;
    this.params[Gfx3MatParam.JAM_NUM_VERTICES] = numVertices;
    this.dataChanged = true;
  }

  /**
   * Définit la texture d'albédo principale et son défilement.
   *
   * @param texture - Texture d'albédo.
   * @param angle - Direction du défilement, en radians.
   * @param rate - Vitesse de défilement.
   */
  setTexture(texture: Gfx3Texture, angle: number = 0, rate: number = 0): void {
    this.texture = texture;
    this.params[Gfx3MatParam.TEXTURE_SCROLL_ANGLE] = angle;
    this.params[Gfx3MatParam.TEXTURE_SCROLL_RATE] = rate;
    this.params[Gfx3MatParam.TEXTURE_EXIST] = 1;
    this.texturesChanged = true;
    this.dataChanged = true;
  }

  /**
   * Définit la texture secondaire, son défilement et son mode de fusion.
   *
   * @param texture - Texture secondaire.
   * @param angle - Direction du défilement, en radians.
   * @param rate - Vitesse de défilement.
   * @param blendMode - Mode de fusion avec la texture principale.
   */
  setSecondaryTexture(texture: Gfx3Texture, angle: number = 0, rate: number = 0, blendMode: Gfx3MatBlendingMode = Gfx3MatBlendingMode.NONE): void {
    this.secondaryTexture = texture;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_SCROLL_ANGLE] = angle;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_SCROLL_RATE] = rate;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_BLEND_MODE] = blendMode;
    this.params[Gfx3MatParam.SECONDARY_TEXTURE_EXIST] = 1;
    this.texturesChanged = true;
    this.dataChanged = true;
  }

  /**
   * Définit la texture de déplacement utilisée pour décaler l'échantillonnage des autres textures.
   *
   * Un texel blanc déplace l'échantillonnage vers le coin supérieur gauche, un texel gris
   * ne le déplace pas et un texel noir le déplace vers le coin inférieur droit. Cet effet
   * convient notamment aux surfaces d'eau peu profonde ou de magma.
   *
   * @param displacementMap - Texture de déplacement.
   * @param angle - Direction du défilement, en radians.
   * @param rate - Vitesse de défilement.
   * @param factor - Intensité du déplacement.
   */
  setDisplacementMap(displacementMap: Gfx3Texture, angle: number = 0, rate: number = 0, factor: number = 0): void {
    this.displacementMap = displacementMap;
    this.params[Gfx3MatParam.DISPLACEMENT_MAP_SCROLL_ANGLE] = angle;
    this.params[Gfx3MatParam.DISPLACEMENT_MAP_SCROLL_RATE] = rate;
    this.params[Gfx3MatParam.DISPLACEMENT_MAP_FACTOR] = factor;
    this.params[Gfx3MatParam.DISPLACEMENT_MAP_EXIST] = 1;
    this.texturesChanged = true;
    this.dataChanged = true;
  }

  /**
   * Définit la texture de couleur diffuse.
   *
   * @param diffuseMap - Texture diffuse.
   */
  setDiffuseMap(diffuseMap: Gfx3Texture): void {
    this.diffuseMap = diffuseMap;
    this.params[Gfx3MatParam.DIFFUSE_MAP_EXIST] = 1;
    this.texturesChanged = true;
    this.dataChanged = true;
  }

  /**
   * Définit la texture spéculaire et le facteur de brillance.
   *
   * @param specularMap - Texture spéculaire.
   * @param specularFactor - Facteur de brillance spéculaire.
   */
  setSpecularMap(specularMap: Gfx3Texture, specularFactor: number = 1.0): void {
    this.specularMap = specularMap;
    this.params[Gfx3MatParam.SPECULAR_MAP_EXIST] = 1;
    this.params[Gfx3MatParam.LIGHT_SPECULAR_FACTOR] = specularFactor;
    this.texturesChanged = true;
    this.dataChanged = true;
  }

  /**
   * Définit la texture émissive et son intensité.
   *
   * @param emissiveMap - Texture émissive.
   * @param emissiveFactor - Facteur d'intensité émissive.
   */
  setEmissiveMap(emissiveMap: Gfx3Texture, emissiveFactor: number = 1.0): void {
    this.emissiveMap = emissiveMap;
    this.params[Gfx3MatParam.EMISSIVE_MAP_EXIST] = 1;
    this.params[Gfx3MatParam.LIGHT_EMISSIVE_FACTOR] = emissiveFactor;
    this.texturesChanged = true;
    this.dataChanged = true;
  }

  /**
   * Définit la texture de normales et son intensité.
   *
   * @param normalMap - Texture de normales.
   * @param normalIntensity - Intensité de la perturbation des normales.
   */
  setNormalMap(normalMap: Gfx3Texture, normalIntensity: number = 1.0): void {
    this.normalMap = normalMap;
    this.params[Gfx3MatParam.NORMAL_MAP_EXIST] = 1;
    this.params[Gfx3MatParam.NORMAL_MAP_INTENSITY] = normalIntensity;
    this.texturesChanged = true;
    this.dataChanged = true;
  }

  /**
   * Définit la texture cubique d'environnement et son opacité.
   *
   * @param envMap - Texture cubique d'environnement.
   * @param envMapOpacity - Opacité de la réflexion d'environnement.
   */
  setEnvMap(envMap: Gfx3Texture, envMapOpacity: number = 1.0): void {
    this.envMap = envMap;
    this.params[Gfx3MatParam.ENV_MAP_EXIST] = 1;
    this.params[Gfx3MatParam.ENV_MAP_OPACITY] = envMapOpacity;
    this.texturesChanged = true;
    this.dataChanged = true;
  }

  /**
   * Définit la texture d'ombrage toon et la direction de lumière associée.
   *
   * @param toonMap - Texture de rampe toon.
   * @param toonMapOpacity - Opacité de l'ombrage toon.
   * @param toonMapLightDir - Direction de la lumière utilisée par l'ombrage toon.
   */
  setToonMap(toonMap: Gfx3Texture, toonMapOpacity: number = 1.0, toonMapLightDir: vec3 = [0, 0, 0]): void {
    this.toonMap = toonMap;
    this.params[Gfx3MatParam.TOON_MAP_EXIST] = 1;
    this.params[Gfx3MatParam.TOON_MAP_OPACITY] = toonMapOpacity;
    this.params[Gfx3MatParam.TOON_LIGHT_DIR_X] = toonMapLightDir[0];
    this.params[Gfx3MatParam.TOON_LIGHT_DIR_Y] = toonMapLightDir[1];
    this.params[Gfx3MatParam.TOON_LIGHT_DIR_Z] = toonMapLightDir[2];
    this.texturesChanged = true;
    this.dataChanged = true;
  }

  /**
   * Définit la texture et les seuils de l'effet de dissolution.
   *
   * @param dissolveMap - Texture pilotant la dissolution.
   * @param glowRange - Étendue de la bordure lumineuse.
   * @param glowFalloff - Atténuation de la bordure lumineuse.
   * @param amount - Progression de la dissolution.
   */
  setDissolveMap(dissolveMap: Gfx3Texture, glowRange: number = 0.0, glowFalloff: number = 0.0, amount: number = 0.5): void {
    this.dissolveMap = dissolveMap;
    this.params[Gfx3MatParam.DISSOLVE_MAP_EXIST] = 1;
    this.params[Gfx3MatParam.DISSOLVE_GLOW_RANGE] = glowRange;
    this.params[Gfx3MatParam.DISSOLVE_GLOW_FALLOFF] = glowFalloff;
    this.params[Gfx3MatParam.DISSOLVE_AMOUNT] = amount;
    this.texturesChanged = true;
    this.dataChanged = true;
  }

  /**
   * Définit la texture THUNE qui encode la brillance en rouge, l'ombrage arcade en vert
   * et la réflectivité de l'environnement en bleu.
   *
   * @param thuneMap - Texture THUNE.
   * @param shininessEnabled - Active le canal de brillance.
   * @param arcadeEnabled - Active le canal d'ombrage arcade.
   * @param reflectiveEnabled - Active le canal de réflectivité.
   */
  setThuneMap(thuneMap: Gfx3Texture, shininessEnabled: boolean, arcadeEnabled: boolean, reflectiveEnabled: boolean): void {
    this.thuneMap = thuneMap;
    this.params[Gfx3MatParam.THUNE_MAP_EXIST] = 1;
    this.params[Gfx3MatParam.THUNE_MAP_SHININESS_ENABLED] = shininessEnabled ? 1 : 0;
    this.params[Gfx3MatParam.THUNE_MAP_ARCADE_ENABLED] = arcadeEnabled ? 1 : 0;
    this.params[Gfx3MatParam.THUNE_MAP_REFLECTIVE_ENABLED] = reflectiveEnabled ? 1 : 0;
    this.texturesChanged = true;
    this.dataChanged = true;
  }

  /**
   * Définit les deux textures personnalisées accessibles aux extensions de shader.
   *
   * @param textures - Textures indexées par les emplacements personnalisés `0` et `1`.
   */
  setCustomTextures(textures: { 0?: Gfx3Texture, 1?: Gfx3Texture }): void {
    if (textures[0]) {
      this.s0Texture = textures[0];
      this.texturesChanged = true;
      this.dataChanged = true;
    }

    if (textures[1]) {
      this.s1Texture = textures[1];
      this.texturesChanged = true;
      this.dataChanged = true;
    }

    this.params[Gfx3MatParam.S0_TEXTURE_EXIST] = textures[0] ? 1 : 0;
    this.params[Gfx3MatParam.S1_TEXTURE_EXIST] = textures[1] ? 1 : 0;
  }

  /**
   * Synchronise les paramètres modifiés avec le GPU.
   *
   * @returns Le groupe de liaison WebGPU d'indice 2.
   */
  getGroup02(): Gfx3StaticGroup {
    if (this.dataChanged) {
      this.grp2.beginWrite();
      this.grp2.write(0, this.params);
      this.grp2.endWrite();
      this.dataChanged = false;
    }

    return this.grp2;
  }

  /**
   * Synchronise les textures et les images d'animation modifiées avec le GPU.
   *
   * @returns Le groupe de liaison WebGPU d'indice 3.
   */
  getGroup03(): Gfx3StaticGroup {
    if (this.texturesChanged) {
      this.grp3.setTexture(0, 'MAT_TEXTURE', this.texture);
      this.grp3.setTexture(2, 'MAT_SECONDARY_TEXTURE', this.secondaryTexture);
      this.grp3.setTexture(4, 'MAT_DISPLACEMENT_MAP', this.displacementMap);
      this.grp3.setTexture(6, 'MAT_DIFFUSE_MAP', this.diffuseMap);
      this.grp3.setTexture(8, 'MAT_SPECULAR_MAP', this.specularMap);
      this.grp3.setTexture(10, 'MAT_EMISSIVE_MAP', this.emissiveMap);
      this.grp3.setTexture(12, 'MAT_NORMAL_MAP', this.normalMap);
      this.grp3.setTexture(14, 'MAT_ENV_MAP', this.envMap, { dimension: 'cube' });
      this.grp3.setTexture(16, 'MAT_TOON_MAP', this.toonMap);
      this.grp3.setTexture(18, 'MAT_DISSOLVE_MAP', this.dissolveMap);
      this.grp3.setTexture(20, 'MAT_THUNE_MAP', this.thuneMap);
      this.grp3.setTexture(22, 'MAT_S0_TEXTURE', this.s0Texture);
      this.grp3.setTexture(24, 'MAT_S1_TEXTURE', this.s1Texture);
      this.grp3.allocate();
      this.texturesChanged = false;
    }

    if (this.jamFramesChanged) {
      this.grp3.beginWrite();
      this.grp3.writeStorage(0, this.jamFrames);
      this.grp3.endWrite();
      this.jamFramesChanged = false;
    }

    return this.grp3;
  }

  /** Renvoie la texture d'albédo principale. */
  getTexture(): Gfx3Texture {
    return this.texture;
  }

  /** Renvoie la texture secondaire. */
  getSecondaryTexture(): Gfx3Texture {
    return this.secondaryTexture;
  }

  /** Renvoie la texture de déplacement. */
  getDisplacementMap(): Gfx3Texture {
    return this.displacementMap;
  }

  /** Renvoie la texture diffuse. */
  getDiffuseMap(): Gfx3Texture {
    return this.diffuseMap;
  }

  /** Renvoie la texture spéculaire. */
  getSpecularMap(): Gfx3Texture {
    return this.specularMap;
  }

  /** Renvoie la texture émissive. */
  getEmissiveMap(): Gfx3Texture {
    return this.emissiveMap;
  }

  /** Renvoie la texture de normales. */
  getNormalMap(): Gfx3Texture {
    return this.normalMap;
  }

  /** Renvoie la texture cubique d'environnement. */
  getEnvMap(): Gfx3Texture {
    return this.envMap;
  }

  /** Renvoie la texture de rampe toon. */
  getToonMap(): Gfx3Texture {
    return this.toonMap;
  }

  /** Renvoie la texture de dissolution. */
  getDissolveMap(): Gfx3Texture {
    return this.dissolveMap;
  }

  /** Renvoie la texture personnalisée de l'emplacement `0`. */
  getCustomTexture0(): Gfx3Texture {
    return this.s0Texture;
  }

  /** Renvoie la texture personnalisée de l'emplacement `1`. */
  getCustomTexture1(): Gfx3Texture {
    return this.s1Texture;
  }
}