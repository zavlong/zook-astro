/**
 * scripts/generate-biome-textures.cjs
 * 
 * Generates high-resolution (512x512) seamless, tileable static texture maps for 7 generic planetary biome archetypes:
 * 1. dune_sand.png - Eolian sand ripples, mineral grain sorting, slipfaces, quartz glitter
 * 2. bedrock_strata.png - Sedimentary rock strata, planar fractures, cleavage, cliff scree
 * 3. vesicular_basalt.png - Ropy pahoehoe lava folds, vesicular gas pores, cooling fissures
 * 4. glacial_ice.png - Polygonal ice wedges, sastrugi wind ripples, micro-crevasses, frost glints
 * 5. organic_foliage.png - Interlocking leaf clusters, fibrous grass/thallus blades, moss felt
 * 6. alluvial_mud.png - Desiccation mud cracks, smooth silt basins, moisture darkening
 * 7. regolith_gravel.png - Multi-scale Voronoi pebble scatter, impact breccia, lunar soil dust
 * 
 * Each texture encodes:
 * - Red (R): High-contrast albedo luminance detail
 * - Green (G): Ambient occlusion & micro-crevice depth
 * - Blue (B): Mineral crystal flecks / specular sheen
 * - Alpha (A): Normal bump / height displacement
 * 
 * Outputs directly to public/assets/textures/biomes/ and dist/assets/textures/biomes/.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 512;
const targetDir = path.resolve(__dirname, '..', 'public', 'assets', 'textures', 'biomes');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Standard PNG Encoder using Node's built-in zlib
// ---------------------------------------------------------------------------
function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const typeAndData = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function writePNG(filepath, width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Filter 0
  ihdrData[12] = 0; // Non-interlaced
  const ihdr = makeChunk('IHDR', ihdrData);

  const rowSize = width * 4;
  const rawData = Buffer.alloc(height * (1 + rowSize));
  for (let y = 0; y < height; y++) {
    const rawOffset = y * (1 + rowSize);
    rawData[rawOffset] = 0; // Filter: None
    rgbaBuffer.copy(rawData, rawOffset + 1, y * rowSize, (y + 1) * rowSize);
  }

  const idat = makeChunk('IDAT', zlib.deflateSync(rawData, { level: 9 }));
  const iend = makeChunk('IEND', Buffer.alloc(0));
  const fullPng = Buffer.concat([signature, ihdr, idat, iend]);
  fs.writeFileSync(filepath, fullPng);
  console.log(`Generated: ${path.basename(filepath)} (${(fullPng.length / 1024).toFixed(1)} KB)`);
}

// ---------------------------------------------------------------------------
// Periodic 4D Torus Noise for 100% Seamless Tiling
// ---------------------------------------------------------------------------
function hash(x, y, z, w) {
  let h = (x * 127.1 + y * 311.7 + z * 74.7 + w * 269.5) * 43758.5453123;
  return (Math.sin(h) * 0.5 + 0.5);
}

// Seamless 2D noise by wrapping onto a 4D torus
function seamlessNoise(u, v, freq, seed = 0) {
  const nx = Math.cos(u * Math.PI * 2) * (freq / (Math.PI * 2));
  const ny = Math.sin(u * Math.PI * 2) * (freq / (Math.PI * 2));
  const nz = Math.cos(v * Math.PI * 2) * (freq / (Math.PI * 2));
  const nw = Math.sin(v * Math.PI * 2) * (freq / (Math.PI * 2));

  // Trilinear-like interpolation over 4D integer lattice
  const ix = Math.floor(nx);
  const iy = Math.floor(ny);
  const iz = Math.floor(nz);
  const iw = Math.floor(nw);
  const fx = nx - ix;
  const fy = ny - iy;
  const fz = nz - iz;
  const fw = nw - iw;

  const sfx = fx * fx * (3 - 2 * fx);
  const sfy = fy * fy * (3 - 2 * fy);
  const sfz = fz * fz * (3 - 2 * fz);
  const sfw = fw * fw * (3 - 2 * fw);

  let sum = 0;
  for (let dx = 0; dx <= 1; dx++) {
    const wx = dx === 0 ? (1 - sfx) : sfx;
    for (let dy = 0; dy <= 1; dy++) {
      const wy = dy === 0 ? (1 - sfy) : sfy;
      for (let dz = 0; dz <= 1; dz++) {
        const wz = dz === 0 ? (1 - sfz) : sfz;
        for (let dw = 0; dw <= 1; dw++) {
          const ww = dw === 0 ? (1 - sfw) : sfw;
          const hVal = hash(ix + dx + seed, iy + dy + seed * 2, iz + dz + seed * 3, iw + dw + seed * 4);
          sum += hVal * wx * wy * wz * ww;
        }
      }
    }
  }
  return sum;
}

function seamlessFbm(u, v, octaves = 4, baseFreq = 3, seed = 0) {
  let acc = 0;
  let amp = 0.5;
  let freq = baseFreq;
  let maxAmp = 0;
  for (let o = 0; o < octaves; o++) {
    acc += seamlessNoise(u, v, freq, seed + o * 17) * amp;
    maxAmp += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return acc / maxAmp;
}

// Toroidal distance for periodic Voronoi cells
function periodicTorusDist(u1, v1, u2, v2) {
  let du = Math.abs(u1 - u2);
  let dv = Math.abs(v1 - v2);
  if (du > 0.5) du = 1.0 - du;
  if (dv > 0.5) dv = 1.0 - dv;
  return Math.sqrt(du * du + dv * dv);
}

// Seamless periodic cellular / Voronoi noise
function seamlessCellular(u, v, cellCount, seed = 0) {
  const cu = u * cellCount;
  const cv = v * cellCount;
  const iu = Math.floor(cu);
  const iv = Math.floor(cv);

  let minDist = 999;
  let secondDist = 999;
  let cellHash = 0;

  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const neighborU = ((iu + di) % cellCount + cellCount) % cellCount;
      const neighborV = ((iv + dj) % cellCount + cellCount) % cellCount;

      // Deterministic feature point within neighbor cell
      const hx = hash(neighborU + seed, neighborV + seed * 7, 13, 29);
      const hy = hash(neighborU + seed * 3, neighborV + seed * 11, 41, 53);

      const pu = (neighborU + hx) / cellCount;
      const pv = (neighborV + hy) / cellCount;

      const d = periodicTorusDist(u, v, pu, pv) * cellCount;
      if (d < minDist) {
        secondDist = minDist;
        minDist = d;
        cellHash = hash(neighborU * 19 + seed, neighborV * 31 + seed, 7, 11);
      } else if (d < secondDist) {
        secondDist = d;
      }
    }
  }

  return { dist: minDist, edge: secondDist - minDist, cellHash };
}

// ---------------------------------------------------------------------------
// 1. DUNE SAND (Wind Ripples, Grain Sorting, Saltation, Glitter)
// ---------------------------------------------------------------------------
function generateDuneSand() {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;

      // Periodic transverse ripple phase
      const ripplePhase = (u * 14.0 + Math.sin(v * Math.PI * 6.0) * 0.25) * Math.PI * 2.0;
      const microRipple = Math.sin((u * 42.0 + Math.cos(v * Math.PI * 10.0) * 0.15) * Math.PI * 2.0);

      // Asymmetric slipface (sharp crest, gentle windward slope)
      const wave = Math.sin(ripplePhase);
      const slipface = wave > 0 ? Math.pow(wave, 0.75) : -Math.pow(-wave, 1.4);

      // Fine sand grain noise
      const grain = seamlessFbm(u, v, 3, 24, 101);
      const fineGrit = seamlessNoise(u, v, 64, 203);

      // Quartz / mineral glitter flecks
      const glitter = Math.pow(Math.max(0, Math.sin((u * 77 + v * 53 + fineGrit * 4) * Math.PI * 2)), 16);

      // Albedo luminance (centered at 128)
      const lum = Math.round(128 + slipface * 38 + microRipple * 14 + (grain - 0.5) * 32);
      // Ambient occlusion: troughs collect shadow / coarse lag deposits
      const ao = Math.round(180 + slipface * 55 - (1.0 - fineGrit) * 25);
      // Mineral fleck specular
      const fleck = Math.round(glitter * 255);
      // Normal bump height
      const bump = Math.round(128 + slipface * 65 + microRipple * 25 + (grain - 0.5) * 40);

      const idx = (y * SIZE + x) * 4;
      buf[idx] = Math.max(0, Math.min(255, lum));
      buf[idx + 1] = Math.max(0, Math.min(255, ao));
      buf[idx + 2] = Math.max(0, Math.min(255, fleck));
      buf[idx + 3] = Math.max(0, Math.min(255, bump));
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// 2. BEDROCK STRATA (Sedimentary Layers, Fractures, Cleavage, Scree)
// ---------------------------------------------------------------------------
function generateBedrockStrata() {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;

      // Periodic strata banding with slight geological tilt and warping
      const warp = seamlessFbm(u, v, 3, 4, 307) * 0.18;
      const strataPhase = (v * 16.0 + u * 4.0 + warp) * Math.PI * 2.0;
      const strataBands = Math.sin(strataPhase);
      const thinBands = Math.sin(strataPhase * 3.0 + warp * 5.0);

      // Orthogonal joint cleavage / fractures
      const crackCell = seamlessCellular(u, v, 8, 419);
      const isCrack = crackCell.edge < 0.12;
      const crackDepth = isCrack ? (1.0 - crackCell.edge / 0.12) : 0;

      // Coarse rock crag texture
      const crag = seamlessFbm(u, v, 4, 12, 521);
      const micaFleck = Math.pow(Math.max(0, Math.sin((u * 88 - v * 62 + crag * 6) * Math.PI * 2)), 14);

      let lum = Math.round(128 + strataBands * 36 + thinBands * 18 + (crag - 0.5) * 48 - crackDepth * 85);
      let ao = Math.round(210 - crackDepth * 140 - (1.0 - crag) * 45);
      let fleck = Math.round(micaFleck * 240);
      let bump = Math.round(128 + strataBands * 45 + (crag - 0.5) * 55 - crackDepth * 95);

      const idx = (y * SIZE + x) * 4;
      buf[idx] = Math.max(0, Math.min(255, lum));
      buf[idx + 1] = Math.max(0, Math.min(255, ao));
      buf[idx + 2] = Math.max(0, Math.min(255, fleck));
      buf[idx + 3] = Math.max(0, Math.min(255, bump));
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// 3. VESICULAR BASALT (Ropy Pahoehoe Folds, Gas Pores, Obsidian Sheen)
// ---------------------------------------------------------------------------
function generateVesicularBasalt() {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;

      // Curved ropy lava folds
      const foldWarp = seamlessNoise(u, v, 4, 601) * 0.35;
      const ropePhase = (v * 12.0 + Math.sin(u * Math.PI * 4.0 + foldWarp) * 0.45) * Math.PI * 2.0;
      const ropeFold = Math.pow(Math.max(0, Math.sin(ropePhase)), 1.6);

      // Vesicular gas bubble pores (dense Worley pits)
      const poreCell = seamlessCellular(u, v, 24, 709);
      const isPore = poreCell.dist < 0.28;
      const poreDepth = isPore ? Math.sqrt(1.0 - Math.pow(poreCell.dist / 0.28, 2)) : 0;

      // Vitrified obsidian glass sheen
      const glassyNoise = seamlessFbm(u, v, 3, 16, 811);
      const obsidianSheen = Math.pow(Math.max(0, seamlessNoise(u * 2, v * 2, 8, 907)), 4);

      let lum = Math.round(110 + ropeFold * 55 + (glassyNoise - 0.5) * 35 - poreDepth * 90);
      let ao = Math.round(200 - poreDepth * 160 - (1.0 - ropeFold) * 35);
      let fleck = Math.round(obsidianSheen * 220 + (poreDepth > 0 ? 0 : 30));
      let bump = Math.round(128 + ropeFold * 70 - poreDepth * 105 + (glassyNoise - 0.5) * 25);

      const idx = (y * SIZE + x) * 4;
      buf[idx] = Math.max(0, Math.min(255, lum));
      buf[idx + 1] = Math.max(0, Math.min(255, ao));
      buf[idx + 2] = Math.max(0, Math.min(255, fleck));
      buf[idx + 3] = Math.max(0, Math.min(255, bump));
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// 4. GLACIAL ICE (Ice Wedges, Sastrugi Ridges, Crevasses, Frost Crystals)
// ---------------------------------------------------------------------------
function generateGlacialIce() {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;

      // Polygonal thermal contraction ice wedges
      const wedgeCell = seamlessCellular(u, v, 6, 1013);
      const isWedge = wedgeCell.edge < 0.14;
      const wedgeDepth = isWedge ? (1.0 - wedgeCell.edge / 0.14) : 0;

      // Wind-carved sastrugi snow ridges
      const sastrugiPhase = (u * 8.0 - v * 6.0 + seamlessNoise(u, v, 4, 1123) * 0.25) * Math.PI * 2.0;
      const sastrugi = Math.sin(sastrugiPhase) * 0.6 + Math.sin(sastrugiPhase * 2.5) * 0.4;

      // Crystalline frost sparkle
      const crystalGlint = Math.pow(Math.max(0, Math.sin((u * 120 + v * 95) * Math.PI * 2)), 18);
      const fineFrost = seamlessFbm(u, v, 3, 20, 1237);

      let lum = Math.round(145 + sastrugi * 42 + (fineFrost - 0.5) * 28 - wedgeDepth * 65);
      let ao = Math.round(220 - wedgeDepth * 130);
      let fleck = Math.round(crystalGlint * 255 + 40); // High baseline specular for ice
      let bump = Math.round(128 + sastrugi * 55 - wedgeDepth * 85 + (fineFrost - 0.5) * 30);

      const idx = (y * SIZE + x) * 4;
      buf[idx] = Math.max(0, Math.min(255, lum));
      buf[idx + 1] = Math.max(0, Math.min(255, ao));
      buf[idx + 2] = Math.max(0, Math.min(255, fleck));
      buf[idx + 3] = Math.max(0, Math.min(255, bump));
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// 5. ORGANIC FOLIAGE (Canopy Crowns, Leaf Blades, Biocrust Thallus Felt)
// ---------------------------------------------------------------------------
function generateOrganicFoliage() {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;

      // Cellular leaf / crown thalli
      const foliageCell = seamlessCellular(u, v, 14, 1341);
      const crownProfile = Math.sqrt(Math.max(0, 1.0 - Math.min(1.0, foliageCell.dist * 1.5)));

      // Interlocking foliage blades / fibrous texture
      const bladeNoise = seamlessFbm(u, v, 4, 18, 1453);
      const fineBlades = Math.sin((u * 45.0 + v * 32.0 + bladeNoise * 4.0) * Math.PI * 2.0);

      // Cuticle wax sheen
      const waxSheen = Math.pow(Math.max(0, seamlessNoise(u, v, 6, 1567)), 3);

      // Gaps between clumps show deep shaded substrate
      const isGap = foliageCell.dist > 0.45;
      const gapShade = isGap ? Math.min(1.0, (foliageCell.dist - 0.45) / 0.15) : 0;

      let lum = Math.round(125 + crownProfile * 45 + fineBlades * 22 + (bladeNoise - 0.5) * 30 - gapShade * 70);
      let ao = Math.round(210 - gapShade * 150 + crownProfile * 35);
      let fleck = Math.round(waxSheen * 180);
      let bump = Math.round(128 + crownProfile * 75 + fineBlades * 35 - gapShade * 80);

      const idx = (y * SIZE + x) * 4;
      buf[idx] = Math.max(0, Math.min(255, lum));
      buf[idx + 1] = Math.max(0, Math.min(255, ao));
      buf[idx + 2] = Math.max(0, Math.min(255, fleck));
      buf[idx + 3] = Math.max(0, Math.min(255, bump));
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// 6. ALLUVIAL MUD (Desiccation Cracks, Smooth Silt, Moisture Darkening)
// ---------------------------------------------------------------------------
function generateAlluvialMud() {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;

      // Polygonal mud desiccation crack network
      const mudCell = seamlessCellular(u, v, 9, 1679);
      const isCrack = mudCell.edge < 0.11;
      const crackDepth = isCrack ? (1.0 - mudCell.edge / 0.11) : 0;

      // Plate curling (edges slightly curl upward before dropping into cracks)
      const plateCenterDist = mudCell.dist;
      const curl = Math.pow(Math.max(0, plateCenterDist - 0.25) * 2.0, 2) * 25;

      // Ultra-fine smooth silt grain
      const silt = seamlessNoise(u, v, 32, 1789) * 18;

      // Puddle / moisture gloss
      const moisturePool = Math.pow(Math.max(0, 1.0 - mudCell.dist * 2.2), 3);

      let lum = Math.round(120 + curl + silt - crackDepth * 95 - moisturePool * 40);
      let ao = Math.round(200 - crackDepth * 165);
      let fleck = Math.round(moisturePool * 230 + 15); // Glossy puddle specular
      let bump = Math.round(128 + curl * 1.5 - crackDepth * 110);

      const idx = (y * SIZE + x) * 4;
      buf[idx] = Math.max(0, Math.min(255, lum));
      buf[idx + 1] = Math.max(0, Math.min(255, ao));
      buf[idx + 2] = Math.max(0, Math.min(255, fleck));
      buf[idx + 3] = Math.max(0, Math.min(255, bump));
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// 7. REGOLITH GRAVEL (Voronoi Pebbles, Impact Breccia, Soil Dust)
// ---------------------------------------------------------------------------
function generateRegolithGravel() {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;

      // Multi-scale Voronoi pebble scatter
      const pebbleCoarse = seamlessCellular(u, v, 16, 1891);
      const pebbleFine = seamlessCellular(u, v, 36, 1993);

      // Spherical pebble height profile
      const isCoarsePebble = pebbleCoarse.dist < 0.32;
      const coarseHeight = isCoarsePebble ? Math.sqrt(1.0 - Math.pow(pebbleCoarse.dist / 0.32, 2)) : 0;

      const isFinePebble = pebbleFine.dist < 0.28;
      const fineHeight = isFinePebble ? Math.sqrt(1.0 - Math.pow(pebbleFine.dist / 0.28, 2)) * 0.5 : 0;

      // Fine powdery regolith dust
      const dust = seamlessFbm(u, v, 4, 28, 2101);

      // Impact glass spherules / crystalline ejecta
      const glassGlint = Math.pow(Math.max(0, Math.sin((u * 140 - v * 110 + dust * 5) * Math.PI * 2)), 16);

      // Contact shadows around pebbles
      const contactOcclusion = (coarseHeight > 0.05 ? 0 : Math.min(1, pebbleCoarse.dist * 2.5)) * 30;

      let lum = Math.round(128 + coarseHeight * 55 + fineHeight * 30 + (dust - 0.5) * 35 - contactOcclusion);
      let ao = Math.round(195 + coarseHeight * 45 - (1.0 - coarseHeight) * 35);
      let fleck = Math.round(glassGlint * 240);
      let bump = Math.round(128 + coarseHeight * 85 + fineHeight * 45 + (dust - 0.5) * 30);

      const idx = (y * SIZE + x) * 4;
      buf[idx] = Math.max(0, Math.min(255, lum));
      buf[idx + 1] = Math.max(0, Math.min(255, ao));
      buf[idx + 2] = Math.max(0, Math.min(255, fleck));
      buf[idx + 3] = Math.max(0, Math.min(255, bump));
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Run generation for all 7 biome texture assets
// ---------------------------------------------------------------------------
console.log(`Generating 512x512 seamless static biome texture assets into ${targetDir}...`);

const generators = [
  { name: 'dune_sand.png', gen: generateDuneSand },
  { name: 'bedrock_strata.png', gen: generateBedrockStrata },
  { name: 'vesicular_basalt.png', gen: generateVesicularBasalt },
  { name: 'glacial_ice.png', gen: generateGlacialIce },
  { name: 'organic_foliage.png', gen: generateOrganicFoliage },
  { name: 'alluvial_mud.png', gen: generateAlluvialMud },
  { name: 'regolith_gravel.png', gen: generateRegolithGravel },
];

for (const item of generators) {
  const buffer = item.gen();
  writePNG(path.join(targetDir, item.name), SIZE, SIZE, buffer);
}

console.log('Successfully generated all 7 static biome texture files!');
