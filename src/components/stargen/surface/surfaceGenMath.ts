import { RealisticPlanetBody, RealisticPlanetaryZone } from '../../../core/generation/realisticStarGen';
import { RealisticMoon, RealisticStarNode, RealisticHydrosphere } from '../../../types/astrophysics';

export interface SurfacePointTelemetry {
  lat: number;
  lon: number;
  elevationMeters: number;
  elevationKm: number;
  isOcean: boolean;
  temperatureK: number;
  temperatureC: number;
  pressureBar: number;
  biome: string;
  biomeColor: string;
  featureName: string;
}

export interface SolventSeaPalette {
  solventKey: string;
  displayName: string;
  trenchRgb: [number, number, number];
  deepRgb: [number, number, number];
  shallowRgb: [number, number, number];
  horizonTopHex: string;
  horizonBotHex: string;
}

export interface FloraPigmentPalette {
  hasWaterLife: boolean;
  hasAnyLife: boolean;
  pigmentName: string;
  plainsHex: string;
  woodlandHex: string;
  taigaHex: string;
  marshHex: string;
  lowRgb: [number, number, number];
  highRgb: [number, number, number];
}

export interface AtmosphereCloudPalette {
  classLabel: string;
  atmoRgb: [number, number, number];
  bandLightRgb: [number, number, number];
  bandDarkRgb: [number, number, number];
  cloudRgb: [number, number, number];
}

export interface PlanetarySurfaceModel {
  seed: number;
  isGasGiant: boolean;
  isIceGiant: boolean;
  isSupercritical: boolean;
  isNoSurface: boolean;
  isIcyWorld: boolean;
  isMoltenWorld: boolean;
  hasActiveGeology: boolean;
  hasBiosphere: boolean;
  hasWaterLife: boolean;
  floraPalette: FloraPigmentPalette;
  hasLiquid: boolean;
  seaLevelNormalized: number;
  minElevationKm: number;
  maxElevationKm: number;
  hypsometry: Float32Array; // Normalized [0, 1] elevation grid: 360 x 180 (1 deg resolution)
  temperatureGrid: Float32Array; // Surface temperature in Kelvin
  biomeGrid: Uint8Array; // Biome index grid
  craterGrid: Float32Array; // Impact crater rim/bowl intensity
  fractureGrid: Float32Array; // Cryotectonic ice crack or tectonic lava fissure intensity
  volcanoGrid: Float32Array; // Discrete volcanic cone slope (0..1) and active lava caldera (>1.0)
  volcanoCount: number;
  cloudGrid: Float32Array; // Cloud & atmospheric swirl density [0, 1]
  cloudOpacity: number; // Overall cloud/atmosphere layer opacity [0, 1] proportional to atmospheric density
  atmospherePalette: AtmosphereCloudPalette;
  tectonicPlateGrid: Uint8Array; // Plate IDs
  platesCount: number;
  solvent: string;
  solventColorHex: string;
  seaPalette: SolventSeaPalette;
  skyColorHex: string;
  skyHorizonHex: string;
  starAngularDiameterDeg: number;
  starColorHex: string;
  starTeff: number;
  ambientIllumination: number; // 0 to 1
  hasRings: boolean;
  ringInnerRp: number;
  ringOuterRp: number;
  ringColorHex: string;
  ringTau: number;
  moonsInSky: Array<{
    name: string;
    angularDiameterDeg: number;
    visualColor: string;
    altitudeDeg: number;
    azimuthDeg: number;
    phase: number; // 0 (new) to 1 (full)
  }>;
}

