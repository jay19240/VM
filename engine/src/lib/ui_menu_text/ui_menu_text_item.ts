import { UIWidget } from '../ui/ui_widget';

/** Composant représentant un élément textuel simple dans un menu. */
export class UIMenuTextItem extends UIWidget {
  /** Crée un élément de menu textuel vide. */
  constructor() {
    super({
      className: 'UIMenuTextItem'
    });
  }

  /**
   * Définit le texte de l'élément.
   *
   * @param {string} text - Texte à afficher.
   */
  setText(text: string): void {
    this.node.textContent = text;
  }
}