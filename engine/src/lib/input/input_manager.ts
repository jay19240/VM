import { eventManager } from '../core/event_manager';
import { coreManager } from '../core/core_manager';

/** État normalisé d'une manette connectée. */
export interface InputPad {
  index: number;
  id: string;
  nButtons: number;
  nAxes: number;
  axes: Array<number>;
  hat: Array<number>;
  pressed: Array<boolean>;
}

/** Association entre une entrée physique et une action logique. */
export interface InputAction {
  id: string;
  inputSource: InputSource;
  eventKey: string;
}

/** Sources d'entrée prises en charge pour l'association des actions. */
export type InputSource = 'keyboard' | 'gamepad0' | 'gamepad1' | 'gamepad2' | 'gamepad3';

/** Indices des directions de la croix directionnelle dans l'état d'une manette. */
export enum InputPadAxis {
  UP = 0,
  DOWN = 1,
  LEFT = 2,
  RIGHT = 3
};

/**
 * Gestionnaire singleton des entrées du clavier, de la souris et des manettes.
 * Il émet `E_ACTION_ONCE` et `E_ACTION` avec `{ actionId }`, puis `E_ACTION_RELEASED`
 * avec `{ e, actionId }`. Les événements `E_MOUSE_DOWN` et `E_MOUSE_DOWN_ONCE`
 * fournissent `{ e, buttons, x, y }`, `E_MOUSE_UP` fournit `{ e, x, y }`,
 * `E_MOUSE_MOVE` et `E_MOUSE_DRAG` fournissent `{ e, movementX, movementY }`, et
 * `E_MOUSE_WHEEL` fournit `{ e, delta }`. `E_POINTER_LOCK_CHANGED` fournit
 * `{ e, lockCaptured }`. Enfin, les événements de connexion et de déconnexion
 * des manettes fournissent `{ e, id }`, tandis que `E_GAMEPAD_REMOVED` fournit `{ id }`.
 *
 * Associations par défaut :
 * ■ ACTION => CLAVIER => MANETTE
 * ■ OK => Entrée => 0
 * ■ BACK => Échap => 1
 * ■ SELECT => Espace => BtnSelect
 * ■ LEFT => Flèche gauche => PadLeft
 * ■ RIGHT => Flèche droite => PadRight
 * ■ UP => Flèche haut => PadTop
 * ■ DOWN => Flèche bas => PadBottom
 */
export class InputManager {
  container: HTMLDivElement;
  keyMap: Map<string, boolean>;
  actionMap: Map<string, boolean>;
  actionOnceMap: Map<string, number>;
  actionRegister: Map<string, InputAction>;
  pads: Array<InputPad>;
  padsInterval: NodeJS.Timeout | number | undefined;
  mouseDown: boolean;
  mousePosition: vec2;
  mouseWheel: number;
  dragStartPosition: vec2;
  pointerLockEnabled: boolean;
  pointerLockCaptured: boolean;
  gamepadEnabled: boolean;

