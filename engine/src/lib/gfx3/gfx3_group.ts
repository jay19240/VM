import { Gfx3Texture, Gfx3RenderingTexture } from './gfx3_texture';

const MIN_UNIFORM_BUFFER_OFFSET_ALIGNMENT = 256;

/**
 * Groupe de liaison unique qui associe des tampons et des textures à une pipeline GPU.
 */
export class Gfx3StaticGroup {
  device: GPUDevice;
  pipeline: GPURenderPipeline;
  groupIndex: number;
  usage: GPUBufferUsageFlags;
  uniformsByteLength: number;
  uniforms: Map<number, { binding: number, name: string, size: number, alignment: number }>;
  textures: Map<number, { binding: number, name: string, resource: GPUTextureView | GPUSampler }>;
  buffer: GPUBuffer;
  currentOffset: number;
  bindGroup: GPUBindGroup | null;

  /**
   * Crée un groupe de liaison statique pour une pipeline et un indice WGSL donnés.
   *
   * @param device - Périphérique WebGPU.
   * @param pipeline - Pipeline de rendu associée.
   * @param groupIndex - Indice `@group` du shader.
   * @param usage - Usages WebGPU du tampon de données.
   */
  constructor(device: GPUDevice, pipeline: GPURenderPipeline, groupIndex: number, usage: GPUBufferUsageFlags) {
    this.device = device;
    this.pipeline = pipeline;
    this.groupIndex = groupIndex;
    this.usage = usage;
    this.uniformsByteLength = 0;
    this.uniforms = new Map();
    this.textures = new Map();
    this.buffer = device.createBuffer({ size: 16 * 4, usage: this.usage });
    this.currentOffset = 0;
    this.bindGroup = null;
  }

  /**
   * Détruit le tampon GPU.
   * Attention : cette méthode doit être appelée explicitement pour libérer la ressource.
   */
  delete(): void {
    this.buffer.destroy();
  }

  /**
   * Déclare une entrée de nombres flottants et crée son tampon d'écriture côté CPU.
   *
   * @param binding - Indice `@binding` de l'entrée.
   * @param name - Nom indicatif de l'entrée.
   * @param length - Nombre de valeurs flottantes.
   * @returns Le tableau à remplir avant écriture.
   */
  setFloat(binding: number, name: string, length: number): Float32Array {
    const byteLength = length * 4;
    const alignment = Math.ceil(byteLength / 256) * MIN_UNIFORM_BUFFER_OFFSET_ALIGNMENT;
    this.uniforms.set(binding, { binding: binding, name: name, size: byteLength, alignment: alignment });
    this.uniformsByteLength += alignment;
    return new Float32Array(length);
  }

  /**
   * Déclare une entrée de stockage flottante sans alignement uniforme de 256 octets.
   *
   * @param binding - Indice `@binding` de l'entrée.
   * @param name - Nom indicatif de l'entrée.
   * @param length - Nombre de valeurs flottantes.
   * @returns Le tableau à remplir avant écriture.
   */
  setStorageFloat(binding: number, name: string, length: number): Float32Array {
    const byteLength = length * 4;
    this.uniforms.set(binding, { binding, name, size: byteLength, alignment: byteLength });
    this.uniformsByteLength += byteLength;
    return new Float32Array(length);
  }

  /**
   * Déclare une entrée d'entiers non signés et crée son tampon d'écriture côté CPU.
   *
   * @param binding - Indice `@binding` de l'entrée.
   * @param name - Nom indicatif de l'entrée.
   * @param length - Nombre d'entiers.
   * @returns Le tableau à remplir avant écriture.
   */
  setInteger(binding: number, name: string, length: number): Uint32Array {
    const byteLength = length * 4;
    const alignment = Math.ceil(byteLength / 256) * MIN_UNIFORM_BUFFER_OFFSET_ALIGNMENT;
    this.uniforms.set(binding, { binding: binding, name: name, size: byteLength, alignment: alignment });
    this.uniformsByteLength += alignment;
    return new Uint32Array(length);
  }

