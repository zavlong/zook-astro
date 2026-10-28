import React, { useState, useMemo } from 'react';
import {
  X,
  Save,
  Trash2,
  Plus,
  Sparkles,
  Sun,
  Globe,
  Compass,
  Layers,
  Activity,
  Copy,
  Check,
  Disc,
  Wind,
  Droplets,
  Orbit,
} from 'lucide-react';
import {
  RealisticStarSystemResult,
  RealisticPlanetaryZone,
  RealisticPlanetBody,
  RealisticBeltBody,
  RealisticStarNode,
  RealisticMoon,
} from '../stargen/types';
import {
  RealisticPlanetOrBelt,
  getStarStats,
} from '../../core/generation/realisticStarGen';
import { SectorHexSystem } from '../../core/generation/sectorHex';
import { teffToHex } from '../../core/astrophysics/colors';

interface SystemEditorModalProps {
  isOpen: boolean;
  systemResult: RealisticStarSystemResult;
  sectorSystem?: SectorHexSystem | null;
  onSave: (
    updatedSysResult: RealisticStarSystemResult,
    sectorUpdates?: {
      name?: string;
      coord?: string;
      age?: number;
      mass?: number;
      metallicity?: number;
    }
  ) => void;
  onClose: () => void;
}

export const PLANET_CLASSES = [
  'Terrestrial World',
  'Sub-Earth World',
  'Super-Earth World',
  'Desert World',
  'Ocean World',
  'Ice World',
  'Cryo-Ammonia World',
  'Sub-Neptune',
  'Gas Dwarf',
  'Gas Giant Class I (Ammonia Clouds)',
  'Gas Giant Class II (Water Clouds)',
  'Gas Giant Class III (Cloudless)',
  'Gas Giant Class IV (Alkali Metals)',
  'Gas Giant Class V (Silicate Clouds)',
  'Hot Jupiter',
  'Lava World',
  'Carbon World',
  'Iron Core World',
];

export const MOON_CLASSES = [
  'Silicate Rocky Moon',
  'Ice Moon',
  'Cryo-Ammonia Moon',
  'Sub-Moon',
  'Captured Asteroid',
  'Supercritical Water Moon',
  'Molten Moon',
];

export const ATMOSPHERE_TYPES = [
  'Nitrogen-Oxygen (Earth-like)',
  'Dense Carbon Dioxide (Venusian)',
  'Thin Carbon Dioxide (Martian)',
  'Hydrogen-Helium (Jovian)',
  'Methane-Nitrogen (Cryogenic Titan-like)',
  'Ammonia-Water (Reducing)',
  'Sulfur Dioxide & Volcanic',
  'Trace / Exosphere',
  'Airless Vacuum',
];

export const OCEAN_SOLVENTS = [
  'Water (H2O)',
  'Ammonia (NH3)',
  'Methane (CH4)',
  'Supercritical CO2',
  'Sulfuric Acid (H2SO4)',
  'Hydrocarbons',
  'Acidic Heavy Brine',
];

export const BIOSPHERE_TYPES = [
  'Barren / Sterile',
  'Prebiotic Organic Soup',
  'Chemotrophic Archaea',
  'Extremophile Microbes',
  'Photosynthetic Microcellular',
  'Multicellular Marine Ecosystem',
  'Terrestrial Flora & Fauna',
  'Complex Sentient Biosphere',
];

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

/**
 * Computes Holman & Wiegert (1999) astronomical stability limits and regime
 * for a binary or multiple stellar split.
 */
export function calculateSplitLimits(aBin: number, eBin: number, mA: number, mB: number) {
  const mTot = Math.max(0.01, mA + mB);
  const muA = mB / mTot;
  const muB = mA / mTot;
  const muM = Math.min(muA, muB);
  const e = Math.min(0.95, Math.max(0, eBin));
  const sA =
    aBin *
    (0.464 -
      0.38 * muA -
      0.631 * e +
      0.586 * muA * e +
      0.15 * e * e -
      0.198 * muA * e * e);
  const sB =
    aBin *
    (0.464 -
      0.38 * muB -
      0.631 * e +
      0.586 * muB * e +
      0.15 * e * e -
      0.198 * muB * e * e);
  const pM =
    aBin *
    (1.6 +
      5.1 * e -
      2.22 * e * e +
      4.12 * muM -
      4.27 * e * muM -
      5.09 * muM * muM +
      4.61 * e * e * muM * muM);
  const sc = Math.pow(Math.max(0.1, mTot), 0.75);
  const reg =
    aBin < 0.5 * sc
      ? 'P-Type (Circumbinary)'
      : aBin <= 50 * sc
      ? 'Mixed (Truncated S + P)'
      : 'S-Type (Wide)';
  return {
    sMaxA: +Math.max(0, sA).toFixed(2),
    sMaxB: +Math.max(0, sB).toFixed(2),
    pMin: +Math.max(0.01, pM).toFixed(2),
    regime: reg,
  };
}

