import JSZip from 'jszip';
// -----------------------------------------------------------------------------------------------
import { gfx3TextureManager } from '../gfx3/gfx3_texture_manager';
import { gfx3MeshRenderer } from '../gfx3_mesh/gfx3_mesh_renderer';
import { soundManager } from '../sound/sound_manager';
import { spritesheetManager } from '../core/spritesheet_manager';
import { fileManager } from '../core/file_manager';
import { FormatJAS } from '../core/format_jas';
import { UT } from '../core/utils';
import { Gfx3Camera } from '../gfx3_camera/gfx3_camera';
import { Curve, CurveInterpolator } from '../core/curve';
import { Gfx3MeshJAM } from '../gfx3_mesh/gfx3_mesh_jam';
import { Gfx3MeshJSM } from '../gfx3_mesh/gfx3_mesh_jsm';
import { Gfx3MeshOBJ } from '../gfx3_mesh/gfx3_mesh_obj';
import { Gfx3MeshDecal } from '../gfx3_mesh/gfx3_mesh_decal';
import { Gfx3PhysicsJWM } from '../gfx3_physics/gfx3_physics_jwm';
import { Gfx3PhysicsJNM } from '../gfx3_physics/gfx3_physics_jnm';
import { Gfx3ShadowVolume } from '../gfx3_shadow_volume/gfx3_shadow_volume';
import { Gfx3MeshLight } from '../gfx3_mesh/gfx3_mesh_light';
import { AIPathGraph3D } from '../ai/ai_path_graph';
import { AIPathGrid3D } from '../ai/ai_path_grid';
import { Gfx3Texture } from '../gfx3/gfx3_texture';
import { Gfx3Material } from '../gfx3_mesh/gfx3_mesh_material';
import { Gfx3SpriteJAS } from '../gfx3_sprite/gfx3_sprite_jas';
import { Gfx3SpriteJSS } from '../gfx3_sprite/gfx3_sprite_jss';
import { Gfx3Skybox } from '../gfx3_skybox/gfx3_skybox';
import { Gfx3Particles } from '../gfx3_particles/gfx3_particles';
import { Gfx3Water } from '../gfx3_water/gfx3_water';
import { Sound } from '../sound/sound_manager';
import { Motion } from '../motion/motion';
import { ScriptMachine } from '../script/script_machine';
import { EnginePackItemList } from './engine_pack_item_list';
import { Gfx3CameraWASD } from '../gfx3_camera/gfx3_camera_wasd';
import { Gfx3CameraOrbit } from '../gfx3_camera/gfx3_camera_orbit';
import { EngineEntity, createEntityFromFile } from './engine_entity';

/**
 * Regroupe et organise les ressources 3D chargées depuis une archive du moteur.
 */
class EnginePack3D {
  bin: EnginePackItemList<Blob>;
  sst: EnginePackItemList<FormatJAS>;
  jsc: EnginePackItemList<ScriptMachine>;
  snd: EnginePackItemList<Sound>;
  tex: EnginePackItemList<Gfx3Texture>;
  mat: EnginePackItemList<Gfx3Material>;
  jam: EnginePackItemList<Gfx3MeshJAM>;
  jsm: EnginePackItemList<Gfx3MeshJSM>;
  obj: EnginePackItemList<Gfx3MeshOBJ>;
  dcl: EnginePackItemList<Gfx3MeshDecal>;
  jas: EnginePackItemList<Gfx3SpriteJAS>;
  jss: EnginePackItemList<Gfx3SpriteJSS>;
  sky: EnginePackItemList<Gfx3Skybox>;
  prt: EnginePackItemList<Gfx3Particles>;
  jwa: EnginePackItemList<Gfx3Water>;
  jwm: EnginePackItemList<Gfx3PhysicsJWM>;
  jnm: EnginePackItemList<Gfx3PhysicsJNM>;
  jlm: EnginePackItemList<Motion>;
  crv: EnginePackItemList<CurveInterpolator>;
  jsv: EnginePackItemList<Gfx3ShadowVolume>;
  jlt: EnginePackItemList<Gfx3MeshLight>;
  grf: EnginePackItemList<AIPathGraph3D>;
  grd: EnginePackItemList<AIPathGrid3D>;
  ent: EnginePackItemList<EngineEntity>;
  // --------------------------------------------
  camera: Gfx3Camera;
  // --------------------------------------------
  updateItems: Array<any>;
  drawItems: Array<any>;

