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
  freezingPointK: number;
  iceBiomeName: string;
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

export interface CrustCompositionPalette {
  compositionLabel: string;
  craterlandHex: string;
  alluvialHex: string;
  lowlandHex: string;
  basinHex: string;
  steppeHex: string;
  aridHex: string;
  duneHex: string;
  plateauHex: string;
  mountainHex: string;
  peakHex: string;
  tundraHex: string;
  iceHex: string;
  cryoPlainsHex: string;
  basaltHex: string;
  lowlandRgb: [number, number, number];
  plateauRgb: [number, number, number];
  mountainRgb: [number, number, number];
  peakRgb: [number, number, number];
  iceEjectaBoost: number; // Bright icy crater ejecta on ice-silicate worlds
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
  compositionPalette: CrustCompositionPalette;
  hasLiquid: boolean;
  seaLevelNormalized: number;
  minElevationKm: number;
  maxElevationKm: number;
  hypsometry: Float32Array; // Normalized [0, 1] elevation grid: 360 x 180 (1 deg resolution)
  temperatureGrid: Float32Array; // Surface temperature in Kelvin
  moistureGrid: Float32Array; // Continuous [0, 1] surface moisture/precipitation index
  biomeGrid: Uint8Array; // Contiguous biome index grid
  blendedLandRgb: Uint8Array; // Smoothly blended RGB (360 * 180 * 3) across biome transitions
  craterGrid: Float32Array; // Impact crater rim/bowl intensity
  craterProminence: number; // Inverse size/gravity scaling factor for crater visibility (higher on smaller airless worlds)
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

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16) || 0;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerpRgbTuple(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ];
}

function lerpHex(hexA: string, hexB: string, t: number): string {
  return rgbToHex(lerpRgbTuple(hexToRgbTuple(hexA), hexToRgbTuple(hexB), t));
}

/**
 * Slightly perturbs an RGB tuple in HSL + warmth space so each solid world or gas giant
 * has a subtly randomized, distinct color signature while remaining faithful to its physical class.
 */
function perturbRgbSlightly(
  rgb: [number, number, number],
  hueShiftDeg: number,
  satScale: number,
  litScale: number,
  warmthOffset = 0
): [number, number, number] {
  const r0 = rgb[0] / 255;
  const g0 = rgb[1] / 255;
  const b0 = rgb[2] / 255;
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  const l0 = (max + min) * 0.5;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d > 1e-5) {
    s = l0 > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r0) h = ((g0 - b0) / d + (g0 < b0 ? 6 : 0)) / 6;
    else if (max === g0) h = ((b0 - r0) / d + 2) / 6;
    else h = ((r0 - g0) / d + 4) / 6;
  }

  const h1 = (((h + hueShiftDeg / 360) % 1) + 1) % 1;
  const s1 = Math.max(0, Math.min(1, s * satScale));
  const l1 = Math.max(0.02, Math.min(0.98, l0 * litScale));

  let r1 = l1;
  let g1 = l1;
  let b1 = l1;
  if (s1 > 1e-5) {
    const hue2rgb = (p: number, q: number, tVal: number) => {
      let t = tVal;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l1 < 0.5 ? l1 * (1 + s1) : l1 + s1 - l1 * s1;
    const p = 2 * l1 - q;
    r1 = hue2rgb(p, q, h1 + 1 / 3);
    g1 = hue2rgb(p, q, h1);
    b1 = hue2rgb(p, q, h1 - 1 / 3);
  }

  return [
    Math.max(0, Math.min(255, Math.round(r1 * 255 + warmthOffset))),
    Math.max(0, Math.min(255, Math.round(g1 * 255 + warmthOffset * 0.22))),
    Math.max(0, Math.min(255, Math.round(b1 * 255 - warmthOffset * 0.82))),
  ];
}

function perturbHexSlightly(
  hex: string,
  hueShiftDeg: number,
  satScale: number,
  litScale: number,
  warmthOffset = 0
): string {
  return rgbToHex(perturbRgbSlightly(hexToRgbTuple(hex), hueShiftDeg, satScale, litScale, warmthOffset));
}

/**
 * Derives the solid crust/regolith mineral color palette from the planet's or moon's
 * bulk physical composition (rockFrac, iceFrac, densityGcm3, gases, tidal heating, temperature, and class).
 */
export function deriveCrustCompositionPalette(params: {
  rockFrac: number;
  iceFrac: number;
  densityGcm3: number;
  albedo: number;
  tidalW: number;
  pressureBar: number | null | undefined;
  gases: Record<string, number>;
  solventKey: string;
  coverageFrac: number;
  Tbase: number;
  bodyClassLower: string;
  isIcyWorld: boolean;
  isMoltenWorld: boolean;
  hasBiosphere: boolean;
}): CrustCompositionPalette {
  const {
    rockFrac,
    iceFrac,
    densityGcm3,
    tidalW,
    pressureBar,
    gases,
    solventKey,
    coverageFrac,
    Tbase,
    bodyClassLower,
    isIcyWorld,
    isMoltenWorld,
    hasBiosphere,
  } = params;
  const pBar = pressureBar ?? 0;

  // 1. Io-like / Tidally Heated Sulfur-Silicate Allotrope Worlds
  const isSulfurVolcanic =
    !isMoltenWorld &&
    (bodyClassLower.includes('io') ||
      bodyClassLower.includes('sulfur') ||
      (tidalW >= 0.22 && iceFrac < 0.14 && Tbase < 680) ||
      ((gases.SO2 || 0) > 0.025 && pBar < 2.5 && !isIcyWorld));

  if (isSulfurVolcanic) {
    const lowRgb: [number, number, number] = [214, 165, 38];
    const platRgb: [number, number, number] = [166, 78, 24];
    const mtnRgb: [number, number, number] = [78, 60, 42];
    const peakRgb: [number, number, number] = [242, 222, 96];
    return {
      compositionLabel: 'Sulfur Allotrope & Silicate Crust (S8 / SO2 Frost)',
      craterlandHex: '#b8821e',
      alluvialHex: '#cfa028',
      lowlandHex: '#d6a526',
      basinHex: '#c48c20',
      steppeHex: '#b5781c',
      aridHex: '#d9aa2b',
      duneHex: '#e6c338',
      plateauHex: '#a64e18',
      mountainHex: '#4e3c2a',
      peakHex: '#f2de60',
      tundraHex: '#c79c30',
      iceHex: '#f5e884',
      cryoPlainsHex: '#ebd96a',
      basaltHex: '#332419',
      lowlandRgb: lowRgb,
      plateauRgb: platRgb,
      mountainRgb: mtnRgb,
      peakRgb: peakRgb,
      iceEjectaBoost: 0.15,
    };
  }

  // 2. Iron-Rich / Core-Dominated / Mercury-like Metallic Silicate Worlds
  const isIronRich =
    bodyClassLower.includes('iron') ||
    bodyClassLower.includes('core') ||
    bodyClassLower.includes('mercury') ||
    (iceFrac < 0.05 && (densityGcm3 >= 6.0 || (densityGcm3 >= 5.25 && pBar < 0.05)));

  if (isIronRich) {
    // Interpolate metallic sheen by density (5.2 -> 7.8 g/cm3)
    const metalFactor = Math.max(0, Math.min(1, (densityGcm3 - 5.1) / 2.4));
    const lowRgb = lerpRgbTuple([88, 92, 102], [72, 78, 90], metalFactor);
    const platRgb = lerpRgbTuple([66, 70, 79], [54, 59, 69], metalFactor);
    const mtnRgb = lerpRgbTuple([50, 54, 62], [40, 44, 52], metalFactor);
    const peakRgb = lerpRgbTuple([124, 132, 145], [142, 152, 168], metalFactor);
    return {
      compositionLabel: 'Iron-Rich Metallic Silicate & Graphite Regolith',
      craterlandHex: rgbToHex(lerpRgbTuple([70, 74, 83], [58, 63, 73], metalFactor)),
      alluvialHex: rgbToHex(lerpRgbTuple([78, 82, 92], [65, 71, 82], metalFactor)),
      lowlandHex: rgbToHex(lowRgb),
      basinHex: rgbToHex(lerpRgbTuple([74, 78, 88], [62, 68, 78], metalFactor)),
      steppeHex: rgbToHex(lerpRgbTuple([82, 86, 95], [68, 74, 86], metalFactor)),
      aridHex: rgbToHex(lerpRgbTuple([92, 96, 106], [78, 84, 96], metalFactor)),
      duneHex: rgbToHex(lerpRgbTuple([102, 107, 118], [88, 95, 108], metalFactor)),
      plateauHex: rgbToHex(platRgb),
      mountainHex: rgbToHex(mtnRgb),
      peakHex: rgbToHex(peakRgb),
      tundraHex: '#5a606e',
      iceHex: '#cbd5e1',
      cryoPlainsHex: '#94a3b8',
      basaltHex: '#24272e',
      lowlandRgb: lowRgb,
      plateauRgb: platRgb,
      mountainRgb: mtnRgb,
      peakRgb: peakRgb,
      iceEjectaBoost: 0.25,
    };
  }

  // 3. Tholin-Stained Cryo-Organic & Hydrocarbon Worlds (Titan, Pluto, Triton, Kuiper-like)
  const isTholinCryo =
    (isIcyWorld || Tbase < 185) &&
    ((gases.CH4 || 0) >= 0.005 ||
      solventKey === 'CH4-C2H6' ||
      bodyClassLower.includes('titan') ||
      (Tbase < 115 && iceFrac >= 0.15));

  if (isTholinCryo) {
    const lowRgb: [number, number, number] = [166, 104, 60];
    const platRgb: [number, number, number] = [184, 128, 78];
    const mtnRgb: [number, number, number] = [96, 58, 36];
    const peakRgb: [number, number, number] = [226, 214, 200];
    return {
      compositionLabel: 'Tholin-Stained Cryo-Organic & Water/Nitrogen Ice',
      craterlandHex: '#7d4b32',
      alluvialHex: '#8a5230',
      lowlandHex: '#a6683c',
      basinHex: '#945a33',
      steppeHex: '#87502f',
      aridHex: '#9e6238',
      duneHex: '#694226', // Dark hydrocarbon coffee-brown sand dunes
      plateauHex: '#b8804e', // Bright Xanadu-like icy-tholin plateaus
      mountainHex: '#603a24',
      peakHex: '#e2d6c8',
      tundraHex: '#8c5c3e',
      iceHex: '#dfd0be', // Warm cream nitrogen/water ice (Sputnik Planitia tone)
      cryoPlainsHex: '#d4c2ae',
      basaltHex: '#3b2316',
      lowlandRgb: lowRgb,
      plateauRgb: platRgb,
      mountainRgb: mtnRgb,
      peakRgb: peakRgb,
      iceEjectaBoost: 0.7,
    };
  }

  // 4. Icy Worlds & High Ice-Fraction Worlds (Ice biomes use water-ice colors; exposed rock > 250K uses silicate/carbonaceous rock colors!)
  if (isIcyWorld || iceFrac >= 0.15) {
    // Normalize ice purity from 0 (dirty 15% ice Callisto-like lag) to 1 (pure >= 65% ice Enceladus/Europa shell)
    const icePurity = Math.max(0, Math.min(1, (iceFrac - 0.12) / 0.52));
    // Underlying silicate/carbonaceous rock color exposed where local surface temperature > ~250 K
    const rockDarkness = Math.max(0, Math.min(1, (3.4 - densityGcm3) / 1.5));
    const lowRgb = lerpRgbTuple([132, 114, 96], [98, 88, 78], rockDarkness);
    const platRgb = lerpRgbTuple([112, 95, 78], [82, 73, 65], rockDarkness);
    const mtnRgb = lerpRgbTuple([88, 76, 66], [66, 59, 53], rockDarkness);
    const peakRgb = lerpRgbTuple([216, 232, 246], [245, 250, 255], icePurity);

    return {
      compositionLabel:
        icePurity >= 0.65
          ? `Pure Crystalline Water-Ice Shell (${Math.round(iceFrac * 100)}% Ice / ${Math.round(rockFrac * 100)}% Rock)`
          : `Silicate-Ice Cryo-Regolith Mix (${Math.round(iceFrac * 100)}% Ice / ${Math.round(rockFrac * 100)}% Rock)`,
      craterlandHex: rgbToHex(lerpRgbTuple([104, 92, 80], [78, 70, 63], rockDarkness)),
      alluvialHex: rgbToHex(lerpRgbTuple([116, 100, 84], [88, 78, 70], rockDarkness)),
      lowlandHex: rgbToHex(lowRgb),
      basinHex: rgbToHex(lerpRgbTuple([98, 85, 74], [74, 66, 60], rockDarkness)),
      steppeHex: rgbToHex(lerpRgbTuple([122, 105, 88], [92, 82, 74], rockDarkness)),
      aridHex: rgbToHex(lerpRgbTuple([138, 118, 96], [106, 94, 82], rockDarkness)),
      duneHex: rgbToHex(lerpRgbTuple([152, 130, 104], [118, 104, 90], rockDarkness)),
      plateauHex: rgbToHex(platRgb),
      mountainHex: rgbToHex(mtnRgb),
      peakHex: rgbToHex(peakRgb),
      tundraHex: rgbToHex(lerpRgbTuple([110, 96, 84], [84, 76, 68], rockDarkness)),
      iceHex: lerpHex('#c4d8eb', '#eaf4fc', icePurity),
      cryoPlainsHex: lerpHex('#b0c4d8', '#dfeefb', icePurity),
      basaltHex: '#2e2925',
      lowlandRgb: lowRgb,
      plateauRgb: platRgb,
      mountainRgb: mtnRgb,
      peakRgb: peakRgb,
      iceEjectaBoost: 0.65 + 0.35 * (1 - icePurity), // Dirty ice worlds show strong bright ice crater rays!
    };
  }

  // 5. Oxidized Ferric / Hematite Regolith (Mars-like Arid CO2 or Sub-Earth Red Desert Worlds)
  const isFerricMarsLike =
    bodyClassLower.includes('mars') ||
    bodyClassLower.includes('ferric') ||
    (!hasBiosphere &&
      !isMoltenWorld &&
      iceFrac < 0.12 &&
      ((gases.CO2 || 0) >= 0.25 && pBar >= 0.001 && pBar < 1.8 && coverageFrac < 0.3));

  if (isFerricMarsLike) {
    const lowRgb: [number, number, number] = [178, 92, 55];
    const platRgb: [number, number, number] = [126, 58, 36];
    const mtnRgb: [number, number, number] = [92, 46, 34];
    const peakRgb: [number, number, number] = [226, 198, 184];
    return {
      compositionLabel: 'Oxidized Ferric Iron-Oxide (Fe2O3 Hematite) Regolith',
      craterlandHex: '#944a2e',
      alluvialHex: '#a85534',
      lowlandHex: '#b25c37',
      basinHex: '#a35230',
      steppeHex: '#9c4e2d',
      aridHex: '#bd653c',
      duneHex: '#cf7446',
      plateauHex: '#7e3a24',
      mountainHex: '#5c2e22',
      peakHex: '#e2c6b8',
      tundraHex: '#965840',
      iceHex: '#eddcd2',
      cryoPlainsHex: '#d9bfb2',
      basaltHex: '#381e17',
      lowlandRgb: lowRgb,
      plateauRgb: platRgb,
      mountainRgb: mtnRgb,
      peakRgb: peakRgb,
      iceEjectaBoost: 0.2,
    };
  }

  // 6. Venusian Dense CO2 Sulfuric-Weathered Basalt Crust
  const isVenusianBasalt =
    !isMoltenWorld &&
    (bodyClassLower.includes('venus') || ((gases.CO2 || 0) >= 0.5 && pBar >= 3.0 && Tbase >= 400));

  if (isVenusianBasalt) {
    const lowRgb: [number, number, number] = [132, 96, 52];
    const platRgb: [number, number, number] = [104, 74, 40];
    const mtnRgb: [number, number, number] = [74, 52, 30];
    const peakRgb: [number, number, number] = [188, 158, 92]; // Pyrite / ferroelectric lead-sulfide radar-bright frost!
    return {
      compositionLabel: 'Sulfur-Weathered Mafic Basalt & Pyrite-Seated Highlands',
      craterlandHex: '#694b2a',
      alluvialHex: '#7a5832',
      lowlandHex: '#846034',
      basinHex: '#75542e',
      steppeHex: '#6e4e2b',
      aridHex: '#8f6939',
      duneHex: '#9e7640',
      plateauHex: '#684a28',
      mountainHex: '#4a341e',
      peakHex: '#bc9e5c',
      tundraHex: '#785832',
      iceHex: '#cbb278',
      cryoPlainsHex: '#b59b64',
      basaltHex: '#2e2012',
      lowlandRgb: lowRgb,
      plateauRgb: platRgb,
      mountainRgb: mtnRgb,
      peakRgb: peakRgb,
      iceEjectaBoost: 0.1,
    };
  }

  // 7. Carbonaceous / Graphite-Chondrite / Low-Density Dark Silicate Worlds
  const isCarbonaceous =
    bodyClassLower.includes('carbon') ||
    bodyClassLower.includes('carbide') ||
    bodyClassLower.includes('chondrit') ||
    (iceFrac < 0.08 && densityGcm3 < 3.62);

  if (isCarbonaceous) {
    const lowRgb: [number, number, number] = [84, 76, 70];
    const platRgb: [number, number, number] = [66, 60, 55];
    const mtnRgb: [number, number, number] = [50, 45, 42];
    const peakRgb: [number, number, number] = [138, 128, 120];
    return {
      compositionLabel: 'Carbonaceous Chondrite & Graphite-Silicate Regolith',
      craterlandHex: '#47403b',
      alluvialHex: '#524a44',
      lowlandHex: '#544c46',
      basinHex: '#4d4540',
      steppeHex: '#59504a',
      aridHex: '#635952',
      duneHex: '#6e635b',
      plateauHex: '#423c37',
      mountainHex: '#322d2a',
      peakHex: '#8a8078',
      tundraHex: '#5e5752',
      iceHex: '#cbd5e1',
      cryoPlainsHex: '#94908b',
      basaltHex: '#211d1b',
      lowlandRgb: lowRgb,
      plateauRgb: platRgb,
      mountainRgb: mtnRgb,
      peakRgb: peakRgb,
      iceEjectaBoost: 0.2,
    };
  }

  // 8. Airless Lunar Anorthosite-Basalt Regolith (Vacuum Silicate Moons & Planets with moderate density)
  if (pBar < 0.005 && !isMoltenWorld) {
    // Modulate between lighter Lunar anorthosite (lower density ~3.3-3.9) and darker basaltic-iron regolith (~4.0-5.1)
    const feTint = Math.max(0, Math.min(1, (densityGcm3 - 3.3) / 1.8));
    const lowRgb = lerpRgbTuple([134, 132, 128], [102, 100, 98], feTint);
    const platRgb = lerpRgbTuple([112, 110, 106], [84, 82, 80], feTint);
    const mtnRgb = lerpRgbTuple([92, 90, 88], [68, 67, 66], feTint);
    const peakRgb = lerpRgbTuple([182, 180, 176], [154, 152, 148], feTint);
    return {
      compositionLabel: 'Anorthosite Highland & Flood-Basalt Mare Regolith',
      craterlandHex: rgbToHex(lerpRgbTuple([118, 116, 112], [88, 87, 85], feTint)),
      alluvialHex: rgbToHex(lerpRgbTuple([96, 95, 92], [74, 73, 72], feTint)),
      lowlandHex: rgbToHex(lowRgb),
      basinHex: rgbToHex(lerpRgbTuple([88, 87, 85], [68, 67, 66], feTint)), // Dark flood-basalt mare
      steppeHex: rgbToHex(lerpRgbTuple([124, 122, 118], [94, 92, 90], feTint)),
      aridHex: rgbToHex(lerpRgbTuple([138, 136, 130], [106, 104, 100], feTint)),
      duneHex: rgbToHex(lerpRgbTuple([148, 146, 140], [116, 114, 110], feTint)),
      plateauHex: rgbToHex(platRgb),
      mountainHex: rgbToHex(mtnRgb),
      peakHex: rgbToHex(peakRgb),
      tundraHex: '#787672',
      iceHex: '#dce6f2',
      cryoPlainsHex: '#b8c0c8',
      basaltHex: '#2b2a29',
      lowlandRgb: lowRgb,
      plateauRgb: platRgb,
      mountainRgb: mtnRgb,
      peakRgb: peakRgb,
      iceEjectaBoost: 0.35,
    };
  }

  // 9. Standard Terrestrial Silicate Crust (Continuously modulated by bulk density / Fe-Mg mafic fraction & iceFrac)
  // Higher density (e.g. 5.0-5.2 g/cm3) -> more iron-magnesium mafic/basaltic olive-brown
  // Moderate density (e.g. 3.8-4.5 g/cm3) -> more felsic/granitic/sandstone warm ochre-tan
  const maficFactor = Math.max(0, Math.min(1, (densityGcm3 - 4.0) / 1.4));
  const lowRgb = lerpRgbTuple([152, 124, 90], [126, 104, 82], maficFactor);
  const platRgb = lerpRgbTuple([142, 92, 54], [114, 78, 52], maficFactor);
  const mtnRgb = lerpRgbTuple([104, 92, 88], [82, 76, 74], maficFactor);
  const peakRgb: [number, number, number] = [237, 242, 247];

  return {
    compositionLabel:
      maficFactor > 0.65
        ? `Fe-Mg Mafic Basalt & Silicate Crust (${densityGcm3.toFixed(2)} g/cm³)`
        : `Felsic-Granitic & Silicate Continental Crust (${densityGcm3.toFixed(2)} g/cm³)`,
    craterlandHex: rgbToHex(lerpRgbTuple([104, 98, 92], [86, 84, 82], maficFactor)),
    alluvialHex: rgbToHex(lerpRgbTuple([118, 98, 76], [98, 84, 68], maficFactor)),
    lowlandHex: rgbToHex(lowRgb),
    basinHex: rgbToHex(lerpRgbTuple([132, 106, 78], [108, 90, 70], maficFactor)),
    steppeHex: rgbToHex(lerpRgbTuple([120, 98, 78], [98, 82, 68], maficFactor)),
    aridHex: rgbToHex(lerpRgbTuple([164, 128, 72], [142, 112, 66], maficFactor)),
    duneHex: rgbToHex(lerpRgbTuple([202, 158, 82], [176, 138, 76], maficFactor)),
    plateauHex: rgbToHex(platRgb),
    mountainHex: rgbToHex(mtnRgb),
    peakHex: '#edf2f7',
    tundraHex: '#706b63',
    iceHex: '#dce8f5',
    cryoPlainsHex: '#c8d3e0',
    basaltHex: '#261914',
    lowlandRgb: lowRgb,
    plateauRgb: platRgb,
    mountainRgb: mtnRgb,
    peakRgb: peakRgb,
    iceEjectaBoost: iceFrac > 0.05 ? 0.35 : 0.15,
  };
}