export const SystemEditorModal: React.FC<SystemEditorModalProps> = ({
  isOpen,
  systemResult,
  sectorSystem,
  onSave,
  onClose,
}) => {
  if (!isOpen) return null;

  // Deep clone system result to allow safe in-place draft edits
  const [draftResult, setDraftResult] = useState<RealisticStarSystemResult>(() => {
    return JSON.parse(JSON.stringify(systemResult));
  });

  // Sector System metadata
  const [sysName, setSysName] = useState<string>(
    sectorSystem?.name || draftResult.step1?.name || draftResult.step1?.id || 'Custom Star System'
  );
  const [sysAge, setSysAge] = useState<number>(sectorSystem?.age ?? draftResult.step1?.age ?? 4.6);
  const [sysMass, setSysMass] = useState<number>(
    sectorSystem?.mass ?? draftResult.step1?.sysMass ?? 1.0
  );
  const [sysFeh, setSysFeh] = useState<number>(
    sectorSystem?.metallicity ?? draftResult.step1?.feh ?? 0.0
  );
  const [sysCoord, setSysCoord] = useState<string>(sectorSystem?.coord || '0101');

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<'system' | 'stars' | 'planets' | 'json'>('planets');

  // Selected Zone & Body index
  const [selectedZoneIdx, setSelectedZoneIdx] = useState<number>(0);
  const [selectedBodyIdx, setSelectedBodyIdx] = useState<number>(0);
  const [selectedMoonIdx, setSelectedMoonIdx] = useState<number>(-1);

  // Status message
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const currentZone = draftResult.zones[selectedZoneIdx] as RealisticPlanetaryZone | undefined;
  const currentBody = currentZone?.bodies[selectedBodyIdx] as RealisticPlanetOrBelt | undefined;
  const isPlanet = currentBody?.kind === 'planet';
  const planetBody = isPlanet ? (currentBody as RealisticPlanetBody) : null;
  const beltBody = !isPlanet && currentBody?.kind === 'belt' ? (currentBody as RealisticBeltBody) : null;
  const currentMoon =
    planetBody && selectedMoonIdx >= 0 && planetBody.moons && planetBody.moons[selectedMoonIdx]
      ? planetBody.moons[selectedMoonIdx]
      : null;

  // Primary Star luminosity for Keplerian orbits & equilibrium temp
  const hostStarLum = useMemo(() => {
    const sA = draftResult.hierarchy.stars[0];
    if (typeof sA?.lumNum === 'number' && sA.lumNum > 0) return sA.lumNum;
    return 1.0;
  }, [draftResult.hierarchy.stars]);

  const hostStarMass = useMemo(() => {
    const sA = draftResult.hierarchy.stars[0];
    return sA?.mass || 1.0;
  }, [draftResult.hierarchy.stars]);

  // --------------------------------------------------------------------------
  // Update Helpers
  // --------------------------------------------------------------------------
  const updatePlanetField = <K extends keyof RealisticPlanetBody>(
    field: K,
    value: RealisticPlanetBody[K]
  ) => {
    if (!currentZone || !planetBody) return;
    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      const target = copy.zones[selectedZoneIdx]?.bodies[selectedBodyIdx] as RealisticPlanetBody;
      if (target && target.kind === 'planet') {
        target[field] = value;
      }
      return copy;
    });
  };

  const updateBeltField = <K extends keyof RealisticBeltBody>(
    field: K,
    value: RealisticBeltBody[K]
  ) => {
    if (!currentZone || !beltBody) return;
    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      const target = copy.zones[selectedZoneIdx]?.bodies[selectedBodyIdx] as RealisticBeltBody;
      if (target && target.kind === 'belt') {
        target[field] = value;
      }
      return copy;
    });
  };

  const updateStarField = (starIdx: number, field: keyof RealisticStarNode, value: any) => {
    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      const target = copy.hierarchy.stars[starIdx];
      if (target) {
        (target as any)[field] = value;
        // Auto-update color hex if Teff changed
        if (field === 'Teff' && typeof value === 'number') {
          target.colorHex = teffToHex(value);
        }
      }
      return copy;
    });
  };

  const handleAddStar = () => {
    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      const currentCount = copy.hierarchy.stars.length;
      if (currentCount >= 4) return copy;

      const newIdx = currentCount;
      const label = STAR_LABELS[newIdx];
      const primaryMass = copy.hierarchy.stars[0]?.mass || 1.0;
      const defaultMass = Math.max(0.08, +(primaryMass * (0.7 / (newIdx + 0.3))).toFixed(2));
      const newStar = getStarStats(defaultMass, sysAge, sysFeh, label);
      copy.hierarchy.stars.push(newStar);

      // Add corresponding binary split
      if (newIdx === 1) {
        const lim = calculateSplitLimits(30.0, 0.15, primaryMass, newStar.mass);
        copy.hierarchy.splits = [
          {
            pair: 'AB',
            a_AU: 30.0,
            e: 0.15,
            regime: lim.regime,
            sMaxA: lim.sMaxA,
            sMaxB: lim.sMaxB,
            pMin: lim.pMin,
          },
        ];
        copy.hierarchy.archName = `Binary (${lim.regime})`;
      } else if (newIdx === 2) {
        const mAB = copy.hierarchy.stars[0].mass + copy.hierarchy.stars[1].mass;
        const lim = calculateSplitLimits(350.0, 0.25, mAB, newStar.mass);
        copy.hierarchy.splits.push({
          pair: 'AB + C',
          a_AU: 350.0,
          e: 0.25,
          regime: lim.regime,
          sMaxA: lim.sMaxA,
          sMaxB: lim.sMaxB,
          pMin: lim.pMin,
        });
        copy.hierarchy.archName = 'Trinary ((A+B) + C)';
      } else if (newIdx === 3) {
        const mAB = copy.hierarchy.stars[0].mass + copy.hierarchy.stars[1].mass;
        const mCD = copy.hierarchy.stars[2].mass + newStar.mass;
        const lim = calculateSplitLimits(1800.0, 0.35, mAB, mCD);
        copy.hierarchy.splits.push({
          pair: 'AB + CD',
          a_AU: 1800.0,
          e: 0.35,
          regime: lim.regime,
          sMaxA: lim.sMaxA,
          sMaxB: lim.sMaxB,
          pMin: lim.pMin,
        });
        copy.hierarchy.archName = 'Quadruple ((A+B) + (C+D))';
      }

      return copy;
    });
  };

  const handleDeleteStar = (starIdx: number) => {
    if (starIdx === 0) return; // Cannot delete primary star A
    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      if (starIdx >= copy.hierarchy.stars.length) return copy;

      const removedLabel = copy.hierarchy.stars[starIdx].label;
      const newStars = copy.hierarchy.stars.filter((_, idx) => idx !== starIdx);
      newStars.forEach((s, idx) => {
        s.label = STAR_LABELS[idx];
      });
      copy.hierarchy.stars = newStars;

      if (newStars.length === 1) {
        copy.hierarchy.splits = [];
        copy.hierarchy.archName = 'Single Star';
      } else if (newStars.length === 2) {
        copy.hierarchy.splits = copy.hierarchy.splits.slice(0, 1);
        if (copy.hierarchy.splits[0]) {
          copy.hierarchy.splits[0].pair = 'AB';
          const lim = calculateSplitLimits(
            copy.hierarchy.splits[0].a_AU,
            copy.hierarchy.splits[0].e,
            newStars[0].mass,
            newStars[1].mass
          );
          copy.hierarchy.splits[0].regime = lim.regime;
          copy.hierarchy.splits[0].sMaxA = lim.sMaxA;
          copy.hierarchy.splits[0].sMaxB = lim.sMaxB;
          copy.hierarchy.splits[0].pMin = lim.pMin;
          copy.hierarchy.archName = `Binary (${lim.regime})`;
        }
      } else if (newStars.length === 3) {
        copy.hierarchy.splits = copy.hierarchy.splits.slice(0, 2);
        if (copy.hierarchy.splits[0]) copy.hierarchy.splits[0].pair = 'AB';
        if (copy.hierarchy.splits[1]) copy.hierarchy.splits[1].pair = 'AB + C';
        copy.hierarchy.archName = 'Trinary ((A+B) + C)';
      }

      // Reassign any zones referencing the removed star label to primary star A
      copy.zones.forEach((z) => {
        if (z.starLabel === removedLabel) {
          z.starLabel = 'A';
          z.title = `Star A (${newStars[0].spectralType})`;
        }
      });

      return copy;
    });
  };

  const handleSetStarCount = (targetCount: number) => {
    if (targetCount < 1 || targetCount > 4) return;
    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      const currentCount = copy.hierarchy.stars.length;
      if (targetCount === currentCount) return copy;

      if (targetCount < currentCount) {
        copy.hierarchy.stars = copy.hierarchy.stars.slice(0, targetCount);
        copy.hierarchy.stars.forEach((s, idx) => {
          s.label = STAR_LABELS[idx];
        });
        if (targetCount === 1) {
          copy.hierarchy.splits = [];
          copy.hierarchy.archName = 'Single Star';
        } else if (targetCount === 2) {
          copy.hierarchy.splits = copy.hierarchy.splits.slice(0, 1);
          if (copy.hierarchy.splits[0]) copy.hierarchy.splits[0].pair = 'AB';
          copy.hierarchy.archName = 'Binary Star System';
        } else if (targetCount === 3) {
          copy.hierarchy.splits = copy.hierarchy.splits.slice(0, 2);
          if (copy.hierarchy.splits[0]) copy.hierarchy.splits[0].pair = 'AB';
          if (copy.hierarchy.splits[1]) copy.hierarchy.splits[1].pair = 'AB + C';
          copy.hierarchy.archName = 'Trinary ((A+B) + C)';
        }
      } else {
        const primaryMass = copy.hierarchy.stars[0]?.mass || 1.0;
        for (let idx = currentCount; idx < targetCount; idx++) {
          const label = STAR_LABELS[idx];
          const defaultMass = Math.max(0.08, +(primaryMass * (0.7 / (idx + 0.3))).toFixed(2));
          const newStar = getStarStats(defaultMass, sysAge, sysFeh, label);
          copy.hierarchy.stars.push(newStar);

          if (idx === 1) {
            const lim = calculateSplitLimits(30.0, 0.15, copy.hierarchy.stars[0].mass, newStar.mass);
            copy.hierarchy.splits = [
              {
                pair: 'AB',
                a_AU: 30.0,
                e: 0.15,
                regime: lim.regime,
                sMaxA: lim.sMaxA,
                sMaxB: lim.sMaxB,
                pMin: lim.pMin,
              },
            ];
          } else if (idx === 2) {
            const mAB = copy.hierarchy.stars[0].mass + copy.hierarchy.stars[1].mass;
            const lim = calculateSplitLimits(350.0, 0.25, mAB, newStar.mass);
            copy.hierarchy.splits.push({
              pair: 'AB + C',
              a_AU: 350.0,
              e: 0.25,
              regime: lim.regime,
              sMaxA: lim.sMaxA,
              sMaxB: lim.sMaxB,
              pMin: lim.pMin,
            });
          } else if (idx === 3) {
            const mAB = copy.hierarchy.stars[0].mass + copy.hierarchy.stars[1].mass;
            const mCD = copy.hierarchy.stars[2].mass + newStar.mass;
            const lim = calculateSplitLimits(1800.0, 0.35, mAB, mCD);
            copy.hierarchy.splits.push({
              pair: 'AB + CD',
              a_AU: 1800.0,
              e: 0.35,
              regime: lim.regime,
              sMaxA: lim.sMaxA,
              sMaxB: lim.sMaxB,
              pMin: lim.pMin,
            });
          }
        }
        if (targetCount === 2) copy.hierarchy.archName = 'Binary Star System';
        else if (targetCount === 3) copy.hierarchy.archName = 'Trinary ((A+B) + C)';
        else if (targetCount === 4) copy.hierarchy.archName = 'Quadruple ((A+B) + (C+D))';
      }

      return copy;
    });
  };

  const handleAutoCalculateStar = (starIdx: number) => {
    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      const target = copy.hierarchy.stars[starIdx];
      if (!target) return copy;
      const currentMass = Math.max(0.08, target.mass || 1.0);
      const computed = getStarStats(currentMass, sysAge, sysFeh, target.label);
      target.radius = computed.radius;
      target.Teff = computed.Teff;
      target.lum = computed.lum;
      target.lumNum = computed.lumNum;
      target.logg = computed.logg;
      target.spectralType = computed.spectralType;
      target.category = computed.category;
      target.colorHex = computed.colorHex;
      return copy;
    });
  };

  const updateSplitField = (splitIdx: number, field: 'a_AU' | 'e', value: number) => {
    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      const split = copy.hierarchy.splits[splitIdx];
      if (!split) return copy;
      split[field] = value;
      const stars = copy.hierarchy.stars;
      const mA = stars[0]?.mass || 1.0;
      const mB = stars[1]?.mass || 0.5;
      const mC = stars[2]?.mass || 0.3;
      const mD = stars[3]?.mass || 0.2;
      let leftMass = mA;
      let rightMass = mB;
      if (splitIdx === 1) {
        leftMass = mA + mB;
        rightMass = mC;
      } else if (splitIdx === 2) {
        leftMass = mA + mB;
        rightMass = mC + mD;
      }
      const lim = calculateSplitLimits(split.a_AU, split.e, leftMass, rightMass);
      split.regime = lim.regime;
      split.sMaxA = lim.sMaxA;
      split.sMaxB = lim.sMaxB;
      split.pMin = lim.pMin;

      if (splitIdx === 0 && copy.hierarchy.stars.length === 2) {
        copy.hierarchy.archName = `Binary (${lim.regime})`;
      }
      return copy;
    });
  };

  const updateMoonField = <K extends keyof RealisticMoon>(field: K, value: RealisticMoon[K]) => {
    if (!currentZone || !planetBody || selectedMoonIdx < 0) return;
    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      const targetP = copy.zones[selectedZoneIdx]?.bodies[selectedBodyIdx] as RealisticPlanetBody;
      if (targetP && targetP.kind === 'planet' && targetP.moons && targetP.moons[selectedMoonIdx]) {
        targetP.moons[selectedMoonIdx][field] = value;
      }
      return copy;
    });
  };

  // --------------------------------------------------------------------------
  // Auto-Calculate Physics Helpers
  // --------------------------------------------------------------------------
  const handleAutoCalculateBodyPhysics = () => {
    if (!planetBody) return;
    const a = Math.max(0.01, planetBody.a || 1.0);
    const mEarth = Math.max(0.001, planetBody.massEarth || 1.0);
    const rEarth = Math.max(0.01, planetBody.radiusEarth || 1.0);

    // Surface gravity g = M / R^2
    const gravityG = +(mEarth / (rEarth * rEarth)).toFixed(3);
    // Density g/cm3 = 5.515 * (M / R^3)
    const densityGcm3 = +(5.515 * (mEarth / Math.pow(rEarth, 3))).toFixed(2);
    // Orbital period days = 365.25 * sqrt(a^3 / M_star)
    const periodDays = +(365.25 * Math.sqrt(Math.pow(a, 3) / hostStarMass)).toFixed(1);

    // Equilibrium temperature Teq = Teff * sqrt(Rstar / 2a) * (1 - albedo)^0.25
    // Simplified standard: Teq = 278.5 * (L^0.25) / sqrt(a) * (1 - albedo)^0.25
    const albedo = planetBody.albedo ?? 0.3;
    const Teq = Math.round(278.5 * (Math.pow(hostStarLum, 0.25) / Math.sqrt(a)) * Math.pow(1 - albedo, 0.25));
    const greenhouse = planetBody.greenhouseK ?? (planetBody.pressureBar ? Math.round(planetBody.pressureBar * 12) : 0);
    const Tsurf = Math.max(3, Teq + greenhouse);

    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      const target = copy.zones[selectedZoneIdx]?.bodies[selectedBodyIdx] as RealisticPlanetBody;
      if (target && target.kind === 'planet') {
        target.gravityG = gravityG;
        target.densityGcm3 = densityGcm3;
        target.orbitalPeriodDays = periodDays;
        target.T_eq = Teq;
        target.surfaceTempK = Tsurf;
        target.greenhouseK = greenhouse;
      }
      return copy;
    });
  };

  // --------------------------------------------------------------------------
  // Add / Delete Bodies & Moons
  // --------------------------------------------------------------------------
  const handleAddPlanet = () => {
    if (!currentZone) return;
    const lastBody = currentZone.bodies[currentZone.bodies.length - 1];
    const newA = +(lastBody ? (lastBody.a || 1.0) * 1.45 : 1.0).toFixed(3);
    const newPlanetName = `Planet ${String.fromCharCode(65 + currentZone.bodies.length)}`;

    const newPlanet: RealisticPlanetBody = {
      kind: 'planet',
      role: newPlanetName,
      a: newA,
      a_birth: newA,
      e: 0.02,
      incDeg: +(Math.random() * 3.5).toFixed(1),
      omegaNodeDeg: Math.round(Math.random() * 360),
      argPeriDeg: Math.round(Math.random() * 360),
      migrationHistory: 'In-situ formation',
      massEarth: 1.0,
      massJup: +(1.0 / 317.83).toFixed(5),
      radiusEarth: 1.0,
      densityGcm3: 5.51,
      gravityG: 1.0,
      rockFrac: 0.68,
      iceFrac: 0.30,
      gasFrac: 0.02,
      T_eq: 255,
      T_atm: 260,
      surfaceTempK: 288,
      greenhouseK: 33,
      muMin: 18,
      albedo: 0.30,
      pressureBar: 1.013,
      sudarskyClass: null,
      planetClass: 'Terrestrial World',
      atmosphereType: 'Nitrogen-Oxygen (Earth-like)',
      gases: { N2: 78.08, O2: 20.95, Ar: 0.93, CO2: 0.04 },
      hydrosphere: {
        state: 'Liquid Oceans',
        solvent: 'Water (H2O)',
        coveragePct: 71,
        biosphere: 'Terrestrial Flora & Fauna',
        liqKm: 3.8,
        scKm: 0,
        iceKm: 0.1,
        siKm: 0,
        crustKm: 35,
      },
      rings: null,
      ringSystem: null,
      rocheLimitRp: 2.44,
      moons: [],
      orbitalPeriodDays: +(365.25 * Math.sqrt(Math.pow(newA, 3) / hostStarMass)).toFixed(1),
      rotationHours: 24.0,
      spinState: 'Prograde',
      axialTiltDeg: 23.4,
      magneticField: {
        surfaceFieldGauss: 0.5,
        surfaceFieldMicroTesla: 50,
        magneticMomentEarth: 1.0,
        dynamoStatus: 'Active Geodynamo',
        hasActiveDynamo: true,
        coreState: 'Liquid Outer Molten Core',
        magnetopauseRadiusRp: 10.5,
        bowShockRadiusRp: 14.0,
        shieldingEfficiencyPct: 98,
        radiationLevel: 'Minimal',
        auroraDescription: 'Vibrant polar geomagnetic curtains',
        biosphereImplication: 'Full protection against stellar cosmic rays',
      },
    };

    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      copy.zones[selectedZoneIdx].bodies.push(newPlanet);
      return copy;
    });
    setSelectedBodyIdx(currentZone.bodies.length);
    setSelectedMoonIdx(-1);
  };

  const handleAddAsteroidBelt = () => {
    if (!currentZone) return;
    const lastBody = currentZone.bodies[currentZone.bodies.length - 1];
    const newA = +(lastBody ? (lastBody.a || 1.0) * 1.35 : 2.8).toFixed(3);

    const newBelt: RealisticBeltBody = {
      kind: 'belt',
      role: 'Asteroid Belt',
      a: newA,
      a_birth: newA,
      beltWidth: +(newA * 0.35).toFixed(2),
      rawSlotMassEarth: 0.002,
      massEarth: 0.001,
      incDeg: 4.5,
      omegaNodeDeg: 78,
    };

    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      copy.zones[selectedZoneIdx].bodies.push(newBelt);
      return copy;
    });
    setSelectedBodyIdx(currentZone.bodies.length);
    setSelectedMoonIdx(-1);
  };

  const handleDeleteBody = (idx: number) => {
    if (!currentZone || currentZone.bodies.length <= 1) return;
    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      copy.zones[selectedZoneIdx].bodies.splice(idx, 1);
      return copy;
    });
    setSelectedBodyIdx(Math.max(0, idx - 1));
    setSelectedMoonIdx(-1);
  };

  const handleAddMoon = () => {
    if (!planetBody) return;
    const moonCount = planetBody.moons?.length || 0;
    const newMoonName = `${planetBody.role || 'Planet'} Moon ${moonCount + 1}`;
    const newMoon: RealisticMoon = {
      id: `moon-${Date.now()}-${moonCount}`,
      name: newMoonName,
      moonClass: 'Silicate Rocky Moon',
      origin: 'Accretion Disk',
      a_Rp: +(15 + moonCount * 12).toFixed(1),
      a_km: Math.round((15 + moonCount * 12) * 6371),
      e: 0.005,
      incDeg: 1.2,
      periodDays: +(5.0 + moonCount * 4.5).toFixed(2),
      massEarth: 0.0123,
      massLunar: 1.0,
      radiusEarth: 0.272,
      radiusKm: 1737,
      densityGcm3: 3.34,
      gravityG: 0.166,
      rockFrac: 0.98,
      iceFrac: 0.02,
      gasFrac: 0,
      albedo: 0.12,
      T_eq: planetBody.T_eq || 250,
      T_atm: planetBody.T_eq || 250,
      surfaceTempK: planetBody.T_eq || 250,
      greenhouseK: 0,
      tidalW: 1e12,
      tidalFluxWm2: 0.01,
      muMin: 32,
      pressureBar: 0,
      atmosphereType: 'Airless Vacuum',
      gases: {},
      hydrosphere: null,
      retrograde: false,
      rotationHours: 120,
      spinState: 'Tidally Locked',
      axialTiltDeg: 1.5,
    };

    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      const targetP = copy.zones[selectedZoneIdx]?.bodies[selectedBodyIdx] as RealisticPlanetBody;
      if (targetP && targetP.kind === 'planet') {
        if (!targetP.moons) targetP.moons = [];
        targetP.moons.push(newMoon);
      }
      return copy;
    });
    setSelectedMoonIdx(planetBody.moons ? planetBody.moons.length : 0);
  };

  const handleDeleteMoon = (mIdx: number) => {
    if (!planetBody || !planetBody.moons) return;
    setDraftResult((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as RealisticStarSystemResult;
      const targetP = copy.zones[selectedZoneIdx]?.bodies[selectedBodyIdx] as RealisticPlanetBody;
      if (targetP && targetP.kind === 'planet' && targetP.moons) {
        targetP.moons.splice(mIdx, 1);
      }
      return copy;
    });
    setSelectedMoonIdx(Math.max(-1, mIdx - 1));
  };

  // --------------------------------------------------------------------------
  // Save All Changes
  // --------------------------------------------------------------------------
  const handleSaveAll = () => {
    // Recompute total system stellar mass from stars
    const totalMass = draftResult.hierarchy?.stars?.reduce((sum, s) => sum + (s.mass || 0), 0) || 0;
    const resolvedMass = totalMass > 0 ? +totalMass.toFixed(2) : sysMass;

    // Sync step1 header
    if (!draftResult.step1) {
      draftResult.step1 = {
        sysMass: resolvedMass,
        age: sysAge,
        feh: sysFeh,
        forcedMult: 'auto',
      };
    }
    draftResult.step1.name = sysName;
    draftResult.step1.age = sysAge;
    draftResult.step1.sysMass = resolvedMass;
    draftResult.step1.feh = sysFeh;

    onSave(draftResult, {
      name: sysName,
      coord: sysCoord,
      age: sysAge,
      mass: resolvedMass,
      metallicity: sysFeh,
    });

    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 550);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 select-none">
      <div className="relative w-full max-w-6xl h-[92vh] flex flex-col bg-slate-950/95 border border-cyan-500/40 rounded-2xl shadow-2xl shadow-cyan-950/50 overflow-hidden text-slate-100 font-sans">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-gradient-to-r from-slate-900/90 via-slate-950 to-slate-900/90 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-md shadow-cyan-500/20">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
                  Universal Star & Planet Architect
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950/80 border border-cyan-700/60 text-cyan-300">
                  Sector Hex {sysCoord}
                </span>
              </div>
              <input
                type="text"
                value={sysName}
                onChange={(e) => setSysName(e.target.value)}
                className="text-lg font-bold font-mono text-white bg-transparent border-b border-dashed border-cyan-500/40 hover:border-cyan-400 focus:border-cyan-400 focus:outline-none transition px-0.5 py-0"
                placeholder="Enter system name..."
              />
            </div>
          </div>

          {/* Top Actions & Tabs */}
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-900/90 p-1 rounded-xl border border-slate-800/90">
              <button
                onClick={() => setActiveTab('planets')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                  activeTab === 'planets'
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Planets & Orbits ({currentZone?.bodies.length || 0})</span>
              </button>
              <button
                onClick={() => setActiveTab('stars')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                  activeTab === 'stars'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Stars ({draftResult.hierarchy.stars.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('system')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                  activeTab === 'system'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>System Parameters</span>
              </button>
              <button
                onClick={() => setActiveTab('json')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                  activeTab === 'json'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
            </div>

            <button
              onClick={handleSaveAll}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-xs font-bold transition shadow-lg ${
                saveSuccess
                  ? 'bg-emerald-600 text-white shadow-emerald-500/40'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-600/30 border border-cyan-400/40 hover:scale-105 active:scale-95'
              }`}
            >
              {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{saveSuccess ? 'Changes Saved!' : 'Save System'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
              title="Close editor without saving"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden bg-slate-950/70">
          {/* ================================================================= */}
          {/* TAB 1: PLANETS & ORBITS                                           */}
          {/* ================================================================= */}
          {activeTab === 'planets' && (
            <>
              {/* Left Column: List of bodies in current zone */}
              <div className="w-72 flex-shrink-0 border-r border-slate-800/80 flex flex-col bg-slate-950/90">
                {draftResult.zones.length > 1 && (
                  <div className="flex gap-1 p-2 border-b border-slate-800/80 bg-slate-900/60 overflow-x-auto custom-scrollbar">
                    {draftResult.zones.map((z, zIdx) => (
                      <button
                        key={`zone-tab-${zIdx}`}
                        onClick={() => {
                          setSelectedZoneIdx(zIdx);
                          setSelectedBodyIdx(0);
                          setSelectedMoonIdx(-1);
                        }}
                        className={`px-2 py-1 rounded text-[10px] font-mono font-semibold transition ${
                          selectedZoneIdx === zIdx
                            ? 'bg-cyan-600 text-white'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {z.title || `Zone ${zIdx + 1}`}
                      </button>
                    ))}
                  </div>
                )}

                <div className="p-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                    Planetary Bodies
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleAddPlanet}
                      className="px-2 py-1 rounded bg-cyan-950/80 border border-cyan-700/60 hover:bg-cyan-800 text-cyan-200 text-[10px] font-mono font-semibold flex items-center gap-1 transition"
                      title="Add new planet"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Planet</span>
                    </button>
                    <button
                      onClick={handleAddAsteroidBelt}
                      className="px-2 py-1 rounded bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 text-[10px] font-mono font-semibold flex items-center gap-1 transition"
                      title="Add asteroid belt"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Belt</span>
                    </button>
                  </div>
                </div>

                {/* Bodies List Scroll */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                  {currentZone?.bodies.map((body, bIdx) => {
                    const isSelected = selectedBodyIdx === bIdx;
                    const isPl = body.kind === 'planet';
                    const p = isPl ? (body as RealisticPlanetBody) : null;

                    return (
                      <div
                        key={`body-${bIdx}`}
                        onClick={() => {
                          setSelectedBodyIdx(bIdx);
                          setSelectedMoonIdx(-1);
                        }}
                        className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between group ${
                          isSelected
                            ? 'bg-cyan-950/60 border-cyan-500/70 shadow-md shadow-cyan-950/40 text-cyan-100'
                            : 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-900/80 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-base flex-shrink-0">
                            {isPl ? '🪐' : '🪨'}
                          </span>
                          <div className="min-w-0">
                            <div className="font-semibold text-xs truncate">
                              {body.role || (isPl ? `Planet ${bIdx + 1}` : 'Belt')}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 truncate">
                              {body.a} AU &bull; {isPl ? p?.planetClass : 'Asteroid Belt'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          {currentZone.bodies.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteBody(bIdx);
                              }}
                              className="p-1 rounded text-red-400 hover:bg-red-950/50 transition"
                              title="Delete body"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Center / Right Column: Deep Body Inspector & Editor */}
              <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-950/50">
                {currentBody && isPlanet && planetBody && (
                  <>
                    {/* Header Card */}
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-slate-900/80 via-slate-950 to-slate-900/80 border border-slate-800/80">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-3xl shadow-inner">
                          🪐
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={planetBody.role || ''}
                              onChange={(e) => updatePlanetField('role', e.target.value)}
                              className="text-lg font-bold font-mono text-white bg-transparent border-b border-dashed border-cyan-500/40 hover:border-cyan-400 focus:border-cyan-400 focus:outline-none transition px-0.5"
                              placeholder="Planet Name"
                            />
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-700/60 text-cyan-300">
                              Orbit #{selectedBodyIdx + 1}
                            </span>
                          </div>
                          <div className="text-xs font-mono text-slate-400 mt-1">
                            {planetBody.a} AU &bull; {planetBody.orbitalPeriodDays} Days &bull; {planetBody.surfaceTempK} K
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleAutoCalculateBodyPhysics}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/80 border border-indigo-700/60 hover:bg-indigo-900 text-indigo-200 text-xs font-mono font-semibold transition"
                          title="Auto-calculate gravity, density, period and equilibrium temperature from physics"
                        >
                          <Activity className="w-3.5 h-3.5" />
                          <span>Auto Physics</span>
                        </button>
                        <button
                          onClick={handleAddMoon}
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
                            type="number"
                            step="0.01"
                            min="0.01"
                            max="250"
                            value={planetBody.a}
                            onChange={(e) => updatePlanetField('a', parseFloat(e.target.value) || 0.1)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Eccentricity (e)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="0.95"
                            value={planetBody.e}
                            onChange={(e) => updatePlanetField('e', parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Orbital Period (Days)</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={planetBody.orbitalPeriodDays}
                            onChange={(e) => updatePlanetField('orbitalPeriodDays', parseFloat(e.target.value) || 1)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Inclination (Deg)</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="90"
                            value={planetBody.incDeg}
                            onChange={(e) => updatePlanetField('incDeg', parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Rotation (Hours)</label>
                          <input
                            type="number"
                            step="0.1"
                            min="1"
                            value={planetBody.rotationHours}
                            onChange={(e) => updatePlanetField('rotationHours', parseFloat(e.target.value) || 24)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Axial Tilt (Deg)</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="180"
                            value={planetBody.axialTiltDeg}
                            onChange={(e) => updatePlanetField('axialTiltDeg', parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Spin State</label>
                          <select
                            value={planetBody.spinState || 'Prograde'}
                            onChange={(e) => updatePlanetField('spinState', e.target.value)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
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
                            onChange={(e) => updatePlanetField('planetClass', e.target.value)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
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
                            type="number"
                            step="0.01"
                            min="0.001"
                            max="5000"
                            value={planetBody.massEarth}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 1.0;
                              updatePlanetField('massEarth', val);
                              updatePlanetField('massJup', +(val / 317.83).toFixed(5));
                            }}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Radius (R⊕)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.05"
                            max="30"
                            value={planetBody.radiusEarth}
                            onChange={(e) => updatePlanetField('radiusEarth', parseFloat(e.target.value) || 1.0)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Surface Gravity (g)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={planetBody.gravityG}
                            onChange={(e) => updatePlanetField('gravityG', parseFloat(e.target.value) || 1.0)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Density (g/cm³)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.1"
                            value={planetBody.densityGcm3}
                            onChange={(e) => updatePlanetField('densityGcm3', parseFloat(e.target.value) || 5.5)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Rock Fraction (0-1)</label>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            max="1"
                            value={planetBody.rockFrac}
                            onChange={(e) => updatePlanetField('rockFrac', parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Ice Fraction (0-1)</label>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            max="1"
                            value={planetBody.iceFrac}
                            onChange={(e) => updatePlanetField('iceFrac', parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Section: Atmosphere & Climate */}
                    <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-teal-400">
                        <Wind className="w-4 h-4" />
                        <span>Atmosphere & Climate</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="col-span-2">
                          <label className="text-[11px] font-mono text-slate-400">Atmosphere Type</label>
                          <select
                            value={planetBody.atmosphereType}
                            onChange={(e) => updatePlanetField('atmosphereType', e.target.value)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          >
                            {ATMOSPHERE_TYPES.map((atm) => (
                              <option key={atm} value={atm}>
                                {atm}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Surface Pressure (bar)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={planetBody.pressureBar ?? 0}
                            onChange={(e) => updatePlanetField('pressureBar', parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Albedo (0-1)</label>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            max="0.95"
                            value={planetBody.albedo}
                            onChange={(e) => updatePlanetField('albedo', parseFloat(e.target.value) || 0.3)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Surface Temp (K)</label>
                          <input
                            type="number"
                            step="1"
                            min="10"
                            max="3000"
                            value={planetBody.surfaceTempK}
                            onChange={(e) => updatePlanetField('surfaceTempK', parseFloat(e.target.value) || 288)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Equilibrium Temp (K)</label>
                          <input
                            type="number"
                            step="1"
                            min="10"
                            max="3000"
                            value={planetBody.T_eq}
                            onChange={(e) => updatePlanetField('T_eq', parseFloat(e.target.value) || 250)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Greenhouse Warming (K)</label>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={planetBody.greenhouseK}
                            onChange={(e) => updatePlanetField('greenhouseK', parseFloat(e.target.value) || 0)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
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
                            value={planetBody.hydrosphere?.solvent || 'Water (H2O)'}
                            onChange={(e) => {
                              const solvent = e.target.value;
                              const cur = planetBody.hydrosphere || {
                                state: 'Liquid Oceans',
                                coveragePct: 50,
                                liqKm: 2,
                                scKm: 0,
                                iceKm: 0,
                                siKm: 0,
                              };
                              updatePlanetField('hydrosphere', { ...cur, solvent });
                            }}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
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
                                liqKm: 2,
                                scKm: 0,
                                iceKm: 0,
                                siKm: 0,
                              };
                              updatePlanetField('hydrosphere', { ...cur, coveragePct: cov });
                            }}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
                          />
                        </div>
                        <div className="col-span-2">
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
                              updatePlanetField('hydrosphere', { ...cur, biosphere: bio });
                            }}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-cyan-400 focus:outline-none"
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
                          onClick={handleAddMoon}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-950/80 border border-amber-700/60 hover:bg-amber-900 text-amber-200 text-[10px] font-mono font-semibold transition"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Moon</span>
                        </button>
                      </div>

                      {planetBody.moons && planetBody.moons.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                            {planetBody.moons.map((m, mIdx) => (
                              <button
                                key={`m-tab-${mIdx}`}
                                onClick={() => setSelectedMoonIdx(mIdx)}
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

                          {currentMoon && (
                            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={currentMoon.name}
                                    onChange={(e) => updateMoonField('name', e.target.value)}
                                    className="text-sm font-bold font-mono text-white bg-transparent border-b border-dashed border-amber-500/40 hover:border-amber-400 focus:outline-none px-0.5"
                                  />
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {currentMoon.a_Rp} Rp &bull; {currentMoon.periodDays} Days
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleDeleteMoon(selectedMoonIdx)}
                                  className="p-1 rounded text-red-400 hover:bg-red-950/50 transition text-xs font-mono flex items-center gap-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Remove Moon</span>
                                </button>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div>
                                  <label className="text-[10px] font-mono text-slate-400">Moon Class</label>
                                  <select
                                    value={currentMoon.moonClass}
                                    onChange={(e) => updateMoonField('moonClass', e.target.value)}
                                    className="w-full mt-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-xs font-mono focus:outline-none"
                                  >
                                    {MOON_CLASSES.map((mc) => (
                                      <option key={mc} value={mc}>
                                        {mc}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] font-mono text-slate-400">Orbit Radius (Rp)</label>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="1.5"
                                    value={currentMoon.a_Rp}
                                    onChange={(e) => updateMoonField('a_Rp', parseFloat(e.target.value) || 10)}
                                    className="w-full mt-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-xs font-mono focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-mono text-slate-400">Mass (M_Moon)</label>
                                  <input
                                    type="number"
                                    step="0.05"
                                    min="0.001"
                                    value={currentMoon.massLunar}
                                    onChange={(e) => {
                                      const mL = parseFloat(e.target.value) || 1.0;
                                      updateMoonField('massLunar', mL);
                                      updateMoonField('massEarth', +(mL * 0.0123).toFixed(5));
                                    }}
                                    className="w-full mt-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-xs font-mono focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-mono text-slate-400">Surface Temp (K)</label>
                                  <input
                                    type="number"
                                    step="1"
                                    min="5"
                                    value={currentMoon.surfaceTempK}
                                    onChange={(e) => updateMoonField('surfaceTempK', parseFloat(e.target.value) || 100)}
                                    className="w-full mt-1 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-xs font-mono focus:outline-none"
                                  />
                                </div>
                              </div>
                            </div>
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

                {/* Belt Body Inspector */}
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
                          onChange={(e) => updateBeltField('role', e.target.value)}
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
                          onChange={(e) => updateBeltField('a', parseFloat(e.target.value) || 2.5)}
                          className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-mono text-slate-400">Belt Width (AU)</label>
                        <input
                          type="number"
                          step="0.05"
                          min="0.01"
                          value={beltBody.beltWidth}
                          onChange={(e) => updateBeltField('beltWidth', parseFloat(e.target.value) || 0.5)}
                          className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-mono text-slate-400">Total Mass (M⊕)</label>
                        <input
                          type="number"
                          step="0.0005"
                          min="0.00001"
                          value={beltBody.massEarth}
                          onChange={(e) => updateBeltField('massEarth', parseFloat(e.target.value) || 0.001)}
                          className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:outline-none"
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
                          onChange={(e) => updateBeltField('incDeg', parseFloat(e.target.value) || 0)}
                          className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ================================================================= */}
          {/* TAB 2: STARS (SPECTRAL CLASSES, MASSES & MULTIPLES)                */}
          {/* ================================================================= */}
          {activeTab === 'stars' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                <div>
                  <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-amber-400">
                    Host Stars & Multi-Star Hierarchy
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Add or remove stars (1-4), adjust masses, calculate stellar parameters, and edit orbital separations.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Star count selector */}
                  <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-400 px-2 uppercase font-semibold">Stars:</span>
                    {([1, 2, 3, 4] as const).map((cnt) => (
                      <button
                        key={`star-cnt-${cnt}`}
                        onClick={() => handleSetStarCount(cnt)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition ${
                          draftResult.hierarchy.stars.length === cnt
                            ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                      >
                        {cnt}★ {cnt === 1 ? 'Single' : cnt === 2 ? 'Binary' : cnt === 3 ? 'Trinary' : 'Quad'}
                      </button>
                    ))}
                  </div>

                  {draftResult.hierarchy.stars.length < 4 && (
                    <button
                      onClick={handleAddStar}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-mono text-xs font-semibold transition hover:scale-105 active:scale-95 shadow-md shadow-amber-950/40"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Companion Star</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {draftResult.hierarchy.stars.map((star, sIdx) => {
                  return (
                    <div
                      key={`star-${sIdx}`}
                      className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 shadow-lg space-y-4 relative group"
                    >
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
                              <span>Star {star.label} &bull; {star.spectralType}</span>
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
                              {star.category} &bull; {star.Teff} K
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAutoCalculateStar(sIdx)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 font-mono text-xs font-semibold transition"
                            title="Auto-calculate radius, Teff, luminosity, logg, and spectral class from mass and age"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Auto-Calc</span>
                          </button>

                          <input
                            type="color"
                            value={star.colorHex || '#ffd2a1'}
                            onChange={(e) => updateStarField(sIdx, 'colorHex', e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                            title="Star Color"
                          />

                          {sIdx > 0 && (
                            <button
                              onClick={() => handleDeleteStar(sIdx)}
                              className="p-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-950/50 border border-rose-800/40 transition"
                              title={`Remove Star ${star.label}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Spectral Class</label>
                          <input
                            type="text"
                            value={star.spectralType}
                            onChange={(e) => updateStarField(sIdx, 'spectralType', e.target.value)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-amber-400 focus:outline-none"
                            placeholder="e.g. G2V, M4V, O9V"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Category</label>
                          <select
                            value={star.category}
                            onChange={(e) => updateStarField(sIdx, 'category', e.target.value)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-amber-400 focus:outline-none"
                          >
                            {EVOLUTIONARY_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Mass (M☉)</label>
                          <input
                            type="number"
                            step="0.05"
                            min="0.08"
                            max="80"
                            value={star.mass}
                            onChange={(e) => updateStarField(sIdx, 'mass', parseFloat(e.target.value) || 1.0)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Radius (R☉)</label>
                          <input
                            type="number"
                            step="0.05"
                            min="0.01"
                            max="1000"
                            value={star.radius}
                            onChange={(e) => updateStarField(sIdx, 'radius', parseFloat(e.target.value) || 1.0)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Teff (K)</label>
                          <input
                            type="number"
                            step="50"
                            min="1500"
                            max="60000"
                            value={star.Teff}
                            onChange={(e) => updateStarField(sIdx, 'Teff', parseFloat(e.target.value) || 5778)}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-mono text-slate-400">Luminosity (L☉)</label>
                          <input
                            type="number"
                            step="0.05"
                            min="0.0001"
                            value={typeof star.lumNum === 'number' ? star.lumNum : 1.0}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 1.0;
                              updateStarField(sIdx, 'lumNum', val);
                              updateStarField(sIdx, 'lum', val);
                            }}
                            className="w-full mt-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {draftResult.hierarchy.splits && draftResult.hierarchy.splits.length > 0 && (
                <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 shadow-lg space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800/70 pb-3">
                    <div className="flex items-center gap-2">
                      <Orbit className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300">
                        Binary & Multiple Star Orbital Separations
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      Architecture: <span className="text-amber-300 font-semibold">{draftResult.hierarchy.archName}</span>
                    </span>
                  </div>

                  <div className="space-y-3">
                    {draftResult.hierarchy.splits.map((split, spIdx) => (
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
                              onChange={(e) => updateSplitField(spIdx, 'a_AU', parseFloat(e.target.value) || 1.0)}
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
                              onChange={(e) => updateSplitField(spIdx, 'e', parseFloat(e.target.value) || 0)}
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
          )}

          {/* ================================================================= */}
          {/* TAB 3: SYSTEM PARAMETERS & METADATA                               */}
          {/* ================================================================= */}
          {activeTab === 'system' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 shadow-lg space-y-4">
                <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-indigo-400">
                  Global System Parameters
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-mono text-slate-400">System Name</label>
                    <input
                      type="text"
                      value={sysName}
                      onChange={(e) => setSysName(e.target.value)}
                      className="w-full mt-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-slate-400">Sector Coordinates</label>
                    <input
                      type="text"
                      value={sysCoord}
                      onChange={(e) => setSysCoord(e.target.value)}
                      className="w-full mt-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-slate-400">System Total Mass (M☉)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="100"
                      value={sysMass}
                      onChange={(e) => setSysMass(parseFloat(e.target.value) || 1.0)}
                      className="w-full mt-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-slate-400">Stellar Age (Gyr)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="13.5"
                      value={sysAge}
                      onChange={(e) => setSysAge(parseFloat(e.target.value) || 4.6)}
                      className="w-full mt-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-slate-400">Metallicity [Fe/H] (dex)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="-2.5"
                      max="0.8"
                      value={sysFeh}
                      onChange={(e) => setSysFeh(parseFloat(e.target.value) || 0)}
                      className="w-full mt-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Multi-Star Multiplicity Controls in System Parameters */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 shadow-lg space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/70 pb-3">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                      Stellar Multiplicity & Architecture
                    </h4>
                  </div>
                  <span className="text-xs font-mono text-amber-400 font-semibold">
                    {draftResult.hierarchy.archName}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-1 bg-slate-950/90 p-1.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] font-mono text-slate-400 px-2 uppercase font-semibold">
                      Star Count:
                    </span>
                    {([1, 2, 3, 4] as const).map((cnt) => (
                      <button
                        key={`sys-param-star-cnt-${cnt}`}
                        onClick={() => handleSetStarCount(cnt)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                          draftResult.hierarchy.stars.length === cnt
                            ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                      >
                        {cnt}★ {cnt === 1 ? 'Single' : cnt === 2 ? 'Binary' : cnt === 3 ? 'Trinary' : 'Quadruple'}
                      </button>
                    ))}
                  </div>

                  {draftResult.hierarchy.stars.length < 4 && (
                    <button
                      onClick={handleAddStar}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-mono text-xs font-semibold transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Companion Star</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                  {draftResult.hierarchy.stars.map((s, idx) => (
                    <div
                      key={`star-summary-${idx}`}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-2.5"
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-black border border-white/40"
                        style={{ backgroundColor: s.colorHex || '#ffd2a1' }}
                      >
                        {s.label}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-mono font-bold text-white truncate">
                          Star {s.label} ({s.spectralType})
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {s.mass} M☉ &bull; {s.Teff} K
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB 4: JSON RAW EXPORT / IMPORT                                   */}
          {/* ================================================================= */}
          {activeTab === 'json' && (
            <div className="flex-1 flex flex-col p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-emerald-400">
                    Direct JSON Inspector
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    View or modify the raw JSON representation of this complete system.
                  </p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(draftResult, null, 2));
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-700/60 hover:bg-emerald-900 text-emerald-200 text-xs font-mono font-semibold transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy JSON</span>
                </button>
              </div>

              <textarea
                value={JSON.stringify(draftResult, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setDraftResult(parsed);
                  } catch {
                    // Ignore transient parsing errors while typing
                  }
                }}
                className="flex-1 w-full p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 custom-scrollbar resize-none"
                spellCheck={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
