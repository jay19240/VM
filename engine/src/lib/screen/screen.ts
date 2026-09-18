/**
 * Classe de base d'un écran de jeu, par exemple un écran d'accueil, de menu, de partie ou de pause.
 * Un écran constitue un composant de premier niveau et définit son cycle de mise à jour, de rendu,
 * d'entrée et de sortie.
 */
export class Screen {
  blocking: boolean;

  /** Crée un écran non bloqué. */
  constructor() {
    this.blocking = false;
  }

  /**
   * Définit si l'exécution de cet écran doit être bloquée.
   *
   * @param {boolean} blocking - `true` pour empêcher sa mise à jour et son rendu.
   */
  setBlocking(blocking: boolean): void {
    this.blocking = blocking;
  }

  /**
   * Indique si la mise à jour et le rendu de l'écran sont bloqués.
   *
   * @returns `true` si la mise à jour et le rendu de l'écran sont bloqués.
   */
  isBlocking(): boolean {
    return this.blocking;
  }

  /**
   * Méthode virtuelle appelée pour mettre à jour l'écran.
   *
   * @param {number} ts - Temps écoulé depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number): void {}

  /** Méthode virtuelle appelée pour dessiner l'écran. */
  draw(): void {}

  /**
   * Méthode virtuelle appelée pendant la phase de rendu.
   *
   * @param {number} ts - Temps écoulé depuis le rendu précédent, en millisecondes.
   */
  render(ts: number): void {}

  /**
   * Méthode virtuelle asynchrone appelée avant l'ajout de l'écran à la pile.
   *
   * @param {any} args - Arguments ou données transmis lors de l'entrée dans l'écran.
   */
  async onEnter(args: any): Promise<void> {}

  /** Méthode virtuelle appelée lorsque l'écran est retiré de la pile. */
  onExit(): void {}

  /**
   * Méthode virtuelle appelée lorsque l'écran revient au premier plan.
   *
   * @param {Screen} oldScreen - Écran qui occupait précédemment le premier plan.
   */
  onBringToFront(oldScreen: Screen): void {}

  /**
   * Méthode virtuelle appelée lorsque l'écran passe à l'arrière-plan.
   *
   * @param {Screen} newScreen - Nouvel écran placé au premier plan.
   */
  onBringToBack(newScreen: Screen): void {}
}