import { teffToRgb } from '../astrophysics/colors';

/**
 * Zook Astro - Star Asset Resolver & Procedural Photosphere Renderer
 * Computes continuous blackbody colors from effective surface temperature Teff (with 6500 K = pure white),
 * renders gas-giant latitudinal cloud bands on brown dwarfs, and ensures dead stars (compact remnants)
 * have smooth, spotless photospheres.
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
  spotCoverage: number; // 0 for dead stars and brown dwarfs; >0 for live stars
  granuleScale: number; // Spatial frequency of convective granules
  isCompactRemnant: boolean;
  isBlackHole: boolean;
  isBrownDwarf: boolean;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(rgb: [number, number, number]): string {
  return (
    '#' +
    clampByte(rgb[0]).toString(16).padStart(2, '0') +
    clampByte(rgb[1]).toString(16).padStart(2, '0') +
    clampByte(rgb[2]).toString(16).padStart(2, '0')
  );
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  const u = clamp01(t);
  return [
    clampByte(a[0] + (b[0] - a[0]) * u),
    clampByte(a[1] + (b[1] - a[1]) * u),
    clampByte(a[2] + (b[2] - a[2]) * u),
  ];
}

function scaleRgb(a: [number, number, number], factor: number): [number, number, number] {
  return [
    clampByte(a[0] * factor),
    clampByte(a[1] * factor),
    clampByte(a[2] * factor),
  ];
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = (hex || '#ffffff').replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) || 255,
      parseInt(clean[1] + clean[1], 16) || 255,
      parseInt(clean[2] + clean[2], 16) || 255,
    ];
  }
  const n = parseInt(clean.slice(0, 6), 16);
  if (Number.isNaN(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Resolves a star's effective surface temperature Teff (K).
 * Uses star.Teff directly when provided, or estimates from spectral subtype if omitted.
 */
export function resolveEffectiveTeff(star?: StarAssetDescriptor | null): number {
  if (typeof star?.Teff === 'number' && Number.isFinite(star.Teff) && star.Teff > 0) {
    return star.Teff;
  }

  const sp = (star?.spectralType || '').trim().toUpperCase();
  const cat = (star?.category || '').toLowerCase();

  if (cat.includes('neutron') || cat.includes('pulsar') || sp === 'NS' || sp.includes('PULSAR')) {
    return 95000;
  }
  if (cat.includes('white dwarf') || sp.startsWith('DA') || sp.startsWith('DB') || sp.startsWith('DC') || sp.startsWith('WD')) {
    const subMatch = sp.match(/D[A-Z](\d)/);
    if (subMatch) {
      const idx = Math.max(1, parseInt(subMatch[1], 10));
      return Math.round(50400 / idx);
    }
    return 14500;
  }

  // Parse Harvard / sub-stellar spectral letter + numeric subtype (0..9)
  const m = sp.match(/^([OBAFGKMLTY])(\d(?:\.\d)?)?/);
  if (m) {
    const letter = m[1];
    const sub = m[2] !== undefined ? parseFloat(m[2]) : 5;
    const frac = clamp01(sub / 10);
    switch (letter) {
      case 'O':
        return Math.round(48000 - frac * 18000);
      case 'B':
        return Math.round(30000 - frac * 20000);
      case 'A':
        return Math.round(10000 - frac * 2500);
      case 'F':
        return Math.round(7500 - frac * 1500);
      case 'G':
        return Math.round(6000 - frac * 800);
      case 'K':
        return Math.round(5200 - frac * 1350);
      case 'M':
        return Math.round(3850 - frac * 1550);
      case 'L':
        return Math.round(2250 - frac * 900);
      case 'T':
        return Math.round(1350 - frac * 800);
      case 'Y':
        return Math.round(550 - frac * 300);
    }
  }

  if (cat.includes('brown dwarf')) return 1250;
  return 5778;
}

/**
 * Computes scientifically grounded stellar photosphere colors continuously from surface temperature Teff
 * (with 6500 K = pure white #ffffff), limb darkening hues, gas-giant band colors for brown dwarfs,
 * and spotless degenerate photospheres for dead stars (white dwarfs, neutron stars, black holes).
 */
