/**
 * Composant de données destiné à une architecture entité-composant-système pure.
 */
export class DNAComponent {
  typename: string;

  /**
   * Crée un composant identifié par un nom de type.
   *
   * @param typename - Identifiant utilisé pour satisfaire les exigences des systèmes.
   */
  constructor(typename: string) {
    this.typename = typename;
  }

  /**
   * Retourne l'identifiant de type du composant.
   *
   * @returns Nom de type déclaré lors de la construction.
   */
  getTypename(): string {
    return this.typename;
  }
}