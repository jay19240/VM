import { eventManager } from '../core/event_manager';
import { inputManager } from '../input/input_manager';
import { DNAComponent } from './dna_component';
import { DNASystem } from './dna_system';

type Constructor<T> = new (...args: any[]) => T;

/**
 * Gère les entités, leurs composants et les systèmes d'une architecture ECS pure.
 */
export class DNAManager {
  count: number;
  entities: Map<number, Map<string, DNAComponent>>;
  entitiesSet: Map<number, Set<string>>;
  systems: Array<DNASystem>;

  /**
   * Crée un gestionnaire vide et relaie les événements d'entrée à ses systèmes.
   */
  constructor() {
    this.count = 0;
    this.entities = new Map<number, Map<string, DNAComponent>>();
    this.entitiesSet = new Map<number, Set<string>>();
    this.systems = [];

    eventManager.subscribe(inputManager, 'E_ACTION', this, (data: any) => {
      for (let system of this.systems) {
        system.action(data.actionId);
      }
    });

    eventManager.subscribe(inputManager, 'E_ACTION_ONCE', this, (data: any) => {
      for (let system of this.systems) {
        system.actionOnce(data.actionId);
      }
    });

    eventManager.subscribe(inputManager, 'E_ACTION_RELEASED', this, (data: any) => {
      for (let system of this.systems) {
        system.actionReleased(data.actionId);
      }
    });
  }

  /**
   * Met à jour tous les systèmes.
   *
   * @param ts - Temps écoulé depuis la mise à jour précédente, en millisecondes.
   */
  update(ts: number): void {
    for (const system of this.systems) {
      system.update(ts);
    }
  }

  /**
   * Demande à tous les systèmes de dessiner leurs entités.
   */
  draw(): void {
    for (const system of this.systems) {
      system.draw();
    }
  }

  /**
   * Réinitialise les entités et installe une nouvelle liste de systèmes.
   *
   * @param systems - Systèmes à gérer.
   */
  setup(systems: Array<DNASystem>): void {
    this.count = 0;
    this.entities.clear();
    this.entitiesSet.clear();
    this.systems = systems;
  }

  /**
   * Supprime toutes les entités, tous les composants et tous les systèmes.
   */
  reset(): void {
    this.count = 0;
    this.entities.clear();
    this.entitiesSet.clear();
    this.systems = [];
  }

  /**
   * Crée une entité vide.
   *
   * @returns Identifiant unique de la nouvelle entité.
   */
  createEntity(): number {
    this.entities.set(this.count, new Map<string, DNAComponent>());
    this.entitiesSet.set(this.count, new Set<string>());
    return this.count++;
  }

  /**
   * Crée une entité munie de composants.
   *
   * @param components - Composants initiaux.
   * @returns Identifiant unique de la nouvelle entité.
   * @throws Une erreur si plusieurs composants possèdent le même type de constructeur.
   */
  createEntityWith(components: Array<DNAComponent>): number {
    this.entities.set(this.count, new Map<string, DNAComponent>());
    this.entitiesSet.set(this.count, new Set<string>());

    for (const component of components) {
      this.addComponent(this.count, component);
    }

    return this.count++;
  }

  /**
   * Supprime une entité et la détache de tous les systèmes.
   *
   * @param eid - Identifiant de l'entité.
   * @throws Une erreur si l'entité n'existe pas.
   */
  removeEntity(eid: number): void {
    const found = this.entities.get(eid);
    if (!found) {
      throw new Error('DNAManager::removeEntity(): Entity not found');
    }

    this.entities.delete(eid);
    this.entitiesSet.delete(eid);

    for (const system of this.systems) {
      if (system.hasEntity(eid)) {
        system.unbindEntity(eid);
      }
    }
  }

  /**
   * Indique si une entité existe.
   *
   * @param id - Identifiant de l'entité.
   * @returns `true` si l'entité est enregistrée.
   */
  hasEntity(id: number): boolean {
    return this.entities.has(id);
  }

  /**
   * Recherche les entités qui possèdent tous les composants demandés.
   *
   * @param components - Noms de constructeurs des composants requis.
   * @returns Identifiants des entités correspondantes.
   */
  query(components: Set<string>): Array<number> {
    const eids = Array<number>();

    for (let [eid, set] of this.entitiesSet) {
      let matching = true;

      for (const cname of components) {
        if (!set.has(cname)) {
          matching = false;
          break;
        }
      }

      if (matching) {
        eids.push(eid);
      }
    }

    return eids;
  }

  /**
   * Recherche toutes les entités qui possèdent un type de composant.
   *
   * @typeParam T - Type du composant recherché.
   * @param component - Constructeur du composant.
   * @returns Identifiants des entités correspondantes.
   */
  findEntities<T extends DNAComponent>(component: Constructor<T>): Array<number> {
    const eids = Array<number>();

    for (let [eid, set] of this.entitiesSet) {
      if (set.has(component.name)) {
        eids.push(eid);
      }
    }

    return eids;
  }

  /**
   * Recherche la première entité qui possède un type de composant.
   *
   * @typeParam T - Type du composant recherché.
   * @param component - Constructeur du composant.
   * @returns Identifiant de l'entité, ou `-1` si aucune ne correspond.
   */
  findEntity<T extends DNAComponent>(component: Constructor<T>): number {
    for (let [eid, set] of this.entitiesSet) {
      if (set.has(component.name)) {
        return eid;
      }
    }

    return -1;
  }

