import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  Hexagon,
  Sparkles,
  RefreshCw,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Atom,
  Copy,
  Check,
  Filter,
  Info,
  Sliders,
  X,
  Grid,
} from 'lucide-react';
import {
  SectorHexConfig,
  SectorHexSystem,
  SectorHexCell,
  DEFAULT_SECTOR_CONFIG,
  generateSectorHexGrid,
} from '../../core/generation/sectorHex';
import { StarGenParams } from '../../core/generation/realisticStarGen';
import { SpectralCategory } from '../../types/astrophysics';

interface SectorHexAppProps {
  onLaunchStarGen: (params: StarGenParams) => void;
  onBackToGalaxy?: () => void;
  initialConfig?: Partial<SectorHexConfig> | null;
}

type SectorPresetKey = 'disk' | 'young-cluster' | 'old-halo' | 'dense-core';

interface SectorPreset {
  id: SectorPresetKey;
  label: string;
  description: string;
  density: number;
  meanAge: number;
  ageSigma: number;
  metallicityMean: number;
  metallicitySigma: number;
}

const SECTOR_PRESETS: SectorPreset[] = [
  {
    id: 'disk',
    label: 'Galactic Thin Disk',
    description: 'Solar neighborhood mix of stars with moderate metallicity and balanced ages.',
    density: 0.38,
    meanAge: 4.8,
    ageSigma: 1.8,
    metallicityMean: 0.04,
    metallicitySigma: 0.22,
  },
  {
    id: 'young-cluster',
    label: 'Young Open Cluster',
    description: 'Recent star-forming nursery with high OB frequency and enriched metals.',
    density: 0.55,
    meanAge: 0.9,
    ageSigma: 0.5,
    metallicityMean: 0.24,
    metallicitySigma: 0.12,
  },
  {
    id: 'old-halo',
    label: 'Ancient Galactic Halo',
    description: 'Ancient, metal-poor Population II stars with abundant white dwarf remnants.',
    density: 0.24,
    meanAge: 10.2,
    ageSigma: 1.6,
    metallicityMean: -0.95,
    metallicitySigma: 0.35,
  },
  {
    id: 'dense-core',
    label: 'Galactic Bulge Core',
    description: 'High stellar density environment with chaotic stellar interactions.',
    density: 0.65,
    meanAge: 7.5,
    ageSigma: 2.0,
    metallicityMean: 0.18,
    metallicitySigma: 0.28,
  },
];

