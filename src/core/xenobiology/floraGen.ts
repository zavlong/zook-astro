/**
 * Procedural Xenoflora & Plant Ecosystem Generator
 * 
 * Generates astrophysically consistent, biologically plausible indigenous plant species
 * (autotrophs, chemotrophs, phototrophic thallophytes) based on:
 * - Host star spectrum (Teff) -> Photosynthetic pigments & light-harvesting mechanisms
 * - Planetary surface gravity (g) -> Structural height scaling, trunk buttressing & stipe mechanics
 * - Atmospheric pressure (bar) -> Spore dispersal, aerodynamic buoyancy & leaf cuticle thickness
 * - Hydrosphere solvent -> Biochemical polymers (Cellulose, Cryo-Proteoglycans, Fluoropolymers)
 * - Surface Biomes -> Ecological distribution & endemic habitat niches
 */

export type PlantFormCategory = 'Tree' | 'Frond' | 'Cushion' | 'Spire' | 'Mat' | 'Kelp';

export interface XenofloraSpecies {
  id: string;
  formCategory: PlantFormCategory;
  commonName: string;
  scientificName: string;
  growthForm: string; // e.g. "Mega-Canopy Tree", "Succulent Cushion", "Siphon-Frond", "Mat-Lichen", "Pelagic Marine Kelp"
  trophicType: string; // e.g. "Oxygenic Photoautotroph", "Near-IR Bacteriochlorotroph", "UV-Phycobilin Phototroph"
  pigmentName: string;
  pigmentColorHex: string;
  averageHeightM: number;
  averageSpreadM: number;
  structuralPolymer: string; // e.g. "Lignified Cellulose", "Silica-Reinforced Biomineral", "Cryo-Proteoglycan Gel"
  reproductionMethod: string; // e.g. "Buoyant Aeroplanktonic Spores", "Explosive Ballistic Pods", "Hydraulic Gamete Siphons"
  nativeBiomeIds: number[];
  nativeBiomeNames: string[];
  canopyCoveragePct: number; // 5% - 40%
  adaptations: string[];
  description: string;
}

export interface PlanetaryEcosystemSummary {
  hasPlantLife: boolean;
  isMulticellular: boolean;
  dominantPigment: string;
  dominantPigmentHex: string;
  photosynthesisType: string;
  biochemistrySolvent: string;
  structuralBase: string;
  canopyHeightRangeM: { min: number; max: number };
  totalSpeciesCount: number;
  diversityTier: 'Sterile' | 'Microbial Biofilms' | 'Pioneer Bryophytes' | 'Developing Flora' | 'Hyper-Diverse Megabiome';
  summaryText: string;
  speciesList: XenofloraSpecies[];
}

// PRNG helper
function createSeedRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Grammatical gender for Latin binomial agreement
export type GrammaticalGender = 'masc' | 'fem' | 'neut';

export interface FormSuffixEntry {
  suffix: string;
  gender: GrammaticalGender;
  englishNouns: string[];
}

export interface ColorPrefixEntry {
  prefix: string;
  englishAdj: string;
}

export interface EpithetEntry {
  masc: string;
  fem: string;
  neut: string;
  english: string;
}

// Color & pigment taxonomy: Greek/Latin prefixes directly mapped to English spectrum adjectives
export const COLOR_TAXONOMY: Record<string, ColorPrefixEntry[]> = {
  Chlorophyll: [
    { prefix: 'Chloro', englishAdj: 'Emerald' },
    { prefix: 'Viridi', englishAdj: 'Verdant' },
    { prefix: 'Prasino', englishAdj: 'Viridian' },
    { prefix: 'Smaragdo', englishAdj: 'Jade' },
  ],
  Carotenoid: [
    { prefix: 'Chryso', englishAdj: 'Golden' },
    { prefix: 'Xantho', englishAdj: 'Amber' },
    { prefix: 'Auro', englishAdj: 'Gilded' },
    { prefix: 'Fulvo', englishAdj: 'Russet' },
    { prefix: 'Croco', englishAdj: 'Saffron' },
  ],
  IR: [
    { prefix: 'Melano', englishAdj: 'Obsidian' },
    { prefix: 'Porphyro', englishAdj: 'Purple-Black' },
    { prefix: 'Atro', englishAdj: 'Midnight' },
    { prefix: 'Ianthino', englishAdj: 'Velvet' },
  ],
  UV: [
    { prefix: 'Cyano', englishAdj: 'Azure' },
    { prefix: 'Caeruleo', englishAdj: 'Cerulean' },
    { prefix: 'Glauco', englishAdj: 'Teal' },
    { prefix: 'Phycocyano', englishAdj: 'Cobalt' },
  ],
  Cryo: [
    { prefix: 'Cryo', englishAdj: 'Cryo-Frost' },
    { prefix: 'Gelido', englishAdj: 'Glacial' },
    { prefix: 'Glacio', englishAdj: 'Indigo-Ice' },
    { prefix: 'Ammonio', englishAdj: 'Amethyst-Frost' },
  ],
  Hydrocarbon: [
    { prefix: 'Carbo', englishAdj: 'Bitumen' },
    { prefix: 'Piceo', englishAdj: 'Pitch-Brown' },
    { prefix: 'Bitumino', englishAdj: 'Tar' },
    { prefix: 'Chalco', englishAdj: 'Smoky-Copper' },
  ],
};

