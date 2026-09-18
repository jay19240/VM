/** Bloc d'instructions issu d'un fichier de script JSC. */
export interface JSCBlock {
  id: string;
  description: string;
  calls: Array<JSCBlockCall>;
}

/** Appel d'une commande et arguments sérialisés dans un bloc JSC. */
export interface JSCBlockCall {
  commandName: string;
  commandArgs: Array<any>;
}

/** Interprète et exécute des blocs de commandes chargés depuis des fichiers JSON. */
export class ScriptMachine {
  variants: any;
  blocks: Array<JSCBlock>;
  commandRegister: Map<string, Function>;
  enabled: boolean;
  currentBlockId: string;
  currentCallIndex: number;
  onBeforeBlockExec: (block: JSCBlock) => void;
  onAfterBlockExec: (block: JSCBlock) => void;
  onBeforeCommandExec: (command: Function) => void;
  onAfterCommandExec: (command: Function) => void;

  /** Crée une machine active et enregistre ses commandes intégrées. */
  constructor() {
    this.variants = {};
    this.blocks = [];
    this.commandRegister = new Map<string, Function>();
    this.enabled = true;
    this.currentBlockId = '';
    this.currentCallIndex = 0;
    this.onBeforeBlockExec = () => { };
    this.onAfterBlockExec = () => { };
    this.onBeforeCommandExec = () => { };
    this.onAfterCommandExec = () => { };

    this.registerCommand('WAITPAD', this.#waitPad.bind(this));
    this.registerCommand('GOTO', this.#goto.bind(this));
    this.registerCommand('GOTO_IF', this.#gotoIf.bind(this));
    this.registerCommand('EXEC_IF', this.#execIf.bind(this));
    this.registerCommand('VAR_SET', this.#varSet.bind(this));
    this.registerCommand('VAR_ADD', this.#varAdd.bind(this));
    this.registerCommand('VAR_SUB', this.#varSub.bind(this));
    this.registerCommand('DELAY', this.#delay.bind(this));
  }

  /**
   * Charge de façon asynchrone les blocs d'un fichier JSON au format JSC.
   *
   * @param {string} path - Chemin du fichier JSC.
   */
  async loadFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    this.blocks = [];
    for (const obj of json) {
      const block: JSCBlock = { id: obj['Id'], description: obj['Description'], calls: [] };
      for (const objCall of obj['Calls']) {
        block.calls.push({
          commandName: objCall['Name'],
          commandArgs: objCall['Args']
        });
      }

      this.blocks.push(block);
    }
  }

  /**
   * Charge de façon asynchrone les variables d'un fichier JSON au format JSV.
   *
   * @param {string} path - Chemin du fichier JSV.
   * @throws Une erreur si une variable chargée existe déjà.
   */
  async loadVariantFromFile(path: string): Promise<void> {
    const response = await fetch(path);
    const json = await response.json();

    for (const key in json) {
      this.addVariant(key, json[key]);
    }
  }

  /**
   * Ajoute les variables définies dans un objet de données.
   *
   * @param {any} data - Objet associant les noms de variables à leurs valeurs.
   * @throws Une erreur si l'une des variables existe déjà.
   */
  loadVariantFromData(data: any): void {
    for (const key in data) {
      this.addVariant(key, data[key]);
    }
  }

  /**
   * Exécute l'appel courant du bloc sélectionné lorsque la machine est active.
   *
   * @param {number} ts - Temps écoulé depuis la mise à jour précédente, en millisecondes.
   * @throws Une erreur si l'appel courant désigne une commande non enregistrée.
   */
  update(ts: number): void {
    if (!this.enabled) {
      return;
    }

    const currentBlock = this.blocks.find(block => block.id == this.currentBlockId);
    if (!currentBlock) {
      return;
    }

    if (this.currentCallIndex == currentBlock.calls.length) {
      this.onAfterBlockExec(currentBlock);
      this.currentBlockId = '';
      this.currentCallIndex = 0;
      return;
    }

    if (this.currentCallIndex == 0) {
      this.onBeforeBlockExec(currentBlock);
    }

    const currentCall = currentBlock.calls[this.currentCallIndex];
    const jumpto = this.runCommand(currentCall.commandName, currentCall.commandArgs);
    if (typeof jumpto === 'string') {
      this.currentBlockId = jumpto;
      this.currentCallIndex = 0;
      return;
    }

    if (this.currentCallIndex < currentBlock.calls.length) {
      this.currentCallIndex++;
    }
  }

  /**
   * Exécute une commande enregistrée et relaie son éventuelle destination de saut.
   *
   * @param {string} key - Identifiant de la commande.
   * @param {Array<any>} args - Arguments transmis à la fonction de commande.
   * @returns L'identifiant du bloc cible, ou `undefined` si la commande ne demande aucun saut.
   * @throws Une erreur si aucune commande n'est enregistrée sous cet identifiant.
   */
  runCommand(key: string, args: Array<any> = []): string | undefined {
    const command = this.commandRegister.get(key);
    if (!command) {
      throw new Error('ScriptMachine::runCommand: try to call an not existant command ' + key + ' !');
    }

    this.onBeforeCommandExec(command);
    const jumpto = command.call(this, ...args);
    this.onAfterCommandExec(command);
    return jumpto;
  }

  /**
   * Enregistre une fonction de commande sous un identifiant unique.
   *
   * @param {string} key - Identifiant, ou nom, de la commande.
   * @param {Function} commandFunc - Fonction appelée lors de l'exécution de la commande.
   * @throws Une erreur si l'identifiant est déjà enregistré.
   */
  registerCommand(key: string, commandFunc: Function) {
    if (this.commandRegister.has(key)) {
      throw new Error('ScriptMachine::registerCommand: key already exist !')
    }

    this.commandRegister.set(key, commandFunc);
  }

  /** Supprime toutes les commandes enregistrées, y compris les commandes intégrées. */
  clearCommandRegister(): void {
    this.commandRegister.clear();
  }

  /**
   * Sélectionne un bloc de script et replace son curseur sur le premier appel.
   *
   * @param {string} blockId - Identifiant du bloc cible.
   */
  jump(blockId: string) {
    this.currentBlockId = blockId;
    this.currentCallIndex = 0;
  }

  /**
   * Indique si la machine est autorisée à exécuter des commandes.
   *
   * @returns `true` si la machine est autorisée à exécuter des commandes.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Active ou suspend l'exécution de la machine.
   *
   * @param {boolean} enabled - `true` pour autoriser l'exécution des commandes.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Ajoute une variable à l'environnement du script.
   *
   * @param {string} varloc - Nom de la variable.
   * @param {any} value - Valeur initiale.
   * @throws Une erreur si la variable existe déjà.
   */
  addVariant(varloc: string, value: any): void {
    if (this.variants.hasOwnProperty(varloc)) {
      throw new Error('ScriptMachine::addVariant: varloc already exist in variants dictionnary');
    }

    this.variants[varloc] = value;
  }

  /**
   * Supprime une variable de l'environnement du script.
   *
   * @param {string} varloc - Nom de la variable.
   * @throws Une erreur si la variable n'existe pas.
   */
  removeVariant(varloc: string): void {
    if (!this.variants.hasOwnProperty(varloc)) {
      throw new Error('ScriptMachine::removeVariant: varloc not exist in variants dictionnary');
    }

    delete this.variants[varloc];
  }

  /**
   * Modifie la valeur d'une variable existante.
   *
   * @param {string} varloc - Nom de la variable.
   * @param {any} value - Nouvelle valeur.
   * @throws Une erreur si la variable n'existe pas.
   */
  setVariant(varloc: string, value: any): void {
    if (!this.variants.hasOwnProperty(varloc)) {
      throw new Error('ScriptMachine::setVariant: varloc not exist in variants dictionnary');
    }

    this.variants[varloc] = value;
  }

  /**
   * Vérifie l'existence d'une variable dans l'environnement du script.
   *
   * @param {string} varloc - Nom de la variable.
   * @returns `true` si la variable existe.
   */
  hasVariant(varloc: string): boolean {
    return this.variants.hasOwnProperty(varloc);
  }

  /**
   * Obtient la valeur d'une variable du script.
   *
   * @param {string} varloc - Nom de la variable.
   * @returns La valeur enregistrée.
   * @throws Une erreur si la variable n'existe pas.
   */
  getVariant(varloc: string): any {
    if (!this.variants.hasOwnProperty(varloc)) {
      throw new Error('ScriptMachine::getVariant: varloc not exist in variants dictionnary');
    }

    return this.variants[varloc];
  }

  #waitPad(): void {
    this.setEnabled(false);
    document.addEventListener('keydown', (e) => e.key == 'Enter' ? this.setEnabled(true) : '', { once: true });
  }

  #goto(jumpto: string): string {
    return jumpto;
  }

  #gotoIf(varloc: string, cond: string, value: any, jumpto: string): string | null {
    if (CHECK_CONDITION(this.getVariant(varloc), cond, value)) {
      return jumpto;
    }

    return null;
  }

  #execIf(varloc: string, cond: string, value: any, cmd: { CommandName: string, CommandArgs: Array<any> } = { CommandName: '', CommandArgs: [] }): void {
    if (CHECK_CONDITION(this.getVariant(varloc), cond, value)) {
      this.runCommand(cmd['CommandName'], cmd['CommandArgs']);
    }
  }

  #varSet(varloc: string, value: any): void {
    this.setVariant(varloc, value);
  }

  #varAdd(varloc: string, value: any): void {
    const variant = this.getVariant(varloc);
    this.setVariant(varloc, variant + value);
  }

  #varSub(varloc: string, value: any): void {
    const variant = this.getVariant(varloc);
    this.setVariant(varloc, variant - value);
  }

  #delay(ms: number): void {
    this.setEnabled(false);
    window.setTimeout(() => this.setEnabled(true), ms);
  }
}

// -------------------------------------------------------------------------------------------
// HELPFUL
// -------------------------------------------------------------------------------------------

function CHECK_CONDITION(value1: any, cond: string, value2: any): boolean {
  return (cond == 'not equal' && value1 != value2) ||
         (cond == 'equal' && value1 == value2) ||
         (cond == 'is less than' && value1 < value2) ||
         (cond == 'is greater than' && value1 > value2);
}