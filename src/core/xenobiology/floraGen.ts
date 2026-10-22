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

  const hasVolcanic = nativeBiomeIds.some(id => VOLCANIC_BIOME_IDS.has(id));
  const hasCryo = nativeBiomeIds.some(id => CRYO_BIOME_IDS.has(id)) || regimeKey === 'Cryo';
  const hasAquatic = nativeBiomeIds.some(id => AQUATIC_BIOME_IDS.has(id)) || formCategory === 'Kelp';
  const hasArid = nativeBiomeIds.some(id => ARID_BIOME_IDS.has(id));

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

  let finalScientificName = `${genus} ${epithetLatin}`;

  // 4. English common name strictly reflecting the exact Latin components
  const englishNoun = pickRandom(formEntry.englishNouns, rng);
  let finalCommonName: string;
  if (englishNoun.toLowerCase().includes(chosenEpithet.english.toLowerCase())) {
    finalCommonName = `${colorEntry.englishAdj} ${englishNoun}`;
  } else {
    finalCommonName = `${chosenEpithet.english} ${colorEntry.englishAdj} ${englishNoun}`;
  }

  // Ensure absolute collision-free uniqueness when generating larger species counts (up to 20)
  if (usedScientificNames && usedScientificNames.has(finalScientificName)) {
    for (let sIdx = 1; sIdx < suffixList.length; sIdx++) {
      const altForm = suffixList[(speciesIndex + sIdx) % suffixList.length];
      const altGenus = `${colorEntry.prefix}${altForm.suffix}`;
      const altSci = `${altGenus} ${epithetLatin}`;
      if (!usedScientificNames.has(altSci)) {
        finalScientificName = altSci;
        finalCommonName = `${chosenEpithet.english} ${colorEntry.englishAdj} ${pickRandom(altForm.englishNouns, rng)}`;
        break;
      }
    }
    if (usedScientificNames.has(finalScientificName)) {
      let counter = 2;
      while (usedScientificNames.has(`${finalScientificName} ${counter}`)) {
        counter++;
      }
      finalScientificName = `${finalScientificName} ${counter}`;
      finalCommonName = `${finalCommonName} Type ${counter}`;
    }
  }

  if (usedScientificNames) usedScientificNames.add(finalScientificName);
  if (usedCommonNames) usedCommonNames.add(finalCommonName);

  return { scientificName: finalScientificName, commonName: finalCommonName };
}

/**
 * Derives pigment regime key based on star temperature, solvent, and surface temperature regime.
 */
