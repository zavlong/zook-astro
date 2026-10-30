import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  Compass,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Check,
  Image as ImageIcon,
  Hexagon,
  Tag,
  Layers,
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
import { SectorExportImportModal } from '../sector/SectorExportImportModal';
import { SectorHexGridData } from '../../core/generation/sectorHex';
import { loadEmpiresForSector, saveEmpiresForSector } from '../../core/generation/empireGen';
import { ParsedSectorImportResult } from '../../core/export/sectorFormatExporters';
import { universeCache, SavedGalaxy } from '../../core/storage/universeCache';
import { GenerationLoadingOverlay, yieldToMainThread } from '../ui/GenerationLoadingOverlay';
import { GalaxyTopToolbar } from './panels/GalaxyTopToolbar';
import { GalaxySectorInspector } from './panels/GalaxySectorInspector';
import { GalaxyParametersModal } from './modals/GalaxyParametersModal';

interface GalaxyGenAppProps {
  onSelectSector: (sector: GalaxySectorHex) => void;
  onGoHome?: () => void;
  initialConfig?: Partial<GalaxyConfig>;
  initialSelectedCoord?: string | null;
  returnTransition?: boolean;
  showUI?: boolean;
}

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
  const [saveBanner, setSaveBanner] = useState<string | null>(null);
  const [saveCatalogVersion, setSaveCatalogVersion] = useState<number>(0);

  // Individual Sector Export / Import Modal state
  const [showSectorExportModal, setShowSectorExportModal] = useState<boolean>(false);
  const [exportSectorGridData, setExportSectorGridData] = useState<SectorHexGridData | null>(null);

  // Image Quantizer & Backdrop state
  const [showImageModal, setShowImageModal] = useState<boolean>(false);
  const [customGalaxyData, setCustomGalaxyData] = useState<GalaxyGridData | null>(null);
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [bgImageOpacity, setBgImageOpacity] = useState<number>(0.75); // Opacity of imported photo or procedural blur
  const [sectorOpacity, setSectorOpacity] = useState<number>(0.85); // 0.0 to 1.0 (hex fill opacity multiplier)

  // Search input
  const [searchCoord, setSearchCoord] = useState<string>('');

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

  // Pre-index sectors by coordinate for O(1) lookup during hover, wheel zoom, and search
  const sectorByCoordMap = useMemo(() => {
    const map = new Map<string, GalaxySectorHex>();
    for (const s of galaxyData.sectors) {
      map.set(s.coord, s);
    }
    return map;
  }, [galaxyData.sectors]);

  // Precompute cached sector coordinates Set so we don't query universeCache 2,500 times per render frame
  const cachedSectorCoords = useMemo(() => {
    const set = new Set<string>();
    for (const s of galaxyData.sectors) {
      if (universeCache.isSectorCached(s.seed, s.coord)) {
        set.add(s.coord);
      }
    }
    return set;
  }, [galaxyData.sectors, saveCatalogVersion]);

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
      const match = sectorByCoordMap.get(initialSelectedCoord);
      if (match) return match;
    }
    // Default to central core or first active sector
    const coreSector = sectorByCoordMap.get('2525');
    return coreSector || galaxyData.sectors[0] || null;
  });

  // Keep selected sector valid on regeneration
  useEffect(() => {
    if (selectedSector) {
      const match = sectorByCoordMap.get(selectedSector.coord);
      if (match) {
        setSelectedSector(match);
        return;
      }
    }
    const core = sectorByCoordMap.get('2525');
    setSelectedSector(core || galaxyData.sectors[0] || null);
  }, [galaxyData, sectorByCoordMap]);

  // Custom Sector Names map (persisted in localStorage by galaxy seed)
  const [customSectorNames, setCustomSectorNames] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(`zook_sector_names_${config.seed}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(`zook_sector_names_${config.seed}`);
      setCustomSectorNames(raw ? JSON.parse(raw) : {});
    } catch {
      setCustomSectorNames({});
    }
  }, [config.seed]);

  const [isEditingSectorName, setIsEditingSectorName] = useState<boolean>(false);
  const [sectorNameDraft, setSectorNameDraft] = useState<string>('');

  useEffect(() => {
    if (selectedSector) {
      setSectorNameDraft(customSectorNames[selectedSector.coord] || selectedSector.name);
      setIsEditingSectorName(false);
    }
  }, [selectedSector?.coord, customSectorNames]);

  const handleSaveSectorName = () => {
    if (!selectedSector) return;
    const trimmed = sectorNameDraft.trim();
    const finalName = trimmed || selectedSector.name;
    const updated = { ...customSectorNames, [selectedSector.coord]: finalName };
    setCustomSectorNames(updated);
    try {
      localStorage.setItem(`zook_sector_names_${config.seed}`, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save custom sector name:', e);
    }
    setIsEditingSectorName(false);
  };

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

  // Pan & Zoom state combined atomically
  const [{ zoom, pan }, setCamera] = useState<{ zoom: number; pan: { x: number; y: number } }>({
    zoom: 0.48,
    pan: { x: 0, y: 0 },
  });

  const setZoom = useCallback((updater: number | ((prevZoom: number) => number)) => {
    setCamera((prev) => ({
      ...prev,
      zoom: typeof updater === 'function' ? updater(prev.zoom) : updater,
    }));
  }, []);

  const setPan = useCallback(
    (updater: { x: number; y: number } | ((prevPan: { x: number; y: number }) => { x: number; y: number })) => {
      setCamera((prev) => ({
        ...prev,
        pan: typeof updater === 'function' ? updater(prev.pan) : updater,
      }));
    },
    []
  );

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
      const match = sectorByCoordMap.get(initialSelectedCoord);
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
  }, [returnTransition, initialSelectedCoord, sectorByCoordMap, getHexCenter, handleFitGalaxy]);

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
            const coordKey = `${String(c).padStart(2, '0')}${String(r).padStart(2, '0')}`;
            const match = sectorByCoordMap.get(coordKey);
            if (match) closest = match;
          }
        }
      }
      return closest;
    },
    [config.rows, config.columns, hexRadius, rowSpacing, hexWidth, colSpacing, getHexCenter, sectorByCoordMap]
  );

  // Cinematic transition into 50x50 Sector Map
  const handleTriggerEnterSector = useCallback(
    (sector: GalaxySectorHex) => {
      if (isEnteringSector) return;

      const customName = customSectorNames[sector.coord] || sector.name;
      const sectorPayload = { ...sector, name: customName };

      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (prefersReducedMotion) {
        onSelectSector(sectorPayload);
        return;
      }

      setIsEnteringSector(true);
      setTransitionSector(sectorPayload);
      setSelectedSector(sectorPayload);

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
        onSelectSector(sectorPayload);
      }, 450);
    },
    [isEnteringSector, getHexCenter, onSelectSector, customSectorNames]
  );

  // Save current galaxy with all seeds, explored sectors, and generated star systems
  const handleSaveCurrentGalaxy = useCallback(() => {
    const secCount = universeCache.getLoadedSectorCount();
    const sysCount = universeCache.getLoadedSystemCount();
    const finalName = config.name || `Galaxy Seed #${config.seed}`;
    const saved = universeCache.saveCurrentUniverse(
      { ...config, name: finalName },
      finalName,
      `Saved with ${secCount} cached sectors and ${sysCount} star systems.`,
      galaxyData.stats
    );
    setSaveCatalogVersion((v) => v + 1);
    setSaveBanner(
      `💾 Saved "${saved.name}" (Seed #${saved.seed}) with ${secCount} cached sectors & ${sysCount} systems!`
    );
    setTimeout(() => setSaveBanner(null), 4500);
  }, [config, galaxyData]);

  // Keyboard navigation & Shortcuts: Page Down (Sector), Page Up, Ctrl+S / Cmd+S (Save Galaxy)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isSave = (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S');
      const isNav = e.key === 'PageDown' || e.code === 'PageDown' || e.key === 'PageUp' || e.code === 'PageUp';

      if (!isSave && !isNav) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (isSave) {
        e.preventDefault();
        e.stopPropagation();
        handleSaveCurrentGalaxy();
        return;
      }

      if (showConfigModal || showSavedGalaxiesModal || showImageModal) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'PageDown' || e.code === 'PageDown') {
        const candidate =
          hoveredSector ||
          selectedSector ||
          galaxyData.sectors.find((s) => s.col === 25 && s.row === 25) ||
          galaxyData.sectors[0];

        if (candidate) {
          handleTriggerEnterSector(candidate);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showConfigModal,
    showSavedGalaxiesModal,
    showImageModal,
    hoveredSector,
    selectedSector,
    galaxyData.sectors,
    handleTriggerEnterSector,
    handleSaveCurrentGalaxy,
  ]);

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
      setCamera((prev) => {
        const newZoom = Math.max(0.08, Math.min(2.5, prev.zoom * factor));
        if (newZoom === prev.zoom) return prev;

        const worldX = (screenX - prev.pan.x) / prev.zoom;
        const worldY = (screenY - prev.pan.y) / prev.zoom;
        return {
          zoom: newZoom,
          pan: {
            x: screenX - worldX * newZoom,
            y: screenY - worldY * newZoom,
          },
        };
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

  // Loading overlay state when generating/rerolling galaxy
  const [isGeneratingGalaxy, setIsGeneratingGalaxy] = useState<boolean>(false);

  // Roll new galaxy
  const handleRollGalaxy = async () => {
    setIsGeneratingGalaxy(true);
    await yieldToMainThread();
    setCustomGalaxyData(null);
    setBgImageUrl(null);
    universeCache.clearSectorCache();
    universeCache.clearSystemCache();
    const newSeed = Math.floor(Math.random() * 90000) + 1000;
    setConfig((prev) => ({
      ...prev,
      seed: newSeed,
    }));
    await yieldToMainThread();
    setIsGeneratingGalaxy(false);
  };

  // Switch morphology
  const handleMorphologyChange = async (morph: GalaxyMorphology) => {
    setIsGeneratingGalaxy(true);
    await yieldToMainThread();
    setCustomGalaxyData(null);
    setBgImageUrl(null);
    universeCache.clearSectorCache();
    universeCache.clearSystemCache();
    setConfig((prev) => ({
      ...prev,
      morphology: morph,
    }));
    await yieldToMainThread();
    setIsGeneratingGalaxy(false);
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

  // Load saved galaxy from catalog and rehydrate cached sectors & systems
  const handleLoadSavedGalaxy = (saved: SavedGalaxy) => {
    universeCache.loadGalaxy(saved);
    setConfig(saved.config);
    setCustomGalaxyData(null);
    setBgImageUrl(null);
    setShowSavedGalaxiesModal(false);
    const secCount =
      saved.cachedSectorCount ??
      (saved.cachedSectors ? Object.keys(saved.cachedSectors).length : 0);
    const sysCount =
      saved.cachedSystemCount ??
      (saved.cachedSystems ? Object.keys(saved.cachedSystems).length : 0);
    setSaveBanner(
      `Loaded "${saved.name}" (Seed #${saved.seed}) with ${secCount} cached sectors & ${sysCount} systems.`
    );
    setTimeout(() => setSaveBanner(null), 4000);
  };

  // Apply custom sliders
  const handleApplySliders = async () => {
    setShowConfigModal(false);
    setIsGeneratingGalaxy(true);
    await yieldToMainThread();
    if (draftConfig.seed !== config.seed || draftConfig.morphology !== config.morphology) {
      universeCache.clearSectorCache();
      universeCache.clearSystemCache();
    }
    setConfig({ ...draftConfig });
    await yieldToMainThread();
    setIsGeneratingGalaxy(false);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#030611] text-slate-100 overflow-hidden font-sans select-none relative">
      {isGeneratingGalaxy && (
        <GenerationLoadingOverlay
          title={`Synthesizing ${config.name || `Galaxy Seed #${config.seed}`}`}
          subtitle={`${config.columns}×${config.rows} Sector Grid (2,500 Sectors) • ${config.morphology.toUpperCase()} Morphology`}
          detail="Computing galactic spiral density waves, radial metallicity gradients, and H-II star-forming nebulae..."
          accentColor="#818cf8"
        />
      )}
      {/* Toast Save Confirmation Notification */}
      {saveBanner && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-950/95 border border-emerald-500/80 text-emerald-200 text-xs font-mono font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-200 backdrop-blur-md">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{saveBanner}</span>
        </div>
      )}

      {/* ============================================================================ */}
      {/* TOP COMMAND BAR                                                              */}
      {/* ============================================================================ */}
      <GalaxyTopToolbar
        showUI={showUI}
        onGoHome={onGoHome}
        config={config}
        galaxyData={galaxyData}
        customGalaxyData={customGalaxyData}
        searchCoord={searchCoord}
        setSearchCoord={setSearchCoord}
        handleSearchSubmit={handleSearchSubmit}
        handleMorphologyChange={handleMorphologyChange}
        handleSaveCurrentGalaxy={handleSaveCurrentGalaxy}
        setShowSavedGalaxiesModal={setShowSavedGalaxiesModal}
        setShowImageModal={setShowImageModal}
        handleResetToProcedural={handleResetToProcedural}
        setShowConfigModal={setShowConfigModal}
        handleRollGalaxy={handleRollGalaxy}
      />

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

              {/* Hardware-Accelerated Radial Gradients for Purple-Red Emission Nebula Gas Clouds (Zero SVG Filter Overhead) */}
              <radialGradient id="galaxyNebulaGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.88" />
                <stop offset="35%" stopColor="#e11d48" stopOpacity="0.70" />
                <stop offset="70%" stopColor="#c026d3" stopOpacity="0.40" />
                <stop offset="100%" stopColor="#9333ea" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="galaxyNebulaLobeA" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fb7185" stopOpacity="0.80" />
                <stop offset="55%" stopColor="#e11d48" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#e11d48" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="galaxyNebulaLobeB" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#e879f9" stopOpacity="0.75" />
                <stop offset="55%" stopColor="#c026d3" stopOpacity="0.42" />
                <stop offset="100%" stopColor="#9333ea" stopOpacity="0" />
              </radialGradient>
            </defs>

            <g
              transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
              style={{
                transformOrigin: '0 0',
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

                    {/* Explored / Cached Sector Highlight Indicator */}
                    {cachedSectorCoords.has(sector.coord) && (
                      <g className="pointer-events-none">
                        <polygon
                          points={hexPoints}
                          fill="rgba(16, 185, 129, 0.12)"
                          stroke="#10b981"
                          strokeWidth={isSelected ? 1.8 : 1.2}
                          strokeOpacity={0.9}
                          strokeDasharray={isSelected ? undefined : "3,2"}
                        />
                        <circle
                          cx={0}
                          cy={-hexRadius * 0.70}
                          r={Math.max(2.0, hexRadius * 0.14)}
                          fill="#10b981"
                          stroke="#022c22"
                          strokeWidth={0.6}
                          className="animate-pulse"
                        />
                      </g>
                    )}

                    {/* Active Emission Nebula (Filter-Free Radial Gradients for 60fps Pan/Zoom) */}
                    {sector.hasNebula && (
                      <g className="pointer-events-none" style={{ mixBlendMode: 'screen' }}>
                        <circle
                          r={hexRadius * 1.12}
                          fill="url(#galaxyNebulaGlow)"
                          opacity={0.85}
                        />
                        <ellipse
                          rx={hexRadius * 0.92}
                          ry={hexRadius * 0.56}
                          fill="url(#galaxyNebulaLobeA)"
                          transform={`rotate(${sector.seed % 180}, 0, 0)`}
                        />
                        <ellipse
                          rx={hexRadius * 0.80}
                          ry={hexRadius * 0.48}
                          fill="url(#galaxyNebulaLobeB)"
                          transform={`rotate(${(sector.seed * 3) % 180}, 0, 0)`}
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

            {/* Cached Sectors Indicator */}
            {universeCache.getLoadedSectorCount() > 0 && (
              <>
                <div className="h-4 w-px bg-slate-800 mx-1" />
                <div className="flex items-center gap-1 px-1.5 py-0.5 text-emerald-300 text-[10px] font-mono bg-emerald-950/50 rounded border border-emerald-800/60" title={`${universeCache.getLoadedSectorCount()} sectors explored and persisted in universe cache`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{universeCache.getLoadedSectorCount()} Cached</span>
                </div>
              </>
            )}

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

        </div>

        {/* ============================================================================ */}
        {/* RIGHT SECTOR INSPECTOR PANEL                                                 */}
        {/* ============================================================================ */}
        <GalaxySectorInspector
          showUI={showUI}
          selectedSector={selectedSector}
          customSectorNames={customSectorNames}
          isEditingSectorName={isEditingSectorName}
          setIsEditingSectorName={setIsEditingSectorName}
          sectorNameDraft={sectorNameDraft}
          setSectorNameDraft={setSectorNameDraft}
          handleSaveSectorName={handleSaveSectorName}
          handleTriggerEnterSector={handleTriggerEnterSector}
          setExportSectorGridData={setExportSectorGridData}
          setShowSectorExportModal={setShowSectorExportModal}
        />
      </div>

      {/* ============================================================================ */}
      {/* ADVANCED GALAXY CUSTOMIZATION MODAL                                          */}
      {/* ============================================================================ */}
      <GalaxyParametersModal
        showConfigModal={showConfigModal}
        setShowConfigModal={setShowConfigModal}
        draftConfig={draftConfig}
        setDraftConfig={setDraftConfig}
        handleApplySliders={handleApplySliders}
      />

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
          key={saveCatalogVersion}
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

      {/* Individual Sector Export / Import Modal */}
      {showSectorExportModal && exportSectorGridData && (() => {
        const loadedEmp = loadEmpiresForSector(
          exportSectorGridData.config.seed,
          exportSectorGridData.config.columns,
          exportSectorGridData.config.rows
        );
        return (
          <SectorExportImportModal
            isOpen={showSectorExportModal}
            onClose={() => setShowSectorExportModal(false)}
            gridData={exportSectorGridData}
            empires={loadedEmp.empires}
            activeEmpireId={loadedEmp.activeEmpireId}
            onImportSector={(imported: ParsedSectorImportResult) => {
              const targetCoord = selectedSector?.coord || imported.config.coord;
              const targetSeed = selectedSector?.seed || imported.config.seed;
              const finalConfig = {
                ...imported.config,
                coord: targetCoord,
                seed: targetSeed,
              };
              const finalGrid: SectorHexGridData = {
                ...imported.gridData,
                config: finalConfig,
              };
              const secKey = universeCache.getSectorCacheKey(targetSeed, targetCoord);
              universeCache.cacheLoadedSector(secKey, finalGrid);
              finalGrid.systems.forEach((s) => {
                if (s.sysResult) universeCache.cacheLoadedSystem(s.id, s.sysResult);
              });
              if (imported.empires) {
                saveEmpiresForSector(
                  targetSeed,
                  imported.empires,
                  imported.activeEmpireId ?? null,
                  finalConfig.columns,
                  finalConfig.rows
                );
              }
              setExportSectorGridData(finalGrid);
              setSaveBanner(
                `Imported Sector "${finalConfig.name}" (${finalGrid.systems.length} systems, ${finalGrid.hyperlanes.length} hyperlanes) into Sector ${targetCoord || targetSeed}!`
              );
              setTimeout(() => setSaveBanner(null), 4000);
            }}
          />
        );
      })()}
    </div>
  );
};
