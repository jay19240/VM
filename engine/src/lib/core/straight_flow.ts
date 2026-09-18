import { eventManager } from './event_manager';

/**
 * Décision de navigation produite par une étape de flux.
 */
export enum StraightFlowState {
  CANCEL = 'CANCEL',
  CONTINUE = 'CONTINUE'
};

/**
 * Exécute une suite linéaire d'étapes pouvant avancer ou revenir en arrière.
 */
export class StraightFlow {
  entries: Array<StraightFlowEntry>;
  currentEntryIndex: number;

  /**
   * Crée un flux vide positionné avant sa première étape.
   */
  constructor() {
    this.entries = [];
    this.currentEntryIndex = 0;
  }

  /**
   * Met à jour l'étape courante et applique sa décision de navigation.
   *
   * @param ts - Temps écoulé depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number) {
    if (this.currentEntryIndex >= this.entries.length) {
      return;
    }

    const currentEntry = this.entries[this.currentEntryIndex];
    currentEntry.update(ts);

    if (currentEntry.state == StraightFlowState.CONTINUE) {
      const nextEntry = this.entries[this.currentEntryIndex + 1];
      if (nextEntry) {
        nextEntry.onEnter();
        currentEntry.onDelete();
        this.currentEntryIndex++;
      }

      if (this.currentEntryIndex >= this.entries.length) {
        eventManager.emit(this, 'E_FINISHED');
      }
    }

    if (currentEntry.state == StraightFlowState.CANCEL) {
      const previousEntry = this.entries[this.currentEntryIndex - 1];
      if (previousEntry) {
        previousEntry.onEnter();
        currentEntry.onDelete();
        this.currentEntryIndex--;
      }
    }
  }

  /**
   * Dessine l'étape courante.
   */
  draw() {
    const entry = this.entries[this.currentEntryIndex];
    entry.draw();
  }

  /**
   * Ajoute une étape à la fin du flux.
   *
   * @param entry - Étape à ajouter.
   */
  push(entry: StraightFlowEntry): void {
    this.entries.push(entry);
  }
}

/**
 * Définit le cycle de vie d'une étape de flux linéaire.
 */
export abstract class StraightFlowEntry {
  state: StraightFlowState | null;

  /**
   * Crée une étape sans décision de navigation initiale.
   */
  constructor() {
    this.state = null;
  }

  /**
   * Appelée lorsque l'étape devient active.
   */
  abstract onEnter(): void;

  /**
   * Appelée lorsque l'étape cesse d'être active.
   */
  abstract onDelete(): void;

  /**
   * Met à jour l'étape.
   *
   * @param ts - Temps écoulé depuis la mise à jour précédente, en millisecondes.
   */
  abstract update(ts: number): void;

  /**
   * Dessine l'étape.
   */
  abstract draw(): void;
}