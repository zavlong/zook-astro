/**
 * terrainNoise.ts
 * High-performance procedural noise & color utilities for 3D surface generation
 */

import { hexToRgb } from '../../../core/math/colorUtils';
export { hexToRgb };

// Texture bitflags
export const FLAG_WATER = 1;
export const FLAG_LAVA = 2;
export const FLAG_ICE_SPEC = 4;

export function hash2(x: number, y: number, seed: number): number {
  let h =
    Math.imul(x | 0, 374761393) +
    Math.imul(y | 0, 668265263) +
    Math.imul(seed | 0, 1274126177);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  // Quintic C2 smoothstep eliminates second-derivative kinks and square lattice lines
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);

  const n00 = hash2(ix, iy, seed);
  const n10 = hash2(ix + 1, iy, seed);
  const n01 = hash2(ix, iy + 1, seed);
  const n11 = hash2(ix + 1, iy + 1, seed);

  const nx0 = n00 + (n10 - n00) * ux;
  const nx1 = n01 + (n11 - n01) * ux;
  return nx0 + (nx1 - nx0) * uy;
}

/**
 * Dual-rotated isotropic 2D noise with zero axis-aligned square grid structure
 */
export function isotropicNoise2D(x: number, y: number, seed: number): number {
  const n1 = valueNoise2D(x, y, seed);
  const rx = x * 0.788 - y * 0.6156 + 13.7;
  const ry = x * 0.6156 + y * 0.788 - 9.3;
  const n2 = valueNoise2D(rx, ry, seed + 101);
  return (n1 + n2) * 0.5;
}

export function fbm2D(x: number, y: number, seed: number, octaves = 5): number {
  let val = 0;
  let amp = 0.5;
  let norm = 0;
  let rx = x;
  let ry = y;
  for (let i = 0; i < octaves; i++) {
    val += amp * valueNoise2D(rx, ry, seed + i * 31);
    norm += amp;
    // Rotate domain by ~36.87 deg between octaves so grid axes never align
    const nx = (rx * 0.8 - ry * 0.6) * 2.04 + 17.3;
    const ny = (rx * 0.6 + ry * 0.8) * 2.04 - 11.7;
    rx = nx;
    ry = ny;
    amp *= 0.5;
  }
  return val / (norm || 1);
}

export function ridgedFbm2D(x: number, y: number, seed: number, octaves = 5): number {
  let val = 0;
  let amp = 0.5;
  let norm = 0;
  let rx = x;
  let ry = y;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise2D(rx, ry, seed + i * 47);
    const centered = n * 2.0 - 1.0;
    const ridge = 1.0 - Math.sqrt(centered * centered + 0.0015);
    val += amp * ridge * ridge;
    norm += amp;
    const nx = (rx * 0.8 - ry * 0.6) * 2.12 + 23.1;
    const ny = (rx * 0.6 + ry * 0.8) * 2.12 - 14.9;
    rx = nx;
    ry = ny;
    amp *= 0.5;
  }
  return val / (norm || 1);
}

/**
 * Fast 2D cellular / Worley feature evaluator for craters, fractures, and surface structures
 */
export function cellularFeature2D(
  x: number,
  y: number,
  seed: number
): { dist: number; dx: number; dy: number; cellHash: number } {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let bestDistSq = 99.0;
  let bestDx = 0;
  let bestDy = 0;
  let bestHash = 0.5;

  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = ix + ox;
      const cy = iy + oy;
      const h1 = hash2(cx, cy, seed);
      const h2 = hash2(cx, cy, seed + 137);
      const px = cx + 0.18 + h1 * 0.64;
      const py = cy + 0.18 + h2 * 0.64;
      const dx = x - px;
      const dy = y - py;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestDx = dx;
        bestDy = dy;
        bestHash = h1;
      }
    }
  }
  return { dist: Math.sqrt(bestDistSq), dx: bestDx, dy: bestDy, cellHash: bestHash };
}
