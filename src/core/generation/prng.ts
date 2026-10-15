/**
 * Seeded Lehmer (Park-Miller) multiplicative linear congruential pseudo-random number generator
 * S_{n+1} = (S_n * 16807) mod (2^31 - 1)
 */
export class PRNG {
  private s: number;

  constructor(seed = 4289) {
    this.s = seed % 2147483647;
    if (this.s <= 0) this.s += 2147483646;
  }

  /**
   * Returns a pseudo-random floating point number in [0, 1)
   */
  next(): number {
    this.s = (this.s * 16807) % 2147483647;
    return (this.s - 1) / 2147483646;
  }

  /**
   * Generates normally-distributed Gaussian variates via the Box-Muller transform
   */
  nextGaussian(mean = 0, stdev = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * stdev;
  }
}

/**
 * Computes a deterministic positive 31-bit integer seed from a string or number ID
 */
export function seedFromId(id: string | number): number {
  if (typeof id === 'number') {
    const num = Math.floor(Math.abs(id)) % 2147483647;
    return num === 0 ? 4289 : num;
  }
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const positiveHash = (hash >>> 0) % 2147483647;
  return positiveHash === 0 ? 4289 : positiveHash;
}

