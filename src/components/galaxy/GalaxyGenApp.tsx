import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  Compass,
  Sparkles,
  RefreshCw,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sliders,
  X,
  Copy,
  Check,
  ArrowRight,
  Disc,
  Home,
  Image as ImageIcon,
  Undo2,
  Hexagon,
  Tag,
  Layers,
  FolderOpen,
} from 'lucide-react';
import {
  GalaxyConfig,
  GalaxySectorHex,
  GalaxyMorphology,
  generateGalaxyGrid,
  GalaxyGridData,
  generateBlurredGalaxyBackground,
} from '../../core/generation/galaxyGen';
import { getHexGridOverlayUrl } from '../../core/generation/hexGridOverlay';
import { getStarAssetPath } from '../../core/generation/starAssets';
import { ImageQuantizerModal } from './ImageQuantizerModal';
import { SavedGalaxiesModal } from './SavedGalaxiesModal';
import { universeCache, SavedGalaxy } from '../../core/storage/universeCache';

interface GalaxyGenAppProps {
  onSelectSector: (sector: GalaxySectorHex) => void;
  onGoHome?: () => void;
  initialConfig?: Partial<GalaxyConfig>;
  initialSelectedCoord?: string | null;
  returnTransition?: boolean;
  showUI?: boolean;
}

interface MorphologyOption {
  id: GalaxyMorphology;
  label: string;
  desc: string;
  icon: string;
}

const MORPHOLOGY_OPTIONS: MorphologyOption[] = [
  { id: 'spiral', label: 'Grand Design Spiral', desc: 'Symmetric logarithmic arms, active starburst ridges, bright core', icon: '🌀' },
  { id: 'barred-spiral', label: 'Barred Spiral (SBb)', desc: 'Prominent stellar bar crossing the nucleus feeding spiral arms', icon: '🌌' },
  { id: 'elliptical', label: 'Elliptical (E0-E4)', desc: 'Smooth de Vaucouleurs profile, ancient red Population II stars', icon: '⚪' },
  { id: 'lenticular', label: 'Lenticular (S0)', desc: 'Dense spheroidal core with a smooth, gas-depleted stellar disk', icon: '💿' },
  { id: 'ring', label: 'Collisional Ring', desc: 'Ring galaxy formed by bullet collision with blue starburst rim', icon: '🪐' },
  { id: 'irregular', label: 'Irregular Clump', desc: 'Chaotic starburst knots and turbulent gas streams (Magellanic type)', icon: '✨' },
];