// Form suffixes for unicellular / microbial crusts (no trees or arborescent trunks)
export const UNICELLULAR_FORM_SUFFIXES: FormSuffixEntry[] = [
  { suffix: 'stroma', gender: 'neut', englishNouns: ['Stromatolite-Crust', 'Biofilm-Weave'] },
  { suffix: 'derma', gender: 'neut', englishNouns: ['Soil-Crust', 'Regolith-Skin'] },
  { suffix: 'pelte', gender: 'fem', englishNouns: ['Algal-Mat', 'Crust-Sheet'] },
  { suffix: 'thrix', gender: 'fem', englishNouns: ['Filament-Turf', 'Algal-Turf'] },
  { suffix: 'taphris', gender: 'fem', englishNouns: ['Plains-Crust', 'Micro-Mat'] },
  { suffix: 'biont', gender: 'masc', englishNouns: ['Colonial-Biofilm', 'Micro-Colony'] },
];

// Form suffixes for multicellular plant archetypes
export const MULTICELLULAR_FORM_SUFFIXES: Record<PlantFormCategory, FormSuffixEntry[]> = {
  Tree: [
    { suffix: 'dendron', gender: 'neut', englishNouns: ['Canopy-Tree', 'Arbor'] },
    { suffix: 'cladus', gender: 'masc', englishNouns: ['Bough-Tree', 'Canopy-Arbor'] },
    { suffix: 'phyton', gender: 'neut', englishNouns: ['Pillar-Tree', 'Mega-Canopy'] },
    { suffix: 'caulis', gender: 'masc', englishNouns: ['Trunk-Tree', 'Colonnade'] },
  ],
  Frond: [
    { suffix: 'pteris', gender: 'fem', englishNouns: ['Fern-Frond', 'Plume-Frond'] },
    { suffix: 'pteryx', gender: 'fem', englishNouns: ['Wing-Frond', 'Feather-Blade'] },
    { suffix: 'frons', gender: 'fem', englishNouns: ['Siphon-Frond', 'Fan-Blade'] },
    { suffix: 'stemma', gender: 'neut', englishNouns: ['Ribbon-Frond', 'Spray-Fern'] },
  ],
  Cushion: [
    { suffix: 'pulvinus', gender: 'masc', englishNouns: ['Cushion-Dome', 'Pebble-Succulent'] },
    { suffix: 'sphaera', gender: 'fem', englishNouns: ['Globe-Succulent', 'Dome-Cushion'] },
    { suffix: 'plax', gender: 'fem', englishNouns: ['Plate-Lichen', 'Shield-Cushion'] },
    { suffix: 'lobus', gender: 'masc', englishNouns: ['Lobed-Rosette', 'Button-Cushion'] },
  ],
  Mat: [
    { suffix: 'stroma', gender: 'neut', englishNouns: ['Stromatolite-Mat', 'Biofilm-Weave'] },
    { suffix: 'derma', gender: 'neut', englishNouns: ['Crust-Lichen', 'Ground-Carpet'] },
    { suffix: 'pelte', gender: 'fem', englishNouns: ['Velvet-Thallus', 'Sheet-Lichen'] },
    { suffix: 'rhiza', gender: 'fem', englishNouns: ['Rhizome-Felt', 'Carpet-Bryophyte'] },
  ],
  Kelp: [
    { suffix: 'phyceae', gender: 'fem', englishNouns: ['Ribbon-Kelp', 'Siphon-Wrack'] },
    { suffix: 'siphon', gender: 'neut', englishNouns: ['Tubular-Wrack', 'Pelagic-Tendril'] },
    { suffix: 'nemus', gender: 'neut', englishNouns: ['Float-Weed', 'Pelagic-Tendril'] },
    { suffix: 'zona', gender: 'fem', englishNouns: ['Tidal-Wrack', 'Coastal-Kelp'] },
  ],
  Spire: [
    { suffix: 'spira', gender: 'fem', englishNouns: ['Needle-Spire', 'Pinnacle'] },
    { suffix: 'turris', gender: 'fem', englishNouns: ['Tower-Spire', 'Chimney-Spire'] },
    { suffix: 'columna', gender: 'fem', englishNouns: ['Columnar-Spire', 'Obelisk'] },
    { suffix: 'stachys', gender: 'fem', englishNouns: ['Spike-Spire', 'Spore-Spire'] },
  ],
};

// Size-aligned Epithets (Strictly enforced so small plants are never called 'grandis' or 'titanis')
export const MICRO_EPITHETS: EpithetEntry[] = [
  { masc: 'pumilus', fem: 'pumila', neut: 'pumilum', english: 'Pygmy' },
  { masc: 'nanus', fem: 'nana', neut: 'nanum', english: 'Dwarf' },
  { masc: 'crustosus', fem: 'crustosa', neut: 'crustosum', english: 'Crust' },
  { masc: 'humilis', fem: 'humilis', neut: 'humile', english: 'Low-Creeping' },
  { masc: 'subtilis', fem: 'subtilis', neut: 'subtile', english: 'Micro' },
  { masc: 'tenuis', fem: 'tenuis', neut: 'tenue', english: 'Sheet' },
  { masc: 'repens', fem: 'repens', neut: 'repens', english: 'Creeping' },
];

export const MEDIUM_EPITHETS: EpithetEntry[] = [
  { masc: 'gracilis', fem: 'gracilis', neut: 'gracile', english: 'Slender' },
  { masc: 'elegans', fem: 'elegans', neut: 'elegans', english: 'Elegant' },
  { masc: 'communis', fem: 'communis', neut: 'commune', english: 'Common' },
  { masc: 'ramosus', fem: 'ramosa', neut: 'ramosum', english: 'Branching' },
  { masc: 'intermedius', fem: 'intermedia', neut: 'intermedium', english: 'Midland' },
  { masc: 'decorus', fem: 'decora', neut: 'decorum', english: 'Ornate' },
];

