/**
 * Procedural Botanical Illustration & Xenoflora Specimen Art Generator
 * 
 * Generates deterministic, high-fidelity botanical specimen portraits (vector SVG)
 * for extraterrestrial plant species based on their morphological form category,
 * photosynthetic pigments, structural polymers, and astrophysical scaling.
 */

import { XenofloraSpecies, PlantFormCategory } from './floraGen';
import { XenofungiSpecies, FungiFormCategory } from './fungiGen';

export type SpecimenSpecies = XenofloraSpecies | XenofungiSpecies;
export type SpecimenFormCategory = PlantFormCategory | FungiFormCategory;

export interface BotanicalArtOptions {
  width?: number;
  height?: number;
  showScaleBar?: boolean;
  showGrid?: boolean;
  showLabels?: boolean;
  starTeff?: number;
}

// Simple deterministic hash for procedural geometry
function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Color utility helpers
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function adjustColorBrightness(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 + percent / 100;
  return rgbToHex(r * factor, g * factor, b * factor);
}

function getPolymerColors(structuralPolymer: string): { stipeBase: string; stipeHighlight: string } {
  const lower = structuralPolymer.toLowerCase();
  if (lower.includes('silica') || lower.includes('mineral')) {
    return { stipeBase: '#334155', stipeHighlight: '#94a3b8' };
  }
  if (lower.includes('cryo') || lower.includes('gel')) {
    return { stipeBase: '#164e63', stipeHighlight: '#67e8f9' };
  }
  if (lower.includes('melanin') || lower.includes('melanized')) {
    return { stipeBase: '#18181b', stipeHighlight: '#52525b' };
  }
  if (lower.includes('fluoro') || lower.includes('chitin') || lower.includes('glucan')) {
    return { stipeBase: '#292524', stipeHighlight: '#78716c' };
  }
  if (lower.includes('hyphal') || lower.includes('rhizomorph')) {
    return { stipeBase: '#3f3f46', stipeHighlight: '#d4d4d8' };
  }
  if (lower.includes('slime') || lower.includes('poly')) {
    return { stipeBase: '#713f12', stipeHighlight: '#ca8a04' };
  }
  // Standard lignified cellulose / wood
  return { stipeBase: '#451a03', stipeHighlight: '#78350f' };
}

/**
 * Generates an SVG string containing the complete botanical specimen illustration.
 */
