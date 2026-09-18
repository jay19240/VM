import { gfx3Manager } from '../gfx3/gfx3_manager';
import { gfx3TextureManager } from '../gfx3/gfx3_texture_manager';
import { gfx3SkyboxRenderer } from './gfx3_skybox_renderer';
import { Gfx3StaticGroup } from '../gfx3/gfx3_group';
import { Gfx3Drawable } from '../gfx3/gfx3_drawable';
import { Gfx3Texture } from '../gfx3/gfx3_texture';
import { SKYBOX_SHADER_VERTEX_ATTR_COUNT } from './gfx3_skybox_shader';

/**
 * Représente une boîte céleste fondée sur une texture cubique.
 */
export class Gfx3Skybox extends Gfx3Drawable {
  cubemapChanged: boolean;
  grp1: Gfx3StaticGroup;
  cubemap: Gfx3Texture;

  /** Initialise la géométrie plein écran et une texture cubique vide. */
  constructor() {
    super(SKYBOX_SHADER_VERTEX_ATTR_COUNT);
    this.cubemapChanged = false;
    this.grp1 = gfx3Manager.createStaticGroup('SKYBOX_PIPELINE', 1);
    this.cubemap = this.grp1.setTexture(0, 'CUBEMAP_TEXTURE', gfx3Manager.createCubeMapFromBitmap(), { dimension: 'cube' });
    this.cubemap = this.grp1.setSampler(1, 'CUBEMAP_SAMPLER', this.cubemap);

    this.beginVertices(6);
    this.defineVertex(-1, -1, -1, -1, -1, -1);
    this.defineVertex(+1, -1, -1, -1, -1, +1);
    this.defineVertex(-1, +1, -1, +1, -1, +1);
    this.defineVertex(-1, +1, -1, -1, -1, -1);
    this.defineVertex(+1, -1, -1, +1, -1, +1);
    this.defineVertex(+1, +1, -1, +1, -1, -1);
    this.endVertices();

    this.grp1.allocate();
  }

  /**
   * Charge la description et les six faces d'une boîte céleste depuis un fichier JSON SKY.
   *
   * @param path - Chemin du fichier SKY.
   * @param textureDir - Répertoire préfixé aux chemins des textures.
   * @returns Une promesse résolue une fois la boîte céleste chargée.
   * @throws Si le fichier est invalide ou ne décrit pas les six faces requises.
   */
  async loadFromFile(path: string, textureDir: string = ''): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'SKY') {
      throw new Error('Gfx3Skybox::loadFromData(): Data not valid !');
    }

    if (!json['Name'] || !json['Right'] || !json['Left'] || !json['Top'] || !json['Bottom'] || !json['Front'] || !json['Back']) {
      throw new Error('Gfx3Skybox::loadFromFile(): File not correctly formated !');
    }

    this.setCubemap(await gfx3TextureManager.loadCubemapTexture({
      right: textureDir + json['Right'],
      left: textureDir + json['Left'],
      top: textureDir + json['Top'],
      bottom: textureDir + json['Bottom'],
      front: textureDir + json['Front'],
      back: textureDir + json['Back']
    }, json['Right'] + json['Left'] + json['Top'] + json['Bottom'] + json['Front'] + json['Back']));
  }

  /**
   * Libère le groupe de liaison et les ressources allouées par l'objet.
   *
   * Cette méthode doit être appelée lorsque la boîte céleste n'est plus utilisée.
   */
  delete(): void {
    this.grp1.delete();
    super.delete();
  }

  /** Définit cette boîte céleste pour la prochaine passe de rendu. */
  draw(): void {
    gfx3SkyboxRenderer.draw(this);
  }

  /**
   * Définit la texture cubique de la boîte céleste.
   *
   * @param cubemap - Nouvelle texture cubique.
   */
  setCubemap(cubemap: Gfx3Texture): void {
    this.cubemap = cubemap;
    this.cubemapChanged = true;
  }

  /**
   * Obtient la texture cubique de la boîte céleste.
   *
   * @returns La texture cubique courante.
   */
  getCubemap(): Gfx3Texture {
    return this.cubemap;
  }

  /**
   * Obtient le groupe de liaison 1 et actualise sa texture si nécessaire.
   *
   * @returns Le groupe de liaison contenant la texture cubique et son échantillonneur.
   */
  getGroup01(): Gfx3StaticGroup {
    if (this.cubemapChanged) {
      this.grp1.setTexture(0, 'CUBEMAP_TEXTURE', this.cubemap, { dimension: 'cube' });
      this.grp1.allocate();
      this.cubemapChanged = false;
    }

    return this.grp1;
  }
}