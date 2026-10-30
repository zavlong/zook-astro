import React from 'react';
import { Grid, X } from 'lucide-react';

export interface SectorParametersModalProps {
  isOpen: boolean;
  onClose: () => void;
  draftCols: number;
  setDraftCols: (cols: number | ((prev: number) => number)) => void;
  draftRows: number;
  setDraftRows: (rows: number | ((prev: number) => number)) => void;
  draftDensity: number;
  setDraftDensity: (density: number | ((prev: number) => number)) => void;
  draftAge: number;
  setDraftAge: (age: number | ((prev: number) => number)) => void;
  draftAgeRange: number;
  setDraftAgeRange: (ageRange: number | ((prev: number) => number)) => void;
  draftAgeDistribution: 'normal' | 'uniform';
  setDraftAgeDistribution: (dist: 'normal' | 'uniform') => void;
  draftFeh: number;
  setDraftFeh: (feh: number | ((prev: number) => number)) => void;
  draftSeed: number;
  setDraftSeed: (seed: number | ((prev: number) => number)) => void;
  draftHasNebula: boolean;
  setDraftHasNebula: (hasNebula: boolean | ((prev: boolean) => boolean)) => void;
  onApply: (
    newCols: number,
    newRows: number,
    newDensity: number,
    newAge: number,
    newAgeRange: number,
    newAgeDistribution: 'normal' | 'uniform',
    newFeh: number,
    newSeed: number,
    newHasNebula: boolean
  ) => void;
}

