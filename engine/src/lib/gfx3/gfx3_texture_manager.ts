import { gfx3Manager } from './gfx3_manager';
import { gfx3MipmapManager } from './gfx3_mipmap_manager';
import { Gfx3Texture } from './gfx3_texture';

/** Gestionnaire singleton qui charge, met en cache et libère les textures 3D. */
export class Gfx3TextureManager {
  textures: Map<string, Gfx3Texture>;
  urls: Map<string, string>;
  blobs: Map<string, Blob>;

  /** Initialise les caches de textures, d'URL objet et de données binaires. */
  constructor() {
    this.textures = new Map<string, Gfx3Texture>();
    this.urls = new Map<string, string>();
    this.blobs = new Map<string, Blob>();
  }

  /**
   * Charge une image, crée sa texture GPU et la met en cache.
   *
   * @param path - Chemin de l'image source.
   * @param samplerDescriptor - Configuration de l'échantillonneur WebGPU.
   * @param is8bit - Utilise un format monochrome 8 bits lorsque cette valeur vaut `true`.
   * @param storePath - Clé de cache personnalisée ; le chemin source est utilisé par défaut.
   * @returns La texture mise en cache ou nouvellement créée.
   */
  async loadTexture(path: string, samplerDescriptor: GPUSamplerDescriptor = {}, is8bit: boolean = false, storePath: string = ''): Promise<Gfx3Texture> {
    storePath = storePath ? storePath : path;

    if (this.textures.has(storePath)) {
      return this.textures.get(storePath)!;
    }

    const res = await fetch(path);
    const img = await res.blob();
    const url = URL.createObjectURL(img);
    const bitmap = await createImageBitmap(img, { colorSpaceConversion: 'none' });
    const texture = gfx3Manager.createTextureFromBitmap(bitmap, is8bit, samplerDescriptor);

    this.textures.set(storePath, texture);
    this.urls.set(storePath, url);
    this.blobs.set(storePath, img);
    return texture;
  }

  /**
   * Charge une image, crée une texture avec ses mipmaps et la met en cache.
   *
   * @param path - Chemin de l'image source.
   * @param samplerDescriptor - Configuration de l'échantillonneur WebGPU.
   * @param is8bit - Utilise un format monochrome 8 bits lorsque cette valeur vaut `true`.
   * @param storePath - Clé de cache personnalisée ; le chemin source est utilisé par défaut.
   * @returns La texture mise en cache ou nouvellement créée.
   */
  async loadTextureMips(path: string, samplerDescriptor: GPUSamplerDescriptor = {}, is8bit: boolean = false, storePath: string = ''): Promise<Gfx3Texture> {
    storePath = storePath ? storePath : path;

    if (this.textures.has(storePath)) {
      return this.textures.get(storePath)!;
    }

    const res = await fetch(path);
    const img = await res.blob();
    const url = URL.createObjectURL(img);
    const bitmap = await createImageBitmap(img, { colorSpaceConversion: 'none' });
    const texture = gfx3MipmapManager.createTextureFromBitmap(bitmap, is8bit, samplerDescriptor);
    this.textures.set(storePath, texture);
    this.urls.set(storePath, url);
    this.blobs.set(storePath, img);
    return texture;
  }

  /**
   * Charge les six faces d'une cubemap, crée la texture correspondante et la met en cache.
   *
   * @param paths - Chemins des faces droite, gauche, supérieure, inférieure, avant et arrière.
   * @param storePath - Clé sous laquelle conserver la cubemap.
   * @returns La cubemap mise en cache ou nouvellement créée.
   */
  async loadCubemapTexture(paths: { right: string, left: string, top: string, bottom: string, front: string, back: string }, storePath: string = ''): Promise<Gfx3Texture> {
    if (this.textures.has(storePath)) {
      return this.textures.get(storePath)!;
    }

    type direction = 'right' | 'left' | 'top' | 'bottom' | 'front' | 'back';
    const dirs = ['right', 'left', 'top', 'bottom', 'front', 'back'];
    const bitmaps: Array<ImageBitmap> = [];

    for (const dir of dirs) {
      await this.loadTexture(paths[dir as direction]);
      const img = this.getTextureBlob(paths[dir as direction])
      const url = this.getTextureURL(paths[dir as direction]);

      const bitmap = await createImageBitmap(img, { colorSpaceConversion: 'none' });
      bitmaps.push(bitmap);
      this.urls.set(storePath, url);
    }

    const texture = gfx3Manager.createCubeMapFromBitmap(bitmaps);
    this.textures.set(storePath, texture);
    return texture;
  }