  /**
   * Crée le gestionnaire, installe les écouteurs DOM et enregistre les actions par défaut.
   */
  constructor() {
    this.container = <HTMLDivElement>document.getElementById('APP');
    this.keyMap = new Map<string, boolean>;
    this.actionMap = new Map<string, boolean>;
    this.actionOnceMap = new Map<string, number>;
    this.actionRegister = new Map<string, InputAction>;
    this.pads = [];
    this.padsInterval;
    this.mouseDown = false;
    this.mousePosition = [0, 0];
    this.mouseWheel = 0;
    this.dragStartPosition = [0, 0];
    this.pointerLockEnabled = false;
    this.pointerLockCaptured = false;
    this.gamepadEnabled = false;

    document.addEventListener('keydown', (e) => this.#handleKeyDown(e));
    document.addEventListener('keyup', (e) => this.#handleKeyUp(e));
    document.addEventListener('pointerdown', (e) => this.#handlePointerDown(e));
    document.addEventListener('pointerup', (e) => this.#handlePointerUp(e));
    document.addEventListener('pointermove', (e) => this.#handlePointerMove(e));
    document.addEventListener('wheel', (e) => this.#handleWheel(e), { passive: false });
    document.addEventListener('pointerlockchange', (e) => this.#handlePointerLockChanged(e), false);
    window.addEventListener('gamepadconnected', (e) => this.#handleGamePadConnected(e));
    window.addEventListener('gamepaddisconnected', (e) => this.#handleGamePadDisconnected(e));

    this.registerAction('keyboard', 'Enter', 'OK');
    this.registerAction('keyboard', 'Escape', 'BACK');
    this.registerAction('keyboard', 'Space', 'SELECT');
    this.registerAction('keyboard', 'ArrowLeft', 'LEFT');
    this.registerAction('keyboard', 'ArrowRight', 'RIGHT');
    this.registerAction('keyboard', 'ArrowUp', 'UP');
    this.registerAction('keyboard', 'ArrowDown', 'DOWN');

    this.registerAction('gamepad0', '0', 'OK');
    this.registerAction('gamepad0', '1', 'BACK');
    this.registerAction('gamepad0', '9', 'SELECT');
    this.registerAction('gamepad0', 'left', 'LEFT');
    this.registerAction('gamepad0', 'right', 'RIGHT');
    this.registerAction('gamepad0', 'up', 'UP');
    this.registerAction('gamepad0', 'down', 'DOWN');

    this.registerAction('gamepad1', '0', 'OK');
    this.registerAction('gamepad1', '1', 'BACK');
    this.registerAction('gamepad1', '9', 'SELECT');
    this.registerAction('gamepad1', 'left', 'LEFT');
    this.registerAction('gamepad1', 'right', 'RIGHT');
    this.registerAction('gamepad1', 'up', 'UP');
    this.registerAction('gamepad1', 'down', 'DOWN');

    this.registerAction('gamepad2', '0', 'OK');
    this.registerAction('gamepad2', '1', 'BACK');
    this.registerAction('gamepad2', '9', 'SELECT');
    this.registerAction('gamepad2', 'left', 'LEFT');
    this.registerAction('gamepad2', 'right', 'RIGHT');
    this.registerAction('gamepad2', 'up', 'UP');
    this.registerAction('gamepad2', 'down', 'DOWN');

    this.registerAction('gamepad3', '0', 'OK');
    this.registerAction('gamepad3', '1', 'BACK');
    this.registerAction('gamepad3', '9', 'SELECT');
    this.registerAction('gamepad3', 'left', 'LEFT');
    this.registerAction('gamepad3', 'right', 'RIGHT');
    this.registerAction('gamepad3', 'up', 'UP');
    this.registerAction('gamepad3', 'down', 'DOWN');
  }

  /**
   * Actualise les manettes activées et fait expirer les activations ponctuelles.
   *
   * @param {number} ts - Temps écoulé depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number): void {
    if (this.gamepadEnabled) {
      this.#updatePadsStatus();
    }

    for (const actionId of this.actionOnceMap.keys()) {
      const state = this.actionOnceMap.get(actionId);
      if (state == 1) {
        this.actionOnceMap.delete(actionId);
      }
      else {
        this.actionOnceMap.set(actionId, 1);
      }
    }
  }

  /** Efface l'état courant et les activations ponctuelles de toutes les actions. */
  clearActionsCache() {
    this.actionMap.clear();
    this.actionOnceMap.clear();
  }

  /**
   * Active ou désactive la lecture des manettes pendant les mises à jour.
   *
   * @param {boolean} enabled - `true` pour activer la prise en charge des manettes.
   */
  enableGamepad(enabled: boolean) {
    this.gamepadEnabled = enabled;
  }

  /**
   * Associe une touche ou un bouton physique à une action logique.
   *
   * @param {InputSource} inputSource - Source depuis laquelle l'entrée est reçue.
   * @param {string} eventKey - Touche, bouton ou direction qui déclenche l'action.
   * @param {string} actionId - Identifiant unique de l'action logique.
   */
  registerAction(inputSource: InputSource, eventKey: string, actionId: string): void {
    this.actionRegister.set(inputSource + eventKey, {
      id: actionId,
      inputSource: inputSource,
      eventKey: eventKey
    });
  }

  /**
   * Supprime l'association d'une entrée physique.
   *
   * @param {InputSource} inputSource - Source de l'entrée.
   * @param {string} eventKey - Touche, bouton ou direction précédemment associé.
   */
  unregisterAction(inputSource: InputSource, eventKey: string): void {
    this.actionRegister.delete(inputSource + eventKey);
  }

  /**
   * Consulte l'état courant d'une action.
   *
   * @param {string} actionId - Identifiant de l'action.
   * @returns `true` si elle est active, `false` si elle est relâchée ou `undefined` si son état est inconnu.
   */
  isActiveAction(actionId: string): boolean | undefined {
    return this.actionMap.get(actionId);
  }

  /**
   * Indique si une action vient d'être activée.
   *
   * @param {string} actionId - Identifiant de l'action.
   * @returns `true` pendant le cycle d'activation ponctuelle de l'action.
   */
  isJustActiveAction(actionId: string): boolean {
    return this.actionOnceMap.get(actionId) == 1;
  }

  /**
   * Vérifie que toutes les actions indiquées sont actives.
   *
   * @param {Array<string>} actionIds - Identifiants des actions à vérifier.
   * @returns `true` si toutes les actions sont actuellement actives.
   */
  isActiveActions(actionIds: Array<string>): boolean {
    for (const actionId of actionIds) {
      if (!this.actionMap.get(actionId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Vérifie que toutes les actions indiquées viennent d'être activées.
   *
   * @param {Array<string>} actionIds - Identifiants des actions à vérifier.
   * @returns `true` si toutes les actions sont dans leur cycle d'activation ponctuelle.
   */
  isJustActiveActions(actionIds: Array<string>): boolean {
    for (const actionId of actionIds) {
      if (this.actionOnceMap.get(actionId) != 1) {
        return false;
      }
    }

    return true;
  }

  /**
   * Indique si le bouton principal du pointeur est maintenu.
   *
   * @returns `true` si le bouton principal du pointeur est maintenu.
   */
  isMouseDown(): boolean {
    return this.mouseDown;
  }

  /**
   * Renvoie la position courante du pointeur.
   *
   * @returns La position courante du pointeur dans le repère du conteneur.
   */
  getMousePosition(): vec2 {
    return this.mousePosition;
  }

  /**
   * Renvoie le cumul des crans de molette reçus.
   *
   * @returns La somme cumulée des crans de molette reçus.
   */
  getMouseWheel(): number {
    return this.mouseWheel;
  }

  /**
   * Indique si le verrouillage du pointeur est autorisé.
   *
   * @returns `true` si le verrouillage du pointeur est autorisé.
   */
  isPointerLockEnabled(): boolean {
    return this.pointerLockEnabled;
  }

  /**
   * Indique si le pointeur est actuellement capturé.
   *
   * @returns `true` si le pointeur est actuellement capturé.
   */
  isPointerLockCaptured(): boolean {
    return this.pointerLockCaptured;
  }

  /**
   * Autorise ou interdit la demande de verrouillage du pointeur.
   *
   * @param {boolean} enabled - `true` pour autoriser le verrouillage.
   */
  setPointerLockEnabled(enabled: boolean): void {
    this.pointerLockEnabled = enabled;
  }

  /**
   * Calcule le déplacement depuis le début du glissement en cours.
   *
   * @returns Le delta de glissement, ou `[0, 0]` si aucun bouton n'est maintenu.
   */
  getMouseDragDelta(): vec2 {
    if (!this.mouseDown) {
      return [0, 0];
    }

    return [
      this.mousePosition[0] - this.dragStartPosition[0],
      this.mousePosition[1] - this.dragStartPosition[1]
    ];
  }

  /**
   * Obtient une manette connectée. Les manettes sont ajoutées automatiquement à leur connexion.
   *
   * @param {number} index - Indice attribué à la manette par le navigateur.
   * @returns L'état de la manette, ou `undefined` si elle est introuvable.
   */
  getPad(index: number): InputPad | undefined {
    return this.pads.find(p => p.index == index);
  }

  /**
   * Lit la valeur d'un axe de manette.
   *
   * @param {number} index - Indice de la manette.
   * @param {number} axis - Indice de l'axe à lire.
   * @returns La valeur de l'axe, ou `0` si la manette ou l'axe est introuvable.
   */
  getPadAxis(index: number, axis: number): number {
    const pad = this.pads.find(p => p.index == index);
    if (!pad) return 0;
    return pad.axes[axis] ?? 0;
  }

  /**
   * Lit la position d'un stick analogique en appliquant une zone morte radiale.
   *
   * @param {number} index - Indice de la manette.
   * @param {0 | 1} stick - Stick à lire : `0` pour le gauche, `1` pour le droit.
   * @param {number} deadzone - Rayon sous lequel la position est ramenée à `[0, 0]`.
   * @returns La position du stick, ou `[0, 0]` si la manette est absente ou dans la zone morte.
   */
  getPadStick(index: number, stick: 0 | 1, deadzone: number = 0.15): vec2 {
    const pad = this.pads.find(p => p.index == index);
    if (!pad) return [0, 0];
    const x = pad.axes[stick * 2] ?? 0;
    const y = pad.axes[stick * 2 + 1] ?? 0;
    if (Math.hypot(x, y) < deadzone) return [0, 0];
    return [x, y];
  }

  /**
   * Retire une manette de la liste et émet `E_GAMEPAD_REMOVED`.
   *
   * @param {string} id - Identifiant unique de la manette.
   */
  removePad(id: string): void {
    this.pads = this.pads.filter(p => p.id != id);
    if (this.pads.length <= 0) {
      clearInterval(this.padsInterval);
      this.padsInterval = undefined;
    }

    eventManager.emit(this, 'E_GAMEPAD_REMOVED', { id: id });
  }

  #addPad(pad: InputPad): void {
    this.pads.push(pad);
  }

  #handleKeyDown(e: KeyboardEvent): boolean {
    const action = this.actionRegister.get('keyboard' + e.code);

    if (!this.keyMap.get(e.code) && action) {
      eventManager.emit(this, 'E_ACTION_ONCE', { e: e, actionId: action.id });
      this.actionMap.set(action.id, true);
      this.actionOnceMap.set(action.id, 0);
    }

    if (action) {
      eventManager.emit(this, 'E_ACTION', { e: e, actionId: action.id });
      this.actionMap.set(action.id, true);
    }

    this.keyMap.set(e.code, true);
    return false;
  }

  #handleKeyUp(e: KeyboardEvent): void {
    const action = this.actionRegister.get('keyboard' + e.code);
    if (action) {
      eventManager.emit(this, 'E_ACTION_RELEASED', { e: e, actionId: action.id });
      this.actionMap.set(action.id, false);
    }

    this.keyMap.set(e.code, false);
  }

  async #handlePointerDown(e: PointerEvent): Promise<void> {
    if (this.pointerLockEnabled && !document.pointerLockElement) {
      await document.body.requestPointerLock();
    }

    const pos = coreManager.getContainerPosFromDocument(e.clientX, e.clientY);
    if (pos[0] == Infinity || pos[1] == Infinity) {
      return;
    }

    if (!this.mouseDown) {
      this.mouseDown = true;
      this.dragStartPosition[0] = pos[0];
      this.dragStartPosition[1] = pos[1];
      eventManager.emit(this, 'E_MOUSE_DOWN_ONCE', { e: e, buttons: e.buttons, x: pos[0], y: pos[1] });
    }

    this.mouseDown = true;
    this.dragStartPosition[0] = pos[0];
    this.dragStartPosition[1] = pos[1];
    eventManager.emit(this, 'E_MOUSE_DOWN', { e: e, buttons: e.buttons, x: pos[0], y: pos[1] });
  }

  #handlePointerUp(e: PointerEvent): void {
    const rect = this.container.getBoundingClientRect();
    const x = (e.clientX - rect.left) - (coreManager.getWidth() / 2);
    const y = (e.clientY - rect.top) - (coreManager.getHeight() / 2);

    this.mouseDown = false;
    this.dragStartPosition[0] = 0;
    this.dragStartPosition[1] = 0;
    eventManager.emit(this, 'E_MOUSE_UP', { e: e, x: x, y: y });
  }

  #handlePointerMove(e: PointerEvent): void {
    if (this.pointerLockEnabled && !this.pointerLockCaptured) {
      return;
    }

    const pos = coreManager.getContainerPosFromDocument(e.clientX, e.clientY);
    if (pos[0] == Infinity || pos[1] == Infinity) {
      return;
    }

    this.mouseDown = e.pointerType == 'mouse' ? (e.buttons & 1) !== 0 : true;
    this.mousePosition = [pos[0], pos[1]];

    eventManager.emit(this, 'E_MOUSE_MOVE', { e: e, movementX: e.movementX, movementY: e.movementY });

    if (this.mouseDown) {
      eventManager.emit(this, 'E_MOUSE_DRAG', { e: e, movementX: e.movementX, movementY: e.movementY });
    }
  }

  #handleWheel(e: WheelEvent): void {
    this.mouseDown = (e.buttons & 1) !== 0;
    this.mouseWheel += Math.sign(e.deltaY);
    eventManager.emit(this, 'E_MOUSE_WHEEL', { e: e, delta: Math.sign(e.deltaY) });
  }

  #handlePointerLockChanged(e: Event): void {
    if (!this.pointerLockEnabled) {
      return;
    }

    if (document.pointerLockElement == document.body) {
      this.pointerLockCaptured = true;
      eventManager.emit(this, 'E_POINTER_LOCK_CHANGED', { e: e, lockCaptured: true });
    }
    else {
      this.pointerLockCaptured = false;
      eventManager.emit(this, 'E_POINTER_LOCK_CHANGED', { e: e, lockCaptured: false });
    }
  }

  #handleGamePadDisconnected(e: GamepadEvent): void {
    this.removePad(e.gamepad.id);
    eventManager.emit(this, 'E_GAMEPAD_DISCONNECTED', { e: e, id: e.gamepad.id });
  }

  #handleGamePadConnected(e: GamepadEvent): void {
    const pad: InputPad = {
      index: e.gamepad.index,
      id: e.gamepad.id,
      nButtons: e.gamepad.buttons.length,
      nAxes: e.gamepad.axes.length,
      axes: [],
      hat: [0, 0, 0, 0],
      pressed: []
    };

    for (let i = 0; i < e.gamepad.buttons.length; i++) {
      pad.pressed[i] = e.gamepad.buttons[i].pressed;
    }

    this.#addPad(pad);
    eventManager.emit(this, 'E_GAMEPAD_CONNECTED', { e: e, id: e.gamepad.id });
  }

  #updatePadsStatus(): void {
    const navigator: any = window.navigator;
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : (navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : []);

    for (const gamepad of gamepads) {
      if (!gamepad) {
        continue;
      }

      const pad = this.getPad(gamepad.index);

      if (pad != null) {
        // Analogs Sticks
        for (let i = 0; i < gamepad.axes.length; i++) {
          pad.axes[i] = gamepad.axes[i];
        }

        // D-Pad
        const hatAxis = gamepad.axes[9];
        let up, down, left, right = 0.0;
        if (hatAxis !== undefined && hatAxis <= 1.0 && hatAxis >= -1.0) {
          up = (hatAxis > -1.05 && hatAxis < -0.6 || hatAxis > 0.9) ? 1.0 : 0.0;
          down = (hatAxis > -0.2 && hatAxis < 0.2) ? 1.0 : 0.0;
          left = (hatAxis > 0.3 && hatAxis < 1.05) ? 1.0 : 0.0;
          right = (hatAxis > -0.8 && hatAxis < -0.3) ? 1.0 : 0.0;

          if (up) {
            const action = this.actionRegister.get('gamepad' + gamepad.index + 'up');
            if (!action) {
              return;
            }

            if (up != pad.hat[InputPadAxis.UP]) eventManager.emit(this, 'E_ACTION_ONCE', { actionId: action.id });
            eventManager.emit(this, 'E_ACTION', { actionId: action.id });
          }
          else if (down) {
            const action = this.actionRegister.get('gamepad' + gamepad.index + 'down');
            if (!action) {
              return;
            }

            if (down != pad.hat[InputPadAxis.DOWN]) eventManager.emit(this, 'E_ACTION_ONCE', { actionId: action.id });
            eventManager.emit(this, 'E_ACTION', { actionId: action.id });
          }
          else if (left) {
            const action = this.actionRegister.get('gamepad' + gamepad.index + 'left');
            if (!action) {
              return;
            }

            if (left != pad.hat[InputPadAxis.LEFT]) eventManager.emit(this, 'E_ACTION_ONCE', { actionId: action.id });
            eventManager.emit(this, 'E_ACTION', { actionId: action.id });
          }
          else if (right) {
            const action = this.actionRegister.get('gamepad' + gamepad.index + 'right');
            if (!action) {
              return;
            }

            if (right != pad.hat[InputPadAxis.RIGHT]) eventManager.emit(this, 'E_ACTION_ONCE', { actionId: action.id });
            eventManager.emit(this, 'E_ACTION', { actionId: action.id });
          }
        }

        pad.hat[InputPadAxis.UP] = up as number;
        pad.hat[InputPadAxis.DOWN] = down as number;
        pad.hat[InputPadAxis.LEFT] = left as number;
        pad.hat[InputPadAxis.RIGHT] = right as number;

        // Buttons
        for (let n = 0; n < gamepad.buttons.length; n++) {
          const action = this.actionRegister.get('gamepad' + gamepad.index + n);

          if (gamepad.buttons[n].pressed && !this.keyMap.get('gamepad' + gamepad.index + '-' + n) && action) {
            eventManager.emit(this, 'E_ACTION_ONCE', { actionId: action.id });
            this.actionOnceMap.set(action.id, 0);
          }

          if (gamepad.buttons[n].pressed && action) {
            eventManager.emit(this, 'E_ACTION', { actionId: action.id });
          }

          if (action) {
            this.actionMap.set(action.id, gamepad.buttons[n].pressed);
          }

          this.keyMap.set('gamepad' + gamepad.index + '-' + n, gamepad.buttons[n].pressed);
          pad.pressed[n] = gamepad.buttons[n].pressed;
        }
      }
    }
  }
}

/** Instance partagée du gestionnaire d'entrées. */
export const inputManager = new InputManager();