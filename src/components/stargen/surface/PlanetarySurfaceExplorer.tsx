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

type MapLayer = 'satellite' | 'biomes' | 'topography' | 'temperature' | 'moisture' | 'plates';
type DisplayMode = 'map' | 'horizon';

export const PlanetarySurfaceExplorer: React.FC<PlanetarySurfaceExplorerProps> = ({
  planet,
  moon,
  zone,
  stars,
}) => {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('map');
  const [activeLayer, setActiveLayer] = useState<MapLayer>('satellite');
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
      seaLevelNormalized,
      isGasGiant,
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
        const h = hypsometry[idx];
        const isWater = !isGasGiant && hasLiquid && h <= seaLevelNormalized;

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
            const def = BIOMES.find((bm) => bm.id === biomeId) || BIOMES[4];
            const hex = def.color;
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);

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
                // Flanking oxidized salt/tholin margin tint
                const m = t / 0.4;
                r = r * (1 - m * 0.35) + 155 * (m * 0.35);
                g = g * (1 - m * 0.35) + 125 * (m * 0.35);
                b = b * (1 - m * 0.35) + 115 * (m * 0.35);
              } else {
                // Deep glacial cyan-blue fissure interior
                const c = (t - 0.4) / 0.6;
                r = r * (1 - c * 0.72) + 38 * (c * 0.72);
                g = g * (1 - c * 0.65) + 108 * (c * 0.65);
                b = b * (1 - c * 0.55) + 158 * (c * 0.55);
              }
            }

            if (activeLayer === 'satellite' && !isGasGiant) {
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
            const bumpScale = isGasGiant ? 10 : isWater ? 14 : 46;
            const nx = -dhdx * bumpScale;
            const ny = -dhdy * bumpScale;
            const nz = 1.0;
            const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
            const NdotL = (nx * Lx + ny * Ly + nz * Lz) * invLen;
            // Normal-map illumination relative to flat surface (Lz = 0.62)
            const reliefShade = isWater
              ? isMoltenWorld
                ? 0.96 + (NdotL - Lz) * 0.45
                : 0.88 + (NdotL - Lz) * 0.65
              : 0.94 + (NdotL - Lz) * 1.35;

            r = Math.max(0, Math.min(255, Math.round(r * reliefShade)));
            g = Math.max(0, Math.min(255, Math.round(g * reliefShade)));
            b = Math.max(0, Math.min(255, Math.round(b * reliefShade)));
          }
        } else if (activeLayer === 'topography') {
          if (isWater) {
            // Underwater depth tinted by solvent palette
            const depthRatio = (seaLevelNormalized - h) / Math.max(0.001, seaLevelNormalized);
            r = Math.round(seaPalette.trenchRgb[0] + (seaPalette.shallowRgb[0] - seaPalette.trenchRgb[0]) * (1 - depthRatio) * 0.75);
            g = Math.round(seaPalette.trenchRgb[1] + (seaPalette.shallowRgb[1] - seaPalette.trenchRgb[1]) * (1 - depthRatio) * 0.75);
            b = Math.round(seaPalette.trenchRgb[2] + (seaPalette.shallowRgb[2] - seaPalette.trenchRgb[2]) * (1 - depthRatio) * 0.75);
          } else {
            // Land elevation
            const altRatio = (h - seaLevelNormalized) / Math.max(0.001, 1 - seaLevelNormalized);
            if (altRatio < 0.25) {
              r = 45; g = 100 + altRatio * 100; b = 45;
            } else if (altRatio < 0.6) {
              r = 140 + (altRatio - 0.25) * 150; g = 110 + (altRatio - 0.25) * 80; b = 50;
            } else if (altRatio < 0.85) {
              r = 110; g = 95; b = 90;
            } else {
              r = 230; g = 240; b = 250; // Snow/Ice caps
            }
          }
          // Add hillshading to topography layer as well so craters and ridges are sharp
          const nx = -dhdx * 36;
          const ny = -dhdy * 36;
          const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + 1.0);
          const NdotL = (nx * Lx + ny * Ly + Lz) * invLen;
          const topoShade = 0.94 + (NdotL - Lz) * 1.15;
          r = Math.max(0, Math.min(255, Math.round(r * topoShade)));
          g = Math.max(0, Math.min(255, Math.round(g * topoShade)));
          b = Math.max(0, Math.min(255, Math.round(b * topoShade)));
        } else if (activeLayer === 'temperature') {
          const T = temperatureGrid[idx];
          // Gradient from frozen (blue/purple) to temperate (green/yellow) to scorching (red/white)
          if (T < 200) {
            r = 30; g = 20; b = 120;
          } else if (T < 273.15) {
            const t = (T - 200) / 73.15;
            r = Math.round(30 + t * 40);
            g = Math.round(50 + t * 140);
            b = Math.round(180 + t * 60);
          } else if (T < 315) {
            const t = (T - 273.15) / 41.85;
            r = Math.round(70 + t * 170);
            g = Math.round(190 + t * 50);
            b = Math.round(60 - t * 40);
          } else {
            const t = Math.min(1.0, (T - 315) / 250);
            r = Math.round(240 + t * 15);
            g = Math.round(80 - t * 70);
            b = Math.round(20 - t * 15);
          }
        } else if (activeLayer === 'moisture') {
          const absLat = Math.abs(lat);
          const isHadleyDry = absLat >= 18 && absLat <= 32;
          if (isWater) {
            r = seaPalette.shallowRgb[0];
            g = seaPalette.shallowRgb[1];
            b = seaPalette.shallowRgb[2];
          } else if (isHadleyDry) {
            r = 180; g = 140; b = 60; // Arid desert
          } else {
            const moist = Math.max(0.1, Math.min(1.0, Math.cos((absLat * Math.PI) / 180)));
            r = Math.round(40 + (1 - moist) * 100);
            g = Math.round(80 + moist * 120);
            b = Math.round(60 + moist * 140);
          }
        } else if (activeLayer === 'plates') {
          const pId = (Math.imul(Math.floor(x / 40), 7) + Math.imul(Math.floor(y / 30), 11) + surfaceModel.seed) % 8;
          const colors = [
            [220, 50, 50], [50, 180, 50], [50, 80, 220], [220, 180, 40],
            [180, 50, 220], [50, 220, 200], [220, 120, 50], [120, 120, 120]
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
  }, [displayMode, activeLayer, surfaceModel, showGrid, selectedCoords]);

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
    if (isNight) {
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
    const activePressure = (moon || planet).pressureBar ?? 0;
    if (isNight || activePressure < 0.05) {
      ctx.fillStyle = '#ffffff';
      const starCount = isNight ? 180 : 80;
      for (let i = 0; i < starCount; i++) {
        const sx = ((i * 137.5 + cameraPanDeg * 3) % w + w) % w;
        const sy = (i * 93.7) % (horizonY - 10);
        const sSize = (i % 3 === 0 ? 1.5 : 0.8);
        const sAlpha = 0.3 + ((i * 17) % 70) / 100;
        ctx.globalAlpha = sAlpha;
        ctx.fillRect(sx, sy, sSize, sSize);
      }
      ctx.globalAlpha = 1.0;
    }

    // 3. Planetary Rings in the Sky (Magnificent arch over the horizon)
    if (surfaceModel.hasRings) {
      ctx.save();
      const latRad = (selectedCoords.lat * Math.PI) / 180;
      // Ring arch curvature depends on latitude
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
      const moonX = ((m.azimuthDeg + cameraPanDeg) % 360 / 360) * w;
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

    // 6. Horizon Distant Mountain Ranges (Backdrop Layer)
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
      // Liquid Ocean / Sea with Solvent-Specific Palette & Specular Reflections
      // Molten lava oceans remain incandescent yellow-orange even at night
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

      // Specular Sun Trail on Water / Glowing Lava Ripples
      if (!isNight || surfaceModel.isMoltenWorld) {
        const sunTrailX = w * 0.5 + Math.cos(radTOD) * (w * 0.4);
        ctx.fillStyle = surfaceModel.isMoltenWorld ? 'rgba(254, 240, 138, 0.45)' : 'rgba(255, 255, 255, 0.25)';
        for (let y = horizonY + 5; y < h; y += 8) {
          const waveW = ((y - horizonY) / (h - horizonY)) * 80;
          ctx.fillRect(sunTrailX - waveW / 2 + Math.sin(y * 0.2) * 5, y, waveW, 2);
        }
      }
    } else {
      // Solid Land / Ice Shell / Basalt Crust Ground
      const bColor = currentTelemetry.biomeColor || '#3d6738';
      groundGrad.addColorStop(0, isNight && !surfaceModel.isMoltenWorld ? '#060a12' : bColor);
      groundGrad.addColorStop(1, isNight && !surfaceModel.isMoltenWorld ? '#020408' : '#101724');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      // Tectonic Fissures: Glowing Yellow-Orange Lava Cracks on Molten Worlds, or Cryo-Blue Crevasses on Icy Worlds
      if (surfaceModel.isMoltenWorld || surfaceModel.isIcyWorld) {
        ctx.save();
        for (let c = 0; c < 6; c++) {
          const baseStartX = (((c * 135 + cameraPanDeg * 3.5 + selectedCoords.lon * 4) % w) + w) % w;
          // Flanking margin glow / double-ridge highlight
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

          // Fissure core (incandescent yellow-orange lava or deep cryo-cyan ice chasm)
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
        : 'rgba(255, 255, 255, 0.15)'
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
            {(['satellite', 'biomes', 'topography', 'temperature', 'moisture', 'plates'] as MapLayer[]).map((layer) => (
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
                {layer}
              </button>
            ))}

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
          <div className="w-full flex flex-col items-center">
            <canvas
              ref={mapCanvasRef}
              onClick={handleMapClick}
              onMouseMove={handleMapMouseMove}
              onMouseLeave={() => setHoverCoords(null)}
              className="w-full max-w-4xl h-auto rounded-lg border border-slate-800/80 shadow-inner cursor-crosshair transition"
              style={{ imageRendering: 'pixelated' }}
            />
            <div className="w-full flex justify-between items-center text-[10px] text-slate-500 px-2 mt-1">
              <span>Equirectangular Cylindrical Projection (360° × 180°)</span>
              <span>Click anywhere on surface to deploy landing site</span>
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
              currentTelemetry.isOcean
                ? surfaceModel.isMoltenWorld
                  ? 'text-amber-400'
                  : 'text-sky-300'
                : 'text-emerald-300'
            }
          >
            {currentTelemetry.elevationMeters > 0
              ? `+${currentTelemetry.elevationMeters.toLocaleString()} m`
              : `${currentTelemetry.elevationMeters.toLocaleString()} m`}
          </b>
          <span className="text-[9px] text-slate-400 block">
            {currentTelemetry.isOcean
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
          <span className="text-slate-400 block text-[10px]">BAROMETRIC PRESSURE</span>
          <b className="text-white">
            {currentTelemetry.pressureBar > 0 ? `${currentTelemetry.pressureBar} bar` : 'Vacuum (0 bar)'}
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
