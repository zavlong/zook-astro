import React, { useState, useMemo } from 'react';
import { Download, Upload, Copy, Check, Play, X, FileCode } from 'lucide-react';
import { RealisticStarSystemResult, RealisticPlanetBody } from '../types';
import {
  ExportFormatType,
  exportSystemAsSpaceEngineSc,
  exportSystemAsStellarisInitializer,
  exportSingleEntityInFormat,
} from '../../../core/export/systemFormatExporters';
import {
  DEFAULT_STELLARIS_IMPORT_CONFIG,
  StellarisImportConversionConfig,
  parseStellarisInitializerScript,
  convertStellarisInitializerToRealisticSystem,
} from '../../../core/export/stellarisScriptImporter';
import {
  ConversionPresetKey,
  SAMPLE_SOL_INITIALIZER,
  StellarisImportControls,
  StellarisLivePreviewData,
} from './StellarisImportControls';

type ImportFormatType = 'stargen' | 'stellaris';

interface SystemJsonManagerModalProps {
  systemResult: RealisticStarSystemResult | null;
  onImportSystem: (system: RealisticStarSystemResult) => void;
  onClose: () => void;
  initialTargetKey?: string;
}

export const SystemJsonManagerModal: React.FC<SystemJsonManagerModalProps> = ({
  systemResult,
  onImportSystem,
  onClose,
  initialTargetKey = 'system',
}) => {
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [exportFormat, setExportFormat] = useState<ExportFormatType>('stargen');
  const [importFormat, setImportFormat] = useState<ImportFormatType>('stargen');
  const [targetKey, setTargetKey] = useState<string>(initialTargetKey);
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Stellaris Import Configuration & Multi-Initializer Selection State
  const [stellarisConfig, setStellarisConfig] = useState<StellarisImportConversionConfig>(
    DEFAULT_STELLARIS_IMPORT_CONFIG
  );
  const [selectedInitializerIndex, setSelectedInitializerIndex] = useState<number>(0);
  const [conversionPreset, setConversionPreset] = useState<ConversionPresetKey>('zook_native');

  const handlePresetChange = (preset: ConversionPresetKey) => {
    setConversionPreset(preset);
    if (preset === 'zook_native') {
      setStellarisConfig((prev) => ({
        ...prev,
        distanceMode: 'power_law',
        powerLawScale: 50,
        powerLawExponent: 0.667,
        powerLawOffset: 0,
      }));
    } else if (preset === 'linear_30') {
      setStellarisConfig((prev) => ({ ...prev, distanceMode: 'linear', stellarisUnitsPerAU: 30 }));
    } else if (preset === 'linear_20') {
      setStellarisConfig((prev) => ({ ...prev, distanceMode: 'linear', stellarisUnitsPerAU: 20 }));
    } else if (preset === 'linear_50') {
      setStellarisConfig((prev) => ({ ...prev, distanceMode: 'linear', stellarisUnitsPerAU: 50 }));
    }
  };

  // Build selectable targets for export
  const targetOptions = useMemo(() => {
    const opts: Array<{ key: string; label: string }> = [{ key: 'system', label: '🌐 Entire Star System' }];
    if (!systemResult) return opts;
    const sysName = systemResult.step1?.name || systemResult.step1?.id || `Kepler-${systemResult.roll}`;
    systemResult.zones.forEach((zone, zIdx) => {
      let pCount = 0;
      zone.bodies.forEach((body, bIdx) => {
        if (body.kind !== 'planet') return;
        const p = body as RealisticPlanetBody;
        const letter = String.fromCharCode(98 + pCount);
        pCount++;
        opts.push({ key: `${zIdx}_${bIdx}`, label: `🪐 ${sysName} ${letter} — ${p.planetClass} (${p.a} AU)` });
        (p.moons || []).forEach((m, mIdx) => {
          opts.push({
            key: `${zIdx}_${bIdx}_${mIdx}`,
            label: `   ↳ 🌙 ${sysName} ${letter}-${mIdx + 1} (${m.name}) — ${m.moonClass}`,
          });
        });
      });
    });
    return opts;
  }, [systemResult]);

  // Compute export payload
  const exportPayload = useMemo(() => {
    if (!systemResult) return { content: '', filename: 'system.json', mimeType: 'application/json' };
    const sysName =
      systemResult.step1?.name ||
      systemResult.step1?.id ||
      systemResult.hierarchy.stars.map((s) => s.label).join('-') ||
      'system';
    const safeSysSlug = sysName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (targetKey !== 'system') {
      const parts = targetKey.split('_').map((n) => parseInt(n, 10));
      return exportSingleEntityInFormat(
        systemResult,
        parts[0] || 0,
        parts[1] || 0,
        parts.length >= 3 && !isNaN(parts[2]) ? parts[2] : null,
        exportFormat
      );
    }
    if (exportFormat === 'spaceengine') {
      return { content: exportSystemAsSpaceEngineSc(systemResult), filename: `${safeSysSlug}.sc`, mimeType: 'text/plain' };
    }
    if (exportFormat === 'stellaris') {
      return { content: exportSystemAsStellarisInitializer(systemResult), filename: `${safeSysSlug}_initializer.txt`, mimeType: 'text/plain' };
    }
    return { content: JSON.stringify(systemResult, null, 2), filename: `realistic-system-${safeSysSlug}.json`, mimeType: 'application/json' };
  }, [systemResult, exportFormat, targetKey]);

  // Live parsed preview for Stellaris script import
  const stellarisLivePreview = useMemo<StellarisLivePreviewData | { error: string } | null>(() => {
    if (importFormat !== 'stellaris' || !importJsonText.trim()) return null;
    try {
      const parsedList = parseStellarisInitializerScript(importJsonText);
      if (!parsedList || parsedList.length === 0) {
        return { error: 'No solar system initializer blocks detected in script.' };
      }
      const safeIdx = Math.min(Math.max(0, selectedInitializerIndex), parsedList.length - 1);
      const system = convertStellarisInitializerToRealisticSystem(parsedList[safeIdx], stellarisConfig);
      const planets = (system.zones[0]?.bodies || []).filter((b): b is RealisticPlanetBody => b.kind === 'planet');
      const totalMoons = planets.reduce((acc, p) => acc + (p.moons?.length || 0), 0);
      return {
        parsedList,
        selectedIdx: safeIdx,
        system,
        starCount: system.hierarchy.stars.length,
        starsSummary: system.hierarchy.stars.map((s) => `${s.label} (${s.spectralType})`).join(', '),
        planetCount: planets.length,
        moonCount: totalMoons,
        planets,
      };
    } catch (err) {
      return { error: `Parse error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }, [importFormat, importJsonText, selectedInitializerIndex, stellarisConfig]);

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

  const handleTextChange = (text: string) => {
    setImportJsonText(text);
    setImportError(null);
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && (trimmed.includes('planet =') || trimmed.includes('class =') || trimmed.includes('_initializer'))) {
      setImportFormat('stellaris');
    } else if (trimmed.startsWith('{')) {
      setImportFormat('stargen');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = (event.target?.result as string) || '';
        setImportJsonText(text);
        setImportError(null);
        const isTxt = file.name.toLowerCase().endsWith('.txt');
        const isJson = file.name.toLowerCase().endsWith('.json');
        const trimmed = text.trim();
        const looksLikeStellaris =
          !trimmed.startsWith('{') &&
          (trimmed.includes('planet =') || trimmed.includes('class =') || trimmed.includes('_initializer'));
        if (isTxt || looksLikeStellaris) {
          setImportFormat('stellaris');
        } else if (isJson || trimmed.startsWith('{')) {
          setImportFormat('stargen');
        }
      } catch (err) {
        setImportError(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
  };

  const handleApplyImport = () => {
    try {
      const trimmed = importJsonText.trim();
      if (!trimmed) throw new Error('No content to import');

      if (
        importFormat === 'stellaris' ||
        (!trimmed.startsWith('{') && (trimmed.includes('planet =') || trimmed.includes('class =') || trimmed.includes('_initializer')))
      ) {
        const parsedList = parseStellarisInitializerScript(trimmed);
        if (!parsedList || parsedList.length === 0) {
          throw new Error('No valid Stellaris solar system initializer blocks found in script.');
        }
        const safeIdx = Math.min(Math.max(0, selectedInitializerIndex), parsedList.length - 1);
        const system = convertStellarisInitializerToRealisticSystem(parsedList[safeIdx], stellarisConfig);
        setImportError(null);
        setImportSuccess(true);
        setTimeout(() => {
          onImportSystem(system);
          onClose();
        }, 500);
        return;
      }

      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object') throw new Error('JSON is not an object');
      if (!Array.isArray(parsed.zones) || !parsed.hierarchy || !Array.isArray(parsed.hierarchy.stars)) {
        throw new Error('Invalid system schema: missing zones or hierarchy');
      }
      setImportError(null);
      setImportSuccess(true);
      setTimeout(() => {
        onImportSystem(parsed as RealisticStarSystemResult);
        onClose();
      }, 500);
    } catch (err) {
      setImportError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0e131d] border border-[#2a3852] rounded-xl max-w-4xl max-h-[92vh] overflow-y-auto w-full p-4 flex flex-col gap-3 shadow-2xl">
        {/* Top Header */}
        <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-[#2a3852]">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold uppercase text-sky-400 font-mono flex items-center gap-1.5">
              <FileCode className="w-4 h-4" />
              System Export / Import Manager
            </span>
            <div className="flex items-center bg-[#151d2c] p-0.5 rounded border border-[#2a3852] text-xs font-mono">
              <button
                type="button"
                onClick={() => { setTab('export'); setImportError(null); }}
                className={`px-3 py-1 rounded flex items-center gap-1.5 cursor-pointer transition ${tab === 'export' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
              <button
                type="button"
                onClick={() => { setTab('import'); setImportError(null); }}
                className={`px-3 py-1 rounded flex items-center gap-1.5 cursor-pointer transition ${tab === 'import' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
              >
                <Upload className="w-3.5 h-3.5" />
                Import (.JSON / Stellaris .TXT)
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
                  {copied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy {exportFormat === 'stargen' ? 'JSON' : exportFormat === 'spaceengine' ? '.SC' : 'Script'}</>}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadExport}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-[#151d2c] hover:bg-[#1e293b] border border-[#2a3852] text-sky-300 flex items-center gap-1.5 cursor-pointer"
                  title={`Download ${exportPayload.filename}`}
                >
                  <Download className="w-3.5 h-3.5" />
                  Save File ({exportFormat === 'stargen' ? '.json' : exportFormat === 'spaceengine' ? '.sc' : '.txt'})
                </button>
              </>
            ) : (
              <>
                <label className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-[#151d2c] hover:bg-[#1e293b] border border-[#2a3852] text-sky-300 flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Upload File
                  <input type="file" accept=".json,.txt,application/json,text/plain" onChange={handleFileUpload} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={handleApplyImport}
                  disabled={!importJsonText.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center gap-1.5 cursor-pointer shadow"
                >
                  {importSuccess ? <><Check className="w-3.5 h-3.5" /> Loaded!</> : <><Play className="w-3.5 h-3.5" /> Load System</>}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 rounded-lg text-xs bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-200 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Close
            </button>
          </div>
        </div>

        {/* Tab 1: Export Sub-bar */}
        {tab === 'export' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 bg-[#111826] border border-[#233047] rounded-lg px-3 py-2 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 uppercase text-[11px] font-semibold">Format:</span>
                <div className="flex items-center bg-[#090d15] p-0.5 rounded-lg border border-[#2a3852]">
                  <button
                    type="button"
                    onClick={() => setExportFormat('stargen')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer transition ${exportFormat === 'stargen' ? 'bg-emerald-600 text-white font-bold shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    Stargen (.json)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('spaceengine')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer transition ${exportFormat === 'spaceengine' ? 'bg-indigo-600 text-white font-bold shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    SpaceEngine (.sc)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('stellaris')}
                    className={`px-2.5 py-1 rounded-md cursor-pointer transition ${exportFormat === 'stellaris' ? 'bg-amber-600 text-white font-bold shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    Stellaris (.txt)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400 uppercase text-[11px] font-semibold">Scope:</span>
                <select
                  value={targetKey}
                  onChange={(e) => setTargetKey(e.target.value)}
                  className="bg-[#090d15] border border-[#2a3852] text-sky-300 rounded-md px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-sky-500 max-w-xs"
                >
                  {targetOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {exportFormat !== 'stargen' && (
              <div className="text-[11px] text-slate-400 font-mono px-1">
                {exportFormat === 'spaceengine'
                  ? '💡 SpaceEngine (.sc) catalog format — all Stargen astrophysical telemetry & inactive blocks not used by SpaceEngine are preserved as // comments.'
                  : '💡 Stellaris initializer (.txt) format — all Stargen astrophysical telemetry not used by Stellaris is preserved as # comments.'}
              </div>
            )}
          </>
        )}

        {/* Tab 2: Import Format Switcher & Quick Sol Button */}
        {tab === 'import' && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#111826] border border-[#233047] rounded-lg px-3 py-2 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 uppercase text-[11px] font-semibold">Import Format:</span>
              <div className="flex items-center bg-[#090d15] p-0.5 rounded-lg border border-[#2a3852]">
                <button
                  type="button"
                  onClick={() => setImportFormat('stargen')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition ${importFormat === 'stargen' ? 'bg-emerald-600 text-white font-bold shadow' : 'text-slate-400 hover:text-white'}`}
                >
                  Stargen (.json)
                </button>
                <button
                  type="button"
                  onClick={() => setImportFormat('stellaris')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition ${importFormat === 'stellaris' ? 'bg-amber-600 text-white font-bold shadow' : 'text-slate-400 hover:text-white'}`}
                >
                  Stellaris Initializer (.txt)
                </button>
              </div>
            </div>

            {importFormat === 'stellaris' && (
              <button
                type="button"
                onClick={() => {
                  setImportJsonText(SAMPLE_SOL_INITIALIZER);
                  setImportError(null);
                }}
                className="px-2.5 py-1 rounded-md text-[11px] bg-amber-950/70 hover:bg-amber-900 border border-amber-700/80 text-amber-200 cursor-pointer flex items-center gap-1 font-mono transition"
                title="Load standard Sol solar system initializer script for 1-click preview and conversion test"
              >
                <span>☀️ Load Sample Sol Initializer</span>
              </button>
            )}
          </div>
        )}

        {/* Stellaris Import Conversion Controls & Live Preview */}
        {tab === 'import' && importFormat === 'stellaris' && (
          <StellarisImportControls
            config={stellarisConfig}
            onChangeConfig={setStellarisConfig}
            conversionPreset={conversionPreset}
            onChangePreset={handlePresetChange}
            selectedInitializerIndex={selectedInitializerIndex}
            onSelectInitializerIndex={setSelectedInitializerIndex}
            preview={stellarisLivePreview}
          />
        )}

        {importError && (
          <div className="bg-rose-950/90 border border-rose-700 text-rose-200 px-3 py-2 rounded-lg text-xs font-mono">
            ⚠️ {importError}
          </div>
        )}

        {/* Text Area */}
        {tab === 'export' ? (
          <textarea
            readOnly
            value={exportPayload.content}
            className={`w-full h-[54vh] bg-[#07090e] border border-[#2a3852] rounded-lg p-3 font-mono text-xs focus:outline-none ${
              exportFormat === 'stargen' ? 'text-emerald-400' : exportFormat === 'spaceengine' ? 'text-indigo-300' : 'text-amber-300'
            }`}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-slate-400 font-mono">
              {importFormat === 'stellaris'
                ? 'Paste Stellaris Solar System Initializer script (.txt) below, click Load Sample Sol Initializer, or Upload File:'
                : 'Paste system JSON below or click Upload File to load a previously generated or customized system:'}
            </p>
            <textarea
              value={importJsonText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={
                importFormat === 'stellaris'
                  ? 'Paste Stellaris initializer script (.txt) here, e.g. sol_system_initializer = { ... }'
                  : 'Paste system JSON here (must include hierarchy and zones)...'
              }
              className={`w-full ${
                importFormat === 'stellaris' ? 'h-[25vh]' : 'h-[50vh]'
              } bg-[#07090e] text-sky-300 border border-[#2a3852] focus:border-sky-500 rounded-lg p-3 font-mono text-xs focus:outline-none`}
            />
          </div>
        )}
      </div>
    </div>
  );
};
