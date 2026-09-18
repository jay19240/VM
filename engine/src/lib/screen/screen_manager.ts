import { Screen } from './screen';

/**
 * Gestionnaire singleton de la pile d'écrans.
 * Les requêtes d'ajout, de remplacement et de retrait sont différées afin d'être exécutées
 * de manière sûre dans la boucle de mise à jour.
 */
export class ScreenManager {
  requests: Array<Function>;
  screens: Array<Screen>;

  /** Crée un gestionnaire dont la pile et la file de requêtes sont vides. */
  constructor() {
    this.requests = [];
    this.screens = [];
  }

  /**
   * Exécute les requêtes en attente, puis met à jour les écrans non bloqués.
   *
   * @param {number} ts - Temps écoulé depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number): void {
    while (this.requests.length > 0) {
      let request = this.requests.pop()!;
      request();
    }

    for (let i = this.screens.length - 1; i >= 0; i--) {
      if (!this.screens[i].isBlocking()) {
        this.screens[i].update(ts);
      }
    }
  }

  /** Dessine les écrans non bloqués de la pile. */
  draw(): void {
    for (let i = this.screens.length - 1; i >= 0; i--) {
      if (!this.screens[i].isBlocking()) {
        this.screens[i].draw();
      }
    }
  }

  /**
   * Exécute la phase de rendu des écrans non bloqués.
   *
   * @param {number} ts - Temps écoulé depuis le rendu précédent, en millisecondes.
   */
  render(ts: number): void {
    for (let i = this.screens.length - 1; i >= 0; i--) {
      if (!this.screens[i].isBlocking()) {
        this.screens[i].render(ts);
      }
    }
  }

  /**
   * Programme l'ajout d'un écran à la pile après l'achèvement de sa méthode `onEnter`.
   *
   * @param {Screen} newScreen - Écran à ajouter.
   * @param {any} args - Arguments transmis à la méthode `onEnter` du nouvel écran.
   * @throws Une erreur lors du traitement de la requête si l'écran figure déjà dans la pile.
   */
  requestPushScreen(newScreen: Screen, args: any = {}): void {
    this.requests.push(() => {
      if (this.screens.indexOf(newScreen) != -1) {
        throw new Error('ScreenManager::requestPushScreen(): You try to push an existing screen to the stack !');
      }

      let topScreen = this.screens[this.screens.length - 1];
      topScreen.onBringToBack(newScreen);

      let promise = newScreen.onEnter(args);
      promise.then(() => this.screens.push(newScreen));
    });
  }

  /**
   * Programme le remplacement de toute la pile par un unique écran, ajouté après son entrée.
   *
   * @param {Screen} newScreen - Écran qui remplacera la pile actuelle.
   * @param {any} args - Arguments transmis à la méthode `onEnter` du nouvel écran.
   */
  requestSetScreen(newScreen: Screen, args: any = {}): void {
    this.requests.push(() => {
      this.screens.forEach(screen => screen.onExit());
      this.screens = [];
      let promise = newScreen.onEnter(args);
      promise.then(() => this.screens.push(newScreen));
    });
  }

  /**
   * Programme le retrait de l'écran au sommet de la pile et le retour du précédent au premier plan.
   *
   * @throws Une erreur lors du traitement de la requête si la pile est vide.
   */
  requestPopScreen(): void {
    this.requests.push(() => {
      if (this.screens.length == 0) {
        throw new Error('ScreenManager::requestPopScreen: You try to pop an empty state stack !');
      }

      let topScreen = this.screens[this.screens.length - 1];
      topScreen.onExit();
      this.screens.pop();

      if (this.screens.length > 0) {
        let newTopScreen = this.screens[this.screens.length - 1];
        newTopScreen.onBringToFront(topScreen);
      }
    });
  }
}

/** Instance partagée du gestionnaire de la pile d'écrans. */
export const screenManager = new ScreenManager();