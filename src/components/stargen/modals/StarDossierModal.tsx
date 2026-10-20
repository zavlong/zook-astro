import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Sliders, X } from 'lucide-react';
import { RealisticStarNode, RealisticStarSystemResult } from '../types';
import { BlackHoleIcon } from '../../ui/BlackHoleIcon';
import {
  getProceduralStarSpriteDataUrl,
  getStarSpectralPalette,
  renderProceduralStarToCanvas,
} from '../../../core/generation/starAssets';

interface StarDossierModalProps {
  star: RealisticStarNode;
  starIdx: number;
  systemResult: RealisticStarSystemResult;
  onSelectStar: (idx: number) => void;
  onTrackInOrrery: (starIdx: number) => void;
  onOpenPreProgramStars?: () => void;
  onClose: () => void;
}

export const StarDossierModal: React.FC<StarDossierModalProps> = ({
  star,
  starIdx,
  systemResult,
  onSelectStar,
  onTrackInOrrery,
  onOpenPreProgramStars,
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

  const palette = getStarSpectralPalette(star);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rotYaw, setRotYaw] = useState(0);
  const [rotPitch, setRotPitch] = useState(0.14);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  useEffect(() => {
    if (!canvasRef.current || isBlackHole) return;
    renderProceduralStarToCanvas(canvasRef.current, star, 168, rotYaw, rotPitch);
  }, [star, isBlackHole, rotYaw, rotPitch]);

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
              <div className="w-11 h-11 flex items-center justify-center shrink-0">
                <BlackHoleIcon isSupermassive={isSMBH} size={42} />
              </div>
            ) : (
              <img
                src={getProceduralStarSpriteDataUrl(star, 96)}
                alt={`Star ${star.label}`}
                className="w-11 h-11 shrink-0 select-none"
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
            {onOpenPreProgramStars && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPreProgramStars();
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-700 text-xs font-mono flex items-center gap-1 cursor-pointer transition shadow-sm"
                title="Pre-Program Star Data & Generate Planets Only"
              >
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                Pre-Program Stars
              </button>
            )}
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

        {/* Interactive 3D Colored & Sunspotted Photosphere Portrait */}
        {!isBlackHole && (
          <div className="flex items-center gap-4 bg-[#080d18] p-3.5 rounded-xl border border-slate-800/90">
            <div
              className={`relative shrink-0 rounded-xl bg-[#04070f] border border-slate-800 p-1.5 select-none ${
                isDragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              title="Drag to rotate 3D stellar photosphere, granulation & sunspot belts"
              onMouseDown={(e) => {
                setIsDragging(true);
                dragRef.current = {
                  x: e.clientX,
                  y: e.clientY,
                  yaw: rotYaw,
                  pitch: rotPitch,
                };
              }}
              onMouseMove={(e) => {
                if (!isDragging || !dragRef.current) return;
                const dx = e.clientX - dragRef.current.x;
                const dy = e.clientY - dragRef.current.y;
                setRotYaw(dragRef.current.yaw + dx * 0.015);
                setRotPitch(
                  Math.max(-1.1, Math.min(1.1, dragRef.current.pitch + dy * 0.012))
                );
              }}
              onMouseUp={() => {
                setIsDragging(false);
                dragRef.current = null;
              }}
              onMouseLeave={() => {
                setIsDragging(false);
                dragRef.current = null;
              }}
            >
              <canvas
                ref={canvasRef}
                width={168}
                height={168}
                className="w-28 h-28 block"
              />
              <span className="absolute bottom-1 right-1.5 text-[9px] font-mono text-slate-500 pointer-events-none">
                3D Drag
              </span>
            </div>

            <div className="flex-1 font-mono text-xs space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                Photosphere &amp; Magnetic Sunspot Profile
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center gap-2 bg-slate-900/70 px-2.5 py-1.5 rounded border border-slate-800">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 border border-white/30"
                    style={{ backgroundColor: palette.baseHex }}
                  />
                  <div>
                    <span className="text-slate-400 block text-[9px]">Photosphere / Limb</span>
                    <b className="text-slate-200">{palette.baseHex.toUpperCase()}</b>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-slate-900/70 px-2.5 py-1.5 rounded border border-slate-800">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 border border-amber-500/50"
                    style={{
                      background: `radial-gradient(circle, ${palette.umbraHex} 45%, ${palette.penumbraHex} 100%)`,
                    }}
                  />
                  <div>
                    <span className="text-slate-400 block text-[9px]">Sunspot Activity</span>
                    <b className="text-amber-300">
                      {palette.spotCoverage >= 1.3
                        ? 'High (Active Starspots)'
                        : palette.spotCoverage >= 0.8
                        ? 'Moderate (Bipolar Belts)'
                        : 'Low (Magnetic Plages)'}
                    </b>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Eddington limb-darkened photosphere with 3D convective granulation cells, bright magnetic faculae, and Spörer&apos;s Law bipolar sunspot groups (umbra &approx; {Math.round(star.Teff * 0.68)} K, penumbra &approx; {Math.round(star.Teff * 0.86)} K).
              </p>
            </div>
          </div>
        )}

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
                className={`px-2.5 py-1 rounded border cursor-pointer flex items-center gap-1.5 ${
                  idx === starIdx
                    ? 'bg-sky-600 text-white border-sky-400 font-bold'
                    : 'bg-slate-900 text-slate-300 border-slate-700'
                }`}
              >
                <img
                  src={getProceduralStarSpriteDataUrl(s, 36)}
                  alt=""
                  className="w-3.5 h-3.5 shrink-0"
                />
                Star {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