/**
 * Determines vegetation/flora pigment colors based on biosphere status, solvent, and host star Teff.
 * Green is ONLY used on worlds with water-based life orbiting F and G type stars (5100 K <= Teff <= 6800 K).
 * Sterile worlds inherit their lowland/basin colors directly from the planetary CrustCompositionPalette!
 */
export function getFloraPigmentPalette(
  hasBiosphere: boolean,
  solventKey: string,
  starTeff: number,
  compositionPalette?: CrustCompositionPalette
): FloraPigmentPalette {
  const isWaterSolvent = solventKey === 'H2O' || solventKey === 'H2O + CO2';

  if (!hasBiosphere) {
    return {
      hasWaterLife: false,
      hasAnyLife: false,
      pigmentName: `None (${compositionPalette?.compositionLabel || 'Sterile Regolith'})`,
      plainsHex: compositionPalette?.lowlandHex || '#8c7355',
      woodlandHex: compositionPalette?.basinHex || '#786248',
      taigaHex: compositionPalette?.steppeHex || '#6c5a49',
      marshHex: compositionPalette?.alluvialHex || '#5e5044',
      lowRgb: compositionPalette?.lowlandRgb || [140, 115, 85],
      highRgb: compositionPalette?.plateauRgb || [120, 98, 72],
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
      freezingPointK: 90.7,
      iceBiomeName: 'Frozen Hydrocarbon Ice (CH4-C2H6)',
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
      freezingPointK: 176.0,
      iceBiomeName: 'Frozen Ammonia-Water Ice (NH3-H2O)',
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
      freezingPointK: 263.0,
      iceBiomeName: 'Frozen Sulfate Hydrate Ice (H2SO4)',
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
      freezingPointK: 197.7,
      iceBiomeName: 'Frozen Sulfur Dioxide Ice (SO2)',
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
      freezingPointK: 216.6,
      iceBiomeName: 'Dry Ice (Frozen CO2)',
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
      freezingPointK: 270.0,
      iceBiomeName: 'Clathrate Glacial Ice (H2O + CO2)',
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
      freezingPointK: 800.0,
      iceBiomeName: 'Solidified Basalt Rock Crust',
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
      freezingPointK: 0,
      iceBiomeName: 'Supercritical Fluid',
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
    freezingPointK: 273.15,
    iceBiomeName: 'Glacial Water Ice (H2O)',
    trenchRgb: [4, 18, 48],
    deepRgb: [10, 48, 108],
    shallowRgb: [24, 128, 198],
    horizonTopHex: '#0ea5e9',
    horizonBotHex: '#0369a1',
  };
}

/**
 * Computes the local pressure-dependent boiling point T_boil(P_local) in Kelvin
 * via the Clausius-Clapeyron relation for the active solvent.
 */
export function computeLocalBoilingPointK(
  seaPalette: SolventSeaPalette,
  localPressureBar: number
): number {
  const P = Math.max(0.0001, localPressureBar);
  const key = seaPalette.solventKey;

  if (key === 'Supercritical H2O') return 10000;
  if (key === 'Silicate Magma') {
    return Math.min(4200, 2800 / Math.max(0.35, 1 - Math.log(P / 1.01325) / 16.0));
  }
  if (key === 'CO2') {
    // Liquid CO2 requires P >= 5.18 bar (triple point 216.6 K); critical point is 304.1 K at 73.8 bar
    if (P < 5.0) return 216.6;
    return Math.min(304.1, 216.6 / Math.max(0.5, 1 - Math.log(P / 5.18) / 9.2));
  }
  if (key === 'CH4-C2H6') {
    if (P < 0.012) return 90.7;
    return Math.min(240.0, 122.0 / Math.max(0.45, 1 - Math.log(P / 1.01325) / 9.8));
  }
  if (key === 'NH3-H2O') {
    if (P < 0.06) return 176.0;
    return Math.min(405.5, 245.0 / Math.max(0.45, 1 - Math.log(P / 1.01325) / 11.2));
  }
  if (key === 'SO2') {
    if (P < 0.016) return 197.7;
    return Math.min(430.8, 263.15 / Math.max(0.45, 1 - Math.log(P / 1.01325) / 10.5));
  }
  if (key === 'H2SO4') {
    return Math.min(925.0, 610.0 / Math.max(0.45, 1 - Math.log(Math.max(0.01, P) / 1.01325) / 14.5));
  }
  // Default H2O & H2O + CO2: 373.15 K at 1.01325 bar, triple point at 0.0061 bar, critical point at 647.1 K
  if (P < 0.0061) return 273.15;
  return Math.min(647.1, 373.15 / Math.max(0.45, 1 - Math.log(P / 1.01325) / 13.1));
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
 * for airless and thin-atmosphere worlds. Smaller/lower-gravity worlds have higher
 * craterProminence (more numerous, deeper, and larger angular-scale craters relative to body radius),
 * while larger/higher-gravity worlds have smaller angular craters flattened by gravity and resurfacing.
 */
function generateSphericalCraters(
  seed: number,
  pressureBar: number | null | undefined,
  isNoSurface: boolean,
  craterProminence = 1.0
): SphericalCrater[] {
  if (isNoSurface) return [];
  const pBar = pressureBar ?? 0;
  // Airless (< 0.01 bar) gets heavy cratering; thin atmosphere (< 0.6 bar) gets moderate cratering
  if (pBar >= 0.6) return [];

  const craterPrng = createPrng(seed ^ 0x9e3779b9);
  const retentionFactor = pBar < 0.01 ? 1.0 : Math.max(0.25, 1.0 - (pBar / 0.6) * 0.72);
  const count = Math.round((52 + 108 * craterProminence) * retentionFactor);
  // Scale angular size so small worlds (craterProminence ~ 2.0) have the old mid-size scale (~0.52),
  // mid-sized worlds (craterProminence ~ 1.0) are ~0.30, and large worlds (craterProminence ~ 0.45) are ~0.16!
  const angularScale = Math.max(0.14, Math.min(0.56, 0.06 + 0.24 * craterProminence));
  const depthScale = Math.pow(craterProminence, 0.88);
  const craters: SphericalCrater[] = [];

  for (let i = 0; i < count; i++) {
    // Uniform random point on unit sphere
    const u = craterPrng() * 2 - 1; // cos(phi) in [-1, 1]
    const theta = craterPrng() * 2 * Math.PI;
    const rxy = Math.sqrt(Math.max(0, 1 - u * u));
    const cx = rxy * Math.cos(theta);
    const cy = u;
    const cz = rxy * Math.sin(theta);

    // Steep power-law size distribution: many small craters, very few larger basins
    const sizeRoll = Math.pow(craterPrng(), 2.65);
    // Base radii shrunk substantially:
    // - Small worlds (angularScale ~ 0.52): minRad ~ 0.016 rad (~0.9°), maxRad ~ 0.109 rad (~6.2°)
    // - Mid-sized worlds (angularScale ~ 0.30): minRad ~ 0.012 rad (~0.7°), maxRad ~ 0.063 rad (~3.6°)
    // - Large worlds (angularScale ~ 0.16): minRad ~ 0.009 rad (~0.5°), maxRad ~ 0.034 rad (~1.9°)
    const minRad = (pBar < 0.01 ? 0.007 : 0.010) + 0.017 * angularScale;
    const maxRad = 0.21 * angularScale;
    const radiusRad = minRad + sizeRoll * (maxRad - minRad);
    const maxEffectRad = radiusRad * 1.28;
    const cosMaxRadius = Math.cos(maxEffectRad);

    // Depth scales with crater size, atmospheric erosion, and inverse body size/gravity (craterProminence)
    const erosionScale = pBar < 0.01 ? 1.0 : 0.78;
    const depth = (0.068 + sizeRoll * 0.15) * erosionScale * depthScale;
    const hasCentralPeak = radiusRad > 0.042;

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

  const hasSO2 = (gases.SO2 || 0) > 0.03;
  const hasCO2 = (gases.CO2 || 0) > 0.45;
  const hasH2O = (gases.H2O || 0) > 0.002;
  const hasN2O2 = (gases.N2 || 0) + (gases.O2 || 0) > 0.35;

  if (isMoltenWorld) {
    return {
      opacity: Math.min(0.68, opacity),
      palette: {
        classLabel: 'Volcanic Silicate & Ash Haze (Grey)',
        atmoRgb: [122, 130, 142],
        bandLightRgb: [198, 204, 214],
        bandDarkRgb: [96, 104, 116],
        cloudRgb: [182, 188, 198],
      },
    };
  }
  if ((hasCO2 && pBar >= 2.5) || hasSO2) {
    // Dense CO2 or sulfurous overcast: cool silver-grey / slate-grey cloud deck & atmosphere
    return {
      opacity: Math.max(0.78, opacity),
      palette: {
        classLabel: hasSO2 ? 'Dense Sulfurous Aerosol Overcast (Grey)' : 'Dense CO2 & Aerosol Overcast (Grey)',
        atmoRgb: [154, 164, 178],
        bandLightRgb: [228, 234, 242],
        bandDarkRgb: [136, 146, 160],
        cloudRgb: [222, 228, 236],
      },
    };
  }
  if (pBar < 0.15 || (hasCO2 && !hasH2O && !hasN2O2)) {
    // Thin or dry CO2-dominated atmosphere: pale blue-grey / slate-grey Rayleigh & ice/dust wisps
    return {
      opacity,
      palette: {
        classLabel: pBar < 0.15 ? 'Thin Blue-Grey Rayleigh & Ice Wisps' : 'Cool Grey-Blue CO2 Rayleigh Atmosphere',
        atmoRgb: [126, 148, 178],
        bandLightRgb: [232, 238, 246],
        bandDarkRgb: [154, 168, 186],
        cloudRgb: [224, 232, 242],
      },
    };
  }

  // Standard N2 / O2 / H2O / H2 Rayleigh-scattering Blue Atmosphere with White-Grey Clouds
  return {
    opacity,
    palette: {
      classLabel: 'Rayleigh Blue Atmosphere & Water/Ice Clouds',
      atmoRgb: [52, 132, 226],
      bandLightRgb: [246, 250, 255],
      bandDarkRgb: [176, 190, 208],
      cloudRgb: [240, 245, 252],
    },
  };
}

/**
 * Derives realistic sky color and horizon scattering based on atmospheric pressure,
 * dominant gases, and star spectral type (predominantly Rayleigh blue or overcast cool grey).
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
    return { zenith: '#2a4463', horizon: '#94aec8', hazeFactor: 0.9 };
  }
  if (pressureBar === null || pressureBar <= 0.001) {
    // Airless / Vacuum: pitch black starry sky with brilliant starlight
    return { zenith: '#020308', horizon: '#080d1a', hazeFactor: 0.02 };
  }
  if (isMoltenWorld) {
    // Smoky slate-grey volcanic ash sky
    return { zenith: '#262c36', horizon: '#788496', hazeFactor: 0.72 };
  }

  const p = Math.min(20, pressureBar);
  const hasCO2 = (gases.CO2 || 0) > 0.45;
  const hasSO2 = (gases.SO2 || 0) > 0.03;

  if (hasSO2 || (hasCO2 && p >= 2.5)) {
    // Dense overcast cool slate-grey sky
    return { zenith: '#4b5868', horizon: '#b8c4d4', hazeFactor: 0.92 };
  }
  if (p < 0.15 || (hasCO2 && (gases.N2 || 0) + (gases.O2 || 0) < 0.25)) {
    // Thin or dry CO2 pale blue-grey sky
    return { zenith: '#2d425e', horizon: '#9cb0c9', hazeFactor: 0.45 };
  }

  // Rayleigh-scattering blue sky (modulated subtly by star temperature and density)
  const coolBlueShift = starTeff > 7000 ? 14 : starTeff < 3900 ? -10 : 0;
  const density = Math.min(1.0, p / 1.2);
  const r = Math.max(12, Math.round(22 + 32 * density - coolBlueShift * 0.5));
  const g = Math.max(38, Math.round(58 + 82 * density));
  const b = Math.min(255, Math.round(135 + 110 * density + coolBlueShift));
  const hr = Math.round(138 + 68 * density);
  const hg = Math.round(176 + 52 * density);
  const hb = Math.round(216 + 34 * density);

  return {
    zenith: `rgb(${r}, ${g}, ${b})`,
    horizon: `rgb(${hr}, ${hg}, ${hb})`,
    hazeFactor: Math.min(1.0, 0.22 + p * 0.35),
  };
}

export type SurfaceMapLayerType =
  | 'satellite'
  | 'clouds'
  | 'biomes'
  | 'topography'
  | 'temperature'
  | 'moisture'
  | 'plates';

const surfaceModelCache = new Map<string, PlanetarySurfaceModel>();

/**
 * Builds (or retrieves from cache) the complete planetary surface model including topography,
 * biomes, climate grid, volcanoes, cloud/atmosphere layer, and sky horizon parameters.
 */
export function generatePlanetarySurfaceModel(
  planet: RealisticPlanetBody,
  moon?: RealisticMoon | null,
  zone?: RealisticPlanetaryZone | null,
  stars?: RealisticStarNode[] | null
): PlanetarySurfaceModel {
  const isMoon = Boolean(moon);
  const activeBody = moon || planet;
  const star = stars?.[0] || { Teff: 5778, colorHex: '#fff4e6', radius: 1.0, lumNum: 1.0 };
  const cacheKey = isMoon
    ? `moon_${moon?.id || moon?.name}_${moon?.moonClass}_${moon?.radiusKm}_${moon?.gravityG}_${moon?.rockFrac}_${moon?.iceFrac}_${moon?.densityGcm3}_${moon?.surfaceTempK}_${moon?.pressureBar}_${moon?.hydrosphere?.coveragePct}_${star.Teff}`
    : `planet_${planet.a}_${planet.massEarth}_${planet.radiusEarth}_${planet.gravityG}_${planet.planetClass}_${planet.rockFrac}_${planet.iceFrac}_${planet.densityGcm3}_${planet.surfaceTempK}_${planet.pressureBar}_${planet.hydrosphere?.coveragePct}_${star.Teff}`;

  const cached = surfaceModelCache.get(cacheKey);
  if (cached) return cached;

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
      !hasLiquid &&
      Tbase < 273.15 &&
      hydro &&
      (((hydro.iceKm ?? 0) > 0 && (hydro.liqKm ?? 0) > 0) ||
        hydro.state?.toLowerCase().includes('subsurface'))
  );

  // Determine whether this world is an ice-dominated world / cryosphere
  const isWarmGlobalOcean =
    Tbase >= 273.15 &&
    hasLiquid &&
    coverageFrac >= 0.85 &&
    !bodyClassLower.includes('icy') &&
    !bodyClassLower.includes('frozen');
  const isIcyWorld =
    !isNoSurface &&
    !isMoltenWorld &&
    !isWarmGlobalOcean &&
    !bodyClassLower.includes('venusian') &&
    ((Tbase < 273.15 &&
      ((activeBody.iceFrac ?? 0) >= 0.15 ||
        hasSubsurfaceOcean ||
        (hydro?.iceKm ?? 0) > 0.5 ||
        bodyClassLower.includes('ice') ||
        bodyClassLower.includes('icy') ||
        bodyClassLower.includes('frozen') ||
        bodyClassLower.includes('cryo') ||
        bodyClassLower.includes('glacial') ||
        (Tbase < 225 && (activeBody.rockFrac ?? 1) < 0.85))) ||
      bodyClassLower.includes('icy') ||
      bodyClassLower.includes('frozen') ||
      ((activeBody.iceFrac ?? 0) >= 0.15 && Tbase < 290 && !hasLiquid));

  // Host star telemetry
  const starTeff = star.Teff || 5778;
  const starDistAU = Math.max(0.02, planet.a);
  const starRadiusAU = (star.radius || 1.0) * 0.00465047;
  const starAngularDiameterDeg = +(2 * Math.atan(starRadiusAU / (2 * starDistAU)) * (180 / Math.PI)).toFixed(2);

  // Deterministic seed
  const bodyKey = isMoon
    ? `${moon?.id || moon?.name || 'moon'}_${moon?.radiusKm}_${moon?.surfaceTempK}`
    : `${planet.planetClass}_${planet.a}_${planet.radiusEarth}_${planet.massEarth}_${planet.surfaceTempK}`;
  let seed = 1337;
  for (let i = 0; i < bodyKey.length; i++) {
    seed = (seed * 31 + bodyKey.charCodeAt(i)) >>> 0;
  }
  const prng = createPrng(seed);
  const colorPrng = createPrng(seed ^ 0x6c8e9cf5);

  // Solvent-specific sea color palette (force Silicate Magma palette on molten worlds) with slight per-world randomization
  const rawSeaPalette = getSolventSeaPalette(isMoltenWorld ? 'Silicate Magma' : hydro?.solvent);
  const seaHue = (colorPrng() - 0.5) * 11;
  const seaSat = 0.93 + colorPrng() * 0.14;
  const seaLit = 0.94 + colorPrng() * 0.12;
  const seaWarmth = (colorPrng() - 0.5) * 6;
  const seaPalette: SolventSeaPalette = {
    ...rawSeaPalette,
    trenchRgb: perturbRgbSlightly(rawSeaPalette.trenchRgb, seaHue, seaSat, seaLit, seaWarmth * 0.6),
    deepRgb: perturbRgbSlightly(rawSeaPalette.deepRgb, seaHue, seaSat, seaLit, seaWarmth),
    shallowRgb: perturbRgbSlightly(rawSeaPalette.shallowRgb, seaHue + (colorPrng() - 0.5) * 4, seaSat, seaLit, seaWarmth),
    horizonTopHex: perturbHexSlightly(rawSeaPalette.horizonTopHex, seaHue, seaSat, seaLit, seaWarmth),
    horizonBotHex: perturbHexSlightly(rawSeaPalette.horizonBotHex, seaHue, seaSat, seaLit, seaWarmth * 0.7),
  };

  // Biosphere & planetary composition palette
  const hasBiosphere = Boolean(!isNoSurface && hydro?.biosphere);
  const tidalW = (activeBody as { tidalW?: number }).tidalW ?? 0;

  const rawCompositionPalette = deriveCrustCompositionPalette({
    rockFrac: activeBody.rockFrac ?? 1.0,
    iceFrac: activeBody.iceFrac ?? 0.0,
    densityGcm3: activeBody.densityGcm3 ?? 5.0,
    albedo: activeBody.albedo ?? 0.25,
    tidalW,
    pressureBar: activeBody.pressureBar,
    gases: activeBody.gases || {},
    solventKey: seaPalette.solventKey,
    coverageFrac,
    Tbase,
    bodyClassLower,
    isIcyWorld,
    isMoltenWorld,
    hasBiosphere,
  });

  // Slightly randomize solid crust colors per world + subtle micro-variation per biome
  const crustHue = (colorPrng() - 0.5) * 13;
  const crustSat = 0.92 + colorPrng() * 0.16;
  const crustLit = 0.94 + colorPrng() * 0.12;
  const crustWarm = (colorPrng() - 0.5) * 8;
  const pHex = (hex: string, mult = 1.0) =>
    perturbHexSlightly(
      hex,
      (crustHue + (colorPrng() - 0.5) * 4) * mult,
      1 + (crustSat - 1) * mult,
      (crustLit + (colorPrng() - 0.5) * 0.04) * mult + (1 - mult),
      crustWarm * mult
    );
  const pRgb = (rgb: [number, number, number], mult = 1.0) =>
    perturbRgbSlightly(
      rgb,
      (crustHue + (colorPrng() - 0.5) * 4) * mult,
      1 + (crustSat - 1) * mult,
      (crustLit + (colorPrng() - 0.5) * 0.04) * mult + (1 - mult),
      crustWarm * mult
    );

  const compositionPalette: CrustCompositionPalette = {
    ...rawCompositionPalette,
    craterlandHex: pHex(rawCompositionPalette.craterlandHex),
    alluvialHex: pHex(rawCompositionPalette.alluvialHex),
    lowlandHex: pHex(rawCompositionPalette.lowlandHex),
    basinHex: pHex(rawCompositionPalette.basinHex),
    steppeHex: pHex(rawCompositionPalette.steppeHex),
    aridHex: pHex(rawCompositionPalette.aridHex),
    duneHex: pHex(rawCompositionPalette.duneHex),
    plateauHex: pHex(rawCompositionPalette.plateauHex),
    mountainHex: pHex(rawCompositionPalette.mountainHex),
    peakHex: pHex(rawCompositionPalette.peakHex, 0.45),
    tundraHex: pHex(rawCompositionPalette.tundraHex),
    iceHex: pHex(rawCompositionPalette.iceHex, 0.45),
    cryoPlainsHex: pHex(rawCompositionPalette.cryoPlainsHex, 0.5),
    basaltHex: pHex(rawCompositionPalette.basaltHex, 0.8),
    lowlandRgb: pRgb(rawCompositionPalette.lowlandRgb),
    plateauRgb: pRgb(rawCompositionPalette.plateauRgb),
    mountainRgb: pRgb(rawCompositionPalette.mountainRgb),
    peakRgb: pRgb(rawCompositionPalette.peakRgb, 0.45),
  };

  // Biosphere & star-specific flora pigments (Green ONLY on water-life worlds around F & G stars; sterile worlds use compositionPalette)
  const rawFloraPalette = getFloraPigmentPalette(hasBiosphere, seaPalette.solventKey, starTeff, compositionPalette);
  const floraHue = (colorPrng() - 0.5) * 12;
  const floraSat = 0.92 + colorPrng() * 0.16;
  const floraLit = 0.94 + colorPrng() * 0.12;
  const floraPalette: FloraPigmentPalette = rawFloraPalette.hasAnyLife
    ? {
        ...rawFloraPalette,
        plainsHex: perturbHexSlightly(rawFloraPalette.plainsHex, floraHue, floraSat, floraLit),
        woodlandHex: perturbHexSlightly(rawFloraPalette.woodlandHex, floraHue + (colorPrng() - 0.5) * 4, floraSat, floraLit),
        taigaHex: perturbHexSlightly(rawFloraPalette.taigaHex, floraHue + (colorPrng() - 0.5) * 4, floraSat, floraLit),
        marshHex: perturbHexSlightly(rawFloraPalette.marshHex, floraHue + (colorPrng() - 0.5) * 4, floraSat, floraLit),
        lowRgb: perturbRgbSlightly(rawFloraPalette.lowRgb, floraHue, floraSat, floraLit),
        highRgb: perturbRgbSlightly(rawFloraPalette.highRgb, floraHue, floraSat, floraLit),
      }
    : rawFloraPalette;
  const hasWaterLife = floraPalette.hasWaterLife;

  // Plate tectonics & active geology parameters
  const platesCount = isNoSurface
    ? 0
    : activeBody.rockFrac > 0.4 && activeBody.gravityG > 0.38
    ? 7 + Math.floor(prng() * 6)
    : 0;

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

  // Maximum elevation depends inversely on gravity (scaled 2.5x up for telemetry numbers while preserving thermalRefElevKm for visual presentation)
  const gClamped = Math.max(0.05, activeBody.gravityG);
  const thermalRefElevKm = isNoSurface
    ? 0
    : +(Math.min(28, 7.5 / Math.sqrt(gClamped)) * (0.8 + prng() * 0.4)).toFixed(1);
  const maxElevKm = isNoSurface ? 0 : +(thermalRefElevKm * 2.5).toFixed(1);
  const minElevKm = isNoSurface ? 0 : +(-maxElevKm * 0.75).toFixed(1);

  // Hypsometry resolution: 360 lon x 180 lat
  const width = 360;
  const height = 180;
  const hypsometry = new Float32Array(width * height);
  const temperatureGrid = new Float32Array(width * height);
  const moistureGrid = new Float32Array(width * height);
  const biomeGrid = new Uint8Array(width * height);
  const blendedLandRgb = new Uint8Array(width * height * 3);
  const craterGrid = new Float32Array(width * height);
  const fractureGrid = new Float32Array(width * height);
  const volcanoGrid = new Float32Array(width * height);
  const cloudGrid = new Float32Array(width * height);
  const tectonicPlateGrid = new Uint8Array(width * height);

  // Compute craterProminence inversely from body radius and surface gravity:
  // Smaller airless worlds (e.g. small/medium moons, Mercury/Moon-sized bodies) have much more noticeable craters;
  // larger/higher-gravity worlds have smaller angular craters flattened by isostatic relaxation & resurfacing.
  const bodyRadiusKm = isMoon ? (moon?.radiusKm || 1500) : (planet.radiusEarth || 1.0) * 6371;
  const bodyGravityG = Math.max(0.01, activeBody.gravityG || 0.2);
  const radiusScale = Math.pow(2800 / Math.max(300, Math.min(10000, bodyRadiusKm)), 0.56);
  const gravScale = Math.pow(0.35 / Math.max(0.015, Math.min(2.2, bodyGravityG)), 0.28);
  const craterProminence = Math.max(0.38, Math.min(2.35, radiusScale * 0.65 + gravScale * 0.35));

  // Pre-generate 3D spherical impact craters for airless and thin-atmosphere worlds
  const craters = generateSphericalCraters(
    seed,
    hasSubsurfaceOcean || isMoltenWorld ? 0.42 : activeBody.pressureBar,
    isNoSurface,
    craterProminence
  );

  // Pre-generate 3D spherical cracks (cryotectonic ice lineae on icy worlds, or glowing magma fissures on molten worlds)
  const surfaceCracks = generateSphericalSurfaceCracks(
    seed,
    isIcyWorld || isMoltenWorld,
    hasSubsurfaceOcean || isMoltenWorld
  );

  // Pre-generate discrete 3D volcanoes for worlds with active geology (Earth, Venus, Io, etc.)
  const volcanoes = generateSphericalVolcanoes(seed, hasActiveGeology, isExtremeVolcanic);

  // Derive cloud/atmosphere palette & opacity proportional to atmospheric density, with slight per-world randomization
  const sudarskyClass = !isMoon ? planet.sudarskyClass : null;
  const { palette: rawAtmoPalette, opacity: cloudOpacity } = deriveAtmosphereAndCloudPalette(
    activeBody.pressureBar,
    activeBody.gases || {},
    isGasGiant,
    isIceGiant,
    isSupercritical,
    isMoltenWorld,
    sudarskyClass,
    Tbase
  );
  const atmoMult = isNoSurface ? 1.0 : 0.4;
  const ggHue = (colorPrng() - 0.5) * 15 * atmoMult;
  const ggSat = 1.0 + (colorPrng() - 0.5) * 0.18 * atmoMult;
  const ggLit = 1.0 + (colorPrng() - 0.5) * 0.12 * atmoMult;
  const ggWarm = (colorPrng() - 0.5) * 10 * atmoMult;
  const atmospherePalette: AtmosphereCloudPalette = {
    ...rawAtmoPalette,
    atmoRgb: perturbRgbSlightly(rawAtmoPalette.atmoRgb, ggHue, ggSat, ggLit, ggWarm),
    bandLightRgb: perturbRgbSlightly(
      rawAtmoPalette.bandLightRgb,
      ggHue + (colorPrng() - 0.5) * 6 * atmoMult,
      ggSat,
      ggLit + (colorPrng() - 0.5) * 0.05 * atmoMult,
      ggWarm * 0.8
    ),
    bandDarkRgb: perturbRgbSlightly(
      rawAtmoPalette.bandDarkRgb,
      ggHue + (colorPrng() - 0.5) * 6 * atmoMult,
      ggSat * (0.96 + colorPrng() * 0.08),
      ggLit + (colorPrng() - 0.5) * 0.06 * atmoMult,
      ggWarm
    ),
    cloudRgb: perturbRgbSlightly(rawAtmoPalette.cloudRgb, ggHue * 0.6, ggSat, ggLit, ggWarm * 0.5),
  };

  // Slightly randomized zonal band parameters & storm vortex coordinates for Gas Giants / Ice Giants
  const ggBandFreqScale = 0.88 + colorPrng() * 0.24;
  const ggBandPhase = colorPrng() * Math.PI * 2;
  const ggVortexLat = (colorPrng() < 0.5 ? -1 : 1) * (14 + colorPrng() * 20);
  const ggVortexLon = (colorPrng() - 0.5) * 280;

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
        const bandFreq = (isSupercritical ? 9 : isIceGiant ? 8 : 14) * ggBandFreqScale;
        const swirl = sphericalFbm(lat * 1.4, lon * 0.9, seed + 701, 4);
        const jetWave = Math.sin(latRad * bandFreq + ggBandPhase + (swirl - 0.5) * 3.6) * 0.5 + 0.5;
        const fineBands = Math.cos(latRad * bandFreq * 2.1 - ggBandPhase * 0.6 - swirl * 2.4) * 0.22;
        const vortex = Math.max(
          0,
          1.0 - Math.hypot((lat - ggVortexLat) * 0.08, ((lon - ggVortexLon + 540) % 360 - 180) * 0.045)
        );
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
      if (craters.length > 0) {
        // On smaller airless worlds, dampen background tectonic ridge noise so circular impact craters dominate the relief
        const topoSmoothing = Math.max(0.48, Math.min(1.0, 1.02 / Math.pow(craterProminence, 0.48)));
        elev = 0.5 + (elev - 0.5) * topoSmoothing;
      }

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
                delta += c.depth * 0.58 * peakNorm * peakNorm;
                craterIntensity = Math.max(craterIntensity, peakNorm * 0.95 * Math.pow(craterProminence, 0.55));
              } else {
                craterIntensity = Math.max(
                  craterIntensity,
                  (0.35 + bowlNorm * 0.45) * (c.depth / 0.14) * Math.pow(craterProminence, 0.5)
                );
              }
              craterDelta += delta;
            } else if (u < 1.28) {
              // Raised circular crater rim & compact outer ejecta ramp
              let rimFactor = 0;
              if (u <= 1.0) {
                rimFactor = (u - 0.85) / 0.15; // steeply rises to rim crest at u = 1.0
              } else {
                const ejectaNorm = 1.0 - (u - 1.0) / 0.28;
                rimFactor = ejectaNorm * ejectaNorm;
              }
              craterDelta += c.depth * 0.52 * rimFactor;
              craterIntensity = Math.max(craterIntensity, rimFactor * 1.15 * Math.pow(craterProminence, 0.6));
            }
          }
        }

        elev += craterDelta;
        craterGrid[idx] = Math.min(1.8, craterIntensity);
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

  const isWaterIceDominated =
    isIcyWorld &&
    seaPalette.solventKey !== 'CH4-C2H6' &&
    seaPalette.solventKey !== 'NH3-H2O' &&
    seaPalette.solventKey !== 'SO2' &&
    seaPalette.solventKey !== 'CO2';

  // Determine exact sea-level threshold to match coveragePct (for non-ice-dominated marine worlds)
  let seaLevelNormalized = 0.42;
  if (isWaterIceDominated) {
    seaLevelNormalized = 0.38;
  } else if (!isNoSurface && hasLiquid && allElevations.length > 0) {
    allElevations.sort((a, b) => a - b);
    const splitIndex = Math.min(allElevations.length - 1, Math.floor(allElevations.length * coverageFrac));
    seaLevelNormalized = allElevations[splitIndex];
  }

  // Tidal locking to the star only applies to planets (!isMoon); moons are tidally locked to their host planet and rotate relative to the star!
  const isTidallyLocked =
    !isMoon && (planet.spinState?.toLowerCase().includes('locked') || planet.spinState?.includes('1:1'));

  // Compute thermal and biome grid
  const pBarAtmo = activeBody.pressureBar ?? 0;
  const baseScaleHeightKm = Math.max(2, (8.314 * Tbase) / (0.029 * Math.max(0.05, activeBody.gravityG) * 9.81 * 1000));
  // Atmospheric heat redistribution strongly suppresses surface temperature extremes:
  // - At P = 0 bar (vacuum), thermalDiffFactor = 0.72 (severe equator-to-pole / day-to-night extremes)
  // - At P = 1 bar (Earth, Tbase = 288 K), thermalDiffFactor = 0.31 -> yearly local averages span ~220 K to ~320 K
  // - At P >= 10-90 bar (thick greenhouse / Venusian), thermalDiffFactor -> 0.08..0.016 (nearly isothermal horizontally)
  const thermalDiffFactor = 0.72 / (1.0 + 1.32 * Math.pow(Math.max(0, pBarAtmo), 0.78));
  const waveAtmoScale = Math.max(0.12, Math.min(1.4, thermalDiffFactor / 0.31));
  const atmoLapseFactor = Math.min(1.0, Math.pow(Math.max(0, pBarAtmo) / 0.15, 0.45));
  // On water-ice-dominated worlds, ice sublimates/ablates to expose bare rock above ~250 K!
  const freezingPointK = isWaterIceDominated
    ? 250.0
    : hasLiquid
    ? seaPalette.freezingPointK
    : isIcyWorld
    ? 250.0
    : (activeBody.gases?.CO2 || 0) >= 0.25 && pBarAtmo >= 0.001 && pBarAtmo < 1.5
    ? 195.0 // Thin CO2 frost point (Mars-like polar caps)
    : pBarAtmo >= 0.01 && ((activeBody.iceFrac ?? 0) > 0.01 || (activeBody.gases?.H2O || 0) > 0.0005)
    ? 273.15
    : 0;

  const warmMeltCandidates: { idx: number; score: number; rockBiome: number }[] = [];
  let meltwaterPatchCount = 0;

  for (let y = 0; y < height; y++) {
    const lat = 90 - y;
    const absLat = Math.abs(lat);
    const latRad = (lat * Math.PI) / 180;
    const latCos = Math.cos((absLat * Math.PI) / 180);

    for (let x = 0; x < width; x++) {
      const lon = x - 180;
      const idx = y * width + x;
      const hNorm = hypsometry[idx];
      const volcVal = volcanoGrid[idx];
      // Active volcanic cones/calderas breach the surface even if surrounded by ocean
      const isBelowSeaLevel =
        !isNoSurface && !isWaterIceDominated && hasLiquid && hNorm <= seaLevelNormalized && volcVal < 0.35;

      // 3D Spherical Domain Warping for organic, contiguous climate & biome zones (no boxy latitude/sine cutoffs!)
      const warpLat = (sphericalFbm(lat * 1.15, lon * 1.15, seed + 401, 4) - 0.5) * 32.0;
      const warpLon = (sphericalFbm(lat * 1.15 + 37, lon * 1.15 - 53, seed + 419, 4) - 0.5) * 44.0;
      const effLat = Math.max(-90, Math.min(90, lat + warpLat));
      const effAbsLat = Math.abs(effLat);
      const effLatCos = Math.cos((effAbsLat * Math.PI) / 180);
      const blendedLatCos = latCos * 0.62 + effLatCos * 0.38;

      // Solar insolation & atmospheric heat transport gradient + pressure-damped climatic wave
      const climateWave =
        ((sphericalFbm(lat * 1.25, lon * 1.25, seed + 313, 4) - 0.5) * 8.0 +
          (sphericalFbm(lat * 2.6, lon * 2.6, seed + 353, 3) - 0.5) * 3.0) *
        waveAtmoScale;
      let Tlocal = Tbase;
      if (isTidallyLocked) {
        const wLatRad = ((lat + warpLat * 0.45) * Math.PI) / 180;
        const wLonRad = ((lon + warpLon * 0.45) * Math.PI) / 180;
        const cosPsi = Math.max(
          -1,
          Math.min(1, Math.cos(latRad) * Math.cos((lon * Math.PI) / 180) * 0.72 + Math.cos(wLatRad) * Math.cos(wLonRad) * 0.28)
        );
        const distFromSubstellar = Math.acos(cosPsi) / Math.PI; // 0 at substellar (0,0), 0.5 at terminator, 1.0 at antistellar
        Tlocal = Tbase * (1.0 + (0.34 - distFromSubstellar * 1.08) * thermalDiffFactor) + climateWave;
      } else {
        // Spherical mean of cos^1.15(lat) is ~0.69 -> +0.31 at equator, -0.69 at poles (yielding ~220 K to 320 K at 1 bar, 288 K)
        Tlocal = Tbase * (1.0 + (Math.pow(blendedLatCos, 1.15) - 0.69) * thermalDiffFactor) + climateWave;
      }

      // Convective altitude lapse cooling above datum (requires atmosphere for adiabatic expansion)
      let altitudeKm = 0;
      if (!isBelowSeaLevel && !isNoSurface) {
        const altitudeRatio = Math.max(-0.08, (hNorm - seaLevelNormalized) / (1 - seaLevelNormalized));
        altitudeKm = altitudeRatio * thermalRefElevKm;
        const lapse = 5.4 * activeBody.gravityG * atmoLapseFactor; // K per km
        Tlocal -= altitudeKm * lapse;
      }

      // Active volcanic caldera thermal anomaly
      if (volcVal > 1.1) {
        Tlocal = Math.max(Tlocal, 1150);
      }

      Tlocal = Math.max(15, Tlocal);
      temperatureGrid[idx] = Tlocal;

      const altRatio = isBelowSeaLevel
        ? 0
        : Math.max(0, (hNorm - seaLevelNormalized) / Math.max(0.001, 1 - seaLevelNormalized));

      // Continuous, domain-warped 3D spherical moisture field (0..1)
      const moistNoise =
        sphericalFbm(lat * 1.05 + warpLat * 0.38, lon * 1.05 + warpLon * 0.38, seed + 509, 4) * 0.74 +
        sphericalFbm(lat * 2.35, lon * 2.35, seed + 547, 3) * 0.26;
      const itczBoost = Math.exp(-Math.pow(effAbsLat / 14.5, 2)) * 0.26;
      const hadleyDip = Math.exp(-Math.pow((effAbsLat - 25.0) / 11.5, 2)) * 0.34;
      const ferrelBoost = Math.exp(-Math.pow((effAbsLat - 52.0) / 14.0, 2)) * 0.18;
      const coastalBoost = hasLiquid ? Math.max(0, (0.22 - altRatio) * 0.82) : 0;
      const continentalDry = Math.max(0, (altRatio - 0.18) * 0.45);
      const rawMoist =
        !hasLiquid && !(isWaterIceDominated && Tlocal >= 273.0 && pBarAtmo >= 0.0061)
          ? moistNoise * 0.32
          : (moistNoise - 0.5) * 1.48 + 0.52 + itczBoost - hadleyDip + ferrelBoost + coastalBoost - continentalDry;
      const localMoisture = isBelowSeaLevel ? 1.0 : Math.max(0.02, Math.min(0.98, rawMoist));
      moistureGrid[idx] = localMoisture;

      const topoVar = (moistNoise - 0.5) * 0.1;
      const localPressureBar = pBarAtmo * Math.exp(-altitudeKm / baseScaleHeightKm);
      const localBoilingPointK = computeLocalBoilingPointK(seaPalette, localPressureBar);
      const isMoltenMagmaTemp = !isNoSurface && Tlocal >= 800;
      const isBelowFreezing = freezingPointK > 0 && Tlocal <= freezingPointK;
      const isAboveBoiling =
        !isNoSurface &&
        !isMoltenWorld &&
        !isMoltenMagmaTemp &&
        (hasLiquid || pBarAtmo >= 0.005) &&
        Tlocal > localBoilingPointK;

      // Biome assignment
      if (isSupercritical) {
        biomeGrid[idx] = 19; // Supercritical Water Cloud Deck (Class II)
      } else if (isGasGiant) {
        biomeGrid[idx] = 20; // Gas Giant Cloud Deck
      } else if (volcVal > 1.1) {
        biomeGrid[idx] = 15; // Active Lava Caldera & Fissure (yellow-orange)
      } else if (isMoltenMagmaTemp) {
        // Local temperature >= 800 K -> Rock melts into liquid Silicate Magma!
        if (isBelowSeaLevel && seaPalette.solventKey === 'Silicate Magma') {
          const waterDepthRatio = (seaLevelNormalized - hNorm) / Math.max(0.001, seaLevelNormalized);
          if (waterDepthRatio > 0.6) {
            biomeGrid[idx] = 0; // Abyssal Magma Trench
          } else if (waterDepthRatio > 0.25) {
            biomeGrid[idx] = 1; // Deep Magma Ocean
          } else {
            biomeGrid[idx] = 2; // Shallow Magma Sea
          }
        } else {
          biomeGrid[idx] = 15; // Molten Silicate Magma / Lava Surface
        }
      } else if (volcVal > 0.38) {
        biomeGrid[idx] = 22; // Active Volcanic Shield & Basalt Edifice (solid rock cone at T < 800 K)
      } else if (isMoltenWorld || seaPalette.solventKey === 'Silicate Magma') {
        // Local temperature < 800 K on a magma/molten world -> Magma solidifies into solid Rock!
        if (isBelowSeaLevel) {
          biomeGrid[idx] = 14; // Solidified Basalt Crust in cooled magma sea basin
        } else if (altRatio > 0.72 + topoVar) {
          biomeGrid[idx] = 12; // Solidified Mountain Cordillera
        } else if (altRatio > 0.42 + topoVar) {
          biomeGrid[idx] = 11; // Solidified High Plateau / Badlands
        } else if (craterGrid[idx] > 0.35 && pBarAtmo < 0.3) {
          biomeGrid[idx] = 16; // Cratered Basalt Regolith
        } else {
          biomeGrid[idx] = 14; // Solidified Basalt Volcanic Rock Crust
        }
      } else if (isWaterIceDominated) {
        // Ice-dominated world rule:
        // 1) Tlocal <= ~250 K -> Ice (Glacial Ice, Cryo Plains, Alpine Ice Peaks, or Cryotectonic Ice Fissure)
        // 2) Tlocal > ~250 K -> Exposed Rock (silicate/carbonaceous regolith, plateaus, mountains, basalt)
        // 3) Tlocal > ~273 K with sufficient atmosphere (localPressureBar >= 0.0061 bar) -> Small patches of liquid water amidst the rock!
        if (Tlocal <= 250.0) {
          if (fractureGrid[idx] > 0.28) {
            biomeGrid[idx] = 21; // Cryotectonic Ice Fissure (Linea)
          } else if (Tlocal < 95 && !hasLiquid) {
            biomeGrid[idx] = 18; // Cryovolcanic Nitrogen Plains
          } else if (altRatio > 0.72 + topoVar) {
            biomeGrid[idx] = 13; // Alpine Glacial Ice Peaks
          } else if (altRatio < 0.26 + topoVar) {
            biomeGrid[idx] = 18; // Lowland Cryo-Ice Plains
          } else {
            biomeGrid[idx] = 8; // Polar / Glacial Water-Ice Sheet
          }
        } else if (isAboveBoiling) {
          biomeGrid[idx] = 10; // Hyper-Arid Rocky Desert
        } else {
          // Determine underlying rock biome for Tlocal > 250 K
          let rockBiome = 7; // De-iced Permafrost Bedrock & Scree
          if (altRatio > 0.66 + topoVar) {
            rockBiome = 12; // Rocky Mountain Cordillera (solid rock, not ice peak 13)
          } else if (altRatio > 0.38 + topoVar) {
            rockBiome = 11; // Rocky Highland Plateau / Badlands
          } else if (craterGrid[idx] > 0.28 && pBarAtmo < 0.5) {
            rockBiome = 16; // Cratered Silicate Regolith
          } else if (altRatio < 0.22 + topoVar && craterGrid[idx] < 0.22) {
            rockBiome = 14; // Exposed Basalt / Dark Silicate Basin Rock
          } else if (Tlocal >= 268) {
            rockBiome = 9; // Exposed Silicate Steppe / Regolith
          }

          // Check for small patches of liquid water where Tlocal > ~273 K and there is a sufficient atmosphere (>= 0.0061 bar triple point)
          const hasSufficientAtmosphere = pBarAtmo >= 0.0061 && localPressureBar >= 0.0061;
          if (Tlocal >= 273.0 && hasSufficientAtmosphere) {
            const pondField =
              sphericalFbm(lat * 3.2 + warpLat * 0.25, lon * 3.2 + warpLon * 0.25, seed + 677, 3) * 0.64 +
              moistNoise * 0.36;
            const basinFavor =
              Math.max(0, 0.62 - hNorm) * 0.42 + (craterGrid[idx] > 0.15 && hNorm < 0.52 ? 0.14 : 0);
            const meltFavor = Math.min(0.1, (Tlocal - 273.0) * 0.0045);
            const waterPatchScore = pondField + basinFavor + meltFavor;

            warmMeltCandidates.push({ idx, score: waterPatchScore, rockBiome });

            if (waterPatchScore > 0.67 && altRatio < 0.58) {
              biomeGrid[idx] = waterPatchScore > 0.75 ? 1 : 2; // Small patch of liquid water
              meltwaterPatchCount++;
            } else {
              biomeGrid[idx] = rockBiome;
            }
          } else {
            biomeGrid[idx] = rockBiome;
          }
        }
      } else if (isBelowFreezing) {
        // Local temperature dropped below the liquid's freezing point -> replace biome here with Ice!
        if (fractureGrid[idx] > 0.28 && (isIcyWorld || isBelowSeaLevel)) {
          biomeGrid[idx] = 21; // Cryotectonic Ice Fissure (Linea)
        } else if (isIcyWorld && Tlocal < 95 && !hasLiquid) {
          biomeGrid[idx] = 18; // Cryovolcanic Nitrogen Plains
        } else if (!isBelowSeaLevel && altRatio > 0.72 + topoVar) {
          biomeGrid[idx] = 13; // Alpine Glacial Ice Peaks
        } else {
          biomeGrid[idx] = 8; // Polar / Sea Glacial Ice
        }
      } else if (isAboveBoiling) {
        // Local temperature rose above the liquid's local boiling point -> replace biome here with Desert!
        biomeGrid[idx] = 10; // Hyper-Arid Dunes / Desert
      } else if (isBelowSeaLevel) {
        // Unfrozen liquid sea/ocean (freezingPointK <= Tlocal <= localBoilingPointK)
        const waterDepthRatio = (seaLevelNormalized - hNorm) / Math.max(0.001, seaLevelNormalized);
        if (waterDepthRatio > 0.6) {
          biomeGrid[idx] = 0; // Abyssal Trench (colored by seaPalette)
        } else if (waterDepthRatio > 0.25) {
          biomeGrid[idx] = 1; // Deep Ocean (colored by seaPalette)
        } else {
          biomeGrid[idx] = 2; // Continental Shelf / Shallows (colored by seaPalette)
        }
      } else {
        // Dry Land / Unfrozen Crust Biomes (Tlocal >= freezingPointK and Tlocal < 800 K)
        const pBar = pBarAtmo;

        if (pBar < 0.005) {
          // Vacuum rocky worlds (Moon / Mercury / Io)
          if (Tlocal > 650 || bodyClassLower.includes('volcanic') || bodyClassLower.includes('io')) {
            biomeGrid[idx] = altRatio > 0.68 + topoVar ? 13 : altRatio > 0.36 + topoVar ? 11 : 4; // Sulfur/Silicate peaks, plateaus, or plains
          } else if (Tlocal < 100) {
            biomeGrid[idx] = 18; // Cryovolcanic / Nitrogen ice
          } else if (altRatio > 0.74 + topoVar) {
            biomeGrid[idx] = 13; // High Crater Rim / Massif Peaks
          } else if (altRatio < 0.28 + topoVar && craterGrid[idx] < 0.25) {
            biomeGrid[idx] = 5; // Smooth Flood-Basalt Mare Basin
          } else {
            biomeGrid[idx] = 16; // Regolith Craterlands
          }
        } else if (freezingPointK > 0 && Tlocal < freezingPointK + 14 && Tbase < 380) {
          // Cold sub-polar / periglacial zone just above freezing point
          if (craterGrid[idx] > 0.35 && pBar < 0.3) {
            biomeGrid[idx] = 16; // Cratered highlands in thin atmosphere
          } else if (altRatio > 0.48 + topoVar) {
            biomeGrid[idx] = 11; // Cold Highland Plateau / Badlands
          } else {
            biomeGrid[idx] = 7; // Tundra / Permafrost Regolith
          }
        } else if (Tlocal > 370 || Tbase > 420) {
          if (altRatio > 0.76 + topoVar) {
            biomeGrid[idx] = 13; // High Summit Peaks (e.g. Venusian pyrite frost peaks)
          } else if (altRatio > 0.52 + topoVar) {
            biomeGrid[idx] = 12; // Mountain Cordillera
          } else if (altRatio > 0.32 + topoVar) {
            biomeGrid[idx] = 11; // High Plateau / Badlands
          } else {
            biomeGrid[idx] = 10; // Hyper-Arid Desert / Basalt Plains
          }
        } else {
          // Temperate ranges (strictly above freezing point & below boiling point)
          const isAqueousOrAmmonia =
            seaPalette.solventKey === 'H2O' ||
            seaPalette.solventKey === 'H2O + CO2' ||
            seaPalette.solventKey === 'NH3-H2O';

          if (altRatio > 0.54 + topoVar) {
            biomeGrid[idx] = 12; // Mountain Cordillera
          } else if (altRatio > 0.36 + topoVar) {
            biomeGrid[idx] = 11; // High Plateau / Badlands
          } else if (!isAqueousOrAmmonia) {
            biomeGrid[idx] = localMoisture < 0.46 ? 10 : 9; // Hyper-Arid Dunes or Arid Steppe
          } else if (freezingPointK > 0 && Tlocal < freezingPointK + 24) {
            biomeGrid[idx] = localMoisture < 0.3 ? 9 : 6; // Boreal Taiga / High-Latitude Steppe (organic thermal contour!)
          } else if (localMoisture < 0.27) {
            biomeGrid[idx] = 10; // Contiguous Hyper-Arid Desert Basin (driven by organic moisture field, never boxes!)
          } else if (localMoisture < 0.41) {
            biomeGrid[idx] = 9; // Arid Steppe / Savanna Scrub transition belt
          } else if (hasLiquid && hasBiosphere) {
            biomeGrid[idx] = altRatio < 0.06 && localMoisture > 0.62 ? 3 : localMoisture > 0.58 ? 5 : 4; // Marsh, Forest, or Plains
          } else if (hasLiquid) {
            biomeGrid[idx] = 4; // Lowland Plains
          } else {
            biomeGrid[idx] = 9; // Arid Steppe
          }
        }
      }
    }
  }

  // Ensure that on ice-dominated worlds with sufficient atmosphere and Tlocal > ~273 K,
  // liquid water always forms small patches (~16% to ~30% of the >273K zone, never 0% and never a giant ocean)
  if (isWaterIceDominated && warmMeltCandidates.length >= 4) {
    warmMeltCandidates.sort((a, b) => b.score - a.score);
    const minPatches = Math.max(3, Math.floor(warmMeltCandidates.length * 0.16));
    const maxPatches = Math.max(minPatches + 2, Math.floor(warmMeltCandidates.length * 0.30));

    if (meltwaterPatchCount < minPatches) {
      const targetPatches = Math.max(3, Math.floor(warmMeltCandidates.length * 0.20));
      const deepCutoff = Math.max(1, Math.floor(targetPatches * 0.25));
      for (let i = 0; i < targetPatches && i < warmMeltCandidates.length; i++) {
        const cand = warmMeltCandidates[i];
        if (biomeGrid[cand.idx] > 2) {
          meltwaterPatchCount++;
        }
        biomeGrid[cand.idx] = i < deepCutoff ? 1 : 2;
      }
    } else if (meltwaterPatchCount > maxPatches) {
      for (let i = maxPatches; i < warmMeltCandidates.length; i++) {
        const cand = warmMeltCandidates[i];
        if (biomeGrid[cand.idx] <= 2) {
          biomeGrid[cand.idx] = cand.rockBiome;
          meltwaterPatchCount--;
        }
      }
    }
  }

  const effectiveHasLiquid = hasLiquid || meltwaterPatchCount > 0;

  // 2-Pass Cellular Majority-Vote Smoothing Filter over land biomes so regions are contiguous without isolated speckle
  if (!isNoSurface) {
    const tempBiomes = new Uint8Array(width * height);
    const counts = new Uint8Array(24);
    for (let pass = 0; pass < 2; pass++) {
      tempBiomes.set(biomeGrid);
      for (let y = 0; y < height; y++) {
        const yUp = Math.max(0, y - 1);
        const yDown = Math.min(height - 1, y + 1);
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const bCenter = tempBiomes[idx];
          // Preserve water cells, volcanic cones/calderas, and cryotectonic ice fissures
          if (bCenter <= 2 || bCenter === 15 || bCenter === 21 || bCenter === 22 || volcanoGrid[idx] > 0.35) {
            continue;
          }
          counts.fill(0);
          let sameCount = 0;
          let bestBiome = bCenter;
          let bestCount = 0;
          for (let ny = yUp; ny <= yDown; ny++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = (x + dx + width) % width;
              const nb = tempBiomes[ny * width + nx];
              if (nb <= 2 || nb === 21 || nb === 22) continue;
              const weight = dx === 0 && ny === y ? 2 : 1;
              counts[nb] += weight;
              if (nb === bCenter && !(dx === 0 && ny === y)) sameCount++;
              if (counts[nb] > bestCount) {
                bestCount = counts[nb];
                bestBiome = nb;
              }
            }
          }
          if (sameCount < 3 && bestBiome !== bCenter) {
            biomeGrid[idx] = bestBiome;
          }
        }
      }
    }
  }

  // Precompute smoothly blended land surface RGB (3-pass spherical Gaussian feathering across land biome transitions)
  {
    const rawRgb = new Float32Array(width * height * 3);
    const pingRgb = new Float32Array(width * height * 3);
    for (let y = 0; y < height; y++) {
      const lat = 90 - y;
      for (let x = 0; x < width; x++) {
        const lon = x - 180;
        const i = y * width + x;
        const bId = biomeGrid[i];
        const Tlocal = temperatureGrid[i];
        const h = hypsometry[i];
        if (bId === 15 && volcanoGrid[i] <= 1.1) {
          const meltHeat = Math.max(0, Math.min(1, (Tlocal - 800) / 420 + (1 - h) * 0.25));
          if (meltHeat < 0.45) {
            const t = meltHeat / 0.45;
            rawRgb[i * 3] = 215 + (248 - 215) * t;
            rawRgb[i * 3 + 1] = 78 + (138 - 78) * t;
            rawRgb[i * 3 + 2] = 8 + (14 - 8) * t;
          } else {
            const t = (meltHeat - 0.45) / 0.55;
            rawRgb[i * 3] = 248 + (255 - 248) * t;
            rawRgb[i * 3 + 1] = 138 + (214 - 138) * t;
            rawRgb[i * 3 + 2] = 14 + (46 - 14) * t;
          }
        } else {
          const hex = resolveSolidBiomeColorHex(bId, floraPalette, compositionPalette);
          const baseR = parseInt(hex.slice(1, 3), 16);
          const baseG = parseInt(hex.slice(3, 5), 16);
          const baseB = parseInt(hex.slice(5, 7), 16);
          // Subtle regional mineral/albedo color variation across solid surfaces
          const regTint = sphericalFbm(lat * 2.1, lon * 2.1, seed + 947, 3) - 0.5;
          const fineTint = sphericalFbm(lat * 5.2, lon * 5.2, seed + 1319, 2) - 0.5;
          const isIceBiome = bId === 8 || bId === 13 || bId === 18 || bId === 21;
          const varMult = isIceBiome ? 0.55 : 1.0;
          const lScale = 1.0 + (regTint * 0.085 + fineTint * 0.045) * varMult;
          const warmShift = (regTint * 5.5 - fineTint * 3.0) * varMult;
          rawRgb[i * 3] = Math.max(0, Math.min(255, baseR * lScale + warmShift));
          rawRgb[i * 3 + 1] = Math.max(0, Math.min(255, baseG * lScale + warmShift * 0.2));
          rawRgb[i * 3 + 2] = Math.max(0, Math.min(255, baseB * lScale - warmShift * 0.75));
        }
      }
    }

    // 3 passes of spherical 3x3 Gaussian smoothing across non-water cells so all biome edges blend seamlessly
    for (let pass = 0; pass < 3; pass++) {
      const src = pass % 2 === 0 ? rawRgb : pingRgb;
      const dst = pass % 2 === 0 ? pingRgb : rawRgb;
      for (let y = 0; y < height; y++) {
        const yUp = Math.max(0, y - 1);
        const yDown = Math.min(height - 1, y + 1);
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const bCenter = biomeGrid[idx];
          const isWaterCenter = !isNoSurface && bCenter <= 2;
          if (isWaterCenter || volcanoGrid[idx] > 1.1) {
            dst[idx * 3] = src[idx * 3];
            dst[idx * 3 + 1] = src[idx * 3 + 1];
            dst[idx * 3 + 2] = src[idx * 3 + 2];
            continue;
          }
          let sumR = 0;
          let sumG = 0;
          let sumB = 0;
          let sumW = 0;
          for (let ny = yUp; ny <= yDown; ny++) {
            const dy = ny - y;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = (x + dx + width) % width;
              const nIdx = ny * width + nx;
              const nBiome = biomeGrid[nIdx];
              const isWaterNeighbor = !isNoSurface && nBiome <= 2;
              if (isWaterNeighbor || volcanoGrid[nIdx] > 1.1) continue;
              const w = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
              sumR += src[nIdx * 3] * w;
              sumG += src[nIdx * 3 + 1] * w;
              sumB += src[nIdx * 3 + 2] * w;
              sumW += w;
            }
          }
          if (sumW > 0) {
            dst[idx * 3] = sumR / sumW;
            dst[idx * 3 + 1] = sumG / sumW;
            dst[idx * 3 + 2] = sumB / sumW;
          } else {
            dst[idx * 3] = src[idx * 3];
            dst[idx * 3 + 1] = src[idx * 3 + 1];
            dst[idx * 3 + 2] = src[idx * 3 + 2];
          }
        }
      }
    }

    // After 3 passes (0: raw->ping, 1: ping->raw, 2: raw->ping), result is in pingRgb
    for (let i = 0; i < width * height * 3; i++) {
      blendedLandRgb[i] = Math.max(0, Math.min(255, Math.round(pingRgb[i])));
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

  const model: PlanetarySurfaceModel = {
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
    compositionPalette,
    hasLiquid: effectiveHasLiquid,
    seaLevelNormalized,
    minElevationKm: minElevKm,
    maxElevationKm: maxElevKm,
    hypsometry,
    temperatureGrid,
    moistureGrid,
    biomeGrid,
    blendedLandRgb,
    craterGrid,
    craterProminence,
    fractureGrid,
    volcanoGrid,
    volcanoCount: volcanoes.length,
    cloudGrid,
    cloudOpacity,
    atmospherePalette,
    tectonicPlateGrid,
    platesCount,
    solvent:
      isMoltenWorld && effectiveHasLiquid
        ? 'Silicate Magma'
        : meltwaterPatchCount > 0 && (!hydro?.solvent || hydro.solvent === 'None')
        ? 'H2O'
        : hydro?.solvent || 'None',
    solventColorHex: seaPalette.horizonTopHex,
    seaPalette,
    skyColorHex: skyColors.zenith,
    skyHorizonHex: skyColors.horizon,
    starAngularDiameterDeg,
    starColorHex: star.colorHex || '#fff4e6',
    starTeff,
    ambientIllumination: Math.min(1.0, Math.max(0.1, (zone?.a_in || 1) / (planet.a || 1))),
    hasRings,
    ringInnerRp: ringSys?.innerRadiusRp || 1.25,
    ringOuterRp: ringSys?.outerRadiusRp || 2.1,
    ringColorHex: ringSys?.compositionLabel?.includes('Ice') ? '#dbeafe' : '#ca8a04',
    ringTau: ringSys?.opticalDepth || 0.45,
    moonsInSky,
  };

  if (surfaceModelCache.size > 120) {
    surfaceModelCache.clear();
  }
  surfaceModelCache.set(cacheKey, model);
  return model;
}