export const SectorParametersModal: React.FC<SectorParametersModalProps> = React.memo(
  ({
    isOpen,
    onClose,
    draftCols,
    setDraftCols,
    draftRows,
    setDraftRows,
    draftDensity,
    setDraftDensity,
    draftAge,
    setDraftAge,
    draftAgeRange,
    setDraftAgeRange,
    draftAgeDistribution,
    setDraftAgeDistribution,
    draftFeh,
    setDraftFeh,
    draftSeed,
    setDraftSeed,
    draftHasNebula,
    setDraftHasNebula,
    onApply,
  }) => {
    if (!isOpen) return null;

    return (
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
        <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 font-mono text-xs max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Grid className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white tracking-wide">
                Customize Sector Parameters
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Grid Dimension Presets */}
          <div>
            <label className="text-[11px] text-slate-400 uppercase font-semibold mb-2 block">
              Quick Dimension Presets
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '10×10', cols: 10, rows: 10, desc: '100 hexes' },
                { label: '25×25', cols: 25, rows: 25, desc: '625 hexes' },
                { label: '50×50', cols: 50, rows: 50, desc: '2.5k hexes' },
                { label: '100×100', cols: 100, rows: 100, desc: '10k hexes!' },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setDraftCols(preset.cols);
                    setDraftRows(preset.rows);
                  }}
                  className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                    draftCols === preset.cols && draftRows === preset.rows
                      ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-bold">{preset.label}</div>
                  <div className="text-[9.5px] text-slate-500">{preset.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Columns & Rows Custom Sliders */}
          <div className="space-y-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            {/* Columns */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-400">Grid Width (Columns):</span>
                <span className="text-cyan-300 font-bold">{draftCols} columns</span>
              </div>
              <input
                type="range"
                min={4}
                max={100}
                step={1}
                value={draftCols}
                onChange={(e) => setDraftCols(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>

            {/* Rows */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-400">Grid Height (Rows):</span>
                <span className="text-cyan-300 font-bold">{draftRows} rows</span>
              </div>
              <input
                type="range"
                min={4}
                max={100}
                step={1}
                value={draftRows}
                onChange={(e) => setDraftRows(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>

            {/* Total Hex Count Preview */}
            <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80">
              <span>Total Hex Cells:</span>
              <span className="text-slate-200 font-bold">
                {(draftCols * draftRows).toLocaleString()} hexes
              </span>
            </div>
          </div>

          {/* Stellar Density Slider */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-400">Stellar Occupancy Density:</span>
              <span
                className={`font-bold ${
                  draftDensity > 1.0 ? 'text-amber-300' : 'text-emerald-300'
                }`}
              >
                {Math.round(draftDensity * 100)}%
                {draftDensity > 1.0 ? ' (Overdensity Overflow)' : ''}
              </span>
            </div>
            <input
              type="range"
              min={0.05}
              max={3.5}
              step={0.05}
              value={draftDensity}
              onChange={(e) => setDraftDensity(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            {draftDensity > 1.0 ? (
              <div className="mt-2 p-2 rounded-lg bg-amber-950/40 border border-amber-800/60 text-[10px] text-amber-300/90 leading-relaxed font-mono">
                🔥 <strong>Overdensity Overflow Active:</strong> 100% of hexes are occupied. The
                excess density overflows onto mass, spawning heavy O/B stars, multiple-star
                hierarchies (binaries, trinaries, quadruples), and collapsed stellar remnants
                (black holes, neutron stars, white dwarfs)!
              </div>
            ) : (
              <div className="text-[10px] text-slate-400 flex items-center justify-between mt-2 pt-1 border-t border-slate-800/80">
                <span>Estimated Systems:</span>
                <span className="text-emerald-400 font-bold">
                  ~{Math.round(draftCols * draftRows * draftDensity).toLocaleString()} star systems
                </span>
              </div>
            )}
          </div>

          {/* Average Stellar Age & Age Range */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-400">Average Stellar Age:</span>
                <span className="text-cyan-300 font-bold">{draftAge.toFixed(1)} Gyr</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={12.5}
                step={0.1}
                value={draftAge}
                onChange={(e) => setDraftAge(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="text-[9.5px] text-slate-500 mt-1 flex justify-between">
                <span>Young Starburst (0.2 Gyr)</span>
                <span>Solar (4.8 Gyr)</span>
                <span>Ancient Halo (12.0 Gyr)</span>
              </div>
              {draftAge < 1.0 && (
                <div className="mt-1.5 p-1.5 rounded bg-fuchsia-950/60 border border-fuchsia-800/60 text-[10px] text-fuchsia-300 flex items-center gap-1.5">
                  <span>🌌</span>
                  <span>
                    Young Sector (&lt;1.0 Gyr): Qualifies for procedural purple-red H-II emission
                    nebulae clouds.
                  </span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-800/80 pt-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-400">Stellar Age Range (Spread):</span>
                <span className="text-cyan-300 font-bold">
                  &plusmn;{(draftAgeRange / 2).toFixed(1)} Gyr ({draftAgeRange.toFixed(1)} Gyr span)
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={12.0}
                step={0.1}
                value={draftAgeRange}
                onChange={(e) => setDraftAgeRange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex items-center justify-between text-[9.5px] text-slate-500 mt-1">
                <span>Narrow (Halo / Arms &plusmn;0.6 Gyr)</span>
                <span>Wide (Bulge &plusmn;5.6 Gyr)</span>
              </div>
            </div>

            <div className="border-t border-slate-800/80 pt-2 flex items-center justify-between">
              <span className="text-slate-400 text-xs">Age Distribution:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDraftAgeDistribution('normal')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                    draftAgeDistribution === 'normal'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Normal (Gaussian)
                </button>
                <button
                  type="button"
                  onClick={() => setDraftAgeDistribution('uniform')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                    draftAgeDistribution === 'uniform'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Uniform (Bulge)
                </button>
              </div>
            </div>
          </div>

          {/* Average Metallicity [Fe/H] Slider */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-400">Average Metallicity ([Fe/H]):</span>
              <span className="text-amber-300 font-bold">
                {draftFeh > 0 ? `+${draftFeh.toFixed(2)}` : draftFeh.toFixed(2)} dex
              </span>
            </div>
            <input
              type="range"
              min={-1.6}
              max={0.5}
              step={0.02}
              value={draftFeh}
              onChange={(e) => setDraftFeh(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <div className="text-[9.5px] text-slate-500 mt-1 flex justify-between">
              <span>Metal-Poor (-1.6 dex)</span>
              <span>Solar (0.0 dex)</span>
              <span>Super Metal-Rich (+0.5 dex)</span>
            </div>
          </div>

          {/* Master Seed Input */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3">
            <div>
              <span className="text-slate-400 block mb-0.5">Master Seed:</span>
              <input
                type="number"
                value={draftSeed}
                onChange={(e) => setDraftSeed(parseInt(e.target.value, 10) || 1)}
                className="w-28 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs font-bold"
              />
            </div>
            <button
              type="button"
              onClick={() => setDraftSeed(Math.floor(Math.random() * 90000) + 1000)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer self-end"
            >
              Randomize Seed
            </button>
          </div>

          {/* Background Atmosphere: Plain Black vs Nebula Noise Clouds */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-slate-400">Background Atmosphere:</span>
              <span
                className={`font-bold text-xs ${
                  draftHasNebula ? 'text-fuchsia-300' : 'text-slate-300'
                }`}
              >
                {draftHasNebula ? 'Nebula Noise Clouds' : 'Plain Black Space'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDraftHasNebula(false)}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                  !draftHasNebula
                    ? 'bg-slate-800 text-white border-slate-600 shadow'
                    : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                Plain Black
              </button>
              <button
                type="button"
                onClick={() => setDraftHasNebula(true)}
                className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                  draftHasNebula
                    ? 'bg-fuchsia-950/70 text-fuchsia-200 border-fuchsia-600 shadow'
                    : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                Noise Clouds
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">
              {draftHasNebula
                ? 'Active H-II ionization clouds and fractal dust fill the sector background.'
                : 'Deep space plain black background devoid of emission nebulae.'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                onApply(
                  draftCols,
                  draftRows,
                  draftDensity,
                  draftAge,
                  draftAgeRange,
                  draftAgeDistribution,
                  draftFeh,
                  draftSeed,
                  draftHasNebula
                )
              }
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold transition shadow-lg shadow-cyan-500/20 cursor-pointer"
            >
              Apply &amp; Regenerate
            </button>
          </div>
        </div>
      </div>
    );
  }
);

SectorParametersModal.displayName = 'SectorParametersModal';