function rgbToHex(rgb: [number, number, number]): string {
  const [r, g, b] = rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Determines vegetation/flora pigment colors based on biosphere status, solvent, and host star Teff.
 * Green is ONLY used on worlds with water-based life orbiting F and G type stars (5100 K <= Teff <= 6800 K).
 * Sterile worlds use strictly barren rocky/mineral tones (tan, ochre, brown, slate)—never green.
 */
export function getFloraPigmentPalette(
  hasBiosphere: boolean,
  solventKey: string,
  starTeff: number
): FloraPigmentPalette {
  const isWaterSolvent = solventKey === 'H2O' || solventKey === 'H2O + CO2';

  if (!hasBiosphere) {
    return {
      hasWaterLife: false,
      hasAnyLife: false,
      pigmentName: 'None (Sterile Regolith)',
      plainsHex: '#8c7355',
      woodlandHex: '#786248',
      taigaHex: '#6c5a49',
      marshHex: '#5e5044',
      lowRgb: [140, 115, 85],
      highRgb: [120, 98, 72],
    };
  }

  if (!isWaterSolvent) {
    // Exotic non-water life (e.g., Ammonia NH3-H2O biosphere)
    return {
      hasWaterLife: false,
      hasAnyLife: true,
      pigmentName: 'Cryo-Ammonia Polyphenols (Violet-Teal)',
      plainsHex: '#6d328f',
      woodlandHex: '#512373',
      taigaHex: '#38687a',
      marshHex: '#2f5466',
      lowRgb: [109, 50, 143],
      highRgb: [56, 104, 122],
    };
  }

  // Water-based life: pigment depends on host star spectral type (Teff)
  if (starTeff < 3900) {
    // M-type Red Dwarf: Near-IR absorbing purple-burgundy / near-black bacteriochlorophyll & retinal
    return {
      hasWaterLife: true,
      hasAnyLife: true,
      pigmentName: 'IR-Absorbing Bacteriochlorophyll (M-Star Purple/Black)',
      plainsHex: '#5a2666',
      woodlandHex: '#3d194a',
      taigaHex: '#2a1236',
      marshHex: '#472052',
      lowRgb: [90, 38, 102],
      highRgb: [42, 18, 54],
    };
  } else if (starTeff < 5100) {
    // K-type Orange Dwarf: Autumnal amber-orange / golden-ochre carotenoids & phycoerythrin
    return {
      hasWaterLife: true,
      hasAnyLife: true,
      pigmentName: 'Xanthophyll / Carotenoid Flora (K-Star Amber-Gold)',
      plainsHex: '#b87b28',
      woodlandHex: '#94581e',
      taigaHex: '#784418',
      marshHex: '#8a5a24',
      lowRgb: [184, 123, 40],
      highRgb: [148, 88, 30],
    };
  } else if (starTeff <= 6800) {
    // G & F type stars (5100 K - 6800 K): Classic Chlorophyll A/B Green!
    return {
      hasWaterLife: true,
      hasAnyLife: true,
      pigmentName: 'Chlorophyll A/B (F/G-Star Green)',
      plainsHex: '#3d7a42',
      woodlandHex: '#255c2d',
      taigaHex: '#1d462b',
      marshHex: '#1b523e',
      lowRgb: [61, 122, 66],
      highRgb: [37, 92, 45],
    };
  } else {
    // A / B / O hot stars (> 6800 K): UV-reflecting cyan-turquoise / silvery-blue phycocyanin
    return {
      hasWaterLife: true,
      hasAnyLife: true,
      pigmentName: 'UV-Shielding Phycocyanin (A-Star Cyan-Teal)',
      plainsHex: '#2a8c91',
      woodlandHex: '#1e6b73',
      taigaHex: '#19545c',
      marshHex: '#22747a',
      lowRgb: [42, 140, 145],
      highRgb: [30, 107, 115],
    };
  }
}

export function getSolventSeaPalette(solventRaw: string | undefined | null): SolventSeaPalette {
  const s = (solventRaw || 'H2O').trim();
  const sLower = s.toLowerCase();

  if (s === 'CH4-C2H6' || sLower.includes('methane') || sLower.includes('ethane') || sLower.includes('hydrocarbon')) {
    return {
      solventKey: 'CH4-C2H6',
      displayName: 'Hydrocarbon (CH4-C2H6)',
      trenchRgb: [32, 16, 5],
      deepRgb: [74, 38, 11],
      shallowRgb: [182, 108, 24],
      horizonTopHex: '#d97706',
      horizonBotHex: '#451a03',
    };
  }
  if (s === 'NH3-H2O' || sLower.includes('ammonia') || sLower.includes('nh3')) {
    return {
      solventKey: 'NH3-H2O',
      displayName: 'Cryo-Ammonia (NH3-H2O)',
      trenchRgb: [22, 16, 68],
      deepRgb: [48, 38, 138],
      shallowRgb: [118, 108, 228],
      horizonTopHex: '#818cf8',
      horizonBotHex: '#312e81',
    };
  }
  if (s === 'H2SO4' || sLower.includes('sulfuric') || sLower.includes('h2so4')) {
    return {
      solventKey: 'H2SO4',
      displayName: 'Sulfuric Acid (H2SO4)',
      trenchRgb: [58, 52, 10],
      deepRgb: [112, 98, 18],
      shallowRgb: [198, 178, 36],
      horizonTopHex: '#eab308',
      horizonBotHex: '#713f12',
    };
  }
  if (s === 'SO2' || sLower.includes('sulfur dioxide') || sLower.includes('so2')) {
    return {
      solventKey: 'SO2',
      displayName: 'Liquid SO2',
      trenchRgb: [68, 44, 4],
      deepRgb: [148, 102, 8],
      shallowRgb: [238, 194, 28],
      horizonTopHex: '#facc15',
      horizonBotHex: '#854d0e',
    };
  }
  if (s === 'CO2' || (sLower.includes('co2') && !sLower.includes('h2o'))) {
    return {
      solventKey: 'CO2',
      displayName: 'Liquid CO2',
      trenchRgb: [6, 38, 46],
      deepRgb: [14, 78, 92],
      shallowRgb: [42, 152, 178],
      horizonTopHex: '#38bdf8',
      horizonBotHex: '#155e75',
    };
  }
  if (s === 'H2O + CO2' || (sLower.includes('h2o') && sLower.includes('co2'))) {
    return {
      solventKey: 'H2O + CO2',
      displayName: 'Carbonated H2O + CO2',
      trenchRgb: [5, 28, 44],
      deepRgb: [12, 65, 95],
      shallowRgb: [24, 142, 172],
      horizonTopHex: '#0ea5e9',
      horizonBotHex: '#0369a1',
    };
  }
  if (sLower.includes('magma') || sLower.includes('silicate') || sLower.includes('lava') || sLower.includes('molten')) {
    return {
      solventKey: 'Silicate Magma',
      displayName: 'Silicate Magma',
      trenchRgb: [215, 78, 8],
      deepRgb: [248, 138, 14],
      shallowRgb: [255, 214, 46],
      horizonTopHex: '#fbbf24',
      horizonBotHex: '#ea580c',
    };
  }
  if (sLower.includes('supercritical')) {
    return {
      solventKey: 'Supercritical H2O',
      displayName: 'Supercritical Water Fluid',
      trenchRgb: [22, 68, 148],
      deepRgb: [38, 102, 188],
      shallowRgb: [215, 226, 238],
      horizonTopHex: '#e2e8f0',
      horizonBotHex: '#1d4ed8',
    };
  }
  // Default H2O marine ocean
  return {
    solventKey: 'H2O',
    displayName: 'Liquid Water (H2O)',
    trenchRgb: [4, 18, 48],
    deepRgb: [10, 48, 108],
    shallowRgb: [24, 128, 198],
    horizonTopHex: '#0ea5e9',
    horizonBotHex: '#0369a1',
  };
}

// Note: Biomes 3, 4, 5, 6 dynamically adapt their color & name via floraPalette in sampleSurfacePoint and map rendering!
export const BIOMES = [
  { id: 0, name: 'Abyssal Trench', color: '#041230', isWater: true },
  { id: 1, name: 'Deep Ocean', color: '#0a306c', isWater: true },
  { id: 2, name: 'Continental Shelf / Shallows', color: '#1880c6', isWater: true },
  { id: 3, name: 'Coastal Alluvial Basin', color: '#6b5b47', isWater: false },
  { id: 4, name: 'Lowland Silicate Plains', color: '#8c7355', isWater: false },
  { id: 5, name: 'Temperate Continental Basin', color: '#786248', isWater: false },
  { id: 6, name: 'High-Latitude Rocky Steppe', color: '#6c5a49', isWater: false },
  { id: 7, name: 'Tundra / Permafrost', color: '#706b63', isWater: false },
  { id: 8, name: 'Polar Glacial Ice', color: '#dce8f5', isWater: false },
  { id: 9, name: 'Arid Steppe / Scrub', color: '#9d7c44', isWater: false },
  { id: 10, name: 'Hyper-Arid Dunes / Desert', color: '#c49a4f', isWater: false },
  { id: 11, name: 'High Plateau / Badlands', color: '#885834', isWater: false },
  { id: 12, name: 'Mountain Cordillera', color: '#605553', isWater: false },
  { id: 13, name: 'Alpine Glacial Peaks', color: '#edf2f7', isWater: false },
  { id: 14, name: 'Basalt Volcanic Crust', color: '#261914', isWater: false },
  { id: 15, name: 'Active Lava Caldera & Fissure', color: '#ffa21a', isWater: false },
  { id: 16, name: 'Regolith Impact Craterlands', color: '#5b6472', isWater: false },
  { id: 17, name: 'Hydrocarbon Methane Sea', color: '#4a260b', isWater: true },
  { id: 18, name: 'Cryovolcanic Nitrogen Plains', color: '#c8d3e0', isWater: false },
  { id: 19, name: 'Supercritical Water Cloud Deck (Class II)', color: '#dbeafe', isWater: false },
  { id: 20, name: 'Gas Giant Cloud Deck (Continuous Envelope)', color: '#b88656', isWater: false },
  { id: 21, name: 'Cryotectonic Ice Fissure (Linea)', color: '#3b7ea1', isWater: false },
  { id: 22, name: 'Active Volcanic Shield & Lava Caldera', color: '#f97316', isWater: false },
];

// Fast PRNG
function createPrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash2D(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = (x - ix) * (x - ix) * (3 - 2 * (x - ix));
  const fy = (y - iy) * (y - iy) * (3 - 2 * (y - iy));

  const n00 = hash2D(ix, iy, seed);
  const n10 = hash2D(ix + 1, iy, seed);
  const n01 = hash2D(ix, iy + 1, seed);
  const n11 = hash2D(ix + 1, iy + 1, seed);

  const nx0 = n00 + (n10 - n00) * fx;
  const nx1 = n01 + (n11 - n01) * fx;
  return nx0 + (nx1 - nx0) * fy;
}

function fbm2D(x: number, y: number, seed: number, octaves = 5): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise2D(x * freq, y * freq, seed + i * 83);
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return val / norm;
}

// 3D spherical noise so map wraps seamlessly across lon 180/-180 and poles
function sphericalFbm(latDeg: number, lonDeg: number, seed: number, octaves = 5): number {
  const phi = ((90 - latDeg) * Math.PI) / 180;
  const theta = (lonDeg * Math.PI) / 180;
  const nx = Math.sin(phi) * Math.cos(theta);
  const ny = Math.cos(phi);
  const nz = Math.sin(phi) * Math.sin(theta);

  // Sample with 3 orthogonal 2D projections
  const s1 = fbm2D(nx * 2.5 + 10, ny * 2.5 + 10, seed, octaves);
  const s2 = fbm2D(ny * 2.5 + 20, nz * 2.5 + 20, seed + 107, octaves);
  const s3 = fbm2D(nz * 2.5 + 30, nx * 2.5 + 30, seed + 223, octaves);
  return (s1 + s2 + s3) / 3;
}

interface SphericalCrater {
  cx: number;
  cy: number;
  cz: number;
  radiusRad: number;
  cosMaxRadius: number;
  depth: number;
  hasCentralPeak: boolean;
}

/**
 * Generates a realistic population of circular 3D impact craters on the unit sphere
 * for airless and thin-atmosphere worlds.
 */
