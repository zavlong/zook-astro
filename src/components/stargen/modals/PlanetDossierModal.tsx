import React, { useState, useEffect, useMemo } from 'react';
import {
  Crosshair,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Crown,
  Shield,
  Flag,
  Trash2,
  Compass,
  Globe,
  Map as MapIcon,
  Download,
  Copy,
  Check,
  Sprout,
  ArrowRight,
} from 'lucide-react';
import { PlanetarySurfaceExplorer } from '../surface/PlanetarySurfaceExplorer';
import { PlanetaryChemistrySection } from '../surface/PlanetaryChemistrySection';
import { generatePlantEcosystem } from '../../../core/xenobiology/floraGen';
import {
  ExportFormatType,
  exportSingleEntityInFormat,
} from '../../../core/export/systemFormatExporters';
import {
  RealisticPlanetBody,
  RealisticMoon,
  RealisticStarSystemResult,
  SelectedMapEntity,
  shortClassLabel,
  shortMoonLabel,
  formatSemiMajorAxisKm,
  formatDistanceKm,
} from '../types';
import {
  getMoonVisualColor,
  getPlanetVisualColor,
  sanitizeRealisticSystem,
} from '../../../core/generation/realisticStarGen';
import {
  resolvePlanetClass,
  resolveMoonClass,
  deriveAtmosphereClassification,
  formatSolventName,
} from '../../../core/astrophysics/classifier';
import {
  ProceduralPlanetPortrait,
  getProceduralPlanetIconDataUrl,
} from '../ProceduralPlanetPortrait';
import {
  SectorEmpire,
  ColonyDesignation,
} from '../../../core/generation/empireGen';

export const COLONY_DESIGNATIONS: { id: ColonyDesignation; label: string; icon: string; desc: string }[] = [
  { id: 'Capital', label: 'Imperial Capital', icon: '👑', desc: 'Central administrative throne world of the empire' },
  { id: 'Colony', label: 'Planetary Colony', icon: '🚀', desc: 'General civilian settlement and population center' },
  { id: 'Mining Outpost', label: 'Mining Outpost', icon: '⛏️', desc: 'Resource extraction and deep crustal refineries' },
  { id: 'Research Station', label: 'Research Station', icon: '🧪', desc: 'Planetary science labs, observatories, and xenology' },
  { id: 'Industrial Hub', label: 'Industrial Hub', icon: '🏭', desc: 'Heavy manufacturing, orbital foundries, and shipyards' },
  { id: 'Agri-World', label: 'Agri-World', icon: '🌾', desc: 'Hydroponics, vast planetary farms, and biosphere harvests' },
];

import { PlanetarySurfaceTarget } from '../../surface/PlanetarySurfaceApp';

interface PlanetDossierModalProps {
  selectedEntity: Extract<SelectedMapEntity, { kind: 'planet' | 'moon' }>;
  systemResult: RealisticStarSystemResult;
  onSelectEntity: (entity: SelectedMapEntity) => void;
  onTrackInOrrery: (entity: SelectedMapEntity) => void;
  onClose: () => void;
  currentEmpire?: SectorEmpire | null;
  sectorEmpires?: SectorEmpire[];
  planetClaimInfo?: {
    empire: SectorEmpire;
    key: string;
    designation: ColonyDesignation;
  } | null;
  onToggleClaimPlanet?: (designation?: ColonyDesignation, empireId?: string) => void;
  onOpenSurfaceGen?: (target: PlanetarySurfaceTarget) => void;
}

