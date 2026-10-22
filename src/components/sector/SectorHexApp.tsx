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
  Route,
  Crown,
  Compass,
  Shield,
  Flag,
  Trash2,
  Download,
  Upload,
  Tag,
  ChevronDown,
  Cloud,
  Save,
} from 'lucide-react';
import {
  SectorHexConfig,
  SectorHexGridData,
  SectorHexSystem,
  type SectorHyperlane,
  DEFAULT_SECTOR_CONFIG,
  generateSectorHexGrid,
  isNonMainSequenceSystem,
  isBlackHoleStar,
  isSupermassiveBlackHole,
  hasWaterWorld,
  hasAmmoniaWorld,
  hasMulticellularLife,
  hasTerrestrialLife,
  hasTerrestrialBiosphere,
} from '../../core/generation/sectorHex';
import {
  getProceduralStarSpriteDataUrl,
  getStarAssetPath,
  type StarAssetDescriptor,
} from '../../core/generation/starAssets';
import { BlackHoleIcon } from '../ui/BlackHoleIcon';
import { GenerationLoadingOverlay, yieldToMainThread } from '../ui/GenerationLoadingOverlay';
import {
  SectorEmpire,
  loadEmpiresForSector,
  saveEmpiresForSector,
  loadLastSectorConfig,
  saveLastSectorConfig,
  downloadEmpiresJSON,
  importEmpiresFromJSON,
  parsePlanetKey,
} from '../../core/generation/empireGen';
import { SpawnEmpireModal } from './SpawnEmpireModal';
import { SectorExportImportModal } from './SectorExportImportModal';
import { ParsedSectorImportResult } from '../../core/export/sectorFormatExporters';
import { StarGenParams } from '../../core/generation/realisticStarGen';
import { SpectralCategory } from '../../types/astrophysics';
import { universeCache } from '../../core/storage/universeCache';

interface SectorHexAppProps {
  onLaunchStarGen: (params: StarGenParams, coord?: string) => void;
  onBackToGalaxy?: () => void;
  initialConfig?: Partial<SectorHexConfig> | null;
  initialSelectedCoord?: string | null;
  returnTransition?: boolean;
  showUI?: boolean;
}

export type SectorFilterCategory =
  | 'all'
  | SpectralCategory
  | 'habitable'
  | 'water-world'
  | 'ammonia-world'
  | 'multicellular'
  | 'terrestrial-life'
  | 'non-ms'
  | 'mass';

export type MassFilterBracket =
  | 'all'
  | 'low' // < 0.8 M☉
  | 'solar' // 0.8 - 2.0 M☉
  | 'intermediate' // 2.0 - 8.0 M☉
  | 'massive' // > 8.0 M☉
  | 'giant' // 10 - 50 M☉
  | 'supermassive' // > 999,999 M☉
  | 'custom';

type SectorPresetKey = 'disk' | 'young-cluster' | 'old-halo' | 'dense-core' | 'galactic-nucleus';

interface SectorPreset {
  id: SectorPresetKey;
  label: string;
  description: string;
  density: number;
  meanAge: number;
  ageSigma: number;
  metallicityMean: number;
  metallicitySigma: number;
  coord?: string;
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
  {
    id: 'galactic-nucleus',
    label: 'Galactic Nucleus (2525)',
    description: 'Center of galaxy (Sector 2525) with 1,000,000 M☉ Supermassive Black Hole (Sagittarius A*), S-stars, and relativistic debris.',
    density: 1.25,
    meanAge: 8.5,
    ageSigma: 2.2,
    metallicityMean: 0.25,
    metallicitySigma: 0.18,
    coord: '2525',
  },
];

