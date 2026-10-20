import { SpectralCategory, StarColorData } from '../../types/astrophysics';

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbTupleToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    clampByte(r).toString(16).padStart(2, '0') +
    clampByte(g).toString(16).padStart(2, '0') +
    clampByte(b).toString(16).padStart(2, '0')
  );
}

/**
 * Continuous blackbody & sub-stellar chromaticity from effective surface temperature (K),
 * calibrated so 6500 K = pure white (#ffffff / [255, 255, 255]).
 */
export function teffToRgb(Teff: number, isBrownDwarf: boolean = false): [number, number, number] {
  const T = Math.max(150, Number.isFinite(Teff) ? Teff : 5778);

  // Sub-stellar Brown Dwarf regime (L / T / Y sequence below 2250 K, or explicit BD flag < 2450 K)
  if (T < 2250 || (isBrownDwarf && T < 2450)) {
    if (T >= 1350) {
      // L-dwarf sequence (1350 K - 2250 K): glowing ember-crimson to deep ruby-magenta
      const w = Math.max(0, Math.min(1, (T - 1350) / (2250 - 1350)));
      return [
        clampByte(188 + 34 * w),
        clampByte(36 - 4 * w),
        clampByte(112 - 96 * w),
      ];
    }
    if (T >= 550) {
      // T-dwarf sequence (550 K - 1350 K): alkali/methane-broadened magenta to rich violet
      const w = Math.max(0, Math.min(1, (T - 550) / (1350 - 550)));
      return [
        clampByte(132 + 56 * w),
        clampByte(58 - 22 * w),
        clampByte(232 - 120 * w),
      ];
    }
    // Y-dwarf sequence (< 550 K): cool indigo-violet
    const w = Math.max(0, Math.min(1, (T - 180) / (550 - 180)));
    return [
      clampByte(82 + 50 * w),
      clampByte(72 - 14 * w),
      clampByte(238 - 6 * w),
    ];
  }

  // Exact 6500 K White Point
  if (Math.abs(T - 6500) < 1e-3) {
    return [255, 255, 255];
  }

  // Hotter than 6500 K (6500 K -> 50,000+ K): continuous Planckian Rayleigh-Jeans blue shift from white
  if (T > 6500) {
    const ratio = T / 6500;
    const r = clampByte(255 * Math.pow(ratio, -0.44));
    const g = clampByte(255 * Math.pow(ratio, -0.25));
    const b = 255;
    return [Math.max(115, r), Math.max(158, g), b];
  }

  // Cooler than 6500 K (2250 K -> 6500 K): continuous Planckian locus from ruby-red -> orange -> yellow -> 6500 K white
  const u = Math.max(0, Math.min(1, (T - 2250) / (6500 - 2250)));
  const r = T >= 3000 ? 255 : clampByte(222 + 33 * ((T - 2250) / 750));
  const g = clampByte(32 + 223 * Math.pow(u, 0.72));
  const b = clampByte(16 + 239 * Math.pow(u, 1.92));
  return [r, g, b];
}

/**
 * Returns hex color string (#rrggbb) directly from surface temperature Teff (6500 K = #ffffff).
 */
export function teffToHex(Teff: number, isBrownDwarf: boolean = false): string {
  const [r, g, b] = teffToRgb(Teff, isBrownDwarf);
  return rgbTupleToHex(r, g, b);
}

/**
 * Maps effective surface temperature (Kelvin) and evolutionary phase
 * to continuous astronomical blackbody color coordinates and visual halos (6500 K = white).
 */
export function getStarColorRGB(Teff: number, phase: string): StarColorData {
  if (phase.includes('Black Hole')) {
    return { r: 10, g: 10, b: 20, glow: 'rgba(168, 85, 247, 0.4)', hex: '#000000', cat: 'remnant' };
  }

  const isRemnant = phase.includes('Neutron Star') || phase.includes('White Dwarf') || phase.includes('Remnant');
  const isBD = phase.includes('Brown Dwarf');
  const [r, g, b] = teffToRgb(Teff, isBD);
  const hex = rgbTupleToHex(r, g, b);

  let cat: SpectralCategory = 'g';
  if (isRemnant) {
    cat = 'remnant';
  } else if (Teff >= 10000) {
    cat = 'ob';
  } else if (Teff >= 6000) {
    cat = 'af';
  } else if (Teff >= 5200) {
    cat = 'g';
  } else {
    cat = 'km';
  }

  const glowAlpha = isRemnant ? 0.78 : Teff >= 10000 ? 0.72 : Teff < 3900 ? 0.68 : 0.45;
  return {
    r,
    g,
    b,
    glow: `rgba(${r}, ${g}, ${b}, ${glowAlpha})`,
    hex,
    cat,
  };
}

