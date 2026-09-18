import { coreManager } from '../core/core_manager';
import { eventManager } from '../core/event_manager';
import { UT } from '../core/utils';
import { Gfx3View } from './gfx3_view';
import { Gfx3Texture, Gfx3RenderingTexture } from './gfx3_texture';
import { Gfx3StaticGroup, Gfx3DynamicGroup } from './gfx3_group';

/** Référence une portion du tampon global de sommets et sa copie côté CPU. */
export interface Gfx3VertexSubBuffer {
  vertices: Float32Array;
  offset: number;
};

/** Gestionnaire singleton du contexte WebGPU, des vues, des pipelines et du tampon global de sommets. */
class Gfx3Manager {
  adapter: GPUAdapter;
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  ctx: GPUCanvasContext;
  renderingTextureView: GPUTextureView | null;
  renderingTextureSampler: GPUSampler | null;
  destinationTexture: Gfx3RenderingTexture | null;
  normalsTexture: Gfx3RenderingTexture;
  tagsTexture: Gfx3RenderingTexture;
  depthTexture: Gfx3RenderingTexture;
  channel1Texture: Gfx3RenderingTexture;
  commandEncoder: GPUCommandEncoder;
  passEncoder: GPURenderPassEncoder;
  pipelines: Map<string, GPURenderPipeline>;
  vertexBuffer: GPUBuffer;
  vertexSubBuffers: Array<Gfx3VertexSubBuffer>;
  vertexSubBuffersSize: number;
  vertexSubBuffersChanged: Array<Gfx3VertexSubBuffer>;
  views: Array<Gfx3View>;
  currentView: Gfx3View;
  lastRenderStart: number;
  lastRenderTime: number;

  /** Initialise l'état interne avant la création asynchrone du contexte WebGPU. */
  constructor() {
    this.adapter = {} as GPUAdapter;
    this.device = {} as GPUDevice;
    this.canvas = {} as HTMLCanvasElement;
    this.ctx = {} as GPUCanvasContext;

    this.renderingTextureView = null;
    this.renderingTextureSampler = null;
    this.destinationTexture = null;
    this.normalsTexture = {} as Gfx3RenderingTexture;
    this.tagsTexture = {} as Gfx3RenderingTexture;
    this.depthTexture = {} as Gfx3RenderingTexture;
    this.channel1Texture = {} as Gfx3RenderingTexture;

    this.commandEncoder = {} as GPUCommandEncoder;
    this.passEncoder = {} as GPURenderPassEncoder;
    this.pipelines = new Map<string, GPURenderPipeline>();
    this.vertexBuffer = {} as GPUBuffer;
    this.vertexSubBuffers = [];
    this.vertexSubBuffersSize = 0;
    this.vertexSubBuffersChanged = [];
    this.views = [];
    this.currentView = new Gfx3View();
    this.lastRenderStart = 0;
    this.lastRenderTime = 0;
  }

