import { eventManager } from '../core/event_manager';
import { UIWidget } from '../ui/ui_widget';

/**
 * Champ de saisie de texte affichant chaque caractère dans une case distincte.
 * Émet `E_VALUE_CHANGED` avec les données `{ value }` lorsque la valeur change.
 */
export class UIInput extends UIWidget {
  name: string;
  label: string;
  maxLength: number;
  width: number;
  lastPosFocus: number;
  inputEl: HTMLInputElement;
  valueEl: HTMLElement;
  labelEl: HTMLElement;
  handleInputBind: (event: any) => void;

  /**
   * Crée un champ de saisie.
   *
   * @param options - Nom, libellé, longueur maximale et largeur du champ.
   */
  constructor(options: { name?: string, label?: string, maxLength?: number, width?: number } = {}) {
    super({
      className: 'UIInput',
      template: `
      <div class="UIInput-container">
        <input id="Input${options.name ?? ''}" type="text" class="UIInput-input js-input" value=""/>
        <span class="UIInput-value js-value" dir="rtl"></span>
        <label class="UIInput-label js-label" for="Input${options.name ?? ''}">${options.label ?? ''}</label>
      </div>`
    });

    this.name = options.name ?? '';
    this.label = options.label ?? '';
    this.maxLength = options.maxLength ?? 10;
    this.width = options.width ?? 400;
    this.lastPosFocus = -1;

    this.inputEl = this.node.querySelector<HTMLInputElement>('.js-input')!;
    this.valueEl = this.node.querySelector<HTMLElement>('.js-value')!;
    this.labelEl = this.node.querySelector<HTMLElement>('.js-label')!;

    const container = this.node.querySelector<HTMLElement>('.UIInput-container')!;
    container.style.width = this.width + 'px';

    for (let i = 0; i < this.maxLength; i++) {
      this.valueEl.innerHTML += `<span class="UIInput-value-char"></span>`;
    }

    this.handleInputBind = this.handleInput.bind(this);
    this.inputEl.addEventListener('input', this.handleInputBind);
  }

  /** Libère l'écouteur de saisie et les ressources héritées du composant. */
  delete() {
    this.inputEl.removeEventListener('input', this.handleInputBind);
    super.delete();
  }

  /** Donne le focus au champ et restaure la case de caractère active. */
  focus(): void {
    if (this.lastPosFocus != -1) {
      this.valueEl.children[this.lastPosFocus].classList.add('u-focused');
    }

    this.inputEl.focus();
    super.focus();
  }

  /** Retire le focus du champ et de toutes ses cases de caractère. */
  unfocus(): void {
    for (let i = 0; i < this.valueEl.children.length; i++) {
      this.valueEl.children[i].classList.remove('u-focused');
    }

    super.unfocus();
  }

  /**
   * Donne le focus à une position de caractère valide.
   *
   * @param {number} pos - Indice du caractère à activer.
   */
  focusChar(pos: number): void {
    if (pos < 0 || pos > this.maxLength - 1) {
      return;
    }

    if (this.lastPosFocus != -1) {
      this.valueEl.children[this.lastPosFocus].classList.remove('u-focused');
    }

    this.valueEl.children[pos].classList.add('u-focused');
    this.lastPosFocus = pos;
  }

  /**
   * Définit la valeur du champ et déclenche son traitement comme une saisie utilisateur.
   *
   * @param {string} value - Nouvelle valeur.
   */
  setValue(value: string): void {
    if (value == this.inputEl.value) {
      return;
    }

    this.inputEl.value = value;
    this.inputEl.dispatchEvent(new Event('input'));
  }

  /**
   * Renvoie le nom du champ.
   *
   * @returns Le nom du champ.
   */
  getName(): string {
    return this.name;
  }

  /**
   * Renvoie le libellé du champ.
   *
   * @returns Le libellé du champ.
   */
  getLabel(): string {
    return this.label;
  }

  /**
   * Définit le libellé du champ.
   *
   * @param {string} label - Nouveau libellé.
   */
  setLabel(label: string): void {
    this.label = label;
    this.labelEl.textContent = label;
  }

  /**
   * Renvoie la valeur du champ.
   *
   * @returns La valeur saisie.
   */
  getValue(): string {
    return this.inputEl.value;
  }

  /**
   * Déplace le focus entre les caractères en réponse aux actions directionnelles.
   *
   * @param {string} actionId - Identifiant de l'action.
   */
  onAction(actionId: string): void {
    if (!this.isFocused() || document.activeElement != this.inputEl) {
      return;
    }
    if (this.lastPosFocus < 0) {
      return;
    }

    if (actionId == 'RIGHT' && this.lastPosFocus + 1 <= this.inputEl.value.length - 1) {
      this.focusChar(this.lastPosFocus + 1);
    }
    else if (actionId == 'LEFT') {
      this.focusChar(this.lastPosFocus - 1);
      if (this.lastPosFocus <= 0) {
        this.inputEl.setSelectionRange(2, 2);
      }
    }
  }

  /**
   * Synchronise l'affichage avec la valeur native du champ et émet `E_VALUE_CHANGED`.
   *
   * @param event - Événement de saisie à l'origine de la mise à jour.
   */
  handleInput(event: any) {
    if (this.inputEl.value.length > this.maxLength) {
      this.inputEl.value = this.inputEl.value.slice(0, this.maxLength);
    }

    if (this.inputEl.selectionStart && this.inputEl.selectionStart > this.maxLength) {
      return;
    }

    if (this.inputEl.value == '') {
      this.labelEl.style.justifyContent = 'flex-start';
    }
    else {
      this.labelEl.style.justifyContent = 'flex-end';
    }

    for (let i = 0; i < this.maxLength; i++) {
      const char = this.inputEl.value.charAt(i);
      if (char == ' ') {
        this.valueEl.children[i].textContent = '\u00A0';
      }
      else if (char) {
        this.valueEl.children[i].textContent = char;
      }
      else {
        this.valueEl.children[i].textContent = '';
      }
    }

    eventManager.emit(this, 'E_VALUE_CHANGED', { value: this.inputEl.value });

    if (this.inputEl.selectionStart) {
      const pos = this.inputEl.selectionStart - 1;
      this.focusChar(pos);
    }
    else {
      this.focusChar(0);
    }
  }
}