function generateSphericalCraters(seed: number, pressureBar: number | null | undefined, isNoSurface: boolean): SphericalCrater[] {
  if (isNoSurface) return [];
  const pBar = pressureBar ?? 0;
  // Airless (< 0.01 bar) gets heavy cratering; thin atmosphere (< 0.6 bar) gets moderate cratering
  if (pBar >= 0.6) return [];

  const craterPrng = createPrng(seed ^ 0x9e3779b9);
  const retentionFactor = pBar < 0.01 ? 1.0 : Math.max(0.25, 1.0 - (pBar / 0.6) * 0.72);
  const count = Math.round(115 * retentionFactor);
  const craters: SphericalCrater[] = [];

  for (let i = 0; i < count; i++) {
    // Uniform random point on unit sphere
    const u = craterPrng() * 2 - 1; // cos(phi) in [-1, 1]
    const theta = craterPrng() * Math.PI * 2;
    const rxy = Math.sqrt(Math.max(0, 1 - u * u));
    const cx = rxy * Math.cos(theta);
    const cy = u;
    const cz = rxy * Math.sin(theta);

    // Power-law size distribution: many small/medium craters, few giant impact basins
    const sizeRoll = Math.pow(craterPrng(), 2.3);
    // In thin atmospheres, tiny meteoroids burn up so minimum crater size is slightly larger
    const minRad = pBar < 0.01 ? 0.024 : 0.032; // ~1.4 deg to 1.8 deg
    const maxRad = 0.22; // ~12.6 deg basin
    const radiusRad = minRad + sizeRoll * (maxRad - minRad);
    const maxEffectRad = radiusRad * 1.45;
    const cosMaxRadius = Math.cos(maxEffectRad);

    // Depth scales with crater size and atmospheric erosion
    const erosionScale = pBar < 0.01 ? 1.0 : 0.78;
    const depth = (0.075 + sizeRoll * 0.16) * erosionScale;
    const hasCentralPeak = radiusRad > 0.078;

    craters.push({
      cx,
      cy,
      cz,
      radiusRad,
      cosMaxRadius,
      depth,
      hasCentralPeak,
    });
  }

  return craters;
}

interface SphericalVolcano {
  cx: number;
  cy: number;
  cz: number;
  coneRadiusRad: number;
  cosConeRadius: number;
  coneHeight: number;
}

/**
 * Generates discrete 3D volcanic shield/stratovolcano peaks with glowing central lava calderas
 * dotted around the surface of worlds with active geology (Earth, Venus, Io, tidal/tectonic worlds).
 */
function generateSphericalVolcanoes(
  seed: number,
  hasActiveGeology: boolean,
  isExtremeVolcanic: boolean
): SphericalVolcano[] {
  if (!hasActiveGeology) return [];

  const volcPrng = createPrng(seed ^ 0x7f4a7c15);
  const count = isExtremeVolcanic ? 34 : 18;
  const volcanoes: SphericalVolcano[] = [];

  for (let i = 0; i < count; i++) {
    // Cluster volcanoes slightly along tectonic belts while keeping global distribution
    const u = (volcPrng() * 2 - 1) * 0.92;
    const theta = volcPrng() * Math.PI * 2;
    const rxy = Math.sqrt(Math.max(0, 1 - u * u));
    const cx = rxy * Math.cos(theta);
    const cy = u;
    const cz = rxy * Math.sin(theta);

    const coneRadiusRad = 0.042 + volcPrng() * 0.038; // ~2.4 deg to 4.6 deg radius
    const coneHeight = 0.22 + volcPrng() * 0.18;

    volcanoes.push({
      cx,
      cy,
      cz,
      coneRadiusRad,
      cosConeRadius: Math.cos(coneRadiusRad),
      coneHeight,
    });
  }

  return volcanoes;
}

interface SphericalIceCrack {
  // Normal of the great/small circle plane
  px: number;
  py: number;
  pz: number;
  // Orthonormal basis vectors (U, V) in the fracture plane for measuring along-arc angle
  ux: number;
  uy: number;
  uz: number;
  vx: number;
  vy: number;
  vz: number;
  planeOffset: number;
  arcHalfSpanRad: number;
  halfWidthRad: number;
  depth: number;
  warpAmp: number;
  warpFreq: number;
  warpPhase: number;
}

/**
 * Generates sweeping 3D tectonic fractures (Europa-like ice lineae on icy worlds, or
 * glowing magma rifts on molten worlds).
 */
function generateSphericalSurfaceCracks(
  seed: number,
  hasCracks: boolean,
  isHighDensity: boolean
): SphericalIceCrack[] {
  if (!hasCracks) return [];

  const crackPrng = createPrng(seed ^ 0x517cc1b7);
  const count = isHighDensity ? 26 : 16;
  const cracks: SphericalIceCrack[] = [];

  for (let i = 0; i < count; i++) {
    // Random unit normal vector P for the fracture plane
    const u = crackPrng() * 2 - 1;
    const theta = crackPrng() * Math.PI * 2;
    const rxy = Math.sqrt(Math.max(0, 1 - u * u));
    const px = rxy * Math.cos(theta);
    const py = u;
    const pz = rxy * Math.sin(theta);

    // Construct orthonormal basis U, V in the plane perpendicular to P
    const refX = Math.abs(px) < 0.8 ? 1 : 0;
    const refY = Math.abs(px) < 0.8 ? 0 : 1;
    let ux = py * 0 - pz * refY;
    let uy = pz * refX - px * 0;
    let uz = px * refY - py * refX;
    const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    ux /= uLen;
    uy /= uLen;
    uz /= uLen;

    // Cross product V = P x U
    const vx = py * uz - pz * uy;
    const vy = pz * ux - px * uz;
    const vz = px * uy - py * ux;

    // Rotate (U, V) by random angle around P so the arc center can be anywhere on the circle
    const rot = crackPrng() * Math.PI * 2;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const rUx = ux * cosR + vx * sinR;
    const rUy = uy * cosR + vy * sinR;
    const rUz = uz * cosR + vz * sinR;
    const rVx = -ux * sinR + vx * cosR;
    const rVy = -uy * sinR + vy * cosR;
    const rVz = -uz * sinR + vz * cosR;

    const planeOffset = (crackPrng() - 0.5) * 0.45;
    const arcHalfSpanRad = 0.45 + crackPrng() * 1.15; // 50 deg to 180 deg total arc span
    const halfWidthRad = 0.012 + crackPrng() * 0.011; // ~0.7 deg to 1.3 deg half-width
    const depth = 0.10 + crackPrng() * 0.11;
    const warpAmp = 0.018 + crackPrng() * 0.032;
    const warpFreq = 2.5 + crackPrng() * 4.5;
    const warpPhase = crackPrng() * Math.PI * 2;

    cracks.push({
      px,
      py,
      pz,
      ux: rUx,
      uy: rUy,
      uz: rUz,
      vx: rVx,
      vy: rVy,
      vz: rVz,
      planeOffset,
      arcHalfSpanRad,
      halfWidthRad,
      depth,
      warpAmp,
      warpFreq,
      warpPhase,
    });
  }

  return cracks;
}

/**
 * Computes Sudarsky Gas Giant class / Ice Giant / Supercritical Water World / Rocky Atmosphere
 * cloud & atmosphere colors and opacity proportional to atmospheric density.
 */
