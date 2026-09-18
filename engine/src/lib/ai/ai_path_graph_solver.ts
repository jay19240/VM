import { AIPathGraphAbstract, AIPathNode } from './ai_path_graph';

/**
 * Recherche le plus court chemin dans un graphe de navigation pondéré.
 *
 * @remarks
 * Utilisez les outils dédiés pour exporter un graphe GRF depuis Tiled en 2D ou Blender
 * en 3D, puis chargez-le avec `AIPathGraph2D` ou `AIPathGraph3D`. Les types de nœuds
 * permettent de repérer les emplacements stratégiques pour l'IA.
 *
 * Ce résolveur convient aux environnements continus, fixes et préétablis. Pour une
 * carte découpée en cases, préférez `AIPathGridSolver`.
 *
 * @typeParam T - Type du vecteur de position des nœuds, `vec2` ou `vec3`.
 */
export class AIPathGraphSolver<T extends vec2 | vec3> {
  /**
   * Trouve et retourne le chemin le plus court entre un nœud de départ et un nœud d'arrivée.
   *
   * @param graph - Le graphe de navigation.
   * @param startNode - Le nœud de départ du chemin.
   * @param endNode - Le nœud de destination.
   * @returns Un tableau de nœuds représentant le chemin parcouru, ou un tableau vide (`[]`) si aucun chemin n'a été trouvé.
   */
  solve(graph: AIPathGraphAbstract<T>, startNode: AIPathNode<T>, endNode: AIPathNode<T>): Array<AIPathNode<T>> {
    const openList = new Array<AIPathNode<T>>();
    const closeList = new Array<AIPathNode<T>>();
    let currentNode: AIPathNode<T> | null = null;

    graph.reset();
    startNode.g = 0;
    startNode.h = this.#heuristic(graph, startNode, endNode);
    startNode.f = startNode.g + startNode.h;

    openList.push(startNode);
    currentNode = startNode;

    while (openList.length > 0) {
      if (currentNode == endNode) {
        break;
      }

      for (let nid of currentNode.children) {
        const childNode = graph.getNode(nid);

        const isInCloseList = closeList.indexOf(childNode) != -1;
        if (isInCloseList) {
          continue;
        }

        const isInOpenList = openList.indexOf(childNode) != -1;
        const g = currentNode.g + this.#heuristic(graph, currentNode, childNode);

        if (isInOpenList && g < childNode.g) {
          childNode.parent = currentNode;
          childNode.g = g;
          childNode.f = childNode.g + childNode.h;
          continue;
        }

        if (!isInOpenList) {
          childNode.parent = currentNode;
          childNode.g = g;
          childNode.h = this.#heuristic(graph, childNode, endNode);
          childNode.f = childNode.g + childNode.h;
          openList.push(childNode);
        }
      }

      openList.splice(openList.indexOf(currentNode), 1);
      closeList.push(currentNode);

      const openListSorted = openList.sort((a, b) => a.f - b.f);
      currentNode = openListSorted[0];
    }

    if (currentNode != endNode) {
      return [];
    }

    const path: Array<AIPathNode<T>> = [];
    let node = endNode;

    while (node) {
      path.unshift(node);
      node = node.parent!;
    }

    return path;
  }

  /**
   * Calcule le coût heuristique (la distance) entre deux nœuds.
   * Utilisé par l'algorithme de recherche pour estimer le coût restant jusqu'à la destination.
   *
   * @param graph - Le graphe.
   * @param nodeA - Le premier nœud (point de départ du calcul).
   * @param nodeB - Le second nœud (point d'arrivée du calcul).
   * @returns La distance calculée entre les deux nœuds.
   */
  #heuristic(graph: AIPathGraphAbstract<T>, nodeA: AIPathNode<T>, nodeB: AIPathNode<T>): number {
    return graph.getDistance(nodeA, nodeB);
  }
}