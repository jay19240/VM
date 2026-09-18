import { eventManager } from '../core/event_manager';
import { inputManager } from '../input/input_manager';

/**
 * Élément de base d'un composant d'interface utilisateur.
 * Émet `E_FOCUSED` lors de la prise de focus, `E_UNFOCUSED` lors de sa perte
 * et `E_ANIMATION_FINISHED` à la fin d'une animation CSS.
 */
export class UIWidget {
  id: string;
  className: string;
  template: string;
  node: HTMLDivElement;

  /**
   * Crée un composant d'interface utilisateur.
   *
   * @param options - Options définissant l'identifiant, la classe CSS et le modèle HTML du composant.
   */
  constructor(options: { id?: string, className?: string, template?: string } = {}) {
    this.id = options.id ?? '';
    this.className = options.className ?? '';
    this.template = options.template ?? '';
    this.node = document.createElement('div');
    this.node.className = this.className;
    this.node.innerHTML = this.template;

    this.node.addEventListener('animationend', () => eventManager.emit(this, 'E_ANIMATION_FINISHED'));
  }

  /**
   * Met à jour le composant. Cette méthode est destinée à être redéfinie par les sous-classes.
   *
   * @param {number} ts - Pas de temps écoulé.
   */
  update(ts: number): void {}

  /**
   * Libère les ressources du composant et le retire du DOM.
   * Cette méthode doit être appelée explicitement pour supprimer les abonnements associés.
   */
  delete(): void {
    this.node.remove();
    eventManager.unsubscribe(inputManager, 'E_ACTION', this);
  }

  /**
   * Renvoie l'identifiant du composant.
   *
   * @returns L'identifiant du composant.
   */
  getId(): string {
    return this.id;
  }

  /**
   * Définit l'identifiant du composant et de son élément racine.
   *
   * @param {string} id - Identifiant unique du composant.
   */
  setId(id: string): void {
    this.id = id;
    this.node.id = id;
  }

  /**
   * Renvoie l'élément HTML racine du composant.
   *
   * @returns L'élément racine.
   */
  getNode(): HTMLDivElement {
    return this.node;
  }

  /**
   * Ajoute un élément enfant à la racine du composant.
   *
   * @param {HTMLElement} child - Élément enfant à ajouter.
   */
  appendChild(child: HTMLElement): void {
    this.node.appendChild(child);
  }

  /**
   * Retire l'élément enfant situé à l'indice indiqué.
   *
   * @param {number} index - Indice de l'élément enfant.
   * @throws {DOMException} Si aucun enfant ne correspond à cet indice.
   */
  removeChild(index: number): void {
    this.node.removeChild(this.node.children[index]);
  }

  /**
   * Ajoute des déclarations CSS en ligne à l'élément racine.
   *
   * @param {string} styles - Déclarations CSS à ajouter.
   */
  appendStyles(styles: string): void {
    this.node.style.cssText += styles;
  }

  /**
   * Donne le focus au composant.
   * Ajoute la classe `u-focused`, émet `E_FOCUSED` et s'abonne aux actions de saisie.
   */
  focus(): void {
    this.node.classList.add('u-focused');
    eventManager.emit(this, 'E_FOCUSED');
    eventManager.subscribe(inputManager, 'E_ACTION', this, (data: any) => this.onAction(data.actionId));
  }

  /**
   * Retire le focus du composant.
   * Supprime la classe `u-focused`, émet `E_UNFOCUSED` et se désabonne des actions de saisie.
   */
  unfocus(): void {
    this.node.classList.remove('u-focused');
    eventManager.emit(this, 'E_UNFOCUSED');
    eventManager.unsubscribe(inputManager, 'E_ACTION', this);
  }

  /**
   * Indique si le composant possède le focus.
   *
   * @returns `true` si le composant possède le focus, sinon `false`.
   */
  isFocused(): boolean {
    return this.node.classList.contains('u-focused');
  }

