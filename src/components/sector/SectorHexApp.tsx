import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  Sparkles,
  X,
  Crown,
  Compass,
  Trash2,
  Download,
  Upload,
} from 'lucide-react';
import {
  SectorHexConfig,
  SectorHexGridData,
  SectorHexSystem,
  DEFAULT_SECTOR_CONFIG,
  generateSectorHexGrid,
  isBlackHoleStar,
  isSupermassiveBlackHole,
  checkSystemMatchesFilters,
  computeSystemFilterTraits,
  type SectorFilterCategory,
  type MassFilterBracket,
  generateProceduralHyperlanes,
  formatHexCoord,
  recomputeSectorStats,
  recomputeSectorIntegratedColor,
  deriveSectorSystemPropsFromSysResult,
} from '../../core/generation/sectorHex';
import { runRealisticGenerator, RealisticStarSystemResult } from '../../core/generation/realisticStarGen';
import { SystemEditorModal } from './SystemEditorModal';
import {
  getProceduralStarSpriteDataUrl,
  getStarAssetPath,
  type StarAssetDescriptor,
} from '../../core/generation/starAssets';
import { GenerationLoadingOverlay, yieldToMainThread } from '../ui/GenerationLoadingOverlay';
import {
  SectorEmpire,
  loadEmpiresForSector,
  saveEmpiresForSector,
  loadLastSectorConfig,
  saveLastSectorConfig,
  downloadEmpiresJSON,
  importEmpiresFromJSON,
} from '../../core/generation/empireGen';
import { SpawnEmpireModal } from './SpawnEmpireModal';
import { SectorExportImportModal } from './SectorExportImportModal';
import { ParsedSectorImportResult } from '../../core/export/sectorFormatExporters';
import { StarGenParams } from '../../core/generation/realisticStarGen';
import { universeCache } from '../../core/storage/universeCache';
import {
  SectorTopToolbar,
  SECTOR_PRESETS,
  type SectorPresetKey,
  type SectorPreset,
} from './panels/SectorTopToolbar';
import { SectorParametersModal } from './modals/SectorParametersModal';
import { SectorFilterOverlayBar } from './panels/SectorFilterOverlayBar';
import {
  SectorSystemInspector,
  getBiosphereDisplay,
} from './panels/SectorSystemInspector';

interface SectorHexAppProps {
  onLaunchStarGen: (params: StarGenParams, coord?: string) => void;
  onBackToGalaxy?: () => void;
  initialConfig?: Partial<SectorHexConfig> | null;
  initialSelectedCoord?: string | null;
  returnTransition?: boolean;
  showUI?: boolean;
}

export type { SectorFilterCategory, MassFilterBracket };