/**
 * Resolves the hex color of a solid-surface biome using both the biosphere flora pigment palette
 * and the planetary crust composition palette (iron-rich, sulfur-volcanic, ferric-oxide, tholin-cryo,
 * water-ice, carbonaceous, or felsic-mafic silicate).
 */
export function resolveSolidBiomeColorHex(
  biomeId: number,
  floraPalette: FloraPigmentPalette,
  comp: CrustCompositionPalette
): string {
  if (biomeId === 3) return floraPalette.hasAnyLife ? floraPalette.marshHex : comp.alluvialHex;
  if (biomeId === 4) return floraPalette.hasAnyLife ? floraPalette.plainsHex : comp.lowlandHex;
  if (biomeId === 5) return floraPalette.hasAnyLife ? floraPalette.woodlandHex : comp.basinHex;
  if (biomeId === 6) return floraPalette.hasAnyLife ? floraPalette.taigaHex : comp.steppeHex;
  if (biomeId === 7) return comp.tundraHex;
  if (biomeId === 8) return comp.iceHex;
  if (biomeId === 9) return comp.aridHex;
  if (biomeId === 10) return comp.duneHex;
  if (biomeId === 11) return comp.plateauHex;
  if (biomeId === 12) return comp.mountainHex;
  if (biomeId === 13) return comp.peakHex;
  if (biomeId === 14) return comp.basaltHex;
  if (biomeId === 16) return comp.craterlandHex;
  if (biomeId === 18) return comp.cryoPlainsHex;
  return (BIOMES.find((bm) => bm.id === biomeId) || BIOMES[4]).color;
}

