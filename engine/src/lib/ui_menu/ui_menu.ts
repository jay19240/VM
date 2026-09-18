import { eventManager } from '../core/event_manager';
import { UIWidget } from '../ui/ui_widget';

/** Mode de restauration du focus lors de l'activation d'un menu. */
export enum UIMenuFocus {
  AUTO = 0,
  NONE = 1
};

/** Axes selon lesquels le focus peut se déplacer dans un menu. */
export enum UIMenuAxis {
  X = 0,
  Y = 1,
  XY = 2
};

/**
 * Menu de composants configurable, navigable sur un ou deux axes.
 * Émet `E_ITEM_FOCUSED` et `E_ITEM_SELECTED` avec les données `{ id, index }`,
 * ainsi que `E_ITEM_UNFOCUSED`, `E_ITEM_UNSELECTED`, `E_UNSELECTED` et `E_CLOSED`.
 */
export class UIMenu extends UIWidget {
  axis: UIMenuAxis;
  rows: number;
  columns: number;
  multiple: boolean;
  selectable: boolean;
  togglable: boolean;
  widgets: Array<UIWidget>;
  focusedWidget: UIWidget | undefined;
  selectedWidgets: Array<UIWidget>;

  /**
   * Crée un menu configurable.
   *
   * @param options - Classe CSS, axes, dimensions de grille et options de sélection du menu.
   */
  constructor(options: { className?: string, axis?: UIMenuAxis, rows?: number, columns?: number, multiple?: boolean, selectable?: boolean, togglable?: boolean } = {}) {
    super({
      className: options.className ?? 'UIMenu'
    });

    this.axis = options.axis ?? UIMenuAxis.Y;
    this.rows = options.rows ?? 0;
    this.columns = options.columns ?? 0;
    this.multiple = options.multiple ?? false;
    this.selectable = options.selectable ?? true;
    this.togglable = options.togglable ?? true;
    this.widgets = [];
    this.selectedWidgets = [];

    if (this.axis == UIMenuAxis.X) {
      this.rows = 1;
      this.columns = Infinity;
      this.node.style.display = 'flex';
      this.node.style.flexDirection = 'row';
    }
    else if (this.axis == UIMenuAxis.Y) {
      this.rows = Infinity;
      this.columns = 1;
      this.node.style.display = 'flex';
      this.node.style.flexDirection = 'column';
    }
    else {
      this.node.style.display = 'grid';
      this.node.style.grid = 'repeat(' + this.rows + ', auto) / repeat(' + this.columns + ', auto)';
    }
  }

  /** Détruit tous les composants du menu, puis libère les ressources héritées. */
  delete(): void {
    for (const widget of this.widgets) {
      widget.delete();
    }

    super.delete();
  }

  /**
   * Met à jour tous les composants du menu.
   *
   * @param {number} ts - Pas de temps écoulé.
   */
  update(ts: number): void {
    for (const widget of this.widgets) {
      widget.update(ts);
    }
  }

  /**
   * Donne le focus au menu et restaure éventuellement celui d'un composant enfant.
   *
   * @param {number} focusIndex - Avec `UIMenuFocus.AUTO`, donne aussi le focus au dernier composant actif ou au premier.
   */
  focus(focusIndex = UIMenuFocus.AUTO): void {
    if (this.widgets.length > 0 && focusIndex == UIMenuFocus.AUTO) {
      const focusedIndex = this.focusedWidget ? this.widgets.indexOf(this.focusedWidget) : 0;
      this.focusWidget(focusedIndex, true);
    }

    super.focus();
  }

