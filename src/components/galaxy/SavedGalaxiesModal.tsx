import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Save,
  FolderOpen,
  Download,
  Upload,
  Trash2,
  Check,
  Disc,
  Copy,
  Clock,
  Sparkles,
  Search,
} from 'lucide-react';
import { GalaxyConfig } from '../../core/generation/galaxyGen';
import { SavedGalaxy, universeCache } from '../../core/storage/universeCache';

interface SavedGalaxiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: GalaxyConfig;
  currentStats?: {
    activeSectors?: number;
    totalEstimatedStars?: number;
    avgDensity?: number;
    avgAge?: number;
    nebulaCount?: number;
  };
  onLoadGalaxy: (saved: SavedGalaxy) => void;
}

export const SavedGalaxiesModal: React.FC<SavedGalaxiesModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  currentStats,
  onLoadGalaxy,
}) => {
  const [savedList, setSavedList] = useState<SavedGalaxy[]>([]);
  const [draftName, setDraftName] = useState<string>(currentConfig.name || 'My Galaxy');
  const [draftNotes, setDraftNotes] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync saved list from universeCache on open
  useEffect(() => {
    if (isOpen) {
      setSavedList(universeCache.getSavedGalaxies());
      setDraftName(currentConfig.name || `Galaxy Seed #${currentConfig.seed}`);
      setDraftNotes('');
      setSaveSuccess(false);
    }
  }, [isOpen, currentConfig]);

  if (!isOpen) return null;

  // Save current galaxy
  const handleSaveCurrent = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = draftName.trim() || `Galaxy Seed #${currentConfig.seed}`;
    const newEntry: SavedGalaxy = {
      id: `gal_${currentConfig.seed}_${Date.now()}`,
      name: finalName,
      seed: currentConfig.seed,
      savedAt: Date.now(),
      config: { ...currentConfig, name: finalName },
      notes: draftNotes.trim() || undefined,
      stats: currentStats,
    };
    universeCache.saveGalaxy(newEntry);
    setSavedList(universeCache.getSavedGalaxies());
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2400);
  };

  // Delete saved galaxy
  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this saved galaxy from your catalog?')) {
      universeCache.deleteSavedGalaxy(id);
      setSavedList(universeCache.getSavedGalaxies());
    }
  };

  // Export JSON
  const handleExport = (saved: SavedGalaxy, e: React.MouseEvent) => {
    e.stopPropagation();
    universeCache.exportGalaxyJson(saved);
  };

  // Import JSON file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const parsed = universeCache.parseGalaxyJson(content);
        if (parsed) {
          universeCache.saveGalaxy(parsed);
          setSavedList(universeCache.getSavedGalaxies());
          onLoadGalaxy(parsed);
        } else {
          alert('Could not parse galaxy JSON file. Please check file format.');
        }
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Copy seed
  const handleCopySeed = (seed: number, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(seed.toString());
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Filtered saved galaxies
  const filteredGalaxies = savedList.filter((g) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      g.name.toLowerCase().includes(q) ||
      g.seed.toString().includes(q) ||
      g.config.morphology.toLowerCase().includes(q) ||
      (g.notes && g.notes.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-4 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-950 border border-blue-700/80 flex items-center justify-center text-blue-400">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                GALAXY CATALOG &amp; SAVED STATES
              </h3>
              <p className="text-[11px] text-slate-400">
                Save, load, and manage seeded galactic architectures.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs font-mono">
          {/* Section 1: Save Current Active Galaxy */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/90 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Save className="w-3.5 h-3.5 text-blue-400" />
                <span>Save Active Galaxy</span>
              </span>
              <span className="text-[10.5px] px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800 font-bold">
                Seed #{currentConfig.seed} &bull; {currentConfig.morphology}
              </span>
            </div>

            <form onSubmit={handleSaveCurrent} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10.5px] text-slate-400 block mb-1">Galaxy Name:</label>
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Enter galaxy name..."
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10.5px] text-slate-400 block mb-1">Notes / Description (Optional):</label>
                  <input
                    type="text"
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    placeholder="e.g. Spiral arms with dense core cluster"
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-[10.5px] text-slate-400">
                  {saveSuccess && (
                    <span className="text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                      <Check className="w-3.5 h-3.5" /> Galaxy saved to catalog!
                    </span>
                  )}
                </div>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold transition shadow-lg shadow-blue-500/20 cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Galaxy</span>
                </button>
              </div>
            </form>
          </div>

          {/* Section 2: Saved Galaxies Catalog */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-bold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Disc className="w-3.5 h-3.5 text-indigo-400" />
                <span>Saved Galaxies ({savedList.length})</span>
              </span>

              {/* Import / Export Controls */}
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".json,application/json"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-purple-300 border border-purple-800/80 hover:border-purple-600 text-[10.5px] flex items-center gap-1 transition cursor-pointer"
                  title="Import a saved galaxy from a JSON file"
                >
                  <Upload className="w-3 h-3" />
                  <span>Import JSON</span>
                </button>
              </div>
            </div>

            {/* Search Filter */}
            {savedList.length > 3 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter saved galaxies by name, seed, morphology..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-900/60 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {/* List Cards */}
            {filteredGalaxies.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-900/30 border border-slate-800/60 text-slate-500">
                {savedList.length === 0
                  ? 'No saved galaxies yet. Use the form above to save your first galaxy state!'
                  : 'No saved galaxies match your search filter.'}
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {filteredGalaxies.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onLoadGalaxy(item)}
                    className="p-3 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-blue-500/60 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-white group-hover:text-cyan-300 transition-colors text-sm truncate">
                          {item.name}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-300 border border-blue-800/80 flex items-center gap-1 flex-shrink-0">
                          <span>Seed #{item.seed}</span>
                          <button
                            type="button"
                            onClick={(e) => handleCopySeed(item.seed, item.id, e)}
                            className="hover:text-white"
                            title="Copy Seed"
                          >
                            {copiedId === item.id ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                          </button>
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-400 flex items-center gap-2 flex-wrap">
                        <span className="text-slate-300 capitalize">{item.config.morphology}</span>
                        <span>&bull;</span>
                        <span>{item.config.radiusKpc} kpc radius</span>
                        <span>&bull;</span>
                        <span>{item.config.armCount} arms</span>
                        {item.stats && (
                          <>
                            <span>&bull;</span>
                            <span className="text-emerald-400">~{Math.round((item.stats.totalEstimatedStars || 0) / 1000)}k stars</span>
                          </>
                        )}
                        <span>&bull;</span>
                        <span className="text-slate-500 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{new Date(item.savedAt).toLocaleDateString()}</span>
                        </span>
                      </div>

                      {item.notes && (
                        <p className="text-[10px] text-slate-400 italic mt-1 line-clamp-1">
                          &ldquo;{item.notes}&rdquo;
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleExport(item, e)}
                        className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
                        title="Export JSON"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(item.id, e)}
                        className="p-1.5 rounded-lg bg-slate-950 hover:bg-red-950 text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-800 transition"
                        title="Delete Galaxy"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onLoadGalaxy(item)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 group-hover:bg-blue-500 text-white font-bold text-[10.5px] transition shadow"
                      >
                        Load
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1 text-slate-500">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Galaxy configurations and loaded sectors are cached automatically.</span>
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-bold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