/**
 * Computes the RGB color and physical properties of a single (x, y) texel in the 360x180
 * surface map for any requested layer ('satellite', 'clouds', 'biomes', 'topography', etc.),
 * so both the 2D Equirectangular Map and the 3D Projected Globe share identical rendering.
 */
export function evaluateSurfaceMapTexel(
  surfaceModel: PlanetarySurfaceModel,
  x: number,
  y: number,
  activeLayer: SurfaceMapLayerType,
  showCloudsOverlay: boolean,
  applyReliefInSatellite = true
): {
  r: number;
  g: number;
  b: number;
  isWater: boolean;
  isSelfLuminous: boolean;
  dhdx: number;
  dhdy: number;
} {
  const width = 360;
  const height = 180;
  const gx = ((x % width) + width) % width;
  const gy = Math.max(0, Math.min(height - 1, y));
  const idx = gy * width + gx;
  const yUp = Math.max(0, gy - 1);
  const yDown = Math.min(height - 1, gy + 1);
  const xLeft = (gx + width - 1) % width;
  const xRight = (gx + 1) % width;

  const {
    hypsometry,
    temperatureGrid,
    biomeGrid,
    craterGrid,
    fractureGrid,
    volcanoGrid,
    cloudGrid,
    cloudOpacity,
    atmospherePalette,
    floraPalette,
    compositionPalette,
    seaLevelNormalized,
    isNoSurface,
    isIcyWorld,
    isMoltenWorld,
    hasLiquid,
    seaPalette,
  } = surfaceModel;

  const isBlankSurfaceLayer =
    isNoSurface &&
    (activeLayer === 'biomes' || activeLayer === 'topography' || activeLayer === 'moisture' || activeLayer === 'plates');

  if (isBlankSurfaceLayer) {
    return { r: 10, g: 15, b: 26, isWater: false, isSelfLuminous: false, dhdx: 0, dhdy: 0 };
  }

  const Lx = -0.62;
  const Ly = -0.48;
  const Lz = 0.62;

  // Dedicated Cloud & Atmosphere Layer OR No-Surface World in Satellite/Clouds view (100% Cloud/Atmosphere Opacity)
  if (activeLayer === 'clouds' || (isNoSurface && activeLayer === 'satellite')) {
    if (cloudOpacity <= 0.001 && !isNoSurface) {
      return { r: 8, g: 12, b: 22, isWater: false, isSelfLuminous: false, dhdx: 0, dhdy: 0 };
    }

    const cVal = cloudGrid[idx];
    const dcdx = (cloudGrid[gy * width + xRight] - cloudGrid[gy * width + xLeft]) * 0.5;
    const dcdy = (cloudGrid[yDown * width + gx] - cloudGrid[yUp * width + gx]) * 0.5;

    let r = 0;
    let g = 0;
    let b = 0;

    if (isNoSurface) {
      const bandHarmonic = Math.sin((gy / height) * Math.PI * 9.5 + (surfaceModel.seed % 23) * 0.35 + cVal * 2.1);
      const bandScale = 1.0 + bandHarmonic * 0.045;
      const bandWarmth = Math.cos((gy / height) * Math.PI * 6.5 + (surfaceModel.seed % 17) * 0.5) * 4.5;
      if (surfaceModel.isSupercritical) {
        const cloudCover = Math.max(0, Math.min(1, (cVal - 0.18) / 0.78));
        const greyShade = 0.76 + 0.24 * Math.sin(cVal * Math.PI);
        const cr = atmospherePalette.bandLightRgb[0] * greyShade;
        const cg = atmospherePalette.bandLightRgb[1] * greyShade;
        const cb = atmospherePalette.bandLightRgb[2] * greyShade;
        r = (atmospherePalette.atmoRgb[0] * (1 - cloudCover * 0.88) + cr * (cloudCover * 0.88)) * bandScale;
        g = (atmospherePalette.atmoRgb[1] * (1 - cloudCover * 0.88) + cg * (cloudCover * 0.88)) * bandScale;
        b = (atmospherePalette.atmoRgb[2] * (1 - cloudCover * 0.88) + cb * (cloudCover * 0.88)) * bandScale;
      } else {
        r =
          (atmospherePalette.bandDarkRgb[0] +
            (atmospherePalette.bandLightRgb[0] - atmospherePalette.bandDarkRgb[0]) * cVal) *
            bandScale +
          bandWarmth;
        g =
          (atmospherePalette.bandDarkRgb[1] +
            (atmospherePalette.bandLightRgb[1] - atmospherePalette.bandDarkRgb[1]) * cVal) *
            bandScale +
          bandWarmth * 0.2;
        b =
          (atmospherePalette.bandDarkRgb[2] +
            (atmospherePalette.bandLightRgb[2] - atmospherePalette.bandDarkRgb[2]) * cVal) *
            bandScale -
          bandWarmth * 0.75;
      }
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));

      if (applyReliefInSatellite) {
        const cnx = -dcdx * 14;
        const cny = -dcdy * 14;
        const invLen = 1.0 / Math.sqrt(cnx * cnx + cny * cny + 1.0);
        const NdotL = (cnx * Lx + cny * Ly + Lz) * invLen;
        const cloudRelief = 0.95 + (NdotL - Lz) * 0.65;
        r = Math.max(0, Math.min(255, Math.round(r * cloudRelief)));
        g = Math.max(0, Math.min(255, Math.round(g * cloudRelief)));
        b = Math.max(0, Math.min(255, Math.round(b * cloudRelief)));
      }
    } else {
      const bgR = 10;
      const bgG = 15;
      const bgB = 26;
      const localAlpha = Math.min(1.0, cloudOpacity * (0.35 + 0.65 * cVal));
      const cr = atmospherePalette.atmoRgb[0] * (1 - cVal) + atmospherePalette.cloudRgb[0] * cVal;
      const cg = atmospherePalette.atmoRgb[1] * (1 - cVal) + atmospherePalette.cloudRgb[1] * cVal;
      const cb = atmospherePalette.atmoRgb[2] * (1 - cVal) + atmospherePalette.cloudRgb[2] * cVal;

      r = Math.round(bgR * (1 - localAlpha) + cr * localAlpha);
      g = Math.round(bgG * (1 - localAlpha) + cg * localAlpha);
      b = Math.round(bgB * (1 - localAlpha) + cb * localAlpha);
    }

    return { r, g, b, isWater: false, isSelfLuminous: false, dhdx: dcdx, dhdy: dcdy };
  }

  const h = hypsometry[idx];
  const volcVal = volcanoGrid[idx];
  const biomeId = biomeGrid[idx];
  // Any cell with biomeId 0, 1, or 2 is liquid water/ocean (including small meltwater patches > 273 K on ice-dominated worlds!)
  const isWater = !isNoSurface && (biomeId === 0 || biomeId === 1 || biomeId === 2);
  const isIceCell = biomeId === 8 || biomeId === 13 || biomeId === 18 || biomeId === 21;
  const isFrozenSeaIce =
    !isNoSurface &&
    !isIcyWorld &&
    hasLiquid &&
    !isWater &&
    isIceCell &&
    h <= seaLevelNormalized &&
    volcVal < 0.35;
  const rawDhdx = (hypsometry[gy * width + xRight] - hypsometry[gy * width + xLeft]) * 0.5;
  const rawDhdy = (hypsometry[yDown * width + gx] - hypsometry[yUp * width + gx]) * 0.5;
  // Floating sea ice pack over deep ocean is relatively flat compared to continental or solid cryo-shell topography
  const dhdx = isFrozenSeaIce ? rawDhdx * 0.22 : rawDhdx;
  const dhdy = isFrozenSeaIce ? rawDhdy * 0.22 : rawDhdy;

  const Tlocal = temperatureGrid[idx];
  let r = 0;
  let g = 0;
  let b = 0;
  let isSelfLuminous = volcVal > 1.1 || biomeId === 15;

  if (activeLayer === 'satellite' || activeLayer === 'biomes') {
    if (isWater) {
      if (isMoltenWorld || seaPalette.solventKey === 'Silicate Magma') isSelfLuminous = true;
      const depthRatio = isIcyWorld
        ? biomeId === 1
          ? 0.42
          : 0.14
        : Math.max(0, Math.min(1, (seaLevelNormalized - h) / Math.max(0.001, seaLevelNormalized)));
      if (activeLayer === 'biomes') {
        const rgb = biomeId === 0 ? seaPalette.trenchRgb : biomeId === 1 ? seaPalette.deepRgb : seaPalette.shallowRgb;
        r = rgb[0];
        g = rgb[1];
        b = rgb[2];
      } else {
        if (depthRatio < 0.35) {
          const t = depthRatio / 0.35;
          r = seaPalette.shallowRgb[0] + (seaPalette.deepRgb[0] - seaPalette.shallowRgb[0]) * t;
          g = seaPalette.shallowRgb[1] + (seaPalette.deepRgb[1] - seaPalette.shallowRgb[1]) * t;
          b = seaPalette.shallowRgb[2] + (seaPalette.deepRgb[2] - seaPalette.shallowRgb[2]) * t;
        } else {
          const t = (depthRatio - 0.35) / 0.65;
          r = seaPalette.deepRgb[0] + (seaPalette.trenchRgb[0] - seaPalette.deepRgb[0]) * t;
          g = seaPalette.deepRgb[1] + (seaPalette.trenchRgb[1] - seaPalette.deepRgb[1]) * t;
          b = seaPalette.deepRgb[2] + (seaPalette.trenchRgb[2] - seaPalette.deepRgb[2]) * t;
        }
      }
    } else {
      const bR = surfaceModel.blendedLandRgb[idx * 3];
      const bG = surfaceModel.blendedLandRgb[idx * 3 + 1];
      const bB = surfaceModel.blendedLandRgb[idx * 3 + 2];

      if (activeLayer === 'satellite') {
        r = bR;
        g = bG;
        b = bB;
      } else {
        // Biomes layer: blend exact biome color with feathered boundary color to eliminate sharp stair-step edges
        const hex = resolveSolidBiomeColorHex(biomeId, floraPalette, compositionPalette);
        const exR = parseInt(hex.slice(1, 3), 16);
        const exG = parseInt(hex.slice(3, 5), 16);
        const exB = parseInt(hex.slice(5, 7), 16);
        r = exR * 0.55 + bR * 0.45;
        g = exG * 0.55 + bG * 0.45;
        b = exB * 0.55 + bB * 0.45;
      }

      if (volcVal > 0.15) {
        if (volcVal > 1.1) {
          const calderaT = Math.min(1.0, (volcVal - 1.1) / 0.8);
          r = Math.round(238 + 17 * calderaT);
          g = Math.round(108 + 116 * calderaT);
          b = Math.round(14 + 34 * calderaT);
        } else if (Tlocal < 800) {
          const coneT = Math.min(1.0, volcVal / 0.95);
          const basaltR = coneT > 0.78 ? 148 : 46;
          const basaltG = coneT > 0.78 ? 58 : 34;
          const basaltB = coneT > 0.78 ? 22 : 30;
          const blend = Math.min(0.88, coneT * 0.9);
          r = r * (1 - blend) + basaltR * blend;
          g = g * (1 - blend) + basaltG * blend;
          b = b * (1 - blend) + basaltB * blend;
        }
      }

      const crackVal = fractureGrid[idx];
      if (Tlocal >= 800 && crackVal > 0.08) {
        if (crackVal > 0.25) isSelfLuminous = true;
        const t = Math.min(1.0, crackVal / 0.8);
        if (t < 0.45) {
          const m = t / 0.45;
          r = r * (1 - m * 0.85) + 235 * (m * 0.85);
          g = g * (1 - m * 0.85) + 98 * (m * 0.85);
          b = b * (1 - m * 0.85) + 12 * (m * 0.85);
        } else {
          const c = (t - 0.45) / 0.55;
          r = 235 + (255 - 235) * c;
          g = 98 + (212 - 98) * c;
          b = 12 + (42 - 12) * c;
        }
      } else if ((isMoltenWorld || seaPalette.solventKey === 'Silicate Magma') && Tlocal < 800 && crackVal > 0.08) {
        // Cooled, solidified basalt tectonic fractures where local temperature < 800 K
        const t = Math.min(1.0, crackVal / 0.85) * 0.42;
        r = r * (1 - t) + 24 * t;
        g = g * (1 - t) + 18 * t;
        b = b * (1 - t) + 16 * t;
      } else if ((isIcyWorld || isFrozenSeaIce) && isIceCell && crackVal > 0.08) {
        const t = Math.min(1.0, crackVal / 0.85);
        if (t < 0.4) {
          const m = t / 0.4;
          r = r * (1 - m * 0.35) + 155 * (m * 0.35);
          g = g * (1 - m * 0.35) + 125 * (m * 0.35);
          b = b * (1 - m * 0.35) + 115 * (m * 0.35);
        } else {
          const c = (t - 0.4) / 0.6;
          r = r * (1 - c * 0.72) + 38 * (c * 0.72);
          g = g * (1 - c * 0.65) + 108 * (c * 0.65);
          b = b * (1 - c * 0.55) + 158 * (c * 0.55);
        }
      } else if (isIcyWorld && !isIceCell && crackVal > 0.08) {
        // Tectonic graben / fault across exposed silicate rock (> 250 K) on an ice-dominated world
        const t = Math.min(1.0, crackVal / 0.85) * 0.38;
        r = r * (1 - t) + 42 * t;
        g = g * (1 - t) + 36 * t;
        b = b * (1 - t) + 32 * t;
      }

      if (activeLayer === 'satellite' && !isNoSurface && volcVal <= 1.1 && biomeId !== 15) {
        const altRatio = isFrozenSeaIce
          ? 0.15
          : Math.max(0, (h - seaLevelNormalized) / Math.max(0.001, 1 - seaLevelNormalized));
        const promScale = 0.75 + 0.32 * (surfaceModel.craterProminence || 1.0);
        // Bright ice ejecta boost is strongest on icy crust; exposed rock (> 250 K) has darker silicate ejecta
        const ejectaMult = isIcyWorld && !isIceCell ? 0.35 : compositionPalette.iceEjectaBoost;
        const craterBoost = isFrozenSeaIce ? 0 : craterGrid[idx] * (13 + ejectaMult * 25) * promScale;
        r = Math.min(255, r * (0.92 + altRatio * 0.22) + craterBoost * 0.94);
        g = Math.min(255, g * (0.92 + altRatio * 0.22) + craterBoost * 0.98);
        b = Math.min(255, b * (0.92 + altRatio * 0.22) + craterBoost * 1.08);
      }
    }

    if (activeLayer === 'satellite') {
      if (applyReliefInSatellite) {
        const craterProm = surfaceModel.craterProminence || 1.0;
        const craterReliefMult = craterGrid[idx] > 0.04 ? 0.85 + 0.35 * craterProm : 1.0;
        const bumpScale = (isWater ? 14 : biomeId === 15 ? 24 : 46) * craterReliefMult;
        const nx = -dhdx * bumpScale;
        const ny = -dhdy * bumpScale;
        const nz = 1.0;
        const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        const NdotL = (nx * Lx + ny * Ly + nz * Lz) * invLen;
        const reliefShade =
          volcVal > 1.1
            ? 1.0
            : biomeId === 15
            ? 0.95 + (NdotL - Lz) * 0.55
            : isWater
            ? isMoltenWorld || seaPalette.solventKey === 'Silicate Magma'
              ? 0.96 + (NdotL - Lz) * 0.45
              : 0.88 + (NdotL - Lz) * 0.65
            : 0.94 + (NdotL - Lz) * (1.32 + Math.min(0.45, Math.max(0, craterProm - 0.8) * 0.3));

        r = Math.max(0, Math.min(255, Math.round(r * reliefShade)));
        g = Math.max(0, Math.min(255, Math.round(g * reliefShade)));
        b = Math.max(0, Math.min(255, Math.round(b * reliefShade)));
      }

      // Composite Cloud & Atmosphere Layer on top of Satellite surface with opacity proportional to atmospheric density
      if (showCloudsOverlay && cloudOpacity > 0.001) {
        const cVal = cloudGrid[idx];
        const atmoTintWeight = cloudOpacity * 0.24;
        r = r * (1 - atmoTintWeight) + atmospherePalette.atmoRgb[0] * atmoTintWeight;
        g = g * (1 - atmoTintWeight) + atmospherePalette.atmoRgb[1] * atmoTintWeight;
        b = b * (1 - atmoTintWeight) + atmospherePalette.atmoRgb[2] * atmoTintWeight;

        const cloudAlpha = Math.min(0.95, cloudOpacity * Math.pow(cVal, 0.85) * 0.92);
        r = Math.round(r * (1 - cloudAlpha) + atmospherePalette.cloudRgb[0] * cloudAlpha);
        g = Math.round(g * (1 - cloudAlpha) + atmospherePalette.cloudRgb[1] * cloudAlpha);
        b = Math.round(b * (1 - cloudAlpha) + atmospherePalette.cloudRgb[2] * cloudAlpha);
      }
    } else {
      r = Math.max(0, Math.min(255, Math.round(r)));
      g = Math.max(0, Math.min(255, Math.round(g)));
      b = Math.max(0, Math.min(255, Math.round(b)));
    }
  } else if (activeLayer === 'topography') {
    if (isWater) {
      const depthRatio = isIcyWorld
        ? biomeId === 1
          ? 0.42
          : 0.14
        : (seaLevelNormalized - h) / Math.max(0.001, seaLevelNormalized);
      r = Math.round(seaPalette.trenchRgb[0] + (seaPalette.shallowRgb[0] - seaPalette.trenchRgb[0]) * (1 - depthRatio) * 0.75);
      g = Math.round(seaPalette.trenchRgb[1] + (seaPalette.shallowRgb[1] - seaPalette.trenchRgb[1]) * (1 - depthRatio) * 0.75);
      b = Math.round(seaPalette.trenchRgb[2] + (seaPalette.shallowRgb[2] - seaPalette.trenchRgb[2]) * (1 - depthRatio) * 0.75);
    } else if (volcVal > 1.1) {
      r = 251;
      g = 191;
      b = 36;
    } else if (isIceCell) {
      // Glacial Sea Ice / Continental Ice Cap in Topography view
      const iceHex =
        biomeId === 13
          ? compositionPalette.peakHex
          : biomeId === 18
          ? compositionPalette.cryoPlainsHex
          : compositionPalette.iceHex;
      const iceRgb = hexToRgbTuple(iceHex);
      r = iceRgb[0];
      g = iceRgb[1];
      b = iceRgb[2];
    } else {
      const altRatio = Math.max(0, (h - seaLevelNormalized) / Math.max(0.001, 1 - seaLevelNormalized));
      const lowBase = floraPalette.hasAnyLife ? floraPalette.lowRgb : compositionPalette.lowlandRgb;
      const platBase = compositionPalette.plateauRgb;
      const mtnBase = compositionPalette.mountainRgb;
      const peakBase = compositionPalette.peakRgb;
      if (altRatio < 0.32) {
        const t = altRatio / 0.32;
        r = Math.round(lowBase[0] + (platBase[0] - lowBase[0]) * t);
        g = Math.round(lowBase[1] + (platBase[1] - lowBase[1]) * t);
        b = Math.round(lowBase[2] + (platBase[2] - lowBase[2]) * t);
      } else if (altRatio < 0.68) {
        const t = (altRatio - 0.32) / 0.36;
        r = Math.round(platBase[0] + (mtnBase[0] - platBase[0]) * t);
        g = Math.round(platBase[1] + (mtnBase[1] - platBase[1]) * t);
        b = Math.round(platBase[2] + (mtnBase[2] - platBase[2]) * t);
      } else {
        const t = (altRatio - 0.68) / 0.32;
        r = Math.round(mtnBase[0] + (peakBase[0] - mtnBase[0]) * t);
        g = Math.round(mtnBase[1] + (peakBase[1] - mtnBase[1]) * t);
        b = Math.round(mtnBase[2] + (peakBase[2] - mtnBase[2]) * t);
      }
    }
    const nx = -dhdx * 36;
    const ny = -dhdy * 36;
    const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + 1.0);
    const NdotL = (nx * Lx + ny * Ly + Lz) * invLen;
    const topoShade = volcVal > 1.1 ? 1.0 : 0.94 + (NdotL - Lz) * 1.15;
    r = Math.max(0, Math.min(255, Math.round(r * topoShade)));
    g = Math.max(0, Math.min(255, Math.round(g * topoShade)));
    b = Math.max(0, Math.min(255, Math.round(b * topoShade)));
  } else if (activeLayer === 'temperature') {
    const T = temperatureGrid[idx];
    if (T < 200) {
      r = 32;
      g = 24;
      b = 128;
    } else if (T < 273.15) {
      const t = (T - 200) / 73.15;
      r = Math.round(32 + t * 56);
      g = Math.round(52 + t * 128);
      b = Math.round(180 + t * 65);
    } else if (T < 320) {
      const t = (T - 273.15) / 46.85;
      r = Math.round(140 + t * 105);
      g = Math.round(185 + t * 25);
      b = Math.round(190 - t * 150);
    } else {
      const t = Math.min(1.0, (T - 320) / 250);
      r = Math.round(245 + t * 10);
      g = Math.round(140 - t * 110);
      b = Math.round(35 - t * 25);
    }
  } else if (activeLayer === 'moisture') {
    const moist = surfaceModel.moistureGrid[idx];
    if (isWater) {
      r = seaPalette.shallowRgb[0];
      g = seaPalette.shallowRgb[1];
      b = seaPalette.shallowRgb[2];
    } else if (!hasLiquid && moist < 0.35) {
      r = Math.round(196 - moist * 65);
      g = Math.round(148 - moist * 35);
      b = Math.round(78 + moist * 40);
    } else if (moist < 0.35) {
      const t = moist / 0.35;
      r = Math.round(204 - t * 54);
      g = Math.round(154 - t * 18);
      b = Math.round(74 + t * 28);
    } else if (moist < 0.65) {
      const t = (moist - 0.35) / 0.3;
      r = Math.round(150 - t * 92);
      g = Math.round(136 + t * 28);
      b = Math.round(102 + t * 36);
    } else {
      const t = (moist - 0.65) / 0.35;
      r = Math.round(58 - t * 32);
      g = Math.round(164 - t * 28);
      b = Math.round(138 + t * 62);
    }
  } else if (activeLayer === 'plates') {
    const pId = surfaceModel.tectonicPlateGrid[idx];
    const pRight = surfaceModel.tectonicPlateGrid[gy * width + xRight];
    const pDown = surfaceModel.tectonicPlateGrid[yDown * width + gx];
    const isBoundary = pId !== pRight || pId !== pDown;
    const colors = [
      [212, 72, 68],
      [64, 142, 218],
      [218, 168, 52],
      [168, 74, 212],
      [58, 192, 198],
      [222, 118, 54],
      [142, 122, 96],
      [112, 128, 148],
      [92, 178, 104],
      [196, 92, 148],
    ];
    const col = colors[Math.abs(pId) % colors.length];
    if (isBoundary && surfaceModel.platesCount > 0) {
      r = Math.min(255, Math.round(col[0] * 0.45 + 255 * 0.55));
      g = Math.min(255, Math.round(col[1] * 0.45 + 185 * 0.55));
      b = Math.min(255, Math.round(col[2] * 0.45 + 75 * 0.55));
    } else {
      r = col[0];
      g = col[1];
      b = col[2];
    }
  }

  return { r, g, b, isWater, isSelfLuminous, dhdx, dhdy };
}

