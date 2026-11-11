import {
  RealisticMoon,
  RealisticStarNode,
} from '../../types/astrophysics';
import {
  RealisticPlanetBody,
  getStarStats,
} from './realisticStarGen';
import {
  MK_TEFF_GRID,
  deriveMorganKeenanClass,
  deriveAtmosphereClassification,
  resolvePlanetClass,
  resolveMoonClass,
} from '../astrophysics/classifier';
import { teffToHex } from '../astrophysics/colors';

export const PLANET_CLASSES = [
  'Terrestrial World',
  'Temperate Terrestrial World',
  'Temperate Aquatic Terrestrial World',
  'Sub-Earth World',
  'Super-Earth World',
  'Desert World',
  'Ocean World',
  'Temperate Aquatic Ocean World',
  'Venusian World',
  'Ice World',
  'Frozen World',
  'Cryo-Ammonia World',
  'Methane World',
  'Supercritical Water World',
  'Steam World',
  'Water Giant',
  'Sub-Neptune',
  'Gas Dwarf',
  'Ice Giant',
  'Warm Neptune',
  'Hot Neptune',
  'Class I Gas Giant',
  'Class II Gas Giant',
  'Class III Gas Giant',
  'Class III Hot Jupiter',
  'Class IV Hot Jupiter',
  'Class V Hot Jupiter',
  'Gas Giant Class I (Ammonia Clouds)',
  'Gas Giant Class II (Water Clouds)',
  'Gas Giant Class III (Cloudless)',
  'Gas Giant Class IV (Alkali Metals)',
  'Gas Giant Class V (Silicate Clouds)',
  'Hot Jupiter',
  'Molten World',
  'Lava World',
  'Carbon World',
  'Iron Core World',
  'Chthonian Stripped Giant Core',
];

export const MOON_CLASSES = [
  'Silicate Rocky Moon',
  'Temperate Rocky Moon',
  'Temperate Aquatic Rocky Moon',
  'Frozen Airless Moon',
  'Frozen Moon',
  'Ice Moon',
  'Cryo-Ammonia Moon',
  'Methane Moon',
  'Sub-Moon',
  'Captured Asteroid',
  'Supercritical Water Moon',
  'Steam Moon',
  'Molten Moon',
];

export const ATMOSPHERE_TYPES = [
  'Airless Vacuum',
  'Trace / Exosphere',
  'Thin Carbon Dioxide (Martian)',
  'Nitrogen-Oxygen (Earth-like)',
  'Dense Carbon Dioxide (Venusian)',
  'Hydrogen-Helium (Jovian)',
  'Primary Neptunian Envelope',
  'Methane-Nitrogen (Cryogenic Titan-like)',
  'Ammonia-Water (Reducing)',
  'Sulfur Dioxide & Volcanic',
  'Supercritical Steam-CO2 Envelope',
  'Silicate & Alkali Rock-Vapor Exosphere',
];

export const OCEAN_SOLVENTS = [
  'None (No Ocean / Dry)',
  'Water (H2O)',
  'Brine Water (H2O + Salts)',
  'Ammonia (NH3)',
  'Ammonia-Water (NH3-H2O)',
  'Methane (CH4)',
  'Hydrocarbons (CH4-C2H6)',
  'Supercritical H2O',
  'Supercritical CO2',
  'Sulfuric Acid (H2SO4)',
  'Sulfur Dioxide (SO2)',
  'Acidic Heavy Brine',
  'Silicate Magma',
];

export const HYDROSPHERE_STATES = [
  'Dry / Desiccated',
  'Liquid Oceans',
  'Shallow Seas & Endorheic Lakes',
  'Global Surface Liquid Ocean (100% Coverage)',
  'Subsurface Ocean (Ice Shell)',
  'Frozen Surface Ice Sheet',
  'Supercritical Fluid',
  'Surface Liquid Silicate Lava Seas',
];

export const BIOSPHERE_TYPES = [
  'Barren / Sterile',
  'Prebiotic Organic Soup',
  'Chemotrophic Archaea',
  'Extremophile Microbes',
  'Subsurface Cryo-Chemotrophic Microbes',
  'Photosynthetic Microcellular',
  'Multicellular Marine Ecosystem',
  'Terrestrial Flora & Fauna',
  'Complex Sentient Biosphere',
];

