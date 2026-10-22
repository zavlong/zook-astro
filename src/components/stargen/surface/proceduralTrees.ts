/**
 * proceduralTrees.ts
 * Procedural 3D tree generation and rendering for forested tiles on worlds with large land plants.
 */

import { PlanetarySurfaceModel } from './surfaceGenMath';
import { GoldbergPlanetaryTile } from './goldbergTileGrid';
import { PlanetaryEcosystemSummary, XenofloraSpecies } from '../../../core/xenobiology/floraGen';
import { hash2, fbm2D, hexToRgb } from './terrainNoise';

export type TreeStyle = 'broadleaf' | 'conifer' | 'mangrove';

export interface ProceduralTree {
  x: number;
  z: number;
  y: number; // Ground elevation in normalized units
  height: number; // Total tree height in world units
  radius: number; // Crown spread radius in world units
  trunkH: number; // Trunk height
  trunkR: number; // Trunk radius
  style: TreeStyle;
  foliageRgb: [number, number, number];
  foliageHighlightRgb: [number, number, number];
  foliageShadowRgb: [number, number, number];
  barkRgb: [number, number, number];
  seed: number;
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

/**
 * Procedurally generates a distributed grove of 3D tree models across a forested tile.
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
  const gridN = 14;
  const step = 2.0 / gridN;

  for (let gx = 0; gx < gridN; gx++) {
    for (let gz = 0; gz < gridN; gz++) {
      const cellSeed = tileSeed + gx * 79 + gz * 193;

      // Jittered coordinate within grid cell
      const jx = (hash2(gx, gz, cellSeed) - 0.5) * 0.72;
      const jz = (hash2(gx + 12, gz + 17, cellSeed + 31) - 0.5) * 0.72;
      const px = -1.0 + (gx + 0.5) * step + jx * step;
      const pz = -1.0 + (gz + 0.5) * step + jz * step;

      // 1. Point-in-polygon & margin check: keep trees comfortably inside tile bounds
      const distFromCenter = Math.hypot(px, pz);
      if (distFromCenter > 0.88) continue;

      let insidePoly = true;
      for (let s = 0; s < sides; s++) {
        const cA = corners[s];
        const cB = corners[(s + 1) % sides];
        const cross = (cB[0] - cA[0]) * (pz - cA[1]) - (cB[1] - cA[1]) * (px - cA[0]);
        if (cross < 0.08) {
          insidePoly = false;
          break;
        }
      }
      if (!insidePoly) continue;

      // 2. Stand & clearing clustering using coherent 2D noise
      const groveDensity = fbm2D(px * 3.2, pz * 3.2, tileSeed + 719, 2);
      if (groveDensity < 0.42) continue; // Natural meadows and clearings

      // 3. Sample terrain elevation and exclusion zones (water, lava, fissure, crater)
      const hSample = sampleHeight(px, pz);
      if (hSample.oceanWeight > 0.28 || hSample.hLocal < 0.005) continue;
      if (hSample.lavaWeight > 0.2 || hSample.fissureWeight > 0.2) continue;

      // 4. Slope check: reject sheer vertical cliffs
      const eps = 0.015;
      const hL = sampleHeight(px - eps, pz).hLocal;
      const hR = sampleHeight(px + eps, pz).hLocal;
      const hD = sampleHeight(px, pz - eps).hLocal;
      const hU = sampleHeight(px, pz + eps).hLocal;
      const slope = Math.hypot((hR - hL) / (2 * eps), (hU - hD) / (2 * eps));
      if (slope > 0.55) continue;

      // 5. Randomize tree dimensions and color variations
      const sizeJitter = 0.82 + hash2(gx, gz, cellSeed + 83) * 0.38;
      const height = (isConifer ? 0.058 : isMangrove ? 0.046 : 0.052) * sizeJitter;
      const radius = (isConifer ? 0.019 : isMangrove ? 0.032 : 0.026) * sizeJitter;
      const trunkH = height * (isConifer ? 0.28 : isMangrove ? 0.38 : 0.42);
      const trunkR = radius * (isConifer ? 0.16 : 0.19);

      // Perturb foliage color slightly (+/- 8% lightness and warmth)
      const colorJitter = (hash2(gx, gz, cellSeed + 137) - 0.5) * 0.18;
      const rF = Math.max(0, Math.min(255, Math.round(baseFoliageRgb[0] * (1.0 + colorJitter))));
      const gF = Math.max(0, Math.min(255, Math.round(baseFoliageRgb[1] * (1.0 + colorJitter))));
      const bF = Math.max(0, Math.min(255, Math.round(baseFoliageRgb[2] * (1.0 + colorJitter))));

      const highlightRgb: [number, number, number] = [
        Math.min(255, Math.round(rF * 1.35 + 24)),
        Math.min(255, Math.round(gF * 1.35 + 28)),
        Math.min(255, Math.round(bF * 1.35 + 16)),
      ];

      const shadowRgb: [number, number, number] = [
        Math.max(0, Math.round(rF * 0.52)),
        Math.max(0, Math.round(gF * 0.52)),
        Math.max(0, Math.round(bF * 0.52)),
      ];

      trees.push({
        x: px,
        z: pz,
        y: hSample.hLocal,
        height,
        radius,
        trunkH,
        trunkR,
        style,
        foliageRgb: [rF, gF, bF],
        foliageHighlightRgb: highlightRgb,
        foliageShadowRgb: shadowRgb,
        barkRgb: baseBarkRgb,
        seed: cellSeed,
      });
    }
  }

  return trees;
}

/**
 * Renders all procedural trees in 3D perspective projection with directional lighting,
 * trunks, tiered canopies, and cast ground shadows.
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

  const { lx, lz, isNight, isSunset, verticalExag } = lighting;

  // Project all trees and collect depth for back-to-front sorting (painter's algorithm)
  interface TreeRenderItem {
    tree: ProceduralTree;
    pBase: ProjectedPoint;
    pTrunkTop: ProjectedPoint;
    pCanopyTop: ProjectedPoint;
    depth: number;
  }

  const items: TreeRenderItem[] = [];

  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    const pBase = project3D(t.x, t.y, t.z);
    if (pBase.depth <= 0.2) continue; // Behind camera

    const pTrunkTop = project3D(t.x, t.y + (t.trunkH / verticalExag), t.z);
    const pCanopyTop = project3D(t.x, t.y + (t.height / verticalExag), t.z);

    items.push({
      tree: t,
      pBase,
      pTrunkTop,
      pCanopyTop,
      depth: pBase.depth,
    });
  }

  // Sort back-to-front
  items.sort((a, b) => b.depth - a.depth);

  ctx.save();

  for (let i = 0; i < items.length; i++) {
    const { tree, pBase, pTrunkTop, pCanopyTop } = items[i];
    const p = pBase.persp;

    // 1. Soft ground shadow cast by the canopy
    const shadowDist = (tree.height * 0.65) * scale * p;
    const shadowX = pBase.sx - lx * shadowDist * 0.42;
    const shadowY = pBase.sy - lz * shadowDist * 0.32;
    const shadowRx = tree.radius * scale * p * (1.1 + Math.abs(lx) * 0.4);
    const shadowRy = tree.radius * scale * p * (0.55 + 0.38 * Math.sin(rotPitch));

    ctx.fillStyle = isNight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(15, 23, 42, 0.38)';
    ctx.beginPath();
    ctx.ellipse(shadowX, shadowY, Math.max(1, shadowRx), Math.max(1, shadowRy), 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Trunk rendering
    const trunkW = Math.max(1.2, tree.trunkR * 2 * scale * p);
    const [br, bg, bb] = tree.barkRgb;
    const nightMult = isNight ? 0.35 : isSunset ? 0.85 : 1.0;
    const barkShaded = `rgb(${Math.round(br * 0.72 * nightMult)}, ${Math.round(bg * 0.72 * nightMult)}, ${Math.round(bb * 0.72 * nightMult)})`;
    const barkLit = `rgb(${Math.round(br * 1.15 * nightMult)}, ${Math.round(bg * 1.15 * nightMult)}, ${Math.round(bb * 1.15 * nightMult)})`;

    if (tree.style === 'mangrove') {
      // Stilt roots branching to ground
      ctx.strokeStyle = barkShaded;
      ctx.lineWidth = Math.max(1, trunkW * 0.42);
      ctx.beginPath();
      ctx.moveTo(pTrunkTop.sx, pTrunkTop.sy);
      ctx.quadraticCurveTo(pBase.sx - trunkW * 2, pBase.sy - 2, pBase.sx - trunkW * 2.5, pBase.sy);
      ctx.moveTo(pTrunkTop.sx, pTrunkTop.sy);
      ctx.quadraticCurveTo(pBase.sx + trunkW * 2, pBase.sy - 2, pBase.sx + trunkW * 2.5, pBase.sy);
      ctx.stroke();
    }

    // Main central trunk column
    ctx.lineWidth = trunkW;
    ctx.strokeStyle = lx >= 0 ? barkLit : barkShaded;
    ctx.beginPath();
    ctx.moveTo(pBase.sx, pBase.sy);
    ctx.lineTo(pTrunkTop.sx, pTrunkTop.sy);
    ctx.stroke();

    // 3. Foliage Canopy
    const [rMid, gMid, bMid] = tree.foliageRgb;
    const [rHi, gHi, bHi] = tree.foliageHighlightRgb;
    const [rSh, gSh, bSh] = tree.foliageShadowRgb;

    const cLit = `rgb(${Math.round(rHi * nightMult)}, ${Math.round(gHi * nightMult)}, ${Math.round(bHi * nightMult)})`;
    const cMid = `rgb(${Math.round(rMid * nightMult)}, ${Math.round(gMid * nightMult)}, ${Math.round(bMid * nightMult)})`;
    const cShade = `rgb(${Math.round(rSh * nightMult)}, ${Math.round(gSh * nightMult)}, ${Math.round(bSh * nightMult)})`;

    if (tree.style === 'conifer') {
      // Conifer: 3 stacked tapering conical tiers
      const tiers = 3;
      const canopyTotalH = pTrunkTop.sy - pCanopyTop.sy;

      for (let tIdx = 0; tIdx < tiers; tIdx++) {
        const frac = tIdx / tiers;
        const tierTopY = pTrunkTop.sy - canopyTotalH * (frac + 0.38);
        const tierBaseY = pTrunkTop.sy - canopyTotalH * frac;
        const tierRadius = tree.radius * scale * p * (1.1 - frac * 0.32);

        const grad = ctx.createLinearGradient(
          pTrunkTop.sx - tierRadius,
          tierBaseY,
          pTrunkTop.sx + tierRadius,
          tierTopY
        );
        grad.addColorStop(0, lx < 0 ? cLit : cShade);
        grad.addColorStop(0.5, cMid);
        grad.addColorStop(1, lx >= 0 ? cLit : cShade);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(pTrunkTop.sx - tierRadius, tierBaseY);
        ctx.lineTo(pTrunkTop.sx + tierRadius, tierBaseY);
        ctx.lineTo(pTrunkTop.sx, tierTopY);
        ctx.closePath();
        ctx.fill();
      }
    } else if (tree.style === 'mangrove') {
      // Mangrove: broad umbrella canopy with horizontal drooping layers
      const canopyCenterY = (pTrunkTop.sy + pCanopyTop.sy) * 0.5;
      const canopyRx = tree.radius * scale * p * 1.35;
      const canopyRy = (pTrunkTop.sy - pCanopyTop.sy) * 0.65;

      const grad = ctx.createRadialGradient(
        pTrunkTop.sx - canopyRx * 0.28 * lx,
        canopyCenterY - canopyRy * 0.38,
        canopyRy * 0.15,
        pTrunkTop.sx,
        canopyCenterY,
        canopyRx
      );
      grad.addColorStop(0, cLit);
      grad.addColorStop(0.55, cMid);
      grad.addColorStop(1, cShade);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(pTrunkTop.sx, canopyCenterY, canopyRx, canopyRy, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Broadleaf: 3-4 multi-lobed foliage clusters
      const canopyCenterY = (pTrunkTop.sy + pCanopyTop.sy) * 0.52;
      const crownR = tree.radius * scale * p;
      const lobes = [
        { dx: 0, dy: 0, rMult: 1.0 },
        { dx: -crownR * 0.42, dy: crownR * 0.15, rMult: 0.78 },
        { dx: crownR * 0.42, dy: crownR * 0.15, rMult: 0.78 },
        { dx: 0, dy: -crownR * 0.38, rMult: 0.82 },
      ];

      for (let lIdx = 0; lIdx < lobes.length; lIdx++) {
        const lobe = lobes[lIdx];
        const lxPos = pTrunkTop.sx + lobe.dx;
        const lyPos = canopyCenterY + lobe.dy;
        const lRadius = crownR * lobe.rMult;

        const grad = ctx.createRadialGradient(
          lxPos - lRadius * 0.25 * lx,
          lyPos - lRadius * 0.32,
          lRadius * 0.18,
          lxPos,
          lyPos,
          lRadius
        );
        grad.addColorStop(0, cLit);
        grad.addColorStop(0.55, cMid);
        grad.addColorStop(1, cShade);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lxPos, lyPos, Math.max(1, lRadius), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}