/**
 * Evaluates fractional (xFloat, yFloat) coordinates in [0..360) x [0..179] using bilinear interpolation
 * across the 4 surrounding texels so both the high-DPI 2D Cartographic Map and 3D Globe have smooth,
 * anti-aliased transitions with zero square pixelation.
 */
export function evaluateSurfaceMapBilinear(
  surfaceModel: PlanetarySurfaceModel,
  xFloat: number,
  yFloat: number,
  activeLayer: SurfaceMapLayerType,
  showCloudsOverlay: boolean,
  applyReliefInSatellite = true
): {
  r: number;
  g: number;
  b: number;
  isWater: boolean;
  isSelfLuminous: boolean;
  dhdx: number;
  dhdy: number;
} {
  const width = 360;
  const height = 180;
  const wx = ((xFloat % width) + width) % width;
  const wy = Math.max(0, Math.min(height - 1.0001, yFloat));

  const x0 = Math.floor(wx);
  const y0 = Math.floor(wy);
  const x1 = (x0 + 1) % width;
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = wx - x0;
  const fy = wy - y0;

  if (fx < 0.001 && fy < 0.001) {
    return evaluateSurfaceMapTexel(surfaceModel, x0, y0, activeLayer, showCloudsOverlay, applyReliefInSatellite);
  }

  const t00 = evaluateSurfaceMapTexel(surfaceModel, x0, y0, activeLayer, showCloudsOverlay, applyReliefInSatellite);
  const t10 = evaluateSurfaceMapTexel(surfaceModel, x1, y0, activeLayer, showCloudsOverlay, applyReliefInSatellite);
  const t01 = evaluateSurfaceMapTexel(surfaceModel, x0, y1, activeLayer, showCloudsOverlay, applyReliefInSatellite);
  const t11 = evaluateSurfaceMapTexel(surfaceModel, x1, y1, activeLayer, showCloudsOverlay, applyReliefInSatellite);

  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  const r = Math.round(t00.r * w00 + t10.r * w10 + t01.r * w01 + t11.r * w11);
  const g = Math.round(t00.g * w00 + t10.g * w10 + t01.g * w01 + t11.g * w11);
  const b = Math.round(t00.b * w00 + t10.b * w10 + t01.b * w01 + t11.b * w11);
  const dhdx = t00.dhdx * w00 + t10.dhdx * w10 + t01.dhdx * w01 + t11.dhdx * w11;
  const dhdy = t00.dhdy * w00 + t10.dhdy * w10 + t01.dhdy * w01 + t11.dhdy * w11;
  const waterScore = (t00.isWater ? w00 : 0) + (t10.isWater ? w10 : 0) + (t01.isWater ? w01 : 0) + (t11.isWater ? w11 : 0);
  const lumScore =
    (t00.isSelfLuminous ? w00 : 0) +
    (t10.isSelfLuminous ? w10 : 0) +
    (t01.isSelfLuminous ? w01 : 0) +
    (t11.isSelfLuminous ? w11 : 0);

  return {
    r,
    g,
    b,
    isWater: waterScore >= 0.5,
    isSelfLuminous: lumScore >= 0.35,
    dhdx,
    dhdy,
  };
}

