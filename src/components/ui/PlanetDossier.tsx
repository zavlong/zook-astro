import React, { useState, useEffect } from 'react';
import { M_JUP_EARTH, R_JUP_EARTH } from '../../core/astrophysics/constants';
import { computePlanetPhysics } from '../../core/generation/planets';
import { StarSystem } from '../../types/astrophysics';

interface PlanetDossierProps {
  selectedStar: StarSystem;
  selectedPlanetIndex: number;
  onSelectPlanet: (index: number) => void;
}

export const PlanetDossier: React.FC<PlanetDossierProps> = ({
  selectedStar,
  selectedPlanetIndex,
  onSelectPlanet,
}) => {
  const [selectedMoonIdx, setSelectedMoonIdx] = useState<number | null>(null);

  useEffect(() => {
    setSelectedMoonIdx(null);
  }, [selectedStar.id, selectedPlanetIndex]);

  const curPlanet = selectedStar.planets[selectedPlanetIndex] || selectedStar.planets[0];
  if (!curPlanet) return null;

  const pPhys = computePlanetPhysics(
    curPlanet,
    selectedStar.starState,
    selectedStar.progenitorMass
  );

  const getBadgeStyle = (status: string, isEngulfed: boolean) => {
    if (isEngulfed) {
      return 'bg-rose-950 text-rose-300 border-rose-800';
    }
    if (status === 'Candidate Habitable') {
      return 'bg-emerald-950 text-emerald-300 border-emerald-700 animate-pulse';
    }
    if (status.includes('Scorched') || status.includes('Runaway')) {
      return 'bg-orange-950 text-orange-300 border-orange-800';
    }
    return 'bg-slate-900 text-slate-300 border-slate-750';
  };

  const activeMoon =
    selectedMoonIdx !== null && curPlanet.moons ? curPlanet.moons[selectedMoonIdx] : null;

  const rockPct = (((activeMoon ? activeMoon.rockFrac : curPlanet.rockFrac) ?? 1) * 100).toFixed(1);
  const icePct = (((activeMoon ? activeMoon.iceFrac : curPlanet.iceFrac) ?? 0) * 100).toFixed(1);
  const gasPct = (((activeMoon ? activeMoon.gasFrac : curPlanet.gasFrac) ?? 0) * 100).toFixed(1);

  const activeGases = activeMoon ? activeMoon.gases : curPlanet.gases;
  const gasKeys = activeGases ? Object.keys(activeGases) : [];
  const gasBreakdown = gasKeys
    .map((k) => `${k}: ${((activeGases![k] || 0) * 100).toFixed(1)}%`)
    .join(' · ');

  const activeHydro = activeMoon ? activeMoon.hydrosphere : curPlanet.hydrosphere;
  const activeMagField = activeMoon ? activeMoon.magneticField : curPlanet.magneticField;

  return (
    <div className="flex flex-col gap-2">
      {/* Active Planet / Moon Dossier Card */}
      <div
        id="section-08-planet-dossier"
        data-section="Selected Exoplanet Dossier"
        className="bg-slate-900/90 rounded-lg border border-cyan-800/60 p-2 flex flex-col gap-1.5 shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: curPlanet.color }}
            />
            <span className="text-xs font-bold text-white font-mono">
              {activeMoon ? `${curPlanet.name} · ${activeMoon.name}` : curPlanet.name}
            </span>
            <span className="text-[9.5px] font-mono text-cyan-400 font-semibold">
              {activeMoon ? activeMoon.moonClass : curPlanet.type}
            </span>
            <span className="text-[8px] font-mono text-slate-500 bg-slate-950 px-1 py-0.2 rounded border border-slate-800">
              SEC-08
            </span>
          </div>
          {activeMoon ? (
            <button
              onClick={() => setSelectedMoonIdx(null)}
              className="px-2 py-0.5 rounded text-[8.5px] font-mono border border-cyan-600 bg-cyan-950/80 text-cyan-200 hover:bg-cyan-900 font-bold"
            >
              ← Planet View
            </button>
          ) : (
            <span
              className={`px-2 py-0.2 rounded text-[9px] font-mono border font-bold flex-shrink-0 ${getBadgeStyle(
                pPhys.status,
                pPhys.isEngulfed
              )}`}
            >
              {pPhys.status}
            </span>
          )}
        </div>

        {activeMoon ? (
          <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[9.5px] font-mono pt-0.5">
            <div>
              <span className="text-slate-400">Orbit a:</span>{' '}
              <span className="text-slate-200 font-bold">
                {activeMoon.a_Rp} Rp ({activeMoon.a_km.toLocaleString()} km)
              </span>
            </div>
            <div>
              <span className="text-slate-400">Period:</span>{' '}
              <span className="text-slate-200">
                {activeMoon.periodDays} d{activeMoon.retrograde ? ' (Retro)' : ''}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Ecc / Inc:</span>{' '}
              <span className="text-slate-200">
                {activeMoon.e} / {activeMoon.incDeg}°
              </span>
            </div>

            <div>
              <span className="text-slate-400">Mass:</span>{' '}
              <span className="text-slate-200">
                {activeMoon.massLunar} M☾ ({activeMoon.massEarth} M⊕)
              </span>
            </div>
            <div>
              <span className="text-slate-400">Radius:</span>{' '}
              <span className="text-slate-200">
                {activeMoon.radiusKm.toLocaleString()} km ({activeMoon.radiusEarth} R⊕)
              </span>
            </div>
            <div>
              <span className="text-slate-400">Grav / Dens:</span>{' '}
              <span className="text-slate-200">
                {activeMoon.gravityG}g ({activeMoon.densityGcm3} g/cm³)
              </span>
            </div>

            <div>
              <span className="text-slate-400">Tidal Flux:</span>{' '}
              <span className="text-orange-300">
                {activeMoon.tidalW} TW ({activeMoon.tidalFluxWm2} W/m²)
              </span>
            </div>
            <div>
              <span className="text-slate-400">Equil Teq:</span>{' '}
              <span className="text-slate-200">
                {activeMoon.T_eq} K
                {activeMoon.greenhouseK > 0 ? ` (+${Math.round(activeMoon.greenhouseK)}K)` : ''}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Surface T:</span>{' '}
              <span className="text-amber-300 font-bold">
                {activeMoon.surfaceTempK} K ({Math.round(activeMoon.surfaceTempK - 273.15)}°C)
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[9.5px] font-mono pt-0.5">
            <div>
              <span className="text-slate-400">Orbit a(t):</span>{' '}
              <span className="text-slate-200 font-bold">
                {pPhys.currentA.toFixed(3)} AU
              </span>
            </div>
            <div>
              <span className="text-slate-400">Period:</span>{' '}
              <span className="text-slate-200">
                {pPhys.periodDays >= 1000
                  ? `${(pPhys.periodDays / 365.25).toFixed(1)} yr`
                  : `${Math.round(pPhys.periodDays)} d`}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Eccentricity:</span>{' '}
              <span className="text-slate-200">{curPlanet.ecc.toFixed(3)}</span>
            </div>

            <div>
              <span className="text-slate-400">Mass:</span>{' '}
              <span className="text-slate-200">
                {curPlanet.massEarth >= 15
                  ? `${(curPlanet.massEarth / M_JUP_EARTH).toFixed(2)} MJ (${curPlanet.massEarth.toFixed(1)} M⊕)`
                  : `${curPlanet.massEarth.toFixed(2)} M⊕`}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Radius:</span>{' '}
              <span className="text-slate-200">
                {curPlanet.radiusEarth >= 6
                  ? `${(curPlanet.radiusEarth / R_JUP_EARTH).toFixed(2)} RJ`
                  : `${curPlanet.radiusEarth.toFixed(2)} R⊕`}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Grav / Dens:</span>{' '}
              <span className="text-slate-200">
                {pPhys.gravityG}g
                {curPlanet.densityGcm3 ? ` (${curPlanet.densityGcm3} g/cm³)` : ''}
              </span>
            </div>

            <div>
              <span className="text-slate-400">Insolation:</span>{' '}
              <span className="text-slate-200">
                {pPhys.fluxRatio >= 10
                  ? `${Math.round(pPhys.fluxRatio)} S☉`
                  : `${pPhys.fluxRatio.toFixed(2)} S☉`}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Equil Teq:</span>{' '}
              <span className="text-slate-200">
                {pPhys.teq} K
                {curPlanet.greenhouse > 0 ? ` (+${Math.round(curPlanet.greenhouse)}K)` : ''}
              </span>
            </div>
            <div>
              <span className="text-slate-400">
                {curPlanet.pressureBar === null ||
                curPlanet.type.includes('Supercritical') ||
                curPlanet.type.includes('Giant') ||
                curPlanet.type.includes('Neptune') ||
                curPlanet.type.includes('Gas Dwarf')
                  ? '1-Bar Eff T:'
                  : 'Surface T:'}
              </span>{' '}
              <span className="text-amber-300 font-bold">
                {pPhys.tsurf} K ({pPhys.tsurfC}°C)
              </span>
            </div>
          </div>
        )}

        {/* Migration / Origin & Spin Telemetry */}
        <div className="flex flex-wrap items-center justify-between gap-1 text-[8.5px] font-mono text-slate-400 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800/80">
          <span>
            {activeMoon
              ? activeMoon.origin
              : `${curPlanet.migrationHistory || 'In-Situ Orbit'}${
                  curPlanet.a_birth && Math.abs(curPlanet.a_birth - curPlanet.a0) > 0.005
                    ? ` [Born ${curPlanet.a_birth.toFixed(2)} AU]`
                    : ''
                }`}
          </span>
          <span className="text-amber-400/90 font-semibold">
            {activeMoon
              ? `${activeMoon.spinState} (${activeMoon.rotationHours}h · ${activeMoon.axialTiltDeg}°)`
              : `${curPlanet.spinState || (pPhys.isTidallyLocked ? '1:1 Tidally Locked' : 'Free Prograde')}${
                  curPlanet.rotationHours ? ` (${curPlanet.rotationHours}h · ${curPlanet.axialTiltDeg ?? 0}°)` : ''
                }`}
          </span>
        </div>

        {/* 3-Snow-Line Bulk Composition Bar (Rock / Ice / Gas) */}
        {(activeMoon || curPlanet.rockFrac !== undefined) && (
          <div className="flex flex-col gap-0.5 pt-0.5">
            <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
              <div
                className="bg-amber-600 h-full"
                style={{ width: `${rockPct}%` }}
                title={`Rock: ${rockPct}%`}
              />
              <div
                className="bg-cyan-300 h-full"
                style={{ width: `${icePct}%` }}
                title={`Ice: ${icePct}%`}
              />
              <div
                className="bg-purple-400 h-full"
                style={{ width: `${gasPct}%` }}
                title={`Gas: ${gasPct}%`}
              />
            </div>
            <div className="flex justify-between text-[8.5px] font-mono text-slate-400">
              <span className="text-amber-500">Rock {rockPct}%</span>
              <span className="text-cyan-300">Ice {icePct}%</span>
              <span className="text-purple-300">H2/He Gas {gasPct}%</span>
            </div>
          </div>
        )}

        {/* Atmosphere & Partial Pressures */}
        <div className="flex flex-col gap-0.5 text-[9px] font-mono bg-slate-950/80 px-2 py-1 rounded border-l-2 border-indigo-400 border border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-slate-200 font-semibold">
              {activeMoon
                ? activeMoon.atmosphereType
                : curPlanet.atmosphereType || curPlanet.atmosphere}
            </span>
            <span className="text-indigo-300 font-bold">
              {activeMoon
                ? activeMoon.pressureBar !== null
                  ? `${activeMoon.pressureBar} bar (μ_min=${activeMoon.muMin})`
                  : ''
                : curPlanet.pressureBar !== undefined && curPlanet.pressureBar !== null
                ? `${curPlanet.pressureBar} bar`
                : curPlanet.type.includes('Supercritical')
                ? 'Supercritical Fluid'
                : (curPlanet.gasFrac || 0) > 0.015
                ? 'Deep Gas Envelope'
                : ''}
              {!activeMoon && curPlanet.muMin ? ` (μ_min=${curPlanet.muMin})` : ''}
            </span>
          </div>
          {gasBreakdown && (
            <div className="text-cyan-400 text-[8.5px]">{gasBreakdown}</div>
          )}
        </div>

        {/* Water-World / Exotic Solvent / Subsurface Ocean Interior Hydrosphere */}
        {activeHydro && (
          <div className="bg-sky-950/30 border-l-2 border-sky-400 border border-sky-900/50 rounded px-2 py-1 text-[8.5px] font-mono text-sky-200 flex flex-col gap-0.5">
            <div className="flex justify-between items-center font-bold text-sky-300">
              <span>🌊 Hydrosphere ({activeHydro.state}):</span>
              {activeHydro.solvent && (
                <span className="text-cyan-200 bg-sky-900/60 px-1 rounded">
                  {activeHydro.solvent}
                </span>
              )}
            </div>
            {activeHydro.biosphere && (
              <div className="text-emerald-300 font-bold">
                🧬 {activeHydro.biosphere}
              </div>
            )}
            <div>
              {activeHydro.coveragePct !== undefined && activeHydro.coveragePct > 0
                ? `Liquid Coverage: ${activeHydro.coveragePct}% (${100 - activeHydro.coveragePct}% Land) · `
                : ''}
              {activeHydro.crustKm && activeHydro.crustKm > 0
                ? `Ice I Shell: ${activeHydro.crustKm} km · `
                : ''}
              {activeHydro.liqKm > 0
                ? `Liquid Depth: ${activeHydro.liqKm} km · `
                : `Supercritical Fluid: ${activeHydro.scKm} km · `}
              Ice VI/VII: {activeHydro.iceKm} km
              {activeHydro.siKm > 0
                ? ` · Superionic XVIII: ${activeHydro.siKm} km`
                : ''}
            </div>
          </div>
        )}

        {/* Planetary Magnetosphere & Core Dynamo */}
        {activeMagField && (
          <div className="bg-indigo-950/30 border-l-2 border-indigo-400 border border-indigo-900/50 rounded px-2 py-1 text-[8.5px] font-mono text-indigo-200 flex flex-col gap-0.5">
            <div className="flex justify-between items-center font-bold text-indigo-300">
              <span className="flex items-center gap-1">
                🧲 Magnetosphere ({activeMagField.dynamoStatus}):
              </span>
              <span
                className={`px-1 rounded text-[8px] ${
                  activeMagField.hasActiveDynamo
                    ? 'bg-indigo-900/80 text-indigo-200'
                    : 'bg-slate-900 text-slate-400'
                }`}
              >
                {activeMagField.surfaceFieldGauss >= 0.01
                  ? `${activeMagField.surfaceFieldGauss} G (${activeMagField.surfaceFieldMicroTesla} μT)`
                  : `${activeMagField.surfaceFieldGauss.toExponential(2)} G`}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>
                R_mp: {activeMagField.magnetopauseRadiusRp} Rp · Bow Shock: {activeMagField.bowShockRadiusRp} Rp
              </span>
              <span
                className={
                  activeMagField.shieldingEfficiencyPct >= 80
                    ? 'text-emerald-400'
                    : activeMagField.shieldingEfficiencyPct >= 40
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }
              >
                Shielding: {activeMagField.shieldingEfficiencyPct}% ({activeMagField.radiationLevel})
              </span>
            </div>
            <div className="text-slate-400 text-[8px]">
              {activeMagField.biosphereImplication}
            </div>
          </div>
        )}

        {/* Rings & Interactive Moon Selector */}
        {(curPlanet.rings || (curPlanet.moons && curPlanet.moons.length > 0)) && (
          <div className="border-t border-slate-800/80 pt-1 flex flex-col gap-0.5 text-[8.5px] font-mono">
            {curPlanet.rings && (
              <div className="text-amber-300 font-semibold">
                🪐 Rings: {curPlanet.rings} (Roche: {curPlanet.rocheLimitRp} Rp)
              </div>
            )}
            {curPlanet.moons && curPlanet.moons.length > 0 && (
              <div className="text-[8px] text-slate-400 uppercase tracking-wider mt-0.5">
                Click any moon for full astrophysical dossier:
              </div>
            )}
            {curPlanet.moons &&
              curPlanet.moons.map((m, mi) => {
                const isSelMoon = selectedMoonIdx === mi;
                return (
                  <button
                    key={mi}
                    onClick={() => setSelectedMoonIdx(isSelMoon ? null : mi)}
                    className={`flex justify-between items-center px-1.5 py-0.5 rounded text-[8px] border transition text-left ${
                      isSelMoon
                        ? 'bg-cyan-950/80 border-cyan-500 text-white'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>
                      <strong className="text-cyan-300">{m.name}:</strong> {m.moonClass}
                      {m.retrograde ? ' (Retro)' : ''}
                    </span>
                    <span className="text-slate-400">
                      {m.a_Rp} Rp · {m.radiusKm} km ({m.massLunar} M☾)
                    </span>
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Planetary Fleet List */}
      <div
        id="section-09-planet-fleet"
        data-section="Planetary Fleet Selector"
        className="flex flex-col gap-1"
      >
        <span className="text-[9.5px] font-mono text-slate-400 uppercase tracking-wider font-semibold flex items-center justify-between">
          <span>Select Planet to Inspect ({selectedStar.planets.length}):</span>
          <span className="text-[8px] font-mono text-slate-500 bg-slate-950 px-1 py-0.2 rounded border border-slate-800">
            SEC-09
          </span>
        </span>
        <div className="max-h-28 overflow-y-auto flex flex-col gap-1 pr-1">
          {selectedStar.planets.map((p, idx) => {
            const phys = computePlanetPhysics(
              p,
              selectedStar.starState,
              selectedStar.progenitorMass
            );
            const isCurrent = idx === selectedPlanetIndex;
            return (
              <button
                key={p.id}
                onClick={() => onSelectPlanet(idx)}
                className={`px-2 py-1 rounded ${
                  isCurrent
                    ? 'bg-cyan-950/80 border-cyan-500'
                    : 'bg-slate-900/60 border-slate-800/80'
                } border flex items-center justify-between text-[9.5px] font-mono transition hover:bg-slate-800 text-left`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="text-slate-200 font-bold">{p.name}</span>
                  <span className="text-cyan-400/90 text-[8.5px] truncate">
                    {p.type.split('(')[0].trim()}
                  </span>
                  <span className="text-slate-400">
                    ({phys.currentA.toFixed(2)} AU)
                  </span>
                </div>
                <span
                  className={`px-1.5 py-0.2 rounded text-[8px] border flex-shrink-0 ${getBadgeStyle(
                    phys.status,
                    phys.isEngulfed
                  )}`}
                >
                  {phys.status}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

