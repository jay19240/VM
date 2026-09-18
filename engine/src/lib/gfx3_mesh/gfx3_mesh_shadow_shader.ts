import { MESH_SHADER_VERTEX_ATTR_COUNT } from './gfx3_mesh_shader';

/** Décrit le pipeline WebGPU utilisé pour générer la carte d'ombres des maillages. */
export const MESH_SHADOW_PIPELINE_DESC: any = {
  label: 'Mesh Shadow pipeline',
  layout: 'auto',
  vertex: {
    entryPoint: 'main',
    buffers: [{
      arrayStride: MESH_SHADER_VERTEX_ATTR_COUNT * 4,
      attributes: [{
        shaderLocation: 0, /* position */
        offset: 0,
        format: 'float32x3'
      }]
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
    format: 'depth32float'
  }
};

/**
 * Génère le shader de sommets WGSL de la carte d'ombres.
 *
 * @param data - Données du modèle de shader, actuellement inutilisées.
 * @returns Le code source WGSL du shader de sommets.
 */
export const MESH_SHADOW_VERTEX_SHADER = (data: any) => `
@group(0) @binding(0) var<uniform> LVP_MATRIX: mat4x4<f32>;
@group(0) @binding(1) var<uniform> M_MATRIX: mat4x4<f32>;

@vertex
fn main(
  @location(0) position: vec3<f32>
) -> @builtin(position) vec4<f32> {
  return LVP_MATRIX * M_MATRIX * vec4(position, 1.0);
}`;