/**
 * Zook Astro - Star Asset Resolver & Scaling
 * Maps star astrophysics (spectral type, category, mass) to pregenerated cinematic SVG star assets.
 */

export interface StarAssetDescriptor {
  label?: string;
  spectralType?: string;
  category?: string;
  mass?: number;
  radius?: number;
  Teff?: number;
  colorHex?: string;
}

export interface StarSpectralPalette {
  coreHex: string;
  baseHex: string;
  limbHex: string;
  umbraHex: string;
  penumbraHex: string;
  faculaeHex: string;
  coronaHex: string;
  spotCoverage: number; // 0..2 intensity of sunspots/starspots
  granuleScale: number; // Spatial frequency of convective granules
  isCompactRemnant: boolean;
  isBlackHole: boolean;
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = (hex || '#fbbf24').replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) || 255,
      parseInt(clean[1] + clean[1], 16) || 200,
      parseInt(clean[2] + clean[2], 16) || 100,
    ];
  }
  const n = parseInt(clean.slice(0, 6), 16);
  if (Number.isNaN(n)) return [251, 191, 36];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Computes scientifically grounded stellar photosphere colors, limb darkening hues,
 * and sunspot umbra/penumbra/faculae parameters across Harvard spectral classes and remnants.
 */
export function getStarSpectralPalette(star?: StarAssetDescriptor | null): StarSpectralPalette {
  const cat = (star?.category || '').toLowerCase();
  const sp = (star?.spectralType || '').trim().toUpperCase();
  const teff = star?.Teff || 0;

  // 1. Black Hole (Stellar or Supermassive)
  if (
    cat.includes('black hole') ||
    cat.includes('supermassive') ||
    sp.includes('BLACK HOLE') ||
    sp.includes('SMBH') ||
    sp === 'BH' ||
    sp.startsWith('BH ') ||
    sp.startsWith('BH(') ||
    sp.includes('/ BH') ||
    (typeof star?.mass === 'number' && star.mass > 999999)
  ) {
    return {
      coreHex: '#000000',
      baseHex: '#05010a',
      limbHex: '#c084fc',
      umbraHex: '#000000',
      penumbraHex: '#3b0764',
      faculaeHex: '#f3e8ff',
      coronaHex: '#a855f7',
      spotCoverage: 0,
      granuleScale: 10,
      isCompactRemnant: true,
      isBlackHole: true,
    };
  }

  // 2. Neutron Star / Pulsar
  if (
    cat.includes('neutron') ||
    cat.includes('pulsar') ||
    sp.includes('NEUTRON') ||
    sp.includes('PULSAR') ||
    sp === 'NS'
  ) {
    return {
      coreHex: '#ffffff',
      baseHex: '#67e8f9',
      limbHex: '#0284c7',
      umbraHex: '#083344',
      penumbraHex: '#0e7490',
      faculaeHex: '#ecfeff',
      coronaHex: '#22d3ee',
      spotCoverage: 0.45,
      granuleScale: 18,
      isCompactRemnant: true,
      isBlackHole: false,
    };
  }

  // 3. White Dwarf
  if (
    cat.includes('white dwarf') ||
    sp.includes('WHITE DWARF') ||
    sp.startsWith('D') ||
    sp.startsWith('WD') ||
    sp.includes('DWARF (D')
  ) {
    return {
      coreHex: '#ffffff',
      baseHex: '#e0f2fe',
      limbHex: '#38bdf8',
      umbraHex: '#0c4a6e',
      penumbraHex: '#0284c7',
      faculaeHex: '#ffffff',
      coronaHex: '#7dd3fc',
      spotCoverage: 0.35,
      granuleScale: 16,
      isCompactRemnant: true,
      isBlackHole: false,
    };
  }

  // 4. Sub-stellar Brown Dwarf (L / T / Y)
  if (
    cat.includes('brown dwarf') ||
    sp.startsWith('L') ||
    sp.startsWith('T') ||
    sp.startsWith('Y') ||
    (teff > 0 && teff < 2400)
  ) {
    return {
      coreHex: '#f5d0fe',
      baseHex: '#a855f7',
      limbHex: '#4c1d95',
      umbraHex: '#1e0538',
      penumbraHex: '#581c87',
      faculaeHex: '#fae8ff',
      coronaHex: '#9333ea',
      spotCoverage: 1.45,
      granuleScale: 7.5,
      isCompactRemnant: false,
      isBlackHole: false,
    };
  }

  // 5. M-Class Red Dwarf / Red Giant (Teff ~ 2400 - 3700 K): Heavy magnetic starspots!
  if (
    sp.startsWith('M') ||
    (teff >= 2400 && teff < 3700) ||
    (star?.colorHex && /f87171|ef4444|dc2626|b91c1c/i.test(star.colorHex))
  ) {
    const isGiant = cat.includes('giant') || (star?.radius ?? 0.5) > 3.0;
    return {
      coreHex: '#ffd4b8',
      baseHex: '#f97316',
      limbHex: '#b91c1c',
      umbraHex: '#1f0406',
      penumbraHex: '#6b0f18',
      faculaeHex: '#ffedd5',
      coronaHex: '#ef4444',
      spotCoverage: isGiant ? 1.55 : 1.42,
      granuleScale: isGiant ? 5.8 : 7.8,
      isCompactRemnant: false,
      isBlackHole: false,
    };
  }

  // 6. K-Class Orange Star (Teff ~ 3700 - 5200 K): Rich amber-orange with prominent sunspot belts
  if (
    sp.startsWith('K') ||
    (teff >= 3700 && teff < 5200) ||
    (star?.colorHex && /fb923c|f97316|ea580c|fdba74/i.test(star.colorHex))
  ) {
    return {
      coreHex: '#ffedd5',
      baseHex: '#fb923c',
      limbHex: '#c2410c',
      umbraHex: '#270902',
      penumbraHex: '#7c2d12',
      faculaeHex: '#fff7ed',
      coronaHex: '#f97316',
      spotCoverage: 1.28,
      granuleScale: 9.2,
      isCompactRemnant: false,
      isBlackHole: false,
    };
  }

  // 7. F-Class Yellow-White Star (Teff ~ 6000 - 7500 K): Warm cream-gold with moderate sunspots
  if (sp.startsWith('F') || (teff >= 6000 && teff < 7500)) {
    return {
      coreHex: '#ffffff',
      baseHex: '#fef08a',
      limbHex: '#eab308',
      umbraHex: '#3b1d06',
      penumbraHex: '#92400e',
      faculaeHex: '#ffffff',
      coronaHex: '#fde047',
      spotCoverage: 0.85,
      granuleScale: 12.0,
      isCompactRemnant: false,
      isBlackHole: false,
    };
  }

  // 8. A-Class White Star (Teff ~ 7500 - 10000 K): Crisp ice-blue white with magnetic starspots
  if (sp.startsWith('A') || (teff >= 7500 && teff < 10000)) {
    return {
      coreHex: '#ffffff',
      baseHex: '#e0f2fe',
      limbHex: '#38bdf8',
      umbraHex: '#0c4a6e',
      penumbraHex: '#0284c7',
      faculaeHex: '#ffffff',
      coronaHex: '#7dd3fc',
      spotCoverage: 0.52,
      granuleScale: 13.5,
      isCompactRemnant: false,
      isBlackHole: false,
    };
  }

  // 9. B / O-Class Blue-White Giant/Main Sequence (Teff >= 10000 K)
  if (
    sp.startsWith('B') ||
    sp.startsWith('O') ||
    teff >= 10000 ||
    (star?.colorHex && /93c5fd|60a5fa|3b82f6|2563eb/i.test(star.colorHex))
  ) {
    const isO = sp.startsWith('O') || teff >= 28000;
    return {
      coreHex: '#ffffff',
      baseHex: isO ? '#93c5fd' : '#bfdbfe',
      limbHex: isO ? '#1d4ed8' : '#2563eb',
      umbraHex: '#0f172a',
      penumbraHex: '#1e40af',
      faculaeHex: '#eff6ff',
      coronaHex: isO ? '#3b82f6' : '#60a5fa',
      spotCoverage: 0.48,
      granuleScale: 14.0,
      isCompactRemnant: false,
      isBlackHole: false,
    };
  }

  // 10. Default G-Class Solar Star (Teff ~ 5200 - 6000 K): Golden-yellow photosphere, warm orange limb, classic sunspot pairs
  return {
    coreHex: '#fef9c3',
    baseHex: '#fbbf24',
    limbHex: '#d97706',
    umbraHex: '#260e04',
    penumbraHex: '#853b11',
    faculaeHex: '#ffffff',
    coronaHex: '#f59e0b',
    spotCoverage: 1.12,
    granuleScale: 10.5,
    isCompactRemnant: false,
    isBlackHole: false,
  };
}

