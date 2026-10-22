/**
 * Procedural Xenofungi & Fungal Ecosystem Generator
 * 
 * Generates biologically plausible heterotrophic, saprotrophic, radiotrophic,
 * and mycorrhizal fungal species (Mycota) adapted to planetary conditions:
 * - Radiation regime -> Melanin synthesis and radiotrophic energy harvesting
 * - Atmospheric pressure & moisture -> Hyphal spore puffballs, bioluminescent agarics, and bracket conks
 * - Soil & substrate -> Mineral-dissolving lithotrophs, plant mycorrhizae, or marine detrital saprobes
 * - Planetary hydrology -> Terrestrial vs. Pelagic marine ocean fungi
 */

export type FungiFormCategory = 'Cap' | 'Bracket' | 'Puffball' | 'Cup' | 'Coral' | 'MycelialNet';

export interface XenofungiSpecies {
  id: string;
  kingdom: 'Fungi';
  formCategory: FungiFormCategory;
  commonName: string;
  scientificName: string;
  growthForm: string;
  trophicType: string;
  pigmentName: string;
  pigmentColorHex: string;
  averageHeightM: number;
  averageSpreadM: number;
  structuralPolymer: string;
  reproductionMethod: string;
  nativeBiomeIds: number[];
  nativeBiomeNames: string[];
  canopyCoveragePct: number;
  adaptations: string[];
  description: string;
}

export interface PlanetaryFungiSummary {
  hasFungi: boolean;
  isMulticellular: boolean;
  dominantTrophicType: string;
  dominantPolymer: string;
  totalSpeciesCount: number;
  diversityTier: 'Sterile' | 'Microbial Yeasts' | 'Pioneer Mold' | 'Developed Mycota' | 'Hyper-Diverse Mycelial Web';
  summaryText: string;
  speciesList: XenofungiSpecies[];
}

export type GrammaticalGender = 'masc' | 'fem' | 'neut';

export interface FungiFormSuffixEntry {
  suffix: string;
  gender: GrammaticalGender;
  englishNouns: string[];
}

export interface FungiColorPrefixEntry {
  prefix: string;
  englishAdj: string;
  hexColors: string[];
  pigmentLabel: string;
}

export interface FungiEpithetEntry {
  masc: string;
  fem: string;
  neut: string;
  english: string;
}

// Color and melanin palettes for extraterrestrial fungi
export const FUNGI_COLOR_TAXONOMY: FungiColorPrefixEntry[] = [
  {
    prefix: 'Melano',
    englishAdj: 'Obsidian',
    hexColors: ['#1e1b2e', '#2a2438', '#14121a', '#3b324d', '#251e33'],
    pigmentLabel: 'Radioprotective High-Density Melanin',
  },
  {
    prefix: 'Phosphoro',
    englishAdj: 'Bioluminescent',
    hexColors: ['#38ef7d', '#11998e', '#00f2fe', '#4facfe', '#00c6ff'],
    pigmentLabel: 'Luciferin-Luciferase Bioluminescent Photophores',
  },
  {
    prefix: 'Porphyro',
    englishAdj: 'Amethyst',
    hexColors: ['#8a2387', '#5f0a87', '#a044ff', '#6a097d', '#845ec2'],
    pigmentLabel: 'Polyketide Anthraquinone Pigments (Purple-Violet)',
  },
  {
    prefix: 'Chryso',
    englishAdj: 'Golden',
    hexColors: ['#e65c00', '#f9d423', '#d4af37', '#e17055', '#fdcb6e'],
    pigmentLabel: 'Lipophilic Carotenoids & Xanthophylls (Gold-Amber)',
  },
  {
    prefix: 'Cyano',
    englishAdj: 'Azure',
    hexColors: ['#0984e3', '#00cec9', '#74b9ff', '#17c0eb', '#38ada9'],
    pigmentLabel: 'Hydrated Copper-Phenol Complexes (Cyan-Teal)',
  },
  {
    prefix: 'Leuko',
    englishAdj: 'Ghost-White',
    hexColors: ['#f5f6fa', '#dcdde1', '#dfe4ea', '#f1f2f6', '#ced6e0'],
    pigmentLabel: 'Achromatic Silica-Chitin Cuticle (Ghost-White)',
  },
  {
    prefix: 'Pyro',
    englishAdj: 'Crimson',
    hexColors: ['#c0392b', '#e74c3c', '#d63031', '#ff4757', '#b71540'],
    pigmentLabel: 'Polypore Rubro-Phenols (Crimson-Scarlet)',
  },
  {
    prefix: 'Phaeo',
    englishAdj: 'Dusk-Brown',
    hexColors: ['#4b382a', '#6d4c41', '#5d4037', '#795548', '#3e2723'],
    pigmentLabel: 'Sclerotized Lignicolous Tannins (Dusk-Umbre)',
  },
];