export const COMMON_ATMOSPHERIC_GASES: Array<{
  code: string;
  name: string;
  mu: number;
}> = [
  { code: 'N2', name: 'Nitrogen (N₂)', mu: 28.0 },
  { code: 'O2', name: 'Oxygen (O₂)', mu: 32.0 },
  { code: 'CO2', name: 'Carbon Dioxide (CO₂)', mu: 44.0 },
  { code: 'H2O', name: 'Water Vapor (H₂O)', mu: 18.0 },
  { code: 'Ar', name: 'Argon (Ar)', mu: 40.0 },
  { code: 'CH4', name: 'Methane (CH₄)', mu: 16.0 },
  { code: 'NH3', name: 'Ammonia (NH₃)', mu: 17.0 },
  { code: 'H2', name: 'Hydrogen (H₂)', mu: 2.0 },
  { code: 'He', name: 'Helium (He)', mu: 4.0 },
  { code: 'SO2', name: 'Sulfur Dioxide (SO₂)', mu: 64.1 },
  { code: 'CO', name: 'Carbon Monoxide (CO)', mu: 28.0 },
  { code: 'H2S', name: 'Hydrogen Sulfide (H₂S)', mu: 34.1 },
  { code: 'Ne', name: 'Neon (Ne)', mu: 20.2 },
  { code: 'H2SO4', name: 'Sulfuric Acid (H₂SO₄)', mu: 98.1 },
  { code: 'SiO', name: 'Silicon Monoxide (SiO)', mu: 44.1 },
  { code: 'Na_K', name: 'Sodium-Potassium Vapor (Na/K)', mu: 31.0 },
  { code: 'Fe_Mg', name: 'Iron-Magnesium Vapor (Fe/Mg)', mu: 40.0 },
  { code: 'Cl2', name: 'Chlorine (Cl₂)', mu: 70.9 },
];

export const ATMOSPHERE_PRESETS: Record<
  string,
  {
    pressureBar: number;
    albedo?: number;
    gases: Record<string, number>;
  }
> = {
  'Airless Vacuum': {
    pressureBar: 0,
    albedo: 0.14,
    gases: {},
  },
  'Trace / Exosphere': {
    pressureBar: 0.001,
    albedo: 0.16,
    gases: { CO2: 0.6, N2: 0.25, Ar: 0.15 },
  },
  'Thin Carbon Dioxide (Martian)': {
    pressureBar: 0.008,
    albedo: 0.22,
    gases: { CO2: 0.953, N2: 0.027, Ar: 0.016, O2: 0.004 },
  },
  'Nitrogen-Oxygen (Earth-like)': {
    pressureBar: 1.013,
    albedo: 0.3,
    gases: { N2: 0.7808, O2: 0.2095, Ar: 0.0093, CO2: 0.0004 },
  },
  'Dense Carbon Dioxide (Venusian)': {
    pressureBar: 92.0,
    albedo: 0.75,
    gases: { CO2: 0.965, N2: 0.035 },
  },
  'Hydrogen-Helium (Jovian)': {
    pressureBar: 10.0,
    albedo: 0.52,
    gases: { H2: 0.75, He: 0.24, CH4: 0.01 },
  },
  'Primary Neptunian Envelope': {
    pressureBar: 15.0,
    albedo: 0.35,
    gases: { H2: 0.72, He: 0.23, CH4: 0.035, NH3: 0.015 },
  },
  'Methane-Nitrogen (Cryogenic Titan-like)': {
    pressureBar: 1.45,
    albedo: 0.22,
    gases: { N2: 0.942, CH4: 0.056, H2: 0.002 },
  },
  'Ammonia-Water (Reducing)': {
    pressureBar: 2.4,
    albedo: 0.38,
    gases: { N2: 0.68, NH3: 0.18, CH4: 0.08, H2O: 0.04, H2: 0.02 },
  },
  'Sulfur Dioxide & Volcanic': {
    pressureBar: 1.8,
    albedo: 0.42,
    gases: { SO2: 0.58, CO2: 0.3, N2: 0.08, H2S: 0.04 },
  },
  'Supercritical Steam-CO2 Envelope': {
    pressureBar: 260.0,
    albedo: 0.62,
    gases: { H2O: 0.72, CO2: 0.22, N2: 0.06 },
  },
  'Silicate & Alkali Rock-Vapor Exosphere': {
    pressureBar: 0.08,
    albedo: 0.08,
    gases: { SiO: 0.48, O2: 0.25, Na_K: 0.22, Fe_Mg: 0.05 },
  },
};

export function isNoOceanSolvent(solvent?: string | null): boolean {
  if (!solvent) return true;
  const s = solvent.trim().toLowerCase();
  return s === '' || s === 'none' || s.startsWith('none ') || s.includes('no ocean');
}

/**
 * Ensures gas fractions are stored in 0..1 range (converts 0..100 percentages if present)
 */
