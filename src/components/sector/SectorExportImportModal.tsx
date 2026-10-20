import React, { useState, useMemo } from 'react';
import {
  Download,
  Upload,
  Copy,
  Check,
  Play,
  X,
  FileCode,
  Hexagon,
} from 'lucide-react';
import { SectorHexGridData } from '../../core/generation/sectorHex';
import { SectorEmpire } from '../../core/generation/empireGen';
import {
  SectorExportFormatType,
  ParsedSectorImportResult,
  exportSectorAsZookJson,
  exportSectorAsStellarisStaticGalaxy,
  exportSectorAsSpaceEngineSc,
  parseImportedSectorData,
} from '../../core/export/sectorFormatExporters';

interface SectorExportImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  gridData: SectorHexGridData;
  empires: SectorEmpire[];
  activeEmpireId: string | null;
  onImportSector: (imported: ParsedSectorImportResult) => void;
}

export const SectorExportImportModal: React.FC<SectorExportImportModalProps> = ({
  isOpen,
  onClose,
  gridData,
  empires,
  activeEmpireId,
  onImportSector,
}) => {
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [exportFormat, setExportFormat] = useState<SectorExportFormatType>('stellaris-static-galaxy');
  const [includeStellarisInitializers, setIncludeStellarisInitializers] = useState<boolean>(false);
  const [importText, setImportText] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const exportPayload = useMemo(() => {
    if (!isOpen) {
      return { content: '', filename: 'sector.json', mimeType: 'application/json' };
    }
    const cfg = gridData.config;
    const rawName = cfg.name || (cfg.coord ? `sector-${cfg.coord}` : `sector-${cfg.seed}`);
    const safeSlug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `sector-${cfg.seed}`;

    if (exportFormat === 'stellaris-static-galaxy') {
      return {
        content: exportSectorAsStellarisStaticGalaxy(gridData, empires, includeStellarisInitializers),
        filename: `${safeSlug}_static_galaxy.txt`,
        mimeType: 'text/plain',
      };
    }

    if (exportFormat === 'spaceengine-sector') {
      return {
        content: exportSectorAsSpaceEngineSc(gridData),
        filename: `${safeSlug}_sector.sc`,
        mimeType: 'text/plain',
      };
    }

    return {
      content: exportSectorAsZookJson(gridData, empires, activeEmpireId),
      filename: `${safeSlug}_sector.json`,
      mimeType: 'application/json',
    };
  }, [isOpen, gridData, empires, activeEmpireId, exportFormat, includeStellarisInitializers]);

  if (!isOpen) return null;

  const handleCopyExport = () => {
    if (!exportPayload.content) return;
    navigator.clipboard.writeText(exportPayload.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadExport = () => {
    if (!exportPayload.content) return;
    const blob = new Blob([exportPayload.content], { type: exportPayload.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportPayload.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setImportText(text);
        setImportError(null);
      } catch (err) {
        setImportError(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyImport = () => {
    try {
      const result = parseImportedSectorData(importText);
      setImportError(null);
      setImportSuccess(true);
      setTimeout(() => {
        onImportSector(result);
        setImportSuccess(false);
        onClose();
      }, 350);
    } catch (err) {
      setImportError(`Sector import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0e131d] border border-[#2a3852] rounded-2xl max-w-4xl w-full p-5 flex flex-col gap-3.5 shadow-2xl text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex flex-wrap justify-between items-center gap-2 pb-3 border-b border-[#2a3852]">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold uppercase text-cyan-400 font-mono flex items-center gap-1.5">
              <Hexagon className="w-4 h-4 text-cyan-400" />
              Sector Export / Import Manager
            </span>
            <div className="flex items-center bg-[#151d2c] p-0.5 rounded-lg border border-[#2a3852] text-xs font-mono">
              <button
                type="button"
                onClick={() => {
                  setTab('export');
                  setImportError(null);
                }}
                className={`px-3 py-1 rounded-md flex items-center gap-1.5 cursor-pointer transition ${
                  tab === 'export'
                    ? 'bg-cyan-600 text-white font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                Export Sector
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('import');
                  setImportError(null);
                }}
                className={`px-3 py-1 rounded-md flex items-center gap-1.5 cursor-pointer transition ${
                  tab === 'import'
                    ? 'bg-cyan-600 text-white font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Import Sector (.json / Stellaris .txt)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {tab === 'export' ? (
              <>
                <button
                  type="button"
                  onClick={handleCopyExport}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-[#151d2c] hover:bg-[#1e293b] border border-[#2a3852] text-emerald-300 flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy{' '}
                      {exportFormat === 'stargen-sector'
                        ? 'JSON'
                        : exportFormat === 'stellaris-static-galaxy'
                        ? 'Static Galaxy'
                        : '.SC'}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadExport}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-[#151d2c] hover:bg-[#1e293b] border border-[#2a3852] text-sky-300 flex items-center gap-1.5 cursor-pointer"
                  title={`Download ${exportPayload.filename}`}
                >
                  <Download className="w-3.5 h-3.5" />
                  Save File ({exportPayload.filename})
                </button>
              </>
            ) : (
              <>
                <label className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-[#151d2c] hover:bg-[#1e293b] border border-[#2a3852] text-sky-300 flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Upload (.json or .txt)
                  <input
                    type="file"
                    accept=".json,.txt,application/json,text/plain"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleApplyImport}
                  disabled={!importText.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center gap-1.5 cursor-pointer shadow"
                >
                  {importSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Sector Loaded!
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      Load Sector
                    </>
                  )}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-200 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Close
            </button>
          </div>
        </div>

        {/* Format & Options Bar */}
        {tab === 'export' ? (
          <div className="flex flex-col gap-2 bg-[#131b2a] p-3 rounded-xl border border-[#24324b] font-mono text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Export Format:
                </span>
                <div className="inline-flex rounded-lg bg-[#0b101a] p-0.5 border border-[#2a3852]">
                  {(
                    [
                      {
                        id: 'stellaris-static-galaxy',
                        label: 'Stellaris Static Galaxy (.txt)',
                        badge: 'static_galaxy_scenario',
                      },
                      {
                        id: 'stargen-sector',
                        label: 'Stargen Sector (.json)',
                        badge: 'Full Sector JSON',
                      },
                      {
                        id: 'spaceengine-sector',
                        label: 'SpaceEngine Sector (.sc)',
                        badge: 'All Systems .sc',
                      },
                    ] as { id: SectorExportFormatType; label: string; badge: string }[]
                  ).map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setExportFormat(fmt.id)}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                        exportFormat === fmt.id
                          ? 'bg-cyan-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>

              {exportFormat === 'stellaris-static-galaxy' && (
                <label className="flex items-center gap-2 text-[11px] text-cyan-300 cursor-pointer select-none bg-[#0b101a] px-2.5 py-1 rounded-lg border border-cyan-800/60">
                  <input
                    type="checkbox"
                    checked={includeStellarisInitializers}
                    onChange={(e) => setIncludeStellarisInitializers(e.target.checked)}
                    className="accent-cyan-500 rounded cursor-pointer"
                  />
                  <span>Append System Initializers (`solar_system_initializer`)</span>
                </label>
              )}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              {exportFormat === 'stellaris-static-galaxy' ? (
                <>
                  Exports <strong className="text-white">{gridData.config.name || 'this sector'}</strong> (
                  {gridData.systems.length} star systems, {gridData.hyperlanes.filter((l) => !l.isEdgeLane).length}{' '}
                  hyperlanes) in Stellaris{' '}
                  <code className="text-cyan-300">static_galaxy_scenario = &#123; ... &#125;</code> format (
                  <code className="text-slate-300">map/setup_scenarios/*.txt</code>). All unused Zook Astro / Stargen
                  astrophysical data is commented out with <code className="text-amber-300"># ...</code> and preserved
                  for lossless round-trip re-importing.
                </>
              ) : exportFormat === 'stargen-sector' ? (
                <>
                  Exports the complete sector state ({gridData.systems.length} star systems, full planetary hierarchies,
                  hyperlanes, nebulae, and {empires.length} empires) as a native Zook Astro / Stargen{' '}
                  <code className="text-cyan-300">.json</code> bundle.
                </>
              ) : (
                <>
                  Exports all {gridData.systems.length} star systems and their planetary bodies in SpaceEngine{' '}
                  <code className="text-cyan-300">.sc</code> catalog syntax, with unused sector &amp; Stargen telemetry
                  commented out (<code className="text-amber-300">// ...</code>).
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 bg-[#131b2a] p-3 rounded-xl border border-[#24324b] font-mono text-xs">
            <div className="flex items-center gap-2 text-cyan-300 font-bold text-[11px]">
              <FileCode className="w-3.5 h-3.5" />
              <span>Supports Both Stargen Sector (.json) &amp; Stellaris Static Galaxy (.txt)</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Upload or paste either a <strong className="text-slate-200">Zook / Stargen Sector JSON</strong> file or
              any <strong className="text-cyan-300">Stellaris Static Galaxy Scenario</strong> (
              <code className="text-slate-300">static_galaxy_scenario = &#123; system = &#123; ... &#125; add_hyperlane = &#123; ... &#125; &#125;</code>
              ). External Stellaris static galaxies automatically map their star coordinates and hyperlanes onto the
              sector hex grid and synthesize full realistic planetary systems for every star.
            </p>
          </div>
        )}

        {importError && (
          <div className="p-2.5 rounded-lg bg-rose-950/70 border border-rose-700 text-rose-200 text-xs font-mono">
            {importError}
          </div>
        )}

        {tab === 'export' ? (
          <textarea
            readOnly
            value={exportPayload.content}
            rows={18}
            className="w-full p-3 rounded-lg bg-[#080c14] border border-[#2a3852] text-[11px] font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        ) : (
          <textarea
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportError(null);
            }}
            placeholder={`Paste a Stargen Sector JSON (.json) OR a Stellaris Static Galaxy scenario (.txt) here...\n\nExample Stellaris Static Galaxy:\nstatic_galaxy_scenario = {\n\tname = "Orion Spur"\n\tsystem = {\n\t\tid = "0"\n\t\tname = "Sol"\n\t\tposition = { x = 0 y = 0 }\n\t}\n\tsystem = {\n\t\tid = "1"\n\t\tname = "Alpha Centauri"\n\t\tposition = { x = -24.5 y = 18.2 }\n\t}\n\tadd_hyperlane = { from = "0" to = "1" }\n}`}
            rows={18}
            className="w-full p-3 rounded-lg bg-[#080c14] border border-[#2a3852] text-[11px] font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        )}
      </div>
    </div>
  );
};
