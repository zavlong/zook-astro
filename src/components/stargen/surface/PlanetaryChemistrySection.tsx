import React from 'react';
import { Layers, FlaskConical, Flame, Mountain, Activity } from 'lucide-react';
import { RealisticPlanetBody } from '../../../core/generation/realisticStarGen';
import { RealisticMoon } from '../../../types/astrophysics';
import { PlanetarySurfaceModel, generatePlanetarySurfaceModel } from './surfaceGenMath';

export type GeoActivityLevel = 'None' | 'Low' | 'Moderate' | 'High' | 'Extreme';

export interface SurfaceChemicalRow {
  name: string;
  formula: string;
  pct: number;
  color: string;
}

export interface InteriorLayerRow {
  layerName: string;
  depthRangeKm: string;
  massPct: number;
  composition: string;
  state: string;
  color: string;
}

export interface BulkElementItem {
  symbol: string;
  name: string;
  pct: number;
  color: string;
}

export interface PlanetaryChemistryProfile {
  surfaceTitle: string;
  coreMassPct: number;
  coreTempK: number;
  volcanismLevel: GeoActivityLevel;
  volcanismDesc: string;
  tectonicsLevel: GeoActivityLevel;
  tectonicsDesc: string;
  surfaceRows: SurfaceChemicalRow[];
  interiorRows: InteriorLayerRow[];
  bulkElements: BulkElementItem[];
}

function seededNoise(seed: number, offset: number): number {
  let h = Math.imul(seed ^ (offset * 374761393), 668265263);
  h = (h ^ (h >>> 13)) * 1274126177;
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) - 0.5; // [-0.5, 0.5]
}

function normalizeRows(rows: SurfaceChemicalRow[]): SurfaceChemicalRow[] {
  const positive = rows.map((r) => ({ ...r, pct: Math.max(0.5, r.pct) }));
  const sum = positive.reduce((acc, r) => acc + r.pct, 0) || 1;
  const scaled = positive.map((r) => ({
    ...r,
    pct: +(r.pct * (100 / sum)).toFixed(1),
  }));
  const diff = +(100 - scaled.reduce((acc, r) => acc + r.pct, 0)).toFixed(1);
  if (scaled.length > 0 && Math.abs(diff) >= 0.1) {
    scaled[0].pct = +(scaled[0].pct + diff).toFixed(1);
  }
  return scaled.sort((a, b) => b.pct - a.pct);
}

function normalizeElements(items: BulkElementItem[]): BulkElementItem[] {
  const positive = items.map((r) => ({ ...r, pct: Math.max(0.5, r.pct) }));
  const sum = positive.reduce((acc, r) => acc + r.pct, 0) || 1;
  const scaled = positive.map((r) => ({
    ...r,
    pct: +(r.pct * (100 / sum)).toFixed(1),
  }));
  const diff = +(100 - scaled.reduce((acc, r) => acc + r.pct, 0)).toFixed(1);
  if (scaled.length > 0 && Math.abs(diff) >= 0.1) {
    scaled[0].pct = +(scaled[0].pct + diff).toFixed(1);
  }
  return scaled.sort((a, b) => b.pct - a.pct);
}

