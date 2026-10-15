import { PRNG, seedFromId } from './prng';
import {
  runRealisticGenerator,
  StarGenParams,
  RealisticStarSystemResult,
} from './realisticStarGen';
import {
  RealisticStarNode,
  SpectralCategory,
} from '../../types/astrophysics';

export interface SectorHexSystem {
  // Required core tuple: { age, mass, metallicity, id }
  age: number; // System age in Gyr (e.g. 4.6)
  mass: number; // Progenitor system mass in M_sun (sysMass, e.g. 1.02)
  metallicity: number; // [Fe/H] in dex (e.g. +0.05)
  id: string; // Deterministic PRNG seed string (e.g. "SYS-0408-A938")

  // Exact stellar data derived directly from system generator (RealisticStarSystemResult)
  name: string;
  col: number; // 1-indexed column
  row: number; // 1-indexed row
  coord: string; // "0101", "0408"
  primaryClass: string; // Exact spectral type from Star A (e.g. "G2V", "M4V", "B5V")
  primaryMass: number; // Mass of Star A in M_sun
  spectralCat: SpectralCategory;
  colorHex: string; // Star A color hex
  glowColor: string;
  teff: number; // Star A Teff in K
  lumLsun: number; // Star A luminosity L/L_sun
  isRemnant: boolean;
  remnantType: string | null;
  nStars: number; // 1 = Single, 2 = Binary, 3 = Trinary, 4 = Quadruple
  archName: string; // "Single Star", "Binary Star System", etc.
  companionStars: RealisticStarNode[];
  planetCount: number;
  beltCount: number;
  candidateHabitable: boolean;
  sysResult: RealisticStarSystemResult; // The full system generation result
}

export interface SectorHexCell {
  col: number;
  row: number;
  coord: string;
  system: SectorHexSystem | null;
}

export interface SectorHexConfig {
  seed: number;
  name: string;
  columns: number;
  rows: number;
  density: number; // 0.05 to 3.5 (supports >100% overdensities)
  meanAge: number; // 0.5 to 11 Gyr
  ageSigma: number;
  metallicityMean: number; // -1.5 to +0.4 dex
  metallicitySigma: number;
}

export interface SectorHexGridData {
  config: SectorHexConfig;
  cells: SectorHexCell[];
  systems: SectorHexSystem[];
  stats: {
    totalHexes: number;
    occupiedHexes: number;
    occupancyPct: number;
    obCount: number;
    afCount: number;
    gCount: number;
    kmCount: number;
    remnantCount: number;
    multipleSystemCount: number;
    heavyMassCount: number;
  };
}

export const DEFAULT_SECTOR_CONFIG: SectorHexConfig = {
  seed: 4289,
  name: 'Orion Cygnus Spur',
  columns: 10,
  rows: 10,
  density: 0.38,
  meanAge: 4.8,
  ageSigma: 1.8,
  metallicityMean: 0.04,
  metallicitySigma: 0.22,
};

// Procedural catalog star names
const GREEK_LETTERS = [
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
  'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi',
  'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'
];

const CONSTELLATIONS = [
  'Centauri', 'Eridani', 'Cygni', 'Draconis', 'Orionis', 'Lyrae',
  'Cassiopeiae', 'Aquilae', 'Pegasi', 'Tauri', 'Scorpii', 'Bootis',
  'Aurigae', 'Andromedae', 'Carinae', 'Vela', 'Pavonis', 'Hydrae',
  'Leonis', 'Ursae', 'Cephei', 'Persei', 'Serpentis', 'Fornacis'
];

const CATALOG_PREFIXES = ['Kepler', 'HD', 'Gliese', 'Ross', 'Wolf', 'HIP', 'Trappist', 'TOI', 'LHS'];

const MYTHOLOGICAL_NAMES = [
  'Aethelgard', 'Boreas', 'Calypso', 'Danu', 'Elysium', 'Fenrir',
  'Hyperion', 'Ishtar', 'Jormungandr', 'Khepri', 'Lumira', 'Midgard',
  'Njord', 'Ophion', 'Persephone', 'Quetzal', 'Rhadamanthys', 'Solaria',
  'Tethys', 'Ushas', 'Valhalla', 'Zephyrus', 'Astraea', 'Vesper'
];

/**
 * Format 1-indexed column and row into 4-digit hex coordinates: "0408"
 */
export function formatHexCoord(col: number, row: number): string {
  return `${col.toString().padStart(2, '0')}${row.toString().padStart(2, '0')}`;
}

/**
 * Samples a progenitor stellar system mass using a piecewise Kroupa IMF power-law
 */
