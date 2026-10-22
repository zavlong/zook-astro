import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Sparkles,
  RefreshCw,
  Code,
  Rocket,
  Wrench,
  X,
  Compass,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Play,
  Pause,
  Move,
  Crosshair,
  Gauge,
  Tag,
  ListTree,
  Star,
  Lock,
} from 'lucide-react';
import {
  CustomStellarConfig,
  RealisticBeltBody,
  RealisticPlanetBody,
  RealisticPlanetaryZone,
  RealisticStarSystemResult,
  STARGEN_BENCHMARK_PRESETS,
  StarGenParams,
  convertRealisticToArchitectSystem,
  convertRealisticToSectorStarSystem,
  getPlanetVisualColor,
  rollStep1,
  runRealisticGenerator,
} from '../../core/generation/realisticStarGen';
import { ArchitectSystem } from '../../types/architect';
import {
  RealisticBinarySplit,
  RealisticStarNode,
  StarSystem,
} from '../../types/astrophysics';
import {
  getProceduralPlanetIconDataUrl,
} from './ProceduralPlanetPortrait';
import { getProceduralStarSpriteDataUrl } from '../../core/generation/starAssets';
import { isBlackHoleStar } from '../../core/generation/sectorHex';
import { BlackHoleIcon } from '../ui/BlackHoleIcon';
import { GenerationLoadingOverlay, yieldToMainThread } from '../ui/GenerationLoadingOverlay';
import {
  SelectedMapEntity,
  Vec2AU,
  shortClassLabel,
  clamp,
  lerp,
  log10,
  formatDistanceKm,
} from './types';
import {
  computeSystem2DLayout,
  getBodyWorldPosAU,
} from './math/kepler';
import { SystemJsonManagerModal } from './modals/SystemJsonManagerModal';
import { PreProgramStarModal } from './modals/PreProgramStarModal';
import { StarDossierModal } from './modals/StarDossierModal';
import { BinarySplitModal } from './modals/BinarySplitModal';
import { BeltDossierModal } from './modals/BeltDossierModal';
import { PlanetDossierModal } from './modals/PlanetDossierModal';
import {
  loadEmpiresForSector,
  claimPlanetForEmpire,
  unclaimPlanetForEmpire,
  makePlanetKey,
  SectorEmpire,
  ColonyDesignation,
} from '../../core/generation/empireGen';
import { universeCache } from '../../core/storage/universeCache';
import { PlanetarySurfaceTarget } from '../surface/PlanetarySurfaceApp';

interface RealisticStarGenAppProps {
  onOpenInArchitect: (archSystem: ArchitectSystem) => void;
  onInspectInSector3D?: (starSystem: StarSystem) => void;
  initialParams?: StarGenParams | null;
  onBackToSectorHex?: () => void;
  showUI?: boolean;
  onOpenSurfaceGen?: (target: PlanetarySurfaceTarget) => void;
  isActive?: boolean;
}

