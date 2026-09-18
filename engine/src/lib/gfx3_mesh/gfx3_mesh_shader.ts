import { Gfx3RendererAbstract } from '../gfx3/gfx3_renderer_abstract';

/** Énumère les indices des paramètres uniformes d'un matériau de maillage. */
export enum Gfx3MatParam {
  ID,
  OPACITY,
  // --------------------------------------
  SHADOW_ENABLED,
  // --------------------------------------
  DECAL_ENABLED,
  DECAL_GROUP,
  // --------------------------------------
  LIGHT_ENABLED,
  LIGHT_GROUP,
  LIGHT_GOURAUD_SHADING_ENABLED,
  LIGHT_EMISSIVE_FACTOR,
  LIGHT_EMISSIVE_R,
  LIGHT_EMISSIVE_G,
  LIGHT_EMISSIVE_B,
  LIGHT_AMBIENT_R,
  LIGHT_AMBIENT_G,
  LIGHT_AMBIENT_B,
  LIGHT_DIFFUSE_R,
  LIGHT_DIFFUSE_G,
  LIGHT_DIFFUSE_B,
  LIGHT_SPECULAR_FACTOR,
  LIGHT_SPECULAR_R,
  LIGHT_SPECULAR_G,
  LIGHT_SPECULAR_B,
  // --------------------------------------
  TEXTURE_EXIST,
  TEXTURE_SCROLL_ANGLE,
  TEXTURE_SCROLL_RATE,
  TEXTURE_OFFSET_X,
  TEXTURE_OFFSET_Y,
  TEXTURE_OFFSET_NEXT_X,
  TEXTURE_OFFSET_NEXT_Y,
  TEXTURE_OFFSET_BLENDING,
  TEXTURE_SCALE_X,
  TEXTURE_SCALE_Y,
  TEXTURE_ROTATION_ANGLE,
  TEXTURE_OPACITY,
  TEXTURE_BLEND_COLOR_R,
  TEXTURE_BLEND_COLOR_G,
  TEXTURE_BLEND_COLOR_B,
  TEXTURE_BLEND_COLOR_MODE,
  TEXTURE_BLEND_COLOR_MIX,
  // --------------------------------------
  SECONDARY_TEXTURE_EXIST,
  SECONDARY_TEXTURE_SCROLL_ANGLE,
  SECONDARY_TEXTURE_SCROLL_RATE,
  SECONDARY_TEXTURE_OFFSET_X,
  SECONDARY_TEXTURE_OFFSET_Y,
  SECONDARY_TEXTURE_OFFSET_NEXT_X,
  SECONDARY_TEXTURE_OFFSET_NEXT_Y,
  SECONDARY_TEXTURE_OFFSET_BLENDING,
  SECONDARY_TEXTURE_SCALE_X,
  SECONDARY_TEXTURE_SCALE_Y,
  SECONDARY_TEXTURE_ROTATION_ANGLE,
  SECONDARY_TEXTURE_OPACITY,
  SECONDARY_TEXTURE_BLEND_MODE,
  SECONDARY_TEXTURE_BLEND_COLOR_R,
  SECONDARY_TEXTURE_BLEND_COLOR_G,
  SECONDARY_TEXTURE_BLEND_COLOR_B,
  SECONDARY_TEXTURE_BLEND_COLOR_MODE,
  SECONDARY_TEXTURE_BLEND_COLOR_MIX,
  // --------------------------------------
  ENV_MAP_EXIST,
  ENV_MAP_OPACITY,
  // --------------------------------------
  NORMAL_MAP_EXIST,
  NORMAL_MAP_SCROLL_ANGLE,
  NORMAL_MAP_SCROLL_RATE,
  NORMAL_MAP_OFFSET_X,
  NORMAL_MAP_OFFSET_Y,
  NORMAL_MAP_SCALE_X,
  NORMAL_MAP_SCALE_Y,
  NORMAL_MAP_ROTATION_ANGLE,
  NORMAL_MAP_INTENSITY,
  // --------------------------------------
  DISPLACEMENT_MAP_EXIST,
  DISPLACEMENT_MAP_SCROLL_ANGLE,
  DISPLACEMENT_MAP_SCROLL_RATE,
  DISPLACEMENT_MAP_OFFSET_X,
  DISPLACEMENT_MAP_OFFSET_Y,
  DISPLACEMENT_MAP_SCALE_X,
  DISPLACEMENT_MAP_SCALE_Y,
  DISPLACEMENT_MAP_ROTATION_ANGLE,
  DISPLACEMENT_MAP_FACTOR,
  DISPLACE_TEXTURE_ENABLED,
  DISPLACE_SECONDARY_TEXTURE_ENABLED,
  DISPLACE_NORMAL_MAP_ENABLED,
  DISPLACE_DISSOLVE_MAP_ENABLED,
  DISPLACE_ENV_MAP_ENABLED,
  // --------------------------------------
  DISSOLVE_MAP_EXIST,
  DISSOLVE_MAP_SCROLL_ANGLE,
  DISSOLVE_MAP_SCROLL_RATE,
  DISSOLVE_MAP_OFFSET_X,
  DISSOLVE_MAP_OFFSET_Y,
  DISSOLVE_MAP_SCALE_X,
  DISSOLVE_MAP_SCALE_Y,
  DISSOLVE_MAP_ROTATION_ANGLE,
  DISSOLVE_GLOW_R,
  DISSOLVE_GLOW_G,
  DISSOLVE_GLOW_B,
  DISSOLVE_GLOW_RANGE,
  DISSOLVE_GLOW_FALLOFF,
  DISSOLVE_AMOUNT,
  // --------------------------------------
  TOON_MAP_EXIST,
  TOON_MAP_OPACITY,
  TOON_LIGHT_DIR_X,
  TOON_LIGHT_DIR_Y,
  TOON_LIGHT_DIR_Z,
  // --------------------------------------
  EMISSIVE_MAP_EXIST,
  // --------------------------------------
  DIFFUSE_MAP_EXIST,
  // --------------------------------------
  SPECULAR_MAP_EXIST,
  // --------------------------------------
  THUNE_MAP_EXIST,
  THUNE_MAP_SHININESS_ENABLED,
  THUNE_MAP_ARCADE_ENABLED,
  THUNE_MAP_REFLECTIVE_ENABLED,
  // --------------------------------------
  ALPHA_BLEND_ENABLED,
  ALPHA_BLEND_FACING,
  ALPHA_BLEND_DISTANCE,
  // --------------------------------------
  JITTER_VERTEX_ENABLED,
  JITTER_VERTEX_LEVEL,
  // --------------------------------------
  ARCADE_ENABLED,
  ARCADE_START_COLOR_R,
  ARCADE_START_COLOR_G,
  ARCADE_START_COLOR_B,
  ARCADE_END_COLOR_R,
  ARCADE_END_COLOR_G,
  ARCADE_END_COLOR_B,
  ARCADE_SHARP_COLOR_R,
  ARCADE_SHARP_COLOR_G,
  ARCADE_SHARP_COLOR_B,
  // --------------------------------------
  JAM_FRAME_INDEX_A,
  JAM_FRAME_INDEX_B,
  JAM_IS_ANIMATED,
  JAM_INTERPOLATED,
  JAM_LAST_FRAME_TIME,
  JAM_FRAME_DURATION,
  JAM_NUM_VERTICES,
  // --------------------------------------
  S0_TEXTURE_EXIST,
  S1_TEXTURE_EXIST,
  // --------------------------------------
  COUNT
};

/** Énumère les indices des informations de scène transmises aux shaders de maillage. */
export enum Gfx3SceneInfos {
  CAMERA_POS_X,
  CAMERA_POS_Y,
  CAMERA_POS_Z,
  AMBIENT_R,
  AMBIENT_G,
  AMBIENT_B,
  POINT_LIGHT_COUNT,
  SPOT_LIGHT_COUNT,
  DECAL_COUNT,
  DELTA_TIME,
  TIME,
  COUNT
};

/** Associe les emplacements de paramètres de matériau personnalisés à leurs noms WGSL. */
export const MESH_MAT_CUSTOM_PARAMS = {
  MAT_S00: 'S00',
  MAT_S01: 'S01',
  MAT_S02: 'S02',
  MAT_S03: 'S03',
  MAT_S04: 'S04',
  MAT_S05: 'S05',
  MAT_S06: 'S06',
  MAT_S07: 'S07',
  MAT_S08: 'S08',
  MAT_S09: 'S09',
  MAT_S10: 'S10',
  MAT_S11: 'S11',
  MAT_S12: 'S12',
  MAT_S13: 'S13',
  MAT_S14: 'S14',
  MAT_S15: 'S15',
};