  /**
   * Déclare une entrée de stockage d'entiers non signés sans alignement uniforme de 256 octets.
   *
   * @param binding - Indice `@binding` de l'entrée.
   * @param name - Nom indicatif de l'entrée.
   * @param length - Nombre d'entiers.
   * @returns Le tableau à remplir avant écriture.
   */
  setStorageInteger(binding: number, name: string, length: number): Uint32Array {
    const byteLength = length * 4;
    this.uniforms.set(binding, { binding, name, size: byteLength, alignment: byteLength });
    this.uniformsByteLength += byteLength;
    return new Uint32Array(length);
  }

  /**
   * Lie une vue de texture à une entrée du groupe.
   *
   * @param binding - Indice `@binding` de l'entrée.
   * @param name - Nom indicatif de l'entrée.
   * @param texture - Texture à lier.
   * @param createViewDescriptor - Configuration de la vue de texture.
   * @returns La texture fournie.
   */
  setTexture(binding: number, name: string, texture: Gfx3Texture, createViewDescriptor: GPUTextureViewDescriptor = {}): Gfx3Texture {
    this.textures.set(binding, { binding: binding, name: name, resource: texture.gpuTexture.createView(createViewDescriptor) });
    return texture;
  }

  /**
   * Lie directement la vue d'une texture de rendu à une entrée du groupe.
   *
   * @param binding - Indice `@binding` de l'entrée.
   * @param name - Nom indicatif de l'entrée.
   * @param texture - Texture de rendu à lier.
   * @returns La texture fournie.
   */
  setRenderingTexture(binding: number, name: string, texture: Gfx3RenderingTexture): Gfx3RenderingTexture {
    this.textures.set(binding, { binding: binding, name: name, resource: texture.gpuTextureView });
    return texture;
  }

  /**
   * Lie l'échantillonneur d'une texture à une entrée du groupe.
   *
   * @param binding - Indice `@binding` de l'entrée.
   * @param name - Nom indicatif de l'entrée.
   * @param texture - Texture dont l'échantillonneur doit être lié.
   * @returns La texture fournie.
   */
  setSampler(binding: number, name: string, texture: Gfx3Texture): Gfx3Texture {
    this.textures.set(binding, { binding: binding, name: name, resource: texture.gpuSampler });
    return texture;
  }

  /**
   * Lie l'échantillonneur d'une texture de rendu à une entrée du groupe.
   *
   * @param binding - Indice `@binding` de l'entrée.
   * @param name - Nom indicatif de l'entrée.
   * @param texture - Texture de rendu dont l'échantillonneur doit être lié.
   * @returns La texture fournie.
   */
  setRenderingSampler(binding: number, name: string, texture: Gfx3RenderingTexture): Gfx3RenderingTexture {
    this.textures.set(binding, { binding: binding, name: name, resource: texture.gpuSampler });
    return texture;
  }

  /** Crée ou recrée le tampon GPU et le groupe de liaison à partir des entrées déclarées. */
  allocate(): void {
    if (this.buffer.size != this.uniformsByteLength) {
      this.buffer.destroy();
      this.buffer = this.device.createBuffer({ size: this.uniformsByteLength, usage: this.usage });
    }

    let entries: Array<GPUBindGroupEntry> = [];
    let offset = 0;

    for (const uniform of this.uniforms.values()) {
      entries[uniform.binding] = { binding: uniform.binding, resource: { buffer: this.buffer, offset: offset, size: uniform.size } };
      offset += uniform.alignment;
    }

    for (const texture of this.textures.values()) {
      entries[texture.binding] = { binding: texture.binding, resource: texture.resource };
    }

    this.bindGroup = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(this.groupIndex), entries: entries });
  }

  /** Réinitialise le curseur d'écriture avant de transférer les données des entrées. */
  beginWrite(): void {
    this.currentOffset = 0;
  }

  /**
   * Écrit les données d'une entrée uniforme à la position courante du tampon.
   *
   * @param binding - Indice de l'entrée, conservé pour l'interface d'appel.
   * @param data - Données flottantes ou entières à transférer.
   */
  write(binding: number, data: Float32Array | Uint32Array): void {
    this.device.queue.writeBuffer(this.buffer, this.currentOffset, data);
    this.currentOffset += Math.ceil(data.byteLength / 256) * MIN_UNIFORM_BUFFER_OFFSET_ALIGNMENT;
  }

  /**
   * Écrit une entrée de stockage sans ajouter d'alignement uniforme.
   *
   * @param binding - Indice de l'entrée, conservé pour l'interface d'appel.
   * @param data - Données à transférer.
   */
  writeStorage(binding: number, data: Float32Array | Uint32Array): void {
    this.device.queue.writeBuffer(this.buffer, this.currentOffset, data);
    this.currentOffset += data.byteLength;
  }

  /** Réinitialise le curseur et clôt la séquence d'écriture. */
  endWrite(): void {
    this.currentOffset = 0;
  }

  /** Renvoie le groupe de liaison alloué. */
  getBindGroup(): GPUBindGroup {
    return this.bindGroup!;
  }

  /**
   * Affecte une nouvelle pipeline ; `allocate` doit ensuite être rappelée.
   *
   * @param pipeline - Nouvelle pipeline de rendu.
   */
  setPipeline(pipeline: GPURenderPipeline): void {
    this.pipeline = pipeline;
  }
}

