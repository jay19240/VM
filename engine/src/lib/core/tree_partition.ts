/**
 * Résultat de la division d'un nœud en deux partitions.
 *
 * @typeParam T - Type des objets répartis.
 */
export type SplitResult<T> = {
  left: Array<T>,
  right: Array<T>,
  leftMethod: ITreePartitionMethod<T>,
  rightMethod: ITreePartitionMethod<T>,
}

/**
 * Définit les opérations géométriques propres à une partition binaire.
 *
 * @typeParam T - Type des objets indexés.
 */
export interface ITreePartitionMethod<T> {
  /**
   * Répartit des objets entre deux sous-partitions.
   *
   * @param objects - Objets à répartir.
   * @returns Objets et stratégies des partitions gauche et droite.
   */
  split(objects: Array<T>): SplitResult<T>;
  /**
   * Recherche des objets depuis un nœud selon des critères propres à la stratégie.
   *
   * @param node - Nœud à parcourir.
   * @param params - Critères transmis à la stratégie.
   * @returns Objets correspondants.
   */
  search(node: TreePartitionNode<T>, ...params: any[]): Array<T>;
  /**
   * Translate la partition.
   *
   * @param x - Déplacement sur l'axe X.
   * @param y - Déplacement sur l'axe Y.
   * @param z - Déplacement sur l'axe Z.
   */
  translate(x: number, y: number, z: number): void;
  /**
   * Dessine la représentation de la partition.
   */
  draw(): void;
}

/**
 * Arbre binaire de partitionnement spatial.
 *
 * @typeParam T - Type des objets contenus dans les nœuds.
 */
export class TreePartition<T> {
  maxChildren: number;
  maxDepth: number;
  root: TreePartitionNode<T>;

  /**
   * Crée un arbre de partitionnement.
   *
   * @param maxChildren - Nombre d'objets qu'un nœud peut contenir avant d'être divisé.
   * @param maxDepth - Profondeur maximale de subdivision.
   * @param method - Stratégie géométrique appliquée à la racine.
   */
  constructor(maxChildren: number, maxDepth: number, method: ITreePartitionMethod<T>) {
    this.maxChildren = maxChildren;
    this.maxDepth = maxDepth;
    this.root = new TreePartitionNode<T>(this, 0, method);
  }

  /**
   * Dessine la représentation de toutes les partitions.
   */
  draw(): void {
    this.root.draw();
  }

  /**
   * Translate l'ensemble des partitions.
   *
   * @param x - Déplacement sur l'axe X.
   * @param y - Déplacement sur l'axe Y.
   * @param z - Déplacement sur l'axe Z.
   */
  translate(x: number, y: number, z: number = 0): void {
    this.root.translate(x, y, z);
  }

  /**
   * Recherche les objets qui intersectent une cible.
   *
   * @param target - Objet cible.
   * @param results - Tableau auquel ajouter les correspondances.
   * @returns Tableau des objets trouvés.
   */
  search(target: T, results: Array<T> = []): Array<T> {
    return this.root.search(target, results);
  }

  /**
   * Ajoute un objet à l'arbre.
   *
   * @param object - Objet à indexer.
   */
  addChild(object: T): void {
    this.root.addChild(object);
  }

  /**
   * Retourne la capacité d'un nœud avant subdivision.
   *
   * @returns Nombre maximal d'objets par nœud.
   */
  getMaxChildren(): number {
    return this.maxChildren;
  }

  /**
   * Retourne la profondeur maximale de l'arbre.
   *
   * @returns Profondeur maximale autorisée.
   */
  getMaxDepth(): number {
    return this.maxDepth;
  }

  /**
   * Retourne le nœud racine.
   *
   * @returns Racine de l'arbre.
   */
  getRoot(): TreePartitionNode<T> {
    return this.root;
  }
}

/**
 * Nœud d'un arbre binaire de partitionnement.
 *
 * @typeParam T - Type des objets contenus dans le nœud.
 */
export class TreePartitionNode<T> {
  tree: TreePartition<T>;
  depth: number;
  method: ITreePartitionMethod<T>;
  parent: TreePartitionNode<T> | null = null;
  left: TreePartitionNode<T> | null = null;
  right: TreePartitionNode<T> | null = null;
  children: Array<T> = [];

