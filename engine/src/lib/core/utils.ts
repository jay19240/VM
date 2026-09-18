/**
 * Définit un segment de correspondance entre une plage d'entrée et une plage de sortie.
 */
export type CurveMapItem = {
  mapBegin: number;
  mapEnd: number;
  valueMin: number;
  valueMax: number;
};

/**
 * Regroupe des utilitaires numériques, vectoriels et matriciels statiques.
 */
export class UT {
  static DEG_TO_RAD_RATIO = Math.PI / 180;
  static EPSILON = 0.0000001;
  static BIG_EPSILON = 0.0001;
  static VEC2_SIZE = 8;
  static VEC2_ZERO: vec2 = [0, 0];
  static VEC2_LEFT: vec2 = [-1, 0];
  static VEC2_RIGHT: vec2 = [1, 0];
  static VEC2_UP: vec2 = [0, 1];
  static VEC2_DOWN: vec2 = [0, -1];
  static VEC2_ISO_LEFT: vec2 = [0, 1];
  static VEC2_ISO_RIGHT: vec2 = [0, -1];
  static VEC2_ISO_FORWARD: vec2 = [-1, 0];
  static VEC2_ISO_BACKWARD: vec2 = [1, 0];
  static VEC3_SIZE = 12;
  static VEC3_ZERO: vec3 = [0, 0, 0];
  static VEC3_BACKWARD: vec3 = [0, 0, 1];
  static VEC3_FORWARD: vec3 = [0, 0, -1];
  static VEC3_LEFT: vec3 = [-1, 0, 0];
  static VEC3_RIGHT: vec3 = [1, 0, 0];
  static VEC3_UP: vec3 = [0, 1, 0];
  static VEC3_DOWN: vec3 = [0, -1, 0];

  /**
   * Affiche un message d'échec dans l'élément prévu à cet effet.
   *
   * @param message - Message à afficher.
   * @ignore
   */
  static FAIL(message: string) {
    const elem = document.querySelector<HTMLDivElement>('#APP_FAIL')!;
    elem.classList.add('SHOW');
    elem.textContent = message;
  }

  /**
   * Sépare le nom et l'extension d'un fichier.
   *
   * @param filename - Nom de fichier à analyser.
   * @returns Nom sans extension et dernière extension rencontrée.
   */
  static GET_FILENAME_INFOS(filename: string): { name: string, ext: string } {
    const splitname = filename.split('.');
    return {
      name: splitname.slice(0, -1).join(),
      ext: splitname.at(-1) ?? ''
    };
  }

  /**
   * Attend pendant une durée donnée.
   *
   * @param ms - Durée d'attente en millisecondes.
   * @returns Promesse résolue à l'issue du délai.
   */
  static WAIT(ms: number): Promise<any> {
    return new Promise((resolve: Function) => {
      window.setTimeout(() => resolve(), ms);
    });
  }

  /**
   * Mélange aléatoirement une copie d'un tableau.
   *
   * @param arr - Tableau source.
   * @returns Nouveau tableau mélangé.
   */
  static SHUFFLE(arr: Array<any>): Array<any> {
    const res = arr.slice();
    let tmp, cur, tp = res.length;
    if (tp) {
      while (--tp) {
        cur = Math.floor(Math.random() * (tp + 1));
        tmp = res[cur];
        res[cur] = res[tp];
        res[tp] = tmp;
      }
    }

    return res;
  }

  /**
   * Crée une suite arithmétique inclusive.
   *
   * @param start - Première valeur.
   * @param stop - Dernière valeur visée.
   * @param step - Pas entre deux valeurs.
   * @returns Tableau de la suite générée.
   */
  static RANGE_ARRAY(start: number, stop: number, step: number = 0) {
    return Array.from({ length: (stop - start) / step + 1 }, (value, index) => start + index * step);
  }

  /**
   * Crée puis mélange les entiers d'un intervalle inclusif.
   *
   * @param min - Borne minimale.
   * @param max - Borne maximale.
   * @returns Entiers de l'intervalle dans un ordre aléatoire.
   */
  static RANDARRAY(min: number, max: number): Array<number> {
    const arr = [];
    for (let i = min; i <= max; i++) {
      arr.push(i);
    }

    return UT.SHUFFLE(arr);
  }

  /**
   * Applique une dispersion aléatoire centrée sur une valeur.
   *
   * @param base - Valeur centrale.
   * @param spread - Amplitude totale de dispersion.
   * @returns Valeur comprise entre `base - spread / 2` et `base + spread / 2`.
   */
  static SPREAD(base: number, spread: number): number {
    return base + spread * (Math.random() - 0.5);
  }

  /**
   * Tire un entier aléatoire dans un intervalle semi-ouvert.
   *
   * @param min - Borne minimale incluse.
   * @param max - Borne maximale exclue.
   * @returns Entier aléatoire de l'intervalle.
   */
  static GET_RANDOM_INT(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
  }

  /**
   * Tire un nombre flottant aléatoire dans un intervalle semi-ouvert.
   *
   * @param min - Borne minimale incluse.
   * @param max - Borne maximale exclue.
   * @returns Nombre aléatoire de l'intervalle.
   */
  static GET_RANDOM_FLOAT(min: number, max: number): number {
    return (Math.random() * (max - min)) + min;
  }

