import React, { useState, useMemo } from 'react';
import { X, MapPin, Check, Navigation } from 'lucide-react';
import { SectorHexGridData } from '../../../core/generation/sectorHex';
import {
  generateGalaxyGrid,
  applyCachedSectorsToGalaxyGrid,
  GalaxySectorHex,
} from '../../../core/generation/galaxyGen';
import { universeCache } from '../../../core/storage/universeCache';

export interface PlaceSectorInGalaxyModalProps {
  isOpen: boolean;
  onClose: () => void;
  gridData: SectorHexGridData;
  onPlaceInGalaxy: (targetCoord: string, targetName: string, shouldNavigateToGalaxy: boolean) => void;
}

export const PlaceSectorInGalaxyModal: React.FC<PlaceSectorInGalaxyModalProps> = React.memo(({
  isOpen,
  onClose,
  gridData,
  onPlaceInGalaxy,
}) => {
  if (!isOpen) return null;

  const initialCoord = useMemo(() => {
    return gridData.config.coord ? gridData.config.coord.padStart(4, '0') : '2525';
  }, [gridData.config.coord]);

  const [col, setCol] = useState<number>(() => {
    return Math.max(1, Math.min(50, parseInt(initialCoord.slice(0, 2), 10) || 25));
  });
  const [row, setRow] = useState<number>(() => {
    return Math.max(1, Math.min(50, parseInt(initialCoord.slice(2, 4), 10) || 25));
  });
  const [sectorName, setSectorName] = useState<string>(() => {
    return gridData.config.name || `Sector ${initialCoord}`;
  });

  const targetCoord = useMemo(() => {
    return `${String(col).padStart(2, '0')}${String(row).padStart(2, '0')}`;
  }, [col, row]);

  // Load active galaxy configuration and sectors
  const galConfig = useMemo(() => universeCache.getActiveGalaxyConfig(), []);
  const baseGrid = useMemo(() => generateGalaxyGrid(galConfig), [galConfig]);
  const galaxyGrid = useMemo(() => {
    return applyCachedSectorsToGalaxyGrid(baseGrid, (c, s) =>
      universeCache.getCachedSectorByCoord(c, s)
    );
  }, [baseGrid]);

  // Fast coordinate lookup
  const sectorMap = useMemo(() => {
    const map = new Map<string, GalaxySectorHex>();
    for (const s of galaxyGrid.sectors) {
      map.set(s.coord, s);
    }
    return map;
  }, [galaxyGrid.sectors]);

  const selectedHexInfo = sectorMap.get(targetCoord);

  // Geometry for 50x50 mini map
  const hexRadius = 3.6;
  const hexWidth = Math.sqrt(3) * hexRadius; // ~6.235
  const colSpacing = hexWidth;
  const rowSpacing = 1.5 * hexRadius; // 5.4
  const mapWidth = Math.round(50 * colSpacing + hexWidth + 14);
  const mapHeight = Math.round(50 * rowSpacing + 2 * hexRadius + 14);

  const handleSelectHex = (c: number, r: number) => {
    setCol(c);
    setRow(r);
  };

  const handleApplyPlacement = (navigate: boolean) => {
    const finalName = sectorName.trim() || `Sector ${targetCoord}`;
    onPlaceInGalaxy(targetCoord, finalName, navigate);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100 flex flex-col gap-4 font-mono text-xs max-h-[95vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow">
              <MapPin className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Place Sector into Galaxy Map
              </h3>
              <p className="text-[10px] text-slate-400">
                Bind this sector grid into an active 50×50 galaxy coordinate hex
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Sector Summary Card */}
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="w-3.5 h-3.5 rounded-full border border-white/40 shadow-sm shrink-0"
              style={{ backgroundColor: gridData.integratedColorHex }}
            />
            <div>
              <div className="text-xs font-bold text-white">{gridData.config.name}</div>
              <div className="text-[10.5px] text-slate-400">
                <span className="text-cyan-300 font-semibold">{gridData.systems.length} systems</span>
                {' '}&bull; {Math.round(gridData.config.density * 100)}% density &bull;{' '}
                <span style={{ color: gridData.integratedColorHex }}>{gridData.integratedColorHex}</span>
              </div>
            </div>
          </div>
          {gridData.hasNebula && (
            <span className="px-2 py-0.5 rounded-full bg-fuchsia-950/80 border border-fuchsia-700 text-fuchsia-300 text-[10px] font-bold flex items-center gap-1">
              <span>🌌</span>
              <span>Active Nebula</span>
            </span>
          )}
        </div>

        {/* Coordinate & Sector Name Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1 font-bold">
              Target Coord (XXYY)
            </label>
            <input
              type="text"
              maxLength={4}
              value={targetCoord}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                if (val.length >= 2) {
                  const c = Math.max(1, Math.min(50, parseInt(val.slice(0, 2), 10) || 1));
                  setCol(c);
                }
                if (val.length === 4) {
                  const r = Math.max(1, Math.min(50, parseInt(val.slice(2, 4), 10) || 1));
                  setRow(r);
                }
              }}
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-cyan-300 font-bold focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1 font-bold">
              Col & Row (1–50)
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={50}
                value={col}
                onChange={(e) => setCol(Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1)))}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-center focus:outline-none focus:border-cyan-500"
                title="Column (1 to 50)"
              />
              <span className="text-slate-600">&times;</span>
              <input
                type="number"
                min={1}
                max={50}
                value={row}
                onChange={(e) => setRow(Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1)))}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-center focus:outline-none focus:border-cyan-500"
                title="Row (1 to 50)"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1 font-bold">
              Placement Sector Name
            </label>
            <input
              type="text"
              value={sectorName}
              onChange={(e) => setSectorName(e.target.value)}
              placeholder={`Sector ${targetCoord}`}
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Interactive Mini 50x50 Galaxy Map Picker */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>
              Click any hex on the galaxy map to select coordinate:
            </span>
            <span className="text-cyan-300 font-bold">
              {targetCoord} {selectedHexInfo ? `• ${selectedHexInfo.region}` : ''}
              {selectedHexInfo && selectedHexInfo.density > 0
                ? ` (${Math.round(selectedHexInfo.density * 100)}% Occ)`
                : ' (Empty Canvas Hex)'}
            </span>
          </div>

          <div className="w-full h-56 bg-slate-950/90 rounded-xl border border-slate-800/90 p-2 flex items-center justify-center overflow-hidden relative shadow-inner">
            <svg
              viewBox={`0 0 ${mapWidth} ${mapHeight}`}
              className="w-full h-full max-h-52 select-none cursor-crosshair"
              preserveAspectRatio="xMidYMid meet"
            >
              {galaxyGrid.sectors.map((sec) => {
                const xOffset = sec.row % 2 === 1 ? hexWidth * 0.5 : 0;
                const cx = (sec.col - 1) * colSpacing + hexRadius + xOffset + 6;
                const cy = (sec.row - 1) * rowSpacing + hexRadius + 6;
                const isCached = universeCache.isSectorCached(sec.seed, sec.coord);

                let fill = '#111827';
                let fillOpacity = 0.25;
                if (sec.density > 0) {
                  fill = sec.colorHex || '#38bdf8';
                  fillOpacity = Math.max(0.4, Math.min(1.0, sec.opacity));
                }

                return (
                  <g key={sec.coord} onClick={() => handleSelectHex(sec.col, sec.row)}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={hexRadius * 0.9}
                      fill={fill}
                      fillOpacity={fillOpacity}
                      className="transition-colors hover:fill-cyan-400 hover:fill-opacity-100"
                    />
                    {isCached && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={hexRadius * 1.15}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth={0.65}
                      />
                    )}
                  </g>
                );
              })}

              {/* Target coordinate reticle */}
              {(() => {
                const xOffset = row % 2 === 1 ? hexWidth * 0.5 : 0;
                const cx = (col - 1) * colSpacing + hexRadius + xOffset + 6;
                const cy = (row - 1) * rowSpacing + hexRadius + 6;
                return (
                  <g className="pointer-events-none">
                    <circle
                      cx={cx}
                      cy={cy}
                      r={hexRadius * 2.1}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth={1.2}
                      className="animate-pulse"
                    />
                    <line
                      x1={cx - hexRadius * 3}
                      y1={cy}
                      x2={cx + hexRadius * 3}
                      y2={cy}
                      stroke="#38bdf8"
                      strokeWidth={0.8}
                    />
                    <line
                      x1={cx}
                      y1={cy - hexRadius * 3}
                      x2={cx}
                      y2={cy + hexRadius * 3}
                      stroke="#38bdf8"
                      strokeWidth={0.8}
                    />
                  </g>
                );
              })()}
            </svg>
          </div>

          <div className="flex items-center justify-between text-[9.5px] text-slate-500 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full border border-emerald-400 bg-emerald-950 inline-block" />
              <span>Emerald ring: Cached / Populated Hex</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full border border-cyan-400 inline-block" />
              <span>Cyan reticle: Target Placement Coordinate</span>
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-3 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleApplyPlacement(false)}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-emerald-600/70 hover:border-emerald-400 text-emerald-300 font-bold transition flex items-center gap-1.5 cursor-pointer shadow"
              title="Place sector into galaxy cache at coordinate and remain in Sector View"
            >
              <Check className="w-3.5 h-3.5" />
              <span>📍 Place Sector (Stay in Sector)</span>
            </button>

            <button
              type="button"
              onClick={() => handleApplyPlacement(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-blue-600/30 cursor-pointer"
              title="Place sector into galaxy cache and switch view to Galaxy Map centered on target hex"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>🌌 Place & View in Galaxy Map</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

PlaceSectorInGalaxyModal.displayName = 'PlaceSectorInGalaxyModal';
