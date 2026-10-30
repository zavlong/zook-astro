import React, { useMemo } from 'react';
import {
  Sparkles,
  RefreshCw,
  Code,
  Rocket,
  Wrench,
  Star,
  Lock,
  Edit3,
} from 'lucide-react';
import {
  CustomStellarConfig,
  RealisticStarSystemResult,
  STARGEN_BENCHMARK_PRESETS,
  convertRealisticToArchitectSystem,
  convertRealisticToSectorStarSystem,
} from '../../../core/generation/realisticStarGen';
import { ArchitectSystem } from '../../../types/architect';
import { StarSystem } from '../../../types/astrophysics';
import { SectorEmpire } from '../../../core/generation/empireGen';

export interface StarGenHeaderControlsProps {
  showUI?: boolean;
  currentEmpire?: SectorEmpire | null;
  currentSysId?: string;
  systemResult?: RealisticStarSystemResult | null;
  isFromCache?: boolean;
  onBackToSectorHex?: () => void;
  onBackToSectorWithTransition?: () => void;
  onRollPureIMF: () => void;
  onRerollKeepSliders: () => void;
  onRerollPlanetsOnly: () => void;
  onOpenSystemEditor: () => void;
  onOpenPreProgramModal: () => void;
  customStellarConfig?: CustomStellarConfig | null;
  onInspectInSector3D?: (starSystem: StarSystem) => void;
  onSendZoneToArchitect?: (zoneIdx: number) => void;
  onOpenInArchitect?: (archSystem: ArchitectSystem) => void;
  onOpenJsonModal: () => void;
  // Param controls & sliders
  logMass: number;
  age: number;
  feh: number;
  forcedMult: 'auto' | '1' | '2' | '3' | '4';
  presetKey: string;
  onParamChange: (
    newLogMass: number,
    newAge: number,
    newFeh: number,
    newMult: 'auto' | '1' | '2' | '3' | '4',
    clearPreset?: boolean
  ) => void;
  onSelectPreset: (presetKey: string) => void;
}

export const StarGenHeaderControls: React.FC<StarGenHeaderControlsProps> = React.memo(({
  showUI = true,
  currentEmpire,
  currentSysId,
  systemResult,
  isFromCache = false,
  onBackToSectorHex,
  onBackToSectorWithTransition,
  onRollPureIMF,
  onRerollKeepSliders,
  onRerollPlanetsOnly,
  onOpenSystemEditor,
  onOpenPreProgramModal,
  customStellarConfig,
  onInspectInSector3D,
  onSendZoneToArchitect,
  onOpenInArchitect,
  onOpenJsonModal,
  logMass,
  age,
  feh,
  forcedMult,
  presetKey,
  onParamChange,
  onSelectPreset,
}) => {
  const sysMass = useMemo(() => +Math.pow(10, logMass).toFixed(3), [logMass]);
  const handleBack = onBackToSectorWithTransition || onBackToSectorHex;

  if (!showUI) {
    return null;
  }

  return (
    <>
      {/* Imperial Sovereignty & Realm Banner */}
      {currentEmpire && (
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
      <div className="bg-[#0e131d] border border-[#2a3852] rounded-xl p-3.5 flex flex-col gap-3 shadow-lg">
        <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            {handleBack && (
              <button
                type="button"
                onClick={handleBack}
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
              onClick={onRollPureIMF}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 border border-sky-400 shadow flex items-center gap-1.5 cursor-pointer transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Roll New
            </button>
            <button
              type="button"
              onClick={onRerollKeepSliders}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#151d2c] hover:bg-[#1e293b] text-slate-100 border border-[#2a3852] hover:border-sky-400 flex items-center gap-1.5 cursor-pointer transition"
              title="Re-roll system using current parameters"
            >
              <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
              Re-Roll
            </button>
            <button
              type="button"
              onClick={onRerollPlanetsOnly}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#151d2c] hover:bg-[#1e293b] text-sky-200 border border-[#2a3852] hover:border-sky-400 flex items-center gap-1.5 cursor-pointer transition"
              title="Keep current star(s) fixed and re-roll only the planets and moons"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              Roll Planets Only
            </button>
            {/* Universal Star & Planet Architect Button */}
            <button
              type="button"
              onClick={onOpenSystemEditor}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md shadow-cyan-600/25 border border-cyan-400/40"
              title="Edit all stars, planetary zones, orbits, physical parameters, atmospheres, oceans, biospheres, and moons in this system"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit System & Planets</span>
            </button>

            <button
              type="button"
              onClick={onOpenPreProgramModal}
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
                {(onSendZoneToArchitect || onOpenInArchitect) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onSendZoneToArchitect) {
                        onSendZoneToArchitect(0);
                      } else if (onOpenInArchitect && systemResult) {
                        onOpenInArchitect(convertRealisticToArchitectSystem(systemResult, 0));
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-700 flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Wrench className="w-3.5 h-3.5 text-amber-400" />
                    3D Architect
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={onOpenJsonModal}
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
                onParamChange(parseFloat(e.target.value), age, feh, forcedMult)
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
                onParamChange(logMass, parseFloat(e.target.value), feh, forcedMult)
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
                onParamChange(logMass, age, parseFloat(e.target.value), forcedMult)
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
                onParamChange(
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
              onChange={(e) => onSelectPreset(e.target.value)}
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
    </>
  );
});

StarGenHeaderControls.displayName = 'StarGenHeaderControls';
