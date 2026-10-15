import React from 'react';
import { X } from 'lucide-react';
import { RealisticBeltBody, RealisticPlanetaryZone } from '../types';

interface BeltDossierModalProps {
  belt: RealisticBeltBody;
  bodyIdx: number;
  zone: RealisticPlanetaryZone;
  onClose: () => void;
}

export const BeltDossierModal: React.FC<BeltDossierModalProps> = ({
  belt,
  bodyIdx,
  zone,
  onClose,
}) => {
  const isIcy = belt.role.toLowerCase().includes('icy') || belt.a >= (zone.a_snow ?? 2.7);
  const beltLabel = isIcy ? 'Icy Asteroid Belt' : 'Rocky Asteroid Belt';

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0e131d] border border-slate-500/60 rounded-2xl max-w-lg w-full p-5 flex flex-col gap-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-white">
              Belt #{bodyIdx + 1}: {beltLabel}
            </h2>
            <p className="text-xs text-sky-400 font-mono">{zone.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 bg-[#151d2c] p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
          <div>
            <span className="text-slate-400 block text-[10px]">Central Orbit</span>
            <b className="text-white text-sm">{belt.a} AU</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Radial Half-Width</span>
            <b className="text-sky-300 text-sm">±{belt.beltWidth} AU</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Surviving Mass</span>
            <b className="text-emerald-300 text-sm">{belt.massEarth} M⊕</b>
          </div>
        </div>
        <div className="text-xs text-slate-400 font-mono">
          Initial 1–2% Protoplanetary Disk Slot Share:{' '}
          <b className="text-slate-200">{belt.rawSlotMassEarth} M⊕</b> (99%+ dynamically scattered/ground by resonances)
        </div>
      </div>
    </div>
  );
};
