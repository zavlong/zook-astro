import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Eye, Globe } from 'lucide-react';
import {
  RealisticPlanetBody,
  RealisticPlanetaryZone,
} from '../../core/generation/realisticStarGen';
import { RealisticMoon, RealisticStarNode } from '../../types/astrophysics';

interface ProceduralPlanetPortraitProps {
  planet: RealisticPlanetBody;
  moon?: RealisticMoon | null;
  zone: RealisticPlanetaryZone;
  stars: RealisticStarNode[];
  bodyIndex: number;
  moonIndex?: number;
}

// Fast deterministic hash & 3D gradient/value noise for procedural planetary rendering
function hash3(x: number, y: number, z: number, seed: number): number {
  let h =
    Math.imul(x, 374761393) +
    Math.imul(y, 668265263) +
    Math.imul(z, 2147483647) +
    Math.imul(seed, 1274126177);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

function noise3D(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);
  const fz = smoothstep(z - iz);

  const n000 = hash3(ix, iy, iz, seed);
  const n100 = hash3(ix + 1, iy, iz, seed);
  const n010 = hash3(ix, iy + 1, iz, seed);
  const n110 = hash3(ix + 1, iy + 1, iz, seed);
  const n001 = hash3(ix, iy, iz + 1, seed);
  const n101 = hash3(ix + 1, iy, iz + 1, seed);
  const n011 = hash3(ix, iy + 1, iz + 1, seed);
  const n111 = hash3(ix + 1, iy + 1, iz + 1, seed);

  const nx00 = lerp(n000, n100, fx);
  const nx10 = lerp(n010, n110, fx);
  const nx01 = lerp(n001, n101, fx);
  const nx11 = lerp(n011, n111, fx);

  const nxy0 = lerp(nx00, nx10, fy);
  const nxy1 = lerp(nx01, nx11, fy);

  return lerp(nxy0, nxy1, fz);
}

function fbm3D(x: number, y: number, z: number, seed: number, octaves = 5): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise3D(x * freq, y * freq, z * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return val / norm;
}

// Ridged multifractal for mountain chains, tectonic rifts, and Europa linea
function ridgedFbm3D(x: number, y: number, z: number, seed: number, octaves = 4): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = noise3D(x * freq, y * freq, z * freq, seed + i * 137);
    const r = 1.0 - Math.abs(2.0 * n - 1.0);
    val += amp * r * r;
    norm += amp;
    amp *= 0.5;
    freq *= 2.12;
  }
  return val / norm;
}

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  if (isNaN(num)) return [255, 244, 230];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const c = clamp(t, 0, 1);
  return [
    Math.round(a[0] + (b[0] - a[0]) * c),
    Math.round(a[1] + (b[1] - a[1]) * c),
    Math.round(a[2] + (b[2] - a[2]) * c),
  ];
}

const iconDataUrlCache = new Map<string, string>();

