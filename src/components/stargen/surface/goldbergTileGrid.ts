import { RealisticPlanetBody } from '../../../core/generation/realisticStarGen';
import { RealisticMoon } from '../../../types/astrophysics';
import {
  PlanetarySurfaceModel,
  sampleSurfacePoint,
} from './surfaceGenMath';

export interface GoldbergTopologyCell {
  tileId: number;
  isPentagon: boolean;
  unitVec: [number, number, number]; // (sx, sy, sz) in planetary sphere coords (sy = sin(lat), sx = cos(lat)sin(lon), sz = cos(lat)cos(lon))
  centerLat: number;
  centerLon: number;
  neighbors: number[]; // Ordered counter-clockwise around local tangent plane (East, North)
  neighborAzimuthDeg: number[]; // Compass bearing (0 = N, 90 = E, 180 = S, 270 = W) to each neighbor
  polygon3D: [number, number, number][]; // 6 (or 5) dual Voronoi vertices on unit sphere
}

export interface GoldbergTopology {
  frequency: number;
  tileCount: number;
  cells: GoldbergTopologyCell[];
  texelTileId: Uint16Array; // 360 * 180 lookup: tileId at each 1-deg equirectangular texel
  hiResTileId: Uint16Array; // 720 * 360 lookup for crisp 2D map border rendering
  hiResIsBorder: Uint8Array; // 720 * 360 boolean flag (1 if on hex/pentagon border)
}

export interface GoldbergPlanetaryTile {
  tileId: number;
  isPentagon: boolean;
  centerLat: number;
  centerLon: number;
  unitVec: [number, number, number];
  biomeId: number;
  biomeName: string;
  primaryBiomeName: string;
  biomeColor: string;
  secondaryBiomeId: number | null;
  secondaryBiomeName: string | null;
  secondaryBiomeColor: string | null;
  secondaryBiomeWeight: number;
  transitionAngleRad: number;
  isOcean: boolean;
  isIce: boolean;
  isLava: boolean;
  meanHNorm: number;
  elevationKm: number;
  elevationMeters: number;
  reliefSpanKm: number;
  temperatureK: number;
  temperatureC: number;
  pressureBar: number;
  moisture: number;
  cloudCover: number;
  craterIntensity: number;
  fractureIntensity: number;
  volcanoIntensity: number;
  featureName: string;
  neighbors: number[];
  neighborAzimuthDeg: number[];
  polygon3D: [number, number, number][];
}

export interface PlanetaryGoldbergGrid {
  frequency: number;
  tileCount: number;
  tiles: GoldbergPlanetaryTile[];
  topology: GoldbergTopology;
}

// Default subdivision frequency n = 7 -> 10 * 7^2 + 2 = 492 tiles (480 hexagons + 12 pentagons)
const DEFAULT_GOLDBERG_FREQ = 7;
let cachedTopology: GoldbergTopology | null = null;

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function unitVecToLatLon(v: [number, number, number]): { lat: number; lon: number } {
  const sy = Math.max(-1, Math.min(1, v[1]));
  const lat = (Math.asin(sy) * 180) / Math.PI;
  const lon = (Math.atan2(v[0], v[2]) * 180) / Math.PI;
  return { lat, lon };
}

function latLonToUnitVec(latDeg: number, lonDeg: number): [number, number, number] {
  const latRad = (latDeg * Math.PI) / 180;
  const lonRad = (lonDeg * Math.PI) / 180;
  const cosLat = Math.cos(latRad);
  return [
    cosLat * Math.sin(lonRad),
    Math.sin(latRad),
    cosLat * Math.cos(lonRad),
  ];
}

/**
 * Builds the canonical Goldberg Polyhedron (dual of a frequency-n subdivided geodesic icosahedron)
 * with 10 * n^2 + 2 cells (12 pentagons at the icosahedron vertices and 10*(n^2 - 1) hexagons).
 */
