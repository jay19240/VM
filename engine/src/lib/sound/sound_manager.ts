/** Ressource sonore décodée et groupe auquel elle appartient. */
export interface Sound {
  buffer: AudioBuffer;
  groupId: string;
};

/** Réglages de volume et de sourdine d'un groupe de sons. */
export interface SoundGroup {
  muted: boolean;
  volume: number;
};

const DEFAULT_GROUP_ID = 'default';
const DEFAULT_GROUP = { muted: false, volume: 1 };

/** Gestionnaire singleton des sons fondé sur l'API Web Audio. */
export class SoundManager {
  audioContext: AudioContext;
  sounds: Map<string, Sound>;
  soundGroups: Map<string, SoundGroup>;
  activeSources: Map<string, { source: AudioBufferSourceNode, gainNode: GainNode }[]>;

  /** Crée le contexte audio et initialise les registres de sons et de groupes. */
  constructor() {
    this.audioContext = new AudioContext();
    this.sounds = new Map<string, Sound>();
    this.soundGroups = new Map<string, SoundGroup>();
    this.activeSources = new Map<string, { source: AudioBufferSourceNode, gainNode: GainNode }[]>();
  }

  /**
   * Point d'extension de mise à jour du gestionnaire audio.
   *
   * @param {number} ts - Temps écoulé depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number) {
    // empty.
  }

  /**
   * Charge et décode un son de façon asynchrone, puis le conserve en cache.
   *
   * @param {string} path - Chemin de la ressource audio à charger.
   * @param {string} groupId - Identifiant du groupe auquel rattacher le son.
   * @param {string} storePath - Clé de cache facultative ; le chemin de chargement est utilisé par défaut.
   * @returns Le son décodé et mis en cache.
   */
  async loadSound(path: string, groupId: string = DEFAULT_GROUP_ID, storePath: string = ''): Promise<Sound> {
    storePath = storePath ? storePath : path;

    const response = await fetch(path);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    const sound: Sound = {
      buffer: audioBuffer,
      groupId: groupId
    };

    this.sounds.set(storePath, sound);
    if (!this.soundGroups.has(groupId)) {
      this.soundGroups.set(groupId, { ...DEFAULT_GROUP });
    }

    return sound;
  }

  /**
   * Supprime un son du cache.
   *
   * @param {string} path - Clé sous laquelle le son est enregistré.
   * @throws Une erreur si aucun son n'est enregistré sous cette clé.
   */
  deleteSound(path: string): void {
    if (!this.sounds.has(path)) {
      throw new Error('SoundManager::deleteSound(): The sound file doesn\'t exist, cannot delete!');
    }

    this.sounds.delete(path);
  }

  /**
   * Lance la lecture d'un son mis en cache. Plusieurs instances d'un même son peuvent jouer simultanément.
   *
   * @param {string} path - Clé sous laquelle le son est enregistré.
   * @param {boolean} looped - `true` pour répéter le son en boucle.
   * @returns La source audio créée pour cette instance de lecture.
   * @throws Une erreur si aucun son n'est enregistré sous cette clé.
   */
  playSound(path: string, looped: boolean = false): AudioBufferSourceNode {
    if (!this.sounds.has(path)) {
      throw new Error('SoundManager::playSound(): The sound file doesn\'t exist, cannot play!');
    }

    const sound = this.sounds.get(path)!;
    const group = this.soundGroups.get(sound.groupId);

    const source = this.audioContext.createBufferSource();
    source.buffer = sound.buffer;
    source.loop = looped;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = group ? (group.muted ? 0 : group.volume) : 1;

    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    if (!this.activeSources.has(sound.groupId)) {
      this.activeSources.set(sound.groupId, []);
    }

    this.activeSources.get(sound.groupId)!.push({ source, gainNode });
    source.start(0);

    return source;
  }

  /**
   * Arrête une instance précise ou toutes les instances d'un son en cours de lecture.
   *
   * @param {string} path - Clé sous laquelle le son est enregistré.
   * @param {AudioBufferSourceNode} source - Instance précise à arrêter ; toutes sont arrêtées si elle est omise.
   * @throws Une erreur si aucun son n'est enregistré sous cette clé.
   */
  stopSound(path: string, source?: AudioBufferSourceNode): void {
    if (!this.sounds.has(path)) {
      throw new Error('SoundManager::stopSound(): The sound file doesn\'t exist, cannot stop!');
    }

    const sound = this.sounds.get(path)!;
    const activeSources = this.activeSources.get(sound.groupId);
    if (!activeSources) {
      return;
    }

    if (source) {
      source.stop();
      activeSources?.filter(({ source }) => source !== source);
    }
    else {
      this.#deleteActiveSound(sound);
    }
  }

