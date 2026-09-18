/** Vecteur à une composante. */
export type vec1 = Float32Array | Uint32Array | [number];

/** Vecteur à deux composantes. */
export type vec2 = Float32Array | Uint32Array | [number, number];

/** Vecteur à trois composantes. */
export type vec3 = Float32Array | Uint32Array | [number, number, number];

/** Vecteur à quatre composantes. */
export type vec4 = Float32Array | Uint32Array | [number, number, number, number];

/** Vecteur à cinq composantes. */
export type vec5 = Float32Array | Uint32Array | [number, number, number, number, number];

/** Vecteur à six composantes. */
export type vec6 = Float32Array | Uint32Array | [number, number, number, number, number, number];

/** Vecteur numérique de taille variable. */
export type vec_any = Array<number>;

/** Matrice carrée de dimension 3 × 3. */
export type mat3 = Float32Array | Uint32Array | [
  number, number, number,
  number, number, number,
  number, number, number
];

/** Matrice carrée de dimension 4 × 4. */
export type mat4 = Float32Array | Uint32Array | [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

/** Limites d'un rectangle aligné sur les axes. */
export type bounds2 = {left: number, right: number, bottom: number, top: number };

/** Limites d'une boîte alignée sur les axes. */
export type bounds3 = {left: number, right: number, bottom: number, top: number, back: number, front: number };
