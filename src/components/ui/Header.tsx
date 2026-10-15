import React from 'react';
import { Sparkles, Compass, Rocket, Wrench, Home, Atom, Hexagon } from 'lucide-react';
import { FilterCategory, StarSystem, ActiveAppMode } from '../../types/astrophysics';

interface HeaderProps {
  stars: StarSystem[];
  activeFilter: FilterCategory;
  onFilterChange: (filter: FilterCategory) => void;
  onRandomTarget: () => void;
  starCount: number;
  morphologyLabel: string;
  activeApp: ActiveAppMode;
  onSelectApp: (app: ActiveAppMode) => void;
}

export const Header: React.FC<HeaderProps> = ({
  stars,
  activeFilter,
  onFilterChange,
  onRandomTarget,
  starCount,
  morphologyLabel,
  activeApp,
  onSelectApp,
}) => {
  let countOB = 0,
    countG = 0,
    countKM = 0,
    countRemnant = 0,
    countHZ = 0;

  stars.forEach((s) => {
    if (s.colorData.cat === 'ob') countOB++;
    if (s.colorData.cat === 'g') countG++;
    if (s.colorData.cat === 'km') countKM++;
    if (s.starState.isRemnant) countRemnant++;
    if (s.hasHZPlanet) countHZ++;
  });

  const getChipStyle = (filter: FilterCategory, activeClass: string, inactiveClass: string) => {
    return activeFilter === filter
      ? `px-2 py-1 rounded font-bold text-[10.5px] transition shadow ${activeClass}`
      : `px-2 py-1 rounded text-[10.5px] transition hover:bg-slate-700 ${inactiveClass}`;
  };

  return (
    <header
      id="section-01-command-bar"
      data-section="Command Bar & Filters"
      className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl glass-hud border-slate-800/80 relative"
    >
      {/* Title & App Branding (clickable to Home) */}
      <div
        onClick={() => onSelectApp('home')}
        className="flex items-center gap-2.5 cursor-pointer group"
        title="Return to Astro Suite Showcase Home"
      >
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 via-indigo-600 to-amber-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
          <Compass className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-2 group-hover:text-cyan-300 transition-colors">
            ZOOK ASTRO
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
              {starCount.toLocaleString()} Stars &bull; {morphologyLabel}
            </span>
            <span className="text-[9px] font-mono text-slate-500 bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-800">
              v3.0
            </span>
          </h1>
          <p className="text-[10.5px] text-slate-400">
            3D Sector Sim &bull; Steps 1–6 StarGen Lab &bull; 3D Astro-Architect
          </p>
        </div>
      </div>

      {/* Main Application Suite Navigation Switcher */}
      <nav className="flex items-center gap-1 bg-slate-950/90 p-1 rounded-xl border border-slate-800 shadow-inner text-xs font-mono">
        <button
          onClick={() => onSelectApp('home')}
          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition text-[11px] cursor-pointer ${
            activeApp === 'home'
              ? 'bg-gradient-to-r from-slate-700 to-slate-800 text-white font-bold shadow-md shadow-white/10'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
          title="Return to Showcase Homepage"
        >
          <Home className="w-3.5 h-3.5" />
          <span>Home</span>
        </button>

        <button
          onClick={() => onSelectApp('sector-hex')}
          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition text-[11px] cursor-pointer ${
            activeApp === 'sector-hex'
              ? 'bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 text-white font-bold shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
          title="Procedural Hex Grid Stellar Sector Map with Seeded System Generator"
        >
          <Hexagon className="w-3.5 h-3.5" />
          <span>Sector Hex Map</span>
        </button>

        <button
          onClick={() => onSelectApp('sector-3d')}
          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition text-[11px] cursor-pointer ${
            activeApp === 'sector-3d'
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
          title="3D Galactic Sector & Circumstellar Raytraced Orbits"
        >
          <Rocket className="w-3.5 h-3.5" />
          <span>3D Sector Sim</span>
        </button>

        <button
          onClick={() => onSelectApp('stargen-lab')}
          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition text-[11px] cursor-pointer ${
            activeApp === 'stargen-lab'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-md shadow-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
          title="Steps 1-6 Astrophysical Star System Generator Workbench"
        >
          <Atom className="w-3.5 h-3.5" />
          <span>StarGen Lab</span>
        </button>

        <button
          onClick={() => onSelectApp('astro-architect')}
          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition text-[11px] cursor-pointer ${
            activeApp === 'astro-architect'
              ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white font-bold shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
          title="3D Galactic Cartographer, Celestial Hierarchy & Stellaris Exporter"
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>3D Astro-Architect</span>
        </button>
      </nav>

      {/* Contextual App Controls or Sector Filters */}
      {activeApp === 'sector-3d' ? (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Population Filter Chips */}
          <div className="flex items-center gap-1.5 text-xs font-mono flex-wrap">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mr-1">
              Filter:
            </span>
            <button
              onClick={() => onFilterChange('all')}
              className={getChipStyle(
                'all',
                'bg-cyan-700 text-white border border-cyan-400',
                'bg-slate-800 text-slate-300 border border-slate-700'
              )}
            >
              All Stars ({stars.length})
            </button>
            <button
              onClick={() => onFilterChange('ob')}
              className={getChipStyle(
                'ob',
                'bg-blue-700 text-white border border-blue-400',
                'bg-slate-800 text-blue-300 border border-blue-500/30'
              )}
            >
              O/B ({countOB})
            </button>
            <button
              onClick={() => onFilterChange('g')}
              className={getChipStyle(
                'g',
                'bg-yellow-700 text-white border border-yellow-400',
                'bg-slate-800 text-yellow-300 border border-yellow-500/30'
              )}
            >
              G Sol ({countG})
            </button>
            <button
              onClick={() => onFilterChange('km')}
              className={getChipStyle(
                'km',
                'bg-rose-700 text-white border border-rose-400',
                'bg-slate-800 text-rose-300 border border-rose-500/30'
              )}
            >
              K/M ({countKM})
            </button>
            <button
              onClick={() => onFilterChange('remnant')}
              className={getChipStyle(
                'remnant',
                'bg-purple-700 text-white border border-purple-400',
                'bg-slate-800 text-purple-300 border border-purple-500/30'
              )}
            >
              Remnants ({countRemnant})
            </button>
            <button
              onClick={() => onFilterChange('hz')}
              className={getChipStyle(
                'hz',
                'bg-emerald-700 text-white border border-emerald-400',
                'bg-slate-800 text-emerald-300 border border-emerald-500/30'
              )}
            >
              HZ Life ({countHZ})
            </button>
          </div>

          <button
            onClick={onRandomTarget}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 border border-indigo-500/40 text-[11px] font-mono flex items-center gap-1.5 shadow transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
            Random Target
          </button>
        </div>
      ) : activeApp === 'stargen-lab' ? null : activeApp === 'astro-architect' ? (
        <div className="flex items-center gap-2 text-[11px] font-mono text-amber-300 bg-amber-950/60 px-3 py-1.5 rounded-lg border border-amber-800">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span>3D Galaxy Cartographer &bull; 4-Tier Hierarchy &bull; Stellaris Mod Engine</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-300 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>Observatory & Cartographer Suite &bull; Select Engine</span>
        </div>
      )}
    </header>
  );
};

