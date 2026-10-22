import React, { useState } from 'react';
import {
  Sprout,
  Disc,
  X,
  Filter,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react';
import {
  PlanetaryEcosystemSummary,
  getSpeciesForTileBiomes,
} from '../../../core/xenobiology/floraGen';
import {
  PlanetaryFungiSummary,
  getFungiForTileBiomes,
} from '../../../core/xenobiology/fungiGen';
import { SpecimenSpecies } from '../../../core/xenobiology/botanicalArtGen';
import { GoldbergPlanetaryTile } from './goldbergTileGrid';
import { BotanicalSpecimenPlate } from './BotanicalSpecimenPlate';

interface SurfaceEcosystemPanelProps {
  ecosystem: PlanetaryEcosystemSummary;
  fungiEcosystem?: PlanetaryFungiSummary;
  activeTile?: GoldbergPlanetaryTile | null;
  isTileView?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export const SurfaceEcosystemPanel: React.FC<SurfaceEcosystemPanelProps> = ({
  ecosystem,
  fungiEcosystem,
  activeTile,
  isTileView = false,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'plants' | 'fungi'>('plants');
  const [filterMode, setFilterMode] = useState<'all' | 'tile'>('all');
  const [expandedSpeciesId, setExpandedSpeciesId] = useState<string | null>(null);

  if (!isOpen) return null;

  const hasAnyLife = ecosystem.hasPlantLife || Boolean(fungiEcosystem?.hasFungi);

  if (!hasAnyLife) {
    return (
      <div className="w-full bg-[#0c121d]/95 backdrop-blur border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2 text-slate-400 font-bold">
            <Sprout className="w-4 h-4 text-slate-500" />
            INDIGENOUS ECOSYSTEM CATALOG
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
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

  // Active tile's native species for each kingdom
  const tileNativeFlora = activeTile
    ? getSpeciesForTileBiomes(ecosystem.speciesList, activeTile.biomeId, activeTile.secondaryBiomeId)
    : [];

  const tileNativeFungi = activeTile && fungiEcosystem
    ? getFungiForTileBiomes(fungiEcosystem.speciesList, activeTile.biomeId, activeTile.secondaryBiomeId)
    : [];

  const isStrictTileOnly = Boolean(isTileView && activeTile);

  // Active tab selection
  const isFungiTab = activeTab === 'fungi';
  const currentSpeciesList: SpecimenSpecies[] = isFungiTab
    ? (fungiEcosystem?.speciesList || [])
    : ecosystem.speciesList;

  const currentTileNative: SpecimenSpecies[] = isFungiTab ? tileNativeFungi : tileNativeFlora;

  const displayList: SpecimenSpecies[] = isStrictTileOnly
    ? currentTileNative
    : filterMode === 'tile' && activeTile
    ? currentTileNative
    : currentSpeciesList;

  const toggleExpand = (id: string) => {
    setExpandedSpeciesId(prev => (prev === id ? null : id));
  };

  return (
    <div
      className={`w-full bg-[#0d1422]/95 backdrop-blur border rounded-xl p-4 font-mono text-xs text-slate-200 shadow-2xl flex flex-col gap-3 transition-colors ${
        isFungiTab ? 'border-fuchsia-500/40' : 'border-emerald-500/40'
      }`}
    >
      {/* Tab Switcher & Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#070b13] border border-slate-800/90">
          <button
            type="button"
            onClick={() => {
              setActiveTab('plants');
              setExpandedSpeciesId(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'plants'
                ? 'bg-emerald-950/90 border border-emerald-500/60 text-emerald-200 shadow-sm shadow-emerald-950'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
            }`}
          >
            <Sprout className="w-3.5 h-3.5 text-emerald-400" />
            <span>Flora & Plants</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] ${
                activeTab === 'plants'
                  ? 'bg-emerald-900/80 text-emerald-200'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {isStrictTileOnly && activeTile ? tileNativeFlora.length : ecosystem.speciesList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('fungi');
              setExpandedSpeciesId(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'fungi'
                ? 'bg-fuchsia-950/90 border border-fuchsia-500/60 text-fuchsia-200 shadow-sm shadow-fuchsia-950'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
            }`}
          >
            <Disc className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>Fungi & Mycota</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] ${
                activeTab === 'fungi'
                  ? 'bg-fuchsia-900/80 text-fuchsia-200'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {isStrictTileOnly && activeTile ? tileNativeFungi.length : (fungiEcosystem?.speciesList.length ?? 0)}
            </span>
          </button>
        </div>

        {/* Action Controls & Tile Filter */}
        <div className="flex items-center gap-2">
          {/* If in Tile View, lock strictly to the tile's biomes */}
          {isStrictTileOnly && activeTile ? (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-bold text-[11px] shadow-sm ${
                isFungiTab
                  ? 'bg-fuchsia-950/90 border-fuchsia-500/60 text-fuchsia-300'
                  : 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300'
              }`}
            >
              <Filter className={`w-3.5 h-3.5 ${isFungiTab ? 'text-fuchsia-400' : 'text-emerald-400'}`} />
              <span>
                Tile #{activeTile.tileId} Biomes ({currentTileNative.length} {currentTileNative.length === 1 ? 'Taxon' : 'Taxa'})
              </span>
            </div>
          ) : (
            /* Filter Toggles on Global Map/Globe Views */
            <div className="flex items-center rounded-lg border border-slate-800 bg-[#070b12] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded transition cursor-pointer ${
                  filterMode === 'all'
                    ? isFungiTab
                      ? 'bg-fuchsia-900/70 text-fuchsia-200 font-bold border border-fuchsia-500/40 shadow-sm'
                      : 'bg-emerald-900/70 text-emerald-200 font-bold border border-emerald-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Taxa ({currentSpeciesList.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('tile')}
                disabled={!activeTile}
                className={`px-2.5 py-1 rounded transition flex items-center gap-1.5 cursor-pointer ${
                  filterMode === 'tile'
                    ? isFungiTab
                      ? 'bg-fuchsia-900/70 text-fuchsia-200 font-bold border border-fuchsia-500/40 shadow-sm'
                      : 'bg-emerald-900/70 text-emerald-200 font-bold border border-emerald-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
                title={activeTile ? `Filter species native to ${activeTile.biomeName}` : 'Select a tile to filter'}
              >
                <Filter className="w-3 h-3" />
                Active Tile ({currentTileNative.length})
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition border border-slate-800 cursor-pointer"
            title="Close Ecosystem Catalog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Subheader info title */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div>
          <div className="flex items-center gap-2">
            <span className={`font-bold tracking-wide ${isFungiTab ? 'text-fuchsia-300' : 'text-emerald-300'}`}>
              {isStrictTileOnly && activeTile
                ? `TILE #${activeTile.tileId} INDIGENOUS ${isFungiTab ? 'FUNGI & MYCOTA' : 'FLORA & PLANTS'}`
                : isFungiTab
                ? 'INDIGENOUS XENOFUNGI & HETEROTROPHIC MYCOTA'
                : 'INDIGENOUS XENOFLORA & AUTOTROPHIC ECOSYSTEM'}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                isFungiTab
                  ? 'bg-fuchsia-950 border-fuchsia-500/60 text-fuchsia-300'
                  : 'bg-emerald-950 border-emerald-500/60 text-emerald-300'
              }`}
            >
              {isStrictTileOnly && activeTile
                ? `${currentTileNative.length} Native ${currentTileNative.length === 1 ? 'Species' : 'Species'}`
                : isFungiTab
                ? fungiEcosystem?.diversityTier ?? 'Microbial'
                : ecosystem.diversityTier}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">
            {isStrictTileOnly && activeTile
              ? `Showing exclusively indigenous ${isFungiTab ? 'fungi' : 'plants'} present in ${activeTile.biomeName}${activeTile.secondaryBiomeName ? ` & ${activeTile.secondaryBiomeName}` : ''}`
              : isFungiTab
              ? 'Saprotrophic decomposition, radiotrophic melanin, and symbiotic mycorrhizal networks'
              : 'Astrophysical photobiology, gravity-scaled morphology, and native biome distribution'}
          </span>
        </div>
      </div>

      {/* Global Quick Stats */}
      {isFungiTab ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#080d17] p-2.5 rounded-lg border border-slate-800/80 text-[11px]">
          <div>
            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Dominant Pigment / Melanin</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="w-3 h-3 rounded-full border border-white/30 flex-shrink-0"
                style={{ backgroundColor: fungiEcosystem?.speciesList[0]?.pigmentColorHex ?? '#1e1b2e' }}
              />
              <span className="font-semibold text-slate-200 truncate" title={fungiEcosystem?.speciesList[0]?.pigmentName ?? 'Melanin'}>
                {fungiEcosystem?.speciesList[0]?.pigmentName?.split('(')[0].trim() ?? 'Melanin Complexes'}
              </span>
            </div>
          </div>

          <div>
            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Trophic Strategy</span>
            <b className="text-fuchsia-300 block truncate mt-0.5" title={fungiEcosystem?.dominantTrophicType}>
              {fungiEcosystem?.dominantTrophicType ?? 'Saprotrophic Decomposer'}
            </b>
          </div>

          <div>
            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Mycota Morphology</span>
            <b className="text-sky-300 block mt-0.5">
              {fungiEcosystem?.isMulticellular ? 'Macro-Sporocarps & Hyphae' : 'Micro-Molds & Yeasts'}
            </b>
          </div>

          <div>
            <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Structural Polymer</span>
            <b className="text-amber-200 block truncate mt-0.5" title={fungiEcosystem?.dominantPolymer}>
              {fungiEcosystem?.dominantPolymer ?? 'Chitin-Glucan Matrix'}
            </b>
          </div>
        </div>
      ) : (
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
      )}

      {/* Active Tile Context Notice */}
      {activeTile && (
        <div className="px-3 py-1.5 rounded bg-slate-900/60 border border-slate-800 text-[11px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Inspected Tile #{activeTile.tileId}:</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-700 bg-slate-800/70 text-cyan-300">
              {activeTile.biomeName}
            </span>
            {activeTile.secondaryBiomeName && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-slate-700 bg-slate-800/70 text-amber-300">
                / {activeTile.secondaryBiomeName}
              </span>
            )}
            <span className="text-slate-500">
              ({activeTile.elevationMeters > 0 ? `+${activeTile.elevationMeters}m` : `${activeTile.elevationMeters}m`}, {activeTile.isOcean ? 'Hydrosphere' : 'Dry Land'})
            </span>
          </div>
          <span className={`font-semibold ${isFungiTab ? 'text-fuchsia-400' : 'text-emerald-400'}`}>
            {isStrictTileOnly
              ? `${currentTileNative.length} native ${isFungiTab ? 'fungi' : 'plants'} in tile`
              : `${currentTileNative.length} native ${isFungiTab ? 'fungi' : 'plants'} present`}
          </span>
        </div>
      )}

      {/* Species Catalog Table */}
      {displayList.length === 0 ? (
        <div className="p-6 text-center text-slate-400 bg-[#090e18] rounded-lg border border-slate-800">
          <p className="font-semibold text-slate-300 mb-1">
            No Indigenous {isFungiTab ? 'Fungi & Mycota' : 'Plant Life'} in Tile #{activeTile?.tileId} ({activeTile?.biomeName})
          </p>
          <p className="text-[11px] text-slate-500 max-w-md mx-auto mb-3">
            The active tile&apos;s biome ({activeTile?.biomeName}{activeTile?.secondaryBiomeName ? ` / ${activeTile.secondaryBiomeName}` : ''}) is an extreme habitat without viable indigenous {isFungiTab ? 'fungal decomposers' : 'autotrophs'}.
          </p>
          {!isStrictTileOnly && (
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 border rounded font-bold transition cursor-pointer ${
                isFungiTab
                  ? 'bg-fuchsia-950/80 border-fuchsia-500/60 text-fuchsia-300 hover:bg-fuchsia-900'
                  : 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900'
              }`}
            >
              Show All Planetary {isFungiTab ? 'Fungi' : 'Plants'}
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#080d17]">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#05080f] text-slate-400 border-b border-slate-800 uppercase text-[9px] tracking-wider font-semibold">
                <th className="py-2.5 px-3">Taxon & Growth Form</th>
                <th className="py-2.5 px-3">{isFungiTab ? 'Pigment & Melanin' : 'Pigment & Color'}</th>
                <th className="py-2.5 px-3">Dimensions & Stipe</th>
                <th className="py-2.5 px-3">Dispersal & Spores</th>
                <th className="py-2.5 px-3">Native Biomes</th>
                <th className="py-2.5 px-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {displayList.map(species => {
                const isNativeToActive = Boolean(
                  activeTile && (
                    species.nativeBiomeIds.includes(activeTile.biomeId) ||
                    (activeTile.secondaryBiomeId ? species.nativeBiomeIds.includes(activeTile.secondaryBiomeId) : false)
                  )
                );
                const isExpanded = expandedSpeciesId === species.id;

                return (
                  <React.Fragment key={species.id}>
                    <tr
                      onClick={() => toggleExpand(species.id)}
                      className={`cursor-pointer transition-colors ${
                        isNativeToActive
                          ? isFungiTab
                            ? 'bg-fuchsia-950/20 hover:bg-fuchsia-950/35 border-l-2 border-l-fuchsia-400'
                            : 'bg-emerald-950/20 hover:bg-emerald-950/35 border-l-2 border-l-emerald-400'
                          : 'hover:bg-slate-900/50'
                      }`}
                    >
                      {/* Name & Form with Specimen Thumbnail */}
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2.5">
                          <BotanicalSpecimenPlate
                            species={species}
                            size="thumb"
                            interactive={true}
                          />
                          <div>
                            <div className="flex items-center gap-1.5 font-bold text-white">
                              <span>{species.commonName}</span>
                              {isNativeToActive && (
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${isFungiTab ? 'bg-fuchsia-400 shadow-fuchsia-400' : 'bg-emerald-400 shadow-emerald-400'} shadow-sm`}
                                  title="Native to currently selected tile"
                                />
                              )}
                            </div>
                            <div className={`text-[10px] italic font-serif ${isFungiTab ? 'text-fuchsia-400/90' : 'text-emerald-400/90'}`}>
                              {species.scientificName}
                            </div>
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] bg-slate-800 text-slate-300 border border-slate-700">
                              {species.growthForm}
                            </span>
                          </div>
                        </div>
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
                            const isMatch = Boolean(
                              activeTile && (
                                bId === activeTile.biomeId ||
                                (activeTile.secondaryBiomeId && bId === activeTile.secondaryBiomeId)
                              )
                            );
                            return (
                              <span
                                key={bName}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                                  isMatch
                                    ? isFungiTab
                                      ? 'bg-fuchsia-900 border-fuchsia-400 text-fuchsia-200 font-bold'
                                      : 'bg-emerald-900 border-emerald-400 text-emerald-200 font-bold'
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
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                        >
                          {isExpanded ? (
                            <ChevronUp className={`w-4 h-4 ${isFungiTab ? 'text-fuchsia-400' : 'text-emerald-400'}`} />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Detail Drawer with Full Specimen Plate */}
                    {isExpanded && (
                      <tr className="bg-[#050912] border-b border-slate-800/80">
                        <td colSpan={6} className="p-4 pl-6">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                            {/* Specimen Plate Card */}
                            <div className="w-full max-w-[230px]">
                              <span className="text-slate-500 block text-[9px] uppercase tracking-wider mb-1 font-bold">
                                {isFungiTab ? 'MYCOLOGICAL SPECIMEN PLATE' : 'BOTANICAL SPECIMEN PLATE'}
                              </span>
                              <BotanicalSpecimenPlate
                                species={species}
                                size="card"
                                interactive={true}
                              />
                            </div>

                            {/* Field Notes & Physiological Adaptations */}
                            <div className="md:col-span-2 space-y-2.5">
                              <div>
                                <span className="text-slate-500 block text-[9px] uppercase tracking-wider mb-0.5 font-bold">
                                  FIELD NOTE & ECOLOGICAL NICHE
                                </span>
                                <p className="text-slate-300 text-xs leading-relaxed">
                                  {species.description}
                                </p>
                              </div>

                              <div>
                                <span className="text-slate-500 block text-[9px] uppercase tracking-wider mb-1 font-bold">
                                  KEY PHYSIOLOGICAL ADAPTATIONS
                                </span>
                                <ul className="space-y-1">
                                  {species.adaptations.map((adapt, aIdx) => (
                                    <li key={aIdx} className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                                      <CheckCircle2
                                        className={`w-3 h-3 flex-shrink-0 ${
                                          isFungiTab ? 'text-fuchsia-400' : 'text-emerald-400'
                                        }`}
                                      />
                                      <span>{adapt}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>

                            {/* Taxon Properties Card */}
                            <div className="bg-[#0a0f1b] p-3 rounded-lg border border-slate-800 space-y-2.5 text-[10px]">
                              <div>
                                <span className="text-slate-500 block uppercase text-[9px]">
                                  {isFungiTab ? 'Mycelial Abundance' : 'Canopy Abundance'}
                                </span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        isFungiTab ? 'bg-fuchsia-400' : 'bg-emerald-400'
                                      }`}
                                      style={{ width: `${species.canopyCoveragePct}%` }}
                                    />
                                  </div>
                                  <span className="font-bold text-white flex-shrink-0">{species.canopyCoveragePct}%</span>
                                </div>
                              </div>

                              <div>
                                <span className="text-slate-500 block uppercase text-[9px]">Structural Material</span>
                                <b className="text-slate-200 block truncate">{species.structuralPolymer}</b>
                              </div>

                              <div>
                                <span className="text-slate-500 block uppercase text-[9px]">
                                  {isFungiTab ? 'Trophic Strategy' : 'Light Absorption'}
                                </span>
                                <b className="text-slate-200 block truncate">{species.trophicType}</b>
                              </div>

                              <div>
                                <span className="text-slate-500 block uppercase text-[9px]">Reproduction</span>
                                <span className="text-slate-300 text-[9px] block leading-tight">{species.reproductionMethod}</span>
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
