import React from 'react';
import {
  Home,
  Disc,
  Sparkles,
  Save,
  FolderOpen,
  Image as ImageIcon,
  Undo2,
  Sliders,
  Search,
  RefreshCw,
} from 'lucide-react';
import {
  GalaxyConfig,
  GalaxyMorphology,
  GalaxyGridData,
} from '../../../core/generation/galaxyGen';
import { universeCache } from '../../../core/storage/universeCache';

export interface MorphologyOption {
  id: GalaxyMorphology;
  label: string;
  desc: string;
  icon: string;
}

export const MORPHOLOGY_OPTIONS: MorphologyOption[] = [
  { id: 'spiral', label: 'Grand Design Spiral', desc: 'Symmetric logarithmic arms, active starburst ridges, bright core', icon: '🌀' },
  { id: 'barred-spiral', label: 'Barred Spiral (SBb)', desc: 'Prominent stellar bar crossing the nucleus feeding spiral arms', icon: '🌌' },
  { id: 'elliptical', label: 'Elliptical (E0-E4)', desc: 'Smooth de Vaucouleurs profile, ancient red Population II stars', icon: '⚪' },
  { id: 'lenticular', label: 'Lenticular (S0)', desc: 'Dense spheroidal core with a smooth, gas-depleted stellar disk', icon: '💿' },
  { id: 'ring', label: 'Collisional Ring', desc: 'Ring galaxy formed by bullet collision with blue starburst rim', icon: '🪐' },
  { id: 'irregular', label: 'Irregular Clump', desc: 'Chaotic starburst knots and turbulent gas streams (Magellanic type)', icon: '✨' },
];

export interface GalaxyTopToolbarProps {
  showUI?: boolean;
  onGoHome?: () => void;
  config: GalaxyConfig;
  galaxyData: GalaxyGridData;
  customGalaxyData?: GalaxyGridData | null;
  searchCoord: string;
  setSearchCoord: (coord: string) => void;
  handleSearchSubmit: (e: React.FormEvent) => void;
  handleMorphologyChange: (m: GalaxyMorphology) => void;
  handleSaveCurrentGalaxy: () => void;
  setShowSavedGalaxiesModal: (show: boolean) => void;
  setShowImageModal: (show: boolean) => void;
  handleResetToProcedural: () => void;
  setShowConfigModal: (show: boolean) => void;
  handleRollGalaxy: () => void;
}

