import React from 'react';
import { X } from 'lucide-react';
import { RealisticBinarySplit } from '../types';

interface BinarySplitModalProps {
  split: RealisticBinarySplit;
  onClose: () => void;
}

export const BinarySplitModal: React.FC<BinarySplitModalProps> = ({ split, onClose }) => {
  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0e131d] border border-amber-500/60 rounded-2xl max-w-lg w-full p-5 flex flex-col gap-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-white">
              Binary / Hierarchical Split [{split.pair}]
            </h2>
            <p className="text-xs text-amber-400 font-mono">{split.regime}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 bg-[#151d2c] p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
          <div>
            <span className="text-slate-400 block text-[10px]">Binary Separation (a)</span>
            <b className="text-white text-sm">{split.a_AU} AU</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Binary Eccentricity (e)</span>
            <b className="text-white text-sm">{split.e}</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Holman-Wiegert S-Type Max (A / B)</span>
            <b className="text-sky-300 text-sm">
              {split.sMaxA} AU / {split.sMaxB} AU
            </b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Holman-Wiegert P-Type Inner Min</span>
            <b className="text-emerald-300 text-sm">{split.pMin} AU</b>
          </div>
        </div>
      </div>
    </div>
  );
};
