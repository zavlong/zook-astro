import React, { useState } from 'react';
import {
  Sparkles,
  Activity,
  Trash2,
  Plus,
  Orbit,
} from 'lucide-react';
import {
  RealisticStarNode,
  RealisticBinarySplit,
} from '../../../types/astrophysics';
import {
  formatCleanNumber,
  autoFillBlankStarFields,
  autoCalculateStarFromMassAge,
  StarBlankFieldFlags,
} from '../../../core/generation/systemEditorPhysics';

export const STAR_LABELS = ['A', 'B', 'C', 'D'] as const;

export const EVOLUTIONARY_CATEGORIES = [
  'Main Sequence',
  'Subgiant Branch',
  'Red Giant Branch',
  'Brown Dwarf',
  'White Dwarf',
  'Neutron Star',
  'Stellar Black Hole',
];

export interface EditorStarsTabProps {
  stars: RealisticStarNode[];
  splits: RealisticBinarySplit[];
  archName: string;
  sysAge: number;
  sysFeh: number;
  onUpdateStarField: (starIdx: number, field: keyof RealisticStarNode, value: any) => void;
  onReplaceStar: (starIdx: number, updatedStar: RealisticStarNode) => void;
  onAddStar: () => void;
  onDeleteStar: (starIdx: number) => void;
  onSetStarCount: (count: number) => void;
  onUpdateSplitField: (splitIdx: number, field: 'a_AU' | 'e', value: number) => void;
}

