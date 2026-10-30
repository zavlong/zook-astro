import type { RealisticHydrosphere, SpectralCategory } from '../../types/astrophysics';
import type { SectorHexSystem } from './sectorHex';

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
  if (sp.endsWith('IV')) return true;
  if (sp.endsWith('VI')) return true;
  if (sp.endsWith('V')) return false;
  return true;
}

/**
 * Evaluates whether a planet or moon is a liquid-water world (surface H2O or aqueous brine,
 * excluding supercritical steam worlds, subsurface-only ice-shell oceans, and ammonia worlds).
 */
export function isWaterWorldBody(
  cls: string | undefined,
  surfaceTempK: number | undefined,
  hydro?: RealisticHydrosphere | null
): boolean {
  const c = (cls || '').toLowerCase();
  const solv = (hydro?.solvent || '').toLowerCase();
  const state = (hydro?.state || '').toLowerCase();

  if (
    c.includes('supercritical') ||
    c.includes('steam') ||
    c.includes('water giant') ||
    solv.includes('supercritical') ||
    state.includes('supercritical') ||
    state.includes('no surface')
  ) {
    return false;
  }

  if (c.includes('ammonia') || solv.includes('nh3') || solv.includes('ammonia')) {
    return false;
  }

  if (solv.includes('subsurface') || (state.includes('subsurface') && !state.startsWith('surface'))) {
    return false;
  }

  const cov = hydro?.coveragePct ?? 0;
  const hasAqueousSolvent =
    solv === 'h2o' ||
    solv.includes('h2o') ||
    solv.includes('water') ||
    solv.includes('brine') ||
    solv.includes('perchlorate') ||
    solv.includes('aqueous');

  if (hasAqueousSolvent && cov > 0) {
    return true;
  }

  if (c.includes('aquatic') || c.includes('habitable') || c.includes('pelagic water')) {
    return true;
  }

  if (
    typeof surfaceTempK === 'number' &&
    surfaceTempK >= 250 &&
    surfaceTempK <= 350 &&
    cov > 5 &&
    !solv.includes('co2') &&
    !solv.includes('so2') &&
    !solv.includes('h2so4') &&
    !solv.includes('ch4') &&
    !solv.includes('magma')
  ) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether a planet or moon is a Cryo-Ammonia (NH3-H2O) world with surface ammonia seas/oceans.
 */
export function isAmmoniaWorldBody(
  cls: string | undefined,
  surfaceTempK: number | undefined,
  hydro?: RealisticHydrosphere | null
): boolean {
  const c = (cls || '').toLowerCase();
  const solv = (hydro?.solvent || '').toLowerCase();
  const state = (hydro?.state || '').toLowerCase();

  if (solv.includes('subsurface') || (state.includes('subsurface') && !state.startsWith('surface'))) {
    return false;
  }

  if (c.includes('ammonia') || c.includes('cryo-ammonia')) {
    return true;
  }

  const cov = hydro?.coveragePct ?? 0;
  if ((solv === 'nh3-h2o' || solv.includes('nh3') || solv.includes('ammonia')) && cov > 0) {
    return true;
  }

  if (
    typeof surfaceTempK === 'number' &&
    surfaceTempK >= 120 &&
    surfaceTempK <= 245 &&
    cov > 0 &&
    (solv.includes('nh3') || solv.includes('ammonia'))
  ) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether a planet or moon hydrosphere harbors active multicellular life.
 */
export function hasMulticellularBiosphere(hydro?: RealisticHydrosphere | null): boolean {
  if (!hydro?.biosphere) return false;
  return hydro.biosphere.toLowerCase().includes('multicellular');
}

/**
 * Evaluates whether a planet or moon harbors active terrestrial life (land-based / continental / subaerial biosphere).
 */
export function hasTerrestrialBiosphere(
  planetOrMoonClass?: string,
  hydro?: RealisticHydrosphere | null,
  bodyProps?: {
    rockFrac?: number;
    iceFrac?: number;
    surfaceTempK?: number;
  } | null
): boolean {
  if (!hydro?.biosphere || hydro.biosphere === 'none') return false;
  const bio = hydro.biosphere.toLowerCase();
  const pClass = (planetOrMoonClass || '').toLowerCase();
  const state = (hydro.state || '').toLowerCase();
  const covPct = hydro.coveragePct;

  const isOceanWorld =
    pClass.includes('ocean') ||
    pClass.includes('pelagic') ||
    pClass.includes('water world') ||
    pClass.includes('aquatic') ||
    pClass.includes('gas') ||
    pClass.includes('supercritical') ||
    pClass.includes('steam') ||
    pClass.includes('water giant') ||
    (covPct !== undefined && covPct >= 99.5) ||
    state.includes('global ocean') ||
    state.includes('global sea') ||
    state.includes('global water') ||
    state.includes('100% ocean') ||
    state.includes('100% liquid');

  if (isOceanWorld) {
    return false;
  }

  if (
    bio.includes('deep-water') ||
    bio.includes('deep-pelagic') ||
    bio.includes('sub-iceberg') ||
    bio.includes('cosmic ray attenuation') ||
    (bio.includes('pelagic') &&
      !bio.includes('continental') &&
      !bio.includes('terrestrial') &&
      !bio.includes('land'))
  ) {
    return false;
  }

  const isFrozenWorld =
    pClass.includes('frozen') ||
    pClass.includes('ice world') ||
    pClass.includes('glacial');

  if (isFrozenWorld) {
    return false;
  }

  const hasMajorityRocky =
    (bodyProps?.rockFrac !== undefined && bodyProps.rockFrac > 0.5) ||
    (bodyProps?.rockFrac !== undefined &&
      bodyProps?.iceFrac !== undefined &&
      bodyProps.rockFrac > bodyProps.iceFrac) ||
    pClass.includes('terrestrial') ||
    pClass.includes('rocky') ||
    pClass.includes('continental') ||
    pClass.includes('arid') ||
    pClass.includes('desert') ||
    pClass.includes('savannah') ||
    pClass.includes('tropical') ||
    pClass.includes('alpine') ||
    pClass.includes('steppe');

  const hasNonFrozenSurface =
    bodyProps?.surfaceTempK !== undefined && bodyProps.surfaceTempK >= 240;

  const hasNonFrozenLand =
    (covPct === undefined || covPct < 99.5) &&
    (hasMajorityRocky || hasNonFrozenSurface || state.includes('continent') || state.includes('land'));

  if (!hasNonFrozenLand) {
    return false;
  }

  const hasExplicitTerrestrial =
    bio.includes('terrestrial') ||
    bio.includes('continental') ||
    bio.includes('land') ||
    bio.includes('crust') ||
    bio.includes('algal mat') ||
    bio.includes('subaerial') ||
    bio.includes('soil');

  const isGeneralTerrestrialOnRockyLand =
    !bio.includes('marine only') &&
    (hasMajorityRocky || pClass.includes('terrestrial') || state.includes('continent'));

  return hasExplicitTerrestrial || isGeneralTerrestrialOnRockyLand;
}

/**
 * Single-pass evaluator that computes all habitability/biosphere filter traits for a system
 * in a single traversal of its zones and moons (5x faster than calling individual checks separately).
 */
export interface SystemFilterTraits {
  hasWater: boolean;
  hasAmmonia: boolean;
  hasMulti: boolean;
  hasTerrestrial: boolean;
  isNonMs: boolean;
}

export function computeSystemFilterTraits(system: SectorHexSystem): SystemFilterTraits {
  const isNonMs = isNonMainSequenceSystem(system);
  let hasWater = false;
  let hasAmmonia = false;
  let hasMulti = false;
  let hasTerrestrial = false;

  const zones = system.sysResult?.zones;
  if (zones && zones.length > 0) {
    for (const zone of zones) {
      for (const body of zone.bodies) {
        if (body.kind === 'planet') {
          if (!hasWater && isWaterWorldBody(body.planetClass, body.surfaceTempK, body.hydrosphere)) {
            hasWater = true;
          }
          if (!hasAmmonia && isAmmoniaWorldBody(body.planetClass, body.surfaceTempK, body.hydrosphere)) {
            hasAmmonia = true;
          }
          if (!hasMulti && hasMulticellularBiosphere(body.hydrosphere)) {
            hasMulti = true;
          }
          if (!hasTerrestrial && hasTerrestrialBiosphere(body.planetClass, body.hydrosphere, body)) {
            hasTerrestrial = true;
          }
          if (body.moons) {
            for (const moon of body.moons) {
              if (!hasWater && isWaterWorldBody(moon.moonClass, moon.surfaceTempK, moon.hydrosphere)) {
                hasWater = true;
              }
              if (!hasAmmonia && isAmmoniaWorldBody(moon.moonClass, moon.surfaceTempK, moon.hydrosphere)) {
                hasAmmonia = true;
              }
              if (!hasMulti && hasMulticellularBiosphere(moon.hydrosphere)) {
                hasMulti = true;
              }
              if (!hasTerrestrial && hasTerrestrialBiosphere(moon.moonClass, moon.hydrosphere, moon)) {
                hasTerrestrial = true;
              }
            }
          }
        }
      }
    }
  } else if (system.habitableTypes && system.habitableTypes.length > 0) {
    for (const t of system.habitableTypes) {
      const lower = t.toLowerCase();
      if (t === 'Water HZ' || t === 'Habitable Moon' || lower.includes('water')) hasWater = true;
      if (lower.includes('ammonia')) hasAmmonia = true;
      if (lower.includes('multicellular')) hasMulti = true;
      if (lower.includes('terrestrial life')) hasTerrestrial = true;
    }
  }

  return { hasWater, hasAmmonia, hasMulti, hasTerrestrial, isNonMs };
}

export function hasWaterWorld(system: SectorHexSystem): boolean {
  return computeSystemFilterTraits(system).hasWater;
}

export function hasAmmoniaWorld(system: SectorHexSystem): boolean {
  return computeSystemFilterTraits(system).hasAmmonia;
}

export function hasMulticellularLife(system: SectorHexSystem): boolean {
  return computeSystemFilterTraits(system).hasMulti;
}

export function hasTerrestrialLife(system: SectorHexSystem): boolean {
  return computeSystemFilterTraits(system).hasTerrestrial;
}

export type SectorFilterCategory =
  | 'all'
  | SpectralCategory
  | 'habitable'
  | 'water-world'
  | 'ammonia-world'
  | 'multicellular'
  | 'terrestrial-life'
  | 'non-ms'
  | 'mass';

export type MassFilterBracket =
  | 'all'
  | 'low' // < 0.8 M☉
  | 'solar' // 0.8 - 2.0 M☉
  | 'intermediate' // 2.0 - 8.0 M☉
  | 'massive' // > 8.0 M☉
  | 'giant' // 10 - 50 M☉
  | 'supermassive' // > 999,999 M☉
  | 'custom';

/**
 * Evaluates whether a SectorHexSystem satisfies a combined set of active sector filters.
 */
export function checkSystemMatchesFilters(
  system: SectorHexSystem,
  activeFilterCats: Set<SectorFilterCategory>,
  massBracket: MassFilterBracket = 'all',
  customMinMass = '',
  customMaxMass = '',
  traits?: Partial<SystemFilterTraits>
): boolean {
  if (activeFilterCats.size === 0 && massBracket === 'all') {
    return true;
  }

  const activeSpectral: SpectralCategory[] = [];
  if (activeFilterCats.has('ob')) activeSpectral.push('ob');
  if (activeFilterCats.has('af')) activeSpectral.push('af');
  if (activeFilterCats.has('g')) activeSpectral.push('g');
  if (activeFilterCats.has('km')) activeSpectral.push('km');
  if (activeFilterCats.has('remnant')) activeSpectral.push('remnant');

  if (activeSpectral.length > 0 && !activeSpectral.includes(system.spectralCat)) {
    return false;
  }

  if (activeFilterCats.has('non-ms')) {
    const isNonMs = traits?.isNonMs ?? isNonMainSequenceSystem(system);
    if (!isNonMs) return false;
  }

  if (activeFilterCats.has('habitable')) {
    if (!system.candidateHabitable) return false;
  }

  if (activeFilterCats.has('water-world')) {
    const hasWater = traits?.hasWater ?? hasWaterWorld(system);
    if (!hasWater) return false;
  }

  if (activeFilterCats.has('ammonia-world')) {
    const hasAmmonia = traits?.hasAmmonia ?? hasAmmoniaWorld(system);
    if (!hasAmmonia) return false;
  }

  if (activeFilterCats.has('multicellular')) {
    const hasMulti = traits?.hasMulti ?? hasMulticellularLife(system);
    if (!hasMulti) return false;
  }

  if (activeFilterCats.has('terrestrial-life')) {
    const hasTerrestrial = traits?.hasTerrestrial ?? hasTerrestrialLife(system);
    if (!hasTerrestrial) return false;
  }

  if (massBracket !== 'all') {
    if (massBracket === 'low' && !(system.mass < 0.8)) return false;
    if (massBracket === 'solar' && !(system.mass >= 0.8 && system.mass <= 2.0)) return false;
    if (massBracket === 'intermediate' && !(system.mass > 2.0 && system.mass <= 8.0)) return false;
    if (massBracket === 'massive' && !(system.mass > 8.0 && system.mass <= 999999)) return false;
    if (massBracket === 'giant' && !(system.isGiantSystem || (system.mass >= 10.0 && system.mass <= 50.0))) return false;
    if (massBracket === 'supermassive' && !(system.mass > 999999)) return false;
    if (massBracket === 'custom') {
      const minM = parseFloat(customMinMass) || 0;
      const maxM = parseFloat(customMaxMass) || 1000000;
      if (!(system.mass >= minM && system.mass <= maxM)) return false;
    }
  }

  return true;
}
