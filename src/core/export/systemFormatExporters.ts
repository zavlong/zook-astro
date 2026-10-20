import {
  RealisticBeltBody,
  RealisticPlanetBody,
  RealisticStarSystemResult,
  getMoonVisualColor,
  getPlanetVisualColor,
  mapRealisticPlanetToArchitectClass,
  mapRealisticStarToArchitectClass,
  sanitizeRealisticSystem,
} from '../generation/realisticStarGen';
import {
  RealisticHydrosphere,
  RealisticMagneticField,
  RealisticMoon,
  RealisticStarNode,
} from '../../types/astrophysics';
import { calculatePlanetSize } from '../../types/architect';
import {
  resolveMoonClass,
  resolvePlanetClass,
} from '../astrophysics/classifier';
import {
  deriveCrustCompositionPalette,
  getFloraPigmentPalette,
  getSolventSeaPalette,
} from '../../components/stargen/surface/surfaceGenMath';

export type ExportFormatType = 'stargen' | 'spaceengine' | 'stellaris';

function hexToRgb01(hex: string): [number, number, number] {
  const clean = (hex || '#888888').replace('#', '').trim();
  const num = parseInt(clean, 16) || 0x888888;
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return [r, g, b];
}

function fmtRgb3(rgb01: [number, number, number]): string {
  return `(${rgb01[0].toFixed(3)} ${rgb01[1].toFixed(3)} ${rgb01[2].toFixed(3)})`;
}

function fmtRgba4(rgb255: [number, number, number], alpha: number): string {
  return `(${(rgb255[0] / 255).toFixed(3)}, ${(rgb255[1] / 255).toFixed(3)}, ${(rgb255[2] / 255).toFixed(3)}, ${alpha.toFixed(3)})`;
}

function hashFloat(str: string, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000000) / 1000000;
}

/**
 * Maps a Zook Astro planet or moon class to SpaceEngine's native Class string.
 */
function resolveSpaceEngineClass(
  cleanClass: string,
  massEarth: number,
  gasFrac: number,
  iceFrac: number,
  Tsurf: number,
  hasLiquid: boolean,
  pBar: number | null
): string {
  const c = cleanClass.toLowerCase();
  if (gasFrac >= 0.015 || massEarth >= 15) {
    if (c.includes('ice giant') || c.includes('neptune') || (iceFrac > gasFrac && massEarth < 65)) {
      return 'Neptune';
    }
    return 'Jupiter';
  }
  if (c.includes('supercritical') || c.includes('water giant') || c.includes('steam') || c.includes('ocean') || c.includes('pelagic') || c.includes('aquatic')) {
    return hasLiquid || c.includes('supercritical') ? 'Oceania' : 'Terra';
  }
  if (iceFrac >= 0.15 && Tsurf < 260) {
    return (pBar ?? 0) > 0.05 ? 'Titan' : 'Aquaria';
  }
  if ((pBar ?? 0) < 0.005) {
    return Tsurf > 450 ? 'Ferria' : 'Selena';
  }
  if (c.includes('arid') || c.includes('desert') || c.includes('martian') || !hasLiquid) {
    return 'Desert';
  }
  return 'Terra';
}

/**
 * Maps a RealisticMoon into a Stellaris planet class
 */
function mapRealisticMoonToStellarisClass(m: RealisticMoon): string {
  const mc = m.moonClass;
  if (mc.includes('Volcanic') || mc.includes('Io') || m.surfaceTempK >= 800) return 'pc_molten';
  if (
    mc.includes('Titan') ||
    mc.includes('SO2-Ocean') ||
    mc.includes('Sulfuric Acid') ||
    mc.includes('CO2-Ocean') ||
    mc.includes('Cryo-Ammonia') ||
    mc.includes('Supercritical')
  ) {
    return 'pc_toxic';
  }
  if (mc.includes('Habitable') || (m.hydrosphere?.solvent === 'H2O' && (m.hydrosphere?.coveragePct ?? 0) > 0 && m.surfaceTempK >= 250 && m.surfaceTempK <= 340)) {
    return (m.hydrosphere?.coveragePct ?? 0) >= 85 ? 'pc_ocean' : 'pc_continental';
  }
  if (mc.includes('Europa') || mc.includes('Icy') || mc.includes('Triton') || m.iceFrac >= 0.15) {
    return 'pc_frozen';
  }
  return m.T_eq < 180 ? 'pc_barren_cold' : 'pc_barren';
}

/**
 * Formats a single Planet or Moon into SpaceEngine .sc format, with all unused Stargen
 * astrophysical fields and inactive SpaceEngine blocks preserved as `//` comments.
 */
