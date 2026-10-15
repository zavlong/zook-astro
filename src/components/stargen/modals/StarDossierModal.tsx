import { Crosshair, X } from 'lucide-react';
import { RealisticStarNode, RealisticStarSystemResult } from '../types';
import { BlackHoleIcon } from '../../ui/BlackHoleIcon';

interface StarDossierModalProps {
  star: RealisticStarNode;
  starIdx: number;
  systemResult: RealisticStarSystemResult;
  onSelectStar: (idx: number) => void;
  onTrackInOrrery: (starIdx: number) => void;
  onClose: () => void;
}

export const StarDossierModal: React.FC<StarDossierModalProps> = ({
  star,
  starIdx,
  systemResult,
  onSelectStar,
  onTrackInOrrery,
  onClose,
}) => {
  const catLower = (star.category || '').toLowerCase();
  const spLower = (star.spectralType || '').toLowerCase();
  const isSMBH = catLower.includes('supermassive') || spLower.includes('smbh') || star.mass > 999999;
  const isBlackHole =
    isSMBH ||
    catLower.includes('black hole') ||
    spLower.includes('black hole') ||
    spLower === 'bh' ||
    spLower.startsWith('bh ') ||
    spLower.includes('/ bh');

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0e131d] border border-sky-500/60 rounded-2xl max-w-xl w-full p-5 flex flex-col gap-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            {isBlackHole ? (
              <div className="w-10 h-10 flex items-center justify-center shrink-0">
                <BlackHoleIcon isSupermassive={isSMBH} size={42} />
              </div>
            ) : (
              <div
                className="w-10 h-10 rounded-full shrink-0"
                style={{
                  backgroundColor: star.colorHex,
                  boxShadow: `0 0 20px ${star.colorHex}`,
                }}
              />
            )}
            <div>
              <h2 className="text-base font-bold text-white">
                Star {star.label} &bull; {star.spectralType}
              </h2>
              {star.category !== 'Main Sequence' && (
                <p className="text-xs text-sky-400 font-mono">{star.category}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onTrackInOrrery(starIdx)}
              className="px-2.5 py-1 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700 text-xs font-mono flex items-center gap-1 cursor-pointer transition shadow-sm"
              title="Center camera on Star in 3D Orrery"
            >
              <Crosshair className="w-3.5 h-3.5 text-indigo-400" />
              Center in Orrery
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 bg-[#151d2c] p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
          <div>
            <span className="text-slate-400 block text-[10px]">Mass</span>
            <b className="text-white text-sm">{star.mass} M☉</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Luminosity</span>
            <b className="text-amber-300 text-sm">{star.lum} L☉</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Radius</span>
            <b className="text-sky-300 text-sm">{star.radius} R☉</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Temperature</span>
            <b className="text-white text-sm">{star.Teff} K</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Gravity</span>
            <b className="text-white text-sm">log g = {star.logg}</b>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">MS Fractional Age</span>
            <b className="text-emerald-300 text-sm">τ = {star.tau}</b>
          </div>
        </div>

        <div className="flex justify-between items-center text-xs font-mono text-slate-400">
          <span>
            System Age: <b className="text-slate-200">{systemResult.step1.age} Gyr</b> &bull; Metallicity:{' '}
            <b className="text-slate-200">
              {systemResult.step1.feh >= 0 ? '+' : ''}
              {systemResult.step1.feh} dex
            </b>
          </span>
          <div className="flex gap-1.5">
            {systemResult.hierarchy.stars.map((s, idx) => (
              <button
                key={s.label}
                type="button"
                onClick={() => onSelectStar(idx)}
                className={`px-2.5 py-1 rounded border cursor-pointer ${
                  idx === starIdx
                    ? 'bg-sky-600 text-white border-sky-400 font-bold'
                    : 'bg-slate-900 text-slate-300 border-slate-700'
                }`}
              >
                Star {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
