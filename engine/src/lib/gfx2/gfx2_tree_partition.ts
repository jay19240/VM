import { gfx2Manager } from './gfx2_manager';
import { TreePartition, TreePartitionNode, ITreePartitionMethod, SplitResult } from '../core/tree_partition';
import { Gfx2BoundingRect } from './gfx2_bounding_rect';

/**
 * Partitionne un espace 2D au moyen d'un arbre binaire afin d'accélérer les recherches d'intersections.
 */
export class Gfx2TreePartition extends TreePartition<Gfx2BoundingRect> {
  /**
   * Crée une partition 2D délimitée par un rectangle.
   *
   * @param {number} maxChildren - Nombre maximal d'objets par nœud avant subdivision.
   * @param {number} maxDepth - Profondeur maximale de subdivision de l'arbre.
   * @param {Gfx2BoundingRect} rect - Rectangle délimitant l'ensemble de l'espace partitionné.
   */
  constructor(maxChildren: number, maxDepth: number, rect: Gfx2BoundingRect = new Gfx2BoundingRect([0, 0], [0, 0])) {
    super(maxChildren, maxDepth, new Gfx2TreePartitionMethod(rect, 'x'));
  }
}

/**
 * Stratégie de partitionnement binaire 2D utilisée pour rechercher rapidement des intersections.
 */
export class Gfx2TreePartitionMethod implements ITreePartitionMethod<Gfx2BoundingRect> {
  rect: Gfx2BoundingRect;
  axis: 'x' | 'y';

  /**
   * Crée une stratégie de partition pour une zone et un axe donnés.
   *
   * @param {Gfx2BoundingRect} rect - Rectangle de la partition.
   * @param {'x' | 'y'} axis - Axe utilisé lors de la prochaine subdivision.
   */
  constructor(rect: Gfx2BoundingRect, axis: 'x' | 'y') {
    this.rect = rect;
    this.axis = axis;
  }

  /**
   * Dessine la zone de partition en bleu à des fins de débogage.
   */
  draw() {
    const ctx = gfx2Manager.getContext();
    const size = this.rect.getSize();
    ctx.fillStyle = 'blue';
    ctx.fillRect(this.rect.min[0], this.rect.min[1], size[0], size[1]);
  }

  /**
   * Déplace la zone de partition.
   *
   * @param {number} x - Translation sur l'axe horizontal.
   * @param {number} y - Translation sur l'axe vertical.
   */
  translate(x: number, y: number) {
    this.rect.min[0] += x;
    this.rect.min[1] += y;
    this.rect.max[0] += x;
    this.rect.max[1] += y;
  }

 /**
  * Recherche tous les rectangles qui intersectent la zone cible.
  *
  * @param {TreePartitionNode<Gfx2BoundingRect>} node - Nœud à partir duquel effectuer la recherche.
  * @param {Gfx2BoundingRect} target - Rectangle cible.
  * @param {Array<Gfx2BoundingRect>} results - Tableau auquel ajouter les rectangles correspondants.
  * @returns Les rectangles qui intersectent la cible.
  */
  search(node: TreePartitionNode<Gfx2BoundingRect>, target: Gfx2BoundingRect, results: Array<Gfx2BoundingRect> = []): Array<Gfx2BoundingRect> {
    if (!this.rect.intersectBoundingRect(target)) {
      return [];
    }

    const left = node.getLeft();
    const right = node.getRight();

    if (left && right) {
      left.search(target, results);
      right.search(target, results);
    }
    else {
      const children = node.getChildren();
      const max = children.length;
      for (let i = 0; i < max; i++) {
        if (children[i].intersectBoundingRect(target)) {
          results.push(children[i]);
        }
      }
    }

    return results;
  }

  /**
   * Répartit les rectangles de part et d'autre de l'axe courant et prépare les deux sous-partitions.
   *
   * @param {Array<Gfx2BoundingRect>} objects - Rectangles à répartir.
   * @returns Les listes gauche et droite ainsi que leur stratégie de partition respective.
   */
  split(objects: Array<Gfx2BoundingRect>): SplitResult<Gfx2BoundingRect> {
    const left = [];
    const right = [];
    const center = this.rect.getCenter();

    for (const object of objects) {
      if (this.axis === 'x') {
        if (object.min[0] <= center[0] && object.max[0] >= center[0]) {
          left.push(object);
          right.push(object);
        }
        else if (object.max[0] <= center[0]) {
          left.push(object);
        }
        else {
          right.push(object);
        }
      }
      else {
        if (object.min[1] <= center[1] && object.max[1] >= center[1]) {
          left.push(object);
          right.push(object);
        }
        else if (object.max[1] <= center[1]) {
          left.push(object);
        }
        else {
          right.push(object);
        }
      }
    }

    const rects = (this.axis === 'x') ? this.rect.splitVertical() : this.rect.splitHorizontal();
    const newAxis = (this.axis === 'x') ? 'y' : 'x';
    const leftMethod = new Gfx2TreePartitionMethod(rects[0], newAxis);
    const rightMethod = new Gfx2TreePartitionMethod(rects[1], newAxis);

    return { left, right, leftMethod, rightMethod };
  }
}