  /**
   * Contraint une valeur à un intervalle fermé.
   *
   * @param value - Valeur à contraindre.
   * @param min - Borne minimale.
   * @param max - Borne maximale.
   * @returns Valeur contrainte.
   */
  static CLAMP(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Remplace par zéro une valeur dont l'amplitude est inférieure à un seuil.
   *
   * @param value - Valeur à filtrer.
   * @param threshold - Seuil absolu de la zone morte.
   * @returns Zéro dans la zone morte, sinon la valeur d'origine.
   */
  static DEADZONE(value: number, threshold = 0.001) {
    return Math.abs(value) < threshold ? 0 : value;
  }

  /**
   * Convertit un angle de degrés en radians.
   *
   * @param deg - Angle en degrés.
   * @returns Angle en radians.
   */
  static DEG_TO_RAD(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Normalise un angle autour de l'intervalle `[-π, π]`.
   *
   * @param angle - Angle en radians.
   * @returns Angle normalisé.
   */
  static NORMALIZE_ANGLE(angle: number) {
    angle = angle % Math.PI * 2;

    if (angle > Math.PI) {
      angle -= Math.PI * 2;
    }
    else if (angle < -Math.PI) {
      angle += Math.PI * 2;
    }

    return angle;
  }

  /**
   * Ramène un angle dans l'intervalle `[0, 2π[`.
   *
   * @param angle - Angle en radians.
   * @returns Angle ramené dans un tour positif.
   */
  static CLAMP_ANGLE(angle: number) {
    angle %= (2 * Math.PI);
    if (angle < 0) angle += (2 * Math.PI);
    return angle;
  }

  /**
   * Effectue une interpolation linéaire entre deux nombres.
   *
   * @param a - Valeur initiale.
   * @param b - Valeur finale.
   * @param t - Facteur d'interpolation.
   * @returns Valeur interpolée.
   */
  static LERP(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Interpole deux nombres selon une progression exponentielle.
   *
   * @param a - Valeur initiale.
   * @param b - Valeur finale.
   * @param exp - Base de la progression exponentielle.
   * @param t - Exposant appliqué à la base.
   * @returns Valeur interpolée.
   */
  static LERP_EXP(a: number, b: number, exp: number, t: number): number {
    return a + (b - a) * Math.pow(exp, t);
  }

  /**
   * Interpole composante par composante deux tableaux numériques.
   *
   * @param a - Valeurs initiales.
   * @param b - Valeurs finales.
   * @param t - Facteur d'interpolation.
   * @returns Tableau des composantes interpolées.
   */
  static MIX(a: Array<number>, b: Array<number>, t: number): Array<number> {
    return a.map((v, i) => UT.LERP(v, b[i], t));
  }

  /**
   * Effectue une interpolation bilinéaire entre quatre tableaux de composantes.
   *
   * @param tl - Valeur du coin supérieur gauche.
   * @param tr - Valeur du coin supérieur droit.
   * @param bl - Valeur du coin inférieur gauche.
   * @param br - Valeur du coin inférieur droit.
   * @param t1 - Facteur d'interpolation horizontal.
   * @param t2 - Facteur d'interpolation vertical.
   * @returns Composantes interpolées.
   */
  static BILINEAR_FILTER(tl: Array<number>, tr: Array<number>, bl: Array<number>, br: Array<number>, t1: number, t2: number): Array<any> {
    const t = UT.MIX(tl, tr, t1);
    const b = UT.MIX(bl, br, t1);
    return UT.MIX(t, b, t2);
  };

  /**
   * Arrondit un nombre à une précision donnée dans une base numérique.
   *
   * @param num - Nombre à arrondir.
   * @param digits - Nombre de chiffres de précision.
   * @param base - Base numérique utilisée pour l'arrondi.
   * @returns Nombre arrondi.
   */
  static TO_FIXED_NUMBER(num: number, digits: number, base: number = 10): number {
    const pow = Math.pow(base, digits);
    return Math.round(num * pow) / pow;
  }

  /**
   * Copie un nombre dans un vecteur à une composante.
   *
   * @param src - Nombre source.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC1_COPY(src: number, out: vec1 = [0]): vec1 {
    out[0] = src;
    return out;
  }

  /**
   * Crée un vecteur 2D en précision simple.
   *
   * @param x - Première composante.
   * @param y - Deuxième composante.
   * @returns Nouveau vecteur `[x, y]`.
   */
  static VEC2_CREATE(x: number = 0, y: number = 0): Float32Array {
    const out = new Float32Array(2);
    out[0] = x;
    out[1] = y;
    return out;
  }

  /**
   * Analyse deux composantes numériques séparées dans une chaîne.
   *
   * @param str - Chaîne à analyser.
   * @param separator - Séparateur entre les composantes.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC2_PARSE(str: string, separator: string = ' ', out: vec2 = [0, 0]): vec2 {
    const a = str.split(separator);
    out[0] = parseFloat(a[0]);
    out[1] = parseFloat(a[1]);
    return out;
  }

  /**
   * Copie un vecteur 2D.
   *
   * @param src - Vecteur source.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC2_COPY(src: vec2, out: vec2 = [0, 0]): vec2 {
    out[0] = src[0];
    out[1] = src[1];
    return out;
  }

  /**
   * Indique si les composantes d'un vecteur 2D sont presque nulles.
   *
   * @param a - Vecteur à vérifier.
   * @returns `true` si chaque composante est inférieure ou égale à `EPSILON` en valeur absolue.
   */
  static VEC2_ISZERO(a: vec2): boolean {
    return Math.abs(a[0]) <= UT.EPSILON && Math.abs(a[1]) <= UT.EPSILON;
  }

  /**
   * Applique une dispersion aléatoire indépendante aux composantes d'un vecteur 2D.
   *
   * @param base - Vecteur central.
   * @param spread - Amplitude de dispersion par composante.
   * @returns Vecteur dispersé.
   */
  static VEC2_SPREAD(base: vec2, spread: vec2): vec2 {
    const rand: vec2 = [Math.random() - 0.5, Math.random() - 0.5];
    return UT.VEC2_ADD(base, UT.VEC2_MULTIPLY(spread, rand));
  }

  /**
   * Interpole linéairement deux vecteurs 2D.
   *
   * @param b - Vecteur initial.
   * @param e - Vecteur final.
   * @param t - Temps écoulé.
   * @param d - Durée totale.
   * @returns Vecteur interpolé.
   */
  static VEC2_LERP(b: vec2, e: vec2, t: number, d: number = 1): vec2 {
    const c = UT.VEC2_SUBSTRACT(e, b);
    const p = t / d;
    return [b[0] + c[0] * p, b[1] + c[1] * p];
  }

  /**
   * Calcule un point sur un cercle autour d'un centre 2D.
   *
   * @param center - Centre de rotation.
   * @param radius - Rayon du cercle.
   * @param angle - Angle de rotation en radians.
   * @returns Position calculée.
   */
  static VEC2_ROTATE_AROUND(center: vec2, radius: number, angle: number): vec2 {
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return [center[0] + x, center[1] + y];
  }

  /**
   * Calcule l'opposé d'un vecteur 2D.
   *
   * @param a - Vecteur source.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC2_OPPOSITE(a: vec2, out: vec2 = [0, 0]): vec2 {
    out[0] = -a[0];
    out[1] = -a[1];
    return out;
  }

  /**
   * Calcule la distance euclidienne entre deux points 2D.
   *
   * @param a - Premier point.
   * @param b - Second point.
   * @returns Distance entre les points.
   */
  static VEC2_DISTANCE(a: vec2, b: vec2): number {
    const x = b[0] - a[0];
    const y = b[1] - a[1];
    return Math.sqrt((x * x) + (y * y));
  }

  /**
   * Calcule la norme euclidienne d'un vecteur 2D.
   *
   * @param a - Vecteur source.
   * @returns Longueur du vecteur.
   */
  static VEC2_LENGTH(a: vec2): number {
    return Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  }

  /**
   * Normalise un vecteur 2D non nul.
   *
   * @param a - Vecteur source.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination normalisé.
   */
  static VEC2_NORMALIZE(a: vec2, out: vec2 = [0, 0]): vec2 {
    const len = UT.VEC2_LENGTH(a);
    if (len > 0) {
      out[0] = a[0] / len;
      out[1] = a[1] / len;
    }

    return out;
  }

  /**
   * Calcule le produit scalaire de deux vecteurs 2D.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @returns Produit scalaire.
   */
  static VEC2_DOT(a: vec2, b: vec2): number {
    return a[0] * b[0] + a[1] * b[1];
  }

  /**
   * Calcule le produit vectoriel scalaire de deux vecteurs 2D.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @returns Composante Z du produit vectoriel.
   */
  static VEC2_CROSS(a: vec2, b: vec2): number {
    return a[0] * b[1] - a[1] * b[0];
  }

  /**
   * Détermine l'orientation de trois points 2D.
   *
   * @param p - Premier point.
   * @param q - Deuxième point.
   * @param r - Troisième point.
   * @returns `0` s'ils sont alignés, `1` dans le sens horaire, `2` dans le sens antihoraire.
   */
  static VEC2_ORIENTATION(p: vec2, q: vec2, r: vec2): number {
    const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
    if (val == 0) return 0; // collinear
    return (val > 0) ? 1 : 2; // clock or counterclock wise
  }

  /**
   * Additionne deux vecteurs 2D composante par composante.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC2_ADD(a: vec2, b: vec2, out: vec2 = [0, 0]): vec2 {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    return out;
  }

  /**
   * Soustrait deux vecteurs 2D composante par composante.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */

  static VEC2_SUBSTRACT(a: vec2, b: vec2, out: vec2 = [0, 0]): vec2 {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    return out;
  }

  /**
   * Multiplie deux vecteurs 2D composante par composante.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC2_MULTIPLY(a: vec2, b: vec2, out: vec2 = [0, 0]): vec2 {
    out[0] = a[0] * b[0];
    out[1] = a[1] * b[1];
    return out;
  }

  /**
   * Multiplie un vecteur 2D par un scalaire.
   *
   * @param a - Vecteur source.
   * @param scale - Facteur multiplicatif.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC2_SCALE(a: vec2, scale: number, out: vec2 = [0, 0]): vec2 {
    out[0] = a[0] * scale;
    out[1] = a[1] * scale;
    return out;
  }

  /**
   * Ajoute à un vecteur 2D un second vecteur multiplié par un scalaire.
   *
   * @param a - Vecteur initial.
   * @param b - Vecteur à multiplier puis ajouter.
   * @param scale - Facteur appliqué à `b`.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC2_ADD_SCALED(a: vec2, b: vec2, scale: number, out: vec2 = [0, 0]): vec2 {
    out[0] = a[0] + b[0] * scale;
    out[1] = a[1] + b[1] * scale;
    return out;
  }

  /**
   * Sélectionne le minimum de chaque paire de composantes 2D.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @param out - Vecteur de destination.
   * @returns Vecteur des minima.
   */
  static VEC2_MIN(a: vec2, b: vec2, out: vec2 = [0, 0]): vec2 {
    out[0] = Math.min(a[0], b[0]);
    out[1] = Math.min(a[1], b[1]);
    return out;
  }

  /**
   * Sélectionne le maximum de chaque paire de composantes 2D.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @param out - Vecteur de destination.
   * @returns Vecteur des maxima.
   */
  static VEC2_MAX(a: vec2, b: vec2, out: vec2 = [0, 0]): vec2 {
    out[0] = Math.max(a[0], b[0]);
    out[1] = Math.max(a[1], b[1]);
    return out;
  }

  /**
   * Contraint chaque composante d'un vecteur 2D à des bornes distinctes.
   *
   * @param value - Vecteur à contraindre.
   * @param min - Bornes minimales.
   * @param max - Bornes maximales.
   * @param out - Vecteur de destination.
   * @returns Vecteur contraint.
   */
  static VEC2_CLAMP(value: vec2, min: vec2, max: vec2, out: vec2 = [0, 0]): vec2 {
    out[0] = Math.max(min[0], Math.min(max[0], value[0]));
    out[1] = Math.max(min[1], Math.min(max[1], value[1]));
    return out;
  }

  /**
   * Arrondit chaque composante d'un vecteur 2D à l'entier inférieur.
   *
   * @param a - Vecteur source.
   * @param out - Vecteur de destination.
   * @returns Vecteur arrondi.
   */
  static VEC2_FLOOR(a: vec2, out: vec2 = [0, 0]): vec2 {
    out[0] = Math.floor(a[0]);
    out[1] = Math.floor(a[1]);
    return out;
  }

  /**
   * Arrondit chaque composante d'un vecteur 2D à l'entier supérieur.
   *
   * @param a - Vecteur source.
   * @param out - Vecteur de destination.
   * @returns Vecteur arrondi.
   */
  static VEC2_CEIL(a: vec2, out: vec2 = [0, 0]): vec2 {
    out[0] = Math.ceil(a[0]);
    out[1] = Math.ceil(a[1]);
    return out;
  }

  /**
   * Calcule l'angle entre deux vecteurs 2D.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @returns Angle en radians.
   */
  static VEC2_ANGLE_BETWEEN(a: vec2, b: vec2): number {
    return Math.acos(UT.VEC2_DOT(a, b) / (UT.VEC2_LENGTH(a) * UT.VEC2_LENGTH(b)));
  }

  /**
   * Calcule l'angle polaire positif d'un vecteur 2D.
   *
   * @param a - Vecteur source.
   * @returns Angle en radians dans `[0, 2π]`.
   */
  static VEC2_ANGLE(a: vec2): number {
    const angle = Math.atan2(a[1], a[0]);
    return (angle > 0) ? angle : (angle + Math.PI * 2);
  }

  /**
   * Crée un vecteur directeur 2D à partir d'un angle.
   *
   * @param angle - Angle en radians.
   * @param out - Vecteur de destination.
   * @returns Vecteur unitaire correspondant.
   */
  static VEC2_FROM_ANGLE(angle: number, out: vec2 = [0, 0]): vec2 {
    out[0] = Math.cos(angle);
    out[1] = Math.sin(angle);
    return out;
  }

  /**
   * Compare strictement deux vecteurs 2D.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @returns `true` si leurs composantes sont égales.
   */
  static VEC2_ISEQUAL(a: vec2, b: vec2): boolean {
    return a[0] == b[0] && a[1] == b[1];
  }

  /**
   * Projette orthogonalement un vecteur 2D sur un autre.
   *
   * @param a - Vecteur à projeter.
   * @param b - Axe de projection.
   * @param out - Vecteur de destination.
   * @returns Projection de `a` sur `b`.
   */
  static VEC2_PROJECTION_COS(a: vec2, b: vec2, out: vec2 = [0, 0]): vec2 {
    const bLength = Math.sqrt((b[0] * b[0]) + (b[1] * b[1]));
    const scale = ((a[0] * b[0]) + (a[1] * b[1])) / (bLength * bLength);
    out[0] = b[0] * scale;
    out[1] = b[1] * scale;
    return out;
  }

  /**
   * Évalue une courbe de Bézier quadratique 2D.
   *
   * @param p0 - Point initial.
   * @param p1 - Point de contrôle.
   * @param p2 - Point final.
   * @param t - Paramètre d'interpolation.
   * @param out - Point de destination.
   * @returns Point évalué sur la courbe.
   */
  static VEC2_QUADRATIC_BEZIER(p0: vec2, p1: vec2, p2: vec2, t: number, out: vec2 = [0, 0]): vec2 {
    const pax = p0[0] + ((p1[0] - p0[0]) * t);
    const pay = p0[1] + ((p1[1] - p0[1]) * t);

    const pbx = p1[0] + ((p2[0] - p1[0]) * t);
    const pby = p1[1] + ((p2[1] - p1[1]) * t);

    out[0] = pax + ((pbx - pax) * t);
    out[1] = pay + ((pby - pay) * t);
    return out;
  }

  /**
   * Convertit un point isométrique en coordonnées cartésiennes 2D.
   *
   * @param p - Point isométrique.
   * @returns Point cartésien.
   */
  static VEC2_ISO_TO_2D(p: vec2): vec2 {
    let x = (2 * p[1] + p[0]) * 0.5;
    let y = (2 * p[1] - p[0]) * 0.5;
    return [x, y];
  }

  /**
   * Convertit un point cartésien 2D en coordonnées isométriques.
   *
   * @param p - Point cartésien.
   * @returns Point isométrique.
   */
  static VEC2_2D_TO_ISO(p: vec2): vec2 {
    let x = (p[0] - p[1]);
    let y = (p[0] + p[1]) * 0.5;
    return [x, y];
  }

  /**
   * Calcule les quatre points cardinaux d'une forme isométrique orientée.
   *
   * @param direction - Orientation parmi `FORWARD`, `BACKWARD`, `LEFT` et `RIGHT`.
   * @param depth - Profondeur de la forme.
   * @param width - Largeur de la forme.
   * @returns Points avant, gauche, droit et arrière.
   */
  static VEC2_ISO_CARDINAL_POINTS(direction: string, depth: number, width: number): { f: vec2, l: vec2, r: vec2, b: vec2 } {
    if (direction == 'FORWARD') {
      const f = UT.VEC2_2D_TO_ISO([-depth * 0.5, 0]);
      const l = UT.VEC2_2D_TO_ISO([0, width * 0.5]);
      const r = UT.VEC2_2D_TO_ISO([0, -width * 0.5]);
      const b = UT.VEC2_2D_TO_ISO([depth * 0.5, 0]);
      return { f, l, r, b };
    }

    if (direction == 'BACKWARD') {
      const f = UT.VEC2_2D_TO_ISO([depth * 0.5, 0]);
      const l = UT.VEC2_2D_TO_ISO([0, -width * 0.5]);
      const r = UT.VEC2_2D_TO_ISO([0, width * 0.5]);
      const b = UT.VEC2_2D_TO_ISO([-depth * 0.5, 0]);
      return { f, l, r, b };
    }

    if (direction == 'LEFT') {
      const f = UT.VEC2_2D_TO_ISO([0, depth * 0.5]);
      const l = UT.VEC2_2D_TO_ISO([-width * 0.5, 0]);
      const r = UT.VEC2_2D_TO_ISO([width * 0.5, 0]);
      const b = UT.VEC2_2D_TO_ISO([0, depth * 0.5]);
      return { f, l, r, b };
    }

    if (direction == 'RIGHT') {
      const f = UT.VEC2_2D_TO_ISO([0, -depth * 0.5]);
      const l = UT.VEC2_2D_TO_ISO([width * 0.5, 0]);
      const r = UT.VEC2_2D_TO_ISO([-width * 0.5, 0]);
      const b = UT.VEC2_2D_TO_ISO([0, depth * 0.5]);
      return { f, l, r, b };
    }

    return { f: [0, 0], l: [0, 0], r: [0, 0], b: [0, 0] };
  }

  /**
   * Crée un vecteur 3D en précision simple.
   *
   * @param x - Première composante.
   * @param y - Deuxième composante.
   * @param z - Troisième composante.
   * @returns Nouveau vecteur `[x, y, z]`.
   */
  static VEC3_CREATE(x: number = 0, y: number = 0, z: number = 0): Float32Array {
    const out = new Float32Array(3);
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
  }

  /**
   * Analyse trois composantes numériques séparées dans une chaîne.
   *
   * @param str - Chaîne à analyser.
   * @param separator - Séparateur entre les composantes.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC3_PARSE(str: string, separator: string = ' ', out: vec3 = [0, 0, 0]): vec3 {
    const a = str.split(separator);
    out[0] = parseFloat(a[0]);
    out[1] = parseFloat(a[1]);
    out[2] = parseFloat(a[2]);
    return out;
  }

  /**
   * Copie un vecteur 3D.
   *
   * @param src - Vecteur source.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC3_COPY(src: vec3, out: vec3 = [0, 0, 0]): vec3 {
    out[0] = src[0];
    out[1] = src[1];
    out[2] = src[2];
    return out;
  }

  /**
   * Indique si les composantes d'un vecteur 3D sont presque nulles.
   *
   * @param a - Vecteur à vérifier.
   * @returns `true` si chaque composante est inférieure ou égale à `EPSILON` en valeur absolue.
   */
  static VEC3_ISZERO(a: vec3): boolean {
    return Math.abs(a[0]) <= UT.EPSILON && Math.abs(a[1]) <= UT.EPSILON && Math.abs(a[2]) <= UT.EPSILON;
  }

  /**
   * Applique une dispersion aléatoire indépendante aux composantes d'un vecteur 3D.
   *
   * @param base - Vecteur central.
   * @param spread - Amplitude de dispersion par composante.
   * @returns Vecteur dispersé.
   */
  static VEC3_SPREAD(base: vec3, spread: vec3): vec3 {
    const rand3 = UT.VEC3_CREATE(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    return UT.VEC3_ADD(base, UT.VEC3_MULTIPLY(spread, rand3));
  }

  /**
   * Interpole linéairement deux vecteurs 3D.
   *
   * @param b - Vecteur initial.
   * @param e - Vecteur final.
   * @param t - Temps écoulé.
   * @param d - Durée totale.
   * @returns Vecteur interpolé.
   */
  static VEC3_LERP(b: vec3, e: vec3, t: number, d: number = 1): vec3 {
    const c = UT.VEC3_SUBSTRACT(e, b);
    const p = t / d;
    return [b[0] + c[0] * p, b[1] + c[1] * p, b[2] + c[2] * p];
  }

  /**
   * Calcule un point sur une sphère autour d'un centre 3D.
   *
   * @param center - Centre de rotation.
   * @param radius - Rayon de la sphère.
   * @param phi - Angle horizontal en radians.
   * @param theta - Angle vertical en radians.
   * @returns Position calculée.
   */
  static VEC3_ROTATE_AROUND(center: vec3, radius: number, phi: number, theta: number): vec3 {
    const r = Math.cos(theta) * radius;
    const y = Math.sin(theta) * radius;
    const z = Math.sin(phi) * r;
    const x = Math.cos(phi) * r;
    return [center[0] + x, center[1] + y, center[2] + z];
  }

  /**
   * Calcule l'opposé d'un vecteur 3D.
   *
   * @param a - Vecteur source.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC3_OPPOSITE(a: vec3, out: vec3 = [0, 0, 0]): vec3 {
    out[0] = -a[0];
    out[1] = -a[1];
    out[2] = -a[2];
    return out;
  }

  /**
   * Calcule la distance euclidienne entre deux points 3D.
   *
   * @param a - Premier point.
   * @param b - Second point.
   * @returns Distance entre les points.
   */
  static VEC3_DISTANCE(a: vec3, b: vec3): number {
    const x = b[0] - a[0];
    const y = b[1] - a[1];
    const z = b[2] - a[2];
    return Math.sqrt((x * x) + (y * y) + (z * z));
  }

  /**
   * Calcule la norme euclidienne d'un vecteur 3D.
   *
   * @param a - Vecteur source.
   * @returns Longueur du vecteur.
   */
  static VEC3_LENGTH(a: vec3): number {
    return Math.sqrt((a[0] * a[0]) + (a[1] * a[1]) + (a[2] * a[2]));
  }

  /**
   * Normalise un vecteur 3D non nul.
   *
   * @param a - Vecteur source.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination normalisé.
   */
  static VEC3_NORMALIZE(a: vec3, out: vec3 = [0, 0, 0]): vec3 {
    const len = UT.VEC3_LENGTH(a);
    if (len > 0) {
      out[0] = a[0] / len;
      out[1] = a[1] / len;
      out[2] = a[2] / len;
    }

    return out;
  }

  /**
   * Calcule le produit scalaire de deux vecteurs 3D.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @returns Produit scalaire.
   */
  static VEC3_DOT(a: vec3, b: vec3): number {
    return (a[0] * b[0]) + (a[1] * b[1]) + (a[2] * b[2]);
  }

  /**
   * Calcule le produit vectoriel de deux vecteurs 3D.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @param out - Vecteur de destination.
   * @returns Produit vectoriel.
   */
  static VEC3_CROSS(a: vec3, b: vec3, out: vec3 = [0, 0, 0]): vec3 {
    out[0] = (a[1] * b[2]) - (a[2] * b[1]);
    out[1] = (a[2] * b[0]) - (a[0] * b[2]);
    out[2] = (a[0] * b[1]) - (a[1] * b[0]);
    return out;
  }

  /**
   * Additionne deux vecteurs 3D composante par composante.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC3_ADD(a: vec3, b: vec3, out: vec3 = [0, 0, 0]): vec3 {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    return out;
  }

  /**
   * Soustrait deux vecteurs 3D composante par composante.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC3_SUBSTRACT(a: vec3, b: vec3, out: vec3 = [0, 0, 0]): vec3 {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    return out;
  }

  /**
   * Multiplie deux vecteurs 3D composante par composante.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC3_MULTIPLY(a: vec3, b: vec3, out: vec3 = [0, 0, 0]): vec3 {
    out[0] = a[0] * b[0];
    out[1] = a[1] * b[1];
    out[2] = a[2] * b[2];
    return out;
  }

  /**
   * Multiplie un vecteur 3D par un scalaire.
   *
   * @param a - Vecteur source.
   * @param scale - Facteur multiplicatif.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC3_SCALE(a: vec3, scale: number, out: vec3 = [0, 0, 0]): vec3 {
    out[0] = a[0] * scale;
    out[1] = a[1] * scale;
    out[2] = a[2] * scale;
    return out;
  }

  /**
   * Ajoute à un vecteur 3D un second vecteur multiplié par un scalaire.
   *
   * @param a - Vecteur initial.
   * @param b - Vecteur à multiplier puis ajouter.
   * @param scale - Facteur appliqué à `b`.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC3_ADD_SCALED(a: vec3, b: vec3, scale: number, out: vec3 = [0, 0, 0]): vec3 {
    out[0] = a[0] + b[0] * scale;
    out[1] = a[1] + b[1] * scale;
    out[2] = a[2] + b[2] * scale;
    return out;
  }

  /**
   * Calcule l'angle entre deux vecteurs 3D.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @returns Angle en radians.
   */
  static VEC3_ANGLE_BETWEEN(a: vec3, b: vec3): number {
    return Math.acos(UT.VEC3_DOT(a, b) / (UT.VEC3_LENGTH(a) * UT.VEC3_LENGTH(b)));
  }

  /**
   * Crée un vecteur 3D à partir de coordonnées sphériques.
   *
   * @param r - Rayon.
   * @param yaw - Angle de lacet en radians.
   * @param pitch - Angle de tangage en radians.
   * @param out - Vecteur de destination.
   * @returns Vecteur calculé.
   */
  static VEC3_FROM_ANGLES(r: number, yaw: number, pitch: number, out: vec3 = [0, 0, 0]): vec3 {
    const cosPitch = Math.cos(pitch);
    out[0] = r * cosPitch * Math.cos(yaw);
    out[2] = r * cosPitch * Math.sin(yaw);
    out[1] = r * Math.sin(pitch);
    return out;
  }

  /**
   * Sélectionne le minimum de chaque paire de composantes 3D.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @param out - Vecteur de destination.
   * @returns Vecteur des minima.
   */
  static VEC3_MIN(a: vec3, b: vec3, out: vec3 = [0, 0, 0]): vec3 {
    out[0] = Math.min(a[0], b[0]);
    out[1] = Math.min(a[1], b[1]);
    out[2] = Math.min(a[2], b[2]);
    return out;
  }

  /**
   * Sélectionne le maximum de chaque paire de composantes 3D.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @param out - Vecteur de destination.
   * @returns Vecteur des maxima.
   */
  static VEC3_MAX(a: vec3, b: vec3, out: vec3 = [0, 0, 0]): vec3 {
    out[0] = Math.max(a[0], b[0]);
    out[1] = Math.max(a[1], b[1]);
    out[2] = Math.max(a[2], b[2]);
    return out;
  }

  /**
   * Contraint chaque composante d'un vecteur 3D à des bornes distinctes.
   *
   * @param value - Vecteur à contraindre.
   * @param min - Bornes minimales.
   * @param max - Bornes maximales.
   * @param out - Vecteur de destination.
   * @returns Vecteur contraint.
   */
  static VEC3_CLAMP(value: vec3, min: vec3, max: vec3, out: vec3 = [0, 0, 0]): vec3 {
    out[0] = Math.max(min[0], Math.min(max[0], value[0]));
    out[1] = Math.max(min[1], Math.min(max[1], value[1]));
    out[2] = Math.max(min[2], Math.min(max[2], value[2]));
    return out;
  }

  /**
   * Arrondit chaque composante d'un vecteur 3D à l'entier inférieur.
   *
   * @param a - Vecteur source.
   * @param out - Vecteur de destination.
   * @returns Vecteur arrondi.
   */
  static VEC3_FLOOR(a: vec3, out: vec3 = [0, 0, 0]): vec3 {
    out[0] = Math.floor(a[0]);
    out[1] = Math.floor(a[1]);
    out[2] = Math.floor(a[2]);
    return out;
  }

  /**
   * Arrondit chaque composante d'un vecteur 3D à l'entier supérieur.
   *
   * @param a - Vecteur source.
   * @param out - Vecteur de destination.
   * @returns Vecteur arrondi.
   */
  static VEC3_CEIL(a: vec3, out: vec3 = [0, 0, 0]): vec3 {
    out[0] = Math.ceil(a[0]);
    out[1] = Math.ceil(a[1]);
    out[2] = Math.ceil(a[2]);
    return out;
  }

  /**
   * Compare strictement deux vecteurs 3D.
   *
   * @param a - Premier vecteur.
   * @param b - Second vecteur.
   * @returns `true` si leurs composantes sont égales.
   */
  static VEC3_ISEQUAL(a: vec3, b: vec3): boolean {
    return a[0] == b[0] && a[1] == b[1] && a[2] == b[2];
  }

  /**
   * Évalue une courbe de Bézier quadratique 3D.
   *
   * @param p0 - Point initial.
   * @param p1 - Point de contrôle.
   * @param p2 - Point final.
   * @param t - Paramètre d'interpolation.
   * @param out - Point de destination.
   * @returns Point évalué sur la courbe.
   */
  static VEC3_QUADRATIC_BEZIER(p0: vec3, p1: vec3, p2: vec3, t: number, out: vec3 = [0, 0, 0]): vec3 {
    const pax = p0[0] + ((p1[0] - p0[0]) * t);
    const pay = p0[1] + ((p1[1] - p0[1]) * t);
    const paz = p0[2] + ((p1[2] - p0[2]) * t);

    const pbx = p1[0] + ((p2[0] - p1[0]) * t);
    const pby = p1[1] + ((p2[1] - p1[1]) * t);
    const pbz = p1[2] + ((p2[2] - p1[2]) * t);

    out[0] = pax + ((pbx - pax) * t);
    out[1] = pay + ((pby - pay) * t);
    out[2] = paz + ((pbz - paz) * t);
    return out;
  }

  /**
   * Calcule l'axe X issu d'une rotation d'Euler.
   *
   * @param rot - Angles d'Euler `[x, y, z]` en radians.
   * @returns Axe X transformé.
   */
  static VEC3_XAXIS(rot: vec3): vec3 {
    return [
      Math.cos(rot[1]) * Math.cos(rot[2]),
      Math.cos(rot[0]) * Math.sin(rot[2]) - Math.sin(rot[0]) * Math.sin(rot[1]) * Math.cos(rot[2]),
      Math.sin(rot[0]) * Math.sin(rot[2]) + Math.cos(rot[0]) * Math.sin(rot[1]) * Math.cos(rot[2])
    ];
  }

  /**
   * Calcule l'axe Y issu d'une rotation d'Euler.
   *
   * @param rot - Angles d'Euler `[x, y, z]` en radians.
   * @returns Axe Y transformé.
   */
  static VEC3_YAXIS(rot: vec3): vec3 {
    return [
      -Math.cos(rot[1]) * Math.sin(rot[2]),
      Math.cos(rot[0]) * Math.cos(rot[2]) + Math.sin(rot[0]) * Math.sin(rot[1]) * Math.sin(rot[2]),
      Math.sin(rot[0]) * Math.cos(rot[2]) - Math.cos(rot[0]) * Math.sin(rot[1]) * Math.sin(rot[2])
    ];
  }

  /**
   * Calcule l'axe Z issu d'une rotation d'Euler.
   *
   * @param rot - Angles d'Euler `[x, y, z]` en radians.
   * @returns Axe Z transformé.
   */
  static VEC3_ZAXIS(rot: vec3): vec3 {
    return [
      -Math.sin(rot[1]),
      -Math.sin(rot[0]) * Math.cos(rot[1]),
      Math.cos(rot[0]) * Math.cos(rot[1])
    ];
  }

  /**
   * Calcule une direction avant selon l'axe Z négatif.
   *
   * @param pitch - Tangage en radians, positif vers le bas.
   * @param yaw - Lacet en radians, positif vers la droite.
   * @returns Vecteur directeur.
   */
  static VEC3_FORWARD_NEGATIVE_Z(pitch: number, yaw: number): vec3 {
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);

    return [
      sy * cp,
      -sp,
      -cy * cp
    ];
  }

  /**
   * Crée un vecteur 4D en précision simple.
   *
   * @param x - Première composante.
   * @param y - Deuxième composante.
   * @param z - Troisième composante.
   * @param w - Quatrième composante.
   * @returns Nouveau vecteur `[x, y, z, w]`.
   */
  static VEC4_CREATE(x: number = 0, y: number = 0, z: number = 0, w: number = 0): Float32Array {
    const out = new Float32Array(4);
    out[0] = x;
    out[1] = y;
    out[2] = z;
    out[3] = w;
    return out;
  }

  /**
   * Analyse trois composantes numériques et fixe la composante homogène à `1`.
   *
   * @param str - Chaîne à analyser.
   * @param separator - Séparateur entre les composantes.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC4_PARSE(str: string, separator: string = ' ', out: vec4 = [0, 0, 0, 0]): vec4 {
    const a = str.split(separator);
    out[0] = parseFloat(a[0]);
    out[1] = parseFloat(a[1]);
    out[2] = parseFloat(a[2]);
    out[3] = 1.0;
    return out;
  }

  /**
   * Copie un vecteur 4D.
   *
   * @param src - Vecteur source.
   * @param out - Vecteur de destination.
   * @returns Vecteur de destination.
   */
  static VEC4_COPY(src: vec4, out: vec4 = [0, 0, 0, 0]): vec4 {
    out[0] = src[0];
    out[1] = src[1];
    out[2] = src[2];
    out[3] = src[3];
    return out;
  }

  /**
   * Indique si les composantes d'un vecteur 4D sont presque nulles.
   *
   * @param a - Vecteur à vérifier.
   * @returns `true` si chaque composante est inférieure ou égale à `EPSILON` en valeur absolue.
   */
  static VEC4_ISZERO(a: vec4): boolean {
    return Math.abs(a[0]) <= UT.EPSILON && Math.abs(a[1]) <= UT.EPSILON && Math.abs(a[2]) <= UT.EPSILON && Math.abs(a[3]) <= UT.EPSILON;
  }

  /**
   * Crée une matrice identité 3 × 3 en précision simple.
   *
   * @returns Nouvelle matrice identité.
   */
  static MAT3_CREATE(): Float32Array {
    const out = new Float32Array(9);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 1;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 1;
    return out;
  }

  /**
   * Copie une matrice 3 × 3.
   *
   * @param src - Matrice source.
   * @param out - Matrice de destination.
   * @returns Matrice de destination.
   */
  static MAT3_COPY(src: mat3, out: mat3): mat3 {
    out[0] = src[0];
    out[1] = src[1];
    out[2] = src[2];
    out[3] = src[3];
    out[4] = src[4];
    out[5] = src[5];
    out[6] = src[6];
    out[7] = src[7];
    out[8] = src[8];
    return out;
  }

  /**
   * Multiplie une matrice 3 × 3 par un vecteur 3D.
   *
   * @param a - Matrice source.
   * @param v - Vecteur source.
   * @param out - Vecteur de destination.
   * @returns Vecteur transformé.
   */
  static MAT3_MULTIPLY_BY_VEC3(a: mat3, v: vec3, out: vec3 = [0, 0, 0]): vec3 {
    const a00 = a[0];
    const a01 = a[1];
    const a02 = a[2];
    const a10 = a[3];
    const a11 = a[4];
    const a12 = a[5];
    const a20 = a[6];
    const a21 = a[7];
    const a22 = a[8];
    const v00 = v[0];
    const v01 = v[1];
    const v02 = v[2];

    out[0] = v00 * a00 + v01 * a10 + v02 * a20;
    out[1] = v00 * a01 + v01 * a11 + v02 * a21;
    out[2] = v00 * a02 + v01 * a12 + v02 * a22;
    return out;
  }

  /**
   * Multiplie deux matrices 3 × 3.
   *
   * @param a - Première matrice.
   * @param b - Seconde matrice.
   * @param out - Matrice de destination.
   * @returns Produit matriciel.
   */
  static MAT3_MULTIPLY(a: mat3, b: mat3, out: mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0]): mat3 {
    const a00 = a[0];
    const a01 = a[1];
    const a02 = a[2];
    const a10 = a[3];
    const a11 = a[4];
    const a12 = a[5];
    const a20 = a[6];
    const a21 = a[7];
    const a22 = a[8];
    const b00 = b[0];
    const b01 = b[1];
    const b02 = b[2];
    const b10 = b[3];
    const b11 = b[4];
    const b12 = b[5];
    const b20 = b[6];
    const b21 = b[7];
    const b22 = b[8];

    const c00 = b00 * a00 + b01 * a10 + b02 * a20;
    const c01 = b00 * a01 + b01 * a11 + b02 * a21;
    const c02 = b00 * a02 + b01 * a12 + b02 * a22;

    const c10 = b10 * a00 + b11 * a10 + b12 * a20;
    const c11 = b10 * a01 + b11 * a11 + b12 * a21;
    const c12 = b10 * a02 + b11 * a12 + b12 * a22;

    const c20 = b20 * a00 + b21 * a10 + b22 * a20;
    const c21 = b20 * a01 + b21 * a11 + b22 * a21;
    const c22 = b20 * a02 + b21 * a12 + b22 * a22;

    out[0] = c00;
    out[1] = c01;
    out[2] = c02;
    out[3] = c10;
    out[4] = c11;
    out[5] = c12;
    out[6] = c20;
    out[7] = c21;
    out[8] = c22;
    return out;
  }

  /**
   * Inverse une matrice 3 × 3.
   *
   * @param a - Matrice source.
   * @param out - Matrice de destination.
   * @returns Matrice inverse.
   * @throws Une erreur si le déterminant est nul.
   */
  static MAT3_INVERT(a: mat3, out: mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0]): mat3 {
    const a00 = a[0];
    const a01 = a[1];
    const a02 = a[2];
    const a10 = a[3];
    const a11 = a[4];
    const a12 = a[5];
    const a20 = a[6];
    const a21 = a[7];
    const a22 = a[8];
    const b01 = a22 * a11 - a12 * a21;
    const b11 = -a22 * a10 + a12 * a20;
    const b21 = a21 * a10 - a11 * a20;

    let det = a00 * b01 + a01 * b11 + a02 * b21;
    if (!det) {
      throw new Error('UT::MAT4_INVERT(): det is invalid !');
    }

    det = 1.0 / det;

    const c00 = b01 * det;
    const c01 = (-a22 * a01 + a02 * a21) * det;
    const c02 = (a12 * a01 - a02 * a11) * det;

    const c10 = b11 * det;
    const c11 = (a22 * a00 - a02 * a20) * det;
    const c12 = (-a12 * a00 + a02 * a10) * det;

    const c20 = b21 * det;
    const c21 = (-a21 * a00 + a01 * a20) * det;
    const c22 = (a11 * a00 - a01 * a10) * det;

    out[0] = c00;
    out[1] = c01;
    out[2] = c02;
    out[3] = c10;
    out[4] = c11;
    out[5] = c12;
    out[6] = c20;
    out[7] = c21;
    out[8] = c22;
    return out;
  }

  /**
   * Réinitialise une matrice 3 × 3 à l'identité.
   *
   * @param out - Matrice de destination.
   * @returns Matrice identité.
   */
  static MAT3_IDENTITY(out: mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0]): mat3 {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 1;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 1;
    return out;
  }

