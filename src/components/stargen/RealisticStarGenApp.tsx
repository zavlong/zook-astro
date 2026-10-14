import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  RefreshCw,
  Code,
  Rocket,
  Wrench,
  Copy,
  Check,
  X,
  Eye,
  ChevronLeft,
  ChevronRight,
  Compass,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
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
  getMoonVisualColor,
  getPlanetVisualColor,
  rollStep1,
  runRealisticGenerator,
} from '../../core/generation/realisticStarGen';
import { ArchitectSystem } from '../../types/architect';
import {
  RealisticBinarySplit,
  RealisticMoon,
  RealisticStarNode,
  StarSystem,
} from '../../types/astrophysics';
import { ExpandedSolarSystemTheater } from '../ui/inspector/ExpandedSolarSystemTheater';
import {
  ProceduralPlanetPortrait,
  getProceduralPlanetIconDataUrl,
} from './ProceduralPlanetPortrait';

interface RealisticStarGenAppProps {
  onOpenInArchitect: (archSystem: ArchitectSystem) => void;
  onInspectInSector3D?: (starSystem: StarSystem) => void;
}

type SelectedMapEntity =
  | {
      kind: 'planet';
      zoneIdx: number;
      bodyIdx: number;
    }
  | {
      kind: 'moon';
      zoneIdx: number;
      bodyIdx: number;
      moonIdx: number;
    }
  | {
      kind: 'belt';
      zoneIdx: number;
      bodyIdx: number;
    }
  | {
      kind: 'star';
      starIdx: number;
    }
  | {
      kind: 'split';
      splitIdx: number;
    };

function log10(x: number): number {
  return Math.log(Math.max(1e-12, x)) / Math.LN10;
}

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

function shortClassLabel(fullClass: string): string {
  if (fullClass.includes('Hot Jupiter')) {
    if (fullClass.includes('Class V')) return 'Class V Hot Jupiter';
    if (fullClass.includes('Class IV')) return 'Class IV Hot Jupiter';
    return 'Class III Hot Jupiter';
  }
  if (fullClass.includes('Sudarsky Class I ')) return 'Class I Giant';
  if (fullClass.includes('Sudarsky Class II ')) return 'Class II Giant';
  if (fullClass.includes('Sudarsky Class III ')) return 'Class III Giant';
  if (fullClass.includes('Sudarsky Class IV ')) return 'Class IV Giant';
  if (fullClass.includes('Sudarsky Class V ')) return 'Class V Giant';
  if (fullClass.includes('Temperate Super-Earth')) return 'Habitable Super-Earth';
  if (fullClass.includes('Temperate Terrestrial')) return 'Habitable Terra';
  if (fullClass.includes('Pelagic Water World')) return 'Habitable Ocean';
  if (fullClass.includes('Greenhouse Water World')) return 'Greenhouse Ocean';
  if (fullClass.includes('Supercritical Water')) return 'Supercritical Steam';
  if (fullClass.includes('Sulfuric Acid Marine')) return 'H2SO4 Acid Seas';
  if (fullClass.includes('Sulfuric Acid Ocean')) return 'H2SO4 Acid Ocean';
  if (fullClass.includes('Volcanic SO2 Marine')) return 'SO2 Volcanic Seas';
  if (fullClass.includes('Volcanic SO2 Ocean')) return 'SO2 Volcanic Ocean';
  if (fullClass.includes('Liquid CO2 Marine')) return 'Liquid CO2 Seas';
  if (fullClass.includes('Liquid CO2 Ocean')) return 'Liquid CO2 Ocean';
  if (fullClass.includes('Cryo-Ammonia Terrestrial')) return 'NH3 Habitable Terra';
  if (fullClass.includes('Cryo-Ammonia Pelagic')) return 'NH3 Habitable Ocean';
  if (fullClass.includes('Cryo-Ammonia Marine')) return 'NH3-H2O Cryo-Seas';
  if (fullClass.includes('Cryo-Ammonia Ocean')) return 'NH3-H2O Cryo-Ocean';
  if (fullClass.includes('Ice Giant')) return 'Ice Giant';
  if (fullClass.includes('Hot Neptune')) return 'Hot Neptune';
  if (fullClass.includes('Warm Neptune')) return 'Warm Neptune';
  if (fullClass.includes('Gas Dwarf')) return 'Sub-Neptune';
  if (fullClass.includes('Venusian')) return 'Venusian Toxic';
  if (fullClass.includes('Molten') && fullClass.includes('Lava Seas')) return 'Molten Lava Seas';
  if (fullClass.includes('Molten')) return 'Molten Magma World';
  if (fullClass.includes('Titan-Class')) return 'Titan CH4 World';
  if (fullClass.includes('Martian')) return 'Cold Martian';
  return fullClass.split('(')[0].trim();
}

function shortMoonLabel(moonClass: string): string {
  if (moonClass.includes('Molten')) return 'Molten Lava Moon';
  if (moonClass.includes('SO2')) return 'SO2 Sea Moon';
  if (moonClass.includes('Sulfuric Acid')) return 'H2SO4 Acid Moon';
  if (moonClass.includes('CO2')) return 'CO2 Sea Moon';
  if (moonClass.includes('Cryo-Ammonia Habitable')) return 'NH3 Habitable Moon';
  if (moonClass.includes('Cryo-Ammonia')) return 'NH3 Sea Moon';
  if (moonClass.includes('Io-Class')) return 'Io Volcanic';
  if (moonClass.includes('Europa-Class')) return 'Europa Ocean';
  if (moonClass.includes('Titan-Class')) return 'Titan CH4 Seas';
  if (moonClass.includes('Ganymede-Class')) return 'Ganymede Icy';
  if (moonClass.includes('Luna-Class')) return 'Luna Rocky';
  if (moonClass.includes('Triton-Class')) return 'Triton Retro';
  if (moonClass.includes('Habitable')) return 'Habitable Moon';
  if (moonClass.includes('Captured Irregular')) return 'Captured Rock';
  return 'Moonlet';
}

interface Vec2AU {
  x: number;
  y: number;
}

interface System2DLayout {
  starPos: Record<string, Vec2AU>;
  baryPos: Record<string, Vec2AU>;
  binaryLinks: Array<{
    splitIdx: number;
    split: RealisticBinarySplit;
    center: Vec2AU;
    pos1: Vec2AU;
    pos2: Vec2AU;
    r1: number;
    r2: number;
  }>;
  zoneCenters: Vec2AU[];
  maxExtentAU: number;
}

/**
 * Computes exact 2D physical coordinates (in AU) for all stars, binary/trinary/quadruple
 * barycenters, and planetary zones so all zones around all stars can be plotted
 * simultaneously with proportional orbital radii.
 */
