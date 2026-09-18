import { Gfx3RendererAbstract } from '../gfx3/gfx3_renderer_abstract';

/** Indices des paramètres de la première passe de post-traitement. */
export enum Gfx3PostParam {
  ENABLED,
  PIXELATION_ENABLED,
  PIXELATION_WIDTH,
  PIXELATION_HEIGHT,
  COLOR_ENABLED,
  COLOR_PRECISION,
  DITHER_ENABLED,
  DITHER_PATTERN_INDEX,
  DITHER_THRESHOLD,
  DITHER_SCALE_X,
  DITHER_SCALE_Y,
  OUTLINE_ENABLED,
  OUTLINE_THICKNESS,
  OUTLINE_R,
  OUTLINE_G,
  OUTLINE_B,
  OUTLINE_CONSTANT,
  SHADOW_VOLUME_ENABLED,
  SHADOW_VOLUME_BLEND_MODE,
  BRIGHTNESS_ENABLED,
  BRIGHTNESS_THRESHOLD,
  COUNT
};

/** Noms des paramètres personnalisables injectés dans le shader de post-traitement. */
export const POST_CUSTOM_PARAMS = {
  S00: 'S00',
  S01: 'S01',
  S02: 'S02',
  S03: 'S03',
  S04: 'S04',
  S05: 'S05',
  S06: 'S06',
  S07: 'S07',
  S08: 'S08',
  S09: 'S09',
  S10: 'S10',
  S11: 'S11',
  S12: 'S12',
  S13: 'S13',
  S14: 'S14',
  S15: 'S15',
};

/** Points d'insertion configurables du modèle de shader de post-traitement. */
export const POST_SHADER_INSERTS = {
  INSERT_BEGIN: '',
  INSERT_BETWEEN_RADIALBLUR_AND_COLOR_PRECISION: '',
  INSERT_BETWEEN_COLOR_DITHERING_AND_DITHER: '',
  INSERT_BETWEEN_DITHER_AND_OUTLINE: '',
  INSERT_BETWEEN_OUTLINE_AND_SHADOW_VOLUME: '',
  INSERT_SHADOW_VOLUME_HOOK: null,
  INSERT_BETWEEN_SHADOW_VOLUME_AND_BRIGHTNESS: '',
  INSERT_END: ''
};

/** Nombre de paramètres scalaires personnalisables du shader de post-traitement. */
export const POST_SHADER_CUSTOM_PARAMS_COUNT = 16;
/** Nombre de composantes scalaires par sommet du quadrilatère plein écran. */
export const POST_SHADER_VERTEX_ATTR_COUNT = 4;
/** Descripteur de la pipeline WebGPU de la première passe de post-traitement. */
export const POST_PIPELINE_DESC: any = {
  label: 'POST pipeline',
  layout: 'auto',
  vertex: {
    entryPoint: 'main',
    buffers: [{
      arrayStride: POST_SHADER_VERTEX_ATTR_COUNT * 4,
      attributes: [{
        shaderLocation: 0, /*position*/
        offset: 0,
        format: 'float32x2'
      }, {
        shaderLocation: 1, /*uv*/
        offset: 2 * 4,
        format: 'float32x2'
      }]
    }]
  },
  fragment: {
    entryPoint: 'main',
    targets: [{
      format: navigator.gpu.getPreferredCanvasFormat(),
      blend: {
        color: {
          srcFactor: 'one',
          dstFactor: 'one-minus-src',
          operation: 'add'
        },
        alpha: {
          srcFactor: 'one',
          dstFactor: 'one-minus-src',
          operation: 'add'
        }
      }
    },
    { format: 'rgba16float' }
  ]},
  primitive: {
    topology: 'triangle-list'
  }
};

/**
 * Génère le shader de sommets WGSL commun aux passes de post-traitement.
 *
 * @param data - Données de personnalisation, actuellement inutilisées.
 * @returns Le code source WGSL du shader de sommets.
 */
export const POST_VERTEX_SHADER = (data: any): string => /* wgsl */`
struct VertexOutput {
  @builtin(position) Position: vec4<f32>,
  @location(0) FragUV: vec2<f32>
};

@vertex
fn main(
  @location(0) Position: vec2<f32>,
  @location(1) TexUV: vec2<f32>
) -> VertexOutput {
  var output: VertexOutput;
  output.Position = vec4(Position, 0.0, 1.0);
  output.FragUV = TexUV;
  return output;
}`;

