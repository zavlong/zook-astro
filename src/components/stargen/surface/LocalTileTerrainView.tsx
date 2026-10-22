import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  RotateCcw,
  Compass,
  Sun,
  Layers,
  ArrowLeft,
  Cloud,
  ZoomIn,
  Sprout,
} from 'lucide-react';
import { RealisticPlanetBody } from '../../../core/generation/realisticStarGen';
import { RealisticMoon } from '../../../types/astrophysics';
import {
  PlanetarySurfaceModel,
  resolveSolidBiomeColorHex,
  resolveGasGiantStormColors,
} from './surfaceGenMath';
import {
  GoldbergPlanetaryTile,
  PlanetaryGoldbergGrid,
  createNeighborAwareTileEvaluator,
} from './goldbergTileGrid';
import {
  FLAG_WATER,
  FLAG_LAVA,
  FLAG_ICE_SPEC,
  hexToRgb,
  hash2,
  isotropicNoise2D,
  fbm2D,
  ridgedFbm2D,
  cellularFeature2D,
} from './terrainNoise';
import { renderSkyBackdrop } from './skyBackdropRenderer';
import {
  rasterizeTileTerrain,
  LocalVertex,
  LocalTri,
} from './tileTerrainRasterizer';

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
  onToggleFlora?: () => void;
  isFloraOpen?: boolean;
}

interface CloudPuff3D {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  density: number; // [0..1]
  isStormAnvil: boolean;
  hasLightning?: boolean;
  r?: number;
  g?: number;
  b?: number;
  baseR?: number;
  baseG?: number;
  baseB?: number;
}

interface TileMeshData {
  sides: number;
  corners: [number, number][];
  vertices: LocalVertex[];
  triangles: LocalTri[];
  perimeterIndices: { vIdx: number; wedgeIdx: number }[];
  cloudPuffs: CloudPuff3D[];
  effCloudCover: number;
  TEX_RES: number;
  texR: Uint8Array;
  texG: Uint8Array;
  texB: Uint8Array;
  texBumpX: Int8Array;
  texBumpZ: Int8Array;
  texFlags: Uint8Array;
  texCloudShadow: Uint8Array;
  MIP_RES: number;
  mipR: Uint8Array;
  mipG: Uint8Array;
  mipB: Uint8Array;
  mipBumpX: Int8Array;
  mipBumpZ: Int8Array;
  tileSeed: number;
}


