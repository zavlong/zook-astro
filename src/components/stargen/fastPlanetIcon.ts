import { RealisticPlanetBody, getPlanetVisualColor } from '../../core/generation/realisticStarGen';
import { RealisticMoon } from '../../types/astrophysics';
import { clamp, hash2 } from '../../core/math/mathUtils';
import { hexToRgb, blendRgb, scaleRgb, RgbTuple } from '../../core/math/colorUtils';

/**
 * Ultra-fast (< 0.1ms) procedural 2D canvas icon renderer for planets & moons
 * used in Schematic View, Quick-Jump lists, and 2D/3D Orrery sprites (size <= 64px).
 * Eliminates the 64,800-texel surface model generation bottleneck on initial view load.
 */
export function renderFastPlanetIconToCanvas(
  canvas: HTMLCanvasElement,
  planet: RealisticPlanetBody,
  moon: RealisticMoon | null | undefined,
  starColorHex = '#fff4e6',
  moonIndex = 0,
  includeSpriteRings = true
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const isMoon = Boolean(moon);
  const bodyClass = (isMoon ? moon?.moonClass : planet.planetClass) || 'Rocky';
  const classLower = bodyClass.toLowerCase();
  const tempK = (isMoon ? moon?.surfaceTempK : planet.surfaceTempK) ?? 288;
  const pBar = (isMoon ? moon?.pressureBar : planet.pressureBar) ?? 0;
  const hydro = isMoon ? moon?.hydrosphere : planet.hydrosphere;
  const coverage = hydro?.coveragePct ?? 0;
  const hasBiosphere = Boolean(hydro?.biosphere && !hydro.biosphere.toLowerCase().includes('sterile'));
  const hasRings = !isMoon && includeSpriteRings && Boolean(planet.rings);

  const cx = w * 0.5;
  const cy = h * 0.5;
  const R = hasRings ? w * 0.25 : w * 0.37;

  // Deterministic seed from orbital & physical parameters
  const rawSeed = isMoon
    ? Math.round((moon?.a_km || 1000) * 13 + (moon?.radiusKm || 500) * 7 + moonIndex * 101)
    : Math.round((planet.a || 1) * 1000 + (planet.massEarth || 1) * 37 + (planet.radiusEarth || 1) * 73);

  const baseColorHex = isMoon ? getMoonBaseHex(classLower, tempK) : getPlanetVisualColor(planet);
  const baseRgb = hexToRgb(baseColorHex, [140, 150, 165]);
  const starRgb = hexToRgb(starColorHex, [255, 244, 230]);
  const tintedBase = blendRgb(baseRgb, starRgb, 0.12);

  const isGasGiant = !isMoon && (planet.gasFrac >= 0.015 || planet.massEarth >= 15);
  const isMolten = tempK > 1100 || classLower.includes('lava') || classLower.includes('molten');
  const isIcy = (isMoon ? (moon?.iceFrac ?? 0) > 0.25 : (planet.iceFrac ?? 0) > 0.25) || tempK < 180;

  // Ring geometry parameters
  const ringTilt = 0.38;
  const ringAngle = -0.28 + (hash2(rawSeed, 1, rawSeed) - 0.5) * 0.35;
  const rInner = R * 1.32;
  const rOuter = R * 1.92;
  const ringHex = planet.rings?.toLowerCase().includes('ice') ? '#bae6fd' : '#d6d3d1';

  const drawRingHalf = (isFront: boolean) => {
    if (!hasRings) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ringAngle);
    ctx.scale(1, ringTilt);

    const startAng = isFront ? 0 : Math.PI;
    const endAng = isFront ? Math.PI : Math.PI * 2;

    // Outer ring band
    ctx.beginPath();
    ctx.arc(0, 0, (rInner + rOuter) * 0.54, startAng, endAng);
    ctx.strokeStyle = ringHex;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = (rOuter - rInner) * 0.45;
    ctx.stroke();

    // Inner denser ring band (separated by Cassini gap)
    ctx.beginPath();
    ctx.arc(0, 0, (rInner + rOuter) * 0.44, startAng, endAng);
    ctx.strokeStyle = '#f8fafc';
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = (rOuter - rInner) * 0.32;
    ctx.stroke();

    ctx.restore();
  };

  // 1. Back half of rings
  drawRingHalf(false);

  // 2. Atmospheric outer glow halo
  if (isGasGiant || pBar > 0.02 || isMolten) {
    const glowHex = isMolten
      ? 'rgba(249, 115, 22, 0.38)'
      : isGasGiant
      ? `rgba(${tintedBase[0]}, ${tintedBase[1]}, ${tintedBase[2]}, 0.32)`
      : coverage > 20
      ? 'rgba(56, 189, 248, 0.36)'
      : 'rgba(148, 163, 184, 0.25)';
    const glowGrad = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.24);
    glowGrad.addColorStop(0, glowHex);
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.24, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Clip to planet sphere
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();

  // Base sunlit gradient across sphere
  const lightX = cx - R * 0.35;
  const lightY = cy - R * 0.32;
  const sphereGrad = ctx.createRadialGradient(lightX, lightY, R * 0.1, cx, cy, R * 1.15);
  const hiRgb = scaleRgb(tintedBase, 1.28);
  const shadowRgb = scaleRgb(tintedBase, 0.35);
  sphereGrad.addColorStop(0, `rgb(${hiRgb[0]}, ${hiRgb[1]}, ${hiRgb[2]})`);
  sphereGrad.addColorStop(0.65, `rgb(${tintedBase[0]}, ${tintedBase[1]}, ${tintedBase[2]})`);
  sphereGrad.addColorStop(1, `rgb(${shadowRgb[0]}, ${shadowRgb[1]}, ${shadowRgb[2]})`);
  ctx.fillStyle = sphereGrad;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // 4. Surface / Cloud Band Details
  if (isGasGiant) {
    const bandCount = 6;
    for (let i = 0; i < bandCount; i++) {
      const by = cy - R + ((i + 0.5) / bandCount) * (R * 2);
      const bh = (R * 2) / (bandCount * 1.5);
      const isDark = i % 2 === 0;
      const bandCol = isDark ? scaleRgb(tintedBase, 0.78) : scaleRgb(tintedBase, 1.18);
      ctx.fillStyle = `rgba(${bandCol[0]}, ${bandCol[1]}, ${bandCol[2]}, 0.38)`;
      ctx.fillRect(cx - R, by - bh * 0.5, R * 2, bh);
    }
  } else if (isMolten) {
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.75)';
    ctx.lineWidth = Math.max(1, R * 0.08);
    for (let i = 0; i < 3; i++) {
      const yOff = (hash2(i, 4, rawSeed) - 0.5) * R * 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.7, cy + yOff);
      ctx.quadraticCurveTo(cx, cy - yOff * 0.6, cx + R * 0.7, cy + yOff * 0.4);
      ctx.stroke();
    }
  } else if (coverage > 15 && coverage < 95) {
    // Continental land blobs over ocean or ocean basins
    const landRgb: RgbTuple = hasBiosphere ? [46, 138, 72] : isIcy ? [210, 230, 248] : [168, 132, 96];
    ctx.fillStyle = `rgba(${landRgb[0]}, ${landRgb[1]}, ${landRgb[2]}, 0.65)`;
    for (let i = 0; i < 4; i++) {
      const lx = cx + (hash2(i, 11, rawSeed) - 0.5) * R * 1.1;
      const ly = cy + (hash2(i, 19, rawSeed) - 0.5) * R * 1.0;
      const lr = R * (0.28 + hash2(i, 29, rawSeed) * 0.25);
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Polar ice caps on temperate/cold terrestrial worlds
  if (!isGasGiant && !isMolten && tempK < 315 && (coverage > 10 || isIcy)) {
    ctx.fillStyle = 'rgba(240, 249, 255, 0.72)';
    const capH = clamp(R * (tempK < 230 ? 0.35 : 0.2), 2, R * 0.4);
    ctx.fillRect(cx - R, cy - R, R * 2, capH);
    ctx.fillRect(cx - R, cy + R - capH, R * 2, capH);
  }

  // 5. Day/Night Terminator Shadow Crescent
  const termGrad = ctx.createRadialGradient(
    cx - R * 0.42,
    cy - R * 0.32,
    R * 0.35,
    cx + R * 0.25,
    cy + R * 0.2,
    R * 1.15
  );
  termGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  termGrad.addColorStop(0.62, 'rgba(2, 6, 23, 0.25)');
  termGrad.addColorStop(1, 'rgba(2, 6, 23, 0.86)');
  ctx.fillStyle = termGrad;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  ctx.restore();

  // 6. Front half of rings
  drawRingHalf(true);
}

function getMoonBaseHex(classLower: string, tempK: number): string {
  if (classLower.includes('volcanic') || classLower.includes('molten') || tempK > 900) return '#ea580c';
  if (classLower.includes('methane') || classLower.includes('titan')) return '#d97706';
  if (classLower.includes('aquatic') || classLower.includes('ocean')) return '#0284c7';
  if (classLower.includes('ice') || classLower.includes('cryo') || classLower.includes('encelad')) return '#bae6fd';
  if (classLower.includes('captured') || classLower.includes('carbon')) return '#64748b';
  return '#94a3b8';
}
