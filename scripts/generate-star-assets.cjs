const fs = require('fs');
const path = require('path');

const targetDir = path.resolve(__dirname, '..', 'public', 'assets', 'stars');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Helper to wrap SVG in standard 100x100 centered viewBox
function createStarSvg(id, content) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100">
  <defs>
    <radialGradient id="${id}-corona" cx="0%" cy="0%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
      <stop offset="25%" stop-color="var(--c-inner)" stop-opacity="0.9" />
      <stop offset="60%" stop-color="var(--c-mid)" stop-opacity="0.45" />
      <stop offset="90%" stop-color="var(--c-outer)" stop-opacity="0.15" />
      <stop offset="100%" stop-color="var(--c-outer)" stop-opacity="0" />
    </radialGradient>
  </defs>
  ${content}
</svg>`;
}

const starAssets = {
  // 1. O-type (Hot Blue Supergiant / Hypergiant)
  'star-o.svg': `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100">
  <defs>
    <radialGradient id="o-glow" cx="0" cy="0" r="50" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
      <stop offset="22%" stop-color="#93c5fd" stop-opacity="0.95" />
      <stop offset="48%" stop-color="#3b82f6" stop-opacity="0.55" />
      <stop offset="78%" stop-color="#1d4ed8" stop-opacity="0.22" />
      <stop offset="100%" stop-color="#1e3a8a" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="o-core" cx="0" cy="0" r="16" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="65%" stop-color="#dbeafe" />
      <stop offset="100%" stop-color="#60a5fa" />
    </radialGradient>
  </defs>
  <!-- Volumetric Corona Bloom -->
  <circle cx="0" cy="0" r="48" fill="url(#o-glow)" />
  <!-- 4-Point Optical Diffraction Spikes -->
  <path d="M -46 0 Q 0 -1.5 46 0 Q 0 1.5 -46 0 Z" fill="#93c5fd" opacity="0.75" />
  <path d="M 0 -46 Q -1.5 0 0 46 Q 1.5 0 0 -46 Z" fill="#93c5fd" opacity="0.75" />
  <!-- Diagonal subtle spikes -->
  <path d="M -24 -24 Q 0 0 24 24 Q 0 0 -24 -24 Z" fill="#bfdbfe" opacity="0.35" />
  <path d="M 24 -24 Q 0 0 -24 24 Q 0 0 24 -24 Z" fill="#bfdbfe" opacity="0.35" />
  <!-- Dense Photosphere Core -->
  <circle cx="0" cy="0" r="16" fill="url(#o-core)" />
  <circle cx="0" cy="0" r="9" fill="#ffffff" />
</svg>`,

  // 2. B-type (Luminous Blue Star)
  'star-b.svg': `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100">
  <defs>
    <radialGradient id="b-glow" cx="0" cy="0" r="48" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
      <stop offset="25%" stop-color="#bfdbfe" stop-opacity="0.92" />
      <stop offset="52%" stop-color="#60a5fa" stop-opacity="0.50" />
      <stop offset="80%" stop-color="#2563eb" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#1d4ed8" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="b-core" cx="0" cy="0" r="15" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="70%" stop-color="#eff6ff" />
      <stop offset="100%" stop-color="#93c5fd" />
    </radialGradient>
  </defs>
  <circle cx="0" cy="0" r="46" fill="url(#b-glow)" />
  <!-- 4-Point Diffraction Flare -->
  <path d="M -38 0 Q 0 -1.2 38 0 Q 0 1.2 -38 0 Z" fill="#bfdbfe" opacity="0.70" />
  <path d="M 0 -38 Q -1.2 0 0 38 Q 1.2 0 0 -38 Z" fill="#bfdbfe" opacity="0.70" />
  <circle cx="0" cy="0" r="15" fill="url(#b-core)" />
  <circle cx="0" cy="0" r="8" fill="#ffffff" />