function computeSystem2DLayout(res: RealisticStarSystemResult): System2DLayout {
  const stars = res.hierarchy.stars;
  const splits = res.hierarchy.splits;
  const starPos: Record<string, Vec2AU> = {};
  const baryPos: Record<string, Vec2AU> = {};
  const binaryLinks: System2DLayout['binaryLinks'] = [];

  const getStarMass = (label: string) =>
    stars.find((s) => s.label === label)?.mass || 1.0;

  if (stars.length === 1) {
    starPos['A'] = { x: 0, y: 0 };
  } else if (stars.length === 2 && splits[0]) {
    const sp = splits[0];
    const mA = getStarMass('A');
    const mB = getStarMass('B');
    const mTot = Math.max(0.05, mA + mB);
    const rA = sp.a_AU * (mB / mTot);
    const rB = sp.a_AU * (mA / mTot);
    const angle = -0.28;
    baryPos['AB'] = { x: 0, y: 0 };
    starPos['A'] = { x: -rA * Math.cos(angle), y: -rA * Math.sin(angle) };
    starPos['B'] = { x: rB * Math.cos(angle), y: rB * Math.sin(angle) };
    binaryLinks.push({
      splitIdx: 0,
      split: sp,
      center: baryPos['AB'],
      pos1: starPos['A'],
      pos2: starPos['B'],
      r1: rA,
      r2: rB,
    });
  } else if (stars.length === 3 && splits.length >= 2) {
    const outerSp = splits[0];
    const innerSp = splits[1];
    const mA = getStarMass('A');
    const mB = getStarMass('B');
    const mC = getStarMass('C');

    if (outerSp.pair === 'AB + C') {
      const mAB = mA + mB;
      const mTot = Math.max(0.05, mAB + mC);
      const rAB = outerSp.a_AU * (mC / mTot);
      const rC = outerSp.a_AU * (mAB / mTot);
      const outerAngle = -0.18;
      baryPos['AB + C'] = { x: 0, y: 0 };
      baryPos['AB'] = {
        x: -rAB * Math.cos(outerAngle),
        y: -rAB * Math.sin(outerAngle),
      };
      starPos['C'] = {
        x: rC * Math.cos(outerAngle),
        y: rC * Math.sin(outerAngle),
      };
      binaryLinks.push({
        splitIdx: 0,
        split: outerSp,
        center: baryPos['AB + C'],
        pos1: baryPos['AB'],
        pos2: starPos['C'],
        r1: rAB,
        r2: rC,
      });

      const rA = innerSp.a_AU * (mB / Math.max(0.05, mAB));
      const rB = innerSp.a_AU * (mA / Math.max(0.05, mAB));
      const innerAngle = 1.15;
      starPos['A'] = {
        x: baryPos['AB'].x - rA * Math.cos(innerAngle),
        y: baryPos['AB'].y - rA * Math.sin(innerAngle),
      };
      starPos['B'] = {
        x: baryPos['AB'].x + rB * Math.cos(innerAngle),
        y: baryPos['AB'].y + rB * Math.sin(innerAngle),
      };
      binaryLinks.push({
        splitIdx: 1,
        split: innerSp,
        center: baryPos['AB'],
        pos1: starPos['A'],
        pos2: starPos['B'],
        r1: rA,
        r2: rB,
      });
    } else {
      // A + (B+C)
      const mBC = mB + mC;
      const mTot = Math.max(0.05, mA + mBC);
      const rA = outerSp.a_AU * (mBC / mTot);
      const rBC = outerSp.a_AU * (mA / mTot);
      const outerAngle = -0.18;
      baryPos['A + BC'] = { x: 0, y: 0 };
      starPos['A'] = {
        x: -rA * Math.cos(outerAngle),
        y: -rA * Math.sin(outerAngle),
      };
      baryPos['BC'] = {
        x: rBC * Math.cos(outerAngle),
        y: rBC * Math.sin(outerAngle),
      };
      binaryLinks.push({
        splitIdx: 0,
        split: outerSp,
        center: baryPos['A + BC'],
        pos1: starPos['A'],
        pos2: baryPos['BC'],
        r1: rA,
        r2: rBC,
      });

      const rB = innerSp.a_AU * (mC / Math.max(0.05, mBC));
      const rC = innerSp.a_AU * (mB / Math.max(0.05, mBC));
      const innerAngle = 1.15;
      starPos['B'] = {
        x: baryPos['BC'].x - rB * Math.cos(innerAngle),
        y: baryPos['BC'].y - rB * Math.sin(innerAngle),
      };
      starPos['C'] = {
        x: baryPos['BC'].x + rC * Math.cos(innerAngle),
        y: baryPos['BC'].y + rC * Math.sin(innerAngle),
      };
      binaryLinks.push({
        splitIdx: 1,
        split: innerSp,
        center: baryPos['BC'],
        pos1: starPos['B'],
        pos2: starPos['C'],
        r1: rB,
        r2: rC,
      });
    }
  } else if (stars.length >= 4 && splits.length >= 3) {
    const outerSp = splits[0];
    const spAB = splits[1];
    const spCD = splits[2];
    const mA = getStarMass('A');
    const mB = getStarMass('B');
    const mC = getStarMass('C');
    const mD = getStarMass('D');
    const mAB = mA + mB;
    const mCD = mC + mD;
    const mTot = Math.max(0.05, mAB + mCD);

    const rAB = outerSp.a_AU * (mCD / mTot);
    const rCD = outerSp.a_AU * (mAB / mTot);
    const outerAngle = -0.15;
    baryPos['AB + CD'] = { x: 0, y: 0 };
    baryPos['AB'] = {
      x: -rAB * Math.cos(outerAngle),
      y: -rAB * Math.sin(outerAngle),
    };
    baryPos['CD'] = {
      x: rCD * Math.cos(outerAngle),
      y: rCD * Math.sin(outerAngle),
    };
    binaryLinks.push({
      splitIdx: 0,
      split: outerSp,
      center: baryPos['AB + CD'],
      pos1: baryPos['AB'],
      pos2: baryPos['CD'],
      r1: rAB,
      r2: rCD,
    });

    const rA = spAB.a_AU * (mB / Math.max(0.05, mAB));
    const rB = spAB.a_AU * (mA / Math.max(0.05, mAB));
    const angleAB = 1.1;
    starPos['A'] = {
      x: baryPos['AB'].x - rA * Math.cos(angleAB),
      y: baryPos['AB'].y - rA * Math.sin(angleAB),
    };
    starPos['B'] = {
      x: baryPos['AB'].x + rB * Math.cos(angleAB),
      y: baryPos['AB'].y + rB * Math.sin(angleAB),
    };
    binaryLinks.push({
      splitIdx: 1,
      split: spAB,
      center: baryPos['AB'],
      pos1: starPos['A'],
      pos2: starPos['B'],
      r1: rA,
      r2: rB,
    });

    const rC = spCD.a_AU * (mD / Math.max(0.05, mCD));
    const rD = spCD.a_AU * (mC / Math.max(0.05, mCD));
    const angleCD = -1.1;
    starPos['C'] = {
      x: baryPos['CD'].x - rC * Math.cos(angleCD),
      y: baryPos['CD'].y - rC * Math.sin(angleCD),
    };
    starPos['D'] = {
      x: baryPos['CD'].x + rD * Math.cos(angleCD),
      y: baryPos['CD'].y + rD * Math.sin(angleCD),
    };
    binaryLinks.push({
      splitIdx: 2,
      split: spCD,
      center: baryPos['CD'],
      pos1: starPos['C'],
      pos2: starPos['D'],
      r1: rC,
      r2: rD,
    });
  }

  stars.forEach((s, idx) => {
    if (!starPos[s.label]) {
      starPos[s.label] = { x: idx * 10, y: 0 };
    }
  });

  const zoneCenters: Vec2AU[] = res.zones.map((z) => {
    if (z.title.startsWith('Star ')) {
      const lbl = z.title.charAt(5);
      return starPos[lbl] || { x: 0, y: 0 };
    }
    if (z.title.startsWith('Circumbinary ')) {
      const pairName = z.title
        .replace('Circumbinary ', '')
        .replace(' (P-Type)', '')
        .trim();
      return baryPos[pairName] || { x: 0, y: 0 };
    }
    return { x: 0, y: 0 };
  });

  let maxExtentAU = 2.0;
  Object.values(starPos).forEach((p) => {
    maxExtentAU = Math.max(maxExtentAU, Math.hypot(p.x, p.y) * 1.25);
  });
  res.zones.forEach((z, idx) => {
    const c = zoneCenters[idx] || { x: 0, y: 0 };
    const distCenter = Math.hypot(c.x, c.y);
    const furthestBodyAU = z.bodies.reduce(
      (mx, b) => Math.max(mx, b.kind === 'planet' ? b.a * (1 + b.e) : b.a + b.beltWidth),
      z.a_in * 2
    );
    maxExtentAU = Math.max(maxExtentAU, distCenter + furthestBodyAU * 1.18);
  });

  return {
    starPos,
    baryPos,
    binaryLinks,
    zoneCenters,
    maxExtentAU,
  };
}

