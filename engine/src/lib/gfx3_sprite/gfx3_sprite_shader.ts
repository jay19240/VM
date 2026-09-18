/** Points d'insertion personnalisables des shaders de sprites. */
export const SPRITE_SHADER_INSERTS = {
  VERT_INSERT: '',
  FRAG_INSERT: ''
};

/** Nombre de composantes scalaires contenues dans un sommet de sprite. */
export const SPRITE_SHADER_VERTEX_ATTR_COUNT = 5;

/** Descripteur de la pipeline de rendu des sprites. */
export const SPRITE_PIPELINE_DESC: any = {
  label: 'Sprite pipeline',
  layout: 'auto',
  vertex: {
    entryPoint: 'main',
    buffers: [{
      arrayStride: SPRITE_SHADER_VERTEX_ATTR_COUNT * 4,
      attributes: [{
        shaderLocation: 0, /*position*/
        offset: 0,
        format: 'float32x3'
      }, {
        shaderLocation: 1, /*uv*/
        offset: 3 * 4,
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
    cullMode: 'back',
    frontFace: 'ccw'
  },
  depthStencil: {
    depthWriteEnabled: true,
    depthCompare: 'less',
    format: 'depth24plus'
  }
};

/**
 * Génère le shader de sommets des sprites.
 *
 * @param data - Code WGSL à injecter dans le gabarit.
 * @returns Le code source WGSL du shader de sommets.
 */
export const SPRITE_VERTEX_SHADER = (data: any) => /* wgsl */`
struct VertexOutput {
  @builtin(position) Position: vec4<f32>,
  @location(0) FragUV: vec2<f32>
};

@group(0) @binding(0) var<uniform> MVPC_MATRIX: mat4x4<f32>;

@vertex
fn main(
  @location(0) Position : vec4<f32>,
  @location(1) TexUV : vec2<f32>
) -> VertexOutput {
  ${data.VERT_INSERT}
  var output: VertexOutput;
  output.Position = MVPC_MATRIX * Position;
  output.FragUV = TexUV;
  return output;
}`;

/**
 * Génère le shader de fragments des sprites.
 *
 * @param data - Code WGSL à injecter dans le gabarit.
 * @returns Le code source WGSL du shader de fragments.
 */
export const SPRITE_FRAGMENT_SHADER = (data: any) => /* wgsl */`
struct FragOutput {
  @location(0) Base: vec4f,
  @location(1) Normal: vec4f,
  @location(2) Tag: vec4f,
  @location(3) Ch1: vec4f
}

@group(0) @binding(1) var<uniform> TAG: vec4<f32>;
@group(0) @binding(2) var<uniform> BLEND_COLOR: vec4<f32>;
@group(0) @binding(3) var<uniform> BLEND_COLOR_MODE: f32;
@group(1) @binding(0) var TEXTURE: texture_2d<f32>;
@group(1) @binding(1) var SAMPLER: sampler;

@fragment
fn main(
  @location(0) FragUV: vec2<f32>
) -> FragOutput {
  var flags = u32(TAG.a);
  var textureColor = textureSample(TEXTURE, SAMPLER, FragUV);
  
  if (textureColor.a == 0)
  {
    discard;
  }

  if (BLEND_COLOR_MODE == 1.0)
  {
    textureColor *= BLEND_COLOR;
  }
  else if (BLEND_COLOR_MODE == 2.0)
  {
    textureColor += BLEND_COLOR;    
  }

  ${data.FRAG_INSERT}

  var output: FragOutput;
  output.Normal = vec4(0.0, 0.0, 0.0, 0.0);
  output.Tag = TAG;

  if ((flags & 64) == 64)
  {
    output.Base = vec4(0.0, 0.0, 0.0, 0.0);
    output.Ch1 = textureColor;
  }
  else
  {
    output.Base = textureColor;
    output.Ch1 = vec4(0.0, 0.0, 0.0, 0.0);
  }

  return output;
}`;