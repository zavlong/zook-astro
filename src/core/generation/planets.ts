import { PRNG } from './prng';
import { SOLAR_FLUX_EARTH } from '../astrophysics/constants';
import {
  PlanetArchetype,
  PlanetPhysicsComputed,
  StellarEvolutionState,
} from '../../types/astrophysics';
import {
  convertZoneBodiesToPlanetArchetypes,
  generateZoneSystem,
} from './realisticStarGen';

/**
 * Synthesizes a realistic multi-planet system using the Steps 5-6 Astrophysical
 * Disk Split (1-2%), 3-Snow-Line Composition, Migration, Greenhouse & Moon Engine.
 */
export function synthesizeMultiPlanetSystem(
  rng: PRNG,
  M0: number,
  starL: number,
  _rInHZ: number,
  _rOutHZ: number,
  metallicityDex: number,
  ageGyr = 4.5
): PlanetArchetype[] {
  const a_in = +Math.max(0.015, 0.055 * Math.sqrt(Math.max(1e-5, starL))).toFixed(4);
  const a_out = +(50.0 * Math.pow(Math.max(0.08, M0), 0.55)).toFixed(2);

  for (let attempt = 0; attempt < 4; attempt++) {
    const zone = generateZoneSystem(
      {
        title: 'Primary Circumstellar Zone',
        mass: M0,
        lum: Math.max(1e-5, starL),
        age: ageGyr,
        feh: metallicityDex,
        a_in,
        a_out,
      },
      rng
    );
    const planets = convertZoneBodiesToPlanetArchetypes(zone, rng);
    if (planets.length > 0) {
      return planets;
    }
  }

  return [];
}

/**
 * Computes instantaneous real-time geophysical telemetry for an exoplanet
 * considering stellar mass loss, luminosity, and photospheric expansion.
 */
export function computePlanetPhysics(
  planet: PlanetArchetype,
  starState: StellarEvolutionState,
  progenitorMass: number
): PlanetPhysicsComputed {
  // 1. Adiabatic Orbital Expansion: a(t) = a0 * (M0 / M*(t))
  const massRatio = progenitorMass / Math.max(0.08, starState.currentMass);
  const currentA = planet.a0 * massRatio;
  planet.currentA = currentA;

  // 2. Orbital Period via Kepler's 3rd Law: P = sqrt(a^3 / M*)
  const periodYrs = Math.sqrt(
    Math.pow(currentA, 3) / Math.max(0.08, starState.currentMass)
  );
  const periodDays = periodYrs * 365.25;

  // 3. Insolation Flux & Equilibrium Temperature
  const eccFactor = Math.sqrt(Math.max(0.01, 1 - planet.ecc * planet.ecc));
  const fluxRatio = starState.L / (currentA * currentA * eccFactor);
  const fluxWm2 = SOLAR_FLUX_EARTH * fluxRatio;

  const teq =
    starState.Teff > 0
      ? 278.5 * Math.pow(fluxRatio, 0.25) * Math.pow(1 - planet.albedo, 0.25)
      : 0;

  // 4. Stellar Engulfment & Shock Check
  let status = planet.status;
  let isEngulfed = false;

  const tsurf = teq + (isEngulfed ? 1500 : planet.greenhouse);

  if (starState.radiusAU >= currentA) {
    isEngulfed = true;
    status = 'Engulfed (Vaporized)';
  } else if (starState.isSupernova && starState.snShockRadiusAU >= currentA) {
    isEngulfed = true;
    status = 'Sterilized (Supernova Shock)';
  } else {
    isEngulfed = false;
    const isHabClass =
      planet.type.includes('Habitable') ||
      (currentA >= starState.rInHZ &&
        currentA <= starState.rOutHZ &&
        (planet.gasFrac || 0) < 0.05 &&
        tsurf >= 250 &&
        tsurf <= 345);
    if (isHabClass && currentA >= starState.rInHZ * 0.75 && currentA <= starState.rOutHZ * 1.35) {
      status = 'Candidate Habitable';
    } else if (currentA < starState.rInHZ) {
      status =
        currentA < starState.rInHZ * 0.4 || teq > 900
          ? 'Scorched'
          : 'Runaway Greenhouse';
    } else if (currentA <= starState.rOutHZ * 1.6) {
      status = 'Cold Desert';
    } else {
      status = 'Deep Frozen';
    }
  }

  planet.isEngulfed = isEngulfed;
  planet.status = status;

  const finalTsurf = isEngulfed ? teq + 1500 : tsurf;
  const tsurfC = Math.round(finalTsurf - 273.15);

  // 5. Surface Gravity (Earth g)
  const gravityG = (planet.massEarth / Math.pow(planet.radiusEarth, 2)).toFixed(2);

  // 6. Tidal locking check (uses Steps 1-6 spinState when available)
  const isTidallyLocked = planet.spinState
    ? planet.spinState.includes('Locked') || planet.spinState.includes('Resonance')
    : currentA < 0.22 * Math.pow(starState.currentMass, 1 / 3);

  return {
    currentA,
    periodDays,
    periodYrs,
    fluxWm2,
    fluxRatio,
    teq: Math.round(teq),
    tsurf: Math.round(finalTsurf),
    tsurfC,
    gravityG,
    isTidallyLocked,
    status,
    isEngulfed,
  };
}

