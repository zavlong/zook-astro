/**
 * detailedBiomeTextures.ts
 * 
 * High-Detail Procedural Surface Texture & Micro-Relief Engine.
 * Generates rich, tactile procedural textures for generic biome archetypes:
 * - Eolian Dune Sand & Silt (wind ripples, grain sorting, mineral glitter)
 * - Stratified Bedrock & Cliff (geological layers, joint cleavage, talus scree)
 * - Vesicular Basalt & Caldera (pahoehoe lava ropes, pumice pores, magma fissures)
 * - Polygonal Glacial Permafrost (thermal contraction polygons, sastrugi, ice glints)
 * - Cellular Algal Turf & Forest (canopy crowns, biocrust felt, pigment distribution)
 * - Regolith & Impact Gravel (multi-scale Worley pebble scatter, breccia, soil porosity)
 * - Alluvial Silt & Mud Cracks (desiccation polygons, moisture darkening, glossy sheen)
 * 
 * Dynamically recolors generic biome textures using the planet's specific crust composition,
 * atmospheric lighting, and xenobiology pigment palettes.
 */

import {
  FLAG_LAVA,
  FLAG_ICE_SPEC,
  cellularFeature2D,
  hash2,
} from './terrainNoise';
import { PlanetarySurfaceModel } from './surfaceGenMath';

export type BiomeTextureArchetype =
  | 'DUNE_SAND'
  | 'BEDROCK_STRATA'
  | 'VESICULAR_BASALT'
  | 'GLACIAL_PERMAFROST'
  | 'ORGANIC_VEGETATION'
  | 'REGOLITH_GRAVEL'
  | 'ALLUVIAL_SILT';

export interface SurfaceTexelParams {
  biomeId: number;
  baseRgb: [number, number, number];
  px: number;
  pz: number;
  hLocal: number;
  slope: number;
  dhx: number;
  dhz: number;
  baseFbm: number;
  ridge: number;
  fine1: number;
  fine2: number;
  fine3: number;
  grain: number;
  baseBumpX: number;
  baseBumpZ: number;
  fissureWeight: number;
  tileSeed: number;
  surfaceModel: PlanetarySurfaceModel;
  craterIntensity?: number;
  isFirstPerson?: boolean;
}

export interface DetailedTexelResult {
  r: number;
  g: number;
  b: number;
  bumpX: number;
  bumpZ: number;
  nx?: number;
  nz?: number;
  hDelta: number;
  flags: number;
}

/**
 * Classifies a planetary biome ID into its primary surface texture archetype.
 */
export function getBiomeTextureArchetype(
  biomeId: number,
  surfaceModel: PlanetarySurfaceModel
): BiomeTextureArchetype {
  // Volcanic / Molten
  if (biomeId === 14 || biomeId === 15 || biomeId === 22 || surfaceModel.isMoltenWorld) {
    return 'VESICULAR_BASALT';
  }

  // Cryo / Ice / Permafrost
  if (
    biomeId === 7 ||
    biomeId === 8 ||
    biomeId === 18 ||
    biomeId === 21 ||
    surfaceModel.isIcyWorld ||
    surfaceModel.seaPalette.solventKey === 'NH3-H2O' ||
    surfaceModel.seaPalette.solventKey === 'CH4-C2H6'
  ) {
    return 'GLACIAL_PERMAFROST';
  }

  // Deserts & Dunes
  if (biomeId === 10) {
    return 'DUNE_SAND';
  }

  // Canyons, Highlands & Mountain Peaks
  if (biomeId === 11 || biomeId === 12 || biomeId === 13) {
    return 'BEDROCK_STRATA';
  }

  // Vegetated / Biocrust Worlds
  if (biomeId >= 3 && biomeId <= 6 && surfaceModel.floraPalette.hasAnyLife) {
    return 'ORGANIC_VEGETATION';
  }

  // Alluvial / Estuary / Mudflats
  if (biomeId === 3) {
    return 'ALLUVIAL_SILT';
  }

  // Default: Regolith / Impact Soil / Badlands
  return 'REGOLITH_GRAVEL';
}

/**
 * Evaluates high-detail procedural micro-texture and recolors it using planetary chemistry.
 */