/**
 * Génère le shader de fragments WGSL de la première passe de post-traitement.
 *
 * @param data - Noms des paramètres personnalisés et code à injecter aux points d'extension.
 * @returns Le code source WGSL du shader de fragments.
 */
export const POST_FRAGMENT_SHADER = (data: any): string => /* wgsl */`
struct Infos {
  RES_WIDTH: f32,
  RES_HEIGHT: f32,
  NEAR: f32,
  FAR: f32,
  DELTA_TIME: f32,
  TIME: f32
};

struct Params {
  ${Gfx3RendererAbstract.generateWGSLStructFromEnum(Gfx3PostParam)}
  ${data.S00}: f32,
  ${data.S01}: f32,
  ${data.S02}: f32,
  ${data.S03}: f32,
  ${data.S04}: f32,
  ${data.S05}: f32,
  ${data.S06}: f32,
  ${data.S07}: f32,
  ${data.S08}: f32,
  ${data.S09}: f32,
  ${data.S10}: f32,
  ${data.S11}: f32,
  ${data.S12}: f32,
  ${data.S13}: f32,
  ${data.S14}: f32,
  ${data.S15}: f32
};

@group(0) @binding(0) var<uniform> PARAMS: Params;
@group(0) @binding(1) var<uniform> INFOS: Infos;
@group(0) @binding(2) var SOURCE_TEXTURE: texture_2d<f32>;
@group(0) @binding(3) var SOURCE_SAMPLER: sampler;
@group(0) @binding(4) var NORMALS_TEXTURE: texture_2d<f32>;
@group(0) @binding(5) var NORMALS_SAMPLER: sampler;
@group(0) @binding(6) var TAGS_TEXTURE: texture_2d<f32>;
@group(0) @binding(7) var TAGS_SAMPLER: sampler;
@group(0) @binding(8) var DEPTH_TEXTURE: texture_depth_2d;
@group(0) @binding(9) var CHANNEL1_TEXTURE: texture_2d<f32>;
@group(0) @binding(10) var CHANNEL1_SAMPLER: sampler;

@group(1) @binding(0) var SHADOW_VOL_TEXTURE: texture_2d<f32>;
@group(1) @binding(1) var SHADOW_VOL_SAMPLER: sampler;
@group(1) @binding(2) var SHADOW_VOL_DEPTH_CCW_TEXTURE: texture_depth_2d;
@group(1) @binding(3) var SHADOW_VOL_DEPTH_CW_TEXTURE: texture_depth_2d;

@group(2) @binding(0) var S0_TEXTURE: texture_2d<f32>;
@group(2) @binding(1) var S0_SAMPLER: sampler;
@group(2) @binding(2) var S1_TEXTURE: texture_2d<f32>;
@group(2) @binding(3) var S1_SAMPLER: sampler;

struct FragmentOutput {
  @location(0) Color: vec4<f32>,
  @location(1) Brightness: vec4<f32>
};

@fragment
fn main(
  @location(0) FragUV: vec2<f32>
) -> FragmentOutput {
  var output: FragmentOutput;
  var outputColor = textureSample(SOURCE_TEXTURE, SOURCE_SAMPLER, FragUV);
  var fragUV = FragUV;

  if (PARAMS.ENABLED == 0.0)
  {
    output.Color = outputColor;
    output.Brightness = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    return output;
  }

  var tag = textureSample(TAGS_TEXTURE, TAGS_SAMPLER, fragUV);
  var flags = u32(tag.b);

  if (PARAMS.PIXELATION_ENABLED == 1.0 && (flags & 2) == 2)
  {    
    fragUV.x = floor(fragUV.x * PARAMS.PIXELATION_WIDTH) / PARAMS.PIXELATION_WIDTH;
    fragUV.y = floor(fragUV.y * PARAMS.PIXELATION_HEIGHT) / PARAMS.PIXELATION_HEIGHT;
  }

  outputColor = textureSample(SOURCE_TEXTURE, SOURCE_SAMPLER, fragUV);
  tag = textureSample(TAGS_TEXTURE, TAGS_SAMPLER, fragUV);
  flags = u32(tag.b);

  var normal = textureSample(NORMALS_TEXTURE, NORMALS_SAMPLER, fragUV);
  var depth = LinearlyFilterDepthTexture(DEPTH_TEXTURE, fragUV);
  var ch1 = textureSample(CHANNEL1_TEXTURE, CHANNEL1_SAMPLER, fragUV);
  var shadowVol = textureSample(SHADOW_VOL_TEXTURE, SHADOW_VOL_SAMPLER, fragUV);
  var shadowVolDepthCW = LinearlyFilterDepthTexture(SHADOW_VOL_DEPTH_CW_TEXTURE, fragUV);
  var shadowVolDepthCCW = LinearlyFilterDepthTexture(SHADOW_VOL_DEPTH_CCW_TEXTURE, fragUV);
  var s0 = textureSample(S0_TEXTURE, S0_SAMPLER, fragUV);
  var s1 = textureSample(S1_TEXTURE, S1_SAMPLER, fragUV);

  let linearDepth = LinearizeDepth(depth, INFOS.NEAR, INFOS.FAR);
  let depthNormalized = NormalizeDepth(linearDepth, INFOS.NEAR, INFOS.FAR);

  ${data.INSERT_BEGIN}

  if (PARAMS.COLOR_ENABLED == 1.0 && (flags & 4) == 4)
  {
    outputColor = floor(outputColor * PARAMS.COLOR_PRECISION) / PARAMS.COLOR_PRECISION;
  }

  ${data.INSERT_BETWEEN_COLOR_DITHERING_AND_DITHER}

  if (PARAMS.DITHER_ENABLED == 1.0 && (flags & 8) == 8)
  {
    var brightness = GetPixelBrightness(outputColor.rgb);
    var ditherPattern = GetDitherPattern(PARAMS.DITHER_PATTERN_INDEX);
    var ditherX = u32((FragUV.x * INFOS.RES_WIDTH) / PARAMS.DITHER_SCALE_X);
    var ditherY = u32((FragUV.y * INFOS.RES_HEIGHT) / PARAMS.DITHER_SCALE_Y);
    var ditherPixel = GetDitherValue(ditherX, ditherY, brightness, ditherPattern);
    outputColor = outputColor * ditherPixel;
  }

  ${data.INSERT_BETWEEN_DITHER_AND_OUTLINE}

  if (PARAMS.OUTLINE_ENABLED == 1.0 && (flags & 16) == 16)
  {
    var t = PARAMS.OUTLINE_THICKNESS * (depth - 1.0);
    var colorDiff = 0.0;

    if (PARAMS.OUTLINE_CONSTANT == 1.0)
    {
      t = PARAMS.OUTLINE_THICKNESS;
    }

    var tagColor = tag.rgb;
    colorDiff += distance(tagColor, GetTagColor(fragUV, vec2<f32>( t,  0)));
    colorDiff += distance(tagColor, GetTagColor(fragUV, vec2<f32>( 0,  t)));
    colorDiff += distance(tagColor, GetTagColor(fragUV, vec2<f32>( 0,  t)));
    colorDiff += distance(tagColor, GetTagColor(fragUV, vec2<f32>( 0, -t)));
    colorDiff += distance(tagColor, GetTagColor(fragUV, vec2<f32>( t,  t)));
    colorDiff += distance(tagColor, GetTagColor(fragUV, vec2<f32>( t, -t)));
    colorDiff += distance(tagColor, GetTagColor(fragUV, vec2<f32>(-t,  t)));
    colorDiff += distance(tagColor, GetTagColor(fragUV, vec2<f32>(-t, -t)));

    if (colorDiff != 0.0)
    {
      colorDiff = 1.0;
      var outline = clamp(colorDiff, 0, 1);
      outputColor = mix(outputColor, vec4<f32>(PARAMS.OUTLINE_R, PARAMS.OUTLINE_G, PARAMS.OUTLINE_B, 1.0), outline);  
    }
  }

  ${data.INSERT_BETWEEN_OUTLINE_AND_SHADOW_VOLUME}

  if (PARAMS.SHADOW_VOLUME_ENABLED == 1.0 && (flags & 32) == 32)
  {
    if (shadowVolDepthCW != 1.0 && shadowVolDepthCCW != 1.0 && depth >= shadowVolDepthCCW && depth <= shadowVolDepthCW)
    {
      ${data.INSERT_SHADOW_VOLUME_HOOK ?? `
      if (PARAMS.SHADOW_VOLUME_BLEND_MODE == 0.0)
      {
        outputColor *= shadowVol;
      }
      else if (PARAMS.SHADOW_VOLUME_BLEND_MODE == 1.0)
      {
        outputColor += shadowVol;
      }`}
    }
  }

  ${data.INSERT_BETWEEN_SHADOW_VOLUME_AND_BRIGHTNESS}

  var brightColor = vec4<f32>(0.0, 0.0, 0.0, 1.0);
  if (PARAMS.BRIGHTNESS_ENABLED == 1.0 && (flags & 128) == 128)
  {
    let luminance = dot(outputColor.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    if (luminance > PARAMS.BRIGHTNESS_THRESHOLD)
    {
      brightColor = vec4<f32>(outputColor.rgb, 1.0);
    }
  }

  ${data.INSERT_END}

  output.Color = outputColor;
  output.Brightness = brightColor;
  return output;
}

// *****************************************************************************************************************
// GET TEXEL VALUE
// *****************************************************************************************************************
fn GetTexelValue(textureUV: vec2<f32>, offset: vec2<f32>) -> vec4<f32>
{
  var ps = vec2<f32>(1.0 / INFOS.RES_WIDTH, 1.0 / INFOS.RES_HEIGHT);
  return textureSample(SOURCE_TEXTURE, SOURCE_SAMPLER, textureUV + ps * offset);
}

// *****************************************************************************************************************
// GET NORMAL VALUE
// *****************************************************************************************************************
fn GetNormalValue(textureUV: vec2<f32>, offset: vec2<f32>) -> vec4<f32>
{
  var ps = vec2<f32>(1.0 / INFOS.RES_WIDTH, 1.0 / INFOS.RES_HEIGHT);
  return textureSampleBaseClampToEdge(NORMALS_TEXTURE, NORMALS_SAMPLER, textureUV + ps * offset);
}

// *****************************************************************************************************************
// GET TAG VALUE
// *****************************************************************************************************************
fn GetTagColor(textureUV: vec2<f32>, offset: vec2<f32>) -> vec3<f32>
{
  var ps = vec2<f32>(1.0 / INFOS.RES_WIDTH, 1.0 / INFOS.RES_HEIGHT);
  return textureSampleBaseClampToEdge(TAGS_TEXTURE, TAGS_SAMPLER, textureUV + ps * offset).rgb;
}

// *****************************************************************************************************************
// GET DEPTH VALUE
// *****************************************************************************************************************
fn GetDepthValue(textureUV: vec2<f32>, offset: vec2<f32>) -> f32
{
  var ps = vec2<f32>(1.0 / INFOS.RES_WIDTH, 1.0 / INFOS.RES_HEIGHT);
  return LinearlyFilterDepthTexture(DEPTH_TEXTURE, textureUV + ps * offset);
}

// *****************************************************************************************************************
// GET DITHER PATTERN
// *****************************************************************************************************************
fn GetDitherPattern(index: f32) -> mat4x4<f32>
{
  var pattern = mat4x4<f32>();

  if (index == 0)
  {
    pattern = mat4x4<f32>(
      0, 1, 0, 1,
      1, 0, 1, 0,
      0, 1, 0, 1,
      1, 0, 1, 0 
    );
  }         
  else if (index == 1)
  {
    pattern = mat4x4<f32>(
      0.23, 0.2, 0.6, 0.2,
      0.2, 0.43, 0.2, 0.77,
      0.88, 0.2, 0.87, 0.2,
      0.2, 0.46, 0.2, 0
    );
  }           
  else if (index == 2)
  {
    pattern = mat4x4<f32>(
      -4.0, 0.0, -3.0, 1.0,
      2.0, -2.0, 3.0, -1.0,
      -3.0, 1.0, -4.0, 0.0,
      3.0, -1.0, 2.0, -2.0
    );
  }       
  else if (index == 3)
  {
    pattern = mat4x4<f32>(
      1, 0, 0, 1,
      0, 1, 1, 0,
      0, 1, 1, 0,
      1, 0, 0, 1 
    );
  }
  else 
  {
    pattern = mat4x4<f32>(
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1
    );
  }
  
  return pattern;
}

// *****************************************************************************************************************
// GET DITHER VALUE
// *****************************************************************************************************************
fn GetDitherValue(x: u32, y: u32, brightness: f32, pattern: mat4x4<f32>) -> f32
{
  if ((brightness * PARAMS.DITHER_THRESHOLD) < pattern[x % 4][y % 4]) 
  {
    return 0;
  }
  else
  {
    return 1;
  }
}

// *****************************************************************************************************************
// GET PIXEL BRIGHTNESS
// *****************************************************************************************************************
fn GetPixelBrightness(color: vec3<f32>) -> f32
{
  return color.r + color.g + color.b / 3.0;
}

// *****************************************************************************************************************
// LINEARLY FILTER DEPTH TEXTURE
// *****************************************************************************************************************
fn LinearlyFilterDepthTexture(t: texture_depth_2d, normalizedTextureCoord: vec2f) -> f32
{
  let tSize = textureDimensions(t);
  let texelCoord = normalizedTextureCoord * vec2f(tSize) - 0.5;

  // clamp-to-edge
  let lo = max(vec2i(0, 0), vec2i(floor(texelCoord)));
  let hi = min(vec2i(tSize - 1u), vec2i(ceil(texelCoord)));

  // load the 4 texels
  let p00 = textureLoad(t, lo, 0);
  let p10 = textureLoad(t, vec2i(hi.x, lo.y), 0);
  let p11 = textureLoad(t, hi, 0);
  let p01 = textureLoad(t, vec2i(lo.x, hi.y), 0);

  // blend horizontally
  let top = mix(p00, p10, fract(texelCoord.x));
  let bot = mix(p01, p11, fract(texelCoord.x));

  // blend vertically
  return mix(top, bot, fract(texelCoord.y));
}

// *****************************************************************************************************************
// LINEARIZE DEPTH
// *****************************************************************************************************************
fn LinearizeDepth(depthRaw: f32, near: f32, far: f32) -> f32 {
  let z_ndc = depthRaw * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - z_ndc * (far - near));
}

// *****************************************************************************************************************
// NORMALIZE DEPTH
// *****************************************************************************************************************
fn NormalizeDepth(linearDepth: f32, near: f32, far: f32) -> f32 {
  return clamp((linearDepth - near) / (far - near), 0.0, 1.0);
}`;

