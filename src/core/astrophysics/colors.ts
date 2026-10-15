import { StarColorData } from '../../types/astrophysics';

/**
 * Maps effective surface temperature (Kelvin) and evolutionary phase
 * to realistic astronomical blackbody color coordinates and visual halos.
 */
export function getStarColorRGB(Teff: number, phase: string): StarColorData {
  if (phase.includes('Black Hole')) {
    return { r: 10, g: 10, b: 20, glow: 'rgba(168, 85, 247, 0.4)', hex: '#000000', cat: 'remnant' };
  }
  if (phase.includes('Neutron Star')) {
    return { r: 180, g: 230, b: 255, glow: 'rgba(140, 220, 255, 0.9)', hex: '#e0f2fe', cat: 'remnant' };
  }
  if (phase.includes('White Dwarf')) {
    return { r: 230, g: 240, b: 255, glow: 'rgba(200, 230, 255, 0.7)', hex: '#f0f9ff', cat: 'remnant' };
  }

  if (Teff < 2600) {
    return { r: 215, g: 25, b: 35, glow: 'rgba(220, 38, 38, 0.75)', hex: '#dc2626', cat: 'km' };
  }
  if (Teff < 3300) {
    return { r: 240, g: 45, b: 35, glow: 'rgba(239, 68, 68, 0.70)', hex: '#ef4444', cat: 'km' };
  }
  if (Teff < 3900) {
    return { r: 255, g: 69, b: 0, glow: 'rgba(255, 69, 0, 0.65)', hex: '#ff4500', cat: 'km' };
  }
  if (Teff < 5200) {
    return { r: 255, g: 160, b: 60, glow: 'rgba(255, 152, 0, 0.50)', hex: '#ff9800', cat: 'km' };
  }
  if (Teff < 6200) {
    return { r: 255, g: 245, b: 180, glow: 'rgba(255, 240, 160, 0.40)', hex: '#fff59d', cat: 'g' };
  }
  if (Teff < 7600) {
    return { r: 245, g: 248, b: 255, glow: 'rgba(240, 245, 255, 0.40)', hex: '#ffffff', cat: 'af' };
  }
  if (Teff < 12000) {
    return { r: 200, g: 225, b: 255, glow: 'rgba(180, 215, 255, 0.55)', hex: '#90caf9', cat: 'af' };
  }
  if (Teff < 30000) {
    return { r: 150, g: 200, b: 255, glow: 'rgba(120, 180, 255, 0.70)', hex: '#42a5f5', cat: 'ob' };
  }
  return { r: 140, g: 220, b: 255, glow: 'rgba(100, 210, 255, 0.85)', hex: '#29b6f6', cat: 'ob' };
}
