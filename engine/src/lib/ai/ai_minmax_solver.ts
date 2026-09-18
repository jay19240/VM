import { AIMinMaxStateLeaf, AIMinMaxStateNode, AIMinMaxStateAbstract } from './ai_minmax_state';

/**
 * Résout un arbre Minimax avec élagage alpha-bêta.
 *
 * @remarks
 * Détermine le coup optimal d'un jeu à somme nulle en minimisant la perte maximale
 * possible dans le pire des cas.
 *
 * Pour l'utiliser :
 * 1. Définissez une fonction heuristique pertinente pour évaluer chaque état du jeu.
 * 2. Construisez l'arbre et attribuez un score à ses feuilles.
 * 3. Appelez `solve` avec le nœud racine.
 * 4. Récupérez le coup à jouer dans les données personnalisées du nœud retourné.
 *
 * Ce résolveur convient notamment aux jeux au tour par tour tels que les échecs,
 * les dames ou le morpion.
 *
 * @typeParam T - Type des données personnalisées associées à chaque état, par exemple le déplacement qui y conduit.
 */
export class AIMinMaxSolver<T> {
  /**
   * Évalue l'arbre et retourne l'état enfant qui représente le meilleur coup.
   *
   * @param node - Nœud racine d'un arbre dont les feuilles ont déjà été évaluées.
   * @returns L'état correspondant au coup optimal.
   */
  solve(node: AIMinMaxStateNode<T>): AIMinMaxStateAbstract<T> {
    this.#generateValues(node, true);
    let children = node.getChildren();
    let maxNode = children[0];

    for (let childNode of node.getChildren()) {
      if (childNode.getValue() > maxNode.getValue()) {
        maxNode = childNode;
      }
    }

    return maxNode;
  }

  /**
   * Propage les scores vers la racine en appliquant l'élagage alpha-bêta.
   *
   * @param parentNode - État à évaluer.
   * @param isMaxPlayer - Indique si le niveau courant maximise le score.
   * @param alpha - Meilleur score déjà garanti au joueur qui maximise.
   * @param beta - Meilleur score déjà garanti au joueur qui minimise.
   * @returns L'état évalué, dont le score a été mis à jour.
   */
  #generateValues(parentNode: AIMinMaxStateAbstract<T>, isMaxPlayer: boolean, alpha: number = -Infinity, beta: number = Infinity): AIMinMaxStateAbstract<T> {
    if (parentNode instanceof AIMinMaxStateLeaf) {
      return parentNode;
    }

    parentNode.setValue(isMaxPlayer ? -Infinity : Infinity);

    for (let childNode of (parentNode as AIMinMaxStateNode<T>).children) {
      const node = this.#generateValues(childNode, !isMaxPlayer, alpha, beta);
      const val = node.getValue();

      if (isMaxPlayer) {
        if (val > parentNode.getValue()) {
          parentNode.setValue(val);
        }
        if (val >= beta) {
          break;
        }
        if (val > alpha) {
          alpha = val;
        }
      }
      else {
        if (val < parentNode.getValue()) {
          parentNode.setValue(val);
        }
        if (val <= alpha) {
          break;
        }
        if (val < beta) {
          beta = val;
        }
      }
    }

    return parentNode;
  }
}