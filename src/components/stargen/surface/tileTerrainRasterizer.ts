/**
 * tileTerrainRasterizer.ts
 * Software CPU Z-Buffer Rasterizer with Per-Pixel Texturing, Bump-Mapping,
 * Infinite Horizon Perspective Plane & Depth-Discontinuity Antialiasing
 */

import { FLAG_WATER, FLAG_LAVA, FLAG_ICE_SPEC } from './terrainNoise';

export interface LocalVertex {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

export interface LocalTri {
  v0: number;
  v1: number;
  v2: number;
}

export interface ProjectedVertex {
  sx: number;
  sy: number;
  persp: number;
  depth: number;
}

export interface TileTextureData {
  TEX_RES: number;
  texR: Uint8Array;
  texG: Uint8Array;
  texB: Uint8Array;
  texBumpX: Int8Array;
  texBumpZ: Int8Array;
  texFlags: Uint8Array;
  texCloudShadow: Uint8Array;
  MIP_RES: number;
  mipR: Uint8Array;
  mipG: Uint8Array;
  mipB: Uint8Array;
  mipBumpX: Int8Array;
  mipBumpZ: Int8Array;
}

export interface RasterizeTileTerrainOptions {
  ctx: CanvasRenderingContext2D;
  offCanvas: HTMLCanvasElement;
  zBuffer: Float32Array;
  colorBuffer: Uint32Array;
  imageData: ImageData;
  width: number;
  height: number;
  triangles: LocalTri[];
  vertices: LocalVertex[];
  projVerts: ProjectedVertex[];
  texData: TileTextureData;
  lighting: {
    lx: number;
    ly: number;
    lz: number;
    halfX: number;
    halfY: number;
    halfZ: number;
    isNight: boolean;
    verticalExag: number;
    cloudShadowStrength: number;
  };
  camera: {
    cx: number;
    cy: number;
    scale: number;
    camDist: number;
    sinY: number;
    cosY: number;
    sinP: number;
    cosP: number;
  };
  atmosphere: {
    hasAtmosphere: boolean;
    atmoDensityFactor: number;
    hazeRgb: [number, number, number];
    isTholinWorldSpec: boolean;
  };
}

export function rasterizeTileTerrain(opts: RasterizeTileTerrainOptions): void {
  const {
    ctx,
    offCanvas,
    zBuffer,
    colorBuffer,
    imageData: imgData,
    width: W,
    height: H,
    triangles,
    vertices,
    projVerts,
    texData,
    lighting,
    camera,
    atmosphere,
  } = opts;

  zBuffer.fill(1e9);
  colorBuffer.fill(0);

  const { TEX_RES, texR, texG, texB, texBumpX, texBumpZ, texFlags, texCloudShadow, MIP_RES, mipR, mipG, mipB, mipBumpX, mipBumpZ } = texData;
  const { lx, ly, lz, halfX, halfY, halfZ, isNight, verticalExag, cloudShadowStrength } = lighting;
  const { cx, cy, scale, camDist, sinY, cosY, sinP, cosP } = camera;
  const { hasAtmosphere, atmoDensityFactor, hazeRgb, isTholinWorldSpec } = atmosphere;

  const nightDim = isNight ? 0.36 : 1.0;
  const texMax = TEX_RES - 1;

  // ============================================================================
  // Step 3A: Rasterize 3D terrain triangles strictly inside active Goldberg tile
  // ============================================================================
  for (let i = 0; i < triangles.length; i++) {
    const tri = triangles[i];
    const v0 = vertices[tri.v0];
    const v1 = vertices[tri.v1];
    const v2 = vertices[tri.v2];

    const p0 = projVerts[tri.v0];
    const p1 = projVerts[tri.v1];
    const p2 = projVerts[tri.v2];

    const x0 = p0.sx;
    const y0 = p0.sy;
    const x1 = p1.sx;
    const y1 = p1.sy;
    const x2 = p2.sx;
    const y2 = p2.sy;

    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) continue;

    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    // Cull back-facing / underside triangles
    if (area <= 0.05) continue;
    const invArea = 1.0 / area;

    // Convert vertex [-1, +1] into texture space [0, texMax]
    const u0 = (v0.x * 0.5 + 0.5) * texMax;
    const tv0 = (v0.z * 0.5 + 0.5) * texMax;
    const u1 = (v1.x * 0.5 + 0.5) * texMax;
    const tv1 = (v1.z * 0.5 + 0.5) * texMax;
    const u2 = (v2.x * 0.5 + 0.5) * texMax;
    const tv2 = (v2.z * 0.5 + 0.5) * texMax;

    const d0 = p0.depth;
    const d1 = p1.depth;
    const d2 = p2.depth;

    const dw1dx = (y2 - y0) * invArea;
    const dw2dx = (y0 - y1) * invArea;

    for (let py = minY; py <= maxY; py++) {
      const sy = py + 0.5;
      const dx0 = minX + 0.5 - x0;
      const dy0 = sy - y0;

      let w1 = (dx0 * (y2 - y0) - (x2 - x0) * dy0) * invArea;
      let w2 = ((x1 - x0) * dy0 - dx0 * (y1 - y0)) * invArea;
      const rowOffset = py * W;

      for (let px = minX; px <= maxX; px++) {
        const w0 = 1.0 - w1 - w2;
        if (w0 >= -0.002 && w1 >= -0.002 && w2 >= -0.002) {
          const depth = w0 * d0 + w1 * d1 + w2 * d2;
          const pIdx = rowOffset + px;

          if (depth < zBuffer[pIdx]) {
            zBuffer[pIdx] = depth;

            // Interpolate texture coordinates (u, v) and sample with Hermite smoothstep filtering
            const tu = Math.max(0, Math.min(texMax - 0.001, w0 * u0 + w1 * u1 + w2 * u2));
            const tv = Math.max(0, Math.min(texMax - 0.001, w0 * tv0 + w1 * tv1 + w2 * tv2));
            const iu = tu | 0;
            const iv = tv | 0;
            const fu = tu - iu;
            const fv = tv - iv;
            const sfu = fu * fu * (3 - 2 * fu);
            const sfv = fv * fv * (3 - 2 * fv);

            const ti00 = iv * TEX_RES + iu;
            const ti10 = ti00 + 1;
            const ti01 = ti00 + TEX_RES;
            const ti11 = ti01 + 1;

            const tw00 = (1 - sfu) * (1 - sfv);
            const tw10 = sfu * (1 - sfv);
            const tw01 = (1 - sfu) * sfv;
            const tw11 = sfu * sfv;

            let r = texR[ti00] * tw00 + texR[ti10] * tw10 + texR[ti01] * tw01 + texR[ti11] * tw11;
            let g = texG[ti00] * tw00 + texG[ti10] * tw10 + texG[ti01] * tw01 + texG[ti11] * tw11;
            let b = texB[ti00] * tw00 + texB[ti10] * tw10 + texB[ti01] * tw01 + texB[ti11] * tw11;

            const bx =
              (texBumpX[ti00] * tw00 + texBumpX[ti10] * tw10 + texBumpX[ti01] * tw01 + texBumpX[ti11] * tw11) *
              (1 / 64);
            const bz =
              (texBumpZ[ti00] * tw00 + texBumpZ[ti10] * tw10 + texBumpZ[ti01] * tw01 + texBumpZ[ti11] * tw11) *
              (1 / 64);

            const f00 = texFlags[ti00];
            const f10 = texFlags[ti10];
            const f01 = texFlags[ti01];
            const f11 = texFlags[ti11];
            const lavaW =
              ((f00 & FLAG_LAVA) ? tw00 : 0) +
              ((f10 & FLAG_LAVA) ? tw10 : 0) +
              ((f01 & FLAG_LAVA) ? tw01 : 0) +
              ((f11 & FLAG_LAVA) ? tw11 : 0);

            if (lavaW < 0.99) {
              const rawR = r;
              const rawG = g;
              const rawB = b;

              // Combine Gouraud-interpolated macro terrain normal with per-pixel texture bump normal
              const mnx = (w0 * v0.nx + w1 * v1.nx + w2 * v2.nx) * verticalExag + bx * 0.42;
              const mny = w0 * v0.ny + w1 * v1.ny + w2 * v2.ny;
              const mnz = (w0 * v0.nz + w1 * v1.nz + w2 * v2.nz) * verticalExag + bz * 0.42;
              const invN = 1.0 / (Math.hypot(mnx, mny, mnz) || 1);
              const nx = mnx * invN;
              const ny = mny * invN;
              const nz = mnz * invN;

              const ndotl = Math.max(0, nx * lx + ny * ly + nz * lz);
              const cShad =
                (texCloudShadow[ti00] * tw00 +
                  texCloudShadow[ti10] * tw10 +
                  texCloudShadow[ti01] * tw01 +
                  texCloudShadow[ti11] * tw11) *
                (1 / 255) *
                cloudShadowStrength;
              const shadowAtten = 1.0 - cShad;
              const diff = (0.30 + 0.78 * ndotl * shadowAtten) * nightDim;

              r *= diff;
              g *= diff;
              b *= diff;

              // Smoothly interpolated specular highlights on water wave facets & crystalline ice facets
              if (!isNight) {
                const waterW =
                  ((f00 & FLAG_WATER) ? tw00 : 0) +
                  ((f10 & FLAG_WATER) ? tw10 : 0) +
                  ((f01 & FLAG_WATER) ? tw01 : 0) +
                  ((f11 & FLAG_WATER) ? tw11 : 0);
                const iceW =
                  ((f00 & FLAG_ICE_SPEC) ? tw00 : 0) +
                  ((f10 & FLAG_ICE_SPEC) ? tw10 : 0) +
                  ((f01 & FLAG_ICE_SPEC) ? tw01 : 0) +
                  ((f11 & FLAG_ICE_SPEC) ? tw11 : 0);
                if (waterW + iceW > 0.01) {
                  const ndoth = Math.max(0, nx * halfX + ny * halfY + nz * halfZ);
                  const isTholinSpec = waterW < 0.5 && isTholinWorldSpec;
                  const specPow =
                    waterW * (Math.pow(ndoth, 24) * 0.58) +
                    iceW * (Math.pow(ndoth, 16) * (isTholinSpec ? 0.18 : 0.30));
                  const spec = specPow * shadowAtten;
                  r += (isTholinSpec ? 245 : 230) * spec;
                  g += (isTholinSpec ? 185 : 244) * spec;
                  b += (isTholinSpec ? 120 : 255) * spec;
                }
              }

              // Distance-based atmospheric aerial perspective haze
              if (atmoDensityFactor > 0) {
                const distNorm = Math.max(0, Math.min(1, (depth - 2.9) / 1.75));
                const fog = distNorm * atmoDensityFactor;
                r = r * (1 - fog) + hazeRgb[0] * fog;
                g = g * (1 - fog) + hazeRgb[1] * fog;
                b = b * (1 - fog) + hazeRgb[2] * fog;
              }

              if (lavaW > 0.01) {
                r = r * (1 - lavaW) + rawR * lavaW;
                g = g * (1 - lavaW) + rawG * lavaW;
                b = b * (1 - lavaW) + rawB * lavaW;
              }
            }

            const ir = r < 0 ? 0 : r > 255 ? 255 : r | 0;
            const ig = g < 0 ? 0 : g > 255 ? 255 : g | 0;
            const ib = b < 0 ? 0 : b > 255 ? 255 : b | 0;
            colorBuffer[pIdx] = (255 << 24) | (ib << 16) | (ig << 8) | ir;
          }
        }
        w1 += dw1dx;
        w2 += dw2dx;
      }
    }
  }

