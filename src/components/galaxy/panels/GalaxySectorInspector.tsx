import React from 'react';
import {
  Check,
  Edit2,
  ArrowRight,
  Download,
} from 'lucide-react';
import { GalaxySectorHex } from '../../../core/generation/galaxyGen';
import {
  generateSectorHexGrid,
  SectorHexGridData,
} from '../../../core/generation/sectorHex';
import { universeCache } from '../../../core/storage/universeCache';

export interface GalaxySectorInspectorProps {
  showUI?: boolean;
  selectedSector: GalaxySectorHex | null;
  customSectorNames: Record<string, string>;
  isEditingSectorName: boolean;
  setIsEditingSectorName: (editing: boolean) => void;
  sectorNameDraft: string;
  setSectorNameDraft: (name: string) => void;
  handleSaveSectorName: () => void;
  handleTriggerEnterSector: (sector: GalaxySectorHex) => void;
  setExportSectorGridData: (data: SectorHexGridData) => void;
  setShowSectorExportModal: (show: boolean) => void;
}

export const GalaxySectorInspector: React.FC<GalaxySectorInspectorProps> = React.memo(({
  showUI = true,
  selectedSector,
  customSectorNames,
  isEditingSectorName,
  setIsEditingSectorName,
  sectorNameDraft,
  setSectorNameDraft,
  handleSaveSectorName,
  handleTriggerEnterSector,
  setExportSectorGridData,
  setShowSectorExportModal,
}) => {
  if (!showUI) return null;

  return (
    <aside
      style={{ containIntrinsicSize: 'auto 380px' }}
      className="w-80 md:w-96 h-full flex flex-col bg-slate-950/95 backdrop-blur-xl border-l border-slate-800/90 z-10 overflow-y-auto"
    >
      {selectedSector ? (
        <div className="p-4 flex flex-col gap-4">
          {/* Sector Header Card */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 relative overflow-hidden">
            <div
              className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-20 pointer-events-none"
              style={{ backgroundColor: selectedSector.colorHex }}
            />

            <div className="flex items-center justify-between gap-2">
              {isEditingSectorName ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <input
                    type="text"
                    value={sectorNameDraft}
                    onChange={(e) => setSectorNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveSectorName();
                      if (e.key === 'Escape') setIsEditingSectorName(false);
                    }}
                    autoFocus
                    className="bg-slate-950 border border-cyan-500 rounded-lg px-2 py-1 text-sm font-bold text-white flex-1 focus:outline-none"
                    placeholder="Sector Name..."
                  />
                  <button
                    onClick={handleSaveSectorName}
                    className="p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition cursor-pointer"
                    title="Save Sector Name"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <h3
                    onClick={() => setIsEditingSectorName(true)}
                    className="text-base font-extrabold text-white truncate cursor-pointer hover:text-cyan-300 transition"
                    title="Click to rename sector"
                  >
                    {customSectorNames[selectedSector.coord] || selectedSector.name}
                  </h3>
                  <button
                    onClick={() => setIsEditingSectorName(true)}
                    className="p-1 text-slate-500 hover:text-cyan-300 transition cursor-pointer"
                    title="Rename sector"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <span className="text-xs font-mono text-slate-400 shrink-0">
                ({selectedSector.col}, {selectedSector.row})
              </span>
            </div>

            {universeCache.isSectorCached(selectedSector.seed, selectedSector.coord) && (
              <div className="mt-2.5 px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-xs font-mono font-semibold flex items-center gap-1.5 shadow-sm">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Explored Sector</span>
              </div>
            )}

            {selectedSector.coord === '2525' && (
              <div className="mt-2.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-950/90 to-indigo-950/90 border border-purple-500/70 text-purple-200 text-xs font-mono font-bold flex items-center gap-2 shadow-lg">
                <span className="text-sm">🌀</span>
                <span>Galactic Nucleus</span>
              </div>
            )}
          </div>

          {/* PRIMARY ACTION BUTTON: ENTER SECTOR MAP */}
          <button
            onClick={() => handleTriggerEnterSector(selectedSector)}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-mono text-xs font-bold tracking-wider transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer group"
            title="Sector Map (Hotkey: Page Down)"
          >
            <span>Sector Map</span>
            <kbd className="px-1.5 py-0.5 text-[9px] bg-slate-950/70 border border-slate-700/80 rounded text-slate-300 font-sans normal-case tracking-normal">
              PgDn
            </kbd>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform ml-0.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              const secKey = universeCache.getSectorCacheKey(selectedSector.seed, selectedSector.coord);
              let cachedGrid = universeCache.getCachedSector(secKey);
              if (!cachedGrid) {
                cachedGrid = generateSectorHexGrid({
                  seed: selectedSector.seed,
                  name: customSectorNames[selectedSector.coord] || selectedSector.name,
                  coord: selectedSector.coord,
                  columns: 50,
                  rows: 50,
                  density: selectedSector.density,
                  meanAge: selectedSector.meanAge,
                  ageRange: selectedSector.ageRange,
                  ageDistribution: selectedSector.ageDistribution,
                  ageSigma:
                    selectedSector.ageDistribution === 'uniform'
                      ? +(selectedSector.ageRange / Math.sqrt(12)).toFixed(2)
                      : +(selectedSector.ageRange / 2.2).toFixed(2),
                  metallicityMean: selectedSector.metallicityMean,
                  metallicitySigma: 0.22,
                  hasNebula: selectedSector.hasNebula,
                });
                universeCache.cacheLoadedSector(secKey, cachedGrid);
              }
              setExportSectorGridData(cachedGrid);
              setShowSectorExportModal(true);
            }}
            className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-cyan-700/70 hover:border-cyan-500 text-cyan-300 font-mono text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow"
            title="Export or Import this individual sector (Stellaris Static Galaxy .txt, Stargen Sector .json, or SpaceEngine .sc)"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export / Import Sector</span>
          </button>
          <p className="text-[10px] text-slate-500 font-mono text-center -mt-2">
            Hotkey: <strong className="text-slate-400">Page Down</strong> to zoom in &bull; Double-click hex opens directly
          </p>

          {/* Galactic Position & Region */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs font-mono">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 block text-[9px]">Distance from Core</span>
                <strong className="text-white text-xs">{selectedSector.rKpc} kpc</strong>
                <span className="text-slate-400 text-[9px] block">({Math.round(selectedSector.rNorm * 100)}% of rim)</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 block text-[9px]">Longitude</span>
                <strong className="text-white text-xs">{(selectedSector.thetaRad * 57.2958).toFixed(1)}&deg;</strong>
              </div>
            </div>

            <div className="mt-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800">
              <span className="text-slate-500 block text-[9px]">Region</span>
              <strong className="text-blue-300 text-xs">{selectedSector.region}</strong>
            </div>
          </div>

          {/* Sector Stats */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs font-mono flex flex-col gap-3">
            {/* Stellar Density */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Stellar Density</span>
                <span className={`font-bold ${selectedSector.density > 1.0 ? 'text-amber-300' : 'text-white'}`}>
                  {Math.round(selectedSector.density * 100)}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    selectedSector.density > 1.0
                      ? 'bg-gradient-to-r from-blue-400 via-amber-300 to-white'
                      : 'bg-gradient-to-r from-blue-500 to-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, selectedSector.density <= 1.0 ? selectedSector.density * 100 : (selectedSector.density / 3.0) * 100)}%` }}
                />
              </div>
              <div className="flex justify-end text-[9.5px] text-emerald-400 font-semibold mt-1">
                <span>~{selectedSector.estimatedStars50x50.toLocaleString()} Systems (50&times;50)</span>
              </div>
            </div>

            {/* Mean Stellar Age & Range */}
            <div className="border-t border-slate-800/80 pt-2.5">
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Mean Stellar Age</span>
                <span className="font-bold flex items-center gap-1.5" style={{ color: selectedSector.colorHex }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedSector.colorHex }} />
                  {selectedSector.meanAge} Gyr
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-300 font-mono bg-slate-950/50 p-1.5 rounded-lg border border-slate-800/70">
                <span className="text-slate-400">Age Range:</span>
                <span className="text-cyan-300 font-bold">&plusmn;{(selectedSector.ageRange / 2).toFixed(1)} Gyr &bull; {selectedSector.ageMin} &ndash; {selectedSector.ageMax} Gyr</span>
              </div>
            </div>

            {/* Metallicity */}
            <div className="border-t border-slate-800/80 pt-2.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Metallicity</span>
                <span className={`font-bold ${selectedSector.metallicityMean >= 0 ? 'text-amber-300' : 'text-cyan-300'}`}>
                  {selectedSector.metallicityMean >= 0 ? `+${selectedSector.metallicityMean}` : selectedSector.metallicityMean} dex : <span className="font-normal text-slate-300">{selectedSector.metallicityMean >= -0.4 ? 'Population I' : 'Population II'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Active Emission Nebula Card */}
          {selectedSector.hasNebula && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-fuchsia-950/70 via-purple-950/50 to-slate-900/80 border border-fuchsia-500/50 font-mono space-y-1.5 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-fuchsia-300 flex items-center gap-1.5">
                  <span>🌌</span> Active Emission Nebula
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-fuchsia-950/90 text-fuchsia-300 border border-fuchsia-700 font-bold">
                  &lt;1.0 Gyr
                </span>
              </div>
              <div className="text-xs font-bold text-white tracking-wide">
                {selectedSector.nebulaName || 'H-II Starburst Complex'}
              </div>
              <div className="text-[10px] text-fuchsia-200/80 leading-relaxed">
                Glowing purple-red H-II gas cloud on galaxy map. Sector map background will render as colored noise clouds!
              </div>
            </div>
          )}

          {/* Giant Star Systems Card */}
          {selectedSector.giantStars && selectedSector.giantStars.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 font-mono space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <span>⭐</span> Giant Star Systems (10–50 M☉)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/80 font-bold">
                  {selectedSector.giantStars.length} Systems
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1 max-h-32 overflow-y-auto pr-1">
                {selectedSector.giantStars.map((gs) => (
                  <span
                    key={gs.id}
                    className="px-2 py-0.5 rounded-md text-[10px] flex items-center gap-1.5 border"
                    style={{
                      backgroundColor: `${gs.colorHex}15`,
                      borderColor: `${gs.colorHex}45`,
                      color: gs.colorHex,
                    }}
                    title={`${gs.spectralType} • Mass: ${gs.mass} M☉`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: gs.colorHex }} />
                    <span className="font-semibold">{gs.spectralType.split(' ')[0]}</span>
                    <span className="text-slate-400 font-mono text-[9px]">{gs.mass} M☉</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Seed Card */}
          <div className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 text-xs font-mono flex items-center justify-between">
            <span className="text-slate-400">Sector Seed:</span>
            <code className="text-cyan-300 font-bold">{selectedSector.seed}</code>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-slate-500 text-xs font-mono">
          Click any sector hexagon to inspect its galactic astrophysics.
        </div>
      )}
    </aside>
  );
});

GalaxySectorInspector.displayName = 'GalaxySectorInspector';
