/** Seedable PRNG and resampling for the bootstrap. */

/**
 * mulberry32: fast 32-bit seedable PRNG returning floats in [0, 1).
 * Deterministic within semints; NOT identical to R's Mersenne-Twister —
 * exact R parity requires injecting an index matrix (see bootstrapModel).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Produces the 0-based row indices for one bootstrap replication. */
export type Resampler = (n: number, replication: number) => number[];

/** Default resampler: n draws with replacement, seeded per replication. */
export function defaultResampler(seed: number): Resampler {
  return (n, replication) => {
    const rand = mulberry32(seed + replication);
    return Array.from({ length: n }, () => Math.floor(rand() * n));
  };
}