export function getStarSpectralPalette(star?: StarAssetDescriptor | null): StarSpectralPalette {
  const cat = (star?.category || '').toLowerCase();
  const sp = (star?.spectralType || '').trim().toUpperCase();
  const teff = resolveEffectiveTeff(star);

  // 1. Dead Star: Black Hole (Stellar or Supermassive) — no sunspots
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
      isBrownDwarf: false,
    };
  }

  // 2. Dead Stars: Neutron Star / Pulsar or White Dwarf — colored by Teff (6500 K = white), NO sunspots!
  const isNeutronStar =
    cat.includes('neutron') ||
    cat.includes('pulsar') ||
    sp.includes('NEUTRON') ||
    sp.includes('PULSAR') ||
    sp === 'NS' ||
    sp.startsWith('PSR');

  const isWhiteDwarf =
    cat.includes('white dwarf') ||
    cat.includes('remnant') ||
    sp.includes('WHITE DWARF') ||
    sp.startsWith('DA') ||
    sp.startsWith('DB') ||
    sp.startsWith('DC') ||
    sp.startsWith('DZ') ||
    sp.startsWith('DQ') ||
    sp.startsWith('WD') ||
    sp.includes('DWARF (D');

  if (isNeutronStar || isWhiteDwarf) {
    const baseRgb = teffToRgb(teff, false);
    const coreRgb = mixRgb(baseRgb, [255, 255, 255], 0.72);
    const limbTempRgb = teffToRgb(Math.max(2250, teff * 0.84), false);
    const limbRgb = scaleRgb(limbTempRgb, 0.76);
    return {
      coreHex: rgbToHex(coreRgb),
      baseHex: rgbToHex(baseRgb),
      limbHex: rgbToHex(limbRgb),
      umbraHex: rgbToHex(limbRgb),
      penumbraHex: rgbToHex(limbRgb),
      faculaeHex: '#ffffff',
      coronaHex: rgbToHex(baseRgb),
      spotCoverage: 0, // Dead stars never have sunspots
      granuleScale: 16,
      isCompactRemnant: true,
      isBlackHole: false,
      isBrownDwarf: false,
    };
  }

  // 3. Sub-stellar Brown Dwarf (L / T / Y or Teff < 2250 K non-giant):
  // Colored continuously by Teff, with gas-giant latitudinal cloud bands instead of sunspots!
  const isGiant = cat.includes('giant') || cat.includes('supergiant') || (star?.radius ?? 0.5) > 2.5;
  const isBrownDwarf =
    cat.includes('brown dwarf') ||
    sp.includes('(BD)') ||
    sp.startsWith('L') ||
    sp.startsWith('T') ||
    sp.startsWith('Y') ||
    (teff < 2250 && !isGiant);

  if (isBrownDwarf) {
    const baseRgb = teffToRgb(teff, true);
    const coreRgb = mixRgb(baseRgb, [255, 228, 242], 0.45);
    const beltRgb = scaleRgb(teffToRgb(Math.max(180, teff * 0.84), true), 0.62);
    const deepBeltRgb = scaleRgb(teffToRgb(Math.max(150, teff * 0.72), true), 0.35);
    const limbRgb = scaleRgb(teffToRgb(Math.max(160, teff * 0.76), true), 0.48);
    const highCloudRgb = mixRgb(baseRgb, [255, 240, 250], 0.62);

    return {
      coreHex: rgbToHex(coreRgb),
      baseHex: rgbToHex(baseRgb),
      limbHex: rgbToHex(limbRgb),
      umbraHex: rgbToHex(deepBeltRgb), // Used as deep dark belt color on brown dwarfs
      penumbraHex: rgbToHex(beltRgb), // Used as primary cloud belt color on brown dwarfs
      faculaeHex: rgbToHex(highCloudRgb), // Used as bright equatorial zone / jet highlight
      coronaHex: rgbToHex(baseRgb),
      spotCoverage: 0, // Brown dwarfs have gas-giant bands instead of sunspots
      granuleScale: 8.0,
      isCompactRemnant: false,
      isBlackHole: false,
      isBrownDwarf: true,
    };
  }

  // 4. Live Stars (Main Sequence, Subgiants, Giants, Supergiants):
  // Continuous blackbody color directly from surface temperature Teff (with 6500 K = pure white #ffffff)
  const baseRgb = teffToRgb(teff, false);
  const coreRgb = mixRgb(baseRgb, [255, 255, 255], 0.58);
  // Eddington limb darkening probes cooler upper photosphere (T_limb ~ 0.80 * Teff) with darker intensity
  const limbTempRgb = teffToRgb(Math.max(2250, teff * 0.80), false);
  const limbRgb = scaleRgb(limbTempRgb, 0.72);
  // Magnetically cooled sunspot penumbra (~0.75 * Teff) and deep umbra (~0.62 * Teff)
  const penumbraRgb = scaleRgb(teffToRgb(Math.max(2250, teff * 0.75), false), 0.46);
  const umbraRgb = scaleRgb(teffToRgb(Math.max(2250, teff * 0.62), false), 0.17);
  const faculaeRgb = mixRgb(baseRgb, [255, 255, 255], 0.75);

  // Continuous magnetic starspot coverage as a function of Teff (convective envelope depth)
  let spotCoverage: number;
  if (teff < 3700) {
    spotCoverage = isGiant ? 1.55 : 1.42;
  } else if (teff < 5200) {
    const t = (teff - 3700) / (5200 - 3700);
    spotCoverage = 1.42 - 0.22 * t;
  } else if (teff < 6500) {
    const t = (teff - 5200) / (6500 - 5200);
    spotCoverage = 1.20 - 0.35 * t;
  } else if (teff < 8500) {
    const t = (teff - 6500) / (8500 - 6500);
    spotCoverage = 0.85 - 0.35 * t;
  } else {
    spotCoverage = 0.45;
  }

  const granuleScale = isGiant
    ? 6.0
    : Math.max(7.5, Math.min(14.5, 7.5 + ((teff - 2500) / 10000) * 6.5));

  return {
    coreHex: rgbToHex(coreRgb),
    baseHex: rgbToHex(baseRgb),
    limbHex: rgbToHex(limbRgb),
    umbraHex: rgbToHex(umbraRgb),
    penumbraHex: rgbToHex(penumbraRgb),
    faculaeHex: rgbToHex(faculaeRgb),
    coronaHex: rgbToHex(baseRgb),
    spotCoverage,
    granuleScale,
    isCompactRemnant: false,
    isBlackHole: false,
    isBrownDwarf: false,
  };
}

