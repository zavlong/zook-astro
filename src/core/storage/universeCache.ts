/**
 * Zook Astro - Universe Storage & Persistent Cache
 * High-performance persistence for seeded galaxies, loaded sectors, and star systems.
 * Uses in-memory synchronization with background IndexedDB and localStorage persistence.
 */

import { GalaxyConfig, DEFAULT_GALAXY_CONFIG } from '../generation/galaxyGen';
import { SectorHexGridData } from '../generation/sectorHex';
import { sanitizeRealisticSystem } from '../generation/realisticStarGen';

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
  cachedSectors?: Record<string, SectorHexGridData>;
  cachedSystems?: Record<string, any>;
  cachedSectorCount?: number;
  cachedSystemCount?: number;
}

const STORAGE_ACTIVE_GALAXY = 'zook_active_galaxy_config';
const STORAGE_SAVED_GALAXIES = 'zook_saved_galaxies_catalog';

const IDB_NAME = 'zook_universe_db';
const IDB_VERSION = 2;
const IDB_STORE_SECTORS = 'sectors';
const IDB_STORE_SYSTEMS = 'systems';
const IDB_STORE_GALAXIES = 'galaxies';

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
          if (!db.objectStoreNames.contains(IDB_STORE_GALAXIES)) {
            db.createObjectStore(IDB_STORE_GALAXIES);
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

async function idbGet(storeName: string, key: string): Promise<any> {
  const db = await getIDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await getIDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(key);
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
  private fullGalaxies = new Map<string, SavedGalaxy>();
  private isInitialized = false;

  constructor() {
    this.init();
  }

  public init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // Load recent sectors, systems, and saved galaxies from IndexedDB in the background
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
            this.systemCache.set(cursor.key as string, sanitizeRealisticSystem(cursor.value) || cursor.value);
            cursor.continue();
          }
        };

        if (db.objectStoreNames.contains(IDB_STORE_GALAXIES)) {
          const txGal = db.transaction(IDB_STORE_GALAXIES, 'readonly');
          const storeGal = txGal.objectStore(IDB_STORE_GALAXIES);
          const reqGal = storeGal.openCursor();
          reqGal.onsuccess = (e) => {
            const cursor = (e.target as any).result;
            if (cursor) {
              this.fullGalaxies.set(cursor.key as string, cursor.value);
              cursor.continue();
            }
          };
        }
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

  public getAllCachedSectors(): Record<string, SectorHexGridData> {
    const obj: Record<string, SectorHexGridData> = {};
    for (const [k, v] of this.sectorCache.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  public getAllCachedSystems(): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const [k, v] of this.systemCache.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  /**
   * Save the current universe state: galaxy config, seeds, all cached sectors, and all cached star systems
   */
  public saveCurrentUniverse(
    config: GalaxyConfig,
    name?: string,
    notes?: string,
    stats?: any
  ): SavedGalaxy {
    const cachedSectors = this.getAllCachedSectors();
    const cachedSystems = this.getAllCachedSystems();
    const sectorCount = Object.keys(cachedSectors).length;
    const systemCount = Object.keys(cachedSystems).length;
    const finalName = (name || config.name || `Galaxy Seed #${config.seed}`).trim();

    const saved: SavedGalaxy = {
      id: `gal_${config.seed}_${Date.now()}`,
      name: finalName,
      seed: config.seed,
      savedAt: Date.now(),
      config: { ...config, name: finalName },
      notes: notes || undefined,
      stats,
      cachedSectors,
      cachedSystems,
      cachedSectorCount: sectorCount,
      cachedSystemCount: systemCount,
    };

    this.saveGalaxy(saved);
    return saved;
  }

  public saveGalaxy(galaxy: SavedGalaxy): void {
    if (typeof window === 'undefined') return;

    // Cache full object in memory
    this.fullGalaxies.set(galaxy.id, galaxy);

    // Save full object into IndexedDB
    idbSet(IDB_STORE_GALAXIES, galaxy.id, galaxy);

    // Update saved catalog list
    const current = this.getSavedGalaxies();
    const existingIdx = current.findIndex((g) => g.id === galaxy.id);

    // Create a compact catalog item to avoid hitting 5MB localStorage limits
    const catalogItem: SavedGalaxy = {
      ...galaxy,
      cachedSectorCount:
        galaxy.cachedSectorCount ??
        (galaxy.cachedSectors ? Object.keys(galaxy.cachedSectors).length : 0),
      cachedSystemCount:
        galaxy.cachedSystemCount ??
        (galaxy.cachedSystems ? Object.keys(galaxy.cachedSystems).length : 0),
    };

    let updated: SavedGalaxy[];
    if (existingIdx >= 0) {
      updated = [...current];
      updated[existingIdx] = catalogItem;
    } else {
      updated = [catalogItem, ...current];
    }

    try {
      localStorage.setItem(STORAGE_SAVED_GALAXIES, JSON.stringify(updated));
    } catch (e) {
      // If quota exceeded, strip raw cached payload from localStorage catalog
      try {
        const lightweight = updated.map(({ cachedSectors, cachedSystems, ...meta }) => meta);
        localStorage.setItem(STORAGE_SAVED_GALAXIES, JSON.stringify(lightweight));
      } catch (inner) {
        console.warn('Failed to write saved galaxy catalog to localStorage:', inner);
      }
    }
  }

  /**
   * Load and rehydrate a saved galaxy and all its cached sectors & star systems
   */
  public loadGalaxy(saved: SavedGalaxy): void {
    this.saveActiveGalaxyConfig(saved.config);

    // Rehydrate cached sectors into memory & IndexedDB
    if (saved.cachedSectors) {
      for (const [key, data] of Object.entries(saved.cachedSectors)) {
        this.cacheLoadedSector(key, data);
      }
    }

    // Rehydrate cached systems into memory & IndexedDB
    if (saved.cachedSystems) {
      for (const [id, data] of Object.entries(saved.cachedSystems)) {
        this.cacheLoadedSystem(id, data);
      }
    }
  }

  public deleteSavedGalaxy(id: string): void {
    if (typeof window === 'undefined') return;
    this.fullGalaxies.delete(id);
    idbDelete(IDB_STORE_GALAXIES, id);
    const current = this.getSavedGalaxies();
    const updated = current.filter((g) => g.id !== id);
    try {
      localStorage.setItem(STORAGE_SAVED_GALAXIES, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to delete saved galaxy:', e);
    }
  }

  public async exportGalaxyJson(saved: SavedGalaxy): Promise<void> {
    if (typeof window === 'undefined') return;

    let toExport = saved;
    // If saved galaxy from catalog doesn't have the cached payload attached, retrieve full version
    if (!saved.cachedSectors || !saved.cachedSystems) {
      const full = this.fullGalaxies.get(saved.id) || (await idbGet(IDB_STORE_GALAXIES, saved.id));
      if (full) {
        toExport = { ...saved, ...full };
      }
    }

    const jsonStr = JSON.stringify(toExport, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${toExport.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_seed${toExport.seed}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public parseGalaxyJson(jsonStr: string): SavedGalaxy | null {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed.seed === 'number' && parsed.config) {
        const result: SavedGalaxy = {
          id: parsed.id || `gal_${parsed.seed}_${Date.now()}`,
          name: parsed.name || parsed.config.name || `Imported Galaxy #${parsed.seed}`,
          seed: parsed.seed,
          savedAt: parsed.savedAt || Date.now(),
          config: { ...DEFAULT_GALAXY_CONFIG, ...parsed.config },
          notes: parsed.notes,
          stats: parsed.stats,
          cachedSectors: parsed.cachedSectors,
          cachedSystems: parsed.cachedSystems,
          cachedSectorCount:
            parsed.cachedSectorCount ??
            (parsed.cachedSectors ? Object.keys(parsed.cachedSectors).length : 0),
          cachedSystemCount:
            parsed.cachedSystemCount ??
            (parsed.cachedSystems ? Object.keys(parsed.cachedSystems).length : 0),
        };
        return result;
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

  public isSectorCached(seed: number | string, coord?: string): boolean {
    if (coord) {
      const keyWithCoord = this.getSectorCacheKey(seed, coord);
      if (this.sectorCache.has(keyWithCoord)) return true;
    }
    const keyBare = `SEC_${seed}`;
    if (this.sectorCache.has(keyBare)) return true;
    if (coord) {
      for (const k of this.sectorCache.keys()) {
        if (k.endsWith(`_${coord}`)) return true;
      }
    }
    return false;
  }

  public getCachedSectorKeySet(): Set<string> {
    return new Set(this.sectorCache.keys());
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

  private lastActiveSystem: any | null = null;

  public getCachedSystem(systemId: string): any | null {
    const sys = this.systemCache.get(systemId) || null;
    return sys ? sanitizeRealisticSystem(sys) : null;
  }

  public getLastActiveSystem(): any | null {
    const sys = this.lastActiveSystem || this.systemCache.get('STARGEN_ACTIVE_SYSTEM') || null;
    return sys ? sanitizeRealisticSystem(sys) : null;
  }

  public setLastActiveSystem(data: any): void {
    if (!data) return;
    const sanitized = sanitizeRealisticSystem(data) || data;
    this.lastActiveSystem = sanitized;
    const sysId = sanitized?.step1?.id || 'STARGEN_ACTIVE_SYSTEM';
    this.systemCache.set(sysId, sanitized);
    this.systemCache.set('STARGEN_ACTIVE_SYSTEM', sanitized);
    idbSet(IDB_STORE_SYSTEMS, sysId, sanitized);
    idbSet(IDB_STORE_SYSTEMS, 'STARGEN_ACTIVE_SYSTEM', sanitized);
  }

  public hasCachedSystem(systemId: string): boolean {
    return this.systemCache.has(systemId);
  }

  public getCachedSystemKeySet(): Set<string> {
    return new Set(this.systemCache.keys());
  }

  public cacheLoadedSystem(systemId: string, data: any): void {
    const sanitized = sanitizeRealisticSystem(data) || data;
    this.lastActiveSystem = sanitized;
    this.systemCache.set(systemId, sanitized);
    this.systemCache.set('STARGEN_ACTIVE_SYSTEM', sanitized);
    // Asynchronously persist into IndexedDB
    idbSet(IDB_STORE_SYSTEMS, systemId, sanitized);
    idbSet(IDB_STORE_SYSTEMS, 'STARGEN_ACTIVE_SYSTEM', sanitized);
  }

  public getLoadedSystemCount(): number {
    return this.systemCache.size;
  }

  public clearSystemCache(): void {
    this.lastActiveSystem = null;
    this.systemCache.clear();
    idbClear(IDB_STORE_SYSTEMS);
  }
}

// Global Singleton Instance
export const universeCache = new UniverseCacheManager();