function sampleKroupaMass(rng: PRNG): number {
  const u = rng.next();
  let mass: number;
  if (u < 0.08) {
    mass = 0.08 + u * (0.12 - 0.08) / 0.08;
  } else if (u < 0.58) {
    const t = (u - 0.08) / 0.50;
    mass = 0.12 + Math.pow(t, 1.4) * (0.50 - 0.12);
  } else if (u < 0.88) {
    const t = (u - 0.58) / 0.30;
    mass = 0.50 + Math.pow(t, 1.2) * (1.25 - 0.50);
  } else if (u < 0.97) {
    const t = (u - 0.88) / 0.09;
    mass = 1.25 + Math.pow(t, 1.3) * (2.8 - 1.25);
  } else {
    const t = (u - 0.97) / 0.03;
    mass = 2.8 + Math.pow(t, 2.0) * (25.0 - 2.8);
  }
  return +mass.toFixed(3);
}

/**
 * Samples a progenitor stellar system mass with density overflow.
 * When density <= 1.0 (<= 100%), follows standard Kroupa IMF (0.08 to 25.0 M_sun, median ~0.3 M_sun).
 * When density > 1.0, the excess density overflows onto mass!
 * Densities of 200% or 300% spawn massive stars (4 to 65+ M_sun), multiple systems, and stellar remnants.
 */
function sampleSystemMass(rng: PRNG, density: number = 0.5): number {
  const baseMass = sampleKroupaMass(rng);
  if (density <= 1.0) {
    return baseMass;
  }

  const overflow = density - 1.0; // e.g. 1.0 for 200%, 2.0 for 300%

  // Massive star / supernova progenitor chance surges with overdensity
  // At 200% (overflow 1.0): ~42% heavy star chance; at 300% (overflow 2.0): ~72% heavy star chance!
  const heavyRoll = rng.next();
  const heavyStarChance = Math.min(0.82, 0.12 + overflow * 0.30);

  if (heavyRoll < heavyStarChance) {
    const u = rng.next();
    // Heavy mass: 3.8 to 65.0+ M_sun (spawns O/B giants, and collapses to Neutron Stars & Black Holes)
    const heavyMass = 3.8 + Math.pow(u, 1.2) * (18.0 + overflow * 22.0);
    return +heavyMass.toFixed(3);
  }

  // All other stars receive an upward mass shift proportional to density overflow
  const boosted = baseMass * (1.0 + overflow * 1.45);
  return +boosted.toFixed(3);
}

/**
 * Generates a unique, procedural star name based on seed and coordinate
 */
function generateStarName(col: number, row: number, rng: PRNG): string {
  const roll = rng.next();
  if (roll < 0.35) {
    const greek = GREEK_LETTERS[Math.floor(rng.next() * GREEK_LETTERS.length)];
    const constell = CONSTELLATIONS[Math.floor(rng.next() * CONSTELLATIONS.length)];
    return `${greek} ${constell}`;
  } else if (roll < 0.65) {
    const prefix = CATALOG_PREFIXES[Math.floor(rng.next() * CATALOG_PREFIXES.length)];
    const catNum = Math.floor(100 + rng.next() * 9890);
    return `${prefix}-${catNum}`;
  } else if (roll < 0.85) {
    const myth = MYTHOLOGICAL_NAMES[Math.floor(rng.next() * MYTHOLOGICAL_NAMES.length)];
    const num = Math.floor(rng.next() * 9) + 1;
    return `${myth} ${num}`;
  } else {
    return `Sector Hex-${formatHexCoord(col, row)}`;
  }
}

/**
 * Builds the complete Sector Hex Grid with randomly distributed systems.
 * CRITICAL ARCHITECTURE: Calls runRealisticGenerator(params) directly using the { age, mass, metallicity, id }
 * tuple, then extracts all stellar and planetary data from the system generator result.
 */
