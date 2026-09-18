/** Regroupe une texture GPU et l'échantillonneur qui lui est associé. */
export interface Gfx3Texture {
  gpuTexture: GPUTexture;
  gpuSampler: GPUSampler;
};

/** Texture GPU destinée au rendu, accompagnée de son échantillonneur et de sa vue. */
export interface Gfx3RenderingTexture {
  gpuTexture: GPUTexture;
  gpuSampler: GPUSampler;
  gpuTextureView: GPUTextureView
};