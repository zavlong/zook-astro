import { PRNG, seedFromId } from './prng';

export type GalaxyMorphology =
  | 'spiral'
  | 'barred-spiral'
  | 'elliptical'
  | 'lenticular'
  | 'ring'
  | 'irregular';

export interface GalaxyConfig {
  seed: number;
  name: string;
  morphology: GalaxyMorphology;
  columns: number; // 50
  rows: number; // 50
  radiusKpc: number; // 10 to 50 kpc (50 kpc fills entire grid, 25 kpc extends halfway out)
  coreRadiusFraction: number; // 0.10 to 0.30
  armCount: number; // 2, 3, 4, or 6
  armWinding: number; // Spiral pitch / tightness (0.5 to 5.0)
  armWidth: number; // Width of spiral arms (0.3 to 2.5, default 1.0)
  armStrength: number; // Density multiplier for spiral arms (0.2 to 3.0, default 1.0)
  overallDensityScale: number; // 0.5 to 3.0
}

export interface GalaxyGiantStar {
  id: string;
  relX: number; // offset from hex center in pixels (-hexRadius to +hexRadius)
  relY: number; // offset from hex center in pixels (-hexRadius to +hexRadius)
  mass: number; // 10 to 50 M_sun
  spectralType: string;
  spectralCat: 'ob' | 'af' | 'g' | 'km' | 'remnant';
  colorHex: string;
  glowColor: string;
  size: number;
}

export interface GalaxySectorHex {
  col: number; // 1 to 50
  row: number; // 1 to 50
  coord: string; // "2525"
  name: string;
  seed: number; // Seed passed to SectorHex
  seedString: string; // e.g. "GAL-4289-SEC-2525"
  rNorm: number; // Normalized radial distance (0 = core, 1.0 = edge of galaxy disk)
  rKpc: number; // Distance from core in kiloparsecs
  thetaRad: number; // Polar angle in radians
  density: number; // 0.0 to 3.5 (supports >100% overdensities)
  meanAge: number; // Mean stellar age in Gyr
  ageRange: number; // Total age spread in Gyr (narrow in halo, wide uniform in bulge)
  ageDistribution: 'normal' | 'uniform'; // Galactic bulge has uniform distribution
  ageMin: number;
  ageMax: number;
  metallicityMean: number; // -1.6 to +0.45 dex
  colorHex: string; // Bluer for young, redder for old
  opacity: number; // More opaque for dense, transparent for sparse
  region: string; // "Galactic Bulge", "Spiral Arm Ridge", "Inter-arm Disk", etc.
  estimatedStars50x50: number; // Stars if generated at 50x50
  giantStars: GalaxyGiantStar[]; // Giant star systems (mass 10 to 50 M_sun)
  hasNebula: boolean; // True if young sector (<1.0 Gyr) contains an active purple-red emission nebula
  nebulaName?: string; // Procedural nebula complex designation
}

export interface GalaxyGridData {
  config: GalaxyConfig;
  sectors: GalaxySectorHex[];
  stats: {
    totalSectors: number;
    activeSectors: number;
    avgDensity: number;
    avgAge: number;
    avgMetallicity: number;
    totalEstimatedStars: number;
    nebulaCount: number;
  };
}

export const DEFAULT_GALAXY_CONFIG: GalaxyConfig = {
  seed: 4289,
  name: 'Orion-Perseus Galaxy',
  morphology: 'spiral',
  columns: 50,
  rows: 50,
  radiusKpc: 35,
  coreRadiusFraction: 0.16,
  armCount: 4,
  armWinding: 1.5,
  armWidth: 1.0,
  armStrength: 1.0,
  overallDensityScale: 1.0,
};

import {
  desaturateToWhite,
  hexToRgbObj as hexToRgb,
  rgbToHex,
} from '../math/colorUtils';
export { desaturateToWhite, hexToRgb, rgbToHex };

/**
 * Computes the sector's integrated color as a luminosity-weighted average of its constituent stars.
 * Reflects both mean age and age distribution (uniform in bulge, narrow in halo/arms).
 */
