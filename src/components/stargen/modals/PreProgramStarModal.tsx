import React, { useMemo, useState } from 'react';
import {
  X,
  Star,
  Sparkles,
  Lock,
  Unlock,
  RefreshCw,
  Sliders,
  Orbit,
  CheckCircle2,
  Download,
} from 'lucide-react';
import {
  CustomStellarConfig,
  CustomStarInput,
  CustomBinarySplitInput,
  RealisticStarSystemResult,
  buildCustomHierarchy,
  getStarStats,
} from '../../../core/generation/realisticStarGen';

interface PreProgramStarModalProps {
  currentConfig: CustomStellarConfig | undefined;
  currentAge: number;
  currentFeh: number;
  currentSystem: RealisticStarSystemResult | null;
  onApplyAndGeneratePlanets: (
    config: CustomStellarConfig,
    age: number,
    feh: number
  ) => void;
  onDisableCustomStars: () => void;
  onClose: () => void;
}

const STAR_LABELS = ['A', 'B', 'C', 'D'] as const;

const EVOLUTIONARY_CATEGORIES = [
  'Main Sequence',
  'Subgiant Branch',
  'Red Giant Branch',
  'Brown Dwarf',
  'White Dwarf',
  'Neutron Star',
  'Stellar Black Hole',
];

