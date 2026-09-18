import { Gfx3RendererAbstract } from '../gfx3/gfx3_renderer_abstract';

/** Nombre de composantes scalaires contenues dans un sommet de surface d'eau. */
export const WATER_SHADER_VERTEX_ATTR_COUNT = 8;

/** Nombre maximal d'impacts simultanément transmis aux shaders d'eau. */
export const WATER_MAX_IMPACTS = 8;

/** Points d'insertion personnalisables des shaders d'eau. */
export const WATER_SHADER_INSERTS = {
  VERT_INSERT: '',
  FRAG_INSERT: ''
};

/** Noms des paramètres personnalisables exposés aux shaders d'eau. */
export const WATER_CUSTOM_PARAMS = {
  S00: 'S00',
  S01: 'S01',
  S02: 'S02',
  S03: 'S03',
  S04: 'S04',
  S05: 'S05',
  S06: 'S06',
  S07: 'S07'
};

/** Indices des paramètres uniformes décrivant le rendu d'une surface d'eau. */
export enum Gfx3WaterParam {
  WAVE_AMPLITUDE,
  WAVE_SCALE,
  WAVE_SPEED,
  WAVE_CHOPPINESS,
  WAVE_STEP_X,
  WAVE_STEP_Z,
  WAVE_IMPACT_COUNT,
  // --------------------------------------
  NORMAL_MAP_ENABLED,
  NORMAL_MAP_SCROLL_X,
  NORMAL_MAP_SCROLL_Y,
  NORMAL_MAP_INTENSITY,
  NORMAL_MAP_SCALE,
  // --------------------------------------
  SURFACE_COLOR_ENABLED,
  SURFACE_COLOR_R,
  SURFACE_COLOR_G,
  SURFACE_COLOR_B,
  SURFACE_COLOR_FACTOR,
  // --------------------------------------
  OPTICS_ENV_MAP_ENABLED,
  OPTICS_ENV_INTENSITY,
  OPTICS_FRESNEL_POWER,
  OPTICS_FRESNEL_BIAS,
  // --------------------------------------
  SUN_ENABLED,
  SUN_DIRECTION_X,
  SUN_DIRECTION_Y,
  SUN_DIRECTION_Z,
  SUN_COLOR_R,
  SUN_COLOR_G,
  SUN_COLOR_B,
  SUN_COLOR_FACTOR,
  // --------------------------------------
  S0_TEXTURE_EXIST,
  S1_TEXTURE_EXIST,
  // --------------------------------------
  COUNT
};

/** Indices des composantes uniformes décrivant un impact sur l'eau. */
export enum Gfx3WaterImpact {
  X,
  Z,
  STRENGTH,
  RADIUS,
  LIFETIME,
  AGE,
  PAD1,
  PAD2,
  COUNT
};

