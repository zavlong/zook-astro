import React, { useState, useMemo } from 'react';
import {
  Globe,
  Orbit,
  Wind,
  Droplets,
  Disc,
  Plus,
  Trash2,
  Activity,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  RealisticPlanetBody,
  RealisticBeltBody,
  RealisticPlanetOrBelt,
} from '../../../core/generation/realisticStarGen';
import { RealisticMoon } from '../../../types/astrophysics';
import {
  PLANET_CLASSES,
  ATMOSPHERE_TYPES,
  ATMOSPHERE_PRESETS,
  OCEAN_SOLVENTS,
  HYDROSPHERE_STATES,
  BIOSPHERE_TYPES,
  COMMON_ATMOSPHERIC_GASES,
  isNoOceanSolvent,
  ensureNormalizedGasRecord,
  normalizeGasesTo100,
  computeGreenhouseWarming,
  formatCleanNumber,
  autoFillBlankPlanetFields,
  autoCalculatePlanetPhysics,
  PlanetBlankFieldFlags,
} from '../../../core/generation/systemEditorPhysics';
import { EditorMoonInspector } from './EditorMoonInspector';

export interface EditorPlanetInspectorProps {
  currentBody: RealisticPlanetOrBelt | null | undefined;
  isPlanet: boolean;
  planetBody: RealisticPlanetBody | null;
  beltBody: RealisticBeltBody | null;
  selectedBodyIdx: number;
  selectedMoonIdx: number;
  currentMoon: RealisticMoon | null;
  hostStarMass: number;
  hostStarLum: number;
  onUpdatePlanetField: <K extends keyof RealisticPlanetBody>(
    field: K,
    value: RealisticPlanetBody[K]
  ) => void;
  onReplacePlanet: (updatedPlanet: RealisticPlanetBody) => void;
  onUpdateBeltField: <K extends keyof RealisticBeltBody>(
    field: K,
    value: RealisticBeltBody[K]
  ) => void;
  onUpdateMoonField: <K extends keyof RealisticMoon>(
    field: K,
    value: RealisticMoon[K]
  ) => void;
  onReplaceMoon: (moonIdx: number, updatedMoon: RealisticMoon) => void;
  onAddMoon: () => void;
  onDeleteMoon: (moonIdx: number) => void;
  onSelectMoonIdx: (moonIdx: number) => void;
}

