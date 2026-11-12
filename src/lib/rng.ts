/** Deterministic pseudo-random helpers. No Math.random anywhere in the data engine. */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stateless noise in [0, 1) for a (key, step) pair. Same inputs → same output. */
export function noise(key: string, step: number): number {
  return mulberry32(hashString(key) ^ Math.imul(step + 1, 2654435761))();
}

/** Smooth-ish deterministic wobble in [-1, 1] for sensor-style signals. */
export function wobble(key: string, step: number): number {
  const a = noise(key, Math.floor(step / 4));
  const b = noise(key, Math.floor(step / 4) + 1);
  const f = (step % 4) / 4;
  const slow = a + (b - a) * f;
  const fast = noise(key + "~", step);
  return (slow * 0.75 + fast * 0.25) * 2 - 1;
}

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  float(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    float: (min, max) => next() * (max - min) + min,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}
