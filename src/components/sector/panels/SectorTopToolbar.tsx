import React from 'react';
import {
  Hexagon,
  Search,
  Sliders,
  RefreshCw,
  Crown,
  Edit3,
  Download,
  Save,
  Plus,
  Move,
  Trash2,
} from 'lucide-react';
import {
  SectorHexConfig,
  SectorHexGridData,
  SectorHexSystem,
} from '../../../core/generation/sectorHex';
import { universeCache } from '../../../core/storage/universeCache';

export type SectorPresetKey =
  | 'disk'
  | 'young-cluster'
  | 'old-halo'
  | 'dense-core'
  | 'galactic-nucleus';

export interface SectorPreset {
  id: SectorPresetKey;
  label: string;
  description: string;
  density: number;
  meanAge: number;
  ageSigma: number;
  metallicityMean: number;
  metallicitySigma: number;
  coord?: string;
}

export const SECTOR_PRESETS: SectorPreset[] = [
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
  {
    id: 'galactic-nucleus',
    label: 'Galactic Nucleus (2525)',
    description:
      'Center of galaxy (Sector 2525) with 1,000,000 M☉ Supermassive Black Hole (Sagittarius A*), S-stars, and relativistic debris.',
    density: 1.25,
    meanAge: 8.5,
    ageSigma: 2.2,
    metallicityMean: 0.25,
    metallicitySigma: 0.18,
    coord: '2525',
  },
];