/**
 * Collection de groupes de liaison qui duplique une même disposition pour plusieurs objets rendus.
 */
export class Gfx3DynamicGroup {
  device: GPUDevice;
  pipeline: GPURenderPipeline;
  groupIndex: number;
  usage: GPUBufferUsageFlags;
  uniformsByteLength: number;
  uniforms: Map<number, { binding: number, name: string, size: number, alignment: number }>;
  buffer: GPUBuffer;
  currentOffset: number;
  bindGroups: Array<GPUBindGroup>;
  size: number;

  /**
   * Crée une collection de groupes de liaison pour une pipeline et un indice WGSL donnés.
   *
   * @param device - Périphérique WebGPU.
   * @param pipeline - Pipeline de rendu associée.
   * @param groupIndex - Indice `@group` du shader.
   * @param usage - Usages WebGPU du tampon de données.
   */
  constructor(device: GPUDevice, pipeline: GPURenderPipeline, groupIndex: number, usage: GPUBufferUsageFlags) {
    this.device = device;
    this.pipeline = pipeline;
    this.groupIndex = groupIndex;
    this.usage = usage;
    this.uniformsByteLength = 0;
    this.uniforms = new Map();
    this.buffer = device.createBuffer({ size: 16 * 4, usage: this.usage });
    this.currentOffset = 0;
    this.bindGroups = [];
    this.size = 0;
  }

  /**
   * Détruit le tampon GPU et oublie tous les groupes de liaison.
   * Attention : cette méthode doit être appelée explicitement pour libérer la ressource.
   */
  delete(): void {
    this.buffer.destroy();
    this.bindGroups = [];
  }

  /**
   * Déclare une entrée flottante commune à chaque groupe et crée son tampon d'écriture côté CPU.
   *
   * @param binding - Indice `@binding` de l'entrée.
   * @param name - Nom indicatif de l'entrée.
   * @param length - Nombre de valeurs flottantes.
   * @returns Le tableau à remplir avant écriture.
   */
  setFloat(binding: number, name: string, length: number): Float32Array {
    const byteLength = length * 4;
    const alignment = Math.ceil(byteLength / 256) * MIN_UNIFORM_BUFFER_OFFSET_ALIGNMENT;
    this.uniforms.set(binding, { binding: binding, name: name, size: byteLength, alignment: alignment });
    this.uniformsByteLength += alignment;
    return new Float32Array(length);
  }

  /**
   * Déclare une entrée de stockage flottante commune à chaque groupe.
   *
   * @param binding - Indice `@binding` de l'entrée.
   * @param name - Nom indicatif de l'entrée.
   * @param length - Nombre de valeurs flottantes.
   * @returns Le tableau à remplir avant écriture.
   */
  setStorageFloat(binding: number, name: string, length: number): Float32Array {
    const byteLength = length * 4;
    this.uniforms.set(binding, { binding, name, size: byteLength, alignment: byteLength });
    this.uniformsByteLength += byteLength;
    return new Float32Array(length);
  }

