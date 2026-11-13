import {
  RealisticBinarySplit,
  RealisticHydrosphere,
  RealisticMagneticField,
  RealisticMoon,
  RealisticStarNode,
} from '../../types/astrophysics';
import {
  RealisticBeltBody,
  RealisticPlanetBody,
  RealisticPlanetaryZone,
  RealisticStarSystemResult,
  getStarStats,
  sanitizeRealisticSystem,
  seedFromId,
} from '../generation/realisticStarGen';
import {
  ATMOSPHERE_PRESETS,
  autoCalculateMoonPhysics,
  autoCalculatePlanetPhysics,
  formatCleanNumber,
} from '../generation/systemEditorPhysics';

export type StellarisDistanceConversionMode = 'power_law' | 'linear';

export interface StellarisImportConversionConfig {
  /**
   * 'power_law': r_stellaris = scale * (a_AU ^ exponent) + offset
   *              => a_AU = ((r_stellaris - offset) / scale) ^ (1 / exponent)
   * 'linear':    r_stellaris = stellarisUnitsPerAU * a_AU
   *              => a_AU = r_stellaris / stellarisUnitsPerAU
   */
  distanceMode: StellarisDistanceConversionMode;
  /** Used in 'linear' mode: Stellaris orbit_distance units per 1.0 AU (e.g. 20, 30, 50) */
  stellarisUnitsPerAU: number;
  /** Used in 'power_law' mode: Stellaris orbit_distance at 1.0 AU (default 50) */
  powerLawScale: number;
  /** Used in 'power_law' mode: Exponent (default 0.667) */
  powerLawExponent: number;
  /** Used in 'power_law' mode: Radial offset (default 0) */
  powerLawOffset: number;
  /**
   * Standard Stellaris accumulates `change_orbit` and each planet's `orbit_distance`
   * outward from the star. If false, treats each planet's `orbit_distance` as absolute from the star.
   */
  cumulativeOrbitDistance: boolean;
  /**
   * Multiplier applied to the converted planetary radius (default 1.0).
   * In Stellaris, rocky planet size ~16 corresponds to ~1.0 Earth radius.
   */
  planetSizeScaleFactor: number;
  /**
   * Stellaris size value that corresponds to 1.0 Earth radius for non-giant worlds (default 16).
   */
  stellarisSizeAtOneEarthRadius: number;
  /**
   * Whether to prefer commented `# semi_major_axis_au = ...` and `# radius_earth = ...`
   * telemetry if the file was previously exported by Zook Astro.
   */
  preferCommentedStargenTelemetry: boolean;
}

export const DEFAULT_STELLARIS_IMPORT_CONFIG: StellarisImportConversionConfig = {
  distanceMode: 'power_law',
  stellarisUnitsPerAU: 30,
  powerLawScale: 50,
  powerLawExponent: 0.667,
  powerLawOffset: 0,
  cumulativeOrbitDistance: true,
  planetSizeScaleFactor: 1.0,
  stellarisSizeAtOneEarthRadius: 16,
  preferCommentedStargenTelemetry: false,
};

export interface ParsedStellarisBodyBlock {
  keyword: 'planet' | 'moon';
  name: string;
  stellarisClass: string;
  size: number;
  orbitDistance: number;
  orbitAngle: number;
  hasRing: boolean;
  count: number;
  changeOrbitBefore: number;
  moons: ParsedStellarisBodyBlock[];
  commentTelemetry: Record<string, string>;
}

export interface ParsedStellarisBelt {
  type: string;
  radius: number;
  commentTelemetry: Record<string, string>;
}

export interface ParsedStellarisInitializer {
  id: string;
  name: string;
  systemClass: string;
  belts: ParsedStellarisBelt[];
  planets: ParsedStellarisBodyBlock[];
  systemCommentTelemetry: Record<string, string>;
}

/**
 * Converts a cumulative Stellaris orbit_distance value into physical AU
 * according to the user's conversion configuration.
 */
export function convertStellarisDistanceToAU(
  stellarisDist: number,
  config: StellarisImportConversionConfig
): number {
  const d = Math.max(1, stellarisDist);
  if (config.distanceMode === 'linear') {
    const unitsPerAU = Math.max(0.1, config.stellarisUnitsPerAU || 30);
    return +Math.max(0.01, d / unitsPerAU).toFixed(4);
  }
  const scale = Math.max(0.1, config.powerLawScale || 50);
  const exp = Math.max(0.1, config.powerLawExponent || 0.667);
  const offset = config.powerLawOffset || 0;
  const effective = Math.max(0.5, d - offset);
  return +Math.max(0.01, Math.pow(effective / scale, 1 / exp)).toFixed(4);
}

/**
 * Converts a Stellaris planet/moon `size` integer into Earth radii (R⊕) and Earth masses (M⊕)
 */