export function ensureNormalizedGasRecord(
  gases?: Record<string, number> | null
): Record<string, number> {
  if (!gases) return {};
  const entries = Object.entries(gases).filter(
    ([k, v]) => k.trim() !== '' && typeof v === 'number' && !Number.isNaN(v) && v >= 0
  );
  if (entries.length === 0) return {};
  const maxVal = Math.max(...entries.map(([, v]) => v));
  const sumVal = entries.reduce((acc, [, v]) => acc + v, 0);
  // If values were stored as percentages (e.g. 78.08 instead of 0.7808), convert to 0..1
  const scale = maxVal > 1.001 || sumVal > 1.5 ? 0.01 : 1.0;
  const out: Record<string, number> = {};
  for (const [k, v] of entries) {
    out[k] = +(v * scale).toFixed(5);
  }
  return out;
}

/**
 * Normalizes a gas dictionary so all positive fractions sum to 1.0 (100%)
 */
export function normalizeGasesTo100(
  gases: Record<string, number>
): Record<string, number> {
  const clean = ensureNormalizedGasRecord(gases);
  const keys = Object.keys(clean);
  if (keys.length === 0) return {};
  const total = keys.reduce((acc, k) => acc + Math.max(0, clean[k]), 0);
  if (total <= 0) return clean;
  const out: Record<string, number> = {};
  for (const k of keys) {
    out[k] = +(Math.max(0, clean[k]) / total).toFixed(4);
  }
  return out;
}

/**
 * Radiative-convective greenhouse warming ΔT (K) from total surface pressure (bar),
 * volume gas fractions (0..1), equilibrium temperature Teq (K), and surface gravity (g).
 */
export function computeGreenhouseWarming(
  pressureBar: number | null | undefined,
  gases: Record<string, number> | null | undefined,
  Teq = 255,
  grav = 1.0
): number {
  const pTot = pressureBar ?? 0;
  if (pTot <= 0.0001) return 0;

  const normGases = ensureNormalizedGasRecord(gases);
  const pCO2 = pTot * (normGases.CO2 ?? 0);
  const pN2 = pTot * (normGases.N2 ?? 0);
  const pH2 = pTot * (normGases.H2 ?? 0);
  const pCH4 = pTot * (normGases.CH4 ?? 0);
  const pH2O = pTot * (normGases.H2O ?? 0.004);
  const pNH3 = pTot * (normGases.NH3 ?? 0);
  const pSO2 = pTot * (normGases.SO2 ?? 0);

  const pActive = Math.max(1e-5, pTot);
  const gFactor = Math.pow(1.0 / Math.max(0.08, Math.min(4.0, grav)), 0.16);
  const pBroad = Math.min(1.0, Math.pow(pActive / 0.035, 0.42));
  const ciaBroad = Math.pow(Math.max(0.05, pActive) / Math.max(0.05, pCO2), 0.12);

  const bandCO2 = pCO2 > 0 ? 3.8 * Math.log(1 + (pCO2 * gFactor) / 0.00012) * pBroad : 0;
  const bandH2O = pH2O > 0 ? 9.2 * Math.log(1 + (pH2O * gFactor) / 0.001) * pBroad : 0;
  const bandCH4 = pCH4 > 0 ? 5.2 * Math.log(1 + (pCH4 * gFactor) / 0.002) * pBroad : 0;
  const bandNH3 = pNH3 > 0 ? 8.5 * Math.log(1 + (pNH3 * gFactor) / 0.0008) * pBroad : 0;
  const bandSO2 = pSO2 > 0 ? 6.8 * Math.log(1 + (pSO2 * gFactor) / 0.001) * pBroad : 0;

  const bandOverlap = Math.pow(
    Math.pow(bandCO2, 1.4) +
      Math.pow(bandH2O, 1.4) +
      Math.pow(bandCH4, 1.4) +
      Math.pow(bandNH3, 1.4) +
      Math.pow(bandSO2, 1.4),
    1 / 1.4
  );

  const contCO2 = pCO2 > 0 ? 13.5 * Math.pow(pCO2 * gFactor, 0.75) * ciaBroad : 0;
  const contH2O = pH2O > 0 ? 22.0 * Math.pow(pH2O * gFactor, 0.58) : 0;
  const ciaH2 =
    pH2 > 0
      ? 38.0 * Math.pow(pH2 * gFactor, 0.65) * Math.pow(1 + 0.35 * pN2 + 0.5 * pCO2, 0.2)
      : 0;
  const ciaN2 = pN2 >= 0.5 ? 2.4 * Math.pow(pN2 * gFactor, 0.8) : 0;

  const tempScale = Math.max(0.58, Math.min(1.28, Math.pow(Math.max(50, Teq) / 255.0, 0.32)));
  const rawGH = (bandOverlap + contCO2 + contH2O + ciaH2 + ciaN2) * tempScale;
  return +Math.max(0, Math.min(720, rawGH)).toFixed(1);
}

