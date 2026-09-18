/** Nombre de composantes scalaires contenues dans un sommet de volume d'ombre. */
export const SV_SHADER_VERTEX_ATTR_COUNT = 6;

/** Nombre d'attributs uniformes employés par le shader de volume d'ombre. */
export const SV_UNIFORM_ATTR_COUNT = 1;

/** Descripteur de la pipeline qui traite les faces orientées dans le sens horaire. */
export const SV_PIPELINE_CW_DESC: any = {
  label: 'Mesh Shadow Volume CW pipeline',
  layout: 'auto',
  vertex: {
    entryPoint: 'main',
    buffers: [{
      arrayStride: SV_SHADER_VERTEX_ATTR_COUNT * 4,
      attributes: [{
        shaderLocation: 0, /* position */
        offset: 0,
        format: 'float32x3'
      },{
        shaderLocation: 1, /* colors */
        offset: 3 * 4,
        format: 'float32x3'
      }]
    }]
  },
  fragment: {
    entryPoint: 'main',
    targets: [{
      format: 'rgba16float'
    }]
  },
  primitive: {
    topology: 'triangle-list',
    cullMode: 'back',
    frontFace: 'cw'
  },
  depthStencil: {
    depthWriteEnabled: true,
    depthCompare: 'less',
    format: 'depth24plus'
  }
};

/** Descripteur de la pipeline qui traite les faces orientées dans le sens antihoraire. */
export const SV_PIPELINE_CCW_DESC: any = {
  label: 'Mesh Shadow Volume CCW pipeline',
  layout: 'auto',
  vertex: {
    entryPoint: 'main',
    buffers: [{
      arrayStride: SV_SHADER_VERTEX_ATTR_COUNT * 4,
      attributes: [{
        shaderLocation: 0, /* position */
        offset: 0,
        format: 'float32x3'
      },{
        shaderLocation: 1, /* colors */
        offset: 3 * 4,
        format: 'float32x3'
      }]
    }]
  },
  fragment: {
    entryPoint: 'main',
    targets: [{
      format: 'rgba16float'
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

/** Code source WGSL du shader de sommets des volumes d'ombre. */
export const SV_VERTEX_SHADER = `
struct VertexOutput {
  @builtin(position) Position: vec4<f32>,
  @location(0) Color: vec3<f32>
}

@group(0) @binding(0) var<uniform> MVPC_MATRIX: mat4x4<f32>;

@vertex
fn main(
  @location(0) Position: vec4<f32>,
  @location(1) Color: vec3<f32>
) -> VertexOutput {
  var output: VertexOutput;
  output.Position = MVPC_MATRIX * Position;
  output.Color = Color;
  return output;
}`;

/** Code source WGSL du shader de fragments des volumes d'ombre. */
export const SV_FRAGMENT_SHADER = /* wgsl */`
@fragment
fn main(
  @builtin(position) Position: vec4<f32>,
  @location(0) Color: vec3<f32>
) -> @location(0) vec4f {
  return vec4<f32>(Color.r, Color.g, Color.b, 1.0);
}`;