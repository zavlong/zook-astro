import { PRNG, seedFromId } from './prng';
export { seedFromId };
import {
  PlanetArchetype,
  RealisticBinarySplit,
  RealisticHydrosphere,
  RealisticMagneticField,
  RealisticMoon,
  RealisticStarNode,
  StarSystem,
  StellarEvolutionState,
} from '../../types/astrophysics';
import {
  ArchitectSystem,
  CelestialBody,
  CelestialMoon,
  calculatePlanetSize,
  computeRadialDistances,
} from '../../types/architect';
import {
  calculateMSLifetimeGyr,
  calculateStellarEvolution,
} from '../astrophysics/evolution';
import { getStarColorRGB } from '../astrophysics/colors';
import {
  resolvePlanetClass,
  resolveMoonClass,
  deriveAtmosphereClassification,
} from '../astrophysics/classifier';

const M_SUN_EARTH = 332946.0;
const M_JUP_EARTH = 317.83;
const R_JUP_EARTH = 11.209;
const AU_R_EARTH = 23454.8;
const DEUT_MIN = 13.0 / 1047.56;

export interface StarGenParams {
  sysMass: number;
  age: number;
  feh: number;
  forcedMult: 'auto' | '1' | '2' | '3' | '4';
  seed?: number;
  id?: string;
  name?: string;
  sectorSeed?: number;
  sectorColumns?: number;
  sectorRows?: number;
  empireId?: string;
}

export interface RealisticZoneInput {
  title: string;
  mass: number;
  lum: number;
  age: number;
  feh: number;
  a_in: number;
  a_out: number;
}

export interface RealisticBeltBody {
  kind: 'belt';
  role: string;
  a: number;
  a_birth: number;
  beltWidth: number;
  rawSlotMassEarth: number;
  massEarth: number;
  incDeg: number;
  omegaNodeDeg: number;
}

export interface RealisticPlanetBody {
  kind: 'planet';
  role?: string;
  a: number;
  a_birth: number;
  e: number;
  incDeg: number;
  omegaNodeDeg: number;
  argPeriDeg: number;
  migrationHistory: string;
  massEarth: number;
  massJup: number;
  radiusEarth: number;
  densityGcm3: number;
  gravityG: number;
  rockFrac: number;
  iceFrac: number;
  gasFrac: number;
  T_eq: number;
  T_atm: number;
  surfaceTempK: number;
  greenhouseK: number;
  muMin: number;
  albedo: number;
  pressureBar: number | null;
  sudarskyClass: string | null;
  planetClass: string;
  atmosphereType: string;
  gases: Record<string, number>;
  hydrosphere: RealisticHydrosphere | null;
  rings: string | null;
  rocheLimitRp: number;
  moons: RealisticMoon[];
  orbitalPeriodDays: number;
  rotationHours: number;
  spinState: string;
  axialTiltDeg: number;
  magneticField: RealisticMagneticField;
}

export type RealisticPlanetOrBelt = RealisticBeltBody | RealisticPlanetBody;

export interface RealisticPlanetaryZone {
  title: string;
  mass: number;
  lum: number;
  a_in: number;
  a_out: number;
  a_snow: number;
  archetype: 'A' | 'B' | 'C' | 'D';
  probs: { A: number; B: number; C: number; D: number };
  diskMassEarth: number;
  bodies: RealisticPlanetOrBelt[];
}

export interface RealisticHierarchyResult {
  archName: string;
  stars: RealisticStarNode[];
  splits: RealisticBinarySplit[];
  zones: RealisticZoneInput[];
}

export interface RealisticStarSystemResult {
  roll: number;
  step1: StarGenParams;
  hierarchy: RealisticHierarchyResult;
  zones: RealisticPlanetaryZone[];
  seedUsed?: number;
}

export const STARGEN_BENCHMARK_PRESETS: Record<
  string,
  { label: string; sysMass: number; age: number; feh: number; forcedMult: 'auto' | '1' | '2' | '3' | '4' }
> = {
  sol: {
    label: 'Sol / 55 Cnc (1.0 M☉, 4.6 Gyr, 0.0 dex)',
    sysMass: 1.0,
    age: 4.6,
    feh: 0.0,
    forcedMult: '1',
  },
  kepler90: {
    label: 'Kepler-90 Caboose (1.2 M☉, 2.0 Gyr, +0.1 dex)',
    sysMass: 1.2,
    age: 2.0,
    feh: 0.1,
    forcedMult: '1',
  },
  trappist: {
    label: 'Low-Mass Trinary (0.22 M☉, 7.6 Gyr, 0.0 dex)',
    sysMass: 0.22,
    age: 7.6,
    feh: 0.0,
    forcedMult: '3',
  },
  '40eri': {
    label: '40 Eridani Triple w/ WD (2.3 M☉, 5.5 Gyr, -0.2 dex)',
    sysMass: 2.3,
    age: 5.5,
    feh: -0.2,
    forcedMult: '3',
  },
  hr8799: {
    label: 'HR 8799 Young Giants (1.6 M☉, 0.06 Gyr, +0.25 dex)',
    sysMass: 1.6,
    age: 0.06,
    feh: 0.25,
    forcedMult: '1',
  },
  halo: {
    label: 'Halo Subdwarf (0.85 M☉, 11.8 Gyr, -1.6 dex)',
    sysMass: 0.85,
    age: 11.8,
    feh: -1.6,
    forcedMult: '1',
  },
  smbh: {
    label: 'Sagittarius A* SMBH (1,000,000 M☉, 8.0 Gyr, +0.25 dex)',
    sysMass: 1000000,
    age: 8.0,
    feh: 0.25,
    forcedMult: 'auto',
  },
};

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

function log10(x: number): number {
  return Math.log(Math.max(1e-12, x)) / Math.LN10;
}

function makeRngHelpers(rng?: PRNG) {
  const random = () => (rng ? rng.next() : Math.random());
  const rand = (a: number, b: number) => a + random() * (b - a);
  const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
  const randNorm = (m: number, s: number) => {
    const u1 = Math.max(1e-10, random());
    const u2 = random();
    return m + s * Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(6.2831853 * u2);
  };
  const powerLaw = (a: number, b: number, alpha: number) => {
    const p = 1.0 - alpha;
    const pa = Math.pow(a, p);
    const pb = Math.pow(b, p);
    return Math.pow(pa + random() * (pb - pa), 1.0 / p);
  };
  return { random, rand, randInt, randNorm, powerLaw };
}

export function starColorHex(T: number, bd?: string): string {
  if (bd === 'L') return '#e11d48';
  if (bd === 'T') return '#a855f7';
  if (bd === 'Y') return '#6366f1';
  if (T >= 25000) return '#9bb0ff';
  if (T >= 10000) return '#aabfff';
  if (T >= 7400) return '#cad7ff';
  if (T >= 6000) return '#f8f7ff';
  if (T >= 5200) return '#fff4ea';
  if (T >= 3850) return '#ffaa55'; // K-dwarfs warm orange
  if (T >= 3000) return '#ff4438'; // Early M-dwarf (M0-M4) vivid red
  if (T >= 2200) return '#e61919'; // Mid/late M-dwarf (M5-M9) deep rich red
  return '#c8102e'; // Sub-stellar / coolest late M ruby red
}

export function rollStep1(rng?: PRNG): { sysMass: number; age: number; feh: number } {
  const { random, rand, randNorm, powerLaw } = makeRngHelpers(rng);
  const m = random() < 0.62 ? powerLaw(0.08, 0.5, 1.3) : powerLaw(0.5, 14.0, 2.05);
  const age = random() < 0.85 ? rand(0.02, 9.5) : rand(9.5, 13.2);
  const meanFeh = 0.12 - 0.04 * age - 0.006 * Math.pow(Math.max(0, age - 8.5), 2);
  const feh = clamp(randNorm(meanFeh, 0.18), -2.0, 0.5);
  return {
    sysMass: +m.toFixed(3),
    age: +age.toFixed(2),
    feh: +feh.toFixed(2),
  };
}

export function rollStep2(
  sysMass: number,
  forced?: 'auto' | '1' | '2' | '3' | '4',
  rng?: PRNG
): number {
  const { random } = makeRngHelpers(rng);
  const maxN = clamp(Math.floor(sysMass / (DEUT_MIN * 1.15)), 1, 4);
  if (forced && forced !== 'auto') {
    return Math.min(parseInt(forced, 10), maxN);
  }
  const pm = Math.pow(sysMass, 0.7) / (Math.pow(sysMass, 0.7) + 1.0);
  const u = random();
  const p1 = 1 - pm;
  const p2 = (4 / 7) * pm;
  const p3 = (2 / 7) * pm;
  const n = u < p1 ? 1 : u < p1 + p2 ? 2 : u < p1 + p2 + p3 ? 3 : 4;
  return Math.min(n, maxN);
}

export function getStarStats(
  mass: number,
  age: number,
  feh: number,
  label: string
): RealisticStarNode {
  const mHBMM = 0.075 * Math.pow(10, -0.04 * feh);
  if (mass < mHBMM) {
    const tD = 0.015 * Math.pow(mass / 0.02, -2.0);
    const tC = Math.max(age, tD, 0.005);
    const lum =
      2.2e-5 *
      Math.pow(mass / 0.05, 2.64) *
      Math.pow(tC, -1.3) *
      Math.pow(10, -0.14 * feh);
    const rad =
      0.092 *
      Math.pow(mass / 0.05, -0.06) *
      (1.0 + 0.18 * Math.pow(tC / 0.1, -0.32));
    const T = (5778.0 * Math.pow(lum, 0.25)) / Math.sqrt(rad);
    const lg = 4.438 + log10(mass) - 2.0 * log10(rad);
    const sL = T >= 2250 ? 'M' : T >= 1350 ? 'L' : T >= 550 ? 'T' : 'Y';
    const sub =
      sL === 'M'
        ? clamp(Math.floor(6.5 + (3.5 * (2850 - T)) / 600), 6, 9)
        : sL === 'L'
        ? clamp(Math.floor((10 * (2250 - T)) / 900), 0, 9)
        : sL === 'T'
        ? clamp(Math.floor((10 * (1350 - T)) / 800), 0, 9)
        : clamp(Math.floor((5 * (550 - T)) / 350), 0, 4);
    return {
      label,
      category: `Brown Dwarf (${(mass * 1047.56).toFixed(1)} MJ)`,
      mass: +mass.toFixed(4),
      lum: lum.toExponential(2),
      lumNum: lum,
      radius: +rad.toFixed(3),
      Teff: Math.round(T),
      logg: +lg.toFixed(2),
      tau: 0,
      spectralType: `${sL}${sub} (BD)`,
      colorHex: starColorHex(T, sL),
    };
  }

  let Lz =
    mass < 0.43
      ? 0.23 * Math.pow(mass, 2.3)
      : mass < 2.0
      ? 0.7 * Math.pow(mass, 4.0)
      : 1.15 * Math.pow(mass, 3.5);
  let Rz =
    mass < 0.43
      ? Math.pow(mass, 0.85)
      : mass < 2.0
      ? 0.89 * Math.pow(mass, 0.82)
      : 0.92 * Math.pow(mass, 0.62);
  const rW = Math.exp(-Math.pow(log10(mass) / 0.45, 2));
  Lz *= Math.pow(10, -0.18 * feh * rW);
  Rz *= Math.pow(10, 0.06 * feh);

  const tMS = clamp(10.0 * (mass / Lz) * Math.pow(mass, 1.35), 0.004, 5000.0);
  const tau = age / tMS;

  if (tau > 1.15) {
    const tc = Math.max(0.005, age - 1.15 * tMS);
    if (mass < 8.0) {
      const mWD = clamp(0.48 + 0.09 * mass, 0.5, 1.35);
      const rWD = 0.012 * Math.pow(mWD / 0.6, -0.333);
      const lWD = 0.08 * (mWD / 0.6) * Math.pow(tc, -1.4);
      const Twd = clamp((5778.0 * Math.pow(lWD, 0.25)) / Math.sqrt(rWD), 3800, 65000);
      const lgW = 4.438 + log10(mWD) - 2.0 * log10(rWD);
      return {
        label,
        category: `White Dwarf (Init ${mass.toFixed(2)} M☉)`,
        mass: +mWD.toFixed(3),
        lum: lWD.toExponential(2),
        lumNum: lWD,
        radius: +rWD.toFixed(4),
        Teff: Math.round(Twd),
        logg: +lgW.toFixed(2),
        tau: +tau.toFixed(2),
        spectralType: `${Twd > 5500 ? 'DA' : 'DC'}${clamp(Math.round(50400 / Twd), 1, 9)}`,
        colorHex: starColorHex(Twd),
      };
    }
    const isBH = mass >= 20;
    return {
      label,
      category: isBH ? 'Stellar Black Hole' : 'Neutron Star',
      mass: isBH ? +(0.32 * mass).toFixed(2) : 1.45,
      lum: '1.0e-5',
      lumNum: 1e-5,
      radius: 0.0002,
      Teff: isBH ? 80000 : 95000,
      logg: 14.2,
      tau: +tau.toFixed(2),
      spectralType: isBH ? 'BH' : 'PSR / NS',
      colorHex: isBH ? '#c084fc' : '#a5f3fc',
    };
  }

  let lum = Lz;
  let rad = Rz;
  let phase = 'Main Sequence';
  if (tau <= 1.0) {
    lum = Lz * (1.0 + 0.42 * tau + 0.32 * tau * tau);
    rad = Rz * (1.0 + 0.25 * tau + 0.14 * Math.pow(tau, 3));
  } else if (tau <= 1.05) {
    phase = 'Subgiant Branch';
    const f1 = (tau - 1.0) / 0.05;
    lum = Lz * 1.74 * (1.0 + 0.35 * f1);
    rad = Rz * 1.39 * (1.0 + 1.8 * f1);
  } else {
    phase = 'Red Giant Branch';
    const f2 = clamp((tau - 1.05) / 0.1, 0.0, 1.0);
    lum = Lz * 2.35 * Math.pow(35.0, f2);
    const tT = clamp(4700 - 1300 * f2 - 250 * feh, 3050, 4900);
    rad = Math.sqrt(lum) * Math.pow(5778.0 / tT, 2);
  }

  const Ts = (5778.0 * Math.pow(lum, 0.25)) / Math.sqrt(rad);
  const lgs = 4.438 + log10(mass) - 2.0 * log10(rad);
  const bks: Array<[string, number, number]> = [
    ['O', 30000, 55000],
    ['B', 10000, 30000],
    ['A', 7400, 10000],
    ['F', 6000, 7400],
    ['G', 5200, 6000],
    ['K', 3850, 5200],
    ['M', 2250, 3850],
  ];
  let ch = bks[6];
  for (let i = 0; i < bks.length; i++) {
    if (Ts >= bks[i][1]) {
      ch = bks[i];
      break;
    }
  }
  const sb = Math.floor(clamp((ch[2] - Ts) / (ch[2] - ch[1]), 0, 0.99) * 10);
  const lc =
    lgs < 1.3
      ? 'Ib'
      : lgs < 2.1
      ? 'II'
      : lgs < 3.35
      ? 'III'
      : lgs < 3.98
      ? 'IV'
      : feh < -1.15 && Ts < 7000
      ? 'VI'
      : 'V';

  return {
    label,
    category: phase,
    mass: +mass.toFixed(3),
    lum: lum >= 0.01 ? +lum.toFixed(3) : lum.toExponential(2),
    lumNum: lum,
    radius: +rad.toFixed(3),
    Teff: Math.round(Ts),
    logg: +lgs.toFixed(2),
    tau: +tau.toFixed(2),
    spectralType: `${ch[0]}${sb}${lc}`,
    colorHex: starColorHex(Ts),
  };
}