/**
 * Formats a luminosity float cleanly without 16-digit floating point noise
 */
export function formatCleanNumber(val: number, maxSigFigs = 4): number {
  if (!Number.isFinite(val) || val === 0) return 0;
  if (Math.abs(val) >= 100) return +val.toFixed(1);
  if (Math.abs(val) >= 1) return +val.toFixed(3);
  return +val.toPrecision(maxSigFigs);
}

/**
 * Infers approximate main-sequence mass (M_sun) and Teff (K) from a spectral type string (e.g. "K2V", "B5III", "G2V")
 */
export function inferStarFromSpectralClass(
  spectralType: string,
  category?: string
): { mass: number; teff: number; radius?: number; lum?: number } | null {
  const sp = (spectralType || '').trim().toUpperCase();
  if (!sp) return null;

  if (sp.includes('BH') || category?.includes('Black Hole')) {
    return { mass: 8.5, teff: 25000, radius: 0.0001, lum: 0.0001 };
  }
  if (sp.includes('NS') || sp.includes('PSR') || category?.includes('Neutron')) {
    return { mass: 1.45, teff: 60000, radius: 0.00002, lum: 0.001 };
  }
  if (sp.includes('WD') || sp.startsWith('D') || category?.includes('White Dwarf')) {
    return { mass: 0.62, teff: 12500, radius: 0.012, lum: 0.003 };
  }

  // Match letter O, B, A, F, G, K, M, L, T, Y + digit 0-9
  const match = sp.match(/^([OBAFGKMLTY])\s*(\d(?:\.\d)?)?/);
  if (!match) return null;

  const letter = match[1];
  const sub = match[2] !== undefined ? parseFloat(match[2]) : 5;
  const frac = Math.max(0, Math.min(9.9, sub)) / 10;

  const letterRanges: Record<
    string,
    { mMax: number; mMin: number; tMax: number; tMin: number }
  > = {
    O: { mMax: 45.0, mMin: 16.0, tMax: 46000, tMin: 30000 },
    B: { mMax: 15.5, mMin: 2.1, tMax: 29500, tMin: 10000 },
    A: { mMax: 2.05, mMin: 1.4, tMax: 9800, tMin: 7400 },
    F: { mMax: 1.38, mMin: 1.05, tMax: 7350, tMin: 6000 },
    G: { mMax: 1.04, mMin: 0.82, tMax: 5950, tMin: 5250 },
    K: { mMax: 0.81, mMin: 0.48, tMax: 5200, tMin: 3900 },
    M: { mMax: 0.47, mMin: 0.08, tMax: 3850, tMin: 2350 },
    L: { mMax: 0.075, mMin: 0.05, tMax: 2200, tMin: 1350 },
    T: { mMax: 0.048, mMin: 0.025, tMax: 1300, tMin: 600 },
    Y: { mMax: 0.024, mMin: 0.012, tMax: 550, tMin: 300 },
  };

  const range = letterRanges[letter];
  if (!range) return null;

  const teff = Math.round(range.tMax - frac * (range.tMax - range.tMin));
  const mass = +(range.mMax * Math.pow(range.mMin / range.mMax, frac)).toFixed(3);

  // Check MK_TEFF_GRID for exact subtype match if available
  const exactKey = `${letter}${Math.floor(sub)}`;
  const gridHit = MK_TEFF_GRID.find((g) => g.class === exactKey);
  const resolvedTeff = gridHit ? gridHit.teff : teff;

  return { mass, teff: resolvedTeff };
}

export interface StarBlankFieldFlags {
  spectralTypeBlank?: boolean;
  massBlank?: boolean;
  radiusBlank?: boolean;
  teffBlank?: boolean;
  lumBlank?: boolean;
}

/**
 * Auto-fills ONLY the blank/missing fields of a star while preserving any values
 * explicitly entered by the user. Uses Stefan-Boltzmann (L = R^2 * (T/5778)^4)
 * and stellar evolution models (`getStarStats`) as fallback.
 */
