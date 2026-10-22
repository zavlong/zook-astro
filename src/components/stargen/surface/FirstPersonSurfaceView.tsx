import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Sun,
  Cloud,
  Navigation,
  RotateCcw,
  Eye,
  Footprints,
  Plane,
  Hexagon,
  Layers,
  Sprout,
  Maximize2,
  Minimize2,
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
import { getStarSpectralPalette } from '../../../core/generation/starAssets';
import {
  FLAG_WATER,
  FLAG_LAVA,
  FLAG_ICE_SPEC,
  hexToRgb,
  hash2,
  isotropicNoise2D,
  fbm2D,
  ridgedFbm2D,
} from './terrainNoise';
import { evaluateDetailedBiomeTexel } from './detailedBiomeTextures';
import { onBiomeTexturesLoaded } from '../../../core/textures/biomeTextureAtlas';

interface FirstPersonSurfaceViewProps {
  surfaceModel: PlanetarySurfaceModel;
  goldbergGrid: PlanetaryGoldbergGrid;
  activeTile: GoldbergPlanetaryTile;
  planet: RealisticPlanetBody;
  moon?: RealisticMoon | null;
  timeOfDayDeg: number;
  onChangeTimeOfDay: (deg: number) => void;
  onSelectTile: (tile: GoldbergPlanetaryTile) => void;
  onSwitchToBlockView: () => void;
  onToggleFlora?: () => void;
  isFloraOpen?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

type CameraHeightMode = 'walk' | 'skim' | 'flight';


function compassLabelFromAzimuth(azDeg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((azDeg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

// Fold coordinate into [-1, 1] with smooth triangle wave so terrain tiles infinitely without seams
function foldMirror(v: number): number {
  const period = 4.0; // maps [-1, 1] -> [1, -1] smoothly
  const m = ((v + 1.0) % period + period) % period;
  return m <= 2.0 ? m - 1.0 : 3.0 - m;
}

function foldMirrorWithSign(v: number): { val: number; sign: number } {
  const period = 4.0;
  const m = ((v + 1.0) % period + period) % period;
  return m <= 2.0 ? { val: m - 1.0, sign: 1.0 } : { val: 3.0 - m, sign: -1.0 };
}

export const FirstPersonSurfaceView: React.FC<FirstPersonSurfaceViewProps> = ({
  surfaceModel,
  goldbergGrid,
  activeTile,
  planet,
  moon,
  timeOfDayDeg,
  onChangeTimeOfDay,
  onSelectTile,
  onSwitchToBlockView,
  onToggleFlora,
  isFloraOpen,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const colorBufferRef = useRef<Uint32Array | null>(null);

  const [heightMode, setHeightMode] = useState<CameraHeightMode>('walk');
  const [showClouds, setShowClouds] = useState<boolean>(true);
  const [showGeologyPanel, setShowGeologyPanel] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [hudHeadingDeg, setHudHeadingDeg] = useState<number>(0);
  const [textureVersion, setTextureVersion] = useState<number>(0);

  useEffect(() => {
    return onBiomeTexturesLoaded(() => {
      setTextureVersion((v) => v + 1);
    });
  }, []);

  // Mutable camera state for 60fps smooth first-person navigation
  const camRef = useRef<{
    x: number;
    z: number;
    y: number;
    yaw: number; // radians, 0 = North (+z)
    pitch: number; // radians, 0 = level horizon
    velForward: number;
    velStrafe: number;
  }>({
    x: 0.0,
    z: -0.25,
    y: 0.1,
    yaw: 0.25,
    pitch: -0.06,
    velForward: 0,
    velStrafe: 0,
  });

  const keysRef = useRef<Set<string>>(new Set());
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startYaw: number;
    startPitch: number;
    moved: boolean;
  } | null>(null);
  const beaconRectsRef = useRef<
    { x: number; y: number; w: number; h: number; tile: GoldbergPlanetaryTile }[]
  >([]);

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

  // Precompute 1024x1024 High-Resolution Terrain Heightfield, Albedo Texture, Normal Map & Cloud Map
  const terrainData = useMemo(() => {
    const TEX_RES = 1024;
    const tileSeed = (surfaceModel.seed * 1664525 + activeTile.tileId * 1013904223) & 0x7fffffff;

    const heightMap = new Float32Array(TEX_RES * TEX_RES);
    const texR = new Uint8Array(TEX_RES * TEX_RES);
    const texG = new Uint8Array(TEX_RES * TEX_RES);
    const texB = new Uint8Array(TEX_RES * TEX_RES);
    const normXMap = new Int8Array(TEX_RES * TEX_RES);
    const normZMap = new Int8Array(TEX_RES * TEX_RES);
    const flagsMap = new Uint8Array(TEX_RES * TEX_RES);
    const cloudMap = new Uint8Array(TEX_RES * TEX_RES);

    // Primary and optional Secondary (ecotone crossing) biome IDs
    const bId1 = activeTile.biomeId;
    const bId2 = activeTile.secondaryBiomeId;
    const hasSecondaryBiome = bId2 !== null && bId2 !== bId1 && !surfaceModel.isNoSurface;

    // Build neighbor-aware spatial evaluator aligned with the compass azimuths of bordering tiles (0 = North/+z, 90 = East/+x)
    const neighborEntries = neighborTiles.map((nb) => {
      const azRad = (nb.azimuthDeg * Math.PI) / 180;
      return {
        tile: nb.tile,
        dirX: Math.sin(azRad),
        dirZ: Math.cos(azRad),
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
    const anyOceanBiome = isBiomeOcean(bId1) || (bId2 !== null && isBiomeOcean(bId2));
    const isPureOceanTile = isBiomeOcean(bId1) && (bId2 === null || isBiomeOcean(bId2));
    const hasAlgalSeaBiome = bId1 === 23 || bId2 === 23;

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

    // Local multi-scale craters (hero basins + secondary craters)
    const craters: { cx: number; cz: number; rad: number; depth: number; hasCentralPeak: boolean }[] = [];
    if (effCraterIntensity > 0.02) {
      const heroCount = effCraterIntensity > 0.55 ? 3 : effCraterIntensity > 0.22 ? 2 : 1;
      const craterPrefersSecondary =
        hasSecondaryBiome && bId2 !== null && (bId2 === 16 || (isBiomeOcean(bId1) && !isBiomeOcean(bId2)));
      const craterBiasSector =
        hasSecondaryBiome && bId2 !== null && (isBiomeOcean(bId1) !== isBiomeOcean(bId2) || bId1 === 16 || bId2 === 16);
      for (let h = 0; h < heroCount; h++) {
        const angle = hash2(h, 11, tileSeed) * Math.PI * 2;
        const dist = (0.18 + hash2(h, 12, tileSeed) * 0.46) * (h === 0 ? 0.8 : 1.0);
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
        const dist = Math.sqrt(hash2(c, 2, tileSeed)) * 0.85;
        const rad = 0.05 + Math.pow(hash2(c, 3, tileSeed), 1.35) * 0.145;
        craters.push({
          cx: Math.cos(angle) * dist,
          cz: Math.sin(angle) * dist,
          rad,
          depth: rad * (0.38 + hash2(c, 4, tileSeed) * 0.24),
          hasCentralPeak: rad > 0.13,
        });
      }
    }

    // Volcanic cones
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
        const vDist = v === 0 ? 0.28 : 0.42 + hash2(v, 19, tileSeed) * 0.35;
        const vAng = hash2(v, 23, tileSeed) * Math.PI * 2;
        const spot =
          volcIsSecondaryOnly || volcIsPrimaryOnly
            ? pickPreferredFeatureSpot(volcIsSecondaryOnly, vAng, vDist)
            : { x: Math.cos(vAng) * vDist, z: Math.sin(vAng) * vDist };
        volcanicCones.push({
          vx: spot.x,
          vz: spot.z,
          rad: v === 0 ? 0.34 : 0.2 + hash2(v, 29, tileSeed) * 0.12,
          height: v === 0 ? 0.42 : 0.25 + hash2(v, 31, tileSeed) * 0.12,
        });
      }
    }

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
    const alluvialRgb = hexToRgb(surfaceModel.compositionPalette.alluvialHex);
    const iceRgb = hexToRgb(surfaceModel.compositionPalette.iceHex);
    const marshRgb = hexToRgb(surfaceModel.floraPalette.marshHex);
    const plainsRgb = hexToRgb(surfaceModel.floraPalette.plainsHex);

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
        const seamount = ridge > 0.72 ? (ridge - 0.72) * 0.25 : 0;
        return Math.min(-0.028, Math.min(-0.035, macroH * 0.48) + (baseFbm - 0.52) * 0.18 + seamount + fine * 0.018);
      }

      let h = Math.max(0.065, macroH * 0.52 + 0.065);

      if (bId === 12 || bId === 13) {
        h += ridge * 0.38 + baseFbm * 0.16 - 0.06 + fine * 0.045;
      } else if (bId === 11) {
        const raw = baseFbm * 1.18 + fine * 0.08;
        const steps = 5;
        const stepped = (Math.floor(raw * steps) + Math.pow((raw * steps) % 1, 3.5)) / steps;
        const gorge = Math.abs(wx * 0.85 - wz * 0.52 + Math.sin(wz * 4.5) * 0.14);
        const gorgeCarve = gorge < 0.13 ? (1.0 - Math.pow(gorge / 0.13, 2)) * 0.16 : 0;
        h += (stepped - 0.24) * 0.32 - gorgeCarve;
      } else if (bId === 10) {
        const dunePhase = px * 22.0 + pz * 9.0 + Math.sin(pz * 7.5 + baseFbm * 4.0) * 2.6;
        const duneWave = Math.pow(Math.sin(dunePhase) * 0.5 + 0.5, 1.65);
        const yardang = ridge > 0.72 ? (ridge - 0.72) * 0.45 : 0;
        h += (baseFbm - 0.42) * 0.14 + duneWave * 0.065 + yardang;
      } else if (bId === 18) {
        const sastrugi = Math.sin(px * 26 + baseFbm * 5) * 0.012;
        h = 0.055 + (ridge - 0.4) * 0.065 + sastrugi;
      } else if (bId === 8 || bId === 21) {
        const sastrugi = Math.sin(px * 20 - pz * 12 + baseFbm * 4) * 0.015;
        h += (baseFbm - 0.42) * 0.16 + ridge * 0.09 + sastrugi;
      } else {
        h += (baseFbm - 0.42) * 0.20 + (ridge - 0.42) * 0.10 + fine * 0.026;
      }
      return Math.max(0.032, h);
    };

    const sampleMacroTerrain = (px: number, pz: number) => {
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

      const oceanWeightAtPoint =
        (isBiomeOcean(bId1) ? 1 - biomeMix : 0) + (bId2 !== null && isBiomeOcean(bId2) ? biomeMix : 0);
      const oceanWeight = !surfaceModel.isNoSurface && anyOceanBiome ? oceanWeightAtPoint : 0;
      const isOceanPoint = oceanWeight >= 0.45;
      if (!isOceanPoint) {
        hLocal = Math.max(0.025, hLocal + borderReliefBoost * (0.35 + 0.65 * ridge));
      }

      let craterRimTint = 0;
      let craterBowlTint = 0;
      if (!isOceanPoint) {
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
                lavaWeight = Math.max(lavaWeight, Math.min(1, (0.16 - uv) / 0.05));
              }
            } else {
              const cone = Math.pow(Math.max(0, 1.0 - (uv - 0.20) / 1.35), 1.65);
              hLocal += vc.height * cone;
              const lavaAng = Math.atan2(pz - vc.vz, px - vc.vx);
              const flowChannel = Math.sin(lavaAng * 4 + dv * 14 + baseFbm * 5);
              if (flowChannel > 0.70 && uv < 1.15) {
                lavaWeight = Math.max(lavaWeight, Math.min(1, (flowChannel - 0.70) / 0.15));
              }
            }
          }
        }
      }

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
            fissureWeight = Math.min(1, (0.032 - fissureCurve) / 0.014);
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

    const MACRO_N = 385;
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
    const macroDhxGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroDhzGrid = new Float32Array(MACRO_N * MACRO_N);

    for (let mz = 0; mz < MACRO_N; mz++) {
      const pz = (mz / (MACRO_N - 1)) * 2.0 - 1.0;
      for (let mx = 0; mx < MACRO_N; mx++) {
        const px = (mx / (MACRO_N - 1)) * 2.0 - 1.0;
        const mIdx = mz * MACRO_N + mx;
        const sh = sampleMacroTerrain(px, pz);
        macroHGrid[mIdx] = sh.hLocal;
        macroFbmGrid[mIdx] = sh.baseFbm;
        macroRidgeGrid[mIdx] = sh.ridge;
        macroRimGrid[mIdx] = sh.craterRimTint;
        macroBowlGrid[mIdx] = sh.craterBowlTint;
        macroShadowGrid[mIdx] = sampleCloudDensityAt(px, pz);
        macroMixGrid[mIdx] = sh.biomeMix;
        macroOceanGrid[mIdx] = sh.oceanWeight;
        macroLavaGrid[mIdx] = sh.lavaWeight;
        macroFissureGrid[mIdx] = sh.fissureWeight;
      }
    }

    // Precompute smooth central-difference macro slopes at each vertex so bilinear interpolation is C1-continuous across cell borders
    const stepScale = (MACRO_N - 1) * 0.25;
    for (let mz = 0; mz < MACRO_N; mz++) {
      const mzPrev = Math.max(0, mz - 1);
      const mzNext = Math.min(MACRO_N - 1, mz + 1);
      for (let mx = 0; mx < MACRO_N; mx++) {
        const mxPrev = Math.max(0, mx - 1);
        const mxNext = Math.min(MACRO_N - 1, mx + 1);
        const mIdx = mz * MACRO_N + mx;
        macroDhxGrid[mIdx] = (macroHGrid[mz * MACRO_N + mxNext] - macroHGrid[mz * MACRO_N + mxPrev]) * stepScale;
        macroDhzGrid[mIdx] = (macroHGrid[mzNext * MACRO_N + mx] - macroHGrid[mzPrev * MACRO_N + mx]) * stepScale;
      }
    }

    const isVolcanicAny = bId1 === 15 || bId2 === 15 || surfaceModel.isMoltenWorld;

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
      baseNx: number,
      baseNz: number,
      isFissureFloor: boolean
    ): { r: number; g: number; b: number; nx: number; nz: number; hDelta: number; flags: number } => {
      const res = evaluateDetailedBiomeTexel({
        biomeId: targetBiomeId,
        baseRgb: targetBaseRgb,
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
        fine3: grain,
        grain,
        baseBumpX: baseNx,
        baseBumpZ: baseNz,
        fissureWeight: isFissureFloor ? 0.85 : 0,
        tileSeed,
        surfaceModel,
        craterIntensity: activeTile.craterIntensity,
        isFirstPerson: true,
      });

      return {
        r: res.r,
        g: res.g,
        b: res.b,
        nx: res.bumpX,
        nz: res.bumpZ,
        hDelta: res.hDelta,
        flags: res.flags,
      };
    };

    for (let tz = 0; tz < TEX_RES; tz++) {
      const vNorm = tz / (TEX_RES - 1);
      const pz = vNorm * 2.0 - 1.0;
      const mfz = vNorm * (MACRO_N - 1);
      const miz = Math.min(MACRO_N - 2, Math.floor(mfz));
      const fz = mfz - miz;
      // Quintic C2 Perlin interpolation eliminates C0/C1 derivative kinks across MACRO_N cell rows
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

        let hLocal =
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

        // Smooth quintic interpolation of vertex-centered central-difference slopes so macro grid boundaries are invisible
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

        // Smooth quintic interpolation of special feature weights (eliminates blocky MACRO_N cell boundaries)
        const oceanW =
          macroOceanGrid[i00] * w00 +
          macroOceanGrid[i10] * w10 +
          macroOceanGrid[i01] * w01 +
          macroOceanGrid[i11] * w11;
        const lavaW =
          macroLavaGrid[i00] * w00 +
          macroLavaGrid[i10] * w10 +
          macroLavaGrid[i01] * w01 +
          macroLavaGrid[i11] * w11;
        const fissureW =
          macroFissureGrid[i00] * w00 +
          macroFissureGrid[i10] * w10 +
          macroFissureGrid[i01] * w01 +
          macroFissureGrid[i11] * w11;

        const isLavaSpecial = lavaW > 0.35;
        const isFissureFloor = fissureW > 0.35;
        const isOceanPoint = oceanW >= 0.45;

        // Smooth continuous isotropic micro-noise with softened high-frequency grain
        const fine1 = isotropicNoise2D(px * 24.0, pz * 24.0, tileSeed + 313);
        const fine2 = isotropicNoise2D(px * 56.0, pz * 56.0, tileSeed + 419);
        const fine3 = isotropicNoise2D(px * 112.0, pz * 112.0, tileSeed + 521);
        const grain = (fine3 - 0.5) * 0.34 + (fine2 - 0.5) * 0.24;

        // Symmetric central finite difference for micro-bump normals (zero directional bias)
        const fineRight = isotropicNoise2D((px + 0.005) * 24.0, pz * 24.0, tileSeed + 313);
        const fineLeft = isotropicNoise2D((px - 0.005) * 24.0, pz * 24.0, tileSeed + 313);
        const fineDown = isotropicNoise2D(px * 24.0, (pz + 0.005) * 24.0, tileSeed + 313);
        const fineUp = isotropicNoise2D(px * 24.0, (pz - 0.005) * 24.0, tileSeed + 313);
        let nx = -dhx * 0.6 + (fineLeft - fineRight) * 1.05;
        let nz = -dhz * 0.6 + (fineUp - fineDown) * 1.05;

        let r = baseRgb1[0];
        let g = baseRgb1[1];
        let b = baseRgb1[2];
        let flags = 0;

        if (surfaceModel.isNoSurface) {
          const pal = surfaceModel.atmospherePalette;
          const sc = resolveGasGiantStormColors(
            pal,
            surfaceModel.isSupercritical,
            surfaceModel.isIceGiant
          );
          const stormInt = activeTile.fractureIntensity || 0;
          const dxV = px * 0.85;
          const dzV = pz * 1.15;
          const rV = Math.hypot(dxV, dzV);
          const thetaV = Math.atan2(dzV, dxV);
          const spinDir = activeTile.centerLat >= 0 ? -1 : 1;
          const vortexWeight =
            stormInt > 0.14 && rV < 0.85
              ? Math.pow(1.0 - rV / 0.85, 1.25) * Math.min(1.0, 0.45 + stormInt * 0.75)
              : 0;
          const spiralWave = Math.sin(thetaV * 2.0 + spinDir * rV * 11.0 + fine1 * 3.8) * 0.5 + 0.5;
          const swirl = Math.sin(pz * 18 + fine1 * 3.5 + fine2 * 1.2) * 0.5 + 0.5;

          r = Math.round(pal.bandDarkRgb[0] + (pal.bandLightRgb[0] - pal.bandDarkRgb[0]) * swirl);
          g = Math.round(pal.bandDarkRgb[1] + (pal.bandLightRgb[1] - pal.bandDarkRgb[1]) * swirl);
          b = Math.round(pal.bandDarkRgb[2] + (pal.bandLightRgb[2] - pal.bandDarkRgb[2]) * swirl);

          if (vortexWeight > 0.03) {
            const stR = sc.coreRgb[0] * (1 - spiralWave * 0.45) + sc.collarRgb[0] * (spiralWave * 0.45);
            const stG = sc.coreRgb[1] * (1 - spiralWave * 0.45) + sc.collarRgb[1] * (spiralWave * 0.45);
            const stB = sc.coreRgb[2] * (1 - spiralWave * 0.45) + sc.collarRgb[2] * (spiralWave * 0.45);
            r = Math.round(r * (1 - vortexWeight) + stR * vortexWeight);
            g = Math.round(g * (1 - vortexWeight) + stG * vortexWeight);
            b = Math.round(b * (1 - vortexWeight) + stB * vortexWeight);
          }
        } else {
          const hasSeaHere = isOceanPoint && hLocal < 0;
          const waterDepth = hasSeaHere ? Math.max(0, -hLocal) : 0;

          if (isLavaSpecial || (isFissureFloor && isVolcanicAny)) {
            const crustCrack = isotropicNoise2D(px * 45, pz * 45, tileSeed + 601);
            if (crustCrack > 0.32) {
              const hot = Math.min(1, (crustCrack - 0.32) / 0.55);
              r = 255;
              g = Math.round(115 + 125 * hot);
              b = Math.round(15 + 95 * hot * hot);
              flags |= FLAG_LAVA;
            } else {
              r = Math.round(basaltRgb[0] * 0.55 + 45);
              g = Math.round(basaltRgb[1] * 0.45 + 15);
              b = Math.round(basaltRgb[2] * 0.45 + 10);
            }
          } else if (hasSeaHere) {
            flags |= FLAG_WATER;
            hLocal = 0; // Flatten surface to sea level
            const pal = surfaceModel.seaPalette;
            const depthT = Math.min(1, waterDepth / 0.25);

            if (surfaceModel.isMoltenWorld || pal.solventKey === 'Silicate Magma') {
              const lavaWave = Math.sin(px * 52 + pz * 38 + fine1 * 5) * 0.5 + 0.5;
              r = Math.round(255 - depthT * 40);
              g = Math.round(145 + lavaWave * 55 - depthT * 70);
              b = Math.round(18 + lavaWave * 28);
              flags |= FLAG_LAVA;
            } else {
              const wPhase1 = px * 66.0 + pz * 38.0 + fine1 * 4.0;
              const wPhase2 = px * 42.0 - pz * 70.0 + fine2 * 3.4;
              nx = Math.cos(wPhase1) * 0.42 + Math.cos(wPhase2) * 0.28;
              nz = Math.sin(wPhase1) * 0.42 - Math.sin(wPhase2) * 0.28;

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

              // Photosynthetic Algal Sea / Kelp Reef swirls on worlds with life
              if (surfaceModel.floraPalette.hasAnyLife && (hasAlgalSeaBiome || waterDepth < 0.14)) {
                const swirlWave =
                  Math.sin(px * 26.0 + pz * 19.0 + baseFbm * 6.5 + fine1 * 3.2) * 0.5 + 0.5;
                const filament = Math.pow(swirlWave, 1.5) * (0.4 + 0.6 * fine2);
                const bloomStrength =
                  (hasAlgalSeaBiome ? 0.68 : 0.36) *
                  Math.max(0.15, 1.0 - depthT * 0.72) *
                  (0.35 + 0.65 * filament);
                const algalR = Math.round(marshRgb[0] * 0.55 + plainsRgb[0] * 0.45);
                const algalG = Math.min(255, Math.round(marshRgb[1] * 0.55 + plainsRgb[1] * 0.45 + 18));
                const algalB = Math.round(marshRgb[2] * 0.55 + sh[2] * 0.45);
                r = Math.round(r * (1 - bloomStrength) + algalR * bloomStrength);
                g = Math.round(g * (1 - bloomStrength) + algalG * bloomStrength);
                b = Math.round(b * (1 - bloomStrength) + algalB * bloomStrength);
              }

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
              nx,
              nz,
              isFissureFloor
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
                nx,
                nz,
                isFissureFloor
              );
              const microMix = Math.max(0, Math.min(1, biomeMix + (fine1 - 0.5) * 0.28));
              r = Math.round(s1.r * (1 - microMix) + s2.r * microMix);
              g = Math.round(s1.g * (1 - microMix) + s2.g * microMix);
              b = Math.round(s1.b * (1 - microMix) + s2.b * microMix);
              nx = s1.nx * (1 - microMix) + s2.nx * microMix;
              nz = s1.nz * (1 - microMix) + s2.nz * microMix;
              hLocal += s1.hDelta * (1 - microMix) + s2.hDelta * microMix;
              flags = microMix > 0.5 ? s2.flags : s1.flags;
            } else {
              r = s1.r;
              g = s1.g;
              b = s1.b;
              nx = s1.nx;
              nz = s1.nz;
              hLocal += s1.hDelta;
              flags = s1.flags;
            }

            // High-altitude alpine snowline
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

        // Smoothly taper normal perturbations to 0 at the tile perimeter (|px|,|pz| -> 1) so mirror-folded tiles have zero lighting seam
        const edgeFadeX = Math.abs(px) > 0.88 ? Math.max(0, (1.0 - Math.abs(px)) / 0.12) : 1.0;
        const edgeFadeZ = Math.abs(pz) > 0.88 ? Math.max(0, (1.0 - Math.abs(pz)) / 0.12) : 1.0;
        nx *= edgeFadeX * edgeFadeX * (3 - 2 * edgeFadeX);
        nz *= edgeFadeZ * edgeFadeZ * (3 - 2 * edgeFadeZ);

        const tIdx = tz * TEX_RES + tx;
        heightMap[tIdx] = hLocal;
        texR[tIdx] = Math.max(0, Math.min(255, r));
        texG[tIdx] = Math.max(0, Math.min(255, g));
        texB[tIdx] = Math.max(0, Math.min(255, b));
        normXMap[tIdx] = Math.max(-127, Math.min(127, Math.round(nx * 42)));
        normZMap[tIdx] = Math.max(-127, Math.min(127, Math.round(nz * 42)));
        flagsMap[tIdx] = flags;
        cloudMap[tIdx] = Math.max(0, Math.min(255, Math.round(cShadow * 255)));
      }
    }

    // Apply a 3x3 binomial smoothing filter across heightMap, texR/G/B, and normX/ZMap to eliminate micro-aliasing & ridges
    const smoothH = new Float32Array(TEX_RES * TEX_RES);
    const smoothR = new Uint8Array(TEX_RES * TEX_RES);
    const smoothG = new Uint8Array(TEX_RES * TEX_RES);
    const smoothB = new Uint8Array(TEX_RES * TEX_RES);
    const smoothNX = new Int8Array(TEX_RES * TEX_RES);
    const smoothNZ = new Int8Array(TEX_RES * TEX_RES);
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
        smoothH[i11] =
          (heightMap[i00] + heightMap[i20] + heightMap[i02] + heightMap[i22] +
            (heightMap[i10] + heightMap[i01] + heightMap[i21] + heightMap[i12]) * 2 +
            heightMap[i11] * 4) *
          (1 / 16);
        smoothR[i11] = (texR[i00] + texR[i20] + texR[i02] + texR[i22] + (texR[i10] + texR[i01] + texR[i21] + texR[i12]) * 2 + texR[i11] * 8 + 10) / 20;
        smoothG[i11] = (texG[i00] + texG[i20] + texG[i02] + texG[i22] + (texG[i10] + texG[i01] + texG[i21] + texG[i12]) * 2 + texG[i11] * 8 + 10) / 20;
        smoothB[i11] = (texB[i00] + texB[i20] + texB[i02] + texB[i22] + (texB[i10] + texB[i01] + texB[i21] + texB[i12]) * 2 + texB[i11] * 8 + 10) / 20;
        smoothNX[i11] = Math.round((normXMap[i00] + normXMap[i20] + normXMap[i02] + normXMap[i22] + (normXMap[i10] + normXMap[i01] + normXMap[i21] + normXMap[i12]) * 2 + normXMap[i11] * 4) / 16);
        smoothNZ[i11] = Math.round((normZMap[i00] + normZMap[i20] + normZMap[i02] + normZMap[i22] + (normZMap[i10] + normZMap[i01] + normZMap[i21] + normZMap[i12]) * 2 + normZMap[i11] * 4) / 16);
      }
    }
    heightMap.set(smoothH);
    texR.set(smoothR);
    texG.set(smoothG);
    texB.set(smoothB);
    normXMap.set(smoothNX);
    normZMap.set(smoothNZ);

    // Precompute a 2-level mipmap pyramid (512x512 and 256x256) for trilinear distance filtering in First-Person View
    const MIP1_RES = TEX_RES >> 1;
    const mip1R = new Uint8Array(MIP1_RES * MIP1_RES);
    const mip1G = new Uint8Array(MIP1_RES * MIP1_RES);
    const mip1B = new Uint8Array(MIP1_RES * MIP1_RES);
    const mip1NX = new Int8Array(MIP1_RES * MIP1_RES);
    const mip1NZ = new Int8Array(MIP1_RES * MIP1_RES);
    for (let mz = 0; mz < MIP1_RES; mz++) {
      const r0 = (mz * 2) * TEX_RES;
      const r1 = (mz * 2 + 1) * TEX_RES;
      const mRow = mz * MIP1_RES;
      for (let mx = 0; mx < MIP1_RES; mx++) {
        const c0 = mx * 2;
        const c1 = c0 + 1;
        const mIdx = mRow + mx;
        mip1R[mIdx] = (texR[r0 + c0] + texR[r0 + c1] + texR[r1 + c0] + texR[r1 + c1] + 2) >> 2;
        mip1G[mIdx] = (texG[r0 + c0] + texG[r0 + c1] + texG[r1 + c0] + texG[r1 + c1] + 2) >> 2;
        mip1B[mIdx] = (texB[r0 + c0] + texB[r0 + c1] + texB[r1 + c0] + texB[r1 + c1] + 2) >> 2;
        mip1NX[mIdx] = (normXMap[r0 + c0] + normXMap[r0 + c1] + normXMap[r1 + c0] + normXMap[r1 + c1]) >> 2;
        mip1NZ[mIdx] = (normZMap[r0 + c0] + normZMap[r0 + c1] + normZMap[r1 + c0] + normZMap[r1 + c1]) >> 2;
      }
    }

    const MIP2_RES = MIP1_RES >> 1;
    const mip2R = new Uint8Array(MIP2_RES * MIP2_RES);
    const mip2G = new Uint8Array(MIP2_RES * MIP2_RES);
    const mip2B = new Uint8Array(MIP2_RES * MIP2_RES);
    const mip2NX = new Int8Array(MIP2_RES * MIP2_RES);
    const mip2NZ = new Int8Array(MIP2_RES * MIP2_RES);
    for (let mz = 0; mz < MIP2_RES; mz++) {
      const r0 = (mz * 2) * MIP1_RES;
      const r1 = (mz * 2 + 1) * MIP1_RES;
      const mRow = mz * MIP2_RES;
      for (let mx = 0; mx < MIP2_RES; mx++) {
        const c0 = mx * 2;
        const c1 = c0 + 1;
        const mIdx = mRow + mx;
        mip2R[mIdx] = (mip1R[r0 + c0] + mip1R[r0 + c1] + mip1R[r1 + c0] + mip1R[r1 + c1] + 2) >> 2;
        mip2G[mIdx] = (mip1G[r0 + c0] + mip1G[r0 + c1] + mip1G[r1 + c0] + mip1G[r1 + c1] + 2) >> 2;
        mip2B[mIdx] = (mip1B[r0 + c0] + mip1B[r0 + c1] + mip1B[r1 + c0] + mip1B[r1 + c1] + 2) >> 2;
        mip2NX[mIdx] = (mip1NX[r0 + c0] + mip1NX[r0 + c1] + mip1NX[r1 + c0] + mip1NX[r1 + c1]) >> 2;
        mip2NZ[mIdx] = (mip1NZ[r0 + c0] + mip1NZ[r0 + c1] + mip1NZ[r1 + c0] + mip1NZ[r1 + c1]) >> 2;
      }
    }

    return {
      TEX_RES,
      heightMap,
      texR,
      texG,
      texB,
      normXMap,
      normZMap,
      flagsMap,
      cloudMap,
      MIP1_RES,
      mip1R,
      mip1G,
      mip1B,
      mip1NX,
      mip1NZ,
      MIP2_RES,
      mip2R,
      mip2G,
      mip2B,
      mip2NX,
      mip2NZ,
      effCloudCover,
    };
  }, [surfaceModel, activeTile, neighborTiles, pBarAtmo, hasAtmosphere, textureVersion]);

  // Keyboard listener for WASD / Arrow movement
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        keysRef.current.add(e.code);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Real-time 60fps First-Person 3D Raycasted Terrain + Volumetric Sky & Clouds Loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const {
      TEX_RES,
      heightMap,
      texR,
      texG,
      texB,
      normXMap,
      normZMap,
      flagsMap,
      cloudMap,
      MIP1_RES,
      mip1R,
      mip1G,
      mip1B,
      mip1NX,
      mip1NZ,
      MIP2_RES,
      mip2R,
      mip2G,
      mip2B,
      mip2NX,
      mip2NZ,
    } = terrainData;
    const texMax = TEX_RES - 1;
    const mip1Max = MIP1_RES - 1;
    const mip2Max = MIP2_RES - 1;

    const sampleBilinearHeight = (wx: number, wz: number): number => {
      const fx = (foldMirror(wx) * 0.5 + 0.5) * texMax;
      const fz = (foldMirror(wz) * 0.5 + 0.5) * texMax;
      const ix = fx | 0;
      const iz = fz | 0;
      const ux = fx - ix;
      const uz = fz - iz;
      const sux = ux * ux * (3 - 2 * ux);
      const suz = uz * uz * (3 - 2 * uz);
      const i00 = iz * TEX_RES + ix;
      const i10 = ix < texMax ? i00 + 1 : i00;
      const i01 = iz < texMax ? i00 + TEX_RES : i00;
      const i11 = ix < texMax && iz < texMax ? i01 + 1 : i01;
      return (
        heightMap[i00] * (1 - sux) * (1 - suz) +
        heightMap[i10] * sux * (1 - suz) +
        heightMap[i01] * (1 - sux) * suz +
        heightMap[i11] * sux * suz
      );
    };

    // Smooth bilinear sampler for clouds & atmospheric color maps (eliminates nearest-neighbor blockiness)
    const sampleCloudAndTexBilinear = (wx: number, wz: number) => {
      const tu = (foldMirror(wx) * 0.5 + 0.5) * texMax;
      const tv = (foldMirror(wz) * 0.5 + 0.5) * texMax;
      const iu = tu | 0;
      const iv = tv | 0;
      const fu = tu - iu;
      const fv = tv - iv;
      const sfu = fu * fu * (3 - 2 * fu);
      const sfv = fv * fv * (3 - 2 * fv);
      const i00 = iv * TEX_RES + iu;
      const i10 = iu < texMax ? i00 + 1 : i00;
      const i01 = iv < texMax ? i00 + TEX_RES : i00;
      const i11 = iu < texMax && iv < texMax ? i01 + 1 : i01;
      const w00 = (1 - sfu) * (1 - sfv);
      const w10 = sfu * (1 - sfv);
      const w01 = (1 - sfu) * sfv;
      const w11 = sfu * sfv;
      return {
        cVal: cloudMap[i00] * w00 + cloudMap[i10] * w10 + cloudMap[i01] * w01 + cloudMap[i11] * w11,
        r: texR[i00] * w00 + texR[i10] * w10 + texR[i01] * w01 + texR[i11] * w11,
        g: texG[i00] * w00 + texG[i10] * w10 + texG[i01] * w01 + texG[i11] * w11,
        b: texB[i00] * w00 + texB[i10] * w10 + texB[i01] * w01 + texB[i11] * w11,
      };
    };

    let zDepthBuffer = new Float32Array(0);
    let crestCovBuffer = new Float32Array(0);
    let aaTempBuffer = new Uint32Array(0);

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) * 0.001);
      lastTime = now;
      const timeSec = now * 0.001;

      const canvas = canvasRef.current;
      if (!canvas) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = 900;
      const H = 525;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }

      if (!offscreenCanvasRef.current) {
        offscreenCanvasRef.current = document.createElement('canvas');
      }
      const offCanvas = offscreenCanvasRef.current;
      if (offCanvas.width !== W || offCanvas.height !== H) {
        offCanvas.width = W;
        offCanvas.height = H;
        imageDataRef.current = new ImageData(W, H);
        colorBufferRef.current = new Uint32Array(imageDataRef.current.data.buffer);
      }
      if (zDepthBuffer.length !== W * H) {
        zDepthBuffer = new Float32Array(W * H);
        crestCovBuffer = new Float32Array(W * H);
        aaTempBuffer = new Uint32Array(W * H);
      }

      const colorBuffer = colorBufferRef.current!;
      const imgData = imageDataRef.current!;

      // Update camera position & smooth terrain following
      const cam = camRef.current;
      const keys = keysRef.current;
      const moveSpeed = heightMode === 'flight' ? 0.24 : heightMode === 'skim' ? 0.14 : 0.075;

      let forwardInput = 0;
      let strafeInput = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) forwardInput = 1.0;
      if (keys.has('KeyS') || keys.has('ArrowDown')) forwardInput = -1.0;
      if (keys.has('KeyA')) strafeInput = -1.0;
      if (keys.has('KeyD')) strafeInput = 1.0;
      if (keys.has('ArrowLeft')) cam.yaw -= 1.15 * dt;
      if (keys.has('ArrowRight')) cam.yaw += 1.15 * dt;

      const accel = Math.min(1, dt * 10.0);
      cam.velForward += (forwardInput - cam.velForward) * accel;
      cam.velStrafe += (strafeInput - cam.velStrafe) * accel;
      if (Math.abs(cam.velForward) < 0.001) cam.velForward = 0;
      if (Math.abs(cam.velStrafe) < 0.001) cam.velStrafe = 0;

      const sinYaw = Math.sin(cam.yaw);
      const cosYaw = Math.cos(cam.yaw);
      cam.x += (sinYaw * cam.velForward + cosYaw * cam.velStrafe) * moveSpeed * dt;
      cam.z += (cosYaw * cam.velForward - sinYaw * cam.velStrafe) * moveSpeed * dt;

      const eyeClearance = heightMode === 'flight' ? 0.26 : heightMode === 'skim' ? 0.095 : 0.026;
      const groundH = sampleBilinearHeight(cam.x, cam.z);
      const targetY = groundH + eyeClearance;
      cam.y = Math.max(groundH + eyeClearance * 0.85, cam.y + (targetY - cam.y) * Math.min(1, dt * 8.5));

      const degHeading = Math.round((((cam.yaw * 180) / Math.PI) % 360 + 360) % 360);
      setHudHeadingDeg((prev) => (prev !== degHeading ? degHeading : prev));

      // Lighting & Sky colors
      const radTOD = (timeOfDayDeg * Math.PI) / 180;
      const sunAlt = Math.sin(radTOD);
      const isNight = sunAlt < -0.05;
      const isSunset = Math.abs(sunAlt) < 0.25;

      const sunAzimuth = Math.PI * 0.35;
      const lxRaw = Math.cos(radTOD) * Math.sin(sunAzimuth);
      const lyRaw = Math.max(0.12, sunAlt * 0.88 + 0.18);
      const lzRaw = Math.cos(radTOD) * Math.cos(sunAzimuth);
      const lLen = Math.hypot(lxRaw, lyRaw, lzRaw) || 1;
      const lx = lxRaw / lLen;
      const ly = lyRaw / lLen;
      const lz = lzRaw / lLen;

      const skyTopRgb = !hasAtmosphere
        ? [3, 5, 10]
        : isNight
        ? [4, 7, 17]
        : isSunset
        ? [24, 26, 56]
        : hexToRgb(surfaceModel.skyColorHex);
      const skyHorizonRgb = !hasAtmosphere
        ? [8, 12, 22]
        : isNight
        ? [12, 20, 38]
        : isSunset
        ? [212, 112, 58]
        : hexToRgb(surfaceModel.skyHorizonHex);

      const focalLen = 488;
      const horizonYFloat = H * 0.52 + Math.tan(cam.pitch) * focalLen;
      const horizonY = Math.round(horizonYFloat);
      const clampedHorizon = Math.max(-H, Math.min(H * 2, horizonY));
      const clampedHorizonFloat = Math.max(-H, Math.min(H * 2, horizonYFloat));

      // 1. Fill Sky & Perspective 3D Drifting Cloud Deck above the horizon
      const cloudRgb = surfaceModel.atmospherePalette.cloudRgb;
      const nightCloudMult = isNight ? 0.38 : isSunset ? 0.88 : 1.0;
      const cTopR = Math.min(255, Math.round(cloudRgb[0] * nightCloudMult + (isSunset ? 32 : 14)));
      const cTopG = Math.min(255, Math.round(cloudRgb[1] * nightCloudMult - (isSunset ? 10 : 0)));
      const cTopB = Math.min(255, Math.round(cloudRgb[2] * nightCloudMult - (isSunset ? 28 : 0)));
      const cBaseR = Math.round(cTopR * 0.64);
      const cBaseG = Math.round(cTopG * 0.66);
      const cBaseB = Math.round(cTopB * 0.72);

      const cloudAlt = 0.42;
      const windDriftX = timeSec * 0.018;
      const windDriftZ = timeSec * 0.011;

      // Precompute column ray directions
      const rayDirX = new Float32Array(W);
      const rayDirZ = new Float32Array(W);
      for (let sx = 0; sx < W; sx++) {
        const camSpaceX = (sx - W * 0.5) / focalLen;
        const rx = sinYaw + cosYaw * camSpaceX;
        const rz = cosYaw - sinYaw * camSpaceX;
        const rInv = 1.0 / Math.hypot(rx, rz);
        rayDirX[sx] = rx * rInv;
        rayDirZ[sx] = rz * rInv;
      }

      const skyEndRow = Math.min(H, Math.max(0, clampedHorizon + 2));
      const pal = surfaceModel.atmospherePalette;
      const tileAtmoRgb = hexToRgb(activeTile.biomeColor || surfaceModel.skyHorizonHex);

      for (let py = 0; py < H; py++) {
        const rowOff = py * W;
        const dyHorizon = clampedHorizonFloat - py;

        if (surfaceModel.isNoSurface && py >= clampedHorizon) {
          // Deep Colored Atmosphere Abyss below the horizon (NO solid surface)
          const tAbyss = Math.max(0, Math.min(1, (py - clampedHorizonFloat) / Math.max(1, H - clampedHorizonFloat)));
          const tAbyssCurve = Math.pow(tAbyss, 0.78);
          const midAtmoR = (skyHorizonRgb[0] * 0.45 + pal.atmoRgb[0] * 0.35 + tileAtmoRgb[0] * 0.20) * nightCloudMult;
          const midAtmoG = (skyHorizonRgb[1] * 0.45 + pal.atmoRgb[1] * 0.35 + tileAtmoRgb[1] * 0.20) * nightCloudMult;
          const midAtmoB = (skyHorizonRgb[2] * 0.45 + pal.atmoRgb[2] * 0.35 + tileAtmoRgb[2] * 0.20) * nightCloudMult;
          const deepR = (pal.bandDarkRgb[0] * 0.58 + pal.atmoRgb[0] * 0.28) * nightCloudMult;
          const deepG = (pal.bandDarkRgb[1] * 0.58 + pal.atmoRgb[1] * 0.28) * nightCloudMult;
          const deepB = (pal.bandDarkRgb[2] * 0.58 + pal.atmoRgb[2] * 0.28) * nightCloudMult;

          const ar = Math.max(0, Math.min(255, (midAtmoR + (deepR - midAtmoR) * tAbyssCurve) | 0));
          const ag = Math.max(0, Math.min(255, (midAtmoG + (deepG - midAtmoG) * tAbyssCurve) | 0));
          const ab = Math.max(0, Math.min(255, (midAtmoB + (deepB - midAtmoB) * tAbyssCurve) | 0));
          const baseAbyssPixel = (255 << 24) | (ab << 16) | (ag << 8) | ar;

          const dyDown = py - clampedHorizonFloat;
          if (showClouds && dyDown > 2) {
            // Raycast 2 layered colored cloud decks suspended below the camera in the colored atmosphere
            const subDist1 = (0.16 * focalLen) / dyDown;
            const subDist2 = (0.42 * focalLen) / dyDown;
            if (subDist1 > 0.04 && subDist1 < 4.2) {
              const fade1 = Math.max(0, Math.min(1, 1.0 - (subDist1 - 0.3) / 3.9));
              const fade2 = subDist2 < 4.8 ? Math.max(0, Math.min(1, 1.0 - (subDist2 - 0.5) / 4.3)) : 0;

              for (let sx = 0; sx < W; sx++) {
                let pr = ar;
                let pg = ag;
                let pb = ab;

                // Deep belt colored cloud layer (smooth bilinear sampling)
                if (fade2 > 0.02) {
                  const wx2 = cam.x + rayDirX[sx] * subDist2 - windDriftX * 0.7;
                  const wz2 = cam.z + rayDirZ[sx] * subDist2 + windDriftZ * 0.5;
                  const s2 = sampleCloudAndTexBilinear(wx2, wz2);
                  if (s2.cVal > 18) {
                    const cNorm2 = s2.cVal * (1 / 255);
                    const a2 = Math.min(0.78, cNorm2 * 0.72 * fade2);
                    const cr2 = (s2.r * 0.68 + pal.bandDarkRgb[0] * 0.32) * nightCloudMult;
                    const cg2 = (s2.g * 0.68 + pal.bandDarkRgb[1] * 0.32) * nightCloudMult;
                    const cb2 = (s2.b * 0.68 + pal.bandDarkRgb[2] * 0.32) * nightCloudMult;
                    pr = (pr * (1 - a2) + cr2 * a2) | 0;
                    pg = (pg * (1 - a2) + cg2 * a2) | 0;
                    pb = (pb * (1 - a2) + cb2 * a2) | 0;
                  }
                }

                // Mid-troposphere colored zonal cloud layer (smooth bilinear sampling)
                const wx1 = cam.x + rayDirX[sx] * subDist1 + windDriftX * 1.1;
                const wz1 = cam.z + rayDirZ[sx] * subDist1 + windDriftZ * 0.8;
                const s1 = sampleCloudAndTexBilinear(wx1, wz1);
                if (s1.cVal > 10) {
                  const cNorm1 = s1.cVal * (1 / 255);
                  const a1 = Math.min(0.88, cNorm1 * 0.84 * fade1);
                  const shade1 = 0.55 + 0.45 * cNorm1;
                  const cr1 = (s1.r * 0.75 + cTopR * 0.25) * shade1;
                  const cg1 = (s1.g * 0.75 + cTopG * 0.25) * shade1;
                  const cb1 = (s1.b * 0.75 + cTopB * 0.25) * shade1;
                  pr = (pr * (1 - a1) + cr1 * a1) | 0;
                  pg = (pg * (1 - a1) + cg1 * a1) | 0;
                  pb = (pb * (1 - a1) + cb1 * a1) | 0;
                }

                colorBuffer[rowOff + sx] =
                  (255 << 24) |
                  (Math.max(0, Math.min(255, pb)) << 16) |
                  (Math.max(0, Math.min(255, pg)) << 8) |
                  Math.max(0, Math.min(255, pr));
              }
              continue;
            }
          }

          colorBuffer.fill(baseAbyssPixel, rowOff, rowOff + W);
          continue;
        }

        const tSky = clampedHorizonFloat > 0 ? Math.max(0, Math.min(1, py / clampedHorizonFloat)) : 1.0;
        const tCurve = Math.pow(tSky, 1.35);
        const sr = (skyTopRgb[0] + (skyHorizonRgb[0] - skyTopRgb[0]) * tCurve) | 0;
        const sg = (skyTopRgb[1] + (skyHorizonRgb[1] - skyTopRgb[1]) * tCurve) | 0;
        const sb = (skyTopRgb[2] + (skyHorizonRgb[2] - skyTopRgb[2]) * tCurve) | 0;
        const baseSkyPixel = (255 << 24) | (sb << 16) | (sg << 8) | sr;

        // Raycast 3D overhead cloud plane when looking above the horizon (smooth bilinear sampling)
        if (
          showClouds &&
          hasAtmosphere &&
          surfaceModel.cloudOpacity > 0.015 &&
          py < skyEndRow &&
          dyHorizon > 3
        ) {
          const cloudDist = ((cloudAlt - cam.y) * focalLen) / dyHorizon;
          if (cloudDist > 0.05 && cloudDist < 3.8) {
            const distFade = Math.max(0, Math.min(1, 1.0 - (cloudDist - 0.4) / 3.4));
            const cloudAlphaScale = Math.min(0.88, surfaceModel.cloudOpacity * 0.85) * distFade;
            for (let sx = 0; sx < W; sx++) {
              const cwx = cam.x + rayDirX[sx] * cloudDist + windDriftX;
              const cwz = cam.z + rayDirZ[sx] * cloudDist + windDriftZ;
              const sc = sampleCloudAndTexBilinear(cwx, cwz);
              if (sc.cVal > 12) {
                const cNorm = sc.cVal * (1 / 255);
                const alpha = Math.min(0.86, cNorm * cloudAlphaScale);
                const shade = 0.45 + 0.55 * cNorm;
                const cr = surfaceModel.isNoSurface
                  ? ((sc.r * 0.55 + cTopR * 0.45) * shade) | 0
                  : (cBaseR + (cTopR - cBaseR) * shade) | 0;
                const cg = surfaceModel.isNoSurface
                  ? ((sc.g * 0.55 + cTopG * 0.45) * shade) | 0
                  : (cBaseG + (cTopG - cBaseG) * shade) | 0;
                const cb = surfaceModel.isNoSurface
                  ? ((sc.b * 0.55 + cTopB * 0.45) * shade) | 0
                  : (cBaseB + (cTopB - cBaseB) * shade) | 0;
                const pr = (sr * (1 - alpha) + cr * alpha) | 0;
                const pg = (sg * (1 - alpha) + cg * alpha) | 0;
                const pb = (sb * (1 - alpha) + cb * alpha) | 0;
                colorBuffer[rowOff + sx] = (255 << 24) | (pb << 16) | (pg << 8) | pr;
              } else {
                colorBuffer[rowOff + sx] = baseSkyPixel;
              }
            }
            continue;
          }
        }

        colorBuffer.fill(baseSkyPixel, rowOff, rowOff + W);
      }

      // 2. Front-to-Back First-Person 3D Terrain Raycasting (Skipped for Gas/Ice Giants with No Solid Surface)
      if (!surfaceModel.isNoSurface) {
        zDepthBuffer.fill(1e9);
        crestCovBuffer.fill(1.0);

        const verticalScale = 0.6;
        const nightDim = isNight ? 0.36 : 1.0;
        const cloudShadowStrength = showClouds ? Math.min(0.45, surfaceModel.cloudOpacity * 0.52) : 0;
        const atmoHazeStrength = hasAtmosphere
          ? Math.min(0.85, 0.22 + surfaceModel.cloudOpacity * 0.45 + Math.min(0.25, pBarAtmo * 0.04))
          : 0.08;
        const isTholinWorldSpec =
          surfaceModel.seaPalette.solventKey === 'NH3-H2O' ||
          surfaceModel.seaPalette.solventKey === 'CH4-C2H6' ||
          surfaceModel.compositionPalette.compositionLabel.includes('Tholin');
        const camYScaled = cam.y * verticalScale;

        // Evaluates trilinear-mipmapped, shaded & Nyquist-band-limited RGB at world coordinate (wx, wz) and distance zDist
        const shadeWorldPoint = (
          wx: number,
          wz: number,
          zDist: number,
          rdx: number,
          rdz: number
        ): { r: number; g: number; b: number } => {
          const fxFold = foldMirrorWithSign(wx);
          const fzFold = foldMirrorWithSign(wz);
          const uNorm = fxFold.val * 0.5 + 0.5;
          const vNorm = fzFold.val * 0.5 + 0.5;

          const tu = uNorm * texMax;
          const tv = vNorm * texMax;
          const iu = tu | 0;
          const iv = tv | 0;
          const fu = tu - iu;
          const fv = tv - iv;

          // Smoothstep Hermite weights for ultra-smooth sub-texel interpolation without linear Mach bands
          const sfu = fu * fu * (3 - 2 * fu);
          const sfv = fv * fv * (3 - 2 * fv);

          const i00 = iv * TEX_RES + iu;
          const i10 = iu < texMax ? i00 + 1 : i00;
          const i01 = iv < texMax ? i00 + TEX_RES : i00;
          const i11 = iu < texMax && iv < texMax ? i01 + 1 : i01;

          const w00 = (1 - sfu) * (1 - sfv);
          const w10 = sfu * (1 - sfv);
          const w01 = (1 - sfu) * sfv;
          const w11 = sfu * sfv;

          let r = texR[i00] * w00 + texR[i10] * w10 + texR[i01] * w01 + texR[i11] * w11;
          let g = texG[i00] * w00 + texG[i10] * w10 + texG[i01] * w01 + texG[i11] * w11;
          let b = texB[i00] * w00 + texB[i10] * w10 + texB[i01] * w01 + texB[i11] * w11;

          let rawNx = normXMap[i00] * w00 + normXMap[i10] * w10 + normXMap[i01] * w01 + normXMap[i11] * w11;
          let rawNz = normZMap[i00] * w00 + normZMap[i10] * w10 + normZMap[i01] * w01 + normZMap[i11] * w11;

          // Trilinear mipmap blending across mip1 (512x512) and mip2 (256x256) to eliminate distant pixel shimmering
          if (zDist > 0.28) {
            const mtu1 = uNorm * mip1Max;
            const mtv1 = vNorm * mip1Max;
            const miu1 = mtu1 | 0;
            const miv1 = mtv1 | 0;
            const mfu1 = mtu1 - miu1;
            const mfv1 = mtv1 - miv1;
            const mi00 = miv1 * MIP1_RES + miu1;
            const mi10 = miu1 < mip1Max ? mi00 + 1 : mi00;
            const mi01 = miv1 < mip1Max ? mi00 + MIP1_RES : mi00;
            const mi11 = miu1 < mip1Max && miv1 < mip1Max ? mi01 + 1 : mi01;
            const mw00 = (1 - mfu1) * (1 - mfv1);
            const mw10 = mfu1 * (1 - mfv1);
            const mw01 = (1 - mfu1) * mfv1;
            const mw11 = mfu1 * mfv1;

            let mr = mip1R[mi00] * mw00 + mip1R[mi10] * mw10 + mip1R[mi01] * mw01 + mip1R[mi11] * mw11;
            let mg = mip1G[mi00] * mw00 + mip1G[mi10] * mw10 + mip1G[mi01] * mw01 + mip1G[mi11] * mw11;
            let mb = mip1B[mi00] * mw00 + mip1B[mi10] * mw10 + mip1B[mi01] * mw01 + mip1B[mi11] * mw11;
            let mnx = mip1NX[mi00] * mw00 + mip1NX[mi10] * mw10 + mip1NX[mi01] * mw01 + mip1NX[mi11] * mw11;
            let mnz = mip1NZ[mi00] * mw00 + mip1NZ[mi10] * mw10 + mip1NZ[mi01] * mw01 + mip1NZ[mi11] * mw11;

            if (zDist > 0.82) {
              const tMip2 = Math.min(1, (zDist - 0.82) / 0.85);
              const mtu2 = uNorm * mip2Max;
              const mtv2 = vNorm * mip2Max;
              const miu2 = mtu2 | 0;
              const miv2 = mtv2 | 0;
              const mfu2 = mtu2 - miu2;
              const mfv2 = mtv2 - miv2;
              const m2i00 = miv2 * MIP2_RES + miu2;
              const m2i10 = miu2 < mip2Max ? m2i00 + 1 : m2i00;
              const m2i01 = miv2 < mip2Max ? m2i00 + MIP2_RES : m2i00;
              const m2i11 = miu2 < mip2Max && miv2 < mip2Max ? m2i01 + 1 : m2i01;
              const m2w00 = (1 - mfu2) * (1 - mfv2);
              const m2w10 = mfu2 * (1 - mfv2);
              const m2w01 = (1 - mfu2) * mfv2;
              const m2w11 = mfu2 * mfv2;
              const mr2 = mip2R[m2i00] * m2w00 + mip2R[m2i10] * m2w10 + mip2R[m2i01] * m2w01 + mip2R[m2i11] * m2w11;
              const mg2 = mip2G[m2i00] * m2w00 + mip2G[m2i10] * m2w10 + mip2G[m2i01] * m2w01 + mip2G[m2i11] * m2w11;
              const mb2 = mip2B[m2i00] * m2w00 + mip2B[m2i10] * m2w10 + mip2B[m2i01] * m2w01 + mip2B[m2i11] * m2w11;
              const mnx2 = mip2NX[m2i00] * m2w00 + mip2NX[m2i10] * m2w10 + mip2NX[m2i01] * m2w01 + mip2NX[m2i11] * m2w11;
              const mnz2 = mip2NZ[m2i00] * m2w00 + mip2NZ[m2i10] * m2w10 + mip2NZ[m2i01] * m2w01 + mip2NZ[m2i11] * m2w11;
              mr = mr * (1 - tMip2) + mr2 * tMip2;
              mg = mg * (1 - tMip2) + mg2 * tMip2;
              mb = mb * (1 - tMip2) + mb2 * tMip2;
              mnx = mnx * (1 - tMip2) + mnx2 * tMip2;
              mnz = mnz * (1 - tMip2) + mnz2 * tMip2;
            }

            const tMip1 = Math.min(1, (zDist - 0.28) / 0.54);
            r = r * (1 - tMip1) + mr * tMip1;
            g = g * (1 - tMip1) + mg * tMip1;
            b = b * (1 - tMip1) + mb * tMip1;
            rawNx = rawNx * (1 - tMip1) + mnx * tMip1;
            rawNz = rawNz * (1 - tMip1) + mnz * tMip1;
          }

          const f00 = flagsMap[i00];
          const f10 = flagsMap[i10];
          const f01 = flagsMap[i01];
          const f11 = flagsMap[i11];
          const lavaBlend =
            ((f00 & FLAG_LAVA) !== 0 ? w00 : 0) +
            ((f10 & FLAG_LAVA) !== 0 ? w10 : 0) +
            ((f01 & FLAG_LAVA) !== 0 ? w01 : 0) +
            ((f11 & FLAG_LAVA) !== 0 ? w11 : 0);
          const waterBlend =
            ((f00 & FLAG_WATER) !== 0 ? w00 : 0) +
            ((f10 & FLAG_WATER) !== 0 ? w10 : 0) +
            ((f01 & FLAG_WATER) !== 0 ? w01 : 0) +
            ((f11 & FLAG_WATER) !== 0 ? w11 : 0);
          const flags = f00;
          const isLava = lavaBlend > 0.5;

          if (isLava) {
            const pulse = Math.sin(wx * 45 + wz * 45 + timeSec * 3.5) * 18;
            r = Math.min(255, r + pulse);
            g = Math.min(255, Math.max(0, g + pulse * 0.8));
            return { r, g, b };
          }

          const distNormAtten = 1.0 / (1.0 + Math.max(0, zDist - 0.35) * 0.85);
          let nx = rawNx * (1 / 42) * fxFold.sign * distNormAtten;
          let nz = rawNz * (1 / 42) * fzFold.sign * distNormAtten;
          const ny = 1.0;

          const isWater = waterBlend > 0.5;
          if (isWater) {
            const waterWaveFade = Math.max(0.15, 1.0 - zDist * 0.38);
            const waveAnim1 = Math.sin(wx * 75 + wz * 45 + timeSec * 2.4);
            const waveAnim2 = Math.cos(wx * 48 - wz * 68 - timeSec * 1.9);
            nx += waveAnim1 * 0.26 * waterWaveFade;
            nz += waveAnim2 * 0.26 * waterWaveFade;
          } else if (zDist < 0.65) {
            // Nyquist band-limited foreground micro-detail (eliminates high-frequency shimmering at mid/far distances)
            const fade1 = 1.0 - zDist * (1 / 0.65);
            const w1 = fade1 * fade1;
            const p1 = wx * 145.0 + wz * 95.0 + Math.sin(wz * 58.0 - wx * 42.0) * 1.2;
            const s1 = Math.sin(p1);
            const c1 = Math.cos(p1);

            let s2 = 0;
            let c2 = 0;
            if (zDist < 0.28) {
              const fade2 = 1.0 - zDist * (1 / 0.28);
              const w2 = fade2 * fade2;
              const p2 = wx * 290.0 - wz * 235.0 + Math.cos(wx * 125.0 + wz * 110.0) * 0.9;
              s2 = Math.sin(p2) * w2;
              c2 = Math.cos(p2) * w2;
            }

            nx += c1 * 0.14 * w1 + c2 * 0.08;
            nz += s1 * 0.12 * w1 - s2 * 0.08;

            const microDelta = s1 * 4.2 * w1 + s2 * 2.6;
            r += microDelta * 1.04;
            g += microDelta * 0.98;
            b += microDelta * 0.90;
          }

          const invN = 1.0 / Math.hypot(nx, ny, nz);
          const nnx = nx * invN;
          const nny = ny * invN;
          const nnz = nz * invN;

          const ndotl = Math.max(0, nnx * lx + nny * ly + nnz * lz);

          const cwx = wx + windDriftX + 0.06;
          const cwz = wz + windDriftZ - 0.05;
          const ctu = (foldMirror(cwx) * 0.5 + 0.5) * texMax;
          const ctv = (foldMirror(cwz) * 0.5 + 0.5) * texMax;
          const ciu = ctu | 0;
          const civ = ctv | 0;
          const cfu = ctu - ciu;
          const cfv = ctv - civ;
          const ci00 = civ * TEX_RES + ciu;
          const ci10 = ciu < texMax ? ci00 + 1 : ci00;
          const ci01 = civ < texMax ? ci00 + TEX_RES : ci00;
          const ci11 = ciu < texMax && civ < texMax ? ci01 + 1 : ci01;
          const cVal =
            cloudMap[ci00] * (1 - cfu) * (1 - cfv) +
            cloudMap[ci10] * cfu * (1 - cfv) +
            cloudMap[ci01] * (1 - cfu) * cfv +
            cloudMap[ci11] * cfu * cfv;
          const cShad = (cVal * (1 / 255)) * cloudShadowStrength;
          const shadowAtten = 1.0 - cShad;

          const diff = (0.30 + 0.78 * ndotl * shadowAtten) * nightDim;
          r *= diff;
          g *= diff;
          b *= diff;

          if (!isNight && (isWater || (flags & FLAG_ICE_SPEC) !== 0)) {
            const halfX = lx - rdx;
            const halfY = ly + 0.25;
            const halfZ = lz - rdz;
            const hInv = 1.0 / Math.hypot(halfX, halfY, halfZ);
            const ndoth = Math.max(0, nnx * halfX * hInv + nny * halfY * hInv + nnz * halfZ * hInv);
            const isTholinSpec = !isWater && isTholinWorldSpec;
            const spec =
              (isWater
                ? Math.pow(ndoth, 22) * 0.65
                : Math.pow(ndoth, 14) * (isTholinSpec ? 0.18 : 0.32)) *
              shadowAtten *
              distNormAtten;
            r += (isTholinSpec ? 245 : 235) * spec;
            g += (isTholinSpec ? 185 : 245) * spec;
            b += (isTholinSpec ? 120 : 255) * spec;
          }

          const fog = Math.min(1, Math.pow(zDist / 2.65, 1.35) * atmoHazeStrength);
          r = r * (1 - fog) + skyHorizonRgb[0] * fog;
          g = g * (1 - fog) + skyHorizonRgb[1] * fog;
          b = b * (1 - fog) + skyHorizonRgb[2] * fog;

          return { r, g, b };
        };

        for (let sx = 0; sx < W; sx++) {
          const rdx = rayDirX[sx];
          const rdz = rayDirZ[sx];

          let maxY = H - 1;
          let zDist = 0.010;
          let dz = 0.00095;

          let prevProjY = H;
          let prevZDist = zDist;
          let prevR = skyHorizonRgb[0];
          let prevG = skyHorizonRgb[1];
          let prevB = skyHorizonRgb[2];
          let hasPrev = false;

          while (zDist < 2.65 && maxY >= 0) {
            const wx = cam.x + rdx * zDist;
            const wz = cam.z + rdz * zDist;

            const tu = (foldMirror(wx) * 0.5 + 0.5) * texMax;
            const tv = (foldMirror(wz) * 0.5 + 0.5) * texMax;
            const iu = tu | 0;
            const iv = tv | 0;
            const fu = tu - iu;
            const fv = tv - iv;
            // Smoothstep Hermite height interpolation eliminates close-range polygon facet ridges
            const sfu = fu * fu * (3 - 2 * fu);
            const sfv = fv * fv * (3 - 2 * fv);

            const i00 = iv * TEX_RES + iu;
            const i10 = iu < texMax ? i00 + 1 : i00;
            const i01 = iv < texMax ? i00 + TEX_RES : i00;
            const i11 = iu < texMax && iv < texMax ? i01 + 1 : i01;

            const w00 = (1 - sfu) * (1 - sfv);
            const w10 = sfu * (1 - sfv);
            const w01 = (1 - sfu) * sfv;
            const w11 = sfu * sfv;

            const hSample =
              (heightMap[i00] * w00 + heightMap[i10] * w10 + heightMap[i01] * w01 + heightMap[i11] * w11) *
              verticalScale;

            const projY = clampedHorizonFloat - ((hSample - camYScaled) * focalLen) / zDist;
            const topY = Math.max(0, Math.floor(projY));

            if (topY <= maxY) {
              const cur = shadeWorldPoint(wx, wz, zDist, rdx, rdz);
              const r = cur.r;
              const g = cur.g;
              const b = cur.b;

              const span = maxY - topY + 1;
              const projDenom = Math.max(0.35, prevProjY - projY);
              const useSubSpanDetail = hasPrev && span > 2 && zDist < 0.65 && prevProjY > projY;

              // Sub-pixel fractional coverage of the top pixel of this span (for vertical silhouette anti-aliasing)
              const topCoverage = Math.max(0.12, Math.min(1.0, topY + 1.0 - projY));

              for (let py = maxY; py >= topY; py--) {
                let pr = r;
                let pg = g;
                let pb = b;
                let pzHit = zDist;
                if (hasPrev && prevProjY > projY) {
                  const tSpan = Math.max(0, Math.min(1, (py + 0.5 - projY) / projDenom));
                  pzHit = zDist + (prevZDist - zDist) * tSpan;
                  if (useSubSpanDetail) {
                    const subShade = shadeWorldPoint(
                      cam.x + rdx * pzHit,
                      cam.z + rdz * pzHit,
                      pzHit,
                      rdx,
                      rdz
                    );
                    pr = subShade.r;
                    pg = subShade.g;
                    pb = subShade.b;
                  } else if (span > 1) {
                    pr = r + (prevR - r) * tSpan;
                    pg = g + (prevG - g) * tSpan;
                    pb = b + (prevB - b) * tSpan;
                  }
                }
                const ir = pr < 0 ? 0 : pr > 255 ? 255 : pr | 0;
                const ig = pg < 0 ? 0 : pg > 255 ? 255 : pg | 0;
                const ib = pb < 0 ? 0 : pb > 255 ? 255 : pb | 0;
                const pIdx = py * W + sx;
                colorBuffer[pIdx] = (255 << 24) | (ib << 16) | (ig << 8) | ir;
                zDepthBuffer[pIdx] = pzHit;
                if (py === topY) {
                  crestCovBuffer[pIdx] = topCoverage;
                }
              }

              maxY = topY - 1;
              prevProjY = projY;
              prevZDist = zDist;
              prevR = r;
              prevG = g;
              prevB = b;
              hasPrev = true;
            } else if (!hasPrev) {
              prevProjY = projY;
              prevZDist = zDist;
            }

            zDist += dz;
            dz += 0.000044;
          }
        }

        // 2B. Sub-Pixel Silhouette, Ridge Crest & Horizon Anti-Aliasing Pass
        aaTempBuffer.set(colorBuffer);
        for (let py = 1; py < H - 1; py++) {
          const row = py * W;
          for (let px = 1; px < W - 1; px++) {
            const idx = row + px;
            const z0 = zDepthBuffer[idx];
            if (z0 >= 1e8) continue;

            const zU = zDepthBuffer[idx - W];
            const zD = zDepthBuffer[idx + W];
            const zL = zDepthBuffer[idx - 1];
            const zR = zDepthBuffer[idx + 1];

            const isUpperCrest = zU - z0 > 0.045;
            const isSideEdge = Math.abs(z0 - zL) > 0.045 || Math.abs(z0 - zR) > 0.045 || zD - z0 > 0.045;

            if (isUpperCrest || isSideEdge) {
              const c0 = aaTempBuffer[idx];
              const cU = aaTempBuffer[idx - W];
              const cD = aaTempBuffer[idx + W];
              const cL = aaTempBuffer[idx - 1];
              const cR = aaTempBuffer[idx + 1];

              let r0 = c0 & 255;
              let g0 = (c0 >> 8) & 255;
              let b0 = (c0 >> 16) & 255;

              // Sub-pixel vertical crest coverage blend against the background pixel directly above the ridge/horizon
              if (isUpperCrest) {
                const cov = crestCovBuffer[idx];
                const bgWeight = (1.0 - cov) * 0.65;
                r0 = r0 * (1.0 - bgWeight) + (cU & 255) * bgWeight;
                g0 = g0 * (1.0 - bgWeight) + ((cU >> 8) & 255) * bgWeight;
                b0 = b0 * (1.0 - bgWeight) + ((cU >> 16) & 255) * bgWeight;
              }

              // 5-tap sub-pixel spatial smoothing along diagonal/sloped silhouette contours
              const rSmooth = (r0 * 4 + (cU & 255) + (cD & 255) + (cL & 255) + (cR & 255) + 4) >> 3;
              const gSmooth = (g0 * 4 + ((cU >> 8) & 255) + ((cD >> 8) & 255) + ((cL >> 8) & 255) + ((cR >> 8) & 255) + 4) >> 3;
              const bSmooth = (b0 * 4 + ((cU >> 16) & 255) + ((cD >> 16) & 255) + ((cL >> 16) & 255) + ((cR >> 16) & 255) + 4) >> 3;

              colorBuffer[idx] = (255 << 24) | (bSmooth << 16) | (gSmooth << 8) | rSmooth;
            }
          }
        }
      }

      const offCtx = offCanvas.getContext('2d');
      if (offCtx) {
        offCtx.putImageData(imgData, 0, 0);
        ctx.drawImage(offCanvas, 0, 0);
      }

      // 3. Draw 3D Celestial Objects (Stars, Rings, Moons, Sun Glare) in the Visible Sky
      const projectSkyAzAlt = (azRad: number, altRad: number) => {
        let dAz = ((azRad - cam.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        if (Math.abs(dAz) > Math.PI * 0.48) return null;
        const sx = W * 0.5 + Math.tan(dAz) * focalLen;
        const sy = clampedHorizon - Math.tan(altRad) * focalLen;
        return { sx, sy };
      };

      // Stars at night or in vacuum (with Harvard spectral color distribution)
      if (!hasAtmosphere || isNight || pBarAtmo < 0.08) {
        const bgStarColors = ['#93c5fd', '#e0f2fe', '#fef9c3', '#fde047', '#fdba74', '#fca5a5'];
        const starCount = isNight || !hasAtmosphere ? 150 : 60;
        for (let i = 0; i < starCount; i++) {
          const sAz = (i * 2.39996) % (Math.PI * 2);
          const sAlt = 0.05 + ((i * 0.713) % 0.85);
          const sp = projectSkyAzAlt(sAz, sAlt);
          if (sp && sp.sy > 0 && sp.sy < clampedHorizon - 4) {
            ctx.fillStyle = bgStarColors[i % bgStarColors.length];
            ctx.globalAlpha = 0.35 + ((i * 19) % 65) / 100;
            const sz = i % 3 === 0 ? 1.6 : 1.0;
            ctx.fillRect(sp.sx, sp.sy, sz, sz);
          }
        }
        ctx.globalAlpha = 1.0;
      }

      // Host Star (Sun) in the sky: colored limb-darkened photosphere with sunspots (umbra + penumbra + faculae)
      if (!isNight) {
        const sunPos = projectSkyAzAlt(sunAzimuth + Math.cos(radTOD) * 0.8, Math.max(0.05, sunAlt * 0.75));
        if (sunPos && sunPos.sy < clampedHorizon + 20) {
          const starRad = Math.max(6.5, surfaceModel.starAngularDiameterDeg * 16);
          const starPal = getStarSpectralPalette({
            Teff: surfaceModel.starTeff,
            colorHex: surfaceModel.starColorHex,
          });

          const glare = ctx.createRadialGradient(
            sunPos.sx,
            sunPos.sy,
            starRad * 0.45,
            sunPos.sx,
            sunPos.sy,
            starRad * 5.5
          );
          glare.addColorStop(0, starPal.coreHex);
          glare.addColorStop(0.22, starPal.baseHex);
          glare.addColorStop(0.55, `${starPal.limbHex}55`);
          glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = glare;
          ctx.beginPath();
          ctx.arc(sunPos.sx, sunPos.sy, starRad * 5.5, 0, Math.PI * 2);
          ctx.fill();

          // Limb-darkened colored solar photosphere disc
          const discGrad = ctx.createRadialGradient(
            sunPos.sx - starRad * 0.2,
            sunPos.sy - starRad * 0.2,
            starRad * 0.08,
            sunPos.sx,
            sunPos.sy,
            starRad
          );
          discGrad.addColorStop(0, starPal.coreHex);
          discGrad.addColorStop(0.62, starPal.baseHex);
          discGrad.addColorStop(1, starPal.limbHex);

          ctx.save();
          ctx.beginPath();
          ctx.arc(sunPos.sx, sunPos.sy, starRad, 0, Math.PI * 2);
          ctx.fillStyle = discGrad;
          ctx.fill();
          ctx.clip();

          if (starPal.isBrownDwarf) {
            // Brown Dwarf: render gas-giant latitudinal cloud bands instead of sunspots
            ctx.save();
            ctx.translate(sunPos.sx, sunPos.sy);
            ctx.rotate(-0.14);
            const bandOffsets = [
              { y: -0.68, h: 0.20, col: starPal.penumbraHex, alpha: 0.78 },
              { y: -0.34, h: 0.22, col: starPal.umbraHex, alpha: 0.72 },
              { y: -0.05, h: 0.16, col: starPal.faculaeHex, alpha: 0.42 },
              { y: 0.18, h: 0.24, col: starPal.penumbraHex, alpha: 0.80 },
              { y: 0.54, h: 0.20, col: starPal.umbraHex, alpha: 0.74 },
            ];
            for (let bIdx = 0; bIdx < bandOffsets.length; bIdx++) {
              const bd = bandOffsets[bIdx];
              ctx.fillStyle = bd.col;
              ctx.globalAlpha = bd.alpha;
              ctx.fillRect(-starRad * 1.2, bd.y * starRad, starRad * 2.4, bd.h * starRad);
            }
            ctx.restore();
            ctx.globalAlpha = 1.0;
          } else if (!starPal.isCompactRemnant && starPal.spotCoverage > 0.1) {
            // Live Star: render bipolar sunspot groups (faculae + penumbra + umbra) across the solar disc
            const spotRot = radTOD * 0.18;
            const spotDefs = [
              { dx: -0.28, dy: -0.18, r: 0.15, tilt: 0.25 },
              { dx: -0.11, dy: -0.22, r: 0.095, tilt: 0.2 },
              { dx: 0.32, dy: 0.22, r: 0.13, tilt: -0.3 },
              { dx: 0.45, dy: 0.18, r: 0.08, tilt: -0.25 },
            ];
            for (let s = 0; s < spotDefs.length; s++) {
              const sd = spotDefs[s];
              const sx = sunPos.sx + (sd.dx * Math.cos(spotRot) - sd.dy * 0.25 * Math.sin(spotRot)) * starRad;
              const sy = sunPos.sy + sd.dy * starRad;
              const sr = Math.max(1.1, sd.r * starRad * Math.min(1.25, 0.75 + starPal.spotCoverage * 0.3));

              // Bright magnetic faculae ring
              ctx.fillStyle = starPal.faculaeHex;
              ctx.globalAlpha = 0.35;
              ctx.beginPath();
              ctx.ellipse(sx, sy, sr * 1.45, sr * 1.1, sd.tilt, 0, Math.PI * 2);
              ctx.fill();

              // Penumbra
              ctx.fillStyle = starPal.penumbraHex;
              ctx.globalAlpha = 0.82;
              ctx.beginPath();
              ctx.ellipse(sx, sy, sr, sr * 0.76, sd.tilt, 0, Math.PI * 2);
              ctx.fill();

              // Umbra core
              ctx.fillStyle = starPal.umbraHex;
              ctx.globalAlpha = 0.94;
              ctx.beginPath();
              ctx.ellipse(sx, sy, sr * 0.52, sr * 0.4, sd.tilt, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1.0;
          }
          ctx.restore();
        }
      }

      // Moons in the sky
      surfaceModel.moonsInSky.forEach((m) => {
        const mPos = projectSkyAzAlt((m.azimuthDeg * Math.PI) / 180, (m.altitudeDeg * Math.PI) / 180);
        if (mPos && mPos.sy > 0 && mPos.sy < clampedHorizon - 6) {
          const rPx = Math.max(3.5, m.angularDiameterDeg * 15);
          ctx.save();
          ctx.fillStyle = m.visualColor;
          ctx.beginPath();
          ctx.arc(mPos.sx, mPos.sy, rPx, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = 'rgba(5, 10, 20, 0.78)';
          ctx.beginPath();
          ctx.arc(mPos.sx + rPx * (1 - m.phase * 2), mPos.sy, rPx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });

      // 4. Interactive Neighbor Goldberg Tile Horizon Beacons + Top Compass Tape
      beaconRectsRef.current = [];
      ctx.save();
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < neighborTiles.length; i++) {
        const nb = neighborTiles[i];
        const azRad = (nb.azimuthDeg * Math.PI) / 180;
        const bPos = projectSkyAzAlt(azRad, 0.08);
        if (!bPos || bPos.sx < 45 || bPos.sx > W - 45) continue;

        const beaconY = Math.max(38, Math.min(H - 55, clampedHorizon - 28));
        const label = `${nb.compass} • ${nb.tile.biomeName}`;
        const tw = ctx.measureText(label).width + 18;
        const th = 18;
        const bx = bPos.sx - tw * 0.5;
        const by = beaconY - th * 0.5;

        // Vertical tether line to horizon
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bPos.sx, beaconY + th * 0.5);
        ctx.lineTo(bPos.sx, Math.min(H - 20, beaconY + 24));
        ctx.stroke();

        ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
        ctx.strokeStyle = nb.tile.biomeColor || '#38bdf8';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(bx, by, tw, th, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(label, bPos.sx, beaconY);

        beaconRectsRef.current.push({ x: bx, y: by, w: tw, h: th, tile: nb.tile });
      }
      ctx.restore();

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [
    terrainData,
    heightMode,
    showClouds,
    timeOfDayDeg,
    surfaceModel,
    neighborTiles,
    hasAtmosphere,
    pBarAtmo,
  ]);

  return (
    <div className="w-full flex flex-col gap-2.5">
      {/* Top First-Person Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/90 px-3 py-2 rounded-lg border border-slate-800">
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
            First-Person Surface Explorer • {activeTile.biomeName}
          </span>
          <span className="px-2 py-0.5 rounded-md bg-sky-950/90 border border-sky-500/60 text-sky-200 font-mono font-bold text-xs tracking-wide shadow-sm">
            {activeTile.centerLat >= 0 ? `${activeTile.centerLat}°N` : `${Math.abs(activeTile.centerLat)}°S`},{' '}
            {activeTile.centerLon >= 0 ? `${activeTile.centerLon}°E` : `${Math.abs(activeTile.centerLon)}°W`}
          </span>
          <span className="text-sky-400 text-[11px] font-mono">
            • HDG {String(hudHeadingDeg).padStart(3, '0')}° ({compassLabelFromAzimuth(hudHeadingDeg)})
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Altitude / Camera Mode Toggle */}
          <div className="flex items-center bg-slate-900 rounded-md p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => setHeightMode('walk')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
                heightMode === 'walk' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Surface Walk (2m eye level)"
            >
              <Footprints className="w-3 h-3" />
              Walk
            </button>
            <button
              type="button"
              onClick={() => setHeightMode('skim')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
                heightMode === 'skim' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Low Terrain Skimmer (25m altitude)"
            >
              <Navigation className="w-3 h-3" />
              Skim
            </button>
            <button
              type="button"
              onClick={() => setHeightMode('flight')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
                heightMode === 'flight' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="High Flight Vista (80m altitude)"
            >
              <Plane className="w-3 h-3" />
              Flight
            </button>
          </div>

          {hasAtmosphere && (
            <button
              type="button"
              onClick={() => setShowClouds((v) => !v)}
              className={`px-2 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
                showClouds
                  ? 'bg-sky-900/60 border-sky-500/70 text-sky-200'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
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

          <div className="flex items-center gap-1">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <input
              type="range"
              min="-60"
              max="180"
              step="5"
              value={timeOfDayDeg}
              onChange={(e) => onChangeTimeOfDay(+e.target.value)}
              className="w-16 accent-amber-400 cursor-pointer"
              title="Adjust Solar Elevation / Time of Day"
            />
          </div>

          <button
            type="button"
            onClick={onSwitchToBlockView}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
            title="Switch to 3D Isometric Tile Terrain View"
          >
            <Hexagon className="w-3 h-3" />
            3D Tile View
          </button>

          <button
            type="button"
            onClick={() => {
              camRef.current.x = 0;
              camRef.current.z = -0.25;
              camRef.current.yaw = 0.25;
              camRef.current.pitch = -0.06;
            }}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>

          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className={`px-2 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
                isFullscreen
                  ? 'bg-purple-900/70 border-purple-400 text-purple-200'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title={isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
              {isFullscreen ? 'Exit' : 'Fullscreen'}
            </button>
          )}
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

      {/* Main Interactive First-Person Viewport */}
      <div
        className={`${
          isFullscreen
            ? 'fixed inset-0 z-[9999] w-screen h-screen bg-black overflow-hidden m-0 p-0 rounded-none border-0'
            : 'relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950'
        } select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={(e) => {
          setIsDragging(true);
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startYaw: camRef.current.yaw,
            startPitch: camRef.current.pitch,
            moved: false,
          };
        }}
        onMouseMove={(e) => {
          if (!isDragging || !dragRef.current) return;
          const dx = e.clientX - dragRef.current.startX;
          const dy = e.clientY - dragRef.current.startY;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            dragRef.current.moved = true;
          }
          camRef.current.yaw = dragRef.current.startYaw + dx * 0.0055;
          camRef.current.pitch = Math.max(-0.55, Math.min(0.45, dragRef.current.startPitch - dy * 0.0045));
        }}
        onMouseUp={(e) => {
          if (dragRef.current && !dragRef.current.moved && canvasRef.current) {
            // Check if user clicked a neighbor tile beacon on the horizon
            const rect = canvasRef.current.getBoundingClientRect();
            const cx = ((e.clientX - rect.left) / rect.width) * canvasRef.current.width;
            const cy = ((e.clientY - rect.top) / rect.height) * canvasRef.current.height;
            for (const b of beaconRectsRef.current) {
              if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
                onSelectTile(b.tile);
                break;
              }
            }
          }
          setIsDragging(false);
          dragRef.current = null;
        }}
        onMouseLeave={() => {
          setIsDragging(false);
          dragRef.current = null;
        }}
      >
        <canvas
          ref={canvasRef}
          className={
            isFullscreen
              ? 'w-full h-full max-w-full max-h-full block object-cover'
              : 'w-full h-[380px] sm:h-[420px] block object-cover'
          }
        />

        {/* Fullscreen Floating Controls & Minimal HUD */}
        {isFullscreen && onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="absolute top-4 right-4 z-50 px-3 py-1.5 rounded-lg bg-slate-900/85 hover:bg-slate-800 text-white border border-slate-700/80 backdrop-blur-md font-bold flex items-center gap-2 cursor-pointer shadow-2xl transition hover:border-purple-400"
            title="Exit Fullscreen (Esc)"
          >
            <Minimize2 className="w-4 h-4 text-purple-300" />
            <span>Exit Fullscreen</span>
            <kbd className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700">ESC</kbd>
          </button>
        )}

        {isFullscreen && (
          <div className="absolute top-4 left-4 z-40 bg-slate-950/85 backdrop-blur-md px-3.5 py-2 rounded-lg border border-slate-800/90 text-xs text-white shadow-2xl flex flex-col gap-0.5 pointer-events-none">
            <div className="font-bold text-amber-300 flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              <span>{moon ? `Moon ${moon.name}` : planet.planetClass}</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-300 font-mono text-[11px]">
                {activeTile.centerLat >= 0 ? `${activeTile.centerLat.toFixed(1)}°N` : `${Math.abs(activeTile.centerLat).toFixed(1)}°S`},{' '}
                {activeTile.centerLon >= 0 ? `${activeTile.centerLon.toFixed(1)}°E` : `${Math.abs(activeTile.centerLon).toFixed(1)}°W`}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-sm"
                style={{ backgroundColor: activeTile.biomeColor }}
              />
              <span className="font-bold">{activeTile.biomeName}</span>
              <span className="text-slate-500">•</span>
              <span className="text-emerald-300">Heading {hudHeadingDeg}°</span>
            </div>
          </div>
        )}

        {/* Bottom-left Controls & Telemetry HUD */}
        <div className={`absolute ${isFullscreen ? 'bottom-4 left-4' : 'bottom-2.5 left-2.5'} bg-slate-950/85 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800/90 text-[11px] text-slate-300 pointer-events-none flex flex-col gap-0.5 z-40`}>
          <div className="text-amber-300 font-bold flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Dynamic First-Person View • {activeTile.biomeName}
          </div>
          <div className="text-slate-400 text-[10px]">
            Drag mouse to look 360° • <span className="text-white font-semibold">WASD / Arrows</span> to walk/fly • Click horizon beacons to travel to adjacent tiles
          </div>
        </div>

        {/* Bottom-right Fullscreen Quick-Settings */}
        {isFullscreen && (
          <div className="absolute bottom-4 right-4 z-40 bg-slate-950/85 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800/90 flex items-center gap-2 shadow-2xl">
            <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded border border-slate-800">
              <button
                type="button"
                onClick={() => setHeightMode('walk')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${heightMode === 'walk' ? 'bg-amber-900/80 text-amber-200' : 'text-slate-400'}`}
              >
                Walk
              </button>
              <button
                type="button"
                onClick={() => setHeightMode('skim')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${heightMode === 'skim' ? 'bg-amber-900/80 text-amber-200' : 'text-slate-400'}`}
              >
                Skim
              </button>
              <button
                type="button"
                onClick={() => setHeightMode('flight')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${heightMode === 'flight' ? 'bg-amber-900/80 text-amber-200' : 'text-slate-400'}`}
              >
                Flight
              </button>
            </div>
            <div className="flex items-center gap-1">
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <input
                type="range"
                min="-60"
                max="180"
                step="5"
                value={timeOfDayDeg}
                onChange={(e) => onChangeTimeOfDay(+e.target.value)}
                className="w-16 accent-amber-400 cursor-pointer"
                title="Adjust Solar Elevation / Time of Day"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                camRef.current.x = 0;
                camRef.current.z = -0.25;
                camRef.current.yaw = 0.25;
                camRef.current.pitch = -0.06;
              }}
              className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
              title="Reset Position"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