  /**
   * Définit la visibilité du composant en modifiant la classe `u-hidden` de sa racine.
   *
   * @param {boolean} visible - `true` pour afficher le composant, `false` pour le masquer.
   */
  setVisible(visible: boolean): void {
    if (visible) {
      this.node.classList.remove('u-hidden');
    }
    else {
      this.node.classList.add('u-hidden');
    }
  }

  /**
   * Indique si le composant est visible.
   *
   * @returns `true` si le composant n'est pas masqué, sinon `false`.
   */
  isVisible(): boolean {
    return !this.node.classList.contains('u-hidden');
  }

  /**
   * Définit l'état activé du composant en modifiant la classe `u-disabled` de sa racine.
   *
   * @param {boolean} enabled - `true` pour activer le composant, `false` pour le désactiver.
   */
  setEnabled(enabled: boolean): void {
    if (enabled) {
      this.node.classList.remove('u-disabled');
    }
    else {
      this.node.classList.add('u-disabled');
    }
  }

  /**
   * Indique si le composant est activé.
   *
   * @returns `true` si le composant est activé, sinon `false`.
   */
  isEnabled(): boolean {
    return !this.node.classList.contains('u-disabled');
  }

  /**
   * Définit l'état sélectionné du composant en modifiant la classe `u-selected` de sa racine.
   *
   * @param {boolean} selected - `true` pour sélectionner le composant, `false` pour le désélectionner.
   */
  setSelected(selected: boolean): void {
    if (selected) {
      this.node.classList.add('u-selected');
    }
    else {
      this.node.classList.remove('u-selected');
    }
  }

  /**
   * Indique si le composant est sélectionné.
   *
   * @returns `true` si le composant est sélectionné, sinon `false`.
   */
  isSelected(): boolean {
    return this.node.classList.contains('u-selected');
  }

  /**
   * Renvoie les coordonnées écran du coin supérieur gauche du composant.
   *
   * @returns Les coordonnées `[gauche, haut]` exprimées dans le repère de la zone d'affichage.
   */
  getScreenPosition(): vec2 {
    let rect = this.node.getBoundingClientRect();
    return [rect.left, rect.top];
  }

  /**
   * Renvoie la position relative définie par les styles `left` et `top` du composant.
   *
   * @returns Les coordonnées `[x, y]` en pixels.
   */
  getPosition(): vec2 {
    const x = parseInt(this.node.style.left);
    const y = parseInt(this.node.style.top);
    return [x, y];
  }

  /**
   * Définit la position gauche et haute du composant.
   * Cette méthode n'a d'effet visuel que si le positionnement CSS le permet, notamment avec `absolute`.
   *
   * @param {number} x - Position horizontale en pixels.
   * @param {number} y - Position verticale en pixels.
   */
  setPosition(x: number, y: number): void {
    this.node.style.left = x + 'px';
    this.node.style.top = y + 'px';
  }

  /**
   * Lance une animation CSS sur l'élément racine du composant.
   *
   * @param {string} animation - Valeur à affecter à la propriété CSS `animation`.
   */
  animate(animation: string): void {
    this.node.style.animation = animation;
  }

  /**
   * Traite une action de saisie. Cette méthode est destinée à être redéfinie par les sous-classes.
   *
   * @param {string} actionId - Identifiant de l'action.
   */
  onAction(actionId: string): void {}

  /**
   * Recherche un élément descendant de la racine du composant.
   *
   * @typeParam T - Type d'élément attendu.
   * @param {string} selector - Sélecteur CSS à rechercher.
   * @returns Le premier élément correspondant.
   * @throws {Error} Si aucun élément ne correspond au sélecteur.
   */
  query<T extends Element = HTMLElement>(selector: string): T {
    const element = this.node.querySelector(selector) as T | null;
    if (!element) {
      throw new Error(`UIWidget::query(): element "${selector}" not found in root!`);
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
    return this.node.querySelectorAll<T>(selector);
  }

  /**
   * Renvoie l'élément HTML racine du composant.
   *
   * @returns L'élément racine.
   */
  get element() {
    return this.node;
  }
}