</svg>`,

  // 3. A-type (Pure Diamond White Star)
  'star-a.svg': `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100">
  <defs>
    <radialGradient id="a-glow" cx="0" cy="0" r="46" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
      <stop offset="30%" stop-color="#f0f9ff" stop-opacity="0.88" />
      <stop offset="58%" stop-color="#bae6fd" stop-opacity="0.45" />
      <stop offset="84%" stop-color="#38bdf8" stop-opacity="0.14" />
      <stop offset="100%" stop-color="#0284c7" stop-opacity="0" />
    </radialGradient>
  </defs>
  <circle cx="0" cy="0" r="45" fill="url(#a-glow)" />
  <!-- Crisp Diamond Cross Flare -->
  <path d="M -32 0 Q 0 -1.0 32 0 Q 0 1.0 -32 0 Z" fill="#e0f2fe" opacity="0.75" />
  <path d="M 0 -32 Q -1.0 0 0 32 Q 1.0 0 0 -32 Z" fill="#e0f2fe" opacity="0.75" />
  <circle cx="0" cy="0" r="14" fill="#ffffff" />
  <circle cx="0" cy="0" r="13" stroke="#e0f2fe" stroke-width="0.8" fill="#ffffff" />
</svg>`,

  // 4. F-type (Warm White / Pastel Yellow)
  'star-f.svg': `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100">
  <defs>
    <radialGradient id="f-glow" cx="0" cy="0" r="46" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
      <stop offset="30%" stop-color="#fef9c3" stop-opacity="0.85" />
      <stop offset="60%" stop-color="#fde047" stop-opacity="0.42" />
      <stop offset="86%" stop-color="#eab308" stop-opacity="0.12" />
      <stop offset="100%" stop-color="#ca8a04" stop-opacity="0" />
    </radialGradient>
  </defs>
  <circle cx="0" cy="0" r="44" fill="url(#f-glow)" />
  <!-- Subtle warm glare -->
  <path d="M -26 0 Q 0 -0.8 26 0 Q 0 0.8 -26 0 Z" fill="#fef08a" opacity="0.65" />
  <path d="M 0 -26 Q -0.8 0 0 26 Q 0.8 0 0 -26 Z" fill="#fef08a" opacity="0.65" />
  <circle cx="0" cy="0" r="14" fill="#fefce8" stroke="#ffffff" stroke-width="0.7" />
  <circle cx="0" cy="0" r="7" fill="#ffffff" />
</svg>`,

  // 5. G-type (Solar-Type Yellow Star)
  'star-g.svg': `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100">
  <defs>
    <radialGradient id="g-glow" cx="0" cy="0" r="48" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#fffbeb" stop-opacity="1" />
      <stop offset="26%" stop-color="#fde047" stop-opacity="0.88" />
      <stop offset="55%" stop-color="#f59e0b" stop-opacity="0.48" />
      <stop offset="84%" stop-color="#d97706" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#b45309" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="g-core" cx="0" cy="0" r="14" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="45%" stop-color="#fef08a" />
      <stop offset="100%" stop-color="#facc15" />
    </radialGradient>
  </defs>
  <circle cx="0" cy="0" r="46" fill="url(#g-glow)" />
  <!-- Solar flare spikes -->
  <path d="M -24 0 Q 0 -0.7 24 0 Q 0 0.7 -24 0 Z" fill="#fef08a" opacity="0.55" />
  <path d="M 0 -24 Q -0.7 0 0 24 Q 0.7 0 0 -24 Z" fill="#fef08a" opacity="0.55" />
  <circle cx="0" cy="0" r="14" fill="url(#g-core)" stroke="#fef9c3" stroke-width="0.8" />
  <circle cx="0" cy="0" r="6" fill="#ffffff" />
</svg>`,

  // 6. K-type (Orange Dwarf / Giant)
  'star-k.svg': `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100">
  <defs>
    <radialGradient id="k-glow" cx="0" cy="0" r="48" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#fff7ed" stop-opacity="1" />
      <stop offset="28%" stop-color="#fed7aa" stop-opacity="0.86" />
      <stop offset="56%" stop-color="#fb923c" stop-opacity="0.50" />
      <stop offset="82%" stop-color="#ea580c" stop-opacity="0.16" />
      <stop offset="100%" stop-color="#c2410c" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="k-core" cx="0" cy="0" r="14" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#fff7ed" />
      <stop offset="50%" stop-color="#fdba74" />
      <stop offset="100%" stop-color="#f97316" />
    </radialGradient>
  </defs>
  <circle cx="0" cy="0" r="45" fill="url(#k-glow)" />
  <circle cx="0" cy="0" r="14" fill="url(#k-core)" stroke="#fed7aa" stroke-width="0.8" />
  <circle cx="0" cy="0" r="5" fill="#ffffff" />