export const RealisticStarGenApp: React.FC<RealisticStarGenAppProps> = ({
  onOpenInArchitect,
  onInspectInSector3D,
  initialParams,
  onBackToSectorHex,
  showUI = false,
  onOpenSurfaceGen,
  isActive = true,
}) => {
  // Step 1-2 Controls
  const [logMass, setLogMass] = useState<number>(0.02);
  const [age, setAge] = useState<number>(4.6);
  const [feh, setFeh] = useState<number>(0.0);
  const [forcedMult, setForcedMult] = useState<'auto' | '1' | '2' | '3' | '4'>('auto');
  const [presetKey, setPresetKey] = useState<string>('');

  // Generated System Result
  const [systemResult, setSystemResult] = useState<RealisticStarSystemResult | null>(null);

  // 2D Map View Mode & Zoom (Orrery is the default view)
  const [mapMode, setMapMode] = useState<'schematic' | 'orrery2d'>('orrery2d');
  const [mapZoom, setMapZoom] = useState<number>(1.0);

  // Proportional 3D Orrery Camera State (pxPerAU, center in AU, 3D Yaw & Pitch, Orbit Animation)
  const [orreryPxPerAU, setOrreryPxPerAU] = useState<number>(35);
  const [orreryCamAU, setOrreryCamAU] = useState<Vec2AU>({ x: 0, y: 0, z: 0 });
  const [orreryYaw, setOrreryYaw] = useState<number>(-0.42);
  const [orreryPitch, setOrreryPitch] = useState<number>(0.94); // ~54° 3D perspective tilt
  const [orreryDragMode, setOrreryDragMode] = useState<'rotate' | 'pan'>('rotate');
  const [orreryIncScale, setOrreryIncScale] = useState<number>(1);
  const [orreryPlaying, setOrreryPlaying] = useState<boolean>(false);
  const [orrerySpeed, setOrrerySpeed] = useState<number>(1.0); // 0.1x (10x slower) to 2.0x
  const [orreryTimeYr, setOrreryTimeYr] = useState<number>(0);
  const [trackedTarget, setTrackedTarget] = useState<SelectedMapEntity | null>(null);
  const [isDraggingOrrery, setIsDraggingOrrery] = useState<boolean>(false);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    camX: number;
    camY: number;
    camZ: number;
    yaw: number;
    pitch: number;
    action: 'rotate' | 'pan';
  } | null>(null);
  const orrerySvgRef = useRef<SVGSVGElement | null>(null);
  const orreryContainerRef = useRef<HTMLDivElement | null>(null);

  // Click-to-Blow-Up Selected Entity Modal State
  const [selectedEntity, setSelectedEntity] = useState<SelectedMapEntity | null>(null);

  // Modals (JSON Import/Export & Pre-Program Star Data)
  const [showJsonModal, setShowJsonModal] = useState<boolean>(false);
  const [showPreProgramModal, setShowPreProgramModal] = useState<boolean>(false);
  const [customStellarConfig, setCustomStellarConfig] = useState<
    CustomStellarConfig | undefined
  >(undefined);

  // Orrery System Map Labels Toggle (default false)
  const [showLabels, setShowLabels] = useState<boolean>(false);

  // Quick Jump Hierarchy Tree on left side (toggled with J or button)
  const [showQuickJump, setShowQuickJump] = useState<boolean>(false);

  // Dedicated Orbital Mechanics & Flight Planner Overlay (toggled with P or button)
  const [showLagrange, setShowLagrange] = useState<boolean>(false);
  const [navZoneIdx, setNavZoneIdx] = useState<number>(0);
  const [navOriginIdx, setNavOriginIdx] = useState<number>(0);
  const [navDestIdx, setNavDestIdx] = useState<number>(1);

  // Sync Orbital Mechanics Origin when system changes
  useEffect(() => {
    if (!systemResult) return;
    let bestZ = 0;
    let bestB = 0;
    let bestScore = -1;
    systemResult.zones.forEach((z, zIdx) => {
      z.bodies.forEach((cand, bIdx) => {
        if (cand.kind !== 'planet') return;
        const score =
          (cand.hydrosphere?.biosphere && cand.hydrosphere.biosphere !== 'none' ? 1000 : 0) +
          (cand.gasFrac < 0.05 ? 100 : 0) +
          Math.min(50, cand.massEarth);
        if (score > bestScore) {
          bestScore = score;
          bestZ = zIdx;
          bestB = bIdx;
        }
      });
    });
    setNavZoneIdx(bestZ);
    setNavOriginIdx(bestB);
    const zoneBodies = systemResult.zones[bestZ]?.bodies || [];
    const nextPlanetIdx = zoneBodies.findIndex(
      (b, idx) => b.kind === 'planet' && idx > bestB
    );
    const prevPlanetIdx = zoneBodies.findIndex(
      (b, idx) => b.kind === 'planet' && idx !== bestB
    );
    setNavDestIdx(nextPlanetIdx !== -1 ? nextPlanetIdx : prevPlanetIdx !== -1 ? prevPlanetIdx : bestB);
  }, [systemResult?.step1?.id, systemResult?.roll]);

  // Sync Orbital Mechanics Origin when user tracks or selects a planet on the map
  useEffect(() => {
    const active = trackedTarget || selectedEntity;
    if (!active || !systemResult) return;
    if (active.kind === 'planet' || active.kind === 'moon') {
      const zIdx = active.zoneIdx;
      const bIdx = active.bodyIdx;
      setNavZoneIdx(zIdx);
      setNavOriginIdx(bIdx);
      setNavDestIdx((prevDest) => {
        const zoneBodies = systemResult.zones[zIdx]?.bodies || [];
        if (
          prevDest !== bIdx &&
          zoneBodies[prevDest] &&
          zoneBodies[prevDest].kind === 'planet'
        ) {
          return prevDest;
        }
        const nextIdx = zoneBodies.findIndex((b, idx) => b.kind === 'planet' && idx > bIdx);
        if (nextIdx !== -1) return nextIdx;
        const anyOtherIdx = zoneBodies.findIndex((b, idx) => b.kind === 'planet' && idx !== bIdx);
        return anyOtherIdx !== -1 ? anyOtherIdx : bIdx;
      });
    }
  }, [trackedTarget, selectedEntity, systemResult]);

  // "Entering <System>" Briefing Overlay State (fades out after a few seconds)
  const [showEnteringOverlay, setShowEnteringOverlay] = useState<boolean>(true);
  const [isEnteringFading, setIsEnteringFading] = useState<boolean>(false);
  const enteringTimerRef = useRef<NodeJS.Timeout | null>(null);
  const enteringFadeTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!systemResult) return;

    if (enteringTimerRef.current) clearTimeout(enteringTimerRef.current);
    if (enteringFadeTimerRef.current) clearTimeout(enteringFadeTimerRef.current);

    setShowEnteringOverlay(true);
    setIsEnteringFading(false);

    // Stays solid for 5.0 seconds, then begins 700ms smooth fade-out
    enteringTimerRef.current = setTimeout(() => {
      setIsEnteringFading(true);
      enteringFadeTimerRef.current = setTimeout(() => {
        setShowEnteringOverlay(false);
      }, 700);
    }, 5000);

    return () => {
      if (enteringTimerRef.current) clearTimeout(enteringTimerRef.current);
      if (enteringFadeTimerRef.current) clearTimeout(enteringFadeTimerRef.current);
    };
  }, [systemResult?.step1?.id, systemResult?.roll]);

  // System stats summary for the "Entering <System>" briefing card
  const systemBriefingStats = useMemo(() => {
    if (!systemResult) return null;
    const sysName =
      systemResult.step1?.name ||
      initialParams?.name ||
      systemResult.step1?.id ||
      'System';
    const stars = systemResult.hierarchy?.stars || [];
    const primaryStar = stars[0];
    const companionStars = stars.slice(1);
    const isMultiple = stars.length > 1;
    const archName =
      systemResult.hierarchy?.archName?.replace(/\s*\(.*\)/g, '') ||
      (isMultiple ? 'BINARY SYSTEM' : 'SINGLE STAR');

    const totalLuminosity = +stars
      .reduce(
        (acc, st) => acc + (typeof st.lumNum === 'number' ? st.lumNum : 0),
        0
      )
      .toFixed(3);

    let planetCount = 0;
    let beltCount = 0;
    let biospheresWithLife = 0;
    let dominantLiquid = 'water';

    (systemResult.zones || []).forEach((z) => {
      (z.bodies || []).forEach((b) => {
        if (b.kind === 'belt') {
          beltCount++;
        } else if (b.kind === 'planet') {
          planetCount++;
          if (b.hydrosphere?.biosphere && b.hydrosphere.biosphere !== 'none') {
            biospheresWithLife++;
            if (b.hydrosphere.solvent) dominantLiquid = b.hydrosphere.solvent;
          }
        }
      });
    });

    const biosphereText =
      biospheresWithLife === 0
        ? '<none>'
        : `${biospheresWithLife} (${dominantLiquid})`;

    return {
      sysName,
      archName,
      primaryStar,
      companionStars,
      isMultiple,
      totalLuminosity,
      planetCount,
      beltCount,
      biosphereText,
    };
  }, [systemResult, initialParams?.name]);

  const orreryStateRef = useRef({
    pxPerAU: orreryPxPerAU,
    pitch: orreryPitch,
    yaw: orreryYaw,
  });

  useEffect(() => {
    orreryStateRef.current = {
      pxPerAU: orreryPxPerAU,
      pitch: orreryPitch,
      yaw: orreryYaw,
    };
  }, [orreryPxPerAU, orreryPitch, orreryYaw]);

  const handleNativeWheel = useCallback((e: WheelEvent) => {
    // Intercept and prevent the browser from scrolling the containing page
    e.preventDefault();
    e.stopPropagation();

    const { pxPerAU, pitch, yaw } = orreryStateRef.current;
    const zoomFactor = e.deltaY < 0 ? 1.22 : 0.82;
    const newPxPerAU = clamp(pxPerAU * zoomFactor, 0.05, 5000000);
    if (newPxPerAU === pxPerAU) return;

    const svgEl = orrerySvgRef.current;
    if (svgEl) {
      const rect = svgEl.getBoundingClientRect();
      const vW = rect.width || 1280;
      const vH = rect.height || 780;
      const mouseSvgX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * vW;
      const mouseSvgY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * vH;
      const cxScreen = vW / 2;
      const cyScreen = vH / 2;
      const dxSvg = mouseSvgX - cxScreen;
      const dySvg = mouseSvgY - cyScreen;
      const rawCosP = Math.cos(pitch);
      const cosP = (rawCosP < 0 ? -1 : 1) * Math.max(0.2, Math.abs(rawCosP));
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const xCam = dxSvg / pxPerAU;
      const yCam = dySvg / (pxPerAU * cosP);
      const dAU_x = xCam * cosY + yCam * sinY;
      const dAU_y = -xCam * sinY + yCam * cosY;
      const k = newPxPerAU / pxPerAU;

      setTrackedTarget(null);
      setOrreryCamAU((prev) => ({
        x: prev.x + dAU_x * (1 - 1 / k),
        y: prev.y + dAU_y * (1 - 1 / k),
        z: prev.z ?? 0,
      }));
    }

    if (e.deltaY < 0 && newPxPerAU >= 160000 && onOpenSurfaceGen && systemResult) {
      const active = trackedTarget || selectedEntity;
      if (active && (active.kind === 'planet' || active.kind === 'moon')) {
        const z = systemResult.zones[active.zoneIdx];
        const pb = z?.bodies[active.bodyIdx];
        if (pb && pb.kind === 'planet') {
          const m = active.kind === 'moon' ? pb.moons[active.moonIdx] : null;
          setOrreryPxPerAU(Math.min(pxPerAU, 65000));
          onOpenSurfaceGen({
            planet: pb,
            moon: m,
            zone: z,
            stars: systemResult.hierarchy.stars,
          });
          return;
        }
      }
    }

    setOrreryPxPerAU(newPxPerAU);
  }, [onOpenSurfaceGen, systemResult, trackedTarget, selectedEntity]);

  const setOrreryContainer = useCallback(
    (node: HTMLDivElement | null) => {
      if (orreryContainerRef.current) {
        orreryContainerRef.current.removeEventListener('wheel', handleNativeWheel);
      }
      orreryContainerRef.current = node;
      if (node) {
        node.addEventListener('wheel', handleNativeWheel, { passive: false });
      }
    },
    [handleNativeWheel]
  );

  // Transition state when returning to Sector Hex Map
  const [isExitingToSector, setIsExitingToSector] = useState<boolean>(false);
  const exitTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  const handleBackToSectorWithTransition = useCallback(() => {
    if (!onBackToSectorHex || isExitingToSector) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      onBackToSectorHex();
      return;
    }

    setIsExitingToSector(true);
    // Smoothly zoom out orrery camera
    setOrreryPxPerAU((p) => Math.max(0.05, p / 3));

    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
    }
    exitTimerRef.current = setTimeout(() => {
      onBackToSectorHex();
    }, 350);
  }, [onBackToSectorHex, isExitingToSector]);

  // Sector Empires & System Sovereignty State
  const [sectorEmpires, setSectorEmpires] = useState<SectorEmpire[]>([]);

  const sectorSeed = initialParams?.sectorSeed;
  const sectorColumns = initialParams?.sectorColumns;
  const sectorRows = initialParams?.sectorRows;

  const reloadEmpires = useCallback(() => {
    if (sectorSeed !== undefined) {
      const loaded = loadEmpiresForSector(sectorSeed, sectorColumns, sectorRows);
      setSectorEmpires(loaded.empires);
    } else {
      const loaded = loadEmpiresForSector(4289);
      setSectorEmpires(loaded.empires);
    }
  }, [sectorSeed, sectorColumns, sectorRows]);

  useEffect(() => {
    reloadEmpires();
  }, [reloadEmpires, systemResult]);

  const currentSysId = systemResult?.step1?.id || initialParams?.id;

  const currentEmpire = useMemo(() => {
    if (!currentSysId) return null;
    return (
      sectorEmpires.find(
        (e) =>
          e.claimedSystemIds?.includes(currentSysId) ||
          (initialParams?.empireId && e.id === initialParams.empireId)
      ) || null
    );
  }, [sectorEmpires, currentSysId, initialParams?.empireId]);

  const getPlanetClaimInfo = useCallback(
    (b: RealisticPlanetBody, zoneIdx: number, bIdx: number) => {
      if (!currentSysId) return null;
      const pKeySpecific = makePlanetKey(currentSysId, `z${zoneIdx}_p${bIdx + 1}`);
      const pKeyLegacy = makePlanetKey(currentSysId, `p${bIdx + 1}`);
      const pKeyRole = b.role ? makePlanetKey(currentSysId, b.role) : '';

      for (const emp of sectorEmpires) {
        const keys = emp.claimedPlanetKeys || [];
        if (keys.includes(pKeySpecific)) {
          return {
            empire: emp,
            key: pKeySpecific,
            designation: (emp.planetDesignations?.[pKeySpecific] || 'Colony') as ColonyDesignation,
          };
        }
        // Only zone 0 (primary star) falls back to legacy unprefixed keys
        if (zoneIdx === 0) {
          if (keys.includes(pKeyLegacy)) {
            return {
              empire: emp,
              key: pKeyLegacy,
              designation: (emp.planetDesignations?.[pKeyLegacy] || 'Colony') as ColonyDesignation,
            };
          }
          if (pKeyRole && keys.includes(pKeyRole)) {
            return {
              empire: emp,
              key: pKeyRole,
              designation: (emp.planetDesignations?.[pKeyRole] || 'Colony') as ColonyDesignation,
            };
          }
        }
      }
      return null;
    },
    [currentSysId, sectorEmpires]
  );

  const handleToggleClaimPlanet = useCallback(
    (
      b: RealisticPlanetBody,
      zoneIdx: number,
      bIdx: number,
      designation?: ColonyDesignation,
      targetEmpireId?: string
    ) => {
      if (!currentSysId) return;
      const effSeed = sectorSeed ?? 4289;
      const empireToUse =
        sectorEmpires.find((e) => e.id === targetEmpireId) ||
        currentEmpire ||
        sectorEmpires[0];
      if (!empireToUse) return;

      const pKey = makePlanetKey(currentSysId, `z${zoneIdx}_p${bIdx + 1}`);
      const existing = getPlanetClaimInfo(b, zoneIdx, bIdx);

      if (existing && !designation) {
        // Relinquish
        unclaimPlanetForEmpire(effSeed, existing.empire.id, existing.key, sectorColumns, sectorRows);
      } else {
        // Claim / Update designation
        const des = designation || (existing?.designation ?? 'Colony');
        claimPlanetForEmpire(effSeed, empireToUse.id, pKey, des, sectorColumns, sectorRows);
      }
      reloadEmpires();
    },
    [currentSysId, sectorSeed, sectorColumns, sectorRows, sectorEmpires, currentEmpire, getPlanetClaimInfo, reloadEmpires]
  );

  const sysMass = +Math.pow(10, logMass).toFixed(3);

  const fitOrreryToFullSystem = (res: RealisticStarSystemResult) => {
    const layout = computeSystem2DLayout(res);
    const fitPxPerAU = clamp(320 / Math.max(0.2, layout.maxExtentAU), 0.15, 4000);
    setOrreryPxPerAU(fitPxPerAU);
    setOrreryCamAU({ x: 0, y: 0, z: 0 });
    setTrackedTarget(null);
  };

  const handleTrackBody = (entity: SelectedMapEntity) => {
    setTrackedTarget(entity);
    setSelectedEntity(null);
    if (systemResult) {
      const targetPos = getBodyWorldPosAU(
        systemResult,
        entity,
        orreryTimeYr,
        orreryIncScale,
        orreryPitch,
        orreryYaw,
        orreryPxPerAU
      );
      if (targetPos) {
        setOrreryCamAU(targetPos);
      }
    }
  };


  const handleZoomToEntity = (entity: SelectedMapEntity) => {
    if (!systemResult) return;
    setTrackedTarget(entity);
    const layout = computeSystem2DLayout(systemResult, orreryTimeYr);

    if (entity.kind === 'star') {
      const st = systemResult.hierarchy.stars[entity.starIdx];
      if (!st) return;
      const sPos = layout.starPos[st.label] || { x: 0, y: 0 };
      const sZone = systemResult.zones.find((z) =>
        z.title.startsWith(`Star ${st.label} `)
      );
      const maxPlanetA = sZone
        ? sZone.bodies.reduce((m, b) => Math.max(m, b.a), sZone.a_in * 4)
        : 2.5;
      setOrreryCamAU({ x: sPos.x, y: sPos.y, z: 0 });
      setOrreryPxPerAU(clamp(260 / Math.max(0.05, maxPlanetA * 1.25), 0.15, 60000));
      return;
    }

    if (entity.kind === 'split') {
      const sp = systemResult.hierarchy.splits[entity.splitIdx];
      if (!sp) return;
      const bPos = layout.baryPos[sp.pair] || { x: 0, y: 0 };
      setOrreryCamAU({ x: bPos.x, y: bPos.y, z: 0 });
      setOrreryPxPerAU(clamp(260 / Math.max(0.5, sp.a_AU * 2.2), 0.15, 60000));
      return;
    }

    let targetZoom = orreryPxPerAU;
    if (entity.kind === 'planet') {
      const z = systemResult.zones[entity.zoneIdx];
      const b = z?.bodies[entity.bodyIdx];
      if (b && b.kind === 'planet') {
        const hasMoons = b.moons && b.moons.length > 0;
        targetZoom = hasMoons ? 12000 : 22000;
      } else {
        targetZoom = 1200;
      }
    } else if (entity.kind === 'moon') {
      targetZoom = 45000;
    } else if (entity.kind === 'belt') {
      const z = systemResult.zones[entity.zoneIdx];
      const b = z?.bodies[entity.bodyIdx];
      const beltA = b ? b.a : 3.0;
      targetZoom = clamp(260 / Math.max(0.5, beltA * 1.5), 0.15, 60000);
    }
    setOrreryPxPerAU(targetZoom);

    const pos = getBodyWorldPosAU(
      systemResult,
      entity,
      orreryTimeYr,
      orreryIncScale,
      orreryPitch,
      orreryYaw,
      targetZoom
    );
    if (!pos) return;
    setOrreryCamAU(pos);
  };

  // System persistent cache status & loading state
  const [isFromCache, setIsFromCache] = useState<boolean>(false);
  const [isGeneratingSystem, setIsGeneratingSystem] = useState<boolean>(false);
  const [generatingSystemLabel, setGeneratingSystemLabel] = useState<string>('Star System');
  const genRunIdRef = useRef<number>(0);

  const triggerRun = async (params: StarGenParams, forceRegenerate = false) => {
    const effectiveId =
      params.id ||
      `sys_${params.sysMass}_${params.age}_${params.feh}_${params.forcedMult || 'auto'}`;

    if (!forceRegenerate) {
      const cached = params.id
        ? universeCache.getCachedSystem(params.id)
        : universeCache.getLastActiveSystem() || universeCache.getCachedSystem(effectiveId);
      if (cached) {
        setSystemResult(cached);
        if (cached.step1) {
          if (typeof cached.step1.sysMass === 'number' && cached.step1.sysMass > 0) {
            setLogMass(+log10(cached.step1.sysMass).toFixed(3));
          }
          if (typeof cached.step1.age === 'number') setAge(cached.step1.age);
          if (typeof cached.step1.feh === 'number') setFeh(cached.step1.feh);
        }
        setIsFromCache(true);
        setIsGeneratingSystem(false);
        setSelectedEntity(null);
        setTrackedTarget(null);
        fitOrreryToFullSystem(cached);
        return;
      }
    }

    const runId = ++genRunIdRef.current;
    setGeneratingSystemLabel(params.name || params.id || `System (${params.sysMass} M☉)`);
    setIsGeneratingSystem(true);

    await yieldToMainThread();
    if (runId !== genRunIdRef.current) return;

    const res = runRealisticGenerator(params);
    const sysId = params.id || res.step1?.id || effectiveId;
    if (res.step1 && !res.step1.id) {
      res.step1.id = sysId;
    }
    universeCache.cacheLoadedSystem(sysId, res);
    if (runId !== genRunIdRef.current) return;

    setIsFromCache(false);
    setSystemResult(res);
    setSelectedEntity(null);
    setTrackedTarget(null);
    fitOrreryToFullSystem(res);
    setIsGeneratingSystem(false);
  };

  useEffect(() => {
    if (initialParams) {
      const newLogM = +log10(initialParams.sysMass).toFixed(3);
      setLogMass(newLogM);
      setAge(initialParams.age);
      setFeh(initialParams.feh);
      setForcedMult(initialParams.forcedMult || 'auto');
      setPresetKey('');
      void triggerRun(initialParams, false);
    } else {
      void triggerRun(
        {
          sysMass: +Math.pow(10, logMass).toFixed(3),
          age,
          feh,
          forcedMult,
        },
        false
      );
    }
  }, [initialParams]);

  // 3D Orrery live Keplerian orbit animation loop (with dynamic speed & camera tracking)
  useEffect(() => {
    if (!isActive || !orreryPlaying || mapMode !== 'orrery2d') return;
    let rafId = 0;
    const step = () => {
      setOrreryTimeYr((t) => {
        const nextTime = t + 0.0045 * orrerySpeed;
        if (trackedTarget && systemResult) {
          const targetPos = getBodyWorldPosAU(
            systemResult,
            trackedTarget,
            nextTime,
            orreryIncScale,
            orreryPitch,
            orreryYaw,
            orreryPxPerAU
          );
          if (targetPos) {
            setOrreryCamAU(targetPos);
          }
        }
        return nextTime;
      });
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [
    isActive,
    orreryPlaying,
    mapMode,
    orrerySpeed,
    trackedTarget,
    systemResult,
    orreryIncScale,
    orreryPitch,
    orreryYaw,
    orreryPxPerAU,
  ]);

  // Close blow-up modal on Escape
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedEntity) setSelectedEntity(null);
        else if (showPreProgramModal) setShowPreProgramModal(false);
        else if (showJsonModal) setShowJsonModal(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, selectedEntity, showPreProgramModal, showJsonModal]);

  // Keyboard navigation: Page Up for higher view level (Sector Hex Map), Page Down already at System
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const isPageKey =
        e.key === 'PageDown' ||
        e.code === 'PageDown' ||
        e.key === 'PageUp' ||
        e.code === 'PageUp';
      const isLabelKey = e.key === 'l' || e.key === 'L';
      const isQuickJumpKey = e.key === 'j' || e.key === 'J';
      const isLagrangeKey = e.key === 'p' || e.key === 'P';
      if (!isPageKey && !isLabelKey && !isQuickJumpKey && !isLagrangeKey) return;

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

      if (selectedEntity || showJsonModal || showPreProgramModal) return;

      if (isLabelKey) {
        e.preventDefault();
        e.stopPropagation();
        setShowLabels((v) => !v);
        return;
      }

      if (isQuickJumpKey) {
        e.preventDefault();
        e.stopPropagation();
        setShowQuickJump((v) => !v);
        return;
      }

      if (isLagrangeKey) {
        e.preventDefault();
        e.stopPropagation();
        setShowLagrange((v) => !v);
        return;
      }

      if (e.key === 'PageUp' || e.code === 'PageUp') {
        e.preventDefault();
        e.stopPropagation();
        handleBackToSectorWithTransition();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isActive,
    selectedEntity,
    showJsonModal,
    showPreProgramModal,
    handleBackToSectorWithTransition,
  ]);

  const handleParamChange = (
    newLogMass: number,
    newAge: number,
    newFeh: number,
    newMult: 'auto' | '1' | '2' | '3' | '4',
    clearPreset = true
  ) => {
    setLogMass(newLogMass);
    setAge(newAge);
    setFeh(newFeh);
    setForcedMult(newMult);
    if (clearPreset) setPresetKey('');
    triggerRun(
      {
        sysMass: +Math.pow(10, newLogMass).toFixed(3),
        age: newAge,
        feh: newFeh,
        forcedMult: newMult,
        seed: Math.floor(Math.random() * 2147483647),
        customStellarConfig: customStellarConfig?.enabled ? customStellarConfig : undefined,
      },
      true
    );
  };

  const handleRollPureIMF = () => {
    const p = rollStep1();
    const newLogM = +log10(p.sysMass).toFixed(2);
    setLogMass(newLogM);
    setAge(p.age);
    setFeh(p.feh);
    setPresetKey('');
    setCustomStellarConfig(undefined);
    triggerRun(
      {
        sysMass: p.sysMass,
        age: p.age,
        feh: p.feh,
        forcedMult,
        seed: Math.floor(Math.random() * 2147483647),
      },
      true
    );
  };

  const handleRerollKeepSliders = () => {
    triggerRun(
      {
        sysMass,
        age,
        feh,
        forcedMult,
        id: currentSysId,
        seed: Math.floor(Math.random() * 2147483647),
        customStellarConfig: customStellarConfig?.enabled ? customStellarConfig : undefined,
      },
      true
    );
  };

  const handleApplyCustomStars = (
    config: CustomStellarConfig,
    newAge: number,
    newFeh: number
  ) => {
    const totalMass = +config.stars
      .slice(0, config.nStars)
      .reduce((acc, s) => acc + (Number(s.mass) || 0.5), 0)
      .toFixed(3);
    const newLogM = +log10(Math.max(0.01, totalMass)).toFixed(3);
    setCustomStellarConfig(config);
    setLogMass(newLogM);
    setAge(newAge);
    setFeh(newFeh);
    setForcedMult(String(config.nStars) as '1' | '2' | '3' | '4');
    setPresetKey('');
    triggerRun(
      {
        sysMass: totalMass,
        age: newAge,
        feh: newFeh,
        forcedMult: String(config.nStars) as '1' | '2' | '3' | '4',
        id: currentSysId,
        seed: Math.floor(Math.random() * 2147483647),
        customStellarConfig: config,
      },
      true
    );
  };

  const handleRerollPlanetsOnly = () => {
    let activeConfig = customStellarConfig;
    if (!activeConfig?.enabled && systemResult && systemResult.hierarchy.stars.length > 0) {
      const nSt = Math.min(4, Math.max(1, systemResult.hierarchy.stars.length)) as 1 | 2 | 3 | 4;
      activeConfig = {
        enabled: true,
        nStars: nSt,
        trinaryTopology: systemResult.hierarchy.archName.includes('A + (B+C)')
          ? 'A_BC'
          : 'AB_C',
        stars: systemResult.hierarchy.stars.slice(0, nSt).map((st) => ({
          label: st.label,
          mass: st.mass,
          overrideMode: 'custom',
          category: st.category,
          spectralType: st.spectralType,
          lumNum: st.lumNum,
          radius: st.radius,
          Teff: st.Teff,
          colorHex: st.colorHex,
        })),
        splits: systemResult.hierarchy.splits.map((sp) => ({
          a_AU: sp.a_AU,
          e: sp.e,
        })),
      };
      setCustomStellarConfig(activeConfig);
    }
    triggerRun(
      {
        sysMass,
        age,
        feh,
        forcedMult,
        id: currentSysId,
        seed: Math.floor(Math.random() * 2147483647),
        customStellarConfig: activeConfig,
      },
      true
    );
  };

  const handleSelectPreset = (key: string) => {
    setPresetKey(key);
    const p = STARGEN_BENCHMARK_PRESETS[key];
    if (!p) return;
    setCustomStellarConfig(undefined);
    const newLogM = +log10(p.sysMass).toFixed(2);
    handleParamChange(newLogM, p.age, p.feh, p.forcedMult, false);
  };

  const sendZoneToArchitect = (zoneIdx: number) => {
    if (!systemResult) return;
    const archSys = convertRealisticToArchitectSystem(systemResult, zoneIdx);
    onOpenInArchitect(archSys);
  };

  // ============================================================================
  // UNIFIED FULL-SYSTEM LINEAR SCHEMATIC (CIRCUMBINARY ZONES BETWEEN BINARIES)
  // ============================================================================
  const renderUnifiedSystemSchematic = (res: RealisticStarSystemResult) => {
    const h = res.hierarchy;
    const zones = res.zones;

    // Determine global logarithmic AU bounds across all zones and binary splits
    let minAU = 0.012;
    let maxAU = 80;
    zones.forEach((z) => {
      minAU = Math.min(minAU, z.a_in * 0.65);
      maxAU = Math.max(maxAU, z.a_out * 1.35);
    });
    h.splits.forEach((sp) => {
      minAU = Math.min(minAU, sp.a_AU * 0.45);
      maxAU = Math.max(maxAU, sp.a_AU * 1.6, sp.pMin * 1.3);
    });
    minAU = clamp(minAU, 0.004, 0.05);
    maxAU = clamp(maxAU, 30, 5000);

    const lMin = log10(minAU);
    const lMax = log10(maxAU);

    // Build ordered linear rows so that:
    // - Every star (A, B, C, D) has its row in order
    // - Every Circumbinary (P-Type) zone row sits strictly BETWEEN its binary stars!
    type LinearRow =
      | {
          rowKind: 'star';
          starIdx: number;
          star: RealisticStarNode;
          zoneIdx: number | null;
          zone: RealisticPlanetaryZone | null;
          height: number;
        }
      | {
          rowKind: 'circumbinary';
          pairName: string;
          splitIdx: number;
          split: RealisticBinarySplit | null;
          zoneIdx: number;
          zone: RealisticPlanetaryZone;
          height: number;
        };

    const findStarZoneIdx = (label: string) =>
      zones.findIndex((z) => z.title.startsWith(`Star ${label} `));
    const findPZoneIdx = (pairName: string) =>
      zones.findIndex((z) => z.title.startsWith(`Circumbinary ${pairName}`));
    const findSplitIdx = (pairName: string) =>
      h.splits.findIndex((s) => s.pair === pairName);

    const addStarRow = (rows: LinearRow[], sIdx: number) => {
      const st = h.stars[sIdx];
      if (!st) return;
      const zIdx = findStarZoneIdx(st.label);
      const z = zIdx >= 0 ? zones[zIdx] : null;
      rows.push({
        rowKind: 'star',
        starIdx: sIdx,
        star: st,
        zoneIdx: zIdx >= 0 ? zIdx : null,
        zone: z,
        height: z ? 236 : 96,
      });
    };

    const addCircumbinaryRowIfPresent = (rows: LinearRow[], pairName: string) => {
      const zIdx = findPZoneIdx(pairName);
      if (zIdx < 0) return;
      const spIdx = findSplitIdx(pairName);
      rows.push({
        rowKind: 'circumbinary',
        pairName,
        splitIdx: spIdx >= 0 ? spIdx : 0,
        split: spIdx >= 0 ? h.splits[spIdx] : null,
        zoneIdx: zIdx,
        zone: zones[zIdx],
        height: 236,
      });
    };

    const linearRows: LinearRow[] = [];
    if (h.stars.length === 1) {
      addStarRow(linearRows, 0);
    } else if (h.stars.length === 2) {
      addStarRow(linearRows, 0);
      addCircumbinaryRowIfPresent(linearRows, 'AB');
      addStarRow(linearRows, 1);
    } else if (h.stars.length === 3) {
      const isAB_C = h.splits[0]?.pair === 'AB + C';
      if (isAB_C) {
        addStarRow(linearRows, 0);
        addCircumbinaryRowIfPresent(linearRows, 'AB');
        addStarRow(linearRows, 1);
        addCircumbinaryRowIfPresent(linearRows, 'AB + C');
        addStarRow(linearRows, 2);
      } else {
        addStarRow(linearRows, 0);
        addCircumbinaryRowIfPresent(linearRows, 'A + BC');
        addStarRow(linearRows, 1);
        addCircumbinaryRowIfPresent(linearRows, 'BC');
        addStarRow(linearRows, 2);
      }
    } else {
      addStarRow(linearRows, 0);
      addCircumbinaryRowIfPresent(linearRows, 'AB');
      addStarRow(linearRows, 1);
      addCircumbinaryRowIfPresent(linearRows, 'AB + CD');
      addStarRow(linearRows, 2);
      addCircumbinaryRowIfPresent(linearRows, 'CD');
      addStarRow(linearRows, 3);
    }

    const topHeaderH = 52;
    const bottomAxisH = 54;
    const W = 1520;
    const totalRowsH = linearRows.reduce((acc, r) => acc + r.height, 0);
    const H = topHeaderH + totalRowsH + bottomAxisH;

    const treeColW = 310;
    const padR = 45;
    const trackX1 = treeColW + 25;
    const trackX2 = W - padR;

    const mx = (au: number) =>
      trackX1 +
      ((log10(Math.max(minAU, Math.min(maxAU, au))) - lMin) / (lMax - lMin)) *
        (trackX2 - trackX1);

    const auTicks = [
      0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2500,
    ].filter((t) => t >= minAU * 1.05 && t <= maxAU * 0.95);

    // Precompute vertical top & center Y for each row
    let curY = topHeaderH;
    const rowYInfo = linearRows.map((r) => {
      const top = curY;
      const mid = curY + r.height * 0.52;
      curY += r.height;
      return { top, mid, height: r.height };
    });

    // Find vertical centers of each star row for drawing binary connector brackets
    const starRowMidY: Record<string, number> = {};
    linearRows.forEach((r, idx) => {
      if (r.rowKind === 'star') {
        starRowMidY[r.star.label] = rowYInfo[idx].mid;
      }
    });

    return (
      <div className="w-full overflow-x-auto custom-scrollbar bg-[#04070e] rounded-xl border border-slate-800/90 shadow-inner">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{
            width: `${Math.round(100 * mapZoom)}%`,
            minWidth: '1080px',
            height: 'auto',
            display: 'block',
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="starGlowGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="45%" stopColor="#38bdf8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
            <pattern
              id="beltPattern"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1.5" cy="1.5" r="0.9" fill="#94a3b8" fillOpacity="0.45" />
              <circle cx="4.5" cy="4.2" r="0.7" fill="#cbd5e1" fillOpacity="0.35" />
            </pattern>
          </defs>

          {/* Background Starfield Grid */}
          <rect x={0} y={0} width={W} height={H} fill="#04070e" />

          {/* Left Hierarchy Sidebar Column Background */}
          <rect
            x={10}
            y={10}
            width={treeColW}
            height={H - 20}
            rx={12}
            fill="#0a0f1a"
            stroke="#1e293b"
            strokeWidth={1.5}
          />
          <text
            x={26}
            y={34}
            fill="#38bdf8"
            fontSize={12}
            fontWeight="bold"
            fontFamily="monospace"
          >
            {h.stars.length === 1 ? 'STELLAR SYSTEM' : 'STELLAR HIERARCHY'}
          </text>

          {/* Vertical AU Grid Lines across all orbital lanes */}
          {auTicks.map((tk) => {
            const x = mx(tk);
            return (
              <g key={tk}>
                <line
                  x1={x}
                  y1={topHeaderH - 12}
                  x2={x}
                  y2={H - bottomAxisH + 8}
                  stroke="#131c2e"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={H - 22}
                  fill="#64748b"
                  fontSize={10.5}
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {tk >= 100 ? `${tk}` : tk} AU
                </text>
              </g>
            );
          })}

          {/* Left Column Binary Connector Line & Separation Badges in Gaps */}
          {h.stars.length >= 2 && (
            <g>
              {/* Main vertical spine joining all stars */}
              <line
                x1={26}
                y1={starRowMidY[h.stars[0].label] || topHeaderH + 40}
                x2={26}
                y2={starRowMidY[h.stars[h.stars.length - 1].label] || H - 80}
                stroke="#38bdf8"
                strokeWidth={2}
                strokeDasharray="4,3"
              />

              {/* Horizontal connector branches to each star card */}
              {h.stars.map((st) => {
                const y = starRowMidY[st.label];
                if (y == null) return null;
                return (
                  <line
                    key={`branch-${st.label}`}
                    x1={26}
                    y1={y}
                    x2={42}
                    y2={y}
                    stroke="#38bdf8"
                    strokeWidth={1.5}
                  />
                );
              })}

              {/* Split distance badges in the gaps between adjacent stars */}
              {h.stars.slice(0, -1).map((st1, i) => {
                const st2 = h.stars[i + 1];
                const y1 = starRowMidY[st1.label];
                const y2 = starRowMidY[st2.label];
                if (y1 == null || y2 == null) return null;
                const yMid = (y1 + y2) / 2;

                let split: RealisticBinarySplit | undefined;
                if (h.stars.length === 2) {
                  split = h.splits.find((s) => s.pair === 'AB') || h.splits[0];
                } else if (h.stars.length === 3) {
                  split =
                    i === 0
                      ? h.splits.find((s) => s.pair === 'AB' || s.pair === 'A + BC') || h.splits[0]
                      : h.splits.find((s) => s.pair === 'BC' || s.pair === 'AB + C') || h.splits[1];
                } else if (h.stars.length === 4) {
                  split =
                    i === 0
                      ? h.splits.find((s) => s.pair === 'AB')
                      : i === 1
                      ? h.splits.find((s) => s.pair === 'AB + CD')
                      : h.splits.find((s) => s.pair === 'CD');
                }

                if (!split) return null;
                const distLabel =
                  split.a_AU >= 100
                    ? `${Math.round(split.a_AU)} AU`
                    : split.a_AU < 1
                    ? `${split.a_AU.toFixed(2)} AU`
                    : `${split.a_AU.toFixed(1)} AU`;

                const spIdx = h.splits.findIndex((s) => s === split);

                return (
                  <g
                    key={`split-gap-${i}`}
                    className="cursor-pointer"
                    onClick={() => {
                      if (spIdx >= 0) setSelectedEntity({ kind: 'split', splitIdx: spIdx });
                    }}
                  >
                    <circle cx={26} cy={yMid} r={3} fill="#38bdf8" />
                    <line x1={26} y1={yMid} x2={44} y2={yMid} stroke="#38bdf8" strokeWidth={1.5} />
                    <rect
                      x={44}
                      y={yMid - 11}
                      width={80}
                      height={22}
                      rx={5}
                      fill="#0b1322"
                      stroke="#38bdf8"
                      strokeWidth={1.2}
                    />
                    <text
                      x={84}
                      y={yMid + 4}
                      fill="#38bdf8"
                      fontSize={10}
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {distLabel}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* Render Ordered Linear Rows (Stars + Circumbinary Zones Between Binaries) */}
          {linearRows.map((row, rIdx) => {
            const { top: laneTop, mid: midY, height: laneHeight } = rowYInfo[rIdx];

            const leftNode =
              row.rowKind === 'star' ? (
                (() => {
                  const st = row.star;
                  const sIdx = row.starIdx;
                  const sRad = clamp(12 + 4 * log10(Math.max(0.08, st.mass)), 9, 20);
                  const isSelected =
                    selectedEntity?.kind === 'star' && selectedEntity.starIdx === sIdx;

                  return (
                    <g
                      className="cursor-pointer"
                      onClick={(e) => {
                        if (e.shiftKey) {
                          setMapMode('orrery2d');
                          handleTrackBody({ kind: 'star', starIdx: sIdx });
                        } else {
                          setSelectedEntity({ kind: 'star', starIdx: sIdx });
                        }
                      }}
                    >
                      <rect
                        x={42}
                        y={midY - 34}
                        width={262}
                        height={68}
                        rx={10}
                        fill={isSelected ? '#172554' : '#111827'}
                        stroke={isSelected ? '#38bdf8' : '#2a3852'}
                        strokeWidth={isSelected ? 2 : 1.2}
                      />
                      {(() => {
                        const catLower = (st.category || '').toLowerCase();
                        const spLower = (st.spectralType || '').toLowerCase();
                        const isSMBH = catLower.includes('supermassive') || spLower.includes('smbh') || st.mass > 999999;
                        const isBH = isSMBH || catLower.includes('black hole') || spLower.includes('black hole') || spLower === 'bh' || spLower.startsWith('bh ');
                        if (isBH) {
                          const rH = isSMBH ? 8.0 : 4.2;
                          const rxD = isSMBH ? 15 : 9.5;
                          const ryD = isSMBH ? 5.5 : 3.5;
                          return (
                            <g>
                              <circle cx={74} cy={midY} r={rxD * 1.3} fill="#a855f7" opacity={0.25} />
                              <ellipse cx={74} cy={midY} rx={rxD} ry={ryD} stroke="#c084fc" strokeWidth={1.2} fill="none" transform={`rotate(-18, 74, ${midY})`} />
                              <ellipse cx={74} cy={midY} rx={rxD * 0.75} ry={ryD * 0.75} stroke="#f3e8ff" strokeWidth={0.8} fill="none" transform={`rotate(-18, 74, ${midY})`} />
                              <circle cx={74} cy={midY} r={rH} fill="#000000" stroke="#c084fc" strokeWidth={1} />
                            </g>
                          );
                        }
                        const starSpriteSize = (sRad / 0.42) * 2;
                        const starSpriteUrl = getProceduralStarSpriteDataUrl(st, 96);
                        return (
                          <g>
                            <circle
                              cx={74}
                              cy={midY}
                              r={sRad * 1.55}
                              fill={st.colorHex}
                              fillOpacity={0.22}
                            />
                            <image
                              href={starSpriteUrl}
                              x={74 - starSpriteSize / 2}
                              y={midY - starSpriteSize / 2}
                              width={starSpriteSize}
                              height={starSpriteSize}
                              preserveAspectRatio="xMidYMid meet"
                            />
                          </g>
                        );
                      })()}
                      <text
                        x={104}
                        y={midY - 4}
                        fill="#ffffff"
                        fontSize={13}
                        fontWeight="bold"
                        fontFamily="sans-serif"
                      >
                        Star {st.label} · {st.spectralType}
                      </text>
                      <text
                        x={104}
                        y={midY + 14}
                        fill="#94a3b8"
                        fontSize={10.5}
                        fontFamily="monospace"
                      >
                        {st.mass} M☉ · {st.lum} L☉ · {st.Teff}K
                      </text>
                    </g>
                  );
                })()
              ) : (
                <g
                  className="cursor-pointer"
                  onClick={() =>
                    setSelectedEntity({ kind: 'split', splitIdx: row.splitIdx })
                  }
                >
                  <line
                    x1={26}
                    y1={midY}
                    x2={42}
                    y2={midY}
                    stroke="#fbbf24"
                    strokeWidth={2}
                  />
                  <rect
                    x={42}
                    y={midY - 28}
                    width={262}
                    height={56}
                    rx={10}
                    fill="#17130a"
                    stroke="#fbbf24"
                    strokeWidth={1.5}
                    strokeDasharray="5,3"
                  />
                  <text
                    x={173}
                    y={midY - 6}
                    fill="#fde68a"
                    fontSize={11.5}
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    ⚡ Circumbinary [{row.pairName}]
                  </text>
                  <text
                    x={173}
                    y={midY + 12}
                    fill="#fbbf24"
                    fontSize={9.5}
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {row.split
                      ? `Binary a = ${row.split.a_AU} AU (e=${row.split.e}) · P-Type`
                      : 'P-Type Circumbinary Zone'}
                  </text>
                </g>
              );

            if (row.rowKind === 'star' && (!row.zone || row.zoneIdx === null)) {
              return (
                <g key={`row-${rIdx}`}>
                  {leftNode}
                  <rect
                    x={trackX1 - 8}
                    y={laneTop + 10}
                    width={trackX2 - trackX1 + 16}
                    height={laneHeight - 20}
                    rx={10}
                    fill="#080c15"
                    stroke="#1e293b"
                    strokeDasharray="4,4"
                  />
                  <text
                    x={(trackX1 + trackX2) / 2}
                    y={midY + 4}
                    fill="#64748b"
                    fontSize={11}
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    Star {row.star.label} Circumstellar (S-Type) Zone Cleared by Close Binary Companion — Orbits Form in Circumbinary Zone
                  </text>
                </g>
              );
            }

            const z = row.zone!;
            const zIdx = row.zoneIdx!;
            const xIn = mx(z.a_in);
            const xOut = mx(z.a_out);
            const isCircumbinary = row.rowKind === 'circumbinary' || z.title.includes('Circumbinary');

            const hzInAU = 0.75 * Math.sqrt(z.lum);
            const hzOutAU = 1.7 * Math.sqrt(z.lum);
            // For a circumbinary system, do NOT show Habitable Zone or Snow Line if they fall inside the binary pair's orbit / inner stability limit (z.a_in)
            const showHZ = isCircumbinary
              ? hzInAU >= z.a_in && hzInAU < z.a_out
              : hzInAU < z.a_out;
            const showSnow = isCircumbinary
              ? z.a_snow >= z.a_in && z.a_snow <= z.a_out
              : z.a_snow <= z.a_out;

            const xH1 = mx(Math.max(z.a_in, hzInAU));
            const xH2 = mx(Math.min(z.a_out, hzOutAU));
            const xSnow = mx(z.a_snow);

            return (
              <g key={`row-${rIdx}`}>
                {leftNode}

                {/* Zone Lane Container */}
                <rect
                  x={trackX1 - 8}
                  y={laneTop + 6}
                  width={trackX2 - trackX1 + 16}
                  height={laneHeight - 12}
                  rx={10}
                  fill="#080d18"
                  stroke={isCircumbinary ? '#fbbf2444' : '#1e293b'}
                  strokeWidth={1.2}
                />

                {/* Zone Header Telemetry */}
                <text
                  x={trackX1 + 8}
                  y={laneTop + 26}
                  fill="#38bdf8"
                  fontSize={10.5}
                  fontFamily="monospace"
                >
                  {isCircumbinary ? (
                    <tspan fill="#fde68a" fontWeight="bold">
                      {z.title} &bull;{' '}
                    </tspan>
                  ) : null}
                  Disk: {z.diskMassEarth} M⊕
                  {showHZ && xH2 > xH1
                    ? ` · Habitable Zone: ${hzInAU.toFixed(2)} – ${hzOutAU.toFixed(2)} AU`
                    : ''}
                  {showSnow ? ` · Snow Line: ${z.a_snow.toFixed(2)} AU` : ''} · Stable Zone: [
                  {z.a_in.toFixed(2)} – {z.a_out.toFixed(2)} AU]
                </text>

                {/* Habitable Zone Shaded Band (hidden if inside circumbinary orbit) */}
                {showHZ && xH2 > xH1 && (
                  <g>
                    <rect
                      x={xH1}
                      y={laneTop + 48}
                      width={Math.max(4, xH2 - xH1)}
                      height={laneHeight - 66}
                      fill="rgba(16, 185, 129, 0.11)"
                      stroke="rgba(16, 185, 129, 0.32)"
                      strokeWidth={1}
                      rx={4}
                    />
                    <text
                      x={(xH1 + xH2) / 2}
                      y={laneTop + 60}
                      fill="#34d399"
                      fontSize={9}
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      HABITABLE ZONE
                    </text>
                  </g>
                )}

                {/* Snow Line Vertical Marker (hidden if inside circumbinary orbit) */}
                {showSnow && (
                  <g>
                    <line
                      x1={xSnow}
                      y1={laneTop + 48}
                      x2={xSnow}
                      y2={laneTop + laneHeight - 18}
                      stroke="#38bdf8"
                      strokeWidth={1.5}
                      strokeDasharray="5,4"
                    />
                  </g>
                )}

                {/* Forbidden Inner / Outer Truncation Boundaries */}
                {xIn > trackX1 + 4 && (
                  <rect
                    x={trackX1}
                    y={midY - 12}
                    width={xIn - trackX1}
                    height={24}
                    fill="rgba(239,68,68,0.08)"
                  />
                )}
                {xOut < trackX2 - 4 && (
                  <rect
                    x={xOut}
                    y={midY - 12}
                    width={trackX2 - xOut}
                    height={24}
                    fill="rgba(239,68,68,0.08)"
                  />
                )}

                {/* Active Dynamical Zone Spine Line */}
                <line
                  x1={xIn}
                  y1={midY}
                  x2={xOut}
                  y2={midY}
                  stroke="#334155"
                  strokeWidth={2.5}
                />

                {/* Host Star(s) Anchor Icon at Left of Zone Spine */}
                {isCircumbinary && h.stars.length >= 2 ? (
                  <g
                    className="cursor-pointer"
                    onClick={() => setSelectedEntity({ kind: 'star', starIdx: 0 })}
                  >
                    <circle
                      cx={Math.max(trackX1 + 14, xIn - 18)}
                      cy={midY - 6}
                      r={7}
                      fill={h.stars[0].colorHex}
                      stroke="#fff"
                      strokeWidth={1}
                    />
                    <circle
                      cx={Math.max(trackX1 + 22, xIn - 10)}
                      cy={midY + 6}
                      r={5.5}
                      fill={h.stars[1].colorHex}
                      stroke="#fff"
                      strokeWidth={1}
                    />
                  </g>
                ) : (
                  <circle
                    cx={Math.max(trackX1 + 12, xIn - 12)}
                    cy={midY}
                    r={8}
                    fill={
                      h.stars.find((s) => z.title.includes(`Star ${s.label}`))?.colorHex ||
                      h.stars[0].colorHex
                    }
                    stroke="#fff"
                    strokeWidth={1}
                    className="cursor-pointer"
                    onClick={() => setSelectedEntity({ kind: 'star', starIdx: 0 })}
                  />
                )}

                {/* Planets, Belts & Clickable Moons */}
                {z.bodies.map((b, bIdx) => {
                  const bx = mx(b.a);
                  const num = bIdx + 1;
                  const labelAbove = bIdx % 2 === 1;

                  if (b.kind === 'belt') {
                    const b1 = mx(Math.max(minAU, b.a - b.beltWidth));
                    const b2 = mx(Math.min(maxAU, b.a + b.beltWidth));
                    const isSel =
                      selectedEntity?.kind === 'belt' &&
                      selectedEntity.zoneIdx === zIdx &&
                      selectedEntity.bodyIdx === bIdx;

                    return (
                      <g
                        key={bIdx}
                        className="cursor-pointer group"
                        onClick={() =>
                          setSelectedEntity({
                            kind: 'belt',
                            zoneIdx: zIdx,
                            bodyIdx: bIdx,
                          })
                        }
                      >
                        <rect
                          x={b1}
                          y={midY - 26}
                          width={Math.max(8, b2 - b1)}
                          height={52}
                          fill="url(#beltPattern)"
                          stroke={isSel ? '#38bdf8' : '#64748b'}
                          strokeWidth={isSel ? 2 : 1}
                          strokeDasharray="3,2"
                          rx={5}
                        />
                        <text
                          x={bx}
                          y={midY + 38}
                          fill="#94a3b8"
                          fontSize={9.5}
                          fontFamily="monospace"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          #{num} ({b.a.toFixed(2)} AU)
                        </text>
                      </g>
                    );
                  }

                  // Planet Node
                  const rP = clamp(
                    6.5 + (4.2 * Math.log(Math.max(0.4, b.radiusEarth))) / Math.LN2,
                    6.5,
                    21
                  );
                  const zoneStar =
                    h.stars.find((s) => z.title.includes(`Star ${s.label}`)) ||
                    h.stars[0];
                  const planetIconUrl = getProceduralPlanetIconDataUrl(
                    b,
                    null,
                    zoneStar?.colorHex || '#fff4e6',
                    zoneStar?.Teff || 5778,
                    0,
                    56
                  );
                  const planetImgSize = b.rings ? rP * 3.85 : rP * 2.75;
                  const isPlanetSel =
                    selectedEntity?.kind === 'planet' &&
                    selectedEntity.zoneIdx === zIdx &&
                    selectedEntity.bodyIdx === bIdx;

                  const moonDir = labelAbove ? 1 : -1;
                  const labelY1 = labelAbove ? midY - rP - 19 : midY + rP + 14;
                  const labelY2 = labelAbove ? midY - rP - 7 : midY + rP + 25;

                  return (
                    <g key={bIdx}>
                      {/* Eccentricity Perihelion-Aphelion Whisker */}
                      <line
                        x1={mx(b.a * (1 - b.e))}
                        y1={midY}
                        x2={mx(b.a * (1 + b.e))}
                        y2={midY}
                        stroke="#94a3b8"
                        strokeWidth={2.5}
                      />

                      {/* Vertical Moon Chain Spine */}
                      {b.moons.length > 0 && (
                        <line
                          x1={bx}
                          y1={midY + moonDir * rP}
                          x2={bx}
                          y2={midY + moonDir * (rP + b.moons.length * 15 + 4)}
                          stroke="#475569"
                          strokeWidth={1.2}
                          strokeDasharray="2,2"
                        />
                      )}

                      {/* Clickable Moon Nodes (Low-Res Procedural Moon Icons on Overview) */}
                      {b.moons.map((m, mIdx) => {
                        const my = midY + moonDir * (rP + 13 + mIdx * 15);
                        const mRad = clamp(
                          3.4 + 0.9 * log10(Math.max(0.01, m.massLunar * 10)),
                          3.4,
                          6.2
                        );
                        const moonIconUrl = getProceduralPlanetIconDataUrl(
                          b,
                          m,
                          zoneStar?.colorHex || '#fff4e6',
                          zoneStar?.Teff || 5778,
                          mIdx,
                          36
                        );
                        const moonImgSize = mRad * 2.75;
                        const isMoonSel =
                          selectedEntity?.kind === 'moon' &&
                          selectedEntity.zoneIdx === zIdx &&
                          selectedEntity.bodyIdx === bIdx &&
                          selectedEntity.moonIdx === mIdx;

                        return (
                          <g
                            key={m.id || mIdx}
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (e.shiftKey) {
                                setMapMode('orrery2d');
                                handleTrackBody({
                                  kind: 'moon',
                                  zoneIdx: zIdx,
                                  bodyIdx: bIdx,
                                  moonIdx: mIdx,
                                });
                              } else {
                                setSelectedEntity({
                                  kind: 'moon',
                                  zoneIdx: zIdx,
                                  bodyIdx: bIdx,
                                  moonIdx: mIdx,
                                });
                              }
                            }}
                          >
                            <title>
                              {m.name} ({m.moonClass}) — Click for details · Shift+Click to track in Orrery
                            </title>
                            <circle cx={bx} cy={my} r={mRad + 3} fill="transparent" />
                            {isMoonSel && (
                              <circle
                                cx={bx}
                                cy={my}
                                r={mRad + 2}
                                fill="none"
                                stroke="#ffffff"
                                strokeWidth={1.5}
                              />
                            )}
                            <image
                              href={moonIconUrl}
                              x={bx - moonImgSize / 2}
                              y={my - moonImgSize / 2}
                              width={moonImgSize}
                              height={moonImgSize}
                            />
                          </g>
                        );
                      })}

                      {/* Clickable Planet Group */}
                      {(() => {
                        const claimInfo = getPlanetClaimInfo(b, zIdx, bIdx);
                        return (
                          <g
                            className="cursor-pointer"
                            onClick={(e) => {
                              if (e.shiftKey) {
                                setMapMode('orrery2d');
                                handleTrackBody({
                                  kind: 'planet',
                                  zoneIdx: zIdx,
                                  bodyIdx: bIdx,
                                });
                              } else {
                                setSelectedEntity({
                                  kind: 'planet',
                                  zoneIdx: zIdx,
                                  bodyIdx: bIdx,
                                });
                              }
                            }}
                          >
                            <title>{`${claimInfo ? `[${claimInfo.empire.name} — ${claimInfo.designation}] ` : ''}Planet #${bIdx + 1}: ${b.planetClass.replace(/\s*\([^)]*\)/g, '')} — Click for details · Shift+Click to track in Orrery`}</title>
                            {/* Selection / Habitable Halo */}
                            {(isPlanetSel || b.planetClass.includes('Habitable')) && (
                              <circle
                                cx={bx}
                                cy={midY}
                                r={rP + 4.5}
                                fill="none"
                                stroke={isPlanetSel ? '#38bdf8' : '#10b981'}
                                strokeWidth={isPlanetSel ? 2.2 : 1.5}
                                strokeDasharray={isPlanetSel ? undefined : '3,2'}
                              />
                            )}

                            {/* Imperial Sovereignty Halo */}
                            {claimInfo && (
                              <circle
                                cx={bx}
                                cy={midY}
                                r={rP + (isPlanetSel ? 6.5 : 4.5)}
                                fill="none"
                                stroke={claimInfo.empire.color}
                                strokeWidth={2.0}
                                strokeDasharray={claimInfo.designation === 'Capital' ? undefined : '4,2'}
                              />
                            )}

                            {/* Low-Res Procedural Planet Portrait Icon (includes 3D rings, eyeball oceans, magma, bands) */}
                            <image
                              href={planetIconUrl}
                              x={bx - planetImgSize / 2}
                              y={midY - planetImgSize / 2}
                              width={planetImgSize}
                              height={planetImgSize}
                            />

                            {/* Minimal Label: ONLY Planet Number & Semi-Major Axis to 2 Decimal Places */}
                            <text
                              x={bx}
                              y={labelY1}
                              fill={claimInfo ? claimInfo.empire.color : '#f8fafc'}
                              fontSize={10}
                              fontWeight="bold"
                              fontFamily="monospace"
                              textAnchor="middle"
                            >
                              {claimInfo ? (claimInfo.designation === 'Capital' ? '👑 ' : '🚩 ') : ''}#{num}
                            </text>
                            <text
                              x={bx}
                              y={labelY2}
                              fill="#94a3b8"
                              fontSize={9}
                              fontFamily="monospace"
                              textAnchor="middle"
                            >
                              {b.a.toFixed(2)} AU
                            </text>
                          </g>
                        );
                      })()}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    );
  };



  // ============================================================================
  // 3D INTERACTIVE PROPORTIONAL MULTI-STAR ORRERY & ORBITS VIEW
  // ============================================================================
  const render2DTopDownOrrery = (res: RealisticStarSystemResult) => {
    const layout = computeSystem2DLayout(res, orreryTimeYr);
    const viewW = 1040;
    const viewH = 680;
    const cxScreen = viewW / 2;
    const cyScreen = viewH / 2;

    const cosYaw = Math.cos(orreryYaw);
    const sinYaw = Math.sin(orreryYaw);
    const cosPitch = Math.cos(orreryPitch);
    const sinPitch = Math.sin(orreryPitch);

    // Camera distance in AU for subtle 3D perspective foreshortening
    const camDistAU = 720 / Math.max(0.05, orreryPxPerAU);

    const project3D = (wx: number, wy: number, wz = 0) => {
      const camZ = orreryCamAU.z ?? 0;
      const dx = wx - orreryCamAU.x;
      const dy = wy - orreryCamAU.y;
      const dz = wz - camZ;
      const x1 = dx * cosYaw - dy * sinYaw;
      const y1 = dx * sinYaw + dy * cosYaw;
      const xCam = x1;
      const yCam = y1 * cosPitch - dz * sinPitch;
      const zCam = y1 * sinPitch + dz * cosPitch;
      const persp = clamp(
        camDistAU / Math.max(camDistAU * 0.28, camDistAU + zCam * 0.36),
        0.52,
        1.75
      );
      return {
        x: cxScreen + xCam * orreryPxPerAU * persp,
        y: cyScreen + yCam * orreryPxPerAU * persp,
        zCam,
        scale: persp,
      };
    };

    // Fast 2D screen-space circle culling against the [0, viewW] x [0, viewH] viewport
    const isCircleInViewport = (sx: number, sy: number, radPx: number, pad = 48): boolean =>
      sx + radPx >= -pad &&
      sx - radPx <= viewW + pad &&
      sy + radPx >= -pad &&
      sy - radPx <= viewH + pad;

    // World-space AU frustum radius around camera for O(1) radial culling of orbits and belts
    const minPitchScale = Math.max(0.18, Math.abs(cosPitch)) * 0.5;
    const viewRadiusAU =
      (Math.hypot(viewW * 0.5, viewH * 0.5) / Math.max(0.05, orreryPxPerAU * minPitchScale)) * 1.35;

    const doesRadialBandIntersectViewport = (
      centerAU: Vec2AU,
      rInnerAU: number,
      rOuterAU: number
    ): boolean => {
      const distCamAU = Math.hypot(orreryCamAU.x - centerAU.x, orreryCamAU.y - centerAU.y);
      return rOuterAU >= distCamAU - viewRadiusAU && rInnerAU <= distCamAU + viewRadiusAU;
    };

    // Clips a sequence of projected 2D points to the viewport and returns only visible sub-paths
    const buildClippedScreenPath = (
      pts: Array<{ x: number; y: number }>,
      closed: boolean,
      pad = 260
    ): string => {
      if (pts.length === 0) return '';
      const inBox = (p: { x: number; y: number }) =>
        p.x >= -pad && p.x <= viewW + pad && p.y >= -pad && p.y <= viewH + pad;
      const cmds: string[] = [];
      let penDown = false;
      const total = closed ? pts.length : pts.length - 1;
      for (let i = 0; i < total; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % pts.length];
        if (inBox(p0) || inBox(p1)) {
          if (!penDown) {
            cmds.push(`M${p0.x.toFixed(1)},${p0.y.toFixed(1)}`);
            penDown = true;
          }
          cmds.push(`L${p1.x.toFixed(1)},${p1.y.toFixed(1)}`);
        } else {
          penDown = false;
        }
      }
      return cmds.join(' ');
    };

    // Build a 3D circle/ellipse SVG path in the Z=0 plane around (cxAU, cyAU) with O(1) radial & viewport culling
    const build3DCirclePath = (
      cxAU: number,
      cyAU: number,
      radiusAU: number,
      steps = 56,
      reverse = false,
      forceClosed = false
    ): string => {
      if (!forceClosed && !doesRadialBandIntersectViewport({ x: cxAU, y: cyAU }, radiusAU, radiusAU)) {
        return '';
      }
      const rPx = radiusAU * orreryPxPerAU;
      if (forceClosed || rPx <= 1600) {
        const pts: string[] = [];
        for (let i = 0; i <= steps; i++) {
          const idx = reverse ? steps - i : i;
          const ang = (idx / steps) * Math.PI * 2;
          const p = project3D(
            cxAU + radiusAU * Math.cos(ang),
            cyAU + radiusAU * Math.sin(ang),
            0
          );
          pts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`);
        }
        return pts.join(' ') + ' Z';
      }

      // High-zoom adaptive angular window around camera
      const distCamAU = Math.hypot(orreryCamAU.x - cxAU, orreryCamAU.y - cyAU);
      const camAng = Math.atan2(orreryCamAU.y - cyAU, orreryCamAU.x - cxAU);
      const halfSpan =
        distCamAU > viewRadiusAU
          ? Math.min(Math.PI, Math.asin(Math.min(1, viewRadiusAU / distCamAU)) + 0.12)
          : Math.PI;
      const sampleSteps = 48;
      const projPts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i <= sampleSteps; i++) {
        const frac = (i / sampleSteps) * 2 - 1;
        const ang = camAng + frac * halfSpan;
        const p = project3D(
          cxAU + radiusAU * Math.cos(ang),
          cyAU + radiusAU * Math.sin(ang),
          0
        );
        projPts.push({ x: p.x, y: p.y });
      }
      return buildClippedScreenPath(projPts, false);
    };

    // Evaluate a 3D point on an inclined Keplerian orbit around centerAU
    const evalKepler3D = (
      centerAU: Vec2AU,
      a: number,
      e: number,
      incRad: number,
      omegaNode: number,
      argPeri: number,
      trueAnomaly: number
    ) => {
      const eSafe = clamp(e, 0, 0.92);
      const r = (a * (1 - eSafe * eSafe)) / (1 + eSafe * Math.cos(trueAnomaly));
      const u = argPeri + trueAnomaly;
      const cosO = Math.cos(omegaNode);
      const sinO = Math.sin(omegaNode);
      const cosU = Math.cos(u);
      const sinU = Math.sin(u);
      const cosI = Math.cos(incRad);
      const sinI = Math.sin(incRad);

      const wx = centerAU.x + r * (cosO * cosU - sinO * sinU * cosI);
      const wy = centerAU.y + r * (sinO * cosU + cosO * sinU * cosI);
      const wz = r * (sinU * sinI);
      return { wx, wy, wz, r };
    };

    const buildKepler3DPath = (
      centerAU: Vec2AU,
      a: number,
      e: number,
      incRad: number,
      omegaNode: number,
      argPeri: number,
      steps = 64
    ): string => {
      const eSafe = clamp(e, 0, 0.92);
      const rPeri = a * (1 - eSafe);
      const rApo = a * (1 + eSafe);
      if (!doesRadialBandIntersectViewport(centerAU, rPeri * Math.cos(incRad), rApo)) {
        return '';
      }
      if (rApo * orreryPxPerAU <= 1600) {
        const pts: string[] = [];
        for (let i = 0; i <= steps; i++) {
          const nu = (i / steps) * Math.PI * 2;
          const pos3 = evalKepler3D(centerAU, a, e, incRad, omegaNode, argPeri, nu);
          const p = project3D(pos3.wx, pos3.wy, pos3.wz);
          pts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`);
        }
        return pts.join(' ') + ' Z';
      }

      // High-zoom adaptive sampling & viewport clipping so offscreen orbit segments are never rendered
      const coarseSteps = 72;
      const cmds: string[] = [];
      const pad = 220;
      const inBox = (px: number, py: number) =>
        px >= -pad && px <= viewW + pad && py >= -pad && py <= viewH + pad;

      for (let i = 0; i < coarseSteps; i++) {
        const nu0 = (i / coarseSteps) * Math.PI * 2;
        const nu1 = ((i + 1) / coarseSteps) * Math.PI * 2;
        const pos0 = evalKepler3D(centerAU, a, e, incRad, omegaNode, argPeri, nu0);
        const pos1 = evalKepler3D(centerAU, a, e, incRad, omegaNode, argPeri, nu1);
        const p0 = project3D(pos0.wx, pos0.wy, pos0.wz);
        const p1 = project3D(pos1.wx, pos1.wy, pos1.wz);
        const pMidPos = evalKepler3D(centerAU, a, e, incRad, omegaNode, argPeri, 0.5 * (nu0 + nu1));
        const pMid = project3D(pMidPos.wx, pMidPos.wy, pMidPos.wz);

        if (inBox(p0.x, p0.y) || inBox(p1.x, p1.y) || inBox(pMid.x, pMid.y)) {
          const subSteps = 8;
          for (let s = 0; s <= subSteps; s++) {
            const nu = nu0 + (s / subSteps) * (nu1 - nu0);
            const ps = evalKepler3D(centerAU, a, e, incRad, omegaNode, argPeri, nu);
            const pr = project3D(ps.wx, ps.wy, ps.wz);
            cmds.push(`${s === 0 ? 'M' : 'L'}${pr.x.toFixed(1)},${pr.y.toFixed(1)}`);
          }
        }
      }
      return cmds.join(' ');
    };

    // Compute a clean physical scale bar in AU for the bottom-left overlay
    const rawBarAU = 120 / Math.max(1e-6, orreryPxPerAU);
    const mag = Math.pow(10, Math.floor(log10(rawBarAU)));
    const residual = rawBarAU / mag;
    const niceMult = residual >= 5 ? 5 : residual >= 2 ? 2 : 1;
    const barAU = niceMult * mag;
    const barPx = barAU * orreryPxPerAU;

    const focusCameraOn = (centerAU: Vec2AU, targetOuterAU: number) => {
      setOrreryCamAU({ x: centerAU.x, y: centerAU.y, z: 0 });
      setOrreryPxPerAU(clamp(260 / Math.max(0.05, targetOuterAU), 0.15, 60000));
    };

    // Collect depth-sorted 3Dforeground renderables (stars, planets, moons) so nearer 3D bodies occlude farther ones
    const depthNodes: Array<{ zCam: number; key: string; node: React.ReactNode }> = [];

    return (
      <div className={`w-full flex flex-col ${showUI ? 'gap-2.5 bg-[#04070e] rounded-xl border border-slate-800/90 p-3' : 'gap-0 bg-transparent border-0 rounded-none p-0'}`}>
        {/* Top Interactive 3D Camera, Orientation & Zoom Control Bar */}
        {showUI && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0b111e] px-3 py-2 rounded-lg border border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-mono text-slate-400 mr-1">
                Camera Focus:
              </span>
            <button
              type="button"
              onClick={() => {
                setTrackedTarget(null);
                fitOrreryToFullSystem(res);
              }}
              className="px-2.5 py-1 rounded bg-sky-600/90 hover:bg-sky-500 text-white text-xs font-mono font-bold cursor-pointer transition"
            >
              Whole System
            </button>
            {trackedTarget && (
              <div className="flex items-center gap-1.5 bg-indigo-950/90 text-indigo-200 border border-indigo-500/70 px-2 py-0.5 rounded text-[11px] font-mono shadow-sm">
                <Crosshair className="w-3 h-3 text-indigo-400 animate-pulse" />
                <span>
                  Tracking{' '}
                  {trackedTarget.kind === 'planet'
                    ? `#${trackedTarget.bodyIdx + 1} (${res.zones[trackedTarget.zoneIdx]?.bodies[trackedTarget.bodyIdx]?.a.toFixed(2)} AU)`
                    : trackedTarget.kind === 'moon'
                    ? (() => {
                        const pb = res.zones[trackedTarget.zoneIdx]?.bodies[trackedTarget.bodyIdx];
                        const m = pb && pb.kind === 'planet' ? pb.moons[trackedTarget.moonIdx] : null;
                        return m ? `${m.name}` : 'Moon';
                      })()
                    : 'Star'}
                </span>
                <button
                  type="button"
                  onClick={() => setTrackedTarget(null)}
                  className="text-slate-400 hover:text-white ml-1 cursor-pointer"
                  title="Unlock Camera Tracking"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {res.hierarchy.stars.map((st) => {
              const sPos = layout.starPos[st.label] || { x: 0, y: 0 };
              const sZone = res.zones.find((z) =>
                z.title.startsWith(`Star ${st.label} `)
              );
              const maxPlanetA = sZone
                ? sZone.bodies.reduce((m, b) => Math.max(m, b.a), sZone.a_in * 4)
                : 2.5;
              return (
                <button
                  key={st.label}
                  type="button"
                  onClick={() => {
                    setTrackedTarget(null);
                    focusCameraOn(sPos, maxPlanetA * 1.25);
                  }}
                  className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-mono flex items-center gap-1.5 cursor-pointer transition"
                >
                  <img
                    src={getProceduralStarSpriteDataUrl(st, 40)}
                    alt=""
                    className="w-3.5 h-3.5 shrink-0"
                  />
                  Star {st.label}
                </button>
              );
            })}
            {res.zones
              .map((z, idx) => ({ z, idx }))
              .filter(({ z }) => z.title.includes('Circumbinary'))
              .map(({ z, idx }) => {
                const cPos = layout.zoneCenters[idx] || { x: 0, y: 0 };
                const maxBodyA = z.bodies.reduce(
                  (m, b) => Math.max(m, b.a),
                  z.a_in * 3
                );
                return (
                  <button
                    key={z.title}
                    type="button"
                    onClick={() => {
                      setTrackedTarget(null);
                      focusCameraOn(cPos, maxBodyA * 1.25);
                    }}
                    className="px-2.5 py-1 rounded bg-amber-950/60 hover:bg-amber-900/70 text-amber-200 border border-amber-700/60 text-xs font-mono cursor-pointer transition"
                  >
                    {z.title.replace(' (P-Type)', '')}
                  </button>
                );
              })}
          </div>

          {/* 3D Orientation Presets, Orbit Animation & Zoom Controls */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
            {/* Play / Pause Live 3D Orbits */}
            <button
              type="button"
              onClick={() => setOrreryPlaying((p) => !p)}
              className={`px-2 py-1 rounded flex items-center gap-1 border cursor-pointer transition ${
                orreryPlaying
                  ? 'bg-emerald-600 text-white border-emerald-400 font-bold'
                  : 'bg-slate-900 hover:bg-slate-800 text-emerald-300 border-slate-700'
              }`}
              title="Animate 3D Keplerian Orbits"
            >
              {orreryPlaying ? (
                <Pause className="w-3 h-3" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              {orreryPlaying ? 'Pause' : 'Orbit'}
            </button>

            {/* Keplerian Orbit Speed Slider (up to 10x slower) */}
            <div
              className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded border border-slate-700 text-[11px] font-mono"
              title="Orbit Speed Slider: 0.1× is 10× slower than baseline"
            >
              <Gauge className="w-3 h-3 text-sky-400" />
              <span className="text-slate-400 text-[10px]">Speed:</span>
              <input
                type="range"
                min={0.1}
                max={2.0}
                step={0.05}
                value={orrerySpeed}
                onChange={(e) => setOrrerySpeed(parseFloat(e.target.value))}
                className="w-16 accent-sky-400 cursor-pointer"
              />
              <span className="text-sky-300 min-w-[34px] text-right font-bold text-[10px]">
                {orrerySpeed <= 0.1 ? '0.1× (10× slow)' : `${orrerySpeed.toFixed(1)}×`}
              </span>
            </div>

            {/* Left-Drag Mode Toggle: 3D Rotate vs Pan */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800">
              <button
                type="button"
                onClick={() => setOrreryDragMode('rotate')}
                className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 cursor-pointer ${
                  orreryDragMode === 'rotate'
                    ? 'bg-sky-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Left-Drag Rotates 3D Camera (Shift+Drag or Right-Drag Pans)"
              >
                <Compass className="w-3 h-3" />
                3D Rotate
              </button>
              <button
                type="button"
                onClick={() => setOrreryDragMode('pan')}
                className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 cursor-pointer ${
                  orreryDragMode === 'pan'
                    ? 'bg-sky-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Left-Drag Pans Camera"
              >
                <Move className="w-3 h-3" />
                Pan
              </button>
            </div>

            {/* 3D Camera Angle Presets */}
            <button
              type="button"
              onClick={() => {
                setOrreryYaw(-0.42);
                setOrreryPitch(0.94);
              }}
              className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700 text-[11px] cursor-pointer"
              title="3D Isometric Perspective (54° Pitch)"
            >
              3D Iso
            </button>
            <button
              type="button"
              onClick={() => {
                setOrreryYaw(0);
                setOrreryPitch(1.42);
              }}
              className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 text-[11px] cursor-pointer"
              title="Edge-On Orbital Plane View (81° Pitch)"
            >
              Edge-On
            </button>
            <button
              type="button"
              onClick={() => {
                setOrreryYaw(0);
                setOrreryPitch(0);
              }}
              className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[11px] cursor-pointer"
              title="Top-Down Plan View (0° Pitch)"
            >
              Top-Down
            </button>

            {/* Inclination Vertical Exaggeration Toggle */}
            <button
              type="button"
              onClick={() => setOrreryIncScale((s) => (s === 1 ? 4 : 1))}
              className={`px-2 py-1 rounded border text-[11px] cursor-pointer ${
                orreryIncScale > 1
                  ? 'bg-indigo-950/80 text-indigo-300 border-indigo-600'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
              }`}
              title="Toggle Vertical Inclination Exaggeration (1× True vs 4× Exaggerated)"
            >
              Inc {orreryIncScale}×
            </button>

            {/* Toggle Hierarchy Tree */}
            <button
              type="button"
              onClick={() => setShowQuickJump((v) => !v)}
              aria-pressed={showQuickJump}
              aria-keyshortcuts="j"
              className={`px-2.5 py-1 rounded border text-[11px] flex items-center gap-1.5 cursor-pointer transition ${
                showQuickJump
                  ? 'bg-sky-600 text-white border-sky-400 font-bold shadow-sm'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-slate-100 hover:border-slate-500'
              }`}
              title="Toggle System Hierarchy Quick Jump Tree (Hotkey: J)"
            >
              <ListTree className="w-3 h-3" />
              <span>Hierarchy {showQuickJump ? 'ON' : 'OFF'}</span>
              <kbd className="px-1 py-0.2 text-[9px] bg-slate-950/80 rounded text-slate-400 border border-slate-700 font-mono ml-0.5">
                J
              </kbd>
            </button>

            {/* Toggle Labels */}
            <button
              type="button"
              onClick={() => setShowLabels((v) => !v)}
              aria-pressed={showLabels}
              aria-keyshortcuts="l"
              className={`px-2.5 py-1 rounded border text-[11px] flex items-center gap-1.5 cursor-pointer transition ${
                showLabels
                  ? 'bg-sky-600 text-white border-sky-400 font-bold shadow-sm'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-slate-100 hover:border-slate-500'
              }`}
              title="Toggle World, Star & Belt Labels (Hotkey: L)"
            >
              <Tag className="w-3 h-3" />
              <span>Labels {showLabels ? 'ON' : 'OFF'}</span>
              <kbd className="px-1 py-0.2 text-[9px] bg-slate-950/80 rounded text-slate-400 border border-slate-700 font-mono ml-0.5">
                L
              </kbd>
            </button>

            {/* Dynamic Zoom Slider */}
            <button
              type="button"
              onClick={() =>
                setOrreryPxPerAU((p) => clamp(p / 1.45, 0.05, 5000000))
              }
              className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={-1.3}
              max={6.7}
              step={0.02}
              value={log10(Math.max(0.05, orreryPxPerAU))}
              onChange={(e) =>
                setOrreryPxPerAU(Math.pow(10, parseFloat(e.target.value)))
              }
              className="w-24 accent-sky-400 cursor-pointer"
              title="Proportional Zoom (px/AU)"
            />
            <button
              type="button"
              onClick={() =>
                setOrreryPxPerAU((p) => clamp(p * 1.45, 0.05, 5000000))
              }
              className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-sky-400 min-w-[78px] text-right">
              {orreryPxPerAU >= 10
                ? `${Math.round(orreryPxPerAU)} px/AU`
                : `${orreryPxPerAU.toFixed(2)} px/AU`}
            </span>
          </div>
        </div>
        )}

        {/* Interactive 3D Proportional SVG Orrery (Drag to Rotate 3D, Shift+Drag/Right-Drag to Pan, Scroll to Zoom) */}
        <div
          ref={setOrreryContainer}
          style={{ overscrollBehavior: 'contain' }}
          className="relative w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#03060c] touch-none"
        >
          {/* Floating Quick Toggle Controls Overlay (Accessible in Immersion Mode and UI Mode) */}
          <div className="absolute top-3 right-28 z-20 flex items-center gap-1.5 bg-[#0b111e]/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-800/90 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                if (enteringTimerRef.current) clearTimeout(enteringTimerRef.current);
                if (enteringFadeTimerRef.current) clearTimeout(enteringFadeTimerRef.current);
                setShowEnteringOverlay(true);
                setIsEnteringFading(false);
                enteringTimerRef.current = setTimeout(() => {
                  setIsEnteringFading(true);
                  enteringFadeTimerRef.current = setTimeout(() => {
                    setShowEnteringOverlay(false);
                  }, 700);
                }, 5000);
              }}
              className="px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1.5 cursor-pointer bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700/80 transition"
              title="Show System Detailed Stats Briefing"
            >
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
              <span>Stats</span>
            </button>
            <button
              type="button"
              onClick={() => setShowQuickJump((v) => !v)}
              aria-pressed={showQuickJump}
              aria-keyshortcuts="j"
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1.5 cursor-pointer transition ${
                showQuickJump
                  ? 'bg-sky-600 text-white font-bold shadow-md shadow-sky-500/25'
                  : 'bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700/80'
              }`}
              title="Toggle System Hierarchy Quick Jump Tree (Hotkey: J)"
            >
              <ListTree className="w-3.5 h-3.5" />
              <span>Hierarchy {showQuickJump ? 'ON' : 'OFF'}</span>
              <kbd className="px-1 py-0.2 text-[9px] bg-slate-950/80 rounded text-slate-400 border border-slate-700 font-mono ml-0.5">
                J
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setShowLabels((v) => !v)}
              aria-pressed={showLabels}
              aria-keyshortcuts="l"
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1.5 cursor-pointer transition ${
                showLabels
                  ? 'bg-sky-600 text-white font-bold shadow-md shadow-sky-500/25'
                  : 'bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700/80'
              }`}
              title="Toggle Planetary, Star & Orbit Labels (Hotkey: L)"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Labels {showLabels ? 'ON' : 'OFF'}</span>
              <kbd className="px-1 py-0.2 text-[9px] bg-slate-950/80 rounded text-slate-400 border border-slate-700 font-mono ml-0.5">
                L
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setShowLagrange((v) => !v)}
              aria-pressed={showLagrange}
              aria-keyshortcuts="p"
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1.5 cursor-pointer transition ${
                showLagrange
                  ? 'bg-sky-600 text-white font-bold shadow-md shadow-sky-500/25'
                  : 'bg-slate-900/90 text-slate-300 hover:text-white border border-slate-700/80'
              }`}
              title="Toggle Orbital Mechanics, Lagrange (L1-L5) & Flight Transfer Overlay (Hotkey: P)"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>Orbital {showLagrange ? 'ON' : 'OFF'}</span>
              <kbd className="px-1 py-0.2 text-[9px] bg-slate-950/80 rounded text-slate-400 border border-slate-700 font-mono ml-0.5">
                P
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setShowPreProgramModal(true)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1.5 cursor-pointer transition ${
                customStellarConfig?.enabled
                  ? 'bg-amber-600 text-white font-bold border border-amber-400 shadow-md shadow-amber-500/25'
                  : 'bg-slate-900/90 text-amber-300 hover:text-white border border-slate-700/80'
              }`}
              title="Pre-Program Star Data & Generate Planets Only"
            >
              {customStellarConfig?.enabled ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Star className="w-3.5 h-3.5" />
              )}
              <span>
                {customStellarConfig?.enabled
                  ? `Stars Locked (${customStellarConfig.nStars}★)`
                  : 'Pre-Program Stars'}
              </span>
            </button>
            <button
              type="button"
              onClick={handleRerollPlanetsOnly}
              className="px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1.5 cursor-pointer bg-slate-900/90 text-sky-300 hover:text-white border border-slate-700/80 transition"
              title="Keep current star(s) fixed and re-roll only the planetary system"
            >
              <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
              <span>Roll Planets</span>
            </button>
          </div>

          {/* "Entering <System>" Briefing Table Overlay (Fades out after 5 seconds, centered and bigger) */}
          {showEnteringOverlay && systemBriefingStats && (
            <div
              onMouseEnter={() => {
                if (enteringTimerRef.current) clearTimeout(enteringTimerRef.current);
                if (enteringFadeTimerRef.current) clearTimeout(enteringFadeTimerRef.current);
                setIsEnteringFading(false);
              }}
              onMouseLeave={() => {
                enteringTimerRef.current = setTimeout(() => {
                  setIsEnteringFading(true);
                  enteringFadeTimerRef.current = setTimeout(() => {
                    setShowEnteringOverlay(false);
                  }, 700);
                }, 2500);
              }}
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[94%] sm:w-[500px] md:w-[540px] max-h-[85vh] overflow-y-auto p-5 sm:p-6 rounded-2xl bg-[#080d1a]/95 backdrop-blur-lg border border-slate-700/90 shadow-[0_0_50px_rgba(0,0,0,0.85)] text-sm font-mono space-y-3 select-none pointer-events-auto transition-all duration-700 ${
                isEnteringFading
                  ? 'opacity-0 scale-95 pointer-events-none'
                  : 'opacity-100 scale-100'
              }`}
            >
              <div className="text-xs sm:text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between pb-2.5 border-b border-slate-800">
                <span className="text-sky-300 text-base sm:text-lg font-bold truncate">
                  Entering {systemBriefingStats.sysName}
                </span>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-cyan-400 font-semibold text-xs sm:text-sm">
                    {systemBriefingStats.archName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowEnteringOverlay(false)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer transition hover:bg-slate-800/60"
                    title="Dismiss briefing"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Primary Star */}
              {systemBriefingStats.primaryStar && (
                <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60 text-xs sm:text-sm">
                  <span className="text-slate-400">Primary Star</span>
                  <span className="text-slate-200 font-semibold">
                    {systemBriefingStats.primaryStar.spectralType} {systemBriefingStats.primaryStar.mass.toFixed(3)} M☉
                  </span>
                </div>
              )}

              {/* Companions */}
              {systemBriefingStats.companionStars.length > 0 && (
                <div className="flex items-start justify-between py-1.5 border-b border-slate-800/60 text-xs sm:text-sm">
                  <span className="text-slate-400">Companions</span>
                  <div className="text-right text-slate-300 font-medium space-y-1.5">
                    {systemBriefingStats.companionStars.map((cs) => {
                      const isBH = isBlackHoleStar({ spectralType: cs.spectralType });
                      return (
                        <div key={cs.label} className="flex items-center justify-end gap-2 text-xs sm:text-sm">
                          {isBH ? (
                            <BlackHoleIcon isSupermassive={cs.mass > 999999} size={16} />
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
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60 text-xs sm:text-sm">
                <span className="text-slate-400">Luminosity</span>
                <span className="text-slate-200 font-semibold">{systemBriefingStats.totalLuminosity} L☉</span>
              </div>

              {/* Effective Temp & Evolutionary State: only for single star systems */}
              {!systemBriefingStats.isMultiple && systemBriefingStats.primaryStar && (
                <>
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60 text-xs sm:text-sm">
                    <span className="text-slate-400">Effective Temp</span>
                    <span className="text-slate-200 font-semibold">{Math.round(systemBriefingStats.primaryStar.Teff)} K</span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60 text-xs sm:text-sm">
                    <span className="text-slate-400">Evolutionary State</span>
                    <span className="text-cyan-400 font-semibold">
                      {systemBriefingStats.primaryStar.category || 'Main Sequence'}
                    </span>
                  </div>
                </>
              )}

              {/* Astronomical Bodies: placed between Evolutionary State and Biospheres */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60 text-xs sm:text-sm">
                <span className="text-slate-400">Astronomical Bodies</span>
                <span className="text-slate-200 font-semibold">
                  {systemBriefingStats.planetCount} Planets &bull; {systemBriefingStats.beltCount} Belts
                </span>
              </div>

              {/* Planetary Biospheres */}
              <div className="flex items-center justify-between py-1.5 text-xs sm:text-sm">
                <span className="text-slate-400">Planetary Biospheres:</span>
                <span className={systemBriefingStats.biosphereText !== '<none>' ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                  {systemBriefingStats.biosphereText}
                </span>
              </div>
            </div>
          )}

          {/* Left-Hand Floating Button When Hierarchy is Collapsed */}
          {!showQuickJump && (
            <button
              type="button"
              onClick={() => setShowQuickJump(true)}
              aria-keyshortcuts="j"
              className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-[#0b111e]/90 hover:bg-slate-800 text-slate-200 hover:text-white px-2.5 py-1.5 rounded-xl border border-slate-800 shadow-xl text-[11px] font-mono cursor-pointer transition"
              title="Open System Hierarchy Quick Jump Tree (Hotkey: J)"
            >
              <ListTree className="w-3.5 h-3.5 text-sky-400" />
              <span>Hierarchy</span>
              <kbd className="px-1 py-0.2 text-[9px] bg-slate-950/80 rounded text-slate-400 border border-slate-700 font-mono ml-0.5">
                J
              </kbd>
            </button>
          )}

          {/* Left-Hand Collapsible Hierarchy List Tree (Accessible in Immersion Mode & Normal UI) */}
          {showQuickJump && (
            <aside
              role="region"
              aria-label="System Hierarchy Quick Jump"
              onWheel={(e) => e.stopPropagation()}
              className="absolute top-3 left-3 bottom-3 w-72 sm:w-80 z-30 flex flex-col bg-[#080d1a]/95 backdrop-blur-md border border-slate-700/90 rounded-xl shadow-2xl overflow-hidden font-mono text-xs"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/90 bg-slate-900/60">
                <div className="flex items-center gap-2 text-sky-300 font-bold text-xs tracking-wide">
                  <ListTree className="w-4 h-4 text-sky-400" />
                  <span>Hierarchy</span>
                  <kbd className="px-1 py-0.2 text-[9px] bg-slate-950 rounded text-slate-400 border border-slate-700 font-mono">
                    J
                  </kbd>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTrackedTarget(null);
                      fitOrreryToFullSystem(res);
                    }}
                    className="px-2 py-0.5 rounded bg-sky-950/70 hover:bg-sky-900 text-sky-300 border border-sky-800/70 text-[10px] cursor-pointer transition"
                    title="Fit Camera to Entire System"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQuickJump(false)}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                    title="Close Hierarchy (Hotkey: J)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Scrollable Tree Content */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2 select-none overscroll-contain">
                {res.hierarchy.stars.map((st, sIdx) => {
                  const sZoneIdx = res.zones.findIndex((z) =>
                    z.title.startsWith(`Star ${st.label} `)
                  );
                  const sZone = sZoneIdx >= 0 ? res.zones[sZoneIdx] : null;

                  return (
                    <div key={`tree-star-${st.label}`} className="space-y-1">
                      {/* Star Item */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (e.shiftKey) {
                            handleTrackBody({ kind: 'star', starIdx: sIdx });
                          } else {
                            handleZoomToEntity({ kind: 'star', starIdx: sIdx });
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedEntity({ kind: 'star', starIdx: sIdx });
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setSelectedEntity({ kind: 'star', starIdx: sIdx });
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 flex items-center justify-between group cursor-pointer transition select-none"
                        title={`Star ${st.label} (${st.spectralType})\n• Right-Click: Open Star Data Screen\n• Click: Zoom to\n• Shift+Click: Lock Camera & Track\n• Double-Click: Open Detailed Stats`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <img
                            src={getProceduralStarSpriteDataUrl(st, 40)}
                            alt=""
                            className="w-4 h-4 shrink-0"
                          />
                          <span className="font-bold text-slate-200 group-hover:text-white truncate">
                            Star {st.label}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {st.spectralType}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0 ml-1">
                          {st.mass.toFixed(2)} M☉
                        </span>
                      </button>

                      {/* Planet & Belt Children */}
                      {sZone && sZone.bodies.length > 0 && (
                        <div className="ml-3 pl-2.5 border-l border-slate-800/90 space-y-1">
                          {sZone.bodies.map((b, bIdx) => {
                            if (b.kind === 'belt') {
                              return (
                                <button
                                  key={`tree-belt-${sZoneIdx}-${bIdx}`}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (e.shiftKey) {
                                      handleTrackBody({
                                        kind: 'belt',
                                        zoneIdx: sZoneIdx,
                                        bodyIdx: bIdx,
                                      });
                                    } else {
                                      handleZoomToEntity({
                                        kind: 'belt',
                                        zoneIdx: sZoneIdx,
                                        bodyIdx: bIdx,
                                      });
                                    }
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setSelectedEntity({
                                      kind: 'belt',
                                      zoneIdx: sZoneIdx,
                                      bodyIdx: bIdx,
                                    });
                                  }}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEntity({
                                      kind: 'belt',
                                      zoneIdx: sZoneIdx,
                                      bodyIdx: bIdx,
                                    });
                                  }}
                                  className="w-full text-left px-2 py-1 rounded text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 flex items-center justify-between cursor-pointer transition select-none"
                                  title={`${b.role || 'Asteroid Belt'} (${b.a.toFixed(2)} AU)\n• Right-Click: Open Belt Data Screen\n• Click: Zoom to\n• Shift+Click: Lock Camera & Track\n• Double-Click: Open Detailed Stats`}
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="text-slate-600 text-[10px]">├─</span>
                                    <span className="truncate">
                                      {b.role || 'Asteroid Belt'}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-500 shrink-0">
                                    {b.a.toFixed(2)} AU
                                  </span>
                                </button>
                              );
                            }

                            const isTracked =
                              trackedTarget?.kind === 'planet' &&
                              trackedTarget.zoneIdx === sZoneIdx &&
                              trackedTarget.bodyIdx === bIdx;
                            const isDossier =
                              selectedEntity?.kind === 'planet' &&
                              selectedEntity.zoneIdx === sZoneIdx &&
                              selectedEntity.bodyIdx === bIdx;

                              return (
                                <div
                                  key={`tree-planet-${sZoneIdx}-${bIdx}`}
                                  className="space-y-0.5"
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setSelectedEntity({
                                      kind: 'planet',
                                      zoneIdx: sZoneIdx,
                                      bodyIdx: bIdx,
                                    });
                                  }}
                                >
                                  <div
                                    className={`flex items-center justify-between px-2 py-1 rounded-lg border transition ${
                                      isTracked
                                        ? 'bg-sky-950/80 border-sky-500 text-sky-200'
                                        : isDossier
                                        ? 'bg-slate-800/90 border-slate-600 text-white'
                                        : 'bg-slate-950/50 hover:bg-slate-900 border-transparent hover:border-slate-800 text-slate-300'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (e.shiftKey) {
                                          handleTrackBody({
                                            kind: 'planet',
                                            zoneIdx: sZoneIdx,
                                            bodyIdx: bIdx,
                                          });
                                        } else {
                                          handleZoomToEntity({
                                            kind: 'planet',
                                            zoneIdx: sZoneIdx,
                                            bodyIdx: bIdx,
                                          });
                                        }
                                      }}
                                      onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSelectedEntity({
                                          kind: 'planet',
                                          zoneIdx: sZoneIdx,
                                          bodyIdx: bIdx,
                                        });
                                      }}
                                      onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedEntity({
                                          kind: 'planet',
                                          zoneIdx: sZoneIdx,
                                          bodyIdx: bIdx,
                                        });
                                      }}
                                      className="flex items-center gap-1.5 truncate flex-1 text-left cursor-pointer mr-1 select-none"
                                      title={`Planet #${bIdx + 1}: ${b.planetClass.replace(/\s*\([^)]*\)/g, '')}\n• Click: Zoom to\n• Shift+Click: Lock Camera & Track Orbit\n• Double-Click / Right-Click: Open Detailed Stats`}
                                    >
                                      <span className="text-slate-600 text-[10px]">├─</span>
                                      <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{
                                          backgroundColor: getPlanetVisualColor(b),
                                        }}
                                      />
                                      <span className="truncate text-[11px]">
                                        #{bIdx + 1} {shortClassLabel(b.planetClass)}
                                      </span>
                                      {b.moons.length > 0 && (
                                        <span className="text-[9px] text-indigo-300 bg-indigo-950/80 px-1 rounded font-mono">
                                          {b.moons.length}☾
                                        </span>
                                      )}
                                      {b.hydrosphere?.biosphere && b.hydrosphere.biosphere !== 'none' && (
                                        <span
                                          className="text-[10px]"
                                          title={`Biosphere: ${b.hydrosphere.biosphere} (${b.hydrosphere.solvent || 'water'})`}
                                        >
                                          🌱
                                        </span>
                                      )}
                                    </button>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        {b.a.toFixed(2)} AU
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedEntity({
                                            kind: 'planet',
                                            zoneIdx: sZoneIdx,
                                            bodyIdx: bIdx,
                                          });
                                        }}
                                        className="p-1 rounded text-slate-500 hover:text-sky-300 hover:bg-slate-800 cursor-pointer"
                                        title="Open Detailed Stats Dossier"
                                      >
                                        <Maximize2 className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Ring Belt & Moons under this planet */}
                                  {(b.ringSystem || b.moons.length > 0) && (
                                    <div className="ml-4 pl-2 border-l border-slate-800/80 space-y-0.5">
                                      {b.ringSystem && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (e.shiftKey) {
                                              handleTrackBody({
                                                kind: 'planet',
                                                zoneIdx: sZoneIdx,
                                                bodyIdx: bIdx,
                                              });
                                            } else {
                                              handleZoomToEntity({
                                                kind: 'planet',
                                                zoneIdx: sZoneIdx,
                                                bodyIdx: bIdx,
                                              });
                                            }
                                          }}
                                          onContextMenu={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setSelectedEntity({
                                              kind: 'planet',
                                              zoneIdx: sZoneIdx,
                                              bodyIdx: bIdx,
                                            });
                                          }}
                                          onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedEntity({
                                              kind: 'planet',
                                              zoneIdx: sZoneIdx,
                                              bodyIdx: bIdx,
                                            });
                                          }}
                                          className="w-full flex items-center justify-between px-1.5 py-0.5 rounded text-[10px] text-amber-300/85 hover:text-amber-200 hover:bg-amber-950/30 transition cursor-pointer select-none"
                                          title={`Planetary Ring Belt: ${b.ringSystem.ringClass}\n• Inner–Outer: ${formatDistanceKm(b.ringSystem.innerRadiusKm)}–${formatDistanceKm(b.ringSystem.outerRadiusKm)}\n• Composition: ${b.ringSystem.compositionLabel}\n• Click: Zoom to\n• Double-Click / Right-Click: Open Stats`}
                                        >
                                          <span className="truncate">
                                            └─ 🪐 {b.ringSystem.ringClass.replace(/\s*\([^)]*\)/g, '')}
                                          </span>
                                          <span className="text-[9px] text-amber-400/80 font-mono shrink-0 ml-1">
                                            {b.ringSystem.innerRadiusKm.toLocaleString()}–{b.ringSystem.outerRadiusKm.toLocaleString()} km
                                          </span>
                                        </button>
                                      )}
                                      {b.moons.map((m, mIdx) => {
                                        const isMoonTracked =
                                          trackedTarget?.kind === 'moon' &&
                                          trackedTarget.zoneIdx === sZoneIdx &&
                                          trackedTarget.bodyIdx === bIdx &&
                                          trackedTarget.moonIdx === mIdx;

                                        return (
                                          <div
                                            key={`tree-moon-${sZoneIdx}-${bIdx}-${mIdx}`}
                                            className={`flex items-center justify-between px-1.5 py-0.5 rounded text-[10px] transition ${
                                              isMoonTracked
                                                ? 'bg-indigo-950/80 text-indigo-200 border border-indigo-500/70'
                                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                                            }`}
                                            onContextMenu={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setSelectedEntity({
                                                kind: 'moon',
                                                zoneIdx: sZoneIdx,
                                                bodyIdx: bIdx,
                                                moonIdx: mIdx,
                                              });
                                            }}
                                          >
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (e.shiftKey) {
                                                  handleTrackBody({
                                                    kind: 'moon',
                                                    zoneIdx: sZoneIdx,
                                                    bodyIdx: bIdx,
                                                    moonIdx: mIdx,
                                                  });
                                                } else {
                                                  handleZoomToEntity({
                                                    kind: 'moon',
                                                    zoneIdx: sZoneIdx,
                                                    bodyIdx: bIdx,
                                                    moonIdx: mIdx,
                                                  });
                                                }
                                              }}
                                              onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setSelectedEntity({
                                                  kind: 'moon',
                                                  zoneIdx: sZoneIdx,
                                                  bodyIdx: bIdx,
                                                  moonIdx: mIdx,
                                                });
                                              }}
                                              onDoubleClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedEntity({
                                                  kind: 'moon',
                                                  zoneIdx: sZoneIdx,
                                                  bodyIdx: bIdx,
                                                  moonIdx: mIdx,
                                                });
                                              }}
                                              className="flex items-center gap-1 truncate flex-1 text-left cursor-pointer select-none"
                                              title={`Moon: ${m.name} (${m.moonClass})\n• Click: Zoom to\n• Shift+Click: Lock Camera & Track Orbit\n• Double-Click / Right-Click: Open Detailed Stats`}
                                            >
                                              <span className="text-slate-600 text-[9px]">└─</span>
                                              <span className="truncate">
                                                {m.name || `Moon ${mIdx + 1}`}
                                              </span>
                                            </button>
                                            <span className="text-[9px] text-slate-500 font-mono shrink-0 ml-1">
                                              {m.radiusKm.toLocaleString()} km
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Circumbinary / Outer Zones */}
                {res.zones
                  .map((z, zIdx) => ({ z, zIdx }))
                  .filter(({ z }) => z.title.includes('Circumbinary'))
                  .map(({ z, zIdx }) => (
                    <div key={`tree-cb-${zIdx}`} className="space-y-1 pt-1">
                      <div className="px-2 py-1 rounded bg-amber-950/50 border border-amber-800/60 text-amber-200 font-bold text-xs flex items-center justify-between">
                        <span>{z.title.replace(' (P-Type)', '')}</span>
                      </div>
                      <div className="ml-3 pl-2.5 border-l border-amber-900/40 space-y-1">
                        {z.bodies.map((b, bIdx) => {
                          if (b.kind === 'belt') {
                            return (
                              <button
                                key={`tree-cb-belt-${zIdx}-${bIdx}`}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (e.shiftKey) {
                                    handleTrackBody({
                                      kind: 'belt',
                                      zoneIdx: zIdx,
                                      bodyIdx: bIdx,
                                    });
                                  } else {
                                    handleZoomToEntity({
                                      kind: 'belt',
                                      zoneIdx: zIdx,
                                      bodyIdx: bIdx,
                                    });
                                  }
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedEntity({
                                    kind: 'belt',
                                    zoneIdx: zIdx,
                                    bodyIdx: bIdx,
                                  });
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEntity({
                                    kind: 'belt',
                                    zoneIdx: zIdx,
                                    bodyIdx: bIdx,
                                  });
                                }}
                                className="w-full text-left px-2 py-1 rounded text-[11px] text-amber-300/70 hover:text-amber-200 hover:bg-amber-950/40 flex items-center justify-between cursor-pointer transition select-none"
                                title={`Circumbinary Belt: ${b.role || 'Belt'}\n• Click: Zoom to\n• Shift+Click: Lock Camera & Track\n• Double-Click / Right-Click: Open Detailed Stats`}
                              >
                                <span>{b.role || 'Belt'}</span>
                                <span className="text-[10px]">{b.a.toFixed(2)} AU</span>
                              </button>
                            );
                          }
                          const isTracked =
                            trackedTarget?.kind === 'planet' &&
                            trackedTarget.zoneIdx === zIdx &&
                            trackedTarget.bodyIdx === bIdx;

                          return (
                            <div
                              key={`tree-cb-body-${zIdx}-${bIdx}`}
                              className={`flex items-center justify-between px-2 py-1 rounded text-[11px] border transition ${
                                isTracked
                                  ? 'bg-sky-950 border-sky-500 text-sky-200'
                                  : 'bg-slate-950/40 hover:bg-slate-900 border-transparent text-slate-300'
                              }`}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedEntity({
                                  kind: 'planet',
                                  zoneIdx: zIdx,
                                  bodyIdx: bIdx,
                                });
                              }}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (e.shiftKey) {
                                    handleTrackBody({
                                      kind: 'planet',
                                      zoneIdx: zIdx,
                                      bodyIdx: bIdx,
                                    });
                                  } else {
                                    handleZoomToEntity({
                                      kind: 'planet',
                                      zoneIdx: zIdx,
                                      bodyIdx: bIdx,
                                    });
                                  }
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedEntity({
                                    kind: 'planet',
                                    zoneIdx: zIdx,
                                    bodyIdx: bIdx,
                                  });
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEntity({
                                    kind: 'planet',
                                    zoneIdx: zIdx,
                                    bodyIdx: bIdx,
                                  });
                                }}
                                className="flex items-center gap-1.5 truncate flex-1 text-left cursor-pointer select-none"
                                title={`Circumbinary Planet #${bIdx + 1}: ${b.planetClass.replace(/\s*\([^)]*\)/g, '')}\n• Click: Zoom to\n• Shift+Click: Lock Camera & Track Orbit\n• Double-Click / Right-Click: Open Detailed Stats`}
                              >
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: getPlanetVisualColor(b),
                                  }}
                                />
                                <span className="truncate">
                                  #{bIdx + 1} {shortClassLabel(b.planetClass)}
                                </span>
                              </button>
                              <span className="text-[10px] text-slate-400 font-mono ml-1">
                                {b.a.toFixed(2)} AU
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            </aside>
          )}

          {/* Right-Hand Dedicated Orbital Mechanics & Flight Planner Overlay (Toggled with P) */}
          {showLagrange &&
            (() => {
              const validZones = res.zones
                .map((z, zIdx) => ({
                  z,
                  zIdx,
                  planets: z.bodies
                    .map((b, bIdx) => ({ b, bIdx }))
                    .filter(
                      (item): item is { b: RealisticPlanetBody; bIdx: number } =>
                        item.b.kind === 'planet'
                    ),
                }))
                .filter((zItem) => zItem.planets.length > 0);

              if (validZones.length === 0) return null;

              const currentZoneEntry =
                validZones.find((vz) => vz.zIdx === navZoneIdx) || validZones[0];
              const activeZIdx = currentZoneEntry.zIdx;
              const activeZone = currentZoneEntry.z;
              const zonePlanets = currentZoneEntry.planets;

              const originEntry =
                zonePlanets.find((p) => p.bIdx === navOriginIdx) || zonePlanets[0];
              const originPlanet = originEntry.b;
              const originIdx = originEntry.bIdx;

              const otherPlanets = zonePlanets.filter((p) => p.bIdx !== originIdx);
              const destEntry =
                otherPlanets.find((p) => p.bIdx === navDestIdx) || otherPlanets[0] || null;

              const muStar = Math.max(0.08, activeZone.mass || 1.0);
              const vOrbKmS = 29.7847 * Math.sqrt(muStar / Math.max(0.005, originPlanet.a));
              const vEscKmS =
                11.186 *
                Math.sqrt(
                  Math.max(1e-5, originPlanet.massEarth) /
                    Math.max(0.005, originPlanet.radiusEarth)
                );
              const hillAU =
                originPlanet.a *
                (1 - originPlanet.e) *
                Math.cbrt((originPlanet.massEarth * 3.003e-6) / (3 * muStar));
              const hillMillionKm = hillAU * 149.598;

              const transferStats = destEntry
                ? (() => {
                    const r1 = originPlanet.a;
                    const r2 = destEntry.b.a;
                    const aTrans = 0.5 * (r1 + r2);
                    const v1 = 29.7847 * Math.sqrt(muStar / r1);
                    const v2 = 29.7847 * Math.sqrt(muStar / r2);
                    const dv1 = v1 * Math.abs(Math.sqrt((2 * r2) / (r1 + r2)) - 1);
                    const dv2 = v2 * Math.abs(1 - Math.sqrt((2 * r1) / (r1 + r2)));
                    const transitYrs = 0.5 * Math.sqrt(Math.pow(aTrans, 3) / muStar);
                    const phaseAngleDeg = 180 * (1 - Math.pow(aTrans / r2, 1.5));
                    return {
                      dv1,
                      dv2,
                      totalDv: dv1 + dv2,
                      transitYrs,
                      transitDays: transitYrs * 365.25,
                      phaseAngleDeg: ((phaseAngleDeg % 360) + 540) % 360 - 180,
                    };
                  })()
                : null;

              return (
                <aside
                  role="region"
                  aria-label="Orbital Mechanics & Flight Planner"
                  onWheel={(e) => e.stopPropagation()}
                  className="absolute top-12 right-3 w-76 sm:w-84 max-h-[calc(100%-3.75rem)] z-30 flex flex-col bg-[#080d1a]/95 backdrop-blur-md border border-slate-700/90 rounded-xl shadow-2xl overflow-hidden font-mono text-xs select-none"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/90 bg-slate-900/60">
                    <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs tracking-wide">
                      <Rocket className="w-4 h-4 text-cyan-400" />
                      <span>Orbital Mechanics</span>
                      <kbd className="px-1 py-0.2 text-[9px] bg-slate-950 rounded text-slate-400 border border-slate-700 font-mono">
                        P
                      </kbd>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowLagrange(false)}
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                      title="Close Orbital Mechanics Overlay (Hotkey: P)"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-3 space-y-2.5 overflow-y-auto overscroll-contain">
                    {/* Zone Selector (if multi-zone system) */}
                    {validZones.length > 1 && (
                      <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-800/80">
                        <span className="text-[10px] text-slate-400 uppercase shrink-0">Zone</span>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {validZones.map((vz) => (
                            <button
                              key={vz.zIdx}
                              type="button"
                              onClick={() => {
                                setNavZoneIdx(vz.zIdx);
                                const firstP = vz.planets[0]?.bIdx ?? 0;
                                const secondP = vz.planets[1]?.bIdx ?? firstP;
                                setNavOriginIdx(firstP);
                                setNavDestIdx(secondP);
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer border transition ${
                                vz.zIdx === activeZIdx
                                  ? 'bg-sky-900/80 border-sky-400 text-sky-200'
                                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                              }`}
                            >
                              {vz.z.title.replace(/\s*\([^)]*\)/g, '')}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Origin Planet Selector */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 uppercase">
                          Origin Body
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleZoomToEntity({
                              kind: 'planet',
                              zoneIdx: activeZIdx,
                              bodyIdx: originIdx,
                            })
                          }
                          className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                          title="Center camera on Origin Planet"
                        >
                          <Crosshair className="w-3 h-3" />
                          <span>Center #{originIdx + 1}</span>
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {zonePlanets.map((p) => {
                          const isOrig = p.bIdx === originIdx;
                          return (
                            <button
                              key={p.bIdx}
                              type="button"
                              onClick={() => {
                                setNavOriginIdx(p.bIdx);
                                if (navDestIdx === p.bIdx) {
                                  const alt = zonePlanets.find((x) => x.bIdx !== p.bIdx);
                                  if (alt) setNavDestIdx(alt.bIdx);
                                }
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer border transition flex items-center gap-1 ${
                                isOrig
                                  ? 'bg-sky-600 border-sky-400 text-white shadow-sm'
                                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                              }`}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: getPlanetVisualColor(p.b) }}
                              />
                              <span>
                                #{p.bIdx + 1} ({p.b.a.toFixed(2)} AU)
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Origin Gravity Well & Slingshot Stats */}
                    <div className="grid grid-cols-2 gap-2 bg-[#0c121d] p-2.5 rounded-lg border border-slate-800">
                      <div>
                        <span className="text-slate-400 block text-[9px]">ORBITAL SPEED</span>
                        <b className="text-white">{vOrbKmS.toFixed(1)} km/s</b>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">ESCAPE VELOCITY</span>
                        <b className="text-cyan-300">{vEscKmS.toFixed(1)} km/s</b>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">HILL SPHERE (L1/L2)</span>
                        <b className="text-white">
                          {hillMillionKm >= 1
                            ? `${hillMillionKm.toFixed(2)}M km`
                            : `${Math.round(hillMillionKm * 1000).toLocaleString()} km`}
                        </b>
                        <span className="text-[9px] text-slate-400 block">{hillAU.toFixed(4)} AU</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px]">MAX SLINGSHOT</span>
                        <b className="text-emerald-300">+{vEscKmS.toFixed(1)} km/s</b>
                      </div>
                    </div>

                    {/* Hohmann Transfer Planner */}
                    {otherPlanets.length > 0 && destEntry && transferStats && (
                      <div className="space-y-2 pt-1 border-t border-slate-800/80">
                        <div className="space-y-1.5">
                          <span className="text-[10px] text-slate-400 uppercase block">
                            Transfer Destination
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {otherPlanets.map((p) => {
                              const isDest = p.bIdx === destEntry.bIdx;
                              return (
                                <button
                                  key={p.bIdx}
                                  type="button"
                                  onClick={() => setNavDestIdx(p.bIdx)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer border transition flex items-center gap-1 ${
                                    isDest
                                      ? 'bg-amber-600/80 border-amber-400 text-white shadow-sm'
                                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                                  }`}
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: getPlanetVisualColor(p.b) }}
                                  />
                                  <span>
                                    #{p.bIdx + 1} ({p.b.a.toFixed(2)} AU)
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 bg-[#0c121d] p-2.5 rounded-lg border border-slate-800">
                          <div>
                            <span className="text-slate-400 block text-[9px]">DEPARTURE ΔV</span>
                            <b className="text-amber-300">{transferStats.dv1.toFixed(2)} km/s</b>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">ARRIVAL ΔV</span>
                            <b className="text-amber-300">{transferStats.dv2.toFixed(2)} km/s</b>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">TOTAL ΔV</span>
                            <b className="text-white">{transferStats.totalDv.toFixed(2)} km/s</b>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px]">TRANSIT TIME</span>
                            <b className="text-cyan-300">
                              {transferStats.transitYrs >= 1
                                ? `${transferStats.transitYrs.toFixed(2)} yrs`
                                : `${Math.round(transferStats.transitDays)} d`}
                            </b>
                            <span className="text-[9px] text-slate-400 block">
                              Phase {transferStats.phaseAngleDeg >= 0 ? '+' : ''}
                              {transferStats.phaseAngleDeg.toFixed(0)}°
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Compact Map Legend */}
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
                      <span className="text-sky-300">◇ L1–L3</span>
                      <span className="text-emerald-300">△ L4/L5 Trojans</span>
                      <span className="text-amber-300">--- Transfer</span>
                    </div>
                  </div>
                </aside>
              );
            })()}

          <svg
            ref={orrerySvgRef}
            viewBox={`0 0 ${viewW} ${viewH}`}
            className={`w-full h-auto block select-none ${
              isDraggingOrrery ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            onContextMenu={(e) => e.preventDefault()}
            onMouseDown={(e) => {
              if (e.button !== 0 && e.button !== 2) return;
              const action: 'rotate' | 'pan' =
                e.button === 2 || e.shiftKey
                  ? orreryDragMode === 'rotate'
                    ? 'pan'
                    : 'rotate'
                  : orreryDragMode;
              setIsDraggingOrrery(true);
              dragStartRef.current = {
                clientX: e.clientX,
                clientY: e.clientY,
                camX: orreryCamAU.x,
                camY: orreryCamAU.y,
                camZ: orreryCamAU.z ?? 0,
                yaw: orreryYaw,
                pitch: orreryPitch,
                action,
              };
            }}
            onMouseMove={(e) => {
              if (!isDraggingOrrery || !dragStartRef.current || !orrerySvgRef.current)
                return;
              const rect = orrerySvgRef.current.getBoundingClientRect();
              const dxPx = e.clientX - dragStartRef.current.clientX;
              const dyPx = e.clientY - dragStartRef.current.clientY;

              if (dragStartRef.current.action === 'rotate') {
                setOrreryYaw(dragStartRef.current.yaw + dxPx * 0.0085);
                setOrreryPitch(dragStartRef.current.pitch - dyPx * 0.0075);
              } else {
                setTrackedTarget(null);
                const dxSvg = (dxPx / Math.max(1, rect.width)) * viewW;
                const dySvg = (dyPx / Math.max(1, rect.height)) * viewH;
                const rawCosP = Math.cos(orreryPitch);
                const safeCosP =
                  (rawCosP < 0 ? -1 : 1) * Math.max(0.22, Math.abs(rawCosP));
                const dCamX = -dxSvg / orreryPxPerAU;
                const dCamY = -dySvg / (orreryPxPerAU * safeCosP);
                // Unrotate pan vector by camera yaw into world ecliptic plane
                const cY = Math.cos(orreryYaw);
                const sY = Math.sin(orreryYaw);
                setOrreryCamAU({
                  x: dragStartRef.current.camX + dCamX * cY + dCamY * sY,
                  y: dragStartRef.current.camY - dCamX * sY + dCamY * cY,
                  z: dragStartRef.current.camZ,
                });
              }
            }}
            onMouseUp={() => {
              setIsDraggingOrrery(false);
              dragStartRef.current = null;
            }}
            onMouseLeave={() => {
              setIsDraggingOrrery(false);
              dragStartRef.current = null;
            }}
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x={0} y={0} width={viewW} height={viewH} fill="#03060c" />

            {/* 1. Binary / Trinary / Quadruple Barycentric 3D Orbit Links */}
            {layout.binaryLinks.map((bl) => {
              const bProj = project3D(bl.center.x, bl.center.y, 0);
              const p1Proj = project3D(bl.pos1.x, bl.pos1.y, 0);
              const p2Proj = project3D(bl.pos2.x, bl.pos2.y, 0);
              const r1Px = bl.r1 * orreryPxPerAU;
              const r2Px = bl.r2 * orreryPxPerAU;

              return (
                <g key={`bin-link-${bl.splitIdx}`}>
                  {r1Px > 2 && r1Px < 60000 && (
                    <path
                      d={build3DCirclePath(bl.center.x, bl.center.y, bl.r1, 56)}
                      fill="none"
                      stroke="rgba(251, 191, 36, 0.28)"
                      strokeWidth={1.2}
                      strokeDasharray="6,4"
                    />
                  )}
                  {r2Px > 2 && r2Px < 60000 && (
                    <path
                      d={build3DCirclePath(bl.center.x, bl.center.y, bl.r2, 56)}
                      fill="none"
                      stroke="rgba(251, 191, 36, 0.28)"
                      strokeWidth={1.2}
                      strokeDasharray="6,4"
                    />
                  )}
                  <line
                    x1={p1Proj.x}
                    y1={p1Proj.y}
                    x2={p2Proj.x}
                    y2={p2Proj.y}
                    stroke="rgba(251, 191, 36, 0.35)"
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />
                  <g
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEntity({ kind: 'split', splitIdx: bl.splitIdx });
                    }}
                  >
                    <circle
                      cx={bProj.x}
                      cy={bProj.y}
                      r={4.5}
                      fill="#1e293b"
                      stroke="#fbbf24"
                      strokeWidth={1.5}
                    />
                    <text
                      x={bProj.x}
                      y={bProj.y - 8}
                      fill="#fde68a"
                      fontSize={9}
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      [{bl.split.pair}] {bl.split.a_AU.toFixed(2)} AU
                    </text>
                  </g>
                </g>
              );
            })}

            {/* 2. All Planetary Zones (3D Habitable Zone Annuli, 3D Snow Lines, 3D Asteroid Swarms & 3D Inclined Orbits) */}
            {res.zones.map((z, zIdx) => {
              const centerAU = layout.zoneCenters[zIdx] || { x: 0, y: 0 };
              const isCircumbinary = z.title.includes('Circumbinary');

              const hzInAU = 0.75 * Math.sqrt(z.lum);
              const hzOutAU = 1.7 * Math.sqrt(z.lum);

              // Hide Habitable Zone and Snow Line in circumbinary systems if they fall inside the binary pair's orbit (z.a_in)
              const showHZ = isCircumbinary
                ? hzInAU >= z.a_in && hzInAU < z.a_out
                : hzInAU < z.a_out;
              const showSnow = isCircumbinary
                ? z.a_snow >= z.a_in && z.a_snow <= z.a_out
                : z.a_snow <= z.a_out;

              const hzInnerClampAU = Math.max(z.a_in, hzInAU);
              const hzOuterClampAU = Math.min(z.a_out, hzOutAU);
              const rHZInPx = hzInnerClampAU * orreryPxPerAU;
              const rHZOutPx = hzOuterClampAU * orreryPxPerAU;
              const rSnowPx = z.a_snow * orreryPxPerAU;

              const snowLabelPt = project3D(
                centerAU.x + z.a_snow * 0.707,
                centerAU.y - z.a_snow * 0.707,
                0
              );

              return (
                <g key={`zone-3d-${zIdx}`}>
                  {/* 3D Habitable Zone Shaded Annulus (Culled to Viewport) */}
                  {showHZ &&
                    rHZOutPx > rHZInPx &&
                    rHZOutPx > 3 &&
                    rHZInPx < 60000 &&
                    doesRadialBandIntersectViewport(centerAU, hzInnerClampAU, hzOuterClampAU) &&
                    (rHZOutPx <= 2800 ? (
                      <path
                        d={`${build3DCirclePath(
                          centerAU.x,
                          centerAU.y,
                          hzOuterClampAU,
                          56,
                          false,
                          true
                        )} ${build3DCirclePath(
                          centerAU.x,
                          centerAU.y,
                          hzInnerClampAU,
                          56,
                          true,
                          true
                        )}`}
                        fill="rgba(16, 185, 129, 0.14)"
                        fillRule="evenodd"
                        stroke="rgba(16, 185, 129, 0.35)"
                        strokeWidth={0.9}
                      />
                    ) : (
                      <g>
                        <path
                          d={build3DCirclePath(centerAU.x, centerAU.y, hzOuterClampAU, 56)}
                          fill="none"
                          stroke="rgba(16, 185, 129, 0.45)"
                          strokeWidth={1.2}
                          strokeDasharray="6,4"
                        />
                        <path
                          d={build3DCirclePath(centerAU.x, centerAU.y, hzInnerClampAU, 56)}
                          fill="none"
                          stroke="rgba(16, 185, 129, 0.45)"
                          strokeWidth={1.2}
                          strokeDasharray="6,4"
                        />
                      </g>
                    ))}

                  {/* 3D Snow Line Ring */}
                  {showSnow &&
                    rSnowPx > 4 &&
                    rSnowPx < 60000 &&
                    doesRadialBandIntersectViewport(centerAU, z.a_snow, z.a_snow) && (
                      <g>
                        <path
                          d={build3DCirclePath(centerAU.x, centerAU.y, z.a_snow, 56)}
                          fill="none"
                          stroke="rgba(56, 189, 248, 0.55)"
                          strokeWidth={1.2}
                          strokeDasharray="5,5"
                        />
                        {showLabels &&
                          rSnowPx > 28 &&
                          rSnowPx < 2000 &&
                          isCircleInViewport(snowLabelPt.x, snowLabelPt.y, 48, 24) && (
                            <text
                              x={snowLabelPt.x + 4}
                              y={snowLabelPt.y - 4}
                              fill="#38bdf8"
                              fontSize={8.5}
                              fontFamily="monospace"
                            >
                              ❄️ {z.a_snow.toFixed(2)} AU
                            </text>
                          )}
                      </g>
                    )}

                  {/* 3D Orbit Curves, 3D Asteroid Belt Swarms & Depth-Sorted 3D Planet Globes */}
                  {(() => {
                    // Find host star for this zone:
                    const zoneStar =
                      res.hierarchy.stars.find((s) =>
                        z.title.includes(`Star ${s.label}`)
                      ) || res.hierarchy.stars[0];
                    const starBaseRadAU = Math.max(
                      0.012,
                      Math.min(0.35, 0.035 * Math.sqrt(Math.max(0.08, zoneStar?.radius || 1.0)))
                    );
                    const innermostBodyPeriAU = z.bodies[0]
                      ? z.bodies[0].a *
                        (1 - (z.bodies[0].kind === 'planet' ? z.bodies[0].e : 0))
                      : z.a_in;
                    const maxStarAU = Math.max(0.008, innermostBodyPeriAU * 0.42);
                    const starRadAU = Math.min(starBaseRadAU, maxStarAU);
                    const starProj = project3D(centerAU.x, centerAU.y, 0);
                    const starPxRad = Math.max(
                      4.5,
                      starRadAU * orreryPxPerAU * starProj.scale
                    );

                    // Find closest planet in this zone:
                    const closestPlanet = z.bodies.find(
                      (body): body is RealisticPlanetBody => body.kind === 'planet'
                    );
                    const closestPhysRadEarth = Math.max(
                      0.05,
                      closestPlanet ? closestPlanet.radiusEarth : 1.0
                    );
                    const closestPeriAU = closestPlanet
                      ? closestPlanet.a * (1 - closestPlanet.e)
                      : z.a_in;
                    const baselineClosestRadAU = Math.min(
                      0.08,
                      Math.max(0.012, 0.04 * closestPeriAU)
                    );

                    return z.bodies.map((b, bIdx) => {
                      const rOrbitPx = b.a * orreryPxPerAU;
                      if (rOrbitPx < 1.2) return null;

                      const meanMotion = 1.0 / Math.max(0.02, Math.pow(b.a, 1.5));
                      const theta =
                        -Math.PI / 3 +
                        bIdx * 2.39996 +
                        zIdx * 0.85 +
                        orreryTimeYr * meanMotion * Math.PI * 2;

                      if (b.kind === 'belt') {
                        if (rOrbitPx > 90000) return null;
                        const beltHalfWidthAU = Math.max(b.a * 0.06, b.beltWidth);
                        // O(1) radial frustum check: skip entire 165-asteroid loop when belt does not intersect viewport
                        if (
                          !doesRadialBandIntersectViewport(
                            centerAU,
                            Math.max(0, b.a - beltHalfWidthAU * 1.3),
                            b.a + beltHalfWidthAU * 1.3
                          )
                        ) {
                          return null;
                        }
                        const beltHitWidthPx = clamp(
                          beltHalfWidthAU * 2 * orreryPxPerAU,
                          10,
                          80
                        );
                        const beltInc = b.incDeg ?? 1.8;
                        const beltNode = ((b.omegaNodeDeg ?? (bIdx * 15)) * Math.PI) / 180;
                        const beltIncRad = (clamp(beltInc * orreryIncScale, 0, 75) * Math.PI) / 180;

                        const beltLblPos3 = evalKepler3D(
                          centerAU,
                          b.a,
                          0.02,
                          beltIncRad,
                          beltNode,
                          0,
                          theta
                        );
                        const bLblPt = project3D(beltLblPos3.wx, beltLblPos3.wy, beltLblPos3.wz);
                        const isIceBelt =
                          b.role.toLowerCase().includes('kuiper') ||
                          b.role.toLowerCase().includes('icy') ||
                          b.a >= z.a_snow;
                        const rockPalette = isIceBelt
                          ? ['#cbd5e1', '#94a3b8', '#bae6fd', '#64748b']
                          : ['#a8a29e', '#78716c', '#cbd5e1', '#94a3b8'];

                        const numAsteroids = 165;
                        const asteroidNodes: React.ReactNode[] = [];
                        const beltSpanPx = beltHalfWidthAU * orreryPxPerAU;
                        const beltScaleFactor = clamp(Math.pow(beltSpanPx / 18, 0.35), 0.55, 1.55);
                        for (let k = 0; k < numAsteroids; k++) {
                          // Deterministic pseudo-random radial, vertical & angular scatter
                          const h1 =
                            Math.sin(k * 127.1 + bIdx * 311.7 + zIdx * 74.7) *
                            43758.5453;
                          const u1 = h1 - Math.floor(h1);
                          const h2 =
                            Math.sin(k * 269.5 + bIdx * 183.3 + zIdx * 19.1) *
                            43758.5453;
                          const u2 = h2 - Math.floor(h2);
                          const h3 =
                            Math.sin(k * 419.2 + bIdx * 97.1 + zIdx * 53.3) *
                            43758.5453;
                          const u3 = h3 - Math.floor(h3);

                          // Radial offset concentrated near center of belt (triangular distribution)
                          const radialFrac = (u1 + u2 - 1.0) * 0.95;
                          const aAst = Math.max(
                            0.02,
                            b.a + radialFrac * beltHalfWidthAU
                          );
                          const astMeanMotion =
                            1.0 / Math.max(0.02, Math.pow(aAst, 1.5));
                          const astAngle =
                            (k / numAsteroids) * Math.PI * 2 +
                            (u3 - 0.5) * 0.08 +
                            orreryTimeYr * astMeanMotion * Math.PI * 2;

                          // 3D vertical scatter above/below orbital plane aligned with belt inclination
                          const astPos3 = evalKepler3D(
                            centerAU,
                            aAst,
                            0.02,
                            beltIncRad,
                            beltNode,
                            0,
                            astAngle
                          );
                          const zScatterAU = astPos3.wz + (u2 - 0.5) * 0.04 * aAst * Math.sin(astAngle + k * 0.7);
                          const astProj = project3D(astPos3.wx, astPos3.wy, zScatterAU);

                          // Cull offscreen individual asteroids before mounting SVG nodes
                          if (!isCircleInViewport(astProj.x, astProj.y, 4, 16)) continue;

                          // Small, crisp asteroid rock size that scales gently with belt zoom
                          const baseRockSz = 0.35 + Math.pow(u3, 2.6) * 0.58;
                          const rockRad = clamp(
                            baseRockSz * beltScaleFactor * astProj.scale,
                            0.35,
                            1.4
                          );
                          const col = rockPalette[k % rockPalette.length];
                          const rotDeg = Math.round(u1 * 360 + orreryTimeYr * 90);
                          const rx = rockRad * (1.12 + (k % 3) * 0.18);
                          const ry = rockRad * (0.72 + ((k + 1) % 3) * 0.12);

                          asteroidNodes.push(
                            <ellipse
                              key={k}
                              cx={astProj.x}
                              cy={astProj.y}
                              rx={rx}
                              ry={ry}
                              transform={`rotate(${rotDeg} ${astProj.x.toFixed(1)} ${astProj.y.toFixed(1)})`}
                              fill={col}
                              fillOpacity={0.5 + u3 * 0.4}
                            />
                          );
                        }

                        const beltPath =
                          rOrbitPx <= 3200
                            ? buildKepler3DPath(
                                centerAU,
                                b.a,
                                0.02,
                                beltIncRad,
                                beltNode,
                                0,
                                60
                              )
                            : '';
                        if (!beltPath && asteroidNodes.length === 0) return null;

                        return (
                          <g
                            key={`belt-3d-${zIdx}-${bIdx}`}
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (e.shiftKey) {
                                handleTrackBody({
                                  kind: 'belt',
                                  zoneIdx: zIdx,
                                  bodyIdx: bIdx,
                                });
                              } else {
                                handleZoomToEntity({
                                  kind: 'belt',
                                  zoneIdx: zIdx,
                                  bodyIdx: bIdx,
                                });
                              }
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedEntity({
                                kind: 'belt',
                                zoneIdx: zIdx,
                                bodyIdx: bIdx,
                              });
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setSelectedEntity({
                                kind: 'belt',
                                zoneIdx: zIdx,
                                bodyIdx: bIdx,
                              });
                            }}
                          >
                            <title>{`${b.role || 'Asteroid Belt'} (${b.a.toFixed(2)} AU)\n• Click: Zoom to\n• Shift+Click: Lock Camera & Track\n• Right-Click / Double-Click: Open Detailed Stats`}</title>
                            {/* Subtle diffuse zodiacal dust glow & wide transparent click hit-ring */}
                            {beltPath && (
                              <path
                                d={beltPath}
                                fill="none"
                                stroke={
                                  isIceBelt
                                    ? 'rgba(186, 230, 253, 0.04)'
                                    : 'rgba(168, 162, 158, 0.04)'
                                }
                                strokeWidth={beltHitWidthPx}
                              />
                            )}
                            {/* Visible Small 3D Asteroid Specks */}
                            {asteroidNodes}
                            {showLabels &&
                              rOrbitPx > 36 &&
                              isCircleInViewport(bLblPt.x, bLblPt.y, 48, 24) && (
                                <text
                                  x={bLblPt.x}
                                  y={bLblPt.y - 6}
                                  fill="#94a3b8"
                                  fontSize={8.5}
                                  fontFamily="monospace"
                                  textAnchor="middle"
                                >
                                  #{bIdx + 1} ({b.a.toFixed(2)} AU)
                                </text>
                              )}
                          </g>
                        );
                      }

                      // 3D Keplerian Inclined Orbit Geometry (Using physically generated inclination, ascending node & periapsis)
                      const rawIncDeg = b.incDeg ?? clamp(1.2 + b.e * 8, 0.5, 12);
                      const incRad =
                        (clamp(rawIncDeg * orreryIncScale, 0, 75) * Math.PI) /
                        180;
                      const omegaNode = ((b.omegaNodeDeg ?? (bIdx * 15)) * Math.PI) / 180;
                      const argPeri = ((b.argPeriDeg ?? 0) * Math.PI) / 180;

                      const orbitPath3D =
                        rOrbitPx <= 120000
                          ? buildKepler3DPath(
                              centerAU,
                              b.a,
                              b.e,
                              incRad,
                              omegaNode,
                              argPeri,
                              64
                            )
                          : '';
                      const pos3 = evalKepler3D(
                        centerAU,
                        b.a,
                        b.e,
                        incRad,
                        omegaNode,
                        argPeri,
                        theta
                      );
                      const pProj = project3D(pos3.wx, pos3.wy, pos3.wz);

                      // Calculate distance to previous and next orbital paths (clearance):
                      let deltaInnerAU: number;
                      if (bIdx === 0) {
                        // Distance from innermost planet periapsis to host star surface
                        const periAU = b.a * (1 - b.e);
                        deltaInnerAU = Math.max(0.003, periAU - starRadAU);
                      } else {
                        const prevBody = z.bodies[bIdx - 1];
                        const prevApoAU =
                          prevBody.a *
                          (1 + (prevBody.kind === 'planet' ? prevBody.e : 0));
                        const currPeriAU = b.a * (1 - b.e);
                        deltaInnerAU = Math.max(0.003, currPeriAU - prevApoAU);
                      }

                      let deltaOuterAU: number;
                      if (bIdx === z.bodies.length - 1) {
                        deltaOuterAU = Math.max(0.008, b.a * 0.32);
                      } else {
                        const nextBody = z.bodies[bIdx + 1];
                        const nextPeriAU =
                          nextBody.a *
                          (1 - (nextBody.kind === 'planet' ? nextBody.e : 0));
                        const currApoAU = b.a * (1 + b.e);
                        deltaOuterAU = Math.max(0.003, nextPeriAU - currApoAU);
                      }

                      // 0.36 clearance guarantees adjacent planets can never touch
                      // and a planet can never reach its neighbor's orbit line!
                      const laneClearanceAU = Math.min(deltaInnerAU, deltaOuterAU);
                      const maxOrbitClearanceAU = 0.36 * laneClearanceAU;

                      // Visible viewport span in AU (used to detect when solo on screen)
                      const viewSpanAU = viewW / Math.max(1e-4, orreryPxPerAU);
                      const soloThresholdAU = laneClearanceAU * 1.8;
                      const soloRatio = clamp(
                        (soloThresholdAU - viewSpanAU) /
                          Math.max(0.001, soloThresholdAU * 0.5),
                        0,
                        1
                      );

                      // Scale factor is sqrt(relative radius) relative to closest planet
                      const relRadius = Math.max(
                        0.0001,
                        b.radiusEarth / closestPhysRadEarth
                      );
                      const rawPlanetRadAU =
                        baselineClosestRadAU * Math.sqrt(relRadius);

                      // When multiple bodies are on screen (soloRatio = 0):
                      // 1. Planet visual radius CANNOT exceed maxOrbitClearanceAU (never crosses neighbor orbit or touches neighbor planet)
                      // 2. Planet visual radius CANNOT exceed starRadAU * 0.88 (planets shall never render larger than their star)
                      const nonSoloMaxAU = Math.min(
                        maxOrbitClearanceAU,
                        starRadAU * 0.88
                      );
                      // Absolute hard cap: no planet visual diameter > 1.0 AU (radius <= 0.5 AU) at all times
                      const soloMaxAU = 0.5;

                      // Interpolate allowed visual radius in AU based on soloRatio:
                      const effectiveMaxRadAU = lerp(
                        nonSoloMaxAU,
                        soloMaxAU,
                        soloRatio
                      );
                      const visualPlanetRadAU = Math.min(
                        effectiveMaxRadAU,
                        rawPlanetRadAU
                      );

                      // Convert to screen pixels:
                      const logicalPlanetRadPx =
                        visualPlanetRadAU * orreryPxPerAU;
                      const maxAllowedPx =
                        effectiveMaxRadAU * orreryPxPerAU * pProj.scale;
                      const maxStarCapPx = lerp(
                        starPxRad * 0.88,
                        130,
                        soloRatio
                      );

                      // Compute pRad:
                      let pRad = Math.min(
                        maxAllowedPx,
                        Math.min(maxStarCapPx, logicalPlanetRadPx * pProj.scale)
                      );
                      const minFloorPx = Math.min(
                        2.0,
                        maxOrbitClearanceAU * orreryPxPerAU * pProj.scale
                      );
                      pRad = Math.min(130, Math.max(minFloorPx, pRad));

                      const isPlanetTracked =
                        trackedTarget?.kind === 'planet' &&
                        trackedTarget.zoneIdx === zIdx &&
                        trackedTarget.bodyIdx === bIdx;
                      const isPlanetDossier =
                        selectedEntity?.kind === 'planet' &&
                        selectedEntity.zoneIdx === zIdx &&
                        selectedEntity.bodyIdx === bIdx;
                      const isPlanetSel = isPlanetTracked || isPlanetDossier;
                      const claimInfo = getPlanetClaimInfo(b, zIdx, bIdx);

                      const planetImgSize = pRad / 0.44;
                      const ringOffset = b.ringSystem
                        ? pRad * (Math.min(2.3, b.ringSystem.outerRadiusRp) - 1.0)
                        : 0;

                      // Check if this planet or any of its moons/rings are within the screen viewport:
                      // If offscreen, skip all procedural texture generation, 195-particle ring math, moon loops, and DOM nodes!
                      const maxMoonDistPx =
                        b.moons.length > 0
                          ? pRad +
                            ringOffset +
                            Math.max(4, pRad * (0.55 + (b.moons.length - 1) * 0.38)) +
                            pRad * 0.35 +
                            28
                          : pRad + ringOffset + 28;
                      const isPlanetSystemVisible = isCircleInViewport(
                        pProj.x,
                        pProj.y,
                        maxMoonDistPx,
                        64
                      );
                      const isPlanetBodyVisible = isCircleInViewport(
                        pProj.x,
                        pProj.y,
                        pRad + ringOffset + 28,
                        48
                      );

                      if (isPlanetSystemVisible) {
                        // Actual Procedural Planet Texture from Planet Info View (only computed when visible):
                        const planetIconUrl = isPlanetBodyVisible
                          ? getProceduralPlanetIconDataUrl(
                              b,
                              null,
                              zoneStar?.colorHex || '#fff4e6',
                              zoneStar?.Teff || 5778,
                              0,
                              144,
                              0,
                              0,
                              false
                            )
                          : '';

                        // Generate 3D Micro-Asteroid Ring Belt particles (split into Back & Front halves for true 3D planet occlusion)
                        // Only generated when the planet body & ring system are actually inside the viewport!
                        const ringBackNodes: React.ReactNode[] = [];
                        const ringFrontNodes: React.ReactNode[] = [];
                        if (isPlanetBodyVisible && b.ringSystem && pRad > 2.6) {
                          const rSys = b.ringSystem;
                          const tau = rSys.opticalDepth;
                          // Normalized visual density factor from optical depth τ ∈ [0.04, 2.0]
                          const densityNorm = clamp(Math.sqrt(tau / 1.45), 0.14, 1.15);
                          const isMajorRing = tau >= 0.9 || rSys.ringClass.includes('Major');
                          const isDenseRing =
                            !isMajorRing &&
                            (tau >= 0.28 ||
                              rSys.ringClass.includes('Silicate') ||
                              rSys.ringClass.includes('Roche'));

                          const rInnerPx = pRad * rSys.innerRadiusRp;
                          const rOuterPx = pRad * Math.min(2.38, rSys.outerRadiusRp);
                          const tiltY = Math.max(0.24, Math.abs(Math.cos(orreryPitch)));
                          const ringFrontSign = Math.sin(orreryPitch) < 0 ? -1 : 1;
                          const ringSeed = zIdx * 997 + bIdx * 313 + Math.round(b.a * 1000);

                          // Scale micro-asteroid speck count strongly with optical depth τ
                          const speckCount = Math.round(
                            clamp(22 + tau * 115, 26, 195)
                          );

                          const baseRingRgb =
                            rSys.iceFrac >= 0.5
                              ? '186, 230, 253'
                              : rSys.metalFrac >= 0.28
                              ? '212, 212, 216'
                              : '214, 190, 156';

                          // Helper to push a 3D ringlet arc split into back (behind planet) and front (in front of planet)
                          const pushRingletArcs = (
                            keyPrefix: string,
                            rx: number,
                            strokeW: number,
                            opacity: number
                          ) => {
                            if (rx <= 0 || strokeW <= 0.1 || opacity <= 0.01) return;
                            const ry = rx * tiltY;
                            const xL = (pProj.x - rx).toFixed(2);
                            const xR = (pProj.x + rx).toFixed(2);
                            const yC = pProj.y.toFixed(2);
                            const rxS = rx.toFixed(2);
                            const ryS = ry.toFixed(2);
                            const upperArc = (
                              <path
                                key={`${keyPrefix}-upper`}
                                d={`M ${xL} ${yC} A ${rxS} ${ryS} 0 0 1 ${xR} ${yC}`}
                                fill="none"
                                stroke={`rgba(${baseRingRgb}, ${opacity.toFixed(3)})`}
                                strokeWidth={strokeW}
                              />
                            );
                            const lowerArc = (
                              <path
                                key={`${keyPrefix}-lower`}
                                d={`M ${xR} ${yC} A ${rxS} ${ryS} 0 0 1 ${xL} ${yC}`}
                                fill="none"
                                stroke={`rgba(${baseRingRgb}, ${opacity.toFixed(3)})`}
                                strokeWidth={strokeW}
                              />
                            );
                            if (ringFrontSign >= 0) {
                              ringBackNodes.push(upperArc);
                              ringFrontNodes.push(lowerArc);
                            } else {
                              ringFrontNodes.push(upperArc);
                              ringBackNodes.push(lowerArc);
                            }
                          };

                          const spanPx = Math.max(1.2, rOuterPx - rInnerPx);
                          if (isMajorRing) {
                            // Saturn-class high optical depth: distinct dense inner B-ring and outer A-ring separated by Cassini gap
                            const innerBandRx = rInnerPx + spanPx * 0.3;
                            const innerBandW = spanPx * 0.48;
                            const outerBandRx = rInnerPx + spanPx * 0.81;
                            const outerBandW = spanPx * 0.28;
                            const bandAlpha = clamp(0.24 + 0.16 * densityNorm, 0.26, 0.44);
                            pushRingletArcs('ring-major-B', innerBandRx, innerBandW, bandAlpha);
                            pushRingletArcs('ring-major-A', outerBandRx, outerBandW, bandAlpha * 0.78);
                          } else if (isDenseRing) {
                            // Moderate optical depth: visible rocky/silicate debris band with inner & outer ringlets
                            const midRx = rInnerPx + spanPx * 0.5;
                            const bandAlpha = clamp(0.11 + 0.14 * densityNorm, 0.14, 0.25);
                            pushRingletArcs('ring-dense-main', midRx, spanPx * 0.68, bandAlpha);
                          } else {
                            // Faint dusty rings (low optical depth τ < 0.28): gossamer translucent dust track
                            const midRx = rInnerPx + spanPx * 0.5;
                            const bandAlpha = clamp(0.03 + 0.06 * densityNorm, 0.035, 0.085);
                            pushRingletArcs('ring-faint-dust', midRx, spanPx * 0.45, bandAlpha);
                          }

                          for (let k = 0; k < speckCount; k++) {
                            const u1 =
                              (((Math.sin((k + 1) * 12.9898 + ringSeed) * 43758.5453) % 1) + 1) % 1;
                            const u2 =
                              (((Math.sin((k + 1) * 78.233 + ringSeed * 1.7) * 43758.5453) % 1) +
                                1) %
                              1;
                            const u3 =
                              (((Math.sin((k + 1) * 39.425 + ringSeed * 2.3) * 43758.5453) % 1) +
                                1) %
                              1;

                            let uRad = u2;
                            if (isMajorRing && Math.abs(uRad - 0.62) < 0.045) {
                              uRad = uRad < 0.62 ? 0.56 : 0.68;
                            } else if (isDenseRing && Math.abs(uRad - 0.62) < 0.025) {
                              uRad = uRad < 0.62 ? 0.59 : 0.65;
                            }
                            const rPx = rInnerPx + uRad * (rOuterPx - rInnerPx);
                            const keplerRate = 22 / Math.pow(1 + uRad * 0.8, 1.5);
                            const ang = u1 * Math.PI * 2 + orreryTimeYr * keplerRate;
                            const sx = pProj.x + rPx * Math.cos(ang);
                            const sy = pProj.y + rPx * Math.sin(ang) * tiltY;

                            const isIce = u3 < rSys.iceFrac;
                            const isMetal = !isIce && u3 < rSys.iceFrac + rSys.metalFrac;
                            const col = isIce
                              ? '#e0f2fe'
                              : isMetal
                              ? '#d4d4d8'
                              : '#c7b299';
                            const densitySizeScale = isMajorRing ? 1.15 : isDenseRing ? 0.98 : 0.78;
                            const speckSz = clamp(
                              (0.42 + (k % 3) * 0.24) *
                                clamp(pRad / 14, 0.65, 1.65) *
                                densitySizeScale,
                              0.32,
                              1.65
                            );
                            const speckAlpha = clamp(
                              0.22 + 0.52 * densityNorm + u3 * 0.24,
                              0.24,
                              0.98
                            );
                            const rotDeg = Math.round(u1 * 360 + orreryTimeYr * 120);
                            const node = (
                              <ellipse
                                key={`ring-speck-${k}`}
                                cx={sx}
                                cy={sy}
                                rx={speckSz * 1.25}
                                ry={speckSz * 0.78}
                                transform={`rotate(${rotDeg} ${sx.toFixed(1)} ${sy.toFixed(1)})`}
                                fill={col}
                                fillOpacity={speckAlpha}
                              />
                            );
                            if (Math.sin(ang) * ringFrontSign < 0) {
                              ringBackNodes.push(node);
                            } else {
                              ringFrontNodes.push(node);
                            }
                          }
                        }

                        // Push planet & moon 3D globes into depth-sorted queue
                        depthNodes.push({
                          zCam: pProj.zCam,
                          key: `planet-node-${zIdx}-${bIdx}`,
                          node: (
                            <g key={`planet-fg-${zIdx}-${bIdx}`}>
                              {/* Moons around planet in 3D: procedural textures from info view */}
                              {(pRad > 5 || trackedTarget?.kind === 'moon') &&
                                b.moons.map((m, mIdx) => {
                                  const mSpeed = 12 + mIdx * 5;
                                  const mAngle =
                                    theta +
                                    (mIdx * Math.PI * 2) /
                                      Math.max(1, b.moons.length) +
                                    orreryTimeYr * mSpeed;
                                  const mDist =
                                    pRad +
                                    ringOffset +
                                    Math.max(4, pRad * (0.55 + mIdx * 0.38));
                                  const mxPos = pProj.x + mDist * Math.cos(mAngle);
                                  const rawCosP = Math.cos(orreryPitch);
                                  const myPos =
                                    pProj.y +
                                    mDist *
                                      Math.sin(mAngle) *
                                      (rawCosP < 0 ? -1 : 1) *
                                      Math.max(0.28, Math.abs(rawCosP));
                                  const relMoonRadius = Math.max(
                                    0.00001,
                                    m.radiusKm / 6371 / closestPhysRadEarth
                                  );
                                  const moonRadAU = Math.min(
                                    0.04,
                                    visualPlanetRadAU *
                                      0.35 *
                                      Math.sqrt(relMoonRadius)
                                  );
                                  const mRad = Math.max(
                                    0.8,
                                    Math.min(
                                      pRad * 0.3,
                                      moonRadAU * orreryPxPerAU * pProj.scale
                                    )
                                  );
                                  const isMoonInView = isCircleInViewport(
                                    mxPos,
                                    myPos,
                                    mRad + 24,
                                    24
                                  );
                                  const moonIconUrl = isMoonInView
                                    ? getProceduralPlanetIconDataUrl(
                                        b,
                                        m,
                                        zoneStar?.colorHex || '#fff4e6',
                                        zoneStar?.Teff || 5778,
                                        mIdx,
                                        72,
                                        0,
                                        0
                                      )
                                    : '';
                                  const moonImgSize = mRad / 0.44;

                                  const isMoonTracked =
                                    trackedTarget?.kind === 'moon' &&
                                    trackedTarget.zoneIdx === zIdx &&
                                    trackedTarget.bodyIdx === bIdx &&
                                    trackedTarget.moonIdx === mIdx;
                                  const isMoonDossier =
                                    selectedEntity?.kind === 'moon' &&
                                    selectedEntity.zoneIdx === zIdx &&
                                    selectedEntity.bodyIdx === bIdx &&
                                    selectedEntity.moonIdx === mIdx;
                                  const isMoonSel = isMoonTracked || isMoonDossier;

                                  return (
                                    <g
                                      key={m.id || mIdx}
                                      className="cursor-pointer"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (e.shiftKey) {
                                          handleTrackBody({
                                            kind: 'moon',
                                            zoneIdx: zIdx,
                                            bodyIdx: bIdx,
                                            moonIdx: mIdx,
                                          });
                                        } else {
                                          handleZoomToEntity({
                                            kind: 'moon',
                                            zoneIdx: zIdx,
                                            bodyIdx: bIdx,
                                            moonIdx: mIdx,
                                          });
                                        }
                                      }}
                                      onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSelectedEntity({
                                          kind: 'moon',
                                          zoneIdx: zIdx,
                                          bodyIdx: bIdx,
                                          moonIdx: mIdx,
                                        });
                                      }}
                                      onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        if (onOpenSurfaceGen && systemResult) {
                                          onOpenSurfaceGen({
                                            planet: b,
                                            moon: m,
                                            zone: systemResult.zones[zIdx],
                                            stars: systemResult.hierarchy.stars,
                                          });
                                        } else {
                                          setSelectedEntity({
                                            kind: 'moon',
                                            zoneIdx: zIdx,
                                            bodyIdx: bIdx,
                                            moonIdx: mIdx,
                                          });
                                        }
                                      }}
                                    >
                                      <title>{`${m.name} (${m.moonClass})\n• Click: Zoom to\n• Shift+Click: Lock Camera & Track Orbit\n• Right-Click: Open Detailed Stats (Dossier)\n• Double-Click: Open Surface View`}</title>
                                      <ellipse
                                        cx={pProj.x}
                                        cy={pProj.y}
                                        rx={mDist}
                                        ry={
                                          mDist *
                                          Math.max(
                                            0.32,
                                            Math.cos(orreryPitch * 0.78)
                                          )
                                        }
                                        fill="none"
                                        stroke="rgba(100,116,139,0.28)"
                                        strokeWidth={0.7}
                                        strokeDasharray="2,2"
                                      />
                                      {isMoonInView && (
                                        <>
                                          {isMoonSel && (
                                            <circle
                                              cx={mxPos}
                                              cy={myPos}
                                              r={mRad + 3.0}
                                              fill="none"
                                              stroke="#38bdf8"
                                              strokeWidth={1.6}
                                            />
                                          )}
                                          <g
                                            transform={`translate(${mxPos.toFixed(1)}, ${myPos.toFixed(1)})`}
                                          >
                                            <image
                                              href={moonIconUrl}
                                              x={-moonImgSize / 2}
                                              y={-moonImgSize / 2}
                                              width={moonImgSize}
                                              height={moonImgSize}
                                              preserveAspectRatio="xMidYMid meet"
                                            />
                                          </g>
                                          {showLabels && (
                                            <text
                                              x={mxPos}
                                              y={myPos - mRad - 3}
                                              fill="#bae6fd"
                                              fontSize={9}
                                              fontFamily="monospace"
                                              fontWeight="bold"
                                              textAnchor="middle"
                                            >
                                              {m.name || `Moon ${mIdx + 1}`}
                                            </text>
                                          )}
                                        </>
                                      )}
                                    </g>
                                  );
                                })}

                              {/* Clickable Dynamically-Sized Procedural Planet Globe, Micro-Asteroid Ring Belt & Label */}
                              {isPlanetBodyVisible && (
                                <g
                                  className="cursor-pointer"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (e.shiftKey) {
                                      handleTrackBody({
                                        kind: 'planet',
                                        zoneIdx: zIdx,
                                        bodyIdx: bIdx,
                                      });
                                    } else {
                                      handleZoomToEntity({
                                        kind: 'planet',
                                        zoneIdx: zIdx,
                                        bodyIdx: bIdx,
                                      });
                                    }
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setSelectedEntity({
                                      kind: 'planet',
                                      zoneIdx: zIdx,
                                      bodyIdx: bIdx,
                                    });
                                  }}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    if (onOpenSurfaceGen && systemResult) {
                                      onOpenSurfaceGen({
                                        planet: b,
                                        moon: null,
                                        zone: systemResult.zones[zIdx],
                                        stars: systemResult.hierarchy.stars,
                                      });
                                    } else {
                                      setSelectedEntity({
                                        kind: 'planet',
                                        zoneIdx: zIdx,
                                        bodyIdx: bIdx,
                                      });
                                    }
                                  }}
                                >
                                  <title>{`${claimInfo ? `[${claimInfo.empire.name} — ${claimInfo.designation}] ` : ''}Planet #${bIdx + 1}: ${b.planetClass.replace(/\s*\([^)]*\)/g, '')}${b.ringSystem ? `\nRing System: ${b.ringSystem.ringClass} (${b.ringSystem.innerRadiusKm.toLocaleString()}–${b.ringSystem.outerRadiusKm.toLocaleString()} km, ${b.ringSystem.compositionLabel})` : ''}\n• Click: Zoom to\n• Shift+Click: Lock Camera & Track Orbit\n• Right-Click: Open Detailed Stats (Dossier)\n• Double-Click: Open Planetary Surface Generator`}</title>
                                  {/* Invisible click target for easy selection */}
                                  <circle
                                    cx={pProj.x}
                                    cy={pProj.y}
                                    r={Math.max(8, pRad + ringOffset + 3)}
                                    fill="transparent"
                                  />

                                  {/* Planet Selection Halo */}
                                  {isPlanetSel && (
                                    <circle
                                      cx={pProj.x}
                                      cy={pProj.y}
                                      r={pRad + 3.5}
                                      fill="none"
                                      stroke="#38bdf8"
                                      strokeWidth={1.8}
                                    />
                                  )}

                                  {/* Imperial Sovereignty Halo */}
                                  {claimInfo && (
                                    <circle
                                      cx={pProj.x}
                                      cy={pProj.y}
                                      r={pRad + 4.5}
                                      fill="none"
                                      stroke={claimInfo.empire.color}
                                      strokeWidth={2.0}
                                      strokeDasharray={claimInfo.designation === 'Capital' ? undefined : '3,2'}
                                      opacity={0.9}
                                    />
                                  )}

                                  {/* Back-Half of 3D Micro-Asteroid Ring Belt (occluded by planet globe) */}
                                  {ringBackNodes}

                                  {/* Procedural Planet Globe Texture (from Planet Info View) */}
                                  <g
                                    transform={`translate(${pProj.x.toFixed(1)}, ${pProj.y.toFixed(1)})`}
                                  >
                                    <image
                                      href={planetIconUrl}
                                      x={-planetImgSize / 2}
                                      y={-planetImgSize / 2}
                                      width={planetImgSize}
                                      height={planetImgSize}
                                      preserveAspectRatio="xMidYMid meet"
                                    />
                                  </g>

                                  {/* Front-Half of 3D Micro-Asteroid Ring Belt (passing in front of planet globe) */}
                                  {ringFrontNodes}

                                  {/* Planet Label (#num and AU) */}
                                  {showLabels && rOrbitPx > 24 && (
                                    <text
                                      x={pProj.x}
                                      y={pProj.y - pRad - 4}
                                      fill={claimInfo ? claimInfo.empire.color : '#f8fafc'}
                                      fontSize={clamp(8 + pRad * 0.08, 8, 13)}
                                      fontWeight="bold"
                                      fontFamily="monospace"
                                      textAnchor="middle"
                                    >
                                      {claimInfo ? (claimInfo.designation === 'Capital' ? '👑 ' : '🚩 ') : ''}#{bIdx + 1} ({b.a.toFixed(2)} AU)
                                    </text>
                                  )}
                                </g>
                              )}
                            </g>
                          ),
                        });
                      }

                      if (!orbitPath3D) return null;

                      const isNavOrigin =
                        showLagrange && zIdx === navZoneIdx && bIdx === navOriginIdx;
                      const isNavDest =
                        showLagrange &&
                        zIdx === navZoneIdx &&
                        bIdx === navDestIdx &&
                        navDestIdx !== navOriginIdx;
                      const showLagrangeForThisPlanet = isNavOrigin && rOrbitPx > 24;

                      return (
                        <g key={`orbit-bg-${zIdx}-${bIdx}`}>
                          {/* 3D Keplerian Inclined Orbit Path */}
                          <path
                            d={orbitPath3D}
                            fill="none"
                            stroke={
                              isPlanetSel || isNavOrigin
                                ? '#38bdf8'
                                : isNavDest
                                ? 'rgba(251, 191, 36, 0.85)'
                                : claimInfo
                                ? `${claimInfo.empire.color}90`
                                : isCircumbinary
                                ? 'rgba(251, 191, 36, 0.32)'
                                : 'rgba(51, 65, 85, 0.88)'
                            }
                            strokeWidth={
                              isPlanetSel || isNavOrigin
                                ? 1.8
                                : isNavDest
                                ? 1.5
                                : claimInfo
                                ? 1.4
                                : 1.15
                            }
                          />

                          {/* Lagrange Points (L1-L5), Hill Sphere & Hohmann Transfer Overlay */}
                          {showLagrangeForThisPlanet &&
                            (() => {
                              const mStar = Math.max(0.08, zoneStar?.mass || 1.0);
                              const qRatio = (b.massEarth * 3.003e-6) / mStar;
                              const rHillPhysAU = b.a * (1 - b.e) * Math.cbrt(qRatio / 3);
                              const rHillVisAU = Math.max(
                                rHillPhysAU,
                                visualPlanetRadAU * 2.4,
                                b.a * 0.075
                              );
                              const rHillPx = Math.max(
                                pRad + 9,
                                rHillVisAU * orreryPxPerAU * pProj.scale
                              );

                              const dx3 = pos3.wx - centerAU.x;
                              const dy3 = pos3.wy - centerAU.y;
                              const dz3 = pos3.wz;
                              const dist3 = Math.max(1e-6, Math.hypot(dx3, dy3, dz3));
                              const ux = dx3 / dist3;
                              const uy = dy3 / dist3;
                              const uz = dz3 / dist3;

                              const l1Proj = project3D(
                                pos3.wx - ux * rHillVisAU,
                                pos3.wy - uy * rHillVisAU,
                                pos3.wz - uz * rHillVisAU
                              );
                              const l2Proj = project3D(
                                pos3.wx + ux * rHillVisAU,
                                pos3.wy + uy * rHillVisAU,
                                pos3.wz + uz * rHillVisAU
                              );
                              const l3Pos = evalKepler3D(
                                centerAU,
                                b.a,
                                b.e,
                                incRad,
                                omegaNode,
                                argPeri,
                                theta + Math.PI
                              );
                              const l4Pos = evalKepler3D(
                                centerAU,
                                b.a,
                                b.e,
                                incRad,
                                omegaNode,
                                argPeri,
                                theta + Math.PI / 3
                              );
                              const l5Pos = evalKepler3D(
                                centerAU,
                                b.a,
                                b.e,
                                incRad,
                                omegaNode,
                                argPeri,
                                theta - Math.PI / 3
                              );
                              const l3Proj = project3D(l3Pos.wx, l3Pos.wy, l3Pos.wz);
                              const l4Proj = project3D(l4Pos.wx, l4Pos.wy, l4Pos.wz);
                              const l5Proj = project3D(l5Pos.wx, l5Pos.wy, l5Pos.wz);

                              // Resolve selected Transfer Destination planet in zone
                              const neighborPlanet = (() => {
                                const selDest = z.bodies[navDestIdx];
                                if (
                                  navDestIdx !== bIdx &&
                                  selDest &&
                                  selDest.kind === 'planet'
                                ) {
                                  return { body: selDest, idx: navDestIdx };
                                }
                                for (let i = bIdx + 1; i < z.bodies.length; i++) {
                                  const cand = z.bodies[i];
                                  if (cand.kind === 'planet') return { body: cand, idx: i };
                                }
                                for (let i = bIdx - 1; i >= 0; i--) {
                                  const cand = z.bodies[i];
                                  if (cand.kind === 'planet') return { body: cand, idx: i };
                                }
                                return null;
                              })();

                              let hohmannPath = '';
                              let hohmannMid = { x: 0, y: 0 };
                              let hohmannDvTotal = 0;

                              if (neighborPlanet) {
                                const r1 = b.a;
                                const r2 = neighborPlanet.body.a;
                                const aTrans = (r1 + r2) / 2;
                                const v1 = 29.784 * Math.sqrt(mStar / r1);
                                const v2 = 29.784 * Math.sqrt(mStar / r2);
                                const vTrans1 = 29.784 * Math.sqrt(mStar * (2 / r1 - 1 / aTrans));
                                const vTrans2 = 29.784 * Math.sqrt(mStar * (2 / r2 - 1 / aTrans));
                                hohmannDvTotal = Math.abs(vTrans1 - v1) + Math.abs(v2 - vTrans2);

                                const steps = 28;
                                const pts: string[] = [];
                                for (let s = 0; s <= steps; s++) {
                                  const u = s / steps;
                                  const dTheta = u * Math.PI;
                                  // Interpolate radius along Hohmann transfer ellipse
                                  const eTrans = Math.abs(r2 - r1) / (r1 + r2);
                                  const pSemi = aTrans * (1 - eTrans * eTrans);
                                  const cosNu = r2 >= r1 ? Math.cos(dTheta) : -Math.cos(dTheta);
                                  const rStep = pSemi / Math.max(0.05, 1 + eTrans * cosNu);
                                  const pt3 = evalKepler3D(
                                    centerAU,
                                    rStep,
                                    0,
                                    incRad,
                                    omegaNode,
                                    argPeri,
                                    theta + dTheta
                                  );
                                  const pr = project3D(pt3.wx, pt3.wy, pt3.wz);
                                  pts.push(
                                    `${s === 0 ? 'M' : 'L'}${pr.x.toFixed(1)},${pr.y.toFixed(1)}`
                                  );
                                  if (s === Math.floor(steps / 2)) {
                                    hohmannMid = { x: pr.x, y: pr.y };
                                  }
                                }
                                hohmannPath = pts.join(' ');
                              }

                              const lagrangePts = [
                                { id: 'L1', p: l1Proj, stable: false },
                                { id: 'L2', p: l2Proj, stable: false },
                                { id: 'L3', p: l3Proj, stable: false },
                                { id: 'L4', p: l4Proj, stable: true },
                                { id: 'L5', p: l5Proj, stable: true },
                              ];

                              return (
                                <g className="pointer-events-none">
                                  {/* Trojan Equilateral Triangles (Star - L4/L5 - Planet) */}
                                  <polygon
                                    points={`${starProj.x.toFixed(1)},${starProj.y.toFixed(1)} ${pProj.x.toFixed(1)},${pProj.y.toFixed(1)} ${l4Proj.x.toFixed(1)},${l4Proj.y.toFixed(1)}`}
                                    fill="rgba(52, 211, 153, 0.035)"
                                    stroke="rgba(52, 211, 153, 0.28)"
                                    strokeWidth={1}
                                    strokeDasharray="3,3"
                                  />
                                  <polygon
                                    points={`${starProj.x.toFixed(1)},${starProj.y.toFixed(1)} ${pProj.x.toFixed(1)},${pProj.y.toFixed(1)} ${l5Proj.x.toFixed(1)},${l5Proj.y.toFixed(1)}`}
                                    fill="rgba(52, 211, 153, 0.035)"
                                    stroke="rgba(52, 211, 153, 0.28)"
                                    strokeWidth={1}
                                    strokeDasharray="3,3"
                                  />

                                  {/* Hill Sphere Boundary Ring */}
                                  <circle
                                    cx={pProj.x}
                                    cy={pProj.y}
                                    r={rHillPx}
                                    fill="rgba(56, 189, 248, 0.04)"
                                    stroke="rgba(56, 189, 248, 0.45)"
                                    strokeWidth={1.1}
                                    strokeDasharray="2,2"
                                  />

                                  {/* Hohmann Transfer Trajectory Arc */}
                                  {hohmannPath && (
                                    <g>
                                      <path
                                        d={hohmannPath}
                                        fill="none"
                                        stroke="#fbbf24"
                                        strokeWidth={1.6}
                                        strokeDasharray="5,3"
                                        opacity={0.88}
                                      />
                                      <rect
                                        x={hohmannMid.x - 42}
                                        y={hohmannMid.y - 9}
                                        width={84}
                                        height={16}
                                        rx={4}
                                        fill="rgba(15, 23, 42, 0.88)"
                                        stroke="rgba(251, 191, 36, 0.55)"
                                        strokeWidth={0.9}
                                      />
                                      <text
                                        x={hohmannMid.x}
                                        y={hohmannMid.y + 2.5}
                                        fill="#fde68a"
                                        fontSize={8.5}
                                        fontFamily="monospace"
                                        fontWeight="bold"
                                        textAnchor="middle"
                                      >
                                        Δv {hohmannDvTotal.toFixed(1)} km/s
                                      </text>
                                    </g>
                                  )}

                                  {/* L1-L5 Markers */}
                                  {lagrangePts.map((lp) => (
                                    <g
                                      key={lp.id}
                                      transform={`translate(${lp.p.x.toFixed(1)}, ${lp.p.y.toFixed(1)})`}
                                    >
                                      {lp.stable ? (
                                        <polygon
                                          points="0,-4.5 4.2,3.2 -4.2,3.2"
                                          fill="#10b981"
                                          stroke="#022c22"
                                          strokeWidth={1}
                                        />
                                      ) : (
                                        <polygon
                                          points="0,-4 4,0 0,4 -4,0"
                                          fill="#38bdf8"
                                          stroke="#082f49"
                                          strokeWidth={1}
                                        />
                                      )}
                                      <text
                                        x={0}
                                        y={-6.5}
                                        fill={lp.stable ? '#6ee7b7' : '#7dd3fc'}
                                        fontSize={8.5}
                                        fontFamily="monospace"
                                        fontWeight="bold"
                                        textAnchor="middle"
                                      >
                                        {lp.id}
                                      </text>
                                    </g>
                                  ))}
                                </g>
                              );
                            })()}
                        </g>
                      );
                    });
                  })()}
                </g>
              );
            })}

            {/* 3. Push All Visible Stars into 3D Depth-Sorted Render Queue */}
            {(() => {
              res.hierarchy.stars.forEach((st, sIdx) => {
                const pos = layout.starPos[st.label] || { x: 0, y: 0 };
                const sProj = project3D(pos.x, pos.y, 0);

                // Find innermost orbit around this star so the star never overlaps its closest planet
                const starZone = res.zones.find((z) =>
                  z.title.startsWith(`Star ${st.label} `)
                );
                const firstBody = starZone?.bodies[0];
                const minOrbitAU = firstBody
                  ? firstBody.a *
                    (1 - (firstBody.kind === 'planet' ? firstBody.e : 0))
                  : res.hierarchy.splits[0]
                  ? res.hierarchy.splits[0].a_AU * 0.35
                  : 0.25;
                // Star visual radius in AU: expands with zoom and scales with physical star radius
                const starBaseRadAU = Math.max(
                  0.012,
                  Math.min(0.35, 0.035 * Math.sqrt(Math.max(0.08, st.radius || 1.0)))
                );
                const maxStarAU = Math.max(0.008, minOrbitAU * 0.42);
                const starRadAU = Math.min(starBaseRadAU, maxStarAU);

                // Star expands dynamically as you zoom in, capped at 260px so offscreen/huge radial gradients don't stall SVG rasterization:
                const sRad = clamp(
                  starRadAU * orreryPxPerAU * sProj.scale,
                  5.0,
                  260
                );
                // Cull star completely if its outer corona is outside the viewport
                if (!isCircleInViewport(sProj.x, sProj.y, sRad * 2.4 + 32, 64)) {
                  return;
                }
                const starGradId = `star-3d-sphere-${sIdx}`;

                depthNodes.push({
                  zCam: sProj.zCam,
                  key: `star-3d-${st.label}`,
                  node: (
                    <g
                      key={`star-3d-${st.label}`}
                      className="cursor-pointer"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (e.shiftKey) {
                          handleTrackBody({ kind: 'star', starIdx: sIdx });
                        } else {
                          handleZoomToEntity({ kind: 'star', starIdx: sIdx });
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedEntity({ kind: 'star', starIdx: sIdx });
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setSelectedEntity({ kind: 'star', starIdx: sIdx });
                      }}
                    >
                      <title>{`Star ${st.label} (${st.spectralType})\n• Click: Zoom to\n• Shift+Click: Lock Camera & Track\n• Right-Click / Double-Click: Open Detailed Stats`}</title>
                      <defs>
                        <radialGradient
                          id={starGradId}
                          cx="35%"
                          cy="35%"
                          r="65%"
                        >
                          <stop offset="0%" stopColor="#ffffff" />
                          <stop offset="45%" stopColor={st.colorHex} />
                          <stop
                            offset="100%"
                            stopColor={st.colorHex}
                            stopOpacity="0.88"
                          />
                        </radialGradient>
                      </defs>
                      {(() => {
                        const catLower = (st.category || '').toLowerCase();
                        const spLower = (st.spectralType || '').toLowerCase();
                        const isSMBH = catLower.includes('supermassive') || spLower.includes('smbh') || st.mass > 999999;
                        const isBH = isSMBH || catLower.includes('black hole') || spLower.includes('black hole') || spLower === 'bh' || spLower.startsWith('bh ');
                        if (isBH) {
                          const rH = isSMBH ? Math.max(12, sRad * 1.2) : Math.max(6, sRad * 0.9);
                          const rxD = isSMBH ? rH * 2.4 : rH * 2.1;
                          const ryD = isSMBH ? rH * 0.95 : rH * 0.8;
                          return (
                            <g>
                              {/* Accretion disk atmospheric glow */}
                              <circle cx={sProj.x} cy={sProj.y} r={rxD * 1.4} fill="#a855f7" fillOpacity={0.25} />
                              <circle cx={sProj.x} cy={sProj.y} r={rxD * 0.9} fill="#c084fc" fillOpacity={0.35} />
                              {/* Tilted relativistic accretion torus */}
                              <ellipse cx={sProj.x} cy={sProj.y} rx={rxD} ry={ryD} fill="none" stroke="#c084fc" strokeWidth={isSMBH ? 2.0 : 1.3} opacity={0.88} transform={`rotate(-18, ${sProj.x}, ${sProj.y})`} />
                              <ellipse cx={sProj.x} cy={sProj.y} rx={rxD * 0.72} ry={ryD * 0.72} fill="none" stroke="#f3e8ff" strokeWidth={isSMBH ? 1.4 : 0.8} opacity={0.8} transform={`rotate(-18, ${sProj.x}, ${sProj.y})`} />
                              {/* Event Horizon (Pure Black Void) */}
                              <circle cx={sProj.x} cy={sProj.y} r={rH} fill="#000000" stroke="#c084fc" strokeWidth={isSMBH ? 1.6 : 1.0} />
                            </g>
                          );
                        }
                        const starImgSize = (sRad / 0.42) * 2;
                        const starSpriteUrl = getProceduralStarSpriteDataUrl(st, 168);
                        return (
                          <g>
                            {/* Corona halo glow */}
                            <circle
                              cx={sProj.x}
                              cy={sProj.y}
                              r={sRad * 2.2}
                              fill={st.colorHex}
                              fillOpacity={0.16}
                            />
                            <circle
                              cx={sProj.x}
                              cy={sProj.y}
                              r={sRad * 1.38}
                              fill={st.colorHex}
                              fillOpacity={0.28}
                            />
                            <image
                              href={starSpriteUrl}
                              x={sProj.x - starImgSize / 2}
                              y={sProj.y - starImgSize / 2}
                              width={starImgSize}
                              height={starImgSize}
                              preserveAspectRatio="xMidYMid meet"
                            />
                          </g>
                        );
                      })()}
                      {showLabels && (
                        <text
                          x={sProj.x}
                          y={sProj.y + sRad + 10}
                          fill="#ffffff"
                          fontSize={clamp(8 + sRad * 0.1, 8, 10.5)}
                          fontWeight="bold"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          Star {st.label} ({st.spectralType})
                        </text>
                      )}
                    </g>
                  ),
                });
              });

              // Sort back-to-front (largest zCam is furthest away, smallest zCam is closest to camera)
              depthNodes.sort((a, b) => b.zCam - a.zCam);
              return depthNodes.map((d) => d.node);
            })()}

            {/* 4. Dynamic Physical Scale Bar & 3D Camera Telemetry Overlay */}
            <g transform={`translate(20, ${viewH - 42})`}>
              <rect
                x={-8}
                y={-18}
                width={Math.max(255, barPx + 28)}
                height={50}
                rx={6}
                fill="rgba(10, 15, 26, 0.88)"
                stroke="#1e293b"
              />
              <line
                x1={4}
                y1={6}
                x2={4 + barPx}
                y2={6}
                stroke="#38bdf8"
                strokeWidth={2.5}
              />
              <line x1={4} y1={1} x2={4} y2={11} stroke="#38bdf8" strokeWidth={2} />
              <line
                x1={4 + barPx}
                y1={1}
                x2={4 + barPx}
                y2={11}
                stroke="#38bdf8"
                strokeWidth={2}
              />
              <text
                x={4 + barPx / 2}
                y={-3}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight="bold"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {barAU >= 1 ? `${barAU} AU` : `${barAU.toPrecision(1)} AU`}
              </text>
              <text
                x={4}
                y={19}
                fill="#94a3b8"
                fontSize={8.5}
                fontFamily="monospace"
              >
                3D Pitch {Math.round((orreryPitch * 180) / Math.PI)}° · Yaw{' '}
                {Math.round(((orreryYaw * 180) / Math.PI) % 360)}° · Click: Zoom · Right-Click: Planet Data · Shift+Click: Track Orbit · Double-Click: Surface · Drag: Rotate
              </text>
            </g>
          </svg>
        </div>
      </div>
    );
  };

  // ============================================================================
  // CLICK-TO-BLOW-UP FULL ASTROPHYSICAL DETAILS MODAL (PLANETS, MOONS, STARS, BELTS)
  // ============================================================================
  const renderBlowUpModal = () => {
    if (!selectedEntity || !systemResult) return null;

    // 1. Star Dossier Blow-Up
    if (selectedEntity.kind === 'star') {
      const st = systemResult.hierarchy.stars[selectedEntity.starIdx];
      if (!st) return null;
      return (
        <StarDossierModal
          star={st}
          starIdx={selectedEntity.starIdx}
          systemResult={systemResult}
          onSelectStar={(idx) => setSelectedEntity({ kind: 'star', starIdx: idx })}
          onTrackInOrrery={(idx) => {
            handleTrackBody({ kind: 'star', starIdx: idx });
            setMapMode('orrery2d');
          }}
          onOpenPreProgramStars={() => setShowPreProgramModal(true)}
          onClose={() => setSelectedEntity(null)}
        />
      );
    }

    // 2. Binary Split Dossier Blow-Up
    if (selectedEntity.kind === 'split') {
      const sp = systemResult.hierarchy.splits[selectedEntity.splitIdx];
      if (!sp) return null;
      return (
        <BinarySplitModal
          split={sp}
          onClose={() => setSelectedEntity(null)}
        />
      );
    }

    // 3. Belt Dossier Blow-Up
    if (selectedEntity.kind === 'belt') {
      const zone = systemResult.zones[selectedEntity.zoneIdx];
      const belt = zone?.bodies[selectedEntity.bodyIdx] as RealisticBeltBody | undefined;
      if (!zone || !belt || belt.kind !== 'belt') return null;
      return (
        <BeltDossierModal
          belt={belt}
          bodyIdx={selectedEntity.bodyIdx}
          zone={zone}
          onClose={() => setSelectedEntity(null)}
        />
      );
    }

    // 4. Planet & Moon Dossier Modal
    if (selectedEntity.kind === 'planet' || selectedEntity.kind === 'moon') {
      const hostPlanet = systemResult.zones[selectedEntity.zoneIdx]?.bodies[selectedEntity.bodyIdx] as RealisticPlanetBody | undefined;
      const claimInfo = hostPlanet ? getPlanetClaimInfo(hostPlanet, selectedEntity.zoneIdx, selectedEntity.bodyIdx) : null;

      return (
        <PlanetDossierModal
          selectedEntity={selectedEntity}
          systemResult={systemResult}
          onSelectEntity={setSelectedEntity}
          onTrackInOrrery={(ent) => {
            handleTrackBody(ent);
            setMapMode('orrery2d');
          }}
          onClose={() => setSelectedEntity(null)}
          currentEmpire={currentEmpire}
          sectorEmpires={sectorEmpires}
          planetClaimInfo={claimInfo}
          onToggleClaimPlanet={(des, empId) => {
            if (hostPlanet) {
              handleToggleClaimPlanet(hostPlanet, selectedEntity.zoneIdx, selectedEntity.bodyIdx, des, empId);
            }
          }}
          onOpenSurfaceGen={onOpenSurfaceGen}
        />
      );
    }

    return null;
  };

  return (
    <div className={`w-full h-full ${showUI ? 'overflow-y-auto p-3 gap-3' : 'overflow-hidden p-0 gap-0'} bg-[#060911] text-slate-100 custom-scrollbar flex flex-col relative`}>
      {isGeneratingSystem && (
        <GenerationLoadingOverlay
          title={`Synthesizing ${generatingSystemLabel}`}
          subtitle={`Mass: ${sysMass} M☉ • Age: ${age.toFixed(2)} Gyr • [Fe/H]: ${feh >= 0 ? `+${feh.toFixed(2)}` : feh.toFixed(2)} dex`}
          detail="Computing protoplanetary disk condensation zones, Keplerian resonances, atmospheres, and biospheres..."
          accentColor="#38bdf8"
        />
      )}
      {/* Imperial Sovereignty & Realm Banner */}
      {showUI && currentEmpire && (
        <div
          className="rounded-xl p-3 border font-mono text-xs flex flex-wrap items-center justify-between gap-3 shadow-lg relative overflow-hidden"
          style={{
            backgroundColor: `${currentEmpire.color}15`,
            borderColor: `${currentEmpire.color}60`,
          }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{currentEmpire.phenotype.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm tracking-wide">
                  {currentEmpire.name}
                </span>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold border"
                  style={{
                    color: currentEmpire.color,
                    borderColor: `${currentEmpire.color}60`,
                    backgroundColor: `${currentEmpire.color}25`,
                  }}
                >
                  {currentEmpire.homeworldSystemId === currentSysId
                    ? '👑 Imperial Capital System'
                    : '🚩 Imperial Sovereign Territory'}
                </span>
              </div>
              <div className="text-[11px] text-slate-300 flex items-center gap-2 mt-0.5 flex-wrap">
                <span>
                  {currentEmpire.government?.icon} {currentEmpire.government?.name || 'Empire'}
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-400">{currentEmpire.phenotype.name} Civilization</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-400">Homeworld: {currentEmpire.homeworldName}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {currentEmpire.ethics && (
              <div className="flex flex-wrap gap-1">
                {currentEmpire.ethics.map((eth) => (
                  <span
                    key={eth.id}
                    className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-700/80 text-[10px] text-slate-300 flex items-center gap-1 shadow-sm"
                    title={eth.description}
                  >
                    <span>{eth.icon}</span>
                    <span>{eth.name}</span>
                  </span>
                ))}
              </div>
            )}
            {(() => {
              const claimedPlanetsInSys = (currentEmpire.claimedPlanetKeys || []).filter((k) =>
                currentSysId ? k.startsWith(`${currentSysId}_`) : false
              ).length;
              return (
                <div
                  className="px-2.5 py-1 rounded-lg border text-[11px] font-bold"
                  style={{
                    color: currentEmpire.color,
                    borderColor: `${currentEmpire.color}50`,
                    backgroundColor: `${currentEmpire.color}20`,
                  }}
                >
                  🏛️ {claimedPlanetsInSys} Planetary Colonies
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Compact Top Control & Slider Deck */}
      {showUI && (
        <div className="bg-[#0e131d] border border-[#2a3852] rounded-xl p-3.5 flex flex-col gap-3 shadow-lg">
        <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            {onBackToSectorHex && (
              <button
                type="button"
                onClick={handleBackToSectorWithTransition}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 border border-indigo-700 flex items-center gap-1.5 cursor-pointer transition shadow"
                title="Return to Sector Map (Hotkey: Page Up)"
              >
                <span>&larr; Back to Sector Map</span>
                <kbd className="px-1.5 py-0.5 text-[9px] bg-slate-900/90 border border-indigo-500/50 rounded text-indigo-300 font-sans font-normal ml-0.5">
                  PgUp
                </kbd>
              </button>
            )}
            <h1 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
              <span>2D Astrophysical System Map</span>
              {systemResult?.step1?.id && (
                <span className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  {systemResult.step1.name || systemResult.step1.id}
                </span>
              )}
              {isFromCache && (
                <span
                  className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800 flex items-center gap-1 shadow-sm"
                  title="System state restored from persistent universe cache"
                >
                  <span>💾</span>
                  <span>Cached System</span>
                </span>
              )}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleRollPureIMF}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 border border-sky-400 shadow flex items-center gap-1.5 cursor-pointer transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Roll New
            </button>
            <button
              type="button"
              onClick={handleRerollKeepSliders}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#151d2c] hover:bg-[#1e293b] text-slate-100 border border-[#2a3852] hover:border-sky-400 flex items-center gap-1.5 cursor-pointer transition"
              title="Re-roll system using current parameters"
            >
              <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
              Re-Roll
            </button>
            <button
              type="button"
              onClick={handleRerollPlanetsOnly}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#151d2c] hover:bg-[#1e293b] text-sky-200 border border-[#2a3852] hover:border-sky-400 flex items-center gap-1.5 cursor-pointer transition"
              title="Keep current star(s) fixed and re-roll only the planets and moons"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              Roll Planets Only
            </button>
            <button
              type="button"
              onClick={() => setShowPreProgramModal(true)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                customStellarConfig?.enabled
                  ? 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-400 shadow'
                  : 'bg-[#151d2c] hover:bg-[#1e293b] text-amber-200 border border-[#2a3852] hover:border-amber-400'
              }`}
              title="Pre-program custom star data (mass, luminosity, radius, Teff, spectral type, binary orbits) and generate planets only"
            >
              {customStellarConfig?.enabled ? (
                <Lock className="w-3.5 h-3.5 text-white" />
              ) : (
                <Star className="w-3.5 h-3.5 text-amber-400" />
              )}
              {customStellarConfig?.enabled
                ? `Stars Pre-Programmed (${customStellarConfig.nStars}★)`
                : 'Pre-Program Stars'}
            </button>
            {systemResult && systemResult.zones.length > 0 && (
              <>
                {onInspectInSector3D && (
                  <button
                    type="button"
                    onClick={() =>
                      onInspectInSector3D(
                        convertRealisticToSectorStarSystem(systemResult, 0)
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-700 flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Rocket className="w-3.5 h-3.5 text-emerald-400" />
                    Send to Sector Sim
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => sendZoneToArchitect(0)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-700 flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Wrench className="w-3.5 h-3.5 text-amber-400" />
                  3D Architect
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setShowJsonModal(true);
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#151d2c] hover:bg-[#1e293b] text-slate-100 border border-[#2a3852] flex items-center gap-1.5 cursor-pointer transition"
              title="Import or Export System JSON"
            >
              <Code className="w-3.5 h-3.5 text-emerald-400" />
              Import / Export
            </button>
          </div>
        </div>

        {/* Sliders Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] font-semibold text-slate-300 uppercase">
              <span>System Mass</span>
              <span className="text-sky-400 font-mono">
                {sysMass >= 100000 ? `${sysMass.toLocaleString()} M☉` : `${sysMass} M☉`}
              </span>
            </div>
            <input
              type="range"
              min={-1.05}
              max={Math.max(1.7, logMass)}
              step={0.01}
              value={logMass}
              onChange={(e) =>
                handleParamChange(parseFloat(e.target.value), age, feh, forcedMult)
              }
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] font-semibold text-slate-300 uppercase">
              <span>System Age</span>
              <span className="text-sky-400 font-mono">{age.toFixed(2)} Gyr</span>
            </div>
            <input
              type="range"
              min={0.02}
              max={13.2}
              step={0.05}
              value={age}
              onChange={(e) =>
                handleParamChange(logMass, parseFloat(e.target.value), feh, forcedMult)
              }
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] font-semibold text-slate-300 uppercase">
              <span>Metallicity [Fe/H]</span>
              <span className="text-sky-400 font-mono">
                {feh >= 0 ? `+${feh.toFixed(2)}` : feh.toFixed(2)} dex
              </span>
            </div>
            <input
              type="range"
              min={-2.0}
              max={0.5}
              step={0.02}
              value={feh}
              onChange={(e) =>
                handleParamChange(logMass, age, parseFloat(e.target.value), forcedMult)
              }
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-[11px] font-semibold text-slate-300 uppercase">
              Number of Stars
            </div>
            <select
              value={forcedMult}
              onChange={(e) =>
                handleParamChange(
                  logMass,
                  age,
                  feh,
                  e.target.value as 'auto' | '1' | '2' | '3' | '4',
                  false
                )
              }
              className="bg-[#151d2c] text-slate-100 border border-[#2a3852] rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer hover:border-sky-400 focus:outline-none"
            >
              <option value="auto">Auto</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-[11px] font-semibold text-slate-300 uppercase">
              Benchmark Presets
            </div>
            <select
              value={presetKey}
              onChange={(e) => handleSelectPreset(e.target.value)}
              className="bg-[#151d2c] text-slate-100 border border-[#2a3852] rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer hover:border-sky-400 focus:outline-none"
            >
              <option value="">-- Choose Preset --</option>
              {Object.entries(STARGEN_BENCHMARK_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      )}

      {/* Main Unified 2D System Map Box */}
      {systemResult && (
        <div className={`flex-1 flex flex-col ${showUI ? 'bg-[#0e131d] border border-[#2a3852] rounded-xl p-3.5 gap-3 shadow-lg' : 'bg-transparent border-0 rounded-none p-0 gap-0 h-full w-full'}`}>
          {showUI && (
            <div className="flex flex-wrap justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase text-sky-400 tracking-wider font-mono">
                  Interactive Map — Click Object for Details
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Map View Switcher */}
                <div className="flex items-center bg-[#151d2c] p-0.5 rounded-lg border border-[#2a3852] text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setMapMode('schematic')}
                    className={`px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer transition ${
                      mapMode === 'schematic'
                        ? 'bg-sky-600 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Schematic
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapMode('orrery2d')}
                    className={`px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer transition ${
                      mapMode === 'orrery2d'
                        ? 'bg-sky-600 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    Orrery
                  </button>
                </div>

                {mapMode === 'orrery2d' && (
                  <button
                    type="button"
                    onClick={() => setShowLabels((v) => !v)}
                    aria-pressed={showLabels}
                    aria-keyshortcuts="l"
                    className={`px-2.5 py-1 rounded-lg border text-xs font-mono flex items-center gap-1.5 cursor-pointer transition ${
                      showLabels
                        ? 'bg-sky-600 text-white border-sky-400 font-bold shadow-md shadow-sky-500/25'
                        : 'bg-[#151d2c] text-slate-300 border-[#2a3852] hover:text-white hover:border-slate-500'
                    }`}
                    title="Toggle Planetary, Star & Orbit Labels (Hotkey: L)"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>Labels {showLabels ? 'ON' : 'OFF'}</span>
                    <kbd className="px-1 py-0.2 text-[9px] bg-slate-900/90 rounded text-slate-400 border border-slate-700 font-mono ml-0.5">
                      L
                    </kbd>
                  </button>
                )}

                {mapMode === 'schematic' && (
                  <div className="flex items-center gap-1 bg-[#151d2c] px-2 py-1 rounded-lg border border-[#2a3852] text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setMapZoom((z) => clamp(+(z - 0.2).toFixed(1), 1.0, 2.4))}
                      className="text-slate-300 hover:text-white cursor-pointer"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] text-sky-400 px-1">
                      {Math.round(mapZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setMapZoom((z) => clamp(+(z + 0.2).toFixed(1), 1.0, 2.4))}
                      className="text-slate-300 hover:text-white cursor-pointer"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Render Unified 2D System Map */}
          {mapMode === 'schematic'
            ? renderUnifiedSystemSchematic(systemResult)
            : render2DTopDownOrrery(systemResult)}
        </div>
      )}

      {/* Click-to-Blow-Up Full Details Modal */}
      {renderBlowUpModal()}

      {/* Pre-Program Star Data Modal */}
      {showPreProgramModal && (
        <PreProgramStarModal
          currentConfig={customStellarConfig}
          currentAge={age}
          currentFeh={feh}
          currentSystem={systemResult}
          onApplyAndGeneratePlanets={handleApplyCustomStars}
          onDisableCustomStars={() => setCustomStellarConfig(undefined)}
          onClose={() => setShowPreProgramModal(false)}
        />
      )}

      {/* JSON Import/Export Modal */}
      {showJsonModal && (
        <SystemJsonManagerModal
          systemResult={systemResult}
          onImportSystem={(imported) => {
            universeCache.setLastActiveSystem(imported);
            setSystemResult(imported);
            setSelectedEntity(null);
            setTrackedTarget(null);
            fitOrreryToFullSystem(imported);
            setShowJsonModal(false);
          }}
          onClose={() => setShowJsonModal(false)}
        />
      )}
    </div>
  );
};
