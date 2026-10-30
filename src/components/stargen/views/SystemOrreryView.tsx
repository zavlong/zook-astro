import React, { useState, useMemo, useRef } from 'react';
import {
  Compass,
  Crosshair,
  FileText,
  Gauge,
  Globe,
  ListTree,
  Lock,
  Maximize2,
  Move,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  Star,
  Tag,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  CustomStellarConfig,
  RealisticPlanetBody,
  RealisticPlanetaryZone,
  RealisticStarSystemResult,
  StarGenParams,
} from '../../../core/generation/realisticStarGen';
import { getPlanetVisualColor } from '../../../core/generation/realisticStarGen';
import type {
  RealisticStarNode,
  RealisticMoon,
} from '../../../types/astrophysics';
import { getProceduralPlanetIconDataUrl } from '../ProceduralPlanetPortrait';
import { getProceduralStarSpriteDataUrl } from '../../../core/generation/starAssets';
import { isBlackHoleStar } from '../../../core/generation/sectorHex';
import { BlackHoleIcon } from '../../ui/BlackHoleIcon';
import type {
  SelectedMapEntity,
  Vec2AU,
} from '../types';
import {
  shortClassLabel,
  clamp,
  lerp,
  log10,
  formatDistanceKm,
} from '../types';
import {
  computeSystem2DLayout,
  getBodyWorldPosAU,
} from '../math/kepler';
import type {
  SectorEmpire,
  ColonyDesignation,
} from '../../../core/generation/empireGen';
import type { PlanetarySurfaceTarget } from '../../surface/PlanetarySurfaceApp';

export interface SystemBriefingStats {
  sysName: string;
  archName: string;
  primaryStar?: RealisticStarNode;
  companionStars: RealisticStarNode[];
  isMultiple: boolean;
  totalLuminosity: number;
  planetCount: number;
  beltCount: number;
  biosphereText: string;
}

export interface ResolvedActivePlanet {
  kind: 'planet' | 'moon';
  zoneIdx: number;
  bodyIdx: number;
  moonIdx?: number;
  zone: RealisticPlanetaryZone;
  planet: RealisticPlanetBody;
  moon: RealisticMoon | null;
}

export interface SystemOrreryViewProps {
  // System result data (supports either systemResult or res)
  systemResult?: RealisticStarSystemResult | null;
  res?: RealisticStarSystemResult | null;

  // Initial params if available
  initialParams?: StarGenParams | null;

  // Orrery time and simulation playback
  orreryTimeYr: number;
  setOrreryTimeYr?: React.Dispatch<React.SetStateAction<number>>;
  orreryPlaying: boolean;
  setOrreryPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  orrerySpeed?: number;
  setOrrerySpeed?: React.Dispatch<React.SetStateAction<number>>;
  orrerySpeedYrPerSec?: number;
  setOrrerySpeedYrPerSec?: React.Dispatch<React.SetStateAction<number>>;

  // Camera & view scale
  orreryPxPerAU: number;
  setOrreryPxPerAU: React.Dispatch<React.SetStateAction<number>>;
  orreryCamAU: Vec2AU;
  setOrreryCamAU: React.Dispatch<React.SetStateAction<Vec2AU>>;
  orreryYaw: number;
  setOrreryYaw: React.Dispatch<React.SetStateAction<number>>;
  orreryPitch: number;
  setOrreryPitch: React.Dispatch<React.SetStateAction<number>>;

  // Drag interaction state & refs
  orreryDragMode?: 'rotate' | 'pan';
  setOrreryDragMode?: React.Dispatch<React.SetStateAction<'rotate' | 'pan'>>;
  isDraggingOrrery?: boolean;
  setIsDraggingOrrery?: React.Dispatch<React.SetStateAction<boolean>>;
  orreryDragRef?: React.MutableRefObject<any>;
  dragStartRef?: React.MutableRefObject<{
    clientX: number;
    clientY: number;
    camX: number;
    camY: number;
    camZ: number;
    yaw: number;
    pitch: number;
    action: 'rotate' | 'pan';
  } | null>;
  orrerySvgRef?: React.MutableRefObject<SVGSVGElement | null>;
  setOrreryContainer?: ((node: HTMLDivElement | null) => void) | React.Ref<HTMLDivElement>;

  // Visual orbit settings
  orreryIncScale?: number;
  setOrreryIncScale?: React.Dispatch<React.SetStateAction<number>>;