export function derivePlanetaryChemistryProfile(
  planet: RealisticPlanetBody,
  moon?: RealisticMoon | null,
  model?: PlanetarySurfaceModel | null
): PlanetaryChemistryProfile {
  const surfModel = model || generatePlanetarySurfaceModel(planet, moon);
  const isMoon = Boolean(moon);
  const activeBody = moon || planet;
  const seed = surfModel.seed || 1337;

  const rockFrac = Math.max(0, Math.min(1, activeBody.rockFrac ?? 1));
  const iceFrac = Math.max(0, Math.min(1, activeBody.iceFrac ?? 0));
  const gasFrac = Math.max(0, Math.min(1, activeBody.gasFrac ?? 0));
  const density = activeBody.densityGcm3 ?? 5.0;
  const massEarth = activeBody.massEarth || (isMoon && moon ? moon.massLunar * 0.0123 : 1.0);
  const radiusKm = isMoon && moon ? moon.radiusKm : Math.round((planet.radiusEarth || 1) * 6371);
  const gravityG = Math.max(0.01, activeBody.gravityG || 0.2);
  const Tsurf = activeBody.surfaceTempK || activeBody.T_eq || 288;
  const pBar = activeBody.pressureBar ?? 0;
  const hydro = activeBody.hydrosphere;
  const mag = activeBody.magneticField;
  const tidalW = (activeBody as { tidalW?: number }).tidalW ?? 0;
  const bodyClassLower = (isMoon ? moon?.moonClass || '' : planet.planetClass || '').toLowerCase();

  const n1 = seededNoise(seed, 1);
  const n2 = seededNoise(seed, 2);
  const n3 = seededNoise(seed, 3);
  const n4 = seededNoise(seed, 4);

  const coreTempK = Math.round(
    surfModel.isGasGiant
      ? Math.min(45000, 14000 + Math.pow(massEarth, 0.5) * 2600 + Tsurf * 1.4)
      : Math.max(
          Tsurf + 250,
          Math.min(12000, 1200 + Math.pow(massEarth, 0.44) * 4000 + tidalW * 1500 + (density > 5.5 ? 600 : 0))
        )
  );

  // 1. GAS GIANTS & ICE GIANTS
  if (surfModel.isGasGiant) {
    const isIceGiant = surfModel.isIceGiant;
    const sClass = !isMoon
      ? planet.sudarskyClass ||
        (Tsurf >= 1400 ? 'V' : Tsurf >= 900 ? 'IV' : Tsurf >= 350 ? 'III' : Tsurf >= 150 ? 'II' : 'I')
      : 'I';

    let surfaceRows: SurfaceChemicalRow[] = [];
    if (sClass === 'V' || Tsurf >= 1200) {
      surfaceRows = normalizeRows([
        { name: 'Hydrogen & Helium Gas', formula: 'H₂ / He', pct: 80 + n1 * 3, color: '#f97316' },
        { name: 'Vaporized Rock Clouds', formula: 'SiO₂ / MgO', pct: 11 + n2 * 2, color: '#fb923c' },
        { name: 'Molten Iron Droplets', formula: 'Fe', pct: 6 + n3, color: '#dc2626' },
        { name: 'Carbon Monoxide & Metal Oxides', formula: 'CO / TiO', pct: 3 + n4, color: '#fde047' },
      ]);
    } else if (sClass === 'IV' || Tsurf >= 750) {
      surfaceRows = normalizeRows([
        { name: 'Hydrogen & Helium Gas', formula: 'H₂ / He', pct: 83 + n1 * 3, color: '#818cf8' },
        { name: 'Sodium & Potassium Vapor', formula: 'Na / K', pct: 8 + n2 * 1.5, color: '#a855f7' },
        { name: 'Water Vapor & Carbon Monoxide', formula: 'H₂O / CO', pct: 6 + n3, color: '#60a5fa' },
        { name: 'Sulfide Clouds', formula: 'Na₂S', pct: 3 + n4, color: '#c084fc' },
      ]);
    } else if (isIceGiant) {
      surfaceRows = normalizeRows([
        { name: 'Hydrogen & Helium Gas', formula: 'H₂ / He', pct: 77 + n1 * 3, color: '#38bdf8' },
        { name: 'Methane Clouds & Gas', formula: 'CH₄', pct: 13 + n2 * 2, color: '#06b6d4' },
        { name: 'Ammonia & Sulfide Ice Clouds', formula: 'NH₃ / H₂S', pct: 7 + n3, color: '#bae6fd' },
        { name: 'Ethane & Hydrocarbon Haze', formula: 'C₂H₆', pct: 3 + n4, color: '#e0f2fe' },
      ]);
    } else if (sClass === 'II' || (Tsurf >= 150 && Tsurf < 350)) {
      surfaceRows = normalizeRows([
        { name: 'Hydrogen & Helium Gas', formula: 'H₂ / He', pct: 81 + n1 * 3, color: '#60a5fa' },
        { name: 'Water Clouds & Ice', formula: 'H₂O', pct: 11 + n2 * 2, color: '#f8fafc' },
        { name: 'Ammonia Clouds', formula: 'NH₃', pct: 5 + n3, color: '#cbd5e1' },
        { name: 'Methane Gas', formula: 'CH₄', pct: 3 + n4, color: '#93c5fd' },
      ]);
    } else {
      surfaceRows = normalizeRows([
        { name: 'Hydrogen & Helium Gas', formula: 'H₂ / He', pct: 82 + n1 * 3, color: '#f59e0b' },
        { name: 'Ammonia Ice Clouds', formula: 'NH₃', pct: 9 + n2 * 1.5, color: '#fef3c7' },
        { name: 'Sulfur & Ammonium Clouds', formula: 'NH₄SH / S', pct: 5 + n3, color: '#d97706' },
        { name: 'Deep Water Clouds', formula: 'H₂O', pct: 4 + n4, color: '#bae6fd' },
      ]);
    }

    const corePct = +(rockFrac * 100).toFixed(1);
    const mantlePct = +(iceFrac * 100).toFixed(1);
    const envPct = +(Math.max(1, 100 - corePct - mantlePct)).toFixed(1);

    const d1 = Math.round(radiusKm * (isIceGiant ? 0.2 : 0.24));
    const d2 = Math.round(radiusKm * (isIceGiant ? 0.76 : 0.84));

    const interiorRows: InteriorLayerRow[] = isIceGiant
      ? [
          {
            layerName: 'Upper Atmosphere',
            depthRangeKm: `0 – ${d1.toLocaleString()} km`,
            massPct: envPct,
            composition: 'Hydrogen, Helium & Methane (H₂, He, CH₄)',
            state: 'Dense Gas',
            color: '#38bdf8',
          },
          {
            layerName: 'Icy Fluid Mantle',
            depthRangeKm: `${d1.toLocaleString()} – ${d2.toLocaleString()} km`,
            massPct: mantlePct,
            composition: 'Hot Compressed Water, Ammonia & Methane (H₂O, NH₃, CH₄)',
            state: 'High-Pressure Fluid',
            color: '#0284c7',
          },
          {
            layerName: 'Rocky & Metal Core',
            depthRangeKm: `${d2.toLocaleString()} – ${radiusKm.toLocaleString()} km`,
            massPct: corePct,
            composition: 'Silicate Rock, Iron & Nickel (SiO₂, Fe, Ni)',
            state: 'Solid Rock & Metal',
            color: '#64748b',
          },
        ]
      : [
          {
            layerName: 'Outer Gas Envelope',
            depthRangeKm: `0 – ${d1.toLocaleString()} km`,
            massPct: +(envPct * 0.25).toFixed(1),
            composition: 'Hydrogen & Helium Gas (H₂, He)',
            state: 'Dense Gas',
            color: '#f59e0b',
          },
          {
            layerName: 'Metallic Hydrogen Layer',
            depthRangeKm: `${d1.toLocaleString()} – ${d2.toLocaleString()} km`,
            massPct: +(envPct * 0.75 + mantlePct * 0.5).toFixed(1),
            composition: 'Liquid Metallic Hydrogen & Helium (H, He)',
            state: 'Liquid Metal',
            color: '#fbbf24',
          },
          {
            layerName: 'Central Core',
            depthRangeKm: `${d2.toLocaleString()} – ${radiusKm.toLocaleString()} km`,
            massPct: +(corePct + mantlePct * 0.5).toFixed(1),
            composition: 'Rock, Iron & Heavy Ices (SiO₂, Fe, H₂O)',
            state: 'Dense Solid Core',
            color: '#94a3b8',
          },
        ];

    const bulkElements = normalizeElements([
      { symbol: 'H', name: 'Hydrogen', pct: gasFrac * 74 + iceFrac * 11, color: '#38bdf8' },
      { symbol: 'He', name: 'Helium', pct: gasFrac * 24, color: '#fbbf24' },
      { symbol: 'O', name: 'Oxygen', pct: iceFrac * 52 + rockFrac * 32, color: '#60a5fa' },
      { symbol: 'C', name: 'Carbon', pct: iceFrac * 18 + gasFrac * 1.1, color: '#a855f7' },
      { symbol: 'N', name: 'Nitrogen', pct: iceFrac * 11 + gasFrac * 0.5, color: '#818cf8' },
      { symbol: 'Si/Fe', name: 'Rock & Iron', pct: rockFrac * 68 + iceFrac * 8, color: '#94a3b8' },
    ]);

    return {
      surfaceTitle: 'Upper Cloud & Atmosphere Composition',
      coreMassPct: corePct,
      coreTempK,
      volcanismLevel: 'None',
      volcanismDesc: 'No solid surface (convective gas envelope)',
      tectonicsLevel: 'None',
      tectonicsDesc: 'No solid crust (fluid interior)',
      surfaceRows,
      interiorRows,
      bulkElements,
    };
  }

  // 2. SOLID & SUPERCRITICAL WORLDS
  const compLabel = surfModel.compositionPalette.compositionLabel;
  const isSulfur = compLabel.includes('Sulfur Allotrope') || bodyClassLower.includes('io');
  const isIron = compLabel.includes('Iron-Rich') || bodyClassLower.includes('iron');
  const isCarbon = compLabel.includes('Carbonaceous') || bodyClassLower.includes('carbon');
  const isTholin = compLabel.includes('Tholin') || surfModel.seaPalette.solventKey === 'CH4-C2H6';
  const isFerric = compLabel.includes('Ferric') || bodyClassLower.includes('mars');
  const isVenusian = compLabel.includes('Sulfur-Weathered') || bodyClassLower.includes('venus');

  let surfaceRows: SurfaceChemicalRow[] = [];

  if (surfModel.isSupercritical) {
    surfaceRows = normalizeRows([
      { name: 'Supercritical Water', formula: 'H₂O', pct: 82 + n1 * 3, color: '#3b82f6' },
      { name: 'Water Clouds', formula: 'H₂O', pct: 10 + n2 * 2, color: '#f8fafc' },
      { name: 'Dissolved Carbon Dioxide', formula: 'CO₂', pct: 5 + n3, color: '#38bdf8' },
      { name: 'Dissolved Salts & Silica', formula: 'NaCl / SiO₂', pct: 3 + n4, color: '#94a3b8' },
    ]);
  } else if (surfModel.isMoltenWorld) {
    surfaceRows = normalizeRows([
      { name: 'Molten Silicate Lava', formula: 'SiO₂ / MgO', pct: 52 + n1 * 4, color: '#f97316' },
      { name: 'Basalt Volcanic Rock', formula: 'MgSiO₃ / CaO', pct: 28 + n2 * 3, color: '#78716c' },
      { name: 'Molten Iron Oxides', formula: 'FeO / Fe₃O₄', pct: 13 + n3 * 2, color: '#44403c' },
      { name: 'Volcanic Sulfur & Sulfides', formula: 'FeS / SO₂', pct: 7 + n4, color: '#fbbf24' },
    ]);
  } else if (isSulfur) {
    surfaceRows = normalizeRows([
      { name: 'Elemental Sulfur', formula: 'S₈', pct: 42 + n1 * 4, color: '#eab308' },
      { name: 'Basalt & Silicate Rock', formula: 'SiO₂ / MgO', pct: 26 + n2 * 3, color: '#78350f' },
      { name: 'Sulfur Dioxide Frost', formula: 'SO₂', pct: 22 + n3 * 3, color: '#fef08a' },
      { name: 'Iron Sulfide (Pyrite)', formula: 'FeS₂', pct: 10 + n4 * 1.5, color: '#57534e' },
    ]);
  } else if (isTholin) {
    const ch4Cov = (hydro?.coveragePct ?? 0) * 0.35;
    surfaceRows = normalizeRows([
      { name: 'Water & Ammonia Ice Bedrock', formula: 'H₂O / NH₃', pct: Math.max(30, 52 - ch4Cov * 0.5 + n1 * 4), color: '#dfd0be' },
      { name: 'Liquid Methane & Ethane', formula: 'CH₄ / C₂H₆', pct: Math.max(5, 16 + ch4Cov + n2 * 3), color: '#d97706' },
      { name: 'Organic Hydrocarbon Sand', formula: 'CₓHᵧN₂', pct: 21 + n3 * 2.5, color: '#a6683c' },
      { name: 'Silicate Rock & Dust', formula: 'SiO₂ / MgO', pct: 11 + n4 * 1.5, color: '#78583f' },
    ]);
  } else if (surfModel.isIcyWorld || iceFrac >= 0.15) {
    const icePurity = Math.max(0.25, Math.min(0.9, iceFrac + 0.15));
    surfaceRows = normalizeRows([
      { name: 'Water Ice', formula: 'H₂O', pct: icePurity * 72 + n1 * 4, color: '#dbeafe' },
      { name: 'Silicate Rock & Dust', formula: 'SiO₂ / MgO', pct: (1 - icePurity) * 65 + 8 + n2 * 3, color: '#8c7864' },
      { name: 'Frozen Salts (Sulfates)', formula: 'MgSO₄ / NaCl', pct: 11 + n3 * 2, color: '#38bdf8' },
      { name: 'Ammonia & Carbon Dioxide Ice', formula: 'NH₃ / CO₂', pct: 9 + n4 * 1.5, color: '#93c5fd' },
    ]);
  } else if (isIron) {
    surfaceRows = normalizeRows([
      { name: 'Silicate Rock', formula: 'SiO₂ / MgO', pct: 48 + n1 * 4, color: '#94a3b8' },
      { name: 'Metallic Iron & Nickel', formula: 'Fe / Ni', pct: 28 + (density - 5.2) * 4 + n2 * 3, color: '#64748b' },
      { name: 'Iron & Calcium Sulfides', formula: 'FeS / CaS', pct: 15 + n3 * 2, color: '#475569' },
      { name: 'Carbon (Graphite)', formula: 'C', pct: 9 + n4 * 1.5, color: '#334155' },
    ]);
  } else if (isCarbon) {
    surfaceRows = normalizeRows([
      { name: 'Silicon & Titanium Carbide', formula: 'SiC / TiC', pct: 36 + n1 * 4, color: '#57534e' },
      { name: 'Carbon (Graphite & Diamond)', formula: 'C', pct: 32 + n2 * 3, color: '#292524' },
      { name: 'Silicate Rock', formula: 'SiO₂ / MgO', pct: 22 + n3 * 2.5, color: '#78716c' },
      { name: 'Hydrocarbon Tar', formula: 'CₙHₘ', pct: 10 + n4 * 1.5, color: '#44403c' },
    ]);
  } else if (isFerric) {
    surfaceRows = normalizeRows([
      { name: 'Basalt & Silicate Rock', formula: 'SiO₂ / MgO', pct: 58 + n1 * 4, color: '#7c2d12' },
      { name: 'Iron Oxide Dust (Rust)', formula: 'Fe₂O₃', pct: 22 + n2 * 3, color: '#ea580c' },
      { name: 'Sulfate & Chloride Salts', formula: 'MgSO₄ / NaCl', pct: 12 + n3 * 2, color: '#fdba74' },
      { name: 'Clay & Carbonate Minerals', formula: 'CaCO₃', pct: 8 + n4 * 1.2, color: '#b45309' },
    ]);
  } else if (isVenusian) {
    surfaceRows = normalizeRows([
      { name: 'Basalt Volcanic Rock', formula: 'SiO₂ / MgO', pct: 68 + n1 * 4, color: '#854d0e' },
      { name: 'Sulfate Crust (Anhydrite)', formula: 'CaSO₄ / MgSO₄', pct: 16 + n2 * 2, color: '#ca8a04' },
      { name: 'Iron Oxides', formula: 'Fe₂O₃ / Fe₃O₄', pct: 10 + n3 * 1.5, color: '#713f12' },
      { name: 'Pyrite & Metal Sulfide Frost', formula: 'FeS₂ / PbS', pct: 6 + n4, color: '#fde047' },
    ]);
  } else {
    const waterCov = (hydro?.coveragePct ?? 0) * 0.22;
    surfaceRows = normalizeRows([
      {
        name: 'Silicate Rock (Quartz & Feldspar)',
        formula: 'SiO₂ / Al₂O₃',
        pct: 48 - waterCov * 0.3 + n1 * 4,
        color: '#a8a29e',
      },
      {
        name: 'Basalt & Magnesium Rock',
        formula: 'MgSiO₃ / FeO',
        pct: 32 - waterCov * 0.25 + n2 * 3,
        color: '#78716c',
      },
      ...(waterCov > 0.5
        ? [
            {
              name: `Surface Liquid (${surfModel.seaPalette.displayName})`,
              formula: surfModel.seaPalette.solventKey === 'H2O' ? 'H₂O' : surfModel.seaPalette.solventKey,
              pct: Math.min(25, 7 + waterCov + n3 * 1.5),
              color: '#0ea5e9',
            },
          ]
        : []),
      {
        name: pBar < 0.005 ? 'Titanium & Iron Oxides' : 'Limestone & Clay Minerals',
        formula: pBar < 0.005 ? 'FeTiO₃' : 'CaCO₃',
        pct: 12 + n3 * 1.5,
        color: '#8c7355',
      },
      {
        name: 'Iron Oxide (Rust & Magnetite)',
        formula: 'Fe₂O₃ / Fe₃O₄',
        pct: 8 + n4 * 1.2,
        color: '#57534e',
      },
    ]);
  }

  // Compute Simple Interior Layers (Crust -> Subsurface Ocean (if any) -> Mantle -> Core)
  const rawCmf =
    rockFrac *
    Math.max(
      0.08,
      Math.min(0.72, 0.31 + (density - 5.0 * rockFrac - 1.3 * iceFrac) * 0.14 + (isIron ? 0.25 : 0))
    );
  const coreMassPct = +(rawCmf * 100).toFixed(1);
  const shellMassPct = +(Math.max(1.0, Math.min(48, iceFrac * 82 + (surfModel.isSupercritical ? 18 : 1.8)))).toFixed(1);
  const mantleMassPct = +(Math.max(5, 100 - coreMassPct - shellMassPct)).toFixed(1);

  const crustDepthKm = Math.max(
    8,
    Math.min(
      Math.round(radiusKm * 0.22),
      Math.round((iceFrac >= 0.15 ? radiusKm * iceFrac * 0.35 : 35 / Math.sqrt(gravityG)) + (hydro?.liqKm || 0))
    )
  );
  const coreRadiusKm = Math.round(radiusKm * Math.pow(rawCmf, 0.36) * 0.88);
  const coreTopDepthKm = Math.max(crustDepthKm + 40, radiusKm - coreRadiusKm);

  const hasSubOcean = Boolean(
    hydro &&
      (((hydro.iceKm ?? 0) > 0 && (hydro.liqKm ?? 0) > 0) ||
        hydro.state?.toLowerCase().includes('subsurface'))
  );

  const interiorRows: InteriorLayerRow[] = [];

  if (surfModel.isSupercritical) {
    interiorRows.push({
      layerName: 'Supercritical Steam Envelope',
      depthRangeKm: `0 – ${crustDepthKm.toLocaleString()} km`,
      massPct: shellMassPct,
      composition: 'Dense Supercritical Water (H₂O, CO₂)',
      state: 'Dense Fluid',
      color: '#3b82f6',
    });
  } else if (iceFrac >= 0.15) {
    const iceShellKm = Math.max(5, Math.round(hydro?.iceKm || crustDepthKm * 0.45));
    interiorRows.push({
      layerName: 'Outer Ice Crust',
      depthRangeKm: `0 – ${iceShellKm.toLocaleString()} km`,
      massPct: hasSubOcean ? +(shellMassPct * 0.45).toFixed(1) : shellMassPct,
      composition: isTholin ? 'Water Ice & Frozen Methane (H₂O, CH₄)' : 'Solid Water Ice & Salts (H₂O, MgSO₄)',
      state: 'Solid Ice',
      color: '#bae6fd',
    });

    if (hasSubOcean || (hydro?.liqKm ?? 0) > 0) {
      const ocDepth = Math.max(
        iceShellKm + 10,
        Math.min(coreTopDepthKm - 20, iceShellKm + Math.round(hydro?.liqKm || 65))
      );
      interiorRows.push({
        layerName: 'Subsurface Ocean',
        depthRangeKm: `${iceShellKm.toLocaleString()} – ${ocDepth.toLocaleString()} km`,
        massPct: +(shellMassPct * 0.55).toFixed(1),
        composition: 'Liquid Water, Ammonia & Salts (H₂O, NH₃)',
        state: 'Liquid Water',
        color: '#0284c7',
      });
    }
  } else {
    interiorRows.push({
      layerName: surfModel.isMoltenWorld ? 'Molten Lava Crust' : 'Outer Crust',
      depthRangeKm: `0 – ${crustDepthKm.toLocaleString()} km`,
      massPct: shellMassPct,
      composition: isCarbon
        ? 'Graphite & Silicon Carbide (C, SiC)'
        : 'Silicate Rock & Basalt (SiO₂, Al₂O₃)',
      state: surfModel.isMoltenWorld ? 'Molten Lava & Rock' : 'Solid Rock',
      color: '#a8a29e',
    });
  }

  const mantleStartKm =
    iceFrac >= 0.15 && (hasSubOcean || (hydro?.liqKm ?? 0) > 0)
      ? Math.max(
          Math.max(5, Math.round(hydro?.iceKm || crustDepthKm * 0.45)) + 10,
          Math.min(
            coreTopDepthKm - 20,
            Math.max(5, Math.round(hydro?.iceKm || crustDepthKm * 0.45)) + Math.round(hydro?.liqKm || 65)
          )
        )
      : crustDepthKm;

  interiorRows.push({
    layerName: iceFrac >= 0.15 ? 'Rock & Deep Ice Mantle' : 'Mantle',
    depthRangeKm: `${mantleStartKm.toLocaleString()} – ${coreTopDepthKm.toLocaleString()} km`,
    massPct: mantleMassPct,
    composition: isCarbon
      ? 'Silicon Carbide & Diamond (SiC, C)'
      : iceFrac >= 0.15
      ? 'Silicate Rock & High-Pressure Ice (SiO₂, MgO, H₂O)'
      : 'Magnesium & Iron Silicate Rock (SiO₂, MgO, FeO)',
    state: surfModel.isMoltenWorld || tidalW > 0.25 ? 'Partially Molten Rock' : 'Hot Dense Rock',
    color: '#d97706',
  });

  const hasLiquidCore = Boolean(mag?.hasActiveDynamo || surfModel.isMoltenWorld || coreTempK > 2400 || tidalW > 0.1);
  interiorRows.push({
    layerName: 'Central Core',
    depthRangeKm: `${coreTopDepthKm.toLocaleString()} – ${radiusKm.toLocaleString()} km`,
    massPct: coreMassPct,
    composition: 'Iron & Nickel Metal (Fe, Ni, S)',
    state: hasLiquidCore ? 'Liquid & Solid Metal' : 'Solid Metal',
    color: '#f59e0b',
  });

  // Bulk Elemental Composition
  const bulkElements = normalizeElements([
    {
      symbol: 'O',
      name: 'Oxygen',
      pct: isCarbon ? 12 : rockFrac * 30.5 + iceFrac * 68,
      color: '#38bdf8',
    },
    {
      symbol: 'Fe',
      name: 'Iron',
      pct: coreMassPct * 0.84 + rockFrac * 8.5,
      color: '#f97316',
    },
    {
      symbol: 'Si',
      name: 'Silicon',
      pct: rockFrac * (isCarbon ? 24 : 16.5),
      color: '#a8a29e',
    },
    {
      symbol: 'Mg',
      name: 'Magnesium',
      pct: rockFrac * 14.2,
      color: '#10b981',
    },
    ...(iceFrac >= 0.04 || surfModel.isSupercritical
      ? [
          {
            symbol: 'H/C/N',
            name: 'Water & Ice Elements',
            pct: Math.max(2.5, iceFrac * 32 + (surfModel.isSupercritical ? 14 : 0)),
            color: '#60a5fa',
          },
        ]
      : []),
    ...(isCarbon
      ? [
          {
            symbol: 'C',
            name: 'Carbon',
            pct: 28.5,
            color: '#a855f7',
          },
        ]
      : []),
    {
      symbol: 'S/Ni',
      name: 'Sulfur & Nickel',
      pct: coreMassPct * 0.14 + (isSulfur ? 9.5 : 2.4),
      color: '#eab308',
    },
    {
      symbol: 'Ca/Al',
      name: 'Calcium & Aluminum',
      pct: Math.max(1.2, rockFrac * 3.2),
      color: '#cbd5e1',
    },
  ]);

  // Volcanism & Tectonic Activity Strength
  let volcanismLevel: GeoActivityLevel = 'None';
  let volcanismDesc = 'Inactive (no active volcanoes)';

  if (surfModel.isSupercritical) {
    volcanismLevel = tidalW >= 0.2 || massEarth >= 2.0 ? 'High' : 'Moderate';
    volcanismDesc = 'Deep seafloor hydrothermal vents';
  } else if (surfModel.isMoltenWorld || tidalW >= 0.8) {
    volcanismLevel = 'Extreme';
    volcanismDesc = 'Global lava flows & constant eruptions';
  } else if (surfModel.isIcyWorld || iceFrac >= 0.15) {
    if (tidalW >= 0.25) {
      volcanismLevel = 'High';
      volcanismDesc = 'Active ice geysers & water/ammonia plumes';
    } else if (hasSubOcean || tidalW >= 0.04) {
      volcanismLevel = 'Moderate';
      volcanismDesc = 'Subsurface ocean geysers & ice vents';
    } else if (massEarth >= 0.08 || tidalW >= 0.01) {
      volcanismLevel = 'Low';
      volcanismDesc = 'Rare cryovolcanic frost vents';
    } else {
      volcanismLevel = 'None';
      volcanismDesc = 'Frozen & inactive (no active vents)';
    }
  } else {
    if (tidalW >= 0.25 || isSulfur || isVenusian || surfModel.volcanoCount >= 18) {
      volcanismLevel = 'High';
      volcanismDesc = 'Frequent eruptions & active lava volcanoes';
    } else if (surfModel.hasActiveGeology && (surfModel.volcanoCount >= 6 || surfModel.platesCount > 0)) {
      volcanismLevel = 'Moderate';
      volcanismDesc = 'Active shield & plate-boundary volcanoes';
    } else if (surfModel.volcanoCount > 0 || tidalW >= 0.015 || massEarth >= 0.15) {
      volcanismLevel = 'Low';
      volcanismDesc = 'Mostly dormant volcanoes & minor vents';
    } else {
      volcanismLevel = 'None';
      volcanismDesc = 'Extinct (no active volcanism)';
    }
  }

  let tectonicsLevel: GeoActivityLevel = 'None';
  let tectonicsDesc = 'Locked, inactive crust';

  if (surfModel.isSupercritical) {
    tectonicsLevel = massEarth >= 2.0 ? 'Moderate' : 'Low';
    tectonicsDesc = 'Deep seafloor fault shifting';
  } else if (surfModel.isMoltenWorld) {
    tectonicsLevel = 'Extreme';
    tectonicsDesc = 'Thin crust constantly breaking over magma';
  } else if (surfModel.platesCount > 0) {
    if (tidalW >= 0.3 || massEarth >= 1.6) {
      tectonicsLevel = 'High';
      tectonicsDesc = `${surfModel.platesCount} fast-moving plates & mountain belts`;
    } else {
      tectonicsLevel = 'Moderate';
      tectonicsDesc = `${surfModel.platesCount} moving crustal plates & fault lines`;
    }
  } else if (surfModel.isIcyWorld || iceFrac >= 0.15) {
    if (tidalW >= 0.2) {
      tectonicsLevel = 'High';
      tectonicsDesc = 'Rapidly flexing & cracking ice shell';
    } else if (hasSubOcean || tidalW >= 0.04) {
      tectonicsLevel = 'Moderate';
      tectonicsDesc = 'Shifting ice shell with surface fractures';
    } else if (massEarth >= 0.08) {
      tectonicsLevel = 'Low';
      tectonicsDesc = 'Fixed ice crust with old fault ridges';
    } else {
      tectonicsLevel = 'None';
      tectonicsDesc = 'Rigid, unmoving ice crust';
    }
  } else if (surfModel.hasActiveGeology) {
    if (tidalW >= 0.25 || isVenusian) {
      tectonicsLevel = 'Moderate';
      tectonicsDesc = 'Single crust with heavy volcanic faulting';
    } else {
      tectonicsLevel = 'Low';
      tectonicsDesc = 'Single fixed crust with local fault lines';
    }
  }

  return {
    surfaceTitle: 'Surface Composition',
    coreMassPct,
    coreTempK,
    volcanismLevel,
    volcanismDesc,
    tectonicsLevel,
    tectonicsDesc,
    surfaceRows,
    interiorRows,
    bulkElements,
  };
}