/** Descripteur de la pipeline de rendu de l'eau. */
export const WATER_PIPELINE_DESC: any = {
  label: 'Water pipeline',
  layout: 'auto',
  vertex: {
    entryPoint: 'main',
    buffers: [{
      arrayStride: WATER_SHADER_VERTEX_ATTR_COUNT * 4,
      attributes: [{
        shaderLocation: 0, /*position*/
        offset: 0,
        format: 'float32x3'
      }, {
        shaderLocation: 1, /*uv*/
        offset: 3 * 4,
        format: 'float32x2'
      }, {
        shaderLocation: 2, /*colors*/
        offset: 5 * 4,
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
    { format: 'rgba16float' }, // tags
    { format: 'rgba16float' }] // ch1
  },
  primitive: {
    topology: 'triangle-list',
    cullMode: 'none',
    frontFace: 'ccw'
  },
  depthStencil: {
    depthWriteEnabled: true,
    depthCompare: 'less',
    format: 'depth24plus'
  }
};

const STRUCT_PARAMS = (data: any): string => `
struct Params {
  ${Gfx3RendererAbstract.generateWGSLStructFromEnum(Gfx3WaterParam)}
  ${data.S00}: f32,
  ${data.S01}: f32,
  ${data.S02}: f32,
  ${data.S03}: f32,
  ${data.S04}: f32,
  ${data.S05}: f32,
  ${data.S06}: f32,
  ${data.S07}: f32
}`;

const STRUCT_IMPACT = `
struct Impact {
  ${Gfx3RendererAbstract.generateWGSLStructFromEnum(Gfx3WaterImpact)}
}`;

/**
 * Génère le shader de sommets de l'eau.
 *
 * @param data - Paramètres personnalisés et code WGSL à injecter dans le gabarit.
 * @returns Le code source WGSL du shader de sommets.
 */
export const WATER_VERTEX_SHADER = (data: any = {}) => /* wgsl */`
struct VertexOutput {
  @builtin(position) Position: vec4<f32>,
  @location(0) FragWorldPos: vec3<f32>,
  @location(1) FragNormal: vec3<f32>,
  @location(2) FragUV: vec2<f32>,
  @location(3) FragColor: vec3<f32>
};

${STRUCT_IMPACT}
${STRUCT_PARAMS(data)}

@group(0) @binding(0) var<uniform> VPC_MATRIX: mat4x4<f32>;
@group(0) @binding(1) var<uniform> CAMERA_POS: vec3<f32>;
@group(0) @binding(2) var<uniform> TIME_INFOS: f32;
@group(1) @binding(0) var<uniform> M_MATRIX: mat4x4<f32>;
@group(1) @binding(1) var<uniform> TAG: vec4<f32>;
@group(1) @binding(2) var<uniform> PARAMS: Params;
@group(1) @binding(3) var<uniform> IMPACTS: array<Impact, ${WATER_MAX_IMPACTS}>;

@vertex
fn main(
  @location(0) Position: vec3<f32>,
  @location(1) FragUV: vec2<f32>,
  @location(2) FragColor: vec3<f32>
) -> VertexOutput {
  let xz = Position.xz;
  let h = CalcHeight(xz, TIME_INFOS);
  let hxp = CalcHeight(xz + vec2<f32>(PARAMS.WAVE_STEP_X, 0.0), TIME_INFOS);
  let hxm = CalcHeight(xz - vec2<f32>(PARAMS.WAVE_STEP_X, 0.0), TIME_INFOS);
  let hzp = CalcHeight(xz + vec2<f32>(0.0, PARAMS.WAVE_STEP_Z), TIME_INFOS);
  let hzm = CalcHeight(xz - vec2<f32>(0.0, PARAMS.WAVE_STEP_Z), TIME_INFOS);

  let normalX = -(hxp - hxm) / (2.0 * PARAMS.WAVE_STEP_X);
  let normalZ = -(hzp - hzm) / (2.0 * PARAMS.WAVE_STEP_Z);
  let normalLocal = normalize(vec3<f32>(normalX, 1.0, normalZ));

  let displaced = vec3<f32>(Position.x, Position.y + h, Position.z);
  let worldPos = (M_MATRIX * vec4<f32>(displaced, 1.0)).xyz;
  let worldNormal = normalize((M_MATRIX * vec4<f32>(normalLocal, 0.0)).xyz);

  ${data.VERT_INSERT}

  var output: VertexOutput;
  output.Position = VPC_MATRIX * vec4<f32>(worldPos, 1.0);
  output.FragWorldPos = worldPos;
  output.FragNormal = worldNormal;
  output.FragUV = FragUV;
  output.FragColor = FragColor;
  return output;
}

// *****************************************************************************************************************
// CALC HEIGHT
// *****************************************************************************************************************
fn CalcHeight(xz: vec2<f32>, time: f32) -> f32
{
  let amp = PARAMS.WAVE_AMPLITUDE;
  let scale = PARAMS.WAVE_SCALE;
  let speed = PARAMS.WAVE_SPEED;
  let choppy = max(PARAMS.WAVE_CHOPPINESS, 1.0);
  let drift1 = vec2<f32>(0.7, 0.4) * (time * speed);
  let drift2 = vec2<f32>(-0.3, 0.6) * (time * speed);
  let n1 = Perlin2(xz * scale + drift1);
  let n2 = Perlin2(xz * scale * 2.1 + drift2) * 0.5;
  let noise = n1 + n2;
  let localAmp = amp + ImpactBoost(xz);
  var h = noise * localAmp;

  if (choppy > 1.0 && abs(localAmp) > 1e-6)
  {
    h = sign(h) * pow(abs(h / localAmp), 1.0 / choppy) * localAmp;
  }

  return h;
}

// *****************************************************************************************************************
// HASH22
// *****************************************************************************************************************
fn Hash22(p: vec2<f32>) -> vec2<f32>
{
  let q = vec2<f32>(dot(p, vec2<f32>(127.1, 311.7)), dot(p, vec2<f32>(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(q) * 43758.5453123);
}

// *****************************************************************************************************************
// PERLIN2
// *****************************************************************************************************************
fn Perlin2(p: vec2<f32>) -> f32
{
  let i = floor(p);
  let f = fract(p);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let g00 = Hash22(i + vec2<f32>(0.0, 0.0));
  let g10 = Hash22(i + vec2<f32>(1.0, 0.0));
  let g01 = Hash22(i + vec2<f32>(0.0, 1.0));
  let g11 = Hash22(i + vec2<f32>(1.0, 1.0));
  let n00 = dot(g00, f - vec2<f32>(0.0, 0.0));
  let n10 = dot(g10, f - vec2<f32>(1.0, 0.0));
  let n01 = dot(g01, f - vec2<f32>(0.0, 1.0));
  let n11 = dot(g11, f - vec2<f32>(1.0, 1.0));
  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}

// *****************************************************************************************************************
// IMPACT BOOST
// *****************************************************************************************************************
fn ImpactBoost(xz: vec2<f32>) -> f32
{
  var sum = 0.0;
  let count = i32(PARAMS.WAVE_IMPACT_COUNT);

  for (var i: i32 = 0; i < ${WATER_MAX_IMPACTS}; i = i + 1)
  {
    if (i >= count)
    {
      break;
    }

    let d = xz - vec2(IMPACTS[i].X, IMPACTS[i].Z);
    let dist = length(d);
    if (dist >= IMPACTS[i].RADIUS)
    {
      continue;
    }

    let spatial = 1.0 - smoothstep(IMPACTS[i].RADIUS * 0.4, IMPACTS[i].RADIUS, dist);
    let t = IMPACTS[i].AGE / IMPACTS[i].LIFETIME;
    let rise = smoothstep(0.0, 0.15, t);
    let decay = 1.0 - smoothstep(0.15, 1.0, t);
    sum = sum + IMPACTS[i].STRENGTH * spatial * rise * decay;
  }

  return sum;
}`;

/**
 * Génère le shader de fragments de l'eau.
 *
 * @param data - Paramètres personnalisés et code WGSL à injecter dans le gabarit.
 * @returns Le code source WGSL du shader de fragments.
 */
export const WATER_FRAGMENT_SHADER = (data: any = {}) => /* wgsl */`
struct FragOutput {
  @location(0) Base: vec4<f32>,
  @location(1) Normal: vec4<f32>,
  @location(2) Tag: vec4<f32>,
  @location(3) Ch1: vec4<f32>
};

${STRUCT_PARAMS(data)}

@group(0) @binding(0) var<uniform> VPC_MATRIX: mat4x4<f32>;
@group(0) @binding(1) var<uniform> CAMERA_POS: vec3<f32>;
@group(0) @binding(2) var<uniform> TIME_INFOS: f32;
@group(1) @binding(0) var<uniform> M_MATRIX: mat4x4<f32>;
@group(1) @binding(1) var<uniform> TAG: vec4<f32>;
@group(1) @binding(2) var<uniform> PARAMS: Params;

@group(2) @binding(0) var ENV_MAP_TEXTURE: texture_cube<f32>;
@group(2) @binding(1) var ENV_MAP_SAMPLER: sampler;
@group(2) @binding(2) var NORMAL_MAP_TEXTURE: texture_2d<f32>;
@group(2) @binding(3) var NORMAL_MAP_SAMPLER: sampler;
@group(2) @binding(4) var S0_TEXTURE: texture_2d<f32>;
@group(2) @binding(5) var S0_SAMPLER: sampler;
@group(2) @binding(6) var S1_TEXTURE: texture_2d<f32>;
@group(2) @binding(7) var S1_SAMPLER: sampler;

@fragment
fn main(
  @builtin(position) Position: vec4<f32>,
  @location(0) FragWorldPos: vec3<f32>,
  @location(1) FragNormal: vec3<f32>,
  @location(2) FragUV: vec2<f32>,
  @location(3) FragColor: vec3<f32>
) -> FragOutput {
  let sunColor = vec3(PARAMS.SUN_COLOR_R, PARAMS.SUN_COLOR_G, PARAMS.SUN_COLOR_B);
  let sunDirection = vec3(PARAMS.SUN_DIRECTION_X, PARAMS.SUN_DIRECTION_Y, PARAMS.SUN_DIRECTION_Z);
  let surfaceColor = vec3(PARAMS.SURFACE_COLOR_R, PARAMS.SURFACE_COLOR_G, PARAMS.SURFACE_COLOR_B) * PARAMS.SURFACE_COLOR_ENABLED;
  let viewDir = normalize(CAMERA_POS - FragWorldPos);
  var s0 = textureSample(S0_TEXTURE, S0_SAMPLER, FragUV);
  var s1 = textureSample(S1_TEXTURE, S1_SAMPLER, FragUV);
  
  let fragNormal = CalcFinalNormal(FragNormal, FragUV);
  let reflectAmount = CalcReflectAmount(fragNormal, viewDir);
  let envColor = CalcEnvMap(fragNormal, viewDir, surfaceColor) * PARAMS.OPTICS_ENV_MAP_ENABLED;
  let baseLight = mix(vec3<f32>(1.0), CalcLight(sunDirection, sunColor, fragNormal), PARAMS.SUN_ENABLED);
  var finalColor = mix(surfaceColor, envColor, reflectAmount) * baseLight;

  ${data.FRAG_INSERT}

  var output: FragOutput;
  output.Base = vec4<f32>(finalColor, PARAMS.SURFACE_COLOR_FACTOR);
  output.Normal = vec4<f32>(fragNormal * 0.5 + 0.5, 1.0);
  output.Tag = TAG;
  output.Ch1 = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  return output;
}

// *****************************************************************************************************************
// CALC ENV MAP
// *****************************************************************************************************************
fn CalcEnvMap(fragNormal: vec3<f32>, viewDir: vec3<f32>, surfaceColor: vec3<f32>) -> vec3<f32>
{
  let reflectDir = normalize(reflect(-viewDir, fragNormal));
  let envSample = textureSample(ENV_MAP_TEXTURE, ENV_MAP_SAMPLER, reflectDir).rgb;
  let envColor = envSample * PARAMS.OPTICS_ENV_INTENSITY * mix(vec3<f32>(1.0), surfaceColor * 2.0, 0.25);
  return envColor;
}

// *****************************************************************************************************************
// CALC LIGHT
// *****************************************************************************************************************
fn CalcLight(sunDirection: vec3<f32>, sunColor: vec3<f32>, fragNormal: vec3<f32>) -> vec3<f32>
{
  let sunDir = normalize(-sunDirection);
  let sunDiffuse = max(dot(fragNormal, sunDir), 0.0);
  return vec3<f32>(0.35) + sunColor * (sunDiffuse * PARAMS.SUN_COLOR_FACTOR);
}

// *****************************************************************************************************************
// CALC REFLECT AMOUNT
// *****************************************************************************************************************
fn CalcReflectAmount(fragNormal: vec3<f32>, viewDir: vec3<f32>) -> f32
{
  let cosTheta = clamp(dot(fragNormal, viewDir), 0.0, 1.0);
  return CalcFresnel(cosTheta);
}

// *****************************************************************************************************************
// CALC FINAL NORMAL
// *****************************************************************************************************************
fn CalcFinalNormal(fragNormal: vec3<f32>, uv: vec2<f32>) -> vec3<f32>
{
  let nm = CalcSurfaceNormal(uv, TIME_INFOS);
  let intensity = PARAMS.NORMAL_MAP_INTENSITY * PARAMS.NORMAL_MAP_ENABLED;
  let nmTilted = normalize(vec3<f32>(nm.x * intensity, nm.y * intensity, max(nm.z, 1e-4)));
  let nmWorld = vec3<f32>(nmTilted.x, nmTilted.z, nmTilted.y);
  return normalize(normalize(fragNormal) + nmWorld - vec3<f32>(0.0, 1.0, 0.0));
}

// *****************************************************************************************************************
// CALC SURFACE NORMAL
// *****************************************************************************************************************
fn CalcSurfaceNormal(uv: vec2<f32>, time: f32) -> vec3<f32>
{
  let scrollA = vec2<f32>(PARAMS.NORMAL_MAP_SCROLL_X, PARAMS.NORMAL_MAP_SCROLL_Y) * time;
  let scrollB = vec2<f32>(-PARAMS.NORMAL_MAP_SCROLL_Y, PARAMS.NORMAL_MAP_SCROLL_X) * time * 0.7;
  let uvA = uv * PARAMS.NORMAL_MAP_SCALE + scrollA;
  let uvB = uv * PARAMS.NORMAL_MAP_SCALE * 1.7 + scrollB;
  let nmA = textureSample(NORMAL_MAP_TEXTURE, NORMAL_MAP_SAMPLER, uvA).rgb * 2.0 - 1.0;
  let nmB = textureSample(NORMAL_MAP_TEXTURE, NORMAL_MAP_SAMPLER, uvB).rgb * 2.0 - 1.0;
  return normalize(nmA + nmB);
}

// *****************************************************************************************************************
// CALC FRESNEL
// *****************************************************************************************************************
fn CalcFresnel(cosTheta: f32) -> f32
{
  let baseReflectivity = clamp(PARAMS.OPTICS_FRESNEL_BIAS, 0.0, 1.0);
  let power = max(PARAMS.OPTICS_FRESNEL_POWER, 0.1);
  let grazing = pow(1.0 - cosTheta, power);
  return clamp(baseReflectivity + (1.0 - baseReflectivity) * grazing, 0.0, 1.0);
}`;