export const LARGE_EPITHETS: EpithetEntry[] = [
  { masc: 'grandis', fem: 'grandis', neut: 'grande', english: 'Great' },
  { masc: 'titanis', fem: 'titanis', neut: 'titane', english: 'Titanic' },
  { masc: 'giganteus', fem: 'gigantea', neut: 'giganteum', english: 'Giant' },
  { masc: 'excelsus', fem: 'excelsa', neut: 'excelsum', english: 'Towering' },
  { masc: 'procerus', fem: 'procera', neut: 'procerum', english: 'High-Canopy' },
  { masc: 'magnificus', fem: 'magnifica', neut: 'magnificum', english: 'Majestic' },
  { masc: 'colossalis', fem: 'colossalis', neut: 'colossale', english: 'Colossal' },
];

// Endemic Biome/Habitat-aligned Epithets
export const VOLCANIC_EPITHETS: EpithetEntry[] = [
  { masc: 'volcanicus', fem: 'volcanica', neut: 'volcanicum', english: 'Volcanic' },
  { masc: 'pyrogenus', fem: 'pyrogena', neut: 'pyrogenum', english: 'Pyric' },
  { masc: 'ignescens', fem: 'ignescens', neut: 'ignescens', english: 'Caldera' },
  { masc: 'chalcophilus', fem: 'chalcophila', neut: 'chalcophilum', english: 'Thermal' },
];

export const CRYO_EPITHETS: EpithetEntry[] = [
  { masc: 'cryophilus', fem: 'cryophila', neut: 'cryophilum', english: 'Frost-Tolerant' },
  { masc: 'borealis', fem: 'borealis', neut: 'boreale', english: 'Boreal' },
  { masc: 'gelidus', fem: 'gelida', neut: 'gelidum', english: 'Glacial' },
  { masc: 'pergelidus', fem: 'pergelida', neut: 'pergelidum', english: 'Permafrost' },
];

export const AQUATIC_EPITHETS: EpithetEntry[] = [
  { masc: 'pelagicus', fem: 'pelagica', neut: 'pelagicum', english: 'Pelagic' },
  { masc: 'marinus', fem: 'marina', neut: 'marinum', english: 'Coastal' },
  { masc: 'abyssalis', fem: 'abyssalis', neut: 'abyssale', english: 'Abyssal' },
  { masc: 'thalassicus', fem: 'thalassica', neut: 'thalassicum', english: 'Oceanic' },
];

export const ARID_EPITHETS: EpithetEntry[] = [
  { masc: 'eremicus', fem: 'eremica', neut: 'eremicum', english: 'Desert' },
  { masc: 'xerophilus', fem: 'xerophila', neut: 'xerophilum', english: 'Drought-Resistant' },
  { masc: 'saxatilis', fem: 'saxatilis', neut: 'saxatile', english: 'Lithic' },
  { masc: 'arenarius', fem: 'arenaria', neut: 'arenarium', english: 'Dune' },
];

export const STROMATOLITE_EPITHETS: EpithetEntry[] = [
  { masc: 'stromatolyticus', fem: 'stromatolytica', neut: 'stromatolyticum', english: 'Stromatolitic' },
  { masc: 'edaphicus', fem: 'edaphica', neut: 'edaphicum', english: 'Soil-Bound' },
  { masc: 'endolithicus', fem: 'endolithica', neut: 'endolithicum', english: 'Endolithic' },
];

/**
 * Generates semantically aligned binomial scientific and English common names.
 * Ensures:
 * - Color prefix strictly matches pigment photobiology ("Chloro" is only green, "Chryso" gold, etc.)
 * - Form suffix strictly matches morphology ("pteryx" only fronds, "dendron" trees, "stroma" mats)
 * - Size epithet strictly matches scale ("grandis" only for large canopy trees >8m, "pumilus" for crusts <0.15m)
 * - Latin and English names mirror each other's linguistic meaning.
 */