const getBiosphereDisplay = (sys: SectorHexSystem): string => {
  const zones = sys.sysResult?.zones;
  if (zones && zones.length > 0) {
    let bioCount = 0;
    let hasWaterBio = false;
    let hasAmmoniaBio = false;
    let hasMultiBio = false;
    let hasTerrestrialBio = false;

    for (const zone of zones) {
      for (const body of zone.bodies) {
        if (body.kind === 'planet') {
          if (body.hydrosphere?.biosphere) {
            bioCount++;
            const solv = (body.hydrosphere.solvent || '').toLowerCase();
            const bio = body.hydrosphere.biosphere.toLowerCase();
            if (solv.includes('nh3') || solv.includes('ammonia') || bio.includes('ammonia')) {
              hasAmmoniaBio = true;
            } else {
              hasWaterBio = true;
            }
            if (bio.includes('multicellular')) {
              hasMultiBio = true;
            }
            if (hasTerrestrialBiosphere(body.planetClass, body.hydrosphere)) {
              hasTerrestrialBio = true;
            }
          }
          if (body.moons) {
            for (const moon of body.moons) {
              if (moon.hydrosphere?.biosphere) {
                bioCount++;
                const solv = (moon.hydrosphere.solvent || '').toLowerCase();
                const bio = moon.hydrosphere.biosphere.toLowerCase();
                if (solv.includes('nh3') || solv.includes('ammonia') || bio.includes('ammonia')) {
                  hasAmmoniaBio = true;
                } else {
                  hasWaterBio = true;
                }
                if (bio.includes('multicellular')) {
                  hasMultiBio = true;
                }
                if (hasTerrestrialBiosphere(moon.moonClass, moon.hydrosphere)) {
                  hasTerrestrialBio = true;
                }
              }
            }
          }
        }
      }
    }

    if (bioCount === 0) {
      return '<none>';
    }
    const kindLabel =
      hasWaterBio && hasAmmoniaBio
        ? 'water & ammonia'
        : hasAmmoniaBio
        ? 'ammonia'
        : 'water';
    const complexity = hasMultiBio ? 'multicellular' : 'unicellular';
    const terrestrialNote = hasTerrestrialBio ? ', terrestrial' : '';
    return `${bioCount} ${kindLabel} (${complexity}${terrestrialNote})`;
  }

  return '<none>';
};

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
  const [filterCat, setFilterCat] = useState<SectorFilterCategory>('all');
  const [massBracket, setMassBracket] = useState<MassFilterBracket>('all');
  const [customMinMass, setCustomMinMass] = useState<string>('0.1');
  const [customMaxMass, setCustomMaxMass] = useState<string>('50.0');
  const [showMassMenu, setShowMassMenu] = useState<boolean>(false);

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

  // Pre-indexed O(1) lookup table for planetary filter flags & biosphere summary per system
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
      map.set(sys.id, {
        hasWater: hasWaterWorld(sys),
        hasAmmonia: hasAmmoniaWorld(sys),
        hasMulti: hasMulticellularLife(sys),
        hasTerrestrial: hasTerrestrialLife(sys),
        isNonMs: isNonMainSequenceSystem(sys),
        biosphereDisplay: getBiosphereDisplay(sys),
      });
    }
    return map;
  }, [gridData.systems]);

  // Dynamic filter matching count
  const matchingStarsCount = useMemo(() => {
    return gridData.systems.filter((system) => {
      if (filterCat === 'all') return true;
      if (filterCat === 'habitable') return system.candidateHabitable;
      const traits = systemTraitsMap.get(system.id);
      if (filterCat === 'water-world') return traits ? traits.hasWater : hasWaterWorld(system);
      if (filterCat === 'ammonia-world') return traits ? traits.hasAmmonia : hasAmmoniaWorld(system);
      if (filterCat === 'multicellular') return traits ? traits.hasMulti : hasMulticellularLife(system);
      if (filterCat === 'terrestrial-life') return traits ? traits.hasTerrestrial : hasTerrestrialLife(system);
      if (filterCat === 'non-ms') return traits ? traits.isNonMs : isNonMainSequenceSystem(system);
      if (filterCat === 'mass') {
        if (massBracket === 'low') return system.mass < 0.8;
        if (massBracket === 'solar') return system.mass >= 0.8 && system.mass <= 2.0;
        if (massBracket === 'intermediate') return system.mass > 2.0 && system.mass <= 8.0;
        if (massBracket === 'massive') return system.mass > 8.0 && system.mass <= 999999;
        if (massBracket === 'giant') return system.isGiantSystem || (system.mass >= 10.0 && system.mass <= 50.0);
        if (massBracket === 'supermassive') return system.mass > 999999;
        if (massBracket === 'custom') {
          const minM = parseFloat(customMinMass) || 0;
          const maxM = parseFloat(customMaxMass) || 1000000;
          return system.mass >= minM && system.mass <= maxM;
        }
        return true;
      }
      return system.spectralCat === filterCat;
    }).length;
  }, [gridData.systems, systemTraitsMap, filterCat, massBracket, customMinMass, customMaxMass]);

  const getMassFilterButtonLabel = () => {
    if (filterCat !== 'mass') return 'Mass ▾';
    if (massBracket === 'low') return 'Mass: <0.8M☉';
    if (massBracket === 'solar') return 'Mass: 0.8-2M☉';
    if (massBracket === 'intermediate') return 'Mass: 2-8M☉';
    if (massBracket === 'massive') return 'Mass: >8M☉';
    if (massBracket === 'giant') return 'Mass: 10-50M☉';
    if (massBracket === 'supermassive') return 'Mass: >999kM☉';
    if (massBracket === 'custom') return `Mass: ${customMinMass}-${customMaxMass}M☉`;
    return 'Mass: All ▾';
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

  // Copied state
  const [copiedId, setCopiedId] = useState<boolean>(false);

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

  // Connected hyperlanes for currently selected system
  const connectedLanes: SectorHyperlane[] = useMemo(() => {
    if (!selectedSystem || !gridData.hyperlanes) return [];
    return gridData.hyperlanes.filter(
      (l) => l.sourceId === selectedSystem.id || l.targetId === selectedSystem.id
    );
  }, [selectedSystem, gridData.hyperlanes]);

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

  const handleMouseUp = () => {
    setIsDragging(false);
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
        : +(clampedAgeRange / 3.2).toFixed(2);

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

  // Copy ID
  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1800);
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
      {showUI && (
        <div className="w-full px-4 py-2.5 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 z-20">
        {/* Back to Galaxy Map button if opened from GalaxyGen */}
        {onBackToGalaxy && (
          <button
            onClick={handleBackToGalaxyWithTransition}
            className="px-2.5 py-1.5 rounded-xl bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/80 flex items-center gap-1.5 cursor-pointer transition shadow text-xs font-mono font-bold group"
            title="Return to 50x50 Galaxy Sector Map (Hotkey: Page Up)"
          >
            <span className="group-hover:-translate-x-0.5 transition-transform">&larr;</span>
            <span>Galaxy Map</span>
            <kbd className="px-1.5 py-0.5 text-[9px] bg-slate-900/90 border border-indigo-500/50 rounded text-indigo-300 font-sans font-normal ml-0.5">
              PgUp
            </kbd>
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
                {isFromCache && (
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800 flex items-center gap-1 shadow-sm"
                    title="Sector state restored from persistent universe cache"
                  >
                    <span>💾</span>
                    <span>Cached Sector</span>
                  </span>
                )}
              </h2>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
              <span className="text-cyan-300 font-semibold">{config.columns}&times;{config.rows} Hex Grid</span>
              <span className="text-slate-600">&bull;</span>
              <span>{gridData.stats.occupiedHexes.toLocaleString()} Systems ({gridData.stats.occupancyPct}% density)</span>
              <span className="text-slate-600">&bull;</span>
              <span className="flex items-center gap-1.5 font-mono">
                <span className="w-2.5 h-2.5 rounded-full border border-white/40 shadow-sm" style={{ backgroundColor: gridData.integratedColorHex }} />
                <span>Sector Integrated Light: <strong style={{ color: gridData.integratedColorHex }}>{gridData.integratedColorHex}</strong></span>
              </span>
              {gridData.hasNebula && (
                <>
                  <span className="text-slate-600">&bull;</span>
                  <span className="text-fuchsia-300 font-semibold bg-fuchsia-950/70 border border-fuchsia-800/80 px-2 py-0.5 rounded-full text-[10.5px] flex items-center gap-1 shadow-sm">
                    <span>🌌</span>
                    <span>{gridData.nebula?.name || 'Nebula Noise Clouds'}</span>
                  </span>
                </>
              )}
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

        {/* Sector Dimensions, Density & Star Count Button */}
        <button
          onClick={() => setShowConfigModal(true)}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 hover:border-cyan-500 text-xs font-mono font-medium flex items-center gap-2 transition shadow cursor-pointer"
          title="Customize Sector Scale (up to 100x100), Density, Age & Metallicity"
        >
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span>Scale: <strong className="text-white">{config.columns}&times;{config.rows}</strong></span>
          <span className="text-slate-500">&bull;</span>
          <span>Density: <strong className={config.density > 1.0 ? 'text-amber-300 font-bold' : 'text-emerald-300'}>{Math.round(config.density * 100)}%{config.density > 1.0 ? ' (Overdensity)' : ''}</strong></span>
          <span className="text-slate-500">&bull;</span>
          <span>Stars: <strong className="text-cyan-300">{gridData.systems.length}</strong></span>
          <span className="text-slate-500">&bull;</span>
          <span className="hidden md:inline">Age: <strong className="text-cyan-300">{config.meanAge.toFixed(1)} Gyr{config.ageRange ? ` (±${(config.ageRange / 2).toFixed(1)} Gyr${config.ageDistribution === 'uniform' ? ', Uniform' : ''})` : ''}</strong></span>
        </button>

        {/* Search Star or Coordinate */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search star or coord (e.g. 0408, Centauri)..."
              value={searchCoord}
              onChange={(e) => setSearchCoord(e.target.value)}
              className="w-56 pl-8 pr-2 py-1 text-xs font-mono bg-slate-900/90 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
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
          {/* Spawn Empire Button */}
          <button
            onClick={handleStartSpawnEmpire}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg transition cursor-pointer ${
              isSpawnEmpireMode
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/30 ring-2 ring-amber-300 animate-pulse'
                : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-emerald-500/25'
            }`}
            title="Establish an alien empire on a system with a habitable world"
          >
            <Crown className="w-3.5 h-3.5" />
            <span>{isSpawnEmpireMode ? 'Select Habitable Star...' : 'Spawn Empire'}</span>
          </button>

          <button
            onClick={handleRollNewSector}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 transition cursor-pointer"
            title="Generate a brand new randomized stellar sector"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Roll New Sector</span>
          </button>

          <button
            onClick={() => setShowSectorExportModal(true)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-700/80 hover:border-cyan-500 text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg transition cursor-pointer"
            title="Export or Import Individual Sector (Stargen Sector JSON, Stellaris Static Galaxy .txt, or SpaceEngine .sc)"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export / Import Sector</span>
          </button>

          <button
            onClick={() => {
              const galConfig = universeCache.getActiveGalaxyConfig();
              const secCount = universeCache.getLoadedSectorCount();
              const sysCount = universeCache.getLoadedSystemCount();
              const saved = universeCache.saveCurrentUniverse(
                galConfig,
                galConfig.name || `Galaxy Seed #${galConfig.seed}`,
                `Saved from Sector ${config.name || config.coord || ''} with ${secCount} sectors and ${sysCount} systems.`
              );
              setBannerNotice(`💾 Saved Universe & Galaxy (Seed #${saved.seed}) with ${secCount} sectors & ${sysCount} systems!`);
            }}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
            title="Save Galaxy & Universe: persists galaxy parameters, seeds, and all cached sectors & star systems"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save Galaxy</span>
          </button>
        </div>
      </div>
      )}

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

            {/* Average Stellar Age & Age Range */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
              <div>
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
                {draftAge < 1.0 && (
                  <div className="mt-1.5 p-1.5 rounded bg-fuchsia-950/60 border border-fuchsia-800/60 text-[10px] text-fuchsia-300 flex items-center gap-1.5">
                    <span>🌌</span>
                    <span>Young Sector (&lt;1.0 Gyr): Qualifies for procedural purple-red H-II emission nebulae clouds.</span>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800/80 pt-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-400">Stellar Age Range (Spread):</span>
                  <span className="text-cyan-300 font-bold">&plusmn;{(draftAgeRange / 2).toFixed(1)} Gyr ({draftAgeRange.toFixed(1)} Gyr span)</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={12.0}
                  step={0.1}
                  value={draftAgeRange}
                  onChange={(e) => setDraftAgeRange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex items-center justify-between text-[9.5px] text-slate-500 mt-1">
                  <span>Narrow (Halo / Arms &plusmn;0.6 Gyr)</span>
                  <span>Wide (Bulge &plusmn;5.6 Gyr)</span>
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-2 flex items-center justify-between">
                <span className="text-slate-400 text-xs">Age Distribution:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setDraftAgeDistribution('normal')}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                      draftAgeDistribution === 'normal'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Normal (Gaussian)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftAgeDistribution('uniform')}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                      draftAgeDistribution === 'uniform'
                        ? 'bg-amber-600 text-white font-bold'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Uniform (Bulge)
                  </button>
                </div>
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

            {/* Background Atmosphere: Plain Black vs Nebula Noise Clouds */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-slate-400">Background Atmosphere:</span>
                <span className={`font-bold text-xs ${draftHasNebula ? 'text-fuchsia-300' : 'text-slate-300'}`}>
                  {draftHasNebula ? 'Nebula Noise Clouds' : 'Plain Black Space'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDraftHasNebula(false)}
                  className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                    !draftHasNebula
                      ? 'bg-slate-800 text-white border-slate-600 shadow'
                      : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Plain Black
                </button>
                <button
                  type="button"
                  onClick={() => setDraftHasNebula(true)}
                  className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                    draftHasNebula
                      ? 'bg-fuchsia-950/70 text-fuchsia-200 border-fuchsia-600 shadow'
                      : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Noise Clouds
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">
                {draftHasNebula
                  ? 'Active H-II ionization clouds and fractal dust fill the sector background.'
                  : 'Deep space plain black background devoid of emission nebulae.'}
              </p>
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
                onClick={() =>
                  handleApplyCustomGrid(
                    draftCols,
                    draftRows,
                    draftDensity,
                    draftAge,
                    draftAgeRange,
                    draftAgeDistribution,
                    draftFeh,
                    draftSeed,
                    draftHasNebula
                  )
                }
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
              <filter id="nebula-soft-blur" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="36" result="blur" />
              </filter>
              <filter id="nebula-dust-blur" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="7" result="blur" />
              </filter>
              <filter id="sector-noise-clouds" x="0%" y="0%" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.0028" numOctaves="4" seed={config.seed} result="noise" />
                <feColorMatrix type="matrix" values="
                  0.95 0    0    0 0.18
                  0    0.15 0    0 0.02
                  0.5  0    0.85 0 0.22
                  0    0    0    0.38 0" result="coloredNoise" />
              </filter>

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

              {/* Clipped Environment: Nebula Noise Clouds & Parsec Coordinates */}
              <g clipPath="url(#sector-hex-clip)">
                {/* Procedural H-II Purple-Red Cloud Nebula & Fractal Noise Clouds */}
                {gridData.hasNebula && showNebulae && (
                  <g className="sector-nebula-layer pointer-events-none">
                    {/* Fractal Noise Clouds Atmosphere */}
                    <rect
                      x={0}
                      y={0}
                      width={gridData.sectorWidth}
                      height={gridData.sectorHeight}
                      filter="url(#sector-noise-clouds)"
                      opacity={0.65}
                      style={{ mixBlendMode: 'screen' }}
                    />
                    {gridData.nebula && (
                      <g style={{ mixBlendMode: 'screen' }}>
                        {gridData.nebula.blobs.map((blob, idx) => (
                          <ellipse
                            key={`nebula-blob-${idx}`}
                            cx={blob.cx}
                            cy={blob.cy}
                            rx={blob.rx}
                            ry={blob.ry}
                            transform={`rotate(${blob.rotation}, ${blob.cx}, ${blob.cy})`}
                            fill={`url(#nebula-blob-grad-${idx})`}
                            filter="url(#nebula-soft-blur)"
                          />
                        ))}
                        {/* Subtle dark interstellar dust absorption filaments */}
                        {gridData.nebula.dustLanes.map((dust, idx) => (
                          <line
                            key={`nebula-dust-${idx}`}
                            x1={dust.x1}
                            y1={dust.y1}
                            x2={dust.x2}
                            y2={dust.y2}
                            stroke="#05030a"
                            strokeWidth={dust.strokeWidth}
                            opacity={dust.opacity}
                            strokeLinecap="round"
                            filter="url(#nebula-dust-blur)"
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

                // Filter check (O(1) pre-indexed traits lookup)
                let matchesFilter = true;
                if (filterCat !== 'all') {
                  if (filterCat === 'habitable') {
                    matchesFilter = system.candidateHabitable;
                  } else if (filterCat === 'water-world') {
                    matchesFilter = systemTraitsMap.get(system.id)?.hasWater ?? hasWaterWorld(system);
                  } else if (filterCat === 'ammonia-world') {
                    matchesFilter = systemTraitsMap.get(system.id)?.hasAmmonia ?? hasAmmoniaWorld(system);
                  } else if (filterCat === 'multicellular') {
                    matchesFilter = systemTraitsMap.get(system.id)?.hasMulti ?? hasMulticellularLife(system);
                  } else if (filterCat === 'terrestrial-life') {
                    matchesFilter = systemTraitsMap.get(system.id)?.hasTerrestrial ?? hasTerrestrialLife(system);
                  } else if (filterCat === 'non-ms') {
                    matchesFilter = systemTraitsMap.get(system.id)?.isNonMs ?? isNonMainSequenceSystem(system);
                  } else if (filterCat === 'mass') {
                    if (massBracket === 'low') {
                      matchesFilter = system.mass < 0.8;
                    } else if (massBracket === 'solar') {
                      matchesFilter = system.mass >= 0.8 && system.mass <= 2.0;
                    } else if (massBracket === 'intermediate') {
                      matchesFilter = system.mass > 2.0 && system.mass <= 8.0;
                    } else if (massBracket === 'massive') {
                      matchesFilter = system.mass > 8.0 && system.mass <= 999999;
                    } else if (massBracket === 'giant') {
                      matchesFilter = system.isGiantSystem || (system.mass >= 10.0 && system.mass <= 50.0);
                    } else if (massBracket === 'supermassive') {
                      matchesFilter = system.mass > 999999;
                    } else if (massBracket === 'custom') {
                      const minM = parseFloat(customMinMass) || 0;
                      const maxM = parseFloat(customMaxMass) || 1000000;
                      matchesFilter = system.mass >= minM && system.mass <= maxM;
                    } else {
                      matchesFilter = true;
                    }
                  } else {
                    matchesFilter = system.spectralCat === filterCat;
                  }
                }

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
                    {universeCache.hasCachedSystem(system.id) && (
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
          {showUI && (
            <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-10 pointer-events-auto">
              {/* Spectral Filter Chips Bar */}
              <div className="flex flex-wrap items-center gap-1 bg-slate-950/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-800 shadow-xl text-xs font-mono">
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
                  { id: 'non-ms', label: 'Non-MS (≠ V)', color: 'text-amber-400', title: 'Non-Main Sequence Stars (Luminosity Class NOT V: Giants, Supergiants, Subgiants, Remnants)' },
                  { id: 'water-world', label: 'Water Worlds', color: 'text-sky-400', title: 'Systems with liquid-water (H2O / aqueous brine) worlds or moons' },
                  { id: 'ammonia-world', label: 'Ammonia Worlds', color: 'text-teal-300', title: 'Systems with Cryo-Ammonia (NH3-H2O) worlds or moons' },
                  { id: 'multicellular', label: 'Multicellular Life', color: 'text-emerald-400', title: 'Systems harboring worlds or moons with active multicellular biospheres' },
                  { id: 'terrestrial-life', label: 'Terrestrial Life', color: 'text-lime-400', title: 'Systems harboring worlds or moons with active land-based / continental terrestrial life' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setFilterCat(f.id);
                    setShowMassMenu(false);
                  }}
                  title={'title' in f ? f.title : undefined}
                  className={`px-2 py-0.5 rounded text-[10px] transition cursor-pointer ${
                    filterCat === f.id
                      ? 'bg-cyan-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span className={filterCat === f.id ? 'text-white' : f.color}>{f.label}</span>
                </button>
              ))}

              {/* Mass Filter Button with Interactive Popover */}
              <div className="relative">
                <button
                  onClick={() => {
                    setFilterCat('mass');
                    setShowMassMenu((prev) => !prev);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] transition cursor-pointer flex items-center gap-1 ${
                    filterCat === 'mass'
                      ? 'bg-indigo-600 text-white font-bold shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Filter systems by Stellar Mass"
                >
                  <span className={filterCat === 'mass' ? 'text-white' : 'text-indigo-400 font-semibold'}>
                    {getMassFilterButtonLabel()}
                  </span>
                  <ChevronDown className="w-2.5 h-2.5 opacity-70" />
                </button>

                {/* Mass Filter Popover Dropdown */}
                {showMassMenu && (
                  <div
                    className="absolute bottom-full left-0 mb-2 w-72 bg-slate-950/98 backdrop-blur-xl border border-slate-700/80 rounded-xl p-3 shadow-2xl z-50 font-mono text-xs flex flex-col gap-2.5 animate-fade-in"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                      <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                        <Sliders className="w-3 h-3 text-indigo-400" />
                        <span>Filter by Stellar Mass</span>
                      </span>
                      <button
                        onClick={() => setShowMassMenu(false)}
                        className="text-slate-400 hover:text-white transition p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Quick Mass Presets */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[9.5px] uppercase text-slate-500 font-semibold">Mass Presets</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { id: 'all', label: 'All Masses', sub: 'Reset mass filter' },
                          { id: 'low', label: '< 0.8 M☉', sub: 'Low Mass / Red Dwarfs' },
                          { id: 'solar', label: '0.8 – 2.0 M☉', sub: 'Solar & Intermediate' },
                          { id: 'intermediate', label: '2.0 – 8.0 M☉', sub: 'Intermediate Stars' },
                          { id: 'massive', label: '> 8.0 M☉', sub: 'Massive Stars' },
                          { id: 'giant', label: '10 – 50 M☉', sub: 'Giant Star Systems' },
                          { id: 'supermassive', label: '> 999k M☉', sub: 'Sagittarius A* SMBH' },
                        ].map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setMassBracket(p.id as MassFilterBracket);
                              setFilterCat('mass');
                            }}
                            className={`p-1.5 rounded-lg border text-left transition cursor-pointer ${
                              massBracket === p.id && filterCat === 'mass'
                                ? 'bg-indigo-950/90 border-indigo-500 text-white shadow-sm'
                                : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            <div className="text-[10.5px] font-bold">{p.label}</div>
                            <div className="text-[8.5px] text-slate-400 truncate">{p.sub}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Min / Max Inputs */}
                    <div className="border-t border-slate-800 pt-2 flex flex-col gap-1.5">
                      <span className="text-[9.5px] uppercase text-slate-500 font-semibold">Custom Mass Range (M☉)</span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <span className="text-[9px] text-slate-500 block">Min</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0.08"
                            value={customMinMass}
                            onChange={(e) => {
                              setCustomMinMass(e.target.value);
                              setMassBracket('custom');
                              setFilterCat('mass');
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <span className="text-slate-600 mt-3">&mdash;</span>
                        <div className="flex-1">
                          <span className="text-[9px] text-slate-500 block">Max</span>
                          <input
                            type="number"
                            step="0.5"
                            min="0.1"
                            value={customMaxMass}
                            onChange={(e) => {
                              setCustomMaxMass(e.target.value);
                              setMassBracket('custom');
                              setFilterCat('mass');
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px]">
                      <button
                        onClick={() => {
                          setMassBracket('all');
                          setFilterCat('all');
                          setShowMassMenu(false);
                        }}
                        className="text-slate-400 hover:text-white transition"
                      >
                        Reset All
                      </button>
                      <button
                        onClick={() => setShowMassMenu(false)}
                        className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Active matching count badge */}
              {filterCat !== 'all' && (
                <span className="text-[9.5px] text-cyan-300 bg-cyan-950/70 border border-cyan-800/80 px-1.5 py-0.5 rounded ml-1 font-bold">
                  {matchingStarsCount} / {gridData.systems.length}
                </span>
              )}
            </div>

            {/* Canvas Zoom & Reset Controls */}
            <div className="flex items-center gap-1.5 bg-slate-950/90 backdrop-blur-md px-2 py-1.5 rounded-xl border border-slate-800 shadow-xl text-xs font-mono w-fit">
              <button
                onClick={() => {
                  if (containerRef.current) {
                    const rect = containerRef.current.getBoundingClientRect();
                    zoomAtScreenPoint(rect.width / 2, rect.height / 2, 1.25);
                  } else {
                    setZoom((z) => Math.min(2.8, z * 1.25));
                  }
                }}
                className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (zoom <= 0.085 && onBackToGalaxy) {
                    handleBackToGalaxyWithTransition();
                  } else if (containerRef.current) {
                    const rect = containerRef.current.getBoundingClientRect();
                    zoomAtScreenPoint(rect.width / 2, rect.height / 2, 0.8);
                  } else {
                    setZoom((z) => Math.max(0.06, z * 0.8));
                  }
                }}
                className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition cursor-pointer"
                title={zoom <= 0.085 && onBackToGalaxy ? 'Zoom out to return to Galaxy Map' : 'Zoom Out (-)'}
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
              <div className="w-[1px] h-3.5 bg-slate-800 mx-0.5" />
              <button
                onClick={() => setShowHyperlanes((v) => !v)}
                className={`px-2 py-1 hover:bg-slate-800 rounded text-[10.5px] transition flex items-center gap-1 ${
                  showHyperlanes
                    ? 'text-cyan-400 bg-cyan-950/40 border border-cyan-800/60'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Toggle Procedural Hyperlanes"
              >
                <Route className="w-3.5 h-3.5" />
                <span>Lanes {showHyperlanes ? 'ON' : 'OFF'}</span>
              </button>
              <div className="w-[1px] h-3.5 bg-slate-800 mx-0.5" />
              <button
                onClick={() => setShowHexBoundaries((v) => !v)}
                className={`px-2 py-1 hover:bg-slate-800 rounded text-[10.5px] transition flex items-center gap-1 ${
                  showHexBoundaries
                    ? 'text-cyan-400 bg-cyan-950/40 border border-cyan-800/60'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Toggle System Influence Boundaries"
              >
                <Hexagon className="w-3.5 h-3.5" />
                <span>Boundaries</span>
              </button>
              <button
                onClick={() => setShowLabels((v) => !v)}
                className={`px-2 py-1 hover:bg-slate-800 rounded text-[10.5px] transition flex items-center gap-1 ${
                  showLabels
                    ? 'text-cyan-400 bg-cyan-950/40 border border-cyan-800/60'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Toggle Star System & Coordinate Labels"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Labels</span>
              </button>
              <button
                onClick={() => {
                  if (gridData.hasNebula) {
                    setShowNebulae((v) => !v);
                  } else {
                    setConfig((prev) => ({ ...prev, hasNebula: true }));
                    setShowNebulae(true);
                  }
                }}
                className={`px-2 py-1 hover:bg-slate-800 rounded text-[10.5px] transition flex items-center gap-1 ${
                  gridData.hasNebula && showNebulae
                    ? 'text-fuchsia-400 bg-fuchsia-950/40 border border-fuchsia-800/60'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title={
                  gridData.hasNebula
                    ? (showNebulae ? 'Toggle Noise Clouds Off' : 'Toggle Noise Clouds On')
                    : 'Plain Black Background (Click to enable Noise Clouds)'
                }
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>{gridData.hasNebula ? (showNebulae ? 'Noise Clouds' : 'Clouds Hidden') : 'Plain Black'}</span>
              </button>
              <span className="text-[10px] text-slate-500 pl-1">
                {Math.round(zoom * 100)}%
              </span>
              {sectorCachedCount > 0 && (
                <div
                  className="px-2 py-0.5 rounded-full text-[10px] font-mono flex items-center gap-1.5 text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 ml-1"
                  title={`${sectorCachedCount} star system${sectorCachedCount === 1 ? '' : 's'} in this sector explored and cached in universe storage`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{sectorCachedCount} Cached</span>
                </div>
              )}
            </div>
          </div>
          )}

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
        {showUI && (
          <div
            className="w-[380px] h-full flex flex-col bg-slate-950/95 border-l border-slate-800 flex-shrink-0 z-10 overflow-y-auto contain-layout-panel"
            style={{ containIntrinsicSize: 'auto 380px auto 800px' }}
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
                    {isBlackHoleStar({ category: selectedSystem.remnantType || '', spectralType: selectedSystem.primaryClass }) ? (
                      <BlackHoleIcon
                        isSupermassive={selectedSystem.mass > 999999}
                        size={32}
                      />
                    ) : (
                      <img
                        src={getProceduralStarSpriteDataUrl(
                          selectedSystem.sysResult?.hierarchy?.stars?.[0] || {
                            spectralType: selectedSystem.primaryClass,
                            mass: selectedSystem.primaryMass,
                            Teff: selectedSystem.teff,
                            colorHex: selectedSystem.colorHex,
                          },
                          96
                        )}
                        alt={selectedSystem.name}
                        className="w-9 h-9 select-none"
                      />
                    )}
                    {selectedSystem.candidateHabitable && (
                      <div
                        className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border border-slate-950 flex items-center justify-center text-[9px] text-white font-bold"
                        title={
                          selectedSystem.habitableTypes && selectedSystem.habitableTypes.length > 0
                            ? `Candidate Habitable World / Biosphere (${selectedSystem.habitableTypes.join(', ')})`
                            : 'Candidate Habitable World / Biosphere'
                        }
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
                        Sector {selectedSystem.coord} &bull; {selectedSystem.parsecX} pc, {selectedSystem.parsecY} pc
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
                      {selectedSystem.mass > 999999 && (
                        <span className="text-[10px] text-purple-300 bg-purple-950/80 px-1.5 py-0.2 rounded border border-purple-800 font-bold flex items-center gap-1">
                          <span>🌀</span>
                          <span>Supermassive Black Hole {selectedSystem.mass.toLocaleString()} M☉</span>
                        </span>
                      )}
                      {isNonMainSequenceSystem(selectedSystem) && (
                        <span className="text-[10px] text-fuchsia-300 bg-fuchsia-950/80 px-1.5 py-0.2 rounded border border-fuchsia-800 font-bold">
                          Non-MS
                        </span>
                      )}
                      {universeCache.hasCachedSystem(selectedSystem.id) && (
                        <span className="text-[10px] text-emerald-300 bg-emerald-950/90 px-1.5 py-0.2 rounded border border-emerald-500/70 font-bold flex items-center gap-1 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Explored & Cached</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ============================================================================ */}
              {/* SYSTEM STATS CARD                                                            */}
              {/* ============================================================================ */}
              <div className="p-3.5 rounded-xl bg-gradient-to-br from-indigo-950/50 via-slate-900 to-slate-950 border border-cyan-500/40 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between pb-2 border-b border-cyan-900/40 mb-3">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>System Stats</span>
                  </div>
                </div>

                {/* 2x2 Grid of the 4 Values */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  {/* Mass */}
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Mass</div>
                    <div className="text-sm font-bold text-amber-300 mt-0.5">
                      {selectedSystem.mass >= 100000 ? selectedSystem.mass.toLocaleString() : selectedSystem.mass.toFixed(3)} <span className="text-xs text-slate-400">M☉</span>
                    </div>
                    <div className="text-[9.5px] text-slate-400 mt-0.5">
                      Star A: <span className="text-amber-200 font-semibold">{selectedSystem.primaryMass >= 100000 ? selectedSystem.primaryMass.toLocaleString() : selectedSystem.primaryMass.toFixed(3)} M☉</span>
                    </div>
                  </div>

                  {/* Age */}
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Age</div>
                    <div className="text-sm font-bold text-cyan-300 mt-0.5">
                      {selectedSystem.age.toFixed(2)} <span className="text-xs text-slate-400">Gyr</span>
                    </div>
                  </div>

                  {/* Metallicity */}
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Metallicity</div>
                    <div className="text-sm font-bold text-emerald-300 mt-0.5">
                      {selectedSystem.metallicity > 0
                        ? `+${selectedSystem.metallicity.toFixed(2)}`
                        : selectedSystem.metallicity.toFixed(2)}{' '}
                      <span className="text-xs text-slate-400">dex</span>
                    </div>
                  </div>

                  {/* ID / Seed */}
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 relative group">
                    <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
                      <span>ID</span>
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
                  </div>
                </div>

                {/* Primary Action Button: Launch into System Map */}
                <button
                  onClick={() => handleLaunchSystemGenerator(selectedSystem)}
                  className="w-full mt-3 py-2.5 px-3 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 border border-emerald-400/40 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                  title="System Map (Hotkey: Page Down)"
                >
                  <Atom className="w-4 h-4 animate-spin-slow" />
                  <span>System Map &rarr;</span>
                  <kbd className="px-1.5 py-0.5 text-[9px] bg-slate-950/70 border border-emerald-400/50 rounded text-emerald-200 font-sans font-normal ml-1">
                    PgDn
                  </kbd>
                </button>
              </div>

              {/* ============================================================================ */}
              {/* ALIEN EMPIRE & SOVEREIGNTY TERRITORY CARD                                    */}
              {/* ============================================================================ */}
              {(() => {
                const systemEmpire = empireMap.get(selectedSystem.id);
                const isCapital = systemEmpire != null && systemEmpire.homeworldSystemId === selectedSystem.id;

                if (systemEmpire) {
                  return (
                    <div
                      className="p-3.5 rounded-xl border font-mono text-xs space-y-2.5 transition shadow-lg relative overflow-hidden"
                      style={{
                        backgroundColor: `${systemEmpire.color}18`,
                        borderColor: `${systemEmpire.color}60`,
                      }}
                    >
                      <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: `${systemEmpire.color}35` }}>
                        <div className="flex items-center gap-2">
                          <span className="text-xl leading-none">{systemEmpire.phenotype.icon}</span>
                          <div>
                            <div className="font-bold text-white tracking-wide flex items-center gap-1.5">
                              <span>{systemEmpire.name}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {systemEmpire.phenotype.name} Civilization
                            </div>
                          </div>
                        </div>
                        <div
                          className="px-2 py-0.5 rounded text-[10px] font-bold border"
                          style={{
                            color: systemEmpire.color,
                            borderColor: `${systemEmpire.color}60`,
                            backgroundColor: `${systemEmpire.color}25`,
                          }}
                        >
                          {isCapital ? '👑 Capital' : 'Outpost'}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
                          <span className="text-slate-400 block text-[9.5px] uppercase">Empire Realm</span>
                          <span className="text-white font-bold">{systemEmpire.claimedSystemIds.length} Stars</span>
                        </div>
                        <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
                          <span className="text-slate-400 block text-[9.5px] uppercase">Homeworld</span>
                          <span className="text-cyan-300 font-bold truncate block">{systemEmpire.homeworldName}</span>
                        </div>
                      </div>

                      {/* Government & Ethics Badges */}
                      {systemEmpire.government && (
                        <div className="space-y-1.5 pt-0.5">
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                            <span className="text-sm">{systemEmpire.government.icon}</span>
                            <span className="font-semibold text-white">{systemEmpire.government.name}</span>
                          </div>
                          {systemEmpire.ethics && systemEmpire.ethics.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {systemEmpire.ethics.map((eth) => (
                                <span
                                  key={eth.id}
                                  className="px-1.5 py-0.5 rounded bg-slate-900/90 border border-slate-700/80 text-[10px] text-slate-300 flex items-center gap-1"
                                  title={eth.description}
                                >
                                  <span>{eth.icon}</span>
                                  <span>{eth.name}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Claimed Planets in this Star System */}
                      {(() => {
                        const systemPlanetKeys = (systemEmpire.claimedPlanetKeys || []).filter((k) =>
                          k.startsWith(`${selectedSystem.id}_`)
                        );
                        if (systemPlanetKeys.length === 0) return null;
                        return (
                          <div className="p-2 rounded bg-slate-950/70 border border-slate-800/80 space-y-1">
                            <span className="text-slate-400 block text-[9.5px] uppercase font-bold tracking-wider">
                              Imperial Colonies ({systemPlanetKeys.length})
                            </span>
                            <div className="space-y-1">
                              {systemPlanetKeys.map((k) => {
                                const parsed = parsePlanetKey(k);
                                const des = systemEmpire.planetDesignations?.[k] || 'Colony';
                                return (
                                  <div
                                    key={k}
                                    className="flex items-center justify-between text-[10.5px] px-1.5 py-0.5 rounded bg-slate-900/60 border border-slate-800"
                                  >
                                    <span className="text-slate-200 font-mono">
                                      🪐 {parsed.label || parsed.planetRole.toUpperCase()}
                                    </span>
                                    <span
                                      className="px-1.5 py-0.2 rounded text-[9px] font-bold"
                                      style={{
                                        color: systemEmpire.color,
                                        backgroundColor: `${systemEmpire.color}20`,
                                      }}
                                    >
                                      {des}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Action buttons */}
                      <div className="pt-1 flex items-center gap-2">
                        {activeEmpire && activeEmpire.id !== systemEmpire.id && (
                          <button
                            onClick={() => handleClaimToggle(selectedSystem)}
                            className="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <Flag className="w-3.5 h-3.5" style={{ color: activeEmpire.color }} />
                            <span>Claim for {activeEmpire.name}</span>
                          </button>
                        )}
                        {activeEmpire && activeEmpire.id === systemEmpire.id && !isCapital && (
                          <button
                            onClick={() => handleClaimToggle(selectedSystem)}
                            className="flex-1 py-1.5 px-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Relinquish Claim</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                // If unclaimed:
                return (
                  <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/80 font-mono text-xs space-y-2">
                    <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <Shield className="w-3.5 h-3.5 text-slate-500" />
                        Imperial Sovereignty
                      </span>
                      <span className="text-slate-500 font-normal">Unclaimed</span>
                    </div>

                    {selectedSystem.candidateHabitable ? (
                      <div className="space-y-2">
                        <p className="text-[10.5px] text-emerald-300/90 leading-relaxed">
                          🌱 This system possesses a candidate habitable world or active biosphere{' '}
                          {selectedSystem.habitableTypes && selectedSystem.habitableTypes.length > 0
                            ? `(${selectedSystem.habitableTypes.join(', ')}) `
                            : ''}
                          capable of giving rise to an interstellar civilization.
                        </p>
                        <button
                          onClick={() => {
                            setEmpireTargetSystem(selectedSystem);
                            setIsEmpireModalOpen(true);
                          }}
                          className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition cursor-pointer"
                        >
                          <Crown className="w-3.5 h-3.5" />
                          <span>Spawn Empire Capital on this World</span>
                        </button>
                      </div>
                    ) : (
                      <p className="text-[10.5px] text-slate-500 leading-relaxed">
                        Uninhabited deep space. Can be claimed as an outpost by an established empire via <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 text-[9.5px]">Shift+Click</kbd>.
                      </p>
                    )}

                    {activeEmpire && (
                      <button
                        onClick={() => handleClaimToggle(selectedSystem)}
                        className="w-full mt-1 py-1.5 px-2.5 rounded-lg bg-slate-950/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Flag className="w-3 h-3" style={{ color: activeEmpire.color }} />
                        <span>Claim for {activeEmpire.name} (Shift+Click)</span>
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Detailed Stats */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono space-y-2">
                <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Detailed Stats</span>
                  <span className="text-cyan-400 font-semibold">{selectedSystem.archName.replace(/\s*\(.*\)/g, '')}</span>
                </div>

                {(() => {
                  const isMultiple = selectedSystem.nStars > 1;
                  const totalLuminosity = (() => {
                    if (selectedSystem.sysResult?.hierarchy?.stars && selectedSystem.sysResult.hierarchy.stars.length > 0) {
                      const sum = selectedSystem.sysResult.hierarchy.stars.reduce(
                        (acc, st) => acc + (typeof st.lumNum === 'number' ? st.lumNum : 0),
                        0
                      );
                      return +sum.toFixed(3);
                    }
                    return selectedSystem.lumLsun;
                  })();

                  return (
                    <>
                      <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Primary Star</span>
                        <span className="text-slate-200 font-semibold">
                          {selectedSystem.primaryClass} {selectedSystem.primaryMass.toFixed(3)} M☉
                        </span>
                      </div>

                      {selectedSystem.companionStars.length > 0 && (
                        <div className="flex items-start justify-between py-1 border-b border-slate-800/60">
                          <span className="text-slate-400">Companions</span>
                          <div className="text-right text-slate-300 font-medium space-y-1">
                            {selectedSystem.companionStars.map((cs) => {
                              const isBH = isBlackHoleStar({ spectralType: cs.spectralType });
                              return (
                                <div key={cs.label} className="flex items-center justify-end gap-1.5 text-xs">
                                  {isBH ? (
                                    <BlackHoleIcon isSupermassive={cs.mass > 999999} size={15} />
                                  ) : (
                                    <img
                                      src={getProceduralStarSpriteDataUrl(cs, 40)}
                                      alt=""
                                      className="w-4 h-4 shrink-0"
                                    />
                                  )}
                                  <span>
                                    {cs.label}: {cs.spectralType} {cs.mass.toFixed(3)} M☉
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Luminosity: sum of all star luminosities */}
                      <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Luminosity</span>
                        <span className="text-slate-200 font-semibold">{totalLuminosity} L☉</span>
                      </div>

                      {/* Effective Temp & Evolutionary State: only for single star systems */}
                      {!isMultiple && (
                        <>
                          <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                            <span className="text-slate-400">Effective Temp</span>
                            <span className="text-slate-200 font-semibold">{Math.round(selectedSystem.teff)} K</span>
                          </div>

                          <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                            <span className="text-slate-400">Evolutionary State</span>
                            <span className={isNonMainSequenceSystem(selectedSystem) ? 'text-purple-300 font-bold' : 'text-cyan-400 font-semibold'}>
                              {selectedSystem.isRemnant
                                ? selectedSystem.remnantType || 'Remnant'
                                : selectedSystem.sysResult?.hierarchy?.stars?.[0]?.category ||
                                  (isNonMainSequenceSystem(selectedSystem) ? 'Non-Main Sequence' : 'Main Sequence')}
                            </span>
                          </div>
                        </>
                      )}

                      {/* Astronomical Bodies: placed between Evolutionary State and Biospheres */}
                      <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400">Astronomical Bodies</span>
                        <span className="text-slate-200 font-semibold">
                          {selectedSystem.planetCount} Planets &bull; {selectedSystem.beltCount} Belts
                        </span>
                      </div>

                      {/* Planetary Biospheres */}
                      {(() => {
                        const bioLabel =
                          systemTraitsMap.get(selectedSystem.id)?.biosphereDisplay ??
                          getBiosphereDisplay(selectedSystem);
                        return (
                          <div className="flex items-center justify-between py-1">
                            <span className="text-slate-400">Planetary Biospheres:</span>
                            <span className={bioLabel !== '<none>' ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                              {bioLabel}
                            </span>
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </div>

              {/* Hyperlane Connectivity Routes */}
              <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 text-xs font-mono space-y-2">
                <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <Route className="w-3.5 h-3.5" />
                    Hyperlanes
                  </span>
                </div>
                {connectedLanes.length === 0 ? (
                  <div className="text-[11px] text-slate-500 italic py-0.5">
                    No planar hyperlanes connected to this system.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {connectedLanes.map((lane) => {
                      const targetId = lane.sourceId === selectedSystem.id ? lane.targetId : lane.sourceId;
                      const neighbor = gridData.systems.find((s) => s.id === targetId);
                      if (!neighbor) return null;

                      return (
                        <div
                          key={lane.id}
                          onClick={() => {
                            setSelectedSystem(neighbor);
                            setSelectedCoord(neighbor.coord);
                          }}
                          className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950/70 hover:bg-cyan-950/40 border border-slate-800/70 hover:border-cyan-700/60 transition cursor-pointer group text-[11px]"
                          title={`Jump to ${neighbor.name}`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-white/50 group-hover:scale-110 transition-transform flex-shrink-0"
                              style={{ backgroundColor: neighbor.colorHex }}
                            />
                            <span className="text-slate-200 group-hover:text-cyan-300 font-semibold transition truncate max-w-[130px]">
                              {neighbor.name}
                            </span>
                            <span className="text-[9.5px] text-slate-500 font-mono">
                              {neighbor.coord}
                            </span>
                          </div>
                          <span className="text-[10.5px] text-cyan-400/90 font-mono flex-shrink-0">
                            {(lane.lengthLy / 3.26156).toFixed(1)} pc
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
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
                    <span className="text-slate-500">Remnants:</span>{' '}
                    <span className="text-purple-400 font-bold">{gridData.stats.remnantCount}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/50">
                    <span className="text-slate-500">Multi-Stars:</span>{' '}
                    <span className="text-indigo-300 font-bold">{gridData.stats.multipleSystemCount}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/50">
                    <span className="text-slate-500">Heavy Stars &ge;3 M☉:</span>{' '}
                    <span className="text-amber-300 font-bold">{gridData.stats.heavyMassCount}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/50">
                    <span className="text-slate-500">Hyperlanes:</span>{' '}
                    <span className="text-cyan-400 font-bold">{gridData.stats.hyperlaneCount}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/50">
                    <span className="text-slate-500">Empires:</span>{' '}
                    <span className="text-emerald-400 font-bold">{empires.length}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/50 col-span-2 flex items-center justify-between">
                    <span className="text-slate-400">Integrated Light:</span>
                    <span className="flex items-center gap-1.5 font-bold" style={{ color: gridData.integratedColorHex }}>
                      <span className="w-2.5 h-2.5 rounded-full border border-white/40" style={{ backgroundColor: gridData.integratedColorHex }} />
                      {gridData.integratedColorHex}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSectorExportModal(true)}
                  className="w-full mt-1 py-2 px-3 rounded-lg bg-slate-950/90 hover:bg-slate-800 border border-cyan-700/70 hover:border-cyan-500 text-cyan-300 font-mono font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow"
                  title="Export or Import this Sector in Stellaris Static Galaxy (.txt), Stargen Sector (.json), or SpaceEngine (.sc) format"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Export / Import Sector</span>
                </button>
              </div>

              {/* Instructions Tip */}
              <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-800/40 text-[10.5px] text-cyan-300/80 font-mono leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <span>
                  double click or zoom in for system map
                </span>
              </div>
            </div>
          ) : (
            <div className="p-6 h-full flex flex-col items-center justify-center text-center text-slate-500 font-mono text-xs gap-3">
              <Hexagon className="w-10 h-10 text-slate-700 animate-pulse" />
              <p>Select any hex with a star system to inspect its stats or open the system map.</p>
            </div>
          )}
        </div>
        )}
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
    </div>
  );
};