export function formatBodyAsSpaceEngineSc(params: {
  blockType: 'Planet' | 'Moon';
  bodyName: string;
  parentName: string;
  cleanClass: string;
  role?: string;
  origin?: string;
  migrationHistory?: string;
  a_AU?: number;
  a_birth_AU?: number;
  a_km?: number;
  a_Rp?: number;
  periodYr: number;
  periodDays: number;
  e: number;
  incDeg: number;
  omegaNodeDeg: number;
  argPeriDeg: number;
  retrograde?: boolean;
  massEarth: number;
  massJup?: number;
  massLunar?: number;
  radiusEarth: number;
  radiusKm: number;
  densityGcm3: number;
  gravityG: number;
  rockFrac: number;
  iceFrac: number;
  gasFrac: number;
  albedo: number;
  T_eq: number;
  T_atm: number;
  surfaceTempK: number;
  greenhouseK: number;
  tidalW?: number;
  tidalFluxWm2?: number;
  muMin: number;
  pressureBar: number | null;
  sudarskyClass?: string | null;
  atmosphereType: string;
  gases: Record<string, number>;
  hydrosphere: RealisticHydrosphere | null;
  rings?: string | null;
  ringSystem?: RealisticPlanetBody['ringSystem'];
  rocheLimitRp?: number;
  rotationHours: number;
  spinState: string;
  axialTiltDeg: number;
  magneticField?: RealisticMagneticField;
  visualHex: string;
  starTeff?: number;
}): string {
  const {
    blockType,
    bodyName,
    parentName,
    cleanClass,
    role,
    origin,
    migrationHistory,
    a_AU,
    a_birth_AU,
    a_km,
    a_Rp,
    periodYr,
    periodDays,
    e,
    incDeg,
    omegaNodeDeg,
    argPeriDeg,
    retrograde,
    massEarth,
    massJup,
    massLunar,
    radiusEarth,
    radiusKm,
    densityGcm3,
    gravityG,
    rockFrac,
    iceFrac,
    gasFrac,
    albedo,
    T_eq,
    T_atm,
    surfaceTempK,
    greenhouseK,
    tidalW,
    tidalFluxWm2,
    muMin,
    pressureBar,
    sudarskyClass,
    atmosphereType,
    gases,
    hydrosphere,
    rings,
    ringSystem,
    rocheLimitRp,
    rotationHours,
    spinState,
    axialTiltDeg,
    magneticField,
    visualHex,
    starTeff = 5778,
  } = params;

  const isGasGiant = gasFrac >= 0.015 || massEarth >= 15;
  const isSupercritical =
    !isGasGiant &&
    (Boolean(hydrosphere?.solvent?.includes('Supercritical')) ||
      Boolean(hydrosphere?.state?.includes('Supercritical')) ||
      cleanClass.includes('Supercritical') ||
      cleanClass.includes('Water Giant') ||
      cleanClass.includes('Steam'));
  const isNoSurface = isGasGiant || isSupercritical;
  const isMolten = !isNoSurface && (surfaceTempK >= 800 || cleanClass.includes('Molten') || cleanClass.includes('Lava'));
  const coveragePct = hydrosphere?.coveragePct ?? 0;
  const hasLiquid = !isNoSurface && coveragePct > 0 && hydrosphere?.solvent !== 'None';
  const hasBiosphere = Boolean(!isNoSurface && hydrosphere?.biosphere && hydrosphere.biosphere !== 'none');

  const seClass = resolveSpaceEngineClass(
    cleanClass,
    massEarth,
    gasFrac,
    iceFrac,
    surfaceTempK,
    hasLiquid,
    pressureBar
  );

  // Moment of inertia factor I / (M R^2): ~0.25 for gas giants, ~0.31-0.35 for differentiated rocky/icy bodies
  const inertiaMoment = isGasGiant
    ? +(0.245 + rockFrac * 0.08).toFixed(6)
    : +(0.315 + rockFrac * 0.025 + iceFrac * 0.015).toFixed(6);

  // Rotational oblateness approximated from rotation rate and density
  const rotHrsAbs = Math.max(2, Math.abs(rotationHours || 24));
  const oblateness = +Math.min(
    0.12,
    Math.max(0.00001, (18.5 / (rotHrsAbs * rotHrsAbs * Math.max(0.6, densityGcm3))) * (isGasGiant ? 2.4 : 1.0))
  ).toFixed(8);

  const eqAscendNode = +((hashFloat(bodyName, 101) * 360 - 180).toFixed(4));
  const meanAnomaly = +((hashFloat(bodyName, 202) * 360).toFixed(3));
  const albedoBond = +Math.max(0.01, Math.min(0.95, albedo)).toFixed(6);
  const albedoGeom = +Math.max(0.01, Math.min(0.99, albedo * 1.2)).toFixed(6);
  const rgb01 = hexToRgb01(visualHex);

  const seaPalette = getSolventSeaPalette(isMolten ? 'Silicate Magma' : hydrosphere?.solvent);
  const crustPalette = deriveCrustCompositionPalette({
    rockFrac,
    iceFrac,
    densityGcm3,
    albedo,
    tidalW: tidalW ?? 0,
    pressureBar,
    gases,
    solventKey: seaPalette.solventKey,
    coverageFrac: coveragePct / 100,
    Tbase: surfaceTempK,
    bodyClassLower: cleanClass.toLowerCase(),
    isIcyWorld: iceFrac >= 0.15 && surfaceTempK < 273,
    isMoltenWorld: isMolten,
    hasBiosphere,
  });
  const floraPalette = getFloraPigmentPalette(hasBiosphere, seaPalette.solventKey, starTeff, crustPalette);

  const randX = +(hashFloat(bodyName, 301) * 2 - 1).toFixed(3);
  const randY = +(hashFloat(bodyName, 302) * 2 - 1).toFixed(3);
  const randZ = +(hashFloat(bodyName, 303) * 2 - 1).toFixed(3);

  const bumpHeight = isNoSurface ? 0 : +(Math.max(2.5, (14.5 / Math.max(0.25, gravityG)) * (0.6 + rockFrac * 0.5))).toFixed(4);
  const oceanHeight = hasLiquid
    ? +(Math.max(1.5, Math.min(bumpHeight * 0.85, (hydrosphere?.liqKm || 4.0) * 1.2))).toFixed(5)
    : +(bumpHeight * 0.45).toFixed(5);

  const lines: string[] = [];
  lines.push(`${blockType}    "${bodyName}"`);
  lines.push(`{`);
  lines.push(``);
  lines.push(`ParentBody     "${parentName}"`);
  lines.push(`Class          "${seClass}"`);
  lines.push(`Mass            ${(+massEarth.toFixed(6))}`);
  lines.push(`Radius          ${(+radiusKm.toFixed(2))}`);
  lines.push(`InertiaMoment   ${inertiaMoment}`);
  lines.push(`Oblateness      ${oblateness}`);
  lines.push(``);
  lines.push(`RotationPeriod  ${(+(retrograde ? -Math.abs(rotationHours) : rotationHours).toFixed(4))}`);
  lines.push(`Obliquity       ${(+axialTiltDeg.toFixed(4))}`);
  lines.push(`EqAscendNode    ${eqAscendNode}`);
  lines.push(``);
  lines.push(`AlbedoBond      ${albedoBond}`);
  lines.push(`AlbedoGeom      ${albedoGeom}`);
  lines.push(`Brightness      2`);
  lines.push(`Color          ${fmtRgb3(rgb01)}`);
  lines.push(``);

  // Commented-out Stargen telemetry not natively consumed by SpaceEngine's root block
  lines.push(`// --- Stargen Astrophysical Telemetry (Unused by SpaceEngine) ---`);
  lines.push(`// StargenClass        "${cleanClass}"`);
  if (role) lines.push(`// OrbitalRole         "${role}"`);
  if (origin) lines.push(`// MoonOrigin          "${origin}"`);
  if (migrationHistory) lines.push(`// MigrationHistory    "${migrationHistory}"`);
  if (a_birth_AU !== undefined) lines.push(`// BirthSemiMajorAxis  ${a_birth_AU} AU`);
  if (massJup !== undefined) lines.push(`// MassJupiter         ${massJup}`);
  if (massLunar !== undefined) lines.push(`// MassLunar           ${massLunar}`);
  lines.push(`// RadiusEarth         ${radiusEarth}`);
  lines.push(`// BulkDensityGcm3     ${densityGcm3}`);
  lines.push(`// SurfaceGravityG     ${gravityG}`);
  lines.push(`// EscapeVelocityKmS   ${(+(Math.sqrt(massEarth / Math.max(0.01, radiusEarth)) * 11.186).toFixed(2))}`);
  lines.push(`// BulkComposition     { RockFrac ${rockFrac} IceFrac ${iceFrac} GasFrac ${gasFrac} }`);
  lines.push(`// EquilibriumTempK    ${T_eq}`);
  lines.push(`// TropopauseTempK     ${T_atm}`);
  lines.push(`// SurfaceTempK        ${surfaceTempK}`);
  lines.push(`// GreenhouseDeltaK    ${greenhouseK}`);
  lines.push(`// MinMolecularWeight  ${muMin}`);
  lines.push(`// SpinState           "${spinState}"`);
  if (sudarskyClass) lines.push(`// SudarskyClass       "${sudarskyClass}"`);
  if (rocheLimitRp !== undefined) lines.push(`// RocheLimitRp        ${rocheLimitRp}`);
  if (tidalW !== undefined) lines.push(`// TidalHeatingW       ${tidalW}`);
  if (tidalFluxWm2 !== undefined) lines.push(`// TidalFluxWm2        ${tidalFluxWm2}`);
  if (hydrosphere) {
    lines.push(
      `// HydrosphereLayers   { State "${hydrosphere.state}" Solvent "${hydrosphere.solvent || 'None'}" CoveragePct ${
        hydrosphere.coveragePct ?? 0
      } LiqKm ${hydrosphere.liqKm} SupercritKm ${hydrosphere.scKm} IceIShellKm ${hydrosphere.iceKm} HighPressIceKm ${
        hydrosphere.siKm
      } CrustKm ${hydrosphere.crustKm ?? 0} }`
    );
  }
  if (magneticField) {
    lines.push(
      `// MagneticField       { SurfaceGauss ${magneticField.surfaceFieldGauss} MicroTesla ${magneticField.surfaceFieldMicroTesla} MomentEarth ${magneticField.magneticMomentEarth} Dynamo "${magneticField.dynamoStatus}" MagnetopauseRp ${magneticField.magnetopauseRadiusRp} ShieldingPct ${magneticField.shieldingEfficiencyPct} Radiation "${magneticField.radiationLevel}" }`
    );
  }
  lines.push(``);

  // Life Block (Active if biosphere exists; commented out if sterile)
  const bioStr = (hydrosphere?.biosphere || '').toLowerCase();
  const lifeClass =
    hydrosphere?.solvent && hydrosphere.solvent !== 'H2O' && hydrosphere.solvent !== 'H2O + CO2'
      ? 'Exotic'
      : 'Organic';
  const lifeType = bioStr.includes('unicellular') || bioStr.includes('microb') ? 'Unicellular' : 'Multicellular';
  const lifeBiome = coveragePct >= 92 ? 'Marine' : 'Terrestrial / Marine';
  const lp = hasBiosphere ? '' : '// ';
  lines.push(`${lp}Life`);
  lines.push(`${lp}{`);
  lines.push(`${lp}`);
  lines.push(`${lp}Class   "${lifeClass}"`);
  lines.push(`${lp}Type    "${lifeType}"`);
  lines.push(`${lp}Biome   "${hasBiosphere ? lifeBiome : 'None'}"`);
  if (hydrosphere?.biosphere) {
    lines.push(`// StargenBiosphere "${hydrosphere.biosphere}"`);
  }
  lines.push(`${lp}}`);
  lines.push(``);

  // Surface Block
  const seaLevelNorm = hasLiquid ? +(coveragePct / 100).toFixed(6) : 0.0;
  const snowLevel = surfaceTempK < 250 ? 0.15 : surfaceTempK > 330 ? 0.98 : 0.84;
  const icecapLat = surfaceTempK < 245 ? 0.0 : surfaceTempK > 315 ? 0.96 : +(Math.max(0.35, Math.min(0.95, (surfaceTempK - 240) / 75))).toFixed(6);
  const craterDens = (pressureBar ?? 0) < 0.02 ? 0.85 : (pressureBar ?? 0) < 0.5 ? 0.32 : 0.0;
  const volcAct = isMolten ? 0.95 : rockFrac > 0.3 && massEarth > 0.25 ? 0.35 : 0.08;
  const lavaSun = isMolten ? +(Math.min(1, Math.max(0.1, (surfaceTempK - 750) / 750))).toFixed(4) : 0;
  const lavaTidal = (tidalFluxWm2 ?? 0) > 1.5 ? +(Math.min(1, (tidalFluxWm2 ?? 0) / 25)).toFixed(4) : 0;

  const surfPrefix = isNoSurface ? '// ' : '';
  lines.push(`${surfPrefix}Surface`);
  lines.push(`${surfPrefix}{`);
  lines.push(`${surfPrefix}`);
  lines.push(`${surfPrefix}SurfStyle       ${(+(0.02 + hashFloat(bodyName, 401) * 0.65).toFixed(6))}`);
  lines.push(`${surfPrefix}OceanStyle      ${(+(0.45 + hashFloat(bodyName, 402) * 0.45).toFixed(5))}`);
  lines.push(`${surfPrefix}Randomize      (${randX}, ${randY}, ${randZ})`);
  lines.push(`${surfPrefix}colorDistMagn   ${(+(0.035 + hashFloat(bodyName, 403) * 0.045).toFixed(7))}`);
  lines.push(`${surfPrefix}colorDistFreq   ${(+(550 + hashFloat(bodyName, 404) * 450).toFixed(3))}`);
  lines.push(`${surfPrefix}detailScale     ${(+(radiusKm * 2.57).toFixed(1))}`);
  lines.push(`${surfPrefix}colorConversion true`);
  lines.push(`${surfPrefix}drivenDarkening -1`);
  lines.push(`${surfPrefix}seaLevel        ${seaLevelNorm}`);
  lines.push(`${surfPrefix}snowLevel       ${snowLevel}`);
  lines.push(`${surfPrefix}tropicLatitude  ${(+(Math.sin((axialTiltDeg * Math.PI) / 180)).toFixed(7))}`);
  lines.push(`${surfPrefix}icecapLatitude  ${icecapLat}`);
  lines.push(`${surfPrefix}icecapHeight    ${(+(0.42 + iceFrac * 0.35).toFixed(6))}`);
  lines.push(`${surfPrefix}climatePole     0.9375`);
  lines.push(`${surfPrefix}climateTropic   0.522706`);
  lines.push(`${surfPrefix}climateEquator  0.6875`);
  lines.push(`${surfPrefix}heightTempGrad  0.414794`);
  lines.push(`${surfPrefix}tropicWidth     0.374003`);
  lines.push(`${surfPrefix}mainFreq        ${(+(0.95 + hashFloat(bodyName, 405) * 0.45).toFixed(4))}`);
  lines.push(`${surfPrefix}venusFreq       0.653746`);
  lines.push(`${surfPrefix}venusMagn       ${(pressureBar ?? 0) > 15 ? 0.65 : 0}`);
  lines.push(`${surfPrefix}mareFreq        3.10486`);
  lines.push(`${surfPrefix}mareDensity     ${(+(craterDens * 0.18).toFixed(6))}`);
  lines.push(`${surfPrefix}terraceProb     0.253474`);
  lines.push(`${surfPrefix}erosion         ${hasLiquid ? 0.24 : (pressureBar ?? 0) > 0.1 ? 0.08 : 0.0}`);
  lines.push(`${surfPrefix}montesMagn      ${(+(0.12 + rockFrac * 0.08).toFixed(6))}`);
  lines.push(`${surfPrefix}montesFreq      ${(+(280 + hashFloat(bodyName, 406) * 160).toFixed(3))}`);
  lines.push(`${surfPrefix}montesSpiky     0.894682`);
  lines.push(`${surfPrefix}montesFraction  0.519249`);
  lines.push(`${surfPrefix}dunesMagn       0.0468856`);
  lines.push(`${surfPrefix}dunesFreq       54.408`);
  lines.push(`${surfPrefix}dunesFraction   ${hasLiquid ? 0.25 : 0.85}`);
  lines.push(`${surfPrefix}hillsMagn       0.130191`);
  lines.push(`${surfPrefix}hillsFreq       980.783`);
  lines.push(`${surfPrefix}hillsFraction   0.0357427`);
  lines.push(`${surfPrefix}hills2Fraction  0.817134`);
  lines.push(`${surfPrefix}riversMagn      ${hasLiquid ? 58.1157 : 0}`);
  lines.push(`${surfPrefix}riversFreq      2.85878`);
  lines.push(`${surfPrefix}riversSin       7.62415`);
  lines.push(`${surfPrefix}riversOctaves   ${hasLiquid ? 2 : 0}`);
  lines.push(`${surfPrefix}canyonsMagn     0.0632909`);
  lines.push(`${surfPrefix}canyonsFreq     100`);
  lines.push(`${surfPrefix}canyonFraction  0.0454924`);
  lines.push(`${surfPrefix}cracksMagn      ${iceFrac >= 0.15 ? 0.14 : 0.0824855}`);
  lines.push(`${surfPrefix}cracksFreq      0.811998`);
  lines.push(`${surfPrefix}cracksOctaves   ${iceFrac >= 0.15 ? 3 : 0}`);
  lines.push(`${surfPrefix}craterMagn      0.752975`);
  lines.push(`${surfPrefix}craterFreq      25.728`);
  lines.push(`${surfPrefix}craterDensity   ${craterDens}`);
  lines.push(`${surfPrefix}craterOctaves   ${craterDens > 0 ? 4 : 0}`);
  lines.push(`${surfPrefix}craterRayedFactor ${craterDens > 0 ? 0.35 : 0}`);
  lines.push(`${surfPrefix}volcanoMagn     0.712696`);
  lines.push(`${surfPrefix}volcanoFreq     0.703719`);
  lines.push(`${surfPrefix}volcanoDensity  ${(+(volcAct * 0.65).toFixed(6))}`);
  lines.push(`${surfPrefix}volcanoOctaves  3`);
  lines.push(`${surfPrefix}volcanoActivity ${volcAct}`);
  lines.push(`${surfPrefix}volcanoFlows    0.479296`);
  lines.push(`${surfPrefix}volcanoRadius   0.552217`);
  lines.push(`${surfPrefix}volcanoTemp     ${Math.max(1250, surfaceTempK + 600)}`);
  lines.push(`${surfPrefix}lavaCoverTidal  ${lavaTidal}`);
  lines.push(`${surfPrefix}lavaCoverSun    ${lavaSun}`);
  lines.push(`${surfPrefix}lavaCoverYoung  0`);
  lines.push(`${surfPrefix}stripeZones     ${isGasGiant ? 6.5 : 1.14778}`);
  lines.push(`${surfPrefix}stripeFluct     ${isGasGiant ? 0.35 : 0}`);
  lines.push(`${surfPrefix}stripeTwist     ${isGasGiant ? 0.45 : 0}`);
  lines.push(`${surfPrefix}cycloneMagn     ${isNoSurface ? 3.4 : 2.40332}`);
  lines.push(`${surfPrefix}cycloneFreq     0.639954`);
  lines.push(`${surfPrefix}cycloneDensity  ${isNoSurface ? 0.65 : 0.419004}`);
  lines.push(`${surfPrefix}cycloneOctaves  ${isNoSurface ? 3 : 2}`);
  lines.push(`${surfPrefix}colorSea       ${fmtRgba4(seaPalette.deepRgb, 1.0)}`);
  lines.push(`${surfPrefix}colorShelf     ${fmtRgba4(seaPalette.shallowRgb, 1.0)}`);
  lines.push(`${surfPrefix}colorBeach     ${fmtRgba4(crustPalette.lowlandRgb, 0.0)}`);
  lines.push(`${surfPrefix}colorDesert    ${fmtRgba4(crustPalette.plateauRgb, 0.0)}`);
  lines.push(`${surfPrefix}colorLowland   ${fmtRgba4(crustPalette.lowlandRgb, 0.0)}`);
  lines.push(`${surfPrefix}colorUpland    ${fmtRgba4(crustPalette.plateauRgb, 0.0)}`);
  lines.push(`${surfPrefix}colorRock      ${fmtRgba4(crustPalette.mountainRgb, 0.0)}`);
  lines.push(`${surfPrefix}colorSnow      ${fmtRgba4(crustPalette.peakRgb, 1.308)}`);
  lines.push(`${surfPrefix}colorLowPlants ${fmtRgba4(floraPalette.lowRgb, 0.0)}`);
  lines.push(`${surfPrefix}colorUpPlants  ${fmtRgba4(floraPalette.highRgb, 0.0)}`);
  lines.push(`${surfPrefix}BumpHeight      ${bumpHeight}`);
  lines.push(`${surfPrefix}BumpOffset      ${oceanHeight}`);
  lines.push(`${surfPrefix}DiffMapAlpha   "${hasLiquid ? 'Water' : 'Ice'}"`);
  lines.push(`${surfPrefix}SpecBrightWater 0.65`);
  lines.push(`${surfPrefix}SpecBrightIce   0.85`);
  lines.push(`${surfPrefix}SpecularPower   55`);
  lines.push(`${surfPrefix}Hapke           ${(pressureBar ?? 0) < 0.01 ? 0.85 : 0}`);
  lines.push(`${surfPrefix}SpotBright      4`);
  lines.push(`${surfPrefix}SpotWidth       0.05`);
  lines.push(`${surfPrefix}DayAmbient      0.07`);
  lines.push(`${surfPrefix}}`);
  lines.push(``);

  // Clouds Block (Active if atmosphere has clouds or isNoSurface; commented out if airless)
  const hasAtmo = isNoSurface || (pressureBar !== null && pressureBar > 0.001);
  const cp = hasAtmo ? '' : '// ';
  const cloudCov = isNoSurface
    ? 1.0
    : hasAtmo
    ? +Math.min(0.96, Math.max(0.05, 1.0 - Math.exp(-0.55 * Math.pow(pressureBar || 0, 0.58)))).toFixed(6)
    : 0;
  lines.push(`${cp}Clouds`);
  lines.push(`${cp}{`);
  lines.push(`${cp}`);
  lines.push(`${cp}Height          ${isNoSurface ? 45.0 : 4.36572}`);
  lines.push(`${cp}Velocity        ${isNoSurface ? 320.0 : 117.481}`);
  lines.push(`${cp}BumpHeight      4.36566`);
  lines.push(`${cp}Hapke           0.2`);
  lines.push(`${cp}SpotBright      2`);
  lines.push(`${cp}SpotWidth       0.15`);
  lines.push(`${cp}DayAmbient      2`);
  lines.push(`${cp}mainFreq        1.11873`);
  lines.push(`${cp}mainOctaves     10`);
  lines.push(`${cp}Coverage        ${cloudCov}`);
  lines.push(`${cp}stripeZones     ${isNoSurface ? 6.2 : 1.14778}`);
  lines.push(`${cp}stripeFluct     ${isNoSurface ? 0.32 : 0}`);
  lines.push(`${cp}stripeTwist     ${isNoSurface ? 0.42 : 0}`);
  lines.push(`${cp}}`);
  lines.push(``);

  // Ocean Block (Active if hasLiquid; commented out otherwise)
  const op = hasLiquid ? '' : '// ';
  lines.push(`${op}Ocean`);
  lines.push(`${op}{`);
  lines.push(`${op}`);
  lines.push(`${op}Height          ${oceanHeight}`);
  lines.push(`${op}Hapke           0`);
  lines.push(`${op}SpotBright      2`);
  lines.push(`${op}SpotWidth       0.15`);
  lines.push(`${op}DayAmbient      2`);
  if (hydrosphere?.solvent) {
    lines.push(`// Solvent "${hydrosphere.solvent}"`);
  }
  lines.push(`${op}}`);
  lines.push(``);

  lines.push(`NoLava          ${isMolten || lavaTidal > 0 ? 'false' : 'true'}`);
  lines.push(``);

  // Atmosphere Block (Active if hasAtmo; commented out if vacuum)
  const ap = hasAtmo ? '' : '// ';
  const pAtm = isNoSurface ? 100.0 : +(pressureBar || 0).toFixed(5);
  const scaleH = Math.max(4.0, (8.314 * Math.max(50, surfaceTempK)) / (0.029 * Math.max(0.1, gravityG) * 9.81 * 1000));
  const atmoHeight = +(scaleH * 8.5).toFixed(2);
  const atmoDens = +(pAtm * 1.225).toFixed(5);
  lines.push(`${ap}Atmosphere`);
  lines.push(`${ap}{`);
  lines.push(`${ap}`);
  lines.push(`${ap}Model          "${pAtm > 1.5 ? 'Thick' : 'Earth'}"`);
  lines.push(`${ap}Height          ${atmoHeight}`);
  lines.push(`${ap}Density         ${atmoDens}`);
  lines.push(`${ap}Pressure        ${pAtm}`);
  lines.push(`${ap}Greenhouse      ${(+greenhouseK.toFixed(4))}`);
  lines.push(`${ap}Bright          10`);
  lines.push(`${ap}Opacity         1`);
  lines.push(`${ap}SkyLight        3.33333`);
  lines.push(`${ap}Hue             0.428571`);
  lines.push(`${ap}Saturation      1`);
  lines.push(`// StargenAtmosphereType "${atmosphereType}"`);
  lines.push(`${ap}Composition`);
  lines.push(`${ap}{`);
  const gasEntries = Object.entries(gases || {}).filter(([, v]) => v > 0);
  if (gasEntries.length > 0) {
    gasEntries.forEach(([gasName, frac]) => {
      lines.push(`${ap}${gasName.padEnd(10, ' ')}${(+(frac * 100).toFixed(6))}`);
    });
  } else {
    lines.push(`// Vacuum     0`);
  }
  lines.push(`${ap}}`);
  lines.push(``);
  lines.push(`${ap}}`);
  lines.push(``);

  // Aurora Block (Active if active magnetic dynamo + atmosphere; commented out otherwise)
  const hasAurora = Boolean(hasAtmo && magneticField?.hasActiveDynamo);
  const aup = hasAurora ? '' : '// ';
  const aurRadius = +(radiusKm * 0.2).toFixed(2);
  const aurWidth = +(radiusKm * 0.045).toFixed(3);
  lines.push(`${aup}Aurora`);
  lines.push(`${aup}{`);
  lines.push(`${aup}`);
  lines.push(`${aup}Height      ${(+(atmoHeight * 0.45).toFixed(4))}`);
  lines.push(`${aup}NorthLat    57.4894`);
  lines.push(`${aup}NorthLon    88.7206`);
  lines.push(`${aup}NorthRadius ${aurRadius}`);
  lines.push(`${aup}NorthWidth  ${aurWidth}`);
  lines.push(`${aup}NorthRings  4`);
  lines.push(`${aup}NorthBright ${magneticField ? Math.min(1.0, +(magneticField.surfaceFieldGauss * 0.35).toFixed(2)) : 0.3}`);
  lines.push(`${aup}NorthParticles 0`);
  lines.push(`${aup}SouthLat    -57.5165`);
  lines.push(`${aup}SouthLon    273.482`);
  lines.push(`${aup}SouthRadius ${aurRadius}`);
  lines.push(`${aup}SouthWidth  ${aurWidth}`);
  lines.push(`${aup}SouthRings  3`);
  lines.push(`${aup}SouthBright ${magneticField ? Math.min(1.0, +(magneticField.surfaceFieldGauss * 0.35).toFixed(2)) : 0.3}`);
  lines.push(`${aup}SouthParticles 0`);
  lines.push(`${aup}TopColor    (1.000 1.000 1.000)`);
  lines.push(`${aup}BottomColor (0.000 1.000 0.000)`);
  lines.push(`${aup}}`);
  lines.push(``);

  // Rings Block
  if (ringSystem) {
    lines.push(`Rings`);
    lines.push(`{`);
    lines.push(`InnerRadius     ${(+ringSystem.innerRadiusKm.toFixed(2))}`);
    lines.push(`OuterRadius     ${(+ringSystem.outerRadiusKm.toFixed(2))}`);
    lines.push(`EdgeRadius      ${(+((ringSystem.innerRadiusKm + ringSystem.outerRadiusKm) * 0.5).toFixed(2))}`);
    lines.push(`MeanDensity     ${(+Math.min(1.0, ringSystem.opticalDepth).toFixed(4))}`);
    lines.push(`// RingClass    "${ringSystem.ringClass}"`);
    lines.push(`// Composition  "${ringSystem.compositionLabel}"`);
    lines.push(`// MassLunar    ${ringSystem.massLunar}`);
    lines.push(`}`);
  } else {
    lines.push(`NoRings         true`);
    if (rings) lines.push(`// RingsNote    "${rings}"`);
  }
  lines.push(``);
  lines.push(`NoAccretionDisk true`);
  lines.push(``);
  lines.push(`NoCometTail     true`);
  lines.push(``);

  // Orbit Block
  const smaVal =
    blockType === 'Moon'
      ? +((a_km || 100000) / 149597870.7).toFixed(8)
      : +(a_AU || 1.0).toFixed(6);
  lines.push(`Orbit`);
  lines.push(`{`);
  lines.push(``);
  lines.push(`RefPlane        "Equator"`);
  lines.push(`SemiMajorAxis   ${smaVal}`);
  lines.push(`Period          ${(+periodYr.toFixed(6))}`);
  lines.push(`Eccentricity    ${(+e.toFixed(5))}`);
  lines.push(`Inclination     ${(+incDeg.toFixed(6))}`);
  lines.push(`AscendingNode   ${(+omegaNodeDeg.toFixed(4))}`);
  lines.push(`ArgOfPericenter ${(+argPeriDeg.toFixed(4))}`);
  lines.push(`MeanAnomaly     ${meanAnomaly}`);
  if (blockType === 'Moon') {
    lines.push(`// SemiMajorAxisKm ${a_km}`);
    lines.push(`// SemiMajorAxisRp ${a_Rp}`);
    lines.push(`// PeriodDays      ${periodDays}`);
  } else {
    lines.push(`// PeriodDays      ${periodDays}`);
  }
  lines.push(`}`);
  lines.push(``);
  lines.push(`}`);

  return lines.join('\n');
}

