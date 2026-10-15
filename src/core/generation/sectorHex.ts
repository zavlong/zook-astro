import { PRNG, seedFromId } from './prng';
import {
  calculateMSLifetimeGyr,
  calculateStellarEvolution,
} from '../astrophysics/evolution';
import { getStarColorRGB } from '../astrophysics/colors';
import { SpectralCategory } from '../../types/astrophysics';

export interface SectorHexSystem {
  // Required core tuple: { age, mass, metallicity, id }
  age: number; // System age in Gyr (e.g. 4.6)
  mass: number; // Total / Primary progenitor mass in M_sun (e.g. 1.02)
  metallicity: number; // [Fe/H] in dex (e.g. +0.05)
  id: string; // Deterministic PRNG seed string (e.g. "SEC-4289-0408")

  // Rich metadata for map rendering & inspector
  name: string;
  col: number; // 1-indexed column
  row: number; // 1-indexed row
  coord: string; // "0101", "0408"
  primaryClass: string; // "G2V", "M4V", "B5V", "White Dwarf", etc.
  spectralCat: SpectralCategory;
  colorHex: string;
  glowColor: string;
  teff: number;
  lumLsun: number;
  isRemnant: boolean;
  remnantType: string | null;
  candidateHabitable: boolean;
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
  density: number; // 0.1 to 0.8
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
 * Samples a stellar progenitor mass using a piecewise Kroupa IMF power-law
 */
function sampleKroupaMass(rng: PRNG): number {
  const u = rng.next();
  let mass: number;
  if (u < 0.08) {
    // Brown dwarf / sub-stellar boundary
    mass = 0.08 + u * (0.12 - 0.08) / 0.08;
  } else if (u < 0.58) {
    // Red dwarfs (0.12 - 0.5 M_sun)
    const t = (u - 0.08) / 0.50;
    mass = 0.12 + Math.pow(t, 1.4) * (0.50 - 0.12);
  } else if (u < 0.88) {
    // K and G dwarf stars (0.50 - 1.25 M_sun)
    const t = (u - 0.58) / 0.30;
    mass = 0.50 + Math.pow(t, 1.2) * (1.25 - 0.50);
  } else if (u < 0.97) {
    // F and A dwarf stars (1.25 - 2.8 M_sun)
    const t = (u - 0.88) / 0.09;
    mass = 1.25 + Math.pow(t, 1.3) * (2.8 - 1.25);
  } else {
    // Rare B and O massive stars (2.8 - 25.0 M_sun)
    const t = (u - 0.97) / 0.03;
    mass = 2.8 + Math.pow(t, 2.0) * (25.0 - 2.8);
  }
  return +mass.toFixed(3);
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
 * Builds the complete Sector Hex Grid with randomly distributed systems
 * Each system has the exact { age, mass, metallicity, id } tuple required
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

      // Local PRNG dedicated to this specific system for reproducible details
      const sysRng = new PRNG(seedFromId(systemId));

      // 1. Mass sample
      const mass = sampleKroupaMass(sysRng);

      // 2. Age sample (clamped between 0.1 and 12.8 Gyr)
      const rawAge = config.meanAge + sysRng.nextGaussian(0, config.ageSigma);
      const age = +Math.max(0.1, Math.min(12.8, rawAge)).toFixed(2);

      // 3. Metallicity sample (with slight cosmic age anti-correlation)
      const ageDrift = -0.04 * (age - config.meanAge);
      const rawFeh = config.metallicityMean + ageDrift + sysRng.nextGaussian(0, config.metallicitySigma);
      const metallicity = +Math.max(-1.8, Math.min(0.55, rawFeh)).toFixed(2);

      // 4. Stellar evolution preview
      const tMS = calculateMSLifetimeGyr(mass);
      const progressPct = Math.min(100.0, (age / tMS) * 50.0);
      const evoState = calculateStellarEvolution(mass, progressPct);
      const colorData = getStarColorRGB(evoState.Teff, evoState.phase);

      const isRemnant = evoState.isRemnant;
      const spectralCat: SpectralCategory = isRemnant
        ? 'remnant'
        : mass > 2.5
        ? 'ob'
        : mass > 1.2
        ? 'af'
        : mass >= 0.8
        ? 'g'
        : 'km';

      if (isRemnant) remnantCount++;
      else if (spectralCat === 'ob') obCount++;
      else if (spectralCat === 'af') afCount++;
      else if (spectralCat === 'g') gCount++;
      else kmCount++;

      // Candidate habitable if G/K dwarf or stable long-lived F dwarf
      const candidateHabitable =
        !isRemnant && mass >= 0.6 && mass <= 1.4 && age >= 1.0 && age <= 10.0;

      const name = generateStarName(c, r, sysRng);

      const system: SectorHexSystem = {
        // Core required tuplet:
        age,
        mass,
        metallicity,
        id: systemId,

        // Visual & descriptive metadata:
        name,
        col: c,
        row: r,
        coord,
        primaryClass: evoState.spectralMK || `${spectralCat.toUpperCase()} Star`,
        spectralCat,
        colorHex: colorData.hex,
        glowColor: colorData.glow,
        teff: evoState.Teff,
        lumLsun: +evoState.L.toFixed(3),
        isRemnant,
        remnantType: evoState.remnantType,
        candidateHabitable,
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
    },
  };
}
