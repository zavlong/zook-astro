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
} from 'lucide-react';
import {
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
import { isBlackHoleStar } from '../../core/generation/sectorHex';
import { BlackHoleIcon } from '../ui/BlackHoleIcon';
import {
  SelectedMapEntity,
  Vec2AU,
  shortClassLabel,
  clamp,
  lerp,
  log10,
} from './types';
import {
  computeSystem2DLayout,
  getBodyWorldPosAU,
} from './math/kepler';
import { SystemJsonManagerModal } from './modals/SystemJsonManagerModal';
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

interface RealisticStarGenAppProps {
  onOpenInArchitect: (archSystem: ArchitectSystem) => void;
  onInspectInSector3D?: (starSystem: StarSystem) => void;
  initialParams?: StarGenParams | null;
  onBackToSectorHex?: () => void;
  showUI?: boolean;
}

export const RealisticStarGenApp: React.FC<RealisticStarGenAppProps> = ({
  onOpenInArchitect,
  onInspectInSector3D,
  initialParams,
  onBackToSectorHex,
  showUI = false,
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
  const [orreryCamAU, setOrreryCamAU] = useState<Vec2AU>({ x: 0, y: 0 });
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
    yaw: number;
    pitch: number;
    action: 'rotate' | 'pan';
  } | null>(null);
  const orrerySvgRef = useRef<SVGSVGElement | null>(null);
  const orreryContainerRef = useRef<HTMLDivElement | null>(null);

  // Click-to-Blow-Up Selected Entity Modal State
  const [selectedEntity, setSelectedEntity] = useState<SelectedMapEntity | null>(null);

  // Modals (JSON Import/Export)
  const [showJsonModal, setShowJsonModal] = useState<boolean>(false);

  // Orrery System Map Labels Toggle (default false)
  const [showLabels, setShowLabels] = useState<boolean>(false);

  // Quick Jump Hierarchy Tree on left side (toggled with J or button)
  const [showQuickJump, setShowQuickJump] = useState<boolean>(false);

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

    // Stays solid for 4.2 seconds, then begins 700ms smooth fade-out
    enteringTimerRef.current = setTimeout(() => {
      setIsEnteringFading(true);
      enteringFadeTimerRef.current = setTimeout(() => {
        setShowEnteringOverlay(false);
      }, 700);
    }, 4200);

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
      const cosP = Math.max(0.2, Math.cos(pitch));
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
      }));
    }
    setOrreryPxPerAU(newPxPerAU);
  }, []);

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
    setOrreryCamAU({ x: 0, y: 0 });
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
        orreryIncScale
      );
      if (targetPos) {
        setOrreryCamAU(targetPos);
      }
    }
  };

  const handleSelectBody = (entity: SelectedMapEntity, e?: React.MouseEvent) => {
    if (e?.shiftKey) {
      handleTrackBody(entity);
    } else {
      setSelectedEntity(entity);
    }
  };

  // System persistent cache status
  const [isFromCache, setIsFromCache] = useState<boolean>(false);

  const triggerRun = (params: StarGenParams, forceRegenerate = false) => {
    if (!forceRegenerate && params.id) {
      const cached = universeCache.getCachedSystem(params.id);
      if (cached) {
        setSystemResult(cached);
        setIsFromCache(true);
        setSelectedEntity(null);
        setTrackedTarget(null);
        fitOrreryToFullSystem(cached);
        return;
      }
    }
    const res = runRealisticGenerator(params);
    if (params.id) {
      universeCache.cacheLoadedSystem(params.id, res);
    }
    setIsFromCache(false);
    setSystemResult(res);
    setSelectedEntity(null);
    setTrackedTarget(null);
    fitOrreryToFullSystem(res);
  };

  useEffect(() => {
    if (initialParams) {
      const newLogM = +log10(initialParams.sysMass).toFixed(3);
      setLogMass(newLogM);
      setAge(initialParams.age);
      setFeh(initialParams.feh);
      setForcedMult(initialParams.forcedMult || 'auto');
      setPresetKey('');
      triggerRun(initialParams);
    } else {
      triggerRun({
        sysMass: +Math.pow(10, logMass).toFixed(3),
        age,
        feh,
        forcedMult,
      });
    }
  }, [initialParams]);

  // 3D Orrery live Keplerian orbit animation loop (with dynamic speed & camera tracking)
  useEffect(() => {
    if (!orreryPlaying || mapMode !== 'orrery2d') return;
    let rafId = 0;
    const step = () => {
      setOrreryTimeYr((t) => {
        const nextTime = t + 0.0045 * orrerySpeed;
        if (trackedTarget && systemResult) {
          const targetPos = getBodyWorldPosAU(
            systemResult,
            trackedTarget,
            nextTime,
            orreryIncScale
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
  }, [orreryPlaying, mapMode, orrerySpeed, trackedTarget, systemResult, orreryIncScale]);

  // Close blow-up modal on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedEntity) setSelectedEntity(null);
        else if (showJsonModal) setShowJsonModal(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedEntity, showJsonModal]);

  // Keyboard navigation: Page Up for higher view level (Sector Hex Map), Page Down already at System
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isPageKey =
        e.key === 'PageDown' ||
        e.code === 'PageDown' ||
        e.key === 'PageUp' ||
        e.code === 'PageUp';
      const isLabelKey = e.key === 'l' || e.key === 'L';
      const isQuickJumpKey = e.key === 'j' || e.key === 'J';
      if (!isPageKey && !isLabelKey && !isQuickJumpKey) return;

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

      if (selectedEntity || showJsonModal) return;

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

      if (e.key === 'PageUp' || e.code === 'PageUp') {
        e.preventDefault();
        e.stopPropagation();
        handleBackToSectorWithTransition();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEntity, showJsonModal, handleBackToSectorWithTransition]);

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
    triggerRun({
      sysMass: +Math.pow(10, newLogMass).toFixed(3),
      age: newAge,
      feh: newFeh,
      forcedMult: newMult,
    });
  };

  const handleRollPureIMF = () => {
    const p = rollStep1();
    const newLogM = +log10(p.sysMass).toFixed(2);
    setLogMass(newLogM);
    setAge(p.age);
    setFeh(p.feh);
    setPresetKey('');
    triggerRun({
      sysMass: p.sysMass,
      age: p.age,
      feh: p.feh,
      forcedMult,
    });
  };

  const handleRerollKeepSliders = () => {
    triggerRun({
      sysMass,
      age,
      feh,
      forcedMult,
      id: currentSysId,
    }, true);
  };

  const handleSelectPreset = (key: string) => {
    setPresetKey(key);
    const p = STARGEN_BENCHMARK_PRESETS[key];
    if (!p) return;
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
                        return (
                          <g>
                            <circle
                              cx={74}
                              cy={midY}
                              r={sRad * 1.55}
                              fill={st.colorHex}
                              fillOpacity={0.22}
                            />
                            <circle
                              cx={74}
                              cy={midY}
                              r={sRad}
                              fill={st.colorHex}
                              stroke="#ffffff"
                              strokeWidth={1}
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
      const dx = wx - orreryCamAU.x;
      const dy = wy - orreryCamAU.y;
      const dz = wz;
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

    // Build a closed 3D circle/ellipse SVG path in the Z=0 plane around (cxAU, cyAU)
    const build3DCirclePath = (
      cxAU: number,
      cyAU: number,
      radiusAU: number,
      steps = 56,
      reverse = false
    ): string => {
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
      const pts: string[] = [];
      for (let i = 0; i <= steps; i++) {
        const nu = (i / steps) * Math.PI * 2;
        const pos3 = evalKepler3D(centerAU, a, e, incRad, omegaNode, argPeri, nu);
        const p = project3D(pos3.wx, pos3.wy, pos3.wz);
        pts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`);
      }
      return pts.join(' ') + ' Z';
    };

    // Compute a clean physical scale bar in AU for the bottom-left overlay
    const rawBarAU = 120 / Math.max(1e-6, orreryPxPerAU);
    const mag = Math.pow(10, Math.floor(log10(rawBarAU)));
    const residual = rawBarAU / mag;
    const niceMult = residual >= 5 ? 5 : residual >= 2 ? 2 : 1;
    const barAU = niceMult * mag;
    const barPx = barAU * orreryPxPerAU;

    const focusCameraOn = (centerAU: Vec2AU, targetOuterAU: number) => {
      setOrreryCamAU(centerAU);
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
                    ? 'Moon'
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
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: st.colorHex }}
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
                }, 4200);
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
          </div>

          {/* "Entering <System>" Briefing Table Overlay (Fades out after a few seconds) */}
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
                }, 2200);
              }}
              className={`absolute top-4 left-1/2 -translate-x-1/2 z-40 w-[94%] sm:w-[380px] p-3.5 rounded-xl bg-[#080d1a]/95 backdrop-blur-md border border-slate-700/90 shadow-2xl text-xs font-mono space-y-2 select-none pointer-events-auto transition-all duration-700 ${
                isEnteringFading ? 'opacity-0 -translate-y-3 pointer-events-none' : 'opacity-100 translate-y-0'
              }`}
            >
              <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between pb-1.5 border-b border-slate-800">
                <span className="text-sky-300 font-bold truncate">Entering {systemBriefingStats.sysName}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-cyan-400 font-semibold">{systemBriefingStats.archName}</span>
                  <button
                    type="button"
                    onClick={() => setShowEnteringOverlay(false)}
                    className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer transition"
                    title="Dismiss briefing"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Primary Star */}
              {systemBriefingStats.primaryStar && (
                <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Primary Star</span>
                  <span className="text-slate-200 font-semibold">
                    {systemBriefingStats.primaryStar.spectralType} {systemBriefingStats.primaryStar.mass.toFixed(3)} M☉
                  </span>
                </div>
              )}

              {/* Companions */}
              {systemBriefingStats.companionStars.length > 0 && (
                <div className="flex items-start justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Companions</span>
                  <div className="text-right text-slate-300 font-medium space-y-1">
                    {systemBriefingStats.companionStars.map((cs) => {
                      const isBH = isBlackHoleStar({ spectralType: cs.spectralType });
                      return (
                        <div key={cs.label} className="flex items-center justify-end gap-1.5 text-xs">
                          {isBH ? (
                            <BlackHoleIcon isSupermassive={cs.mass > 999999} size={15} />
                          ) : (
                            <span
                              className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                              style={{ backgroundColor: cs.colorHex }}
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
                <span className="text-slate-200 font-semibold">{systemBriefingStats.totalLuminosity} L☉</span>
              </div>

              {/* Effective Temp & Evolutionary State: only for single star systems */}
              {!systemBriefingStats.isMultiple && systemBriefingStats.primaryStar && (
                <>
                  <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Effective Temp</span>
                    <span className="text-slate-200 font-semibold">{Math.round(systemBriefingStats.primaryStar.Teff)} K</span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Evolutionary State</span>
                    <span className="text-cyan-400 font-semibold">
                      {systemBriefingStats.primaryStar.category || 'Main Sequence'}
                    </span>
                  </div>
                </>
              )}

              {/* Astronomical Bodies: placed between Evolutionary State and Biospheres */}
              <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Astronomical Bodies</span>
                <span className="text-slate-200 font-semibold">
                  {systemBriefingStats.planetCount} Planets &bull; {systemBriefingStats.beltCount} Belts
                </span>
              </div>

              {/* Planetary Biospheres */}
              <div className="flex items-center justify-between py-1">
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
                {res.hierarchy.stars.map((st) => {
                  const sPos = layout.starPos[st.label] || { x: 0, y: 0 };
                  const sZoneIdx = res.zones.findIndex((z) =>
                    z.title.startsWith(`Star ${st.label} `)
                  );
                  const sZone = sZoneIdx >= 0 ? res.zones[sZoneIdx] : null;
                  const maxPlanetA = sZone
                    ? sZone.bodies.reduce((m, b) => Math.max(m, b.a), sZone.a_in * 4)
                    : 2.5;

                  return (
                    <div key={`tree-star-${st.label}`} className="space-y-1">
                      {/* Star Item */}
                      <button
                        type="button"
                        onClick={() => {
                          setTrackedTarget(null);
                          focusCameraOn(sPos, maxPlanetA * 1.25);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 flex items-center justify-between group cursor-pointer transition"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                            style={{
                              backgroundColor: st.colorHex,
                              boxShadow: `0 0 8px ${st.colorHex}88`,
                            }}
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
                                <div
                                  key={`tree-belt-${sZoneIdx}-${bIdx}`}
                                  className="px-2 py-1 rounded text-[11px] text-slate-400 flex items-center justify-between bg-slate-950/40"
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
                                </div>
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
                              <div key={`tree-planet-${sZoneIdx}-${bIdx}`} className="space-y-0.5">
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
                                    onClick={() =>
                                      handleTrackBody({
                                        kind: 'planet',
                                        zoneIdx: sZoneIdx,
                                        bodyIdx: bIdx,
                                      })
                                    }
                                    className="flex items-center gap-1.5 truncate flex-1 text-left cursor-pointer mr-1"
                                    title={`Click to Track Orbit of Planet #${bIdx + 1}`}
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
                                      onClick={() =>
                                        handleSelectBody({
                                          kind: 'planet',
                                          zoneIdx: sZoneIdx,
                                          bodyIdx: bIdx,
                                        })
                                      }
                                      className="p-1 rounded text-slate-500 hover:text-sky-300 hover:bg-slate-800 cursor-pointer"
                                      title="Open Planet Details Dossier"
                                    >
                                      <Maximize2 className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Moons under this planet */}
                                {b.moons.length > 0 && (
                                  <div className="ml-4 pl-2 border-l border-slate-800/80 space-y-0.5">
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
                                        >
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleTrackBody({
                                                kind: 'moon',
                                                zoneIdx: sZoneIdx,
                                                bodyIdx: bIdx,
                                                moonIdx: mIdx,
                                              })
                                            }
                                            className="flex items-center gap-1 truncate flex-1 text-left cursor-pointer"
                                            title={`Track Moon: ${m.name}`}
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
                              <div
                                key={`tree-cb-belt-${zIdx}-${bIdx}`}
                                className="px-2 py-1 rounded text-[11px] text-amber-300/70 flex items-center justify-between"
                              >
                                <span>{b.role || 'Belt'}</span>
                                <span className="text-[10px]">{b.a.toFixed(2)} AU</span>
                              </div>
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
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  handleTrackBody({
                                    kind: 'planet',
                                    zoneIdx: zIdx,
                                    bodyIdx: bIdx,
                                  })
                                }
                                className="flex items-center gap-1.5 truncate flex-1 text-left cursor-pointer"
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
                setOrreryPitch(
                  clamp(dragStartRef.current.pitch - dyPx * 0.0075, 0, 1.48)
                );
              } else {
                setTrackedTarget(null);
                const dxSvg = (dxPx / Math.max(1, rect.width)) * viewW;
                const dySvg = (dyPx / Math.max(1, rect.height)) * viewH;
                const dCamX = -dxSvg / orreryPxPerAU;
                const dCamY =
                  -dySvg /
                  (orreryPxPerAU * Math.max(0.22, Math.cos(orreryPitch)));
                // Unrotate pan vector by camera yaw into world ecliptic plane
                const cY = Math.cos(orreryYaw);
                const sY = Math.sin(orreryYaw);
                setOrreryCamAU({
                  x: dragStartRef.current.camX + dCamX * cY + dCamY * sY,
                  y: dragStartRef.current.camY - dCamX * sY + dCamY * cY,
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
                  {/* 3D Habitable Zone Shaded Annulus */}
                  {showHZ &&
                    rHZOutPx > rHZInPx &&
                    rHZOutPx > 3 &&
                    rHZInPx < 60000 && (
                      <path
                        d={`${build3DCirclePath(
                          centerAU.x,
                          centerAU.y,
                          hzOuterClampAU,
                          56,
                          false
                        )} ${build3DCirclePath(
                          centerAU.x,
                          centerAU.y,
                          hzInnerClampAU,
                          56,
                          true
                        )}`}
                        fill="rgba(16, 185, 129, 0.14)"
                        fillRule="evenodd"
                        stroke="rgba(16, 185, 129, 0.35)"
                        strokeWidth={0.9}
                      />
                    )}

                  {/* 3D Snow Line Ring */}
                  {showSnow && rSnowPx > 4 && rSnowPx < 60000 && (
                    <g>
                      <path
                        d={build3DCirclePath(centerAU.x, centerAU.y, z.a_snow, 56)}
                        fill="none"
                        stroke="rgba(56, 189, 248, 0.55)"
                        strokeWidth={1.2}
                        strokeDasharray="5,5"
                      />
                      {showLabels && rSnowPx > 28 && rSnowPx < 2000 && (
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

                          // Small, crisp asteroid rock size that scales gently with belt zoom
                          const beltSpanPx = beltHalfWidthAU * orreryPxPerAU;
                          const baseRockSz = 0.35 + Math.pow(u3, 2.6) * 0.58;
                          const rockRad = clamp(
                            baseRockSz *
                              clamp(Math.pow(beltSpanPx / 18, 0.35), 0.55, 1.55) *
                              astProj.scale,
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

                        return (
                          <g
                            key={`belt-3d-${zIdx}-${bIdx}`}
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEntity({
                                kind: 'belt',
                                zoneIdx: zIdx,
                                bodyIdx: bIdx,
                              });
                            }}
                          >
                            {/* Subtle diffuse zodiacal dust glow & wide transparent click hit-ring */}
                            <path
                              d={buildKepler3DPath(
                                centerAU,
                                b.a,
                                0.02,
                                beltIncRad,
                                beltNode,
                                0,
                                60
                              )}
                              fill="none"
                              stroke={
                                isIceBelt
                                  ? 'rgba(186, 230, 253, 0.04)'
                                  : 'rgba(168, 162, 158, 0.04)'
                              }
                              strokeWidth={beltHitWidthPx}
                            />
                            {/* 165 Individual Small 3D Asteroid Specks */}
                            {asteroidNodes}
                            {showLabels && rOrbitPx > 36 && (
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
                        5000,
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
                      pRad = Math.max(minFloorPx, pRad);

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

                      // Actual Procedural Planet Texture from Planet Info View:
                      const planetIconUrl = getProceduralPlanetIconDataUrl(
                        b,
                        null,
                        zoneStar?.colorHex || '#fff4e6',
                        zoneStar?.Teff || 5778,
                        0,
                        144,
                        0,
                        0
                      );
                      const planetImgSize = b.rings
                        ? pRad / 0.33
                        : pRad / 0.44;

                      // Push planet & moon 3D globes into depth-sorted queue
                      depthNodes.push({
                        zCam: pProj.zCam,
                        key: `planet-node-${zIdx}-${bIdx}`,
                        node: (
                          <g key={`planet-fg-${zIdx}-${bIdx}`}>
                            {/* Moons around planet in 3D: procedural textures from info view */}
                            {pRad > 5 &&
                              b.moons.map((m, mIdx) => {
                                const mSpeed = 12 + mIdx * 5;
                                const mAngle =
                                  theta +
                                  (mIdx * Math.PI * 2) /
                                    Math.max(1, b.moons.length) +
                                  orreryTimeYr * mSpeed;
                                const mDist =
                                  pRad +
                                  Math.max(4, pRad * (0.55 + mIdx * 0.38));
                                const mxPos = pProj.x + mDist * Math.cos(mAngle);
                                const myPos =
                                  pProj.y +
                                  mDist *
                                    Math.sin(mAngle) *
                                    Math.max(
                                      0.32,
                                      Math.cos(orreryPitch * 0.78)
                                    );
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
                                const moonIconUrl =
                                  getProceduralPlanetIconDataUrl(
                                    b,
                                    m,
                                    zoneStar?.colorHex || '#fff4e6',
                                    zoneStar?.Teff || 5778,
                                    mIdx,
                                    72,
                                    0,
                                    0
                                  );
                                const moonImgSize = mRad / 0.44;

                                return (
                                  <g
                                    key={m.id || mIdx}
                                    className="cursor-pointer"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectBody(
                                        {
                                          kind: 'moon',
                                          zoneIdx: zIdx,
                                          bodyIdx: bIdx,
                                          moonIdx: mIdx,
                                        },
                                        e
                                      );
                                    }}
                                  >
                                    <title>{`${m.name} (${m.moonClass})\n• Click: View Details\n• Shift+Click: Lock Camera & Track Orbit`}</title>
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
                                  </g>
                                );
                              })}

                            {/* Clickable Dynamically-Sized Procedural Planet Globe & Label */}
                            <g
                              className="cursor-pointer"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectBody(
                                  {
                                    kind: 'planet',
                                    zoneIdx: zIdx,
                                    bodyIdx: bIdx,
                                  },
                                  e
                                );
                              }}
                            >
                              <title>{`${claimInfo ? `[${claimInfo.empire.name} — ${claimInfo.designation}] ` : ''}Planet #${bIdx + 1}: ${b.planetClass.replace(/\s*\([^)]*\)/g, '')}\n• Click: View Planet Details\n• Shift+Click: Lock Camera & Track Orbit`}</title>
                              {/* Invisible click target for easy selection */}
                              <circle
                                cx={pProj.x}
                                cy={pProj.y}
                                r={Math.max(8, pRad + 3)}
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
                          </g>
                        ),
                      });

                      if (!orbitPath3D) return null;
                      return (
                        <g key={`orbit-bg-${zIdx}-${bIdx}`}>
                          {/* 3D Keplerian Inclined Orbit Path */}
                          <path
                            d={orbitPath3D}
                            fill="none"
                            stroke={
                              isPlanetSel
                                ? '#38bdf8'
                                : claimInfo
                                ? `${claimInfo.empire.color}90`
                                : isCircumbinary
                                ? 'rgba(251, 191, 36, 0.32)'
                                : 'rgba(51, 65, 85, 0.88)'
                            }
                            strokeWidth={isPlanetSel ? 1.8 : claimInfo ? 1.4 : 1.15}
                          />
                        </g>
                      );
                    });
                  })()}
                </g>
              );
            })}

            {/* 3. Push All Stars into 3D Depth-Sorted Render Queue (Scaled Below Closest Planet Orbit, No Max Cap) */}
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

                // Star expands dynamically as you zoom in:
                const sRad = Math.max(
                  5.0,
                  starRadAU * orreryPxPerAU * sProj.scale
                );
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
                        handleSelectBody({ kind: 'star', starIdx: sIdx }, e);
                      }}
                    >
                      <title>{`Star ${st.label} (${st.spectralType})\n• Click: View Star Dossier\n• Shift+Click: Center Camera`}</title>
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
                              r={sRad * 1.4}
                              fill={st.colorHex}
                              fillOpacity={0.3}
                            />
                            <circle
                              cx={sProj.x}
                              cy={sProj.y}
                              r={sRad}
                              fill={`url(#${starGradId})`}
                              stroke="#ffffff"
                              strokeWidth={clamp(sRad * 0.08, 0.7, 2.2)}
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
                {Math.round(((orreryYaw * 180) / Math.PI) % 360)}° · Click: Dossier · Shift+Click: Track Body · Drag: Rotate · Shift+Drag: Pan
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
        />
      );
    }

    return null;
  };

  return (
    <div className={`w-full h-full ${showUI ? 'overflow-y-auto p-3 gap-3' : 'overflow-hidden p-0 gap-0'} bg-[#060911] text-slate-100 custom-scrollbar flex flex-col`}>
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
            >
              <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
              Re-Roll
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

      {/* JSON Import/Export Modal */}
      {showJsonModal && (
        <SystemJsonManagerModal
          systemResult={systemResult}
          onImportSystem={(imported) => {
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
