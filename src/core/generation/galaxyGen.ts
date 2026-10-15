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
  radiusKpc: number; // 15 to 35 kpc
  coreRadiusFraction: number; // 0.10 to 0.30
  armCount: number; // 2, 3, 4, or 6
  armWinding: number; // Spiral pitch / tightness (0.6 to 2.5)
  overallDensityScale: number; // 0.5 to 1.5
}

export interface GalaxySectorHex {
  col: number; // 1 to 50
  row: number; // 1 to 50
  coord: string; // "2525"
  name: string;
  seed: number; // Seed passed to SectorHex
  seedString: string; // e.g. "GAL-4289-SEC-2525"
  rNorm: number; // Normalized radial distance (0 = core, 1.0 = edge)
  rKpc: number; // Distance from core in kiloparsecs
  thetaRad: number; // Polar angle in radians
  density: number; // 0.0 to 0.85
  meanAge: number; // 0.3 to 12.5 Gyr
  metallicityMean: number; // -1.6 to +0.45 dex
  colorHex: string; // Bluer for young, redder for old
  opacity: number; // More opaque for dense, transparent for sparse
  region: string; // "Galactic Bulge", "Spiral Arm Ridge", "Inter-arm Disk", etc.
  estimatedStars50x50: number; // Stars if generated at 50x50
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
  };
}

export const DEFAULT_GALAXY_CONFIG: GalaxyConfig = {
  seed: 4289,
  name: 'Orion-Perseus Galaxy',
  morphology: 'spiral',
  columns: 50,
  rows: 50,
  radiusKpc: 25,
  coreRadiusFraction: 0.16,
  armCount: 4,
  armWinding: 1.35,
  overallDensityScale: 1.0,
};

/**
 * Desaturates a hex color towards pure white (#ffffff) by a factor [0, 1]
 */
export function desaturateToWhite(hex: string, factor: number): string {
  const clamped = Math.max(0, Math.min(1, factor));
  if (clamped <= 0) return hex;
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);

  const newR = Math.round(r + (255 - r) * clamped);
  const newG = Math.round(g + (255 - g) * clamped);
  const newB = Math.round(b + (255 - b) * clamped);

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * Converts hex color string to RGB object
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  return {
    r: parseInt(clean.slice(0, 2), 16) || 128,
    g: parseInt(clean.slice(2, 4), 16) || 128,
    b: parseInt(clean.slice(4, 6), 16) || 128,
  };
}

/**
 * Converts RGB numbers to hex string
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clampR = Math.max(0, Math.min(255, Math.round(r)));
  const clampG = Math.max(0, Math.min(255, Math.round(g)));
  const clampB = Math.max(0, Math.min(255, Math.round(b)));
  return `#${clampR.toString(16).padStart(2, '0')}${clampG.toString(16).padStart(2, '0')}${clampB.toString(16).padStart(2, '0')}`;
}

/**
 * Computes the sector's integrated color as a luminosity-weighted average of its constituent stars.
 * Young sectors containing hot O/B stars emit predominantly luminous blue light.
 * Older sectors where massive stars have died are dominated by red giants and solar turnoffs (warm gold/red).
 * When density exceeds 100%, mass overflow spawns massive stars and desaturates towards white.
 */
export function computeSectorConstituentColor(
  secSeed: number,
  meanAge: number,
  metallicityMean: number,
  density: number
): string {
  const secRng = new PRNG(secSeed);
  const nSamples = 32;

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

    // 2. Star Age & Metallicity
    const starAge = Math.max(0.05, Math.min(12.8, meanAge + secRng.nextGaussian(0, 0.6)));
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
 * - Younger sectors are bluer, older sectors are redder.
 * - When density exceeds 100% (>1.0), saturation decreases towards white!
 *   At 200% or 300% density, sectors become dazzling white-hot luminous cores.
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

  // Fun Rule: Densities exceeding 100% (1.0) desaturate towards white
  if (density > 1.0) {
    // factor: 1.0 -> 0.0, 2.0 -> 0.55, 3.0+ -> 0.95+
    const desatFactor = Math.min(0.96, Math.pow((density - 1.0) / 2.0, 0.85) * 0.95);
    return desaturateToWhite(baseColor, desatFactor);
  }

  return baseColor;
}

