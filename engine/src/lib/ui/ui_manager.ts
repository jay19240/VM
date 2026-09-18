import { eventManager } from '../core/event_manager';
import { UIWidget } from './ui_widget';

/**
 * Gestionnaire central des composants d'interface utilisateur.
 * Émet `E_FOCUSED` avec les données `{ widget }` lors d'une prise de focus
 * et `E_UNFOCUSED` lorsque le focus est retiré.
 */
export class UIManager {
  root: HTMLDivElement;
  fadeLayer: HTMLDivElement;
  overLayer: HTMLDivElement;
  focusedWidget: UIWidget | null;
  widgets: Array<UIWidget>;

  /**
   * Crée le gestionnaire et récupère les calques racine de l'interface dans le DOM.
   */
  constructor() {
    this.root = <HTMLDivElement>document.getElementById('UI_ROOT');
    this.fadeLayer = <HTMLDivElement>document.getElementById('UI_FADELAYER');
    this.overLayer = <HTMLDivElement>document.getElementById('UI_OVERLAYER');
    this.focusedWidget = null;
    this.widgets = [];
  }

  /**
   * Met à jour tous les composants enregistrés.
   *
   * @param {number} ts - Pas de temps écoulé.
   */
  update(ts: number): void {
    for (let widget of this.widgets) {
      widget.update(ts);
    }
  }

  /**
   * Renvoie tous les composants enregistrés.
   *
   * @returns La liste des composants.
   */
  getWidgets(): Array<UIWidget> {
    return this.widgets;
  }

  /**
   * Renvoie le composant possédant le focus.
   *
   * @returns Le composant actif, ou `null` si aucun composant ne possède le focus.
   */
  getFocusedWidget(): UIWidget | null {
    return this.focusedWidget;
  }

  /**
   * Donne le focus à un composant après l'avoir retiré du composant actif, puis émet `E_FOCUSED`.
   *
   * @param {UIWidget} widget - Composant auquel donner le focus.
   */
  focus(widget: UIWidget): void {
    if (this.focusedWidget) {
      this.focusedWidget.unfocus();
    }

    widget.focus();
    this.focusedWidget = widget;
    eventManager.emit(this, 'E_FOCUSED', { widget: widget });
  }

  /**
   * Retire le focus du composant actif, s'il existe, puis émet `E_UNFOCUSED`.
   */
  unfocus(): void {
    if (!this.focusedWidget) {
      return;
    }

    this.focusedWidget.unfocus();
    this.focusedWidget = null;
    eventManager.emit(this, 'E_UNFOCUSED');
  }

  /**
   * Ajoute un élément HTML à la racine de l'interface.
   *
   * @param {HTMLElement} node - Élément HTML à ajouter.
   * @param {string} [styles] - Déclarations CSS en ligne à appliquer à l'élément.
   */
  addNode(node: HTMLElement, styles: string = ''): void {
    node.style.cssText += styles;
    this.root.appendChild(node);
  }

  /**
   * Retire un élément HTML de la racine de l'interface.
   *
   * @param {HTMLElement} node - Élément HTML à retirer.
   * @throws {DOMException} Si l'élément n'est pas un enfant de la racine.
   */
  removeNode(node: HTMLElement): void {
    this.root.removeChild(node);
  }

  /**
   * Enregistre un composant, l'ajoute à la racine de l'interface et le renvoie.
   *
   * @param {UIWidget} widget - Composant à ajouter.
   * @param {string} [styles] - Déclarations CSS en ligne à appliquer au composant.
   * @returns Le composant ajouté.
   */
  addWidget(widget: UIWidget, styles: string = ''): UIWidget {
    widget.appendStyles(styles);
    this.root.appendChild(widget.getNode());
    this.widgets.push(widget);
    return widget;
  }

