import { UT } from '../core/utils';

/**
 * Décrit un nœud et ses coûts de recherche dans un graphe de navigation.
 *
 * @typeParam T - Type du vecteur de position, `vec2` ou `vec3`.
 */
export interface AIPathNode<T extends vec2 | vec3> {
  id: string;
  pos: T;
  children: Array<string>;
  parent?: AIPathNode<T> | null;
  type: string;
  g: number;
  h: number;
  f: number;
};

/**
 * Graphe de navigation abstrait et générique.
 * Gère une collection de nœuds et leurs interconnexions pour diriger la navigation de l'IA.
 *
 * @typeParam T - Type de vecteur de position.
 */
export abstract class AIPathGraphAbstract<T extends vec2 | vec3> {
  nodes: Map<string, AIPathNode<T>>;

  /**
   * Crée un graphe à partir d'une liste de nœuds.
   *
   * @param nodes - Nœuds de navigation initiaux.
   */
  constructor(nodes = new Array<AIPathNode<T>>()) {
    this.nodes = new Map<string, AIPathNode<T>>();

    for (const node of nodes) {
      this.nodes.set(node.id, node);
    }
  }

  /**
   * Calcule et retourne la distance physique entre deux nœuds.
   * Implémentée par les classes dérivées selon le nombre de dimensions (2D ou 3D).
   *
   * @param a - Le nœud de départ.
   * @param b - Le nœud d'arrivée.
   * @returns La distance séparant les deux nœuds.
   */
  abstract getDistance(a: AIPathNode<T>, b: AIPathNode<T>): number;

  /**
   * Charge de manière asynchrone les données du graphe à partir d'un fichier JSON (`.grf`).
   *
   * @param path - Le chemin d'accès au fichier de graphe.
   * @throws Une erreur si le fichier est invalide ou ne porte pas la signature `GRF`.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'GRF') {
      throw new Error('AIPathGraphAbstract<T>::loadFromFile(): File not valid !');
    }

    this.nodes.clear();
    for (const nid in json['Nodes']) {
      this.nodes.set(nid, {
        id: nid,
        pos: json['Nodes'][nid]['Pos'],
        children: json['Nodes'][nid]['Children'],
        type: json['Nodes'][nid]['Type'],
        g: 0,
        h: 0,
        f: 0
      });
    }
  }

  /**
   * Récupère un nœud de manière stricte via son identifiant.
   *
   * @param nid - L'identifiant unique du nœud.
   * @returns Le nœud correspondant.
   * @throws Une erreur si le nœud n'existe pas dans le graphe.
   */
  getNode(nid: string): AIPathNode<T> {
    const node = this.nodes.get(nid);
    if (!node) {
      throw new Error('AIPathGraphAbstract::getNode(): Node not exist !');
    }

    return node;
  }

  /**
   * Ajoute un nouveau nœud au graphe.
   *
   * @param node - L'objet nœud à insérer.
   * @param biRelations - Si `true`, ajoute également la relation inverse aux enfants déjà présents. Valeur par défaut : `true`.
   * @returns Le nœud ajouté.
   * @throws Une erreur si un nœud avec cet identifiant existe déjà.
   */
  addNode(node: AIPathNode<T>, biRelations: boolean = true): AIPathNode<T> {
    const found = this.nodes.get(node.id);
    if (found) {
      throw new Error('AIPathGraphAbstract::addNode(): Node already exist !');
    }

    this.nodes.set(node.id, node);

    if (biRelations) {
      for (const cnid of node.children) {
        const childNode = this.nodes.get(cnid);
        if (childNode) {
          childNode.children.push(node.id);
        }
      }
    }

    return node;
  }

  /**
   * Supprime un nœud du graphe.
   * Nettoie également les références à ce nœud chez tous ses enfants connectés.
   *
   * @param nid - L'identifiant unique du nœud à supprimer.
   * @throws Une erreur si le nœud n'est pas trouvé.
   */
  removeNode(nid: string): void {
    const node = this.nodes.get(nid);
    if (!node) {
      throw new Error('AIPathGraphAbstract::removeNode(): Node not found !');
    }

    this.nodes.delete(nid);

    for (const cnid of node.children) {
      const childNode = this.nodes.get(cnid);
      if (!childNode) {
        continue;
      }

      const index = childNode.children.indexOf(nid);
      if (index != -1) {
        childNode.children.splice(index, 1);
      }
    }
  }

  /**
   * Met à jour les propriétés d'un nœud existant.
   *
   * @param nid - L'identifiant unique du nœud.
   * @param properties - Propriétés partielles à fusionner dans le nœud.
   * @throws Une erreur si le nœud n'est pas trouvé.
   */
  setNodeProperties(nid: string, properties: Partial<AIPathNode<T>>): void {
    const node = this.nodes.get(nid);
    if (!node) {
      throw new Error('AIPathGraphAbstract::setNodeProperties(): Node not found !');
    }

    Object.assign(node, properties);
  }

