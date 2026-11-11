import React from 'react';
import { Trash2, Activity } from 'lucide-react';
import { RealisticMoon } from '../../../types/astrophysics';
import { RealisticPlanetBody } from '../../../core/generation/realisticStarGen';
import {
  MOON_CLASSES,
  ATMOSPHERE_TYPES,
  OCEAN_SOLVENTS,
  BIOSPHERE_TYPES,
  isNoOceanSolvent,
  autoCalculateMoonPhysics,
} from '../../../core/generation/systemEditorPhysics';

export interface EditorMoonInspectorProps {
  currentMoon: RealisticMoon;
  planetBody: RealisticPlanetBody;
  hostStarLum: number;
  selectedMoonIdx: number;
  onUpdateMoonField: <K extends keyof RealisticMoon>(
    field: K,
    value: RealisticMoon[K]
  ) => void;
  onReplaceMoon: (moonIdx: number, updatedMoon: RealisticMoon) => void;
  onDeleteMoon: (moonIdx: number) => void;
}

export const EditorMoonInspector: React.FC<EditorMoonInspectorProps> = ({
  currentMoon,
  planetBody,
  hostStarLum,
  selectedMoonIdx,
  onUpdateMoonField,
  onReplaceMoon,
  onDeleteMoon,
}) => {
  const handleAutoCalcMoon = () => {
    const computed = autoCalculateMoonPhysics(currentMoon, planetBody, hostStarLum);
    onReplaceMoon(selectedMoonIdx, computed);
  };

  const currentSolvent =
    !currentMoon.hydrosphere ||
    isNoOceanSolvent(currentMoon.hydrosphere.solvent) ||
    ((currentMoon.hydrosphere.coveragePct ?? 0) === 0 &&
      (currentMoon.hydrosphere.liqKm ?? 0) === 0)
      ? 'None (No Ocean / Dry)'
      : currentMoon.hydrosphere.solvent || 'Water (H2O)';

  const handleSolventChange = (solvent: string) => {
    if (isNoOceanSolvent(solvent)) {
      if (
        !currentMoon.hydrosphere?.biosphere ||
        currentMoon.hydrosphere.biosphere === 'Barren / Sterile'
      ) {
        onUpdateMoonField('hydrosphere', null);
      } else {
        onUpdateMoonField('hydrosphere', {
          ...currentMoon.hydrosphere,
          solvent: 'None',
          coveragePct: 0,
          liqKm: 0,
          state: 'Dry / Desiccated',
        });
      }
    } else {
      const cur = currentMoon.hydrosphere || {
        state: 'Liquid Oceans',
        coveragePct: 40,
        liqKm: 1.5,
        scKm: 0,
        iceKm: 0,
        siKm: 0,
      };
      const cov = (cur.coveragePct ?? 0) > 0 ? cur.coveragePct : 40;
      onUpdateMoonField('hydrosphere', {
        ...cur,
        solvent,
        state: cur.state || 'Liquid Oceans',
        coveragePct: cov,
      });
    }
  };

  return (
    <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-4 shadow-inner">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🌙</span>
          <input
            type="text"
            value={currentMoon.name || ''}
            onChange={(e) => onUpdateMoonField('name', e.target.value)}
            className="text-sm font-bold font-mono text-white bg-transparent border-b border-dashed border-amber-500/40 hover:border-amber-400 focus:outline-none px-0.5"
            placeholder="Moon Name"
          />
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
            {currentMoon.a_Rp} Rp &bull; {currentMoon.periodDays} Days
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoCalcMoon}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/80 border border-indigo-700/60 hover:bg-indigo-900 text-indigo-200 text-xs font-mono font-semibold transition"
            title="Auto-calculate moon period, gravity, equilibrium temp, and classification"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Auto-Calc Moon Physics</span>
          </button>
          <button
            onClick={() => onDeleteMoon(selectedMoonIdx)}
            className="p-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-950/50 border border-rose-800/40 transition text-xs font-mono flex items-center gap-1"
            title="Remove Moon"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove Moon</span>
          </button>
        </div>
      </div>

      {/* Grid of editable moon fields */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Moon Class */}
        <div>
          <label className="text-[10px] font-mono text-slate-400">Moon Class</label>
          <select
            value={currentMoon.moonClass}
            onChange={(e) => onUpdateMoonField('moonClass', e.target.value)}
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:border-amber-400 focus:outline-none"
          >
            {MOON_CLASSES.map((mc) => (
              <option key={mc} value={mc}>
                {mc}
              </option>
            ))}
          </select>
        </div>

        {/* Orbit Radius Rp */}
        <div>
          <label className="text-[10px] font-mono text-slate-400">Orbit Radius (Rp)</label>
          <input
            type="number"
            step="0.5"
            min="1.2"
            value={currentMoon.a_Rp}
            onChange={(e) => {
              const val = parseFloat(e.target.value) || 10;
              onUpdateMoonField('a_Rp', val);
              const pRadKm = (planetBody.radiusEarth || 1.0) * 6371;
              onUpdateMoonField('a_km', Math.round(val * pRadKm));
            }}
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:border-amber-400 focus:outline-none"
          />
        </div>

        {/* Orbital Period */}
        <div>
          <label className="text-[10px] font-mono text-slate-400">Orbital Period (Days)</label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={currentMoon.periodDays}
            onChange={(e) =>
              onUpdateMoonField('periodDays', parseFloat(e.target.value) || 1.0)
            }
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:border-amber-400 focus:outline-none"
          />
        </div>

        {/* Mass Lunar */}
        <div>
          <label className="text-[10px] font-mono text-slate-400">Mass (M_Moon)</label>
          <input
            type="number"
            step="0.05"
            min="0.0001"
            value={currentMoon.massLunar}
            onChange={(e) => {
              const mL = parseFloat(e.target.value) || 1.0;
              onUpdateMoonField('massLunar', mL);
              onUpdateMoonField('massEarth', +(mL * 0.0123).toFixed(5));
            }}
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:border-amber-400 focus:outline-none"
          />
        </div>

        {/* Radius Earth */}
        <div>
          <label className="text-[10px] font-mono text-slate-400">Radius (R⊕)</label>
          <input
            type="number"
            step="0.01"
            min="0.005"
            value={currentMoon.radiusEarth}
            onChange={(e) => {
              const rE = parseFloat(e.target.value) || 0.272;
              onUpdateMoonField('radiusEarth', rE);
              onUpdateMoonField('radiusKm', Math.round(rE * 6371));
            }}
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:border-amber-400 focus:outline-none"
          />
        </div>

        {/* Gravity (g) */}
        <div>
          <label className="text-[10px] font-mono text-slate-400">Gravity (g)</label>
          <input
            type="number"
            step="0.01"
            min="0.001"
            value={currentMoon.gravityG}
            onChange={(e) =>
              onUpdateMoonField('gravityG', parseFloat(e.target.value) || 0.16)
            }
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:border-amber-400 focus:outline-none"
          />
        </div>

        {/* Albedo */}
        <div>
          <label className="text-[10px] font-mono text-slate-400">Albedo (0-1)</label>
          <input
            type="number"
            step="0.02"
            min="0.01"
            max="0.95"
            value={currentMoon.albedo ?? 0.15}
            onChange={(e) =>
              onUpdateMoonField('albedo', parseFloat(e.target.value) || 0.15)
            }
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:border-amber-400 focus:outline-none"
          />
        </div>

        {/* Surface Pressure */}
        <div>
          <label className="text-[10px] font-mono text-slate-400">Surface Pressure (bar)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={currentMoon.pressureBar ?? 0}
            onChange={(e) =>
              onUpdateMoonField('pressureBar', parseFloat(e.target.value) || 0)
            }
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:border-amber-400 focus:outline-none"
          />
        </div>

        {/* Atmosphere Type */}
        <div>
          <label className="text-[10px] font-mono text-slate-400">Atmosphere Type</label>
          <select
            value={currentMoon.atmosphereType || 'Airless Vacuum'}
            onChange={(e) => onUpdateMoonField('atmosphereType', e.target.value)}
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:border-amber-400 focus:outline-none"
          >
            {ATMOSPHERE_TYPES.map((at) => (
              <option key={at} value={at}>
                {at}
              </option>
            ))}
          </select>
        </div>

        {/* Ocean Solvent */}
        <div>
          <label className="text-[10px] font-mono text-slate-400">Ocean Solvent</label>
          <select
            value={currentSolvent}
            onChange={(e) => handleSolventChange(e.target.value)}
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:border-amber-400 focus:outline-none"
          >
            {OCEAN_SOLVENTS.map((sol) => (
              <option key={sol} value={sol}>
                {sol}
              </option>
            ))}
          </select>
        </div>

        {/* Liquid Coverage (%) */}
        <div>
          <label className="text-[10px] font-mono text-slate-400">Liquid Coverage (%)</label>
          <input
            type="number"
            step="1"
            min="0"
            max="100"
            value={currentMoon.hydrosphere?.coveragePct ?? 0}
            onChange={(e) => {
              const cov = parseFloat(e.target.value) || 0;
              const cur = currentMoon.hydrosphere || {
                state: 'Liquid Oceans',
                solvent: 'Water (H2O)',
                liqKm: 1.5,
                scKm: 0,
                iceKm: 0,
                siKm: 0,
              };
              onUpdateMoonField('hydrosphere', { ...cur, coveragePct: cov });
            }}
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:border-amber-400 focus:outline-none"
          />
        </div>

        {/* Biosphere */}
        <div>
          <label className="text-[10px] font-mono text-slate-400">Biosphere</label>
          <select
            value={currentMoon.hydrosphere?.biosphere || 'Barren / Sterile'}
            onChange={(e) => {
              const bio = e.target.value;
              const cur = currentMoon.hydrosphere || {
                state: 'Liquid Oceans',
                solvent: 'Water (H2O)',
                coveragePct: 0,
                liqKm: 0,
                scKm: 0,
                iceKm: 0,
                siKm: 0,
              };
              onUpdateMoonField('hydrosphere', {
                ...cur,
                biosphere: bio === 'Barren / Sterile' ? null : bio,
              });
            }}
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:border-amber-400 focus:outline-none"
          >
            {BIOSPHERE_TYPES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {/* Surface Temp (K) */}
        <div>
          <label className="text-[10px] font-mono text-slate-400">Surface Temp (K)</label>
          <input
            type="number"
            step="1"
            min="3"
            max="3000"
            value={currentMoon.surfaceTempK}
            onChange={(e) =>
              onUpdateMoonField('surfaceTempK', parseFloat(e.target.value) || 100)
            }
            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:border-amber-400 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};