</svg>`,

  // 7. M-type (Red Dwarf / Red Supergiant)
  'star-m.svg': `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100">
  <defs>
    <radialGradient id="m-glow" cx="0" cy="0" r="48" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#fef2f2" stop-opacity="1" />
      <stop offset="25%" stop-color="#fca5a5" stop-opacity="0.88" />
      <stop offset="56%" stop-color="#ef4444" stop-opacity="0.52" />
      <stop offset="82%" stop-color="#b91c1c" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#7f1d1d" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="m-core" cx="0" cy="0" r="14" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#fff1f2" />
      <stop offset="50%" stop-color="#f87171" />
      <stop offset="100%" stop-color="#dc2626" />
    </radialGradient>
  </defs>
  <circle cx="0" cy="0" r="46" fill="url(#m-glow)" />
  <circle cx="0" cy="0" r="14" fill="url(#m-core)" stroke="#fca5a5" stroke-width="0.75" />
  <circle cx="0" cy="0" r="5" fill="#ffffff" />
</svg>`,

  // 8. Brown Dwarf (L, T, Y sub-stellar dwarf)
  'star-dwarf.svg': `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100">
  <defs>
    <radialGradient id="dwarf-glow" cx="0" cy="0" r="42" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#f5d0fe" stop-opacity="0.85" />
      <stop offset="35%" stop-color="#a855f7" stop-opacity="0.45" />
      <stop offset="70%" stop-color="#6b21a8" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#3b0764" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="dwarf-core" cx="0" cy="0" r="11" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#e9d5ff" />
      <stop offset="50%" stop-color="#9333ea" />
      <stop offset="100%" stop-color="#581c87" />
    </radialGradient>
  </defs>
  <circle cx="0" cy="0" r="38" fill="url(#dwarf-glow)" />
  <circle cx="0" cy="0" r="11" fill="url(#dwarf-core)" stroke="#d8b4fe" stroke-width="0.7" />
  <circle cx="0" cy="0" r="3.5" fill="#f3e8ff" />
</svg>`,

  // 9. White Dwarf (Degenerate Stellar Core)
  'star-white-dwarf.svg': `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100">
  <defs>
    <radialGradient id="wd-glow" cx="0" cy="0" r="42" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
      <stop offset="28%" stop-color="#e0e7ff" stop-opacity="0.85" />
      <stop offset="60%" stop-color="#818cf8" stop-opacity="0.38" />
      <stop offset="100%" stop-color="#4338ca" stop-opacity="0" />
    </radialGradient>
  </defs>
  <circle cx="0" cy="0" r="38" fill="url(#wd-glow)" />
  <!-- Diamond Cross Pinpoint -->
  <path d="M -30 0 L 30 0" stroke="#c7d2fe" stroke-width="0.8" opacity="0.85" />
  <path d="M 0 -30 L 0 30" stroke="#c7d2fe" stroke-width="0.8" opacity="0.85" />
  <circle cx="0" cy="0" r="9" fill="#ffffff" stroke="#c7d2fe" stroke-width="0.8" />
  <circle cx="0" cy="0" r="5" fill="#ffffff" />
</svg>`,

  // 10. Neutron Star / Pulsar
  'star-neutron.svg': `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100">
  <defs>
    <radialGradient id="ns-glow" cx="0" cy="0" r="45" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
      <stop offset="25%" stop-color="#a5f3fc" stop-opacity="0.9" />
      <stop offset="55%" stop-color="#06b6d4" stop-opacity="0.55" />
      <stop offset="85%" stop-color="#0891b2" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#164e63" stop-opacity="0" />
    </radialGradient>
  </defs>
  <circle cx="0" cy="0" r="44" fill="url(#ns-glow)" />
  <!-- Relativistic Magnetic Jet Cones -->
  <path d="M 0 -44 L 2.5 -12 L -2.5 -12 Z" fill="#67e8f9" opacity="0.80" />
  <path d="M 0 44 L 2.5 12 L -2.5 12 Z" fill="#67e8f9" opacity="0.80" />
  <!-- Magnetic Field Ring -->
  <ellipse cx="0" cy="0" rx="20" ry="6.5" fill="none" stroke="#67e8f9" stroke-width="0.9" opacity="0.75" transform="rotate(-25)" />
  <circle cx="0" cy="0" r="8.5" fill="#ffffff" stroke="#22d3ee" stroke-width="1.2" />