export function autoFillBlankStarFields(
  star: RealisticStarNode,
  sysAge: number,
  sysFeh: number,
  blankFlags: StarBlankFieldFlags = {}
): RealisticStarNode {
  const updated: RealisticStarNode = { ...star };

  const isSpBlank =
    blankFlags.spectralTypeBlank || !updated.spectralType || updated.spectralType.trim() === '';
  const isMassBlank =
    blankFlags.massBlank || !Number.isFinite(updated.mass) || updated.mass <= 0;
  const isRadBlank =
    blankFlags.radiusBlank || !Number.isFinite(updated.radius) || updated.radius <= 0;
  const isTeffBlank =
    blankFlags.teffBlank || !Number.isFinite(updated.Teff) || updated.Teff <= 0;
  const isLumBlank =
    blankFlags.lumBlank ||
    typeof updated.lumNum !== 'number' ||
    !Number.isFinite(updated.lumNum) ||
    updated.lumNum <= 0;

  // 1. Resolve Mass if blank
  let mass = updated.mass;
  const spInferred = !isSpBlank
    ? inferStarFromSpectralClass(updated.spectralType, updated.category)
    : null;

  if (isMassBlank) {
    if (spInferred) {
      mass = spInferred.mass;
    } else if (!isLumBlank && updated.lumNum > 0) {
      // Mass-luminosity relation M ~ L^(1/3.8)
      mass = +Math.max(0.08, Math.min(80, Math.pow(updated.lumNum, 1 / 3.8))).toFixed(3);
    } else if (!isTeffBlank && updated.Teff > 0) {
      // Approximate MS mass from Teff
      mass = +Math.max(0.08, Math.min(60, Math.pow(updated.Teff / 5778, 1.8))).toFixed(3);
    } else {
      mass = 1.0;
    }
    updated.mass = mass;
  }

  // Compute evolutionary baseline for fallback
  const baseline = getStarStats(Math.max(0.015, updated.mass), sysAge, sysFeh, updated.label || 'A');

  // 2. Resolve Teff if blank
  if (isTeffBlank) {
    if (!isLumBlank && !isRadBlank && updated.lumNum > 0 && updated.radius > 0) {
      updated.Teff = Math.round(5778 * Math.pow(updated.lumNum / (updated.radius * updated.radius), 0.25));
    } else if (spInferred) {
      updated.Teff = spInferred.teff;
    } else {
      updated.Teff = baseline.Teff;
    }
  }

  // 3. Resolve Radius & Luminosity if either or both are blank
  if (isRadBlank && !isLumBlank) {
    // R = sqrt(L) * (5778 / Teff)^2
    const r = Math.sqrt(updated.lumNum) * Math.pow(5778 / Math.max(300, updated.Teff), 2);
    updated.radius = formatCleanNumber(Math.max(0.00001, r), 4);
  } else if (isLumBlank && !isRadBlank) {
    // L = R^2 * (Teff / 5778)^4
    const l =
      updated.radius * updated.radius * Math.pow(Math.max(300, updated.Teff) / 5778, 4);
    updated.lumNum = formatCleanNumber(Math.max(1e-6, l), 4);
    updated.lum = updated.lumNum;
  } else if (isRadBlank && isLumBlank) {
    updated.radius = formatCleanNumber(baseline.radius, 4);
    const l =
      updated.radius * updated.radius * Math.pow(Math.max(300, updated.Teff) / 5778, 4);
    updated.lumNum = formatCleanNumber(
      !isTeffBlank ? l : baseline.lumNum,
      4
    );
    updated.lum = updated.lumNum;
  } else {
    updated.radius = formatCleanNumber(updated.radius, 4);
    updated.lumNum = formatCleanNumber(updated.lumNum, 4);
    updated.lum = updated.lumNum;
  }

  // 4. Resolve Spectral Class if blank
  if (isSpBlank) {
    if (!isMassBlank && isTeffBlank && isRadBlank && isLumBlank) {
      updated.spectralType = baseline.spectralType;
      updated.category = baseline.category;
    } else {
      const mk = deriveMorganKeenanClass(
        updated.Teff,
        Math.log10(Math.max(1e-6, updated.lumNum)),
        updated.radius,
        updated.category || baseline.category
      );
      updated.spectralType = mk.full.split(' ')[0];
    }
  }

  // 5. Update surface gravity logg & colorHex
  updated.logg = +(
    4.438 +
    Math.log10(Math.max(0.01, updated.mass)) -
    2.0 * Math.log10(Math.max(1e-5, updated.radius))
  ).toFixed(2);
  updated.colorHex = teffToHex(updated.Teff);

  return updated;
}

/**
 * Full stellar auto-calculation from Mass, System Age, and Metallicity [Fe/H]
 */