export const PlanetDossierModal: React.FC<PlanetDossierModalProps> = ({
  selectedEntity,
  systemResult,
  onSelectEntity,
  onTrackInOrrery,
  onClose,
  currentEmpire,
  sectorEmpires = [],
  planetClaimInfo,
  onToggleClaimPlanet,
  onOpenSurfaceGen,
}) => {
  const [selectedDesignation, setSelectedDesignation] = useState<ColonyDesignation>(
    planetClaimInfo?.designation || 'Colony'
  );
  const [targetEmpireId, setTargetEmpireId] = useState<string>(
    planetClaimInfo?.empire?.id || currentEmpire?.id || (sectorEmpires[0]?.id ?? '')
  );
  const [activeTab, setActiveTab] = useState<'overview' | 'surface'>('overview');
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormatType>('spaceengine');
  const [copiedExport, setCopiedExport] = useState(false);

  useEffect(() => {
    if (planetClaimInfo?.designation) {
      setSelectedDesignation(planetClaimInfo.designation);
    }
    if (planetClaimInfo?.empire?.id) {
      setTargetEmpireId(planetClaimInfo.empire.id);
    } else if (currentEmpire?.id) {
      setTargetEmpireId(currentEmpire.id);
    } else if (sectorEmpires[0]?.id) {
      setTargetEmpireId(sectorEmpires[0].id);
    }
  }, [planetClaimInfo, currentEmpire, sectorEmpires]);

  sanitizeRealisticSystem(systemResult);
  const zone = systemResult.zones[selectedEntity.zoneIdx];
  const hostPlanet = zone?.bodies[selectedEntity.bodyIdx] as RealisticPlanetBody | undefined;
  if (!zone || !hostPlanet || hostPlanet.kind !== 'planet') return null;

  const isMoon = selectedEntity.kind === 'moon';
  const activeMoon: RealisticMoon | null =
    isMoon && hostPlanet.moons[selectedEntity.moonIdx]
      ? hostPlanet.moons[selectedEntity.moonIdx]
      : null;

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
  const albedo = isMoon && activeMoon ? activeMoon.albedo : hostPlanet.albedo;
  const pBar = isMoon && activeMoon ? activeMoon.pressureBar : hostPlanet.pressureBar;
  const gases = isMoon && activeMoon ? activeMoon.gases : hostPlanet.gases;
  const hydro = isMoon && activeMoon ? activeMoon.hydrosphere : hostPlanet.hydrosphere;
  const magField = isMoon && activeMoon ? activeMoon.magneticField : hostPlanet.magneticField;
  const sysAge = systemResult?.step1?.age ?? 4.5;

  const planetEcosystem = useMemo(() => {
    const seed = isMoon && activeMoon
      ? Math.round(activeMoon.radiusKm * 31 + (activeMoon.surfaceTempK || 200))
      : Math.round(hostPlanet.a * 1000 + hostPlanet.massEarth * 100);
    return generatePlantEcosystem({
      seed,
      hasBiosphere: Boolean(hydro?.biosphere),
      biosphereDescription: hydro?.biosphere || undefined,
      systemAgeGyr: sysAge,
      starTeff: systemResult.hierarchy.stars[0]?.Teff,
      gravityG: isMoon && activeMoon ? activeMoon.gravityG : hostPlanet.gravityG,
      pressureBar: pBar,
      solventKey: hydro?.solvent || 'H2O',
      hasLiquid: hydro?.coveragePct !== undefined ? hydro.coveragePct > 0 : true,
    });
  }, [isMoon, activeMoon, hostPlanet, hydro, sysAge, systemResult, pBar]);

  const tauIR =
    ghK > 0 && Tatm > 10 ? Math.max(0.01, (4 / 3) * (Math.pow(Tsurf / Tatm, 4) - 1)) : 0;

  const effT = Tsurf ?? Tatm ?? Teq;
  const cleanPlanetClass = resolvePlanetClass(
    hostPlanet.planetClass,
    effT,
    hydro,
    hostPlanet.massEarth,
    iceF,
    hostPlanet.planetClass.includes('Chthonian'),
    hostPlanet.gasFrac >= 0.015 || hostPlanet.massEarth >= 15,
    pBar,
    gases
  );

  const cleanMoonClass = activeMoon
    ? resolveMoonClass(
        activeMoon.moonClass,
        effT,
        hydro,
        iceF,
        activeMoon.massEarth ?? 0.01,
        pBar,
        gases
      )
    : '';

  const isGasGiant = !isMoon && (hostPlanet.gasFrac >= 0.015 || hostPlanet.massEarth >= 15);
  const isSupercritical = isMoon
    ? Boolean(activeMoon && (activeMoon.moonClass.includes('Supercritical') || activeMoon.moonClass.includes('Steam')))
    : Boolean(
        hydro?.solvent === 'Supercritical H2O' ||
        Boolean(hydro?.state?.includes('Supercritical')) ||
        cleanPlanetClass.includes('Supercritical') ||
        cleanPlanetClass.includes('Steam') ||
        cleanPlanetClass.includes('Water Giant')
      );
  const hasNoSurface = isMoon
    ? false
    : Boolean(
        isGasGiant ||
        isSupercritical ||
        hydro?.state?.toLowerCase().includes('no surface') ||
        cleanPlanetClass.includes('Supercritical') ||
        cleanPlanetClass.includes('Water Giant') ||
        cleanPlanetClass.includes('Steam')
      );
  const cleanAtmoClassification = deriveAtmosphereClassification(pBar, gases, isGasGiant, isSupercritical);

  const title = isMoon && activeMoon
    ? `Planet #${selectedEntity.bodyIdx + 1} ${activeMoon.name}: ${cleanMoonClass}`
    : `Planet #${selectedEntity.bodyIdx + 1}: ${cleanPlanetClass}`;

  const subtitle = isMoon && activeMoon
    ? `a = ${formatSemiMajorAxisKm(activeMoon.a_km)} · e = ${activeMoon.e} · inc = ${activeMoon.incDeg}°${
        activeMoon.retrograde ? ' [Retrograde]' : ''
      }`
    : `a = ${hostPlanet.a} AU · e = ${hostPlanet.e} · inc = ${hostPlanet.incDeg ?? 0}°`;

  const moonMassLunar = activeMoon
    ? activeMoon.massLunar > 0
      ? activeMoon.massLunar
      : +(activeMoon.massEarth / 0.0123000371).toPrecision(3)
    : 0;

  const massDisplay = isMoon && activeMoon
    ? moonMassLunar < 1
      ? `${moonMassLunar} M☾`
      : `${moonMassLunar} M☾ (${activeMoon.massEarth} M⊕)`
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
    ? activeMoon.periodDays >= 365
      ? `${activeMoon.periodDays} d (${(activeMoon.periodDays / 365.25).toFixed(2)} yr)`
      : `${activeMoon.periodDays} d`
    : `${hostPlanet.orbitalPeriodDays} d (${(hostPlanet.orbitalPeriodDays / 365.25).toFixed(2)} yr)`;

  const isLocked = isMoon && activeMoon
    ? activeMoon.spinState.toLowerCase().includes('tidally locked') || activeMoon.spinState.includes('1:1')
    : hostPlanet.spinState.toLowerCase().includes('tidally locked') || hostPlanet.spinState.includes('1:1');

  const spinDisplay = isLocked
    ? '1:1 Tidally Locked'
    : isMoon && activeMoon
    ? `${activeMoon.rotationHours} h`
    : `${hostPlanet.rotationHours} h`;

  const tiltDisplay = isMoon && activeMoon
    ? `${activeMoon.axialTiltDeg}°`
    : `${hostPlanet.axialTiltDeg}°`;

  const visualColor =
    isMoon && activeMoon
      ? getMoonVisualColor(activeMoon)
      : getPlanetVisualColor(hostPlanet);

  const planetIndices = zone.bodies
    .map((b, idx) => (b.kind === 'planet' ? idx : -1))
    .filter((idx) => idx !== -1);
  const curPosInPlanets = planetIndices.indexOf(selectedEntity.bodyIdx);
  const prevPlanetBodyIdx = curPosInPlanets > 0 ? planetIndices[curPosInPlanets - 1] : null;
  const nextPlanetBodyIdx =
    curPosInPlanets >= 0 && curPosInPlanets < planetIndices.length - 1
      ? planetIndices[curPosInPlanets + 1]
      : null;

  const inspectorStar =
    systemResult.hierarchy.stars.find((s) => zone.title.includes(`Star ${s.label}`)) ||
    systemResult.hierarchy.stars[0];
  const hostIconUrl = getProceduralPlanetIconDataUrl(
    hostPlanet,
    null,
    inspectorStar?.colorHex || '#fff4e6',
    inspectorStar?.Teff || 5778,
    0,
    44
  );
  const activeIconUrl =
    isMoon && activeMoon
      ? getProceduralPlanetIconDataUrl(
          hostPlanet,
          activeMoon,
          inspectorStar?.colorHex || '#fff4e6',
          inspectorStar?.Teff || 5778,
          selectedEntity.moonIdx,
          76
        )
      : getProceduralPlanetIconDataUrl(
          hostPlanet,
          null,
          inspectorStar?.colorHex || '#fff4e6',
          inspectorStar?.Teff || 5778,
          0,
          76
        );

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="bg-[#0e131d] border border-sky-500/60 rounded-2xl max-w-4xl w-full p-5 flex flex-col gap-4 shadow-2xl max-h-[92vh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-800 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onSelectEntity({
                  kind: 'planet',
                  zoneIdx: selectedEntity.zoneIdx,
                  bodyIdx: selectedEntity.bodyIdx,
                })
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 cursor-pointer transition ${
                !isMoon
                  ? 'bg-sky-600 text-white font-bold shadow-md shadow-sky-500/20'
                  : 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'
              }`}
            >
              <img src={hostIconUrl} alt="" className="w-5 h-5 object-contain -my-1" />
              <span>
                Planet #{selectedEntity.bodyIdx + 1} ({shortClassLabel(hostPlanet.planetClass)})
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
                    onSelectEntity({
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
                  <img src={mIconUrl} alt="" className="w-4 h-4 object-contain -my-0.5" />
                  <span>
                    {m.name} ({shortMoonLabel(m.moonClass)})
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={prevPlanetBodyIdx === null}
              onClick={() =>
                prevPlanetBodyIdx !== null &&
                onSelectEntity({
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
                onSelectEntity({
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
              onClick={() => onTrackInOrrery(selectedEntity)}
              className="px-2.5 py-1 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700 text-xs font-mono flex items-center gap-1 cursor-pointer transition shadow-sm"
              title="Lock camera on this body and track its orbit in 3D Orrery"
            >
              <Crosshair className="w-3.5 h-3.5 text-indigo-400" />
              Track Orbit
            </button>
            <button
              type="button"
              onClick={() => setShowExportPanel((v) => !v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono flex items-center gap-1 cursor-pointer transition shadow-sm border ${
                showExportPanel
                  ? 'bg-emerald-900/80 text-emerald-200 border-emerald-500'
                  : 'bg-slate-900 hover:bg-slate-800 text-emerald-300 border-slate-700'
              }`}
              title="Export this world in Stargen (.json), SpaceEngine (.sc), or Stellaris (.txt) format"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Collapsible Multi-Format World Exporter (Stargen / SpaceEngine / Stellaris) */}
        {showExportPanel && (() => {
          const exported = exportSingleEntityInFormat(
            systemResult,
            selectedEntity.zoneIdx,
            selectedEntity.bodyIdx,
            selectedEntity.kind === 'moon' ? selectedEntity.moonIdx : null,
            exportFormat
          );
          return (
            <div className="bg-[#0c121d] p-3.5 rounded-xl border border-emerald-700/60 flex flex-col gap-2.5 font-mono text-xs shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
                    Export World Telemetry:
                  </span>
                  <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                    {(
                      [
                        { id: 'stargen', label: 'Stargen (.json)' },
                        { id: 'spaceengine', label: 'SpaceEngine (.sc)' },
                        { id: 'stellaris', label: 'Stellaris (.txt)' },
                      ] as { id: ExportFormatType; label: string }[]
                    ).map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setExportFormat(fmt.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                          exportFormat === fmt.id
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(exported.content);
                      setCopiedExport(true);
                      setTimeout(() => setCopiedExport(false), 1800);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedExport ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedExport ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([exported.content], { type: exported.mimeType });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = exported.filename;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-200 border border-emerald-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download {exported.filename}
                  </button>
                </div>
              </div>
              <p className="text-[10.5px] text-slate-400">
                {exportFormat === 'stargen'
                  ? 'Raw Stargen astrophysical JSON object for this body.'
                  : exportFormat === 'spaceengine'
                  ? 'SpaceEngine .sc script block with derived procedural Surface/Clouds/Ocean/Atmosphere/Aurora/Orbit parameters; unused Stargen telemetry and inactive blocks are commented out (//).'
                  : 'Stellaris planet/moon initializer block with scaled size and orbit_distance; unused Stargen astrophysical fields are commented out (#).'}
              </p>
              <textarea
                readOnly
                value={exported.content}
                rows={12}
                className="w-full p-2.5 rounded-lg bg-[#070b12] border border-slate-800 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          );
        })()}

        {/* Main World Title & Visual Banner */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#151d2c] p-4 rounded-xl border border-[#2a3852]">
          <div className="flex items-center gap-4">
            <img
              src={activeIconUrl}
              alt=""
              onDoubleClick={() => {
                if (onOpenSurfaceGen) {
                  onClose();
                  onOpenSurfaceGen({
                    planet: hostPlanet,
                    moon: activeMoon,
                    zone,
                    stars: systemResult.hierarchy.stars,
                  });
                } else {
                  setActiveTab('surface');
                }
              }}
              title="Double-click to open full Planetary Surface Generator"
              className="w-16 h-16 object-contain flex-shrink-0 drop-shadow-[0_0_14px_rgba(56,189,248,0.3)] cursor-pointer hover:scale-105 transition-transform"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: visualColor }} />
                <h2 className="text-lg font-bold text-white font-mono">{title}</h2>
                {isMoon && (
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-700">
                    Moon of #{selectedEntity.bodyIdx + 1}
                  </span>
                )}
              </div>
              <p className="text-xs text-sky-400 font-mono mt-0.5">{subtitle}</p>
            </div>
          </div>

          <div
            className={`grid ${
              +gPct > 0 ? 'grid-cols-3' : 'grid-cols-2'
            } gap-3 bg-[#0c121d] p-2.5 rounded-lg border border-slate-800 text-center font-mono text-[11px] w-full md:w-auto`}
          >
            <div>
              <span className="text-slate-400 block text-[9px]">ROCK</span>
              <b className="text-slate-200">{rPct}%</b>
            </div>
            <div>
              <span className="text-slate-400 block text-[9px]">ICE</span>
              <b className="text-sky-300">{iPct}%</b>
            </div>
            {+gPct > 0 && (
              <div>
                <span className="text-slate-400 block text-[9px]">GAS</span>
                <b className="text-amber-300">{gPct}%</b>
              </div>
            )}
          </div>
        </div>

        {/* Dossier Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg border font-mono text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Overview & Telemetry
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('surface')}
            className={`px-3 py-1.5 rounded-lg border font-mono text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'surface'
                ? 'bg-amber-950/80 border-amber-500 text-amber-200'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5 text-amber-400" />
            Surface & Topography
          </button>
        </div>

        {activeTab === 'surface' ? (
          <PlanetarySurfaceExplorer
            planet={hostPlanet}
            moon={activeMoon}
            zone={zone}
            stars={systemResult.hierarchy.stars}
          />
        ) : (
          <>
            {/* Procedural 3D World Portrait & Surface Horizon Vista */}
        <ProceduralPlanetPortrait
          planet={hostPlanet}
          moon={activeMoon}
          zone={zone}
          stars={systemResult.hierarchy.stars}
          bodyIndex={selectedEntity.bodyIdx}
          moonIndex={isMoon ? selectedEntity.moonIdx : 0}
          onOpenSurfaceGen={() => {
            if (onOpenSurfaceGen) {
              onClose();
              onOpenSurfaceGen({
                planet: hostPlanet,
                moon: activeMoon,
                zone,
                stars: systemResult.hierarchy.stars,
              });
            } else {
              setActiveTab('surface');
            }
          }}
        />

        {/* Primary Astrophysical Telemetry Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-[#151d2c] p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
          <div>
            <span className="text-slate-400 block text-[10px]">Mass</span>
            <b className="text-white text-sm">{massDisplay}</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Radius</span>
            <b className="text-white text-sm">{radDisplay}</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Gravity</span>
            <b className="text-white text-sm">{gravDisplay}</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Density</span>
            <b className="text-sky-300 text-sm">{densDisplay}</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">{isMoon ? 'Month' : 'Year'}</span>
            <b className="text-emerald-300 text-sm">{periodDisplay}</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Day</span>
            <b className="text-white text-sm">{spinDisplay}</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Axial Tilt</span>
            <b className="text-white text-sm">{tiltDisplay}</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Albedo</span>
            <b className="text-sky-300 text-sm">{albedo}</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Equilibrium Temp</span>
            <b className="text-white text-sm">{Teq} K</b>
            <span className="text-[10px] text-slate-500 block">{(Teq - 273.15).toFixed(1)}°C</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">
              {hasNoSurface ? 'Atmosphere Temp' : 'Surface Temperature'}
            </span>
            <b className="text-emerald-300 text-sm">{Tsurf} K</b>
            <span className="text-[10px] text-emerald-400 block font-bold">
              {(Tsurf - 273.15).toFixed(1)}°C
            </span>
          </div>
        </div>

        {/* Atmosphere & Hydrosphere Classification */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-[#151d2c] p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2.5 font-mono text-xs">
            <span className="text-xs font-bold text-sky-300 uppercase tracking-wider">
              Atmosphere
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <span className="text-slate-400 block text-[10px]">CLASSIFICATION</span>
                <b className="text-white">{cleanAtmoClassification.replace(/airless vacuum/gi, 'Vacuum')}</b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">SURFACE PRESSURE</span>
                <b className="text-sky-300">
                  {pBar !== null
                    ? `${pBar} bar`
                    : isSupercritical
                    ? '>220 bar (Supercritical Fluid)'
                    : isGasGiant
                    ? 'None (Continuous Envelope)'
                    : 'Vacuum (0 bar)'}
                </b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">GREENHOUSE EFFECT</span>
                <b className="text-amber-300">
                  {ghK > 0 ? `+${ghK.toFixed(1)} K` : 'None'}
                </b>
                {tauIR > 0 && (
                  <span className="text-[9px] text-slate-400 block">
                    τ_IR: {tauIR < 100 ? tauIR.toFixed(2) : Math.round(tauIR)}
                  </span>
                )}
              </div>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] mb-1">
                COMPOSITION (BY VOLUME FRACTION)
              </span>
              {Object.keys(gases).length === 0 ? (
                <span className="text-slate-500 italic">Vacuum</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(gases).map(([gas, frac]) => (
                    <span
                      key={gas}
                      className="px-2 py-0.5 rounded bg-[#0d131f] border border-slate-700 text-slate-200 text-[11px]"
                    >
                      <b>{gas}:</b> {(frac * 100).toFixed(1)}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#151d2c] p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2.5 font-mono text-xs">
            <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
              Hydrosphere
            </span>
            {hydro ? (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-slate-400 block text-[10px]">LIQUID COVERAGE</span>
                  <b className="text-white">
                    {hydro.coveragePct !== undefined ? `${hydro.coveragePct}%` : '100%'}
                  </b>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">MEAN DEPTH</span>
                  <b className="text-cyan-300">
                    {hydro.liqKm > 0
                      ? `${hydro.liqKm.toLocaleString()} km`
                      : hydro.scKm > 0
                      ? `${hydro.scKm.toLocaleString()} km`
                      : '< 1 km'}
                  </b>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">COMPOSITION</span>
                  <b className="text-emerald-300">{formatSolventName(hydro.solvent)}</b>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 italic flex items-center h-full">
                No surface liquid
              </div>
            )}
          </div>
        </div>

        {/* Surface & Internal Geochemistry Composition Tables */}
        <PlanetaryChemistrySection planet={hostPlanet} moon={activeMoon} />

        {/* Dedicated Biosphere Section for bodies with life */}
        {hydro?.biosphere && (
          <div className="bg-[#151d2c] p-3.5 rounded-xl border border-emerald-500/50 flex flex-col gap-2.5 font-mono text-xs shadow-lg shadow-emerald-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Biosphere & Evolutionary Complexity
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-900/60 border border-emerald-500/60 text-emerald-300">
                {sysAge >= 3.0 ? '🧬 Multicellular Life' : '🦠 Unicellular Life'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-[#0c121d] p-2.5 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-400 block text-[10px]">EVOLUTIONARY STAGE</span>
                <b className={sysAge >= 3.0 ? 'text-emerald-300' : 'text-teal-300'}>
                  {sysAge >= 3.0 ? 'Multicellular (Complex Organisms)' : 'Unicellular (Microbial Biosphere)'}
                </b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">SYSTEM EVOLUTION AGE</span>
                <b className="text-white">{sysAge.toFixed(2)} Gyr</b>
                <span className="text-[9px] text-slate-500 block">
                  {sysAge >= 3.0 ? '≥ 3.0 Gyr (Multicellular Met)' : '< 3.0 Gyr (Microbial Phase)'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">BIOCHEMISTRY SOLVENT</span>
                <b className="text-sky-300">{formatSolventName(hydro.solvent)}</b>
              </div>
            </div>

            <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/40 rounded-lg">
              <span className="text-slate-400 block text-[10px] mb-0.5">ECOSYSTEM SUMMARY</span>
              <p className="text-emerald-200 text-xs leading-relaxed">{hydro.biosphere}</p>
            </div>

            {/* Brief Indigenous Plant Life & Xenoflora Summary */}
            {planetEcosystem.hasPlantLife && (
              <div className="bg-[#0c121d] p-2.5 rounded-lg border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Sprout className="w-3.5 h-3.5 text-emerald-400" />
                    Indigenous Plant Life & Autotrophs
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 border border-emerald-500/50 text-emerald-300">
                    {planetEcosystem.totalSpeciesCount} Taxa Cataloged
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                  <div>
                    <span className="text-slate-500 block text-[9px]">DOMINANT PIGMENT</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/30 flex-shrink-0"
                        style={{ backgroundColor: planetEcosystem.dominantPigmentHex }}
                      />
                      <b className="text-white truncate" title={planetEcosystem.dominantPigment}>
                        {planetEcosystem.dominantPigment.split('(')[0].trim()}
                      </b>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">PHOTOTROPHY</span>
                    <b className="text-emerald-300 block truncate mt-0.5" title={planetEcosystem.photosynthesisType}>
                      {planetEcosystem.photosynthesisType}
                    </b>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">
                      {planetEcosystem.isMulticellular ? 'CANOPY HEIGHT' : 'FLORA PROFILE'}
                    </span>
                    <b className="text-sky-300 block mt-0.5">
                      {planetEcosystem.isMulticellular
                        ? `Up to ${planetEcosystem.canopyHeightRangeM.max}m`
                        : 'Colored Soil Crust (<5cm)'}
                    </b>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">STRUCTURE</span>
                    <b className="text-amber-200 block truncate mt-0.5" title={planetEcosystem.structuralBase}>
                      {planetEcosystem.structuralBase}
                    </b>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/80 text-[10px]">
                  <span className="text-slate-400">
                    {planetEcosystem.isMulticellular
                      ? `Gravity-scaled morphology (${(isMoon && activeMoon ? activeMoon.gravityG : hostPlanet.gravityG).toFixed(2)}g)`
                      : 'Unicellular autotrophs forming colored algal plains & soil biofilms'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('surface')}
                    className="flex items-center gap-1 text-emerald-300 hover:text-emerald-200 font-bold transition hover:underline cursor-pointer"
                  >
                    <span>View Species Table in Surface View</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Magnetosphere & Core Dynamo Section */}
        {magField && (
          <div className="bg-[#151d2c] p-3.5 rounded-xl border border-indigo-500/40 flex flex-col gap-2.5 font-mono text-xs shadow-lg shadow-indigo-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-indigo-400" />
                Magnetosphere &amp; Dynamo
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                  magField.hasActiveDynamo
                    ? 'bg-indigo-900/60 border-indigo-500/60 text-indigo-300'
                    : 'bg-slate-900/80 border-slate-700 text-slate-400'
                }`}
              >
                {magField.hasActiveDynamo ? 'Active Dynamo' : 'Extinct / Inactive'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#0c121d] p-2.5 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-400 block text-[10px]">SURFACE FIELD</span>
                <b className="text-white">
                  {magField.surfaceFieldGauss >= 0.01
                    ? `${magField.surfaceFieldGauss} G`
                    : '< 0.01 G'}
                </b>
                <span className="text-[9px] text-indigo-300 block">
                  {magField.surfaceFieldMicroTesla >= 0.1
                    ? `${magField.surfaceFieldMicroTesla} μT`
                    : '< 0.1 μT'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">MAGNETIC MOMENT</span>
                <b className="text-indigo-300">
                  {magField.magneticMomentEarth >= 0.01
                    ? `${magField.magneticMomentEarth} M⊕`
                    : '< 0.01 M⊕'}
                </b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">MAGNETOPAUSE</span>
                <b className="text-cyan-300">
                  {magField.hasActiveDynamo
                    ? `${Math.round(
                        magField.magnetopauseRadiusRp *
                          (isMoon && activeMoon ? activeMoon.radiusKm : hostPlanet.radiusEarth * 6371)
                      ).toLocaleString()} km`
                    : 'None'}
                </b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">SURFACE RADIATION</span>
                <b
                  className={
                    magField.radiationLevel === 'Minimal'
                      ? 'text-emerald-400'
                      : magField.radiationLevel === 'Moderate'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }
                >
                  {magField.radiationLevel}
                </b>
                <span className="text-[9px] text-slate-400 block">
                  {magField.shieldingEfficiencyPct}% Shielded
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#0c121d] p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">CORE &amp; DYNAMO</span>
                <b className="text-slate-200">{magField.dynamoStatus}</b>
              </div>
              <div className="bg-[#0c121d] p-2 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">AURORAE</span>
                <b className="text-cyan-300">{magField.auroraDescription}</b>
              </div>
            </div>

            <div className="p-2.5 bg-indigo-950/30 border border-indigo-500/30 rounded-lg text-xs leading-relaxed text-indigo-200">
              {magField.biosphereImplication}
            </div>
          </div>
        )}

        {/* ============================================================================ */}
        {/* IMPERIAL SOVEREIGNTY & COLONY ADMINISTRATION CARD                           */}
        {/* ============================================================================ */}
        {(!isMoon || planetClaimInfo) && (
          <div
            className="p-3.5 rounded-xl border font-mono text-xs flex flex-col gap-2.5 transition shadow-lg"
            style={{
              backgroundColor: planetClaimInfo ? `${planetClaimInfo.empire.color}15` : '#131a26',
              borderColor: planetClaimInfo ? `${planetClaimInfo.empire.color}60` : '#1e293b',
            }}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <span
                className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                style={{ color: planetClaimInfo ? planetClaimInfo.empire.color : '#94a3b8' }}
              >
                {planetClaimInfo ? (
                  <Crown className="w-4 h-4" />
                ) : (
                  <Shield className="w-4 h-4 text-slate-400" />
                )}
                Imperial Sovereignty &amp; Colony Administration
              </span>

              {planetClaimInfo ? (
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold border"
                  style={{
                    color: planetClaimInfo.empire.color,
                    borderColor: `${planetClaimInfo.empire.color}60`,
                    backgroundColor: `${planetClaimInfo.empire.color}25`,
                  }}
                >
                  {planetClaimInfo.designation === 'Capital' ? '👑 Capital World' : `🚩 ${planetClaimInfo.designation}`}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] text-slate-400 bg-slate-900 border border-slate-800">
                  Unclaimed Celestial Body
                </span>
              )}
            </div>

            {planetClaimInfo ? (
              <div className="space-y-3">
                {/* Ruling Empire Info */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{planetClaimInfo.empire.phenotype.icon}</span>
                    <div>
                      <div className="font-bold text-white text-xs flex items-center gap-1.5">
                        <span>{planetClaimInfo.empire.name}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {planetClaimInfo.empire.government?.icon} {planetClaimInfo.empire.government?.name || 'Empire'} · {planetClaimInfo.empire.phenotype.name}
                      </div>
                    </div>
                  </div>

                  {planetClaimInfo.empire.ethics && (
                    <div className="flex flex-wrap gap-1">
                      {planetClaimInfo.empire.ethics.map((eth) => (
                        <span
                          key={eth.id}
                          className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700/80 text-[10px] text-slate-300 flex items-center gap-1"
                          title={eth.description}
                        >
                          <span>{eth.icon}</span>
                          <span>{eth.name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Change Colony Designation */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800/80 items-center">
                  <div>
                    <label className="text-slate-400 block text-[10px] uppercase font-semibold mb-1">
                      Colony Classification &amp; Focus
                    </label>
                    <select
                      value={selectedDesignation}
                      onChange={(e) => {
                        const newDes = e.target.value as ColonyDesignation;
                        setSelectedDesignation(newDes);
                        if (onToggleClaimPlanet) {
                          onToggleClaimPlanet(newDes, planetClaimInfo.empire.id);
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-sky-400"
                    >
                      {COLONY_DESIGNATIONS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.icon} {d.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end justify-end">
                    {onToggleClaimPlanet && (
                      <button
                        type="button"
                        onClick={() => onToggleClaimPlanet(undefined, planetClaimInfo.empire.id)}
                        className="w-full sm:w-auto py-1.5 px-3 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title="Relinquish sovereignty over this world"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Relinquish Planet Claim</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Unclaimed UI */
              <div className="space-y-3">
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  This world has no active colony charter. An established interstellar empire can claim this body and commission an orbital colony or planetary outpost.
                </p>

                {sectorEmpires.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-800/80">
                    {/* Empire selection if multiple */}
                    <div>
                      <label className="text-slate-400 block text-[10px] uppercase font-semibold mb-1">
                        Sovereign Empire
                      </label>
                      <select
                        value={targetEmpireId}
                        onChange={(e) => setTargetEmpireId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-sky-400"
                      >
                        {sectorEmpires.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.phenotype.icon} {emp.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Designation selection */}
                    <div>
                      <label className="text-slate-400 block text-[10px] uppercase font-semibold mb-1">
                        Colony Charter
                      </label>
                      <select
                        value={selectedDesignation}
                        onChange={(e) => setSelectedDesignation(e.target.value as ColonyDesignation)}
                        className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-sky-400"
                      >
                        {COLONY_DESIGNATIONS.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.icon} {d.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Claim Button */}
                    <div className="flex items-end">
                      {onToggleClaimPlanet && (
                        <button
                          type="button"
                          onClick={() => onToggleClaimPlanet(selectedDesignation, targetEmpireId)}
                          className="w-full py-1.5 px-3 rounded-lg text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer hover:brightness-110 active:scale-95"
                          style={{
                            backgroundColor:
                              sectorEmpires.find((e) => e.id === targetEmpireId)?.color || '#10b981',
                          }}
                        >
                          <Flag className="w-3.5 h-3.5" />
                          <span>Establish Colony</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-[10.5px] text-slate-500 italic p-2 rounded bg-slate-900/60 border border-slate-800">
                    No active empires detected in this sector. Spawn an empire on a habitable world in Sector Hex View to begin establishing planetary claims.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Planetary Ring System (Micro-Belt) */}
        {!isMoon && hostPlanet.ringSystem && (
          <div className="bg-[#151d2c] p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2.5 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                Planetary Ring System (Micro-Belt)
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/60 border border-amber-700/60 text-amber-200">
                {hostPlanet.ringSystem.ringClass}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#0c121d] p-2.5 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-400 block text-[10px]">INNER RADIUS</span>
                <b className="text-white">{formatDistanceKm(hostPlanet.ringSystem.innerRadiusKm)}</b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">OUTER RADIUS</span>
                <b className="text-amber-300">{formatDistanceKm(hostPlanet.ringSystem.outerRadiusKm)}</b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">RING MASS</span>
                <b className="text-sky-300">
                  {hostPlanet.ringSystem.massLunar} M☾
                </b>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">COMPOSITION</span>
                <b className="text-emerald-300">{hostPlanet.ringSystem.compositionLabel}</b>
              </div>
            </div>
          </div>
        )}

        {/* Moons Sub-Inspector List */}
        {!isMoon && hostPlanet.moons.length > 0 && (
          <div className="bg-[#151d2c] p-3.5 rounded-xl border border-slate-800 flex flex-col gap-2 font-mono text-xs">
            <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
              Natural Satellites & Moons ({hostPlanet.moons.length})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {hostPlanet.moons.map((m, mIdx) => (
                <button
                  key={m.id || mIdx}
                  type="button"
                  onClick={() =>
                    onSelectEntity({
                      kind: 'moon',
                      zoneIdx: selectedEntity.zoneIdx,
                      bodyIdx: selectedEntity.bodyIdx,
                      moonIdx: mIdx,
                    })
                  }
                  className="w-full text-left px-3 py-2 rounded-lg border font-mono text-xs flex items-center justify-between transition cursor-pointer bg-slate-950/70 border-slate-800 hover:bg-slate-900 text-slate-200"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getMoonVisualColor(m) }}
                    />
                    <div className="truncate">
                      <b>{m.name}:</b> {m.moonClass}
                      <div className="text-[10px] text-slate-400">
                        {formatSemiMajorAxisKm(m.a_km)} · {m.periodDays}d · {m.surfaceTempK}K
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <span className="text-sky-300 font-bold block">{m.radiusKm} km</span>
                    <span className="text-[10px] text-slate-400">
                      {m.massLunar > 0 ? m.massLunar : +((m.massEarth / 0.0123000371).toPrecision(3))} M☾
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
};
