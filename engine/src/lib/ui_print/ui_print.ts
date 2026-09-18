import { eventManager } from '../core/event_manager';
import { UIWidget } from '../ui/ui_widget';

/**
 * Zone de lecture plein écran destinée aux textes longs.
 * Émet `E_PRINT_FINISHED` à la fin de l'affichage progressif et `E_OK` après validation.
 */
export class UIPrint extends UIWidget {
  text: string;
  stepDuration: number;
  currentTextOffset: number;
  timeElapsed: number;
  finished: boolean;

  /** Crée une zone de lecture vide. */
  constructor() {
    super({
      className: 'UIPrint',
      template: `
      <div class="UIPrint-textbox">
        <div class="UIPrint-textbox-text js-text"></div>
        <div class="UIPrint-textbox-next js-next"></div>
      </div>`
    });

    this.text = '';
    this.stepDuration = 0;
    this.currentTextOffset = 0;
    this.timeElapsed = 0;
    this.finished = false;

    this.node.addEventListener('click', () => this.#handleClick());
  }

  /**
   * Met à jour l'affichage progressif du texte.
   *
   * @param {number} ts - Pas de temps écoulé.
   */
  update(ts: number): void {
    if (this.finished) {
      return;
    }

    if (this.currentTextOffset == this.text.length) {
      this.finished = true;
      this.node.querySelector<HTMLElement>('.js-next')!.style.display = 'block';
      eventManager.emit(this, 'E_PRINT_FINISHED');
      return;
    }

    if (this.timeElapsed >= this.stepDuration) {
      if (this.currentTextOffset < this.text.length) {
        this.node.querySelector<HTMLElement>('.js-text')!.textContent = this.text.substring(0, this.currentTextOffset + 1);
        this.currentTextOffset++;
      }

      this.timeElapsed = 0;
    }
    else {
      this.timeElapsed += ts;
    }
  }

  /**
   * Définit le texte à lire et relance son affichage progressif.
   *
   * @param {string} text - Texte à afficher.
   */
  setText(text: string): void {
    this.text = text;
    this.currentTextOffset = 0;
    this.finished = false;
    this.node.querySelector<HTMLElement>('.js-next')!.style.display = 'none';
  }

  /**
   * Définit la vitesse d'affichage du texte.
   *
   * @param {number} stepDuration - Durée entre deux caractères affichés.
   */
  setStepDuration(stepDuration: number): void {
    this.stepDuration = stepDuration;
  }

  /**
   * Traite une action de saisie et émet `E_OK` lorsque l'action vaut `OK` et que l'affichage est terminé.
   *
   * @param {string} actionId - Identifiant de l'action.
   */
  onAction(actionId: string) {
    if (actionId === 'OK' && this.finished) {
      eventManager.emit(this, 'E_OK');
    }
  }

  #handleClick(): void {
    if (this.isFocused() && this.finished) {
      eventManager.emit(this, 'E_OK');
    }
  }
}