export function autoCalculateStarFromMassAge(
  star: RealisticStarNode,
  sysAge: number,
  sysFeh: number
): RealisticStarNode {
  const currentMass = Math.max(0.015, star.mass || 1.0);
  const computed = getStarStats(currentMass, sysAge, sysFeh, star.label || 'A');
  return {
    ...star,
    mass: +currentMass.toFixed(3),
    radius: formatCleanNumber(computed.radius, 4),
    Teff: Math.round(computed.Teff),
    lumNum: formatCleanNumber(computed.lumNum, 4),
    lum: formatCleanNumber(computed.lumNum, 4),
    logg: +computed.logg.toFixed(2),
    spectralType: computed.spectralType,
    category: computed.category,
    colorHex: computed.colorHex,
  };
}

export interface PlanetBlankFieldFlags {
  aBlank?: boolean;
  eBlank?: boolean;
  periodBlank?: boolean;
  incBlank?: boolean;
  rotBlank?: boolean;
  tiltBlank?: boolean;
  massBlank?: boolean;
  radiusBlank?: boolean;
  gravityBlank?: boolean;
  densityBlank?: boolean;
  rockBlank?: boolean;
  iceBlank?: boolean;
  gasBlank?: boolean;
  pressureBlank?: boolean;
  albedoBlank?: boolean;
  teqBlank?: boolean;
  ghBlank?: boolean;
  tsurfBlank?: boolean;
}

/**
 * Auto-fills ONLY blank fields of a planet while keeping all non-blank fields intact.
 */
