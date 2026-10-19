import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Map as MapIcon,
  Globe,
  Compass,
  Sun,
  Eye,
  Layers,
  Download,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react';
import {
  RealisticPlanetBody,
  RealisticPlanetaryZone
} from '../../../core/generation/realisticStarGen';
import { RealisticMoon, RealisticStarNode } from '../../../types/astrophysics';
import {
  generatePlanetarySurfaceModel,
  sampleSurfacePoint,
  evaluateSurfaceMapBilinear,
  renderSurfaceProjectedGlobeToCanvas,
  pickLatLonFromProjectedGlobe,
  PlanetarySurfaceModel,
  SurfacePointTelemetry,
  SurfaceMapLayerType,
} from './surfaceGenMath';
import { PlanetaryChemistrySection } from './PlanetaryChemistrySection';

interface PlanetarySurfaceExplorerProps {
  planet: RealisticPlanetBody;
  moon?: RealisticMoon | null;
  zone: RealisticPlanetaryZone;
  stars: RealisticStarNode[];
}

type MapLayer = SurfaceMapLayerType;
type DisplayMode = 'map' | 'globe' | 'horizon';

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

  // Interactive 3D Globe Rotation State
  const [globeYaw, setGlobeYaw] = useState<number>(0);
  const [globePitch, setGlobePitch] = useState<number>(0);
  const [isDraggingGlobe, setIsDraggingGlobe] = useState<boolean>(false);
  const [autoSpinGlobe, setAutoSpinGlobe] = useState<boolean>(false);
  const globeDragRef = useRef<{
    startX: number;
    startY: number;
    startYaw: number;
    startPitch: number;
    moved: boolean;
  } | null>(null);
  const globeGeomRef = useRef<{ cx: number; cy: number; R: number }>({ cx: 210, cy: 170, R: 140 });

  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const globeCanvasRef = useRef<HTMLCanvasElement | null>(null);
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

  // Auto-spin loop for 3D Globe view
  useEffect(() => {
    if (displayMode !== 'globe' || !autoSpinGlobe || isDraggingGlobe) return;
    let rafId = 0;
    const step = () => {
      setGlobeYaw((prev) => (prev + 0.022) % (Math.PI * 2));
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [displayMode, autoSpinGlobe, isDraggingGlobe]);

  // Render 2D Cartographic Surface Map (2x supersampled 720x360 with bilinear sub-texel blending)
  useEffect(() => {
    if (displayMode !== 'map') return;
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 720;
    const height = 360;
    canvas.width = width;
    canvas.height = height;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let y = 0; y < height; y++) {
      const mapY = (y / height) * 180;
      for (let x = 0; x < width; x++) {
        const mapX = (x / width) * 360;
        const pIdx = (y * width + x) * 4;
        const texel = evaluateSurfaceMapBilinear(surfaceModel, mapX, mapY, activeLayer, showCloudsOverlay, true);
        data[pIdx] = texel.r;
        data[pIdx + 1] = texel.g;
        data[pIdx + 2] = texel.b;
        data[pIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Overlay Coordinate Grid & Equator if enabled
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;

      // Parallels every 30 degrees
      for (let lat = -60; lat <= 60; lat += 30) {
        const y = ((90 - lat) / 180) * height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Meridians every 60 degrees
      for (let lon = -120; lon <= 120; lon += 60) {
        const x = ((lon + 180) / 360) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Equator
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.beginPath();
      ctx.moveTo(0, height * 0.5);
      ctx.lineTo(width, height * 0.5);
      ctx.stroke();

      // Prime Meridian
      ctx.beginPath();
      ctx.moveTo(width * 0.5, 0);
      ctx.lineTo(width * 0.5, height);
      ctx.stroke();
    }

    // Draw Landing Site Marker
    const markerX = ((selectedCoords.lon + 180) / 360) * width;
    const markerY = ((90 - selectedCoords.lat) / 180) * height;

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(markerX, markerY, 9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(markerX, markerY, 3, 0, Math.PI * 2);
    ctx.fill();
  }, [displayMode, activeLayer, showCloudsOverlay, surfaceModel, showGrid, selectedCoords]);

  // Render 3D Projected Globe View (projecting the exact 360x180 surface map onto a 3D sphere + atmosphere glow)
  useEffect(() => {
    if (displayMode !== 'globe') return;
    const canvas = globeCanvasRef.current;
    if (!canvas) return;

    const isFast = isDraggingGlobe || autoSpinGlobe;
    canvas.width = isFast ? 320 : 420;
    canvas.height = isFast ? 250 : 330;

    const geom = renderSurfaceProjectedGlobeToCanvas(canvas, surfaceModel, planet, moon, {
      activeLayer,
      showCloudsOverlay,
      showGrid,
      rotYaw: globeYaw,
      rotPitch: globePitch,
      transparentBg: false,
      includeRings: !moon,
      selectedCoords,
    });
    globeGeomRef.current = geom;
  }, [
    displayMode,
    activeLayer,
    showCloudsOverlay,
    showGrid,
    globeYaw,
    globePitch,
    isDraggingGlobe,
    autoSpinGlobe,
    surfaceModel,
    planet,
    moon,
    selectedCoords,
  ]);

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

    // 6. Horizon Distant Mountain Ranges & Active Volcano Cones (Backdrop Layer tinted by crust composition)
    ctx.fillStyle = isNight ? '#0b1320' : surfaceModel.compositionPalette.mountainHex;
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
        ctx.fillStyle = isNight ? '#090d16' : surfaceModel.compositionPalette.basaltHex;
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
        ctx.lineTo(vx + 14, horizonY - 8);
        ctx.stroke();
      });
    }

    // 7. Midground Hills / Ridges (tinted by crust plateau composition)
    ctx.fillStyle = isNight ? '#080d17' : surfaceModel.compositionPalette.plateauHex;
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
    const xDeg = ((e.clientX - rect.left) / rect.width) * 360;
    const yDeg = ((e.clientY - rect.top) / rect.height) * 180;

    const lon = Math.round(Math.max(-180, Math.min(180, xDeg - 180)));
    const lat = Math.round(Math.max(-90, Math.min(90, 90 - yDeg)));

    setSelectedCoords({ lat, lon });
  };

  const handleMapMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const xDeg = ((e.clientX - rect.left) / rect.width) * 360;
    const yDeg = ((e.clientY - rect.top) / rect.height) * 180;

    const lon = Math.round(Math.max(-180, Math.min(180, xDeg - 180)));
    const lat = Math.round(Math.max(-90, Math.min(90, 90 - yDeg)));

    setHoverCoords({ lat, lon });
  };

  // Click / Hover on 3D Globe to inspect and land
  const getCoordsFromGlobeEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = globeCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const { cx, cy, R } = globeGeomRef.current;
    const tilt = (moon || planet).axialTiltDeg ?? 0;
    return pickLatLonFromProjectedGlobe(px, py, cx, cy, R, globeYaw, globePitch, tilt);
  };

  const handleDownloadMap = () => {
    const canvas = displayMode === 'globe' ? globeCanvasRef.current : mapCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${(moon?.name || planet.planetClass).toLowerCase().replace(/[^a-z0-9]/g, '_')}_${displayMode}.png`;
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
        <div className="flex items-center gap-2 flex-wrap">
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
            onClick={() => setDisplayMode('globe')}
            className={`px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1.5 transition cursor-pointer ${
              displayMode === 'globe'
                ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            3D Globe View
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

        {displayMode === 'map' || displayMode === 'globe' ? (
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
              title="Download High-Res Surface Map or Globe"
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
                Equirectangular Projection (360° × 180°) •{' '}
                {surfaceModel.isNoSurface
                  ? `${surfaceModel.atmospherePalette.classLabel} (100% Cloud Envelope)`
                  : `Crust: ${surfaceModel.compositionPalette.compositionLabel} • ${surfaceModel.atmospherePalette.classLabel} (${Math.round(surfaceModel.cloudOpacity * 100)}%)`}
              </span>
              <span>
                {surfaceModel.hasActiveGeology
                  ? `Active Geology (${surfaceModel.volcanoCount} Volcanic Cones)`
                  : 'Click anywhere on surface to deploy landing site'}
              </span>
            </div>
          </div>
        ) : displayMode === 'globe' ? (
          <div className="w-full flex flex-col items-center relative">
            {/* Top 3D Globe Orientation & Spin Controls */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-xs px-2 py-1 rounded-lg border border-slate-800 text-[10px]">
              <button
                type="button"
                onClick={() => setAutoSpinGlobe((s) => !s)}
                className={`px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition ${
                  autoSpinGlobe ? 'bg-sky-600 text-white font-bold' : 'text-slate-300 hover:text-white'
                }`}
              >
                {autoSpinGlobe ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                Spin
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoSpinGlobe(false);
                  setGlobeYaw(-0.52);
                  setGlobePitch(-0.18);
                }}
                className="px-1.5 py-0.5 rounded text-amber-300 hover:bg-slate-800 cursor-pointer"
              >
                ☀ Dayside
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoSpinGlobe(false);
                  setGlobeYaw(0);
                  setGlobePitch(0);
                }}
                className="px-1.5 py-0.5 rounded text-sky-300 hover:bg-slate-800 cursor-pointer"
              >
                ◐ Term
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoSpinGlobe(false);
                  setGlobeYaw(2.55);
                  setGlobePitch(0.18);
                }}
                className="px-1.5 py-0.5 rounded text-indigo-300 hover:bg-slate-800 cursor-pointer"
              >
                ☾ Night
              </button>
              {(Math.abs(globeYaw) > 0.01 || Math.abs(globePitch) > 0.01) && (
                <button
                  type="button"
                  onClick={() => {
                    setAutoSpinGlobe(false);
                    setGlobeYaw(0);
                    setGlobePitch(0);
                  }}
                  className="p-0.5 rounded text-slate-400 hover:text-white cursor-pointer"
                  title="Reset 3D Globe Orientation"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>

            <canvas
              ref={globeCanvasRef}
              className={`h-80 sm:h-96 w-auto rounded-lg border border-slate-800/80 shadow-2xl transition ${
                isDraggingGlobe ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                setIsDraggingGlobe(true);
                globeDragRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  startYaw: globeYaw,
                  startPitch: globePitch,
                  moved: false,
                };
              }}
              onMouseMove={(e) => {
                if (isDraggingGlobe && globeDragRef.current) {
                  const dx = e.clientX - globeDragRef.current.startX;
                  const dy = e.clientY - globeDragRef.current.startY;
                  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                    globeDragRef.current.moved = true;
                  }
                  setGlobeYaw(globeDragRef.current.startYaw - dx * 0.014);
                  setGlobePitch(Math.max(-1.35, Math.min(1.35, globeDragRef.current.startPitch + dy * 0.013)));
                } else {
                  const coords = getCoordsFromGlobeEvent(e);
                  setHoverCoords(coords);
                }
              }}
              onMouseUp={(e) => {
                if (globeDragRef.current && !globeDragRef.current.moved) {
                  const coords = getCoordsFromGlobeEvent(e);
                  if (coords) setSelectedCoords(coords);
                }
                setIsDraggingGlobe(false);
                globeDragRef.current = null;
              }}
              onMouseLeave={() => {
                setIsDraggingGlobe(false);
                globeDragRef.current = null;
                setHoverCoords(null);
              }}
            />

            {isBlankSurfaceLayer && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
                <div className="bg-slate-950/85 border border-slate-700/80 rounded-xl px-4 py-3 shadow-2xl">
                  <p className="text-sky-300 font-bold text-xs tracking-wide uppercase">
                    No Solid Surface — Continuous Fluid / Gas Envelope
                  </p>
                  <p className="text-slate-400 text-[11px] mt-1">
                    Switch to Satellite or Atmosphere (100%) to inspect the 3D spherical cloud envelope.
                  </p>
                </div>
              </div>
            )}

            <div className="w-full flex justify-between items-center text-[10px] text-slate-500 px-2 mt-1 flex-wrap gap-2">
              <span>
                3D Spherical Projection •{' '}
                {surfaceModel.isNoSurface
                  ? 'Fluid/Gas Envelope'
                  : `Crust: ${surfaceModel.compositionPalette.compositionLabel}`}{' '}
                • Drag to rotate
              </span>
              <span>
                {surfaceModel.atmospherePalette.classLabel} (Cloud Opacity {Math.round(surfaceModel.cloudOpacity * 100)}%)
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
            {displayMode !== 'horizon' && (
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

      {/* Surface & Internal Geochemistry Composition Tables */}
      <PlanetaryChemistrySection planet={planet} moon={moon} surfaceModel={surfaceModel} />
    </div>
  );
};