  // Hover & selection
  hoveredOrreryItem?: any;
  setHoveredOrreryItem?: React.Dispatch<React.SetStateAction<any>>;
  selectedEntity: SelectedMapEntity | null;
  setSelectedEntity: React.Dispatch<React.SetStateAction<SelectedMapEntity | null>>;
  trackedTarget: SelectedMapEntity | null;
  setTrackedTarget: React.Dispatch<React.SetStateAction<SelectedMapEntity | null>>;

  // Focus and tracking callbacks
  handleTrackBody?: (entity: SelectedMapEntity) => void;
  handleZoomToEntity?: (entity: SelectedMapEntity) => void;
  fitOrreryToFullSystem?: (res: RealisticStarSystemResult) => void;
  fitOrreryToHabitableZone?: (zoneIdx?: number) => void;
  fitOrreryToSplit?: (splitIdx: number) => void;

  // Lagrange points & physics overlays
  showLagrange?: boolean;
  setShowLagrange?: React.Dispatch<React.SetStateAction<boolean>>;
  showLagrangePoints?: boolean;
  setShowLagrangePoints?: React.Dispatch<React.SetStateAction<boolean>>;
  lagrangeSourceFilter?: string;
  setLagrangeSourceFilter?: React.Dispatch<React.SetStateAction<string>>;
  selectedLagrangeId?: string | null;
  setSelectedLagrangeId?: React.Dispatch<React.SetStateAction<string | null>>;
  hoveredLagrangePoint?: any;
  setHoveredLagrangePoint?: React.Dispatch<React.SetStateAction<any>>;
  showHillSpheres?: boolean;
  setShowHillSpheres?: React.Dispatch<React.SetStateAction<boolean>>;
  showRocheLimits?: boolean;
  setShowRocheLimits?: React.Dispatch<React.SetStateAction<boolean>>;
  showFrostLines?: boolean;
  setShowFrostLines?: React.Dispatch<React.SetStateAction<boolean>>;
  showHabitableZones?: boolean;
  setShowHabitableZones?: React.Dispatch<React.SetStateAction<boolean>>;

  // Quick jump panel & popups
  showQuickJump?: boolean;
  setShowQuickJump?: React.Dispatch<React.SetStateAction<boolean>>;
  showQuickJumpPanel?: boolean;
  setShowQuickJumpPanel?: React.Dispatch<React.SetStateAction<boolean>>;
  showControlsPopup?: boolean;
  setShowControlsPopup?: React.Dispatch<React.SetStateAction<boolean>>;

  // UI & labels toggles
  showUI?: boolean;
  setShowUI?: React.Dispatch<React.SetStateAction<boolean>>;
  showLabels?: boolean;
  setShowLabels?: React.Dispatch<React.SetStateAction<boolean>>;

  // Entering overlay & briefing
  showEnteringOverlay?: boolean;
  setShowEnteringOverlay?: React.Dispatch<React.SetStateAction<boolean>>;
  isEnteringFading?: boolean;
  setIsEnteringFading?: React.Dispatch<React.SetStateAction<boolean>>;
  enteringTimerRef?: React.MutableRefObject<NodeJS.Timeout | null>;
  enteringFadeTimerRef?: React.MutableRefObject<NodeJS.Timeout | null>;
  systemBriefingStats?: SystemBriefingStats | null;

  // Active hierarchy target & resolved active planet
  activeHierarchyPlanet?: {
    kind: 'planet' | 'moon';
    zoneIdx: number;
    bodyIdx: number;
    moonIdx?: number;
  } | null;
  setActiveHierarchyPlanet?: React.Dispatch<
    React.SetStateAction<{
      kind: 'planet' | 'moon';
      zoneIdx: number;
      bodyIdx: number;
      moonIdx?: number;
    } | null>
  >;
  resolvedActivePlanet?: ResolvedActivePlanet | null;

  // Navigation indices (Orbital mechanics / flight planner)
  navZoneIdx?: number;
  setNavZoneIdx?: React.Dispatch<React.SetStateAction<number>>;
  navOriginIdx?: number;
  setNavOriginIdx?: React.Dispatch<React.SetStateAction<number>>;
  navDestIdx?: number;
  setNavDestIdx?: React.Dispatch<React.SetStateAction<number>>;