export function convertStellarisSizeToRadiusAndMass(
  stellarisSize: number,
  stellarisClass: string,
  isMoon: boolean,
  config: StellarisImportConversionConfig
): { radiusEarth: number; massEarth: number; rockFrac: number; iceFrac: number; gasFrac: number } {
  const cls = (stellarisClass || '').toLowerCase();
  const scaleMult = Math.max(0.1, config.planetSizeScaleFactor || 1.0);
  const refSize = Math.max(4, config.stellarisSizeAtOneEarthRadius || 16);
  const sz = Math.max(2, stellarisSize || (isMoon ? 8 : 16));

  if (cls.includes('gas_giant')) {
    // Gas giant: size 20..40 -> ~6..12.5 R_earth, mass 50..600 M_earth
    const rEarth = +(Math.max(3.8, 8.5 * Math.pow(sz / 28, 0.85)) * scaleMult).toFixed(3);
    const mEarth = +Math.max(25, 180 * Math.pow(rEarth / 9.5, 2.4)).toFixed(2);
    return { radiusEarth: rEarth, massEarth: mEarth, rockFrac: 0.04, iceFrac: 0.08, gasFrac: 0.88 };
  }
  if (cls.includes('ice_giant')) {
    const rEarth = +(Math.max(2.4, 3.8 * Math.pow(sz / 22, 0.85)) * scaleMult).toFixed(3);
    const mEarth = +Math.max(6, 17 * Math.pow(rEarth / 3.85, 2.3)).toFixed(2);
    return { radiusEarth: rEarth, massEarth: mEarth, rockFrac: 0.2, iceFrac: 0.62, gasFrac: 0.18 };
  }

  const isIcy =
    cls.includes('frozen') ||
    cls.includes('arctic') ||
    cls.includes('tundra') ||
    cls.includes('alpine') ||
    cls.includes('barren_cold');
  const isOcean = cls.includes('ocean');

  let rEarth: number;
  if (isMoon) {
    // Moons in Stellaris typically have size 4..12 -> 0.12..0.65 R_earth
    rEarth = +(Math.max(0.08, 0.28 * Math.pow(sz / 8, 1.15)) * scaleMult).toFixed(3);
  } else {
    rEarth = +(Math.max(0.18, Math.pow(sz / refSize, 1.15)) * scaleMult).toFixed(3);
  }

  const rockFrac = isIcy ? 0.45 : isOcean ? 0.65 : 0.78;
  const iceFrac = isIcy ? 0.55 : isOcean ? 0.35 : 0.22;
  const densityRatio = isIcy ? 0.58 : isOcean ? 0.82 : 1.0;
  const mEarth = +Math.max(0.001, densityRatio * Math.pow(rEarth, 3.35)).toFixed(4);

  return { radiusEarth: rEarth, massEarth: mEarth, rockFrac, iceFrac, gasFrac: 0 };
}

