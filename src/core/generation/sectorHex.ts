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
import { hexToRgb, rgbToHex, desaturateToWhite } from './galaxyGen';

export interface SectorHexSystem {
  // Required core tuple: { age, mass, metallicity, id }
  age: number; // System age in Gyr (e.g. 4.6)
  mass: number; // Progenitor system mass in M_sun (sysMass, e.g. 1.02)
  metallicity: number; // [Fe/H] in dex (e.g. +0.05)
  id: string; // Deterministic PRNG seed string (e.g. "SYS-0408-A938")

  // Position and Zone of Influence
  x: number; // Continuous X position within sector bounds (px)
  y: number; // Continuous Y position within sector bounds (px)
  influenceRadius: number; // Radius of circular zone of influence (e.g. 24 to 42 px)
  parsecX: number; // Astronomical relative position in parsecs
  parsecY: number;

  // Exact stellar data derived directly from system generator (RealisticStarSystemResult)
  name: string;
  col: number; // 1-indexed column / sector quadrant X
  row: number; // 1-indexed row / sector quadrant Y
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
  habitableWorldCount?: number;
  habitableTypes?: string[];
  isGiantSystem?: boolean; // Giant star system (mass 10 to 50 M_sun)
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
  coord?: string; // e.g. "2525" for central galactic sector
  columns: number;
  rows: number;
  density: number; // 0.05 to 3.5 (supports >100% overdensities)
  meanAge: number; // 0.5 to 11 Gyr
  ageSigma: number;
  ageRange?: number; // Total age spread in Gyr (e.g. 1.5 Gyr for halo, 11.2 Gyr for bulge)
  ageDistribution?: 'normal' | 'uniform'; // Galactic bulge has uniform distribution
  metallicityMean: number; // -1.5 to +0.4 dex
  metallicitySigma: number;
  hasNebula?: boolean; // Flag: whether background is plain black or noise clouds
}

export interface SectorHyperlane {
  id: string; // "HL-SYS1__SYS2" or "HL-EDGE-SYS"
  sourceId: string;
  targetId: string;
  sourceCoord: string;
  targetCoord: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lengthPx: number;
  lengthLy: number;
  isEdgeLane?: boolean; // Connects border star to hexagon perimeter
}

export interface SectorNebulaBlob {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation: number;
  coreColor: string;
  midColor: string;
  opacity: number;
}

export interface SectorNebulaDustLane {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  strokeWidth: number;
  opacity: number;
}

export interface SectorNebula {
  name: string;
  type: string; // "H II Emission Nursery"
  description: string;
  blobs: SectorNebulaBlob[];
  dustLanes: SectorNebulaDustLane[];
}