export interface SectorTopToolbarProps {
  showUI?: boolean;
  onBackToGalaxy?: () => void;
  onBackToGalaxyWithTransition?: () => void;
  config: SectorHexConfig;
  isFromCache: boolean;
  gridData: SectorHexGridData;
  activePreset: SectorPresetKey | null;
  onSelectPreset: (preset: SectorPreset) => void;
  presets?: SectorPreset[];
  onOpenConfigModal: () => void;
  searchCoord: string;
  onSearchCoordChange: (value: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  isSpawnEmpireMode: boolean;
  onStartSpawnEmpire: () => void;
  isSectorEditMode: boolean;
  onToggleSectorEditMode: () => void;
  onRollNewSector: () => void;
  onOpenSectorExportModal: () => void;
  onSaveUniverse?: () => void;
  setBannerNotice?: (notice: string | null) => void;
  // Edit mode banner & action handlers
  isMovingSystem: boolean;
  onToggleMovingSystem: () => void;
  selectedCoord: string | null;
  selectedSystem: SectorHexSystem | null;
  onPlaceNewSystem: (col: number, row: number) => void;
  onOpenSystemEditor: (system: SectorHexSystem) => void;
  onDeleteSystem: (system: SectorHexSystem) => void;
}

export const SectorTopToolbar: React.FC<SectorTopToolbarProps> = React.memo(
  ({
    showUI = true,
    onBackToGalaxy,
    onBackToGalaxyWithTransition,
    config,
    isFromCache,
    gridData,
    activePreset,
    onSelectPreset,
    presets = SECTOR_PRESETS,
    onOpenConfigModal,
    searchCoord,
    onSearchCoordChange,
    onSearchSubmit,
    isSpawnEmpireMode,
    onStartSpawnEmpire,
    isSectorEditMode,
    onToggleSectorEditMode,
    onRollNewSector,
    onOpenSectorExportModal,
    onSaveUniverse,
    setBannerNotice,
    isMovingSystem,
    onToggleMovingSystem,
    selectedCoord,
    selectedSystem,
    onPlaceNewSystem,
    onOpenSystemEditor,
    onDeleteSystem,
  }) => {
    const handleGalaxyReturn = onBackToGalaxyWithTransition || onBackToGalaxy;

    const handleSave = () => {
      if (onSaveUniverse) {
        onSaveUniverse();
        return;
      }
      const galConfig = universeCache.getActiveGalaxyConfig();
      const secCount = universeCache.getLoadedSectorCount();
      const sysCount = universeCache.getLoadedSystemCount();
      const saved = universeCache.saveCurrentUniverse(
        galConfig,
        galConfig.name || `Galaxy Seed #${galConfig.seed}`,
        `Saved from Sector ${config.name || config.coord || ''} with ${secCount} sectors and ${sysCount} systems.`
      );
      if (setBannerNotice) {
        setBannerNotice(
          `💾 Saved Universe & Galaxy (Seed #${saved.seed}) with ${secCount} sectors & ${sysCount} systems!`
        );
      }
    };

    return (
      <>
        {showUI && (
          <div className="w-full px-4 py-2.5 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 z-20">
            {/* Back to Galaxy Map button if opened from GalaxyGen */}
            {handleGalaxyReturn && (
              <button
                onClick={handleGalaxyReturn}
                className="px-2.5 py-1.5 rounded-xl bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/80 flex items-center gap-1.5 cursor-pointer transition shadow text-xs font-mono font-bold group"
                title="Return to 50x50 Galaxy Sector Map (Hotkey: Page Up)"
              >
                <span className="group-hover:-translate-x-0.5 transition-transform">&larr;</span>
                <span>Galaxy Map</span>
                <kbd className="px-1.5 py-0.5 text-[9px] bg-slate-900/90 border border-indigo-500/50 rounded text-indigo-300 font-sans font-normal ml-0.5">
                  PgUp
                </kbd>
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
                    {isFromCache && (
                      <span
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800 flex items-center gap-1 shadow-sm"
                        title="Sector state restored from persistent universe cache"
                      >
                        <span>💾</span>
                        <span>Cached Sector</span>
                      </span>
                    )}
                  </h2>
                </div>
                <p className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                  <span className="text-cyan-300 font-semibold">
                    {config.columns}&times;{config.rows} Hex Grid
                  </span>
                  <span className="text-slate-600">&bull;</span>
                  <span>
                    {gridData.stats.occupiedHexes.toLocaleString()} Systems (
                    {gridData.stats.occupancyPct}% density)
                  </span>
                  <span className="text-slate-600">&bull;</span>
                  <span className="flex items-center gap-1.5 font-mono">
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-white/40 shadow-sm"
                      style={{ backgroundColor: gridData.integratedColorHex }}
                    />
                    <span>
                      Sector Integrated Light:{' '}
                      <strong style={{ color: gridData.integratedColorHex }}>
                        {gridData.integratedColorHex}
                      </strong>
                    </span>
                  </span>
                  {gridData.hasNebula && (
                    <>
                      <span className="text-slate-600">&bull;</span>
                      <span className="text-fuchsia-300 font-semibold bg-fuchsia-950/70 border border-fuchsia-800/80 px-2 py-0.5 rounded-full text-[10.5px] flex items-center gap-1 shadow-sm">
                        <span>🌌</span>
                        <span>{gridData.nebula?.name || 'Nebula Noise Clouds'}</span>
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Preset Selector Buttons */}
            <div className="hidden xl:flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-mono">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelectPreset(p)}
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
              onClick={onOpenConfigModal}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 hover:border-cyan-500 text-xs font-mono font-medium flex items-center gap-2 transition shadow cursor-pointer"
              title="Customize Sector Scale (up to 100x100), Density, Age & Metallicity"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                Scale: <strong className="text-white">{config.columns}&times;{config.rows}</strong>
              </span>
              <span className="text-slate-500">&bull;</span>
              <span>
                Density:{' '}
                <strong
                  className={
                    config.density > 1.0 ? 'text-amber-300 font-bold' : 'text-emerald-300'
                  }
                >
                  {Math.round(config.density * 100)}%
                  {config.density > 1.0 ? ' (Overdensity)' : ''}
                </strong>
              </span>
              <span className="text-slate-500">&bull;</span>
              <span>
                Stars: <strong className="text-cyan-300">{gridData.systems.length}</strong>
              </span>
              <span className="text-slate-500">&bull;</span>
              <span className="hidden md:inline">
                Age:{' '}
                <strong className="text-cyan-300">
                  {config.meanAge.toFixed(1)} Gyr
                  {config.ageRange
                    ? ` (±${(config.ageRange / 2).toFixed(1)} Gyr${
                        config.ageDistribution === 'uniform' ? ', Uniform' : ''
                      })`
                    : ''}
                </strong>
              </span>
            </button>

            {/* Search Star or Coordinate */}
            <form onSubmit={onSearchSubmit} className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search star or coord (e.g. 0408, Centauri)..."
                  value={searchCoord}
                  onChange={(e) => onSearchCoordChange(e.target.value)}
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
                onClick={onStartSpawnEmpire}
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

              {/* Sector Edit Mode Button */}
              <button
                onClick={onToggleSectorEditMode}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg transition cursor-pointer ${
                  isSectorEditMode
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/30 ring-2 ring-amber-300'
                    : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-600/70 hover:border-amber-400'
                }`}
                title="Toggle Sector Edit Mode: place, move, edit and delete star systems"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isSectorEditMode ? 'Exit Edit Mode' : 'Edit Sector'}</span>
              </button>

              <button
                onClick={onRollNewSector}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 transition cursor-pointer"
                title="Generate a brand new randomized stellar sector"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Roll New Sector</span>
              </button>

              <button
                onClick={onOpenSectorExportModal}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-700/80 hover:border-cyan-500 text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg transition cursor-pointer"
                title="Export or Import Individual Sector (Stargen Sector JSON, Stellaris Static Galaxy .txt, or SpaceEngine .sc)"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span>Export / Import Sector</span>
              </button>

              <button
                onClick={handleSave}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                title="Save Galaxy & Universe: persists galaxy parameters, seeds, and all cached sectors & star systems"
              >
                <Save className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Save Galaxy</span>
              </button>
            </div>
          </div>
        )}

        {/* Sector Edit Mode Banner Bar */}
        {isSectorEditMode && (
          <div className="w-full bg-gradient-to-r from-amber-950/90 via-slate-900/95 to-amber-950/90 border-b border-amber-500/50 px-4 py-2 flex items-center justify-between z-20 text-xs font-mono shadow-lg">
            <div className="flex items-center gap-3">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
              <span className="font-bold text-amber-300">SECTOR ARCHITECT EDIT MODE</span>
              <span className="text-slate-400 text-[11px] hidden lg:inline">
                Click empty space to place a star system &bull; Click any star to edit, move or delete
              </span>
              {isMovingSystem && selectedSystem && (
                <span className="px-2.5 py-0.5 rounded bg-amber-500 text-slate-950 font-bold animate-pulse">
                  Click destination hex to move {selectedSystem.name} ({selectedSystem.coord})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (selectedCoord) {
                    const c = parseInt(selectedCoord.slice(0, 2), 10);
                    const r = parseInt(selectedCoord.slice(2, 4), 10);
                    onPlaceNewSystem(c, r);
                  } else {
                    onPlaceNewSystem(
                      Math.round(config.columns / 2),
                      Math.round(config.rows / 2)
                    );
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-1.5 transition shadow cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Place Star System</span>
              </button>
              {selectedSystem && (
                <>
                  <button
                    onClick={() => onOpenSystemEditor(selectedSystem)}
                    className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center gap-1.5 transition shadow cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit System & Planets</span>
                  </button>
                  <button
                    onClick={onToggleMovingSystem}
                    className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition shadow cursor-pointer ${
                      isMovingSystem
                        ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <Move className="w-3.5 h-3.5" />
                    <span>{isMovingSystem ? 'Cancel Move' : 'Move Star'}</span>
                  </button>
                  <button
                    onClick={() => onDeleteSystem(selectedSystem)}
                    className="px-2.5 py-1 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-700/60 text-red-200 font-bold flex items-center gap-1.5 transition shadow cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Star</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </>
    );
  }
);

SectorTopToolbar.displayName = 'SectorTopToolbar';
