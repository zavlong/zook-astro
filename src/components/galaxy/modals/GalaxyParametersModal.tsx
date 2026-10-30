import React from 'react';
import { Sliders, X } from 'lucide-react';
import { GalaxyConfig } from '../../../core/generation/galaxyGen';
import { MORPHOLOGY_OPTIONS } from '../panels/GalaxyTopToolbar';

export interface GalaxyParametersModalProps {
  showConfigModal: boolean;
  setShowConfigModal: (show: boolean) => void;
  draftConfig: GalaxyConfig;
  setDraftConfig: React.Dispatch<React.SetStateAction<GalaxyConfig>>;
  handleApplySliders: () => void;
}

export const GalaxyParametersModal: React.FC<GalaxyParametersModalProps> = React.memo(({
  showConfigModal,
  setShowConfigModal,
  draftConfig,
  setDraftConfig,
  handleApplySliders,
}) => {
  if (!showConfigModal) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100 flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-bold text-white tracking-wide">
              Customize Galaxy Parameters
            </h3>
          </div>
          <button
            onClick={() => setShowConfigModal(false)}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs font-mono">
          {/* Galaxy Morphology */}
          <div>
            <label className="text-slate-300 block mb-1.5 font-bold">
              Galaxy Morphology Type
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {MORPHOLOGY_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setDraftConfig((d) => ({ ...d, morphology: m.id }))}
                  className={`p-2 rounded-xl text-left border transition ${
                    draftConfig.morphology === m.id
                      ? 'bg-blue-950/80 border-blue-500 text-white font-bold'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs">
                    <span>{m.icon}</span>
                    <span>{m.label.split(' ')[0]}</span>
                  </div>
                  <div className="text-[9px] text-slate-500 truncate mt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Galaxy Seed */}
          <div>
            <label className="text-slate-300 block mb-1 font-bold">
              Galaxy PRNG Seed
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={draftConfig.seed}
                onChange={(e) =>
                  setDraftConfig((d) => ({ ...d, seed: parseInt(e.target.value) || 1 }))
                }
                className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() =>
                  setDraftConfig((d) => ({
                    ...d,
                    seed: Math.floor(Math.random() * 90000) + 1000,
                  }))
                }
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
              >
                Random
              </button>
            </div>
          </div>

          {/* Arm Parameters (Count, Winding, Width, Strength for spirals) */}
          {(draftConfig.morphology === 'spiral' || draftConfig.morphology === 'barred-spiral') && (
            <div className="space-y-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">
                Spiral Arm Mechanics
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">
                    Arm Count: <strong className="text-blue-400">{draftConfig.armCount}</strong>
                  </label>
                  <input
                    type="range"
                    min={2}
                    max={6}
                    step={1}
                    value={draftConfig.armCount}
                    onChange={(e) =>
                      setDraftConfig((d) => ({ ...d, armCount: parseInt(e.target.value) }))
                    }
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">
                    Arm Winding: <strong className="text-blue-400">{draftConfig.armWinding.toFixed(2)}x</strong>
                  </label>
                  <input
                    type="range"
                    min={0.5}
                    max={5.0}
                    step={0.05}
                    value={draftConfig.armWinding}
                    onChange={(e) =>
                      setDraftConfig((d) => ({ ...d, armWinding: parseFloat(e.target.value) }))
                    }
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                  <div className="text-[9px] text-slate-500 mt-0.5">Scale up to 5.0x tight winding</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-slate-800/60 pt-2.5">
                <div>
                  <label className="text-slate-300 block mb-1">
                    Arm Width: <strong className="text-cyan-400">{(draftConfig.armWidth ?? 1.0).toFixed(2)}x</strong>
                  </label>
                  <input
                    type="range"
                    min={0.3}
                    max={2.5}
                    step={0.05}
                    value={draftConfig.armWidth ?? 1.0}
                    onChange={(e) =>
                      setDraftConfig((d) => ({ ...d, armWidth: parseFloat(e.target.value) }))
                    }
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <div className="text-[9px] text-slate-500 mt-0.5">Filament thin to sweeping broad</div>
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">
                    Arm Strength: <strong className="text-amber-400">{(draftConfig.armStrength ?? 1.0).toFixed(2)}x</strong>
                  </label>
                  <input
                    type="range"
                    min={0.2}
                    max={3.0}
                    step={0.05}
                    value={draftConfig.armStrength ?? 1.0}
                    onChange={(e) =>
                      setDraftConfig((d) => ({ ...d, armStrength: parseFloat(e.target.value) }))
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="text-[9px] text-slate-500 mt-0.5">Density multiplier for spiral arms</div>
                </div>
              </div>
            </div>
          )}

          {/* Galaxy Radius & Overall Density Scale */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-300 block font-bold">
                  Physical Radius:
                </label>
                <strong className="text-emerald-400">{draftConfig.radiusKpc} kpc</strong>
              </div>
              <input
                type="range"
                min={10}
                max={50}
                step={1}
                value={draftConfig.radiusKpc}
                onChange={(e) =>
                  setDraftConfig((d) => ({ ...d, radiusKpc: parseInt(e.target.value) }))
                }
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="text-[9.5px] text-slate-400 mt-1 font-mono">
                {draftConfig.radiusKpc === 50
                  ? '🌌 50 kpc: Fills entire 50×50 grid'
                  : draftConfig.radiusKpc === 25
                  ? '🌌 25 kpc: Extends halfway out'
                  : `Extends ${Math.round((draftConfig.radiusKpc / 50) * 100)}% of grid`}
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-300 block font-bold">
                  Density Scale:
                </label>
                <strong className={draftConfig.overallDensityScale > 1.2 ? 'text-amber-300' : 'text-emerald-400'}>
                  {draftConfig.overallDensityScale.toFixed(2)}x
                </strong>
              </div>
              <input
                type="range"
                min={0.5}
                max={3.0}
                step={0.05}
                value={draftConfig.overallDensityScale}
                onChange={(e) =>
                  setDraftConfig((d) => ({
                    ...d,
                    overallDensityScale: parseFloat(e.target.value),
                  }))
                }
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="text-[9.5px] text-slate-400 mt-1 font-mono">
                {draftConfig.overallDensityScale > 1.2 ? '🔥 Overdensity overflow active' : 'Baseline stellar density'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
          <button
            type="button"
            onClick={() => setShowConfigModal(false)}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApplySliders}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-mono font-bold transition shadow-lg shadow-blue-500/20 cursor-pointer"
          >
            Generate Galaxy
          </button>
        </div>
      </div>
    </div>
  );
});

GalaxyParametersModal.displayName = 'GalaxyParametersModal';
