/**
 * proceduralTrees.ts
 * Procedural 3D Low-Poly Geometric Tree Assets & High-Density Forest Generation
 * for forested biomes on worlds with large land plants.
 */

import { PlanetarySurfaceModel } from './surfaceGenMath';
import { GoldbergPlanetaryTile } from './goldbergTileGrid';
import { PlanetaryEcosystemSummary, XenofloraSpecies } from '../../../core/xenobiology/floraGen';
import { hash2, fbm2D, hexToRgb } from './terrainNoise';

export type TreeStyle = 'broadleaf' | 'conifer' | 'mangrove';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TreeFacet3D {
  // 3D vertices in world coordinates
  v0: Vec3;
  v1: Vec3;
  v2: Vec3;
  // Outward-facing 3D surface normal
  nx: number;
  ny: number;
  nz: number;
  // Facet material category
  type: 'trunk' | 'foliage' | 'foliage_top' | 'underside' | 'root';
  // Subtle organic color jitter per facet [-0.15 .. +0.15]
  tintOffset: number;
}

export interface ProceduralTree {
  x: number;
  z: number;
  y: number; // Ground elevation
  height: number;
  radius: number;
  style: TreeStyle;
  foliageRgb: [number, number, number];
  foliageHighlightRgb: [number, number, number];
  foliageShadowRgb: [number, number, number];
  barkRgb: [number, number, number];
  seed: number;
  // 3D polygonal facets comprising the tree asset
  facets: TreeFacet3D[];
  // Ground shadow vertices
  shadowPoly: Vec3[];
}

export interface ProjectedPoint {
  sx: number;
  sy: number;
  persp: number;
  depth: number;
}

export interface TreeLightingParams {
  lx: number;
  ly: number;
  lz: number;
  isNight: boolean;
  isSunset: boolean;
  verticalExag: number;
}

/**
 * Checks if the planetary ecosystem supports large multicellular land plants (trees, spires, or tall fronds).
 */
export function hasLargeLandPlants(
  surfaceModel: PlanetarySurfaceModel,
  ecosystem?: PlanetaryEcosystemSummary
): boolean {
  if (surfaceModel.isNoSurface || surfaceModel.isGasGiant || surfaceModel.isIceGiant) {
    return false;
  }

  // 1. If ecosystem summary is available, inspect species morphology
  if (ecosystem) {
    if (!ecosystem.isMulticellular || !ecosystem.hasPlantLife) return false;
    return ecosystem.speciesList.some(
      (s: XenofloraSpecies) =>
        (s.formCategory === 'Tree' || s.formCategory === 'Spire' || s.formCategory === 'Frond') &&
        s.averageHeightM >= 2.0
    );
  }

  // 2. Fallback to surface model biosphere attributes
  return Boolean(
    surfaceModel.hasBiosphere &&
      surfaceModel.isMulticellularLife &&
      !surfaceModel.isUnicellularOnly &&
      surfaceModel.floraPalette?.hasAnyLife
  );
}

/**
 * Determines whether a given planetary tile is a forested/woodland biome.
 */
export function isForestedBiome(
  activeTile: GoldbergPlanetaryTile,
  surfaceModel: PlanetarySurfaceModel
): boolean {
  if (surfaceModel.isNoSurface || activeTile.isOcean || activeTile.isLava) {
    return false;
  }

  const id = activeTile.biomeId;
  const name = (activeTile.biomeName || '').toLowerCase();
  const primaryName = (activeTile.primaryBiomeName || '').toLowerCase();
  const secName = (activeTile.secondaryBiomeName || '').toLowerCase();

  // Biome IDs in the system:
  // 5 = Forest (Temperate / Cryo-Ammonia Forest)
  // 6 = Boreal Forest / Taiga (when plant life is active)
  // 3 = Coastal Marsh & Mangrove Forest (when plant life is active)
  const hasLife = surfaceModel.floraPalette?.hasAnyLife ?? true;
  const isForestId = id === 5 || (id === 6 && hasLife) || (id === 3 && hasLife);

  const hasForestKeyword =
    name.includes('forest') ||
    name.includes('woodland') ||
    name.includes('taiga') ||
    name.includes('canopy') ||
    name.includes('mangrove') ||
    name.includes('jungle') ||
    primaryName.includes('forest') ||
    primaryName.includes('woodland') ||
    primaryName.includes('taiga') ||
    secName.includes('forest') ||
    secName.includes('woodland') ||
    secName.includes('taiga');

  return isForestId || hasForestKeyword;
}

