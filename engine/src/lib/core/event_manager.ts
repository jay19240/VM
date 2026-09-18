/**
 * Décrit un abonnement enregistré auprès du gestionnaire d'événements.
 */
export interface EventSubscriber {
  emitter: any;
  type: string;
  listener: any;
  once: boolean;
  cb: Function;
};

/**
 * Centralise les abonnements et l'émission d'événements applicatifs.
 */
export class EventManager {
  subscribers: Array<EventSubscriber>;

  /**
   * Crée un gestionnaire sans abonnement.
   */
  constructor() {
    this.subscribers = [];
  }

  /**
   * Attend la prochaine émission d'un événement donné.
   *
   * @param emitter - Objet émetteur.
   * @param type - Nom du type d'événement.
   * @returns Promesse résolue avec les données de la prochaine émission.
   */
  wait(emitter: any, type: string): Promise<any> {
    return new Promise(resolve => {
      this.subscribeOnce(emitter, type, this, (data: any) => {
        resolve(data);
      });
    });
  }

  /**
   * Enregistre un abonnement persistant.
   *
   * @param emitter - Objet émetteur.
   * @param type - Nom du type d'événement.
   * @param listener - Objet abonné, utilisé comme contexte du rappel.
   * @param cb - Fonction appelée à chaque émission.
   */
  subscribe(emitter: any, type: string, listener: any, cb: Function): void {
    this.subscribers.push({ emitter: emitter, type: type, listener: listener, once: false, cb: cb });
  }

  /**
   * Enregistre un abonnement supprimé après sa première invocation.
   *
   * @param emitter - Objet émetteur.
   * @param type - Nom du type d'événement.
   * @param listener - Objet abonné, utilisé comme contexte du rappel.
   * @param cb - Fonction appelée lors de la prochaine émission.
   */
  subscribeOnce(emitter: any, type: string, listener: any, cb: Function): void {
    this.subscribers.push({ emitter: emitter, type: type, listener: listener, once: true, cb: cb });
  }

  /**
   * Supprime l'abonnement correspondant à un émetteur, un type et un abonné.
   *
   * @param emitter - Objet émetteur.
   * @param type - Nom du type d'événement.
   * @param listener - Objet abonné à désinscrire.
   */
  unsubscribe(emitter: any, type: string, listener: any): void {
    for (let subscriber of this.subscribers) {
      if (subscriber.emitter == emitter && subscriber.type == type && subscriber.listener == listener) {
        this.subscribers.splice(this.subscribers.indexOf(subscriber), 1);
        return;
      }
    }
  }

  /**
   * Supprime tous les abonnements.
   */
  unsubscribeAll(): void {
    this.subscribers = [];
  }

  /**
   * Notifie les abonnés et attend la résolution de leurs rappels asynchrones.
   *
   * @param emitter - Objet émetteur.
   * @param type - Nom du type d'événement.
   * @param data - Données transmises aux rappels.
   * @returns Promesse résolue avec les résultats des rappels asynchrones.
   */
  async emitAsync(emitter: any, type: string, data: any = {}): Promise<any> {
    const promises: Array<Promise<any>> = [];

    for (const subscriber of this.subscribers.slice()) {
      if (subscriber.emitter == emitter && subscriber.type == type) {
        const res = subscriber.cb.call(subscriber.listener, data);
        if (res instanceof Promise) {
          promises.push(res);
        }

        if (subscriber.once) {
          this.subscribers.splice(this.subscribers.indexOf(subscriber), 1);
        }
      }
    }

    return Promise.all(promises);
  }

  /**
   * Notifie immédiatement tous les abonnés correspondants.
   *
   * @param emitter - Objet émetteur.
   * @param type - Nom du type d'événement.
   * @param data - Données transmises aux rappels.
   */
  emit(emitter: any, type: string, data: any = {}): void {
    for (const subscriber of this.subscribers.slice()) {
      if (subscriber.emitter == emitter && subscriber.type == type) {
        subscriber.cb.call(subscriber.listener, data);
        if (subscriber.once) {
          this.subscribers.splice(this.subscribers.indexOf(subscriber), 1);
        }
      }
    }
  }
}

export const eventManager = new EventManager();