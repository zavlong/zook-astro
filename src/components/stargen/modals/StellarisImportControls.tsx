import React from 'react';
import { StellarisImportConversionConfig } from '../../../core/export/stellarisScriptImporter';
import { RealisticPlanetBody, RealisticStarSystemResult } from '../types';

export type ConversionPresetKey = 'zook_native' | 'linear_30' | 'linear_20' | 'linear_50' | 'custom';

export const SAMPLE_SOL_INITIALIZER = `# Sol System Initializer (Stellaris Clausewitz Script)
sol_system_initializer = {
\tname = "NAME_Sol"
\tclass = "sc_g"
\tasteroids_distance = 65

\tplanet = {
\t\tname = "NAME_Sol"
\t\tclass = "pc_g_star"
\t\torbit_distance = 0
\t\tsize = 30
\t}
\tplanet = {
\t\tname = "NAME_Mercury"
\t\tclass = "pc_barren"
\t\torbit_distance = 25
\t\tsize = 10
\t}
\tplanet = {
\t\tname = "NAME_Venus"
\t\tclass = "pc_toxic"
\t\torbit_distance = 15
\t\tsize = 15
\t}
\tplanet = {
\t\tname = "NAME_Earth"
\t\tclass = "pc_continental"
\t\torbit_distance = 15
\t\tsize = 16
\t\tmoon = {
\t\t\tname = "NAME_Moon"
\t\t\tclass = "pc_barren"
\t\t\tsize = 6
\t\t\torbit_distance = 6
\t\t}
\t}
\tplanet = {
\t\tname = "NAME_Mars"
\t\tclass = "pc_barren_cold"
\t\torbit_distance = 15
\t\tsize = 12
\t}
\tplanet = {
\t\tname = "NAME_Jupiter"
\t\tclass = "pc_gas_giant"
\t\torbit_distance = 35
\t\tsize = 35
\t}
\tplanet = {
\t\tname = "NAME_Saturn"
\t\tclass = "pc_gas_giant"
\t\torbit_distance = 25
\t\tsize = 30
\t\thas_ring = yes
\t}
\tplanet = {
\t\tname = "NAME_Uranus"
\t\tclass = "pc_ice_giant"
\t\torbit_distance = 25
\t\tsize = 22
\t}
\tplanet = {
\t\tname = "NAME_Neptune"
\t\tclass = "pc_ice_giant"
\t\torbit_distance = 25
\t\tsize = 22
\t}
}
`;

export interface StellarisLivePreviewData {
  parsedList: Array<{ id: string; name: string; planets: unknown[] }>;
  selectedIdx: number;
  system: RealisticStarSystemResult;
  starCount: number;
  starsSummary: string;
  planetCount: number;
  moonCount: number;
  planets: RealisticPlanetBody[];
}

interface StellarisImportControlsProps {
  config: StellarisImportConversionConfig;
  onChangeConfig: (updater: (prev: StellarisImportConversionConfig) => StellarisImportConversionConfig) => void;
  conversionPreset: ConversionPresetKey;
  onChangePreset: (preset: ConversionPresetKey) => void;
  selectedInitializerIndex: number;
  onSelectInitializerIndex: (idx: number) => void;
  preview: StellarisLivePreviewData | { error: string } | null;
}