  /**
   * Crée un nœud de partitionnement.
   *
   * @param tree - Arbre propriétaire.
   * @param depth - Profondeur du nœud.
   * @param method - Stratégie géométrique de la partition.
   */
  constructor(tree: TreePartition<T>, depth: number, method: ITreePartitionMethod<T>) {
    this.reset();
    this.tree = tree;
    this.depth = depth;
    this.method = method;
  }

  /**
   * Dessine cette partition et ses descendantes.
   */
  draw(): void {
    this.method.draw();

    if (this.left) {
      this.left.draw();
    }

    if (this.right) {
      this.right.draw();
    }
  }

  /**
   * Translate cette partition et ses descendantes.
   *
   * @param x - Déplacement sur l'axe X.
   * @param y - Déplacement sur l'axe Y.
   * @param z - Déplacement sur l'axe Z.
   */
  translate(x: number, y: number, z: number = 0): void {
    this.method.translate(x, y, z);

    if (this.left) {
      this.left.translate(x, y, z);
    }

    if (this.right) {
      this.right.translate(x, y, z);
    }
  }

  /**
   * Recherche depuis ce nœud les objets qui intersectent une cible.
   *
   * @param target - Objet cible.
   * @param results - Tableau auquel ajouter les correspondances.
   * @returns Tableau des objets trouvés.
   */
  search(target: T, results: Array<T> = []): Array<T> {
    return this.method.search(this, target, results);
  }

  /**
   * Retire tous les objets et sous-nœuds de cette partition.
   */
  reset(): void {
    this.children = [];
    this.left = null;
    this.right = null;
  }

  /**
   * Ajoute un objet et subdivise le nœud si sa capacité est dépassée.
   *
   * @param object - Objet à indexer.
   */
  addChild(object: T): void {
    if (this.children.length >= this.tree.getMaxChildren() && this.depth < this.tree.getMaxDepth()) {
      this.#createSubNodes();
    }

    if (this.left === null && this.right === null) {
      this.children.push(object);
    }
    else {
      const results = this.method.split([object]);
      if (this.left && results.left.length > 0) {
        this.left.addChild(results.left[0]);
      }

      if (this.right && results.right.length > 0) {
        this.right.addChild(results.right[0]);
      }
    }
  }

  /**
   * Retourne les objets directement contenus dans ce nœud.
   *
   * @returns Objets non répartis dans des sous-nœuds.
   */
  getChildren(): Array<T> {
    return this.children;
  }

  /**
   * Retourne la stratégie de partitionnement du nœud.
   *
   * @returns Stratégie géométrique courante.
   */
  getMethod(): ITreePartitionMethod<T> {
    return this.method;
  }

  /**
   * Retourne la partition gauche.
   *
   * @returns Sous-nœud gauche, ou `null` en l'absence de subdivision.
   */
  getLeft(): TreePartitionNode<T> | null {
    return this.left;
  }

  /**
   * Retourne la partition droite.
   *
   * @returns Sous-nœud droit, ou `null` en l'absence de subdivision.
   */
  getRight(): TreePartitionNode<T> | null {
    return this.right;
  }

  /**
   * Retourne la profondeur du nœud.
   *
   * @returns Profondeur dans l'arbre.
   */
  getDepth(): number {
    return this.depth;
  }

  /**
   * Définit la profondeur du nœud.
   *
   * @param depth - Nouvelle profondeur.
   */
  setDepth(depth: number): void {
    this.depth = depth;
  }

  #createSubNodes(): void {
    const results = this.method.split(this.children);

    this.left = new TreePartitionNode(
      this.tree,
      this.depth + 1,
      results.leftMethod
    );

    this.right = new TreePartitionNode(
      this.tree,
      this.depth + 1,
      results.rightMethod
    );

    results.left.forEach(this.left.addChild.bind(this.left));
    results.right.forEach(this.right.addChild.bind(this.right));
    this.left.parent = this;
    this.right.parent = this;
    this.children = [];
  }
}