  /**
   * Crée un pack 3D vide avec le contrôleur de caméra demandé.
   *
   * @param cameraType - Type de caméra à initialiser.
   */
  constructor(cameraType: 'wasd' | 'orbit' | 'classic' = 'classic') {
    this.bin = new EnginePackItemList<Blob>;
    this.sst = new EnginePackItemList<FormatJAS>;
    this.jsc = new EnginePackItemList<ScriptMachine>;
    this.snd = new EnginePackItemList<Sound>;
    this.tex = new EnginePackItemList<Gfx3Texture>;
    this.mat = new EnginePackItemList<Gfx3Material>;
    this.jam = new EnginePackItemList<Gfx3MeshJAM>;
    this.jsm = new EnginePackItemList<Gfx3MeshJSM>;
    this.obj = new EnginePackItemList<Gfx3MeshOBJ>;
    this.dcl = new EnginePackItemList<Gfx3MeshDecal>;
    this.jas = new EnginePackItemList<Gfx3SpriteJAS>;
    this.jss = new EnginePackItemList<Gfx3SpriteJSS>;
    this.sky = new EnginePackItemList<Gfx3Skybox>;
    this.prt = new EnginePackItemList<Gfx3Particles>;
    this.jwa = new EnginePackItemList<Gfx3Water>;
    this.jwm = new EnginePackItemList<Gfx3PhysicsJWM>;
    this.jnm = new EnginePackItemList<Gfx3PhysicsJNM>;
    this.jlm = new EnginePackItemList<Motion>;
    this.crv = new EnginePackItemList<CurveInterpolator>;
    this.jsv = new EnginePackItemList<Gfx3ShadowVolume>;
    this.jlt = new EnginePackItemList<Gfx3MeshLight>;
    this.grf = new EnginePackItemList<AIPathGraph3D>;
    this.grd = new EnginePackItemList<AIPathGrid3D>;
    this.ent = new EnginePackItemList<EngineEntity>;

    if (cameraType == 'wasd') {
      this.camera = new Gfx3CameraWASD(0);
    }
    else if (cameraType == 'orbit') {
      this.camera = new Gfx3CameraOrbit(0);
    }
    else {
      this.camera = new Gfx3Camera(0);
    }

    this.updateItems = [];
    this.drawItems = [];
  }

