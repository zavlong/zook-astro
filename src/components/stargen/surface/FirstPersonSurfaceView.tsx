import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Sun,
  Cloud,
  Navigation,
  Play,
  Pause,
  RotateCcw,
  Eye,
  Footprints,
  Plane,
  Hexagon,
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
} from './goldbergTileGrid';

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
}

type CameraHeightMode = 'walk' | 'skim' | 'flight';

const FLAG_WATER = 1;
const FLAG_LAVA = 2;
const FLAG_ICE_SPEC = 4;

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
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const n00 = hash2(ix, iy, seed);
  const n10 = hash2(ix + 1, iy, seed);
  const n01 = hash2(ix, iy + 1, seed);
  const n11 = hash2(ix + 1, iy + 1, seed);

  const nx0 = n00 + (n10 - n00) * ux;
  const nx1 = n01 + (n11 - n01) * ux;
  return nx0 + (nx1 - nx0) * uy;
}

function fbm2D(x: number, y: number, seed: number, octaves = 5): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    val += amp * valueNoise2D(x * freq, y * freq, seed + i * 31);
    norm += amp;
    freq *= 2.04;
    amp *= 0.5;
  }
  return val / (norm || 1);
}

function ridgedFbm2D(x: number, y: number, seed: number, octaves = 5): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise2D(x * freq, y * freq, seed + i * 47);
    const ridge = 1.0 - Math.abs(n * 2.0 - 1.0);
    val += amp * ridge * ridge;
    norm += amp;
    freq *= 2.12;
    amp *= 0.5;
  }
  return val / (norm || 1);
}

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