function renderPlanetGlobeToCanvas(
  gCanvas: HTMLCanvasElement,
  planet: RealisticPlanetBody,
  moon: RealisticMoon | null | undefined,
  starColorHex: string,
  starTeff: number,
  moonIndex = 0,
  transparentBg = false
): void {
  const ctx = gCanvas.getContext('2d');
  if (!ctx) return;

  const isMoon = Boolean(moon);
  const pClass = isMoon && moon ? moon.moonClass : planet.planetClass;
  const hydro = isMoon && moon ? moon.hydrosphere : planet.hydrosphere;
  const gases = isMoon && moon ? moon.gases : planet.gases;
  const pBar = isMoon && moon ? moon.pressureBar : planet.pressureBar;
  const Tsurf = isMoon && moon ? moon.surfaceTempK : planet.surfaceTempK;
  const iceF = isMoon && moon ? moon.iceFrac : planet.iceFrac;
  const gasF = isMoon && moon ? moon.gasFrac : planet.gasFrac;
  const tilt = isMoon && moon ? moon.axialTiltDeg : planet.axialTiltDeg;
  const spinState = isMoon && moon ? moon.spinState : planet.spinState;
  const rings = isMoon ? null : planet.rings;
  const sudarsky = isMoon ? null : planet.sudarskyClass;

  // Planets with 1:1 tidal locking to their host star have a permanent dayside & permanent nightside!
  const isTidallyLockedPlanet = !isMoon && spinState.includes('1:1 Tidally Locked');

  const isGasOrFluidEnvelope =
    pBar === null ||
    gasF >= 0.015 ||
    pClass.includes('Gas Giant') ||
    pClass.includes('Hot Jupiter') ||
    pClass.includes('Ice Giant') ||
    pClass.includes('Neptune') ||
    pClass.includes('Gas Dwarf') ||
    pClass.includes('Supercritical');

  const worldSeed = Math.round(
    planet.a * 10000 +
      planet.massEarth * 137 +
      planet.T_eq * 19 +
      (isMoon && moon ? (moonIndex + 1) * 7919 + moon.a_Rp * 313 : 0)
  );

  const starRgb = hexToRgb(starColorHex || '#fff4e6');
  const solvent = hydro?.solvent || null;
  const hasBio = Boolean(hydro?.biosphere);
  const covPct =
    hydro?.coveragePct !== undefined
      ? hydro.coveragePct
      : hydro && hydro.liqKm > 0 && !hydro.crustKm
      ? 100
      : 0;

  const W = gCanvas.width;
  const H = gCanvas.height;
  const img = ctx.createImageData(W, H);
  const data = img.data;

  const cx = W * 0.5;
  const cy = H * 0.5;
  const R = Math.min(W, H) * (rings ? 0.33 : transparentBg ? 0.44 : 0.41);

  // Starlight direction vector: on tidally-locked worlds, position substellar point slightly left of center
  // so both the substellar bullseye ("eyeball" / dayside magma) AND the terminator + nightside glacier/crust are clearly visible!
  const lx = isTidallyLockedPlanet ? -0.52 : -0.62;
  const ly = isTidallyLockedPlanet ? -0.18 : -0.34;
  const lz = isTidallyLockedPlanet ? 0.835 : 0.71;

  // Ring geometry (tilted plane)
  const ringTiltRad = ((22 + (worldSeed % 18)) * Math.PI) / 180;
  const sinT = Math.sin(ringTiltRad);
  const cosT = Math.cos(ringTiltRad);
  const rInner = R * 1.24;
  const rOuter = R * (rings?.includes('Major') ? 2.12 : 1.76);

  // Determine ocean / land / flora / cloud palettes
  let deepOceanRgb: RGB = [9, 52, 118];
  let shallowOceanRgb: RGB = [22, 138, 198];
  let specColor: RGB = [215, 240, 255];

  if (solvent === 'NH3-H2O') {
    deepOceanRgb = [46, 36, 128];
    shallowOceanRgb = [118, 92, 224];
    specColor = [228, 210, 255];
  } else if (solvent === 'CH4-C2H6') {
    deepOceanRgb = [68, 42, 14];
    shallowOceanRgb = [152, 98, 28];
    specColor = [255, 220, 155];
  } else if (solvent === 'CO2') {
    deepOceanRgb = [12, 82, 78];
    shallowOceanRgb = [38, 178, 158];
    specColor = [200, 255, 245];
  } else if (solvent === 'SO2') {
    deepOceanRgb = [148, 102, 8];
    shallowOceanRgb = [238, 194, 28];
    specColor = [255, 248, 185];
  } else if (solvent === 'H2SO4') {
    deepOceanRgb = [74, 108, 16];
    shallowOceanRgb = [158, 212, 42];
    specColor = [235, 255, 180];
  } else if (solvent === 'Silicate Magma') {
    deepOceanRgb = [195, 42, 8];
    shallowOceanRgb = [255, 178, 28];
    specColor = [255, 245, 195];
  }

  // Land palette
  const lowlandRgb: RGB =
    iceF >= 0.25
      ? [165, 208, 228]
      : solvent === 'CH4-C2H6'
      ? [178, 126, 62]
      : solvent === 'H2SO4' || solvent === 'SO2'
      ? [148, 132, 78]
      : solvent === 'Silicate Magma' || Tsurf >= 800
      ? [44, 32, 30]
      : Tsurf > 380
      ? [112, 68, 48]
      : [148, 112, 78];
  const highlandRgb: RGB =
    iceF >= 0.25
      ? [215, 240, 252]
      : solvent === 'CH4-C2H6'
      ? [122, 84, 42]
      : solvent === 'Silicate Magma' || Tsurf >= 800
      ? [72, 48, 42]
      : [108, 88, 72];
  const peakRgb: RGB = Tsurf < 340 ? [238, 246, 255] : [168, 142, 124];

  // Photosynthetic / Ammonia-Biosphere Flora Pigments tuned to Host Star Teff!
  let floraLowRgb: RGB = [34, 138, 68];
  let floraHighRgb: RGB = [96, 168, 62];
  if (hasBio) {
    if (solvent === 'NH3-H2O') {
      floraLowRgb = [132, 48, 168];
      floraHighRgb = [56, 178, 192];
    } else if (starTeff < 3900) {
      floraLowRgb = [68, 28, 78];
      floraHighRgb = [32, 96, 78];
    } else if (starTeff < 5100) {
      floraLowRgb = [58, 128, 52];
      floraHighRgb = [184, 128, 38];
    } else if (starTeff > 6500) {
      floraLowRgb = [22, 136, 128];
      floraHighRgb = [68, 186, 164];
    }
  }

  // Atmosphere limb color
  let atmoRgb: RGB = [95, 175, 255];
  if (pClass.includes('Supercritical')) atmoRgb = [135, 215, 245];
  else if (solvent === 'H2SO4' || pClass.includes('Venusian')) atmoRgb = [225, 205, 95];
  else if (solvent === 'SO2') atmoRgb = [245, 210, 75];
  else if (solvent === 'NH3-H2O') atmoRgb = [155, 135, 250];
  else if (solvent === 'CH4-C2H6' || pClass.includes('Titan')) atmoRgb = [235, 165, 65];
  else if (solvent === 'CO2') atmoRgb = [95, 215, 195];
  else if (solvent === 'Silicate Magma' || pClass.includes('Molten')) atmoRgb = [255, 105, 35];
  else if (gases.CO2 && gases.CO2 > 0.6) atmoRgb = [215, 165, 115];

  const cloudCov = isGasOrFluidEnvelope
    ? 1.0
    : pBar === 0
    ? 0.0
    : clamp(0.18 + 0.22 * Math.log10(1 + (pBar || 0)), 0.0, 0.78);

  const seaLevel =
    covPct <= 0
      ? -1.0
      : covPct >= 100
      ? 2.0
      : 0.24 + 0.52 * Math.pow(covPct / 100, 0.88);

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const idx = (py * W + px) * 4;
      const dx = px - cx;
      const dy = py - cy;
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);

      // Background space & subtle starfield
      let bgR = 5;
      let bgG = 8;
      let bgB = 16;
      if (!transparentBg) {
        const starHash = hash3(px, py, 1, worldSeed);
        if (starHash > 0.9978) {
          const br = Math.round(140 + 115 * ((starHash - 0.9978) / 0.0022));
          bgR = br;
          bgG = br;
          bgB = Math.min(255, br + 20);
        }
      }

      // Check ring intersection in tilted plane
      let ringAlpha = 0;
      let ringR = 0;
      let ringG = 0;
      let ringB = 0;
      let ringZ = 0;
      if (rings) {
        const ry = dy / Math.max(0.18, sinT);
        const rRad = Math.sqrt(dx * dx + ry * ry);
        ringZ = ry * cosT;
        if (rRad >= rInner && rRad <= rOuter) {
          const u = (rRad - rInner) / (rOuter - rInner);
          const bandNoise = fbm3D(u * 24, 0, 0, worldSeed + 555, 3);
          const cassiniGap = Math.abs(u - 0.62) < 0.035 ? 0.12 : 1.0;
          ringAlpha = clamp(
            (rings.includes('Major') ? 0.78 : 0.42) *
              bandNoise *
              cassiniGap *
              Math.sin(u * Math.PI),
            0,
            0.85
          );
          const baseRing: RGB = rings.includes('Icy')
            ? [205, 232, 248]
            : [178, 152, 122];
          const shadowDot = dx * lx + dy * ly;
          const inPlanetShadow =
            ringZ < 0 && shadowDot > 0 && Math.abs(dx * ly - dy * lx) < R * 0.88;
          const shade = inPlanetShadow ? 0.16 : 0.92;
          ringR = baseRing[0] * shade;
          ringG = baseRing[1] * shade;
          ringB = baseRing[2] * shade;
        }
      }

      // Outside planet globe: render atmospheric halo + ring
      if (dist > R) {
        const haloDist = (dist - R) / (R * 0.16);
        let haloAlpha = 0;
        if (haloDist < 1.0 && (pBar === null || pBar > 0.005)) {
          const sunSide = clamp(((dx / dist) * lx + (dy / dist) * ly + 0.35) * 0.85, 0.15, 1);
          haloAlpha = Math.pow(1 - haloDist, 2.4) * sunSide * 0.68;
        }
        if (transparentBg) {
          const totA = clamp(haloAlpha + ringAlpha * (1 - haloAlpha), 0, 1);
          if (totA <= 0.01) {
            data[idx + 3] = 0;
            continue;
          }
          const outR = (atmoRgb[0] * haloAlpha + ringR * ringAlpha) / Math.max(0.01, haloAlpha + ringAlpha);
          const outG = (atmoRgb[1] * haloAlpha + ringG * ringAlpha) / Math.max(0.01, haloAlpha + ringAlpha);
          const outB = (atmoRgb[2] * haloAlpha + ringB * ringAlpha) / Math.max(0.01, haloAlpha + ringAlpha);
          data[idx] = Math.round(outR);
          data[idx + 1] = Math.round(outG);
          data[idx + 2] = Math.round(outB);
          data[idx + 3] = Math.round(totA * 255);
          continue;
        } else {
          if (haloAlpha > 0) {
            bgR = Math.round(lerp(bgR, atmoRgb[0], haloAlpha));
            bgG = Math.round(lerp(bgG, atmoRgb[1], haloAlpha));
            bgB = Math.round(lerp(bgB, atmoRgb[2], haloAlpha));
          }
          if (ringAlpha > 0) {
            bgR = Math.round(lerp(bgR, ringR, ringAlpha));
            bgG = Math.round(lerp(bgG, ringG, ringAlpha));
            bgB = Math.round(lerp(bgB, ringB, ringAlpha));
          }
          data[idx] = bgR;
          data[idx + 1] = bgG;
          data[idx + 2] = bgB;
          data[idx + 3] = 255;
          continue;
        }
      }

      // Point on unit sphere (nx, ny, nz)
      const nx = dx / R;
      const ny = dy / R;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));

      // Rotate coordinates by axial tilt
      const tiltRad = (clamp(tilt, 0, 90) * Math.PI) / 180;
      const cTilt = Math.cos(tiltRad * 0.45);
      const sTilt = Math.sin(tiltRad * 0.45);
      const sx = nx * cTilt - ny * sTilt;
      const sy = nx * sTilt + ny * cTilt;
      const sz = nz;

      // Angular cosine to substellar point: ndotl = +1 at substellar center, 0 at terminator, < 0 on nightside
      const ndotl = nx * lx + ny * ly + nz * lz;
      const atmoScatter = pBar === null || pBar > 0.05 ? 0.14 : 0.03;
      const diff = clamp((ndotl + atmoScatter) / (1 + atmoScatter), 0.04, 1.0);

      let surfRgb: RGB = [128, 128, 128];
      let isLiquidPixel = false;
      let isDaysideHotMagma = false;

      if (isGasOrFluidEnvelope) {
        // Zonal jet bands + equatorial super-rotating chevron waves for tidally-locked Hot Jupiters!
        const warp = fbm3D(sx * 2.6, sy * 2.6, sz * 2.6, worldSeed + 17, 4) * 0.22;
        const chevron = isTidallyLockedPlanet ? Math.pow(Math.abs(sy), 1.35) * 0.55 * sx : 0;
        const lat = sy + warp + chevron;
        const bands = Math.sin(lat * (isTidallyLockedPlanet ? 13.0 : 18.0)) * 0.5 + 0.5;
        const fineBands = fbm3D(sx * 1.8, lat * 9.5, sz * 1.8, worldSeed + 73, 4);

        let bandA: RGB = [215, 165, 95];
        let bandB: RGB = [245, 228, 195];
        if (pClass.includes('Supercritical')) {
          bandA = [28, 118, 168];
          bandB = [145, 225, 248];
        } else if (sudarsky === 'I') {
          bandA = [208, 142, 74];
          bandB = [244, 218, 178];
        } else if (sudarsky === 'II') {
          bandA = [78, 138, 212];
          bandB = [235, 245, 255];
        } else if (sudarsky === 'III') {
          bandA = [22, 68, 168];
          bandB = [58, 122, 228];
        } else if (sudarsky === 'IV') {
          bandA = [44, 38, 92];
          bandB = [118, 72, 148];
        } else if (sudarsky === 'V') {
          bandA = [112, 32, 24];
          bandB = [242, 98, 32];
        } else if (pClass.includes('Ice Giant')) {
          bandA = [38, 148, 196];
          bandB = [132, 226, 248];
        } else {
          bandA = [96, 112, 196];
          bandB = [182, 196, 244];
        }
        surfRgb = mixRgb(bandA, bandB, clamp(bands * 0.65 + fineBands * 0.35, 0, 1));

        // Substellar / Eastward-Advected Thermal Hotspot on Tidally-Locked Hot Jupiters!
        if (isTidallyLockedPlanet) {
          const eastSubDot = (nx - 0.16) * lx + ny * ly + nz * lz;
          if (eastSubDot > 0.45) {
            const hotSpot = Math.pow((eastSubDot - 0.45) / 0.55, 1.6);
            const hotCol: RGB =
              sudarsky === 'V' || sudarsky === 'IV'
                ? [255, 165, 52]
                : [165, 228, 255];
            surfRgb = mixRgb(surfRgb, hotCol, hotSpot * 0.68);
          }
        }
      } else if (isTidallyLockedPlanet) {
        // =====================================================================
        // 1:1 TIDALLY-LOCKED SOLID/LIQUID PLANET:
        // Substellar-concentric "Eyeball" Ocean / Nightside Glacier OR Dayside Magma Ocean!
        // =====================================================================
        const elev = fbm3D(sx * 2.5, sy * 2.5, sz * 2.5, worldSeed, 5);
        const ridge = ridgedFbm3D(sx * 3.8, sy * 3.8, sz * 3.8, worldSeed + 31, 4);
        const subMetric = ndotl + (elev - 0.5) * 0.34;

        if (solvent === 'Silicate Magma' || Tsurf >= 800) {
          // Tidally-Locked Molten / Lava World:
          // Blazing incandescent dayside magma ocean centered on substellar point + solidified basaltic nightside with lava rifts!
          const magmaEdge = covPct >= 95 ? -0.15 : 0.55 - (covPct / 100) * 0.58;
          if (subMetric > magmaEdge) {
            isLiquidPixel = true;
            isDaysideHotMagma = true;
            const coreHeat = clamp((subMetric - magmaEdge) / Math.max(0.2, 1.0 - magmaEdge), 0, 1);
            surfRgb = mixRgb([215, 48, 10], [255, 232, 105], Math.pow(coreHeat, 0.85));
          } else {
            // Solid dark nightside/terminator basaltic crust
            surfRgb = mixRgb([34, 24, 24], [68, 46, 40], clamp(elev, 0, 1));
          }
        } else if (covPct > 0) {
          // Tidally-Locked "Eyeball" Ocean World (H2O, NH3-H2O, CO2, SO2, H2SO4, CH4):
          // Dayside liquid eyeball pupil centered on substellar point + permanent nightside ice shell + terminator twilight ring!
          const iceEdge = 0.16; // Below this ndotl, volatiles freeze into the permanent nightside glacier
          if (subMetric < iceEdge && Tsurf < 420) {
            // Permanent Nightside Glacial Ice Sheet with deep blue/violet crevasses
            const glacierCrevasse = clamp((ridge - 0.58) * 2.5, 0, 1);
            const iceBase: RGB =
              solvent === 'NH3-H2O'
                ? [222, 215, 255]
                : solvent === 'CO2'
                ? [210, 248, 242]
                : [232, 246, 255];
            const crevCol: RGB =
              solvent === 'NH3-H2O' ? [88, 72, 168] : [68, 132, 185];
            surfRgb = mixRgb(iceBase, crevCol, glacierCrevasse * 0.55);
            isLiquidPixel = false;
          } else {
            // Inside the warm dayside Eyeball pupil!
            // Continents can still emerge inside the eyeball according to covPct, or form a ring near the terminator
            const eyeballSeaLevel =
              covPct >= 96 ? 1.5 : 0.28 + 0.54 * Math.pow(covPct / 100, 0.8);
            if (elev < eyeballSeaLevel) {
              isLiquidPixel = true;
              const centerWarmth = clamp((ndotl - 0.15) / 0.85, 0, 1);
              surfRgb = mixRgb(deepOceanRgb, shallowOceanRgb, Math.pow(centerWarmth, 0.75));
            } else {
              const landFrac = clamp((elev - eyeballSeaLevel) / 0.45, 0, 1);
              surfRgb = mixRgb(lowlandRgb, highlandRgb, landFrac);

              // Terminator Twilight Ring Biosphere Flora!
              if (hasBio) {
                // Flora thrives strongest in the temperate terminator ring (0.14 <= ndotl <= 0.65)
                const ringFactor = Math.exp(-Math.pow((ndotl - 0.38) / 0.26, 2));
                const floraCol = mixRgb(floraLowRgb, floraHighRgb, landFrac);
                surfRgb = mixRgb(surfRgb, floraCol, clamp(ringFactor * 0.92, 0.15, 0.92));
              }
            }
          }
        } else {
          // Tidally-Locked Dry World: scorched substellar desert + cold-trapped nightside frost cap
          if (subMetric < -0.04 && Tsurf < 380) {
            surfRgb = mixRgb([195, 218, 238], [235, 245, 255], clamp(-subMetric * 1.5, 0, 1));
          } else {
            const scorch = clamp(ndotl, 0, 1);
            surfRgb = mixRgb(lowlandRgb, [188, 98, 52], scorch * 0.65);
          }
        }
      } else {
        // =====================================================================
        // FREE-ROTATING PLANET OR MOON: Latitudinal climate zones & exact coveragePct
        // =====================================================================
        const elev = fbm3D(sx * 2.5, sy * 2.5, sz * 2.5, worldSeed, 5);
        const ridge = ridgedFbm3D(sx * 3.8, sy * 3.8, sz * 3.8, worldSeed + 31, 4);

        if (elev < seaLevel) {
          isLiquidPixel = true;
          if (solvent === 'Silicate Magma') isDaysideHotMagma = true;
          const depthFrac = clamp((seaLevel - elev) / Math.max(0.08, seaLevel), 0, 1);
          surfRgb = mixRgb(shallowOceanRgb, deepOceanRgb, Math.pow(depthFrac, 0.7));
        } else {
          const landFrac = clamp(
            (elev - seaLevel) / Math.max(0.12, 0.85 - seaLevel),
            0,
            1
          );
          surfRgb = mixRgb(lowlandRgb, highlandRgb, landFrac);

          if (hasBio && landFrac < 0.68) {
            const absLat = Math.abs(sy);
            const moisture = fbm3D(sx * 3.2, sy * 3.2, sz * 3.2, worldSeed + 99, 3);
            const bioMask = clamp((1 - absLat * 1.18) * (moisture * 1.25), 0, 1);
            const floraCol = mixRgb(floraLowRgb, floraHighRgb, landFrac * 1.4);
            surfRgb = mixRgb(surfRgb, floraCol, bioMask * 0.82);
          }

          if (ridge > 0.68 && landFrac > 0.3) {
            surfRgb = mixRgb(surfRgb, peakRgb, clamp((ridge - 0.68) * 2.5, 0, 0.85));
          }

          if ((pBar || 0) < 0.08) {
            const cr = ridgedFbm3D(sx * 6.5, sy * 6.5, sz * 6.5, worldSeed + 211, 3);
            if (cr > 0.78) {
              surfRgb = mixRgb(surfRgb, [210, 215, 225], 0.35);
            }
          }
        }

        // Polar ice caps (on free-rotating worlds)
        const iceLatThreshold =
          Tsurf < 210
            ? 0.35
            : Tsurf < 265
            ? 0.55
            : Tsurf < 305
            ? 0.78
            : 1.5;
        const noisyLat =
          Math.abs(sy) + (fbm3D(sx * 4, sy * 4, sz * 4, worldSeed + 88, 3) - 0.5) * 0.14;
        if (noisyLat > iceLatThreshold && solvent !== 'Silicate Magma' && Tsurf < 800) {
          const iceBlend = clamp((noisyLat - iceLatThreshold) * 6.0, 0, 0.92);
          const capColor: RGB =
            solvent === 'NH3-H2O' ? [225, 220, 255] : [238, 248, 255];
          surfRgb = mixRgb(surfRgb, capColor, iceBlend);
          if (iceBlend > 0.6) isLiquidPixel = false;
        }

        // Tectonic linea cracks on frozen/subsurface-ocean moons & worlds (Europa/Enceladus style)
        if (covPct === 0 && iceF >= 0.2 && ridge > 0.76) {
          surfRgb = mixRgb(surfRgb, [115, 185, 220], clamp((ridge - 0.76) * 3.5, 0, 0.75));
        }
      }

      // Atmospheric clouds:
      // On 1:1 tidally-locked worlds, form a concentric convective hurricane bullseye around the substellar point!
      if (!isGasOrFluidEnvelope && cloudCov > 0.02 && solvent !== 'Silicate Magma') {
        const cloudTint: RGB =
          solvent === 'H2SO4'
            ? [238, 242, 182]
            : solvent === 'SO2'
            ? [248, 236, 175]
            : solvent === 'CH4-C2H6'
            ? [242, 192, 118]
            : solvent === 'NH3-H2O'
            ? [232, 225, 255]
            : [248, 252, 255];

        if (isTidallyLockedPlanet) {
          // Concentric substellar convective bullseye + radial spiral outflow arms
          const subDist = Math.acos(clamp(ndotl, -1, 1));
          const angleAroundSub = Math.atan2(ny - ly * ndotl, nx - lx * ndotl);
          const spiralWave =
            Math.sin(subDist * 14.0 - angleAroundSub * 2.0) * 0.5 + 0.5;
          const nCloud = fbm3D(sx * 3.5, sy * 3.5, sz * 3.5, worldSeed + 409, 3);
          const subCap = clamp((ndotl - 0.35) * 1.35, 0, 1);
          const cAlpha = clamp(
            subCap * (0.45 * spiralWave + 0.55 * nCloud) * cloudCov * 1.35,
            0,
            0.86
          );
          if (cAlpha > 0.12) {
            surfRgb = mixRgb(surfRgb, cloudTint, cAlpha);
            if (cAlpha > 0.45) isLiquidPixel = false;
          }
        } else {
          const cWarp = fbm3D(sx * 2.2, sy * 2.2, sz * 2.2, worldSeed + 303, 3) * 0.35;
          const cVal = fbm3D(
            (sx + cWarp) * 3.1,
            sy * 4.2,
            (sz - cWarp) * 3.1,
            worldSeed + 409,
            4
          );
          const cThreshold = 0.68 - cloudCov * 0.34;
          if (cVal > cThreshold) {
            const cAlpha = clamp(((cVal - cThreshold) / 0.24) * 0.88, 0, 0.88);
            surfRgb = mixRgb(surfRgb, cloudTint, cAlpha);
            if (cAlpha > 0.45) isLiquidPixel = false;
          }
        }
      }

      // Apply host star spectral tint + diffuse lighting
      let litR = surfRgb[0] * diff * (0.78 + 0.22 * (starRgb[0] / 255));
      let litG = surfRgb[1] * diff * (0.78 + 0.22 * (starRgb[1] / 255));
      let litB = surfRgb[2] * diff * (0.78 + 0.22 * (starRgb[2] / 255));

      // Specular ocean glint on liquid pixels!
      if (isLiquidPixel && ndotl > 0) {
        const hx = lx;
        const hy = ly;
        const hz = lz + 1.0;
        const hLen = Math.sqrt(hx * hx + hy * hy + hz * hz);
        const ndoth = Math.max(0, (nx * hx + ny * hy + nz * hz) / hLen);
        const spec = Math.pow(ndoth, 24) * 0.74;
        litR += specColor[0] * spec;
        litG += specColor[1] * spec;
        litB += specColor[2] * spec;
      }

      // Self-luminous thermal incandescence on Molten / Lava / Io / Class V worlds
      if (
        solvent === 'Silicate Magma' ||
        Tsurf >= 800 ||
        sudarsky === 'V' ||
        pClass.includes('Molten') ||
        pClass.includes('Io')
      ) {
        const magmaCrack = ridgedFbm3D(sx * 4.5, sy * 4.5, sz * 4.5, worldSeed + 613, 3);
        if (isDaysideHotMagma) {
          const selfGlow = clamp(0.58 + 0.42 * Math.max(0, ndotl), 0.55, 1.0);
          litR = Math.max(litR, surfRgb[0] * selfGlow);
          litG = Math.max(litG, surfRgb[1] * selfGlow);
          litB = Math.max(litB, surfRgb[2] * selfGlow);
        } else if (magmaCrack > 0.71) {
          const glow = (magmaCrack - 0.71) * 3.1;
          litR = Math.max(litR, 255 * glow);
          litG = Math.max(litG, 112 * glow);
          litB = Math.max(litB, 20 * glow);
        }
      }

      // Atmospheric Fresnel limb scattering
      const fresnel = Math.pow(1 - nz, 2.8);
      if (pBar === null || pBar > 0.008) {
        const limbStrength =
          clamp((ndotl + 0.45) * 0.75, 0.12, 0.85) *
          fresnel *
          (pBar === null ? 0.78 : clamp(0.28 + 0.18 * Math.log10(1 + pBar), 0.2, 0.78));
        litR = lerp(litR, atmoRgb[0], limbStrength);
        litG = lerp(litG, atmoRgb[1], limbStrength);
        litB = lerp(litB, atmoRgb[2], limbStrength);
      }

      // Front ring passing in front of the planet (ringZ > 0)
      if (ringAlpha > 0 && ringZ > 0) {
        litR = lerp(litR, ringR, ringAlpha);
        litG = lerp(litG, ringG, ringAlpha);
        litB = lerp(litB, ringB, ringAlpha);
      }

      data[idx] = clamp(Math.round(litR), 0, 255);
      data[idx + 1] = clamp(Math.round(litG), 0, 255);
      data[idx + 2] = clamp(Math.round(litB), 0, 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
}