export function deriveAtmosphereAndCloudPalette(
  pressureBar: number | null | undefined,
  gases: Record<string, number>,
  isGasGiant: boolean,
  isIceGiant: boolean,
  isSupercritical: boolean,
  isMoltenWorld: boolean,
  sudarskyClass: string | null | undefined,
  Tbase: number
): { palette: AtmosphereCloudPalette; opacity: number } {
  // 1. Supercritical Water Worlds: always 100% opacity, white~grey water clouds in a blue water atmosphere (Sudarsky Class II appearance)
  if (isSupercritical) {
    return {
      opacity: 1.0,
      palette: {
        classLabel: 'Supercritical Water Envelope (Class II Water Clouds)',
        atmoRgb: [28, 96, 184],       // Deep azure-blue water vapor atmosphere
        bandLightRgb: [242, 246, 252], // Brilliant white water cloud decks
        bandDarkRgb: [168, 182, 200],  // Stormy slate-grey water cloud bands
        cloudRgb: [238, 244, 250],
      },
    };
  }

  // 2. Gas Giants & Ice Giants: 100% opacity with colors matching Sudarsky Class I - V at their temperature
  if (isGasGiant) {
    let sClass = sudarskyClass;
    if (!sClass) {
      if (Tbase >= 1400) sClass = 'V';
      else if (Tbase >= 900) sClass = 'IV';
      else if (Tbase >= 350) sClass = 'III';
      else if (Tbase >= 150) sClass = 'II';
      else sClass = 'I';
    }

    // Cold/temperate Ice Giants (Uranus/Neptune methane cyan-blue) when cooler than Class III
    if (isIceGiant && sClass !== 'III' && sClass !== 'IV' && sClass !== 'V' && Tbase < 220) {
      return {
        opacity: 1.0,
        palette: {
          classLabel: `Ice Giant Methane Envelope (Sudarsky Class ${sClass})`,
          atmoRgb: [32, 138, 192],
          bandLightRgb: [145, 232, 252],
          bandDarkRgb: [28, 118, 168],
          cloudRgb: [195, 244, 255],
        },
      };
    }

    if (sClass === 'V') {
      return {
        opacity: 1.0,
        palette: {
          classLabel: 'Sudarsky Class V (Silicate & Iron Clouds)',
          atmoRgb: [96, 26, 18],
          bandLightRgb: [245, 108, 36],
          bandDarkRgb: [98, 28, 20],
          cloudRgb: [255, 148, 52],
        },
      };
    }
    if (sClass === 'IV') {
      return {
        opacity: 1.0,
        palette: {
          classLabel: 'Sudarsky Class IV (Alkali Metal Vapor)',
          atmoRgb: [42, 36, 88],
          bandLightRgb: [122, 76, 152],
          bandDarkRgb: [38, 32, 82],
          cloudRgb: [148, 98, 178],
        },
      };
    }
    if (sClass === 'III') {
      return {
        opacity: 1.0,
        palette: {
          classLabel: 'Sudarsky Class III (Cloudless Azure)',
          atmoRgb: [22, 68, 168],
          bandLightRgb: [64, 128, 232],
          bandDarkRgb: [18, 56, 148],
          cloudRgb: [92, 156, 245],
        },
      };
    }
    if (sClass === 'II') {
      // Sudarsky Class II (150 - 250 K): White~grey water clouds in a blue atmosphere
      return {
        opacity: 1.0,
        palette: {
          classLabel: 'Sudarsky Class II (Water Cloud Decks)',
          atmoRgb: [34, 98, 182],
          bandLightRgb: [242, 246, 252],
          bandDarkRgb: [176, 190, 208],
          cloudRgb: [240, 245, 252],
        },
      };
    }
    // Default Sudarsky Class I (< 150 K): Ammonia clouds (Jovian ochre, cream, & russet bands)
    return {
      opacity: 1.0,
      palette: {
        classLabel: 'Sudarsky Class I (Ammonia Cloud Decks)',
        atmoRgb: [176, 118, 62],
        bandLightRgb: [244, 220, 182],
        bandDarkRgb: [186, 122, 58],
        cloudRgb: [248, 228, 196],
      },
    };
  }

  // 3. Solid-Surface Worlds: Opacity is proportional to atmospheric density / pressure
  const pBar = pressureBar ?? 0;
  if (pBar <= 0.001) {
    return {
      opacity: 0.0,
      palette: {
        classLabel: 'Vacuum (No Atmosphere)',
        atmoRgb: [0, 0, 0],
        bandLightRgb: [255, 255, 255],
        bandDarkRgb: [180, 180, 180],
        cloudRgb: [255, 255, 255],
      },
    };
  }

  // Smoothly scale cloud/atmosphere opacity with surface pressure:
  // ~0.06 at 0.01 bar (Mars-like wispy haze)
  // ~0.46 at 1.0 bar (Earth-like partial clouds + Rayleigh scattering)
  // ~0.78 at 10 bar (thick hazy atmosphere)
  // ~0.95 at 90+ bar (Venusian nearly opaque cloud deck)
  const opacity = Math.min(0.96, Math.max(0.04, 1.0 - Math.exp(-0.55 * Math.pow(pBar, 0.58))));

  const hasSO2 = (gases.SO2 || 0) > 0.01;
  const hasCH4 = (gases.CH4 || 0) > 0.02;
  const hasCO2 = (gases.CO2 || 0) > 0.4;

  if (isMoltenWorld) {
    return {
      opacity: Math.min(0.75, opacity),
      palette: {
        classLabel: 'Volcanic Silicate & Sulfur Ash Plumes',
        atmoRgb: [120, 42, 12],
        bandLightRgb: [235, 135, 48],
        bandDarkRgb: [68, 32, 22],
        cloudRgb: [195, 98, 38],
      },
    };
  }
  if (hasCO2 && pBar >= 3.0) {
    return {
      opacity: Math.max(0.82, opacity),
      palette: {
        classLabel: 'Dense Sulfuric Acid & CO2 Overcast',
        atmoRgb: [188, 158, 82],
        bandLightRgb: [238, 214, 138],
        bandDarkRgb: [168, 138, 68],
        cloudRgb: [232, 208, 132],
      },
    };
  }
  if (hasCH4 && pBar >= 0.3) {
    return {
      opacity: Math.max(0.68, opacity),
      palette: {
        classLabel: 'Hydrocarbon Tholin Smog & Methane Clouds',
        atmoRgb: [172, 102, 38],
        bandLightRgb: [224, 154, 72],
        bandDarkRgb: [138, 78, 24],
        cloudRgb: [218, 148, 66],
      },
    };
  }
  if (hasSO2) {
    return {
      opacity,
      palette: {
        classLabel: 'Sulfurous Volcanic Haze (SO2)',
        atmoRgb: [168, 154, 52],
        bandLightRgb: [232, 218, 98],
        bandDarkRgb: [136, 122, 38],
        cloudRgb: [228, 212, 92],
      },
    };
  }

  // Standard Water Vapor / Nitrogen-Oxygen / Thin CO2 clouds
  return {
    opacity,
    palette: {
      classLabel: pBar < 0.1 ? 'Thin Atmospheric Dust & Ice Wisps' : 'Water Vapor Clouds & Rayleigh Atmosphere',
      atmoRgb: pBar < 0.1 ? [178, 136, 104] : [56, 138, 224],
      bandLightRgb: [246, 250, 255],
      bandDarkRgb: [184, 198, 216],
      cloudRgb: pBar < 0.1 ? [228, 204, 184] : [244, 248, 254],
    },
  };
}

/**
 * Derives realistic sky color and horizon scattering based on atmospheric pressure,
 * dominant gases, and star spectral type.
 */
export function deriveAtmosphericSkyColors(
  pressureBar: number | null,
  gases: Record<string, number>,
  isGasGiant: boolean,
  isSupercritical: boolean,
  isMoltenWorld: boolean,
  starTeff: number
): { zenith: string; horizon: string; hazeFactor: number } {
  if (isSupercritical) {
    // Supercritical water world: blue water atmosphere with white-grey water cloud horizon
    return { zenith: '#1d4ed8', horizon: '#cbd5e1', hazeFactor: 0.95 };
  }
  if (isGasGiant) {
    return { zenith: '#2a4463', horizon: '#8ca8c8', hazeFactor: 0.9 };
  }
  if (isMoltenWorld) {
    // Volcanic silicate/alkali vapor or smoldering lava horizon
    return { zenith: '#1c0a04', horizon: '#ea580c', hazeFactor: 0.65 };
  }
  if (pressureBar === null || pressureBar <= 0.001) {
    // Airless / Vacuum: pitch black starry sky with brilliant starlight
    return { zenith: '#020308', horizon: '#080d1a', hazeFactor: 0.02 };
  }

  const p = Math.min(20, pressureBar);
  const hasCH4 = (gases.CH4 || 0) > 0.02;
  const hasCO2 = (gases.CO2 || 0) > 0.4;
  const hasSO2 = (gases.SO2 || 0) > 0.01;

  if (hasSO2) {
    return { zenith: '#4a4218', horizon: '#9c8c38', hazeFactor: 0.85 };
  }
  if (hasCH4 && p >= 0.5) {
    // Titan-like orange-brown hydrocarbon tholin smog
    return { zenith: '#633918', horizon: '#b86d2d', hazeFactor: 0.9 };
  }
  if (hasCO2 && p >= 3.0) {
    // Venusian dense sulfurous/amber overcast
    return { zenith: '#574827', horizon: '#ba9a4a', hazeFactor: 0.95 };
  }

  // Earth-like / Nitrogen-Oxygen / Thin atmospheres
  if (starTeff < 3800) {
    // Orbiting Red Dwarf: Twilight rose-amber sky
    return { zenith: '#222942', horizon: '#8b4b45', hazeFactor: 0.4 };
  } else if (starTeff > 7500) {
    // Hot A/B Star: Deep violet-cyan Rayleigh sky
    return { zenith: '#142a5c', horizon: '#4080bf', hazeFactor: 0.35 };
  }

  // Standard Sol-like G/K star
  const density = Math.min(1.0, p / 1.0);
  const r = Math.round(20 + 35 * density);
  const g = Math.round(50 + 90 * density);
  const b = Math.round(120 + 130 * density);
  const hr = Math.round(130 + 80 * density);
  const hg = Math.round(170 + 60 * density);
  const hb = Math.round(210 + 40 * density);

  return {
    zenith: `rgb(${r}, ${g}, ${b})`,
    horizon: `rgb(${hr}, ${hg}, ${hb})`,
    hazeFactor: Math.min(1.0, 0.2 + p * 0.4),
  };
}

