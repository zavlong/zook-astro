import React, { useState } from 'react';
import {
  Sprout,
  X,
  Filter,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react';
import {
  PlanetaryEcosystemSummary,
  getSpeciesForBiome,
} from '../../../core/xenobiology/floraGen';
import { GoldbergPlanetaryTile } from './goldbergTileGrid';

interface SurfaceEcosystemPanelProps {
  ecosystem: PlanetaryEcosystemSummary;
  activeTile?: GoldbergPlanetaryTile | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SurfaceEcosystemPanel: React.FC<SurfaceEcosystemPanelProps> = ({
  ecosystem,
  activeTile,
  isOpen,
  onClose,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'tile'>('all');
  const [expandedSpeciesId, setExpandedSpeciesId] = useState<string | null>(null);

  if (!isOpen) return null;

  if (!ecosystem.hasPlantLife) {
    return (
      <div className="w-full bg-[#0c121d]/95 backdrop-blur border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2 text-slate-400 font-bold">
            <Sprout className="w-4 h-4 text-slate-500" />
            INDIGENOUS XENOFLORA & ECOSYSTEM CATALOG
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 bg-slate-900/60 rounded-lg border border-slate-800/80 text-center text-slate-400">
          <p className="font-semibold text-slate-300 mb-1">Sterile / Abiotic World</p>
          <p className="text-[11px] leading-relaxed max-w-lg mx-auto">
            {ecosystem.summaryText}
          </p>
        </div>
      </div>
    );
  }

  const activeBiomeId = activeTile ? activeTile.biomeId : null;
  const tileNativeSpecies = activeBiomeId !== null 
    ? getSpeciesForBiome(ecosystem.speciesList, activeBiomeId) 
    : [];

  const displayList = filterMode === 'tile' && activeTile ? tileNativeSpecies : ecosystem.speciesList;

  const toggleExpand = (id: string) => {
    setExpandedSpeciesId(prev => (prev === id ? null : id));
  };

  return (
    <div className="w-full bg-[#0d1422]/95 backdrop-blur border border-emerald-500/40 rounded-xl p-4 font-mono text-xs text-slate-200 shadow-2xl flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-400">
            <Sprout className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-300 tracking-wide">
                INDIGENOUS XENOFLORA & ECOSYSTEM
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 border border-emerald-500/60 text-emerald-300">
                {ecosystem.diversityTier}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              Astrophysical photobiology, gravity-scaled morphology, and native biome distribution
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Toggles */}
          <div className="flex items-center rounded-lg border border-slate-800 bg-[#070b12] p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded transition ${
                filterMode === 'all'
                  ? 'bg-emerald-900/70 text-emerald-200 font-bold border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Taxa ({ecosystem.speciesList.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('tile')}
              disabled={!activeTile}
              className={`px-2.5 py-1 rounded transition flex items-center gap-1.5 ${
                filterMode === 'tile'
                  ? 'bg-emerald-900/70 text-emerald-200 font-bold border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
              title={activeTile ? `Filter species native to ${activeTile.biomeName}` : 'Select a tile to filter'}
            >
              <Filter className="w-3 h-3" />
              Active Tile ({tileNativeSpecies.length})
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition border border-slate-800"
            title="Close Ecosystem Catalog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Global Photobiology & Macroecology Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#080d17] p-2.5 rounded-lg border border-slate-800/80 text-[11px]">
        <div>
          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Dominant Pigment</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="w-3 h-3 rounded-full border border-white/30 flex-shrink-0"
              style={{ backgroundColor: ecosystem.dominantPigmentHex }}
            />
            <span className="font-semibold text-slate-200 truncate" title={ecosystem.dominantPigment}>
              {ecosystem.dominantPigment}
            </span>
          </div>
        </div>

        <div>
          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Trophic Mechanism</span>
          <b className="text-emerald-300 block truncate mt-0.5" title={ecosystem.photosynthesisType}>
            {ecosystem.photosynthesisType}
          </b>
        </div>

        <div>
          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">
            {ecosystem.isMulticellular ? 'Canopy Height Range' : 'Flora Profile'}
          </span>
          <b className="text-sky-300 block mt-0.5">
            {ecosystem.isMulticellular
              ? `${ecosystem.canopyHeightRangeM.min}m – ${ecosystem.canopyHeightRangeM.max}m`
              : 'Flat Soil Crust (<5cm)'}
          </b>
        </div>

        <div>
          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Structural Polymer</span>
          <b className="text-amber-200 block truncate mt-0.5" title={ecosystem.structuralBase}>
            {ecosystem.structuralBase}
          </b>
        </div>
      </div>

      {/* Active Tile Context Notice */}
      {activeTile && (
        <div className="px-3 py-1.5 rounded bg-slate-900/60 border border-slate-800 text-[11px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Selected Tile #{activeTile.tileId}:</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-700 bg-slate-800/70 text-cyan-300">
              {activeTile.biomeName}
            </span>
            <span className="text-slate-500">
              ({activeTile.elevationMeters > 0 ? `+${activeTile.elevationMeters}m` : `${activeTile.elevationMeters}m`}, {activeTile.isOcean ? 'Hydrosphere' : 'Dry Land'})
            </span>
          </div>
          <span className="text-emerald-400 font-semibold">
            {tileNativeSpecies.length} native {tileNativeSpecies.length === 1 ? 'species' : 'species'} present
          </span>
        </div>
      )}

      {/* Species Catalog Table */}
      {displayList.length === 0 ? (
        <div className="p-6 text-center text-slate-400 bg-[#090e18] rounded-lg border border-slate-800">
          <p className="font-semibold text-slate-300 mb-1">No Indigenous Plant Life in Active Tile Biome</p>
          <p className="text-[11px] text-slate-500 max-w-md mx-auto mb-3">
            The active tile ({activeTile?.biomeName}) is an abiotic or extreme habitat (e.g. active volcanic caldera or abyssal ocean trench). Switch to &quot;All Taxa&quot; or click a continental basin or plains tile to inspect local flora.
          </p>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className="px-3 py-1 bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 rounded font-bold hover:bg-emerald-900 transition"
          >
            Show All Planetary Species
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#080d17]">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#05080f] text-slate-400 border-b border-slate-800 uppercase text-[9px] tracking-wider font-semibold">
                <th className="py-2.5 px-3">Taxon & Growth Form</th>
                <th className="py-2.5 px-3">Pigment & Color</th>
                <th className="py-2.5 px-3">Dimensions & Stipe</th>
                <th className="py-2.5 px-3">Dispersal & Spores</th>
                <th className="py-2.5 px-3">Native Biomes</th>
                <th className="py-2.5 px-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {displayList.map(species => {
                const isNativeToActive = activeBiomeId !== null && species.nativeBiomeIds.includes(activeBiomeId);
                const isExpanded = expandedSpeciesId === species.id;

                return (
                  <React.Fragment key={species.id}>
                    <tr
                      onClick={() => toggleExpand(species.id)}
                      className={`cursor-pointer transition-colors ${
                        isNativeToActive
                          ? 'bg-emerald-950/20 hover:bg-emerald-950/35 border-l-2 border-l-emerald-400'
                          : 'hover:bg-slate-900/50'
                      }`}
                    >
                      {/* Name & Form */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 font-bold text-white">
                          <span>{species.commonName}</span>
                          {isNativeToActive && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400"
                              title="Native to currently selected tile"
                            />
                          )}
                        </div>
                        <div className="text-[10px] text-emerald-400/90 italic font-serif">
                          {species.scientificName}
                        </div>
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] bg-slate-800 text-slate-300 border border-slate-700">
                          {species.growthForm}
                        </span>
                      </td>

                      {/* Pigment */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm flex-shrink-0"
                            style={{ backgroundColor: species.pigmentColorHex }}
                          />
                          <div>
                            <span className="font-semibold text-slate-200 block text-[10px]">
                              {species.pigmentColorHex.toUpperCase()}
                            </span>
                            <span className="text-[9px] text-slate-400 line-clamp-1" title={species.pigmentName}>
                              {species.pigmentName.split('(')[0].trim()}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Height & Structure */}
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-sky-300">
                          {species.averageHeightM < 0.1
                            ? `${(species.averageHeightM * 100).toFixed(1)}cm crust`
                            : `${species.averageHeightM}m tall`}{' '}
                          <span className="text-slate-400 font-normal">× {species.averageSpreadM}m</span>
                        </div>
                        <span className="text-[9px] text-slate-400 block truncate max-w-[140px]" title={species.structuralPolymer}>
                          {species.structuralPolymer}
                        </span>
                      </td>

                      {/* Reproduction */}
                      <td className="py-2.5 px-3 text-slate-300 max-w-[160px]">
                        <span className="line-clamp-2 text-[10px]" title={species.reproductionMethod}>
                          {species.reproductionMethod}
                        </span>
                      </td>

                      {/* Native Biomes */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {species.nativeBiomeNames.map((bName, idx) => {
                            const bId = species.nativeBiomeIds[idx];
                            const isMatch = activeBiomeId === bId;
                            return (
                              <span
                                key={bName}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                                  isMatch
                                    ? 'bg-emerald-900 border-emerald-400 text-emerald-200 font-bold'
                                    : 'bg-slate-900 border-slate-800 text-slate-400'
                                }`}
                              >
                                {bName}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Expand / Collapse Action */}
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-emerald-400" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Detail Drawer */}
                    {isExpanded && (
                      <tr className="bg-[#050912] border-b border-slate-800/80">
                        <td colSpan={6} className="p-3.5 pl-6">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-2 space-y-2">
                              <div>
                                <span className="text-slate-500 block text-[9px] uppercase tracking-wider mb-0.5">
                                  FIELD NOTE & ECOLOGICAL NICHE
                                </span>
                                <p className="text-slate-300 text-xs leading-relaxed">
                                  {species.description}
                                </p>
                              </div>

                              <div>
                                <span className="text-slate-500 block text-[9px] uppercase tracking-wider mb-1">
                                  KEY PHYSIOLOGICAL ADAPTATIONS
                                </span>
                                <ul className="space-y-1">
                                  {species.adaptations.map((adapt, aIdx) => (
                                    <li key={aIdx} className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                      <span>{adapt}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>

                            <div className="bg-[#0a0f1b] p-2.5 rounded-lg border border-slate-800 space-y-2 text-[10px]">
                              <div>
                                <span className="text-slate-500 block uppercase text-[9px]">Canopy Abundance</span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div
                                      className="bg-emerald-400 h-full rounded-full"
                                      style={{ width: `${species.canopyCoveragePct}%` }}
                                    />
                                  </div>
                                  <span className="font-bold text-white flex-shrink-0">{species.canopyCoveragePct}%</span>
                                </div>
                              </div>

                              <div>
                                <span className="text-slate-500 block uppercase text-[9px]">Structural Material</span>
                                <b className="text-slate-200">{species.structuralPolymer}</b>
                              </div>

                              <div>
                                <span className="text-slate-500 block uppercase text-[9px]">Light Absorption</span>
                                <b className="text-slate-200">{species.trophicType}</b>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