export function getCanonicalGoldbergTopology(freq: number = DEFAULT_GOLDBERG_FREQ): GoldbergTopology {
  if (cachedTopology && cachedTopology.frequency === freq) {
    return cachedTopology;
  }

  // 1. Construct regular icosahedron with North Pole (0,1,0) and South Pole (0,-1,0)
  const icoVerts: [number, number, number][] = [];
  icoVerts.push([0, 1, 0]); // 0: North Pole
  const latRing = Math.atan(0.5); // ~26.565 deg
  const cosR = Math.cos(latRing);
  const sinR = Math.sin(latRing);

  // Upper ring: indices 1..5
  for (let i = 0; i < 5; i++) {
    const lon = (i * 72 * Math.PI) / 180;
    icoVerts.push([cosR * Math.sin(lon), sinR, cosR * Math.cos(lon)]);
  }
  // Lower ring: indices 6..10
  for (let i = 0; i < 5; i++) {
    const lon = ((i * 72 + 36) * Math.PI) / 180;
    icoVerts.push([cosR * Math.sin(lon), -sinR, cosR * Math.cos(lon)]);
  }
  icoVerts.push([0, -1, 0]); // 11: South Pole

  const icoFaces: [number, number, number][] = [
    // 5 top cap triangles
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 5],
    [0, 5, 1],
    // 10 equatorial belt triangles
    [1, 6, 2],
    [2, 6, 7],
    [2, 7, 3],
    [3, 7, 8],
    [3, 8, 4],
    [4, 8, 9],
    [4, 9, 5],
    [5, 9, 10],
    [5, 10, 1],
    [1, 10, 6],
    // 5 bottom cap triangles
    [11, 7, 6],
    [11, 8, 7],
    [11, 9, 8],
    [11, 10, 9],
    [11, 6, 10],
  ];

  // 2. Subdivide each icosahedral face into freq^2 geodesic sub-triangles, deduplicating shared vertices
  const verts: [number, number, number][] = [];
  const isPentagonArr: boolean[] = [];
  const vertKeyMap = new Map<string, number>();

  const getOrAddVert = (x: number, y: number, z: number, isCorner: boolean): number => {
    const [nx, ny, nz] = normalize3(x, y, z);
    // Quantize to 1e-5 for exact vertex welding along icosahedron edges/corners
    const key = `${Math.round(nx * 100000)}_${Math.round(ny * 100000)}_${Math.round(nz * 100000)}`;
    const existing = vertKeyMap.get(key);
    if (existing !== undefined) {
      if (isCorner) isPentagonArr[existing] = true;
      return existing;
    }
    const idx = verts.length;
    verts.push([nx, ny, nz]);
    isPentagonArr.push(isCorner);
    vertKeyMap.set(key, idx);
    return idx;
  };

  const subTris: [number, number, number][] = [];

  for (const [iA, iB, iC] of icoFaces) {
    const A = icoVerts[iA];
    const B = icoVerts[iB];
    const C = icoVerts[iC];

    // Grid of vertex indices on this face: row r from 0..freq, col c from 0..(freq - r)
    const gridIdx: number[][] = [];
    for (let r = 0; r <= freq; r++) {
      const row: number[] = [];
      for (let c = 0; c <= freq - r; c++) {
        const u = r / freq;
        const v = c / freq;
        const w = 1 - u - v;
        const px = w * A[0] + u * B[0] + v * C[0];
        const py = w * A[1] + u * B[1] + v * C[1];
        const pz = w * A[2] + u * B[2] + v * C[2];
        const isCorner =
          (r === 0 && c === 0) ||
          (r === freq && c === 0) ||
          (r === 0 && c === freq);
        row.push(getOrAddVert(px, py, pz, isCorner));
      }
      gridIdx.push(row);
    }

    for (let r = 0; r < freq; r++) {
      for (let c = 0; c < freq - r; c++) {
        // Upright triangle
        subTris.push([gridIdx[r][c], gridIdx[r + 1][c], gridIdx[r][c + 1]]);
        // Inverted triangle
        if (c + 1 < freq - r) {
          subTris.push([gridIdx[r + 1][c], gridIdx[r + 1][c + 1], gridIdx[r][c + 1]]);
        }
      }
    }
  }

  const tileCount = verts.length; // 10 * freq^2 + 2 = 492

  // 3. Build vertex-to-neighbor and vertex-to-incident-triangle adjacency
  const neighborSets: Set<number>[] = Array.from({ length: tileCount }, () => new Set<number>());
  const incidentTris: number[][] = Array.from({ length: tileCount }, () => []);

  subTris.forEach(([v0, v1, v2], tIdx) => {
    neighborSets[v0].add(v1);
    neighborSets[v0].add(v2);
    neighborSets[v1].add(v0);
    neighborSets[v1].add(v2);
    neighborSets[v2].add(v0);
    neighborSets[v2].add(v1);

    incidentTris[v0].push(tIdx);
    incidentTris[v1].push(tIdx);
    incidentTris[v2].push(tIdx);
  });

  // 4. Perform 2 passes of tangential spring relaxation on the non-pentagon vertices
  // so the Goldberg hexagons have even more uniform area across icosahedral face interiors & edges
  for (let iter = 0; iter < 2; iter++) {
    const nextVerts: [number, number, number][] = verts.map((v) => [...v]);
    for (let i = 0; i < tileCount; i++) {
      if (isPentagonArr[i]) continue;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      neighborSets[i].forEach((nb) => {
        sx += verts[nb][0];
        sy += verts[nb][1];
        sz += verts[nb][2];
      });
      const count = neighborSets[i].size || 1;
      const mx = verts[i][0] * 0.55 + (sx / count) * 0.45;
      const my = verts[i][1] * 0.55 + (sy / count) * 0.45;
      const mz = verts[i][2] * 0.55 + (sz / count) * 0.45;
      nextVerts[i] = normalize3(mx, my, mz);
    }
    for (let i = 0; i < tileCount; i++) {
      verts[i] = nextVerts[i];
    }
  }

  // Compute sub-triangle spherical centroids (dual vertices of the Goldberg polyhedron)
  const triCentroids: [number, number, number][] = subTris.map(([v0, v1, v2]) =>
    normalize3(
      verts[v0][0] + verts[v1][0] + verts[v2][0],
      verts[v0][1] + verts[v1][1] + verts[v2][1],
      verts[v0][2] + verts[v1][2] + verts[v2][2]
    )
  );

  // 5. Construct GoldbergTopologyCell array with sorted neighbors & dual polygon vertices
  const cells: GoldbergTopologyCell[] = [];
  for (let i = 0; i < tileCount; i++) {
    const v = verts[i];
    const { lat, lon } = unitVecToLatLon(v);

    // Local tangent basis: East (eEast) and North (eNorth)
    const lonRad = (lon * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;
    const eEast: [number, number, number] = [Math.cos(lonRad), 0, -Math.sin(lonRad)];
    const eNorth: [number, number, number] = [
      -Math.sin(latRad) * Math.sin(lonRad),
      Math.cos(latRad),
      -Math.sin(latRad) * Math.cos(lonRad),
    ];

    // Sort neighbors counter-clockwise by angle in tangent plane
    const nbList = Array.from(neighborSets[i]).map((nbId) => {
      const nv = verts[nbId];
      const dx = nv[0] - v[0];
      const dy = nv[1] - v[1];
      const dz = nv[2] - v[2];
      const east = dx * eEast[0] + dy * eEast[1] + dz * eEast[2];
      const north = dx * eNorth[0] + dy * eNorth[1] + dz * eNorth[2];
      const angleCCW = Math.atan2(north, east);
      // Compass azimuth: 0 = North, 90 = East, 180 = South, 270 = West
      const azDeg = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
      return { nbId, angleCCW, azDeg };
    });
    nbList.sort((a, b) => a.angleCCW - b.angleCCW);

    // Sort incident triangle centroids counter-clockwise to form the closed hexagon/pentagon boundary
    const polyList = incidentTris[i].map((tIdx) => {
      const tc = triCentroids[tIdx];
      const dx = tc[0] - v[0];
      const dy = tc[1] - v[1];
      const dz = tc[2] - v[2];
      const east = dx * eEast[0] + dy * eEast[1] + dz * eEast[2];
      const north = dx * eNorth[0] + dy * eNorth[1] + dz * eNorth[2];
      const angleCCW = Math.atan2(north, east);
      return { tc, angleCCW };
    });
    polyList.sort((a, b) => a.angleCCW - b.angleCCW);

    cells.push({
      tileId: i,
      isPentagon: isPentagonArr[i],
      unitVec: v,
      centerLat: +lat.toFixed(2),
      centerLon: +lon.toFixed(2),
      neighbors: nbList.map((n) => n.nbId),
      neighborAzimuthDeg: nbList.map((n) => Math.round(n.azDeg)),
      polygon3D: polyList.map((p) => p.tc),
    });
  }

  // 6. Precompute 360x180 texelTileId lookup and 720x360 hi-res border lookup
  const texelTileId = new Uint16Array(360 * 180);
  for (let y = 0; y < 180; y++) {
    const lat = 89.5 - y;
    for (let x = 0; x < 360; x++) {
      const lon = x - 179.5;
      const uVec = latLonToUnitVec(lat, lon);
      let bestId = 0;
      let bestDot = -2;
      for (let i = 0; i < tileCount; i++) {
        const cv = cells[i].unitVec;
        const dot = uVec[0] * cv[0] + uVec[1] * cv[1] + uVec[2] * cv[2];
        if (dot > bestDot) {
          bestDot = dot;
          bestId = i;
        }
      }
      texelTileId[y * 360 + x] = bestId;
    }
  }

  const hiW = 720;
  const hiH = 360;
  const hiResTileId = new Uint16Array(hiW * hiH);
  for (let y = 0; y < hiH; y++) {
    const lat = 90 - ((y + 0.5) / hiH) * 180;
    const baseY = Math.min(179, y >> 1);
    for (let x = 0; x < hiW; x++) {
      const lon = ((x + 0.5) / hiW) * 360 - 180;
      const baseX = Math.min(359, x >> 1);
      // Seed search from the 360x180 cell + its neighbors for instant O(1) lookup!
      const seedTile = texelTileId[baseY * 360 + baseX];
      const uVec = latLonToUnitVec(lat, lon);
      let bestId = seedTile;
      const sv = cells[seedTile].unitVec;
      let bestDot = uVec[0] * sv[0] + uVec[1] * sv[1] + uVec[2] * sv[2];
      const nbs = cells[seedTile].neighbors;
      for (let k = 0; k < nbs.length; k++) {
        const candId = nbs[k];
        const cv = cells[candId].unitVec;
        const dot = uVec[0] * cv[0] + uVec[1] * cv[1] + uVec[2] * cv[2];
        if (dot > bestDot) {
          bestDot = dot;
          bestId = candId;
        }
      }
      hiResTileId[y * hiW + x] = bestId;
    }
  }

  const hiResIsBorder = new Uint8Array(hiW * hiH);
  for (let y = 0; y < hiH; y++) {
    const yDown = Math.min(hiH - 1, y + 1);
    for (let x = 0; x < hiW; x++) {
      const xRight = (x + 1) % hiW;
      const idx = y * hiW + x;
      const t0 = hiResTileId[idx];
      if (t0 !== hiResTileId[y * hiW + xRight] || t0 !== hiResTileId[yDown * hiW + x]) {
        hiResIsBorder[idx] = 1;
      }
    }
  }

  cachedTopology = {
    frequency: freq,
    tileCount,
    cells,
    texelTileId,
    hiResTileId,
    hiResIsBorder,
  };
  return cachedTopology;
}