export function evaluateDetailedBiomeTexel(params: SurfaceTexelParams): DetailedTexelResult {
  const {
    biomeId,
    baseRgb,
    px,
    pz,
    hLocal,
    slope,
    dhx,
    dhz,
    baseFbm,
    ridge,
    fine1,
    fine2,
    fine3,
    grain,
    baseBumpX,
    baseBumpZ,
    fissureWeight,
    tileSeed,
    surfaceModel,
    craterIntensity = 0.2,
    isFirstPerson = false,
  } = params;

  let r = baseRgb[0];
  let g = baseRgb[1];
  let b = baseRgb[2];
  let bumpX = baseBumpX;
  let bumpZ = baseBumpZ;
  let hDelta = 0;
  let flags = 0;

  const archetype = getBiomeTextureArchetype(biomeId, surfaceModel);

  // Palettes for recoloring highlights, shadows, and mineral flecks
  const comp = surfaceModel.compositionPalette;

  switch (archetype) {
    // =========================================================================
    // 1. EOLIAN DUNE SAND & DESERT SILT
    // =========================================================================
    case 'DUNE_SAND': {
      // Primary eolian wind ripples with transverse alignment and gentle curvature
      const ripplePhase = px * 138.0 + pz * 64.0 + Math.sin(pz * 18.0 + baseFbm * 6.5) * 7.5 + fine1 * 4.2;
      const rippleWave = Math.sin(ripplePhase);

      // Asymmetric slipface: sharp crests, gentle windward slope
      const crest = Math.pow(Math.max(0, rippleWave), 1.9);
      const trough = Math.pow(Math.max(0, -rippleWave), 1.3);

      // High-frequency normal displacement
      const rippleNormal = Math.cos(ripplePhase) * 0.72;
      bumpX += rippleNormal * 0.68;
      bumpZ += rippleNormal * 0.32;
      hDelta += (crest * 0.006 - trough * 0.004);

      // Mineral grain sorting: coarse grains collect in troughs, fine reflective silt on crests
      const grainSparkle = Math.pow(hash2(Math.floor(px * 160), Math.floor(pz * 160), tileSeed + 77), 9) * 48;
      const mineralStrata = Math.sin(hLocal * 55.0 + baseFbm * 8.0) * 12.0;

      // Recoloring
      const albedoMod = crest * 24 - trough * 20 + grain * 12 + mineralStrata;
      r = Math.max(0, Math.min(255, Math.round(baseRgb[0] * 1.04 + albedoMod * 1.15 + grainSparkle)));
      g = Math.max(0, Math.min(255, Math.round(baseRgb[1] * 0.98 + albedoMod * 0.92 + grainSparkle * 0.9)));
      b = Math.max(0, Math.min(255, Math.round(baseRgb[2] * 0.92 + albedoMod * 0.65 + grainSparkle * 0.7)));
      break;
    }

    // =========================================================================
    // 2. STRATIFIED BEDROCK CLIFFS & HIGHLANDS
    // =========================================================================
    case 'BEDROCK_STRATA': {
      // Multi-frequency sedimentary strata bands modulated by local slope
      const strataPhase = hLocal * 145.0 + (fine1 - 0.5) * 3.8 + (fine2 - 0.5) * 1.6;
      const strataBand = Math.sin(strataPhase);
      const microStrata = Math.sin(strataPhase * 4.2) * 0.5;

      // Vertical joint cleavage fractures
      const jointPhase = (px * 0.707 - pz * 0.707) * 48.0 + fine2 * 3.5;
      const jointLine = Math.abs(Math.sin(jointPhase));
      const isJoint = jointLine < 0.12 ? (1.0 - jointLine / 0.12) : 0;

      // Normal map chiseled facets
      bumpX += (dhx * strataBand * 0.85 + (fine1 - 0.5) * 0.45 - isJoint * 0.5);
      bumpZ += (dhz * strataBand * 0.85 + (fine2 - 0.5) * 0.45 - isJoint * 0.5);
      hDelta += (strataBand * 0.008 - isJoint * 0.012);

      // Talus scree gravel accumulation in flat or concave areas
      let screeGrain = 0;
      if (slope < 0.42) {
        const screeCell = cellularFeature2D(px * 52.0, pz * 52.0, tileSeed + 131);
        if (screeCell.dist < 0.26) {
          screeGrain = (1.0 - screeCell.dist / 0.26) * 22;
          bumpX += (screeCell.dx / 0.26) * 0.8;
          bumpZ += (screeCell.dy / 0.26) * 0.8;
          hDelta += 0.005;
        }
      }

      // Recoloring: alternate mineral oxidation layers
      const bandContrast = strataBand * 24 + microStrata * 14 + grain * 12 + screeGrain - isJoint * 32;
      r = Math.max(0, Math.min(255, Math.round(baseRgb[0] * 1.02 + bandContrast * 1.18)));
      g = Math.max(0, Math.min(255, Math.round(baseRgb[1] * 0.98 + bandContrast * 0.88)));
      b = Math.max(0, Math.min(255, Math.round(baseRgb[2] * 0.94 + bandContrast * 0.65)));
      break;
    }

    // =========================================================================
    // 3. VESICULAR BASALT & VOLCANIC CALDERA
    // =========================================================================
    case 'VESICULAR_BASALT': {
      // Ropy pahoehoe lava folds
      const pahoehoe = Math.sin(px * 66.0 + pz * 52.0 + fine1 * 8.5);
      // Cooling contraction shrinkage fractures
      const crackField = Math.abs(fine1 * 2.0 - 1.0 + (fine2 - 0.5) * 0.6);

      // Vesicular pumice gas-bubble pores (Worley pits)
      const poreCell = cellularFeature2D(px * 62.0, pz * 62.0, tileSeed + 421);
      const isPore = poreCell.dist < 0.18;
      const poreDepth = isPore ? (1.0 - poreCell.dist / 0.18) : 0;

      bumpX += pahoehoe * 0.62 + (fine2 - 0.5) * 0.35;
      bumpZ -= pahoehoe * 0.52 + grain * 0.35;
      hDelta += (pahoehoe * 0.007 - poreDepth * 0.015);

      // Active incandescent magma veins in deep fissures
      const isHotVent =
        (crackField < 0.075 || fissureWeight > 0.42) &&
        (biomeId === 15 || biomeId === 22 || surfaceModel.isMoltenWorld);

      if (isHotVent) {
        flags |= FLAG_LAVA;
        const glow = Math.min(1.0, (0.075 - crackField) / 0.075 + fissureWeight * 0.65);
        r = 255;
        g = Math.round(110 + 130 * glow);
        b = Math.round(15 + 85 * glow * glow);
        bumpX *= 0.2;
        bumpZ *= 0.2;
      } else {
        // Vesicular dark basalt matrix with ash dust flecks
        const ashDust = pahoehoe * 12 + (fine2 - 0.5) * 22 + grain * 16 - poreDepth * 35;
        r = Math.max(0, Math.min(255, Math.round(baseRgb[0] * 0.88 + ashDust)));
        g = Math.max(0, Math.min(255, Math.round(baseRgb[1] * 0.85 + ashDust * 0.9)));
        b = Math.max(0, Math.min(255, Math.round(baseRgb[2] * 0.85 + ashDust * 0.85)));
      }
      break;
    }

    // =========================================================================
    // 4. POLYGONAL GLACIAL PERMAFROST & CRYO LINEA
    // =========================================================================
    case 'GLACIAL_PERMAFROST': {
      flags |= FLAG_ICE_SPEC;
      const isTholin =
        surfaceModel.seaPalette.solventKey === 'NH3-H2O' ||
        surfaceModel.seaPalette.solventKey === 'CH4-C2H6' ||
        comp.compositionLabel.includes('Tholin');

      // Sastrugi wind-carved snow ridges
      const sastrugiWave = Math.sin(px * 78.0 - pz * 40.0 + fine1 * 5.8 + fine2 * 2.2);

      // Polygonal thermal contraction permafrost cracking (ice wedges)
      const polyCell = cellularFeature2D(px * 20.0, pz * 20.0, tileSeed + 773);
      const isWedgeEdge = polyCell.dist > 0.44;
      const wedgeDepth = isWedgeEdge ? (polyCell.dist - 0.44) / 0.22 : 0;

      // Deep glacial crevasses
      const crevassePattern = Math.abs(fine1 * 2.0 - 1.0 + (ridge - 0.5) * 0.65);
      const isCrevasse = crevassePattern < 0.14 || fissureWeight > 0.38;

      bumpX += Math.cos(px * 78.0 - pz * 40.0 + fine1 * 5.8) * 0.62;
      bumpZ -= Math.sin(px * 78.0 - pz * 40.0 + fine1 * 5.8) * 0.42;

      // Micro frost crystal sparkle (specular normal glints)
      const frostGlint = Math.pow(Math.max(0, Math.sin(px * 135.0 + pz * 115.0 + fine3 * 8.0)), 12) * 55;

      if (isCrevasse) {
        const depthCrev = Math.max(fissureWeight * 0.85, Math.max(0, 1.0 - crevassePattern / 0.14));
        r = Math.round(baseRgb[0] * (1 - depthCrev * 0.64) + (isTholin ? 94 : 36) * (depthCrev * 0.64));
        g = Math.round(baseRgb[1] * (1 - depthCrev * 0.50) + (isTholin ? 38 : 132) * (depthCrev * 0.50));
        b = Math.round(baseRgb[2] * (1 - depthCrev * 0.38) + (isTholin ? 18 : 215) * (depthCrev * 0.38));
        bumpX *= 1.9;
        hDelta -= depthCrev * 0.018;
      } else {
        const frostSparkle = sastrugiWave * 15 + grain * 16 + frostGlint - wedgeDepth * 28;
        const tintR = isTholin ? 1.18 : 1.0;
        const tintG = isTholin ? 0.78 : 1.0;
        const tintB = isTholin ? 0.45 : 1.12;
        r = Math.max(0, Math.min(255, Math.round(baseRgb[0] * 0.74 + 65 + frostSparkle * tintR)));
        g = Math.max(0, Math.min(255, Math.round(baseRgb[1] * 0.74 + 75 + frostSparkle * tintG)));
        b = Math.max(0, Math.min(255, Math.round(baseRgb[2] * 0.72 + 88 + frostSparkle * tintB)));
        hDelta += (sastrugiWave * 0.005 - wedgeDepth * 0.008);
      }
      break;
    }

    // =========================================================================
    // 5. CELLULAR ALGAL TURF, MOSS & MULTICELLULAR FLORA
    // =========================================================================
    case 'ORGANIC_VEGETATION': {
      const isUnicellular = surfaceModel.isUnicellularOnly;
      const isForest = biomeId === 5 || biomeId === 6;

      if (!isUnicellular && isForest) {
        // Multicellular forest: rounded canopy crowns & understory
        const canopyDensity = Math.max(0, Math.min(1, baseFbm * 1.2 + (biomeId === 5 ? 0.35 : 0.22)));
        const cell = cellularFeature2D(px * 28.0, pz * 28.0, tileSeed + 809);
        const crownRadius = 0.28 + canopyDensity * 0.26;

        if (cell.dist < crownRadius && slope < 0.55 && hLocal > 0.015 && hLocal < 0.29) {
          const uCrown = cell.dist / crownRadius;
          const crownHeightProfile = Math.sqrt(Math.max(0, 1.0 - uCrown * uCrown));
          bumpX += (cell.dx / crownRadius) * 1.45 + (fine2 - 0.5) * 0.42;
          bumpZ += (cell.dy / crownRadius) * 1.45 + grain * 0.42;
          hDelta += crownHeightProfile * (isFirstPerson ? 0.024 : 0.018);

          const speciesShade =
            (cell.cellHash - 0.5) * 28 + crownHeightProfile * 20 - (1 - crownHeightProfile) * 24;
          r = Math.max(0, Math.min(255, Math.round(baseRgb[0] + speciesShade + fine2 * 14)));
          g = Math.max(0, Math.min(255, Math.round(baseRgb[1] + speciesShade * 1.15 + fine2 * 18)));
          b = Math.max(0, Math.min(255, Math.round(baseRgb[2] + speciesShade * 0.75 + fine2 * 10)));
          break;
        }
      }

      // Biological Soil Crust (BSC) / Meadow turf: velvety fibrous thalli
      const turfCell = cellularFeature2D(px * 64.0, pz * 64.0, tileSeed + 613);
      const thallusProfile = Math.sin(px * 55.0 + pz * 35.0 + fine1 * 6.0) * 10;
      const patchDensity = Math.max(0, Math.min(1, baseFbm * 1.3 + (1.0 - turfCell.dist)));

      // Soil exposure in gaps between biological colonies
      const isBareSoil = turfCell.dist > 0.42;
      const soilGrit = (fine2 - 0.5) * 18 + grain * 14;

      bumpX += (turfCell.dx * 0.8 + (fine1 - 0.5) * 0.4);
      bumpZ += (turfCell.dy * 0.8 + grain * 0.4);
      hDelta += (patchDensity * 0.005);

      if (isBareSoil) {
        // Exposed substrate soil
        const soilBase = comp.lowlandHex ? [115, 95, 78] : [baseRgb[0] * 0.7, baseRgb[1] * 0.7, baseRgb[2] * 0.7];
        r = Math.max(0, Math.min(255, Math.round(soilBase[0] + soilGrit)));
        g = Math.max(0, Math.min(255, Math.round(soilBase[1] + soilGrit * 0.95)));
        b = Math.max(0, Math.min(255, Math.round(soilBase[2] + soilGrit * 0.85)));
      } else {
        // Vivid pigment thallus carpet
        const pigmentGlow = thallusProfile + fine2 * 14 + (turfCell.cellHash - 0.5) * 16;
        r = Math.max(0, Math.min(255, Math.round(baseRgb[0] + pigmentGlow * 0.9)));
        g = Math.max(0, Math.min(255, Math.round(baseRgb[1] + pigmentGlow * 1.15)));
        b = Math.max(0, Math.min(255, Math.round(baseRgb[2] + pigmentGlow * 0.8)));
      }
      break;
    }

    // =========================================================================
    // 6. ALLUVIAL SILT & ESTUARY MUD CRACKS
    // =========================================================================
    case 'ALLUVIAL_SILT': {
      // Polygonal mud desiccation crack network
      const mudCell = cellularFeature2D(px * 32.0, pz * 32.0, tileSeed + 349);
      const isMudCrack = mudCell.dist > 0.42;
      const crackDepth = isMudCrack ? (mudCell.dist - 0.42) / 0.18 : 0;

      // Wet silt moisture sheen in depressions
      const isWet = hLocal < 0.045;
      const wetT = isWet ? Math.max(0, (0.045 - hLocal) / 0.045) : 0;

      bumpX += (mudCell.dx * 0.9 + (fine1 - 0.5) * 0.35);
      bumpZ += (mudCell.dy * 0.9 + grain * 0.35);
      hDelta += (0.004 - crackDepth * 0.009);

      const siltVar = (fine2 - 0.5) * 16 + grain * 12 - crackDepth * 38;
      // Wet silt is darker and has specular moisture sheen
      const wetDarkening = 1.0 - wetT * 0.28;
      r = Math.max(0, Math.min(255, Math.round((baseRgb[0] * wetDarkening + siltVar))));
      g = Math.max(0, Math.min(255, Math.round((baseRgb[1] * wetDarkening + siltVar * 0.95))));
      b = Math.max(0, Math.min(255, Math.round((baseRgb[2] * wetDarkening + siltVar * 0.9 + wetT * 18))));
      break;
    }

    // =========================================================================
    // 7. REGOLITH GRAVEL & IMPACT SOIL (Default)
    // =========================================================================
    case 'REGOLITH_GRAVEL':
    default: {
      // Multi-scale Voronoi pebble & clast scatter
      const pebbleCell = cellularFeature2D(px * 38.0, pz * 38.0, tileSeed + 911);
      const pebbleMicro = cellularFeature2D(px * 92.0, pz * 92.0, tileSeed + 1049);
      const hasMacroPebble = pebbleCell.dist < 0.28;
      const hasMicroPebble = pebbleMicro.dist < 0.22;

      let relief = (fine1 - 0.5) * 22 + (fine2 - 0.5) * 16 + grain * 14;

      if (hasMacroPebble) {
        const uPeb = pebbleCell.dist / 0.28;
        const pebbleHeight = Math.sqrt(Math.max(0, 1.0 - uPeb * uPeb));
        // Ambient occlusion ring around pebble base
        const pebbleAo = uPeb > 0.8 ? (1.0 - uPeb) * 45 : 0;
        relief += pebbleHeight * 26 - pebbleAo;
        bumpX += (pebbleCell.dx / 0.28) * 1.35;
        bumpZ += (pebbleCell.dy / 0.28) * 1.35;
        hDelta += pebbleHeight * 0.009;
      } else if (hasMicroPebble) {
        const uMicro = pebbleMicro.dist / 0.22;
        relief += (1.0 - uMicro) * 14;
        bumpX += (pebbleMicro.dx / 0.22) * 0.85;
        bumpZ += (pebbleMicro.dy / 0.22) * 0.85;
        hDelta += 0.004;
      }

      // Impact crater ejecta ray breccia
      if (craterIntensity > 0.05) {
        const brecciaNoise = Math.sin(px * 55.0 + pz * 48.0 + baseFbm * 9.0);
        relief += brecciaNoise * 10 * craterIntensity;
      }

      r = Math.max(0, Math.min(255, Math.round(baseRgb[0] + relief)));
      g = Math.max(0, Math.min(255, Math.round(baseRgb[1] + relief * 0.96)));
      b = Math.max(0, Math.min(255, Math.round(baseRgb[2] + relief * 0.9)));
      break;
    }
  }

  return {
    r,
    g,
    b,
    bumpX,
    bumpZ,
    hDelta,
    flags,
  };
}