/**
 * Exports a full RealisticStarSystemResult as a SpaceEngine (.sc) catalog script,
 * with all unused Stargen system/zone/planet/moon fields commented out.
 */
export function exportSystemAsSpaceEngineSc(systemResult: RealisticStarSystemResult): string {
  sanitizeRealisticSystem(systemResult);
  const sysName =
    systemResult.step1?.name ||
    systemResult.step1?.id ||
    `Stargen-${systemResult.roll}`;
  const stars = systemResult.hierarchy.stars || [];
  const primaryStar = stars[0];

  const out: string[] = [];
  out.push(`// ============================================================================`);
  out.push(`// SpaceEngine (.sc) System Catalog Export — Generated by Zook Astro`);
  out.push(`// System: "${sysName}" (Roll #${systemResult.roll})`);
  out.push(`// Architecture: ${systemResult.hierarchy.archName}`);
  out.push(`// Progenitor System Mass: ${systemResult.step1.sysMass} M_sun | Age: ${systemResult.step1.age} Gyr | [Fe/H]: ${systemResult.step1.feh}`);
  if (systemResult.seedUsed !== undefined) {
    out.push(`// Deterministic Seed: ${systemResult.seedUsed}`);
  }
  out.push(`// ============================================================================`);
  out.push(``);

  // Export Stars
  stars.forEach((st: RealisticStarNode, sIdx: number) => {
    const starName = stars.length === 1 ? sysName : `${sysName} ${st.label}`;
    const parentBody = sIdx === 0 ? (stars.length > 1 ? `${sysName} Barycenter` : 'Milky Way') : `${sysName}`;
    const radiusKm = +(st.radius * 695700).toFixed(1);
    const lines: string[] = [];
    lines.push(`Star    "${starName}"`);
    lines.push(`{`);
    lines.push(`ParentBody     "${parentBody}"`);
    lines.push(`Class          "${st.spectralType.split(' ')[0]}"`);
    lines.push(`MassSol         ${(+st.mass.toFixed(4))}`);
    lines.push(`RadSol          ${(+st.radius.toFixed(4))}`);
    lines.push(`Lum             ${(+st.lumNum.toFixed(6))}`);
    lines.push(`Teff            ${Math.round(st.Teff)}`);
    lines.push(`Age             ${(+systemResult.step1.age.toFixed(3))}`);
    lines.push(`FeH             ${(+systemResult.step1.feh.toFixed(3))}`);
    lines.push(`// --- Stargen Stellar Telemetry (Unused by SpaceEngine) ---`);
    lines.push(`// Category     "${st.category}"`);
    lines.push(`// RadiusKm     ${radiusKm}`);
    lines.push(`// SurfaceLogG  ${st.logg}`);
    lines.push(`// MainSeqTau   ${st.tau}`);
    lines.push(`// ColorHex     "${st.colorHex}"`);
    if (sIdx > 0 && systemResult.hierarchy.splits[sIdx - 1]) {
      const sp = systemResult.hierarchy.splits[sIdx - 1];
      lines.push(`Orbit`);
      lines.push(`{`);
      lines.push(`SemiMajorAxis   ${sp.a_AU}`);
      lines.push(`Eccentricity    ${sp.e}`);
      lines.push(`// Pair         "${sp.pair}"`);
      lines.push(`// Regime       "${sp.regime}"`);
      lines.push(`// sMaxA_AU     ${sp.sMaxA}`);
      lines.push(`// sMaxB_AU     ${sp.sMaxB}`);
      lines.push(`// pMin_AU      ${sp.pMin}`);
      lines.push(`}`);
    }
    lines.push(`}`);
    lines.push(``);
    out.push(lines.join('\n'));
  });

  // Export Planetary Zones, Belts, Planets, and Moons
  systemResult.zones.forEach((zone, zIdx) => {
    const hostStarName =
      stars.length <= 1
        ? sysName
        : zone.title.includes('Star B') && stars[1]
        ? `${sysName} ${stars[1].label}`
        : zone.title.includes('Star C') && stars[2]
        ? `${sysName} ${stars[2].label}`
        : `${sysName} ${stars[0]?.label || 'A'}`;

    out.push(`// ----------------------------------------------------------------------------`);
    out.push(`// Zone ${zIdx + 1}: ${zone.title}`);
    out.push(`// Archetype: Type ${zone.archetype} | Disk Mass: ${zone.diskMassEarth} M_earth | Snow Line: ${zone.a_snow} AU`);
    out.push(`// Zone Stability Bounds: ${zone.a_in} AU – ${zone.a_out} AU | Probabilities: A=${zone.probs.A} B=${zone.probs.B} C=${zone.probs.C} D=${zone.probs.D}`);
    out.push(`// ----------------------------------------------------------------------------`);
    out.push(``);

    let planetCounter = 0;
    zone.bodies.forEach((body, bIdx) => {
      if (body.kind === 'belt') {
        const belt = body as RealisticBeltBody;
        out.push(`AsteroidBelt    "${hostStarName} Belt ${bIdx + 1}"`);
        out.push(`{`);
        out.push(`ParentBody      "${hostStarName}"`);
        out.push(`SemiMajorAxis   ${belt.a}`);
        out.push(`Width           ${belt.beltWidth}`);
        out.push(`Inclination     ${belt.incDeg}`);
        out.push(`AscendingNode   ${belt.omegaNodeDeg}`);
        out.push(`// Role             "${belt.role}"`);
        out.push(`// BirthSMA_AU      ${belt.a_birth}`);
        out.push(`// RetainedMassM_E  ${belt.massEarth}`);
        out.push(`// RawSlotMassM_E   ${belt.rawSlotMassEarth}`);
        out.push(`}`);
        out.push(``);
        return;
      }

      const p = body as RealisticPlanetBody;
      const letter = String.fromCharCode(98 + planetCounter);
      planetCounter++;
      const planetName = `${hostStarName} ${letter}`;
      const effT = p.surfaceTempK ?? p.T_atm ?? p.T_eq;
      const cleanPClass = resolvePlanetClass(
        p.planetClass,
        effT,
        p.hydrosphere,
        p.massEarth,
        p.iceFrac,
        p.planetClass.includes('Chthonian'),
        p.gasFrac >= 0.015 || p.massEarth >= 15,
        p.pressureBar,
        p.gases
      );

      out.push(
        formatBodyAsSpaceEngineSc({
          blockType: 'Planet',
          bodyName: planetName,
          parentName: hostStarName,
          cleanClass: cleanPClass,
          role: p.role,
          migrationHistory: p.migrationHistory,
          a_AU: p.a,
          a_birth_AU: p.a_birth,
          periodYr: +(p.orbitalPeriodDays / 365.25).toFixed(6),
          periodDays: p.orbitalPeriodDays,
          e: p.e,
          incDeg: p.incDeg,
          omegaNodeDeg: p.omegaNodeDeg,
          argPeriDeg: p.argPeriDeg,
          massEarth: p.massEarth,
          massJup: p.massJup,
          radiusEarth: p.radiusEarth,
          radiusKm: +(p.radiusEarth * 6371.0).toFixed(2),
          densityGcm3: p.densityGcm3,
          gravityG: p.gravityG,
          rockFrac: p.rockFrac,
          iceFrac: p.iceFrac,
          gasFrac: p.gasFrac,
          albedo: p.albedo,
          T_eq: p.T_eq,
          T_atm: p.T_atm,
          surfaceTempK: p.surfaceTempK,
          greenhouseK: p.greenhouseK,
          muMin: p.muMin,
          pressureBar: p.pressureBar,
          sudarskyClass: p.sudarskyClass,
          atmosphereType: p.atmosphereType,
          gases: p.gases,
          hydrosphere: p.hydrosphere,
          rings: p.rings,
          ringSystem: p.ringSystem,
          rocheLimitRp: p.rocheLimitRp,
          rotationHours: p.rotationHours,
          spinState: p.spinState,
          axialTiltDeg: p.axialTiltDeg,
          magneticField: p.magneticField,
          visualHex: getPlanetVisualColor(p),
          starTeff: primaryStar?.Teff || 5778,
        })
      );
      out.push(``);

      // Export Moons of this planet
      (p.moons || []).forEach((m: RealisticMoon, mIdx: number) => {
        const moonName = `${planetName}.${mIdx + 1} (${m.name})`;
        const cleanMClass = resolveMoonClass(
          m.moonClass,
          m.surfaceTempK ?? m.T_atm ?? m.T_eq,
          m.hydrosphere,
          m.iceFrac,
          m.massEarth ?? 0.01,
          m.pressureBar,
          m.gases
        );
        out.push(
          formatBodyAsSpaceEngineSc({
            blockType: 'Moon',
            bodyName: moonName,
            parentName: planetName,
            cleanClass: cleanMClass,
            origin: m.origin,
            a_km: m.a_km,
            a_Rp: m.a_Rp,
            periodYr: +(m.periodDays / 365.25).toFixed(7),
            periodDays: m.periodDays,
            e: m.e,
            incDeg: m.incDeg,
            omegaNodeDeg: +((hashFloat(moonName, 501) * 360 - 180).toFixed(3)),
            argPeriDeg: +((hashFloat(moonName, 502) * 360).toFixed(3)),
            retrograde: m.retrograde,
            massEarth: m.massEarth,
            massLunar: m.massLunar,
            radiusEarth: m.radiusEarth,
            radiusKm: m.radiusKm,
            densityGcm3: m.densityGcm3,
            gravityG: m.gravityG,
            rockFrac: m.rockFrac,
            iceFrac: m.iceFrac,
            gasFrac: m.gasFrac,
            albedo: m.albedo,
            T_eq: m.T_eq,
            T_atm: m.T_atm,
            surfaceTempK: m.surfaceTempK,
            greenhouseK: m.greenhouseK,
            tidalW: m.tidalW,
            tidalFluxWm2: m.tidalFluxWm2,
            muMin: m.muMin,
            pressureBar: m.pressureBar,
            atmosphereType: m.atmosphereType,
            gases: m.gases,
            hydrosphere: m.hydrosphere,
            rotationHours: m.rotationHours,
            spinState: m.spinState,
            axialTiltDeg: m.axialTiltDeg,
            magneticField: m.magneticField,
            visualHex: getMoonVisualColor(m),
            starTeff: primaryStar?.Teff || 5778,
          })
        );
        out.push(``);
      });
    });
  });

  return out.join('\n');
}