// ============================================================================
// 3D LOW-POLY GEOMETRIC ASSET CONSTRUCTORS
// ============================================================================

function computeNormal(v0: Vec3, v1: Vec3, v2: Vec3): Vec3 {
  const ax = v1.x - v0.x;
  const ay = v1.y - v0.y;
  const az = v1.z - v0.z;
  const bx = v2.x - v0.x;
  const by = v2.y - v0.y;
  const bz = v2.z - v0.z;
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

/**
 * Builds 3D polygonal facets for a tapered prismatic tree trunk with base flare roots.
 */
function build3DTrunkFacets(
  cx: number,
  baseY: number,
  cz: number,
  trunkH: number,
  trunkR: number,
  seed: number
): TreeFacet3D[] {
  const facets: TreeFacet3D[] = [];
  const S = 5; // 5-sided low-poly cylinder
  const rBase = trunkR;
  const rTop = trunkR * 0.62;
  const topY = baseY + trunkH;

  const baseVerts: Vec3[] = [];
  const topVerts: Vec3[] = [];

  for (let i = 0; i < S; i++) {
    const ang = (i / S) * Math.PI * 2;
    const jAng = (hash2(i, 7, seed) - 0.5) * 0.15;
    const a = ang + jAng;
    baseVerts.push({
      x: cx + Math.cos(a) * rBase,
      y: baseY,
      z: cz + Math.sin(a) * rBase,
    });
    topVerts.push({
      x: cx + Math.cos(a) * rTop,
      y: topY,
      z: cz + Math.sin(a) * rTop,
    });
  }

  // Trunk side facets (2 triangles per side quad)
  for (let i = 0; i < S; i++) {
    const next = (i + 1) % S;
    const b0 = baseVerts[i];
    const b1 = baseVerts[next];
    const t0 = topVerts[i];
    const t1 = topVerts[next];

    const n1 = computeNormal(b0, b1, t0);
    const n2 = computeNormal(b1, t1, t0);
    const tint = (hash2(i, 23, seed) - 0.5) * 0.12;

    facets.push({
      v0: b0,
      v1: b1,
      v2: t0,
      nx: n1.x,
      ny: n1.y,
      nz: n1.z,
      type: 'trunk',
      tintOffset: tint,
    });
    facets.push({
      v0: b1,
      v1: t1,
      v2: t0,
      nx: n2.x,
      ny: n2.y,
      nz: n2.z,
      type: 'trunk',
      tintOffset: tint,
    });
  }

  // Flaring root buttresses around trunk base (3 buttresses)
  for (let r = 0; r < 3; r++) {
    const rootAng = (r / 3) * Math.PI * 2 + hash2(r, 9, seed) * 0.4;
    const rootOut = rBase * 1.75;
    const rTip: Vec3 = {
      x: cx + Math.cos(rootAng) * rootOut,
      y: baseY - 0.001,
      z: cz + Math.sin(rootAng) * rootOut,
    };
    const rSide1: Vec3 = {
      x: cx + Math.cos(rootAng + 0.4) * rBase,
      y: baseY + trunkH * 0.25,
      z: cz + Math.sin(rootAng + 0.4) * rBase,
    };
    const rSide2: Vec3 = {
      x: cx + Math.cos(rootAng - 0.4) * rBase,
      y: baseY + trunkH * 0.25,
      z: cz + Math.sin(rootAng - 0.4) * rBase,
    };
    const rn = computeNormal(rTip, rSide1, rSide2);
    facets.push({
      v0: rTip,
      v1: rSide1,
      v2: rSide2,
      nx: rn.x,
      ny: rn.y,
      nz: rn.z,
      type: 'root',
      tintOffset: -0.05,
    });
  }

  return facets;
}

/**
 * Builds a 3D faceted low-poly polyhedron lobe for broadleaf canopies.
 */
function build3DFoliageLobe(
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  seed: number
): TreeFacet3D[] {
  const facets: TreeFacet3D[] = [];
  const S = 6; // 6-sided faceted sphere rings

  const topPole: Vec3 = { x: cx, y: cy + ry, z: cz };
  const btmPole: Vec3 = { x: cx, y: cy - ry * 0.85, z: cz };

  const ringTop: Vec3[] = [];
  const ringBtm: Vec3[] = [];

  for (let i = 0; i < S; i++) {
    const a = (i / S) * Math.PI * 2 + (hash2(i, 11, seed) - 0.5) * 0.25;
    const jR1 = 0.88 + hash2(i, 13, seed) * 0.24;
    const jR2 = 0.84 + hash2(i, 17, seed) * 0.24;

    ringTop.push({
      x: cx + Math.cos(a) * rx * jR1,
      y: cy + ry * 0.38,
      z: cz + Math.sin(a) * rz * jR1,
    });
    ringBtm.push({
      x: cx + Math.cos(a + 0.25) * rx * jR2,
      y: cy - ry * 0.38,
      z: cz + Math.sin(a + 0.25) * rz * jR2,
    });
  }

  // Upper cap triangles (connected to top pole)
  for (let i = 0; i < S; i++) {
    const next = (i + 1) % S;
    const v0 = topPole;
    const v1 = ringTop[i];
    const v2 = ringTop[next];
    const norm = computeNormal(v0, v1, v2);
    const tint = (hash2(i, 31, seed) - 0.5) * 0.16;
    facets.push({
      v0,
      v1,
      v2,
      nx: norm.x,
      ny: norm.y,
      nz: norm.z,
      type: 'foliage_top',
      tintOffset: tint,
    });
  }

  // Mid-belt quads (2 triangles per quad)
  for (let i = 0; i < S; i++) {
    const next = (i + 1) % S;
    const t0 = ringTop[i];
    const t1 = ringTop[next];
    const b0 = ringBtm[i];
    const b1 = ringBtm[next];

    const n1 = computeNormal(t0, b0, t1);
    const n2 = computeNormal(t1, b0, b1);
    const tint = (hash2(i, 43, seed) - 0.5) * 0.14;

    facets.push({
      v0: t0,
      v1: b0,
      v2: t1,
      nx: n1.x,
      ny: n1.y,
      nz: n1.z,
      type: 'foliage',
      tintOffset: tint,
    });
    facets.push({
      v0: t1,
      v1: b0,
      v2: b1,
      nx: n2.x,
      ny: n2.y,
      nz: n2.z,
      type: 'foliage',
      tintOffset: tint,
    });
  }

  // Lower underside triangles (connected to bottom pole)
  for (let i = 0; i < S; i++) {
    const next = (i + 1) % S;
    const v0 = ringBtm[i];
    const v1 = btmPole;
    const v2 = ringBtm[next];
    const norm = computeNormal(v0, v1, v2);
    const tint = (hash2(i, 57, seed) - 0.5) * 0.12;
    facets.push({
      v0,
      v1,
      v2,
      nx: norm.x,
      ny: norm.y,
      nz: norm.z,
      type: 'underside',
      tintOffset: tint,
    });
  }

  return facets;
}

/**
 * Builds a multi-tiered 3D low-poly conifer spire.
 */
function build3DConiferFacets(
  cx: number,
  baseY: number,
  cz: number,
  height: number,
  radius: number,
  seed: number
): TreeFacet3D[] {
  const facets: TreeFacet3D[] = [];
  const tiers = 3;
  const S = 5; // 5-sided pyramidal tiers

  for (let t = 0; t < tiers; t++) {
    const frac = t / tiers;
    const tierR = radius * (1.15 - frac * 0.35);
    const tierBaseY = baseY + height * (0.24 + frac * 0.28);
    const tierApexY = tierBaseY + height * 0.44;
    const apex: Vec3 = { x: cx, y: tierApexY, z: cz };

    const baseVerts: Vec3[] = [];
    for (let i = 0; i < S; i++) {
      const a = (i / S) * Math.PI * 2 + (hash2(i, t + 7, seed) - 0.5) * 0.18;
      baseVerts.push({
        x: cx + Math.cos(a) * tierR,
        y: tierBaseY,
        z: cz + Math.sin(a) * tierR,
      });
    }

    // Lateral triangular facets
    for (let i = 0; i < S; i++) {
      const next = (i + 1) % S;
      const v0 = apex;
      const v1 = baseVerts[i];
      const v2 = baseVerts[next];
      const norm = computeNormal(v0, v1, v2);
      const tint = (hash2(i, t * 13 + 19, seed) - 0.5) * 0.15;
      facets.push({
        v0,
        v1,
        v2,
        nx: norm.x,
        ny: norm.y,
        nz: norm.z,
        type: t === tiers - 1 ? 'foliage_top' : 'foliage',
        tintOffset: tint,
      });
    }

    // Underside shadow facets
    const underCenter: Vec3 = { x: cx, y: tierBaseY - 0.003, z: cz };
    for (let i = 0; i < S; i++) {
      const next = (i + 1) % S;
      const v0 = baseVerts[i];
      const v1 = underCenter;
      const v2 = baseVerts[next];
      const norm = computeNormal(v0, v1, v2);
      facets.push({
        v0,
        v1,
        v2,
        nx: norm.x,
        ny: norm.y,
        nz: norm.z,
        type: 'underside',
        tintOffset: -0.1,
      });
    }
  }

  return facets;
}

/**
 * Builds 3D arching stilt roots for coastal mangrove trees.
 */
function build3DMangroveRootFacets(
  cx: number,
  baseY: number,
  cz: number,
  trunkH: number,
  trunkR: number,
  seed: number
): TreeFacet3D[] {
  const facets: TreeFacet3D[] = [];
  const numStruts = 6;
  const rootRadius = trunkR * 3.2;

  for (let s = 0; s < numStruts; s++) {
    const a = (s / numStruts) * Math.PI * 2 + (hash2(s, 71, seed) - 0.5) * 0.3;
    const topJoint: Vec3 = {
      x: cx + Math.cos(a) * trunkR * 0.8,
      y: baseY + trunkH * 0.55,
      z: cz + Math.sin(a) * trunkR * 0.8,
    };
    const groundFoot: Vec3 = {
      x: cx + Math.cos(a) * rootRadius,
      y: baseY - 0.002,
      z: cz + Math.sin(a) * rootRadius,
    };
    const midKnee: Vec3 = {
      x: cx + Math.cos(a) * (rootRadius * 0.75),
      y: baseY + trunkH * 0.28,
      z: cz + Math.sin(a) * (rootRadius * 0.75),
    };

    // Stilt root arch triangle
    const n = computeNormal(topJoint, midKnee, groundFoot);
    facets.push({
      v0: topJoint,
      v1: midKnee,
      v2: groundFoot,
      nx: n.x,
      ny: n.y,
      nz: n.z,
      type: 'root',
      tintOffset: -0.06,
    });
  }

  return facets;
}

// ============================================================================
// FOREST GENERATOR: DENSELY PACKED 3D ASSETS
// ============================================================================

/**
 * Procedurally generates a densely packed forest of 3D tree models across a forested tile.
 */
export function generateTileTrees(params: {
  tile: GoldbergPlanetaryTile;
  surfaceModel: PlanetarySurfaceModel;
  ecosystem?: PlanetaryEcosystemSummary;
  tileSeed: number;
  sampleHeight: (px: number, pz: number) => {
    hLocal: number;
    oceanWeight: number;
    lavaWeight: number;
    fissureWeight: number;
  };
  sides: number;
  corners: [number, number][];
}): ProceduralTree[] {
  const { tile, surfaceModel, ecosystem, tileSeed, sampleHeight, sides, corners } = params;

  // Only generate trees if there are large land plants on this world in a forested biome
  if (!hasLargeLandPlants(surfaceModel, ecosystem) || !isForestedBiome(tile, surfaceModel)) {
    return [];
  }

  const name = (tile.biomeName || '').toLowerCase();
  const isConifer =
    name.includes('boreal') ||
    name.includes('taiga') ||
    tile.biomeId === 6 ||
    tile.temperatureK < 274;
  const isMangrove =
    (name.includes('mangrove') || name.includes('marsh') || tile.biomeId === 3) &&
    !isConifer;
  const style: TreeStyle = isConifer ? 'conifer' : isMangrove ? 'mangrove' : 'broadleaf';

  // Resolve base foliage pigment color from species or surface model flora palette
  let baseFoliageHex = surfaceModel.floraPalette?.woodlandHex || '#3d7a42';
  if (isConifer && surfaceModel.floraPalette?.taigaHex) {
    baseFoliageHex = surfaceModel.floraPalette.taigaHex;
  } else if (isMangrove && surfaceModel.floraPalette?.marshHex) {
    baseFoliageHex = surfaceModel.floraPalette.marshHex;
  }

  // If specific tree species exists in the ecosystem, inherit its exact pigment
  if (ecosystem?.speciesList) {
    const matchingTree =
      ecosystem.speciesList.find(
        (s: XenofloraSpecies) =>
          (s.formCategory === 'Tree' || s.formCategory === 'Spire') &&
          s.nativeBiomeIds.includes(tile.biomeId)
      ) ||
      ecosystem.speciesList.find((s: XenofloraSpecies) => s.formCategory === 'Tree' || s.formCategory === 'Spire');
    if (matchingTree?.pigmentColorHex) {
      baseFoliageHex = matchingTree.pigmentColorHex;
    }
  }

  const baseFoliageRgb = hexToRgb(baseFoliageHex);

  // Derive bark / trunk color
  const baseBarkRgb: [number, number, number] = isConifer
    ? [58, 48, 42]
    : isMangrove
    ? [72, 45, 28]
    : [64, 40, 24];

  const trees: ProceduralTree[] = [];

  // Fine 22x22 distribution grid for densely packed forest canopy (~484 grid cells)
  const gridN = 22;
  const step = 2.0 / gridN;

  for (let gx = 0; gx < gridN; gx++) {
    for (let gz = 0; gz < gridN; gz++) {
      const cellSeed = tileSeed + gx * 137 + gz * 293;

      // Base jittered coordinate within grid cell
      const jx = (hash2(gx, gz, cellSeed) - 0.5) * 0.78;
      const jz = (hash2(gx + 12, gz + 17, cellSeed + 31) - 0.5) * 0.78;
      const px = -1.0 + (gx + 0.5) * step + jx * step;
      const pz = -1.0 + (gz + 0.5) * step + jz * step;

      // 1. Tile boundary & margin check
      const distFromCenter = Math.hypot(px, pz);
      if (distFromCenter > 0.89) continue;

      let insidePoly = true;
      for (let s = 0; s < sides; s++) {
        const cA = corners[s];
        const cB = corners[(s + 1) % sides];
        const cross = (cB[0] - cA[0]) * (pz - cA[1]) - (cB[1] - cA[1]) * (px - cA[0]);
        if (cross < 0.06) {
          insidePoly = false;
          break;
        }
      }
      if (!insidePoly) continue;

      // 2. Multi-frequency forest density mask: creates rich contiguous forest stands
      const groveDensity = fbm2D(px * 4.0, pz * 4.0, tileSeed + 719, 3);
      if (groveDensity < 0.22) continue; // Natural meadows, rivers, and sunlit clearings

      // In dense grove cores, generate 2 companion trees (main canopy giant + understory companion)
      const treesInCell = groveDensity > 0.44 ? 2 : 1;

      for (let subIdx = 0; subIdx < treesInCell; subIdx++) {
        const subSeed = cellSeed + subIdx * 541;
        const subOffsetX = subIdx === 0 ? 0 : (hash2(gx, gz, subSeed + 1) - 0.5) * step * 0.65;
        const subOffsetZ = subIdx === 0 ? 0 : (hash2(gx, gz, subSeed + 2) - 0.5) * step * 0.65;
        const treeX = px + subOffsetX;
        const treeZ = pz + subOffsetZ;

        // Sample terrain elevation and exclusion zones (water, lava, fissure, crater)
        const hSample = sampleHeight(treeX, treeZ);
        if (hSample.oceanWeight > 0.32 || hSample.hLocal < 0.004) continue;
        if (hSample.lavaWeight > 0.2 || hSample.fissureWeight > 0.2) continue;

        // Slope check: reject sheer vertical cliffs
        const eps = 0.015;
        const hL = sampleHeight(treeX - eps, treeZ).hLocal;
        const hR = sampleHeight(treeX + eps, treeZ).hLocal;
        const hD = sampleHeight(treeX, treeZ - eps).hLocal;
        const hU = sampleHeight(treeX, treeZ + eps).hLocal;
        const slope = Math.hypot((hR - hL) / (2 * eps), (hU - hD) / (2 * eps));
        if (slope > 0.58) continue;

        // Dimensions: main canopy vs understory companion
        const isCompanion = subIdx > 0;
        const sizeMult = isCompanion
          ? 0.55 + hash2(gx, gz, subSeed + 13) * 0.25
          : 0.82 + hash2(gx, gz, subSeed + 17) * 0.38;

        const height = (isConifer ? 0.062 : isMangrove ? 0.048 : 0.056) * sizeMult;
        const radius = (isConifer ? 0.021 : isMangrove ? 0.034 : 0.028) * sizeMult;
        const trunkH = height * (isConifer ? 0.26 : isMangrove ? 0.36 : 0.40);
        const trunkR = radius * (isConifer ? 0.15 : 0.18);

        // Perturb foliage color slightly (+/- 8% warmth & brightness)
        const colorJitter = (hash2(gx, gz, subSeed + 101) - 0.5) * 0.16;
        const rF = Math.max(0, Math.min(255, Math.round(baseFoliageRgb[0] * (1.0 + colorJitter))));
        const gF = Math.max(0, Math.min(255, Math.round(baseFoliageRgb[1] * (1.0 + colorJitter))));
        const bF = Math.max(0, Math.min(255, Math.round(baseFoliageRgb[2] * (1.0 + colorJitter))));

        const highlightRgb: [number, number, number] = [
          Math.min(255, Math.round(rF * 1.35 + 24)),
          Math.min(255, Math.round(gF * 1.35 + 28)),
          Math.min(255, Math.round(bF * 1.35 + 16)),
        ];

        const shadowRgb: [number, number, number] = [
          Math.max(0, Math.round(rF * 0.48)),
          Math.max(0, Math.round(gF * 0.48)),
          Math.max(0, Math.round(bF * 0.48)),
        ];

        // Construct true 3D polygonal facets in world coordinates
        const facets: TreeFacet3D[] = [];

        // 1. Trunk facets
        const trunkFacets = build3DTrunkFacets(treeX, hSample.hLocal, treeZ, trunkH, trunkR, subSeed);
        for (let f = 0; f < trunkFacets.length; f++) facets.push(trunkFacets[f]);

        // 2. Canopy facets based on biome style
        if (style === 'conifer') {
          const coniferFacets = build3DConiferFacets(treeX, hSample.hLocal, treeZ, height, radius, subSeed);
          for (let f = 0; f < coniferFacets.length; f++) facets.push(coniferFacets[f]);
        } else if (style === 'mangrove') {
          const mangroveRoots = build3DMangroveRootFacets(treeX, hSample.hLocal, treeZ, trunkH, trunkR, subSeed);
          for (let f = 0; f < mangroveRoots.length; f++) facets.push(mangroveRoots[f]);

          // Flattened umbrella dome canopy
          const domeFacets = build3DFoliageLobe(
            treeX,
            hSample.hLocal + trunkH + radius * 0.45,
            treeZ,
            radius * 1.25,
            radius * 0.55,
            radius * 1.25,
            subSeed
          );
          for (let f = 0; f < domeFacets.length; f++) facets.push(domeFacets[f]);
        } else {
          // Broadleaf: 2 interlocking low-poly 3D polyhedral lobes
          const mainLobe = build3DFoliageLobe(
            treeX,
            hSample.hLocal + trunkH + radius * 0.72,
            treeZ,
            radius * 0.95,
            radius * 0.95,
            radius * 0.95,
            subSeed
          );
          for (let f = 0; f < mainLobe.length; f++) facets.push(mainLobe[f]);

          // Asymmetrical secondary foliage lobe
          const secAng = hash2(gx, gz, subSeed + 311) * Math.PI * 2;
          const secDist = radius * 0.42;
          const secLobe = build3DFoliageLobe(
            treeX + Math.cos(secAng) * secDist,
            hSample.hLocal + trunkH + radius * 0.55,
            treeZ + Math.sin(secAng) * secDist,
            radius * 0.68,
            radius * 0.65,
            radius * 0.68,
            subSeed + 401
          );
          for (let f = 0; f < secLobe.length; f++) facets.push(secLobe[f]);
        }

        // 3. Ground shadow polygon in 3D
        const shadowPoly: Vec3[] = [
          { x: treeX - radius * 0.85, y: hSample.hLocal, z: treeZ - radius * 0.65 },
          { x: treeX + radius * 0.85, y: hSample.hLocal, z: treeZ - radius * 0.65 },
          { x: treeX + radius * 0.95, y: hSample.hLocal, z: treeZ + radius * 0.65 },
          { x: treeX - radius * 0.95, y: hSample.hLocal, z: treeZ + radius * 0.65 },
        ];

        trees.push({
          x: treeX,
          z: treeZ,
          y: hSample.hLocal,
          height,
          radius,
          style,
          foliageRgb: [rF, gF, bF],
          foliageHighlightRgb: highlightRgb,
          foliageShadowRgb: shadowRgb,
          barkRgb: baseBarkRgb,
          seed: subSeed,
          facets,
          shadowPoly,
        });
      }
    }
  }

  return trees;
}

// ============================================================================
// 3D ASSET RASTERIZER & LIGHTING
// ============================================================================

/**
 * Renders all 3D procedural tree assets with 3D facet projection, directional lighting,
 * back-face culling, and ground drop shadows.
 */
export function renderTileTrees(
  ctx: CanvasRenderingContext2D,
  trees: ProceduralTree[],
  project3D: (x: number, y: number, z: number) => ProjectedPoint,
  lighting: TreeLightingParams,
  rotPitch: number,
  scale: number
): void {
  if (!trees || trees.length === 0) return;

  const { lx, ly, lz, isNight, isSunset } = lighting;

  // Project tree center depth for back-to-front sorting (painter's depth ordering)
  interface TreeDepthItem {
    tree: ProceduralTree;
    depth: number;
    baseProj: ProjectedPoint;
  }

  const items: TreeDepthItem[] = [];
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    const p = project3D(t.x, t.y, t.z);
    if (p.depth <= 0.25) continue; // Behind camera
    items.push({ tree: t, depth: p.depth, baseProj: p });
  }

  // Sort back-to-front
  items.sort((a, b) => b.depth - a.depth);

  const nightDim = isNight ? 0.32 : isSunset ? 0.86 : 1.0;
  const shadowAlpha = isNight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(15, 23, 42, 0.36)';

  ctx.save();

  for (let i = 0; i < items.length; i++) {
    const { tree, baseProj } = items[i];
    const persp = baseProj.persp;

    // 1. Directional ground drop shadow
    const sDist = tree.height * 0.72 * scale * persp;
    const sx = baseProj.sx - lx * sDist * 0.44;
    const sy = baseProj.sy - lz * sDist * 0.34;
    const sRx = tree.radius * scale * persp * (1.15 + Math.abs(lx) * 0.4);
    const sRy = tree.radius * scale * persp * (0.55 + 0.38 * Math.sin(rotPitch));

    ctx.fillStyle = shadowAlpha;
    ctx.beginPath();
    ctx.ellipse(sx, sy, Math.max(1, sRx), Math.max(1, sRy), 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Render each true 3D geometric facet with 3D backface culling & lighting
    const facets = tree.facets;
    const fCount = facets.length;

    for (let f = 0; f < fCount; f++) {
      const facet = facets[f];

      // Project the 3 world vertices into screen coordinates
      const p0 = project3D(facet.v0.x, facet.v0.y, facet.v0.z);
      const p1 = project3D(facet.v1.x, facet.v1.y, facet.v1.z);
      const p2 = project3D(facet.v2.x, facet.v2.y, facet.v2.z);

      // 3D Screen Back-Face Culling: 2D cross product of projected screen triangle
      // If winding is counter-clockwise or degenerate, facet points away from camera
      const cross = (p1.sx - p0.sx) * (p2.sy - p0.sy) - (p2.sx - p0.sx) * (p1.sy - p0.sy);
      if (cross <= 0.05) continue; // Culled!

      // 3D Directional Lighting on the facet normal
      const nDotL = Math.max(0, facet.nx * lx + facet.ny * ly + facet.nz * lz);
      const skyAmbient = Math.max(0, facet.ny) * 0.28 + 0.24;
      const groundBounce = Math.max(0, -facet.ny) * 0.12;

      let baseR: number;
      let baseG: number;
      let baseB: number;

      if (facet.type === 'trunk' || facet.type === 'root') {
        const [br, bg, bb] = tree.barkRgb;
        baseR = br;
        baseG = bg;
        baseB = bb;
      } else {
        const [fr, fg, fb] = tree.foliageRgb;
        baseR = fr;
        baseG = fg;
        baseB = fb;
      }

      // Apply subtle facet tint jitter so low-poly facets have distinct crystalline edges
      const tintMult = 1.0 + facet.tintOffset;
      let lightFactor = (nDotL * 0.68 + skyAmbient + groundBounce) * tintMult;

      if (facet.type === 'underside') {
        lightFactor *= 0.58; // Deep shadow under canopy tiers
      } else if (facet.type === 'foliage_top') {
        lightFactor = Math.min(1.4, lightFactor * 1.18); // Sunlit canopy highlights
      }

      const r = Math.max(0, Math.min(255, Math.round(baseR * lightFactor * nightDim)));
      const g = Math.max(0, Math.min(255, Math.round(baseG * lightFactor * nightDim)));
      const b = Math.max(0, Math.min(255, Math.round(baseB * lightFactor * nightDim)));

      // Render crisp 3D polygonal facet
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.beginPath();
      ctx.moveTo(p0.sx, p0.sy);
      ctx.lineTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.closePath();
      ctx.fill();

      // Subtle crisp 3D polygonal wire edge to give authentic 3D asset definition
      if (facet.type !== 'trunk') {
        const edgeR = Math.max(0, Math.round(r * 0.88));
        const edgeG = Math.max(0, Math.round(g * 0.88));
        const edgeB = Math.max(0, Math.round(b * 0.88));
        ctx.strokeStyle = `rgba(${edgeR}, ${edgeG}, ${edgeB}, 0.55)`;
        ctx.lineWidth = 0.45;
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}
