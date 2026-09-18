/**
 * Contrat d'un objet pouvant être dupliqué et géré par un pool.
 *
 * @typeParam T - Type produit par le clonage.
 */
export interface Poolable<T> {
  /**
   * Crée une instance indépendante de l'objet.
   *
   * @returns Nouvelle instance destinée au pool.
   */
  clone(): T;
  /**
   * Libère facultativement les ressources détenues par l'objet.
   */
  delete?(): void;
};

interface Instance<T> {
  id: number;
  object: Poolable<T>;
  used: boolean;
};

/**
 * Préalloue et réutilise des clones d'un objet afin de stabiliser les performances.
 *
 * @typeParam T - Type des objets du pool.
 */
export class ObjectPool<T extends Poolable<T>> {
  instances: Array<Instance<T>>;
  reset: (object: Poolable<T>) => void;

  /**
   * Crée un pool de clones réinitialisés et disponibles.
   *
   * @param originObject - Objet servant de modèle au clonage.
   * @param numInstances - Nombre d'instances à préallouer.
   * @param reset - Fonction appelée pour réinitialiser une instance.
   */
  constructor(originObject: T, numInstances: number, reset: (object: Poolable<T>) => {}) {
    this.instances = [];
    this.reset = reset;

    for (let i = 0; i < numInstances; i++) {
      const clone = originObject.clone();
      this.reset(clone);
      this.instances.push({ object: clone, used: false, id: i + 1 });
    }
  }

  /**
   * Libère les ressources détenues par toutes les instances qui proposent `delete`.
   */
  delete(): void {
    for (const instance of this.instances) {
      if (instance.object.delete) {
        instance.object.delete();
      }
    }
  }

  /**
   * Réserve une instance disponible après l'avoir réinitialisée.
   *
   * @returns Instance réservée, ou `null` si elles sont toutes utilisées.
   */
  acquire(): Poolable<T> | null {
    for (const instance of this.instances) {
      if (!instance.used) {
        this.reset(instance.object);
        instance.used = true;
        return instance.object;
      }
    }

    return null;
  }

  /**
   * Rend une instance de nouveau disponible.
   *
   * @param object - Instance à libérer.
   * @throws Une erreur si l'instance n'appartient pas au pool.
   */
  dispose(object: Poolable<T>): void {
    const found = this.instances.find(i => i.object == object);
    if (!found) {
      throw new Error('ObjectPool::dispose(): Object not found !');
    }

    found.used = false;
  }

  /**
   * Appelle une fonction pour chaque instance du pool.
   *
   * @param cb - Fonction appelée avec chaque instance.
   */
  foreach(cb: (object: Poolable<T>) => {}): void {
    for (const instance of this.instances) {
      cb(instance.object);
    }
  }
}