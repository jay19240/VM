import { gfx3DebugRenderer } from './gfx3_debug_renderer';
import { UT } from '../core/utils';
import { Gfx3BoundingBox } from './gfx3_bounding_box';
import { TreePartition, TreePartitionNode, ITreePartitionMethod, SplitResult } from '../core/tree_partition';

/** Partition binaire de l'espace 3D fondée sur des boîtes englobantes. */
export class Gfx3TreePartition extends TreePartition<Gfx3BoundingBox> {
  /**
   * Crée une partition dont les axes de subdivision alternent entre X, Y et Z.
   *
   * @param maxChildren - Nombre maximal d'objets dans un nœud avant subdivision.
   * @param maxDepth - Profondeur maximale de l'arbre.
   * @param aabb - Boîte délimitant l'espace racine.
   */
  constructor(maxChildren: number, maxDepth: number, aabb: Gfx3BoundingBox = new Gfx3BoundingBox([0, 0, 0], [0, 0, 0])) {
    super(maxChildren, maxDepth, new Gfx3TreePartitionMethod(aabb, 'x'));
  }
}

/** Stratégie de subdivision 3D qui accélère les recherches d'intersections entre boîtes. */
export class Gfx3TreePartitionMethod implements ITreePartitionMethod<Gfx3BoundingBox> {
  box: Gfx3BoundingBox;
  axis: 'x' | 'y' | 'z';

  /**
   * Crée une stratégie pour une région et un axe de subdivision donnés.
   *
   * @param box - Boîte délimitant la région.
   * @param axis - Axe utilisé lors de la prochaine subdivision.
   */
  constructor(box: Gfx3BoundingBox, axis: 'x' | 'y' | 'z') {
    this.box = box;
    this.axis = axis;
  }

  /** Ajoute la boîte de cette région au rendu de débogage. */
  draw(): void {
    gfx3DebugRenderer.drawBoundingBox(UT.MAT4_IDENTITY(), this.box.min, this.box.max);
  }

  /**
   * Translate la région de partition.
   *
   * @param x - Déplacement sur X.
   * @param y - Déplacement sur Y.
   * @param z - Déplacement sur Z.
   */
  translate(x: number, y: number, z: number) {
    this.box.min[0] += x;
    this.box.min[1] += y;
    this.box.min[2] += z;
    this.box.max[0] += x;
    this.box.max[1] += y;
    this.box.max[2] += z;
  }

  /**
   * Recherche dans un nœud toutes les boîtes qui intersectent la cible.
   *
   * @param node - Nœud à parcourir.
   * @param target - Boîte cible.
   * @param results - Tableau dans lequel accumuler les correspondances.
   * @returns Le tableau des boîtes trouvées, ou un tableau vide si la région n'intersecte pas la cible.
   */
  search(node: TreePartitionNode<Gfx3BoundingBox>, target: Gfx3BoundingBox, results: Array<Gfx3BoundingBox> = []): Array<Gfx3BoundingBox> {
    if (!this.box.intersectBoundingBox(target)) {
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
      for (let i = 0; i < children.length; i++) {
        if (children[i].intersectBoundingBox(target)) {
          results.push(children[i]);
        }
      }
    }

    return results;
  }

  /**
   * Répartit les boîtes de part et d'autre de l'axe courant et prépare les deux régions filles.
   * Une boîte traversant le plan de coupe est placée dans les deux branches.
   *
   * @param objects - Boîtes à répartir.
   * @returns Les listes gauche et droite ainsi que leurs stratégies de partition respectives.
   */
  split(objects: Array<Gfx3BoundingBox>): SplitResult<Gfx3BoundingBox> {
    const left = [];
    const right = [];
    const center = this.box.getCenter();

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
      else if (this.axis === 'y') {
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
      else {
        if (object.min[2] <= center[2] && object.max[2] >= center[2]) {
          left.push(object);
          right.push(object);
        }
        else if (object.max[2] <= center[2]) {
          left.push(object);
        }
        else {
          right.push(object);
        }
      }
    }

    let boxes: Array<Gfx3BoundingBox> = [];
    let newAxis: 'x' | 'y' | 'z' = 'x';

    if (this.axis === 'x') {
      boxes = this.box.splitVertical();
      newAxis = 'y';
    }
    else if (this.axis === 'y') {
      boxes = this.box.splitHorizontal();
      newAxis = 'z';
    }
    else {
      boxes = this.box.splitDepth();
      newAxis = 'x';
    }

    const leftMethod = new Gfx3TreePartitionMethod(boxes[0], newAxis);
    const rightMethod = new Gfx3TreePartitionMethod(boxes[1], newAxis);

    return { left, right, leftMethod, rightMethod };
  }
}