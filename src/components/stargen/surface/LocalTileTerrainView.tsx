import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  RotateCcw,
  Compass,
  Sun,
  Layers,
  ArrowLeft,
  Cloud,
  ZoomIn,
} from 'lucide-react';
import { RealisticPlanetBody } from '../../../core/generation/realisticStarGen';
import { RealisticMoon } from '../../../types/astrophysics';
import {
  PlanetarySurfaceModel,
  resolveSolidBiomeColorHex,
} from './surfaceGenMath';
import {
  GoldbergPlanetaryTile,
  PlanetaryGoldbergGrid,
  createNeighborAwareTileEvaluator,
} from './goldbergTileGrid';

interface LocalTileTerrainViewProps {
  surfaceModel: PlanetarySurfaceModel;
  goldbergGrid: PlanetaryGoldbergGrid;
  activeTile: GoldbergPlanetaryTile;
  planet: RealisticPlanetBody;
  moon?: RealisticMoon | null;
  timeOfDayDeg: number;
  onChangeTimeOfDay: (deg: number) => void;
  onSelectTile: (tile: GoldbergPlanetaryTile) => void;
  onBackToGlobe: () => void;
}

interface LocalVertex {
  x: number; // [-1, 1] in local hex plane
  z: number; // [-1, 1] in local hex plane
  y: number; // Clamped surface elevation (0 over water)
  nx: number; // Smooth vertex normal X
  ny: number; // Smooth vertex normal Y
  nz: number; // Smooth vertex normal Z
}

interface LocalTri {
  v0: number;
  v1: number;
  v2: number;
}

interface CloudPuff3D {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  density: number; // [0..1]
  isStormAnvil: boolean;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || '#888888').replace('#', '');
  const num = parseInt(clean, 16) || 0x888888;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function hash2(x: number, y: number, seed: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}

function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  // Quintic C2 smoothstep eliminates second-derivative kinks and square lattice lines
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * (fy * (fy * 6 - 15) + 10) * fy;

  const n00 = hash2(ix, iy, seed);
  const n10 = hash2(ix + 1, iy, seed);
  const n01 = hash2(ix, iy + 1, seed);
  const n11 = hash2(ix + 1, iy + 1, seed);

  const nx0 = n00 + (n10 - n00) * ux;
  const nx1 = n01 + (n11 - n01) * ux;
  return nx0 + (nx1 - nx0) * uy;
}

// Dual-rotated isotropic 2D noise with zero axis-aligned square grid structure
function isotropicNoise2D(x: number, y: number, seed: number): number {
  const n1 = valueNoise2D(x, y, seed);
  const rx = x * 0.788 - y * 0.6156 + 13.7;
  const ry = x * 0.6156 + y * 0.788 - 9.3;
  const n2 = valueNoise2D(rx, ry, seed + 101);
  return (n1 + n2) * 0.5;
}

function fbm2D(x: number, y: number, seed: number, octaves = 5): number {
  let val = 0;
  let amp = 0.5;
  let norm = 0;
  let rx = x;
  let ry = y;
  for (let i = 0; i < octaves; i++) {
    val += amp * valueNoise2D(rx, ry, seed + i * 31);
    norm += amp;
    // Rotate domain by ~36.87 deg between octaves so grid axes never align
    const nx = (rx * 0.8 - ry * 0.6) * 2.04 + 17.3;
    const ny = (rx * 0.6 + ry * 0.8) * 2.04 - 11.7;
    rx = nx;
    ry = ny;
    amp *= 0.5;
  }
  return val / (norm || 1);
}

function ridgedFbm2D(x: number, y: number, seed: number, octaves = 5): number {
  let val = 0;
  let amp = 0.5;
  let norm = 0;
  let rx = x;
  let ry = y;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise2D(rx, ry, seed + i * 47);
    const centered = n * 2.0 - 1.0;
    const ridge = 1.0 - Math.sqrt(centered * centered + 0.0015);
    val += amp * ridge * ridge;
    norm += amp;
    const nx = (rx * 0.8 - ry * 0.6) * 2.12 + 23.1;
    const ny = (rx * 0.6 + ry * 0.8) * 2.12 - 14.9;
    rx = nx;
    ry = ny;
    amp *= 0.5;
  }
  return val / (norm || 1);
}

// Fast 2D cellular / Worley feature evaluator for tree crowns, boulders, and micro-craters
function cellularFeature2D(
  x: number,
  y: number,
  seed: number
): { dist: number; dx: number; dy: number; cellHash: number } {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let bestDistSq = 99.0;
  let bestDx = 0;
  let bestDy = 0;
  let bestHash = 0.5;

  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = ix + ox;
      const cy = iy + oy;
      const h1 = hash2(cx, cy, seed);
      const h2 = hash2(cx, cy, seed + 137);
      const px = cx + 0.18 + h1 * 0.64;
      const py = cy + 0.18 + h2 * 0.64;
      const dx = x - px;
      const dy = y - py;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestDx = dx;
        bestDy = dy;
        bestHash = h1;
      }
    }
  }
  return {
    dist: Math.sqrt(bestDistSq),
    dx: bestDx,
    dy: bestDy,
    cellHash: bestHash,
  };
}

