/**
 * biomeTextureAtlas.ts
 * 
 * Manages, tiles, and recolors high-resolution (512x512) static biome texture assets:
 * - dune_sand.png (eolian wind ripples, slipfaces, grain sorting, quartz glitter)
 * - bedrock_strata.png (sedimentary strata, planar fractures, cleavage, cliff scree)
 * - vesicular_basalt.png (ropy pahoehoe folds, pumice gas pores, cooling fissures)
 * - glacial_ice.png (ice-wedge contraction polygons, sastrugi snowdrifts, crevasses)
 * - organic_foliage.png (canopy crowns, foliage blades, biocrust thallus felt)
 * - alluvial_mud.png (desiccation mud cracks, smooth silt basins, moisture darkening)
 * - regolith_gravel.png (multi-scale Voronoi pebbles, impact breccia, soil dust)
 * 
 * Tiling:
 * - Maps continuous world/tile coordinates through high-frequency periodic sampling (e.g. 24x - 64x repetition).
 * - Central-difference Sobel filtering derives high-fidelity micro-normals for 3D directional lighting.
 * 
 * Recoloring:
 * - Modulates base RGB according to the static texture's luminance channel (R) and ambient occlusion (G).
 * - Applies mineral/crystal/specular glints from the fleck channel (B).
 * - Seamlessly blends multiple biome archetypes across transition zones.
 */

export type BiomeTextureArchetype =
  | 'DUNE_SAND'
  | 'BEDROCK_STRATA'
  | 'VESICULAR_BASALT'
  | 'GLACIAL_PERMAFROST'
  | 'ORGANIC_VEGETATION'
  | 'ALLUVIAL_SILT'
  | 'REGOLITH_GRAVEL';

export interface TiledTexelSample {
  lum: number; // 0..255: high-frequency albedo luminance detail
  ao: number; // 0..255: micro ambient occlusion (crack & crevice shadow)
  fleck: number; // 0..255: mineral/crystal flecks or specular sheen
  height: number; // 0..255: micro surface elevation
  bumpX: number; // Central-difference normal bump X
  bumpZ: number; // Central-difference normal bump Z
}

export const BIOME_TEXTURE_FILENAMES: Record<BiomeTextureArchetype, string> = {
  DUNE_SAND: 'dune_sand.png',
  BEDROCK_STRATA: 'bedrock_strata.png',
  VESICULAR_BASALT: 'vesicular_basalt.png',
  GLACIAL_PERMAFROST: 'glacial_ice.png',
  ORGANIC_VEGETATION: 'organic_foliage.png',
  ALLUVIAL_SILT: 'alluvial_mud.png',
  REGOLITH_GRAVEL: 'regolith_gravel.png',
};

const TEXTURE_SIZE = 512;
const TEXTURE_MASK = TEXTURE_SIZE - 1;

// In-memory raw RGBA buffers (512 * 512 * 4 bytes per archetype)
const textureBuffers: Map<BiomeTextureArchetype, Uint8Array> = new Map();
let isStaticAssetsLoaded = false;
const loadListeners: Array<() => void> = [];

export function onBiomeTexturesLoaded(listener: () => void): () => void {
  loadListeners.push(listener);
  if (isStaticAssetsLoaded) {
    listener();
  }
  return () => {
    const idx = loadListeners.indexOf(listener);
    if (idx >= 0) loadListeners.splice(idx, 1);
  };
}

