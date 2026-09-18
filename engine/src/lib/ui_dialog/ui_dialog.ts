import { eventManager } from '../core/event_manager';
import { UIWidget } from '../ui/ui_widget';

/**
 * Boîte de dialogue fixée en bas de l'écran, avec texte et nom d'auteur.
 * Émet `E_PRINT_FINISHED` à la fin de l'affichage progressif et `E_OK` après validation.
 */
export class UIDialog extends UIWidget {
  text: string;
  stepDuration: number;
  currentTextOffset: number;
  timeElapsed: number;
  finished: boolean;

  /** Crée une boîte de dialogue vide. */
  constructor() {
    super({
      className: 'UIDialog',
      template: `
      <div class="UIDialog-author js-author"></div>
      <div class="UIDialog-textbox">
        <div class="UIDialog-textbox-text js-text"></div>
        <div class="UIDialog-textbox-next js-next"></div>
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
      this.node.querySelector<any>('.js-next').style.display = 'block';
      eventManager.emit(this, 'E_PRINT_FINISHED');
      return;
    }

    if (this.timeElapsed >= this.stepDuration) {
      if (this.currentTextOffset < this.text.length) {
        this.node.querySelector<any>('.js-text').textContent = this.text.substring(0, this.currentTextOffset + 1);
        this.currentTextOffset++;
      }

      this.timeElapsed = 0;
    }
    else {
      this.timeElapsed += ts;
    }
  }

  /**
   * Définit le nom de l'auteur du dialogue.
   *
   * @param {string} author - Nom de l'auteur.
   */
  setAuthor(author: string): void {
    this.node.querySelector<any>('.UIDialog-author').textContent = author;
  }

  /**
   * Définit le texte du dialogue et relance son affichage progressif.
   *
   * @param {string} text - Texte du dialogue.
   */
  setText(text: string): void {
    this.text = text;
    this.currentTextOffset = 0;
    this.finished = false;
    this.node.querySelector<any>('.js-next').style.display = 'none';
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
  onAction(actionId: string): void {
    if (actionId == 'OK' && this.finished) {
      eventManager.emit(this, 'E_OK');
    }
  }

  #handleClick(): void {
    if (this.isFocused() && this.finished) {
      eventManager.emit(this, 'E_OK');
    }
  }
}