/**
 * Fast deterministic 3D value noise with quintic C2 interpolation for stellar granulation and sunspot fields.
 */
function starHash3(ix: number, iy: number, iz: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647) + Math.imul(seed, 1664525);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function starNoise3D(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);

  const n000 = starHash3(ix, iy, iz, seed);
  const n100 = starHash3(ix + 1, iy, iz, seed);
  const n010 = starHash3(ix, iy + 1, iz, seed);
  const n110 = starHash3(ix + 1, iy + 1, iz, seed);
  const n001 = starHash3(ix, iy, iz + 1, seed);
  const n101 = starHash3(ix + 1, iy, iz + 1, seed);
  const n011 = starHash3(ix, iy + 1, iz + 1, seed);
  const n111 = starHash3(ix + 1, iy + 1, iz + 1, seed);

  const nx00 = n000 + (n100 - n000) * ux;
  const nx10 = n010 + (n110 - n010) * ux;
  const nx01 = n001 + (n101 - n001) * ux;
  const nx11 = n011 + (n111 - n011) * ux;

  const nxy0 = nx00 + (nx10 - nx00) * uy;
  const nxy1 = nx01 + (nx11 - nx01) * uy;

  return nxy0 + (nxy1 - nxy0) * uz;
}

interface SunspotGroup3D {
  ux: number;
  uy: number;
  uz: number;
  angularRadius: number;
  strength: number;
  seedOffset: number;
}

