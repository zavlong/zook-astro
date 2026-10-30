import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Compass,
  Layers,
  ZoomIn,
  ZoomOut,
  Tag,
} from 'lucide-react';
import {
  CustomStellarConfig,
  RealisticPlanetBody,
  RealisticStarSystemResult,
  STARGEN_BENCHMARK_PRESETS,
  StarGenParams,
  convertRealisticToArchitectSystem,
  rollStep1,
  runRealisticGenerator,
} from '../../core/generation/realisticStarGen';
import { ArchitectSystem } from '../../types/architect';
import { StarSystem } from '../../types/astrophysics';
import { GenerationLoadingOverlay, yieldToMainThread } from '../ui/GenerationLoadingOverlay';
import {
  SelectedMapEntity,
  Vec2AU,
  clamp,
  log10,
} from './types';
import {
  computeSystem2DLayout,
  getBodyWorldPosAU,
} from './math/kepler';
import { SystemJsonManagerModal } from './modals/SystemJsonManagerModal';
import { PreProgramStarModal } from './modals/PreProgramStarModal';
import { SystemEditorModal } from './modals/SystemEditorModal';
import { EntityDossierRouterModal } from './modals/EntityDossierRouterModal';
import { StarGenHeaderControls } from './panels/StarGenHeaderControls';
import { SystemSchematicView } from './views/SystemSchematicView';
import { SystemOrreryView } from './views/SystemOrreryView';
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

  // Modals (JSON Import/Export & Pre-Program Star Data & Universal Architect)
  const [showJsonModal, setShowJsonModal] = useState<boolean>(false);
  const [showPreProgramModal, setShowPreProgramModal] = useState<boolean>(false);
  const [showSystemEditorModal, setShowSystemEditorModal] = useState<boolean>(false);
  const [customStellarConfig, setCustomStellarConfig] = useState<
    CustomStellarConfig | undefined
  >(undefined);

  // Orrery System Map Labels Toggle (default false)
  const [showLabels, setShowLabels] = useState<boolean>(false);

  // Quick Jump Hierarchy Tree on left side (toggled with J or button - defaults to open)
  const [showQuickJump, setShowQuickJump] = useState<boolean>(true);

  // Active Planet/Moon Target for Quick-Jump Hierarchy Action Buttons (Planet Data & Planet Surface)
  const [activeHierarchyPlanet, setActiveHierarchyPlanet] = useState<{
    kind: 'planet' | 'moon';
    zoneIdx: number;
    bodyIdx: number;
    moonIdx?: number;
  } | null>(null);

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

  // Sync activeHierarchyPlanet with trackedTarget or selectedEntity
  useEffect(() => {
    if (trackedTarget && (trackedTarget.kind === 'planet' || trackedTarget.kind === 'moon')) {
      setActiveHierarchyPlanet({
        kind: trackedTarget.kind,
        zoneIdx: trackedTarget.zoneIdx,
        bodyIdx: trackedTarget.bodyIdx,
        moonIdx: trackedTarget.kind === 'moon' ? trackedTarget.moonIdx : undefined,
      });
    } else if (selectedEntity && (selectedEntity.kind === 'planet' || selectedEntity.kind === 'moon')) {
      setActiveHierarchyPlanet({
        kind: selectedEntity.kind,
        zoneIdx: selectedEntity.zoneIdx,
        bodyIdx: selectedEntity.bodyIdx,
        moonIdx: selectedEntity.kind === 'moon' ? selectedEntity.moonIdx : undefined,
      });
    }
  }, [trackedTarget, selectedEntity]);

  // Set default activeHierarchyPlanet when a new system is loaded (habitable first, else first planet)
  useEffect(() => {
    if (!systemResult) return;
    let bestTarget: { zoneIdx: number; bodyIdx: number } | null = null;
    let foundHabitable = false;
    for (let zIdx = 0; zIdx < systemResult.zones.length; zIdx++) {
      const zone = systemResult.zones[zIdx];
      for (let bIdx = 0; bIdx < zone.bodies.length; bIdx++) {
        const b = zone.bodies[bIdx];
        if (b.kind === 'planet') {
          if (!bestTarget) bestTarget = { zoneIdx: zIdx, bodyIdx: bIdx };
          if (b.hydrosphere?.biosphere && b.hydrosphere.biosphere !== 'none') {
            bestTarget = { zoneIdx: zIdx, bodyIdx: bIdx };
            foundHabitable = true;
            break;
          }
        }
      }
      if (foundHabitable) break;
    }
    if (bestTarget) {
      setActiveHierarchyPlanet({
        kind: 'planet',
        zoneIdx: bestTarget.zoneIdx,
        bodyIdx: bestTarget.bodyIdx,
      });
    }
  }, [systemResult?.step1?.id, systemResult?.roll]);

  // Resolve active planet data object for the hierarchy footer
  const resolvedActivePlanet = useMemo(() => {
    if (!systemResult) return null;
    let target = activeHierarchyPlanet;

    if (!target || !systemResult.zones[target.zoneIdx]?.bodies[target.bodyIdx]) {
      for (let zIdx = 0; zIdx < systemResult.zones.length; zIdx++) {
        const zone = systemResult.zones[zIdx];
        for (let bIdx = 0; bIdx < zone.bodies.length; bIdx++) {
          if (zone.bodies[bIdx].kind === 'planet') {
            target = { kind: 'planet', zoneIdx: zIdx, bodyIdx: bIdx };
            break;
          }
        }
        if (target) break;
      }
    }

    if (!target) return null;
    const zone = systemResult.zones[target.zoneIdx];
    const planet = zone?.bodies[target.bodyIdx] as RealisticPlanetBody | undefined;
    if (!planet || planet.kind !== 'planet') return null;

    const moon =
      target.kind === 'moon' && target.moonIdx !== undefined
        ? planet.moons?.[target.moonIdx] ?? null
        : null;

    return {
      kind: target.kind,
      zoneIdx: target.zoneIdx,
      bodyIdx: target.bodyIdx,
      moonIdx: target.moonIdx,
      zone,
      planet,
      moon,
    };
  }, [systemResult, activeHierarchyPlanet]);

  // "Entering <System>" Briefing Overlay State (docked at top, fades immediately)
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

    // Stays solid briefly for 750ms, then fades smoothly out immediately (1000ms transition)
    enteringTimerRef.current = setTimeout(() => {
      setIsEnteringFading(true);
      enteringFadeTimerRef.current = setTimeout(() => {
        setShowEnteringOverlay(false);
      }, 1000);
    }, 750);

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

      {/* Imperial Sovereignty Banner & Top Control / Slider Deck */}
      <StarGenHeaderControls
        showUI={showUI}
        currentEmpire={currentEmpire}
        currentSysId={currentSysId}
        systemResult={systemResult}
        isFromCache={isFromCache}
        onBackToSectorHex={onBackToSectorHex}
        onBackToSectorWithTransition={handleBackToSectorWithTransition}
        onRollPureIMF={handleRollPureIMF}
        onRerollKeepSliders={handleRerollKeepSliders}
        onRerollPlanetsOnly={handleRerollPlanetsOnly}
        onOpenSystemEditor={() => setShowSystemEditorModal(true)}
        onOpenPreProgramModal={() => setShowPreProgramModal(true)}
        customStellarConfig={customStellarConfig}
        onInspectInSector3D={onInspectInSector3D}
        onSendZoneToArchitect={sendZoneToArchitect}
        onOpenInArchitect={onOpenInArchitect}
        onOpenJsonModal={() => setShowJsonModal(true)}
        logMass={logMass}
        age={age}
        feh={feh}
        forcedMult={forcedMult}
        presetKey={presetKey}
        onParamChange={handleParamChange}
        onSelectPreset={handleSelectPreset}
      />

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
          {mapMode === 'schematic' ? (
            <SystemSchematicView
              systemResult={systemResult}
              mapZoom={mapZoom}
              selectedEntity={selectedEntity}
              setSelectedEntity={setSelectedEntity}
              setMapMode={(m) => {
                if (m === 'schematic' || m === 'orrery2d') setMapMode(m);
              }}
              handleTrackBody={handleTrackBody}
              getPlanetClaimInfo={getPlanetClaimInfo}
              currentEmpire={currentEmpire}
              sendZoneToArchitect={sendZoneToArchitect}
            />
          ) : (
            <SystemOrreryView
              systemResult={systemResult}
              initialParams={initialParams}
              orreryTimeYr={orreryTimeYr}
              setOrreryTimeYr={setOrreryTimeYr}
              orreryPlaying={orreryPlaying}
              setOrreryPlaying={setOrreryPlaying}
              orrerySpeed={orrerySpeed}
              setOrrerySpeed={setOrrerySpeed}
              orreryPxPerAU={orreryPxPerAU}
              setOrreryPxPerAU={setOrreryPxPerAU}
              orreryCamAU={orreryCamAU}
              setOrreryCamAU={setOrreryCamAU}
              orreryYaw={orreryYaw}
              setOrreryYaw={setOrreryYaw}
              orreryPitch={orreryPitch}
              setOrreryPitch={setOrreryPitch}
              orreryDragMode={orreryDragMode}
              setOrreryDragMode={setOrreryDragMode}
              isDraggingOrrery={isDraggingOrrery}
              setIsDraggingOrrery={setIsDraggingOrrery}
              dragStartRef={dragStartRef}
              orrerySvgRef={orrerySvgRef}
              setOrreryContainer={setOrreryContainer}
              orreryIncScale={orreryIncScale}
              setOrreryIncScale={setOrreryIncScale}
              selectedEntity={selectedEntity}
              setSelectedEntity={setSelectedEntity}
              trackedTarget={trackedTarget}
              setTrackedTarget={setTrackedTarget}
              handleTrackBody={handleTrackBody}
              handleZoomToEntity={handleZoomToEntity}
              fitOrreryToFullSystem={fitOrreryToFullSystem}
              showLagrange={showLagrange}
              setShowLagrange={setShowLagrange}
              showQuickJump={showQuickJump}
              setShowQuickJump={setShowQuickJump}
              showUI={showUI}
              showLabels={showLabels}
              setShowLabels={setShowLabels}
              showEnteringOverlay={showEnteringOverlay}
              setShowEnteringOverlay={setShowEnteringOverlay}
              isEnteringFading={isEnteringFading}
              setIsEnteringFading={setIsEnteringFading}
              enteringTimerRef={enteringTimerRef}
              enteringFadeTimerRef={enteringFadeTimerRef}
              systemBriefingStats={systemBriefingStats}
              activeHierarchyPlanet={activeHierarchyPlanet}
              setActiveHierarchyPlanet={setActiveHierarchyPlanet}
              resolvedActivePlanet={resolvedActivePlanet}
              navZoneIdx={navZoneIdx}
              setNavZoneIdx={setNavZoneIdx}
              navOriginIdx={navOriginIdx}
              setNavOriginIdx={setNavOriginIdx}
              navDestIdx={navDestIdx}
              setNavDestIdx={setNavDestIdx}
              currentEmpire={currentEmpire}
              getPlanetClaimInfo={getPlanetClaimInfo}
              customStellarConfig={customStellarConfig}
              setShowPreProgramModal={setShowPreProgramModal}
              handleRerollPlanetsOnly={handleRerollPlanetsOnly}
              onOpenSurfaceGen={onOpenSurfaceGen}
              onBackToSectorHex={onBackToSectorHex}
              handleBackToSectorWithTransition={handleBackToSectorWithTransition}
            />
          )}
        </div>
      )}

      {/* Click-to-Blow-Up Full Details Modal */}
      <EntityDossierRouterModal
        selectedEntity={selectedEntity}
        systemResult={systemResult}
        onSelectEntity={setSelectedEntity}
        onTrackInOrrery={(ent) => {
          handleTrackBody(ent);
          setMapMode('orrery2d');
        }}
        onOpenPreProgramStars={() => setShowPreProgramModal(true)}
        onClose={() => setSelectedEntity(null)}
        currentEmpire={currentEmpire}
        sectorEmpires={sectorEmpires}
        getPlanetClaimInfo={getPlanetClaimInfo}
        onToggleClaimPlanet={handleToggleClaimPlanet}
        onOpenSurfaceGen={onOpenSurfaceGen}
      />

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

      {/* Universal Star & Planet Architect Modal */}
      {showSystemEditorModal && systemResult && (
        <SystemEditorModal
          isOpen={showSystemEditorModal}
          systemResult={systemResult}
          onSave={(updated) => {
            const sysId = updated.step1?.id || initialParams?.id || 'system';
            universeCache.cacheLoadedSystem(sysId, updated);
            universeCache.setLastActiveSystem(updated);
            setSystemResult(updated);
            setSelectedEntity(null);
            fitOrreryToFullSystem(updated);
            setShowSystemEditorModal(false);
          }}
          onClose={() => setShowSystemEditorModal(false)}
        />
      )}
    </div>
  );
};
