/**
 * detailedBiomeTextures.ts
 * 
 * High-Detail Procedural Surface Texture & Micro-Relief Engine.
 * Tiles and dynamically recolors high-resolution (512x512) static biome texture assets:
 * - dune_sand.png (eolian wind ripples, slipfaces, grain sorting, quartz glitter)
 * - bedrock_strata.png (sedimentary strata, planar fractures, cleavage, cliff scree)
 * - vesicular_basalt.png (ropy pahoehoe folds, pumice gas pores, cooling fissures)
 * - glacial_ice.png (ice-wedge contraction polygons, sastrugi snowdrifts, crevasses)
 * - organic_foliage.png (canopy crowns, foliage blades, biocrust thallus felt)
 * - alluvial_mud.png (desiccation mud cracks, smooth silt basins, moisture darkening)
 * - regolith_gravel.png (multi-scale Voronoi pebbles, impact breccia, soil dust)
 * 
 * Dynamically recolors each static texture asset according to planetary crust composition,
 * atmospheric lighting, and xenobiology pigment palettes.
 */

import {
  FLAG_LAVA,
  FLAG_ICE_SPEC,
} from './terrainNoise';
import { PlanetarySurfaceModel } from './surfaceGenMath';
import {
  BiomeTextureArchetype,
  sampleTiledBiomeTexel,
  recolorBiomeTexel,
} from '../../../core/textures/biomeTextureAtlas';

export type { BiomeTextureArchetype };

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
 * Evaluates high-detail tiled static biome texture and recolors it using planetary chemistry.
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
    baseBumpX,
    baseBumpZ,
    fissureWeight,
    surfaceModel,
    craterIntensity = 0.2,
    isFirstPerson = false,
  } = params;

  let flags = 0;
  const archetype = getBiomeTextureArchetype(biomeId, surfaceModel);
  const comp = surfaceModel.compositionPalette;

  // Set appropriate tiling repetition frequencies for macro and close-up views
  let tileFreq = isFirstPerson ? 52.0 : 32.0;
  let mineralRgb: [number, number, number] | undefined = comp.lowlandRgb;
  let isCryoTholin = false;

  switch (archetype) {
    case 'DUNE_SAND':
      tileFreq = isFirstPerson ? 64.0 : 36.0;
      mineralRgb = comp.lowlandRgb;
      break;

    case 'BEDROCK_STRATA':
      tileFreq = isFirstPerson ? 48.0 : 28.0;
      mineralRgb = comp.mountainRgb;
      break;

    case 'VESICULAR_BASALT':
      tileFreq = isFirstPerson ? 56.0 : 32.0;
      mineralRgb = [75, 70, 78];
      break;

    case 'GLACIAL_PERMAFROST':
      tileFreq = isFirstPerson ? 44.0 : 24.0;
      mineralRgb = [220, 245, 255];
      flags |= FLAG_ICE_SPEC;
      isCryoTholin =
        surfaceModel.seaPalette.solventKey === 'NH3-H2O' ||
        surfaceModel.seaPalette.solventKey === 'CH4-C2H6' ||
        comp.compositionLabel.includes('Tholin');
      break;

    case 'ORGANIC_VEGETATION':
      tileFreq = isFirstPerson ? 52.0 : 30.0;
      mineralRgb = [
        Math.min(255, Math.round(baseRgb[0] * 1.25)),
        Math.min(255, Math.round(baseRgb[1] * 1.35)),
        Math.min(255, Math.round(baseRgb[2] * 0.95)),
      ];
      break;

    case 'ALLUVIAL_SILT':
      tileFreq = isFirstPerson ? 48.0 : 26.0;
      mineralRgb = comp.lowlandRgb;
      break;

    case 'REGOLITH_GRAVEL':
      tileFreq = isFirstPerson ? 56.0 : 34.0;
      mineralRgb = comp.plateauRgb;
      break;
  }

  // Sample the high-resolution seamless static texture asset (vertical strata on cliffs follow elevation)
  const effPz = archetype === 'BEDROCK_STRATA' ? pz + hLocal * 2.2 : pz;
  const sample = sampleTiledBiomeTexel(archetype, px, effPz, tileFreq);

  // In first-person mode, blend a micro-octave (3.5x frequency) for tactile sub-meter resolution
  if (isFirstPerson) {
    const microSample = sampleTiledBiomeTexel(archetype, px, effPz, tileFreq * 3.5);
    sample.lum = sample.lum * 0.72 + microSample.lum * 0.28;
    sample.ao = sample.ao * 0.75 + microSample.ao * 0.25;
    sample.fleck = Math.max(sample.fleck, microSample.fleck);
    sample.bumpX = sample.bumpX * 0.70 + microSample.bumpX * 0.30;
    sample.bumpZ = sample.bumpZ * 0.70 + microSample.bumpZ * 0.30;
  }

  // Dynamically recolor the static texture using the planet's palette
  const recolored = recolorBiomeTexel({
    sample,
    baseRgb,
    mineralRgb,
    isCryoTholin,
  });

  let r = recolored.r;
  let g = recolored.g;
  let b = recolored.b;
  let bumpX = baseBumpX + recolored.bumpX * 0.65;
  let bumpZ = baseBumpZ + recolored.bumpZ * 0.65;
  let hDelta = recolored.hDelta;

  // Active volcanic magma fissures / calderas
  if (fissureWeight > 0.35 && (archetype === 'VESICULAR_BASALT' || surfaceModel.isMoltenWorld)) {
    flags |= FLAG_LAVA;
    const hotT = Math.min(1, (fissureWeight - 0.35) / 0.55);
    r = 255;
    g = Math.round(110 + 130 * hotT);
    b = Math.round(10 + 80 * hotT * hotT);
    bumpX *= 1.8;
  }

  // Canyons & Cliff rock face enhancement
  if (archetype === 'BEDROCK_STRATA' && slope > 0.45) {
    bumpX += dhx * 0.45;
    bumpZ += dhz * 0.45;
  }

  // Crater rim ejecta glint on airless regolith worlds
  if (craterIntensity > 0.35 && archetype === 'REGOLITH_GRAVEL') {
    const ejectaBoost = (craterIntensity - 0.35) * 22;
    r = Math.min(255, Math.round(r + ejectaBoost));
    g = Math.min(255, Math.round(g + ejectaBoost * 0.95));
    b = Math.min(255, Math.round(b + ejectaBoost * 0.85));
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