export interface SectorHexGridData {
  config: SectorHexConfig;
  sectorWidth: number;
  sectorHeight: number;
  parsecWidth: number;
  parsecHeight: number;
  cells: SectorHexCell[];
  systems: SectorHexSystem[];
  hyperlanes: SectorHyperlane[]; // Procedural hyperlanes connecting neighboring stars
  integratedColorHex: string; // Luminosity-weighted average color of all constituent stars in sector
  hasNebula: boolean; // Flag: whether sector map background should be noise clouds (true) or plain black (false)
  nebula: SectorNebula | null; // Procedural purple-red cloud nebula (only present in young sectors < 1.0 Gyr)
  hexRadius: number; // Pointy-topped regular hexagon radius of sector boundary
  hexCenterX: number;
  hexCenterY: number;
  hexPoints: string; // SVG polygon points string for sector hexagon border
  hexInnerPoints: string; // SVG polygon points string for inner dashed boundary
  hexVertices: { x: number; y: number }[]; // 6 vertex coordinates
  stats: {
    totalHexes: number;
    occupiedHexes: number;
    occupancyPct: number;
    totalStars: number;
    hyperlaneCount: number;
    obCount: number;
    afCount: number;
    gCount: number;
    kmCount: number;
    remnantCount: number;
    multipleSystemCount: number;
    heavyMassCount: number;
    giantCount: number;
    habitableCount: number;
    nonMsCount: number;
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
  hasNebula: false,
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
 * Builds the complete Sector with stars in continuous random positions.
 * Each star is surrounded by a circular "zone of influence" with spatial coordinates (x, y).
 * CRITICAL ARCHITECTURE: Calls runRealisticGenerator(params) directly using the { age, mass, metallicity, id }
 * tuple, then extracts all stellar and planetary data from the system generator result.
 */
export function generateSectorHexGrid(config: SectorHexConfig = DEFAULT_SECTOR_CONFIG): SectorHexGridData {
  const sectorSeedInt = seedFromId(config.seed);
  const rng = new PRNG(sectorSeedInt);

  // Sector dimensions in canvas pixels and astronomical parsecs
  const sectorWidth = Math.max(800, config.columns * 54);
  const sectorHeight = Math.max(600, config.rows * 54);
  const parsecWidth = +(config.columns * 2.5).toFixed(1);
  const parsecHeight = +(config.rows * 2.5).toFixed(1);

  // Number of giant star systems (mass 10 to 50 times solar): density in percent, divide by 10, round down
  const densityPct = Math.round(config.density * 100);
  const numGiantSystems = Math.floor(densityPct / 10);

  // Total stars in sector: baseline density of stars reduced by half (effective density of 50% before overflow at 100%)
  const effectiveDensity = config.density * 0.5;
  const targetStarCount = Math.max(
    Math.max(1, numGiantSystems),
    Math.round(config.columns * config.rows * effectiveDensity)
  );

  const padding = 55;
  const usableW = sectorWidth - padding * 2;
  const usableH = sectorHeight - padding * 2;

  // Sector hexagon boundary geometry (matching galaxy map pointy-topped orientation)
  const hexCenterX = Math.round(sectorWidth / 2);
  const hexCenterY = Math.round(sectorHeight / 2);
  const hexRadius = Math.round(Math.min((sectorWidth - 80) / Math.sqrt(3), (sectorHeight - 80) / 2));
  const innerRadius = Math.round(hexRadius * 0.985);

  const hexVertices: { x: number; y: number }[] = [];
  const hexPointsArr: string[] = [];
  const hexInnerArr: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const vx = Math.round(hexCenterX + hexRadius * Math.cos(angle));
    const vy = Math.round(hexCenterY + hexRadius * Math.sin(angle));
    hexVertices.push({ x: vx, y: vy });
    hexPointsArr.push(`${vx},${vy}`);

    const ivx = Math.round(hexCenterX + innerRadius * Math.cos(angle));
    const ivy = Math.round(hexCenterY + innerRadius * Math.sin(angle));
    hexInnerArr.push(`${ivx},${ivy}`);
  }
  const hexPoints = hexPointsArr.join(' ');
  const hexInnerPoints = hexInnerArr.join(' ');

  // Helper: check if a coordinate lies inside the sector hexagon (pointy-topped)
  const isInsideSectorHex = (x: number, y: number, margin = 48): boolean => {
    const dx = Math.abs(x - hexCenterX);
    const dy = Math.abs(y - hexCenterY);
    const effR = hexRadius - margin;
    const wR = effR * (Math.sqrt(3) / 2);
    if (dx > wR || dy > effR) return false;
    return (dx / Math.sqrt(3) + dy) <= effR;
  };

  // Compute organic spacing within the hexagon interior
  const hexArea = ((3 * Math.sqrt(3)) / 2) * Math.pow(Math.max(100, hexRadius - 48), 2);
  const avgArea = hexArea / targetStarCount;
  const idealDist = Math.sqrt(avgArea);
  const minSpacing = Math.max(26, Math.min(65, idealDist * 0.70));
  const minDistSq = minSpacing * minSpacing;

  const placedCoords: { x: number; y: number }[] = [];

  const hexHalfW = (hexRadius - 48) * (Math.sqrt(3) / 2);
  const hexHalfH = hexRadius - 48;

  for (let i = 0; i < targetStarCount; i++) {
    let bestX = hexCenterX;
    let bestY = hexCenterY;
    let bestMinDistSq = -1;

    // Fast candidate sampling inside the hexagon boundary
    for (let attempt = 0; attempt < 8; attempt++) {
      const candX = hexCenterX + (rng.next() * 2 - 1) * hexHalfW;
      const candY = hexCenterY + (rng.next() * 2 - 1) * hexHalfH;

      if (!isInsideSectorHex(candX, candY, 48)) {
        continue;
      }

      let nearestSq = Infinity;
      for (let p = 0; p < placedCoords.length; p++) {
        const dx = candX - placedCoords[p].x;
        const dy = candY - placedCoords[p].y;
        const dSq = dx * dx + dy * dy;
        if (dSq < nearestSq) nearestSq = dSq;
      }

      if (nearestSq >= minDistSq) {
        bestX = candX;
        bestY = candY;
        break;
      }
      if (nearestSq > bestMinDistSq) {
        bestMinDistSq = nearestSq;
        bestX = candX;
        bestY = candY;
      }
    }

    placedCoords.push({ x: Math.round(bestX), y: Math.round(bestY) });
  }

  const cells: SectorHexCell[] = [];
  const systems: SectorHexSystem[] = [];

  let obCount = 0;
  let afCount = 0;
  let gCount = 0;
  let kmCount = 0;
  let remnantCount = 0;
  let multipleSystemCount = 0;
  let heavyMassCount = 0;
  let giantCount = 0;
  let habitableCount = 0;

  let sumSectorR = 0;
  let sumSectorG = 0;
  let sumSectorB = 0;
  let totalSectorLum = 0;

  for (let i = 0; i < placedCoords.length; i++) {
    const { x, y } = placedCoords[i];

    // Map continuous coordinates to sector quadrant locator (e.g. 0408)
    const c = Math.min(config.columns, Math.max(1, Math.floor(((x - padding) / usableW) * config.columns) + 1));
    const r = Math.min(config.rows, Math.max(1, Math.floor(((y - padding) / usableH) * config.rows) + 1));
    const coord = formatHexCoord(c, r);

    const cellSeedNum = Math.floor(rng.next() * 8999) + 1000;
    const systemId = `SYS-${coord}-${cellSeedNum.toString(16).toUpperCase()}`;
    const sysRng = new PRNG(seedFromId(systemId));

    // Giant star systems: density in percent / 10 rounded down
    const isGiantSystem = i < numGiantSystems;
    let mass: number;
    let age: number;

    if (isGiantSystem) {
      // Giant star system: Mass between 10 and 50 times solar
      mass = +(10.0 + sysRng.next() * 40.0).toFixed(3);
      // High variety: O/B supergiant, red supergiant, blue hypergiant, pulsar, or black hole
      const Lz = 1.15 * Math.pow(mass, 3.5);
      const tMS = Math.max(0.005, 10.0 * (mass / Lz) * Math.pow(mass, 1.35));
      const lifeRoll = sysRng.next();
      if (lifeRoll < 0.60) {
        // Main sequence O/B star
        age = +(sysRng.next() * tMS * 0.90).toFixed(4);
      } else if (lifeRoll < 0.85) {
        // Post-main-sequence supergiant stage
        age = +(tMS * (1.01 + sysRng.next() * 0.12)).toFixed(4);
      } else {
        // High-energy compact remnant (Neutron Star / Black Hole)
        age = +(tMS * (1.18 + sysRng.next() * 0.50)).toFixed(4);
      }
      heavyMassCount++;
      giantCount++;
    } else {
      // 1. Standard progenitor mass with density overflow
      mass = sampleSystemMass(sysRng, config.density);
      if (mass >= 3.0) heavyMassCount++;

      // 2. Age sample (clamped between 0.1 and 12.8 Gyr, honoring uniform distribution for galactic bulge)
      let rawAge: number;
      if (config.ageDistribution === 'uniform' && config.ageRange) {
        rawAge = config.meanAge + (sysRng.next() - 0.5) * config.ageRange;
      } else {
        const sigma = config.ageSigma || (config.ageRange ? config.ageRange / 3.2 : 1.0);
        rawAge = config.meanAge + sysRng.nextGaussian(0, sigma);
      }
      age = +Math.max(0.1, Math.min(12.8, rawAge)).toFixed(2);
    }

    // 3. Metallicity sample (with cosmic age anti-correlation)
    const ageDrift = -0.04 * (age - config.meanAge);
    const rawFeh = config.metallicityMean + ageDrift + sysRng.nextGaussian(0, config.metallicitySigma);
    const metallicity = +Math.max(-1.8, Math.min(0.55, rawFeh)).toFixed(2);

    const name = generateStarName(c, r, sysRng);

    // Fun Rule: Densities > 100% trigger gravitational capture and high multiple-star systems
    let forcedMult: 'auto' | '1' | '2' | '3' | '4' = 'auto';
    if (config.density > 1.0) {
      const multRoll = sysRng.next();
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

    // Spectral classification
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

    // Check planets and habitable candidate worlds (Water Habitable Zone or Cryo-Ammonia Life)
    let planetCount = 0;
    let beltCount = 0;
    let candidateHabitable = false;
    let habitableWorldCount = 0;
    const habitableTypesSet = new Set<string>();

    for (const zone of sysResult.zones) {
      for (const body of zone.bodies) {
        if (body.kind === 'planet') {
          planetCount++;

          const isWaterHZ =
            body.planetClass.includes('Habitable') ||
            (body.surfaceTempK >= 255 &&
              body.surfaceTempK <= 335 &&
              body.hydrosphere &&
              (body.hydrosphere.coveragePct || 0) > 5);

          const isAmmoniaWorld =
            body.planetClass.includes('Ammonia') ||
            body.planetClass.includes('Cryo-Ammonia') ||
            body.hydrosphere?.solvent === 'NH3-H2O' ||
            (body.surfaceTempK >= 120 &&
              body.surfaceTempK <= 245 &&
              body.hydrosphere &&
              (body.hydrosphere.coveragePct || 0) > 0);

          const hasBiosphere = Boolean(body.hydrosphere?.biosphere);

          if (isWaterHZ || isAmmoniaWorld || hasBiosphere) {
            candidateHabitable = true;
            habitableWorldCount++;
            if (isAmmoniaWorld) {
              habitableTypesSet.add('Ammonia World');
            } else {
              habitableTypesSet.add('Water HZ');
            }
          }

          // Also inspect moons for habitable / cryo-ammonia worlds
          if (body.moons && body.moons.length > 0) {
            for (const moon of body.moons) {
              const isMoonWaterHZ = moon.moonClass.includes('Habitable');
              const isMoonAmmonia =
                moon.moonClass.includes('Ammonia') ||
                moon.moonClass.includes('Cryo-Ammonia') ||
                moon.hydrosphere?.solvent === 'NH3-H2O';
              const moonHasBio = Boolean(moon.hydrosphere?.biosphere);

              if (isMoonWaterHZ || isMoonAmmonia || moonHasBio) {
                candidateHabitable = true;
                habitableWorldCount++;
                habitableTypesSet.add(isMoonAmmonia ? 'Ammonia Moon' : 'Habitable Moon');
              }
            }
          }
        } else if (body.kind === 'belt') {
          beltCount++;
        }
      }
    }
    if (candidateHabitable) habitableCount++;
    const habitableTypes = Array.from(habitableTypesSet);

    const lumNum = typeof primaryStar.lumNum === 'number' ? primaryStar.lumNum : 1;

    // Physical radius scaling: scale with square root of radius, clamping white dwarfs, neutron stars, and black holes to smallest brown dwarf (0.08 R_sun)
    const MIN_BD_R = 0.08;
    const rSolar = isRemnant ? MIN_BD_R : Math.max(MIN_BD_R, primaryStar.radius || 1.0);
    const rBase = 24 + 4.5 * Math.sqrt(rSolar);
    const rMulti = nStars > 1 ? (nStars === 2 ? 4 : 7) : 0;
    const influenceRadius = Math.round(Math.min(46, Math.max(24, rBase + rMulti)));

    // Relative parsec coordinates
    const parsecX = +(((x - padding) / usableW) * parsecWidth - parsecWidth / 2).toFixed(1);
    const parsecY = +(((y - padding) / usableH) * parsecHeight - parsecHeight / 2).toFixed(1);

    const system: SectorHexSystem = {
      age,
      mass,
      metallicity,
      id: systemId,

      x,
      y,
      influenceRadius,
      parsecX,
      parsecY,

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
      habitableWorldCount,
      habitableTypes,
      isGiantSystem,
      sysResult,
    };

    // Accumulate luminosity-weighted color of all constituent stars
    for (const st of sysResult.hierarchy.stars) {
      const lum = Math.max(1e-4, typeof st.lumNum === 'number' ? st.lumNum : 0.001);
      const rgb = hexToRgb(st.colorHex || '#ffffff');
      sumSectorR += lum * rgb.r;
      sumSectorG += lum * rgb.g;
      sumSectorB += lum * rgb.b;
      totalSectorLum += lum;
    }

    systems.push(system);
    cells.push({ col: c, row: r, coord, system });
  }

  // Special System for Sector 2525 (Center of Galaxy Map):
  // "if sector number = 2525, create system with 1000000 solar masses (no effect to the rest of the mass number)"
  const isSector2525 = config.coord === '2525' || config.name?.includes('2525');
  if (isSector2525) {
    const smbhX = Math.round(sectorWidth / 2);
    const smbhY = Math.round(sectorHeight / 2);

    // Gently push any regular star that is too close away from the SMBH accretion boundary
    for (const s of systems) {
      const dx = s.x - smbhX;
      const dy = s.y - smbhY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 46) {
        const angle = dist > 0 ? Math.atan2(dy, dx) : 0;
        s.x = Math.round(smbhX + Math.cos(angle) * 52);
        s.y = Math.round(smbhY + Math.sin(angle) * 52);
      }
    }

    const smbhCol = Math.min(config.columns, Math.max(1, Math.floor(((smbhX - padding) / usableW) * config.columns) + 1));
    const smbhRow = Math.min(config.rows, Math.max(1, Math.floor(((smbhY - padding) / usableH) * config.rows) + 1));
    const smbhCoord = formatHexCoord(smbhCol, smbhRow);
    const smbhId = `SYS-2525-SMBH`;

    const smbhParams: StarGenParams = {
      sysMass: 1000000,
      age: config.meanAge,
      feh: Math.max(0.20, config.metallicityMean),
      id: smbhId,
      name: 'Sagittarius A* (Galactic SMBH)',
      forcedMult: 'auto',
    };
    const smbhSysResult = runRealisticGenerator(smbhParams);
    const primaryStar = smbhSysResult.hierarchy.stars[0];
    const companionStars = smbhSysResult.hierarchy.stars.slice(1);
    const nStars = smbhSysResult.hierarchy.stars.length;

    let beltCount = 0;
    for (const zone of smbhSysResult.zones) {
      for (const body of zone.bodies) {
        if (body.kind === 'belt') beltCount++;
      }
    }

    const smbhSystem: SectorHexSystem = {
      age: config.meanAge,
      mass: 1000000,
      metallicity: Math.max(0.20, config.metallicityMean),
      id: smbhId,
      x: smbhX,
      y: smbhY,
      influenceRadius: 54,
      parsecX: 0,
      parsecY: 0,
      name: 'Sagittarius A* (Galactic SMBH)',
      col: smbhCol,
      row: smbhRow,
      coord: smbhCoord,
      primaryClass: primaryStar.spectralType,
      primaryMass: 1000000,
      spectralCat: 'remnant',
      colorHex: primaryStar.colorHex,
      glowColor: '#a855f7',
      teff: primaryStar.Teff,
      lumLsun: typeof primaryStar.lumNum === 'number' ? primaryStar.lumNum : 1250000,
      isRemnant: true,
      remnantType: 'Supermassive Black Hole',
      nStars,
      archName: smbhSysResult.hierarchy.archName,
      companionStars,
      planetCount: 0,
      beltCount,
      candidateHabitable: false,
      habitableWorldCount: 0,
      habitableTypes: [],
      isGiantSystem: false,
      sysResult: smbhSysResult,
    };

    // Prepend so Sagittarius A* is the primary system and default selection of sector 2525
    systems.unshift(smbhSystem);
    cells.unshift({ col: smbhCol, row: smbhRow, coord: smbhCoord, system: smbhSystem });
    remnantCount++;
    multipleSystemCount++;
    heavyMassCount++;
  }

  // Compute the sector's integrated color as luminosity-weighted average of all constituent stars
  let integratedColorHex = '#60a5fa';
  if (totalSectorLum > 0) {
    const avgR = Math.round(sumSectorR / totalSectorLum);
    const avgG = Math.round(sumSectorG / totalSectorLum);
    const avgB = Math.round(sumSectorB / totalSectorLum);
    integratedColorHex = rgbToHex(avgR, avgG, avgB);
    if (config.density > 1.0) {
      const factor = Math.min(0.96, Math.pow((config.density - 1.0) / 2.0, 0.85) * 0.95);
      integratedColorHex = desaturateToWhite(integratedColorHex, factor);
    }
  }

  // Generate procedural hyperlanes connecting each star to its 4 closest systems, plus edge jump lanes
  const hyperlanes = generateProceduralHyperlanes(systems, hexVertices);

  const totalHexes = config.columns * config.rows;
  const occupiedHexes = systems.length;
  const occupancyPct = totalHexes > 0 ? +((occupiedHexes / totalHexes) * 100).toFixed(1) : 0;

  let nonMsCount = 0;
  for (let i = 0; i < systems.length; i++) {
    if (isNonMainSequenceSystem(systems[i])) {
      nonMsCount++;
    }
  }

  // Nebulae flag determines whether background is noise clouds vs plain black
  const hasNebula = Boolean(
    typeof config.hasNebula === 'boolean'
      ? config.hasNebula
      : (config.meanAge < 1.0 && config.density >= 0.08)
  );

  // If hasNebula is true, generate the nebula cloud structures for the noise clouds
  const nebula = hasNebula ? generateSectorNebula(config.seed, sectorWidth, sectorHeight, 0.5) : null;

  return {
    config: { ...config, hasNebula },
    sectorWidth,
    sectorHeight,
    parsecWidth,
    parsecHeight,
    cells,
    systems,
    hyperlanes,
    integratedColorHex,
    hasNebula,
    nebula,
    hexRadius,
    hexCenterX,
    hexCenterY,
    hexPoints,
    hexInnerPoints,
    hexVertices,
    stats: {
      totalHexes,
      occupiedHexes,
      occupancyPct,
      totalStars: systems.length,
      hyperlaneCount: hyperlanes.length,
      obCount,
      afCount,
      gCount,
      kmCount,
      remnantCount,
      multipleSystemCount,
      heavyMassCount,
      giantCount,
      habitableCount,
      nonMsCount,
    },
  };
}

/**
 * Returns true if the star or system is a Black Hole (Stellar Black Hole or Supermassive Black Hole).
 */
export function isBlackHoleStar(star: { category?: string; spectralType?: string }): boolean {
  const cat = (star.category || '').toLowerCase();
  const sp = (star.spectralType || '').toLowerCase();
  return (
    cat.includes('black hole') ||
    sp.includes('black hole') ||
    sp.includes('smbh') ||
    sp === 'bh' ||
    sp.startsWith('bh ') ||
    sp.startsWith('bh(') ||
    sp.includes('/ bh')
  );
}

/**
 * Returns true if the star is specifically a Supermassive Black Hole.
 */
export function isSupermassiveBlackHole(star: { category?: string; spectralType?: string; mass?: number }): boolean {
  const cat = (star.category || '').toLowerCase();
  const sp = (star.spectralType || '').toLowerCase();
  return (
    cat.includes('supermassive') ||
    sp.includes('smbh') ||
    (typeof star.mass === 'number' && star.mass > 999999)
  );
}

/**
 * Generates procedural H-II purple-red gas cloud nebulae for young sectors (< 1.0 Gyr).
 * Produces organic gaseous lobes and dust filaments with vivid crimson, magenta, and violet hues.
 */
export function generateSectorNebula(
  seed: number,
  sectorWidth: number,
  sectorHeight: number,
  meanAge: number
): SectorNebula | null {
  // STRICT RULE: Can only generate in young sectors (< 1.0 Gyr)
  if (meanAge >= 1.0) return null;

  const rng = new PRNG(seed + 9999);
  // ~65% probability of a young sector (<1 Gy) harboring an active nebula complex
  if (rng.next() >= 0.65) return null;

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
  const name = NEBULA_NAMES[Math.floor(rng.next() * NEBULA_NAMES.length)];

  // Distinct purple-red color palettes typical of ionized hydrogen-alpha (656.3 nm) and young stellar winds
  const CORE_COLORS = [
    '#e11d48', // Crimson rose
    '#f43f5e', // Hot pink / rose
    '#be123c', // Deep crimson
    '#c026d3', // Electric fuchsia
    '#db2777', // Vivid magenta
    '#e879f9', // Bright lilac-pink
  ];
  const MID_COLORS = [
    '#9333ea', // Deep violet
    '#7e22ce', // Royal purple
    '#a855f7', // Electric purple
    '#581c87', // Dark cosmic plum
    '#6b21a8', // Rich violet
  ];

  const blobCount = Math.floor(rng.next() * 6) + 8; // 8 to 13 cloud lobes
  const blobs: SectorNebulaBlob[] = [];

  // Anchor primary cloud centers around 1 or 2 focal regions in the sector
  const focalCenters = [
    {
      x: sectorWidth * (0.3 + rng.next() * 0.4),
      y: sectorHeight * (0.3 + rng.next() * 0.4),
    },
    {
      x: sectorWidth * (0.2 + rng.next() * 0.6),
      y: sectorHeight * (0.2 + rng.next() * 0.6),
    },
  ];

  for (let i = 0; i < blobCount; i++) {
    const focal = focalCenters[i % focalCenters.length];
    const offsetX = (rng.next() - 0.5) * (sectorWidth * 0.65);
    const offsetY = (rng.next() - 0.5) * (sectorHeight * 0.65);
    const cx = Math.max(0, Math.min(sectorWidth, focal.x + offsetX));
    const cy = Math.max(0, Math.min(sectorHeight, focal.y + offsetY));

    const rx = Math.max(80, (0.18 + rng.next() * 0.32) * sectorWidth);
    const ry = Math.max(60, (0.14 + rng.next() * 0.28) * sectorHeight);
    const rotation = Math.floor(rng.next() * 180);

    const coreColor = CORE_COLORS[Math.floor(rng.next() * CORE_COLORS.length)];
    const midColor = MID_COLORS[Math.floor(rng.next() * MID_COLORS.length)];
    const opacity = +(0.32 + rng.next() * 0.35).toFixed(2);

    blobs.push({
      cx: +cx.toFixed(1),
      cy: +cy.toFixed(1),
      rx: +rx.toFixed(1),
      ry: +ry.toFixed(1),
      rotation,
      coreColor,
      midColor,
      opacity,
    });
  }

  // Generate 3 to 6 dark dust absorption filaments
  const dustLaneCount = Math.floor(rng.next() * 4) + 3;
  const dustLanes: SectorNebulaDustLane[] = [];
  for (let i = 0; i < dustLaneCount; i++) {
    const focal = focalCenters[i % focalCenters.length];
    const x1 = focal.x + (rng.next() - 0.5) * (sectorWidth * 0.45);
    const y1 = focal.y + (rng.next() - 0.5) * (sectorHeight * 0.45);
    const angle = rng.next() * Math.PI * 2;
    const len = 70 + rng.next() * 180;
    const x2 = x1 + Math.cos(angle) * len;
    const y2 = y1 + Math.sin(angle) * len;

    dustLanes.push({
      x1: +x1.toFixed(1),
      y1: +y1.toFixed(1),
      x2: +x2.toFixed(1),
      y2: +y2.toFixed(1),
      cx: +((x1 + x2) / 2).toFixed(1),
      cy: +((y1 + y2) / 2).toFixed(1),
      strokeWidth: +(14 + rng.next() * 26).toFixed(1),
      opacity: +(0.25 + rng.next() * 0.35).toFixed(2),
    });
  }

  return {
    name,
    type: 'H II Emission Nursery',
    description: `Young star-forming gas cloud (<1.0 Gyr). Intense stellar winds and ultraviolet radiation excite ionized hydrogen and interstellar dust into glowing purple-red filaments.`,
    blobs,
    dustLanes,
  };
}

/**
 * Returns true if the system's primary star is Non-Main Sequence
 * (i.e. Morgan-Keenan luminosity class is NOT V: giants III, bright giants II,
 * supergiants I/Ia/Ib, subgiants IV, subdwarfs VI, white dwarfs, neutron stars, black holes, SMBH).
 */
export function isNonMainSequenceSystem(system: SectorHexSystem): boolean {
  if (system.isRemnant) return true;
  const primary = system.sysResult?.hierarchy?.stars?.[0];
  if (!primary) return false;
  if (primary.category && primary.category !== 'Main Sequence') return true;

  const sp = (primary.spectralType || system.primaryClass || '').trim();
  if (
    sp.includes('PSR') ||
    sp.includes('NS') ||
    sp.includes('BH') ||
    sp.includes('WD') ||
    sp.includes('SMBH') ||
    sp.includes('Giant') ||
    sp.includes('Supergiant')
  ) {
    return true;
  }
  // Subgiant IV ends with 'IV' -> Luminosity Class IV (not V!)
  if (sp.endsWith('IV')) return true;
  // Subdwarf VI ends with 'VI' -> Luminosity Class VI (not V!)
  if (sp.endsWith('VI')) return true;
  // Luminosity class V (Main Sequence Dwarf)
  if (sp.endsWith('V')) return false;
  // Any other ending: Ia, Ib, II, III, etc.
  return true;
}

/**
 * Squared perpendicular distance from point (px, py) to line segment (x1, y1)-(x2, y2)
 */
function distToSegmentSq(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

/**
 * 2D counter-clockwise orientation test
 */
function ccw(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): number {
  return (y3 - y1) * (x2 - x1) - (y2 - y1) * (x3 - x1);
}

/**
 * Returns true if segment (x1, y1)-(x2, y2) strictly intersects (crosses) segment (x3, y3)-(x4, y4)
 */
function doSegmentsCross(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): boolean {
  const d1 = ccw(x1, y1, x2, y2, x3, y3);
  const d2 = ccw(x1, y1, x2, y2, x4, y4);
  const d3 = ccw(x3, y3, x4, y4, x1, y1);
  const d4 = ccw(x3, y3, x4, y4, x2, y2);

  if (((d1 > 1e-4 && d2 < -1e-4) || (d1 < -1e-4 && d2 > 1e-4)) &&
      ((d3 > 1e-4 && d4 < -1e-4) || (d3 < -1e-4 && d4 > 1e-4))) {
    return true;
  }
  return false;
}

/**
 * Projects a 2D point onto a line segment and returns the projected coordinates and distance
 */
function projectPointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number; dist: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) {
    const d = Math.hypot(px - x1, py - y1);
    return { x: x1, y: y1, dist: d };
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0.08, Math.min(0.92, t)); // Stay slightly away from extreme vertex corners
  const projX = Math.round(x1 + t * dx);
  const projY = Math.round(y1 + t * dy);
  const dist = Math.hypot(px - projX, py - projY);
  return { x: projX, y: projY, dist };
}