  /**
   * Détruit une texture et supprime toutes les entrées de cache associées.
   *
   * @param path - Clé de cache de la texture.
   * @throws Une erreur si aucune texture ne correspond à cette clé.
   */
  deleteTexture(path: string): void {
    if (!this.textures.has(path)) {
      throw new Error('Gfx3TextureManager::deleteTexture(): The texture file doesn\'t exist, cannot delete !');
    }

    const texture = this.textures.get(path)!;
    texture.gpuTexture.destroy();

    const url = this.urls.get(path)!;
    URL.revokeObjectURL(url);

    this.textures.delete(path);
    this.urls.delete(path);
    this.blobs.delete(path);
  }

  /**
   * Recherche une texture dans le cache.
   *
   * @param path - Clé de cache de la texture.
   * @returns La texture trouvée.
   * @throws Une erreur si aucune texture ne correspond à cette clé.
   */
  getTexture(path: string): Gfx3Texture {
    if (!this.textures.has(path)) {
      throw new Error('Gfx2TextureManager::getTexture(): The texture file doesn\'t exist, cannot get !');
    }

    return this.textures.get(path)!;
  }

  /**
   * Renvoie l'URL objet associée à une texture et peut la régénérer depuis son `Blob`.
   *
   * @param path - Clé de cache de la texture.
   * @param refresh - Révoque puis recrée l'URL lorsque cette valeur vaut `true`.
   * @returns L'URL objet courante.
   * @throws Une erreur si aucune URL ne correspond à cette clé.
   */
  getTextureURL(path: string, refresh: boolean = false): string {
    if (!this.urls.has(path)) {
      throw new Error('Gfx3TextureManager::getTextureURL(): The texture file doesn\'t exist, cannot get !');
    }

    if (refresh) {
      const url = this.urls.get(path)!;
      const blob = this.blobs.get(path)!;
      URL.revokeObjectURL(url);
      this.urls.set(path, URL.createObjectURL(blob));
    }

    return this.urls.get(path)!;
  }

  /**
   * Renvoie les données binaires sources d'une texture.
   *
   * @param path - Clé de cache de la texture.
   * @returns Le `Blob` source.
   * @throws Une erreur si aucune donnée ne correspond à cette clé.
   */
  getTextureBlob(path: string): Blob {
    if (!this.blobs.has(path)) {
      throw new Error('Gfx3TextureManager::getTextureBlob(): The texture file doesn\'t exist, cannot get !');
    }

    return this.blobs.get(path)!;
  }

  /**
   * Indique si une texture est présente dans le cache.
   *
   * @param path - Clé de cache recherchée.
   * @returns `true` si la texture existe.
   */
  hasTexture(path: string): boolean {
    return this.textures.has(path);
  }

  /** Détruit toutes les textures, révoque leurs URL objet et vide les caches. */
  releaseTextures(): void {
    for (const path of this.textures.keys()) {
      const url = this.urls.get(path)!;
      URL.revokeObjectURL(url);

      const texture = this.textures.get(path)!;
      texture.gpuTexture.destroy();
      this.textures.delete(path);
      this.urls.delete(path);
      this.blobs.delete(path);
    }
  }
}

/** Instance partagée du gestionnaire de textures 3D. */
export const gfx3TextureManager = new Gfx3TextureManager();