// ---------------------------------------------------------------------------
// Fast Built-In Procedural Fallback Generator (Ensures immediate 60fps render)
// ---------------------------------------------------------------------------
function generateFallbackBuffer(archetype: BiomeTextureArchetype): Uint8Array {
  const buf = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);

  for (let y = 0; y < TEXTURE_SIZE; y++) {
    const v = y / TEXTURE_SIZE;
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const u = x / TEXTURE_SIZE;
      let lum = 128;
      let ao = 200;
      let fleck = 0;
      let height = 128;

      switch (archetype) {
        case 'DUNE_SAND': {
          const ripple = Math.sin((u * 16.0 + Math.sin(v * Math.PI * 6.0) * 0.2) * Math.PI * 2.0);
          const micro = Math.sin(u * 48.0 * Math.PI * 2.0) * 0.35;
          lum = Math.round(128 + ripple * 45 + micro * 15);
          ao = Math.round(190 + ripple * 40);
          height = Math.round(128 + ripple * 60);
          break;
        }
        case 'BEDROCK_STRATA': {
          const strata = Math.sin((v * 18.0 + u * 4.0) * Math.PI * 2.0);
          const crack = Math.sin((u * 22.0 - v * 28.0) * Math.PI * 2.0);
          const isCrack = Math.abs(crack) < 0.12;
          lum = Math.round(128 + strata * 42 - (isCrack ? 60 : 0));
          ao = isCrack ? 90 : 210;
          height = Math.round(128 + strata * 50 - (isCrack ? 70 : 0));
          break;
        }
        case 'VESICULAR_BASALT': {
          const rope = Math.pow(Math.max(0, Math.sin((v * 14.0 + Math.sin(u * 8.0) * 0.3) * Math.PI * 2.0)), 1.5);
          const pore = Math.sin(u * 32.0 * Math.PI * 2.0) * Math.sin(v * 32.0 * Math.PI * 2.0);
          const isPore = pore > 0.65;
          lum = Math.round(110 + rope * 55 - (isPore ? 70 : 0));
          ao = isPore ? 80 : 190;
          height = Math.round(128 + rope * 65 - (isPore ? 80 : 0));
          break;
        }
        case 'GLACIAL_PERMAFROST': {
          const sastrugi = Math.sin((u * 10.0 - v * 8.0) * Math.PI * 2.0);
          const wedge = Math.abs(Math.sin(u * 12.0 * Math.PI * 2.0) * Math.sin(v * 12.0 * Math.PI * 2.0));
          const isWedge = wedge < 0.08;
          lum = Math.round(150 + sastrugi * 40 - (isWedge ? 50 : 0));
          ao = isWedge ? 100 : 225;
          fleck = Math.pow(Math.max(0, Math.sin((u * 80 + v * 60) * Math.PI * 2)), 12) > 0.5 ? 240 : 35;
          height = Math.round(128 + sastrugi * 50 - (isWedge ? 65 : 0));
          break;
        }
        case 'ORGANIC_VEGETATION': {
          const clump = Math.sin(u * 20.0 * Math.PI * 2.0) * Math.sin(v * 20.0 * Math.PI * 2.0);
          const blade = Math.sin((u * 44.0 + v * 30.0) * Math.PI * 2.0) * 0.4;
          lum = Math.round(128 + clump * 45 + blade * 25);
          ao = Math.round(195 + clump * 45);
          height = Math.round(128 + clump * 70);
          break;
        }
        case 'ALLUVIAL_SILT': {
          const mudCrack = Math.abs(Math.sin(u * 16.0 * Math.PI * 2.0) * Math.sin(v * 16.0 * Math.PI * 2.0));
          const isCrack = mudCrack < 0.10;
          lum = Math.round(120 - (isCrack ? 80 : 0));
          ao = isCrack ? 75 : 205;
          height = Math.round(128 - (isCrack ? 95 : 0));
          break;
        }
        case 'REGOLITH_GRAVEL': {
          const pebble = Math.sin(u * 28.0 * Math.PI * 2.0) * Math.sin(v * 28.0 * Math.PI * 2.0);
          const isPebble = pebble > 0.35;
          lum = Math.round(128 + (isPebble ? 50 : -20));
          ao = isPebble ? 220 : 180;
          height = Math.round(128 + (isPebble ? 75 : -25));
          break;
        }
      }

      const idx = (y * TEXTURE_SIZE + x) * 4;
      buf[idx] = Math.max(0, Math.min(255, lum));
      buf[idx + 1] = Math.max(0, Math.min(255, ao));
      buf[idx + 2] = Math.max(0, Math.min(255, fleck));
      buf[idx + 3] = Math.max(0, Math.min(255, height));
    }
  }

  return buf;
}

