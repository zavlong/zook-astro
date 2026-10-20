import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  RotateCcw,
  Compass,
  Sun,
  Layers,
  ArrowLeft,
  Sparkles,
  Mountain,
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
  seaFloorY: number; // Unclamped solid floor elevation (below sea level if ocean/river)
  nx: number; // Smooth vertex normal X
  ny: number; // Smooth vertex normal Y
  nz: number; // Smooth vertex normal Z
  r: number;
  g: number;
  b: number;
  isWaterSurface: boolean;
  isLavaGlow: boolean;
  waterDepth: number;
  cloudShadow: number; // [0..1] shadow cast onto ground by overhead 3D clouds
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

function compassLabelFromAzimuth(azDeg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((azDeg % 360) + 360) % 360) / 45) % 8;
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
  const [rotPitch, setRotPitch] = useState<number>(0.54); // ~31 deg immersive biome tilt
  const [zoom, setZoom] = useState<number>(1.28); // Default zoomed-in so the tile fills the viewport like a full biome
  const [verticalExag, setVerticalExag] = useState<number>(1.45);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [showWaterLayer, setShowWaterLayer] = useState<boolean>(true);
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

  // Build high-detail 3D Hexagonal / Pentagonal Biome Mesh (40 concentric rings -> ~9,600 triangles) + 3D Cloud Canopy
  const meshData = useMemo(() => {
    const sides = activeTile.isPentagon ? 5 : 6;
    const rings = 40; // High-density mesh: 6 * 40^2 = 9,600 triangles for rich micro-terrain detail!
    const tileSeed = (surfaceModel.seed * 1664525 + activeTile.tileId * 1013904223) & 0x7fffffff;

    // Corner angles in local (x, z) plane aligned with neighbor compass directions
    const corners: [number, number][] = [];
    for (let s = 0; s < sides; s++) {
      const angleRad = ((s - 0.5) * 2 * Math.PI) / sides;
      corners.push([Math.cos(angleRad), Math.sin(angleRad)]);
    }

    // Generate deterministic local craters if tile has craterIntensity
    const craterList: { cx: number; cz: number; radius: number; depth: number; hasCentralPeak: boolean }[] = [];
    if (!surfaceModel.isNoSurface && !activeTile.isOcean && (activeTile.craterIntensity > 0.04 || pBarAtmo < 0.05)) {
      const effCrater = Math.max(activeTile.craterIntensity, pBarAtmo < 0.02 ? 0.35 : 0);
      const numCraters = Math.min(11, Math.max(2, Math.round(effCrater * 18)));
      for (let c = 0; c < numCraters; c++) {
        const angle = hash2(c, 1, tileSeed) * Math.PI * 2;
        const dist = 0.08 + hash2(c, 2, tileSeed) * 0.68;
        const radius = 0.065 + hash2(c, 3, tileSeed) * 0.15;
        craterList.push({
          cx: Math.cos(angle) * dist,
          cz: Math.sin(angle) * dist,
          radius,
          depth: 0.065 + effCrater * 0.11,
          hasCentralPeak: radius > 0.14,
        });
      }
    }

    // Generate deterministic volcanic cones if tile has volcanoIntensity > 0.32 or volcanic biome
    const volcanoes: { vx: number; vz: number; radius: number; height: number; activeLava: boolean }[] = [];
    if (
      !surfaceModel.isNoSurface &&
      (activeTile.volcanoIntensity > 0.32 || activeTile.biomeId === 15 || activeTile.biomeId === 22 || surfaceModel.isMoltenWorld)
    ) {
      const count = activeTile.biomeId === 15 || surfaceModel.isMoltenWorld ? 2 : 1;
      for (let v = 0; v < count; v++) {
        volcanoes.push({
          vx: (hash2(v * 11 + 3, 17, tileSeed) - 0.5) * 0.52,
          vz: (hash2(v * 19 + 7, 31, tileSeed) - 0.5) * 0.52,
          radius: v === 0 ? 0.44 : 0.30,
          height: v === 0 ? 0.38 : 0.25,
          activeLava: activeTile.volcanoIntensity > 0.8 || activeTile.biomeId === 15 || surfaceModel.isMoltenWorld,
        });
      }
    }

    // Palette colors for rich multi-zone biome texturing
    const baseRgb = hexToRgb(activeTile.biomeColor);
    const marshRgb = hexToRgb(
      resolveSolidBiomeColorHex(3, surfaceModel.floraPalette, surfaceModel.compositionPalette)
    );
    const plainsRgb = hexToRgb(
      resolveSolidBiomeColorHex(4, surfaceModel.floraPalette, surfaceModel.compositionPalette)
    );
    const forestRgb = hexToRgb(
      resolveSolidBiomeColorHex(5, surfaceModel.floraPalette, surfaceModel.compositionPalette)
    );
    const plateauRgb = hexToRgb(
      resolveSolidBiomeColorHex(11, surfaceModel.floraPalette, surfaceModel.compositionPalette)
    );
    const highRgb = hexToRgb(
      resolveSolidBiomeColorHex(12, surfaceModel.floraPalette, surfaceModel.compositionPalette)
    );
    const peakRgb = hexToRgb(
      resolveSolidBiomeColorHex(13, surfaceModel.floraPalette, surfaceModel.compositionPalette)
    );
    const basaltRgb = hexToRgb(surfaceModel.compositionPalette.basaltHex);
    const iceRgb = hexToRgb(surfaceModel.compositionPalette.iceHex);

    // Cloud field helper so ground vertices can receive realistic overhead cloud shadows
    const effCloudCover = surfaceModel.isNoSurface
      ? 1.0
      : Math.min(1.0, activeTile.cloudCover * 0.65 + surfaceModel.cloudOpacity * 0.55);
    const sampleCloudDensityAt = (x: number, z: number): number => {
      if (effCloudCover <= 0.02 || surfaceModel.cloudOpacity <= 0.01) return 0;
      const swirl = fbm2D(x * 1.9 + 5, z * 1.9 - 3, tileSeed + 701, 4);
      const billow = fbm2D(
        x * 3.1 + (swirl - 0.5) * 0.85,
        z * 2.7 + (swirl - 0.5) * 0.85,
        tileSeed + 787,
        5
      );
      const threshold = Math.max(0.18, 0.66 - effCloudCover * 0.46);
      return Math.max(0, Math.min(1, (billow - threshold) / (1 - threshold)));
    };

    const sampleHeightOnly = (px: number, pz: number, edgeFrac: number, wedgeIdx: number): {
      hLocal: number;
      craterRimTint: number;
      isCalderaLava: boolean;
      isLavaRiver: boolean;
      isFissureFloor: boolean;
      isRiverChannel: boolean;
      baseFbm: number;
      ridge: number;
      fine: number;
      micro: number;
    } => {
      if (surfaceModel.isNoSurface) {
        const wave =
          Math.sin(pz * 8.5 + fbm2D(px * 2.8, pz * 2.8, tileSeed, 4) * 3.5) * 0.055 +
          (fbm2D(px * 4.5, pz * 4.5, tileSeed + 71, 4) - 0.5) * 0.04;
        return {
          hLocal: wave,
          craterRimTint: 0,
          isCalderaLava: false,
          isLavaRiver: false,
          isFissureFloor: false,
          isRiverChannel: false,
          baseFbm: 0.5,
          ridge: 0.5,
          fine: 0,
          micro: 0,
        };
      }

      // Multi-scale domain-warped FBM for rich local biome geomorphology
      const wx = px + (fbm2D(px * 2.5, pz * 2.5, tileSeed + 13, 3) - 0.5) * 0.38;
      const wz = pz + (fbm2D(px * 2.5 + 7, pz * 2.5 - 5, tileSeed + 29, 3) - 0.5) * 0.38;
      const baseFbm = fbm2D(wx * 3.0 + 10, wz * 3.0 + 10, tileSeed + 53, 5);
      const ridge = ridgedFbm2D(wx * 3.4 - 4, wz * 3.4 + 6, tileSeed + 97, 5);
      const fine = fbm2D(px * 8.5, pz * 8.5, tileSeed + 149, 4) - 0.5;
      const micro = fbm2D(px * 18.0, pz * 18.0, tileSeed + 313, 3) - 0.5;

      const bId = activeTile.biomeId;
      let hLocal = 0;
      let isRiverChannel = false;

      if (activeTile.isOcean) {
        // Detailed bathymetry: abyssal plains, seamount ridges, and coral/cryo-shoals
        const baseDepth = bId === 0 ? -0.34 : bId === 1 ? -0.20 : -0.08;
        const seamount = Math.pow(ridge, 1.8) * (bId === 2 ? 0.13 : 0.16);
        hLocal = baseDepth + (baseFbm - 0.5) * 0.14 + seamount + fine * 0.03;
      } else if (bId === 12 || bId === 13) {
        // Towering dendritic Mountain Cordillera & Alpine Peaks with glacial U-valleys
        const valleyCarve = Math.pow(baseFbm, 1.35);
        hLocal = 0.08 + Math.pow(ridge, 1.25) * 0.48 + valleyCarve * 0.18 + fine * 0.06 + micro * 0.025;
      } else if (bId === 11) {
        // Stratified High Plateau / Canyon Mesa Badlands with steep terraced steps & incised gorges
        const rawPlat = baseFbm * 0.62 + ridge * 0.38;
        const steps = 5.5;
        const terraced = (Math.floor(rawPlat * steps) + Math.pow((rawPlat * steps) % 1, 3.0)) / steps;
        const canyonCheck = Math.abs(fbm2D(wx * 2.2, wz * 2.2, tileSeed + 409, 4) - 0.48);
        const canyonCut = canyonCheck < 0.045 ? (1.0 - canyonCheck / 0.045) * 0.19 : 0;
        hLocal = 0.11 + terraced * 0.30 - canyonCut + fine * 0.03;
        if (canyonCut > 0.12 && surfaceModel.hasLiquid) {
          hLocal = -0.015;
          isRiverChannel = true;
        }
      } else if (activeTile.isIce) {
        // Tabular H2O Iceberg / Glacial Ice Sheet with sastrugi waves, pressure ridges, and steep coastal ice cliffs
        const sastrugi = Math.sin(wx * 16.0 + wz * 9.0 + baseFbm * 4.0) * 0.018;
        const tabular = bId === 18 ? 0.065 + baseFbm * 0.10 : 0.12 + baseFbm * 0.17 + Math.pow(ridge, 1.5) * 0.15;
        hLocal = tabular + sastrugi + fine * 0.025;
      } else if (bId === 10) {
        // Hyper-Arid Desert: sweeping barchan/transverse sand dunes + exposed rocky yardangs
        const dunePhase = wx * 12.5 + wz * 5.5 + baseFbm * 4.2;
        const sinD = Math.sin(dunePhase);
        // Asymmetric sharp dune crest
        const duneCrest = Math.pow(1.0 - Math.abs(sinD), 1.65) * 0.075;
        const rockyOutcrop = ridge > 0.72 ? (ridge - 0.72) * 0.45 : 0;
        hLocal = 0.04 + (baseFbm - 0.35) * 0.14 + duneCrest + rockyOutcrop + micro * 0.015;
      } else {
        // Lowland Plains, Forest, Coastal Marsh, Boreal Taiga, Tundra, Arid Steppe
        const hills = (baseFbm - 0.36) * 0.20 + Math.pow(ridge, 1.4) * 0.12 + fine * 0.035 + micro * 0.015;
        hLocal = (bId === 3 ? 0.015 : 0.045) + hills;

        // Carve meandering river & wetland channels on liquid-bearing worlds
        if (surfaceModel.hasLiquid && !surfaceModel.isMoltenWorld && (bId === 3 || bId === 4 || bId === 5 || bId === 6 || bId === 7)) {
          const riverField = Math.abs(fbm2D(wx * 1.85 + 3.1, wz * 1.85 - 2.4, tileSeed + 613, 4) - 0.50);
          const riverWidth = bId === 3 ? 0.058 : 0.032;
          if (riverField < riverWidth) {
            const bankT = 1.0 - riverField / riverWidth;
            hLocal -= bankT * (hLocal + 0.028);
            if (hLocal < 0.002) {
              hLocal = -0.018 * bankT;
              isRiverChannel = true;
            }
          }
        }
      }

      // Blend outer edge (edgeFrac > 0.60) toward the adjacent Goldberg neighbor tile!
      const nbEntry = neighborTiles[wedgeIdx % neighborTiles.length];
      if (nbEntry && edgeFrac > 0.60) {
        const nbTile = nbEntry.tile;
        const blendT = Math.pow((edgeFrac - 0.60) / 0.40, 1.35) * 0.76;
        const nbTargetH = nbTile.isOcean
          ? nbTile.biomeId === 0
            ? -0.30
            : nbTile.biomeId === 1
            ? -0.18
            : -0.08
          : nbTile.biomeId === 12 || nbTile.biomeId === 13
          ? 0.28 + ridge * 0.20
          : nbTile.biomeId === 11
          ? 0.22
          : 0.08 + (baseFbm - 0.4) * 0.12;
        hLocal = hLocal * (1 - blendT) + nbTargetH * blendT;
      }

      // Apply 3D Impact Craters (with terraced bowls, raised ejecta rims, and central peaks)
      let craterRimTint = 0;
      for (let c = 0; c < craterList.length; c++) {
        const cr = craterList[c];
        const dist = Math.hypot(px - cr.cx, pz - cr.cz) / cr.radius;
        if (dist < 1.38) {
          if (dist < 0.78) {
            const bowl = Math.cos((dist / 0.78) * (Math.PI * 0.5));
            hLocal -= bowl * cr.depth;
            if (cr.hasCentralPeak && dist < 0.22) {
              const peak = Math.cos((dist / 0.22) * (Math.PI * 0.5));
              hLocal += peak * cr.depth * 0.52;
            }
          } else if (dist < 1.18) {
            const rim = Math.sin(((dist - 0.78) / 0.40) * Math.PI);
            hLocal += rim * cr.depth * 0.46;
            craterRimTint = Math.max(craterRimTint, rim);
          }
        }
      }

      // Apply 3D Volcanic Shield Cones, Summit Lava Calderas & Braided Lava Channels
      let isCalderaLava = false;
      let isLavaRiver = false;
      for (let v = 0; v < volcanoes.length; v++) {
        const vc = volcanoes[v];
        const dx = px - vc.vx;
        const dz = pz - vc.vz;
        const vDist = Math.hypot(dx, dz);
        if (vDist < vc.radius) {
          const calRad = vc.radius * 0.19;
          if (vDist < calRad) {
            const calDepth = 1.0 - vDist / calRad;
            hLocal += vc.height - calDepth * (vc.height * 0.34);
            if (vDist < calRad * 0.78 && vc.activeLava) {
              isCalderaLava = true;
            }
          } else {
            const cone = Math.pow(1.0 - (vDist - calRad) / (vc.radius - calRad), 1.52);
            const radialGully = Math.sin(Math.atan2(dz, dx) * 9.0 + fine * 4.0) * 0.018 * cone;
            hLocal += cone * vc.height + radialGully;
            if (vc.activeLava && radialGully < -0.009 && cone > 0.22) {
              isLavaRiver = true;
            }
          }
        }
      }

      // Apply Cryotectonic Ice Fissure or Tectonic Magma Rift Canyon
      let isFissureFloor = false;
      if (activeTile.fractureIntensity > 0.12 || bId === 21 || bId === 15) {
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
        isCalderaLava,
        isLavaRiver,
        isFissureFloor,
        isRiverChannel,
        baseFbm,
        ridge,
        fine,
        micro,
      };
    };

    const mapPointElevationAndColor = (px: number, pz: number, edgeFrac: number, wedgeIdx: number) => {
      if (surfaceModel.isNoSurface) {
        const { hLocal } = sampleHeightOnly(px, pz, edgeFrac, wedgeIdx);
        const pal = surfaceModel.atmospherePalette;
        const t = Math.max(0, Math.min(1, hLocal * 8 + 0.5));
        return {
          y: hLocal,
          seaFloorY: hLocal,
          nx: 0,
          ny: 1,
          nz: 0,
          r: Math.round(pal.bandDarkRgb[0] + (pal.bandLightRgb[0] - pal.bandDarkRgb[0]) * t),
          g: Math.round(pal.bandDarkRgb[1] + (pal.bandLightRgb[1] - pal.bandDarkRgb[1]) * t),
          b: Math.round(pal.bandDarkRgb[2] + (pal.bandLightRgb[2] - pal.bandDarkRgb[2]) * t),
          isWaterSurface: false,
          isLavaGlow: false,
          waterDepth: 0,
          cloudShadow: 0,
        };
      }

      const centerH = sampleHeightOnly(px, pz, edgeFrac, wedgeIdx);
      const {
        hLocal,
        craterRimTint,
        isCalderaLava,
        isLavaRiver,
        isFissureFloor,
        isRiverChannel,
        baseFbm,
        ridge,
        fine,
        micro,
      } = centerH;

      // Finite-difference local slope magnitude for rock cliff exposure on steep terrain
      const eps = 0.025;
      const hx = sampleHeightOnly(px + eps, pz, edgeFrac, wedgeIdx).hLocal;
      const hz = sampleHeightOnly(px, pz + eps, edgeFrac, wedgeIdx).hLocal;
      const slope = Math.hypot(hx - hLocal, hz - hLocal) / eps;

      const seaFloorY = hLocal;
      const hasSeaHere = (surfaceModel.hasLiquid || activeTile.isOcean || isRiverChannel) && hLocal < 0;
      const finalY = hasSeaHere && showWaterLayer ? 0 : hLocal;
      const waterDepth = hasSeaHere ? Math.max(0, -hLocal) : 0;

      const bId = activeTile.biomeId;
      let r = baseRgb[0];
      let g = baseRgb[1];
      let b = baseRgb[2];
      let isLavaGlow = false;

      if (isCalderaLava || isLavaRiver || (isFissureFloor && (surfaceModel.isMoltenWorld || bId === 15))) {
        const hotT = isCalderaLava ? 1.0 : 0.72;
        r = 255;
        g = Math.round(135 + 75 * hotT);
        b = Math.round(16 + 32 * hotT);
        isLavaGlow = true;
      } else if (isFissureFloor && (surfaceModel.isIcyWorld || activeTile.isIce)) {
        r = 48;
        g = 138;
        b = 204;
      } else if (hasSeaHere && showWaterLayer) {
        const pal = surfaceModel.seaPalette;
        const depthT = Math.min(1, waterDepth / 0.26);
        if (surfaceModel.isMoltenWorld || pal.solventKey === 'Silicate Magma') {
          r = Math.round(255 - depthT * 35);
          g = Math.round(168 - depthT * 82);
          b = Math.round(24 - depthT * 14);
          isLavaGlow = true;
        } else {
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
          // Subtle shoreline foam / shoal brightening where waterDepth is very shallow
          if (waterDepth < 0.022) {
            const foam = (1.0 - waterDepth / 0.022) * 0.28;
            r = Math.min(255, Math.round(r + (235 - r) * foam));
            g = Math.min(255, Math.round(g + (245 - g) * foam));
            b = Math.min(255, Math.round(b + (255 - b) * foam));
          }
        }
      } else {
        // Rich solid-biome sub-zone texturing (vegetation patches, sedimentary strata, cliff faces, snow lines)
        if (activeTile.isIce) {
          const iceT = Math.max(0, Math.min(1, (hLocal - 0.03) / 0.28 + micro * 0.25));
          const blueCrevasse = Math.max(0, Math.min(1, (0.35 - baseFbm) * 1.8));
          r = Math.round(baseRgb[0] * (1 - iceT * 0.35) + iceRgb[0] * (iceT * 0.35) - blueCrevasse * 26);
          g = Math.round(baseRgb[1] * (1 - iceT * 0.35) + iceRgb[1] * (iceT * 0.35) - blueCrevasse * 10);
          b = Math.round(baseRgb[2] * (1 - iceT * 0.35) + iceRgb[2] * (iceT * 0.35) + blueCrevasse * 14);
        } else if (bId >= 3 && bId <= 6 && surfaceModel.floraPalette.hasAnyLife) {
          // Living biosphere: blend marsh, meadow plains, dense forest canopy, and exposed cliff rock
          const canopyPatch = Math.max(0, Math.min(1, baseFbm * 1.15 + fine * 0.45 - 0.1));
          const wetlandPatch = hLocal < 0.055 ? Math.max(0, Math.min(1, (0.055 - hLocal) / 0.055)) : 0;
          r = Math.round(plainsRgb[0] * (1 - canopyPatch) + forestRgb[0] * canopyPatch);
          g = Math.round(plainsRgb[1] * (1 - canopyPatch) + forestRgb[1] * canopyPatch);
          b = Math.round(plainsRgb[2] * (1 - canopyPatch) + forestRgb[2] * canopyPatch);
          if (wetlandPatch > 0) {
            r = Math.round(r * (1 - wetlandPatch * 0.7) + marshRgb[0] * (wetlandPatch * 0.7));
            g = Math.round(g * (1 - wetlandPatch * 0.7) + marshRgb[1] * (wetlandPatch * 0.7));
            b = Math.round(b * (1 - wetlandPatch * 0.7) + marshRgb[2] * (wetlandPatch * 0.7));
          }
        } else if (bId === 11) {
          // Sedimentary horizontal strata bands on canyon & plateau walls
          const strataWave = Math.sin(hLocal * 58.0 + fine * 2.5) * 0.5 + 0.5;
          r = Math.round(plateauRgb[0] * (0.86 + 0.24 * strataWave) + highRgb[0] * 0.06);
          g = Math.round(plateauRgb[1] * (0.84 + 0.22 * strataWave) + highRgb[1] * 0.06);
          b = Math.round(plateauRgb[2] * (0.82 + 0.20 * strataWave) + highRgb[2] * 0.06);
        } else {
          // Mineral & regolith micro-variation
          const mineralVar = fine * 0.28 + micro * 0.18;
          r = Math.round(baseRgb[0] * (1 + mineralVar));
          g = Math.round(baseRgb[1] * (1 + mineralVar * 0.92));
          b = Math.round(baseRgb[2] * (1 + mineralVar * 0.85));
        }

        // Expose steep bedrock cliff faces where terrain slope is high
        if (slope > 0.55 && !activeTile.isIce) {
          const cliffT = Math.min(0.85, (slope - 0.55) / 0.95);
          const cliffRgb = hLocal > 0.22 ? highRgb : basaltRgb;
          r = Math.round(r * (1 - cliffT) + cliffRgb[0] * cliffT);
          g = Math.round(g * (1 - cliffT) + cliffRgb[1] * cliffT);
          b = Math.round(b * (1 - cliffT) + cliffRgb[2] * cliffT);
        }

        // High-altitude alpine peak / snowline transition
        if (hLocal > 0.28) {
          const pkT = Math.min(1, (hLocal - 0.28) / 0.18 + ridge * 0.15);
          const targetPeak = activeTile.temperatureK < 305 && pBarAtmo >= 0.01 ? iceRgb : peakRgb;
          r = Math.round(r * (1 - pkT) + targetPeak[0] * pkT);
          g = Math.round(g * (1 - pkT) + targetPeak[1] * pkT);
          b = Math.round(b * (1 - pkT) + targetPeak[2] * pkT);
        } else if (hLocal < 0.032 && surfaceModel.hasLiquid && !activeTile.isIce) {
          // Coastal littoral beach / alluvial bank near water level
          const beachRgb = hexToRgb(surfaceModel.compositionPalette.alluvialHex);
          const cT = Math.max(0, Math.min(1, (0.032 - hLocal) / 0.032));
          r = Math.round(r * (1 - cT * 0.65) + beachRgb[0] * (cT * 0.65));
          g = Math.round(g * (1 - cT * 0.65) + beachRgb[1] * (cT * 0.65));
          b = Math.round(b * (1 - cT * 0.65) + beachRgb[2] * (cT * 0.65));
        }

        if (craterRimTint > 0.05 && surfaceModel.compositionPalette.iceEjectaBoost > 0) {
          const ej = craterRimTint * surfaceModel.compositionPalette.iceEjectaBoost * 0.55;
          r = Math.min(255, Math.round(r + (235 - r) * ej));
          g = Math.min(255, Math.round(g + (245 - g) * ej));
          b = Math.min(255, Math.round(b + (255 - b) * ej));
        }
      }

      // Compute cloud shadow cast onto ground vertex (offset slightly toward sun direction)
      const cloudShadow = sampleCloudDensityAt(px + 0.08, pz - 0.06);

      return {
        y: finalY,
        seaFloorY,
        nx: -(hx - hLocal) / eps,
        ny: 1.0,
        nz: -(hz - hLocal) / eps,
        r: Math.max(0, Math.min(255, r)),
        g: Math.max(0, Math.min(255, g)),
        b: Math.max(0, Math.min(255, b)),
        isWaterSurface: hasSeaHere && showWaterLayer,
        isLavaGlow,
        waterDepth,
        cloudShadow,
      };
    };

    // Build concentric ring vertices on the hexagon/pentagon
    const vertices: LocalVertex[] = [];
    const centerSample = mapPointElevationAndColor(0, 0, 0, 0);
    vertices.push({
      x: 0,
      z: 0,
      ...centerSample,
    });

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

    // Extract outer perimeter vertex indices (ring = rings) for the 3D cutaway geological skirt
    const perimeterIndices: { vIdx: number; wedgeIdx: number }[] = [];
    for (let s = 0; s < sides; s++) {
      for (let k = 0; k < rings; k++) {
        perimeterIndices.push({ vIdx: ringVertIdx(rings, s, k), wedgeIdx: s });
      }
    }

    // Build 3D Volumetric Cloud Canopy Puffs floating above the tile when atmosphere & clouds are present
    const cloudPuffs: CloudPuff3D[] = [];
    if (!surfaceModel.isNoSurface && surfaceModel.cloudOpacity > 0.015 && effCloudCover > 0.04) {
      const gridN = 13;
      for (let gx = -gridN; gx <= gridN; gx++) {
        for (let gz = -gridN; gz <= gridN; gz++) {
          const jx = (hash2(gx + 50, gz + 50, tileSeed + 901) - 0.5) * 0.09;
          const jz = (hash2(gx + 80, gz + 80, tileSeed + 947) - 0.5) * 0.09;
          const cx = (gx / gridN) * 0.88 + jx;
          const cz = (gz / gridN) * 0.88 + jz;
          if (Math.hypot(cx, cz) > 0.86) continue;

          const dens = sampleCloudDensityAt(cx, cz);
          if (dens > 0.14) {
            const isStormAnvil = dens > 0.68 && activeTile.cloudCover > 0.55;
            const baseAlt = 0.34 + (hash2(gx, gz, tileSeed + 991) - 0.5) * 0.04 + (isStormAnvil ? 0.04 : 0);
            cloudPuffs.push({
              x: cx,
              y: baseAlt,
              z: cz,
              rx: 0.075 + dens * 0.065,
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
    };
  }, [surfaceModel, activeTile, neighborTiles, showWaterLayer, pBarAtmo]);

  // Render the 3D Isometric / Perspective Hexagonal Biome Block + Atmosphere & 3D Clouds to Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 720;
    const H = 440;
    canvas.width = W;
    canvas.height = H;

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

    // Zoomed-in biome scale so the tile fills the canvas with rich detail
    const scale = 250 * zoom;
    const cx = W * 0.5;
    const cy = H * 0.57;
    const camDist = 3.5;

    const project3D = (x: number, yElev: number, z: number) => {
      const y = yElev * verticalExag;
      // Yaw around Y axis
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;
      // Pitch around X axis (+z1 is front/bottom toward viewer, -z1 is back/top away from viewer)
      const y2 = y * cosP - z1 * sinP;
      const zCam = y * sinP + z1 * cosP; // +zCam is closer to camera, -zCam is farther from camera
      const camDepth = camDist - zCam; // Larger camDepth = farther from camera

      const persp = camDist / Math.max(1.15, camDepth);
      return {
        sx: cx + x1 * scale * persp,
        sy: cy - y2 * scale * persp,
        persp,
        depth: camDepth,
        rx: x1,
        ry: y2,
        rz: zCam,
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

    const { vertices, triangles, perimeterIndices, corners, sides, cloudPuffs } = meshData;

    // Atmospheric Rayleigh/Aerosol haze RGB & strength for aerial perspective on distant terrain
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
      const domeRadius = scale * 1.18;
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

    // Project all top-surface vertices
    const projVerts = vertices.map((v) => project3D(v.x, v.y, v.z));

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

    // A) Top-surface triangles (9,600 fine triangles with smooth normals, cloud shadows, and aerial perspective haze)
    for (let i = 0; i < triangles.length; i++) {
      const tri = triangles[i];
      const v0 = vertices[tri.v0];
      const v1 = vertices[tri.v1];
      const v2 = vertices[tri.v2];

      const p0 = projVerts[tri.v0];
      const p1 = projVerts[tri.v1];
      const p2 = projVerts[tri.v2];

      // Blend triangle geometric normal with analytical finite-difference vertex normal for smooth terrain shading
      const ux = v1.x - v0.x;
      const uy = (v1.y - v0.y) * verticalExag;
      const uz = v1.z - v0.z;
      const vx = v2.x - v0.x;
      const vy = (v2.y - v0.y) * verticalExag;
      const vz = v2.z - v0.z;

      let fnx = uy * vz - uz * vy;
      let fny = uz * vx - ux * vz;
      let fnz = ux * vy - uy * vx;
      if (fny < 0) {
        fnx = -fnx;
        fny = -fny;
        fnz = -fnz;
      }
      const fLen = Math.hypot(fnx, fny, fnz) || 1;
      fnx /= fLen;
      fny /= fLen;
      fnz /= fLen;

      const vnx = (v0.nx + v1.nx + v2.nx) * (verticalExag / 3);
      const vny = 1.0;
      const vnz = (v0.nz + v1.nz + v2.nz) * (verticalExag / 3);
      const vLen = Math.hypot(vnx, vny, vnz) || 1;

      const nx = fnx * 0.45 + (vnx / vLen) * 0.55;
      const ny = fny * 0.45 + (vny / vLen) * 0.55;
      const nz = fnz * 0.45 + (vnz / vLen) * 0.55;
      const nLen = Math.hypot(nx, ny, nz) || 1;

      const ndotl = Math.max(0, (nx * lx + ny * ly + nz * lz) / nLen);
      const isWaterTri = v0.isWaterSurface && v1.isWaterSurface && v2.isWaterSurface;
      const isLavaTri = v0.isLavaGlow || v1.isLavaGlow || v2.isLavaGlow;

      // Overhead 3D cloud shadow attenuation on ground
      const meanCloudShadow = showClouds3D ? (v0.cloudShadow + v1.cloudShadow + v2.cloudShadow) / 3 : 0;
      const shadowAtten = 1.0 - meanCloudShadow * Math.min(0.42, surfaceModel.cloudOpacity * 0.48);

      const nightDim = isNight ? 0.36 : 1.0;
      const diff = isLavaTri ? 1.06 : (0.32 + 0.76 * ndotl * shadowAtten) * nightDim;

      let r = Math.round(((v0.r + v1.r + v2.r) / 3) * diff);
      let g = Math.round(((v0.g + v1.g + v2.g) / 3) * diff);
      let b = Math.round(((v0.b + v1.b + v2.b) / 3) * diff);

      // Specular highlight on liquid ocean / river / lake surface
      if (isWaterTri && !isLavaTri && !isNight) {
        const spec = Math.pow(Math.max(0, (ny / nLen) * ly + (nx / nLen) * lx * 0.5), 18) * 0.44 * shadowAtten;
        r = Math.min(255, Math.round(r + 225 * spec));
        g = Math.min(255, Math.round(g + 242 * spec));
        b = Math.min(255, Math.round(b + 255 * spec));
      }

      // Distance-based atmospheric aerial perspective haze
      const triDepth = (p0.depth + p1.depth + p2.depth) / 3;
      if (atmoDensityFactor > 0 && !isLavaTri) {
        const distNorm = Math.max(0, Math.min(1, (triDepth - 2.9) / 1.55));
        const fog = distNorm * atmoDensityFactor;
        r = Math.round(r * (1 - fog) + hazeRgb[0] * fog);
        g = Math.round(g * (1 - fog) + hazeRgb[1] * fog);
        b = Math.round(b * (1 - fog) + hazeRgb[2] * fog);
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
        depth: triDepth,
        fillStyle: fill,
        strokeStyle: showWireframe ? 'rgba(148, 163, 184, 0.25)' : fill,
      });
    }

    // B) Cutaway 3D Geological Cross-Section Skirt along the front-facing outer hexagonal/pentagonal perimeter
    const baseBottomY = -0.34;
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

      const edgeDx = vB.x - vA.x;
      const edgeDz = vB.z - vA.z;
      const mx = (vA.x + vB.x) * 0.5;
      const mz = (vA.z + vB.z) * 0.5;
      let outNx = -edgeDz;
      let outNz = edgeDx;
      if (outNx * mx + outNz * mz < 0) {
        outNx = -outNx;
        outNz = -outNz;
      }
      // Backface cull any underground skirt wall facing away from the camera
      const camNz = outNx * sinY + outNz * cosY;
      if (camNz <= 0.01) {
        continue;
      }

      const topFloorA = showWaterLayer ? vA.seaFloorY : vA.y;
      const topFloorB = showWaterLayer ? vB.seaFloorY : vB.y;

      const pTopA = project3D(vA.x, topFloorA, vA.z);
      const pTopB = project3D(vB.x, topFloorB, vB.z);
      const pBotB = project3D(vB.x, baseBottomY, vB.z);
      const pBotA = project3D(vA.x, baseBottomY, vA.z);

      const outLen = Math.hypot(outNx, outNz) || 1;
      const sideShade = 0.52 + 0.38 * Math.max(-0.4, (outNx / outLen) * lx + (outNz / outLen) * lz);

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
        depth: (pTopA.depth + pTopB.depth) * 0.5 - 0.01,
        fillStyle: `rgb(${sr},${sg},${sb})`,
        strokeStyle: `rgb(${sr},${sg},${sb})`,
      });

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
          depth: (pSeaA.depth + pSeaB.depth) * 0.5 - 0.015,
          fillStyle: `rgba(${wr},${wg},${wb},0.78)`,
        });
      }
    }

    // Sort back-to-front (largest camDepth is furthest from camera and drawn first)
    drawFaces.sort((a, b) => b.depth - a.depth);

    ctx.lineWidth = showWireframe ? 0.55 : 0.4;
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

    // 3. Draw outer Goldberg Hex/Pentagon border rim
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

    // 4. Render 3D Elevated Cloud Layer & Atmospheric Veil over the Terrain Block
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

    // 5. Neighbor direction badges floating around the perimeter of the 3D biome block
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
    showClouds3D,
    timeOfDayDeg,
    surfaceModel,
    neighborTiles,
    hasAtmosphere,
    pBarAtmo,
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
              title="Adjust Solar Illumination & Sky Time of Day"
            />
          </div>

          {!surfaceModel.isNoSurface && surfaceModel.cloudOpacity > 0.015 && (
            <button
              type="button"
              onClick={() => setShowClouds3D((c) => !c)}
              className={`px-2 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
                showClouds3D
                  ? 'bg-sky-950/80 border-sky-500 text-sky-200'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
              title="Toggle 3D Atmospheric Cloud Canopy & Cloud Shadows"
            >
              <Cloud className="w-3 h-3" />
              Clouds: {showClouds3D ? `${Math.round(meshData.effCloudCover * 100)}%` : 'Off'}
            </button>
          )}

          {surfaceModel.hasLiquid && (
            <button
              type="button"
              onClick={() => setShowWaterLayer((w) => !w)}
              className={`px-2 py-0.5 rounded border text-[10px] font-bold cursor-pointer transition ${
                showWaterLayer
                  ? 'bg-cyan-950/80 border-cyan-500 text-cyan-200'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
              title="Toggle Liquid Ocean/Rivers vs Drained Bathymetry"
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
              setRotPitch(0.54);
              setZoom(1.28);
              setVerticalExag(1.45);
            }}
            className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer"
            title="Reset 3D Biome Camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main 3D Isometric Biome Terrain Block Canvas */}
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
            setZoom((z) => Math.max(0.75, Math.min(2.4, +(z - e.deltaY * 0.001).toFixed(2))));
          }}
        />

        <div className="w-full flex justify-between items-center text-[10px] text-slate-400 px-2 mt-1 flex-wrap gap-2">
          <span>
            <Sparkles className="w-3 h-3 inline text-sky-400 mr-1" />
            High-Detail 3D Goldberg {activeTile.isPentagon ? 'Pentagonal' : 'Hexagonal'} Biome View (~9,600 Triangles + 3D Atmosphere & Clouds) • Drag to rotate, scroll to zoom
          </span>
          <span>
            Elev: {activeTile.elevationKm >= 0 ? `+${activeTile.elevationKm}` : activeTile.elevationKm} km (Relief {activeTile.reliefSpanKm} km) • Atmo: {activeTile.pressureBar} bar ({Math.round(meshData.effCloudCover * 100)}% Local Cloud Cover)
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