/** Associe les emplacements de paramètres de scène personnalisés à leurs noms WGSL. */
export const MESH_SCENE_CUSTOM_PARAMS = {
  SCENE_S00: 'S00',
  SCENE_S01: 'S01',
  SCENE_S02: 'S02',
  SCENE_S03: 'S03',
  SCENE_S04: 'S04',
  SCENE_S05: 'S05',
  SCENE_S06: 'S06',
  SCENE_S07: 'S07',
  SCENE_S08: 'S08',
  SCENE_S09: 'S09',
  SCENE_S10: 'S10',
  SCENE_S11: 'S11',
  SCENE_S12: 'S12',
  SCENE_S13: 'S13',
  SCENE_S14: 'S14',
  SCENE_S15: 'S15'
};

/** Contient les fragments WGSL personnalisés injectés dans les shaders de maillage. */
export const MESH_SHADER_INSERTS = {
  VERT_INSERT: '',
  FRAG_INSERT: ''
};

/** Nombre de composantes flottantes stockées pour chaque sommet de maillage. */
export const MESH_SHADER_VERTEX_ATTR_COUNT = 17;
/** Nombre maximal de lumières ponctuelles par trame. */
export const MESH_MAX_POINT_LIGHTS = 64;
/** Nombre maximal de lumières coniques par trame. */
export const MESH_MAX_SPOT_LIGHTS = 16;
/** Nombre maximal de décalques par trame. */
export const MESH_MAX_DECALS = 64;
/** Nombre de composantes flottantes réservées à chaque instance de maillage. */
export const MESH_STORAGE_SIZE = 45;

/** Décrit le pipeline WebGPU utilisé pour le rendu des maillages. */
export const MESH_PIPELINE_DESC: any = {
  label: 'Mesh pipeline',
  layout: 'auto',
  vertex: {
    entryPoint: 'main',
    buffers: [{
      arrayStride: MESH_SHADER_VERTEX_ATTR_COUNT * 4,
      attributes: [{
        shaderLocation: 0, /*position*/
        offset: 0,
        format: 'float32x3'
      }, {
        shaderLocation: 1, /*uv*/
        offset: 3 * 4,
        format: 'float32x2'
      }, {
        shaderLocation: 2, /*color*/
        offset: 5 * 4,
        format: 'float32x3'
      }, {
        shaderLocation: 3, /*normal*/
        offset: 8 * 4,
        format: 'float32x3'
      }, {
        shaderLocation: 4, /*tangent*/
        offset: 11 * 4,
        format: 'float32x3'
      }, {
        shaderLocation: 5, /*binormal*/
        offset: 14 * 4,
        format: 'float32x3'
      }]
    }]
  },
  fragment: {
    entryPoint: 'main',
    targets: [{
      format: navigator.gpu.getPreferredCanvasFormat(),
      blend: {
        color: {
          srcFactor: 'src-alpha',
          dstFactor: 'one-minus-src-alpha',
          operation: 'add'
        },
        alpha: {
          srcFactor: 'one',
          dstFactor: 'one-minus-src-alpha',
          operation: 'add'
        }
      }
    },
    { format: 'rgba16float' }, // normals
    { format: 'rgba16float',   // tags
      blend: {
        color: {
          srcFactor: 'src-alpha',
          dstFactor: 'one-minus-src-alpha',
          operation: 'add'
        },
        alpha: {
          srcFactor: 'one',
          dstFactor: 'one-minus-src-alpha',
          operation: 'add'
        }
      }
    },
    { format: 'rgba16float', // ch1
      blend: {
        color: {
          srcFactor: 'src-alpha',
          dstFactor: 'one-minus-src-alpha',
          operation: 'add'
        },
        alpha: {
          srcFactor: 'one',
          dstFactor: 'one-minus-src-alpha',
          operation: 'add'
        }
      }
    }]
  },
  primitive: {
    topology: 'triangle-list',
    cullMode: 'back',
    frontFace: 'ccw'
  },
  depthStencil: {
    depthWriteEnabled: true,
    depthCompare: 'less',
    format: 'depth24plus'
  }
};

const STRUCT_MAT_PARAMS = (data: any): string => `
struct MaterialParams {
  ${Gfx3RendererAbstract.generateWGSLStructFromEnum(Gfx3MatParam)}
  ${data.MAT_S00}: f32,
  ${data.MAT_S01}: f32,
  ${data.MAT_S02}: f32,
  ${data.MAT_S03}: f32,
  ${data.MAT_S04}: f32,
  ${data.MAT_S05}: f32,
  ${data.MAT_S06}: f32,
  ${data.MAT_S07}: f32,
  ${data.MAT_S08}: f32,
  ${data.MAT_S09}: f32,
  ${data.MAT_S10}: f32,
  ${data.MAT_S11}: f32,
  ${data.MAT_S12}: f32,
  ${data.MAT_S13}: f32,
  ${data.MAT_S14}: f32,
  ${data.MAT_S15}: f32
};`;

const STRUCT_SCENE_INFOS = (data: any): string => `
struct SceneInfos {
  ${Gfx3RendererAbstract.generateWGSLStructFromEnum(Gfx3SceneInfos)}
  ${data.SCENE_S00}: f32,
  ${data.SCENE_S01}: f32,
  ${data.SCENE_S02}: f32,
  ${data.SCENE_S03}: f32,
  ${data.SCENE_S04}: f32,
  ${data.SCENE_S05}: f32,
  ${data.SCENE_S06}: f32,
  ${data.SCENE_S07}: f32,
  ${data.SCENE_S08}: f32,
  ${data.SCENE_S09}: f32,
  ${data.SCENE_S10}: f32,
  ${data.SCENE_S11}: f32,
  ${data.SCENE_S12}: f32,
  ${data.SCENE_S13}: f32,
  ${data.SCENE_S14}: f32,
  ${data.SCENE_S15}: f32
};`;

const STRUCT_JAM_FRAME_VERTEX = `
struct JamFrameVertex {
  POSITION: vec3<f32>,
  UV: vec2<f32>,
  COLOR: vec3<f32>,
  NORMAL: vec3<f32>,
  TANGENT: vec3<f32>,
  BITANGENT: vec3<f32>
};`;

const STRUCT_MESH = `
struct Mesh {
  MVPC_00: f32, MVPC_01: f32, MVPC_02: f32, MVPC_03: f32,
  MVPC_10: f32, MVPC_11: f32, MVPC_12: f32, MVPC_13: f32,
  MVPC_20: f32, MVPC_21: f32, MVPC_22: f32, MVPC_23: f32,
  MVPC_30: f32, MVPC_31: f32, MVPC_32: f32, MVPC_33: f32,

  M_00: f32, M_01: f32, M_02: f32, M_03: f32,
  M_10: f32, M_11: f32, M_12: f32, M_13: f32,
  M_20: f32, M_21: f32, M_22: f32, M_23: f32,
  M_30: f32, M_31: f32, M_32: f32, M_33: f32,

  NORM_00: f32, NORM_01: f32, NORM_02: f32,
  NORM_10: f32, NORM_11: f32, NORM_12: f32,
  NORM_20: f32, NORM_21: f32, NORM_22: f32,

  TAG_R: f32,
  TAG_G: f32,
  TAG_B: f32,
  TAG_A: f32
}`;

const STRUCT_POINT_LIGHT = `
struct PointLight {
  POSITION: vec3<f32>,
  DIFFUSE: vec3<f32>,
  SPECULAR: vec3<f32>,
  ATTEN: vec3<f32>,
  INTENSITY: f32,
  GROUP: f32
}`;

const STRUCT_SPOT_LIGHT = `
struct SpotLight {
  POSITION: vec3<f32>,
  DIRECTION: vec3<f32>,
  DIFFUSE: vec3<f32>,
  SPECULAR: vec3<f32>,
  ATTEN: vec3<f32>,
  INTENSITY: f32,
  GROUP: f32,
  CUTOFF: f32
}`;

const STRUCT_DIR_LIGHT = `
struct DirLight {
  DIR: vec3<f32>,
  ENABLED: f32,
  DIFFUSE: vec3<f32>,
  SPECULAR: vec3<f32>,
  INTENSITY: f32,
  GROUP: f32
}`;

const STRUCT_FOG = `
struct Fog {
  ENABLED: f32,
  NEAR: f32,
  FAR: f32,
  COLOR: vec3<f32>,
  FROM: vec3<f32>
}`;