function compassLabelFromAzimuth(azDeg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((azDeg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

// Module-level LRU cache for 3D hexagonal tile meshes and procedural textures
const tileMeshCache = new Map<string, TileMeshData>();

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
  onToggleFlora,
  isFloraOpen,
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
  const dragRafRef = useRef<number | null>(null);
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

  // Build High-Resolution 3D Hexagonal/Pentagonal Mesh + Procedural Biome Texture & Micro-Bump Normal Map
  const meshData = useMemo<TileMeshData>(() => {
    const cacheKey = `${surfaceModel.seed}_${activeTile.tileId}_${activeTile.biomeId}_${activeTile.secondaryBiomeId}_${activeTile.craterIntensity}_${surfaceModel.hasLiquid}_${pBarAtmo}`;
    const cached = tileMeshCache.get(cacheKey);
    if (cached) return cached;

    const sides = activeTile.isPentagon ? 5 : 6;
    const rings = 36; // 36 rings provide crisp 3D relief with ~2.2x fewer polygons for fast hydration
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
      const eps = 0.014;
      const hxPos = sampleHeightOnly(px + eps, pz).hLocal;
      const hxNeg = sampleHeightOnly(px - eps, pz).hLocal;
      const hzPos = sampleHeightOnly(px, pz + eps).hLocal;
      const hzNeg = sampleHeightOnly(px, pz - eps).hLocal;
      const hasSeaHere = oceanWeight >= 0.5 && hLocal < 0;
      const rawY = hasSeaHere ? 0 : hLocal;
      // Smoothly meet the y=0 perspective plane right at the tile perimeter with quintic C2 taper
      const edgeTaper = edgeFrac > 0.84 ? Math.max(0, 1.0 - (edgeFrac - 0.84) / 0.16) : 1.0;
      const smoothTaper = edgeTaper * edgeTaper * edgeTaper * (edgeTaper * (edgeTaper * 6 - 15) + 10);
      const finalY = rawY * smoothTaper;

      const nx = hasSeaHere ? 0 : (-(hxPos - hxNeg) / (2.0 * eps)) * smoothTaper;
      const ny = 1.0;
      const nz = hasSeaHere ? 0 : (-(hzPos - hzNeg) / (2.0 * eps)) * smoothTaper;
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

    // Perform Laplacian vertex-normal smoothing across triangle adjacency to eliminate any polygonal faceting
    const vCount = vertices.length;
    const accNx = new Float32Array(vCount);
    const accNy = new Float32Array(vCount);
    const accNz = new Float32Array(vCount);
    for (let i = 0; i < vCount; i++) {
      accNx[i] = vertices[i].nx * 2.0;
      accNy[i] = vertices[i].ny * 2.0;
      accNz[i] = vertices[i].nz * 2.0;
    }
    for (let i = 0; i < triangles.length; i++) {
      const { v0, v1, v2 } = triangles[i];
      const n0 = vertices[v0];
      const n1 = vertices[v1];
      const n2 = vertices[v2];
      const avgX = (n0.nx + n1.nx + n2.nx) / 3.0;
      const avgY = (n0.ny + n1.ny + n2.ny) / 3.0;
      const avgZ = (n0.nz + n1.nz + n2.nz) / 3.0;
      accNx[v0] += avgX;
      accNy[v0] += avgY;
      accNz[v0] += avgZ;
      accNx[v1] += avgX;
      accNy[v1] += avgY;
      accNz[v1] += avgZ;
      accNx[v2] += avgX;
      accNy[v2] += avgY;
      accNz[v2] += avgZ;
    }
    for (let i = 0; i < vCount; i++) {
      const inv = 1.0 / (Math.hypot(accNx[i], accNy[i], accNz[i]) || 1);
      vertices[i].nx = accNx[i] * inv;
      vertices[i].ny = accNy[i] * inv;
      vertices[i].nz = accNz[i] * inv;
    }

    const perimeterIndices: { vIdx: number; wedgeIdx: number }[] = [];
    for (let s = 0; s < sides; s++) {
      for (let k = 0; k < rings; k++) {
        perimeterIndices.push({ vIdx: ringVertIdx(rings, s, k), wedgeIdx: s });
      }
    }

    // ============================================================================
    // GENERATE 384x384 HIGH-RESOLUTION PROCEDURAL BIOME TEXTURE & BUMP NORMAL MAP
    // ============================================================================
    const TEX_RES = 384;
    const texR = new Uint8Array(TEX_RES * TEX_RES);
    const texG = new Uint8Array(TEX_RES * TEX_RES);
    const texB = new Uint8Array(TEX_RES * TEX_RES);
    const texBumpX = new Int8Array(TEX_RES * TEX_RES);
    const texBumpZ = new Int8Array(TEX_RES * TEX_RES);
    const texFlags = new Uint8Array(TEX_RES * TEX_RES);
    const texCloudShadow = new Uint8Array(TEX_RES * TEX_RES);

    // Precompute a 97x97 macro terrain grid across [-1, +1] (1:1 unstretched tile coordinates)
    const MACRO_N = 97;
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
        const isUnicellular = surfaceModel.isUnicellularOnly;
        const canopyDensity = Math.max(
          0,
          Math.min(1, baseFbm * 1.18 + (targetBiomeId === 5 ? 0.34 : targetBiomeId === 6 ? 0.22 : -0.14))
        );
        const cell = cellularFeature2D(px * 26.0, pz * 26.0, tileSeed + 809);
        const crownRadius = (isForestBiome ? 0.32 : 0.22) + canopyDensity * 0.26;
        const treeRgb = targetBiomeId === 6 ? taigaRgb : isForestBiome ? forestRgb : plainsRgb;

        // Tree models and canopies only spawn on multicellular worlds. Unicellular worlds are flat algal plains with colored soil!
        if (!isUnicellular && cell.dist < crownRadius && slope < 0.52 && hLocal > 0.018 && hLocal < 0.29) {
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

    // Synthesize every pixel of the 768x768 procedural biome texture + bump map across [-1, +1] (1:1 tile scale)
    for (let tz = 0; tz < TEX_RES; tz++) {
      const vNorm = tz / (TEX_RES - 1);
      const pz = vNorm * 2.0 - 1.0;
      const mfz = vNorm * (MACRO_N - 1);
      const miz = Math.min(MACRO_N - 2, Math.floor(mfz));
      const fz = mfz - miz;
      // Quintic C2 Perlin weight eliminates both linear and second-derivative creases along MACRO_N rows
      const sfz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);

      for (let tx = 0; tx < TEX_RES; tx++) {
        const uNorm = tx / (TEX_RES - 1);
        const px = uNorm * 2.0 - 1.0;
        const mfx = uNorm * (MACRO_N - 1);
        const mix = Math.min(MACRO_N - 2, Math.floor(mfx));
        const fx = mfx - mix;
        const sfx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);

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

        // Isotropic dual-rotated continuous micro-texture noises at pixel resolution with smooth band-limiting
        const fine1 = isotropicNoise2D(px * 24.0, pz * 24.0, tileSeed + 313);
        const fine2 = isotropicNoise2D(px * 52.0, pz * 52.0, tileSeed + 419);
        const fine3 = isotropicNoise2D(px * 96.0, pz * 96.0, tileSeed + 521);
        const grain = (fine3 - 0.5) * 0.34 + (fine2 - 0.5) * 0.24;

        // Micro-normal gradient evaluated efficiently by reusing fine1 sample
        const fineStepX = isotropicNoise2D((px + 0.008) * 24.0, pz * 24.0, tileSeed + 313);
        const fineStepZ = isotropicNoise2D(px * 24.0, (pz + 0.008) * 24.0, tileSeed + 313);
        let bumpX = -dhx * 1.32 + (fine1 - fineStepX) * 1.85;
        let bumpZ = -dhz * 1.32 + (fine1 - fineStepZ) * 1.85;

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
              const wPhase1 = px * 68.0 + pz * 38.0 + fine1 * 4.0;
              const wPhase2 = px * 42.0 - pz * 72.0 + fine2 * 3.4;
              bumpX = Math.cos(wPhase1) * 0.48 + Math.cos(wPhase2) * 0.32;
              bumpZ = Math.sin(wPhase1) * 0.48 - Math.sin(wPhase2) * 0.32;

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

    // Apply a 3x3 binomial smoothing kernel across the synthesized texture & normal maps to eliminate high-frequency harshness
    const smoothR = new Uint8Array(TEX_RES * TEX_RES);
    const smoothG = new Uint8Array(TEX_RES * TEX_RES);
    const smoothB = new Uint8Array(TEX_RES * TEX_RES);
    const smoothBX = new Int8Array(TEX_RES * TEX_RES);
    const smoothBZ = new Int8Array(TEX_RES * TEX_RES);
    for (let tz = 0; tz < TEX_RES; tz++) {
      const z0 = Math.max(0, tz - 1) * TEX_RES;
      const z1 = tz * TEX_RES;
      const z2 = Math.min(TEX_RES - 1, tz + 1) * TEX_RES;
      for (let tx = 0; tx < TEX_RES; tx++) {
        const x0 = Math.max(0, tx - 1);
        const x1 = tx;
        const x2 = Math.min(TEX_RES - 1, tx + 1);
        const i00 = z0 + x0, i10 = z0 + x1, i20 = z0 + x2;
        const i01 = z1 + x0, i11 = z1 + x1, i21 = z1 + x2;
        const i02 = z2 + x0, i12 = z2 + x1, i22 = z2 + x2;
        smoothR[i11] = (texR[i00] + texR[i20] + texR[i02] + texR[i22] + (texR[i10] + texR[i01] + texR[i21] + texR[i12]) * 2 + texR[i11] * 8 + 10) / 20;
        smoothG[i11] = (texG[i00] + texG[i20] + texG[i02] + texG[i22] + (texG[i10] + texG[i01] + texG[i21] + texG[i12]) * 2 + texG[i11] * 8 + 10) / 20;
        smoothB[i11] = (texB[i00] + texB[i20] + texB[i02] + texB[i22] + (texB[i10] + texB[i01] + texB[i21] + texB[i12]) * 2 + texB[i11] * 8 + 10) / 20;
        smoothBX[i11] = Math.round((texBumpX[i00] + texBumpX[i20] + texBumpX[i02] + texBumpX[i22] + (texBumpX[i10] + texBumpX[i01] + texBumpX[i21] + texBumpX[i12]) * 2 + texBumpX[i11] * 4) / 16);
        smoothBZ[i11] = Math.round((texBumpZ[i00] + texBumpZ[i20] + texBumpZ[i02] + texBumpZ[i22] + (texBumpZ[i10] + texBumpZ[i01] + texBumpZ[i21] + texBumpZ[i12]) * 2 + texBumpZ[i11] * 4) / 16);
      }
    }
    texR.set(smoothR);
    texG.set(smoothG);
    texB.set(smoothB);
    texBumpX.set(smoothBX);
    texBumpZ.set(smoothBZ);

    // Precompute a 2x2 box-filtered mipmap level (384x384) for anti-aliased distance sampling on the horizon plane
    const MIP_RES = TEX_RES >> 1;
    const mipR = new Uint8Array(MIP_RES * MIP_RES);
    const mipG = new Uint8Array(MIP_RES * MIP_RES);
    const mipB = new Uint8Array(MIP_RES * MIP_RES);
    const mipBumpX = new Int8Array(MIP_RES * MIP_RES);
    const mipBumpZ = new Int8Array(MIP_RES * MIP_RES);
    for (let mz = 0; mz < MIP_RES; mz++) {
      const r0 = (mz * 2) * TEX_RES;
      const r1 = (mz * 2 + 1) * TEX_RES;
      const mRow = mz * MIP_RES;
      for (let mx = 0; mx < MIP_RES; mx++) {
        const c0 = mx * 2;
        const c1 = c0 + 1;
        const mIdx = mRow + mx;
        mipR[mIdx] = (texR[r0 + c0] + texR[r0 + c1] + texR[r1 + c0] + texR[r1 + c1] + 2) >> 2;
        mipG[mIdx] = (texG[r0 + c0] + texG[r0 + c1] + texG[r1 + c0] + texG[r1 + c1] + 2) >> 2;
        mipB[mIdx] = (texB[r0 + c0] + texB[r0 + c1] + texB[r1 + c0] + texB[r1 + c1] + 2) >> 2;
        mipBumpX[mIdx] = (texBumpX[r0 + c0] + texBumpX[r0 + c1] + texBumpX[r1 + c0] + texBumpX[r1 + c1]) >> 2;
        mipBumpZ[mIdx] = (texBumpZ[r0 + c0] + texBumpZ[r0 + c1] + texBumpZ[r1 + c0] + texBumpZ[r1 + c1]) >> 2;
      }
    }

    // Build 3D Volumetric Cloud Canopy Puffs floating above the tile (or multi-deck colored gas giant clouds)
    const cloudPuffs: CloudPuff3D[] = [];
    if (surfaceModel.isNoSurface) {
      const pal = surfaceModel.atmospherePalette;
      const stormColors = resolveGasGiantStormColors(
        pal,
        surfaceModel.isSupercritical,
        surfaceModel.isIceGiant
      );
      const tileRgb = hexToRgb(activeTile.biomeColor || surfaceModel.skyHorizonHex);
      const nbColors = neighborEntries.map((ne) => ({
        dirX: ne.dirX,
        dirZ: ne.dirZ,
        rgb: hexToRgb(ne.tile.biomeColor || activeTile.biomeColor),
      }));

      // 3 distinct vertical cloud decks suspended in the bottomless colored atmosphere
      const decks = [
        { yBase: -0.30, gridN: 11, span: 1.55, deckType: 0 }, // Deep tropospheric belt cloud deck
        { yBase: -0.02, gridN: 14, span: 1.45, deckType: 1 }, // Mid-troposphere banded zonal cloud deck
        { yBase: 0.24, gridN: 13, span: 1.38, deckType: 2 },  // Upper ammonia/methane/alkali bright cloud & storm deck
      ];

      // Determine storm vortex presence & intensity from global storm grid (fractureIntensity & craterIntensity)
      const globalStormInt = activeTile.fractureIntensity || 0;
      const globalStormCode = activeTile.craterIntensity || 0;
      const isMajorStormTile = globalStormInt > 0.16;
      const hasGreatOval = isMajorStormTile || hash2(activeTile.tileId, 17, tileSeed) > 0.45;
      const ovalX = (hash2(activeTile.tileId, 31, tileSeed) - 0.5) * (isMajorStormTile ? 0.36 : 0.65);
      const ovalZ = (hash2(activeTile.tileId, 47, tileSeed) - 0.5) * (isMajorStormTile ? 0.30 : 0.55);
      const ovalRadius = isMajorStormTile ? 0.62 + globalStormInt * 0.38 : 0.40;
      const spinDir = activeTile.centerLat >= 0 ? -1 : 1;

      for (let dIdx = 0; dIdx < decks.length; dIdx++) {
        const deck = decks[dIdx];
        const gN = deck.gridN;
        for (let gx = -gN; gx <= gN; gx++) {
          for (let gz = -gN; gz <= gN; gz++) {
            const jx = (hash2(gx + 50, gz + 50, tileSeed + 901 + dIdx * 131) - 0.5) * 0.13;
            const jz = (hash2(gx + 80, gz + 80, tileSeed + 947 + dIdx * 173) - 0.5) * 0.11;
            const cx = (gx / gN) * deck.span + jx;
            const cz = (gz / gN) * deck.span + jz;
            if (Math.hypot(cx * 0.82, cz) > deck.span * 1.05) continue;

            // Zonal jet stream wave & turbulent eddies
            const warpX = fbm2D(cx * 2.1 + dIdx * 1.7, cz * 2.1 - dIdx * 1.3, tileSeed + 307 + dIdx * 59, 3) - 0.5;
            const warpZ = fbm2D(cx * 2.1 - 3.4, cz * 2.1 + 2.8, tileSeed + 409 + dIdx * 83, 3) - 0.5;

            // Distance & logarithmic spiral phase around anticyclonic/cyclonic storm vortex
            const dxOval = (cx - ovalX) * 0.76;
            const dzOval = (cz - ovalZ) * 1.18;
            const dOval = hasGreatOval ? Math.hypot(dxOval, dzOval) : 99;
            const rNorm = dOval / ovalRadius;
            const inOval = rNorm < 1.25;
            const thetaOval = inOval ? Math.atan2(dzOval, dxOval) : 0;
            const spiralArms = inOval
              ? Math.sin(thetaOval * 2.0 + spinDir * rNorm * 8.5 + warpX * 3.2) * 0.5 + 0.5
              : 0;
            const collarWeight = inOval ? Math.exp(-Math.pow((rNorm - 0.78) / 0.22, 2)) : 0;
            const coreWeight = rNorm < 0.92 ? Math.pow(1.0 - rNorm / 0.92, 1.35) : 0;
            const ovalWeight = inOval
              ? Math.min(1.0, coreWeight * (0.68 + 0.32 * spiralArms) + collarWeight * 0.65) *
                (isMajorStormTile ? 1.0 : 0.68)
              : 0;

            // Deflect zonal bands around the storm vortex
            const deflectZ = inOval ? (dzOval >= 0 ? 1 : -1) * Math.exp(-rNorm * rNorm * 0.9) * 0.22 : 0;
            const bandPhase =
              (cz + deflectZ + warpZ * 0.28) * 7.5 + Math.sin(cx * 2.6 + warpX * 2.4) * 0.85;
            const bandWave = Math.sin(bandPhase) * 0.5 + 0.5;
            const eddy = fbm2D((cx + warpX * 0.35) * 3.4, (cz + warpZ * 0.35) * 3.4, tileSeed + 523 + dIdx * 97, 4);

            const densRaw = eddy * 0.58 + bandWave * 0.36 + ovalWeight * 0.56;
            const threshold = deck.deckType === 2 ? 0.44 : deck.deckType === 1 ? 0.33 : 0.29;
            if (densRaw <= threshold) continue;

            const dens = Math.min(1, (densRaw - threshold) / (1 - threshold));

            // Blend local cloud hue with bordering tile band colors near edges
            let locR = tileRgb[0];
            let locG = tileRgb[1];
            let locB = tileRgb[2];
            for (let n = 0; n < nbColors.length; n++) {
              const nb = nbColors[n];
              const proj = cx * nb.dirX + cz * nb.dirZ;
              if (proj > 0.25) {
                const nw = Math.min(0.45, ((proj - 0.25) / 1.1) * 0.42);
                locR = locR * (1 - nw) + nb.rgb[0] * nw;
                locG = locG * (1 - nw) + nb.rgb[1] * nw;
                locB = locB * (1 - nw) + nb.rgb[2] * nw;
              }
            }

            // Compute distinct colored cloud palette per deck and zonal band
            let pR = pal.cloudRgb[0];
            let pG = pal.cloudRgb[1];
            let pB = pal.cloudRgb[2];

            if (deck.deckType === 0) {
              // Deep atmospheric belt clouds: rich dark belt + deep atmosphere hue
              const tMix = 0.35 + 0.45 * bandWave;
              pR = pal.bandDarkRgb[0] * (1 - tMix) + pal.atmoRgb[0] * tMix;
              pG = pal.bandDarkRgb[1] * (1 - tMix) + pal.atmoRgb[1] * tMix;
              pB = pal.bandDarkRgb[2] * (1 - tMix) + pal.atmoRgb[2] * tMix;
            } else if (deck.deckType === 1) {
              // Mid-troposphere zonal bands: swirls between bandDarkRgb, tileRgb, and bandLightRgb
              if (bandWave < 0.5) {
                const u = bandWave * 2.0;
                pR = pal.bandDarkRgb[0] * (1 - u) + locR * u;
                pG = pal.bandDarkRgb[1] * (1 - u) + locG * u;
                pB = pal.bandDarkRgb[2] * (1 - u) + locB * u;
              } else {
                const u = (bandWave - 0.5) * 2.0;
                pR = locR * (1 - u) + pal.bandLightRgb[0] * u;
                pG = locG * (1 - u) + pal.bandLightRgb[1] * u;
                pB = locB * (1 - u) + pal.bandLightRgb[2] * u;
              }
            } else {
              // Upper bright cloud deck: luminous cloudRgb + bandLightRgb + storm vortex tint
              const u = 0.4 + 0.6 * bandWave;
              pR = pal.bandLightRgb[0] * (1 - u) + pal.cloudRgb[0] * u;
              pG = pal.bandLightRgb[1] * (1 - u) + pal.cloudRgb[1] * u;
              pB = pal.bandLightRgb[2] * (1 - u) + pal.cloudRgb[2] * u;
            }

            // Apply authentic Gas Giant / Ice Giant / Supercritical Storm Vortex & Supercell colors
            if (ovalWeight > 0.04) {
              let stormR = stormColors.coreRgb[0];
              let stormG = stormColors.coreRgb[1];
              let stormB = stormColors.coreRgb[2];

              if (globalStormCode >= 0.30 && globalStormCode < 0.50) {
                // Convective Lightning Supercell Plume
                const scMix = 0.35 + 0.65 * spiralArms;
                stormR = stormColors.coreRgb[0] * (1 - scMix) + stormColors.supercellRgb[0] * scMix;
                stormG = stormColors.coreRgb[1] * (1 - scMix) + stormColors.supercellRgb[1] * scMix;
                stormB = stormColors.coreRgb[2] * (1 - scMix) + stormColors.supercellRgb[2] * scMix;
              } else {
                // Great Anticyclonic Oval: core chromophore + bright spiral collar ring
                const cMix = Math.min(1, collarWeight * 0.72 + (1 - coreWeight) * 0.35 * spiralArms);
                stormR = stormColors.coreRgb[0] * (1 - cMix) + stormColors.collarRgb[0] * cMix;
                stormG = stormColors.coreRgb[1] * (1 - cMix) + stormColors.collarRgb[1] * cMix;
                stormB = stormColors.coreRgb[2] * (1 - cMix) + stormColors.collarRgb[2] * cMix;
              }

              const blendStorm = Math.min(0.92, ovalWeight * (isMajorStormTile ? 0.92 : 0.76));
              pR = pR * (1 - blendStorm) + stormR * blendStorm;
              pG = pG * (1 - blendStorm) + stormG * blendStorm;
              pB = pB * (1 - blendStorm) + stormB * blendStorm;
            }

            const yJitter = (hash2(gx, gz, tileSeed + 991 + dIdx * 43) - 0.5) * 0.07;
            const stormTowerLift =
              ovalWeight * (deck.deckType === 2 ? 0.13 : 0.07) + collarWeight * 0.04;
            const alt = deck.yBase + yJitter + bandWave * 0.04 + stormTowerLift;
            const hasLightning =
              deck.deckType >= 1 &&
              ovalWeight > 0.32 &&
              hash2(gx * 3, gz * 3, tileSeed + 1409 + dIdx * 71) > 0.68;

            cloudPuffs.push({
              x: cx,
              y: alt,
              z: cz,
              // Elongate horizontally along zonal wind bands or storm spiral arms
              rx: (0.11 + dens * 0.11) * (deck.deckType === 1 ? 1.35 : 1.18),
              ry: 0.032 + dens * (deck.deckType === 2 ? 0.052 : 0.038) + ovalWeight * 0.018,
              density: Math.min(0.96, 0.38 + dens * 0.56 + ovalWeight * 0.12),
              isStormAnvil: ovalWeight > 0.22 || dens > 0.72,
              hasLightning,
              r: Math.max(0, Math.min(255, Math.round(pR))),
              g: Math.max(0, Math.min(255, Math.round(pG))),
              b: Math.max(0, Math.min(255, Math.round(pB))),
              baseR: Math.max(0, Math.min(255, Math.round(pR * 0.58 + pal.bandDarkRgb[0] * 0.22))),
              baseG: Math.max(0, Math.min(255, Math.round(pG * 0.58 + pal.bandDarkRgb[1] * 0.22))),
              baseB: Math.max(0, Math.min(255, Math.round(pB * 0.62 + pal.bandDarkRgb[2] * 0.22))),
            });
          }
        }
      }
    } else if (surfaceModel.cloudOpacity > 0.015 && effCloudCover > 0.04) {
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

    const result = {
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
      MIP_RES,
      mipR,
      mipG,
      mipB,
      mipBumpX,
      mipBumpZ,
      tileSeed,
    };

    if (tileMeshCache.size >= 16) {
      const oldestKey = tileMeshCache.keys().next().value;
      if (oldestKey) tileMeshCache.delete(oldestKey);
    }
    tileMeshCache.set(cacheKey, result);

    return result;
  }, [surfaceModel, activeTile, neighborTiles, pBarAtmo, hasAtmosphere]);

  // Render the Per-Pixel Textured & Bump-Mapped 3D Hexagonal Biome Block + Infinite Perspective Plane to Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 900;
    const H = 550;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }

    // 1. Atmospheric Sky Backdrop & Horizon Scattering Dome
    const { radTOD, isNight, isSunset } = renderSkyBackdrop({
      ctx,
      width: W,
      height: H,
      timeOfDayDeg,
      surfaceModel,
      hasAtmosphere,
      pBarAtmo,
      rotYaw,
      activeTileBiomeColor: activeTile.biomeColor,
    });

    // 2. Camera & Light setup
    const cosY = Math.cos(rotYaw);
    const sinY = Math.sin(rotYaw);
    const cosP = Math.cos(rotPitch);
    const sinP = Math.sin(rotPitch);

    const scale = 312.5 * zoom;
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
      MIP_RES,
      mipR,
      mipG,
      mipB,
      mipBumpX,
      mipBumpZ,
    } = meshData;

    const hazeRgb = isSunset
      ? [212, 118, 68]
      : isNight
      ? [14, 24, 44]
      : hexToRgb(surfaceModel.skyHorizonHex);
    const atmoDensityFactor = hasAtmosphere
      ? Math.min(0.52, 0.10 + surfaceModel.cloudOpacity * 0.36 + Math.min(0.15, pBarAtmo * 0.03))
      : 0;

    // Draw soft atmospheric scattering dome behind/around the 3D tile
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

    const pLen = perimeterIndices.length;

    if (surfaceModel.isNoSurface) {
      // ============================================================================
      // 3. GAS GIANT / ICE GIANT / SUPERCRITICAL: COLORED ATMOSPHERE & CLOUD BANDS
      //    (NO SOLID SURFACE OR GROUND PLANE)
      // ============================================================================
      const pal = surfaceModel.atmospherePalette;
      const stormColors = resolveGasGiantStormColors(
        pal,
        surfaceModel.isSupercritical,
        surfaceModel.isIceGiant
      );
      const tileRgb = hexToRgb(activeTile.biomeColor || surfaceModel.skyHorizonHex);
      const nightCloudMult = isNight ? 0.36 : isSunset ? 0.86 : 1.0;

      // Paint sweeping perspective-projected zonal atmospheric bands in the deep gas envelope
      ctx.save();
      const bandCount = 9;
      for (let bIdx = -bandCount; bIdx <= bandCount; bIdx++) {
        const zBand = (bIdx / bandCount) * 1.85;
        const pLeft = project3D(-2.2, -0.18, zBand);
        const pRight = project3D(2.2, -0.18, zBand);
        const bandPhase = Math.sin(bIdx * 1.25 + meshData.tileSeed * 0.01) * 0.5 + 0.5;
        const bR = Math.round(
          (pal.bandDarkRgb[0] * (1 - bandPhase) + (pal.bandLightRgb[0] * 0.6 + tileRgb[0] * 0.4) * bandPhase) *
            nightCloudMult
        );
        const bG = Math.round(
          (pal.bandDarkRgb[1] * (1 - bandPhase) + (pal.bandLightRgb[1] * 0.6 + tileRgb[1] * 0.4) * bandPhase) *
            nightCloudMult
        );
        const bB = Math.round(
          (pal.bandDarkRgb[2] * (1 - bandPhase) + (pal.bandLightRgb[2] * 0.6 + tileRgb[2] * 0.4) * bandPhase) *
            nightCloudMult
        );

        const midX = (pLeft.sx + pRight.sx) * 0.5;
        const midY = (pLeft.sy + pRight.sy) * 0.5;
        const bandLen = Math.hypot(pRight.sx - pLeft.sx, pRight.sy - pLeft.sy) * 0.75;
        const bandThick = (34 + (bIdx % 2 === 0 ? 18 : 8)) * zoom * ((pLeft.persp + pRight.persp) * 0.5);
        const ang = Math.atan2(pRight.sy - pLeft.sy, pRight.sx - pLeft.sx);

        ctx.save();
        ctx.translate(midX, midY);
        ctx.rotate(ang);
        const bGrad = ctx.createRadialGradient(0, 0, bandThick * 0.1, 0, 0, Math.max(bandLen, bandThick));
        bGrad.addColorStop(0, `rgba(${bR}, ${bG}, ${bB}, 0.34)`);
        bGrad.addColorStop(0.65, `rgba(${bR}, ${bG}, ${bB}, 0.16)`);
        bGrad.addColorStop(1, `rgba(${bR}, ${bG}, ${bB}, 0)`);
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, bandLen, bandThick, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // If this tile is in or near a Gas Giant Storm, paint a deep swirling anticyclonic vortex glow in the cloud deck
      if ((activeTile.fractureIntensity || 0) > 0.16) {
        const ovalX = (hash2(activeTile.tileId, 31, meshData.tileSeed) - 0.5) * 0.36;
        const ovalZ = (hash2(activeTile.tileId, 47, meshData.tileSeed) - 0.5) * 0.30;
        const pCenter = project3D(ovalX, -0.05, ovalZ);
        const vRx = scale * (0.68 + (activeTile.fractureIntensity || 0) * 0.25) * pCenter.persp;
        const vRy = vRx * (0.48 + 0.36 * Math.sin(rotPitch));
        const stR = Math.round(stormColors.coreRgb[0] * nightCloudMult);
        const stG = Math.round(stormColors.coreRgb[1] * nightCloudMult);
        const stB = Math.round(stormColors.coreRgb[2] * nightCloudMult);
        const colR = Math.round(stormColors.collarRgb[0] * nightCloudMult);
        const colG = Math.round(stormColors.collarRgb[1] * nightCloudMult);
        const colB = Math.round(stormColors.collarRgb[2] * nightCloudMult);

        const vGrad = ctx.createRadialGradient(
          pCenter.sx,
          pCenter.sy,
          vRy * 0.08,
          pCenter.sx,
          pCenter.sy,
          Math.max(vRx, vRy)
        );
        vGrad.addColorStop(0, `rgba(${stR}, ${stG}, ${stB}, 0.55)`);
        vGrad.addColorStop(0.55, `rgba(${colR}, ${colG}, ${colB}, 0.32)`);
        vGrad.addColorStop(1, `rgba(${stR}, ${stG}, ${stB}, 0)`);
        ctx.fillStyle = vGrad;
        ctx.beginPath();
        ctx.ellipse(pCenter.sx, pCenter.sy, vRx, vRy, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Project & depth-sort all 3D colored cloud puffs
      const projectedPuffs = (showClouds3D ? cloudPuffs : [])
        .map((puff) => {
          const p = project3D(puff.x, puff.y, puff.z);
          return { puff, p };
        })
        .sort((a, b) => b.p.depth - a.p.depth);

      const drawCloudPuffItem = (puff: CloudPuff3D, p: ReturnType<typeof project3D>) => {
        const rxPx = puff.rx * scale * p.persp;
        const ryPx = puff.ry * scale * p.persp * (0.54 + 0.46 * Math.sin(rotPitch));
        const alpha = Math.min(0.92, puff.density * 0.84);

        const cR = puff.r ?? pal.cloudRgb[0];
        const cG = puff.g ?? pal.cloudRgb[1];
        const cB = puff.b ?? pal.cloudRgb[2];
        const uR = puff.baseR ?? pal.bandDarkRgb[0];
        const uG = puff.baseG ?? pal.bandDarkRgb[1];
        const uB = puff.baseB ?? pal.bandDarkRgb[2];

        const topR = Math.min(255, Math.round(cR * nightCloudMult + (isSunset ? 26 : 10)));
        const topG = Math.min(255, Math.round(cG * nightCloudMult - (isSunset ? 8 : 0)));
        const topB = Math.min(255, Math.round(cB * nightCloudMult - (isSunset ? 22 : 0)));
        const baseR = Math.max(0, Math.round(uR * nightCloudMult));
        const baseG = Math.max(0, Math.round(uG * nightCloudMult));
        const baseB = Math.max(0, Math.round(uB * nightCloudMult));

        const grad = ctx.createRadialGradient(
          p.sx - rxPx * 0.22 * lx,
          p.sy - ryPx * 0.30,
          ryPx * 0.12,
          p.sx,
          p.sy,
          Math.max(rxPx, ryPx)
        );
        grad.addColorStop(0, `rgba(${topR}, ${topG}, ${topB}, ${alpha.toFixed(2)})`);
        grad.addColorStop(0.58, `rgba(${baseR}, ${baseG}, ${baseB}, ${(alpha * 0.72).toFixed(2)})`);
        grad.addColorStop(1, `rgba(${baseR}, ${baseG}, ${baseB}, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(p.sx, p.sy, rxPx, ryPx, 0, 0, Math.PI * 2);
        ctx.fill();

        // Deep convective storm lightning illumination inside storm eyewall / supercell clouds
        if (puff.hasLightning) {
          const lGrad = ctx.createRadialGradient(p.sx, p.sy, 1, p.sx, p.sy, rxPx * 0.62);
          lGrad.addColorStop(0, 'rgba(224, 242, 254, 0.55)');
          lGrad.addColorStop(0.45, 'rgba(125, 211, 252, 0.22)');
          lGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
          ctx.fillStyle = lGrad;
          ctx.beginPath();
          ctx.ellipse(p.sx, p.sy, rxPx * 0.62, ryPx * 0.62, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      // Render lower & mid-troposphere colored cloud decks first
      ctx.save();
      for (let i = 0; i < projectedPuffs.length; i++) {
        if (projectedPuffs[i].puff.y <= 0.06) {
          drawCloudPuffItem(projectedPuffs[i].puff, projectedPuffs[i].p);
        }
      }
      ctx.restore();

      // Draw floating Goldberg Hex/Pentagon tile boundary contour suspended in the cloud deck
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < pLen; i++) {
        const v = vertices[perimeterIndices[i].vIdx];
        const p = project3D(v.x, 0, v.z);
        if (i === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // Render upper bright colored cloud canopy & storm vortex plumes above the tile frame
      ctx.save();
      for (let i = 0; i < projectedPuffs.length; i++) {
        if (projectedPuffs[i].puff.y > 0.06) {
          drawCloudPuffItem(projectedPuffs[i].puff, projectedPuffs[i].p);
        }
      }
      ctx.restore();
    } else {
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

      const isTholinWorldSpec =
        surfaceModel.seaPalette.solventKey === 'NH3-H2O' ||
        surfaceModel.seaPalette.solventKey === 'CH4-C2H6' ||
        surfaceModel.compositionPalette.compositionLabel.includes('Tholin');

      rasterizeTileTerrain({
        ctx,
        offCanvas,
        zBuffer,
        colorBuffer,
        imageData: imgData,
        width: W,
        height: H,
        triangles,
        vertices,
        projVerts: vertices.map((v) => project3D(v.x, v.y, v.z)),
        texData: {
          TEX_RES,
          texR,
          texG,
          texB,
          texBumpX,
          texBumpZ,
          texFlags,
          texCloudShadow,
          MIP_RES,
          mipR,
          mipG,
          mipB,
          mipBumpX,
          mipBumpZ,
        },
        lighting: {
          lx,
          ly,
          lz,
          halfX,
          halfY,
          halfZ,
          isNight,
          verticalExag,
          cloudShadowStrength: showClouds3D ? Math.min(0.42, surfaceModel.cloudOpacity * 0.48) : 0,
        },
        camera: {
          cx,
          cy,
          scale,
          camDist,
          sinY,
          cosY,
          sinP,
          cosP,
        },
        atmosphere: {
          hasAtmosphere,
          atmoDensityFactor,
          hazeRgb: hazeRgb as [number, number, number],
          isTholinWorldSpec,
        },
      });

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

          {onToggleFlora && (
            <button
              type="button"
              onClick={onToggleFlora}
              className={`px-2 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
                isFloraOpen
                  ? 'bg-emerald-900/80 border-emerald-400 text-emerald-200 shadow-sm'
                  : 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300 hover:text-white hover:bg-emerald-900/50'
              }`}
              title="Toggle Tile Indigenous Xenoflora & Species Catalog"
            >
              <Sprout className="w-3 h-3 text-emerald-400" />
              Tile Flora
            </button>
          )}

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
            if (dragRafRef.current !== null) {
              cancelAnimationFrame(dragRafRef.current);
            }
            dragRafRef.current = requestAnimationFrame(() => {
              if (!dragRef.current) return;
              setRotYaw(dragRef.current.startYaw - dx * 0.0085);
              setRotPitch(Math.max(0.18, Math.min(1.28, dragRef.current.startPitch + dy * 0.0065)));
              dragRafRef.current = null;
            });
          }}
          onMouseUp={() => {
            if (dragRafRef.current !== null) {
              cancelAnimationFrame(dragRafRef.current);
              dragRafRef.current = null;
            }
            setIsDragging(false);
            dragRef.current = null;
          }}
          onMouseLeave={() => {
            if (dragRafRef.current !== null) {
              cancelAnimationFrame(dragRafRef.current);
              dragRafRef.current = null;
            }
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
                  onClick={() => {
                    React.startTransition(() => {
                      onSelectTile(nb.tile);
                    });
                  }}
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