export const EditorStarsTab: React.FC<EditorStarsTabProps> = ({
  stars,
  splits,
  archName,
  sysAge,
  sysFeh,
  onUpdateStarField,
  onReplaceStar,
  onAddStar,
  onDeleteStar,
  onSetStarCount,
  onUpdateSplitField,
}) => {
  // Local draft string state keyed by `${sIdx}-${field}`
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Auto-recalc toggle for mass edits
  const [autoRecalcOnMass, setAutoRecalcOnMass] = useState<boolean>(false);

  const getDraft = (
    sIdx: number,
    field: keyof RealisticStarNode,
    star: RealisticStarNode
  ): string => {
    const key = `${sIdx}-${String(field)}`;
    if (drafts[key] !== undefined) {
      return drafts[key];
    }
    const val = star[field];
    if (val === undefined || val === null) return '';
    if (field === 'spectralType') return String(val || '');
    if (field === 'Teff') return val ? String(Math.round(val as number)) : '';
    if (typeof val === 'number') {
      if (val === 0) return '';
      return String(formatCleanNumber(val));
    }
    return String(val);
  };

  const isBlank = (
    sIdx: number,
    field: keyof RealisticStarNode,
    star: RealisticStarNode
  ): boolean => {
    const d = getDraft(sIdx, field, star);
    if (d.trim() === '') return true;
    if (field !== 'spectralType') {
      const num = parseFloat(d);
      return Number.isNaN(num) || num <= 0;
    }
    return false;
  };

  const handleFieldChange = (
    sIdx: number,
    field: keyof RealisticStarNode,
    text: string
  ) => {
    const key = `${sIdx}-${String(field)}`;
    setDrafts((prev) => ({ ...prev, [key]: text }));

    const star = stars[sIdx];
    if (!star) return;

    if (text.trim() === '') {
      if (field === 'spectralType') {
        onUpdateStarField(sIdx, 'spectralType', '');
      } else {
        onUpdateStarField(sIdx, field, 0);
        if (field === 'lumNum') {
          onUpdateStarField(sIdx, 'lum', 0);
        }
      }
      return;
    }

    if (field === 'spectralType') {
      onUpdateStarField(sIdx, 'spectralType', text);
      return;
    }

    const num = parseFloat(text);
    if (!Number.isNaN(num)) {
      if (field === 'mass' && autoRecalcOnMass && num > 0) {
        const recomputed = autoCalculateStarFromMassAge(
          { ...star, mass: num },
          sysAge,
          sysFeh
        );
        onReplaceStar(sIdx, recomputed);
        setDrafts((prev) => ({
          ...prev,
          [`${sIdx}-mass`]: text,
          [`${sIdx}-spectralType`]: recomputed.spectralType || '',
          [`${sIdx}-radius`]: String(formatCleanNumber(recomputed.radius)),
          [`${sIdx}-Teff`]: String(Math.round(recomputed.Teff)),
          [`${sIdx}-lumNum`]: String(
            formatCleanNumber(
              typeof recomputed.lumNum === 'number' ? recomputed.lumNum : 1
            )
          ),
        }));
      } else {
        onUpdateStarField(sIdx, field, num);
        if (field === 'lumNum') {
          onUpdateStarField(sIdx, 'lum', num);
        }
      }
    }
  };

  const handleAutoFillBlanks = (sIdx: number) => {
    const star = stars[sIdx];
    if (!star) return;

    const blankFlags: StarBlankFieldFlags = {
      spectralTypeBlank: isBlank(sIdx, 'spectralType', star),
      massBlank: isBlank(sIdx, 'mass', star),
      radiusBlank: isBlank(sIdx, 'radius', star),
      teffBlank: isBlank(sIdx, 'Teff', star),
      lumBlank: isBlank(sIdx, 'lumNum', star),
    };

    const filled = autoFillBlankStarFields(star, sysAge, sysFeh, blankFlags);
    onReplaceStar(sIdx, filled);

    setDrafts((prev) => ({
      ...prev,
      [`${sIdx}-spectralType`]: filled.spectralType || '',
      [`${sIdx}-mass`]: String(formatCleanNumber(filled.mass)),
      [`${sIdx}-radius`]: String(formatCleanNumber(filled.radius)),
      [`${sIdx}-Teff`]: String(Math.round(filled.Teff)),
      [`${sIdx}-lumNum`]: String(
        formatCleanNumber(
          typeof filled.lumNum === 'number' ? filled.lumNum : 1
        )
      ),
    }));
  };

  const handleAutoCalcStar = (sIdx: number) => {
    const star = stars[sIdx];
    if (!star) return;

    const rawMass = getDraft(sIdx, 'mass', star);
    const parsedMass = parseFloat(rawMass) || star.mass || 1.0;
    const recomputed = autoCalculateStarFromMassAge(
      { ...star, mass: parsedMass },
      sysAge,
      sysFeh
    );
    onReplaceStar(sIdx, recomputed);

    setDrafts((prev) => ({
      ...prev,
      [`${sIdx}-spectralType`]: recomputed.spectralType || '',
      [`${sIdx}-mass`]: String(formatCleanNumber(recomputed.mass)),
      [`${sIdx}-radius`]: String(formatCleanNumber(recomputed.radius)),
      [`${sIdx}-Teff`]: String(Math.round(recomputed.Teff)),
      [`${sIdx}-lumNum`]: String(
        formatCleanNumber(
          typeof recomputed.lumNum === 'number' ? recomputed.lumNum : 1
        )
      ),
    }));
  };

  const handleAutoCalcAllStars = () => {
    const nextDrafts = { ...drafts };
    stars.forEach((star, sIdx) => {
      const rawMass = getDraft(sIdx, 'mass', star);
      const parsedMass = parseFloat(rawMass) || star.mass || 1.0;
      const recomputed = autoCalculateStarFromMassAge(
        { ...star, mass: parsedMass },
        sysAge,
        sysFeh
      );
      onReplaceStar(sIdx, recomputed);

      nextDrafts[`${sIdx}-spectralType`] = recomputed.spectralType || '';
      nextDrafts[`${sIdx}-mass`] = String(formatCleanNumber(recomputed.mass));
      nextDrafts[`${sIdx}-radius`] = String(formatCleanNumber(recomputed.radius));
      nextDrafts[`${sIdx}-Teff`] = String(Math.round(recomputed.Teff));
      nextDrafts[`${sIdx}-lumNum`] = String(
        formatCleanNumber(
          typeof recomputed.lumNum === 'number' ? recomputed.lumNum : 1
        )
      );
    });
    setDrafts(nextDrafts);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-amber-400">
            Host Stars & Multi-Star Hierarchy
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Add or remove stars (1-4), adjust masses, calculate stellar parameters, and edit orbital separations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Star count selector */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            <span className="text-[10px] font-mono text-slate-400 px-2 uppercase font-semibold">
              Stars:
            </span>
            {([1, 2, 3, 4] as const).map((cnt) => (
              <button
                key={`star-cnt-${cnt}`}
                onClick={() => onSetStarCount(cnt)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition ${
                  stars.length === cnt
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {cnt}★ {cnt === 1 ? 'Single' : cnt === 2 ? 'Binary' : cnt === 3 ? 'Trinary' : 'Quad'}
              </button>
            ))}
          </div>

          {/* Auto-recalc toggle */}
          <label className="flex items-center gap-2 cursor-pointer bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 hover:text-white transition">
            <input
              type="checkbox"
              checked={autoRecalcOnMass}
              onChange={(e) => setAutoRecalcOnMass(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span className="text-[11px]">Auto-recalc on Mass change</span>
          </label>

          {/* Auto-calc all stars */}
          <button
            onClick={handleAutoCalcAllStars}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 font-mono text-xs font-semibold transition hover:scale-105 active:scale-95 shadow-md shadow-indigo-950/40"
            title="Auto-calculate all stars from mass and age"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Auto-Calc All Stars</span>
          </button>

          {stars.length < 4 && (
            <button
              onClick={onAddStar}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-mono text-xs font-semibold transition hover:scale-105 active:scale-95 shadow-md shadow-amber-950/40"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Companion Star</span>
            </button>
          )}
        </div>
      </div>

      {/* Star Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stars.map((star, sIdx) => {
          return (
            <div
              key={`star-${sIdx}`}
              className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 shadow-lg space-y-4 relative group"
            >
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-slate-800/70 pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl border border-white/40 flex items-center justify-center font-bold text-sm shadow-md"
                    style={{
                      backgroundColor: star.colorHex || '#ffd2a1',
                      color: '#000000',
                    }}
                  >
                    {star.label}
                  </div>
                  <div>
                    <div className="font-bold font-mono text-sm text-white flex items-center gap-2">
                      <span>Star {star.label} &bull; {star.spectralType || 'Unclassified'}</span>
                      {sIdx === 0 ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                          Primary Host
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 font-mono">
                          Companion
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono text-slate-400">
                      {star.category || 'Unknown'} &bull; {star.Teff || 0} K
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAutoFillBlanks(sIdx)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 font-mono text-xs font-semibold transition shadow-sm"
                    title="Fill ONLY blank/missing fields using astrophysics laws while preserving entered values"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Auto-Fill Blanks</span>
                  </button>

                  <button
                    onClick={() => handleAutoCalcStar(sIdx)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 font-mono text-xs font-semibold transition shadow-sm"
                    title="Auto-calculate radius, Teff, luminosity, logg, and spectral class from mass and age"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Auto-Calc (Mass & Age)</span>
                  </button>

                  <input
                    type="color"
                    value={star.colorHex || '#ffd2a1'}
                    onChange={(e) => onUpdateStarField(sIdx, 'colorHex', e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    title="Star Color"
                  />

                  {sIdx > 0 && (
                    <button
                      onClick={() => onDeleteStar(sIdx)}
                      className="p-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-950/50 border border-rose-800/40 transition"
                      title={`Remove Star ${star.label}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Input Fields */}
              <div className="grid grid-cols-2 gap-3">
                {/* Spectral Class */}
                <div>
                  <label className="text-[11px] font-mono text-slate-400">Spectral Class</label>
                  <input
                    type="text"
                    value={getDraft(sIdx, 'spectralType', star)}
                    onChange={(e) => handleFieldChange(sIdx, 'spectralType', e.target.value)}
                    className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-amber-400 focus:outline-none transition ${
                      isBlank(sIdx, 'spectralType', star)
                        ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                        : 'bg-slate-950 border border-slate-800 text-white'
                    }`}
                    placeholder={
                      isBlank(sIdx, 'spectralType', star)
                        ? 'Blank — click Auto-Fill'
                        : 'e.g. G2V, M4V, O9V'
                    }
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="text-[11px] font-mono text-slate-400">Category</label>
                  <select
                    value={star.category}
                    onChange={(e) => onUpdateStarField(sIdx, 'category', e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-amber-400 focus:outline-none text-white"
                  >
                    {EVOLUTIONARY_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mass */}
                <div>
                  <label className="text-[11px] font-mono text-slate-400">Mass (M☉)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={getDraft(sIdx, 'mass', star)}
                    onChange={(e) => handleFieldChange(sIdx, 'mass', e.target.value)}
                    className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-amber-400 focus:outline-none transition ${
                      isBlank(sIdx, 'mass', star)
                        ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                        : 'bg-slate-950 border border-slate-800 text-white'
                    }`}
                    placeholder={
                      isBlank(sIdx, 'mass', star)
                        ? 'Blank — click Auto-Fill'
                        : '1.0'
                    }
                  />
                </div>

                {/* Radius */}
                <div>
                  <label className="text-[11px] font-mono text-slate-400">Radius (R☉)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={getDraft(sIdx, 'radius', star)}
                    onChange={(e) => handleFieldChange(sIdx, 'radius', e.target.value)}
                    className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-amber-400 focus:outline-none transition ${
                      isBlank(sIdx, 'radius', star)
                        ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                        : 'bg-slate-950 border border-slate-800 text-white'
                    }`}
                    placeholder={
                      isBlank(sIdx, 'radius', star)
                        ? 'Blank — click Auto-Fill'
                        : '1.0'
                    }
                  />
                </div>

                {/* Teff */}
                <div>
                  <label className="text-[11px] font-mono text-slate-400">Teff (K)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={getDraft(sIdx, 'Teff', star)}
                    onChange={(e) => handleFieldChange(sIdx, 'Teff', e.target.value)}
                    className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-amber-400 focus:outline-none transition ${
                      isBlank(sIdx, 'Teff', star)
                        ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                        : 'bg-slate-950 border border-slate-800 text-white'
                    }`}
                    placeholder={
                      isBlank(sIdx, 'Teff', star)
                        ? 'Blank — click Auto-Fill'
                        : '5778'
                    }
                  />
                </div>

                {/* Luminosity */}
                <div>
                  <label className="text-[11px] font-mono text-slate-400">Luminosity (L☉)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={getDraft(sIdx, 'lumNum', star)}
                    onChange={(e) => handleFieldChange(sIdx, 'lumNum', e.target.value)}
                    className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-amber-400 focus:outline-none transition ${
                      isBlank(sIdx, 'lumNum', star)
                        ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                        : 'bg-slate-950 border border-slate-800 text-white'
                    }`}
                    placeholder={
                      isBlank(sIdx, 'lumNum', star)
                        ? 'Blank — click Auto-Fill'
                        : '1.0'
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Binary & Multiple Splits */}
      {splits && splits.length > 0 && (
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/70 pb-3">
            <div className="flex items-center gap-2">
              <Orbit className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300">
                Binary & Multiple Star Orbital Separations
              </h4>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Architecture: <span className="text-amber-300 font-semibold">{archName}</span>
            </span>
          </div>

          <div className="space-y-3">
            {splits.map((split, spIdx) => (
              <div
                key={`split-${spIdx}`}
                className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-700/60 text-cyan-300 font-mono text-xs font-bold">
                    Pair: {split.pair}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                    Regime: {split.regime}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-center">
                  <div>
                    <label className="text-[10px] font-mono text-slate-400">Semi-Major Axis (AU)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.05"
                      max="10000"
                      value={split.a_AU}
                      onChange={(e) =>
                        onUpdateSplitField(spIdx, 'a_AU', parseFloat(e.target.value) || 1.0)
                      }
                      className="w-full mt-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-slate-400">Eccentricity (e)</label>
                    <input
                      type="number"
                      step="0.02"
                      min="0"
                      max="0.95"
                      value={split.e}
                      onChange={(e) =>
                        onUpdateSplitField(spIdx, 'e', parseFloat(e.target.value) || 0)
                      }
                      className="w-full mt-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-slate-400">Stable Limit S_max (AU)</label>
                    <div className="mt-1 px-2 py-1 rounded bg-slate-900/60 border border-slate-800 text-xs font-mono text-slate-300">
                      A: {split.sMaxA} | B: {split.sMaxB}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-slate-400">Circum Critical P_min (AU)</label>
                    <div className="mt-1 px-2 py-1 rounded bg-slate-900/60 border border-slate-800 text-xs font-mono text-emerald-400">
                      {split.pMin} AU
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
