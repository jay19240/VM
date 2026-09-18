/**
 * Classe abstraite représentant une grille de navigation.
 * Contient les dimensions de la grille et les données des cellules sous forme de tableau à une dimension.
 *
 * @typeParam T - Type de coordonnées pour les dimensions et positions (`vec2` ou `vec3`).
 */
export abstract class AIPathGrid<T extends vec2 | vec3> {
  grid: Array<number>;
  size: T;

  /**
   * Crée une grille de navigation.
   *
   * @param size - Dimensions de la grille.
   * @param grid - Valeurs initiales des cellules, sous forme de tableau linéaire.
   */
  constructor(size: T, grid = new Array<number>()) {
    this.grid = grid;
    this.size = size;
  }

  /**
   * Retourne la valeur contenue dans la cellule à une position donnée.
   *
   * @param pos - Les coordonnées de la cellule.
   * @returns La valeur numérique de la cellule, par exemple `0` ou `1`.
   */
  abstract getValue(pos: T): number;

  /**
   * Retourne tous les vecteurs directionnels orthogonaux possibles,
   * du plus susceptible de rapprocher de la cible au moins pertinent.
   *
   * @param a - Les coordonnées de la position de départ.
   * @param b - Les coordonnées de la position cible.
   * @returns Un tableau de vecteurs directionnels triés par pertinence.
   */
  abstract getDirections(a: T, b: T): Array<T>;

  /**
   * Vérifie si une position donnée se trouve à l'intérieur des limites de la grille.
   *
   * @param pos - Les coordonnées de la position à vérifier.
   * @returns `true` si la position est dans la grille, `false` sinon.
   */
  abstract isInside(pos: T): boolean;

  /**
   * Vérifie si deux positions sont strictement identiques.
   *
   * @param a - Les coordonnées de la première position.
   * @param b - Les coordonnées de la seconde position.
   * @returns `true` si les positions sont égales, `false` sinon.
   */
  abstract isSame(a: T, b: T): boolean;

  /**
   * Charge de manière asynchrone les données de la grille à partir d'un fichier JSON (`.grd`).
   *
   * @param path - Le chemin d'accès au fichier de la grille.
   * @throws Une erreur si le fichier est invalide ou ne porte pas la signature `GRD`.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'GRD') {
      throw new Error('AIPathGrid<T>::loadFromFile(): File not valid !');
    }

    this.grid = json['Grid'];
    this.size = json['Size'];
  }
}

/**
 * Implémentation d'une grille de navigation en deux dimensions (2D).
 */
export class AIPathGrid2D extends AIPathGrid<vec2> {
  /**
   * Crée une grille de navigation 2D.
   *
   * @param size - Dimensions de la grille sous la forme `[largeur, hauteur]`.
   * @param grid - Valeurs initiales des cellules.
   */
  constructor(size: vec2 = [0, 0], grid = new Array<number>()) {
    super(size, grid);
  }

  /**
   * Retourne la valeur de la cellule à la position donnée.
   *
   * @param pos - Les coordonnées 2D de la cellule.
   * @returns La valeur numérique de la cellule.
   */
  getValue(pos: vec2): number {
    return this.grid[(this.size[0] * pos[1]) + pos[0]];
  }

  /**
   * Retourne les 4 vecteurs directionnels (haut, bas, gauche, droite),
   * triés du plus proche de la direction cible au plus éloigné.
   *
   * @param a - La position actuelle.
   * @param b - La position cible.
   * @returns Un tableau de vecteurs directionnels 2D triés.
   */
  getDirections(a: vec2, b: vec2): Array<vec2> {
    const directions: Array<vec2> = [
      [ 0, -1],
      [ 1,  0],
      [ 0,  1],
      [-1,  0]
    ];

    const dx = b[0] - a[0];
    const dy = b[1] - a[1];

    return directions.sort((a, b) => {
      const lengthA = Math.sqrt(Math.pow(dx + a[0], 2) + Math.pow(dy + a[1], 2));
      const lengthB = Math.sqrt(Math.pow(dx + b[0], 2) + Math.pow(dy + b[1], 2));
      return lengthA - lengthB;
    });
  }

  /**
   * Vérifie si une position 2D est dans les limites de la grille.
   *
   * @param pos - Les coordonnées à vérifier.
   * @returns `true` si la position est valide.
   */
  isInside(pos: vec2): boolean {
    return !(pos[0] < 0 || pos[0] >= this.size[0] || pos[1] < 0 || pos[1] >= this.size[1]);
  }

  /**
   * Vérifie l'égalité stricte entre deux positions 2D.
   *
   * @param a - La première position.
   * @param b - La seconde position.
   * @returns `true` si les composantes X et Y sont égales.
   */
  isSame(a: vec2, b: vec2): boolean {
    return a[0] == b[0] && a[1] == b[1];
  }
}

/**
 * Implémentation d'une grille de navigation en trois dimensions (3D).
 */
export class AIPathGrid3D extends AIPathGrid<vec3> {
  /**
   * Crée une grille de navigation 3D.
   *
   * @param size - Dimensions de la grille sous la forme `[largeur, hauteur, profondeur]`.
   * @param grid - Valeurs initiales des cellules.
   */
  constructor(size: vec3 = [0, 0, 0], grid = new Array<number>()) {
    super(size, grid);
  }

  /**
   * Retourne la valeur de la cellule à la position donnée.
   * Convertit les coordonnées 3D en indice dans le tableau linéaire.
   *
   * @param pos - Les coordonnées 3D de la cellule.
   * @returns La valeur numérique de la cellule.
   */
  getValue(pos: vec3): number {
    return this.grid[(this.size[2] * pos[2]) + (this.size[0] * pos[1]) + pos[0]];
  }

  /**
   * Retourne les 6 vecteurs directionnels orthogonaux 3D,
   * triés du plus proche de la direction cible au plus éloigné.
   *
   * @param a - La position actuelle.
   * @param b - La position cible.
   * @returns Un tableau de vecteurs directionnels 3D triés.
   */
  getDirections(a: vec3, b: vec3): Array<vec3> {
    const directions: Array<vec3> = [
      [ 0,  0,  1],
      [ 0,  0, -1],
      [-1,  0,  0],
      [ 1,  0,  0],
      [ 0,  1,  0],
      [ 0, -1,  0]
    ];

    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];

    return directions.sort((a, b) => {
      const lengthA = Math.sqrt(Math.pow(dx + a[0], 2) + Math.pow(dy + a[1], 2) * Math.pow(dz + a[2], 2));
      const lengthB = Math.sqrt(Math.pow(dx + b[0], 2) + Math.pow(dy + b[1], 2) * Math.pow(dz + b[2], 2));
      return lengthA - lengthB;
    });
  }

  /**
   * Vérifie si une position 3D est dans les limites de la grille.
   *
   * @param pos - Les coordonnées à vérifier.
   * @returns `true` si la position est valide.
   */
  isInside(pos: vec3): boolean {
    return !(pos[0] < 0 || pos[0] >= this.size[0] || pos[1] < 0 || pos[1] >= this.size[1] || pos[2] < 0 || pos[2] >= this.size[2]);
  }

  /**
   * Vérifie l'égalité stricte entre deux positions 3D.
   *
   * @param a - La première position.
   * @param b - La seconde position.
   * @returns `true` si les composantes X, Y et Z sont égales.
   */
  isSame(a: vec3, b: vec3): boolean {
    return a[0] == b[0] && a[1] == b[1] && a[2] == b[2];
  }
}