export function getPigmentRegime(
  starTeff: number,
  solventKey: string = 'H2O',
  options?: {
    isCryoWorld?: boolean;
    surfaceTempK?: number;
  }
): {
  regimeKey: 'IR' | 'Carotenoid' | 'Chlorophyll' | 'UV' | 'Cryo' | 'Hydrocarbon';
  trophicType: string;
  pigmentName: string;
  baseHexColors: string[];
} {
  const isAmmonia = solventKey === 'NH3-H2O';
  const isHydrocarbon = solventKey.toLowerCase().includes('methane') || solventKey.toLowerCase().includes('ethane');

  // Cryogenic environment (ammonia-water, cryogenic planet < 215 K, or pure cryo biomes)
  if (isAmmonia || options?.isCryoWorld || (options?.surfaceTempK !== undefined && options.surfaceTempK < 215)) {
    return {
      regimeKey: 'Cryo',
      trophicType: 'Cryogenic Psychrophilic Photoautotroph',
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

// Explicit Ecological Biome Regimes
export const CRYO_BIOME_IDS = new Set<number>([7, 8, 13, 18, 21]);
export const VOLCANIC_BIOME_IDS = new Set<number>([14, 15, 22]);
export const ARID_BIOME_IDS = new Set<number>([9, 10, 11, 16]);
export const TEMPERATE_LAND_BIOME_IDS = new Set<number>([3, 4, 5, 6, 12]);
export const AQUATIC_BIOME_IDS = new Set<number>([0, 1, 2, 17, 23]);

export const WATER_BIOME_IDS = AQUATIC_BIOME_IDS;
export const POLAR_ICE_BIOME_IDS = CRYO_BIOME_IDS;
export const SOLID_LAND_BIOME_IDS = new Set<number>([
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 21, 22
]);

export const BIOME_NAMES: Record<number, string> = {
  0: 'Abyssal Trench',
  1: 'Deep Ocean',
  2: 'Continental Shelf / Shallows',
  3: 'Coastal Alluvial Basin',
  4: 'Lowland Silicate Plains',
  5: 'Temperate Continental Basin',
  6: 'High-Latitude Rocky Steppe',
  7: 'Tundra / Permafrost',
  8: 'Polar Glacial Ice',
  9: 'Arid Steppe / Scrub',
  10: 'Hyper-Arid Dunes / Desert',
  11: 'High Plateau / Badlands',
  12: 'Mountain Cordillera',
  13: 'Alpine Glacial Peaks',
  14: 'Basalt Volcanic Crust',
  15: 'Active Lava Caldera & Fissure',
  16: 'Regolith Impact Craterlands',
  17: 'Hydrocarbon Methane Sea',
  18: 'Cryovolcanic Nitrogen Plains',
  21: 'Cryotectonic Ice Fissure (Linea)',
  22: 'Active Volcanic Shield & Lava Caldera',
  23: 'Algal Sea',
};

/**
 * Calculates a biologically grounded species count between 5 and 20,
 * dynamically weighted by evolutionary age and planetary habitability.
 */
export function calculateWeightedSpeciesCount(params: {
  systemAgeGyr?: number;
  hasLiquid?: boolean;
  hasLand?: boolean;
  solventKey?: string;
  surfaceTempK?: number;
  pressureBar?: number | null;
  isMulticellular: boolean;
  biosphereDescription?: string;
  presentBiomeCount?: number;
  rng: () => number;
}): number {
  const {
    systemAgeGyr = 4.5,
    hasLiquid = true,
    hasLand = true,
    solventKey = 'H2O',
    surfaceTempK = 288,
    pressureBar = 1.0,
    isMulticellular,
    biosphereDescription = '',
    presentBiomeCount = 4,
    rng,
  } = params;

  // 1. Age Factor: Evolutionary diversification timeline
  // Young biospheres (<2.0 Gyr) are simple and sparsely diversified.
  // Mature biospheres (4.0+ Gyr) have evolved numerous specialized ecological niches.
  let ageScore = clamp((systemAgeGyr - 1.2) / 3.8, 0.05, 1.0);
  if (!isMulticellular) {
    // Unicellular biospheres have limited macro-morphological speciation
    ageScore = Math.min(ageScore, 0.35);
  }

  // 2. Solvent Habitability
  const solvLower = solventKey.toLowerCase();
  const isWater = solvLower.includes('h2o') || solvLower.includes('water') || solvLower.includes('brine');
  const isAmmonia = solvLower.includes('nh3') || solvLower.includes('ammonia');
  const solventScore = isWater ? 1.0 : isAmmonia ? 0.62 : 0.45;

  // 3. Hydrosphere & Land Geomorphology (Ecotonal Niches)
  let hydroScore = 0.5;
  if (hasLiquid && hasLand) {
    // Maximum ecotone diversity: terrestrial, riverine, littoral, benthic, pelagic
    hydroScore = 1.0;
  } else if (hasLiquid && !hasLand) {
    // Pelagic ocean world: rich marine life, but no terrestrial clades
    hydroScore = 0.68;
  } else if (!hasLiquid && hasLand) {
    // Arid / desert world without open standing liquid
    hydroScore = 0.48;
  }

  // 4. Thermodynamic Temperature Habitability
  let tempScore = 0.5;
  if (isWater) {
    if (surfaceTempK >= 273 && surfaceTempK <= 318) {
      tempScore = 1.0; // Optimal Goldilocks temperate climate
    } else if (surfaceTempK >= 250 && surfaceTempK <= 340) {
      tempScore = 0.72; // Moderate psychrophilic or thermophilic stress
    } else {
      tempScore = 0.35; // Severe thermal stress
    }
  } else if (isAmmonia) {
    if (surfaceTempK >= 180 && surfaceTempK <= 245) {
      tempScore = 1.0; // Cryogenic ammonia-water optimum
    } else {
      tempScore = 0.5;
    }
  } else {
    tempScore = 0.6;
  }

  // 5. Atmospheric Pressure Habitability
  const p = pressureBar ?? 1.0;
  let pressScore = 0.5;
  if (p >= 0.4 && p <= 2.8) {
    pressScore = 1.0; // Ample gas density for respiration, spore flight, and thermal buffering
  } else if (p >= 0.1 && p <= 6.0) {
    pressScore = 0.75;
  } else {
    pressScore = 0.4; // Vacuum-like (<0.1 bar) or crushing (>6 bar)
  }

  // 6. Biome Niches Variety
  const biomeScore = clamp(presentBiomeCount / 6, 0.4, 1.0);

  // 7. Relic / White Dwarf Environmental Stress Penalty
  const isRelicBio =
    biosphereDescription.toLowerCase().includes('relic') ||
    biosphereDescription.toLowerCase().includes('white dwarf');
  const relicMultiplier = isRelicBio ? 0.5 : 1.0;

  // Composite Habitability Score (0.1 to 1.0)
  const habScore = clamp(
    (solventScore * 0.3 + hydroScore * 0.25 + tempScore * 0.25 + pressScore * 0.1 + biomeScore * 0.1) * relicMultiplier,
    0.1,
    1.0
  );

  // Balanced weighting: 50% evolutionary age, 50% environmental habitability
  const combinedFactor = clamp(0.5 * ageScore + 0.5 * habScore, 0.05, 1.0);

  if (isMulticellular === false) {
    // Unicellular / microbial worlds have lower taxonomic speciation
    const baseTarget = 2 + combinedFactor * 6;
    const jitter = (rng() - 0.5) * 2.0;
    return clamp(Math.round(baseTarget + jitter), 2, 8);
  }

  // Multicellular biospheres: Map to [5, 20] range with gentle stochastic variation
  const baseTarget = 5 + combinedFactor * 15;
  const jitter = (rng() - 0.5) * 3.0;
  return clamp(Math.round(baseTarget + jitter), 5, 20);
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
  hasLand?: boolean;
  coveragePct?: number;
  biomeGrid?: Uint8Array;
  surfaceTempK?: number;
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
    biomeGrid,
    surfaceTempK,
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

  // 1. Analyze biome grid to determine which biomes actually exist on this planet
  const presentBiomeIds = new Set<number>();
  if (biomeGrid && biomeGrid.length > 0) {
    for (let i = 0; i < biomeGrid.length; i++) {
      presentBiomeIds.add(biomeGrid[i]);
    }
  }

  // Detect whether this is an extreme cryogenic or volcanic world
  const isAllCryoBiomes = presentBiomeIds.size > 0 && Array.from(presentBiomeIds).every(id => CRYO_BIOME_IDS.has(id));
  const isAllVolcanicBiomes = presentBiomeIds.size > 0 && Array.from(presentBiomeIds).every(id => VOLCANIC_BIOME_IDS.has(id));
  const isCryoWorld = isAllCryoBiomes || (surfaceTempK !== undefined && surfaceTempK < 215) || solventKey === 'NH3-H2O';

  // 2. Strict evaluation of whether this planet has solid dry land vs. is a global ocean world
  let hasLand = params.hasLand;
  if (hasLand === undefined) {
    if (presentBiomeIds.size > 0) {
      hasLand = Array.from(presentBiomeIds).some(id => SOLID_LAND_BIOME_IDS.has(id));
    } else if (params.coveragePct !== undefined) {
      hasLand = params.coveragePct < 100;
    } else {
      hasLand = true;
    }
  } else if (hasLand && presentBiomeIds.size > 0) {
    // If biomeGrid is provided and has zero solid land biomes (only ocean + floating sea ice), force hasLand to false!
    const hasAnySolidBiome = Array.from(presentBiomeIds).some(id => SOLID_LAND_BIOME_IDS.has(id));
    if (!hasAnySolidBiome) {
      hasLand = false;
    }
  }

  // 3. Strict evaluation of whether this planet has surface liquid oceans / seas
  let hasLiquid = params.hasLiquid;
  if (hasLiquid === undefined) {
    if (presentBiomeIds.size > 0) {
      hasLiquid = Array.from(presentBiomeIds).some(id => WATER_BIOME_IDS.has(id));
    } else if (params.coveragePct !== undefined) {
      hasLiquid = params.coveragePct > 0;
    } else {
      hasLiquid = true;
    }
  }

  const rng = createSeedRng(seed ^ 0x4f19b7d2);
  const bioDescLower = biosphereDescription.toLowerCase();
  const isMulticellular = bioDescLower.includes('multicellular') || 
    (!bioDescLower.includes('unicellular') && !bioDescLower.includes('microbial') && systemAgeGyr >= 2.8);
  const pBar = pressureBar ?? 1.0;
  const g = Math.max(0.15, gravityG);

  // Height scaling: structural physics h ~ (1/g)^0.65
  const heightMultiplier = Math.pow(1.0 / g, 0.65);

  const pigmentInfo = getPigmentRegime(starTeff, solventKey, {
    isCryoWorld,
    surfaceTempK,
  });

  // Structural base polymer depending on solvent, multicellularity, and gravity
  let structuralBase = isMulticellular ? 'Lignified Cellulose' : 'Extracellular Biofilm Matrix & Polysaccharides';
  if (isCryoWorld || solventKey === 'NH3-H2O') {
    structuralBase = isMulticellular
      ? 'Cryo-Proteoglycan & Glycerol-Cellulose Gel'
      : 'Cryo-Proteoglycan Mucilaginous Biofilm';
  } else if (solventKey.toLowerCase().includes('methane') || solventKey.toLowerCase().includes('ethane')) {
    structuralBase = isMulticellular
      ? 'Silica-Sclerotized Polyaromatic Frustules'
      : 'Silica-Frustule Hydrocarbon Biofilms';
  } else if (isAllVolcanicBiomes) {
    structuralBase = isMulticellular
      ? 'Silica-Reinforced Biomineral Matrix'
      : 'Vitreous Mineral Biofilm Crust';
  } else if (isMulticellular && g > 1.6) {
    structuralBase = 'Silica-Reinforced Biomineralized Cellulose';
  }

  // Number of plant species to generate: weighted by evolutionary age and planetary habitability (5 to 20 species)
  const speciesCount = calculateWeightedSpeciesCount({
    systemAgeGyr,
    hasLiquid,
    hasLand,
    solventKey,
    surfaceTempK,
    pressureBar: pBar,
    isMulticellular,
    biosphereDescription,
    presentBiomeCount: presentBiomeIds.size,
    rng,
  });

  // Diversity tier
  let diversityTier: PlanetaryEcosystemSummary['diversityTier'] = 'Developing Flora';
  if (!isMulticellular) {
    diversityTier = 'Microbial Biofilms';
  } else if (speciesCount < 8) {
    diversityTier = 'Pioneer Bryophytes';
  } else if (speciesCount >= 15 && hasLiquid) {
    diversityTier = 'Hyper-Diverse Megabiome';
  }

  const speciesList: XenofloraSpecies[] = [];

  // Archetypes to instantiate
  interface ArchetypeConfig {
    formCategory: 'Tree' | 'Frond' | 'Cushion' | 'Mat' | 'Kelp' | 'Spire';
    growthForm: string;
    habitatType: 'land' | 'aquatic' | 'amphibious';
    baseHeightM: number;
    baseSpreadM: number;
    nativeBiomes: { id: number; name: string }[];
    compatibleBiomeIds: number[];
    reproductionMethod: string;
    fieldNote: (biomes: string) => string;
    adaptations: string[];
  }

  // Unicellular archetypes
  const unicellularArchetypes: ArchetypeConfig[] = [
    // 1. Terrestrial Soil Crust (Land only)
    {
      formCategory: 'Mat',
      growthForm: 'Terrestrial Biological Soil Crust & Algal Mat',
      habitatType: 'land',
      baseHeightM: 0.005,
      baseSpreadM: 6.0,
      nativeBiomes: [
        { id: 5, name: 'Temperate Continental Basin' },
        { id: 4, name: 'Lowland Silicate Plains' },
      ],
      compatibleBiomeIds: [3, 4, 5, 6],
      reproductionMethod: 'Asexual binary fission and windborne desiccation-tolerant micro-cysts',
      fieldNote: (biomes) => `Spreads across exposed plains and regolith in ${biomes} as resilient, drought-tolerant biological soil crusts.`,
      adaptations: [
        'Dormant desiccation-tolerant cysts surviving prolonged dry spells',
        'Regolith grain adhesion trapping microscopic moisture pockets',
        'Direct atmospheric nitrogen fixation enriching barren soil',
      ],
    },
    // 2. Continental Stromatolitic Mat (Land / Intertidal)
    {
      formCategory: 'Mat',
      growthForm: 'Continental Stromatolitic Algal Mat',
      habitatType: 'land',
      baseHeightM: 0.035,
      baseSpreadM: 4.5,
      nativeBiomes: [
        { id: 5, name: 'Temperate Continental Basin' },
        { id: 3, name: 'Coastal Alluvial Basin' },
      ],
      compatibleBiomeIds: [3, 4, 5],
      reproductionMethod: 'Colonial budding and benthic extracellular slime accretion',
      fieldNote: (biomes) => `Forms layered, terraced microbial mats along shallow shores and basins across ${biomes}.`,
      adaptations: [
        'Polysaccharide slime matrices binding sediment into terraced ground crusts',
        'Dense pigment shielding filtering solar ultraviolet radiation',
        'Carbonate mineral precipitation consolidating loose silt into stone',
      ],
    },
    // 3. Endolithic Biofilm (Land only - Arid/Badlands)
    {
      formCategory: 'Cushion',
      growthForm: 'Endolithic Radiotolerant Soil Biofilm',
      habitatType: 'land',
      baseHeightM: 0.002,
      baseSpreadM: 2.8,
      nativeBiomes: [
        { id: 4, name: 'Lowland Silicate Plains' },
        { id: 9, name: 'Arid Steppe / Scrub' },
        { id: 11, name: 'High Plateau / Badlands' },
      ],
      compatibleBiomeIds: [4, 9, 10, 11, 16],
      reproductionMethod: 'Microbial fragmentation and dormant spore dusting',
      fieldNote: (biomes) => `Shelters inside microscopic rock pores and fissures throughout ${biomes}, surviving extreme surface exposure.`,
      adaptations: [
        'Endolithic growth within silicate grains shielding against unbuffered radiation',
        'Extracellular enzyme secretion extracting phosphorus from basaltic rock',
        'Osmotic sugar synthesis buffering rapid daily temperature swings',
      ],
    },
    // 4. Sub-Polar Cryophilic Biofilm (Polar/Tundra)
    {
      formCategory: 'Spire',
      growthForm: 'Sub-Polar Cryophilic Algal Biofilm',
      habitatType: 'amphibious',
      baseHeightM: 0.004,
      baseSpreadM: 3.2,
      nativeBiomes: [
        { id: 8, name: 'Polar Glacial Ice' },
        { id: 7, name: 'Tundra / Permafrost' },
        { id: 6, name: 'High-Latitude Rocky Steppe' },
      ],
      compatibleBiomeIds: [6, 7, 8, 13, 18, 21],
      reproductionMethod: 'Cryo-dormant spore encapsulation in permafrost pores',
      fieldNote: (biomes) => `Cold-active microbial film colonizing snowpack, ice sheets, and permafrost in ${biomes}.`,
      adaptations: [
        'Cellular glycerol antifreeze preventing internal ice crystallization',
        'Sub-zero photosynthesis utilizing microscopic brine channels within ice',
        'Dark surface pigments absorbing solar thermal radiation to melt surrounding ice',
      ],
    },
    // 5. Cryotectonic Nitrogen-Ice Extremophile Biofilm (Cryo worlds: 18, 21)
    {
      formCategory: 'Mat',
      growthForm: 'Cryotectonic Nitrogen-Ice Extremophile Biofilm',
      habitatType: 'land',
      baseHeightM: 0.003,
      baseSpreadM: 5.5,
      nativeBiomes: [
        { id: 18, name: 'Cryovolcanic Nitrogen Plains' },
        { id: 21, name: 'Cryotectonic Ice Fissure (Linea)' },
      ],
      compatibleBiomeIds: [18, 21, 8, 7, 13],
      reproductionMethod: 'Sub-surface cryo-dormant cysts expanding along tectonic fracture fissures',
      fieldNote: (biomes) => `Cryogenic microbial mat encrusting frozen nitrogen plains and tectonic linea fractures across ${biomes}.`,
      adaptations: [
        'Metabolism active down to 75 Kelvin utilizing cryogenic solvent eutectic mixtures',
        'Dense purplish-teal pyrrole complexes harvesting faint reflected solar photons',
        'Flexible liposome membranes remaining fluid in supercooled liquid nitrogen',
      ],
    },
    // 6. Volcanic Fumarole Pyritic Biofilm (Volcanic worlds: 14, 15, 22)
    {
      formCategory: 'Cushion',
      growthForm: 'Volcanic Fumarole Chemotrophic Biofilm',
      habitatType: 'land',
      baseHeightM: 0.006,
      baseSpreadM: 2.2,
      nativeBiomes: [
        { id: 15, name: 'Active Lava Caldera & Fissure' },
        { id: 22, name: 'Active Volcanic Shield & Lava Caldera' },
      ],
      compatibleBiomeIds: [14, 15, 22],
      reproductionMethod: 'Thermal convective spore dusting propelled by volcanic vent plumes',
      fieldNote: (biomes) => `Chemosynthetic crust coating scalding basalt and sulfur fumaroles in ${biomes}.`,
      adaptations: [
        'Hyperthermophilic enzymes functional up to 410 Kelvin in sulfurous vents',
        'Chemosynthetic sulfur oxidation generating metabolic energy independent of sunlight',
        'Acid-neutralizing mineral shell shielding colonies from caustic volcanic fumes',
      ],
    },
    // 7. Pelagic Marine Micro-Algae (Aquatic only)
    {
      formCategory: 'Kelp',
      growthForm: 'Pelagic Marine Micro-Algal Bloom',
      habitatType: 'aquatic',
      baseHeightM: 0.001,
      baseSpreadM: 18.0,
      nativeBiomes: [
        { id: 23, name: 'Algal Sea' },
        { id: 1, name: 'Deep Ocean' },
        { id: 2, name: 'Continental Shelf / Shallows' },
      ],
      compatibleBiomeIds: [0, 1, 2, 17, 23],
      reproductionMethod: 'Exponential asexual division in photic surface waters',
      fieldNote: (biomes) => `Free-floating micro-algae blooming in vast surface slicks across photic waters in ${biomes}.`,
      adaptations: [
        'Adjustable gas vacuoles regulating buoyancy within the photic zone',
        'Protective silica frustule shells resisting hydrodynamic shearing',
        'Bioluminescent flash responses deterring nocturnal micro-grazers',
      ],
    },
    // 8. Coastal Cyanobacterial Mat (Aquatic / Coast)
    {
      formCategory: 'Mat',
      growthForm: 'Estuarine Coastal Cyanobacterial Mat',
      habitatType: 'aquatic',
      baseHeightM: 0.015,
      baseSpreadM: 5.0,
      nativeBiomes: [
        { id: 2, name: 'Continental Shelf / Shallows' },
        { id: 1, name: 'Deep Ocean' },
      ],
      compatibleBiomeIds: [1, 2, 3, 23],
      reproductionMethod: 'Horizontal gliding trichome filaments across intertidal silt',
      fieldNote: (biomes) => `Fibrous microbial mat binding tidal silt and shallow shoals across ${biomes}.`,
      adaptations: [
        'Mucilage sheaths buffering extreme salinity shifts across tidal cycles',
        'Dynamic pigment migration adapting to changing water depths',
        'Facultative anoxygenic metabolism when buried under storm silt',
      ],
    },
    // 9. Floating Neuston Biofilm Sheet (Aquatic only - open ocean)
    {
      formCategory: 'Mat',
      growthForm: 'Pelagic Floating Neuston Biofilm Sheet',
      habitatType: 'aquatic',
      baseHeightM: 0.002,
      baseSpreadM: 12.0,
      nativeBiomes: [
        { id: 1, name: 'Deep Ocean' },
        { id: 23, name: 'Algal Sea' },
      ],
      compatibleBiomeIds: [1, 2, 23],
      reproductionMethod: 'Surface surfactant budding propelled across pelagic wave crests',
      fieldNote: (biomes) => `Forms iridescent lipid biofilm slicks across open ocean currents in ${biomes}.`,
      adaptations: [
        'Hydrophobic lipid matrix keeping cell colonies floating on surface water tension',
        'UV-quenching carotenoid shields protecting against unshielded pelagic sun',
        'Direct uptake of atmospheric aerosols and dissolved ocean nutrients',
      ],
    },
    // 10. Abyssal Chemotrophic Biofilm (Aquatic only - ocean depths)
    {
      formCategory: 'Cushion',
      growthForm: 'Abyssal Chemotrophic Biofilm Crust',
      habitatType: 'aquatic',
      baseHeightM: 0.008,
      baseSpreadM: 3.5,
      nativeBiomes: [
        { id: 0, name: 'Abyssal Trench' },
        { id: 1, name: 'Deep Ocean' },
      ],
      compatibleBiomeIds: [0, 1, 17],
      reproductionMethod: 'Sub-sea mineral spore dispersal along seafloor hydrothermal currents',
      fieldNote: (biomes) => `Chemosynthetic crust coating abyssal seabed basalt and hydrothermal rifts across ${biomes}.`,
      adaptations: [
        'Chemosynthetic sulfur oxidation generating metabolic energy in total darkness',
        'Piezophilic cell membranes functioning under thousands of atmospheres of pressure',
        'Metallic ion precipitation binding volcanic minerals into protective biofilms',
      ],
    },
    // 11. Pelagic Noctilucent Dinoflagellate Swarm (Aquatic: 1, 23)
    {
      formCategory: 'Spire',
      growthForm: 'Pelagic Noctilucent Dinoflagellate Swarm',
      habitatType: 'aquatic',
      baseHeightM: 0.001,
      baseSpreadM: 20.0,
      nativeBiomes: [
        { id: 23, name: 'Algal Sea' },
        { id: 1, name: 'Deep Ocean' },
      ],
      compatibleBiomeIds: [1, 2, 23],
      reproductionMethod: 'Diurnal vertical migration and binary fission blooms in warm epipelagic currents',
      fieldNote: (biomes) => `Bioluminescent micro-flagellates flashing under tidal turbulence across ${biomes}.`,
      adaptations: [
        'Luciferin flash deterrence startling nocturnal planktivorous micro-grazers',
        'Positive phototaxis flagellar motors positioning cells at optimal light depths',
        'Carotenoid-dense lipid stores protecting nuclear DNA from solar ultraviolet rays',
      ],
    },
    // 12. Benthic Siliceous Diatomaceous Film (Aquatic: 1, 2, 23)
    {
      formCategory: 'Mat',
      growthForm: 'Benthic Siliceous Diatomaceous Film',
      habitatType: 'aquatic',
      baseHeightM: 0.003,
      baseSpreadM: 8.0,
      nativeBiomes: [
        { id: 2, name: 'Continental Shelf / Shallows' },
        { id: 1, name: 'Deep Ocean' },
      ],
      compatibleBiomeIds: [1, 2, 23],
      reproductionMethod: 'Auxospore enlargement and benthic siliceous frustule division',
      fieldNote: (biomes) => `Golden-amber micro-algal film coating shallow seabed mineral sands in ${biomes}.`,
      adaptations: [
        'Nanostructured porous silica shells providing structural resilience under bottom currents',
        'Gliding motility along secreted polysaccharide tracks to avoid burial by sediment',
        'Broad-spectrum antenna pigments maximizing photon capture in murky water',
      ],
    },
    // 13. Sub-Ice Cryophilic Phytoplankton Plume (Polar/Sub-Ice: 1, 8, 23)
    {
      formCategory: 'Mat',
      growthForm: 'Sub-Ice Cryophilic Phytoplankton Plume',
      habitatType: 'aquatic',
      baseHeightM: 0.002,
      baseSpreadM: 14.0,
      nativeBiomes: [
        { id: 8, name: 'Polar Glacial Ice' },
        { id: 1, name: 'Deep Ocean' },
      ],
      compatibleBiomeIds: [1, 8, 23],
      reproductionMethod: 'Cryo-dormant spore plumes liberated along melting ice shelf margins',
      fieldNote: (biomes) => `Cold-hardy algal sheets adhering to submerged pack ice and polar ocean currents in ${biomes}.`,
      adaptations: [
        'Thermal hysteresis antifreeze proteins preventing ice crystallization inside cell walls',
        'Polyunsaturated fatty-acid membrane adaptations maintaining fluidity at 265 Kelvin',
        'Deep far-red harvesting pigments capturing faint light penetrating thick ice sheets',
      ],
    },
    // 14. Deep Seafloor Hydrothermal Vent Biofilm (Abyssal/Volcanic: 0, 1, 14, 15)
    {
      formCategory: 'Cushion',
      growthForm: 'Deep Seafloor Hydrothermal Vent Biofilm',
      habitatType: 'aquatic',
      baseHeightM: 0.012,
      baseSpreadM: 2.2,
      nativeBiomes: [
        { id: 0, name: 'Abyssal Trench' },
        { id: 14, name: 'Active Volcanic Caldera' },
      ],
      compatibleBiomeIds: [0, 1, 14, 15],
      reproductionMethod: 'Thermal buoyant plume dispersal along seafloor hydrothermal circulation',
      fieldNote: (biomes) => `Chemosynthetic microbial carpets encrusting superheated mineral chimneys in ${biomes}.`,
      adaptations: [
        'Thermostable sulfur-oxidizing enzymes active up to 390 Kelvin near hydrothermal orifices',
        'Heavy metal precipitation into insoluble mineral matrices preventing cellular toxicity',
        'Chemoautotrophic ATP generation powered by dissolved volcanic hydrogen-sulfide',
      ],
    },
    // 15. Intertidal Halophilic Carotenoid Crust (Amphibious/Coast: 2, 3, 22)
    {
      formCategory: 'Mat',
      growthForm: 'Intertidal Halophilic Carotenoid Crust',
      habitatType: 'amphibious',
      baseHeightM: 0.006,
      baseSpreadM: 4.5,
      nativeBiomes: [
        { id: 3, name: 'Coastal Alluvial Basin' },
        { id: 2, name: 'Continental Shelf / Shallows' },
      ],
      compatibleBiomeIds: [2, 3, 22],
      reproductionMethod: 'Tidal wash spore dispersal and mucilage sheath expansion',
      fieldNote: (biomes) => `Vibrant crimson-orange microbial crust binding hypersaline tidal flats and lagoons in ${biomes}.`,
      adaptations: [
        'High bacteriorhodopsin and carotenoid pigments shielding against solar ultraviolet glare',
        'Osmolyte trehalose accumulation buffering cells against fluctuating marine salinity',
        'Desiccation-resistant spore sheets surviving complete low-tide sun-baking',
      ],
    },
    // 16. Cryogenic Liquid Methane Micro-Bloom (Hydrocarbon Seas: 17, 1, 23)
    {
      formCategory: 'Mat',
      growthForm: 'Cryogenic Liquid Methane Micro-Bloom',
      habitatType: 'aquatic',
      baseHeightM: 0.002,
      baseSpreadM: 10.0,
      nativeBiomes: [
        { id: 17, name: 'Hydrocarbon Methane Sea' },
      ],
      compatibleBiomeIds: [17, 1, 23],
      reproductionMethod: 'Athermal hydrocarbon budding along methane sea thermoclines',
      fieldNote: (biomes) => `Non-aqueous photosynthetic blooms drifting through supercooled hydrocarbon oceans in ${biomes}.`,
      adaptations: [
        'Non-polar hydrocarbon-stable liposomes resisting dissolution in liquid methane',
        'Silica frustule buoyancy regulation keeping colonies in the photic epipelagic zone',
        'Deep infrared absorption complexes tuned to dim far-red twilight illumination',
      ],
    },
  ];

  // Multicellular complex plant archetypes
  const multicellularArchetypes: ArchetypeConfig[] = [
    // 1. Dominant Arboreal / High Canopy Tree (Temperate Land only: 4, 5, 12)
    {
      formCategory: 'Tree',
      growthForm: g < 0.6 ? 'Towering Low-Gravity Mega-Canopy' : g > 1.4 ? 'Buttressed Ground-Hug Canopy' : 'Arborescent Vascular Canopy Tree',
      habitatType: 'land',
      baseHeightM: g < 0.6 ? 48.0 : g > 1.4 ? 4.2 : 22.0,
      baseSpreadM: g < 0.6 ? 16.0 : g > 1.4 ? 7.5 : 9.0,
      nativeBiomes: [
        { id: 4, name: 'Lowland Silicate Plains' },
        { id: 5, name: 'Temperate Continental Basin' },
      ],
      compatibleBiomeIds: [3, 4, 5, 12],
      reproductionMethod: pBar > 2.5 
        ? 'Buoyant aeroplanktonic seed-balloons riding dense air currents' 
        : pBar < 0.4 
        ? 'Explosive ballistic dehiscence launching hardened seed-casings' 
        : 'Hydro-pneumatic spore capsules dispersed on seasonal trade winds',
      fieldNote: (biomes) => `Forms expansive forest canopies across ${biomes}, supporting heavy upper foliage with deep anchoring root networks.`,
      adaptations: [
        g > 1.2
          ? 'Broad buttressed base and dense fibrous stipe supporting high lateral load'
          : g < 0.7
          ? 'Slender, towering trunk architecture taking advantage of low gravity'
          : 'Thick fibrous trunk buttressing supporting heavy upper canopy boughs',
        'Layered horizontal foliage tiers maximizing diffuse light capture',
        pBar > 2.0
          ? 'Aerodynamic cuticular flutes resisting dense atmospheric wind shear'
          : 'Waxy outer cuticle minimizing transpiration moisture loss',
      ],
    },
    // 2. Understory Frond / Shrub (Temperate Land only: 3, 4, 5, 6)
    {
      formCategory: 'Frond',
      growthForm: 'Broadleaf Siphon-Frond Understory Shrub',
      habitatType: 'land',
      baseHeightM: 2.8,
      baseSpreadM: 2.2,
      nativeBiomes: [
        { id: 4, name: 'Lowland Silicate Plains' },
        { id: 5, name: 'Temperate Continental Basin' },
        { id: 3, name: 'Coastal Alluvial Basin' },
      ],
      compatibleBiomeIds: [3, 4, 5, 6],
      reproductionMethod: 'Hydraulic siphon-gametes released in riparian humidity',
      fieldNote: (biomes) => `A shade-tolerant understory shrub widespread in ${biomes}, colonizing forest floors through creeping root systems.`,
      adaptations: [
        'Broad, high-surface-area fronds capturing filtered understory light',
        'Subterranean rhizome network sharing water and nutrients across colonies',
        'Bio-synthetic alkaloids protecting tender foliage from micro-herbivores',
      ],
    },
    // 3. Resilient Ground Cover / Succulent Cushion (Arid: 9, 10, 11, 16)
    {
      formCategory: 'Cushion',
      growthForm: 'Succulent Cushion-Dome Lithophyte',
      habitatType: 'land',
      baseHeightM: 0.45,
      baseSpreadM: 1.8,
      nativeBiomes: [
        { id: 9, name: 'Arid Steppe / Scrub' },
        { id: 11, name: 'High Plateau / Badlands' },
        { id: 10, name: 'Hyper-Arid Dunes / Desert' },
      ],
      compatibleBiomeIds: [9, 10, 11, 16],
      reproductionMethod: 'Creeping clonal runners with subterranean nutrient corms',
      fieldNote: (biomes) => `Compact, dome-shaped succulent thriving on rocky outcrops and arid plains in ${biomes}.`,
      adaptations: [
        'Geometric cushion dome minimizing thermal stress and moisture loss',
        'Acid-secreting root hairs extracting mineral nutrients from silicate bedrock',
        'Internal water-storage tissue maintaining turgor through extended droughts',
      ],
    },
    // 4. Boreal / Cold Plateau Needle-Fern (Sub-Polar/Alpine: 6, 7, 12, 13)
    {
      formCategory: 'Spire',
      growthForm: 'Spire Needle-Fern / Columnar Autotroph',
      habitatType: 'land',
      baseHeightM: 11.0,
      baseSpreadM: 2.8,
      nativeBiomes: [
        { id: 6, name: 'High-Latitude Rocky Steppe' },
        { id: 7, name: 'Tundra / Permafrost' },
      ],
      compatibleBiomeIds: [6, 7, 12, 13],
      reproductionMethod: 'Hardened cryo-dormant spore nodules buried in permafrost',
      fieldNote: (biomes) => `Tall columnar autotroph inhabiting cold taiga and permafrost in ${biomes}, built to shed heavy precipitation.`,
      adaptations: [
        'Glycerol-based antifreeze metabolites preventing intra-cellular ice damage',
        'Narrow spire silhouette shedding accumulated snow and frozen precipitation',
        'Resin-coated needle cuticle resisting frostbite and drying winds',
      ],
    },
    // 5. Pioneer Mat Lichen (Badlands / Regolith: 6, 9, 11, 16)
    {
      formCategory: 'Mat',
      growthForm: 'Symbiotic Crust-Lichen & Biofilm Carpet',
      habitatType: 'land',
      baseHeightM: 0.08,
      baseSpreadM: 3.5,
      nativeBiomes: [
        { id: 16, name: 'Regolith Impact Craterlands' },
        { id: 6, name: 'High-Latitude Rocky Steppe' },
        { id: 11, name: 'High Plateau / Badlands' },
      ],
      compatibleBiomeIds: [6, 9, 11, 16],
      reproductionMethod: 'Direct fragmentation and desiccated windborne soredia dust',
      fieldNote: (biomes) => `Resilient ground-hugging lichen carpeting exposed rock and regolith in ${biomes}, establishing early organic soil.`,
      adaptations: [
        'Radiation-repair enzymes buffering intense solar and cosmic radiation',
        'Anhydrobiotic dormancy allowing decades-long survival in drought conditions',
        'Direct atmospheric moisture adsorption without requiring liquid surface water',
      ],
    },
    // 6. Coastal / Marine Pelagic Kelp (Aquatic: 1, 2, 23)
    {
      formCategory: 'Kelp',
      growthForm: 'Pelagic Marine Siphon-Kelp Reef',
      habitatType: 'aquatic',
      baseHeightM: 18.0,
      baseSpreadM: 6.0,
      nativeBiomes: [
        { id: 2, name: 'Continental Shelf / Shallows' },
        { id: 23, name: 'Algal Sea' },
        { id: 1, name: 'Deep Ocean' },
      ],
      compatibleBiomeIds: [1, 2, 23],
      reproductionMethod: 'Bioluminescent flagellated gametes released during planetary spring tides',
      fieldNote: (biomes) => `Large submerged kelp forming dense floating meadows and coastal reefs throughout ${biomes}.`,
      adaptations: [
        'Internal gas bladders keeping photosynthetic fronds buoyant in surface waters',
        'Elastic hydraulic stipe dissipating high-energy coastal wave turbulence',
        'Active cellular filtration concentrating trace dissolved minerals from seawater',
      ],
    },
    // 7. Floating Sargassum-like Pelagic Raft (Aquatic: 1, 2, 23)
    {
      formCategory: 'Mat',
      growthForm: 'Pelagic Floating Kelp-Raft & Surface Canopy',
      habitatType: 'aquatic',
      baseHeightM: 0.8,
      baseSpreadM: 14.0,
      nativeBiomes: [
        { id: 1, name: 'Deep Ocean' },
        { id: 23, name: 'Algal Sea' },
        { id: 2, name: 'Continental Shelf / Shallows' },
      ],
      compatibleBiomeIds: [1, 2, 23],
      reproductionMethod: 'Vegetative thallus fragmentation drifting along global ocean gyres',
      fieldNote: (biomes) => `Expansive free-floating macro-algal rafts drifting across open ocean gyres in ${biomes}, forming floating canopy ecosystems.`,
      adaptations: [
        'Pneumatic lipid-vacuole rafts maintaining vast surface canopies on open seas',
        'Intertwined branching thalli resisting oceanic shear and storm swells',
        'Foliar salt-excretion pores preventing mineral crust crystallization',
      ],
    },
    // 8. Abyssal Hydrothermal Vent Chemotroph (Aquatic Abyssal: 0, 1)
    {
      formCategory: 'Spire',
      growthForm: 'Abyssal Chalcogenide Chimney-Lichen',
      habitatType: 'aquatic',
      baseHeightM: 3.2,
      baseSpreadM: 1.1,
      nativeBiomes: [
        { id: 0, name: 'Abyssal Trench' },
        { id: 1, name: 'Deep Ocean' },
      ],
      compatibleBiomeIds: [0, 1],
      reproductionMethod: 'Thermal plume convective spore dispersers triggering along rift fissures',
      fieldNote: (biomes) => `Mineralized chimney autotroph colonizing seafloor hydrothermal vents and tectonic rifts in ${biomes}.`,
      adaptations: [
        'Chemosynthetic sulfur and iron oxidation producing metabolic energy in pitch blackness',
        'Thermophilic proteins stable in superheated vent effluent',
        'Heavy pyritic mineral sleeve withstanding crushing abyssal hydrostatic pressure',
      ],
    },
    // 9. Floating Tendril-Ribbon Hydrophyte (Aquatic: 1, 2, 23)
    {
      formCategory: 'Kelp',
      growthForm: 'Pelagic Tendril-Ribbon Hydrophyte',
      habitatType: 'aquatic',
      baseHeightM: 28.0,
      baseSpreadM: 4.5,
      nativeBiomes: [
        { id: 1, name: 'Deep Ocean' },
        { id: 2, name: 'Continental Shelf / Shallows' },
      ],
      compatibleBiomeIds: [1, 2, 23],
      reproductionMethod: 'Pelagic zoospore swarms drifting on deep photic currents',
      fieldNote: (biomes) => `Immense trailing ribbons floating through oceanic photic currents in ${biomes}, trailing dozens of meters below the surface.`,
      adaptations: [
        'Ultra-flexible collagenous stipes trailing in ocean currents without snapping',
        'Bioluminescent warning flashes deterring deep pelagic herbivores',
        'High-efficiency diffuse blue-green light harvesting in deep photic layers',
      ],
    },
    // 10. Sub-Ice Cryophilic Hanging Frond (Aquatic / Ice shelf: 8, 1, 2, 21)
    {
      formCategory: 'Frond',
      growthForm: 'Sub-Ice Cryophilic Hanging Frond',
      habitatType: 'aquatic',
      baseHeightM: 2.4,
      baseSpreadM: 3.0,
      nativeBiomes: [
        { id: 8, name: 'Polar Glacial Ice' },
        { id: 2, name: 'Continental Shelf / Shallows' },
        { id: 1, name: 'Deep Ocean' },
      ],
      compatibleBiomeIds: [8, 1, 2, 21],
      reproductionMethod: 'Sub-ice micro-spores carried on frigid sub-glacial currents',
      fieldNote: (biomes) => `Inverted photosynthetic frond anchoring to the underside of polar sea ice and ice shelves in ${biomes}.`,
      adaptations: [
        'Holdfast organ anchoring directly into sub-ice micro-brine channels',
        'Concentrated polyol and glycerol sap preventing tissue freeze-lysis',
        'Extremely sensitive low-light pigments capturing weak solar rays filtered through sea ice',
      ],
    },
    // 11. Pelagic Floating Bulb-Cushion (Aquatic: 1, 2, 23)
    {
      formCategory: 'Cushion',
      growthForm: 'Pelagic Floating Bulb-Cushion',
      habitatType: 'aquatic',
      baseHeightM: 0.6,
      baseSpreadM: 1.8,
      nativeBiomes: [
        { id: 23, name: 'Algal Sea' },
        { id: 2, name: 'Continental Shelf / Shallows' },
        { id: 1, name: 'Deep Ocean' },
      ],
      compatibleBiomeIds: [1, 2, 23],
      reproductionMethod: 'Budding buoyant daughter spherules detached by surface wave action',
      fieldNote: (biomes) => `Buoyant globular colonies clustering into floating mats across tropical surface currents in ${biomes}.`,
      adaptations: [
        'Cellular hydrocarbon-filled chambers providing persistent surface buoyancy',
        'Hydrophobic outer membrane shedding excess water to maximize sunlight exposure',
        'Symbiotic nitrogen-fixing bacteria embedded in internal fibrous chambers',
      ],
    },
    // 12. Benthic Marine Siphon-Fan (Aquatic: 1, 2, 23)
    {
      formCategory: 'Frond',
      growthForm: 'Benthic Marine Siphon-Fan',
      habitatType: 'aquatic',
      baseHeightM: 3.5,
      baseSpreadM: 2.8,
      nativeBiomes: [
        { id: 2, name: 'Continental Shelf / Shallows' },
        { id: 23, name: 'Algal Sea' },
        { id: 1, name: 'Deep Ocean' },
      ],
      compatibleBiomeIds: [1, 2, 23],
      reproductionMethod: 'Planktonic flagellated gametes released during planetary spring tides',
      fieldNote: (biomes) => `Fan-shaped benthic autotroph anchored to submerged rocks and continental shallows across ${biomes}.`,
      adaptations: [
        'Perforated flabellum blade allowing tidal water flow without detachment',
        'Calcified base anchoring securely into marine bedrock and reefs',
        'Elastic siphon tubules channeling nutrient-rich bottom currents',
      ],
    },
    // 13. Wetland Alluvial Mangrove / Siphon-Reef (Amphibious: 2, 3)
    {
      formCategory: 'Frond',
      growthForm: 'Alluvial Stilt-Frond & Pneumatophore Shrub',
      habitatType: 'amphibious',
      baseHeightM: 5.5,
      baseSpreadM: 4.0,
      nativeBiomes: [
        { id: 3, name: 'Coastal Alluvial Basin' },
        { id: 2, name: 'Continental Shelf / Shallows' },
      ],
      compatibleBiomeIds: [2, 3],
      reproductionMethod: 'Viviparous hydrochorous propagules drifting on estuary tides',
      fieldNote: (biomes) => `Stilt-rooted shoreline shrub stabilizing tidal mudflats and coastal estuaries in ${biomes}.`,
      adaptations: [
        'Aerial breathing roots (pneumatophores) exchanging gases above waterlogged mud',
        'Foliar salt-excretion glands purging excess minerals',
        'Interlocking stilt-root matrix preventing shoreline sediment erosion',
      ],
    },
    // 14. Volcanic Caldera Chemosynthetic Spire (Volcanic: 14, 15, 22)
    {
      formCategory: 'Spire',
      growthForm: 'Chemosynthetic Chalcogenide Chimney-Lichen',
      habitatType: 'land',
      baseHeightM: 1.4,
      baseSpreadM: 0.9,
      nativeBiomes: [
        { id: 14, name: 'Basalt Volcanic Crust' },
        { id: 15, name: 'Active Lava Caldera & Fissure' },
        { id: 22, name: 'Active Volcanic Shield & Lava Caldera' },
      ],
      compatibleBiomeIds: [14, 15, 22],
      reproductionMethod: 'Thermal plume convective spore dispersers triggering upon basalt fracturing',
      fieldNote: (biomes) => `Chemosynthetic spire growing directly around geothermal vents and volcanic fissures in ${biomes}.`,
      adaptations: [
        'Thermophilic chaperone proteins remaining stable up to 395 Kelvin',
        'Chemosynthetic sulfur oxidation producing metabolic energy without light',
        'Vitreous silica outer sleeve shielding tissues from acidic volcanic fumes',
      ],
    },
    // 15. Cryotectonic Ice-Frond Lithophyte (Cryo: 18, 21, 8, 7, 13)
    {
      formCategory: 'Frond',
      growthForm: 'Cryotectonic Ice-Fissure Siphon-Frond',
      habitatType: 'land',
      baseHeightM: 1.8,
      baseSpreadM: 2.4,
      nativeBiomes: [
        { id: 21, name: 'Cryotectonic Ice Fissure (Linea)' },
        { id: 18, name: 'Cryovolcanic Nitrogen Plains' },
      ],
      compatibleBiomeIds: [18, 21, 8, 7, 13],
      reproductionMethod: 'Sub-ice cryo-spore extrusion along tectonic stress lines',
      fieldNote: (biomes) => `Anchors deep within frozen cryotectonic chasms across ${biomes}, tapping trace sub-surface geothermal vapor.`,
      adaptations: [
        'Concentrated glycerol-trehalose antifreeze sap remaining fluid at 80 Kelvin',
        'High-tensile fibrous holdfasts locking into cryogenic ice fissures',
        'Low-albedo purplish-teal foliage absorbing diffuse infrared thermal radiation from sub-surface vents',
      ],
    },
    // 16. Nitrogen-Plains Cryo-Cushion (Cryo: 18, 21, 8, 7, 13)
    {
      formCategory: 'Cushion',
      growthForm: 'Nitrogen-Pore Cryo-Succulent Cushion',
      habitatType: 'land',
      baseHeightM: 0.35,
      baseSpreadM: 1.6,
      nativeBiomes: [
        { id: 18, name: 'Cryovolcanic Nitrogen Plains' },
        { id: 8, name: 'Polar Glacial Ice' },
      ],
      compatibleBiomeIds: [18, 21, 8, 7, 13],
      reproductionMethod: 'Desiccated nitrogen-frost resistant cysts dispersed on cryo-wind updrafts',
      fieldNote: (biomes) => `Forms dense, frost-tolerant succulent domes across cryogenic plains in ${biomes}, insulated by micro-cellular gas pockets.`,
      adaptations: [
        'Cellular nitrogen-gas insulating chambers preventing core freeze-fracture',
        'Osmotic cryo-protectants maintaining membrane flexibility in liquid nitrogen',
        'Silica-reinforced exterior crust shedding drifting nitrogen snow',
      ],
    },
    // 17. Sub-Zero Glacial Siphon-Spire (Cryo: 18, 21, 8, 13)
    {
      formCategory: 'Spire',
      growthForm: 'Glacial Sublimation Siphon-Spire',
      habitatType: 'land',
      baseHeightM: 5.2,
      baseSpreadM: 1.2,
      nativeBiomes: [
        { id: 18, name: 'Cryovolcanic Nitrogen Plains' },
        { id: 13, name: 'Alpine Glacial Peaks' },
      ],
      compatibleBiomeIds: [18, 21, 8, 13],
      reproductionMethod: 'Sublimation-triggered spore ejection propelled by expanding sub-ice gases',
      fieldNote: (biomes) => `Erect crystalline spire capturing ambient atmospheric sublimation vapors across frigid plains in ${biomes}.`,
      adaptations: [
        'Vitreous mineral flutes channeling ambient geothermal sublimation vapors',
        'Internal counter-current heat exchangers retaining central stalk warmth',
        'Hexagonal ice-crystal shedding architecture preventing structural collapse',
      ],
    },
    // 18. Cryogenic Thallus-Mat (Cryo: 18, 21, 8, 7, 13)
    {
      formCategory: 'Mat',
      growthForm: 'Cryogenic Nitrogen-Frost Crust-Lichen',
      habitatType: 'land',
      baseHeightM: 0.04,
      baseSpreadM: 4.8,
      nativeBiomes: [
        { id: 18, name: 'Cryovolcanic Nitrogen Plains' },
        { id: 21, name: 'Cryotectonic Ice Fissure (Linea)' },
      ],
      compatibleBiomeIds: [18, 21, 8, 7, 13],
      reproductionMethod: 'Cryo-fragmentation and drifting thallus scale dispersal',
      fieldNote: (biomes) => `Sprawling cryophilic lichen thallus encrusting nitrogen ice and fracture margins across ${biomes}.`,
      adaptations: [
        'Symbiotic cold-active algae and fungal hyphae sharing metabolic antifreeze',
        'Direct uptake of sublimating nitrogen and methane vapors',
        'Micro-adhesion thalli etching directly into solid water-ice bedrock',
      ],
    },
    // 19. Creeping Tundra Permafrost-Frond (Cryo/Sub-polar: 6, 7, 8, 13, 18, 21)
    {
      formCategory: 'Frond',
      growthForm: 'Creeping Tundra Permafrost-Frond',
      habitatType: 'land',
      baseHeightM: 0.75,
      baseSpreadM: 1.9,
      nativeBiomes: [
        { id: 7, name: 'Tundra / Permafrost' },
        { id: 6, name: 'High-Latitude Rocky Steppe' },
      ],
      compatibleBiomeIds: [6, 7, 8, 13, 18, 21],
      reproductionMethod: 'Subterranean permafrost runner rhizomes and cryogenic seeds',
      fieldNote: (biomes) => `Low-creeping woody shrub anchoring into frozen permafrost across ${biomes}, resisting severe glacial winds.`,
      adaptations: [
        'Prostrate mat growth habit hugging the ground beneath howling sub-zero blizzards',
        'Deep anchor taproots locking into permanently frozen ground',
        'Hairy cuticular pubescence trapping an insulating layer of still air',
      ],
    },
    // 20. Vitreous Basalt Cushion-Lithophyte (Volcanic: 14, 15, 22)
    {
      formCategory: 'Cushion',
      growthForm: 'Vitreous Basalt Cushion-Lithophyte',
      habitatType: 'land',
      baseHeightM: 0.4,
      baseSpreadM: 1.2,
      nativeBiomes: [
        { id: 14, name: 'Basalt Volcanic Crust' },
        { id: 22, name: 'Active Volcanic Shield & Lava Caldera' },
      ],
      compatibleBiomeIds: [14, 15, 22],
      reproductionMethod: 'Pyrophytic thermal spore pods bursting when exposed to lava radiant heat',
      fieldNote: (biomes) => `Heat-tolerant mineralized cushion adhering to warm basaltic volcanic rock in ${biomes}.`,
      adaptations: [
        'Heat-shock chaperone proteins preventing protein denaturation up to 385 Kelvin',
        'Fused silicate dermal scales deflecting falling volcanic cinders',
        'Direct chemosynthetic assimilation of volcanic mineral leachate',
      ],
    },
    // 21. Pyritic Caldera Vapor-Spire (Volcanic: 14, 15, 22)
    {
      formCategory: 'Spire',
      growthForm: 'Pyritic Caldera Vapor-Spire',
      habitatType: 'land',
      baseHeightM: 4.0,
      baseSpreadM: 1.0,
      nativeBiomes: [
        { id: 15, name: 'Active Lava Caldera & Fissure' },
        { id: 22, name: 'Active Volcanic Shield & Lava Caldera' },
      ],
      compatibleBiomeIds: [14, 15, 22],
      reproductionMethod: 'Convective gas plume spore dispersal along active caldera vents',
      fieldNote: (biomes) => `Towering mineralized chimney harvesting sulfurous volcanic exhalations around active calderas in ${biomes}.`,
      adaptations: [
        'Heavy pyrite and sulfur mineral sheath resisting boiling volcanic steam',
        'Endolithic vascular tubules filtering hydrogen sulfide from caldera vents',
        'Thermal gradient harvesting converting heat differentials into metabolic energy',
      ],
    },
    // 22. Pyrophytic Basalt Ash-Fern (Volcanic: 14, 15, 22)
    {
      formCategory: 'Frond',
      growthForm: 'Pyrophytic Basalt Ash-Fern',
      habitatType: 'land',
      baseHeightM: 1.6,
      baseSpreadM: 1.5,
      nativeBiomes: [
        { id: 14, name: 'Basalt Volcanic Crust' },
        { id: 22, name: 'Active Volcanic Shield & Lava Caldera' },
      ],
      compatibleBiomeIds: [14, 15, 22],
      reproductionMethod: 'Heat-resistant dust spores rooting rapidly in fresh volcanic tephra',
      fieldNote: (biomes) => `Rapidly colonizes fresh mineral tephra and basaltic lava crusts in ${biomes}.`,
      adaptations: [
        'Silica-reinforced stipes standing erect in scorching volcanic ashfalls',
        'Rapid-germination root runners binding loose volcanic tephra into soil',
        'Acid-neutralizing sap buffering high sulfur dioxide levels',
      ],
    },
    // 23. Columnar Taproot Desert Spire (Arid: 9, 10, 11, 16)
    {
      formCategory: 'Spire',
      growthForm: 'Columnar Taproot Desert Spire',
      habitatType: 'land',
      baseHeightM: 7.5,
      baseSpreadM: 1.5,
      nativeBiomes: [
        { id: 10, name: 'Hyper-Arid Dunes / Desert' },
        { id: 9, name: 'Arid Steppe / Scrub' },
      ],
      compatibleBiomeIds: [9, 10, 11, 16],
      reproductionMethod: 'Windblown winged desert seeds carried on high thermal updrafts',
      fieldNote: (biomes) => `Towering succulent spire drilling deep taproots into arid bedrock throughout ${biomes}.`,
      adaptations: [
        'Vertical fluted column minimizing direct midday solar exposure',
        'Subterranean taproot drilling tens of meters to reach deep groundwater aquifers',
        'Dense mucilaginous water storage core buffering multi-year hyper-arid droughts',
      ],
    },
    // 24. Silicate Impact-Glass Litho-Mat (Arid/Craterlands: 9, 10, 11, 16)
    {
      formCategory: 'Mat',
      growthForm: 'Silicate Impact-Glass Litho-Mat',
      habitatType: 'land',
      baseHeightM: 0.05,
      baseSpreadM: 3.2,
      nativeBiomes: [
        { id: 16, name: 'Regolith Impact Craterlands' },
        { id: 11, name: 'High Plateau / Badlands' },
      ],
      compatibleBiomeIds: [9, 10, 11, 16],
      reproductionMethod: 'Windborne desiccated soredia flakes coating meteorite impact ejecta',
      fieldNote: (biomes) => `Vitreous lichen mat binding fractured impact regolith and breccia across ${biomes}.`,
      adaptations: [
        'Extracellular enzyme secretion extracting potassium and iron from impact melt rock',
        'Reflective silvery silica cuticle deflecting extreme unshielded desert sunlight',
        'Suspended animation dormancy reviving instantly upon trace humidity condensation',
      ],
    },
    // 25. Pelagic Hydrocarbon Methane-Wrack (Methane Seas: 17, 1, 23)
    {
      formCategory: 'Kelp',
      growthForm: 'Pelagic Hydrocarbon Methane-Wrack',
      habitatType: 'aquatic',
      baseHeightM: 15.0,
      baseSpreadM: 3.5,
      nativeBiomes: [
        { id: 17, name: 'Hydrocarbon Methane Sea' },
      ],
      compatibleBiomeIds: [17, 1, 23],
      reproductionMethod: 'Cryogenic non-aqueous zoospores propelled along methane ocean thermoclines',
      fieldNote: (biomes) => `Non-aqueous photosynthetic wrack drifting through cryogenic hydrocarbon seas in ${biomes}.`,
      adaptations: [
        'Lipid bilayer membranes stable in liquid methane down to 90 Kelvin',
        'Polycyclic aromatic hydrocarbon pigments absorbing dim far-red photons',
        'Silica frustule structural stipes resisting cryogenic fluid shear',
      ],
    },
  ];

  const archetypes = isMulticellular ? multicellularArchetypes : unicellularArchetypes;

  // Strict planetary habitat and ecological biome filtering:
  // - If planet has NO solid land, EXCLUDE all land-only archetypes!
  // - If planet has NO liquid oceans, EXCLUDE all aquatic-only archetypes!
  // - If biomeGrid is available, the archetype MUST be ecologically compatible with at least one biome present on the planet!
  let candidatePool = archetypes.filter(arch => {
    if (arch.habitatType === 'aquatic' && !hasLiquid) return false;
    if (arch.habitatType === 'land' && !hasLand) return false;
    if (arch.habitatType === 'amphibious' && !hasLand && !hasLiquid) return false;

    // Strict ecological biome correspondence:
    if (presentBiomeIds.size > 0) {
      const hasCompatibleBiome = arch.compatibleBiomeIds.some(id => presentBiomeIds.has(id));
      if (!hasCompatibleBiome) return false;
    }
    return true;
  });

  // Safe fallback if an exotic combination filtered all candidates:
  if (candidatePool.length === 0) {
    candidatePool = archetypes.filter(arch => {
      if (arch.habitatType === 'aquatic' && !hasLiquid) return false;
      if (arch.habitatType === 'land' && !hasLand) return false;
      return true;
    });
  }

  // Pick strictly unique archetypes deterministically for this seed using Fisher-Yates shuffle without replacement
  const shuffledPool = [...candidatePool];
  for (let i = shuffledPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
  }
  const targetCount = Math.min(speciesCount, shuffledPool.length);
  const selectedArchetypes: ArchetypeConfig[] = shuffledPool.slice(0, targetCount);

  let minCanopyH = 999;
  let maxCanopyH = 0;

  const usedScientificNames = new Set<string>();
  const usedCommonNames = new Set<string>();
  const seenGrowthForms = new Set<string>();

  for (let i = 0; i < selectedArchetypes.length; i++) {
    const arch = selectedArchetypes[i];
    if (seenGrowthForms.has(arch.growthForm)) {
      continue;
    }
    seenGrowthForms.add(arch.growthForm);
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

    // Resolve native biomes: ONLY biomes that ACTUALLY exist on this planet AND are ecologically compatible!
    // 1. Direct match with archetype's preferred nativeBiomes
    let resolvedBiomes = arch.nativeBiomes.filter(b => presentBiomeIds.size === 0 || presentBiomeIds.has(b.id));

    // 2. If none of the preferred biomes are on this planet, pick compatible biomes that ARE present
    if (resolvedBiomes.length === 0 && presentBiomeIds.size > 0) {
      const compatiblePresent = arch.compatibleBiomeIds.filter(id => presentBiomeIds.has(id));
      if (compatiblePresent.length > 0) {
        resolvedBiomes = compatiblePresent.slice(0, 2).map(id => ({
          id,
          name: BIOME_NAMES[id] || 'Plains',
        }));
      } else {
        resolvedBiomes = arch.nativeBiomes;
      }
    } else if (resolvedBiomes.length === 0) {
      resolvedBiomes = arch.nativeBiomes;
    }

    const nativeBiomeIds = resolvedBiomes.map(b => b.id);
    const nativeBiomeNames = resolvedBiomes.map(b => b.name);

    // Semantically aligned Latin binomial and English common names
    const { scientificName, commonName } = generateCoherentSpeciesName({
      regimeKey: pigmentInfo.regimeKey,
      formCategory: arch.formCategory,
      isMulticellular,
      scaledHeight,
      nativeBiomeIds,
      speciesIndex: i,
      rng: specRng,
      usedScientificNames,
      usedCommonNames,
    });

    // Canopy coverage %
    const coverage = Math.round(10 + specRng() * 25);

    const descNote = arch.fieldNote(nativeBiomeNames.join(', '));

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
      nativeBiomeIds,
      nativeBiomeNames,
      canopyCoveragePct: coverage,
      adaptations: arch.adaptations,
      description: descNote,
    });
  }

  // Concise planetary ecosystem summary text
  const summaryText = !hasLand && hasLiquid
    ? !isMulticellular
      ? `${diversityTier}: ${speciesList.length} distinct unicellular pelagic autotrophic taxa blooming across global ocean waters.`
      : `${diversityTier}: ${speciesList.length} distinct pelagic marine autotrophic taxa (global ocean world with no dry land).`
    : !isMulticellular
    ? `${diversityTier}: ${speciesList.length} distinct unicellular autotrophic taxa colonizing land and shallow seas as colored soil crusts and algal mats with ${pigmentInfo.pigmentName.toLowerCase()} pigments.`
    : `${diversityTier}: ${speciesList.length} distinct autotrophic taxa dominated by ${pigmentInfo.pigmentName.toLowerCase()} light harvesting, with canopy heights reaching up to ${maxCanopyH}m.`;

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

