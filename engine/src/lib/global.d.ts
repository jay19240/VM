/// <reference types="@webgpu/types" />
import type * as Types from './types';

declare global {
  /** Vecteur global à une composante. */
  type vec1 = Types.vec1;
  /** Vecteur global à deux composantes. */
  type vec2 = Types.vec2;
  /** Vecteur global à trois composantes. */
  type vec3 = Types.vec3;
  /** Vecteur global à quatre composantes. */
  type vec4 = Types.vec4;
  /** Vecteur global à cinq composantes. */
  type vec5 = Types.vec5;
  /** Vecteur global à six composantes. */
  type vec6 = Types.vec6;
  /** Vecteur numérique global de taille variable. */
  type vec_any = Types.vec_any;
  /** Matrice globale de dimension 3 × 3. */
  type mat3 = Types.mat3;
  /** Matrice globale de dimension 4 × 4. */
  type mat4 = Types.mat4;
  /** Limites globales d'un rectangle aligné sur les axes. */
  type bounds2 = Types.bounds2;
  /** Limites globales d'une boîte alignée sur les axes. */
  type bounds3 = Types.bounds3;
}

export {};