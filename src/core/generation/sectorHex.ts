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

export interface SectorHyperlane {
  id: string; // "HL-SYS1__SYS2"
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
    habitableCount: number;
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

  // Total stars in sector: baseline density of stars reduced by half (effective density of 50% before overflow at 100%)
  const effectiveDensity = config.density * 0.5;
  const targetStarCount = Math.max(1, Math.round(config.columns * config.rows * effectiveDensity));

  const padding = 55;
  const usableW = sectorWidth - padding * 2;
  const usableH = sectorHeight - padding * 2;

  // Compute organic spacing to prevent direct overlap while keeping natural Poisson distribution
  const avgArea = (usableW * usableH) / targetStarCount;
  const idealDist = Math.sqrt(avgArea);
  const minSpacing = Math.max(26, Math.min(65, idealDist * 0.70));
  const minDistSq = minSpacing * minSpacing;

  const placedCoords: { x: number; y: number }[] = [];

  for (let i = 0; i < targetStarCount; i++) {
    let bestX = padding + rng.next() * usableW;
    let bestY = padding + rng.next() * usableH;
    let bestMinDistSq = -1;

    // Fast candidate sampling using squared Euclidean distance without expensive square roots
    for (let attempt = 0; attempt < 6; attempt++) {
      const candX = padding + rng.next() * usableW;
      const candY = padding + rng.next() * usableH;

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

    // 1. Progenitor mass with density overflow
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

    // Check planets and habitable candidate worlds
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
    if (candidateHabitable) habitableCount++;

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

  // Generate procedural hyperlanes connecting each star to its 6 closest systems and deleting overlapping lanes
  const hyperlanes = generateProceduralHyperlanes(systems);

  const totalHexes = config.columns * config.rows;
  const occupiedHexes = systems.length;
  const occupancyPct = totalHexes > 0 ? +((occupiedHexes / totalHexes) * 100).toFixed(1) : 0;

  return {
    config,
    sectorWidth,
    sectorHeight,
    parsecWidth,
    parsecHeight,
    cells,
    systems,
    hyperlanes,
    integratedColorHex,
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
      habitableCount,
    },
  };
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
 * Procedural Hyperlanes Generator:
 * Connects each star to its 6 closest systems, then deletes any lanes that overlap (cross)
 * each other or pass directly through intermediate stars, creating a clean, planar interstellar network.
 */
export function generateProceduralHyperlanes(systems: SectorHexSystem[]): SectorHyperlane[] {
  if (systems.length < 2) return [];

  interface CandidateEdge {
    source: SectorHexSystem;
    target: SectorHexSystem;
    distSq: number;
    dist: number;
  }

  const candidateEdgesMap = new Map<string, CandidateEdge>();

  // 1. Connect each star to its 6 closest systems
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

    // Sort by distance ascending and pick 6 closest
    neighbors.sort((a, b) => a.distSq - b.distSq);
    const closest6 = neighbors.slice(0, 6);

    for (const nb of closest6) {
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
  return acceptedEdges.map((e) => {
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
}
