import React, { useState, useMemo } from 'react';
import {
  Hexagon,
  Sparkles,
  Atom,
  Copy,
  Check,
  Edit3,
  Trash2,
  Shield,
  Crown,
  Flag,
  Route,
  Download,
  Info,
  Plus,
} from 'lucide-react';
import {
  SectorHexSystem,
  SectorHexGridData,
  SectorHyperlane,
  isNonMainSequenceSystem,
  isBlackHoleStar,
  hasTerrestrialBiosphere,
} from '../../../core/generation/sectorHex';
import { BlackHoleIcon } from '../../ui/BlackHoleIcon';
import { getProceduralStarSpriteDataUrl } from '../../../core/generation/starAssets';
import { universeCache } from '../../../core/storage/universeCache';
import { SectorEmpire, parsePlanetKey } from '../../../core/generation/empireGen';

export const getBiosphereDisplay = (sys: SectorHexSystem): string => {
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
            if (hasTerrestrialBiosphere(body.planetClass, body.hydrosphere, body)) {
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
                if (hasTerrestrialBiosphere(moon.moonClass, moon.hydrosphere, moon)) {
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

export interface SectorSystemInspectorProps {
  showUI?: boolean;
  selectedSystem: SectorHexSystem | null;
  selectedCoord: string | null;
  gridData: SectorHexGridData;
  empires: SectorEmpire[];
  activeEmpire: SectorEmpire | null;
  systemTraitsMap?: Map<
    string,
    {
      hasWater: boolean;
      hasAmmonia: boolean;
      hasMulti: boolean;
      hasTerrestrial: boolean;
      isNonMs: boolean;
      biosphereDisplay: string;
    }
  >;
  onLaunchSystemGenerator: (system: SectorHexSystem) => void;
  onOpenSystemEditor: (system: SectorHexSystem) => void;
  onDeleteSystem: (system: SectorHexSystem) => void;
  onOpenSpawnEmpireModal: (system: SectorHexSystem) => void;
  onClaimToggle: (system: SectorHexSystem) => void;
  onSelectSystem: (system: SectorHexSystem) => void;
  onOpenSectorExportModal: () => void;
  onPlaceNewSystem: (col: number, row: number) => void;
}

export const SectorSystemInspector: React.FC<SectorSystemInspectorProps> = React.memo(
  ({
    showUI = true,
    selectedSystem,
    selectedCoord,
    gridData,
    empires,
    activeEmpire,
    systemTraitsMap,
    onLaunchSystemGenerator,
    onOpenSystemEditor,
    onDeleteSystem,
    onOpenSpawnEmpireModal,
    onClaimToggle,
    onSelectSystem,
    onOpenSectorExportModal,
    onPlaceNewSystem,
  }) => {
    const [copiedId, setCopiedId] = useState<boolean>(false);

    const empireMap = useMemo(() => {
      const map = new Map<string, SectorEmpire>();
      for (const emp of empires) {
        for (const sysId of emp.claimedSystemIds) {
          map.set(sysId, emp);
        }
      }
      return map;
    }, [empires]);

    const connectedLanes: SectorHyperlane[] = useMemo(() => {
      if (!selectedSystem || !gridData.hyperlanes) return [];
      return gridData.hyperlanes.filter(
        (l) => l.sourceId === selectedSystem.id || l.targetId === selectedSystem.id
      );
    }, [selectedSystem, gridData.hyperlanes]);

    const handleCopyId = (id: string) => {
      navigator.clipboard.writeText(id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    };

    if (!showUI) return null;

    return (
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
                  {isBlackHoleStar({
                    category: selectedSystem.remnantType || '',
                    spectralType: selectedSystem.primaryClass,
                  }) ? (
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
                          ? `Candidate Habitable World / Biosphere (${selectedSystem.habitableTypes.join(
                              ', '
                            )})`
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
                      Sector {selectedSystem.coord} &bull; {selectedSystem.parsecX} pc,{' '}
                      {selectedSystem.parsecY} pc
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
                        <span>SMBH {selectedSystem.mass.toLocaleString()} M☉</span>
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

            {/* System Stats Card */}
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
                    {selectedSystem.mass >= 100000
                      ? selectedSystem.mass.toLocaleString()
                      : selectedSystem.mass.toFixed(3)}{' '}
                    <span className="text-xs text-slate-400">M☉</span>
                  </div>
                  <div className="text-[9.5px] text-slate-400 mt-0.5">
                    Star A:{' '}
                    <span className="text-amber-200 font-semibold">
                      {selectedSystem.primaryMass >= 100000
                        ? selectedSystem.primaryMass.toLocaleString()
                        : selectedSystem.primaryMass.toFixed(3)}{' '}
                      M☉
                    </span>
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
                      type="button"
                      onClick={() => handleCopyId(selectedSystem.id)}
                      className="text-slate-400 hover:text-white transition cursor-pointer"
                      title="Copy deterministic seed ID"
                    >
                      {copiedId ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                  <div
                    className="text-xs font-bold text-fuchsia-300 mt-0.5 truncate"
                    title={selectedSystem.id}
                  >
                    {selectedSystem.id}
                  </div>
                </div>
              </div>

              {/* Primary Action Button: Launch into System Map */}
              <button
                type="button"
                onClick={() => onLaunchSystemGenerator(selectedSystem)}
                className="w-full mt-3 py-2.5 px-3 rounded-lg bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 border border-emerald-400/40 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                title="System Map (Hotkey: Page Down)"
              >
                <Atom className="w-4 h-4 animate-spin-slow" />
                <span>System Map &rarr;</span>
                <kbd className="px-1.5 py-0.5 text-[9px] bg-slate-950/70 border border-emerald-400/50 rounded text-emerald-200 font-sans font-normal ml-1">
                  PgDn
                </kbd>
              </button>

              {/* Edit System & Planets & Delete Action Buttons */}
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => onOpenSystemEditor(selectedSystem)}
                  className="flex-1 py-2 px-3 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 text-cyan-200 font-mono font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                  title="Open Comprehensive System & Planet Architect"
                >
                  <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Edit System & Planets</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSystem(selectedSystem)}
                  className="py-2 px-2.5 rounded-lg bg-red-950/70 hover:bg-red-900/80 border border-red-800/60 text-red-300 font-mono text-xs flex items-center justify-center transition cursor-pointer"
                  title="Delete this star system from sector"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Alien Empire & Sovereignty Territory Card */}
            {(() => {
              const systemEmpire = empireMap.get(selectedSystem.id);
              const isCapital =
                systemEmpire != null && systemEmpire.homeworldSystemId === selectedSystem.id;

              if (systemEmpire) {
                return (
                  <div
                    className="p-3.5 rounded-xl border font-mono text-xs space-y-2.5 transition shadow-lg relative overflow-hidden"
                    style={{
                      backgroundColor: `${systemEmpire.color}18`,
                      borderColor: `${systemEmpire.color}60`,
                    }}
                  >
                    <div
                      className="flex items-center justify-between pb-2 border-b"
                      style={{ borderColor: `${systemEmpire.color}35` }}
                    >
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
                        <span className="text-slate-400 block text-[9.5px] uppercase">
                          Empire Realm
                        </span>
                        <span className="text-white font-bold">
                          {systemEmpire.claimedSystemIds.length} Stars
                        </span>
                      </div>
                      <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
                        <span className="text-slate-400 block text-[9.5px] uppercase">
                          Homeworld
                        </span>
                        <span className="text-cyan-300 font-bold truncate block">
                          {systemEmpire.homeworldName}
                        </span>
                      </div>
                    </div>

                    {/* Government & Ethics Badges */}
                    {systemEmpire.government && (
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                          <span className="text-sm">{systemEmpire.government.icon}</span>
                          <span className="font-semibold text-white">
                            {systemEmpire.government.name}
                          </span>
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
                          type="button"
                          onClick={() => onClaimToggle(selectedSystem)}
                          className="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-medium transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Flag className="w-3.5 h-3.5" style={{ color: activeEmpire.color }} />
                          <span>Claim for {activeEmpire.name}</span>
                        </button>
                      )}
                      {activeEmpire && activeEmpire.id === systemEmpire.id && !isCapital && (
                        <button
                          type="button"
                          onClick={() => onClaimToggle(selectedSystem)}
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
                        type="button"
                        onClick={() => onOpenSpawnEmpireModal(selectedSystem)}
                        className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition cursor-pointer"
                      >
                        <Crown className="w-3.5 h-3.5" />
                        <span>Spawn Empire Capital on this World</span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-[10.5px] text-slate-500 leading-relaxed">
                      Uninhabited deep space. Can be claimed as an outpost by an established empire
                      via{' '}
                      <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 text-[9.5px]">
                        Shift+Click
                      </kbd>
                      .
                    </p>
                  )}

                  {activeEmpire && (
                    <button
                      type="button"
                      onClick={() => onClaimToggle(selectedSystem)}
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
                <span className="text-cyan-400 font-semibold">
                  {selectedSystem.archName.replace(/\s*\(.*\)/g, '')}
                </span>
              </div>

              {(() => {
                const isMultiple = selectedSystem.nStars > 1;
                const totalLuminosity = (() => {
                  if (
                    selectedSystem.sysResult?.hierarchy?.stars &&
                    selectedSystem.sysResult.hierarchy.stars.length > 0
                  ) {
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
                              <div
                                key={cs.label}
                                className="flex items-center justify-end gap-1.5 text-xs"
                              >
                                {isBH ? (
                                  <BlackHoleIcon
                                    isSupermassive={cs.mass > 999999}
                                    size={15}
                                  />
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
                          <span className="text-slate-200 font-semibold">
                            {Math.round(selectedSystem.teff)} K
                          </span>
                        </div>

                        <div className="flex items-center justify-between py-1 border-b border-slate-800/60">
                          <span className="text-slate-400">Evolutionary State</span>
                          <span
                            className={
                              isNonMainSequenceSystem(selectedSystem)
                                ? 'text-purple-300 font-bold'
                                : 'text-cyan-400 font-semibold'
                            }
                          >
                            {selectedSystem.isRemnant
                              ? selectedSystem.remnantType || 'Remnant'
                              : selectedSystem.sysResult?.hierarchy?.stars?.[0]?.category ||
                                (isNonMainSequenceSystem(selectedSystem)
                                  ? 'Non-Main Sequence'
                                  : 'Main Sequence')}
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
                        systemTraitsMap?.get(selectedSystem.id)?.biosphereDisplay ??
                        getBiosphereDisplay(selectedSystem);
                      return (
                        <div className="flex items-center justify-between py-1">
                          <span className="text-slate-400">Planetary Biospheres:</span>
                          <span
                            className={
                              bioLabel !== '<none>' ? 'text-emerald-400 font-bold' : 'text-slate-500'
                            }
                          >
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
                    const targetId =
                      lane.sourceId === selectedSystem.id ? lane.targetId : lane.sourceId;
                    const neighbor = gridData.systems.find((s) => s.id === targetId);
                    if (!neighbor) return null;

                    return (
                      <div
                        key={lane.id}
                        onClick={() => onSelectSystem(neighbor)}
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
                  <span className="text-indigo-300 font-bold">
                    {gridData.stats.multipleSystemCount}
                  </span>
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
                  <span
                    className="flex items-center gap-1.5 font-bold"
                    style={{ color: gridData.integratedColorHex }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-white/40"
                      style={{ backgroundColor: gridData.integratedColorHex }}
                    />
                    {gridData.integratedColorHex}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenSectorExportModal}
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
              <span>double click or zoom in for system map</span>
            </div>
          </div>
        ) : selectedCoord ? (
          <div className="p-6 h-full flex flex-col items-center justify-center text-center text-slate-400 font-mono text-xs gap-4">
            <div className="w-14 h-14 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-950/50">
              <Hexagon className="w-8 h-8 animate-pulse text-cyan-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-200">Empty Sector Hex</div>
              <div className="text-cyan-400 text-xs mt-0.5">
                Quadrant Coordinate: {selectedCoord}
              </div>
            </div>
            <p className="text-slate-500 text-[11px] max-w-[240px] leading-relaxed">
              This sector cell is currently vacant. You can establish a new star system here.
            </p>
            <button
              type="button"
              onClick={() => {
                const c = parseInt(selectedCoord.slice(0, 2), 10);
                const r = parseInt(selectedCoord.slice(2, 4), 10);
                onPlaceNewSystem(c, r);
              }}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-mono font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-600/25 transition cursor-pointer hover:scale-105 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Place Star System Here</span>
            </button>
          </div>
        ) : (
          <div className="p-6 h-full flex flex-col items-center justify-center text-center text-slate-500 font-mono text-xs gap-3">
            <Hexagon className="w-10 h-10 text-slate-700 animate-pulse" />
            <p>Select any hex with a star system to inspect its stats or open the system map.</p>
          </div>
        )}
      </div>
    );
  }
);

SectorSystemInspector.displayName = 'SectorSystemInspector';