/**
 * Builds the complete planetary surface model including topography, biomes,
 * climate grid, volcanoes, cloud/atmosphere layer, and sky horizon parameters.
 */
export function generatePlanetarySurfaceModel(
  planet: RealisticPlanetBody,
  moon: RealisticMoon | null | undefined,
  zone: RealisticPlanetaryZone,
  stars: RealisticStarNode[]
): PlanetarySurfaceModel {
  const isMoon = Boolean(moon);
  const activeBody = moon || planet;
  const bodyClass = isMoon ? (moon?.moonClass || '') : planet.planetClass;
  const bodyClassLower = bodyClass.toLowerCase();

  const isGasGiant = !isMoon && (planet.gasFrac >= 0.015 || planet.massEarth >= 15);
  const isIceGiant =
    isGasGiant &&
    (bodyClassLower.includes('ice giant') ||
      bodyClassLower.includes('neptune') ||
      ((planet.iceFrac ?? 0) > (planet.gasFrac ?? 0) && planet.massEarth < 65));

  const hydro = activeBody.hydrosphere as RealisticHydrosphere | null | undefined;
  const solventRaw = hydro?.solvent || 'None';
  const solventLower = solventRaw.toLowerCase();

  // Supercritical water worlds & gas/ice giants have no solid surface
  const isSupercritical =
    !isGasGiant &&
    (solventLower.includes('supercritical') ||
      bodyClassLower.includes('supercritical') ||
      bodyClassLower.includes('steam world') ||
      bodyClassLower.includes('water giant') ||
      (activeBody.pressureBar === null && !isMoon));
  const isNoSurface = isGasGiant || isSupercritical;

  const hasLiquid = Boolean(!isNoSurface && hydro && (hydro.coveragePct ?? 0) > 0 && hydro.solvent !== 'None');
  const coverageFrac = hasLiquid && hydro && hydro.coveragePct ? hydro.coveragePct / 100 : 0;

  const Tbase = activeBody.surfaceTempK || activeBody.T_eq || 288;

  // Detect Molten / Lava / Scorched Volcanic worlds
  const isMoltenWorld =
    !isNoSurface &&
    (Tbase >= 750 ||
      bodyClassLower.includes('molten') ||
      bodyClassLower.includes('lava') ||
      solventLower.includes('magma') ||
      solventLower.includes('lava') ||
      solventLower.includes('silicate'));

  const hasSubsurfaceOcean = Boolean(
    !isNoSurface &&
      !isMoltenWorld &&
      Tbase < 273.15 &&
      hydro &&
      (((hydro.iceKm ?? 0) > 0 && (hydro.liqKm ?? 0) > 0) ||
        hydro.state?.toLowerCase().includes('subsurface'))
  );

  // Determine whether this world has a predominantly icy surface / cryosphere (strictly freezing Tbase < 270 K)
  const isIcyWorld =
    !isNoSurface &&
    !isMoltenWorld &&
    Tbase < 270 &&
    !bodyClassLower.includes('venusian') &&
    ((activeBody.iceFrac ?? 0) >= 0.15 ||
      hasSubsurfaceOcean ||
      (hydro?.iceKm ?? 0) > 0.5 ||
      bodyClassLower.includes('ice') ||
      bodyClassLower.includes('icy') ||
      bodyClassLower.includes('frozen') ||
      bodyClassLower.includes('cryo') ||
      bodyClassLower.includes('glacial') ||
      (Tbase < 225 && (activeBody.rockFrac ?? 1) < 0.85));

  // Host star telemetry
  const star = stars[0] || { Teff: 5778, colorHex: '#fff4e6', radius: 1.0, lumNum: 1.0 };
  const starTeff = star.Teff || 5778;
  const starDistAU = Math.max(0.02, planet.a);
  const starRadiusAU = (star.radius || 1.0) * 0.00465047;
  const starAngularDiameterDeg = +(2 * Math.atan(starRadiusAU / (2 * starDistAU)) * (180 / Math.PI)).toFixed(2);

  // Solvent-specific sea color palette (force Silicate Magma palette on molten worlds)
  const seaPalette = getSolventSeaPalette(isMoltenWorld ? 'Silicate Magma' : hydro?.solvent);

  // Biosphere & star-specific flora pigments (Green ONLY on water-life worlds around F & G stars)
  const hasBiosphere = Boolean(!isNoSurface && hydro?.biosphere);
  const floraPalette = getFloraPigmentPalette(hasBiosphere, seaPalette.solventKey, starTeff);
  const hasWaterLife = floraPalette.hasWaterLife;

  // Deterministic seed
  const bodyKey = isMoon
    ? (moon?.id || moon?.name || 'moon')
    : `${planet.planetClass}_${planet.a}_${planet.radiusEarth}`;
  let seed = 1337;
  for (let i = 0; i < bodyKey.length; i++) {
    seed = (seed * 31 + bodyKey.charCodeAt(i)) >>> 0;
  }
  const prng = createPrng(seed);

  // Plate tectonics & active geology parameters
  const platesCount = isNoSurface
    ? 0
    : activeBody.rockFrac > 0.4 && activeBody.gravityG > 0.38
    ? 7 + Math.floor(prng() * 6)
    : 0;

  const tidalW = (activeBody as { tidalW?: number }).tidalW ?? 0;
  const isExtremeVolcanic =
    isMoltenWorld ||
    tidalW >= 0.4 ||
    bodyClassLower.includes('volcanic') ||
    bodyClassLower.includes('io') ||
    bodyClassLower.includes('venusian') ||
    bodyClassLower.includes('sulfur');

  const hasActiveGeology =
    !isNoSurface &&
    (isExtremeVolcanic ||
      platesCount > 0 ||
      tidalW >= 0.1 ||
      (activeBody.massEarth >= 0.35 && (activeBody.rockFrac ?? 0) >= 0.45));

  // Maximum elevation depends inversely on gravity
  const gClamped = Math.max(0.05, activeBody.gravityG);
  const maxElevKm = isNoSurface ? 0 : +(Math.min(28, 7.5 / Math.sqrt(gClamped)) * (0.8 + prng() * 0.4)).toFixed(1);
  const minElevKm = isNoSurface ? 0 : +(-maxElevKm * 0.75).toFixed(1);

  // Hypsometry resolution: 360 lon x 180 lat
  const width = 360;
  const height = 180;
  const hypsometry = new Float32Array(width * height);
  const temperatureGrid = new Float32Array(width * height);
  const biomeGrid = new Uint8Array(width * height);
  const craterGrid = new Float32Array(width * height);
  const fractureGrid = new Float32Array(width * height);
  const volcanoGrid = new Float32Array(width * height);
  const cloudGrid = new Float32Array(width * height);
  const tectonicPlateGrid = new Uint8Array(width * height);

  // Pre-generate 3D spherical impact craters for airless and thin-atmosphere worlds
  const craters = generateSphericalCraters(
    seed,
    hasSubsurfaceOcean || isMoltenWorld ? 0.42 : activeBody.pressureBar,
    isNoSurface
  );

  // Pre-generate 3D spherical cracks (cryotectonic ice lineae on icy worlds, or glowing magma fissures on molten worlds)
  const surfaceCracks = generateSphericalSurfaceCracks(
    seed,
    isIcyWorld || isMoltenWorld,
    hasSubsurfaceOcean || isMoltenWorld
  );

  // Pre-generate discrete 3D volcanoes for worlds with active geology (Earth, Venus, Io, etc.)
  const volcanoes = generateSphericalVolcanoes(seed, hasActiveGeology, isExtremeVolcanic);

  // Derive cloud/atmosphere palette & opacity proportional to atmospheric density
  const sudarskyClass = !isMoon ? planet.sudarskyClass : null;
  const { palette: atmospherePalette, opacity: cloudOpacity } = deriveAtmosphereAndCloudPalette(
    activeBody.pressureBar,
    activeBody.gases || {},
    isGasGiant,
    isIceGiant,
    isSupercritical,
    isMoltenWorld,
    sudarskyClass,
    Tbase
  );

  // Generate elevation & cloud samples
  const allElevations: number[] = [];
  for (let y = 0; y < height; y++) {
    const lat = 90 - y; // 90 to -90
    const latRad = (lat * Math.PI) / 180;
    const phi = ((90 - lat) * Math.PI) / 180;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    for (let x = 0; x < width; x++) {
      const lon = x - 180; // -180 to 180
      const idx = y * width + x;

      // 1. Compute swirling atmospheric / cloud field for all worlds with an atmosphere
      if (isNoSurface) {
        // Zonal banded jet streams + cyclonic storms for Gas Giants, Ice Giants, & Supercritical Water Worlds
        const bandFreq = isSupercritical ? 9 : isIceGiant ? 8 : 14;
        const swirl = sphericalFbm(lat * 1.4, lon * 0.9, seed + 701, 4);
        const jetWave = Math.sin(latRad * bandFreq + (swirl - 0.5) * 3.6) * 0.5 + 0.5;
        const fineBands = Math.cos(latRad * bandFreq * 2.1 - swirl * 2.4) * 0.22;
        const vortex = Math.max(0, 1.0 - Math.hypot((lat + 22) * 0.08, ((lon - 35 + 540) % 360 - 180) * 0.045));
        cloudGrid[idx] = Math.max(0, Math.min(1, jetWave * 0.72 + fineBands + swirl * 0.28 + vortex * 0.35));
        hypsometry[idx] = 0.5; // Blank solid surface
        continue;
      } else if (cloudOpacity > 0) {
        // Terrestrial / Venusian / Titan swirling weather systems & trade-wind cloud bands
        const atmoSwirl = sphericalFbm(lat * 1.6, lon * 1.2, seed + 887, 4);
        const shearedCloud = sphericalFbm(
          lat * 2.1 + (atmoSwirl - 0.5) * 28,
          lon * 1.7 + Math.cos(latRad * 3) * 22,
          seed + 991,
          5
        );
        // ITCZ equatorial & mid-latitude storm track enhancement
        const latStormBelt = 0.85 + 0.22 * Math.cos(latRad * 4);
        // On dense overcast worlds (e.g. Venus/Titan), cloud cover is a nearly continuous deck with banded contrast
        const baseDeck = cloudOpacity > 0.75 ? 0.55 : 0.0;
        const rawCloud = Math.max(0, (shearedCloud * latStormBelt - 0.36) / 0.64);
        cloudGrid[idx] = Math.max(0, Math.min(1, baseDeck + rawCloud * (1 - baseDeck * 0.5)));
      }

      // 2. Solid Surface Topography
      let elev = sphericalFbm(lat, lon, seed, 6);

      // Add mountain ridges using ridged multifractal
      const ridgeNoise = Math.abs(sphericalFbm(lat * 1.5, lon * 1.5, seed + 499, 4) - 0.5) * 2;
      elev = elev * 0.72 + (1.0 - ridgeNoise) * 0.28;

      const theta = (lon * Math.PI) / 180;
      const nx = sinPhi * Math.cos(theta);
      const ny = cosPhi;
      const nz = sinPhi * Math.sin(theta);

      // Apply circular 3D impact craters (bowls, raised rims, central peaks, ejecta blankets)
      if (craters.length > 0) {
        let craterDelta = 0;
        let craterIntensity = 0;

        for (let cIdx = 0; cIdx < craters.length; cIdx++) {
          const c = craters[cIdx];
          const dot = nx * c.cx + ny * c.cy + nz * c.cz;
          if (dot > c.cosMaxRadius) {
            const angDist = Math.acos(Math.min(1, Math.max(-1, dot)));
            const u = angDist / c.radiusRad; // normalized radial distance from crater center

            if (u < 0.85) {
              // Depressed crater bowl
              const bowlNorm = u / 0.85;
              let delta = -c.depth * (1.0 - Math.pow(bowlNorm, 2.2));
              // Central peak for complex craters
              if (c.hasCentralPeak && u < 0.24) {
                const peakNorm = 1.0 - u / 0.24;
                delta += c.depth * 0.52 * peakNorm * peakNorm;
              }
              craterDelta += delta;
              craterIntensity = Math.max(craterIntensity, (1.0 - bowlNorm * 0.6) * (c.depth / 0.15));
            } else if (u < 1.45) {
              // Raised circular crater rim & outer ejecta ramp
              let rimFactor = 0;
              if (u <= 1.0) {
                rimFactor = (u - 0.85) / 0.15; // steeply rises to rim crest at u = 1.0
              } else {
                const ejectaNorm = 1.0 - (u - 1.0) / 0.45;
                rimFactor = ejectaNorm * ejectaNorm;
              }
              craterDelta += c.depth * 0.46 * rimFactor;
              craterIntensity = Math.max(craterIntensity, rimFactor * 0.85);
            }
          }
        }

        elev += craterDelta;
        craterGrid[idx] = Math.min(1.5, craterIntensity);
      }

      // Apply 3D surface cracks (cryotectonic ice lineae on icy worlds, or lava fissures on molten worlds)
      if (surfaceCracks.length > 0) {
        let crackDelta = 0;
        let crackIntensity = 0;

        for (let k = 0; k < surfaceCracks.length; k++) {
          const ic = surfaceCracks[k];
          const rawPlaneDist = nx * ic.px + ny * ic.py + nz * ic.pz - ic.planeOffset;
          if (Math.abs(rawPlaneDist) < ic.halfWidthRad * 2.5 + ic.warpAmp * 1.6) {
            const projU = nx * ic.ux + ny * ic.uy + nz * ic.uz;
            const projV = nx * ic.vx + ny * ic.vy + nz * ic.vz;
            const alpha = Math.atan2(projV, projU);
            const absAlpha = Math.abs(alpha);

            if (absAlpha < ic.arcHalfSpanRad) {
              const taper = Math.min(1.0, (ic.arcHalfSpanRad - absAlpha) / 0.20);
              const warp =
                ic.warpAmp * Math.sin(alpha * ic.warpFreq + ic.warpPhase) +
                ic.warpAmp * 0.45 * Math.cos(alpha * ic.warpFreq * 2.3 - ic.warpPhase);
              const d = Math.abs(rawPlaneDist - warp);
              const w = d / ic.halfWidthRad;

              if (w < 1.0) {
                // Deep V-shaped fissure chasm
                const chasm = 1.0 - w;
                crackDelta -= ic.depth * taper * Math.pow(chasm, 1.5);
                crackIntensity = Math.max(crackIntensity, chasm * taper);
              } else if (w < 2.15) {
                // Flanking double-ridge uplift walls
                const ridgeNorm = 1.0 - Math.abs(w - 1.38) / 0.77;
                if (ridgeNorm > 0) {
                  crackDelta += ic.depth * 0.36 * taper * ridgeNorm * ridgeNorm;
                }
              }
            }
          }
        }

        // Fine secondary branching fissure network across the shell
        const crevasseField = Math.abs(sphericalFbm(lat * 2.4, lon * 2.4, seed + 1319, 3) - 0.5);
        if (crevasseField < 0.018) {
          const fineIntensity = (1.0 - crevasseField / 0.018) * 0.65;
          crackDelta -= 0.065 * fineIntensity;
          crackIntensity = Math.max(crackIntensity, fineIntensity);
        }

        elev += crackDelta;
        fractureGrid[idx] = Math.min(1.5, crackIntensity);
      }

      // Apply discrete 3D Volcanic Cones & Glowing Lava Calderas on worlds with active geology
      if (volcanoes.length > 0) {
        let volcDelta = 0;
        let volcVal = 0;

        for (let vIdx = 0; vIdx < volcanoes.length; vIdx++) {
          const v = volcanoes[vIdx];
          const dot = nx * v.cx + ny * v.cy + nz * v.cz;
          if (dot > v.cosConeRadius) {
            const angDist = Math.acos(Math.min(1, Math.max(-1, dot)));
            const u = angDist / v.coneRadiusRad; // 0 at summit center, 1 at base of volcanic edifice

            if (u < 1.0) {
              if (u < 0.24) {
                // Summit lava caldera depression with incandescent magma lake
                const calderaNorm = u / 0.24;
                volcDelta += v.coneHeight * (0.76 + 0.24 * calderaNorm * calderaNorm);
                volcVal = Math.max(volcVal, 1.5 + (1.0 - calderaNorm) * 0.5); // > 1.0 marks glowing lava caldera
              } else {
                // Steep conical stratovolcano / shield slope rising toward summit rim
                const slopeNorm = 1.0 - (u - 0.24) / 0.76;
                volcDelta += v.coneHeight * Math.pow(slopeNorm, 1.55);
                volcVal = Math.max(volcVal, slopeNorm * 0.95);
              }
            }
          }
        }

        if (volcVal > 0) {
          // Ensure volcanic peaks rise above sea level as volcanic islands or continental stratovolcanoes
          elev = Math.max(elev + volcDelta, 0.55 + volcDelta * 0.85);
          volcanoGrid[idx] = volcVal;
        }
      }

      hypsometry[idx] = Math.max(0.01, Math.min(0.99, elev));
      allElevations.push(hypsometry[idx]);
    }
  }

  // Determine exact sea-level threshold to match coveragePct
  let seaLevelNormalized = 0.42;
  if (!isNoSurface && hasLiquid && allElevations.length > 0) {
    allElevations.sort((a, b) => a - b);
    const splitIndex = Math.min(allElevations.length - 1, Math.floor(allElevations.length * coverageFrac));
    seaLevelNormalized = allElevations[splitIndex];
  }

  const isTidallyLocked = activeBody.spinState?.toLowerCase().includes('locked') || activeBody.spinState?.includes('1:1');

  // Compute thermal and biome grid
  for (let y = 0; y < height; y++) {
    const lat = 90 - y;
    const absLat = Math.abs(lat);
    for (let x = 0; x < width; x++) {
      const lon = x - 180;
      const idx = y * width + x;
      const hNorm = hypsometry[idx];
      const volcVal = volcanoGrid[idx];
      // Active volcanic cones/calderas breach the surface even if surrounded by ocean
      const isWater = !isNoSurface && hasLiquid && hNorm <= seaLevelNormalized && volcVal < 0.35;

      // Solar insolation gradient
      let Tlocal = Tbase;
      if (isTidallyLocked) {
        const distFromSubstellar = Math.sqrt(lat * lat + lon * lon) / 180; // 0 to 1
        Tlocal = Tbase * (1.28 - distFromSubstellar * 0.65);
      } else {
        const latCos = Math.cos((absLat * Math.PI) / 180);
        Tlocal = Tbase * (0.65 + 0.55 * Math.pow(latCos, 0.7));
      }

      // Altitude lapse cooling
      if (!isWater && !isNoSurface) {
        const altitudeRatio = Math.max(0, (hNorm - seaLevelNormalized) / (1 - seaLevelNormalized));
        const altitudeKm = altitudeRatio * maxElevKm;
        const lapse = 6.2 * activeBody.gravityG; // K per km
        Tlocal -= altitudeKm * lapse;
      }

      // Active volcanic caldera thermal anomaly
      if (volcVal > 1.1) {
        Tlocal = Math.max(Tlocal, 1150);
      }

      temperatureGrid[idx] = Math.max(15, Tlocal);

      // Biome assignment
      if (isSupercritical) {
        biomeGrid[idx] = 19; // Supercritical Water Cloud Deck (Class II)
      } else if (isGasGiant) {
        biomeGrid[idx] = 20; // Gas Giant Cloud Deck
      } else if (volcVal > 1.1) {
        biomeGrid[idx] = 15; // Active Lava Caldera & Fissure (yellow-orange)
      } else if (volcVal > 0.38) {
        biomeGrid[idx] = 22; // Active Volcanic Shield & Basalt Edifice
      } else if (isWater) {
        const waterDepthRatio = (seaLevelNormalized - hNorm) / Math.max(0.001, seaLevelNormalized);
        if (waterDepthRatio > 0.6) {
          biomeGrid[idx] = 0; // Abyssal Trench (colored by seaPalette)
        } else if (waterDepthRatio > 0.25) {
          biomeGrid[idx] = 1; // Deep Ocean (colored by seaPalette)
        } else {
          biomeGrid[idx] = 2; // Continental Shelf / Shallows (colored by seaPalette)
        }
      } else {
        // Dry Land / Crust / Ice Shell Biomes
        const pBar = activeBody.pressureBar ?? 0;
        const altRatio = (hNorm - seaLevelNormalized) / Math.max(0.001, 1 - seaLevelNormalized);

        if (isMoltenWorld) {
          if (fractureGrid[idx] > 0.22 || altRatio > 0.74) {
            biomeGrid[idx] = 15; // Active Lava Caldera & Fissure (yellow-orange)
          } else {
            biomeGrid[idx] = 14; // Basalt Volcanic Crust
          }
        } else if (fractureGrid[idx] > 0.28 && isIcyWorld) {
          biomeGrid[idx] = 21; // Cryotectonic Ice Fissure (Linea)
        } else if (isIcyWorld) {
          if (Tlocal < 95) {
            biomeGrid[idx] = 18; // Cryovolcanic Nitrogen Plains
          } else if (craterGrid[idx] > 0.45 && (activeBody.iceFrac ?? 0) < 0.45) {
            biomeGrid[idx] = 16; // Dirty dark cratered regolith-ice mix
          } else {
            biomeGrid[idx] = 8; // Glacial Water-Ice Shell
          }
        } else if (pBar < 0.005) {
          // Vacuum rocky worlds (Moon / Mercury / Io)
          if (Tlocal > 650 || bodyClassLower.includes('volcanic') || bodyClassLower.includes('io')) {
            biomeGrid[idx] = altRatio > 0.68 ? 15 : 14; // Caldera or Basalt Lava
          } else if (Tlocal < 100) {
            biomeGrid[idx] = 18; // Cryovolcanic / Nitrogen ice
          } else {
            biomeGrid[idx] = 16; // Regolith Craterlands
          }
        } else if (Tlocal < 260 && Tbase < 380) {
          if (Tlocal < 235 || altRatio > 0.7) {
            biomeGrid[idx] = 8; // Polar Glacial Ice
          } else if (craterGrid[idx] > 0.35 && pBar < 0.3) {
            biomeGrid[idx] = 16; // Cratered highlands in thin atmosphere
          } else {
            biomeGrid[idx] = 7; // Tundra
          }
        } else if (Tlocal > 370 || Tbase > 420) {
          if (bodyClassLower.includes('volcanic') || bodyClassLower.includes('sulfuric') || bodyClassLower.includes('venusian')) {
            biomeGrid[idx] = altRatio > 0.65 ? 12 : 11; // Badlands / Mountainous Basalt
          } else {
            biomeGrid[idx] = 10; // Hyper-Arid Desert
          }
        } else {
          // Temperate ranges
          const isAqueousOrAmmonia =
            seaPalette.solventKey === 'H2O' ||
            seaPalette.solventKey === 'H2O + CO2' ||
            seaPalette.solventKey === 'NH3-H2O';

          if (altRatio > 0.78 && Tbase < 330) {
            biomeGrid[idx] = 13; // Alpine Glacial Peaks
          } else if (altRatio > 0.5) {
            biomeGrid[idx] = 12; // Mountain Cordillera
          } else if (altRatio > 0.35) {
            biomeGrid[idx] = 11; // High Plateau / Badlands
          } else {
            const isHadleyDesert = absLat >= 18 && absLat <= 32 && Math.sin(lon * 0.1) > 0.1;
            if (isHadleyDesert || !isAqueousOrAmmonia) {
              biomeGrid[idx] = 10; // Hyper-Arid Dunes
            } else if (absLat > 50) {
              biomeGrid[idx] = 6; // Boreal Taiga (if biosphere) or High-Latitude Rocky Steppe (if sterile)
            } else if (hasLiquid && hasBiosphere) {
              biomeGrid[idx] = altRatio < 0.06 ? 3 : 5; // Coastal Marsh or Woodland (colored by floraPalette)
            } else if (hasLiquid) {
              biomeGrid[idx] = 4; // Lowland Plains (colored by floraPalette: green only if F/G water life, else barren tan)
            } else {
              biomeGrid[idx] = 9; // Arid Steppe
            }
          }
        }
      }
    }
  }

  // Atmospheric sky coloring
  const skyColors = deriveAtmosphericSkyColors(
    activeBody.pressureBar,
    activeBody.gases || {},
    isGasGiant,
    isSupercritical,
    isMoltenWorld,
    starTeff
  );

  // Moons in the sky (if viewing host planet)
  const moonsInSky = !isMoon && planet.moons
    ? planet.moons.map((m, mIdx) => {
        const mAngle = (mIdx * (Math.PI * 0.65) + 0.3) % (Math.PI * 2);
        const alt = 15 + ((mIdx * 25) % 55);
        const az = ((mAngle * 180) / Math.PI) % 360;
        const angDiam = Math.max(0.12, +(0.52 * (m.radiusKm / 1737) / (m.a_km / 384400)).toFixed(2));
        return {
          name: m.name,
          angularDiameterDeg: Math.min(3.5, angDiam),
          visualColor: m.iceFrac > 0.5 ? '#d0e5f5' : '#888f99',
          altitudeDeg: alt,
          azimuthDeg: az,
          phase: 0.25 + ((mIdx * 0.3) % 0.7),
        };
      })
    : [];

  const ringSys = planet.ringSystem;
  const hasRings = Boolean(!isMoon && ringSys);

  return {
    seed,
    isGasGiant,
    isIceGiant,
    isSupercritical,
    isNoSurface,
    isIcyWorld,
    isMoltenWorld,
    hasActiveGeology,
    hasBiosphere,
    hasWaterLife,
    floraPalette,
    hasLiquid,
    seaLevelNormalized,
    minElevationKm: minElevKm,
    maxElevationKm: maxElevKm,
    hypsometry,
    temperatureGrid,
    biomeGrid,
    craterGrid,
    fractureGrid,
    volcanoGrid,
    volcanoCount: volcanoes.length,
    cloudGrid,
    cloudOpacity,
    atmospherePalette,
    tectonicPlateGrid,
    platesCount,
    solvent: isMoltenWorld && hasLiquid ? 'Silicate Magma' : hydro?.solvent || 'None',
    solventColorHex: seaPalette.horizonTopHex,
    seaPalette,
    skyColorHex: skyColors.zenith,
    skyHorizonHex: skyColors.horizon,
    starAngularDiameterDeg,
    starColorHex: star.colorHex || '#fff4e6',
    starTeff,
    ambientIllumination: Math.min(1.0, Math.max(0.1, (zone.a_in || 1) / (planet.a || 1))),
    hasRings,
    ringInnerRp: ringSys?.innerRadiusRp || 1.25,
    ringOuterRp: ringSys?.outerRadiusRp || 2.1,
    ringColorHex: ringSys?.compositionLabel?.includes('Ice') ? '#dbeafe' : '#ca8a04',
    ringTau: ringSys?.opticalDepth || 0.45,
    moonsInSky,
  };
}

