import React from 'react';
import { Layers, FlaskConical, Flame } from 'lucide-react';
import { RealisticPlanetBody } from '../../../core/generation/realisticStarGen';
import { RealisticMoon } from '../../../types/astrophysics';
import { PlanetarySurfaceModel, generatePlanetarySurfaceModel } from './surfaceGenMath';

export interface SurfaceChemicalRow {
  name: string;
  formula: string;
  pct: number;
  phase: string;
  role: string;
  color: string;
}

export interface InteriorLayerRow {
  layerName: string;
  depthRangeKm: string;
  massPct: number;
  chemistry: string;
  formula: string;
  state: string;
  ptRegime: string;
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
  surfaceSubtitle: string;
  coreMassPct: number;
  mantleMassPct: number;
  shellMassPct: number;
  centralPressureGPa: number;
  coreTempK: number;
  mgSiRatio: number;
  feMgRatio: number;
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
  const positive = rows.map((r) => ({ ...r, pct: Math.max(0.2, r.pct) }));
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
  const positive = items.map((r) => ({ ...r, pct: Math.max(0.1, r.pct) }));
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
  const n5 = seededNoise(seed, 5);

  const mgSiRatio = +(0.88 + n1 * 0.22 + (density > 5.2 ? 0.08 : 0)).toFixed(2);
  const feMgRatio = +(Math.max(0.35, Math.min(2.8, 0.85 + (density - 4.5) * 0.38 + n2 * 0.16))).toFixed(2);

  // Central pressure estimate: P_c ~ 360 GPa * g^2 * (rho / rho_earth)
  const rawPcGPa = 360 * Math.pow(gravityG, 2) * (density / 5.51);
  const centralPressureGPa = +(Math.max(0.4, rawPcGPa)).toFixed(1);

  // Core temperature estimate
  const coreTempK = Math.round(
    surfModel.isGasGiant
      ? Math.min(48000, 14000 + Math.pow(massEarth, 0.52) * 2800 + Tsurf * 1.5)
      : Math.max(
          Tsurf + 250,
          Math.min(14000, 1200 + Math.pow(massEarth, 0.44) * 4100 + tidalW * 1600 + (density > 5.5 ? 650 : 0))
        )
  );

