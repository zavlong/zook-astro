/**
 * Zook Astro - Star Asset Resolver & Scaling
 * Maps star astrophysics (spectral type, category, mass) to pregenerated cinematic SVG star assets.
 */

export interface StarAssetDescriptor {
  spectralType?: string;
  category?: string;
  mass?: number;
  colorHex?: string;
}

/**
 * Returns the asset path for a star based on its astrophysical classification.
 */
export function getStarAssetPath(star?: StarAssetDescriptor | null): string {
  const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : './';
  if (!star) return `${base}assets/stars/star-g.svg`;

  const cat = (star.category || '').toLowerCase();
  const sp = (star.spectralType || '').trim().toUpperCase();

  // 1. Supermassive Black Hole (SMBH / Galactic Nucleus / Sagittarius A*)
  if (
    cat.includes('supermassive') ||
    sp.includes('SMBH') ||
    (typeof star.mass === 'number' && star.mass > 999999)
  ) {
    return `${base}assets/stars/star-smbh.svg`;
  }

  // 2. Stellar-Mass Black Hole
  if (
    cat.includes('black hole') ||
    sp.includes('BLACK HOLE') ||
    sp === 'BH' ||
    sp.startsWith('BH ') ||
    sp.startsWith('BH(') ||
    sp.includes('/ BH')
  ) {
    return `${base}assets/stars/star-black-hole.svg`;
  }

  // 3. Neutron Star / Pulsar
  if (
    cat.includes('neutron') ||
    cat.includes('pulsar') ||
    sp.includes('NEUTRON') ||
    sp.includes('PULSAR') ||
    sp === 'NS'
  ) {
    return `${base}assets/stars/star-neutron.svg`;
  }

  // 4. White Dwarf (Degenerate Core)
  if (
    cat.includes('white dwarf') ||
    sp.includes('WHITE DWARF') ||
    sp.startsWith('D') ||
    sp.startsWith('WD') ||
    sp.includes('DWARF (D')
  ) {
    return `${base}assets/stars/star-white-dwarf.svg`;
  }

  // 5. Brown Dwarf (L, T, Y sub-stellar dwarf)
  if (
    cat.includes('brown dwarf') ||
    sp.startsWith('L') ||
    sp.startsWith('T') ||
    sp.startsWith('Y')
  ) {
    return `${base}assets/stars/star-dwarf.svg`;
  }

  // 6. Harvard Spectral Classification: O, B, A, F, G, K, M
  if (sp.startsWith('O')) return `${base}assets/stars/star-o.svg`;
  if (sp.startsWith('B')) return `${base}assets/stars/star-b.svg`;
  if (sp.startsWith('A')) return `${base}assets/stars/star-a.svg`;
  if (sp.startsWith('F')) return `${base}assets/stars/star-f.svg`;
  if (sp.startsWith('G')) return `${base}assets/stars/star-g.svg`;
  if (sp.startsWith('K')) return `${base}assets/stars/star-k.svg`;
  if (sp.startsWith('M')) return `${base}assets/stars/star-m.svg`;

  // Fallback based on star colorHex if spectralType was unspecified
  const col = (star.colorHex || '').toLowerCase();
  if (col.includes('93c5fd') || col.includes('60a5fa') || col.includes('3b82f6') || col.includes('2563eb')) {
    return `${base}assets/stars/star-b.svg`;
  }
  if (col.includes('f87171') || col.includes('ef4444') || col.includes('dc2626') || col.includes('b91c1c')) {
    return `${base}assets/stars/star-m.svg`;
  }
  if (col.includes('fb923c') || col.includes('f97316') || col.includes('ea580c')) {
    return `${base}assets/stars/star-k.svg`;
  }

  // Default Solar G-type
  return `${base}assets/stars/star-g.svg`;
}
