import Stats from 'stats.js';
// ---------------------------------------------------------------------------------------
import { coreManager } from '../core/core_manager';
import { inputManager } from '../input/input_manager';
import { screenManager } from '../screen/screen_manager';
import { uiManager } from '../ui/ui_manager';
import { soundManager } from '../sound/sound_manager';
// ---------------------------------------------------------------------------------------

const DEFAULT_FRAME_RATE = 60;

/**
 * Gestionnaire singleton de la boucle principale du moteur.
 */
export class EngineManager {
  then: number;
  delta: number;
  timeStamp: number;
  frameRate: number;
  paused: boolean;
  lastAnimationFrameId: number;
  pauseStartTime: number;
  stats: Stats;

  /**
   * Initialise la boucle principale, le suivi des performances et la gestion de la visibilité de la page.
   */
  constructor() {
    this.then = 0;
    this.timeStamp = 0;
    this.delta = 0;
    this.frameRate = DEFAULT_FRAME_RATE;
    this.paused = false;
    this.lastAnimationFrameId = 0;
    this.pauseStartTime = 0;
    this.stats = new Stats();

    this.stats.showPanel(0);
    this.stats.dom.style.display = 'none';
    this.stats.dom.style.position = 'relative';
    this.stats.dom.style.float = 'right';
    document.getElementById('APP')!.appendChild(this.stats.dom);

    document.addEventListener('visibilitychange', () => this.#handleVisibilityChange());
  }

  /**
   * Démarre le moteur et lance la boucle principale.
   *
   * @param {boolean} [enableScanlines=true] - Indique si l'effet de lignes de balayage doit être activé.
   */
  startup(enableScanlines: boolean = true): void {
    coreManager.enableScanlines(enableScanlines);
    this.run(0);
  }

  /**
   * Exécute une itération de la boucle principale et planifie la suivante.
   *
   * @param {number} timeStamp - Horodatage courant fourni par l'API d'animation, en millisecondes.
   * @param {'pause' | 'resume' | 'normal'} [state='normal'] - Transition d'état à appliquer à la boucle.
   */
  run(timeStamp: number, state: 'pause' | 'resume' | 'normal' = 'normal'): void {
    this.stats.begin();
    this.timeStamp = timeStamp;

    if (state === 'pause') {
      this.pauseStartTime = timeStamp;
      cancelAnimationFrame(this.lastAnimationFrameId);
      return;
    }

    if (state === 'resume') {
      const pauseDuration = timeStamp - this.pauseStartTime;
      this.then = this.then + pauseDuration;
    }

    const frameDuration = 1000 / this.frameRate;
    this.delta = (timeStamp - this.then) ;

    if (this.delta >= frameDuration) {
      this.then = timeStamp - (this.delta % frameDuration);

      inputManager.update(frameDuration);
      uiManager.update(frameDuration);
      screenManager.update(frameDuration);
      screenManager.draw();
      screenManager.render(frameDuration);

      this.stats.end();
    }

    this.lastAnimationFrameId = requestAnimationFrame(timeStamp => this.run(timeStamp));
  }

  /**
   * Définit la fréquence de rafraîchissement cible.
   *
   * @param {number} value - Nombre d'images par seconde.
   */
  setFrameRate(value: number): void {
    this.frameRate = value;
  }

  /**
   * Renvoie la fréquence de rafraîchissement cible.
   *
   * @returns Le nombre d'images par seconde.
   */
  getFrameRate(): number {
    return this.frameRate;
  }

  /**
   * Renvoie l'horodatage de la dernière itération de la boucle.
   *
   * @returns L'horodatage en millisecondes depuis le démarrage de l'application.
   */
  getTimeStamp(): number {
    return this.timeStamp;
  }

  /**
   * Renvoie le temps écoulé depuis la dernière image traitée.
   *
   * @returns L'intervalle en millisecondes.
   */
  getDelta(): number {
    return this.delta;
  }

  /**
   * Met en pause la boucle de mise à jour et le son.
   */
  pause(): void {
    if (this.paused) {
      return;
    }

    this.paused = true;
    this.run(performance.now(), 'pause');
    soundManager.pause();
  }

  /**
   * Reprend la boucle de mise à jour et le son après une pause.
   */
  resume(): void {
    if (!this.paused) {
      return;
    }

    this.paused = false;
    this.run(performance.now(), 'resume');
    soundManager.resume();
  }

  /**
   * Renvoie le moniteur de performances.
   *
   * @returns L'instance utilisée pour mesurer et afficher les statistiques.
   */
  getStats(): Stats {
    return this.stats;
  }

  /**
   * Affiche ou masque le panneau des statistiques.
   *
   * @param {boolean} show - `true` pour afficher le panneau, `false` pour le masquer.
   */
  showStats(show: boolean) {
    this.stats.dom.style.display = show ? 'block' : 'none';
  }

  #handleVisibilityChange() {
    if (document.hidden) {
      this.pause();
    }
    else {
      this.resume();
    }
  }
}

/** Instance partagée du gestionnaire de la boucle principale. */
export const em = new EngineManager();