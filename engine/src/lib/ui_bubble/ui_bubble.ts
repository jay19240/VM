import { eventManager } from '../core/event_manager';
import { UIWidget } from '../ui/ui_widget';
import { UIMenuText } from '../ui_menu_text/ui_menu_text';

/**
 * Bulle de dialogue flottante affichant progressivement un texte et des actions facultatives.
 * Émet `E_PRINT_FINISHED` lorsque tout le contenu est affiché,
 * `E_MENU_ITEM_SELECTED` avec les données `{ id, index }` lors d'un choix, et `E_OK` après validation.
 */
export class UIBubble extends UIWidget {
  uiMenu: UIMenuText;
  text: string;
  actions: Array<string>;
  stepDuration: number;
  currentTextOffset: number;
  currentActionTextOffset: number;
  currentActionIndex: number;
  timeElapsed: number;
  finished: boolean;

  /** Crée une bulle de dialogue vide. */
  constructor() {
    super({
      className: 'UIBubble',
      template: `
      <img class="UIBubble-picture js-picture" src=""/>
      <div class="UIBubble-content">
        <div class="UIBubble-author js-author"></div>
        <div class="UIBubble-text js-text"></div>
        <div class="UIBubble-menu js-menu"></div>
      </div>`
    });

    this.uiMenu = new UIMenuText();
    this.text = '';
    this.actions = [];
    this.stepDuration = 0;
    this.currentTextOffset = 0;
    this.currentActionTextOffset = 0;
    this.currentActionIndex = 0;
    this.timeElapsed = 0;
    this.finished = false;

    this.node.querySelector<HTMLElement>('.js-menu')!.replaceWith(this.uiMenu.getNode());
    eventManager.subscribe(this.uiMenu, 'E_ITEM_SELECTED', this, this.#handleMenuItemSelected);
  }

  /**
   * Met à jour l'affichage progressif du texte et des actions.
   *
   * @param {number} ts - Pas de temps écoulé.
   */
  update(ts: number): void {
    this.uiMenu.update(ts);

    if (this.currentTextOffset == this.text.length && this.currentActionIndex == this.actions.length) {
      this.finished = true;
      eventManager.emit(this, 'E_PRINT_FINISHED');
      return;
    }

    if (this.timeElapsed >= this.stepDuration) {
      if (this.currentTextOffset < this.text.length) {
        this.node.querySelector<HTMLElement>('.js-text')!.textContent = this.text.substring(0, this.currentTextOffset + 1);
        this.currentTextOffset++;
      }
      else if (this.currentActionIndex < this.actions.length) {
        if (this.currentActionTextOffset == 0) {
          this.uiMenu.add(this.currentActionIndex.toString(), '');
        }

        if (this.currentActionTextOffset < this.actions[this.currentActionIndex].length) {
          this.uiMenu.set(this.currentActionIndex.toString(), this.actions[this.currentActionIndex].substring(0, this.currentActionTextOffset + 1));
          this.currentActionTextOffset++;
        }
        else {
          this.currentActionIndex++;
          this.currentActionTextOffset = 0;
        }
      }

      this.timeElapsed = 0;
    }
    else {
      this.timeElapsed += ts;
    }
  }

  /**
   * Libère le menu, ses abonnements et les ressources héritées du composant.
   */
  delete(): void {
    eventManager.unsubscribe(this.uiMenu, 'E_ITEM_SELECTED', this);
    this.uiMenu.delete();
    super.delete();
  }

  /**
   * Donne le focus à la bulle et, lorsque des actions existent, à son menu.
   */
  focus(): void {
    if (this.actions.length > 0) {
      this.uiMenu.focus();
    }

    super.focus();
  }

  /**
   * Retire le focus de la bulle et, lorsque des actions existent, de son menu.
   */
  unfocus(): void {
    if (this.actions.length > 0) {
      this.uiMenu.unfocus();
    }

    super.unfocus();
  }

  /**
   * Définit l'avatar de l'auteur du dialogue.
   *
   * @param {string} pictureFile - Chemin du fichier image.
   */
  setPicture(pictureFile: string): void {
    this.node.querySelector<HTMLImageElement>('.js-picture')!.src = pictureFile;
  }

  /**
   * Définit le nom de l'auteur du dialogue.
   *
   * @param {string} author - Nom de l'auteur.
   */
  setAuthor(author: string): void {
    this.node.querySelector<HTMLElement>('.js-author')!.textContent = author;
  }

  /**
   * Définit la largeur de la bulle.
   *
   * @param {number} width - Largeur en pixels.
   */
  setWidth(width: number): void {
    this.node.style.width = width + 'px';
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
  }

  /**
   * Remplace les actions du menu et réinitialise leur affichage progressif.
   *
   * @param actions - Liste des libellés d'action.
   */
  setActions(actions: Array<string>): void {
    this.actions = actions;
    this.currentActionIndex = 0;
    this.currentActionTextOffset = 0;
    this.finished = false;
    this.uiMenu.clear();
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

  #handleMenuItemSelected(data: any): void {
    eventManager.emit(this, 'E_MENU_ITEM_SELECTED', data);
  }
}