export function generateCoherentSpeciesName(params: {
  regimeKey: 'IR' | 'Carotenoid' | 'Chlorophyll' | 'UV' | 'Cryo' | 'Hydrocarbon';
  formCategory: PlantFormCategory;
  isMulticellular: boolean;
  scaledHeight: number;
  nativeBiomeIds: number[];
  speciesIndex: number;
  rng: () => number;
  usedScientificNames?: Set<string>;
  usedCommonNames?: Set<string>;
}): { scientificName: string; commonName: string } {
  const {
    regimeKey,
    formCategory,
    isMulticellular,
    scaledHeight,
    nativeBiomeIds,
    speciesIndex,
    rng,
    usedScientificNames,
    usedCommonNames,
  } = params;

  // 1. Color prefix matching the pigment regime
  const colorList = COLOR_TAXONOMY[regimeKey] || COLOR_TAXONOMY.Chlorophyll;
  const colorEntry = colorList[(speciesIndex + Math.floor(rng() * colorList.length)) % colorList.length];

  // 2. Form suffix matching morphology
  const suffixList = !isMulticellular
    ? UNICELLULAR_FORM_SUFFIXES
    : MULTICELLULAR_FORM_SUFFIXES[formCategory] || MULTICELLULAR_FORM_SUFFIXES.Tree;
  const formEntry = suffixList[(speciesIndex + Math.floor(rng() * suffixList.length)) % suffixList.length];

  // Genus: ColorPrefix + FormSuffix (e.g. Chlorodendron, Cryostroma, Xanthopteris)
  const genus = `${colorEntry.prefix}${formEntry.suffix}`;

  // 3. Candidate epithets pool adhering to scale and habitat
  const epithetPool: EpithetEntry[] = [];

  const hasVolcanic = nativeBiomeIds.some(id => id === 14 || id === 15 || id === 22);
  const hasCryo = nativeBiomeIds.some(id => id === 6 || id === 7) || regimeKey === 'Cryo';
  const hasAquatic = nativeBiomeIds.some(id => id === 2 || id === 3 || id === 23) || formCategory === 'Kelp';
  const hasArid = nativeBiomeIds.some(id => id === 9 || id === 10 || id === 11);

  if (hasVolcanic) epithetPool.push(...VOLCANIC_EPITHETS);
  if (hasCryo) epithetPool.push(...CRYO_EPITHETS);
  if (hasAquatic) epithetPool.push(...AQUATIC_EPITHETS);
  if (hasArid) epithetPool.push(...ARID_EPITHETS);
  if (!isMulticellular) epithetPool.push(...STROMATOLITE_EPITHETS);

  // Strictly enforce size-aligned epithets
  if (scaledHeight < 0.15) {
    epithetPool.push(...MICRO_EPITHETS);
  } else if (scaledHeight > 8.0) {
    epithetPool.push(...LARGE_EPITHETS);
  } else {
    epithetPool.push(...MEDIUM_EPITHETS);
  }

  // Pick unique epithet where possible
  let chosenEpithet = pickRandom(epithetPool, rng);
  for (let attempt = 0; attempt < epithetPool.length; attempt++) {
    const candidate = epithetPool[(attempt + Math.floor(rng() * epithetPool.length)) % epithetPool.length];
    const candidateLatin =
      formEntry.gender === 'masc'
        ? candidate.masc
        : formEntry.gender === 'fem'
        ? candidate.fem
        : candidate.neut;
    const testSci = `${genus} ${candidateLatin}`;
    if (!usedScientificNames || !usedScientificNames.has(testSci)) {
      chosenEpithet = candidate;
      break;
    }
  }

  const epithetLatin =
    formEntry.gender === 'masc'
      ? chosenEpithet.masc
      : formEntry.gender === 'fem'
      ? chosenEpithet.fem
      : chosenEpithet.neut;

  const scientificName = `${genus} ${epithetLatin}`;

  // 4. English common name strictly reflecting the exact Latin components
  const englishNoun = pickRandom(formEntry.englishNouns, rng);
  let commonName: string;
  if (englishNoun.toLowerCase().includes(chosenEpithet.english.toLowerCase())) {
    commonName = `${colorEntry.englishAdj} ${englishNoun}`;
  } else {
    commonName = `${chosenEpithet.english} ${colorEntry.englishAdj} ${englishNoun}`;
  }

  if (usedScientificNames) usedScientificNames.add(scientificName);
  if (usedCommonNames) usedCommonNames.add(commonName);

  return { scientificName, commonName };
}

/**
 * Derives pigment regime key based on star temperature and solvent.
 */
function getPigmentRegime(starTeff: number, solventKey: string): {
  regimeKey: 'IR' | 'Carotenoid' | 'Chlorophyll' | 'UV' | 'Cryo' | 'Hydrocarbon';
  trophicType: string;
  pigmentName: string;
  baseHexColors: string[];
} {
  const isAmmonia = solventKey === 'NH3-H2O';
  const isHydrocarbon = solventKey.toLowerCase().includes('methane') || solventKey.toLowerCase().includes('ethane');

  if (isAmmonia) {
    return {
      regimeKey: 'Cryo',
      trophicType: 'Cryo-Ammonia Osmotrophic Phototroph',
      pigmentName: 'Cryogenic Polyphenols & Pyrroles (Violet-Teal)',
      baseHexColors: ['#6d328f', '#512373', '#38687a', '#2f5466', '#7e3fa6']
    };
  }

  if (isHydrocarbon) {
    return {
      regimeKey: 'Hydrocarbon',
      trophicType: 'Non-Aqueous Hydrocarbon Phototroph',
      pigmentName: 'Conjugated Polyene Carotenoids (Copper-Smoky)',
      baseHexColors: ['#8a5229', '#63391b', '#9c663b', '#734424']
    };
  }

  // Aqueous solvent
  if (starTeff < 3900) {
    return {
      regimeKey: 'IR',
      trophicType: 'Near-IR Anoxygenic Bacteriochlorotroph',
      pigmentName: 'IR-Absorbing Bacteriochlorophyll & Retinal (Purple/Black)',
      baseHexColors: ['#4a1f59', '#381445', '#2a0e36', '#5c226e', '#321040']
    };
  } else if (starTeff < 5100) {
    return {
      regimeKey: 'Carotenoid',
      trophicType: 'Carotenoid-Enhanced Photoautotroph',
      pigmentName: 'Carotenoid & Xanthophyll Complex (Amber-Gold)',
      baseHexColors: ['#b87b28', '#995f19', '#c98a34', '#7d4a11', '#a8671b']
    };
  } else if (starTeff <= 6800) {
    return {
      regimeKey: 'Chlorophyll',
      trophicType: 'Oxygenic Chlorophyll A/B Photoautotroph',
      pigmentName: 'Chlorophyll A/B Light Harvesting Complex (Emerald Green)',
      baseHexColors: ['#3d7a42', '#28612e', '#1c4d21', '#4d9454', '#2d6935']
    };
  } else {
    return {
      regimeKey: 'UV',
      trophicType: 'UV-Shielding Phycocyanin Photoautotroph',
      pigmentName: 'Phycocyanin & Melanin Cuticle Shield (Cyan-Teal)',
      baseHexColors: ['#237e87', '#1b636b', '#2c939e', '#174e54', '#38a8b5']
    };
  }
}