function cleanStellarisName(rawName: string, fallback: string): string {
  if (!rawName) return fallback;
  let cleaned = rawName.trim().replace(/^["']|["']$/g, '');
  if (cleaned.startsWith('NAME_')) {
    cleaned = cleaned.slice(5);
  }
  cleaned = cleaned.replace(/_/g, ' ').trim();
  return cleaned || fallback;
}

function parseNumericOrRange(valStr: string): number {
  const s = (valStr || '').trim();
  const minMaxMatch = s.match(/min\s*=\s*(-?\d+(?:\.\d+)?)\s+max\s*=\s*(-?\d+(?:\.\d+)?)/i);
  if (minMaxMatch) {
    return (parseFloat(minMaxMatch[1]) + parseFloat(minMaxMatch[2])) / 2;
  }
  const numMatch = s.match(/-?\d+(?:\.\d+)?/);
  return numMatch ? parseFloat(numMatch[0]) : 0;
}

function extractCommentTelemetry(lines: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('#')) continue;
    const body = trimmed.replace(/^#+\s*/, '');
    const eqIdx = body.indexOf('=');
    if (eqIdx > 0) {
      const k = body.slice(0, eqIdx).trim();
      const v = body.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (k && !k.includes(' ')) {
        map[k] = v;
      }
    }
  }
  return map;
}

/**
 * Extracts balanced `{ ... }` blocks from a Clausewitz script string,
 * preserving `#` comment telemetry lines inside each block.
 */
function parsePlanetOrMoonBlock(
  keyword: 'planet' | 'moon',
  blockContent: string,
  changeOrbitBefore = 0
): ParsedStellarisBodyBlock {
  const lines = blockContent.split(/\r?\n/);
  const commentTelemetry = extractCommentTelemetry(lines);

  // Strip nested `moon = { ... }` and `init_effect = { ... }` before scanning top-level key=value
  const moons: ParsedStellarisBodyBlock[] = [];
  let stripped = '';
  let i = 0;
  let pendingMoonChangeOrbit = 0;

  while (i < blockContent.length) {
    // Skip comments when scanning for nested blocks
    if (blockContent[i] === '#') {
      const nl = blockContent.indexOf('\n', i);
      if (nl === -1) break;
      i = nl + 1;
      continue;
    }

    const subSlice = blockContent.slice(i);
    const changeMoonMatch = subSlice.match(/^change_orbit\s*=\s*(\{[^}]*\}|-?\d+(?:\.\d+)?)/i);
    if (changeMoonMatch && (i === 0 || /[\s{]/.test(blockContent[i - 1]))) {
      pendingMoonChangeOrbit += parseNumericOrRange(changeMoonMatch[1]);
      i += changeMoonMatch[0].length;
      continue;
    }

    const nestedMatch = subSlice.match(/^(moon|init_effect|orbit_angle|orbit_distance|size|count|flags)\s*=\s*\{/i);
    if (nestedMatch && (i === 0 || /[\s{]/.test(blockContent[i - 1]))) {
      const nestedKey = nestedMatch[1].toLowerCase();
      const openBraceIdx = i + nestedMatch[0].length - 1;
      let depth = 1;
      let j = openBraceIdx + 1;
      while (j < blockContent.length && depth > 0) {
        if (blockContent[j] === '#') {
          const nl = blockContent.indexOf('\n', j);
          j = nl === -1 ? blockContent.length : nl + 1;
          continue;
        }
        if (blockContent[j] === '{') depth++;
        else if (blockContent[j] === '}') depth--;
        j++;
      }
      const innerText = blockContent.slice(openBraceIdx + 1, j - 1);
      if (nestedKey === 'moon') {
        moons.push(parsePlanetOrMoonBlock('moon', innerText, pendingMoonChangeOrbit));
        pendingMoonChangeOrbit = 0;
      } else if (nestedKey !== 'init_effect' && nestedKey !== 'flags') {
        stripped += `${nestedKey} = { ${innerText} }\n`;
      }
      i = j;
      continue;
    }

    stripped += blockContent[i];
    i++;
  }

  const getAttr = (key: string): string | null => {
    const regex = new RegExp(`(?:^|\\s)${key}\\s*=\\s*("[^"]*"|\\{[^}]*\\}|[^\\s#{}]+)`, 'im');
    const m = stripped.match(regex);
    return m ? m[1].trim() : null;
  };

  const rawName = getAttr('name') || '';
  const rawClass = (getAttr('class') || 'pc_barren').replace(/^["']|["']$/g, '');
  const sizeVal = parseNumericOrRange(getAttr('size') || (keyword === 'moon' ? '8' : '16'));
  const orbitDistVal = parseNumericOrRange(getAttr('orbit_distance') || '0');
  const orbitAngleVal = parseNumericOrRange(getAttr('orbit_angle') || '0');
  const countVal = Math.max(1, Math.round(parseNumericOrRange(getAttr('count') || '1') || 1));
  const hasRingRaw = (getAttr('has_ring') || 'no').toLowerCase();

  return {
    keyword,
    name: cleanStellarisName(rawName, ''),
    stellarisClass: rawClass,
    size: sizeVal || (keyword === 'moon' ? 8 : 16),
    orbitDistance: orbitDistVal,
    orbitAngle: orbitAngleVal,
    hasRing: hasRingRaw === 'yes' || hasRingRaw === 'true',
    count: Math.min(8, countVal),
    changeOrbitBefore,
    moons,
    commentTelemetry,
  };
}

/**
 * Parses one or more Stellaris Solar System Initializer blocks from a `.txt` script.
 * Also supports standalone `planet = { ... }` snippets if pasted directly.
 */
export function parseStellarisInitializerScript(scriptText: string): ParsedStellarisInitializer[] {
  const results: ParsedStellarisInitializer[] = [];
  const allLines = scriptText.split(/\r?\n/);
  const globalComments = extractCommentTelemetry(allLines);

  // Find top-level `<identifier> = {` blocks
  let idx = 0;
  const topBlocks: Array<{ id: string; content: string; preComments: Record<string, string> }> = [];

  while (idx < scriptText.length) {
    if (scriptText[idx] === '#') {
      const nl = scriptText.indexOf('\n', idx);
      if (nl === -1) break;
      idx = nl + 1;
      continue;
    }
    const slice = scriptText.slice(idx);
    const match = slice.match(/^\s*([a-zA-Z0-9_.-]+)\s*=\s*\{/);
    if (!match) {
      idx++;
      continue;
    }
    const blockId = match[1];
    const braceStart = idx + match[0].length - 1;
    let depth = 1;
    let j = braceStart + 1;
    while (j < scriptText.length && depth > 0) {
      if (scriptText[j] === '#') {
        const nl = scriptText.indexOf('\n', j);
        j = nl === -1 ? scriptText.length : nl + 1;
        continue;
      }
      if (scriptText[j] === '{') depth++;
      else if (scriptText[j] === '}') depth--;
      j++;
    }
    const content = scriptText.slice(braceStart + 1, j - 1);
    if (!blockId.startsWith('@')) {
      topBlocks.push({ id: blockId, content, preComments: globalComments });
    }
    idx = j;
  }

  // If the user pasted raw `planet = { ... }` blocks directly without an outer initializer wrapper
  if (
    topBlocks.length > 0 &&
    topBlocks.every((b) => b.id.toLowerCase() === 'planet' || b.id.toLowerCase() === 'asteroid_belt')
  ) {
    topBlocks.splice(0, topBlocks.length, {
      id: 'imported_stellaris_system',
      content: scriptText,
      preComments: globalComments,
    });
  }

  for (const block of topBlocks) {
    const content = block.content;
    const blockComments = {
      ...block.preComments,
      ...extractCommentTelemetry(content.split(/\r?\n/)),
    };

    const belts: ParsedStellarisBelt[] = [];
    const planets: ParsedStellarisBodyBlock[] = [];
    let topLevelStripped = '';
    let pendingChangeOrbit = 0;

    let i = 0;
    while (i < content.length) {
      if (content[i] === '#') {
        const nl = content.indexOf('\n', i);
        if (nl === -1) break;
        i = nl + 1;
        continue;
      }
      const sub = content.slice(i);

      const changeOrbitMatch = sub.match(/^change_orbit\s*=\s*(\{[^}]*\}|-?\d+(?:\.\d+)?)/i);
      if (changeOrbitMatch && (i === 0 || /[\s{]/.test(content[i - 1]))) {
        pendingChangeOrbit += parseNumericOrRange(changeOrbitMatch[1]);
        i += changeOrbitMatch[0].length;
        continue;
      }

      const astDistMatch = sub.match(/^asteroids_distance\s*=\s*(\{[^}]*\}|-?\d+(?:\.\d+)?)/i);
      if (astDistMatch && (i === 0 || /[\s{]/.test(content[i - 1]))) {
        belts.push({
          type: 'rocky_asteroid_belt',
          radius: parseNumericOrRange(astDistMatch[1]),
          commentTelemetry: {},
        });
        i += astDistMatch[0].length;
        continue;
      }

      const subBlockMatch = sub.match(/^([a-zA-Z0-9_]+)\s*=\s*\{/);
      if (subBlockMatch && (i === 0 || /[\s{]/.test(content[i - 1]))) {
        const subKey = subBlockMatch[1].toLowerCase();
        const openIdx = i + subBlockMatch[0].length - 1;
        let depth = 1;
        let j = openIdx + 1;
        while (j < content.length && depth > 0) {
          if (content[j] === '#') {
            const nl = content.indexOf('\n', j);
            j = nl === -1 ? content.length : nl + 1;
            continue;
          }
          if (content[j] === '{') depth++;
          else if (content[j] === '}') depth--;
          j++;
        }
        const inner = content.slice(openIdx + 1, j - 1);
        if (subKey === 'planet') {
          const parsedP = parsePlanetOrMoonBlock('planet', inner, pendingChangeOrbit);
          pendingChangeOrbit = 0;
          for (let c = 0; c < parsedP.count; c++) {
            planets.push(
              c === 0
                ? parsedP
                : {
                    ...parsedP,
                    name: parsedP.name ? `${parsedP.name} ${c + 1}` : '',
                    changeOrbitBefore: 0,
                  }
            );
          }
        } else if (subKey === 'asteroid_belt') {
          const typeMatch = inner.match(/type\s*=\s*"?([^"\s#]+)"?/i);
          const radMatch = inner.match(/radius\s*=\s*(\{[^}]*\}|-?\d+(?:\.\d+)?)/i);
          belts.push({
            type: typeMatch ? typeMatch[1] : 'rocky_asteroid_belt',
            radius: radMatch ? parseNumericOrRange(radMatch[1]) : 50,
            commentTelemetry: extractCommentTelemetry(inner.split(/\r?\n/)),
          });
        }
        i = j;
        continue;
      }

      topLevelStripped += content[i];
      i++;
    }

    if (planets.length === 0 && belts.length === 0) continue;

    const nameMatch = topLevelStripped.match(/(?:^|\s)name\s*=\s*("[^"]*"|[^\s#{}]+)/im);
    const classMatch = topLevelStripped.match(/(?:^|\s)class\s*=\s*("[^"]*"|[^\s#{}]+)/im);

    const fallbackName = cleanStellarisName(
      block.id.replace(/_initializer$/i, '').replace(/^sol_system/i, 'Sol'),
      'Stellaris System'
    );

    results.push({
      id: block.id,
      name: cleanStellarisName(nameMatch ? nameMatch[1] : '', fallbackName),
      systemClass: classMatch ? classMatch[1].replace(/^["']|["']$/g, '') : 'sc_g',
      belts,
      planets,
      systemCommentTelemetry: blockComments,
    });
  }

  return results;
}

function isStellarisStarBody(stellarisClass: string, isFirstBody: boolean, orbitDist: number): boolean {
  const c = (stellarisClass || '').toLowerCase();
  if (
    c.includes('_star') ||
    c.startsWith('sc_') ||
    c === 'pc_black_hole' ||
    c === 'pc_neutron_star' ||
    c === 'pc_pulsar' ||
    c === 'pc_white_dwarf' ||
    c === 'pc_collapsar' ||
    c === 'pc_magnetar' ||
    c === 'pc_t_star'
  ) {
    return true;
  }
  if (c === 'star' || (isFirstBody && orbitDist === 0 && (c.includes('random') || c.includes('ideal')))) {
    return true;
  }
  return false;
}

function inferStarMassFromStellarisClass(stellarisClass: string, systemClass: string): {
  mass: number;
  remnantCategory?: string;
} {
  const c = (stellarisClass || systemClass || 'pc_g_star').toLowerCase();
  if (c.includes('black_hole') || c.includes('collapsar')) {
    return { mass: 8.5, remnantCategory: 'Stellar Black Hole' };
  }
  if (c.includes('neutron') || c.includes('pulsar') || c.includes('magnetar')) {
    return { mass: 1.45, remnantCategory: 'Neutron Star' };
  }
  if (c.includes('white_dwarf') || c.includes('_d')) {
    return { mass: 0.62, remnantCategory: 'White Dwarf' };
  }
  if (c.includes('_o') || c.includes('o_star')) return { mass: 22.0 };
  if (c.includes('_b') || c.includes('b_star')) return { mass: 4.5 };
  if (c.includes('_a') || c.includes('a_star')) return { mass: 1.75 };
  if (c.includes('_f') || c.includes('f_star')) return { mass: 1.25 };
  if (c.includes('_g') || c.includes('g_star')) return { mass: 1.0 };
  if (c.includes('_k') || c.includes('k_star')) return { mass: 0.72 };
  if (c.includes('_m_giant')) return { mass: 1.35 };
  if (c.includes('_m') || c.includes('m_star')) return { mass: 0.35 };
  if (c.includes('_t') || c.includes('t_star')) return { mass: 0.05 };
  return { mass: 1.0 };
}

function mapStellarisPlanetClassToStargenProfile(stellarisClass: string): {
  planetClass: string;
  atmosphereType: string;
  albedo: number;
  hydrosphere: RealisticHydrosphere | null;
} {
  const c = (stellarisClass || 'pc_barren').toLowerCase();

  if (c.includes('continental') || c.includes('gaia') || c.includes('city') || c.includes('relic')) {
    return {
      planetClass: 'Temperate Aquatic Terrestrial World',
      atmosphereType: 'Nitrogen-Oxygen (Earth-like)',
      albedo: 0.3,
      hydrosphere: {
        state: 'Liquid Oceans',
        solvent: 'Water (H2O)',
        coveragePct: 68,
        biosphere: 'Terrestrial Flora & Fauna',
        liqKm: 3.8,
        scKm: 0,
        iceKm: 0,
        siKm: 0,
        crustKm: 35,
      },
    };
  }
  if (c.includes('ocean') || c.includes('aquatic')) {
    return {
      planetClass: 'Temperate Aquatic Ocean World',
      atmosphereType: 'Nitrogen-Oxygen (Earth-like)',
      albedo: 0.26,
      hydrosphere: {
        state: 'Global Surface Liquid Ocean (100% Coverage)',
        solvent: 'Water (H2O)',
        coveragePct: 98,
        biosphere: 'Multicellular Marine Ecosystem',
        liqKm: 42.0,
        scKm: 0,
        iceKm: 0,
        siKm: 5.0,
        crustKm: 25,
      },
    };
  }
  if (c.includes('tropical') || c.includes('hive')) {
    return {
      planetClass: 'Temperate Aquatic Terrestrial World',
      atmosphereType: 'Nitrogen-Oxygen (Earth-like)',
      albedo: 0.24,
      hydrosphere: {
        state: 'Liquid Oceans',
        solvent: 'Water (H2O)',
        coveragePct: 75,
        biosphere: 'Terrestrial Flora & Fauna',
        liqKm: 4.5,
        scKm: 0,
        iceKm: 0,
        siKm: 0,
        crustKm: 32,
      },
    };
  }
  if (c.includes('desert') || c.includes('arid') || c.includes('savannah')) {
    return {
      planetClass: 'Desert World',
      atmosphereType: 'Nitrogen-Oxygen (Earth-like)',
      albedo: 0.35,
      hydrosphere: {
        state: 'Shallow Seas & Endorheic Lakes',
        solvent: 'Water (H2O)',
        coveragePct: c.includes('savannah') ? 32 : 14,
        biosphere: 'Terrestrial Flora & Fauna',
        liqKm: 0.6,
        scKm: 0,
        iceKm: 0,
        siKm: 0,
        crustKm: 40,
      },
    };
  }
  if (c.includes('arctic') || c.includes('tundra') || c.includes('alpine')) {
    return {
      planetClass: 'Temperate Terrestrial World',
      atmosphereType: 'Nitrogen-Oxygen (Earth-like)',
      albedo: 0.48,
      hydrosphere: {
        state: 'Liquid Oceans',
        solvent: 'Water (H2O)',
        coveragePct: 45,
        biosphere: 'Terrestrial Flora & Fauna',
        liqKm: 2.1,
        scKm: 0,
        iceKm: 1.8,
        siKm: 0,
        crustKm: 36,
      },
    };
  }
  if (c.includes('toxic') || c.includes('nuked')) {
    return {
      planetClass: c.includes('nuked') ? 'Terrestrial World' : 'Venusian World',
      atmosphereType: c.includes('nuked')
        ? 'Sulfur Dioxide & Volcanic'
        : 'Dense Carbon Dioxide (Venusian)',
      albedo: 0.68,
      hydrosphere: {
        state: 'Dry / Desiccated',
        solvent: 'None (No Ocean / Dry)',
        coveragePct: 0,
        biosphere: 'Barren / Sterile',
        liqKm: 0,
        scKm: 0,
        iceKm: 0,
        siKm: 0,
        crustKm: 38,
      },
    };
  }
  if (c.includes('molten')) {
    return {
      planetClass: 'Lava World',
      atmosphereType: 'Silicate & Alkali Rock-Vapor Exosphere',
      albedo: 0.1,
      hydrosphere: {
        state: 'Surface Liquid Silicate Lava Seas',
        solvent: 'Silicate Magma',
        coveragePct: 55,
        biosphere: 'Barren / Sterile',
        liqKm: 1.5,
        scKm: 0,
        iceKm: 0,
        siKm: 0,
        crustKm: 18,
      },
    };
  }
  if (c.includes('frozen')) {
    return {
      planetClass: 'Ice World',
      atmosphereType: 'Trace / Exosphere',
      albedo: 0.58,
      hydrosphere: {
        state: 'Subsurface Ocean (Ice Shell)',
        solvent: 'Water (H2O)',
        coveragePct: 0,
        biosphere: 'Barren / Sterile',
        liqKm: 15,
        scKm: 0,
        iceKm: 25,
        siKm: 0,
        crustKm: 30,
      },
    };
  }
  if (c.includes('gas_giant')) {
    return {
      planetClass: 'Class I Gas Giant',
      atmosphereType: 'Hydrogen-Helium (Jovian)',
      albedo: 0.5,
      hydrosphere: null,
    };
  }
  if (c.includes('ice_giant')) {
    return {
      planetClass: 'Ice Giant',
      atmosphereType: 'Primary Neptunian Envelope',
      albedo: 0.35,
      hydrosphere: null,
    };
  }
  if (c.includes('barren_cold')) {
    return {
      planetClass: 'Frozen World',
      atmosphereType: 'Thin Carbon Dioxide (Martian)',
      albedo: 0.25,
      hydrosphere: {
        state: 'Frozen Surface Ice Sheet',
        solvent: 'None (No Ocean / Dry)',
        coveragePct: 0,
        biosphere: 'Barren / Sterile',
        liqKm: 0,
        scKm: 0,
        iceKm: 1.2,
        siKm: 0,
        crustKm: 42,
      },
    };
  }

  // Default: pc_barren / rocky
  return {
    planetClass: 'Terrestrial World',
    atmosphereType: 'Airless Vacuum',
    albedo: 0.15,
    hydrosphere: {
      state: 'Dry / Desiccated',
      solvent: 'None (No Ocean / Dry)',
      coveragePct: 0,
      biosphere: 'Barren / Sterile',
      liqKm: 0,
      scKm: 0,
      iceKm: 0,
      siKm: 0,
      crustKm: 40,
    },
  };
}

/**
 * Converts a parsed Stellaris Solar System Initializer into a complete, physically
 * self-consistent `RealisticStarSystemResult` ready for StarGen.
 */
export function convertStellarisInitializerToRealisticSystem(
  parsed: ParsedStellarisInitializer,
  config: StellarisImportConversionConfig = DEFAULT_STELLARIS_IMPORT_CONFIG
): RealisticStarSystemResult {
  const sysTel = parsed.systemCommentTelemetry || {};
  const sysAge =
    config.preferCommentedStargenTelemetry && sysTel.system_age_gyr
      ? parseFloat(sysTel.system_age_gyr) || 4.6
      : 4.6;
  const sysFeh =
    config.preferCommentedStargenTelemetry && sysTel.metallicity_feh
      ? parseFloat(sysTel.metallicity_feh) || 0.0
      : 0.0;

  // Separate stars from planets while tracking cumulative Stellaris orbit distance
  const starBlocks: Array<{ block: ParsedStellarisBodyBlock; cumulativeDist: number }> = [];
  const planetBlocks: Array<{ block: ParsedStellarisBodyBlock; cumulativeDist: number }> = [];

  let runningOrbit = 0;
  parsed.planets.forEach((pBlock, idx) => {
    runningOrbit += pBlock.changeOrbitBefore || 0;
    const isStar = isStellarisStarBody(pBlock.stellarisClass, idx === 0, pBlock.orbitDistance);

    if (isStar) {
      const starDist = idx === 0 ? 0 : runningOrbit + pBlock.orbitDistance;
      starBlocks.push({ block: pBlock, cumulativeDist: starDist });
      // Note: primary star at 0 does not shift planet orbits; companion stars with orbit_distance > 0 might
      if (idx === 0) {
        runningOrbit = 0;
      }
    } else {
      if (config.cumulativeOrbitDistance) {
        runningOrbit += pBlock.orbitDistance;
      } else {
        runningOrbit = pBlock.orbitDistance + (pBlock.changeOrbitBefore || 0);
      }
      planetBlocks.push({ block: pBlock, cumulativeDist: Math.max(2, runningOrbit) });
    }
  });

  // Synthesize at least one primary star
  if (starBlocks.length === 0) {
    starBlocks.push({
      block: {
        keyword: 'planet',
        name: parsed.name,
        stellarisClass: parsed.systemClass || 'pc_g_star',
        size: 20,
        orbitDistance: 0,
        orbitAngle: 0,
        hasRing: false,
        count: 1,
        changeOrbitBefore: 0,
        moons: [],
        commentTelemetry: {},
      },
      cumulativeDist: 0,
    });
  }

  const stars: RealisticStarNode[] = starBlocks.slice(0, 4).map((entry, sIdx) => {
    const label = ['A', 'B', 'C', 'D'][sIdx] || 'A';
    const tel = entry.block.commentTelemetry || {};
    const inferred = inferStarMassFromStellarisClass(entry.block.stellarisClass, parsed.systemClass);
    const mass =
      config.preferCommentedStargenTelemetry && tel.mass_sol
        ? parseFloat(tel.mass_sol) || inferred.mass
        : inferred.mass;

    const computed = getStarStats(Math.max(0.05, mass), sysAge, sysFeh, label);
    if (inferred.remnantCategory === 'Stellar Black Hole') {
      computed.category = 'Stellar Black Hole';
      computed.spectralType = 'BH';
      computed.radius = 0.0001;
      computed.lumNum = 0.0001;
      computed.lum = 0.0001;
    } else if (inferred.remnantCategory === 'Neutron Star') {
      computed.category = 'Neutron Star';
      computed.spectralType = 'PSR';
      computed.radius = 0.00002;
      computed.lumNum = 0.001;
      computed.lum = 0.001;
    } else if (inferred.remnantCategory === 'White Dwarf') {
      computed.category = 'White Dwarf';
      computed.spectralType = 'DA2';
      computed.radius = 0.012;
      computed.lumNum = 0.003;
      computed.lum = 0.003;
    }
    computed.radius = formatCleanNumber(computed.radius, 4);
    computed.lumNum = formatCleanNumber(computed.lumNum, 4);
    computed.lum = computed.lumNum;
    return computed;
  });

  const primaryStar = stars[0];
  const hostMass = primaryStar.mass || 1.0;
  const hostLum = primaryStar.lumNum || 1.0;

  const splits: RealisticBinarySplit[] = [];
  for (let s = 1; s < stars.length; s++) {
    const stDist = starBlocks[s]?.cumulativeDist || 25 * s;
    const aSplit = convertStellarisDistanceToAU(stDist, config);
    const mTot = hostMass + (stars[s]?.mass || 1.0);
    const muB = (stars[s]?.mass || 1.0) / mTot;
    const muM = hostMass / mTot;
    const eBin = 0.15;
    const sA = aSplit * (0.464 - 0.38 * muB - 0.631 * eBin + 0.586 * muB * eBin + 0.15 * eBin * eBin - 0.198 * muB * eBin * eBin);
    const sB = aSplit * (0.464 - 0.38 * muM - 0.631 * eBin + 0.586 * muM * eBin + 0.15 * eBin * eBin - 0.198 * muM * eBin * eBin);
    const pM = aSplit * (1.6 + 5.1 * eBin - 2.22 * eBin * eBin + 4.12 * muM - 4.27 * eBin * muM - 5.09 * muM * muM + 4.61 * eBin * eBin * muM * muM);
    splits.push({
      pair: `Star A + Star ${stars[s].label}`,
      a_AU: aSplit,
      e: eBin,
      regime: aSplit < 5 ? 'Close Binary' : 'Wide Binary',
      sMaxA: +Math.max(0, sA).toFixed(2),
      sMaxB: +Math.max(0, sB).toFixed(2),
      pMin: +pM.toFixed(2),
    });
  }

  // Convert planets & moons
  const bodies: Array<RealisticPlanetBody | RealisticBeltBody> = [];

  for (const pEntry of planetBlocks) {
    const pb = pEntry.block;
    const tel = pb.commentTelemetry || {};

    // Check if this `planet` block is actually an asteroid in a belt (`pc_asteroid`, `pc_ice_asteroid`, `pc_crystal_asteroid`)
    const clsLower = pb.stellarisClass.toLowerCase();
    if (clsLower.includes('asteroid')) {
      const aBelt =
        config.preferCommentedStargenTelemetry && tel.semi_major_axis_au
          ? parseFloat(tel.semi_major_axis_au) || convertStellarisDistanceToAU(pEntry.cumulativeDist, config)
          : convertStellarisDistanceToAU(pEntry.cumulativeDist, config);

      // Avoid duplicating a belt at virtually the same AU
      const existingBelt = bodies.find(
        (b) => b.kind === 'belt' && Math.abs(b.a - aBelt) < Math.max(0.15, aBelt * 0.12)
      );
      if (!existingBelt) {
        bodies.push({
          kind: 'belt',
          role: clsLower.includes('ice') ? 'Kuiper / Outer Debris Belt' : 'Main Asteroid Belt',
          a: aBelt,
          a_birth: aBelt,
          beltWidth: +(aBelt * 0.18).toFixed(3),
          rawSlotMassEarth: 0.05,
          massEarth: 0.002,
          incDeg: 4.2,
          omegaNodeDeg: 45,
        });
      }
      continue;
    }

    const a_AU =
      config.preferCommentedStargenTelemetry && tel.semi_major_axis_au
        ? parseFloat(tel.semi_major_axis_au) || convertStellarisDistanceToAU(pEntry.cumulativeDist, config)
        : convertStellarisDistanceToAU(pEntry.cumulativeDist, config);

    const sizeConverted = convertStellarisSizeToRadiusAndMass(pb.size, pb.stellarisClass, false, config);
    const radiusEarth =
      config.preferCommentedStargenTelemetry && tel.radius_earth
        ? parseFloat(tel.radius_earth) || sizeConverted.radiusEarth
        : sizeConverted.radiusEarth;
    const massEarth =
      config.preferCommentedStargenTelemetry && tel.mass_earth
        ? parseFloat(tel.mass_earth) || sizeConverted.massEarth
        : sizeConverted.massEarth;

    const profile = mapStellarisPlanetClassToStargenProfile(pb.stellarisClass);
    const preset = ATMOSPHERE_PRESETS[profile.atmosphereType] || ATMOSPHERE_PRESETS['Airless Vacuum'];
    const isGiant = sizeConverted.gasFrac > 0.05;

    const defaultMag: RealisticMagneticField = {
      surfaceFieldGauss: isGiant ? 4.2 : massEarth > 0.4 ? 0.45 : 0.01,
      surfaceFieldMicroTesla: isGiant ? 420 : massEarth > 0.4 ? 45 : 1,
      magneticMomentEarth: +(Math.pow(massEarth, 0.8)).toFixed(2),
      dynamoStatus: isGiant ? 'Metallic-Hydrogen Dynamo' : massEarth > 0.4 ? 'Active Core Dynamo' : 'Remnant Crustal',
      hasActiveDynamo: isGiant || massEarth > 0.4,
      coreState: isGiant ? 'Liquid Metallic Hydrogen' : massEarth > 0.4 ? 'Convecting Molten Outer Core' : 'Solidified Inactive Core',
      magnetopauseRadiusRp: isGiant ? 28 : 9.5,
      bowShockRadiusRp: isGiant ? 35 : 12.8,
      shieldingEfficiencyPct: isGiant ? 99 : massEarth > 0.4 ? 85 : 15,
      radiationLevel: isGiant ? 'Extreme' : massEarth > 0.4 ? 'Minimal' : 'High',
      auroraDescription: isGiant ? 'Intense Polar Curtains' : 'Moderate',
      biosphereImplication: massEarth > 0.4 ? 'Protects Atmospheric Envelope' : 'Vulnerable to Stellar Winds',
    };

    const rawPlanet: RealisticPlanetBody = {
      kind: 'planet',
      role: pb.name || 'Imported World',
      a: a_AU,
      a_birth: a_AU,
      e: tel.eccentricity ? parseFloat(tel.eccentricity) || 0.02 : 0.02,
      incDeg: tel.inclination_deg ? parseFloat(tel.inclination_deg) || 1.1 : 1.1,
      omegaNodeDeg: +(pb.orbitAngle || 0).toFixed(1),
      argPeriDeg: 0,
      migrationHistory: 'In-Situ Accretion (Stellaris Import)',
      massEarth,
      massJup: +(massEarth / 317.83).toFixed(5),
      radiusEarth,
      densityGcm3: +((5.514 * massEarth) / Math.pow(radiusEarth, 3)).toFixed(2),
      gravityG: +(massEarth / (radiusEarth * radiusEarth)).toFixed(3),
      rockFrac: sizeConverted.rockFrac,
      iceFrac: sizeConverted.iceFrac,
      gasFrac: sizeConverted.gasFrac,
      T_eq: 255,
      T_atm: 255,
      surfaceTempK: 288,
      greenhouseK: 33,
      muMin: isGiant ? 2.0 : 16.0,
      albedo: profile.albedo,
      pressureBar: isGiant ? null : preset.pressureBar,
      sudarskyClass: isGiant ? 'Class I (Ammonia Clouds)' : null,
      planetClass: profile.planetClass,
      atmosphereType: profile.atmosphereType,
      gases: { ...preset.gases },
      hydrosphere: profile.hydrosphere,
      rings: pb.hasRing ? 'Prominent Planetary Ring System' : null,
      ringSystem: pb.hasRing
        ? {
            ringClass: 'Silicate-Ice Ring System',
            innerRadiusRp: 1.35,
            outerRadiusRp: 2.25,
            innerRadiusKm: Math.round(radiusEarth * 6371 * 1.35),
            outerRadiusKm: Math.round(radiusEarth * 6371 * 2.25),
            massLunar: 0.002,
            massTt: 150,
            rockFrac: 0.35,
            iceFrac: 0.6,
            metalFrac: 0.05,
            compositionLabel: 'Water Ice & Silicate Dust',
            opticalDepth: 0.65,
          }
        : null,
      rocheLimitRp: 2.44,
      moons: [],
      orbitalPeriodDays: 365.25,
      rotationHours: isGiant ? 10.5 : 24.0,
      spinState: 'Prograde Asynchronous',
      axialTiltDeg: 21.5,
      magneticField: defaultMag,
      hostStarTeff: primaryStar.Teff,
      hostStarCategory: primaryStar.category,
      hostStarSpectralType: primaryStar.spectralType,
      hostStarLabel: primaryStar.label,
      hostStarColorHex: primaryStar.colorHex,
      zoneIdx: 0,
    };

    const calculatedPlanet = autoCalculatePlanetPhysics(rawPlanet, hostMass, hostLum);

    // Convert moons
    let runningMoonDist = 0;
    calculatedPlanet.moons = pb.moons.map((mb, mIdx) => {
      const mTel = mb.commentTelemetry || {};
      runningMoonDist += (mb.changeOrbitBefore || 0) + (mb.orbitDistance || 6);
      const a_Rp =
        config.preferCommentedStargenTelemetry && mTel.semi_major_axis_rp
          ? parseFloat(mTel.semi_major_axis_rp) || Math.max(3.5, runningMoonDist * 1.6)
          : Math.max(3.5, +(runningMoonDist * 1.6).toFixed(1));

      const mSizeConv = convertStellarisSizeToRadiusAndMass(mb.size, mb.stellarisClass, true, config);
      const mRadEarth =
        config.preferCommentedStargenTelemetry && mTel.radius_earth
          ? parseFloat(mTel.radius_earth) || mSizeConv.radiusEarth
          : mSizeConv.radiusEarth;
      const mMassEarth =
        config.preferCommentedStargenTelemetry && mTel.mass_earth
          ? parseFloat(mTel.mass_earth) || mSizeConv.massEarth
          : mSizeConv.massEarth;

      const mProfile = mapStellarisPlanetClassToStargenProfile(mb.stellarisClass);
      const mPreset = ATMOSPHERE_PRESETS[mProfile.atmosphereType] || ATMOSPHERE_PRESETS['Airless Vacuum'];

      const rawMoon: RealisticMoon = {
        id: `moon-${calculatedPlanet.role || 'planet'}-${mIdx + 1}`,
        name: mb.name || `Moon ${mIdx + 1}`,
        origin: 'Co-Accretion Disk',
        moonClass: mSizeConv.iceFrac >= 0.45 ? 'Ice Moon' : 'Silicate Rocky Moon',
        a_Rp,
        a_km: Math.round(a_Rp * calculatedPlanet.radiusEarth * 6371),
        periodDays: 5.0,
        e: 0.008,
        incDeg: 0.5,
        retrograde: false,
        massLunar: +(mMassEarth / 0.0123).toFixed(3),
        massEarth: mMassEarth,
        radiusKm: Math.round(mRadEarth * 6371),
        radiusEarth: mRadEarth,
        densityGcm3: +((5.514 * mMassEarth) / Math.pow(mRadEarth, 3)).toFixed(2),
        gravityG: +(mMassEarth / (mRadEarth * mRadEarth)).toFixed(3),
        rockFrac: mSizeConv.rockFrac,
        iceFrac: mSizeConv.iceFrac,
        gasFrac: 0,
        albedo: mProfile.albedo,
        T_eq: calculatedPlanet.T_eq,
        T_atm: calculatedPlanet.T_eq,
        surfaceTempK: calculatedPlanet.T_eq,
        greenhouseK: 0,
        tidalW: 1e11,
        tidalFluxWm2: 0.02,
        muMin: 28,
        pressureBar: mPreset.pressureBar,
        atmosphereType: mProfile.atmosphereType,
        gases: { ...mPreset.gases },
        hydrosphere: mProfile.hydrosphere,
        rotationHours: 72,
        spinState: '1:1 Tidally Locked',
        axialTiltDeg: 1.5,
        magneticField: defaultMag,
      };

      return autoCalculateMoonPhysics(rawMoon, calculatedPlanet, hostLum);
    });

    bodies.push(calculatedPlanet);
  }

  // Also add explicit `asteroid_belt = { ... }` blocks if not already covered by `pc_asteroid` planets
  for (const belt of parsed.belts) {
    const bTel = belt.commentTelemetry || {};
    const aBelt =
      config.preferCommentedStargenTelemetry && bTel.semi_major_axis_au
        ? parseFloat(bTel.semi_major_axis_au) || convertStellarisDistanceToAU(belt.radius, config)
        : convertStellarisDistanceToAU(belt.radius, config);

    const duplicate = bodies.find(
      (b) => b.kind === 'belt' && Math.abs(b.a - aBelt) < Math.max(0.15, aBelt * 0.12)
    );
    if (!duplicate) {
      bodies.push({
        kind: 'belt',
        role: belt.type.includes('icy') ? 'Kuiper / Outer Debris Belt' : 'Main Asteroid Belt',
        a: aBelt,
        a_birth: aBelt,
        beltWidth: +(aBelt * 0.18).toFixed(3),
        rawSlotMassEarth: 0.05,
        massEarth: 0.002,
        incDeg: 4.2,
        omegaNodeDeg: 45,
      });
    }
  }

  // Sort bodies by semi-major axis
  bodies.sort((a, b) => a.a - b.a);

  const a_snow = +(2.7 * Math.sqrt(Math.max(0.01, hostLum))).toFixed(2);
  const maxBodyAU = bodies.length > 0 ? Math.max(...bodies.map((b) => b.a)) : 30;
  const minBodyAU = bodies.length > 0 ? Math.min(...bodies.map((b) => b.a)) : 0.1;

  const zone: RealisticPlanetaryZone = {
    title:
      stars.length > 1
        ? `Primary Planetary Zone (Star A • ${primaryStar.spectralType})`
        : `Circumstellar Disk (Star A • ${primaryStar.spectralType})`,
    mass: hostMass,
    lum: hostLum,
    a_in: +Math.min(0.05, minBodyAU * 0.5).toFixed(3),
    a_out: +Math.max(50, maxBodyAU * 1.5).toFixed(1),
    a_snow,
    archetype: 'A',
    probs: { A: 0.7, B: 0.1, C: 0.1, D: 0.1 },
    diskMassEarth: +bodies.reduce((sum, b) => sum + (b.massEarth || 0), 0).toFixed(2),
    bodies,
    starTeff: primaryStar.Teff,
    starCategory: primaryStar.category,
    starSpectralType: primaryStar.spectralType,
    starLabel: primaryStar.label,
    starColorHex: primaryStar.colorHex,
  };

  const totalMassSol = +stars.reduce((acc, s) => acc + s.mass, 0).toFixed(3);
  const seed = seedFromId(parsed.id || parsed.name);

  const result: RealisticStarSystemResult = {
    roll: (seed % 9000) + 1000,
    seedUsed: seed,
    step1: {
      id: parsed.id,
      name: parsed.name,
      sysMass: totalMassSol,
      age: sysAge,
      feh: sysFeh,
      forcedMult: String(stars.length) as '1' | '2' | '3' | '4',
      seed,
    },
    hierarchy: {
      archName:
        stars.length === 1
          ? 'Single Star (Stellaris Import)'
          : `${stars.length}-Star Hierarchy (Stellaris Import)`,
      stars,
      splits,
      zones: [
        {
          title: zone.title,
          mass: hostMass,
          lum: hostLum,
          age: sysAge,
          feh: sysFeh,
          a_in: zone.a_in,
          a_out: zone.a_out,
          starTeff: primaryStar.Teff,
          starCategory: primaryStar.category,
          starSpectralType: primaryStar.spectralType,
          starLabel: primaryStar.label,
          starColorHex: primaryStar.colorHex,
        },
      ],
    },
    zones: [zone],
  };

  sanitizeRealisticSystem(result);
  return result;
}
