/** Points d'insertion personnalisables des shaders de traînées. */
export const TRAIL_SHADER_INSERTS = {
  VERT_INSERT: '',
  FRAG_INSERT: ''
};

/** Nombre de composantes scalaires contenues dans un sommet de traînée. */
export const TRAIL_SHADER_VERTEX_ATTR_COUNT = 9;

/** Descripteur de la pipeline de rendu des traînées. */
export const TRAIL_PIPELINE_DESC: any = {
  label: 'Trail pipeline',
  layout: 'auto',
  vertex: {
    entryPoint: 'main',
    buffers: [{
      arrayStride: TRAIL_SHADER_VERTEX_ATTR_COUNT * 4,
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
        shaderLocation: 3, /*opacity*/
        offset: 8 * 4,
        format: 'float32'
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
    { format: 'rgba16float' }  // ch1
    ]
  },
  primitive: {
    topology: 'triangle-list',
    cullMode: 'none',
    frontFace: 'ccw'
  },
  depthStencil: {
    depthWriteEnabled: false,
    depthCompare: 'less',
    format: 'depth24plus'
  }
};

/**
 * Génère le shader de sommets des traînées.
 *
 * @param data - Code WGSL à injecter dans le gabarit.
 * @returns Le code source WGSL du shader de sommets.
 */
export const TRAIL_VERTEX_SHADER = (data: any) => /* wgsl */`
struct VertexOutput {
  @builtin(position) Position: vec4<f32>,
  @location(0) FragUV: vec2<f32>,
  @location(1) Color: vec4<f32>
};

@group(0) @binding(0) var<uniform> VPC_MATRIX: mat4x4<f32>;

@vertex
fn main(
  @location(0) Pos: vec3<f32>,
  @location(1) TexUV: vec2<f32>,
  @location(2) Color: vec3<f32>,
  @location(3) Opacity: f32
) -> VertexOutput {
  ${data.VERT_INSERT}

  var output: VertexOutput;
  output.Position = VPC_MATRIX * vec4<f32>(Pos, 1.0);
  output.FragUV = TexUV;
  output.Color = vec4(Color, Opacity);
  return output;
}`;

/**
 * Génère le shader de fragments des traînées.
 *
 * @param data - Code WGSL à injecter dans le gabarit.
 * @returns Le code source WGSL du shader de fragments.
 */
export const TRAIL_FRAGMENT_SHADER = (data: any) => /* wgsl */`
struct FragOutput {
  @location(0) Base: vec4f,
  @location(1) Normal: vec4f,
  @location(2) Tag: vec4f,
  @location(3) Ch1: vec4f
}

@group(1) @binding(0) var<uniform> TAG: vec4<f32>;
@group(2) @binding(0) var TEXTURE: texture_2d<f32>;
@group(2) @binding(1) var SAMPLER: sampler;

@fragment
fn main(
  @builtin(position) Position: vec4<f32>,
  @location(0) FragUV: vec2<f32>,
  @location(1) Color: vec4<f32>
) -> FragOutput {
  ${data.FRAG_INSERT}

  var output: FragOutput;
  output.Base = textureSample(TEXTURE, SAMPLER, FragUV) * Color;
  output.Normal = vec4(0.0, 0.0, 0.0, 0.0);
  output.Tag = TAG;
  output.Ch1 = vec4(0.0, 0.0, 0.0, 0.0);
  return output;
}`;