/**
 * Generates and caches a low-res procedural 3D planet/moon icon data URL (with transparent background)
 * for use on the 2D Proportional Orbital Map, Linear System Overview, and Inspector tabs.
 */
export function getProceduralPlanetIconDataUrl(
  planet: RealisticPlanetBody,
  moon: RealisticMoon | null | undefined,
  starColorHex = '#fff4e6',
  starTeff = 5778,
  moonIndex = 0,
  size = 56
): string {
  const isMoon = Boolean(moon);
  const key = [
    isMoon ? `m_${moon?.id}_${moon?.moonClass}_${moon?.surfaceTempK}` : `p_${planet.a}_${planet.massEarth}_${planet.planetClass}_${planet.surfaceTempK}`,
    isMoon ? moon?.hydrosphere?.coveragePct : planet.hydrosphere?.coveragePct,
    isMoon ? moon?.spinState : planet.spinState,
    planet.rings || 'norings',
    starColorHex,
    size,
  ].join('|');

  const cached = iconDataUrlCache.get(key);
  if (cached) return cached;

  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  renderPlanetGlobeToCanvas(
    canvas,
    planet,
    moon,
    starColorHex,
    starTeff,
    moonIndex,
    true
  );
  const url = canvas.toDataURL('image/png');
  if (iconDataUrlCache.size > 400) {
    iconDataUrlCache.clear();
  }
  iconDataUrlCache.set(key, url);
  return url;
}

