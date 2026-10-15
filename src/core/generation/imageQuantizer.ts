import {
  GalaxyConfig,
  GalaxySectorHex,
  GalaxyGridData,
  DEFAULT_GALAXY_CONFIG,
  rgbToHex,
  getSectorOpacityByDensity,
  generateGalaxyGiantStars,
} from './galaxyGen';
import { PRNG, seedFromId } from './prng';

export interface ImageQuantizeOptions {
  name?: string;
  seed?: number;
  densityScale?: number; // 0.5 to 2.5 (default 1.1)
  blackPoint?: number; // 0.0 to 0.35 (noise / space void cutoff, default 0.08)
  contrast?: number; // 0.5 to 2.0 (gamma/contrast, default 1.1)
  radiusKpc?: number; // 15 to 50 kpc (default 35)
  invertBrightness?: boolean;
}

export const DEFAULT_QUANTIZE_OPTIONS: ImageQuantizeOptions = {
  name: 'Quantized Astro-Galaxy',
  seed: 7777,
  densityScale: 1.15,
  blackPoint: 0.08,
  contrast: 1.1,
  radiusKpc: 35,
  invertBrightness: false,
};

/**
 * Samples average RGB color and luminance from an image inside a normalized circular/hex patch
 */
function samplePatchFromContext(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  imgWidth: number,
  imgHeight: number
): { r: number; g: number; b: number; lum: number } {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(imgWidth - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(imgHeight - 1, Math.ceil(cy + radius));

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;

  if (w <= 0 || h <= 0) {
    return { r: 0, g: 0, b: 0, lum: 0 };
  }

  const imgData = ctx.getImageData(minX, minY, w, h);
  const data = imgData.data;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  const rSq = radius * radius;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const realX = minX + px;
      const realY = minY + py;
      const dSq = (realX - cx) ** 2 + (realY - cy) ** 2;

      if (dSq <= rSq) {
        const idx = (py * w + px) * 4;
        sumR += data[idx];
        sumG += data[idx + 1];
        sumB += data[idx + 2];
        count++;
      }
    }
  }

  if (count === 0) {
    return { r: 0, g: 0, b: 0, lum: 0 };
  }

  const avgR = sumR / count;
  const avgG = sumG / count;
  const avgB = sumB / count;

  // Perceived relative luminance (ITU-R BT.709)
  const lum = (0.2126 * avgR + 0.7152 * avgG + 0.0722 * avgB) / 255;

  return { r: avgR, g: avgG, b: avgB, lum };
}

/**
 * Quantizes an HTMLImageElement into a complete 50x50 GalaxyGridData.
 * Maps pixel brightness to stellar density and color temperature to stellar age & spectral class.
 */