  /**
   * Ajoute un composant à une entité et met à jour ses liaisons aux systèmes.
   *
   * @param eid - Identifiant de l'entité.
   * @param component - Composant à ajouter.
   * @throws Une erreur si l'entité n'existe pas ou possède déjà ce type de composant.
   */
  addComponent(eid: number, component: DNAComponent): void {
    const components = this.entities.get(eid);
    const set = this.entitiesSet.get(eid);
    if (!components || !set) {
      throw new Error('DNAManager::addComponent(): Entity not found');
    }

    const found = components.has(component.constructor.name);
    if (found) {
      throw new Error('DNAManager::addComponent(): Entity already has ' + component.constructor.name);
    }

    components.set(component.constructor.name, component);
    set.add(component.constructor.name);

    for (const system of this.systems) {
      if (system.isMatchingComponentRequirements(components.values()) && !system.hasEntity(eid)) {
        system.bindEntity(eid);
      }
    }
  }

  /**
   * Retire un type de composant d'une entité et met à jour ses liaisons aux systèmes.
   *
   * @typeParam T - Type du composant à retirer.
   * @param eid - Identifiant de l'entité.
   * @param component - Constructeur du composant.
   * @throws Une erreur si l'entité ou le composant n'existe pas.
   */
  removeComponent<T extends DNAComponent>(eid: number, component: Constructor<T>): void {
    const components = this.entities.get(eid);
    const set = this.entitiesSet.get(eid);
    if (!components || !set) {
      throw new Error('DNAManager::removeComponent(): Entity not found');
    }

    const found = components.has(component.name);
    if (!found) {
      throw new Error('DNAManager::removeComponent(): Entity has not ' + component.name);
    }

    components.delete(component.name);
    set.delete(component.name);

    for (const system of this.systems) {
      if (!system.isMatchingComponentRequirements(components.values()) && system.hasEntity(eid)) {
        system.unbindEntity(eid);
      }
    }
  }

  /**
   * Retourne un composant d'une entité.
   *
   * @typeParam T - Type du composant attendu.
   * @param eid - Identifiant de l'entité.
   * @param component - Constructeur du composant.
   * @returns Instance du composant.
   * @throws Une erreur si l'entité ou le composant n'existe pas.
   */
  getComponent<T extends DNAComponent>(eid: number, component: Constructor<T>): T {
    const components = this.entities.get(eid);
    if (!components) {
      throw new Error('DNAManager::getComponent(): Entity not found');
    }

    const found = components.get(component.name);
    if (!found) {
      throw new Error('DNAManager::getComponent(): Entity has not ' + component.name);
    }

    return found as T;
  }

  /**
   * Parcourt tous les composants d'une entité.
   *
   * @param eid - Identifiant de l'entité.
   * @returns Itérateur sur les composants.
   * @throws Une erreur si l'entité n'existe pas.
   */
  getComponents(eid: number): IterableIterator<DNAComponent> {
    const components = this.entities.get(eid);
    if (!components) {
      throw new Error('DNAManager::getEntity(): Entity not found');
    }

    return components.values();
  }

  /**
   * Associe chaque entité à son composant d'un type donné.
   *
   * @typeParam T - Type du composant recherché.
   * @param component - Constructeur du composant.
   * @returns Table des composants indexés par identifiant d'entité.
   */
  getAllComponents<T extends DNAComponent>(component: Constructor<T>): Map<number, DNAComponent> {
    const res = new Map<number, DNAComponent>();

    for (const [eid, components] of this.entities.entries()) {
      const c = components.get(component.name);
      if (c) res.set(eid, c);
    }

    return res;
  }

  /**
   * Indique si une entité possède un type de composant.
   *
   * @typeParam T - Type du composant recherché.
   * @param eid - Identifiant de l'entité.
   * @param component - Constructeur du composant.
   * @returns `true` si le composant est présent.
   * @throws Une erreur si l'entité n'existe pas.
   */
  hasComponent<T extends DNAComponent>(eid: number, component: Constructor<T>): boolean {
    const set = this.entitiesSet.get(eid);
    if (!set) {
      throw new Error('DNAManager::hasComponent(): Entity not found');
    }

    return set.has(component.name);
  }

  /**
   * Retourne les systèmes gérés.
   *
   * @returns Référence vers la liste des systèmes.
   */
  getSystems(): Array<DNASystem> {
    return this.systems;
  }

  /**
   * Recherche les systèmes qui portent une étiquette.
   *
   * @param tag - Étiquette recherchée.
   * @returns Systèmes correspondants.
   */
  findSystems(tag: string): Array<DNASystem> {
    return this.systems.filter(s => s.hasTag(tag));
  }

  /**
   * Remplace un type de composant par une nouvelle instance.
   *
   * @typeParam T - Type du composant remplacé.
   * @param eid - Identifiant de l'entité.
   * @param oldComponent - Constructeur du composant à retirer.
   * @param newComponent - Composant de remplacement.
   * @throws Une erreur si l'entité n'existe pas ou si le nouveau composant est déjà présent.
   */
  replaceComponent<T extends DNAComponent>(eid: number, oldComponent: Constructor<T>, newComponent: DNAComponent): void {
    this.removeComponentIfExist(eid, oldComponent);
    this.addComponent(eid, newComponent);
  }

  /**
   * Retire un composant d'une entité s'il existe.
   *
   * @typeParam T - Type du composant à retirer.
   * @param eid - Identifiant de l'entité.
   * @param component - Constructeur du composant.
   * @returns `true` si le composant a été retiré.
   * @throws Une erreur si l'entité n'existe pas.
   */
  removeComponentIfExist<T extends DNAComponent>(eid: number, component: Constructor<T>): boolean {
    if (this.hasComponent(eid, component)) {
      this.removeComponent(eid, component);
      return true;
    }

    return false;
  }
}

export const dnaManager = new DNAManager();