/**
 * Procedural Hyperlanes Generator:
 * Connects each star to its 4 closest systems, then deletes any lanes that overlap (cross)
 * each other or pass directly through intermediate stars, creating a clean, planar interstellar network.
 * Also connects stars within range of the sector border to the hexagon edge with one edge jump lane.
 */
export function generateProceduralHyperlanes(
  systems: SectorHexSystem[],
  hexVertices?: { x: number; y: number }[]
): SectorHyperlane[] {
  if (systems.length < 2) return [];

  interface CandidateEdge {
    source: SectorHexSystem;
    target: SectorHexSystem;
    distSq: number;
    dist: number;
  }

  const candidateEdgesMap = new Map<string, CandidateEdge>();

  // 1. Connect each star to its 4 closest systems (reduced from 6 to maximize performance)
  for (let i = 0; i < systems.length; i++) {
    const starA = systems[i];
    const neighbors: { star: SectorHexSystem; distSq: number }[] = [];
    for (let j = 0; j < systems.length; j++) {
      if (i === j) continue;
      const starB = systems[j];
      const dx = starA.x - starB.x;
      const dy = starA.y - starB.y;
      neighbors.push({ star: starB, distSq: dx * dx + dy * dy });
    }

    // Sort by distance ascending and pick 4 closest
    neighbors.sort((a, b) => a.distSq - b.distSq);
    const closest4 = neighbors.slice(0, 4);

    for (const nb of closest4) {
      const idKey = starA.id < nb.star.id ? `${starA.id}__${nb.star.id}` : `${nb.star.id}__${starA.id}`;
      if (!candidateEdgesMap.has(idKey)) {
        const dist = Math.sqrt(nb.distSq);
        candidateEdgesMap.set(idKey, {
          source: starA,
          target: nb.star,
          distSq: nb.distSq,
          dist,
        });
      }
    }
  }

  // 2. Sort candidate edges by length ascending (shortest lanes first)
  const candidateEdges = Array.from(candidateEdgesMap.values());
  candidateEdges.sort((a, b) => a.dist - b.dist);

  // 3. Delete lanes that overlap each other or pass through intermediate stars
  const acceptedEdges: CandidateEdge[] = [];

  for (const candidate of candidateEdges) {
    const a = candidate.source;
    const b = candidate.target;

    // Check if candidate passes directly through another star C
    let passesThroughStar = false;
    for (let s = 0; s < systems.length; s++) {
      const c = systems[s];
      if (c.id === a.id || c.id === b.id) continue;
      const dSq = distToSegmentSq(c.x, c.y, a.x, a.y, b.x, b.y);
      if (dSq < 14 * 14) {
        passesThroughStar = true;
        break;
      }
    }
    if (passesThroughStar) continue;

    // Check if candidate overlaps/crosses any already accepted edge
    let crossesOtherLane = false;
    for (const existing of acceptedEdges) {
      if (
        existing.source.id === a.id ||
        existing.source.id === b.id ||
        existing.target.id === a.id ||
        existing.target.id === b.id
      ) {
        continue;
      }

      if (doSegmentsCross(a.x, a.y, b.x, b.y, existing.source.x, existing.source.y, existing.target.x, existing.target.y)) {
        crossesOtherLane = true;
        break;
      }
    }

    if (!crossesOtherLane) {
      acceptedEdges.push(candidate);
    }
  }

  // 4. Map to SectorHyperlane objects
  const mappedHyperlanes: SectorHyperlane[] = acceptedEdges.map((e) => {
    const key = `${e.source.id}__${e.target.id}`;
    // 54px ~ 2.5 pc -> ~0.15 ly/px
    const lengthLy = +(e.dist * 0.15).toFixed(1);
    return {
      id: `HL-${key}`,
      sourceId: e.source.id,
      targetId: e.target.id,
      sourceCoord: e.source.coord,
      targetCoord: e.target.coord,
      x1: e.source.x,
      y1: e.source.y,
      x2: e.target.x,
      y2: e.target.y,
      lengthPx: Math.round(e.dist),
      lengthLy,
    };
  });

  // 5. Connect border systems within range to the nearest hexagon edge with ONE lane
  if (hexVertices && hexVertices.length === 6) {
    const EDGE_THRESHOLD_PX = 135; // Systems within 135px of an edge qualify for an edge lane
    const edgeLanes: SectorHyperlane[] = [];

    for (const star of systems) {
      let closestEdgeIdx = -1;
      let minEdgeDist = Infinity;
      let bestProjX = 0;
      let bestProjY = 0;

      for (let k = 0; k < 6; k++) {
        const v1 = hexVertices[k];
        const v2 = hexVertices[(k + 1) % 6];
        const proj = projectPointToSegment(star.x, star.y, v1.x, v1.y, v2.x, v2.y);
        if (proj.dist < minEdgeDist) {
          minEdgeDist = proj.dist;
          closestEdgeIdx = k;
          bestProjX = proj.x;
          bestProjY = proj.y;
        }
      }

      if (closestEdgeIdx >= 0 && minEdgeDist <= EDGE_THRESHOLD_PX) {
        // Check that this edge lane does not pass through another star
        let blocked = false;
        for (let s = 0; s < systems.length; s++) {
          const other = systems[s];
          if (other.id === star.id) continue;
          const dSq = distToSegmentSq(other.x, other.y, star.x, star.y, bestProjX, bestProjY);
          if (dSq < 14 * 14) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;

        // Check that this edge lane does not cross existing accepted hyperlanes
        for (const existing of mappedHyperlanes) {
          if (existing.sourceId === star.id || existing.targetId === star.id) continue;
          if (doSegmentsCross(star.x, star.y, bestProjX, bestProjY, existing.x1, existing.y1, existing.x2, existing.y2)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;

        // Check that this edge lane does not cross another already accepted edge lane
        for (const existingEdge of edgeLanes) {
          if (doSegmentsCross(star.x, star.y, bestProjX, bestProjY, existingEdge.x1, existingEdge.y1, existingEdge.x2, existingEdge.y2)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;

        // Connect this system to the nearest hexagon edge with ONE lane!
        edgeLanes.push({
          id: `HL-EDGE-${star.id}`,
          sourceId: star.id,
          targetId: `EDGE-${closestEdgeIdx}`,
          sourceCoord: star.coord,
          targetCoord: 'EDGE',
          x1: star.x,
          y1: star.y,
          x2: bestProjX,
          y2: bestProjY,
          lengthPx: Math.round(minEdgeDist),
          lengthLy: +(minEdgeDist * 0.15).toFixed(1),
          isEdgeLane: true,
        });
      }
    }

    return [...mappedHyperlanes, ...edgeLanes];
  }

  return mappedHyperlanes;
}
