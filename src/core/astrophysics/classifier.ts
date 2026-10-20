import { MorganKeenanResult, RealisticHydrosphere } from '../../types/astrophysics';

/**
 * Morgan-Keenan spectral classification scale (Mamajek 2022 dwarf scale)
 */
export const MK_TEFF_GRID = [
  { class: 'O2', teff: 48000 },
  { class: 'O3', teff: 44000 },
  { class: 'O5', teff: 40000 },
  { class: 'O8', teff: 35000 },
  { class: 'B0', teff: 31400 },
  { class: 'B2', teff: 22000 },
  { class: 'B5', teff: 15700 },
  { class: 'B8', teff: 12500 },
  { class: 'A0', teff: 9700 },
  { class: 'A2', teff: 9000 },
  { class: 'A5', teff: 8180 },
  { class: 'A7', teff: 7850 },
  { class: 'F0', teff: 7280 },
  { class: 'F2', teff: 7000 },
  { class: 'F5', teff: 6510 },
  { class: 'F6', teff: 6350 },
  { class: 'F8', teff: 6170 },
  { class: 'G0', teff: 5930 },
  { class: 'G1', teff: 5860 },
  { class: 'G2', teff: 5770 },
  { class: 'G5', teff: 5660 },
  { class: 'G8', teff: 5440 },
  { class: 'K0', teff: 5280 },
  { class: 'K2', teff: 5040 },
  { class: 'K3', teff: 4840 },
  { class: 'K5', teff: 4450 },
  { class: 'K7', teff: 4050 },
  { class: 'M0', teff: 3850 },
  { class: 'M1', teff: 3700 },
  { class: 'M2', teff: 3550 },
  { class: 'M3', teff: 3410 },
  { class: 'M4', teff: 3200 },
  { class: 'M5', teff: 3030 },
  { class: 'M6', teff: 2800 },
  { class: 'M7', teff: 2600 },
  { class: 'M8', teff: 2500 },
  { class: 'M9', teff: 2300 },
];

/**
 * PURE FUNCTION: Derives Morgan-Keenan Spectral Class & Yerkes Luminosity Class
 * Strictly from instantaneous Teff, log10(L), and Stefan-Boltzmann radius R*.
 * Example: 5870 K with R=1.48 Rsun evaluates strictly to G0IV-V or G1IV, NEVER F6V.
 */
export function deriveMorganKeenanClass(
  Teff: number,
  logL: number,
  radiusRsun: number,
  phase: string
): MorganKeenanResult {
  if (phase.includes('Black Hole')) {
    return { full: 'BH (Singularity)', sub: 'Stellar-Mass Black Hole', pillColor: '#000000' };
  }
  if (phase.includes('Neutron Star')) {
    return { full: 'NS (Degenerate)', sub: 'Pulsar / Neutron Star', pillColor: '#e0f2fe' };
  }
  if (phase.includes('White Dwarf')) {
    return { full: 'DA/DB VII', sub: 'Degenerate White Dwarf', pillColor: '#f0f9ff' };
  }

  // 1. Spectral Type from Teff
  let subtype = 'M9';
  if (Teff >= MK_TEFF_GRID[0].teff) {
    subtype = 'O2';
  } else {
    for (let i = 0; i < MK_TEFF_GRID.length - 1; i++) {
      const upper = MK_TEFF_GRID[i];
      const lower = MK_TEFF_GRID[i + 1];
      if (Teff <= upper.teff && Teff >= lower.teff) {
        const mid = (upper.teff + lower.teff) / 2;
        subtype = Teff >= mid ? upper.class : lower.class;
        break;
      }
    }
  }

  // 2. Luminosity Class via Yerkes classification from log(L) & R*
  let lumClass = 'V';
  if (radiusRsun > 120 || logL > 4.8) {
    lumClass = logL > 5.2 ? 'Ia' : 'Ib'; // Supergiant
  } else if (radiusRsun > 40 || (logL > 3.2 && Teff < 5000)) {
    lumClass = 'II'; // Bright Giant
  } else if (radiusRsun > 8.0 || (logL > 1.8 && Teff < 5200)) {
    lumClass = 'III'; // Giant
  } else if (radiusRsun > 1.35 || (logL > 0.4 && Teff < 6200 && phase.includes('Subgiant'))) {
    lumClass = radiusRsun > 1.7 ? 'IV' : 'IV-V'; // Subgiant / Evolving Dwarf
  } else if (radiusRsun < 0.6 && Teff < 4000) {
    lumClass = 'V'; // Main Sequence M/K dwarf
  }

  const fullClass = `${subtype}${lumClass}`;
  let descriptive = `${fullClass} Star`;
  if (lumClass.includes('IV')) descriptive = `${subtype} Subgiant / Evolving Dwarf`;
  else if (lumClass === 'III') descriptive = `${subtype} Giant`;
  else if (lumClass === 'V') descriptive = `${subtype} Main Sequence Dwarf`;
  else if (lumClass.includes('I')) descriptive = `${subtype} Supergiant`;

  return { full: fullClass, sub: descriptive };
}

