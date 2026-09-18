import { FormatJAS, fromAseprite, fromEzSpriteSheet } from './format_jas';

/**
 * Charge et met en cache les feuilles de sprites, leurs textures et leurs URL.
 */
export class SpritesheetManager {
  spritesheets: Map<string, FormatJAS>;
  textures: Map<string, ImageBitmap>;
  textureUrls: Map<string, string>;

  /**
   * Crée un gestionnaire dont les caches sont vides.
   */
  constructor() {
    this.spritesheets = new Map<string, FormatJAS>();
    this.textures = new Map<string, ImageBitmap>();
    this.textureUrls = new Map<string, string>();
  }

  /**
   * Charge une feuille de sprites et la convertit au format JAS si nécessaire.
   *
   * @param type - Format du fichier source.
   * @param path - Chemin du fichier de description.
   * @param imagePath - Chemin facultatif de la texture source.
   * @param storePath - Clé de cache facultative ; `path` est utilisé par défaut.
   * @param loadSpritesheetTexture - Indique s'il faut extraire la première image de chaque animation.
   * @returns Feuille de sprites mise en cache.
   * @throws Une erreur si le format demandé est inconnu.
   */
  async loadSpritesheet(type: 'asesprite' | 'ezspritesheet' | 'jas' = 'jas', path: string, imagePath: string = '', storePath: string = '', loadSpritesheetTexture: boolean = false): Promise<FormatJAS> {
    storePath = storePath ? storePath : path;

    if (this.spritesheets.has(storePath)) {
      return this.spritesheets.get(storePath)!;
    }

    if (type == 'asesprite') {
      const data = await fromAseprite(path);
      this.spritesheets.set(storePath, data);
      if (loadSpritesheetTexture && imagePath) {
        await this.loadSpritesheetTexture(imagePath, data);
      }
      return data;
    }
    else if (type == 'ezspritesheet') {
      const data = await fromEzSpriteSheet(path);
      this.spritesheets.set(storePath, data);
      if (loadSpritesheetTexture && imagePath) {
        await this.loadSpritesheetTexture(imagePath, data);
      }
      return data;
    }
    else if (type == 'jas') {
      const data = await fetch(path).then(res => res.json()) as FormatJAS;
      this.spritesheets.set(storePath, data);
      if (loadSpritesheetTexture && imagePath) {
        await this.loadSpritesheetTexture(imagePath, data);
      }
      return data;
    }
    else {
      throw new Error('SpritesheetManager::loadFile(): Unknown file type !');
    }
  }

  /**
   * Extrait la première image de chaque animation depuis la texture source.
   *
   * @param imagePath - Chemin de l'image contenant la feuille de sprites.
   * @param data - Description JAS des animations à extraire.
   * @returns Promesse résolue une fois toutes les textures et URL créées.
   */
  async loadSpritesheetTexture(imagePath: string, data: FormatJAS) {
    const res = await fetch(imagePath);
    const blobImg = await res.blob();
    const bitmap = await createImageBitmap(blobImg);

    const promises = data['Animations'].map(async (animation) => {
      const frame = animation['Frames'][0];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = frame['Width'];
      canvas.height = frame['Height'];

      if (ctx) {
        ctx.drawImage(
          bitmap,
          frame['X'], frame['Y'], frame['Width'], frame['Height'],
          0, 0, frame['Width'], frame['Height']
        );

        const extractedBitmap = await createImageBitmap(canvas);
        this.textures.set(animation['Name'], extractedBitmap);

        return new Promise<void>((resolve) => {
          canvas.toBlob((blob) => {
            if (blob) {
              this.textureUrls.set(animation['Name'], URL.createObjectURL(blob));
            }
            resolve();
          });
        });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Supprime une feuille de sprites du cache et révoque ses URL.
   *
   * @param path - Clé de la feuille de sprites.
   * @throws Une erreur si la feuille de sprites n'est pas en cache.
   */
  deleteSpritesheet(path: string): void {
    if (!this.spritesheets.has(path)) {
      throw new Error('SpritesheetManager::deleteSpritesheet(): The spritesheet file doesn\'t exist, cannot delete !');
    }

    const spritesheet = this.spritesheets.get(path)!;
    spritesheet.Animations.forEach(a => {
      URL.revokeObjectURL(a.Name);
      this.textureUrls.delete(a.Name);
    });

    this.textures.delete(path);
    this.spritesheets.delete(path);
  }

  /**
   * Retourne une feuille de sprites mise en cache.
   *
   * @param path - Clé de la feuille de sprites.
   * @returns Description JAS correspondante.
   * @throws Une erreur si la feuille de sprites n'est pas en cache.
   */
  getSpritesheet(path: string): FormatJAS {
    if (!this.spritesheets.has(path)) {
      throw new Error('SpritesheetManager::getSpritesheet(): The file doesn\'t exist, cannot get !');
    }

    return this.spritesheets.get(path)!;
  }

  /**
   * Retourne la texture extraite d'une animation.
   *
   * @param name - Nom de l'animation.
   * @returns Texture correspondante.
   * @throws Une erreur si la texture n'existe pas.
   */
  getTexture(name: string): ImageBitmap {
    if (!this.textures.has(name)) {
      throw new Error('SpritesheetManager::getTexture(): The texture doesn\'t exist, cannot get !');
    }

    return this.textures.get(name)!;
  }

  /**
   * Retourne l'URL d'objet d'une texture extraite.
   *
   * @param name - Nom de l'animation.
   * @returns URL de la texture correspondante.
   * @throws Une erreur si l'URL n'existe pas.
   */
  getTextureURL(name: string): string {
    if (!this.textureUrls.has(name)) {
      throw new Error('SpritesheetManager::getTextureURL(): The texture doesn\'t exist, cannot get !');
    }

    return this.textureUrls.get(name)!;
  }

  /**
   * Indique si une feuille de sprites est en cache.
   *
   * @param path - Clé de la feuille de sprites.
   * @returns `true` si elle est présente.
   */
  hasSpritesheet(path: string): boolean {
    return this.spritesheets.has(path);
  }

  /**
   * Révoque les URL de textures et vide le cache des feuilles de sprites.
   */
  releaseFiles(): void {
    for (const url of this.textureUrls.values()) {
      URL.revokeObjectURL(url);
    }

    for (const path of this.spritesheets.keys()) {
      this.spritesheets.delete(path);
    }
  }
}

export const spritesheetManager = new SpritesheetManager();