export function computeSectorConstituentColor(
  secSeed: number,
  meanAge: number,
  ageRange: number = 2.0,
  ageDistribution: 'normal' | 'uniform' = 'normal',
  metallicityMean: number = 0.0,
  density: number = 0.5
): string {
  // Fast exit for near-empty outer halo/void sectors
  if (density < 0.025) {
    return getSectorColorByAge(meanAge, density);
  }
  const secRng = new PRNG(secSeed);
  const nSamples = 14;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let totalWeight = 0;

  for (let i = 0; i < nSamples; i++) {
    // 1. Progenitor mass with density overflow
    const u = secRng.next();
    let mass: number;
    const overflow = Math.max(0, density - 1.0);
    const heavyStarChance = Math.min(0.82, 0.10 + overflow * 0.30);

    if (overflow > 0 && secRng.next() < heavyStarChance) {
      mass = 3.8 + Math.pow(secRng.next(), 1.2) * (18.0 + overflow * 22.0);
    } else {
      if (u < 0.08) mass = 0.08 + (u * 0.04) / 0.08;
      else if (u < 0.58) mass = 0.12 + Math.pow((u - 0.08) / 0.5, 1.4) * 0.38;
      else if (u < 0.88) mass = 0.50 + Math.pow((u - 0.58) / 0.3, 1.2) * 0.75;
      else if (u < 0.97) mass = 1.25 + Math.pow((u - 0.88) / 0.09, 1.3) * 1.55;
      else mass = 2.8 + Math.pow((u - 0.97) / 0.03, 2.0) * 22.2;

      if (overflow > 0) mass *= 1.0 + overflow * 1.45;
    }

    // 2. Star Age based on sector age distribution (with wider multi-epoch spread)
    let starAge: number;
    if (ageDistribution === 'uniform') {
      starAge = Math.max(0.08, Math.min(12.8, meanAge + (secRng.next() - 0.5) * ageRange));
    } else {
      const sigma = Math.max(0.3, ageRange / 2.2);
      if (secRng.next() < 0.28) {
        starAge = Math.max(0.08, Math.min(12.8, meanAge + (secRng.next() - 0.5) * ageRange));
      } else {
        starAge = Math.max(0.08, Math.min(12.8, meanAge + secRng.nextGaussian(0, sigma)));
      }
    }

    const feh = Math.max(-1.8, Math.min(0.5, metallicityMean + secRng.nextGaussian(0, 0.12)));

    // 3. Stellar Evolution: Optical Luminosity and Teff
    let lum = 1.0;
    let Teff = 5778;

    if (mass < 0.075) {
      lum = 2e-5 * Math.pow(mass / 0.05, 2.6);
      Teff = 1800;
    } else {
      let Lz = mass < 0.43 ? 0.23 * Math.pow(mass, 2.3) : mass < 2.0 ? 0.7 * Math.pow(mass, 4.0) : 1.15 * Math.pow(mass, 3.5);
      let Rz = mass < 0.43 ? Math.pow(mass, 0.85) : mass < 2.0 ? 0.89 * Math.pow(mass, 0.82) : 0.92 * Math.pow(mass, 0.62);
      const rW = Math.exp(-Math.pow(Math.log10(mass) / 0.45, 2));
      Lz *= Math.pow(10, -0.18 * feh * rW);
      Rz *= Math.pow(10, 0.06 * feh);

      const tMS = Math.max(0.004, Math.min(5000.0, 10.0 * (mass / Lz) * Math.pow(mass, 1.35)));
      const tau = starAge / tMS;

      if (tau > 1.15) {
        // Remnant
        if (mass < 8.0) {
          const tc = Math.max(0.005, starAge - 1.15 * tMS);
          lum = 0.08 * Math.pow(tc, -1.4);
          Teff = 12000;
        } else {
          lum = 1e-5;
          Teff = 90000;
        }
      } else if (tau <= 1.0) {
        // Main sequence
        lum = Lz * (1.0 + 0.42 * tau + 0.32 * tau * tau);
        const rad = Rz * (1.0 + 0.25 * tau + 0.14 * Math.pow(tau, 3));
        Teff = (5778.0 * Math.pow(lum, 0.25)) / Math.sqrt(rad);
      } else {
        // Giant branch (Red Giant)
        const f2 = Math.min(1.0, (tau - 1.05) / 0.1);
        lum = Lz * 2.35 * Math.pow(35.0, f2);
        Teff = Math.max(3100, Math.min(4800, 4600 - 1200 * f2));
      }
    }

    // 4. Teff to blackbody RGB color
    let r = 255, g = 255, b = 255;
    if (Teff >= 25000) { r = 155; g = 176; b = 255; }
    else if (Teff >= 10000) { r = 170; g = 191; b = 255; }
    else if (Teff >= 7400) { r = 202; g = 215; b = 255; }
    else if (Teff >= 6000) { r = 248; g = 247; b = 255; }
    else if (Teff >= 5200) { r = 255; g = 244; b = 234; }
    else if (Teff >= 3850) { r = 255; g = 170; b = 85; }
    else if (Teff >= 3000) { r = 255; g = 68; b = 56; }
    else if (Teff >= 2200) { r = 230; g = 25; b = 25; }
    else { r = 200; g = 16; b = 46; }

    // 5. Weight color by optical luminosity
    const weight = Math.max(1e-4, lum);
    sumR += weight * r;
    sumG += weight * g;
    sumB += weight * b;
    totalWeight += weight;
  }

  if (totalWeight <= 0) return '#60a5fa';
  const avgR = Math.round(sumR / totalWeight);
  const avgG = Math.round(sumG / totalWeight);
  const avgB = Math.round(sumB / totalWeight);
  let hex = rgbToHex(avgR, avgG, avgB);

  // Overdensity desaturation towards white
  if (density > 1.0) {
    const desatFactor = Math.min(0.96, Math.pow((density - 1.0) / 2.0, 0.85) * 0.95);
    hex = desaturateToWhite(hex, desatFactor);
  }

  return hex;
}