export const GalaxyTopToolbar: React.FC<GalaxyTopToolbarProps> = React.memo(({
  showUI = true,
  onGoHome,
  config,
  galaxyData,
  customGalaxyData,
  searchCoord,
  setSearchCoord,
  handleSearchSubmit,
  handleMorphologyChange,
  handleSaveCurrentGalaxy,
  setShowSavedGalaxiesModal,
  setShowImageModal,
  handleResetToProcedural,
  setShowConfigModal,
  handleRollGalaxy,
}) => {
  if (!showUI) return null;

  return (
    <div className="w-full px-4 py-2.5 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 z-20">
      {/* Left: Branding & Core Stats */}
      <div className="flex items-center gap-3">
        {onGoHome && (
          <button
            onClick={onGoHome}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 flex items-center gap-1.5 cursor-pointer transition shadow text-xs font-mono"
            title="Return to Home Showcase"
          >
            <Home className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Home</span>
          </button>
        )}
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20 border border-blue-400/30">
          <Disc className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
              GALAXY GENERATOR
              <button
                type="button"
                onClick={() => setShowSavedGalaxiesModal(true)}
                className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950/80 hover:bg-blue-900 text-blue-400 border border-blue-800 flex items-center gap-1 transition cursor-pointer"
                title="Open Saved Galaxies Catalog to manage, save, or load this seeded galaxy"
              >
                {customGalaxyData ? '🖼️ Quantized Image' : `Seed #${config.seed}`}
                <Sparkles className="w-2.5 h-2.5 text-blue-400" />
              </button>
            </h2>
          </div>
          <p className="text-[11px] text-slate-400 flex items-center gap-2">
            <span className="text-cyan-300 font-semibold">{config.columns}&times;{config.rows} Sectors</span>
            <span className="text-slate-600">&bull;</span>
            <span>{galaxyData.stats.activeSectors.toLocaleString()} Active Sectors</span>
            <span className="text-slate-600">&bull;</span>
            <span>Radius: <strong className="text-slate-200">{config.radiusKpc} kpc</strong></span>
            <span className="text-slate-600">&bull;</span>
            <span>Est. <strong className="text-emerald-300">~{(galaxyData.stats.totalEstimatedStars / 1000).toFixed(0)}k</strong> Systems</span>
            {galaxyData.stats.nebulaCount > 0 && (
              <>
                <span className="text-slate-600">&bull;</span>
                <span className="text-fuchsia-300 font-semibold flex items-center gap-1">
                  <span>🌌</span>
                  <span>{galaxyData.stats.nebulaCount} Nebulae</span>
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Center: Morphology Switcher */}
      <div className="hidden lg:flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-mono">
        {MORPHOLOGY_OPTIONS.map((m) => (
          <button
            key={m.id}
            onClick={() => handleMorphologyChange(m.id)}
            className={`px-2.5 py-1 rounded-lg transition text-[11px] cursor-pointer flex items-center gap-1.5 ${
              config.morphology === m.id
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-md shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title={m.desc}
          >
            <span>{m.icon}</span>
            <span>{m.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {/* Right: Customization, Search, Roll */}
      <div className="flex items-center gap-2">
        {/* Primary Save Galaxy Button */}
        <button
          onClick={handleSaveCurrentGalaxy}
          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition cursor-pointer active:scale-95 border border-emerald-400/40"
          title="Save Galaxy: persists current galaxy parameters, seeds, and all cached sectors & star systems (Hotkey: Ctrl+S)"
        >
          <Save className="w-3.5 h-3.5 text-white" />
          <span>Save Galaxy</span>
          {(universeCache.getLoadedSectorCount() > 0 || universeCache.getLoadedSystemCount() > 0) && (
            <span className="px-1.5 py-0.2 rounded-full bg-slate-950/80 text-emerald-300 text-[10px] border border-emerald-500/40 font-mono">
              {universeCache.getLoadedSectorCount()}s / {universeCache.getLoadedSystemCount()}sys
            </span>
          )}
        </button>

        {/* Saved Galaxies Catalog Button */}
        <button
          onClick={() => setShowSavedGalaxiesModal(true)}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-800/80 hover:border-cyan-500 text-xs font-mono font-medium flex items-center gap-1.5 transition shadow cursor-pointer"
          title="Open Saved Galaxies Catalog to save, load, or export seeded universes"
        >
          <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Saved Galaxies</span>
          {universeCache.getSavedGalaxies().length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-cyan-950 text-cyan-300 text-[10px] border border-cyan-800 font-bold">
              {universeCache.getSavedGalaxies().length}
            </span>
          )}
        </button>

        {/* Import / Quantize Image Button */}
        <button
          onClick={() => setShowImageModal(true)}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-purple-300 border border-purple-800/80 hover:border-purple-500 text-xs font-mono font-medium flex items-center gap-1.5 transition shadow cursor-pointer"
          title="Import an image of a galaxy to quantize into sector hex data"
        >
          <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
          <span className="hidden sm:inline">Import Image</span>
        </button>

        {/* Reset to Procedural if Custom Quantized Galaxy is Active */}
        {customGalaxyData && (
          <button
            onClick={handleResetToProcedural}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-800/60 hover:border-amber-500 text-xs font-mono text-[11px] flex items-center gap-1 transition cursor-pointer"
            title="Return to procedural galaxy generation"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Procedural</span>
          </button>
        )}

        {/* Sliders Modal Button */}
        <button
          onClick={() => setShowConfigModal(true)}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 hover:border-blue-500 text-xs font-mono font-medium flex items-center gap-2 transition shadow cursor-pointer"
          title="Customize Galaxy Morphology, Arms, Density Scale, and Radii"
        >
          <Sliders className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">Galaxy Parameters</span>
        </button>

        {/* Search Sector Coordinate */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Sector coord (e.g. 2525)..."
              value={searchCoord}
              onChange={(e) => setSearchCoord(e.target.value)}
              className="w-40 pl-8 pr-2 py-1 text-xs font-mono bg-slate-900/90 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>
          <button
            type="submit"
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-mono transition cursor-pointer"
          >
            Go
          </button>
        </form>

        {/* Reroll Galaxy Button */}
        <button
          onClick={handleRollGalaxy}
          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg shadow-blue-500/20 transition cursor-pointer"
          title="Generate a brand new procedural galaxy with random astrophysical seed (clears cached sectors)"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reroll Galaxy</span>
        </button>
      </div>
    </div>
  );
});

GalaxyTopToolbar.displayName = 'GalaxyTopToolbar';