// -----------------------------------------------------------------------------------------------------------------
// MIDDLE ----------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------

/** Indices des paramètres de la passe intermédiaire consacrée au bloom. */
export enum Gfx3PostMiddleParam {
  BLOOM_ENABLED,
  BLOOM_INTENSITY,
  BLOOM_RADIUS,
  COUNT
};

/** Descripteur de la pipeline WebGPU de la passe intermédiaire. */
export const POST_MIDDLE_PIPELINE_DESC: any = {
  label: 'POST middle pipeline',
  layout: 'auto',
  vertex: {
    entryPoint: 'main',
    buffers: [{
      arrayStride: POST_SHADER_VERTEX_ATTR_COUNT * 4,
      attributes: [{
        shaderLocation: 0, /*position*/
        offset: 0,
        format: 'float32x2'
      }, {
        shaderLocation: 1, /*uv*/
        offset: 2 * 4,
        format: 'float32x2'
      }]
    }]
  },
  fragment: {
    entryPoint: 'main',
    targets: [{
      format: navigator.gpu.getPreferredCanvasFormat(),
      blend: {
        color: {
          srcFactor: 'one',
          dstFactor: 'one-minus-src',
          operation: 'add'
        },
        alpha: {
          srcFactor: 'one',
          dstFactor: 'one-minus-src',
          operation: 'add'
        }
      }
    }]
  },
  primitive: {
    topology: 'triangle-list'
  }
};

