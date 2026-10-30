import { clamp, lerp } from './mathUtils';

/**
 * Shared Color Conversion & Blending Utilities
 * Centralizes hex/RGB parsing and blending used across star shaders,
 * planetary portraits, and biome terrain rasterizers.
 */

export type RgbTuple = [number, number, number];

export function hexToRgb(hex: string, fallback: RgbTuple = [128, 128, 128]): RgbTuple {
  const clean = (hex || '').replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return fallback;
    return [r, g, b];
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return fallback;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const cr = clamp(Math.round(r), 0, 255);
  const cg = clamp(Math.round(g), 0, 255);
  const cb = clamp(Math.round(b), 0, 255);
  return `#${((1 << 24) + (cr << 16) + (cg << 8) + cb).toString(16).slice(1)}`;
}

export function blendRgb(a: RgbTuple, b: RgbTuple, t: number): RgbTuple {
  const f = clamp(t, 0, 1);
  return [
    Math.round(lerp(a[0], b[0], f)),
    Math.round(lerp(a[1], b[1], f)),
    Math.round(lerp(a[2], b[2], f)),
  ];
}

export function scaleRgb(rgb: RgbTuple, factor: number): RgbTuple {
  return [
    clamp(Math.round(rgb[0] * factor), 0, 255),
    clamp(Math.round(rgb[1] * factor), 0, 255),
    clamp(Math.round(rgb[2] * factor), 0, 255),
  ];
}

export function hexToRgbObj(hex: string): { r: number; g: number; b: number } {
  const [r, g, b] = hexToRgb(hex);
  return { r, g, b };
}

export function desaturateToWhite(hex: string, factor: number): string {
  const clamped = clamp(factor, 0, 1);
  if (clamped <= 0) return hex;
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * clamped,
    g + (255 - g) * clamped,
    b + (255 - b) * clamped
  );
}