export function buildHierarchy(
  sysMass: number,
  age: number,
  feh: number,
  nStars: number,
  rng?: PRNG
): RealisticHierarchyResult {
  const { random, rand, randNorm } = makeRngHelpers(rng);
  const lbls = ['A', 'B', 'C', 'D'];
  if (nStars === 1) {
    const sA = getStarStats(sysMass, age, feh, 'A');
    return {
      archName: 'Single Star',
      stars: [sA],
      splits: [],
      zones: [
        {
          title: `Star A (${sA.spectralType})`,
          mass: sA.mass,
          lum: sA.lumNum,
          age,
          feh,
          a_in: +Math.max(0.015, 0.055 * Math.sqrt(sA.lumNum)).toFixed(4),
          a_out: +(50.0 * Math.pow(sA.mass, 0.55)).toFixed(2),
        },
      ],
    };
  }

  const muLog = 1.55 + 0.75 * log10(Math.max(0.1, sysMass));
  let seps: number[] = [];
  for (let a = 0; a < 150; a++) {
    const raw: number[] = [];
    for (let k = 0; k < nStars - 1; k++) {
      raw.push(clamp(Math.pow(10, randNorm(muLog, 1.32)), 0.025, 4500.0));
    }
    raw.sort((x, y) => y - x);
    let ok = true;
    for (let j = 0; j < raw.length - 1; j++) {
      if (raw[j] / raw[j + 1] < 5.2) ok = false;
    }
    if (ok) {
      seps = raw;
      break;
    }
  }
  if (!seps.length) {
    seps = [180.0, 12.0, 0.15].slice(0, nStars - 1);
  }

  function split2(mTot: number, sep: number): [number, number] {
    const q = sep < 0.5 * Math.pow(mTot, 0.75) ? rand(0.62, 0.98) : rand(0.12, 0.95);
    const m1 = mTot / (1.0 + q);
    return [m1, mTot - m1];
  }

  const topo = nStars === 3 ? (random() < 0.5 ? 'AB_C' : 'A_BC') : 'AB_CD';
  let masses: number[] = [];
  for (let ma = 0; ma < 250; ma++) {
    let c: number[] = [];
    if (nStars === 2) {
      c = split2(sysMass, seps[0]);
    } else if (nStars === 3) {
      const b3 = split2(sysMass, seps[0]);
      if (topo === 'AB_C') {
        const p1 = split2(b3[0], seps[1]);
        c = [p1[0], p1[1], b3[1]];
      } else {
        const p2 = split2(b3[1], seps[1]);
        c = [b3[0], p2[0], p2[1]];
      }
    } else {
      const b4 = split2(sysMass, seps[0]);
      const pA = split2(b4[0], seps[1]);
      const pB = split2(b4[1], seps[2]);
      c = [pA[0], pA[1], pB[0], pB[1]];
    }
    if (Math.min(...c) >= DEUT_MIN) {
      masses = c;
      break;
    }
  }
  if (!masses.length) {
    for (let z = 0; z < nStars; z++) masses.push(sysMass / nStars);
  }

  const stars: RealisticStarNode[] = [];
  for (let s = 0; s < nStars; s++) {
    stars.push(getStarStats(masses[s], age, feh, lbls[s]));
  }

  const splits: RealisticBinarySplit[] = [];
  const zones: RealisticZoneInput[] = [];

  function evalNode(
    name: string,
    bA: { mass: number; lumNum: number },
    bB: { mass: number; lumNum: number },
    aBin: number,
    capAU?: number
  ) {
    const eBin =
      aBin < 0.08
        ? +(0.02 * random()).toFixed(3)
        : aBin < 10
        ? +(0.55 * random()).toFixed(3)
        : +(0.72 * Math.sqrt(random())).toFixed(3);
    const mTot = bA.mass + bB.mass;
    const lTot = bA.lumNum + bB.lumNum;
    const muA = bB.mass / mTot;
    const muB = bA.mass / mTot;
    const muM = Math.min(muA, muB);
    const sA =
      aBin *
      (0.464 -
        0.38 * muA -
        0.631 * eBin +
        0.586 * muA * eBin +
        0.15 * eBin * eBin -
        0.198 * muA * eBin * eBin);
    const sB =
      aBin *
      (0.464 -
        0.38 * muB -
        0.631 * eBin +
        0.586 * muB * eBin +
        0.15 * eBin * eBin -
        0.198 * muB * eBin * eBin);
    const pM =
      aBin *
      (1.6 +
        5.1 * eBin -
        2.22 * eBin * eBin +
        4.12 * muM -
        4.27 * eBin * muM -
        5.09 * muM * muM +
        4.61 * eBin * eBin * muM * muM);
    const sc = Math.pow(Math.max(0.1, mTot), 0.75);
    const reg =
      aBin < 0.5 * sc
        ? 'P-Type (Circumbinary)'
        : aBin <= 50 * sc
        ? 'Mixed (Truncated S + P)'
        : 'S-Type (Wide)';
    splits.push({
      pair: name,
      a_AU: +aBin.toFixed(3),
      e: eBin,
      regime: reg,
      sMaxA: +Math.max(0, sA).toFixed(2),
      sMaxB: +Math.max(0, sB).toFixed(2),
      pMin: +pM.toFixed(2),
    });

    const pIn = Math.max(0.02, 0.055 * Math.sqrt(lTot), pM);
    const pOut = Math.min(capAU || 1e9, 50.0 * Math.pow(mTot, 0.55));
    const pZone: RealisticZoneInput | null =
      pOut / pIn >= 2.2
        ? {
            title: `Circumbinary ${name}`,
            mass: +mTot.toFixed(3),
            lum: lTot,
            age,
            feh,
            a_in: +pIn.toFixed(4),
            a_out: +pOut.toFixed(2),
          }
        : null;
    return { sA: Math.max(0, sA), sB: Math.max(0, sB), pZone };
  }

  function addLeaf(st: RealisticStarNode, cap: number) {
    const aIn = Math.max(0.015, 0.055 * Math.sqrt(st.lumNum));
    const nat = 50.0 * Math.pow(st.mass, 0.55);
    const aOut = Math.min(nat, cap);
    if (aOut / aIn >= 2.2) {
      zones.push({
        title: `Star ${st.label} (${st.spectralType})`,
        mass: st.mass,
        lum: st.lumNum,
        age,
        feh,
        a_in: +aIn.toFixed(4),
        a_out: +aOut.toFixed(2),
      });
    }
  }

  let archName = 'Multi-Star Hierarchy';
  if (nStars === 2) {
    const b2 = evalNode('AB', stars[0], stars[1], seps[0]);
    addLeaf(stars[0], b2.sA);
    if (b2.pZone) zones.push(b2.pZone);
    addLeaf(stars[1], b2.sB);
    archName = `Binary — ${splits[0].regime}`;
  } else if (nStars === 3) {
    if (topo === 'AB_C') {
      const nAB = {
        mass: stars[0].mass + stars[1].mass,
        lumNum: stars[0].lumNum + stars[1].lumNum,
      };
      const r3 = evalNode('AB + C', nAB, stars[2], seps[0]);
      const i3 = evalNode('AB', stars[0], stars[1], seps[1], r3.sA);
      addLeaf(stars[0], i3.sA);
      if (i3.pZone) zones.push(i3.pZone);
      addLeaf(stars[1], i3.sB);
      if (r3.pZone) zones.push(r3.pZone);
      addLeaf(stars[2], r3.sB);
      archName = 'Trinary ((A+B) + C)';
    } else {
      const nBC = {
        mass: stars[1].mass + stars[2].mass,
        lumNum: stars[1].lumNum + stars[2].lumNum,
      };
      const r3b = evalNode('A + BC', stars[0], nBC, seps[0]);
      const i3b = evalNode('BC', stars[1], stars[2], seps[1], r3b.sB);
      addLeaf(stars[0], r3b.sA);
      if (r3b.pZone) zones.push(r3b.pZone);
      addLeaf(stars[1], i3b.sA);
      if (i3b.pZone) zones.push(i3b.pZone);
      addLeaf(stars[2], i3b.sB);
      archName = 'Trinary (A + (B+C))';
    }
  } else {
    const qAB = {
      mass: stars[0].mass + stars[1].mass,
      lumNum: stars[0].lumNum + stars[1].lumNum,
    };
    const qCD = {
      mass: stars[2].mass + stars[3].mass,
      lumNum: stars[2].lumNum + stars[3].lumNum,
    };
    const r4 = evalNode('AB + CD', qAB, qCD, seps[0]);
    const iAB = evalNode('AB', stars[0], stars[1], seps[1], r4.sA);
    const iCD = evalNode('CD', stars[2], stars[3], seps[2], r4.sB);
    addLeaf(stars[0], iAB.sA);
    if (iAB.pZone) zones.push(iAB.pZone);
    addLeaf(stars[1], iAB.sB);
    if (r4.pZone) zones.push(r4.pZone);
    addLeaf(stars[2], iCD.sA);
    if (iCD.pZone) zones.push(iCD.pZone);
    addLeaf(stars[3], iCD.sB);
    archName = 'Quadruple (2+2 Hierarchy)';
  }

  return { archName, stars, splits, zones };
}

/**
 * Realistic Orbital Inclination & Nodal Dynamics (Steps 2 & 6 3D Astrodynamics)
 * - Low-eccentricity regular planets (e < 0.1): tightly coplanar via Rayleigh distribution
 *   with sigma ~ 0.95 deg (mean ~ 1.2 deg, 90% < 2.5 deg) and ascending nodes clustered near the system invariant plane.
 * - Dynamically excited / scattered planets (e >= 0.1): inclination excitation scales with eccentricity (e-i coupling).
 * - Distant dwarf / erratic / scattered disk worlds (a > 30 AU or scattered role): high inclination dispersion (sigma ~ 8-16 deg).
 * - Belts: gentle dispersion (sigma ~ 1.8 deg).
 */
export function computeOrbitalInclination(
  bodyKind: 'planet' | 'belt',
  role: string | undefined,
  a: number,
  e: number,
  massEarth: number,
  systemNodeDeg: number,
  random: () => number,
  rand: (min: number, max: number) => number
): { incDeg: number; omegaNodeDeg: number; argPeriDeg: number } {
  const sampleRayleigh = (sigma: number) => {
    const u = Math.max(1e-6, Math.min(1 - 1e-6, random()));
    return +(sigma * Math.sqrt(-2 * Math.log(1 - u))).toFixed(2);
  };

  const isDwarfOrErratic =
    (role != null && /scattered|erratic|dwarf|kuiper|trans-neptunian|oort|isolated/i.test(role)) ||
    (a > 30 && massEarth < 0.25);

  let sigmaDeg = 0.95;
  let nodeDispersion = 20;

  if (bodyKind === 'belt') {
    sigmaDeg = 1.8;
    nodeDispersion = 35;
  } else if (isDwarfOrErratic) {
    sigmaDeg = rand(8.0, 16.0);
    nodeDispersion = 180;
  } else if (e > 0.1) {
    sigmaDeg = +(1.2 + e * 22).toFixed(2);
    nodeDispersion = Math.min(180, +(25 + e * 180).toFixed(1));
  } else {
    sigmaDeg = 0.95;
    nodeDispersion = 20;
  }

  let incDeg = sampleRayleigh(sigmaDeg);
  if (isDwarfOrErratic) {
    incDeg = Math.min(55, incDeg);
  } else if (e > 0.1) {
    incDeg = Math.min(35, incDeg);
  } else {
    incDeg = Math.min(4.5, incDeg);
  }

  let omegaNodeDeg: number;
  if (nodeDispersion >= 180) {
    omegaNodeDeg = +rand(0, 360).toFixed(1);
  } else {
    const deltaNode = (random() - 0.5) * 2 * nodeDispersion;
    omegaNodeDeg = +((systemNodeDeg + deltaNode + 360) % 360).toFixed(1);
  }

  const argPeriDeg = +rand(0, 360).toFixed(1);

  return { incDeg, omegaNodeDeg, argPeriDeg };
}

/**
 * Planetary Magnetic Field & Core Dynamo Simulation
 * Models intrinsic dipolar dynamos, multipolar ionic dynamos, tidal dynamos,
 * and core freezing timescales (geodynamo cessation) with implications for
 * atmospheric stripping (muMin) and cosmic radiation shielding / biosphere development.
 */
export function computePlanetaryMagneticField(params: {
  massEarth: number;
  radiusEarth: number;
  densityGcm3: number;
  rockFrac: number;
  iceFrac: number;
  gasFrac: number;
  aAU: number;
  starLum: number;
  starMass: number;
  sysAgeGyr: number;
  rotHours: number;
  isMoon?: boolean;
  tidalW?: number;
  hostPlanetMassEarth?: number;
  random: () => number;
  rand: (min: number, max: number) => number;
}): RealisticMagneticField {
  const {
    massEarth,
    radiusEarth,
    iceFrac,
    gasFrac,
    aAU,
    starLum,
    sysAgeGyr,
    rotHours,
    isMoon = false,
    tidalW = 0,
    rand,
  } = params;

  let surfaceFieldGauss = 0;
  let dynamoStatus = '';
  let hasActiveDynamo = false;
  let coreState = '';
  let radiationLevel: 'Minimal' | 'Moderate' | 'High' | 'Extreme' = 'Moderate';
  let auroraDescription = '';
  let biosphereImplication = '';

  const hasEnv = gasFrac >= 0.015 || massEarth >= 12;
  const isGasGiant = gasFrac >= 0.15 || massEarth >= 40;
  const isIceGiant = (hasEnv && !isGasGiant) || (iceFrac >= 0.35 && massEarth >= 4);

  if (isGasGiant) {
    // 1. Gas Giants: Deep convective liquid metallic hydrogen dynamo
    hasActiveDynamo = true;
    const baseField = massEarth >= 150 ? rand(3.5, 9.5) : rand(1.2, 3.8);
    const spinFactor = Math.sqrt(14 / Math.max(6, rotHours));
    surfaceFieldGauss = +(baseField * spinFactor).toFixed(2);
    dynamoStatus = 'Active Super-Critical Metallic Hydrogen Dynamo';
    coreState = 'Convective Liquid Metallic Hydrogen Envelope over Molten Heavy Core';
    radiationLevel = 'Minimal';
    auroraDescription = 'Persistent Relativistic Polar Auroral Ovals & Flux Tube Footprints';
    biosphereImplication =
      'Extreme Jovian magnetosphere shields volatile envelope from stellar wind stripping, but generates intense inner van Allen radiation belts.';
  } else if (isIceGiant) {
    // 2. Ice Giants: Superionic water-ammonia electrolytic mantle dynamo
    hasActiveDynamo = true;
    surfaceFieldGauss = +rand(0.18, 0.65).toFixed(2);
    dynamoStatus = 'Active Multipolar Thin-Shell Ionic Mantle Dynamo';
    coreState = 'Convective Superionic H2O-NH3-CH4 Mantle over Silicate/Metal Nucleus';
    radiationLevel = 'Minimal';
    auroraDescription = 'Tilted Off-Axis Asymmetric Auroral Arcs & Variable Cusp Glow';
    biosphereImplication =
      'Convective electrolytic mantle generates strong multipolar magnetosphere, deflecting stellar ion erosion.';
  } else if (isMoon) {
    // 3. Natural Satellites / Moons:
    const hasTidalDynamo = tidalW >= 0.35 && massEarth >= 0.003;
    const hasLiquidCore = massEarth >= 0.02 && sysAgeGyr < 3.5 * Math.pow(massEarth / 0.02, 1.25);

    if (hasTidalDynamo || hasLiquidCore) {
      hasActiveDynamo = true;
      surfaceFieldGauss = +(rand(0.004, 0.018) * (1 + tidalW * 0.4)).toFixed(3);
      dynamoStatus = 'Active Miniature Tidal-Convective Dynamo';
      coreState = 'Tidally Maintained Partially Molten Fe-S Core';
      radiationLevel = 'Moderate';
      auroraDescription = 'Faint Polar Auroral Filaments & Sub-Stellar Interaction Currents';
      biosphereImplication =
        'Intrinsic mini-magnetosphere provides localized deflection against host planet plasma sheet & stellar cosmic rays.';
    } else {
      hasActiveDynamo = false;
      surfaceFieldGauss = +rand(0.00005, 0.0006).toFixed(5);
      dynamoStatus = 'Extinct Dynamo (Frozen Core Remanent Crustal Magnetism)';
      coreState = 'Completely Solidified Fe-Ni / Silicate Core';
      radiationLevel = 'High';
      auroraDescription = 'No Global Aurora; Localized Micro-Cusps over Remanent Crustal Anomalies';
      biosphereImplication =
        'Unshielded surface; reliance on host planet magnetosphere or subsurface ocean ice shell for radiation defense.';
    }
  } else {
    // 4. Terrestrial & Super-Earth Rocky Worlds:
    // Core cooling timescale: tau_freeze = 4.2 * M^1.25 Gyr
    const coreFreezeTauGyr = 4.2 * Math.pow(massEarth, 1.25) * (1 + tidalW * 0.3);
    const isCoreLiquid = sysAgeGyr <= coreFreezeTauGyr;
    const isFastSpin = rotHours <= 96; // Coriolis organizing limit (Earth=24h; Venus=5832h fails)

    if (isCoreLiquid && isFastSpin) {
      hasActiveDynamo = true;
      const massScale = Math.pow(massEarth, 0.5);
      const spinScale = Math.sqrt(24 / Math.max(6, rotHours));
      surfaceFieldGauss = +clamp(rand(0.28, 0.62) * massScale * spinScale, 0.08, 2.5).toFixed(2);
      dynamoStatus = 'Active Convective Fe-Ni Liquid Outer Core Geodynamo';
      coreState = 'Convecting Molten Fe-Ni Outer Core with Crystallizing Solid Inner Core';
      radiationLevel = 'Minimal';
      auroraDescription = 'Dynamic Polar Auroral Curtains (O/N2 Molecular Atmospheric Emission)';
      biosphereImplication =
        'Coherent dipolar magnetosphere shields atmosphere from stellar wind sputtering and protects surface landmasses from cosmic ray / flare radiation, enabling complex multicellular surface life.';
    } else if (isCoreLiquid && !isFastSpin) {
      hasActiveDynamo = false;
      surfaceFieldGauss = +rand(0.001, 0.025).toFixed(3);
      dynamoStatus = 'Collapsed Dynamo (Molten Core, Sub-Critical Coriolis Rotation)';
      coreState = 'Molten Fe-Ni Core (Stagnant Plumes, Non-Organized Convection)';
      radiationLevel = 'Moderate';
      auroraDescription = 'Diffuse Low-Latitude Airglow & Induced Ionospheric Tail Glow';
      biosphereImplication =
        'Slow rotation inhibits coherent dynamo; atmosphere subject to unshielded solar wind ion pickup unless protected by high surface atmospheric pressure.';
    } else {
      hasActiveDynamo = false;
      surfaceFieldGauss = +rand(0.0001, 0.0015).toFixed(4);
      dynamoStatus = 'Extinct Dynamo (Core Solidified / Mantle Stagnant)';
      coreState = 'Completely Solidified Fe-Ni Core (Conductive Inactive Solid)';
      radiationLevel = 'High';
      auroraDescription = 'Localized Sputtered Auroral Footprints over Fossilized Crustal Magnetism';
      biosphereImplication =
        'Absence of magnetosphere exposes surface to stellar wind stripping and lethal cosmic radiation; surface life restricted to deep oceans, aquifers, or subsurface lithosphere unless atmosphere exceeds 2 bar.';
    }
  }

  const surfaceFieldMicroTesla = +(surfaceFieldGauss * 100).toFixed(1);
  const magneticMomentEarth = +(
    surfaceFieldGauss * Math.pow(Math.max(0.1, radiusEarth), 3) / 0.5
  ).toFixed(2);

  let magnetopauseRadiusRp = 1.0;
  if (hasActiveDynamo && surfaceFieldGauss >= 0.05) {
    const windPressureFactor = Math.max(0.05, starLum / Math.pow(Math.max(0.05, aAU), 2));
    magnetopauseRadiusRp = +clamp(
      1.0 + 8.5 * Math.pow(surfaceFieldGauss / 0.5, 0.33) * Math.pow(1 / windPressureFactor, 0.167),
      1.2,
      120
    ).toFixed(1);
  } else {
    magnetopauseRadiusRp = +(1.0 + Math.min(0.25, surfaceFieldGauss * 2.0)).toFixed(2);
  }

  const bowShockRadiusRp = +(magnetopauseRadiusRp * 1.32).toFixed(1);

  let shieldingEfficiencyPct = 0;
  if (hasActiveDynamo) {
    shieldingEfficiencyPct = clamp(
      Math.round(80 + Math.log10(Math.max(0.1, surfaceFieldGauss / 0.5) * 10) * 12 + rand(-2, 3)),
      65,
      99
    );
    if (isGasGiant) shieldingEfficiencyPct = 99;
  } else if (surfaceFieldGauss >= 0.01) {
    shieldingEfficiencyPct = clamp(Math.round(18 + surfaceFieldGauss * 600), 12, 45);
  } else {
    shieldingEfficiencyPct = clamp(Math.round(surfaceFieldGauss * 3000), 1, 8);
  }

  if (shieldingEfficiencyPct >= 85) {
    radiationLevel = 'Minimal';
  } else if (shieldingEfficiencyPct >= 50) {
    radiationLevel = 'Moderate';
  } else if (shieldingEfficiencyPct >= 15) {
    radiationLevel = 'High';
  } else {
    radiationLevel = 'Extreme';
  }

  return {
    surfaceFieldGauss,
    surfaceFieldMicroTesla,
    magneticMomentEarth,
    dynamoStatus,
    hasActiveDynamo,
    coreState,
    magnetopauseRadiusRp,
    bowShockRadiusRp,
    shieldingEfficiencyPct,
    radiationLevel,
    auroraDescription,
    biosphereImplication,
  };
}

