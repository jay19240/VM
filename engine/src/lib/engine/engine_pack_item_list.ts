/**
 * Décrit une ressource stockée dans un pack du moteur.
 *
 * @typeParam T - Type de la ressource chargée.
 */
export interface EnginePackItem<T> {
  name: string;
  ext: string;
  object: T;
  blobUrl: string;
};

/**
 * Collection de ressources d'un pack, indexées par leur nom.
 *
 * @typeParam T - Type des ressources contenues dans la collection.
 */
export class EnginePackItemList<T> extends Map<string, EnginePackItem<T>> {
  /**
   * Crée une collection de ressources vide.
   */
  constructor() {
    super();
  }

  /**
   * Renvoie la ressource associée à un nom.
   *
   * @param name - Nom de la ressource recherchée.
   * @returns La ressource correspondante.
   * @throws Une erreur si aucune ressource ne porte ce nom.
   */
  getObject(name: string): T {
    const item = this.get(name);
    if (!item) {
      throw new Error('EnginePack::EnginePackItemList::getObject(): item not found !');
    }

    return item.object;
  }

  /**
   * Renvoie la première ressource dont le nom correspond à une expression régulière.
   *
   * @param regex - Expression régulière appliquée aux noms des ressources.
   * @returns La première ressource correspondante.
   * @throws Une erreur si aucun nom ne correspond à l'expression.
   */
  findWithRegex(regex: RegExp): T {
    for (const item of this.values()) {
      if (regex.test(item.name)) {
        return item.object;
      }
    }

    throw new Error(`EnginePackItemList::findWithRegex(): No match for ${regex}`);
  }
}