/**
 * Maps sector mean age and density to color (simple lookup fallback):
 */
export function getSectorColorByAge(ageGyr: number, density: number = 0.5): string {
  let baseColor: string;
  if (ageGyr < 1.2) baseColor = '#00d2ff'; // Extremely young starburst bright cyan
  else if (ageGyr < 2.0) baseColor = '#38bdf8'; // Young spiral arm sky blue
  else if (ageGyr < 3.2) baseColor = '#60a5fa'; // Blue-white young population
  else if (ageGyr < 4.8) baseColor = '#facc15'; // Intermediate solar golden yellow
  else if (ageGyr < 6.8) baseColor = '#fb923c'; // Mature disk warm orange
  else if (ageGyr < 8.8) baseColor = '#ef4444'; // Older population rich red
  else baseColor = '#dc2626'; // Ancient halo / core deep crimson

  // Densities exceeding 100% (1.0) desaturate towards white
  if (density > 1.0) {
    const desatFactor = Math.min(0.96, Math.pow((density - 1.0) / 2.0, 0.85) * 0.95);
    return desaturateToWhite(baseColor, desatFactor);
  }

  return baseColor;
}

/**
 * Maps sector stellar density to opacity with a smooth gradual fade towards outer edges:
 */
export function getSectorOpacityByDensity(density: number): number {
  if (density <= 0.015) return 0.02; // Very faint whisper in outer void
  const scaled = Math.min(1.0, density / 0.85);
  const opacity = 0.03 + 0.93 * Math.pow(scaled, 1.25);
  return +Math.min(0.98, Math.max(0.02, opacity)).toFixed(3);
}

/**
 * Generates an evocative region designation based on morphology, radius and position
 */
function getRegionName(
  morphology: GalaxyMorphology,
  rNorm: number,
  density: number,
  isArm: boolean
): string {
  if (density >= 2.0) return 'Hyper-Dense Stellar Nexus';
  if (density >= 1.15) return 'Massive Starburst Overdensity';
  if (rNorm > 1.25 && density < 0.04) return 'Intergalactic Void';
  if (rNorm > 0.92) return 'Galactic Halo Fringe';
  if (rNorm < 0.16) return 'Galactic Core Bulge';

  if (morphology === 'spiral' || morphology === 'barred-spiral') {
    if (isArm && density > 0.40) return 'Spiral Arm Starburst';
    if (isArm) return 'Spiral Arm Ridge';
    if (rNorm < 0.45) return 'Inner Galactic Disk';
    return 'Inter-Arm Disk';
  }

  if (morphology === 'ring') {
    if (Math.abs(rNorm - 0.72) < 0.15) return 'Collisional Starburst Ring';
    if (rNorm < 0.35) return 'Nuclear Core';
    return 'Outer Ring Void';
  }

  if (morphology === 'elliptical') {
    if (rNorm < 0.35) return 'Spheroidal Core';
    if (rNorm < 0.75) return 'Dense Elliptical Mantle';
    return 'Diffuse Stellar Envelope';
  }

  if (morphology === 'irregular') {
    if (density > 0.45) return 'Turbulent Starburst Knot';
    return 'Chaotic Tidal Stream';
  }

  return 'Outer Rim Expanse';
}

/**
 * Generates the full 50x50 Galaxy Grid with physical radius scaling, gradual edge fading,
 * spiral arm width/strength parameters, and dual mean-age + age-range astrophysics.
 */
/**
 * Generates giant star systems (mass 10 to 50 M_sun) inside a hex.
 * Number of giant systems = floor(density in percent / 10).
 * Positioned randomly within the pointy-topped hexagon.
 */