export type ThermalRegime =
  | 'Frozen'
  | 'Cold'
  | 'Temperate'
  | 'Warm'
  | 'Hot'
  | 'Molten/Scorched';

/**
 * Standard thermal classification bands:
 * - < 150 K: Frozen
 * - 150 - 250 K: Cold
 * - 250 - 350 K: Temperate
 * - 350 - 500 K: Warm
 * - 500 - 800 K: Hot
 * - > 800 K: Molten/Scorched
 */
export function getThermalRegime(T: number): ThermalRegime {
  if (T > 800) return 'Molten/Scorched';
  if (T >= 500) return 'Hot';
  if (T > 350) return 'Warm';
  if (T >= 250) return 'Temperate';
  if (T >= 150) return 'Cold';
  return 'Frozen';
}

/**
 * Maps hydrosphere solvent strings to canonical chemical names:
 * e.g. H2O -> Water, NH3-H2O -> Ammonia, SO2 -> SO2, etc.
 */
export function getOceanChemicalName(solvent?: string | null): string {
  if (!solvent) return 'Aqueous';
  const s = solvent.toLowerCase();
  if (s.includes('supercritical')) return 'Supercritical Aqueous';
  if (s.includes('brine') || s.includes('perchlorate') || s.includes('nacl')) return 'Aqueous';
  if (s.includes('nh3') || s.includes('ammonia')) return 'Ammonia';
  if (s.includes('ch4') || s.includes('c2h6') || s.includes('hydrocarbon') || s.includes('methane')) return 'Methane';
  if (s.includes('h2so4') || s.includes('sulfuric')) return 'Sulfuric Acid';
  if (s.includes('so2')) return 'SO2';
  if (s.includes('co2')) return 'CO2';
  if (s.includes('magma') || s.includes('silicate') || s.includes('lava')) return 'Magma';
  if (s.includes('h2o') || s.includes('water')) return 'Aqueous';
  return solvent;
}

export function formatSolventName(solvent?: string | null): string {
  if (!solvent) return 'None';
  const s = solvent.toLowerCase();
  if (s.includes('perchlorate')) return 'Brine Water (H2O + Perchlorates)';
  if (s.includes('brine') || s.includes('nacl') || s.includes('mgso4')) return 'Brine Water (H2O + Salts)';
  if (s.includes('nh3') || s.includes('ammonia')) return 'Ammonia';
  if (s.includes('ch4') || s.includes('c2h6') || s.includes('hydrocarbon') || s.includes('methane')) return 'Methane';
  if (s.includes('h2so4') || s.includes('sulfuric')) return 'Sulfuric Acid';
  if (s.includes('so2') || s.includes('sulfurous')) return 'SO2';
  if (s.includes('co2') || s.includes('carbonic')) return 'CO2';
  if (s.includes('magma') || s.includes('silicate') || s.includes('lava') || s.includes('volcanic')) return 'Magma';
  if (s.includes('supercritical')) return 'Supercritical Water';
  if (s.includes('h2o') || s.includes('water') || s.includes('aqueous') || s.includes('aquatic')) return 'Water';
  return solvent;
}

const GAS_CRITICAL_PRESSURES: Record<string, number> = {
  CO2: 73.8,
  H2O: 220.6,
  SO2: 78.8,
  NH3: 113.3,
  CH4: 46.0,
  N2: 33.9,
  O2: 50.4,
  H2: 13.0,
  He: 2.27,
  H2SO4: 80.0,
};

/**
 * Derives atmosphere type according to user rule:
 * - pressure < 0.5 = "Thin"
 * - pressure > 5 = "Thick"
 * - pressure exceeds critical point of dominant gas (e.g. 78 bars for CO2) = "Supercritical"
 * - anywhere in between 0.5 and 5 = "Moderate"
 * - name the one or two most prominent chemicals in the atmosphere
 * - suffix: "Atmosphere"
 */