// Initialize fallback buffers immediately
const archetypes: BiomeTextureArchetype[] = [
  'DUNE_SAND',
  'BEDROCK_STRATA',
  'VESICULAR_BASALT',
  'GLACIAL_PERMAFROST',
  'ORGANIC_VEGETATION',
  'ALLUVIAL_SILT',
  'REGOLITH_GRAVEL',
];

for (const arch of archetypes) {
  textureBuffers.set(arch, generateFallbackBuffer(arch));
}

// ---------------------------------------------------------------------------
// Browser Static Image Asset Loader
// ---------------------------------------------------------------------------
let hasInitiatedLoad = false;

export function loadStaticBiomeTextures(): void {
  if (hasInitiatedLoad) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  hasInitiatedLoad = true;
  let remaining = archetypes.length;

  for (const arch of archetypes) {
    const filename = BIOME_TEXTURE_FILENAMES[arch];
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `/assets/textures/biomes/${filename}`;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = TEXTURE_SIZE;
        canvas.height = TEXTURE_SIZE;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
          const imgData = ctx.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
          textureBuffers.set(arch, new Uint8Array(imgData.data.buffer));
        }
      } catch (err) {
        console.warn(`Failed to parse texture asset ${filename}, keeping fallback:`, err);
      }
      remaining--;
      if (remaining === 0) {
        isStaticAssetsLoaded = true;
        loadListeners.forEach((l) => l());
      }
    };

    img.onerror = () => {
      remaining--;
      if (remaining === 0) {
        isStaticAssetsLoaded = true;
        loadListeners.forEach((l) => l());
      }
    };
  }
}

// Auto-trigger load in browser
if (typeof window !== 'undefined') {
  loadStaticBiomeTextures();
}

// ---------------------------------------------------------------------------
// High-Frequency Tiled Texture Sampling with Central-Difference Sobel Normal
// ---------------------------------------------------------------------------
export function sampleTiledBiomeTexel(
  archetype: BiomeTextureArchetype,
  worldX: number,
  worldZ: number,
  tilingFreq: number = 32.0
): TiledTexelSample {
  const buf = textureBuffers.get(archetype)!;

  // Seamless wrap onto [0, 1)
  const uFrac = ((worldX * tilingFreq) % 1.0 + 1.0) % 1.0;
  const vFrac = ((worldZ * tilingFreq) % 1.0 + 1.0) % 1.0;

  const tu = uFrac * TEXTURE_SIZE;
  const tv = vFrac * TEXTURE_SIZE;
  const iu = Math.floor(tu) & TEXTURE_MASK;
  const iv = Math.floor(tv) & TEXTURE_MASK;
  const fu = tu - Math.floor(tu);
  const fv = tv - Math.floor(tv);

  const iuNext = (iu + 1) & TEXTURE_MASK;
  const ivNext = (iv + 1) & TEXTURE_MASK;
  const iuPrev = (iu - 1 + TEXTURE_SIZE) & TEXTURE_MASK;
  const ivPrev = (iv - 1 + TEXTURE_SIZE) & TEXTURE_MASK;

  // Bilinear weights
  const w00 = (1 - fu) * (1 - fv);
  const w10 = fu * (1 - fv);
  const w01 = (1 - fu) * fv;
  const w11 = fu * fv;

  const i00 = (iv * TEXTURE_SIZE + iu) * 4;
  const i10 = (iv * TEXTURE_SIZE + iuNext) * 4;
  const i01 = (ivNext * TEXTURE_SIZE + iu) * 4;
  const i11 = (ivNext * TEXTURE_SIZE + iuNext) * 4;

  const lum = buf[i00] * w00 + buf[i10] * w10 + buf[i01] * w01 + buf[i11] * w11;
  const ao = buf[i00 + 1] * w00 + buf[i10 + 1] * w10 + buf[i01 + 1] * w01 + buf[i11 + 1] * w11;
  const fleck = buf[i00 + 2] * w00 + buf[i10 + 2] * w10 + buf[i01 + 2] * w01 + buf[i11 + 2] * w11;
  const height = buf[i00 + 3] * w00 + buf[i10 + 3] * w10 + buf[i01 + 3] * w01 + buf[i11 + 3] * w11;

  // Central difference for crisp micro normal bump
  const hLeft = buf[(iv * TEXTURE_SIZE + iuPrev) * 4 + 3];
  const hRight = buf[(iv * TEXTURE_SIZE + iuNext) * 4 + 3];
  const hUp = buf[(ivPrev * TEXTURE_SIZE + iu) * 4 + 3];
  const hDown = buf[(ivNext * TEXTURE_SIZE + iu) * 4 + 3];

  const bumpX = ((hRight - hLeft) / 255.0) * 1.5;
  const bumpZ = ((hDown - hUp) / 255.0) * 1.5;

  return { lum, ao, fleck, height, bumpX, bumpZ };
}