/**
 * Fast O(1) lookup of the Goldberg tile and its spherical border proximity at any 3D unit vector (sx, sy, sz)
 * or (lat, lon) using the 360x180 seed table + local neighbor refinement.
 */
export function queryGoldbergTileAtUnitVec(
  topology: GoldbergTopology,
  sx: number,
  sy: number,
  sz: number
): { tileId: number; secondTileId: number; borderGap: number } {
  const clampedSy = Math.max(-1, Math.min(1, sy));
  const latDeg = (Math.asin(clampedSy) * 180) / Math.PI;
  const lonDeg = (Math.atan2(sx, sz) * 180) / Math.PI;
  const x = Math.max(0, Math.min(359, Math.floor(((lonDeg + 180) % 360 + 360) % 360)));
  const y = Math.max(0, Math.min(179, Math.floor(90 - latDeg)));

  const seedId = topology.texelTileId[y * 360 + x];
  const cells = topology.cells;

  // Check seedId and its 1-ring (and 2-ring if needed)
  let bestId = seedId;
  const sv = cells[seedId].unitVec;
  let bestDot = sx * sv[0] + sy * sv[1] + sz * sv[2];
  let secondId = seedId;
  let secondDot = -2;

  const nbs = cells[seedId].neighbors;
  for (let i = 0; i < nbs.length; i++) {
    const cid = nbs[i];
    const cv = cells[cid].unitVec;
    const dot = sx * cv[0] + sy * cv[1] + sz * cv[2];
    if (dot > bestDot) {
      secondDot = bestDot;
      secondId = bestId;
      bestDot = dot;
      bestId = cid;
    } else if (dot > secondDot) {
      secondDot = dot;
      secondId = cid;
    }
  }

  // If bestId changed from seedId, also check bestId's neighbors so secondDot is exact across cell corners
  if (bestId !== seedId) {
    const nbs2 = cells[bestId].neighbors;
    for (let i = 0; i < nbs2.length; i++) {
      const cid = nbs2[i];
      if (cid === bestId) continue;
      const cv = cells[cid].unitVec;
      const dot = sx * cv[0] + sy * cv[1] + sz * cv[2];
      if (dot > bestDot) {
        secondDot = bestDot;
        secondId = bestId;
        bestDot = dot;
        bestId = cid;
      } else if (dot > secondDot) {
        secondDot = dot;
        secondId = cid;
      }
    }
  }

  return {
    tileId: bestId,
    secondTileId: secondId,
    borderGap: Math.max(0, bestDot - secondDot),
  };
}

/**
 * Computes the planetary Goldberg tile grid for a given PlanetarySurfaceModel, snapping each tile
 * to a single unified biome and aggregating its physical terrain & atmospheric properties.
 */
const planetaryGridCache = new WeakMap<PlanetarySurfaceModel, PlanetaryGoldbergGrid>();