/**
 * Formats a single Planet or Moon into Stellaris planet/moon block syntax,
 * with all unused Stargen astrophysical fields commented out with `#`.
 */
export function formatBodyAsStellarisBlock(params: {
  blockKeyword: 'planet' | 'moon';
  indent: string;
  displayName: string;
  stellarisClass: string;
  size: number;
  orbitDistance: number;
  hasRing?: boolean;
  cleanClass: string;
  role?: string;
  origin?: string;
  migrationHistory?: string;
  a_AU?: number;
  a_birth_AU?: number;
  a_km?: number;
  a_Rp?: number;
  e: number;
  incDeg: number;
  omegaNodeDeg?: number;
  argPeriDeg?: number;
  retrograde?: boolean;
  periodDays: number;
  massEarth: number;
  massJup?: number;
  massLunar?: number;
  radiusEarth: number;
  radiusKm: number;
  densityGcm3: number;
  gravityG: number;
  rockFrac: number;
  iceFrac: number;
  gasFrac: number;
  albedo: number;
  T_eq: number;
  T_atm: number;
  surfaceTempK: number;
  greenhouseK: number;
  tidalW?: number;
  tidalFluxWm2?: number;
  muMin: number;
  pressureBar: number | null;
  sudarskyClass?: string | null;
  atmosphereType: string;
  gases: Record<string, number>;
  hydrosphere: RealisticHydrosphere | null;
  ringSystem?: RealisticPlanetBody['ringSystem'];
  rocheLimitRp?: number;
  rotationHours: number;
  spinState: string;
  axialTiltDeg: number;
  magneticField?: RealisticMagneticField;
  moonsOutput?: string[];
}): string {
  const {
    blockKeyword,
    indent,
    displayName,
    stellarisClass,
    size,
    orbitDistance,
    hasRing,
    cleanClass,
    role,
    origin,
    migrationHistory,
    a_AU,
    a_birth_AU,
    a_km,
    a_Rp,
    e,
    incDeg,
    omegaNodeDeg,
    argPeriDeg,
    retrograde,
    periodDays,
    massEarth,
    massJup,
    massLunar,
    radiusEarth,
    radiusKm,
    densityGcm3,
    gravityG,
    rockFrac,
    iceFrac,
    gasFrac,
    albedo,
    T_eq,
    T_atm,
    surfaceTempK,
    greenhouseK,
    tidalW,
    tidalFluxWm2,
    muMin,
    pressureBar,
    sudarskyClass,
    atmosphereType,
    gases,
    hydrosphere,
    ringSystem,
    rocheLimitRp,
    rotationHours,
    spinState,
    axialTiltDeg,
    magneticField,
    moonsOutput = [],
  } = params;

  const inner = `${indent}\t`;
  const lines: string[] = [];
  lines.push(`${indent}${blockKeyword} = {`);
  lines.push(`${inner}name = "NAME_${displayName}"`);
  lines.push(`${inner}class = "${stellarisClass}"`);
  lines.push(`${inner}size = ${size}`);
  lines.push(`${inner}orbit_distance = ${orbitDistance}`);
  lines.push(`${inner}orbit_angle = { min = 0 max = 360 }`);
  if (hasRing !== undefined) {
    lines.push(`${inner}has_ring = ${hasRing ? 'yes' : 'no'}`);
  }

  // Commented-out Stargen astrophysical properties not used by Stellaris
  lines.push(`${inner}# --- Unused Stargen Astrophysical Data ---`);
  lines.push(`${inner}# stargen_class = "${cleanClass}"`);
  if (role) lines.push(`${inner}# orbital_role = "${role}"`);
  if (origin) lines.push(`${inner}# moon_origin = "${origin}"`);
  if (migrationHistory) lines.push(`${inner}# migration_history = "${migrationHistory}"`);
  if (a_AU !== undefined) lines.push(`${inner}# semi_major_axis_au = ${a_AU}`);
  if (a_birth_AU !== undefined) lines.push(`${inner}# birth_semi_major_axis_au = ${a_birth_AU}`);
  if (a_km !== undefined) lines.push(`${inner}# semi_major_axis_km = ${a_km}`);
  if (a_Rp !== undefined) lines.push(`${inner}# semi_major_axis_rp = ${a_Rp}`);
  lines.push(`${inner}# eccentricity = ${e}`);
  lines.push(`${inner}# inclination_deg = ${incDeg}`);
  if (omegaNodeDeg !== undefined) lines.push(`${inner}# ascending_node_deg = ${omegaNodeDeg}`);
  if (argPeriDeg !== undefined) lines.push(`${inner}# arg_pericenter_deg = ${argPeriDeg}`);
  if (retrograde !== undefined) lines.push(`${inner}# retrograde = ${retrograde ? 'yes' : 'no'}`);
  lines.push(`${inner}# orbital_period_days = ${periodDays}`);
  lines.push(`${inner}# mass_earth = ${massEarth}`);
  if (massJup !== undefined) lines.push(`${inner}# mass_jupiter = ${massJup}`);
  if (massLunar !== undefined) lines.push(`${inner}# mass_lunar = ${massLunar}`);
  lines.push(`${inner}# radius_earth = ${radiusEarth}`);
  lines.push(`${inner}# radius_km = ${radiusKm}`);
  lines.push(`${inner}# density_gcm3 = ${densityGcm3}`);
  lines.push(`${inner}# gravity_g = ${gravityG}`);
  lines.push(`${inner}# composition = { rock = ${rockFrac} ice = ${iceFrac} gas = ${gasFrac} }`);
  lines.push(`${inner}# albedo = ${albedo}`);
  lines.push(`${inner}# T_eq_K = ${T_eq}`);
  lines.push(`${inner}# T_atm_K = ${T_atm}`);
  lines.push(`${inner}# greenhouse_K = ${greenhouseK}`);
  lines.push(`${inner}# surface_temp_K = ${surfaceTempK}`);
  if (tidalW !== undefined) lines.push(`${inner}# tidal_heating_W = ${tidalW}`);
  if (tidalFluxWm2 !== undefined) lines.push(`${inner}# tidal_flux_Wm2 = ${tidalFluxWm2}`);
  lines.push(`${inner}# mu_min = ${muMin}`);
  lines.push(`${inner}# pressure_bar = ${pressureBar ?? 'null (No Solid Surface)'}`);
  if (sudarskyClass) lines.push(`${inner}# sudarsky_class = "${sudarskyClass}"`);
  lines.push(`${inner}# atmosphere_type = "${atmosphereType}"`);

  const gasStr = Object.entries(gases || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k} = ${+(v * 100).toFixed(3)}%`)
    .join(' ');
  if (gasStr) {
    lines.push(`${inner}# atmosphere_gases = { ${gasStr} }`);
  }

  if (hydrosphere) {
    lines.push(
      `${inner}# hydrosphere = { state = "${hydrosphere.state}" solvent = "${hydrosphere.solvent || 'None'}" coverage_pct = ${
        hydrosphere.coveragePct ?? 0
      } biosphere = "${hydrosphere.biosphere || 'none'}" liq_km = ${hydrosphere.liqKm} sc_km = ${hydrosphere.scKm} ice_km = ${
        hydrosphere.iceKm
      } si_km = ${hydrosphere.siKm} crust_km = ${hydrosphere.crustKm ?? 0} }`
    );
  }
  if (ringSystem) {
    lines.push(
      `${inner}# ring_system = { class = "${ringSystem.ringClass}" inner_km = ${ringSystem.innerRadiusKm} outer_km = ${ringSystem.outerRadiusKm} optical_depth = ${ringSystem.opticalDepth} composition = "${ringSystem.compositionLabel}" }`
    );
  }
  if (rocheLimitRp !== undefined) lines.push(`${inner}# roche_limit_rp = ${rocheLimitRp}`);
  lines.push(`${inner}# rotation_hours = ${rotationHours}`);
  lines.push(`${inner}# spin_state = "${spinState}"`);
  lines.push(`${inner}# axial_tilt_deg = ${axialTiltDeg}`);
  if (magneticField) {
    lines.push(
      `${inner}# magnetic_field = { gauss = ${magneticField.surfaceFieldGauss} micro_tesla = ${magneticField.surfaceFieldMicroTesla} moment_earth = ${magneticField.magneticMomentEarth} dynamo = "${magneticField.dynamoStatus}" shielding_pct = ${magneticField.shieldingEfficiencyPct} radiation = "${magneticField.radiationLevel}" }`
    );
  }

  if (moonsOutput.length > 0) {
    lines.push(``);
    moonsOutput.forEach((mBlock) => lines.push(mBlock));
  }

  lines.push(`${indent}}`);
  return lines.join('\n');
}