export const GalaxyGenApp: React.FC<GalaxyGenAppProps> = ({
  onSelectSector,
  onGoHome,
  initialConfig,
  initialSelectedCoord,
  returnTransition,
  showUI = false,
}) => {
  // Galaxy configuration state initialized from persistent cache or initialConfig
  const [config, setConfig] = useState<GalaxyConfig>(() => {
    const active = universeCache.getActiveGalaxyConfig();
    return {
      ...active,
      ...(initialConfig || {}),
    };
  });

  // Drawer / Modal for advanced customization sliders
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [draftConfig, setDraftConfig] = useState<GalaxyConfig>(config);

  // Saved Galaxies Catalog Modal state
  const [showSavedGalaxiesModal, setShowSavedGalaxiesModal] = useState<boolean>(false);

  // Image Quantizer & Backdrop state
  const [showImageModal, setShowImageModal] = useState<boolean>(false);
  const [customGalaxyData, setCustomGalaxyData] = useState<GalaxyGridData | null>(null);
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [bgImageOpacity, setBgImageOpacity] = useState<number>(0.75); // Opacity of imported photo or procedural blur
  const [sectorOpacity, setSectorOpacity] = useState<number>(0.85); // 0.0 to 1.0 (hex fill opacity multiplier)

  // Search input & Copy feedback
  const [searchCoord, setSearchCoord] = useState<string>('');
  const [copiedId, setCopiedId] = useState<boolean>(false);

  // Viewport visibility toggles (default false for maximum performance)
  const [showHexBoundaries, setShowHexBoundaries] = useState<boolean>(false);
  const [showLabels, setShowLabels] = useState<boolean>(false);

  // Sync draft and persist active galaxy config when config changes
  useEffect(() => {
    setDraftConfig(config);
    universeCache.saveActiveGalaxyConfig(config);
  }, [config]);

  // Generate full 50x50 Galaxy Grid (2,500 sectors) or use custom quantized image data
  const galaxyData = useMemo(
    () => customGalaxyData || generateGalaxyGrid(config),
    [customGalaxyData, config]
  );

  // Transition and Interaction state
  const [hoveredSector, setHoveredSector] = useState<GalaxySectorHex | null>(null);
  const [isEnteringSector, setIsEnteringSector] = useState<boolean>(false);
  const [transitionSector, setTransitionSector] = useState<GalaxySectorHex | null>(null);
  const [isReturningFromSector, setIsReturningFromSector] = useState<boolean>(false);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup any pending transition timers on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  // Selected Sector
  const [selectedSector, setSelectedSector] = useState<GalaxySectorHex | null>(() => {
    if (initialSelectedCoord) {
      const match = galaxyData.sectors.find((s) => s.coord === initialSelectedCoord);
      if (match) return match;
    }
    // Default to central core or first active sector
    const coreSector = galaxyData.sectors.find((s) => s.col === 25 && s.row === 25);
    return coreSector || galaxyData.sectors[0] || null;
  });

  // Keep selected sector valid on regeneration
  useEffect(() => {
    if (selectedSector) {
      const match = galaxyData.sectors.find((s) => s.coord === selectedSector.coord);
      if (match) {
        setSelectedSector(match);
        return;
      }
    }
    const core = galaxyData.sectors.find((s) => s.col === 25 && s.row === 25);
    setSelectedSector(core || galaxyData.sectors[0] || null);
  }, [galaxyData]);

  // ============================================================================
  // HEX GEOMETRY (Pointy-topped)
  // ============================================================================
  const hexRadius = 26; // Radius in px for galaxy overview
  const hexWidth = Math.sqrt(3) * hexRadius; // ~45.03 px
  const hexHeight = 2 * hexRadius; // 52 px
  const colSpacing = hexWidth;
  const rowSpacing = 1.5 * hexRadius; // 39 px

  // Calculate pixel center for (col, row)
  const getHexCenter = useCallback(
    (col: number, row: number) => {
      const xOffset = row % 2 === 1 ? hexWidth * 0.5 : 0;
      const cx = (col - 1) * colSpacing + hexRadius + xOffset + 40;
      const cy = (row - 1) * rowSpacing + hexRadius + 40;
      return { cx, cy };
    },
    [colSpacing, rowSpacing, hexRadius, hexWidth]
  );

  // Polygon points string for pointy-topped hexagon
  const hexPoints = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const x = hexRadius * Math.cos(angle);
      const y = hexRadius * Math.sin(angle);
      pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return pts.join(' ');
  }, [hexRadius]);

  // Pregenerated 50x50 hex grid overlay image URL (high-performance GPU texture overlay)
  const hexGridOverlayUrl = useMemo(() => {
    return getHexGridOverlayUrl({
      columns: config.columns,
      rows: config.rows,
      hexRadius,
      padding: 40,
    });
  }, [config.columns, config.rows, hexRadius]);

  // Procedural blurred galaxy background generated from hexes when no custom photo is imported
  const [proceduralBgUrl, setProceduralBgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (bgImageUrl) {
      setProceduralBgUrl(null);
      return;
    }
    const url = generateBlurredGalaxyBackground(
      galaxyData.sectors,
      config.columns,
      config.rows,
      colSpacing,
      rowSpacing,
      hexRadius,
      hexWidth,
      30
    );
    setProceduralBgUrl(url);
  }, [galaxyData, bgImageUrl, config.columns, config.rows, colSpacing, rowSpacing, hexRadius, hexWidth]);

  // Active background URL: imported photo takes precedence, otherwise procedural blur is used
  const activeBgUrl = bgImageUrl || proceduralBgUrl;

  // Total grid dimensions
  const gridBoundingSize = useMemo(() => {
    const totalW = config.columns * colSpacing + hexWidth + 80;
    const totalH = config.rows * rowSpacing + hexHeight + 80;
    return { width: Math.max(900, totalW), height: Math.max(700, totalH) };
  }, [config.columns, config.rows, colSpacing, rowSpacing, hexWidth, hexHeight]);

  // Viewport container size
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 1200,
    height: 800,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: Math.max(300, entry.contentRect.width),
          height: Math.max(300, entry.contentRect.height),
        });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Pan & Zoom state
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(0.48);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Auto-fit galaxy to screen
  const handleFitGalaxy = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const scaleX = (clientWidth - 80) / gridBoundingSize.width;
    const scaleY = (clientHeight - 80) / gridBoundingSize.height;
    const fitScale = Math.max(0.12, Math.min(1.2, Math.min(scaleX, scaleY)));
    setZoom(fitScale);
    setPan({
      x: (clientWidth - gridBoundingSize.width * fitScale) / 2,
      y: (clientHeight - gridBoundingSize.height * fitScale) / 2,
    });
  }, [gridBoundingSize]);

  // Initial fit or sector return animation on mount
  useEffect(() => {
    if (returnTransition && initialSelectedCoord) {
      const match = galaxyData.sectors.find((s) => s.coord === initialSelectedCoord);
      if (match && containerRef.current) {
        setSelectedSector(match);
        const { clientWidth, clientHeight } = containerRef.current;
        const { cx, cy } = getHexCenter(match.col, match.row);
        setIsReturningFromSector(true);
        const startZoom = 1.35;
        setZoom(startZoom);
        setPan({
          x: clientWidth / 2 - cx * startZoom,
          y: clientHeight / 2 - cy * startZoom,
        });

        const timer1 = setTimeout(() => {
          const finalZoom = 0.58;
          setZoom(finalZoom);
          setPan({
            x: clientWidth / 2 - cx * finalZoom,
            y: clientHeight / 2 - cy * finalZoom,
          });
        }, 40);

        const timer2 = setTimeout(() => {
          setIsReturningFromSector(false);
        }, 500);

        return () => {
          clearTimeout(timer1);
          clearTimeout(timer2);
        };
      }
    } else {
      handleFitGalaxy();
    }
  }, [returnTransition, initialSelectedCoord, galaxyData, getHexCenter, handleFitGalaxy]);

  // Find sector near SVG world coordinates (for wheel zoom trigger)
  const findSectorNearWorldPos = useCallback(
    (worldX: number, worldY: number): GalaxySectorHex | null => {
      const approxRow = Math.round((worldY - 40 - hexRadius) / rowSpacing) + 1;
      let closest: GalaxySectorHex | null = null;
      let minDistSq = Infinity;
      for (let r = Math.max(1, approxRow - 2); r <= Math.min(config.rows, approxRow + 2); r++) {
        const xOffset = r % 2 === 1 ? hexWidth * 0.5 : 0;
        const approxCol = Math.round((worldX - 40 - hexRadius - xOffset) / colSpacing) + 1;
        for (let c = Math.max(1, approxCol - 2); c <= Math.min(config.columns, approxCol + 2); c++) {
          const { cx, cy } = getHexCenter(c, r);
          const dSq = (worldX - cx) ** 2 + (worldY - cy) ** 2;
          if (dSq < minDistSq) {
            minDistSq = dSq;
            const match = galaxyData.sectors.find((s) => s.col === c && s.row === r);
            if (match) closest = match;
          }
        }
      }
      return closest;
    },
    [config.rows, config.columns, hexRadius, rowSpacing, hexWidth, colSpacing, getHexCenter, galaxyData.sectors]
  );

  // Cinematic transition into 50x50 Sector Map
  const handleTriggerEnterSector = useCallback(
    (sector: GalaxySectorHex) => {
      if (isEnteringSector) return;

      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (prefersReducedMotion) {
        onSelectSector(sector);
        return;
      }

      setIsEnteringSector(true);
      setTransitionSector(sector);
      setSelectedSector(sector);

      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        const { cx, cy } = getHexCenter(sector.col, sector.row);
        const targetZoom = 3.6;
        setZoom(targetZoom);
        setPan({
          x: clientWidth / 2 - cx * targetZoom,
          y: clientHeight / 2 - cy * targetZoom,
        });
      }

      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }

      transitionTimerRef.current = setTimeout(() => {
        onSelectSector(sector);
      }, 450);
    },
    [isEnteringSector, getHexCenter, onSelectSector]
  );

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isEnteringSector) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || isEnteringSector) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom towards a specific screen coordinate (cursor or center)
  const zoomAtScreenPoint = useCallback(
    (screenX: number, screenY: number, factor: number) => {
      setZoom((prevZoom) => {
        const newZoom = Math.max(0.08, Math.min(2.5, prevZoom * factor));
        if (newZoom === prevZoom) return prevZoom;

        setPan((prevPan) => {
          const worldX = (screenX - prevPan.x) / prevZoom;
          const worldY = (screenY - prevPan.y) / prevZoom;
          return {
            x: screenX - worldX * newZoom,
            y: screenY - worldY * newZoom,
          };
        });

        return newZoom;
      });
    },
    []
  );

  // Zoom handlers with automatic sector entry beyond zoom threshold
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (isEnteringSector) return;

    // Zooming in past threshold triggers transition into sector
    if (e.deltaY < 0 && zoom >= 2.05) {
      let candidate = hoveredSector;
      if (!candidate && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - pan.x) / zoom;
        const worldY = (mouseY - pan.y) / zoom;
        candidate = findSectorNearWorldPos(worldX, worldY);
      }
      if (!candidate) {
        candidate =
          selectedSector ||
          galaxyData.sectors.find((s) => s.col === 25 && s.row === 25) ||
          galaxyData.sectors[0];
      }
      if (candidate) {
        handleTriggerEnterSector(candidate);
        return;
      }
    }

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      zoomAtScreenPoint(mouseX, mouseY, zoomFactor);
    } else {
      setZoom((prev) => Math.max(0.08, Math.min(2.5, prev * zoomFactor)));
    }
  };

  // Frustum Culling: Only render visible sectors within viewport + 2 buffer sectors
  const visibleSectors = useMemo(() => {
    if (isEnteringSector && transitionSector) {
      const minCol = Math.max(1, transitionSector.col - 4);
      const maxCol = Math.min(config.columns, transitionSector.col + 4);
      const minRow = Math.max(1, transitionSector.row - 4);
      const maxRow = Math.min(config.rows, transitionSector.row + 4);
      return galaxyData.sectors.filter(
        (s) =>
          s.col >= minCol &&
          s.col <= maxCol &&
          s.row >= minRow &&
          s.row <= maxRow
      );
    }

    const minX = -pan.x / zoom;
    const maxX = (containerSize.width - pan.x) / zoom;
    const minY = -pan.y / zoom;
    const maxY = (containerSize.height - pan.y) / zoom;

    const minCol = Math.max(1, Math.floor((minX - 40) / colSpacing) - 2);
    const maxCol = Math.min(config.columns, Math.ceil((maxX - 40) / colSpacing) + 2);
    const minRow = Math.max(1, Math.floor((minY - 40) / rowSpacing) - 2);
    const maxRow = Math.min(config.rows, Math.ceil((maxY - 40) / rowSpacing) + 2);

    const culled: GalaxySectorHex[] = [];
    for (const sector of galaxyData.sectors) {
      if (
        sector.col >= minCol &&
        sector.col <= maxCol &&
        sector.row >= minRow &&
        sector.row <= maxRow
      ) {
        culled.push(sector);
      }
    }
    return culled;
  }, [
    isEnteringSector,
    transitionSector,
    galaxyData.sectors,
    config.columns,
    config.rows,
    pan.x,
    pan.y,
    zoom,
    containerSize,
    colSpacing,
    rowSpacing,
  ]);

  // Jump to coordinate
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCoord.trim()) return;
    const clean = searchCoord.trim().padStart(4, '0');
    const match = galaxyData.sectors.find((s) => s.coord === clean);
    if (match) {
      setSelectedSector(match);
      const { cx, cy } = getHexCenter(match.col, match.row);
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setPan({
          x: clientWidth / 2 - cx * zoom,
          y: clientHeight / 2 - cy * zoom,
        });
      }
    }
  };

  // Roll new galaxy
  const handleRollGalaxy = () => {
    setCustomGalaxyData(null);
    setBgImageUrl(null);
    const newSeed = Math.floor(Math.random() * 90000) + 1000;
    setConfig((prev) => ({
      ...prev,
      seed: newSeed,
    }));
  };

  // Switch morphology
  const handleMorphologyChange = (morph: GalaxyMorphology) => {
    setCustomGalaxyData(null);
    setBgImageUrl(null);
    setConfig((prev) => ({
      ...prev,
      morphology: morph,
    }));
  };

  // Apply custom quantized galaxy from uploaded / procedural image
  const handleApplyQuantizedGalaxy = (data: GalaxyGridData, imageUrl?: string) => {
    setCustomGalaxyData(data);
    if (imageUrl) {
      setBgImageUrl(imageUrl);
    }
    const core = data.sectors.find((s) => s.col === 25 && s.row === 25);
    if (core) {
      setSelectedSector(core);
    }
  };

  // Reset from quantized image back to procedural generation
  const handleResetToProcedural = () => {
    setCustomGalaxyData(null);
    setBgImageUrl(null);
  };

  // Copy seed / ID
  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1800);
  };

  // Load saved galaxy from catalog
  const handleLoadSavedGalaxy = (saved: SavedGalaxy) => {
    setConfig(saved.config);
    setCustomGalaxyData(null);
    setBgImageUrl(null);
    setShowSavedGalaxiesModal(false);
  };

  // Apply custom sliders
  const handleApplySliders = () => {
    setConfig({ ...draftConfig });
    setShowConfigModal(false);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#030611] text-slate-100 overflow-hidden font-sans select-none relative">
      {/* ============================================================================ */}
      {/* TOP COMMAND BAR                                                              */}
      {/* ============================================================================ */}
      {showUI && (
        <div className="w-full px-4 py-2.5 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 z-20">
        {/* Left: Branding & Core Stats */}
        <div className="flex items-center gap-3">
          {onGoHome && (
            <button
              onClick={onGoHome}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 flex items-center gap-1.5 cursor-pointer transition shadow text-xs font-mono"
              title="Return to Home Showcase"
            >
              <Home className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Home</span>
            </button>
          )}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20 border border-blue-400/30">
            <Disc className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                GALAXY GENERATOR
                <button
                  type="button"
                  onClick={() => setShowSavedGalaxiesModal(true)}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950/80 hover:bg-blue-900 text-blue-400 border border-blue-800 flex items-center gap-1 transition cursor-pointer"
                  title="Open Saved Galaxies Catalog to manage, save, or load this seeded galaxy"
                >
                  {customGalaxyData ? '🖼️ Quantized Image' : `Seed #${config.seed}`}
                  <Sparkles className="w-2.5 h-2.5 text-blue-400" />
                </button>
              </h2>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-2">
              <span className="text-cyan-300 font-semibold">{config.columns}&times;{config.rows} Sectors</span>
              <span className="text-slate-600">&bull;</span>
              <span>{galaxyData.stats.activeSectors.toLocaleString()} Active Sectors</span>
              <span className="text-slate-600">&bull;</span>
              <span>Radius: <strong className="text-slate-200">{config.radiusKpc} kpc</strong></span>
              <span className="text-slate-600">&bull;</span>
              <span>Est. <strong className="text-emerald-300">~{(galaxyData.stats.totalEstimatedStars / 1000).toFixed(0)}k</strong> Systems</span>
              {galaxyData.stats.nebulaCount > 0 && (
                <>
                  <span className="text-slate-600">&bull;</span>
                  <span className="text-fuchsia-300 font-semibold flex items-center gap-1">
                    <span>🌌</span>
                    <span>{galaxyData.stats.nebulaCount} Nebulae</span>
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Center: Morphology Switcher */}
        <div className="hidden lg:flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-mono">
          {MORPHOLOGY_OPTIONS.map((m) => (
            <button
              key={m.id}
              onClick={() => handleMorphologyChange(m.id)}
              className={`px-2.5 py-1 rounded-lg transition text-[11px] cursor-pointer flex items-center gap-1.5 ${
                config.morphology === m.id
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-md shadow-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title={m.desc}
            >
              <span>{m.icon}</span>
              <span>{m.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        {/* Right: Customization, Search, Roll */}
        <div className="flex items-center gap-2">
          {/* Saved Galaxies Catalog Button */}
          <button
            onClick={() => setShowSavedGalaxiesModal(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-800/80 hover:border-cyan-500 text-xs font-mono font-medium flex items-center gap-1.5 transition shadow cursor-pointer"
            title="Open Saved Galaxies Catalog to save, load, or export seeded universes"
          >
            <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Saved Galaxies</span>
            {universeCache.getSavedGalaxies().length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-cyan-950 text-cyan-300 text-[10px] border border-cyan-800 font-bold">
                {universeCache.getSavedGalaxies().length}
              </span>
            )}
          </button>

          {/* Import / Quantize Image Button */}
          <button
            onClick={() => setShowImageModal(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-purple-300 border border-purple-800/80 hover:border-purple-500 text-xs font-mono font-medium flex items-center gap-1.5 transition shadow cursor-pointer"
            title="Import an image of a galaxy to quantize into sector hex data"
          >
            <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Import Image</span>
          </button>

          {/* Reset to Procedural if Custom Quantized Galaxy is Active */}
          {customGalaxyData && (
            <button
              onClick={handleResetToProcedural}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-800/60 hover:border-amber-500 text-xs font-mono text-[11px] flex items-center gap-1 transition cursor-pointer"
              title="Return to procedural galaxy generation"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Procedural</span>
            </button>
          )}

          {/* Sliders Modal Button */}
          <button
            onClick={() => setShowConfigModal(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 hover:border-blue-500 text-xs font-mono font-medium flex items-center gap-2 transition shadow cursor-pointer"
            title="Customize Galaxy Morphology, Arms, Density Scale, and Radii"
          >
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Galaxy Parameters</span>
          </button>

          {/* Search Sector Coordinate */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Sector coord (e.g. 2525)..."
                value={searchCoord}
                onChange={(e) => setSearchCoord(e.target.value)}
                className="w-40 pl-8 pr-2 py-1 text-xs font-mono bg-slate-900/90 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
            <button
              type="submit"
              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-mono transition cursor-pointer"
            >
              Go
            </button>
          </form>

          {/* Roll Galaxy Button */}
          <button
            onClick={handleRollGalaxy}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg shadow-blue-500/20 transition cursor-pointer"
            title="Generate a brand new procedural galaxy with random astrophysical seed"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Roll Galaxy</span>
          </button>
        </div>
      </div>
      )}

      {/* ============================================================================ */}
      {/* MAIN VIEWPORT: 50x50 HEX GALAXY MAP + SECTOR INSPECTOR                       */}
      {/* ============================================================================ */}
      <div className="flex-1 flex flex-row min-h-0 relative overflow-hidden">
        {/* Viewport Canvas Container */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`flex-1 h-full relative overflow-hidden ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          } bg-[#02040b]`}
        >
          {/* Subtle Deep Space Star Dust Background */}
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              backgroundImage:
                'radial-gradient(1px 1px at 20px 30px, #ffffff, rgba(0,0,0,0)), radial-gradient(1px 1px at 40px 70px, rgba(255,255,255,0.7), rgba(0,0,0,0)), radial-gradient(1.5px 1.5px at 150px 180px, #38bdf8, rgba(0,0,0,0)), radial-gradient(2px 2px at 240px 320px, #f43f5e, rgba(0,0,0,0))',
              backgroundSize: '350px 350px',
            }}
          />

          {/* Central Galactic Core Glow */}
          <div
            className="absolute pointer-events-none rounded-full blur-3xl opacity-30"
            style={{
              left: `${pan.x + (gridBoundingSize.width / 2) * zoom - 200}px`,
              top: `${pan.y + (gridBoundingSize.height / 2) * zoom - 200}px`,
              width: '400px',
              height: '400px',
              background: 'radial-gradient(circle, rgba(245, 158, 11, 0.45) 0%, rgba(239, 68, 68, 0.25) 45%, rgba(59, 130, 246, 0.15) 75%, transparent 100%)',
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          />

          {/* Main SVG Hex Grid Viewport */}
          <svg
            className="w-full h-full absolute inset-0"
            style={{ touchAction: 'none' }}
            onMouseLeave={() => setHoveredSector(null)}
          >
            <defs>
              <filter id="galaxyGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="fuzzyBorder" x="-35%" y="-35%" width="170%" height="170%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" opacity="0.30" />
                </feMerge>
              </filter>
              <filter id="giantStarGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Purple-Red Emission Nebula Gas Cloud Glow */}
              <radialGradient id="galaxyNebulaGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.88" />
                <stop offset="35%" stopColor="#e11d48" stopOpacity="0.70" />
                <stop offset="70%" stopColor="#c026d3" stopOpacity="0.40" />
                <stop offset="100%" stopColor="#9333ea" stopOpacity="0" />
              </radialGradient>
              <filter id="nebulaCloudBlur" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.0" result="blur" />
              </filter>
            </defs>

            <g
              transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
              style={{
                transition:
                  isEnteringSector || isReturningFromSector
                    ? 'transform 450ms cubic-bezier(0.2, 0.8, 0.2, 1)'
                    : 'none',
              }}
            >
              {/* Quantized Photo or Procedurally Blurred Galaxy Backdrop */}
              {activeBgUrl && (
                <image
                  href={activeBgUrl}
                  x={40}
                  y={40}
                  width={config.columns * colSpacing + hexWidth}
                  height={config.rows * rowSpacing + hexHeight}
                  opacity={bgImageOpacity}
                  preserveAspectRatio="none"
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Render visible sector hexes */}
              {visibleSectors.map((sector) => {
                const { cx, cy } = getHexCenter(sector.col, sector.row);
                const isSelected = selectedSector?.coord === sector.coord;
                const isCore = sector.col === 25 && sector.row === 25;

                return (
                  <g
                    key={sector.coord}
                    transform={`translate(${cx}, ${cy})`}
                    onMouseEnter={() => setHoveredSector(sector)}
                    onMouseLeave={() =>
                      setHoveredSector((prev) => (prev?.coord === sector.coord ? null : prev))
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSector(sector);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleTriggerEnterSector(sector);
                    }}
                    className="cursor-pointer group"
                  >
                    {/* Hexagon polygon with age-based color and density-based opacity scaled by sectorOpacity */}
                    <polygon
                      points={hexPoints}
                      fill={sector.colorHex}
                      fillOpacity={sector.opacity * sectorOpacity}
                      stroke="none"
                    />

                    {/* Active Emission Nebula (Purple-Red Gas Cloud on Galaxy Map) */}
                    {sector.hasNebula && (
                      <g className="pointer-events-none" style={{ mixBlendMode: 'screen' }}>
                        {/* Soft diffuse purple-red gaseous cloud envelope */}
                        <circle
                          r={hexRadius * 1.08}
                          fill="url(#galaxyNebulaGlow)"
                          opacity={0.82}
                        />
                        {/* Filamentary emission cloud lobes */}
                        <ellipse
                          rx={hexRadius * 0.78}
                          ry={hexRadius * 0.44}
                          fill="#e11d48"
                          opacity={0.52}
                          transform={`rotate(${(sector.seed % 180)}, 0, 0)`}
                          filter="url(#nebulaCloudBlur)"
                        />
                        <ellipse
                          rx={hexRadius * 0.65}
                          ry={hexRadius * 0.36}
                          fill="#c026d3"
                          opacity={0.58}
                          transform={`rotate(${(sector.seed * 3 % 180)}, 0, 0)`}
                          filter="url(#nebulaCloudBlur)"
                        />
                        <circle
                          r={hexRadius * 0.35}
                          fill="#fb7185"
                          opacity={0.68}
                          filter="url(#nebulaCloudBlur)"
                        />
                      </g>
                    )}



                    {/* Giant Star Systems (Mass 10-50 M☉) with scaled star assets */}
                    {sector.giantStars && sector.giantStars.length > 0 && sector.giantStars.map((star) => {
                      const assetSize = Math.max(5.5, star.size * 3.2);
                      const assetPath = getStarAssetPath({ spectralType: star.spectralType, colorHex: star.colorHex });
                      return (
                        <image
                          key={star.id}
                          href={assetPath}
                          x={+(star.relX - assetSize / 2).toFixed(2)}
                          y={+(star.relY - assetSize / 2).toFixed(2)}
                          width={+assetSize.toFixed(2)}
                          height={+assetSize.toFixed(2)}
                          preserveAspectRatio="xMidYMid meet"
                          className="pointer-events-none"
                        />
                      );
                    })}

                    {/* Selection Pulse Ring */}
                    {isSelected && (
                      <polygon
                        points={hexPoints}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth={1.2}
                        strokeDasharray="4,2"
                        className="animate-pulse"
                      />
                    )}

                    {/* Overdensity Hot Core Glow Marker */}
                    {sector.density > 1.4 && !isCore && (
                      <circle
                        r={2.2}
                        fill="#ffffff"
                        opacity={0.8}
                        filter="url(#galaxyGlow)"
                      />
                    )}

                    {/* Center Core Marker */}
                    {isCore && (
                      <circle
                        r={4.5}
                        fill="#fbbf24"
                        stroke="#ffffff"
                        strokeWidth={1}
                        filter="url(#galaxyGlow)"
                      />
                    )}

                    {/* LOD Text: Coordinates visible when zoomed in */}
                    {showLabels && zoom >= 0.38 && (
                      <text
                        y={zoom >= 0.8 ? -4 : 3}
                        textAnchor="middle"
                        fontSize={zoom >= 0.8 ? 8 : 7}
                        fontFamily="monospace"
                        fontWeight={isSelected ? 'bold' : 'normal'}
                        fill={
                          isSelected
                            ? '#ffffff'
                            : sector.opacity > 0.3
                            ? '#ffffff'
                            : 'rgba(226, 232, 240, 0.55)'
                        }
                        pointerEvents="none"
                      >
                        {sector.coord}
                      </text>
                    )}

                    {/* Detailed Density / System Badge when zoomed in close */}
                    {showLabels && zoom >= 0.85 && (
                      <text
                        y={8}
                        textAnchor="middle"
                        fontSize={6.5}
                        fontFamily="monospace"
                        fill="rgba(148, 163, 184, 0.85)"
                        pointerEvents="none"
                      >
                        {Math.round(sector.density * 100)}%
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Pregenerated 50x50 Hex Grid Boundary Image Overlay */}
              {showHexBoundaries && hexGridOverlayUrl && (
                <image
                  href={hexGridOverlayUrl}
                  x={0}
                  y={0}
                  width={gridBoundingSize.width}
                  height={gridBoundingSize.height}
                  preserveAspectRatio="none"
                  className="pointer-events-none"
                  opacity={0.80}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* Active Selection Glow Ring & Foreground Highlight (drawn crisp on top of grid lines) */}
              {selectedSector && (
                <g
                  transform={`translate(${getHexCenter(selectedSector.col, selectedSector.row).cx}, ${getHexCenter(selectedSector.col, selectedSector.row).cy})`}
                  className="pointer-events-none"
                >
                  <polygon
                    points={hexPoints}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={3.0}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    filter="url(#fuzzyBorder)"
                  />
                  <polygon
                    points={hexPoints}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={1.2}
                    strokeDasharray="4,2"
                    className="animate-pulse"
                  />
                </g>
              )}

              {/* Central Galactic Nucleus SMBH (Sector 2525) Outline when not selected */}
              {selectedSector?.coord !== '2525' && (
                <g
                  transform={`translate(${getHexCenter(25, 25).cx}, ${getHexCenter(25, 25).cy})`}
                  className="pointer-events-none"
                >
                  <polygon
                    points={hexPoints}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={2.4}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              )}

              {/* Hovered Sector Feedback Outline */}
              {hoveredSector && hoveredSector.coord !== selectedSector?.coord && (
                <g
                  transform={`translate(${getHexCenter(hoveredSector.col, hoveredSector.row).cx}, ${getHexCenter(hoveredSector.col, hoveredSector.row).cy})`}
                  className="pointer-events-none"
                >
                  <polygon
                    points={hexPoints}
                    fill="none"
                    stroke="#7dd3fc"
                    strokeWidth={2.0}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={0.85}
                  />
                </g>
              )}
            </g>
          </svg>

          {/* Viewport Floating Zoom & Fit Controls */}
          {showUI && (
            <div className="absolute bottom-5 left-5 flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 text-xs font-mono shadow-xl z-10">
            <button
              onClick={() => {
                if (zoom >= 2.05 && selectedSector) {
                  handleTriggerEnterSector(selectedSector);
                } else if (containerRef.current) {
                  const rect = containerRef.current.getBoundingClientRect();
                  zoomAtScreenPoint(rect.width / 2, rect.height / 2, 1.25);
                } else {
                  setZoom((z) => Math.min(2.5, z * 1.25));
                }
              }}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
              title={zoom >= 2.05 ? 'Zoom beyond threshold to enter sector' : 'Zoom In'}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (containerRef.current) {
                  const rect = containerRef.current.getBoundingClientRect();
                  zoomAtScreenPoint(rect.width / 2, rect.height / 2, 0.8);
                } else {
                  setZoom((z) => Math.max(0.08, z * 0.8));
                }
              }}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleFitGalaxy}
              className="p-1.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition cursor-pointer flex items-center gap-1"
              title="Fit Entire Galaxy in Viewport"
            >
              <Maximize2 className="w-4 h-4" />
              <span className="text-[10px] hidden sm:inline">Fit Galaxy</span>
            </button>
            <div className="h-4 w-px bg-slate-800 mx-1" />
            <span className="px-2 text-[10px] text-slate-400 font-mono">
              {Math.round(zoom * 100)}%
            </span>

            <div className="h-4 w-px bg-slate-800 mx-1" />

            {/* Toggle Hex Boundaries */}
            <button
              onClick={() => setShowHexBoundaries((v) => !v)}
              className={`px-2 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 text-[10px] ${
                showHexBoundaries
                  ? 'text-cyan-300 bg-cyan-950/70 border border-cyan-800/80 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900 border border-transparent'
              }`}
              title="Toggle Hex Grid Boundaries (Fuzzy borders)"
            >
              <Hexagon className="w-3.5 h-3.5" />
              <span>Boundaries</span>
            </button>

            {/* Toggle Labels */}
            <button
              onClick={() => setShowLabels((v) => !v)}
              className={`px-2 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 text-[10px] ${
                showLabels
                  ? 'text-cyan-300 bg-cyan-950/70 border border-cyan-800/80 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900 border border-transparent'
              }`}
              title="Toggle Sector Coordinates & Density Labels"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Labels</span>
            </button>

            {/* Sector Fill Opacity Slider */}
            <div className="h-4 w-px bg-slate-800 mx-1" />
            <div className="flex items-center gap-1.5 px-2 py-0.5 text-blue-300">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[10px] hidden sm:inline">Sector Fill:</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={sectorOpacity}
                onChange={(e) => setSectorOpacity(parseFloat(e.target.value))}
                className="w-16 h-1 accent-blue-500 cursor-pointer"
                title="Sector hex fill opacity (0% = transparent hexes to reveal background)"
              />
              <span className="text-[10px] font-mono text-blue-300 w-7 text-right">
                {Math.round(sectorOpacity * 100)}%
              </span>
            </div>

            {/* Backdrop Opacity Slider (Imported photo or procedurally blurred galaxy) */}
            {activeBgUrl && (
              <>
                <div className="h-4 w-px bg-slate-800 mx-1" />
                <div className="flex items-center gap-1.5 px-2 py-0.5 text-purple-300">
                  <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[10px] hidden sm:inline">
                    {bgImageUrl ? 'Photo:' : 'Glow:'}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={bgImageOpacity}
                    onChange={(e) => setBgImageOpacity(parseFloat(e.target.value))}
                    className="w-16 h-1 accent-purple-500 cursor-pointer"
                    title={bgImageUrl ? 'Imported astrophotograph overlay opacity' : 'Procedural blurred galaxy glow backdrop opacity'}
                  />
                  <span className="text-[10px] font-mono text-purple-300 w-7 text-right">
                    {Math.round(bgImageOpacity * 100)}%
                  </span>
                </div>
              </>
            )}
          </div>
          )}

          {/* High Zoom Threshold Indicator Pill */}
          {zoom >= 1.6 && selectedSector && !isEnteringSector && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-950/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-cyan-500/50 text-[11px] font-mono text-cyan-200 shadow-xl flex items-center gap-2 pointer-events-none animate-pulse z-10">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Zoom further or double-click to enter Sector <strong>{selectedSector.coord}</strong></span>
            </div>
          )}

          {/* Cinematic Warp / Zoom Transition Overlay */}
          {isEnteringSector && transitionSector && (
            <div
              className="absolute inset-0 z-30 pointer-events-none flex flex-col items-center justify-center transition-all duration-500 ease-out"
              style={{
                backgroundColor: 'rgba(3, 6, 17, 0.70)',
                backdropFilter: 'blur(4px)',
              }}
            >
              <div
                className="w-40 h-40 rounded-full border-2 animate-ping opacity-60 absolute"
                style={{ borderColor: transitionSector.colorHex }}
              />
              <div
                className="w-24 h-24 rounded-full border border-cyan-400/80 animate-pulse flex items-center justify-center shadow-2xl relative"
                style={{
                  boxShadow: `0 0 50px ${transitionSector.colorHex}`,
                  backgroundColor: 'rgba(5, 8, 20, 0.85)',
                }}
              >
                <Compass className="w-9 h-9 text-cyan-300 animate-spin" style={{ animationDuration: '3s' }} />
              </div>

              <div className="mt-6 text-center space-y-1 font-mono">
                <div className="text-[11px] uppercase tracking-widest text-cyan-400 font-bold flex items-center justify-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 animate-bounce" />
                  <span>WARP TRANSITION &bull; ENTERING SECTOR {transitionSector.coord}</span>
                </div>
                <h3 className="text-xl font-extrabold text-white tracking-wide">
                  {transitionSector.name}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Generating 50&times;50 Sector Hex Grid &bull; {Math.round(transitionSector.density * 100)}% Stellar Density
                </p>
              </div>
            </div>
          )}

          {/* Color & Opacity Astrophysics Legend Overlay */}
          {showUI && (
            <div className="absolute top-4 left-4 bg-slate-950/85 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-800 text-[10px] font-mono shadow-lg pointer-events-none hidden sm:block">
              <div className="text-slate-400 font-bold mb-1 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>Astrophysical Color Scale</span>
              </div>
              <div className="flex items-center gap-1 mb-1.5">
                <span className="w-3 h-2 rounded-sm bg-[#00d2ff]" />
                <span className="w-3 h-2 rounded-sm bg-[#38bdf8]" />
                <span className="w-3 h-2 rounded-sm bg-[#60a5fa]" />
                <span className="w-3 h-2 rounded-sm bg-[#facc15]" />
                <span className="w-3 h-2 rounded-sm bg-[#fb923c]" />
                <span className="w-3 h-2 rounded-sm bg-[#ef4444]" />
                <span className="w-3 h-2 rounded-sm bg-[#dc2626]" />
              </div>
              <div className="flex justify-between text-[9px] text-slate-500">
                <span className="text-cyan-300 font-bold">Young (Blue)</span>
                <span className="text-amber-300 font-bold">Old (Red)</span>
              </div>
              <div className="text-[9px] text-slate-400 mt-1 border-t border-slate-800/80 pt-1 space-y-0.5">
                <div>Opacity: <strong className="text-slate-200">Dense</strong> (Opaque) &rarr; <strong className="text-slate-500">Sparse</strong> (Transparent)</div>
                <div>Overdensity (&gt;100%): <strong className="text-white">Desaturates to white</strong> &bull; Mass &amp; Remnant overflow</div>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================================ */}
        {/* RIGHT SECTOR INSPECTOR PANEL                                                 */}
        {/* ============================================================================ */}
        {showUI && (
          <aside
            style={{ containIntrinsicSize: 'auto 380px' }}
            className="w-80 md:w-96 h-full flex flex-col bg-slate-950/95 backdrop-blur-xl border-l border-slate-800/90 z-10 overflow-y-auto"
          >
          {selectedSector ? (
            <div className="p-4 flex flex-col gap-4">
              {/* Sector Header Card */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 relative overflow-hidden">
                <div
                  className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 pointer-events-none"
                  style={{ backgroundColor: selectedSector.colorHex }}
                />
                <div className="flex items-center justify-between mb-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950/80 text-blue-300 border border-blue-800 font-bold">
                    SECTOR {selectedSector.coord}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Row {selectedSector.row}, Col {selectedSector.col}
                  </span>
                </div>

                <h3 className="text-base font-extrabold text-white mb-1">
                  {selectedSector.name}
                </h3>

                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <span>ID: <code className="text-slate-200">{selectedSector.seedString}</code></span>
                  <button
                    onClick={() => handleCopyId(selectedSector.seedString)}
                    className="p-1 hover:bg-slate-800 rounded transition text-slate-400 hover:text-white cursor-pointer"
                    title="Copy Sector Seed String"
                  >
                    {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>

                {selectedSector.coord === '2525' && (
                  <div className="mt-2.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-950/90 to-indigo-950/90 border border-purple-500/70 text-purple-200 text-xs font-mono font-bold flex items-center gap-2 shadow-lg">
                    <span className="text-sm">🌀</span>
                    <span>Galactic Nucleus SMBH (Sagittarius A* &bull; 1,000,000 M☉)</span>
                  </div>
                )}
              </div>

              {/* PRIMARY ACTION BUTTON: ENTER 50x50 SECTOR MAP */}
              <button
                onClick={() => handleTriggerEnterSector(selectedSector)}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-mono text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer group"
              >
                <span>Enter Sector Hex Map (50&times;50)</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <p className="text-[10px] text-slate-500 font-mono text-center -mt-2">
                Double-clicking the hex on the galaxy map also opens it directly.
              </p>

              {/* Galactic Position & Region */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs font-mono">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-blue-400" />
                  <span>Galactic Cartography</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 block text-[9px]">Galactic Radius</span>
                    <strong className="text-white text-xs">{selectedSector.rKpc} kpc</strong>
                    <span className="text-slate-400 text-[9px] block">({Math.round(selectedSector.rNorm * 100)}% of rim)</span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                    <span className="text-slate-500 block text-[9px]">Polar Angle &theta;</span>
                    <strong className="text-white text-xs">{(selectedSector.thetaRad * 57.2958).toFixed(1)}&deg;</strong>
                    <span className="text-slate-400 text-[9px] block">({selectedSector.thetaRad} rad)</span>
                  </div>
                </div>

                <div className="mt-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                  <span className="text-slate-500 block text-[9px]">Galactic Region Classification</span>
                  <strong className="text-blue-300 text-xs">{selectedSector.region}</strong>
                </div>
              </div>

              {/* Astrophysical Sector Environment */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs font-mono flex flex-col gap-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Sector Astrophysical Environment</span>
                </div>

                {/* Stellar Density */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Stellar Density</span>
                    <span className={`font-bold ${selectedSector.density > 1.0 ? 'text-amber-300' : 'text-white'}`}>
                      {Math.round(selectedSector.density * 100)}% ({selectedSector.density}){selectedSector.density > 1.0 ? ' 🔥 Overdensity' : ''}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        selectedSector.density > 1.0
                          ? 'bg-gradient-to-r from-blue-400 via-amber-300 to-white'
                          : 'bg-gradient-to-r from-blue-500 to-emerald-400'
                      }`}
                      style={{ width: `${Math.min(100, selectedSector.density <= 1.0 ? selectedSector.density * 100 : (selectedSector.density / 3.0) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                    <span>Opacity: {selectedSector.opacity}</span>
                    <span className="text-emerald-400 font-semibold">~{selectedSector.estimatedStars50x50.toLocaleString()} Systems (50&times;50)</span>
                  </div>

                  {selectedSector.density > 1.0 && (
                    <div className="mt-2.5 p-2 rounded-lg bg-amber-950/40 border border-amber-600/50 text-[10px] text-amber-200/90 leading-relaxed font-mono">
                      🔥 <strong>Overdensity Overflow Active:</strong> Saturation decreased towards white. Excess density overflows into progenitor mass, spawning heavy O/B stars, multiple-star hierarchies, and stellar remnants!
                    </div>
                  )}
                </div>

                {/* Mean Stellar Age & Range */}
                <div className="border-t border-slate-800/80 pt-2.5">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Mean Stellar Age</span>
                    <span className="font-bold flex items-center gap-1.5" style={{ color: selectedSector.colorHex }}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedSector.colorHex }} />
                      {selectedSector.meanAge} Gyr
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-300 font-mono mb-1 bg-slate-950/50 p-1.5 rounded-lg border border-slate-800/70">
                    <span className="text-slate-400">Age Range:</span>
                    <span className="text-cyan-300 font-bold">&plusmn;{(selectedSector.ageRange / 2).toFixed(1)} Gyr ({selectedSector.ageMin} &ndash; {selectedSector.ageMax} Gyr)</span>
                  </div>
                  <div className="text-[9.5px] text-slate-400 font-mono mb-1.5 flex items-center gap-1.5">
                    <span className="text-slate-500">Distribution:</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${selectedSector.ageDistribution === 'uniform' ? 'bg-amber-950/80 text-amber-300 border border-amber-800' : 'bg-blue-950/80 text-blue-300 border border-blue-800'}`}>
                      {selectedSector.ageDistribution === 'uniform' ? 'Uniform Distribution' : 'Normal Distribution'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    {selectedSector.ageDistribution === 'uniform'
                      ? '🌌 Galactic Bulge: Wide uniform age distribution spanning from primordial remnants to ongoing stellar accretion.'
                      : selectedSector.rNorm > 0.90
                      ? '⚪ Galactic Halo: Ancient Population II stars with narrow age range (all stars are uniformly old).'
                      : selectedSector.meanAge < 2.0
                      ? '🌀 Spiral Arm Ridge: Active Population I starburst with hot young O/B/A stars.'
                      : 'Intermediate Solar-age thin disk population with balanced stellar generations.'}
                  </p>
                </div>

                {/* Integrated Photometric Light */}
                <div className="border-t border-slate-800/80 pt-2.5">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Integrated Photometric Light</span>
                    <span className="font-bold flex items-center gap-1.5 font-mono" style={{ color: selectedSector.colorHex }}>
                      <span className="w-2.5 h-2.5 rounded-full border border-white/50 shadow-sm" style={{ backgroundColor: selectedSector.colorHex }} />
                      {selectedSector.colorHex}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Luminosity-weighted average of all constituent stars in the sector.
                  </p>
                </div>

                {/* Mean Metallicity */}
                <div className="border-t border-slate-800/80 pt-2.5">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Mean Metallicity [Fe/H]</span>
                    <span className={`font-bold ${selectedSector.metallicityMean >= 0 ? 'text-amber-300' : 'text-cyan-300'}`}>
                      {selectedSector.metallicityMean >= 0 ? `+${selectedSector.metallicityMean}` : selectedSector.metallicityMean} dex
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    {selectedSector.metallicityMean >= 0.15
                      ? 'Super-solar metallicity: promotes giant planet formation and heavy rocky cores.'
                      : selectedSector.metallicityMean >= -0.3
                      ? 'Near-solar metallicity: balanced terrestrial and gas giant disk partitions.'
                      : 'Sub-solar / metal-poor: terrestrial planets are smaller; gas giants rare.'}
                  </p>
                </div>
              </div>

              {/* Active Emission Nebula Card */}
              {selectedSector.hasNebula && (
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-fuchsia-950/70 via-purple-950/50 to-slate-900/80 border border-fuchsia-500/50 font-mono space-y-1.5 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-fuchsia-300 flex items-center gap-1.5">
                      <span>🌌</span> Active Emission Nebula
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-950/90 text-fuchsia-300 border border-fuchsia-700 font-bold">
                      &lt;1.0 Gyr
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white tracking-wide">
                    {selectedSector.nebulaName || 'H-II Starburst Complex'}
                  </div>
                  <div className="text-[10px] text-fuchsia-200/80 leading-relaxed">
                    Glowing purple-red H-II gas cloud on galaxy map. Sector map background will render as colored noise clouds!
                  </div>
                </div>
              )}

              {/* Giant Star Systems Card */}
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 font-mono space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <span>⭐</span> Giant Star Systems (10–50 M☉)
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/80 font-bold">
                    {selectedSector.giantStars?.length || 0} Systems
                  </span>
                </div>
                <div className="text-[10.5px] text-slate-400">
                  Calculated as: <span className="text-cyan-300 font-semibold">{Math.round(selectedSector.density * 100)}% density &divide; 10 &rarr; {Math.floor(Math.round(selectedSector.density * 100) / 10)} giant stars</span>. Rendered as spectral-coded stellar points distributed within this sector hex.
                </div>
                {selectedSector.giantStars && selectedSector.giantStars.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1 max-h-32 overflow-y-auto pr-1">
                    {selectedSector.giantStars.map((gs) => (
                      <span
                        key={gs.id}
                        className="px-2 py-0.5 rounded-md text-[10px] flex items-center gap-1.5 border"
                        style={{
                          backgroundColor: `${gs.colorHex}15`,
                          borderColor: `${gs.colorHex}45`,
                          color: gs.colorHex,
                        }}
                        title={`${gs.spectralType} • Mass: ${gs.mass} M☉`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: gs.colorHex }} />
                        <span className="font-semibold">{gs.spectralType.split(' ')[0]}</span>
                        <span className="text-slate-400 font-mono text-[9px]">{gs.mass} M☉</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Seed & Transfer Metadata */}
              <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 text-[10px] font-mono text-slate-400">
                <div className="text-slate-500 uppercase tracking-wider font-bold mb-1">Parameters Passed to SectorHex</div>
                <div className="space-y-0.5 text-slate-300">
                  <div>&bull; Seed: <code className="text-blue-300">{selectedSector.seed}</code></div>
                  <div>&bull; Grid Dimensions: <code className="text-blue-300">50 &times; 50</code> (2,500 hexes)</div>
                  <div>&bull; Density: <code className="text-blue-300">{selectedSector.density}</code></div>
                  <div>&bull; Mean Age: <code className="text-blue-300">{selectedSector.meanAge} Gyr</code></div>
                  <div>&bull; Age Range: <code className="text-blue-300">{selectedSector.ageRange} Gyr ({selectedSector.ageDistribution})</code></div>
                  <div>&bull; Metallicity: <code className="text-blue-300">{selectedSector.metallicityMean} dex</code></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs font-mono">
              Click any sector hexagon to inspect its galactic astrophysics.
            </div>
          )}
        </aside>
        )}
      </div>

      {/* ============================================================================ */}
      {/* ADVANCED GALAXY CUSTOMIZATION MODAL                                          */}
      {/* ============================================================================ */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100 flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white tracking-wide">
                  Customize Galaxy Parameters
                </h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              {/* Galaxy Morphology */}
              <div>
                <label className="text-slate-300 block mb-1.5 font-bold">
                  Galaxy Morphology Type
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {MORPHOLOGY_OPTIONS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setDraftConfig((d) => ({ ...d, morphology: m.id }))}
                      className={`p-2 rounded-xl text-left border transition ${
                        draftConfig.morphology === m.id
                          ? 'bg-blue-950/80 border-blue-500 text-white font-bold'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs">
                        <span>{m.icon}</span>
                        <span>{m.label.split(' ')[0]}</span>
                      </div>
                      <div className="text-[9px] text-slate-500 truncate mt-0.5">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Galaxy Seed */}
              <div>
                <label className="text-slate-300 block mb-1 font-bold">
                  Galaxy PRNG Seed
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={draftConfig.seed}
                    onChange={(e) =>
                      setDraftConfig((d) => ({ ...d, seed: parseInt(e.target.value) || 1 }))
                    }
                    className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDraftConfig((d) => ({
                        ...d,
                        seed: Math.floor(Math.random() * 90000) + 1000,
                      }))
                    }
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                  >
                    Random
                  </button>
                </div>
              </div>

              {/* Arm Parameters (Count, Winding, Width, Strength for spirals) */}
              {(draftConfig.morphology === 'spiral' || draftConfig.morphology === 'barred-spiral') && (
                <div className="space-y-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">
                    Spiral Arm Mechanics
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-300 block mb-1">
                        Arm Count: <strong className="text-blue-400">{draftConfig.armCount}</strong>
                      </label>
                      <input
                        type="range"
                        min={2}
                        max={6}
                        step={1}
                        value={draftConfig.armCount}
                        onChange={(e) =>
                          setDraftConfig((d) => ({ ...d, armCount: parseInt(e.target.value) }))
                        }
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="text-slate-300 block mb-1">
                        Arm Winding: <strong className="text-blue-400">{draftConfig.armWinding.toFixed(2)}x</strong>
                      </label>
                      <input
                        type="range"
                        min={0.5}
                        max={5.0}
                        step={0.05}
                        value={draftConfig.armWinding}
                        onChange={(e) =>
                          setDraftConfig((d) => ({ ...d, armWinding: parseFloat(e.target.value) }))
                        }
                        className="w-full accent-blue-500 cursor-pointer"
                      />
                      <div className="text-[9px] text-slate-500 mt-0.5">Scale up to 5.0x tight winding</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-slate-800/60 pt-2.5">
                    <div>
                      <label className="text-slate-300 block mb-1">
                        Arm Width: <strong className="text-cyan-400">{(draftConfig.armWidth ?? 1.0).toFixed(2)}x</strong>
                      </label>
                      <input
                        type="range"
                        min={0.3}
                        max={2.5}
                        step={0.05}
                        value={draftConfig.armWidth ?? 1.0}
                        onChange={(e) =>
                          setDraftConfig((d) => ({ ...d, armWidth: parseFloat(e.target.value) }))
                        }
                        className="w-full accent-cyan-500 cursor-pointer"
                      />
                      <div className="text-[9px] text-slate-500 mt-0.5">Filament thin to sweeping broad</div>
                    </div>
                    <div>
                      <label className="text-slate-300 block mb-1">
                        Arm Strength: <strong className="text-amber-400">{(draftConfig.armStrength ?? 1.0).toFixed(2)}x</strong>
                      </label>
                      <input
                        type="range"
                        min={0.2}
                        max={3.0}
                        step={0.05}
                        value={draftConfig.armStrength ?? 1.0}
                        onChange={(e) =>
                          setDraftConfig((d) => ({ ...d, armStrength: parseFloat(e.target.value) }))
                        }
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="text-[9px] text-slate-500 mt-0.5">Density multiplier for spiral arms</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Galaxy Radius & Overall Density Scale */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-slate-300 block font-bold">
                      Physical Radius:
                    </label>
                    <strong className="text-emerald-400">{draftConfig.radiusKpc} kpc</strong>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={50}
                    step={1}
                    value={draftConfig.radiusKpc}
                    onChange={(e) =>
                      setDraftConfig((d) => ({ ...d, radiusKpc: parseInt(e.target.value) }))
                    }
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="text-[9.5px] text-slate-400 mt-1 font-mono">
                    {draftConfig.radiusKpc === 50
                      ? '🌌 50 kpc: Fills entire 50×50 grid'
                      : draftConfig.radiusKpc === 25
                      ? '🌌 25 kpc: Extends halfway out'
                      : `Extends ${Math.round((draftConfig.radiusKpc / 50) * 100)}% of grid`}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-slate-300 block font-bold">
                      Density Scale:
                    </label>
                    <strong className={draftConfig.overallDensityScale > 1.2 ? 'text-amber-300' : 'text-emerald-400'}>
                      {draftConfig.overallDensityScale.toFixed(2)}x
                    </strong>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={3.0}
                    step={0.05}
                    value={draftConfig.overallDensityScale}
                    onChange={(e) =>
                      setDraftConfig((d) => ({
                        ...d,
                        overallDensityScale: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="text-[9.5px] text-slate-400 mt-1 font-mono">
                    {draftConfig.overallDensityScale > 1.2 ? '🔥 Overdensity overflow active' : 'Baseline stellar density'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplySliders}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-mono font-bold transition shadow-lg shadow-blue-500/20 cursor-pointer"
              >
                Generate Galaxy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Galaxy Astrophotography Image Quantizer Modal */}
      {showImageModal && (
        <ImageQuantizerModal
          isOpen={showImageModal}
          onClose={() => setShowImageModal(false)}
          onApplyQuantizedGalaxy={handleApplyQuantizedGalaxy}
          currentRadiusKpc={config.radiusKpc}
        />
      )}

      {/* Saved Galaxies Catalog Modal */}
      {showSavedGalaxiesModal && (
        <SavedGalaxiesModal
          isOpen={showSavedGalaxiesModal}
          onClose={() => setShowSavedGalaxiesModal(false)}
          currentConfig={config}
          currentStats={{
            activeSectors: galaxyData.stats.activeSectors,
            totalEstimatedStars: galaxyData.stats.totalEstimatedStars,
            avgDensity: galaxyData.stats.avgDensity,
            avgAge: galaxyData.stats.avgAge,
            nebulaCount: galaxyData.stats.nebulaCount,
          }}
          onLoadGalaxy={handleLoadSavedGalaxy}
        />
      )}
    </div>
  );
};