const STRUCT_DECAL = `
struct Decal {
  VP_MATRIX: mat4x4<f32>,
  TEXTURE_LEFT: f32,
  TEXTURE_TOP: f32,
  TEXTURE_WIDTH: f32,
  TEXTURE_HEIGHT: f32,
  ASPECT_RATIO: vec2<f32>,
  OPACITY: f32,
  GROUP: f32
}`;

/**
 * Génère le shader de sommets WGSL des maillages.
 *
 * @param data - Noms de paramètres personnalisés et fragment de code à injecter.
 * @returns Le code source WGSL du shader de sommets.
 */
export const MESH_VERTEX_SHADER = (data: any): string => /* wgsl */`
struct VertexOutput {
  @builtin(position) Position: vec4<f32>,
  @location(0) FragPos: vec3<f32>,
  @location(1) FragUV: vec2<f32>,
  @location(2) FragColor: vec3<f32>,
  @location(3) FragNormal: vec3<f32>,
  @location(4) FragTangent: vec3<f32>,
  @location(5) FragBinormal: vec3<f32>,
  @location(6) FragShadowPos: vec3<f32>,
  @location(7) FragGouraudColor: vec3<f32>,
  @location(8) @interpolate(flat) FragTag: vec4<f32>,
}

${STRUCT_MAT_PARAMS(data)}
${STRUCT_SCENE_INFOS(data)}
${STRUCT_JAM_FRAME_VERTEX}
${STRUCT_POINT_LIGHT}
${STRUCT_DIR_LIGHT}
${STRUCT_MESH}

@group(0) @binding(0) var<uniform> SCENE: SceneInfos;
@group(0) @binding(1) var<uniform> LVP_MATRIX: mat4x4<f32>;
@group(0) @binding(2) var<uniform> DIR_LIGHT: DirLight;
@group(0) @binding(3) var<uniform> POINT_LIGHTS: array<PointLight, ${MESH_MAX_POINT_LIGHTS}>;
// --------------------------------------------------------------------------------------------
@group(1) @binding(0) var<storage, read> MESHES: array<Mesh>;
// --------------------------------------------------------------------------------------------
@group(2) @binding(0) var<uniform> MAT: MaterialParams;
// --------------------------------------------------------------------------------------------
@group(3) @binding(26) var<storage, read> MAT_JAM_FRAMES: array<f32>;

@vertex
fn main(
  @builtin(instance_index) instanceIdx: u32,
  @builtin(vertex_index) vertexIndex: u32,
  @location(0) Position: vec4<f32>,
  @location(1) TexUV: vec2<f32>,
  @location(2) Color: vec3<f32>,
  @location(3) Normal: vec3<f32>,
  @location(4) Tangent: vec3<f32>,
  @location(5) Binormal: vec3<f32>
) -> VertexOutput {
  var texUV = TexUV;
  var position = Position;
  var color = Color;
  var normal = Normal;
  var tangent = Tangent;
  var binormal = Binormal;
  var mesh = MESHES[instanceIdx];

  if (MAT.JAM_IS_ANIMATED == 1.0)
  {
    var idxA = u32(MAT.JAM_FRAME_INDEX_A) * u32(MAT.JAM_NUM_VERTICES) * ${MESH_SHADER_VERTEX_ATTR_COUNT};
    var idxB = u32(MAT.JAM_FRAME_INDEX_B) * u32(MAT.JAM_NUM_VERTICES) * ${MESH_SHADER_VERTEX_ATTR_COUNT};
    var offsetA = (idxA + vertexIndex * ${MESH_SHADER_VERTEX_ATTR_COUNT});
    var offsetB = (idxB + vertexIndex * ${MESH_SHADER_VERTEX_ATTR_COUNT});

    var vax = MAT_JAM_FRAMES[offsetA + 0];
    var vay = MAT_JAM_FRAMES[offsetA + 1];
    var vaz = MAT_JAM_FRAMES[offsetA + 2];
    var vbx = MAT_JAM_FRAMES[offsetB + 0];
    var vby = MAT_JAM_FRAMES[offsetB + 1];
    var vbz = MAT_JAM_FRAMES[offsetB + 2];

    var car = MAT_JAM_FRAMES[offsetA + 5];
    var cag = MAT_JAM_FRAMES[offsetA + 6];
    var cab = MAT_JAM_FRAMES[offsetA + 7];
    var cbr = MAT_JAM_FRAMES[offsetB + 5];
    var cbg = MAT_JAM_FRAMES[offsetB + 6];
    var cbb = MAT_JAM_FRAMES[offsetB + 7];

    var nax = MAT_JAM_FRAMES[offsetA + 8];
    var nay = MAT_JAM_FRAMES[offsetA + 9];
    var naz = MAT_JAM_FRAMES[offsetA + 10];
    var nbx = MAT_JAM_FRAMES[offsetB + 8];
    var nby = MAT_JAM_FRAMES[offsetB + 9];
    var nbz = MAT_JAM_FRAMES[offsetB + 10];

    var tax = MAT_JAM_FRAMES[offsetA + 11];
    var tay = MAT_JAM_FRAMES[offsetA + 12];
    var taz = MAT_JAM_FRAMES[offsetA + 13];
    var tbx = MAT_JAM_FRAMES[offsetB + 11];
    var tby = MAT_JAM_FRAMES[offsetB + 12];
    var tbz = MAT_JAM_FRAMES[offsetB + 13];

    var bax = MAT_JAM_FRAMES[offsetA + 14];
    var bay = MAT_JAM_FRAMES[offsetA + 15];
    var baz = MAT_JAM_FRAMES[offsetA + 16];
    var bbx = MAT_JAM_FRAMES[offsetB + 14];
    var bby = MAT_JAM_FRAMES[offsetB + 15];
    var bbz = MAT_JAM_FRAMES[offsetB + 16];

    var interpolationFactor = min((SCENE.TIME - MAT.JAM_LAST_FRAME_TIME) / MAT.JAM_FRAME_DURATION, 1.0);
    interpolationFactor *= MAT.JAM_INTERPOLATED;

    position.x = mix(vax, vbx, interpolationFactor);
    position.y = mix(vay, vby, interpolationFactor);
    position.z = mix(vaz, vbz, interpolationFactor);

    color.r = mix(car, cbr, interpolationFactor);
    color.g = mix(cag, cbg, interpolationFactor);
    color.b = mix(cab, cbb, interpolationFactor);

    normal.x = mix(nax, nbx, interpolationFactor);
    normal.y = mix(nay, nby, interpolationFactor);
    normal.z = mix(naz, nbz, interpolationFactor);

    tangent.x = mix(tax, tbx, interpolationFactor);
    tangent.y = mix(tay, tby, interpolationFactor);
    tangent.z = mix(taz, tbz, interpolationFactor);

    binormal.x = mix(bax, bbx, interpolationFactor);
    binormal.y = mix(bay, bby, interpolationFactor);
    binormal.z = mix(baz, bbz, interpolationFactor);
  }

  var mMatrix = mat4x4<f32>(
    mesh.M_00, mesh.M_01, mesh.M_02, mesh.M_03,
    mesh.M_10, mesh.M_11, mesh.M_12, mesh.M_13,
    mesh.M_20, mesh.M_21, mesh.M_22, mesh.M_23,
    mesh.M_30, mesh.M_31, mesh.M_32, mesh.M_33
  );

  var mvpcMatrix = mat4x4<f32>(
    mesh.MVPC_00, mesh.MVPC_01, mesh.MVPC_02, mesh.MVPC_03,
    mesh.MVPC_10, mesh.MVPC_11, mesh.MVPC_12, mesh.MVPC_13,
    mesh.MVPC_20, mesh.MVPC_21, mesh.MVPC_22, mesh.MVPC_23,
    mesh.MVPC_30, mesh.MVPC_31, mesh.MVPC_32, mesh.MVPC_33
  );

  var normMatrix = mat3x3<f32>(
    mesh.NORM_00, mesh.NORM_01, mesh.NORM_02,
    mesh.NORM_10, mesh.NORM_11, mesh.NORM_12,
    mesh.NORM_20, mesh.NORM_21, mesh.NORM_22,
  );

  var posFromLight = LVP_MATRIX * mMatrix * position;
  var gouraudColor = vec3<f32>(SCENE.AMBIENT_R, SCENE.AMBIENT_G, SCENE.AMBIENT_B);
  var worldPos = vec4(mMatrix * position).xyz;

  if (MAT.LIGHT_GOURAUD_SHADING_ENABLED == 1.0)
  {
    gouraudColor += CalcGouraudShading(worldPos, normal, normMatrix);
  }

  ${data.VERT_INSERT}

  var output: VertexOutput;
  output.Position = mvpcMatrix * position;
  output.FragPos = worldPos.xyz;
  output.FragUV = texUV;
  output.FragColor = color;
  output.FragNormal = normMatrix * normal;
  output.FragTangent = normMatrix * tangent;
  output.FragBinormal = normMatrix * binormal;
  output.FragShadowPos = vec3(posFromLight.xy * vec2(0.5, -0.5) + vec2(0.5), posFromLight.z); // Convert XY to (0, 1) and Y is flipped because texture coords are Y-down.
  output.FragGouraudColor = gouraudColor;
  output.FragTag = vec4(mesh.TAG_R, mesh.TAG_G, mesh.TAG_B, mesh.TAG_A);

  if (MAT.JITTER_VERTEX_ENABLED == 1.0)
  {
    var jittering = CalcJitterVertex(output.Position);
    output.Position.x = jittering.x;
    output.Position.y = jittering.y;
  }

  return output;
}

// *****************************************************************************************************************
// CALC JITTER VERTEX
// *****************************************************************************************************************
fn CalcJitterVertex(position: vec4<f32>) -> vec2<f32>
{
  var x = position.x / position.w;
  var y = position.y / position.w;
  x = floor(x * MAT.JITTER_VERTEX_LEVEL) / MAT.JITTER_VERTEX_LEVEL;
  y = floor(y * MAT.JITTER_VERTEX_LEVEL) / MAT.JITTER_VERTEX_LEVEL;
  return vec2<f32>(x * position.w, y * position.w);
}

// *****************************************************************************************************************
// CALC GOURAUD SHADING
// *****************************************************************************************************************
fn CalcGouraudShading(worldPos: vec3<f32>, normal: vec3<f32>, normMatrix: mat3x3<f32>) -> vec3<f32>
{
  var result = vec3<f32>(0.0, 0.0, 0.0);

  if (DIR_LIGHT.ENABLED == 1.0 && (DIR_LIGHT.GROUP == 0.0 || DIR_LIGHT.GROUP == MAT.LIGHT_GROUP)) {
    let n = normalize(normMatrix * normal);
    let l = normalize(-DIR_LIGHT.DIR);
    let diffuseFactor = max(dot(n, l), 0.0);
    result += diffuseFactor * DIR_LIGHT.DIFFUSE * DIR_LIGHT.INTENSITY;
  }

  for (var i: u32 = 0u; i < u32(SCENE.POINT_LIGHT_COUNT); i++)
  {
    if (POINT_LIGHTS[i].GROUP == 0.0 || POINT_LIGHTS[i].GROUP == MAT.LIGHT_GROUP)
    {
      let n = normalize(normMatrix * normal);
      let l = normalize(POINT_LIGHTS[i].POSITION - worldPos.xyz);      
      let diffuseFactor = max(dot(n, l), 0.0);

      let dist = length(POINT_LIGHTS[i].POSITION - worldPos.xyz);
      let atten = 1.0 / (POINT_LIGHTS[i].ATTEN[0] + POINT_LIGHTS[i].ATTEN[1] * dist + POINT_LIGHTS[i].ATTEN[2] * dist * dist);
      result += diffuseFactor * POINT_LIGHTS[i].DIFFUSE * POINT_LIGHTS[i].INTENSITY * atten;
    }
  }

  return result;
}`;