  /**
   * Ajoute un composant au menu.
   *
   * @param {UIWidget} widget - Composant à ajouter.
   * @param {number} index - Position d'insertion ; avec `-1`, le composant est ajouté à la fin.
   */
  addWidget(widget: UIWidget, index: number = -1): void {
    const widgetNode = widget.getNode();

    if (index == -1) {
      this.widgets.push(widget);
      this.node.appendChild(widgetNode);
    }
    else {
      this.widgets.splice(index + 1, 0, widget);
      this.node.insertBefore(widgetNode, this.node.children[index]);
    }

    widgetNode.addEventListener('click', () => this.#handleWidgetClicked(widget));
    widgetNode.addEventListener('mousemove', () => this.#handleWidgetHover(widget));
  }

  /**
   * Retire et détruit un composant du menu.
   *
   * @param {number} index - Indice du composant.
   * @throws {Error} Si aucun composant ne correspond à cet indice.
   */
  removeWidget(index: number): void {
    const widget = this.widgets[index];
    if (!widget) {
      throw new Error('UIMenu::removeWidget(): widget not found !');
    }

    if (this.selectedWidgets.indexOf(widget) != -1) {
      this.selectedWidgets.splice(this.selectedWidgets.indexOf(widget), 1);
    }

    if (this.focusedWidget == widget) {
      this.focusedWidget = undefined;
    }

    this.widgets.splice(this.widgets.indexOf(widget), 1);
    widget.delete();
  }

  /**
   * Donne le focus à un composant et émet éventuellement `E_ITEM_FOCUSED`.
   *
   * @param {number} index - Indice du composant.
   * @param {boolean} [preventScroll=false] - `true` pour ne pas faire défiler le menu jusqu'au composant.
   * @param {boolean} [emit=true] - `true` pour émettre l'événement après la prise de focus.
   * @throws {Error} Si aucun composant ne correspond à cet indice.
   */
  focusWidget(index: number, preventScroll: boolean = false, emit: boolean = true): void {
    const widget = this.widgets[index];
    if (!widget) {
      throw new Error('UIMenu::focusWidget(): widget not found !');
    }

    if (widget.isFocused()) {
      return;
    }

    if (!preventScroll) {
      const rect = this.#getViewRectWidget(index);
      if (rect.top < 0) {
        this.node.scrollTop += rect.top;
      }
      if (rect.bottom > this.node.clientHeight) {
        this.node.scrollTop += rect.bottom - this.node.clientHeight;
      }
    }

    this.widgets.forEach(w => w.unfocus());
    widget.focus();
    this.focusedWidget = widget;

    if (emit) {
      eventManager.emit(this, 'E_ITEM_FOCUSED', { id: widget.getId(), index: index });
    }
  }

  /**
   * Retire le focus de tous les composants et émet éventuellement `E_ITEM_UNFOCUSED`.
   *
   * @param {boolean} [emit=true] - `true` pour émettre l'événement après la perte de focus.
   */
  unfocusWidget(emit: boolean = true): void {
    this.widgets.forEach(w => w.unfocus());
    this.focusedWidget = undefined;

    if (emit) {
      eventManager.emit(this, 'E_ITEM_UNFOCUSED');
    }
  }

  /**
   * Sélectionne un composant activé et émet éventuellement `E_ITEM_SELECTED`.
   * Selon la configuration, remplace la sélection courante ou bascule celle du composant.
   *
   * @param {number} index - Indice du composant.
   * @param {boolean} [emit=true] - `true` pour émettre l'événement après la sélection.
   * @throws {Error} Si aucun composant ne correspond à cet indice.
   */
  selectWidget(index: number, emit: boolean = true): void {
    const widget = this.widgets[index];
    if (!widget) {
      throw new Error('UIMenu::selectWidget(): widget not found !');
    }
    if (!widget.isEnabled()) {
      return;
    }

    if (this.multiple && this.togglable && widget.isSelected()) {
      widget.setSelected(false);
      this.selectedWidgets.splice(this.selectedWidgets.indexOf(widget), 1);
      return;
    }

    if (!this.multiple) {
      this.widgets.forEach(w => w.setSelected(false));
      this.selectedWidgets = [];
    }

    widget.setSelected(true);
    this.selectedWidgets.push(widget);

    if (emit) {
      eventManager.emit(this, 'E_ITEM_SELECTED', { id: widget.getId(), index: index });
    }
  }

  /**
   * Désélectionne un composant et émet éventuellement `E_ITEM_UNSELECTED`.
   *
   * @param {number} index - Indice du composant.
   * @param {boolean} [emit=true] - `true` pour émettre l'événement après la désélection.
   * @throws {Error} Si aucun composant ne correspond à cet indice.
   */
  unselectWidget(index: number, emit: boolean = true): void {
    const widget = this.widgets[index];
    if (!widget) {
      throw new Error('UIMenu::unselectWidget(): widget not found !');
    }
    if (!widget.isSelected()) {
      return;
    }

    widget.setSelected(false);
    this.selectedWidgets.splice(this.selectedWidgets.indexOf(widget), 1);

    if (emit) {
      eventManager.emit(this, 'E_ITEM_UNSELECTED', { id: widget.getId(), index: index });
    }
  }

  /**
   * Désélectionne tous les composants et émet éventuellement `E_UNSELECTED`.
   *
   * @param {boolean} [emit=true] - `true` pour émettre l'événement après la désélection.
   */
  unselectWidgets(emit: boolean = true): void {
    this.widgets.forEach(w => w.setSelected(false));
    this.selectedWidgets = [];

    if (emit) {
      eventManager.emit(this, 'E_UNSELECTED');
    }
  }

  /**
   * Définit l'état activé d'un composant.
   *
   * @param {number} index - Indice du composant.
   * @param {boolean} enabled - `true` pour activer le composant, `false` pour le désactiver.
   * @throws {Error} Si aucun composant ne correspond à cet indice.
   */
  setEnabledWidget(index: number, enabled: boolean): void {
    const widget = this.widgets[index];
    if (!widget) {
      throw new Error('UIMenu::setEnabledWidget(): widget not found !');
    }

    widget.setEnabled(enabled);
  }

  /**
   * Définit l'état activé de tous les composants.
   *
   * @param {boolean} enabled - `true` pour activer les composants, `false` pour les désactiver.
   */
  setEnabledWidgets(enabled: boolean): void {
    this.widgets.forEach(w => w.setEnabled(enabled));
  }

  /** Retire et détruit tous les composants du menu. */
  clear(): void {
    this.widgets.forEach(w => w.delete());
    this.widgets = [];
    this.focusedWidget = undefined;
    this.selectedWidgets = [];
    this.node.innerHTML = '';
  }

  /**
   * Renvoie l'identifiant du composant possédant le focus.
   *
   * @returns L'identifiant du composant actif, ou `null` si aucun composant ne possède le focus.
   */
  getFocusedWidgetId(): string | null {
    return this.focusedWidget ? this.focusedWidget.getId() : null;
  }

  /**
   * Renvoie l'indice du composant possédant le focus.
   *
   * @returns L'indice du composant actif, ou `-1` si aucun composant ne possède le focus.
   */
  getFocusedWidgetIndex(): number {
    return this.focusedWidget ? this.widgets.indexOf(this.focusedWidget) : -1;
  }

  /**
   * Renvoie l'identifiant du premier composant sélectionné.
   *
   * @returns L'identifiant du premier composant sélectionné, ou `null` si la sélection est vide.
   */
  getSelectedWidgetId(): string | null {
    return this.selectedWidgets[0] ? this.selectedWidgets[0].getId() : null;
  }

  /**
   * Renvoie l'indice du premier composant sélectionné.
   *
   * @returns L'indice du premier composant sélectionné, ou `-1` si la sélection est vide.
   */
  getSelectedWidgetIndex(): number {
    return this.selectedWidgets[0] ? this.widgets.indexOf(this.selectedWidgets[0]) : -1;
  }

  /**
   * Renvoie les identifiants des composants sélectionnés.
   *
   * @returns La liste des identifiants sélectionnés.
   */
  getSelectedWidgetIds(): Array<string> {
    return this.selectedWidgets.map(w => w.getId());
  }

  /**
   * Renvoie les indices des composants sélectionnés.
   *
   * @returns La liste des indices sélectionnés.
   */
  getSelectedWidgetIndexes(): Array<number> {
    return this.selectedWidgets.map(w => this.widgets.indexOf(w));
  }

  /**
   * Renvoie tous les composants du menu.
   *
   * @returns La liste des composants.
   */
  getWidgets() {
    return this.widgets;
  }

  /**
   * Renvoie le composant situé à l'indice indiqué.
   *
   * @param {number} index - Indice du composant.
   * @returns Le composant correspondant, ou `undefined` à l'exécution si l'indice est hors limites.
   */
  getWidget(index: number): UIWidget {
    return this.widgets[index];
  }

  /**
   * Ferme, sélectionne ou déplace le focus dans le menu selon l'action reçue.
   *
   * @param {string} actionId - Identifiant de l'action.
   */
  onAction(actionId: string) {
    if (actionId == 'BACK') {
      eventManager.emit(this, 'E_CLOSED');
    }
    else if (actionId == 'OK') {
      const focusedIndex = this.getFocusedWidgetIndex();
      this.selectWidget(focusedIndex);
    }
    else if (actionId == 'LEFT' && (this.axis == UIMenuAxis.X || this.axis == UIMenuAxis.XY)) {
      const focusedIndex = this.getFocusedWidgetIndex();
      const prevIndex = (focusedIndex - 1 < 0) ? this.widgets.length - 1 : focusedIndex - 1;
      this.focusWidget(prevIndex);
    }
    else if (actionId == 'RIGHT' && (this.axis == UIMenuAxis.X || this.axis == UIMenuAxis.XY)) {
      const focusedIndex = this.getFocusedWidgetIndex();
      const nextIndex = (focusedIndex + 1 > this.widgets.length - 1) ? 0 : focusedIndex + 1;
      this.focusWidget(nextIndex);
    }
    else if (actionId == 'UP' && (this.axis == UIMenuAxis.Y || this.axis == UIMenuAxis.XY)) {
      const focusedIndex = this.getFocusedWidgetIndex();
      const prevIndex = (focusedIndex - this.columns < 0) ? this.widgets.length - 1 : focusedIndex - this.columns;
      this.focusWidget(prevIndex);
    }
    else if (actionId == 'DOWN' && (this.axis == UIMenuAxis.Y || this.axis == UIMenuAxis.XY)) {
      const focusedIndex = this.getFocusedWidgetIndex();
      const nextIndex = (focusedIndex + this.columns > this.widgets.length - 1) ? 0 : focusedIndex + this.columns;
      this.focusWidget(nextIndex);
    }
  }

  #handleWidgetClicked(widget: UIWidget) {
    if (!this.isFocused()) {
      return;
    }

    this.selectWidget(this.widgets.indexOf(widget), true);
  }

  #handleWidgetHover(widget: UIWidget) {
    if (!this.isFocused()) {
      return;
    }

    this.focusWidget(this.widgets.indexOf(widget), false, true);
  }

  #getViewRectWidget(index: number): { top: number, bottom: number } {
    const el = this.node.children[index] as HTMLElement;
    const top = el.offsetTop - this.node.scrollTop;
    const bottom = top + el.offsetHeight;
    return { top, bottom };
  }
}