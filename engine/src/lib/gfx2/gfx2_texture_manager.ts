/**
 * Gestionnaire singleton des textures 2D et de leurs ressources associées.
 */
export class Gfx2TextureManager {
  textures: Map<string, ImageBitmap>;
  urls: Map<string, string>;
  blobs: Map<string, Blob>;

  /** Crée un gestionnaire dont les caches sont vides. */
  constructor() {
    this.textures = new Map<string, ImageBitmap>();
    this.urls = new Map<string, string>();
    this.blobs = new Map<string, Blob>();
  }

  /**
   * Charge une image de manière asynchrone, la met en cache et la renvoie sous forme d'`ImageBitmap`.
   *
   * @param {string} path - Chemin de l'image à charger.
   * @param {string} storePath - Clé de cache facultative ; le chemin de l'image est utilisé par défaut.
   * @returns La texture chargée ou sa version déjà présente dans le cache.
   */
  async loadTexture(path: string, storePath: string = ''): Promise<ImageBitmap> {
    storePath = storePath ? storePath : path;

    if (this.textures.has(storePath)) {
      return this.textures.get(storePath)!;
    }

    const res = await fetch(path);
    const img = await res.blob();
    const url = URL.createObjectURL(img);
    const bitmap = await createImageBitmap(img);

    this.textures.set(storePath, bitmap);
    this.urls.set(storePath, url);
    this.blobs.set(storePath, img);
    return bitmap;
  }

  /**
   * Supprime une texture du cache et révoque son URL objet.
   *
   * @param {string} path - Clé de cache de la texture.
   * @throws Une erreur si la texture n'existe pas.
   */
  deleteTexture(path: string): void {
    if (!this.textures.has(path)) {
      throw new Error('Gfx2TextureManager::deleteTexture(): The texture file doesn\'t exist, cannot delete !');
    }

    const url = this.urls.get(path)!;
    URL.revokeObjectURL(url);

    this.textures.delete(path);
    this.urls.delete(path);
    this.blobs.delete(path);
  }

  /**
   * Renvoie la texture associée à une clé de cache.
   *
   * @param {string} path - Clé de cache de la texture.
   * @returns La texture demandée.
   * @throws Une erreur si la texture n'existe pas.
   */
  getTexture(path: string): ImageBitmap {
    if (!this.textures.has(path)) {
      throw new Error('Gfx2TextureManager::getTexture(): The texture file doesn\'t exist, cannot get !');
    }

    return this.textures.get(path)!;
  }

  /**
   * Renvoie l'URL objet d'une texture et peut la régénérer à partir du `Blob` conservé.
   *
   * @param {string} path - Clé de cache de la texture.
   * @param {boolean} refresh - Indique s'il faut révoquer puis recréer l'URL objet.
   * @returns L'URL objet de la texture.
   * @throws Une erreur si la texture n'existe pas.
   */
  getTextureURL(path: string, refresh: boolean = false): string {
    if (!this.urls.has(path)) {
      throw new Error('Gfx2TextureManager::getTextureURL(): The texture file doesn\'t exist, cannot get !');
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
   * Renvoie les données binaires d'une texture.
   *
   * @param {string} path - Clé de cache de la texture.
   * @returns Le `Blob` source de la texture.
   * @throws Une erreur si la texture n'existe pas.
   */
  getTextureBlob(path: string): Blob {
    if (!this.blobs.has(path)) {
      throw new Error('Gfx2TextureManager::getTextureBlob(): The texture file doesn\'t exist, cannot get !');
    }

    return this.blobs.get(path)!;
  }

  /**
   * Indique si une texture est présente dans le cache.
   *
   * @param {string} path - Clé de cache de la texture.
   * @returns `true` si la texture existe, sinon `false`.
   */
  hasTexture(path: string): boolean {
    return this.textures.has(path);
  }

  /**
   * Supprime toutes les textures mises en cache et révoque leurs URL objet.
   */
  releaseTextures(): void {
    for (const path of this.textures.keys()) {
      const url = this.urls.get(path)!;
      URL.revokeObjectURL(url);

      this.textures.delete(path);
      this.urls.delete(path);
      this.blobs.delete(path);
    }
  }
}

/** Instance partagée du gestionnaire de textures 2D. */
export const gfx2TextureManager = new Gfx2TextureManager();