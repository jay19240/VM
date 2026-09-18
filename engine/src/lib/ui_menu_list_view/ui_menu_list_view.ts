import { eventManager } from '../core/event_manager';
import { ArrayCollection } from '../core/array_collection';
import { UIMenu } from '../ui_menu/ui_menu';

/**
 * Menu dont les composants se mettent automatiquement à jour lorsque la source de données change.
 * Émet les mêmes événements que {@link UIMenu}.
 *
 * @typeParam T - Type des éléments de la source de données.
 */
export class UIMenuListView<T> extends UIMenu {
  collection: ArrayCollection<T>;
  views: Array<T>;
  sortPredicate: (a: T, b: T) => number;
  filterPredicate: (a: T) => boolean;
  enablePredicate: (a: T) => boolean;

  /**
   * Crée une vue de liste avec une collection vide et des prédicats par défaut.
   *
   * @param options - Options transmises au menu parent.
   */
  constructor(options = {}) {
    super(options);
    this.collection = new ArrayCollection<T>();
    this.views = [];
    this.sortPredicate = () => 1;
    this.filterPredicate = () => true;
    this.enablePredicate = () => true;
  }

  /** Libère les abonnements à la collection et les ressources du menu parent. */
  delete(): void {
    eventManager.unsubscribe(this.collection, 'E_ITEM_ADDED', this);
    eventManager.unsubscribe(this.collection, 'E_ITEM_REMOVED', this);
    super.delete();
  }

  /**
   * Définit la collection source, reconstruit les vues et s'abonne à ses modifications.
   *
   * @param {ArrayCollection<T>} collection - Collection servant de source de données.
   */
  setCollection(collection: ArrayCollection<T>): void {
    eventManager.unsubscribe(this.collection, 'E_ITEM_ADDED', this);
    eventManager.unsubscribe(this.collection, 'E_ITEM_REMOVED', this);
    this.clear();

    if (collection) {
      const items = collection.getItems();
      const views = items.sort(this.sortPredicate).filter(this.filterPredicate);
      views.forEach(item => this.addItem(item, this.enablePredicate(item)));
      eventManager.subscribe(collection, 'E_ITEM_ADDED', this, this.#handleItemAdded);
      eventManager.subscribe(collection, 'E_ITEM_REMOVED', this, this.#handleItemRemoved);
      this.collection = collection;
      this.views = views;
    }
    else {
      this.collection = new ArrayCollection<T>();
      this.views = [];
    }
  }

  /**
   * Crée la représentation d'un élément ajouté à la collection.
   * Cette méthode doit être redéfinie par les sous-classes, faute de quoi la liste reste vide.
   *
   * @param {T} item - Élément provenant de la collection source.
   * @param {boolean} [enabled=true] - État activé de la représentation.
   * @param {number} index - Indice auquel ajouter la représentation dans la liste.
   */
  addItem(item: T, enabled: boolean = true, index: number = -1): void {}

  /**
   * Renvoie l'élément de données possédant le focus.
   *
   * @returns L'élément correspondant au composant actif.
   */
  getFocusedItem(): T {
    return this.views[this.getFocusedWidgetIndex()];
  }

  /**
   * Renvoie le premier élément de données sélectionné.
   *
   * @returns L'élément correspondant au premier composant sélectionné.
   */
  getSelectedItem(): T {
    return this.views[this.getSelectedWidgetIndex()];
  }

  /**
   * Définit le comparateur de tri et reconstruit les vues.
   *
   * @param sortPredicate - Fonction déterminant l'ordre des éléments de la liste.
   */
  setSortPredicate(sortPredicate: (a: T, b: T) => number): void {
    if (this.collection) {
      const items = this.collection.getItems();
      this.views = items.sort(sortPredicate).filter(this.filterPredicate);

      this.clear();
      this.views.forEach(item => this.addItem(item, this.enablePredicate(item)));
    }

    this.sortPredicate = sortPredicate;
  }

  /**
   * Définit le prédicat de filtrage et reconstruit les vues.
   *
   * @param filterPredicate - Fonction indiquant si un élément doit apparaître dans les vues.
   */
  setFilterPredicate(filterPredicate: (a: T) => boolean): void {
    if (this.collection) {
      const items = this.collection.getItems();
      this.views = items.sort(this.sortPredicate).filter(filterPredicate);

      this.clear();
      this.views.forEach(item => this.addItem(item, this.enablePredicate(item)));
    }

    this.filterPredicate = filterPredicate;
  }

  /**
   * Définit le prédicat d'activation et reconstruit les vues.
   *
   * @param enablePredicate - Fonction indiquant si la représentation d'un élément doit être activée.
   */
  setEnablePredicate(enablePredicate: (a: T) => boolean): void {
    if (this.collection) {
      const items = this.collection.getItems();
      this.views = items.sort(this.sortPredicate).filter(this.filterPredicate);

      this.clear();
      this.views.forEach(item => this.addItem(item, enablePredicate(item)));
    }

    this.enablePredicate = enablePredicate;
  }

  /**
   * Renvoie les données actuellement affichées, appelées « vues ».
   *
   * @returns La liste triée et filtrée des éléments affichés.
   */
  getViews(): Array<T> {
    return this.views;
  }

  #handleItemAdded(data: any): void {
    const items = this.collection.getItems();
    this.views = items.sort(this.sortPredicate).filter(this.filterPredicate);

    const index = this.views.indexOf(data.item);
    this.addItem(data.item, this.enablePredicate(data.item), index);
  }

  #handleItemRemoved(data: any): void {
    const index = this.views.indexOf(data.item);
    this.removeWidget(index);

    const items = this.collection.getItems();
    this.views = items.sort(this.sortPredicate).filter(this.filterPredicate);
  }
}