export interface RenderProjectedGlobeOptions {
  activeLayer?: SurfaceMapLayerType;
  showCloudsOverlay?: boolean;
  showGrid?: boolean;
  rotYaw?: number;
  rotPitch?: number;
  transparentBg?: boolean;
  includeRings?: boolean;
  selectedCoords?: { lat: number; lon: number } | null;
}

/**
 * Projects the generated 360x180 planetary surface model onto a 3D sphere with:
 * - Satellite base (topography normal-map relief + biomes + craters + cracks + volcanoes)
 * - Cloud & atmosphere overlay (proportional to atmospheric density, or 100% for Sudarsky/Class-II fluid worlds)
 * - Outer atmospheric halo glow & Fresnel limb scattering
 * - Optional planetary ring system & coordinate grid / landing marker
 */
export function renderSurfaceProjectedGlobeToCanvas(
  canvas: HTMLCanvasElement,
  surfaceModel: PlanetarySurfaceModel,
  planet: RealisticPlanetBody,
  moon: RealisticMoon | null | undefined,
  options: RenderProjectedGlobeOptions = {}
): { cx: number; cy: number; R: number } {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const activeBody = moon || planet;
  const isMoon = Boolean(moon);
  const includeRings = options.includeRings ?? !isMoon;
  const hasRings = Boolean(!isMoon && includeRings && (planet.rings || surfaceModel.hasRings));
  const transparentBg = options.transparentBg ?? false;
  const activeLayer = options.activeLayer ?? 'satellite';
  const showCloudsOverlay = options.showCloudsOverlay ?? true;
  const showGrid = options.showGrid ?? false;
  const rotYaw = options.rotYaw ?? 0;
  const rotPitch = options.rotPitch ?? 0;

  const cx = W * 0.5;
  const cy = H * 0.5;
  const R = Math.min(W, H) * (hasRings ? 0.34 : transparentBg ? 0.44 : 0.41);

  if (!ctx) return { cx, cy, R };

  const img = ctx.createImageData(W, H);
  const data = img.data;

  const isBlankSurfaceLayer =
    surfaceModel.isNoSurface &&
    (activeLayer === 'biomes' || activeLayer === 'topography' || activeLayer === 'moisture' || activeLayer === 'plates');

  // Starlight direction vector in world space
  const isTidallyLockedPlanet = !isMoon && (planet.spinState || '').includes('1:1');
  const lx = isTidallyLockedPlanet ? -0.52 : -0.58;
  const ly = isTidallyLockedPlanet ? -0.18 : -0.32;
  const lz = isTidallyLockedPlanet ? 0.835 : 0.748;

  const cosYaw = Math.cos(rotYaw);
  const sinYaw = Math.sin(rotYaw);
  const cosPitch = Math.cos(rotPitch);
  const sinPitch = Math.sin(rotPitch);

  // Transform starlight into camera space for rim/halo & specular glint
  const laX = lx * cosYaw - lz * sinYaw;
  const laZ = lx * sinYaw + lz * cosYaw;
  const lCamX = laX;
  const lCamY = ly * cosPitch + laZ * sinPitch;
  const lCamZ = -ly * sinPitch + laZ * cosPitch;

  // Axial tilt
  const tiltDeg = activeBody.axialTiltDeg ?? 0;
  const tiltRad = (Math.max(0, Math.min(90, tiltDeg)) * Math.PI) / 180;
  const cTilt = Math.cos(tiltRad * 0.38);
  const sTilt = Math.sin(tiltRad * 0.38);

  // Ring geometry in 3D camera space
  const ringTiltRad = ((22 + (surfaceModel.seed % 18)) * Math.PI) / 180;
  const sinT = Math.sin(ringTiltRad);
  const cosT = Math.cos(ringTiltRad);
  const rInner = R * (planet.ringSystem ? planet.ringSystem.innerRadiusRp : 1.24);
  const rOuter = R * (planet.ringSystem ? Math.min(2.25, planet.ringSystem.outerRadiusRp) : 1.88);
  const rnaX = -sinT * -sinYaw;
  const rnaZ = -sinT * cosYaw;
  const rNormX = rnaX;
  const rNormY = cosT * cosPitch + rnaZ * sinPitch;
  const rNormZ = -cosT * sinPitch + rnaZ * cosPitch;

  // Atmospheric glow color & strength (Rayleigh blue or cool aerosol grey)
  const pBar = activeBody.pressureBar;
  const hasAtmoGlow = surfaceModel.isNoSurface || (pBar !== null && pBar !== undefined && pBar > 0.005);
  const atmoGlowRgb: [number, number, number] = surfaceModel.isSupercritical
    ? [72, 162, 248]
    : surfaceModel.isNoSurface
    ? surfaceModel.atmospherePalette.bandLightRgb
    : surfaceModel.atmospherePalette.atmoRgb[0] +
        surfaceModel.atmospherePalette.atmoRgb[1] +
        surfaceModel.atmospherePalette.atmoRgb[2] >
      30
    ? surfaceModel.atmospherePalette.atmoRgb
    : [88, 172, 252];
  const atmoGlowStrength = surfaceModel.isNoSurface
    ? 0.85
    : hasAtmoGlow
    ? Math.min(0.88, Math.max(0.22, 0.25 + surfaceModel.cloudOpacity * 0.65))
    : 0;

  // Host star RGB tint
  const starHex = (surfaceModel.starColorHex || '#fff4e6').replace('#', '');
  const starNum = parseInt(starHex, 16) || 0xfff4e6;
  const starR = (starNum >> 16) & 255;
  const starG = (starNum >> 8) & 255;
  const starB = starNum & 255;

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const pIdx = (py * W + px) * 4;
      const dx = px - cx;
      const dy = py - cy;
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);

      // Space background & subtle starfield
      let bgR = 5;
      let bgG = 8;
      let bgB = 16;
      if (!transparentBg) {
        const starHash = hash2D(px, py, surfaceModel.seed);
        if (starHash > 0.9978) {
          const br = Math.round(140 + 115 * ((starHash - 0.9978) / 0.0022));
          bgR = br;
          bgG = br;
          bgB = Math.min(255, br + 20);
        }
      }

      // Check 3D Ring Intersection
      let ringAlpha = 0;
      let ringR = 0;
      let ringG = 0;
      let ringB = 0;
      let ringZ = 0;

      if (hasRings) {
        const nzPlane = Math.abs(rNormZ) < 0.04 ? (rNormZ >= 0 ? 0.04 : -0.04) : rNormZ;
        ringZ = -(dx * rNormX + dy * rNormY) / nzPlane;
        const r3d = Math.sqrt(dx * dx + dy * dy + ringZ * ringZ);
        if (r3d >= rInner && r3d <= rOuter) {
          const u = (r3d - rInner) / (rOuter - rInner);
          const band1 = Math.sin(u * 28 + (surfaceModel.seed % 7)) * 0.5 + 0.5;
          const band2 = Math.sin(u * 74 + 1.7) * 0.5 + 0.5;
          const cassiniGap = Math.abs(u - 0.62) < 0.045 ? 0.12 : 1.0;
          const tau = surfaceModel.ringTau || 0.45;
          const baseRingAlpha = Math.max(0.18, Math.min(0.68, 0.18 + 0.42 * Math.sqrt(Math.min(1.2, tau / 1.5))));
          ringAlpha = baseRingAlpha * (0.45 + 0.35 * band1 + 0.2 * band2) * cassiniGap * Math.sin(u * Math.PI);

          const dotL = dx * lCamX + dy * lCamY + ringZ * lCamZ;
          const perpSq = Math.max(0, r3d * r3d - dotL * dotL);
          const shadowFactor =
            dotL < 0 && perpSq < R * R * 0.96
              ? Math.max(0.12, Math.min(1.0, (Math.sqrt(perpSq) - R * 0.86) / (R * 0.12)))
              : 1.0;

          const isIcyRing = (planet.rings || '').includes('Icy') || (planet.rings || '').includes('Major');
          ringR = (isIcyRing ? 215 : 182) * (0.78 + 0.22 * band1) * shadowFactor;
          ringG = (isIcyRing ? 208 : 158) * (0.78 + 0.22 * band1) * shadowFactor;
          ringB = (isIcyRing ? 195 : 132) * (0.78 + 0.22 * band1) * shadowFactor;
        }
      }

      // Outside sphere: render outer atmospheric halo glow + rings
      if (dist > R) {
        const haloDist = (dist - R) / (R * 0.18);
        let haloAlpha = 0;
        if (hasAtmoGlow && haloDist < 1.0 && !isBlankSurfaceLayer) {
          const sunSide = Math.max(0.18, Math.min(1.0, ((dx / dist) * lCamX + (dy / dist) * lCamY + 0.4) * 0.85));
          haloAlpha = Math.pow(1 - haloDist, 2.3) * sunSide * atmoGlowStrength * 0.78;
        }

        if (transparentBg) {
          const totA = Math.max(0, Math.min(1, haloAlpha + ringAlpha * (1 - haloAlpha)));
          if (totA <= 0.01) {
            data[pIdx + 3] = 0;
            continue;
          }
          const outR = (atmoGlowRgb[0] * haloAlpha + ringR * ringAlpha * (1 - haloAlpha)) / totA;
          const outG = (atmoGlowRgb[1] * haloAlpha + ringG * ringAlpha * (1 - haloAlpha)) / totA;
          const outB = (atmoGlowRgb[2] * haloAlpha + ringB * ringAlpha * (1 - haloAlpha)) / totA;
          data[pIdx] = Math.round(outR);
          data[pIdx + 1] = Math.round(outG);
          data[pIdx + 2] = Math.round(outB);
          data[pIdx + 3] = Math.round(totA * 255);
          continue;
        } else {
          if (haloAlpha > 0) {
            bgR = Math.round(bgR + (atmoGlowRgb[0] - bgR) * haloAlpha);
            bgG = Math.round(bgG + (atmoGlowRgb[1] - bgG) * haloAlpha);
            bgB = Math.round(bgB + (atmoGlowRgb[2] - bgB) * haloAlpha);
          }
          if (ringAlpha > 0) {
            bgR = Math.round(bgR + (ringR - bgR) * ringAlpha);
            bgG = Math.round(bgG + (ringG - bgG) * ringAlpha);
            bgB = Math.round(bgB + (ringB - bgB) * ringAlpha);
          }
          data[pIdx] = bgR;
          data[pIdx + 1] = bgG;
          data[pIdx + 2] = bgB;
          data[pIdx + 3] = 255;
          continue;
        }
      }

      // Inside sphere: compute 3D unit normal in camera space (nx, ny, nz)
      const nx = dx / R;
      const ny = -dy / R; // +ny is North (up on screen)
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));

      // Rotate camera normal into 3D world space (wx, wy, wz)
      const y1 = ny * cosPitch - nz * sinPitch;
      const z1 = ny * sinPitch + nz * cosPitch;
      const wx = nx * cosYaw + z1 * sinYaw;
      const wy = y1;
      const wz = -nx * sinYaw + z1 * cosYaw;

      // Apply axial tilt to get planetary body coordinates (sx, sy, sz)
      const sx = wx * cTilt - wy * sTilt;
      const sy = Math.max(-1, Math.min(1, wx * sTilt + wy * cTilt));
      const sz = wz;

      // Convert 3D spherical point (sx, sy, sz) to (lat, lon) in degrees:
      // At yaw=0, pitch=0, tilt=0: center of disk is (nx=0, ny=0, nz=1) -> (sx=0, sy=0, sz=1) -> lat=0, lon=0!
      const latDeg = (Math.asin(sy) * 180) / Math.PI;
      const lonDeg = (Math.atan2(sx, sz) * 180) / Math.PI;

      const mapX = (((lonDeg + 180) % 360) + 360) % 360;
      const mapY = Math.max(0, Math.min(179.0, 90 - latDeg));

      // Bilinearly sample the surface generator texel so the 3D globe has zero blocky pixelation!
      // For 'satellite' on the 3D globe, we apply 3D normal-map bump relief directly in 3D sphere lighting below
      const texel = evaluateSurfaceMapBilinear(
        surfaceModel,
        mapX,
        mapY,
        activeLayer,
        showCloudsOverlay,
        activeLayer !== 'satellite'
      );

      if (isBlankSurfaceLayer) {
        data[pIdx] = texel.r;
        data[pIdx + 1] = texel.g;
        data[pIdx + 2] = texel.b;
        data[pIdx + 3] = 255;
        continue;
      }

      // Compute 3D spherical illumination + normal-map relief bump in camera/world space
      const globeCraterMult =
        !surfaceModel.isNoSurface && !texel.isWater && surfaceModel.cloudOpacity < 0.35
          ? 0.85 + 0.32 * (surfaceModel.craterProminence || 1.0)
          : 1.0;
      const bumpScale = (surfaceModel.isNoSurface ? 8 : texel.isWater ? 12 : 38) * globeCraterMult;
      const bNx = wx - texel.dhdx * bumpScale * 0.45;
      const bNy = wy + texel.dhdy * bumpScale * 0.45;
      const bNz = wz;
      const bLen = Math.sqrt(bNx * bNx + bNy * bNy + bNz * bNz) || 1;

      const ndotl = (bNx * lx + bNy * ly + bNz * lz) / bLen;
      const smoothNdotL = wx * lx + wy * ly + wz * lz;

      // In data layers (biomes, topography, temperature, moisture, plates), keep nightside brighter so the user can inspect the full globe
      const isDataLayer = activeLayer !== 'satellite' && activeLayer !== 'clouds';
      const ambientMin = isDataLayer ? 0.58 : 0.08;
      const atmoScatter = hasAtmoGlow ? 0.16 : 0.04;
      const diff = isDataLayer
        ? Math.max(ambientMin, Math.min(1.08, 0.68 + 0.38 * ndotl))
        : Math.max(ambientMin, Math.min(1.06, (ndotl + atmoScatter) / (1 + atmoScatter)));

      let litR = texel.r * diff * (0.84 + 0.16 * (starR / 255));
      let litG = texel.g * diff * (0.84 + 0.16 * (starG / 255));
      let litB = texel.b * diff * (0.84 + 0.16 * (starB / 255));

      // Specular glint on liquid seas in 'satellite' mode
      if (activeLayer === 'satellite' && texel.isWater && smoothNdotL > 0) {
        const hx = lCamX;
        const hy = -lCamY;
        const hz = lCamZ + 1.0;
        const hLen = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
        const ndoth = Math.max(0, (nx * hx + ny * hy + nz * hz) / hLen);
        // Attenuate ocean glint under thick cloud decks
        const cloudAtten = showCloudsOverlay ? Math.max(0.1, 1.0 - surfaceModel.cloudOpacity * 0.75) : 1.0;
        const spec = Math.pow(ndoth, 22) * 0.65 * cloudAtten;
        litR += 235 * spec;
        litG += 245 * spec;
        litB += 255 * spec;
      }

      // Self-luminous volcanic calderas, molten oceans, & magma fissures glow even on the nightside
      if (texel.isSelfLuminous) {
        litR = Math.max(litR, texel.r * 0.92);
        litG = Math.max(litG, texel.g * 0.92);
        litB = Math.max(litB, texel.b * 0.92);
      }

      // Atmospheric Fresnel Limb Glow (inner rim scattering)
      if (hasAtmoGlow && (activeLayer === 'satellite' || activeLayer === 'clouds')) {
        const fresnel = Math.pow(1 - nz, 2.5);
        const sunRim = Math.max(0.22, Math.min(0.95, (smoothNdotL + 0.48) * 0.78));
        const limbStrength = fresnel * sunRim * atmoGlowStrength * 0.82;
        litR = litR + (atmoGlowRgb[0] - litR) * limbStrength;
        litG = litG + (atmoGlowRgb[1] - litG) * limbStrength;
        litB = litB + (atmoGlowRgb[2] - litB) * limbStrength;
      }

      // Optional Lat/Lon Grid lines on the 3D Globe
      if (showGrid) {
        const nearParallel = Math.abs(((latDeg + 90) % 30) - 15) > 14.35;
        const nearMeridian = Math.abs(((lonDeg + 180) % 60) - 30) > 29.25;
        const nearEquator = Math.abs(latDeg) < 0.65;
        const nearPrime = Math.abs(lonDeg) < 0.65;
        if (nearEquator || nearPrime) {
          litR = litR * 0.6 + 56 * 0.4;
          litG = litG * 0.6 + 189 * 0.4;
          litB = litB * 0.6 + 248 * 0.4;
        } else if (nearParallel || nearMeridian) {
          litR = litR * 0.82 + 255 * 0.18;
          litG = litG * 0.82 + 255 * 0.18;
          litB = litB * 0.82 + 255 * 0.18;
        }
      }

      // Front of ring (in front of sphere: ringZ > 0)
      if (ringAlpha > 0 && ringZ > 0) {
        litR = litR + (ringR - litR) * ringAlpha;
        litG = litG + (ringG - litG) * ringAlpha;
        litB = litB + (ringB - litB) * ringAlpha;
      }

      data[pIdx] = Math.max(0, Math.min(255, Math.round(litR)));
      data[pIdx + 1] = Math.max(0, Math.min(255, Math.round(litG)));
      data[pIdx + 2] = Math.max(0, Math.min(255, Math.round(litB)));
      data[pIdx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);

  // If selectedCoords is provided, project landing site marker onto visible hemisphere of the 3D globe
  if (options.selectedCoords && !isBlankSurfaceLayer) {
    const sLatRad = (options.selectedCoords.lat * Math.PI) / 180;
    const sLonRad = (options.selectedCoords.lon * Math.PI) / 180;
    const psx = Math.cos(sLatRad) * Math.sin(sLonRad);
    const psy = Math.sin(sLatRad);
    const psz = Math.cos(sLatRad) * Math.cos(sLonRad);

    // Inverse axial tilt: (psx, psy, psz) -> world (wx, wy, wz)
    const wx = psx * cTilt + psy * sTilt;
    const wy = -psx * sTilt + psy * cTilt;
    const wz = psz;

    // Inverse yaw & pitch: world (wx, wy, wz) -> camera (nx, ny, nz)
    const x1 = wx * cosYaw - wz * sinYaw;
    const z1 = wx * sinYaw + wz * cosYaw;
    const camNx = x1;
    const camNy = wy * cosPitch + z1 * sinPitch;
    const camNz = -wy * sinPitch + z1 * cosPitch;

    if (camNz > 0.05) {
      const mPx = cx + camNx * R;
      const mPy = cy - camNy * R;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(mPx, mPy, 5.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(mPx, mPy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return { cx, cy, R };
}

/**
 * Inverse-projects a 2D pixel click/hover (px, py) on the 3D Globe canvas into planetary (lat, lon) degrees,
 * or returns null if the pointer is outside the globe disk.
 */
export function pickLatLonFromProjectedGlobe(
  px: number,
  py: number,
  cx: number,
  cy: number,
  R: number,
  rotYaw: number,
  rotPitch: number,
  axialTiltDeg = 0
): { lat: number; lon: number } | null {
  const dx = px - cx;
  const dy = py - cy;
  const distSq = dx * dx + dy * dy;
  if (distSq > R * R) return null;

  const nx = dx / R;
  const ny = -dy / R;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));

  const cosYaw = Math.cos(rotYaw);
  const sinYaw = Math.sin(rotYaw);
  const cosPitch = Math.cos(rotPitch);
  const sinPitch = Math.sin(rotPitch);

  const y1 = ny * cosPitch - nz * sinPitch;
  const z1 = ny * sinPitch + nz * cosPitch;
  const wx = nx * cosYaw + z1 * sinYaw;
  const wy = y1;
  const wz = -nx * sinYaw + z1 * cosYaw;

  const tiltRad = (Math.max(0, Math.min(90, axialTiltDeg)) * Math.PI) / 180;
  const cTilt = Math.cos(tiltRad * 0.38);
  const sTilt = Math.sin(tiltRad * 0.38);

  const sx = wx * cTilt - wy * sTilt;
  const sy = Math.max(-1, Math.min(1, wx * sTilt + wy * cTilt));
  const sz = wz;

  const lat = Math.round((Math.asin(sy) * 180) / Math.PI);
  const lon = Math.round((Math.atan2(sx, sz) * 180) / Math.PI);
  return { lat: Math.max(-90, Math.min(90, lat)), lon: Math.max(-180, Math.min(180, lon)) };
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
  const biomeId = model.biomeGrid[idx];
  const isOcean = !model.isNoSurface && (biomeId === 0 || biomeId === 1 || biomeId === 2);
  const isIceCell = biomeId === 8 || biomeId === 13 || biomeId === 18 || biomeId === 21;
  const isFrozenSea =
    !model.isNoSurface &&
    !model.isIcyWorld &&
    model.hasLiquid &&
    !isOcean &&
    (isIceCell || biomeId === 14) &&
    hNorm <= model.seaLevelNormalized &&
    volcVal < 0.35;
  const isBoiledSeaBasin =
    !model.isNoSurface &&
    !model.isIcyWorld &&
    model.hasLiquid &&
    !isOcean &&
    !isFrozenSea &&
    biomeId === 10 &&
    hNorm <= model.seaLevelNormalized &&
    volcVal < 0.35;

  let elevationKm = 0;
  if (!model.isNoSurface) {
    if (isOcean || isBoiledSeaBasin) {
      const depthRatio = model.isIcyWorld
        ? biomeId === 1
          ? 0.25
          : 0.08
        : Math.max(0.02, (model.seaLevelNormalized - hNorm) / Math.max(0.001, model.seaLevelNormalized));
      elevationKm = +(depthRatio * model.minElevationKm).toFixed(2);
    } else if (isFrozenSea) {
      elevationKm = 0;
    } else {
      const altRatio = Math.max(0, (hNorm - model.seaLevelNormalized) / Math.max(0.001, 1 - model.seaLevelNormalized));
      elevationKm = +(altRatio * model.maxElevationKm).toFixed(2);
    }
  }

  const T_K = Math.round(model.temperatureGrid[idx]);
  const T_C = Math.round(T_K - 273.15);

  const biomeDef = BIOMES.find((b) => b.id === biomeId) || BIOMES[4];

  let biomeName = biomeDef.name;
  let biomeColor = resolveSolidBiomeColorHex(biomeId, model.floraPalette, model.compositionPalette);

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
    if (model.isIcyWorld && (pal.solventKey === 'H2O' || pal.solventKey === 'H2O + CO2')) {
      biomeName =
        biomeId === 1 ? 'Deep Meltwater Lake (Liquid H2O)' : 'Surface Meltwater Patch (Liquid H2O)';
      biomeColor = rgbToHex(biomeId === 1 ? pal.deepRgb : pal.shallowRgb);
    } else if (biomeId === 0) {
      biomeName = `Abyssal Trench (${pal.solventKey} Sea)`;
      biomeColor = rgbToHex(pal.trenchRgb);
    } else if (biomeId === 1) {
      biomeName = `Deep ${pal.solventKey} Ocean`;
      biomeColor = rgbToHex(pal.deepRgb);
    } else {
      biomeName = `Shallow ${pal.solventKey} Shelf`;
      biomeColor = rgbToHex(pal.shallowRgb);
    }
  } else if (isBoiledSeaBasin) {
    biomeName = `Desiccated Evaporite Desert Basin (${model.compositionPalette.compositionLabel})`;
  } else if (biomeId === 15) {
    biomeName =
      model.fractureGrid[idx] > 0.22
        ? 'Active Magma Rift & Lava Surface (T ≥ 800 K)'
        : 'Molten Silicate Magma Surface (T ≥ 800 K)';
    biomeColor = '#ffa21a';
  } else if (biomeId === 14 && isFrozenSea && (model.isMoltenWorld || model.seaPalette.solventKey === 'Silicate Magma')) {
    biomeName = `Solidified Magma Sea — Basalt Rock Crust (${model.compositionPalette.compositionLabel})`;
  } else if (biomeId === 8 || biomeId === 13) {
    if (isFrozenSea) {
      biomeName = `Frozen Sea Ice — ${model.seaPalette.iceBiomeName}`;
    } else if (model.hasLiquid && !model.isIcyWorld) {
      biomeName =
        biomeId === 13
          ? `Alpine Glacial Peaks — ${model.seaPalette.iceBiomeName}`
          : `Glacial Ice Sheet — ${model.seaPalette.iceBiomeName}`;
    } else {
      biomeName = `${biomeDef.name} (${model.compositionPalette.compositionLabel})`;
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
      // Sterile world: barren mineral/rocky plains colored by planetary composition
      biomeName = `${biomeDef.name} (${model.compositionPalette.compositionLabel})`;
    }
  } else if ((model.isIcyWorld || isFrozenSea) && isIceCell && model.fractureGrid[idx] > 0.28) {
    biomeName = 'Cryotectonic Ice Fissure (Linea)';
    biomeColor = '#3b7ea1';
  } else if (model.isIcyWorld && !isIceCell) {
    biomeName = `Exposed Silicate Bedrock — ${biomeDef.name} (T > 250 K)`;
  } else if (model.craterGrid[idx] > 0.35) {
    biomeName = `${biomeDef.name} (Impact Crater — ${model.compositionPalette.compositionLabel})`;
  } else {
    biomeName = `${biomeDef.name} (${model.compositionPalette.compositionLabel})`;
  }

  // Barometric pressure at altitude: P(h) = P0 * exp(-h / H)
  const P0 = model.isNoSurface ? 100 : (activeBody.pressureBar ?? 0);
  const scaleHeightKm = Math.max(2, (8.314 * T_K) / (0.029 * activeBody.gravityG * 9.81 * 1000));
  const pressureBar = +(P0 * Math.exp(-Math.max(0, elevationKm / 2.5) / scaleHeightKm)).toFixed(3);

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
    : elevationKm > 7.5
    ? 'Mons'
    : elevationKm > 2.5
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

