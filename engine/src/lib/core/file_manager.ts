/**
 * Charge, met en cache et libère les fichiers utilisés par l'application.
 */
export class FileManager {
  files: Map<string, any>;
  urls: Map<string, string>;
  blobs: Map<string, Blob>;

  /**
   * Crée un gestionnaire dont les caches sont vides.
   */
  constructor() {
    this.files = new Map<string, any>();
    this.urls = new Map<string, string>();
    this.blobs = new Map<string, Blob>();
  }

  /**
   * Charge un fichier et le met en cache sous la forme demandée.
   *
   * @param path - Chemin du fichier à charger.
   * @param storePath - Clé de cache facultative ; le chemin source est utilisé par défaut.
   * @param type - Format de lecture de la réponse.
   * @returns Données mises en cache, sous forme de `Blob`, d'objet JSON ou de texte.
   */
  async loadFile(path: string, storePath: string = '', type: 'blob' | 'json' | 'text' = 'blob'): Promise<any> {
    storePath = storePath ? storePath : path;

    if (this.files.has(storePath)) {
      return this.files.get(storePath)!;
    }

    let data = null;
    const res = await fetch(path);

    if (type == 'blob') {
      data = await res.blob();
      const url = URL.createObjectURL(data);
      this.urls.set(storePath, url);
      this.blobs.set(storePath, data);
    }
    else if (type == 'json') {
      data = await res.json();
    }
    else if (type == 'text') {
      data = await res.text();
    }

    this.files.set(storePath, data);
    return data;
  }

  /**
   * Supprime un fichier du cache et révoque son éventuelle URL d'objet.
   *
   * @param path - Clé du fichier dans le cache.
   * @throws Une erreur si le fichier n'est pas en cache.
   */
  deleteFile(path: string): void {
    if (!this.files.has(path)) {
      throw new Error('FileManager::deleteFile(): The texture file doesn\'t exist, cannot delete !');
    }

    const url = this.urls.get(path)!;
    URL.revokeObjectURL(url);

    this.files.delete(path);
    this.urls.delete(path);
    this.blobs.delete(path);
  }

  /**
   * Retourne les données d'un fichier mis en cache.
   *
   * @param path - Clé du fichier dans le cache.
   * @returns Données précédemment chargées.
   * @throws Une erreur si le fichier n'est pas en cache.
   */
  getFile(path: string): any {
    if (!this.files.has(path)) {
      throw new Error('FileManager::getFile(): The file doesn\'t exist, cannot get !');
    }

    return this.files.get(path)!;
  }

  /**
   * Retourne l'URL d'objet associée à un fichier binaire.
   *
   * @param path - Clé du fichier dans le cache.
   * @param refresh - Indique s'il faut révoquer puis recréer l'URL.
   * @returns URL d'objet du fichier.
   * @throws Une erreur si aucune URL n'est associée à cette clé.
   */
  getFileURL(path: string, refresh: boolean = false): string {
    if (!this.urls.has(path)) {
      throw new Error('FileManager::getFileURL(): The file doesn\'t exist, cannot get !');
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
   * Retourne le contenu binaire d'un fichier.
   *
   * @param path - Clé du fichier dans le cache.
   * @returns `Blob` associé au fichier.
   * @throws Une erreur si aucun contenu binaire n'est associé à cette clé.
   */
  getFileBlob(path: string): Blob {
    if (!this.blobs.has(path)) {
      throw new Error('FileManager::getFileBlob(): The texture file doesn\'t exist, cannot get !');
    }

    return this.blobs.get(path)!;
  }

  /**
   * Indique si un fichier est présent dans le cache.
   *
   * @param path - Clé du fichier.
   * @returns `true` si le fichier est en cache.
   */
  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  /**
   * Vide les caches et révoque toutes les URL d'objet.
   */
  releaseFiles(): void {
    for (const path of this.files.keys()) {
      const url = this.urls.get(path)!;
      URL.revokeObjectURL(url);

      this.files.delete(path);
      this.urls.delete(path);
      this.blobs.delete(path);
    }
  }
}

export const fileManager = new FileManager();