export function deriveAtmosphereClassification(
  pressureBar: number | null | undefined,
  gases?: Record<string, number> | null,
  isGasGiant = false,
  isSupercritical = false
): string {
  if (isGasGiant) {
    if (gases?.CH4_NH3_H2O || gases?.CH4) return 'Primary Neptunian Envelope';
    return 'Primary Jovian Envelope';
  }
  if (
    isSupercritical ||
    (gases?.H2O && gases.H2O >= 0.4 && (pressureBar === null || (pressureBar ?? 0) >= 200))
  ) {
    const dominant = gases?.CO2 && gases.CO2 >= 0.15 ? 'H2O-CO2' : 'H2O';
    return `Supercritical ${dominant} Envelope`;
  }
  if (
    (pressureBar === null || pressureBar === undefined || pressureBar <= 0) &&
    (!gases || Object.keys(gases).length === 0)
  ) {
    return 'Vacuum';
  }
  if (pressureBar === null || pressureBar === undefined || pressureBar <= 0) {
    return 'Continuous Fluid Envelope';
  }

  // 1. Extract prominent chemicals
  let prominentChem = '';
  let dominantGas = '';
  if (gases) {
    const sorted = Object.entries(gases)
      .filter(([_, frac]) => frac >= 0.005)
      .sort((a, b) => b[1] - a[1]);

    if (sorted.length > 0) {
      dominantGas = sorted[0][0];
      if (sorted.length >= 2 && sorted[1][1] >= 0.08) {
        prominentChem = `${sorted[0][0]}-${sorted[1][0]}`;
      } else {
        prominentChem = sorted[0][0];
      }
    }
  }

  if (!prominentChem) {
    prominentChem = 'Gas';
  }

  // 2. Critical pressure of dominant gas (default ~75 bar if unknown)
  const pCrit = GAS_CRITICAL_PRESSURES[dominantGas] ?? 75.0;

  // 3. Pressure regime
  let regime = 'Moderate';
  if (pressureBar >= pCrit) {
    regime = 'Supercritical';
  } else if (pressureBar > 5.0) {
    regime = 'Thick';
  } else if (pressureBar < 0.5) {
    regime = 'Thin';
  } else {
    regime = 'Moderate';
  }

  return `${regime} ${prominentChem} Atmosphere`;
}

/**
 * Maps hydrosphere solvent strings to canonical hydrosphere adjective:
 * - aquatic for H2O
 * - carbonic for CO2
 * - sulfurous for SO2
 * - ammonia for NH3
 * - methane for CH4
 * - sulfuric for H2SO4
 * - volcanic for silicates / magma
 * - <empty> if no liquid
 */
export function getHydrosphereClass(solvent?: string | null): string {
  if (!solvent) return '';
  const s = solvent.toLowerCase();
  if (s.includes('nh3') || s.includes('ammonia')) {
    return 'Ammonia';
  }
  if (s.includes('ch4') || s.includes('c2h6') || s.includes('hydrocarbon') || s.includes('methane')) {
    return 'Methane';
  }
  if (s.includes('h2so4') || s.includes('sulfuric')) {
    return 'Sulfuric';
  }
  if (s.includes('so2') || s.includes('sulfurous')) {
    return 'Sulfurous';
  }
  if (s.includes('co2') || s.includes('carbonic')) {
    return 'Carbonic';
  }
  if (s.includes('magma') || s.includes('silicate') || s.includes('lava') || s.includes('volcanic')) {
    return 'Volcanic';
  }
  if (s.includes('h2o') || s.includes('water') || s.includes('aqueous') || s.includes('aquatic')) {
    return 'Aquatic';
  }
  return '';
}

/**
 * Universal classification system for rocky planets and moons:
 * <temperature class> (frozen, cold, temperate, hot, scorched)
 * [Greenhouse] (if thick CO2 atmosphere and not hot)
 * <hydrosphere class> (aquatic for H2O, carbonic for CO2, sulfurous for SO2, ammonia for NH3, methane for CH4, sulfuric for H2SO4, volcanic for silicates, <empty> if no liquid, or "airless" if no atmosphere)
 * <composition class> (rocky, icy, replaced with "ocean" if 100% liquid, or "molten" if temp > 800K)
 * + moon if orbiting planet, super-earth if > 2.5 earth masses, world for everything else
 *
 * Special rules:
 * - volcanic + molten is redundant (all molten worlds are volcanic, say "molten")
 * - frozen + icy is redundant (all frozen worlds are icy, say "frozen")
 * - thick CO2 atmosphere and hot and no hydrosphere = Venusian World / Super-Earth / Moon
 */