export function generateGalaxyGiantStars(
  density: number,
  _meanAge: number,
  seed: number | string,
  hexRadius: number = 26
): GalaxyGiantStar[] {
  const densityPct = Math.round(density * 100);
  const count = Math.floor(densityPct / 10);
  if (count <= 0) return [];

  const rng = new PRNG(seedFromId(`GIANT-${seed}-${count}`));
  const stars: GalaxyGiantStar[] = [];

  // Pointy-topped hexagon bounds (slightly inset to stay strictly inside border)
  const maxW = (Math.sqrt(3) / 2) * hexRadius * 0.80;
  const maxH = hexRadius * 0.80;

  for (let i = 0; i < count; i++) {
    // 1. Mass between 10 and 50 times solar
    const mass = +(10.0 + rng.next() * 40.0).toFixed(1);

    // 2. Random point inside pointy-topped hex: |y| <= R - |x| / sqrt(3)
    let relX = 0;
    let relY = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      const rx = (rng.next() * 2 - 1) * maxW;
      const ry = (rng.next() * 2 - 1) * maxH;
      if (Math.abs(ry) <= (hexRadius * 0.80) - Math.abs(rx) / Math.sqrt(3)) {
        relX = +rx.toFixed(1);
        relY = +ry.toFixed(1);
        break;
      }
    }

    // 3. Spectral type, color, and phase based on mass & evolutionary stage
    const roll = rng.next();
    let spectralType: string;
    let spectralCat: 'ob' | 'af' | 'g' | 'km' | 'remnant';
    let colorHex: string;
    let glowColor: string;
    let size: number;

    if (roll < 0.55) {
      // Hot Main Sequence O/B Giants & Supergiants
      if (mass >= 28) {
        spectralType = `O${Math.floor(rng.next() * 6 + 3)}Ia`;
        spectralCat = 'ob';
        colorHex = '#93c5fd';
        glowColor = '#38bdf8';
        size = 1.6;
      } else {
        spectralType = `B${Math.floor(rng.next() * 8)}Ib`;
        spectralCat = 'ob';
        colorHex = '#bae6fd';
        glowColor = '#60a5fa';
        size = 1.4;
      }
    } else if (roll < 0.78) {
      // Luminous Evolved Red / Yellow / Blue Supergiants
      const subRoll = rng.next();
      if (subRoll < 0.55) {
        // Red Supergiant (like Betelgeuse or Antares)
        spectralType = `M${Math.floor(rng.next() * 4)}Ia Red Supergiant`;
        spectralCat = 'km';
        colorHex = '#f87171';
        glowColor = '#ef4444';
        size = 1.8;
      } else if (subRoll < 0.80) {
        // Luminous Blue Variable (LBV, like Eta Carinae)
        spectralType = `LBV Hypergiant`;
        spectralCat = 'ob';
        colorHex = '#22d3ee';
        glowColor = '#06b6d4';
        size = 1.9;
      } else {
        // Yellow Supergiant / Cepheid
        spectralType = `F8Ia Yellow Supergiant`;
        spectralCat = 'af';
        colorHex = '#fde047';
        glowColor = '#eab308';
        size = 1.5;
      }
    } else {
      // High-energy compact remnants or Wolf-Rayet
      const remRoll = rng.next();
      if (remRoll < 0.40) {
        spectralType = `Wolf-Rayet (WR)`;
        spectralCat = 'ob';
        colorHex = '#a78bfa';
        glowColor = '#818cf8';
        size = 1.3;
      } else if (remRoll < 0.75) {
        spectralType = `Pulsar / Neutron Star`;
        spectralCat = 'remnant';
        colorHex = '#67e8f9';
        glowColor = '#06b6d4';
        size = 1.1;
      } else {
        spectralType = `Stellar Black Hole`;
        spectralCat = 'remnant';
        colorHex = '#c084fc';
        glowColor = '#9333ea';
        size = 1.2;
      }
    }

    stars.push({
      id: `GS-${seed}-${i + 1}`,
      relX,
      relY,
      mass,
      spectralType,
      spectralCat,
      colorHex,
      glowColor,
      size,
    });
  }

  return stars;
}

