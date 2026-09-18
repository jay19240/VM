import { UT } from './utils';

/**
 * Interpole une suite de valeurs numériques au fil du temps.
 *
 * @typeParam T - Type interpolé, nombre ou tableau de nombres.
 */
export class Tween<T> {
  times: Array<number>;
  values: Array<T>;
  fns: Array<Function>;
  defaultFn: Function;
  // --
  timeElapsed: number;
  looped: boolean;
  finished: boolean;
  currentValue: T;

  /**
   * Crée une interpolation définie par des instants, des valeurs et des fonctions d'assouplissement.
   *
   * @param times - Instants associés aux valeurs, en secondes.
   * @param values - Valeurs clés à interpoler.
   * @param defaultFn - Fonction d'interpolation utilisée par défaut.
   * @param fns - Fonctions d'interpolation propres aux différents segments.
   */
  constructor(times: Array<number> = [], values: Array<T> = [], defaultFn: Function = UT.LINEAR, fns: Array<Function> = []) {
    this.times = times;
    this.values = values;
    this.fns = fns;
    this.defaultFn = defaultFn;
    // --
    this.timeElapsed = 0;
    this.looped = false;
    this.finished = false;
    this.currentValue = this.values[0];
  }

  /**
   * Avance l'interpolation.
   *
   * @param ts - Temps écoulé depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number): void {
    if (this.times.length == 0) {
      return;
    }

    if (this.timeElapsed > this.times[this.times.length - 1]) {
      this.finished = this.looped ? false : true;
      this.timeElapsed = this.looped ? 0 : this.timeElapsed;
    }

    this.currentValue = this.interpolate(this.timeElapsed);
    this.timeElapsed += ts / 1000;
  }

  /**
   * Calcule la valeur interpolée à un instant donné.
   *
   * @param t - Temps écoulé, en secondes.
   * @returns Valeur interpolée ou valeur clé située aux bornes.
   */
  interpolate(t: number): T {
    let i = 0;
    let n = this.times.length;

    while (i < n && t > this.times[i]) i++;
    if (i == 0) return this.values[0];
    if (i == n) return this.values[n - 1];

    const beginValue = this.values[i - 1];
    const endValue = this.values[i];
    const currentT = t - this.times[i - 1];
    const currentDuration = this.times[i] - this.times[i - 1];
    const currentFunction = this.fns[i] ? this.fns[i] : this.defaultFn;

    if (Array.isArray(beginValue) && Array.isArray(endValue)) {
      const value = [];

      for (let j = 0; j < beginValue.length; j++) {
        value.push(currentFunction(currentT, beginValue[j], endValue[j], currentDuration));
      }

      return value as T;
    }

    return currentFunction(currentT, beginValue, endValue, currentDuration);
  }

  /**
   * Active ou désactive la répétition de l'interpolation.
   *
   * @param looped - `true` pour recommencer après la dernière valeur.
   */
  setLooped(looped: boolean): void {
    this.looped = looped;
  }

  /**
   * Remplace les instants des valeurs clés.
   *
   * @param times - Instants en secondes.
   */
  setTimes(times: Array<number>): void {
    this.times = times;
  }

  /**
   * Remplace les valeurs clés.
   *
   * @param values - Valeurs associées aux instants.
   */
  setValues(values: Array<T>): void {
    this.values = values;
  }

  /**
   * Remplace les fonctions d'interpolation des segments.
   *
   * @param fns - Fonctions d'interpolation.
   */
  setFunctions(fns: Array<Function>): void {
    this.fns = fns;
  }

  /**
   * Retourne la valeur interpolée courante.
   *
   * @returns Valeur calculée lors de la dernière mise à jour.
   */
  getCurrentValue(): T {
    return this.currentValue;
  }

  /**
   * Retourne une composante de la valeur interpolée courante.
   *
   * @param index - Indice de la composante.
   * @returns Composante numérique demandée.
   * @throws Une erreur si la valeur courante n'est pas un tableau.
   */
  get(index: number = 0): number {
    if (!Array.isArray(this.currentValue)) {
      throw new Error('Tween::get(): You cannot call get on a non-array values based');
    }

    return this.currentValue[index];
  }

  /**
   * Indique si l'interpolation ne possède aucun instant ou aucune valeur.
   *
   * @returns `true` si au moins une des deux listes est vide.
   */
  isEmpty(): boolean {
    return this.times.length == 0 || this.values.length == 0;
  }

  /**
   * Indique si une interpolation non répétée est terminée.
   *
   * @returns `true` lorsque le dernier instant a été dépassé.
   */
  isFinished(): boolean {
    return this.finished;
  }
}