function compassLabelFromAzimuth(azDeg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((azDeg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

// Texture bitflags
const FLAG_WATER = 1;
const FLAG_LAVA = 2;
const FLAG_ICE_SPEC = 4;

export const LocalTileTerrainView: React.FC<LocalTileTerrainViewProps> = ({
  surfaceModel,
  goldbergGrid,
  activeTile,
  planet,
  moon,
  timeOfDayDeg,
  onChangeTimeOfDay,
  onSelectTile,
  onBackToGlobe,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const zBufferRef = useRef<Float32Array | null>(null);
  const colorBufferRef = useRef<Uint32Array | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);

  const [rotYaw, setRotYaw] = useState<number>(0.62); // ~35 deg isometric angle
  const [rotPitch, setRotPitch] = useState<number>(0.54); // ~31 deg immersive biome tilt
  const [zoom, setZoom] = useState<number>(1.28); // Default zoomed-in so the tile fills the viewport like a full biome
  const verticalExag = 0.6;
  const [showGeologyPanel, setShowGeologyPanel] = useState<boolean>(false);
  const [showClouds3D, setShowClouds3D] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startYaw: number;
    startPitch: number;
  } | null>(null);

  const activeBody = moon || planet;
  const pBarAtmo = surfaceModel.isNoSurface ? 100 : (activeBody.pressureBar ?? 0);
  const hasAtmosphere = surfaceModel.isNoSurface || pBarAtmo >= 0.002;

  const neighborTiles = useMemo(() => {
    return activeTile.neighbors.map((nId, idx) => ({
      tile: goldbergGrid.tiles[nId],
      azimuthDeg: activeTile.neighborAzimuthDeg[idx] ?? idx * 60,
      compass: compassLabelFromAzimuth(activeTile.neighborAzimuthDeg[idx] ?? idx * 60),
    }));
  }, [activeTile, goldbergGrid]);

  // Build 3D Hexagonal/Pentagonal Mesh + 512x512 High-Resolution Procedural Biome Texture & Micro-Bump Normal Map
  const meshData = useMemo(() => {
    const sides = activeTile.isPentagon ? 5 : 6;
    const rings = 30; // Rings strictly inside the active Goldberg tile border (no extended terrain mesh)
    const tileSeed = (surfaceModel.seed * 1664525 + activeTile.tileId * 1013904223) & 0x7fffffff;

    // Corner angles in local (x, z) plane aligned with neighbor compass directions
    const corners: [number, number][] = [];
    for (let s = 0; s < sides; s++) {
      const ang = (s * 2 * Math.PI) / sides - Math.PI / 2;
      corners.push([Math.cos(ang), Math.sin(ang)]);
    }

    // Primary and optional Secondary (ecotone crossing) biome IDs
    const bId1 = activeTile.biomeId;
    const bId2 = activeTile.secondaryBiomeId;
    const hasSecondaryBiome = bId2 !== null && bId2 !== bId1 && !surfaceModel.isNoSurface;

    // Build neighbor-aware spatial evaluator aligned with the 6 (or 5) bordering tile edges
    const neighborEntries = neighborTiles.slice(0, sides).map((nb, s) => {
      const cA = corners[s];
      const cB = corners[(s + 1) % sides];
      return {
        tile: nb.tile,
        dirX: (cA[0] + cB[0]) * 0.5,
        dirZ: (cA[1] + cB[1]) * 0.5,
      };
    });
    const {
      evalBorderContext,
      pickPreferredFeatureSpot,
      preferredFissureStrike,
    } = createNeighborAwareTileEvaluator(
      activeTile,
      neighborEntries,
      surfaceModel.seaLevelNormalized,
      surfaceModel.isNoSurface
    );

    const isBiomeOcean = (id: number) => !surfaceModel.isNoSurface && (id <= 2 || id === 17 || id === 23);
    const isBiomeIce = (id: number) => id === 8 || id === 13 || id === 18 || id === 21;
    const anyOceanBiome = isBiomeOcean(bId1) || (bId2 !== null && isBiomeOcean(bId2));
    const isPureOceanTile = isBiomeOcean(bId1) && (bId2 === null || isBiomeOcean(bId2));
    const hasAlgalSeaBiome =
      !surfaceModel.isNoSurface &&
      surfaceModel.floraPalette.hasAnyLife &&
      (bId1 === 23 || bId2 === 23);

    // Effective crater intensity combines tile peak crater score, craterland biome ID, and thin/airless atmosphere
    const atmoCraterFloor =
      pBarAtmo < 0.02 ? 0.72 : pBarAtmo < 0.25 ? 0.48 : pBarAtmo < 0.85 ? 0.26 : 0;
    const effCraterIntensity =
      !surfaceModel.isNoSurface && !isPureOceanTile && !surfaceModel.isMoltenWorld
        ? Math.max(
            activeTile.craterIntensity,
            bId1 === 16 || bId2 === 16 ? 0.88 : 0,
            bId1 === 14 || bId2 === 14 ? 0.38 : 0,
            atmoCraterFloor
          )
        : 0;

    // Generate multi-scale 3D impact craters (hero primary basins + secondary craters)
    const craters: { cx: number; cz: number; rad: number; depth: number; hasCentralPeak: boolean }[] = [];
    if (effCraterIntensity > 0.02) {
      const heroCount = effCraterIntensity > 0.55 ? 3 : effCraterIntensity > 0.22 ? 2 : 1;
      const craterPrefersSecondary =
        hasSecondaryBiome && bId2 !== null && (bId2 === 16 || (isBiomeOcean(bId1) && !isBiomeOcean(bId2)));
      const craterBiasSector =
        hasSecondaryBiome && bId2 !== null && (isBiomeOcean(bId1) !== isBiomeOcean(bId2) || bId1 === 16 || bId2 === 16);
      for (let h = 0; h < heroCount; h++) {
        const angle = hash2(h, 11, tileSeed) * Math.PI * 2;
        const dist = (0.14 + hash2(h, 12, tileSeed) * 0.46) * (h === 0 ? 0.75 : 1.0);
        const rad =
          (h === 0 ? 0.19 : 0.13) +
          hash2(h, 13, tileSeed) * (0.09 * Math.min(1, effCraterIntensity + 0.3));
        const spot = craterBiasSector
          ? pickPreferredFeatureSpot(craterPrefersSecondary, angle, dist)
          : { x: Math.cos(angle) * dist, z: Math.sin(angle) * dist };
        craters.push({
          cx: spot.x,
          cz: spot.z,
          rad,
          depth: rad * (0.44 + hash2(h, 14, tileSeed) * 0.22),
          hasCentralPeak: rad > 0.155,
        });
      }

      const secondaryCount = Math.min(26, Math.max(4, Math.round(effCraterIntensity * 26)));
      for (let c = 0; c < secondaryCount; c++) {
        const angle = hash2(c, 1, tileSeed) * Math.PI * 2;
        const dist = Math.sqrt(hash2(c, 2, tileSeed)) * 0.88;
        const rad = 0.045 + Math.pow(hash2(c, 3, tileSeed), 1.35) * 0.145;
        craters.push({
          cx: Math.cos(angle) * dist,
          cz: Math.sin(angle) * dist,
          rad,
          depth: rad * (0.38 + hash2(c, 4, tileSeed) * 0.24),
          hasCentralPeak: rad > 0.13,
        });
      }
    }

    // Volcanic cones for volcanic / tectonic worlds (checks both primary and secondary biomes & bordering tiles)
    const volcanicCones: { vx: number; vz: number; rad: number; height: number }[] = [];
    const hasVolcanoes =
      !surfaceModel.isNoSurface &&
      (bId1 === 15 ||
        bId1 === 22 ||
        bId2 === 15 ||
        bId2 === 22 ||
        activeTile.volcanoIntensity > 0.22 ||
        surfaceModel.isMoltenWorld);
    if (hasVolcanoes) {
      const vCount = bId1 === 15 || bId2 === 15 ? 3 : 2;
      const volcIsSecondaryOnly =
        hasSecondaryBiome && bId2 !== null && (bId2 === 15 || bId2 === 22) && bId1 !== 15 && bId1 !== 22;
      const volcIsPrimaryOnly =
        hasSecondaryBiome && bId2 !== null && (bId1 === 15 || bId1 === 22) && bId2 !== 15 && bId2 !== 22;
      for (let v = 0; v < vCount; v++) {
        const vDist = v === 0 ? 0.18 : 0.35 + hash2(v, 19, tileSeed) * 0.45;
        const vAng = hash2(v, 23, tileSeed) * Math.PI * 2;
        const spot =
          volcIsSecondaryOnly || volcIsPrimaryOnly
            ? pickPreferredFeatureSpot(volcIsSecondaryOnly, vAng, vDist)
            : { x: Math.cos(vAng) * vDist, z: Math.sin(vAng) * vDist };
        volcanicCones.push({
          vx: spot.x,
          vz: spot.z,
          rad: v === 0 ? 0.34 : 0.18 + hash2(v, 29, tileSeed) * 0.12,
          height: v === 0 ? 0.38 : 0.22 + hash2(v, 31, tileSeed) * 0.12,
        });
      }
    }

    // Base biome palette and secondary biome palette for rich local color & ecotone variation
    const baseHex1 =
      activeTile.biomeColor ||
      resolveSolidBiomeColorHex(bId1, surfaceModel.floraPalette, surfaceModel.compositionPalette);
    const baseRgb1 = hexToRgb(baseHex1);
    const baseHex2 =
      bId2 !== null
        ? activeTile.secondaryBiomeColor ||
          resolveSolidBiomeColorHex(bId2, surfaceModel.floraPalette, surfaceModel.compositionPalette)
        : baseHex1;
    const baseRgb2 = hexToRgb(baseHex2);

    const highRgb = hexToRgb(surfaceModel.compositionPalette.mountainHex);
    const peakRgb = hexToRgb(surfaceModel.compositionPalette.peakHex);
    const basaltRgb = hexToRgb(surfaceModel.compositionPalette.basaltHex);
    const plateauRgb = hexToRgb(surfaceModel.compositionPalette.plateauHex);
    const alluvialRgb = hexToRgb(surfaceModel.compositionPalette.alluvialHex);
    const iceRgb = hexToRgb(surfaceModel.compositionPalette.iceHex);
    const marshRgb = hexToRgb(surfaceModel.floraPalette.marshHex);
    const plainsRgb = hexToRgb(surfaceModel.floraPalette.plainsHex);
    const forestRgb = hexToRgb(surfaceModel.floraPalette.woodlandHex);
    const taigaRgb = hexToRgb(surfaceModel.floraPalette.taigaHex);

    // Cloud field parameters for 3D clouds + ground shadows
    const effCloudCover = surfaceModel.isNoSurface
      ? 0.85
      : Math.max(activeTile.cloudCover, surfaceModel.cloudOpacity * 0.55);

    const sampleCloudDensityAt = (px: number, pz: number): number => {
      if (!hasAtmosphere || surfaceModel.cloudOpacity <= 0.015 || effCloudCover <= 0.03) return 0;
      const warpX = fbm2D(px * 2.4 + 4.1, pz * 2.4 - 1.7, tileSeed + 701, 3) * 0.35;
      const warpZ = fbm2D(px * 2.4 - 2.9, pz * 2.4 + 3.3, tileSeed + 733, 3) * 0.35;
      const n = fbm2D((px + warpX) * 2.8, (pz + warpZ) * 2.8, tileSeed + 787, 4);
      const threshold = 0.62 - effCloudCover * 0.42;
      if (n <= threshold) return 0;
      return Math.min(1, (n - threshold) / (1 - threshold));
    };

    // Evaluates the characteristic landform height profile for a single biome ID
    const evalSingleBiomeHeight = (
      bId: number,
      px: number,
      pz: number,
      wx: number,
      wz: number,
      baseFbm: number,
      ridge: number,
      fine: number,
      macroH: number
    ): number => {
      if (isBiomeOcean(bId)) {
        // Abyssal Bathymetry + Mid-Ocean Ridges & Seamounts (strictly below sea level)
        const seamount = ridge > 0.72 ? (ridge - 0.72) * 0.25 : 0;
        return Math.min(-0.028, Math.min(-0.035, macroH * 0.48) + (baseFbm - 0.52) * 0.18 + seamount + fine * 0.018);
      }

      // Non-ocean (land / glacier / desert / mountain) biome: always stays above sea level
      let h = Math.max(0.065, macroH * 0.52 + 0.065);

      if (bId === 12 || bId === 13) {
        // Rugged Alpine Mountain Range / Permanent Glaciated Peaks
        h += ridge * 0.36 + baseFbm * 0.16 - 0.06 + fine * 0.045;
      } else if (bId === 11) {
        // Tiered Canyon & Flat-Topped Mesa Plateau
        const raw = baseFbm * 1.18 + fine * 0.08;
        const steps = 5;
        const stepped = (Math.floor(raw * steps) + Math.pow((raw * steps) % 1, 3.5)) / steps;
        const gorge = Math.abs(wx * 0.85 - wz * 0.52 + Math.sin(wz * 4.5) * 0.14);
        const gorgeCarve = gorge < 0.13 ? (1.0 - Math.pow(gorge / 0.13, 2)) * 0.16 : 0;
        h += (stepped - 0.24) * 0.32 - gorgeCarve;
      } else if (bId === 10) {
        // Erg Sand Dunes + Rocky Yardang Outcrops
        const dunePhase = px * 22.0 + pz * 9.0 + Math.sin(pz * 7.5 + baseFbm * 4.0) * 2.6;
        const duneWave = Math.pow(Math.sin(dunePhase) * 0.5 + 0.5, 1.65);
        const yardang = ridge > 0.72 ? (ridge - 0.72) * 0.45 : 0;
        h += (baseFbm - 0.42) * 0.14 + duneWave * 0.065 + yardang;
      } else if (bId === 18) {
        // Cryovolcanic Nitrogen Plains / Ice Shelf
        const sastrugi = Math.sin(px * 26 + baseFbm * 5) * 0.012;
        h = 0.055 + (ridge - 0.4) * 0.065 + sastrugi;
      } else if (bId === 8 || bId === 21) {
        // Glacial Ice Sheet / Cryotectonic Chaos
        const sastrugi = Math.sin(px * 20 - pz * 12 + baseFbm * 4) * 0.015;
        h += (baseFbm - 0.42) * 0.16 + ridge * 0.09 + sastrugi;
      } else {
        // Rolling Hills, Plains, Forest, Taiga, Tundra, Regolith
        h += (baseFbm - 0.42) * 0.20 + (ridge - 0.42) * 0.10 + fine * 0.026;
      }
      return Math.max(0.032, h);
    };

    // Pure elevation evaluator for the tile
    const sampleHeightOnly = (px: number, pz: number) => {
      if (surfaceModel.isNoSurface) {
        const bandWave = Math.sin(pz * 14 + fbm2D(px * 4, pz * 4, tileSeed, 4) * 3.2);
        return {
          hLocal: bandWave * 0.045,
          craterRimTint: 0,
          craterBowlTint: 0,
          oceanWeight: 0,
          lavaWeight: 0,
          fissureWeight: 0,
          baseFbm: bandWave * 0.5 + 0.5,
          ridge: 0.5,
          biomeMix: 0,
        };
      }

      // Domain-warped coordinates for natural organic landforms
      const warpX = (fbm2D(px * 2.6, pz * 2.6, tileSeed + 19, 3) - 0.5) * 0.22;
      const warpZ = (fbm2D(px * 2.6 + 7.1, pz * 2.6 + 3.4, tileSeed + 23, 3) - 0.5) * 0.22;
      const wx = px + warpX;
      const wz = pz + warpZ;

      const baseFbm = fbm2D(wx * 3.2, wz * 3.2, tileSeed, 5);
      const ridge = ridgedFbm2D(wx * 3.8, wz * 3.8, tileSeed + 79, 4);
      const fine = fbm2D(px * 11.5, pz * 11.5, tileSeed + 151, 3) - 0.5;

      const { biomeMix, localMacroH, borderReliefBoost } = evalBorderContext(px, pz, baseFbm, ridge);
      const h1 = evalSingleBiomeHeight(bId1, px, pz, wx, wz, baseFbm, ridge, fine, localMacroH);
      let hLocal = h1;
      if (hasSecondaryBiome && bId2 !== null) {
        const h2 = evalSingleBiomeHeight(bId2, px, pz, wx, wz, baseFbm, ridge, fine, localMacroH);
        hLocal = h1 * (1 - biomeMix) + h2 * biomeMix;
      }

      // Smooth continuous ocean weight (no blocky step)
      const oceanWeightAtPoint =
        (isBiomeOcean(bId1) ? 1 - biomeMix : 0) + (bId2 !== null && isBiomeOcean(bId2) ? biomeMix : 0);
      const oceanWeight = !surfaceModel.isNoSurface && anyOceanBiome
        ? Math.max(0, Math.min(1, (oceanWeightAtPoint - 0.35) / 0.2))
        : 0;
      if (oceanWeight < 0.5) {
        hLocal = Math.max(0.025, hLocal + borderReliefBoost * (0.35 + 0.65 * ridge));
      }

      // Carve impact craters with deep concave bowls, raised ejecta rims, and central peaks on solid terrain
      let craterRimTint = 0;
      let craterBowlTint = 0;
      if (oceanWeight < 0.5) {
        for (let c = 0; c < craters.length; c++) {
          const cr = craters[c];
          const d = Math.hypot(px - cr.cx, pz - cr.cz);
          if (d < cr.rad * 1.55) {
            const u = d / cr.rad;
            if (u < 0.82) {
              const bowl = 1.0 - (u / 0.82) * (u / 0.82);
              hLocal -= cr.depth * 1.25 * bowl;
              craterBowlTint = Math.max(craterBowlTint, bowl);
              if (cr.hasCentralPeak && u < 0.28) {
                const pk = 1.0 - (u / 0.28) * (u / 0.28);
                hLocal += cr.depth * 0.58 * pk;
                craterRimTint = Math.max(craterRimTint, pk * 0.65);
              }
            } else if (u < 1.48) {
              const rimPhase = (u - 0.82) / 0.66;
              const rim = Math.sin(rimPhase * Math.PI);
              hLocal += cr.depth * 0.44 * rim;
              craterRimTint = Math.max(craterRimTint, rim);
            }
          }
        }
      }

      // Add Volcanic Cones, Summit Calderas & Braided Lava Channels with smooth continuous weights
      let lavaWeight = 0;
      if (hasVolcanoes) {
        for (let v = 0; v < volcanicCones.length; v++) {
          const vc = volcanicCones[v];
          const dv = Math.hypot(px - vc.vx, pz - vc.vz);
          if (dv < vc.rad * 1.55) {
            const uv = dv / vc.rad;
            if (uv < 0.20) {
              const pit = 1.0 - (uv / 0.20) * (uv / 0.20);
              hLocal += vc.height * 0.72 - pit * (vc.height * 0.36);
              if (uv < 0.16) {
                lavaWeight = Math.max(lavaWeight, Math.min(1, (0.16 - uv) / 0.04));
              }
            } else {
              const cone = Math.pow(Math.max(0, 1.0 - (uv - 0.20) / 1.35), 1.65);
              hLocal += vc.height * cone;
              const lavaAng = Math.atan2(pz - vc.vz, px - vc.vx);
              const flowChannel = Math.sin(lavaAng * 4 + dv * 14 + baseFbm * 5);
              if (flowChannel > 0.72 && uv < 1.15) {
                const chW = Math.min(1, (flowChannel - 0.72) / 0.12) * Math.min(1, (1.15 - uv) / 0.15);
                lavaWeight = Math.max(lavaWeight, chW);
              }
            }
          }
        }
      }

      // Apply Cryotectonic Ice Fissure or Tectonic Magma Rift Canyon aligned with bordering fractured tiles
      let fissureWeight = 0;
      if (
        activeTile.fractureIntensity > 0.12 ||
        bId1 === 21 ||
        bId1 === 15 ||
        bId2 === 21 ||
        bId2 === 15
      ) {
        const fissureCurve = Math.abs(
          px * preferredFissureStrike.cosA +
            pz * preferredFissureStrike.sinA +
            (fbm2D(px * 3.6, pz * 3.6, tileSeed + 211, 3) - 0.5) * 0.32
        );
        if (fissureCurve < 0.062) {
          const cleft = 1.0 - fissureCurve / 0.062;
          hLocal -= cleft * 0.13;
          if (fissureCurve < 0.032) {
            fissureWeight = Math.min(1, (0.032 - fissureCurve) / 0.012);
          }
        }
      }

      return {
        hLocal,
        craterRimTint,
        craterBowlTint,
        oceanWeight,
        lavaWeight,
        fissureWeight,
        baseFbm,
        ridge,
        biomeMix,
      };
    };

    // Build 3D vertices and smooth vertex normals strictly within the active tile
    const vertices: LocalVertex[] = [];
    const buildVertex = (px: number, pz: number, edgeFrac: number): LocalVertex => {
      const { hLocal, oceanWeight } = sampleHeightOnly(px, pz);
      const eps = 0.022;
      const hx = sampleHeightOnly(px + eps, pz).hLocal;
      const hz = sampleHeightOnly(px, pz + eps).hLocal;
      const hasSeaHere = oceanWeight >= 0.5 && hLocal < 0;
      const rawY = hasSeaHere ? 0 : hLocal;
      // Smoothly meet the y=0 perspective plane right at the tile perimeter so there is no cliff wall at the border
      const edgeTaper = edgeFrac > 0.85 ? Math.max(0, 1.0 - (edgeFrac - 0.85) / 0.15) : 1.0;
      const smoothTaper = edgeTaper * edgeTaper * (3 - 2 * edgeTaper);
      const finalY = rawY * smoothTaper;

      let nx = hasSeaHere ? 0 : (-(hx - hLocal) / eps) * smoothTaper;
      let ny = 1.0;
      let nz = hasSeaHere ? 0 : (-(hz - hLocal) / eps) * smoothTaper;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      return {
        x: px,
        z: pz,
        y: finalY,
        nx: nx / nLen,
        ny: ny / nLen,
        nz: nz / nLen,
      };
    };

    vertices.push(buildVertex(0, 0, 0));

    const ringOffsets: number[] = [0];
    for (let r = 1; r <= rings; r++) {
      ringOffsets.push(vertices.length);
      const edgeFrac = r / rings;
      for (let s = 0; s < sides; s++) {
        const cA = corners[s];
        const cB = corners[(s + 1) % sides];
        for (let k = 0; k < r; k++) {
          const t = k / r;
          const px = (cA[0] * (1 - t) + cB[0] * t) * edgeFrac;
          const pz = (cA[1] * (1 - t) + cB[1] * t) * edgeFrac;
          vertices.push(buildVertex(px, pz, edgeFrac));
        }
      }
    }

    const ringVertIdx = (r: number, s: number, k: number): number => {
      if (r === 0) return 0;
      const totalInRing = sides * r;
      const offset = (s * r + k + totalInRing) % totalInRing;
      return ringOffsets[r] + offset;
    };

    const triangles: LocalTri[] = [];
    for (let r = 1; r <= rings; r++) {
      for (let s = 0; s < sides; s++) {
        for (let k = 0; k < r; k++) {
          const vInner = r === 1 ? 0 : ringVertIdx(r - 1, s, k);
          const vOuterA = ringVertIdx(r, s, k);
          const vOuterB = ringVertIdx(r, s, k + 1);
          triangles.push({ v0: vInner, v1: vOuterA, v2: vOuterB });

          if (k + 1 < r) {
            const vInnerNext = ringVertIdx(r - 1, s, k + 1);
            triangles.push({ v0: vInner, v1: vOuterB, v2: vInnerNext });
          }
        }
      }
    }

    const perimeterIndices: { vIdx: number; wedgeIdx: number }[] = [];
    for (let s = 0; s < sides; s++) {
      for (let k = 0; k < rings; k++) {
        perimeterIndices.push({ vIdx: ringVertIdx(rings, s, k), wedgeIdx: s });
      }
    }

    // ============================================================================
    // GENERATE 512x512 HIGH-RESOLUTION PROCEDURAL BIOME TEXTURE & BUMP NORMAL MAP
    // ============================================================================
    const TEX_RES = 512;
    const texR = new Uint8Array(TEX_RES * TEX_RES);
    const texG = new Uint8Array(TEX_RES * TEX_RES);
    const texB = new Uint8Array(TEX_RES * TEX_RES);
    const texBumpX = new Int8Array(TEX_RES * TEX_RES);
    const texBumpZ = new Int8Array(TEX_RES * TEX_RES);
    const texFlags = new Uint8Array(TEX_RES * TEX_RES);
    const texCloudShadow = new Uint8Array(TEX_RES * TEX_RES);

    // Precompute a 129x129 macro terrain grid across [-1, +1] (1:1 unstretched tile coordinates)
    const MACRO_N = 129;
    const macroHGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroFbmGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroRidgeGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroRimGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroBowlGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroShadowGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroMixGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroOceanGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroLavaGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroFissureGrid = new Float32Array(MACRO_N * MACRO_N);

    for (let mz = 0; mz < MACRO_N; mz++) {
      const pz = (mz / (MACRO_N - 1)) * 2.0 - 1.0;
      for (let mx = 0; mx < MACRO_N; mx++) {
        const px = (mx / (MACRO_N - 1)) * 2.0 - 1.0;
        const mIdx = mz * MACRO_N + mx;
        const sh = sampleHeightOnly(px, pz);
        macroHGrid[mIdx] = sh.hLocal;
        macroFbmGrid[mIdx] = sh.baseFbm;
        macroRidgeGrid[mIdx] = sh.ridge;
        macroRimGrid[mIdx] = sh.craterRimTint;
        macroBowlGrid[mIdx] = sh.craterBowlTint;
        macroShadowGrid[mIdx] = sampleCloudDensityAt(px + 0.08, pz - 0.06);
        macroMixGrid[mIdx] = sh.biomeMix;
        macroOceanGrid[mIdx] = sh.oceanWeight;
        macroLavaGrid[mIdx] = sh.lavaWeight;
        macroFissureGrid[mIdx] = sh.fissureWeight;
      }
    }

    // Precompute vertex-centered central-difference slopes so macro normals interpolate smoothly without cell borders
    const macroDhxGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroDhzGrid = new Float32Array(MACRO_N * MACRO_N);
    const stepInv = (MACRO_N - 1) * 0.25;
    for (let mz = 0; mz < MACRO_N; mz++) {
      const mzPrev = Math.max(0, mz - 1);
      const mzNext = Math.min(MACRO_N - 1, mz + 1);
      for (let mx = 0; mx < MACRO_N; mx++) {
        const mxPrev = Math.max(0, mx - 1);
        const mxNext = Math.min(MACRO_N - 1, mx + 1);
        const mIdx = mz * MACRO_N + mx;
        macroDhxGrid[mIdx] = (macroHGrid[mz * MACRO_N + mxNext] - macroHGrid[mz * MACRO_N + mxPrev]) * stepInv;
        macroDhzGrid[mIdx] = (macroHGrid[mzNext * MACRO_N + mx] - macroHGrid[mzPrev * MACRO_N + mx]) * stepInv;
      }
    }

    const isVolcanicAny = bId1 === 15 || bId2 === 15 || surfaceModel.isMoltenWorld;

    // Evaluates the solid-surface micro-texture and bump normal for a specific biome ID
    const evalSolidBiomeTexel = (
      targetBiomeId: number,
      targetBaseRgb: [number, number, number],
      px: number,
      pz: number,
      hLocal: number,
      slope: number,
      dhx: number,
      dhz: number,
      baseFbm: number,
      ridge: number,
      fine1: number,
      fine2: number,
      grain: number,
      baseBumpX: number,
      baseBumpZ: number,
      fissureWeight: number
    ): { r: number; g: number; b: number; bumpX: number; bumpZ: number; flags: number } => {
      let r = targetBaseRgb[0];
      let g = targetBaseRgb[1];
      let b = targetBaseRgb[2];
      let bumpX = baseBumpX;
      let bumpZ = baseBumpZ;
      let flags = 0;

      const isIceB = isBiomeIce(targetBiomeId);
      const hasBioB = targetBiomeId >= 3 && targetBiomeId <= 6 && surfaceModel.floraPalette.hasAnyLife;
      const isDesertB = targetBiomeId === 10;
      const isCanyonB = targetBiomeId === 11;
      const isVolcB = targetBiomeId === 15 || targetBiomeId === 22 || surfaceModel.isMoltenWorld;
      const isCraterOrBarrenB =
        targetBiomeId === 8 ||
        targetBiomeId === 9 ||
        targetBiomeId === 12 ||
        targetBiomeId === 13 ||
        targetBiomeId === 14 ||
        targetBiomeId === 16;

      if (isIceB) {
        flags |= FLAG_ICE_SPEC;
        const isTholinIce =
          surfaceModel.seaPalette.solventKey === 'NH3-H2O' ||
          surfaceModel.seaPalette.solventKey === 'CH4-C2H6' ||
          surfaceModel.compositionPalette.compositionLabel.includes('Tholin');
        const sastrugiWave = Math.sin(px * 65 - pz * 32 + fine1 * 5.5);
        const crevassePattern = Math.abs(fine1 * 2.0 - 1.0 + (ridge - 0.5) * 0.6);
        const isCrevasse = crevassePattern < 0.14 || fissureWeight > 0.35;
        bumpX += Math.cos(px * 65 - pz * 32 + fine1 * 5.5) * 0.65;
        bumpZ -= Math.sin(px * 65 - pz * 32 + fine1 * 5.5) * 0.45;

        if (isCrevasse) {
          const depthCrev = Math.max(fissureWeight * 0.85, Math.max(0, 1.0 - crevassePattern / 0.14));
          r = Math.round(targetBaseRgb[0] * (1 - depthCrev * 0.62) + (isTholinIce ? 92 : 38) * (depthCrev * 0.62));
          g = Math.round(targetBaseRgb[1] * (1 - depthCrev * 0.48) + (isTholinIce ? 36 : 128) * (depthCrev * 0.48));
          b = Math.round(targetBaseRgb[2] * (1 - depthCrev * 0.38) + (isTholinIce ? 18 : 210) * (depthCrev * 0.38));
          bumpX *= 1.8;
        } else {
          const frostSparkle = sastrugiWave * 14 + grain * 16;
          r = Math.round(targetBaseRgb[0] * 0.72 + iceRgb[0] * 0.28 + frostSparkle * (isTholinIce ? 1.15 : 1.0));
          g = Math.round(targetBaseRgb[1] * 0.72 + iceRgb[1] * 0.28 + frostSparkle * (isTholinIce ? 0.76 : 1.0));
          b = Math.round(targetBaseRgb[2] * 0.7 + iceRgb[2] * 0.3 + frostSparkle * (isTholinIce ? 0.42 : 1.1));
        }
      } else if (hasBioB) {
        const isForestBiome = targetBiomeId === 5 || targetBiomeId === 6;
        const canopyDensity = Math.max(
          0,
          Math.min(1, baseFbm * 1.18 + (targetBiomeId === 5 ? 0.34 : targetBiomeId === 6 ? 0.22 : -0.14))
        );
        const cell = cellularFeature2D(px * 26.0, pz * 26.0, tileSeed + 809);
        const crownRadius = (isForestBiome ? 0.32 : 0.22) + canopyDensity * 0.26;
        const treeRgb = targetBiomeId === 6 ? taigaRgb : isForestBiome ? forestRgb : plainsRgb;

        if (cell.dist < crownRadius && slope < 0.52 && hLocal > 0.018 && hLocal < 0.29) {
          const uCrown = cell.dist / crownRadius;
          const crownHeightProfile = Math.sqrt(Math.max(0, 1.0 - uCrown * uCrown));
          bumpX = (cell.dx / crownRadius) * 1.45 + (fine2 - 0.5) * 0.45;
          bumpZ = (cell.dy / crownRadius) * 1.45 + grain * 0.45;

          const speciesShade =
            (cell.cellHash - 0.5) * 26 + crownHeightProfile * 18 - (1 - crownHeightProfile) * 22;
          r = Math.round(treeRgb[0] + speciesShade + fine2 * 14);
          g = Math.round(treeRgb[1] + speciesShade * 1.15 + fine2 * 18);
          b = Math.round(treeRgb[2] + speciesShade * 0.7 + fine2 * 10);
        } else {
          // Lush Grassland / Savanna meadow waves & wetland undergrowth
          const wetlandT = hLocal < 0.055 ? Math.max(0, Math.min(1, (0.055 - hLocal) / 0.055)) : 0;
          const grassWave = Math.sin(px * 48 + pz * 32 + fine1 * 6) * 10 + grain * 14;
          const meadowRgb = isForestBiome
            ? [
                Math.round(plainsRgb[0] * 0.52 + treeRgb[0] * 0.48),
                Math.round(plainsRgb[1] * 0.52 + treeRgb[1] * 0.48),
                Math.round(plainsRgb[2] * 0.52 + treeRgb[2] * 0.48),
              ]
            : targetBiomeId === 3
            ? marshRgb
            : plainsRgb;
          r = Math.round(meadowRgb[0] * (1 - wetlandT * 0.7) + marshRgb[0] * (wetlandT * 0.7) + grassWave);
          g = Math.round(
            meadowRgb[1] * (1 - wetlandT * 0.7) + marshRgb[1] * (wetlandT * 0.7) + grassWave * 1.1
          );
          b = Math.round(
            meadowRgb[2] * (1 - wetlandT * 0.7) + marshRgb[2] * (wetlandT * 0.7) + grassWave * 0.8
          );
        }
      } else if (isDesertB) {
        const ripplePhase =
          px * 115.0 + pz * 52.0 + Math.sin(pz * 14.0 + baseFbm * 5.0) * 6.5 + fine1 * 4.0;
        const rippleWave = Math.sin(ripplePhase);
        bumpX += Math.cos(ripplePhase) * 0.72;
        bumpZ += Math.sin(ripplePhase) * 0.36;

        const mineralBand = Math.sin(hLocal * 42 + baseFbm * 6.0) * 14 + rippleWave * 9 + grain * 18;
        r = Math.round(targetBaseRgb[0] + mineralBand * 1.15);
        g = Math.round(targetBaseRgb[1] + mineralBand * 0.92);
        b = Math.round(targetBaseRgb[2] + mineralBand * 0.65);
      } else if (isCanyonB) {
        const strataPhase = hLocal * 115.0 + fine1 * 2.4 + fine2 * 0.8;
        const strataBand = Math.sin(strataPhase);
        const fineLayer = Math.sin(strataPhase * 3.2) * 0.5;
        const bandContrast = strataBand * 22 + fineLayer * 11 + grain * 12;

        bumpX += dhx * strataBand * 0.85;
        bumpZ += dhz * strataBand * 0.85;

        r = Math.round(plateauRgb[0] * 0.88 + highRgb[0] * 0.12 + bandContrast * 1.2);
        g = Math.round(plateauRgb[1] * 0.88 + highRgb[1] * 0.12 + bandContrast * 0.85);
        b = Math.round(plateauRgb[2] * 0.88 + highRgb[2] * 0.12 + bandContrast * 0.55);
      } else if (isVolcB) {
        const pahoehoe = Math.sin(px * 55 + pz * 45 + fine1 * 8.0);
        const crack = Math.abs(fine1 * 2.0 - 1.0 + (fine2 - 0.5) * 0.5);
        bumpX += pahoehoe * 0.75;
        bumpZ -= pahoehoe * 0.65;

        if (crack < 0.065 && (activeTile.volcanoIntensity > 0.35 || surfaceModel.isMoltenWorld)) {
          const glow = 1.0 - crack / 0.065;
          r = Math.round(180 + 75 * glow);
          g = Math.round(55 + 110 * glow);
          b = Math.round(12 + 30 * glow);
          flags |= FLAG_LAVA;
        } else {
          const ashVar = pahoehoe * 10 + (fine2 - 0.5) * 24 + grain * 16;
          r = Math.round(basaltRgb[0] + ashVar);
          g = Math.round(basaltRgb[1] + ashVar * 0.9);
          b = Math.round(basaltRgb[2] + ashVar * 0.85);
        }
      } else if (isCraterOrBarrenB) {
        const cell = cellularFeature2D(px * 22.0, pz * 22.0, tileSeed + 937);
        let microRelief = (fine1 - 0.5) * 22 + (fine2 - 0.5) * 16 + grain * 18;

        if (cell.dist < 0.28) {
          const uCr = cell.dist / 0.28;
          if (cell.cellHash > 0.32 && effCraterIntensity > 0.04) {
            if (uCr < 0.76) {
              bumpX -= (cell.dx / 0.28) * 1.65;
              bumpZ -= (cell.dy / 0.28) * 1.65;
              microRelief -= (1 - uCr) * 24;
            } else {
              bumpX += (cell.dx / 0.28) * 1.35;
              bumpZ += (cell.dy / 0.28) * 1.35;
              microRelief += 18;
            }
          } else {
            bumpX += (cell.dx / 0.28) * 1.25;
            bumpZ += (cell.dy / 0.28) * 1.25;
            microRelief += (1 - uCr) * 16;
          }
        }

        r = Math.round(targetBaseRgb[0] + microRelief);
        g = Math.round(targetBaseRgb[1] + microRelief * 0.95);
        b = Math.round(targetBaseRgb[2] + microRelief * 0.9);
      } else {
        const texVar = (fine1 - 0.5) * 26 + (fine2 - 0.5) * 18 + grain * 16;
        r = Math.round(targetBaseRgb[0] + texVar);
        g = Math.round(targetBaseRgb[1] + texVar * 0.96);
        b = Math.round(targetBaseRgb[2] + texVar * 0.9);
      }

      return { r, g, b, bumpX, bumpZ, flags };
    };

    // Synthesize every pixel of the 512x512 procedural biome texture + bump map across [-1, +1] (1:1 tile scale)
    for (let tz = 0; tz < TEX_RES; tz++) {
      const vNorm = tz / (TEX_RES - 1);
      const pz = vNorm * 2.0 - 1.0;
      const mfz = vNorm * (MACRO_N - 1);
      const miz = Math.min(MACRO_N - 2, Math.floor(mfz));
      const fz = mfz - miz;
      // Smoothstep Hermite weight eliminates linear interpolation kinks along MACRO_N rows
      const sfz = fz * fz * (3 - 2 * fz);

      for (let tx = 0; tx < TEX_RES; tx++) {
        const uNorm = tx / (TEX_RES - 1);
        const px = uNorm * 2.0 - 1.0;
        const mfx = uNorm * (MACRO_N - 1);
        const mix = Math.min(MACRO_N - 2, Math.floor(mfx));
        const fx = mfx - mix;
        const sfx = fx * fx * (3 - 2 * fx);

        const i00 = miz * MACRO_N + mix;
        const i10 = i00 + 1;
        const i01 = i00 + MACRO_N;
        const i11 = i01 + 1;

        const w00 = (1 - sfx) * (1 - sfz);
        const w10 = sfx * (1 - sfz);
        const w01 = (1 - sfx) * sfz;
        const w11 = sfx * sfz;

        const hLocal =
          macroHGrid[i00] * w00 +
          macroHGrid[i10] * w10 +
          macroHGrid[i01] * w01 +
          macroHGrid[i11] * w11;
        const baseFbm =
          macroFbmGrid[i00] * w00 +
          macroFbmGrid[i10] * w10 +
          macroFbmGrid[i01] * w01 +
          macroFbmGrid[i11] * w11;
        const ridge =
          macroRidgeGrid[i00] * w00 +
          macroRidgeGrid[i10] * w10 +
          macroRidgeGrid[i01] * w01 +
          macroRidgeGrid[i11] * w11;
        const craterRimTint =
          macroRimGrid[i00] * w00 +
          macroRimGrid[i10] * w10 +
          macroRimGrid[i01] * w01 +
          macroRimGrid[i11] * w11;
        const craterBowlTint =
          macroBowlGrid[i00] * w00 +
          macroBowlGrid[i10] * w10 +
          macroBowlGrid[i01] * w01 +
          macroBowlGrid[i11] * w11;
        const cShadow =
          macroShadowGrid[i00] * w00 +
          macroShadowGrid[i10] * w10 +
          macroShadowGrid[i01] * w01 +
          macroShadowGrid[i11] * w11;
        const biomeMix =
          macroMixGrid[i00] * w00 +
          macroMixGrid[i10] * w10 +
          macroMixGrid[i01] * w01 +
          macroMixGrid[i11] * w11;

        // Smoothly interpolated central-difference macro slope (zero square cell boundaries)
        const dhx =
          macroDhxGrid[i00] * w00 +
          macroDhxGrid[i10] * w10 +
          macroDhxGrid[i01] * w01 +
          macroDhxGrid[i11] * w11;
        const dhz =
          macroDhzGrid[i00] * w00 +
          macroDhzGrid[i10] * w10 +
          macroDhzGrid[i01] * w01 +
          macroDhzGrid[i11] * w11;
        const slope = Math.hypot(dhx, dhz);

        // Smoothly interpolated feature weights instead of coarse bitwise cell masks
        const oceanWeight =
          macroOceanGrid[i00] * w00 +
          macroOceanGrid[i10] * w10 +
          macroOceanGrid[i01] * w01 +
          macroOceanGrid[i11] * w11;
        const lavaWeight =
          macroLavaGrid[i00] * w00 +
          macroLavaGrid[i10] * w10 +
          macroLavaGrid[i01] * w01 +
          macroLavaGrid[i11] * w11;
        const fissureWeight =
          macroFissureGrid[i00] * w00 +
          macroFissureGrid[i10] * w10 +
          macroFissureGrid[i01] * w01 +
          macroFissureGrid[i11] * w11;
        const isOceanPoint = oceanWeight >= 0.48;

        // Isotropic dual-rotated continuous micro-texture noises at pixel resolution
        const fine1 = isotropicNoise2D(px * 28.0, pz * 28.0, tileSeed + 313);
        const fine2 = isotropicNoise2D(px * 64.0, pz * 64.0, tileSeed + 419);
        const fine3 = isotropicNoise2D(px * 148.0, pz * 148.0, tileSeed + 521);
        const grain = (fine3 - 0.5) * 0.65 + (fine2 - 0.5) * 0.35;

        // Micro-normal gradient evaluated at the exact same frequency (28.0) as fine1 so no square grid embosses
        const fineRight = isotropicNoise2D((px + 0.005) * 28.0, pz * 28.0, tileSeed + 313);
        const fineDown = isotropicNoise2D(px * 28.0, (pz + 0.005) * 28.0, tileSeed + 313);
        let bumpX = -dhx * 1.35 + (fine1 - fineRight) * 2.1;
        let bumpZ = -dhz * 1.35 + (fine1 - fineDown) * 2.1;

        let r = baseRgb1[0];
        let g = baseRgb1[1];
        let b = baseRgb1[2];
        let flags = 0;

        if (surfaceModel.isNoSurface) {
          const pal = surfaceModel.atmospherePalette;
          const swirl = Math.sin(pz * 18 + fine1 * 3.5 + fine2 * 1.2) * 0.5 + 0.5;
          r = Math.round(pal.bandDarkRgb[0] + (pal.bandLightRgb[0] - pal.bandDarkRgb[0]) * swirl);
          g = Math.round(pal.bandDarkRgb[1] + (pal.bandLightRgb[1] - pal.bandDarkRgb[1]) * swirl);
          b = Math.round(pal.bandDarkRgb[2] + (pal.bandLightRgb[2] - pal.bandDarkRgb[2]) * swirl);
        } else {
          const hasSeaHere = isOceanPoint && hLocal < 0;
          const waterDepth = hasSeaHere ? Math.max(0, -hLocal) : 0;

          if (lavaWeight > 0.35 || (fissureWeight > 0.45 && isVolcanicAny)) {
            // Incandescent magma channel with dark cooling crust plates & white-hot core veins
            const crustCrack = isotropicNoise2D(px * 45, pz * 45, tileSeed + 601);
            if (crustCrack > 0.32) {
              const hot = Math.min(1, (crustCrack - 0.32) / 0.55);
              r = 255;
              g = Math.round(115 + 125 * hot);
              b = Math.round(15 + 95 * hot * hot);
              flags |= FLAG_LAVA;
            } else {
              // Dark cooling vesicular basalt crust floating on lava
              r = Math.round(basaltRgb[0] * 0.55 + 45);
              g = Math.round(basaltRgb[1] * 0.45 + 15);
              b = Math.round(basaltRgb[2] * 0.45 + 10);
            }
          } else if (hasSeaHere) {
            flags |= FLAG_WATER;
            const pal = surfaceModel.seaPalette;
            const depthT = Math.min(1, waterDepth / 0.25);

            if (surfaceModel.isMoltenWorld || pal.solventKey === 'Silicate Magma') {
              const lavaWave = Math.sin(px * 52 + pz * 38 + fine1 * 5) * 0.5 + 0.5;
              r = Math.round(255 - depthT * 40);
              g = Math.round(145 + lavaWave * 55 - depthT * 70);
              b = Math.round(18 + lavaWave * 28);
              flags |= FLAG_LAVA;
            } else {
              // 3D Ocean / River Capillary Wave Normal Map for realistic water glints
              const wPhase1 = px * 78.0 + pz * 44.0 + fine1 * 4.2;
              const wPhase2 = px * 48.0 - pz * 82.0 + fine2 * 3.6;
              bumpX = Math.cos(wPhase1) * 0.55 + Math.cos(wPhase2) * 0.38;
              bumpZ = Math.sin(wPhase1) * 0.55 - Math.sin(wPhase2) * 0.38;

              const sh = pal.shallowRgb;
              const dp = pal.deepRgb;
              const tr = pal.trenchRgb;
              if (depthT < 0.45) {
                const u = depthT / 0.45;
                r = Math.round(sh[0] + (dp[0] - sh[0]) * u);
                g = Math.round(sh[1] + (dp[1] - sh[1]) * u);
                b = Math.round(sh[2] + (dp[2] - sh[2]) * u);
              } else {
                const u = (depthT - 0.45) / 0.55;
                r = Math.round(dp[0] + (tr[0] - dp[0]) * u);
                g = Math.round(dp[1] + (tr[1] - dp[1]) * u);
                b = Math.round(dp[2] + (tr[2] - dp[2]) * u);
              }

              // Lush swirling Algal Sea blooms & kelp reef filaments on life-bearing marine tiles
              if (hasAlgalSeaBiome || (surfaceModel.floraPalette.hasAnyLife && depthT < 0.52)) {
                const bloomSwirl = Math.sin(px * 24.0 + pz * 19.0 + baseFbm * 7.5 + fine1 * 3.2) * 0.5 + 0.5;
                const kelpFronds = Math.max(0, fine2 * 0.7 + bloomSwirl * 0.5 - 0.36);
                const algalStrength =
                  (hasAlgalSeaBiome ? 0.68 : 0.32) *
                  Math.max(0.15, 1.0 - depthT * 0.85) *
                  Math.min(1.0, kelpFronds * 1.55);
                const algR = plainsRgb[0] * 0.65 + forestRgb[0] * 0.35;
                const algG = plainsRgb[1] * 0.68 + forestRgb[1] * 0.32;
                const algB = plainsRgb[2] * 0.55 + sh[2] * 0.45;
                r = Math.round(r * (1 - algalStrength) + algR * algalStrength);
                g = Math.round(g * (1 - algalStrength) + algG * algalStrength);
                b = Math.round(b * (1 - algalStrength) + algB * algalStrength);
              }

              // Shallow subsurface reef/shoal caustics & lacy shoreline breaking surf foam
              if (waterDepth < 0.045) {
                const shoalT = (1.0 - waterDepth / 0.045) * 0.48;
                const caustic = Math.pow(Math.sin(wPhase1 * 0.8 + wPhase2 * 0.8) * 0.5 + 0.5, 2);
                r = Math.round(r * (1 - shoalT) + (alluvialRgb[0] + caustic * 38) * shoalT);
                g = Math.round(g * (1 - shoalT) + (alluvialRgb[1] + caustic * 42) * shoalT);
                b = Math.round(b * (1 - shoalT) + (alluvialRgb[2] + caustic * 35) * shoalT);
              }
              if (waterDepth < 0.018) {
                const surfLine = Math.sin(waterDepth * 650 + fine1 * 5.0) * 0.5 + 0.5;
                const isExoticSolvent = pal.solventKey === 'NH3-H2O' || pal.solventKey === 'CH4-C2H6';
                const foam = (1.0 - waterDepth / 0.018) * (0.35 + 0.55 * surfLine) * (isExoticSolvent ? 0.55 : 1.0);
                const foamR = isExoticSolvent ? Math.round(sh[0] * 0.55 + alluvialRgb[0] * 0.45 + 32) : 242;
                const foamG = isExoticSolvent ? Math.round(sh[1] * 0.55 + alluvialRgb[1] * 0.45 + 24) : 248;
                const foamB = isExoticSolvent ? Math.round(sh[2] * 0.55 + alluvialRgb[2] * 0.45 + 18) : 255;
                r = Math.min(255, Math.round(r + (foamR - r) * foam));
                g = Math.min(255, Math.round(g + (foamG - g) * foam));
                b = Math.min(255, Math.round(b + (foamB - b) * foam));
              }
            }
          } else {
            // ====================================================================
            // SOLID BIOME HIGH-RESOLUTION PROCEDURAL SURFACE TEXTURES & BUMP MAPS
            // (Supports mixing primary + secondary biome features across ecotones)
            // ====================================================================
            const s1 = evalSolidBiomeTexel(
              bId1,
              baseRgb1,
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
              grain,
              bumpX,
              bumpZ,
              fissureWeight
            );

            if (hasSecondaryBiome && bId2 !== null && biomeMix > 0.03) {
              const s2 = evalSolidBiomeTexel(
                bId2,
                baseRgb2,
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
                grain,
                bumpX,
                bumpZ,
                fissureWeight
              );
              // Perturb mix with fine micro-patch noise so individual rocks, trees, and dunes interleave naturally
              const microMix = Math.max(0, Math.min(1, biomeMix + (fine1 - 0.5) * 0.28));
              r = Math.round(s1.r * (1 - microMix) + s2.r * microMix);
              g = Math.round(s1.g * (1 - microMix) + s2.g * microMix);
              b = Math.round(s1.b * (1 - microMix) + s2.b * microMix);
              bumpX = s1.bumpX * (1 - microMix) + s2.bumpX * microMix;
              bumpZ = s1.bumpZ * (1 - microMix) + s2.bumpZ * microMix;
              flags = microMix > 0.5 ? s2.flags : s1.flags;
            } else {
              r = s1.r;
              g = s1.g;
              b = s1.b;
              bumpX = s1.bumpX;
              bumpZ = s1.bumpZ;
              flags = s1.flags;
            }

            // High-altitude alpine snow / frost cap with irregular wind-scoured snowline
            const snowThreshold = 0.26 + (fine1 - 0.5) * 0.06 + slope * 0.04;
            if (hLocal > snowThreshold) {
              const pkT = Math.min(1, (hLocal - snowThreshold) / 0.14);
              const targetPeak = activeTile.temperatureK < 308 && pBarAtmo >= 0.008 ? iceRgb : peakRgb;
              const snowGrain = grain * 14;
              r = Math.round(r * (1 - pkT) + (targetPeak[0] + snowGrain) * pkT);
              g = Math.round(g * (1 - pkT) + (targetPeak[1] + snowGrain) * pkT);
              b = Math.round(b * (1 - pkT) + (targetPeak[2] + snowGrain) * pkT);
              if (activeTile.temperatureK < 308) flags |= FLAG_ICE_SPEC;
            } else if (hLocal < 0.034 && isOceanPoint && surfaceModel.hasLiquid && !activeTile.isIce) {
              // Coastal littoral pebble/sand beach bank along water edge
              const cT = Math.max(0, Math.min(1, (0.034 - hLocal) / 0.034)) * 0.72;
              const sandGrain = grain * 18 + (fine2 - 0.5) * 14;
              r = Math.round(r * (1 - cT) + (alluvialRgb[0] + sandGrain) * cT);
              g = Math.round(g * (1 - cT) + (alluvialRgb[1] + sandGrain * 0.95) * cT);
              b = Math.round(b * (1 - cT) + (alluvialRgb[2] + sandGrain * 0.85) * cT);
            }

            // Impact crater bowl darkening (impact melt & terraced wall strata)
            if (craterBowlTint > 0.03) {
              const bowlShade = Math.min(0.68, craterBowlTint * (0.48 + (1 - fine1) * 0.22));
              const meltR = Math.round(basaltRgb[0] * 0.62 + r * 0.2);
              const meltG = Math.round(basaltRgb[1] * 0.62 + g * 0.2);
              const meltB = Math.round(basaltRgb[2] * 0.62 + b * 0.2);
              r = Math.round(r * (1 - bowlShade) + meltR * bowlShade);
              g = Math.round(g * (1 - bowlShade) + meltG * bowlShade);
              b = Math.round(b * (1 - bowlShade) + meltB * bowlShade);
            }

            // Bright crater rim & radial ejecta blanket rays (rocky breccia + icy ejecta)
            if (craterRimTint > 0.03) {
              const iceBoost = surfaceModel.compositionPalette.iceEjectaBoost;
              const rayPattern = 0.55 + 0.45 * Math.sin(px * 34.0 + pz * 34.0 + fine1 * 5.2);
              if (iceBoost > 0) {
                const ej = Math.min(0.85, craterRimTint * (0.38 + iceBoost * 0.45) * rayPattern);
                r = Math.min(255, Math.round(r + (238 - r) * ej));
                g = Math.min(255, Math.round(g + (246 - g) * ej));
                b = Math.min(255, Math.round(b + (255 - b) * ej));
              } else {
                const ej = Math.min(0.75, craterRimTint * 0.58 * rayPattern);
                const ejR = Math.min(255, Math.round(peakRgb[0] * 0.65 + highRgb[0] * 0.35 + 34));
                const ejG = Math.min(255, Math.round(peakRgb[1] * 0.65 + highRgb[1] * 0.35 + 32));
                const ejB = Math.min(255, Math.round(peakRgb[2] * 0.65 + highRgb[2] * 0.35 + 28));
                r = Math.min(255, Math.round(r + (ejR - r) * ej));
                g = Math.min(255, Math.round(g + (ejG - g) * ej));
                b = Math.min(255, Math.round(b + (ejB - b) * ej));
              }
            }
          }
        }

        // Smoothly taper perpendicular bump slopes right at the [-1, +1] tile edges so mirrored infinite plane has zero seam lines
        const edgeX = Math.abs(px) > 0.88 ? Math.max(0, 1.0 - (Math.abs(px) - 0.88) / 0.12) : 1.0;
        const edgeZ = Math.abs(pz) > 0.88 ? Math.max(0, 1.0 - (Math.abs(pz) - 0.88) / 0.12) : 1.0;
        bumpX *= edgeX * edgeX * (3 - 2 * edgeX);
        bumpZ *= edgeZ * edgeZ * (3 - 2 * edgeZ);

        const tIdx = tz * TEX_RES + tx;
        texR[tIdx] = Math.max(0, Math.min(255, r));
        texG[tIdx] = Math.max(0, Math.min(255, g));
        texB[tIdx] = Math.max(0, Math.min(255, b));
        texBumpX[tIdx] = Math.max(-127, Math.min(127, Math.round(bumpX * 64)));
        texBumpZ[tIdx] = Math.max(-127, Math.min(127, Math.round(bumpZ * 64)));
        texFlags[tIdx] = flags;
        texCloudShadow[tIdx] = Math.max(0, Math.min(255, Math.round(cShadow * 255)));
      }
    }

    // Build 3D Volumetric Cloud Canopy Puffs floating above the tile
    const cloudPuffs: CloudPuff3D[] = [];
    if (!surfaceModel.isNoSurface && surfaceModel.cloudOpacity > 0.015 && effCloudCover > 0.04) {
      const gridN = 13;
      for (let gx = -gridN; gx <= gridN; gx++) {
        for (let gz = -gridN; gz <= gridN; gz++) {
          const jx = (hash2(gx + 50, gz + 50, tileSeed + 901) - 0.5) * 0.09;
          const jz = (hash2(gx + 80, gz + 80, tileSeed + 947) - 0.5) * 0.09;
          const cx = (gx / gridN) * 0.95 + jx;
          const cz = (gz / gridN) * 0.95 + jz;
          if (Math.hypot(cx, cz) > 1.0) continue;

          const dens = sampleCloudDensityAt(cx, cz);
          if (dens > 0.14) {
            const isStormAnvil = dens > 0.68 && activeTile.cloudCover > 0.55;
            const baseAlt = 0.34 + (hash2(gx, gz, tileSeed + 991) - 0.5) * 0.04 + (isStormAnvil ? 0.04 : 0);
            cloudPuffs.push({
              x: cx,
              y: baseAlt,
              z: cz,
              rx: 0.078 + dens * 0.068,
              ry: 0.024 + dens * (isStormAnvil ? 0.042 : 0.026),
              density: Math.min(1, dens * (0.55 + surfaceModel.cloudOpacity * 0.65)),
              isStormAnvil,
            });
          }
        }
      }
    }

    return {
      sides,
      corners,
      vertices,
      triangles,
      perimeterIndices,
      cloudPuffs,
      effCloudCover,
      TEX_RES,
      texR,
      texG,
      texB,
      texBumpX,
      texBumpZ,
      texFlags,
      texCloudShadow,
      tileSeed,
    };
  }, [surfaceModel, activeTile, neighborTiles, pBarAtmo, hasAtmosphere]);

  // Render the Per-Pixel Textured & Bump-Mapped 3D Hexagonal Biome Block + Infinite Perspective Plane to Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 720;
    const H = 440;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }

    // 1. Atmospheric Sky Backdrop & Horizon Scattering Dome
    const radTOD = (timeOfDayDeg * Math.PI) / 180;
    const sunAlt = Math.sin(radTOD);
    const isNight = sunAlt < -0.05;
    const isSunset = Math.abs(sunAlt) < 0.25;

    const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    if (!hasAtmosphere) {
      skyGrad.addColorStop(0, '#03050a');
      skyGrad.addColorStop(0.65, '#070b14');
      skyGrad.addColorStop(1, '#090e1a');
    } else if (isNight) {
      skyGrad.addColorStop(0, '#040711');
      skyGrad.addColorStop(0.6, '#0b1326');
      skyGrad.addColorStop(1, '#080d18');
    } else if (isSunset) {
      skyGrad.addColorStop(0, '#161936');
      skyGrad.addColorStop(0.45, '#4b283a');
      skyGrad.addColorStop(0.78, '#b45b32');
      skyGrad.addColorStop(1, '#141824');
    } else {
      skyGrad.addColorStop(0, surfaceModel.skyColorHex);
      skyGrad.addColorStop(0.58, surfaceModel.skyHorizonHex);
      skyGrad.addColorStop(1, '#0c1322');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Stars in vacuum or night sky
    if (!hasAtmosphere || isNight || pBarAtmo < 0.08) {
      ctx.fillStyle = '#ffffff';
      const starCount = isNight || !hasAtmosphere ? 140 : 55;
      for (let i = 0; i < starCount; i++) {
        const sx = ((i * 137.5 + rotYaw * 120) % W + W) % W;
        const sy = (i * 89.3) % (H * 0.62);
        const sSize = i % 3 === 0 ? 1.4 : 0.8;
        ctx.globalAlpha = 0.25 + ((i * 19) % 65) / 100;
        ctx.fillRect(sx, sy, sSize, sSize);
      }
      ctx.globalAlpha = 1.0;
    }

    // Host Star & Atmospheric Scattering Halo in the upper sky
    if (!isNight) {
      const sunX = W * 0.5 + Math.cos(radTOD) * (W * 0.34);
      const sunY = H * 0.22 - sunAlt * (H * 0.14);
      const starRad = Math.max(5, surfaceModel.starAngularDiameterDeg * 14);
      const glare = ctx.createRadialGradient(sunX, sunY, starRad * 0.4, sunX, sunY, starRad * 5.5);
      glare.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
      glare.addColorStop(0.25, surfaceModel.starColorHex);
      glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glare;
      ctx.beginPath();
      ctx.arc(sunX, sunY, starRad * 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Camera & Light setup
    const cosY = Math.cos(rotYaw);
    const sinY = Math.sin(rotYaw);
    const cosP = Math.cos(rotPitch);
    const sinP = Math.sin(rotPitch);

    const scale = 250 * zoom;
    const cx = W * 0.5;
    const cy = H * 0.57;
    const camDist = 3.5;

    const project3D = (x: number, yElev: number, z: number) => {
      const y = yElev * verticalExag;
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;
      const y2 = y * cosP - z1 * sinP;
      const zCam = y * sinP + z1 * cosP;
      const camDepth = camDist - zCam;
      const persp = camDist / Math.max(1.15, camDepth);
      return {
        sx: cx + x1 * scale * persp,
        sy: cy - y2 * scale * persp,
        persp,
        depth: camDepth,
      };
    };

    // Light direction in local world space based on timeOfDayDeg
    const lxRaw = Math.cos(radTOD) * 0.82;
    const lyRaw = Math.max(0.18, Math.sin(radTOD) * 0.85 + 0.25);
    const lzRaw = 0.42;
    const lLen = Math.hypot(lxRaw, lyRaw, lzRaw) || 1;
    const lx = lxRaw / lLen;
    const ly = lyRaw / lLen;
    const lz = lzRaw / lLen;

    // Halfway vector for specular water/ice reflections (camera view dir in world space + light dir)
    const vxWorld = -sinY * cosP;
    const vyWorld = sinP;
    const vzWorld = cosY * cosP;
    const hxRaw = lx + vxWorld;
    const hyRaw = ly + vyWorld;
    const hzRaw = lz + vzWorld;
    const hLen = Math.hypot(hxRaw, hyRaw, hzRaw) || 1;
    const halfX = hxRaw / hLen;
    const halfY = hyRaw / hLen;
    const halfZ = hzRaw / hLen;

    const {
      vertices,
      triangles,
      perimeterIndices,
      corners,
      sides,
      cloudPuffs,
      TEX_RES,
      texR,
      texG,
      texB,
      texBumpX,
      texBumpZ,
      texFlags,
      texCloudShadow,
    } = meshData;

    const hazeRgb = isSunset
      ? [212, 118, 68]
      : isNight
      ? [14, 24, 44]
      : hexToRgb(surfaceModel.skyHorizonHex);
    const atmoDensityFactor = hasAtmosphere
      ? Math.min(0.52, 0.10 + surfaceModel.cloudOpacity * 0.36 + Math.min(0.15, pBarAtmo * 0.03))
      : 0;

    // Draw soft atmospheric scattering dome behind/around the 3D terrain block
    if (hasAtmosphere) {
      const centerProj = project3D(0, 0.08, 0);
      const domeRadius = scale * 1.38;
      const domeGrad = ctx.createRadialGradient(
        centerProj.sx,
        centerProj.sy - scale * 0.12,
        domeRadius * 0.15,
        centerProj.sx,
        centerProj.sy - scale * 0.12,
        domeRadius
      );
      const domeAlpha = Math.min(0.42, 0.12 + surfaceModel.cloudOpacity * 0.28);
      domeGrad.addColorStop(0, `rgba(${hazeRgb[0]}, ${hazeRgb[1]}, ${hazeRgb[2]}, ${domeAlpha.toFixed(2)})`);
      domeGrad.addColorStop(1, `rgba(${hazeRgb[0]}, ${hazeRgb[1]}, ${hazeRgb[2]}, 0)`);
      ctx.fillStyle = domeGrad;
      ctx.beginPath();
      ctx.arc(centerProj.sx, centerProj.sy - scale * 0.12, domeRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // ============================================================================
    // 3. PER-PIXEL TEXTURED & BUMP-MAPPED Z-BUFFER RASTERIZER + PERSPECTIVE PLANE
    // ============================================================================
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    const offCanvas = offscreenCanvasRef.current;
    if (offCanvas.width !== W || offCanvas.height !== H) {
      offCanvas.width = W;
      offCanvas.height = H;
      zBufferRef.current = new Float32Array(W * H);
      imageDataRef.current = new ImageData(W, H);
      colorBufferRef.current = new Uint32Array(imageDataRef.current.data.buffer);
    }

    const zBuffer = zBufferRef.current!;
    const colorBuffer = colorBufferRef.current!;
    const imgData = imageDataRef.current!;
    zBuffer.fill(1e9);
    colorBuffer.fill(0);

    const projVerts = vertices.map((v) => project3D(v.x, v.y, v.z));
    const nightDim = isNight ? 0.36 : 1.0;
    const cloudShadowStrength = showClouds3D ? Math.min(0.42, surfaceModel.cloudOpacity * 0.48) : 0;
    const texMax = TEX_RES - 1;
    const isTholinWorldSpec =
      surfaceModel.seaPalette.solventKey === 'NH3-H2O' ||
      surfaceModel.seaPalette.solventKey === 'CH4-C2H6' ||
      surfaceModel.compositionPalette.compositionLabel.includes('Tholin');

    // Step 3A: Rasterize 3D terrain triangles strictly inside the active Goldberg tile
    for (let i = 0; i < triangles.length; i++) {
      const tri = triangles[i];
      const v0 = vertices[tri.v0];
      const v1 = vertices[tri.v1];
      const v2 = vertices[tri.v2];

      const p0 = projVerts[tri.v0];
      const p1 = projVerts[tri.v1];
      const p2 = projVerts[tri.v2];

      const x0 = p0.sx;
      const y0 = p0.sy;
      const x1 = p1.sx;
      const y1 = p1.sy;
      const x2 = p2.sx;
      const y2 = p2.sy;

      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (minX > maxX || minY > maxY) continue;

      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      // Strictly cull back-facing / underside triangles so underground faces are never rendered
      if (area <= 0.05) continue;
      const invArea = 1.0 / area;

      // Convert vertex coordinates [-1, +1] into texture coordinates [0, TEX_RES - 1]
      const u0 = (v0.x * 0.5 + 0.5) * texMax;
      const tv0 = (v0.z * 0.5 + 0.5) * texMax;
      const u1 = (v1.x * 0.5 + 0.5) * texMax;
      const tv1 = (v1.z * 0.5 + 0.5) * texMax;
      const u2 = (v2.x * 0.5 + 0.5) * texMax;
      const tv2 = (v2.z * 0.5 + 0.5) * texMax;

      const d0 = p0.depth;
      const d1 = p1.depth;
      const d2 = p2.depth;

      // Step increments per screen X pixel
      const dw1dx = (y2 - y0) * invArea;
      const dw2dx = (y0 - y1) * invArea;

      for (let py = minY; py <= maxY; py++) {
        const sy = py + 0.5;
        const dx0 = minX + 0.5 - x0;
        const dy0 = sy - y0;

        let w1 = (dx0 * (y2 - y0) - (x2 - x0) * dy0) * invArea;
        let w2 = ((x1 - x0) * dy0 - dx0 * (y1 - y0)) * invArea;
        const rowOffset = py * W;

        for (let px = minX; px <= maxX; px++) {
          const w0 = 1.0 - w1 - w2;
          if (w0 >= -0.002 && w1 >= -0.002 && w2 >= -0.002) {
            const depth = w0 * d0 + w1 * d1 + w2 * d2;
            const pIdx = rowOffset + px;

            if (depth < zBuffer[pIdx]) {
              zBuffer[pIdx] = depth;

              // Interpolate texture coordinates (u, v) and sample with Hermite smoothstep filtering
              const tu = Math.max(0, Math.min(texMax - 0.001, w0 * u0 + w1 * u1 + w2 * u2));
              const tv = Math.max(0, Math.min(texMax - 0.001, w0 * tv0 + w1 * tv1 + w2 * tv2));
              const iu = tu | 0;
              const iv = tv | 0;
              const fu = tu - iu;
              const fv = tv - iv;
              const sfu = fu * fu * (3 - 2 * fu);
              const sfv = fv * fv * (3 - 2 * fv);

              const ti00 = iv * TEX_RES + iu;
              const ti10 = ti00 + 1;
              const ti01 = ti00 + TEX_RES;
              const ti11 = ti01 + 1;

              const tw00 = (1 - sfu) * (1 - sfv);
              const tw10 = sfu * (1 - sfv);
              const tw01 = (1 - sfu) * sfv;
              const tw11 = sfu * sfv;

              let r = texR[ti00] * tw00 + texR[ti10] * tw10 + texR[ti01] * tw01 + texR[ti11] * tw11;
              let g = texG[ti00] * tw00 + texG[ti10] * tw10 + texG[ti01] * tw01 + texG[ti11] * tw11;
              let b = texB[ti00] * tw00 + texB[ti10] * tw10 + texB[ti01] * tw01 + texB[ti11] * tw11;

              const bx =
                (texBumpX[ti00] * tw00 + texBumpX[ti10] * tw10 + texBumpX[ti01] * tw01 + texBumpX[ti11] * tw11) *
                (1 / 64);
              const bz =
                (texBumpZ[ti00] * tw00 + texBumpZ[ti10] * tw10 + texBumpZ[ti01] * tw01 + texBumpZ[ti11] * tw11) *
                (1 / 64);

              const f00 = texFlags[ti00];
              const f10 = texFlags[ti10];
              const f01 = texFlags[ti01];
              const f11 = texFlags[ti11];
              const lavaW =
                ((f00 & FLAG_LAVA) ? tw00 : 0) +
                ((f10 & FLAG_LAVA) ? tw10 : 0) +
                ((f01 & FLAG_LAVA) ? tw01 : 0) +
                ((f11 & FLAG_LAVA) ? tw11 : 0);

              if (lavaW < 0.99) {
                const rawR = r;
                const rawG = g;
                const rawB = b;

                // Combine Gouraud-interpolated macro terrain normal with per-pixel texture bump normal
                const mnx = (w0 * v0.nx + w1 * v1.nx + w2 * v2.nx) * verticalExag + bx * 0.42;
                const mny = w0 * v0.ny + w1 * v1.ny + w2 * v2.ny;
                const mnz = (w0 * v0.nz + w1 * v1.nz + w2 * v2.nz) * verticalExag + bz * 0.42;
                const invN = 1.0 / (Math.hypot(mnx, mny, mnz) || 1);
                const nx = mnx * invN;
                const ny = mny * invN;
                const nz = mnz * invN;

                const ndotl = Math.max(0, nx * lx + ny * ly + nz * lz);
                const cShad =
                  (texCloudShadow[ti00] * tw00 +
                    texCloudShadow[ti10] * tw10 +
                    texCloudShadow[ti01] * tw01 +
                    texCloudShadow[ti11] * tw11) *
                  (1 / 255) *
                  cloudShadowStrength;
                const shadowAtten = 1.0 - cShad;
                const diff = (0.30 + 0.78 * ndotl * shadowAtten) * nightDim;

                r *= diff;
                g *= diff;
                b *= diff;

                // Smoothly interpolated specular highlights on water wave facets & crystalline glacial ice facets
                if (!isNight) {
                  const waterW =
                    ((f00 & FLAG_WATER) ? tw00 : 0) +
                    ((f10 & FLAG_WATER) ? tw10 : 0) +
                    ((f01 & FLAG_WATER) ? tw01 : 0) +
                    ((f11 & FLAG_WATER) ? tw11 : 0);
                  const iceW =
                    ((f00 & FLAG_ICE_SPEC) ? tw00 : 0) +
                    ((f10 & FLAG_ICE_SPEC) ? tw10 : 0) +
                    ((f01 & FLAG_ICE_SPEC) ? tw01 : 0) +
                    ((f11 & FLAG_ICE_SPEC) ? tw11 : 0);
                  if (waterW + iceW > 0.01) {
                    const ndoth = Math.max(0, nx * halfX + ny * halfY + nz * halfZ);
                    const isTholinSpec = waterW < 0.5 && isTholinWorldSpec;
                    const specPow =
                      waterW * (Math.pow(ndoth, 24) * 0.58) +
                      iceW * (Math.pow(ndoth, 16) * (isTholinSpec ? 0.18 : 0.30));
                    const spec = specPow * shadowAtten;
                    r += (isTholinSpec ? 245 : 230) * spec;
                    g += (isTholinSpec ? 185 : 244) * spec;
                    b += (isTholinSpec ? 120 : 255) * spec;
                  }
                }

                // Distance-based atmospheric aerial perspective haze
                if (atmoDensityFactor > 0) {
                  const distNorm = Math.max(0, Math.min(1, (depth - 2.9) / 1.75));
                  const fog = distNorm * atmoDensityFactor;
                  r = r * (1 - fog) + hazeRgb[0] * fog;
                  g = g * (1 - fog) + hazeRgb[1] * fog;
                  b = b * (1 - fog) + hazeRgb[2] * fog;
                }

                if (lavaW > 0.01) {
                  r = r * (1 - lavaW) + rawR * lavaW;
                  g = g * (1 - lavaW) + rawG * lavaW;
                  b = b * (1 - lavaW) + rawB * lavaW;
                }
              }

              const ir = r < 0 ? 0 : r > 255 ? 255 : r | 0;
              const ig = g < 0 ? 0 : g > 255 ? 255 : g | 0;
              const ib = b < 0 ? 0 : b > 255 ? 255 : b | 0;
              colorBuffer[pIdx] = (255 << 24) | (ib << 16) | (ig << 8) | ir;
            }
          }
          w1 += dw1dx;
          w2 += dw2dx;
        }
      }
    }

    // Step 3B: Extend the unstretched texture on a flat horizontal perspective plane (y = 0) out to infinity at the horizon
    const invScaleDist = 1.0 / (scale * camDist);
    for (let py = 0; py < H; py++) {
      const vs = (cy - (py + 0.5)) * invScaleDist;
      const denom = sinP - vs * cosP;
      // Pixels with denom <= 0.0015 are above the perspective plane's horizon line
      if (denom <= 0.0015) continue;

      const z1 = (-vs * camDist) / denom;
      const camDepth = camDist - z1 * cosP;
      if (camDepth <= 1.15) continue;

      const rowOffset = py * W;
      const wxBase = z1 * sinY;
      const wzBase = z1 * cosY;
      const dwx = camDepth * invScaleDist * cosY;
      const dwz = -camDepth * invScaleDist * sinY;

      // Horizon aerial perspective fog factor as plane extends toward infinity
      const baseFog = atmoDensityFactor > 0 ? Math.max(0, Math.min(1, (camDepth - 2.9) / 8.5)) * atmoDensityFactor : 0;
      const horizonFade = Math.max(0, Math.min(1, (camDepth - 5.5) / 18.0));
      const totalFog = Math.min(0.96, baseFog + horizonFade * (1 - baseFog) * (hasAtmosphere ? 0.92 : 0.75));

      let wx = wxBase + (0.5 - cx) * dwx;
      let wz = wzBase + (0.5 - cx) * dwz;

      for (let px = 0; px < W; px++) {
        const pIdx = rowOffset + px;
        if (zBuffer[pIdx] === 1e9) {
          // Fold world coordinates into [-1, 1] without stretching so texture continues at 1:1 scale to infinity
          const twx = (((wx + 1) * 0.5) % 2 + 2) % 2;
          const signX = twx <= 1 ? 1 : -1;
          const fxMir = (twx <= 1 ? twx : 2 - twx) * 2 - 1;
          const twz = (((wz + 1) * 0.5) % 2 + 2) % 2;
          const signZ = twz <= 1 ? 1 : -1;
          const fzMir = (twz <= 1 ? twz : 2 - twz) * 2 - 1;

          const tu = Math.max(0, Math.min(texMax - 0.001, (fxMir * 0.5 + 0.5) * texMax));
          const tv = Math.max(0, Math.min(texMax - 0.001, (fzMir * 0.5 + 0.5) * texMax));
          const iu = tu | 0;
          const iv = tv | 0;
          const fu = tu - iu;
          const fv = tv - iv;
          const sfu = fu * fu * (3 - 2 * fu);
          const sfv = fv * fv * (3 - 2 * fv);

          const ti00 = iv * TEX_RES + iu;
          const ti10 = ti00 + 1;
          const ti01 = ti00 + TEX_RES;
          const ti11 = ti01 + 1;

          const tw00 = (1 - sfu) * (1 - sfv);
          const tw10 = sfu * (1 - sfv);
          const tw01 = (1 - sfu) * sfv;
          const tw11 = sfu * sfv;

          let r = texR[ti00] * tw00 + texR[ti10] * tw10 + texR[ti01] * tw01 + texR[ti11] * tw11;
          let g = texG[ti00] * tw00 + texG[ti10] * tw10 + texG[ti01] * tw01 + texG[ti11] * tw11;
          let b = texB[ti00] * tw00 + texB[ti10] * tw10 + texB[ti01] * tw01 + texB[ti11] * tw11;

          const bx =
            (texBumpX[ti00] * tw00 + texBumpX[ti10] * tw10 + texBumpX[ti01] * tw01 + texBumpX[ti11] * tw11) *
            (1 / 64) *
            signX;
          const bz =
            (texBumpZ[ti00] * tw00 + texBumpZ[ti10] * tw10 + texBumpZ[ti01] * tw01 + texBumpZ[ti11] * tw11) *
            (1 / 64) *
            signZ;

          const f00 = texFlags[ti00];
          const f10 = texFlags[ti10];
          const f01 = texFlags[ti01];
          const f11 = texFlags[ti11];
          const lavaW =
            ((f00 & FLAG_LAVA) ? tw00 : 0) +
            ((f10 & FLAG_LAVA) ? tw10 : 0) +
            ((f01 & FLAG_LAVA) ? tw01 : 0) +
            ((f11 & FLAG_LAVA) ? tw11 : 0);

          if (lavaW < 0.99) {
            const rawR = r;
            const rawG = g;
            const rawB = b;

            const mnx = bx * 0.42;
            const mny = 1.0;
            const mnz = bz * 0.42;
            const invN = 1.0 / (Math.hypot(mnx, mny, mnz) || 1);
            const nx = mnx * invN;
            const ny = mny * invN;
            const nz = mnz * invN;

            const ndotl = Math.max(0, nx * lx + ny * ly + nz * lz);
            const cShad =
              (texCloudShadow[ti00] * tw00 +
                texCloudShadow[ti10] * tw10 +
                texCloudShadow[ti01] * tw01 +
                texCloudShadow[ti11] * tw11) *
              (1 / 255) *
              cloudShadowStrength;
            const shadowAtten = 1.0 - cShad;
            const diff = (0.30 + 0.78 * ndotl * shadowAtten) * nightDim;

            r *= diff;
            g *= diff;
            b *= diff;

            if (!isNight) {
              const waterW =
                ((f00 & FLAG_WATER) ? tw00 : 0) +
                ((f10 & FLAG_WATER) ? tw10 : 0) +
                ((f01 & FLAG_WATER) ? tw01 : 0) +
                ((f11 & FLAG_WATER) ? tw11 : 0);
              const iceW =
                ((f00 & FLAG_ICE_SPEC) ? tw00 : 0) +
                ((f10 & FLAG_ICE_SPEC) ? tw10 : 0) +
                ((f01 & FLAG_ICE_SPEC) ? tw01 : 0) +
                ((f11 & FLAG_ICE_SPEC) ? tw11 : 0);
              if (waterW + iceW > 0.01) {
                const ndoth = Math.max(0, nx * halfX + ny * halfY + nz * halfZ);
                const isTholinSpec = waterW < 0.5 && isTholinWorldSpec;
                const specPow =
                  waterW * (Math.pow(ndoth, 24) * 0.58) +
                  iceW * (Math.pow(ndoth, 16) * (isTholinSpec ? 0.18 : 0.30));
                const spec = specPow * shadowAtten;
                r += (isTholinSpec ? 245 : 230) * spec;
                g += (isTholinSpec ? 185 : 244) * spec;
                b += (isTholinSpec ? 120 : 255) * spec;
              }
            }

            if (totalFog > 0) {
              r = r * (1 - totalFog) + hazeRgb[0] * totalFog;
              g = g * (1 - totalFog) + hazeRgb[1] * totalFog;
              b = b * (1 - totalFog) + hazeRgb[2] * totalFog;
            }

            if (lavaW > 0.01) {
              r = r * (1 - lavaW) + rawR * lavaW;
              g = g * (1 - lavaW) + rawG * lavaW;
              b = b * (1 - lavaW) + rawB * lavaW;
            }
          }

          const ir = r < 0 ? 0 : r > 255 ? 255 : r | 0;
          const ig = g < 0 ? 0 : g > 255 ? 255 : g | 0;
          const ib = b < 0 ? 0 : b > 255 ? 255 : b | 0;
          colorBuffer[pIdx] = (255 << 24) | (ib << 16) | (ig << 8) | ir;
        }
        wx += dwx;
        wz += dwz;
      }
    }

    const pLen = perimeterIndices.length;

    // Composite the Z-buffered textured 3D terrain onto the main canvas
    const offCtx = offCanvas.getContext('2d');
    if (offCtx) {
      offCtx.putImageData(imgData, 0, 0);
      ctx.drawImage(offCanvas, 0, 0);
    }

    // 4. Draw Goldberg Hex/Pentagon tile boundary contour on the continuous surface
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < pLen; i++) {
      const v = vertices[perimeterIndices[i].vIdx];
      const p = project3D(v.x, v.y, v.z);
      if (i === 0) ctx.moveTo(p.sx, p.sy);
      else ctx.lineTo(p.sx, p.sy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 5. Render 3D Elevated Cloud Layer & Atmospheric Veil over the Terrain Block
    if (showClouds3D && cloudPuffs.length > 0) {
      ctx.save();
      const cloudRgb = surfaceModel.atmospherePalette.cloudRgb;
      const nightCloudMult = isNight ? 0.42 : isSunset ? 0.88 : 1.0;
      const topR = Math.min(255, Math.round(cloudRgb[0] * nightCloudMult + (isSunset ? 28 : 12)));
      const topG = Math.min(255, Math.round(cloudRgb[1] * nightCloudMult - (isSunset ? 12 : 0)));
      const topB = Math.min(255, Math.round(cloudRgb[2] * nightCloudMult - (isSunset ? 28 : 0)));
      const baseR = Math.max(0, Math.round(topR * 0.66));
      const baseG = Math.max(0, Math.round(topG * 0.68));
      const baseB = Math.max(0, Math.round(topB * 0.74));

      const projectedPuffs = cloudPuffs
        .map((puff) => {
          const p = project3D(puff.x, puff.y, puff.z);
          return { puff, p };
        })
        .sort((a, b) => b.p.depth - a.p.depth);

      for (let i = 0; i < projectedPuffs.length; i++) {
        const { puff, p } = projectedPuffs[i];
        const rxPx = puff.rx * scale * p.persp;
        const ryPx = puff.ry * scale * p.persp * (0.58 + 0.42 * Math.sin(rotPitch));
        const alpha = Math.min(0.84, puff.density * 0.72);

        const grad = ctx.createRadialGradient(
          p.sx - rxPx * 0.18 * lx,
          p.sy - ryPx * 0.28,
          ryPx * 0.15,
          p.sx,
          p.sy,
          Math.max(rxPx, ryPx)
        );
        grad.addColorStop(0, `rgba(${topR}, ${topG}, ${topB}, ${alpha.toFixed(2)})`);
        grad.addColorStop(0.62, `rgba(${baseR}, ${baseG}, ${baseB}, ${(alpha * 0.68).toFixed(2)})`);
        grad.addColorStop(1, `rgba(${baseR}, ${baseG}, ${baseB}, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(p.sx, p.sy, rxPx, ryPx, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 6. Neighbor direction badges floating around the perimeter of the 3D biome block
    ctx.save();
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let s = 0; s < sides; s++) {
      const cA = corners[s];
      const cB = corners[(s + 1) % sides];
      const midX = (cA[0] + cB[0]) * 0.5 * 1.12;
      const midZ = (cA[1] + cB[1]) * 0.5 * 1.12;
      const pLabel = project3D(midX, 0.04, midZ);
      const nb = neighborTiles[s];
      if (!nb) continue;

      const labelText = nb.compass;
      const metrics = ctx.measureText(labelText);
      const bw = metrics.width + 14;
      const bh = 16;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = nb.tile.biomeColor || '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(pLabel.sx - bw * 0.5, pLabel.sy - bh * 0.5, bw, bh, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(labelText, pLabel.sx, pLabel.sy);
    }
    ctx.restore();
  }, [
    meshData,
    rotYaw,
    rotPitch,
    zoom,
    verticalExag,
    showClouds3D,
    timeOfDayDeg,
    surfaceModel,
    neighborTiles,
    hasAtmosphere,
    pBarAtmo,
    activeTile,
  ]);

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Top Bar: Tile Info + Back to Globe + 3D Biome Block Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/90 px-3 py-2 rounded-lg border border-slate-800">
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onBackToGlobe}
            className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sky-300 font-bold flex items-center gap-1.5 cursor-pointer transition text-[11px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Planetary Grid
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center -space-x-1">
              <span
                className="w-3 h-3 rounded-full border border-white/30"
                style={{ backgroundColor: activeTile.biomeColor }}
              />
              {activeTile.secondaryBiomeColor && (
                <span
                  className="w-3 h-3 rounded-full border border-white/40"
                  style={{ backgroundColor: activeTile.secondaryBiomeColor }}
                />
              )}
            </span>
            <span className="text-white font-bold text-xs">
              {moon?.name || planet.planetClass}
            </span>
            <span className="text-slate-200 font-semibold text-xs">
              • {activeTile.biomeName}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-sky-950/90 border border-sky-500/60 text-sky-200 font-mono font-bold text-xs tracking-wide shadow-sm">
              {activeTile.centerLat >= 0 ? `${activeTile.centerLat}°N` : `${Math.abs(activeTile.centerLat)}°S`},{' '}
              {activeTile.centerLon >= 0 ? `${activeTile.centerLon}°E` : `${Math.abs(activeTile.centerLon)}°W`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <ZoomIn className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[10px] text-slate-400">ZOOM:</span>
            <input
              type="range"
              min="0.75"
              max="2.4"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(+e.target.value)}
              className="w-16 accent-sky-400 cursor-pointer"
            />
            <span className="text-[10px] text-sky-300 w-7 font-bold">{zoom.toFixed(1)}×</span>
          </div>

          <div className="flex items-center gap-1">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] text-slate-400">SUN:</span>
            <input
              type="range"
              min="-60"
              max="180"
              step="5"
              value={timeOfDayDeg}
              onChange={(e) => onChangeTimeOfDay(+e.target.value)}
              className="w-16 accent-amber-400 cursor-pointer"
            />
          </div>

          {hasAtmosphere && (
            <button
              type="button"
              onClick={() => setShowClouds3D((v) => !v)}
              className={`px-2 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
                showClouds3D
                  ? 'bg-sky-900/60 border-sky-500/70 text-sky-200'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
              title="Toggle 3D floating clouds & ground cloud shadows"
            >
              <Cloud className="w-3 h-3" />
              Clouds
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowGeologyPanel((v) => !v)}
            className={`px-2 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
              showGeologyPanel
                ? 'bg-amber-900/60 border-amber-500/70 text-amber-200'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Toggle Local Geology & Crust Composition Panel"
          >
            <Layers className="w-3 h-3" />
            Local Geology
          </button>

          <button
            type="button"
            onClick={() => {
              setRotYaw(0.62);
              setRotPitch(0.54);
              setZoom(1.28);
            }}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>
      </div>

      {/* Toggleable Local Geology & Crust Composition Panel */}
      {showGeologyPanel && (
        <div className="bg-slate-950/95 border border-amber-500/40 rounded-lg p-3 text-xs text-slate-300 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-0.5">
              Crust & Bedrock Composition
            </div>
            <div className="text-white font-semibold">
              {surfaceModel.compositionPalette.compositionLabel}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {activeTile.featureName}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-sky-400 mb-0.5">
              Elevation & Relief
            </div>
            <div className="text-white font-mono">
              Mean Elevation: {activeTile.elevationKm >= 0 ? `+${activeTile.elevationKm.toFixed(1)} km` : `${activeTile.elevationKm.toFixed(1)} km`}
            </div>
            <div className="text-[11px] text-slate-400">
              Relief Range: {surfaceModel.minElevationKm.toFixed(1)} to +{surfaceModel.maxElevationKm.toFixed(1)} km
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-0.5">
              Tectonic & Impact Drivers
            </div>
            <div className="text-slate-200">
              Crater Preservation: <span className="font-mono text-white">{Math.round(activeTile.craterIntensity * 100)}%</span>
            </div>
            <div className="text-slate-200">
              Volcanic / Tectonic: <span className="font-mono text-white">{Math.round(Math.max(activeTile.volcanoIntensity, activeTile.fractureIntensity) * 100)}%</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-0.5">
              Surface Solvent & Biosphere
            </div>
            <div className="text-slate-200">
              Liquid Solvent: <span className="text-white font-semibold">{surfaceModel.hasLiquid ? surfaceModel.seaPalette.displayName : 'None (Dry)'}</span>
            </div>
            {surfaceModel.floraPalette.hasAnyLife && (
              <div className="text-[11px] text-emerald-300">
                Pigment: {surfaceModel.floraPalette.pigmentName}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main 3D Biome Block Viewport + Neighbor Navigation Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div
          className={`lg:col-span-3 relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 select-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onMouseDown={(e) => {
            setIsDragging(true);
            dragRef.current = {
              startX: e.clientX,
              startY: e.clientY,
              startYaw: rotYaw,
              startPitch: rotPitch,
            };
          }}
          onMouseMove={(e) => {
            if (!isDragging || !dragRef.current) return;
            const dx = e.clientX - dragRef.current.startX;
            const dy = e.clientY - dragRef.current.startY;
            setRotYaw(dragRef.current.startYaw - dx * 0.0085);
            setRotPitch(Math.max(0.18, Math.min(1.28, dragRef.current.startPitch + dy * 0.0065)));
          }}
          onMouseUp={() => {
            setIsDragging(false);
            dragRef.current = null;
          }}
          onMouseLeave={() => {
            setIsDragging(false);
            dragRef.current = null;
          }}
          onWheel={(e) => {
            e.preventDefault();
            setZoom((z) => Math.max(0.75, Math.min(2.4, +(z - e.deltaY * 0.0012).toFixed(2))));
          }}
        >
          <canvas ref={canvasRef} className="w-full h-[380px] sm:h-[440px] block object-cover" />
        </div>

        {/* Right Column: Linked Adjacent Tiles */}
        <div className="bg-slate-950/90 rounded-lg border border-slate-800 p-3 flex flex-col justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-sky-400 tracking-wide flex items-center gap-1.5 mb-2.5">
              <Compass className="w-3.5 h-3.5" />
              Adjacent Tiles (Click to travel)
            </div>

            <div className="flex flex-col gap-1.5">
              {neighborTiles.map((nb) => (
                <button
                  key={nb.tile.tileId}
                  type="button"
                  onClick={() => onSelectTile(nb.tile)}
                  className="w-full text-left px-2.5 py-1.5 rounded-md bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/50 transition flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-950 text-sky-300 border border-slate-800 w-7 text-center shrink-0">
                      {nb.compass}
                    </span>
                    <span className="inline-flex items-center -space-x-1 shrink-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/20"
                        style={{ backgroundColor: nb.tile.biomeColor }}
                      />
                      {nb.tile.secondaryBiomeColor && (
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-white/30"
                          style={{ backgroundColor: nb.tile.secondaryBiomeColor }}
                        />
                      )}
                    </span>
                    <span className="text-[11px] text-slate-200 font-medium truncate group-hover:text-white">
                      {nb.tile.biomeName}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-1">
                    {nb.tile.temperatureK}K
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
