import React, { useState } from 'react';
import { Download, Upload, Copy, Check, Play, X } from 'lucide-react';
import { RealisticStarSystemResult } from '../types';

interface SystemJsonManagerModalProps {
  systemResult: RealisticStarSystemResult | null;
  onImportSystem: (system: RealisticStarSystemResult) => void;
  onClose: () => void;
}

export const SystemJsonManagerModal: React.FC<SystemJsonManagerModalProps> = ({
  systemResult,
  onImportSystem,
  onClose,
}) => {
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopyJson = () => {
    if (!systemResult) return;
    navigator.clipboard.writeText(JSON.stringify(systemResult, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    if (!systemResult) return;
    const jsonStr = JSON.stringify(systemResult, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const sysName = systemResult.hierarchy.stars.map((s) => s.label).join('-') || 'system';
    link.href = url;
    link.download = `realistic-system-${sysName}.json`;
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
        setImportJsonText(text);
        setImportError(null);
      } catch (err) {
        setImportError(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
  };

  const handleApplyImport = () => {
    try {
      const parsed = JSON.parse(importJsonText);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('JSON is not an object');
      }
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
      <div className="bg-[#0e131d] border border-[#2a3852] rounded-xl max-w-3xl w-full p-4 flex flex-col gap-3 shadow-2xl">
        <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-[#2a3852]">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold uppercase text-sky-400 font-mono">
              System JSON Manager
            </span>
            <div className="flex items-center bg-[#151d2c] p-0.5 rounded border border-[#2a3852] text-xs font-mono">
              <button
                type="button"
                onClick={() => {
                  setTab('export');
                  setImportError(null);
                }}
                className={`px-3 py-1 rounded flex items-center gap-1.5 cursor-pointer transition ${
                  tab === 'export' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('import');
                  setImportError(null);
                }}
                className={`px-3 py-1 rounded flex items-center gap-1.5 cursor-pointer transition ${
                  tab === 'import' ? 'bg-sky-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Import
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {tab === 'export' ? (
              <>
                <button
                  type="button"
                  onClick={handleCopyJson}
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
                      Copy JSON
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-[#151d2c] hover:bg-[#1e293b] border border-[#2a3852] text-sky-300 flex items-center gap-1.5 cursor-pointer"
                  title="Download JSON File"
                >
                  <Download className="w-3.5 h-3.5" />
                  Save File
                </button>
              </>
            ) : (
              <>
                <label className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-[#151d2c] hover:bg-[#1e293b] border border-[#2a3852] text-sky-300 flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Upload File
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleApplyImport}
                  disabled={!importJsonText.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center gap-1.5 cursor-pointer shadow"
                >
                  {importSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Loaded!
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      Load System
                    </>
                  )}
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

        {importError && (
          <div className="bg-rose-950/90 border border-rose-700 text-rose-200 px-3 py-2 rounded-lg text-xs font-mono">
            ⚠️ {importError}
          </div>
        )}

        {tab === 'export' ? (
          <textarea
            readOnly
            value={systemResult ? JSON.stringify(systemResult, null, 2) : ''}
            className="w-full h-[55vh] bg-[#07090e] text-emerald-400 border border-[#2a3852] rounded-lg p-3 font-mono text-xs focus:outline-none"
          />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-slate-400 font-mono">
              Paste system JSON below or click <span className="text-sky-300 font-bold">Upload File</span> to load a previously generated or customized system:
            </p>
            <textarea
              value={importJsonText}
              onChange={(e) => {
                setImportJsonText(e.target.value);
                setImportError(null);
              }}
              placeholder="Paste system JSON here (must include hierarchy and zones)..."
              className="w-full h-[52vh] bg-[#07090e] text-sky-300 border border-[#2a3852] focus:border-sky-500 rounded-lg p-3 font-mono text-xs focus:outline-none"
            />
          </div>
        )}
      </div>
    </div>
  );
};
