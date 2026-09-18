/**
 * Classe de base d'un état de jeu dans un arbre Minimax.
 *
 * @remarks
 * Un état représente la configuration du jeu après un coup et porte un score heuristique.
 * Les nœuds décrivent les états transitoires qui possèdent des successeurs, tandis que
 * les feuilles décrivent les fins de partie ou la profondeur maximale d'exploration.
 *
 * @typeParam T - Type des données personnalisées associées à l'état, par exemple le déplacement qui y conduit.
 */
export abstract class AIMinMaxStateAbstract<T> {
	visited: boolean;
  data: T | null;
  value: number;

  /**
   * Initialise un état non visité, sans données, avec un score négatif infini.
   */
  constructor() {
    this.visited = false;
    this.data = null;
    this.value = -Infinity;
  }

  /**
   * Définit l'état de visite (à usage interne uniquement).
   *
   * @param visited - L'état de visite.
   */
  setVisited(visited: boolean): void {
    this.visited = visited;
  }

  /**
   * Retourne l'état de visite du nœud (à usage interne uniquement).
   *
   * @returns `true` si le nœud a été visité, `false` sinon.
   */
  isVisited(): boolean {
		return this.visited;
	}

  /**
   * Associe des données personnalisées à l'état, par exemple le déplacement qui y conduit.
   *
   * @param data - Données à associer à l'état.
   */
  setData(data: T): void {
    this.data = data;
  }

  /**
   * Retourne les données personnalisées du nœud.
   *
   * @returns Les données personnalisées associées, ou `null` si aucune n'est définie.
   */
  getData(): T | null {
    return this.data;
  }

  /**
   * Définit le score heuristique de l'état.
   *
   * @param value - Score calculé par la fonction d'évaluation du jeu.
   */
  setValue(value: number): void {
    this.value = value;
  }

  /**
   * Retourne le score de l'état actuel.
   *
   * @returns Le score actuellement attribué à cet état.
   */
  getValue(): number {
    return this.value;
  }
}

/**
 * Représente un état terminal du jeu, tel qu'une victoire, une défaite ou un match nul.
 *
 * @typeParam T - Type des données personnalisées associées à l'état.
 */
export class AIMinMaxStateLeaf<T>extends AIMinMaxStateAbstract<T> {
  /**
   * Crée une feuille évaluée.
   *
   * @param value - Score associé à l'état terminal.
   */
	constructor(value: number) {
		super();
    this.value = value;
	}
}

/**
 * Représente un état transitoire depuis lequel d'autres coups peuvent être simulés.
 *
 * @typeParam T - Type des données personnalisées associées à l'état.
 */
export class AIMinMaxStateNode<T> extends AIMinMaxStateAbstract<T> {
  children: Array<AIMinMaxStateAbstract<T>>;

  /**
   * Crée un nœud avec ses éventuels états enfants.
   *
   * @param children - États issus des coups suivants.
   */
	constructor(children: Array<AIMinMaxStateAbstract<T>> = []) {
		super();
    this.children = children;
	}

  /**
   * Ajoute un état enfant.
   *
   * @param child - L'état enfant.
   */
  addChild(child: AIMinMaxStateAbstract<T>): void {
    this.children.push(child);
  }

  /**
   * Retourne tous les états enfants de l'état actuel.
   *
   * @returns Un tableau contenant tous les états enfants.
   */
  getChildren(): Array<AIMinMaxStateAbstract<T>> {
		return this.children;
	}
}