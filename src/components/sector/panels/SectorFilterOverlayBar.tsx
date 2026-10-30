import React from 'react';
import {
  Filter,
  ChevronDown,
  Sliders,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Route,
  Hexagon,
  Tag,
  Cloud,
} from 'lucide-react';
import {
  SectorFilterCategory,
  MassFilterBracket,
} from '../../../core/generation/sectorHex';

export const SECTOR_FILTER_OPTIONS: Array<{
  id: SectorFilterCategory;
  label: string;
  color: string;
  title?: string;
}> = [
  { id: 'all', label: 'All', color: 'text-slate-200' },
  { id: 'ob', label: 'O/B', color: 'text-blue-400' },
  { id: 'af', label: 'A/F', color: 'text-cyan-300' },
  { id: 'g', label: 'G (Sol)', color: 'text-amber-300' },
  { id: 'km', label: 'K/M', color: 'text-red-400' },
  { id: 'remnant', label: 'Remnants', color: 'text-purple-400' },
  {
    id: 'non-ms',
    label: 'Non-MS (≠ V)',
    color: 'text-amber-400',
    title:
      'Non-Main Sequence Stars (Luminosity Class NOT V: Giants, Supergiants, Subgiants, Remnants)',
  },
  {
    id: 'water-world',
    label: 'Water Worlds',
    color: 'text-sky-400',
    title: 'Systems with liquid-water (H2O / aqueous brine) worlds or moons',
  },
  {
    id: 'ammonia-world',
    label: 'Ammonia Worlds',
    color: 'text-teal-300',
    title: 'Systems with Cryo-Ammonia (NH3-H2O) worlds or moons',
  },
  {
    id: 'multicellular',
    label: 'Multicellular Life',
    color: 'text-emerald-400',
    title: 'Systems harboring worlds or moons with active multicellular biospheres',
  },
  {
    id: 'terrestrial-life',
    label: 'Terrestrial Life',
    color: 'text-lime-400',
    title:
      'Systems harboring worlds or moons with active land-based terrestrial life and non-frozen land (majority rocky composition; excludes ocean worlds)',
  },
];

const MASS_PRESETS: Array<{ id: MassFilterBracket; label: string; sub: string }> = [
  { id: 'all', label: 'All Masses', sub: 'Reset mass filter' },
  { id: 'low', label: '< 0.8 M☉', sub: 'Low Mass / Red Dwarfs' },
  { id: 'solar', label: '0.8 – 2.0 M☉', sub: 'Solar & Intermediate' },
  { id: 'intermediate', label: '2.0 – 8.0 M☉', sub: 'Intermediate Stars' },
  { id: 'massive', label: '> 8.0 M☉', sub: 'Massive Stars' },
  { id: 'giant', label: '10 – 50 M☉', sub: 'Giant Star Systems' },
  { id: 'supermassive', label: '> 999k M☉', sub: 'Sagittarius A* SMBH' },
];

export interface SectorFilterOverlayBarProps {
  showUI?: boolean;
  hasActiveFilters: boolean;
  activeFilterCats: Set<SectorFilterCategory>;
  onToggleFilterCat: (id: SectorFilterCategory) => void;
  massBracket: MassFilterBracket;
  onSelectMassBracket: (bracket: MassFilterBracket) => void;
  customMinMass: string;
  onChangeCustomMinMass: (val: string) => void;
  customMaxMass: string;
  onChangeCustomMaxMass: (val: string) => void;
  showMassMenu: boolean;
  setShowMassMenu: (show: boolean | ((prev: boolean) => boolean)) => void;
  massFilterButtonLabel?: string;
  onResetFilters: () => void;
  matchingStarsCount: number;
  totalSystemsCount: number;
  // Canvas Zoom & Reset Controls
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  showHyperlanes: boolean;
  onToggleHyperlanes: () => void;
  showHexBoundaries: boolean;
  onToggleHexBoundaries: () => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  hasNebula: boolean;
  showNebulae: boolean;
  onToggleNebulae: () => void;
  sectorCachedCount: number;
}

