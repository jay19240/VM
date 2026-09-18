import { DNAComponent } from './dna_component';

/**
 * Système d'une architecture ECS pure, piloté par les composants de ses entités.
 *
 * @remarks
 * Les méthodes `on…` constituent des points d'extension destinés aux classes dérivées.
 */
export class DNASystem {
  eids: Array<number>;
  requiredComponentTypenames: Set<string>;
  paused: boolean;
  tags: Array<string>;

  /**
   * Crée un système sans entité ni exigence de composant.
   *
   * @param tags - Étiquettes associées au système.
   */
  constructor(tags = []) {
    this.eids = new Array<number>();
    this.requiredComponentTypenames = new Set<string>();
    this.paused = false;
    this.tags = tags;
  }

  /**
   * Exécute le cycle de mise à jour du système, sauf s'il est en pause.
   *
   * @param ts - Temps écoulé depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number): void {
    if (this.paused) {
      return;
    }

    this.onBeforeUpdate(ts);

    for (const eid of this.eids) {
      this.onEntityUpdate(ts, eid);
    }

    this.onAfterUpdate(ts);
  }

  /**
   * Exécute le cycle de dessin du système.
   */
  draw(): void {
    this.onBeforeDraw();

    for (const eid of this.eids) {
      this.onEntityDraw(eid);
    }

    this.onAfterDraw();
  }

  /**
   * Exécute le cycle de rendu, identique au cycle de dessin.
   */
  render(): void {
    this.onBeforeDraw();

    for (const eid of this.eids) {
      this.onEntityDraw(eid);
    }

    this.onAfterDraw();
  }

  /**
   * Transmet une action continue à chaque entité du système.
   *
   * @param actionId - Identifiant de l'action défini par le gestionnaire d'entrées.
   */
  action(actionId: string): void {
    for (const eid of this.eids) {
      this.onAction(actionId, eid);
    }
  }

  /**
   * Transmet le déclenchement ponctuel d'une action à chaque entité.
   *
   * @param actionId - Identifiant de l'action défini par le gestionnaire d'entrées.
   */
  actionOnce(actionId: string): void {
    for (const eid of this.eids) {
      this.onActionOnce(actionId, eid);
    }
  }

  /**
   * Transmet le relâchement d'une action à chaque entité.
   *
   * @param actionId - Identifiant de l'action défini par le gestionnaire d'entrées.
   */
  actionReleased(actionId: string): void {
    for (const eid of this.eids) {
      this.onActionReleased(actionId, eid);
    }
  }

  /**
   * Lie une entité au système.
   *
   * @param eid - Identifiant de l'entité.
   * @throws Une erreur si l'entité est déjà liée.
   */
  bindEntity(eid: number): void {
    if (this.eids.indexOf(eid) != -1) {
      throw new Error('DNASystem::bindEntity(): Entity already exist in this system');
    }

    this.eids.push(eid);
    this.onEntityBind(eid);
  }

  /**
   * Détache une entité du système.
   *
   * @param eid - Identifiant de l'entité.
   * @throws Une erreur si l'entité n'est pas liée.
   */
  unbindEntity(eid: number): void {
    if (this.eids.indexOf(eid) == -1) {
      throw new Error('DNASystem::unbindEntity(): Entity not exist in this system');
    }

    this.eids.splice(this.eids.indexOf(eid), 1);
    this.onEntityUnbind(eid);
  }

  /**
   * Indique si une entité est liée au système.
   *
   * @param eid - Identifiant de l'entité.
   * @returns `true` si l'entité est liée.
   */
  hasEntity(eid: number): boolean {
    return this.eids.indexOf(eid) != -1;
  }

  /**
   * Ajoute un type de composant requis pour lier une entité au système.
   *
   * @param typename - Identifiant du type de composant.
   * @throws Une erreur si cette exigence existe déjà.
   */
  addRequiredComponentTypename(typename: string): void {
    if (this.requiredComponentTypenames.has(typename)) {
      throw new Error('DNASystem::addRequiredComponentTypename(): Required typename already set in this system');
    }

    this.requiredComponentTypenames.add(typename);
  }

  /**
   * Vérifie qu'un ensemble de composants satisfait toutes les exigences du système.
   *
   * @param components - Composants de l'entité à vérifier.
   * @returns `true` si tous les types requis sont présents.
   */
  isMatchingComponentRequirements(components: IterableIterator<DNAComponent>): boolean {
    let numRequiredComponents = this.requiredComponentTypenames.size;
    let numMatchingComponents = 0;

    for (const component of components) {
      if (this.requiredComponentTypenames.has(component.getTypename())) {
        numMatchingComponents++;
      }
    }

    return numMatchingComponents == numRequiredComponents;
  }

  /**
   * Met en pause le cycle de mise à jour.
   */
  pause(): void {
    this.paused = true;
  }

  /**
   * Reprend le cycle de mise à jour.
   */
  resume(): void {
    this.paused = false;
  }

  /**
   * Retourne les étiquettes du système.
   *
   * @returns Référence vers la liste des étiquettes.
   */
  getTag(): Array<string> {
    return this.tags;
  }

  /**
   * Indique si le système porte une étiquette.
   *
   * @param tag - Étiquette recherchée.
   * @returns `true` si l'étiquette est présente.
   */
  hasTag(tag: string): boolean {
    return this.tags.indexOf(tag) != -1;
  }

  /**
   * Point d'extension appelé lorsqu'une action continue concerne une entité.
   *
   * @param actionId - Identifiant de l'action.
   * @param eid - Identifiant de l'entité.
   */
  onAction(actionId: string, eid: number): void {}

  /**
   * Point d'extension appelé lors du déclenchement ponctuel d'une action.
   *
   * @param actionId - Identifiant de l'action.
   * @param eid - Identifiant de l'entité.
   */
  onActionOnce(actionId: string, eid: number): void {}

  /**
   * Point d'extension appelé lors du relâchement d'une action.
   *
   * @param actionId - Identifiant de l'action.
   * @param eid - Identifiant de l'entité.
   */
  onActionReleased(actionId: string, eid: number): void {}

  /**
   * Point d'extension appelé avant la mise à jour des entités.
   *
   * @param ts - Temps écoulé, en millisecondes.
   */
  onBeforeUpdate(ts: number): void {}

  /**
   * Point d'extension appelé pour chaque entité pendant sa mise à jour.
   *
   * @param ts - Temps écoulé, en millisecondes.
   * @param eid - Identifiant de l'entité.
   */
  onEntityUpdate(ts:number, eid: number): void {}

  /**
   * Point d'extension appelé après la mise à jour des entités.
   *
   * @param ts - Temps écoulé, en millisecondes.
   */
  onAfterUpdate(ts: number): void {}

  /**
   * Point d'extension appelé avant le dessin des entités.
   */
  onBeforeDraw(): void {}

  /**
   * Point d'extension appelé pour chaque entité pendant son dessin.
   *
   * @param eid - Identifiant de l'entité.
   */
  onEntityDraw(eid: number): void {}

  /**
   * Point d'extension appelé après le dessin des entités.
   */
  onAfterDraw(): void {}

  /**
   * Point d'extension appelé lorsqu'une entité est liée.
   *
   * @param eid - Identifiant de l'entité.
   */
  onEntityBind(eid: number): void {}

  /**
   * Point d'extension appelé lorsqu'une entité est détachée.
   *
   * @param eid - Identifiant de l'entité.
   */
  onEntityUnbind(eid: number): void {}
}