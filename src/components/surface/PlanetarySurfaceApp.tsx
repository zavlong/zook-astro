import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Globe,
  Shuffle,
  ChevronDown,
} from 'lucide-react';
import {
  RealisticPlanetBody,
  RealisticPlanetaryZone,
  RealisticPlanetOrBelt,
  runRealisticGenerator,
} from '../../core/generation/realisticStarGen';
import { RealisticMoon, RealisticStarNode } from '../../types/astrophysics';
import { PlanetarySurfaceExplorer } from '../stargen/surface/PlanetarySurfaceExplorer';

export interface PlanetarySurfaceTarget {
  planet: RealisticPlanetBody;
  moon?: RealisticMoon | null;
  zone: RealisticPlanetaryZone;
  stars: RealisticStarNode[];
}

interface PlanetarySurfaceAppProps {
  initialTarget?: PlanetarySurfaceTarget | null;
  onBackToStarGen?: () => void;
}

export const PlanetarySurfaceApp: React.FC<PlanetarySurfaceAppProps> = ({
  initialTarget,
  onBackToStarGen,
}) => {
  // Fallback procedural system if opened directly
  const defaultSystem = useMemo(() => {
    return runRealisticGenerator({
      sysMass: 1.0,
      age: 4.6,
      feh: 0.0,
      id: 'surface_default_sol',
      name: 'Sol System',
      forcedMult: 'auto',
    });
  }, []);

  const [currentTarget, setCurrentTarget] = useState<PlanetarySurfaceTarget>(() => {
    if (initialTarget) return initialTarget;
    const defaultZone = defaultSystem.zones[0];
    const defaultPlanet =
      (defaultZone.bodies.find((b: RealisticPlanetOrBelt) => b.kind === 'planet') as RealisticPlanetBody) ||
      (defaultZone.bodies[0] as RealisticPlanetBody);
    return {
      planet: defaultPlanet,
      moon: null,
      zone: defaultZone,
      stars: defaultSystem.hierarchy.stars,
    };
  });

  // Extract all planets and moons from the current zone for quick switching
  const availableBodies = useMemo(() => {
    const list: Array<{
      label: string;
      planet: RealisticPlanetBody;
      moon?: RealisticMoon | null;
    }> = [];

    currentTarget.zone.bodies.forEach((b: RealisticPlanetOrBelt, bIdx: number) => {
      if (b.kind === 'planet') {
        list.push({
          label: `Planet #${bIdx + 1}: ${b.planetClass.replace(/\s*\([^)]*\)/g, '')}`,
          planet: b,
          moon: null,
        });
        b.moons.forEach((m: RealisticMoon) => {
          list.push({
            label: `└─ 🌙 Moon ${m.name} (${m.moonClass})`,
            planet: b,
            moon: m,
          });
        });
      }
    });

    return list;
  }, [currentTarget.zone]);

  const handleRandomExoplanet = () => {
    const randomMass = +(0.3 + Math.random() * 1.8).toFixed(2);
    const randomAge = +(1.0 + Math.random() * 8.0).toFixed(1);
    const randomFeh = +(-0.4 + Math.random() * 0.8).toFixed(2);
    const randSeed = `exo_${Math.floor(Math.random() * 999999)}`;
    const sys = runRealisticGenerator({
      sysMass: randomMass,
      age: randomAge,
      feh: randomFeh,
      id: randSeed,
      name: 'Exoplanetary System',
      forcedMult: 'auto',
    });
    const z = sys.zones[0];
    const p = (z.bodies.find((b: RealisticPlanetOrBelt) => b.kind === 'planet') as RealisticPlanetBody) || (z.bodies[0] as RealisticPlanetBody);
    setCurrentTarget({
      planet: p,
      moon: null,
      zone: z,
      stars: sys.hierarchy.stars,
    });
  };

  const activeTitle = currentTarget.moon
    ? `Moon ${currentTarget.moon.name} (${currentTarget.moon.moonClass})`
    : currentTarget.planet.planetClass;

  return (
    <div className="w-full h-full min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-mono select-none">
      {/* Top Application Bar */}
      <header className="w-full bg-[#0d1422] border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md z-20">
        <div className="flex items-center gap-3">
          {onBackToStarGen && (
            <button
              type="button"
              onClick={onBackToStarGen}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Return to 3D System Orrery (PageUp)"
            >
              <ArrowLeft className="w-4 h-4 text-cyan-400" />
              <span>Back to Orrery</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-600 via-sky-600 to-indigo-600 flex items-center justify-center shadow-md shadow-amber-500/20">
              <Globe className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                  PLANETARY SURFACE GENERATOR
                </h1>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-700/80 text-amber-300 font-bold">
                  View Level 0
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400">
                {activeTitle} &bull; a = {currentTarget.planet.a} AU &bull; {currentTarget.stars[0]?.label || 'Star'}
              </p>
            </div>
          </div>
        </div>

        {/* World Switcher Dropdown & Randomizer */}
        <div className="flex items-center gap-2">
          {availableBodies.length > 1 && (
            <div className="relative">
              <select
                value={
                  currentTarget.moon
                    ? `${currentTarget.planet.planetClass}_${currentTarget.moon.name}`
                    : currentTarget.planet.planetClass
                }
                onChange={(e) => {
                  const selected = availableBodies.find((b: { planet: RealisticPlanetBody; moon?: RealisticMoon | null }) => {
                    const id = b.moon
                      ? `${b.planet.planetClass}_${b.moon.name}`
                      : b.planet.planetClass;
                    return id === e.target.value;
                  });
                  if (selected) {
                    setCurrentTarget((prev) => ({
                      ...prev,
                      planet: selected.planet,
                      moon: selected.moon,
                    }));
                  }
                }}
                className="appearance-none bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 pr-8 cursor-pointer hover:border-slate-600 focus:outline-none focus:border-cyan-500"
              >
                {availableBodies.map((b) => {
                  const key = b.moon
                    ? `${b.planet.planetClass}_${b.moon.name}`
                    : b.planet.planetClass;
                  return (
                    <option key={key} value={key}>
                      {b.label}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          <button
            type="button"
            onClick={handleRandomExoplanet}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 text-xs flex items-center gap-1.5 transition cursor-pointer"
            title="Generate Random Exoplanet Surface"
          >
            <Shuffle className="w-3.5 h-3.5 text-indigo-400" />
            <span>Random World</span>
          </button>
        </div>
      </header>

      {/* Main Body Surface Explorer */}
      <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
        <PlanetarySurfaceExplorer
          planet={currentTarget.planet}
          moon={currentTarget.moon}
          zone={currentTarget.zone}
          stars={currentTarget.stars}
        />
      </main>
    </div>
  );
};