export function formatRockyBodyClass(
  T: number,
  hydro: RealisticHydrosphere | null | undefined,
  isMoon: boolean,
  massEarth = 1.0,
  iceFrac = 0.0,
  pressureBar?: number | null,
  gases?: Record<string, number> | null,
  fallbackClass = ''
): string {
  // 0. Supercritical Water World / Water Giant / Steam World check
  if (
    fallbackClass.includes('Supercritical') ||
    fallbackClass.includes('Water Giant') ||
    fallbackClass.includes('Steam World') ||
    fallbackClass.includes('Steam Moon') ||
    hydro?.solvent === 'Supercritical H2O' ||
    hydro?.state?.includes('Supercritical') ||
    (!isMoon && massEarth >= 0.25 && iceFrac >= 0.04 && T >= 310) ||
    (isMoon && massEarth >= 0.25 && iceFrac >= 0.05 && T >= 310)
  ) {
    if (isMoon) {
      return T > 500 ? 'Steam Moon' : 'Supercritical Water Moon';
    }
    if (massEarth >= 10) return 'Water Giant';
    if (T > 500) return 'Steam World';
    return 'Supercritical Water World';
  }

  // 1. Temperature Class (frozen, cold, temperate, hot, scorched)
  const temp = getThermalRegime(T);
  let tempClass = temp === 'Molten/Scorched' ? 'Scorched' : temp === 'Warm' ? 'Hot' : temp;

  // 2. Suffix: moon if orbiting planet, super-earth if > 2.5 earth masses, world for everything else
  let suffix = 'World';
  if (isMoon) {
    suffix = 'Moon';
  } else if (massEarth > 2.5) {
    suffix = 'Super-Earth';
  }

  // 3. Hydrosphere detection
  const stateLower = hydro?.state?.toLowerCase() ?? '';
  const solventLower = hydro?.solvent?.toLowerCase() ?? '';
  const hasLiquid = Boolean(
    hydro &&
    hydro.solvent &&
    hydro.solvent !== 'None' &&
    !solventLower.includes('subsurface') &&
    (hydro.coveragePct === undefined || hydro.coveragePct > 0) &&
    !(stateLower.includes('subsurface') && !stateLower.startsWith('surface')) &&
    !stateLower.includes('no surface')
  );

  const is100Pct = Boolean(
    hasLiquid &&
    (hydro?.coveragePct === 100 ||
     hydro?.state?.includes('100%') ||
     hydro?.state?.includes('Global Surface Liquid'))
  );

  // 4. Atmosphere checks
  // No atmosphere = airless (pBar is null, 0, or <= 0.001)
  const isAirless =
    pressureBar === null ||
    pressureBar === 0 ||
    (typeof pressureBar === 'number' && pressureBar <= 0.001) ||
    (pressureBar === undefined && (fallbackClass.includes('Airless') || fallbackClass.includes('Vacuum')));

  // Thick CO2 atmosphere (pressure >= 5.0 bar, CO2 dominant or >= 45%)
  const isThickCO2 = Boolean(
    (pressureBar !== null &&
     pressureBar !== undefined &&
     pressureBar >= 5.0 &&
     (gases?.CO2 ?? 0) >= 0.45) ||
    (pressureBar === undefined && (fallbackClass.includes('Venusian') || fallbackClass.includes('Dense CO2')))
  );

  const isHot = T >= 500;

  // Rule: thick CO2 atmosphere and hot and no hydrosphere = Venusian World / Super-Earth / Moon
  if (isThickCO2 && isHot && !hasLiquid) {
    return `Venusian ${suffix}`;
  }

  // Rule: thick CO2 atmosphere and not hot = Greenhouse (between temperature and hydrosphere in the template)
  const isGreenhouse = isThickCO2 && !isHot;

  // Hydrosphere class
  let hydroClass = '';
  if (hasLiquid) {
    hydroClass = getHydrosphereClass(hydro?.solvent);
  } else if (isAirless) {
    // Rule: no atmosphere = airless (in the hydrosphere section of the template)
    hydroClass = 'Airless';
  }

  // Composition class: ("terrestrial" for rocky planets, "rocky" for rocky moons, icy, replace with "ocean" if surface is 100% liquid or "molten" if temp > 800K)
  let compClass = '';
  if (T > 800) {
    compClass = 'Molten';
  } else if (is100Pct) {
    compClass = 'Ocean';
  } else {
    // Solid surface water ice cannot exist when T >= 273.15 K
    const isIcy =
      T < 273.15 &&
      (iceFrac >= 0.15 || fallbackClass.includes('Ice') || fallbackClass.includes('Icy'));
    compClass = isIcy ? 'Icy' : isMoon ? 'Rocky' : 'Terrestrial';
  }

  // Special redundancy rules:
  // 1. volcanic + molten is redundant (all molten worlds are volcanic, say "molten")
  if (compClass === 'Molten' && hydroClass === 'Volcanic') {
    hydroClass = '';
  }

  // 2. scorched + molten is redundant (all molten worlds are scorched / > 800K, say "molten")
  if (compClass === 'Molten' && tempClass === 'Scorched') {
    tempClass = '';
  }

  // 3. frozen + icy is redundant (all frozen worlds are icy, say "frozen")
  if (tempClass === 'Frozen' && compClass === 'Icy') {
    compClass = '';
  }

  // 4. methane and ammonia implies icy too, so icy is redundant;
  //    methane also implies frozen (< 150K), so "Methane Moon" / "Methane World" instead of "Frozen Methane Moon"
  if ((hydroClass === 'Methane' || hydroClass === 'Ammonia') && compClass === 'Icy') {
    compClass = '';
  }
  if (hydroClass === 'Methane' && tempClass === 'Frozen') {
    tempClass = '';
  }

  // Build the template: <temperature class> [Greenhouse] <hydrosphere class> <composition class> <suffix>
  const parts: string[] = [];
  if (tempClass) {
    parts.push(tempClass);
  }
  if (isGreenhouse) {
    parts.push('Greenhouse');
  }
  if (hydroClass) {
    parts.push(hydroClass);
  }
  if (compClass) {
    parts.push(compClass);
  }
  parts.push(suffix);

  return parts.join(' ');
}