/**
 * Génère le shader de fragments WGSL de la passe intermédiaire de bloom.
 *
 * @param data - Données de personnalisation, actuellement inutilisées.
 * @returns Le code source WGSL du shader de fragments.
 */
export const POST_MIDDLE_FRAGMENT_SHADER = (data: any): string => /* wgsl */`
struct Params {
  ${Gfx3RendererAbstract.generateWGSLStructFromEnum(Gfx3PostMiddleParam)}
};

@group(0) @binding(0) var<uniform> PARAMS: Params;
@group(0) @binding(1) var SOURCE_TEXTURE: texture_2d<f32>;
@group(0) @binding(2) var SOURCE_SAMPLER: sampler;
@group(0) @binding(3) var BRIGHTNESS_TEXTURE: texture_2d<f32>;
@group(0) @binding(4) var BRIGHTNESS_SAMPLER: sampler;

@fragment
fn main(
  @location(0) FragUV: vec2<f32>
) -> @location(0) vec4<f32> {
  var outputColor = textureSample(SOURCE_TEXTURE, SOURCE_SAMPLER, FragUV);

  let texelSize = 1.0 / vec2<f32>(textureDimensions(BRIGHTNESS_TEXTURE));
  var bloom = vec3<f32>(0.0);
  var totalWeight = 0.0;

  for (var x = -4; x <= 4; x = x + 1)
  {
    for (var y = -4; y <= 4; y = y + 1)
    {
      let offset = vec2<f32>(f32(x), f32(y)) * texelSize * PARAMS.BLOOM_RADIUS;
      let weight = exp(-f32(x * x + y * y) / 8.0);
      bloom += textureSample(BRIGHTNESS_TEXTURE, BRIGHTNESS_SAMPLER, FragUV + offset).rgb * weight;
      totalWeight += weight;
    }
  }

  bloom = bloom / totalWeight;
  return vec4<f32>(outputColor.rgb + bloom * PARAMS.BLOOM_INTENSITY, outputColor.a);
}`;