export function getPlanetaryGoldbergGrid(
  surfaceModel: PlanetarySurfaceModel,
  planet: RealisticPlanetBody,
  moon: RealisticMoon | null | undefined
): PlanetaryGoldbergGrid {
  const cached = planetaryGridCache.get(surfaceModel);
  if (cached) return cached;

  const topology = getCanonicalGoldbergTopology(DEFAULT_GOLDBERG_FREQ);
  const { tileCount, cells, texelTileId } = topology;

  // Accumulators per tile over the 360x180 spherical grid (weighted by cos(lat) solid angle)
  const biomeWeights = Array.from({ length: tileCount }, () => new Float32Array(25));
  const biomeRepLat = Array.from({ length: tileCount }, () => new Float32Array(25));
  const biomeRepLon = Array.from({ length: tileCount }, () => new Float32Array(25));
  const biomeHasRep = Array.from({ length: tileCount }, () => new Uint8Array(25));
  const sumWeight = new Float32Array(tileCount);
  const sumHNorm = new Float32Array(tileCount);
  const minHNorm = new Float32Array(tileCount).fill(1.0);
  const maxHNorm = new Float32Array(tileCount).fill(0.0);
  const sumTemp = new Float32Array(tileCount);
  const sumMoist = new Float32Array(tileCount);
  const sumCloud = new Float32Array(tileCount);
  const sumCrater = new Float32Array(tileCount);
  const maxCrater = new Float32Array(tileCount);
  const sumFracture = new Float32Array(tileCount);
  const maxFracture = new Float32Array(tileCount);
  const maxFractureLat = new Float32Array(tileCount);
  const maxFractureLon = new Float32Array(tileCount);
  const maxVolcano = new Float32Array(tileCount);

  for (let y = 0; y < 180; y++) {
    const lat = 89.5 - y;
    const cosLat = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    for (let x = 0; x < 360; x++) {
      const idx = y * 360 + x;
      const tId = texelTileId[idx];
      const bId = surfaceModel.biomeGrid[idx];
      const h = surfaceModel.hypsometry[idx];

      biomeWeights[tId][bId] += cosLat;
      if (!biomeHasRep[tId][bId]) {
        biomeRepLat[tId][bId] = 90 - y;
        biomeRepLon[tId][bId] = x - 180;
        biomeHasRep[tId][bId] = 1;
      }
      sumWeight[tId] += cosLat;
      sumHNorm[tId] += h * cosLat;
      if (h < minHNorm[tId]) minHNorm[tId] = h;
      if (h > maxHNorm[tId]) maxHNorm[tId] = h;
      sumTemp[tId] += surfaceModel.temperatureGrid[idx] * cosLat;
      sumMoist[tId] += surfaceModel.moistureGrid[idx] * cosLat;
      sumCloud[tId] += surfaceModel.cloudGrid[idx] * cosLat;
      const crVal = surfaceModel.craterGrid[idx];
      sumCrater[tId] += crVal * cosLat;
      if (crVal > maxCrater[tId]) maxCrater[tId] = crVal;
      const frVal = surfaceModel.fractureGrid[idx];
      sumFracture[tId] += frVal * cosLat;
      if (frVal > maxFracture[tId]) {
        maxFracture[tId] = frVal;
        maxFractureLat[tId] = 90 - y;
        maxFractureLon[tId] = x - 180;
      }
      if (surfaceModel.volcanoGrid[idx] > maxVolcano[tId]) {
        maxVolcano[tId] = surfaceModel.volcanoGrid[idx];
      }
    }
  }

  const tiles: GoldbergPlanetaryTile[] = [];

  for (let tId = 0; tId < tileCount; tId++) {
    const cell = cells[tId];
    const w = sumWeight[tId] || 1;
    const weights = biomeWeights[tId];

    // Pick primary dominant biome for this tile
    let bestBiome = 4;
    let bestW = -1;
    for (let b = 0; b < 25; b++) {
      if (weights[b] > bestW) {
        bestW = weights[b];
        bestBiome = b;
      }
    }
    // If the tile contains an active volcanic cone/caldera hotspot, preserve that geological feature
    if (maxVolcano[tId] > 1.1) {
      bestBiome = 15;
    } else if (maxVolcano[tId] > 0.45 && bestBiome > 2 && bestBiome !== 23) {
      bestBiome = 22;
    }

    const meanH = sumHNorm[tId] / w;
    // Sample canonical telemetry at the tile center, then override with unified tile averages
    const centerSample = sampleSurfacePoint(surfaceModel, planet, moon, cell.centerLat, cell.centerLon);

    // Find a representative texel inside this tile that has `bestBiome` so the biome name & color match the primary biome
    let repLat = cell.centerLat;
    let repLon = cell.centerLon;
    const cy = Math.max(0, Math.min(179, Math.floor(90 - cell.centerLat)));
    const cx = Math.max(0, Math.min(359, Math.floor(cell.centerLon + 180)));
    if (surfaceModel.isNoSurface && maxFracture[tId] > 0.24) {
      repLat = maxFractureLat[tId];
      repLon = maxFractureLon[tId];
    } else if (surfaceModel.biomeGrid[cy * 360 + cx] !== bestBiome) {
      if (biomeHasRep[tId][bestBiome]) {
        repLat = biomeRepLat[tId][bestBiome];
        repLon = biomeRepLon[tId][bestBiome];
      } else {
        let found = false;
        for (let dy = -6; dy <= 6 && !found; dy++) {
          const ny = Math.max(0, Math.min(179, cy + dy));
          for (let dx = -8; dx <= 8; dx++) {
            const nx = (cx + dx + 360) % 360;
            const nIdx = ny * 360 + nx;
            if (texelTileId[nIdx] === tId && surfaceModel.biomeGrid[nIdx] === bestBiome) {
              repLat = 90 - ny;
              repLon = nx - 180;
              found = true;
              break;
            }
          }
        }
      }
    }
    const snappedSample = sampleSurfacePoint(surfaceModel, planet, moon, repLat, repLon);
    const primaryBiomeName = snappedSample.biome;

    // Detect if this tile crosses a biome boundary (ecotone / coastal / alpine transition tile)
    let secondaryBiomeId: number | null = null;
    let secondaryBiomeName: string | null = null;
    let secondaryBiomeColor: string | null = null;
    let secondaryBiomeWeight = 0;
    let transitionAngleRad = ((tId * 137.5) % 360) * (Math.PI / 180);

    if (!surfaceModel.isNoSurface) {
      // Find the strongest second biome inside the tile that has at least 8% area weight
      // and resolves to a distinct biome name from primaryBiomeName
      let candBiome = -1;
      let candW = 0;
      let candSample: ReturnType<typeof sampleSurfacePoint> | null = null;

      for (let b = 0; b < 25; b++) {
        if (b === bestBiome) continue;
        const bw = weights[b];
        if (bw / w >= 0.08 && bw > candW && biomeHasRep[tId][b]) {
          const sLat = biomeRepLat[tId][b];
          const sLon = biomeRepLon[tId][b];
          const sSample = sampleSurfacePoint(surfaceModel, planet, moon, sLat, sLon);
          if (sSample.biome !== primaryBiomeName) {
            candW = bw;
            candBiome = b;
            candSample = sSample;
          }
        }
      }

      if (candBiome >= 0 && candSample) {
        secondaryBiomeId = candBiome;
        secondaryBiomeName = candSample.biome;
        secondaryBiomeColor = candSample.biomeColor;
        const rawShare = candW / Math.max(0.001, bestW + candW);
        secondaryBiomeWeight = +Math.max(0.22, Math.min(0.5, rawShare)).toFixed(2);

        // Compute geographic direction from primary biome representative point toward secondary biome point
        const dLat = biomeRepLat[tId][candBiome] - repLat;
        let dLon = ((biomeRepLon[tId][candBiome] - repLon + 540) % 360) - 180;
        dLon *= Math.max(0.2, Math.cos((cell.centerLat * Math.PI) / 180));
        if (Math.hypot(dLon, dLat) > 0.1) {
          transitionAngleRad = Math.atan2(-dLat, dLon);
        }
      }
    }

    const combinedBiomeName = formatCombinedTileBiomeName(
      bestBiome,
      primaryBiomeName,
      secondaryBiomeId,
      secondaryBiomeName
    );

    const isOcean = !surfaceModel.isNoSurface && (bestBiome <= 2 || bestBiome === 17 || bestBiome === 23);
    const isIce = bestBiome === 8 || bestBiome === 13 || bestBiome === 18 || bestBiome === 21;
    const isLava =
      bestBiome === 15 ||
      (isOcean && (surfaceModel.isMoltenWorld || surfaceModel.seaPalette.solventKey === 'Silicate Magma'));

    const spanNorm = Math.max(0.02, maxHNorm[tId] - minHNorm[tId]);
    const totalElevRangeKm = Math.max(1, surfaceModel.maxElevationKm - surfaceModel.minElevationKm);
    const reliefSpanKm = +(spanNorm * totalElevRangeKm).toFixed(2);

    const meanTempK = Math.round(sumTemp[tId] / w);
    const meanTempC = Math.round(meanTempK - 273.15);

    tiles.push({
      tileId: tId,
      isPentagon: cell.isPentagon,
      centerLat: cell.centerLat,
      centerLon: cell.centerLon,
      unitVec: cell.unitVec,
      biomeId: bestBiome,
      biomeName: combinedBiomeName,
      primaryBiomeName,
      biomeColor: snappedSample.biomeColor,
      secondaryBiomeId,
      secondaryBiomeName,
      secondaryBiomeColor,
      secondaryBiomeWeight,
      transitionAngleRad,
      isOcean,
      isIce,
      isLava,
      meanHNorm: meanH,
      elevationKm: snappedSample.elevationKm,
      elevationMeters: snappedSample.elevationMeters,
      reliefSpanKm,
      temperatureK: meanTempK,
      temperatureC: meanTempC,
      pressureBar: centerSample.pressureBar,
      moisture: +(sumMoist[tId] / w).toFixed(2),
      cloudCover: +(sumCloud[tId] / w).toFixed(2),
      craterIntensity: +Math.max(sumCrater[tId] / w, maxCrater[tId] * 0.72).toFixed(2),
      fractureIntensity: +Math.max(sumFracture[tId] / w, maxFracture[tId] * 0.65).toFixed(2),
      volcanoIntensity: +maxVolcano[tId].toFixed(2),
      featureName: snappedSample.featureName,
      neighbors: cell.neighbors,
      neighborAzimuthDeg: cell.neighborAzimuthDeg,
      polygon3D: cell.polygon3D,
    });
  }

  // Second pass: refine mixed tiles using bordering neighbor tiles so secondary biome choice & transition orientation
  // align with the surrounding tiles on the planetary grid
  if (!surfaceModel.isNoSurface) {
    const primaryIds = tiles.map((t) => t.biomeId);
    for (let tId = 0; tId < tileCount; tId++) {
      const tile = tiles[tId];
      const cell = cells[tId];
      const w = sumWeight[tId] || 1;
      const weights = biomeWeights[tId];
      const bestBiome = tile.biomeId;
      const bestW = weights[bestBiome] || 0;

      // Re-score candidate secondary biomes with a bonus when a candidate biome matches one or more bordering tiles
      let candBiome = tile.secondaryBiomeId ?? -1;
      let bestScore = -1;
      let candW = candBiome >= 0 ? weights[candBiome] : 0;
      let candSample: ReturnType<typeof sampleSurfacePoint> | null = null;

      for (let b = 0; b < 25; b++) {
        if (b === bestBiome) continue;
        const bw = weights[b];
        if (bw / w >= 0.075 && biomeHasRep[tId][b]) {
          const sLat = biomeRepLat[tId][b];
          const sLon = biomeRepLon[tId][b];
          const sSample = sampleSurfacePoint(surfaceModel, planet, moon, sLat, sLon);
          if (sSample.biome !== tile.primaryBiomeName) {
            let nbMatchCount = 0;
            for (let k = 0; k < cell.neighbors.length; k++) {
              const nbId = cell.neighbors[k];
              if (primaryIds[nbId] === b || biomeSimilarityScore(primaryIds[nbId], b) >= 0.8) {
                nbMatchCount++;
              }
            }
            const score = bw * (1.0 + Math.min(0.45, nbMatchCount * 0.18));
            if (score > bestScore) {
              bestScore = score;
              candW = bw;
              candBiome = b;
              candSample = sSample;
            }
          }
        }
      }

      if (candBiome >= 0) {
        if (candSample) {
          tile.secondaryBiomeId = candBiome;
          tile.secondaryBiomeName = candSample.biome;
          tile.secondaryBiomeColor = candSample.biomeColor;
          const rawShare = candW / Math.max(0.001, bestW + candW);
          tile.secondaryBiomeWeight = +Math.max(0.22, Math.min(0.5, rawShare)).toFixed(2);
          tile.biomeName = formatCombinedTileBiomeName(
            bestBiome,
            tile.primaryBiomeName,
            tile.secondaryBiomeId,
            tile.secondaryBiomeName
          );
        }

        // Orient transitionAngleRad toward the bordering tiles that have higher affinity for secondaryBiomeId
        let vecX = 0;
        let vecZ = 0;
        for (let k = 0; k < cell.neighbors.length; k++) {
          const nbTile = tiles[cell.neighbors[k]];
          const azRad = ((cell.neighborAzimuthDeg[k] ?? k * 60) * Math.PI) / 180;
          const sim1 = biomeSimilarityScore(nbTile.biomeId, bestBiome);
          const sim2 = biomeSimilarityScore(nbTile.biomeId, candBiome);
          const diff = sim2 - sim1;
          vecX += Math.sin(azRad) * diff;
          vecZ += Math.cos(azRad) * diff;
        }
        if (Math.hypot(vecX, vecZ) > 0.08) {
          tile.transitionAngleRad = Math.atan2(vecZ, vecX);
        }
      }
    }
  }

  const grid: PlanetaryGoldbergGrid = {
    frequency: topology.frequency,
    tileCount,
    tiles,
    topology,
  };
  planetaryGridCache.set(surfaceModel, grid);
  return grid;
}