  /**
   * Charge une archive et crée un pack contenant ses ressources 3D.
   *
   * Les objets doivent être correctement répartis dans les collections Blender afin que l'export produise les formats attendus.
   *
   * @param {'wasd' | 'orbit' | 'classic'} cameraType - Type de caméra à associer au pack.
   * @param {string} path - Chemin de l'archive à charger.
   * @param {boolean} updated - Indique si les ressources compatibles doivent être inscrites dans les listes de mise à jour et de dessin.
   * @returns Le pack 3D créé à partir de l'archive.
   * @throws Une erreur si l'archive ou l'une de ses ressources ne peut pas être chargée ou analysée.
   */
  static async createFromFile(cameraType: 'wasd' | 'orbit' | 'classic', path: string, updated: boolean = true): Promise<EnginePack3D> {
    const res = await fetch(path);
    const zip = await JSZip.loadAsync(await res.blob());
    const pack = new EnginePack3D(cameraType);

    // load textures first
    for (const entry of zip.file(/\.(jpg|jpeg|png|bmp)/)) {
      const infos = UT.GET_FILENAME_INFOS(entry.name);
      const file = zip.file(entry.name);

      if (file != null) {
        const imageUrl = URL.createObjectURL(await file.async('blob'));
        const sampler: GPUSamplerDescriptor = {};
        let type = '';
        let is8Bit = false;

        const texFile = zip.file(infos.name + '.tex');
        if (texFile != null) {
          const json = JSON.parse(await texFile.async('string'));
          sampler.addressModeU = json['AddressModeU'];
          sampler.addressModeV = json['AddressMoveV'];
          sampler.addressModeW = json['AddressMoveW'];
          sampler.magFilter = json['MagFilter'];
          sampler.minFilter = json['MinFilter'];
          sampler.mipmapFilter = json['MipMapFilter'];
          sampler.lodMinClamp = json['LodMinClamp'];
          sampler.lodMaxClamp = json['LodMaxClamp'];
          sampler.maxAnisotropy = json['MaxAnisotropy'];
          type = json['Type'];
          is8Bit = json['Is8Bit'];
        }

        if (type == 'Mips') {
          const texture = await gfx3TextureManager.loadTextureMips(imageUrl, sampler, is8Bit, entry.name);
          pack.tex.set(infos.name, { name: infos.name, ext: 'bitmap', object: texture, blobUrl: imageUrl });
        }
        else {
          const texture = await gfx3TextureManager.loadTexture(imageUrl, sampler, is8Bit, entry.name);
          pack.tex.set(infos.name, { name: infos.name, ext: 'bitmap', object: texture, blobUrl: imageUrl });
        }
      }
    }

    // load all others resources
    for (const entry of zip.file(/.*/)) {
      const infos = UT.GET_FILENAME_INFOS(entry.name);
      const file = zip.file(entry.name);

      if (file != null && infos.ext == 'wrd') {
        const url = URL.createObjectURL(await file.async('blob'));
        await gfx3MeshRenderer.loadFromFile(url);
      }
      else if (file != null && infos.ext == 'cam') {
        const url = URL.createObjectURL(await file.async('blob'));
        await pack.camera.loadFromFile(url);
      }
      else if (file != null && infos.ext == 'ase') {
        const url = URL.createObjectURL(await file.async('blob'));
        const sst = await spritesheetManager.loadSpritesheet('asesprite', url, entry.name);
        pack.sst.set(infos.name, { name: infos.name, ext: 'ase', object: sst, blobUrl: url });
      }
      else if (file != null && infos.ext == 'ezs') {
        const url = URL.createObjectURL(await file.async('blob'));
        const sst = await spritesheetManager.loadSpritesheet('ezspritesheet', url, entry.name);
        pack.sst.set(infos.name, { name: infos.name, ext: 'ezs', object: sst, blobUrl: url });
      }
      else if (file != null && infos.ext == 'mp3') {
        const url = URL.createObjectURL(await file.async('blob'));
        const snd = await soundManager.loadSound(url, entry.name);
        pack.snd.set(infos.name, { name: infos.name, ext: 'mp3', object: snd, blobUrl: url });
      }
      else if (file != null && infos.ext == 'jsc') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jsc = new ScriptMachine();
        await jsc.loadFromFile(url);
        pack.jsc.set(infos.name, { name: infos.name, ext: 'jsc', object: jsc, blobUrl: url });
        pack.updateItems.push(jsc);
      }
      else if (file != null && infos.ext == 'mat') {
        const url = URL.createObjectURL(await file.async('blob'));
        const mat = await Gfx3Material.createFromFile(url);
        pack.mat.set(infos.name, { name: infos.name, ext: 'mat', object: mat, blobUrl: url });
      }
      else if (file != null && infos.ext == 'jam') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jam = new Gfx3MeshJAM();
        await jam.loadFromFile(url);
        pack.jam.set(infos.name, { name: infos.name, ext: 'jam', object: jam, blobUrl: url });
        pack.updateItems.push(jam);
        pack.drawItems.push(jam);
      }
      else if (file != null && infos.ext == 'bam') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jam = new Gfx3MeshJAM();
        await jam.loadFromBinaryFile(url);
        pack.jam.set(infos.name, { name: infos.name, ext: 'bam', object: jam, blobUrl: url });
        pack.updateItems.push(jam);
        pack.drawItems.push(jam);
      }
      else if (file != null && infos.ext == 'jsm') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jsm = new Gfx3MeshJSM();
        await jsm.loadFromFile(url);
        pack.jsm.set(infos.name, { name: infos.name, ext: 'jsm', object: jsm, blobUrl: url });
        pack.updateItems.push(jsm);
        pack.drawItems.push(jsm);
      }
      else if (file != null && infos.ext == 'bsm') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jsm = new Gfx3MeshJSM();
        await jsm.loadFromBinaryFile(url);
        pack.jsm.set(infos.name, { name: infos.name, ext: 'bsm', object: jsm, blobUrl: url });
        pack.updateItems.push(jsm);
        pack.drawItems.push(jsm);
      }
      else if (file != null && infos.ext == 'obj') {
        const url = URL.createObjectURL(await file.async('blob'));
        const mtlFile = zip.file(infos.name + '.mtl');
        if (mtlFile != null) {
          const mtlUrl = URL.createObjectURL(await mtlFile.async('blob'));
          const obj = new Gfx3MeshOBJ();
          await obj.loadFromFile(url, mtlUrl);
          pack.obj.set(infos.name, { name: infos.name, ext: 'obj', object: obj, blobUrl: url });
          pack.updateItems.push(obj);
          pack.drawItems.push(obj);
        }
      }
      else if (file != null && infos.ext == 'dcl') {
        const url = URL.createObjectURL(await file.async('blob'));
        const dcl = new Gfx3MeshDecal();
        await dcl.loadFromFile(url);
        pack.dcl.set(infos.name, { name: infos.name, ext: 'dcl', object: dcl, blobUrl: url });
        pack.drawItems.push(dcl);
      }
      else if (file != null && infos.ext == 'jas') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jas = new Gfx3SpriteJAS();
        await jas.loadFromFile(url);
        pack.jas.set(infos.name, { name: infos.name, ext: 'jas', object: jas, blobUrl: url });
        pack.updateItems.push(jas);
        pack.drawItems.push(jas);
      }
      else if (file != null && infos.ext == 'jss') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jss = new Gfx3SpriteJSS();
        await jss.loadFromFile(url);
        pack.jss.set(infos.name, { name: infos.name, ext: 'jss', object: jss, blobUrl: url });
        pack.updateItems.push(jss);
        pack.drawItems.push(jss);
      }
      else if (file != null && infos.ext == 'sky') {
        const url = URL.createObjectURL(await file.async('blob'));
        const sky = new Gfx3Skybox();
        await sky.loadFromFile(url);
        pack.sky.set(infos.name, { name: infos.name, ext: 'sky', object: sky, blobUrl: url });
        pack.drawItems.push(sky);
      }
      else if (file != null && infos.ext == 'prt') {
        const url = URL.createObjectURL(await file.async('blob'));
        const prt = await Gfx3Particles.createFromFile(url);
        pack.prt.set(infos.name, { name: infos.name, ext: 'prt', object: prt, blobUrl: url });
        pack.updateItems.push(prt);
        pack.drawItems.push(prt);
      }
      else if (file != null && infos.ext == 'jwa') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jwa = new Gfx3Water();
        await jwa.loadFromFile(url);
        pack.jwa.set(infos.name, { name: infos.name, ext: 'jwa', object: jwa, blobUrl: url });
        pack.updateItems.push(jwa);
        pack.drawItems.push(jwa);
      }
      else if (file != null && infos.ext == 'bwa') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jwa = new Gfx3Water();
        await jwa.loadFromBinaryFile(url);
        pack.jwa.set(infos.name, { name: infos.name, ext: 'bwa', object: jwa, blobUrl: url });
        pack.updateItems.push(jwa);
        pack.drawItems.push(jwa);
      }
      else if (file != null && infos.ext == 'jwm') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jwm = new Gfx3PhysicsJWM();
        await jwm.loadFromFile(url);
        pack.jwm.set(infos.name, { name: infos.name, ext: 'jwm', object: jwm, blobUrl: url });
        pack.updateItems.push(jwm);
        pack.drawItems.push(jwm);
      }
      else if (file != null && infos.ext == 'bwm') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jwm = new Gfx3PhysicsJWM();
        await jwm.loadFromBinaryFile(url);
        pack.jwm.set(infos.name, { name: infos.name, ext: 'bwm', object: jwm, blobUrl: url });
        pack.updateItems.push(jwm);
        pack.drawItems.push(jwm);
      }
      else if (file != null && infos.ext == 'jnm') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jnm = new Gfx3PhysicsJNM();
        await jnm.loadFromFile(url);
        pack.jnm.set(infos.name, { name: infos.name, ext: 'jnm', object: jnm, blobUrl: url });
        pack.updateItems.push(jnm);
        pack.drawItems.push(jnm);
      }
      else if (file != null && infos.ext == 'bnm') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jnm = new Gfx3PhysicsJNM();
        await jnm.loadFromBinaryFile(url);
        pack.jnm.set(infos.name, { name: infos.name, ext: 'bnm', object: jnm, blobUrl: url });
        pack.updateItems.push(jnm);
        pack.drawItems.push(jnm);
      }
      else if (file != null && infos.ext == 'jlm') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jlm = new Motion();
        await jlm.loadFromFile(url);
        pack.jlm.set(infos.name, { name: infos.name, ext: 'jlm', object: jlm, blobUrl: url });
        pack.updateItems.push(jlm);
        pack.drawItems.push(jlm);
      }
      else if (file != null && infos.ext == 'blm') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jlm = new Motion();
        await jlm.loadFromBinaryFile(url);
        pack.jlm.set(infos.name, { name: infos.name, ext: 'blm', object: jlm, blobUrl: url });
        pack.updateItems.push(jlm);
        pack.drawItems.push(jlm);
      }
      else if (file != null && infos.ext == 'crv') {
        const url = URL.createObjectURL(await file.async('blob'));
        const crv = await Curve.createFromFile(url);
        pack.crv.set(infos.name, { name: infos.name, ext: 'crv', object: crv, blobUrl: url });
      }
      else if (file != null && infos.ext == 'jsv') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jsv = new Gfx3ShadowVolume();
        await jsv.loadFromFile(url);
        pack.jsv.set(infos.name, { name: infos.name, ext: 'jsv', object: jsv, blobUrl: url });
        pack.updateItems.push(jsv);
        pack.drawItems.push(jsv);
      }
      else if (file != null && infos.ext == 'bsv') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jsv = new Gfx3ShadowVolume();
        await jsv.loadFromBinaryFile(url);
        pack.jsv.set(infos.name, { name: infos.name, ext: 'bsv', object: jsv, blobUrl: url });
        pack.updateItems.push(jsv);
        pack.drawItems.push(jsv);
      }
      else if (file != null && infos.ext == 'jlt') {
        const url = URL.createObjectURL(await file.async('blob'));
        const jlt = new Gfx3MeshLight();
        await jlt.loadFromFile(url);
        pack.jlt.set(infos.name, { name: infos.name, ext: 'jlt', object: jlt, blobUrl: url });
        pack.drawItems.push(jlt);
      }
      else if (file != null && infos.ext == 'grf') {
        const url = URL.createObjectURL(await file.async('blob'));
        const grf = new AIPathGraph3D();
        await grf.loadFromFile(url);
        pack.grf.set(infos.name, { name: infos.name, ext: 'grf', object: grf, blobUrl: url });
      }
      else if (file != null && infos.ext == 'grd') {
        const url = URL.createObjectURL(await file.async('blob'));
        const grd = new AIPathGrid3D();
        await grd.loadFromFile(url);
        pack.grd.set(infos.name, { name: infos.name, ext: 'grd', object: grd, blobUrl: url });
      }
      else if (file != null && infos.ext == 'ent') {
        const url = URL.createObjectURL(await file.async('blob'));
        const entity = await createEntityFromFile(url);
        pack.ent.set(infos.name, { name: infos.name, ext: 'ent', object: entity, blobUrl: url });
      }
      else if (file != null) {
        const url = URL.createObjectURL(await file.async('blob'));
        const blob = await fileManager.loadFile(url, entry.name);
        pack.bin.set(infos.name, { name: infos.name, ext: infos.ext, object: blob, blobUrl: url });
      }
    }

    for (const item of [...pack.jsm.values(), ...pack.jam.values()]) {
      const material = pack.mat.getObject(item.name);
      item.object.setMaterial(material);
    }

    if (!updated) {
      pack.updateItems = [];
      pack.drawItems = [];
    }

    return pack;
  }

  /**
   * Met à jour la caméra et toutes les ressources inscrites dans la liste de mise à jour.
   *
   * @param ts - Temps écoulé depuis la dernière mise à jour, en millisecondes.
   */
  update(ts: number) {
    this.camera.update(ts);

    for (const item of this.updateItems) {
      item.update(ts);
    }
  }

  /** Ajoute au rendu toutes les ressources inscrites dans la liste de dessin. */
  draw() {
    for (const item of this.drawItems) {
      item.draw();
    }
  }

  /**
   * Ajoute une ressource à la liste de mise à jour.
   *
   * @param item - Ressource possédant une méthode `update`.
   */
  addUpdateItem(item: any) {
    this.updateItems.push(item);
  }

  /**
   * Retire une ressource de la liste de mise à jour.
   *
   * @param item - Ressource à retirer.
   */
  removeUpdateItem(item: any) {
    this.updateItems.splice(this.updateItems.indexOf(item), 1);
  }

  /** Vide la liste des ressources à mettre à jour. */
  clearUpdateList() {
    this.updateItems = [];
  }

  /**
   * Ajoute une ressource à la liste de dessin.
   *
   * @param item - Ressource possédant une méthode `draw`.
   */
  addDrawItem(item: any) {
    this.drawItems.push(item);
  }

  /**
   * Retire une ressource de la liste de dessin.
   *
   * @param item - Ressource à retirer.
   */
  removeDrawItem(item: any) {
    this.drawItems.splice(this.drawItems.indexOf(item), 1);
  }

  /** Vide la liste des ressources à dessiner. */
  clearDrawList() {
    this.drawItems = [];
  }
}

export { EnginePack3D };