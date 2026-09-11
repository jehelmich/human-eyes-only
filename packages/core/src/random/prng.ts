/**
 * Seeded PRNG. All randomness in the pipeline goes through here; a fixed seed
 * must reproduce a byte-identical transformation (CONTRIBUTING.md, invariant 5).
 *
 * `Math.random()` is banned in this package. It would make output
 * irreproducible, which costs us the ability to debug a report of a broken page
 * and the ability to diff two runs in the benchmark.
 */

/** Hashes a string into four 32-bit words. cyrb128. */
function hashSeed(seed: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }

  return [
    (h3 ^ (h1 >>> 18)) >>> 0,
    (h4 ^ (h2 >>> 22)) >>> 0,
    (h1 ^ (h3 >>> 17)) >>> 0,
    (h2 ^ (h4 >>> 19)) >>> 0,
  ];
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  bool(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates, in place. Returns the same array for convenience. */
  shuffle<T>(items: T[]): T[];
  /**
   * An independent stream for a named sub-purpose. Keeps one stage's draw count
   * from shifting every later stage's output, so adding a detector does not
   * reshuffle an unrelated run.
   */
  derive(label: string): Rng;
}

/** sfc32. Fast, small state, good enough for everything HEO does with it. */
export function createRng(seed: string): Rng {
  const [s0, s1, s2, s3] = hashSeed(seed);
  let a = s0;
  let b = s1;
  let c = s2;
  let d = s3;

  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };

  // sfc32 needs a warm-up before its output is well distributed.
  for (let i = 0; i < 12; i++) next();

  const rng: Rng = {
    next,
    int(maxExclusive) {
      if (maxExclusive <= 0) return 0;
      return Math.floor(next() * maxExclusive);
    },
    bool(probability) {
      return next() < probability;
    },
    pick(items) {
      if (items.length === 0) {
        throw new Error("createRng: cannot pick from an empty collection");
      }
      // Safe: the index is bounded by length and length is non-zero.
      return items[rng.int(items.length)] as (typeof items)[number];
    },
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const left = items[i] as (typeof items)[number];
        const right = items[j] as (typeof items)[number];
        items[i] = right;
        items[j] = left;
      }
      return items;
    },
    derive(label) {
      return createRng(`${seed} ${label}`);
    },
  };

  return rng;
}

/** Stable non-cryptographic digest, used for document keys and span ids. */
export function digest(input: string): string {
  const [h1, h2, h3, h4] = hashSeed(input);
  return (
    h1.toString(36).padStart(7, "0") +
    h2.toString(36).padStart(7, "0") +
    h3.toString(36).padStart(7, "0") +
    h4.toString(36).padStart(7, "0")
  );
}