// Fungal Form Suffixes
export const FUNGI_FORM_SUFFIXES: Record<FungiFormCategory, FungiFormSuffixEntry[]> = {
  Cap: [
    { suffix: 'agaricus', gender: 'masc', englishNouns: ['Cap-Mushroom', 'Gilled-Agaric'] },
    { suffix: 'pileus', gender: 'masc', englishNouns: ['Parasol-Cap', 'Umbrella-Cap'] },
    { suffix: 'myces', gender: 'neut', englishNouns: ['Stipe-Mushroom', 'Fungal-Cap'] },
  ],
  Bracket: [
    { suffix: 'porus', gender: 'masc', englishNouns: ['Bracket-Shelf', 'Wood-Polypore'] },
    { suffix: 'derma', gender: 'neut', englishNouns: ['Shelf-Fungus', 'Trunk-Conk'] },
    { suffix: 'taphris', gender: 'fem', englishNouns: ['Plate-Bracket', 'Ledge-Polypore'] },
  ],
  Puffball: [
    { suffix: 'globus', gender: 'masc', englishNouns: ['Puffball', 'Spore-Globe'] },
    { suffix: 'gaster', gender: 'masc', englishNouns: ['Puff-Bulb', 'Bellows-Fungus'] },
    { suffix: 'sphaera', gender: 'fem', englishNouns: ['Spore-Sphere', 'Puff-Dome'] },
  ],
  Cup: [
    { suffix: 'calyx', gender: 'masc', englishNouns: ['Spore-Cup', 'Chalice-Fungus'] },
    { suffix: 'apotheca', gender: 'fem', englishNouns: ['Goblet-Fungus', 'Spore-Bowl'] },
    { suffix: 'crater', gender: 'masc', englishNouns: ['Basin-Cup', 'Dew-Cup'] },
  ],
  Coral: [
    { suffix: 'clava', gender: 'fem', englishNouns: ['Coral-Club', 'Antler-Fungus'] },
    { suffix: 'ramosus', gender: 'masc', englishNouns: ['Branching-Coral', 'Fingered-Fungus'] },
    { suffix: 'cornu', gender: 'neut', englishNouns: ['Antler-Spire', 'Club-Coral'] },
  ],
  MycelialNet: [
    { suffix: 'mycelium', gender: 'neut', englishNouns: ['Hyphal-Net', 'Mycelial-Weave'] },
    { suffix: 'thrix', gender: 'fem', englishNouns: ['Mold-Filament', 'Cobweb-Mold'] },
    { suffix: 'rhiza', gender: 'fem', englishNouns: ['Rhizomorph-Web', 'Spore-Lace'] },
  ],
};

// Size & Niche Epithets for Fungi
export const FUNGI_MICRO_EPITHETS: FungiEpithetEntry[] = [
  { masc: 'pumilus', fem: 'pumila', neut: 'pumilum', english: 'Pygmy' },
  { masc: 'nanus', fem: 'nana', neut: 'nanum', english: 'Dwarf' },
  { masc: 'subtilis', fem: 'subtilis', neut: 'subtile', english: 'Micro' },
  { masc: 'crustosus', fem: 'crustosa', neut: 'crustosum', english: 'Crust' },
  { masc: 'humilis', fem: 'humilis', neut: 'humile', english: 'Low' },
];

export const FUNGI_MEDIUM_EPITHETS: FungiEpithetEntry[] = [
  { masc: 'elegans', fem: 'elegans', neut: 'elegans', english: 'Delicate' },
  { masc: 'gracilis', fem: 'gracilis', neut: 'gracile', english: 'Slender' },
  { masc: 'communis', fem: 'communis', neut: 'commune', english: 'Common' },
  { masc: 'ramosus', fem: 'ramosa', neut: 'ramosum', english: 'Branching' },
];

export const FUNGI_LARGE_EPITHETS: FungiEpithetEntry[] = [
  { masc: 'giganteus', fem: 'gigantea', neut: 'giganteum', english: 'Giant' },
  { masc: 'grandis', fem: 'grandis', neut: 'grande', english: 'Great' },
  { masc: 'titanis', fem: 'titanis', neut: 'titane', english: 'Titanic' },
  { masc: 'colossalis', fem: 'colossalis', neut: 'colossale', english: 'Colossal' },
];

export const FUNGI_NICHE_EPITHETS: FungiEpithetEntry[] = [
  { masc: 'bioluminescens', fem: 'bioluminescens', neut: 'bioluminescens', english: 'Bioluminescent' },
  { masc: 'radiotrophicus', fem: 'radiotrophica', neut: 'radiotrophicum', english: 'Radiotrophic' },
  { masc: 'saprophyticus', fem: 'saprophytica', neut: 'saprophyticum', english: 'Decomposing' },
  { masc: 'lithophilus', fem: 'lithophila', neut: 'lithophilum', english: 'Rock-Eating' },
  { masc: 'symbioticus', fem: 'symbiotica', neut: 'symbioticum', english: 'Mycorrhizal' },
  { masc: 'pelagicus', fem: 'pelagica', neut: 'pelagicum', english: 'Marine' },
  { masc: 'abyssalis', fem: 'abyssalis', neut: 'abyssale', english: 'Abyssal' },
  { masc: 'cryophilus', fem: 'cryophila', neut: 'cryophilum', english: 'Frost-Tolerant' },
  { masc: 'volcanicus', fem: 'volcanica', neut: 'volcanicum', english: 'Volcanic' },
];

import {
  CRYO_BIOME_IDS,
  VOLCANIC_BIOME_IDS,
  ARID_BIOME_IDS,
  AQUATIC_BIOME_IDS,
  SOLID_LAND_BIOME_IDS,
  WATER_BIOME_IDS,
  BIOME_NAMES,
  calculateWeightedSpeciesCount,
} from './floraGen';

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

/**
 * Generates coherent Latin binomial and English common names for fungal species.
 */