export const PreProgramStarModal: React.FC<PreProgramStarModalProps> = ({
  currentConfig,
  currentAge,
  currentFeh,
  currentSystem,
  onApplyAndGeneratePlanets,
  onDisableCustomStars,
  onClose,
}) => {
  const [age, setAge] = useState<number>(currentAge);
  const [feh, setFeh] = useState<number>(currentFeh);

  const [nStars, setNStars] = useState<1 | 2 | 3 | 4>(
    currentConfig?.nStars || (currentSystem ? (Math.min(4, Math.max(1, currentSystem.hierarchy.stars.length)) as 1 | 2 | 3 | 4) : 1)
  );
  const [trinaryTopology, setTrinaryTopology] = useState<'AB_C' | 'A_BC'>(
    currentConfig?.trinaryTopology ||
      (currentSystem?.hierarchy.archName.includes('A + (B+C)') ? 'A_BC' : 'AB_C')
  );

  const [stars, setStars] = useState<CustomStarInput[]>(() => {
    if (currentConfig?.stars && currentConfig.stars.length > 0) {
      const padded: CustomStarInput[] = [];
      for (let i = 0; i < 4; i++) {
        padded.push(
          currentConfig.stars[i]
            ? { ...currentConfig.stars[i] }
            : {
                label: STAR_LABELS[i],
                mass: i === 0 ? 1.0 : i === 1 ? 0.75 : 0.45,
                overrideMode: 'auto',
              }
        );
      }
      return padded;
    }
    if (currentSystem && currentSystem.hierarchy.stars.length > 0) {
      const padded: CustomStarInput[] = [];
      for (let i = 0; i < 4; i++) {
        const ex = currentSystem.hierarchy.stars[i];
        if (ex) {
          padded.push({
            label: STAR_LABELS[i],
            mass: ex.mass,
            overrideMode: 'custom',
            category: ex.category,
            spectralType: ex.spectralType,
            lumNum: ex.lumNum,
            radius: ex.radius,
            Teff: ex.Teff,
            colorHex: ex.colorHex,
          });
        } else {
          padded.push({
            label: STAR_LABELS[i],
            mass: i === 1 ? 0.75 : 0.45,
            overrideMode: 'auto',
          });
        }
      }
      return padded;
    }
    return [
      { label: 'A', mass: 1.0, overrideMode: 'auto' },
      { label: 'B', mass: 0.75, overrideMode: 'auto' },
      { label: 'C', mass: 0.45, overrideMode: 'auto' },
      { label: 'D', mass: 0.3, overrideMode: 'auto' },
    ];
  });

  const [splits, setSplits] = useState<CustomBinarySplitInput[]>(() => {
    if (currentConfig?.splits && currentConfig.splits.length > 0) {
      return [
        currentConfig.splits[0] || { a_AU: 35.0, e: 0.18 },
        currentConfig.splits[1] || { a_AU: 4.5, e: 0.12 },
        currentConfig.splits[2] || { a_AU: 6.0, e: 0.15 },
      ];
    }
    if (currentSystem && currentSystem.hierarchy.splits.length > 0) {
      const sp = currentSystem.hierarchy.splits;
      return [
        sp[0] ? { a_AU: sp[0].a_AU, e: sp[0].e } : { a_AU: 35.0, e: 0.18 },
        sp[1] ? { a_AU: sp[1].a_AU, e: sp[1].e } : { a_AU: 4.5, e: 0.12 },
        sp[2] ? { a_AU: sp[2].a_AU, e: sp[2].e } : { a_AU: 6.0, e: 0.15 },
      ];
    }
    return [
      { a_AU: 35.0, e: 0.18 },
      { a_AU: 4.5, e: 0.12 },
      { a_AU: 6.0, e: 0.15 },
    ];
  });

  const updateStar = (idx: number, patch: Partial<CustomStarInput>) => {
    setStars((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const updateSplit = (idx: number, patch: Partial<CustomBinarySplitInput>) => {
    setSplits((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const handleLoadFromCurrentSystem = () => {
    if (!currentSystem) return;
    setAge(currentSystem.step1.age);
    setFeh(currentSystem.step1.feh);
    const count = Math.min(4, Math.max(1, currentSystem.hierarchy.stars.length)) as 1 | 2 | 3 | 4;
    setNStars(count);
    if (currentSystem.hierarchy.archName.includes('A + (B+C)')) {
      setTrinaryTopology('A_BC');
    } else {
      setTrinaryTopology('AB_C');
    }
    const nextStars: CustomStarInput[] = [];
    for (let i = 0; i < 4; i++) {
      const st = currentSystem.hierarchy.stars[i];
      if (st) {
        nextStars.push({
          label: STAR_LABELS[i],
          mass: st.mass,
          overrideMode: 'custom',
          category: st.category,
          spectralType: st.spectralType,
          lumNum: st.lumNum,
          radius: st.radius,
          Teff: st.Teff,
          colorHex: st.colorHex,
        });
      } else {
        nextStars.push({
          label: STAR_LABELS[i],
          mass: 0.5,
          overrideMode: 'auto',
        });
      }
    }
    setStars(nextStars);

    const sp = currentSystem.hierarchy.splits;
    setSplits([
      sp[0] ? { a_AU: sp[0].a_AU, e: sp[0].e } : { a_AU: 35.0, e: 0.18 },
      sp[1] ? { a_AU: sp[1].a_AU, e: sp[1].e } : { a_AU: 4.5, e: 0.12 },
      sp[2] ? { a_AU: sp[2].a_AU, e: sp[2].e } : { a_AU: 6.0, e: 0.15 },
    ]);
  };

  const applyTemplate = (templateId: string) => {
    if (templateId === 'sol') {
      setAge(4.6);
      setFeh(0.0);
      setNStars(1);
      updateStar(0, {
        mass: 1.0,
        overrideMode: 'custom',
        category: 'Main Sequence',
        spectralType: 'G2V',
        lumNum: 1.0,
        radius: 1.0,
        Teff: 5778,
      });
    } else if (templateId === 'alphacen') {
      setAge(5.3);
      setFeh(0.21);
      setNStars(3);
      setTrinaryTopology('AB_C');
      setStars([
        {
          label: 'A',
          mass: 1.1,
          overrideMode: 'custom',
          category: 'Main Sequence',
          spectralType: 'G2V',
          lumNum: 1.519,
          radius: 1.223,
          Teff: 5790,
        },
        {
          label: 'B',
          mass: 0.907,
          overrideMode: 'custom',
          category: 'Main Sequence',
          spectralType: 'K1V',
          lumNum: 0.5,
          radius: 0.863,
          Teff: 5260,
        },
        {
          label: 'C',
          mass: 0.122,
          overrideMode: 'custom',
          category: 'Main Sequence',
          spectralType: 'M5.5V',
          lumNum: 0.0017,
          radius: 0.154,
          Teff: 3042,
        },
        stars[3],
      ]);
      setSplits([
        { a_AU: 8700.0, e: 0.5 },
        { a_AU: 23.4, e: 0.518 },
        splits[2],
      ]);
    } else if (templateId === 'trappist1') {
      setAge(7.6);
      setFeh(0.04);
      setNStars(1);
      updateStar(0, {
        mass: 0.0898,
        overrideMode: 'custom',
        category: 'Main Sequence',
        spectralType: 'M8V',
        lumNum: 0.000553,
        radius: 0.1192,
        Teff: 2566,
      });
    } else if (templateId === 'kepler16') {
      setAge(3.8);
      setFeh(-0.3);
      setNStars(2);
      setStars([
        {
          label: 'A',
          mass: 0.6897,
          overrideMode: 'custom',
          category: 'Main Sequence',
          spectralType: 'K5V',
          lumNum: 0.148,
          radius: 0.6489,
          Teff: 4450,
        },
        {
          label: 'B',
          mass: 0.20255,
          overrideMode: 'custom',
          category: 'Main Sequence',
          spectralType: 'M4.5V',
          lumNum: 0.0057,
          radius: 0.2262,
          Teff: 3311,
        },
        stars[2],
        stars[3],
      ]);
      setSplits([{ a_AU: 0.2243, e: 0.159 }, splits[1], splits[2]]);
    } else if (templateId === 'sirius') {
      setAge(0.24);
      setFeh(0.5);
      setNStars(2);
      setStars([
        {
          label: 'A',
          mass: 2.063,
          overrideMode: 'custom',
          category: 'Main Sequence',
          spectralType: 'A1V',
          lumNum: 25.4,
          radius: 1.711,
          Teff: 9940,
        },
        {
          label: 'B',
          mass: 1.018,
          overrideMode: 'custom',
          category: 'White Dwarf',
          spectralType: 'DA2',
          lumNum: 0.056,
          radius: 0.0084,
          Teff: 25200,
        },
        stars[2],
        stars[3],
      ]);
      setSplits([{ a_AU: 19.8, e: 0.591 }, splits[1], splits[2]]);
    } else if (templateId === 'pulsar') {
      setAge(4.5);
      setFeh(0.0);
      setNStars(1);
      updateStar(0, {
        mass: 1.4,
        overrideMode: 'custom',
        category: 'Neutron Star',
        spectralType: 'PSR / NS',
        lumNum: 0.00025,
        radius: 0.0002,
        Teff: 85000,
      });
    }
  };

  // Live preview of the resulting stellar hierarchy and stability zones
  const previewHierarchy = useMemo(() => {
    const cfg: CustomStellarConfig = {
      enabled: true,
      nStars,
      trinaryTopology,
      stars: stars.slice(0, nStars),
      splits,
    };
    return buildCustomHierarchy(cfg, age, feh);
  }, [nStars, trinaryTopology, stars, splits, age, feh]);

  const splitDescriptions = useMemo(() => {
    if (nStars === 2) {
      return [{ index: 0, label: 'Binary Orbit (Star A ↔ Star B)' }];
    }
    if (nStars === 3) {
      if (trinaryTopology === 'AB_C') {
        return [
          { index: 0, label: 'Outer Orbit ((A + B) ↔ Star C)' },
          { index: 1, label: 'Inner Binary Orbit (Star A ↔ Star B)' },
        ];
      }
      return [
        { index: 0, label: 'Outer Orbit (Star A ↔ (B + C))' },
        { index: 1, label: 'Inner Binary Orbit (Star B ↔ Star C)' },
      ];
    }
    if (nStars === 4) {
      return [
        { index: 0, label: 'Wide Quadruple Orbit ((A + B) ↔ (C + D))' },
        { index: 1, label: 'Inner Pair 1 Orbit (Star A ↔ Star B)' },
        { index: 2, label: 'Inner Pair 2 Orbit (Star C ↔ Star D)' },
      ];
    }
    return [];
  }, [nStars, trinaryTopology]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0e131d] border border-[#2a3852] rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#131b29] border-b border-[#2a3852]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-400">
              <Star className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Pre-Program Star Data (Generate Planets Only)
                {currentConfig?.enabled && (
                  <span className="px-2 py-0.5 text-[10px] font-mono uppercase rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Active
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Lock custom stellar masses, luminosities, temperatures, spectral types &amp; binary orbits — the generator will compute stability zones and only generate planets &amp; moons around your stars.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Quick Load / Stellar Templates Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#141c2b] border border-[#26354d] rounded-xl p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                Quick Templates:
              </span>
              {[
                { id: 'sol', label: 'Sol (G2V)' },
                { id: 'alphacen', label: 'Alpha Centauri AB+C' },
                { id: 'trappist1', label: 'TRAPPIST-1 (M8V)' },
                { id: 'kepler16', label: 'Kepler-16 (Circumbinary)' },
                { id: 'sirius', label: 'Sirius A + White Dwarf B' },
                { id: 'pulsar', label: 'Millisecond Pulsar' },
              ].map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl.id)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#1c273b] hover:bg-sky-900/50 text-slate-200 hover:text-sky-200 border border-[#2e405e] hover:border-sky-500/50 cursor-pointer transition"
                >
                  {tpl.label}
                </button>
              ))}
            </div>

            {currentSystem && (
              <button
                type="button"
                onClick={handleLoadFromCurrentSystem}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-700/70 flex items-center gap-1.5 cursor-pointer transition"
                title="Copy the currently generated system's stars and binary orbits into the editor"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                Load Current System&apos;s Stars
              </button>
            )}
          </div>

          {/* Global System Parameters Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#131b29] border border-[#24324a] rounded-xl p-3.5">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-300 uppercase">
                Number of Stars
              </label>
              <select
                value={nStars}
                onChange={(e) => setNStars(Number(e.target.value) as 1 | 2 | 3 | 4)}
                className="bg-[#0e131d] text-white border border-[#2a3852] rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-sky-400"
              >
                <option value={1}>1 Star (Single)</option>
                <option value={2}>2 Stars (Binary)</option>
                <option value={3}>3 Stars (Trinary)</option>
                <option value={4}>4 Stars (Quadruple 2+2)</option>
              </select>
            </div>

            {nStars === 3 && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-300 uppercase">
                  Trinary Topology
                </label>
                <select
                  value={trinaryTopology}
                  onChange={(e) => setTrinaryTopology(e.target.value as 'AB_C' | 'A_BC')}
                  className="bg-[#0e131d] text-white border border-[#2a3852] rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:border-sky-400"
                >
                  <option value="AB_C">((A + B) + C) — Inner AB, Wide C</option>
                  <option value="A_BC">(A + (B + C)) — Primary A, Inner BC</option>
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px] font-bold text-slate-300 uppercase">
                <span>System Age (Gyr)</span>
                <span className="text-sky-400 font-mono">{age.toFixed(2)} Gyr</span>
              </div>
              <input
                type="number"
                min={0.01}
                max={13.8}
                step={0.1}
                value={age}
                onChange={(e) => setAge(Math.max(0.01, Math.min(13.8, Number(e.target.value) || 0.1)))}
                className="bg-[#0e131d] text-white border border-[#2a3852] rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-sky-400"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px] font-bold text-slate-300 uppercase">
                <span>Disk Metallicity [Fe/H]</span>
                <span className="text-sky-400 font-mono">
                  {feh >= 0 ? `+${feh.toFixed(2)}` : feh.toFixed(2)} dex
                </span>
              </div>
              <input
                type="number"
                min={-2.5}
                max={0.6}
                step={0.05}
                value={feh}
                onChange={(e) => setFeh(Math.max(-2.5, Math.min(0.6, Number(e.target.value) || 0)))}
                className="bg-[#0e131d] text-white border border-[#2a3852] rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-sky-400"
              />
            </div>
          </div>

          {/* Individual Star Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                Stellar Components ({nStars} {nStars === 1 ? 'Star' : 'Stars'})
              </h3>
              <span className="text-[11px] text-slate-400">
                Choose &quot;Auto from Mass&quot; to evolve along stellar tracks, or &quot;Custom Telemetry&quot; to specify exact L, R, Teff &amp; Spectral Class.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {Array.from({ length: nStars }).map((_, idx) => {
                const st = stars[idx];
                const resolvedNode = previewHierarchy.stars[idx];
                const isCustom = st.overrideMode === 'custom';

                const syncFromMass = () => {
                  const autoStats = getStarStats(
                    Math.max(0.005, Number(st.mass) || 1.0),
                    age,
                    feh,
                    STAR_LABELS[idx]
                  );
                  updateStar(idx, {
                    overrideMode: 'custom',
                    category: autoStats.category,
                    spectralType: autoStats.spectralType,
                    lumNum: +autoStats.lumNum.toPrecision(4),
                    radius: autoStats.radius,
                    Teff: autoStats.Teff,
                    colorHex: autoStats.colorHex,
                  });
                };

                const calcRadiusFromLAndT = () => {
                  const L = Number(st.lumNum) || resolvedNode.lumNum || 1.0;
                  const T = Number(st.Teff) || resolvedNode.Teff || 5778;
                  const R = +(Math.sqrt(Math.max(1e-8, L)) * Math.pow(5778.0 / Math.max(300, T), 2)).toFixed(4);
                  updateStar(idx, { radius: R });
                };

                return (
                  <div
                    key={STAR_LABELS[idx]}
                    className="bg-[#131b29] border border-[#2a3852] rounded-xl p-3.5 space-y-3"
                  >
                    {/* Star Card Header */}
                    <div className="flex items-center justify-between border-b border-[#223047] pb-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full inline-block border border-white/30 shadow-sm"
                          style={{
                            backgroundColor: resolvedNode?.colorHex || '#fff4ea',
                            boxShadow: `0 0 10px ${resolvedNode?.colorHex || '#fff4ea'}`,
                          }}
                        />
                        <span className="font-bold text-white text-sm">
                          Star {STAR_LABELS[idx]}
                        </span>
                        {resolvedNode && (
                          <span className="px-2 py-0.5 rounded bg-[#0e131d] border border-[#2a3852] text-[11px] font-mono text-sky-300">
                            {resolvedNode.spectralType} • {resolvedNode.category}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center bg-[#0e131d] p-0.5 rounded-lg border border-[#2a3852] text-[11px]">
                        <button
                          type="button"
                          onClick={() => updateStar(idx, { overrideMode: 'auto' })}
                          className={`px-2 py-0.5 rounded-md cursor-pointer transition ${
                            !isCustom
                              ? 'bg-sky-600 text-white font-semibold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Auto from Mass
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!isCustom) {
                              syncFromMass();
                            }
                          }}
                          className={`px-2 py-0.5 rounded-md cursor-pointer transition ${
                            isCustom
                              ? 'bg-amber-600 text-white font-semibold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Custom Telemetry
                        </button>
                      </div>
                    </div>

                    {/* Mass Input (always visible) */}
                    <div className="grid grid-cols-2 gap-2.5 items-end">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Mass (M☉)
                        </label>
                        <input
                          type="number"
                          min={0.005}
                          max={250}
                          step={0.01}
                          value={st.mass}
                          onChange={(e) =>
                            updateStar(idx, {
                              mass: Math.max(0.005, Number(e.target.value) || 0.08),
                            })
                          }
                          className="w-full bg-[#0e131d] text-white border border-[#2a3852] rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-sky-400"
                        />
                      </div>

                      {isCustom ? (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={syncFromMass}
                            className="w-full px-2 py-1.5 rounded-lg bg-[#1a2538] hover:bg-[#23324a] text-slate-200 border border-[#2f4261] text-[11px] font-medium flex items-center justify-center gap-1 cursor-pointer transition"
                            title="Populate L, R, Teff and Spectral Type from Mass, Age & [Fe/H]"
                          >
                            <RefreshCw className="w-3 h-3 text-sky-400" />
                            Derive from Mass
                          </button>
                        </div>
                      ) : (
                        <div className="bg-[#0e131d] border border-[#223047] rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-slate-300 flex justify-between">
                          <span>L: {resolvedNode?.lum} L☉</span>
                          <span>T: {resolvedNode?.Teff} K</span>
                          <span>R: {resolvedNode?.radius} R☉</span>
                        </div>
                      )}
                    </div>

                    {/* Custom Telemetry Fields */}
                    {isCustom && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 border-t border-[#1e2a3f]">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Luminosity (L☉)
                          </label>
                          <input
                            type="number"
                            min={0.000001}
                            max={1000000}
                            step="any"
                            value={st.lumNum ?? resolvedNode?.lumNum ?? 1.0}
                            onChange={(e) =>
                              updateStar(idx, {
                                lumNum: Math.max(1e-7, Number(e.target.value) || 0.0001),
                              })
                            }
                            className="w-full bg-[#0e131d] text-amber-200 border border-[#2a3852] rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Effective Temp (K)
                          </label>
                          <input
                            type="number"
                            min={300}
                            max={150000}
                            step={50}
                            value={st.Teff ?? resolvedNode?.Teff ?? 5778}
                            onChange={(e) =>
                              updateStar(idx, {
                                Teff: Math.max(300, Math.round(Number(e.target.value) || 3000)),
                              })
                            }
                            className="w-full bg-[#0e131d] text-amber-200 border border-[#2a3852] rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold uppercase text-slate-400">
                              Radius (R☉)
                            </label>
                            <button
                              type="button"
                              onClick={calcRadiusFromLAndT}
                              className="text-[9px] text-sky-400 hover:text-sky-300 underline cursor-pointer"
                              title="Compute Stefan-Boltzmann Radius from L and Teff"
                            >
                              Auto R(L,T)
                            </button>
                          </div>
                          <input
                            type="number"
                            min={0.0001}
                            max={2500}
                            step="any"
                            value={st.radius ?? resolvedNode?.radius ?? 1.0}
                            onChange={(e) =>
                              updateStar(idx, {
                                radius: Math.max(0.0001, Number(e.target.value) || 0.1),
                              })
                            }
                            className="w-full bg-[#0e131d] text-amber-200 border border-[#2a3852] rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Spectral Type
                          </label>
                          <input
                            type="text"
                            value={st.spectralType ?? resolvedNode?.spectralType ?? 'G2V'}
                            onChange={(e) =>
                              updateStar(idx, { spectralType: e.target.value })
                            }
                            placeholder="e.g. G2V, M5V, DA2"
                            className="w-full bg-[#0e131d] text-white border border-[#2a3852] rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Evolutionary Phase / Category
                          </label>
                          <select
                            value={
                              EVOLUTIONARY_CATEGORIES.includes(st.category || '')
                                ? st.category
                                : 'Main Sequence'
                            }
                            onChange={(e) =>
                              updateStar(idx, { category: e.target.value })
                            }
                            className="w-full bg-[#0e131d] text-white border border-[#2a3852] rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-amber-400"
                          >
                            {EVOLUTIONARY_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Multi-Star Binary Orbital Splits */}
          {nStars >= 2 && (
            <div className="bg-[#131b29] border border-[#2a3852] rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Orbit className="w-3.5 h-3.5" />
                  Hierarchical Binary Orbital Splits (Holman &amp; Wiegert 1999 Stability)
                </h3>
                <span className="text-[11px] text-slate-400">
                  Close binaries (&lt; 0.5 AU) form P-Type circumbinary disks; wide binaries (&gt; 20 AU) form S-Type circumstellar disks.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {splitDescriptions.map((sd) => {
                  const sp = splits[sd.index] || { a_AU: 25.0, e: 0.15 };
                  const computedSplit = previewHierarchy.splits[sd.index];
                  return (
                    <div
                      key={sd.index}
                      className="bg-[#0e131d] border border-[#24324a] rounded-lg p-3 space-y-2"
                    >
                      <div className="font-bold text-slate-200 text-xs">
                        {sd.label}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Separation a (AU)
                          </label>
                          <input
                            type="number"
                            min={0.015}
                            max={15000}
                            step="any"
                            value={sp.a_AU}
                            onChange={(e) =>
                              updateSplit(sd.index, {
                                a_AU: Math.max(0.015, Number(e.target.value) || 1.0),
                              })
                            }
                            className="w-full bg-[#141c2b] text-white border border-[#2a3852] rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-sky-400"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                            Eccentricity e
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={0.95}
                            step={0.01}
                            value={sp.e}
                            onChange={(e) =>
                              updateSplit(sd.index, {
                                e: Math.max(0, Math.min(0.95, Number(e.target.value) || 0)),
                              })
                            }
                            className="w-full bg-[#141c2b] text-white border border-[#2a3852] rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-sky-400"
                          />
                        </div>
                      </div>
                      {computedSplit && (
                        <div className="text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/80 flex flex-wrap justify-between gap-1">
                          <span className="text-amber-300">{computedSplit.regime}</span>
                          <span>
                            S-max: {computedSplit.sMaxA} / {computedSplit.sMaxB} AU • P-min: {computedSplit.pMin} AU
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Resulting Planetary Stability Zones Preview */}
          <div className="bg-[#111826] border border-sky-900/50 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Computed Planetary Accretion Zones ({previewHierarchy.zones.length})
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Architecture: {previewHierarchy.archName}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {previewHierarchy.zones.map((z, zIdx) => {
                const snowAU = +(2.7 * Math.sqrt(Math.max(1e-6, z.lum))).toFixed(3);
                const hzIn = +(0.95 * Math.sqrt(Math.max(1e-6, z.lum))).toFixed(3);
                const hzOut = +(1.67 * Math.sqrt(Math.max(1e-6, z.lum))).toFixed(3);
                return (
                  <div
                    key={zIdx}
                    className="bg-[#0b101a] border border-[#223047] rounded-lg px-3 py-2 text-[11px] font-mono space-y-0.5"
                  >
                    <div className="font-bold text-white">{z.title}</div>
                    <div className="text-slate-400">
                      Stable Disk: <span className="text-sky-300">{z.a_in} AU</span> →{' '}
                      <span className="text-sky-300">{z.a_out} AU</span>
                    </div>
                    <div className="text-slate-400">
                      HZ: <span className="text-emerald-400">{hzIn}–{hzOut} AU</span> • Snow:{' '}
                      <span className="text-cyan-300">{snowAU} AU</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 bg-[#131b29] border-t border-[#2a3852]">
          <div>
            {currentConfig?.enabled && (
              <button
                type="button"
                onClick={() => {
                  onDisableCustomStars();
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 border border-rose-700/70 flex items-center gap-1.5 cursor-pointer transition"
              >
                <Unlock className="w-3.5 h-3.5 text-rose-400" />
                Unlock Stars (Return to Random Star Roll)
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#1c2638] hover:bg-[#253248] text-slate-300 border border-[#2e405e] cursor-pointer transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const finalConfig: CustomStellarConfig = {
                  enabled: true,
                  nStars,
                  trinaryTopology,
                  stars: stars.slice(0, nStars),
                  splits,
                };
                onApplyAndGeneratePlanets(finalConfig, age, feh);
                onClose();
              }}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border border-amber-400 shadow-lg flex items-center gap-1.5 cursor-pointer transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Lock Star Data &amp; Generate Planets
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
