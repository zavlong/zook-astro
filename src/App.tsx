import React, { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  FilterCategory,
  SectorConfiguration,
  StarSystem,
  ActiveAppMode,
} from './types/astrophysics';
import { ArchitectSystem } from './types/architect';
import { generateSectorStars } from './core/generation/sector';
import { calculateStellarEvolution } from './core/astrophysics/evolution';
import { getStarColorRGB } from './core/astrophysics/colors';
import { Header } from './components/ui/Header';
import { SectorControls } from './components/ui/SectorControls';
import { SectorView3D } from './components/canvas/SectorView3D';
import { StellarInspector } from './components/ui/StellarInspector';
import { useResizableColumns } from './hooks/useResizableColumns';
import { ShowcaseHome } from './components/home/ShowcaseHome';
import { AstroArchitectApp } from './components/architect/AstroArchitectApp';
import { RealisticStarGenApp } from './components/stargen/RealisticStarGenApp';
import { SectorHexApp } from './components/sector/SectorHexApp';
import { GalaxyGenApp } from './components/galaxy/GalaxyGenApp';
import { StarGenParams } from './core/generation/realisticStarGen';
import { GalaxySectorHex } from './core/generation/galaxyGen';
import { SectorHexConfig } from './core/generation/sectorHex';

export const App: React.FC = () => {
  // Global HUD UI toggle state (Off by default for full-screen edge-to-edge immersion)
  const [showUI, setShowUI] = useState<boolean>(false);

  // Global hotkey 'u' or 'h' toggles the UI
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

      if (e.key === 'u' || e.key === 'U' || e.key === 'h' || e.key === 'H') {
        setShowUI((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Application mode starts at the sensational homepage showcase
  const [activeApp, setActiveApp] = useState<ActiveAppMode>('home');
  const [architectInitialSystem, setArchitectInitialSystem] =
    useState<ArchitectSystem | null>(null);
  const [starGenInitialParams, setStarGenInitialParams] =
    useState<StarGenParams | null>(null);
  const [sectorInitialConfig, setSectorInitialConfig] =
    useState<Partial<SectorHexConfig> | null>(null);

  const [lastGalaxySector, setLastGalaxySector] = useState<GalaxySectorHex | null>(null);
  const [returnToGalaxyTransition, setReturnToGalaxyTransition] = useState<boolean>(false);

  const handleSelectGalaxySector = (sector: GalaxySectorHex) => {
    setLastGalaxySector(sector);
    setReturnToGalaxyTransition(false);
    setSectorInitialConfig({
      seed: sector.seed,
      name: sector.name,
      coord: sector.coord,
      columns: 50,
      rows: 50,
      density: sector.density,
      meanAge: sector.meanAge,
      ageRange: sector.ageRange,
      ageDistribution: sector.ageDistribution,
      ageSigma:
        sector.ageDistribution === 'uniform'
          ? +(sector.ageRange / Math.sqrt(12)).toFixed(2)
          : +(sector.ageRange / 3.2).toFixed(2),
      metallicityMean: sector.metallicityMean,
      hasNebula: sector.hasNebula,
    });

    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
        setActiveApp('sector-hex');
      });
    } else {
      setActiveApp('sector-hex');
    }
  };

  const handleBackToGalaxy = () => {
    setReturnToGalaxyTransition(true);
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
        setActiveApp('galaxy-gen');
      });
    } else {
      setActiveApp('galaxy-gen');
    }
  };

  const [config, setConfig] = useState<SectorConfiguration>({
    starCount: 1000,
    morphology: 'disk',
    meanAgeGyr: 4.5,
    ageSigmaGyr: 1.5,
    metallicityDex: 0.0,
    radiusLy: 120,
    seed: 4289,
  });

  const [stars, setStars] = useState<StarSystem[]>([]);
  const [selectedStar, setSelectedStar] = useState<StarSystem | null>(null);
  const [selectedPlanetIndex, setSelectedPlanetIndex] = useState<number>(0);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');

  // Resizable 3-column layout hook for 3D Sector Sim
  const { colWidths, mainContainerRef, startDrag, resetColWidths } = useResizableColumns();

  // Sector Generation
  const handleRegenerate = useCallback((currentConfig = config) => {
    const generated = generateSectorStars(currentConfig);
    setStars(generated);

    // Default to a 1.0 M_sun Solar analog if present
    const solAnalog = generated.find(
      (s) =>
        s.progenitorMass >= 0.98 &&
        s.progenitorMass <= 1.05 &&
        !s.starState.isRemnant
    );
    setSelectedStar(solAnalog || generated[0] || null);
    setSelectedPlanetIndex(0);
  }, [config]);

  // Initial load
  useEffect(() => {
    handleRegenerate(config);
  }, []);

  // Update seed
  const handleNewSeed = () => {
    const newSeed = Math.floor(Math.random() * 90000) + 1000;
    const newConfig = { ...config, seed: newSeed };
    setConfig(newConfig);
    handleRegenerate(newConfig);
  };

  // Live timeline scrubbing
  const handleScrubProgress = (progressPct: number) => {
    if (!selectedStar) return;
    const newStarState = calculateStellarEvolution(
      selectedStar.progenitorMass,
      progressPct
    );
    const newColorData = getStarColorRGB(newStarState.Teff, newStarState.phase);

    const updatedStar: StarSystem = {
      ...selectedStar,
      progressPct,
      starState: newStarState,
      colorData: newColorData,
    };

    setSelectedStar(updatedStar);
    setStars((prev) =>
      prev.map((s) => (s.id === updatedStar.id ? updatedStar : s))
    );
  };

  // Find random interesting target
  const handleRandomTarget = () => {
    if (stars.length === 0) return;
    const interesting = stars.filter(
      (s) =>
        s.hasHZPlanet ||
        s.colorData.cat === 'ob' ||
        s.starState.isRemnant
    );
    const target =
      interesting.length > 0
        ? interesting[Math.floor(Math.random() * interesting.length)]
        : stars[Math.floor(Math.random() * stars.length)];
    setSelectedStar(target);
    setSelectedPlanetIndex(0);
  };

  const morphologyLabels: Record<string, string> = {
    disk: 'Thin Disk',
    core: 'Globular Core',
    cluster: 'Open Cluster',
    halo: 'Galactic Halo',
  };

  return (
    <div className={`h-screen w-screen flex flex-col ${showUI ? 'p-2 gap-2' : 'p-0 gap-0'} bg-[#03050c] overflow-hidden relative`}>
      {/* Universal Floating HUD Toggle Button */}
      <button
        type="button"
        onClick={() => setShowUI((v) => !v)}
        className={`fixed top-3 right-3 z-50 px-2.5 py-1.5 rounded-xl border backdrop-blur-md shadow-2xl flex items-center gap-2 text-xs font-mono transition cursor-pointer select-none ${
          showUI
            ? 'bg-slate-950/85 hover:bg-slate-900 border-slate-700/80 text-slate-300 hover:text-white'
            : 'bg-slate-950/65 hover:bg-slate-900/90 border-slate-800/80 text-slate-400 hover:text-cyan-300 opacity-80 hover:opacity-100 shadow-cyan-950/40'
        }`}
        title="Toggle User Interface (Hotkey: U or H)"
      >
        {showUI ? (
          <>
            <EyeOff className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Hide UI</span>
            <kbd className="px-1 py-0.5 text-[9px] bg-slate-800 rounded text-slate-300 border border-slate-700 font-sans">
              U
            </kbd>
          </>
        ) : (
          <>
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Show UI</span>
            <kbd className="px-1 py-0.5 text-[9px] bg-slate-800/80 rounded text-slate-400 border border-slate-700 font-sans">
              U
            </kbd>
          </>
        )}
      </button>

      {/* Top Header Command Bar (Visible when UI is ON) */}
      {showUI && (
        <Header
          stars={stars}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          onRandomTarget={handleRandomTarget}
          starCount={config.starCount}
          morphologyLabel={morphologyLabels[config.morphology] || 'Sector'}
          activeApp={activeApp}
          onSelectApp={setActiveApp}
        />
      )}

      {/* Main Multi-App Viewport */}
      {activeApp === 'home' ? (
        <main className={`w-full flex-1 min-h-0 relative ${showUI ? 'rounded-xl glass-hud border border-slate-800/80' : 'rounded-none border-0'}`}>
          <ShowcaseHome onSelectApp={setActiveApp} />
        </main>
      ) : activeApp === 'galaxy-gen' ? (
        <main className={`w-full flex-1 min-h-0 relative ${showUI ? 'rounded-xl glass-hud border border-slate-800/80' : 'rounded-none border-0'}`}>
          <GalaxyGenApp
            onSelectSector={handleSelectGalaxySector}
            onGoHome={() => setActiveApp('home')}
            initialSelectedCoord={lastGalaxySector?.coord}
            returnTransition={returnToGalaxyTransition}
            showUI={showUI}
          />
        </main>
      ) : activeApp === 'sector-hex' ? (
        <main className={`w-full flex-1 min-h-0 relative ${showUI ? 'rounded-xl glass-hud border border-slate-800/80' : 'rounded-none border-0'}`}>
          <SectorHexApp
            initialConfig={sectorInitialConfig}
            onBackToGalaxy={handleBackToGalaxy}
            onLaunchStarGen={(params) => {
              setStarGenInitialParams(params);
              setActiveApp('stargen-lab');
            }}
            showUI={showUI}
          />
        </main>
      ) : activeApp === 'sector-3d' ? (
        <main
          ref={mainContainerRef}
          className="w-full flex-1 flex flex-row gap-0 min-h-0 relative overflow-hidden select-none"
        >
          {/* SEC-02: LEFT PANEL - Sector Controls */}
          {showUI && (
            <div
              style={{ width: `${colWidths.left}%` }}
              className="h-full flex flex-col min-w-[210px] flex-shrink-0"
            >
              <SectorControls
                config={config}
                onChangeConfig={(newCfg) => {
                  setConfig(newCfg);
                  handleRegenerate(newCfg);
                }}
                onRegenerate={() => handleRegenerate(config)}
                onNewSeed={handleNewSeed}
              />
            </div>
          )}

          {/* DRAGGABLE RESIZE DIVIDER 1 */}
          {showUI && (
            <div
              onMouseDown={() => startDrag('left')}
              onDoubleClick={resetColWidths}
              title="Drag horizontally to resize Left & Center panels • Double-click to reset"
              className="w-2 hover:w-2.5 h-full cursor-col-resize flex items-center justify-center group z-30 transition-all flex-shrink-0 px-0.5"
            >
              <div className="w-1 h-12 bg-slate-700/80 group-hover:bg-cyan-400 group-hover:h-20 group-hover:w-1.5 rounded-full transition-all shadow-sm" />
            </div>
          )}

          {/* SEC-03: CENTER PANEL - 3D Three.js Interactive Sector Canvas */}
          <section
            style={{ width: showUI ? `${colWidths.center}%` : '100%' }}
            className={`h-full flex-1 ${showUI ? 'rounded-xl glass-hud border border-slate-800/80' : 'rounded-none border-0'} flex flex-col relative overflow-hidden min-w-[240px]`}
          >
            <SectorView3D
              stars={stars}
              selectedStar={selectedStar}
              onSelectStar={(s) => {
                setSelectedStar(s);
                setSelectedPlanetIndex(0);
              }}
              activeFilter={activeFilter}
              radiusLy={config.radiusLy}
            />
          </section>

          {/* DRAGGABLE RESIZE DIVIDER 2 */}
          {showUI && (
            <div
              onMouseDown={() => startDrag('right')}
              onDoubleClick={resetColWidths}
              title="Drag horizontally to resize Center & Right panels • Double-click to reset"
              className="w-2 hover:w-2.5 h-full cursor-col-resize flex items-center justify-center group z-30 transition-all flex-shrink-0 px-0.5"
            >
              <div className="w-1 h-12 bg-slate-700/80 group-hover:bg-cyan-400 group-hover:h-20 group-hover:w-1.5 rounded-full transition-all shadow-sm" />
            </div>
          )}

          {/* SEC-04 through SEC-09: RIGHT PANEL - Deep Stellar & Planetary System Inspector */}
          {showUI && (
            <div
              style={{ width: `${colWidths.right}%` }}
              className="h-full flex flex-col min-w-[280px] flex-shrink-0"
            >
              <StellarInspector
                selectedStar={selectedStar}
                onScrubProgress={handleScrubProgress}
                selectedPlanetIndex={selectedPlanetIndex}
                onSelectPlanet={setSelectedPlanetIndex}
              />
            </div>
          )}
        </main>
      ) : activeApp === 'stargen-lab' ? (
        <main className={`w-full flex-1 min-h-0 relative ${showUI ? 'rounded-xl glass-hud border border-slate-800/80' : 'rounded-none border-0'}`}>
          <RealisticStarGenApp
            initialParams={starGenInitialParams}
            onBackToSectorHex={() => setActiveApp('sector-hex')}
            onOpenInArchitect={(archSys) => {
              setArchitectInitialSystem(archSys);
              setActiveApp('astro-architect');
            }}
            onInspectInSector3D={(starSys) => {
              setStars((prev) => [starSys, ...prev.filter((s) => s.id !== starSys.id)]);
              setSelectedStar(starSys);
              setSelectedPlanetIndex(0);
              setActiveApp('sector-3d');
            }}
            showUI={showUI}
          />
        </main>
      ) : (
        <main className={`w-full flex-1 min-h-0 relative ${showUI ? 'rounded-xl glass-hud border border-slate-800/80' : 'rounded-none border-0'}`}>
          <AstroArchitectApp
            onBackToSectorSim={() => setActiveApp('sector-3d')}
            onGoHome={() => setActiveApp('home')}
            initialSystem={architectInitialSystem}
            onOpenStarGenLab={() => setActiveApp('stargen-lab')}
            showUI={showUI}
          />
        </main>
      )}
    </div>
  );
};

