import { eventManager } from './event_manager';

/**
 * Stratégie d'adaptation du conteneur principal à la fenêtre du navigateur.
 */
export enum SizeMode {
  FIT = 0, // Fit the page with scale/distortion
  ADJUST = 1, // Fit the page without distortion (with borders)
  FIXED = 2, // Fixed size without scale/distortion
  FULL = 3 // Full page
};

/**
 * Gère la taille, la résolution et la présentation du conteneur principal.
 *
 * @remarks
 * Toute modification de taille émet l'événement `E_RESIZE`.
 */
export class CoreManager {
  container: HTMLElement;
  resWidth: number;
  resHeight: number;
  sizeMode: SizeMode;

  /**
   * Initialise le gestionnaire à partir de l'élément HTML `APP`.
   *
   * @throws Une erreur si l'élément `APP` est introuvable.
   */
  constructor() {
    this.container = document.getElementById('APP')!;

    if (!this.container) {
      throw new Error('Application::Application: APP element not found !');
    }

    this.resWidth = this.container.clientWidth;
    this.resHeight = this.container.clientHeight;
    this.sizeMode = SizeMode.FIXED;
    window.addEventListener('resize', () => eventManager.emit(this, 'E_RESIZE'));
  }

  /**
   * Définit la résolution et la stratégie d'adaptation du conteneur, puis émet `E_RESIZE`.
   *
   * @param resWidth - Largeur de résolution, en pixels.
   * @param resHeight - Hauteur de résolution, en pixels.
   * @param sizeMode - Manière d'adapter le conteneur à la fenêtre du navigateur.
   */
  setSize(resWidth: number, resHeight: number, sizeMode = SizeMode.FIXED): void {
    this.container.style.width = resWidth + 'px';
    this.container.style.height = resHeight + 'px';

    if (sizeMode == SizeMode.FIT) {
      this.container.style.transform = 'scale(' + window.innerWidth / resWidth + ',' + window.innerHeight / resHeight + ')';
      this.container.style.margin = '0';
    }
    else if (sizeMode == SizeMode.ADJUST) {
      this.container.style.transform = 'scale(' + Math.min(window.innerWidth / resWidth, window.innerHeight / resHeight) + ')';
      this.container.style.margin = '0';
    }
    else if (sizeMode == SizeMode.FIXED) {
      this.container.style.transform = 'none';
      this.container.style.margin = '0 auto';
    }
    else if (sizeMode == SizeMode.FULL) {
      this.container.style.width = '100vw';
      this.container.style.height = '100vh';
      this.container.style.margin = '0';
    }

    this.resWidth = resWidth;
    this.resHeight = resHeight;
    this.sizeMode = sizeMode;

    eventManager.emit(this, 'E_RESIZE');
  }

  /**
   * Retourne les dimensions affichées du conteneur.
   *
   * @returns Largeur et hauteur clientes, en pixels.
   */
  getSize(): vec2 {
    return [
      this.container.clientWidth,
      this.container.clientHeight
    ];
  }

  /**
   * Retourne la largeur affichée du conteneur.
   *
   * @returns Largeur cliente, en pixels.
   */
  getWidth(): number {
    return this.container.clientWidth;
  }

  /**
   * Retourne la hauteur affichée du conteneur.
   *
   * @returns Hauteur cliente, en pixels.
   */
  getHeight(): number {
    return this.container.clientHeight;
  }

  /**
   * Retourne la moitié de la largeur affichée du conteneur.
   *
   * @returns Demi-largeur cliente, en pixels.
   */
  getHalfWidth(): number {
    return this.container.clientWidth / 2;
  }

  /**
   * Retourne la moitié de la hauteur affichée du conteneur.
   *
   * @returns Demi-hauteur cliente, en pixels.
   */
  getHalfHeight(): number {
    return this.container.clientHeight / 2;
  }

  /**
   * Retourne la résolution logique.
   *
   * @returns Largeur et hauteur de résolution, en pixels.
   */
  getResolution(): vec2 {
    return [
      this.resWidth,
      this.resHeight
    ];
  }

  /**
   * Convertit une position du document en coordonnées du conteneur centrées sur son origine.
   *
   * @param clientX - Coordonnée horizontale dans le document.
   * @param clientY - Coordonnée verticale dans le document.
   * @returns Position dans le conteneur, ou `[Infinity, Infinity]` hors de ses limites.
   */
  getContainerPosFromDocument(clientX: number, clientY: number): vec2 {
    const rect = this.container.getBoundingClientRect();
    const leftR = clientX - rect.left;
    const topR = clientY - rect.top;
    if (leftR < 0 || leftR > this.container.clientWidth || topR < 0 || topR > this.container.clientHeight) {
      return [Infinity, Infinity];
    }

    const x = leftR - (this.container.clientWidth / 2);
    const y = topR - (this.container.clientHeight / 2);
    return [x, y];
  }

  /**
   * Convertit une position du document en coordonnées normalisées centrées du conteneur.
   *
   * @param clientX - Coordonnée horizontale dans le document.
   * @param clientY - Coordonnée verticale dans le document.
   * @returns Position normalisée, généralement comprise entre `-1` et `1`, ou des valeurs infinies hors limites.
   */
  getContainerNormalizedPosFromDocument(clientX: number, clientY: number): vec2 {
    const [x, y] = this.getContainerPosFromDocument(clientX, clientY);
    return [
      x / (this.container.clientWidth / 2),
      y / (this.container.clientHeight / 2)
    ];
  }

  /**
   * Retourne la largeur de résolution.
   *
   * @returns Largeur logique, en pixels.
   */
  getResWidth(): number {
    return this.resWidth;
  }

  /**
   * Retourne la hauteur de résolution.
   *
   * @returns Hauteur logique, en pixels.
   */
  getResHeight(): number {
    return this.resHeight;
  }

  /**
   * Retourne la stratégie d'adaptation courante.
   *
   * @returns Mode de taille actif.
   */
  getSizeMove(): SizeMode {
    return this.sizeMode;
  }

  /**
   * Ajoute une classe CSS au conteneur.
   *
   * @param className - Nom de la classe.
   */
  addClass(className: string): void {
    this.container.classList.add(className);
  }

  /**
   * Retire une classe CSS du conteneur.
   *
   * @param className - Nom de la classe.
   */
  removeClass(className: string): void {
    this.container.classList.remove(className);
  }

  /**
   * Bascule la présence d'une classe CSS sur le conteneur.
   *
   * @param className - Nom de la classe.
   */
  toggleClass(className: string): void {
    this.container.classList.toggle(className);
  }

  /**
   * Active ou désactive l'effet visuel de lignes de balayage.
   *
   * @param enabled - `true` pour activer l'effet.
   */
  enableScanlines(enabled: boolean): void {
    this.container.classList.toggle('scanlines', enabled);
  }
}

export const coreManager = new CoreManager();