  // 1. GAS GIANTS & ICE GIANTS
  if (surfModel.isGasGiant) {
    const isIceGiant = surfModel.isIceGiant;
    const sClass = !isMoon ? planet.sudarskyClass || (Tsurf >= 1400 ? 'V' : Tsurf >= 900 ? 'IV' : Tsurf >= 350 ? 'III' : Tsurf >= 150 ? 'II' : 'I') : 'I';

    let surfaceRows: SurfaceChemicalRow[] = [];
    if (sClass === 'V' || Tsurf >= 1200) {
      surfaceRows = normalizeRows([
        { name: 'Molecular Hydrogen & Helium', formula: 'H₂ / He', pct: 76.5 + n1 * 3, phase: 'Gas', role: 'Primary continuum envelope', color: '#f97316' },
        { name: 'Forsterite & Enstatite Silicate Clouds', formula: 'Mg₂SiO₄ / MgSiO₃', pct: 11.2 + n2 * 2, phase: 'Refractory Aerosol', role: 'High-altitude silicate cloud deck', color: '#fb923c' },
        { name: 'Condensing Liquid Iron Droplets', formula: 'Fe(l) / Ni', pct: 6.4 + n3 * 1.5, phase: 'Liquid Condensate', role: 'Mid-tropospheric metallic rain', color: '#dc2626' },
        { name: 'Titanium & Vanadium Oxides', formula: 'TiO / VO / CO', pct: 3.6 + n4, phase: 'Stratospheric Gas', role: 'Thermal inversion UV/optical absorber', color: '#fde047' },
        { name: 'Corundum & Perovskite Dust', formula: 'Al₂O₃ / CaTiO₃', pct: 2.3 + n5 * 0.6, phase: 'Refractory Solid', role: 'Deep refractory condensate', color: '#fca5a5' },
      ]);
    } else if (sClass === 'IV' || Tsurf >= 750) {
      surfaceRows = normalizeRows([
        { name: 'Molecular Hydrogen & Helium', formula: 'H₂ / He', pct: 81.0 + n1 * 3, phase: 'Gas', role: 'Primary continuum envelope', color: '#818cf8' },
        { name: 'Atomic Alkali Metal Vapors', formula: 'Na(g) / K(g)', pct: 7.8 + n2 * 1.6, phase: 'Vapor', role: 'Broad optical D-line absorption (low albedo)', color: '#a855f7' },
        { name: 'Carbon Monoxide & Water Vapor', formula: 'CO / H₂O(g)', pct: 6.2 + n3 * 1.2, phase: 'Superheated Gas', role: 'Dominant C-O-H chemical equilibrium', color: '#60a5fa' },
        { name: 'Sodium Sulfide & MnS Clouds', formula: 'Na₂S / MnS / ZnS', pct: 3.4 + n4 * 0.8, phase: 'Cloud Condensate', role: 'Upper sulfide aerosol deck', color: '#c084fc' },
        { name: 'Deep Silicate Haze', formula: 'MgSiO₃', pct: 1.6 + n5 * 0.4, phase: 'Deep Aerosol', role: 'Deep convective silicate deck', color: '#94a3b8' },
      ]);
    } else if (isIceGiant) {
      surfaceRows = normalizeRows([
        { name: 'Hydrogen-Helium Carrier Gas', formula: 'H₂ (79%) / He (18%)', pct: 74.0 + n1 * 4, phase: 'Gas', role: 'Upper molecular atmosphere', color: '#38bdf8' },
        { name: 'Methane Condensate & Vapor', formula: 'CH₄', pct: 12.8 + n2 * 2.5, phase: 'Ice / Gas', role: 'Red-light absorption (cyan-blue hue)', color: '#06b6d4' },
        { name: 'Hydrogen Sulfide & Ammonia Ice', formula: 'H₂S / NH₃(s)', pct: 6.8 + n3 * 1.5, phase: 'Cryo-Aerosol', role: 'Mid-tropospheric banded cloud deck', color: '#bae6fd' },
        { name: 'Ammonium Hydrosulfide Deck', formula: 'NH₄SH(s)', pct: 4.1 + n4, phase: 'Solid Aerosol', role: 'Deep convective cloud layer', color: '#7dd3fc' },
        { name: 'Photochemical Ethane & Acetylene', formula: 'C₂H₆ / C₂H₂ / PH₃', pct: 2.3 + n5 * 0.6, phase: 'Stratospheric Haze', role: 'UV photolysis hydrocarbon smog', color: '#e0f2fe' },
      ]);
    } else if (sClass === 'II' || (Tsurf >= 150 && Tsurf < 350)) {
      surfaceRows = normalizeRows([
        { name: 'Molecular Hydrogen & Helium', formula: 'H₂ / He', pct: 78.5 + n1 * 3, phase: 'Gas', role: 'Primary envelope gas', color: '#60a5fa' },
        { name: 'Condensed Water Ice & Droplets', formula: 'H₂O(s/l)', pct: 11.4 + n2 * 2, phase: 'Ice / Liquid Cloud', role: 'High-albedo Class II water cloud decks', color: '#f8fafc' },
        { name: 'Ammonia & Ammonium Hydrosulfide', formula: 'NH₃ / NH₄SH', pct: 5.4 + n3 * 1.2, phase: 'Vapor / Aerosol', role: 'Tropospheric nitrogen reservoir', color: '#cbd5e1' },
        { name: 'Methane & Water Vapor', formula: 'CH₄ / H₂O(g)', pct: 3.2 + n4 * 0.8, phase: 'Gas', role: 'Infrared opacity & convective bands', color: '#93c5fd' },
        { name: 'Phosphine & Sulfur Chromophores', formula: 'PH₃ / H₂S', pct: 1.5 + n5 * 0.4, phase: 'Trace Aerosol', role: 'Cyclonic storm belt tinting', color: '#94a3b8' },
      ]);
    } else {
      // Class I Jovian Ammonia Giant
      surfaceRows = normalizeRows([
        { name: 'Molecular Hydrogen & Helium', formula: 'H₂ / He', pct: 79.0 + n1 * 3, phase: 'Gas', role: 'Primary molecular envelope', color: '#f59e0b' },
        { name: 'Crystalline Ammonia Ice Clouds', formula: 'NH₃(s)', pct: 9.2 + n2 * 1.8, phase: 'Cryo-Aerosol', role: 'Bright upper zonal cloud bands (0.5–1 bar)', color: '#fef3c7' },
        { name: 'Ammonium Hydrosulfide Clouds', formula: 'NH₄SH(s)', pct: 5.6 + n3 * 1.2, phase: 'Solid Aerosol', role: 'Russet/ochre mid-deck belts (2–3 bar)', color: '#d97706' },
        { name: 'Deep Water-Ice Cloud Deck', formula: 'H₂O(s/l)', pct: 4.1 + n4 * 0.8, phase: 'Ice / Liquid Cloud', role: 'Deep convective lightning deck (5–8 bar)', color: '#bae6fd' },
        { name: 'Phosphorus & Tholin Chromophores', formula: 'P₄ / CₓHᵧN₂ / PH₃', pct: 2.1 + n5 * 0.5, phase: 'Photochemical Aerosol', role: 'Vortex & anticyclonic spot coloration', color: '#b45309' },
      ]);
    }

    const corePct = +(rockFrac * 100).toFixed(1);
    const mantlePct = +(iceFrac * 100).toFixed(1);
    const envPct = +(Math.max(1, 100 - corePct - mantlePct)).toFixed(1);

    const d1 = Math.round(radiusKm * (isIceGiant ? 0.18 : 0.22));
    const d2 = Math.round(radiusKm * (isIceGiant ? 0.76 : 0.84));

    const interiorRows: InteriorLayerRow[] = isIceGiant
      ? [
          {
            layerName: 'Upper Molecular Envelope & Cloud Decks',
            depthRangeKm: `0 – ${d1.toLocaleString()} km`,
            massPct: envPct,
            chemistry: 'Molecular Hydrogen, Helium & Methane',
            formula: 'H₂ + He + CH₄ + NH₃',
            state: 'Compressible Gas → Supercritical Fluid',
            ptRegime: `${Math.round(Tsurf)} – 2,200 K · 1 bar – 10 GPa`,
            color: '#38bdf8',
          },
          {
            layerName: 'Ionic / Superionic Ice-Fluid Mantle',
            depthRangeKm: `${d1.toLocaleString()} – ${d2.toLocaleString()} km`,
            massPct: mantlePct,
            chemistry: 'Superionic Water, Ammonia & Methane (Diamond Rain)',
            formula: 'H₂O (Ice XVIII) + NH₄⁺OH⁻ + C(d)',
            state: 'Conductive Ionic Fluid / Superionic Lattice',
            ptRegime: `2,200 – ${Math.round(coreTempK * 0.78).toLocaleString()} K · 10 – 350 GPa`,
            color: '#0284c7',
          },
          {
            layerName: 'High-Pressure Silicate-Iron Core',
            depthRangeKm: `${d2.toLocaleString()} – ${radiusKm.toLocaleString()} km`,
            massPct: corePct,
            chemistry: 'Post-Perovskite Silicates & Fe-Ni-S Alloy',
            formula: '(Mg,Fe)SiO₃ + Fe-Ni',
            state: 'Dense Solid / Partially Molten Core',
            ptRegime: `${coreTempK.toLocaleString()} K · ~${centralPressureGPa.toLocaleString()} GPa`,
            color: '#64748b',
          },
        ]
      : [
          {
            layerName: 'Molecular Hydrogen-Helium Envelope',
            depthRangeKm: `0 – ${d1.toLocaleString()} km`,
            massPct: +(envPct * 0.24).toFixed(1),
            chemistry: 'Molecular Hydrogen, Helium & Condensate Decks',
            formula: 'H₂ + He + NH₃ + H₂O',
            state: 'Gas → Dense Supercritical Molecular Fluid',
            ptRegime: `${Math.round(Tsurf)} – 6,500 K · 1 bar – 180 GPa`,
            color: '#f59e0b',
          },
          {
            layerName: 'Liquid Metallic Hydrogen Mantle',
            depthRangeKm: `${d1.toLocaleString()} – ${d2.toLocaleString()} km`,
            massPct: +(envPct * 0.76 + mantlePct * 0.5).toFixed(1),
            chemistry: 'Degenerate Proton-Electron Plasma & Helium Droplets',
            formula: 'H⁺ + e⁻ + He',
            state: 'Electro-Conductive Liquid Metal (Dynamo Source)',
            ptRegime: `6,500 – ${Math.round(coreTempK * 0.85).toLocaleString()} K · 180 – 2,500 GPa`,
            color: '#fbbf24',
          },
          {
            layerName: 'Dilute Rock-Ice Heavy Element Core',
            depthRangeKm: `${d2.toLocaleString()} – ${radiusKm.toLocaleString()} km`,
            massPct: +(corePct + mantlePct * 0.5).toFixed(1),
            chemistry: 'High-Pressure Silicates, Fe-Ni & Superionic Ices',
            formula: '(Mg,Fe)SiO₃ + Fe-Ni + H₂O',
            state: 'Super-Dense Fuzzy / Solid Core',
            ptRegime: `${coreTempK.toLocaleString()} K · ~${centralPressureGPa.toLocaleString()} GPa`,
            color: '#94a3b8',
          },
        ];

    const bulkElements = normalizeElements([
      { symbol: 'H', name: 'Hydrogen', pct: gasFrac * 74 + iceFrac * 11, color: '#38bdf8' },
      { symbol: 'He', name: 'Helium', pct: gasFrac * 24, color: '#fbbf24' },
      { symbol: 'O', name: 'Oxygen', pct: iceFrac * 52 + rockFrac * 32, color: '#60a5fa' },
      { symbol: 'C', name: 'Carbon', pct: iceFrac * 18 + gasFrac * 1.1, color: '#a855f7' },
      { symbol: 'N', name: 'Nitrogen', pct: iceFrac * 11 + gasFrac * 0.5, color: '#818cf8' },
      { symbol: 'Si/Mg/Fe', name: 'Refractory Metals & Silicates', pct: rockFrac * 68 + iceFrac * 8, color: '#94a3b8' },
    ]);

    return {
      surfaceTitle: 'Upper Cloud Deck & Tropospheric Condensates',
      surfaceSubtitle: surfModel.atmospherePalette.classLabel,
      coreMassPct: corePct,
      mantleMassPct: mantlePct,
      shellMassPct: envPct,
      centralPressureGPa,
      coreTempK,
      mgSiRatio,
      feMgRatio,
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
      { name: 'Supercritical Water Fluid', formula: 'H₂O(sc)', pct: 78.4 + n1 * 4, phase: 'Supercritical Fluid', role: 'Continuous high-P/T fluid envelope (>220 bar)', color: '#3b82f6' },
      { name: 'Condensed Water Vapor Clouds', formula: 'H₂O(l/s)', pct: 11.2 + n2 * 2, phase: 'Class II Cloud Deck', role: 'Upper tropospheric reflective cloud bands', color: '#f8fafc' },
      { name: 'Dissolved Carbon Dioxide & Carbonic Species', formula: 'CO₂ / H₂CO₃', pct: 5.4 + n3 * 1.2, phase: 'Solute', role: 'High-pressure volatile inventory', color: '#38bdf8' },
      { name: 'Dissolved Silica & Ions', formula: 'Si(OH)₄ / NaCl / MgSO₄', pct: 3.4 + n4 * 0.8, phase: 'Supercritical Solute', role: 'Leached silicate & salt solutes', color: '#94a3b8' },
      { name: 'Molecular Nitrogen & Noble Gases', formula: 'N₂ / Ar', pct: 1.6 + n5 * 0.4, phase: 'Mixed Gas', role: 'Upper atmospheric buffer gas', color: '#cbd5e1' },
    ]);
  } else if (surfModel.isMoltenWorld) {
    surfaceRows = normalizeRows([
      { name: 'Molten Forsterite-Fayalite Olivine Melt', formula: '(Mg,Fe)₂SiO₄(l)', pct: 36.5 + n1 * 4, phase: 'Liquid Magma / Crust', role: 'Primary ultramafic silicate magma sea', color: '#f97316' },
      { name: 'Enstatite & Augite Pyroxene', formula: '(Mg,Fe,Ca)SiO₃', pct: 26.2 + n2 * 3, phase: 'Partial Melt / Basalt', role: 'Solidifying quench-crust & lava plates', color: '#ea580c' },
      { name: 'Calcic Plagioclase (Anorthite)', formula: 'CaAl₂Si₂O₈', pct: 17.8 + n3 * 2.5, phase: 'Refractory Float Crust', role: 'Buoyant highland slag & cooled regions (<800 K)', color: '#78716c' },
      { name: 'Magnetite, Ilmenite & Spinel Oxides', formula: 'Fe₃O₄ / FeTiO₃ / MgAl₂O₄', pct: 12.1 + n4 * 1.8, phase: 'Dense Oxide', role: 'Dense iron-titanium oxide cumulates', color: '#44403c' },
      { name: 'Cristobalite & Outgassed Sulfides', formula: 'SiO₂ / FeS / SO₂', pct: 7.4 + n5 * 1.4, phase: 'Melt / Fumarolic', role: 'Volcanic fissure & caldera outgassing', color: '#fbbf24' },
    ]);
  } else if (isSulfur) {
    surfaceRows = normalizeRows([
      { name: 'Cyclo-Octasulfur & Polymeric Sulfur', formula: 'α/β-S₈, Sₓ', pct: 38.0 + n1 * 4, phase: 'Solid Allotrope', role: 'Yellow-orange-red volcanic plains & flows', color: '#eab308' },
      { name: 'Sulfur Dioxide Frost & Condensate', formula: 'SO₂(s)', pct: 22.5 + n2 * 3, phase: 'Cryo-Frost', role: 'Bright volcanic plume fallout rings', color: '#fef08a' },
      { name: 'Ultramafic Komatiite & Forsterite Basalt', formula: 'Mg₂SiO₄ / (Mg,Fe)SiO₃', pct: 24.0 + n3 * 3, phase: 'Crystalline Rock', role: 'High-temperature volcanic shield edifices & mountains', color: '#78350f' },
      { name: 'Pyrite & Iron-Nickel Sulfides', formula: 'FeS₂ / FeS', pct: 9.8 + n4 * 1.5, phase: 'Sulfide Mineral', role: 'Caldera floor & paterae dark deposits', color: '#57534e' },
      { name: 'Alkali Halide & Sulfate Evaporites', formula: 'Na₂SO₄ / NaCl / KCl', pct: 5.7 + n5 * 1.2, phase: 'Volcanic Salt', role: 'Fumarolic sublimates', color: '#d6d3d1' },
    ]);
  } else if (isTholin) {
    const ch4Cov = (hydro?.coveragePct ?? 0) * 0.35;
    surfaceRows = normalizeRows([
      { name: 'Crystalline Water-Ammonia Cryo-Bedrock', formula: 'H₂O (Ice Iₕ) · NH₃', pct: Math.max(25, 48.0 - ch4Cov * 0.5 + n1 * 4), phase: 'Cryo-Bedrock', role: 'Load-bearing structural crust (rock-hard at <100 K)', color: '#dfd0be' },
      { name: 'Liquid Methane & Ethane Hydrocarbons', formula: 'CH₄(l) / C₂H₆(l) / N₂', pct: Math.max(4, 14.0 + ch4Cov + n2 * 3), phase: 'Cryogenic Liquid', role: 'Surface hydrocarbon lakes, seas & fluvial channels', color: '#d97706' },
      { name: 'Complex Tholin Aerosol Heteropolymers', formula: 'CₓHᵧN₂ (Poly-HCN)', pct: 18.5 + n3 * 2.5, phase: 'Organic Solid', role: 'Equatorial hydrocarbon dunes & orange surface stain', color: '#a6683c' },
      { name: 'Clathrate Hydrates & Acetylene Ice', formula: 'CH₄·5.75H₂O / C₂H₂(s)', pct: 11.2 + n4 * 1.8, phase: 'Clathrate Solid', role: 'Evaporite basin rims & karstic lake shores', color: '#b8804e' },
      { name: 'Carbonaceous Silicate Impact Lag', formula: '(Mg,Fe)₃Si₂O₅(OH)₄', pct: 8.3 + n5 * 1.4, phase: 'Silicate Lag', role: 'Exposed crater ejecta & bedrock > 250 K', color: '#78583f' },
    ]);
  } else if (surfModel.isIcyWorld || iceFrac >= 0.15) {
    const icePurity = Math.max(0.2, Math.min(0.92, iceFrac + 0.15));
    surfaceRows = normalizeRows([
      { name: 'Hexagonal Crystalline Water Ice', formula: 'H₂O (Ice Iₕ / I꜀)', pct: icePurity * 68 + n1 * 4, phase: 'Crystalline Ice', role: 'Primary glacial shell, plains & alpine peaks (≤250 K)', color: '#dbeafe' },
      { name: 'Hydrated Phyllosilicates & Serpentine', formula: '(Mg,Fe)₃Si₂O₅(OH)₄', pct: (1 - icePurity) * 44 + 8 + n2 * 3, phase: 'Silicate Regolith', role: 'Dark non-ice lag & exposed warm bedrock (>250 K)', color: '#8c7864' },
      { name: 'Magnesium & Sodium Sulfate Cryo-Salts', formula: 'MgSO₄·11H₂O / Na₂SO₄', pct: 10.5 + n3 * 2, phase: 'Hydrated Salt', role: 'Reddish-blue cryotectonic lineae & briny fractures', color: '#38bdf8' },
      { name: 'Ammonia Dihydrate & CO₂ Clathrates', formula: 'NH₃·2H₂O / CO₂·5.75H₂O', pct: 7.8 + n4 * 1.5, phase: 'Cryo-Mineral', role: 'Cryovolcanic antifreeze & volatile reservoirs', color: '#93c5fd' },
      { name: 'Carbonaceous Chondrite & Pyroxene', formula: '(Mg,Fe)SiO₃ / C', pct: (1 - icePurity) * 28 + 4 + n5 * 1.2, phase: 'Mafic Rock', role: 'Cratered highlands & exposed silicate basins', color: '#57534e' },
    ]);
  } else if (isIron) {
    surfaceRows = normalizeRows([
      { name: 'Enstatite & Low-Iron Mg-Pyroxene', formula: 'MgSiO₃', pct: 34.0 + n1 * 3.5, phase: 'Silicate Mineral', role: 'Reduced silicate mantle & highland crust', color: '#94a3b8' },
      { name: 'Kamacite & Taenite Metallic Alloy', formula: 'Fe₀.₉₂Ni₀.₀₈', pct: 24.5 + (density - 5.2) * 4 + n2 * 3, phase: 'Native Metal', role: 'Metallic impact basins, scarps & regolith grains', color: '#64748b' },
      { name: 'Anorthite & Forsterite Silicates', formula: 'CaAl₂Si₂O₈ / Mg₂SiO₄', pct: 19.5 + n3 * 2.5, phase: 'Crystalline Rock', role: 'Cratered highland massifs', color: '#cbd5e1' },
      { name: 'Troilite, Oldhamite & Niningerite', formula: 'FeS / CaS / MgS', pct: 13.2 + n4 * 1.8, phase: 'Refractory Sulfide', role: 'Hollows & high-reflectance crater ejecta', color: '#475569' },
      { name: 'Graphite Flotation Crust', formula: 'C (Graphite)', pct: 8.8 + n5 * 1.4, phase: 'Carbon Phase', role: 'Low-reflectance darkened basin material', color: '#334155' },
    ]);
  } else if (isCarbon) {
    surfaceRows = normalizeRows([
      { name: 'Silicon Carbide (Moissanite) & TiC', formula: 'SiC / TiC', pct: 33.5 + n1 * 4, phase: 'Carbide Ceramic', role: 'Refractory carbide bedrock & mountain ranges', color: '#57534e' },
      { name: 'Graphite & Amorphous Carbon', formula: 'C (Graphite)', pct: 28.0 + n2 * 3.5, phase: 'Carbon Crust', role: 'Primary dark plains & diamond-graphite crust', color: '#292524' },
      { name: 'Forsterite & Enstatite Silicates', formula: 'Mg₂SiO₄ / MgSiO₃', pct: 21.5 + n3 * 2.5, phase: 'Reduced Silicate', role: 'Oxygen-depleted silicate interbeds', color: '#78716c' },
      { name: 'Troilite & Iron-Carbide (Cohenite)', formula: 'Fe₃C / FeS', pct: 10.8 + n4 * 1.6, phase: 'Metallic Carbide', role: 'Dense basin floor deposits', color: '#a8a29e' },
      { name: 'Polycyclic Aromatic Hydrocarbons', formula: 'CₙHₘ (PAHs / Tar)', pct: 6.2 + n5 * 1.2, phase: 'Organic Pitch', role: 'Surface hydrocarbon tar & dune sands', color: '#44403c' },
    ]);
  } else if (isFerric) {
    surfaceRows = normalizeRows([
      { name: 'Tholeiitic Basalt (Pyroxene & Olivine)', formula: '(Mg,Fe)SiO₃ / (Mg,Fe)₂SiO₄', pct: 38.5 + n1 * 4, phase: 'Mafic Bedrock', role: 'Underlying volcanic plains & shield edifices', color: '#7c2d12' },
      { name: 'Plagioclase Feldspar (Labradorite)', formula: '(Ca,Na)(Al,Si)₄O₈', pct: 24.0 + n2 * 3, phase: 'Tectosilicate', role: 'Highland crust & crater rims', color: '#9a3412' },
      { name: 'Nanophase Ferric Oxide (Hematite)', formula: 'α-Fe₂O₃ / FeOOH', pct: 18.2 + n3 * 2.5, phase: 'Oxidized Dust', role: 'Global rusty-ochre regolith & aeolian dunes', color: '#ea580c' },
      { name: 'Kieserite, Gypsum & Perchlorate Salts', formula: 'MgSO₄·H₂O / CaSO₄ / ClO₄⁻', pct: 11.4 + n4 * 1.8, phase: 'Evaporite Salt', role: 'Desiccated basin evaporites & duricrust', color: '#fdba74' },
      { name: 'Nontronite & Montmorillonite Clays', formula: 'Fe₂Si₄O₁₀(OH)₂·nH₂O', pct: 7.9 + n5 * 1.2, phase: 'Phyllosilicate', role: 'Ancient alluvial & highland weathering', color: '#b45309' },
    ]);
  } else if (isVenusian) {
    surfaceRows = normalizeRows([
      { name: 'Tholeiitic & Alkali Basalt', formula: '(Ca,Na)(Mg,Fe)Si₂O₆', pct: 44.0 + n1 * 4, phase: 'Igneous Crust', role: 'Global volcanic plains & wrinkle ridges', color: '#854d0e' },
      { name: 'Calcic Plagioclase & Orthopyroxene', formula: 'CaAl₂Si₂O₈ / (Mg,Fe)SiO₃', pct: 26.5 + n2 * 3, phase: 'Tectosilicate', role: 'Tesserae highland plateaus & fold belts', color: '#a16207' },
      { name: 'Anhydrite & Sulfate Weathered Rind', formula: 'CaSO₄ / MgSO₄', pct: 14.8 + n3 * 2, phase: 'Sulfate Rind', role: 'Chemical reaction of SO₂/CO₂ atmosphere with basalt', color: '#ca8a04' },
      { name: 'Hematite & Magnetite Oxides', formula: 'Fe₂O₃ / Fe₃O₄', pct: 8.9 + n4 * 1.5, phase: 'Iron Oxide', role: 'High-T oxidized basaltic regolith', color: '#713f12' },
      { name: 'Pyrite & Lead-Bismuth Sulfide Frost', formula: 'FeS₂ / PbS / Bi₂S₃', pct: 5.8 + n5 * 1.2, phase: 'Metallic Frost', role: 'High-altitude radar-bright mountain peaks', color: '#fde047' },
    ]);
  } else {
    // Standard Terrestrial / Lunar Silicate World
    const waterCov = (hydro?.coveragePct ?? 0) * 0.22;
    const isAirless = pBar < 0.005;
    surfaceRows = normalizeRows([
      {
        name: isAirless ? 'Anorthosite Plagioclase Feldspar' : 'Plagioclase & Alkali Feldspars',
        formula: 'CaAl₂Si₂O₈ / KAlSi₃O₈',
        pct: 34.5 - waterCov * 0.3 + n1 * 3.5,
        phase: 'Tectosilicate',
        role: isAirless ? 'Bright Lunar-type highland crust' : 'Primary continental & highland framework',
        color: '#a8a29e',
      },
      {
        name: 'Augite Pyroxene & Forsterite Olivine',
        formula: '(Ca,Mg,Fe)SiO₃ / (Mg,Fe)₂SiO₄',
        pct: 28.0 + (density - 4.5) * 3.5 - waterCov * 0.25 + n2 * 3,
        phase: 'Mafic Silicate',
        role: isAirless ? 'Dark flood-basalt mare basins' : 'Basaltic oceanic crust & volcanic shields',
        color: '#78716c',
      },
      {
        name: 'Crystalline Quartz & Silica',
        formula: 'SiO₂',
        pct: (isAirless ? 9.5 : 16.5) + n3 * 2.5,
        phase: 'Oxide Mineral',
        role: 'Felsic granites, sandstones & aeolian desert dunes',
        color: '#d6bc8b',
      },
      ...(waterCov > 0.5
        ? [
            {
              name: `Surface Hydrosphere (${surfModel.seaPalette.displayName})`,
              formula: surfModel.seaPalette.solventKey === 'H2O' ? 'H₂O + NaCl(aq)' : surfModel.seaPalette.solventKey,
              pct: Math.min(24, 6.5 + waterCov + n4 * 1.5),
              phase: 'Liquid / Ice',
              role: `Oceans, shelves & polar ice caps (${hydro?.coveragePct ?? 0}% area)`,
              color: '#0ea5e9',
            },
          ]
        : []),
      {
        name: isAirless ? 'Ilmenite & Spinel Oxides' : 'Phyllosilicate Clays & Carbonates',
        formula: isAirless ? 'FeTiO₃ / Fe₃O₄' : 'CaCO₃ / Al₂Si₂O₅(OH)₄',
        pct: 9.8 + n4 * 1.8,
        phase: isAirless ? 'Oxide Mineral' : 'Sedimentary',
        role: isAirless ? 'Titanium-rich basalt regolith' : 'Alluvial basins, soils & carbonate shelves',
        color: '#8c7355',
      },
      {
        name: 'Magnetite, Hematite & Accessory Oxides',
        formula: 'Fe₃O₄ / Fe₂O₃ / Al₂O₃',
        pct: 7.2 + n5 * 1.4,
        phase: 'Refractory Oxide',
        role: 'Heavy mineral sands & banded iron formations',
        color: '#57534e',
      },
    ]);
  }

  // Compute Differentiated Interior Layers for Solid / Supercritical Worlds
  // Core mass fraction scales with bulk density and rock fraction
  const rawCmf =
    rockFrac *
    Math.max(
      0.08,
      Math.min(0.72, 0.31 + (density - 5.0 * rockFrac - 1.3 * iceFrac) * 0.14 + (isIron ? 0.25 : 0))
    );
  const coreMassPct = +(rawCmf * 100).toFixed(1);
  const shellMassPct = +(Math.max(0.8, Math.min(48, iceFrac * 82 + (surfModel.isSupercritical ? 18 : 1.8)))).toFixed(1);
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
  const midMantleDepthKm = Math.round(crustDepthKm + (coreTopDepthKm - crustDepthKm) * 0.45);

  const hasSubOcean = Boolean(
    hydro &&
      (((hydro.iceKm ?? 0) > 0 && (hydro.liqKm ?? 0) > 0) ||
        hydro.state?.toLowerCase().includes('subsurface'))
  );

  const interiorRows: InteriorLayerRow[] = [];

  // Layer 1: Crust / Cryoshell / Hydrosphere
  if (surfModel.isSupercritical) {
    interiorRows.push({
      layerName: 'Supercritical Steam & Fluid Envelope',
      depthRangeKm: `0 – ${crustDepthKm.toLocaleString()} km`,
      massPct: shellMassPct,
      chemistry: 'Supercritical H₂O, CO₂ & Dissolved Silicates',
      formula: 'H₂O(sc) + CO₂ + NaCl',
      state: 'Supercritical Fluid → Plasma-Ionic Water',
      ptRegime: `${Math.round(Tsurf)} – 1,800 K · 220 bar – 15 GPa`,
      color: '#3b82f6',
    });
  } else if (iceFrac >= 0.15) {
    const iceShellKm = Math.max(5, Math.round(hydro?.iceKm || crustDepthKm * 0.45));
    interiorRows.push({
      layerName: 'Cryogenic Lithosphere (Ice Iₕ Shell)',
      depthRangeKm: `0 – ${iceShellKm.toLocaleString()} km`,
      massPct: +(shellMassPct * 0.42).toFixed(1),
      chemistry: isTholin
        ? 'Water Ice Iₕ, Methane Clathrates & Tholin Lag'
        : 'Crystalline Water Ice Iₕ & Sulfate Salts',
      formula: isTholin ? 'H₂O(Iₕ) + CH₄·5.75H₂O' : 'H₂O(Iₕ) + MgSO₄',
      state: 'Rigid Brittle-Convective Ice Crust',
      ptRegime: `${Math.round(Tsurf)} – 260 K · 0 – 0.2 GPa`,
      color: '#bae6fd',
    });

    if (hasSubOcean || (hydro?.liqKm ?? 0) > 0) {
      const ocDepth = Math.max(iceShellKm + 10, Math.min(coreTopDepthKm - 20, iceShellKm + Math.round(hydro?.liqKm || 65)));
      interiorRows.push({
        layerName: 'Subsurface Brine / Ammonia-Water Ocean',
        depthRangeKm: `${iceShellKm.toLocaleString()} – ${ocDepth.toLocaleString()} km`,
        massPct: +(shellMassPct * 0.33).toFixed(1),
        chemistry: 'Liquid Water, Dissolved Ammonia & Magnesium Sulfate',
        formula: 'H₂O(l) + NH₃(aq) + MgSO₄',
        state: 'Conductive Liquid Brine Layer',
        ptRegime: `255 – 295 K · 0.1 – 1.2 GPa`,
        color: '#0284c7',
      });
      interiorRows.push({
        layerName: 'High-Pressure Polymorph Ice Mantle',
        depthRangeKm: `${ocDepth.toLocaleString()} – ${coreTopDepthKm.toLocaleString()} km`,
        massPct: +(shellMassPct * 0.25 + mantleMassPct * 0.25).toFixed(1),
        chemistry: 'High-Density Tetragonal / Cubic Water Ices',
        formula: 'H₂O (Ice V / VI / VII) + NH₃·H₂O',
        state: 'Dense Viscoplastic Crystalline Ice',
        ptRegime: `295 – 850 K · 1.2 – ${Math.max(2, +(centralPressureGPa * 0.35).toFixed(1))} GPa`,
        color: '#6366f1',
      });
    } else {
      interiorRows.push({
        layerName: 'High-Pressure Ice VI / VII Mantle',
        depthRangeKm: `${iceShellKm.toLocaleString()} – ${midMantleDepthKm.toLocaleString()} km`,
        massPct: +(shellMassPct * 0.58).toFixed(1),
        chemistry: 'High-Pressure Water Ice Polymorphs & Clathrates',
        formula: 'H₂O (Ice VI / VII) + CO₂',
        state: 'Solid Convective High-P Ice',
        ptRegime: `250 – 780 K · 0.3 – ${Math.max(1.5, +(centralPressureGPa * 0.3).toFixed(1))} GPa`,
        color: '#60a5fa',
      });
    }
  } else {
    interiorRows.push({
      layerName: surfModel.isMoltenWorld ? 'Foundering Magma-Basalt Quench Crust' : 'Differentiated Crust & Lithosphere',
      depthRangeKm: `0 – ${crustDepthKm.toLocaleString()} km`,
      massPct: shellMassPct,
      chemistry: isCarbon
        ? 'Graphite, Silicon Carbide & Reduced Silicates'
        : isIron
        ? 'Enstatite, Plagioclase & Fe-Ni-S Regolith'
        : 'Felsic-Mafic Feldspars, Basalt & Quartz',
      formula: isCarbon ? 'SiC + C + MgSiO₃' : '(Ca,Na)AlSi₃O₈ + (Mg,Fe)SiO₃',
      state: surfModel.isMoltenWorld ? 'Partially Molten Magma Ocean / Slag' : 'Rigid Crystalline Rock',
      ptRegime: `${Math.round(Tsurf)} – ${Math.min(1450, Math.round(Tsurf + 650))} K · 0 – 1.8 GPa`,
      color: '#a8a29e',
    });
  }

  // Layer 2 & 3: Silicate / Carbide Mantle
  if (iceFrac < 0.15) {
    interiorRows.push({
      layerName: 'Upper Mantle & Asthenosphere',
      depthRangeKm: `${crustDepthKm.toLocaleString()} – ${midMantleDepthKm.toLocaleString()} km`,
      massPct: +(mantleMassPct * 0.42).toFixed(1),
      chemistry: isCarbon
        ? 'Silicon Carbide, Diamond & Forsterite'
        : 'Forsterite Olivine, Wadsleyite, Ringwoodite & Pyroxene',
      formula: isCarbon ? 'SiC + C(d) + Mg₂SiO₄' : 'α/β/γ-(Mg,Fe)₂SiO₄ + (Mg,Fe)SiO₃',
      state: surfModel.isMoltenWorld || tidalW > 0.25 ? 'Convective Magma-Mush Asthenosphere' : 'Viscoplastic Solid Convection',
      ptRegime: `1,200 – ${Math.round(coreTempK * 0.58).toLocaleString()} K · 2 – ${Math.max(4, +(centralPressureGPa * 0.18).toFixed(1))} GPa`,
      color: '#d97706',
    });
  }

  const lowerMantleStart = iceFrac >= 0.15 ? (hasSubOcean ? coreTopDepthKm : midMantleDepthKm) : midMantleDepthKm;
  if (lowerMantleStart < coreTopDepthKm) {
    interiorRows.push({
      layerName: iceFrac >= 0.15 ? 'Hydrated Silicate-Rock Inner Mantle' : 'Lower Mantle (Perovskite / Post-Perovskite)',
      depthRangeKm: `${lowerMantleStart.toLocaleString()} – ${coreTopDepthKm.toLocaleString()} km`,
      massPct: iceFrac >= 0.15 ? +(mantleMassPct * 0.75).toFixed(1) : +(mantleMassPct * 0.58).toFixed(1),
      chemistry: isCarbon
        ? 'Cubic Silicon Carbide & High-Pressure Diamond'
        : iceFrac >= 0.15
        ? 'Antigorite Serpentine, Olivine & Iron Sulfides'
        : 'Bridgmanite (Silicate Perovskite) & Ferropericlase',
      formula: isCarbon
        ? 'β-SiC + C(Diamond)'
        : iceFrac >= 0.15
        ? '(Mg,Fe)₃Si₂O₅(OH)₄ + (Mg,Fe)₂SiO₄'
        : '(Mg,Fe)SiO₃ + (Mg,Fe)O',
      state: 'High-Pressure Crystalline Solid',
      ptRegime: `${Math.round(coreTempK * 0.52).toLocaleString()} – ${Math.round(coreTempK * 0.84).toLocaleString()} K · ${Math.max(2, +(centralPressureGPa * 0.18).toFixed(1))} – ${Math.max(5, +(centralPressureGPa * 0.48).toFixed(1))} GPa`,
      color: '#ea580c',
    });
  }

  // Layer 4: Metallic Core
  const hasLiquidCore = Boolean(mag?.hasActiveDynamo || surfModel.isMoltenWorld || coreTempK > 2400 || tidalW > 0.1);
  interiorRows.push({
    layerName: hasLiquidCore ? 'Differentiated Outer & Inner Metallic Core' : 'Solidified Metallic-Sulfide Core',
    depthRangeKm: `${coreTopDepthKm.toLocaleString()} – ${radiusKm.toLocaleString()} km`,
    massPct: coreMassPct,
    chemistry: isCarbon
      ? 'Iron-Nickel-Silicon Carbide Alloy (Cohenite)'
      : 'Iron-Nickel Alloy with Light Elements (S, Si, O)',
    formula: isCarbon ? 'Fe₃C + Fe₀.₉Ni₀.₁ + FeSi' : 'Fe₀.₈₈Ni₀.₀₈(S,Si)₀.₀₄',
    state: hasLiquidCore ? 'Convecting Liquid Outer Core + Solid Inner Core' : 'Cooled Crystalline Fe-Ni-S Solid',
    ptRegime: `${coreTempK.toLocaleString()} K · ~${centralPressureGPa.toLocaleString()} GPa`,
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
      pct: rockFrac * 14.2 * (mgSiRatio / 0.9),
      color: '#10b981',
    },
    ...(iceFrac >= 0.04 || surfModel.isSupercritical
      ? [
          {
            symbol: 'H/C/N',
            name: 'Volatiles (H, C, N)',
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

  return {
    surfaceTitle: 'Surface Regolith & Crustal Mineralogy',
    surfaceSubtitle: compLabel,
    coreMassPct,
    mantleMassPct,
    shellMassPct,
    centralPressureGPa,
    coreTempK,
    mgSiRatio,
    feMgRatio,
    surfaceRows,
    interiorRows,
    bulkElements,
  };
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
    <div className="bg-[#151d2c] p-3.5 rounded-xl border border-slate-800 flex flex-col gap-3.5 font-mono text-xs">
      {/* Header & Geochemical Ratios */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-cyan-400" />
          <div>
            <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider block">
              Surface &amp; Internal Geochemistry
            </span>
            <span className="text-[10px] text-slate-400">{profile.surfaceSubtitle}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="px-2 py-0.5 rounded bg-[#0c121d] border border-slate-800 text-slate-300">
            Core Mass: <b className="text-amber-300">{profile.coreMassPct}%</b>
          </span>
          <span className="px-2 py-0.5 rounded bg-[#0c121d] border border-slate-800 text-slate-300">
            Central P: <b className="text-sky-300">{profile.centralPressureGPa.toLocaleString()} GPa</b>
          </span>
          <span className="px-2 py-0.5 rounded bg-[#0c121d] border border-slate-800 text-slate-300">
            Core T: <b className="text-rose-300">{profile.coreTempK.toLocaleString()} K</b>
          </span>
          <span className="px-2 py-0.5 rounded bg-[#0c121d] border border-slate-800 text-slate-300">
            Mg/Si: <b className="text-emerald-300">{profile.mgSiRatio}</b> · Fe/Mg:{' '}
            <b className="text-orange-300">{profile.feMgRatio}</b>
          </span>
        </div>
      </div>

      {/* Bulk Elemental Mass Inventory Bar */}
      <div className="bg-[#0c121d] p-2.5 rounded-lg border border-slate-800/90 flex flex-col gap-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-400 uppercase font-bold tracking-wider">
            Bulk Elemental Inventory (By Mass %)
          </span>
          <span className="text-slate-500">Total Differentiated Body</span>
        </div>

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

        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {profile.bulkElements.map((el) => (
            <div key={el.symbol} className="flex items-center gap-1.5 text-[10.5px]">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: el.color }} />
              <span className="text-slate-300">
                <b>{el.symbol}</b> <span className="text-slate-500">({el.name})</span>:
              </span>
              <b className="text-white">{el.pct}%</b>
            </div>
          ))}
        </div>
      </div>

      {/* Two-Column or Stacked Tables: Surface Chemistry & Internal Differentiated Structure */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Table 1: Surface Mineralogy / Upper Cloud Chemistry */}
        <div className="bg-[#0c121d] rounded-lg border border-slate-800 overflow-hidden flex flex-col">
          <div className="px-3 py-2 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[10.5px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              {profile.surfaceTitle}
            </span>
            <span className="text-[9.5px] text-slate-400">wt%</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-800/80 text-[9.5px] text-slate-400 uppercase bg-slate-950/40">
                  <th className="py-1.5 px-2.5">Mineral / Compound</th>
                  <th className="py-1.5 px-2">Formula</th>
                  <th className="py-1.5 px-2 text-right">Frac</th>
                  <th className="py-1.5 px-2.5 hidden sm:table-cell">Geological Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {profile.surfaceRows.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-900/40 transition">
                    <td className="py-1.5 px-2.5 font-semibold text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-xs flex-shrink-0 border border-white/10"
                          style={{ backgroundColor: row.color }}
                        />
                        <span>{row.name}</span>
                      </div>
                      <span className="text-[9.5px] text-slate-500 block sm:hidden mt-0.5">{row.role}</span>
                    </td>
                    <td className="py-1.5 px-2 text-cyan-300 font-bold whitespace-nowrap">{row.formula}</td>
                    <td className="py-1.5 px-2 text-right font-bold text-white whitespace-nowrap">{row.pct}%</td>
                    <td className="py-1.5 px-2.5 text-[10px] text-slate-400 hidden sm:table-cell leading-snug">
                      {row.role}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Internal Differentiated Structure & Phase Chemistry */}
        <div className="bg-[#0c121d] rounded-lg border border-slate-800 overflow-hidden flex flex-col">
          <div className="px-3 py-2 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[10.5px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              Internal Differentiated Structure
            </span>
            <span className="text-[9.5px] text-slate-400">Depth &amp; Mass %</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-800/80 text-[9.5px] text-slate-400 uppercase bg-slate-950/40">
                  <th className="py-1.5 px-2.5">Interior Layer</th>
                  <th className="py-1.5 px-2">Depth</th>
                  <th className="py-1.5 px-2 text-right">Mass</th>
                  <th className="py-1.5 px-2.5">Dominant Phases &amp; P–T</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {profile.interiorRows.map((layer) => (
                  <tr key={layer.layerName} className="hover:bg-slate-900/40 transition">
                    <td className="py-1.5 px-2.5">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: layer.color }}
                        />
                        <span>{layer.layerName}</span>
                      </div>
                      <span className="text-[9.5px] text-slate-400 block ml-4">{layer.state}</span>
                    </td>
                    <td className="py-1.5 px-2 text-sky-300 whitespace-nowrap text-[10px]">{layer.depthRangeKm}</td>
                    <td className="py-1.5 px-2 text-right font-bold text-amber-300 whitespace-nowrap">
                      {layer.massPct}%
                    </td>
                    <td className="py-1.5 px-2.5">
                      <div className="text-emerald-300 font-bold text-[10.5px]">{layer.formula}</div>
                      <div className="text-[9.5px] text-slate-300">{layer.chemistry}</div>
                      <div className="text-[9px] text-slate-500">{layer.ptRegime}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
