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
  Shield,
  Flag,
  Trash2,
  Download,
  Upload,
} from 'lucide-react';
import {
  SectorHexConfig,
  SectorHexSystem,
  type SectorHyperlane,
  DEFAULT_SECTOR_CONFIG,
  generateSectorHexGrid,
} from '../../core/generation/sectorHex';
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

  // Pan & Zoom Canvas Camera
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hover state
  const [hoveredSystem, setHoveredSystem] = useState<SectorHexSystem | null>(null);

  // Copied state
  const [copiedId, setCopiedId] = useState<boolean>(false);

  // Hyperlanes visibility toggle
  const [showHyperlanes, setShowHyperlanes] = useState<boolean>(true);

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

  // Launch StarGen Lab
  const handleLaunchSystemGenerator = (system: SectorHexSystem) => {
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
    onLaunchStarGen(params);
  };

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
    const typeLower = (star.spectralType || '').toLowerCase();
    const catLower = (star.category || '').toLowerCase();
    const isBlackHole = typeLower.includes('black hole');
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

    // Single Star
    if (n <= 1 || !stars || stars.length === 0) {
      const star = stars[0] || { mass: system.primaryMass, colorHex: system.colorHex, radius: system.primaryMass };
      const { r, glowR, isBlackHole } = getStarScaledRadius(star, 1.0);
      return (
        <g>
          {/* High-Performance Lightweight Vector Glow */}
          <circle r={glowR} fill={star.colorHex} opacity={isBlackHole ? 0.35 : 0.20} />
          <circle r={glowR * 0.65} fill={star.colorHex} opacity={isBlackHole ? 0.45 : 0.35} />
          <circle
            r={r}
            fill={isBlackHole ? '#000000' : star.colorHex}
            stroke={isBlackHole ? '#38bdf8' : '#ffffff'}
            strokeWidth={0.7}
          />
        </g>
      );
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
          {/* Star A */}
          <circle cx={posA.x} cy={posA.y} r={rA * 1.8} fill={starA.colorHex} opacity={isBHA ? 0.35 : 0.22} />
          <circle
            cx={posA.x}
            cy={posA.y}
            r={rA}
            fill={isBHA ? '#000000' : starA.colorHex}
            stroke={isBHA ? '#38bdf8' : '#ffffff'}
            strokeWidth={0.6}
          />

          {/* Star B */}
          <circle cx={posB.x} cy={posB.y} r={rB * 1.8} fill={starB.colorHex} opacity={isBHB ? 0.35 : 0.22} />
          <circle
            cx={posB.x}
            cy={posB.y}
            r={rB}
            fill={isBHB ? '#000000' : starB.colorHex}
            stroke={isBHB ? '#38bdf8' : '#ffffff'}
            strokeWidth={0.6}
          />
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
          {/* Star A */}
          <circle cx={posA.x} cy={posA.y} r={rA * 1.7} fill={starA.colorHex} opacity={isBHA ? 0.35 : 0.22} />
          <circle
            cx={posA.x}
            cy={posA.y}
            r={rA}
            fill={isBHA ? '#000000' : starA.colorHex}
            stroke={isBHA ? '#38bdf8' : '#ffffff'}
            strokeWidth={0.6}
          />

          {/* Star B */}
          <circle cx={posB.x} cy={posB.y} r={rB * 1.7} fill={starB.colorHex} opacity={isBHB ? 0.35 : 0.22} />
          <circle
            cx={posB.x}
            cy={posB.y}
            r={rB}
            fill={isBHB ? '#000000' : starB.colorHex}
            stroke={isBHB ? '#38bdf8' : '#ffffff'}
            strokeWidth={0.6}
          />

          {/* Star C */}
          <circle cx={posC.x} cy={posC.y} r={rC * 1.7} fill={starC.colorHex} opacity={isBHC ? 0.35 : 0.22} />
          <circle
            cx={posC.x}
            cy={posC.y}
            r={rC}
            fill={isBHC ? '#000000' : starC.colorHex}
            stroke={isBHC ? '#38bdf8' : '#ffffff'}
            strokeWidth={0.6}
          />
        </g>
      );
    }

    // Quadruple System (4 Stars: Dual binary pairs AB and CD)
    const starA = stars[0];
    const starB = stars[1];
    const starC = stars[2];
    const starD = stars[3];
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
        <circle cx={posA.x} cy={posA.y} r={rA * 1.5} fill={starA.colorHex} opacity={isBHA ? 0.35 : 0.22} />
        <circle cx={posA.x} cy={posA.y} r={rA} fill={isBHA ? '#000000' : starA.colorHex} stroke={isBHA ? '#38bdf8' : '#ffffff'} strokeWidth={0.5} />

        <circle cx={posB.x} cy={posB.y} r={rB * 1.5} fill={starB.colorHex} opacity={isBHB ? 0.35 : 0.22} />
        <circle cx={posB.x} cy={posB.y} r={rB} fill={isBHB ? '#000000' : starB.colorHex} stroke={isBHB ? '#38bdf8' : '#ffffff'} strokeWidth={0.5} />

        <circle cx={posC.x} cy={posC.y} r={rC * 1.5} fill={starC.colorHex} opacity={isBHC ? 0.35 : 0.22} />
        <circle cx={posC.x} cy={posC.y} r={rC} fill={isBHC ? '#000000' : starC.colorHex} stroke={isBHC ? '#38bdf8' : '#ffffff'} strokeWidth={0.5} />

        <circle cx={posD.x} cy={posD.y} r={rD * 1.5} fill={starD.colorHex} opacity={isBHD ? 0.35 : 0.22} />
        <circle cx={posD.x} cy={posD.y} r={rD} fill={isBHD ? '#000000' : starD.colorHex} stroke={isBHD ? '#38bdf8' : '#ffffff'} strokeWidth={0.5} />
      </g>
    );
  };

  // ============================================================================
  // HIGH-PERFORMANCE VIEWPORT CULLING FOR VISIBLE STARS
  // ============================================================================
  const visibleSystems = useMemo(() => {
    const margin = 120; // Pixel padding around screen
    const viewMinX = -pan.x / zoom - margin;
    const viewMaxX = (containerSize.width - pan.x) / zoom + margin;
    const viewMinY = -pan.y / zoom - margin;
    const viewMaxY = (containerSize.height - pan.y) / zoom + margin;

    return gridData.systems.filter((sys) => {
      return (
        sys.x >= viewMinX &&
        sys.x <= viewMaxX &&
        sys.y >= viewMinY &&
        sys.y <= viewMaxY
      );
    });
  }, [gridData.systems, pan.x, pan.y, zoom, containerSize]);

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
            <p className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
              <span className="text-cyan-300 font-semibold">{config.columns}&times;{config.rows} Hex Grid</span>
              <span className="text-slate-600">&bull;</span>
              <span>{gridData.stats.occupiedHexes.toLocaleString()} Systems ({gridData.stats.occupancyPct}% density)</span>
              <span className="text-slate-600">&bull;</span>
              <span className="flex items-center gap-1.5 font-mono">
                <span className="w-2.5 h-2.5 rounded-full border border-white/40 shadow-sm" style={{ backgroundColor: gridData.integratedColorHex }} />
                <span>Sector Integrated Light: <strong style={{ color: gridData.integratedColorHex }}>{gridData.integratedColorHex}</strong></span>
              </span>
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
          <span className="hidden md:inline">Age: <strong className="text-cyan-300">{config.meanAge.toFixed(1)} Gyr</strong></span>
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
            <g
              transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
              style={{ transformOrigin: '0 0' }}
            >
              {/* Sector Boundary Box */}
              <rect
                x={0}
                y={0}
                width={gridData.sectorWidth}
                height={gridData.sectorHeight}
                rx={16}
                fill="rgba(6, 11, 24, 0.45)"
                stroke="rgba(56, 189, 248, 0.30)"
                strokeWidth={1.5}
                strokeDasharray="6,4"
              />

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

              {/* Sector Corner Sci-Fi Tech Brackets */}
              <path
                d={`M 25 10 L 10 10 L 10 25 M ${gridData.sectorWidth - 25} 10 L ${gridData.sectorWidth - 10} 10 L ${gridData.sectorWidth - 10} 25 M 10 ${gridData.sectorHeight - 25} L 10 ${gridData.sectorHeight - 10} L 25 ${gridData.sectorHeight - 10} M ${gridData.sectorWidth - 25} ${gridData.sectorHeight - 10} L ${gridData.sectorWidth - 10} ${gridData.sectorHeight - 10} L ${gridData.sectorWidth - 10} ${gridData.sectorHeight - 25}`}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2}
                opacity={0.60}
              />

              {/* Sector Parsec Scale Marker in Bottom Corner */}
              <text
                x={16}
                y={gridData.sectorHeight - 14}
                fill="rgba(148, 163, 184, 0.6)"
                fontSize={9}
                fontFamily="monospace"
                letterSpacing="0.05em"
              >
                SECTOR FIELD: {gridData.parsecWidth}&times;{gridData.parsecHeight} pc &bull; {gridData.systems.length} STELLAR SYSTEMS
              </text>

              {/* Procedural Hyperlane Network Layer */}
              {showHyperlanes && gridData.hyperlanes && gridData.hyperlanes.length > 0 && (
                <g className="hyperlanes-layer pointer-events-none">
                  {gridData.hyperlanes.map((lane) => {
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
                              : 'rgba(56, 189, 248, 0.32)'
                          }
                          strokeWidth={isHighlighted ? 1.8 : isSameEmpire ? 1.5 : 1.0}
                          strokeDasharray={isHighlighted || isSameEmpire ? undefined : '3,4'}
                          opacity={isHighlighted ? 1.0 : isSameEmpire ? 0.95 : 0.65}
                          strokeLinecap="round"
                        />
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

                // Filter check
                let matchesFilter = true;
                if (filterCat !== 'all') {
                  if (filterCat === 'habitable') {
                    matchesFilter = system.candidateHabitable;
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
                          : 'rgba(100, 116, 139, 0.22)'
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
                          : 'rgba(15, 23, 42, 0.50)'
                      }
                      stroke={
                        systemEmpire
                          ? systemEmpire.color
                          : isSelected
                          ? '#38bdf8'
                          : isHovered
                          ? '#7dd3fc'
                          : 'rgba(148, 163, 184, 0.35)'
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

                    {/* Coordinate / Catalog Label at top of zone - revealed only on mouse over or click/selection */}
                    {(isSelected || isHovered) && zoom >= 0.26 && (
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
                    {zoom >= 0.30 && (
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
              <span className="text-[10px] text-slate-500 pl-1">
                {Math.round(zoom * 100)}%
              </span>
            </div>
          </div>

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
          {empires.length > 0 && !isSpawnEmpireMode && (
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
              <div
                className="w-3.5 h-3.5 rounded-full border border-white/60 shadow"
                style={{ backgroundColor: hoveredSystem.colorHex }}
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
                                      🪐 {parsed.planetRole.toUpperCase()}
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
                          🌱 This system possesses a candidate habitable biosphere capable of giving rise to an alien civilization.
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

              {/* Hyperlane Connectivity Routes */}
              <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 text-xs font-mono space-y-2">
                <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <Route className="w-3.5 h-3.5" />
                    Hyperlanes ({connectedLanes.length})
                  </span>
                  <span className="text-[10px] text-slate-500 lowercase font-normal">
                    6 closest planar
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
                              ({neighbor.coord})
                            </span>
                          </div>
                          <span className="text-[10.5px] text-cyan-400/90 font-mono flex-shrink-0">
                            {lane.lengthLy} ly
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
                    <span className="text-slate-500">Remnants (WD/NS/BH):</span>{' '}
                    <span className="text-purple-400 font-bold">{gridData.stats.remnantCount}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/50">
                    <span className="text-slate-500">Multi-Stars:</span>{' '}
                    <span className="text-indigo-300 font-bold">{gridData.stats.multipleSystemCount}</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/50">
                    <span className="text-slate-500">Heavy Stars (&ge;3 M☉):</span>{' '}
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
                    <span className="text-slate-400">Integrated Light (Constituent Stars):</span>
                    <span className="flex items-center gap-1.5 font-bold" style={{ color: gridData.integratedColorHex }}>
                      <span className="w-2.5 h-2.5 rounded-full border border-white/40" style={{ backgroundColor: gridData.integratedColorHex }} />
                      {gridData.integratedColorHex}
                    </span>
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
    </div>
  );
};