// ---------------------------------------------------------------------------
// Dynamic Planetary Recoloring Engine
// ---------------------------------------------------------------------------
export interface RecolorOptions {
  sample: TiledTexelSample;
  baseRgb: [number, number, number];
  mineralRgb?: [number, number, number];
  isCryoTholin?: boolean;
  roughnessBoost?: number;
}

export function recolorBiomeTexel(opts: RecolorOptions): {
  r: number;
  g: number;
  b: number;
  bumpX: number;
  bumpZ: number;
  hDelta: number;
} {
  const { sample, baseRgb, mineralRgb, isCryoTholin } = opts;

  // Relative luminance modulation centered at 128 (range ~0.55 to 1.45)
  const lumNorm = sample.lum / 128.0;
  const lumFactor = Math.pow(lumNorm, 1.15);

  // Micro ambient occlusion darkens deep cracks, pores, and pebble under-shadows
  const aoNorm = sample.ao / 255.0;
  const aoFactor = 0.35 + 0.65 * Math.pow(aoNorm, 1.4);

  let r = baseRgb[0] * lumFactor * aoFactor;
  let g = baseRgb[1] * lumFactor * aoFactor;
  let b = baseRgb[2] * lumFactor * aoFactor;

  // Planetary mineral crystal flecks / quartz / mica glitter
  if (sample.fleck > 80 && mineralRgb) {
    const shine = Math.pow((sample.fleck - 80) / 175.0, 2.5);
    r = r * (1 - shine * 0.45) + mineralRgb[0] * shine * 0.75;
    g = g * (1 - shine * 0.45) + mineralRgb[1] * shine * 0.75;
    b = b * (1 - shine * 0.45) + mineralRgb[2] * shine * 0.75;
  }

  // Tholin photochemical smog stains on cryo-plains
  if (isCryoTholin) {
    const stain = 1.0 - aoNorm;
    r = r * (1 - stain * 0.35) + 160 * (stain * 0.35);
    g = g * (1 - stain * 0.45) + 65 * (stain * 0.45);
    b = b * (1 - stain * 0.55) + 25 * (stain * 0.55);
  }

  // Normalized micro surface height displacement
  const hDelta = ((sample.height - 128) / 128.0) * 0.012;

  return {
    r: Math.max(0, Math.min(255, Math.round(r))),
    g: Math.max(0, Math.min(255, Math.round(g))),
    b: Math.max(0, Math.min(255, Math.round(b))),
    bumpX: sample.bumpX,
    bumpZ: sample.bumpZ,
    hDelta,
  };
}
