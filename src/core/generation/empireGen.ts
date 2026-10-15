// ============================================================================
// EMPIRE GENERATION & PHENOTYPE DEFINITIONS FOR SECTOR HEX
// ============================================================================

import { SectorHexSystem } from './sectorHex';

export type AlienPhenotypeId =
  | 'humanoid'
  | 'reptilian'
  | 'avian'
  | 'arthropoid'
  | 'molluscoid'
  | 'plantoid'
  | 'fungoid'
  | 'lithoid'
  | 'aquatic'
  | 'synthetic'
  | 'energy';

export interface AlienPhenotype {
  id: AlienPhenotypeId;
  name: string;
  icon: string;
  description: string;
  favoredBiomes: string[];
}

export const ALIEN_PHENOTYPES: Record<AlienPhenotypeId, AlienPhenotype> = {
  humanoid: {
    id: 'humanoid',
    name: 'Humanoid',
    icon: '👤',
    description: 'Bipedal mammalian upright species with high adaptable generalist traits.',
    favoredBiomes: ['Continental', 'Temperate', 'Savannah'],
  },
  reptilian: {
    id: 'reptilian',
    name: 'Reptilian',
    icon: '🦎',
    description: 'Cold-blooded scaled saurian beings with robust thermal resilience and territorial clans.',
    favoredBiomes: ['Arid', 'Desert', 'Tropical'],
  },
  avian: {
    id: 'avian',
    name: 'Avian',
    icon: '🦅',
    description: 'Feathered endotherms with hollow carbon bones and acute spatial-stellar navigation.',
    favoredBiomes: ['Alpine', 'Savannah', 'Cloud Forests'],
  },
  arthropoid: {
    id: 'arthropoid',
    name: 'Arthropoid',
    icon: '🦗',
    description: 'Chitin-armored multi-limbed insectoids structured in hyper-coordinated hive castes.',
    favoredBiomes: ['Subterranean', 'Jungle', 'Deserts'],
  },
  molluscoid: {
    id: 'molluscoid',
    name: 'Molluscoid',
    icon: '🐙',
    description: 'Soft-bodied tentacled amphibious cephalopods adept at fluid pressure and acoustics.',
    favoredBiomes: ['Ocean', 'Archipelago', 'Trench'],
  },
  plantoid: {
    id: 'plantoid',
    name: 'Plantoid',
    icon: '🌿',
    description: 'Photosynthetic cellulose organisms linked via deep soil neural rhizome webs.',
    favoredBiomes: ['Continental', 'Tropical', 'Garden Worlds'],
  },
  fungoid: {
    id: 'fungoid',
    name: 'Fungoid',
    icon: '🍄',
    description: 'Mycelial spore-network organisms flourishing in humid organic decomposition zones.',
    favoredBiomes: ['Swamp', 'Fungal Caves', 'Dense Rainbelt'],
  },
  lithoid: {
    id: 'lithoid',
    name: 'Lithoid',
    icon: '💎',
    description: 'Silicon-crystalline beings sustained through mineral metabolism and tectonic harmonics.',
    favoredBiomes: ['Tomb Worlds', 'Barren Craters', 'Basalt Plains'],
  },
  aquatic: {
    id: 'aquatic',
    name: 'Aquatic',
    icon: '🐬',
    description: 'Hydrodynamic pelagic beings inhabiting immense global oceanic mantle depths.',
    favoredBiomes: ['Ocean Worlds', 'Glacial Under-ice', 'Pelagic'],
  },
  synthetic: {
    id: 'synthetic',
    name: 'Synthetic / Cybernetic',
    icon: '🤖',
    description: 'Self-replicating computational automata or cybernetic neural collectives.',
    favoredBiomes: ['Machine Worlds', 'Radiated Worlds', 'Any'],
  },
  energy: {
    id: 'energy',
    name: 'Energy / Ethereal',
    icon: '⚡',
    description: 'Non-corporeal electromagnetic lifeforms dwelling in high-energy plasma fields.',
    favoredBiomes: ['Plasma Belts', 'Auroral Worlds', 'Coronal'],
  },
};

export const PHENOTYPE_LIST: AlienPhenotype[] = Object.values(ALIEN_PHENOTYPES);