  /**
   * Crée une matrice de mise à l'échelle 2D.
   *
   * @param x - Facteur horizontal.
   * @param y - Facteur vertical.
   * @param out - Matrice de destination.
   * @returns Matrice de mise à l'échelle.
   */
  static MAT3_SCALE(x: number, y: number, out: mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0]): mat3 {
    out[0] = x;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = y;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 1;
    return out;
  }

  /**
   * Crée une matrice de rotation 2D.
   *
   * @param a - Angle en radians.
   * @param out - Matrice de destination.
   * @returns Matrice de rotation.
   */
  static MAT3_ROTATE(a: number, out: mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0]): mat3 {
    const c = Math.cos(a);
    const s = Math.sin(a);
    out[0] = c;
    out[1] = -s;
    out[2] = 0;
    out[3] = s;
    out[4] = c;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 1;
    return out;
  }

  /**
   * Crée une matrice de translation 2D.
   *
   * @param x - Translation horizontale.
   * @param y - Translation verticale.
   * @param out - Matrice de destination.
   * @returns Matrice de translation.
   */
  static MAT3_TRANSLATE(x: number, y: number, out: mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0]): mat3 {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 1;
    out[5] = 0;
    out[6] = x;
    out[7] = y;
    out[8] = 1;
    return out;
  }

  /**
   * Compose une transformation 2D avec position, rotation, échelle et décalage d'origine.
   *
   * @param position - Translation de l'objet.
   * @param offset - Décalage de l'origine.
   * @param rotation - Angle de rotation en radians.
   * @param scale - Facteurs d'échelle.
   * @param out - Matrice de destination.
   * @returns Matrice de transformation.
   */
  static MAT3_TRANSFORM(position: vec2, offset: vec2, rotation: number, scale: vec2, out: mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0]): mat3 {
    UT.MAT3_TRANSLATE(position[0], position[1], out);
    UT.MAT3_MULTIPLY(out, UT.MAT3_ROTATE(rotation), out);
    UT.MAT3_MULTIPLY(out, UT.MAT3_SCALE(scale[0], scale[1]), out);
    UT.MAT3_MULTIPLY(out, UT.MAT3_TRANSLATE(-offset[0], -offset[1]), out);
    return out;
  }

  /**
   * Crée une matrice de projection 2D selon des dimensions données.
   *
   * @param w - Largeur de projection.
   * @param h - Hauteur de projection.
   * @param out - Matrice de destination.
   * @returns Matrice de projection.
   */
  static MAT3_PROJECTION(w: number, h: number, out: mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0]): mat3 {
    out[0] = 2 / w;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 2 / h;
    out[5] = 0;
    out[6] = -1;
    out[7] = -1;
    out[8] = 1;
    return out;
  }

  /**
   * Crée une matrice identité 4 × 4 en précision simple.
   *
   * @returns Nouvelle matrice identité.
   */
  static MAT4_CREATE(): Float32Array {
    const out = new Float32Array(16);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
  }

  /**
   * Copie une matrice 4 × 4.
   *
   * @param src - Matrice source.
   * @param out - Matrice de destination.
   * @returns Matrice de destination.
   */
  static MAT4_COPY(src: mat4, out: mat4): mat4 {
    out[0] = src[0];
    out[1] = src[1];
    out[2] = src[2];
    out[3] = src[3];
    out[4] = src[4];
    out[5] = src[5];
    out[6] = src[6];
    out[7] = src[7];
    out[8] = src[8];
    out[9] = src[9];
    out[10] = src[10];
    out[11] = src[11];
    out[12] = src[12];
    out[13] = src[13];
    out[14] = src[14];
    out[15] = src[15];
    return out;
  }

  /**
   * Multiplie une matrice 4 × 4 par un vecteur homogène 4D.
   *
   * @param a - Matrice source.
   * @param v - Vecteur source.
   * @param out - Vecteur de destination.
   * @returns Vecteur transformé.
   */
  static MAT4_MULTIPLY_BY_VEC4(a: mat4, v: vec4, out: vec4 = [0, 0, 0, 0]): vec4 {
    const a00 = a[0];
    const a01 = a[1];
    const a02 = a[2];
    const a03 = a[3];
    const a10 = a[4];
    const a11 = a[5];
    const a12 = a[6];
    const a13 = a[7];
    const a20 = a[8];
    const a21 = a[9];
    const a22 = a[10];
    const a23 = a[11];
    const a30 = a[12];
    const a31 = a[13];
    const a32 = a[14];
    const a33 = a[15];
    const v00 = v[0];
    const v01 = v[1];
    const v02 = v[2];
    const v03 = v[3];

    out[0] = v00 * a00 + v01 * a10 + v02 * a20 + v03 * a30;
    out[1] = v00 * a01 + v01 * a11 + v02 * a21 + v03 * a31;
    out[2] = v00 * a02 + v01 * a12 + v02 * a22 + v03 * a32;
    out[3] = v00 * a03 + v01 * a13 + v02 * a23 + v03 * a33;
    return out;
  }

  /**
   * Transforme un point 3D par une matrice 4 × 4 avec translation.
   *
   * @param a - Matrice source.
   * @param v - Point source.
   * @param out - Vecteur de destination.
   * @returns Point transformé.
   */
  static MAT4_MULTIPLY_BY_VEC3(a: mat4, v: vec3, out: vec3 = [0, 0, 0]): vec3 {
    const x = v[0], y = v[1], z = v[2];

    out[0] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[1] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[2] = a[2] * x + a[6] * y + a[10] * z + a[14];

    return out;
  }

  /**
   * Multiplie deux matrices 4 × 4 stockées en ordre colonne.
   *
   * @param a - Première matrice.
   * @param b - Seconde matrice.
   * @param out - Matrice de destination.
   * @returns Produit matriciel.
   */
  static MAT4_MULTIPLY(a: mat4, b: mat4, out: mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]): mat4 {
    const a00 = a[0];
    const a01 = a[1];
    const a02 = a[2];
    const a03 = a[3];
    const a10 = a[4];
    const a11 = a[5];
    const a12 = a[6];
    const a13 = a[7];
    const a20 = a[8];
    const a21 = a[9];
    const a22 = a[10];
    const a23 = a[11];
    const a30 = a[12];
    const a31 = a[13];
    const a32 = a[14];
    const a33 = a[15];
    const b00 = b[0];
    const b01 = b[1];
    const b02 = b[2];
    const b03 = b[3];
    const b10 = b[4];
    const b11 = b[5];
    const b12 = b[6];
    const b13 = b[7];
    const b20 = b[8];
    const b21 = b[9];
    const b22 = b[10];
    const b23 = b[11];
    const b30 = b[12];
    const b31 = b[13];
    const b32 = b[14];
    const b33 = b[15];

    out[0] = b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30;
    out[1] = b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31;
    out[2] = b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32;
    out[3] = b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33;
    out[4] = b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30;
    out[5] = b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31;
    out[6] = b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32;
    out[7] = b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33;
    out[8] = b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30;
    out[9] = b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31;
    out[10] = b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32;
    out[11] = b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33;
    out[12] = b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30;
    out[13] = b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31;
    out[14] = b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32;
    out[15] = b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33;
    return out;
  }

  /**
   * Multiplie successivement une liste de matrices 4 × 4.
   *
   * @param matrices - Matrices à multiplier dans l'ordre fourni.
   * @returns Produit cumulé, ou `undefined` à l'exécution si la liste est vide.
   */
  static MAT4_COMPUTE(...matrices: Array<mat4>): mat4 {
    for (let i = 0; i < matrices.length - 1; i++) {
      matrices[i + 1] = UT.MAT4_MULTIPLY(matrices[i], matrices[i + 1]);
    }

    return matrices[matrices.length - 1];
  }

  /**
   * Inverse une matrice 4 × 4.
   *
   * @param a - Matrice source.
   * @param out - Matrice de destination.
   * @returns Matrice inverse.
   * @throws Une erreur si le déterminant est nul.
   */
  static MAT4_INVERT(a: mat4, out: mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]): mat4 {
    const a00 = a[0];
    const a01 = a[1];
    const a02 = a[2];
    const a03 = a[3];
    const a10 = a[4];
    const a11 = a[5];
    const a12 = a[6];
    const a13 = a[7];
    const a20 = a[8];
    const a21 = a[9];
    const a22 = a[10];
    const a23 = a[11];
    const a30 = a[12];
    const a31 = a[13];
    const a32 = a[14];
    const a33 = a[15];
    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) {
      throw new Error('UT::MAT4_INVERT(): det is invalid !');
    }

    det = 1.0 / det;

    const c00 = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    const c01 = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    const c02 = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    const c03 = (a22 * b04 - a21 * b05 - a23 * b03) * det;

    const c10 = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    const c11 = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    const c12 = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    const c13 = (a20 * b05 - a22 * b02 + a23 * b01) * det;

    const c20 = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    const c21 = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    const c22 = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    const c23 = (a21 * b02 - a20 * b04 - a23 * b00) * det;

    const c30 = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    const c31 = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    const c32 = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    const c33 = (a20 * b03 - a21 * b01 + a22 * b00) * det;

    out[0] = c00;
    out[1] = c01;
    out[2] = c02;
    out[3] = c03;
    out[4] = c10;
    out[5] = c11;
    out[6] = c12;
    out[7] = c13;
    out[8] = c20;
    out[9] = c21;
    out[10] = c22;
    out[11] = c23;
    out[12] = c30;
    out[13] = c31;
    out[14] = c32;
    out[15] = c33;
    return out;
  }

  /**
   * Réinitialise une matrice 4 × 4 à l'identité.
   *
   * @param out - Matrice de destination.
   * @returns Matrice identité.
   */
  static MAT4_IDENTITY(out: mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]): mat4 {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
  }

  /**
   * Crée une matrice de mise à l'échelle 3D.
   *
   * @param x - Facteur sur l'axe X.
   * @param y - Facteur sur l'axe Y.
   * @param z - Facteur sur l'axe Z.
   * @param out - Matrice de destination.
   * @returns Matrice de mise à l'échelle.
   */
  static MAT4_SCALE(x: number, y: number, z: number, out: mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]): mat4 {
    out[0] = x;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = y;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = z;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
  }

  /**
   * Crée une matrice de rotation autour de l'axe X.
   *
   * @param a - Angle en radians.
   * @param out - Matrice de destination.
   * @returns Matrice de rotation.
   */
  static MAT4_ROTATE_X(a: number, out: mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]): mat4 {
    const c = Math.cos(a);
    const s = Math.sin(a);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = c;
    out[6] = -s;
    out[7] = 0;
    out[8] = 0;
    out[9] = s;
    out[10] = c;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
  }

  /**
   * Crée une matrice de rotation autour de l'axe Y.
   *
   * @param a - Angle en radians.
   * @param out - Matrice de destination.
   * @returns Matrice de rotation.
   */
  static MAT4_ROTATE_Y(a: number, out: mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]): mat4 {
    const c = Math.cos(a);
    const s = Math.sin(a);
    out[0] = c;
    out[1] = 0;
    out[2] = s;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = -s;
    out[9] = 0;
    out[10] = c;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
  }

  /**
   * Crée une matrice de rotation autour de l'axe Z.
   *
   * @param a - Angle en radians.
   * @param out - Matrice de destination.
   * @returns Matrice de rotation.
   */
  static MAT4_ROTATE_Z(a: number, out: mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]): mat4 {
    const c = Math.cos(a);
    const s = Math.sin(a);
    out[0] = c;
    out[1] = s;
    out[2] = 0;
    out[3] = 0;
    out[4] = -s;
    out[5] = c;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
  }

  /**
   * Crée une matrice de translation 3D.
   *
   * @param x - Translation sur l'axe X.
   * @param y - Translation sur l'axe Y.
   * @param z - Translation sur l'axe Z.
   * @param out - Matrice de destination.
   * @returns Matrice de translation.
   */
  static MAT4_TRANSLATE(x: number, y: number, z: number, out: mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]): mat4 {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = x;
    out[13] = y;
    out[14] = z;
    out[15] = 1;
    return out;
  }

  /**
   * Compose une transformation 3D selon l'ordre translation, rotations Y-X-Z, puis échelle.
   *
   * @param position - Translation de l'objet.
   * @param rotation - Angles de rotation `[x, y, z]` en radians.
   * @param scale - Facteurs d'échelle.
   * @param out - Matrice de destination.
   * @returns Matrice de transformation.
   */
  static MAT4_TRANSFORM(position: vec3, rotation: vec3, scale: vec3, out: mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]): mat4 {
    UT.MAT4_TRANSLATE(position[0], position[1], position[2], out);
    UT.MAT4_MULTIPLY(out, UT.MAT4_ROTATE_Y(rotation[1]), out);
    UT.MAT4_MULTIPLY(out, UT.MAT4_ROTATE_X(rotation[0]), out); // y -> x -> z
    UT.MAT4_MULTIPLY(out, UT.MAT4_ROTATE_Z(rotation[2]), out);
    UT.MAT4_MULTIPLY(out, UT.MAT4_SCALE(scale[0], scale[1], scale[2]), out);
    return out;
  }

  /**
   * Crée une projection orthographique centrée à partir de ses dimensions.
   *
   * @param width - Largeur du volume.
   * @param height - Hauteur du volume.
   * @param depth - Profondeur du volume.
   * @param out - Matrice de destination.
   * @returns Matrice de projection.
   */
  static MAT4_ORTHOGRAPHIC(width: number, height: number, depth: number, out: mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]): mat4 { // @todo: add width & height
    out[0] = 2 / width;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 2 / height;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = -2 / depth;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
  }

  /**
   * Crée une matrice de projection orthographique à partir de six plans.
   *
   * @param left - Plan gauche.
   * @param right - Plan droit.
   * @param bottom - Plan inférieur.
   * @param top - Plan supérieur.
   * @param near - Plan proche.
   * @param far - Plan lointain.
   * @param out - Matrice de destination.
   * @returns Matrice de projection.
   */
  static MAT4_ORTHO(left: number, right: number, bottom: number, top: number, near: number, far: number, out: mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]): mat4 {
    out[0] = 2 / (right - left);
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 2 / (top - bottom);
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 2 / (near - far);
    out[11] = 0;
    out[12] = (left + right) / (left - right);
    out[13] = (bottom + top) / (bottom - top);
    out[14] = (near + far) / (near - far);
    out[15] = 1;
    return out;
  }

  /**
   * Crée une matrice de projection en perspective.
   *
   * @param fov - Angle vertical du champ de vision en radians.
   * @param ar - Rapport largeur sur hauteur.
   * @param near - Distance du plan proche.
   * @param far - Distance du plan lointain.
   * @param out - Matrice de destination.
   * @returns Matrice de projection.
   */
  static MAT4_PERSPECTIVE(fov: number, ar: number, near: number, far: number, out: mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]): mat4 {
    out[0] = (1 / (Math.tan(fov / 2) * ar));
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1 / Math.tan(fov / 2);
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (near + far) / (near - far);
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (2 * far * near) / (near - far);
    out[15] = 0;
    return out;
  }

  /**
   * Crée une matrice d'orientation vers une cible.
   *
   * @param position - Position de l'observateur.
   * @param target - Point visé.
   * @param vertical - Direction verticale de référence.
   * @param out - Matrice de destination.
   * @returns Matrice d'orientation et de position.
   */
  static MAT4_LOOKAT(position: vec3, target: vec3, vertical: vec3 = UT.VEC3_UP, out: mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]): mat4 {
    const axeZ = UT.VEC3_NORMALIZE(UT.VEC3_SUBSTRACT(position, target));
    vertical = UT.VEC3_NORMALIZE(vertical);

    if (Math.abs(UT.VEC3_DOT(axeZ, vertical)) > 1 - UT.EPSILON) {
      const arbitraryVec: vec3 = Math.abs(axeZ[1]) < 1 - UT.EPSILON ? [0, 1, 0] : [1, 0, 0];
      vertical = UT.VEC3_NORMALIZE(UT.VEC3_CROSS(arbitraryVec, axeZ));
    }

    const axeX = UT.VEC3_NORMALIZE(UT.VEC3_CROSS(vertical, axeZ));
    const axeY = UT.VEC3_NORMALIZE(UT.VEC3_CROSS(axeZ, axeX));
    out[0] = axeX[0];
    out[1] = axeX[1];
    out[2] = axeX[2];
    out[3] = 0;
    out[4] = axeY[0];
    out[5] = axeY[1];
    out[6] = axeY[2];
    out[7] = 0;
    out[8] = axeZ[0];
    out[9] = axeZ[1];
    out[10] = axeZ[2];
    out[11] = 0;
    out[12] = position[0];
    out[13] = position[1];
    out[14] = position[2];
    out[15] = 1;
    return out;
  }

  /**
   * Transpose une matrice 4 × 4.
   *
   * @param a - Matrice source.
   * @param out - Matrice de destination.
   * @returns Matrice transposée.
   */
  static MAT4_TRANSPOSE(a: mat4, out: mat4 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]): mat4 {
    const a00 = a[0];
    const a01 = a[1];
    const a02 = a[2];
    const a03 = a[3];
    const a10 = a[4];
    const a11 = a[5];
    const a12 = a[6];
    const a13 = a[7];
    const a20 = a[8];
    const a21 = a[9];
    const a22 = a[10];
    const a23 = a[11];
    const a30 = a[12];
    const a31 = a[13];
    const a32 = a[14];
    const a33 = a[15];
    out[0] = a00;
    out[1] = a10;
    out[2] = a20;
    out[3] = a30;
    out[4] = a01;
    out[5] = a11;
    out[6] = a21;
    out[7] = a31;
    out[8] = a02;
    out[9] = a12;
    out[10] = a22;
    out[11] = a32;
    out[12] = a03;
    out[13] = a13;
    out[14] = a23;
    out[15] = a33;
    return out;
  }

  /**
   * Interpole linéairement deux valeurs sur une durée.
   *
   * @param t - Temps écoulé.
   * @param b - Valeur initiale.
   * @param e - Valeur finale.
   * @param d - Durée totale.
   * @returns Valeur interpolée.
   */
  static LINEAR(t: number, b: number, e: number, d: number = 1): number {
    return b + (e - b) * t / d;
  }

  /**
   * Applique une accélération quadratique à une interpolation.
   *
   * @param t - Temps écoulé.
   * @param b - Valeur initiale.
   * @param e - Valeur finale.
   * @param d - Durée totale.
   * @returns Valeur interpolée.
   */
  static EASE_IN_QUAD(t: number, b: number, e: number, d: number = 1): number {
    return (e - b) * (t /= d) * t + b;
  }

  /**
   * Applique une décélération quadratique à une interpolation.
   *
   * @param t - Temps écoulé.
   * @param b - Valeur initiale.
   * @param e - Valeur finale.
   * @param d - Durée totale.
   * @returns Valeur interpolée.
   */
  static EASE_OUT_QUAD(t: number, b: number, e: number, d: number = 1): number {
    const c = e - b;
    return -c * (t /= d) * (t - 2) + b;
  }

  /**
   * Applique une accélération puis une décélération quadratiques à une interpolation.
   *
   * @param t - Temps écoulé.
   * @param b - Valeur initiale.
   * @param e - Valeur finale.
   * @param d - Durée totale.
   * @returns Valeur interpolée.
   */
  static EASE_IN_OUT_QUAD(t: number, b: number, e: number, d: number = 1): number {
    const c = e - b;
    if ((t /= d / 2) < 1) return c / 2 * t * t + b;
    return -c / 2 * ((--t) * (t - 2) - 1) + b;
  }

  /**
   * Convertit une valeur au moyen d'une courbe définie par segments.
   *
   * @param value - Valeur d'entrée.
   * @param curve - Segments de correspondance.
   * @param interpolateFn - Fonction d'interpolation appliquée au segment trouvé.
   * @returns Valeur convertie, ou `Infinity` si aucun segment ne contient l'entrée.
   */
  static MAP_VALUE_FROM_CURVE(value: number, curve: Array<CurveMapItem>, interpolateFn = UT.LINEAR) {
    for (let c of curve) {
      if (value >= c.valueMin && value <= c.valueMax) {
        return interpolateFn(value - c.valueMin, c.mapBegin, c.mapEnd, c.valueMax - c.valueMin);
      }
    }

    return Infinity;
  }
}