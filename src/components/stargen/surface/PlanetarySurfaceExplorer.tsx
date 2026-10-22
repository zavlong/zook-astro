import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Map as MapIcon,
  Globe,
  Eye,
  Layers,
  Download,
  Play,
  Pause,
  RotateCcw,
  Hexagon,
  Sprout,
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
import {
  getPlanetaryGoldbergGrid,
  getGoldbergTileAtLatLon,
  GoldbergPlanetaryTile,
  PlanetaryGoldbergGrid,
} from './goldbergTileGrid';
import { LocalTileTerrainView } from './LocalTileTerrainView';
import { FirstPersonSurfaceView } from './FirstPersonSurfaceView';
import { PlanetaryChemistrySection } from './PlanetaryChemistrySection';
import { SurfaceEcosystemPanel } from './SurfaceEcosystemPanel';
import { generatePlantEcosystem } from '../../../core/xenobiology/floraGen';

interface PlanetarySurfaceExplorerProps {
  planet: RealisticPlanetBody;
  moon?: RealisticMoon | null;
  zone: RealisticPlanetaryZone;
  stars: RealisticStarNode[];
}

type MapLayer = SurfaceMapLayerType;
type DisplayMode = 'map' | 'globe' | 'terrain' | 'horizon';

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
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showTileGrid, setShowTileGrid] = useState<boolean>(true);
  const [showEcosystemPanel, setShowEcosystemPanel] = useState<boolean>(false);

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

  // Generate physics surface model
  const surfaceModel = useMemo<PlanetarySurfaceModel>(() => {
    return generatePlanetarySurfaceModel(planet, moon, zone, stars);
  }, [planet, moon, zone, stars]);

  // Procedural Plant Ecosystem & Xenoflora
  const ecosystem = useMemo(() => {
    return generatePlantEcosystem({
      seed: surfaceModel.seed,
      hasBiosphere: surfaceModel.hasBiosphere,
      biosphereDescription: (moon ? moon.hydrosphere?.biosphere : planet.hydrosphere?.biosphere) || undefined,
      starTeff: stars?.[0]?.Teff,
      gravityG: moon ? moon.gravityG : planet.gravityG,
      pressureBar: moon ? moon.pressureBar : planet.pressureBar,
      solventKey: surfaceModel.seaPalette?.solventKey || (moon ? moon.hydrosphere?.solvent : planet.hydrosphere?.solvent) || 'H2O',
      hasLiquid: surfaceModel.hasLiquid,
      biomeGrid: surfaceModel.biomeGrid,
    });
  }, [surfaceModel, planet, moon, stars]);

  // Generate Goldberg Polyhedron (480 Hexagons + 12 Pentagons) planetary tile grid
  const goldbergGrid = useMemo<PlanetaryGoldbergGrid>(() => {
    return getPlanetaryGoldbergGrid(surfaceModel, planet, moon);
  }, [surfaceModel, planet, moon]);

  const selectedTile = useMemo<GoldbergPlanetaryTile>(() => {
    return getGoldbergTileAtLatLon(goldbergGrid, selectedCoords.lat, selectedCoords.lon);
  }, [goldbergGrid, selectedCoords]);

  const hoveredTile = useMemo<GoldbergPlanetaryTile | null>(() => {
    if (!hoverCoords) return null;
    return getGoldbergTileAtLatLon(goldbergGrid, hoverCoords.lat, hoverCoords.lon);
  }, [goldbergGrid, hoverCoords]);

  const activeInspectedTile = hoveredTile || selectedTile;

  // Selected telemetry point (snapped to the Goldberg tile when showTileGrid or terrain/horizon mode is active)
  const currentTelemetry = useMemo<SurfacePointTelemetry>(() => {
    if (showTileGrid || displayMode === 'terrain' || displayMode === 'horizon') {
      const t = activeInspectedTile;
      return {
        lat: t.centerLat,
        lon: t.centerLon,
        elevationKm: t.elevationKm,
        elevationMeters: t.elevationMeters,
        temperatureK: t.temperatureK,
        temperatureC: t.temperatureC,
        pressureBar: t.pressureBar,
        biome: t.biomeName,
        biomeColor: t.biomeColor,
        isOcean: t.isOcean,
        featureName: t.featureName,
      };
    }
    const coords = hoverCoords || selectedCoords;
    return sampleSurfacePoint(surfaceModel, planet, moon, coords.lat, coords.lon);
  }, [surfaceModel, planet, moon, hoverCoords, selectedCoords, showTileGrid, displayMode, activeInspectedTile]);

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

  // Render 2D Cartographic Surface Map (2x supersampled 720x360 with bilinear sub-texel blending + Goldberg hex overlay)
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

    const topo = goldbergGrid.topology;
    const selTileId = selectedTile.tileId;
    const hovTileId = hoveredTile?.tileId ?? -1;

    for (let y = 0; y < height; y++) {
      const mapY = (y / height) * 180;
      const yDown = Math.min(height - 1, y + 1);
      for (let x = 0; x < width; x++) {
        const mapX = (x / width) * 360;
        const pIdx = (y * width + x) * 4;
        const texel = evaluateSurfaceMapBilinear(surfaceModel, mapX, mapY, activeLayer, showCloudsOverlay, true);
        let r = texel.r;
        let g = texel.g;
        let b = texel.b;

        if (showTileGrid && !isBlankSurfaceLayer) {
          const hIdx = y * width + x;
          const tId = topo.hiResTileId[hIdx];
          const isBorder = topo.hiResIsBorder[hIdx] === 1;
          const xRight = (x + 1) % width;
          const tRight = topo.hiResTileId[y * width + xRight];
          const tDown = topo.hiResTileId[yDown * width + x];

          const isSelBorder =
            isBorder && (tId === selTileId || tRight === selTileId || tDown === selTileId);
          const isHovBorder =
            isBorder && (tId === hovTileId || tRight === hovTileId || tDown === hovTileId);

          if (isSelBorder) {
            r = Math.round(r * 0.15 + 56 * 0.85);
            g = Math.round(g * 0.15 + 189 * 0.85);
            b = Math.round(b * 0.15 + 248 * 0.85);
          } else if (isHovBorder) {
            r = Math.round(r * 0.2 + 250 * 0.8);
            g = Math.round(g * 0.2 + 204 * 0.8);
            b = Math.round(b * 0.2 + 21 * 0.8);
          } else if (isBorder) {
            const isPent = topo.cells[tId].isPentagon;
            const alpha = isPent ? 0.42 : 0.26;
            r = Math.round(r * (1 - alpha) + (isPent ? 251 : 226) * alpha);
            g = Math.round(g * (1 - alpha) + (isPent ? 191 : 232) * alpha);
            b = Math.round(b * (1 - alpha) + (isPent ? 36 : 240) * alpha);
          } else if (tId === selTileId) {
            r = Math.round(r * 0.85 + 56 * 0.15);
            g = Math.round(g * 0.85 + 189 * 0.15);
            b = Math.round(b * 0.85 + 248 * 0.15);
          } else if (tId === hovTileId) {
            r = Math.round(r * 0.9 + 250 * 0.1);
            g = Math.round(g * 0.9 + 204 * 0.1);
            b = Math.round(b * 0.9 + 21 * 0.1);
          }
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

    // Draw Landing Site / Selected Tile Center Marker
    const markerLon = showTileGrid ? selectedTile.centerLon : selectedCoords.lon;
    const markerLat = showTileGrid ? selectedTile.centerLat : selectedCoords.lat;
    const markerX = ((markerLon + 180) / 360) * width;
    const markerY = ((90 - markerLat) / 180) * height;

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(markerX, markerY, 7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(markerX, markerY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }, [
    displayMode,
    activeLayer,
    showCloudsOverlay,
    surfaceModel,
    showGrid,
    showTileGrid,
    selectedCoords,
    selectedTile,
    hoveredTile,
    goldbergGrid,
    isBlankSurfaceLayer,
  ]);

  // Render 3D Projected Globe View (projecting the exact 360x180 surface map onto a 3D sphere + Goldberg hex overlay)
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
      selectedCoords: showTileGrid
        ? { lat: selectedTile.centerLat, lon: selectedTile.centerLon }
        : selectedCoords,
      goldbergOverlay: showTileGrid
        ? {
            texelTileId: goldbergGrid.topology.texelTileId,
            cells: goldbergGrid.topology.cells,
            selectedTileId: selectedTile.tileId,
            hoveredTileId: hoveredTile?.tileId ?? null,
          }
        : null,
    });
    globeGeomRef.current = geom;
  }, [
    displayMode,
    activeLayer,
    showCloudsOverlay,
    showGrid,
    showTileGrid,
    globeYaw,
    globePitch,
    isDraggingGlobe,
    autoSpinGlobe,
    surfaceModel,
    planet,
    moon,
    selectedCoords,
    selectedTile,
    hoveredTile,
    goldbergGrid,
  ]);

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

  // Double-click on 2D map tile to open the linked 3D Local Terrain Block
  const handleMapDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const xDeg = ((e.clientX - rect.left) / rect.width) * 360;
    const yDeg = ((e.clientY - rect.top) / rect.height) * 180;

    const lon = Math.round(Math.max(-180, Math.min(180, xDeg - 180)));
    const lat = Math.round(Math.max(-90, Math.min(90, 90 - yDeg)));

    setSelectedCoords({ lat, lon });
    setDisplayMode('terrain');
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
            onClick={() => setDisplayMode('terrain')}
            className={`px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1.5 transition cursor-pointer ${
              displayMode === 'terrain'
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Inspect 3D Isometric Terrain Block for the selected Goldberg Tile (or double-click any tile)"
          >
            <Hexagon className="w-3.5 h-3.5" />
            3D Tile Terrain
          </button>

          <button
            type="button"
            onClick={() => setDisplayMode('horizon')}
            className={`px-3 py-1.5 rounded-lg border font-bold flex items-center gap-1.5 transition cursor-pointer ${
              displayMode === 'horizon'
                ? 'bg-amber-950/80 border-amber-500 text-amber-200'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Explore the active Goldberg Tile in a real-time 3D First-Person Surface View (WASD + Mouse Look)"
          >
            <Eye className="w-3.5 h-3.5" />
            First-Person View
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
              onClick={() => setShowTileGrid(!showTileGrid)}
              className={`px-2 py-1 rounded text-[11px] border font-bold flex items-center gap-1 cursor-pointer transition ${
                showTileGrid
                  ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
              title="Toggle Goldberg Polyhedron (480 Hexagons + 12 Pentagons) Tile Grid Overlay & Per-Tile Snapping"
            >
              <Hexagon className="w-3 h-3" />
              Hex Tiles
            </button>

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
              onClick={() => setShowEcosystemPanel(prev => !prev)}
              className={`px-2 py-1 rounded text-[11px] border font-bold flex items-center gap-1.5 cursor-pointer transition ${
                showEcosystemPanel
                  ? 'bg-emerald-900 border-emerald-400 text-emerald-200 shadow-md shadow-emerald-950/40'
                  : surfaceModel.hasBiosphere
                  ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/50'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
              }`}
              title="Toggle Indigenous Xenoflora & Ecosystem Species Catalog"
            >
              <Sprout className="w-3.5 h-3.5 text-emerald-400" />
              <span>Flora</span>
              {surfaceModel.hasBiosphere && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
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
        ) : null}
      </div>

      {/* Main Visual Display Area */}
      <div className="relative bg-[#0c121d] rounded-xl border border-slate-800 p-2 overflow-hidden flex flex-col items-center">
        {displayMode === 'map' ? (
          <div className="w-full flex flex-col items-center relative">
            <canvas
              ref={mapCanvasRef}
              onClick={handleMapClick}
              onDoubleClick={handleMapDoubleClick}
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
                {showTileGrid ? `Goldberg Grid (${goldbergGrid.tileCount} Tiles: 480 Hex, 12 Pent) • Double-click tile for 3D Terrain` : surfaceModel.isNoSurface
                  ? `${surfaceModel.atmospherePalette.classLabel} (100% Cloud Envelope)`
                  : `Crust: ${surfaceModel.compositionPalette.compositionLabel}`}
              </span>
              <span>
                Weather: {surfaceModel.weatherRegime}
                {surfaceModel.hasActiveGeology ? ` • Active Geology (${surfaceModel.volcanoCount} Cones)` : ''}
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
              onDoubleClick={(e) => {
                const coords = getCoordsFromGlobeEvent(e);
                if (coords) {
                  setSelectedCoords(coords);
                  setDisplayMode('terrain');
                }
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
                {showTileGrid
                  ? `Goldberg Grid (${goldbergGrid.tileCount} Tiles) • Double-click tile to open 3D Terrain`
                  : surfaceModel.isNoSurface
                  ? 'Fluid/Gas Envelope'
                  : `Crust: ${surfaceModel.compositionPalette.compositionLabel}`}{' '}
                • Drag to rotate
              </span>
              <span>
                {surfaceModel.weatherRegime} • {surfaceModel.atmospherePalette.classLabel} ({Math.round(surfaceModel.cloudOpacity * 100)}%)
              </span>
            </div>
          </div>
        ) : displayMode === 'terrain' ? (
          <LocalTileTerrainView
            surfaceModel={surfaceModel}
            goldbergGrid={goldbergGrid}
            activeTile={selectedTile}
            planet={planet}
            moon={moon}
            timeOfDayDeg={timeOfDayDeg}
            onChangeTimeOfDay={setTimeOfDayDeg}
            onSelectTile={(nextTile) =>
              React.startTransition(() => {
                setSelectedCoords({
                  lat: Math.round(nextTile.centerLat),
                  lon: Math.round(nextTile.centerLon),
                });
              })
            }
            onBackToGlobe={() => setDisplayMode('globe')}
          />
        ) : (
          <FirstPersonSurfaceView
            surfaceModel={surfaceModel}
            goldbergGrid={goldbergGrid}
            activeTile={selectedTile}
            planet={planet}
            moon={moon}
            timeOfDayDeg={timeOfDayDeg}
            onChangeTimeOfDay={setTimeOfDayDeg}
            onSelectTile={(nextTile) =>
              React.startTransition(() => {
                setSelectedCoords({
                  lat: Math.round(nextTile.centerLat),
                  lon: Math.round(nextTile.centerLon),
                });
              })
            }
            onSwitchToBlockView={() => setDisplayMode('terrain')}
          />
        )}
      </div>

      {/* Interactive Surface Site Telemetry Inspector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 bg-[#151d2c] p-3 rounded-xl border border-slate-800">
        <div>
          <span className="text-sky-400 font-bold block text-[10px]">
            LAT / LONG
          </span>
          <b className="text-sky-200 font-mono text-sm">
            {currentTelemetry.lat >= 0 ? `${currentTelemetry.lat}°N` : `${Math.abs(currentTelemetry.lat)}°S`},{' '}
            {currentTelemetry.lon >= 0 ? `${currentTelemetry.lon}°E` : `${Math.abs(currentTelemetry.lon)}°W`}
          </b>
        </div>

        <div>
          <span className="text-slate-400 block text-[10px]">AVERAGE ELEVATION</span>
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
          <span className="text-slate-400 block text-[10px]">PRESSURE</span>
          <b className="text-white">
            {surfaceModel.isNoSurface
              ? 'Opaque Deck'
              : currentTelemetry.pressureBar > 0
              ? `${currentTelemetry.pressureBar} bar`
              : '0 bar (Vacuum)'}
          </b>
        </div>

        <div>
          <span className="text-slate-400 block text-[10px]">CLOUD COVERAGE</span>
          <b className="text-sky-200">
            {surfaceModel.isNoSurface
              ? '100%'
              : currentTelemetry.pressureBar > 0
              ? `${Math.round(
                  (showTileGrid || displayMode === 'terrain' || displayMode === 'horizon'
                    ? activeInspectedTile.cloudCover
                    : surfaceModel.cloudOpacity) * 100
                )}%`
              : '0%'}
          </b>
        </div>
      </div>

      {/* Indigenous Xenoflora & Detailed Ecosystem Catalog (Toggleable) */}
      <SurfaceEcosystemPanel
        ecosystem={ecosystem}
        activeTile={selectedTile}
        isOpen={showEcosystemPanel}
        onClose={() => setShowEcosystemPanel(false)}
      />

      {/* Surface & Internal Geochemistry Composition Tables */}
      <PlanetaryChemistrySection planet={planet} moon={moon} surfaceModel={surfaceModel} />
    </div>
  );
};


