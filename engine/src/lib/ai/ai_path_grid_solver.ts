import { AIPathGrid } from './ai_path_grid';

/**
 * Décrit une cellule visitée et la cellule depuis laquelle elle a été atteinte.
 *
 * @typeParam T - Type des coordonnées, `vec2` ou `vec3`.
 */
export interface Visited<T> {
  pos: T;
  origin: T | null;
};

/**
 * Recherche le plus court chemin orthogonal sur une grille 2D ou 3D.
 *
 * @remarks
 * Fournissez une `AIPathGrid` dans laquelle `0` représente une cellule praticable et `1`
 * un obstacle, puis appelez `solve` avec les coordonnées de départ et d'arrivée.
 *
 * Ce résolveur convient aux cartes en tuiles, aux grilles de voxels, aux jeux tactiques,
 * aux roguelikes et aux puzzles. Pour les déplacements continus, préférez
 * `AIPathGraphSolver`.
 *
 * @typeParam T - Type des coordonnées, `vec2` ou `vec3`.
 */
export class AIPathGridSolver<T extends vec2 | vec3> {
  /**
   * Trouve et retourne le chemin le plus court entre un point de départ et un point d'arrivée sur la grille.
   *
   * @param grid - La grille de navigation contenant la disposition des obstacles.
   * @param startCoord - Les coordonnées de la position de départ.
   * @param endCoord - Les coordonnées de la position de destination.
   * @returns Un tableau de coordonnées représentant le chemin trouvé (du départ à l'arrivée), ou `null` si aucun chemin n'est possible.
   */
  solve(grid: AIPathGrid<T>, startCoord: T, endCoord: T): Array<T> | null {
    const visitedMap = new Map<string, Visited<T>>();
    const frontierCoordList: Array<T> = [];
    let find = false;

    frontierCoordList.push(startCoord);
    visitedMap.set(startCoord.join(';'), { pos: startCoord, origin: null });

    while (!find) {
      const frontierCoord = frontierCoordList.shift();
      if (!frontierCoord) {
        return null;
      }

      const dirs = this.heuristic(grid, frontierCoord, endCoord);

      for (const dir of dirs) {
        const nextCoord = dir.map((value, idx) => frontierCoord[idx] + value) as T;
        const strNextCoord = nextCoord.join(';');

        if (!grid.isInside(nextCoord) || grid.getValue(nextCoord) == 1 || visitedMap.get(strNextCoord)) {
          continue;
        }

        frontierCoordList.push(nextCoord);
        visitedMap.set(strNextCoord, { pos: nextCoord, origin: frontierCoord });

        if (grid.isSame(nextCoord, endCoord)) {
          find = true;
          break;
        }
      }
    }

    const path: Array<T> = [];
    let visited = visitedMap.get(endCoord.join(';'));

    while (visited) {
      path.unshift(visited.pos);
      visited = visitedMap.get(visited.origin ? visited.origin.join(';') : '');
    }

    return path;
  }

  /**
   * Évalue et retourne les directions de déplacement possibles depuis un point A vers un point B.
   * Les directions sont triées de la plus pertinente (celle qui rapproche le plus de la cible) à la moins pertinente.
   *
   * @param grid - La grille de navigation.
   * @param a - Les coordonnées de la position actuelle.
   * @param b - Les coordonnées de la destination finale.
   * @returns Un tableau de vecteurs de direction triés par ordre de pertinence.
   */
  heuristic(grid: AIPathGrid<T>, a: T, b: T): Array<T> {
    return grid.getDirections(a, b);
  }
}