export function generateBotanicalSvg(
  species: SpecimenSpecies,
  options: BotanicalArtOptions = {}
): string {
  const width = options.width || 240;
  const height = options.height || 240;
  const showScaleBar = options.showScaleBar ?? true;
  const showGrid = options.showGrid ?? true;
  const showLabels = options.showLabels ?? true;

  const seed = hashString(species.id + species.scientificName);

  const formCategory: SpecimenFormCategory = (species.formCategory as SpecimenFormCategory) || 'Tree';
  const pigment = species.pigmentColorHex || '#10b981';
  const pigmentDark = adjustColorBrightness(pigment, -45);
  const pigmentLight = adjustColorBrightness(pigment, 40);
  const pigmentVibrant = adjustColorBrightness(pigment, 20);

  const { stipeBase, stipeHighlight } = getPolymerColors(species.structuralPolymer);

  const uniqueId = `specimen_${seed.toString(36)}`;
  const groundY = height * 0.82;
  const centerX = width * 0.5;

  // Build Botanical Elements according to morphology
  let floraShapesSvg = '';

  switch (formCategory) {
    case 'Tree': {
      // Dominant Canopy Tree: Root buttresses, tall trunk, branching boughs, tiered foliage canopy
      const trunkBaseW = width * 0.12;
      const trunkTopW = width * 0.04;
      const trunkTopY = height * 0.38;

      // Buttress roots
      const rootPath = `M ${centerX - trunkBaseW * 1.6} ${groundY + 4} 
        Q ${centerX - trunkBaseW * 0.6} ${groundY - 12} ${centerX - trunkTopW} ${trunkTopY + (groundY - trunkTopY) * 0.5}
        L ${centerX + trunkTopW} ${trunkTopY + (groundY - trunkTopY) * 0.5}
        Q ${centerX + trunkBaseW * 0.6} ${groundY - 12} ${centerX + trunkBaseW * 1.6} ${groundY + 4} Z`;

      // Branch boughs
      const branches = [
        `M ${centerX} ${trunkTopY + 20} Q ${centerX - width * 0.18} ${trunkTopY + 5} ${centerX - width * 0.28} ${trunkTopY - 20}`,
        `M ${centerX} ${trunkTopY + 25} Q ${centerX + width * 0.18} ${trunkTopY + 8} ${centerX + width * 0.28} ${trunkTopY - 15}`,
        `M ${centerX} ${trunkTopY + 10} Q ${centerX - width * 0.08} ${trunkTopY - 15} ${centerX - width * 0.14} ${trunkTopY - 45}`,
        `M ${centerX} ${trunkTopY + 10} Q ${centerX + width * 0.08} ${trunkTopY - 15} ${centerX + width * 0.14} ${trunkTopY - 42}`,
      ];

      // Layered canopy clusters
      const canopyClusters = [
        { cx: centerX - width * 0.24, cy: trunkTopY - 22, rx: width * 0.18, ry: height * 0.14 },
        { cx: centerX + width * 0.24, cy: trunkTopY - 18, rx: width * 0.18, ry: height * 0.14 },
        { cx: centerX - width * 0.12, cy: trunkTopY - 48, rx: width * 0.19, ry: height * 0.15 },
        { cx: centerX + width * 0.12, cy: trunkTopY - 46, rx: width * 0.19, ry: height * 0.15 },
        { cx: centerX, cy: trunkTopY - 58, rx: width * 0.22, ry: height * 0.17 },
      ];

      // Hanging spore pods or seed capsules
      const pods = [
        { cx: centerX - width * 0.22, cy: trunkTopY - 5, r: 3 },
        { cx: centerX - width * 0.14, cy: trunkTopY + 4, r: 3.5 },
        { cx: centerX + width * 0.16, cy: trunkTopY + 2, r: 3 },
        { cx: centerX + width * 0.23, cy: trunkTopY - 2, r: 3.5 },
      ];

      floraShapesSvg = `
        <!-- Buttress Roots & Trunk -->
        <path d="${rootPath}" fill="url(#${uniqueId}_stipe)" />
        <path d="M ${centerX - trunkBaseW * 0.5} ${groundY} L ${centerX - trunkTopW} ${trunkTopY} L ${centerX + trunkTopW} ${trunkTopY} L ${centerX + trunkBaseW * 0.5} ${groundY} Z" fill="url(#${uniqueId}_stipe)" />
        <!-- Bark vertical grain -->
        <path d="M ${centerX - trunkBaseW * 0.2} ${groundY - 2} Q ${centerX - 2} ${(trunkTopY + groundY) / 2} ${centerX - trunkTopW * 0.4} ${trunkTopY}" stroke="${stipeHighlight}" stroke-width="1.2" fill="none" opacity="0.6" />
        <path d="M ${centerX + trunkBaseW * 0.2} ${groundY - 2} Q ${centerX + 2} ${(trunkTopY + groundY) / 2} ${centerX + trunkTopW * 0.4} ${trunkTopY}" stroke="${stipeBase}" stroke-width="1.2" fill="none" opacity="0.8" />
        
        <!-- Branches -->
        ${branches.map(d => `<path d="${d}" stroke="url(#${uniqueId}_stipe)" stroke-width="${Math.max(2, width * 0.018)}" stroke-linecap="round" fill="none" />`).join('\n')}

        <!-- Canopy Foliage Clusters -->
        ${canopyClusters.map((c) => `
          <g>
            <ellipse cx="${c.cx}" cy="${c.cy + 3}" rx="${c.rx}" ry="${c.ry}" fill="${pigmentDark}" opacity="0.65" />
            <ellipse cx="${c.cx}" cy="${c.cy}" rx="${c.rx}" ry="${c.ry}" fill="url(#${uniqueId}_pigment)" />
            <!-- Highlight rim -->
            <ellipse cx="${c.cx}" cy="${c.cy - 2}" rx="${c.rx * 0.88}" ry="${c.ry * 0.75}" fill="${pigmentLight}" opacity="0.25" />
          </g>
        `).join('\n')}

        <!-- Hanging Pods -->
        ${pods.map(p => `
          <line x1="${p.cx}" y1="${p.cy - 7}" x2="${p.cx}" y2="${p.cy}" stroke="${stipeHighlight}" stroke-width="0.8" />
          <circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${pigmentLight}" stroke="${pigmentDark}" stroke-width="0.8" />
          <circle cx="${p.cx - 0.7}" cy="${p.cy - 0.7}" r="${p.r * 0.4}" fill="#ffffff" opacity="0.7" />
        `).join('\n')}
      `;
      break;
    }

    case 'Frond': {
      // Vascular Siphon-Frond / Alien Fern: Arching rachis, bipinnate foliage ribs, central fiddlehead
      const frondCount = 7;
      let frondPaths = '';

      for (let i = 0; i < frondCount; i++) {
        const angleNorm = (i / (frondCount - 1) - 0.5) * 1.5; // -0.75 to +0.75
        const len = height * (0.42 + (1 - Math.abs(angleNorm) * 0.3) * 0.16);
        const endX = centerX + Math.sin(angleNorm) * len * 0.95;
        const endY = groundY - Math.cos(angleNorm) * len * 0.8;
        const ctrlX = centerX + Math.sin(angleNorm) * len * 0.4;
        const ctrlY = groundY - len * 0.9;

        // Leaflets along this frond
        let leaflets = '';
        const leafSteps = 9;
        for (let s = 2; s < leafSteps; s++) {
          const t = s / leafSteps;
          // Quadratic bezier interpolation: (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
          const lx = (1 - t) * (1 - t) * centerX + 2 * (1 - t) * t * ctrlX + t * t * endX;
          const ly = (1 - t) * (1 - t) * groundY + 2 * (1 - t) * t * ctrlY + t * t * endY;
          const leafW = (1 - t * 0.5) * width * 0.07;
          const leafH = leafW * 0.45;
          const rotL = angleNorm * 50 - 35;
          const rotR = angleNorm * 50 + 35;

          leaflets += `
            <ellipse cx="${lx - leafW * 0.6}" cy="${ly}" rx="${leafW}" ry="${leafH}" transform="rotate(${rotL} ${lx} ${ly})" fill="url(#${uniqueId}_pigment)" opacity="0.88" />
            <ellipse cx="${lx + leafW * 0.6}" cy="${ly}" rx="${leafW}" ry="${leafH}" transform="rotate(${rotR} ${lx} ${ly})" fill="url(#${uniqueId}_pigment)" opacity="0.88" />
          `;
        }

        frondPaths += `
          <g>
            <path d="M ${centerX} ${groundY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}" stroke="url(#${uniqueId}_stipe)" stroke-width="2.0" fill="none" stroke-linecap="round" />
            ${leaflets}
            <!-- Terminal apical plume -->
            <circle cx="${endX}" cy="${endY}" r="2.5" fill="${pigmentLight}" />
          </g>
        `;
      }

      floraShapesSvg = `
        <!-- Basal stipe root cluster -->
        <ellipse cx="${centerX}" cy="${groundY}" rx="${width * 0.08}" ry="6" fill="url(#${uniqueId}_stipe)" />
        ${frondPaths}
        <!-- Crown spore cluster -->
        <circle cx="${centerX}" cy="${groundY - 14}" r="${width * 0.05}" fill="${pigmentVibrant}" opacity="0.9" />
        <circle cx="${centerX}" cy="${groundY - 14}" r="${width * 0.025}" fill="#ffffff" opacity="0.6" />
      `;
      break;
    }

    case 'Cushion': {
      // Lithophytic Succulent Cushion-Dome: Clustered rosettes, geometric water-storing plates
      const lobes = [
        { cx: centerX, cy: groundY - height * 0.16, rx: width * 0.28, ry: height * 0.16, fill: pigmentDark },
        { cx: centerX - width * 0.14, cy: groundY - height * 0.10, rx: width * 0.18, ry: height * 0.12, fill: pigment },
        { cx: centerX + width * 0.14, cy: groundY - height * 0.10, rx: width * 0.18, ry: height * 0.12, fill: pigment },
        { cx: centerX - width * 0.06, cy: groundY - height * 0.18, rx: width * 0.16, ry: height * 0.13, fill: pigmentVibrant },
        { cx: centerX + width * 0.06, cy: groundY - height * 0.19, rx: width * 0.16, ry: height * 0.13, fill: pigmentLight },
        { cx: centerX, cy: groundY - height * 0.23, rx: width * 0.12, ry: height * 0.11, fill: pigmentVibrant },
      ];

      // Radiating succulent facet veins
      let veins = '';
      for (let a = 0; a < 8; a++) {
        const rad = (a / 8) * Math.PI * 2;
        const x2 = centerX + Math.cos(rad) * width * 0.22;
        const y2 = (groundY - height * 0.15) + Math.sin(rad) * height * 0.10;
        veins += `<line x1="${centerX}" y1="${groundY - height * 0.15}" x2="${x2}" y2="${y2}" stroke="${adjustColorBrightness(pigment, -30)}" stroke-width="0.8" opacity="0.5" />`;
      }

      // Apical spore nodes / succulent blossom
      floraShapesSvg = `
        <!-- Basal shadow -->
        <ellipse cx="${centerX}" cy="${groundY + 2}" rx="${width * 0.32}" ry="8" fill="rgba(0,0,0,0.5)" />
        <!-- Succulent Lobes -->
        ${lobes.map(l => `
          <g>
            <ellipse cx="${l.cx}" cy="${l.cy}" rx="${l.rx}" ry="${l.ry}" fill="${l.fill}" stroke="${stipeHighlight}" stroke-width="0.6" />
            <ellipse cx="${l.cx - l.rx * 0.2}" cy="${l.cy - l.ry * 0.3}" rx="${l.rx * 0.4}" ry="${l.ry * 0.35}" fill="#ffffff" opacity="0.18" />
          </g>
        `).join('\n')}
        ${veins}
        <!-- Apical Flower / Spore Crest -->
        <circle cx="${centerX}" cy="${groundY - height * 0.28}" r="5" fill="${adjustColorBrightness(pigment, 60)}" stroke="#ffffff" stroke-width="0.8" />
        <circle cx="${centerX}" cy="${groundY - height * 0.28}" r="2" fill="#ffffff" />
      `;
      break;
    }

    case 'Spire': {
      // Columnar Needle Spire / Chemosynthetic Chimney: Segmented spire tower, quills, venting plume
      const spireH = height * 0.62;
      const spireBaseW = width * 0.11;
      const spireTopW = width * 0.025;
      const topY = groundY - spireH;

      // Segmented rings
      const rings = [];
      const numRings = 9;
      for (let r = 0; r < numRings; r++) {
        const t = r / numRings;
        const ry = groundY - spireH * t;
        const rw = spireBaseW * (1 - t * 0.7);
        rings.push({ y: ry, w: rw });
      }

      // Radiating needle quills
      let quills = '';
      for (let q = 1; q < numRings; q++) {
        const ring = rings[q];
        const qLen = (1 - (q / numRings) * 0.6) * width * 0.12;
        quills += `
          <line x1="${centerX - ring.w}" y1="${ring.y}" x2="${centerX - ring.w - qLen}" y2="${ring.y - 6}" stroke="${pigmentLight}" stroke-width="1.2" stroke-linecap="round" />
          <line x1="${centerX + ring.w}" y1="${ring.y}" x2="${centerX + ring.w + qLen}" y2="${ring.y - 6}" stroke="${pigmentLight}" stroke-width="1.2" stroke-linecap="round" />
        `;
      }

      floraShapesSvg = `
        <!-- Base footing -->
        <polygon points="${centerX - spireBaseW * 1.5},${groundY + 3} ${centerX + spireBaseW * 1.5},${groundY + 3} ${centerX + spireBaseW},${groundY - 10} ${centerX - spireBaseW},${groundY - 10}" fill="url(#${uniqueId}_stipe)" />
        
        <!-- Spire Body -->
        <polygon points="${centerX - spireBaseW},${groundY} ${centerX + spireBaseW},${groundY} ${centerX + spireTopW},${topY} ${centerX - spireTopW},${topY}" fill="url(#${uniqueId}_stipe)" />
        <polygon points="${centerX},${groundY} ${centerX + spireBaseW},${groundY} ${centerX + spireTopW},${topY} ${centerX},${topY}" fill="rgba(0,0,0,0.3)" />

        <!-- Segmented growth collars -->
        ${rings.map(ring => `
          <ellipse cx="${centerX}" cy="${ring.y}" rx="${ring.w * 1.05}" ry="2.2" fill="${pigmentVibrant}" stroke="${stipeHighlight}" stroke-width="0.6" />
        `).join('\n')}

        <!-- Lateral Needle Quills -->
        ${quills}

        <!-- Apical Vent Plume / Spore Exhalation -->
        <ellipse cx="${centerX}" cy="${topY - 8}" rx="6" ry="10" fill="url(#${uniqueId}_plume)" opacity="0.8" />
        <ellipse cx="${centerX}" cy="${topY - 20}" rx="10" ry="14" fill="url(#${uniqueId}_plume)" opacity="0.5" />
        <ellipse cx="${centerX}" cy="${topY - 34}" rx="15" ry="18" fill="url(#${uniqueId}_plume)" opacity="0.25" />
        <circle cx="${centerX}" cy="${topY}" r="2" fill="#ffffff" />
      `;
      break;
    }

    case 'Mat': {
      // Stromatolite Mound & Thallus Lichen Carpet: Layered sediment crust, organic concentric ridges, apothecia cups
      const matLayers = [
        { cx: centerX, cy: groundY + 1, rx: width * 0.42, ry: height * 0.08, fill: adjustColorBrightness(pigment, -50) },
        { cx: centerX, cy: groundY - 4, rx: width * 0.38, ry: height * 0.07, fill: pigmentDark },
        { cx: centerX + width * 0.03, cy: groundY - 9, rx: width * 0.32, ry: height * 0.065, fill: pigment },
        { cx: centerX - width * 0.04, cy: groundY - 14, rx: width * 0.25, ry: height * 0.055, fill: pigmentVibrant },
        { cx: centerX, cy: groundY - 18, rx: width * 0.17, ry: height * 0.045, fill: pigmentLight },
      ];

      // Fruiting apothecia cups (reproductive discs)
      const cups = [
        { cx: centerX - width * 0.18, cy: groundY - 6, r: 4.5 },
        { cx: centerX + width * 0.14, cy: groundY - 8, r: 5.0 },
        { cx: centerX - width * 0.05, cy: groundY - 16, r: 4.0 },
        { cx: centerX + width * 0.08, cy: groundY - 14, r: 3.5 },
      ];

      floraShapesSvg = `
        <!-- Layered Stromatolite Terraces -->
        ${matLayers.map(l => `
          <ellipse cx="${l.cx}" cy="${l.cy}" rx="${l.rx}" ry="${l.ry}" fill="${l.fill}" stroke="${stipeHighlight}" stroke-width="0.5" />
          <ellipse cx="${l.cx}" cy="${l.cy - l.ry * 0.3}" rx="${l.rx * 0.85}" ry="${l.ry * 0.5}" fill="#ffffff" opacity="0.08" />
        `).join('\n')}

        <!-- Micro-Apothecia Cups -->
        ${cups.map(c => `
          <circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="${stipeBase}" stroke="${stipeHighlight}" stroke-width="0.8" />
          <circle cx="${c.cx}" cy="${c.cy}" r="${c.r * 0.7}" fill="${adjustColorBrightness(pigment, 50)}" />
          <circle cx="${c.cx}" cy="${c.cy}" r="${c.r * 0.3}" fill="#ffffff" opacity="0.85" />
        `).join('\n')}
      `;
      break;
    }

    case 'Kelp': {
      // Pelagic Marine Kelp: Seafloor holdfast, undulating sinuous stipes, buoyant gas bladders, undulating ribbons
      const holdfastW = width * 0.14;
      const kelpNodes = 8;
      let stipeD = `M ${centerX} ${groundY}`;
      const stipePoints: { x: number; y: number }[] = [{ x: centerX, y: groundY }];

      for (let k = 1; k <= kelpNodes; k++) {
        const t = k / kelpNodes;
        const sy = groundY - height * 0.65 * t;
        const wave = Math.sin(t * Math.PI * 3.5) * width * 0.14;
        const sx = centerX + wave;
        stipePoints.push({ x: sx, y: sy });
      }

      // Build smooth path
      for (let p = 1; p < stipePoints.length; p++) {
        const prev = stipePoints[p - 1];
        const curr = stipePoints[p];
        const midY = (prev.y + curr.y) / 2;
        stipeD += ` Q ${prev.x} ${midY} ${curr.x} ${curr.y}`;
      }

      // Pneumatocysts (gas bladders) and ribbons along the stipe
      let bladdersAndRibbons = '';
      for (let b = 1; b < stipePoints.length; b++) {
        const pt = stipePoints[b];
        const side = b % 2 === 0 ? 1 : -1;
        const rLen = width * 0.18 * (1 - (b / kelpNodes) * 0.3);
        const rEnd = pt.x + side * rLen;
        const rMidX = pt.x + side * (rLen * 0.6);
        const rMidY = pt.y - 12;

        bladdersAndRibbons += `
          <!-- Gas Bladder -->
          <circle cx="${pt.x}" cy="${pt.y}" r="3.2" fill="${adjustColorBrightness(pigment, 50)}" stroke="${pigmentDark}" stroke-width="0.8" />
          <circle cx="${pt.x - 0.8}" cy="${pt.y - 0.8}" r="1.0" fill="#ffffff" opacity="0.8" />
          
          <!-- Flowing Ribbon Blade -->
          <path d="M ${pt.x} ${pt.y} Q ${rMidX} ${rMidY} ${rEnd} ${pt.y - 18} Q ${rMidX} ${rMidY - 6} ${pt.x} ${pt.y - 3} Z" fill="url(#${uniqueId}_pigment)" opacity="0.75" />
        `;
      }

      floraShapesSvg = `
        <!-- Subsurface Water Backdrop Caustics -->
        <rect x="0" y="0" width="${width}" height="${height}" fill="url(#${uniqueId}_caustic)" opacity="0.15" />
        
        <!-- Holdfast on Seafloor Rock -->
        <path d="M ${centerX - holdfastW} ${groundY + 4} Q ${centerX} ${groundY - 12} ${centerX + holdfastW} ${groundY + 4} Z" fill="url(#${uniqueId}_stipe)" />
        <path d="M ${centerX - holdfastW * 0.8} ${groundY + 2} Q ${centerX - 5} ${groundY - 6} ${centerX} ${groundY}" stroke="${stipeHighlight}" stroke-width="1.2" fill="none" />
        <path d="M ${centerX + holdfastW * 0.8} ${groundY + 2} Q ${centerX + 5} ${groundY - 6} ${centerX} ${groundY}" stroke="${stipeHighlight}" stroke-width="1.2" fill="none" />

        <!-- Sinuous Stipe -->
        <path d="${stipeD}" stroke="url(#${uniqueId}_stipe)" stroke-width="2.5" fill="none" stroke-linecap="round" />
        
        <!-- Bladders & Ribbons -->
        ${bladdersAndRibbons}
      `;
      break;
    }

    case 'Cap': {
      // Classic Toadstool / Agaric: Fibrous stipe, partial veil (annulus), lamellae gills, convex cap with scales & spore mist
      const capY = height * 0.44;
      const stipeTopW = width * 0.038;
      const stipeBaseW = width * 0.075;
      const capW = width * 0.32;
      const capH = height * 0.17;
      const ringY = groundY - (groundY - capY) * 0.42;

      // Radial gills under cap
      let gills = '';
      const gillCount = 13;
      for (let g = 0; g < gillCount; g++) {
        const t = g / (gillCount - 1);
        const gx = (centerX - capW * 0.88) + t * (capW * 1.76);
        const gy = capY + 3 - Math.sin(t * Math.PI) * 4;
        gills += `<line x1="${centerX}" y1="${capY}" x2="${gx}" y2="${gy}" stroke="${adjustColorBrightness(stipeBase, 30)}" stroke-width="0.8" opacity="0.65" />`;
      }

      // Cap scales/warts
      const warts = [
        { cx: centerX - capW * 0.5, cy: capY - capH * 0.4, r: 2.8 },
        { cx: centerX - capW * 0.22, cy: capY - capH * 0.9, r: 3.5 },
        { cx: centerX + capW * 0.05, cy: capY - capH * 1.05, r: 4.0 },
        { cx: centerX + capW * 0.35, cy: capY - capH * 0.7, r: 3.2 },
        { cx: centerX + capW * 0.58, cy: capY - capH * 0.3, r: 2.5 },
        { cx: centerX - capW * 0.1, cy: capY - capH * 0.5, r: 3.0 },
        { cx: centerX + capW * 0.18, cy: capY - capH * 0.45, r: 2.8 },
      ];

      // Subtle drifting spores
      const spores = [
        { cx: centerX - width * 0.18, cy: capY + 18, r: 1.2 },
        { cx: centerX - width * 0.08, cy: capY + 32, r: 1.0 },
        { cx: centerX + width * 0.12, cy: capY + 22, r: 1.4 },
        { cx: centerX + width * 0.22, cy: capY + 38, r: 1.1 },
        { cx: centerX - width * 0.02, cy: capY + 45, r: 0.9 },
      ];

      floraShapesSvg = `
        <!-- Basal Volva Bulb -->
        <ellipse cx="${centerX}" cy="${groundY}" rx="${stipeBaseW * 1.3}" ry="7" fill="url(#${uniqueId}_stipe)" />
        <ellipse cx="${centerX}" cy="${groundY - 3}" rx="${stipeBaseW * 1.1}" ry="5" fill="${stipeHighlight}" opacity="0.3" />

        <!-- Stipe Stem -->
        <path d="M ${centerX - stipeBaseW} ${groundY} Q ${centerX - stipeTopW * 1.2} ${(groundY + capY) * 0.5} ${centerX - stipeTopW} ${capY} L ${centerX + stipeTopW} ${capY} Q ${centerX + stipeTopW * 1.2} ${(groundY + capY) * 0.5} ${centerX + stipeBaseW} ${groundY} Z" fill="url(#${uniqueId}_stipe)" />
        <path d="M ${centerX - stipeBaseW * 0.3} ${groundY} Q ${centerX} ${(groundY + capY) * 0.5} ${centerX - 1} ${capY}" stroke="${stipeHighlight}" stroke-width="1.0" fill="none" opacity="0.6" />

        <!-- Annulus Veil Ring -->
        <ellipse cx="${centerX}" cy="${ringY}" rx="${stipeTopW * 2.2}" ry="3.5" fill="${stipeHighlight}" stroke="${stipeBase}" stroke-width="0.8" />
        <ellipse cx="${centerX}" cy="${ringY - 1}" rx="${stipeTopW * 1.8}" ry="2.2" fill="${adjustColorBrightness(stipeBase, 40)}" />

        <!-- Sub-Cap Gill Plate Shadow -->
        <path d="M ${centerX - capW * 0.92} ${capY} Q ${centerX} ${capY + capH * 0.35} ${centerX + capW * 0.92} ${capY} Z" fill="#030712" opacity="0.85" />
        ${gills}

        <!-- Pileus Cap Dome -->
        <path d="M ${centerX - capW} ${capY} Q ${centerX} ${capY - capH * 1.65} ${centerX + capW} ${capY} Q ${centerX} ${capY + 3} ${centerX - capW} ${capY} Z" fill="url(#${uniqueId}_pigment)" stroke="${stipeHighlight}" stroke-width="0.8" />
        <!-- Cap Lustrous Highlight -->
        <ellipse cx="${centerX}" cy="${capY - capH * 0.95}" rx="${capW * 0.7}" ry="${capH * 0.45}" fill="${pigmentLight}" opacity="0.25" />

        <!-- Cap Warts & Bioluminescent Scales -->
        ${warts.map(w => `
          <circle cx="${w.cx}" cy="${w.cy}" r="${w.r}" fill="${pigmentLight}" stroke="${pigmentDark}" stroke-width="0.6" />
          <circle cx="${w.cx - 0.7}" cy="${w.cy - 0.7}" r="${w.r * 0.4}" fill="#ffffff" opacity="0.85" />
        `).join('\n')}

        <!-- Falling Micro-Spores -->
        ${spores.map(s => `
          <circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${pigmentLight}" opacity="0.75" />
          <circle cx="${s.cx}" cy="${s.cy}" r="${s.r * 2.5}" fill="${pigmentLight}" opacity="0.2" />
        `).join('\n')}
      `;
      break;
    }

    case 'Bracket': {
      // Polypore Shelf Bracket Conk: Vertical host bark trunk, tiered horizontal semicircular brackets, concentric growth rings
      const hostX = centerX - width * 0.16;
      const hostW = width * 0.14;
      const hostTopY = height * 0.18;

      const shelves = [
        { y: height * 0.34, w: width * 0.32, h: height * 0.08, z: 1.0 },
        { y: height * 0.46, w: width * 0.42, h: height * 0.09, z: 1.1 },
        { y: height * 0.58, w: width * 0.38, h: height * 0.085, z: 0.95 },
        { y: height * 0.70, w: width * 0.28, h: height * 0.075, z: 0.8 },
      ];

      floraShapesSvg = `
        <!-- Host Tree Trunk / Rock Column -->
        <rect x="${hostX - hostW * 0.5}" y="${hostTopY}" width="${hostW}" height="${groundY - hostTopY}" fill="url(#${uniqueId}_stipe)" stroke="${adjustColorBrightness(stipeBase, -40)}" stroke-width="1" />
        <line x1="${hostX - hostW * 0.2}" y1="${hostTopY}" x2="${hostX - hostW * 0.2}" y2="${groundY}" stroke="${stipeHighlight}" stroke-width="1.2" opacity="0.5" />
        <line x1="${hostX + hostW * 0.2}" y1="${hostTopY}" x2="${hostX + hostW * 0.2}" y2="${groundY}" stroke="${adjustColorBrightness(stipeBase, -20)}" stroke-width="1.2" opacity="0.8" />

        <!-- Tiered Shelf Brackets -->
        ${shelves.map(s => {
          const startX = hostX + hostW * 0.45;
          const endX = startX + s.w;
          const midX = (startX + endX) * 0.5;
          return `
            <g>
              <!-- Poroid Under-surface Shadow -->
              <path d="M ${startX} ${s.y + 2} Q ${midX} ${s.y + s.h * 1.2} ${endX} ${s.y + 4} L ${startX} ${s.y + 8} Z" fill="#020617" opacity="0.8" />
              <!-- Semicircular Bracket Shelf Top -->
              <path d="M ${startX} ${s.y} Q ${midX} ${s.y - s.h} ${endX} ${s.y + 2} Q ${midX} ${s.y + s.h * 0.4} ${startX} ${s.y + 4} Z" fill="url(#${uniqueId}_pigment)" stroke="${stipeHighlight}" stroke-width="0.8" />
              <!-- Concentric Growth Zonation Rings -->
              <path d="M ${startX + s.w * 0.2} ${s.y - 1} Q ${midX} ${s.y - s.h * 0.65} ${endX - s.w * 0.15} ${s.y + 1}" stroke="${pigmentLight}" stroke-width="1.0" fill="none" opacity="0.7" />
              <path d="M ${startX + s.w * 0.4} ${s.y} Q ${midX} ${s.y - s.h * 0.35} ${endX - s.w * 0.35} ${s.y + 1}" stroke="${pigmentDark}" stroke-width="1.0" fill="none" opacity="0.8" />
              <!-- Luminous Margin Rim -->
              <path d="M ${startX} ${s.y + 3} Q ${midX} ${s.y + s.h * 0.35} ${endX} ${s.y + 2}" stroke="${pigmentLight}" stroke-width="1.4" fill="none" opacity="0.9" />
            </g>
          `;
        }).join('\n')}
      `;
      break;
    }

    case 'Puffball': {
      // Bulbous Gasteromycete Gleba: Squat sterile stipe, spherical spore chamber, apical ostiole pore, active spore plume
      const baseW = width * 0.16;
      const puffCy = groundY - height * 0.32;
      const puffRx = width * 0.27;
      const puffRy = height * 0.22;
      const ostioleY = puffCy - puffRy * 0.98;

      floraShapesSvg = `
        <!-- Basal Rhizomorph Hyphae Rootlets -->
        <path d="M ${centerX - baseW * 1.5} ${groundY + 3} Q ${centerX - baseW * 0.8} ${groundY - 4} ${centerX} ${groundY} Q ${centerX + baseW * 0.8} ${groundY - 4} ${centerX + baseW * 1.5} ${groundY + 3}" stroke="${stipeHighlight}" stroke-width="1.2" fill="none" />
        
        <!-- Squat Sterile Base -->
        <path d="M ${centerX - baseW} ${groundY} L ${centerX - baseW * 0.8} ${puffCy + puffRy * 0.5} L ${centerX + baseW * 0.8} ${puffCy + puffRy * 0.5} L ${centerX + baseW} ${groundY} Z" fill="url(#${uniqueId}_stipe)" />
        
        <!-- Bulbous Peridium (Spore Chamber) -->
        <ellipse cx="${centerX}" cy="${puffCy}" rx="${puffRx}" ry="${puffRy}" fill="url(#${uniqueId}_pigment)" stroke="${stipeHighlight}" stroke-width="0.8" />
        <!-- Soft Top Illumination Highlight -->
        <ellipse cx="${centerX}" cy="${puffCy - puffRy * 0.35}" rx="${puffRx * 0.72}" ry="${puffRy * 0.6}" fill="${pigmentLight}" opacity="0.3" />

        <!-- Polygonal Tessellated Peridium Scales -->
        <circle cx="${centerX - puffRx * 0.4}" cy="${puffCy - puffRy * 0.2}" r="3.2" fill="${pigmentDark}" opacity="0.5" />
        <circle cx="${centerX + puffRx * 0.35}" cy="${puffCy - puffRy * 0.15}" r="3.0" fill="${pigmentDark}" opacity="0.5" />
        <circle cx="${centerX - puffRx * 0.25}" cy="${puffCy + puffRy * 0.25}" r="3.5" fill="${pigmentDark}" opacity="0.5" />
        <circle cx="${centerX + puffRx * 0.2}" cy="${puffCy + puffRy * 0.3}" r="3.8" fill="${pigmentDark}" opacity="0.5" />

        <!-- Apical Ostiole Rupture Pore -->
        <ellipse cx="${centerX}" cy="${ostioleY}" rx="${width * 0.045}" ry="${height * 0.018}" fill="#020617" stroke="${pigmentLight}" stroke-width="1.2" />

        <!-- Active Spore Plume Eruption Cloud -->
        <ellipse cx="${centerX}" cy="${ostioleY - 14}" rx="8" ry="12" fill="url(#${uniqueId}_plume)" opacity="0.85" />
        <ellipse cx="${centerX}" cy="${ostioleY - 30}" rx="14" ry="18" fill="url(#${uniqueId}_plume)" opacity="0.5" />
        <ellipse cx="${centerX}" cy="${ostioleY - 48}" rx="22" ry="24" fill="url(#${uniqueId}_plume)" opacity="0.25" />
        <!-- Micro-spore particles in plume -->
        <circle cx="${centerX - 4}" cy="${ostioleY - 22}" r="1.2" fill="#ffffff" />
        <circle cx="${centerX + 5}" cy="${ostioleY - 36}" r="1.4" fill="#ffffff" opacity="0.8" />
        <circle cx="${centerX - 7}" cy="${ostioleY - 44}" r="1.0" fill="#ffffff" opacity="0.7" />
      `;
      break;
    }

    case 'Cup': {
      // Pezizoid Apothecia Cup / Chalice: Inverted cone/chalice, concave hymenium lining, glowing inner disc, spore jet sparkles
      const cupTopY = height * 0.35;
      const cupBaseY = height * 0.58;
      const cupW = width * 0.34;
      const stipeW = width * 0.04;

      floraShapesSvg = `
        <!-- Basal Rhizoids -->
        <ellipse cx="${centerX}" cy="${groundY}" rx="${width * 0.1}" ry="5" fill="url(#${uniqueId}_stipe)" />

        <!-- Slender Pedicel Stipe -->
        <path d="M ${centerX - stipeW * 1.4} ${groundY} Q ${centerX - stipeW * 0.8} ${(groundY + cupBaseY) * 0.5} ${centerX - stipeW} ${cupBaseY} L ${centerX + stipeW} ${cupBaseY} Q ${centerX + stipeW * 0.8} ${(groundY + cupBaseY) * 0.5} ${centerX + stipeW * 1.4} ${groundY} Z" fill="url(#${uniqueId}_stipe)" />

        <!-- Chalice Exterior Flesh -->
        <path d="M ${centerX - cupW} ${cupTopY} Q ${centerX - cupW * 0.6} ${cupBaseY} ${centerX} ${cupBaseY + 6} Q ${centerX + cupW * 0.6} ${cupBaseY} ${centerX + cupW} ${cupTopY} Z" fill="url(#${uniqueId}_stipe)" stroke="${stipeHighlight}" stroke-width="0.8" />

        <!-- Concave Inner Hymenium Spore Surface -->
        <ellipse cx="${centerX}" cy="${cupTopY}" rx="${cupW}" ry="${height * 0.11}" fill="url(#${uniqueId}_pigment)" stroke="${pigmentLight}" stroke-width="1.2" />
        <ellipse cx="${centerX}" cy="${cupTopY + 2}" rx="${cupW * 0.85}" ry="${height * 0.08}" fill="${pigmentVibrant}" opacity="0.6" />
        <ellipse cx="${centerX}" cy="${cupTopY + 3}" rx="${cupW * 0.5}" ry="${height * 0.045}" fill="#ffffff" opacity="0.35" />

        <!-- Ascospore Jet Sparkles Emitted Vertically -->
        <line x1="${centerX - 12}" y1="${cupTopY}" x2="${centerX - 18}" y2="${cupTopY - 28}" stroke="${pigmentLight}" stroke-width="0.8" stroke-dasharray="2,3" opacity="0.75" />
        <line x1="${centerX}" y1="${cupTopY}" x2="${centerX}" y2="${cupTopY - 38}" stroke="#ffffff" stroke-width="1.0" stroke-dasharray="2,4" opacity="0.9" />
        <line x1="${centerX + 12}" y1="${cupTopY}" x2="${centerX + 18}" y2="${cupTopY - 26}" stroke="${pigmentLight}" stroke-width="0.8" stroke-dasharray="2,3" opacity="0.75" />
        <circle cx="${centerX}" cy="${cupTopY - 40}" r="2" fill="#ffffff" />
        <circle cx="${centerX - 18}" cy="${cupTopY - 30}" r="1.5" fill="${pigmentLight}" />
        <circle cx="${centerX + 18}" cy="${cupTopY - 28}" r="1.5" fill="${pigmentLight}" />
      `;
      break;
    }

    case 'Coral': {
      // Clavarioid Ramaria / Antler Coral: Densely branched upright stems dividing into vibrant glowing tips
      const bStems = [
        // Left main branch
        `M ${centerX - 10} ${groundY} Q ${centerX - 24} ${groundY - height * 0.2} ${centerX - width * 0.22} ${height * 0.42}`,
        `M ${centerX - width * 0.22} ${height * 0.42} Q ${centerX - width * 0.32} ${height * 0.34} ${centerX - width * 0.34} ${height * 0.24}`,
        `M ${centerX - width * 0.22} ${height * 0.42} Q ${centerX - width * 0.16} ${height * 0.32} ${centerX - width * 0.18} ${height * 0.22}`,
        // Center-left branch
        `M ${centerX - 4} ${groundY} Q ${centerX - 10} ${groundY - height * 0.25} ${centerX - width * 0.08} ${height * 0.38}`,
        `M ${centerX - width * 0.08} ${height * 0.38} Q ${centerX - width * 0.14} ${height * 0.28} ${centerX - width * 0.12} ${height * 0.18}`,
        `M ${centerX - width * 0.08} ${height * 0.38} Q ${centerX - width * 0.02} ${height * 0.26} ${centerX - width * 0.04} ${height * 0.16}`,
        // Center-right branch
        `M ${centerX + 4} ${groundY} Q ${centerX + 10} ${groundY - height * 0.24} ${centerX + width * 0.08} ${height * 0.37}`,
        `M ${centerX + width * 0.08} ${height * 0.37} Q ${centerX + width * 0.03} ${height * 0.26} ${centerX + width * 0.04} ${height * 0.15}`,
        `M ${centerX + width * 0.08} ${height * 0.37} Q ${centerX + width * 0.15} ${height * 0.27} ${centerX + width * 0.14} ${height * 0.19}`,
        // Right main branch
        `M ${centerX + 10} ${groundY} Q ${centerX + 24} ${groundY - height * 0.2} ${centerX + width * 0.22} ${height * 0.43}`,
        `M ${centerX + width * 0.22} ${height * 0.43} Q ${centerX + width * 0.18} ${height * 0.33} ${centerX + width * 0.19} ${height * 0.23}`,
        `M ${centerX + width * 0.22} ${height * 0.43} Q ${centerX + width * 0.32} ${height * 0.33} ${centerX + width * 0.34} ${height * 0.25}`,
      ];

      const tips = [
        { x: centerX - width * 0.34, y: height * 0.24 },
        { x: centerX - width * 0.18, y: height * 0.22 },
        { x: centerX - width * 0.12, y: height * 0.18 },
        { x: centerX - width * 0.04, y: height * 0.16 },
        { x: centerX + width * 0.04, y: height * 0.15 },
        { x: centerX + width * 0.14, y: height * 0.19 },
        { x: centerX + width * 0.19, y: height * 0.23 },
        { x: centerX + width * 0.34, y: height * 0.25 },
      ];

      floraShapesSvg = `
        <!-- Basal Mass -->
        <ellipse cx="${centerX}" cy="${groundY}" rx="${width * 0.14}" ry="8" fill="url(#${uniqueId}_stipe)" />

        <!-- Antler Stems -->
        ${bStems.map(d => `<path d="${d}" stroke="url(#${uniqueId}_pigment)" stroke-width="4.2" stroke-linecap="round" fill="none" />`).join('\n')}
        ${bStems.map(d => `<path d="${d}" stroke="${pigmentLight}" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.6" />`).join('\n')}

        <!-- Glowing Terminal Antler Apices -->
        ${tips.map(tp => `
          <circle cx="${tp.x}" cy="${tp.y}" r="4.5" fill="${pigmentLight}" stroke="${pigmentDark}" stroke-width="0.8" />
          <circle cx="${tp.x}" cy="${tp.y}" r="2.0" fill="#ffffff" />
          <circle cx="${tp.x}" cy="${tp.y}" r="8.0" fill="${pigmentLight}" opacity="0.25" />
        `).join('\n')}
      `;
      break;
    }

    case 'MycelialNet': {
      // Rhizomorph Hyphal Network: Dendritic filaments creeping across substrate, micro-sclerotia nodes, bioluminescent web pulses
      const hyphaePaths = [
        `M ${centerX} ${groundY - 14} Q ${centerX - width * 0.2} ${groundY - 18} ${centerX - width * 0.42} ${groundY + 2}`,
        `M ${centerX - width * 0.2} ${groundY - 18} Q ${centerX - width * 0.3} ${groundY - 32} ${centerX - width * 0.35} ${groundY - 45}`,
        `M ${centerX} ${groundY - 14} Q ${centerX + width * 0.2} ${groundY - 20} ${centerX + width * 0.42} ${groundY + 2}`,
        `M ${centerX + width * 0.18} ${groundY - 20} Q ${centerX + width * 0.28} ${groundY - 34} ${centerX + width * 0.32} ${groundY - 48}`,
        `M ${centerX} ${groundY - 14} Q ${centerX - width * 0.05} ${groundY - 35} ${centerX} ${groundY - 55}`,
        `M ${centerX} ${groundY - 55} Q ${centerX - width * 0.1} ${groundY - 68} ${centerX - width * 0.12} ${groundY - 78}`,
        `M ${centerX} ${groundY - 55} Q ${centerX + width * 0.1} ${groundY - 68} ${centerX + width * 0.12} ${groundY - 78}`,
      ];

      const nodes = [
        { cx: centerX, cy: groundY - 14, r: 6.0 },
        { cx: centerX - width * 0.2, cy: groundY - 18, r: 4.5 },
        { cx: centerX + width * 0.18, cy: groundY - 20, r: 4.8 },
        { cx: centerX - width * 0.35, cy: groundY - 45, r: 3.8 },
        { cx: centerX + width * 0.32, cy: groundY - 48, r: 4.0 },
        { cx: centerX, cy: groundY - 55, r: 5.2 },
        { cx: centerX - width * 0.12, cy: groundY - 78, r: 3.5 },
        { cx: centerX + width * 0.12, cy: groundY - 78, r: 3.5 },
      ];

      floraShapesSvg = `
        <!-- Substrate Ambient Mycelial Glow -->
        <ellipse cx="${centerX}" cy="${groundY}" rx="${width * 0.44}" ry="12" fill="url(#${uniqueId}_plume)" opacity="0.35" />

        <!-- Hyphal Filaments -->
        ${hyphaePaths.map(d => `
          <path d="${d}" stroke="url(#${uniqueId}_stipe)" stroke-width="3.2" fill="none" stroke-linecap="round" />
          <path d="${d}" stroke="${pigmentLight}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.85" />
        `).join('\n')}

        <!-- Micro-Sclerotia Fruiting Nodules -->
        ${nodes.map(n => `
          <g>
            <circle cx="${n.cx}" cy="${n.cy}" r="${n.r * 2.2}" fill="${pigmentLight}" opacity="0.18" />
            <circle cx="${n.cx}" cy="${n.cy}" r="${n.r}" fill="url(#${uniqueId}_pigment)" stroke="${stipeHighlight}" stroke-width="0.8" />
            <circle cx="${n.cx - n.r * 0.25}" cy="${n.cy - n.r * 0.25}" r="${n.r * 0.4}" fill="#ffffff" opacity="0.85" />
          </g>
        `).join('\n')}
      `;
      break;
    }
  }

  // Format height string for scale bar
  const heightStr = species.averageHeightM < 0.1
    ? `${(species.averageHeightM * 100).toFixed(0)}cm`
    : species.averageHeightM >= 1000
    ? `${(species.averageHeightM / 1000).toFixed(1)}km`
    : `${species.averageHeightM.toFixed(1)}m`;

  const scaleBarSvg = showScaleBar ? `
    <!-- Botanical Metric Scale Bar -->
    <g transform="translate(14, ${height - 14})">
      <line x1="0" y1="0" x2="36" y2="0" stroke="#94a3b8" stroke-width="1.2" />
      <line x1="0" y1="-3" x2="0" y2="3" stroke="#94a3b8" stroke-width="1.2" />
      <line x1="36" y1="-3" x2="36" y2="3" stroke="#94a3b8" stroke-width="1.2" />
      <text x="18" y="-4" fill="#cbd5e1" font-size="7" font-family="monospace" text-anchor="middle" font-weight="bold">
        ${heightStr}
      </text>
    </g>
  ` : '';

  const isFungi = 'kingdom' in species && species.kingdom === 'Fungi';
  const labelsSvg = showLabels ? `
    <!-- Field Specimen Taxonomic Stamp -->
    <g transform="translate(12, 16)">
      <text x="0" y="0" fill="${isFungi ? '#f472b6' : '#38bdf8'}" font-size="7.5" font-family="monospace" font-weight="bold" letter-spacing="0.5">
        ${isFungi ? 'MYCOTA' : 'SPECIMEN'} EX-${seed.toString(16).substring(0, 4).toUpperCase()}
      </text>
      <text x="0" y="9" fill="#94a3b8" font-size="7" font-family="sans-serif" font-style="italic">
        ${species.scientificName}
      </text>
    </g>
    <!-- Pigment Chromatic Swatch -->
    <g transform="translate(${width - 20}, 14)">
      <circle cx="0" cy="0" r="5" fill="${pigment}" stroke="#ffffff" stroke-width="1" />
      <circle cx="-1.5" cy="-1.5" r="1.5" fill="#ffffff" opacity="0.7" />
    </g>
  ` : '';

  const gridSvg = showGrid ? `
    <!-- Botanical Reticle Grid -->
    <g stroke="rgba(255,255,255,0.04)" stroke-width="0.8">
      <line x1="${centerX}" y1="12" x2="${centerX}" y2="${height - 12}" stroke-dasharray="2,4" />
      <line x1="12" y1="${height * 0.5}" x2="${width - 12}" y2="${height * 0.5}" stroke-dasharray="2,4" />
      <circle cx="${centerX}" cy="${height * 0.5}" r="${width * 0.38}" fill="none" stroke-dasharray="2,6" />
    </g>
  ` : '';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" className="rounded-xl overflow-hidden select-none">
      <defs>
        <!-- Background Vignette -->
        <radialGradient id="${uniqueId}_bg" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stop-color="#0e1726" />
          <stop offset="60%" stop-color="#080e1a" />
          <stop offset="100%" stop-color="#04070d" />
        </radialGradient>

        <!-- Pigment Gradient -->
        <linearGradient id="${uniqueId}_pigment" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${pigmentLight}" />
          <stop offset="45%" stop-color="${pigment}" />
          <stop offset="100%" stop-color="${pigmentDark}" />
        </linearGradient>

        <!-- Stipe / Trunk Gradient -->
        <linearGradient id="${uniqueId}_stipe" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${stipeHighlight}" />
          <stop offset="50%" stop-color="${stipeBase}" />
          <stop offset="100%" stop-color="${adjustColorBrightness(stipeBase, -30)}" />
        </linearGradient>

        <!-- Plume Radial Gradient (Spire) -->
        <radialGradient id="${uniqueId}_plume" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${pigmentLight}" stop-opacity="0.9" />
          <stop offset="60%" stop-color="${pigment}" stop-opacity="0.4" />
          <stop offset="100%" stop-color="${pigmentDark}" stop-opacity="0" />
        </radialGradient>

        <!-- Caustic Gradient (Kelp) -->
        <linearGradient id="${uniqueId}_caustic" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="50%" stop-color="#0284c7" />
          <stop offset="100%" stop-color="#0369a1" />
        </linearGradient>
      </defs>

      <!-- Plate Backdrop -->
      <rect width="${width}" height="${height}" fill="url(#${uniqueId}_bg)" />
      
      <!-- Reticle Grid -->
      ${gridSvg}

      <!-- Planetary Soil Substrate Horizon -->
      <rect x="0" y="${groundY}" width="${width}" height="${height - groundY}" fill="#090e17" />
      <line x1="0" y1="${groundY}" x2="${width}" y2="${groundY}" stroke="rgba(255,255,255,0.12)" stroke-width="1" />
      <line x1="0" y1="${groundY + 1}" x2="${width}" y2="${groundY + 1}" stroke="${pigment}" stroke-width="0.8" opacity="0.25" />

      <!-- Botanical Plant / Fungal Specimen Anatomy -->
      ${floraShapesSvg}

      <!-- Specimen Labels & Scale Bar -->
      ${scaleBarSvg}
      ${labelsSvg}

      <!-- Specimen Specular Glass Rim -->
      <rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" rx="8" />
    </svg>
  `.trim();
}

/**
 * Encodes procedural SVG as an inline Data URL for <img> tags or CSS backgrounds.
 */
export function getBotanicalDataUrl(
  species: SpecimenSpecies,
  options: BotanicalArtOptions = {}
): string {
  const svg = generateBotanicalSvg(species, options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