function generateDeterministicSunspots(seed: number, spotCoverage: number): SunspotGroup3D[] {
  if (spotCoverage <= 0.02) return [];
  const groups: SunspotGroup3D[] = [];
  // Number of bipolar sunspot groups scales with magnetic activity (spotCoverage)
  const pairCount = Math.max(3, Math.min(14, Math.round(5 * spotCoverage)));

  for (let i = 0; i < pairCount; i++) {
    const h1 = starHash3(i, 11, 3, seed);
    const h2 = starHash3(i, 29, 7, seed);
    const h3 = starHash3(i, 47, 13, seed);
    const h4 = starHash3(i, 71, 19, seed);

    // Spörer's Law: Sunspots form in active mid-latitude belts (±8° to ±42°), or broader on M-dwarfs
    const beltSign = i % 2 === 0 ? 1 : -1;
    const minLatDeg = spotCoverage > 1.3 ? 4 : 8;
    const maxLatDeg = spotCoverage > 1.3 ? 56 : 38;
    const latRad = (beltSign * (minLatDeg + h1 * (maxLatDeg - minLatDeg)) * Math.PI) / 180;
    // Ensure at least the first two sunspot groups sit on the front hemisphere so sprites always show visible sunspots!
    const lonRad =
      i < 2
        ? (i === 0 ? -0.36 : 0.42) + (h2 - 0.5) * 0.45
        : (h2 * 2 - 1) * Math.PI;

    const baseRadius = (0.095 + h3 * 0.115) * Math.min(1.35, 0.78 + spotCoverage * 0.32);
    const strength = 0.75 + h4 * 0.25;

    // Leading spot (slightly closer to equator per Joy's Law)
    const cosLat1 = Math.cos(latRad);
    groups.push({
      ux: cosLat1 * Math.sin(lonRad),
      uy: Math.sin(latRad),
      uz: cosLat1 * Math.cos(lonRad),
      angularRadius: baseRadius,
      strength,
      seedOffset: i * 17 + 1,
    });

    // Trailing bipolar companion spot (slightly higher latitude and shifted in longitude)
    const trailLon = lonRad - (0.11 + h3 * 0.08);
    const trailLat = latRad + beltSign * 0.045;
    const cosLat2 = Math.cos(trailLat);
    groups.push({
      ux: cosLat2 * Math.sin(trailLon),
      uy: Math.sin(trailLat),
      uz: cosLat2 * Math.cos(trailLon),
      angularRadius: baseRadius * (0.62 + h4 * 0.22),
      strength: strength * 0.88,
      seedOffset: i * 17 + 9,
    });
  }
  return groups;
}