export const ProceduralPlanetPortrait: React.FC<ProceduralPlanetPortraitProps> = ({
  planet,
  moon,
  zone,
  stars,
  bodyIndex,
  moonIndex = 0,
}) => {
  const globeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const vistaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [expandedMode, setExpandedMode] = useState<'split' | 'globe' | 'vista'>('split');

  const isMoon = Boolean(moon);
  const pClass = isMoon && moon ? moon.moonClass : planet.planetClass;
  const hydro = isMoon && moon ? moon.hydrosphere : planet.hydrosphere;
  const gases = isMoon && moon ? moon.gases : planet.gases;
  const pBar = isMoon && moon ? moon.pressureBar : planet.pressureBar;
  const Tsurf = isMoon && moon ? moon.surfaceTempK : planet.surfaceTempK;
  const Teq = isMoon && moon ? moon.T_eq : planet.T_eq;
  const iceF = isMoon && moon ? moon.iceFrac : planet.iceFrac;
  const gasF = isMoon && moon ? moon.gasFrac : planet.gasFrac;
  const tilt = isMoon && moon ? moon.axialTiltDeg : planet.axialTiltDeg;
  const spinState = isMoon && moon ? moon.spinState : planet.spinState;
  const rings = isMoon ? null : planet.rings;
  const sudarsky = isMoon ? null : planet.sudarskyClass;
  const isTidallyLockedPlanet = !isMoon && spinState.includes('1:1 Tidally Locked');

  const isGasOrFluidEnvelope =
    pBar === null ||
    gasF >= 0.015 ||
    pClass.includes('Gas Giant') ||
    pClass.includes('Hot Jupiter') ||
    pClass.includes('Ice Giant') ||
    pClass.includes('Neptune') ||
    pClass.includes('Gas Dwarf') ||
    pClass.includes('Supercritical');

  // Deterministic seed from planet/moon properties
  const worldSeed = Math.round(
    planet.a * 10000 +
      planet.massEarth * 137 +
      planet.T_eq * 19 +
      (isMoon && moon ? (moonIndex + 1) * 7919 + moon.a_Rp * 313 : 0)
  );

  const primaryStar =
    stars.find((s) => zone.title.startsWith(`Star ${s.label} `)) || stars[0];
  const starRgb = hexToRgb(primaryStar?.colorHex || '#fff4e6');

  // Solvent & Land Color Palettes
  const solvent = hydro?.solvent || null;
  const hasBio = Boolean(hydro?.biosphere);
  const covPct =
    hydro?.coveragePct !== undefined
      ? hydro.coveragePct
      : hydro && hydro.liqKm > 0 && !hydro.crustKm
      ? 100
      : 0;

  useEffect(() => {
    // =========================================================================
    // 1. RENDER ORBITAL GLOBE PORTRAIT
    // =========================================================================
    const gCanvas = globeCanvasRef.current;
    if (gCanvas) {
      renderPlanetGlobeToCanvas(
        gCanvas,
        planet,
        moon,
        primaryStar?.colorHex || '#fff4e6',
        primaryStar?.Teff || 5778,
        moonIndex,
        false
      );
    }

    // =========================================================================
    // 2. RENDER SURFACE HORIZON VISTA (OR CLOUD-TOP VISTA FOR FLUID GIANTS)
    // =========================================================================
    const vCanvas = vistaCanvasRef.current;
    if (vCanvas) {
      const ctx = vCanvas.getContext('2d');
      if (ctx) {
        const W = vCanvas.width;
        const H = vCanvas.height;
        const horizonY = Math.round(H * 0.56);

        // 1. Sky Gradient based on atmosphere pressure & gas chemistry
        const hasSky = pBar === null || pBar > 0.004;
        let zenithCol = '#050811';
        let midSkyCol = '#0d192b';
        let horizonCol = '#1e3a5f';

        if (!hasSky) {
          zenithCol = '#02040a';
          midSkyCol = '#050914';
          horizonCol = '#0f172a';
        } else if (solvent === 'H2SO4' || pClass.includes('Venusian')) {
          zenithCol = '#3f3812';
          midSkyCol = '#786b1e';
          horizonCol = '#caba48';
        } else if (solvent === 'SO2') {
          zenithCol = '#3b280a';
          midSkyCol = '#855814';
          horizonCol = '#eab308';
        } else if (solvent === 'NH3-H2O') {
          zenithCol = '#161238';
          midSkyCol = '#3b2e7e';
          horizonCol = '#8b7ae8';
        } else if (solvent === 'CH4-C2H6' || pClass.includes('Titan')) {
          zenithCol = '#2b1808';
          midSkyCol = '#6e3f14';
          horizonCol = '#d98836';
        } else if (solvent === 'CO2') {
          zenithCol = '#0c292b';
          midSkyCol = '#1d585c';
          horizonCol = '#4db6ac';
        } else if (solvent === 'Silicate Magma' || pClass.includes('Molten') || Tsurf >= 800) {
          zenithCol = '#2a0804';
          midSkyCol = '#6e180b';
          horizonCol = '#f97316';
        } else if (isTidallyLockedPlanet) {
          // Eternal terminator sunset/twilight sky on tidally-locked worlds!
          zenithCol = '#09152b';
          midSkyCol = '#4c1d4b';
          horizonCol = '#f59e0b';
        } else if (hasBio) {
          zenithCol = '#09254a';
          midSkyCol = '#1b649c';
          horizonCol = '#7dd3fc';
        } else if (pBar !== null && pBar < 0.15) {
          zenithCol = '#1c1210';
          midSkyCol = '#4a2c24';
          horizonCol = '#9c634f';
        }

        const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
        skyGrad.addColorStop(0, zenithCol);
        skyGrad.addColorStop(0.55, midSkyCol);
        skyGrad.addColorStop(1, horizonCol);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, W, horizonY);

        // Stars in upper sky (stronger on the anti-stellar nightside half of tidally-locked worlds!)
        const starVis = !hasSky ? 1.0 : clamp(1.0 - Math.log10(1 + (pBar || 10)) * 0.45, 0.18, 0.92);
        for (let si = 0; si < 95; si++) {
          const sx = hash3(si, 11, 1, worldSeed) * W;
          const sy = hash3(si, 23, 2, worldSeed) * (horizonY * 0.78);
          const nightBoost = isTidallyLockedPlanet ? clamp((sx / W) * 1.35, 0.3, 1.25) : 1.0;
          const sa = starVis * nightBoost * (1 - sy / horizonY) * 0.85;
          if (sa > 0.08) {
            ctx.fillStyle = `rgba(240, 248, 255, ${clamp(sa, 0, 1).toFixed(2)})`;
            ctx.fillRect(sx, sy, 1.4, 1.4);
          }
        }

        // Render Host Star(s) in the sky: on tidally-locked worlds, pinned low on the terminator horizon!
        const apparentSunRad = clamp(
          14 * Math.sqrt(Math.max(0.08, primaryStar?.radius || 1) / Math.max(0.08, planet.a)),
          6,
          44
        );
        const sunX = isTidallyLockedPlanet ? W * 0.22 : W * 0.26;
        const sunY = isTidallyLockedPlanet
          ? horizonY - apparentSunRad * 0.45
          : H * 0.22;
        const sunHalo = ctx.createRadialGradient(
          sunX,
          sunY,
          apparentSunRad * 0.2,
          sunX,
          sunY,
          apparentSunRad * 3.8
        );
        sunHalo.addColorStop(0, '#ffffff');
        sunHalo.addColorStop(0.28, primaryStar?.colorHex || '#fff4e6');
        sunHalo.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sunHalo;
        ctx.beginPath();
        ctx.arc(sunX, sunY, apparentSunRad * 3.8, 0, Math.PI * 2);
        ctx.fill();

        // Companion binary/trinary stars in the sky!
        stars
          .filter((s) => s !== primaryStar)
          .forEach((compStar, cIdx) => {
            const cxSky = sunX + 58 + cIdx * 42;
            const cySky = Math.min(horizonY - 14, sunY - 12 + (cIdx % 2) * 22);
            const cRad = clamp(apparentSunRad * 0.55, 4, 18);
            const cHalo = ctx.createRadialGradient(cxSky, cySky, 1, cxSky, cySky, cRad * 3);
            cHalo.addColorStop(0, '#ffffff');
            cHalo.addColorStop(0.35, compStar.colorHex);
            cHalo.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = cHalo;
            ctx.beginPath();
            ctx.arc(cxSky, cySky, cRad * 3, 0, Math.PI * 2);
            ctx.fill();
          });

        // If viewing a Moon: draw the giant Host Planet looming in the sky!
        if (isMoon && moon) {
          const hostX = W * 0.74;
          const hostY = H * 0.24;
          const hostAppRad = clamp((380 / Math.max(4, moon.a_Rp)) * 1.4, 22, 68);
          ctx.save();
          if (planet.rings) {
            ctx.strokeStyle = 'rgba(226, 232, 240, 0.42)';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.ellipse(hostX, hostY, hostAppRad * 1.85, hostAppRad * 0.35, -0.28, 0, Math.PI * 2);
            ctx.stroke();
          }
          const hGrad = ctx.createRadialGradient(
            hostX - hostAppRad * 0.35,
            hostY - hostAppRad * 0.3,
            hostAppRad * 0.1,
            hostX,
            hostY,
            hostAppRad
          );
          hGrad.addColorStop(0, planet.gasFrac > 0.05 ? '#c4b5fd' : '#38bdf8');
          hGrad.addColorStop(0.7, '#1e293b');
          hGrad.addColorStop(1, '#020617');
          ctx.fillStyle = hGrad;
          ctx.beginPath();
          ctx.arc(hostX, hostY, hostAppRad, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (planet.rings) {
          ctx.save();
          ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)';
          ctx.lineWidth = 14;
          ctx.beginPath();
          ctx.arc(W * 0.85, horizonY + 110, 220, Math.PI * 1.05, Math.PI * 1.68);
          ctx.stroke();
          ctx.restore();
        }

        // If Gas Giant / Ice Giant / Supercritical Fluid World (No solid/liquid surface!):
        if (isGasOrFluidEnvelope) {
          for (let layer = 0; layer < 4; layer++) {
            const baseY = horizonY - 12 + layer * 28;
            ctx.beginPath();
            ctx.moveTo(0, H);
            for (let x = 0; x <= W; x += 6) {
              const n = fbm3D(x * 0.012, layer * 3.1, 0, worldSeed + 701 + layer * 31, 4);
              const y = baseY + (n - 0.5) * 44;
              ctx.lineTo(x, y);
            }
            ctx.lineTo(W, H);
            ctx.lineTo(0, H);
            ctx.closePath();

            const cShade = 1 - layer * 0.18;
            if (pClass.includes('Supercritical')) {
              ctx.fillStyle = `rgba(${Math.round(38 * cShade)}, ${Math.round(
                148 * cShade
              )}, ${Math.round(192 * cShade)}, 0.92)`;
            } else if (sudarsky === 'I') {
              ctx.fillStyle = `rgba(${Math.round(218 * cShade)}, ${Math.round(
                162 * cShade
              )}, ${Math.round(98 * cShade)}, 0.92)`;
            } else if (sudarsky === 'V') {
              ctx.fillStyle = `rgba(${Math.round(212 * cShade)}, ${Math.round(
                74 * cShade
              )}, ${Math.round(32 * cShade)}, 0.92)`;
            } else {
              ctx.fillStyle = `rgba(${Math.round(98 * cShade)}, ${Math.round(
                156 * cShade
              )}, ${Math.round(224 * cShade)}, 0.92)`;
            }
            ctx.fill();
          }
          return;
        }

        // Solid / Liquid Surface Horizon Vista:
        // Distant mountain range silhouette along the horizon (with towering nightside glacier on tidally-locked eyeball worlds!)
        ctx.beginPath();
        ctx.moveTo(0, horizonY + 10);
        for (let x = 0; x <= W; x += 4) {
          const mHeight =
            covPct >= 100 && !isTidallyLockedPlanet
              ? 0
              : ridgedFbm3D(x * 0.014, 1.5, 0, worldSeed + 809, 4) *
                (isTidallyLockedPlanet && x > W * 0.55 ? 64 : 48);
          ctx.lineTo(x, horizonY - mHeight);
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fillStyle =
          isTidallyLockedPlanet && Tsurf < 420
            ? '#93c5fd'
            : iceF >= 0.25
            ? '#6488a4'
            : solvent === 'H2SO4' || solvent === 'SO2'
            ? '#574c29'
            : solvent === 'CH4-C2H6'
            ? '#5c3d1e'
            : '#3b2f2f';
        ctx.fill();

        // Foreground Ground / Liquid Sea Basin
        const seaColors: Record<string, [string, string]> = {
          H2O: ['#0ea5e9', '#0369a1'],
          'H2O + CO2': ['#0ea5e9', '#0f766e'],
          'NH3-H2O': ['#818cf8', '#3730a3'],
          'CH4-C2H6': ['#d97706', '#451a03'],
          CO2: ['#2dd4bf', '#115e59'],
          SO2: ['#facc15', '#854d0e'],
          H2SO4: ['#a3e635', '#3f6212'],
          'Silicate Magma': ['#fb923c', '#9a3412'],
        };

        if (covPct > 0 && solvent && seaColors[solvent]) {
          const [topSea, botSea] = seaColors[solvent];
          const seaGrad = ctx.createLinearGradient(0, horizonY, 0, H);
          seaGrad.addColorStop(0, topSea);
          seaGrad.addColorStop(1, botSea);
          ctx.fillStyle = seaGrad;
          ctx.fillRect(0, horizonY, W, H - horizonY);

          // Specular starlight wave reflections on the liquid sea
          ctx.fillStyle =
            solvent === 'Silicate Magma'
              ? 'rgba(254, 240, 138, 0.55)'
              : 'rgba(255, 255, 255, 0.28)';
          for (let wy = horizonY + 3; wy < H; wy += 4) {
            const prog = (wy - horizonY) / (H - horizonY);
            const spread = 12 + prog * 68;
            const wx = sunX + (hash3(wy, 7, 3, worldSeed) - 0.5) * spread;
            const ww = 8 + prog * 34;
            ctx.fillRect(wx - ww / 2, wy, ww, 1.5);
          }

          // If mixed solid + liquid surface (covPct < 100) OR tidally-locked terminator shore, draw coastal cliffs/glacier!
          if (covPct < 98 || isTidallyLockedPlanet) {
            const landShare = clamp((100 - covPct) / 100, 0.22, 0.82);
            ctx.beginPath();
            if (isTidallyLockedPlanet) {
              // Nightside glacier / basalt shelf encroaching from the right (anti-stellar side)
              ctx.moveTo(W, horizonY - 8);
              for (let y = horizonY - 8; y <= H; y += 5) {
                const prog = (y - horizonY) / (H - horizonY);
                const coastN = fbm3D(y * 0.03, 2.2, 0, worldSeed + 919, 3);
                const shoreX = W * (1.0 - (0.28 + prog * 0.22 + (coastN - 0.5) * 0.14));
                ctx.lineTo(shoreX, y);
              }
              ctx.lineTo(W, H);
            } else {
              ctx.moveTo(0, horizonY - 8);
              for (let y = horizonY - 8; y <= H; y += 5) {
                const prog = (y - horizonY) / (H - horizonY);
                const coastN = fbm3D(y * 0.03, 2.2, 0, worldSeed + 919, 3);
                const shoreX = W * (landShare * 0.65 + prog * 0.22 + (coastN - 0.5) * 0.18);
                ctx.lineTo(shoreX, y);
              }
              ctx.lineTo(0, H);
            }
            ctx.closePath();

            ctx.fillStyle =
              solvent === 'Silicate Magma' || Tsurf >= 800
                ? '#1c1917'
                : hasBio && solvent === 'NH3-H2O'
                ? '#581c87'
                : hasBio
                ? (primaryStar?.Teff || 5778) < 3900
                  ? '#3b1d4a'
                  : '#166534'
                : isTidallyLockedPlanet && Tsurf < 420
                ? '#dbeafe'
                : iceF >= 0.25
                ? '#94a3b8'
                : '#443730';
            ctx.fill();
          }
        } else {
          // Dry or Ice-Shell Surface Foreground
          const groundGrad = ctx.createLinearGradient(0, horizonY, 0, H);
          if (iceF >= 0.25) {
            groundGrad.addColorStop(0, '#93c5fd');
            groundGrad.addColorStop(1, '#1e3a5f');
          } else {
            groundGrad.addColorStop(0, '#78553a');
            groundGrad.addColorStop(1, '#291d14');
          }
          ctx.fillStyle = groundGrad;
          ctx.fillRect(0, horizonY, W, H - horizonY);
        }
      }
    }
  }, [
    planet,
    moon,
    zone,
    stars,
    isMoon,
    pClass,
    hydro,
    gases,
    pBar,
    Tsurf,
    Teq,
    iceF,
    gasF,
    tilt,
    spinState,
    rings,
    sudarsky,
    isTidallyLockedPlanet,
    isGasOrFluidEnvelope,
    worldSeed,
    primaryStar,
    starRgb,
    solvent,
    hasBio,
    covPct,
    moonIndex,
    expandedMode,
  ]);

  return (
    <div className="bg-[#111826] border border-[#2a3852] rounded-xl p-3 flex flex-col gap-2.5">
      {/* Header & View Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-bold font-mono uppercase text-white">
            Astrophysical World Portrait &amp; Surface Vista
          </span>
          {isTidallyLockedPlanet && (
            <span className="px-2 py-0.5 rounded bg-amber-950/90 border border-amber-600/70 text-[10px] font-mono text-amber-300 font-bold">
              🔒 1:1 Tidally Locked (
              {isGasOrFluidEnvelope
                ? 'Super-Rotating Chevron Jet'
                : solvent === 'Silicate Magma' || Tsurf >= 800
                ? 'Dayside Magma Hemisphere'
                : covPct > 0
                ? 'Substellar Eyeball Ocean'
                : 'Substellar Desert / Nightside Frost'}
              )
            </span>
          )}
          {solvent && (
            <span className="px-2 py-0.5 rounded bg-sky-950/90 border border-sky-700/70 text-[10px] font-mono text-sky-300">
              {covPct > 0 && covPct < 100
                ? `${covPct}% ${solvent} Seas / ${100 - covPct}% Solid`
                : covPct === 100
                ? `100% Global ${solvent} Ocean`
                : solvent}
            </span>
          )}
          {hasBio && (
            <span className="px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-600/70 text-[10px] font-mono text-emerald-300 font-bold">
              🧬 Active Biosphere
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] font-mono">
          <button
            type="button"
            onClick={() => setExpandedMode('split')}
            className={`px-2 py-0.5 rounded cursor-pointer transition ${
              expandedMode === 'split'
                ? 'bg-sky-600 text-white font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Split View
          </button>
          <button
            type="button"
            onClick={() => setExpandedMode('globe')}
            className={`px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition ${
              expandedMode === 'globe'
                ? 'bg-sky-600 text-white font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Globe className="w-3 h-3" />
            Orbital Globe
          </button>
          <button
            type="button"
            onClick={() => setExpandedMode('vista')}
            className={`px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition ${
              expandedMode === 'vista'
                ? 'bg-sky-600 text-white font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Eye className="w-3 h-3" />
            {isGasOrFluidEnvelope ? 'Cloud-Top Vista' : 'Surface Horizon'}
          </button>
        </div>
      </div>

      {/* Canvases Container */}
      <div
        className={`grid gap-3 ${
          expandedMode === 'split' ? 'grid-cols-1 md:grid-cols-12' : 'grid-cols-1'
        }`}
      >
        {/* Left: 3D-Shaded Procedural Orbital Globe */}
        {expandedMode !== 'vista' && (
          <div
            className={`${
              expandedMode === 'split' ? 'md:col-span-5' : 'w-full'
            } relative bg-[#050810] rounded-lg border border-slate-800/90 overflow-hidden flex items-center justify-center p-2`}
          >
            <canvas
              ref={globeCanvasRef}
              width={240}
              height={180}
              className={`${
                expandedMode === 'globe' ? 'h-64' : 'h-40'
              } w-auto object-contain rounded`}
            />
            <div className="absolute bottom-2 left-2.5 right-2.5 flex justify-between items-center text-[10px] font-mono text-slate-400 bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded">
              <span>Orbital Telemetry Render</span>
              <span className="text-sky-300">
                {isMoon ? `Moon #${moonIndex + 1}` : `Planet #${bodyIndex + 1}`}
              </span>
            </div>
          </div>
        )}

        {/* Right: Panoramic Surface Horizon / Atmospheric Cloud-Top Vista */}
        {expandedMode !== 'globe' && (
          <div
            className={`${
              expandedMode === 'split' ? 'md:col-span-7' : 'w-full'
            } relative bg-[#050810] rounded-lg border border-slate-800/90 overflow-hidden flex items-center justify-center`}
          >
            <canvas
              ref={vistaCanvasRef}
              width={380}
              height={180}
              className={`${
                expandedMode === 'vista' ? 'h-64' : 'h-44'
              } w-full object-cover`}
            />
            <div className="absolute bottom-2 left-2.5 right-2.5 flex justify-between items-center text-[10px] font-mono text-slate-300 bg-black/60 backdrop-blur-xs px-2.5 py-0.5 rounded">
              <span>
                {isGasOrFluidEnvelope
                  ? '1-Bar Upper Cloud Deck Panorama'
                  : covPct > 0 && covPct < 100
                  ? `Coastal Shoreline (${solvent} Sea & Continents)`
                  : covPct === 100
                  ? `Global Pelagic ${solvent} Horizon`
                  : 'Surface Horizon Panorama'}
              </span>
              <span className="text-amber-300">
                Star {primaryStar?.label} ({primaryStar?.spectralType.split(' ')[0]})
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