export function generateGalaxyGrid(config: GalaxyConfig = DEFAULT_GALAXY_CONFIG): GalaxyGridData {
  const galaxySeedInt = seedFromId(config.seed);
  const rng = new PRNG(galaxySeedInt);

  const sectors: GalaxySectorHex[] = [];
  const centerX = (config.columns + 1) / 2; // 25.5 for 50
  const centerY = (config.rows + 1) / 2; // 25.5 for 50
  const maxRadiusCells = Math.min(centerX - 1, centerY - 1); // 24.5 cells from center to border

  // Physical radius calibration: 50 kpc fills up the entire grid (radius ~24.5 cells),
  // 25 kpc extends halfway out (radius ~12.25 cells), etc.
  const GRID_KPC_MAX = 50;
  const diskRadiusCells = (Math.max(5, config.radiusKpc) / GRID_KPC_MAX) * maxRadiusCells;

  let totalDensity = 0;
  let totalAge = 0;
  let totalFeh = 0;
  let activeCount = 0;
  let totalEstimatedStars = 0;
  let nebulaCount = 0;

  const armWidthMultiplier = config.armWidth ?? 1.0;
  const armStrengthMultiplier = config.armStrength ?? 1.0;
  const armWinding = Math.max(0.5, Math.min(5.0, config.armWinding));

  for (let c = 1; c <= config.columns; c++) {
    for (let r = 1; r <= config.rows; r++) {
      const coord = `${c.toString().padStart(2, '0')}${r.toString().padStart(2, '0')}`;

      // Coordinates relative to galactic center
      const dx = c - centerX;
      const dy = r - centerY;
      const distCells = Math.sqrt(dx * dx + dy * dy);

      // Normalized radius: rNorm = 1.0 at physical galaxy disk rim!
      const rNorm = distCells / Math.max(1, diskRadiusCells);
      const rKpc = +(rNorm * config.radiusKpc).toFixed(1);
      const theta = Math.atan2(dy, dx); // [-PI, PI]

      // Local PRNG for this sector
      const sectorSeedNum = Math.floor(rng.next() * 99999) + 1000;
      const seedString = `GAL-${config.seed}-SEC-${coord}`;
      const secRng = new PRNG(seedFromId(seedString));

      // Calculate base density, age, age range, and metallicity
      let baseDensity = 0;
      let baseAge = 5.0;
      let ageRange = 3.5;
      let ageDistribution: 'normal' | 'uniform' = 'normal';
      let baseFeh = 0.0;
      let isArmSector = false;

      const noise = secRng.nextGaussian(0, 0.035);

      if (config.morphology === 'spiral' || config.morphology === 'barred-spiral') {
        // 1. Central Bulge (high density, wide uniform age range)
        const bulgeR = config.coreRadiusFraction;
        const bulgeWeight = Math.exp(-(rNorm * rNorm) / (2 * bulgeR * bulgeR));

        // 2. Bar component for barred-spiral
        let barWeight = 0;
        if (config.morphology === 'barred-spiral') {
          const barAngle = Math.PI / 4;
          const rotatedX = dx * Math.cos(barAngle) + dy * Math.sin(barAngle);
          const rotatedY = -dx * Math.sin(barAngle) + dy * Math.cos(barAngle);
          const barLength = diskRadiusCells * 0.40;
          const barWidth = diskRadiusCells * 0.14;
          barWeight =
            Math.exp(-Math.pow(rotatedX / Math.max(1, barLength), 4)) *
            Math.exp(-Math.pow(rotatedY / Math.max(1, barWidth), 2));
        }

        // 3. Logarithmic Spiral Arms with customizable Arm Width & Arm Strength
        const N = config.armCount;
        const b = armWinding;
        let minArmDist = 999;

        for (let k = 0; k < N; k++) {
          const armAngleOffset = (2 * Math.PI * k) / N;
          // Log spiral theta(r) = b * ln(r / r0) + offset
          const expectedTheta = b * Math.log(Math.max(0.04, rNorm) / 0.14) + armAngleOffset;
          let dTheta = (theta - expectedTheta) % (2 * Math.PI);
          if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
          if (dTheta < -Math.PI) dTheta += 2 * Math.PI;

          const armDist = Math.abs(dTheta);
          if (armDist < minArmDist) minArmDist = armDist;
        }

        // Arm Width function: controlled by armWidthMultiplier
        const effectiveArmWidth = (0.36 * armWidthMultiplier) / Math.sqrt(Math.max(0.12, rNorm));
        const armAngularFalloff = Math.exp(-(minArmDist * minArmDist) / (2 * effectiveArmWidth * effectiveArmWidth));

        // Smooth radial envelope for arms (no hard cutoffs!)
        const armRadialEnvelope =
          (1 - Math.exp(-rNorm / 0.14)) *
          Math.exp(-Math.pow(Math.max(0, rNorm - 0.70) / 0.44, 2));

        const armWeight = armAngularFalloff * armRadialEnvelope;

        if (armWeight > 0.32 && rNorm >= 0.12) {
          isArmSector = true;
        }

        // Disk exponential radial decay
        const diskDecay = Math.exp(-rNorm / 0.40);

        // Arm density contribution scaled by armStrength
        const armDensityContribution = 0.38 * armStrengthMultiplier * armWeight;

        // Combined raw density
        const rawDensity =
          0.82 * bulgeWeight +
          0.48 * barWeight +
          0.36 * diskDecay +
          armDensityContribution +
          noise;

        // Gradual disk fade (soft exponential outer decay rather than abrupt step cutoff)
        const edgeTaper = rNorm <= 0.85 ? 1.0 : Math.exp(-Math.pow((rNorm - 0.85) / 0.38, 1.8));
        baseDensity = Math.max(0.01, Math.min(3.5, rawDensity * edgeTaper * config.overallDensityScale));

        // Stellar Age & Age Range Astrophysics:
        // - Bulge: wide age range (effectively a uniform distribution spanning all epochs)
        // - Arms: active starburst + underlying disk population passing through density wave
        // - Halo: accreted sub-populations spanning ancient epochs
        // - Disk: multi-billion-year continuous star formation
        if (bulgeWeight > 0.35 || rNorm < 0.16) {
          baseAge = 6.8 + secRng.nextGaussian(0, 0.35);
          ageRange = 11.6; // Uniform distribution across 11.6 Gyr span (~1.0 to 12.6 Gyr)
          ageDistribution = 'uniform';
        } else if (isArmSector) {
          baseAge = 1.4 + 2.0 * Math.min(1.2, rNorm) + secRng.nextGaussian(0, 0.25);
          ageRange = 6.8 + 2.8 * Math.min(1.2, rNorm); // Wide age spread: young starbursts + underlying older disk stars
          ageDistribution = 'normal';
        } else if (rNorm > 0.92) {
          baseAge = 10.4 + secRng.nextGaussian(0, 0.25);
          ageRange = 5.6; // Accreted dwarf galaxies & globular cluster spread
          ageDistribution = 'normal';
        } else {
          baseAge = 4.2 + 3.8 * rNorm + secRng.nextGaussian(0, 0.4);
          ageRange = 7.6 + 2.8 * rNorm; // Broad disk age range spanning 7.6 to 10.4 Gyr
          ageDistribution = 'normal';
        }

        // Metallicity Gradient
        baseFeh = 0.32 - 0.95 * rNorm + (isArmSector ? 0.12 : 0) + secRng.nextGaussian(0, 0.08);

      } else if (config.morphology === 'elliptical') {
        // de Vaucouleurs profile R^(1/4)
        const sersic = Math.exp(-3.2 * (Math.pow(Math.max(0.02, rNorm), 0.25) - 1));
        const edgeTaper = rNorm <= 0.85 ? 1.0 : Math.exp(-Math.pow((rNorm - 0.85) / 0.42, 1.6));
        baseDensity = Math.max(0.01, Math.min(3.5, (0.75 * sersic + noise) * edgeTaper * config.overallDensityScale));

        // Ellipticals: ancient primary population with secondary merger remnants
        baseAge = 10.2 + secRng.nextGaussian(0, 0.4);
        ageRange = 5.8;
        ageDistribution = 'normal';
        baseFeh = 0.25 - 0.70 * rNorm + secRng.nextGaussian(0, 0.1);

      } else if (config.morphology === 'lenticular') {
        // Bulge + Smooth flat disk without arms
        const bulge = Math.exp(-(rNorm * rNorm) / 0.035);
        const disk = Math.exp(-rNorm / 0.36);
        const edgeTaper = rNorm <= 0.85 ? 1.0 : Math.exp(-Math.pow((rNorm - 0.85) / 0.38, 1.8));
        baseDensity = Math.max(0.01, Math.min(3.5, (0.75 * bulge + 0.35 * disk + noise) * edgeTaper * config.overallDensityScale));

        if (rNorm < 0.20) {
          baseAge = 7.0 + secRng.nextGaussian(0, 0.4);
          ageRange = 11.2;
          ageDistribution = 'uniform';
        } else {
          baseAge = 8.2 + 2.2 * rNorm + secRng.nextGaussian(0, 0.4);
          ageRange = 6.5;
          ageDistribution = 'normal';
        }
        baseFeh = 0.20 - 0.75 * rNorm + secRng.nextGaussian(0, 0.1);

      } else if (config.morphology === 'ring') {
        // Nucleus + Collisional Ring
        const nucleus = Math.exp(-(rNorm * rNorm) / 0.028);
        const ringDist = Math.abs(rNorm - 0.72);
        const ringWeight = Math.exp(-(ringDist * ringDist) / (2 * 0.09 * 0.09));
        const interGap = Math.exp(-rNorm / 0.5) * 0.12;
        const edgeTaper = rNorm <= 0.88 ? 1.0 : Math.exp(-Math.pow((rNorm - 0.88) / 0.36, 1.8));

        baseDensity = Math.max(0.01, Math.min(3.5, (0.70 * nucleus + 0.65 * ringWeight + interGap + noise) * edgeTaper * config.overallDensityScale));

        if (ringWeight > 0.35) {
          isArmSector = true;
          baseAge = 1.0 + secRng.nextGaussian(0, 0.2); // Fresh collisional starburst + pre-existing disk stars
          ageRange = 6.2;
          ageDistribution = 'normal';
          baseFeh = 0.18 + secRng.nextGaussian(0, 0.06);
        } else if (rNorm < 0.20) {
          baseAge = 6.8 + secRng.nextGaussian(0, 0.35);
          ageRange = 11.5;
          ageDistribution = 'uniform';
          baseFeh = 0.30 + secRng.nextGaussian(0, 0.08);
        } else {
          baseAge = 10.5 + secRng.nextGaussian(0, 0.3);
          ageRange = 5.5;
          ageDistribution = 'normal';
          baseFeh = -0.10 - 0.5 * rNorm;
        }

      } else {
        // Irregular galaxy with chaotic starburst knots
        const clump1 = Math.exp(-(Math.pow(dx - diskRadiusCells * 0.25, 2) + Math.pow(dy - diskRadiusCells * 0.15, 2)) / (diskRadiusCells * 1.5));
        const clump2 = Math.exp(-(Math.pow(dx + diskRadiusCells * 0.22, 2) + Math.pow(dy - diskRadiusCells * 0.30, 2)) / (diskRadiusCells * 2.0));
        const clump3 = Math.exp(-(Math.pow(dx + diskRadiusCells * 0.10, 2) + Math.pow(dy + diskRadiusCells * 0.28, 2)) / (diskRadiusCells * 2.2));
        const diffuse = Math.exp(-rNorm / 0.48);
        const edgeTaper = rNorm <= 0.85 ? 1.0 : Math.exp(-Math.pow((rNorm - 0.85) / 0.42, 1.6));

        baseDensity = Math.max(0.01, Math.min(3.5, (0.50 * (clump1 + clump2 + clump3) + 0.25 * diffuse + noise) * edgeTaper * config.overallDensityScale));

        if (clump1 > 0.35 || clump2 > 0.35 || clump3 > 0.35) {
          isArmSector = true;
          baseAge = 0.8 + secRng.nextGaussian(0, 0.2);
          ageRange = 6.0;
          ageDistribution = 'normal';
          baseFeh = -0.15 + secRng.nextGaussian(0, 0.1);
        } else {
          baseAge = 4.2 + 3.0 * rNorm + secRng.nextGaussian(0, 0.5);
          ageRange = 8.5;
          ageDistribution = 'uniform';
          baseFeh = -0.45 - 0.5 * rNorm;
        }
      }

      // Final numerical bounds
      const density = +Math.max(0.01, Math.min(3.5, baseDensity)).toFixed(2);
      const meanAge = +Math.max(0.2, Math.min(12.8, baseAge)).toFixed(2);
      const metallicityMean = +Math.max(-1.7, Math.min(0.52, baseFeh)).toFixed(2);
      const ageRangeClamped = +Math.max(0.5, Math.min(12.5, ageRange)).toFixed(2);
      const ageMin = +Math.max(0.1, meanAge - ageRangeClamped / 2).toFixed(1);
      const ageMax = +Math.min(13.5, meanAge + ageRangeClamped / 2).toFixed(1);

      // Color based on luminosity-weighted average of constituent stars:
      const colorHex = computeSectorConstituentColor(
        sectorSeedNum,
        meanAge,
        ageRangeClamped,
        ageDistribution,
        metallicityMean,
        density
      );

      // Opacity based on density: denser = more opaque, sparser = more transparent
      const opacity = getSectorOpacityByDensity(density);

      // Region name
      const region = getRegionName(config.morphology, rNorm, density, isArmSector);

      // Estimated star systems inside a 50x50 sector (50x50 = 2,500 hexes)
      const estimatedStars50x50 = density <= 1.0
        ? Math.round(2500 * density)
        : Math.round(2500 * (1.0 + (density - 1.0) * 1.4));

      const sectorName = `Sector ${coord} (${region.split(' ')[0]})`;

      if (density >= 0.05) {
        activeCount++;
        totalDensity += density;
        totalAge += meanAge;
        totalFeh += metallicityMean;
        totalEstimatedStars += estimatedStars50x50;
      }

      const giantStars = generateGalaxyGiantStars(density, meanAge, sectorSeedNum, 26);

      // Nebulae can ONLY generate in young sectors (< 1.0 Gyr) with sufficient density
      const hasNebula = meanAge < 1.0 && density >= 0.08 && secRng.next() < 0.55;
      let nebulaName: string | undefined = undefined;
      if (hasNebula) {
        nebulaCount++;
        const NEBULA_NAMES = [
          'Carina Starburst Complex',
          'Tarantula Ionization Nursery',
          'Orion H-II Emission Complex',
          'Rosette Molecular Cloud',
          'Eagle Star-Forming Nebula',
          'Lagoon Photo-Ionized Cloud',
          'Trifid Relativistic Gas Complex',
          'Omega Starburst Cloud',
          'Cygnus-OB Emission Cloud',
          'Vela Ionized Shroud',
          'Perseus Starburst Veil',
          'Centaurus Primordial Cloud',
        ];
        nebulaName = NEBULA_NAMES[Math.floor(secRng.next() * NEBULA_NAMES.length)];
      }

      sectors.push({
        col: c,
        row: r,
        coord,
        name: sectorName,
        seed: sectorSeedNum,
        seedString,
        rNorm: +rNorm.toFixed(3),
        rKpc,
        thetaRad: +theta.toFixed(3),
        density,
        meanAge,
        ageRange: ageRangeClamped,
        ageDistribution,
        ageMin,
        ageMax,
        metallicityMean,
        colorHex,
        opacity,
        region,
        estimatedStars50x50,
        giantStars,
        hasNebula,
        nebulaName,
      });
    }
  }

  const avgDensity = activeCount > 0 ? +(totalDensity / activeCount).toFixed(2) : 0;
  const avgAge = activeCount > 0 ? +(totalAge / activeCount).toFixed(2) : 0;
  const avgMetallicity = activeCount > 0 ? +(totalFeh / activeCount).toFixed(2) : 0;

  return {
    config,
    sectors,
    stats: {
      totalSectors: config.columns * config.rows,
      activeSectors: activeCount,
      avgDensity,
      avgAge,
      avgMetallicity,
      totalEstimatedStars,
      nebulaCount,
    },
  };
}

