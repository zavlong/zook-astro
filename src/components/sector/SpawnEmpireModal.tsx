import React, { useState, useEffect } from 'react';
import { Crown, X, Dices, Palette } from 'lucide-react';
import {
  SectorEmpire,
  AlienPhenotype,
  ALIEN_PHENOTYPES,
  PHENOTYPE_LIST,
  EMPIRE_COLOR_PALETTE,
  generateRandomEmpireName,
  generateRandomEmpire,
} from '../../core/generation/empireGen';
import { SectorHexSystem } from '../../core/generation/sectorHex';

interface SpawnEmpireModalProps {
  isOpen: boolean;
  onClose: () => void;
  homeworldSystem: SectorHexSystem | null;
  existingEmpires: SectorEmpire[];
  onFoundEmpire: (empire: SectorEmpire) => void;
}

export const SpawnEmpireModal: React.FC<SpawnEmpireModalProps> = ({
  isOpen,
  onClose,
  homeworldSystem,
  existingEmpires,
  onFoundEmpire,
}) => {
  const [empireName, setEmpireName] = useState<string>('');
  const [empireColor, setEmpireColor] = useState<string>('#10b981');
  const [phenotype, setPhenotype] = useState<AlienPhenotype>(ALIEN_PHENOTYPES.humanoid);

  // Initialize randomized empire when opened or homeworld changes
  useEffect(() => {
    if (isOpen && homeworldSystem) {
      const usedColors = existingEmpires.map((e) => e.color);
      const generated = generateRandomEmpire(homeworldSystem, usedColors);
      setEmpireName(generated.name);
      setEmpireColor(generated.color);
      setPhenotype(generated.phenotype);
    }
  }, [isOpen, homeworldSystem, existingEmpires]);

  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !homeworldSystem) return null;

  const handleRerollName = () => {
    setEmpireName(generateRandomEmpireName(phenotype.id));
  };

  const handleRerollPhenotype = () => {
    const randomP = PHENOTYPE_LIST[Math.floor(Math.random() * PHENOTYPE_LIST.length)];
    setPhenotype(randomP);
  };

  const handleConfirm = () => {
    const id = `emp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const newEmpire: SectorEmpire = {
      id,
      name: empireName.trim() || 'Alien Dominion',
      color: empireColor,
      phenotype,
      homeworldSystemId: homeworldSystem.id,
      homeworldName: homeworldSystem.name,
      homeworldCoord: homeworldSystem.coord,
      claimedSystemIds: [homeworldSystem.id],
      createdAt: Date.now(),
    };
    onFoundEmpire(newEmpire);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="spawn-empire-title"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 font-mono text-xs max-h-[92vh] overflow-y-auto relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center border shadow-lg"
              style={{
                backgroundColor: `${empireColor}25`,
                borderColor: empireColor,
                color: empireColor,
              }}
            >
              <Crown className="w-4 h-4" />
            </div>
            <div>
              <h2 id="spawn-empire-title" className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                <span>Spawn Alien Empire</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  ({phenotype.icon} {phenotype.name})
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Capital Homeworld: <strong className="text-cyan-300">{homeworldSystem.name}</strong> ({homeworldSystem.coord} &bull; {homeworldSystem.primaryClass})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Empire Name Input & Reroll */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-slate-300 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <span>Empire Name</span>
            </label>
            <button
              type="button"
              onClick={handleRerollName}
              className="text-[10.5px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer transition"
            >
              <Dices className="w-3.5 h-3.5" />
              <span>Reroll Name</span>
            </button>
          </div>
          <input
            type="text"
            value={empireName}
            onChange={(e) => setEmpireName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-white font-bold text-sm tracking-wide focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition shadow-inner"
            placeholder="Enter empire name..."
          />
        </div>

        {/* Empire Color Picker */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-slate-300 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-cyan-400" />
              <span>Imperial Realm Color</span>
            </label>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full border border-white/60 shadow"
                style={{ backgroundColor: empireColor }}
              />
              <span className="text-[11px] text-slate-400 font-mono">{empireColor.toUpperCase()}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 items-center">
            {EMPIRE_COLOR_PALETTE.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setEmpireColor(c.hex)}
                className={`w-7 h-7 rounded-lg transition-transform cursor-pointer border relative flex items-center justify-center ${
                  empireColor.toLowerCase() === c.hex.toLowerCase()
                    ? 'scale-115 border-white ring-2 ring-cyan-400 z-10'
                    : 'border-white/20 hover:scale-105 opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: c.hex }}
                title={`${c.name} (${c.hex})`}
              >
                {empireColor.toLowerCase() === c.hex.toLowerCase() && (
                  <div className="w-2 h-2 rounded-full bg-white shadow" />
                )}
              </button>
            ))}
            {/* Native Color Picker */}
            <label
              className="w-7 h-7 rounded-lg border border-dashed border-slate-600 hover:border-cyan-400 flex items-center justify-center cursor-pointer transition"
              title="Custom Hex Color"
            >
              <input
                type="color"
                value={empireColor}
                onChange={(e) => setEmpireColor(e.target.value)}
                className="sr-only"
              />
              <span className="text-[9px] text-slate-400 font-bold">+</span>
            </label>
          </div>
        </div>

        {/* Alien Phenotype Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-slate-300 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <span>Alien Phenotype</span>
            </label>
            <button
              type="button"
              onClick={handleRerollPhenotype}
              className="text-[10.5px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer transition"
            >
              <Dices className="w-3.5 h-3.5" />
              <span>Random Phenotype</span>
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
            {PHENOTYPE_LIST.map((p) => {
              const isSelected = phenotype.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPhenotype(p)}
                  className={`p-2.5 rounded-xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-950/70 border-cyan-500 text-white shadow-lg shadow-cyan-950/50'
                      : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/70 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xl flex-shrink-0 leading-none pt-0.5">{p.icon}</span>
                  <div className="min-w-0">
                    <div className="font-bold text-[11px] truncate flex items-center gap-1">
                      <span>{p.name}</span>
                    </div>
                    <div className="text-[9.5px] text-slate-400 line-clamp-2 leading-tight mt-0.5">
                      {p.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary Preview Banner */}
        <div
          className="p-3 rounded-xl border flex items-center gap-3 transition"
          style={{
            backgroundColor: `${empireColor}12`,
            borderColor: `${empireColor}40`,
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl border shadow"
            style={{
              backgroundColor: `${empireColor}25`,
              borderColor: empireColor,
            }}
          >
            {phenotype.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white truncate flex items-center gap-2">
              <span>{empireName || 'Unnamed Empire'}</span>
              <span
                className="text-[9.5px] px-1.5 py-0.2 rounded font-mono font-medium border"
                style={{
                  color: empireColor,
                  borderColor: `${empireColor}60`,
                  backgroundColor: `${empireColor}20`,
                }}
              >
                Capital: {homeworldSystem.name}
              </span>
            </div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">
              {phenotype.name} species inhabiting a habitable world in Sector {homeworldSystem.coord}.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
          <span className="text-[10px] text-slate-500">
            Tip: Hold <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[9px]">Shift</kbd> + click other stars to claim territory.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-2 rounded-xl font-bold text-white transition flex items-center gap-2 shadow-lg cursor-pointer hover:brightness-110"
              style={{
                backgroundColor: empireColor,
                boxShadow: `0 4px 14px ${empireColor}40`,
              }}
            >
              <Crown className="w-4 h-4" />
              <span>Found Empire</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
