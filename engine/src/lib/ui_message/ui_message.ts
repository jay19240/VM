import { eventManager } from '../core/event_manager';
import { UIWidget } from '../ui/ui_widget';

/**
 * Message illustré fixé en bas de l'écran, avec texte et nom d'auteur.
 * Émet `E_PRINT_FINISHED` à la fin de l'affichage progressif et `E_OK` après validation.
 */
export class UIMessage extends UIWidget {
  text: string;
  stepDuration: number;
  currentTextOffset: number;
  timeElapsed: number;
  finished: boolean;

  /** Crée un message vide. */
  constructor() {
    super({
      className: 'UIMessage',
      template: `
      <div class="UIMessage-inner">
        <div class="UIMessage-picture js-picture"></div>
        <div class="UIMessage-textbox">
          <div class="UIMessage-textbox-author js-author"></div>
          <div class="UIMessage-textbox-text js-text"></div>
          <div class="UIMessage-textbox-next js-next"></div>
        </div>
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
   * Définit l'avatar de l'auteur du message.
   *
   * @param {string} pictureFile - Chemin du fichier image.
   */
  setPicture(pictureFile: string): void {
    this.node.querySelector<HTMLElement>('.js-picture')!.innerHTML = '<img class="UIMessage-picture-img" src="' + pictureFile + '">';
  }

  /**
   * Définit le nom de l'auteur du message.
   *
   * @param {string} author - Nom de l'auteur.
   */
  setAuthor(author: string): void {
    this.node.querySelector<HTMLElement>('.js-author')!.textContent = author;
  }

  /**
   * Définit le texte du message et relance son affichage progressif.
   *
   * @param {string} text - Texte du message.
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