/**
 * Generates an in-memory blurred background image from the galaxy's sector hexes.
 * Uses an offscreen canvas with a strong Gaussian blur filter to turn the discrete
 * hexes into a silky-smooth, continuous celestial galactic disk and spiral arms.
 */
export function generateBlurredGalaxyBackground(
  sectors: GalaxySectorHex[],
  columns: number,
  rows: number,
  colSpacing: number,
  rowSpacing: number,
  hexRadius: number,
  hexWidth: number,
  blurPx: number = 30
): string {
  if (typeof document === 'undefined') return '';

  const totalW = Math.round(columns * colSpacing + hexWidth);
  const totalH = Math.round(rows * rowSpacing + 2 * hexRadius);
  if (totalW <= 0 || totalH <= 0) return '';

  // Render on a quarter-scale canvas for ultra-fast GPU blur (<1.5ms) and fast WebP encoding
  const scale = 0.25;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(10, Math.round(totalW * scale));
  canvas.height = Math.max(10, Math.round(totalH * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.save();
  ctx.scale(scale, scale);

  // Draw soft radial bursts for each active sector
  for (const sector of sectors) {
    if (sector.density < 0.03) continue;
    const xOffset = sector.row % 2 === 1 ? hexWidth * 0.5 : 0;
    const cx = (sector.col - 1) * colSpacing + hexRadius + xOffset;
    const cy = (sector.row - 1) * rowSpacing + hexRadius;

    ctx.beginPath();
    ctx.arc(cx, cy, hexRadius * 1.35, 0, Math.PI * 2);
    ctx.fillStyle = sector.colorHex;
    ctx.globalAlpha = Math.min(1.0, sector.opacity * 1.4);
    ctx.fill();
  }
  ctx.restore();

  // Create blurred canvas applying strong blur filter
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = canvas.width;
  blurCanvas.height = canvas.height;
  const blurCtx = blurCanvas.getContext('2d');
  if (!blurCtx) return canvas.toDataURL('image/webp', 0.85);

  // Apply strong blur filter to melt hex boundaries into organic cosmic gas
  blurCtx.filter = `blur(${Math.max(2, Math.round(blurPx * scale))}px)`;
  blurCtx.drawImage(canvas, 0, 0);

  // Soft secondary pass for deep atmospheric glow
  blurCtx.filter = `blur(${Math.max(1, Math.round(blurPx * 0.5 * scale))}px)`;
  blurCtx.globalAlpha = 0.85;
  blurCtx.drawImage(canvas, 0, 0);

  return blurCanvas.toDataURL('image/webp', 0.85);
}