  // Empire claims & sovereignty
  currentEmpire?: SectorEmpire | null;
  getPlanetClaimInfo?: (
    b: RealisticPlanetBody,
    zoneIdx: number,
    bIdx: number
  ) => {
    empire: SectorEmpire;
    key: string;
    designation: ColonyDesignation;
  } | null;

  // External modal toggles & generation callbacks
  customStellarConfig?: CustomStellarConfig;
  setShowPreProgramModal?: React.Dispatch<React.SetStateAction<boolean>>;
  handleRerollPlanetsOnly?: () => void;
  onOpenSurfaceGen?: (target: PlanetarySurfaceTarget) => void;
  onBackToSectorHex?: () => void;
  handleBackToSectorWithTransition?: () => void;
}

export const SystemOrreryView: React.FC<SystemOrreryViewProps> = React.memo((props) => {
  const {
    systemResult: propsSystemResult,
    res: propsRes,
    initialParams,
    orreryTimeYr,
    orreryPlaying,
    setOrreryPlaying,
    orrerySpeed: propsSpeed,
    setOrrerySpeed: propsSetSpeed,
    orrerySpeedYrPerSec,
    setOrrerySpeedYrPerSec,
    orreryPxPerAU,
    setOrreryPxPerAU,
    orreryCamAU,
    setOrreryCamAU,
    orreryYaw,
    setOrreryYaw,
    orreryPitch,
    setOrreryPitch,
    orreryDragMode: propsDragMode,
    setOrreryDragMode: propsSetDragMode,
    isDraggingOrrery: propsIsDragging,
    setIsDraggingOrrery: propsSetIsDragging,
    dragStartRef: propsDragStartRef,
    orrerySvgRef: propsSvgRef,
    setOrreryContainer,
    orreryIncScale: propsIncScale,
    setOrreryIncScale: propsSetIncScale,
    selectedEntity,
    setSelectedEntity,
    trackedTarget,
    setTrackedTarget,
    handleTrackBody: propsHandleTrackBody,
    handleZoomToEntity: propsHandleZoomToEntity,
    fitOrreryToFullSystem: propsFitOrreryToFullSystem,
    showLagrange: propsShowLagrange,
    setShowLagrange: propsSetShowLagrange,
    showQuickJump: propsShowQuickJump,
    setShowQuickJump: propsSetShowQuickJump,
    showUI = false,
    showLabels: propsShowLabels,
    setShowLabels: propsSetShowLabels,
    showEnteringOverlay: propsShowEnteringOverlay,
    setShowEnteringOverlay: propsSetShowEnteringOverlay,
    isEnteringFading: propsIsEnteringFading,
    setIsEnteringFading: propsSetIsEnteringFading,
    enteringTimerRef: propsEnteringTimerRef,
    enteringFadeTimerRef: propsEnteringFadeTimerRef,
    systemBriefingStats: propsSystemBriefingStats,
    activeHierarchyPlanet: propsActivePlanet,
    setActiveHierarchyPlanet: propsSetActivePlanet,
    resolvedActivePlanet: propsResolvedActivePlanet,
    navZoneIdx: propsNavZoneIdx,
    setNavZoneIdx: propsSetNavZoneIdx,
    navOriginIdx: propsNavOriginIdx,
    setNavOriginIdx: propsSetNavOriginIdx,
    navDestIdx: propsNavDestIdx,
    setNavDestIdx: propsSetNavDestIdx,
    getPlanetClaimInfo: propsGetPlanetClaimInfo,
    customStellarConfig,
    setShowPreProgramModal: propsSetShowPreProgramModal,
    handleRerollPlanetsOnly: propsHandleRerollPlanetsOnly,
    onOpenSurfaceGen,
  } = props;

  const res = propsSystemResult || propsRes || null;
  if (!res) return null;
  const systemResult = res;

  // Local fallback states if not provided via props
  const [localDragMode, setLocalDragMode] = useState<'rotate' | 'pan'>('rotate');
  const orreryDragMode = propsDragMode !== undefined ? propsDragMode : localDragMode;
  const setOrreryDragMode = propsSetDragMode || setLocalDragMode;

  const [localIsDragging, setLocalIsDragging] = useState<boolean>(false);
  const isDraggingOrrery = propsIsDragging !== undefined ? propsIsDragging : localIsDragging;
  const setIsDraggingOrrery = propsSetIsDragging || setLocalIsDragging;

  const [localIncScale, setLocalIncScale] = useState<number>(1);
  const orreryIncScale = propsIncScale !== undefined ? propsIncScale : localIncScale;
  const setOrreryIncScale = propsSetIncScale || setLocalIncScale;

  const [localSpeed, setLocalSpeed] = useState<number>(1.0);
  const orrerySpeed = propsSpeed !== undefined ? propsSpeed : (orrerySpeedYrPerSec !== undefined ? orrerySpeedYrPerSec : localSpeed);
  const setOrrerySpeed = propsSetSpeed || (setOrrerySpeedYrPerSec as React.Dispatch<React.SetStateAction<number>> | undefined) || setLocalSpeed;

  const internalDragStartRef = useRef<{
    clientX: number;
    clientY: number;
    camX: number;
    camY: number;
    camZ: number;
    yaw: number;
    pitch: number;
    action: 'rotate' | 'pan';
  } | null>(null);
  const dragStartRef = propsDragStartRef || internalDragStartRef;

  const internalSvgRef = useRef<SVGSVGElement | null>(null);
  const orrerySvgRef = propsSvgRef || internalSvgRef;

  const [localShowLabels, setLocalShowLabels] = useState<boolean>(false);
  const showLabels = propsShowLabels !== undefined ? propsShowLabels : localShowLabels;
  const setShowLabels = propsSetShowLabels || setLocalShowLabels;

  const [localShowQuickJump, setLocalShowQuickJump] = useState<boolean>(true);
  const showQuickJump = propsShowQuickJump !== undefined ? propsShowQuickJump : localShowQuickJump;
  const setShowQuickJump = propsSetShowQuickJump || setLocalShowQuickJump;

  const [localShowLagrange, setLocalShowLagrange] = useState<boolean>(false);
  const showLagrange = propsShowLagrange !== undefined ? propsShowLagrange : localShowLagrange;
  const setShowLagrange = propsSetShowLagrange || setLocalShowLagrange;

  const [localNavZoneIdx, setLocalNavZoneIdx] = useState<number>(0);
  const [localNavOriginIdx, setLocalNavOriginIdx] = useState<number>(0);
  const [localNavDestIdx, setLocalNavDestIdx] = useState<number>(1);
  const navZoneIdx = propsNavZoneIdx !== undefined ? propsNavZoneIdx : localNavZoneIdx;
  const setNavZoneIdx = propsSetNavZoneIdx || setLocalNavZoneIdx;
  const navOriginIdx = propsNavOriginIdx !== undefined ? propsNavOriginIdx : localNavOriginIdx;
  const setNavOriginIdx = propsSetNavOriginIdx || setLocalNavOriginIdx;
  const navDestIdx = propsNavDestIdx !== undefined ? propsNavDestIdx : localNavDestIdx;
  const setNavDestIdx = propsSetNavDestIdx || setLocalNavDestIdx;

  const [localShowEntering, setLocalShowEntering] = useState<boolean>(true);
  const [localIsEnteringFading, setLocalIsEnteringFading] = useState<boolean>(false);
  const showEnteringOverlay = propsShowEnteringOverlay !== undefined ? propsShowEnteringOverlay : localShowEntering;
  const setShowEnteringOverlay = propsSetShowEnteringOverlay || setLocalShowEntering;
  const isEnteringFading = propsIsEnteringFading !== undefined ? propsIsEnteringFading : localIsEnteringFading;
  const setIsEnteringFading = propsSetIsEnteringFading || setLocalIsEnteringFading;

  const internalEnteringTimerRef = useRef<NodeJS.Timeout | null>(null);
  const internalEnteringFadeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const enteringTimerRef = propsEnteringTimerRef || internalEnteringTimerRef;
  const enteringFadeTimerRef = propsEnteringFadeTimerRef || internalEnteringFadeTimerRef;

  const [localActivePlanet, setLocalActivePlanet] = useState<{
    kind: 'planet' | 'moon';
    zoneIdx: number;
    bodyIdx: number;
    moonIdx?: number;
  } | null>(null);
  const activeHierarchyPlanet = propsActivePlanet !== undefined ? propsActivePlanet : localActivePlanet;
  const setActiveHierarchyPlanet = propsSetActivePlanet || setLocalActivePlanet;

  const fitOrreryToFullSystem = propsFitOrreryToFullSystem || ((resToFit: RealisticStarSystemResult) => {
    const layout = computeSystem2DLayout(resToFit);
    const fitPxPerAU = clamp(320 / Math.max(0.2, layout.maxExtentAU), 0.15, 4000);
    setOrreryPxPerAU(fitPxPerAU);
    setOrreryCamAU({ x: 0, y: 0, z: 0 });
    setTrackedTarget(null);
  });

  const handleTrackBody = propsHandleTrackBody || ((entity: SelectedMapEntity) => {
    setTrackedTarget(entity);
    setSelectedEntity(null);
    if (res) {
      const targetPos = getBodyWorldPosAU(
        res,
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
  });

  const handleZoomToEntity = propsHandleZoomToEntity || ((entity: SelectedMapEntity) => {
    if (!res) return;
    setTrackedTarget(entity);
    const layout = computeSystem2DLayout(res, orreryTimeYr);

    if (entity.kind === 'star') {
      const st = res.hierarchy.stars[entity.starIdx];
      if (!st) return;
      const sPos = layout.starPos[st.label] || { x: 0, y: 0 };
      const sZone = res.zones.find((z) =>
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
      const sp = res.hierarchy.splits[entity.splitIdx];
      if (!sp) return;
      const bPos = layout.baryPos[sp.pair] || { x: 0, y: 0 };
      setOrreryCamAU({ x: bPos.x, y: bPos.y, z: 0 });
      setOrreryPxPerAU(clamp(260 / Math.max(0.5, sp.a_AU * 2.2), 0.15, 60000));
      return;
    }

    let targetZoom = orreryPxPerAU;
    if (entity.kind === 'planet') {
      const z = res.zones[entity.zoneIdx];
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
      const z = res.zones[entity.zoneIdx];
      const b = z?.bodies[entity.bodyIdx];
      const beltA = b ? b.a : 3.0;
      targetZoom = clamp(260 / Math.max(0.5, beltA * 1.5), 0.15, 60000);
    }
    setOrreryPxPerAU(targetZoom);

    const pos = getBodyWorldPosAU(
      res,
      entity,
      orreryTimeYr,
      orreryIncScale,
      orreryPitch,
      orreryYaw,
      targetZoom
    );
    if (!pos) return;
    setOrreryCamAU(pos);
  });

  const getPlanetClaimInfo = propsGetPlanetClaimInfo || (() => null);
  const handleRerollPlanetsOnly = propsHandleRerollPlanetsOnly || (() => {});
  const setShowPreProgramModal = propsSetShowPreProgramModal || (() => {});

  const resolvedActivePlanet = useMemo<ResolvedActivePlanet | null>(() => {
    if (propsResolvedActivePlanet !== undefined) return propsResolvedActivePlanet;
    if (!res) return null;
    let target = activeHierarchyPlanet;

    if (!target || !res.zones[target.zoneIdx]?.bodies[target.bodyIdx]) {
      for (let zIdx = 0; zIdx < res.zones.length; zIdx++) {
        const zone = res.zones[zIdx];
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
    const zone = res.zones[target.zoneIdx];
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
  }, [propsResolvedActivePlanet, res, activeHierarchyPlanet]);

  const systemBriefingStats = useMemo<SystemBriefingStats | null>(() => {
    if (propsSystemBriefingStats !== undefined) return propsSystemBriefingStats;
    if (!res) return null;
    const sysName =
      res.step1?.name ||
      initialParams?.name ||
      res.step1?.id ||
      'System';
    const stars = res.hierarchy?.stars || [];
    const primaryStar = stars[0];
    const companionStars = stars.slice(1);
    const isMultiple = stars.length > 1;
    const archName =
      res.hierarchy?.archName?.replace(/\s*\(.*\)/g, '') ||
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

    (res.zones || []).forEach((z) => {
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
  }, [propsSystemBriefingStats, res, initialParams?.name]);

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

          {/* "Entering <System>" Briefing Table Overlay (Docked at top of UI, fades out immediately) */}
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
                  }, 800);
                }, 400);
              }}
              className={`absolute top-3 left-1/2 -translate-x-1/2 z-40 w-[94%] sm:w-[480px] md:w-[520px] max-h-[82vh] overflow-y-auto p-4 sm:p-5 rounded-2xl bg-[#080d1a]/95 backdrop-blur-lg border border-slate-700/90 shadow-[0_4px_30px_rgba(0,0,0,0.85)] text-xs sm:text-sm font-mono space-y-2.5 select-none pointer-events-auto transition-all duration-1000 ease-out ${
                isEnteringFading
                  ? 'opacity-0 -translate-y-3 pointer-events-none'
                  : 'opacity-100 translate-y-0'
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
                            const isActive =
                              resolvedActivePlanet?.kind === 'planet' &&
                              resolvedActivePlanet.zoneIdx === sZoneIdx &&
                              resolvedActivePlanet.bodyIdx === bIdx;

                              return (
                                <div
                                  key={`tree-planet-${sZoneIdx}-${bIdx}`}
                                  className="space-y-0.5"
                                  onClick={() => {
                                    setActiveHierarchyPlanet({
                                      kind: 'planet',
                                      zoneIdx: sZoneIdx,
                                      bodyIdx: bIdx,
                                    });
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setActiveHierarchyPlanet({
                                      kind: 'planet',
                                      zoneIdx: sZoneIdx,
                                      bodyIdx: bIdx,
                                    });
                                    setSelectedEntity({
                                      kind: 'planet',
                                      zoneIdx: sZoneIdx,
                                      bodyIdx: bIdx,
                                    });
                                  }}
                                >
                                  <div
                                    className={`flex items-center justify-between px-2 py-1 rounded-lg border transition ${
                                      isTracked || isActive
                                        ? 'bg-sky-950/80 border-sky-500 text-sky-200 shadow-sm shadow-sky-950'
                                        : isDossier
                                        ? 'bg-slate-800/90 border-slate-600 text-white'
                                        : 'bg-slate-950/50 hover:bg-slate-900 border-transparent hover:border-slate-800 text-slate-300'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveHierarchyPlanet({
                                          kind: 'planet',
                                          zoneIdx: sZoneIdx,
                                          bodyIdx: bIdx,
                                        });
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
                                        const isMoonActive =
                                          resolvedActivePlanet?.kind === 'moon' &&
                                          resolvedActivePlanet.zoneIdx === sZoneIdx &&
                                          resolvedActivePlanet.bodyIdx === bIdx &&
                                          resolvedActivePlanet.moonIdx === mIdx;

                                        return (
                                          <div
                                            key={`tree-moon-${sZoneIdx}-${bIdx}-${mIdx}`}
                                            className={`flex items-center justify-between px-1.5 py-0.5 rounded text-[10px] transition cursor-pointer ${
                                              isMoonTracked || isMoonActive
                                                ? 'bg-indigo-950/80 text-indigo-200 border border-indigo-500/70 shadow-sm'
                                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                                            }`}
                                            onClick={() => {
                                              setActiveHierarchyPlanet({
                                                kind: 'moon',
                                                zoneIdx: sZoneIdx,
                                                bodyIdx: bIdx,
                                                moonIdx: mIdx,
                                              });
                                            }}
                                            onContextMenu={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setActiveHierarchyPlanet({
                                                kind: 'moon',
                                                zoneIdx: sZoneIdx,
                                                bodyIdx: bIdx,
                                                moonIdx: mIdx,
                                              });
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
                                                setActiveHierarchyPlanet({
                                                  kind: 'moon',
                                                  zoneIdx: sZoneIdx,
                                                  bodyIdx: bIdx,
                                                  moonIdx: mIdx,
                                                });
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
                          const isCbActive =
                            resolvedActivePlanet?.kind === 'planet' &&
                            resolvedActivePlanet.zoneIdx === zIdx &&
                            resolvedActivePlanet.bodyIdx === bIdx;

                          return (
                            <div
                              key={`tree-cb-body-${zIdx}-${bIdx}`}
                              className={`flex items-center justify-between px-2 py-1 rounded text-[11px] border transition cursor-pointer ${
                                isTracked || isCbActive
                                  ? 'bg-sky-950/80 border-sky-500 text-sky-200 shadow-sm'
                                  : 'bg-slate-950/40 hover:bg-slate-900 border-transparent text-slate-300'
                              }`}
                              onClick={() => {
                                setActiveHierarchyPlanet({
                                  kind: 'planet',
                                  zoneIdx: zIdx,
                                  bodyIdx: bIdx,
                                });
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setActiveHierarchyPlanet({
                                  kind: 'planet',
                                  zoneIdx: zIdx,
                                  bodyIdx: bIdx,
                                });
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
                                  setActiveHierarchyPlanet({
                                    kind: 'planet',
                                    zoneIdx: zIdx,
                                    bodyIdx: bIdx,
                                  });
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
                                  setActiveHierarchyPlanet({
                                    kind: 'planet',
                                    zoneIdx: zIdx,
                                    bodyIdx: bIdx,
                                  });
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

              {/* Bottom Action Footer: Prominent Planet Data & Planet Surface Buttons */}
              {resolvedActivePlanet && (
                <div className="p-2.5 bg-[#080d1a]/95 border-t border-slate-800/90 shrink-0 space-y-2 select-none shadow-[0_-4px_16px_rgba(0,0,0,0.5)]">
                  {/* Active Selection Badge */}
                  <div className="flex items-center justify-between px-1 text-[11px]">
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                        style={{
                          backgroundColor: getPlanetVisualColor(resolvedActivePlanet.planet),
                        }}
                      />
                      <span className="font-bold text-slate-200 truncate">
                        {resolvedActivePlanet.moon
                          ? resolvedActivePlanet.moon.name
                          : `#${resolvedActivePlanet.bodyIdx + 1} ${shortClassLabel(resolvedActivePlanet.planet.planetClass)}`}
                      </span>
                      {resolvedActivePlanet.planet.hydrosphere?.biosphere &&
                        resolvedActivePlanet.planet.hydrosphere.biosphere !== 'none' && (
                          <span
                            className="text-[10px]"
                            title={`Biosphere: ${resolvedActivePlanet.planet.hydrosphere.biosphere}`}
                          >
                            🌱
                          </span>
                        )}
                    </div>
                    <span className="text-[10px] text-sky-400 font-mono shrink-0 ml-1">
                      {resolvedActivePlanet.planet.a.toFixed(2)} AU
                    </span>
                  </div>

                  {/* Prominent Action Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          resolvedActivePlanet.kind === 'moon' &&
                          resolvedActivePlanet.moonIdx !== undefined
                        ) {
                          setSelectedEntity({
                            kind: 'moon',
                            zoneIdx: resolvedActivePlanet.zoneIdx,
                            bodyIdx: resolvedActivePlanet.bodyIdx,
                            moonIdx: resolvedActivePlanet.moonIdx,
                          });
                        } else {
                          setSelectedEntity({
                            kind: 'planet',
                            zoneIdx: resolvedActivePlanet.zoneIdx,
                            bodyIdx: resolvedActivePlanet.bodyIdx,
                          });
                        }
                      }}
                      className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white border border-slate-600/80 hover:border-sky-400 font-bold text-xs tracking-wide shadow-md transition cursor-pointer active:scale-95"
                      title="Open Detailed Planetary Telemetry & Data Dossier"
                    >
                      <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="truncate">Planet Data</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenSurfaceGen && systemResult) {
                          onOpenSurfaceGen({
                            planet: resolvedActivePlanet.planet,
                            moon: resolvedActivePlanet.moon ?? null,
                            zone: resolvedActivePlanet.zone,
                            stars: systemResult.hierarchy.stars,
                          });
                        } else if (
                          resolvedActivePlanet.kind === 'moon' &&
                          resolvedActivePlanet.moonIdx !== undefined
                        ) {
                          setSelectedEntity({
                            kind: 'moon',
                            zoneIdx: resolvedActivePlanet.zoneIdx,
                            bodyIdx: resolvedActivePlanet.bodyIdx,
                            moonIdx: resolvedActivePlanet.moonIdx,
                          });
                        } else {
                          setSelectedEntity({
                            kind: 'planet',
                            zoneIdx: resolvedActivePlanet.zoneIdx,
                            bodyIdx: resolvedActivePlanet.bodyIdx,
                          });
                        }
                      }}
                      className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs tracking-wide shadow-lg shadow-emerald-950/60 border border-emerald-400/50 hover:border-emerald-300 transition cursor-pointer active:scale-95"
                      title="Open Full 3D Procedural Surface & Biosphere Explorer"
                    >
                      <Globe className="w-3.5 h-3.5 text-emerald-200 shrink-0" />
                      <span className="truncate">Planet Surface</span>
                    </button>
                  </div>
                </div>
              )}
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
});

SystemOrreryView.displayName = 'SystemOrreryView';
