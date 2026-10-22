import React, { useState } from 'react';
import { Maximize2, X, Download, Sprout, Disc } from 'lucide-react';
import { SpecimenSpecies, generateBotanicalSvg } from '../../../core/xenobiology/botanicalArtGen';

export interface BotanicalSpecimenPlateProps {
  species: SpecimenSpecies;
  size?: 'thumb' | 'card' | 'large';
  interactive?: boolean;
  className?: string;
}

export const BotanicalSpecimenPlate: React.FC<BotanicalSpecimenPlateProps> = ({
  species,
  size = 'card',
  interactive = true,
  className = '',
}) => {
  const [showLightbox, setShowLightbox] = useState<boolean>(false);

  // Derive pixel dimensions according to size tier
  const dimensions =
    size === 'thumb'
      ? { width: 48, height: 48, showLabels: false, showScaleBar: false, showGrid: false }
      : size === 'large'
      ? { width: 360, height: 360, showLabels: true, showScaleBar: true, showGrid: true }
      : { width: 220, height: 220, showLabels: true, showScaleBar: true, showGrid: true };

  const svgXml = generateBotanicalSvg(species, dimensions);

  const handleDownloadSvg = (e: React.MouseEvent) => {
    e.stopPropagation();
    const fullSvg = generateBotanicalSvg(species, {
      width: 600,
      height: 600,
      showLabels: true,
      showScaleBar: true,
      showGrid: true,
    });
    const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${species.scientificName.replace(/\s+/g, '_')}_specimen.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Thumbnail rendering (compact for lists and tables)
  if (size === 'thumb') {
    return (
      <>
        <div
          onClick={(e) => {
            if (interactive) {
              e.stopPropagation();
              setShowLightbox(true);
            }
          }}
          className={`relative group rounded-lg overflow-hidden border border-slate-800 hover:border-emerald-500/70 bg-[#060a12] transition-all cursor-pointer flex-shrink-0 shadow-sm ${className}`}
          style={{ width: dimensions.width, height: dimensions.height }}
          title={`Click to view botanical plate of ${species.commonName} (${species.scientificName})`}
        >
          <div
            className="w-full h-full flex items-center justify-center pointer-events-none"
            dangerouslySetInnerHTML={{ __html: svgXml }}
          />
          <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <Maximize2 className="w-3.5 h-3.5 text-emerald-300 drop-shadow" />
          </div>
        </div>

        {showLightbox && (
          <BotanicalLightboxModal
            species={species}
            onClose={() => setShowLightbox(false)}
            onDownload={handleDownloadSvg}
          />
        )}
      </>
    );
  }

  // Card / Large specimen plate
  return (
    <>
      <div
        className={`relative group rounded-xl overflow-hidden border border-slate-800 bg-[#080d17] p-2 flex flex-col gap-2 shadow-lg ${className}`}
      >
        <div className="relative rounded-lg overflow-hidden border border-slate-800/80 bg-[#050912] flex items-center justify-center">
          <div
            className="w-full h-full flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: svgXml }}
          />
          {interactive && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowLightbox(true);
              }}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-emerald-950 border border-white/10 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-300 transition opacity-0 group-hover:opacity-100 shadow"
              title="Enlarge Botanical Specimen Plate"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Caption Plaque */}
        <div className="flex items-center justify-between px-1 font-mono text-[10px]">
          <div>
            <span className="text-white font-bold block truncate max-w-[150px]">
              {species.commonName}
            </span>
            <span className="text-emerald-400/90 italic font-serif text-[9px] block">
              {species.scientificName}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className="w-2.5 h-2.5 rounded-full border border-white/30"
              style={{ backgroundColor: species.pigmentColorHex }}
              title={`Pigment: ${species.pigmentName}`}
            />
            <span className="text-slate-400 font-bold text-[9px]">
              {species.averageHeightM < 0.1
                ? `${(species.averageHeightM * 100).toFixed(0)}cm`
                : `${species.averageHeightM.toFixed(1)}m`}
            </span>
          </div>
        </div>
      </div>

      {showLightbox && (
        <BotanicalLightboxModal
          species={species}
          onClose={() => setShowLightbox(false)}
          onDownload={handleDownloadSvg}
        />
      )}
    </>
  );
};