export function autoFillBlankPlanetFields(
  planet: RealisticPlanetBody,
  hostStarMass: number,
  hostStarLum: number,
  blankFlags: PlanetBlankFieldFlags = {}
): RealisticPlanetBody {
  const p: RealisticPlanetBody = JSON.parse(JSON.stringify(planet));
  p.gases = ensureNormalizedGasRecord(p.gases);

  const isABlank = blankFlags.aBlank || !Number.isFinite(p.a) || p.a <= 0;
  const isPeriodBlank =
    blankFlags.periodBlank || !Number.isFinite(p.orbitalPeriodDays) || p.orbitalPeriodDays <= 0;

  if (isABlank && !isPeriodBlank) {
    p.a = +Math.pow(
      Math.pow(p.orbitalPeriodDays / 365.25, 2) * Math.max(0.05, hostStarMass),
      1 / 3
    ).toFixed(3);
  } else if (isABlank) {
    p.a = 1.0;
  }

  if (isPeriodBlank) {
    p.orbitalPeriodDays = +(
      365.25 * Math.sqrt(Math.pow(p.a, 3) / Math.max(0.05, hostStarMass))
    ).toFixed(1);
  }

  if (blankFlags.eBlank || !Number.isFinite(p.e) || p.e < 0) p.e = 0.02;
  if (blankFlags.incBlank || !Number.isFinite(p.incDeg) || p.incDeg < 0) p.incDeg = 1.2;
  if (blankFlags.rotBlank || !Number.isFinite(p.rotationHours) || p.rotationHours <= 0) {
    p.rotationHours = 24.0;
  }
  if (blankFlags.tiltBlank || !Number.isFinite(p.axialTiltDeg) || p.axialTiltDeg < 0) {
    p.axialTiltDeg = 23.4;
  }

  // Composition fractions
  const isRockBlank = blankFlags.rockBlank || !Number.isFinite(p.rockFrac);
  const isIceBlank = blankFlags.iceBlank || !Number.isFinite(p.iceFrac);
  const isGasBlank = blankFlags.gasBlank || !Number.isFinite(p.gasFrac);
  if (isRockBlank && isIceBlank && isGasBlank) {
    p.rockFrac = 0.7;
    p.iceFrac = 0.3;
    p.gasFrac = 0.0;
  } else {
    if (isRockBlank) p.rockFrac = Math.max(0, +(1 - (p.iceFrac || 0) - (p.gasFrac || 0)).toFixed(3));
    if (isIceBlank) p.iceFrac = Math.max(0, +(1 - (p.rockFrac || 0) - (p.gasFrac || 0)).toFixed(3));
    if (isGasBlank) p.gasFrac = Math.max(0, +(1 - (p.rockFrac || 0) - (p.iceFrac || 0)).toFixed(3));
  }

  // Mass, Radius, Gravity, Density
  const isMassBlank = blankFlags.massBlank || !Number.isFinite(p.massEarth) || p.massEarth <= 0;
  const isRadBlank = blankFlags.radiusBlank || !Number.isFinite(p.radiusEarth) || p.radiusEarth <= 0;
  const isGravBlank = blankFlags.gravityBlank || !Number.isFinite(p.gravityG) || p.gravityG <= 0;
  const isDensBlank = blankFlags.densityBlank || !Number.isFinite(p.densityGcm3) || p.densityGcm3 <= 0;

  if (isMassBlank) {
    if (!isRadBlank && !isGravBlank) {
      p.massEarth = +(p.gravityG * p.radiusEarth * p.radiusEarth).toFixed(3);
    } else if (!isRadBlank && !isDensBlank) {
      p.massEarth = +((p.densityGcm3 / 5.514) * Math.pow(p.radiusEarth, 3)).toFixed(3);
    } else if (!isRadBlank) {
      p.massEarth = +Math.pow(p.radiusEarth, 3.5).toFixed(3);
    } else {
      p.massEarth = 1.0;
    }
  }
  p.massJup = +(p.massEarth / 317.83).toFixed(5);

  if (isRadBlank) {
    if (!isDensBlank && p.densityGcm3 > 0) {
      p.radiusEarth = +Math.pow((5.514 * p.massEarth) / p.densityGcm3, 1 / 3).toFixed(3);
    } else if (!isGravBlank && p.gravityG > 0) {
      p.radiusEarth = +Math.sqrt(p.massEarth / p.gravityG).toFixed(3);
    } else {
      const cIce = p.iceFrac / Math.max(1e-4, p.rockFrac + p.iceFrac);
      const rCore = Math.pow(p.massEarth * (1 - p.gasFrac), 0.279) * (0.98 * (1 - cIce) + 1.19 * cIce);
      p.radiusEarth = +(
        p.gasFrac > 0.01
          ? rCore * (1 + 1.85 * Math.pow(p.gasFrac, 0.55))
          : Math.max(0.08, rCore)
      ).toFixed(3);
    }
  }

  if (isGravBlank) {
    p.gravityG = +(p.massEarth / (p.radiusEarth * p.radiusEarth)).toFixed(3);
  }
  if (isDensBlank) {
    p.densityGcm3 = +((5.514 * p.massEarth) / Math.pow(p.radiusEarth, 3)).toFixed(2);
  }

  // Climate & Temperatures
  if (blankFlags.albedoBlank || !Number.isFinite(p.albedo) || p.albedo < 0 || p.albedo >= 1) {
    p.albedo = 0.3;
  }
  if (blankFlags.pressureBlank || p.pressureBar === undefined || Number.isNaN(p.pressureBar as number)) {
    p.pressureBar = p.atmosphereType?.includes('Vacuum') ? 0 : 1.0;
  }

  const computedTeq = Math.round(
    278.5 * (Math.pow(Math.max(1e-5, hostStarLum), 0.25) / Math.sqrt(p.a)) * Math.pow(1 - p.albedo, 0.25)
  );
  if (blankFlags.teqBlank || !Number.isFinite(p.T_eq) || p.T_eq <= 0) {
    p.T_eq = computedTeq;
  }

  const isGhBlank = blankFlags.ghBlank || !Number.isFinite(p.greenhouseK) || p.greenhouseK < 0;
  const isTsurfBlank = blankFlags.tsurfBlank || !Number.isFinite(p.surfaceTempK) || p.surfaceTempK <= 0;

  if (isGhBlank && !isTsurfBlank) {
    p.greenhouseK = Math.max(0, +(p.surfaceTempK - p.T_eq).toFixed(1));
  } else if (isGhBlank) {
    p.greenhouseK = computeGreenhouseWarming(p.pressureBar, p.gases, p.T_eq, p.gravityG);
  }

  if (isTsurfBlank) {
    p.surfaceTempK = +(p.T_eq + p.greenhouseK).toFixed(1);
  }
  p.T_atm = p.T_eq;

  return p;
}

/**
 * Full planet physics & radiative-convective climate recalculation from orbital distance,
 * mass, radius, albedo, surface pressure, and gas composition.
 */