  // ============================================================================
  // Step 3B: Extend texture on horizontal perspective plane (y=0) to horizon
  // ============================================================================
  const invScaleDist = 1.0 / (scale * camDist);
  const mipMax = MIP_RES - 1;
  for (let py = 0; py < H; py++) {
    const vs = (cy - (py + 0.5)) * invScaleDist;
    const denom = sinP - vs * cosP;
    if (denom <= 0.0015) continue;

    const z1 = (-vs * camDist) / denom;
    const camDepth = camDist - z1 * cosP;
    if (camDepth <= 1.15) continue;

    const rowOffset = py * W;
    const wxBase = z1 * sinY;
    const wzBase = z1 * cosY;
    const dwx = camDepth * invScaleDist * cosY;
    const dwz = -camDepth * invScaleDist * sinY;

    const mipBlend = Math.max(0, Math.min(1, (camDepth - 3.6) / 4.2));
    const bumpAtten = Math.max(0.15, 1.0 - Math.max(0, (camDepth - 3.4) / 7.5));

    const baseFog = atmoDensityFactor > 0 ? Math.max(0, Math.min(1, (camDepth - 2.9) / 8.5)) * atmoDensityFactor : 0;
    const horizonFade = Math.max(0, Math.min(1, (camDepth - 5.5) / 18.0));
    const totalFog = Math.min(0.96, baseFog + horizonFade * (1 - baseFog) * (hasAtmosphere ? 0.92 : 0.75));

    let wx = wxBase + (0.5 - cx) * dwx;
    let wz = wzBase + (0.5 - cx) * dwz;

    for (let px = 0; px < W; px++) {
      const pIdx = rowOffset + px;
      if (zBuffer[pIdx] === 1e9) {
        const twx = (((wx + 1) * 0.5) % 2 + 2) % 2;
        const signX = twx <= 1 ? 1 : -1;
        const fxMir = (twx <= 1 ? twx : 2 - twx) * 2 - 1;
        const twz = (((wz + 1) * 0.5) % 2 + 2) % 2;
        const signZ = twz <= 1 ? 1 : -1;
        const fzMir = (twz <= 1 ? twz : 2 - twz) * 2 - 1;

        const uNorm = fxMir * 0.5 + 0.5;
        const vNorm = fzMir * 0.5 + 0.5;

        const tu = Math.max(0, Math.min(texMax - 0.001, uNorm * texMax));
        const tv = Math.max(0, Math.min(texMax - 0.001, vNorm * texMax));
        const iu = tu | 0;
        const iv = tv | 0;
        const fu = tu - iu;
        const fv = tv - iv;
        const sfu = fu * fu * (3 - 2 * fu);
        const sfv = fv * fv * (3 - 2 * fv);

        const ti00 = iv * TEX_RES + iu;
        const ti10 = ti00 + 1;
        const ti01 = ti00 + TEX_RES;
        const ti11 = ti01 + 1;

        const tw00 = (1 - sfu) * (1 - sfv);
        const tw10 = sfu * (1 - sfv);
        const tw01 = (1 - sfu) * sfv;
        const tw11 = sfu * sfv;

        let r = texR[ti00] * tw00 + texR[ti10] * tw10 + texR[ti01] * tw01 + texR[ti11] * tw11;
        let g = texG[ti00] * tw00 + texG[ti10] * tw10 + texG[ti01] * tw01 + texG[ti11] * tw11;
        let b = texB[ti00] * tw00 + texB[ti10] * tw10 + texB[ti01] * tw01 + texB[ti11] * tw11;

        let bx =
          (texBumpX[ti00] * tw00 + texBumpX[ti10] * tw10 + texBumpX[ti01] * tw01 + texBumpX[ti11] * tw11) *
          (1 / 64) *
          signX;
        let bz =
          (texBumpZ[ti00] * tw00 + texBumpZ[ti10] * tw10 + texBumpZ[ti01] * tw01 + texBumpZ[ti11] * tw11) *
          (1 / 64) *
          signZ;

        if (mipBlend > 0.01) {
          const mtu = Math.max(0, Math.min(mipMax - 0.001, uNorm * mipMax));
          const mtv = Math.max(0, Math.min(mipMax - 0.001, vNorm * mipMax));
          const miu = mtu | 0;
          const miv = mtv | 0;
          const mfu = mtu - miu;
          const mfv = mtv - miv;
          const mi00 = miv * MIP_RES + miu;
          const mi10 = mi00 + 1;
          const mi01 = mi00 + MIP_RES;
          const mi11 = mi01 + 1;
          const mw00 = (1 - mfu) * (1 - mfv);
          const mw10 = mfu * (1 - mfv);
          const mw01 = (1 - mfu) * mfv;
          const mw11 = mfu * mfv;
          const mr = mipR[mi00] * mw00 + mipR[mi10] * mw10 + mipR[mi01] * mw01 + mipR[mi11] * mw11;
          const mg = mipG[mi00] * mw00 + mipG[mi10] * mw10 + mipG[mi01] * mw01 + mipG[mi11] * mw11;
          const mb = mipB[mi00] * mw00 + mipB[mi10] * mw10 + mipB[mi01] * mw01 + mipB[mi11] * mw11;
          const mbx =
            (mipBumpX[mi00] * mw00 + mipBumpX[mi10] * mw10 + mipBumpX[mi01] * mw01 + mipBumpX[mi11] * mw11) *
            (1 / 64) *
            signX;
          const mbz =
            (mipBumpZ[mi00] * mw00 + mipBumpZ[mi10] * mw10 + mipBumpZ[mi01] * mw01 + mipBumpZ[mi11] * mw11) *
            (1 / 64) *
            signZ;
          r = r * (1 - mipBlend) + mr * mipBlend;
          g = g * (1 - mipBlend) + mg * mipBlend;
          b = b * (1 - mipBlend) + mb * mipBlend;
          bx = bx * (1 - mipBlend) + mbx * mipBlend;
          bz = bz * (1 - mipBlend) + mbz * mipBlend;
        }

        const f00 = texFlags[ti00];
        const f10 = texFlags[ti10];
        const f01 = texFlags[ti01];
        const f11 = texFlags[ti11];
        const lavaW =
          ((f00 & FLAG_LAVA) ? tw00 : 0) +
          ((f10 & FLAG_LAVA) ? tw10 : 0) +
          ((f01 & FLAG_LAVA) ? tw01 : 0) +
          ((f11 & FLAG_LAVA) ? tw11 : 0);

        if (lavaW < 0.99) {
          const rawR = r;
          const rawG = g;
          const rawB = b;

          const mnx = bx * 0.42 * bumpAtten;
          const mny = 1.0;
          const mnz = bz * 0.42 * bumpAtten;
          const invN = 1.0 / (Math.hypot(mnx, mny, mnz) || 1);
          const nx = mnx * invN;
          const ny = mny * invN;
          const nz = mnz * invN;

          const ndotl = Math.max(0, nx * lx + ny * ly + nz * lz);
          const cShad =
            (texCloudShadow[ti00] * tw00 +
              texCloudShadow[ti10] * tw10 +
              texCloudShadow[ti01] * tw01 +
              texCloudShadow[ti11] * tw11) *
            (1 / 255) *
            cloudShadowStrength;
          const shadowAtten = 1.0 - cShad;
          const diff = (0.28 + 0.80 * ndotl * shadowAtten) * nightDim;
          r *= diff;
          g *= diff;
          b *= diff;

          if (!isNight) {
            const waterW =
              ((f00 & FLAG_WATER) ? tw00 : 0) +
              ((f10 & FLAG_WATER) ? tw10 : 0) +
              ((f01 & FLAG_WATER) ? tw01 : 0) +
              ((f11 & FLAG_WATER) ? tw11 : 0);
            const iceW =
              ((f00 & FLAG_ICE_SPEC) ? tw00 : 0) +
              ((f10 & FLAG_ICE_SPEC) ? tw10 : 0) +
              ((f01 & FLAG_ICE_SPEC) ? tw01 : 0) +
              ((f11 & FLAG_ICE_SPEC) ? tw11 : 0);
            if (waterW + iceW > 0.01) {
              const ndoth = Math.max(0, nx * halfX + ny * halfY + nz * halfZ);
              const isTholinSpec = waterW < 0.5 && isTholinWorldSpec;
              const specPow =
                waterW * (Math.pow(ndoth, 24) * 0.58) +
                iceW * (Math.pow(ndoth, 16) * (isTholinSpec ? 0.18 : 0.30));
              const spec = specPow * shadowAtten;
              r += (isTholinSpec ? 245 : 230) * spec;
              g += (isTholinSpec ? 185 : 244) * spec;
              b += (isTholinSpec ? 120 : 255) * spec;
            }
          }

          if (totalFog > 0) {
            r = r * (1 - totalFog) + hazeRgb[0] * totalFog;
            g = g * (1 - totalFog) + hazeRgb[1] * totalFog;
            b = b * (1 - totalFog) + hazeRgb[2] * totalFog;
          }

          if (lavaW > 0.01) {
            r = r * (1 - lavaW) + rawR * lavaW;
            g = g * (1 - lavaW) + rawG * lavaW;
            b = b * (1 - lavaW) + rawB * lavaW;
          }
        }

        const ir = r < 0 ? 0 : r > 255 ? 255 : r | 0;
        const ig = g < 0 ? 0 : g > 255 ? 255 : g | 0;
        const ib = b < 0 ? 0 : b > 255 ? 255 : b | 0;
        colorBuffer[pIdx] = (255 << 24) | (ib << 16) | (ig << 8) | ir;
      }
      wx += dwx;
      wz += dwz;
    }
  }