function isOceanBiomeId(id: number): boolean {
  return id <= 2 || id === 17 || id === 23;
}

function formatCombinedTileBiomeName(
  bId1: number,
  name1: string,
  bId2: number | null,
  name2: string | null
): string {
  if (bId2 === null || !name2 || name2 === name1) {
    return name1;
  }
  const ocean1 = isOceanBiomeId(bId1);
  const ocean2 = isOceanBiomeId(bId2);
  if (ocean1 !== ocean2) {
    const landName = ocean1 ? name2 : name1;
    return `${landName} + Coast`;
  }
  return `${name1} + ${name2}`;
}

function isIceBiomeId(id: number): boolean {
  return id === 8 || id === 13 || id === 18 || id === 21;
}

function isVolcanicBiomeId(id: number): boolean {
  return id === 14 || id === 15 || id === 22;
}

function isHighlandBiomeId(id: number): boolean {
  return id === 11 || id === 12 || id === 13;
}

function characteristicBiomeTraits(id: number): {
  elev: number;
  moist: number;
  temp: number;
} {
  if (id === 0) return { elev: -0.35, moist: 1.0, temp: 0.5 };
  if (id === 1) return { elev: -0.22, moist: 1.0, temp: 0.5 };
  if (id === 2 || id === 17 || id === 23) return { elev: -0.08, moist: 1.0, temp: 0.58 };
  if (id === 3) return { elev: 0.04, moist: 0.85, temp: 0.66 };
  if (id === 4) return { elev: 0.1, moist: 0.48, temp: 0.58 };
  if (id === 5) return { elev: 0.11, moist: 0.72, temp: 0.58 };
  if (id === 6) return { elev: 0.14, moist: 0.58, temp: 0.38 };
  if (id === 7) return { elev: 0.1, moist: 0.4, temp: 0.28 };
  if (id === 8 || id === 21) return { elev: 0.15, moist: 0.4, temp: 0.15 };
  if (id === 9) return { elev: 0.14, moist: 0.22, temp: 0.68 };
  if (id === 10) return { elev: 0.14, moist: 0.08, temp: 0.82 };
  if (id === 11) return { elev: 0.28, moist: 0.2, temp: 0.6 };
  if (id === 12) return { elev: 0.4, moist: 0.35, temp: 0.35 };
  if (id === 13) return { elev: 0.44, moist: 0.45, temp: 0.12 };
  if (id === 14 || id === 16) return { elev: 0.15, moist: 0.08, temp: 0.5 };
  if (id === 15 || id === 22) return { elev: 0.28, moist: 0.08, temp: 0.95 };
  if (id === 18) return { elev: 0.08, moist: 0.3, temp: 0.05 };
  return { elev: 0.12, moist: 0.4, temp: 0.5 };
}