export const SectorHexApp: React.FC<SectorHexAppProps> = ({
  onLaunchStarGen,
  onBackToGalaxy,
  initialConfig,
  initialSelectedCoord,
  returnTransition,
  showUI = false,
}) => {
  // Sector Configuration state initialized with initialConfig if provided, or last saved sector
  const [config, setConfig] = useState<SectorHexConfig>(() => {
    if (initialConfig && Object.keys(initialConfig).length > 0) {
      return {
        ...DEFAULT_SECTOR_CONFIG,
        ...initialConfig,
      };
    }
    const saved = loadLastSectorConfig();
    if (saved && typeof saved === 'object' && saved.seed) {
      return {
        ...DEFAULT_SECTOR_CONFIG,
        ...saved,
      };
    }
    return DEFAULT_SECTOR_CONFIG;
  });

  // Re-sync if initialConfig updates
  useEffect(() => {
    if (initialConfig) {
      setConfig((prev) => ({
        ...prev,
        ...initialConfig,
      }));
    }
  }, [initialConfig]);

  // Persist current sector config to localStorage
  useEffect(() => {
    saveLastSectorConfig(config);
  }, [config]);

  const [activePreset, setActivePreset] = useState<SectorPresetKey>('disk');
  const [searchCoord, setSearchCoord] = useState<string>('');
  const [activeFilterCats, setActiveFilterCats] = useState<Set<SectorFilterCategory>>(new Set());
  const [massBracket, setMassBracket] = useState<MassFilterBracket>('all');
  const [customMinMass, setCustomMinMass] = useState<string>('0.1');
  const [customMaxMass, setCustomMaxMass] = useState<string>('50.0');
  const [showMassMenu, setShowMassMenu] = useState<boolean>(false);

  const hasActiveFilters = activeFilterCats.size > 0 || massBracket !== 'all';

  const toggleFilterCat = useCallback((id: SectorFilterCategory) => {
    if (id === 'all') {
      setActiveFilterCats(new Set());
      setMassBracket('all');
      return;
    }
    setActiveFilterCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Custom Grid & Density Modal/Drawer state
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [draftCols, setDraftCols] = useState<number>(config.columns);
  const [draftRows, setDraftRows] = useState<number>(config.rows);
  const [draftDensity, setDraftDensity] = useState<number>(config.density);
  const [draftAge, setDraftAge] = useState<number>(config.meanAge);
  const [draftAgeRange, setDraftAgeRange] = useState<number>(config.ageRange ?? 3.5);
  const [draftAgeDistribution, setDraftAgeDistribution] = useState<'normal' | 'uniform'>(
    config.ageDistribution ?? 'normal'
  );
  const [draftFeh, setDraftFeh] = useState<number>(config.metallicityMean);
  const [draftSeed, setDraftSeed] = useState<number>(config.seed);
  const [draftHasNebula, setDraftHasNebula] = useState<boolean>(config.hasNebula ?? false);

  // Sync draft inputs when config changes
  useEffect(() => {
    setDraftCols(config.columns);
    setDraftRows(config.rows);
    setDraftDensity(config.density);
    setDraftAge(config.meanAge);
    setDraftAgeRange(config.ageRange ?? 3.5);
    setDraftAgeDistribution(config.ageDistribution ?? 'normal');
    setDraftFeh(config.metallicityMean);
    setDraftSeed(config.seed);
    setDraftHasNebula(config.hasNebula ?? false);
  }, [
    config.columns,
    config.rows,
    config.density,
    config.meanAge,
    config.ageRange,
    config.ageDistribution,
    config.metallicityMean,
    config.seed,
    config.hasNebula,
  ]);

  // Sector persistent cache key
  const sectorCacheKey = useMemo(() => {
    return universeCache.getSectorCacheKey(config.seed, config.coord);
  }, [config.seed, config.coord]);

  // Sector cache status state
  const [isFromCache, setIsFromCache] = useState<boolean>(() => {
    return universeCache.hasCachedSector(universeCache.getSectorCacheKey(config.seed, config.coord));
  });

  // Loading overlay state for uncached sector synthesis
  const [isGeneratingSector, setIsGeneratingSector] = useState<boolean>(() => {
    return !universeCache.hasCachedSector(universeCache.getSectorCacheKey(config.seed, config.coord));
  });

  // Generated Grid Data (initialized from cache if available, or lightweight placeholder until async synthesis completes)
  const [gridData, setGridData] = useState<SectorHexGridData>(() => {
    const key = universeCache.getSectorCacheKey(config.seed, config.coord);
    const cached = universeCache.getCachedSector(key);
    if (cached) return cached;
    return {
      config,
      cells: [],
      systems: [],
      hyperlanes: [],
      nebula: null,
      sectorWidth: 2400,
      sectorHeight: 2400,
      parsecWidth: 50,
      parsecHeight: 50,
      hexCenterX: 1200,
      hexCenterY: 1200,
      hexRadius: 1120,
      hexPoints: '1200,80 2170,640 2170,1760 1200,2320 230,1760 230,640',
      hexInnerPoints: '1200,115 2139,658 2139,1742 1200,2285 261,1742 261,658',
      hexVertices: [],
      integratedColorHex: '#38bdf8',
      hasNebula: Boolean(config.hasNebula),
      stats: {
        totalHexes: config.columns * config.rows,
        occupiedHexes: 0,
        occupancyPct: 0,
        totalStars: 0,
        hyperlaneCount: 0,
        obCount: 0,
        afCount: 0,
        gCount: 0,
        kmCount: 0,
        remnantCount: 0,
        multipleSystemCount: 0,
        heavyMassCount: 0,
        giantCount: 0,
        habitableCount: 0,
        nonMsCount: 0,
      },
    };
  });

  // Asynchronous sector synthesis with main-thread yield so the loading screen paints smoothly
  useEffect(() => {
    const cached = universeCache.getCachedSector(sectorCacheKey);
    if (cached) {
      setIsFromCache(true);
      setGridData(cached);
      setIsGeneratingSector(false);
      return;
    }

    let cancelled = false;
    setIsGeneratingSector(true);

    (async () => {
      await yieldToMainThread();
      if (cancelled) return;
      const fresh = generateSectorHexGrid(config);
      universeCache.cacheLoadedSector(sectorCacheKey, fresh);
      if (!cancelled) {
        setIsFromCache(false);
        setGridData(fresh);
        setIsGeneratingSector(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config, sectorCacheKey]);

  // Selected Hex System and Selected Coordinate
  const [selectedCoord, setSelectedCoord] = useState<string | null>(() => {
    return gridData.systems[0]?.coord || null;
  });
  const [selectedSystem, setSelectedSystem] = useState<SectorHexSystem | null>(() => {
    return gridData.systems[0] || null;
  });

  // Keep selection synchronized when config regenerates
  useEffect(() => {
    if (gridData.systems.length > 0) {
      if (selectedSystem) {
        const stillPresent = gridData.systems.find((s) => s.coord === selectedSystem.coord);
        setSelectedSystem(stillPresent || gridData.systems[0]);
        setSelectedCoord(stillPresent ? stillPresent.coord : gridData.systems[0]?.coord || null);
      } else {
        setSelectedSystem(gridData.systems[0]);
        setSelectedCoord(gridData.systems[0]?.coord || null);
      }
    } else {
      setSelectedSystem(null);
      setSelectedCoord(null);
    }
  }, [gridData]);

  // Pre-indexed O(1) lookup table for planetary filter flags & biosphere summary per system (single pass!)
  const systemTraitsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        hasWater: boolean;
        hasAmmonia: boolean;
        hasMulti: boolean;
        hasTerrestrial: boolean;
        isNonMs: boolean;
        biosphereDisplay: string;
      }
    >();
    for (const sys of gridData.systems) {
      const traits = computeSystemFilterTraits(sys);
      map.set(sys.id, {
        ...traits,
        biosphereDisplay: getBiosphereDisplay(sys),
      });
    }
    return map;
  }, [gridData.systems]);

  // Precompute cached system IDs Set for O(1) lookup in the SVG render loop
  const cachedSystemIds = useMemo(() => {
    const set = new Set<string>();
    for (const sys of gridData.systems) {
      if (universeCache.hasCachedSystem(sys.id)) {
        set.add(sys.id);
      }
    }
    return set;
  }, [gridData.systems]);

  // Dynamic filter matching count
  const matchingStarsCount = useMemo(() => {
    return gridData.systems.filter((system) => {
      const traits = systemTraitsMap.get(system.id);
      return checkSystemMatchesFilters(
        system,
        activeFilterCats,
        massBracket,
        customMinMass,
        customMaxMass,
        traits
      );
    }).length;
  }, [gridData.systems, systemTraitsMap, activeFilterCats, massBracket, customMinMass, customMaxMass]);

  const getMassFilterButtonLabel = () => {
    if (massBracket === 'low') return 'Mass: <0.8M☉';
    if (massBracket === 'solar') return 'Mass: 0.8-2M☉';
    if (massBracket === 'intermediate') return 'Mass: 2-8M☉';
    if (massBracket === 'massive') return 'Mass: >8M☉';
    if (massBracket === 'giant') return 'Mass: 10-50M☉';
    if (massBracket === 'supermassive') return 'Mass: >999k M☉';
    if (massBracket === 'custom') return `Mass: ${customMinMass || '0'}–${customMaxMass || '∞'}M☉`;
    return 'Mass ▾';
  };

  // Pan & Zoom Canvas Camera combined atomically
  const [{ zoom, pan }, setCamera] = useState<{ zoom: number; pan: { x: number; y: number } }>({
    zoom: 1.0,
    pan: { x: 40, y: 40 },
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

  // Hover state
  const [hoveredSystem, setHoveredSystem] = useState<SectorHexSystem | null>(null);

  // Hyperlanes & visibility toggles (default false for maximum performance)
  const [showHyperlanes, setShowHyperlanes] = useState<boolean>(false);
  const [showHexBoundaries, setShowHexBoundaries] = useState<boolean>(false);
  const [showLabels, setShowLabels] = useState<boolean>(false);
  const [showNebulae, setShowNebulae] = useState<boolean>(true);

  // Cached star systems count & sector tally
  const [cachedSystemCount, setCachedSystemCount] = useState<number>(() =>
    universeCache.getLoadedSystemCount()
  );

  useEffect(() => {
    const updateCacheCount = () => {
      setCachedSystemCount(universeCache.getLoadedSystemCount());
    };
    const t = setTimeout(updateCacheCount, 300);
    return () => clearTimeout(t);
  }, []);

  const sectorCachedCount = useMemo(() => {
    return gridData.systems.reduce(
      (acc, sys) => acc + (universeCache.hasCachedSystem(sys.id) ? 1 : 0),
      0
    );
  }, [gridData, cachedSystemCount]);

  // Total bounds of the sector space
  const gridBoundingSize = useMemo(() => {
    return {
      width: gridData.sectorWidth,
      height: gridData.sectorHeight,
    };
  }, [gridData.sectorWidth, gridData.sectorHeight]);

  // ============================================================================
  // ALIEN EMPIRE & TERRITORY MANAGEMENT STATE (PERSISTED IN LOCALSTORAGE)
  // ============================================================================
  const [empires, setEmpires] = useState<SectorEmpire[]>(() => {
    const loaded = loadEmpiresForSector(config.seed, config.columns, config.rows);
    return loaded.empires;
  });
  const [activeEmpireId, setActiveEmpireId] = useState<string | null>(() => {
    const loaded = loadEmpiresForSector(config.seed, config.columns, config.rows);
    return loaded.activeEmpireId;
  });
  const [isSpawnEmpireMode, setIsSpawnEmpireMode] = useState<boolean>(false);
  const [isEmpireModalOpen, setIsEmpireModalOpen] = useState<boolean>(false);
  const [empireTargetSystem, setEmpireTargetSystem] = useState<SectorHexSystem | null>(null);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  // Sector Editing & System Architect State
  const [isSectorEditMode, setIsSectorEditMode] = useState<boolean>(false);
  const [isSystemEditorOpen, setIsSystemEditorOpen] = useState<boolean>(false);
  const [systemToEdit, setSystemToEdit] = useState<SectorHexSystem | null>(null);
  const [isMovingSystem, setIsMovingSystem] = useState<boolean>(false);

  const importInputRef = useRef<HTMLInputElement>(null);

  // Synchronize empires from localStorage whenever sector seed or scale changes
  useEffect(() => {
    const loaded = loadEmpiresForSector(config.seed, config.columns, config.rows);
    setEmpires(loaded.empires);
    setActiveEmpireId(loaded.activeEmpireId);
  }, [config.seed, config.columns, config.rows]);

  // Persist empires to localStorage on every change
  useEffect(() => {
    saveEmpiresForSector(config.seed, empires, activeEmpireId, config.columns, config.rows);
  }, [empires, activeEmpireId, config.seed, config.columns, config.rows]);

  // Export empires JSON backup
  const handleExportEmpires = useCallback(() => {
    downloadEmpiresJSON(config.seed);
    setBannerNotice('💾 Downloaded alien empires backup JSON.');
  }, [config.seed]);

  // Import empires from JSON file
  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          const ok = importEmpiresFromJSON(content);
          if (ok) {
            const loaded = loadEmpiresForSector(config.seed, config.columns, config.rows);
            setEmpires(loaded.empires);
            setActiveEmpireId(loaded.activeEmpireId);
            setBannerNotice('✅ Successfully restored empires from backup file!');
          } else {
            setBannerNotice('❌ Invalid empires JSON backup file.');
          }
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [config.seed, config.columns, config.rows]
  );

  // Clear all empires in current sector
  const handleClearSectorEmpires = useCallback(() => {
    if (window.confirm(`Disband and remove all ${empires.length} empires in this sector?`)) {
      setEmpires([]);
      setActiveEmpireId(null);
      saveEmpiresForSector(config.seed, [], null, config.columns, config.rows);
      setBannerNotice('All empires in this sector disbanded.');
    }
  }, [empires.length, config.seed, config.columns, config.rows]);

  // Sector Export / Import Modal state & handler
  const [showSectorExportModal, setShowSectorExportModal] = useState<boolean>(false);

  const handleImportSector = useCallback((imported: ParsedSectorImportResult) => {
    const newKey = universeCache.getSectorCacheKey(imported.config.seed, imported.config.coord);
    universeCache.cacheLoadedSector(newKey, imported.gridData);
    imported.gridData.systems.forEach((s) => {
      if (s.sysResult) {
        universeCache.cacheLoadedSystem(s.id, s.sysResult);
      }
    });
    setConfig(imported.config);
    setGridData(imported.gridData);
    setIsFromCache(true);
    setIsGeneratingSector(false);
    if (imported.empires) {
      setEmpires(imported.empires);
      setActiveEmpireId(imported.activeEmpireId ?? (imported.empires[0]?.id || null));
      saveEmpiresForSector(
        imported.config.seed,
        imported.empires,
        imported.activeEmpireId ?? (imported.empires[0]?.id || null),
        imported.config.columns,
        imported.config.rows
      );
    }
    const firstSys = imported.gridData.systems[0] || null;
    setSelectedSystem(firstSys);
    setSelectedCoord(firstSys?.coord || null);
    setCachedSystemCount(universeCache.getLoadedSystemCount());
    setBannerNotice(
      `✅ Imported Sector "${imported.config.name}" (${imported.gridData.systems.length} systems, ${imported.gridData.hyperlanes.length} hyperlanes) [${
        imported.sourceFormat === 'stellaris-static-galaxy' ? 'Stellaris Static Galaxy' : 'Stargen Sector JSON'
      }]`
    );
  }, []);

  // Active empire lookup
  const activeEmpire = useMemo(() => {
    if (empires.length === 0) return null;
    return empires.find((e) => e.id === activeEmpireId) || empires[0];
  }, [empires, activeEmpireId]);

  // O(1) System ID -> Empire Lookup Map
  const empireMap = useMemo(() => {
    const map = new Map<string, SectorEmpire>();
    for (const emp of empires) {
      for (const sysId of emp.claimedSystemIds) {
        map.set(sysId, emp);
      }
    }
    return map;
  }, [empires]);

  // Auto-dismiss transient banner notices
  useEffect(() => {
    if (!bannerNotice || isSpawnEmpireMode) return;
    const timer = setTimeout(() => {
      setBannerNotice(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [bannerNotice, isSpawnEmpireMode]);

  // Launch spawn empire workflow
  const handleStartSpawnEmpire = useCallback(() => {
    if (selectedSystem && selectedSystem.candidateHabitable) {
      setEmpireTargetSystem(selectedSystem);
      setIsEmpireModalOpen(true);
      setIsSpawnEmpireMode(false);
      setBannerNotice(null);
    } else {
      setIsSpawnEmpireMode(true);
      setBannerNotice('👑 Click any system with a habitable world (marked 🟢) to establish an alien empire.');
    }
  }, [selectedSystem]);

  // Handle empire founded in modal
  const handleFoundEmpire = useCallback((newEmpire: SectorEmpire) => {
    setEmpires((prev) => {
      // Free the new homeworld from any existing claims
      const filtered = prev.map((emp) => ({
        ...emp,
        claimedSystemIds: emp.claimedSystemIds.filter((id) => id !== newEmpire.homeworldSystemId),
      }));
      return [...filtered, newEmpire];
    });
    setActiveEmpireId(newEmpire.id);
    setIsSpawnEmpireMode(false);
    setBannerNotice(`👑 Founded the ${newEmpire.name}! Hold Shift + Click other stars to expand territory.`);
  }, []);

  // Shift-click claim / unclaim toggle for a system
  const handleClaimToggle = useCallback(
    (system: SectorHexSystem) => {
      if (!activeEmpire) {
        setBannerNotice('⚠️ Spawn or select an active empire first to claim star systems.');
        return;
      }

      const currentOwner = empireMap.get(system.id);
      if (currentOwner && currentOwner.id === activeEmpire.id) {
        // System is already claimed by the active empire
        if (system.id === activeEmpire.homeworldSystemId) {
          setBannerNotice(`👑 Cannot unclaim ${activeEmpire.name}'s capital homeworld!`);
          return;
        }
        // Unclaim it
        setEmpires((prev) =>
          prev.map((emp) =>
            emp.id === activeEmpire.id
              ? { ...emp, claimedSystemIds: emp.claimedSystemIds.filter((id) => id !== system.id) }
              : emp
          )
        );
        setBannerNotice(`Unclaimed ${system.name} from ${activeEmpire.name}.`);
      } else {
        // Claim it for activeEmpire (removing from previous empire if claimed)
        setEmpires((prev) =>
          prev.map((emp) => {
            if (emp.id === activeEmpire.id) {
              return {
                ...emp,
                claimedSystemIds: Array.from(new Set([...emp.claimedSystemIds, system.id])),
              };
            } else {
              return {
                ...emp,
                claimedSystemIds: emp.claimedSystemIds.filter((id) => id !== system.id),
              };
            }
          })
        );
        setBannerNotice(`🪐 Claimed ${system.name} for ${activeEmpire.name}!`);
      }
    },
    [activeEmpire, empireMap]
  );

  // Delete / disband an empire
  const handleDeleteEmpire = useCallback((empId: string) => {
    setEmpires((prev) => prev.filter((e) => e.id !== empId));
    setActiveEmpireId((prev) => (prev === empId ? null : prev));
    setBannerNotice('Empire disbanded.');
  }, []);

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

  // Cinematic transition into Star System (Orrery)
  const [isEnteringSystem, setIsEnteringSystem] = useState<boolean>(false);
  const [transitionSystem, setTransitionSystem] = useState<SectorHexSystem | null>(null);
  const [isReturningFromSystem, setIsReturningFromSystem] = useState<boolean>(false);
  const systemTransitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (systemTransitionTimerRef.current) {
        clearTimeout(systemTransitionTimerRef.current);
      }
    };
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

  // Initial fit or system return animation on mount
  useEffect(() => {
    if (returnTransition && initialSelectedCoord) {
      const match = gridData.systems.find(
        (s) => s.coord === initialSelectedCoord || s.id === initialSelectedCoord
      );
      if (match && containerRef.current) {
        setSelectedSystem(match);
        setSelectedCoord(match.coord);
        const { clientWidth, clientHeight } = containerRef.current;
        setIsReturningFromSystem(true);
        const startZoom = 2.4;
        setZoom(startZoom);
        setPan({
          x: clientWidth / 2 - match.x * startZoom,
          y: clientHeight / 2 - match.y * startZoom,
        });

        const timer1 = setTimeout(() => {
          const finalZoom = 0.52;
          setZoom(finalZoom);
          setPan({
            x: clientWidth / 2 - match.x * finalZoom,
            y: clientHeight / 2 - match.y * finalZoom,
          });
        }, 40);

        const timer2 = setTimeout(() => {
          setIsReturningFromSystem(false);
        }, 500);

        return () => {
          clearTimeout(timer1);
          clearTimeout(timer2);
        };
      } else {
        handleFitToScreen();
      }
    } else {
      handleFitToScreen();
    }
  }, [returnTransition, initialSelectedCoord, gridData.systems, handleFitToScreen]);

  // Find star system nearest to SVG world coordinate
  const findSystemNearWorldPos = useCallback(
    (worldX: number, worldY: number): SectorHexSystem | null => {
      let closest: SectorHexSystem | null = null;
      let minDistSq = 140 * 140;
      for (const sys of gridData.systems) {
        const dSq = (worldX - sys.x) ** 2 + (worldY - sys.y) ** 2;
        if (dSq < minDistSq) {
          minDistSq = dSq;
          closest = sys;
        }
      }
      return closest;
    },
    [gridData.systems]
  );

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isEnteringSystem) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || isEnteringSystem) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  const handlePlaceNewSystem = useCallback(
    (col: number, row: number, mass?: number, name?: string) => {
      const padding = 60;
      const usableW = gridData.sectorWidth - padding * 2;
      const usableH = gridData.sectorHeight - padding * 2;
      const cellW = usableW / config.columns;
      const cellH = usableH / config.rows;
      const x = Math.round(padding + (col - 0.5) * cellW);
      const y = Math.round(padding + (row - 0.5) * cellH);
      const coord = formatHexCoord(col, row);

      const cellSeedNum = Math.floor(Math.random() * 8999) + 1000;
      const systemId = `SYS-${coord}-${cellSeedNum.toString(16).toUpperCase()}`;

      const sysResult = runRealisticGenerator({
        sysMass: mass || (config.density > 1.2 ? 1.5 : 1.0),
        age: config.meanAge,
        feh: config.metallicityMean,
        id: systemId,
        name: name || `System ${coord}`,
        forcedMult: 'auto',
      });

      const newSystem = deriveSectorSystemPropsFromSysResult(
        sysResult,
        col,
        row,
        x,
        y,
        config,
        gridData.sectorWidth,
        gridData.sectorHeight,
        gridData.parsecWidth,
        gridData.parsecHeight,
        systemId,
        name || `System ${coord}`
      );

      const newSystems = [...gridData.systems.filter((s) => s.coord !== coord), newSystem];
      const newHyperlanes = generateProceduralHyperlanes(newSystems, gridData.hexVertices);
      const newStats = recomputeSectorStats(newSystems, config, newHyperlanes.length);
      const newColor = recomputeSectorIntegratedColor(newSystems, config.density);

      const updatedGrid: SectorHexGridData = {
        ...gridData,
        systems: newSystems,
        hyperlanes: newHyperlanes,
        stats: newStats,
        integratedColorHex: newColor,
      };

      setGridData(updatedGrid);
      universeCache.cacheLoadedSystem(newSystem.id, sysResult);
      universeCache.cacheLoadedSector(sectorCacheKey, updatedGrid);

      setSelectedSystem(newSystem);
      setSelectedCoord(newSystem.coord);
      setBannerNotice(`✨ Placed new star system: ${newSystem.name} (${newSystem.coord})`);
    },
    [gridData, config, sectorCacheKey]
  );

  const handleDeleteSystem = useCallback(
    (sysToDelete: SectorHexSystem) => {
      const newSystems = gridData.systems.filter((s) => s.id !== sysToDelete.id);
      const newHyperlanes = generateProceduralHyperlanes(newSystems, gridData.hexVertices);
      const newStats = recomputeSectorStats(newSystems, config, newHyperlanes.length);
      const newColor = recomputeSectorIntegratedColor(newSystems, config.density);

      const updatedGrid: SectorHexGridData = {
        ...gridData,
        systems: newSystems,
        hyperlanes: newHyperlanes,
        stats: newStats,
        integratedColorHex: newColor,
      };

      setGridData(updatedGrid);
      universeCache.cacheLoadedSector(sectorCacheKey, updatedGrid);

      setSelectedSystem(newSystems[0] || null);
      setSelectedCoord(newSystems[0]?.coord || null);
      setIsMovingSystem(false);
      setBannerNotice(`🗑️ Deleted system ${sysToDelete.name} (${sysToDelete.coord})`);
    },
    [gridData, config, sectorCacheKey]
  );

  const handleMoveSystem = useCallback(
    (sysToMove: SectorHexSystem, targetCol: number, targetRow: number) => {
      const padding = 60;
      const usableW = gridData.sectorWidth - padding * 2;
      const usableH = gridData.sectorHeight - padding * 2;
      const cellW = usableW / config.columns;
      const cellH = usableH / config.rows;
      const newX = Math.round(padding + (targetCol - 0.5) * cellW);
      const newY = Math.round(padding + (targetRow - 0.5) * cellH);
      const newCoord = formatHexCoord(targetCol, targetRow);
      const newParsecX = +(((newX - padding) / usableW) * gridData.parsecWidth - gridData.parsecWidth / 2).toFixed(1);
      const newParsecY = +(((newY - padding) / usableH) * gridData.parsecHeight - gridData.parsecHeight / 2).toFixed(1);

      const movedSystem: SectorHexSystem = {
        ...sysToMove,
        col: targetCol,
        row: targetRow,
        coord: newCoord,
        x: newX,
        y: newY,
        parsecX: newParsecX,
        parsecY: newParsecY,
      };

      const newSystems = gridData.systems.map((s) => (s.id === sysToMove.id ? movedSystem : s));
      const newHyperlanes = generateProceduralHyperlanes(newSystems, gridData.hexVertices);
      const newStats = recomputeSectorStats(newSystems, config, newHyperlanes.length);

      const updatedGrid: SectorHexGridData = {
        ...gridData,
        systems: newSystems,
        hyperlanes: newHyperlanes,
        stats: newStats,
      };

      setGridData(updatedGrid);
      universeCache.cacheLoadedSector(sectorCacheKey, updatedGrid);

      setSelectedSystem(movedSystem);
      setSelectedCoord(movedSystem.coord);
      setIsMovingSystem(false);
      setBannerNotice(`↔️ Relocated ${movedSystem.name} to hex ${newCoord}`);
    },
    [gridData, config, sectorCacheKey]
  );

  const handleSaveEditedSystem = useCallback(
    (
      updatedSysResult: RealisticStarSystemResult,
      sectorUpdates?: {
        name?: string;
        coord?: string;
        age?: number;
        mass?: number;
        metallicity?: number;
      }
    ) => {
      if (!systemToEdit) return;

      let targetCol = systemToEdit.col;
      let targetRow = systemToEdit.row;
      let targetX = systemToEdit.x;
      let targetY = systemToEdit.y;

      if (sectorUpdates?.coord && sectorUpdates.coord !== systemToEdit.coord && sectorUpdates.coord.length === 4) {
        const c = parseInt(sectorUpdates.coord.slice(0, 2), 10);
        const r = parseInt(sectorUpdates.coord.slice(2, 4), 10);
        if (!isNaN(c) && !isNaN(r) && c >= 1 && c <= config.columns && r >= 1 && r <= config.rows) {
          targetCol = c;
          targetRow = r;
          const padding = 60;
          const usableW = gridData.sectorWidth - padding * 2;
          const usableH = gridData.sectorHeight - padding * 2;
          const cellW = usableW / config.columns;
          const cellH = usableH / config.rows;
          targetX = Math.round(padding + (targetCol - 0.5) * cellW);
          targetY = Math.round(padding + (targetRow - 0.5) * cellH);
        }
      }

      const updatedSystem = deriveSectorSystemPropsFromSysResult(
        updatedSysResult,
        targetCol,
        targetRow,
        targetX,
        targetY,
        config,
        gridData.sectorWidth,
        gridData.sectorHeight,
        gridData.parsecWidth,
        gridData.parsecHeight,
        systemToEdit.id,
        sectorUpdates?.name || systemToEdit.name
      );

      const newSystems = gridData.systems.map((s) => (s.id === systemToEdit.id ? updatedSystem : s));
      const newHyperlanes = generateProceduralHyperlanes(newSystems, gridData.hexVertices);
      const newStats = recomputeSectorStats(newSystems, config, newHyperlanes.length);
      const newColor = recomputeSectorIntegratedColor(newSystems, config.density);

      const updatedGrid: SectorHexGridData = {
        ...gridData,
        systems: newSystems,
        hyperlanes: newHyperlanes,
        stats: newStats,
        integratedColorHex: newColor,
      };

      setGridData(updatedGrid);
      universeCache.cacheLoadedSystem(updatedSystem.id, updatedSysResult);
      universeCache.cacheLoadedSector(sectorCacheKey, updatedGrid);

      setSelectedSystem(updatedSystem);
      setSelectedCoord(updatedSystem.coord);
      setSystemToEdit(null);
      setIsSystemEditorOpen(false);
      setBannerNotice(`💾 Saved changes to star system ${updatedSystem.name}!`);
    },
    [systemToEdit, gridData, config, sectorCacheKey]
  );

  const handleMouseUp = (e: React.MouseEvent) => {
    setIsDragging(false);
    if (!containerRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    // Check for click in place (not a drag)
    if (Math.hypot(dx, dy) < 6) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseScreenX = e.clientX - rect.left;
      const mouseScreenY = e.clientY - rect.top;
      const worldX = (mouseScreenX - pan.x) / zoom;
      const worldY = (mouseScreenY - pan.y) / zoom;

      const padding = 60;
      const usableW = gridData.sectorWidth - padding * 2;
      const usableH = gridData.sectorHeight - padding * 2;
      const c = Math.min(config.columns, Math.max(1, Math.floor(((worldX - padding) / usableW) * config.columns) + 1));
      const r = Math.min(config.rows, Math.max(1, Math.floor(((worldY - padding) / usableH) * config.rows) + 1));
      const clickedCoord = formatHexCoord(c, r);

      const existing = gridData.systems.find(
        (s) => s.coord === clickedCoord || Math.hypot(s.x - worldX, s.y - worldY) < 22
      );

      if (existing) {
        if (isMovingSystem && selectedSystem && selectedSystem.id !== existing.id) {
          // Cannot move onto occupied hex
          setBannerNotice(`Hex ${clickedCoord} is already occupied by ${existing.name}.`);
          setIsMovingSystem(false);
        } else {
          setSelectedSystem(existing);
          setSelectedCoord(existing.coord);
        }
      } else {
        if (isMovingSystem && selectedSystem) {
          handleMoveSystem(selectedSystem, c, r);
        } else if (isSectorEditMode) {
          handlePlaceNewSystem(c, r);
        } else {
          setSelectedSystem(null);
          setSelectedCoord(clickedCoord);
        }
      }
    }
  };

  // Transition state when returning to Galaxy Map
  const [isExitingToGalaxy, setIsExitingToGalaxy] = useState<boolean>(false);
  const exitTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  const handleBackToGalaxyWithTransition = useCallback(() => {
    if (!onBackToGalaxy || isExitingToGalaxy || isEnteringSystem) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      onBackToGalaxy();
      return;
    }

    setIsExitingToGalaxy(true);
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
    }
    exitTimerRef.current = setTimeout(() => {
      onBackToGalaxy();
    }, 350);
  }, [onBackToGalaxy, isExitingToGalaxy, isEnteringSystem]);

  // Zoom towards a specific screen coordinate (cursor or center)
  const zoomAtScreenPoint = useCallback(
    (screenX: number, screenY: number, factor: number) => {
      setCamera((prev) => {
        const newZoom = Math.max(0.06, Math.min(2.8, prev.zoom * factor));
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

  // Zoom with scroll wheel (zooming towards cursor, or zooming out below threshold triggers return to galaxy)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (isExitingToGalaxy || isEnteringSystem) return;

    if (e.deltaY > 0 && zoom <= 0.085 && onBackToGalaxy) {
      handleBackToGalaxyWithTransition();
      return;
    }

    // Zooming in past threshold triggers transition into star system
    if (e.deltaY < 0 && zoom >= 2.0) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const worldX = (e.clientX - rect.left - pan.x) / zoom;
        const worldY = (e.clientY - rect.top - pan.y) / zoom;
        const candidate =
          hoveredSystem ||
          selectedSystem ||
          findSystemNearWorldPos(worldX, worldY);
        if (candidate) {
          handleLaunchSystemGenerator(candidate);
          return;
        }
      }
    }

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      zoomAtScreenPoint(mouseX, mouseY, zoomFactor);
    } else {
      setZoom((prev) => Math.max(0.06, Math.min(2.8, prev * zoomFactor)));
    }
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
      coord: preset.coord,
      columns: preset.coord === '2525' ? Math.max(50, prev.columns) : prev.columns,
      rows: preset.coord === '2525' ? Math.max(50, prev.rows) : prev.rows,
      name: preset.coord === '2525' ? 'Sector 2525 (Galactic Nucleus)' : prev.name,
    }));
  };

  // Roll New Sector
  const handleRollNewSector = () => {
    const newSeed = Math.floor(Math.random() * 90000) + 1000;
    setConfig((prev) => ({ ...prev, seed: newSeed }));
  };

  // Apply Custom Grid Size, Density, Age & Age Range
  const handleApplyCustomGrid = (
    newCols: number,
    newRows: number,
    newDensity: number,
    newAge: number,
    newAgeRange: number,
    newAgeDistribution: 'normal' | 'uniform',
    newFeh: number,
    newSeed: number,
    newHasNebula: boolean
  ) => {
    const clampedCols = Math.max(4, Math.min(100, Math.round(newCols)));
    const clampedRows = Math.max(4, Math.min(100, Math.round(newRows)));
    const clampedDensity = Math.max(0.05, Math.min(3.5, +newDensity.toFixed(2)));
    const clampedAge = Math.max(0.2, Math.min(12.8, +newAge.toFixed(2)));
    const clampedAgeRange = Math.max(0.5, Math.min(12.5, +newAgeRange.toFixed(2)));
    const clampedFeh = Math.max(-1.7, Math.min(0.5, +newFeh.toFixed(2)));
    const derivedSigma =
      newAgeDistribution === 'uniform'
        ? +(clampedAgeRange / Math.sqrt(12)).toFixed(2)
        : +(clampedAgeRange / 2.2).toFixed(2);

    setConfig((prev) => ({
      ...prev,
      columns: clampedCols,
      rows: clampedRows,
      density: clampedDensity,
      meanAge: clampedAge,
      ageRange: clampedAgeRange,
      ageDistribution: newAgeDistribution,
      ageSigma: derivedSigma,
      metallicityMean: clampedFeh,
      seed: newSeed,
      hasNebula: newHasNebula,
    }));
    setShowConfigModal(false);
  };

  // Search Star Coordinate or Name
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCoord.trim()) return;
    const q = searchCoord.trim().toLowerCase();
    const clean = q.padStart(4, '0');
    const match = gridData.systems.find(
      (s) =>
        s.coord.toLowerCase() === q ||
        s.coord === clean ||
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
    );
    if (match) {
      setSelectedCoord(match.coord);
      setSelectedSystem(match);
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setPan({
          x: clientWidth / 2 - match.x * zoom,
          y: clientHeight / 2 - match.y * zoom,
        });
      }
    }
  };

  // Launch StarGen Lab with cinematic warp zoom transition
  const handleLaunchSystemGenerator = useCallback(
    (system: SectorHexSystem) => {
      if (isEnteringSystem) return;

      const systemEmpire = empireMap.get(system.id);
      const params: StarGenParams = {
        sysMass: system.mass,
        age: system.age,
        feh: system.metallicity,
        id: system.id,
        name: system.name,
        forcedMult: 'auto',
        sectorSeed: config.seed,
        sectorColumns: config.columns,
        sectorRows: config.rows,
        empireId: systemEmpire?.id || activeEmpire?.id,
      };
      if (system.sysResult && !universeCache.hasCachedSystem(system.id)) {
        universeCache.cacheLoadedSystem(system.id, system.sysResult);
        setCachedSystemCount(universeCache.getLoadedSystemCount());
      }

      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (prefersReducedMotion) {
        onLaunchStarGen(params, system.coord);
        return;
      }

      setIsEnteringSystem(true);
      setTransitionSystem(system);
      setSelectedSystem(system);
      setSelectedCoord(system.coord);

      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        const targetZoom = 2.8;
        setZoom(targetZoom);
        setPan({
          x: clientWidth / 2 - system.x * targetZoom,
          y: clientHeight / 2 - system.y * targetZoom,
        });
      }

      if (systemTransitionTimerRef.current) {
        clearTimeout(systemTransitionTimerRef.current);
      }

      systemTransitionTimerRef.current = setTimeout(() => {
        onLaunchStarGen(params, system.coord);
      }, 450);
    },
    [isEnteringSystem, empireMap, activeEmpire, config.seed, config.columns, config.rows, onLaunchStarGen]
  );

  // Keyboard navigation: Page Up for higher view level (Galaxy), Page Down for lower view level (System / StarGen)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'PageDown' && e.code !== 'PageDown' && e.key !== 'PageUp' && e.code !== 'PageUp') return;

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

      if (showConfigModal || isEmpireModalOpen) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'PageUp' || e.code === 'PageUp') {
        handleBackToGalaxyWithTransition();
      } else if (e.key === 'PageDown' || e.code === 'PageDown') {
        const targetSys = hoveredSystem || selectedSystem || gridData.systems[0];
        if (targetSys) {
          handleLaunchSystemGenerator(targetSys);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showConfigModal,
    isEmpireModalOpen,
    handleBackToGalaxyWithTransition,
    hoveredSystem,
    selectedSystem,
    gridData.systems,
    handleLaunchSystemGenerator,
  ]);

  // ============================================================================
  // SCALE STAR RADIUS BY SQUARE ROOT OF PHYSICAL RADIUS (R_sun)
  // Clamps white dwarfs, neutron stars, and black holes to the smallest brown dwarf
  // ============================================================================
  const getStarScaledRadius = (
    star: { radius?: number; mass?: number; spectralType?: string; category?: string },
    scaleMult: number = 1.0
  ): { r: number; glowR: number; isBlackHole: boolean } => {
    const MIN_BROWN_DWARF_RADIUS = 0.08; // Physical radius of smallest sub-stellar brown dwarf (~0.8 R_jup)

    // Check if star is a white dwarf, neutron star, or black hole
    const isBlackHole = isBlackHoleStar(star);
    const typeLower = (star.spectralType || '').toLowerCase();
    const catLower = (star.category || '').toLowerCase();
    const isCompactRemnant =
      catLower.includes('remnant') ||
      typeLower.includes('white dwarf') ||
      typeLower.includes('dwarf (d') ||
      typeLower.includes('neutron') ||
      isBlackHole;

    let rSolar = typeof star.radius === 'number' && star.radius > 0
      ? star.radius
      : (star.mass ? Math.pow(star.mass, 0.8) : 1.0);

    // Clamp white dwarfs, neutron stars, and black holes to the exact same size as smallest brown dwarfs
    if (isCompactRemnant || rSolar < MIN_BROWN_DWARF_RADIUS) {
      rSolar = MIN_BROWN_DWARF_RADIUS;
    }

    // Scale directly by square root of radius: r ∝ sqrt(R)
    const sqrtR = Math.sqrt(rSolar);
    const baseR = 2.0 + 2.85 * sqrtR;
    const r = Math.min(16.0 * scaleMult, Math.max(2.3 * scaleMult, baseR * scaleMult));
    const glowR = Math.min(26.0 * scaleMult, Math.max(5.8 * scaleMult, r * 1.85 + 2.0));

    return { r: +r.toFixed(2), glowR: +glowR.toFixed(2), isBlackHole };
  };

  // ============================================================================
  // MULTIPLE STAR RENDERING HELPER (DEPICTS MULTIPLE STARS IN SECTORHEX GRAPHIC)
  // ============================================================================
  const renderSystemStars = (system: SectorHexSystem) => {
    const stars = system.sysResult.hierarchy.stars;
    const n = stars.length;

    // Helper to render an individual star node or black hole using scaled star assets
    const renderStarNode = (
      cx: number,
      cy: number,
      r: number,
      glowR: number,
      isBH: boolean,
      st: StarAssetDescriptor
    ) => {
      const assetPath = getStarAssetPath(st);
      const renderSize = isBH ? Math.max(18, r * 4.6) : Math.max(11, glowR * 2.1);
      return (
        <image
          key={`star-asset-${cx}-${cy}`}
          href={assetPath}
          x={+(cx - renderSize / 2).toFixed(2)}
          y={+(cy - renderSize / 2).toFixed(2)}
          width={+renderSize.toFixed(2)}
          height={+renderSize.toFixed(2)}
          preserveAspectRatio="xMidYMid meet"
          className="pointer-events-none"
        />
      );
    };

    // Single Star
    if (n <= 1 || !stars || stars.length === 0) {
      const star = stars[0] || { mass: system.primaryMass, colorHex: system.colorHex, radius: system.primaryMass };
      const { r, glowR, isBlackHole } = getStarScaledRadius(star, 1.0);
      return renderStarNode(0, 0, r, glowR, isBlackHole, star);
    }

    // Binary System (Star A & Star B side-by-side with gravitational bridge)
    if (n === 2) {
      const starA = stars[0];
      const starB = stars[1];
      const { r: rA, isBlackHole: isBHA } = getStarScaledRadius(starA, 0.88);
      const { r: rB, isBlackHole: isBHB } = getStarScaledRadius(starB, 0.88);
      const posA = { x: -Math.max(6.5, rA * 0.9), y: -2 };
      const posB = { x: +Math.max(6.5, rB * 0.9), y: -2 };
      const bridgeRx = Math.max(10.5, (posB.x - posA.x) * 0.85);
      return (
        <g>
          {/* Subtle orbital bridge */}
          <ellipse
            cx={0}
            cy={-2}
            rx={bridgeRx}
            ry={4.5}
            fill="none"
            stroke="rgba(148, 163, 184, 0.25)"
            strokeWidth={0.8}
            strokeDasharray="2,2"
          />
          {renderStarNode(posA.x, posA.y, rA, rA * 1.8, isBHA, starA)}
          {renderStarNode(posB.x, posB.y, rB, rB * 1.8, isBHB, starB)}
        </g>
      );
    }

    // Trinary System (Triangle configuration: Primary A on left, B & C pair on right)
    if (n === 3) {
      const starA = stars[0];
      const starB = stars[1];
      const starC = stars[2];
      const { r: rA, isBlackHole: isBHA } = getStarScaledRadius(starA, 0.80);
      const { r: rB, isBlackHole: isBHB } = getStarScaledRadius(starB, 0.80);
      const { r: rC, isBlackHole: isBHC } = getStarScaledRadius(starC, 0.80);
      const posA = { x: -Math.max(7.5, rA * 0.95), y: -2 };
      const posB = { x: +Math.max(6.0, rB * 0.9), y: -6.5 };
      const posC = { x: +Math.max(6.0, rC * 0.9), y: +2.5 };
      return (
        <g>
          <ellipse
            cx={0}
            cy={-2}
            rx={12.5}
            ry={6.5}
            fill="none"
            stroke="rgba(148, 163, 184, 0.20)"
            strokeWidth={0.7}
            strokeDasharray="2,2"
          />
          {renderStarNode(posA.x, posA.y, rA, rA * 1.7, isBHA, starA)}
          {renderStarNode(posB.x, posB.y, rB, rB * 1.7, isBHB, starB)}
          {renderStarNode(posC.x, posC.y, rC, rC * 1.7, isBHC, starC)}
        </g>
      );
    }

    // Quadruple System (4 Stars: Dual binary pairs AB and CD, OR Supermassive Black Hole + 3 S-Stars)
    const starA = stars[0];
    const starB = stars[1];
    const starC = stars[2];
    const starD = stars[3];

    // Special: Supermassive Black Hole + 3 S-Stars (Sagittarius A* Galactic Center S-Cluster)
    if (system.mass > 999999 || isSupermassiveBlackHole(starA)) {
      const { r: rA } = getStarScaledRadius(starA, 1.45);
      const { r: rB } = getStarScaledRadius(starB, 0.75);
      const { r: rC } = getStarScaledRadius(starC, 0.65);
      const { r: rD } = getStarScaledRadius(starD, 0.58);
      const posB = { x: -14, y: -7 };
      const posC = { x: +13, y: -9 };
      const posD = { x: +16, y: +8 };

      return (
        <g>
          {/* S-Star Relativistic Orbital Traces */}
          <ellipse cx={0} cy={0} rx={16} ry={9} fill="none" stroke="rgba(192, 132, 252, 0.35)" strokeWidth={0.6} strokeDasharray="2,2" />
          <ellipse cx={0} cy={0} rx={21} ry={13} fill="none" stroke="rgba(192, 132, 252, 0.30)" strokeWidth={0.6} strokeDasharray="2,2" />

          {/* Supermassive Black Hole Asset (Sagittarius A*) */}
          {renderStarNode(0, 0, rA, rA * 2.8, true, starA)}

          {/* Companion S-Stars (B, C, D) Scaled Assets */}
          {renderStarNode(posB.x, posB.y, rB, rB * 1.8, false, starB)}
          {renderStarNode(posC.x, posC.y, rC, rC * 1.8, false, starC)}
          {renderStarNode(posD.x, posD.y, rD, rD * 1.8, false, starD)}
        </g>
      );
    }

    const { r: rA, isBlackHole: isBHA } = getStarScaledRadius(starA, 0.72);
    const { r: rB, isBlackHole: isBHB } = getStarScaledRadius(starB, 0.72);
    const { r: rC, isBlackHole: isBHC } = getStarScaledRadius(starC, 0.72);
    const { r: rD, isBlackHole: isBHD } = getStarScaledRadius(starD, 0.72);
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
        {renderStarNode(posA.x, posA.y, rA, rA * 1.5, isBHA, starA)}
        {renderStarNode(posB.x, posB.y, rB, rB * 1.5, isBHB, starB)}
        {renderStarNode(posC.x, posC.y, rC, rC * 1.5, isBHC, starC)}
        {renderStarNode(posD.x, posD.y, rD, rD * 1.5, isBHD, starD)}
      </g>
    );
  };

  // ============================================================================
  // HIGH-PERFORMANCE VIEWPORT CULLING FOR VISIBLE STARS & HYPERLANES
  // ============================================================================
  const visibleSystems = useMemo(() => {
    if (isEnteringSystem && transitionSystem) {
      const buffer = 800;
      return gridData.systems.filter((sys) => {
        return Math.abs(sys.x - transitionSystem.x) <= buffer && Math.abs(sys.y - transitionSystem.y) <= buffer;
      });
    }

    const marginPx = 80; // Pixel padding around screen to prevent popping
    const viewMinX = (-pan.x - marginPx) / zoom;
    const viewMaxX = (containerSize.width - pan.x + marginPx) / zoom;
    const viewMinY = (-pan.y - marginPx) / zoom;
    const viewMaxY = (containerSize.height - pan.y + marginPx) / zoom;

    return gridData.systems.filter((sys) => {
      const r = sys.influenceRadius || 40;
      return (
        sys.x + r >= viewMinX &&
        sys.x - r <= viewMaxX &&
        sys.y + r >= viewMinY &&
        sys.y - r <= viewMaxY
      );
    });
  }, [gridData.systems, pan.x, pan.y, zoom, containerSize, isEnteringSystem, transitionSystem]);

  // Viewport culling for hyperlanes (0 DOM nodes when showHyperlanes is false)
  const visibleHyperlanes = useMemo(() => {
    if (!showHyperlanes || !gridData.hyperlanes || gridData.hyperlanes.length === 0) return [];
    const marginPx = 80;
    const viewMinX = (-pan.x - marginPx) / zoom;
    const viewMaxX = (containerSize.width - pan.x + marginPx) / zoom;
    const viewMinY = (-pan.y - marginPx) / zoom;
    const viewMaxY = (containerSize.height - pan.y + marginPx) / zoom;

    return gridData.hyperlanes.filter((lane) => {
      const minX = Math.min(lane.x1, lane.x2);
      const maxX = Math.max(lane.x1, lane.x2);
      const minY = Math.min(lane.y1, lane.y2);
      const maxY = Math.max(lane.y1, lane.y2);

      return !(maxX < viewMinX || minX > viewMaxX || maxY < viewMinY || minY > viewMaxY);
    });
  }, [showHyperlanes, gridData.hyperlanes, pan.x, pan.y, zoom, containerSize]);

  return (
    <div
      className={`w-full h-full flex flex-col bg-[#050814] text-slate-100 overflow-hidden font-sans select-none relative ${
        isExitingToGalaxy ? 'animate-sector-exit' : 'animate-sector-enter'
      }`}
    >
      {isGeneratingSector && (
        <GenerationLoadingOverlay
          title={`Generating ${config.name || (config.coord ? `Sector ${config.coord}` : 'Stellar Sector')}`}
          subtitle={`Synthesizing ${config.columns}×${config.rows} Hex Grid • ${Math.round(config.density * 100)}% Stellar Density • Seed #${config.seed}`}
          detail={`Sampling Initial Mass Function, binary hierarchies, and hyperlane topology...`}
          accentColor="#38bdf8"
        />
      )}
      {/* ============================================================================ */}
      {/* TOP COMMAND & SECTOR CONFIGURATION TOOLBAR                                   */}
      {/* ============================================================================ */}
      <SectorTopToolbar
        showUI={showUI}
        onBackToGalaxy={onBackToGalaxy}
        onBackToGalaxyWithTransition={handleBackToGalaxyWithTransition}
        config={config}
        isFromCache={isFromCache}
        gridData={gridData}
        activePreset={activePreset}
        onSelectPreset={handleSelectPreset}
        presets={SECTOR_PRESETS}
        onOpenConfigModal={() => setShowConfigModal(true)}
        searchCoord={searchCoord}
        onSearchCoordChange={setSearchCoord}
        onSearchSubmit={handleSearchSubmit}
        isSpawnEmpireMode={isSpawnEmpireMode}
        onStartSpawnEmpire={handleStartSpawnEmpire}
        isSectorEditMode={isSectorEditMode}
        onToggleSectorEditMode={() => {
          setIsSectorEditMode((prev) => !prev);
          setIsMovingSystem(false);
        }}
        onRollNewSector={handleRollNewSector}
        onOpenSectorExportModal={() => setShowSectorExportModal(true)}
        setBannerNotice={setBannerNotice}
        isMovingSystem={isMovingSystem}
        onToggleMovingSystem={() => setIsMovingSystem((prev) => !prev)}
        selectedCoord={selectedCoord}
        selectedSystem={selectedSystem}
        onPlaceNewSystem={handlePlaceNewSystem}
        onOpenSystemEditor={(system) => {
          setSystemToEdit(system);
          setIsSystemEditorOpen(true);
        }}
        onDeleteSystem={handleDeleteSystem}
      />

      {/* ============================================================================ */}
      {/* GRID SIZE, DENSITY, AGE & METALLICITY CUSTOMIZATION MODAL (UP TO 100x100!)   */}
      {/* ============================================================================ */}
      <SectorParametersModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        draftCols={draftCols}
        setDraftCols={setDraftCols}
        draftRows={draftRows}
        setDraftRows={setDraftRows}
        draftDensity={draftDensity}
        setDraftDensity={setDraftDensity}
        draftAge={draftAge}
        setDraftAge={setDraftAge}
        draftAgeRange={draftAgeRange}
        setDraftAgeRange={setDraftAgeRange}
        draftAgeDistribution={draftAgeDistribution}
        setDraftAgeDistribution={setDraftAgeDistribution}
        draftFeh={draftFeh}
        setDraftFeh={setDraftFeh}
        draftSeed={draftSeed}
        setDraftSeed={setDraftSeed}
        draftHasNebula={draftHasNebula}
        setDraftHasNebula={setDraftHasNebula}
        onApply={handleApplyCustomGrid}
      />

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
          className={`flex-1 h-full relative overflow-hidden select-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{
            backgroundColor: gridData.hasNebula ? '#030611' : '#000000',
            backgroundImage: gridData.hasNebula
              ? `radial-gradient(circle at 50% 50%, #150928 0%, #080314 55%, #030611 100%)`
              : 'none',
          }}
        >
          {/* Subtle Deep Space Star Dust Background (only when noise clouds / nebula enabled) */}
          {gridData.hasNebula && (
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
          )}

          {/* SVG Canvas with Zoom & Pan Transformation */}
          <svg
            className="w-full h-full absolute inset-0 pointer-events-auto"
            style={{ willChange: 'transform' }}
          >
            <defs>
              <radialGradient id="sector-ambient-nebula-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#86198f" stopOpacity="0.28" />
                <stop offset="45%" stopColor="#4a044e" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#080314" stopOpacity="0" />
              </radialGradient>

              {gridData.nebula?.blobs.map((blob, idx) => (
                <radialGradient
                  key={`nebula-grad-${idx}`}
                  id={`nebula-blob-grad-${idx}`}
                  cx="50%"
                  cy="50%"
                  r="50%"
                >
                  <stop offset="0%" stopColor={blob.coreColor} stopOpacity={blob.opacity} />
                  <stop offset="35%" stopColor={blob.midColor} stopOpacity={blob.opacity * 0.78} />
                  <stop offset="70%" stopColor="#4a044e" stopOpacity={blob.opacity * 0.40} />
                  <stop offset="100%" stopColor="#080314" stopOpacity="0" />
                </radialGradient>
              ))}

              {/* Hexagonal Sector Boundary Clip Path */}
              <clipPath id="sector-hex-clip">
                <polygon points={gridData.hexPoints} />
              </clipPath>
            </defs>

            <g
              transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
              style={{
                transformOrigin: '0 0',
                transition:
                  isEnteringSystem || isReturningFromSystem
                    ? 'transform 450ms cubic-bezier(0.2, 0.8, 0.2, 1)'
                    : 'none',
              }}
            >
              {/* Sector Hexagon Border & Fill */}
              <polygon
                points={gridData.hexPoints}
                fill={gridData.hasNebula ? "rgba(6, 11, 24, 0.50)" : "#000000"}
                stroke="#38bdf8"
                strokeWidth={2.4}
                strokeOpacity={0.75}
              />

              {/* Inner Dashed Hexagon Guideline */}
              <polygon
                points={gridData.hexInnerPoints}
                fill="none"
                stroke="rgba(56, 189, 248, 0.25)"
                strokeWidth={1.2}
                strokeDasharray="6,4"
              />

              {/* Clipped Environment: Hardware-Accelerated Radial Nebula Clouds & Parsec Coordinates (Zero SVG Filter Lag) */}
              <g clipPath="url(#sector-hex-clip)">
                {gridData.hasNebula && showNebulae && (
                  <g className="sector-nebula-layer pointer-events-none">
                    <rect
                      x={0}
                      y={0}
                      width={gridData.sectorWidth}
                      height={gridData.sectorHeight}
                      fill="url(#sector-ambient-nebula-glow)"
                      style={{ mixBlendMode: 'screen' }}
                    />
                    {gridData.nebula && (
                      <g style={{ mixBlendMode: 'screen' }}>
                        {gridData.nebula.blobs.map((blob, idx) => (
                          <ellipse
                            key={`nebula-blob-${idx}`}
                            cx={blob.cx}
                            cy={blob.cy}
                            rx={blob.rx * 1.15}
                            ry={blob.ry * 1.15}
                            transform={`rotate(${blob.rotation}, ${blob.cx}, ${blob.cy})`}
                            fill={`url(#nebula-blob-grad-${idx})`}
                          />
                        ))}
                        {gridData.nebula.dustLanes.map((dust, idx) => (
                          <line
                            key={`nebula-dust-${idx}`}
                            x1={dust.x1}
                            y1={dust.y1}
                            x2={dust.x2}
                            y2={dust.y2}
                            stroke="#05030a"
                            strokeWidth={dust.strokeWidth * 1.25}
                            opacity={dust.opacity * 0.8}
                            strokeLinecap="round"
                          />
                        ))}
                      </g>
                    )}
                  </g>
                )}

                {/* Subtle Astronomical Parsec Coordinate Grid Lines */}
                {Array.from({ length: 9 }).map((_, idx) => {
                  const frac = (idx + 1) / 10;
                  const gx = gridData.sectorWidth * frac;
                  const gy = gridData.sectorHeight * frac;
                  return (
                    <g key={`grid-line-${idx}`} opacity={0.10} stroke="#38bdf8" strokeWidth={0.8} strokeDasharray="3,4">
                      <line x1={gx} y1={0} x2={gx} y2={gridData.sectorHeight} />
                      <line x1={0} y1={gy} x2={gridData.sectorWidth} y2={gy} />
                    </g>
                  );
                })}
              </g>

              {/* Hexagon Vertex Sci-Fi Tech Brackets (6 Corners) */}
              {gridData.hexVertices?.map((v, idx) => {
                const angleToCenter = Math.atan2(gridData.hexCenterY - v.y, gridData.hexCenterX - v.x);
                const arm1Angle = angleToCenter + Math.PI / 3;
                const arm2Angle = angleToCenter - Math.PI / 3;
                const armLen = 24;
                const p1x = v.x + Math.cos(arm1Angle) * armLen;
                const p1y = v.y + Math.sin(arm1Angle) * armLen;
                const p2x = v.x + Math.cos(arm2Angle) * armLen;
                const p2y = v.y + Math.sin(arm2Angle) * armLen;
                return (
                  <path
                    key={`hex-corner-${idx}`}
                    d={`M ${p1x} ${p1y} L ${v.x} ${v.y} L ${p2x} ${p2y}`}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={2.4}
                    opacity={0.85}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })}

              {/* Sector Parsec Scale Marker at Bottom of Hexagon */}
              <text
                x={gridData.hexCenterX}
                y={gridData.hexCenterY + gridData.hexRadius - 16}
                textAnchor="middle"
                fill="rgba(148, 163, 184, 0.7)"
                fontSize={9.5}
                fontFamily="monospace"
                letterSpacing="0.06em"
              >
                HEXAGONAL SECTOR FIELD: {gridData.parsecWidth}&times;{gridData.parsecHeight} pc &bull; {gridData.systems.length} STELLAR SYSTEMS
              </text>

              {/* Procedural Hyperlane Network Layer (Viewport Culled) */}
              {showHyperlanes && visibleHyperlanes.length > 0 && (
                <g className="hyperlanes-layer pointer-events-none">
                  {visibleHyperlanes.map((lane) => {
                    const isConnectedToSelected =
                      selectedSystem != null &&
                      (lane.sourceId === selectedSystem.id || lane.targetId === selectedSystem.id);
                    const isConnectedToHovered =
                      hoveredSystem != null &&
                      (lane.sourceId === hoveredSystem.id || lane.targetId === hoveredSystem.id);
                    const isHighlighted = isConnectedToSelected || isConnectedToHovered;

                    // Check if both hyperlane endpoints are claimed by the same empire
                    const srcEmpire = empireMap.get(lane.sourceId);
                    const tgtEmpire = empireMap.get(lane.targetId);
                    const isSameEmpire = srcEmpire != null && tgtEmpire != null && srcEmpire.id === tgtEmpire.id;
                    const empireColor = isSameEmpire ? srcEmpire.color : null;

                    return (
                      <g key={lane.id}>
                        {/* Glow halo underlay when selected, hovered, or empire territory */}
                        {(isHighlighted || isSameEmpire) && (
                          <line
                            x1={lane.x1}
                            y1={lane.y1}
                            x2={lane.x2}
                            y2={lane.y2}
                            stroke={
                              isHighlighted
                                ? isConnectedToSelected
                                  ? '#38bdf8'
                                  : '#818cf8'
                                : empireColor!
                            }
                            strokeWidth={isHighlighted ? 3.6 : 3.0}
                            opacity={isHighlighted ? 0.65 : 0.50}
                            strokeLinecap="round"
                          />
                        )}
                        {/* Core hyperlane route */}
                        <line
                          x1={lane.x1}
                          y1={lane.y1}
                          x2={lane.x2}
                          y2={lane.y2}
                          stroke={
                            isHighlighted
                              ? isConnectedToSelected
                                ? '#38bdf8'
                                : '#a5b4fc'
                              : isSameEmpire
                              ? empireColor!
                              : lane.isEdgeLane
                              ? 'rgba(56, 189, 248, 0.55)'
                              : 'rgba(56, 189, 248, 0.32)'
                          }
                          strokeWidth={isHighlighted ? 1.8 : isSameEmpire ? 1.5 : lane.isEdgeLane ? 1.3 : 1.0}
                          strokeDasharray={lane.isEdgeLane ? '5,3' : isHighlighted || isSameEmpire ? undefined : '3,4'}
                          opacity={isHighlighted ? 1.0 : isSameEmpire ? 0.95 : lane.isEdgeLane ? 0.85 : 0.65}
                          strokeLinecap="round"
                        />

                        {/* Border Jump Point Waypoint Marker at the hexagon perimeter */}
                        {lane.isEdgeLane && (
                          <circle
                            cx={lane.x2}
                            cy={lane.y2}
                            r={isHighlighted ? 3.8 : 2.6}
                            fill={isHighlighted ? '#38bdf8' : isSameEmpire ? empireColor! : '#0284c7'}
                            stroke="#e0f2fe"
                            strokeWidth={1}
                            opacity={isHighlighted ? 1.0 : 0.85}
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Stars in Random Positions with Circular Zones of Influence */}
              {visibleSystems.map((system) => {
                const isSelected = selectedSystem?.id === system.id || selectedCoord === system.coord;
                const isHovered = hoveredSystem?.id === system.id;
                const systemEmpire = empireMap.get(system.id);
                const isCapital = systemEmpire != null && systemEmpire.homeworldSystemId === system.id;

                // Filter check (O(1) pre-indexed traits lookup, multi-filter combination supported)
                const matchesFilter = checkSystemMatchesFilters(
                  system,
                  activeFilterCats,
                  massBracket,
                  customMinMass,
                  customMaxMass,
                  systemTraitsMap.get(system.id)
                );

                const systemOpacity = matchesFilter ? 1 : 0.20;

                return (
                  <g
                    key={system.id}
                    transform={`translate(${system.x}, ${system.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isSpawnEmpireMode) {
                        if (system.candidateHabitable) {
                          setEmpireTargetSystem(system);
                          setIsEmpireModalOpen(true);
                          setIsSpawnEmpireMode(false);
                          setBannerNotice(null);
                        } else {
                          setBannerNotice(
                            '⚠️ Cannot spawn empire here: System has no habitable worlds. Please choose a star with a green dot 🟢.'
                          );
                        }
                        setSelectedSystem(system);
                        setSelectedCoord(system.coord);
                        return;
                      }

                      if (e.shiftKey) {
                        handleClaimToggle(system);
                        setSelectedSystem(system);
                        setSelectedCoord(system.coord);
                        return;
                      }

                      setSelectedSystem(system);
                      setSelectedCoord(system.coord);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleLaunchSystemGenerator(system);
                    }}
                    onMouseEnter={() => setHoveredSystem(system)}
                    onMouseLeave={() => setHoveredSystem(null)}
                    className="cursor-pointer transition-opacity"
                    style={{ opacity: systemOpacity }}
                  >
                    {/* Outer Subtle Gravitational Sphere Fringe */}
                    <circle
                      r={system.influenceRadius + 4}
                      fill="none"
                      stroke={
                        systemEmpire
                          ? systemEmpire.color
                          : isSelected
                          ? '#38bdf8'
                          : isHovered
                          ? '#7dd3fc'
                          : showHexBoundaries
                          ? 'rgba(100, 116, 139, 0.22)'
                          : 'transparent'
                      }
                      strokeWidth={systemEmpire ? (isSelected || isHovered ? 1.5 : 1.0) : 0.8}
                      strokeDasharray="2,3"
                      opacity={systemEmpire ? 0.75 : isSelected || isHovered ? 0.95 : 0.40}
                    />

                    {/* Capital Insignia Outer Dashed Halo */}
                    {isCapital && (
                      <circle
                        r={system.influenceRadius + 8}
                        fill="none"
                        stroke={systemEmpire.color}
                        strokeWidth={1.5}
                        strokeDasharray="3,3"
                        opacity={0.85}
                      />
                    )}

                    {/* Explored & Cached System Highlight Ring & Pip */}
                    {cachedSystemIds.has(system.id) && (
                      <g className="pointer-events-none">
                        <circle
                          r={system.influenceRadius + 3.5}
                          fill="rgba(16, 185, 129, 0.08)"
                          stroke="#10b981"
                          strokeWidth={1.3}
                          strokeDasharray="3,3"
                          opacity={0.88}
                          className="animate-pulse"
                        />
                        <circle
                          cx={system.influenceRadius * 0.707}
                          cy={system.influenceRadius * 0.707}
                          r={3.2}
                          fill="#022c22"
                          stroke="#10b981"
                          strokeWidth={1.0}
                        />
                        <circle
                          cx={system.influenceRadius * 0.707}
                          cy={system.influenceRadius * 0.707}
                          r={1.5}
                          fill="#34d399"
                        />
                      </g>
                    )}

                    {/* Circular Zone of Influence (Primary Hit Area & Click/Hover Target) */}
                    <circle
                      r={system.influenceRadius}
                      fill={
                        systemEmpire
                          ? isSelected
                            ? `${systemEmpire.color}45`
                            : isHovered
                            ? `${systemEmpire.color}32`
                            : `${systemEmpire.color}1c`
                          : isSelected
                          ? 'rgba(14, 165, 233, 0.22)'
                          : isHovered
                          ? 'rgba(56, 189, 248, 0.12)'
                          : showHexBoundaries
                          ? 'rgba(15, 23, 42, 0.50)'
                          : 'rgba(15, 23, 42, 0.08)'
                      }
                      stroke={
                        systemEmpire
                          ? systemEmpire.color
                          : isSelected
                          ? '#38bdf8'
                          : isHovered
                          ? '#7dd3fc'
                          : showHexBoundaries
                          ? 'rgba(148, 163, 184, 0.35)'
                          : 'transparent'
                      }
                      strokeWidth={
                        systemEmpire
                          ? isSelected
                            ? 3.0
                            : isHovered
                            ? 2.2
                            : 1.6
                          : isSelected
                          ? 2.5
                          : isHovered
                          ? 1.8
                          : 1.2
                      }
                      strokeDasharray={isSelected ? '5,3' : 'none'}
                      className={isSelected ? 'animate-pulse' : ''}
                    />

                    {/* Render Multiple Stars (A, B, C, D) with their exact colors and sizes */}
                    {renderSystemStars(system)}

                    {/* Capital Crown Badge Icon */}
                    {isCapital && (
                      <text
                        y={-system.influenceRadius - 8}
                        textAnchor="middle"
                        fontSize={11}
                        style={{ pointerEvents: 'none' }}
                      >
                        👑
                      </text>
                    )}

                    {/* Habitable World Green Badge Dot */}
                    {system.candidateHabitable && (
                      <circle
                        cx={system.influenceRadius * 0.65}
                        cy={-system.influenceRadius * 0.65}
                        r={2.5}
                        fill="#10b981"
                        stroke="#064e3b"
                        strokeWidth={0.5}
                      />
                    )}

                    {/* Giant Star System Gold Badge Dot (Mass 10 to 50 M☉) */}
                    {system.isGiantSystem && (
                      <circle
                        cx={-system.influenceRadius * 0.65}
                        cy={-system.influenceRadius * 0.65}
                        r={2.8}
                        fill="#f59e0b"
                        stroke="#78350f"
                        strokeWidth={0.5}
                      />
                    )}

                    {/* Supermassive Black Hole Galactic Nucleus Badge (1,000,000 M☉) */}
                    {system.mass > 999999 && (
                      <g>
                        <circle
                          cx={0}
                          cy={-system.influenceRadius - 10}
                          r={7.5}
                          fill="#4a044e"
                          stroke="#c084fc"
                          strokeWidth={1}
                        />
                        <text
                          y={-system.influenceRadius - 6.5}
                          textAnchor="middle"
                          fontSize={9}
                          style={{ pointerEvents: 'none' }}
                        >
                          🌀
                        </text>
                      </g>
                    )}

                    {/* Stellar Black Hole Badge (Mass >= 20 M☉ / BH Remnant: same icon as SMBH, but smaller) */}
                    {system.mass <= 999999 &&
                      (system.remnantType === 'BH' ||
                        system.primaryClass?.includes('BH') ||
                        system.sysResult?.hierarchy?.stars?.some((s) => isBlackHoleStar(s))) && (
                        <g>
                          <circle
                            cx={0}
                            cy={-system.influenceRadius - 8}
                            r={5.2}
                            fill="#3b0764"
                            stroke="#c084fc"
                            strokeWidth={0.8}
                          />
                          <text
                            y={-system.influenceRadius - 5.5}
                            textAnchor="middle"
                            fontSize={6.5}
                            style={{ pointerEvents: 'none' }}
                          >
                            🌀
                          </text>
                        </g>
                      )}

                    {/* Coordinate / Catalog Label at top of zone - revealed only on mouse over or click/selection */}
                    {showLabels && (isSelected || isHovered) && zoom >= 0.26 && (
                      <text
                        y={-system.influenceRadius - 6}
                        textAnchor="middle"
                        fill={isSelected ? '#38bdf8' : '#94a3b8'}
                        fontSize={8.5}
                        fontFamily="monospace"
                        fontWeight="bold"
                        letterSpacing="0.05em"
                        style={{
                          textShadow: '0 1px 3px rgba(0,0,0,0.95)',
                          pointerEvents: 'none',
                        }}
                      >
                        {system.coord}
                      </text>
                    )}

                    {/* Star System Name (only label shown by default on star hexes) */}
                    {showLabels && zoom >= 0.30 && (
                      <text
                        y={system.influenceRadius + 13}
                        textAnchor="middle"
                        fill="#f8fafc"
                        fontSize={8.5}
                        fontWeight="600"
                        letterSpacing="0.02em"
                        style={{
                          textShadow: '0 1px 3px rgba(0,0,0,0.95)',
                          pointerEvents: 'none',
                        }}
                      >
                        {system.name.length > 13
                          ? system.name.slice(0, 12) + '…'
                          : system.name}
                      </text>
                    )}

                    {/* Spectral Class Pill - Revealed only on mouse over or click */}
                    {(isSelected || isHovered) && zoom >= 0.30 && (
                      <text
                        y={system.influenceRadius + 24}
                        textAnchor="middle"
                        fill={system.colorHex}
                        fontSize={7.5}
                        fontFamily="monospace"
                        fontWeight="bold"
                        style={{
                          textShadow: '0 1px 3px rgba(0,0,0,0.95)',
                          pointerEvents: 'none',
                        }}
                      >
                        {system.primaryClass.split(' ')[0]} &bull; {system.primaryMass.toFixed(2)}M☉{system.nStars > 1 ? ` +${system.nStars - 1}★` : ''}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Bottom Left Floating Navigation & View Controls */}
          <SectorFilterOverlayBar
            showUI={showUI}
            hasActiveFilters={hasActiveFilters}
            activeFilterCats={activeFilterCats}
            onToggleFilterCat={toggleFilterCat}
            massBracket={massBracket}
            onSelectMassBracket={setMassBracket}
            customMinMass={customMinMass}
            onChangeCustomMinMass={setCustomMinMass}
            customMaxMass={customMaxMass}
            onChangeCustomMaxMass={setCustomMaxMass}
            showMassMenu={showMassMenu}
            setShowMassMenu={setShowMassMenu}
            massFilterButtonLabel={getMassFilterButtonLabel()}
            onResetFilters={() => {
              setActiveFilterCats(new Set());
              setMassBracket('all');
            }}
            matchingStarsCount={matchingStarsCount}
            totalSystemsCount={gridData.systems.length}
            zoom={zoom}
            onZoomIn={() => {
              if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                zoomAtScreenPoint(rect.width / 2, rect.height / 2, 1.25);
              } else {
                setZoom((z) => Math.min(2.8, z * 1.25));
              }
            }}
            onZoomOut={() => {
              if (zoom <= 0.085 && onBackToGalaxy) {
                handleBackToGalaxyWithTransition();
              } else if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                zoomAtScreenPoint(rect.width / 2, rect.height / 2, 0.8);
              } else {
                setZoom((z) => Math.max(0.06, z * 0.8));
              }
            }}
            onFitToScreen={handleFitToScreen}
            showHyperlanes={showHyperlanes}
            onToggleHyperlanes={() => setShowHyperlanes((v) => !v)}
            showHexBoundaries={showHexBoundaries}
            onToggleHexBoundaries={() => setShowHexBoundaries((v) => !v)}
            showLabels={showLabels}
            onToggleLabels={() => setShowLabels((v) => !v)}
            hasNebula={gridData.hasNebula}
            showNebulae={showNebulae}
            onToggleNebulae={() => {
              if (gridData.hasNebula) {
                setShowNebulae((v) => !v);
              } else {
                setConfig((prev) => ({ ...prev, hasNebula: true }));
                setShowNebulae(true);
              }
            }}
            sectorCachedCount={sectorCachedCount}
          />

          {/* High Zoom Threshold Indicator Pill to Enter System */}
          {zoom >= 1.5 && selectedSystem && !isEnteringSystem && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-950/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-cyan-500/50 text-[11px] font-mono text-cyan-200 shadow-xl flex items-center gap-2 pointer-events-none animate-pulse z-10">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Zoom further or double-click to enter System <strong>{selectedSystem.name || selectedSystem.coord}</strong></span>
            </div>
          )}

          {/* Cinematic Warp / Zoom Transition Overlay into Star System */}
          {isEnteringSystem && transitionSystem && (
            <div
              className="absolute inset-0 z-30 pointer-events-none flex flex-col items-center justify-center transition-all duration-500 ease-out"
              style={{
                backgroundColor: 'rgba(3, 6, 17, 0.75)',
                backdropFilter: 'blur(4px)',
              }}
            >
              <div
                className="w-44 h-44 rounded-full border-2 animate-ping opacity-60 absolute"
                style={{ borderColor: transitionSystem.colorHex }}
              />
              <div
                className="w-24 h-24 rounded-full border border-cyan-400/80 animate-pulse flex items-center justify-center shadow-2xl relative"
                style={{
                  boxShadow: `0 0 50px ${transitionSystem.colorHex}`,
                  backgroundColor: 'rgba(5, 8, 20, 0.85)',
                }}
              >
                <Compass className="w-9 h-9 text-cyan-300 animate-spin" style={{ animationDuration: '3s' }} />
              </div>

              <div className="mt-6 text-center space-y-1 font-mono">
                <div className="text-[11px] uppercase tracking-widest text-cyan-400 font-bold flex items-center justify-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 animate-bounce" />
                  <span>WARP TRANSITION &bull; ENTERING STAR SYSTEM {transitionSystem.coord}</span>
                </div>
                <h3 className="text-xl font-extrabold text-white tracking-wide">
                  {transitionSystem.name}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {transitionSystem.primaryClass} &bull; Mass: {transitionSystem.mass.toFixed(2)} M&#9737; &bull; {transitionSystem.age.toFixed(1)} Gyr &bull; [Fe/H]: {transitionSystem.metallicity >= 0 ? `+${transitionSystem.metallicity.toFixed(2)}` : transitionSystem.metallicity.toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {/* Low Zoom Indicator Pill to Return to Galaxy */}
          {zoom <= 0.10 && onBackToGalaxy && !isExitingToGalaxy && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-950/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-indigo-500/50 text-[11px] font-mono text-indigo-200 shadow-xl flex items-center gap-2 pointer-events-none animate-pulse z-10">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Zoom out further or click <strong>&larr; Galaxy Map</strong> to return to galaxy overview</span>
            </div>
          )}

          {/* Spawn Empire Mode Banner */}
          {isSpawnEmpireMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-950/95 backdrop-blur-md border border-amber-500/80 text-amber-200 px-4 py-2.5 rounded-2xl shadow-2xl z-30 font-mono text-xs flex items-center gap-3 animate-fade-in pointer-events-auto">
              <Crown className="w-4 h-4 text-amber-400 animate-bounce flex-shrink-0" />
              <div>
                <strong className="text-white">Spawn Empire Mode Active:</strong> Click any system with a habitable world (<span className="text-emerald-400 font-bold">🟢</span>) to establish capital.
              </div>
              <button
                onClick={() => {
                  setIsSpawnEmpireMode(false);
                  setBannerNotice(null);
                }}
                className="px-2.5 py-1 bg-amber-900/80 hover:bg-amber-800 text-white rounded-lg text-[10.5px] font-bold transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Transient Notification Banner */}
          {!isSpawnEmpireMode && bannerNotice && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-950/95 backdrop-blur-md border border-cyan-500/60 text-slate-200 px-4 py-2 rounded-2xl shadow-2xl z-30 font-mono text-xs flex items-center gap-2.5 animate-fade-in pointer-events-auto">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
              <span>{bannerNotice}</span>
              <button
                onClick={() => setBannerNotice(null)}
                className="text-slate-400 hover:text-white p-0.5 ml-1 transition cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Active Empire Floating Realm Bar */}
          {showUI && empires.length > 0 && !isSpawnEmpireMode && (
            <div className="absolute top-4 right-4 bg-slate-950/90 backdrop-blur-md border border-slate-800/90 px-3 py-2 rounded-2xl text-xs font-mono shadow-2xl z-20 flex items-center gap-3 pointer-events-auto">
              {/* Empire Color & Icon */}
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center text-base border shadow"
                style={{
                  backgroundColor: `${activeEmpire?.color}25`,
                  borderColor: activeEmpire?.color,
                }}
              >
                {activeEmpire?.phenotype.icon}
              </div>

              {/* Empire Selector / Info */}
              <div>
                <div className="flex items-center gap-1.5">
                  {empires.length > 1 ? (
                    <select
                      value={activeEmpire?.id}
                      onChange={(e) => setActiveEmpireId(e.target.value)}
                      className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
                      style={{ color: activeEmpire?.color }}
                    >
                      {empires.map((emp) => (
                        <option key={emp.id} value={emp.id} className="bg-slate-950 text-white">
                          {emp.phenotype.icon} {emp.name} ({emp.claimedSystemIds.length}★)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-bold text-white text-xs truncate max-w-[150px]" style={{ color: activeEmpire?.color }}>
                      {activeEmpire?.name}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400">
                    &bull; {activeEmpire?.claimedSystemIds.length} {activeEmpire?.claimedSystemIds.length === 1 ? 'system' : 'systems'}
                  </span>
                  <span className="text-[9.5px] text-emerald-400/90 bg-emerald-950/60 px-1 py-0.2 rounded border border-emerald-800/60 ml-1">
                    💾 Saved
                  </span>
                </div>
                <div className="text-[9.5px] text-slate-400 flex items-center gap-1 mt-0.5">
                  <span>Shift+Click star to claim</span>
                  <span className="text-slate-600">&bull;</span>
                  <button
                    onClick={handleStartSpawnEmpire}
                    className="text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
                  >
                    + Spawn Another
                  </button>
                </div>
              </div>

              {/* Persistence Actions: Export & Import Backup */}
              <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
                <button
                  onClick={handleExportEmpires}
                  className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-slate-900 rounded-lg transition cursor-pointer"
                  title="Export Empires Backup (.json)"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="p-1.5 text-slate-400 hover:text-emerald-300 hover:bg-slate-900 rounded-lg transition cursor-pointer"
                  title="Import Empires Backup (.json)"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportFile}
                  className="hidden"
                />

                {/* Disband Active Empire */}
                {activeEmpire && (
                  <button
                    onClick={() => handleDeleteEmpire(activeEmpire.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition cursor-pointer"
                    title={`Disband ${activeEmpire.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Clear All Empires in Sector */}
                <button
                  onClick={handleClearSectorEmpires}
                  className="px-1.5 py-1 text-slate-500 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition cursor-pointer text-[9.5px] font-mono"
                  title="Disband all empires in this sector"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Quick Hover Tooltip if hovering a star */}
          {hoveredSystem && (
            <div
              className="absolute top-4 left-4 bg-slate-950/90 backdrop-blur-md border border-slate-700/80 px-3 py-2 rounded-xl text-xs font-mono shadow-2xl pointer-events-none z-10 flex items-center gap-3 animate-fade-in"
            >
              <img
                src={getProceduralStarSpriteDataUrl(
                  hoveredSystem.sysResult?.hierarchy?.stars?.[0] || {
                    spectralType: hoveredSystem.primaryClass,
                    mass: hoveredSystem.primaryMass,
                    Teff: hoveredSystem.teff,
                    colorHex: hoveredSystem.colorHex,
                  },
                  48
                )}
                alt=""
                className="w-5 h-5 shrink-0"
              />
              <div>
                <div className="text-white font-bold flex items-center gap-2">
                  <span>{hoveredSystem.name}</span>
                  <span className="text-[10px] text-cyan-400 bg-cyan-950/60 px-1 rounded border border-cyan-800">
                    Sector {hoveredSystem.coord}
                  </span>
                  {hoveredSystem.nStars > 1 && (
                    <span className="text-[9.5px] text-blue-300 bg-blue-950/70 px-1 rounded border border-blue-800">
                      {hoveredSystem.nStars}★ Multiple
                    </span>
                  )}
                  {universeCache.hasCachedSystem(hoveredSystem.id) && (
                    <span className="text-[9.5px] text-emerald-300 bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-500/60 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Cached
                    </span>
                  )}
                  {(() => {
                    const hEmpire = empireMap.get(hoveredSystem.id);
                    if (!hEmpire) return null;
                    return (
                      <span
                        className="text-[9.5px] px-1 py-0.2 rounded border font-semibold flex items-center gap-1"
                        style={{
                          color: hEmpire.color,
                          borderColor: `${hEmpire.color}60`,
                          backgroundColor: `${hEmpire.color}20`,
                        }}
                      >
                        {hEmpire.phenotype.icon} {hEmpire.name}
                      </span>
                    );
                  })()}
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-2">
                  <span>{hoveredSystem.primaryClass}</span>
                  <span>&bull;</span>
                  <span>Star A: {hoveredSystem.primaryMass.toFixed(2)} M☉</span>
                  <span>&bull;</span>
                  <span>Sys: {hoveredSystem.mass.toFixed(2)} M☉</span>
                  <span>&bull;</span>
                  <span>{hoveredSystem.planetCount}p</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================================ */}
        {/* RIGHT SIDEBAR: DEEP HEX SYSTEM INSPECTOR & TUPLET LAUNCHER                   */}
        {/* ============================================================================ */}
        <SectorSystemInspector
          showUI={showUI}
          selectedSystem={selectedSystem}
          selectedCoord={selectedCoord}
          gridData={gridData}
          empires={empires}
          activeEmpire={activeEmpire}
          systemTraitsMap={systemTraitsMap}
          onLaunchSystemGenerator={handleLaunchSystemGenerator}
          onOpenSystemEditor={(sys) => {
            setSystemToEdit(sys);
            setIsSystemEditorOpen(true);
          }}
          onDeleteSystem={handleDeleteSystem}
          onOpenSpawnEmpireModal={(sys) => {
            setEmpireTargetSystem(sys);
            setIsEmpireModalOpen(true);
          }}
          onClaimToggle={handleClaimToggle}
          onSelectSystem={(sys) => {
            setSelectedSystem(sys);
            setSelectedCoord(sys.coord);
          }}
          onOpenSectorExportModal={() => setShowSectorExportModal(true)}
          onPlaceNewSystem={handlePlaceNewSystem}
        />
      </div>

      {/* Spawn Alien Empire Dialog Modal */}
      <SpawnEmpireModal
        isOpen={isEmpireModalOpen}
        onClose={() => {
          setIsEmpireModalOpen(false);
          setEmpireTargetSystem(null);
        }}
        homeworldSystem={empireTargetSystem}
        existingEmpires={empires}
        onFoundEmpire={handleFoundEmpire}
      />

      {/* Sector Export / Import Manager Modal */}
      <SectorExportImportModal
        isOpen={showSectorExportModal}
        onClose={() => setShowSectorExportModal(false)}
        gridData={gridData}
        empires={empires}
        activeEmpireId={activeEmpireId}
        onImportSector={handleImportSector}
      />

      {/* Universal Star & Planet Architect Modal */}
      {isSystemEditorOpen && (systemToEdit || selectedSystem) && (
        <SystemEditorModal
          isOpen={isSystemEditorOpen}
          systemResult={(systemToEdit || selectedSystem)!.sysResult}
          sectorSystem={systemToEdit || selectedSystem}
          onSave={handleSaveEditedSystem}
          onClose={() => {
            setIsSystemEditorOpen(false);
            setSystemToEdit(null);
          }}
        />
      )}
    </div>
  );
};