export const SectorFilterOverlayBar: React.FC<SectorFilterOverlayBarProps> = React.memo(
  ({
    showUI = true,
    hasActiveFilters,
    activeFilterCats,
    onToggleFilterCat,
    massBracket,
    onSelectMassBracket,
    customMinMass,
    onChangeCustomMinMass,
    customMaxMass,
    onChangeCustomMaxMass,
    showMassMenu,
    setShowMassMenu,
    massFilterButtonLabel,
    onResetFilters,
    matchingStarsCount,
    totalSystemsCount,
    zoom,
    onZoomIn,
    onZoomOut,
    onFitToScreen,
    showHyperlanes,
    onToggleHyperlanes,
    showHexBoundaries,
    onToggleHexBoundaries,
    showLabels,
    onToggleLabels,
    hasNebula,
    showNebulae,
    onToggleNebulae,
    sectorCachedCount,
  }) => {
    if (!showUI) return null;

    const buttonLabel =
      massFilterButtonLabel ||
      (() => {
        if (massBracket === 'low') return 'Mass: <0.8M☉';
        if (massBracket === 'solar') return 'Mass: 0.8-2M☉';
        if (massBracket === 'intermediate') return 'Mass: 2-8M☉';
        if (massBracket === 'massive') return 'Mass: >8M☉';
        if (massBracket === 'giant') return 'Mass: 10-50M☉';
        if (massBracket === 'supermassive') return 'Mass: >999k M☉';
        if (massBracket === 'custom')
          return `Mass: ${customMinMass || '0'}–${customMaxMass || '∞'}M☉`;
        return 'Mass ▾';
      })();

    return (
      <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-10 pointer-events-auto">
        {/* Spectral Filter Chips Bar */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-950/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-800 shadow-xl text-xs font-mono">
          <span className="text-[10px] text-slate-500 uppercase mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-cyan-400" /> Filter:
          </span>
          {SECTOR_FILTER_OPTIONS.map((f) => {
            const isSelected = f.id === 'all' ? !hasActiveFilters : activeFilterCats.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  onToggleFilterCat(f.id);
                  setShowMassMenu(false);
                }}
                title={f.title}
                className={`px-2 py-0.5 rounded text-[10px] transition cursor-pointer flex items-center gap-1 ${
                  isSelected
                    ? 'bg-cyan-600 text-white font-bold shadow'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span className={isSelected ? 'text-white' : f.color}>{f.label}</span>
                {f.id !== 'all' && isSelected && (
                  <span className="text-[9px] opacity-75 leading-none">&times;</span>
                )}
              </button>
            );
          })}

          {/* Mass Filter Button with Interactive Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMassMenu((prev) => !prev)}
              className={`px-2 py-0.5 rounded text-[10px] transition cursor-pointer flex items-center gap-1 ${
                massBracket !== 'all'
                  ? 'bg-indigo-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Filter systems by Stellar Mass (Combines with other filters)"
            >
              <span
                className={massBracket !== 'all' ? 'text-white' : 'text-indigo-400 font-semibold'}
              >
                {buttonLabel}
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
                    type="button"
                    onClick={() => setShowMassMenu(false)}
                    className="text-slate-400 hover:text-white transition p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quick Mass Presets */}
                <div className="flex flex-col gap-1">
                  <span className="text-[9.5px] uppercase text-slate-500 font-semibold">
                    Mass Presets
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {MASS_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onSelectMassBracket(p.id);
                        }}
                        className={`p-1.5 rounded-lg border text-left transition cursor-pointer ${
                          massBracket === p.id
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
                  <span className="text-[9.5px] uppercase text-slate-500 font-semibold">
                    Custom Mass Range (M☉)
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <span className="text-[9px] text-slate-500 block">Min</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0.08"
                        value={customMinMass}
                        onChange={(e) => {
                          onChangeCustomMinMass(e.target.value);
                          onSelectMassBracket('custom');
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
                          onChangeCustomMaxMass(e.target.value);
                          onSelectMassBracket('custom');
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px]">
                  <button
                    type="button"
                    onClick={() => {
                      onResetFilters();
                      setShowMassMenu(false);
                    }}
                    className="text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    Reset All
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMassMenu(false)}
                    className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Active matching count badge & Clear Button */}
          {hasActiveFilters && (
            <div className="flex items-center gap-1.5 ml-1">
              <span className="text-[9.5px] text-cyan-300 bg-cyan-950/70 border border-cyan-800/80 px-1.5 py-0.5 rounded font-bold">
                {matchingStarsCount} / {totalSystemsCount}
              </span>
              <button
                type="button"
                onClick={onResetFilters}
                className="text-[9px] text-slate-400 hover:text-rose-300 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 px-1.5 py-0.5 rounded transition flex items-center gap-0.5 cursor-pointer"
                title="Clear all active filters"
              >
                <X className="w-2.5 h-2.5" />
                <span>Clear</span>
              </button>
            </div>
          )}
        </div>

        {/* Canvas Zoom & Reset Controls */}
        <div className="flex items-center gap-1.5 bg-slate-950/90 backdrop-blur-md px-2 py-1.5 rounded-xl border border-slate-800 shadow-xl text-xs font-mono w-fit">
          <button
            type="button"
            onClick={onZoomIn}
            className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition cursor-pointer"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onZoomOut}
            className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition cursor-pointer"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <div className="w-[1px] h-3.5 bg-slate-800 mx-0.5" />
          <button
            type="button"
            onClick={onFitToScreen}
            className="px-2 py-1 hover:bg-slate-800 rounded text-[10.5px] text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1 cursor-pointer"
            title="Fit Grid to Screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Fit Sector</span>
          </button>
          <div className="w-[1px] h-3.5 bg-slate-800 mx-0.5" />
          <button
            type="button"
            onClick={onToggleHyperlanes}
            className={`px-2 py-1 hover:bg-slate-800 rounded text-[10.5px] transition flex items-center gap-1 cursor-pointer ${
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
            type="button"
            onClick={onToggleHexBoundaries}
            className={`px-2 py-1 hover:bg-slate-800 rounded text-[10.5px] transition flex items-center gap-1 cursor-pointer ${
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
            type="button"
            onClick={onToggleLabels}
            className={`px-2 py-1 hover:bg-slate-800 rounded text-[10.5px] transition flex items-center gap-1 cursor-pointer ${
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
            type="button"
            onClick={onToggleNebulae}
            className={`px-2 py-1 hover:bg-slate-800 rounded text-[10.5px] transition flex items-center gap-1 cursor-pointer ${
              hasNebula && showNebulae
                ? 'text-fuchsia-400 bg-fuchsia-950/40 border border-fuchsia-800/60'
                : 'text-slate-500 hover:text-slate-300'
            }`}
            title={
              hasNebula
                ? showNebulae
                  ? 'Toggle Noise Clouds Off'
                  : 'Toggle Noise Clouds On'
                : 'Plain Black Background (Click to enable Noise Clouds)'
            }
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>
              {hasNebula
                ? showNebulae
                  ? 'Noise Clouds'
                  : 'Clouds Hidden'
                : 'Plain Black'}
            </span>
          </button>
          <span className="text-[10px] text-slate-500 pl-1">{Math.round(zoom * 100)}%</span>
          {sectorCachedCount > 0 && (
            <div
              className="px-2 py-0.5 rounded-full text-[10px] font-mono flex items-center gap-1.5 text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 ml-1"
              title={`${sectorCachedCount} star system${
                sectorCachedCount === 1 ? '' : 's'
              } in this sector explored and cached in universe storage`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{sectorCachedCount} Cached</span>
            </div>
          )}
        </div>
      </div>
    );
  }
);

SectorFilterOverlayBar.displayName = 'SectorFilterOverlayBar';