  // ============================================================================
  // Step 3C: Depth-discontinuity silhouette & high-contrast edge anti-aliasing
  // ============================================================================
  for (let py = 1; py < H - 1; py++) {
    const row = py * W;
    for (let px = 1; px < W - 1; px++) {
      const idx = row + px;
      const c0 = colorBuffer[idx];
      if (c0 === 0) continue;
      const z0 = zBuffer[idx];
      const zU = zBuffer[idx - W];
      const zD = zBuffer[idx + W];
      const zL = zBuffer[idx - 1];
      const zR = zBuffer[idx + 1];

      if (
        Math.abs(z0 - zU) > 0.08 ||
        Math.abs(z0 - zD) > 0.08 ||
        Math.abs(z0 - zL) > 0.08 ||
        Math.abs(z0 - zR) > 0.08
      ) {
        const cU = colorBuffer[idx - W] || c0;
        const cD = colorBuffer[idx + W] || c0;
        const cL = colorBuffer[idx - 1] || c0;
        const cR = colorBuffer[idx + 1] || c0;
        const rAvg = ((c0 & 255) * 4 + (cU & 255) + (cD & 255) + (cL & 255) + (cR & 255)) >> 3;
        const gAvg = (((c0 >> 8) & 255) * 4 + ((cU >> 8) & 255) + ((cD >> 8) & 255) + ((cL >> 8) & 255) + ((cR >> 8) & 255)) >> 3;
        const bAvg = (((c0 >> 16) & 255) * 4 + ((cU >> 16) & 255) + ((cD >> 16) & 255) + ((cL >> 16) & 255) + ((cR >> 16) & 255)) >> 3;
        const a0 = (c0 >>> 24) & 255;
        const aU = (cU >>> 24) & 255;
        const aAvg = (a0 * 3 + aU) >> 2;
        colorBuffer[idx] = (aAvg << 24) | (bAvg << 16) | (gAvg << 8) | rAvg;
      }
    }
  }

  // Composite the Z-buffered textured 3D terrain onto the main canvas
  const offCtx = offCanvas.getContext('2d');
  if (offCtx) {
    offCtx.putImageData(imgData, 0, 0);
    ctx.drawImage(offCanvas, 0, 0);
  }
}
