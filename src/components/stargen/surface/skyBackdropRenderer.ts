/**
 * skyBackdropRenderer.ts
 * Canvas 2D Atmospheric Sky Backdrop, Spectral Host Star, Corona & Horizon Scattering Dome
 */

import { PlanetarySurfaceModel } from './surfaceGenMath';
import { getStarSpectralPalette } from '../../../core/generation/starAssets';
import { hexToRgb } from './terrainNoise';

export interface SkyBackdropRenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  timeOfDayDeg: number;
  surfaceModel: PlanetarySurfaceModel;
  hasAtmosphere: boolean;
  pBarAtmo: number;
  rotYaw: number;
  activeTileBiomeColor?: string;
}

export function renderSkyBackdrop({
  ctx,
  width: W,
  height: H,
  timeOfDayDeg,
  surfaceModel,
  hasAtmosphere,
  pBarAtmo,
  rotYaw,
  activeTileBiomeColor,
}: SkyBackdropRenderParams): {
  radTOD: number;
  sunAlt: number;
  isNight: boolean;
  isSunset: boolean;
} {
  const radTOD = (timeOfDayDeg * Math.PI) / 180;
  const sunAlt = Math.sin(radTOD);
  const isNight = sunAlt < -0.05;
  const isSunset = Math.abs(sunAlt) < 0.25;

  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  if (surfaceModel.isNoSurface) {
    // Gas Giant / Ice Giant / Supercritical World: Continuous Deep Colored Atmosphere with NO solid ground
    const pal = surfaceModel.atmospherePalette;
    const tileRgb = hexToRgb(activeTileBiomeColor || surfaceModel.skyHorizonHex);
    const topRgb = hexToRgb(surfaceModel.skyColorHex);
    const horizRgb = hexToRgb(surfaceModel.skyHorizonHex);
    const sunMult = isNight ? 0.32 : isSunset ? 0.82 : 1.0;
    const sunsetWarmR = isSunset ? 34 : 0;
    const sunsetWarmB = isSunset ? -24 : 0;

    const fmtRgb = (r: number, g: number, b: number) =>
      `rgb(${Math.max(0, Math.min(255, Math.round(r * sunMult + sunsetWarmR)))}, ${Math.max(
        0,
        Math.min(255, Math.round(g * sunMult))
      )}, ${Math.max(0, Math.min(255, Math.round(b * sunMult + sunsetWarmB)))})`;

    // Upper stratosphere -> mid-troposphere colored gas envelope -> deep high-pressure atmospheric abyss
    skyGrad.addColorStop(0, fmtRgb(topRgb[0] * 0.78, topRgb[1] * 0.78, topRgb[2] * 0.85));
    skyGrad.addColorStop(
      0.28,
      fmtRgb(
        horizRgb[0] * 0.55 + pal.atmoRgb[0] * 0.45,
        horizRgb[1] * 0.55 + pal.atmoRgb[1] * 0.45,
        horizRgb[2] * 0.55 + pal.atmoRgb[2] * 0.45
      )
    );
    skyGrad.addColorStop(
      0.56,
      fmtRgb(
        pal.atmoRgb[0] * 0.42 + tileRgb[0] * 0.38 + pal.bandLightRgb[0] * 0.20,
        pal.atmoRgb[1] * 0.42 + tileRgb[1] * 0.38 + pal.bandLightRgb[1] * 0.20,
        pal.atmoRgb[2] * 0.42 + tileRgb[2] * 0.38 + pal.bandLightRgb[2] * 0.20
      )
    );
    skyGrad.addColorStop(
      0.82,
      fmtRgb(
        pal.bandDarkRgb[0] * 0.55 + pal.atmoRgb[0] * 0.30 + tileRgb[0] * 0.15,
        pal.bandDarkRgb[1] * 0.55 + pal.atmoRgb[1] * 0.30 + tileRgb[1] * 0.15,
        pal.bandDarkRgb[2] * 0.55 + pal.atmoRgb[2] * 0.30 + tileRgb[2] * 0.15
      )
    );
    skyGrad.addColorStop(
      1,
      fmtRgb(
        pal.bandDarkRgb[0] * 0.42 + pal.atmoRgb[0] * 0.22,
        pal.bandDarkRgb[1] * 0.42 + pal.atmoRgb[1] * 0.22,
        pal.bandDarkRgb[2] * 0.42 + pal.atmoRgb[2] * 0.22
      )
    );
  } else if (!hasAtmosphere) {
    skyGrad.addColorStop(0, '#03050a');
    skyGrad.addColorStop(0.65, '#070b14');
    skyGrad.addColorStop(1, '#090e1a');
  } else if (isNight) {
    skyGrad.addColorStop(0, '#040711');
    skyGrad.addColorStop(0.6, '#0b1326');
    skyGrad.addColorStop(1, '#080d18');
  } else if (isSunset) {
    skyGrad.addColorStop(0, '#161936');
    skyGrad.addColorStop(0.45, '#4b283a');
    skyGrad.addColorStop(0.78, '#b45b32');
    skyGrad.addColorStop(1, '#141824');
  } else {
    skyGrad.addColorStop(0, surfaceModel.skyColorHex);
    skyGrad.addColorStop(0.58, surfaceModel.skyHorizonHex);
    skyGrad.addColorStop(1, '#0c1322');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  // Stars in vacuum or night sky (with Harvard spectral color distribution)
  if (!hasAtmosphere || isNight || pBarAtmo < 0.08) {
    const bgStarColors = ['#93c5fd', '#e0f2fe', '#fef9c3', '#fde047', '#fdba74', '#fca5a5'];
    const starCount = isNight || !hasAtmosphere ? 140 : 55;
    for (let i = 0; i < starCount; i++) {
      const sx = ((i * 137.5 + rotYaw * 120) % W + W) % W;
      const sy = (i * 89.3) % (H * 0.62);
      const sSize = i % 3 === 0 ? 1.5 : 0.95;
      ctx.fillStyle = bgStarColors[i % bgStarColors.length];
      ctx.globalAlpha = 0.3 + ((i * 19) % 65) / 100;
      ctx.fillRect(sx, sy, sSize, sSize);
    }
    ctx.globalAlpha = 1.0;
  }

  // Host Star & Atmospheric Scattering Halo in the upper sky (colored limb-darkened photosphere with sunspots)
  if (!isNight) {
    const sunX = W * 0.5 + Math.cos(radTOD) * (W * 0.34);
    const sunY = H * 0.22 - sunAlt * (H * 0.14);
    const starRad = Math.max(6, surfaceModel.starAngularDiameterDeg * 14);
    const starPal = getStarSpectralPalette({
      Teff: surfaceModel.starTeff,
      colorHex: surfaceModel.starColorHex,
    });

    const glare = ctx.createRadialGradient(sunX, sunY, starRad * 0.45, sunX, sunY, starRad * 5.5);
    glare.addColorStop(0, starPal.coreHex);
    glare.addColorStop(0.22, starPal.baseHex);
    glare.addColorStop(0.55, `${starPal.limbHex}55`);
    glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glare;
    ctx.beginPath();
    ctx.arc(sunX, sunY, starRad * 5.5, 0, Math.PI * 2);
    ctx.fill();

    const discGrad = ctx.createRadialGradient(
      sunX - starRad * 0.2,
      sunY - starRad * 0.2,
      starRad * 0.08,
      sunX,
      sunY,
      starRad
    );
    discGrad.addColorStop(0, starPal.coreHex);
    discGrad.addColorStop(0.62, starPal.baseHex);
    discGrad.addColorStop(1, starPal.limbHex);

    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, starRad, 0, Math.PI * 2);
    ctx.fillStyle = discGrad;
    ctx.fill();
    ctx.clip();

    if (starPal.isBrownDwarf) {
      // Brown Dwarf: render gas-giant latitudinal cloud bands instead of sunspots
      ctx.save();
      ctx.translate(sunX, sunY);
      ctx.rotate(-0.14);
      const bandOffsets = [
        { y: -0.68, h: 0.20, col: starPal.penumbraHex, alpha: 0.78 },
        { y: -0.34, h: 0.22, col: starPal.umbraHex, alpha: 0.72 },
        { y: -0.05, h: 0.16, col: starPal.faculaeHex, alpha: 0.42 },
        { y: 0.18, h: 0.24, col: starPal.penumbraHex, alpha: 0.80 },
        { y: 0.54, h: 0.20, col: starPal.umbraHex, alpha: 0.74 },
      ];
      for (let bIdx = 0; bIdx < bandOffsets.length; bIdx++) {
        const bd = bandOffsets[bIdx];
        ctx.fillStyle = bd.col;
        ctx.globalAlpha = bd.alpha;
        ctx.fillRect(-starRad * 1.2, bd.y * starRad, starRad * 2.4, bd.h * starRad);
      }
      ctx.restore();
      ctx.globalAlpha = 1.0;
    } else if (!starPal.isCompactRemnant && starPal.spotCoverage > 0.1) {
      const spotRot = radTOD * 0.18;
      const spotDefs = [
        { dx: -0.28, dy: -0.18, r: 0.15, tilt: 0.25 },
        { dx: -0.11, dy: -0.22, r: 0.095, tilt: 0.2 },
        { dx: 0.32, dy: 0.22, r: 0.13, tilt: -0.3 },
        { dx: 0.45, dy: 0.18, r: 0.08, tilt: -0.25 },
      ];
      for (let s = 0; s < spotDefs.length; s++) {
        const sd = spotDefs[s];
        const sx = sunX + (sd.dx * Math.cos(spotRot) - sd.dy * 0.25 * Math.sin(spotRot)) * starRad;
        const sy = sunY + sd.dy * starRad;
        const sr = Math.max(1.0, sd.r * starRad * Math.min(1.25, 0.75 + starPal.spotCoverage * 0.3));

        ctx.fillStyle = starPal.faculaeHex;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.ellipse(sx, sy, sr * 1.45, sr * 1.1, sd.tilt, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = starPal.penumbraHex;
        ctx.globalAlpha = 0.82;
        ctx.beginPath();
        ctx.ellipse(sx, sy, sr, sr * 0.76, sd.tilt, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = starPal.umbraHex;
        ctx.globalAlpha = 0.94;
        ctx.beginPath();
        ctx.ellipse(sx, sy, sr * 0.52, sr * 0.4, sd.tilt, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    }
    ctx.restore();
  }

  return { radTOD, sunAlt, isNight, isSunset };
}