export function generateZoneSystem(
  z: RealisticZoneInput,
  rng?: PRNG
): RealisticPlanetaryZone {
  const { random, rand, randInt } = makeRngHelpers(rng);
  const a_snow = Math.max(0.04, 2.7 * Math.sqrt(z.lum));
  const M_sol = Math.pow(z.mass, 0.8) * Math.pow(10, z.feh);
  const lnM = Math.log(Math.max(1e-4, M_sol));
  const inOk = z.a_in <= 0.45 * a_snow;
  const outOk = z.a_out >= 2.5 * a_snow && z.mass >= 0.1;

  const WA = inOk ? 1.1 / (1.0 + Math.pow(M_sol / 1.05, 2)) : 0.0;
  const WB = outOk
    ? 0.85 * Math.exp(-Math.pow(lnM - 0.55, 2) / 0.405) +
      0.4 * Math.max(0, Math.tanh(M_sol - 1.4))
    : 0.0;
  const WC = inOk && outOk ? 1.15 * Math.exp(-Math.pow(lnM - 0.05, 2) / 0.46) : 0.0;
  const WD =
    0.08 +
    1.4 * Math.exp(-z.age / 0.35) +
    0.25 * Math.max(0, z.mass - 1.4) +
    0.55 * Math.exp(-M_sol / 0.12);
  const WT = WA + WB + WC + WD;
  const probs = { A: WA / WT, B: WB / WT, C: WC / WT, D: WD / WT };

  const u = random();
  let cum = 0;
  let arch: 'A' | 'B' | 'C' | 'D' = 'D';
  const ks: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
  for (let i = 0; i < 4; i++) {
    cum += probs[ks[i]];
    if (u <= cum) {
      arch = ks[i];
      break;
    }
  }

  // Step 6A: Birth Orbits
  interface RawBody {
    kind: 'planet' | 'belt';
    role: string;
    a: number;
    e?: number;
    beltWidth?: number;
  }
  const bodies: RawBody[] = [];

  function safeE(ac: number, er: number, prev: RawBody | null, sf: number): number {
    if (!prev || prev.e === undefined) return +er.toFixed(3);
    const rapo = prev.a * (1 + prev.e);
    return +Math.min(er, Math.max(0.004, 1 - (sf * rapo) / ac)).toFixed(3);
  }

  if (arch === 'A') {
    const nA = randInt(5, 8);
    let acA = Math.max(z.a_in * rand(1.1, 2.2), Math.min(0.085 * a_snow, 0.14 * z.a_out));
    const cliff = Math.min(0.75 * z.a_out, 4.5 * a_snow);
    let prA: RawBody | null = null;
    for (let iA = 0; iA < nA && acA <= cliff; iA++) {
      const eA = safeE(acA, rand(0.002, 0.035), prA, 1.15);
      const cab = iA >= nA - 2 && acA >= 0.95 * a_snow;
      prA = { kind: 'planet', role: cab ? 'caboose' : 'pea', a: +acA.toFixed(4), e: eA };
      bodies.push(prA);
      acA *= rand(1.42, 1.85);
    }
    const abA = prA
      ? Math.min(0.88 * z.a_out, prA.a * rand(1.55, 2.1))
      : Math.min(0.8 * z.a_out, z.a_in * 4.5);
    if (abA < z.a_out && (!prA || abA > prA.a * 1.32)) {
      bodies.push({
        kind: 'belt',
        role: abA < a_snow ? 'Rocky Asteroid Belt' : 'Icy Asteroid Belt',
        a: +abA.toFixed(4),
        beltWidth: +(0.3 * abA).toFixed(4),
      });
    }
  } else if (arch === 'B') {
    // 52% chance of an inner ultra-short-period / close-in rocky world before the belt & giants
    let prB: RawBody | null = null;
    if (random() < 0.52) {
      const aUsp = clamp(z.a_in * rand(1.12, 2.6), z.a_in * 1.05, 0.14 * a_snow);
      if (aUsp < z.a_out * 0.25) {
        prB = {
          kind: 'planet',
          role: 'terrestrial',
          a: +aUsp.toFixed(4),
          e: +rand(0.003, 0.04).toFixed(3),
        };
        bodies.push(prB);
      }
    }
    const abB = clamp(
      a_snow * rand(0.35, 0.75),
      Math.max(z.a_in * 1.8, prB ? prB.a * 1.6 : 0),
      z.a_out * 0.35
    );
    bodies.push({
      kind: 'belt',
      role: abB < a_snow ? 'Rocky Asteroid Belt' : 'Icy Asteroid Belt',
      a: +abB.toFixed(4),
      beltWidth: +(0.24 * abB).toFixed(4),
    });
    const nB = randInt(2, 5);
    let acB = Math.max(abB * rand(1.65, 2.2), a_snow * rand(0.85, 1.45));
    prB = null;
    for (let iB = 0; iB < nB && acB <= 0.9 * z.a_out; iB++) {
      prB = {
        kind: 'planet',
        role: 'gas_giant',
        a: +acB.toFixed(4),
        e: safeE(acB, rand(0.12, 0.42), prB, 1.3),
      };
      bodies.push(prB);
      acB *= rand(2.05, 3.7);
    }
    if (prB && prB.a * 1.7 < 0.9 * z.a_out && random() < 0.55) {
      const akB = prB.a * rand(1.65, 2.15);
      bodies.push({
        kind: 'belt',
        role: akB < a_snow ? 'Rocky Asteroid Belt' : 'Icy Asteroid Belt',
        a: +akB.toFixed(4),
        beltWidth: +(0.3 * akB).toFixed(4),
      });
    }
  } else if (arch === 'C') {
    const nIn = randInt(3, 5);
    let acC = Math.max(z.a_in * rand(1.12, 2.1), a_snow * rand(0.032, 0.11));
    let prC: RawBody | null = null;
    for (let iC = 0; iC < nIn && acC <= 0.64 * a_snow && acC <= 0.5 * z.a_out; iC++) {
      prC = {
        kind: 'planet',
        role: 'terrestrial',
        a: +acC.toFixed(4),
        e: safeE(acC, rand(0.005, 0.075), prC, 1.18),
      };
      bodies.push(prC);
      acC *= rand(1.4, 1.88);
    }
    const abM = Math.max(prC ? prC.a * 1.36 : z.a_in * 2.2, a_snow * rand(0.75, 1.0));
    if (abM < 0.85 * z.a_out) {
      bodies.push({
        kind: 'belt',
        role: abM < a_snow ? 'Rocky Asteroid Belt' : 'Icy Asteroid Belt',
        a: +abM.toFixed(4),
        beltWidth: +(0.22 * abM).toFixed(4),
      });
    }
    const nOut = randInt(2, 5);
    acC = Math.max(abM * rand(1.5, 1.9), a_snow * rand(1.35, 2.05));
    prC = null;
    for (let jC = 0; jC < nOut && acC <= 0.88 * z.a_out; jC++) {
      prC = {
        kind: 'planet',
        role: jC < 2 ? 'gas_giant' : 'ice_giant',
        a: +acC.toFixed(4),
        e: safeE(acC, rand(0.01, 0.085), prC, 1.25),
      };
      bodies.push(prC);
      acC *= rand(1.75, 2.5);
    }
    if (prC && prC.a * 1.55 < 0.92 * z.a_out) {
      const akC = prC.a * rand(1.5, 1.85);
      bodies.push({
        kind: 'belt',
        role: akC < a_snow ? 'Rocky Asteroid Belt' : 'Icy Asteroid Belt',
        a: +akC.toFixed(4),
        beltWidth: +(0.28 * akC).toFixed(4),
      });
    }
  } else {
    const nD = randInt(2, 4);
    const bRad: number[] = [];
    let acD = Math.max(z.a_in * rand(1.8, 3.2), Math.min(0.25 * a_snow, z.a_in * 2.5));
    for (let iD = 0; iD < nD && acD <= 0.85 * z.a_out; iD++) {
      bRad.push(acD);
      bodies.push({
        kind: 'belt',
        role: acD < a_snow ? 'Rocky Asteroid Belt' : 'Icy Asteroid Belt',
        a: +acD.toFixed(4),
        beltWidth: +(0.28 * acD).toFixed(4),
      });
      acD *= rand(2.4, 4.2);
    }
    const nP = Math.min(randInt(0, 2), Math.max(0, bRad.length - 1));
    for (let jD = 0; jD < nP; jD++) {
      const apD = Math.sqrt(bRad[jD] * bRad[jD + 1]);
      bodies.push({
        kind: 'planet',
        role: apD > a_snow ? 'ice_giant' : 'terrestrial',
        a: +apD.toFixed(4),
        e: +rand(0.02, 0.14).toFixed(3),
      });
    }
    bodies.sort((x, y) => x.a - y.a);
  }

  // Step 6B: 1-2% Disk Partitioning & 3-Snow-Line Composition
  const N = bodies.length;
  const natOut = 50.0 * Math.pow(z.mass, 0.55);
  const diskEarth =
    z.mass * M_SUN_EARTH * rand(0.01, 0.02) * Math.min(1.0, Math.pow(z.a_out / natOut, 0.75));
  const mScale = Math.pow(10, z.feh);
  const wts: number[] = [];
  let sumW = 0;
  for (let wI = 0; wI < N; wI++) {
    const bw = bodies[wI];
    const w =
      arch === 'A'
        ? Math.pow(bw.a / a_snow, 0.18) *
          (bw.role === 'caboose' ? rand(2.1, 3.5) : 1.0) *
          rand(0.8, 1.22)
        : bw.role === 'terrestrial'
        ? 0.45 * Math.pow(bw.a / a_snow, 0.3) * rand(0.6, 1.45)
        : Math.pow(Math.min(bw.a / a_snow, 4.0), 0.4) * rand(0.65, 1.5);
    wts.push(w);
    sumW += w;
  }

  interface MidBody {
    kind: 'planet' | 'belt';
    role: string;
    a: number;
    a_birth: number;
    e: number;
    beltWidth?: number;
    migrationHistory: string;
    rawSlotMassEarth: number;
    coreMassEarth: number;
    rockMassEarth: number;
    iceMassEarth: number;
    massEarth: number;
    massJup: number;
    rockFrac: number;
    iceFrac: number;
    gasFrac: number;
  }

  let mBodies: MidBody[] = [];
  for (let mI = 0; mI < N; mI++) {
    const bd = bodies[mI];
    const slotM = diskEarth * (wts[mI] / Math.max(1e-6, sumW));
    const Tdisk = (280.0 * Math.pow(z.lum, 0.25)) / Math.sqrt(bd.a);
    const fRock = (Tdisk <= 1050 ? 0.0048 : Tdisk <= 1450 ? 0.0022 : 0.0005) * mScale;
    const fIce =
      ((bd.a >= a_snow ? 0.006 : 0) +
        (bd.a >= 3.2 * a_snow ? 0.0025 : 0) +
        (bd.a >= 12.0 * a_snow ? 0.0015 : 0)) *
      mScale;
    const fSol = clamp(fRock + fIce, 1e-4, 0.12);
    const mRock = Math.max(1e-4, slotM * fRock);
    const mIce = slotM * fIce;
    const mCore = mRock + mIce;
    const mGasAvail = slotM * (1 - fSol);

    if (bd.kind === 'belt') {
      const dep =
        arch === 'D' || bd.a > 2.5 * a_snow || z.age < 0.3
          ? rand(0.01, 0.07)
          : rand(0.0004, 0.003);
      mBodies.push({
        kind: 'belt',
        role: bd.role,
        a: bd.a,
        a_birth: bd.a,
        e: 0,
        beltWidth: bd.beltWidth || +(0.25 * bd.a).toFixed(4),
        migrationHistory: 'Debris Belt',
        rawSlotMassEarth: +slotM.toFixed(1),
        coreMassEarth: mCore,
        rockMassEarth: mRock,
        iceMassEarth: mIce,
        massEarth: +(mCore * dep).toExponential(2),
        massJup: 0,
        rockFrac: 1,
        iceFrac: 0,
        gasFrac: 0,
      });
      continue;
    }

    const S_b = z.lum / (bd.a * bd.a);
    const M_str = 2.2 * Math.pow(S_b, 0.22);
    let hasOutP = false;
    for (let hI = mI + 1; hI < N; hI++) {
      if (bodies[hI].kind === 'planet') hasOutP = true;
    }

    let mGas = 0.0;
    if (mCore >= rand(8.8, 11.5) && bd.role !== 'terrestrial') {
      const starved = (arch === 'A' && hasOutP) || (arch === 'C' && hasOutP && random() < 0.5);
      mGas =
        mGasAvail *
        (starved ? rand(0.03, 0.15) : arch === 'B' ? rand(0.35, 0.8) : rand(0.18, 0.58));
    } else if (mCore >= Math.max(1.65, M_str) && bd.role !== 'terrestrial') {
      mGas = Math.min(mGasAvail * 0.15, mCore * 0.032 * Math.pow(mCore, 1.62) * rand(0.75, 1.25));
    }
    const mTotP = Math.max(0.005, mCore + mGas);
    mBodies.push({
      kind: 'planet',
      role: bd.role,
      a: bd.a,
      a_birth: bd.a,
      e: bd.e || 0.01,
      migrationHistory: 'In-Situ Birth Orbit',
      rawSlotMassEarth: +slotM.toFixed(1),
      coreMassEarth: mCore,
      rockMassEarth: mRock,
      iceMassEarth: mIce,
      massEarth: mTotP,
      massJup: mTotP / M_JUP_EARTH,
      rockFrac: +(mRock / mTotP).toFixed(4),
      iceFrac: +(mIce / mTotP).toFixed(4),
      gasFrac: +(mGas / mTotP).toFixed(4),
    });
  }

  // Step 6C: Migration
  const pRot = rand(3.5, 7.0) / 365.25;
  const a_cav = Math.max(z.a_in, Math.pow(z.mass * pRot * pRot, 0.333));

  if (arch === 'A') {
    const plsA = mBodies.filter((x) => x.kind === 'planet');
    if (plsA.length) {
      let aRes = Math.min(plsA[0].a_birth, a_cav * rand(0.95, 1.75));
      for (let pI = 0; pI < plsA.length; pI++) {
        if (pI > 0) aRes *= plsA[pI].massEarth >= 22 ? rand(1.42, 1.72) : rand(1.25, 1.52);
        plsA[pI].a = +Math.min(plsA[pI].a_birth, aRes).toFixed(4);
        plsA[pI].e = +rand(0.002, 0.028).toFixed(4);
        plsA[pI].migrationHistory =
          plsA[pI].a_birth >= a_snow && plsA[pI].a < a_snow
            ? plsA[pI].massEarth >= 18
              ? 'Type I/II Convoy Caboose Giant (Kepler-90 h)'
              : 'Type I Convoy Across Snow Line (Water World)'
            : 'Type I Resonant Chain Convoy';
      }
    }
  } else if (arch === 'B') {
    const gtsB = mBodies.filter((x) => x.kind === 'planet' && x.massEarth >= 28);
    if (gtsB.length >= 1 && random() < 0.64) {
      const hj = gtsB[0];
      const rp = rand(Math.max(0.014, z.a_in * 0.8), 0.055);
      const af = clamp(2 * rp, z.a_in * 0.95, Math.max(0.06, 0.095 * Math.sqrt(z.lum)));
      const tcB = 0.35 * Math.pow(hj.massJup, 0.6) * Math.pow(af / 0.05, 6.5);
      if (z.age >= tcB) {
        hj.a = +af.toFixed(4);
        hj.e = +rand(0.001, 0.022).toFixed(4);
        hj.migrationHistory = 'High-e Tidally Circularized Hot Jupiter';
      } else {
        hj.e = +clamp((1 - rp / hj.a_birth) * (1 - (0.75 * z.age) / tcB), 0.2, 0.92).toFixed(4);
        hj.a = +(af / (1 - hj.e * hj.e)).toFixed(4);
        hj.migrationHistory = 'Eccentric Migrating Proto-Hot Jupiter';
      }
      mBodies = mBodies.filter((x) => {
        if (x === hj || x.a > hj.a_birth * 1.35) return true;
        if (x.kind === 'planet' && x.a < hj.a * 0.58) {
          x.migrationHistory = 'Inner Ultra-Short-Period Shepherd Companion';
          return true;
        }
        return x.kind === 'belt' && x.a < hj.a * 0.55;
      });
    }
  } else if (arch === 'C') {
    const gtsC = mBodies.filter(
      (x) => x.kind === 'planet' && x.a >= 0.95 * a_snow && x.massEarth >= 16
    );
    if (gtsC.length >= 1) {
      const g1 = gtsC[0];
      const g2 = gtsC[1];
      const brk =
        g2 &&
        g1.massEarth >= 110 &&
        g2.massEarth / g1.massEarth >= 0.22 &&
        g2.a / g1.a <= 2.15 &&
        z.feh < 0.15;
      if (!brk && random() < 0.56) {
        const isHotJupiterPark = random() < 0.46;
        const cCnt =
          !isHotJupiterPark && gtsC.length >= 3 && z.feh >= 0.08 && random() < 0.55
            ? randInt(2, 3)
            : 1;
        const mGs = gtsC.slice(0, cCnt);
        const tLead = isHotJupiterPark
          ? clamp(
              a_cav * rand(1.08, 2.3),
              z.a_in * 1.05,
              Math.max(0.055, 0.095 * Math.sqrt(z.lum))
            )
          : cCnt >= 2
          ? clamp(a_snow * rand(0.05, 0.18), a_cav * 2.2, 0.35 * a_snow)
          : clamp(a_snow * rand(0.22, 0.62), a_cav * 2.2, 0.72 * a_snow);
        const cRat = tLead / g1.a;
        let prA2 = tLead;
        for (let gI = 0; gI < mGs.length; gI++) {
          mGs[gI].a = gI === 0 ? +tLead.toFixed(4) : +(prA2 * rand(2.05, 3.1)).toFixed(4);
          mGs[gI].e = +rand(0.003, 0.045).toFixed(4);
          mGs[gI].migrationHistory = isHotJupiterPark
            ? 'Type II Magnetospheric Cavity Stall (Hot Jupiter)'
            : mGs[gI].a >= 0.28 * a_snow && mGs[gI].a <= 0.78 * a_snow
            ? 'Type II HZ Stall (55 Cnc f / HD 10180 g)'
            : 'Type II Convoy Giant';
          prA2 = mGs[gI].a;
        }
        mBodies = mBodies.filter((x) => {
          if (mGs.indexOf(x) !== -1) return true;
          if (x.a > mGs[mGs.length - 1].a_birth * 1.15) return true;
          if (x.kind === 'belt') return x.a > prA2 * 1.55;
          x.a = +(x.a * cRat * rand(0.55, 0.78)).toFixed(4);
          x.e = +rand(0.004, 0.038).toFixed(4);
          x.migrationHistory = 'Accordion-Compressed Inner World (55 Cnc e)';
          return x.a >= z.a_in * 0.9 && x.a <= tLead * 0.68;
        });
      }
    }
  }
  mBodies.sort((x, y) => x.a - y.a);

  // Step 6D & 6E: Finalize Atmospheres, Water & Exotic Solvent Worlds, Moons & Spin
  function ghDelta(
    pCO2: number,
    pN2: number,
    pH2: number,
    pCH4: number,
    pH2O: number,
    pNH3 = 0,
    pSO2 = 0,
    Teq = 255,
    grav = 1.0
  ): number {
    const pT = Math.max(1e-5, pCO2 + pN2 + pH2 + pCH4 + pH2O + pNH3 + pSO2);
    if (pT < 1e-4) return 0;

    // Column mass scales inversely with surface gravity (u = P / g); line wings broaden with total pressure
    const gFactor = Math.pow(1.0 / clamp(grav, 0.08, 4.0), 0.16);
    const pBroad = Math.min(1.0, Math.pow(pT / 0.035, 0.42));
    const ciaBroad = Math.pow(Math.max(0.05, pT) / Math.max(0.05, pCO2), 0.12);

    // 1. Rotational-vibrational band absorptions (subject to mutual spectral band overlap)
    const bandCO2 =
      pCO2 > 0 ? 3.8 * Math.log(1 + (pCO2 * gFactor) / 0.00012) * pBroad : 0;
    const bandH2O =
      pH2O > 0 ? 9.2 * Math.log(1 + (pH2O * gFactor) / 0.001) * pBroad : 0;
    const bandCH4 =
      pCH4 > 0 ? 5.2 * Math.log(1 + (pCH4 * gFactor) / 0.002) * pBroad : 0;
    const bandNH3 =
      pNH3 > 0 ? 8.5 * Math.log(1 + (pNH3 * gFactor) / 0.0008) * pBroad : 0;
    const bandSO2 =
      pSO2 > 0 ? 6.8 * Math.log(1 + (pSO2 * gFactor) / 0.001) * pBroad : 0;

    // Combine overlapping IR bands via p-norm (p = 1.4) so minor gases only plug remaining spectral windows
    const bandOverlap = Math.pow(
      Math.pow(bandCO2, 1.4) +
        Math.pow(bandH2O, 1.4) +
        Math.pow(bandCH4, 1.4) +
        Math.pow(bandNH3, 1.4) +
        Math.pow(bandSO2, 1.4),
      1 / 1.4
    );

    // 2. Continuum & Collision-Induced Absorption (CIA) at multi-bar pressures
    const contCO2 =
      pCO2 > 0 ? 13.5 * Math.pow(pCO2 * gFactor, 0.75) * ciaBroad : 0;
    const contH2O = pH2O > 0 ? 22.0 * Math.pow(pH2O * gFactor, 0.58) : 0;
    const ciaH2 =
      pH2 > 0
        ? 38.0 *
          Math.pow(pH2 * gFactor, 0.65) *
          Math.pow(1 + 0.35 * pN2 + 0.5 * pCO2, 0.2)
        : 0;
    const ciaN2 = pN2 >= 0.5 ? 2.4 * Math.pow(pN2 * gFactor, 0.8) : 0;

    // Radiative-convective thermal scaling: cold cryogenic atmospheres require less ΔT per unit optical depth
    const tempScale = clamp(Math.pow(Math.max(50, Teq) / 255.0, 0.32), 0.58, 1.28);

    const rawGH = (bandOverlap + contCO2 + contH2O + ciaH2 + ciaN2) * tempScale;
    return clamp(rawGH, 0, 720);
  }

  function solveCO2ForTargetTemp(
    targetT: number,
    Teq: number,
    pN2: number,
    pH2: number,
    pCH4: number,
    pH2O: number,
    pNH3: number,
    pSO2: number,
    grav: number,
    minP: number,
    maxP: number
  ): number {
    let lo = minP;
    let hi = Math.max(minP, maxP);
    for (let i = 0; i < 12; i++) {
      const mid = 0.5 * (lo + hi);
      const tMid = Teq + ghDelta(mid, pN2, pH2, pCH4, pH2O, pNH3, pSO2, Teq, grav);
      if (tMid < targetT) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return +(0.5 * (lo + hi)).toFixed(4);
  }

  const systemInvariantNodeDeg = +rand(0, 360).toFixed(1);
  const finalBodies: RealisticPlanetOrBelt[] = [];
  for (let fI = 0; fI < mBodies.length; fI++) {
    const b = mBodies[fI];
    if (b.kind === 'belt') {
      const { incDeg, omegaNodeDeg } = computeOrbitalInclination(
        'belt',
        b.role,
        b.a,
        0.02,
        b.massEarth,
        systemInvariantNodeDeg,
        random,
        rand
      );
      finalBodies.push({
        kind: 'belt',
        role: b.role,
        a: b.a,
        a_birth: b.a_birth,
        beltWidth: b.beltWidth || +(0.25 * b.a).toFixed(4),
        rawSlotMassEarth: b.rawSlotMassEarth,
        massEarth: b.massEarth,
        incDeg,
        omegaNodeDeg,
      });
      continue;
    }

    const Seff = z.lum / (b.a * b.a * Math.sqrt(Math.max(0.01, 1 - b.e * b.e)));
    const Mstr2 = 2.2 * Math.pow(Seff, 0.22);
    let isChth = false;
    if (
      b.gasFrac > 0.02 &&
      ((b.massEarth < 160 && Seff > 650) || (b.massEarth < 25 && b.coreMassEarth < Mstr2))
    ) {
      if (b.massEarth >= 25 && Seff > 650) isChth = true;
      b.massEarth = Math.max(0.01, b.coreMassEarth);
      b.gasFrac = 0;
      b.rockFrac = +(b.rockMassEarth / b.massEarth).toFixed(4);
      b.iceFrac = +(b.iceMassEarth / b.massEarth).toFixed(4);
    }

    const cIce = b.iceMassEarth / Math.max(1e-5, b.coreMassEarth);
    const Rcore = Math.max(
      0.08,
      Math.pow(b.coreMassEarth, 0.279) * (0.98 * (1 - cIce) + 1.19 * cIce)
    );
    let rE = Rcore;
    if (b.gasFrac > 0.005 && b.massEarth < 95) {
      rE = Rcore * (1 + 1.85 * Math.pow(b.gasFrac, 0.55));
    } else if (b.massEarth >= 95) {
      const mJ = b.massEarth / M_JUP_EARTH;
      rE =
        R_JUP_EARTH *
        Math.pow(mJ, -0.04) *
        (1 +
          0.14 * Math.pow(Math.max(0.02, z.age) / 0.2, -0.3) +
          (Seff > 150 ? 0.12 * Math.pow(log10(Seff / 150), 1.3) : 0));
    }
    const dens = (5.514 * b.massEarth) / Math.pow(rE, 3);
    const grav = b.massEarth / (rE * rE);
    const T0 = 278.5 * Math.pow(Seff, 0.25);
    const Tint =
      b.massEarth >= 25
        ? 105 *
          Math.pow(b.massEarth / M_JUP_EARTH, 0.55) *
          Math.pow(Math.max(0.02, z.age) / 4.5, -0.32)
        : 0;

    let alb = 0.3;
    let pClass = 'Rocky World';
    let sud: string | null = null;
    if (b.gasFrac >= 0.015 || b.massEarth >= 15) {
      if (b.massEarth >= 42) {
        const Test = Math.pow(Math.pow(T0 * 0.91, 4) + Math.pow(Tint, 4), 0.25);
        if (Test < 150) {
          sud = 'I';
          pClass = 'Class I Gas Giant';
          alb = rand(0.5, 0.57);
        } else if (Test < 350) {
          sud = 'II';
          pClass = 'Class II Gas Giant';
          alb = rand(0.74, 0.81);
        } else if (Test < 900) {
          sud = 'III';
          pClass =
            Test >= 620
              ? 'Class III Hot Jupiter'
              : 'Class III Gas Giant';
          alb = rand(0.08, 0.15);
        } else if (Test < 1400) {
          sud = 'IV';
          pClass = 'Class IV Hot Jupiter';
          alb = rand(0.02, 0.06);
        } else {
          sud = 'V';
          pClass = 'Class V Hot Jupiter';
          alb = rand(0.45, 0.55);
        }
      } else if (b.iceFrac >= 0.2 || b.massEarth >= 10) {
        alb = T0 < 220 ? rand(0.3, 0.42) : rand(0.15, 0.28);
        pClass =
          T0 < 220
            ? 'Ice Giant'
            : T0 >= 650
            ? 'Hot Neptune'
            : 'Warm Neptune';
      } else {
        alb = rand(0.22, 0.38);
        pClass = 'Gas Dwarf';
      }
    } else {
      alb = b.iceFrac >= 0.15 ? rand(0.35, 0.58) : rand(0.12, 0.28);
      if (isChth) pClass = 'Chthonian Stripped Giant Core';
    }

    // Spin & Tidal Locking (Computed early so rotation informs dynamo Coriolis organization)
    const pDays = 365.25 * Math.sqrt(Math.pow(b.a, 3) / z.mass);
    const pHrs = pDays * 24;
    const aLock =
      0.45 *
      (b.gasFrac >= 0.1 ? 0.65 : 1.0) *
      Math.pow(z.mass, 0.333) *
      Math.pow(Math.max(0.01, z.age) / 4.5, 0.167);
    let rotH = 24;
    let spinSt = 'Free Prograde Rotation';
    let tilt = +rand(2, 38).toFixed(1);
    if (b.a <= aLock) {
      const r32 = b.e >= 0.1;
      rotH = +(r32 ? 0.667 * pHrs : pHrs).toFixed(1);
      spinSt = r32 ? '3:2 Spin-Orbit Resonance' : '1:1 Tidally Locked';
      tilt = +rand(0.1, 1.8).toFixed(1);
    } else if (b.gasFrac >= 0.015 || b.massEarth >= 12) {
      rotH = +rand(8.5, 18).toFixed(1);
      spinSt = 'Fast Nebular Spin';
    } else if (random() < 0.1) {
      rotH = +rand(150, 3200).toFixed(0);
      spinSt = 'Slow Retrograde (Impact)';
      tilt = +rand(92, 175).toFixed(1);
    } else {
      rotH = +Math.exp(rand(Math.log(8.5), Math.log(50))).toFixed(1);
    }

    const magField = computePlanetaryMagneticField({
      massEarth: b.massEarth,
      radiusEarth: rE,
      densityGcm3: dens,
      rockFrac: b.rockFrac,
      iceFrac: b.iceFrac,
      gasFrac: b.gasFrac,
      aAU: b.a,
      starLum: z.lum,
      starMass: z.mass,
      sysAgeGyr: z.age,
      rotHours: rotH,
      random,
      rand,
    });

    const Teq = +(T0 * Math.pow(1 - alb, 0.25)).toFixed(1);
    const Tatm = +Math.pow(Math.pow(Teq, 4) + Math.pow(Tint, 4), 0.25).toFixed(1);
    const xuv = Seff * Math.pow(Math.max(0.05, z.age) / 4.5, -1.1) * Math.pow(z.mass, -1.2);
    // Unshielded planetary bodies suffer enhanced solar wind sputtering and ion pickup, raising muMin
    const windStripPenalty =
      magField.shieldingEfficiencyPct < 50
        ? 1.0 +
          0.35 *
            (1 - magField.shieldingEfficiencyPct / 100) *
            Math.min(2.5, 4.5 / Math.max(0.2, z.age))
        : 1.0;
    const muMin = +(
      ((0.028 * Teq * (1 + 1.6 * Math.pow(Math.max(0.01, xuv), 0.25))) /
        Math.max(1e-4, b.massEarth / rE)) *
      windStripPenalty
    ).toFixed(1);

    let atmoType = '';
    let pBar: number | null = null;
    let ghK = 0;
    let Tsurf = Tatm;
    const gases: Record<string, number> = {};
    let hydro: RealisticHydrosphere | null = null;

    if (b.gasFrac >= 0.015 || b.massEarth >= 15) {
      const vol = clamp((b.massEarth < 45 ? 0.038 : 0.009) * mScale, 0.002, 0.14);
      const he = +(0.24 * (1 - vol)).toFixed(3);
      const h2 = +(1 - he - vol).toFixed(3);
      atmoType =
        b.massEarth >= 42 ? 'Primary Jovian H2/He Envelope' : 'Primary Neptunian Envelope';
      gases.H2 = h2;
      gases.He = he;
      gases.CH4_NH3_H2O = +vol.toFixed(3);
    } else if (Teq >= 1100 || (Teq >= 775 && muMin > 64)) {
      const isRefractoryVapor = Teq >= 1200;
      atmoType = isRefractoryVapor
        ? 'Silicate & Alkali Rock-Vapor Exosphere'
        : 'Outgassed Volcanic SO2-Na-K Lava Vapor Sky';
      pBar = +(isRefractoryVapor ? rand(0.015, 0.24) : rand(0.004, 0.065)).toFixed(3);
      ghK = +rand(22, 48).toFixed(1);
      Tsurf = +(Tatm + ghK).toFixed(1);
      const isGlobalMagma = Tsurf >= 1400 || random() < 0.35;
      const covPct = isGlobalMagma
        ? 100
        : clamp(Math.round(22 + ((Tsurf - 800) / 600) * 60 + rand(-10, 12)), 18, 88);
      pClass = isChth
        ? isGlobalMagma
          ? 'Molten Chthonian Planet'
          : 'Molten Chthonian Planet'
        : isGlobalMagma
        ? 'Molten Magma Ocean Planet'
        : 'Molten Planet';
      if (isRefractoryVapor) {
        gases.SiO = 0.48;
        gases.Na_K = 0.22;
        gases.O2 = 0.25;
        gases.Fe_Mg = 0.05;
      } else {
        gases.SO2 = 0.56;
        gases.Na_K = 0.24;
        gases.SiO = 0.12;
        gases.O2 = 0.08;
      }
      hydro = {
        state: isGlobalMagma
          ? 'Global Surface Liquid Silicate Magma Ocean (100% Coverage)'
          : `Surface Liquid Silicate Lava Seas & Volcanic Continents (${covPct}% Liquid Coverage)`,
        solvent: 'Silicate Magma',
        coveragePct: covPct,
        biosphere: null,
        liqKm: isGlobalMagma
          ? clamp(Math.round(rE * 65), 20, 280)
          : clamp(Math.round(rE * 11 * rand(0.4, 1.5)), 2, 22),
        scKm: 0,
        iceKm: 0,
        siKm: 0,
      };
    } else if (muMin > 64) {
      atmoType = 'Airless Barren Vacuum';
      pBar = 0;
      Tsurf = Teq;
      pClass =
        b.iceFrac >= 0.2
          ? 'Frozen World'
          : isChth
          ? 'Airless Chthonian Core'
          : 'Barren Rocky World';
    } else {
      const mSc2 = Math.pow(10, 0.5 * z.feh);
      const hasCont = b.iceFrac < 0.015;
      const rH2 = muMin <= 4.5 ? Math.pow(b.massEarth, 1.1) * rand(1.2, 12.0) * (4.8 - muMin) : 0;
      const rN2 =
        muMin <= 28 ? Math.pow(b.massEarth, 0.75) * grav * mSc2 * rand(0.7, 2.2) : 0;
      const rCO2 =
        muMin <= 28
          ? Math.pow(b.massEarth, 0.85) * grav * mSc2 * rand(28, 95)
          : muMin <= 44
          ? Math.pow(b.massEarth, 1.1) * grav * mSc2 * rand(0.08, 6.5)
          : 0;
      const cCap =
        Teq >= 195 || rH2 > 0.5
          ? 500
          : Teq >= 135
          ? 45 * Math.exp((Teq - 195) / 11.5)
          : 0.0001;
      const avCO2 = Math.min(rCO2, cCap);
      const Tpot = Teq + ghDelta(avCO2, rN2, rH2, 0, Teq > 240 ? 0.05 : 0.01, 0, 0, Teq, grav);

      let pC = 0;
      let pN = rN2;
      const pH = rH2;
      let pO = 0;
      let pM = 0;
      let pW = 0;
      let pS = 0;
      let pNH3 = 0;
      let pH2SO4 = 0;
      let isSupercriticalWater = false;
      let biosphereDesc: string | null = null;

      if (Teq > 325 || (Tpot >= 340 && (!hasCont || rH2 >= 1.5))) {
        pC = avCO2;
        const Tdry = Teq + ghDelta(pC, pN, pH, 0, 0.02, 0, 0, Teq, grav);
        if (hasCont && Teq > 325) {
          // Hot inner rocky world: either sulfate-buffered Sulfuric Acid (H2SO4) Seas/Ocean, dry Venusian, or Molten Planet (if Tsurf >= 800 K)
          const sulfateBuffered = Teq <= 435 && random() < 0.36;
          if (sulfateBuffered) {
            pC = clamp(avCO2 * rand(0.04, 0.32), 0.8, 24);
          }
          pS = +(rand(0.08, 0.65) * Math.pow(b.massEarth, 0.85) * mSc2).toFixed(3);
          const Ttest = Teq + ghDelta(pC, pN, pH, 0, 0.005, 0, pS, Teq, grav);
          const tBoilH2SO4 = 610 + 18 * Math.log(1 + pC + pN + pS);
          if (Ttest >= 275 && Ttest <= tBoilH2SO4) {
            pH2SO4 = +clamp(rand(0.008, 0.065) * (pS + 0.2), 0.002, 0.18).toFixed(4);
            atmoType = 'Dense CO2-SO2 Sky w/ Surface H2SO4 Acid Rain';
            pClass =
              random() < 0.78
                ? 'Sulfuric Acid Marine World'
                : 'Sulfuric Acid Ocean World';
          } else {
            atmoType = 'Venusian Desiccated CO2-SO2 Runaway Greenhouse';
            pClass = 'Venusian World';
          }
        } else {
          let Tit = Tdry;
          for (let s = 0; s < 5; s++) {
            pW =
              Tit < 273.15
                ? 0.006
                : Tit >= 647.1
                ? 220.6
                : 1.013 * Math.exp(13.7 * (1 - 373.15 / Tit));
            Tit = 0.5 * Tit + 0.5 * (Teq + ghDelta(pC, pN, pH, 0, pW, 0, 0, Teq, grav));
          }
          if (Tit >= 647.1 || pW >= 220.6) {
            pW = 220.6;
            isSupercriticalWater = true;
            atmoType = 'Continuous Supercritical Steam-Fluid Envelope (No Surface)';
            pClass = 'Supercritical Water World';
          } else {
            atmoType =
              rH2 >= 1.5
                ? 'Hycean Greenhouse Water World (Pressure-Cooker Ocean)'
                : 'Greenhouse Water World (CO2-Pressurized Liquid Ocean)';
            pClass = 'Greenhouse Water World';
          }
        }
      } else if (muMin > 28 && muMin <= 64) {
        // Heavy-gas retention regime (28 < muMin <= 64): H2O (18) & N2 (28) escape, leaving CO2 (44) and volcanic SO2 (64)
        pC = muMin <= 44 ? avCO2 : 0;
        pS =
          Teq >= 150 && b.iceFrac < 0.08
            ? +(Math.pow(b.massEarth, 0.9) * grav * mSc2 * rand(0.18, 3.8)).toFixed(3)
            : +(rand(0.002, 0.04) * b.massEarth).toFixed(4);
        const Ttest = Teq + ghDelta(pC, 0, 0, 0, 0, 0, pS, Teq, grav);
        const pTotHeavy = pC + pS;
        const tBoilSO2 = Math.min(428, 263.15 / Math.max(0.5, 1 - Math.log(Math.max(0.05, pTotHeavy)) / 10.5));
        const pSatSO2 =
          Ttest >= 197.7 && Ttest <= 430.8
            ? 1.013 * Math.exp(10.5 * (1 - 263.15 / Ttest))
            : 1e9;
        if (Ttest >= 197.7 && Ttest <= tBoilSO2 && pTotHeavy >= Math.max(0.04, pSatSO2 * 0.5)) {
          atmoType = 'Heavy Volcanic SO2-CO2 Equilibrium Sky';
          pClass =
            random() < 0.78
              ? 'Volcanic SO2 Marine World'
              : 'Volcanic SO2 Ocean World';
        } else {
          atmoType = pC + pS >= 0.05 ? 'Thin Volcanic CO2-SO2 Sky' : 'Tenuous Heavy-Gas Exosphere';
          pClass = b.iceFrac >= 0.15 ? 'Frozen World' : 'Martian World';
        }
      } else if (Tpot >= 274 && muMin <= 28) {
        if (hasCont) {
          // Check whether a high-pressure Liquid CO2 world (5.2 <= P_CO2 <= 55 bar, 218 <= Tsurf <= 302.5 K) is physically possible at this Teq
          const tAtMinCO2 = Teq + ghDelta(5.2, pN, pH, 0, 0.001, 0, 0, Teq, grav);
          const tAtMaxCO2 = Teq + ghDelta(Math.min(55, Math.max(5.2, avCO2)), pN, pH, 0, 0.001, 0, 0, Teq, grav);
          const canBeLiquidCO2 =
            b.iceFrac < 0.005 &&
            avCO2 >= 5.5 &&
            tAtMinCO2 <= 301.0 &&
            tAtMaxCO2 >= 220.0;

          const isDesiccatedSulfur = b.iceFrac < 0.003 && Teq >= 220 && random() < 0.22;
          const isHighPressureCO2 = !isDesiccatedSulfur && canBeLiquidCO2 && random() < 0.38;

          if (isDesiccatedSulfur) {
            pC = clamp(avCO2 * rand(0.05, 0.25), 0.4, 14);
            pS = +(rand(0.35, 3.2) * grav * mSc2).toFixed(3);
            const Ttest = Teq + ghDelta(pC, pN, pH, 0, 0, 0, pS, Teq, grav);
            const pTotS = pC + pN + pH + pS;
            const tBoilSO2 = Math.min(428, 263.15 / Math.max(0.5, 1 - Math.log(Math.max(0.05, pTotS)) / 10.5));
            const tBoilH2SO4 = 610 + 18 * Math.log(1 + pTotS);
            const hasContinents = random() < 0.78;
            if (Ttest > tBoilSO2 && Ttest <= tBoilH2SO4) {
              pH2SO4 = +rand(0.01, 0.06).toFixed(3);
              atmoType = 'Sulfurous CO2-SO2-H2SO4 Acidic Sky';
              pClass = hasContinents
                ? 'Sulfuric Acid Marine World'
                : 'Sulfuric Acid Ocean World';
            } else if (Ttest >= 198 && Ttest <= tBoilSO2) {
              atmoType = 'Volcanic N2-CO2-SO2 Sulfurous Sky';
              pClass = hasContinents
                ? 'Volcanic SO2 Marine World'
                : 'Volcanic SO2 Ocean World';
            } else {
              atmoType = 'Venusian Desiccated CO2-SO2 Runaway Greenhouse';
              pClass = 'Venusian World';
            }
          } else if (isHighPressureCO2) {
            // Solve self-consistently for P_CO2 >= 5.2 bar so Tsurf genuinely lands in [220 K, 301.5 K]
            const targetT = rand(Math.max(222, tAtMinCO2), Math.min(301.5, tAtMaxCO2));
            pW = 0.001;
            pC = solveCO2ForTargetTemp(
              targetT,
              Teq,
              pN,
              pH,
              0,
              pW,
              0,
              0,
              grav,
              5.2,
              Math.min(55, avCO2)
            );
            atmoType = 'High-Pressure Super-Dense CO2-N2 Sky (Liquid CO2 Regime)';
            pClass =
              random() < 0.72
                ? 'Liquid CO2 Marine World'
                : 'High-Pressure Liquid CO2 Ocean World';
          } else {
            // Carbonate-silicate thermostat buffers P_CO2 so Tsurf lands in the temperate liquid-water window
            pW = rand(0.01, 0.028);
            const targetT = rand(280, 306);
            pC = solveCO2ForTargetTemp(
              targetT,
              Teq,
              pN,
              pH,
              0.001,
              pW,
              0,
              0,
              grav,
              0.0002,
              avCO2
            );
            const bio = z.age >= 1.5 && pC < 1.5 && random() < 0.65;
            if (bio) {
              const isShielded = magField.shieldingEfficiencyPct >= 50;
              if (isShielded) {
                biosphereDesc =
                  z.age >= 3.0
                    ? 'Active Multicellular Aerobic (O2-N2) Continental & Marine Biosphere'
                    : 'Active Unicellular Microbial (Archaean/Prokaryotic) Marine Biosphere';
              } else {
                biosphereDesc =
                  z.age >= 3.0
                    ? 'Active Multicellular Pelagic & Benthic Marine Biosphere (Unshielded Radiation-Sterilized Landmasses)'
                    : 'Active Unicellular Radiotolerant Marine Microbial Biosphere (Unshielded Surface)';
              }
            }
            pO = bio ? pN * rand(0.18, 0.32) : 0;
            pM = bio ? 0.0001 : rand(0.002, 0.02);
            atmoType =
              pC >= 0.5
                ? 'Outer-HZ Dense CO2-N2 Temperate Greenhouse'
                : bio
                ? 'N2-O2 Biosphere Sky (Earth-Class)'
                : 'Prebiotic N2-CO2 Marine Sky';
            pClass =
              b.massEarth > 2.0
                ? 'Temperate Super-Earth'
                : 'Temperate Terrestrial';
          }
        } else {
          pW = rand(0.012, 0.032);
          pC = clamp(avCO2 * rand(0.08, 0.3), 1.5, 28);
          const bioPelagic = z.age >= 1.5 && pC < 12 && random() < 0.55;
          if (bioPelagic) {
            pO = pN * rand(0.08, 0.22);
            const isShielded = magField.shieldingEfficiencyPct >= 50;
            biosphereDesc =
              z.age >= 3.0
                ? isShielded
                  ? 'Active Multicellular Pelagic Marine Biosphere'
                  : 'Active Multicellular Deep-Pelagic Ocean Biosphere (Surface Unshielded / Radiation Filtered Below 30m)'
                : isShielded
                ? 'Active Unicellular Pelagic Microbial Biosphere'
                : 'Active Unicellular Deep-Water Microbial Biosphere (Cosmic Ray Attenuation)';
          }
          atmoType = bioPelagic
            ? 'Biogenic N2-CO2-O2 Pelagic Sky (Marine Biosphere)'
            : 'Clathrate-Buffered CO2-N2 Pelagic Sky (Seltzer Ocean)';
          pClass = 'Temperate Pelagic Water World';
        }
      } else if (Teq >= 135 || b.iceFrac < 0.15) {
        // Sub-zero / Outer-HZ / Cool Zone: Check for Liquid NH3-H2O, Liquid CO2, or Liquid SO2 seas & oceans
        pC = avCO2;
        const canFormAmmoniaWorld =
          muMin <= 28 &&
          Teq >= 115 &&
          (b.iceFrac >= 0.015 || (b.iceFrac >= 0.001 && random() < 0.42));

        if (canFormAmmoniaWorld) {
          // At sub-zero temperatures, NH3 and CO2 precipitate as solid ammonium carbamate, leaving trace gaseous CO2
          const pC_nh3 = +clamp(rand(0.0003, 0.008), 0.0002, avCO2).toFixed(4);
          pNH3 = +clamp(pN * rand(0.02, 0.11) * Math.max(0.5, mSc2), 0.006, 0.85).toFixed(4);
          pM = +clamp(pN * rand(0.01, 0.06), 0.002, 0.35).toFixed(4);
          const Tsub = Teq + ghDelta(pC_nh3, pN, pH, pM, 0, pNH3, 0, Teq, grav);
          if (Tsub >= 176 && Tsub <= 265 && pC_nh3 + pN + pH + pNH3 >= 0.12) {
            pC = pC_nh3;
            const isContinentalNH3 = b.iceFrac < 0.035 || random() < 0.52;
            const bioNH3 = z.age >= 1.5 && random() < 0.58;
            if (bioNH3) {
              const pM_bio = +clamp(pM * rand(1.3, 2.2), 0.006, 0.45).toFixed(4);
              if (Teq + ghDelta(pC, pN, pH, pM_bio, 0, pNH3, 0, Teq, grav) <= 265) {
                pM = pM_bio;
              }
              const bioNH3Complex = z.age >= 3.0 ? 'Multicellular' : 'Unicellular';
              const isShielded = magField.shieldingEfficiencyPct >= 50;
              biosphereDesc = isContinentalNH3
                ? isShielded
                  ? `Active ${bioNH3Complex} Ammoniated (NH3-H2O) Marine & Cryo-Continental Biosphere`
                  : `Active ${bioNH3Complex} Subsurface & Pelagic Ammoniated Biosphere (Radiation-Sterilized Cryo-Continents)`
                : isShielded
                ? `Active ${bioNH3Complex} Pelagic Ammoniated (NH3-H2O) Marine Biosphere`
                : `Active ${bioNH3Complex} Deep Pelagic Ammoniated (NH3-H2O) Biosphere (Cosmic Ray Attenuation)`;
              atmoType = 'N2-NH3-CH4 Cryo-Biosphere Sky (Ammonia Life)';
              pClass = isContinentalNH3
                ? 'Cryo-Ammonia Terrestrial'
                : 'Cryo-Ammonia Pelagic World';
            } else {
              atmoType = 'Sub-Zero N2-NH3-CH4 Ammonia Greenhouse Sky';
              pClass = isContinentalNH3
                ? 'Cryo-Ammonia Marine World'
                : 'Cryo-Ammonia Ocean World';
            }
            pNH3 = 0;
            pM = 0;
            atmoType = 'Cold Glaciated CO2-N2 Sky';
            pClass = b.iceFrac >= 0.15 ? 'Frozen World' : 'Martian World';
          }
        } else if (b.iceFrac < 0.025 && muMin <= 44) {
          // Cool rocky world: check for High-Pressure Liquid CO2 Seas/Ocean (216.6-304.1 K, P_CO2 >= 5.18 bar) or Liquid SO2 Seas
          const tAtMinCO2 = Teq + ghDelta(5.2, pN, pH, 0, 0, 0, 0, Teq, grav);
          const tAtMaxCO2 = Teq + ghDelta(Math.max(5.2, avCO2), pN, pH, 0, 0, 0, 0, Teq, grav);
          if (avCO2 >= 5.2 && tAtMinCO2 <= 302.0 && tAtMaxCO2 >= 218.0) {
            const targetT = rand(Math.max(220, tAtMinCO2), Math.min(301, tAtMaxCO2));
            pC = solveCO2ForTargetTemp(targetT, Teq, pN, pH, 0, 0, 0, 0, grav, 5.2, avCO2);
            atmoType = 'High-Pressure Condensed CO2-N2 Sky';
            pClass =
              random() < 0.72
                ? 'Liquid CO2 Marine World'
                : 'High-Pressure Liquid CO2 Ocean World';
          } else if (Teq >= 155 && pN >= 0.08 && random() < 0.38) {
            pS = +(rand(0.15, 1.8) * grav * mSc2).toFixed(3);
            const Tso2 = Teq + ghDelta(pC, pN, pH, 0, 0, 0, pS, Teq, grav);
            if (Tso2 >= 198 && Tso2 <= 285) {
              atmoType = 'Cryo-Volcanic N2-SO2-CO2 Sky';
              pClass =
                random() < 0.78
                  ? 'Volcanic SO2 Marine World'
                  : 'Volcanic SO2 Ocean World';
            } else {
              pS = 0;
              atmoType =
                pC + pN + pH < 0.05 ? 'Mars-Class Thin CO2 Sky' : 'Cold Glaciated CO2-N2 Sky';
              pClass = 'Martian World';
            }
          } else {
            atmoType =
              pC + pN + pH < 0.05 ? 'Mars-Class Thin CO2 Sky' : 'Cold Glaciated CO2-N2 Sky';
            pClass = b.iceFrac >= 0.15 ? 'Frozen World' : 'Martian World';
          }
        } else {
          atmoType =
            pC + pN + pH < 0.05 ? 'Mars-Class Thin CO2 Sky' : 'Cold Glaciated CO2-N2 Sky';
          pClass = b.iceFrac >= 0.15 ? 'Frozen World' : 'Martian World';
        }
      } else {
        if (muMin > 28 || Teq < 62) {
          atmoType = 'Frozen Cryogenic Vacuum';
          pClass = 'Frozen World';
        } else {
          pN = clamp(Math.pow(b.massEarth / 0.022, 0.65) * rand(0.8, 2.5), 0.08, 12);
          pM = muMin <= 16.5 ? pN * rand(0.03, 0.12) : 0;
          // If internal/greenhouse H2+CH4+NH3 warms a massive outer icy world to >= 176 K, it transitions to a Cryo-Ammonia world
          if (Teq >= 115 && (rH2 >= 0.8 || pN >= 3.5)) {
            pNH3 = +(pN * rand(0.015, 0.06)).toFixed(4);
          }
          const Touter = Teq + ghDelta(0, pN, pH, pM, 0, pNH3, 0, Teq, grav);
          if (Touter >= 176 && Touter <= 265) {
            pNH3 = Math.max(pNH3, +(pN * 0.025).toFixed(4));
            const isContinentalNH3 = b.iceFrac < 0.04 || random() < 0.5;
            const bioNH3 = z.age >= 1.5 && random() < 0.55;
            if (bioNH3) {
              const bioNH3Complex = z.age >= 3.0 ? 'Multicellular' : 'Unicellular';
              const isShielded = magField.shieldingEfficiencyPct >= 50;
              biosphereDesc = isContinentalNH3
                ? isShielded
                  ? `Active ${bioNH3Complex} Ammoniated (NH3-H2O) Marine & Cryo-Continental Biosphere`
                  : `Active ${bioNH3Complex} Subsurface & Pelagic Ammoniated Biosphere (Radiation-Sterilized Cryo-Continents)`
                : isShielded
                ? `Active ${bioNH3Complex} Pelagic Ammoniated (NH3-H2O) Marine Biosphere`
                : `Active ${bioNH3Complex} Deep Pelagic Ammoniated (NH3-H2O) Biosphere (Cosmic Ray Attenuation)`;
              atmoType = 'H2-N2-NH3 Cryo-Biosphere Sky (Ammonia Life)';
              pClass = isContinentalNH3
                ? 'Cryo-Ammonia Terrestrial'
                : 'Cryo-Ammonia Pelagic World';
            } else {
              atmoType = 'H2-N2-NH3 Collision-Induced Ammonia Greenhouse';
              pClass = isContinentalNH3
                ? 'Cryo-Ammonia Marine World'
                : 'Cryo-Ammonia Ocean World';
            }
          } else {
            pNH3 = 0;
            atmoType = 'Dense Cryogenic N2-CH4 Smog';
            pClass = 'Methane World';
          }
        }
      }

      const rawG: Record<string, number> = {
        CO2: pC,
        N2: pN,
        H2: pH,
        O2: pO,
        H2O: pW,
        CH4: pM,
        NH3: pNH3,
        SO2: pS,
        H2SO4: pH2SO4,
      };
      const gSum = +(pC + pN + pH + pO + pM + pW + pNH3 + pS + pH2SO4).toFixed(3);
      if (gSum > 0) {
        const gks = Object.keys(rawG);
        for (let gk = 0; gk < gks.length; gk++) {
          if (rawG[gks[gk]] / gSum >= 0.0005) {
            gases[gks[gk]] = +(rawG[gks[gk]] / gSum).toFixed(4);
          }
        }
      }

      if (isSupercriticalWater) {
        // Supercritical water worlds have NO liquid-vapor phase boundary (no surface), just like gas giants
        pBar = null;
        ghK = 0;
        Tsurf = Tatm;
        const totW = Math.max(
          80,
          Math.round(rE * 6371 * (1 - Math.pow(1 - Math.max(0.02, b.iceFrac), 0.42)))
        );
        const scK = Math.min(Math.round(totW * 0.32), Math.round(420 / grav));
        const siK = Math.round((totW - scK) * 0.7);
        hydro = {
          state: 'Continuous Supercritical Fluid -> Superionic Ice XVIII (No Surface)',
          solvent: 'Supercritical H2O',
          biosphere: null,
          liqKm: 0,
          scKm: scK,
          iceKm: Math.max(0, totW - scK - siK),
          siKm: siK,
        };
      } else {
        pBar = gSum;
        ghK = +ghDelta(pC, pN, pH, pM, pW, pNH3, pS, Teq, grav).toFixed(1);
        Tsurf = +(Tatm + ghK).toFixed(1);

        // Any rocky/Chthonian planet with Tsurf >= 800 K melts its surface rock into liquid lava/magma and becomes a Molten Planet!
        if (Tsurf >= 800 && b.iceFrac < 0.05) {
          const isGlobalMagma = Tsurf >= 1400 || random() < 0.32;
          const covPct = isGlobalMagma
            ? 100
            : clamp(Math.round(18 + ((Tsurf - 800) / 600) * 64 + rand(-10, 12)), 16, 88);
          atmoType =
            pBar >= 1.0
              ? 'Super-Heated CO2-SO2 Greenhouse over Molten Lava'
              : 'Volcanic SO2-Alkali Vapor Sky over Molten Lava';
          pClass = isChth
            ? isGlobalMagma
              ? 'Molten Chthonian Planet'
              : 'Molten Chthonian Planet'
            : isGlobalMagma
            ? 'Molten Magma Ocean Planet'
            : 'Molten Planet';
          hydro = {
            state: isGlobalMagma
              ? 'Global Surface Liquid Silicate Magma Ocean (100% Coverage)'
              : `Surface Liquid Lava/Magma Seas & Volcanic Continents (${covPct}% Liquid Coverage)`,
            solvent: 'Silicate Magma',
            coveragePct: covPct,
            biosphere: null,
            liqKm: isGlobalMagma
              ? clamp(Math.round(rE * 58), 18, 250)
              : clamp(Math.round(rE * 9.5 * rand(0.4, 1.5)), 2, 18),
            scKm: 0,
            iceKm: 0,
            siKm: 0,
          };
        } else if (pClass.includes('Sulfuric Acid')) {
          const isMarine = pClass.includes('Marine');
          const covPct = isMarine ? randInt(12, 74) : 100;
          const acidDepthKm = isMarine
            ? clamp(Math.round(rE * 1.8 * rand(0.4, 1.4)), 1, 4)
            : clamp(Math.round(rE * 4.2 * rand(0.6, 1.6)), 3, 11);
          hydro = {
            state: isMarine
              ? `Surface Liquid H2SO4 Acid Seas & Sulfate-Basalt Continents (${covPct}% Liquid Coverage)`
              : 'Global Surface Liquid H2SO4 (Concentrated Sulfuric Acid) Ocean (100% Coverage)',
            solvent: 'H2SO4',
            coveragePct: covPct,
            biosphere: null,
            liqKm: acidDepthKm,
            scKm: 0,
            iceKm: 0,
            siKm: 0,
          };
        } else if (pClass.includes('SO2')) {
          const isMarine = pClass.includes('Marine');
          const covPct = isMarine ? randInt(14, 78) : 100;
          const so2DepthKm = isMarine
            ? clamp(Math.round(rE * 2.2 * rand(0.4, 1.5)), 1, 5)
            : clamp(Math.round(rE * 5.0 * rand(0.7, 1.8)), 4, 15);
          hydro = {
            state: isMarine
              ? `Surface Liquid SO2 Volcanic Seas & Basaltic Continents (${covPct}% Liquid Coverage)`
              : 'Global Surface Liquid SO2 (Sulfur Dioxide) Ocean (100% Coverage)',
            solvent: 'SO2',
            coveragePct: covPct,
            biosphere: null,
            liqKm: so2DepthKm,
            scKm: 0,
            iceKm: 0,
            siKm: 0,
          };
        } else if (pClass.includes('CO2')) {
          const isMarine = pClass.includes('Marine');
          const covPct = isMarine ? randInt(18, 82) : 100;
          const co2DepthKm = isMarine
            ? clamp(Math.round(rE * 3.0 * rand(0.4, 1.5)), 1, 7)
            : clamp(Math.round(rE * 7.5 * rand(0.7, 1.9)), 6, 26);
          const dryIceFloorKm = !isMarine && pBar >= 40 ? clamp(Math.round(co2DepthKm * 0.45), 2, 18) : 0;
          hydro = {
            state: isMarine
              ? `High-Pressure Surface Liquid CO2 Seas & Silicate Continents (${covPct}% Liquid Coverage)`
              : dryIceFloorKm > 0
              ? 'Global High-Pressure Liquid CO2 Ocean over Dry-Ice / Clathrate Floor (100% Coverage)'
              : 'Global High-Pressure Surface Liquid CO2 Ocean (100% Coverage)',
            solvent: 'CO2',
            coveragePct: covPct,
            biosphere: null,
            liqKm: co2DepthKm,
            scKm: 0,
            iceKm: dryIceFloorKm,
            siKm: 0,
          };
        } else if (pClass.includes('Cryo-Ammonia')) {
          const isMarine =
            pClass.includes('Terrestrial') || pClass.includes('Marine');
          if (isMarine) {
            const covPct = randInt(18, 84);
            const nh3DepthKm = clamp(Math.round(rE * 3.5 * rand(0.4, 1.6)), 1, 9);
            const iceMantleKm =
              b.iceFrac >= 0.02
                ? clamp(Math.round(rE * 6371 * b.iceFrac * 0.25), 5, 95)
                : 0;
            hydro = {
              state: `Surface Liquid NH3-H2O Seas & Cryo-Continental Landmasses (${covPct}% Liquid Coverage)`,
              solvent: 'NH3-H2O',
              coveragePct: covPct,
              biosphere: biosphereDesc,
              liqKm: nh3DepthKm,
              scKm: 0,
              iceKm: iceMantleKm,
              siKm: 0,
            };
          } else {
            const totW = Math.max(
              25,
              Math.round(rE * 6371 * (1 - Math.pow(1 - Math.max(0.03, b.iceFrac), 0.42)))
            );
            const fGPa = clamp(0.85 + 0.004 * (Tsurf - 176), 0.8, 1.6);
            const lKm = Math.min(totW, Math.max(8, Math.round((fGPa * 100) / grav)));
            const rem = Math.max(0, totW - lKm);
            const siK2 = b.massEarth >= 2.5 ? Math.round(rem * 0.35) : 0;
            const isPureNH3Window = Tsurf >= 195.4 && Tsurf <= 239.8;
            hydro = {
              state: isPureNH3Window
                ? 'Global Surface Liquid NH3 (Ammonia) & Eutectic Ocean over Ice VI/VII (100% Coverage)'
                : 'Global Surface Liquid NH3-H2O (Ammonia-Water Eutectic) Ocean over Ice VI (100% Coverage)',
              solvent: 'NH3-H2O',
              coveragePct: 100,
              biosphere: biosphereDesc,
              liqKm: lKm,
              scKm: 0,
              iceKm: Math.max(0, rem - siK2),
              siKm: siK2,
            };
          }
        } else if (b.iceFrac >= 0.015 && Tsurf >= 265) {
          const totW = Math.round(rE * 6371 * (1 - Math.pow(1 - b.iceFrac, 0.42)));
          if (Tsurf >= 647.1) {
            // Reached supercritical regime via greenhouse
            pBar = null;
            ghK = 0;
            Tsurf = Tatm;
            atmoType = 'Continuous Supercritical Steam-Fluid Envelope (No Surface)';
            pClass = 'Supercritical Water World';
            const scK = Math.min(Math.round(totW * 0.3), Math.round(420 / grav));
            const siK = Math.round((totW - scK) * 0.7);
            hydro = {
              state: 'Continuous Supercritical Fluid -> Superionic Ice XVIII (No Surface)',
              solvent: 'Supercritical H2O',
              biosphere: null,
              liqKm: 0,
              scKm: scK,
              iceKm: Math.max(0, totW - scK - siK),
              siKm: siK,
            };
          } else {
            const fGPa = clamp(1.1 + 0.006 * (Tsurf - 273), 1.0, 2.2);
            const lKm = Math.min(totW, Math.round((fGPa * 100) / grav));
            const rem = Math.max(0, totW - lKm);
            const siK2 = b.massEarth >= 2 ? Math.round(rem * 0.42) : 0;
            const hasLiquidCO2Sublayer = pC >= 18 && Tsurf <= 304.1;
            hydro = {
              state: hasLiquidCO2Sublayer
                ? `Stratified Liquid H2O + High-Pressure Liquid CO2 Ocean over Clathrate/Ice VI (100% Coverage)`
                : `Global Surface Liquid H2O Ocean (${Math.round(fGPa * 10000)} bar floor) over Ice VI/VII (100% Coverage)`,
              solvent: hasLiquidCO2Sublayer ? 'H2O + CO2' : 'H2O',
              coveragePct: 100,
              biosphere: biosphereDesc,
              liqKm: lKm,
              scKm: 0,
              iceKm: rem - siK2,
              siKm: siK2,
            };
          }
        } else if (
          pClass.includes('Temperate Terrestrial') ||
          pClass.includes('Temperate Super-Earth') ||
          (b.iceFrac < 0.015 && pBar > 0.05 && Tsurf >= 268 && Tsurf < 647.1 && pW > 0)
        ) {
          // Earth-like / Super-Earth marine oceans with emergent continental crust
          const covPct = randInt(24, 86);
          const marineDepthKm = clamp(
            Math.round(rE * 6371 * Math.max(0.00055, b.iceFrac * 0.45)),
            2,
            14
          );
          hydro = {
            state: `Surface Liquid H2O Marine Oceans & Continental Landmasses (${covPct}% Liquid Coverage)`,
            solvent: 'H2O',
            coveragePct: covPct,
            biosphere: biosphereDesc,
            liqKm: marineDepthKm,
            scKm: 0,
            iceKm: 0,
            siKm: 0,
          };
        } else if (pClass.includes('Titan-Class') || pClass.includes('Methane World')) {
          // Surface liquid methane/ethane lakes & seas + solid cryo-bedrock continents + subsurface water-ammonia ocean
          const covPct = randInt(8, 62);
          const totIceKm = Math.max(25, Math.round(rE * 6371 * 0.3 * Math.max(0.15, b.iceFrac)));
          const crustKm = clamp(Math.round(totIceKm * 0.22), 8, 55);
          const oceanKm = clamp(Math.round(totIceKm * 0.42), 12, 180);
          hydro = {
            state: `Surface CH4/C2H6 Hydrocarbon Seas & Cryo-Bedrock Continents (${covPct}% Coverage) + Subsurface H2O-NH3 Ocean`,
            solvent: 'CH4-C2H6',
            coveragePct: covPct,
            biosphere: null,
            crustKm,
            liqKm: oceanKm,
            scKm: 0,
            iceKm: Math.max(0, totIceKm - oceanKm),
            siKm: 0,
          };
        }
      }
    }

    const effT = Tsurf ?? Tatm ?? Teq;
    const hasEnv = b.gasFrac >= 0.015 || b.massEarth >= 12;
    pClass = resolvePlanetClass(
      pClass,
      effT,
      hydro,
      b.massEarth,
      b.iceFrac,
      isChth,
      hasEnv,
      pBar,
      gases
    );
    const isSupercritical =
      hydro?.solvent === 'Supercritical H2O' ||
      Boolean(hydro?.state?.includes('Supercritical')) ||
      pClass.includes('Supercritical') ||
      pClass.includes('Steam') ||
      pClass.includes('Water Giant');
    atmoType = deriveAtmosphereClassification(pBar, gases, hasEnv, isSupercritical);

    // Moons (1-2% Sub-Disk Split)
    const rH_Rp =
      (b.a *
        (1 - b.e) *
        Math.pow(b.massEarth / (3 * M_SUN_EARTH * z.mass), 0.333) *
        AU_R_EARTH) /
      Math.max(0.05, rE);
    const maxPro = 0.42 * rH_Rp;
    const maxRet = 0.65 * rH_Rp;
    const isCold = Teq < 175;
    const roche = 2.44 * Math.pow(dens / (isCold ? 1.85 : 3.1), 0.333);
    let rings: string | null = null;
    const moons: RealisticMoon[] = [];

    if (maxPro > roche * 1.15) {
      if (hasEnv && b.massEarth >= 10) {
        const ur = random();
        rings =
          isCold && ur < 0.25
            ? 'Major Icy Rings (Saturn-Class)'
            : ur < 0.32
            ? 'Dense Silicate Rings'
            : ur < 0.85
            ? 'Faint Dusty Rings'
            : null;
      } else if (!hasEnv && b.massEarth >= 0.4 && random() < 0.06) {
        rings = 'Roche-Shredded Debris Ring';
      }
    }

    const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
    let moonIdxCounter = 0;

    function mkMoon(
      mE: number,
      aRp: number,
      em: number,
      inc: number,
      orig: string
    ): RealisticMoon {
      moonIdxCounter++;
      const numeral = romanNumerals[moonIdxCounter - 1] || `M${moonIdxCounter}`;
      const originLabel =
        orig === 'Captured'
          ? 'Gravitationally Captured Planetesimal'
          : orig === 'Impact'
          ? 'Giant Impact Debris Disk'
          : orig === 'Titan'
          ? 'Late-Stage Sub-Disk Merger (Titan-Mode)'
          : 'Circumplanetary Accretion Sub-Disk';

      // 3-component composition (Rock / Ice) based on snow line, origin & tidal bakeout
      let iceF = isCold
        ? orig === 'Impact'
          ? clamp(b.iceFrac * rand(0.6, 1.1), 0.05, 0.55)
          : clamp(rand(0.32, 0.58), 0.15, 0.65)
        : clamp(b.iceFrac * rand(0.2, 0.6), 0, 0.18);

      const rmE_prelim = Math.max(0.0005, (1.0 + 0.19 * iceF) * Math.pow(mE, 0.275));
      const pD =
        365.25 *
        Math.sqrt(
          Math.pow((aRp * rE) / AU_R_EARTH, 3) / ((b.massEarth + mE) / M_SUN_EARTH)
        );
      const tW =
        em > 0.0005 && mE >= 1e-5
          ? 2.5 *
            Math.pow(b.massEarth / 317.83, 2.5) *
            Math.pow(rmE_prelim / 0.286, 3) *
            Math.pow(em / 0.0041, 2) *
            Math.pow(Math.max(0.15, (aRp * rE) / 66), -7.5)
          : 0;

      // Intense Io-like tidal heating bakes out volatile ices
      if (tW >= 1.0) {
        iceF = Math.min(iceF, 0.01);
      } else if (tW >= 0.2) {
        iceF *= 0.45;
      }
      const rockF = +(1.0 - iceF).toFixed(4);
      iceF = +iceF.toFixed(4);

      const rmE = Math.max(0.0005, (0.98 * rockF + 1.19 * iceF) * Math.pow(mE, 0.275));
      const rKm = Math.max(8, Math.round(rmE * 6371));
      const mDens = +((5.514 * mE) / Math.pow(rmE, 3)).toFixed(2);
      const mGrav = +(mE / (rmE * rmE)).toFixed(3);
      const aKm = Math.round(aRp * rE * 6371);

      let mc =
        orig === 'Captured'
          ? mE >= 0.0008
            ? 'Captured Retrograde Dwarf (Triton-Class)'
            : 'Captured Irregular Asteroid'
          : tW >= 1.2 && mE >= 0.002
          ? 'Volcanic Tidal-Magma Moon (Io-Class)'
          : mE >= 0.06 && Teq >= 195 && Teq <= 330
          ? 'Temperate Habitable Exomoon'
          : mE >= 0.012 && Teq >= 135 && Teq < 215
          ? 'Cryo-Ammonia Marine Moon'
          : mE >= 0.012 && Teq >= 65 && Teq <= 170
          ? 'Methane Moon'
          : isCold && tW >= 0.03 && mE >= 0.001
          ? 'Subsurface-Ocean Moon (Europa-Class)'
          : mE >= 0.001
          ? isCold
            ? 'Major Icy Moon (Ganymede-Class)'
            : 'Major Rocky Moon (Luna-Class)'
          : 'Regular Moonlet';

      const mAlb =
        mc.includes('Europa') || mc.includes('Icy') || mc.includes('Triton')
          ? +rand(0.45, 0.68).toFixed(2)
          : mc.includes('Io')
          ? +rand(0.52, 0.63).toFixed(2)
          : mc.includes('Titan') || mc.includes('Methane') || mc.includes('Ammonia') || mc.includes('Habitable')
          ? +rand(0.22, 0.34).toFixed(2)
          : +rand(0.11, 0.24).toFixed(2);

      const mTeq = +(T0 * Math.pow(1 - mAlb, 0.25)).toFixed(1);
      // Tidal surface heat flux in W/m^2: (tW * 1e12 W) / (4 * pi * R_m^2)
      const areaM2 = 4 * Math.PI * Math.pow(rKm * 1000, 2);
      const tidalFluxWm2 = +((tW * 1e12) / Math.max(1e6, areaM2)).toFixed(3);
      // Effective radiative+tidal temperature: (T_eq^4 + F_tidal / sigma)^0.25
      const mTatm = +Math.pow(
        Math.pow(mTeq, 4) + tidalFluxWm2 / 5.670374e-8,
        0.25
      ).toFixed(1);

      const mMuMin = +(
        (0.028 * mTeq * (1 + 1.6 * Math.pow(Math.max(0.01, xuv), 0.25))) /
        Math.max(1e-5, mE / rmE)
      ).toFixed(1);

      let mAtmoType = 'Airless Barren Vacuum';
      let mPBar: number | null = 0;
      let mGhK = 0;
      let mTsurf = mTatm;
      const mGases: Record<string, number> = {};
      let mHydro: RealisticHydrosphere | null = null;
      let mBioDesc: string | null = null;

      if (mc.includes('Io')) {
        // If massive enough to retain SO2 (muMin <= 64) and in the liquid SO2 temperature range (198-415 K), condenses liquid SO2 seas!
        if (mMuMin <= 64 && mE >= 0.006 && mTatm >= 175 && mTatm <= 355) {
          const pS_m = +clamp(Math.pow(mE / 0.015, 0.75) * rand(0.25, 2.2), 0.15, 4.5).toFixed(3);
          const pC_m = +(pS_m * rand(0.08, 0.3)).toFixed(3);
          const ghTest = +ghDelta(pC_m, 0, 0, 0, 0, 0, pS_m, mTatm, mGrav).toFixed(1);
          const tTest = +(mTatm + ghTest).toFixed(1);
          const tBoilSO2 = Math.min(428, 263.15 / Math.max(0.5, 1 - Math.log(Math.max(0.05, pS_m + pC_m)) / 10.5));
          if (tTest >= 198 && tTest <= tBoilSO2) {
            mPBar = +(pS_m + pC_m).toFixed(3);
            mGhK = ghTest;
            mTsurf = tTest;
            mAtmoType = 'Dense Tidal-Volcanic SO2-CO2 Sky';
            mc = 'Volcanic SO2-Sea Moon';
            mGases.SO2 = +(pS_m / mPBar).toFixed(3);
            mGases.CO2 = +(pC_m / mPBar).toFixed(3);
          } else {
            mAtmoType = 'Volcanic SO2 Plume Exosphere';
            mPBar = +rand(0.0001, 0.003).toFixed(4);
            mGhK = 1.5;
            mTsurf = +(mTatm + mGhK).toFixed(1);
            mGases.SO2 = 0.88;
            mGases.SO = 0.07;
            mGases.Na_K = 0.05;
          }
        } else {
          mAtmoType = 'Volcanic SO2 Plume Exosphere';
          mPBar = +rand(0.0001, 0.003).toFixed(4);
          mGhK = 1.5;
          mTsurf = +(mTatm + mGhK).toFixed(1);
          mGases.SO2 = 0.88;
          mGases.SO = 0.07;
          mGases.Na_K = 0.05;
        }
      } else if (
        mc.includes('Ammonia') ||
        (mE >= 0.01 && iceF >= 0.04 && mTatm >= 135 && mTatm <= 235 && mMuMin <= 28)
      ) {
        const pN = +clamp(Math.pow(mE / 0.02, 0.65) * rand(0.6, 2.2), 0.18, 4.5).toFixed(3);
        const pNH3_m = +clamp(pN * rand(0.02, 0.08), 0.006, 0.35).toFixed(3);
        const pM = +clamp(pN * rand(0.012, 0.045), 0.003, 0.2).toFixed(3);
        const ghTest = +ghDelta(0, pN, 0, pM, 0, pNH3_m, 0, mTatm, mGrav).toFixed(1);
        const tTest = +(mTatm + ghTest).toFixed(1);
        if (tTest >= 176 && tTest <= 265) {
          mPBar = +(pN + pNH3_m + pM).toFixed(3);
          mGhK = ghTest;
          mTsurf = tTest;
          const mBioNH3 = z.age >= 1.5 && random() < 0.52;
          if (mBioNH3) {
            mBioDesc =
              z.age >= 3.0
                ? 'Active Multicellular Exomoon Ammoniated (NH3-H2O) Cryo-Biosphere'
                : 'Active Unicellular Exomoon Ammoniated Cryo-Microbial Biosphere';
            mAtmoType = 'N2-NH3-CH4 Exomoon Cryo-Biosphere Sky (Ammonia Life)';
            mc = 'Cryo-Ammonia Habitable Exomoon';
          } else {
            mAtmoType = 'Sub-Zero N2-NH3-CH4 Ammonia Sky';
            mc = 'Cryo-Ammonia Marine Moon';
          }
          mGases.N2 = +(pN / mPBar).toFixed(3);
          mGases.NH3 = +(pNH3_m / mPBar).toFixed(3);
          mGases.CH4 = +(pM / mPBar).toFixed(3);
        } else {
          mPBar = +(pN + pM).toFixed(3);
          mGhK = +ghDelta(0, pN, 0, pM, 0, 0, 0, mTatm, mGrav).toFixed(1);
          mTsurf = +(mTatm + mGhK).toFixed(1);
          mAtmoType = 'Dense Cryogenic N2-CH4 Smog';
          mc = 'Methane Moon';
          mGases.N2 = +(pN / mPBar).toFixed(3);
          mGases.CH4 = +(pM / mPBar).toFixed(3);
        }
      } else if (mc.includes('Titan') || mc.includes('Methane') || (mE >= 0.01 && mTeq >= 65 && mTeq <= 175 && mMuMin <= 28)) {
        const pN = +clamp(Math.pow(mE / 0.022, 0.65) * rand(0.9, 2.4), 0.12, 6.5).toFixed(3);
        const pM = +(pN * rand(0.03, 0.08)).toFixed(3);
        mPBar = +(pN + pM).toFixed(3);
        mGhK = +ghDelta(0, pN, 0, pM, 0, 0, 0, mTatm, mGrav).toFixed(1);
        mTsurf = +(mTatm + mGhK).toFixed(1);
        mAtmoType = 'Dense Cryogenic N2-CH4 Smog';
        mc = 'Methane Moon';
        mGases.N2 = +(pN / mPBar).toFixed(3);
        mGases.CH4 = +(pM / mPBar).toFixed(3);
      } else if (mc.includes('Habitable') || (mE >= 0.06 && mTeq >= 195 && mTeq <= 325 && mMuMin <= 28)) {
        // Check if dry/high-CO2 exomoon (where 5.2+ bar CO2 keeps Tsurf in [218, 302 K]) vs habitable H2O exomoon
        const pN_m = +clamp(rand(0.4, 2.0), 0.2, 3.0).toFixed(2);
        const tAtMinCO2 = mTatm + ghDelta(5.2, pN_m, 0, 0, 0, 0, 0, mTatm, mGrav);
        const tAtMaxCO2 = mTatm + ghDelta(22.0, pN_m, 0, 0, 0, 0, 0, mTatm, mGrav);
        if (iceF < 0.01 && mE >= 0.08 && tAtMinCO2 <= 300.0 && tAtMaxCO2 >= 220.0 && random() < 0.35) {
          const targetT = rand(Math.max(222, tAtMinCO2), Math.min(300, tAtMaxCO2));
          const pC_m = solveCO2ForTargetTemp(targetT, mTatm, pN_m, 0, 0, 0, 0, 0, mGrav, 5.2, 22.0);
          mPBar = +(pC_m + pN_m).toFixed(2);
          mGhK = +ghDelta(pC_m, pN_m, 0, 0, 0, 0, 0, mTatm, mGrav).toFixed(1);
          mTsurf = +(mTatm + mGhK).toFixed(1);
          mAtmoType = 'High-Pressure Condensed CO2-N2 Exomoon Sky';
          mc = 'High-Pressure CO2-Sea Moon';
          mGases.CO2 = +(pC_m / mPBar).toFixed(3);
          mGases.N2 = +(pN_m / mPBar).toFixed(3);
        } else {
          const pN = +clamp(Math.pow(mE, 0.7) * rand(0.6, 1.8), 0.2, 3.5).toFixed(3);
          const pW = +rand(0.01, 0.028).toFixed(3);
          const targetT = rand(280, 305);
          const pC = solveCO2ForTargetTemp(targetT, mTatm, pN, 0, 0, pW, 0, 0, mGrav, 0.0005, 2.5);
          const pO = z.age >= 1.5 && pC < 1.2 && random() < 0.65 ? +(pN * rand(0.15, 0.28)).toFixed(3) : 0;
          if (pO > 0) {
            mBioDesc =
              z.age >= 3.0
                ? 'Active Multicellular Exomoon Aerobic O2-N2 Biosphere'
                : 'Active Unicellular Exomoon Microbial Biosphere';
          }
          mPBar = +(pN + pC + pO + pW).toFixed(3);
          mGhK = +ghDelta(pC, pN, 0, 0, pW, 0, 0, mTatm, mGrav).toFixed(1);
          mTsurf = +(mTatm + mGhK).toFixed(1);
          mAtmoType = pO > 0 ? 'Breathable N2-O2 Exomoon Sky' : 'Prebiotic N2-CO2 Exomoon Sky';
          mGases.N2 = +(pN / mPBar).toFixed(3);
          if (pO > 0) mGases.O2 = +(pO / mPBar).toFixed(3);
          mGases.CO2 = +(pC / mPBar).toFixed(3);
          mGases.H2O = +(pW / mPBar).toFixed(3);
        }
      } else if (mE >= 0.03 && mTeq > 325 && mTeq <= 470 && mMuMin <= 44) {
        // Hot inner exomoon with Sulfuric Acid (H2SO4) surface seas
        const pC_m = +clamp(rand(1.2, 6.5), 1.0, 9.0).toFixed(2);
        const pS_m = +clamp(rand(0.12, 0.85), 0.08, 1.4).toFixed(2);
        const pAcid_m = +clamp(rand(0.01, 0.05), 0.005, 0.08).toFixed(3);
        mPBar = +(pC_m + pS_m + pAcid_m).toFixed(3);
        mGhK = +ghDelta(pC_m, 0, 0, 0, 0, 0, pS_m, mTatm, mGrav).toFixed(1);
        mTsurf = +(mTatm + mGhK).toFixed(1);
        const tBoilH2SO4 = 610 + 18 * Math.log(1 + mPBar);
        if (mTsurf >= 275 && mTsurf <= tBoilH2SO4) {
          mAtmoType = 'Dense CO2-SO2-H2SO4 Acidic Exomoon Sky';
          mc = 'Sulfuric Acid Sea Moon';
        } else {
          mAtmoType = 'Venusian Desiccated CO2-SO2 Exomoon Sky';
          mc = 'Major Rocky Moon (Luna-Class)';
        }
        mGases.CO2 = +(pC_m / mPBar).toFixed(3);
        mGases.SO2 = +(pS_m / mPBar).toFixed(3);
        mGases.H2SO4 = +(pAcid_m / mPBar).toFixed(3);
      } else if (mE >= 0.0008 && iceF >= 0.25) {
        mAtmoType =
          mc.includes('Triton')
            ? 'Tenuous N2-CH4 Sublimation Sky'
            : 'Radiolytic O2-H2O Sputtered Exosphere';
        mPBar = mc.includes('Triton') ? 0.0001 : 0;
        if (mc.includes('Triton')) {
          mGases.N2 = 0.99;
          mGases.CH4 = 0.01;
        } else {
          mGases.O2 = 0.85;
          mGases.H2O = 0.15;
        }
      }

      // Hydrosphere: All moons with surface liquid (H2O, NH3-H2O, CH4-C2H6, CO2, SO2, H2SO4, Silicate Magma) OR subsurface oceans
      if (mc.includes('SO2')) {
        const covPct = randInt(14, 72);
        mHydro = {
          state: `Surface Liquid SO2 Volcanic Seas & Basalt Continents (${covPct}% Coverage)`,
          solvent: 'SO2',
          coveragePct: covPct,
          biosphere: null,
          liqKm: clamp(Math.round(rKm * 0.0012), 1, 5),
          scKm: 0,
          iceKm: 0,
          siKm: 0,
        };
      } else if (mc.includes('Sulfuric Acid')) {
        const covPct = randInt(10, 68);
        mHydro = {
          state: `Surface Liquid H2SO4 Acid Seas & Sulfate Continents (${covPct}% Coverage)`,
          solvent: 'H2SO4',
          coveragePct: covPct,
          biosphere: null,
          liqKm: clamp(Math.round(rKm * 0.001), 1, 4),
          scKm: 0,
          iceKm: 0,
          siKm: 0,
        };
      } else if (mc.includes('CO2')) {
        const covPct = randInt(16, 76);
        mHydro = {
          state: `High-Pressure Surface Liquid CO2 Seas & Continents (${covPct}% Coverage)`,
          solvent: 'CO2',
          coveragePct: covPct,
          biosphere: null,
          liqKm: clamp(Math.round(rKm * 0.0018), 1, 7),
          scKm: 0,
          iceKm: 0,
          siKm: 0,
        };
      } else if (mc.includes('Cryo-Ammonia')) {
        const isMarineNH3 = iceF < 0.25 || random() < 0.68;
        const covPct = isMarineNH3 ? randInt(18, 82) : 100;
        const totW = Math.max(12, Math.round(rKm * 0.28 * Math.max(0.08, iceF)));
        const lKm = isMarineNH3 ? clamp(Math.round(rKm * 0.0018), 1, 8) : clamp(Math.round(totW * 0.45), 6, 65);
        mHydro = {
          state: isMarineNH3
            ? `Surface Liquid NH3-H2O Seas & Cryo-Continents (${covPct}% Coverage)`
            : 'Global Surface Liquid NH3-H2O Ocean over Ice VI (100% Coverage)',
          solvent: 'NH3-H2O',
          coveragePct: covPct,
          biosphere: mBioDesc,
          liqKm: lKm,
          scKm: 0,
          iceKm: Math.max(0, totW - lKm),
          siKm: 0,
        };
      } else if (mc.includes('Habitable') || (mPBar !== null && mPBar >= 0.05 && mTsurf >= 268 && mTsurf < 647)) {
        const isMarineH2O = iceF < 0.08 || random() < 0.65;
        if (!isMarineH2O) {
          const totW = Math.max(6, Math.round(rKm * (1 - Math.pow(1 - iceF, 0.42))));
          const lKm = Math.min(totW, Math.round(110 / Math.max(0.05, mGrav)));
          mHydro = {
            state: 'Global Surface Liquid H2O Exomoon Ocean (100% Coverage)',
            solvent: 'H2O',
            coveragePct: 100,
            biosphere: mBioDesc,
            liqKm: lKm,
            scKm: 0,
            iceKm: Math.max(0, totW - lKm),
            siKm: 0,
          };
        } else {
          const covPct = randInt(22, 84);
          const marineKm = clamp(Math.round(rKm * Math.max(0.0006, iceF * 0.45)), 1, 9);
          mHydro = {
            state: `Surface Liquid H2O Marine Seas & Continental Crust (${covPct}% Coverage)`,
            solvent: 'H2O',
            coveragePct: covPct,
            biosphere: mBioDesc,
            liqKm: marineKm,
            scKm: 0,
            iceKm: 0,
            siKm: 0,
          };
        }
      } else if (mc.includes('Titan') || mc.includes('Methane') || mAtmoType.includes('Titan-Class')) {
        const covPct = randInt(6, 54);
        const totW = Math.max(20, Math.round(rKm * 0.32 * Math.max(0.15, iceF)));
        const shellKm = clamp(Math.round(totW * 0.25), 6, 45);
        const oceanKm = Math.max(10, Math.round((totW - shellKm) * 0.6));
        const highPIceKm = Math.max(0, totW - shellKm - oceanKm);
        mHydro = {
          state: `Surface CH4/C2H6 Hydrocarbon Seas & Cryo-Bedrock (${covPct}% Coverage) + Subsurface H2O-NH3 Ocean`,
          solvent: 'CH4-C2H6',
          coveragePct: covPct,
          biosphere: null,
          crustKm: shellKm,
          liqKm: oceanKm,
          scKm: 0,
          iceKm: shellKm + highPIceKm,
          siKm: 0,
        };
      } else if (mTsurf >= 800 || mc.includes('Io')) {
        const isGlobalMagma = mTsurf >= 1400;
        const covPct = isGlobalMagma ? 100 : randInt(16, 64);
        if (!mc.includes('Io') && !mc.includes('Molten')) {
          mc = isGlobalMagma
            ? 'Molten Moon (Global Magma Ocean)'
            : 'Molten Moon (Lava Seas & Crust)';
        }
        mHydro = {
          state: isGlobalMagma
            ? 'Global Surface Liquid Silicate Magma Ocean (100% Coverage)'
            : `Surface Silicate Lava Seas & Volcanic Crust (${covPct}% Coverage)`,
          solvent: 'Silicate Magma',
          coveragePct: covPct,
          biosphere: null,
          liqKm: clamp(Math.round(rKm * 0.015), 4, 45),
          scKm: 0,
          iceKm: 0,
          siKm: 0,
        };
      } else if (iceF >= 0.2 && (tW >= 0.015 || mE >= 0.008)) {
        const totW = Math.max(15, Math.round(rKm * 0.32 * iceF));
        const shellKm = clamp(
          Math.round(28 / Math.pow(Math.max(0.02, tW * 10 + mE * 25), 0.35)),
          4,
          Math.round(totW * 0.45)
        );
        const oceanKm = Math.max(8, Math.round((totW - shellKm) * 0.65));
        const highPIceKm = Math.max(0, totW - shellKm - oceanKm);
        mHydro = {
          state: `Subsurface Liquid H2O-NH3 Ocean beneath ${shellKm} km Ice I Shell`,
          solvent: 'Subsurface H2O-NH3',
          coveragePct: 0,
          biosphere: null,
          crustKm: shellKm,
          liqKm: oceanKm,
          scKm: 0,
          iceKm: shellKm + highPIceKm,
          siKm: 0,
        };
      }

      const isRetro = inc > 90;
      const rotHrs = +(orig === 'Captured' && aRp > 30 ? rand(9, 48) : pD * 24).toFixed(1);
      const mSpinState =
        orig === 'Captured' && aRp > 30
          ? isRetro
            ? 'Captured Retrograde Free Spin'
            : 'Captured Prograde Free Spin'
          : isRetro
          ? '1:1 Tidally Locked (Retrograde Orbit)'
          : '1:1 Tidally Locked to Host Planet';

      const effMoonT = mTsurf ?? mTatm ?? mTeq;
      mc = resolveMoonClass(mc, effMoonT, mHydro, iceF, mE, mPBar, mGases);
      mAtmoType = deriveAtmosphereClassification(mPBar, mGases, false);

      const moonMagField = computePlanetaryMagneticField({
        massEarth: mE,
        radiusEarth: rmE,
        densityGcm3: mDens,
        rockFrac: rockF,
        iceFrac: iceF,
        gasFrac: 0,
        aAU: b.a,
        starLum: z.lum,
        starMass: z.mass,
        sysAgeGyr: z.age,
        rotHours: rotHrs,
        isMoon: true,
        tidalW: tW,
        hostPlanetMassEarth: b.massEarth,
        random,
        rand,
      });

      return {
        id: `m_${fI + 1}_${moonIdxCounter}`,
        name: `Moon ${numeral}`,
        moonClass: mc,
        origin: originLabel,
        a_Rp: +aRp.toFixed(1),
        a_km: aKm,
        e: +em.toFixed(4),
        incDeg: +inc.toFixed(1),
        periodDays: +pD.toFixed(2),
        massEarth: +mE.toPrecision(4),
        massLunar: +(mE / 0.0123).toFixed(3),
        radiusEarth: +rmE.toFixed(4),
        radiusKm: rKm,
        densityGcm3: mDens,
        gravityG: mGrav,
        rockFrac: rockF,
        iceFrac: iceF,
        gasFrac: 0,
        albedo: mAlb,
        T_eq: mTeq,
        T_atm: mTatm,
        surfaceTempK: mTsurf,
        greenhouseK: mGhK,
        tidalW: +tW.toFixed(2),
        tidalFluxWm2,
        muMin: mMuMin,
        pressureBar: mPBar,
        atmosphereType: mAtmoType,
        gases: mGases,
        hydrosphere: mHydro,
        retrograde: isRetro,
        rotationHours: rotHrs,
        spinState: mSpinState,
        axialTiltDeg: +(orig === 'Captured' ? rand(12, 65) : rand(0.1, 2.5)).toFixed(1),
        magneticField: moonMagField,
      };
    }

    if (maxPro >= roche * 2.2) {
      if (hasEnv && b.massEarth >= 6 && maxPro >= Math.max(10, roche * 2.5)) {
        const totM =
          b.massEarth *
          rand(0.01, 0.02) *
          clamp(0.015 * Math.pow(10, 0.5 * z.feh), 0.005, 0.035);
        if (isCold && maxRet >= 28 && random() < 0.12) {
          moons.push(
            mkMoon(
              clamp(totM * rand(1.2, 3.5), 0.0015, 0.03),
              clamp(rand(12, 22), roche * 3, maxPro * 0.65),
              rand(0.001, 0.015),
              155,
              'Captured'
            )
          );
        } else if (random() < 0.72) {
          const nM = randInt(3, 5);
          const mw: number[] = [];
          let ms = 0;
          for (let mi = 0; mi < nM; mi++) {
            const wi = rand(0.45, 1.55);
            mw.push(wi);
            ms += wi;
          }
          let am = Math.max(roche * rand(1.7, 2.4), rand(5.2, 7.8));
          for (let mj = 0; mj < nM && am <= Math.min(68, maxPro * 0.82); mj++) {
            moons.push(
              mkMoon(
                totM * (mw[mj] / ms),
                am,
                mj < nM - 1 ? rand(0.003, 0.016) : 0.002,
                0.5,
                'Disk'
              )
            );
            am *= rand(1.52, 1.85);
          }
        } else {
          const at = clamp(rand(15, 25), roche * 3.2, maxPro * 0.75);
          moons.push(mkMoon(totM * 0.12, at * 0.55, 0.006, 0.4, 'Disk'));
          moons.push(mkMoon(totM * 0.82, at, 0.018, 0.6, 'Titan'));
        }
      } else if (!hasEnv && b.massEarth >= 0.03 && maxPro >= 14 && random() < 0.28) {
        const qi = isCold && b.massEarth < 0.25 ? rand(0.04, 0.12) : rand(0.005, 0.038);
        moons.push(
          mkMoon(
            b.massEarth * qi,
            clamp(rand(18, 48), roche * 3.5, maxPro * 0.75),
            rand(0.01, 0.05),
            3.0,
            'Impact'
          )
        );
      }
      if (maxRet >= 40 && random() < (hasEnv ? 0.8 : 0.25)) {
        moons.push(
          mkMoon(
            hasEnv ? Math.pow(10, rand(-6.5, -4.6)) : Math.pow(10, rand(-8, -6.5)),
            clamp(0.28 * rH_Rp, 35, maxRet * 0.88),
            rand(0.2, 0.45),
            145,
            'Captured'
          )
        );
      }
    }

    const { incDeg, omegaNodeDeg, argPeriDeg } = computeOrbitalInclination(
      'planet',
      b.role,
      b.a,
      b.e,
      b.massEarth,
      systemInvariantNodeDeg,
      random,
      rand
    );

    finalBodies.push({
      kind: 'planet',
      role: b.role,
      a: b.a,
      a_birth: b.a_birth,
      e: b.e,
      incDeg,
      omegaNodeDeg,
      argPeriDeg,
      migrationHistory: b.migrationHistory,
      massEarth: +b.massEarth.toFixed(3),
      massJup: +(b.massEarth / M_JUP_EARTH).toFixed(4),
      radiusEarth: +rE.toFixed(3),
      densityGcm3: +dens.toFixed(2),
      gravityG: +grav.toFixed(2),
      rockFrac: b.rockFrac,
      iceFrac: b.iceFrac,
      gasFrac: +b.gasFrac.toFixed(4),
      T_eq: Teq,
      T_atm: Tatm,
      surfaceTempK: Tsurf,
      greenhouseK: ghK,
      muMin,
      albedo: +alb.toFixed(2),
      pressureBar: pBar,
      sudarskyClass: sud,
      planetClass: pClass,
      atmosphereType: atmoType,
      gases,
      hydrosphere: hydro,
      rings,
      rocheLimitRp: +roche.toFixed(2),
      moons,
      orbitalPeriodDays: +pDays.toFixed(2),
      rotationHours: rotH,
      spinState: spinSt,
      axialTiltDeg: tilt,
      magneticField: magField,
    });
  }

  return {
    title: z.title,
    mass: z.mass,
    lum: z.lum,
    a_in: z.a_in,
    a_out: z.a_out,
    a_snow: +a_snow.toFixed(3),
    archetype: arch,
    probs,
    diskMassEarth: Math.round(diskEarth),
    bodies: finalBodies,
  };
}

/**
 * Generates a special Supermassive Black Hole system (for sysMass > 999,999 M☉)
 * Ignored regular algorithm: creates Supermassive Black Hole primary with three random
 * companion stars (S-stars) and a whole bunch of asteroid belts and zero planets.
 */
function generateSupermassiveBlackHoleSystem(
  params: StarGenParams,
  rng?: PRNG,
  seedUsed?: number
): RealisticStarSystemResult {
  if (!rng) {
    const seed = seedFromId(params.id ?? params.seed ?? 2525);
    rng = new PRNG(seed);
    seedUsed = seed;
  }

  // 1. Primary: Supermassive Black Hole (SMBH)
  const starA: RealisticStarNode = {
    label: 'A',
    category: 'Supermassive Black Hole',
    mass: params.sysMass,
    lum: '1.25e+06',
    lumNum: 1250000,
    radius: 4.244, // Schwarzschild radius in R_sun (2.95e6 km)
    Teff: 85000, // Relativistic inner accretion disk temperature
    logg: 9.80,
    tau: 0.001,
    spectralType: 'SMBH (Supermassive Black Hole)',
    colorHex: '#c084fc',
  };

  // 2. Three random companion stars in wide orbits (Galactic Center S-Cluster)
  const massB = +(10.0 + rng.next() * 25.0).toFixed(2);
  const massC = +(3.5 + rng.next() * 12.0).toFixed(2);
  const massD = +(1.2 + rng.next() * 6.0).toFixed(2);

  const ageB = +(0.01 + rng.next() * 0.04).toFixed(3);
  const ageC = +(0.03 + rng.next() * 0.12).toFixed(3);
  const ageD = +(0.08 + rng.next() * 0.35).toFixed(3);

  const starB = getStarStats(massB, ageB, params.feh, 'B');
  const starC = getStarStats(massC, ageC, params.feh, 'C');
  const starD = getStarStats(massD, ageD, params.feh, 'D');

  const splits: RealisticBinarySplit[] = [
    {
      pair: 'A-B',
      a_AU: 180.0,
      e: 0.88,
      regime: 'S-Type (Circum-SMBH Orbit)',
      sMaxA: 120.0,
      sMaxB: 18.0,
      pMin: 420.0,
    },
    {
      pair: '(AB)-C',
      a_AU: 580.0,
      e: 0.65,
      regime: 'S-Type (Circum-SMBH Orbit)',
      sMaxA: 310.0,
      sMaxB: 25.0,
      pMin: 1150.0,
    },
    {
      pair: '(ABC)-D',
      a_AU: 1450.0,
      e: 0.42,
      regime: 'S-Type (Circum-SMBH Orbit)',
      sMaxA: 820.0,
      sMaxB: 40.0,
      pMin: 2800.0,
    },
  ];

  // 3. A whole bunch of asteroid belts and NO planets
  const beltDefs = [
    { role: 'Relativistic Inner Accretion Debris Ring', a: 1.2, width: 0.6, mass: 65 },
    { role: 'Innermost Silicate Dust & Planetesimal Belt', a: 3.6, width: 1.4, mass: 120 },
    { role: 'Sublimation Transition Asteroid Belt', a: 7.8, width: 2.5, mass: 180 },
    { role: 'Main Circumnuclear Asteroid Ring (CNR)', a: 16.5, width: 5.2, mass: 350 },
    { role: 'Dense Frozen Asteroid & Comet Belt', a: 31.0, width: 9.0, mass: 240 },
    { role: 'Perturbed Outer Planetesimal Field', a: 58.0, width: 16.0, mass: 190 },
    { role: 'Kuiper-Scale Relic Debris Belt', a: 95.0, width: 24.0, mass: 140 },
    { role: 'Circum-Cluster Tidal Debris Torus', a: 150.0, width: 38.0, mass: 95 },
  ];

  const beltBodies: RealisticBeltBody[] = beltDefs.map((def) => {
    const inc = +(rng.next() * 12.0).toFixed(2);
    const node = +(rng.next() * 360.0).toFixed(1);
    return {
      kind: 'belt',
      role: def.role,
      a: def.a,
      a_birth: def.a,
      beltWidth: def.width,
      rawSlotMassEarth: def.mass * 1.5,
      massEarth: def.mass,
      incDeg: inc,
      omegaNodeDeg: node,
    };
  });

  const smbhZone: RealisticPlanetaryZone = {
    title: 'Circumnuclear Debris Ring & Relativistic Torus (Star A)',
    mass: params.sysMass,
    lum: 1250000,
    a_in: 0.8,
    a_out: 180.0,
    a_snow: 22.0,
    archetype: 'D',
    probs: { A: 0, B: 0, C: 0, D: 1 },
    diskMassEarth: 1380.0,
    bodies: beltBodies, // NO planets, only asteroid belts
  };

  return {
    roll: globalRollCounter,
    step1: params,
    hierarchy: {
      archName: 'Supermassive Black Hole System (Galactic Center S-Cluster)',
      stars: [starA, starB, starC, starD],
      splits,
      zones: [
        {
          title: `Star A (${starA.spectralType})`,
          mass: starA.mass,
          lum: starA.lumNum,
          age: params.age,
          feh: params.feh,
          a_in: 0.8,
          a_out: 180.0,
        },
      ],
    },
    zones: [smbhZone],
    seedUsed,
  };
}

let globalRollCounter = 0;

export function runRealisticGenerator(
  params: StarGenParams,
  rng?: PRNG
): RealisticStarSystemResult {
  let seedUsed: number | undefined;
  if (!rng && (params.id !== undefined || params.seed !== undefined)) {
    seedUsed = seedFromId(params.id ?? params.seed!);
    rng = new PRNG(seedUsed);
  }
  globalRollCounter++;

  // Special System: If solar masses > 999999, ignore regular algorithm and create SMBH system
  if (params.sysMass > 999999) {
    return generateSupermassiveBlackHoleSystem(params, rng, seedUsed);
  }

  const nStars = rollStep2(params.sysMass, params.forcedMult, rng);
  const h = buildHierarchy(params.sysMass, params.age, params.feh, nStars, rng);
  const pZones: RealisticPlanetaryZone[] = [];
  for (let i = 0; i < h.zones.length; i++) {
    const gz = generateZoneSystem(h.zones[i], rng);
    pZones.push(gz);
  }
  return {
    roll: globalRollCounter,
    step1: params,
    hierarchy: h,
    zones: pZones,
    seedUsed,
  };
}

export function getPlanetVisualColor(b: RealisticPlanetBody): string {
  if (b.gasFrac >= 0.15) {
    if (b.sudarskyClass === 'I') return '#f59e0b';
    if (b.sudarskyClass === 'II') return '#93c5fd';
    if (b.sudarskyClass === 'III') return '#3b82f6';
    if (b.sudarskyClass === 'IV') return '#6366f1';
    if (b.sudarskyClass === 'V') return '#ef4444';
    return '#a78bfa';
  }
  if (b.planetClass.includes('Lava') || b.planetClass.includes('Molten')) {
    return '#f97316';
  }
  if (b.planetClass.includes('Sulfuric Acid') || b.hydrosphere?.solvent === 'H2SO4') {
    return '#a3e635';
  }
  if (b.planetClass.includes('SO2 Ocean') || b.hydrosphere?.solvent === 'SO2') {
    return '#facc15';
  }
  if (b.planetClass.includes('CO2 Ocean') || b.hydrosphere?.solvent === 'CO2') {
    return '#2dd4bf';
  }
  if (b.planetClass.includes('Cryo-Ammonia') || b.hydrosphere?.solvent === 'NH3-H2O') {
    return '#818cf8';
  }
  if (b.planetClass.includes('Titan') || b.hydrosphere?.solvent === 'CH4-C2H6') {
    return '#fbbf24';
  }
  if (b.planetClass.includes('Habitable') && !b.planetClass.includes('Pelagic')) {
    return '#10b981';
  }
  if (b.hydrosphere) return '#0ea5e9';
  if (b.planetClass.includes('Venusian') || b.planetClass.includes('Toxic')) {
    return '#eab308';
  }
  if (b.iceFrac >= 0.25) return '#67e8f9';
  return '#d97706';
}

export function getMoonVisualColor(m: RealisticMoon): string {
  if (m.moonClass.includes('SO2-Ocean') || m.hydrosphere?.solvent === 'SO2') return '#facc15';
  if (m.moonClass.includes('Sulfuric Acid') || m.hydrosphere?.solvent === 'H2SO4') return '#a3e635';
  if (m.moonClass.includes('CO2-Ocean') || m.hydrosphere?.solvent === 'CO2') return '#2dd4bf';
  if (m.moonClass.includes('Cryo-Ammonia') || m.hydrosphere?.solvent === 'NH3-H2O') return '#818cf8';
  if (m.moonClass.includes('Volcanic') || m.moonClass.includes('Io')) return '#f97316';
  if (m.moonClass.includes('Habitable')) return '#10b981';
  if (m.moonClass.includes('Titan')) return '#fbbf24';
  if (m.moonClass.includes('Europa') || m.hydrosphere) return '#38bdf8';
  if (m.iceFrac >= 0.25) return '#67e8f9';
  if (m.moonClass.includes('Captured')) return '#94a3b8';
  return '#cbd5e1';
}

export function formatGasesSummary(
  gases: Record<string, number>,
  atmosphereType: string
): string {
  const keys = Object.keys(gases);
  if (keys.length === 0) return atmosphereType || 'Vacuum';
  const top = keys
    .slice(0, 4)
    .map((k) => `${k} ${(gases[k] * 100).toFixed(0)}%`)
    .join(', ');
  return `${top} (${atmosphereType})`;
}

/**
 * Converts a RealisticPlanetaryZone's bodies into PlanetArchetype[] for 3D Sector Sim & CircumstellarView3D
 */
export function convertZoneBodiesToPlanetArchetypes(
  zone: RealisticPlanetaryZone,
  rng?: PRNG
): PlanetArchetype[] {
  const { random } = makeRngHelpers(rng);
  const planetBodies = zone.bodies.filter(
    (b): b is RealisticPlanetBody => b.kind === 'planet'
  );

  return planetBodies.map((b, idx) => {
    return {
      id: idx + 1,
      name: `Planet ${String.fromCharCode(98 + idx).toUpperCase()}`,
      a0: b.a,
      currentA: b.a,
      ecc: b.e,
      incDeg: b.incDeg ?? 0,
      massEarth: b.massEarth,
      radiusEarth: b.radiusEarth,
      albedo: b.albedo,
      greenhouse: b.greenhouseK,
      type: b.planetClass,
      atmosphere: formatGasesSummary(b.gases, b.atmosphereType),
      color: getPlanetVisualColor(b),
      angle: random() * Math.PI * 2,
      isEngulfed: false,
      status: 'Active',
      a_birth: b.a_birth,
      migrationHistory: b.migrationHistory,
      densityGcm3: b.densityGcm3,
      rockFrac: b.rockFrac,
      iceFrac: b.iceFrac,
      gasFrac: b.gasFrac,
      T_eq: b.T_eq,
      T_atm: b.T_atm,
      surfaceTempK: b.surfaceTempK,
      muMin: b.muMin,
      pressureBar: b.pressureBar,
      sudarskyClass: b.sudarskyClass,
      atmosphereType: b.atmosphereType,
      gases: b.gases,
      hydrosphere: b.hydrosphere,
      rings: b.rings,
      rocheLimitRp: b.rocheLimitRp,
      moons: b.moons,
      rotationHours: b.rotationHours,
      spinState: b.spinState,
      axialTiltDeg: b.axialTiltDeg,
      omegaNodeDeg: b.omegaNodeDeg,
      argPeriDeg: b.argPeriDeg,
      magneticField: b.magneticField,
    };
  });
}

/**
 * Converts a RealisticStarNode into a Stellaris star class
 */
export function mapRealisticStarToArchitectClass(st: RealisticStarNode): string {
  if (st.category.includes('Black Hole')) return 'pc_black_hole';
  if (st.category.includes('Neutron')) return 'pc_neutron_star';
  if (st.category.includes('White Dwarf')) return 'pc_white_dwarf';
  const sp = st.spectralType.charAt(0);
  if (sp === 'O' || sp === 'B') return 'pc_b_star';
  if (sp === 'A') return 'pc_a_star';
  if (sp === 'F') return 'pc_f_star';
  if (sp === 'G') return 'pc_g_star';
  if (sp === 'K') return 'pc_k_star';
  return 'pc_m_star';
}

/**
 * Maps a RealisticPlanetBody into a Stellaris planet class
 */
export function mapRealisticPlanetToArchitectClass(b: RealisticPlanetBody): string {
  const pc = b.planetClass;
  if (pc.includes('Gas Giant') || pc.includes('Hot Jupiter')) return 'pc_gas_giant';
  if (pc.includes('Ice Giant') || pc.includes('Neptune') || pc.includes('Gas Dwarf')) {
    return 'pc_ice_giant';
  }
  if (pc.includes('Molten') || pc.includes('Lava') || b.surfaceTempK >= 800) return 'pc_molten';
  // Uninhabitable dense/hostile atmospheres & exotic non-water oceans
  if (
    pc.includes('Toxic') ||
    pc.includes('Venusian') ||
    pc.includes('Supercritical') ||
    pc.includes('Sulfuric') ||
    pc.includes('Sulfurous') ||
    pc.includes('Carbonic') ||
    pc.includes('Ammonia') ||
    pc.includes('Methane') ||
    pc.includes('Titan')
  ) {
    return 'pc_toxic';
  }
  // Genuinely habitable worlds map to Stellaris colonizable classes
  if (pc.includes('Aquatic Ocean') || pc.includes('Water Ocean') || pc.includes('Pelagic') || pc.includes('Water World')) {
    return 'pc_ocean';
  }
  if (
    (pc.includes('Aquatic') && (pc.includes('Temperate') || pc.includes('Warm'))) ||
    pc.includes('Habitable') ||
    pc.includes('Terrestrial')
  ) {
    if (b.surfaceTempK > 302) return 'pc_tropical';
    if (b.surfaceTempK < 278) return 'pc_arctic';
    return 'pc_continental';
  }
  if (pc.includes('Frozen') || pc.includes('Icy')) return 'pc_frozen';
  if (pc.includes('Airless') || pc.includes('Martian') || b.T_eq < 180) return 'pc_barren_cold';
  return 'pc_barren';
}

/**
 * Converts a RealisticStarSystemResult (and selected zone index) into an ArchitectSystem
 * for 3D Astro-Architect & Stellaris Script generation.
 */
export function convertRealisticToArchitectSystem(
  res: RealisticStarSystemResult,
  zoneIndex = 0,
  customName?: string
): ArchitectSystem {
  const h = res.hierarchy;
  const zone = res.zones[zoneIndex] || res.zones[0];
  const primaryStar = h.stars[0];
  const secondaryStar = h.stars[1];

  const isCircumbinary = zone?.title.includes('Circumbinary');
  const hierarchyMode: 'single' | 'circumbinary' | 's_type_binary' =
    h.stars.length === 1
      ? 'single'
      : isCircumbinary
      ? 'circumbinary'
      : 's_type_binary';

  const sysBaseName =
    customName ||
    res.step1.name ||
    `AstroGen-${res.roll} (${primaryStar.spectralType.split(' ')[0]})`;

  const bodies: CelestialBody[] = (zone ? zone.bodies : []).map((b, idx) => {
    if (b.kind === 'belt') {
      return {
        id: `belt_${idx + 1}`,
        name: b.role.split('(')[0].trim(),
        sma: b.a,
        type: 'belt',
        size: 4,
        speed: 1.0,
        moons: [],
      };
    }

    const pClass = mapRealisticPlanetToArchitectClass(b);
    const pSize = calculatePlanetSize(b.radiusEarth, b.massEarth);
    const moons: CelestialMoon[] = (b.moons || []).map((m, mIdx) => {
      let mType = 'pc_barren_cold';
      if (
        m.moonClass.includes('Titan') ||
        m.moonClass.includes('SO2-Ocean') ||
        m.moonClass.includes('Sulfuric Acid') ||
        m.moonClass.includes('CO2-Ocean') ||
        m.moonClass.includes('Cryo-Ammonia')
      ) {
        mType = 'pc_toxic';
      } else if (m.moonClass.includes('Volcanic') || m.moonClass.includes('Io')) {
        mType = 'pc_molten';
      } else if (m.moonClass.includes('Habitable')) {
        mType = m.hydrosphere?.state.includes('Global Surface Liquid') ? 'pc_ocean' : 'pc_continental';
      } else if (m.moonClass.includes('Europa') || m.moonClass.includes('Icy') || m.moonClass.includes('Triton')) {
        mType = 'pc_frozen';
      } else if (m.moonClass.includes('Rocky')) {
        mType = m.T_eq < 180 ? 'pc_barren_cold' : 'pc_barren';
      }

      return {
        id: `m_${idx + 1}_${mIdx + 1}`,
        name: `${sysBaseName.split(' ')[0]} ${String.fromCharCode(98 + idx)}-${mIdx + 1}`,
        size: Math.max(4, Math.min(12, Math.round((m.radiusKm / 6371) * 16))),
        dist: Math.max(2.5, Math.min(14, +(m.a_Rp * 0.25).toFixed(1))),
        type: mType,
        moons: [],
      };
    });

    return {
      id: `p_${idx + 1}`,
      name: `${sysBaseName.split(' ')[0]} ${String.fromCharCode(98 + idx)} (${b.planetClass.split('(')[0].trim()})`,
      sma: b.a,
      type: pClass,
      size: pSize,
      speed: +(1.0 / Math.sqrt(Math.max(0.05, b.a))).toFixed(2),
      ring: Boolean(b.rings),
      moons,
    };
  });

  const archSys: ArchitectSystem = {
    id: `stargen_system_${res.roll}`,
    _galaxyId: `stargen_${res.roll}`,
    hierarchy: hierarchyMode,
    scaling: { scale: 50, exponent: 0.667, offset: 0 },
    star: {
      name: `${sysBaseName.split(' ')[0]} A`,
      class: mapRealisticStarToArchitectClass(primaryStar),
      size: Math.max(15, Math.min(40, Math.round(28 * Math.pow(primaryStar.mass, 0.25)))),
    },
    ...(secondaryStar
      ? {
          star2: {
            name: `${sysBaseName.split(' ')[0]} B`,
            class: mapRealisticStarToArchitectClass(secondaryStar),
            size: Math.max(12, Math.min(35, Math.round(24 * Math.pow(secondaryStar.mass, 0.25)))),
            dist: isCircumbinary ? 14 : 220,
          },
        }
      : {}),
    bodies,
  };

  return computeRadialDistances(archSys);
}

/**
 * Converts a RealisticStarSystemResult into a StarSystem for 3D CircumstellarView3D / ExpandedSolarSystemTheater
 */
export function convertRealisticToSectorStarSystem(
  res: RealisticStarSystemResult,
  zoneIndex = 0
): StarSystem {
  const zone = res.zones[zoneIndex] || res.zones[0];
  const primary = res.hierarchy.stars[0];
  const progenitorMass = Math.max(0.08, zone ? zone.mass : primary.mass);
  const starAgeGyr = res.step1.age;

  if (res.step1.sysMass > 999999) {
    const starState: StellarEvolutionState = {
      phase: 'Supermassive Black Hole',
      spectralMK: 'SMBH',
      spectralDesc: 'Supermassive Black Hole (10^6 M☉ relativistic nucleus)',
      ageGyr: res.step1.age,
      ageText: `${res.step1.age.toFixed(1)} Gyr`,
      L: 1250000,
      Teff: 85000,
      currentMass: res.step1.sysMass,
      radiusRsun: 4.24,
      radiusAU: +(4.24 * 0.00465).toFixed(5),
      radiusKm: 2950000,
      rInHZ: 1100,
      rOutHZ: 2400,
      snowLineAU: 2800,
      isPulsating: false,
      isSupernova: false,
      isPlanetaryNebula: false,
      nebulaRadiusAU: 0,
      snShockRadiusAU: 0,
      isRemnant: true,
      remnantType: 'Black Hole',
    };
    const colorData = {
      r: 192,
      g: 132,
      b: 252,
      glow: 'rgba(192, 132, 252, 0.45)',
      hex: '#c084fc',
      cat: 'remnant' as const,
    };
    return {
      id: 9000 + res.roll,
      name: res.step1.name || `STARGEN-${String(res.roll).padStart(3, '0')}`,
      x: 0,
      y: 0,
      z: 0,
      progenitorMass: res.step1.sysMass,
      starAgeGyr: res.step1.age,
      progressPct: 100.0,
      starState,
      colorData,
      planets: [],
      hasHZPlanet: false,
      metallicityDex: res.step1.feh,
      systemArchName: res.hierarchy.archName,
      zoneArchetype: 'D',
      diskMassEarth: zone?.diskMassEarth || 1380,
      companionStars: res.hierarchy.stars.slice(1),
      binarySplits: res.hierarchy.splits,
    };
  }

  const tMS_Gyr = calculateMSLifetimeGyr(progenitorMass);
  const progressPct = Math.min(100.0, (starAgeGyr / tMS_Gyr) * 50.0);
  const starState = calculateStellarEvolution(progenitorMass, progressPct);
  const colorData = getStarColorRGB(starState.Teff, starState.phase);

  const planets = zone ? convertZoneBodiesToPlanetArchetypes(zone) : [];
  const hasHZPlanet = planets.some(
    (p) =>
      (p.a0 >= starState.rInHZ && p.a0 <= starState.rOutHZ) ||
      p.type.includes('Habitable')
  );

  return {
    id: 9000 + res.roll,
    name: `STARGEN-${String(res.roll).padStart(3, '0')}`,
    x: 0,
    y: 0,
    z: 0,
    progenitorMass,
    starAgeGyr,
    progressPct,
    starState,
    colorData,
    planets,
    hasHZPlanet,
    metallicityDex: res.step1.feh,
    systemArchName: res.hierarchy.archName,
    zoneArchetype: zone?.archetype,
    diskMassEarth: zone?.diskMassEarth,
    companionStars: res.hierarchy.stars.slice(1),
    binarySplits: res.hierarchy.splits,
  };
}
