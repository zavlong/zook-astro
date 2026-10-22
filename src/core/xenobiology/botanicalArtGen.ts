/**
 * Procedural Botanical Illustration & Xenoflora Specimen Art Generator
 * 
 * Generates deterministic, high-fidelity botanical specimen portraits (vector SVG)
 * for extraterrestrial plant species based on their morphological form category,
 * photosynthetic pigments, structural polymers, and astrophysical scaling.
 */

import { XenofloraSpecies, PlantFormCategory } from './floraGen';

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
  if (lower.includes('fluoro') || lower.includes('chitin')) {
    return { stipeBase: '#292524', stipeHighlight: '#78716c' };
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
  species: XenofloraSpecies,
  options: BotanicalArtOptions = {}
): string {
  const width = options.width || 240;
  const height = options.height || 240;
  const showScaleBar = options.showScaleBar ?? true;
  const showGrid = options.showGrid ?? true;
  const showLabels = options.showLabels ?? true;

  const seed = hashString(species.id + species.scientificName);

  const formCategory: PlantFormCategory = (species.formCategory as PlantFormCategory) || 'Tree';
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

  const labelsSvg = showLabels ? `
    <!-- Field Specimen Taxonomic Stamp -->
    <g transform="translate(12, 16)">
      <text x="0" y="0" fill="#38bdf8" font-size="7.5" font-family="monospace" font-weight="bold" letter-spacing="0.5">
        SPECIMEN EX-${seed.toString(16).substring(0, 4).toUpperCase()}
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

      <!-- Botanical Plant Specimen Anatomy -->
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
  species: XenofloraSpecies,
  options: BotanicalArtOptions = {}
): string {
  const svg = generateBotanicalSvg(species, options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
