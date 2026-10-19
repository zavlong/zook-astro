import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Map as MapIcon,
  Compass,
  Sun,
  Eye,
  Layers,
  Download,
} from 'lucide-react';
import {
  RealisticPlanetBody,
  RealisticPlanetaryZone
} from '../../../core/generation/realisticStarGen';
import { RealisticMoon, RealisticStarNode } from '../../../types/astrophysics';
import {
  generatePlanetarySurfaceModel,
  sampleSurfacePoint,
  PlanetarySurfaceModel,
  SurfacePointTelemetry,
  BIOMES
} from './surfaceGenMath';

interface PlanetarySurfaceExplorerProps {
  planet: RealisticPlanetBody;
  moon?: RealisticMoon | null;
  zone: RealisticPlanetaryZone;
  stars: RealisticStarNode[];
}

type MapLayer = 'satellite' | 'clouds' | 'biomes' | 'topography' | 'temperature' | 'moisture' | 'plates';
type DisplayMode = 'map' | 'horizon';

export const PlanetarySurfaceExplorer: React.FC<PlanetarySurfaceExplorerProps> = ({
  planet,
  moon,
  zone,
  stars,
}) => {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('map');
  const [activeLayer, setActiveLayer] = useState<MapLayer>('satellite');
  const [showCloudsOverlay, setShowCloudsOverlay] = useState<boolean>(true);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lon: number }>({ lat: 0, lon: 0 });
  const [hoverCoords, setHoverCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [timeOfDayDeg, setTimeOfDayDeg] = useState<number>(45); // 0 = Sunrise, 90 = Noon, 180 = Sunset, 270 = Midnight
  const [cameraPanDeg, setCameraPanDeg] = useState<number>(0);
  const [showGrid, setShowGrid] = useState<boolean>(true);

  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const horizonCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Generate physics surface model
  const surfaceModel = useMemo<PlanetarySurfaceModel>(() => {
    return generatePlanetarySurfaceModel(planet, moon, zone, stars);
  }, [planet, moon, zone, stars]);

  // Selected telemetry point
  const currentTelemetry = useMemo<SurfacePointTelemetry>(() => {
    const coords = hoverCoords || selectedCoords;
    return sampleSurfacePoint(surfaceModel, planet, moon, coords.lat, coords.lon);
  }, [surfaceModel, planet, moon, hoverCoords, selectedCoords]);

  const isBlankSurfaceLayer =
    surfaceModel.isNoSurface &&
    (activeLayer === 'biomes' || activeLayer === 'topography' || activeLayer === 'moisture' || activeLayer === 'plates');

  // Render 2D Cartographic Surface Map
  useEffect(() => {
    if (displayMode !== 'map') return;
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 360;
    const height = 180;
    canvas.width = width;
    canvas.height = height;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const {
      hypsometry,
      temperatureGrid,
      biomeGrid,
      craterGrid,
      fractureGrid,
      volcanoGrid,
      cloudGrid,
      cloudOpacity,
      atmospherePalette,
      floraPalette,
      seaLevelNormalized,
      isNoSurface,
      isIcyWorld,
      isMoltenWorld,
      hasLiquid,
      seaPalette,
    } = surfaceModel;

    // Directional sun light vector for normal-map relief (from upper-left / NW)
    const Lx = -0.62;
    const Ly = -0.48;
    const Lz = 0.62;

    for (let y = 0; y < height; y++) {
      const lat = 90 - y;
      const yUp = Math.max(0, y - 1);
      const yDown = Math.min(height - 1, y + 1);

      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const pIdx = idx * 4;

        // 1. Gas Giants, Ice Giants, & Supercritical Water Worlds have NO solid surface:
        // Solid surface layers (biomes, topography, moisture, plates) are blank!
        if (isBlankSurfaceLayer) {
          data[pIdx] = 10;
          data[pIdx + 1] = 15;
          data[pIdx + 2] = 26;
          data[pIdx + 3] = 255;
          continue;
        }

        // 2. Dedicated Cloud & Atmosphere Layer OR No-Surface World in Satellite/Clouds view (100% Cloud/Atmosphere Opacity)
        if (activeLayer === 'clouds' || (isNoSurface && activeLayer === 'satellite')) {
          if (cloudOpacity <= 0.001 && !isNoSurface) {
            // Vacuum world in Clouds layer: empty dark space canvas
            data[pIdx] = 8;
            data[pIdx + 1] = 12;
            data[pIdx + 2] = 22;
            data[pIdx + 3] = 255;
            continue;
          }

          const cVal = cloudGrid[idx];
          const xLeft = (x + width - 1) % width;
          const xRight = (x + 1) % width;
          const dcdx = (cloudGrid[y * width + xRight] - cloudGrid[y * width + xLeft]) * 0.5;
          const dcdy = (cloudGrid[yDown * width + x] - cloudGrid[yUp * width + x]) * 0.5;

          let r = 0;
          let g = 0;
          let b = 0;

          if (isNoSurface) {
            // 100% Opacity Sudarsky Class I-V or Supercritical Water World (Class II water clouds in blue water atmosphere)
            if (surfaceModel.isSupercritical) {
              // Blue water atmosphere base with swirling white~grey water clouds
              const cloudCover = Math.max(0, Math.min(1, (cVal - 0.18) / 0.78));
              const greyShade = 0.76 + 0.24 * Math.sin(cVal * Math.PI);
              const cr = atmospherePalette.bandLightRgb[0] * greyShade;
              const cg = atmospherePalette.bandLightRgb[1] * greyShade;
              const cb = atmospherePalette.bandLightRgb[2] * greyShade;
              r = atmospherePalette.atmoRgb[0] * (1 - cloudCover * 0.88) + cr * (cloudCover * 0.88);
              g = atmospherePalette.atmoRgb[1] * (1 - cloudCover * 0.88) + cg * (cloudCover * 0.88);
              b = atmospherePalette.atmoRgb[2] * (1 - cloudCover * 0.88) + cb * (cloudCover * 0.88);
            } else {
              // Sudarsky Class I-V & Ice Giant zonal cloud bands
              r = atmospherePalette.bandDarkRgb[0] + (atmospherePalette.bandLightRgb[0] - atmospherePalette.bandDarkRgb[0]) * cVal;
              g = atmospherePalette.bandDarkRgb[1] + (atmospherePalette.bandLightRgb[1] - atmospherePalette.bandDarkRgb[1]) * cVal;
              b = atmospherePalette.bandDarkRgb[2] + (atmospherePalette.bandLightRgb[2] - atmospherePalette.bandDarkRgb[2]) * cVal;
            }

            // Soft 3D cloud-top relief shading
            const cnx = -dcdx * 14;
            const cny = -dcdy * 14;
            const invLen = 1.0 / Math.sqrt(cnx * cnx + cny * cny + 1.0);
            const NdotL = (cnx * Lx + cny * Ly + Lz) * invLen;
            const cloudRelief = 0.95 + (NdotL - Lz) * 0.65;
            r = Math.max(0, Math.min(255, Math.round(r * cloudRelief)));
            g = Math.max(0, Math.min(255, Math.round(g * cloudRelief)));
            b = Math.max(0, Math.min(255, Math.round(b * cloudRelief)));
          } else {
            // Solid-surface planet's Cloud & Atmosphere layer rendered over dark telemetry backdrop with proportional opacity
            const bgR = 10;
            const bgG = 15;
            const bgB = 26;
            const localAlpha = Math.min(1.0, cloudOpacity * (0.35 + 0.65 * cVal));
            const cr = atmospherePalette.atmoRgb[0] * (1 - cVal) + atmospherePalette.cloudRgb[0] * cVal;
            const cg = atmospherePalette.atmoRgb[1] * (1 - cVal) + atmospherePalette.cloudRgb[1] * cVal;
            const cb = atmospherePalette.atmoRgb[2] * (1 - cVal) + atmospherePalette.cloudRgb[2] * cVal;

            r = Math.round(bgR * (1 - localAlpha) + cr * localAlpha);
            g = Math.round(bgG * (1 - localAlpha) + cg * localAlpha);
            b = Math.round(bgB * (1 - localAlpha) + cb * localAlpha);
          }

          data[pIdx] = r;
          data[pIdx + 1] = g;
          data[pIdx + 2] = b;
          data[pIdx + 3] = 255;
          continue;
        }

        const h = hypsometry[idx];
        const volcVal = volcanoGrid[idx];
        const isWater = !isNoSurface && hasLiquid && h <= seaLevelNormalized && volcVal < 0.35;

        // Compute horizontal & vertical elevation gradients for normal map
        const xLeft = (x + width - 1) % width;
        const xRight = (x + 1) % width;
        const dhdx = (hypsometry[y * width + xRight] - hypsometry[y * width + xLeft]) * 0.5;
        const dhdy = (hypsometry[yDown * width + x] - hypsometry[yUp * width + x]) * 0.5;

        let r = 0;
        let g = 0;
        let b = 0;

        if (activeLayer === 'satellite' || activeLayer === 'biomes') {
          if (isWater) {
            // Smooth solvent-specific sea color gradient by depth
            const depthRatio = Math.max(0, Math.min(1, (seaLevelNormalized - h) / Math.max(0.001, seaLevelNormalized)));
            if (activeLayer === 'biomes') {
              const biomeId = biomeGrid[idx];
              const rgb = biomeId === 0 ? seaPalette.trenchRgb : biomeId === 1 ? seaPalette.deepRgb : seaPalette.shallowRgb;
              r = rgb[0];
              g = rgb[1];
              b = rgb[2];
            } else {
              // Continuous bathymetric color blend for Satellite view
              if (depthRatio < 0.35) {
                const t = depthRatio / 0.35;
                r = seaPalette.shallowRgb[0] + (seaPalette.deepRgb[0] - seaPalette.shallowRgb[0]) * t;
                g = seaPalette.shallowRgb[1] + (seaPalette.deepRgb[1] - seaPalette.shallowRgb[1]) * t;
                b = seaPalette.shallowRgb[2] + (seaPalette.deepRgb[2] - seaPalette.shallowRgb[2]) * t;
              } else {
                const t = (depthRatio - 0.35) / 0.65;
                r = seaPalette.deepRgb[0] + (seaPalette.trenchRgb[0] - seaPalette.deepRgb[0]) * t;
                g = seaPalette.deepRgb[1] + (seaPalette.trenchRgb[1] - seaPalette.deepRgb[1]) * t;
                b = seaPalette.deepRgb[2] + (seaPalette.trenchRgb[2] - seaPalette.deepRgb[2]) * t;
              }
            }
          } else {
            const biomeId = biomeGrid[idx];
            // Biomes 3, 4, 5, 6 use dynamic floraPalette (green ONLY for water-based life around F & G stars; barren tan if sterile)
            let hex = (BIOMES.find((bm) => bm.id === biomeId) || BIOMES[4]).color;
            if (biomeId === 3) hex = floraPalette.marshHex;
            else if (biomeId === 4) hex = floraPalette.plainsHex;
            else if (biomeId === 5) hex = floraPalette.woodlandHex;
            else if (biomeId === 6) hex = floraPalette.taigaHex;

            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);

            // Discrete Volcanoes on worlds with active geology (Earth, Venus, Io, etc.):
            // Dark basaltic volcanic cone slopes rising to a glowing yellow-orange central lava caldera
            if (volcVal > 0.15) {
              if (volcVal > 1.1) {
                // Incandescent yellow-orange summit lava caldera
                const calderaT = Math.min(1.0, (volcVal - 1.1) / 0.8);
                r = Math.round(238 + 17 * calderaT);
                g = Math.round(108 + 116 * calderaT);
                b = Math.round(14 + 34 * calderaT);
              } else {
                // Dark volcanic basalt/tephra cone edifice with warm rim glow near summit
                const coneT = Math.min(1.0, volcVal / 0.95);
                const basaltR = coneT > 0.78 ? 148 : 46;
                const basaltG = coneT > 0.78 ? 58 : 34;
                const basaltB = coneT > 0.78 ? 22 : 30;
                const blend = Math.min(0.88, coneT * 0.9);
                r = r * (1 - blend) + basaltR * blend;
                g = g * (1 - blend) + basaltG * blend;
                b = b * (1 - blend) + basaltB * blend;
              }
            }

            const crackVal = fractureGrid[idx];
            if (isMoltenWorld && crackVal > 0.08) {
              // Incandescent yellow-orange lava fissures cutting across dark basalt crust
              const t = Math.min(1.0, crackVal / 0.8);
              if (t < 0.45) {
                const m = t / 0.45;
                r = r * (1 - m * 0.85) + 235 * (m * 0.85);
                g = g * (1 - m * 0.85) + 98 * (m * 0.85);
                b = b * (1 - m * 0.85) + 12 * (m * 0.85);
              } else {
                const c = (t - 0.45) / 0.55;
                r = 235 + (255 - 235) * c;
                g = 98 + (212 - 98) * c;
                b = 12 + (42 - 12) * c;
              }
            } else if (isIcyWorld && crackVal > 0.08) {
              // Blend Europan mineral-stained double-ridge margins & deep cryo-blue chasm cores
              const t = Math.min(1.0, crackVal / 0.85);
              if (t < 0.4) {
                const m = t / 0.4;
                r = r * (1 - m * 0.35) + 155 * (m * 0.35);
                g = g * (1 - m * 0.35) + 125 * (m * 0.35);
                b = b * (1 - m * 0.35) + 115 * (m * 0.35);
              } else {
                const c = (t - 0.4) / 0.6;
                r = r * (1 - c * 0.72) + 38 * (c * 0.72);
                g = g * (1 - c * 0.65) + 108 * (c * 0.65);
                b = b * (1 - c * 0.55) + 158 * (c * 0.55);
              }
            }

            if (activeLayer === 'satellite' && !isNoSurface && volcVal <= 1.1) {
              // Subtle hypsometric tinting + crater ejecta brightening on land
              const altRatio = Math.max(0, (h - seaLevelNormalized) / Math.max(0.001, 1 - seaLevelNormalized));
              const craterBoost = craterGrid[idx] * 14;
              r = Math.min(255, r * (0.92 + altRatio * 0.22) + craterBoost);
              g = Math.min(255, g * (0.92 + altRatio * 0.22) + craterBoost);
              b = Math.min(255, b * (0.92 + altRatio * 0.22) + craterBoost * 1.05);
            }
          }

          // Apply 3D Normal-Map Relief Overlay in 'satellite' mode
          if (activeLayer === 'satellite') {
            const bumpScale = isWater ? 14 : 46;
            const nx = -dhdx * bumpScale;
            const ny = -dhdy * bumpScale;
            const nz = 1.0;
            const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
            const NdotL = (nx * Lx + ny * Ly + nz * Lz) * invLen;
            // Lava calderas remain self-luminous
            const reliefShade =
              volcVal > 1.1
                ? 1.0
                : isWater
                ? isMoltenWorld
                  ? 0.96 + (NdotL - Lz) * 0.45
                  : 0.88 + (NdotL - Lz) * 0.65
                : 0.94 + (NdotL - Lz) * 1.35;

            r = Math.max(0, Math.min(255, Math.round(r * reliefShade)));
            g = Math.max(0, Math.min(255, Math.round(g * reliefShade)));
            b = Math.max(0, Math.min(255, Math.round(b * reliefShade)));

            // Composite Cloud & Atmosphere Layer on top of Satellite surface with opacity proportional to atmospheric density
            if (showCloudsOverlay && cloudOpacity > 0.001) {
              const cVal = cloudGrid[idx];
              // Atmosphere Rayleigh/haze tint + swirling cloud decks
              const atmoTintWeight = cloudOpacity * 0.24;
              r = r * (1 - atmoTintWeight) + atmospherePalette.atmoRgb[0] * atmoTintWeight;
              g = g * (1 - atmoTintWeight) + atmospherePalette.atmoRgb[1] * atmoTintWeight;
              b = b * (1 - atmoTintWeight) + atmospherePalette.atmoRgb[2] * atmoTintWeight;

              const cloudAlpha = Math.min(0.95, cloudOpacity * Math.pow(cVal, 0.85) * 0.92);
              r = Math.round(r * (1 - cloudAlpha) + atmospherePalette.cloudRgb[0] * cloudAlpha);
              g = Math.round(g * (1 - cloudAlpha) + atmospherePalette.cloudRgb[1] * cloudAlpha);
              b = Math.round(b * (1 - cloudAlpha) + atmospherePalette.cloudRgb[2] * cloudAlpha);
            }
          }
        } else if (activeLayer === 'topography') {
          if (isWater) {
            const depthRatio = (seaLevelNormalized - h) / Math.max(0.001, seaLevelNormalized);
            r = Math.round(seaPalette.trenchRgb[0] + (seaPalette.shallowRgb[0] - seaPalette.trenchRgb[0]) * (1 - depthRatio) * 0.75);
            g = Math.round(seaPalette.trenchRgb[1] + (seaPalette.shallowRgb[1] - seaPalette.trenchRgb[1]) * (1 - depthRatio) * 0.75);
            b = Math.round(seaPalette.trenchRgb[2] + (seaPalette.shallowRgb[2] - seaPalette.trenchRgb[2]) * (1 - depthRatio) * 0.75);
          } else if (volcVal > 1.1) {
            // Active volcanic lava caldera in topography view
            r = 251; g = 191; b = 36;
          } else {
            // Land elevation: Only use green in lowland band if water-based life around F/G star! Otherwise use flora pigment or warm ochre/tan
            const altRatio = (h - seaLevelNormalized) / Math.max(0.001, 1 - seaLevelNormalized);
            if (altRatio < 0.28) {
              const t = altRatio / 0.28;
              r = Math.round(floraPalette.lowRgb[0] * (1 - t * 0.3) + 145 * (t * 0.3));
              g = Math.round(floraPalette.lowRgb[1] * (1 - t * 0.3) + 115 * (t * 0.3));
              b = Math.round(floraPalette.lowRgb[2] * (1 - t * 0.3) + 75 * (t * 0.3));
            } else if (altRatio < 0.6) {
              const t = (altRatio - 0.28) / 0.32;
              r = Math.round(145 + t * 40);
              g = Math.round(112 + t * 25);
              b = Math.round(68 - t * 12);
            } else if (altRatio < 0.85) {
              r = 115; g = 98; b = 90;
            } else {
              r = 230; g = 238; b = 248;
            }
          }
          // Add hillshading to topography layer so craters, cracks, and volcanic cones are sharp
          const nx = -dhdx * 36;
          const ny = -dhdy * 36;
          const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + 1.0);
          const NdotL = (nx * Lx + ny * Ly + Lz) * invLen;
          const topoShade = volcVal > 1.1 ? 1.0 : 0.94 + (NdotL - Lz) * 1.15;
          r = Math.max(0, Math.min(255, Math.round(r * topoShade)));
          g = Math.max(0, Math.min(255, Math.round(g * topoShade)));
          b = Math.max(0, Math.min(255, Math.round(b * topoShade)));
        } else if (activeLayer === 'temperature') {
          const T = temperatureGrid[idx];
          // Thermal palette from cryo-violet/blue to amber/red/white (no misleading green)
          if (T < 200) {
            r = 32; g = 24; b = 128;
          } else if (T < 273.15) {
            const t = (T - 200) / 73.15;
            r = Math.round(32 + t * 56);
            g = Math.round(52 + t * 128);
            b = Math.round(180 + t * 65);
          } else if (T < 320) {
            const t = (T - 273.15) / 46.85;
            r = Math.round(140 + t * 105);
            g = Math.round(185 + t * 25);
            b = Math.round(190 - t * 150);
          } else {
            const t = Math.min(1.0, (T - 320) / 250);
            r = Math.round(245 + t * 10);
            g = Math.round(140 - t * 110);
            b = Math.round(35 - t * 25);
          }
        } else if (activeLayer === 'moisture') {
          const absLat = Math.abs(lat);
          const isHadleyDry = absLat >= 18 && absLat <= 32;
          if (isWater) {
            r = seaPalette.shallowRgb[0];
            g = seaPalette.shallowRgb[1];
            b = seaPalette.shallowRgb[2];
          } else if (!hasLiquid || isHadleyDry) {
            r = 182; g = 138; b = 68; // Arid
          } else {
            const moist = Math.max(0.1, Math.min(1.0, Math.cos((absLat * Math.PI) / 180)));
            // Use cyan-blue hydrosphere moisture scale unless water-based F/G chlorophyll life is present
            if (floraPalette.hasWaterLife && surfaceModel.starTeff >= 5100 && surfaceModel.starTeff <= 6800) {
              r = Math.round(45 + (1 - moist) * 95);
              g = Math.round(85 + moist * 115);
              b = Math.round(65 + moist * 125);
            } else {
              r = Math.round(135 - moist * 85);
              g = Math.round(115 + moist * 55);
              b = Math.round(90 + moist * 135);
            }
          }
        } else if (activeLayer === 'plates') {
          const pId = (Math.imul(Math.floor(x / 40), 7) + Math.imul(Math.floor(y / 30), 11) + surfaceModel.seed) % 8;
          const colors = [
            [220, 60, 60], [60, 140, 220], [220, 170, 45], [175, 65, 215],
            [55, 195, 205], [225, 115, 50], [145, 120, 95], [115, 125, 145]
          ];
          const col = colors[Math.abs(pId) % colors.length];
          r = col[0]; g = col[1]; b = col[2];
        }

        data[pIdx] = r;
        data[pIdx + 1] = g;
        data[pIdx + 2] = b;
        data[pIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Overlay Coordinate Grid & Equator if enabled
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 0.5;

      // Parallels every 30 degrees
      for (let lat = -60; lat <= 60; lat += 30) {
        const y = 90 - lat;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Meridians every 60 degrees
      for (let lon = -120; lon <= 120; lon += 60) {
        const x = lon + 180;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Equator
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.beginPath();
      ctx.moveTo(0, 90);
      ctx.lineTo(width, 90);
      ctx.stroke();

      // Prime Meridian
      ctx.beginPath();
      ctx.moveTo(180, 0);
      ctx.lineTo(180, height);
      ctx.stroke();
    }

    // Draw Landing Site Marker
    const markerX = selectedCoords.lon + 180;
    const markerY = 90 - selectedCoords.lat;

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(markerX, markerY, 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(markerX, markerY, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }, [displayMode, activeLayer, showCloudsOverlay, isBlankSurfaceLayer, surfaceModel, showGrid, selectedCoords]);

  // Render First-Person Horizon Vista Canvas
  useEffect(() => {
    if (displayMode !== 'horizon') return;
    const canvas = horizonCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = 720;
    const h = 420;
    canvas.width = w;
    canvas.height = h;

    const horizonY = h * 0.58;

    // 1. Sky Gradient based on Time of Day & Atmosphere
    const radTOD = (timeOfDayDeg * Math.PI) / 180;
    const sunAltitude = Math.sin(radTOD); // 1 = noon, 0 = horizon, -1 = night
    const isNight = sunAltitude < -0.05;
    const isSunset = Math.abs(sunAltitude) < 0.25;

    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    if (surfaceModel.isNoSurface) {
      const pal = surfaceModel.atmospherePalette;
      const topRgb = isNight ? pal.atmoRgb.map((c) => Math.round(c * 0.25)) : pal.atmoRgb;
      const botRgb = isNight ? pal.bandDarkRgb.map((c) => Math.round(c * 0.35)) : pal.bandLightRgb;
      skyGrad.addColorStop(0, `rgb(${topRgb[0]}, ${topRgb[1]}, ${topRgb[2]})`);
      skyGrad.addColorStop(1, `rgb(${botRgb[0]}, ${botRgb[1]}, ${botRgb[2]})`);
    } else if (isNight) {
      skyGrad.addColorStop(0, '#020308');
      skyGrad.addColorStop(1, '#090e1c');
    } else if (isSunset) {
      skyGrad.addColorStop(0, '#1c1c38');
      skyGrad.addColorStop(0.5, '#5c2d38');
      skyGrad.addColorStop(1, '#d97736');
    } else {
      skyGrad.addColorStop(0, surfaceModel.skyColorHex);
      skyGrad.addColorStop(1, surfaceModel.skyHorizonHex);
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, horizonY);

    // 2. Stars at night or in thin atmosphere
    const activePressure = surfaceModel.isNoSurface ? 100 : ((moon || planet).pressureBar ?? 0);
    if (isNight || activePressure < 0.05) {
      ctx.fillStyle = '#ffffff';
      const starCount = isNight ? 180 : 80;
      for (let i = 0; i < starCount; i++) {
        const sx = ((i * 137.5 + cameraPanDeg * 3) % w + w) % w;
        const sy = (i * 93.7) % (horizonY - 10);
        const sSize = i % 3 === 0 ? 1.5 : 0.8;
        const sAlpha = 0.3 + ((i * 17) % 70) / 100;
        ctx.globalAlpha = sAlpha;
        ctx.fillRect(sx, sy, sSize, sSize);
      }
      ctx.globalAlpha = 1.0;
    }

    // 2b. Atmospheric Cloud Layer in Sky (opacity proportional to atmospheric density)
    if (surfaceModel.cloudOpacity > 0.02) {
      ctx.save();
      const cRgb = surfaceModel.atmospherePalette.cloudRgb;
      const skyCloudAlpha = isNight ? surfaceModel.cloudOpacity * 0.25 : surfaceModel.cloudOpacity * 0.65;
      ctx.fillStyle = `rgba(${cRgb[0]}, ${cRgb[1]}, ${cRgb[2]}, ${skyCloudAlpha.toFixed(2)})`;
      for (let c = 0; c < 9; c++) {
        const cx = (((c * 115 + cameraPanDeg * 2.2) % (w + 160)) + (w + 160)) % (w + 160) - 80;
        const cy = 38 + (c % 4) * 36;
        const cw = 95 + (c % 3) * 45;
        const ch = 14 + (c % 2) * 8;
        ctx.beginPath();
        ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 3. Planetary Rings in the Sky (Magnificent arch over the horizon)
    if (surfaceModel.hasRings) {
      ctx.save();
      const latRad = (selectedCoords.lat * Math.PI) / 180;
      const archHeight = horizonY - 40 - Math.abs(Math.sin(latRad)) * 140;
      const ringAlpha = isNight ? 0.35 : 0.75;

      ctx.strokeStyle = surfaceModel.ringColorHex;
      ctx.globalAlpha = ringAlpha * Math.min(1.0, surfaceModel.ringTau * 1.5);
      ctx.lineWidth = 14;

      ctx.beginPath();
      ctx.moveTo(-50, horizonY + 20);
      ctx.quadraticCurveTo(w / 2 + Math.sin(latRad) * 60, archHeight, w + 50, horizonY + 20);
      ctx.stroke();

      // Shadow cast by planet onto rings
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.arc(w / 2, archHeight, 25, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    // 4. Moons in the Sky
    surfaceModel.moonsInSky.forEach((m) => {
      const moonX = (((m.azimuthDeg + cameraPanDeg) % 360) / 360) * w;
      const moonY = horizonY - (m.altitudeDeg / 90) * (horizonY * 0.85);
      if (moonY < horizonY) {
        const radiusPx = Math.max(3, m.angularDiameterDeg * 16);
        ctx.save();
        ctx.fillStyle = m.visualColor;
        ctx.beginPath();
        ctx.arc(moonX, moonY, radiusPx, 0, Math.PI * 2);
        ctx.fill();

        // Moon phase shadow
        ctx.fillStyle = 'rgba(5, 10, 20, 0.75)';
        ctx.beginPath();
        ctx.arc(moonX + radiusPx * (1 - m.phase * 2), moonY, radiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    // 5. Host Star (Sun) with Solar Glare & Atmospheric Corona
    if (!isNight) {
      const sunX = w * 0.5 + Math.cos(radTOD) * (w * 0.4);
      const sunY = horizonY - sunAltitude * (horizonY * 0.85);
      const starRadiusPx = Math.max(6, surfaceModel.starAngularDiameterDeg * 18);

      // Glare corona
      const glareGrad = ctx.createRadialGradient(sunX, sunY, starRadiusPx * 0.5, sunX, sunY, starRadiusPx * 5);
      glareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      glareGrad.addColorStop(0.25, surfaceModel.starColorHex);
      glareGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glareGrad;
      ctx.beginPath();
      ctx.arc(sunX, sunY, starRadiusPx * 5, 0, Math.PI * 2);
      ctx.fill();

      // Sharp Stellar Disk
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sunX, sunY, starRadiusPx, 0, Math.PI * 2);
      ctx.fill();
    }

    if (surfaceModel.isNoSurface) {
      // Gas Giant, Ice Giant, or Supercritical Water World: Continuous swirling cloud deck below horizon (No Solid Surface)
      const pal = surfaceModel.atmospherePalette;
      const deckGrad = ctx.createLinearGradient(0, horizonY, 0, h);
      const lightRgb = isNight ? pal.bandLightRgb.map((c) => Math.round(c * 0.35)) : pal.bandLightRgb;
      const darkRgb = isNight ? pal.atmoRgb.map((c) => Math.round(c * 0.25)) : pal.atmoRgb;
      deckGrad.addColorStop(0, `rgb(${lightRgb[0]}, ${lightRgb[1]}, ${lightRgb[2]})`);
      deckGrad.addColorStop(1, `rgb(${darkRgb[0]}, ${darkRgb[1]}, ${darkRgb[2]})`);
      ctx.fillStyle = deckGrad;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      // Swirling cloud bands across the abyssal envelope
      for (let bIdx = 0; bIdx < 8; bIdx++) {
        const by = horizonY + 12 + bIdx * 22;
        ctx.fillStyle =
          bIdx % 2 === 0
            ? `rgba(${pal.bandLightRgb[0]}, ${pal.bandLightRgb[1]}, ${pal.bandLightRgb[2]}, ${isNight ? 0.18 : 0.42})`
            : `rgba(${pal.bandDarkRgb[0]}, ${pal.bandDarkRgb[1]}, ${pal.bandDarkRgb[2]}, ${isNight ? 0.22 : 0.45})`;
        ctx.beginPath();
        ctx.moveTo(0, by);
        for (let x = 0; x <= w; x += 24) {
          const waveY = by + Math.sin((x + cameraPanDeg * 3 + bIdx * 40) * 0.02) * 8;
          ctx.lineTo(x, waveY);
        }
        ctx.lineTo(w, by + 16);
        ctx.lineTo(0, by + 16);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }

    // 6. Horizon Distant Mountain Ranges & Active Volcano Cones (Backdrop Layer)
    ctx.fillStyle = isNight ? '#0b1320' : '#1e293b';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (let x = 0; x <= w; x += 20) {
      const peakHeight = Math.sin((x + cameraPanDeg) * 0.015) * 35 + Math.sin(x * 0.04) * 15;
      ctx.lineTo(x, horizonY - Math.max(0, peakHeight));
    }
    ctx.lineTo(w, horizonY);
    ctx.closePath();
    ctx.fill();

    // 6b. Distant Smoking Volcano Cones with Glowing Lava Calderas on Worlds with Active Geology
    if (surfaceModel.hasActiveGeology) {
      const volcPositions = [160, 490];
      volcPositions.forEach((baseVx, vIdx) => {
        const vx = (((baseVx - cameraPanDeg * 2.5) % (w + 120)) + (w + 120)) % (w + 120) - 60;
        const coneH = vIdx === 0 ? 54 : 42;
        const coneHalfW = vIdx === 0 ? 78 : 62;
        const calderaHalfW = vIdx === 0 ? 12 : 9;

        // Rising ash/SO2 plume from caldera
        const plumeGrad = ctx.createRadialGradient(vx, horizonY - coneH - 18, 4, vx, horizonY - coneH - 55, 48);
        plumeGrad.addColorStop(0, surfaceModel.isMoltenWorld ? 'rgba(251, 146, 60, 0.45)' : 'rgba(148, 163, 184, 0.35)');
        plumeGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = plumeGrad;
        ctx.beginPath();
        ctx.arc(vx, horizonY - coneH - 32, 48, 0, Math.PI * 2);
        ctx.fill();

        // Conical volcanic edifice
        ctx.fillStyle = isNight ? '#090d16' : '#261c1a';
        ctx.beginPath();
        ctx.moveTo(vx - coneHalfW, horizonY);
        ctx.lineTo(vx - calderaHalfW, horizonY - coneH);
        ctx.lineTo(vx + calderaHalfW, horizonY - coneH);
        ctx.lineTo(vx + coneHalfW, horizonY);
        ctx.closePath();
        ctx.fill();

        // Glowing yellow-orange summit lava caldera & overflow lava stream
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.ellipse(vx, horizonY - coneH + 1, calderaHalfW, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ea580c';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(vx - 2, horizonY - coneH + 3);
        ctx.quadraticCurveTo(vx + 6, horizonY - coneH * 0.5, vx + 14, horizonY - 8);
        ctx.stroke();
      });
    }

    // 7. Midground Hills / Ridges
    ctx.fillStyle = isNight ? '#080d17' : '#141e2e';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (let x = 0; x <= w; x += 15) {
      const hillH = Math.sin((x + cameraPanDeg * 1.5) * 0.02) * 22 + Math.cos(x * 0.05) * 10;
      ctx.lineTo(x, horizonY - Math.max(0, hillH) + 12);
    }
    ctx.lineTo(w, horizonY + 25);
    ctx.lineTo(0, horizonY + 25);
    ctx.closePath();
    ctx.fill();

    // 8. Foreground Ground / Ocean Surface
    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, h);
    if (currentTelemetry.isOcean) {
      groundGrad.addColorStop(
        0,
        surfaceModel.isMoltenWorld ? '#fbbf24' : isNight ? '#040b17' : surfaceModel.seaPalette.horizonTopHex
      );
      groundGrad.addColorStop(
        1,
        surfaceModel.isMoltenWorld ? '#ea580c' : isNight ? '#02050d' : surfaceModel.seaPalette.horizonBotHex
      );
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      if (!isNight || surfaceModel.isMoltenWorld) {
        const sunTrailX = w * 0.5 + Math.cos(radTOD) * (w * 0.4);
        ctx.fillStyle = surfaceModel.isMoltenWorld ? 'rgba(254, 240, 138, 0.45)' : 'rgba(255, 255, 255, 0.25)';
        for (let y = horizonY + 5; y < h; y += 8) {
          const waveW = ((y - horizonY) / (h - horizonY)) * 80;
          ctx.fillRect(sunTrailX - waveW / 2 + Math.sin(y * 0.2) * 5, y, waveW, 2);
        }
      }
    } else {
      // Solid Land / Ice Shell / Basalt Crust Ground (never defaults to green unless F/G water life)
      const bColor = currentTelemetry.biomeColor || surfaceModel.floraPalette.plainsHex;
      groundGrad.addColorStop(0, isNight && !surfaceModel.isMoltenWorld ? '#060a12' : bColor);
      groundGrad.addColorStop(1, isNight && !surfaceModel.isMoltenWorld ? '#020408' : '#101724');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      // Tectonic Fissures: Glowing Yellow-Orange Lava Cracks on Molten Worlds, or Cryo-Blue Crevasses on Icy Worlds
      if (surfaceModel.isMoltenWorld || surfaceModel.isIcyWorld) {
        ctx.save();
        for (let c = 0; c < 6; c++) {
          const baseStartX = (((c * 135 + cameraPanDeg * 3.5 + selectedCoords.lon * 4) % w) + w) % w;
          ctx.strokeStyle = surfaceModel.isMoltenWorld
            ? 'rgba(234, 88, 12, 0.75)'
            : isNight
            ? 'rgba(125, 211, 252, 0.18)'
            : 'rgba(224, 242, 254, 0.55)';
          ctx.lineWidth = 4.5;
          ctx.beginPath();
          let cx = baseStartX;
          let cy = horizonY + 4;
          ctx.moveTo(cx, cy);
          for (let step = 1; step <= 6; step++) {
            cy = horizonY + ((h - horizonY) * step) / 6;
            cx += Math.sin(c * 2.1 + step * 1.7) * 28 + (c % 2 === 0 ? 14 : -14);
            ctx.lineTo(cx, cy);
          }
          ctx.stroke();

          ctx.strokeStyle = surfaceModel.isMoltenWorld ? '#facc15' : isNight ? '#082f49' : '#0369a1';
          ctx.lineWidth = 2.2;
          ctx.stroke();
        }
        ctx.restore();
      }

      // Foreground terrain texture & boulders
      ctx.fillStyle = isNight ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.2)';
      for (let i = 0; i < 40; i++) {
        const rx = ((i * 73 + cameraPanDeg * 4) % w + w) % w;
        const ry = horizonY + 20 + ((i * 47) % (h - horizonY - 30));
        const rw = 4 + (i % 6);
        const rh = 2 + (i % 3);
        ctx.beginPath();
        ctx.ellipse(rx, ry, rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 9. Horizon Atmospheric Haze Blend
    const hazeGrad = ctx.createLinearGradient(0, horizonY - 20, 0, horizonY + 20);
    hazeGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    hazeGrad.addColorStop(
      0.5,
      surfaceModel.isMoltenWorld
        ? 'rgba(251, 146, 60, 0.28)'
        : isNight
        ? 'rgba(10, 16, 30, 0.4)'
        : `rgba(255, 255, 255, ${(0.08 + surfaceModel.cloudOpacity * 0.22).toFixed(2)})`
    );
    hazeGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = hazeGrad;
    ctx.fillRect(0, horizonY - 20, w, 40);
  }, [displayMode, surfaceModel, currentTelemetry, timeOfDayDeg, cameraPanDeg, selectedCoords, moon, planet]);

  // Click on 2D map to inspect and land
  const handleMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const lon = Math.round(Math.max(-180, Math.min(180, x - 180)));
    const lat = Math.round(Math.max(-90, Math.min(90, 90 - y)));

    setSelectedCoords({ lat, lon });
  };

  const handleMapMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const lon = Math.round(Math.max(-180, Math.min(180, x - 180)));
    const lat = Math.round(Math.max(-90, Math.min(90, 90 - y)));

    setHoverCoords({ lat, lon });
  };

  const handleDownloadMap = () => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${(moon?.name || planet.planetClass).toLowerCase().replace(/[^a-z0-9]/g, '_')}_surface_map.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div
      className="flex flex-col gap-4 font-mono text-xs select-none"
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: 'auto 720px',
      }}
    >
      {/* Surface Navigation Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#151d2c] p-3 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDisplayMode('map')}
            className={`px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1.5 transition cursor-pointer ${
              displayMode === 'map'
                ? 'bg-sky-950/80 border-sky-500 text-sky-200'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            Cartographic Map
          </button>

          <button
            type="button"
            onClick={() => setDisplayMode('horizon')}
            className={`px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1.5 transition cursor-pointer ${
              displayMode === 'horizon'
                ? 'bg-amber-950/80 border-amber-500 text-amber-200'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Ground Horizon Vista
          </button>
        </div>

        {displayMode === 'map' ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400 mr-1 flex items-center gap-1">
              <Layers className="w-3 h-3" />
              LAYER:
            </span>
            {(['satellite', 'clouds', 'biomes', 'topography', 'temperature', 'moisture', 'plates'] as MapLayer[]).map(
              (layer) => (
                <button
                  key={layer}
                  type="button"
                  onClick={() => setActiveLayer(layer)}
                  className={`px-2 py-1 rounded text-[11px] font-bold border transition capitalize cursor-pointer ${
                    activeLayer === layer
                      ? 'bg-indigo-950/80 border-indigo-400 text-indigo-200'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {layer === 'clouds' ? `Atmosphere (${Math.round(surfaceModel.cloudOpacity * 100)}%)` : layer}
                </button>
              )
            )}

            {activeLayer === 'satellite' && !surfaceModel.isNoSurface && surfaceModel.cloudOpacity > 0.001 && (
              <button
                type="button"
                onClick={() => setShowCloudsOverlay(!showCloudsOverlay)}
                className={`px-2 py-1 rounded text-[11px] border font-bold cursor-pointer transition ${
                  showCloudsOverlay
                    ? 'bg-sky-950/80 border-sky-500 text-sky-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
                title="Toggle Atmospheric & Cloud Deck Overlay on Satellite View"
              >
                Clouds: {showCloudsOverlay ? `${Math.round(surfaceModel.cloudOpacity * 100)}%` : 'Off'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowGrid(!showGrid)}
              className={`px-2 py-1 rounded text-[11px] border font-bold cursor-pointer transition ${
                showGrid
                  ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
              title="Toggle Latitude/Longitude Grid Lines"
            >
              Grid
            </button>

            <button
              type="button"
              onClick={handleDownloadMap}
              className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer ml-1"
              title="Download High-Res Surface Map"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] text-slate-400">TIME:</span>
              <input
                type="range"
                min="0"
                max="360"
                value={timeOfDayDeg}
                onChange={(e) => setTimeOfDayDeg(+e.target.value)}
                className="w-24 accent-amber-400 cursor-pointer"
              />
              <span className="text-[10px] text-amber-300 w-12 font-bold">
                {timeOfDayDeg <= 45 || timeOfDayDeg >= 315
                  ? 'Dawn'
                  : timeOfDayDeg < 135
                  ? 'Noon'
                  : timeOfDayDeg <= 225
                  ? 'Sunset'
                  : 'Night'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[10px] text-slate-400">PAN:</span>
              <input
                type="range"
                min="-180"
                max="180"
                value={cameraPanDeg}
                onChange={(e) => setCameraPanDeg(+e.target.value)}
                className="w-20 accent-sky-400 cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Visual Display Area */}
      <div className="relative bg-[#0c121d] rounded-xl border border-slate-800 p-2 overflow-hidden flex flex-col items-center">
        {displayMode === 'map' ? (
          <div className="w-full flex flex-col items-center relative">
            <canvas
              ref={mapCanvasRef}
              onClick={handleMapClick}
              onMouseMove={handleMapMouseMove}
              onMouseLeave={() => setHoverCoords(null)}
              className="w-full max-w-4xl h-auto rounded-lg border border-slate-800/80 shadow-inner cursor-crosshair transition"
              style={{ imageRendering: 'pixelated' }}
            />
            {isBlankSurfaceLayer && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
                <div className="bg-slate-950/85 border border-slate-700/80 rounded-xl px-4 py-3 shadow-2xl">
                  <p className="text-sky-300 font-bold text-xs tracking-wide uppercase">
                    No Solid Surface — Continuous Fluid / Gas Envelope
                  </p>
                  <p className="text-slate-400 text-[11px] mt-1">
                    {surfaceModel.isSupercritical
                      ? 'Supercritical water worlds lack a solid crust; switch to Satellite or Atmosphere (100%) to inspect the Class II water cloud deck.'
                      : `Gas and ice giants lack a solid surface; switch to Satellite or Atmosphere (100%) to inspect the ${surfaceModel.atmospherePalette.classLabel}.`}
                  </p>
                </div>
              </div>
            )}
            <div className="w-full flex justify-between items-center text-[10px] text-slate-500 px-2 mt-1 flex-wrap gap-2">
              <span>
                Equirectangular Projection (360° × 180°) • {surfaceModel.atmospherePalette.classLabel} (Opacity{' '}
                {Math.round(surfaceModel.cloudOpacity * 100)}%)
              </span>
              <span>
                {surfaceModel.hasActiveGeology
                  ? `Active Geology (${surfaceModel.volcanoCount} Volcanic Cones)`
                  : 'Click anywhere on surface to deploy landing site'}
              </span>
            </div>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center">
            <canvas
              ref={horizonCanvasRef}
              className="w-full max-w-4xl h-auto rounded-lg border border-slate-800/80 shadow-2xl transition"
            />
            <div className="w-full flex justify-between items-center text-[10px] text-slate-400 px-2 mt-1">
              <span>First-Person Horizon Vantage Point: Lat {selectedCoords.lat}°, Lon {selectedCoords.lon}°</span>
              <span>Host Star: {surfaceModel.starAngularDiameterDeg}° Angular Size ({surfaceModel.starTeff} K)</span>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Surface Site Telemetry Inspector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 bg-[#151d2c] p-3 rounded-xl border border-slate-800">
        <div>
          <span className="text-slate-400 block text-[10px]">COORDINATES</span>
          <b className="text-white text-xs">
            {currentTelemetry.lat >= 0 ? `${currentTelemetry.lat}°N` : `${Math.abs(currentTelemetry.lat)}°S`},{' '}
            {currentTelemetry.lon >= 0 ? `${currentTelemetry.lon}°E` : `${Math.abs(currentTelemetry.lon)}°W`}
          </b>
        </div>

        <div>
          <span className="text-slate-400 block text-[10px]">ELEVATION</span>
          <b
            className={
              surfaceModel.isNoSurface
                ? 'text-slate-400'
                : currentTelemetry.isOcean
                ? surfaceModel.isMoltenWorld
                  ? 'text-amber-400'
                  : 'text-sky-300'
                : 'text-amber-200'
            }
          >
            {surfaceModel.isNoSurface
              ? 'No Solid Surface'
              : currentTelemetry.elevationMeters > 0
              ? `+${currentTelemetry.elevationMeters.toLocaleString()} m`
              : `${currentTelemetry.elevationMeters.toLocaleString()} m`}
          </b>
          <span className="text-[9px] text-slate-400 block">
            {surfaceModel.isNoSurface
              ? '100% Cloud Envelope'
              : currentTelemetry.isOcean
              ? surfaceModel.isMoltenWorld
                ? 'Magma Depth'
                : 'Abyssal Depth'
              : `${currentTelemetry.elevationKm} km alt`}
          </span>
        </div>

        <div>
          <span className="text-slate-400 block text-[10px]">TEMPERATURE</span>
          <b className={currentTelemetry.temperatureC > 0 ? 'text-amber-300' : 'text-cyan-300'}>
            {currentTelemetry.temperatureK} K ({currentTelemetry.temperatureC}°C)
          </b>
        </div>

        <div>
          <span className="text-slate-400 block text-[10px]">ATMOSPHERE & CLOUDS</span>
          <b className="text-white">
            {surfaceModel.isNoSurface
              ? '100% Opaque Deck'
              : currentTelemetry.pressureBar > 0
              ? `${currentTelemetry.pressureBar} bar (${Math.round(surfaceModel.cloudOpacity * 100)}% cloud)`
              : 'Vacuum (0% cloud)'}
          </b>
        </div>

        <div className="col-span-2">
          <span className="text-slate-400 block text-[10px]">LOCAL BIOME & GEOLOGY</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: currentTelemetry.biomeColor }}
            />
            <b className="text-slate-200 truncate">{currentTelemetry.biome}</b>
            {displayMode === 'map' && (
              <button
                type="button"
                onClick={() => setDisplayMode('horizon')}
                className="ml-auto px-2 py-0.5 rounded bg-sky-950 hover:bg-sky-900 border border-sky-700 text-sky-200 text-[10px] font-bold cursor-pointer transition"
              >
                View Horizon
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

