export type SpectralCategory = 'ob' | 'af' | 'g' | 'km' | 'remnant';

export type SectorMorphology = 'disk' | 'core' | 'cluster' | 'halo';

export type FilterCategory = 'all' | 'ob' | 'g' | 'km' | 'remnant' | 'hz';

export type PlanetStatus =
  | 'Active'
  | 'Candidate Habitable'
  | 'Scorched'
  | 'Runaway Greenhouse'
  | 'Cold Desert'
  | 'Deep Frozen'
  | 'Engulfed (Vaporized)'
  | 'Sterilized (Supernova Shock)';

export interface MorganKeenanResult {
  full: string;
  sub: string;
  pillColor?: string;
}

export interface StarColorData {
  r: number;
  g: number;
  b: number;
  glow: string;
  hex: string;
  cat: SpectralCategory;
}

export interface StellarEvolutionState {
  phase: string;
  spectralMK: string;
  spectralDesc: string;
  ageGyr: number;
  ageText: string;
  L: number;
  Teff: number;
  currentMass: number;
  radiusRsun: number;
  radiusAU: number;
  radiusKm: number;
  rInHZ: number;
  rOutHZ: number;
  snowLineAU: number;
  isPulsating: boolean;
  isSupernova: boolean;
  isPlanetaryNebula: boolean;
  nebulaRadiusAU: number;
  snShockRadiusAU: number;
  isRemnant: boolean;
  remnantType: 'Black Hole' | 'Neutron Star' | 'White Dwarf' | null;
}

export interface RealisticMagneticField {
  surfaceFieldGauss: number;
  surfaceFieldMicroTesla: number;
  magneticMomentEarth: number;
  dynamoStatus: string;
  hasActiveDynamo: boolean;
  coreState: string;
  magnetopauseRadiusRp: number;
  bowShockRadiusRp: number;
  shieldingEfficiencyPct: number;
  radiationLevel: 'Minimal' | 'Moderate' | 'High' | 'Extreme';
  auroraDescription: string;
  biosphereImplication: string;
}

export interface RealisticHydrosphere {
  state: string;
  solvent?: string;
  coveragePct?: number;
  biosphere?: string | null;
  liqKm: number;
  scKm: number;
  iceKm: number;
  siKm: number;
  crustKm?: number;
}

export interface RealisticMoon {
  id: string;
  name: string;
  moonClass: string;
  origin: string;
  a_Rp: number;
  a_km: number;
  e: number;
  incDeg: number;
  periodDays: number;
  massEarth: number;
  massLunar: number;
  radiusEarth: number;
  radiusKm: number;
  densityGcm3: number;
  gravityG: number;
  rockFrac: number;
  iceFrac: number;
  gasFrac: number;
  albedo: number;
  T_eq: number;
  T_atm: number;
  surfaceTempK: number;
  greenhouseK: number;
  tidalW: number;
  tidalFluxWm2: number;
  muMin: number;
  pressureBar: number | null;
  atmosphereType: string;
  gases: Record<string, number>;
  hydrosphere: RealisticHydrosphere | null;
  retrograde: boolean;
  rotationHours: number;
  spinState: string;
  axialTiltDeg: number;
  magneticField?: RealisticMagneticField;
}

export interface RealisticBinarySplit {
  pair: string;
  a_AU: number;
  e: number;
  regime: string;
  sMaxA: number;
  sMaxB: number;
  pMin: number;
}

export interface RealisticStarNode {
  label: string;
  category: string;
  mass: number;
  lum: number | string;
  lumNum: number;
  radius: number;
  Teff: number;
  logg: number;
  tau: number;
  spectralType: string;
  colorHex: string;
}

export interface PlanetArchetype {
  id: number;
  name: string;
  a0: number;
  currentA: number;
  ecc: number;
  incDeg: number;
  massEarth: number;
  radiusEarth: number;
  albedo: number;
  greenhouse: number;
  type: string;
  atmosphere: string;
  color: string;
  angle: number;
  isEngulfed: boolean;
  status: PlanetStatus;
  // Enriched Steps 1-6 Astrophysical Fields
  a_birth?: number;
  migrationHistory?: string;
  densityGcm3?: number;
  rockFrac?: number;
  iceFrac?: number;
  gasFrac?: number;
  T_eq?: number;
  T_atm?: number;
  surfaceTempK?: number;
  muMin?: number;
  pressureBar?: number | null;
  sudarskyClass?: string | null;
  atmosphereType?: string;
  gases?: Record<string, number>;
  hydrosphere?: RealisticHydrosphere | null;
  rings?: string | null;
  rocheLimitRp?: number;
  moons?: RealisticMoon[];
  rotationHours?: number;
  spinState?: string;
  axialTiltDeg?: number;
  omegaNodeDeg?: number;
  argPeriDeg?: number;
  magneticField?: RealisticMagneticField;
}

export interface PlanetPhysicsComputed {
  currentA: number;
  periodDays: number;
  periodYrs: number;
  fluxWm2: number;
  fluxRatio: number;
  teq: number;
  tsurf: number;
  tsurfC: number;
  gravityG: string;
  isTidallyLocked: boolean;
  status: PlanetStatus;
  isEngulfed: boolean;
}

export interface StarSystem {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  progenitorMass: number;
  starAgeGyr: number;
  progressPct: number;
  starState: StellarEvolutionState;
  colorData: StarColorData;
  planets: PlanetArchetype[];
  hasHZPlanet: boolean;
  // Enriched Steps 1-6 System Architecture Metadata
  metallicityDex?: number;
  systemArchName?: string;
  zoneArchetype?: 'A' | 'B' | 'C' | 'D';
  diskMassEarth?: number;
  companionStars?: RealisticStarNode[];
  binarySplits?: RealisticBinarySplit[];
}

export interface SectorConfiguration {
  starCount: number;
  morphology: SectorMorphology;
  meanAgeGyr: number;
  ageSigmaGyr: number;
  metallicityDex: number;
  radiusLy: number;
  seed: number;
}

export type ActiveAppMode =
  | 'home'
  | 'galaxy-gen'
  | 'sector-hex'
  | 'stargen-lab'
  | 'astro-architect'
  | 'sector-3d';

