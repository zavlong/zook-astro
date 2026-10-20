import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  RotateCcw,
  Compass,
  Sun,
  Layers,
  ArrowLeft,
  Sparkles,
  Mountain,
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
  y: number; // Elevation in local scene units
  seaFloorY: number; // Unclamped solid floor elevation (below sea level if ocean)
  r: number;
  g: number;
  b: number;
  isWaterSurface: boolean;
  isLavaGlow: boolean;
  waterDepth: number;
}

interface LocalTri {
  v0: number;
  v1: number;
  v2: number;
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

function ridgedFbm2D(x: number, y: number, seed: number, octaves = 4): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise2D(x * freq, y * freq, seed + i * 47);
    const ridge = 1.0 - Math.abs(n * 2.0 - 1.0);
    val += amp * ridge * ridge;
    norm += amp;
    freq *= 2.1;
    amp *= 0.5;
  }
  return val / (norm || 1);
}

function compassLabelFromAzimuth(azDeg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((azDeg % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

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
  const [rotYaw, setRotYaw] = useState<number>(0.62); // ~35 deg isometric angle
  const [rotPitch, setRotPitch] = useState<number>(0.58); // ~33 deg isometric tilt
  const [zoom, setZoom] = useState<number>(1.0);
  const [verticalExag, setVerticalExag] = useState<number>(1.35);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [showWaterLayer, setShowWaterLayer] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startYaw: number;
    startPitch: number;
  } | null>(null);

  const neighborTiles = useMemo(() => {
    return activeTile.neighbors.map((nId, idx) => ({
      tile: goldbergGrid.tiles[nId],
      azimuthDeg: activeTile.neighborAzimuthDeg[idx] ?? idx * 60,
      compass: compassLabelFromAzimuth(activeTile.neighborAzimuthDeg[idx] ?? idx * 60),
    }));
  }, [activeTile, goldbergGrid]);

  // Build deterministic 3D Hexagonal / Pentagonal Terrain Mesh linked to activeTile and its 6 (or 5) neighbors
  const meshData = useMemo(() => {
    const sides = activeTile.isPentagon ? 5 : 6;
    const rings = 24; // 24 concentric hex/pentagon rings -> 6 * 24^2 = 3456 triangles
    const tileSeed = (surfaceModel.seed * 1664525 + activeTile.tileId * 1013904223) & 0x7fffffff;

    // Corner angles in local (x, z) plane aligned with neighbor compass directions
    const corners: [number, number][] = [];
    for (let s = 0; s < sides; s++) {
      // Wedge s spans between corner s and corner (s+1)%sides, facing neighbor s
      const angleRad = ((s - 0.5) * 2 * Math.PI) / sides;
      corners.push([Math.cos(angleRad), Math.sin(angleRad)]);
    }

    // Generate deterministic local craters if tile has craterIntensity
    const craterList: { cx: number; cz: number; radius: number; depth: number }[] = [];
    if (!surfaceModel.isNoSurface && !activeTile.isOcean && activeTile.craterIntensity > 0.05) {
      const numCraters = Math.min(7, Math.max(1, Math.round(activeTile.craterIntensity * 12)));
      for (let c = 0; c < numCraters; c++) {
        const angle = hash2(c, 1, tileSeed) * Math.PI * 2;
        const dist = 0.12 + hash2(c, 2, tileSeed) * 0.55;
        const radius = 0.11 + hash2(c, 3, tileSeed) * 0.16;
        craterList.push({
          cx: Math.cos(angle) * dist,
          cz: Math.sin(angle) * dist,
          radius,
          depth: 0.08 + activeTile.craterIntensity * 0.12,
        });
      }
    }

    // Generate deterministic volcanic cone if tile has volcanoIntensity > 0.35 or volcanic biome
    const hasVolcano =
      !surfaceModel.isNoSurface &&
      (activeTile.volcanoIntensity > 0.35 || activeTile.biomeId === 15 || activeTile.biomeId === 22);
    const volcX = (hash2(11, 17, tileSeed) - 0.5) * 0.36;
    const volcZ = (hash2(23, 31, tileSeed) - 0.5) * 0.36;

    // Base biome & neighbor colors/heights
    const baseRgb = hexToRgb(activeTile.biomeColor);
    const lowRgb = hexToRgb(
      resolveSolidBiomeColorHex(4, surfaceModel.floraPalette, surfaceModel.compositionPalette)
    );
    const highRgb = hexToRgb(
      resolveSolidBiomeColorHex(12, surfaceModel.floraPalette, surfaceModel.compositionPalette)
    );
    const peakRgb = hexToRgb(
      resolveSolidBiomeColorHex(13, surfaceModel.floraPalette, surfaceModel.compositionPalette)
    );
    const iceRgb = hexToRgb(surfaceModel.compositionPalette.iceHex);

    const mapPointElevationAndColor = (px: number, pz: number, edgeFrac: number, wedgeIdx: number) => {
      if (surfaceModel.isNoSurface) {
        // Swirling gas giant / supercritical cloud band waves
        const wave =
          Math.sin(pz * 7.5 + fbm2D(px * 2.4, pz * 2.4, tileSeed, 4) * 3.2) * 0.05 +
          (fbm2D(px * 3.5, pz * 3.5, tileSeed + 71, 4) - 0.5) * 0.04;
        const pal = surfaceModel.atmospherePalette;
        const t = Math.max(0, Math.min(1, wave * 8 + 0.5));
        return {
          y: wave,
          seaFloorY: wave,
          r: Math.round(pal.bandDarkRgb[0] + (pal.bandLightRgb[0] - pal.bandDarkRgb[0]) * t),
          g: Math.round(pal.bandDarkRgb[1] + (pal.bandLightRgb[1] - pal.bandDarkRgb[1]) * t),
          b: Math.round(pal.bandDarkRgb[2] + (pal.bandLightRgb[2] - pal.bandDarkRgb[2]) * t),
          isWaterSurface: false,
          isLavaGlow: false,
          waterDepth: 0,
        };
      }

      // Domain-warped local FBM noise
      const wx = px + (fbm2D(px * 2.2, pz * 2.2, tileSeed + 13, 3) - 0.5) * 0.35;
      const wz = pz + (fbm2D(px * 2.2 + 7, pz * 2.2 - 5, tileSeed + 29, 3) - 0.5) * 0.35;
      const baseFbm = fbm2D(wx * 2.6 + 10, wz * 2.6 + 10, tileSeed + 53, 5);
      const ridge = ridgedFbm2D(wx * 2.8 - 4, wz * 2.8 + 6, tileSeed + 97, 4);
      const fine = fbm2D(px * 6.5, pz * 6.5, tileSeed + 149, 3) - 0.5;

      const bId = activeTile.biomeId;
      let hLocal = 0; // Relative to sea level (y = 0)

      if (activeTile.isOcean) {
        // Submerged ocean floor / abyssal trench / continental shelf
        const baseDepth = bId === 0 ? -0.34 : bId === 1 ? -0.22 : -0.10;
        hLocal = baseDepth + (baseFbm - 0.5) * 0.14 + ridge * 0.07;
      } else if (bId === 12 || bId === 13) {
        // Mountain Cordillera or Alpine Peaks
        hLocal = 0.12 + ridge * 0.42 + (baseFbm - 0.4) * 0.18 + fine * 0.04;
      } else if (bId === 11) {
        // High Plateau / Mesa Badlands (steep terraced steps)
        const rawPlat = baseFbm * 0.65 + ridge * 0.35;
        const terraced = Math.floor(rawPlat * 4.5) / 4.5 + (rawPlat * 4.5 - Math.floor(rawPlat * 4.5)) * 0.35;
        hLocal = 0.10 + terraced * 0.28 + fine * 0.025;
      } else if (activeTile.isIce) {
        // Glacial Ice Sheet / Precipitated H2O Iceberg / Cryo-Plains
        const tabular = bId === 18 ? 0.06 + baseFbm * 0.10 : 0.11 + baseFbm * 0.16 + ridge * 0.12;
        hLocal = tabular + fine * 0.02;
      } else if (bId === 10) {
        // Hyper-Arid Desert Dunes
        const duneWave = Math.abs(Math.sin((wx * 9.0 + wz * 4.0) + baseFbm * 3.0)) * 0.06;
        hLocal = 0.05 + (baseFbm - 0.3) * 0.14 + duneWave;
      } else {
        // Lowland Plains, Forest, Steppe, Tundra, Craterlands
        hLocal = 0.04 + (baseFbm - 0.38) * 0.18 + ridge * 0.09 + fine * 0.025;
      }

      // Blend outer edge (edgeFrac > 0.62) toward the adjacent Goldberg neighbor tile!
      const nbEntry = neighborTiles[wedgeIdx % neighborTiles.length];
      if (nbEntry && edgeFrac > 0.58) {
        const nbTile = nbEntry.tile;
        const blendT = Math.pow((edgeFrac - 0.58) / 0.42, 1.35) * 0.72;
        const nbTargetH = nbTile.isOcean
          ? nbTile.biomeId === 0
            ? -0.30
            : nbTile.biomeId === 1
            ? -0.18
            : -0.08
          : nbTile.biomeId === 12 || nbTile.biomeId === 13
          ? 0.28 + ridge * 0.18
          : nbTile.biomeId === 11
          ? 0.20
          : 0.08 + (baseFbm - 0.4) * 0.1;
        hLocal = hLocal * (1 - blendT) + nbTargetH * blendT;
      }

      // Apply 3D Impact Craters
      let craterRimTint = 0;
      for (let c = 0; c < craterList.length; c++) {
        const cr = craterList[c];
        const dist = Math.hypot(px - cr.cx, pz - cr.cz) / cr.radius;
        if (dist < 1.35) {
          if (dist < 0.78) {
            const bowl = Math.cos((dist / 0.78) * (Math.PI * 0.5));
            hLocal -= bowl * cr.depth;
          } else if (dist < 1.15) {
            const rim = Math.sin(((dist - 0.78) / 0.37) * Math.PI);
            hLocal += rim * cr.depth * 0.42;
            craterRimTint = Math.max(craterRimTint, rim);
          }
        }
      }

      // Apply 3D Volcanic Shield Cone & Glowing Lava Caldera
      let isCalderaLava = false;
      if (hasVolcano && !activeTile.isOcean) {
        const vDist = Math.hypot(px - volcX, pz - volcZ);
        if (vDist < 0.48) {
          if (vDist < 0.085) {
            // Sunken glowing summit lava caldera
            const calDepth = 1.0 - vDist / 0.085;
            hLocal += 0.34 - calDepth * 0.11;
            if (vDist < 0.068 && (activeTile.volcanoIntensity > 0.85 || activeTile.biomeId === 15)) {
              isCalderaLava = true;
            }
          } else {
            const cone = Math.pow(1.0 - (vDist - 0.085) / 0.395, 1.55);
            hLocal += cone * 0.34;
          }
        }
      }

      // Apply Cryotectonic Ice Fissure or Magma Rift Canyon
      let isFissureFloor = false;
      if (activeTile.fractureIntensity > 0.14 || bId === 21 || bId === 15) {
        const fissureCurve = Math.abs(px * 0.75 - pz * 0.45 + (fbm2D(px * 3.2, pz * 3.2, tileSeed + 211, 3) - 0.5) * 0.28);
        if (fissureCurve < 0.065) {
          const cleft = 1.0 - fissureCurve / 0.065;
          hLocal -= cleft * 0.11;
          if (fissureCurve < 0.028) {
            isFissureFloor = true;
          }
        }
      }

      const seaFloorY = hLocal;
      const hasSeaHere = (surfaceModel.hasLiquid || activeTile.isOcean) && hLocal < 0;
      const finalY = hasSeaHere && showWaterLayer ? 0 : hLocal;
      const waterDepth = hasSeaHere ? Math.max(0, -hLocal) : 0;

      // Determine vertex RGB color
      let r = baseRgb[0];
      let g = baseRgb[1];
      let b = baseRgb[2];
      let isLavaGlow = false;

      if (isCalderaLava || (isFissureFloor && (surfaceModel.isMoltenWorld || bId === 15))) {
        r = 251;
        g = 176;
        b = 24;
        isLavaGlow = true;
      } else if (isFissureFloor && (surfaceModel.isIcyWorld || activeTile.isIce)) {
        r = 56;
        g = 142;
        b = 198;
      } else if (hasSeaHere && showWaterLayer) {
        const pal = surfaceModel.seaPalette;
        const depthT = Math.min(1, waterDepth / 0.28);
        if (surfaceModel.isMoltenWorld || pal.solventKey === 'Silicate Magma') {
          r = Math.round(255 - depthT * 35);
          g = Math.round(168 - depthT * 82);
          b = Math.round(24 - depthT * 14);
          isLavaGlow = true;
        } else {
          const sh = pal.shallowRgb;
          const dp = pal.deepRgb;
          const tr = pal.trenchRgb;
          if (depthT < 0.5) {
            const u = depthT * 2;
            r = Math.round(sh[0] + (dp[0] - sh[0]) * u);
            g = Math.round(sh[1] + (dp[1] - sh[1]) * u);
            b = Math.round(sh[2] + (dp[2] - sh[2]) * u);
          } else {
            const u = (depthT - 0.5) * 2;
            r = Math.round(dp[0] + (tr[0] - dp[0]) * u);
            g = Math.round(dp[1] + (tr[1] - dp[1]) * u);
            b = Math.round(dp[2] + (tr[2] - dp[2]) * u);
          }
        }
      } else {
        // Solid surface elevation shading & snow/frost/mineral transitions
        if (activeTile.isIce) {
          const iceT = Math.max(0, Math.min(1, (hLocal - 0.04) / 0.28));
          r = Math.round(baseRgb[0] * (1 - iceT * 0.35) + iceRgb[0] * (iceT * 0.35));
          g = Math.round(baseRgb[1] * (1 - iceT * 0.35) + iceRgb[1] * (iceT * 0.35));
          b = Math.round(baseRgb[2] * (1 - iceT * 0.35) + iceRgb[2] * (iceT * 0.35));
        } else if (hLocal > 0.30) {
          const pkT = Math.min(1, (hLocal - 0.30) / 0.18);
          r = Math.round(highRgb[0] + (peakRgb[0] - highRgb[0]) * pkT);
          g = Math.round(highRgb[1] + (peakRgb[1] - highRgb[1]) * pkT);
          b = Math.round(highRgb[2] + (peakRgb[2] - highRgb[2]) * pkT);
        } else if (hLocal > 0.16) {
          const hiT = (hLocal - 0.16) / 0.14;
          r = Math.round(baseRgb[0] + (highRgb[0] - baseRgb[0]) * hiT);
          g = Math.round(baseRgb[1] + (highRgb[1] - baseRgb[1]) * hiT);
          b = Math.round(baseRgb[2] + (highRgb[2] - baseRgb[2]) * hiT);
        } else if (hLocal < 0.04 && surfaceModel.hasLiquid && !activeTile.isIce) {
          // Coastal beach / littoral zone near water edge
          const beachRgb = hexToRgb(surfaceModel.compositionPalette.alluvialHex);
          const cT = Math.max(0, Math.min(1, (0.04 - hLocal) / 0.04));
          r = Math.round(baseRgb[0] * (1 - cT * 0.65) + beachRgb[0] * (cT * 0.65));
          g = Math.round(baseRgb[1] * (1 - cT * 0.65) + beachRgb[1] * (cT * 0.65));
          b = Math.round(baseRgb[2] * (1 - cT * 0.65) + beachRgb[2] * (cT * 0.65));
        } else {
          const micro = (fine + 0.5) * 0.16 - 0.08;
          r = Math.max(0, Math.min(255, Math.round(baseRgb[0] * (1 + micro) + lowRgb[0] * 0.04)));
          g = Math.max(0, Math.min(255, Math.round(baseRgb[1] * (1 + micro) + lowRgb[1] * 0.04)));
          b = Math.max(0, Math.min(255, Math.round(baseRgb[2] * (1 + micro) + lowRgb[2] * 0.04)));
        }

        if (craterRimTint > 0.05 && surfaceModel.compositionPalette.iceEjectaBoost > 0) {
          const ej = craterRimTint * surfaceModel.compositionPalette.iceEjectaBoost * 0.5;
          r = Math.min(255, Math.round(r + (235 - r) * ej));
          g = Math.min(255, Math.round(g + (245 - g) * ej));
          b = Math.min(255, Math.round(b + (255 - b) * ej));
        }
      }

      return {
        y: finalY,
        seaFloorY,
        r,
        g,
        b,
        isWaterSurface: hasSeaHere && showWaterLayer,
        isLavaGlow,
        waterDepth,
      };
    };

    // Build concentric ring vertices on the hexagon/pentagon
    const vertices: LocalVertex[] = [];
    // Vertex 0: center (0, 0)
    const centerSample = mapPointElevationAndColor(0, 0, 0, 0);
    vertices.push({
      x: 0,
      z: 0,
      ...centerSample,
    });

    // Ring start indices: ring r has (sides * r) vertices
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
          const ptSample = mapPointElevationAndColor(px, pz, edgeFrac, s);
          vertices.push({
            x: px,
            z: pz,
            ...ptSample,
          });
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
        // r upright triangles between ring r-1 and ring r
        for (let k = 0; k < r; k++) {
          const vInner = r === 1 ? 0 : ringVertIdx(r - 1, s, k);
          const vOuterA = ringVertIdx(r, s, k);
          const vOuterB = ringVertIdx(r, s, k + 1);
          triangles.push({ v0: vInner, v1: vOuterA, v2: vOuterB });

          // r-1 inverted triangles
          if (k + 1 < r) {
            const vInnerNext = ringVertIdx(r - 1, s, k + 1);
            triangles.push({ v0: vInner, v1: vOuterB, v2: vInnerNext });
          }
        }
      }
    }

    // Extract outer perimeter vertex indices (ring = rings) for the 3D cutaway geological skirt
    const perimeterIndices: { vIdx: number; wedgeIdx: number }[] = [];
    for (let s = 0; s < sides; s++) {
      for (let k = 0; k < rings; k++) {
        perimeterIndices.push({ vIdx: ringVertIdx(rings, s, k), wedgeIdx: s });
      }
    }

    return {
      sides,
      corners,
      vertices,
      triangles,
      perimeterIndices,
    };
  }, [surfaceModel, activeTile, neighborTiles, showWaterLayer]);

  // Render the 3D Isometric / Perspective Hexagonal Terrain Block to Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 720;
    const H = 420;
    canvas.width = W;
    canvas.height = H;

    // 1. Sky / Space backdrop
    const radTOD = (timeOfDayDeg * Math.PI) / 180;
    const sunAlt = Math.sin(radTOD);
    const isNight = sunAlt < -0.05;

    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#070b14');
    bgGrad.addColorStop(0.55, isNight ? '#0a101d' : '#0f172a');
    bgGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle background grid lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 48) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, H);
      ctx.stroke();
    }
    for (let gy = 0; gy < H; gy += 48) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();
    }

    // 2. Camera & Light setup
    const cosY = Math.cos(rotYaw);
    const sinY = Math.sin(rotYaw);
    const cosP = Math.cos(rotPitch);
    const sinP = Math.sin(rotPitch);

    const scale = 205 * zoom;
    const cx = W * 0.5;
    const cy = H * 0.54;
    const camDist = 3.6;

    const project3D = (x: number, yElev: number, z: number) => {
      const y = yElev * verticalExag;
      // Yaw around Y axis
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;
      // Pitch around X axis
      const y2 = y * cosP - z1 * sinP;
      const z2 = y * sinP + z1 * cosP;

      const persp = camDist / Math.max(1.2, camDist + z2 * 0.55);
      return {
        sx: cx + x1 * scale * persp,
        sy: cy - y2 * scale * persp,
        depth: z2,
        rx: x1,
        ry: y2,
        rz: z2,
      };
    };

    // Light direction in local world space based on timeOfDayDeg
    const lxRaw = Math.cos(radTOD) * 0.82;
    const lyRaw = Math.max(0.18, Math.sin(radTOD) * 0.85 + 0.25);
    const lzRaw = -0.42;
    const lLen = Math.hypot(lxRaw, lyRaw, lzRaw) || 1;
    const lx = lxRaw / lLen;
    const ly = lyRaw / lLen;
    const lz = lzRaw / lLen;

    const { vertices, triangles, perimeterIndices, corners, sides } = meshData;

    // Project all top-surface vertices
    const projVerts = vertices.map((v) => project3D(v.x, v.y, v.z));

    // Build painter's algorithm draw list (top surface triangles + cutaway geological skirt quads)
    interface DrawFace {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x3?: number;
      y3?: number;
      depth: number;
      fillStyle: string;
      strokeStyle?: string;
    }

    const drawFaces: DrawFace[] = [];

    // A) Top-surface triangles
    for (let i = 0; i < triangles.length; i++) {
      const tri = triangles[i];
      const v0 = vertices[tri.v0];
      const v1 = vertices[tri.v1];
      const v2 = vertices[tri.v2];

      const p0 = projVerts[tri.v0];
      const p1 = projVerts[tri.v1];
      const p2 = projVerts[tri.v2];

      // 3D surface normal in world space
      const ux = v1.x - v0.x;
      const uy = (v1.y - v0.y) * verticalExag;
      const uz = v1.z - v0.z;
      const vx = v2.x - v0.x;
      const vy = (v2.y - v0.y) * verticalExag;
      const vz = v2.z - v0.z;

      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      if (ny < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const nLen = Math.hypot(nx, ny, nz) || 1;
      nx /= nLen;
      ny /= nLen;
      nz /= nLen;

      const ndotl = Math.max(0, nx * lx + ny * ly + nz * lz);
      const isWaterTri = v0.isWaterSurface && v1.isWaterSurface && v2.isWaterSurface;
      const isLavaTri = v0.isLavaGlow || v1.isLavaGlow || v2.isLavaGlow;

      const nightDim = isNight ? 0.38 : 1.0;
      const diff = isLavaTri ? 1.05 : (0.34 + 0.72 * ndotl) * nightDim;

      let r = Math.round(((v0.r + v1.r + v2.r) / 3) * diff);
      let g = Math.round(((v0.g + v1.g + v2.g) / 3) * diff);
      let b = Math.round(((v0.b + v1.b + v2.b) / 3) * diff);

      // Specular highlight on liquid ocean / sea surface
      if (isWaterTri && !isLavaTri && !isNight) {
        const spec = Math.pow(Math.max(0, ny * ly + nx * lx * 0.5), 16) * 0.38;
        r = Math.min(255, Math.round(r + 220 * spec));
        g = Math.min(255, Math.round(g + 240 * spec));
        b = Math.min(255, Math.round(b + 255 * spec));
      }

      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));

      const fill = `rgb(${r},${g},${b})`;
      drawFaces.push({
        x0: p0.sx,
        y0: p0.sy,
        x1: p1.sx,
        y1: p1.sy,
        x2: p2.sx,
        y2: p2.sy,
        depth: (p0.depth + p1.depth + p2.depth) / 3,
        fillStyle: fill,
        strokeStyle: showWireframe ? 'rgba(148, 163, 184, 0.25)' : fill,
      });
    }

    // B) Cutaway 3D Geological Cross-Section Skirt along the outer hexagonal/pentagonal perimeter
    const baseBottomY = -0.44;
    const crustRgb = hexToRgb(surfaceModel.compositionPalette.plateauHex);
    const mantleRgb = surfaceModel.isIcyWorld
      ? [75, 118, 158]
      : surfaceModel.isMoltenWorld
      ? [185, 58, 18]
      : [52, 46, 44];

    const pLen = perimeterIndices.length;
    for (let i = 0; i < pLen; i++) {
      const curr = perimeterIndices[i];
      const next = perimeterIndices[(i + 1) % pLen];
      const vA = vertices[curr.vIdx];
      const vB = vertices[next.vIdx];

      // Solid floor top (either land surface or submerged seafloor)
      const topFloorA = showWaterLayer ? vA.seaFloorY : vA.y;
      const topFloorB = showWaterLayer ? vB.seaFloorY : vB.y;

      const pTopA = project3D(vA.x, topFloorA, vA.z);
      const pTopB = project3D(vB.x, topFloorB, vB.z);
      const pBotB = project3D(vB.x, baseBottomY, vB.z);
      const pBotA = project3D(vA.x, baseBottomY, vA.z);

      // Outward normal of this perimeter segment in (x, z)
      const mx = (vA.x + vB.x) * 0.5;
      const mz = (vA.z + vB.z) * 0.5;
      const sideShade = 0.52 + 0.35 * Math.max(-0.5, mx * lx + mz * lz);

      const sr = Math.max(0, Math.min(255, Math.round((crustRgb[0] * 0.55 + mantleRgb[0] * 0.45) * sideShade)));
      const sg = Math.max(0, Math.min(255, Math.round((crustRgb[1] * 0.55 + mantleRgb[1] * 0.45) * sideShade)));
      const sb = Math.max(0, Math.min(255, Math.round((crustRgb[2] * 0.55 + mantleRgb[2] * 0.45) * sideShade)));

      drawFaces.push({
        x0: pTopA.sx,
        y0: pTopA.sy,
        x1: pTopB.sx,
        y1: pTopB.sy,
        x2: pBotB.sx,
        y2: pBotB.sy,
        x3: pBotA.sx,
        y3: pBotA.sy,
        depth: (pTopA.depth + pTopB.depth + pBotA.depth + pBotB.depth) * 0.25 + 0.02,
        fillStyle: `rgb(${sr},${sg},${sb})`,
        strokeStyle: `rgb(${sr},${sg},${sb})`,
      });

      // If water layer is above seafloor along this edge, draw translucent liquid cross-section wall!
      if (showWaterLayer && (vA.seaFloorY < 0 || vB.seaFloorY < 0)) {
        const pSeaA = project3D(vA.x, Math.max(0, vA.seaFloorY), vA.z);
        const pSeaB = project3D(vB.x, Math.max(0, vB.seaFloorY), vB.z);
        const pal = surfaceModel.seaPalette;
        const wr = Math.round(pal.deepRgb[0] * 0.85);
        const wg = Math.round(pal.deepRgb[1] * 0.85);
        const wb = Math.round(pal.deepRgb[2] * 0.85);
        drawFaces.push({
          x0: pSeaA.sx,
          y0: pSeaA.sy,
          x1: pSeaB.sx,
          y1: pSeaB.sy,
          x2: pTopB.sx,
          y2: pTopB.sy,
          x3: pTopA.sx,
          y3: pTopA.sy,
          depth: (pSeaA.depth + pSeaB.depth + pTopA.depth + pTopB.depth) * 0.25 + 0.01,
          fillStyle: `rgba(${wr},${wg},${wb},0.78)`,
        });
      }
    }

    // Sort back-to-front (largest depth z2 is furthest from camera)
    drawFaces.sort((a, b) => b.depth - a.depth);

    ctx.lineWidth = showWireframe ? 0.6 : 0.45;
    for (let i = 0; i < drawFaces.length; i++) {
      const f = drawFaces[i];
      ctx.fillStyle = f.fillStyle;
      ctx.beginPath();
      ctx.moveTo(f.x0, f.y0);
      ctx.lineTo(f.x1, f.y1);
      ctx.lineTo(f.x2, f.y2);
      if (f.x3 !== undefined && f.y3 !== undefined) {
        ctx.lineTo(f.x3, f.y3);
      }
      ctx.closePath();
      ctx.fill();
      if (f.strokeStyle) {
        ctx.strokeStyle = f.strokeStyle;
        ctx.stroke();
      }
    }

    // 3. Draw crisp outer Goldberg Hex/Pentagon border rim & neighbor direction labels around the 3D block
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < pLen; i++) {
      const v = vertices[perimeterIndices[i].vIdx];
      const p = project3D(v.x, v.y, v.z);
      if (i === 0) ctx.moveTo(p.sx, p.sy);
      else ctx.lineTo(p.sx, p.sy);
    }
    ctx.closePath();
    ctx.stroke();

    // Neighbor direction badges floating just outside each of the 6 (or 5) hex edges
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let s = 0; s < sides; s++) {
      const cA = corners[s];
      const cB = corners[(s + 1) % sides];
      const midX = ((cA[0] + cB[0]) * 0.5) * 1.16;
      const midZ = ((cA[1] + cB[1]) * 0.5) * 1.16;
      const pLabel = project3D(midX, 0.04, midZ);
      const nb = neighborTiles[s];
      if (!nb) continue;

      const labelText = `${nb.compass} #${nb.tile.tileId + 1}`;
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
    showWireframe,
    showWaterLayer,
    timeOfDayDeg,
    surfaceModel,
    neighborTiles,
  ]);

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Top Bar: Tile Info + Back to Globe + 3D Block Controls */}
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

          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full border border-white/30"
              style={{ backgroundColor: activeTile.biomeColor }}
            />
            <span className="text-white font-bold text-xs">
              {moon?.name || planet.planetClass} — Goldberg Tile #{activeTile.tileId + 1} ({activeTile.isPentagon ? 'Pentagon' : 'Hexagon'})
            </span>
            <span className="text-slate-400 text-[11px]">
              • {activeTile.biomeName} ({activeTile.centerLat >= 0 ? `${activeTile.centerLat}°N` : `${Math.abs(activeTile.centerLat)}°S`},{' '}
              {activeTile.centerLon >= 0 ? `${activeTile.centerLon}°E` : `${Math.abs(activeTile.centerLon)}°W`})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Mountain className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] text-slate-400">RELIEF:</span>
            <input
              type="range"
              min="0.6"
              max="2.6"
              step="0.05"
              value={verticalExag}
              onChange={(e) => setVerticalExag(+e.target.value)}
              className="w-16 accent-emerald-400 cursor-pointer"
            />
            <span className="text-[10px] text-emerald-300 w-7 font-bold">{verticalExag.toFixed(1)}×</span>
          </div>

          <div className="flex items-center gap-1">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <input
              type="range"
              min="0"
              max="360"
              value={timeOfDayDeg}
              onChange={(e) => onChangeTimeOfDay(+e.target.value)}
              className="w-16 accent-amber-400 cursor-pointer"
              title="Adjust Solar Illumination Angle"
            />
          </div>

          {surfaceModel.hasLiquid && (
            <button
              type="button"
              onClick={() => setShowWaterLayer((w) => !w)}
              className={`px-2 py-0.5 rounded border text-[10px] font-bold cursor-pointer transition ${
                showWaterLayer
                  ? 'bg-sky-950/80 border-sky-500 text-sky-200'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
              title="Toggle Liquid Ocean Volume vs Drained Bathymetry"
            >
              {showWaterLayer ? 'Liquid: On' : 'Drained Seafloor'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowWireframe((w) => !w)}
            className={`px-2 py-0.5 rounded border text-[10px] font-bold cursor-pointer transition ${
              showWireframe
                ? 'bg-indigo-950/80 border-indigo-400 text-indigo-200'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <Layers className="w-3 h-3 inline mr-1" />
            Mesh
          </button>

          <button
            type="button"
            onClick={() => {
              setRotYaw(0.62);
              setRotPitch(0.58);
              setZoom(1.0);
              setVerticalExag(1.35);
            }}
            className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer"
            title="Reset 3D Isometric Camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main 3D Isometric Terrain Block Canvas */}
      <div className="relative w-full flex flex-col items-center">
        <canvas
          ref={canvasRef}
          className={`w-full max-w-4xl h-auto rounded-lg border border-slate-800/80 shadow-2xl transition ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
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
            setRotYaw(dragRef.current.startYaw + dx * 0.012);
            setRotPitch(Math.max(0.18, Math.min(1.32, dragRef.current.startPitch + dy * 0.01)));
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
            setZoom((z) => Math.max(0.65, Math.min(1.65, +(z - e.deltaY * 0.0008).toFixed(2))));
          }}
        />

        <div className="w-full flex justify-between items-center text-[10px] text-slate-400 px-2 mt-1 flex-wrap gap-2">
          <span>
            <Sparkles className="w-3 h-3 inline text-sky-400 mr-1" />
            Linked 3D Goldberg {activeTile.isPentagon ? 'Pentagonal' : 'Hexagonal'} Terrain Block (~1,000 km Region) • Drag to rotate, scroll to zoom
          </span>
          <span>
            Mean Elev: {activeTile.elevationKm >= 0 ? `+${activeTile.elevationKm}` : activeTile.elevationKm} km (Relief Span {activeTile.reliefSpanKm} km) • Temp: {activeTile.temperatureK} K ({activeTile.temperatureC}°C)
          </span>
        </div>
      </div>

      {/* Linked Adjacent Goldberg Tiles Navigation Bar */}
      <div className="bg-slate-950/85 border border-slate-800 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mr-1">
          <Compass className="w-3.5 h-3.5 text-sky-400" />
          ADJACENT HEX NEIGHBORS (CLICK TO TRAVERSE):
        </span>
        {neighborTiles.map(({ tile, compass }) => (
          <button
            key={tile.tileId}
            type="button"
            onClick={() => onSelectTile(tile)}
            className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-sky-500/70 flex items-center gap-1.5 text-[10px] text-slate-200 cursor-pointer transition"
            title={`Jump to adjacent Goldberg Tile #${tile.tileId + 1} (${tile.biomeName})`}
          >
            <span className="text-sky-400 font-bold">{compass}</span>
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: tile.biomeColor }}
            />
            <span className="font-bold">#{tile.tileId + 1}</span>
            <span className="text-slate-400 truncate max-w-[130px]">{tile.biomeName}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