export const SectorHexApp: React.FC<SectorHexAppProps> = ({
  onLaunchStarGen,
  onBackToGalaxy,
  initialConfig,
}) => {
  // Sector Configuration state initialized with initialConfig if provided
  const [config, setConfig] = useState<SectorHexConfig>(() => ({
    ...DEFAULT_SECTOR_CONFIG,
    ...(initialConfig || {}),
  }));

  // Re-sync if initialConfig updates
  useEffect(() => {
    if (initialConfig) {
      setConfig((prev) => ({
        ...prev,
        ...initialConfig,
      }));
    }
  }, [initialConfig]);

  const [activePreset, setActivePreset] = useState<SectorPresetKey>('disk');
  const [searchCoord, setSearchCoord] = useState<string>('');
  const [filterCat, setFilterCat] = useState<'all' | SpectralCategory | 'habitable'>('all');

  // Custom Grid & Density Modal/Drawer state
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [draftCols, setDraftCols] = useState<number>(config.columns);
  const [draftRows, setDraftRows] = useState<number>(config.rows);
  const [draftDensity, setDraftDensity] = useState<number>(config.density);
  const [draftAge, setDraftAge] = useState<number>(config.meanAge);
  const [draftFeh, setDraftFeh] = useState<number>(config.metallicityMean);
  const [draftSeed, setDraftSeed] = useState<number>(config.seed);

  // Sync draft inputs when config changes
  useEffect(() => {
    setDraftCols(config.columns);
    setDraftRows(config.rows);
    setDraftDensity(config.density);
    setDraftAge(config.meanAge);
    setDraftFeh(config.metallicityMean);
    setDraftSeed(config.seed);
  }, [config.columns, config.rows, config.density, config.meanAge, config.metallicityMean, config.seed]);

  // Generated Grid Data
  const gridData = useMemo(() => generateSectorHexGrid(config), [config]);

  // Selected Hex System
  const [selectedSystem, setSelectedSystem] = useState<SectorHexSystem | null>(() => {
    return gridData.systems[0] || null;
  });

  // Keep selection synchronized when config regenerates
  useEffect(() => {
    if (gridData.systems.length > 0) {
      if (selectedSystem) {
        const stillPresent = gridData.systems.find((s) => s.coord === selectedSystem.coord);
        setSelectedSystem(stillPresent || gridData.systems[0]);
      } else {
        setSelectedSystem(gridData.systems[0]);
      }
    } else {
      setSelectedSystem(null);
    }
  }, [gridData]);

  // Pan & Zoom Canvas Camera
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hover state
  const [hoveredCell, setHoveredCell] = useState<SectorHexCell | null>(null);

  // Copied state
  const [copiedId, setCopiedId] = useState<boolean>(false);

  // Hex Geometry Parameters (Pointy-topped)
  const hexRadius = 46; // Radius from center to vertices in px
  const hexWidth = Math.sqrt(3) * hexRadius; // ~79.67 px
  const hexHeight = 2 * hexRadius; // 92 px
  const colSpacing = hexWidth;
  const rowSpacing = 1.5 * hexRadius; // 69 px

  // Calculate pixel center for column c and row r (1-indexed)
  const getHexCenter = useCallback(
    (col: number, row: number) => {
      const xOffset = row % 2 === 1 ? hexWidth * 0.5 : 0;
      const cx = (col - 1) * colSpacing + hexRadius + xOffset + 30;
      const cy = (row - 1) * rowSpacing + hexRadius + 30;
      return { cx, cy };
    },
    [colSpacing, rowSpacing, hexRadius, hexWidth]
  );

  // Generate SVG polygon points for pointy-topped hexagon
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

  // Total bounds of the hex grid
  const gridBoundingSize = useMemo(() => {
    const totalW = config.columns * colSpacing + hexWidth + 80;
    const totalH = config.rows * rowSpacing + hexHeight + 80;
    return { width: Math.max(800, totalW), height: Math.max(600, totalH) };
  }, [config.columns, config.rows, colSpacing, rowSpacing, hexWidth, hexHeight]);

  // Track container viewport dimensions for smooth frustum/viewport culling
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

  // Center & Fit Hex Grid in Viewport
  const handleFitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const scaleX = (clientWidth - 80) / gridBoundingSize.width;
    const scaleY = (clientHeight - 80) / gridBoundingSize.height;
    const fitScale = Math.max(0.08, Math.min(1.4, Math.min(scaleX, scaleY)));
    setZoom(fitScale);
    setPan({
      x: (clientWidth - gridBoundingSize.width * fitScale) / 2,
      y: (clientHeight - gridBoundingSize.height * fitScale) / 2,
    });
  }, [gridBoundingSize]);

  useEffect(() => {
    handleFitToScreen();
  }, [config.columns, config.rows]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
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

  // Zoom with scroll wheel
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((prev) => Math.max(0.06, Math.min(2.8, prev * zoomFactor)));
  };

  // Preset Selector
  const handleSelectPreset = (preset: SectorPreset) => {
    setActivePreset(preset.id);
    setConfig((prev) => ({
      ...prev,
      density: preset.density,
      meanAge: preset.meanAge,
      ageSigma: preset.ageSigma,
      metallicityMean: preset.metallicityMean,
      metallicitySigma: preset.metallicitySigma,
    }));
  };

  // Roll New Sector
  const handleRollNewSector = () => {
    const newSeed = Math.floor(Math.random() * 90000) + 1000;
    setConfig((prev) => ({ ...prev, seed: newSeed }));
  };

  // Apply Custom Grid Size and Density
  const handleApplyCustomGrid = (
    newCols: number,
    newRows: number,
    newDensity: number,
    newAge: number,
    newFeh: number,
    newSeed: number
  ) => {
    const clampedCols = Math.max(4, Math.min(100, Math.round(newCols)));
    const clampedRows = Math.max(4, Math.min(100, Math.round(newRows)));
    const clampedDensity = Math.max(0.05, Math.min(3.5, +newDensity.toFixed(2)));
    const clampedAge = Math.max(0.2, Math.min(12.8, +newAge.toFixed(2)));
    const clampedFeh = Math.max(-1.7, Math.min(0.5, +newFeh.toFixed(2)));
    setConfig((prev) => ({
      ...prev,
      columns: clampedCols,
      rows: clampedRows,
      density: clampedDensity,
      meanAge: clampedAge,
      metallicityMean: clampedFeh,
      seed: newSeed,
    }));
    setShowConfigModal(false);
  };

  // Search Hex Coordinate
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCoord.trim()) return;
    const clean = searchCoord.trim().padStart(4, '0');
    const match = gridData.cells.find((c) => c.coord === clean);
    if (match) {
      if (match.system) {
        setSelectedSystem(match.system);
      }
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

  // Copy ID
  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1800);
  };

  // Launch StarGen Lab
  const handleLaunchSystemGenerator = (system: SectorHexSystem) => {
    const params: StarGenParams = {
      sysMass: system.mass,
      age: system.age,
      feh: system.metallicity,
      id: system.id,
      name: system.name,
      forcedMult: 'auto',
    };
    onLaunchStarGen(params);
  };

  // ============================================================================
  // MULTIPLE STAR RENDERING HELPER (DEPICTS MULTIPLE STARS IN SECTORHEX GRAPHIC)
  // ============================================================================
  const renderSystemStars = (system: SectorHexSystem) => {
    const stars = system.sysResult.hierarchy.stars;
    const n = stars.length;

    // Single Star
    if (n <= 1 || !stars || stars.length === 0) {
      const star = stars[0] || { mass: system.primaryMass, colorHex: system.colorHex };
      const r = Math.min(9.5, Math.max(3.5, 4.2 * Math.pow(star.mass, 0.28)));
      const glowR = Math.min(20, Math.max(8, 7 * Math.pow(star.mass, 0.35)));
      return (
        <g>
          <circle r={glowR} fill={star.colorHex} opacity={0.35} filter="url(#hexStarGlow)" />
          <circle r={r} fill={star.colorHex} stroke="#ffffff" strokeWidth={0.7} />
        </g>
      );
    }

    // Binary System (Star A & Star B side-by-side with gravitational bridge)
    if (n === 2) {
      const starA = stars[0];
      const starB = stars[1];
      const rA = Math.min(7.5, Math.max(3.0, 3.8 * Math.pow(starA.mass, 0.28)));
      const rB = Math.min(6.5, Math.max(2.4, 3.4 * Math.pow(starB.mass, 0.28)));
      const posA = { x: -6.5, y: -2 };
      const posB = { x: +6.5, y: -2 };
      return (
        <g>
          {/* Subtle orbital bridge */}
          <ellipse
            cx={0}
            cy={-2}
            rx={10.5}
            ry={4.5}
            fill="none"
            stroke="rgba(148, 163, 184, 0.25)"
            strokeWidth={0.8}
            strokeDasharray="2,2"
          />
          {/* Star A */}
          <circle cx={posA.x} cy={posA.y} r={rA * 1.9} fill={starA.colorHex} opacity={0.30} filter="url(#hexStarGlow)" />
          <circle cx={posA.x} cy={posA.y} r={rA} fill={starA.colorHex} stroke="#ffffff" strokeWidth={0.6} />

          {/* Star B */}
          <circle cx={posB.x} cy={posB.y} r={rB * 1.9} fill={starB.colorHex} opacity={0.30} filter="url(#hexStarGlow)" />
          <circle cx={posB.x} cy={posB.y} r={rB} fill={starB.colorHex} stroke="#ffffff" strokeWidth={0.6} />
        </g>
      );
    }

    // Trinary System (Triangle configuration: Primary A on left, B & C pair on right)
    if (n === 3) {
      const starA = stars[0];
      const starB = stars[1];
      const starC = stars[2];
      const rA = Math.min(7.0, Math.max(2.8, 3.5 * Math.pow(starA.mass, 0.28)));
      const rB = Math.min(5.5, Math.max(2.2, 3.0 * Math.pow(starB.mass, 0.28)));
      const rC = Math.min(5.5, Math.max(2.0, 3.0 * Math.pow(starC.mass, 0.28)));
      const posA = { x: -7.5, y: -2 };
      const posB = { x: +6.0, y: -6.5 };
      const posC = { x: +6.0, y: +2.5 };
      return (
        <g>
          <ellipse
            cx={0}
            cy={-2}
            rx={12}
            ry={6.5}
            fill="none"
            stroke="rgba(148, 163, 184, 0.20)"
            strokeWidth={0.7}
            strokeDasharray="2,2"
          />
          {/* Star A */}
          <circle cx={posA.x} cy={posA.y} r={rA * 1.8} fill={starA.colorHex} opacity={0.30} filter="url(#hexStarGlow)" />
          <circle cx={posA.x} cy={posA.y} r={rA} fill={starA.colorHex} stroke="#ffffff" strokeWidth={0.6} />

          {/* Star B */}
          <circle cx={posB.x} cy={posB.y} r={rB * 1.8} fill={starB.colorHex} opacity={0.30} filter="url(#hexStarGlow)" />
          <circle cx={posB.x} cy={posB.y} r={rB} fill={starB.colorHex} stroke="#ffffff" strokeWidth={0.6} />

          {/* Star C */}
          <circle cx={posC.x} cy={posC.y} r={rC * 1.8} fill={starC.colorHex} opacity={0.30} filter="url(#hexStarGlow)" />
          <circle cx={posC.x} cy={posC.y} r={rC} fill={starC.colorHex} stroke="#ffffff" strokeWidth={0.6} />
        </g>
      );
    }

    // Quadruple System (4 Stars: Dual binary pairs AB and CD)
    const starA = stars[0];
    const starB = stars[1];
    const starC = stars[2];
    const starD = stars[3];
    const rA = Math.min(6.0, Math.max(2.5, 3.0 * Math.pow(starA.mass, 0.28)));
    const rB = Math.min(5.0, Math.max(2.0, 2.6 * Math.pow(starB.mass, 0.28)));
    const rC = Math.min(5.0, Math.max(2.0, 2.6 * Math.pow(starC.mass, 0.28)));
    const rD = Math.min(4.5, Math.max(1.8, 2.4 * Math.pow(starD.mass, 0.28)));
    const posA = { x: -8, y: -5 };
    const posB = { x: -6, y: +2 };
    const posC = { x: +6, y: -5 };
    const posD = { x: +8, y: +2 };
    return (
      <g>
        <ellipse
          cx={0}
          cy={-1.5}
          rx={13.5}
          ry={7}
          fill="none"
          stroke="rgba(148, 163, 184, 0.20)"
          strokeWidth={0.7}
          strokeDasharray="2,2"
        />
        <circle cx={posA.x} cy={posA.y} r={rA * 1.6} fill={starA.colorHex} opacity={0.28} filter="url(#hexStarGlow)" />
        <circle cx={posA.x} cy={posA.y} r={rA} fill={starA.colorHex} stroke="#ffffff" strokeWidth={0.5} />

        <circle cx={posB.x} cy={posB.y} r={rB * 1.6} fill={starB.colorHex} opacity={0.28} filter="url(#hexStarGlow)" />
        <circle cx={posB.x} cy={posB.y} r={rB} fill={starB.colorHex} stroke="#ffffff" strokeWidth={0.5} />

        <circle cx={posC.x} cy={posC.y} r={rC * 1.6} fill={starC.colorHex} opacity={0.28} filter="url(#hexStarGlow)" />
        <circle cx={posC.x} cy={posC.y} r={rC} fill={starC.colorHex} stroke="#ffffff" strokeWidth={0.5} />

        <circle cx={posD.x} cy={posD.y} r={rD * 1.6} fill={starD.colorHex} opacity={0.28} filter="url(#hexStarGlow)" />
        <circle cx={posD.x} cy={posD.y} r={rD} fill={starD.colorHex} stroke="#ffffff" strokeWidth={0.5} />
      </g>
    );
  };

  // ============================================================================
  // HIGH-PERFORMANCE VIEWPORT CULLING FOR LARGE GRIDS (UP TO 100x100 = 10,000 HEXES!)
  // ============================================================================
  const visibleHexCells = useMemo(() => {
    // If total hexes are small (<= 400), rendering all cells is fast
    if (config.columns * config.rows <= 400) {
      return gridData.cells;
    }

    // For large grids up to 100x100: calculate visible column and row bounds in O(1)
    const margin = 140; // Pixel padding around screen
    const viewMinX = -pan.x / zoom - margin;
    const viewMaxX = (containerSize.width - pan.x) / zoom + margin;
    const viewMinY = -pan.y / zoom - margin;
    const viewMaxY = (containerSize.height - pan.y) / zoom + margin;

    const minCol = Math.max(1, Math.floor((viewMinX - 30) / colSpacing));
    const maxCol = Math.min(config.columns, Math.ceil((viewMaxX - 30) / colSpacing) + 1);
    const minRow = Math.max(1, Math.floor((viewMinY - 30) / rowSpacing));
    const maxRow = Math.min(config.rows, Math.ceil((viewMaxY - 30) / rowSpacing) + 1);

    const culled: SectorHexCell[] = [];
    for (let c = minCol; c <= maxCol; c++) {
      for (let r = minRow; r <= maxRow; r++) {
        const idx = (c - 1) * config.rows + (r - 1);
        const cell = gridData.cells[idx];
        if (cell) culled.push(cell);
      }
    }
    return culled;
  }, [gridData.cells, config.columns, config.rows, pan.x, pan.y, zoom, containerSize, colSpacing, rowSpacing]);

  return (
    <div className="w-full h-full flex flex-col bg-[#050814] text-slate-100 overflow-hidden font-sans select-none relative">
      {/* ============================================================================ */}
      {/* TOP COMMAND & SECTOR CONFIGURATION TOOLBAR                                   */}
      {/* ============================================================================ */}
      <div className="w-full px-4 py-2.5 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 z-20">
        {/* Back to Galaxy Map button if opened from GalaxyGen */}
        {onBackToGalaxy && (
          <button
            onClick={onBackToGalaxy}
            className="px-2.5 py-1.5 rounded-xl bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/80 flex items-center gap-1.5 cursor-pointer transition shadow text-xs font-mono font-bold"
            title="Return to 50x50 Galaxy Sector Map"
          >
            <span>&larr; Galaxy Map</span>
          </button>
        )}

        {/* Title & Sector Info */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 border border-cyan-400/30">
            <Hexagon className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                SECTOR HEX GENERATOR
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800">
                  Seed #{config.seed}
                </span>
              </h2>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-2">
              <span className="text-cyan-300 font-semibold">{config.columns}&times;{config.rows} Hex Grid</span>
              <span className="text-slate-600">&bull;</span>
              <span>{gridData.stats.occupiedHexes.toLocaleString()} Systems ({gridData.stats.occupancyPct}% density)</span>
              <span className="text-slate-600">&bull;</span>
              <span>Multi-Star Depictions Active</span>
            </p>
          </div>
        </div>

        {/* Preset Selector Buttons */}
        <div className="hidden xl:flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-mono">
          {SECTOR_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelectPreset(p)}
              className={`px-2.5 py-1 rounded-lg transition text-[11px] cursor-pointer ${
                activePreset === p.id
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title={p.description}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Grid Dimensions & Density Button */}
        <button
          onClick={() => setShowConfigModal(true)}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 hover:border-cyan-500 text-xs font-mono font-medium flex items-center gap-2 transition shadow cursor-pointer"
          title="Customize Hex Grid Dimensions (up to 100x100), Density, Age & Metallicity"
        >
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span>Grid: <strong className="text-white">{config.columns}&times;{config.rows}</strong></span>
          <span className="text-slate-500">&bull;</span>
          <span>Density: <strong className={config.density > 1.0 ? 'text-amber-300 font-bold' : 'text-emerald-300'}>{Math.round(config.density * 100)}%{config.density > 1.0 ? ' (Overdensity)' : ''}</strong></span>
          <span className="text-slate-500">&bull;</span>
          <span className="hidden md:inline">Age: <strong className="text-cyan-300">{config.meanAge.toFixed(1)} Gyr</strong></span>
        </button>

        {/* Search Hex Coordinate */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Jump to hex (e.g. 0408)..."
              value={searchCoord}
              onChange={(e) => setSearchCoord(e.target.value)}
              className="w-44 pl-8 pr-2 py-1 text-xs font-mono bg-slate-900/90 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>
          <button
            type="submit"
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-mono transition"
          >
            Go
          </button>
        </form>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRollNewSector}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 transition cursor-pointer"
            title="Generate a brand new randomized stellar sector"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Roll New Sector</span>
          </button>
        </div>
      </div>

      {/* ============================================================================ */}
      {/* GRID SIZE, DENSITY, AGE & METALLICITY CUSTOMIZATION MODAL (UP TO 100x100!)   */}
      {/* ============================================================================ */}
      {showConfigModal && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 font-mono text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Grid className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Customize Sector Parameters
                </h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Grid Dimension Presets */}
            <div>
              <label className="text-[11px] text-slate-400 uppercase font-semibold mb-2 block">
                Quick Dimension Presets
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: '10×10', cols: 10, rows: 10, desc: '100 hexes' },
                  { label: '25×25', cols: 25, rows: 25, desc: '625 hexes' },
                  { label: '50×50', cols: 50, rows: 50, desc: '2.5k hexes' },
                  { label: '100×100', cols: 100, rows: 100, desc: '10k hexes!' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setDraftCols(preset.cols);
                      setDraftRows(preset.rows);
                    }}
                    className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                      draftCols === preset.cols && draftRows === preset.rows
                        ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-bold">{preset.label}</div>
                    <div className="text-[9.5px] text-slate-500">{preset.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Columns & Rows Custom Sliders */}
            <div className="space-y-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              {/* Columns */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-400">Grid Width (Columns):</span>
                  <span className="text-cyan-300 font-bold">{draftCols} columns</span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={100}
                  step={1}
                  value={draftCols}
                  onChange={(e) => setDraftCols(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              {/* Rows */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-400">Grid Height (Rows):</span>
                  <span className="text-cyan-300 font-bold">{draftRows} rows</span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={100}
                  step={1}
                  value={draftRows}
                  onChange={(e) => setDraftRows(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              {/* Total Hex Count Preview */}
              <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span>Total Hex Cells:</span>
                <span className="text-slate-200 font-bold">{(draftCols * draftRows).toLocaleString()} hexes</span>
              </div>
            </div>

            {/* Stellar Density Slider */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-400">Stellar Occupancy Density:</span>
                <span className={`font-bold ${draftDensity > 1.0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {Math.round(draftDensity * 100)}%{draftDensity > 1.0 ? ' (Overdensity Overflow)' : ''}
                </span>
              </div>
              <input
                type="range"
                min={0.05}
                max={3.5}
                step={0.05}
                value={draftDensity}
                onChange={(e) => setDraftDensity(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              {draftDensity > 1.0 ? (
                <div className="mt-2 p-2 rounded-lg bg-amber-950/40 border border-amber-800/60 text-[10px] text-amber-300/90 leading-relaxed font-mono">
                  🔥 <strong>Overdensity Overflow Active:</strong> 100% of hexes are occupied. The excess density overflows onto mass, spawning heavy O/B stars, multiple-star hierarchies (binaries, trinaries, quadruples), and collapsed stellar remnants (black holes, neutron stars, white dwarfs)!
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 flex items-center justify-between mt-2 pt-1 border-t border-slate-800/80">
                  <span>Estimated Systems:</span>
                  <span className="text-emerald-400 font-bold">
                    ~{Math.round(draftCols * draftRows * draftDensity).toLocaleString()} star systems
                  </span>
                </div>
              )}
            </div>

            {/* Average Stellar Age Slider */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-400">Average Stellar Age:</span>
                <span className="text-cyan-300 font-bold">{draftAge.toFixed(1)} Gyr</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={12.5}
                step={0.1}
                value={draftAge}
                onChange={(e) => setDraftAge(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="text-[9.5px] text-slate-500 mt-1 flex justify-between">
                <span>Young Starburst (0.2 Gyr)</span>
                <span>Solar (4.8 Gyr)</span>
                <span>Ancient Halo (12.0 Gyr)</span>
              </div>
            </div>

            {/* Average Metallicity [Fe/H] Slider */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-400">Average Metallicity ([Fe/H]):</span>
                <span className="text-amber-300 font-bold">
                  {draftFeh > 0 ? `+${draftFeh.toFixed(2)}` : draftFeh.toFixed(2)} dex
                </span>
              </div>
              <input
                type="range"
                min={-1.6}
                max={0.5}
                step={0.02}
                value={draftFeh}
                onChange={(e) => setDraftFeh(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="text-[9.5px] text-slate-500 mt-1 flex justify-between">
                <span>Metal-Poor (-1.6 dex)</span>
                <span>Solar (0.0 dex)</span>
                <span>Super Metal-Rich (+0.5 dex)</span>
              </div>
            </div>

            {/* Master Seed Input */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-slate-400 block mb-0.5">Master Seed:</span>
                <input
                  type="number"
                  value={draftSeed}
                  onChange={(e) => setDraftSeed(parseInt(e.target.value) || 1)}
                  className="w-28 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs font-bold"
                />
              </div>
              <button
                type="button"
                onClick={() => setDraftSeed(Math.floor(Math.random() * 90000) + 1000)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer self-end"
              >
                Randomize Seed
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApplyCustomGrid(draftCols, draftRows, draftDensity, draftAge, draftFeh, draftSeed)}
                className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold transition shadow-lg shadow-cyan-500/20 cursor-pointer"
              >
                Apply &amp; Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* MAIN VIEWPORT: HEX CANVAS + RIGHT INSPECTOR                                   */}
      {/* ============================================================================ */}
      <div className="w-full flex-1 flex flex-row min-h-0 relative overflow-hidden">
        {/* ============================================================================ */}
        {/* CENTER VIEWPORT: INTERACTIVE SVG HEX GRID (WITH MULTI-STAR GRAPHICS)          */}
        {/* ============================================================================ */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className={`flex-1 h-full relative overflow-hidden bg-[#030611] select-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, #0a1128 0%, #030611 100%)`,
          }}
        >
          {/* Subtle Deep Space Star Dust Background */}
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(1px 1px at 20px 30px, #ffffff, rgba(0,0,0,0)),
                                radial-gradient(1px 1px at 80px 140px, #67e8f9, rgba(0,0,0,0)),
                                radial-gradient(1.5px 1.5px at 220px 70px, #fde047, rgba(0,0,0,0)),
                                radial-gradient(1px 1px at 300px 220px, #f472b6, rgba(0,0,0,0)),
                                radial-gradient(1.5px 1.5px at 450px 180px, #ffffff, rgba(0,0,0,0))`,
              backgroundSize: '500px 500px',
            }}
          />

          {/* SVG Canvas with Zoom & Pan Transformation */}
          <svg
            className="w-full h-full absolute inset-0 pointer-events-auto"
            style={{ willChange: 'transform' }}
          >
            <defs>
              <filter id="hexStarGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g
              transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
              style={{ transformOrigin: '0 0' }}
            >
              {/* High-Performance Culled Hex Cells Rendering */}
              {visibleHexCells.map((cell) => {
                const { cx, cy } = getHexCenter(cell.col, cell.row);
                const hasSystem = !!cell.system;
                const isSelected = selectedSystem?.coord === cell.coord;
                const isHovered = hoveredCell?.coord === cell.coord;

                // Filter check
                let matchesFilter = true;
                if (filterCat !== 'all') {
                  if (!cell.system) {
                    matchesFilter = false;
                  } else if (filterCat === 'habitable') {
                    matchesFilter = cell.system.candidateHabitable;
                  } else {
                    matchesFilter = cell.system.spectralCat === filterCat;
                  }
                }

                const cellOpacity = matchesFilter ? 1 : 0.20;

                return (
                  <g
                    key={cell.coord}
                    transform={`translate(${cx}, ${cy})`}
                    onClick={() => {
                      if (cell.system) setSelectedSystem(cell.system);
                    }}
                    onDoubleClick={() => {
                      if (cell.system) handleLaunchSystemGenerator(cell.system);
                    }}
                    onMouseEnter={() => setHoveredCell(cell)}
                    onMouseLeave={() => setHoveredCell(null)}
                    className="cursor-pointer transition-opacity"
                    style={{ opacity: cellOpacity }}
                  >
                    {/* Hex Base Polygon */}
                    <polygon
                      points={hexPoints}
                      fill={
                        isSelected
                          ? 'rgba(14, 165, 233, 0.16)'
                          : isHovered
                          ? 'rgba(56, 189, 248, 0.10)'
                          : hasSystem
                          ? 'rgba(15, 23, 42, 0.65)'
                          : 'rgba(6, 11, 24, 0.40)'
                      }
                      stroke={
                        isSelected
                          ? '#38bdf8'
                          : isHovered
                          ? '#7dd3fc'
                          : hasSystem
                          ? 'rgba(71, 85, 105, 0.50)'
                          : 'rgba(30, 41, 59, 0.35)'
                      }
                      strokeWidth={isSelected ? 2.5 : isHovered ? 1.5 : 1}
                      strokeDasharray={isSelected ? '6,3' : 'none'}
                      className={isSelected ? 'animate-pulse' : ''}
                    />

                    {/* Coordinate Label at top of hex (hidden when zoomed very far out for performance) */}
                    {zoom >= 0.28 && (
                      <text
                        y={-hexRadius + 14}
                        textAnchor="middle"
                        fill={
                          isSelected
                            ? '#38bdf8'
                            : hasSystem
                            ? '#94a3b8'
                            : '#475569'
                        }
                        fontSize={hasSystem ? 9 : 8}
                        fontFamily="monospace"
                        fontWeight={hasSystem ? 'bold' : 'normal'}
                        letterSpacing="0.05em"
                      >
                        {cell.coord}
                      </text>
                    )}

                    {/* Occupied System Representation (Depicts Multiple Stars authentically) */}
                    {cell.system && (
                      <g>
                        {/* Render Multiple Stars (A, B, C, D) with their exact colors and sizes */}
                        {renderSystemStars(cell.system)}

                        {/* Habitable World Green Badge Dot */}
                        {cell.system.candidateHabitable && (
                          <circle
                            cx={14}
                            cy={-6}
                            r={2.5}
                            fill="#10b981"
                            stroke="#064e3b"
                            strokeWidth={0.5}
                          />
                        )}

                        {/* Star System Name (hidden at extreme zoom out) */}
                        {zoom >= 0.35 && (
                          <text
                            y={14}
                            textAnchor="middle"
                            fill="#f8fafc"
                            fontSize={8.5}
                            fontWeight="600"
                            letterSpacing="0.02em"
                            style={{
                              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                              pointerEvents: 'none',
                            }}
                          >
                            {cell.system.name.length > 12
                              ? cell.system.name.slice(0, 11) + '…'
                              : cell.system.name}
                          </text>
                        )}

                        {/* Spectral Class Pill */}
                        {zoom >= 0.35 && (
                          <text
                            y={25}
                            textAnchor="middle"
                            fill={cell.system.colorHex}
                            fontSize={7.5}
                            fontFamily="monospace"
                            fontWeight="bold"
                            style={{
                              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                              pointerEvents: 'none',
                            }}
                          >
                            {cell.system.primaryClass.split(' ')[0]} &bull; {cell.system.primaryMass.toFixed(2)}M☉{cell.system.nStars > 1 ? ` +${cell.system.nStars - 1}★` : ''}
                          </text>
                        )}
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Bottom Left Floating Navigation & View Controls */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-10 pointer-events-auto">
            {/* Spectral Filter Chips Bar */}
            <div className="flex items-center gap-1 bg-slate-950/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-800 shadow-xl text-xs font-mono">
              <span className="text-[10px] text-slate-500 uppercase mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3 text-cyan-400" /> Filter:
              </span>
              {(
                [
                  { id: 'all', label: 'All', color: 'text-slate-200' },
                  { id: 'ob', label: 'O/B', color: 'text-blue-400' },
                  { id: 'af', label: 'A/F', color: 'text-cyan-300' },
                  { id: 'g', label: 'G (Sol)', color: 'text-amber-300' },
                  { id: 'km', label: 'K/M', color: 'text-red-400' },
                  { id: 'remnant', label: 'Remnants', color: 'text-purple-400' },
                  { id: 'habitable', label: 'Candidate HZ', color: 'text-emerald-400' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterCat(f.id)}
                  className={`px-2 py-0.5 rounded text-[10px] transition cursor-pointer ${
                    filterCat === f.id
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span className={f.color}>{f.label}</span>
                </button>
              ))}
            </div>

            {/* Canvas Zoom & Reset Controls */}
            <div className="flex items-center gap-1.5 bg-slate-950/90 backdrop-blur-md px-2 py-1.5 rounded-xl border border-slate-800 shadow-xl text-xs font-mono w-fit">
              <button
                onClick={() => setZoom((z) => Math.min(2.8, z * 1.25))}
                className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(0.06, z * 0.8))}
                className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <div className="w-[1px] h-3.5 bg-slate-800 mx-0.5" />
              <button
                onClick={handleFitToScreen}
                className="px-2 py-1 hover:bg-slate-800 rounded text-[10.5px] text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1"
                title="Fit Grid to Screen"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Fit Sector</span>
              </button>
              <span className="text-[10px] text-slate-500 pl-1">
                {Math.round(zoom * 100)}%
              </span>
            </div>
          </div>

          {/* Quick Hover Tooltip if hovering a hex */}
          {hoveredCell && hoveredCell.system && (
            <div
              className="absolute top-4 left-4 bg-slate-950/90 backdrop-blur-md border border-slate-700/80 px-3 py-2 rounded-xl text-xs font-mono shadow-2xl pointer-events-none z-10 flex items-center gap-3 animate-fade-in"
            >
              <div
                className="w-3.5 h-3.5 rounded-full border border-white/60 shadow"
                style={{ backgroundColor: hoveredCell.system.colorHex }}
              />
              <div>
                <div className="text-white font-bold flex items-center gap-2">
                  <span>{hoveredCell.system.name}</span>
                  <span className="text-[10px] text-cyan-400 bg-cyan-950/60 px-1 rounded border border-cyan-800">
                    Hex {hoveredCell.coord}
                  </span>
                  {hoveredCell.system.nStars > 1 && (
                    <span className="text-[9.5px] text-blue-300 bg-blue-950/70 px-1 rounded border border-blue-800">
                      {hoveredCell.system.nStars}★ Multiple
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-2">
                  <span>{hoveredCell.system.primaryClass}</span>
                  <span>&bull;</span>
                  <span>Star A: {hoveredCell.system.primaryMass.toFixed(2)} M☉</span>
                  <span>&bull;</span>
                  <span>Sys: {hoveredCell.system.mass.toFixed(2)} M☉</span>
                  <span>&bull;</span>
                  <span>{hoveredCell.system.planetCount}p</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================================ */}
        {/* RIGHT SIDEBAR: DEEP HEX SYSTEM INSPECTOR & TUPLET LAUNCHER                   */}
        {/* ============================================================================ */}
        <div
          className="w-[380px] h-full flex flex-col bg-slate-950/95 border-l border-slate-800 flex-shrink-0 z-10 overflow-y-auto"
          style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 380px auto 800px' }}
        >
          {selectedSystem ? (
            <div className="p-4 flex flex-col gap-4">
              {/* Header: System Name & Hex Coordinate */}
              <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center border shadow-lg relative"
                    style={{
                      backgroundColor: `${selectedSystem.colorHex}18`,
                      borderColor: selectedSystem.colorHex,
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-full shadow-inner"
                      style={{
                        backgroundColor: selectedSystem.colorHex,
                        boxShadow: `0 0 16px ${selectedSystem.glowColor}`,
                      }}
                    />
                    {selectedSystem.candidateHabitable && (
                      <div
                        className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border border-slate-950 flex items-center justify-center text-[9px] text-white font-bold"
                        title="Candidate Habitable System"
                      >
                        ✓
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-base font-bold text-white tracking-wide">
                        {selectedSystem.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 mt-0.5">
                      <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10.5px]">
                        Hex {selectedSystem.coord}
                      </span>
                      <span className="text-slate-600">&bull;</span>
                      <span className="font-semibold text-slate-300">
                        {selectedSystem.primaryClass}
                      </span>
                      {selectedSystem.nStars > 1 && (
                        <span className="text-[10px] text-blue-300 bg-blue-950/80 px-1.5 py-0.2 rounded border border-blue-800">
                          {selectedSystem.nStars} Stars
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ============================================================================ */}
              {/* CORE REQUIREMENT: HIGH-VISIBILITY {age, mass, metallicity, id} TUPLET CARD   */}
              {/* ============================================================================ */}
              <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-950/50 via-slate-900 to-slate-950 border border-cyan-500/40 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between pb-2 border-b border-cyan-900/40 mb-3">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>System Parameters Tuplet</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                    Seeded PRNG
                  </span>
                </div>

                {/* 2x2 Grid of the 4 Tuple Values */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  {/* Mass */}
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Mass (sysMass)</div>
                    <div className="text-sm font-bold text-amber-300 mt-0.5">
                      {selectedSystem.mass.toFixed(3)} <span className="text-xs text-slate-400">M☉</span>
                    </div>
                    <div className="text-[9.5px] text-slate-400 mt-0.5">
                      Star A: <span className="text-amber-200 font-semibold">{selectedSystem.primaryMass.toFixed(3)} M☉</span>
                    </div>
                  </div>

                  {/* Age */}
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Age</div>
                    <div className="text-sm font-bold text-cyan-300 mt-0.5">
                      {selectedSystem.age.toFixed(2)} <span className="text-xs text-slate-400">Gyr</span>
                    </div>
                    <div className="text-[9.5px] text-slate-500 mt-0.5">Cosmic System Age</div>
                  </div>

                  {/* Metallicity */}
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Metallicity ([Fe/H])</div>
                    <div className="text-sm font-bold text-emerald-300 mt-0.5">
                      {selectedSystem.metallicity > 0
                        ? `+${selectedSystem.metallicity.toFixed(2)}`
                        : selectedSystem.metallicity.toFixed(2)}{' '}
                      <span className="text-xs text-slate-400">dex</span>
                    </div>
                    <div className="text-[9.5px] text-slate-500 mt-0.5">Heavy Element Ratio</div>
                  </div>

                  {/* ID / Seed */}
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 relative group">
                    <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
                      <span>Seed ID</span>
                      <button
                        onClick={() => handleCopyId(selectedSystem.id)}
                        className="text-slate-400 hover:text-white transition"
                        title="Copy deterministic seed ID"
                      >
                        {copiedId ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <div className="text-xs font-bold text-fuchsia-300 mt-0.5 truncate" title={selectedSystem.id}>
                      {selectedSystem.id}
                    </div>
                    <div className="text-[9.5px] text-slate-500 mt-0.5">Deterministic Seed</div>
                  </div>
                </div>

                {/* Primary Action Button: Launch into StarGen Lab */}
                <button
                  onClick={() => handleLaunchSystemGenerator(selectedSystem)}
                  className="w-full mt-3 py-2.5 px-3 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 border border-emerald-400/40 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Atom className="w-4 h-4 animate-spin-slow" />
                  <span>Launch StarGen Lab with this System &rarr;</span>
                </button>
              </div>

              {/* Astrophysical Telemetry Summary */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono space-y-2">
                <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>System Architecture &amp; Telemetry</span>
                  <span className="text-cyan-400 font-semibold">{selectedSystem.archName}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Primary Star (A)</span>
                  <span className="text-slate-200 font-semibold">
                    {selectedSystem.primaryClass} ({selectedSystem.primaryMass.toFixed(3)} M☉)
                  </span>
                </div>

                {selectedSystem.companionStars.length > 0 && (
                  <div className="flex items-start justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Companions</span>
                    <div className="text-right text-slate-300 font-medium space-y-0.5">
                      {selectedSystem.companionStars.map((cs) => (
                        <div key={cs.label}>
                          {cs.label}: {cs.spectralType} ({cs.mass.toFixed(3)} M☉)
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Generated Bodies</span>
                  <span className="text-slate-200 font-semibold">
                    {selectedSystem.planetCount} Planets &bull; {selectedSystem.beltCount} Belts
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Effective Temp (Teff)</span>
                  <span className="text-slate-200 font-semibold">{Math.round(selectedSystem.teff)} K</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Luminosity (L/L☉)</span>
                  <span className="text-slate-200 font-semibold">{selectedSystem.lumLsun} L☉</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Evolutionary State</span>
                  <span className={selectedSystem.isRemnant ? 'text-fuchsia-400 font-bold' : 'text-cyan-400 font-semibold'}>
                    {selectedSystem.isRemnant ? selectedSystem.remnantType || 'Remnant' : 'Main Sequence'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-400">Habitable Zone Candidate</span>
                  <span className={selectedSystem.candidateHabitable ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                    {selectedSystem.candidateHabitable ? 'Yes (Candidate Planet Present)' : 'None'}
                  </span>
                </div>
              </div>

              {/* Sector Context & Grid Stats */}
              <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 text-xs font-mono space-y-2">
                <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                  Sector Distribution
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/50">
                    <span className="text-slate-500">O/B Stars:</span>{' '}
                    <span className="text-blue-400 font-bold">{gridData.stats.obCount}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/50">
                    <span className="text-slate-500">A/F Stars:</span>{' '}
                    <span className="text-cyan-300 font-bold">{gridData.stats.afCount}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/50">
                    <span className="text-slate-500">G Solar:</span>{' '}
                    <span className="text-amber-300 font-bold">{gridData.stats.gCount}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/50">
                    <span className="text-slate-500">K/M Dwarfs:</span>{' '}
                    <span className="text-red-400 font-bold">{gridData.stats.kmCount}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/50">
                    <span className="text-slate-500">Remnants (WD/NS/BH):</span>{' '}
                    <span className="text-purple-400 font-bold">{gridData.stats.remnantCount}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/50">
                    <span className="text-slate-500">Multi-Stars:</span>{' '}
                    <span className="text-indigo-300 font-bold">{gridData.stats.multipleSystemCount}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/50 col-span-2">
                    <span className="text-slate-500">Heavy Stars (&ge;3 M☉):</span>{' '}
                    <span className="text-amber-300 font-bold">{gridData.stats.heavyMassCount}</span>
                  </div>
                </div>
              </div>

              {/* Instructions Tip */}
              <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-800/40 text-[10.5px] text-cyan-300/80 font-mono leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <span>
                  Double-click any system hex to launch StarGen Lab instantly. The ID{' '}
                  <span className="text-cyan-200 font-bold">{selectedSystem.id}</span> functions as
                  a 100% reproducible seed.
                </span>
              </div>
            </div>
          ) : (
            <div className="p-6 h-full flex flex-col items-center justify-center text-center text-slate-500 font-mono text-xs gap-3">
              <Hexagon className="w-10 h-10 text-slate-700 animate-pulse" />
              <p>Select any hex with a star system to inspect its astrophysics parameters and launch StarGen Lab.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
