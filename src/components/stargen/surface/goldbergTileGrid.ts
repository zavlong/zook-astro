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
  biomeColor: string;
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
  const biomeWeights = Array.from({ length: tileCount }, () => new Float32Array(24));
  const sumWeight = new Float32Array(tileCount);
  const sumHNorm = new Float32Array(tileCount);
  const minHNorm = new Float32Array(tileCount).fill(1.0);
  const maxHNorm = new Float32Array(tileCount).fill(0.0);
  const sumTemp = new Float32Array(tileCount);
  const sumMoist = new Float32Array(tileCount);
  const sumCloud = new Float32Array(tileCount);
  const sumCrater = new Float32Array(tileCount);
  const sumFracture = new Float32Array(tileCount);
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
      sumWeight[tId] += cosLat;
      sumHNorm[tId] += h * cosLat;
      if (h < minHNorm[tId]) minHNorm[tId] = h;
      if (h > maxHNorm[tId]) maxHNorm[tId] = h;
      sumTemp[tId] += surfaceModel.temperatureGrid[idx] * cosLat;
      sumMoist[tId] += surfaceModel.moistureGrid[idx] * cosLat;
      sumCloud[tId] += surfaceModel.cloudGrid[idx] * cosLat;
      sumCrater[tId] += surfaceModel.craterGrid[idx] * cosLat;
      sumFracture[tId] += surfaceModel.fractureGrid[idx] * cosLat;
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

    // Pick unified dominant biome for this tile
    let bestBiome = 4;
    let bestW = -1;
    for (let b = 0; b < 24; b++) {
      if (weights[b] > bestW) {
        bestW = weights[b];
        bestBiome = b;
      }
    }
    // If the tile contains an active volcanic cone/caldera hotspot, preserve that geological feature
    if (maxVolcano[tId] > 1.1) {
      bestBiome = 15;
    } else if (maxVolcano[tId] > 0.45 && bestBiome > 2) {
      bestBiome = 22;
    }

    const meanH = sumHNorm[tId] / w;
    // Sample canonical telemetry at the tile center, then override with unified tile averages
    const centerSample = sampleSurfacePoint(surfaceModel, planet, moon, cell.centerLat, cell.centerLon);

    const isOcean = !surfaceModel.isNoSurface && bestBiome <= 2;
    const isIce = bestBiome === 8 || bestBiome === 13 || bestBiome === 18 || bestBiome === 21;
    const isLava = bestBiome === 15 || (isOcean && (surfaceModel.isMoltenWorld || surfaceModel.seaPalette.solventKey === 'Silicate Magma'));

    // Find a representative texel inside this tile that has `bestBiome` so the biome name & color match the snapped biome
    let repLat = cell.centerLat;
    let repLon = cell.centerLon;
    const cy = Math.max(0, Math.min(179, Math.floor(90 - cell.centerLat)));
    const cx = Math.max(0, Math.min(359, Math.floor(cell.centerLon + 180)));
    if (surfaceModel.biomeGrid[cy * 360 + cx] !== bestBiome) {
      // Search nearby texels in the tile for one with bestBiome
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
    const snappedSample = sampleSurfacePoint(surfaceModel, planet, moon, repLat, repLon);

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
      biomeName: snappedSample.biome,
      biomeColor: snappedSample.biomeColor,
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
      craterIntensity: +(sumCrater[tId] / w).toFixed(2),
      fractureIntensity: +(sumFracture[tId] / w).toFixed(2),
      volcanoIntensity: +maxVolcano[tId].toFixed(2),
      featureName: `Tile #${tId + 1} (${cell.isPentagon ? 'Pentagon' : 'Hexagon'}) • ${snappedSample.featureName}`,
      neighbors: cell.neighbors,
      neighborAzimuthDeg: cell.neighborAzimuthDeg,
      polygon3D: cell.polygon3D,
    });
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
