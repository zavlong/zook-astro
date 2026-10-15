/**
 * Zook Astro - Universe Storage & Persistent Cache
 * High-performance persistence for seeded galaxies, loaded sectors, and star systems.
 * Uses in-memory synchronization with background IndexedDB and localStorage persistence.
 */

import { GalaxyConfig, DEFAULT_GALAXY_CONFIG } from '../generation/galaxyGen';
import { SectorHexGridData } from '../generation/sectorHex';

export interface SavedGalaxy {
  id: string; // unique ID, e.g. "gal_4289_1698284729"
  name: string;
  seed: number;
  savedAt: number; // timestamp ms
  config: GalaxyConfig;
  notes?: string;
  stats?: {
    activeSectors?: number;
    totalEstimatedStars?: number;
    avgDensity?: number;
    avgAge?: number;
    nebulaCount?: number;
  };
}

const STORAGE_ACTIVE_GALAXY = 'zook_active_galaxy_config';
const STORAGE_SAVED_GALAXIES = 'zook_saved_galaxies_catalog';

const IDB_NAME = 'zook_universe_db';
const IDB_VERSION = 1;
const IDB_STORE_SECTORS = 'sectors';
const IDB_STORE_SYSTEMS = 'systems';

// ============================================================================
// INDEXEDDB PERSISTENCE LAYER
// ============================================================================

let idbPromise: Promise<IDBDatabase | null> | null = null;

function getIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (!idbPromise) {
    idbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE_SECTORS)) {
            db.createObjectStore(IDB_STORE_SECTORS);
          }
          if (!db.objectStoreNames.contains(IDB_STORE_SYSTEMS)) {
            db.createObjectStore(IDB_STORE_SYSTEMS);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('IndexedDB unavailable, falling back to in-memory/localStorage cache.');
          resolve(null);
        };
      } catch (e) {
        console.warn('Failed to open IndexedDB:', e);
        resolve(null);
      }
    });
  }
  return idbPromise;
}