// Fold coordinate into [-1, 1] with smooth triangle wave so terrain tiles infinitely without seams
function foldMirror(v: number): number {
  const period = 4.0; // maps [-1, 1] -> [1, -1] smoothly
  const m = ((v + 1.0) % period + period) % period;
  return m <= 2.0 ? m - 1.0 : 3.0 - m;
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);
  const colorBufferRef = useRef<Uint32Array | null>(null);

  const [heightMode, setHeightMode] = useState<CameraHeightMode>('walk');
  const [autoRoam, setAutoRoam] = useState<boolean>(true);
  const [showClouds, setShowClouds] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [hudHeadingDeg, setHudHeadingDeg] = useState<number>(0);

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

  // Precompute 512x512 High-Resolution Terrain Heightfield, Albedo Texture, Normal Map & Cloud Map
  const terrainData = useMemo(() => {
    const TEX_RES = 512;
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
    const transCos = Math.cos(activeTile.transitionAngleRad || 0);
    const transSin = Math.sin(activeTile.transitionAngleRad || 0);
    const secWeight = activeTile.secondaryBiomeWeight || 0.35;

    const evalBiomeMix = (px: number, pz: number, baseFbm: number, ridge: number): number => {
      if (!hasSecondaryBiome) return 0;
      const along = px * transCos + pz * transSin;
      const patchNoise = (baseFbm - 0.5) * 0.85 + (ridge - 0.5) * 0.42;
      const threshold = (0.5 - secWeight) * 0.65;
      const raw = (along + patchNoise - threshold) / 0.52 + 0.5;
      const t = Math.max(0, Math.min(1, raw));
      return t * t * (3 - 2 * t);
    };

    const isBiomeOcean = (id: number) => !surfaceModel.isNoSurface && (id <= 2 || id === 17);
    const isBiomeIce = (id: number) => id === 8 || id === 13 || id === 18 || id === 21;
    const anyOceanBiome = isBiomeOcean(bId1) || (bId2 !== null && isBiomeOcean(bId2));
    const isPureOceanTile = isBiomeOcean(bId1) && (bId2 === null || isBiomeOcean(bId2));

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
      for (let h = 0; h < heroCount; h++) {
        const angle = hash2(h, 11, tileSeed) * Math.PI * 2;
        const dist = (0.18 + hash2(h, 12, tileSeed) * 0.46) * (h === 0 ? 0.8 : 1.0);
        const rad =
          (h === 0 ? 0.19 : 0.13) +
          hash2(h, 13, tileSeed) * (0.09 * Math.min(1, effCraterIntensity + 0.3));
        craters.push({
          cx: Math.cos(angle) * dist,
          cz: Math.sin(angle) * dist,
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
      for (let v = 0; v < vCount; v++) {
        const vDist = v === 0 ? 0.28 : 0.42 + hash2(v, 19, tileSeed) * 0.35;
        const vAng = hash2(v, 23, tileSeed) * Math.PI * 2;
        volcanicCones.push({
          vx: Math.cos(vAng) * vDist,
          vz: Math.sin(vAng) * vDist,
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
    const plateauRgb = hexToRgb(surfaceModel.compositionPalette.plateauHex);
    const alluvialRgb = hexToRgb(surfaceModel.compositionPalette.alluvialHex);
    const iceRgb = hexToRgb(surfaceModel.compositionPalette.iceHex);
    const marshRgb = hexToRgb(surfaceModel.floraPalette.marshHex);
    const plainsRgb = hexToRgb(surfaceModel.floraPalette.plainsHex);
    const forestRgb = hexToRgb(surfaceModel.floraPalette.woodlandHex);

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

    const macroH = activeTile.meanHNorm - surfaceModel.seaLevelNormalized;

    const evalSingleBiomeHeight = (
      bId: number,
      px: number,
      pz: number,
      wx: number,
      wz: number,
      baseFbm: number,
      ridge: number,
      fine: number
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
          isOceanPoint: false,
          isCalderaLava: false,
          isLavaRiver: false,
          isFissureFloor: false,
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

      const biomeMix = evalBiomeMix(px, pz, baseFbm, ridge);
      const h1 = evalSingleBiomeHeight(bId1, px, pz, wx, wz, baseFbm, ridge, fine);
      let hLocal = h1;
      if (hasSecondaryBiome && bId2 !== null) {
        const h2 = evalSingleBiomeHeight(bId2, px, pz, wx, wz, baseFbm, ridge, fine);
        hLocal = h1 * (1 - biomeMix) + h2 * biomeMix;
      }

      const oceanWeightAtPoint =
        (isBiomeOcean(bId1) ? 1 - biomeMix : 0) + (bId2 !== null && isBiomeOcean(bId2) ? biomeMix : 0);
      const isOceanPoint = !surfaceModel.isNoSurface && anyOceanBiome && oceanWeightAtPoint >= 0.45;
      if (!isOceanPoint) {
        hLocal = Math.max(0.025, hLocal);
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

      let isCalderaLava = false;
      let isLavaRiver = false;
      if (hasVolcanoes) {
        for (let v = 0; v < volcanicCones.length; v++) {
          const vc = volcanicCones[v];
          const dv = Math.hypot(px - vc.vx, pz - vc.vz);
          if (dv < vc.rad * 1.55) {
            const uv = dv / vc.rad;
            if (uv < 0.20) {
              const pit = 1.0 - (uv / 0.20) * (uv / 0.20);
              hLocal += vc.height * 0.72 - pit * (vc.height * 0.36);
              if (uv < 0.14) isCalderaLava = true;
            } else {
              const cone = Math.pow(Math.max(0, 1.0 - (uv - 0.20) / 1.35), 1.65);
              hLocal += vc.height * cone;
              const lavaAng = Math.atan2(pz - vc.vz, px - vc.vx);
              const flowChannel = Math.sin(lavaAng * 4 + dv * 14 + baseFbm * 5);
              if (flowChannel > 0.76 && uv < 1.15) {
                isLavaRiver = true;
              }
            }
          }
        }
      }

      let isFissureFloor = false;
      if (
        activeTile.fractureIntensity > 0.12 ||
        bId1 === 21 ||
        bId1 === 15 ||
        bId2 === 21 ||
        bId2 === 15
      ) {
        const fissureCurve = Math.abs(
          px * 0.75 - pz * 0.45 + (fbm2D(px * 3.6, pz * 3.6, tileSeed + 211, 3) - 0.5) * 0.32
        );
        if (fissureCurve < 0.062) {
          const cleft = 1.0 - fissureCurve / 0.062;
          hLocal -= cleft * 0.13;
          if (fissureCurve < 0.026) {
            isFissureFloor = true;
          }
        }
      }

      return {
        hLocal,
        craterRimTint,
        craterBowlTint,
        isOceanPoint,
        isCalderaLava,
        isLavaRiver,
        isFissureFloor,
        baseFbm,
        ridge,
        biomeMix,
      };
    };

    const MACRO_N = 129;
    const macroHGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroFbmGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroRidgeGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroRimGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroBowlGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroShadowGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroMixGrid = new Float32Array(MACRO_N * MACRO_N);
    const macroSpecialGrid = new Uint8Array(MACRO_N * MACRO_N);

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
        let sp = 0;
        if (sh.isCalderaLava || sh.isLavaRiver) sp |= 1;
        if (sh.isFissureFloor) sp |= 2;
        if (sh.isOceanPoint) sp |= 4;
        macroSpecialGrid[mIdx] = sp;
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
      let r = targetBaseRgb[0];
      let g = targetBaseRgb[1];
      let b = targetBaseRgb[2];
      let nx = baseNx;
      let nz = baseNz;
      let hDelta = 0;
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
        const isCrevasse = crevassePattern < 0.14 || isFissureFloor;
        nx += Math.cos(px * 65 - pz * 32 + fine1 * 5.5) * 0.55;
        nz -= Math.sin(px * 65 - pz * 32 + fine1 * 5.5) * 0.4;

        if (isCrevasse) {
          const depthCrev = isFissureFloor ? 0.85 : 1.0 - crevassePattern / 0.14;
          r = Math.round(targetBaseRgb[0] * (1 - depthCrev * 0.62) + (isTholinIce ? 92 : 38) * (depthCrev * 0.62));
          g = Math.round(targetBaseRgb[1] * (1 - depthCrev * 0.48) + (isTholinIce ? 36 : 128) * (depthCrev * 0.48));
          b = Math.round(targetBaseRgb[2] * (1 - depthCrev * 0.38) + (isTholinIce ? 18 : 210) * (depthCrev * 0.38));
          hDelta -= depthCrev * 0.015;
        } else {
          const frostSparkle = sastrugiWave * 14 + grain * 16;
          r = Math.round(targetBaseRgb[0] * 0.72 + iceRgb[0] * 0.28 + frostSparkle * (isTholinIce ? 1.15 : 1.0));
          g = Math.round(targetBaseRgb[1] * 0.72 + iceRgb[1] * 0.28 + frostSparkle * (isTholinIce ? 0.76 : 1.0));
          b = Math.round(targetBaseRgb[2] * 0.7 + iceRgb[2] * 0.3 + frostSparkle * (isTholinIce ? 0.42 : 1.1));
        }
      } else if (hasBioB) {
        const canopyDensity = Math.max(
          0,
          Math.min(1, baseFbm * 1.2 + (targetBiomeId === 5 ? 0.28 : targetBiomeId === 6 ? 0.18 : -0.08))
        );
        const cell = cellularFeature2D(px * 26.0, pz * 26.0, tileSeed + 809);
        const crownRadius = 0.28 + canopyDensity * 0.26;

        if (cell.dist < crownRadius && slope < 0.55 && hLocal > 0.015 && hLocal < 0.27) {
          const uCrown = cell.dist / crownRadius;
          const crownHeightProfile = Math.sqrt(Math.max(0, 1.0 - uCrown * uCrown));
          hDelta += crownHeightProfile * 0.022;
          nx += (cell.dx / crownRadius) * 1.35 + (fine2 - 0.5) * 0.4;
          nz += (cell.dy / crownRadius) * 1.35 + grain * 0.4;

          const speciesShade =
            (cell.cellHash - 0.5) * 26 + crownHeightProfile * 18 - (1 - crownHeightProfile) * 22;
          const isJungleOrTaiga = targetBiomeId === 5 || targetBiomeId === 6;
          const cRgb = isJungleOrTaiga ? forestRgb : plainsRgb;
          r = Math.round(cRgb[0] + speciesShade + fine2 * 14);
          g = Math.round(cRgb[1] + speciesShade * 1.15 + fine2 * 18);
          b = Math.round(cRgb[2] + speciesShade * 0.7 + fine2 * 10);
        } else {
          const wetlandT = hLocal < 0.055 ? Math.max(0, Math.min(1, (0.055 - hLocal) / 0.055)) : 0;
          const grassWave = Math.sin(px * 48 + pz * 32 + fine1 * 6) * 10 + grain * 14;
          r = Math.round(plainsRgb[0] * (1 - wetlandT * 0.7) + marshRgb[0] * (wetlandT * 0.7) + grassWave);
          g = Math.round(
            plainsRgb[1] * (1 - wetlandT * 0.7) + marshRgb[1] * (wetlandT * 0.7) + grassWave * 1.1
          );
          b = Math.round(
            plainsRgb[2] * (1 - wetlandT * 0.7) + marshRgb[2] * (wetlandT * 0.7) + grassWave * 0.8
          );
        }
      } else if (isDesertB) {
        const ripplePhase =
          px * 115.0 + pz * 52.0 + Math.sin(pz * 14.0 + baseFbm * 5.0) * 6.5 + fine1 * 4.0;
        const rippleWave = Math.sin(ripplePhase);
        nx += Math.cos(ripplePhase) * 0.65;
        nz += Math.sin(ripplePhase) * 0.35;

        const mineralBand = Math.sin(hLocal * 42 + baseFbm * 6.0) * 14 + rippleWave * 9 + grain * 18;
        r = Math.round(targetBaseRgb[0] + mineralBand * 1.15);
        g = Math.round(targetBaseRgb[1] + mineralBand * 0.92);
        b = Math.round(targetBaseRgb[2] + mineralBand * 0.65);
      } else if (isCanyonB) {
        const strataPhase = hLocal * 115.0 + fine1 * 2.4 + fine2 * 0.8;
        const strataBand = Math.sin(strataPhase);
        const fineLayer = Math.sin(strataPhase * 3.2) * 0.5;
        const bandContrast = strataBand * 22 + fineLayer * 11 + grain * 12;
        nx += dhx * strataBand * 0.75;
        nz += dhz * strataBand * 0.75;

        r = Math.round(plateauRgb[0] * 0.88 + highRgb[0] * 0.12 + bandContrast * 1.2);
        g = Math.round(plateauRgb[1] * 0.88 + highRgb[1] * 0.12 + bandContrast * 0.85);
        b = Math.round(plateauRgb[2] * 0.88 + highRgb[2] * 0.12 + bandContrast * 0.55);
      } else if (isVolcB) {
        const pahoehoe = Math.sin(px * 55 + pz * 45 + fine1 * 8.0);
        const crack = Math.abs(fine1 * 2.0 - 1.0 + (fine2 - 0.5) * 0.5);
        nx += pahoehoe * 0.65;
        nz -= pahoehoe * 0.55;

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
              nx -= (cell.dx / 0.28) * 1.55;
              nz -= (cell.dy / 0.28) * 1.55;
              microRelief -= (1 - uCr) * 24;
              hDelta -= (1 - uCr) * 0.011;
            } else {
              nx += (cell.dx / 0.28) * 1.3;
              nz += (cell.dy / 0.28) * 1.3;
              microRelief += 18;
              hDelta += 0.007;
            }
          } else {
            nx += (cell.dx / 0.28) * 1.2;
            nz += (cell.dy / 0.28) * 1.2;
            microRelief += (1 - uCr) * 16;
            hDelta += (1 - uCr) * 0.012;
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

      return { r, g, b, nx, nz, hDelta, flags };
    };

    for (let tz = 0; tz < TEX_RES; tz++) {
      const vNorm = tz / (TEX_RES - 1);
      const pz = vNorm * 2.0 - 1.0;
      const mfz = vNorm * (MACRO_N - 1);
      const miz = Math.min(MACRO_N - 2, Math.floor(mfz));
      const fz = mfz - miz;

      for (let tx = 0; tx < TEX_RES; tx++) {
        const uNorm = tx / (TEX_RES - 1);
        const px = uNorm * 2.0 - 1.0;
        const mfx = uNorm * (MACRO_N - 1);
        const mix = Math.min(MACRO_N - 2, Math.floor(mfx));
        const fx = mfx - mix;

        const i00 = miz * MACRO_N + mix;
        const i10 = i00 + 1;
        const i01 = i00 + MACRO_N;
        const i11 = i01 + 1;

        const w00 = (1 - fx) * (1 - fz);
        const w10 = fx * (1 - fz);
        const w01 = (1 - fx) * fz;
        const w11 = fx * fz;

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

        const dhx = (macroHGrid[i10] - macroHGrid[i00]) * (MACRO_N * 0.5);
        const dhz = (macroHGrid[i01] - macroHGrid[i00]) * (MACRO_N * 0.5);
        const slope = Math.hypot(dhx, dhz);

        const spMask = macroSpecialGrid[i00] | macroSpecialGrid[i10] | macroSpecialGrid[i01] | macroSpecialGrid[i11];
        const isLavaSpecial = (spMask & 1) !== 0;
        const isFissureFloor = (spMask & 2) !== 0;
        const isOceanPoint = (spMask & 4) !== 0;

        const fine1 = valueNoise2D(px * 28.0, pz * 28.0, tileSeed + 313);
        const fine2 = valueNoise2D(px * 64.0, pz * 64.0, tileSeed + 419);
        const grain = hash2(tx, tz, tileSeed + 521) - 0.5;

        const fineRight = valueNoise2D((px + 0.006) * 42.0, pz * 42.0, tileSeed + 313);
        const fineDown = valueNoise2D(px * 42.0, (pz + 0.006) * 42.0, tileSeed + 313);
        let nx = -dhx * 1.35 + (fine1 - fineRight) * 1.8;
        let nz = -dhz * 1.35 + (fine1 - fineDown) * 1.8;

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

          if (isLavaSpecial || (isFissureFloor && isVolcanicAny)) {
            const crustCrack = valueNoise2D(px * 45, pz * 45, tileSeed + 601);
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
              const wPhase1 = px * 78.0 + pz * 44.0 + fine1 * 4.2;
              const wPhase2 = px * 48.0 - pz * 82.0 + fine2 * 3.6;
              nx = Math.cos(wPhase1) * 0.45 + Math.cos(wPhase2) * 0.32;
              nz = Math.sin(wPhase1) * 0.45 - Math.sin(wPhase2) * 0.32;

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
      effCloudCover,
    };
  }, [surfaceModel, activeTile, pBarAtmo, hasAtmosphere]);

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
    } = terrainData;
    const texMax = TEX_RES - 1;

    const sampleBilinearHeight = (wx: number, wz: number): number => {
      const fx = (foldMirror(wx) * 0.5 + 0.5) * texMax;
      const fz = (foldMirror(wz) * 0.5 + 0.5) * texMax;
      const ix = fx | 0;
      const iz = fz | 0;
      const ux = fx - ix;
      const uz = fz - iz;
      const i00 = iz * TEX_RES + ix;
      const i10 = ix < texMax ? i00 + 1 : i00;
      const i01 = iz < texMax ? i00 + TEX_RES : i00;
      const i11 = ix < texMax && iz < texMax ? i01 + 1 : i01;
      return (
        heightMap[i00] * (1 - ux) * (1 - uz) +
        heightMap[i10] * ux * (1 - uz) +
        heightMap[i01] * (1 - ux) * uz +
        heightMap[i11] * ux * uz
      );
    };

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

      const W = 720;
      const H = 420;
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

      const colorBuffer = colorBufferRef.current!;
      const imgData = imageDataRef.current!;

      // Update camera position & smooth terrain following
      const cam = camRef.current;
      const keys = keysRef.current;
      const moveSpeed = heightMode === 'flight' ? 0.24 : heightMode === 'skim' ? 0.14 : 0.075;

      let forwardInput = autoRoam ? 0.42 : 0;
      let strafeInput = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) forwardInput = 1.0;
      if (keys.has('KeyS') || keys.has('ArrowDown')) forwardInput = -1.0;
      if (keys.has('KeyA')) strafeInput = -1.0;
      if (keys.has('KeyD')) strafeInput = 1.0;
      if (keys.has('ArrowLeft')) cam.yaw -= 1.15 * dt;
      if (keys.has('ArrowRight')) cam.yaw += 1.15 * dt;

      const sinYaw = Math.sin(cam.yaw);
      const cosYaw = Math.cos(cam.yaw);
      cam.x += (sinYaw * forwardInput + cosYaw * strafeInput) * moveSpeed * dt;
      cam.z += (cosYaw * forwardInput - sinYaw * strafeInput) * moveSpeed * dt;

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

      const focalLen = 390;
      const horizonY = Math.round(H * 0.52 + Math.tan(cam.pitch) * focalLen);
      const clampedHorizon = Math.max(-H, Math.min(H * 2, horizonY));

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
      for (let py = 0; py < H; py++) {
        const tSky = clampedHorizon > 0 ? Math.max(0, Math.min(1, py / clampedHorizon)) : 1.0;
        const tCurve = Math.pow(tSky, 1.35);
        const sr = (skyTopRgb[0] + (skyHorizonRgb[0] - skyTopRgb[0]) * tCurve) | 0;
        const sg = (skyTopRgb[1] + (skyHorizonRgb[1] - skyTopRgb[1]) * tCurve) | 0;
        const sb = (skyTopRgb[2] + (skyHorizonRgb[2] - skyTopRgb[2]) * tCurve) | 0;
        const baseSkyPixel = (255 << 24) | (sb << 16) | (sg << 8) | sr;

        const rowOff = py * W;
        const dyHorizon = clampedHorizon - py;

        // Raycast 3D overhead cloud plane when looking above the horizon
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
              const ctu = ((foldMirror(cwx) * 0.5 + 0.5) * texMax) | 0;
              const ctv = ((foldMirror(cwz) * 0.5 + 0.5) * texMax) | 0;
              const cVal = cloudMap[ctv * TEX_RES + ctu];
              if (cVal > 12) {
                const cNorm = cVal * (1 / 255);
                const alpha = Math.min(0.86, cNorm * cloudAlphaScale);
                const shade = 0.45 + 0.55 * cNorm;
                const cr = (cBaseR + (cTopR - cBaseR) * shade) | 0;
                const cg = (cBaseG + (cTopG - cBaseG) * shade) | 0;
                const cb = (cBaseB + (cTopB - cBaseB) * shade) | 0;
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

      // 2. Front-to-Back First-Person 3D Terrain Raycasting
      const verticalScale = 1.35;
      const nightDim = isNight ? 0.36 : 1.0;
      const cloudShadowStrength = showClouds ? Math.min(0.45, surfaceModel.cloudOpacity * 0.52) : 0;
      const atmoHazeStrength = hasAtmosphere
        ? Math.min(0.85, 0.22 + surfaceModel.cloudOpacity * 0.45 + Math.min(0.25, pBarAtmo * 0.04))
        : 0.08;

      for (let sx = 0; sx < W; sx++) {
        const rdx = rayDirX[sx];
        const rdz = rayDirZ[sx];

        let maxY = H - 1;
        let zDist = 0.014;
        let dz = 0.0022;

        let prevProjY = H;
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

          const i00 = iv * TEX_RES + iu;
          const i10 = iu < texMax ? i00 + 1 : i00;
          const i01 = iv < texMax ? i00 + TEX_RES : i00;
          const i11 = iu < texMax && iv < texMax ? i01 + 1 : i01;

          const w00 = (1 - fu) * (1 - fv);
          const w10 = fu * (1 - fv);
          const w01 = (1 - fu) * fv;
          const w11 = fu * fv;

          const hSample =
            (heightMap[i00] * w00 + heightMap[i10] * w10 + heightMap[i01] * w01 + heightMap[i11] * w11) *
            verticalScale;
          const camYScaled = cam.y * verticalScale;

          const projY = clampedHorizon - ((hSample - camYScaled) * focalLen) / zDist;
          const topY = Math.max(0, projY | 0);

          if (topY <= maxY) {
            let r = texR[i00] * w00 + texR[i10] * w10 + texR[i01] * w01 + texR[i11] * w11;
            let g = texG[i00] * w00 + texG[i10] * w10 + texG[i01] * w01 + texG[i11] * w11;
            let b = texB[i00] * w00 + texB[i10] * w10 + texB[i01] * w01 + texB[i11] * w11;

            const flags = flagsMap[i00];
            const isLava = (flags & FLAG_LAVA) !== 0;

            if (isLava) {
              // Animated glowing lava pulse
              const pulse = Math.sin(wx * 45 + wz * 45 + timeSec * 3.5) * 18;
              r = Math.min(255, r + pulse);
              g = Math.min(255, Math.max(0, g + pulse * 0.8));
            } else {
              let nx = (normXMap[i00] * w00 + normXMap[i10] * w10 + normXMap[i01] * w01 + normXMap[i11] * w11) * (1 / 42);
              let nz = (normZMap[i00] * w00 + normZMap[i10] * w10 + normZMap[i01] * w01 + normZMap[i11] * w11) * (1 / 42);
              const ny = 1.0;

              // Real-time animated water wave normals & specular glints
              const isWater = (flags & FLAG_WATER) !== 0;
              if (isWater) {
                const waveAnim1 = Math.sin(wx * 95 + wz * 55 + timeSec * 2.8);
                const waveAnim2 = Math.cos(wx * 60 - wz * 85 - timeSec * 2.2);
                nx += waveAnim1 * 0.32;
                nz += waveAnim2 * 0.32;
              }

              const invN = 1.0 / Math.hypot(nx, ny, nz);
              const nnx = nx * invN;
              const nny = ny * invN;
              const nnz = nz * invN;

              const ndotl = Math.max(0, nnx * lx + nny * ly + nnz * lz);

              // Sample drifting overhead cloud shadow
              const cwx = wx + windDriftX + 0.06;
              const cwz = wz + windDriftZ - 0.05;
              const ctu = ((foldMirror(cwx) * 0.5 + 0.5) * texMax) | 0;
              const ctv = ((foldMirror(cwz) * 0.5 + 0.5) * texMax) | 0;
              const cShad = (cloudMap[ctv * TEX_RES + ctu] * (1 / 255)) * cloudShadowStrength;
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
                const isTholinSpec =
                  !isWater &&
                  (surfaceModel.seaPalette.solventKey === 'NH3-H2O' ||
                    surfaceModel.seaPalette.solventKey === 'CH4-C2H6' ||
                    surfaceModel.compositionPalette.compositionLabel.includes('Tholin'));
                const spec =
                  (isWater
                    ? Math.pow(ndoth, 22) * 0.65
                    : Math.pow(ndoth, 14) * (isTholinSpec ? 0.18 : 0.32)) * shadowAtten;
                r += (isTholinSpec ? 245 : 235) * spec;
                g += (isTholinSpec ? 185 : 245) * spec;
                b += (isTholinSpec ? 120 : 255) * spec;
              }

              // Distance aerial perspective haze
              const fog = Math.min(1, Math.pow(zDist / 2.65, 1.35) * atmoHazeStrength);
              r = r * (1 - fog) + skyHorizonRgb[0] * fog;
              g = g * (1 - fog) + skyHorizonRgb[1] * fog;
              b = b * (1 - fog) + skyHorizonRgb[2] * fog;
            }

            const span = maxY - topY + 1;
            for (let py = maxY; py >= topY; py--) {
              let pr = r;
              let pg = g;
              let pb = b;
              if (hasPrev && span > 1 && prevProjY > projY) {
                const tSpan = (py - topY) / span;
                pr = r + (prevR - r) * tSpan;
                pg = g + (prevG - g) * tSpan;
                pb = b + (prevB - b) * tSpan;
              }
              const ir = pr < 0 ? 0 : pr > 255 ? 255 : pr | 0;
              const ig = pg < 0 ? 0 : pg > 255 ? 255 : pg | 0;
              const ib = pb < 0 ? 0 : pb > 255 ? 255 : pb | 0;
              colorBuffer[py * W + sx] = (255 << 24) | (ib << 16) | (ig << 8) | ir;
            }

            maxY = topY - 1;
            prevProjY = projY;
            prevR = r;
            prevG = g;
            prevB = b;
            hasPrev = true;
          }

          zDist += dz;
          dz += 0.00011;
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

      // Stars at night or in vacuum
      if (!hasAtmosphere || isNight || pBarAtmo < 0.08) {
        ctx.fillStyle = '#ffffff';
        const starCount = isNight || !hasAtmosphere ? 150 : 60;
        for (let i = 0; i < starCount; i++) {
          const sAz = (i * 2.39996) % (Math.PI * 2);
          const sAlt = 0.05 + ((i * 0.713) % 0.85);
          const sp = projectSkyAzAlt(sAz, sAlt);
          if (sp && sp.sy > 0 && sp.sy < clampedHorizon - 4) {
            ctx.globalAlpha = 0.3 + ((i * 19) % 65) / 100;
            const sz = i % 3 === 0 ? 1.5 : 0.9;
            ctx.fillRect(sp.sx, sp.sy, sz, sz);
          }
        }
        ctx.globalAlpha = 1.0;
      }

      // Host Star (Sun) in the sky
      if (!isNight) {
        const sunPos = projectSkyAzAlt(sunAzimuth + Math.cos(radTOD) * 0.8, Math.max(0.05, sunAlt * 0.75));
        if (sunPos && sunPos.sy < clampedHorizon + 20) {
          const starRad = Math.max(6, surfaceModel.starAngularDiameterDeg * 16);
          const glare = ctx.createRadialGradient(
            sunPos.sx,
            sunPos.sy,
            starRad * 0.4,
            sunPos.sx,
            sunPos.sy,
            starRad * 5.5
          );
          glare.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          glare.addColorStop(0.25, surfaceModel.starColorHex);
          glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = glare;
          ctx.beginPath();
          ctx.arc(sunPos.sx, sunPos.sy, starRad * 5.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(sunPos.sx, sunPos.sy, starRad, 0, Math.PI * 2);
          ctx.fill();
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
        const label = `${nb.compass} • #${nb.tile.tileId + 1} ${nb.tile.biomeName}`;
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
    autoRoam,
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
            First-Person Surface Explorer — Tile #{activeTile.tileId + 1} ({activeTile.biomeName})
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

          <button
            type="button"
            onClick={() => setAutoRoam((v) => !v)}
            className={`px-2 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
              autoRoam
                ? 'bg-emerald-900/60 border-emerald-500/70 text-emerald-200'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
            title="Toggle automatic forward surface traversal"
          >
            {autoRoam ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            Auto-Roam
          </button>

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
        </div>
      </div>

      {/* Main Interactive First-Person Viewport */}
      <div
        className={`relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
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
        <canvas ref={canvasRef} className="w-full h-[380px] sm:h-[420px] block object-cover" />

        {/* Bottom-left Controls & Telemetry HUD */}
        <div className="absolute bottom-2.5 left-2.5 bg-slate-950/85 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800/90 text-[11px] text-slate-300 pointer-events-none flex flex-col gap-0.5">
          <div className="text-amber-300 font-bold flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" />
            Dynamic First-Person View • {activeTile.biomeName}
          </div>
          <div className="text-slate-400 text-[10px]">
            Drag mouse to look 360° • <span className="text-white font-semibold">WASD / Arrows</span> to walk/fly • Click horizon beacons to travel to adjacent tiles
          </div>
        </div>
      </div>
    </div>
  );
};