  /**
   * Retire et détruit un composant enregistré.
   *
   * @param {UIWidget} widget - Composant à retirer.
   * @returns Toujours `true` lorsque le composant a été retiré.
   * @throws {Error} Si le composant n'est pas enregistré.
   */
  removeWidget(widget: UIWidget): boolean {
    const index = this.widgets.indexOf(widget);
    if (index == -1) {
      throw new Error('UIManager::removeWidget: fail to remove widget !');
    }

    if (widget == this.focusedWidget) {
      this.unfocus();
    }

    widget.delete();
    this.widgets.splice(index, 1);
    return true;
  }

  /**
   * Retire tous les nœuds et détruit tous les composants enregistrés.
   */
  clear(): void {
    this.root.innerHTML = '';
    this.focusedWidget = null;

    while (this.widgets.length > 0) {
      let widget = this.widgets.pop()!;
      widget.delete();
    }
  }

  /**
   * Fait apparaître le calque de fondu à l'écran.
   *
   * @param {number} delay - Délai avant le début du fondu, en millisecondes.
   * @param {number} ms - Durée du fondu, en millisecondes.
   * @param {string} [color=#000] - Couleur du fondu.
   * @param {string} [transitionTimingFunction=linear] - Fonction temporelle de la transition CSS.
   * @param {Function} cb - Fonction appelée après le délai et la durée du fondu.
   */
  fadeIn(delay: number, ms: number, color: string = '#000', transitionTimingFunction: string = 'linear', cb: Function = () => { }): void {
    this.fadeLayer.style.transitionDelay = delay + 'ms';
    this.fadeLayer.style.transitionDuration = ms + 'ms';
    this.fadeLayer.style.backgroundColor = color;
    this.fadeLayer.style.transitionTimingFunction = transitionTimingFunction;
    this.fadeLayer.style.opacity = '1';
    setTimeout(() => { cb(); }, delay + ms);
  }

  /**
   * Fait disparaître le calque de fondu de l'écran.
   *
   * @param {number} delay - Délai avant le début du fondu, en millisecondes.
   * @param {number} ms - Durée du fondu, en millisecondes.
   * @param {string} [transitionTimingFunction=linear] - Fonction temporelle de la transition CSS.
   * @param {Function} cb - Fonction appelée après le délai et la durée du fondu.
   */
  fadeOut(delay: number, ms: number, transitionTimingFunction: string = 'linear', cb: Function = () => { }): void {
    this.fadeLayer.style.transitionDuration = ms + 'ms';
    this.fadeLayer.style.transitionDelay = delay + 'ms';
    this.fadeLayer.style.transitionTimingFunction = transitionTimingFunction;
    this.fadeLayer.style.opacity = '0';
    setTimeout(() => { cb(); }, delay + ms);
  }

  /**
   * Active ou désactive le calque de superposition.
   *
   * @param {boolean} enable - `true` pour rendre le calque opaque, `false` pour le rendre transparent.
   */
  enableOverlayer(enable: boolean) {
    this.overLayer.style.opacity = (enable) ? '1' : '0';
  }

  /**
   * Définit les classes CSS de l'élément racine de l'interface.
   *
   * @param {string} className - Liste des classes CSS.
   */
  setClassName(className: string): void {
    this.root.className = className;
  }

  /**
   * Recherche un élément descendant de la racine de l'interface.
   *
   * @typeParam T - Type d'élément attendu.
   * @param {string} selector - Sélecteur CSS à rechercher.
   * @returns Le premier élément correspondant.
   * @throws {Error} Si aucun élément ne correspond au sélecteur.
   */
  query<T extends Element = HTMLElement>(selector: string): T {
    const element = this.root.querySelector(selector) as T | null;
    if (!element) {
      throw new Error(`UIManager::query(): element "${selector}" not found in root!`);
    }

    return element;
  }

  /**
   * Recherche tous les éléments descendants correspondant à un sélecteur CSS.
   *
   * @typeParam T - Type d'élément attendu.
   * @param {string} selector - Sélecteur CSS à rechercher.
   * @returns La liste statique des éléments correspondants.
   */
  queryAll<T extends Element = HTMLElement>(selector: string): NodeListOf<T> {
    return this.root.querySelectorAll<T>(selector);
  }
}

/** Instance partagée du gestionnaire d'interface utilisateur. */
export const uiManager = new UIManager();