export function autoCalculatePlanetPhysics(
  planet: RealisticPlanetBody,
  hostStarMass: number,
  hostStarLum: number
): RealisticPlanetBody {
  const p: RealisticPlanetBody = JSON.parse(JSON.stringify(planet));
  p.gases = ensureNormalizedGasRecord(p.gases);

  const a = Math.max(0.005, p.a || 1.0);
  const mEarth = Math.max(0.0005, p.massEarth || 1.0);
  const rEarth = Math.max(0.02, p.radiusEarth || 1.0);
  const albedo = Math.max(0, Math.min(0.95, p.albedo ?? 0.3));

  p.a = a;
  p.massEarth = mEarth;
  p.massJup = +(mEarth / 317.83).toFixed(5);
  p.radiusEarth = rEarth;
  p.gravityG = +(mEarth / (rEarth * rEarth)).toFixed(3);
  p.densityGcm3 = +((5.514 * mEarth) / Math.pow(rEarth, 3)).toFixed(2);
  p.orbitalPeriodDays = +(
    365.25 * Math.sqrt(Math.pow(a, 3) / Math.max(0.05, hostStarMass))
  ).toFixed(1);

  const Teq = Math.round(
    278.5 * (Math.pow(Math.max(1e-5, hostStarLum), 0.25) / Math.sqrt(a)) * Math.pow(1 - albedo, 0.25)
  );
  p.T_eq = Teq;
  p.T_atm = Teq;

  const hasCustomGases = Object.keys(p.gases).length > 0;
  const gh = hasCustomGases
    ? computeGreenhouseWarming(p.pressureBar, p.gases, Teq, p.gravityG)
    : p.pressureBar
    ? +(p.pressureBar * 12).toFixed(1)
    : 0;

  p.greenhouseK = gh;
  p.surfaceTempK = Math.max(3, +(Teq + gh).toFixed(1));

  // Also update resolved planet class if rocky/terrestrial
  const isGasGiant =
    p.gasFrac >= 0.05 ||
    p.massEarth >= 15 ||
    p.planetClass.includes('Giant') ||
    p.planetClass.includes('Jupiter') ||
    p.planetClass.includes('Neptune');
  p.planetClass = resolvePlanetClass(
    p.planetClass,
    p.surfaceTempK,
    p.hydrosphere,
    p.massEarth,
    p.iceFrac,
    false,
    isGasGiant,
    p.pressureBar,
    p.gases
  );

  if (hasCustomGases || (p.pressureBar ?? 0) === 0) {
    p.atmosphereType = deriveAtmosphereClassification(
      p.pressureBar,
      p.gases,
      isGasGiant,
      p.planetClass.includes('Supercritical')
    );
  }

  return p;
}

/**
 * Full moon physics recalculation
 */
export function autoCalculateMoonPhysics(
  moon: RealisticMoon,
  hostPlanet: RealisticPlanetBody,
  hostStarLum: number
): RealisticMoon {
  const m: RealisticMoon = JSON.parse(JSON.stringify(moon));
  m.gases = ensureNormalizedGasRecord(m.gases);

  const aRp = Math.max(1.5, m.a_Rp || 10);
  const pRadKm = (hostPlanet.radiusEarth || 1.0) * 6371;
  m.a_km = Math.round(aRp * pRadKm);

  // Keplerian period around planet: P = 2*pi * sqrt(a^3 / (G * M_p))
  const GM_planet = 3.986004418e5 * Math.max(0.001, hostPlanet.massEarth || 1.0); // km^3 / s^2
  const periodSec = 2 * Math.PI * Math.sqrt(Math.pow(m.a_km, 3) / GM_planet);
  m.periodDays = +(periodSec / 86400).toFixed(2);

  const mEarth = Math.max(0.00001, m.massEarth || (m.massLunar || 1.0) * 0.0123);
  const rEarth = Math.max(0.01, m.radiusEarth || 0.272);
  m.massEarth = +mEarth.toFixed(5);
  m.massLunar = +(mEarth / 0.0123).toFixed(3);
  m.radiusEarth = +rEarth.toFixed(3);
  m.radiusKm = Math.round(rEarth * 6371);
  m.gravityG = +(mEarth / (rEarth * rEarth)).toFixed(3);
  m.densityGcm3 = +((5.514 * mEarth) / Math.pow(rEarth, 3)).toFixed(2);

  const aAU = Math.max(0.01, hostPlanet.a || 1.0);
  const alb = Math.max(0, Math.min(0.95, m.albedo ?? 0.2));
  const Teq = Math.round(
    278.5 * (Math.pow(Math.max(1e-5, hostStarLum), 0.25) / Math.sqrt(aAU)) * Math.pow(1 - alb, 0.25)
  );
  m.T_eq = Teq;
  m.T_atm = Teq;
  const gh = computeGreenhouseWarming(m.pressureBar, m.gases, Teq, m.gravityG);
  m.greenhouseK = gh;
  m.surfaceTempK = Math.max(3, +(Teq + gh).toFixed(1));
  m.moonClass = resolveMoonClass(
    m.moonClass,
    m.surfaceTempK,
    m.hydrosphere,
    m.iceFrac,
    m.massEarth,
    m.pressureBar,
    m.gases
  );
  return m;
}