  /**
   * Déclare une entrée entière commune à chaque groupe et crée son tampon d'écriture côté CPU.
   *
   * @param binding - Indice `@binding` de l'entrée.
   * @param name - Nom indicatif de l'entrée.
   * @param length - Nombre d'entiers non signés.
   * @returns Le tableau à remplir avant écriture.
   */
  setInteger(binding: number, name: string, length: number): Uint32Array {
    const byteLength = length * 4;
    const alignment = Math.ceil(byteLength / 256) * MIN_UNIFORM_BUFFER_OFFSET_ALIGNMENT;
    this.uniforms.set(binding, { binding: binding, name: name, size: byteLength, alignment: alignment });
    this.uniformsByteLength += alignment;
    return new Uint32Array(length);
  }

  /**
   * Déclare une entrée de stockage d'entiers non signés commune à chaque groupe.
   *
   * @param binding - Indice `@binding` de l'entrée.
   * @param name - Nom indicatif de l'entrée.
   * @param length - Nombre d'entiers.
   * @returns Le tableau à remplir avant écriture.
   */
  setStorageInteger(binding: number, name: string, length: number): Uint32Array {
    const byteLength = length * 4;
    this.uniforms.set(binding, { binding, name, size: byteLength, alignment: byteLength });
    this.uniformsByteLength += byteLength;
    return new Uint32Array(length);
  }

  /**
   * Crée plusieurs groupes de liaison partageant la même disposition d'entrées.
   *
   * @param size - Nombre de groupes à allouer.
   */
  allocate(size: number = 1): void {
    this.bindGroups = [];

    if (this.buffer.size != size * this.uniformsByteLength) {
      this.buffer.destroy();
      this.buffer = this.device.createBuffer({ size: size * this.uniformsByteLength, usage: this.usage });
    }

    for (let i = 0, offset = 0, entries: Array<GPUBindGroupEntry> = []; i < size; i++) {
      for (const uniform of this.uniforms.values()) {
        entries[uniform.binding] = { binding: uniform.binding, resource: { buffer: this.buffer, offset: offset, size: uniform.size } };
        offset += uniform.alignment;
      }

      this.bindGroups.push(this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(this.groupIndex), entries: entries }));
    }

    this.size = size;
  }

 /** Réinitialise le curseur d'écriture avant de remplir les groupes successifs. */
  beginWrite(): void {
    this.currentOffset = 0;
  }

  /**
   * Écrit les données d'une entrée uniforme à la position courante du tampon partagé.
   *
   * @param binding - Indice de l'entrée, conservé pour l'interface d'appel.
   * @param data - Données flottantes ou entières à transférer.
   */
  write(binding: number, data: Float32Array | Uint32Array): void {
    this.device.queue.writeBuffer(this.buffer, this.currentOffset, data);
    this.currentOffset += Math.ceil(data.byteLength / 256) * MIN_UNIFORM_BUFFER_OFFSET_ALIGNMENT;
  }

  /**
   * Écrit une entrée de stockage sans ajouter d'alignement uniforme.
   *
   * @param binding - Indice de l'entrée, conservé pour l'interface d'appel.
   * @param data - Données à transférer.
   */
  writeStorage(binding: number, data: Float32Array | Uint32Array): void {
    this.device.queue.writeBuffer(this.buffer, this.currentOffset, data);
    this.currentOffset += data.byteLength;
  }

  /** Réinitialise le curseur et clôt la séquence d'écriture. */
  endWrite(): void {
    this.currentOffset = 0;
  }

  /**
   * Renvoie l'un des groupes de liaison alloués.
   *
   * @param index - Indice du groupe.
   * @returns Le groupe correspondant.
   */
  getBindGroup(index: number = 0): GPUBindGroup {
    return this.bindGroups[index];
  }

  /** Renvoie le nombre de groupes de liaison alloués. */
  getSize(): number {
    return this.size;
  }

  /**
   * Affecte une nouvelle pipeline ; `allocate` doit ensuite être rappelée.
   *
   * @param pipeline - Nouvelle pipeline de rendu.
   */
  setPipeline(pipeline: GPURenderPipeline): void {
    this.pipeline = pipeline;
  }
}