export function biomeSimilarityScore(
  bA: number,
  bB: number,
  activePairIsCoast = false
): number {
  if (bA === bB) return 1.0;
  if (isOceanBiomeId(bA) && isOceanBiomeId(bB)) return 0.9;
  if (isIceBiomeId(bA) && isIceBiomeId(bB)) return 0.86;
  if (isVolcanicBiomeId(bA) && isVolcanicBiomeId(bB)) return 0.88;
  if (isHighlandBiomeId(bA) && isHighlandBiomeId(bB)) return 0.84;
  if ((bA === 9 || bA === 10) && (bB === 9 || bB === 10)) return 0.82;
  if (bA >= 3 && bA <= 6 && bB >= 3 && bB <= 6) return 0.74;
  if (activePairIsCoast && !isOceanBiomeId(bA) && !isOceanBiomeId(bB)) return 0.8;

  const tA = characteristicBiomeTraits(bA);
  const tB = characteristicBiomeTraits(bB);
  const dElev = Math.abs(tA.elev - tB.elev);
  const dMoist = Math.abs(tA.moist - tB.moist);
  const dTemp = Math.abs(tA.temp - tB.temp);
  return Math.max(0, 0.55 - (dElev * 0.7 + dMoist * 0.35 + dTemp * 0.35));
}

export interface NeighborTileDirectionEntry {
  tile: GoldbergPlanetaryTile;
  dirX: number; // Outward unit vector X in the local view's (px, pz) plane
  dirZ: number; // Outward unit vector Z in the local view's (px, pz) plane
}

export interface TileBorderTerrainContext {
  biomeMix: number; // [0..1] blend factor (0 = primary biome, 1 = secondary biome)
  localMacroH: number; // Spatially blended macro elevation relative to sea level
  borderReliefBoost: number; // [-0.08..+0.14] foothill/coastal slope modulation from bordering tiles
}

/**
 * Builds a fast, quantile-calibrated spatial terrain evaluator for a Goldberg tile that takes into account
 * all of its bordering tiles (`neighborEntries`) when placing primary vs. secondary biomes, coastal shelves,
 * islands, inland lakes, mountain foothills, volcanic cones, and elevation gradients.
 */
