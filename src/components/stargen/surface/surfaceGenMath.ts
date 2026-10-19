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

export interface PlanetarySurfaceModel {
  seed: number;
  isGasGiant: boolean;
  isIcyWorld: boolean;
  hasLiquid: boolean;
  seaLevelNormalized: number;
  minElevationKm: number;
  maxElevationKm: number;
  hypsometry: Float32Array; // Normalized [0, 1] elevation grid: 360 x 180 (1 deg resolution)
  temperatureGrid: Float32Array; // Surface temperature in Kelvin
  biomeGrid: Uint8Array; // Biome index grid
  craterGrid: Float32Array; // Impact crater rim/bowl intensity
  fractureGrid: Float32Array; // Cryotectonic ice crack / linea chasm intensity
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
      trenchRgb: [34, 52, 8],
      deepRgb: [74, 108, 16],
      shallowRgb: [158, 212, 42],
      horizonTopHex: '#a3e635',
      horizonBotHex: '#3f6212',
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
      trenchRgb: [6, 38, 36],
      deepRgb: [14, 88, 82],
      shallowRgb: [42, 182, 158],
      horizonTopHex: '#2dd4bf',
      horizonBotHex: '#115e59',
    };
  }
  if (s === 'H2O + CO2' || (sLower.includes('h2o') && sLower.includes('co2'))) {
    return {
      solventKey: 'H2O + CO2',
      displayName: 'Carbonated H2O + CO2',
      trenchRgb: [5, 28, 44],
      deepRgb: [12, 65, 95],
      shallowRgb: [24, 148, 168],
      horizonTopHex: '#14b8a6',
      horizonBotHex: '#0f766e',
    };
  }
  if (sLower.includes('magma') || sLower.includes('silicate') || sLower.includes('lava')) {
    return {
      solventKey: 'Silicate Magma',
      displayName: 'Silicate Magma',
      trenchRgb: [98, 14, 4],
      deepRgb: [195, 42, 8],
      shallowRgb: [255, 178, 28],
      horizonTopHex: '#fb923c',
      horizonBotHex: '#7c2d12',
    };
  }
  if (sLower.includes('supercritical')) {
    return {
      solventKey: 'Supercritical H2O',
      displayName: 'Supercritical Fluid',
      trenchRgb: [18, 34, 68],
      deepRgb: [38, 78, 128],
      shallowRgb: [95, 175, 220],
      horizonTopHex: '#38bdf8',
      horizonBotHex: '#1e3a8a',
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

export const BIOMES = [
  { id: 0, name: 'Abyssal Trench', color: '#041230', isWater: true },
  { id: 1, name: 'Deep Ocean', color: '#0a306c', isWater: true },
  { id: 2, name: 'Continental Shelf / Shallows', color: '#1880c6', isWater: true },
  { id: 3, name: 'Coastal Marsh / Estuary', color: '#1b4d3e', isWater: false },
  { id: 4, name: 'Lowland Plains', color: '#3d6738', isWater: false },
  { id: 5, name: 'Temperate Woodland', color: '#25522b', isWater: false },
  { id: 6, name: 'Boreal Taiga / Alien Flora', color: '#1d3e2b', isWater: false },
  { id: 7, name: 'Tundra / Permafrost', color: '#68776b', isWater: false },
  { id: 8, name: 'Polar Glacial Ice', color: '#dce8f5', isWater: false },
  { id: 9, name: 'Arid Savannah', color: '#9d8744', isWater: false },
  { id: 10, name: 'Hyper-Arid Dunes / Desert', color: '#c49a4f', isWater: false },
  { id: 11, name: 'High Plateau / Badlands', color: '#885834', isWater: false },
  { id: 12, name: 'Mountain Cordillera', color: '#605553', isWater: false },
  { id: 13, name: 'Alpine Glacial Peaks', color: '#edf2f7', isWater: false },
  { id: 14, name: 'Basalt Lava Plains', color: '#2a1a15', isWater: false },
  { id: 15, name: 'Active Volcanic Caldera', color: '#ff3700', isWater: false },
  { id: 16, name: 'Regolith Impact Craterlands', color: '#5b6472', isWater: false },
  { id: 17, name: 'Hydrocarbon Methane Sea', color: '#4a260b', isWater: true },
  { id: 18, name: 'Cryovolcanic Nitrogen Plains', color: '#c8d3e0', isWater: false },
  { id: 19, name: 'Supercritical Fluid Abyssal Deck', color: '#264e80', isWater: true },
  { id: 20, name: 'Jovian Cloud Deck / Continuous Envelope', color: '#b88656', isWater: false },
  { id: 21, name: 'Cryotectonic Ice Fissure (Linea)', color: '#3b7ea1', isWater: false },
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
function generateSphericalCraters(seed: number, pressureBar: number | null | undefined, isGasGiant: boolean): SphericalCrater[] {
  if (isGasGiant) return [];
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
 * Generates sweeping 3D cryotectonic ice fractures (Europa-like lineae & Enceladus-like tiger stripes)
 * across worlds with icy surfaces.
 */
function generateSphericalIceCracks(
  seed: number,
  isIcyWorld: boolean,
  hasSubsurfaceOcean: boolean
): SphericalIceCrack[] {
  if (!isIcyWorld) return [];

  const crackPrng = createPrng(seed ^ 0x517cc1b7);
  // Worlds with subsurface oceans (e.g. Europa/Enceladus) experience strong tidal flexing -> more lineae
  const count = hasSubsurfaceOcean ? 26 : 16;
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
 * Derives realistic sky color and horizon scattering based on atmospheric pressure,
 * dominant gases, and star spectral type.
 */
export function deriveAtmosphericSkyColors(
  pressureBar: number | null,
  gases: Record<string, number>,
  isGasGiant: boolean,
  isSupercritical: boolean,
  _starColorHex: string,
  starTeff: number
): { zenith: string; horizon: string; hazeFactor: number } {
  if (isGasGiant) {
    return { zenith: '#2a4463', horizon: '#8ca8c8', hazeFactor: 0.9 };
  }
  if (isSupercritical) {
    return { zenith: '#41223e', horizon: '#7d4a63', hazeFactor: 0.95 };
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
    return { zenith: '#3a4425', horizon: '#788c42', hazeFactor: 0.85 };
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
 * climate grid, and sky horizon parameters.
 */
export function generatePlanetarySurfaceModel(
  planet: RealisticPlanetBody,
  moon: RealisticMoon | null | undefined,
  zone: RealisticPlanetaryZone,
  stars: RealisticStarNode[]
): PlanetarySurfaceModel {
  const isMoon = Boolean(moon);
  const activeBody = moon || planet;
  const isGasGiant = !isMoon && (planet.gasFrac >= 0.015 || planet.massEarth >= 15);
  const hydro = activeBody.hydrosphere as RealisticHydrosphere | null | undefined;
  const hasLiquid = Boolean(hydro && (hydro.coveragePct ?? 0) > 0 && hydro.solvent !== 'None');
  const coverageFrac = hasLiquid && hydro && hydro.coveragePct ? hydro.coveragePct / 100 : 0;

  const bodyClass = isMoon ? (moon?.moonClass || '') : planet.planetClass;
  const bodyClassLower = bodyClass.toLowerCase();
  const Tbase = activeBody.surfaceTempK || activeBody.T_eq || 288;
  const hasSubsurfaceOcean = Boolean(
    hydro &&
      (((hydro.iceKm ?? 0) > 0 && (hydro.liqKm ?? 0) > 0) ||
        hydro.state?.toLowerCase().includes('subsurface'))
  );

  // Determine whether this world has a predominantly icy surface / cryosphere
  const isIcyWorld =
    !isGasGiant &&
    !bodyClassLower.includes('lava') &&
    !bodyClassLower.includes('volcanic') &&
    ((activeBody.iceFrac ?? 0) >= 0.15 ||
      hasSubsurfaceOcean ||
      (hydro?.iceKm ?? 0) > 0.5 ||
      bodyClassLower.includes('ice') ||
      bodyClassLower.includes('cryo') ||
      bodyClassLower.includes('glacial') ||
      (Tbase < 235 && (activeBody.rockFrac ?? 1) < 0.85));

  // Deterministic seed
  const bodyKey = isMoon
    ? (moon?.id || moon?.name || 'moon')
    : `${planet.planetClass}_${planet.a}_${planet.radiusEarth}`;
  let seed = 1337;
  for (let i = 0; i < bodyKey.length; i++) {
    seed = (seed * 31 + bodyKey.charCodeAt(i)) >>> 0;
  }
  const prng = createPrng(seed);

  // Host star telemetry
  const star = stars[0] || { Teff: 5778, colorHex: '#fff4e6', radius: 1.0, lumNum: 1.0 };
  const starDistAU = Math.max(0.02, planet.a);
  const starRadiusAU = (star.radius || 1.0) * 0.00465047;
  const starAngularDiameterDeg = +(2 * Math.atan(starRadiusAU / (2 * starDistAU)) * (180 / Math.PI)).toFixed(2);

  // Plate tectonics parameters
  const platesCount = isGasGiant ? 0 : activeBody.rockFrac > 0.4 && activeBody.gravityG > 0.4 ? 7 + Math.floor(prng() * 6) : 0;

  // Maximum elevation depends inversely on gravity (low-g worlds have towering volcanic shields & deep crater walls)
  const gClamped = Math.max(0.05, activeBody.gravityG);
  const maxElevKm = isGasGiant ? 0 : +(Math.min(28, 7.5 / Math.sqrt(gClamped)) * (0.8 + prng() * 0.4)).toFixed(1);
  const minElevKm = isGasGiant ? 0 : +(-maxElevKm * 0.75).toFixed(1);

  // Hypsometry resolution: 360 lon x 180 lat
  const width = 360;
  const height = 180;
  const hypsometry = new Float32Array(width * height);
  const temperatureGrid = new Float32Array(width * height);
  const biomeGrid = new Uint8Array(width * height);
  const craterGrid = new Float32Array(width * height);
  const fractureGrid = new Float32Array(width * height);
  const tectonicPlateGrid = new Uint8Array(width * height);

  // Pre-generate 3D spherical impact craters for airless and thin-atmosphere worlds
  // Young cryotectonic ice shells with subsurface oceans (like Europa/Enceladus) resurface over old craters
  const craters = generateSphericalCraters(
    seed,
    hasSubsurfaceOcean ? 0.35 : activeBody.pressureBar,
    isGasGiant
  );

  // Pre-generate 3D spherical ice cracks / lineae for icy worlds
  const iceCracks = generateSphericalIceCracks(seed, isIcyWorld, hasSubsurfaceOcean);

  // Generate elevation samples
  const allElevations: number[] = [];
  for (let y = 0; y < height; y++) {
    const lat = 90 - y; // 90 to -90
    const phi = ((90 - lat) * Math.PI) / 180;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    for (let x = 0; x < width; x++) {
      const lon = x - 180; // -180 to 180
      const idx = y * width + x;

      if (isGasGiant) {
        // Banded zonal jet streams
        const latRad = (lat * Math.PI) / 180;
        const bands = Math.sin(latRad * 14) * 0.25 + Math.sin(latRad * 28) * 0.1;
        const swirl = fbm2D(lon * 0.05, lat * 0.1, seed, 4) * 0.25;
        hypsometry[idx] = Math.max(0, Math.min(1, 0.5 + bands + swirl));
        continue;
      }

      // Base spherical tectonic terrain
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

      // Apply 3D cryotectonic ice cracks / lineae & double-ridges on icy worlds
      if (iceCracks.length > 0) {
        let crackDelta = 0;
        let crackIntensity = 0;

        for (let k = 0; k < iceCracks.length; k++) {
          const ic = iceCracks[k];
          // Quick bounding check before computing atan2
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
                // Deep V-shaped ice fissure chasm
                const chasm = 1.0 - w;
                crackDelta -= ic.depth * taper * Math.pow(chasm, 1.5);
                crackIntensity = Math.max(crackIntensity, chasm * taper);
              } else if (w < 2.15) {
                // Flanking Europan double-ridge uplift walls
                const ridgeNorm = 1.0 - Math.abs(w - 1.38) / 0.77;
                if (ridgeNorm > 0) {
                  crackDelta += ic.depth * 0.36 * taper * ridgeNorm * ridgeNorm;
                }
              }
            }
          }
        }

        // Fine secondary branching crevasse network across the ice shell
        const crevasseField = Math.abs(sphericalFbm(lat * 2.4, lon * 2.4, seed + 1319, 3) - 0.5);
        if (crevasseField < 0.018) {
          const fineIntensity = (1.0 - crevasseField / 0.018) * 0.65;
          crackDelta -= 0.065 * fineIntensity;
          crackIntensity = Math.max(crackIntensity, fineIntensity);
        }

        elev += crackDelta;
        fractureGrid[idx] = Math.min(1.5, crackIntensity);
      }

      hypsometry[idx] = Math.max(0.01, Math.min(0.99, elev));
      allElevations.push(hypsometry[idx]);
    }
  }

  // Determine exact sea-level threshold to match coveragePct
  let seaLevelNormalized = 0.42;
  if (!isGasGiant && hasLiquid && allElevations.length > 0) {
    allElevations.sort((a, b) => a - b);
    const splitIndex = Math.min(allElevations.length - 1, Math.floor(allElevations.length * coverageFrac));
    seaLevelNormalized = allElevations[splitIndex];
  }

  // Solvent-specific sea color palette
  const seaPalette = getSolventSeaPalette(hydro?.solvent);

  const isTidallyLocked = activeBody.spinState?.toLowerCase().includes('locked') || activeBody.spinState?.includes('1:1');

  // Compute thermal and biome grid
  for (let y = 0; y < height; y++) {
    const lat = 90 - y;
    const absLat = Math.abs(lat);
    for (let x = 0; x < width; x++) {
      const lon = x - 180;
      const idx = y * width + x;
      const hNorm = hypsometry[idx];
      const isWater = !isGasGiant && hasLiquid && hNorm <= seaLevelNormalized;

      // Solar insolation gradient
      let Tlocal = Tbase;
      if (isTidallyLocked) {
        // Substellar hotspot at (0, 0)
        const distFromSubstellar = Math.sqrt(lat * lat + lon * lon) / 180; // 0 to 1
        Tlocal = Tbase * (1.35 - distFromSubstellar * 0.9);
      } else {
        // Planetary latitude drop: hot equator, cold poles
        const latCos = Math.cos((absLat * Math.PI) / 180);
        Tlocal = Tbase * (0.65 + 0.55 * Math.pow(latCos, 0.7));
      }

      // Altitude lapse cooling
      if (!isWater && !isGasGiant) {
        const altitudeRatio = Math.max(0, (hNorm - seaLevelNormalized) / (1 - seaLevelNormalized));
        const altitudeKm = altitudeRatio * maxElevKm;
        const lapse = 6.2 * activeBody.gravityG; // K per km
        Tlocal -= altitudeKm * lapse;
      }

      temperatureGrid[idx] = Math.max(15, Tlocal);

      // Biome assignment
      if (isGasGiant) {
        biomeGrid[idx] = 20; // Jovian Cloud Deck
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
        // Dry Land / Ice Shell Biomes
        const pBar = activeBody.pressureBar ?? 0;
        const altRatio = (hNorm - seaLevelNormalized) / Math.max(0.001, 1 - seaLevelNormalized);

        if (fractureGrid[idx] > 0.28) {
          biomeGrid[idx] = 21; // Cryotectonic Ice Fissure (Linea)
        } else if (isIcyWorld) {
          // Global Ice Shell (Europa, Enceladus, Ganymede, Callisto, Triton, Ice Worlds)
          if (Tlocal < 95) {
            biomeGrid[idx] = 18; // Cryovolcanic Nitrogen Plains
          } else if (craterGrid[idx] > 0.45 && (activeBody.iceFrac ?? 0) < 0.45) {
            biomeGrid[idx] = 16; // Dirty dark cratered regolith-ice mix (Callisto-like)
          } else {
            biomeGrid[idx] = 8; // Glacial Water-Ice Shell
          }
        } else if (pBar < 0.005) {
          // Vacuum rocky worlds (Moon / Mercury / Io)
          if (Tlocal > 700 || bodyClass.includes('Lava') || bodyClass.includes('Volcanic')) {
            biomeGrid[idx] = altRatio > 0.7 ? 15 : 14; // Caldera or Basalt Lava
          } else if (Tlocal < 100) {
            biomeGrid[idx] = 18; // Cryovolcanic / Nitrogen ice
          } else {
            biomeGrid[idx] = 16; // Regolith Craterlands
          }
        } else if (Tlocal < 260) {
          // Freezing
          if (Tlocal < 235 || altRatio > 0.7) {
            biomeGrid[idx] = 8; // Polar Glacial Ice
          } else if (craterGrid[idx] > 0.35 && pBar < 0.3) {
            biomeGrid[idx] = 16; // Cratered highlands in thin atmosphere
          } else {
            biomeGrid[idx] = 7; // Tundra
          }
        } else if (Tlocal > 380) {
          // Extreme scorching / Venusian / Lava
          if (bodyClass.includes('Lava')) {
            biomeGrid[idx] = altRatio > 0.6 ? 15 : 14;
          } else {
            biomeGrid[idx] = 10; // Hyper-Arid Desert
          }
        } else {
          // Temperate habitable ranges
          if (altRatio > 0.75) {
            biomeGrid[idx] = 13; // Alpine Glacial Peaks
          } else if (altRatio > 0.5) {
            biomeGrid[idx] = 12; // Mountain Cordillera
          } else if (altRatio > 0.35) {
            biomeGrid[idx] = 11; // High Plateau / Badlands
          } else {
            // Moisture / Hadley cell belts (deserts around 20-30 deg latitude)
            const isHadleyDesert = absLat >= 18 && absLat <= 32 && Math.sin(lon * 0.1) > 0.1;
            if (isHadleyDesert) {
              biomeGrid[idx] = 10; // Hyper-Arid Dunes
            } else if (absLat > 50) {
              biomeGrid[idx] = 6; // Boreal Taiga / Alien Flora
            } else if (hasLiquid && hydro?.biosphere) {
              biomeGrid[idx] = 5; // Alien Woodland
            } else if (hasLiquid) {
              biomeGrid[idx] = 4; // Lowland Plains
            } else {
              biomeGrid[idx] = 9; // Arid Savannah
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
    Boolean(hydro?.solvent?.includes('Supercritical')),
    star.colorHex,
    star.Teff
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
    isIcyWorld,
    hasLiquid,
    seaLevelNormalized,
    minElevationKm: minElevKm,
    maxElevationKm: maxElevKm,
    hypsometry,
    temperatureGrid,
    biomeGrid,
    craterGrid,
    fractureGrid,
    tectonicPlateGrid,
    platesCount,
    solvent: hydro?.solvent || 'None',
    solventColorHex: seaPalette.horizonTopHex,
    seaPalette,
    skyColorHex: skyColors.zenith,
    skyHorizonHex: skyColors.horizon,
    starAngularDiameterDeg,
    starColorHex: star.colorHex || '#fff4e6',
    starTeff: star.Teff || 5778,
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
  const isOcean = !model.isGasGiant && model.hasLiquid && hNorm <= model.seaLevelNormalized;

  let elevationKm = 0;
  if (!model.isGasGiant) {
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

  if (isOcean) {
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
  } else if (model.fractureGrid[idx] > 0.28) {
    biomeName = 'Cryotectonic Ice Fissure (Linea)';
    biomeColor = '#3b7ea1';
  } else if (model.craterGrid[idx] > 0.35) {
    biomeName = `${biomeDef.name} (Impact Crater)`;
  }

  // Barometric pressure at altitude: P(h) = P0 * exp(-h / H)
  const P0 = activeBody.pressureBar ?? 0;
  const scaleHeightKm = Math.max(2, (8.314 * T_K) / (0.029 * activeBody.gravityG * 9.81 * 1000));
  const pressureBar = +(P0 * Math.exp(-Math.max(0, elevationKm) / scaleHeightKm)).toFixed(3);

  // Generate plausible procedural name for geographical feature
  const hemisphere = clampedLat >= 0 ? 'Northern' : 'Southern';
  const prefix = isOcean
    ? 'Mare'
    : model.fractureGrid[idx] > 0.28
    ? 'Linea'
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