/**
 * Resolves planet class systematically:
 * - Gas giants & sub-jovians retain their giant classifications
 * - All rocky planets follow the universal formula
 */
export function resolvePlanetClass(
  currentClass: string,
  T: number,
  hydro: RealisticHydrosphere | null,
  massEarth = 1,
  iceFrac = 0,
  _isChth = false,
  hasEnv = false,
  pressureBar?: number | null,
  gases?: Record<string, number> | null
): string {
  let c = currentClass.split('/')[0].replace(/\s*\([^)]*\)/g, '').trim();
  c = c.replace(/^Sudarsky\s+/i, '');

  // 1. Gas giants & Ice Giants retain their established classifications
  if (hasEnv || c.includes('Gas Giant') || c.includes('Hot Jupiter') || c.includes('Gas Dwarf')) {
    return c;
  }
  if (c.includes('Ice Giant') || c.includes('Neptune')) {
    return c;
  }

  // 2. Supercritical Water Worlds, Water Giants, & Steam Worlds
  if (
    c.includes('Supercritical') ||
    c.includes('Water Giant') ||
    c.includes('Steam World') ||
    hydro?.solvent === 'Supercritical H2O' ||
    hydro?.state?.includes('Supercritical')
  ) {
    if (massEarth >= 10) return 'Water Giant';
    if (T > 500) return 'Steam World';
    return 'Supercritical Water World';
  }

  // 3. All rocky planets follow the universal formula
  return formatRockyBodyClass(T, hydro, false, massEarth, iceFrac, pressureBar, gases, c);
}

/**
 * Resolves moon class systematically:
 * All moons follow the universal formula
 */
export function resolveMoonClass(
  currentClass: string,
  T: number,
  hydro: RealisticHydrosphere | null,
  iceFrac = 0,
  massEarth = 0.01,
  pressureBar?: number | null,
  gases?: Record<string, number> | null
): string {
  let c = currentClass.split('/')[0].replace(/\s*\([^)]*\)/g, '').trim();
  c = c.replace(/^Sudarsky\s+/i, '');

  if (
    c.includes('Supercritical') ||
    c.includes('Water Giant') ||
    c.includes('Steam World') ||
    hydro?.solvent === 'Supercritical H2O' ||
    hydro?.state?.includes('Supercritical')
  ) {
    if (T > 500) return 'Steam Moon';
    return 'Supercritical Water Moon';
  }

  return formatRockyBodyClass(T, hydro, true, massEarth, iceFrac, pressureBar, gases, c);
}