function getActivityBadgeStyle(level: GeoActivityLevel): string {
  switch (level) {
    case 'Extreme':
      return 'bg-red-950/90 border-red-500/70 text-red-200';
    case 'High':
      return 'bg-orange-950/90 border-orange-500/70 text-orange-200';
    case 'Moderate':
      return 'bg-amber-950/90 border-amber-500/70 text-amber-200';
    case 'Low':
      return 'bg-sky-950/80 border-sky-600/60 text-sky-200';
    default:
      return 'bg-slate-900 border-slate-700 text-slate-400';
  }
}

interface PlanetaryChemistrySectionProps {
  planet: RealisticPlanetBody;
  moon?: RealisticMoon | null;
  surfaceModel?: PlanetarySurfaceModel | null;
}

export const PlanetaryChemistrySection: React.FC<PlanetaryChemistrySectionProps> = ({
  planet,
  moon,
  surfaceModel,
}) => {
  const profile = React.useMemo(
    () => derivePlanetaryChemistryProfile(planet, moon, surfaceModel),
    [planet, moon, surfaceModel]
  );

  return (
    <div className="bg-[#151d2c] p-3.5 rounded-xl border border-slate-800 flex flex-col gap-3 font-mono text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
        <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
          <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
          Surface &amp; Internal Composition
        </span>

        <div className="flex items-center gap-2 text-[10.5px]">
          <span className="px-2 py-0.5 rounded bg-[#0c121d] border border-slate-800 text-slate-300">
            Core Mass: <b className="text-amber-300">{profile.coreMassPct}%</b>
          </span>
          <span className="px-2 py-0.5 rounded bg-[#0c121d] border border-slate-800 text-slate-300">
            Core Temp: <b className="text-rose-300">{profile.coreTempK.toLocaleString()} K</b>
          </span>
        </div>
      </div>

      {/* Volcanism & Tectonic Activity Strength */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="bg-[#0c121d] p-2.5 rounded-lg border border-slate-800/90 flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
              <Mountain className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
              Volcanism
            </span>
            <span className="text-[11px] text-slate-200 truncate" title={profile.volcanismDesc}>
              {profile.volcanismDesc}
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded border text-[10.5px] font-bold flex-shrink-0 ${getActivityBadgeStyle(
              profile.volcanismLevel
            )}`}
          >
            {profile.volcanismLevel}
          </span>
        </div>

        <div className="bg-[#0c121d] p-2.5 rounded-lg border border-slate-800/90 flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              Tectonic Activity
            </span>
            <span className="text-[11px] text-slate-200 truncate" title={profile.tectonicsDesc}>
              {profile.tectonicsDesc}
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded border text-[10.5px] font-bold flex-shrink-0 ${getActivityBadgeStyle(
              profile.tectonicsLevel
            )}`}
          >
            {profile.tectonicsLevel}
          </span>
        </div>
      </div>

      {/* Bulk Elements Bar */}
      <div className="bg-[#0c121d] p-2.5 rounded-lg border border-slate-800/90 flex flex-col gap-2">
        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
          Overall Elements (By Mass)
        </span>

        <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-slate-950 border border-slate-800">
          {profile.bulkElements.map((el) => (
            <div
              key={el.symbol}
              style={{ width: `${el.pct}%`, backgroundColor: el.color }}
              title={`${el.name} (${el.symbol}): ${el.pct}%`}
              className="h-full first:rounded-l-full last:rounded-r-full transition-all"
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-x-3.5 gap-y-1">
          {profile.bulkElements.map((el) => (
            <div key={el.symbol} className="flex items-center gap-1.5 text-[10.5px]">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: el.color }} />
              <span className="text-slate-300">
                <b>{el.name}</b> <span className="text-slate-500">({el.symbol})</span>:
              </span>
              <b className="text-white">{el.pct}%</b>
            </div>
          ))}
        </div>
      </div>

      {/* Side-by-Side Simplified Tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Table 1: Surface Materials */}
        <div className="bg-[#0c121d] rounded-lg border border-slate-800 overflow-hidden flex flex-col">
          <div className="px-3 py-2 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[10.5px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              {profile.surfaceTitle}
            </span>
            <span className="text-[10px] text-slate-400">Share</span>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <tbody className="divide-y divide-slate-800/60">
              {profile.surfaceRows.map((row) => (
                <tr key={row.name} className="hover:bg-slate-900/40 transition">
                  <td className="py-2 px-3 font-semibold text-slate-200">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-xs flex-shrink-0 border border-white/10"
                        style={{ backgroundColor: row.color }}
                      />
                      <span>{row.name}</span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-cyan-300 font-bold whitespace-nowrap">{row.formula}</td>
                  <td className="py-2 px-3 text-right font-bold text-white whitespace-nowrap">{row.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table 2: Internal Layers */}
        <div className="bg-[#0c121d] rounded-lg border border-slate-800 overflow-hidden flex flex-col">
          <div className="px-3 py-2 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[10.5px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              Internal Layers
            </span>
            <span className="text-[10px] text-slate-400">Depth &amp; Mass</span>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <tbody className="divide-y divide-slate-800/60">
              {profile.interiorRows.map((layer) => (
                <tr key={layer.layerName} className="hover:bg-slate-900/40 transition">
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2 font-semibold text-slate-200">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: layer.color }}
                      />
                      <span>{layer.layerName}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block ml-4">{layer.composition}</span>
                  </td>
                  <td className="py-2 px-2 text-sky-300 whitespace-nowrap text-[10.5px]">
                    <div>{layer.depthRangeKm}</div>
                    <div className="text-[9.5px] text-slate-500">{layer.state}</div>
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-amber-300 whitespace-nowrap">
                    {layer.massPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
