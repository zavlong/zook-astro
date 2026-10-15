import React, { useState, useRef, useEffect } from 'react';
import {
  ArchitectSystem,
  GalaxySystemNode,
  Hyperlane,
  ArchitectViewMode,
  CELESTIAL_CLASSES,
  generateStellarisScript,
  computeRadialDistances,
  CelestialBody
} from '../../types/architect';
import { ARCHITECT_PRESETS, INITIAL_GALAXY_SYSTEMS, INITIAL_HYPERLANES } from '../../core/architect/presets';
import { AstroArchitectCanvas3D } from '../canvas/AstroArchitectCanvas3D';
import {
  STARGEN_BENCHMARK_PRESETS,
  convertRealisticToArchitectSystem,
  rollStep1,
  runRealisticGenerator,
} from '../../core/generation/realisticStarGen';

interface Props {
  onBackToSectorSim: () => void;
  onGoHome: () => void;
  initialSystem?: ArchitectSystem | null;
  onOpenStarGenLab?: () => void;
  showUI?: boolean;
}

export const AstroArchitectApp: React.FC<Props> = ({
  onBackToSectorSim,
  onGoHome,
  initialSystem,
  onOpenStarGenLab,
  showUI = false,
}) => {
  // Application State
  const [galaxySystems, setGalaxySystems] = useState<GalaxySystemNode[]>(INITIAL_GALAXY_SYSTEMS);
  const [hyperlanes, setHyperlanes] = useState<Hyperlane[]>(INITIAL_HYPERLANES);
  const [currentSystem, setCurrentSystem] = useState<ArchitectSystem>(
    initialSystem || ARCHITECT_PRESETS.sol
  );
  const [viewMode, setViewMode] = useState<ArchitectViewMode>('orrery');
  const [activeTab, setActiveTab] = useState<'design' | 'script' | 'json'>('design');
  const [galaxyTool, setGalaxyTool] = useState<'select' | 'add' | 'hyperlane' | 'delete'>('select');

  // Embedded Steps 1-6 Realistic StarGen State
  const [sgMass, setSgMass] = useState<number>(1.0);
  const [sgAge, setSgAge] = useState<number>(4.6);
  const [sgFeh, setSgFeh] = useState<number>(0.0);
  const [sgMult, setSgMult] = useState<'auto' | '1' | '2' | '3' | '4'>('auto');
  const [sgSummary, setSgSummary] = useState<string>('');

  useEffect(() => {
    if (initialSystem) {
      setCurrentSystem(initialSystem);
      setViewMode('orrery');
    }
  }, [initialSystem]);

  const handleSynthesizeRealisticSystem = (
    m = sgMass,
    a = sgAge,
    f = sgFeh,
    mult = sgMult
  ) => {
    const res = runRealisticGenerator({
      sysMass: m,
      age: a,
      feh: f,
      forcedMult: mult,
    });
    const archSys = convertRealisticToArchitectSystem(res, 0);
    setCurrentSystem(archSys);
    setViewMode('orrery');
    const z0 = res.zones[0];
    setSgSummary(
      `${res.hierarchy.archName} • ${
        z0 ? `Type ${z0.archetype} (${z0.diskMassEarth} M⊕ Disk, Snow ${z0.a_snow} AU)` : 'Cleared'
      }`
    );
  };

  const handleRollIMFInArchitect = () => {
    const p = rollStep1();
    setSgMass(p.sysMass);
    setSgAge(p.age);
    setSgFeh(p.feh);
    handleSynthesizeRealisticSystem(p.sysMass, p.age, p.feh, sgMult);
  };

  // Animation Controls
  const [simSpeed, setSimSpeed] = useState<number>(1.0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [copiedToast, setCopiedToast] = useState<boolean>(false);

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState<number>(480);
  const isDraggingSidebar = useRef<boolean>(false);
  const sidebarContainerRef = useRef<HTMLDivElement>(null);

  // Resize handler
  const startSidebarDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSidebar.current = true;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSidebar.current) return;
      const newWidth = Math.max(340, Math.min(800, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDraggingSidebar.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // System Selection from Galaxy
  const handleSelectSystemFromGalaxy = (sysId: string) => {
    if (ARCHITECT_PRESETS[sysId]) {
      setCurrentSystem(ARCHITECT_PRESETS[sysId]);
    } else {
      // Find or build from galaxy node
      const node = galaxySystems.find(s => s.id === sysId);
      if (node) {
        setCurrentSystem({
          id: `${node.id}_initializer`,
          _galaxyId: node.id,
          hierarchy: 'single',
          scaling: { scale: 50, exponent: 0.667, offset: 0 },
          star: { name: node.name, class: node.stars[0]?.class || 'pc_g_star', size: 30 },
          bodies: [
            { id: 'b1', name: `${node.name} Prime`, sma: 1.0, type: 'pc_continental', size: 19, speed: 1.0, moons: [] }
          ]
        });
      }
    }
    setViewMode('orrery');
  };

  // Add Galaxy System
  const handleAddGalaxySystem = (x: number, y: number, z: number) => {
    const newId = `sys_${Date.now()}`;
    const newNode: GalaxySystemNode = {
      id: newId,
      name: `Sector-${Math.floor(Math.random() * 900 + 100)}`,
      x,
      y,
      z,
      presetKey: null,
      desc: 'Newly Chartered Deep Space System',
      stars: [{ dx: 0, dy: 0, dz: 0, class: 'pc_g_star', size: 3.0 }]
    };
    setGalaxySystems(prev => [...prev, newNode]);
    setGalaxyTool('select');
  };

  // Delete Galaxy System
  const handleDeleteGalaxySystem = (sysId: string) => {
    setGalaxySystems(prev => prev.filter(s => s.id !== sysId));
    setHyperlanes(prev => prev.filter(([a, b]) => a !== sysId && b !== sysId));
  };

  // Connect Hyperlane
  const handleConnectHyperlane = (sysA: string, sysB: string) => {
    const exists = hyperlanes.some(
      ([a, b]) => (a === sysA && b === sysB) || (a === sysB && b === sysA)
    );
    if (!exists) {
      setHyperlanes(prev => [...prev, [sysA, sysB]]);
    }
    setGalaxyTool('select');
  };

  // Load Preset
  const handleLoadPreset = (key: string) => {
    if (ARCHITECT_PRESETS[key]) {
      setCurrentSystem(ARCHITECT_PRESETS[key]);
    }
  };

  // Update Body
  const updateBody = (index: number, patch: Partial<CelestialBody>) => {
    setCurrentSystem(prev => {
      const updated = [...prev.bodies];
      updated[index] = { ...updated[index], ...patch };
      return { ...prev, bodies: updated };
    });
  };

  // Add Body
  const addBody = (type: string = 'pc_continental') => {
    setCurrentSystem(prev => {
      const lastSMA = prev.bodies.length > 0 ? prev.bodies[prev.bodies.length - 1].sma : 0.4;
      const newSMA = parseFloat((lastSMA * 1.5 + 0.3).toFixed(2));
      const newBody: CelestialBody = {
        id: `b_${Date.now()}`,
        name: type === 'belt' ? 'Asteroid Belt Ring' : `${prev.star.name} ${String.fromCharCode(98 + prev.bodies.length)}`,
        sma: newSMA,
        type: type,
        size: type === 'belt' ? 4 : 18,
        speed: 1.0,
        moons: []
      };
      return { ...prev, bodies: [...prev.bodies, newBody] };
    });
  };

  // Remove Body
  const removeBody = (index: number) => {
    setCurrentSystem(prev => {
      const updated = prev.bodies.filter((_, i) => i !== index);
      return { ...prev, bodies: updated };
    });
  };

  // Move Body
  const moveBody = (index: number, delta: number) => {
    setCurrentSystem(prev => {
      const target = index + delta;
      if (target < 0 || target >= prev.bodies.length) return prev;
      const updated = [...prev.bodies];
      const temp = updated[index];
      updated[index] = updated[target];
      updated[target] = temp;
      return { ...prev, bodies: updated };
    });
  };

  // Sort by AU
  const sortByAU = () => {
    setCurrentSystem(prev => {
      const sorted = [...prev.bodies].sort((a, b) => a.sma - b.sma);
      return { ...prev, bodies: sorted };
    });
  };

  // Add Moon
  const addMoon = (bodyIndex: number) => {
    setCurrentSystem(prev => {
      const updated = [...prev.bodies];
      const body = updated[bodyIndex];
      const moonCount = body.moons.length;
      const newMoon = {
        id: `m_${Date.now()}`,
        name: `${body.name} ${['I', 'II', 'III', 'IV', 'V', 'VI'][moonCount] || 'Moon'}`,
        size: 7,
        dist: 3.5,
        type: 'pc_barren_cold',
        moons: []
      };
      body.moons = [...body.moons, newMoon];
      return { ...prev, bodies: updated };
    });
  };

  // Remove Moon
  const removeMoon = (bodyIndex: number, moonIndex: number) => {
    setCurrentSystem(prev => {
      const updated = [...prev.bodies];
      updated[bodyIndex].moons = updated[bodyIndex].moons.filter((_, mi) => mi !== moonIndex);
      return { ...prev, bodies: updated };
    });
  };

  // Add Sub-Moon
  const addSubMoon = (bodyIndex: number, moonIndex: number) => {
    setCurrentSystem(prev => {
      const updated = [...prev.bodies];
      const moon = updated[bodyIndex].moons[moonIndex];
      const newSubMoon = {
        id: `sm_${Date.now()}`,
        name: `${moon.name} Satellite`,
        size: 4,
        dist: 2.0,
        type: 'pc_barren_cold'
      };
      moon.moons = [...(moon.moons || []), newSubMoon];
      return { ...prev, bodies: updated };
    });
  };

  // Remove Sub-Moon
  const removeSubMoon = (bodyIndex: number, moonIndex: number, subMoonIndex: number) => {
    setCurrentSystem(prev => {
      const updated = [...prev.bodies];
      const moon = updated[bodyIndex].moons[moonIndex];
      moon.moons = moon.moons.filter((_, smi) => smi !== subMoonIndex);
      return { ...prev, bodies: updated };
    });
  };

  // Copy Stellaris Script
  const stellarisScript = generateStellarisScript(computeRadialDistances(currentSystem));
  const handleCopyScript = () => {
    navigator.clipboard.writeText(stellarisScript);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2500);
  };

  return (
    <div className="w-full h-full flex flex-row overflow-hidden bg-[#03050c] select-none text-slate-200">
      {/* LEFT PANEL: Resizable System Architect & Hierarchy Editor */}
      {showUI && (
        <>
        <aside
          ref={sidebarContainerRef}
          style={{ width: `${sidebarWidth}px` }}
          className="h-full flex flex-col flex-shrink-0 bg-slate-950/95 border-r border-slate-800/80 z-20 shadow-2xl overflow-hidden"
        >
        {/* Header Bar */}
        <div className="p-3 border-b border-slate-800/80 flex items-center justify-between gap-2 bg-slate-900/60">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-amber-500/20 text-amber-400 text-sm">🛠️</span>
            <div>
              <h2 className="text-xs font-bold text-white tracking-wider font-mono uppercase">Astro-Architect</h2>
              <p className="text-[10px] text-slate-400">System Hierarchy & Stellaris Mod Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onGoHome}
              className="px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[10px] font-mono transition-colors"
              title="Return to Home Showcase"
            >
              🏠 Home
            </button>
            <button
              onClick={onBackToSectorSim}
              className="px-2 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/60 text-[10px] font-mono transition-colors"
              title="Switch to 3D Sector Simulator"
            >
              🔭 3D Sector
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800/80 bg-slate-950/80 font-mono text-xs">
          <button
            onClick={() => setActiveTab('design')}
            className={`flex-1 py-2 text-center transition-all border-b-2 ${
              activeTab === 'design'
                ? 'border-amber-400 text-amber-400 font-bold bg-amber-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Hierarchy & Layout
          </button>
          <button
            onClick={() => setActiveTab('script')}
            className={`flex-1 py-2 text-center transition-all border-b-2 ${
              activeTab === 'script'
                ? 'border-amber-400 text-amber-400 font-bold bg-amber-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Stellaris Script
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`flex-1 py-2 text-center transition-all border-b-2 ${
              activeTab === 'json'
                ? 'border-amber-400 text-amber-400 font-bold bg-amber-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            JSON Config
          </button>
        </div>

        {/* Tab 1: Hierarchy & Layout */}
        {activeTab === 'design' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans text-xs custom-scrollbar">
            {/* Preset Selector */}
            <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 flex flex-col gap-1.5">
              <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold">Load Preset System</label>
              <select
                value={currentSystem._galaxyId || 'sol'}
                onChange={(e) => handleLoadPreset(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none font-mono"
              >
                <option value="sol">Sol (Solar System - 8 Planets + Belts)</option>
                <option value="alphacentauri">α Centauri (Trinary System)</option>
                <option value="sirius">Sirius (Binary with White Dwarf)</option>
                <option value="procyon">Procyon (Binary Subgiant)</option>
                <option value="gliese667">Gliese 667 (Trinary Super-Earths)</option>
                <option value="castor">Castor (Sextuple System)</option>
                <option value="arcturus">Arcturus (Swollen Orange Giant)</option>
                <option value="kepler90">Kepler-90 (8-Planet Resonant Solar Analog)</option>
                <option value="trappist1">TRAPPIST-1 (7 Terrestrial Worlds)</option>
                <option value="denebola">Denebola (Debris Disk Star)</option>
                <option value="sgra">Sagittarius A* (Supermassive Black Hole)</option>
              </select>
            </div>

            {/* Steps 1-6 Realistic StarGen Synthesizer Bridge */}
            <div className="p-2.5 rounded-lg bg-sky-950/25 border border-sky-800/60 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono uppercase text-sky-400 font-bold flex items-center gap-1.5">
                  <span>⚛️ Realistic StarGen (Steps 1–6)</span>
                </label>
                {onOpenStarGenLab && (
                  <button
                    type="button"
                    onClick={onOpenStarGenLab}
                    className="text-[9.5px] font-mono text-sky-300 hover:text-white bg-sky-900/60 hover:bg-sky-800 px-1.5 py-0.5 rounded border border-sky-700 transition cursor-pointer"
                  >
                    Open Full Lab &rarr;
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                <div>
                  <span className="text-slate-400 block">Mass: {sgMass} M☉</span>
                  <input
                    type="range"
                    min="0.09"
                    max="6.0"
                    step="0.05"
                    value={sgMass}
                    onChange={(e) => setSgMass(parseFloat(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>
                <div>
                  <span className="text-slate-400 block">Age: {sgAge} Gyr</span>
                  <input
                    type="range"
                    min="0.05"
                    max="13.0"
                    step="0.1"
                    value={sgAge}
                    onChange={(e) => setSgAge(parseFloat(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>
                <div>
                  <span className="text-slate-400 block">[Fe/H]: {sgFeh >= 0 ? `+${sgFeh}` : sgFeh}</span>
                  <input
                    type="range"
                    min="-1.8"
                    max="0.5"
                    step="0.05"
                    value={sgFeh}
                    onChange={(e) => setSgFeh(parseFloat(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={sgMult}
                  onChange={(e) => setSgMult(e.target.value as any)}
                  className="bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-[10.5px] text-white font-mono"
                >
                  <option value="auto">Multiplicity: Auto</option>
                  <option value="1">Force 1 Star</option>
                  <option value="2">Force 2 Stars</option>
                  <option value="3">Force 3 Stars</option>
                  <option value="4">Force 4 Stars</option>
                </select>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const p = STARGEN_BENCHMARK_PRESETS[e.target.value];
                    if (p) {
                      setSgMass(p.sysMass);
                      setSgAge(p.age);
                      setSgFeh(p.feh);
                      setSgMult(p.forcedMult);
                      handleSynthesizeRealisticSystem(p.sysMass, p.age, p.feh, p.forcedMult);
                    }
                  }}
                  className="bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-[10.5px] text-white font-mono"
                >
                  <option value="">-- StarGen Preset --</option>
                  {Object.entries(STARGEN_BENCHMARK_PRESETS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label.split('(')[0].trim()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSynthesizeRealisticSystem()}
                  className="flex-1 py-1.5 rounded bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-[10.5px] font-mono border border-sky-400/60 shadow cursor-pointer transition"
                >
                  ⚡ Synthesize System
                </button>
                <button
                  type="button"
                  onClick={handleRollIMFInArchitect}
                  className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-sky-300 font-semibold text-[10.5px] font-mono border border-slate-700 cursor-pointer transition"
                >
                  🎲 Pure IMF Roll
                </button>
              </div>

              {sgSummary && (
                <div className="text-[9.5px] font-mono text-emerald-300 bg-emerald-950/30 border border-emerald-800/50 rounded px-2 py-1">
                  {sgSummary}
                </div>
              )}
            </div>

            {/* System Hierarchy Configuration */}
            <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 flex flex-col gap-2">
              <label className="text-[10px] font-mono uppercase text-amber-400 font-semibold">System Configuration</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">System Identifier</span>
                  <input
                    type="text"
                    value={currentSystem.id}
                    onChange={(e) => setCurrentSystem(prev => ({ ...prev, id: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs text-white focus:border-amber-400 font-mono"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Hierarchy Mode</span>
                  <select
                    value={currentSystem.hierarchy}
                    onChange={(e) => setCurrentSystem(prev => ({ ...prev, hierarchy: e.target.value as any }))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs text-white focus:border-amber-400"
                  >
                    <option value="single">Single Star</option>
                    <option value="circumbinary">Circumbinary Pair (P-Type)</option>
                    <option value="s_type_binary">S-Type Binary Companion</option>
                  </select>
                </div>
              </div>

              {/* Primary Star */}
              <div className="mt-1 pt-2 border-t border-slate-800/80 grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Primary Star</span>
                  <input
                    type="text"
                    value={currentSystem.star.name}
                    onChange={(e) => setCurrentSystem(prev => ({ ...prev, star: { ...prev.star, name: e.target.value } }))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Class</span>
                  <select
                    value={currentSystem.star.class}
                    onChange={(e) => setCurrentSystem(prev => ({ ...prev, star: { ...prev.star, class: e.target.value } }))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs text-white"
                  >
                    <option value="pc_g_star">G-Type Yellow</option>
                    <option value="pc_m_star">M-Type Red Dwarf</option>
                    <option value="pc_k_star">K-Type Orange</option>
                    <option value="pc_f_star">F-Type White</option>
                    <option value="pc_a_star">A-Type Luminous</option>
                    <option value="pc_b_star">B-Type Blue Giant</option>
                    <option value="pc_white_dwarf">White Dwarf</option>
                    <option value="pc_neutron_star">Neutron Star</option>
                    <option value="pc_black_hole">Black Hole</option>
                  </select>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Size</span>
                  <input
                    type="number"
                    value={currentSystem.star.size}
                    onChange={(e) => setCurrentSystem(prev => ({ ...prev, star: { ...prev.star, size: parseFloat(e.target.value) || 20 } }))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
              </div>

              {/* Secondary Companion Star (if binary) */}
              {currentSystem.hierarchy !== 'single' && currentSystem.star2 && (
                <div className="pt-2 border-t border-slate-800/80 grid grid-cols-4 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-0.5">Companion</span>
                    <input
                      type="text"
                      value={currentSystem.star2.name}
                      onChange={(e) => setCurrentSystem(prev => ({ ...prev, star2: { ...prev.star2!, name: e.target.value } }))}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-0.5">Class</span>
                    <select
                      value={currentSystem.star2.class}
                      onChange={(e) => setCurrentSystem(prev => ({ ...prev, star2: { ...prev.star2!, class: e.target.value } }))}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs text-white"
                    >
                      <option value="pc_k_star">K-Type Orange</option>
                      <option value="pc_m_star">M-Type Red</option>
                      <option value="pc_white_dwarf">White Dwarf</option>
                      <option value="pc_g_star">G-Type</option>
                      <option value="pc_a_star">A-Type</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-0.5">Size</span>
                    <input
                      type="number"
                      value={currentSystem.star2.size}
                      onChange={(e) => setCurrentSystem(prev => ({ ...prev, star2: { ...prev.star2!, size: parseFloat(e.target.value) || 16 } }))}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-0.5">Distance</span>
                    <input
                      type="number"
                      value={currentSystem.star2.dist || 14}
                      onChange={(e) => setCurrentSystem(prev => ({ ...prev, star2: { ...prev.star2!, dist: parseFloat(e.target.value) || 14 } }))}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Orbit Conversion Scaling Model */}
            <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono uppercase text-cyan-400 font-semibold">Coordinate Scaling Model</label>
                <span className="text-[10px] font-mono text-slate-400">
                  r = {currentSystem.scaling.scale} · (a^{currentSystem.scaling.exponent}) + {currentSystem.scaling.offset}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Scale</span>
                  <input
                    type="number"
                    value={currentSystem.scaling.scale}
                    onChange={(e) => setCurrentSystem(prev => ({ ...prev, scaling: { ...prev.scaling, scale: parseFloat(e.target.value) || 50 } }))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Exponent</span>
                  <input
                    type="number"
                    step="0.05"
                    value={currentSystem.scaling.exponent}
                    onChange={(e) => setCurrentSystem(prev => ({ ...prev, scaling: { ...prev.scaling, exponent: parseFloat(e.target.value) || 0.667 } }))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block mb-0.5">Offset</span>
                  <input
                    type="number"
                    value={currentSystem.scaling.offset}
                    onChange={(e) => setCurrentSystem(prev => ({ ...prev, scaling: { ...prev.scaling, offset: parseFloat(e.target.value) || 0 } }))}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            {/* Hierarchical Bodies List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono uppercase text-slate-300 font-bold tracking-wider">
                  System Bodies ({currentSystem.bodies.length})
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={sortByAU}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-mono"
                  >
                    Sort AU
                  </button>
                  <button
                    onClick={() => addBody('pc_continental')}
                    className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-mono font-semibold"
                  >
                    + Planet
                  </button>
                  <button
                    onClick={() => addBody('belt')}
                    className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[10px] font-mono"
                  >
                    + Belt
                  </button>
                </div>
              </div>

              {currentSystem.bodies.map((body, bIndex) => {
                const isBelt = body.type === 'belt';
                return (
                  <div key={body.id || bIndex} className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 flex flex-col gap-2 relative group hover:border-slate-700 transition-colors">
                    {/* Top Row: Reorder & Delete */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <span className="text-[10px] font-mono text-slate-500">#{bIndex + 1}</span>
                        <input
                          type="text"
                          value={body.name}
                          onChange={(e) => updateBody(bIndex, { name: e.target.value })}
                          className="flex-1 bg-slate-950 border border-slate-700/60 rounded px-2 py-0.5 text-xs font-semibold text-white focus:border-amber-400"
                        />
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => moveBody(bIndex, -1)}
                          disabled={bIndex === 0}
                          className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-[10px] font-mono"
                          title="Move Closer to Star"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveBody(bIndex, 1)}
                          disabled={bIndex === currentSystem.bodies.length - 1}
                          className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-[10px] font-mono"
                          title="Move Farther from Star"
                        >
                          ▼
                        </button>
                        <button
                          onClick={() => removeBody(bIndex)}
                          className="px-1.5 py-0.5 bg-red-950/60 hover:bg-red-900 text-red-300 rounded text-[10px] font-mono ml-1"
                          title="Delete Body"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Parameters Grid */}
                    <div className="grid grid-cols-4 gap-1.5 text-[10px]">
                      <div>
                        <span className="text-slate-400 block mb-0.5">SMA (AU)</span>
                        <input
                          type="number"
                          step="0.05"
                          value={body.sma}
                          onChange={(e) => updateBody(bIndex, { sma: parseFloat(e.target.value) || 0.1 })}
                          className="w-full bg-slate-950 border border-slate-700/60 rounded px-1.5 py-0.5 text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-0.5">Size</span>
                        <input
                          type="number"
                          value={body.size}
                          onChange={(e) => updateBody(bIndex, { size: parseFloat(e.target.value) || 10 })}
                          className="w-full bg-slate-950 border border-slate-700/60 rounded px-1.5 py-0.5 text-xs text-white"
                        />
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 block mb-0.5">Celestial Class</span>
                        <select
                          value={body.type}
                          onChange={(e) => updateBody(bIndex, { type: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700/60 rounded px-1.5 py-0.5 text-xs text-white"
                        >
                          {CELESTIAL_CLASSES.map(cls => (
                            <option key={cls.value} value={cls.value}>{cls.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {!isBelt && (
                      <div className="flex items-center gap-3 pt-1 border-t border-slate-800/60">
                        <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-300">
                          <input
                            type="checkbox"
                            checked={!!body.ring}
                            onChange={(e) => updateBody(bIndex, { ring: e.target.checked })}
                            className="rounded bg-slate-950 border-slate-700 text-amber-500"
                          />
                          Gas Ring System
                        </label>

                        <button
                          onClick={() => addMoon(bIndex)}
                          className="ml-auto text-[10px] font-mono text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40"
                        >
                          + Add Moon ({body.moons?.length || 0})
                        </button>
                      </div>
                    )}

                    {/* Nested Moons Container */}
                    {!isBelt && body.moons && body.moons.length > 0 && (
                      <div className="mt-1 pl-3 border-l-2 border-cyan-500/30 space-y-1.5">
                        {body.moons.map((moon, mIndex) => (
                          <div key={moon.id || mIndex} className="p-2 rounded bg-slate-950/70 border border-slate-800/60 flex flex-col gap-1 text-[10px]">
                            <div className="flex items-center justify-between">
                              <input
                                type="text"
                                value={moon.name}
                                onChange={(e) => {
                                  const updatedMoons = [...body.moons];
                                  updatedMoons[mIndex].name = e.target.value;
                                  updateBody(bIndex, { moons: updatedMoons });
                                }}
                                className="bg-slate-900 border border-slate-700/50 rounded px-1.5 py-0.5 text-xs text-slate-200"
                              />
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => addSubMoon(bIndex, mIndex)}
                                  className="text-[9px] font-mono text-indigo-300 hover:text-indigo-200 bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-800/40"
                                >
                                  + Sub-Moon ({moon.moons?.length || 0})
                                </button>
                                <button
                                  onClick={() => removeMoon(bIndex, mIndex)}
                                  className="text-red-400 hover:text-red-300 px-1"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-1">
                              <div>
                                <span className="text-slate-500">Size</span>
                                <input
                                  type="number"
                                  value={moon.size}
                                  onChange={(e) => {
                                    const updatedMoons = [...body.moons];
                                    updatedMoons[mIndex].size = parseFloat(e.target.value) || 5;
                                    updateBody(bIndex, { moons: updatedMoons });
                                  }}
                                  className="w-full bg-slate-900 border border-slate-700/50 rounded px-1 py-0.5 text-slate-300"
                                />
                              </div>
                              <div>
                                <span className="text-slate-500">&Delta;r</span>
                                <input
                                  type="number"
                                  step="0.5"
                                  value={moon.dist}
                                  onChange={(e) => {
                                    const updatedMoons = [...body.moons];
                                    updatedMoons[mIndex].dist = parseFloat(e.target.value) || 3;
                                    updateBody(bIndex, { moons: updatedMoons });
                                  }}
                                  className="w-full bg-slate-900 border border-slate-700/50 rounded px-1 py-0.5 text-slate-300"
                                />
                              </div>
                              <div>
                                <span className="text-slate-500">Class</span>
                                <select
                                  value={moon.type}
                                  onChange={(e) => {
                                    const updatedMoons = [...body.moons];
                                    updatedMoons[mIndex].type = e.target.value;
                                    updateBody(bIndex, { moons: updatedMoons });
                                  }}
                                  className="w-full bg-slate-900 border border-slate-700/50 rounded px-1 py-0.5 text-slate-300"
                                >
                                  <option value="pc_barren_cold">Cold Barren</option>
                                  <option value="pc_frozen">Frozen</option>
                                  <option value="pc_molten">Molten</option>
                                  <option value="pc_continental">Continental</option>
                                  <option value="pc_toxic">Toxic</option>
                                </select>
                              </div>
                            </div>

                            {/* Nested Sub-Moons */}
                            {moon.moons && moon.moons.length > 0 && (
                              <div className="mt-1 pl-2.5 border-l-2 border-indigo-500/30 space-y-1">
                                {moon.moons.map((subMoon, smIndex) => (
                                  <div key={subMoon.id || smIndex} className="p-1 rounded bg-slate-900/90 border border-slate-800/50 flex items-center justify-between gap-1 text-[9px]">
                                    <input
                                      type="text"
                                      value={subMoon.name}
                                      onChange={(e) => {
                                        const updatedMoons = [...body.moons];
                                        updatedMoons[mIndex].moons[smIndex].name = e.target.value;
                                        updateBody(bIndex, { moons: updatedMoons });
                                      }}
                                      className="bg-transparent text-slate-300 font-mono w-28 px-1"
                                    />
                                    <span className="text-slate-500">Sz: {subMoon.size}</span>
                                    <span className="text-slate-500">&Delta;r: {subMoon.dist}</span>
                                    <button
                                      onClick={() => removeSubMoon(bIndex, mIndex, smIndex)}
                                      className="text-red-400 hover:text-red-300 px-1"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Stellaris Script Generator */}
        {activeTab === 'script' && (
          <div className="flex-1 flex flex-col p-3 overflow-hidden font-mono text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Generated Initializer</span>
              <button
                onClick={handleCopyScript}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold shadow flex items-center gap-1.5 transition-all"
              >
                {copiedToast ? '✓ Copied!' : '📋 Copy to Clipboard'}
              </button>
            </div>
            <pre className="flex-1 bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-y-auto text-[11px] leading-relaxed select-text font-mono">
              <code>{stellarisScript}</code>
            </pre>
          </div>
        )}

        {/* Tab 3: JSON Config */}
        {activeTab === 'json' && (
          <div className="flex-1 flex flex-col p-3 overflow-hidden font-mono text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Active System JSON</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(currentSystem, null, 2));
                  setCopiedToast(true);
                  setTimeout(() => setCopiedToast(false), 2000);
                }}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold"
              >
                {copiedToast ? '✓ Copied' : 'Copy JSON'}
              </button>
            </div>
            <pre className="flex-1 bg-slate-950 p-3 rounded-lg border border-slate-800 text-cyan-300/90 overflow-y-auto text-[11px] select-text">
              <code>{JSON.stringify(currentSystem, null, 2)}</code>
            </pre>
          </div>
        )}
      </aside>

      {/* DRAG-TO-RESIZE HANDLE */}
      <div
        onMouseDown={startSidebarDrag}
        title="Drag horizontally to resize panel width"
        className="w-2 hover:w-2.5 h-full cursor-col-resize flex items-center justify-center group z-30 transition-all flex-shrink-0 bg-transparent px-0.5"
      >
        <div className="w-1 h-16 bg-slate-700/80 group-hover:bg-amber-400 group-hover:h-24 group-hover:w-1.5 rounded-full transition-all shadow-md" />
      </div>
      </>
      )}

      {/* RIGHT VIEWPORT: 3D Three.js Interactive Galaxy & Orrery Canvas */}
      <main className="flex-1 h-full flex flex-col relative overflow-hidden">
        {/* Top 3D Control Ribbon */}
        {showUI && (
          <div className="h-11 px-4 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md flex items-center justify-between z-10 font-mono text-xs">
          {/* Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setViewMode('galaxy')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                viewMode === 'galaxy'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🌌 3D Galaxy Map
            </button>
            <button
              onClick={() => setViewMode('orrery')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                viewMode === 'orrery'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🪐 3D System Orrery
            </button>
            <button
              onClick={() => setViewMode('linear')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                viewMode === 'linear'
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📏 3D Linear Track
            </button>
          </div>

          {/* Galaxy Tools (if in galaxy view) */}
          {viewMode === 'galaxy' && (
            <div className="flex items-center gap-1.5 bg-slate-900/90 px-2 py-1 rounded-lg border border-slate-800 text-[11px]">
              <span className="text-slate-400 text-[10px]">Tool:</span>
              <button
                onClick={() => setGalaxyTool('select')}
                className={`px-2 py-0.5 rounded ${galaxyTool === 'select' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Inspect
              </button>
              <button
                onClick={() => setGalaxyTool('add')}
                className={`px-2 py-0.5 rounded ${galaxyTool === 'add' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                title="Click on galactic plane to place new star system"
              >
                + System
              </button>
              <button
                onClick={() => setGalaxyTool('hyperlane')}
                className={`px-2 py-0.5 rounded ${galaxyTool === 'hyperlane' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                title="Click two star systems to connect hyperlane"
              >
                🔗 Link
              </button>
              <button
                onClick={() => setGalaxyTool('delete')}
                className={`px-2 py-0.5 rounded ${galaxyTool === 'delete' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'}`}
                title="Click star system to delete"
              >
                🗑️ Remove
              </button>
            </div>
          )}

          {/* Simulation Time & Speed Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-semibold"
            >
              {isPaused ? '▶ Play' : '⏸ Pause'}
            </button>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400">Speed:</span>
              <input
                type="range"
                min="0.1"
                max="4.0"
                step="0.1"
                value={simSpeed}
                onChange={(e) => setSimSpeed(parseFloat(e.target.value))}
                className="w-20 accent-amber-500"
              />
              <span className="text-[10px] text-amber-400 font-mono w-8">{simSpeed.toFixed(1)}x</span>
            </div>
          </div>
        </div>
        )}

        {/* 3D Viewport Component */}
        <div className="flex-1 w-full relative">
          <AstroArchitectCanvas3D
            currentSystem={computeRadialDistances(currentSystem)}
            galaxySystems={galaxySystems}
            hyperlanes={hyperlanes}
            viewMode={viewMode}
            simSpeed={simSpeed}
            isPaused={isPaused}
            onSelectSystemFromGalaxy={handleSelectSystemFromGalaxy}
            onAddGalaxySystem={handleAddGalaxySystem}
            galaxyTool={galaxyTool}
            onDeleteGalaxySystem={handleDeleteGalaxySystem}
            onConnectHyperlane={handleConnectHyperlane}
          />
        </div>
      </main>
    </div>
  );
};
