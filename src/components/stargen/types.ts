import {
  RealisticBeltBody,
  RealisticPlanetBody,
  RealisticPlanetaryZone,
  RealisticStarSystemResult,
  STARGEN_BENCHMARK_PRESETS,
  StarGenParams,
} from '../../core/generation/realisticStarGen';
import {
  RealisticBinarySplit,
  RealisticMoon,
  RealisticStarNode,
  RealisticMagneticField,
  StarSystem,
} from '../../types/astrophysics';
import { ArchitectSystem } from '../../types/architect';

export type {
  RealisticBeltBody,
  RealisticPlanetBody,
  RealisticPlanetaryZone,
  RealisticStarSystemResult,
  StarGenParams,
  RealisticBinarySplit,
  RealisticMoon,
  RealisticStarNode,
  RealisticMagneticField,
  StarSystem,
  ArchitectSystem,
};

export { STARGEN_BENCHMARK_PRESETS };

export interface RealisticStarGenAppProps {
  onOpenInArchitect: (archSystem: ArchitectSystem) => void;
  onInspectInSector3D?: (starSystem: StarSystem) => void;
}

export type SelectedMapEntity =
  | {
      kind: 'planet';
      zoneIdx: number;
      bodyIdx: number;
    }
  | {
      kind: 'moon';
      zoneIdx: number;
      bodyIdx: number;
      moonIdx: number;
    }
  | {
      kind: 'belt';
      zoneIdx: number;
      bodyIdx: number;
    }
  | {
      kind: 'star';
      starIdx: number;
    }
  | {
      kind: 'split';
      splitIdx: number;
    };

export interface Vec2AU {
  x: number;
  y: number;
  z?: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export function log10(x: number): number {
  return Math.log(Math.max(1e-12, x)) / Math.LN10;
}

export function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

export function shortClassLabel(fullClass: string): string {
  if (fullClass.includes('Hot Jupiter')) return 'Hot Jupiter';
  if (fullClass.includes('Class I')) return 'Class I Giant';
  if (fullClass.includes('Class II')) return 'Class II Giant';
  if (fullClass.includes('Class III')) return 'Class III Giant';
  if (fullClass.includes('Class IV')) return 'Class IV Giant';
  if (fullClass.includes('Class V')) return 'Class V Giant';
  if (fullClass.includes('Ice Giant')) return 'Ice Giant';
  if (fullClass.includes('Neptune')) return fullClass.includes('Hot') ? 'Hot Neptune' : 'Warm Neptune';
  if (fullClass.includes('Gas Dwarf')) return 'Sub-Neptune';

  return fullClass.replace(/^Sudarsky\s+/i, '').split('(')[0].trim();
}

export function shortMoonLabel(moonClass: string): string {
  const clean = moonClass.replace(/^Sudarsky\s+/i, '').split('(')[0].trim();
  if (clean.endsWith('Moon')) return clean;
  if (moonClass.includes('Volcanic')) return 'Volcanic Moon';
  if (moonClass.includes('Aquatic')) return 'Aquatic Moon';
  if (moonClass.includes('Carbonic')) return 'Carbonic Moon';
  if (moonClass.includes('Sulfurous')) return 'Sulfurous Moon';
  if (moonClass.includes('Ammonia')) return 'Ammonia Moon';
  if (moonClass.includes('Methane')) return 'Methane Moon';
  if (moonClass.includes('Sulfuric')) return 'Sulfuric Moon';
  return clean || 'Moon';
}