  /**
   * Supprime la connexion entre un nœud parent et son nœud enfant.
   *
   * @param nid - L'identifiant du nœud parent.
   * @param cnid - L'identifiant du nœud enfant à déconnecter.
   * @param biRelations - Si `true`, supprime également la relation inverse. Valeur par défaut : `true`.
   * @throws Une erreur si le parent ou l'enfant n'est pas trouvé.
   */
  removeNodeRelation(nid: string, cnid: string, biRelations: boolean = true): void {
    const node = this.nodes.get(nid);
    if (!node) {
      throw new Error('AIPathGraphAbstract::removeNodeRelation(): Node not found !');
    }

    const index = node.children.indexOf(cnid);
    if (index == -1) {
      throw new Error('AIPathGraphAbstract::removeNodeRelation(): Node children not found !');
    }

    const child = this.nodes.get(cnid);
    if (child && biRelations) {
      const index = child.children.indexOf(nid);
      child.children.splice(index, 1);
    }

    node.children.splice(index, 1);
  }

  /**
   * Trouve et retourne le premier nœud satisfaisant une condition donnée.
   *
   * @param predicateFn - La fonction de test (prédicat) évaluant chaque nœud.
   * @returns Le premier nœud trouvé, ou `null` si aucun ne correspond.
   */
  findNode(predicateFn: Function): AIPathNode<T> | null {
    for (const n of this.nodes.values()) {
      if (predicateFn(n)) {
        return n;
      }
    }

    return null;
  }

  /**
   * Récupère un nœud via son identifiant de manière sécurisée (sans lever d'erreur).
   *
   * @param id - L'identifiant unique du nœud.
   * @returns Le nœud correspondant, ou `undefined` s'il n'existe pas.
   */
  findNodeById(id: string): AIPathNode<T> | undefined {
    return this.nodes.get(id);
  }

  /**
   * Recherche et retourne le premier nœud correspondant à un type spécifique.
   *
   * @param type - Type de nœud recherché, par exemple `water` ou `cover`.
   * @returns Le premier nœud correspondant, ou `undefined` si aucun ne correspond.
   */
  findNodeByType(type: string): AIPathNode<T> | undefined {
    for (const node of this.nodes.values()) {
      if (node.type == type) {
        return node;
      }
    }

    return;
  }

  /**
   * Trouve et retourne tous les nœuds satisfaisant une condition donnée.
   *
   * @param predicateFn - La fonction de test (prédicat) évaluant chaque nœud.
   * @returns Un tableau contenant les nœuds correspondants.
   */
  findNodes(predicateFn: Function): Array<AIPathNode<T>> {
    const res = new Array<AIPathNode<T>>();

    for (const value of this.nodes.values()) {
      if (predicateFn(value)) {
        res.push(value);
      }
    }

    return res;
  }

  /**
   * Recherche et retourne tous les nœuds d'un type spécifique.
   *
   * @param type - Le type de nœud recherché.
   * @returns Un tableau contenant tous les nœuds de ce type.
   */
  findNodesByType(type: string): Array<AIPathNode<T>> {
    return this.findNodes((n: any) => n.type == type);
  }

  /**
   * Réinitialise les coûts `g`, `h` et `f` de tous les nœuds avant une nouvelle recherche.
   */
  reset(): void {
    for (const node of this.nodes.values()) {
      node.g = 0;
      node.h = 0;
      node.f = 0;
    }
  }
}

/**
 * Implémentation d'un graphe de navigation en deux dimensions (2D).
 */
export class AIPathGraph2D extends AIPathGraphAbstract<vec2> {
  /**
   * Crée un graphe de navigation 2D.
   *
   * @param nodes - Nœuds initiaux du graphe.
   */
  constructor(nodes: Array<AIPathNode<vec2>> = new Array<AIPathNode<vec2>>()) {
    super(nodes);
  }

  /**
   * Calcule la distance euclidienne entre deux nœuds en 2D.
   *
   * @param a - Le premier nœud.
   * @param b - Le second nœud.
   * @returns La distance en unités 2D.
   */
  getDistance(a: AIPathNode<vec2>, b: AIPathNode<vec2>): number {
    return UT.VEC2_DISTANCE(a.pos, b.pos);
  }
}

/**
 * Implémentation d'un graphe de navigation en trois dimensions (3D).
 */
export class AIPathGraph3D extends AIPathGraphAbstract<vec3> {
  /**
   * Crée un graphe de navigation 3D.
   *
   * @param nodes - Nœuds initiaux du graphe.
   */
  constructor(nodes: Array<AIPathNode<vec3>> = new Array<AIPathNode<vec3>>()) {
    super(nodes);
  }

  /**
   * Calcule la distance euclidienne entre deux nœuds en 3D.
   *
   * @param a - Le premier nœud.
   * @param b - Le second nœud.
   * @returns La distance en unités 3D.
   */
  getDistance(a: AIPathNode<vec3>, b: AIPathNode<vec3>): number {
    return UT.VEC3_DISTANCE(a.pos, b.pos);
  }
}