// -----------------------------------------------------------------------------------------------------------------
// FINAL -----------------------------------------------------------------------------------------------------------
// -----------------------------------------------------------------------------------------------------------------

/** Descripteur de la pipeline WebGPU de la passe finale. */
export const POST_FINAL_PIPELINE_DESC: any = {
  label: 'POST final pipeline',
  layout: 'auto',
  vertex: {
    entryPoint: 'main',
    buffers: [{
      arrayStride: POST_SHADER_VERTEX_ATTR_COUNT * 4,
      attributes: [{
        shaderLocation: 0, /*position*/
        offset: 0,
        format: 'float32x2'
      }, {
        shaderLocation: 1, /*uv*/
        offset: 2 * 4,
        format: 'float32x2'
      }]
    }]
  },
  fragment: {
    entryPoint: 'main',
    targets: [{
      format: navigator.gpu.getPreferredCanvasFormat(),
      blend: {
        color: {
          srcFactor: 'one',
          dstFactor: 'one-minus-src',
          operation: 'add'
        },
        alpha: {
          srcFactor: 'one',
          dstFactor: 'one-minus-src',
          operation: 'add'
        }
      }
    }]
  },
  primitive: {
    topology: 'triangle-list'
  }
};

/** Indices des paramètres de la passe finale de flou radial et de mappage tonal HDR. */
export enum Gfx3PostFinalParam {
  RADIALBLUR_ENABLED,
  RADIALBLUR_STRENGTH,
  RADIALBLUR_SAMPLES,
  RADIALBLUR_CENTER_X,
  RADIALBLUR_CENTER_Y,
  HDR_ENABLED,
  HDR_EXPOSURE,
  HDR_GAMMA,
  COUNT
};