/**
 * Exports a full RealisticStarSystemResult in Stellaris Solar System Initializer format,
 * with all unused Stargen data commented out with `#`.
 */
export function exportSystemAsStellarisInitializer(systemResult: RealisticStarSystemResult): string {
  sanitizeRealisticSystem(systemResult);
  const sysName =
    systemResult.step1?.name ||
    systemResult.step1?.id ||
    `Kepler-${systemResult.roll}`;
  const safeId = sysName.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_initializer';
  const stars = systemResult.hierarchy.stars || [];
  const primaryStar = stars[0];
  const primaryStellarisClass = primaryStar ? mapRealisticStarToArchitectClass(primaryStar) : 'pc_g_star';

  const scale = 50;
  const exponent = 0.667;
  const offset = 0;

  const out: string[] = [];
  out.push(`# ============================================================================`);
  out.push(`# Stellaris Solar System Initializer — Generated by Zook Astro`);
  out.push(`# System: "${sysName}" (Roll #${systemResult.roll})`);
  out.push(`# Conversion Model: r = ${scale} * (a_AU ^ ${exponent}) + ${offset}`);
  out.push(`# --- Unused System-Level Stargen Telemetry ---`);
  out.push(`# architecture = "${systemResult.hierarchy.archName}"`);
  out.push(`# progenitor_sys_mass_sol = ${systemResult.step1.sysMass}`);
  out.push(`# system_age_gyr = ${systemResult.step1.age}`);
  out.push(`# metallicity_feh = ${systemResult.step1.feh}`);
  if (systemResult.seedUsed !== undefined) {
    out.push(`# seed_used = ${systemResult.seedUsed}`);
  }
  out.push(`# ============================================================================`);
  out.push(``);
  out.push(`${safeId} = {`);
  out.push(`\tname = "NAME_${sysName}"`);
  out.push(`\tclass = "${primaryStellarisClass}"`);
  out.push(``);

  // Stars
  stars.forEach((st: RealisticStarNode, sIdx: number) => {
    const stClass = mapRealisticStarToArchitectClass(st);
    const stSize = Math.max(15, Math.min(35, Math.round(20 + Math.log10(Math.max(0.08, st.radius)) * 12)));
    const split = sIdx > 0 ? systemResult.hierarchy.splits[sIdx - 1] : null;
    const starDist = sIdx === 0 ? 0 : split ? Math.max(10, Math.round(scale * Math.pow(Math.max(0.01, split.a_AU), exponent))) : 15 * sIdx;

    out.push(`\tplanet = {`);
    out.push(`\t\tname = "NAME_${sysName}${stars.length > 1 ? ` ${st.label}` : ''}"`);
    out.push(`\t\tclass = "${stClass}"`);
    out.push(`\t\torbit_distance = ${starDist}`);
    out.push(`\t\torbit_angle = ${sIdx === 0 ? 1 : 180}`);
    out.push(`\t\tsize = ${stSize}`);
    out.push(`\t\thas_ring = no`);
    out.push(`\t\t# --- Unused Stargen Stellar Telemetry ---`);
    out.push(`\t\t# spectral_type = "${st.spectralType}"`);
    out.push(`\t\t# category = "${st.category}"`);
    out.push(`\t\t# mass_sol = ${st.mass}`);
    out.push(`\t\t# radius_sol = ${st.radius}`);
    out.push(`\t\t# luminosity_sol = ${st.lumNum}`);
    out.push(`\t\t# Teff_K = ${st.Teff}`);
    out.push(`\t\t# log_g = ${st.logg}`);
    out.push(`\t\t# ms_lifetime_gyr = ${st.tau}`);
    out.push(`\t\t# color_hex = "${st.colorHex}"`);
    if (split) {
      out.push(`\t\t# binary_split = { pair = "${split.pair}" a_AU = ${split.a_AU} e = ${split.e} regime = "${split.regime}" }`);
    }
    out.push(`\t}`);
    out.push(``);
  });

  // Zones & Bodies
  systemResult.zones.forEach((zone, zIdx) => {
    out.push(`\t# ------------------------------------------------------------------------`);
    out.push(`\t# Zone ${zIdx + 1}: ${zone.title}`);
    out.push(`\t# zone_archetype = "Type ${zone.archetype}" | disk_mass_earth = ${zone.diskMassEarth} | a_snow_au = ${zone.a_snow}`);
    out.push(`\t# stability_limits_au = { a_in = ${zone.a_in} a_out = ${zone.a_out} }`);
    out.push(`\t# ------------------------------------------------------------------------`);
    out.push(``);

    let runningDist = offset;
    let planetCounter = 0;

    zone.bodies.forEach((body) => {
      const exactDist = scale * Math.pow(Math.max(0.001, body.a), exponent) + offset;
      const stepDelta = Math.max(1, Math.round(exactDist - runningDist));
      runningDist = exactDist;

      if (body.kind === 'belt') {
        const belt = body as RealisticBeltBody;
        out.push(`\tasteroid_belt = {`);
        out.push(`\t\ttype = "rocky_asteroid_belt"`);
        out.push(`\t\tradius = ${Math.round(exactDist)}`);
        out.push(`\t\t# role = "${belt.role}"`);
        out.push(`\t\t# semi_major_axis_au = ${belt.a}`);
        out.push(`\t\t# birth_sma_au = ${belt.a_birth}`);
        out.push(`\t\t# belt_width_au = ${belt.beltWidth}`);
        out.push(`\t\t# mass_earth = ${belt.massEarth}`);
        out.push(`\t\t# raw_slot_mass_earth = ${belt.rawSlotMassEarth}`);
        out.push(`\t\t# inclination_deg = ${belt.incDeg}`);
        out.push(`\t\t# ascending_node_deg = ${belt.omegaNodeDeg}`);
        out.push(`\t}`);
        out.push(``);
        return;
      }

      const p = body as RealisticPlanetBody;
      const letter = String.fromCharCode(98 + planetCounter);
      planetCounter++;
      const effT = p.surfaceTempK ?? p.T_atm ?? p.T_eq;
      const cleanPClass = resolvePlanetClass(
        p.planetClass,
        effT,
        p.hydrosphere,
        p.massEarth,
        p.iceFrac,
        p.planetClass.includes('Chthonian'),
        p.gasFrac >= 0.015 || p.massEarth >= 15,
        p.pressureBar,
        p.gases
      );
      const displayName = `${sysName} ${letter} (${cleanPClass})`;
      const stPlanetClass = mapRealisticPlanetToArchitectClass({
        ...p,
        planetClass: cleanPClass,
      });
      const pSize = calculatePlanetSize(p.radiusEarth, p.massEarth);

      const moonsBlocks: string[] = [];
      let prevMoonDist = 0;
      (p.moons || []).forEach((m: RealisticMoon, mIdx: number) => {
        const cleanMClass = resolveMoonClass(
          m.moonClass,
          m.surfaceTempK ?? m.T_atm ?? m.T_eq,
          m.hydrosphere,
          m.iceFrac,
          m.massEarth ?? 0.01,
          m.pressureBar,
          m.gases
        );
        const moonDisplayName = `${sysName} ${letter}-${mIdx + 1} (${cleanMClass})`;
        const moonStClass = mapRealisticMoonToStellarisClass(m);
        const moonSize = Math.max(4, Math.min(15, calculatePlanetSize(m.radiusEarth, m.massEarth)));
        const rawMoonOrbit = Math.max(prevMoonDist + 2, Math.round(3 + Math.log10(Math.max(1.5, m.a_Rp)) * 5));
        const moonStepDist = Math.max(2, rawMoonOrbit - prevMoonDist);
        prevMoonDist = rawMoonOrbit;

        moonsBlocks.push(
          formatBodyAsStellarisBlock({
            blockKeyword: 'moon',
            indent: '\t\t',
            displayName: moonDisplayName,
            stellarisClass: moonStClass,
            size: moonSize,
            orbitDistance: moonStepDist,
            cleanClass: cleanMClass,
            origin: m.origin,
            a_km: m.a_km,
            a_Rp: m.a_Rp,
            e: m.e,
            incDeg: m.incDeg,
            retrograde: m.retrograde,
            periodDays: m.periodDays,
            massEarth: m.massEarth,
            massLunar: m.massLunar,
            radiusEarth: m.radiusEarth,
            radiusKm: m.radiusKm,
            densityGcm3: m.densityGcm3,
            gravityG: m.gravityG,
            rockFrac: m.rockFrac,
            iceFrac: m.iceFrac,
            gasFrac: m.gasFrac,
            albedo: m.albedo,
            T_eq: m.T_eq,
            T_atm: m.T_atm,
            surfaceTempK: m.surfaceTempK,
            greenhouseK: m.greenhouseK,
            tidalW: m.tidalW,
            tidalFluxWm2: m.tidalFluxWm2,
            muMin: m.muMin,
            pressureBar: m.pressureBar,
            atmosphereType: m.atmosphereType,
            gases: m.gases,
            hydrosphere: m.hydrosphere,
            rotationHours: m.rotationHours,
            spinState: m.spinState,
            axialTiltDeg: m.axialTiltDeg,
            magneticField: m.magneticField,
          })
        );
      });

      out.push(
        formatBodyAsStellarisBlock({
          blockKeyword: 'planet',
          indent: '\t',
          displayName,
          stellarisClass: stPlanetClass,
          size: pSize,
          orbitDistance: stepDelta,
          hasRing: Boolean(p.rings),
          cleanClass: cleanPClass,
          role: p.role,
          migrationHistory: p.migrationHistory,
          a_AU: p.a,
          a_birth_AU: p.a_birth,
          e: p.e,
          incDeg: p.incDeg,
          omegaNodeDeg: p.omegaNodeDeg,
          argPeriDeg: p.argPeriDeg,
          periodDays: p.orbitalPeriodDays,
          massEarth: p.massEarth,
          massJup: p.massJup,
          radiusEarth: p.radiusEarth,
          radiusKm: +(p.radiusEarth * 6371.0).toFixed(2),
          densityGcm3: p.densityGcm3,
          gravityG: p.gravityG,
          rockFrac: p.rockFrac,
          iceFrac: p.iceFrac,
          gasFrac: p.gasFrac,
          albedo: p.albedo,
          T_eq: p.T_eq,
          T_atm: p.T_atm,
          surfaceTempK: p.surfaceTempK,
          greenhouseK: p.greenhouseK,
          muMin: p.muMin,
          pressureBar: p.pressureBar,
          sudarskyClass: p.sudarskyClass,
          atmosphereType: p.atmosphereType,
          gases: p.gases,
          hydrosphere: p.hydrosphere,
          ringSystem: p.ringSystem,
          rocheLimitRp: p.rocheLimitRp,
          rotationHours: p.rotationHours,
          spinState: p.spinState,
          axialTiltDeg: p.axialTiltDeg,
          magneticField: p.magneticField,
          moonsOutput: moonsBlocks,
        })
      );
      out.push(``);
    });
  });

  out.push(`}`);
  return out.join('\n');
}

