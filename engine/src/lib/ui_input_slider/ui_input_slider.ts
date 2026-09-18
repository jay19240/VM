import { eventManager } from '../core/event_manager';
import { UIWidget } from '../ui/ui_widget';

/**
 * Champ de saisie sous forme de curseur numérique.
 * Émet `E_VALUE_CHANGED` avec les données `{ value }` lorsque sa valeur change par une action.
 */
export class UIInputSlider extends UIWidget {
  value: number;
  min: number;
  max: number;
  step: number;

  /** Crée un curseur initialisé à zéro avec un pas de un. */
  constructor() {
    super({
      className: 'UIInputSlider',
      template: `
      <input class="UIInputSlider-range js-range" type="range" min="0" max="0" step="1" value="0">
      <div class="UIInputSlider-value js-value">0</div>`
    });

    this.value = 0;
    this.min = 0;
    this.max = 0;
    this.step = 1;
  }

  /**
   * Définit et affiche la valeur du curseur.
   *
   * @param {number} value - Nouvelle valeur.
   */
  setValue(value: number): void {
    if (value == this.value) {
      return;
    }

    this.node.querySelector<any>('.js-range').value = value;
    this.node.querySelector<any>('.js-value').textContent = value;
    this.value = value;
  }

  /**
   * Définit la valeur minimale du curseur.
   *
   * @param {number} min - Valeur minimale.
   */
  setMin(min: number): void {
    this.node.querySelector<any>('.js-range').min = min;
    this.min = min;
  }

  /**
   * Définit la valeur maximale du curseur.
   *
   * @param {number} max - Valeur maximale.
   */
  setMax(max: number): void {
    this.node.querySelector<any>('.js-range').max = max;
    this.max = max;
  }

  /**
   * Définit le pas d'incrémentation et de décrémentation du curseur.
   *
   * @param {number} step - Valeur du pas.
   */
  setStep(step: number): void {
    this.node.querySelector<any>('.js-range').step = step;
    this.step = step;
  }

  /**
   * Renvoie la valeur du curseur.
   *
   * @returns La valeur courante.
   */
  getValue(): number {
    return this.value;
  }

  /**
   * Diminue ou augmente la valeur selon l'action reçue, dans les limites configurées.
   * Émet `E_VALUE_CHANGED` lorsque l'action `LEFT` ou `RIGHT` modifie la valeur.
   *
   * @param {string} actionId - Identifiant de l'action.
   */
  onAction(actionId: string): void {
    if (actionId == 'LEFT' && this.value - this.step >= this.min) {
      this.value -= this.step;
      eventManager.emit(this, 'E_VALUE_CHANGED', { value: this.value });
    }
    else if (actionId == 'RIGHT' && this.value + this.step <= this.max) {
      this.value += this.step;
      eventManager.emit(this, 'E_VALUE_CHANGED', { value: this.value });
    }

    this.node.querySelector<any>('.js-range').value = this.value;
    this.node.querySelector<any>('.js-value').textContent = this.value;
  }
}