/**
 * Génère le shader de fragments WGSL de la passe finale.
 *
 * @param data - Données de personnalisation, actuellement inutilisées.
 * @returns Le code source WGSL du shader de fragments.
 */
export const POST_FINAL_FRAGMENT_SHADER = (data: any): string => /* wgsl */`
struct Params {
  ${Gfx3RendererAbstract.generateWGSLStructFromEnum(Gfx3PostFinalParam)}
};

@group(0) @binding(0) var<uniform> PARAMS: Params;
@group(0) @binding(1) var SOURCE_TEXTURE: texture_2d<f32>;
@group(0) @binding(2) var SOURCE_SAMPLER: sampler;

@fragment
fn main(
  @location(0) FragUV: vec2<f32>
) -> @location(0) vec4<f32> {
  var outputColor = textureSample(SOURCE_TEXTURE, SOURCE_SAMPLER, FragUV);

  if (PARAMS.RADIALBLUR_ENABLED == 1.0)
  {
    let samples = i32(PARAMS.RADIALBLUR_SAMPLES);
    let center = vec2<f32>(PARAMS.RADIALBLUR_CENTER_X, PARAMS.RADIALBLUR_CENTER_Y);
    var dir = FragUV - center;
    var combinedColor = outputColor;

    for (var i = 1; i <= samples; i = i + 1)
    {
      let scale = 1.0 - (PARAMS.RADIALBLUR_STRENGTH * f32(i) / f32(samples));
      let sampleUV = center + dir * scale;
      var sampleColor = textureSample(SOURCE_TEXTURE, SOURCE_SAMPLER, sampleUV);
      combinedColor += sampleColor;
    }

    outputColor = combinedColor / f32(samples + 1);
  }

  if (PARAMS.HDR_ENABLED == 1.0)
  {
    var color = ReinhardToneMapping(outputColor.rgb, PARAMS.HDR_EXPOSURE);
    color = pow(color, vec3<f32>(1.0 / PARAMS.HDR_GAMMA));
    outputColor = vec4<f32>(color.rgb, outputColor.a);
  }

  return outputColor;
}

fn ReinhardToneMapping(color: vec3<f32>, exposure: f32) -> vec3<f32> {
  var mapped = color * exposure;
  return mapped / (mapped + vec3<f32>(1.0));
}`;