export const EditorPlanetInspector: React.FC<EditorPlanetInspectorProps> = ({
  currentBody,
  isPlanet,
  planetBody,
  beltBody,
  selectedBodyIdx,
  selectedMoonIdx,
  currentMoon,
  hostStarMass,
  hostStarLum,
  onUpdatePlanetField,
  onReplacePlanet,
  onUpdateBeltField,
  onUpdateMoonField,
  onReplaceMoon,
  onAddMoon,
  onDeleteMoon,
  onSelectMoonIdx,
}) => {
  // Local draft string state for numeric inputs
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Gas addition UI state
  const [selectedGasToAdd, setSelectedGasToAdd] = useState<string>('CO2');
  const [customGasCode, setCustomGasCode] = useState<string>('');

  const getPlanetDraft = (field: keyof RealisticPlanetBody): string => {
    if (!planetBody) return '';
    const key = `${selectedBodyIdx}-${String(field)}`;
    if (drafts[key] !== undefined) {
      return drafts[key];
    }
    const val = planetBody[field];
    if (val === undefined || val === null) return '';
    if (typeof val === 'number') {
      return String(formatCleanNumber(val));
    }
    return String(val);
  };

  const isPlanetBlank = (field: keyof RealisticPlanetBody): boolean => {
    const d = getPlanetDraft(field);
    return d.trim() === '';
  };

  const handlePlanetFieldChange = (
    field: keyof RealisticPlanetBody,
    text: string
  ) => {
    const key = `${selectedBodyIdx}-${String(field)}`;
    setDrafts((prev) => ({ ...prev, [key]: text }));

    if (text.trim() === '') {
      return;
    }

    const num = parseFloat(text);
    if (!Number.isNaN(num)) {
      onUpdatePlanetField(field, num as any);
      if (field === 'massEarth') {
        onUpdatePlanetField('massJup', +(num / 317.83).toFixed(5));
      }
    }
  };

  const clearDraftsForBody = () => {
    setDrafts((prev) => {
      const copy = { ...prev };
      Object.keys(copy).forEach((k) => {
        if (k.startsWith(`${selectedBodyIdx}-`)) {
          delete copy[k];
        }
      });
      return copy;
    });
  };

  const handleAutoFillBlanks = () => {
    if (!planetBody) return;
    const blankFlags: PlanetBlankFieldFlags = {
      aBlank: isPlanetBlank('a'),
      eBlank: isPlanetBlank('e'),
      periodBlank: isPlanetBlank('orbitalPeriodDays'),
      incBlank: isPlanetBlank('incDeg'),
      rotBlank: isPlanetBlank('rotationHours'),
      tiltBlank: isPlanetBlank('axialTiltDeg'),
      massBlank: isPlanetBlank('massEarth'),
      radiusBlank: isPlanetBlank('radiusEarth'),
      gravityBlank: isPlanetBlank('gravityG'),
      densityBlank: isPlanetBlank('densityGcm3'),
      rockBlank: isPlanetBlank('rockFrac'),
      iceBlank: isPlanetBlank('iceFrac'),
      gasBlank: isPlanetBlank('gasFrac'),
      pressureBlank: isPlanetBlank('pressureBar'),
      albedoBlank: isPlanetBlank('albedo'),
      teqBlank: isPlanetBlank('T_eq'),
      ghBlank: isPlanetBlank('greenhouseK'),
      tsurfBlank: isPlanetBlank('surfaceTempK'),
    };
    const filled = autoFillBlankPlanetFields(
      planetBody,
      hostStarMass,
      hostStarLum,
      blankFlags
    );
    onReplacePlanet(filled);
    clearDraftsForBody();
  };

  const handleAutoCalcPhysics = () => {
    if (!planetBody) return;
    const computed = autoCalculatePlanetPhysics(
      planetBody,
      hostStarMass,
      hostStarLum
    );
    onReplacePlanet(computed);
    clearDraftsForBody();
  };

  // Atmosphere options with custom fallback
  const atmosphereOptions = useMemo(() => {
    const current = planetBody?.atmosphereType;
    if (current && !ATMOSPHERE_TYPES.includes(current)) {
      return [current, ...ATMOSPHERE_TYPES];
    }
    return ATMOSPHERE_TYPES;
  }, [planetBody?.atmosphereType]);

  const applyAtmospherePreset = (
    type: string,
    preset: {
      pressureBar: number;
      albedo?: number;
      gases: Record<string, number>;
    }
  ) => {
    if (!planetBody) return;
    const albedo =
      preset.albedo !== undefined ? preset.albedo : planetBody.albedo ?? 0.3;
    const Teq = Math.round(
      278.5 *
        (Math.pow(Math.max(1e-5, hostStarLum), 0.25) /
          Math.sqrt(Math.max(0.01, planetBody.a || 1))) *
        Math.pow(1 - albedo, 0.25)
    );
    const gh = computeGreenhouseWarming(
      preset.pressureBar,
      preset.gases,
      Teq,
      planetBody.gravityG || 1.0
    );
    const tSurf = Math.max(3, +(Teq + gh).toFixed(1));

    onReplacePlanet({
      ...planetBody,
      atmosphereType: type,
      pressureBar: preset.pressureBar,
      albedo,
      gases: { ...preset.gases },
      T_eq: Teq,
      greenhouseK: gh,
      surfaceTempK: tSurf,
    });
    clearDraftsForBody();
  };

  const handleAtmosphereTypeChange = (newType: string) => {
    if (!planetBody) return;
    if (newType === 'Airless Vacuum') {
      onReplacePlanet({
        ...planetBody,
        atmosphereType: newType,
        pressureBar: 0,
        greenhouseK: 0,
        surfaceTempK: planetBody.T_eq,
        gases: {},
      });
      clearDraftsForBody();
      return;
    }

    const preset = ATMOSPHERE_PRESETS[newType];
    const curGases = ensureNormalizedGasRecord(planetBody.gases);
    const isZeroPressure = (planetBody.pressureBar ?? 0) === 0;
    const isZeroGases = Object.keys(curGases).length === 0;

    if (preset && (isZeroPressure || isZeroGases)) {
      applyAtmospherePreset(newType, preset);
    } else {
      onUpdatePlanetField('atmosphereType', newType);
    }
  };

  const handleLoadCurrentPreset = () => {
    if (!planetBody) return;
    const preset = ATMOSPHERE_PRESETS[planetBody.atmosphereType];
    if (preset) {
      applyAtmospherePreset(planetBody.atmosphereType, preset);
    }
  };

  // Gas helpers
  const normGases = useMemo(() => {
    return ensureNormalizedGasRecord(planetBody?.gases);
  }, [planetBody?.gases]);

  const totalGasPct = useMemo(() => {
    return Object.values(normGases).reduce((sum, v) => sum + v, 0) * 100;
  }, [normGases]);

  const handleGasPctChange = (code: string, newPct: number) => {
    if (!planetBody) return;
    const updated = { ...normGases, [code]: +(newPct / 100).toFixed(5) };
    onUpdatePlanetField('gases', updated);
  };

  const handleDeleteGas = (code: string) => {
    if (!planetBody) return;
    const updated = { ...normGases };
    delete updated[code];
    onUpdatePlanetField('gases', updated);
  };

  const handleAddGas = () => {
    if (!planetBody) return;
    const code =
      selectedGasToAdd === 'CUSTOM'
        ? customGasCode.trim()
        : selectedGasToAdd.trim();
    if (!code) return;
    const updated = { ...normGases, [code]: 0.01 };
    onUpdatePlanetField('gases', updated);
    if (selectedGasToAdd === 'CUSTOM') {
      setCustomGasCode('');
      setSelectedGasToAdd('CO2');
    }
  };

  const handleNormalizeGases = () => {
    if (!planetBody) return;
    const norm = normalizeGasesTo100(planetBody.gases);
    onUpdatePlanetField('gases', norm);
  };

  const handleRecalcGreenhouse = () => {
    if (!planetBody) return;
    const gh = computeGreenhouseWarming(
      planetBody.pressureBar,
      planetBody.gases,
      planetBody.T_eq,
      planetBody.gravityG
    );
    const tSurf = Math.max(3, +(planetBody.T_eq + gh).toFixed(1));
    onUpdatePlanetField('greenhouseK', gh);
    onUpdatePlanetField('surfaceTempK', tSurf);
    clearDraftsForBody();
  };

  // Hydrosphere solvent helper
  const currentSolvent = useMemo(() => {
    if (
      !planetBody?.hydrosphere ||
      isNoOceanSolvent(planetBody.hydrosphere.solvent) ||
      ((planetBody.hydrosphere.coveragePct ?? 0) === 0 &&
        (planetBody.hydrosphere.liqKm ?? 0) === 0)
    ) {
      return 'None (No Ocean / Dry)';
    }
    return planetBody.hydrosphere.solvent || 'Water (H2O)';
  }, [planetBody?.hydrosphere]);

  const handleSolventChange = (solvent: string) => {
    if (!planetBody) return;
    if (isNoOceanSolvent(solvent)) {
      if (
        !planetBody.hydrosphere?.biosphere ||
        planetBody.hydrosphere.biosphere === 'Barren / Sterile'
      ) {
        onUpdatePlanetField('hydrosphere', null);
      } else {
        onUpdatePlanetField('hydrosphere', {
          ...planetBody.hydrosphere,
          solvent: 'None',
          coveragePct: 0,
          liqKm: 0,
          scKm: 0,
          state: 'Dry / Desiccated',
        });
      }
    } else {
      const cur = planetBody.hydrosphere || {
        state: 'Liquid Oceans',
        coveragePct: 70,
        liqKm: 3.5,
        scKm: 0,
        iceKm: 0,
        siKm: 0,
      };
      const cov = (cur.coveragePct ?? 0) > 0 ? cur.coveragePct : 70;
      const depth = (cur.liqKm ?? 0) > 0 ? cur.liqKm : 3.5;
      onUpdatePlanetField('hydrosphere', {
        ...cur,
        solvent,
        state: cur.state || 'Liquid Oceans',
        coveragePct: cov,
        liqKm: depth,
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-950/50">
      {/* ------------------------------------------------------------- */}
      {/* PLANET INSPECTOR                                              */}
      {/* ------------------------------------------------------------- */}
      {currentBody && isPlanet && planetBody && (
        <>
          {/* Header Card */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-slate-900/80 via-slate-950 to-slate-900/80 border border-slate-800/80">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-3xl shadow-inner flex-shrink-0">
                🪐
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={planetBody.role || ''}
                    onChange={(e) => onUpdatePlanetField('role', e.target.value)}
                    className="text-lg font-bold font-mono text-white bg-transparent border-b border-dashed border-cyan-500/40 hover:border-cyan-400 focus:border-cyan-400 focus:outline-none transition px-0.5 truncate"
                    placeholder="Planet Name"
                  />
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-700/60 text-cyan-300 flex-shrink-0">
                    Orbit #{selectedBodyIdx + 1}
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1 truncate">
                  {planetBody.a} AU &bull; {planetBody.orbitalPeriodDays} Days &bull; {planetBody.surfaceTempK} K
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleAutoFillBlanks}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/80 border border-amber-500/60 hover:bg-amber-900 text-amber-200 text-xs font-mono font-semibold transition shadow-sm"
                title="Fill ONLY blank/missing planet fields from astrophysics laws"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Auto-Fill Blanks</span>
              </button>

              <button
                onClick={handleAutoCalcPhysics}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/80 border border-indigo-700/60 hover:bg-indigo-900 text-indigo-200 text-xs font-mono font-semibold transition shadow-sm"
                title="Auto-calculate gravity, density, period, equilibrium temp, and greenhouse warming"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Auto-Calc Physics</span>
              </button>

              <button
                onClick={onAddMoon}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-950/80 border border-teal-700/60 hover:bg-teal-900 text-teal-200 text-xs font-mono font-semibold transition"
                title="Add Moon to this planet"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Moon</span>
              </button>
            </div>
          </div>

          {/* Section: Orbital Mechanics */}
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
              <Orbit className="w-4 h-4" />
              <span>Orbital Mechanics</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-mono text-slate-400">Semi-Major Axis (AU)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('a')}
                  onChange={(e) => handlePlanetFieldChange('a', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('a')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('a') ? 'Blank — click Auto-Fill' : '1.0'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Eccentricity (e)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('e')}
                  onChange={(e) => handlePlanetFieldChange('e', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('e')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('e') ? 'Blank — click Auto-Fill' : '0.02'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Orbital Period (Days)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('orbitalPeriodDays')}
                  onChange={(e) => handlePlanetFieldChange('orbitalPeriodDays', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('orbitalPeriodDays')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('orbitalPeriodDays') ? 'Blank — click Auto-Fill' : '365.2'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Inclination (Deg)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('incDeg')}
                  onChange={(e) => handlePlanetFieldChange('incDeg', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('incDeg')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('incDeg') ? 'Blank — click Auto-Fill' : '1.2'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Rotation (Hours)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('rotationHours')}
                  onChange={(e) => handlePlanetFieldChange('rotationHours', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('rotationHours')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('rotationHours') ? 'Blank — click Auto-Fill' : '24.0'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Axial Tilt (Deg)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('axialTiltDeg')}
                  onChange={(e) => handlePlanetFieldChange('axialTiltDeg', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('axialTiltDeg')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('axialTiltDeg') ? 'Blank — click Auto-Fill' : '23.4'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Spin State</label>
                <select
                  value={planetBody.spinState || 'Prograde'}
                  onChange={(e) => onUpdatePlanetField('spinState', e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:border-cyan-400 focus:outline-none"
                >
                  <option value="Prograde">Normal Prograde</option>
                  <option value="Retrograde">Retrograde</option>
                  <option value="Tidally Locked">Tidally Locked</option>
                  <option value="3:2 Spin-Orbit">3:2 Spin-Orbit Resonance</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section: Physical Size & Mass */}
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-blue-400">
              <Globe className="w-4 h-4" />
              <span>Mass, Size & Classification</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] font-mono text-slate-400">Planetary Class</label>
                <select
                  value={planetBody.planetClass}
                  onChange={(e) => onUpdatePlanetField('planetClass', e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:border-cyan-400 focus:outline-none"
                >
                  {PLANET_CLASSES.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Mass (M⊕)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('massEarth')}
                  onChange={(e) => handlePlanetFieldChange('massEarth', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('massEarth')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('massEarth') ? 'Blank — click Auto-Fill' : '1.0'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Radius (R⊕)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('radiusEarth')}
                  onChange={(e) => handlePlanetFieldChange('radiusEarth', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('radiusEarth')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('radiusEarth') ? 'Blank — click Auto-Fill' : '1.0'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Surface Gravity (g)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('gravityG')}
                  onChange={(e) => handlePlanetFieldChange('gravityG', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('gravityG')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('gravityG') ? 'Blank — click Auto-Fill' : '1.0'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Density (g/cm³)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('densityGcm3')}
                  onChange={(e) => handlePlanetFieldChange('densityGcm3', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('densityGcm3')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('densityGcm3') ? 'Blank — click Auto-Fill' : '5.51'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Rock Fraction (0-1)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('rockFrac')}
                  onChange={(e) => handlePlanetFieldChange('rockFrac', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('rockFrac')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('rockFrac') ? 'Blank — click Auto-Fill' : '0.7'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Ice Fraction (0-1)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('iceFrac')}
                  onChange={(e) => handlePlanetFieldChange('iceFrac', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('iceFrac')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('iceFrac') ? 'Blank — click Auto-Fill' : '0.3'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Gas Fraction (0-1)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('gasFrac')}
                  onChange={(e) => handlePlanetFieldChange('gasFrac', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('gasFrac')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('gasFrac') ? 'Blank — click Auto-Fill' : '0.0'}
                />
              </div>
            </div>
          </div>

          {/* Section: Atmosphere & Climate */}
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-4">
            <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-teal-400">
              <Wind className="w-4 h-4" />
              <span>Atmosphere & Climate</span>
            </div>

            {/* Atmosphere Type & Preset Button */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="text-[11px] font-mono text-slate-400">Atmosphere Type</label>
                <select
                  value={planetBody.atmosphereType}
                  onChange={(e) => handleAtmosphereTypeChange(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:border-cyan-400 focus:outline-none"
                >
                  {atmosphereOptions.map((atm) => (
                    <option key={atm} value={atm}>
                      {atm}
                    </option>
                  ))}
                </select>
              </div>

              {ATMOSPHERE_PRESETS[planetBody.atmosphereType] && (
                <button
                  onClick={handleLoadCurrentPreset}
                  className="px-3 py-1.5 rounded-lg bg-teal-950/80 border border-teal-700/60 hover:bg-teal-900 text-teal-200 text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition"
                  title="Overwrite gas composition & surface pressure from this preset archetype"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Load Preset Gases & Pressure</span>
                </button>
              )}
            </div>

            {/* Numerical Atmospheric Values */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="text-[11px] font-mono text-slate-400">Surface Pressure (bar)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('pressureBar')}
                  onChange={(e) => handlePlanetFieldChange('pressureBar', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('pressureBar')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('pressureBar') ? 'Blank — click Auto-Fill' : '1.013'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Albedo (0-1)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('albedo')}
                  onChange={(e) => handlePlanetFieldChange('albedo', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('albedo')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('albedo') ? 'Blank — click Auto-Fill' : '0.30'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Equilibrium Temp (K)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('T_eq')}
                  onChange={(e) => handlePlanetFieldChange('T_eq', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('T_eq')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('T_eq') ? 'Blank — click Auto-Fill' : '255'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Greenhouse Warming (K)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('greenhouseK')}
                  onChange={(e) => handlePlanetFieldChange('greenhouseK', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('greenhouseK')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('greenhouseK') ? 'Blank — click Auto-Fill' : '33'}
                />
              </div>
              <div>
                <label className="text-[11px] font-mono text-slate-400">Surface Temp (K)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getPlanetDraft('surfaceTempK')}
                  onChange={(e) => handlePlanetFieldChange('surfaceTempK', e.target.value)}
                  className={`w-full mt-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:border-cyan-400 focus:outline-none transition ${
                    isPlanetBlank('surfaceTempK')
                      ? 'bg-slate-950 border border-amber-500/60 text-amber-200 placeholder:text-amber-500/70'
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                  placeholder={isPlanetBlank('surfaceTempK') ? 'Blank — click Auto-Fill' : '288'}
                />
              </div>
            </div>

            {/* Gas Composition Subsection */}
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-teal-300">
                  Atmospheric Gas Fractions & Composition
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      Math.abs(totalGasPct - 100) < 0.2
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/60'
                        : 'bg-amber-950/80 text-amber-300 border-amber-600/60'
                    }`}
                  >
                    Total: {totalGasPct.toFixed(2)}%
                  </span>
                  <button
                    onClick={handleNormalizeGases}
                    className="px-2 py-1 rounded bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 text-[10px] font-mono font-semibold transition"
                    title="Scale all gas fractions so they sum to 100%"
                  >
                    Normalize to 100%
                  </button>
                  <button
                    onClick={handleRecalcGreenhouse}
                    className="px-2 py-1 rounded bg-teal-950 border border-teal-700 hover:bg-teal-900 text-teal-200 text-[10px] font-mono font-semibold transition"
                    title="Recalculate greenhouse warming from current gas fractions and pressure"
                  >
                    Recalc Greenhouse
                  </button>
                </div>
              </div>

              {/* Editable gas rows */}
              {Object.keys(normGases).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(normGases).map(([code, frac]) => {
                    const pct = +(frac * 100).toFixed(2);
                    const hit = COMMON_ATMOSPHERIC_GASES.find((g) => g.code === code);
                    const displayName = hit ? hit.name : code;

                    return (
                      <div
                        key={code}
                        className="flex items-center gap-3 p-2 rounded-lg bg-slate-900/60 border border-slate-800/80"
                      >
                        <span className="w-48 text-xs font-mono text-slate-200 truncate" title={displayName}>
                          {displayName}
                        </span>

                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="0.1"
                          value={pct}
                          onChange={(e) => handleGasPctChange(code, parseFloat(e.target.value) || 0)}
                          className="flex-1 accent-teal-400 cursor-pointer"
                        />

                        <div className="flex items-center gap-1 w-24">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={pct}
                            onChange={(e) => handleGasPctChange(code, parseFloat(e.target.value) || 0)}
                            className="w-16 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-right text-xs font-mono text-white focus:outline-none"
                          />
                          <span className="text-xs font-mono text-slate-400">%</span>
                        </div>

                        <button
                          onClick={() => handleDeleteGas(code)}
                          className="p-1 rounded text-red-400 hover:bg-red-950/50 transition"
                          title={`Remove ${code}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 text-center text-xs font-mono text-slate-500">
                  Airless / vacuum exosphere. Add gases below to build an atmospheric column.
                </div>
              )}

              {/* Add Gas controls */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/60">
                <select
                  value={selectedGasToAdd}
                  onChange={(e) => setSelectedGasToAdd(e.target.value)}
                  className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-white focus:outline-none"
                >
                  {COMMON_ATMOSPHERIC_GASES.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.name}
                    </option>
                  ))}
                  <option value="CUSTOM">Custom Formula...</option>
                </select>

                {selectedGasToAdd === 'CUSTOM' && (
                  <input
                    type="text"
                    placeholder="Formula (e.g. He3)"
                    value={customGasCode}
                    onChange={(e) => setCustomGasCode(e.target.value)}
                    className="w-28 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-white focus:outline-none"
                  />
                )}

                <button
                  onClick={handleAddGas}
                  className="px-3 py-1 rounded bg-teal-950/80 border border-teal-700/60 hover:bg-teal-900 text-teal-200 text-xs font-mono font-semibold flex items-center gap-1 transition"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Gas</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section: Hydrosphere & Biosphere */}
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
              <Droplets className="w-4 h-4" />
              <span>Hydrosphere & Biosphere (Xenobiology)</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-mono text-slate-400">Ocean Solvent</label>
                <select
                  value={currentSolvent}
                  onChange={(e) => handleSolventChange(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:border-cyan-400 focus:outline-none"
                >
                  {OCEAN_SOLVENTS.map((sol) => (
                    <option key={sol} value={sol}>
                      {sol}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400">Liquid Coverage (%)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={planetBody.hydrosphere?.coveragePct ?? 0}
                  onChange={(e) => {
                    const cov = parseFloat(e.target.value) || 0;
                    const cur = planetBody.hydrosphere || {
                      state: 'Liquid Oceans',
                      solvent: 'Water (H2O)',
                      liqKm: 3.5,
                      scKm: 0,
                      iceKm: 0,
                      siKm: 0,
                    };
                    onUpdatePlanetField('hydrosphere', { ...cur, coveragePct: cov });
                  }}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400">Mean Ocean Depth (km)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={planetBody.hydrosphere?.liqKm ?? 0}
                  onChange={(e) => {
                    const d = parseFloat(e.target.value) || 0;
                    const cur = planetBody.hydrosphere || {
                      state: 'Liquid Oceans',
                      solvent: 'Water (H2O)',
                      coveragePct: 70,
                      scKm: 0,
                      iceKm: 0,
                      siKm: 0,
                    };
                    onUpdatePlanetField('hydrosphere', { ...cur, liqKm: d });
                  }}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400">Surface Ice Sheet (km)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={planetBody.hydrosphere?.iceKm ?? 0}
                  onChange={(e) => {
                    const ice = parseFloat(e.target.value) || 0;
                    const cur = planetBody.hydrosphere || {
                      state: 'Liquid Oceans',
                      solvent: 'Water (H2O)',
                      coveragePct: 70,
                      liqKm: 3.5,
                      scKm: 0,
                      siKm: 0,
                    };
                    onUpdatePlanetField('hydrosphere', { ...cur, iceKm: ice });
                  }}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400">Subsurface Ocean (km)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={planetBody.hydrosphere?.siKm ?? 0}
                  onChange={(e) => {
                    const si = parseFloat(e.target.value) || 0;
                    const cur = planetBody.hydrosphere || {
                      state: 'Liquid Oceans',
                      solvent: 'Water (H2O)',
                      coveragePct: 70,
                      liqKm: 3.5,
                      scKm: 0,
                      iceKm: 0,
                    };
                    onUpdatePlanetField('hydrosphere', { ...cur, siKm: si });
                  }}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="col-span-2">
                <label className="text-[11px] font-mono text-slate-400">Hydrosphere State</label>
                <select
                  value={planetBody.hydrosphere?.state || 'Dry / Desiccated'}
                  onChange={(e) => {
                    const state = e.target.value;
                    const cur = planetBody.hydrosphere || {
                      solvent: 'None',
                      coveragePct: 0,
                      liqKm: 0,
                      scKm: 0,
                      iceKm: 0,
                      siKm: 0,
                    };
                    onUpdatePlanetField('hydrosphere', { ...cur, state });
                  }}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:border-cyan-400 focus:outline-none"
                >
                  {HYDROSPHERE_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400">Biosphere Archetype</label>
                <select
                  value={planetBody.hydrosphere?.biosphere || 'Barren / Sterile'}
                  onChange={(e) => {
                    const bio = e.target.value;
                    const cur = planetBody.hydrosphere || {
                      state: 'Liquid Oceans',
                      solvent: 'Water (H2O)',
                      coveragePct: 50,
                      liqKm: 2,
                      scKm: 0,
                      iceKm: 0,
                      siKm: 0,
                    };
                    onUpdatePlanetField('hydrosphere', {
                      ...cur,
                      biosphere: bio === 'Barren / Sterile' ? null : bio,
                    });
                  }}
                  className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:border-cyan-400 focus:outline-none"
                >
                  {BIOSPHERE_TYPES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Moons List & Inspector */}
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                <Disc className="w-4 h-4" />
                <span>Natural Satellites & Moons ({planetBody.moons?.length || 0})</span>
              </div>
              <button
                onClick={onAddMoon}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-950/80 border border-amber-700/60 hover:bg-amber-900 text-amber-200 text-[10px] font-mono font-semibold transition"
              >
                <Plus className="w-3 h-3" />
                <span>Add Moon</span>
              </button>
            </div>

            {planetBody.moons && planetBody.moons.length > 0 ? (
              <div className="space-y-3">
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  {planetBody.moons.map((m, mIdx) => (
                    <button
                      key={`m-tab-${mIdx}`}
                      onClick={() => onSelectMoonIdx(mIdx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition flex-shrink-0 flex items-center gap-1.5 border ${
                        selectedMoonIdx === mIdx
                          ? 'bg-amber-600 border-amber-400 text-white shadow-md shadow-amber-600/30'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span>🌙</span>
                      <span>{m.name || `Moon ${mIdx + 1}`}</span>
                    </button>
                  ))}
                </div>

                {currentMoon && selectedMoonIdx >= 0 && (
                  <EditorMoonInspector
                    currentMoon={currentMoon}
                    planetBody={planetBody}
                    hostStarLum={hostStarLum}
                    selectedMoonIdx={selectedMoonIdx}
                    onUpdateMoonField={onUpdateMoonField}
                    onReplaceMoon={onReplaceMoon}
                    onDeleteMoon={onDeleteMoon}
                  />
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-center text-xs font-mono text-slate-500">
                No natural satellites orbiting this world. Click &ldquo;Add Moon&rdquo; to place one.
              </div>
            )}
          </div>
        </>
      )}

      {/* ------------------------------------------------------------- */}
      {/* BELT INSPECTOR                                                */}
      {/* ------------------------------------------------------------- */}
      {currentBody && !isPlanet && beltBody && (
        <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-2xl">
              🪨
            </div>
            <div>
              <input
                type="text"
                value={beltBody.role || 'Asteroid Belt'}
                onChange={(e) => onUpdateBeltField('role', e.target.value)}
                className="text-base font-bold font-mono text-white bg-transparent border-b border-dashed border-slate-600 focus:outline-none px-0.5"
              />
              <div className="text-xs font-mono text-slate-400 mt-1">
                Circumstellar Debris Belt
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-mono text-slate-400">Semi-Major Axis (AU)</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                value={beltBody.a}
                onChange={(e) => onUpdateBeltField('a', parseFloat(e.target.value) || 2.5)}
                className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-slate-400">Belt Width (AU)</label>
              <input
                type="number"
                step="0.05"
                min="0.01"
                value={beltBody.beltWidth}
                onChange={(e) => onUpdateBeltField('beltWidth', parseFloat(e.target.value) || 0.5)}
                className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-slate-400">Total Mass (M⊕)</label>
              <input
                type="number"
                step="0.0005"
                min="0.00001"
                value={beltBody.massEarth}
                onChange={(e) => onUpdateBeltField('massEarth', parseFloat(e.target.value) || 0.001)}
                className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-slate-400">Inclination (Deg)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="90"
                value={beltBody.incDeg}
                onChange={(e) => onUpdateBeltField('incDeg', parseFloat(e.target.value) || 0)}
                className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