/**
 * Maps sector stellar density to opacity:
 * "denser sectors are more opaque and less dense sectors are more transparent"
 */
export function getSectorOpacityByDensity(density: number): number {
  if (density < 0.03) return 0.03; // Nearly transparent void
  if (density >= 1.0) return 0.98; // Completely opaque for overdensities
  const scaled = Math.min(1.0, density / 0.82);
  const opacity = 0.08 + 0.88 * Math.pow(scaled, 1.15);
  return +Math.min(0.96, Math.max(0.04, opacity)).toFixed(3);
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
  if (rNorm > 1.05 && density < 0.04) return 'Intergalactic Void';
  if (rNorm > 0.92) return 'Galactic Halo Fringe';
  if (rNorm < 0.14) return 'Galactic Core Bulge';

  if (morphology === 'spiral' || morphology === 'barred-spiral') {
    if (isArm && density > 0.40) return 'Spiral Arm Starburst';
    if (isArm) return 'Spiral Arm Ridge';
    if (rNorm < 0.45) return 'Inner Galactic Disk';
    return 'Inter-Arm Disk';
  }

  if (morphology === 'ring') {
    if (Math.abs(rNorm - 0.72) < 0.15) return 'Collisional Starburst Ring';
    if (rNorm < 0.40) return 'Nuclear Core';
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
 * Generates the full 50x50 Galaxy Grid with position-dependent density, age, and metallicity
 */
export function generateGalaxyGrid(config: GalaxyConfig = DEFAULT_GALAXY_CONFIG): GalaxyGridData {
  const galaxySeedInt = seedFromId(config.seed);
  const rng = new PRNG(galaxySeedInt);

  const sectors: GalaxySectorHex[] = [];
  const centerX = (config.columns + 1) / 2; // 25.5 for 50
  const centerY = (config.rows + 1) / 2; // 25.5 for 50
  const maxRadiusCells = Math.min(centerX - 1, centerY - 1) * 0.96; // ~23.5 cells

  let totalDensity = 0;
  let totalAge = 0;
  let totalFeh = 0;
  let activeCount = 0;
  let totalEstimatedStars = 0;

  for (let c = 1; c <= config.columns; c++) {
    for (let r = 1; r <= config.rows; r++) {
      const coord = `${c.toString().padStart(2, '0')}${r.toString().padStart(2, '0')}`;

      // Normalized coordinates from center
      const dx = c - centerX;
      const dy = r - centerY;
      const distCells = Math.sqrt(dx * dx + dy * dy);
      const rNorm = distCells / maxRadiusCells; // 0 at core, 1.0 at galaxy disk rim
      const rKpc = +(rNorm * config.radiusKpc).toFixed(1);
      const theta = Math.atan2(dy, dx); // [-PI, PI]

      // Local PRNG for this sector
      const sectorSeedNum = Math.floor(rng.next() * 99999) + 1000;
      const seedString = `GAL-${config.seed}-SEC-${coord}`;
      const secRng = new PRNG(seedFromId(seedString));

      // Calculate base density, age, and metallicity based on morphology and galactic position
      let baseDensity = 0;
      let baseAge = 5.0;
      let baseFeh = 0.0;
      let isArmSector = false;

      const noise = secRng.nextGaussian(0, 0.04);

      if (config.morphology === 'spiral' || config.morphology === 'barred-spiral') {
        // 1. Central Bulge (high density, old stars, metal-rich)
        const bulgeR = config.coreRadiusFraction;
        const bulgeWeight = Math.exp(-(rNorm * rNorm) / (2 * bulgeR * bulgeR));

        // 2. Bar component for barred-spiral
        let barWeight = 0;
        if (config.morphology === 'barred-spiral') {
          const barAngle = Math.PI / 4;
          const rotatedX = dx * Math.cos(barAngle) + dy * Math.sin(barAngle);
          const rotatedY = -dx * Math.sin(barAngle) + dy * Math.cos(barAngle);
          const barLength = maxRadiusCells * 0.38;
          const barWidth = maxRadiusCells * 0.12;
          barWeight =
            Math.exp(-Math.pow(rotatedX / barLength, 4)) *
            Math.exp(-Math.pow(rotatedY / barWidth, 2));
        }

        // 3. Logarithmic Spiral Arms
        const N = config.armCount;
        const b = config.armWinding;
        let minArmDist = 999;

        for (let k = 0; k < N; k++) {
          const armAngleOffset = (2 * Math.PI * k) / N;
          // Log spiral theta(r) = b * ln(r / r0) + offset
          const expectedTheta = b * Math.log(Math.max(0.06, rNorm) / 0.14) + armAngleOffset;
          // Angular distance wrapped to [-PI, PI]
          let dTheta = (theta - expectedTheta) % (2 * Math.PI);
          if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
          if (dTheta < -Math.PI) dTheta += 2 * Math.PI;

          const armDist = Math.abs(dTheta);
          if (armDist < minArmDist) minArmDist = armDist;
        }

        const armWidth = 0.42 / Math.sqrt(Math.max(0.1, rNorm));
        const armWeight =
          Math.exp(-(minArmDist * minArmDist) / (2 * armWidth * armWidth)) *
          (rNorm >= 0.12 && rNorm <= 1.05 ? 1 : 0);

        if (armWeight > 0.45 && rNorm >= 0.14 && rNorm <= 1.0) {
          isArmSector = true;
        }

        // Disk exponential radial decay
        const diskDecay = Math.exp(-rNorm / 0.36);

        // Combined Density
        const rawDensity =
          0.78 * bulgeWeight +
          0.45 * barWeight +
          0.38 * diskDecay +
          0.35 * armWeight +
          noise;

        baseDensity = Math.max(0, Math.min(3.5, rawDensity * config.overallDensityScale));
        if (rNorm > 1.15) baseDensity *= Math.max(0, 1 - (rNorm - 1.15) * 4);

        // Stellar Age (younger in arms, old in bulge/halo)
        if (bulgeWeight > 0.45) {
          baseAge = 9.5 + secRng.nextGaussian(0, 1.2);
        } else if (isArmSector) {
          baseAge = 0.8 + 1.6 * (rNorm / 1.0) + secRng.nextGaussian(0, 0.4);
        } else {
          baseAge = 4.2 + 4.5 * rNorm + secRng.nextGaussian(0, 0.8);
        }

        // Metallicity Gradient (metal-rich center, metal-poor outer disk)
        baseFeh = 0.32 - 0.95 * rNorm + (isArmSector ? 0.12 : 0) + secRng.nextGaussian(0, 0.08);

      } else if (config.morphology === 'elliptical') {
        // de Vaucouleurs profile R^(1/4)
        const sersic = Math.exp(-3.2 * (Math.pow(Math.max(0.02, rNorm), 0.25) - 1));
        baseDensity = Math.max(0, Math.min(3.5, (0.75 * sersic + noise) * config.overallDensityScale));
        if (rNorm > 1.2) baseDensity *= Math.max(0, 1 - (rNorm - 1.2) * 3);

        // Ellipticals are old Population II stars throughout
        baseAge = 9.8 + secRng.nextGaussian(0, 1.2);
        baseFeh = 0.25 - 0.70 * rNorm + secRng.nextGaussian(0, 0.1);

      } else if (config.morphology === 'lenticular') {
        // Bulge + Smooth flat disk without arms
        const bulge = Math.exp(-(rNorm * rNorm) / 0.03);
        const disk = Math.exp(-rNorm / 0.32);
        baseDensity = Math.max(0, Math.min(3.5, (0.75 * bulge + 0.35 * disk + noise) * config.overallDensityScale));
        if (rNorm > 1.1) baseDensity *= Math.max(0, 1 - (rNorm - 1.1) * 4);

        baseAge = 7.5 + 2.5 * rNorm + secRng.nextGaussian(0, 0.8);
        baseFeh = 0.20 - 0.75 * rNorm + secRng.nextGaussian(0, 0.1);

      } else if (config.morphology === 'ring') {
        // Nucleus + Ring structure
        const nucleus = Math.exp(-(rNorm * rNorm) / 0.025);
        const ringDist = Math.abs(rNorm - 0.72);
        const ringWeight = Math.exp(-(ringDist * ringDist) / (2 * 0.08 * 0.08));
        const interGap = Math.exp(-rNorm / 0.5) * 0.12;

        baseDensity = Math.max(0, Math.min(3.5, (0.70 * nucleus + 0.65 * ringWeight + interGap + noise) * config.overallDensityScale));
        if (rNorm > 1.1) baseDensity *= Math.max(0, 1 - (rNorm - 1.1) * 3);

        if (ringWeight > 0.40) {
          isArmSector = true;
          baseAge = 0.6 + secRng.nextGaussian(0, 0.3); // Fresh collision starburst!
          baseFeh = 0.18 + secRng.nextGaussian(0, 0.06);
        } else if (nucleus > 0.40) {
          baseAge = 10.5 + secRng.nextGaussian(0, 1.0);
          baseFeh = 0.30 + secRng.nextGaussian(0, 0.08);
        } else {
          baseAge = 6.0 + secRng.nextGaussian(0, 0.8);
          baseFeh = -0.10 - 0.5 * rNorm;
        }

      } else {
        // Irregular galaxy with chaotic star-forming knots
        const clump1 = Math.exp(-(Math.pow(dx - 6, 2) + Math.pow(dy - 4, 2)) / 35);
        const clump2 = Math.exp(-(Math.pow(dx + 5, 2) + Math.pow(dy - 7, 2)) / 45);
        const clump3 = Math.exp(-(Math.pow(dx + 2, 2) + Math.pow(dy + 6, 2)) / 50);
        const diffuse = Math.exp(-rNorm / 0.45);

        baseDensity = Math.max(0, Math.min(3.5, (0.50 * (clump1 + clump2 + clump3) + 0.25 * diffuse + noise) * config.overallDensityScale));
        if (rNorm > 1.1) baseDensity *= Math.max(0, 1 - (rNorm - 1.1) * 3);

        if (clump1 > 0.4 || clump2 > 0.4 || clump3 > 0.4) {
          isArmSector = true;
          baseAge = 0.5 + secRng.nextGaussian(0, 0.3);
          baseFeh = -0.15 + secRng.nextGaussian(0, 0.1);
        } else {
          baseAge = 3.5 + 3.0 * rNorm + secRng.nextGaussian(0, 1.0);
          baseFeh = -0.45 - 0.5 * rNorm;
        }
      }

      // Final clamping: density can now exceed 100% (up to 3.5 = 350%)!
      const density = +Math.max(0.01, Math.min(3.5, baseDensity)).toFixed(2);
      const meanAge = +Math.max(0.2, Math.min(12.8, baseAge)).toFixed(2);
      const metallicityMean = +Math.max(-1.7, Math.min(0.52, baseFeh)).toFixed(2);

      // Color based on luminosity-weighted average of constituent stars:
      const colorHex = computeSectorConstituentColor(sectorSeedNum, meanAge, metallicityMean, density);

      // Opacity based on density: denser = more opaque, sparser = more transparent
      const opacity = getSectorOpacityByDensity(density);

      // Region name
      const region = getRegionName(config.morphology, rNorm, density, isArmSector);

      // Estimated star systems inside a 50x50 sector (50x50 = 2,500 hexes)
      // When density > 1.0, 100% of hexes are filled, plus multiplicity and mass overflow boost total star bodies!
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
        metallicityMean,
        colorHex,
        opacity,
        region,
        estimatedStars50x50,
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
    },
  };
}