/**
 * Exports a single Planet or Moon from a RealisticStarSystemResult in Stargen JSON,
 * SpaceEngine (.sc), or Stellaris (.txt) format, with unused game data commented out.
 */
export function exportSingleEntityInFormat(
  systemResult: RealisticStarSystemResult,
  zoneIdx: number,
  bodyIdx: number,
  moonIdx: number | null,
  format: ExportFormatType
): { content: string; filename: string; mimeType: string } {
  sanitizeRealisticSystem(systemResult);
  const sysName =
    systemResult.step1?.name ||
    systemResult.step1?.id ||
    `Kepler-${systemResult.roll}`;
  const stars = systemResult.hierarchy.stars || [];
  const primaryStar = stars[0];
  const zone = systemResult.zones[zoneIdx] || systemResult.zones[0];
  const hostStarName =
    stars.length <= 1
      ? sysName
      : zone?.title.includes('Star B') && stars[1]
      ? `${sysName} ${stars[1].label}`
      : zone?.title.includes('Star C') && stars[2]
      ? `${sysName} ${stars[2].label}`
      : `${sysName} ${stars[0]?.label || 'A'}`;

  let planetCounter = 0;
  for (let i = 0; i <= bodyIdx && i < (zone?.bodies.length || 0); i++) {
    if (zone.bodies[i].kind === 'planet') {
      if (i < bodyIdx) planetCounter++;
    }
  }
  const letter = String.fromCharCode(98 + planetCounter);
  const planetName = `${hostStarName} ${letter}`;
  const p = zone?.bodies[bodyIdx] as RealisticPlanetBody | undefined;

  if (!p || p.kind !== 'planet') {
    return {
      content: JSON.stringify(zone?.bodies[bodyIdx] || {}, null, 2),
      filename: `${sysName}-body.json`,
      mimeType: 'application/json',
    };
  }

  const isMoon = moonIdx !== null && moonIdx >= 0 && Boolean(p.moons?.[moonIdx]);
  const m = isMoon ? p.moons[moonIdx!] : null;

  if (format === 'stargen') {
    const targetObj = isMoon && m ? m : p;
    const safeSlug = (isMoon && m ? `${planetName}-${moonIdx! + 1}` : planetName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    return {
      content: JSON.stringify(targetObj, null, 2),
      filename: `stargen-${safeSlug}.json`,
      mimeType: 'application/json',
    };
  }

  const effT = p.surfaceTempK ?? p.T_atm ?? p.T_eq;
  const cleanPClass = resolvePlanetClass(
    p.planetClass,
    effT,
    p.hydrosphere,
    p.massEarth,
    p.iceFrac,
    p.planetClass.includes('Chthonian'),
    p.gasFrac >= 0.015 || p.massEarth >= 15,
    p.pressureBar,
    p.gases
  );

  if (format === 'spaceengine') {
    if (isMoon && m) {
      const moonName = `${planetName}.${moonIdx! + 1} (${m.name})`;
      const cleanMClass = resolveMoonClass(
        m.moonClass,
        m.surfaceTempK ?? m.T_atm ?? m.T_eq,
        m.hydrosphere,
        m.iceFrac,
        m.massEarth ?? 0.01,
        m.pressureBar,
        m.gases
      );
      const scText = formatBodyAsSpaceEngineSc({
        blockType: 'Moon',
        bodyName: moonName,
        parentName: planetName,
        cleanClass: cleanMClass,
        origin: m.origin,
        a_km: m.a_km,
        a_Rp: m.a_Rp,
        periodYr: +(m.periodDays / 365.25).toFixed(7),
        periodDays: m.periodDays,
        e: m.e,
        incDeg: m.incDeg,
        omegaNodeDeg: +((hashFloat(moonName, 501) * 360 - 180).toFixed(3)),
        argPeriDeg: +((hashFloat(moonName, 502) * 360).toFixed(3)),
        retrograde: m.retrograde,
        massEarth: m.massEarth,
        massLunar: m.massLunar,
        radiusEarth: m.radiusEarth,
        radiusKm: m.radiusKm,
        densityGcm3: m.densityGcm3,
        gravityG: m.gravityG,
        rockFrac: m.rockFrac,
        iceFrac: m.iceFrac,
        gasFrac: m.gasFrac,
        albedo: m.albedo,
        T_eq: m.T_eq,
        T_atm: m.T_atm,
        surfaceTempK: m.surfaceTempK,
        greenhouseK: m.greenhouseK,
        tidalW: m.tidalW,
        tidalFluxWm2: m.tidalFluxWm2,
        muMin: m.muMin,
        pressureBar: m.pressureBar,
        atmosphereType: m.atmosphereType,
        gases: m.gases,
        hydrosphere: m.hydrosphere,
        rotationHours: m.rotationHours,
        spinState: m.spinState,
        axialTiltDeg: m.axialTiltDeg,
        magneticField: m.magneticField,
        visualHex: getMoonVisualColor(m),
        starTeff: primaryStar?.Teff || 5778,
      });
      const safeSlug = `${planetName}-${moonIdx! + 1}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return { content: scText, filename: `${safeSlug}.sc`, mimeType: 'text/plain' };
    }

    const scText = formatBodyAsSpaceEngineSc({
      blockType: 'Planet',
      bodyName: planetName,
      parentName: hostStarName,
      cleanClass: cleanPClass,
      role: p.role,
      migrationHistory: p.migrationHistory,
      a_AU: p.a,
      a_birth_AU: p.a_birth,
      periodYr: +(p.orbitalPeriodDays / 365.25).toFixed(6),
      periodDays: p.orbitalPeriodDays,
      e: p.e,
      incDeg: p.incDeg,
      omegaNodeDeg: p.omegaNodeDeg,
      argPeriDeg: p.argPeriDeg,
      massEarth: p.massEarth,
      massJup: p.massJup,
      radiusEarth: p.radiusEarth,
      radiusKm: +(p.radiusEarth * 6371.0).toFixed(2),
      densityGcm3: p.densityGcm3,
      gravityG: p.gravityG,
      rockFrac: p.rockFrac,
      iceFrac: p.iceFrac,
      gasFrac: p.gasFrac,
      albedo: p.albedo,
      T_eq: p.T_eq,
      T_atm: p.T_atm,
      surfaceTempK: p.surfaceTempK,
      greenhouseK: p.greenhouseK,
      muMin: p.muMin,
      pressureBar: p.pressureBar,
      sudarskyClass: p.sudarskyClass,
      atmosphereType: p.atmosphereType,
      gases: p.gases,
      hydrosphere: p.hydrosphere,
      rings: p.rings,
      ringSystem: p.ringSystem,
      rocheLimitRp: p.rocheLimitRp,
      rotationHours: p.rotationHours,
      spinState: p.spinState,
      axialTiltDeg: p.axialTiltDeg,
      magneticField: p.magneticField,
      visualHex: getPlanetVisualColor(p),
      starTeff: primaryStar?.Teff || 5778,
    });
    const safeSlug = planetName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return { content: scText, filename: `${safeSlug}.sc`, mimeType: 'text/plain' };
  }

  // Stellaris format for single planet or moon
  const scale = 50;
  const exponent = 0.667;
  let runningDist = 0;
  let stepDelta = 10;
  for (let i = 0; i <= bodyIdx && i < (zone?.bodies.length || 0); i++) {
    const exactDist = scale * Math.pow(Math.max(0.001, zone.bodies[i].a), exponent);
    stepDelta = Math.max(1, Math.round(exactDist - runningDist));
    runningDist = exactDist;
  }

  if (isMoon && m) {
    const cleanMClass = resolveMoonClass(
      m.moonClass,
      m.surfaceTempK ?? m.T_atm ?? m.T_eq,
      m.hydrosphere,
      m.iceFrac,
      m.massEarth ?? 0.01,
      m.pressureBar,
      m.gases
    );
    const moonDisplayName = `${sysName} ${letter}-${moonIdx! + 1} (${cleanMClass})`;
    const moonStClass = mapRealisticMoonToStellarisClass(m);
    const moonSize = Math.max(4, Math.min(15, calculatePlanetSize(m.radiusEarth, m.massEarth)));
    const moonOrbitDist = Math.max(2, Math.round(3 + Math.log10(Math.max(1.5, m.a_Rp)) * 5));
    const stText = formatBodyAsStellarisBlock({
      blockKeyword: 'moon',
      indent: '',
      displayName: moonDisplayName,
      stellarisClass: moonStClass,
      size: moonSize,
      orbitDistance: moonOrbitDist,
      cleanClass: cleanMClass,
      origin: m.origin,
      a_km: m.a_km,
      a_Rp: m.a_Rp,
      e: m.e,
      incDeg: m.incDeg,
      retrograde: m.retrograde,
      periodDays: m.periodDays,
      massEarth: m.massEarth,
      massLunar: m.massLunar,
      radiusEarth: m.radiusEarth,
      radiusKm: m.radiusKm,
      densityGcm3: m.densityGcm3,
      gravityG: m.gravityG,
      rockFrac: m.rockFrac,
      iceFrac: m.iceFrac,
      gasFrac: m.gasFrac,
      albedo: m.albedo,
      T_eq: m.T_eq,
      T_atm: m.T_atm,
      surfaceTempK: m.surfaceTempK,
      greenhouseK: m.greenhouseK,
      tidalW: m.tidalW,
      tidalFluxWm2: m.tidalFluxWm2,
      muMin: m.muMin,
      pressureBar: m.pressureBar,
      atmosphereType: m.atmosphereType,
      gases: m.gases,
      hydrosphere: m.hydrosphere,
      rotationHours: m.rotationHours,
      spinState: m.spinState,
      axialTiltDeg: m.axialTiltDeg,
      magneticField: m.magneticField,
    });
    const safeSlug = `${planetName}-${moonIdx! + 1}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return { content: stText, filename: `stellaris-${safeSlug}.txt`, mimeType: 'text/plain' };
  }

  const displayName = `${sysName} ${letter} (${cleanPClass})`;
  const stPlanetClass = mapRealisticPlanetToArchitectClass({
    ...p,
    planetClass: cleanPClass,
  });
  const pSize = calculatePlanetSize(p.radiusEarth, p.massEarth);

  const stText = formatBodyAsStellarisBlock({
    blockKeyword: 'planet',
    indent: '',
    displayName,
    stellarisClass: stPlanetClass,
    size: pSize,
    orbitDistance: stepDelta,
    hasRing: Boolean(p.rings),
    cleanClass: cleanPClass,
    role: p.role,
    migrationHistory: p.migrationHistory,
    a_AU: p.a,
    a_birth_AU: p.a_birth,
    e: p.e,
    incDeg: p.incDeg,
    omegaNodeDeg: p.omegaNodeDeg,
    argPeriDeg: p.argPeriDeg,
    periodDays: p.orbitalPeriodDays,
    massEarth: p.massEarth,
    massJup: p.massJup,
    radiusEarth: p.radiusEarth,
    radiusKm: +(p.radiusEarth * 6371.0).toFixed(2),
    densityGcm3: p.densityGcm3,
    gravityG: p.gravityG,
    rockFrac: p.rockFrac,
    iceFrac: p.iceFrac,
    gasFrac: p.gasFrac,
    albedo: p.albedo,
    T_eq: p.T_eq,
    T_atm: p.T_atm,
    surfaceTempK: p.surfaceTempK,
    greenhouseK: p.greenhouseK,
    muMin: p.muMin,
    pressureBar: p.pressureBar,
    sudarskyClass: p.sudarskyClass,
    atmosphereType: p.atmosphereType,
    gases: p.gases,
    hydrosphere: p.hydrosphere,
    ringSystem: p.ringSystem,
    rocheLimitRp: p.rocheLimitRp,
    rotationHours: p.rotationHours,
    spinState: p.spinState,
    axialTiltDeg: p.axialTiltDeg,
    magneticField: p.magneticField,
  });
  const safeSlug = planetName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return { content: stText, filename: `stellaris-${safeSlug}.txt`, mimeType: 'text/plain' };
}