export function generateCoherentFungiName(params: {
  formCategory: FungiFormCategory;
  scaledHeight: number;
  nativeBiomeIds: number[];
  trophicType: string;
  colorEntry: FungiColorPrefixEntry;
  speciesIndex: number;
  rng: () => number;
  usedScientificNames?: Set<string>;
  usedCommonNames?: Set<string>;
}): { scientificName: string; commonName: string } {
  const {
    formCategory,
    scaledHeight,
    nativeBiomeIds,
    colorEntry,
    speciesIndex,
    rng,
    usedScientificNames,
    usedCommonNames,
  } = params;

  // 1. Suffix matching morphology
  const suffixList = FUNGI_FORM_SUFFIXES[formCategory] || FUNGI_FORM_SUFFIXES.Cap;
  const formEntry = suffixList[(speciesIndex + Math.floor(rng() * suffixList.length)) % suffixList.length];

  // Genus: ColorPrefix + FormSuffix (e.g. Melanoagaricus, Phosphoroporos)
  const genus = `${colorEntry.prefix}${formEntry.suffix}`;

  // 2. Epithet pool adhering to scale and habitat
  const epithetPool: FungiEpithetEntry[] = [];

  const hasVolcanic = nativeBiomeIds.some(id => VOLCANIC_BIOME_IDS.has(id));
  const hasCryo = nativeBiomeIds.some(id => CRYO_BIOME_IDS.has(id));
  const hasAquatic = nativeBiomeIds.some(id => AQUATIC_BIOME_IDS.has(id));
  const hasArid = nativeBiomeIds.some(id => ARID_BIOME_IDS.has(id));

  if (hasVolcanic) epithetPool.push({ masc: 'volcanicus', fem: 'volcanica', neut: 'volcanicum', english: 'Volcanic' });
  if (hasCryo) epithetPool.push({ masc: 'cryophilus', fem: 'cryophila', neut: 'cryophilum', english: 'Frost-Tolerant' });
  if (hasAquatic) {
    epithetPool.push({ masc: 'pelagicus', fem: 'pelagica', neut: 'pelagicum', english: 'Marine' });
    epithetPool.push({ masc: 'abyssalis', fem: 'abyssalis', neut: 'abyssale', english: 'Abyssal' });
  }
  if (hasArid) {
    epithetPool.push({ masc: 'eremicus', fem: 'eremica', neut: 'eremicum', english: 'Desert' });
  }

  // Niche-based options
  epithetPool.push(...FUNGI_NICHE_EPITHETS);

  // Scale-based options (strictly enforced)
  if (scaledHeight < 0.15) {
    epithetPool.push(...FUNGI_MICRO_EPITHETS);
  } else if (scaledHeight > 4.0) {
    epithetPool.push(...FUNGI_LARGE_EPITHETS);
  } else {
    epithetPool.push(...FUNGI_MEDIUM_EPITHETS);
  }

  // Pick unique candidate
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

  // 3. English common name strictly reflecting Latin parts
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

interface FungiArchetypeConfig {
  formCategory: FungiFormCategory;
  growthForm: string;
  habitatType: 'land' | 'aquatic' | 'amphibious';
  baseHeightM: number;
  baseSpreadM: number;
  trophicType: string;
  nativeBiomes: { id: number; name: string }[];
  compatibleBiomeIds: number[];
  reproductionMethod: string;
  fieldNote: (biomes: string) => string;
  adaptations: string[];
}

/**
 * Generate the fungi ecosystem summary and species catalog for a world.
 */
export function generateFungiEcosystem(params: {
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
}): PlanetaryFungiSummary {
  const {
    seed,
    hasBiosphere,
    biosphereDescription = '',
    systemAgeGyr = 4.5,
    gravityG = 1.0,
    pressureBar = 1.0,
    solventKey = 'H2O',
    biomeGrid,
    surfaceTempK,
  } = params;

  if (!hasBiosphere) {
    return {
      hasFungi: false,
      isMulticellular: false,
      dominantTrophicType: 'None',
      dominantPolymer: 'None (Abiotic)',
      totalSpeciesCount: 0,
      diversityTier: 'Sterile',
      summaryText: 'Devoid of fungal decomposers or heterotrophic mycelial life.',
      speciesList: [],
    };
  }

  // 1. Analyze present biomes
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

  // 2. Land & ocean presence
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
    const hasAnySolidBiome = Array.from(presentBiomeIds).some(id => SOLID_LAND_BIOME_IDS.has(id));
    if (!hasAnySolidBiome) hasLand = false;
  }

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

  const rng = createSeedRng((seed * 37 + 0x8a1d7f4b) >>> 0);
  const bioDescLower = biosphereDescription.toLowerCase();
  const isMulticellular = bioDescLower.includes('multicellular') || 
    (!bioDescLower.includes('unicellular') && !bioDescLower.includes('microbial') && systemAgeGyr >= 2.8);
  const g = Math.max(0.15, gravityG);
  const heightMultiplier = Math.pow(1.0 / g, 0.55);

  let structuralPolymer = isMulticellular ? 'Melanized Chitin & Beta-Glucan' : 'Cellular Glucosamine Biofilm';
  if (isCryoWorld || solventKey === 'NH3-H2O') {
    structuralPolymer = isMulticellular
      ? 'Cryo-Glycerol Chitosan Hydrogel & Trehalose Matrix'
      : 'Cryo-Active Glucosamine Biofilm';
  } else if (solventKey.toLowerCase().includes('methane')) {
    structuralPolymer = isMulticellular
      ? 'Silica-Sclerotized Polycyclic Chitin'
      : 'Silica-Frustule Hydrocarbon Biofilm';
  } else if (isAllVolcanicBiomes) {
    structuralPolymer = isMulticellular
      ? 'Silica-Sclerotized Pyritic Chitin'
      : 'Thermophilic Mineral Biofilm';
  }

  // Number of fungal species to generate: weighted by evolutionary age and planetary habitability (5 to 20 species)
  const speciesCount = calculateWeightedSpeciesCount({
    systemAgeGyr,
    hasLiquid,
    hasLand,
    solventKey,
    surfaceTempK,
    pressureBar,
    isMulticellular,
    biosphereDescription,
    presentBiomeCount: presentBiomeIds.size,
    rng,
  });

  // Fungal diversity tier
  let diversityTier: PlanetaryFungiSummary['diversityTier'] = 'Developed Mycota';
  if (!isMulticellular) {
    diversityTier = 'Microbial Yeasts';
  } else if (speciesCount < 8) {
    diversityTier = 'Pioneer Mold';
  } else if (speciesCount >= 15 && hasLiquid && hasLand) {
    diversityTier = 'Hyper-Diverse Mycelial Web';
  }

  // Archetypes pool
  const archetypes: FungiArchetypeConfig[] = [
    // 1. Bioluminescent Forest Gilled Parasol (Temperate Land: 3, 4, 5, 12)
    {
      formCategory: 'Cap',
      growthForm: 'Bioluminescent Parasol Gilled-Cap',
      habitatType: 'land',
      baseHeightM: 0.85,
      baseSpreadM: 0.7,
      trophicType: 'Saprotrophic Wood & Lignin Decomposer',
      nativeBiomes: [
        { id: 4, name: 'Lowland Silicate Plains' },
        { id: 5, name: 'Temperate Continental Basin' },
      ],
      compatibleBiomeIds: [3, 4, 5, 12],
      reproductionMethod: 'Night-glowing basidiospores attracted by atmospheric air currents',
      fieldNote: (biomes) => `Bioluminescent gilled cap carpeting forest humus and decomposing plant debris across ${biomes}.`,
      adaptations: [
        'Luciferin-driven enzymatic glow attracting nocturnal spore-dispersing microfauna',
        'Lignin-peroxidase enzymes dissolving tough woody cellulose fibers',
        'Hydrophobic cap cuticle shedding seasonal rainstorms',
      ],
    },
    // 2. Woody Trunk Bracket Polypore (Temperate/Steppe: 3, 4, 5, 6, 12)
    {
      formCategory: 'Bracket',
      growthForm: 'Perennial Tiered Shelf-Polypore',
      habitatType: 'land',
      baseHeightM: 1.2,
      baseSpreadM: 1.6,
      trophicType: 'Lignicolous Heart-Rot Decomposer',
      nativeBiomes: [
        { id: 4, name: 'Lowland Silicate Plains' },
        { id: 5, name: 'Temperate Continental Basin' },
        { id: 6, name: 'High-Latitude Rocky Steppe' },
      ],
      compatibleBiomeIds: [3, 4, 5, 6, 12],
      reproductionMethod: 'Passive microscopic spore drift from downward-facing hymenial pores',
      fieldNote: (biomes) => `Hard, woody bracket shelves growing in horizontal tiers along living and fallen trunks in ${biomes}.`,
      adaptations: [
        'Dense chitinous crust resisting physical shearing and gnawing micro-pests',
        'High-efficiency pore tubes sheltering millions of developing spores',
        'Antifungal chemical secretions defending substrate territory from competitor molds',
      ],
    },
    // 3. Giant Ballistic Spore Puffball (Basin/Arid: 4, 5, 9, 11)
    {
      formCategory: 'Puffball',
      growthForm: 'Giant Ostiolate Ballistic Puffball',
      habitatType: 'land',
      baseHeightM: 2.5,
      baseSpreadM: 2.2,
      trophicType: 'Soil Humus & Detrital Recycler',
      nativeBiomes: [
        { id: 5, name: 'Temperate Continental Basin' },
        { id: 4, name: 'Lowland Silicate Plains' },
        { id: 9, name: 'Arid Steppe / Scrub' },
      ],
      compatibleBiomeIds: [4, 5, 9, 11],
      reproductionMethod: 'Pneumatic shockwave puffs discharging clouds of millions of spores',
      fieldNote: (biomes) => `Large bulbous puffball expanding on open ground in ${biomes}, puffing spores when triggered by wind or touch.`,
      adaptations: [
        'Flexible membranous peridium acting as a hydraulic bellows under atmospheric pressure changes',
        'Hydrophobic spore coating allowing windborne dispersal across hundreds of kilometers',
        'Rapid fruiting body inflation absorbing ground moisture after planetary rain events',
      ],
    },
    // 4. Branching Antler Coral Fungus (Boreal/Alpine: 5, 6, 7, 12, 13)
    {
      formCategory: 'Coral',
      growthForm: 'Branching Antler Clavarioid Coral',
      habitatType: 'land',
      baseHeightM: 0.65,
      baseSpreadM: 0.5,
      trophicType: 'Mycorrhizal Soil Symbiont',
      nativeBiomes: [
        { id: 6, name: 'High-Latitude Rocky Steppe' },
        { id: 7, name: 'Tundra / Permafrost' },
        { id: 5, name: 'Temperate Continental Basin' },
      ],
      compatibleBiomeIds: [5, 6, 7, 12, 13],
      reproductionMethod: 'External spore release along ascending antler branch surfaces',
      fieldNote: (biomes) => `Intricately branched coral-like fungus rising from moss beds and rocky soils in ${biomes}.`,
      adaptations: [
        'Multi-tiered vertical branches maximizing hymenial surface area in low-wind environments',
        'Glycerol-rich hyphae buffering against sub-zero polar freezing',
        'Deep mycelial tap-strands locking into rocky crevices',
      ],
    },
    // 5. Deep Soil Mycorrhizal Rhizomorph Web (Forest/Plains: 3, 4, 5, 12)
    {
      formCategory: 'MycelialNet',
      growthForm: 'Subterranean Rhizomorph Communication Grid',
      habitatType: 'land',
      baseHeightM: 0.05,
      baseSpreadM: 25.0,
      trophicType: 'Mycorrhizal Mineral-Trading Network',
      nativeBiomes: [
        { id: 4, name: 'Lowland Silicate Plains' },
        { id: 5, name: 'Temperate Continental Basin' },
      ],
      compatibleBiomeIds: [3, 4, 5, 12],
      reproductionMethod: 'Continuous underground hyphal runner expansion and nodular sclerotia',
      fieldNote: (biomes) => `Extensive underground network of cord-like mycelial cables linking root systems across ${biomes}.`,
      adaptations: [
        'Tubular rhizomorph conduits pumping mineral water and phosphorus across forest sectors',
        'Bio-electrical hyphal signaling relaying environmental stress cues between plant hosts',
        'Melanized protective outer sheath insulating mycelial conduits from parasitic microbes',
      ],
    },
    // 6. Fluorescent Chalice Spore Cup (Riparian/Alluvial: 2, 3, 4, 5)
    {
      formCategory: 'Cup',
      growthForm: 'Fluorescent Cup & Chalice Ascocarp',
      habitatType: 'land',
      baseHeightM: 0.35,
      baseSpreadM: 0.4,
      trophicType: 'Riparian Leaf-Litter Saprobe',
      nativeBiomes: [
        { id: 3, name: 'Coastal Alluvial Basin' },
        { id: 4, name: 'Lowland Silicate Plains' },
      ],
      compatibleBiomeIds: [2, 3, 4, 5],
      reproductionMethod: 'Hydro-ballistic spore shooting triggered by falling raindrops',
      fieldNote: (biomes) => `Vivid cup-shaped ascocarp nestled in moist silt and leaf litter in ${biomes}.`,
      adaptations: [
        'Elastic cup rim funneling droplet impacts to violently eject spore asci into air currents',
        'High-affinity water retention keeping hymenium hydrated during dry spells',
        'UV-fluorescent pigment layer deterring micro-slug grazers',
      ],
    },
    // 7. Radiotrophic Melanin-Absorber (High Radiation / Badlands: 9, 11, 14, 16)
    {
      formCategory: 'Puffball',
      growthForm: 'Radiotrophic Melano-Crust Fungus',
      habitatType: 'land',
      baseHeightM: 0.4,
      baseSpreadM: 1.5,
      trophicType: 'Radiotrophic Melanin-Synthesizing Mycota',
      nativeBiomes: [
        { id: 11, name: 'High Plateau / Badlands' },
        { id: 16, name: 'Regolith Impact Craterlands' },
        { id: 14, name: 'Basalt Volcanic Crust' },
      ],
      compatibleBiomeIds: [9, 11, 14, 16],
      reproductionMethod: 'Hardened melanized chlamydospores released during thermal updrafts',
      fieldNote: (biomes) => `Jet-black radiotrophic fungus growing in unshielded high-radiation plateaus in ${biomes}, converting cosmic rays into chemical energy.`,
      adaptations: [
        'Extremely dense melanin pigment converting ionizing gamma and UV flux into metabolic electron transfer',
        'Double-strand DNA repair chaperones operating continuously under intense cosmic rays',
        'Radical-scavenging carotenoid complexes preventing cellular oxidative stress',
      ],
    },
    // 8. Lithotrophic Basalt Bio-Eroder (Volcanic/Regolith: 9, 11, 14, 15, 16, 22)
    {
      formCategory: 'MycelialNet',
      growthForm: 'Endolithic Rock-Etching Mycelium',
      habitatType: 'land',
      baseHeightM: 0.02,
      baseSpreadM: 8.0,
      trophicType: 'Lithotrophic Basalt-Dissolving Bio-Eroder',
      nativeBiomes: [
        { id: 14, name: 'Basalt Volcanic Crust' },
        { id: 15, name: 'Active Lava Caldera & Fissure' },
        { id: 22, name: 'Active Volcanic Shield & Lava Caldera' },
      ],
      compatibleBiomeIds: [9, 11, 14, 15, 16, 22],
      reproductionMethod: 'Microscopic hyphal fragmentation within expanding rock cracks',
      fieldNote: (biomes) => `Rock-boring mycelium dissolving volcanic minerals and etching basaltic bedrock in ${biomes}.`,
      adaptations: [
        'Oxalic acid secretion dissolving iron and magnesium silicate minerals directly from lava rock',
        'Thermophilic chitin walls withstanding ground temperatures up to 370 Kelvin',
        'Endolithic micro-tunnels providing physical shelter from exterior weathering',
      ],
    },

    // --- CRYO WORLDS & SUB-ZERO GLACIAL FUNGI (Biomes: 18, 21, 8, 7, 13) ---
    // 9. Cryotectonic Sub-Zero Ice-Cup (Cryo: 18, 21, 8, 7, 13)
    {
      formCategory: 'Cup',
      growthForm: 'Cryotectonic Sub-Zero Ice-Cup',
      habitatType: 'land',
      baseHeightM: 0.3,
      baseSpreadM: 0.4,
      trophicType: 'Cryophilic Nitrogen-Seep Saprobe',
      nativeBiomes: [
        { id: 21, name: 'Cryotectonic Ice Fissure (Linea)' },
        { id: 18, name: 'Cryovolcanic Nitrogen Plains' },
      ],
      compatibleBiomeIds: [18, 21, 8, 7, 13],
      reproductionMethod: 'Cryo-spores extruded into sub-glacial linea vents',
      fieldNote: (biomes) => `Clusters along sub-surface ice fractures and cryotectonic rifts in ${biomes}, digesting aerosol organic fallout.`,
      adaptations: [
        'Cryo-protective trehalose sap preventing cell lysis down to 80 Kelvin',
        'Hyphal anchoring pads gripping nitrogen and methane ice crystals',
        'Enzymatic recycling of cryovolcanic organic deposits',
      ],
    },
    // 10. Cryogenic Nitrogen-Plains Mycelial Felt (Cryo: 18, 21, 8, 7, 13)
    {
      formCategory: 'MycelialNet',
      growthForm: 'Cryogenic Nitrogen-Plains Mycelial Felt',
      habitatType: 'land',
      baseHeightM: 0.03,
      baseSpreadM: 18.0,
      trophicType: 'Sub-Zero Cryo-Polymer Decomposer',
      nativeBiomes: [
        { id: 18, name: 'Cryovolcanic Nitrogen Plains' },
        { id: 21, name: 'Cryotectonic Ice Fissure (Linea)' },
      ],
      compatibleBiomeIds: [18, 21, 8, 7, 13],
      reproductionMethod: 'Sub-ice hyphal runner expansion and cryo-dormant sclerotia',
      fieldNote: (biomes) => `Extensive frost-resistant mycelial web weaving through frozen nitrogen crusts in ${biomes}.`,
      adaptations: [
        'Flexible polyunsaturated fatty acid membranes remaining functional in liquid nitrogen',
        'Symbiotic exchange of trace ammonia and methane with cryo-lichens',
        'Melanized hyphal cables conducting geothermal heat pulses along tectonic rifts',
      ],
    },
    // 11. Glacial Cryo-Puffball (Cryo: 18, 21, 8, 7, 13)
    {
      formCategory: 'Puffball',
      growthForm: 'Glacial Cryo-Puffball',
      habitatType: 'land',
      baseHeightM: 0.9,
      baseSpreadM: 1.1,
      trophicType: 'Cryo-Dormant Spore Reservoired Saprobe',
      nativeBiomes: [
        { id: 18, name: 'Cryovolcanic Nitrogen Plains' },
        { id: 8, name: 'Polar Glacial Ice' },
      ],
      compatibleBiomeIds: [18, 21, 8, 7, 13],
      reproductionMethod: 'Sublimation-triggered ostiole rupture releasing cold-active spores',
      fieldNote: (biomes) => `Elastic, frozen puffball releasing clouds of cryo-protected spores during rare sublimative warming periods in ${biomes}.`,
      adaptations: [
        'Elastic freeze-tolerant peridium expanding under nitrogen vapor expansion',
        'Vitreous spore coatings resisting cosmic rays during cryogenic dormancy',
        'Glycerol hydrogel interior preventing brittle fracture in glacial blizzards',
      ],
    },
    // 12. Sub-Glacial Shelf-Bracket (Cryo: 18, 21, 8, 7, 13)
    {
      formCategory: 'Bracket',
      growthForm: 'Sub-Glacial Shelf-Bracket',
      habitatType: 'land',
      baseHeightM: 0.6,
      baseSpreadM: 0.9,
      trophicType: 'Glacial Ice-Matrix Endolith',
      nativeBiomes: [
        { id: 21, name: 'Cryotectonic Ice Fissure (Linea)' },
        { id: 8, name: 'Polar Glacial Ice' },
      ],
      compatibleBiomeIds: [18, 21, 8, 7, 13],
      reproductionMethod: 'Downward pore ejection into cryogenic ice chasms',
      fieldNote: (biomes) => `Hardened bracket conk protruding from vertical ice walls and linea fissures in ${biomes}.`,
      adaptations: [
        'Biomineralized silica-chitin shell anchored directly into bedrock ice',
        'Downward-directed spore tubes sheltered from raging surface ice winds',
        'Extracellular ice-structuring proteins sculpting micro-pockets in the ice shelf',
      ],
    },

    // --- VOLCANIC CALDERA FUNGI (Biomes: 14, 15, 22) ---
    // 13. Volcanic Fumarole Pyritic Coral (Volcanic: 14, 15, 22)
    {
      formCategory: 'Coral',
      growthForm: 'Volcanic Fumarole Pyritic Coral Fungus',
      habitatType: 'land',
      baseHeightM: 1.2,
      baseSpreadM: 0.8,
      trophicType: 'Chemosynthetic Sulfur-Oxidizing Geothermal Mycota',
      nativeBiomes: [
        { id: 15, name: 'Active Lava Caldera & Fissure' },
        { id: 22, name: 'Active Volcanic Shield & Lava Caldera' },
      ],
      compatibleBiomeIds: [14, 15, 22],
      reproductionMethod: 'Scalding hydrothermal steam jet spore ejection',
      fieldNote: (biomes) => `Sulfur-encrusted antler coral thriving at the edges of active volcanic vents and calderas in ${biomes}.`,
      adaptations: [
        'Thermostable enzymes withstanding temperatures up to 390 Kelvin',
        'Pyritic mineral sleeves shielding hyphae from acid gas erosion',
        'Chemolithotrophic energy derivation from gaseous volcanic hydrogen sulfide',
      ],
    },
    // 14. Caldera Tephra Basalt-Cup (Volcanic: 14, 15, 22)
    {
      formCategory: 'Cup',
      growthForm: 'Caldera Tephra Basalt-Cup',
      habitatType: 'land',
      baseHeightM: 0.25,
      baseSpreadM: 0.35,
      trophicType: 'Pyrophytic Mineral Saprobe',
      nativeBiomes: [
        { id: 14, name: 'Basalt Volcanic Crust' },
        { id: 22, name: 'Active Volcanic Shield & Lava Caldera' },
      ],
      compatibleBiomeIds: [14, 15, 22],
      reproductionMethod: 'Heat-activated asci catapulting spores across lava flows',
      fieldNote: (biomes) => `Heat-resistant cup fungus colonizing warm basaltic fissures and volcanic cinder fields in ${biomes}.`,
      adaptations: [
        'Heat-triggered spore dehiscence activating after fresh lava flows cool below 360 K',
        'Vitreous silicate lining preserving moisture on scorching basalt crusts',
        'Direct chemical leaching of iron and sulfur from volcanic tephra',
      ],
    },

    // --- ARID & DESERT REGOLITH FUNGI (Biomes: 9, 10, 11, 16) ---
    // 15. Hyper-Arid Stalked Dune-Puffball (Arid: 9, 10, 11, 16)
    {
      formCategory: 'Puffball',
      growthForm: 'Hyper-Arid Stalked Dune-Puffball',
      habitatType: 'land',
      baseHeightM: 1.5,
      baseSpreadM: 0.6,
      trophicType: 'Desiccation-Tolerant Sand Saprobe',
      nativeBiomes: [
        { id: 10, name: 'Hyper-Arid Dunes / Desert' },
        { id: 9, name: 'Arid Steppe / Scrub' },
      ],
      compatibleBiomeIds: [9, 10, 11, 16],
      reproductionMethod: 'Sand-scouring wind erosion tearing apical ostiole pore',
      fieldNote: (biomes) => `Stalked desert puffball elevating its spore chamber above shifting sands in ${biomes}.`,
      adaptations: [
        'Rigid fibrous stalk lifting spore head above blowing dune grit',
        'Anhydrobiotic spore cells surviving decades without liquid moisture',
        'Subterranean hyphal anchor stabilizing dune sand grains into cohesive soil',
      ],
    },
    // 16. Impact-Breccia Lithotrophic Mycelium (Arid/Craterlands: 9, 10, 11, 16)
    {
      formCategory: 'MycelialNet',
      growthForm: 'Impact-Breccia Lithotrophic Mycelium',
      habitatType: 'land',
      baseHeightM: 0.02,
      baseSpreadM: 14.0,
      trophicType: 'Lithotrophic Regolith Bio-Eroder',
      nativeBiomes: [
        { id: 16, name: 'Regolith Impact Craterlands' },
        { id: 11, name: 'High Plateau / Badlands' },
      ],
      compatibleBiomeIds: [9, 10, 11, 16],
      reproductionMethod: 'Endolithic hyphal mining and drought-resistant chlamydospores',
      fieldNote: (biomes) => `Network of rock-penetrating hyphae mining trace minerals within porous regolith in ${biomes}.`,
      adaptations: [
        'Endolithic acid-boring hyphae fracturing shock-metamorphosed mineral grains',
        'Radiation-absorbing carotenoid and melanin sheaths guarding against cosmic rays',
        'Hygroscopic cell wall polymers adsorbing micro-droplets of atmospheric dew',
      ],
    },

    // --- AQUATIC & PELAGIC FUNGI (For Ocean Worlds & Marine Biomes) ---
    // 17. Pelagic Marine Snow Saprobe (Aquatic: 0, 1, 2, 17, 23)
    {
      formCategory: 'MycelialNet',
      growthForm: 'Pelagic Marine Snow Mycelial Veil',
      habitatType: 'aquatic',
      baseHeightM: 0.1,
      baseSpreadM: 12.0,
      trophicType: 'Pelagic Marine Detrital Saprobe',
      nativeBiomes: [
        { id: 1, name: 'Deep Ocean' },
        { id: 23, name: 'Algal Sea' },
        { id: 2, name: 'Continental Shelf / Shallows' },
      ],
      compatibleBiomeIds: [0, 1, 2, 17, 23],
      reproductionMethod: 'Hydrochorous flagellated zoospores swimming on marine thermocline currents',
      fieldNote: (biomes) => `Sprawling, translucent mycelial veils intercepting falling organic debris in ocean photic zones across ${biomes}.`,
      adaptations: [
        'Web-like mucilage net intercepting sinking phytoplankton detritus and marine snow',
        'Extracellular alginate-lyase enzymes rapidly liquefying marine organic particles',
        'Lipid buoyancy micro-vesicles keeping hyphal veils suspended at optimal depths',
      ],
    },
    // 18. Abyssal Hydrothermal Vent Sulfur Fungus (Aquatic: 0, 1, 17)
    {
      formCategory: 'Coral',
      growthForm: 'Abyssal Vent Mineralized Hyphal Chimney',
      habitatType: 'aquatic',
      baseHeightM: 2.8,
      baseSpreadM: 0.9,
      trophicType: 'Chemotrophic Sulfide-Oxidizing Vent Mycota',
      nativeBiomes: [
        { id: 0, name: 'Abyssal Trench' },
        { id: 1, name: 'Deep Ocean' },
      ],
      compatibleBiomeIds: [0, 1, 17],
      reproductionMethod: 'High-pressure hydrothermal vent plume spore discharge',
      fieldNote: (biomes) => `Chemotrophic mineralized chimney fungus growing around seafloor spreading rifts and thermal vents in ${biomes}.`,
      adaptations: [
        'Chemosynthetic sulfur oxidation sustaining metabolism in total abyssal darkness',
        'Barophilic cell membranes maintaining integrity under 800 atmospheres of hydrostatic pressure',
        'Metallic sulfide-reinforced chitin sleeve insulating from thermal vent scalding',
      ],
    },
    // 19. Pelagic Floating Sargassum-Associated Bracket (Aquatic: 1, 2, 23)
    {
      formCategory: 'Bracket',
      growthForm: 'Pelagic Floating Kelp-Bracket Fungus',
      habitatType: 'aquatic',
      baseHeightM: 0.4,
      baseSpreadM: 0.8,
      trophicType: 'Marine Macro-Algae Saprotroph',
      nativeBiomes: [
        { id: 1, name: 'Deep Ocean' },
        { id: 23, name: 'Algal Sea' },
        { id: 2, name: 'Continental Shelf / Shallows' },
      ],
      compatibleBiomeIds: [1, 2, 23],
      reproductionMethod: 'Mucilaginous water-borne spores attaching to floating macro-algae fronds',
      fieldNote: (biomes) => `Waterproof bracket fungus growing on floating kelp rafts and surface vegetation across ${biomes}.`,
      adaptations: [
        'Gas-filled chambered tissue keeping bracket conks floating on open sea swells',
        'Extreme salt-tolerant osmolytes maintaining cellular water balance in seawater',
        'Active digestion of dying kelp blades without harming healthy photosynthetic tissue',
      ],
    },
    // 20. Sub-Ice Cryophilic Sea-Yeast & Brine-Mold (Aquatic / Polar Ice: 8, 1, 2, 21)
    {
      formCategory: 'Cup',
      growthForm: 'Sub-Ice Cryophilic Inverted Spore Cup',
      habitatType: 'aquatic',
      baseHeightM: 0.25,
      baseSpreadM: 0.35,
      trophicType: 'Sub-Ice Cryophilic Detrital Saprobe',
      nativeBiomes: [
        { id: 8, name: 'Polar Glacial Ice' },
        { id: 2, name: 'Continental Shelf / Shallows' },
        { id: 1, name: 'Deep Ocean' },
      ],
      compatibleBiomeIds: [8, 1, 2, 21],
      reproductionMethod: 'Brine-channel spore drift along underside of polar pack ice',
      fieldNote: (biomes) => `Inverted spore cups clinging to the submerged underside of polar sea ice and ice shelves in ${biomes}.`,
      adaptations: [
        'High-concentration glycerol and antifreeze proteins preventing cell freezing down to 260 K',
        'Adhesive hyphal holdfasts embedding firmly into sub-ice micro-brine channels',
        'Digestive enzymes active at sub-zero temperatures recycling dead cryo-algae',
      ],
    },
    // 21. Pelagic Bioluminescent Bubble-Puff (Aquatic: 1, 2, 23)
    {
      formCategory: 'Puffball',
      growthForm: 'Pelagic Floating Bioluminescent Bubble-Puff',
      habitatType: 'aquatic',
      baseHeightM: 0.7,
      baseSpreadM: 0.9,
      trophicType: 'Bioluminescent Marine Planktonic Saprobe',
      nativeBiomes: [
        { id: 23, name: 'Algal Sea' },
        { id: 1, name: 'Deep Ocean' },
      ],
      compatibleBiomeIds: [1, 2, 23],
      reproductionMethod: 'Bioluminescent spore clouds released upon contact with marine fauna',
      fieldNote: (biomes) => `Floating globular puffball drifting in warm ocean currents in ${biomes}, glowing brightly when agitated.`,
      adaptations: [
        'Persistent buoyancy provided by metabolically produced methane/nitrogen gas sacs',
        'Bioluminescent blue-green flashes startling predators and illuminating passing detritus',
        'Hydro-pneumatic spore expulsion dispersing clouds of zoospores into the photic zone',
      ],
    },
  ];

  // Strict planetary habitat and ecological biome filtering:
  // - If planet has NO solid land, exclude land-only fungi!
  // - If planet has NO liquid oceans, exclude aquatic-only fungi!
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

  if (candidatePool.length === 0) {
    candidatePool = archetypes.filter(arch => {
      if (arch.habitatType === 'aquatic' && !hasLiquid) return false;
      if (arch.habitatType === 'land' && !hasLand) return false;
      return true;
    });
  }

  // Pick diverse archetypes deterministically for this seed (supports up to 20 species)
  const selectedArchetypes: FungiArchetypeConfig[] = [];
  if (candidatePool.length > 0) {
    for (let i = 0; i < speciesCount; i++) {
      const arch = candidatePool[(i + Math.floor(rng() * candidatePool.length)) % candidatePool.length];
      selectedArchetypes.push(arch);
    }
  }

  const speciesList: XenofungiSpecies[] = [];
  const usedScientificNames = new Set<string>();
  const usedCommonNames = new Set<string>();

  for (let i = 0; i < selectedArchetypes.length; i++) {
    const arch = selectedArchetypes[i];
    const specRng = createSeedRng((seed * 109 + i * 2677) >>> 0);

    const scaledHeight = isMulticellular
      ? +(arch.baseHeightM * heightMultiplier * (0.85 + specRng() * 0.3)).toFixed(2)
      : +(arch.baseHeightM * (0.85 + specRng() * 0.3)).toFixed(3);
    const scaledSpread = +(arch.baseSpreadM * (isMulticellular ? heightMultiplier : 1.0) * (0.85 + specRng() * 0.3)).toFixed(1);

    // Pick color entry
    const colorEntry = FUNGI_COLOR_TAXONOMY[(i + Math.floor(specRng() * FUNGI_COLOR_TAXONOMY.length)) % FUNGI_COLOR_TAXONOMY.length];
    const colorHex = pickRandom(colorEntry.hexColors, specRng);

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
    const { scientificName, commonName } = generateCoherentFungiName({
      formCategory: arch.formCategory,
      scaledHeight,
      nativeBiomeIds,
      trophicType: arch.trophicType,
      colorEntry,
      speciesIndex: i,
      rng: specRng,
      usedScientificNames,
      usedCommonNames,
    });

    const coverage = Math.round(5 + specRng() * 20);
    const descNote = arch.fieldNote(nativeBiomeNames.join(', '));

    speciesList.push({
      id: `fungi_${seed}_${i}`,
      kingdom: 'Fungi',
      formCategory: arch.formCategory,
      commonName,
      scientificName,
      growthForm: arch.growthForm,
      trophicType: arch.trophicType,
      pigmentName: colorEntry.pigmentLabel,
      pigmentColorHex: colorHex,
      averageHeightM: Math.max(0.001, scaledHeight),
      averageSpreadM: Math.max(0.05, scaledSpread),
      structuralPolymer,
      reproductionMethod: arch.reproductionMethod,
      nativeBiomeIds,
      nativeBiomeNames,
      canopyCoveragePct: coverage,
      adaptations: arch.adaptations,
      description: descNote,
    });
  }

  const dominantTrophicType = speciesList[0]?.trophicType || 'Saprotrophic Decomposer';

  const summaryText = !hasLand && hasLiquid
    ? `${diversityTier}: ${speciesList.length} distinct pelagic marine fungal taxa decomposing oceanic organic matter and colonizing hydrothermal vents.`
    : !isMulticellular
    ? `${diversityTier}: ${speciesList.length} distinct single-celled yeast and micro-mold taxa cycling nutrients across planetary soils.`
    : `${diversityTier}: ${speciesList.length} distinct macro-fungal taxa decomposing dead biomass, forming mycorrhizal symbionts, and harvesting ambient radiation.`;

  return {
    hasFungi: true,
    isMulticellular,
    dominantTrophicType,
    dominantPolymer: structuralPolymer,
    totalSpeciesCount: speciesList.length,
    diversityTier,
    summaryText,
    speciesList,
  };
}

/**
 * Filter fungal species native to a Goldberg tile's biomes.
 */
export function getFungiForTileBiomes(
  speciesList: XenofungiSpecies[],
  primaryBiomeId: number,
  secondaryBiomeId?: number | null
): XenofungiSpecies[] {
  return speciesList.filter(s =>
    s.nativeBiomeIds.includes(primaryBiomeId) ||
    (secondaryBiomeId !== undefined && secondaryBiomeId !== null && s.nativeBiomeIds.includes(secondaryBiomeId))
  );
}