export const StellarisImportControls: React.FC<StellarisImportControlsProps> = React.memo(({
  config,
  onChangeConfig,
  conversionPreset,
  onChangePreset,
  selectedInitializerIndex,
  onSelectInitializerIndex,
  preview,
}) => {
  return (
    <div className="flex flex-col gap-2">
      {/* Conversion Factor Configuration Panel */}
      <div className="bg-[#111826]/90 border border-[#233047] rounded-lg p-2.5 flex flex-col gap-2 text-xs font-mono">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f2b3e] pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 text-[11px] uppercase font-semibold">Conversion Preset:</span>
            <select
              value={conversionPreset}
              onChange={(e) => onChangePreset(e.target.value as ConversionPresetKey)}
              className="bg-[#090d15] border border-[#2a3852] text-amber-300 rounded px-2 py-0.5 text-xs font-mono focus:outline-none"
            >
              <option value="zook_native">Zook Astro Power-Law (r = 50 · AU^0.667)</option>
              <option value="linear_30">Linear Standard (30 orbit_distance = 1 AU)</option>
              <option value="linear_20">Linear Compact (20 orbit_distance = 1 AU)</option>
              <option value="linear_50">Linear Wide (50 orbit_distance = 1 AU)</option>
              <option value="custom">Custom Factor</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px] uppercase font-semibold">Distance Mode:</span>
            <div className="flex items-center bg-[#090d15] p-0.5 rounded border border-[#2a3852]">
              <button
                type="button"
                onClick={() => {
                  onChangeConfig((prev) => ({ ...prev, distanceMode: 'power_law' }));
                  onChangePreset('custom');
                }}
                className={`px-2 py-0.5 rounded text-[11px] cursor-pointer transition ${
                  config.distanceMode === 'power_law' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Power-Law
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeConfig((prev) => ({ ...prev, distanceMode: 'linear' }));
                  onChangePreset('custom');
                }}
                className={`px-2 py-0.5 rounded text-[11px] cursor-pointer transition ${
                  config.distanceMode === 'linear' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Linear
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
          {config.distanceMode === 'linear' ? (
            <div className="flex flex-col gap-0.5 col-span-2">
              <label className="text-[10px] text-slate-400">
                Stellaris Units per 1 AU{' '}
                <span className="text-slate-500">
                  (= {(1 / Math.max(0.1, config.stellarisUnitsPerAU)).toFixed(4)} AU / unit)
                </span>
              </label>
              <input
                type="number"
                min="1"
                max="500"
                step="1"
                value={config.stellarisUnitsPerAU}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 30;
                  onChangeConfig((prev) => ({ ...prev, stellarisUnitsPerAU: val }));
                  onChangePreset('custom');
                }}
                className="bg-[#090d15] border border-[#2a3852] text-amber-300 rounded px-2 py-0.5 text-xs font-mono focus:outline-none"
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-slate-400">Scale (orbit_distance at 1 AU)</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  step="1"
                  value={config.powerLawScale}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 50;
                    onChangeConfig((prev) => ({ ...prev, powerLawScale: val }));
                    onChangePreset('custom');
                  }}
                  className="bg-[#090d15] border border-[#2a3852] text-amber-300 rounded px-2 py-0.5 text-xs font-mono focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-slate-400">Exponent</label>
                <input
                  type="number"
                  min="0.2"
                  max="2.0"
                  step="0.01"
                  value={config.powerLawExponent}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0.667;
                    onChangeConfig((prev) => ({ ...prev, powerLawExponent: val }));
                    onChangePreset('custom');
                  }}
                  className="bg-[#090d15] border border-[#2a3852] text-amber-300 rounded px-2 py-0.5 text-xs font-mono focus:outline-none"
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-slate-400">Stellaris Size at 1 R⊕</label>
            <input
              type="number"
              min="4"
              max="40"
              step="1"
              value={config.stellarisSizeAtOneEarthRadius}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 16;
                onChangeConfig((prev) => ({ ...prev, stellarisSizeAtOneEarthRadius: val }));
                onChangePreset('custom');
              }}
              className="bg-[#090d15] border border-[#2a3852] text-amber-300 rounded px-2 py-0.5 text-xs font-mono focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-slate-400">Radius Multiplier</label>
            <input
              type="number"
              min="0.2"
              max="5.0"
              step="0.1"
              value={config.planetSizeScaleFactor}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 1.0;
                onChangeConfig((prev) => ({ ...prev, planetSizeScaleFactor: val }));
                onChangePreset('custom');
              }}
              className="bg-[#090d15] border border-[#2a3852] text-amber-300 rounded px-2 py-0.5 text-xs font-mono focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px] pt-1 border-t border-[#1f2b3e]">
          <label
            className="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none"
            title="Standard Stellaris adds each planet's orbit_distance to the previous orbit"
          >
            <input
              type="checkbox"
              checked={config.cumulativeOrbitDistance}
              onChange={(e) => onChangeConfig((prev) => ({ ...prev, cumulativeOrbitDistance: e.target.checked }))}
              className="rounded border-[#2a3852] text-amber-500 focus:ring-0 cursor-pointer"
            />
            <span>Cumulative Orbit Distance</span>
          </label>

          <label
            className="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none"
            title="Read commented-out telemetry like # semi_major_axis_au = ... if present"
          >
            <input
              type="checkbox"
              checked={config.preferCommentedStargenTelemetry}
              onChange={(e) => onChangeConfig((prev) => ({ ...prev, preferCommentedStargenTelemetry: e.target.checked }))}
              className="rounded border-[#2a3852] text-amber-500 focus:ring-0 cursor-pointer"
            />
            <span>Use # Commented Stargen Telemetry (if present)</span>
          </label>
        </div>
      </div>

      {/* Live Parsed Preview Bar */}
      {preview && (
        <div className="bg-[#0a0f19] border border-[#233047] rounded-lg p-2 flex flex-col gap-1.5 text-xs font-mono">
          {'error' in preview && preview.error ? (
            <div className="text-amber-400 text-[11px]">⚠️ {preview.error}</div>
          ) : 'parsedList' in preview && preview.parsedList ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#1b2637]">
                <div className="flex items-center gap-2 flex-wrap">
                  {preview.parsedList.length > 1 && (
                    <select
                      value={selectedInitializerIndex}
                      onChange={(e) => onSelectInitializerIndex(parseInt(e.target.value, 10))}
                      className="bg-[#090d15] border border-[#2a3852] text-amber-300 rounded px-2 py-0.5 text-xs font-mono focus:outline-none"
                    >
                      {preview.parsedList.map((init, idx) => (
                        <option key={idx} value={idx}>
                          {init.name} ({init.id}) — {init.planets.length} bodies
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="text-[11px] font-bold text-amber-300">
                    {preview.system.step1?.name || 'System Preview'}:
                  </span>
                  <span className="px-1.5 py-0.5 bg-amber-950/60 border border-amber-800/80 rounded text-[10px] text-amber-200">
                    ★ {preview.starCount} Stars ({preview.starsSummary})
                  </span>
                  <span className="px-1.5 py-0.5 bg-sky-950/60 border border-sky-800/80 rounded text-[10px] text-sky-200">
                    🪐 {preview.planetCount} Planets
                  </span>
                  <span className="px-1.5 py-0.5 bg-indigo-950/60 border border-indigo-800/80 rounded text-[10px] text-indigo-200">
                    🌙 {preview.moonCount} Moons
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-thin">
                {preview.planets.map((p, idx) => (
                  <span
                    key={idx}
                    className="flex-shrink-0 px-2 py-0.5 rounded bg-[#131b2a] border border-[#23354f] text-[11px] text-slate-200"
                  >
                    <strong className="text-amber-300">{p.role || `Planet ${idx + 1}`}</strong>: {p.a.toFixed(2)} AU ({p.radiusEarth.toFixed(2)} R⊕)
                    {p.moons && p.moons.length > 0 && <span className="text-slate-400"> +{p.moons.length}m</span>}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
});