/**
 * Fast deterministic 3D value noise with quintic C2 interpolation for stellar granulation,
 * brown dwarf cloud bands, and sunspot fields.
 */
function starHash3(ix: number, iy: number, iz: number, seed: number): number {
  let n =
    Math.imul(ix, 374761393) +
    Math.imul(iy, 668265263) +
    Math.imul(iz, 2147483647) +
    Math.imul(seed, 1664525);
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
    const lonRad =
      i < 2
        ? (i === 0 ? -0.36 : 0.42) + (h2 - 0.5) * 0.45
        : (h2 * 2 - 1) * Math.PI;

    const baseRadius = (0.095 + h3 * 0.115) * Math.min(1.35, 0.78 + spotCoverage * 0.32);
    const strength = 0.75 + h4 * 0.25;

    const cosLat1 = Math.cos(latRad);
    groups.push({
      ux: cosLat1 * Math.sin(lonRad),
      uy: Math.sin(latRad),
      uz: cosLat1 * Math.cos(lonRad),
      angularRadius: baseRadius,
      strength,
      seedOffset: i * 17 + 1,
    });

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
 * Renders a 3D temperature-colored, limb-darkened star portrait onto a canvas:
 * - Live stars: continuous Teff color (6500 K = white), convective granulation, and bipolar sunspots
 * - Brown dwarfs: continuous sub-stellar Teff color with gas-giant latitudinal cloud bands & jet waves (no sunspots)
 * - Dead stars (White Dwarfs, Neutron Stars, Black Holes): spotless degenerate rendering
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

  const teff = resolveEffectiveTeff(star);
  const seedStr = `${star?.label || 'A'}_${star?.spectralType || 'G2V'}_${(star?.mass || 1).toFixed(3)}_${Math.round(teff)}`;
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

  // 2. Raycast 3D Spherical Photosphere
  const imgData = ctx.getImageData(0, 0, sizePx, sizePx);
  const data = imgData.data;

  const coreRgb = hexToRgbTuple(palette.coreHex);
  const baseRgb = hexToRgbTuple(palette.baseHex);
  const limbRgb = hexToRgbTuple(palette.limbHex);
  const umbraRgb = hexToRgbTuple(palette.umbraHex);
  const penumbraRgb = hexToRgbTuple(palette.penumbraHex);
  const faculaeRgb = hexToRgbTuple(palette.faculaeHex);

  // Dead stars and brown dwarfs have spotCoverage === 0 -> no sunspots!
  const spots =
    palette.isCompactRemnant || palette.isBrownDwarf
      ? []
      : generateDeterministicSunspots(seed, palette.spotCoverage);

  const cosY = Math.cos(rotYaw);
  const sinY = Math.sin(rotYaw);
  const cosP = Math.cos(rotPitch);
  const sinP = Math.sin(rotPitch);
  const gScale = palette.granuleScale;

  // Slight off-center specular/convective peak for 3D spherical volume
  const lightX = -0.22;
  const lightY = -0.24;
  const lightZ = Math.sqrt(1 - lightX * lightX - lightY * lightY);

  const aaBand = 1.25;
  const maxR = discR + aaBand * 0.5;
  const bdBandFreq = 5.2 + (seed % 5) * 0.45;

  for (let py = 0; py < sizePx; py++) {
    const dy = py + 0.5 - cy;
    if (Math.abs(dy) > maxR) continue;

    for (let px = 0; px < sizePx; px++) {
      const dx = px + 0.5 - cx;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) continue;

      const coverage = clamp01((discR + aaBand * 0.5 - dist) / aaBand);
      if (coverage <= 0) continue;

      const nx = dx / discR;
      const ny = dy / discR;
      const nzSq = Math.max(0, 1 - nx * nx - ny * ny);
      const nz = Math.sqrt(nzSq); // mu = cos(theta)

      // Rotate surface normal into star's body frame (with Pitch then Yaw)
      const ry1 = ny * cosP - nz * sinP;
      const rz1 = ny * sinP + nz * cosP;
      const diffRot = rotYaw * (1.0 - 0.18 * ry1 * ry1);
      const cY = rotYaw === 0 ? cosY : Math.cos(diffRot);
      const sY = rotYaw === 0 ? sinY : Math.sin(diffRot);
      const sx = nx * cY + rz1 * sY;
      const sy = ry1;
      const sz = -nx * sY + rz1 * cY;

      const mu = nz;
      const limbFactor = Math.pow(mu, 0.68);
      const sphereHighlight = Math.max(0, nx * lightX + ny * lightY + nz * lightZ);

      let rCol: number;
      let gCol: number;
      let bCol: number;

      if (palette.isBrownDwarf) {
        // ====================================================================
        // BROWN DWARF: Gas-Giant Latitudinal Zonal Cloud Bands & Jet Eddies
        // ====================================================================
        const wave1 = (starNoise3D(sx * 2.8, sy * 6.5, sz * 2.8, seed + 17) - 0.5) * 0.18;
        const wave2 = (starNoise3D(sx * 7.2, sy * 15.0, sz * 7.2, seed + 53) - 0.5) * 0.08;
        const lat = sy + wave1 + wave2;

        // Primary alternating equatorial/temperate zones & condensate belts
        const primaryBand = 0.5 + 0.5 * Math.cos(lat * Math.PI * bdBandFreq);
        // Secondary fine zonal jet streams
        const jetStream = 0.5 + 0.5 * Math.sin(lat * Math.PI * bdBandFreq * 2.15 + wave1 * 5.0);
        const bandMix = clamp01(primaryBand * 0.72 + jetStream * 0.28);

        // Interpolate between deep condensate belts (umbraRgb -> penumbraRgb) and glowing thermal zones (baseRgb -> coreRgb)
        let zoneR: number;
        let zoneG: number;
        let zoneB: number;
        if (bandMix < 0.45) {
          const u = bandMix / 0.45;
          zoneR = umbraRgb[0] + (penumbraRgb[0] - umbraRgb[0]) * u;
          zoneG = umbraRgb[1] + (penumbraRgb[1] - umbraRgb[1]) * u;
          zoneB = umbraRgb[2] + (penumbraRgb[2] - umbraRgb[2]) * u;
        } else {
          const u = (bandMix - 0.45) / 0.55;
          zoneR = penumbraRgb[0] + (baseRgb[0] - penumbraRgb[0]) * u;
          zoneG = penumbraRgb[1] + (baseRgb[1] - penumbraRgb[1]) * u;
          zoneB = penumbraRgb[2] + (baseRgb[2] - penumbraRgb[2]) * u;
        }

        // Bright equatorial/temperate upwelling zone highlights
        const crest = Math.pow(Math.max(0, bandMix - 0.55) / 0.45, 1.6) * limbFactor;
        zoneR += (coreRgb[0] - zoneR) * (crest * 0.65 + Math.pow(sphereHighlight, 1.8) * 0.35);
        zoneG += (coreRgb[1] - zoneG) * (crest * 0.65 + Math.pow(sphereHighlight, 1.8) * 0.35);
        zoneB += (coreRgb[2] - zoneB) * (crest * 0.65 + Math.pow(sphereHighlight, 1.8) * 0.35);

        // Apply 3D atmospheric limb darkening toward limbRgb
        const limbBlend = clamp01(0.22 + 0.78 * limbFactor);
        rCol = limbRgb[0] + (zoneR - limbRgb[0]) * limbBlend;
        gCol = limbRgb[1] + (zoneG - limbRgb[1]) * limbBlend;
        bCol = limbRgb[2] + (zoneB - limbRgb[2]) * limbBlend;
      } else if (palette.isCompactRemnant) {
        // ====================================================================
        // DEAD STAR (White Dwarf / Neutron Star): Smooth Spotless Degenerate Sphere
        // ====================================================================
        const baseWeight = clamp01(limbFactor * 0.92);
        const coreWeight = clamp01(Math.pow(sphereHighlight, 1.5) * 0.62 + Math.pow(mu, 2.2) * 0.35);

        rCol = limbRgb[0] + (baseRgb[0] - limbRgb[0]) * baseWeight;
        gCol = limbRgb[1] + (baseRgb[1] - limbRgb[1]) * baseWeight;
        bCol = limbRgb[2] + (baseRgb[2] - limbRgb[2]) * baseWeight;

        rCol += (coreRgb[0] - rCol) * coreWeight;
        gCol += (coreRgb[1] - gCol) * coreWeight;
        bCol += (coreRgb[2] - bCol) * coreWeight;
      } else {
        // ====================================================================
        // LIVE STAR: Convective Granulation + Eddington Limb Darkening + Sunspots
        // ====================================================================
        const nGran1 = starNoise3D(sx * gScale, sy * gScale, sz * gScale, seed);
        const nGran2 = starNoise3D(
          sx * gScale * 2.15,
          sy * gScale * 2.15,
          sz * gScale * 2.15,
          seed + 101
        );
        const cell = 1.0 - Math.abs(nGran2 * 2.0 - 1.0);
        const granuleFactor = clamp01(0.55 * nGran1 + 0.45 * cell);

        const baseWeight = clamp01(limbFactor * 0.85 + granuleFactor * 0.28 - 0.1);
        const coreWeight = clamp01(
          Math.pow(sphereHighlight, 1.65) * 0.52 +
            limbFactor * Math.max(0, granuleFactor - 0.48) * 0.85
        );

        rCol = limbRgb[0] + (baseRgb[0] - limbRgb[0]) * baseWeight;
        gCol = limbRgb[1] + (baseRgb[1] - limbRgb[1]) * baseWeight;
        bCol = limbRgb[2] + (baseRgb[2] - limbRgb[2]) * baseWeight;

        rCol += (coreRgb[0] - rCol) * coreWeight;
        gCol += (coreRgb[1] - gCol) * coreWeight;
        bCol += (coreRgb[2] - bCol) * coreWeight;

        // Evaluate Bipolar Sunspot Groups (Umbra + Radially Striated Penumbra + Bright Faculae)
        if (spots.length > 0) {
          let maxUmbra = 0;
          let maxPenumbra = 0;
          let maxFaculae = 0;

          for (let s = 0; s < spots.length; s++) {
            const sp = spots[s];
            const dux = sx - sp.ux;
            const duy = sy - sp.uy;
            const duz = sz - sp.uz;
            const dAng = Math.sqrt(dux * dux + duy * duy + duz * duz);

            if (dAng < sp.angularRadius * 2.35) {
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

              if (normD < 0.52) {
                const uMask = clamp01((0.52 - normD) / 0.18) * sp.strength;
                if (uMask > maxUmbra) maxUmbra = uMask;
              }

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

          if (maxFaculae > 0.01) {
            const fAmt = clamp01(maxFaculae * 0.78);
            rCol += (faculaeRgb[0] - rCol) * fAmt;
            gCol += (faculaeRgb[1] - gCol) * fAmt;
            bCol += (faculaeRgb[2] - bCol) * fAmt;
          }

          if (maxPenumbra > 0.01) {
            const pAmt = clamp01(maxPenumbra * 0.88);
            rCol += (penumbraRgb[0] - rCol) * pAmt;
            gCol += (penumbraRgb[1] - gCol) * pAmt;
            bCol += (penumbraRgb[2] - bCol) * pAmt;
          }

          if (maxUmbra > 0.01) {
            const uAmt = clamp01(maxUmbra * 0.95);
            rCol += (umbraRgb[0] - rCol) * uAmt;
            gCol += (umbraRgb[1] - gCol) * uAmt;
            bCol += (umbraRgb[2] - bCol) * uAmt;
          }
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
 * Generates and caches a high-resolution temperature-colored procedural star sprite Data URL.
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
  const teff = resolveEffectiveTeff(star);
  const key = `${star?.label || 'A'}|${star?.spectralType || 'G2V'}|${star?.category || 'MS'}|${(star?.mass || 1).toFixed(3)}|${Math.round(teff)}|${sizePx}|${rotYaw.toFixed(2)}|${rotPitch.toFixed(2)}`;
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

const svgDataUrlCache = new Map<string, string>();

/**
 * Returns a temperature-accurate SVG asset data URL (or static SVG path for Black Holes)
 * so that even lightweight SVG <image> nodes on the Sector Map reflect:
 * 1) Continuous Teff-based color (6500 K = pure white),
 * 2) Gas-giant horizontal bands on Brown Dwarfs (no sunspots),
 * 3) Spotless rendering on Dead Stars (White Dwarfs, Neutron Stars, Black Holes).
 */
export function getStarAssetPath(star?: StarAssetDescriptor | null): string {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? import.meta.env.BASE_URL
      : './';
  if (!star) return `${base}assets/stars/star-g.svg`;

  const cat = (star.category || '').toLowerCase();
  const sp = (star.spectralType || '').trim().toUpperCase();

  // 1. Supermassive Black Hole
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

  const teffRounded = Math.round(resolveEffectiveTeff(star) / 25) * 25;
  const pal = getStarSpectralPalette(star);
  const cacheKey = `${teffRounded}|${pal.isCompactRemnant ? 'rem' : pal.isBrownDwarf ? 'bd' : 'ms'}|${sp.slice(0, 3)}`;
  const cached = svgDataUrlCache.get(cacheKey);
  if (cached) return cached;

  let svg: string;
  if (pal.isCompactRemnant) {
    // Dead Star (Neutron Star or White Dwarf): spotless degenerate core with temperature-based glow
    const isNS =
      cat.includes('neutron') ||
      cat.includes('pulsar') ||
      sp.includes('NEUTRON') ||
      sp.includes('PULSAR') ||
      sp === 'NS' ||
      sp.startsWith('PSR');
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100"><defs><radialGradient id="g" cx="0" cy="0" r="44" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${pal.coreHex}" stop-opacity="1"/><stop offset="30%" stop-color="${pal.baseHex}" stop-opacity="0.85"/><stop offset="65%" stop-color="${pal.limbHex}" stop-opacity="0.35"/><stop offset="100%" stop-color="${pal.limbHex}" stop-opacity="0"/></radialGradient><radialGradient id="c" cx="-2" cy="-2" r="11" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${pal.coreHex}"/><stop offset="65%" stop-color="${pal.baseHex}"/><stop offset="100%" stop-color="${pal.limbHex}"/></radialGradient></defs><circle cx="0" cy="0" r="42" fill="url(#g)"/>${
      isNS
        ? `<path d="M 0 -42 L 2.2 -11 L -2.2 -11 Z" fill="${pal.baseHex}" opacity="0.78"/><path d="M 0 42 L 2.2 11 L -2.2 11 Z" fill="${pal.baseHex}" opacity="0.78"/><ellipse cx="0" cy="0" rx="19" ry="6" fill="none" stroke="${pal.baseHex}" stroke-width="0.9" opacity="0.7" transform="rotate(-25)"/>`
        : ''
    }<circle cx="0" cy="0" r="9.5" fill="url(#c)" stroke="${pal.coreHex}" stroke-width="0.7"/></svg>`;
  } else if (pal.isBrownDwarf) {
    // Brown Dwarf: gas-giant horizontal cloud bands clipped to the sub-stellar disc (NO sunspots!)
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100"><defs><radialGradient id="g" cx="0" cy="0" r="40" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${pal.coreHex}" stop-opacity="0.82"/><stop offset="40%" stop-color="${pal.baseHex}" stop-opacity="0.42"/><stop offset="75%" stop-color="${pal.limbHex}" stop-opacity="0.16"/><stop offset="100%" stop-color="${pal.limbHex}" stop-opacity="0"/></radialGradient><radialGradient id="c" cx="-2.5" cy="-2.5" r="15" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${pal.coreHex}"/><stop offset="55%" stop-color="${pal.baseHex}"/><stop offset="100%" stop-color="${pal.limbHex}"/></radialGradient><clipPath id="bdClip"><circle cx="0" cy="0" r="12"/></clipPath></defs><circle cx="0" cy="0" r="38" fill="url(#g)"/><g clip-path="url(#bdClip)" transform="rotate(-8)"><circle cx="0" cy="0" r="12" fill="url(#c)"/><rect x="-14" y="-8.8" width="28" height="2.4" fill="${pal.penumbraHex}" opacity="0.78"/><rect x="-14" y="-4.6" width="28" height="2.8" fill="${pal.umbraHex}" opacity="0.72"/><rect x="-14" y="-0.8" width="28" height="2.0" fill="${pal.faculaeHex}" opacity="0.45"/><rect x="-14" y="2.0" width="28" height="2.9" fill="${pal.penumbraHex}" opacity="0.80"/><rect x="-14" y="6.4" width="28" height="2.4" fill="${pal.umbraHex}" opacity="0.75"/></g><circle cx="0" cy="0" r="12" fill="none" stroke="${pal.baseHex}" stroke-width="0.65" opacity="0.85"/></svg>`;
  } else {
    // Live Star: continuous Teff-colored photosphere (6500 K = white) with bipolar sunspots
    const spotScale = Math.max(0.55, Math.min(1.25, pal.spotCoverage * 0.85));
    const r1x = +(2.4 * spotScale).toFixed(2);
    const r1y = +(1.6 * spotScale).toFixed(2);
    const u1x = +(1.25 * spotScale).toFixed(2);
    const u1y = +(0.85 * spotScale).toFixed(2);
    const r2x = +(2.0 * spotScale).toFixed(2);
    const r2y = +(1.35 * spotScale).toFixed(2);
    const u2x = +(1.05 * spotScale).toFixed(2);
    const u2y = +(0.72 * spotScale).toFixed(2);

    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100"><defs><radialGradient id="g" cx="0" cy="0" r="45" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${pal.coreHex}" stop-opacity="0.95"/><stop offset="32%" stop-color="${pal.baseHex}" stop-opacity="0.62"/><stop offset="68%" stop-color="${pal.limbHex}" stop-opacity="0.22"/><stop offset="100%" stop-color="${pal.limbHex}" stop-opacity="0"/></radialGradient><radialGradient id="c" cx="-3.5" cy="-3.5" r="19" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${pal.coreHex}"/><stop offset="52%" stop-color="${pal.baseHex}"/><stop offset="100%" stop-color="${pal.limbHex}"/></radialGradient></defs><circle cx="0" cy="0" r="44" fill="url(#g)"/><circle cx="0" cy="0" r="14.5" fill="url(#c)" stroke="${pal.coreHex}" stroke-width="0.75"/><ellipse cx="-3.8" cy="-2.6" rx="${r1x}" ry="${r1y}" transform="rotate(-18 -3.8 -2.6)" fill="${pal.penumbraHex}" opacity="0.85"/><ellipse cx="-3.8" cy="-2.6" rx="${u1x}" ry="${u1y}" transform="rotate(-18 -3.8 -2.6)" fill="${pal.umbraHex}" opacity="0.95"/><ellipse cx="4.2" cy="2.8" rx="${r2x}" ry="${r2y}" transform="rotate(20 4.2 2.8)" fill="${pal.penumbraHex}" opacity="0.82"/><ellipse cx="4.2" cy="2.8" rx="${u2x}" ry="${u2y}" transform="rotate(20 4.2 2.8)" fill="${pal.umbraHex}" opacity="0.92"/></svg>`;
  }

  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  if (svgDataUrlCache.size > 500) {
    const firstKey = svgDataUrlCache.keys().next().value;
    if (firstKey) svgDataUrlCache.delete(firstKey);
  }
  svgDataUrlCache.set(cacheKey, dataUrl);
  return dataUrl;
}
