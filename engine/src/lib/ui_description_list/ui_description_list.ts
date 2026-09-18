import { UIWidget } from '../ui/ui_widget';

/** Composant affichant une liste descriptive d'éléments composés d'un libellé et d'une valeur. */
export class UIDescriptionList extends UIWidget {
  /** Crée une liste descriptive vide. */
  constructor() {
    super({
      className: 'UIDescriptionList'
    });
  }

  /**
   * Ajoute un élément à la liste.
   *
   * @param {string} id - Identifiant unique de l'élément.
   * @param {string} label - Libellé ou nom de l'élément.
   * @param {string} value - Valeur à afficher.
   */
  addItem(id: string, label: string, value: string): void {
    const tpl = document.createElement('template');
    tpl.innerHTML = `
    <span class="UIDescriptionList-item js-${id}">
      <span class="UIDescriptionList-item-label js-label">${label}</span>
      <span class="UIDescriptionList-item-value js-value">${value}</span>
    </span>`;

    this.node.appendChild(tpl.content);
  }

  /**
   * Retire un élément de la liste.
   *
   * @param {string} id - Identifiant unique de l'élément.
   * @throws {Error} Si aucun élément ne possède cet identifiant.
   */
  removeItem(id: string): void {
    const item = this.node.querySelector('.js-' + id);
    if (!item) {
      throw new Error('UIDescriptionList::removeItem(): item not found !');
    }

    this.node.removeChild(item);
  }

  /**
   * Modifie la valeur affichée d'un élément.
   *
   * @param {string} id - Identifiant unique de l'élément.
   * @param {string} value - Nouvelle valeur.
   * @throws {Error} Si aucun élément ne possède cet identifiant.
   */
  setItem(id: string, value: string): void {
    const item = this.node.querySelector('.js-' + id);
    if (!item) {
      throw new Error('UIDescriptionList::setItem(): item not found !');
    }

    item.querySelector<HTMLElement>('.js-value')!.textContent = value;
  }

  /**
   * Renvoie la valeur affichée d'un élément.
   *
   * @param {string} id - Identifiant unique de l'élément.
   * @returns La valeur de l'élément, ou une chaîne vide si son contenu est absent.
   * @throws {Error} Si aucun élément ne possède cet identifiant.
   */
  getItemValue(id: string): string {
    const item = this.node.querySelector<HTMLElement>('.js-' + id);
    if (!item) {
      throw new Error('UIDescriptionList::getItemValue(): item not found !');
    }

    const value = item.querySelector<HTMLElement>('.js-value')!.textContent;
    return value ? value : '';
  }

  /**
   * Indique si un élément est visible.
   *
   * @param {string} id - Identifiant unique de l'élément.
   * @returns `true` si l'élément n'est pas masqué, sinon `false`.
   * @throws {Error} Si aucun élément ne possède cet identifiant.
   */
  isItemVisible(id: string): boolean {
    const item = this.node.querySelector<HTMLElement>('.js-' + id);
    if (!item) {
      throw new Error('UIDescriptionList::getItemVisible(): item not found !');
    }

    return !item.classList.contains('u-hidden');
  }

  /**
   * Définit la visibilité d'un élément.
   *
   * @param {string} id - Identifiant unique de l'élément.
   * @param {boolean} visible - `true` pour afficher l'élément, `false` pour le masquer.
   * @throws {Error} Si aucun élément ne possède cet identifiant.
   */
  setItemVisible(id: string, visible: boolean): void {
    const item = this.node.querySelector<HTMLElement>('.js-' + id);
    if (!item) {
      throw new Error('UIDescriptionList::setItemVisible(): item not found !');
    }

    if (visible) {
      item.classList.remove('u-hidden');
    }
    else {
      item.classList.add('u-hidden');
    }
  }

  /** Retire tous les éléments de la liste. */
  clear() {
    this.node.innerHTML = '';
  }
}