  /**
   * Arrête toutes les sources actives d'un groupe.
   *
   * @param {string} groupId - Identifiant du groupe à arrêter.
   */
  stopSounds(groupId: string = DEFAULT_GROUP_ID): void {
    const activeSources = this.activeSources.get(groupId);
    if (!activeSources) {
      return;
    }

    activeSources.forEach(({ source }) => source.stop());
    this.activeSources.delete(groupId);
  }

  /** Arrête toutes les sources actives et vide le cache des sons. */
  releaseSounds() {
    for (const group of this.activeSources.values()) {
      group.forEach(({ source }) => source.stop());
    }

    this.activeSources.clear();
    this.sounds.clear();
  }

  /**
   * Active ou désactive la sourdine d'un groupe et actualise ses sources actives.
   *
   * @param {boolean} muted - `true` pour couper le son du groupe.
   * @param {string} groupId - Identifiant du groupe.
   * @throws Une erreur si le groupe n'existe pas.
   */
  mute(muted: boolean, groupId: string = DEFAULT_GROUP_ID): void {
    const group = this.soundGroups.get(groupId);
    if (!group) {
      throw new Error('SoundManager::mute(): Group not found!');
    }

    group.muted = muted;

    const sources = this.activeSources.get(groupId) || [];
    for (const { gainNode } of sources) {
      gainNode.gain.value = muted ? 0 : group.volume;
    }
  }

  /**
   * Définit le volume d'un groupe et actualise ses sources actives non muettes.
   *
   * @param {number} volume - Niveau de volume souhaité.
   * @param {string} groupId - Identifiant du groupe.
   * @throws Une erreur si le groupe n'existe pas.
   */
  setVolume(volume: number, groupId: string = DEFAULT_GROUP_ID): void {
    const group = this.soundGroups.get(groupId);
    if (!group) {
      throw new Error('SoundManager::setVolume(): Group not found!');
    }

    group.volume = volume;

    const sources = this.activeSources.get(groupId) || [];
    for (const { gainNode } of sources) {
      if (!group.muted) {
        gainNode.gain.value = volume;
      }
    }
  }

  /**
   * Consulte l'état de sourdine d'un groupe et resynchronise le gain de ses sources actives.
   *
   * @param {string} groupId - Identifiant du groupe.
   * @returns `true` si le groupe est muet.
   * @throws Une erreur si le groupe n'existe pas.
   */
  isMuted(groupId: string = DEFAULT_GROUP_ID): boolean {
    const group = this.soundGroups.get(groupId);
    if (!group) {
      throw new Error('SoundManager::isMuted(): Group not found!');
    }

    const sources = this.activeSources.get(groupId) || [];
    for (const { gainNode } of sources) {
      gainNode.gain.value = group.muted ? 0 : group.volume;
    }

    return group.muted;
  }

  /** Suspend le contexte audio et met ainsi en pause tous les sons. */
  pause(): void {
    this.audioContext.suspend();
  }

  /** Réactive le contexte audio et reprend tous les sons suspendus. */
  resume(): void {
    this.audioContext.resume();
  }

  /**
   * Réduit progressivement le gain de toutes les sources actives d'un groupe.
   *
   * @param {string} groupId - Identifiant du groupe.
   * @param {number} duration - Durée du fondu en secondes.
   */
  fadeOut(groupId: string = DEFAULT_GROUP_ID, duration: number = 1.0) {
    const sources = this.activeSources.get(groupId) || [];
    const endTime = this.audioContext.currentTime + duration;

    for (const { gainNode } of sources) {
      gainNode.gain.setValueAtTime(gainNode.gain.value, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, endTime);
    }
  }

  /**
   * Augmente progressivement le gain de toutes les sources actives d'un groupe jusqu'à son volume cible.
   *
   * @param {string} groupId - Identifiant du groupe.
   * @param {number} duration - Durée du fondu en secondes.
   */
  fadeIn(groupId: string = DEFAULT_GROUP_ID, duration: number = 1.0) {
    const group = this.soundGroups.get(groupId) || DEFAULT_GROUP;
    const sources = this.activeSources.get(groupId) || [];
    const endTime = this.audioContext.currentTime + duration;
    const targetVolume = group.muted ? 0 : group.volume;

    for (const { gainNode } of sources) {
      gainNode.gain.setValueAtTime(gainNode.gain.value, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(targetVolume, endTime);
    }
  }

  #deleteActiveSound(sound: Sound): void {
    const activeSources = this.activeSources.get(sound.groupId);
    if (!activeSources) {
      throw new Error('SoundManager::deleteActiveSound(): Active Sound not found!');
    }

    const filteredActiveSources = activeSources.filter(({ source }) => {
      if (source.buffer === sound.buffer) {
        source.stop();
      }

      return source.buffer !== sound.buffer;
    });

    this.activeSources.set(sound.groupId, filteredActiveSources);
  }
}

/** Instance partagée du gestionnaire de sons. */
export const soundManager = new SoundManager();