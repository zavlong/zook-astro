import React, { useState, useEffect, useRef } from 'react';
import { Clock, Maximize2 } from 'lucide-react';
import { R_EARTH_KM } from '../../core/astrophysics/constants';
import { StarSystem } from '../../types/astrophysics';
import { HRDiagramCanvas } from '../canvas/HRDiagramCanvas';
import { CircumstellarView3D } from '../canvas/CircumstellarView3D';
import { PlanetDossier } from './PlanetDossier';
import { ExpandedSolarSystemTheater } from './inspector/ExpandedSolarSystemTheater';

interface StellarInspectorProps {
  selectedStar: StarSystem | null;
  onScrubProgress: (progressPct: number) => void;
  selectedPlanetIndex: number;
  onSelectPlanet: (index: number) => void;
}

export const StellarInspector: React.FC<StellarInspectorProps> = ({
  selectedStar,
  onScrubProgress,
  selectedPlanetIndex,
  onSelectPlanet,
}) => {
  const [isExpanded3D, setIsExpanded3D] = useState(false);

  // Resizable dual-pane split ratio (percentage for HR diagram)
  const [dualSplit, setDualSplit] = useState(() => {
    try {
      const saved = localStorage.getItem('zook_astro_dual_split');
      if (saved) return parseFloat(saved);
    } catch {}
    return 48;
  });

  // Resizable dual-pane height in pixels
  const [dualHeight, setDualHeight] = useState(() => {
    try {
      const saved = localStorage.getItem('zook_astro_dual_height');
      if (saved) return parseInt(saved);
    } catch {}
    return 130;
  });

  const dualContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingDualSplitRef = useRef(false);
  const isDraggingHeightRef = useRef(false);
  const startDragYRef = useRef(0);
  const startHeightRef = useRef(130);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded3D) {
        setIsExpanded3D(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded3D]);

  // Handle dragging for dual split and height
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingDualSplitRef.current && dualContainerRef.current) {
        const rect = dualContainerRef.current.getBoundingClientRect();
        if (rect.width > 0) {
          const mouseX = e.clientX - rect.left;
          const pct = Math.max(20, Math.min(80, (mouseX / rect.width) * 100));
          setDualSplit(pct);
          try {
            localStorage.setItem('zook_astro_dual_split', pct.toString());
          } catch {}
        }
      }

      if (isDraggingHeightRef.current) {
        const deltaY = e.clientY - startDragYRef.current;
        const newHeight = Math.max(90, Math.min(420, startHeightRef.current + deltaY));
        setDualHeight(newHeight);
        try {
          localStorage.setItem('zook_astro_dual_height', newHeight.toString());
        } catch {}
      }
    };

    const handleMouseUp = () => {
      if (isDraggingDualSplitRef.current || isDraggingHeightRef.current) {
        isDraggingDualSplitRef.current = false;
        isDraggingHeightRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startDragSplit = () => {
    isDraggingDualSplitRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const startDragHeight = (e: React.MouseEvent) => {
    isDraggingHeightRef.current = true;
    startDragYRef.current = e.clientY;
    startHeightRef.current = dualHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const resetDualPanes = () => {
    setDualSplit(48);
    setDualHeight(130);
    try {
      localStorage.setItem('zook_astro_dual_split', '48');
      localStorage.setItem('zook_astro_dual_height', '130');
    } catch {}
  };

  if (!selectedStar) {
    return (
      <aside className="w-full h-full rounded-xl glass-hud p-4 border border-slate-800/80 flex items-center justify-center">
        <span className="text-slate-400 font-mono text-xs">
          Select a star to inspect its system.
        </span>
      </aside>
    );
  }

  const state = selectedStar.starState;

  // Format radius display
  let radText = '';
  if (state.radiusRsun < 0.0001) {
    radText = `${state.radiusKm.toFixed(1)} km (Compact)`;
  } else if (state.radiusRsun < 0.1) {
    radText = `${state.radiusRsun.toFixed(4)} R☉ (${(
      state.radiusKm / R_EARTH_KM
    ).toFixed(1)} R⊕)`;
  } else if (state.radiusAU >= 0.05) {
    radText = `${state.radiusRsun.toFixed(1)} R☉ (${state.radiusAU.toFixed(2)} AU)`;
  } else {
    radText = `${state.radiusRsun.toFixed(3)} R☉`;
  }

  return (
    <>
      <aside className="w-full h-full rounded-xl glass-hud p-2.5 border border-slate-800/80 flex flex-col gap-2 min-h-0 overflow-y-auto">
        {/* SEC-04: Star Header & Derived MK Classification Badge */}
        <div
          id="section-04-stellar-telemetry"
          data-section="Stellar Inspector & MK Telemetry"
          className="pb-1.5 border-b border-slate-800 flex items-center justify-between"
        >
          <div>
            <div className="flex items-center gap-2">
              <span
                className="w-3.5 h-3.5 rounded-full shadow-sm"
                style={{ backgroundColor: selectedStar.colorData.hex }}
              />
              <h2 className="text-sm font-bold text-white font-mono">
                {selectedStar.name}
              </h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-700 shadow">
                {state.spectralMK}
              </span>
              <span className="text-[8px] font-mono text-slate-500 bg-slate-900/60 px-1 py-0.2 rounded border border-slate-800">
                SEC-04
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              {state.spectralDesc} &bull; Age: {state.ageText}
            </p>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
            {state.phase.split('(')[0].trim()}
          </span>
        </div>

        {/* SEC-05: Evolution Timeline Scrubber */}
        <div
          id="section-05-timeline-scrubber"
          data-section="Evolutionary Timeline Scrubber"
          className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex flex-col gap-1"
        >
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 font-semibold flex items-center gap-1 text-[11px]">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Evolutionary Scrub (t)
              <span className="text-[8px] font-mono text-slate-500 bg-slate-950 px-1 py-0.2 rounded border border-slate-800 ml-1">
                SEC-05
              </span>
            </span>
            <span className="font-mono text-amber-300 font-bold text-xs">
              {state.ageText} ({state.phase.split('(')[0].trim()})
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="0.05"
            value={selectedStar.progressPct}
            onChange={(e) => onScrubProgress(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[8px] text-slate-500 font-mono">
            <span>0% ZAMS</span>
            <span>50% TAMS</span>
            <span>72% RGB/HB</span>
            <span>86% Unveil/SN</span>
            <span>100% Remnant</span>
          </div>
        </div>

        {/* Astrophysics Derived Telemetry Grid */}
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 bg-slate-900/50 p-2 rounded-lg border border-slate-800/80 text-[10px] font-mono">
          <div className="text-slate-400">Progenitor Mass:</div>
          <div className="text-right text-slate-200">
            {selectedStar.progenitorMass.toFixed(2)} M☉
          </div>

          <div className="text-slate-400">Current Mass:</div>
          <div className="text-right text-slate-200">
            {state.currentMass.toFixed(2)} M☉
          </div>

          <div className="text-slate-400">Stefan-Boltzmann R*:</div>
          <div className="text-right font-bold text-amber-300">{radText}</div>

          <div className="text-slate-400">Luminosity (L):</div>
          <div className="text-right text-slate-200">
            {state.L >= 100
              ? Math.round(state.L).toLocaleString()
              : state.L.toFixed(2)}{' '}
            L☉
          </div>

          <div className="text-slate-400">Effective Temp (Teff):</div>
          <div className="text-right text-slate-200">
            {state.Teff > 0
              ? `${Math.round(state.Teff).toLocaleString()} K`
              : 'Singularity (0 K)'}
          </div>

          <div className="text-slate-400">Inward HZ:</div>
          <div className="text-right font-bold text-emerald-400">
            {state.isSupernova
              ? 'Sterilized (SN)'
              : `${state.rInHZ.toFixed(2)} - ${state.rOutHZ.toFixed(2)} AU`}
          </div>

          {selectedStar.systemArchName && (
            <>
              <div className="text-slate-400">Hierarchy / Zone:</div>
              <div className="text-right text-cyan-300 font-semibold truncate">
                {selectedStar.systemArchName} &bull; Type {selectedStar.zoneArchetype || 'A'}
              </div>
            </>
          )}

          {selectedStar.diskMassEarth !== undefined && selectedStar.diskMassEarth > 0 && (
            <>
              <div className="text-slate-400">1-2% Disk / Snow:</div>
              <div className="text-right text-slate-200">
                {selectedStar.diskMassEarth} M⊕ &bull; {state.snowLineAU.toFixed(2)} AU
              </div>
            </>
          )}
        </div>

        {/* Companion Stars Banner (if Multi-Star System) */}
        {selectedStar.companionStars && selectedStar.companionStars.length > 0 && (
          <div className="bg-slate-900/70 px-2 py-1 rounded-lg border border-slate-800/80 flex flex-wrap items-center justify-between gap-1 text-[9px] font-mono">
            <span className="text-slate-400 font-semibold">Companion Stars:</span>
            <div className="flex flex-wrap gap-1.5">
              {selectedStar.companionStars.map((comp) => (
                <span
                  key={comp.label}
                  className="inline-flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-slate-200"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: comp.colorHex }}
                  />
                  <b>{comp.label}:</b> {comp.spectralType} ({comp.mass} M☉)
                </span>
              ))}
            </div>
          </div>
        )}

        {/* RESIZABLE DUAL LOWER PANES: HR TRACK & 3D CIRCUMSTELLAR ORBIT VIEW */}
        <div className="flex flex-col gap-1">
          <div
            ref={dualContainerRef}
            style={{ height: `${dualHeight}px` }}
            className="flex flex-row gap-0 w-full min-h-[90px] relative select-none"
          >
            {/* SEC-06: HR Diagram */}
            <div
              style={{ width: `${dualSplit}%` }}
              className="bg-slate-950 p-1.5 rounded-lg border border-slate-800 flex flex-col gap-1 min-w-[120px] flex-shrink-0 h-full overflow-hidden"
            >
              <div className="flex justify-between items-center text-[9.5px] font-mono">
                <span className="text-slate-300 font-bold uppercase flex items-center gap-1">
                  HR Track
                  <span className="text-[8px] text-slate-500 bg-slate-900 px-1 py-0.2 rounded border border-slate-800">
                    SEC-06
                  </span>
                </span>
                <span className="text-cyan-400 text-[8.5px]">
                  log L: {Math.log10(Math.max(1e-5, state.L)).toFixed(1)}
                </span>
              </div>
              <div className="flex-1 w-full min-h-0 overflow-hidden relative">
                <HRDiagramCanvas selectedStar={selectedStar} />
              </div>
            </div>

            {/* DUAL PANE HORIZONTAL RESIZER DIVIDER */}
            <div
              onMouseDown={startDragSplit}
              onDoubleClick={resetDualPanes}
              title="Drag horizontally to resize HR Track vs Solar System • Double-click to reset"
              className="w-2 hover:w-2.5 h-full cursor-col-resize flex items-center justify-center group z-10 transition-all flex-shrink-0 px-0.5"
            >
              <div className="w-1 h-8 bg-slate-700/80 group-hover:bg-cyan-400 group-hover:h-12 group-hover:w-1.5 rounded-full transition-all" />
            </div>

            {/* SEC-07: Circumstellar 3D Orbit View */}
            <div
              id="section-07-solar-system-3d"
              data-section="Circumstellar Solar System 3D Viewport"
              style={{ width: `${100 - dualSplit}%` }}
              className="bg-slate-950 p-1.5 rounded-lg border border-slate-800 flex flex-col gap-1 min-w-[140px] flex-1 h-full overflow-hidden relative"
            >
              <div className="flex justify-between items-center text-[9.5px] font-mono">
                <span className="text-slate-300 font-bold uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  3D Orbits &amp; HZ
                  <span className="text-[8px] text-slate-500 bg-slate-900 px-1 py-0.2 rounded border border-slate-800">
                    SEC-07
                  </span>
                </span>
                <button
                  onClick={() => setIsExpanded3D(true)}
                  className="text-[8.5px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-0.5 bg-cyan-950/70 hover:bg-cyan-900/80 px-1.5 py-0.5 rounded border border-cyan-800 transition shadow"
                  title="Blow Up Solar System View to Full 3D Theater"
                >
                  <Maximize2 className="w-2.5 h-2.5" />
                  Blow Up 3D
                </button>
              </div>
              <div className="flex-1 w-full min-h-0 rounded border border-slate-800/80 overflow-hidden relative">
                {!isExpanded3D && (
                  <CircumstellarView3D
                    selectedStar={selectedStar}
                    selectedPlanetIndex={selectedPlanetIndex}
                    onSelectPlanet={onSelectPlanet}
                    isExpanded={false}
                    onToggleExpand={() => setIsExpanded3D(true)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* DUAL PANE BOTTOM VERTICAL RESIZER HANDLE */}
          <div
            onMouseDown={startDragHeight}
            onDoubleClick={resetDualPanes}
            title="Drag vertically to stretch or shrink dual canvases height • Double-click to reset"
            className="w-full h-2 hover:h-2.5 cursor-row-resize flex items-center justify-center group transition-all my-0.5"
          >
            <div className="h-1 w-16 bg-slate-700/80 group-hover:bg-cyan-400 group-hover:w-28 group-hover:h-1.5 rounded-full transition-all" />
          </div>
        </div>

        {/* SEC-08 & SEC-09: Selected Planet Dossier & Fleet List */}
        <PlanetDossier
          selectedStar={selectedStar}
          selectedPlanetIndex={selectedPlanetIndex}
          onSelectPlanet={onSelectPlanet}
        />
      </aside>

      {/* SEC-10: EXPANDED 3D SOLAR SYSTEM THEATER MODAL */}
      {isExpanded3D && (
        <ExpandedSolarSystemTheater
          selectedStar={selectedStar}
          selectedPlanetIndex={selectedPlanetIndex}
          onSelectPlanet={onSelectPlanet}
          onClose={() => setIsExpanded3D(false)}
        />
      )}
    </>
  );
};