/**
 * Generate the plant ecosystem summary and species catalog for a world.
 */
export function generatePlantEcosystem(params: {
  seed: number;
  hasBiosphere: boolean;
  biosphereDescription?: string;
  systemAgeGyr?: number;
  starTeff?: number;
  gravityG?: number;
  pressureBar?: number | null;
  solventKey?: string;
  hasLiquid?: boolean;
  biomeGrid?: Uint8Array;
}): PlanetaryEcosystemSummary {
  const {
    seed,
    hasBiosphere,
    biosphereDescription = '',
    systemAgeGyr = 4.5,
    starTeff = 5778,
    gravityG = 1.0,
    pressureBar = 1.0,
    solventKey = 'H2O',
    hasLiquid = true,
  } = params;

  if (!hasBiosphere) {
    return {
      hasPlantLife: false,
      isMulticellular: false,
      dominantPigment: 'None (Sterile Regolith)',
      dominantPigmentHex: '#71717a',
      photosynthesisType: 'None',
      biochemistrySolvent: solventKey,
      structuralBase: 'Inorganic Crust',
      canopyHeightRangeM: { min: 0, max: 0 },
      totalSpeciesCount: 0,
      diversityTier: 'Sterile',
      summaryText: 'Devoid of autotrophic vegetation. Extreme abiotic radiation and lack of self-replicating biochemical pathways prevent indigenous plant life.',
      speciesList: [],
    };
  }

  const rng = createSeedRng(seed ^ 0x4f19b7d2);
  const bioDescLower = biosphereDescription.toLowerCase();
  const isMulticellular = bioDescLower.includes('multicellular') || 
    (!bioDescLower.includes('unicellular') && !bioDescLower.includes('microbial') && systemAgeGyr >= 2.8);
  const pBar = pressureBar ?? 1.0;
  const g = Math.max(0.15, gravityG);

  // Height scaling: structural physics h ~ (1/g)^0.65
  const heightMultiplier = Math.pow(1.0 / g, 0.65);

  const pigmentInfo = getPigmentRegime(starTeff, solventKey);

  // Structural base polymer depending on solvent, multicellularity, and gravity
  let structuralBase = isMulticellular ? 'Lignified Cellulose' : 'Extracellular Biofilm Matrix & Polysaccharides';
  if (solventKey === 'NH3-H2O') {
    structuralBase = isMulticellular
      ? 'Cryo-Proteoglycan & Glycerol-Cellulose Gel'
      : 'Cryo-Proteoglycan Mucilaginous Biofilm';
  } else if (solventKey.toLowerCase().includes('methane')) {
    structuralBase = isMulticellular
      ? 'Silica-Sclerotized Polyaromatic Frustules'
      : 'Silica-Frustule Hydrocarbon Biofilms';
  } else if (isMulticellular && g > 1.6) {
    structuralBase = 'Silica-Reinforced Biomineralized Cellulose';
  }

  // Diversity tier
  let diversityTier: PlanetaryEcosystemSummary['diversityTier'] = 'Developing Flora';
  if (!isMulticellular) {
    diversityTier = 'Microbial Biofilms';
  } else if (systemAgeGyr < 3.5) {
    diversityTier = 'Pioneer Bryophytes';
  } else if (systemAgeGyr > 6.0 && hasLiquid) {
    diversityTier = 'Hyper-Diverse Megabiome';
  }

  // Number of plant species to generate
  const speciesCount = !isMulticellular ? clamp(Math.round(4 + rng() * 2), 4, 6) : clamp(Math.round(5 + rng() * 3), 5, 8);

  const speciesList: XenofloraSpecies[] = [];

  // Archetypes to instantiate
  interface ArchetypeConfig {
    formCategory: 'Tree' | 'Frond' | 'Cushion' | 'Mat' | 'Kelp' | 'Spire';
    growthForm: string;
    baseHeightM: number;
    baseSpreadM: number;
    nativeBiomes: { id: number; name: string }[];
    reproductionMethod: string;
    adaptations: string[];
    isAquatic?: boolean;
  }

  // Unicellular archetypes: no tree models, only colored soil, biological crusts, and algal plains
  const unicellularArchetypes: ArchetypeConfig[] = [
    {
      formCategory: 'Mat',
      growthForm: 'Terrestrial Biological Soil Crust & Algal Mat',
      baseHeightM: 0.005,
      baseSpreadM: 6.0,
      nativeBiomes: [
        { id: 5, name: 'Algal Plains' },
        { id: 4, name: 'Lowland Silicate Plains' },
      ],
      reproductionMethod: 'Asexual binary fission and windborne desiccation-tolerant micro-cysts',
      adaptations: [
        'Radiotolerant DNA-repair enzymes allowing survival under unshielded cosmic radiation',
        'Endolithic moisture retention within silicate regolith grains',
        'Direct atmospheric nitrogen fixation into colored soil crusts',
      ],
    },
    {
      formCategory: 'Mat',
      growthForm: 'Continental Stromatolitic Algal Mat',
      baseHeightM: 0.035,
      baseSpreadM: 4.5,
      nativeBiomes: [
        { id: 5, name: 'Algal Plains' },
        { id: 3, name: 'Coastal Algal Mat Basin' },
      ],
      reproductionMethod: 'Colonial budding and benthic extracellular slime accretion',
      adaptations: [
        'Sediment-binding polysaccharide slime sheets forming terraced ground crusts',
        'High-density pigment layers filtering harsh ultraviolet stellar flux',
        'Direct mineral precipitation consolidating loose regolith into organic soil',
      ],
    },
    {
      formCategory: 'Cushion',
      growthForm: 'Endolithic Radiotolerant Soil Biofilm',
      baseHeightM: 0.002,
      baseSpreadM: 2.8,
      nativeBiomes: [
        { id: 4, name: 'Lowland Silicate Plains' },
        { id: 9, name: 'Arid Steppe / Scrub' },
        { id: 11, name: 'High Plateau / Badlands' },
      ],
      reproductionMethod: 'Microbial fragmentation and dormant spore dusting',
      adaptations: [
        'Unshielded surface radiation tolerance via manganese-complex chaperone proteins',
        'Mineral dissolution extracting phosphorus from basaltic silicate rock',
        'Osmotic trehalose synthesis buffering extreme temperature swings',
      ],
    },
    {
      formCategory: 'Spire',
      growthForm: 'Sub-Polar Cryophilic Algal Biofilm',
      baseHeightM: 0.004,
      baseSpreadM: 3.2,
      nativeBiomes: [
        { id: 6, name: 'Sub-Polar Algal Plains' },
        { id: 7, name: 'Tundra / Permafrost' },
      ],
      reproductionMethod: 'Cryo-dormant spore encapsulation in permafrost pores',
      adaptations: [
        'Natural glycerol antifreeze preventing intra-cellular ice crystallization',
        'Active sub-zero photosynthesis utilizing microscopic brine channels',
        'Dark melanin and carotenoid pigments absorbing solar infrared heat',
      ],
    },
    {
      formCategory: 'Kelp',
      growthForm: 'Pelagic Marine Micro-Algal Bloom',
      baseHeightM: 0.001,
      baseSpreadM: 18.0,
      nativeBiomes: [
        { id: 23, name: 'Algal Sea' },
        { id: 2, name: 'Continental Shelf / Shallows' },
      ],
      reproductionMethod: 'Exponential asexual division in photic surface waters',
      adaptations: [
        'Gas vacuole buoyancy regulation keeping cells in optimal photic zone',
        'Silica frustule protective shell resisting hydrodynamic shearing',
        'Bioluminescent shock responses deterring micro-grazers',
      ],
      isAquatic: true,
    },
    {
      formCategory: 'Mat',
      growthForm: 'Estuarine Coastal Cyanobacterial Mat',
      baseHeightM: 0.015,
      baseSpreadM: 5.0,
      nativeBiomes: [
        { id: 3, name: 'Coastal Algal Mat Basin' },
        { id: 2, name: 'Continental Shelf / Shallows' },
      ],
      reproductionMethod: 'Horizontal gliding trichome filaments across intertidal silt',
      adaptations: [
        'Extreme salinity and evaporation buffering via mucilage sheaths',
        'Photosynthetic pigment shifting across changing tidal depths',
        'Facultative anoxygenic photosynthesis when buried under storm silt',
      ],
    },
  ];

  // Multicellular complex plant archetypes
  const multicellularArchetypes: ArchetypeConfig[] = [
    // 1. Dominant Arboreal / High Canopy
    {
      formCategory: 'Tree',
      growthForm: g < 0.6 ? 'Towering Low-Gravity Mega-Canopy' : g > 1.4 ? 'Buttressed Ground-Hug Canopy' : 'Arborescent Vascular Canopy Tree',
      baseHeightM: g < 0.6 ? 48.0 : g > 1.4 ? 4.2 : 22.0,
      baseSpreadM: g < 0.6 ? 16.0 : g > 1.4 ? 7.5 : 9.0,
      nativeBiomes: [
        { id: 4, name: 'Lowland Silicate Plains' },
        { id: 5, name: 'Forest' },
      ],
      reproductionMethod: pBar > 2.5 
        ? 'Buoyant aeroplanktonic seed-balloons riding dense air currents' 
        : pBar < 0.4 
        ? 'Explosive ballistic dehiscence launching hardened seed-casings' 
        : 'Hydro-pneumatic spore capsules dispersed on seasonal trade winds',
      adaptations: [
        `Vascular stipe scaled for ${g.toFixed(2)}g surface gravity`,
        `Parabolic leaf canopy angled for ${starTeff}K host star spectrum`,
        pBar > 2.0 ? 'Aerodynamic cuticular flutes to resist dense atmospheric wind shear' : 'Thick waxy cuticle minimizing transpiration water loss',
      ],
    },
    // 2. Understory Frond / Shrub
    {
      formCategory: 'Frond',
      growthForm: 'Broadleaf Siphon-Frond Understory Shrub',
      baseHeightM: 2.8,
      baseSpreadM: 2.2,
      nativeBiomes: [
        { id: 5, name: 'Forest' },
        { id: 3, name: 'Coastal Marsh & Mangrove Forest' },
      ],
      reproductionMethod: 'Hydraulic siphon-gametes released in riparian humidity',
      adaptations: [
        'High-efficiency diffuse light capture beneath taller arboreal canopies',
        'Interconnected subterranean rhizome communication network',
        'Bio-synthetic alkaloids deterring native herbivorous micro-fauna',
      ],
    },
    // 3. Resilient Ground Cover / Succulent Cushion
    {
      formCategory: 'Cushion',
      growthForm: 'Succulent Cushion-Dome Lithophyte',
      baseHeightM: 0.45,
      baseSpreadM: 1.8,
      nativeBiomes: [
        { id: 9, name: 'Arid Steppe / Scrub' },
        { id: 11, name: 'High Plateau / Badlands' },
        { id: 10, name: 'Hyper-Arid Dunes / Desert' },
      ],
      reproductionMethod: 'Creeping clonal runners with subterranean nutrient corms',
      adaptations: [
        'Compact geometric cushion shape minimizing thermal and desiccation stress',
        'Endolithic root-hairs capable of dissolving mineral silicate nutrients',
        'Internal water-storage parenchyma maintaining hydraulic turgor',
      ],
    },
    // 4. Boreal / Cold Plateau Conifer-Equivalent
    {
      formCategory: 'Spire',
      growthForm: 'Spire Needle-Fern / Columnar Autotroph',
      baseHeightM: 11.0,
      baseSpreadM: 2.8,
      nativeBiomes: [
        { id: 6, name: 'Boreal Forest / Taiga' },
        { id: 7, name: 'Tundra / Permafrost' },
      ],
      reproductionMethod: 'Hardened cryo-dormant spore nodules buried in permafrost',
      adaptations: [
        'Natural glycerol & polyol antifreeze metabolites resisting cell lysis',
        'Narrow spire architecture shedding heavy snow and cryo-precipitation',
        'High-density cellular sap maintaining active photosynthesis at sub-zero temperatures',
      ],
    },
    // 5. Pioneer Mat Lichen / Biofilm
    {
      formCategory: 'Mat',
      growthForm: 'Symbiotic Crust-Lichen & Biofilm Carpet',
      baseHeightM: 0.08,
      baseSpreadM: 3.5,
      nativeBiomes: [
        { id: 16, name: 'Regolith Impact Craterlands' },
        { id: 6, name: 'Boreal Forest / Taiga' },
        { id: 11, name: 'High Plateau / Badlands' },
      ],
      reproductionMethod: 'Direct fragmentation and desiccated windborne soredia dust',
      adaptations: [
        'Radiation-resistant melanin-chaperone proteins repairing UV double-strand breaks',
        'Extreme anhydrobiosis enabling decades-long dormancy during volcanic winters',
        'Direct atmospheric vapor adsorption without requiring liquid surface water',
      ],
    },
    // 6. Coastal / Marine Pelagic Kelp (If planet has liquid)
    {
      formCategory: 'Kelp',
      growthForm: 'Pelagic Marine Siphon-Kelp Reef',
      baseHeightM: 18.0,
      baseSpreadM: 6.0,
      nativeBiomes: [
        { id: 2, name: 'Continental Shelf / Shallows' },
        { id: 23, name: 'Algal Sea' },
        { id: 3, name: 'Coastal Marsh & Mangrove Forest' },
      ],
      reproductionMethod: 'Bioluminescent flagellated gametes released during planetary spring tides',
      adaptations: [
        'Internal methane/gas flotation bladders maintaining fronds in photic surface waters',
        'Flexible hydraulic stipe dissipating high-energy coastal wave turbulence',
        'Active iodine and heavy element bio-accumulation from planetary seawater',
      ],
      isAquatic: true,
    },
    // 7. Wetland Alluvial Mangrove / Siphon-Reef
    {
      formCategory: 'Frond',
      growthForm: 'Alluvial Stilt-Frond & Pneumatophore Shrub',
      baseHeightM: 5.5,
      baseSpreadM: 4.0,
      nativeBiomes: [
        { id: 3, name: 'Coastal Marsh & Mangrove Forest' },
        { id: 2, name: 'Continental Shelf / Shallows' },
      ],
      reproductionMethod: 'Viviparous hydrochorous propagules drifting on estuary tides',
      adaptations: [
        'Pneumatophores (aerial breathing roots) extracting gases from waterlogged silt',
        'Ultrafiltration salt/mineral excretion glands on dorsal leaf surfaces',
        'Extensive sediment-anchoring stilt root matrix preventing shoreline erosion',
      ],
    },
    // 8. Volcanic Caldera / Geothermal Extremophile Autotroph
    {
      formCategory: 'Spire',
      growthForm: 'Chemosynthetic Chalcogenide Chimney-Lichen',
      baseHeightM: 1.4,
      baseSpreadM: 0.9,
      nativeBiomes: [
        { id: 14, name: 'Basalt Volcanic Crust' },
        { id: 15, name: 'Active Lava Caldera & Fissure' },
        { id: 22, name: 'Active Volcanic Shield & Lava Caldera' },
      ],
      reproductionMethod: 'Thermal plume convective spore dispersers triggering upon basalt fracturing',
      adaptations: [
        'Thermophilic heat-shock chaperones stable up to 395 Kelvin',
        'Direct sulfur oxidation coupled with metallic iron ion reduction',
        'Vitreous silica outer sleeve providing structural integrity against acidic sulfur fumes',
      ],
    },
  ];

  const archetypes = isMulticellular ? multicellularArchetypes : unicellularArchetypes;

  // Pick top N archetypes based on planetary attributes
  const candidatePool = archetypes.filter(arch => {
    if (arch.isAquatic && !hasLiquid) return false;
    return true;
  });

  const selectedArchetypes = candidatePool.slice(0, speciesCount);

  let minCanopyH = 999;
  let maxCanopyH = 0;

  const usedScientificNames = new Set<string>();
  const usedCommonNames = new Set<string>();

  for (let i = 0; i < selectedArchetypes.length; i++) {
    const arch = selectedArchetypes[i];
    const specRng = createSeedRng((seed * 73 + i * 1993) >>> 0);

    // Height & spread scaled by gravity (unicellular soil crusts remain micro-scale)
    const scaledHeight = isMulticellular
      ? +(arch.baseHeightM * heightMultiplier * (0.85 + specRng() * 0.3)).toFixed(1)
      : +(arch.baseHeightM * (0.85 + specRng() * 0.3)).toFixed(3);
    const scaledSpread = +(arch.baseSpreadM * (isMulticellular ? heightMultiplier : 1.0) * (0.85 + specRng() * 0.3)).toFixed(1);

    if (scaledHeight < minCanopyH) minCanopyH = scaledHeight;
    if (scaledHeight > maxCanopyH) maxCanopyH = scaledHeight;

    // Pigment color for this specific species: slight perturbation of regime color
    const colorIdx = i % pigmentInfo.baseHexColors.length;
    const baseColor = pigmentInfo.baseHexColors[colorIdx];

    // Semantically aligned Latin binomial and English common names
    const { scientificName, commonName } = generateCoherentSpeciesName({
      regimeKey: pigmentInfo.regimeKey,
      formCategory: arch.formCategory,
      isMulticellular,
      scaledHeight,
      nativeBiomeIds: arch.nativeBiomes.map(b => b.id),
      speciesIndex: i,
      rng: specRng,
      usedScientificNames,
      usedCommonNames,
    });

    // Canopy coverage %
    const coverage = Math.round(10 + specRng() * 25);

    const descNote = isMulticellular
      ? `Indigenous ${arch.growthForm.toLowerCase()} adapted to ${g.toFixed(2)}g gravity and the ${starTeff}K host star spectrum. Features ${arch.adaptations[0].toLowerCase()} and thrives in ${arch.nativeBiomes.map(b => b.name).join(', ')}.`
      : `Indigenous ${arch.growthForm.toLowerCase()} colonizing land and shallow seas as colored soil crusts under the ${starTeff}K host star spectrum. Features ${arch.adaptations[0].toLowerCase()} across ${arch.nativeBiomes.map(b => b.name).join(', ')}.`;

    speciesList.push({
      id: `flora_${seed}_${i}`,
      formCategory: arch.formCategory,
      commonName,
      scientificName,
      growthForm: arch.growthForm,
      trophicType: pigmentInfo.trophicType,
      pigmentName: pigmentInfo.pigmentName,
      pigmentColorHex: baseColor,
      averageHeightM: Math.max(0.001, scaledHeight),
      averageSpreadM: Math.max(0.1, scaledSpread),
      structuralPolymer: structuralBase,
      reproductionMethod: arch.reproductionMethod,
      nativeBiomeIds: arch.nativeBiomes.map(b => b.id),
      nativeBiomeNames: arch.nativeBiomes.map(b => b.name),
      canopyCoveragePct: coverage,
      adaptations: arch.adaptations,
      description: descNote,
    });
  }

  // General summary text
  const summaryText = !isMulticellular
    ? `${diversityTier}: ${speciesList.length} distinct unicellular autotrophic taxa identified. Autotrophs colonize land and seas as colored soil crusts and algal mats across Algal Plains (no tree models or arborescent canopies). Dominated by ${pigmentInfo.pigmentName} light harvesting under ${g.toFixed(2)}g surface gravity.`
    : `${diversityTier}: ${speciesList.length} distinct autotrophic taxa identified. Dominated by ${pigmentInfo.pigmentName} light harvesting under ${g.toFixed(2)}g surface gravity. Canopy heights reach up to ${maxCanopyH}m with ${structuralBase.toLowerCase()} cellular architecture.`;

  return {
    hasPlantLife: true,
    isMulticellular,
    dominantPigment: pigmentInfo.pigmentName,
    dominantPigmentHex: pigmentInfo.baseHexColors[0],
    photosynthesisType: pigmentInfo.trophicType,
    biochemistrySolvent: solventKey,
    structuralBase,
    canopyHeightRangeM: { min: minCanopyH === 999 ? 0 : minCanopyH, max: maxCanopyH },
    totalSpeciesCount: speciesList.length,
    diversityTier,
    summaryText: biosphereDescription ? `${biosphereDescription} ${summaryText}` : summaryText,
    speciesList,
  };
}

/**
 * Filter species that are native to a specific Goldberg tile's biome.
 */
export function getSpeciesForBiome(speciesList: XenofloraSpecies[], biomeId: number): XenofloraSpecies[] {
  return speciesList.filter(s => s.nativeBiomeIds.includes(biomeId));
}

/**
 * Filter species that are native to a tile's biomes (both primary and secondary ecotone biomes).
 */
export function getSpeciesForTileBiomes(
  speciesList: XenofloraSpecies[],
  primaryBiomeId: number,
  secondaryBiomeId?: number | null
): XenofloraSpecies[] {
  return speciesList.filter(s =>
    s.nativeBiomeIds.includes(primaryBiomeId) ||
    (secondaryBiomeId !== undefined && secondaryBiomeId !== null && s.nativeBiomeIds.includes(secondaryBiomeId))
  );
}