</svg>`,

  // 11. Stellar Black Hole (Accretion Disc + Singularity Void)
  'star-black-hole.svg': `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100">
  <defs>
    <radialGradient id="bh-glow" cx="0" cy="0" r="48" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#c084fc" stop-opacity="0.85" />
      <stop offset="40%" stop-color="#a855f7" stop-opacity="0.50" />
      <stop offset="75%" stop-color="#6b21a8" stop-opacity="0.20" />
      <stop offset="100%" stop-color="#3b0764" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="bh-torus" x1="-1" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f472b6" />
      <stop offset="35%" stop-color="#c084fc" />
      <stop offset="70%" stop-color="#9333ea" />
      <stop offset="100%" stop-color="#6b21a8" />
    </linearGradient>
  </defs>
  <!-- Atmospheric Torus Glow -->
  <circle cx="0" cy="0" r="46" fill="url(#bh-glow)" />
  <!-- Relativistic Lensed Outer Accretion Disc -->
  <ellipse cx="0" cy="0" rx="36" ry="14" fill="none" stroke="url(#bh-torus)" stroke-width="3.5" opacity="0.85" transform="rotate(-18)" />
  <ellipse cx="0" cy="0" rx="26" ry="9.5" fill="none" stroke="#f3e8ff" stroke-width="1.8" opacity="0.92" transform="rotate(-18)" />
  <!-- Gravitationally Bent Lensing Arc Behind Hole -->
  <path d="M -22 -6 A 22 18 0 0 1 22 -6" fill="none" stroke="#e879f9" stroke-width="2.2" opacity="0.85" />
  <!-- Event Horizon & Photon Sphere (Pure Black Singularity Void) -->
  <circle cx="0" cy="0" r="12" fill="#000000" stroke="#f3e8ff" stroke-width="1.4" />
</svg>`,

  // 12. Supermassive Black Hole (Sagittarius A* Galactic Center Engine)
  'star-smbh.svg': `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="100" height="100">
  <defs>
    <radialGradient id="smbh-glow" cx="0" cy="0" r="50" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.9" />
      <stop offset="35%" stop-color="#a855f7" stop-opacity="0.65" />
      <stop offset="70%" stop-color="#4c1d95" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="smbh-ring" x1="-1" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="25%" stop-color="#f43f5e" />
      <stop offset="60%" stop-color="#c084fc" />
      <stop offset="100%" stop-color="#7e22ce" />
    </linearGradient>
  </defs>
  <!-- Huge Relativistic Thermal Envelope -->
  <circle cx="0" cy="0" r="49" fill="url(#smbh-glow)" />
  <!-- Relativistic Doppler-Boosted Outer Accretion Torus -->
  <ellipse cx="0" cy="0" rx="42" ry="17" fill="none" stroke="url(#smbh-ring)" stroke-width="4.5" opacity="0.92" transform="rotate(-22)" />
  <ellipse cx="0" cy="0" rx="30" ry="11" fill="none" stroke="#fff1f2" stroke-width="2.4" opacity="0.96" transform="rotate(-22)" />
  <!-- Strong Gravitational Lensing Halo (Einstein Ring) -->
  <circle cx="0" cy="0" r="20" fill="none" stroke="#fb7185" stroke-width="2.5" opacity="0.80" />
  <!-- Supermassive Event Horizon (Absolute Singularity Void) -->
  <circle cx="0" cy="0" r="14.5" fill="#000000" stroke="#fecdd3" stroke-width="1.8" />
</svg>`
};

for (const [filename, svg] of Object.entries(starAssets)) {
  const filepath = path.join(targetDir, filename);
  fs.writeFileSync(filepath, svg, 'utf-8');
  console.log(`Generated star asset: ${filepath} (${svg.length} bytes)`);
}

console.log('All 12 star assets generated successfully!');