export interface SectorEmpire {
  id: string;
  name: string;
  color: string;
  phenotype: AlienPhenotype;
  homeworldSystemId: string;
  homeworldName: string;
  homeworldCoord: string;
  claimedSystemIds: string[];
  createdAt: number;
}

export const EMPIRE_COLOR_PALETTE: { name: string; hex: string }[] = [
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Solar Amber', hex: '#f59e0b' },
  { name: 'Crimson', hex: '#ef4444' },
  { name: 'Cyan Neon', hex: '#06b6d4' },
  { name: 'Magenta', hex: '#ec4899' },
  { name: 'Cobalt', hex: '#3b82f6' },
  { name: 'Lime', hex: '#84cc16' },
  { name: 'Radiant Orange', hex: '#f97316' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Gold', hex: '#eab308' },
  { name: 'Sky Blue', hex: '#0ea5e9' },
];

const SPECIES_PREFIXES = [
  'Val', 'Keld', 'Thol', 'Zenn', 'Vekt', 'Silic', 'Aethel', 'Kyron', 'Kryll', 'Drax',
  'Orix', 'Zeph', 'Vor', 'Sol', 'Xel', 'Naut', 'Mor', 'Astr', 'Chron', 'Pyth',
  'Illyr', 'Zor', 'Gorg', 'Vand', 'Phaer', 'Nyx', 'Cael', 'Myr', 'Lyra', 'Scyth',
];

const SPECIES_SUFFIXES = [
  'ari', 'ani', 'ian', 'or', 'ex', 'oid', 'ids', 'un', 'ath', 'ok',
  'ir', 'prime', 'kor', 'eth', 'on', 'ark', 'ix', 'us', 'ara', 'ite',
];

const GOV_TYPES = [
  'Dominion', 'Directorate', 'Hegemony', 'Ascendancy', 'Collective', 'Commonwealth',
  'Concordat', 'Sovereignty', 'Republic', 'Empire', 'Star League', 'Hivemind',
  'Synod', 'Coalition', 'Federation', 'Compact', 'Union', 'Mandate',
];

export function generateRandomEmpireName(phenotypeId?: AlienPhenotypeId): string {
  const prefix = SPECIES_PREFIXES[Math.floor(Math.random() * SPECIES_PREFIXES.length)];
  const suffix = SPECIES_SUFFIXES[Math.floor(Math.random() * SPECIES_SUFFIXES.length)];
  const species = `${prefix}${suffix}`;
  
  let gov = GOV_TYPES[Math.floor(Math.random() * GOV_TYPES.length)];
  if (phenotypeId === 'arthropoid' && Math.random() < 0.4) gov = 'Hivemind';
  if (phenotypeId === 'synthetic' && Math.random() < 0.4) gov = 'Nexus Matrix';
  if (phenotypeId === 'fungoid' && Math.random() < 0.3) gov = 'Spore Colony';
  if (phenotypeId === 'energy' && Math.random() < 0.3) gov = 'Convergence';
  
  const formats = [
    `${species} ${gov}`,
    `United ${species} ${gov}`,
    `Grand ${gov} of ${species}`,
    `${species} Star ${gov}`,
  ];
  return formats[Math.floor(Math.random() * formats.length)];
}

export function generateRandomEmpire(
  homeworldSystem: SectorHexSystem,
  usedColors: string[] = []
): SectorEmpire {
  const phenotypes = PHENOTYPE_LIST;
  const phenotype = phenotypes[Math.floor(Math.random() * phenotypes.length)];
  
  // Pick unused color if possible
  const availableColors = EMPIRE_COLOR_PALETTE.filter((c) => !usedColors.includes(c.hex));
  const chosenColor = availableColors.length > 0
    ? availableColors[Math.floor(Math.random() * availableColors.length)].hex
    : EMPIRE_COLOR_PALETTE[Math.floor(Math.random() * EMPIRE_COLOR_PALETTE.length)].hex;

  const name = generateRandomEmpireName(phenotype.id);
  const id = `emp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

  return {
    id,
    name,
    color: chosenColor,
    phenotype,
    homeworldSystemId: homeworldSystem.id,
    homeworldName: homeworldSystem.name,
    homeworldCoord: homeworldSystem.coord,
    claimedSystemIds: [homeworldSystem.id],
    createdAt: Date.now(),
  };
}

// ============================================================================
// PERSISTENT STORAGE FOR SECTOR EMPIRES
// ============================================================================

export const STORAGE_KEY_EMPIRES = 'zook_astro_sector_empires_v1';
export const STORAGE_KEY_LAST_CONFIG = 'zook_astro_last_sector_config';

export interface SectorEmpireStore {
  version: 1;
  sectors: Record<string, SectorEmpire[]>;
  lastActiveEmpireBySector: Record<string, string>;
}

export function getSectorStorageKey(seed: number, columns?: number, rows?: number): string {
  if (columns && rows) {
    return `seed_${seed}_${columns}x${rows}`;
  }
  return `seed_${seed}`;
}

export function loadEmpireStore(): SectorEmpireStore {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { version: 1, sectors: {}, lastActiveEmpireBySector: {} };
    }
    const raw = localStorage.getItem(STORAGE_KEY_EMPIRES);
    if (!raw) {
      return { version: 1, sectors: {}, lastActiveEmpireBySector: {} };
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        version: 1,
        sectors: parsed.sectors || {},
        lastActiveEmpireBySector: parsed.lastActiveEmpireBySector || {},
      };
    }
  } catch (err) {
    console.warn('Failed to load empire store from localStorage:', err);
  }
  return { version: 1, sectors: {}, lastActiveEmpireBySector: {} };
}

export function saveEmpireStore(store: SectorEmpireStore): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.setItem(STORAGE_KEY_EMPIRES, JSON.stringify(store));
  } catch (err) {
    console.warn('Failed to save empire store to localStorage:', err);
  }
}

export function loadEmpiresForSector(
  seed: number,
  columns?: number,
  rows?: number
): { empires: SectorEmpire[]; activeEmpireId: string | null } {
  const store = loadEmpireStore();
  const keySpecific = getSectorStorageKey(seed, columns, rows);
  const keyGeneric = getSectorStorageKey(seed);

  const empires = store.sectors[keySpecific] || store.sectors[keyGeneric] || [];
  const activeEmpireId =
    store.lastActiveEmpireBySector[keySpecific] ||
    store.lastActiveEmpireBySector[keyGeneric] ||
    (empires.length > 0 ? empires[0].id : null);

  return { empires, activeEmpireId };
}

export function saveEmpiresForSector(
  seed: number,
  empires: SectorEmpire[],
  activeEmpireId?: string | null,
  columns?: number,
  rows?: number
): void {
  const store = loadEmpireStore();
  const keySpecific = getSectorStorageKey(seed, columns, rows);
  const keyGeneric = getSectorStorageKey(seed);

  store.sectors[keySpecific] = empires;
  store.sectors[keyGeneric] = empires;

  if (activeEmpireId) {
    store.lastActiveEmpireBySector[keySpecific] = activeEmpireId;
    store.lastActiveEmpireBySector[keyGeneric] = activeEmpireId;
  } else if (empires.length > 0) {
    store.lastActiveEmpireBySector[keySpecific] = empires[0].id;
    store.lastActiveEmpireBySector[keyGeneric] = empires[0].id;
  } else {
    delete store.lastActiveEmpireBySector[keySpecific];
    delete store.lastActiveEmpireBySector[keyGeneric];
  }
  saveEmpireStore(store);
}

export function loadLastSectorConfig(): any | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = localStorage.getItem(STORAGE_KEY_LAST_CONFIG);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to load last sector config:', err);
  }
  return null;
}

export function saveLastSectorConfig(config: any): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.setItem(STORAGE_KEY_LAST_CONFIG, JSON.stringify(config));
  } catch (err) {
    console.warn('Failed to save last sector config:', err);
  }
}

export function exportEmpiresToJSON(): string {
  const store = loadEmpireStore();
  return JSON.stringify(store, null, 2);
}

export function importEmpiresFromJSON(jsonString: string): boolean {
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed && typeof parsed === 'object' && parsed.sectors) {
      saveEmpireStore({
        version: 1,
        sectors: parsed.sectors,
        lastActiveEmpireBySector: parsed.lastActiveEmpireBySector || {},
      });
      return true;
    }
  } catch (err) {
    console.error('Failed to parse imported empires JSON:', err);
  }
  return false;
}

export function downloadEmpiresJSON(seed: number): void {
  try {
    const jsonStr = exportEmpiresToJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zook_astro_empires_backup_seed_${seed}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to download empires backup JSON:', err);
  }
}



