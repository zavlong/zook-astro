const fs = require('fs');
const path = require('path');

const hexRadius = 26;
const hexWidth = Math.sqrt(3) * hexRadius; // ~45.033321
const hexHeight = 2 * hexRadius; // 52
const colSpacing = hexWidth;
const rowSpacing = 1.5 * hexRadius; // 39
const columns = 50;
const rows = 50;

const totalW = Math.round(columns * colSpacing + hexWidth + 80);
const totalH = Math.round(rows * rowSpacing + hexHeight + 80);

let pathD = '';

for (let r = 1; r <= rows; r++) {
  const xOffset = r % 2 === 1 ? hexWidth * 0.5 : 0;
  const cy = (r - 1) * rowSpacing + hexRadius + 40;
  for (let c = 1; c <= columns; c++) {
    const cx = (c - 1) * colSpacing + hexRadius + xOffset + 40;

    let hexD = '';
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const vx = (cx + hexRadius * Math.cos(angle)).toFixed(2);
      const vy = (cy + hexRadius * Math.sin(angle)).toFixed(2);
      if (i === 0) {
        hexD += `M${vx},${vy}`;
      } else {
        hexD += ` L${vx},${vy}`;
      }
    }
    hexD += ' Z ';
    pathD += hexD;
  }
}

const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
  <defs>
    <filter id="hexGlow" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="1.5" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <g fill="none" stroke-linejoin="round" stroke-linecap="round">
    <!-- Subtle Atmospheric Glow Underlay -->
    <path d="${pathD}" stroke="rgba(56, 189, 248, 0.16)" stroke-width="2.5" />
    <!-- Crisp Semi-Translucent Hex Lattice Border Line -->
    <path d="${pathD}" stroke="rgba(226, 232, 240, 0.30)" stroke-width="1.0" />
  </g>
</svg>
`;

const publicDir = path.resolve(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const outputPath = path.join(publicDir, 'hex-grid-50x50.svg');
fs.writeFileSync(outputPath, svgContent, 'utf-8');

console.log(`Generated ${outputPath} (${svgContent.length} bytes, ${totalW}x${totalH})`);
