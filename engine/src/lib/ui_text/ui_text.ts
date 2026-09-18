import { UIWidget } from '../ui/ui_widget';

/** Composant affichant un texte simple. */
export class UIText extends UIWidget {
  /** Crée un composant textuel vide. */
  constructor() {
    super({
      className: 'UIText',
      template: '<span class="UIText-text js-text"></span>'
    });
  }

  /**
   * Définit le contenu textuel du composant.
   *
   * @param {string} text - Texte à afficher.
   */
  setText(text: string): void {
    this.node.querySelector('.js-text')!.textContent = text;
  }
}