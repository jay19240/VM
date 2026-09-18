/** Formes géométriques prises en charge par une entité du moteur. */
export enum EngineEntityShape {
  CUBE = 'CUBE',
  CYLINDER = 'CYLINDER',
  CIRCLE = 'CIRCLE',
  PLANE = 'PLANE',
  SPHERE = 'SPHERE',
  UNKNOWN = 'UNKNOWN'
};

/** Décrit une entité et ses propriétés spatiales chargées depuis un fichier ENT. */
export interface EngineEntity {
  name: string;
  type: string;
  shape: EngineEntityShape;
  position: vec3;
  rotation: vec3;
  scale: vec3;
  width: number;
  height: number;
  depth: number;
  radius: number;
  customParams: any;
};

/**
 * Charge de manière asynchrone les données JSON d'un fichier ENT et crée l'entité correspondante.
 *
 * @param {string} path - Chemin du fichier à charger.
 * @returns L'entité créée à partir des données du fichier.
 * @throws Une erreur si le fichier ne contient pas l'identifiant `ENT` attendu.
 */
export const createEntityFromFile = async (path: string): Promise<EngineEntity> => {
  const response = await fetch(path);
  const json = await response.json();

  if (!json.hasOwnProperty('Ident') || json['Ident'] != 'ENT') {
    throw new Error('EngineEntity::createFromFile(): File not valid !');
  }

  const customParams = new Array<{ name: string, value: number }>();
  for (const obj of json['CustomParams']) {
    customParams[obj['Name']] = obj['Value']
  }

  return {
    name: json['Name'],
    type: json['Type'],
    shape: json['Shape'],
    position: [json['PositionX'], json['PositionY'], json['PositionZ']],
    rotation: [json['RotationX'], json['RotationY'], json['RotationZ']],
    scale: [json['ScaleX'], json['ScaleY'], json['ScaleZ']],
    width: json['Width'],
    height: json['Height'],
    depth: json['Depth'],
    radius: json['Radius'],
    customParams: customParams
  }
}