async function idbSet(storeName: string, key: string, value: any): Promise<void> {
  const db = await getIDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbClear(storeName: string): Promise<void> {
  const db = await getIDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ============================================================================
// IN-MEMORY FAST CACHE SINGLETON
// ============================================================================

class UniverseCacheManager {
  private sectorCache = new Map<string, SectorHexGridData>();
  private systemCache = new Map<string, any>();
  private isInitialized = false;

  constructor() {
    this.init();
  }

  public init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // Load recent sectors and systems from IndexedDB in the background
    getIDB().then((db) => {
      if (!db) return;
      try {
        const txSec = db.transaction(IDB_STORE_SECTORS, 'readonly');
        const storeSec = txSec.objectStore(IDB_STORE_SECTORS);
        const reqSec = storeSec.openCursor();
        reqSec.onsuccess = (e) => {
          const cursor = (e.target as any).result;
          if (cursor) {
            this.sectorCache.set(cursor.key as string, cursor.value);
            cursor.continue();
          }
        };

        const txSys = db.transaction(IDB_STORE_SYSTEMS, 'readonly');
        const storeSys = txSys.objectStore(IDB_STORE_SYSTEMS);
        const reqSys = storeSys.openCursor();
        reqSys.onsuccess = (e) => {
          const cursor = (e.target as any).result;
          if (cursor) {
            this.systemCache.set(cursor.key as string, cursor.value);
            cursor.continue();
          }
        };
      } catch (err) {
        console.warn('Error hydrating UniverseCache from IndexedDB:', err);
      }
    });
  }

  // ==========================================================================
  // GALAXY PERSISTENCE & SEED MANAGEMENT
  // ==========================================================================

  public getActiveGalaxyConfig(): GalaxyConfig {
    if (typeof window === 'undefined') return DEFAULT_GALAXY_CONFIG;
    try {
      const raw = localStorage.getItem(STORAGE_ACTIVE_GALAXY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.seed === 'number') {
          return { ...DEFAULT_GALAXY_CONFIG, ...parsed };
        }
      }
    } catch (e) {
      console.warn('Failed to parse active galaxy config:', e);
    }
    return DEFAULT_GALAXY_CONFIG;
  }

  public saveActiveGalaxyConfig(config: GalaxyConfig): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_ACTIVE_GALAXY, JSON.stringify(config));
    } catch (e) {
      console.warn('Failed to save active galaxy config:', e);
    }
  }

  public getSavedGalaxies(): SavedGalaxy[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_SAVED_GALAXIES);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) return list;
      }
    } catch (e) {
      console.warn('Failed to parse saved galaxies catalog:', e);
    }
    return [];
  }

  public saveGalaxy(galaxy: SavedGalaxy): void {
    if (typeof window === 'undefined') return;
    const current = this.getSavedGalaxies();
    const existingIdx = current.findIndex((g) => g.id === galaxy.id);
    let updated: SavedGalaxy[];
    if (existingIdx >= 0) {
      updated = [...current];
      updated[existingIdx] = galaxy;
    } else {
      updated = [galaxy, ...current];
    }
    try {
      localStorage.setItem(STORAGE_SAVED_GALAXIES, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to write saved galaxy catalog:', e);
    }
  }

  public deleteSavedGalaxy(id: string): void {
    if (typeof window === 'undefined') return;
    const current = this.getSavedGalaxies();
    const updated = current.filter((g) => g.id !== id);
    try {
      localStorage.setItem(STORAGE_SAVED_GALAXIES, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to delete saved galaxy:', e);
    }
  }

  public exportGalaxyJson(galaxy: SavedGalaxy): void {
    if (typeof window === 'undefined') return;
    const jsonStr = JSON.stringify(galaxy, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${galaxy.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_seed${galaxy.seed}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public parseGalaxyJson(jsonStr: string): SavedGalaxy | null {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed.seed === 'number' && parsed.config) {
        return {
          id: parsed.id || `gal_${parsed.seed}_${Date.now()}`,
          name: parsed.name || parsed.config.name || `Imported Galaxy #${parsed.seed}`,
          seed: parsed.seed,
          savedAt: parsed.savedAt || Date.now(),
          config: { ...DEFAULT_GALAXY_CONFIG, ...parsed.config },
          notes: parsed.notes,
          stats: parsed.stats,
        };
      }
    } catch (e) {
      console.warn('Invalid galaxy JSON string:', e);
    }
    return null;
  }

  // ==========================================================================
  // SECTOR CACHE MANAGEMENT
  // ==========================================================================

  public getSectorCacheKey(seed: number | string, coord?: string): string {
    return coord ? `SEC_${seed}_${coord}` : `SEC_${seed}`;
  }

  public getCachedSector(key: string): SectorHexGridData | null {
    return this.sectorCache.get(key) || null;
  }

  public hasCachedSector(key: string): boolean {
    return this.sectorCache.has(key);
  }

  public cacheLoadedSector(key: string, data: SectorHexGridData): void {
    this.sectorCache.set(key, data);
    // Asynchronously persist into IndexedDB
    idbSet(IDB_STORE_SECTORS, key, data);
  }

  public getLoadedSectorCount(): number {
    return this.sectorCache.size;
  }

  public clearSectorCache(): void {
    this.sectorCache.clear();
    idbClear(IDB_STORE_SECTORS);
  }

  // ==========================================================================
  // STAR SYSTEM CACHE MANAGEMENT
  // ==========================================================================

  public getCachedSystem(systemId: string): any | null {
    return this.systemCache.get(systemId) || null;
  }

  public hasCachedSystem(systemId: string): boolean {
    return this.systemCache.has(systemId);
  }

  public cacheLoadedSystem(systemId: string, data: any): void {
    this.systemCache.set(systemId, data);
    // Asynchronously persist into IndexedDB
    idbSet(IDB_STORE_SYSTEMS, systemId, data);
  }

  public getLoadedSystemCount(): number {
    return this.systemCache.size;
  }

  public clearSystemCache(): void {
    this.systemCache.clear();
    idbClear(IDB_STORE_SYSTEMS);
  }
}

// Global Singleton Instance
export const universeCache = new UniverseCacheManager();