export function quantizeImageToGalaxy(
  img: HTMLImageElement,
  options: ImageQuantizeOptions = DEFAULT_QUANTIZE_OPTIONS
): GalaxyGridData {
  const opt = { ...DEFAULT_QUANTIZE_OPTIONS, ...options };
  const columns = 50;
  const rows = 50;

  // Create an in-memory canvas to read pixel data
  const canvas = document.createElement('canvas');
  const targetSize = 600;
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('Unable to create 2D canvas context for image quantization.');
  }

  // Draw image scaled to fit canvas with centered square cropping / aspect preserve
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, targetSize, targetSize);

  const imgAspect = img.naturalWidth / img.naturalHeight;
  let sWidth = img.naturalWidth;
  let sHeight = img.naturalHeight;
  let sx = 0;
  let sy = 0;

  if (imgAspect > 1) {
    sWidth = img.naturalHeight;
    sx = (img.naturalWidth - sWidth) / 2;
  } else {
    sHeight = img.naturalWidth;
    sy = (img.naturalHeight - sHeight) / 2;
  }

  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetSize, targetSize);

  const galaxySeed = opt.seed ?? 7777;
  const rng = new PRNG(galaxySeed);

  const sectors: GalaxySectorHex[] = [];
  const centerX = (columns + 1) / 2; // 25.5
  const centerY = (rows + 1) / 2; // 25.5
  const maxRadiusCells = Math.min(centerX - 1, centerY - 1); // 24.5

  let totalDensity = 0;
  let totalAge = 0;
  let totalFeh = 0;
  let activeCount = 0;
  let totalEstimatedStars = 0;

  // Padding and cell dimensions on sampling canvas
  const paddingPx = 25;
  const usableWidth = targetSize - paddingPx * 2;
  const usableHeight = targetSize - paddingPx * 2;
  const colSpacingPx = usableWidth / (columns + 0.5);
  const rowSpacingPx = usableHeight / rows;
  const sampleRadius = Math.max(3, colSpacingPx * 0.45);

  const blackPoint = opt.blackPoint ?? 0.08;
  const contrast = opt.contrast ?? 1.1;
  const densityScale = opt.densityScale ?? 1.15;
  const radiusKpc = opt.radiusKpc ?? 35;

  for (let c = 1; c <= columns; c++) {
    for (let r = 1; r <= rows; r++) {
      const coord = `${c.toString().padStart(2, '0')}${r.toString().padStart(2, '0')}`;
      const dx = c - centerX;
      const dy = r - centerY;
      const distCells = Math.sqrt(dx * dx + dy * dy);
      const rNorm = distCells / maxRadiusCells;
      const rKpc = +(rNorm * radiusKpc).toFixed(1);
      const theta = Math.atan2(dy, dx);

      // Pixel center on the canvas (including pointy-topped row offset)
      const xOffset = r % 2 === 1 ? colSpacingPx * 0.5 : 0;
      const sampleX = paddingPx + (c - 1) * colSpacingPx + xOffset + colSpacingPx * 0.5;
      const sampleY = paddingPx + (r - 1) * rowSpacingPx + rowSpacingPx * 0.5;

      const sampled = samplePatchFromContext(
        ctx,
        sampleX,
        sampleY,
        sampleRadius,
        targetSize,
        targetSize
      );

      let lum = sampled.lum;
      if (opt.invertBrightness) {
        lum = 1.0 - lum;
      }

      // Local PRNG for sector
      const sectorSeedNum = Math.floor(rng.next() * 99999) + 1000;
      const seedString = `GAL-${galaxySeed}-SEC-${coord}`;
      const secRng = new PRNG(seedFromId(seedString));

      // 1. Density mapped from luminance with blackpoint threshold and contrast curve
      let adjLum = Math.max(0, (lum - blackPoint) / Math.max(0.01, 1.0 - blackPoint));
      adjLum = Math.pow(adjLum, contrast);

      let density = 0.01;
      if (adjLum > 0.01) {
        // Luminance 0.01 to 1.0 maps to density 0.05 to 3.0+
        const rawDensity = (0.05 + adjLum * 2.65) * densityScale + secRng.nextGaussian(0, 0.02);
        density = +Math.max(0.01, Math.min(3.5, rawDensity)).toFixed(2);
      }

      // 2. Color Temperature & Astrophysical Age mapping
      const rn = sampled.r / 255;
      const bn = sampled.b / 255;

      // Color balance analysis:
      // Blue channel dominant -> Young hot starburst (low mean age, narrow age range)
      // Red/Yellow dominant -> Ancient Population II / Bulge stars (high age or wide age range)
      // Bright white core -> Galactic Bulge (wide uniform distribution across all epochs)
      const isWhiteCore = adjLum > 0.70 && Math.abs(rn - bn) < 0.18 && rNorm < 0.28;
      const isBlueStarburst = bn > rn + 0.08 && adjLum > 0.15;
      const isRedPopulation = rn > bn + 0.10;

      let meanAge: number;
      let ageRange: number;
      let ageDistribution: 'normal' | 'uniform' = 'normal';
      let region: string;

      if (isWhiteCore) {
        // Core Bulge: High density, wide uniform age range
        meanAge = 6.8 + secRng.nextGaussian(0, 0.3);
        ageRange = 11.2;
        ageDistribution = 'uniform';
        region = density > 1.4 ? 'Galactic Core Nexus' : 'Galactic Bulge';
      } else if (isBlueStarburst) {
        // Blue starburst knots / spiral arm ridges
        meanAge = +Math.max(0.4, Math.min(2.5, 0.6 + (rn / Math.max(0.1, bn)) * 1.8 + secRng.nextGaussian(0, 0.2))).toFixed(2);
        ageRange = 1.8;
        ageDistribution = 'normal';
        region = density > 0.7 ? 'Starburst Knot' : 'Spiral Arm Ridge';
      } else if (isRedPopulation) {
        // Mature red/yellow stellar disk or halo
        meanAge = +Math.max(4.5, Math.min(12.5, 5.5 + ((rn - bn) / Math.max(0.1, rn)) * 6.5 + secRng.nextGaussian(0, 0.4))).toFixed(2);
        ageRange = rNorm > 0.85 ? 1.5 : 3.8;
        ageDistribution = 'normal';
        region = rNorm > 0.85 ? 'Galactic Halo' : 'Intermediate Disk';
      } else if (density <= 0.04) {
        // Intergalactic void
        meanAge = 11.5 + secRng.nextGaussian(0, 0.3);
        ageRange = 1.5;
        ageDistribution = 'normal';
        region = 'Intergalactic Void';
      } else {
        // Solar-type intermediate disk
        meanAge = +Math.max(3.0, Math.min(8.0, 4.5 + rNorm * 2.5 + secRng.nextGaussian(0, 0.3))).toFixed(2);
        ageRange = 4.2;
        ageDistribution = 'normal';
        region = 'Galactic Disk';
      }

      const ageMin = +Math.max(0.1, meanAge - ageRange / 2).toFixed(1);
      const ageMax = +Math.min(13.5, meanAge + ageRange / 2).toFixed(1);

      // 3. Metallicity Gradient
      const baseFeh = +Math.max(-1.6, Math.min(0.45, 0.30 - 0.85 * rNorm + (adjLum > 0.4 ? 0.15 : -0.1) + secRng.nextGaussian(0, 0.06))).toFixed(2);

      // 4. Color Hex derived from the actual sampled RGB colors of the photo
      // Boost saturation slightly if dim, preserving photo authenticity
      let colorHex: string;
      if (density <= 0.03) {
        colorHex = '#1e293b'; // Faint cosmic slate for void
      } else {
        const satBoost = Math.max(1.0, 1.25 - adjLum * 0.2);
        const cr = Math.min(255, Math.round(sampled.r * satBoost));
        const cg = Math.min(255, Math.round(sampled.g * satBoost));
        const cb = Math.min(255, Math.round(sampled.b * satBoost));
        colorHex = rgbToHex(cr, cg, cb);
      }

      // 5. Opacity based on density
      const opacity = getSectorOpacityByDensity(density);

      // 6. Estimated Stars in 50x50
      const estimatedStars50x50 = density <= 1.0
        ? Math.round(2500 * density)
        : Math.round(2500 * (1.0 + (density - 1.0) * 1.4));

      const sectorName = `Sector ${coord} (${region.split(' ')[0]})`;

      if (density >= 0.05) {
        activeCount++;
        totalDensity += density;
        totalAge += meanAge;
        totalFeh += baseFeh;
        totalEstimatedStars += estimatedStars50x50;
      }

      const giantStars = generateGalaxyGiantStars(density, meanAge, sectorSeedNum, 26);

      sectors.push({
        col: c,
        row: r,
        coord,
        name: sectorName,
        seed: sectorSeedNum,
        seedString,
        rNorm: +rNorm.toFixed(3),
        rKpc,
        thetaRad: +theta.toFixed(3),
        density,
        meanAge,
        ageRange,
        ageDistribution,
        ageMin,
        ageMax,
        metallicityMean: baseFeh,
        colorHex,
        opacity,
        region,
        estimatedStars50x50,
        giantStars,
      });
    }
  }

  const avgDensity = activeCount > 0 ? +(totalDensity / activeCount).toFixed(2) : 0;
  const avgAge = activeCount > 0 ? +(totalAge / activeCount).toFixed(2) : 0;
  const avgMetallicity = activeCount > 0 ? +(totalFeh / activeCount).toFixed(2) : 0;

  const galaxyConfig: GalaxyConfig = {
    ...DEFAULT_GALAXY_CONFIG,
    name: opt.name ?? 'Quantized Astro-Galaxy',
    seed: galaxySeed,
    radiusKpc,
    overallDensityScale: densityScale,
  };

  return {
    config: galaxyConfig,
    sectors,
    stats: {
      totalSectors: columns * rows,
      activeSectors: activeCount,
      avgDensity,
      avgAge,
      avgMetallicity,
      totalEstimatedStars,
    },
  };
}
