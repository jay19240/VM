import { gfx3Manager } from '../gfx3/gfx3_manager';
import { gfx3MipmapManager } from '../gfx3/gfx3_mipmap_manager';
import { Gfx3Texture } from '../gfx3/gfx3_texture';
import { NOISE_SHADER_CODE } from './gfx3_noise_shader';

/** Couleur de palette exprimée en notation CSS hexadécimale ou en triplet RVB normalisé. */
export type Gfx3NoiseColor = string | [number, number, number];

/** Paramètres qui pilotent la forme, l'animation et la palette du bruit procédural. */
export interface Gfx3NoiseParams {
  colors?: Array<Gfx3NoiseColor>;
  scale?: number;
  speed?: number;
  time?: number;
  numBands?: number;
  warpStrength?: number;
  smoothness?: number;
  showContours?: boolean;
  greyscaleMode?: boolean;
};

/** Options de création de la texture GPU qui reçoit le bruit procédural. */
export interface Gfx3NoiseTextureOptions {
  format?: GPUTextureFormat;
  generateMipmap?: boolean;
  samplerDescriptor?: GPUSamplerDescriptor;
};

const PARAMS_FLOAT_COUNT = 36;

const DEFAULT_PARAMS: Required<Gfx3NoiseParams> = {
  colors: ['#d9eda5', '#8cd4c4', '#fae684', '#eba86b', '#a18c70', '#6b545e'],
  scale: 3.5,
  speed: 0.15,
  time: 0.0,
  numBands: 12.0,
  warpStrength: 1.2,
  smoothness: 1.0,
  showContours: false,
  greyscaleMode: false
};

/** Générateur singleton de textures de bruit procédural sur GPU. */
export class Gfx3NoiseManager {
  device: GPUDevice;
  shaderModule: GPUShaderModule;
  pipelines: Map<GPUTextureFormat, GPURenderPipeline>;

  /** Initialise le module de shader et le cache de pipelines à partir du périphérique WebGPU courant. */
  constructor() {
    this.device = gfx3Manager.getDevice();
    this.shaderModule = this.device.createShaderModule({ code: NOISE_SHADER_CODE });
    this.pipelines = new Map<GPUTextureFormat, GPURenderPipeline>();
  }

  /**
   * Crée et remplit une texture GPU avec du bruit procédural, puis génère éventuellement ses mipmaps.
   *
   * @param width - Largeur de la texture en pixels.
   * @param height - Hauteur de la texture en pixels.
   * @param params - Paramètres de génération du bruit.
   * @param options - Options de création de la texture et de son échantillonneur.
   * @returns La texture GPU générée et son échantillonneur.
   */
  createNoiseTexture(width: number, height: number, params: Gfx3NoiseParams = {}, options: Gfx3NoiseTextureOptions = {}): Gfx3Texture {
    const format = options.format ?? 'rgba8unorm';
    const generateMips = options.generateMipmap ?? true;
    const mipLevelCount = generateMips ? NUM_MIP_LEVELS(width, height) : 1;

    const gpuTexture = this.device.createTexture({
      format: format,
      mipLevelCount: mipLevelCount,
      size: [width, height],
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC
    });

    const paramsBuffer = this.device.createBuffer({
      size: PARAMS_FLOAT_COUNT * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.device.queue.writeBuffer(paramsBuffer, 0, this.#packParams(params, width, height));

    const pipeline = this.#getPipeline(format);
    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: paramsBuffer } }]
    });

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: gpuTexture.createView({ baseMipLevel: 0, mipLevelCount: 1 }),
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);
    pass.end();

    this.device.queue.submit([encoder.finish()]);
    paramsBuffer.destroy();

    const samplerDescriptor = options.samplerDescriptor ?? {};
    const gpuSampler = this.device.createSampler(Object.assign(samplerDescriptor, {
      magFilter: samplerDescriptor.magFilter ?? 'linear',
      minFilter: samplerDescriptor.minFilter ?? 'linear',
      mipmapFilter: samplerDescriptor.mipmapFilter ?? 'linear',
      addressModeU: samplerDescriptor.addressModeU ?? 'repeat',
      addressModeV: samplerDescriptor.addressModeV ?? 'repeat'
    }));

    if (mipLevelCount > 1) {
      gfx3MipmapManager.generateMipmap(gpuTexture);
    }

    return { gpuTexture: gpuTexture, gpuSampler: gpuSampler };
  }

  /**
   * Régénère le bruit procédural dans une texture existante sans la réallouer.
   *
   * @param texture - Texture de destination créée avec l'usage `RENDER_ATTACHMENT`.
   * @param params - Nouveaux paramètres de génération du bruit.
   */
  regenerateNoiseTexture(texture: Gfx3Texture, params: Gfx3NoiseParams = {}): void {
    const gpuTexture = texture.gpuTexture;
    const width = gpuTexture.width;
    const height = gpuTexture.height;

    const paramsBuffer = this.device.createBuffer({
      size: PARAMS_FLOAT_COUNT * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.device.queue.writeBuffer(paramsBuffer, 0, this.#packParams(params, width, height));

    const pipeline = this.#getPipeline(gpuTexture.format);
    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: paramsBuffer } }]
    });

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: gpuTexture.createView({ baseMipLevel: 0, mipLevelCount: 1 }),
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);
    pass.end();

    this.device.queue.submit([encoder.finish()]);
    paramsBuffer.destroy();

    if (gpuTexture.mipLevelCount > 1) {
      gfx3MipmapManager.generateMipmap(gpuTexture);
    }
  }

  #getPipeline(format: GPUTextureFormat): GPURenderPipeline {
    const found = this.pipelines.get(format);
    if (found) {
      return found;
    }

    const pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: this.shaderModule,
        entryPoint: 'vs'
      },
      fragment: {
        module: this.shaderModule,
        entryPoint: 'fs',
        targets: [{ format: format }]
      }
    });

    this.pipelines.set(format, pipeline);
    return pipeline;
  }

  #packParams(params: Gfx3NoiseParams, width: number, height: number): Float32Array {
    const p = { ...DEFAULT_PARAMS, ...params };
    const data = new Float32Array(PARAMS_FLOAT_COUNT);

    for (let i = 0; i < 6; i++) {
      const c = p.colors[i] ?? DEFAULT_PARAMS.colors[i];
      const rgb = typeof c === 'string' ? HEX_TO_RGB(c) : c;
      data[i * 4 + 0] = rgb[0];
      data[i * 4 + 1] = rgb[1];
      data[i * 4 + 2] = rgb[2];
      data[i * 4 + 3] = 1.0;
    }

    data[24] = width;
    data[25] = height;
    data[26] = p.scale;
    data[27] = p.speed;
    data[28] = p.time;
    data[29] = p.numBands;
    data[30] = p.warpStrength;
    data[31] = p.smoothness;
    data[32] = p.showContours ? 1.0 : 0.0;
    data[33] = p.greyscaleMode ? 1.0 : 0.0;
    return data;
  }
}

/** Instance partagée du générateur de textures de bruit procédural. */
export const gfx3NoiseManager = new Gfx3NoiseManager();

// -------------------------------------------------------------------------------------------
// HELPFUL
// -------------------------------------------------------------------------------------------

function NUM_MIP_LEVELS(...sizes: Array<number>): number {
  const maxSize = Math.max(...sizes);
  return 1 + Math.log2(maxSize) | 0;
}

function HEX_TO_RGB(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255
  ];
}