/**
 * Génère le shader de fragments WGSL des maillages.
 *
 * @param data - Noms de paramètres personnalisés et fragment de code à injecter.
 * @returns Le code source WGSL du shader de fragments.
 */
export const MESH_FRAGMENT_SHADER = (data: any): string => /* wgsl */`
struct FragOutput {
  @location(0) Base: vec4f,
  @location(1) Normal: vec4f,
  @location(2) Tag: vec4f,
  @location(3) Ch1: vec4f
}

${STRUCT_MAT_PARAMS(data)}
${STRUCT_SCENE_INFOS(data)}
${STRUCT_POINT_LIGHT}
${STRUCT_SPOT_LIGHT}
${STRUCT_DIR_LIGHT}
${STRUCT_FOG}
${STRUCT_DECAL}

@group(0) @binding(0) var<uniform> SCENE: SceneInfos;
@group(0) @binding(2) var<uniform> DIR_LIGHT: DirLight;
@group(0) @binding(3) var<uniform> POINT_LIGHTS: array<PointLight, ${MESH_MAX_POINT_LIGHTS}>;
@group(0) @binding(4) var<uniform> SPOT_LIGHTS: array<SpotLight, ${MESH_MAX_SPOT_LIGHTS}>;
@group(0) @binding(5) var<uniform> DECALS: array<Decal, ${MESH_MAX_DECALS}>;
@group(0) @binding(6) var<uniform> FOG: Fog;
@group(0) @binding(7) var DECAL_ATLAS_TEXTURE: texture_2d<f32>;
@group(0) @binding(8) var DECAL_ATLAS_SAMPLER: sampler;
@group(0) @binding(9) var SHADOW_MAP_TEXTURE: texture_depth_2d;
@group(0) @binding(10) var SHADOW_MAP_SAMPLER: sampler_comparison;
// --------------------------------------------------------------------------------------------
@group(2) @binding(0) var<uniform> MAT: MaterialParams;
// --------------------------------------------------------------------------------------------
@group(3) @binding(0) var MAT_TEXTURE: texture_2d<f32>;
@group(3) @binding(1) var MAT_TEXTURE_SAMPLER: sampler;
@group(3) @binding(2) var MAT_SECONDARY_TEXTURE: texture_2d<f32>;
@group(3) @binding(3) var MAT_SECONDARY_TEXTURE_SAMPLER: sampler;
@group(3) @binding(4) var MAT_DISPLACEMENT_MAP: texture_2d<f32>;
@group(3) @binding(5) var MAT_DISPLACEMENT_MAP_SAMPLER: sampler;
@group(3) @binding(6) var MAT_DIFFUSE_MAP: texture_2d<f32>;
@group(3) @binding(7) var MAT_DIFFUSE_MAP_SAMPLER: sampler;
@group(3) @binding(8) var MAT_SPECULAR_MAP: texture_2d<f32>;
@group(3) @binding(9) var MAT_SPECULAR_MAP_SAMPLER: sampler;
@group(3) @binding(10) var MAT_EMISSIVE_MAP: texture_2d<f32>;
@group(3) @binding(11) var MAT_EMISSIVE_MAP_SAMPLER: sampler;
@group(3) @binding(12) var MAT_NORMAL_MAP: texture_2d<f32>;
@group(3) @binding(13) var MAT_NORMAL_MAP_SAMPLER: sampler;
@group(3) @binding(14) var MAT_ENV_MAP: texture_cube<f32>;
@group(3) @binding(15) var MAT_ENV_MAP_SAMPLER: sampler;
@group(3) @binding(16) var MAT_TOON_MAP: texture_2d<f32>;
@group(3) @binding(17) var MAT_TOON_MAP_SAMPLER: sampler;
@group(3) @binding(18) var MAT_DISSOLVE_MAP: texture_2d<f32>;
@group(3) @binding(19) var MAT_DISSOLVE_MAP_SAMPLER: sampler;
@group(3) @binding(20) var MAT_THUNE_MAP: texture_2d<f32>;
@group(3) @binding(21) var MAT_THUNE_MAP_SAMPLER: sampler;
@group(3) @binding(22) var MAT_S0_TEXTURE: texture_2d<f32>;
@group(3) @binding(23) var MAT_S0_TEXTURE_SAMPLER: sampler;
@group(3) @binding(24) var MAT_S1_TEXTURE: texture_2d<f32>;
@group(3) @binding(25) var MAT_S1_TEXTURE_SAMPLER: sampler;
@group(3) @binding(26) var<storage, read> MAT_JAM_FRAMES: array<f32>;

@fragment
fn main(
  @builtin(position) Position: vec4<f32>,
  @location(0) FragPos: vec3<f32>,
  @location(1) FragUV: vec2<f32>,
  @location(2) FragColor: vec3<f32>,
  @location(3) FragNormal: vec3<f32>,
  @location(4) FragTangent: vec3<f32>,
  @location(5) FragBinormal: vec3<f32>,
  @location(6) FragShadowPos: vec3<f32>,
  @location(7) FragGouraudColor: vec3<f32>,
  @location(8) @interpolate(flat) FragTag: vec4<f32>
) -> FragOutput {
  var fragPos = FragPos;
  var fragUV = FragUV;
  var fragColor = FragColor;
  var fragNormal = normalize(FragNormal);
  var fragTangent = normalize(FragTangent);
  var fragBinormal = normalize(FragBinormal);
  var fragShadowPos = FragShadowPos;
  var fragGouraudColor = FragGouraudColor;
  var cameraPos = vec3(SCENE.CAMERA_POS_X, SCENE.CAMERA_POS_Y, SCENE.CAMERA_POS_Z);
  var shadow = 1.0;
  var viewDirWorld = normalize(fragPos - cameraPos);

  var flags = u32(FragTag.b);
  var matS0 = textureSample(MAT_S0_TEXTURE, MAT_S0_TEXTURE_SAMPLER, fragUV);
  var matS1 = textureSample(MAT_S1_TEXTURE, MAT_S1_TEXTURE_SAMPLER, fragUV);
  var outputColor = vec4(0.0, 0.0, 0.0, 1.0);

  // ----------------------------------------------------------------------------------------------------------
  // TEXTURES UV
  // ----------------------------------------------------------------------------------------------------------

  var textureUV = CalcTextureUV(
    MAT.TEXTURE_SCROLL_ANGLE,
    MAT.TEXTURE_SCROLL_RATE,
    MAT.TEXTURE_SCALE_X,
    MAT.TEXTURE_SCALE_Y,
    MAT.TEXTURE_OFFSET_X,
    MAT.TEXTURE_OFFSET_Y,
    MAT.TEXTURE_ROTATION_ANGLE,
    fragUV
  );

  var secondaryTextureUV = CalcTextureUV(
    MAT.SECONDARY_TEXTURE_SCROLL_ANGLE,
    MAT.SECONDARY_TEXTURE_SCROLL_RATE,
    MAT.SECONDARY_TEXTURE_SCALE_X,
    MAT.SECONDARY_TEXTURE_SCALE_Y,
    MAT.SECONDARY_TEXTURE_OFFSET_X,
    MAT.SECONDARY_TEXTURE_OFFSET_Y,
    MAT.SECONDARY_TEXTURE_ROTATION_ANGLE,
    fragUV
  );

  var normalMapUV = CalcTextureUV(
    MAT.NORMAL_MAP_SCROLL_ANGLE,
    MAT.NORMAL_MAP_SCROLL_RATE,
    MAT.NORMAL_MAP_SCALE_X,
    MAT.NORMAL_MAP_SCALE_Y,
    MAT.NORMAL_MAP_OFFSET_X,
    MAT.NORMAL_MAP_OFFSET_Y,
    MAT.NORMAL_MAP_ROTATION_ANGLE,
    fragUV
  );

  var displacementMapUV = CalcTextureUV(
    MAT.DISPLACEMENT_MAP_SCROLL_ANGLE,
    MAT.DISPLACEMENT_MAP_SCROLL_RATE,
    MAT.DISPLACEMENT_MAP_SCALE_X,
    MAT.DISPLACEMENT_MAP_SCALE_Y,
    MAT.DISPLACEMENT_MAP_OFFSET_X,
    MAT.DISPLACEMENT_MAP_OFFSET_Y,
    MAT.DISPLACEMENT_MAP_ROTATION_ANGLE,
    fragUV
  );

  var dissolveMapUV = CalcTextureUV(
    MAT.DISSOLVE_MAP_SCROLL_ANGLE,
    MAT.DISSOLVE_MAP_SCROLL_RATE,
    MAT.DISSOLVE_MAP_SCALE_X,
    MAT.DISSOLVE_MAP_SCALE_Y,
    MAT.DISSOLVE_MAP_OFFSET_X,
    MAT.DISSOLVE_MAP_OFFSET_Y,
    MAT.DISSOLVE_MAP_ROTATION_ANGLE,
    fragUV
  );

  if (MAT.DISPLACEMENT_MAP_EXIST == 1.0)
  {
    var displaceUV = CalcDisplacementMap(displacementMapUV);
    textureUV += displaceUV * MAT.DISPLACE_TEXTURE_ENABLED;
    secondaryTextureUV += displaceUV * MAT.DISPLACE_SECONDARY_TEXTURE_ENABLED;
    normalMapUV += displaceUV * MAT.DISPLACE_NORMAL_MAP_ENABLED;
    dissolveMapUV += displaceUV * MAT.DISPLACE_DISSOLVE_MAP_ENABLED;
  }

  // ----------------------------------------------------------------------------------------------------------
  // TEXEL
  // ----------------------------------------------------------------------------------------------------------

  var texel = CalcTexelAlbedo(textureUV, secondaryTextureUV, fragColor, fragUV);
  if (texel.a == 0)
  {
    discard;
  }

  // ----------------------------------------------------------------------------------------------------------
  // DECAL
  // ----------------------------------------------------------------------------------------------------------

  if (MAT.DECAL_ENABLED == 1.0)
  {
    var decalsColor = CalcDecals(fragPos);
    var alpha = min(texel.a + decalsColor.a, 1.0);
    texel = mix(texel, decalsColor, decalsColor.a);
    texel.a = alpha;
  }

  // ----------------------------------------------------------------------------------------------------------
  // NORMAL MAPPING
  // ----------------------------------------------------------------------------------------------------------

  if (MAT.NORMAL_MAP_EXIST == 1.0)
  {
    fragNormal = CalcNormalMap(fragNormal, fragTangent, fragBinormal, normalMapUV);
  }

  // ----------------------------------------------------------------------------------------------------------
  // SHADOW MAPPING
  // ----------------------------------------------------------------------------------------------------------

  if (MAT.SHADOW_ENABLED == 1.0)
  {
    shadow = CalcShadowMap(fragShadowPos, fragNormal);
  }

  // ----------------------------------------------------------------------------------------------------------
  // LIGHTS (TOON, GOURAUD, CLASSIC OR NONE)
  // ----------------------------------------------------------------------------------------------------------

  if (MAT.TOON_MAP_EXIST == 1.0)
  {
    var toonColor = CalcToonMap(fragNormal, fragPos, cameraPos, shadow);
    outputColor = mix(texel, toonColor, MAT.TOON_MAP_OPACITY);
  }
  else if (MAT.LIGHT_GOURAUD_SHADING_ENABLED == 1.0)
  {
    outputColor = texel * vec4(fragGouraudColor, 1.0);
  }
  else if (MAT.LIGHT_ENABLED == 1.0)
  {
    var totalLight = CalcLights(fragNormal, fragPos, cameraPos, textureUV, shadow);
    outputColor = texel * totalLight;
  }
  else
  {
    outputColor = texel;
  }

  // ----------------------------------------------------------------------------------------------------------
  // ENVIRONMENT MAPPING
  // ----------------------------------------------------------------------------------------------------------

  if (MAT.ENV_MAP_EXIST == 1.0)
  {
    var envColor = CalcEnvMap(fragNormal, fragPos, cameraPos, displacementMapUV);
    var reflectivity = MAT.ENV_MAP_OPACITY;

    if (MAT.THUNE_MAP_EXIST == 1.0)
    {
      reflectivity = textureSample(MAT_THUNE_MAP, MAT_THUNE_MAP_SAMPLER, textureUV).b;
    }

    outputColor = mix(outputColor, envColor, reflectivity);
  }

  // ----------------------------------------------------------------------------------------------------------
  // ARCADE SHADING
  // ----------------------------------------------------------------------------------------------------------

  if (MAT.ARCADE_ENABLED == 1.0)
  {
    outputColor = CalcArcadeShading(outputColor, fragNormal, viewDirWorld, textureUV);
  }

  // ----------------------------------------------------------------------------------------------------------
  // DISSOLVE MAPPING
  // ----------------------------------------------------------------------------------------------------------

  if (MAT.DISSOLVE_MAP_EXIST == 1.0)
  {
    var isGlowing = CalcDissolveMap(dissolveMapUV);
    var glowColor = vec4(MAT.DISSOLVE_GLOW_R, MAT.DISSOLVE_GLOW_G, MAT.DISSOLVE_GLOW_B, outputColor.a);
    outputColor = mix(outputColor, glowColor, isGlowing);
  }

  // ----------------------------------------------------------------------------------------------------------
  // FOG
  // ----------------------------------------------------------------------------------------------------------

  if (FOG.ENABLED == 1.0)
  {
    outputColor = CalcFog(outputColor.rgb, texel.a, fragPos);
  }

  // ----------------------------------------------------------------------------------------------------------
  // VOLUMETRIC
  // ----------------------------------------------------------------------------------------------------------

  if (MAT.ALPHA_BLEND_ENABLED == 1.0)
  {
    outputColor.a = CalcVolumetric(outputColor.a, fragNormal, fragPos, cameraPos);
  }

  // ----------------------------------------------------------------------------------------------------------
  // MACRO INSERTION
  // ----------------------------------------------------------------------------------------------------------
  
  ${data.FRAG_INSERT}

  // ----------------------------------------------------------------------------------------------------------
  // OUTPUT
  // ----------------------------------------------------------------------------------------------------------

  var output: FragOutput;
  output.Normal = vec4(normalize(fragNormal), 1.0);
  output.Tag = FragTag;

  if ((flags & 64) == 64)
  {
    output.Base = vec4(0.0, 0.0, 0.0, 0.0);
    output.Ch1 = outputColor;
  }
  else
  {
    output.Base = outputColor;
    output.Ch1 = vec4(0.0, 0.0, 0.0, 0.0);
  }

  return output;
}

// *****************************************************************************************************************
// CALC ARCADE SHADING
// *****************************************************************************************************************
fn CalcArcadeShading(outputColor: vec4<f32>, fragNormal: vec3<f32>, viewDirWorld: vec3<f32>, textureUV: vec2<f32>) -> vec4<f32>
{
  var frontFactor = min(dot(fragNormal, viewDirWorld), 0.0);
  var sharpFactor = max(dot(fragNormal, viewDirWorld), 0.0);

  var applyFactor = textureSample(MAT_THUNE_MAP, MAT_THUNE_MAP_SAMPLER, textureUV).g;

  var startColor = vec3(MAT.ARCADE_START_COLOR_R, MAT.ARCADE_START_COLOR_G, MAT.ARCADE_START_COLOR_B);
  var endColor = vec3(MAT.ARCADE_END_COLOR_R, MAT.ARCADE_END_COLOR_G, MAT.ARCADE_END_COLOR_B);

  var sharpColor = vec3(MAT.ARCADE_SHARP_COLOR_R, MAT.ARCADE_SHARP_COLOR_G, MAT.ARCADE_SHARP_COLOR_B) * sharpFactor;
  var frontColor = mix(startColor, endColor, abs(frontFactor));

  return mix(outputColor, vec4(frontColor + sharpColor, 1.0), applyFactor);
}

// *****************************************************************************************************************
// CALC TEXEL ALBEDO
// *****************************************************************************************************************
fn CalcTexelAlbedo(textureUV: vec2<f32>, secondaryTextureUV: vec2<f32>, fragColor: vec3<f32>, fragUV: vec2<f32>) -> vec4<f32>
{
  var texel = vec4(1.0, 1.0, 1.0, 1.0);

  if (MAT.TEXTURE_EXIST == 1.0)
  {
    var textureColor = textureSample(MAT_TEXTURE, MAT_TEXTURE_SAMPLER, textureUV);

    if (MAT.TEXTURE_OFFSET_BLENDING > 0)
    {
      var uv = CalcTextureUV(
        MAT.TEXTURE_SCROLL_ANGLE,
        MAT.TEXTURE_SCROLL_RATE,
        MAT.TEXTURE_SCALE_X,
        MAT.TEXTURE_SCALE_Y,
        MAT.TEXTURE_OFFSET_NEXT_X,
        MAT.TEXTURE_OFFSET_NEXT_Y,
        MAT.TEXTURE_ROTATION_ANGLE,
        fragUV
      );

      var nextColor = textureSample(MAT_TEXTURE, MAT_TEXTURE_SAMPLER, uv);
      textureColor = mix(textureColor, nextColor, MAT.TEXTURE_OFFSET_BLENDING);
    }

    var textureColorBlend = vec3(MAT.TEXTURE_BLEND_COLOR_R, MAT.TEXTURE_BLEND_COLOR_G, MAT.TEXTURE_BLEND_COLOR_B);
    
    var textureFinal = UtilsColorBlending(textureColor, MAT.TEXTURE_BLEND_COLOR_MODE, textureColorBlend, MAT.TEXTURE_BLEND_COLOR_MIX);
    textureFinal.a *= MAT.TEXTURE_OPACITY;
    texel = textureFinal;
  }

  if (MAT.SECONDARY_TEXTURE_EXIST == 1.0)
  {
    var secondaryTextureColor = textureSample(MAT_SECONDARY_TEXTURE, MAT_SECONDARY_TEXTURE_SAMPLER, secondaryTextureUV);

    if (MAT.SECONDARY_TEXTURE_OFFSET_BLENDING > 0)
    {
      var uv = CalcTextureUV(
        MAT.SECONDARY_TEXTURE_SCROLL_ANGLE,
        MAT.SECONDARY_TEXTURE_SCROLL_RATE,
        MAT.SECONDARY_TEXTURE_SCALE_X,
        MAT.SECONDARY_TEXTURE_SCALE_Y,
        MAT.SECONDARY_TEXTURE_OFFSET_NEXT_X,
        MAT.SECONDARY_TEXTURE_OFFSET_NEXT_Y,
        MAT.SECONDARY_TEXTURE_ROTATION_ANGLE,
        fragUV
      );

      var nextColor = textureSample(MAT_SECONDARY_TEXTURE, MAT_SECONDARY_TEXTURE_SAMPLER, uv);
      secondaryTextureColor = mix(secondaryTextureColor, nextColor, MAT.SECONDARY_TEXTURE_OFFSET_BLENDING);
    }

    var secondaryTextureColorBlend = vec3(MAT.SECONDARY_TEXTURE_BLEND_COLOR_R, MAT.SECONDARY_TEXTURE_BLEND_COLOR_G, MAT.SECONDARY_TEXTURE_BLEND_COLOR_B);
    
    var textureFinal = UtilsColorBlending(secondaryTextureColor, MAT.SECONDARY_TEXTURE_BLEND_COLOR_MODE, secondaryTextureColorBlend, MAT.SECONDARY_TEXTURE_BLEND_COLOR_MIX);
    textureFinal.a *= MAT.SECONDARY_TEXTURE_OPACITY;

    if (MAT.SECONDARY_TEXTURE_BLEND_MODE == 0.0)
    {
      texel *= textureFinal;
    }
    else if (MAT.SECONDARY_TEXTURE_BLEND_MODE == 1.0)
    {
      texel += textureFinal;
    }
    else if (MAT.SECONDARY_TEXTURE_BLEND_MODE == 2.0)
    {
      texel *= textureFinal;
    }
    else if (MAT.SECONDARY_TEXTURE_BLEND_MODE == 3.0)
    {
      texel = mix(texel, textureFinal, textureFinal.a);
    }
  }

  texel *= vec4(fragColor, MAT.OPACITY);
  return texel;
}

// *****************************************************************************************************************
// CALC TEXTURE UV
// *****************************************************************************************************************
fn CalcTextureUV(scrollAngle: f32, scrollRate: f32, scaleX: f32, scaleY: f32, offsetX: f32, offsetY: f32, rotation: f32, fragUV: vec2<f32>) -> vec2<f32>
{
  var c = cos(rotation);
  var s = sin(rotation);
  var rotatedUV = vec2(
    c * (fragUV.x - 0.5) + s * (fragUV.y - 0.5) + 0.5,
    c * (fragUV.y - 0.5) - s * (fragUV.x - 0.5) + 0.5
  );

  var scrollX = cos(scrollAngle) * scrollRate * (SCENE.TIME * 0.000001);
  var scrollY = sin(scrollAngle) * scrollRate * (SCENE.TIME * 0.000001);
  return vec2(scrollX + offsetX + (rotatedUV.x * scaleX), scrollY + offsetY + (rotatedUV.y * scaleY));
}

// *****************************************************************************************************************
// CALC FOG
// *****************************************************************************************************************
fn CalcFog(inputColor: vec3<f32>, inputAlpha: f32, fragPos: vec3<f32>) -> vec4<f32>
{
  var fogColor = FOG.COLOR;
  var fogStart = FOG.NEAR;
  var fogEnd = FOG.FAR;
  var fogDist = length(FOG.FROM - fragPos);
  var fogFactor = clamp((fogEnd - fogDist) / (fogEnd - fogStart), 0.0, 1.0);
  var outputColor = (fogColor * (1.0 - fogFactor)) + (inputColor * fogFactor);
  var outputAlpha = mix(inputAlpha, 1.0, fogFactor);
  return vec4<f32>(outputColor, outputAlpha);
}

// *****************************************************************************************************************
// CALC DECALS
// *****************************************************************************************************************
fn CalcDecals(fragPos: vec3<f32>) -> vec4<f32>
{
  var decalsColor = vec4(0.0, 0.0, 0.0, 0.0);
  for (var i: u32 = 0; i < u32(SCENE.DECAL_COUNT); i++)
  {
    if (MAT.DECAL_GROUP == DECALS[i].GROUP)
    {
      decalsColor += CalcDecal(DECALS[i], fragPos);
    }
  }

  return decalsColor;
}

// *****************************************************************************************************************
// CALC DECAL
// *****************************************************************************************************************
fn CalcDecal(decal: Decal, fragPos: vec3<f32>) -> vec4<f32>
{
  var ctrlColor = vec4(1.0, 1.0, 1.0, 1.0);
  var clipPos = decal.VP_MATRIX * vec4<f32>(fragPos, 1.0);
  if (clipPos.z < -1.0 || clipPos.z > 1.0)
  {
    ctrlColor = vec4(0.0, 0.0, 0.0, 0.0);
  }

  var ndcPos = vec3<f32>(clipPos.xyz / clipPos.w).xy * decal.ASPECT_RATIO;
  if (ndcPos.x < -1.0 || ndcPos.x > 1.0 || ndcPos.y < -1.0 || ndcPos.y > 1.0)
  {
    ctrlColor = vec4(0.0, 0.0, 0.0, 0.0);
  }

  var uvx = ndcPos.x * 0.5 + 0.5;
  uvx = (uvx * decal.TEXTURE_WIDTH) + decal.TEXTURE_LEFT;

  var uvy = 1.0 - (ndcPos.y * 0.5 + 0.5);
  uvy = (uvy * decal.TEXTURE_HEIGHT) + decal.TEXTURE_TOP;

  if (uvx < -1.0 || uvx > 1.0 || uvy < -1.0 || uvy > 1.0)
  {
    ctrlColor = vec4(0.0, 0.0, 0.0, 0.0);
  }

  var texColor = textureSample(DECAL_ATLAS_TEXTURE, DECAL_ATLAS_SAMPLER, vec2<f32>(uvx, uvy));
  texColor.a = max(texColor.a - (1.0 - decal.OPACITY), 0.0);
  return texColor * ctrlColor;

  // return vec4(1.0, 0.0, 0.0, 1.0);
}

// *****************************************************************************************************************
// CALC NORMAL MAP
// *****************************************************************************************************************
fn CalcNormalMap(normal: vec3<f32>, fragTangent: vec3<f32>, fragBinormal: vec3<f32>, textureUV: vec2<f32>) -> vec3<f32>
{
  var normalPixel = textureSample(MAT_NORMAL_MAP, MAT_NORMAL_MAP_SAMPLER, textureUV);
  var normalMapVect = normalPixel.xyz * 2.0 - 1.0;
  let finalNormalVect = vec3(
    normalMapVect.x * MAT.NORMAL_MAP_INTENSITY,
    normalMapVect.y * MAT.NORMAL_MAP_INTENSITY,
    normalMapVect.z
  );

  return normalize(fragTangent * finalNormalVect.x + fragBinormal * finalNormalVect.y + normal * finalNormalVect.z);
}

// *****************************************************************************************************************
// CALC ENV MAP
// *****************************************************************************************************************
fn CalcEnvMap(normal: vec3<f32>, fragPos: vec3<f32>, cameraPos: vec3<f32>, displacementMapUV: vec2<f32>) -> vec4<f32>
{
  var viewDir = normalize(fragPos - cameraPos);
  var rvec = normalize(reflect(viewDir, normal));

  if (MAT.DISPLACE_ENV_MAP_ENABLED == 1.0)
  {
    var displaceUV = CalcDisplacementMap(displacementMapUV);
    rvec.x += displaceUV.x;
    rvec.y += displaceUV.y;
  }

  return textureSample(MAT_ENV_MAP, MAT_ENV_MAP_SAMPLER, vec3<f32>(rvec.x, rvec.y, rvec.z));
}

// *****************************************************************************************************************
// CALC DISPLACEMENT MAP
// *****************************************************************************************************************
fn CalcDisplacementMap(textureUV: vec2<f32>) -> vec2<f32>
{
  var offset = vec2(0.0, 0.0);
  var greyScale = textureSample(MAT_DISPLACEMENT_MAP, MAT_DISPLACEMENT_MAP_SAMPLER, textureUV).r;
  offset.x = clamp(MAT.DISPLACEMENT_MAP_FACTOR * ((greyScale * 2) - 1), 0.0, 1.0);
  offset.y = clamp(MAT.DISPLACEMENT_MAP_FACTOR * ((greyScale * 2) - 1), 0.0, 1.0);
  return offset;
}

// *****************************************************************************************************************
// CALC LIGHTS
// *****************************************************************************************************************
fn CalcLights(normal: vec3<f32>, fragPos: vec3<f32>, cameraPos: vec3<f32>, textureUV: vec2<f32>, shadow: f32) -> vec4<f32>
{
  var totalLight = vec4(0.0, 0.0, 0.0, 0.0);
  var matEmissive = vec3(MAT.LIGHT_EMISSIVE_R, MAT.LIGHT_EMISSIVE_G, MAT.LIGHT_EMISSIVE_B) * MAT.LIGHT_EMISSIVE_FACTOR;

  if (DIR_LIGHT.ENABLED == 1.0 && (DIR_LIGHT.GROUP == 0.0 || DIR_LIGHT.GROUP == MAT.LIGHT_GROUP))
  {
    totalLight += CalcDirLight(normal, fragPos, cameraPos, textureUV, shadow);
  }

  for (var i: u32 = 0; i < u32(SCENE.POINT_LIGHT_COUNT); i++)
  {
    if (POINT_LIGHTS[i].GROUP == 0.0 || POINT_LIGHTS[i].GROUP == MAT.LIGHT_GROUP) {
      totalLight += CalcPointLight(POINT_LIGHTS[i], normal, fragPos, cameraPos, textureUV, shadow);
    }
  }

  for (var i: u32 = 0; i < u32(SCENE.SPOT_LIGHT_COUNT); i++)
  {
    if (SPOT_LIGHTS[i].GROUP == 0.0 || SPOT_LIGHTS[i].GROUP == MAT.LIGHT_GROUP) {
      totalLight += CalcSpotLight(SPOT_LIGHTS[i], normal, fragPos, cameraPos, textureUV, shadow);
    }
  }

  if (MAT.EMISSIVE_MAP_EXIST == 1.0)
  {
    matEmissive = textureSample(MAT_EMISSIVE_MAP, MAT_EMISSIVE_MAP_SAMPLER, textureUV).rgb * MAT.LIGHT_EMISSIVE_FACTOR;
  }

  if (length(matEmissive) > 0)
  {
    return vec4(matEmissive, 1.0);
  }

  var globalAmbient = vec3(SCENE.AMBIENT_R, SCENE.AMBIENT_G, SCENE.AMBIENT_B);
  var matAmbient = vec3(MAT.LIGHT_AMBIENT_R, MAT.LIGHT_AMBIENT_G, MAT.LIGHT_AMBIENT_B);

  var isMaterialAmbientEmpty = all(matAmbient <= vec3f(0.0001));
  var finalAmbient = select(matAmbient, globalAmbient, isMaterialAmbientEmpty);
  return vec4(totalLight.rgb + finalAmbient, 1.0);
}

// *****************************************************************************************************************
// CALC LIGHT INTERNAL
// *****************************************************************************************************************
fn CalcLightInternal(lightDir: vec3<f32>, lightDiffuse: vec3<f32>, lightSpecular: vec3<f32>, lightIntensity: f32, normal: vec3<f32>, fragPos: vec3<f32>, cameraPos: vec3<f32>, textureUV: vec2<f32>, shadow: f32) -> vec4<f32>
{
  var diffuseColor = vec3(0.0, 0.0, 0.0);
  var specularColor = vec3(0.0, 0.0, 0.0);
  var matDiffuse = vec3(MAT.LIGHT_DIFFUSE_R, MAT.LIGHT_DIFFUSE_G, MAT.LIGHT_DIFFUSE_B);
  var matSpecular = vec3(MAT.LIGHT_SPECULAR_R, MAT.LIGHT_SPECULAR_G, MAT.LIGHT_SPECULAR_B);
  var matShininess = MAT.LIGHT_SPECULAR_FACTOR;
  var diffuseFactor = max(dot(normal, -lightDir), 0.0);

  if (MAT.DIFFUSE_MAP_EXIST == 1.0)
  {
    matDiffuse = textureSample(MAT_DIFFUSE_MAP, MAT_DIFFUSE_MAP_SAMPLER, textureUV).rgb;
  }

  if (MAT.SPECULAR_MAP_EXIST == 1.0)
  {
    matSpecular = textureSample(MAT_SPECULAR_MAP, MAT_SPECULAR_MAP_SAMPLER, textureUV).rgb;
  }

  if (MAT.THUNE_MAP_EXIST == 1.0)
  {
    matShininess = textureSample(MAT_THUNE_MAP, MAT_THUNE_MAP_SAMPLER, textureUV).r;
  }

  if (diffuseFactor > 0.0)
  {
    diffuseColor = lightDiffuse * lightIntensity * matDiffuse * diffuseFactor;
    if (matShininess > 0.0)
    {
      var reflectDir = reflect(lightDir, normal);
      var viewDir = normalize(cameraPos - fragPos);
      var specularFactor = max(dot(viewDir, reflectDir), 0.0);
      if (specularFactor > 0.0)
      {
        specularFactor = pow(specularFactor, matShininess);
        specularColor = lightSpecular * lightIntensity * matSpecular * specularFactor;
      }
    }
  }

  return vec4((diffuseColor * shadow) + (specularColor * shadow), 1.0);
}

// *****************************************************************************************************************
// CALC DIR LIGHT
// *****************************************************************************************************************
fn CalcDirLight(normal: vec3<f32>, fragPos: vec3<f32>, cameraPos: vec3<f32>, textureUV: vec2<f32>, shadow: f32) -> vec4<f32>
{
  var lightDir = normalize(DIR_LIGHT.DIR);
  return CalcLightInternal(lightDir, DIR_LIGHT.DIFFUSE, DIR_LIGHT.SPECULAR, DIR_LIGHT.INTENSITY, normal, fragPos, cameraPos, textureUV, shadow);
}

// *****************************************************************************************************************
// CALC POINT LIGHT
// *****************************************************************************************************************
fn CalcPointLight(light: PointLight, normal: vec3<f32>, fragPos: vec3<f32>, cameraPos: vec3<f32>, textureUV: vec2<f32>, shadow: f32) -> vec4<f32>
{
  var lightDir = fragPos - light.POSITION;
  var distance = length(lightDir);

  var color = CalcLightInternal(normalize(lightDir), light.DIFFUSE, light.SPECULAR, light.INTENSITY, normal, fragPos, cameraPos, textureUV, shadow);
  var attenuation = light.ATTEN[0] + light.ATTEN[1] * distance + light.ATTEN[2] * distance * distance;
  return color / attenuation;
}

// *****************************************************************************************************************
// CALC SPOT LIGHT
// *****************************************************************************************************************
fn CalcSpotLight(light: SpotLight, normal: vec3<f32>, fragPos: vec3<f32>, cameraPos: vec3<f32>, textureUV: vec2<f32>, shadow: f32) -> vec4<f32>
{
  var lightDir = fragPos - light.POSITION;
  var normLightDir = normalize(lightDir);
  var distance = length(lightDir);
  var spotFactor = dot(normLightDir, normalize(light.DIRECTION));
  var color = CalcLightInternal(normalize(lightDir), light.DIFFUSE, light.SPECULAR, light.INTENSITY, normal, fragPos, cameraPos, textureUV, shadow);

  if (spotFactor > light.CUTOFF)
  {
    var attenuation = light.ATTEN[0] + light.ATTEN[1] * distance + light.ATTEN[2] * distance * distance;
    var spotIntensity = (1.0 - (1.0 - spotFactor) / (1.0 - light.CUTOFF));
    return (color / attenuation) * spotIntensity;
  }
  else
  {
    return vec4(0.0, 0.0, 0.0, 0.0);
  }
}

// *****************************************************************************************************************
// CALC TOON MAP
// *****************************************************************************************************************
fn CalcToonMap(normal: vec3<f32>, fragPos: vec3<f32>, cameraPos: vec3<f32>, shadow: f32) -> vec4<f32>
{
  var n = normalize(normal);
  var lightDir = normalize(vec3(MAT.TOON_LIGHT_DIR_X, MAT.TOON_LIGHT_DIR_Y, MAT.TOON_LIGHT_DIR_Z));
  var viewDir = normalize(cameraPos - fragPos);
  var s = max(dot(n, -lightDir), 0.0);
  var t = max(dot(n, viewDir), 0.0);
  var color = textureSample(MAT_TOON_MAP, MAT_TOON_MAP_SAMPLER, vec2<f32>(s, t));
  return color * shadow;
}

// *****************************************************************************************************************
// CALC SHADOW MAP
// *****************************************************************************************************************
fn CalcShadowMap(fragShadowPos: vec3<f32>, fragNormal: vec3<f32>) -> f32
{
  var visibility = 0.0;
  var shadowDepthTextureSize = f32(textureDimensions(SHADOW_MAP_TEXTURE).x);
  var oneOverShadowDepthTextureSize = 1.0 / shadowDepthTextureSize;

  var lightDir = normalize(-DIR_LIGHT.DIR);

  let bias = max(0.005 * (1.0 - dot(fragNormal, lightDir)), 0.0005);

  for (var y = -1; y <= 1; y++)
  {
    for (var x = -1; x <= 1; x++)
    {
      var offset = vec2<f32>(vec2(x, y)) * oneOverShadowDepthTextureSize;
      visibility += textureSampleCompare(SHADOW_MAP_TEXTURE, SHADOW_MAP_SAMPLER, fragShadowPos.xy + offset, fragShadowPos.z - bias);
    }
  }

  return visibility / 9.0;
}

// *****************************************************************************************************************
// CALC VOLUMETRIC
// *****************************************************************************************************************
fn CalcVolumetric(inputAlpha: f32, normal: vec3<f32>, fragPos: vec3<f32>, cameraPos: vec3<f32>) -> f32
{
  var viewDelta = cameraPos - fragPos;
  var viewDir = normalize(cameraPos - fragPos);
  var facing = max(dot(viewDir, normal), 0.0);
  var outputAlpha = inputAlpha;

  if (MAT.ALPHA_BLEND_FACING < 1.0)
  {
    var IOR = 1.0 - log(1.0 - MAT.ALPHA_BLEND_FACING);
    outputAlpha *= pow(facing, IOR);
  }

  if (MAT.ALPHA_BLEND_DISTANCE != 0.0)
  {
    var len = clamp(length(viewDelta) - MAT.ALPHA_BLEND_DISTANCE, 0.0, 1.0);
    outputAlpha *= len;
  }
  
  return outputAlpha;
}

// *****************************************************************************************************************
// CALC DISSOLVE MAP
// *****************************************************************************************************************
fn CalcDissolveMap(textureUV: vec2<f32>) -> f32
{
  var dissolve = textureSample(MAT_DISSOLVE_MAP, MAT_DISSOLVE_MAP_SAMPLER, textureUV).r * 0.999;
  var isVisible = dissolve - MAT.DISSOLVE_AMOUNT;
  if (isVisible < 0)
  {
    discard;
  }

  var edge = MAT.DISSOLVE_GLOW_RANGE + MAT.DISSOLVE_GLOW_FALLOFF;
  var away = MAT.DISSOLVE_GLOW_RANGE;
  return smoothstep(edge, away, isVisible);
}
  
// *****************************************************************************************************************
// UTILS COLOR BLENDING
// *****************************************************************************************************************
fn UtilsColorBlending(inputColor: vec4<f32>, blendMode: f32, blendColor: vec3<f32>, blendColorMix: f32) -> vec4<f32>
{
  var outputColor = inputColor;

  if (blendMode == 1.0)
  {
    outputColor.r += blendColor.r;
    outputColor.g += blendColor.g;
    outputColor.b += blendColor.b;
  }
  else if (blendMode == 2.0)
  {
    outputColor.r *= blendColor.r;
    outputColor.g *= blendColor.g;
    outputColor.b *= blendColor.b;
  }
  else if (blendMode == 3.0)
  {
    outputColor.r = mix(outputColor.r, blendColor.r, blendColorMix);
    outputColor.g = mix(outputColor.g, blendColor.g, blendColorMix);
    outputColor.b = mix(outputColor.b, blendColor.b, blendColorMix);
  }

  return outputColor;
}`;