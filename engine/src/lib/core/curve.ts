import { CurveInterpolator } from 'curve-interpolator';

/**
 * Options de construction d'une spline de Catmull-Rom centripète.
 */
export interface CurveOptions {
  tension?: number,
  alpha?: number,
  closed?: boolean,
  arcDivisions?: number,
  numericalApproximationOrder?: number,
  numericalInverseSamples?: number,
  lmargin?: number
};

/**
 * Fabrique des interpolateurs de spline de Catmull-Rom centripète.
 */
export class Curve {
  /**
   * Charge une courbe JSON et crée son interpolateur.
   *
   * @param path - Chemin du fichier de courbe.
   * @returns Interpolateur configuré avec les points et options du fichier.
   * @throws Une erreur si le fichier ne porte pas la signature `JLM`.
   */
  static async createFromFile(path: string): Promise<CurveInterpolator> {
    const response = await fetch(path);
    const json = await response.json();

    if (!json.hasOwnProperty('Ident') || json['Ident'] != 'JLM') {
      throw new Error('Curve::createFromFile(): File not valid !');
    }

    const points = [];
    for (const point of json['Points']) {
      points.push(point);
    }

    return Curve.createInterpolator(points, {
      tension: json['Tension'],
      alpha: json['Alpha'],
      closed: json['Closed'],
      arcDivisions: json['ArcDivisions'],
      numericalApproximationOrder: json['NumericalApproximationOrder'],
      numericalInverseSamples: json['NumericalInverseSamples'],
      lmargin: json['LMargin']
    });
  }

  /**
   * Charge des points 3D depuis un fichier binaire BLM et crée leur interpolateur.
   *
   * @param path - Chemin du fichier binaire de points.
   * @param optionsFile - Chemin facultatif du fichier JSON d'options.
   * @returns Interpolateur construit à partir des triplets de nombres du fichier.
   */
  static async createFromBinaryFile(path: string, optionsFile: string = ''): Promise<CurveInterpolator> {
    const response = await fetch(path);
    const buffer = await response.arrayBuffer();
    const data = new Float32Array(buffer);
    let json: any = {};

    if (optionsFile) {
      const response = await fetch(optionsFile);
      json = await response.json();
    }

    const points: Array<any> = [];
    for (var i = 0; i < data.length; i += 3) {
      points.push([data[i + 0], data[i + 1], data[i + 2]])
    }

    return Curve.createInterpolator(points, {
      tension: json['Tension'],
      alpha: json['Alpha'],
      closed: json['Closed'],
      arcDivisions: json['ArcDivisions'],
      numericalApproximationOrder: json['NumericalApproximationOrder'],
      numericalInverseSamples: json['NumericalInverseSamples'],
      lmargin: json['LMargin']
    });
  }

  /**
   * Crée un interpolateur de courbe.
   *
   * @param points - Points de contrôle.
   * @param options - Options de l'interpolateur.
   * @returns Interpolateur configuré.
   */
  static createInterpolator(points: Array<vec_any>, options: CurveOptions): CurveInterpolator {
    return new CurveInterpolator(points, {
      tension: options.tension ?? 0,
      alpha: options.alpha ?? 0.5,
      closed: options.closed ?? false,
      arcDivisions: options.arcDivisions,
      numericalApproximationOrder: options.numericalApproximationOrder,
      numericalInverseSamples: options.numericalInverseSamples,
      lmargin: options.lmargin
    });
  }
}

export { CurveInterpolator };