export function createNeighborAwareTileEvaluator(
  activeTile: GoldbergPlanetaryTile,
  neighborEntries: NeighborTileDirectionEntry[],
  seaLevelNormalized: number,
  isNoSurface: boolean
): {
  evalBorderContext: (px: number, pz: number, baseFbm: number, ridge: number) => TileBorderTerrainContext;
  pickPreferredFeatureSpot: (
    targetIsSecondary: boolean,
    fallbackAngle: number,
    fallbackDist: number
  ) => { x: number; z: number };
  preferredFissureStrike: { cosA: number; sinA: number };
} {
  const bId1 = activeTile.biomeId;
  const bId2 = activeTile.secondaryBiomeId;
  const hasSecondary = bId2 !== null && bId2 !== bId1 && !isNoSurface;
  const secWeight = Math.max(0.2, Math.min(0.5, activeTile.secondaryBiomeWeight || 0.35));
  const baseMacroH = activeTile.meanHNorm - seaLevelNormalized;

  const nCount = neighborEntries.length;
  const dirX = new Float64Array(nCount);
  const dirZ = new Float64Array(nCount);
  const nbBias = new Float64Array(nCount);
  const nbMacroH = new Float64Array(nCount);
  const nbRelief = new Float64Array(nCount);

  const isCoastPair = hasSecondary && bId2 !== null && isOceanBiomeId(bId1) !== isOceanBiomeId(bId2);
  const traits1 = characteristicBiomeTraits(bId1);
  const traits2 = bId2 !== null ? characteristicBiomeTraits(bId2) : traits1;
  const dCharElev = traits2.elev - traits1.elev;
  const dCharMoist = traits2.moist - traits1.moist;
  const dCharTemp = traits2.temp - traits1.temp;

  let minBias = 1e9;
  let maxBias = -1e9;
  let sumBias = 0;
  let secVecX = Math.cos(activeTile.transitionAngleRad || 0);
  let secVecZ = Math.sin(activeTile.transitionAngleRad || 0);
  let priVecX = -secVecX;
  let priVecZ = -secVecZ;
  let sumSecVecX = 0;
  let sumSecVecZ = 0;
  let sumPriVecX = 0;
  let sumPriVecZ = 0;
  let fracVecX = 0.75;
  let fracVecZ = -0.45;

  for (let s = 0; s < nCount; s++) {
    const entry = neighborEntries[s];
    const nb = entry.tile;
    const len = Math.hypot(entry.dirX, entry.dirZ) || 1;
    const ux = entry.dirX / len;
    const uz = entry.dirZ / len;
    dirX[s] = ux;
    dirZ[s] = uz;

    const nbH = nb.meanHNorm - seaLevelNormalized;
    nbMacroH[s] = nbH;
    nbRelief[s] = isHighlandBiomeId(nb.biomeId)
      ? 0.08
      : isVolcanicBiomeId(nb.biomeId)
      ? 0.05
      : isOceanBiomeId(nb.biomeId)
      ? -0.05
      : 0;

    if (nb.fractureIntensity > 0.18) {
      fracVecX += -uz * nb.fractureIntensity;
      fracVecZ += ux * nb.fractureIntensity;
    }

    if (hasSecondary && bId2 !== null) {
      const nbSecW = nb.secondaryBiomeId !== null ? Math.min(0.45, nb.secondaryBiomeWeight || 0.3) : 0;
      const sim1Primary = biomeSimilarityScore(nb.biomeId, bId1, isCoastPair);
      const sim2Primary = biomeSimilarityScore(nb.biomeId, bId2, isCoastPair);
      const sim1Sec =
        nb.secondaryBiomeId !== null ? biomeSimilarityScore(nb.secondaryBiomeId, bId1, isCoastPair) : sim1Primary;
      const sim2Sec =
        nb.secondaryBiomeId !== null ? biomeSimilarityScore(nb.secondaryBiomeId, bId2, isCoastPair) : sim2Primary;

      let sim1 = sim1Primary * (1 - nbSecW) + sim1Sec * nbSecW;
      let sim2 = sim2Primary * (1 - nbSecW) + sim2Sec * nbSecW;

      // Physical telemetry affinity (elevation, moisture, temperature, crater/volcano/fracture continuity)
      if (Math.abs(dCharElev) >= 0.08) {
        const relH = (nb.meanHNorm - activeTile.meanHNorm) * Math.sign(dCharElev);
        const elevBonus = Math.max(-0.35, Math.min(0.35, relH * 2.2));
        sim2 += elevBonus;
        sim1 -= elevBonus;
      }
      if (Math.abs(dCharMoist) >= 0.12) {
        const relM = (nb.moisture - activeTile.moisture) * Math.sign(dCharMoist);
        const moistBonus = Math.max(-0.25, Math.min(0.25, relM * 0.9));
        sim2 += moistBonus;
        sim1 -= moistBonus;
      }
      if (Math.abs(dCharTemp) >= 0.12) {
        const relT = ((nb.temperatureK - activeTile.temperatureK) / 40) * Math.sign(dCharTemp);
        const tempBonus = Math.max(-0.25, Math.min(0.25, relT * 0.45));
        sim2 += tempBonus;
        sim1 -= tempBonus;
      }

      const bias = Math.max(-1, Math.min(1, (sim2 - sim1) * 1.4));
      nbBias[s] = bias;
      if (bias < minBias) minBias = bias;
      if (bias > maxBias) maxBias = bias;
      sumBias += bias;

      if (bias > 0) {
        sumSecVecX += ux * bias;
        sumSecVecZ += uz * bias;
      } else if (bias < 0) {
        sumPriVecX += ux * -bias;
        sumPriVecZ += uz * -bias;
      }
    } else {
      nbBias[s] = -1;
      minBias = -1;
      maxBias = -1;
    }
  }

  if (Math.hypot(sumSecVecX, sumSecVecZ) > 0.05) {
    const l = Math.hypot(sumSecVecX, sumSecVecZ);
    secVecX = sumSecVecX / l;
    secVecZ = sumSecVecZ / l;
  }
  if (Math.hypot(sumPriVecX, sumPriVecZ) > 0.05) {
    const l = Math.hypot(sumPriVecX, sumPriVecZ);
    priVecX = sumPriVecX / l;
    priVecZ = sumPriVecZ / l;
  } else {
    priVecX = -secVecX;
    priVecZ = -secVecZ;
  }

  const fLen = Math.hypot(fracVecX, fracVecZ) || 1;
  const preferredFissureStrike = { cosA: fracVecX / fLen, sinA: fracVecZ / fLen };

  const meanBias = nCount > 0 ? sumBias / nCount : 0;
  const biasSpan = Math.max(0, maxBias - minBias);

  // Continuous C-infinity spatial score toward secondary biome bId2 at any (px, pz) in [-1, 1]^2
  const evalRawSpatialScore = (px: number, pz: number): number => {
    if (!hasSecondary || nCount === 0) return -1;
    const r = Math.hypot(px, pz);

    // Case A: All bordering tiles strongly match the secondary biome (e.g. island of primary biome surrounded by secondary biome)
    if (minBias > 0.22 && biasSpan < 0.35) {
      return (r - 0.56) * 1.4 + (px * secVecX + pz * secVecZ) * 0.22;
    }
    // Case B: All bordering tiles strongly match the primary biome (e.g. inland lake or central massif inside primary biome)
    if (maxBias < -0.22 && biasSpan < 0.35) {
      return (0.54 - r) * 1.4 + (px * secVecX + pz * secVecZ) * 0.22;
    }
    // Case C: Bordering tiles differ — place secondary biome along the specific bordering edges that favor bId2
    if (biasSpan > 0.1) {
      let wSum = 0;
      let weightedBias = 0;
      let maxEdgeDot = -2;
      for (let s = 0; s < nCount; s++) {
        const proj = px * dirX[s] + pz * dirZ[s];
        const w = Math.exp(proj * 3.6);
        const normB = (nbBias[s] - minBias) / biasSpan; // [0..1]
        wSum += w;
        weightedBias += w * normB;
        if (nbBias[s] > 0.08 && proj > maxEdgeDot) {
          maxEdgeDot = proj;
        }
      }
      const angularScore = wSum > 0 ? weightedBias / wSum : 0.5;
      const radialStrength = 0.38 + 0.82 * Math.min(1.15, r);
      const rimPull = meanBias * 0.28 * (r - 0.52);
      const edgeProximity = maxEdgeDot > -1 ? maxEdgeDot * 0.22 : 0;
      return (angularScore - 0.5) * radialStrength * 1.85 + rimPull + edgeProximity;
    }

    // Fallback: smooth planar transition along transitionAngleRad
    return px * secVecX + pz * secVecZ;
  };

  // Quantile-calibrate threshold and scale over an 11x11 interior grid so the secondary biome covers ~secWeight of the tile
  let calibratedThreshold = 0;
  let calibratedSpan = 0.52;
  if (hasSecondary) {
    const samples: number[] = [];
    for (let gz = -5; gz <= 5; gz++) {
      const sz = gz * 0.17;
      for (let gx = -5; gx <= 5; gx++) {
        const sx = gx * 0.17;
        if (sx * sx + sz * sz <= 0.95) {
          samples.push(evalRawSpatialScore(sx, sz));
        }
      }
    }
    samples.sort((a, b) => a - b);
    if (samples.length > 4) {
      const qIdx = Math.max(
        0,
        Math.min(samples.length - 1, Math.round((1.0 - secWeight) * (samples.length - 1)))
      );
      const qLow = samples[Math.max(0, Math.floor(samples.length * 0.18))];
      const qHigh = samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.82))];
      calibratedThreshold = samples[qIdx];
      calibratedSpan = Math.max(0.28, (qHigh - qLow) * 0.85);
    }
  }

  const evalBorderContext = (
    px: number,
    pz: number,
    baseFbm: number,
    ridge: number
  ): TileBorderTerrainContext => {
    let biomeMix = 0;
    if (hasSecondary) {
      const rawScore = evalRawSpatialScore(px, pz);
      const patchNoise = ((baseFbm - 0.5) * 0.62 + (ridge - 0.5) * 0.30) * calibratedSpan;
      const u = (rawScore + patchNoise - calibratedThreshold) / calibratedSpan + 0.5;
      const t = Math.max(0, Math.min(1, u));
      biomeMix = t * t * (3.0 - 2.0 * t);
    }

    // Smoothly blend baseline elevation & foothill/coastal relief toward the bordering tiles near the edges
    let localMacroH = baseMacroH;
    let borderReliefBoost = 0;
    if (nCount > 0 && !isNoSurface) {
      let wSum = 0;
      let hSum = 0;
      let relSum = 0;
      for (let s = 0; s < nCount; s++) {
        const proj = px * dirX[s] + pz * dirZ[s];
        const w = Math.exp(proj * 3.2);
        wSum += w;
        hSum += w * nbMacroH[s];
        relSum += w * nbRelief[s];
      }
      if (wSum > 0) {
        const r = Math.min(1.0, Math.hypot(px, pz));
        const edgeWeight = r * r * 0.48;
        const nbAvgH = hSum / wSum;
        localMacroH = baseMacroH * (1.0 - edgeWeight) + nbAvgH * edgeWeight;
        borderReliefBoost = (relSum / wSum) * (0.35 + 0.65 * r);
      }
    }

    return {
      biomeMix,
      localMacroH,
      borderReliefBoost,
    };
  };

  const pickPreferredFeatureSpot = (
    targetIsSecondary: boolean,
    fallbackAngle: number,
    fallbackDist: number
  ): { x: number; z: number } => {
    if (!hasSecondary) {
      return {
        x: Math.cos(fallbackAngle) * fallbackDist,
        z: Math.sin(fallbackAngle) * fallbackDist,
      };
    }
    const vx = targetIsSecondary ? secVecX : priVecX;
    const vz = targetIsSecondary ? secVecZ : priVecZ;
    const baseAng = Math.atan2(vz, vx);
    // Constrain feature angle within +/- 55 degrees of the target biome's bordering sector
    const jitter = ((fallbackAngle / (Math.PI * 2)) - 0.5) * 1.9;
    const finalAng = baseAng + jitter;
    const dist = Math.max(0.22, Math.min(0.76, fallbackDist * 0.85 + 0.14));
    return {
      x: Math.cos(finalAng) * dist,
      z: Math.sin(finalAng) * dist,
    };
  };

  return {
    evalBorderContext,
    pickPreferredFeatureSpot,
    preferredFissureStrike,
  };
}

/**
 * Finds the GoldbergPlanetaryTile containing the given (lat, lon) coordinates.
 */
export function getGoldbergTileAtLatLon(
  grid: PlanetaryGoldbergGrid,
  lat: number,
  lon: number
): GoldbergPlanetaryTile {
  const [sx, sy, sz] = latLonToUnitVec(lat, lon);
  const { tileId } = queryGoldbergTileAtUnitVec(grid.topology, sx, sy, sz);
  return grid.tiles[tileId] || grid.tiles[0];
}