export function generateSectorHexGrid(config: SectorHexConfig = DEFAULT_SECTOR_CONFIG): SectorHexGridData {
  const sectorSeedInt = seedFromId(config.seed);
  const rng = new PRNG(sectorSeedInt);

  const cells: SectorHexCell[] = [];
  const systems: SectorHexSystem[] = [];

  let obCount = 0;
  let afCount = 0;
  let gCount = 0;
  let kmCount = 0;
  let remnantCount = 0;
  let multipleSystemCount = 0;
  let heavyMassCount = 0;

  for (let c = 1; c <= config.columns; c++) {
    for (let r = 1; r <= config.rows; r++) {
      const coord = formatHexCoord(c, r);
      const isOccupied = rng.next() < config.density;

      if (!isOccupied) {
        cells.push({ col: c, row: r, coord, system: null });
        continue;
      }

      // Generate unique deterministic ID for this hex system
      // Format: SYS-coord-hexSeed, e.g. SYS-0408-A938
      const cellSeedNum = Math.floor(rng.next() * 8999) + 1000;
      const systemId = `SYS-${coord}-${cellSeedNum.toString(16).toUpperCase()}`;

      // Local PRNG dedicated to this specific system for reproducible parameter sampling
      const sysRng = new PRNG(seedFromId(systemId));

      // 1. Progenitor system mass (sysMass in M_sun) with density overflow
      const mass = sampleSystemMass(sysRng, config.density);
      if (mass >= 3.0) heavyMassCount++;

      // 2. Age sample (clamped between 0.1 and 12.8 Gyr)
      const rawAge = config.meanAge + sysRng.nextGaussian(0, config.ageSigma);
      const age = +Math.max(0.1, Math.min(12.8, rawAge)).toFixed(2);

      // 3. Metallicity sample (with cosmic age anti-correlation)
      const ageDrift = -0.04 * (age - config.meanAge);
      const rawFeh = config.metallicityMean + ageDrift + sysRng.nextGaussian(0, config.metallicitySigma);
      const metallicity = +Math.max(-1.8, Math.min(0.55, rawFeh)).toFixed(2);

      const name = generateStarName(c, r, sysRng);

      // Fun Rule: Densities > 100% trigger gravitational capture and high multiple-star systems
      let forcedMult: 'auto' | '1' | '2' | '3' | '4' = 'auto';
      if (config.density > 1.0) {
        const multRoll = sysRng.next();
        // At 200% (overflow 1.0): ~65% forced multiple; at 300%: ~88% forced multiple
        const multChance = Math.min(0.90, 0.38 + (config.density - 1.0) * 0.26);
        if (multRoll < multChance) {
          const mPick = sysRng.next();
          forcedMult = mPick < 0.40 ? '2' : mPick < 0.75 ? '3' : '4';
        }
      }

      // 4. CALL SYSTEM GENERATOR DIRECTLY WITH THE { age, mass, metallicity, id } TUPLE!
      const sysGenParams: StarGenParams = {
        sysMass: mass,
        age,
        feh: metallicity,
        id: systemId,
        name,
        forcedMult,
      };
      const sysResult = runRealisticGenerator(sysGenParams);

      // 5. EXTRACT EXACT STELLAR AND SYSTEM DATA FROM THE SYSTEM GENERATOR RESULT
      const primaryStar = sysResult.hierarchy.stars[0];
      const companionStars = sysResult.hierarchy.stars.slice(1);
      const nStars = sysResult.hierarchy.stars.length;
      if (nStars > 1) multipleSystemCount++;
      const archName = sysResult.hierarchy.archName;

      // Classify spectral type and remnant status from primary star
      const categoryStr = primaryStar.category || '';
      const typeStr = primaryStar.spectralType || '';
      const isRemnant =
        categoryStr.toLowerCase().includes('remnant') ||
        typeStr.includes('Dwarf (D') ||
        typeStr.includes('White Dwarf') ||
        typeStr.includes('Neutron') ||
        typeStr.includes('Black Hole');

      let spectralCat: SpectralCategory;
      if (isRemnant) {
        spectralCat = 'remnant';
        remnantCount++;
      } else {
        const firstLetter = typeStr.trim().charAt(0).toUpperCase();
        if (firstLetter === 'O' || firstLetter === 'B') {
          spectralCat = 'ob';
          obCount++;
        } else if (firstLetter === 'A' || firstLetter === 'F') {
          spectralCat = 'af';
          afCount++;
        } else if (firstLetter === 'G') {
          spectralCat = 'g';
          gCount++;
        } else {
          spectralCat = 'km';
          kmCount++;
        }
      }

      // Check planets and habitable candidate worlds directly from the generated zones
      let planetCount = 0;
      let beltCount = 0;
      let candidateHabitable = false;

      for (const zone of sysResult.zones) {
        for (const body of zone.bodies) {
          if (body.kind === 'planet') {
            planetCount++;
            if (
              body.planetClass.includes('Habitable') ||
              (body.surfaceTempK >= 260 &&
                body.surfaceTempK <= 325 &&
                body.hydrosphere &&
                (body.hydrosphere.coveragePct || 0) > 5)
            ) {
              candidateHabitable = true;
            }
          } else if (body.kind === 'belt') {
            beltCount++;
          }
        }
      }

      const lumNum = typeof primaryStar.lumNum === 'number' ? primaryStar.lumNum : 1;

      const system: SectorHexSystem = {
        // Required core tuple:
        age,
        mass,
        metallicity,
        id: systemId,

        // Exact stellar data from system generator:
        name,
        col: c,
        row: r,
        coord,
        primaryClass: primaryStar.spectralType,
        primaryMass: primaryStar.mass,
        spectralCat,
        colorHex: primaryStar.colorHex,
        glowColor: primaryStar.colorHex,
        teff: primaryStar.Teff,
        lumLsun: +lumNum.toFixed(3),
        isRemnant,
        remnantType: isRemnant ? primaryStar.spectralType : null,
        nStars,
        archName,
        companionStars,
        planetCount,
        beltCount,
        candidateHabitable,
        sysResult,
      };

      systems.push(system);
      cells.push({ col: c, row: r, coord, system });
    }
  }

  const totalHexes = config.columns * config.rows;
  const occupiedHexes = systems.length;
  const occupancyPct = totalHexes > 0 ? +( (occupiedHexes / totalHexes) * 100 ).toFixed(1) : 0;

  return {
    config,
    cells,
    systems,
    stats: {
      totalHexes,
      occupiedHexes,
      occupancyPct,
      obCount,
      afCount,
      gCount,
      kmCount,
      remnantCount,
      multipleSystemCount,
      heavyMassCount,
    },
  };
}