/**
 * Renders a 3D colored, limb-darkened, granulated, and sunspotted star portrait onto a canvas.
 */
export function renderProceduralStarToCanvas(
  canvas: HTMLCanvasElement,
  star?: StarAssetDescriptor | null,
  sizePx: number = 144,
  rotYaw: number = 0,
  rotPitch: number = 0.12
): void {
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, sizePx, sizePx);
  const palette = getStarSpectralPalette(star);
  const cx = sizePx * 0.5;
  const cy = sizePx * 0.5;

  // Deterministic seed from star properties
  const seedStr = `${star?.label || 'A'}_${star?.spectralType || 'G2V'}_${(star?.mass || 1).toFixed(3)}_${Math.round(star?.Teff || 5778)}`;
  let seed = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    seed ^= seedStr.charCodeAt(i);
    seed = Math.imul(seed, 16777619) >>> 0;
  }

  // Special case: Black Hole (Relativistic Accretion Disk + Event Horizon Shadow)
  if (palette.isBlackHole) {
    const rHorizon = sizePx * 0.22;
    const glow = ctx.createRadialGradient(cx, cy, rHorizon * 0.8, cx, cy, sizePx * 0.48);
    glow.addColorStop(0, 'rgba(243, 232, 255, 0.95)');
    glow.addColorStop(0.28, 'rgba(192, 132, 252, 0.65)');
    glow.addColorStop(0.65, 'rgba(126, 34, 206, 0.22)');
    glow.addColorStop(1, 'rgba(59, 7, 100, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, sizePx * 0.48, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.32);
    ctx.strokeStyle = 'rgba(216, 180, 254, 0.85)';
    ctx.lineWidth = Math.max(1.5, sizePx * 0.035);
    ctx.beginPath();
    ctx.ellipse(0, 0, sizePx * 0.42, sizePx * 0.15, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#e9d5ff';
    ctx.lineWidth = Math.max(1.2, sizePx * 0.018);
    ctx.beginPath();
    ctx.arc(cx, cy, rHorizon, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }

  // Match planet globe scale (planet radius is 0.44 * sizePx so 0.44..0.50 holds the coronal glow)
  const discR = sizePx * 0.42;

  // 1. Volumetric Outer Coronal Glow
  const coronaGrad = ctx.createRadialGradient(cx, cy, discR * 0.72, cx, cy, sizePx * 0.5);
  coronaGrad.addColorStop(0, palette.baseHex);
  coronaGrad.addColorStop(0.45, `${palette.coronaHex}99`);
  coronaGrad.addColorStop(0.78, `${palette.limbHex}38`);
  coronaGrad.addColorStop(1, `${palette.limbHex}00`);
  ctx.fillStyle = coronaGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, sizePx * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // 2. Raycast 3D Spherical Photosphere with Limb Darkening, Convective Granulation & Sunspots
  const imgData = ctx.getImageData(0, 0, sizePx, sizePx);
  const data = imgData.data;

  const coreRgb = hexToRgbTuple(palette.coreHex);
  const baseRgb = hexToRgbTuple(palette.baseHex);
  const limbRgb = hexToRgbTuple(palette.limbHex);
  const umbraRgb = hexToRgbTuple(palette.umbraHex);
  const penumbraRgb = hexToRgbTuple(palette.penumbraHex);
  const faculaeRgb = hexToRgbTuple(palette.faculaeHex);

  const spots = generateDeterministicSunspots(seed, palette.spotCoverage);
  const cosY = Math.cos(rotYaw);
  const sinY = Math.sin(rotYaw);
  const cosP = Math.cos(rotPitch);
  const sinP = Math.sin(rotPitch);
  const gScale = palette.granuleScale;

  // Slight off-center specular/convective peak so the sphere has unmistakable 3D volume
  const lightX = -0.22;
  const lightY = -0.24;
  const lightZ = Math.sqrt(1 - lightX * lightX - lightY * lightY);

  const aaBand = 1.25; // Sub-pixel anti-aliasing width at stellar limb
  const maxR = discR + aaBand * 0.5;

  for (let py = 0; py < sizePx; py++) {
    const dy = py + 0.5 - cy;
    if (Math.abs(dy) > maxR) continue;

    for (let px = 0; px < sizePx; px++) {
      const dx = px + 0.5 - cx;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) continue;

      // Sub-pixel limb coverage alpha
      const coverage = clamp01((discR + aaBand * 0.5 - dist) / aaBand);
      if (coverage <= 0) continue;

      const nx = dx / discR;
      const ny = dy / discR;
      const nzSq = Math.max(0, 1 - nx * nx - ny * ny);
      const nz = Math.sqrt(nzSq); // mu = cos(theta) for Eddington limb darkening

      // Rotate surface normal into star's body frame (with Pitch then Yaw)
      const ry1 = ny * cosP - nz * sinP;
      const rz1 = ny * sinP + nz * cosP;
      // Differential rotation: equatorial latitudes rotate slightly faster
      const diffRot = rotYaw * (1.0 - 0.18 * ry1 * ry1);
      const cY = rotYaw === 0 ? cosY : Math.cos(diffRot);
      const sY = rotYaw === 0 ? sinY : Math.sin(diffRot);
      const sx = nx * cY + rz1 * sY;
      const sy = ry1;
      const sz = -nx * sY + rz1 * cY;

      // 2a. Multi-octave 3D Convective Granulation & Supergranulation
      const nGran1 = starNoise3D(sx * gScale, sy * gScale, sz * gScale, seed);
      const nGran2 = starNoise3D(sx * gScale * 2.15, sy * gScale * 2.15, sz * gScale * 2.15, seed + 101);
      // Cellular ridge pattern for convective cells (bright cell centers, darker intergranular lanes)
      const cell = 1.0 - Math.abs(nGran2 * 2.0 - 1.0);
      const granuleFactor = clamp01(0.55 * nGran1 + 0.45 * cell);

      // 2b. Eddington Limb Darkening + 3D Spherical Shading
      const mu = nz;
      const limbFactor = Math.pow(mu, 0.68); // 1 at center, 0 at limb
      const sphereHighlight = Math.max(0, nx * lightX + ny * lightY + nz * lightZ);

      // Blend Limb -> Base -> Core across photosphere and granulation cells
      const baseWeight = clamp01(limbFactor * 0.85 + granuleFactor * 0.28 - 0.1);
      const coreWeight = clamp01(
        Math.pow(sphereHighlight, 1.65) * 0.52 +
          limbFactor * Math.max(0, granuleFactor - 0.48) * 0.85
      );

      let rCol = limbRgb[0] + (baseRgb[0] - limbRgb[0]) * baseWeight;
      let gCol = limbRgb[1] + (baseRgb[1] - limbRgb[1]) * baseWeight;
      let bCol = limbRgb[2] + (baseRgb[2] - limbRgb[2]) * baseWeight;

      rCol += (coreRgb[0] - rCol) * coreWeight;
      gCol += (coreRgb[1] - gCol) * coreWeight;
      bCol += (coreRgb[2] - bCol) * coreWeight;

      // 2c. Evaluate Bipolar Sunspot Groups (Umbra + Radially Striated Penumbra + Bright Faculae)
      if (spots.length > 0) {
        let maxUmbra = 0;
        let maxPenumbra = 0;
        let maxFaculae = 0;

        for (let s = 0; s < spots.length; s++) {
          const sp = spots[s];
          // Chord distance on unit sphere between (sx, sy, sz) and spot center (ux, uy, uz)
          const dux = sx - sp.ux;
          const duy = sy - sp.uy;
          const duz = sz - sp.uz;
          const dAng = Math.sqrt(dux * dux + duy * duy + duz * duz);

          if (dAng < sp.angularRadius * 2.35) {
            // Warp spot boundary with fine 3D noise for organic, irregular penumbral filaments
            const warp =
              (starNoise3D(
                sx * 18 + sp.seedOffset,
                sy * 18,
                sz * 18,
                seed + sp.seedOffset
              ) -
                0.5) *
              0.28;
            const normD = dAng / (sp.angularRadius * (1.0 + warp));

            // Umbra core: normD < 0.46
            if (normD < 0.52) {
              const uMask = clamp01((0.52 - normD) / 0.18) * sp.strength;
              if (uMask > maxUmbra) maxUmbra = uMask;
            }

            // Penumbra ring: normD < 1.05 with radial filament striations
            if (normD < 1.05) {
              const striation =
                0.82 +
                0.18 *
                  starNoise3D(
                    sx * 32,
                    sy * 32,
                    sz * 32,
                    seed + sp.seedOffset + 3
                  );
              const pMask = clamp01((1.05 - normD) / 0.25) * sp.strength * striation;
              if (pMask > maxPenumbra) maxPenumbra = pMask;
            }

            // Faculae / Plage bright magnetic network ring surrounding sunspot group (1.0 < normD < 2.1)
            // Faculae are brightest near the solar limb (1 - mu * 0.65) where elevated magnetic flux tubes shine!
            if (normD >= 0.95 && normD < 2.25 && nGran2 > 0.42) {
              const ringEnv = Math.sin(((normD - 0.95) / 1.3) * Math.PI);
              const limbBoost = 0.55 + 0.75 * (1.0 - mu * 0.65);
              const fMask =
                clamp01(ringEnv * (nGran2 - 0.35) * 1.6 * limbBoost) *
                Math.min(1.0, sp.strength);
              if (fMask > maxFaculae) maxFaculae = fMask;
            }
          }
        }

        // Apply bright magnetic faculae first
        if (maxFaculae > 0.01) {
          const fAmt = clamp01(maxFaculae * 0.78);
          rCol += (faculaeRgb[0] - rCol) * fAmt;
          gCol += (faculaeRgb[1] - gCol) * fAmt;
          bCol += (faculaeRgb[2] - bCol) * fAmt;
        }

        // Apply warm-dark penumbra ring
        if (maxPenumbra > 0.01) {
          const pAmt = clamp01(maxPenumbra * 0.88);
          rCol += (penumbraRgb[0] - rCol) * pAmt;
          gCol += (penumbraRgb[1] - gCol) * pAmt;
          bCol += (penumbraRgb[2] - bCol) * pAmt;
        }

        // Apply deep magnetically cooled umbra core
        if (maxUmbra > 0.01) {
          const uAmt = clamp01(maxUmbra * 0.95);
          rCol += (umbraRgb[0] - rCol) * uAmt;
          gCol += (umbraRgb[1] - gCol) * uAmt;
          bCol += (umbraRgb[2] - bCol) * uAmt;
        }
      }

      // Composite photosphere pixel over the coronal glow background using sub-pixel coverage
      const idx = (py * sizePx + px) * 4;
      const bgR = data[idx];
      const bgG = data[idx + 1];
      const bgB = data[idx + 2];
      const bgA = data[idx + 3] / 255;

      const outA = coverage + bgA * (1 - coverage);
      if (outA > 0) {
        data[idx] = Math.round((rCol * coverage + bgR * bgA * (1 - coverage)) / outA);
        data[idx + 1] = Math.round((gCol * coverage + bgG * bgA * (1 - coverage)) / outA);
        data[idx + 2] = Math.round((bCol * coverage + bgB * bgA * (1 - coverage)) / outA);
        data[idx + 3] = Math.round(outA * 255);
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

const starSpriteCache = new Map<string, string>();

/**
 * Generates and caches a high-resolution colored & sunspotted procedural star sprite Data URL.
 */
export function getProceduralStarSpriteDataUrl(
  star?: StarAssetDescriptor | null,
  sizePx: number = 144,
  rotYaw: number = 0,
  rotPitch: number = 0.12
): string {
  if (typeof document === 'undefined') {
    return getStarAssetPath(star);
  }
  const key = `${star?.label || 'A'}|${star?.spectralType || 'G2V'}|${star?.category || 'MS'}|${(star?.mass || 1).toFixed(3)}|${Math.round(star?.Teff || 5778)}|${star?.colorHex || ''}|${sizePx}|${rotYaw.toFixed(2)}|${rotPitch.toFixed(2)}`;
  const cached = starSpriteCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  renderProceduralStarToCanvas(canvas, star, sizePx, rotYaw, rotPitch);
  const url = canvas.toDataURL('image/png');

  if (starSpriteCache.size > 400) {
    const firstKey = starSpriteCache.keys().next().value;
    if (firstKey) starSpriteCache.delete(firstKey);
  }
  starSpriteCache.set(key, url);
  return url;
}

/**
 * Returns the asset path for a star based on its astrophysical classification.
 */
export function getStarAssetPath(star?: StarAssetDescriptor | null): string {
  const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : './';
  if (!star) return `${base}assets/stars/star-g.svg`;

  const cat = (star.category || '').toLowerCase();
  const sp = (star.spectralType || '').trim().toUpperCase();

  // 1. Supermassive Black Hole (SMBH / Galactic Nucleus / Sagittarius A*)
  if (
    cat.includes('supermassive') ||
    sp.includes('SMBH') ||
    (typeof star.mass === 'number' && star.mass > 999999)
  ) {
    return `${base}assets/stars/star-smbh.svg`;
  }

  // 2. Stellar-Mass Black Hole
  if (
    cat.includes('black hole') ||
    sp.includes('BLACK HOLE') ||
    sp === 'BH' ||
    sp.startsWith('BH ') ||
    sp.startsWith('BH(') ||
    sp.includes('/ BH')
  ) {
    return `${base}assets/stars/star-black-hole.svg`;
  }

  // 3. Neutron Star / Pulsar
  if (
    cat.includes('neutron') ||
    cat.includes('pulsar') ||
    sp.includes('NEUTRON') ||
    sp.includes('PULSAR') ||
    sp === 'NS'
  ) {
    return `${base}assets/stars/star-neutron.svg`;
  }

  // 4. White Dwarf (Degenerate Core)
  if (
    cat.includes('white dwarf') ||
    sp.includes('WHITE DWARF') ||
    sp.startsWith('D') ||
    sp.startsWith('WD') ||
    sp.includes('DWARF (D')
  ) {
    return `${base}assets/stars/star-white-dwarf.svg`;
  }

  // 5. Brown Dwarf (L, T, Y sub-stellar dwarf)
  if (
    cat.includes('brown dwarf') ||
    sp.startsWith('L') ||
    sp.startsWith('T') ||
    sp.startsWith('Y')
  ) {
    return `${base}assets/stars/star-dwarf.svg`;
  }

  // 6. Harvard Spectral Classification: O, B, A, F, G, K, M
  if (sp.startsWith('O')) return `${base}assets/stars/star-o.svg`;
  if (sp.startsWith('B')) return `${base}assets/stars/star-b.svg`;
  if (sp.startsWith('A')) return `${base}assets/stars/star-a.svg`;
  if (sp.startsWith('F')) return `${base}assets/stars/star-f.svg`;
  if (sp.startsWith('G')) return `${base}assets/stars/star-g.svg`;
  if (sp.startsWith('K')) return `${base}assets/stars/star-k.svg`;
  if (sp.startsWith('M')) return `${base}assets/stars/star-m.svg`;

  // Fallback based on star colorHex if spectralType was unspecified
  const col = (star.colorHex || '').toLowerCase();
  if (col.includes('93c5fd') || col.includes('60a5fa') || col.includes('3b82f6') || col.includes('2563eb')) {
    return `${base}assets/stars/star-b.svg`;
  }
  if (col.includes('f87171') || col.includes('ef4444') || col.includes('dc2626') || col.includes('b91c1c')) {
    return `${base}assets/stars/star-m.svg`;
  }
  if (col.includes('fb923c') || col.includes('f97316') || col.includes('ea580c')) {
    return `${base}assets/stars/star-k.svg`;
  }

  // Default Solar G-type
  return `${base}assets/stars/star-g.svg`;
}
