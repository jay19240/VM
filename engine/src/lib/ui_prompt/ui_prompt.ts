import { eventManager } from '../core/event_manager';
import { UIWidget } from '../ui/ui_widget';
import { UIMenuAxis } from '../ui_menu/ui_menu';
import { UIMenuText } from '../ui_menu_text/ui_menu_text';

/**
 * Invite affichant un texte et un menu d'actions.
 * Émet `E_ITEM_SELECTED` avec les données `{ id, index }` lorsqu'une action est choisie.
 */
export class UIPrompt extends UIWidget {
  uiMenu: UIMenuText;

  /** Crée une invite vide avec un menu horizontal. */
  constructor() {
    super({
      className: 'UIPrompt',
      template: `
      <div class="UIPrompt-text js-text"></div>
      <div class="UIPrompt-menu js-menu"></div>`
    });

    this.uiMenu = new UIMenuText({ axis: UIMenuAxis.X });
    this.node.querySelector('.js-menu')!.replaceWith(this.uiMenu.getNode());
    eventManager.subscribe(this.uiMenu, 'E_ITEM_SELECTED', this, this.#handleMenuItemSelected);
  }

  /**
   * Met à jour le menu d'actions.
   *
   * @param {number} ts - Pas de temps écoulé.
   */
  update(ts: number): void {
    this.uiMenu.update(ts);
  }

  /** Libère le menu d'actions et les ressources héritées du composant. */
  delete(): void {
    this.uiMenu.delete();
    super.delete();
  }

  /** Donne le focus à l'invite et à son menu d'actions. */
  focus(): void {
    this.uiMenu.focus();
    super.focus();
  }

  /** Retire le focus de l'invite et de son menu d'actions. */
  unfocus(): void {
    this.uiMenu.unfocus();
    super.unfocus();
  }

  /**
   * Définit le texte de l'invite.
   *
   * @param {string} text - Texte à afficher.
   */
  setText(text: string): void {
    this.node.querySelector('.js-text')!.textContent = text;
  }

  /**
   * Ajoute une action au menu.
   *
   * @param {string} id - Identifiant unique de l'action.
   * @param {string} text - Libellé de l'action.
   */
  addAction(id: string, text: string): void {
    this.uiMenu.add(id, text);
  }

  /**
   * Retire une action du menu.
   *
   * @param {string} id - Identifiant unique de l'action.
   * @throws {Error} Si aucune action ne possède cet identifiant.
   */
  removeAction(id: string): void {
    this.uiMenu.remove(id);
  }

  /** Retire toutes les actions du menu. */
  clearActions() {
    this.uiMenu.clear();
  }

  #handleMenuItemSelected(data: any) {
    eventManager.emit(this, 'E_ITEM_SELECTED', data);
  }
}