  /**
   * Initialise le contexte WebGPU, les textures d'attachement et la première vue.
   * Cette méthode est réservée à l'initialisation interne du module.
   *
   * @returns Une promesse résolue lorsque le contexte est prêt.
   * @throws Une erreur si WebGPU est indisponible ou désactivé, si le périphérique est perdu, ou si le canevas 3D est introuvable ou incompatible.
   */
  async initialize() {
    if (!navigator.gpu) {
      UT.FAIL('This browser does not support webgpu');
      throw new Error('Gfx3Manager::Gfx3Manager: WebGPU cannot be initialized - navigator.gpu not found');
    }

    this.adapter = (await navigator.gpu.requestAdapter())!;
    if (!this.adapter) {
      UT.FAIL('This browser appears to support WebGPU but it\'s disabled');
      throw new Error('Gfx3Manager::Gfx3Manager: WebGPU cannot be initialized - Adapter not found');
    }

    this.device = await this.adapter.requestDevice();
    this.device.lost.then(() => {
      throw new Error('Gfx3Manager::Gfx3Manager: WebGPU cannot be initialized - Device has been lost');
    });

    this.canvas = <HTMLCanvasElement>document.getElementById('CANVAS_3D')!;
    if (!this.canvas) {
      throw new Error('Gfx3Manager::Gfx3Manager: CANVAS_3D not found');
    }

    this.ctx = this.canvas.getContext('webgpu')!;
    if (!this.ctx) {
      throw new Error('Gfx3Manager::Gfx3Manager: WebGPU cannot be initialized - Canvas does not support WebGPU');
    }

    this.ctx.configure({
      device: this.device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'opaque'
    });

    const devicePixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
    this.renderingTextureSampler = this.device.createSampler();
    this.currentView = this.createView();

    this.normalsTexture = this.createRenderingTexture('rgba16float');
    this.tagsTexture = this.createRenderingTexture('rgba16float');
    this.depthTexture = this.createRenderingTexture('depth24plus');
    this.channel1Texture = this.createRenderingTexture('rgba16float');
    this.vertexBuffer = this.device.createBuffer({ size: 0, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });

    eventManager.subscribe(coreManager, 'E_RESIZE', this, this.#handleWindowResize);
  }

  /** Ouvre la phase de soumission des objets dessinables ; doit précéder les appels de dessin. */
  beginDrawing(): void { }

  /** Ferme la phase de dessin et synchronise les sous-tampons modifiés avec le tampon GPU global. */
  endDrawing() {
    if (this.vertexSubBuffersSize > 0 && this.vertexSubBuffersSize != this.vertexBuffer.size) {
      this.vertexBuffer.destroy();
      this.vertexBuffer = this.device.createBuffer({ size: this.vertexSubBuffersSize, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });

      for (const sub of this.vertexSubBuffers) {
        this.device.queue.writeBuffer(this.vertexBuffer, sub.offset, sub.vertices);
      }

      this.vertexSubBuffersChanged = [];
      return;
    }

    for (const subBufChanged of this.vertexSubBuffersChanged) {
      this.device.queue.writeBuffer(this.vertexBuffer, subBufChanged.offset, subBufChanged.vertices);
    }

    this.vertexSubBuffersChanged = [];
  }

  /** Crée l'encodeur de commandes et démarre la mesure de la phase de rendu. */
  beginRender(): void {
    this.commandEncoder = this.device.createCommandEncoder();
    this.lastRenderStart = Date.now();
  }

  /**
   * Ouvre une passe de rendu pour une vue et configure ses attachements, son viewport et son rectangle de découpe.
   *
   * @param viewIndex - Indice de la vue à rendre.
   */
  beginPassRender(viewIndex: number): void {
    const view = this.views[viewIndex];
    const viewport = view.getViewport();
    const viewportX = this.canvas.width * viewport.xFactor;
    const viewportY = this.canvas.height * viewport.yFactor;
    const viewportWidth = this.canvas.width * viewport.widthFactor;
    const viewportHeight = this.canvas.height * viewport.heightFactor;
    const viewBgColor = view.getBgColor();

    this.renderingTextureView = this.ctx.getCurrentTexture().createView();
    const textureView = this.destinationTexture ? this.destinationTexture.gpuTextureView : this.renderingTextureView!;

    this.passEncoder = this.commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: viewBgColor[0], g: viewBgColor[1], b: viewBgColor[2], a: viewBgColor[3] },
        loadOp: 'clear',
        storeOp: 'store'
      }, {
        view: this.normalsTexture.gpuTextureView,
        clearValue: { r: 0.0, g: 0.0, b: 1.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }, {
        view: this.tagsTexture.gpuTextureView,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }, {
        view: this.channel1Texture.gpuTextureView,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }],
      depthStencilAttachment: {
        view: this.depthTexture.gpuTextureView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store'
      }
    });

    this.currentView = view;
    this.passEncoder.setViewport(viewportX, viewportY, viewportWidth, viewportHeight, 0, 1);
    this.passEncoder.setScissorRect(viewportX, viewportY, viewportWidth, viewportHeight);
  }

  /** Termine la passe de rendu courante. */
  endPassRender(): void {
    this.passEncoder.end();
  }

  /** Soumet les commandes au GPU et enregistre la durée d'encodage de la phase de rendu. */
  endRender(): void {
    this.device.queue.submit([this.commandEncoder.finish()]);
    this.lastRenderTime = Date.now() - this.lastRenderStart;
  }

  /**
   * Crée une pipeline de rendu à partir des sources WGSL, ou renvoie la pipeline déjà mise en cache.
   *
   * @param id - Identifiant unique de la pipeline.
   * @param vertexShader - Code WGSL du shader de sommets.
   * @param fragmentShader - Code WGSL du shader de fragments.
   * @param pipelineDesc - Descripteur WebGPU de la pipeline.
   * @returns La pipeline correspondante.
   */
  loadPipeline(id: string, vertexShader: string, fragmentShader: string, pipelineDesc: GPURenderPipelineDescriptor): GPURenderPipeline {
    if (this.pipelines.has(id)) {
      return this.pipelines.get(id)!;
    }

    if (pipelineDesc.vertex) {
      pipelineDesc.vertex.module = this.device.createShaderModule({
        code: vertexShader
      });
    }

    if (pipelineDesc.fragment) {
      pipelineDesc.fragment.module = this.device.createShaderModule({
        code: fragmentShader
      });
    }

    const pipeline = this.device.createRenderPipeline(pipelineDesc);
    this.pipelines.set(id, pipeline);
    return pipeline;
  }

  /**
   * Retire une pipeline du cache.
   *
   * @param id - Identifiant de la pipeline.
   * @throws Une erreur si l'identifiant est inconnu.
   */
  deletePipeline(id: string): void {
    if (!this.pipelines.has(id)) {
      throw new Error('Gfx3Manager::deletePipeline(): pipeline not found !');
    }

    this.pipelines.delete(id);
  }

  /**
   * Recherche une pipeline dans le cache.
   *
   * @param id - Identifiant de la pipeline.
   * @returns La pipeline trouvée.
   * @throws Une erreur si l'identifiant est inconnu.
   */
  getPipeline(id: string): GPURenderPipeline {
    if (!this.pipelines.has(id)) {
      throw new Error('Gfx3Manager::getPipeline(): pipeline not found !');
    }

    return this.pipelines.get(id)!;
  }

  /**
   * Réserve une portion logique du tampon global de sommets.
   *
   * @param size - Nombre de composantes scalaires à réserver.
   * @returns La référence au sous-tampon créé.
   */
  createVertexBuffer(size: number): Gfx3VertexSubBuffer {
    const sub: Gfx3VertexSubBuffer = {
      vertices: new Float32Array(size),
      offset: this.vertexSubBuffersSize
    };

    this.vertexSubBuffers.push(sub);
    this.vertexSubBuffersSize += size * 4;
    return sub;
  }

  /**
   * Supprime un sous-tampon et recalcule les décalages des portions suivantes.
   *
   * @param sub - Sous-tampon à supprimer.
   */
  destroyVertexBuffer(sub: Gfx3VertexSubBuffer): void {
    const index = this.vertexSubBuffers.indexOf(sub);
    this.vertexSubBuffers.splice(index, 1);

    for (const item of this.vertexSubBuffers) {
      if (item.offset > sub.offset) {
        item.offset -= sub.vertices.byteLength;
      }
    }

    this.vertexSubBuffersSize -= sub.vertices.byteLength;
  }

  /** Détruit et réinitialise le tampon global ainsi que toutes ses portions logiques. */
  flushVertexBuffers(): void {
    this.vertexSubBuffers = [];
    this.vertexSubBuffersSize = 0;
    this.vertexBuffer.destroy();
    this.vertexBuffer = this.device.createBuffer({ size: 0, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }

  /**
   * Met à jour la copie CPU d'un sous-tampon et programme son transfert au GPU.
   *
   * @param sub - Sous-tampon cible.
   * @param vertices - Composantes de sommets à écrire.
   */
  writeVertexBuffer(sub: Gfx3VertexSubBuffer, vertices: Array<number>): void {
    sub.vertices.set(vertices);
    this.vertexSubBuffersChanged.push(sub);
  }

  /**
   * Crée un groupe de liaison statique pour une pipeline.
   *
   * @param pipelineId - Identifiant de la pipeline.
   * @param groupIndex - Indice `@group` dans le shader.
   * @param usage - Usages WebGPU du tampon associé.
   * @returns Le groupe statique créé.
   * @throws Une erreur si la pipeline est inconnue.
   */
  createStaticGroup(pipelineId: string, groupIndex: number, usage: GPUBufferUsageFlags = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST): Gfx3StaticGroup {
    return new Gfx3StaticGroup(this.device, this.getPipeline(pipelineId), groupIndex, usage);
  }

  /**
   * Crée un groupe de liaison dynamique pour une pipeline.
   *
   * @param pipelineId - Identifiant de la pipeline.
   * @param groupIndex - Indice `@group` dans le shader.
   * @param usage - Usages WebGPU du tampon associé.
   * @returns Le groupe dynamique créé.
   * @throws Une erreur si la pipeline est inconnue.
   */
  createDynamicGroup(pipelineId: string, groupIndex: number, usage: GPUBufferUsageFlags = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST): Gfx3DynamicGroup {
    return new Gfx3DynamicGroup(this.device, this.getPipeline(pipelineId), groupIndex, usage);
  }

  /**
   * Crée une texture destinée aux attachements de rendu.
   *
   * @param format - Format WebGPU de la texture.
   * @param samplerDescriptor - Configuration de l'échantillonneur.
   * @param width - Largeur en pixels.
   * @param height - Hauteur en pixels.
   * @returns La texture de rendu, sa vue et son échantillonneur.
   */
  createRenderingTexture(format: GPUTextureFormat = navigator.gpu.getPreferredCanvasFormat(), samplerDescriptor: GPUSamplerDescriptor = { magFilter: 'nearest', minFilter: 'nearest' }, width: number = this.getWidth(), height: number = this.getHeight()): Gfx3RenderingTexture {
    const texture = this.createEmptyTexture(width, height, format, samplerDescriptor);
    return { gpuTexture: texture.gpuTexture, gpuSampler: texture.gpuSampler, gpuTextureView: texture.gpuTexture.createView() };
  }

  /**
   * Crée une texture GPU vide avec les dimensions et le format indiqués.
   *
   * @param width - Largeur en pixels.
   * @param height - Hauteur en pixels.
   * @param format - Format WebGPU des texels.
   * @param samplerDescriptor - Configuration de l'échantillonneur.
   * @returns La texture et son échantillonneur.
   */
  createEmptyTexture(width: number, height: number, format: GPUTextureFormat, samplerDescriptor: GPUSamplerDescriptor = {}): Gfx3Texture {
    const gpuTexture = this.device.createTexture({
      size: [width, height],
      format: format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    const defaultSamplerDescriptor: GPUSamplerDescriptor = {
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat'
    };

    const gpuSampler = this.device.createSampler({ ...defaultSamplerDescriptor, ...samplerDescriptor });
    return { gpuTexture: gpuTexture, gpuSampler: gpuSampler };
  }

  /**
   * Crée une texture GPU depuis une image ou un canevas, ou une texture transparente de 1 × 1 pixel par défaut.
   *
   * @param bitmap - Image source facultative.
   * @param is8bit - Utilise le format monochrome 8 bits lorsque cette valeur vaut `true`.
   * @param samplerDescriptor - Configuration de l'échantillonneur.
   * @returns La texture et son échantillonneur.
   */
  createTextureFromBitmap(bitmap?: ImageBitmap | HTMLCanvasElement, is8bit: boolean = false, samplerDescriptor: GPUSamplerDescriptor = {}): Gfx3Texture {
    if (!bitmap) {
      const canvas = document.createElement('canvas');
      canvas.getContext('2d');
      canvas.width = 1;
      canvas.height = 1;
      bitmap = canvas;
    }

    const gpuTexture = this.device.createTexture({
      size: [bitmap.width, bitmap.height],
      format: is8bit ? 'r8unorm' : 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    this.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: gpuTexture }, [bitmap.width, bitmap.height]);

    const gpuSampler = this.device.createSampler(Object.assign(samplerDescriptor, {
      magFilter: samplerDescriptor.magFilter ?? 'linear',
      minFilter: samplerDescriptor.minFilter ?? 'linear',
      addressModeU: samplerDescriptor.addressModeU ?? 'repeat',
      addressModeV: samplerDescriptor.addressModeV ?? 'repeat'
    }));

    return { gpuTexture: gpuTexture, gpuSampler: gpuSampler };
  }

  /**
   * Crée une texture vide destinée à recevoir les images d'une vidéo HTML.
   * Son échantillonneur se répète par défaut pour permettre un pavage continu.
   *
   * @param width - Largeur de la vidéo.
   * @param height - Hauteur de la vidéo.
   * @param samplerDescriptor - Configuration personnalisée de l'échantillonneur.
   * @returns La texture et son échantillonneur.
   */
  createVideoTexture(width: number, height: number, samplerDescriptor: GPUSamplerDescriptor = {}): Gfx3Texture {
    const gpuTexture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    const gpuSampler = this.device.createSampler(Object.assign(samplerDescriptor, {
      magFilter: samplerDescriptor.magFilter ?? 'linear',
      minFilter: samplerDescriptor.minFilter ?? 'linear',
      addressModeU: samplerDescriptor.addressModeU ?? 'repeat',
      addressModeV: samplerDescriptor.addressModeV ?? 'repeat'
    }));

    return { gpuTexture, gpuSampler };
  }

  /**
   * Copie l'image courante d'une vidéo prête dans une texture existante.
   * Appelez cette méthode avant de rendre les objets qui utilisent la texture vidéo.
   *
   * @param texture - Texture créée par `createVideoTexture`.
   * @param video - Élément vidéo source.
   */
  updateVideoTexture(texture: Gfx3Texture, video: HTMLVideoElement): void {
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      this.device.queue.copyExternalImageToTexture(
        { source: video as any },
        { texture: texture.gpuTexture },
        [video.videoWidth, video.videoHeight]
      );
    }
  }

  /**
   * Crée une cubemap depuis six images ou canevas de mêmes dimensions.
   * En l'absence de source, six faces de 1 × 1 pixel sont créées.
   *
   * @param bitmaps - Images des six faces.
   * @returns La cubemap et son échantillonneur.
   */
  createCubeMapFromBitmap(bitmaps?: Array<ImageBitmap | HTMLCanvasElement>): Gfx3Texture {
    if (!bitmaps || bitmaps.length == 0) {
      const canvas = document.createElement('canvas');
      canvas.getContext('2d');
      canvas.width = 1;
      canvas.height = 1;
      bitmaps = [];
      for (let i = 0; i < 6; i++) {
        bitmaps.push(canvas);
      }
    }

    const cubemapTexture = this.device.createTexture({
      dimension: '2d',
      // Create a 2d array texture.
      // Assume each image has the same size.
      size: [bitmaps[0].width, bitmaps[0].height, 6],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    for (let i = 0; i < bitmaps.length; i++) {
      const imageBitmap = bitmaps[i];
      this.device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture: cubemapTexture, origin: [0, 0, i] },
        [imageBitmap.width, imageBitmap.height]
      );
    }

    const gpuSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear'
    });

    return { gpuTexture: cubemapTexture, gpuSampler: gpuSampler };
  }

  /**
   * Définit la propriété CSS `filter` du canevas 3D.
   *
   * @param filter - Valeur CSS permettant notamment flou, luminosité, contraste ou niveaux de gris.
   */
  setFilter(filter: string): void {
    this.canvas.style.filter = filter;
  }

  /** Indique si un filtre CSS actif est appliqué au canevas. */
  hasFilter(): boolean {
    return this.canvas.style.filter != '' && this.canvas.style.filter != 'none';
  }

  /** Renvoie la largeur du canevas en pixels CSS. */
  getClientWidth(): number {
    return this.canvas.clientWidth;
  }

  /** Renvoie la hauteur du canevas en pixels CSS. */
  getClientHeight(): number {
    return this.canvas.clientHeight;
  }

  /** Renvoie la largeur de rendu en pixels physiques. */
  getWidth(): number {
    const devicePixelRatio = window.devicePixelRatio || 1;
    return this.canvas.clientWidth * devicePixelRatio;
  }

  /** Renvoie la hauteur de rendu en pixels physiques. */
  getHeight(): number {
    const devicePixelRatio = window.devicePixelRatio || 1;
    return this.canvas.clientHeight * devicePixelRatio;
  }

  /** Renvoie le contexte WebGPU du canevas. */
  getContext(): GPUCanvasContext {
    return this.ctx;
  }

  /** Renvoie le périphérique WebGPU actif. */
  getDevice(): GPUDevice {
    return this.device;
  }

  /**
   * Définit la cible de rendu intermédiaire utilisée pour les traitements multipasses.
   * Une valeur `null` rétablit le rendu direct à l'écran.
   *
   * @param destinationTexture - Texture cible ou `null`.
   */
  setDestinationTexture(destinationTexture: Gfx3RenderingTexture | null): void {
    this.destinationTexture = destinationTexture;
  }

  /** Renvoie la texture de la surface courante utilisée pour le rendu final. */
  getCurrentRenderingTexture(): Gfx3RenderingTexture {
    return { gpuTexture: this.ctx.getCurrentTexture(), gpuSampler: this.renderingTextureSampler!, gpuTextureView: this.renderingTextureView! };
  }

  /** Renvoie l'attachement de rendu qui contient les normales. */
  getNormalsTexture(): Gfx3RenderingTexture {
    return this.normalsTexture;
  }

  /** Renvoie l'attachement de rendu qui contient les tags d'identification. */
  getTagsTexture(): Gfx3RenderingTexture {
    return this.tagsTexture;
  }

  /** Renvoie la texture de profondeur. */
  getDepthTexture(): Gfx3RenderingTexture {
    return this.depthTexture;
  }

  /** Renvoie la texture de l'attachement auxiliaire numéro 1. */
  getChannel1Texture(): Gfx3RenderingTexture {
    return this.channel1Texture;
  }

  /** Renvoie l'encodeur de commandes de la phase de rendu courante. */
  getCommandEncoder(): GPUCommandEncoder {
    return this.commandEncoder;
  }

  /** Renvoie l'encodeur de la passe de rendu courante. */
  getPassEncoder(): GPURenderPassEncoder {
    return this.passEncoder;
  }

  /**
   * Renvoie une vue par son indice.
   *
   * @param index - Indice de la vue.
   * @returns La vue correspondante.
   */
  getView(index: number): Gfx3View {
    return this.views[index];
  }

  /** Renvoie le nombre de vues enregistrées. */
  getNumViews(): number {
    return this.views.length;
  }

  /**
   * Crée une vue plein écran adaptée à la résolution courante et l'enregistre.
   *
   * @returns La nouvelle vue.
   */
  createView(): Gfx3View {
    const view = new Gfx3View();
    view.setScreenSize(this.canvas.width, this.canvas.height);
    this.views.push(view);
    return view;
  }

  /**
   * Remplace la vue située à un indice donné.
   *
   * @param index - Indice à remplacer.
   * @param view - Nouvelle vue.
   */
  changeView(index: number, view: Gfx3View): void {
    this.views[index] = view;
  }

  /**
   * Retire une vue enregistrée.
   *
   * @param view - Vue à retirer.
   */
  removeView(view: Gfx3View): void {
    this.views.splice(this.views.indexOf(view), 1);
  }

  /**
   * Retire la vue située à l'indice indiqué.
   *
   * @param index - Indice de la vue à retirer.
   */
  removeViewAt(index: number): void {
    this.views.splice(index, 1);
  }

  /** Renvoie la vue rendue par la passe courante. */
  getCurrentView(): Gfx3View {
    return this.currentView;
  }

  /** Renvoie le tampon GPU global qui contient tous les sommets 3D. */
  getVertexBuffer(): GPUBuffer {
    return this.vertexBuffer;
  }

  /** Renvoie la durée de la dernière phase de rendu, en millisecondes. */
  getLastRenderTime() {
    return this.lastRenderTime;
  }

  /** Redimensionne le canevas, recrée les attachements de rendu et actualise toutes les vues. */
  #handleWindowResize(): void {
    const devicePixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * devicePixelRatio;

    this.normalsTexture.gpuTexture.destroy();
    this.normalsTexture = this.createRenderingTexture('rgba16float');

    this.tagsTexture.gpuTexture.destroy();
    this.tagsTexture = this.createRenderingTexture('rgba16float');

    this.depthTexture.gpuTexture.destroy();
    this.depthTexture = this.createRenderingTexture('depth24plus');

    this.channel1Texture.gpuTexture.destroy();
    this.channel1Texture = this.createRenderingTexture('rgba16float');

    for (const view of this.views) {
      view.setScreenSize(this.canvas.width, this.canvas.height);
    }
  }
}

/** Instance partagée du gestionnaire graphique 3D. */
export const gfx3Manager = new Gfx3Manager();
await gfx3Manager.initialize();