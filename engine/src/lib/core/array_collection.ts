import { eventManager } from './event_manager';

/**
 * Collection générique capable d'émettre des événements lors de ses modifications.
 *
 * @remarks
 * Les opérations demandées avec `emit` émettent `E_ITEM_ADDED` ou `E_ITEM_REMOVED`
 * avec les données `{ item, index }`.
 *
 * @typeParam T - Type des éléments de la collection.
 */
export class ArrayCollection<T> {
  items: Array<T>;

  /**
   * Crée une collection à partir d'un tableau existant.
   *
   * @param items - Tableau utilisé comme stockage interne.
   */
  constructor(items: Array<T> = []) {
    this.items = items;
  }

  /**
   * Retourne le tableau utilisé par la collection.
   *
   * @returns Référence vers le tableau interne.
   */
  getItems(): Array<T> {
    return this.items;
  }

  /**
   * Ajoute un élément à la fin de la collection.
   *
   * @param item - Élément à ajouter.
   * @param emit - Indique s'il faut émettre l'événement `E_ITEM_ADDED`.
   * @returns Nouvelle longueur de la collection.
   */
  push(item: T, emit: boolean = false): number {
    const length = this.items.push(item);
    if (emit) {
      eventManager.emit(this, 'E_ITEM_ADDED', { item: item, index: this.items.indexOf(item) });
    }

    return length;
  }

  /**
   * Retire et retourne le dernier élément.
   *
   * @param emit - Indique s'il faut émettre l'événement `E_ITEM_REMOVED`.
   * @returns Élément retiré, ou `undefined` si la collection est vide.
   */
  pop(emit: boolean = false): T | undefined {
    const item = this.items.pop();
    if (emit) {
      eventManager.emit(this, 'E_ITEM_REMOVED', { item: item, index: this.items.length });
    }

    return item;
  }

  /**
   * Retire la première occurrence d'un élément.
   *
   * @param item - Élément à retirer.
   * @param emit - Indique s'il faut émettre l'événement `E_ITEM_REMOVED`.
   * @returns Indice auquel l'élément a été recherché.
   */
  remove(item: T, emit: boolean = false): number {
    const index = this.items.indexOf(item);
    this.items.splice(index, 1);
    if (emit) {
      eventManager.emit(this, 'E_ITEM_REMOVED', { item: item, index: index });
    }

    return index;
  }

  /**
   * Retire l'élément situé à l'indice indiqué.
   *
   * @param index - Indice de l'élément à retirer.
   * @param emit - Indique s'il faut émettre l'événement `E_ITEM_REMOVED`.
   * @returns Élément retiré.
   */
  removeAt(index: number, emit: boolean = false): T {
    const item = this.items.splice(index, 1) as T;
    if (emit) {
      eventManager.emit(this, 'E_ITEM_REMOVED', { item: item, index: index });
    }

    return item;
  }

  /**
   * Indique si un élément appartient à la collection.
   *
   * @param item - Élément recherché.
   * @returns `true` si l'élément est présent.
   */
  has(item: T): boolean {
    return this.items.indexOf(item) != -1;
  }

  /**
   * Retire tous les éléments de la collection.
   */
  clear(): void {
    while (this.items.length) {
      this.items.pop();
    }
  }
}