// Modal for full-resolution specimen examination
interface BotanicalLightboxModalProps {
  species: SpecimenSpecies;
  onClose: () => void;
  onDownload: (e: React.MouseEvent) => void;
}

const BotanicalLightboxModal: React.FC<BotanicalLightboxModalProps> = ({
  species,
  onClose,
  onDownload,
}) => {
  const isFungi = 'kingdom' in species && species.kingdom === 'Fungi';
  const highResSvgXml = generateBotanicalSvg(species, {
    width: 440,
    height: 440,
    showLabels: true,
    showScaleBar: true,
    showGrid: true,
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={`relative max-w-2xl w-full bg-[#0c121e] border ${
          isFungi ? 'border-fuchsia-500/50 shadow-fuchsia-950/40' : 'border-emerald-500/50 shadow-emerald-950/40'
        } rounded-2xl p-5 shadow-2xl font-mono text-xs flex flex-col md:flex-row gap-5`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Specimen Picture Plate */}
        <div className="flex-shrink-0 flex items-center justify-center bg-[#050810] rounded-xl border border-slate-800 p-2 shadow-inner">
          <div
            className="w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: highResSvgXml }}
          />
        </div>

        {/* Specimen Taxonomic Dossier */}
        <div className="flex-1 flex flex-col justify-between gap-3 text-slate-300">
          <div className="space-y-3">
            <div>
              <div className={`flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider ${
                isFungi ? 'text-fuchsia-400' : 'text-emerald-400'
              }`}>
                {isFungi ? <Disc className="w-3.5 h-3.5" /> : <Sprout className="w-3.5 h-3.5" />}
                <span>{isFungi ? 'EXOBIOLOGICAL MYCOTA SPECIMEN' : 'EXOBIOLOGICAL FIELD SPECIMEN'}</span>
              </div>
              <h3 className="text-lg font-bold text-white tracking-wide mt-0.5">
                {species.commonName}
              </h3>
              <p className={`${isFungi ? 'text-fuchsia-300/90' : 'text-emerald-300/90'} italic font-serif text-xs`}>
                {species.scientificName}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] leading-relaxed text-slate-300">
              {species.description}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="bg-[#080d16] p-2 rounded border border-slate-800">
                <span className="text-slate-500 block uppercase text-[9px]">Growth Form</span>
                <span className="text-white font-bold">{species.growthForm}</span>
              </div>
              <div className="bg-[#080d16] p-2 rounded border border-slate-800">
                <span className="text-slate-500 block uppercase text-[9px]">Height × Spread</span>
                <span className="text-sky-300 font-bold">
                  {species.averageHeightM < 0.1
                    ? `${(species.averageHeightM * 100).toFixed(1)} cm`
                    : `${species.averageHeightM.toFixed(1)} m`}{' '}
                  × {species.averageSpreadM.toFixed(1)} m
                </span>
              </div>
              <div className="bg-[#080d16] p-2 rounded border border-slate-800">
                <span className="text-slate-500 block uppercase text-[9px]">
                  {isFungi ? 'Pigment / Melanin' : 'Photosynthetic Pigment'}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-white/30"
                    style={{ backgroundColor: species.pigmentColorHex }}
                  />
                  <span className="text-slate-200 truncate">{species.pigmentName}</span>
                </div>
              </div>
              <div className="bg-[#080d16] p-2 rounded border border-slate-800">
                <span className="text-slate-500 block uppercase text-[9px]">Structural Polymer</span>
                <span className="text-amber-200 font-bold truncate block">{species.structuralPolymer}</span>
              </div>
            </div>

            <div>
              <span className="text-slate-500 block uppercase text-[9px] mb-1">Native Biomes</span>
              <div className="flex flex-wrap gap-1">
                {species.nativeBiomeNames.map((name) => (
                  <span
                    key={name}
                    className={`px-2 py-0.5 rounded text-[9px] font-semibold border ${
                      isFungi
                        ? 'bg-fuchsia-950/70 border-fuchsia-500/40 text-fuchsia-300'
                        : 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                    }`}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-500">Vector SVG Specimen Plate</span>
            <button
              type="button"
              onClick={onDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/60 text-emerald-200 text-xs font-bold transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export SVG</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