/**
 * Samples exact telemetry at a given latitude (-90 to +90) and longitude (-180 to +180).
 */
export function sampleSurfacePoint(
  model: PlanetarySurfaceModel,
  planet: RealisticPlanetBody,
  moon: RealisticMoon | null | undefined,
  lat: number,
  lon: number
): SurfacePointTelemetry {
  const activeBody = moon || planet;
  const clampedLat = Math.max(-90, Math.min(90, lat));
  const normalizedLon = ((((lon + 180) % 360) + 360) % 360) - 180;

  const y = Math.floor(Math.max(0, Math.min(179, 90 - clampedLat)));
  const x = Math.floor(Math.max(0, Math.min(359, normalizedLon + 180)));
  const idx = y * 360 + x;

  const hNorm = model.hypsometry[idx];
  const volcVal = model.volcanoGrid[idx];
  const isOcean = !model.isNoSurface && model.hasLiquid && hNorm <= model.seaLevelNormalized && volcVal < 0.35;

  let elevationKm = 0;
  if (!model.isNoSurface) {
    if (isOcean) {
      const depthRatio = (model.seaLevelNormalized - hNorm) / Math.max(0.001, model.seaLevelNormalized);
      elevationKm = +(depthRatio * model.minElevationKm).toFixed(2);
    } else {
      const altRatio = (hNorm - model.seaLevelNormalized) / Math.max(0.001, 1 - model.seaLevelNormalized);
      elevationKm = +(altRatio * model.maxElevationKm).toFixed(2);
    }
  }

  const T_K = Math.round(model.temperatureGrid[idx]);
  const T_C = Math.round(T_K - 273.15);

  const biomeId = model.biomeGrid[idx];
  const biomeDef = BIOMES.find((b) => b.id === biomeId) || BIOMES[4];

  let biomeName = biomeDef.name;
  let biomeColor = biomeDef.color;

  if (model.isNoSurface) {
    biomeName = model.atmospherePalette.classLabel;
    biomeColor = rgbToHex(model.atmospherePalette.bandLightRgb);
  } else if (volcVal > 1.1) {
    biomeName = 'Active Volcanic Lava Caldera';
    biomeColor = '#fbbf24';
  } else if (volcVal > 0.38) {
    biomeName = 'Volcanic Shield Cone (Basalt Edifice)';
    biomeColor = '#4a2518';
  } else if (isOcean) {
    const pal = model.seaPalette;
    if (biomeId === 0) {
      biomeName = `Abyssal Trench (${pal.solventKey} Sea)`;
      biomeColor = rgbToHex(pal.trenchRgb);
    } else if (biomeId === 1) {
      biomeName = `Deep ${pal.solventKey} Ocean`;
      biomeColor = rgbToHex(pal.deepRgb);
    } else {
      biomeName = `Shallow ${pal.solventKey} Shelf`;
      biomeColor = rgbToHex(pal.shallowRgb);
    }
  } else if (biomeId >= 3 && biomeId <= 6) {
    // Dynamic flora or sterile regolith biome naming & coloring
    const fp = model.floraPalette;
    if (fp.hasAnyLife) {
      if (biomeId === 3) {
        biomeName = `Coastal Marsh (${fp.pigmentName})`;
        biomeColor = fp.marshHex;
      } else if (biomeId === 4) {
        biomeName = `Vegetated Lowland Plains (${fp.pigmentName})`;
        biomeColor = fp.plainsHex;
      } else if (biomeId === 5) {
        biomeName = `Temperate Forest / Flora (${fp.pigmentName})`;
        biomeColor = fp.woodlandHex;
      } else {
        biomeName = `High-Latitude Boreal Flora (${fp.pigmentName})`;
        biomeColor = fp.taigaHex;
      }
    } else {
      // Sterile world: barren mineral/rocky plains
      biomeColor = biomeId === 3 ? fp.marshHex : biomeId === 4 ? fp.plainsHex : biomeId === 5 ? fp.woodlandHex : fp.taigaHex;
    }
  } else if (model.isMoltenWorld && model.fractureGrid[idx] > 0.22) {
    biomeName = 'Active Lava Fissure (Magma Rift)';
    biomeColor = '#ffb703';
  } else if (model.isIcyWorld && model.fractureGrid[idx] > 0.28) {
    biomeName = 'Cryotectonic Ice Fissure (Linea)';
    biomeColor = '#3b7ea1';
  } else if (model.craterGrid[idx] > 0.35) {
    biomeName = `${biomeDef.name} (Impact Crater)`;
  }

  // Barometric pressure at altitude: P(h) = P0 * exp(-h / H)
  const P0 = model.isNoSurface ? 100 : (activeBody.pressureBar ?? 0);
  const scaleHeightKm = Math.max(2, (8.314 * T_K) / (0.029 * activeBody.gravityG * 9.81 * 1000));
  const pressureBar = +(P0 * Math.exp(-Math.max(0, elevationKm) / scaleHeightKm)).toFixed(3);

  // Generate plausible procedural name for geographical feature
  const hemisphere = clampedLat >= 0 ? 'Northern' : 'Southern';
  const prefix = model.isNoSurface
    ? 'Zonal Band'
    : volcVal > 0.38
    ? 'Tholus / Mons'
    : isOcean
    ? 'Mare'
    : model.fractureGrid[idx] > 0.25
    ? model.isMoltenWorld
      ? 'Rima'
      : 'Linea'
    : model.craterGrid[idx] > 0.35
    ? 'Crater'
    : elevationKm > 3
    ? 'Mons'
    : elevationKm > 1
    ? 'Planum'
    : 'Vallis';
  const featureName = `${prefix} ${hemisphere} (Lat ${Math.round(clampedLat)}°, Lon ${Math.round(normalizedLon)}°)`;

  return {
    lat: clampedLat,
    lon: normalizedLon,
    elevationMeters: Math.round(elevationKm * 1000),
    elevationKm,
    isOcean,
    temperatureK: T_K,
    temperatureC: T_C,
    pressureBar,
    biome: biomeName,
    biomeColor,
    featureName,
  };
}