export const RealisticStarGenApp: React.FC<RealisticStarGenAppProps> = ({
  onOpenInArchitect,
  onInspectInSector3D,
}) => {
  // Step 1-2 Controls
  const [logMass, setLogMass] = useState<number>(0.02);
  const [age, setAge] = useState<number>(4.6);
  const [feh, setFeh] = useState<number>(0.0);
  const [forcedMult, setForcedMult] = useState<'auto' | '1' | '2' | '3' | '4'>('auto');
  const [presetKey, setPresetKey] = useState<string>('');

  // Generated System Result
  const [systemResult, setSystemResult] = useState<RealisticStarSystemResult | null>(null);

  // 2D Map View Mode & Zoom
  const [mapMode, setMapMode] = useState<'schematic' | 'orrery2d'>('schematic');
  const [mapZoom, setMapZoom] = useState<number>(1.0);

  // Proportional 2D Orrery Camera State (pxPerAU & center in AU)
  const [orreryPxPerAU, setOrreryPxPerAU] = useState<number>(35);
  const [orreryCamAU, setOrreryCamAU] = useState<Vec2AU>({ x: 0, y: 0 });
  const [isDraggingOrrery, setIsDraggingOrrery] = useState<boolean>(false);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    camX: number;
    camY: number;
  } | null>(null);
  const orrerySvgRef = useRef<SVGSVGElement | null>(null);

  // Click-to-Blow-Up Selected Entity Modal State
  const [selectedEntity, setSelectedEntity] = useState<SelectedMapEntity | null>(null);

  // Modals (JSON & 3D Raytraced Theater)
  const [showJsonModal, setShowJsonModal] = useState<boolean>(false);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [theaterStar, setTheaterStar] = useState<StarSystem | null>(null);
  const [theaterPlanetIdx, setTheaterPlanetIdx] = useState<number>(0);

  const sysMass = +Math.pow(10, logMass).toFixed(3);

  const fitOrreryToFullSystem = (res: RealisticStarSystemResult) => {
    const layout = computeSystem2DLayout(res);
    const fitPxPerAU = clamp(320 / Math.max(0.2, layout.maxExtentAU), 0.15, 4000);
    setOrreryPxPerAU(fitPxPerAU);
    setOrreryCamAU({ x: 0, y: 0 });
  };

  const triggerRun = (params: StarGenParams) => {
    const res = runRealisticGenerator(params);
    setSystemResult(res);
    setSelectedEntity(null);
    fitOrreryToFullSystem(res);
  };

  useEffect(() => {
    triggerRun({
      sysMass: +Math.pow(10, logMass).toFixed(3),
      age,
      feh,
      forcedMult,
    });
  }, []);

  // Attach native non-passive wheel listener to the 2D Orrery SVG so wheel-zoom doesn't scroll page
  useEffect(() => {
    const svgEl = orrerySvgRef.current;
    if (!svgEl || mapMode !== 'orrery2d') return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svgEl.getBoundingClientRect();
      const viewW = 1040;
      const viewH = 680;
      const mouseSvgX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * viewW;
      const mouseSvgY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * viewH;

      const zoomFactor = e.deltaY < 0 ? 1.24 : 1 / 1.24;
      setOrreryPxPerAU((prevPx) => {
        const nextPx = clamp(prevPx * zoomFactor, 0.05, 80000);
        setOrreryCamAU((prevCam) => {
          const worldX = prevCam.x + (mouseSvgX - viewW / 2) / prevPx;
          const worldY = prevCam.y + (mouseSvgY - viewH / 2) / prevPx;
          return {
            x: worldX - (mouseSvgX - viewW / 2) / nextPx,
            y: worldY - (mouseSvgY - viewH / 2) / nextPx,
          };
        });
        return nextPx;
      });
    };

    svgEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => svgEl.removeEventListener('wheel', handleWheel);
  }, [mapMode, systemResult]);

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
    });
  };

  const handleSelectPreset = (key: string) => {
    setPresetKey(key);
    const p = STARGEN_BENCHMARK_PRESETS[key];
    if (!p) return;
    const newLogM = +log10(p.sysMass).toFixed(2);
    handleParamChange(newLogM, p.age, p.feh, p.forcedMult, false);
  };

  const handleCopyJson = () => {
    if (!systemResult) return;
    navigator.clipboard.writeText(JSON.stringify(systemResult, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const openZoneIn3DTheater = (zoneIdx: number, planetIdx = 0) => {
    if (!systemResult) return;
    const starSys = convertRealisticToSectorStarSystem(systemResult, zoneIdx);
    setTheaterStar(starSys);
    setTheaterPlanetIdx(planetIdx);
  };

  const sendZoneToArchitect = (zoneIdx: number) => {
    if (!systemResult) return;
    const archSys = convertRealisticToArchitectSystem(systemResult, zoneIdx);
    onOpenInArchitect(archSys);
  };

  const totalPlanets = systemResult
    ? systemResult.zones.reduce(
        (acc, z) => acc + z.bodies.filter((b) => b.kind === 'planet').length,
        0
      )
    : 0;

  const totalMoons = systemResult
    ? systemResult.zones.reduce(
        (acc, z) =>
          acc +
          z.bodies.reduce(
            (mAcc, b) => mAcc + (b.kind === 'planet' ? b.moons.length : 0),
            0
          ),
        0
      )
    : 0;

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
      zones.findIndex((z) => z.title === `Circumbinary ${pairName} (P-Type)`);
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

    const topHeaderH = h.splits.length > 0 ? 92 : 52;
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
            STELLAR HIERARCHY ({h.archName.toUpperCase()})
          </text>
          <text x={26} y={50} fill="#64748b" fontSize={10} fontFamily="monospace">
            Click any Star, Split, Planet, Belt or Moon to inspect
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

          {/* Top Binary / Trinary / Quadruple Separation Ribbon on the Shared AU Scale */}
          {h.splits.length > 0 && (
            <g>
              <rect
                x={trackX1}
                y={12}
                width={trackX2 - trackX1}
                height={64}
                rx={8}
                fill="#0b1322"
                stroke="#1e293b"
              />
              <text
                x={trackX1 + 12}
                y={28}
                fill="#fbbf24"
                fontSize={10.5}
                fontWeight="bold"
                fontFamily="monospace"
              >
                GRAVITATIONAL BINARY / TRINARY SPLITS &amp; RESONANCE GAPS (SHARED AU SCALE)
              </text>

              {h.splits.map((sp, sIdx) => {
                const xSplit = mx(sp.a_AU);
                const xSmax = sp.sMaxA > minAU ? mx(sp.sMaxA) : trackX1;
                const xPmin = sp.pMin < maxAU ? mx(sp.pMin) : trackX2;
                const yBar = 44 + sIdx * 14;
                return (
                  <g
                    key={sIdx}
                    className="cursor-pointer"
                    onClick={() => setSelectedEntity({ kind: 'split', splitIdx: sIdx })}
                  >
                    <rect
                      x={Math.min(xSmax, xPmin)}
                      y={yBar - 5}
                      width={Math.max(4, Math.abs(xPmin - xSmax))}
                      height={10}
                      fill="rgba(248,113,113,0.16)"
                      stroke="rgba(248,113,113,0.4)"
                      strokeDasharray="3,2"
                      rx={3}
                    />
                    <circle
                      cx={xSplit}
                      cy={yBar}
                      r={5.5}
                      fill="#fbbf24"
                      stroke="#0f172a"
                      strokeWidth={1.5}
                    />
                    <text
                      x={xSplit + 9}
                      y={yBar + 3.5}
                      fill="#fde68a"
                      fontSize={10}
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      Split [{sp.pair}]: {sp.a_AU} AU (e={sp.e}) · {sp.regime}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* Left Column Binary Connector Line Joining First & Last Star */}
          {h.stars.length >= 2 && (
            <path
              d={`M 48 ${starRowMidY[h.stars[0].label] || topHeaderH + 40} L 26 ${
                starRowMidY[h.stars[0].label] || topHeaderH + 40
              } L 26 ${
                starRowMidY[h.stars[h.stars.length - 1].label] || H - 80
              } L 48 ${starRowMidY[h.stars[h.stars.length - 1].label] || H - 80}`}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={2}
              strokeDasharray="4,3"
            />
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
                      onClick={() => setSelectedEntity({ kind: 'star', starIdx: sIdx })}
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
                      <text
                        x={104}
                        y={midY - 12}
                        fill="#ffffff"
                        fontSize={12.5}
                        fontWeight="bold"
                        fontFamily="sans-serif"
                      >
                        Star {st.label} · {st.spectralType}
                      </text>
                      <text
                        x={104}
                        y={midY + 3}
                        fill="#38bdf8"
                        fontSize={10}
                        fontFamily="monospace"
                      >
                        {st.category}
                      </text>
                      <text
                        x={104}
                        y={midY + 18}
                        fill="#94a3b8"
                        fontSize={10}
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

                {/* Zone Title & Archetype Header */}
                <text
                  x={trackX1 + 8}
                  y={laneTop + 26}
                  fill={isCircumbinary ? '#fde68a' : '#f8fafc'}
                  fontSize={12}
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  {z.title}
                </text>
                <text
                  x={trackX1 + 8}
                  y={laneTop + 41}
                  fill="#38bdf8"
                  fontSize={10}
                  fontFamily="monospace"
                >
                  Type {z.archetype} Architecture · Disk: {z.diskMassEarth} M⊕
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
                    <text
                      x={xSnow + 5}
                      y={laneTop + laneHeight - 24}
                      fill="#38bdf8"
                      fontSize={9}
                      fontFamily="monospace"
                    >
                      ❄️ Snow ({z.a_snow.toFixed(2)} AU)
                    </text>
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
                              setSelectedEntity({
                                kind: 'moon',
                                zoneIdx: zIdx,
                                bodyIdx: bIdx,
                                moonIdx: mIdx,
                              });
                            }}
                          >
                            <title>
                              {m.name} ({m.moonClass}) — Click for full details
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
                      <g
                        className="cursor-pointer"
                        onClick={() =>
                          setSelectedEntity({
                            kind: 'planet',
                            zoneIdx: zIdx,
                            bodyIdx: bIdx,
                          })
                        }
                      >
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
                          fill="#f8fafc"
                          fontSize={10}
                          fontWeight="bold"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          #{num}
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
  // 2D PROPORTIONAL MULTI-STAR ORBITAL MAP (ALL ZONES & ALL STARS SIMULTANEOUSLY)
  // ============================================================================
  const render2DTopDownOrrery = (res: RealisticStarSystemResult) => {
    const layout = computeSystem2DLayout(res);
    const viewW = 1040;
    const viewH = 680;
    const cxScreen = viewW / 2;
    const cyScreen = viewH / 2;

    const toScreenX = (auX: number) => cxScreen + (auX - orreryCamAU.x) * orreryPxPerAU;
    const toScreenY = (auY: number) => cyScreen + (auY - orreryCamAU.y) * orreryPxPerAU;
    const toScreenR = (auR: number) => auR * orreryPxPerAU;

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

    return (
      <div className="w-full flex flex-col gap-2.5 bg-[#04070e] rounded-xl border border-slate-800/90 p-3">
        {/* Top Interactive Camera & Zoom Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0b111e] px-3 py-2 rounded-lg border border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono text-slate-400 mr-1">
              Camera Focus:
            </span>
            <button
              type="button"
              onClick={() => fitOrreryToFullSystem(res)}
              className="px-2.5 py-1 rounded bg-sky-600/90 hover:bg-sky-500 text-white text-xs font-mono font-bold cursor-pointer transition"
            >
              Whole System
            </button>
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
                  onClick={() => focusCameraOn(sPos, maxPlanetA * 1.25)}
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
                    onClick={() => focusCameraOn(cPos, maxBodyA * 1.25)}
                    className="px-2.5 py-1 rounded bg-amber-950/60 hover:bg-amber-900/70 text-amber-200 border border-amber-700/60 text-xs font-mono cursor-pointer transition"
                  >
                    {z.title.replace(' (P-Type)', '')}
                  </button>
                );
              })}
          </div>

          {/* Dynamic Zoom Controls */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <button
              type="button"
              onClick={() =>
                setOrreryPxPerAU((p) => clamp(p / 1.45, 0.05, 80000))
              }
              className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={-1.3}
              max={4.9}
              step={0.02}
              value={log10(Math.max(0.05, orreryPxPerAU))}
              onChange={(e) =>
                setOrreryPxPerAU(Math.pow(10, parseFloat(e.target.value)))
              }
              className="w-28 accent-sky-400 cursor-pointer"
              title="Proportional Zoom (px/AU)"
            />
            <button
              type="button"
              onClick={() =>
                setOrreryPxPerAU((p) => clamp(p * 1.45, 0.05, 80000))
              }
              className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-sky-400 min-w-[82px] text-right">
              {orreryPxPerAU >= 10
                ? `${Math.round(orreryPxPerAU)} px/AU`
                : `${orreryPxPerAU.toFixed(2)} px/AU`}
            </span>
          </div>
        </div>

        {/* Interactive 2D Proportional SVG Canvas (Scroll to Zoom, Drag to Pan) */}
        <div className="relative w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#03060c]">
          <svg
            ref={orrerySvgRef}
            viewBox={`0 0 ${viewW} ${viewH}`}
            className={`w-full h-auto block select-none ${
              isDraggingOrrery ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              setIsDraggingOrrery(true);
              dragStartRef.current = {
                clientX: e.clientX,
                clientY: e.clientY,
                camX: orreryCamAU.x,
                camY: orreryCamAU.y,
              };
            }}
            onMouseMove={(e) => {
              if (!isDraggingOrrery || !dragStartRef.current || !orrerySvgRef.current)
                return;
              const rect = orrerySvgRef.current.getBoundingClientRect();
              const dxSvg =
                ((e.clientX - dragStartRef.current.clientX) /
                  Math.max(1, rect.width)) *
                viewW;
              const dySvg =
                ((e.clientY - dragStartRef.current.clientY) /
                  Math.max(1, rect.height)) *
                viewH;
              setOrreryCamAU({
                x: dragStartRef.current.camX - dxSvg / orreryPxPerAU,
                y: dragStartRef.current.camY - dySvg / orreryPxPerAU,
              });
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

            {/* 1. Binary / Trinary / Quadruple Barycentric Orbit Links */}
            {layout.binaryLinks.map((bl) => {
              const bx = toScreenX(bl.center.x);
              const by = toScreenY(bl.center.y);
              const p1x = toScreenX(bl.pos1.x);
              const p1y = toScreenY(bl.pos1.y);
              const p2x = toScreenX(bl.pos2.x);
              const p2y = toScreenY(bl.pos2.y);
              const r1Px = toScreenR(bl.r1);
              const r2Px = toScreenR(bl.r2);

              return (
                <g key={`bin-link-${bl.splitIdx}`}>
                  {/* Barycentric Stellar Orbits */}
                  {r1Px > 2 && r1Px < 60000 && (
                    <circle
                      cx={bx}
                      cy={by}
                      r={r1Px}
                      fill="none"
                      stroke="rgba(251, 191, 36, 0.25)"
                      strokeWidth={1.2}
                      strokeDasharray="6,4"
                    />
                  )}
                  {r2Px > 2 && r2Px < 60000 && (
                    <circle
                      cx={bx}
                      cy={by}
                      r={r2Px}
                      fill="none"
                      stroke="rgba(251, 191, 36, 0.25)"
                      strokeWidth={1.2}
                      strokeDasharray="6,4"
                    />
                  )}
                  {/* Line connecting binary components through barycenter */}
                  <line
                    x1={p1x}
                    y1={p1y}
                    x2={p2x}
                    y2={p2y}
                    stroke="rgba(251, 191, 36, 0.35)"
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />
                  {/* Clickable Barycenter Crosshair */}
                  <g
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEntity({ kind: 'split', splitIdx: bl.splitIdx });
                    }}
                  >
                    <circle
                      cx={bx}
                      cy={by}
                      r={5}
                      fill="#1e293b"
                      stroke="#fbbf24"
                      strokeWidth={1.5}
                    />
                    <text
                      x={bx}
                      y={by - 8}
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

            {/* 2. All Planetary Zones Around All Stars & Barycenters Simultaneously */}
            {res.zones.map((z, zIdx) => {
              const centerAU = layout.zoneCenters[zIdx] || { x: 0, y: 0 };
              const zx = toScreenX(centerAU.x);
              const zy = toScreenY(centerAU.y);
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

              const rHZIn = toScreenR(Math.max(z.a_in, hzInAU));
              const rHZOut = toScreenR(Math.min(z.a_out, hzOutAU));
              const rSnow = toScreenR(z.a_snow);

              return (
                <g key={`zone-2d-${zIdx}`}>
                  {/* Habitable Zone Proportional Annulus */}
                  {showHZ &&
                    rHZOut > rHZIn &&
                    rHZOut > 3 &&
                    rHZIn < 60000 && (
                      <circle
                        cx={zx}
                        cy={zy}
                        r={(rHZIn + rHZOut) / 2}
                        fill="none"
                        stroke="rgba(16, 185, 129, 0.16)"
                        strokeWidth={Math.max(2, rHZOut - rHZIn)}
                      />
                    )}

                  {/* Snow Line Proportional Circle */}
                  {showSnow && rSnow > 4 && rSnow < 60000 && (
                    <g>
                      <circle
                        cx={zx}
                        cy={zy}
                        r={rSnow}
                        fill="none"
                        stroke="rgba(56, 189, 248, 0.55)"
                        strokeWidth={1.2}
                        strokeDasharray="5,5"
                      />
                      {rSnow > 28 && rSnow < 2000 && (
                        <text
                          x={zx + rSnow * 0.707 + 4}
                          y={zy - rSnow * 0.707 - 4}
                          fill="#38bdf8"
                          fontSize={8.5}
                          fontFamily="monospace"
                        >
                          ❄️ {z.a_snow.toFixed(2)} AU
                        </text>
                      )}
                    </g>
                  )}

                  {/* Planets & Belts on True Proportional Orbits */}
                  {z.bodies.map((b, bIdx) => {
                    const rOrbitPx = toScreenR(b.a);
                    if (rOrbitPx < 1.5 || rOrbitPx > 90000) return null;

                    const theta =
                      -Math.PI / 3 + bIdx * 2.39996 + zIdx * 0.85;

                    if (b.kind === 'belt') {
                      const beltWidthPx = Math.max(
                        3,
                        toScreenR(b.beltWidth * 2)
                      );
                      const bxPos = zx + rOrbitPx * Math.cos(theta);
                      const byPos = zy + rOrbitPx * Math.sin(theta);
                      return (
                        <g
                          key={`body-${zIdx}-${bIdx}`}
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
                          <circle
                            cx={zx}
                            cy={zy}
                            r={rOrbitPx}
                            fill="none"
                            stroke="rgba(148, 163, 184, 0.28)"
                            strokeWidth={beltWidthPx}
                            strokeDasharray="3,6"
                          />
                          {rOrbitPx > 22 && (
                            <text
                              x={bxPos}
                              y={byPos}
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

                    // True Keplerian Eccentricity Ellipse in Proportional AU Space
                    const eVal = clamp(b.e, 0, 0.92);
                    const rxPx = rOrbitPx;
                    const ryPx = rOrbitPx * Math.sqrt(1 - eVal * eVal);
                    const focusOffsetPx = rOrbitPx * eVal;
                    const rAtThetaPx =
                      (rOrbitPx * (1 - eVal * eVal)) /
                      (1 + eVal * Math.cos(theta));
                    const px = zx + rAtThetaPx * Math.cos(theta);
                    const py = zy + rAtThetaPx * Math.sin(theta);

                    const pRad = clamp(
                      5.5 + (3.2 * Math.log(Math.max(0.5, b.radiusEarth))) / Math.LN2,
                      5.5,
                      15
                    );
                    const zoneStar2D =
                      res.hierarchy.stars.find((s) =>
                        z.title.includes(`Star ${s.label}`)
                      ) || res.hierarchy.stars[0];
                    const planetIcon2DUrl = getProceduralPlanetIconDataUrl(
                      b,
                      null,
                      zoneStar2D?.colorHex || '#fff4e6',
                      zoneStar2D?.Teff || 5778,
                      0,
                      56
                    );
                    const planet2DImgSize = b.rings ? pRad * 3.85 : pRad * 2.75;
                    const isPlanetSel =
                      selectedEntity?.kind === 'planet' &&
                      selectedEntity.zoneIdx === zIdx &&
                      selectedEntity.bodyIdx === bIdx;

                    return (
                      <g key={`body-${zIdx}-${bIdx}`}>
                        {/* Proportional Orbit Path */}
                        <ellipse
                          cx={zx - focusOffsetPx}
                          cy={zy}
                          rx={rxPx}
                          ry={ryPx}
                          fill="none"
                          stroke={
                            isPlanetSel
                              ? '#38bdf8'
                              : isCircumbinary
                              ? 'rgba(251, 191, 36, 0.28)'
                              : 'rgba(51, 65, 85, 0.85)'
                          }
                          strokeWidth={isPlanetSel ? 1.8 : 1.1}
                        />

                        {/* Moons around planet when sufficiently zoomed in */}
                        {rOrbitPx > 28 &&
                          b.moons.map((m, mIdx) => {
                            const mAngle =
                              theta +
                              (mIdx * Math.PI * 2) / Math.max(1, b.moons.length);
                            const mDist = pRad + 8 + mIdx * 5.2;
                            const mxPos = px + mDist * Math.cos(mAngle);
                            const myPos = py + mDist * Math.sin(mAngle);
                            const moonIcon2DUrl = getProceduralPlanetIconDataUrl(
                              b,
                              m,
                              zoneStar2D?.colorHex || '#fff4e6',
                              zoneStar2D?.Teff || 5778,
                              mIdx,
                              36
                            );
                            const moon2DImgSize = 9.5;
                            return (
                              <g
                                key={m.id || mIdx}
                                className="cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEntity({
                                    kind: 'moon',
                                    zoneIdx: zIdx,
                                    bodyIdx: bIdx,
                                    moonIdx: mIdx,
                                  });
                                }}
                              >
                                <circle
                                  cx={px}
                                  cy={py}
                                  r={mDist}
                                  fill="none"
                                  stroke="rgba(100,116,139,0.32)"
                                  strokeDasharray="2,2"
                                />
                                <image
                                  href={moonIcon2DUrl}
                                  x={mxPos - moon2DImgSize / 2}
                                  y={myPos - moon2DImgSize / 2}
                                  width={moon2DImgSize}
                                  height={moon2DImgSize}
                                />
                              </g>
                            );
                          })}

                        {/* Clickable Planet Marker & Minimal Label (#num + 2-decimal AU) */}
                        <g
                          className="cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEntity({
                              kind: 'planet',
                              zoneIdx: zIdx,
                              bodyIdx: bIdx,
                            });
                          }}
                        >
                          {isPlanetSel && (
                            <circle
                              cx={px}
                              cy={py}
                              r={pRad + 3}
                              fill="none"
                              stroke="#ffffff"
                              strokeWidth={1.6}
                            />
                          )}
                          <image
                            href={planetIcon2DUrl}
                            x={px - planet2DImgSize / 2}
                            y={py - planet2DImgSize / 2}
                            width={planet2DImgSize}
                            height={planet2DImgSize}
                          />
                          {rOrbitPx > 14 && (
                            <text
                              x={px}
                              y={py - pRad - 5}
                              fill="#f8fafc"
                              fontSize={9.5}
                              fontWeight="bold"
                              fontFamily="monospace"
                              textAnchor="middle"
                            >
                              #{bIdx + 1} ({b.a.toFixed(2)} AU)
                            </text>
                          )}
                        </g>
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* 3. All Stars Rendered on Top at Their Exact 2D Coordinates */}
            {res.hierarchy.stars.map((st, sIdx) => {
              const pos = layout.starPos[st.label] || { x: 0, y: 0 };
              const sx = toScreenX(pos.x);
              const sy = toScreenY(pos.y);
              const sRad = clamp(8 + 2.5 * log10(Math.max(0.08, st.mass)), 6.5, 14);

              return (
                <g
                  key={`star-2d-${st.label}`}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEntity({ kind: 'star', starIdx: sIdx });
                  }}
                >
                  <circle
                    cx={sx}
                    cy={sy}
                    r={sRad * 1.9}
                    fill={st.colorHex}
                    fillOpacity={0.22}
                  />
                  <circle
                    cx={sx}
                    cy={sy}
                    r={sRad}
                    fill={st.colorHex}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                  <text
                    x={sx}
                    y={sy + sRad + 12}
                    fill="#ffffff"
                    fontSize={10}
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    Star {st.label} ({st.spectralType})
                  </text>
                </g>
              );
            })}

            {/* 4. Dynamic Physical Scale Bar & Controls Hint Overlay */}
            <g transform={`translate(20, ${viewH - 36})`}>
              <rect
                x={-8}
                y={-18}
                width={Math.max(150, barPx + 24)}
                height={42}
                rx={6}
                fill="rgba(10, 15, 26, 0.85)"
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
                fill="#64748b"
                fontSize={8.5}
                fontFamily="monospace"
              >
                Scroll to zoom · Drag to pan
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
      const st: RealisticStarNode | undefined =
        systemResult.hierarchy.stars[selectedEntity.starIdx];
      if (!st) return null;
      return (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedEntity(null)}
        >
          <div
            className="bg-[#0e131d] border border-sky-500/60 rounded-2xl max-w-xl w-full p-5 flex flex-col gap-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full"
                  style={{
                    backgroundColor: st.colorHex,
                    boxShadow: `0 0 20px ${st.colorHex}`,
                  }}
                />
                <div>
                  <h2 className="text-base font-bold text-white">
                    Star {st.label} &bull; {st.spectralType}
                  </h2>
                  <p className="text-xs text-sky-400 font-mono">{st.category}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntity(null)}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 bg-[#151d2c] p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">Stellar Mass</span>
                <b className="text-white text-sm">{st.mass} M☉</b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Bolometric Lum</span>
                <b className="text-amber-300 text-sm">{st.lum} L☉</b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Photosphere Radius</span>
                <b className="text-sky-300 text-sm">{st.radius} R☉</b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Effective Temp</span>
                <b className="text-white text-sm">{st.Teff} K</b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Surface Gravity</span>
                <b className="text-white text-sm">log g = {st.logg}</b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">MS Fractional Age</span>
                <b className="text-emerald-300 text-sm">τ = {st.tau}</b>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs font-mono text-slate-400">
              <span>
                System Age: <b className="text-slate-200">{systemResult.step1.age} Gyr</b> &bull;
                Metallicity:{' '}
                <b className="text-slate-200">
                  {systemResult.step1.feh >= 0 ? '+' : ''}
                  {systemResult.step1.feh} dex
                </b>
              </span>
              <div className="flex gap-1.5">
                {systemResult.hierarchy.stars.map((s, idx) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setSelectedEntity({ kind: 'star', starIdx: idx })}
                    className={`px-2.5 py-1 rounded border cursor-pointer ${
                      idx === selectedEntity.starIdx
                        ? 'bg-sky-600 text-white border-sky-400 font-bold'
                        : 'bg-slate-900 text-slate-300 border-slate-700'
                    }`}
                  >
                    Star {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 2. Binary Split Dossier Blow-Up
    if (selectedEntity.kind === 'split') {
      const sp: RealisticBinarySplit | undefined =
        systemResult.hierarchy.splits[selectedEntity.splitIdx];
      if (!sp) return null;
      return (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedEntity(null)}
        >
          <div
            className="bg-[#0e131d] border border-amber-500/60 rounded-2xl max-w-lg w-full p-5 flex flex-col gap-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-white">
                  Binary / Hierarchical Split [{sp.pair}]
                </h2>
                <p className="text-xs text-amber-400 font-mono">{sp.regime}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntity(null)}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 bg-[#151d2c] p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">Binary Separation (a)</span>
                <b className="text-white text-sm">{sp.a_AU} AU</b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Binary Eccentricity (e)</span>
                <b className="text-white text-sm">{sp.e}</b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">
                  Holman-Wiegert S-Type Max (A / B)
                </span>
                <b className="text-sky-300 text-sm">
                  {sp.sMaxA} AU / {sp.sMaxB} AU
                </b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">
                  Holman-Wiegert P-Type Inner Min
                </span>
                <b className="text-emerald-300 text-sm">{sp.pMin} AU</b>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 3. Belt Dossier Blow-Up
    if (selectedEntity.kind === 'belt') {
      const zone = systemResult.zones[selectedEntity.zoneIdx];
      const belt = zone?.bodies[selectedEntity.bodyIdx] as RealisticBeltBody | undefined;
      if (!zone || !belt || belt.kind !== 'belt') return null;

      return (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedEntity(null)}
        >
          <div
            className="bg-[#0e131d] border border-slate-500/60 rounded-2xl max-w-lg w-full p-5 flex flex-col gap-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-white">
                  Belt #{selectedEntity.bodyIdx + 1}: {belt.role}
                </h2>
                <p className="text-xs text-sky-400 font-mono">{zone.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntity(null)}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 bg-[#151d2c] p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">Central Orbit</span>
                <b className="text-white text-sm">{belt.a} AU</b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Radial Half-Width</span>
                <b className="text-sky-300 text-sm">±{belt.beltWidth} AU</b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Surviving Mass</span>
                <b className="text-emerald-300 text-sm">{belt.massEarth} M⊕</b>
              </div>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Initial 1–2% Protoplanetary Disk Slot Share:{' '}
              <b className="text-slate-200">{belt.rawSlotMassEarth} M⊕</b> (99%+ dynamically
              scattered/ground by resonances)
            </div>
          </div>
        </div>
      );
    }

    // 4. Unified Planet OR Moon Full Dossier Blow-Up (Same Comprehensive Data for Both!)
    const zone = systemResult.zones[selectedEntity.zoneIdx];
    const hostPlanet = zone?.bodies[selectedEntity.bodyIdx] as
      | RealisticPlanetBody
      | undefined;
    if (!zone || !hostPlanet || hostPlanet.kind !== 'planet') return null;

    const isMoon = selectedEntity.kind === 'moon';
    const activeMoon: RealisticMoon | null =
      isMoon && hostPlanet.moons[selectedEntity.moonIdx]
        ? hostPlanet.moons[selectedEntity.moonIdx]
        : null;

    // Unified Planet/Moon Telemetry Adapter so Moons display the EXACT same data fields as Planets
    const title = isMoon && activeMoon
      ? `Planet #${selectedEntity.bodyIdx + 1} ${activeMoon.name}: ${activeMoon.moonClass}`
      : `Planet #${selectedEntity.bodyIdx + 1}: ${hostPlanet.planetClass}`;

    const subtitle = isMoon && activeMoon
      ? `a = ${activeMoon.a_Rp} Rp (${activeMoon.a_km.toLocaleString()} km) · e = ${activeMoon.e} · inc = ${activeMoon.incDeg}°${
          activeMoon.retrograde ? ' [Retrograde]' : ''
        } · ${activeMoon.origin}`
      : `a = ${hostPlanet.a} AU (e = ${hostPlanet.e})${
          hostPlanet.a_birth !== hostPlanet.a
            ? ` [Migrated from ${hostPlanet.a_birth} AU]`
            : ''
        } · ${hostPlanet.migrationHistory}`;

    const badgeText = isMoon && activeMoon
      ? `${activeMoon.massLunar} M☾ (${activeMoon.massEarth} M⊕)`
      : hostPlanet.massEarth >= 30
      ? `${hostPlanet.massJup} MJ (${hostPlanet.massEarth} M⊕)`
      : `${hostPlanet.massEarth} M⊕`;

    const radDisplay = isMoon && activeMoon
      ? `${activeMoon.radiusEarth} R⊕ (${activeMoon.radiusKm.toLocaleString()} km)`
      : `${hostPlanet.radiusEarth} R⊕ (${Math.round(hostPlanet.radiusEarth * 6371).toLocaleString()} km)`;

    const gravDisplay = isMoon && activeMoon ? `${activeMoon.gravityG} g` : `${hostPlanet.gravityG} g`;
    const densDisplay = isMoon && activeMoon
      ? `${activeMoon.densityGcm3} g/cm³`
      : `${hostPlanet.densityGcm3} g/cm³`;
    const periodDisplay = isMoon && activeMoon
      ? `${activeMoon.periodDays} d (around Planet #${selectedEntity.bodyIdx + 1})`
      : `${hostPlanet.orbitalPeriodDays} d (${(hostPlanet.orbitalPeriodDays / 365.25).toFixed(2)} yr)`;
    const spinDisplay = isMoon && activeMoon
      ? `${activeMoon.rotationHours} h (${activeMoon.spinState})`
      : `${hostPlanet.rotationHours} h (${hostPlanet.spinState})`;
    const tiltDisplay = isMoon && activeMoon
      ? `${activeMoon.axialTiltDeg}°`
      : `${hostPlanet.axialTiltDeg}°`;

    const rockF = isMoon && activeMoon ? activeMoon.rockFrac : hostPlanet.rockFrac;
    const iceF = isMoon && activeMoon ? activeMoon.iceFrac : hostPlanet.iceFrac;
    const gasF = isMoon && activeMoon ? activeMoon.gasFrac : hostPlanet.gasFrac;
    const rPct = (rockF * 100).toFixed(1);
    const iPct = (iceF * 100).toFixed(1);
    const gPct = (gasF * 100).toFixed(1);

    const Teq = isMoon && activeMoon ? activeMoon.T_eq : hostPlanet.T_eq;
    const Tatm = isMoon && activeMoon ? activeMoon.T_atm : hostPlanet.T_atm;
    const Tsurf = isMoon && activeMoon ? activeMoon.surfaceTempK : hostPlanet.surfaceTempK;
    const ghK = isMoon && activeMoon ? activeMoon.greenhouseK : hostPlanet.greenhouseK;
    const muMin = isMoon && activeMoon ? activeMoon.muMin : hostPlanet.muMin;
    const albedo = isMoon && activeMoon ? activeMoon.albedo : hostPlanet.albedo;
    const pBar = isMoon && activeMoon ? activeMoon.pressureBar : hostPlanet.pressureBar;
    const atmoType = isMoon && activeMoon ? activeMoon.atmosphereType : hostPlanet.atmosphereType;
    const gases = isMoon && activeMoon ? activeMoon.gases : hostPlanet.gases;
    const hydro = isMoon && activeMoon ? activeMoon.hydrosphere : hostPlanet.hydrosphere;
    const visualColor =
      isMoon && activeMoon
        ? getMoonVisualColor(activeMoon)
        : getPlanetVisualColor(hostPlanet);

    // Step between planets in this zone
    const planetIndices = zone.bodies
      .map((b, idx) => (b.kind === 'planet' ? idx : -1))
      .filter((idx) => idx !== -1);
    const curPosInPlanets = planetIndices.indexOf(selectedEntity.bodyIdx);
    const prevPlanetBodyIdx =
      curPosInPlanets > 0 ? planetIndices[curPosInPlanets - 1] : null;
    const nextPlanetBodyIdx =
      curPosInPlanets >= 0 && curPosInPlanets < planetIndices.length - 1
        ? planetIndices[curPosInPlanets + 1]
        : null;

    return (
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto"
        onClick={() => setSelectedEntity(null)}
      >
        <div
          className="bg-[#0e131d] border border-sky-500/60 rounded-2xl max-w-4xl w-full p-4 md:p-6 flex flex-col gap-4 shadow-2xl my-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Switcher Bar: Host Planet + All Moons of This Planet + Prev/Next Planet */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5">
              {(() => {
                const inspectorStar =
                  systemResult.hierarchy.stars.find((s) =>
                    zone.title.includes(`Star ${s.label}`)
                  ) || systemResult.hierarchy.stars[0];
                const hostIconUrl = getProceduralPlanetIconDataUrl(
                  hostPlanet,
                  null,
                  inspectorStar?.colorHex || '#fff4e6',
                  inspectorStar?.Teff || 5778,
                  0,
                  56
                );
                return (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedEntity({
                          kind: 'planet',
                          zoneIdx: selectedEntity.zoneIdx,
                          bodyIdx: selectedEntity.bodyIdx,
                        })
                      }
                      className={`px-3 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 cursor-pointer transition ${
                        !isMoon
                          ? 'bg-sky-600 text-white font-bold shadow-md shadow-sky-500/20'
                          : 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <img
                        src={hostIconUrl}
                        alt=""
                        className="w-5 h-5 object-contain -my-1"
                      />
                      <span>
                        Planet #{selectedEntity.bodyIdx + 1} (
                        {shortClassLabel(hostPlanet.planetClass)})
                      </span>
                    </button>

                    {hostPlanet.moons.map((m, mIdx) => {
                      const isThisMoon =
                        isMoon &&
                        selectedEntity.kind === 'moon' &&
                        selectedEntity.moonIdx === mIdx;
                      const mIconUrl = getProceduralPlanetIconDataUrl(
                        hostPlanet,
                        m,
                        inspectorStar?.colorHex || '#fff4e6',
                        inspectorStar?.Teff || 5778,
                        mIdx,
                        36
                      );
                      return (
                        <button
                          key={m.id || mIdx}
                          type="button"
                          onClick={() =>
                            setSelectedEntity({
                              kind: 'moon',
                              zoneIdx: selectedEntity.zoneIdx,
                              bodyIdx: selectedEntity.bodyIdx,
                              moonIdx: mIdx,
                            })
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 cursor-pointer transition ${
                            isThisMoon
                              ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-500/20'
                              : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          <img
                            src={mIconUrl}
                            alt=""
                            className="w-4 h-4 object-contain -my-0.5"
                          />
                          <span>
                            {m.name} ({shortMoonLabel(m.moonClass)})
                          </span>
                        </button>
                      );
                    })}
                  </>
                );
              })()}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={prevPlanetBodyIdx === null}
                onClick={() =>
                  prevPlanetBodyIdx !== null &&
                  setSelectedEntity({
                    kind: 'planet',
                    zoneIdx: selectedEntity.zoneIdx,
                    bodyIdx: prevPlanetBodyIdx,
                  })
                }
                className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-35 text-slate-300 border border-slate-700 text-xs font-mono flex items-center gap-1 cursor-pointer"
                title="Previous Planet in Zone"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </button>
              <button
                type="button"
                disabled={nextPlanetBodyIdx === null}
                onClick={() =>
                  nextPlanetBodyIdx !== null &&
                  setSelectedEntity({
                    kind: 'planet',
                    zoneIdx: selectedEntity.zoneIdx,
                    bodyIdx: nextPlanetBodyIdx,
                  })
                }
                className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-35 text-slate-300 border border-slate-700 text-xs font-mono flex items-center gap-1 cursor-pointer"
                title="Next Planet in Zone"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  openZoneIn3DTheater(
                    selectedEntity.zoneIdx,
                    Math.max(0, curPosInPlanets)
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700 text-xs font-mono flex items-center gap-1 cursor-pointer"
              >
                <Rocket className="w-3.5 h-3.5" />
                3D View
              </button>
              <button
                type="button"
                onClick={() => setSelectedEntity(null)}
                className="p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main World Title & Visual Cross-Section Banner */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#151d2c] p-4 rounded-xl border border-[#2a3852]">
            <div className="flex items-center gap-4">
              {/* 2D Concentric Interior Cross-Section SVG */}
              <svg width="76" height="76" viewBox="0 0 76 76" className="flex-shrink-0">
                {/* Outer Gas / Atmosphere Halo */}
                <circle
                  cx={38}
                  cy={38}
                  r={34}
                  fill={visualColor}
                  fillOpacity={0.22}
                  stroke={visualColor}
                  strokeWidth={1.2}
                />
                {/* Envelope / Hydrosphere Layer */}
                <circle
                  cx={38}
                  cy={38}
                  r={27}
                  fill={
                    gasF > 0.05
                      ? '#a78bfa'
                      : hydro
                      ? hydro.solvent === 'H2SO4'
                        ? '#a3e635'
                        : hydro.solvent === 'SO2'
                        ? '#facc15'
                        : hydro.solvent === 'CO2'
                        ? '#2dd4bf'
                        : hydro.solvent === 'NH3-H2O'
                        ? '#818cf8'
                        : hydro.solvent === 'CH4-C2H6'
                        ? '#fbbf24'
                        : hydro.solvent === 'Silicate Magma'
                        ? '#f97316'
                        : '#0ea5e9'
                      : visualColor
                  }
                  fillOpacity={0.75}
                />
                {/* Ice Mantle Layer */}
                {iceF > 0.03 && (
                  <circle
                    cx={38}
                    cy={38}
                    r={Math.max(12, 25 * Math.pow(rockF + iceF, 0.33))}
                    fill="#67e8f9"
                  />
                )}
                {/* Silicate / Iron Core */}
                <circle
                  cx={38}
                  cy={38}
                  r={Math.max(7, 24 * Math.pow(Math.max(0.05, rockF), 0.33))}
                  fill="#d97706"
                />
              </svg>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-extrabold text-white">{title}</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/15 border border-emerald-400 text-emerald-300">
                    {badgeText}
                  </span>
                </div>
                <p className="text-xs text-sky-400 font-mono mt-1">{subtitle}</p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  Zone: {zone.title} (Type {zone.archetype} · Snow Line {zone.a_snow} AU)
                </p>
              </div>
            </div>
          </div>

          {/* Procedural World Portrait & Surface Vista */}
          <ProceduralPlanetPortrait
            planet={hostPlanet}
            moon={activeMoon}
            zone={zone}
            stars={systemResult.hierarchy.stars}
            bodyIndex={selectedEntity.bodyIdx}
            moonIndex={selectedEntity.kind === 'moon' ? selectedEntity.moonIdx : 0}
          />

          {/* Core Physical & Orbital Telemetry Grid (Identical for Planets & Moons) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 bg-[#151d2c] p-3.5 rounded-xl border border-[#2a3852] font-mono text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Radius</span>
              <b className="text-white">{radDisplay}</b>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Surface Gravity</span>
              <b className="text-sky-300">{gravDisplay}</b>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Bulk Density</span>
              <b className="text-white">{densDisplay}</b>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Orbital Period</span>
              <b className="text-white">{periodDisplay}</b>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Rotation &amp; Spin</span>
              <b className="text-amber-300">{spinDisplay}</b>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Obliquity / Albedo</span>
              <b className="text-white">
                {tiltDisplay} · A={albedo}
              </b>
            </div>
          </div>

          {/* 3-Snow-Line Bulk Composition Bar */}
          <div className="bg-[#151d2c] p-3.5 rounded-xl border border-[#2a3852] flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-slate-300 font-bold uppercase">
                Bulk Interior Mass Fractions (Rock / H2O-CH4-NH3 Ice / H2-He Gas)
              </span>
              <div className="flex gap-4">
                <span className="text-amber-400 font-bold">Rock: {rPct}%</span>
                <span className="text-cyan-300 font-bold">Ice: {iPct}%</span>
                <span className="text-purple-300 font-bold">Gas: {gPct}%</span>
              </div>
            </div>
            <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
              <div className="bg-amber-600 h-full" style={{ width: `${rPct}%` }} />
              <div className="bg-cyan-300 h-full" style={{ width: `${iPct}%` }} />
              <div className="bg-purple-400 h-full" style={{ width: `${gPct}%` }} />
            </div>
          </div>

          {/* Two-Column: Atmosphere & Thermodynamics + Hydrosphere & Satellite System */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Left Box: Atmosphere, Greenhouse & Tidal Heating */}
            <div className="bg-[#151d2c] p-3.5 rounded-xl border-l-4 border-indigo-400 border border-[#2a3852] flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-white uppercase font-mono">
                  Atmosphere &amp; Thermal Balance
                </span>
                <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700 font-mono text-xs font-bold">
                  {pBar !== null
                    ? `${pBar} bar`
                    : !isMoon && hostPlanet.planetClass.includes('Supercritical')
                    ? 'Supercritical Fluid Envelope'
                    : 'Deep Gas Envelope'}
                </span>
              </div>
              <div className="text-xs text-indigo-200 font-semibold">{atmoType}</div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[10px]">Equil / Eff Temp</span>
                  <b className="text-slate-100">
                    {Teq} K{Tatm !== Teq ? ` (T_eff ${Tatm} K)` : ''}
                  </b>
                </div>
                {pBar !== null ? (
                  <>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Greenhouse ΔT</span>
                      <b className="text-amber-300">+{ghK} K</b>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">
                        Surface Temp (T_surf)
                      </span>
                      <b className="text-emerald-300">
                        {Tsurf} K ({Math.round(Tsurf - 273.15)}°C)
                      </b>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Phase Boundary</span>
                      <b className="text-amber-300">No Distinct Surface</b>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">
                        1-Bar Effective Temp (T_atm)
                      </span>
                      <b className="text-emerald-300">
                        {Tatm} K ({Math.round(Tatm - 273.15)}°C)
                      </b>
                    </div>
                  </>
                )}
                <div>
                  <span className="text-slate-400 block text-[10px]">
                    XUV Escape Cutoff (μ_min)
                  </span>
                  <b className="text-slate-200">{muMin} g/mol</b>
                </div>
                {isMoon && activeMoon && (
                  <>
                    <div>
                      <span className="text-slate-400 block text-[10px]">
                        Tidal Dissipation Power
                      </span>
                      <b className="text-orange-300">{activeMoon.tidalW} TW</b>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">
                        Tidal Surface Flux
                      </span>
                      <b className="text-orange-300">{activeMoon.tidalFluxWm2} W/m²</b>
                    </div>
                  </>
                )}
              </div>

              {/* Gas Partial Composition Bars */}
              <div className="flex flex-col gap-1 mt-1">
                <span className="text-[10px] font-mono uppercase text-slate-400">
                  Atmospheric Gas Mole Fractions
                </span>
                {Object.keys(gases).length === 0 ? (
                  <div className="text-xs font-mono text-slate-500">
                    Airless Barren Exosphere (0 bar)
                  </div>
                ) : (
                  Object.entries(gases).map(([gasName, frac]) => {
                    const pct = (frac * 100).toFixed(1);
                    return (
                      <div key={gasName} className="flex items-center gap-2 text-xs font-mono">
                        <span className="w-24 text-sky-300 font-semibold">{gasName}</span>
                        <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sky-400"
                            style={{ width: `${Math.min(100, frac * 100)}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-slate-200">{pct}%</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Box: Hydrosphere Interior & Moons / Host Context */}
            <div className="flex flex-col gap-3">
              {/* Hydrosphere / Surface Liquid / Subsurface Ocean Card */}
              <div className="bg-[#151d2c] p-3.5 rounded-xl border-l-4 border-sky-400 border border-[#2a3852] flex flex-col gap-1.5">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs font-bold text-sky-300 uppercase font-mono">
                    🌊 Hydrosphere &amp; Liquid Phase Structure
                  </span>
                  {hydro?.solvent && (
                    <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-200 border border-sky-700/70 font-mono text-[11px] font-bold">
                      Solvent: {hydro.solvent}
                    </span>
                  )}
                </div>
                {hydro ? (
                  <>
                    <div className="text-xs text-white font-semibold">{hydro.state}</div>
                    {hydro.biosphere && (
                      <div className="px-2.5 py-1 rounded-lg bg-emerald-950/70 border border-emerald-500/60 text-emerald-300 text-xs font-mono font-bold flex items-center gap-1.5">
                        <span>🧬 {hydro.biosphere}</span>
                      </div>
                    )}
                    {hydro.coveragePct !== undefined && hydro.coveragePct > 0 && (
                      <div className="flex flex-col gap-1 mt-0.5">
                        <div className="flex justify-between text-[10px] font-mono text-slate-300">
                          <span>Surface Liquid: {hydro.coveragePct}%</span>
                          <span>Exposed Solid Land: {100 - hydro.coveragePct}%</span>
                        </div>
                        <div className="h-2 w-full bg-amber-800/70 rounded-full overflow-hidden flex border border-slate-800">
                          <div
                            className="h-full bg-sky-400"
                            style={{ width: `${hydro.coveragePct}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 mt-1 text-xs font-mono bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                      <div>
                        <span className="text-slate-400 block text-[10px]">
                          {hydro.liqKm > 0
                            ? hydro.crustKm
                              ? 'Liquid / Ocean Layer'
                              : 'Surface Liquid Depth'
                            : 'Supercritical Fluid'}
                        </span>
                        <b className="text-sky-300">
                          {hydro.liqKm > 0 ? `${hydro.liqKm} km` : `${hydro.scKm} km`}
                        </b>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">
                          {hydro.crustKm
                            ? `Ice Shell (${hydro.crustKm} km) / VI–VII`
                            : 'Ice Shell / VI–VII'}
                        </span>
                        <b className="text-cyan-200">{hydro.iceKm} km</b>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">
                          Superionic XVIII
                        </span>
                        <b className="text-indigo-300">{hydro.siKm} km</b>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-400 font-mono">
                    {iceF >= 0.15
                      ? 'Solid Cryogenic Ice Mantle (No Liquid Layer)'
                      : 'Dry Silicate-Iron Crust & Mantle (No Surface Liquid)'}
                  </div>
                )}
              </div>

              {/* Rings & Interactive Moon Fleet (or Host Planet Link) */}
              <div className="bg-[#151d2c] p-3.5 rounded-xl border border-[#2a3852] flex-1 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-amber-300 uppercase font-mono">
                    🪐 Rings &amp; Satellite System ({hostPlanet.moons.length} Moons)
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    Roche Limit: {hostPlanet.rocheLimitRp} Rp
                  </span>
                </div>

                {hostPlanet.rings && (
                  <div className="text-xs font-mono text-amber-200 bg-amber-950/30 border border-amber-700/50 rounded-lg px-2.5 py-1.5">
                    Ring System: <b>{hostPlanet.rings}</b>
                  </div>
                )}

                {hostPlanet.moons.length === 0 ? (
                  <div className="text-xs font-mono text-slate-500">
                    No major moons retained inside Hill sphere.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {hostPlanet.moons.map((m, mIdx) => {
                      const isCurrMoon =
                        isMoon &&
                        selectedEntity.kind === 'moon' &&
                        selectedEntity.moonIdx === mIdx;
                      return (
                        <button
                          key={m.id || mIdx}
                          type="button"
                          onClick={() =>
                            setSelectedEntity({
                              kind: 'moon',
                              zoneIdx: selectedEntity.zoneIdx,
                              bodyIdx: selectedEntity.bodyIdx,
                              moonIdx: mIdx,
                            })
                          }
                          className={`w-full text-left px-3 py-2 rounded-lg border font-mono text-xs flex items-center justify-between transition cursor-pointer ${
                            isCurrMoon
                              ? 'bg-indigo-950/90 border-indigo-400 text-white'
                              : 'bg-slate-950/70 border-slate-800 hover:bg-slate-900 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: getMoonVisualColor(m) }}
                            />
                            <div className="truncate">
                              <b>{m.name}:</b> {m.moonClass}
                              <div className="text-[10px] text-slate-400">
                                {m.a_Rp} Rp ({m.periodDays}d) · {m.surfaceTempK}K ·{' '}
                                {m.atmosphereType.split('(')[0].trim()}
                              </div>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <span className="text-sky-300 font-bold block">
                              {m.radiusKm} km
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {m.massLunar} M☾ · {m.gravityG}g
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full overflow-y-auto p-3 bg-[#060911] text-slate-100 custom-scrollbar flex flex-col gap-3">
      {/* Compact Top Control & Slider Deck */}
      <div className="bg-[#0e131d] border border-[#2a3852] rounded-xl p-3.5 flex flex-col gap-3 shadow-lg">
        <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
              <span>2D Astrophysical System Map (Steps 1–6)</span>
            </h1>
            {systemResult && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-emerald-500/15 border border-emerald-400 text-emerald-300 font-semibold">
                Roll #{systemResult.roll}: {systemResult.hierarchy.archName} &bull;{' '}
                {systemResult.hierarchy.stars.length} Star(s) &bull; {totalPlanets} Planets &bull;{' '}
                {totalMoons} Moons
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleRollPureIMF}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 border border-sky-400 shadow flex items-center gap-1.5 cursor-pointer transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Roll Pure IMF
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
                <button
                  type="button"
                  onClick={() => openZoneIn3DTheater(0)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border border-cyan-700 flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  3D Theater
                </button>
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
              onClick={() => setShowJsonModal(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#151d2c] hover:bg-[#1e293b] text-slate-100 border border-[#2a3852] flex items-center gap-1 cursor-pointer transition"
            >
              <Code className="w-3.5 h-3.5 text-emerald-400" />
              JSON
            </button>
          </div>
        </div>

        {/* Sliders Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-[11px] font-semibold text-slate-300 uppercase">
              <span>Step 1: System Mass</span>
              <span className="text-sky-400 font-mono">{sysMass} M☉</span>
            </div>
            <input
              type="range"
              min={-1.05}
              max={1.2}
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
              <span>Step 1: System Age</span>
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
              <span>Step 1: Metallicity [Fe/H]</span>
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
              Step 2: Multiplicity
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
              <option value="auto">Auto (Mass-Weighted 1-4)</option>
              <option value="1">Force 1 Star (Unary)</option>
              <option value="2">Force 2 Stars (Binary)</option>
              <option value="3">Force 3 Stars (Trinary)</option>
              <option value="4">Force 4 Stars (Quadruple)</option>
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

      {/* Main Unified 2D System Map Box */}
      {systemResult && (
        <div className="bg-[#0e131d] border border-[#2a3852] rounded-xl p-3.5 flex-1 flex flex-col gap-3 shadow-lg">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase text-sky-400 tracking-wider font-mono">
                Interactive 2D System Map — Click Any Planet, Moon, Belt, or Star to Blow Up Full Details
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
                  Unified System Schematic
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
                  2D Top-Down Orbits
                </button>
              </div>

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

          {/* Render Unified 2D System Map */}
          {mapMode === 'schematic'
            ? renderUnifiedSystemSchematic(systemResult)
            : render2DTopDownOrrery(systemResult)}

          {/* Quick Clickable Summary Strip of All Worlds & Moons */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs font-mono">
            <span className="text-[10px] uppercase text-slate-400 mr-1">
              Quick Jump to World:
            </span>
            {systemResult.zones.map((z, zIdx) =>
              z.bodies.map((b, bIdx) => {
                if (b.kind === 'belt') return null;
                return (
                  <button
                    key={`${zIdx}-${bIdx}`}
                    type="button"
                    onClick={() =>
                      setSelectedEntity({
                        kind: 'planet',
                        zoneIdx: zIdx,
                        bodyIdx: bIdx,
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-[#151d2c] hover:bg-slate-800 border border-[#2a3852] hover:border-sky-400 flex items-center gap-1.5 text-[11px] text-slate-200 cursor-pointer transition"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getPlanetVisualColor(b) }}
                    />
                    <span>
                      #{bIdx + 1} {shortClassLabel(b.planetClass)}
                    </span>
                    {b.moons.length > 0 && (
                      <span className="text-[10px] text-indigo-300 bg-indigo-950/80 px-1.5 rounded">
                        {b.moons.length}☾
                      </span>
                    )}
                    <Maximize2 className="w-2.5 h-2.5 text-slate-400" />
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Click-to-Blow-Up Full Details Modal */}
      {renderBlowUpModal()}

      {/* JSON Export Modal */}
      {showJsonModal && systemResult && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e131d] border border-[#2a3852] rounded-xl max-w-3xl w-full p-4 flex flex-col gap-3 shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-[#2a3852]">
              <span className="text-sm font-bold uppercase text-sky-400 font-mono">
                System JSON Export (Steps 1–6)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-[#151d2c] hover:bg-[#1e293b] border border-[#2a3852] text-emerald-300 flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedJson ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy JSON
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowJsonModal(false)}
                  className="px-2.5 py-1.5 rounded-lg text-xs bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-200 flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  Close
                </button>
              </div>
            </div>
            <textarea
              readOnly
              value={JSON.stringify(systemResult, null, 2)}
              className="w-full h-[55vh] bg-[#07090e] text-emerald-400 border border-[#2a3852] rounded-lg p-3 font-mono text-xs focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* 3D Circumstellar Theater Modal */}
      {theaterStar && (
        <ExpandedSolarSystemTheater
          selectedStar={theaterStar}
          selectedPlanetIndex={theaterPlanetIdx}
          onSelectPlanet={setTheaterPlanetIdx}
          onClose={() => setTheaterStar(null)}
        />
      )}
    </div>
  );
};
