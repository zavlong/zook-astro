import { PRNG } from './prng';
import { sampleIMF } from './imf';
import { sampleCoordinates } from './morphology';
import { synthesizeMultiPlanetSystem } from './planets';
import {
  convertZoneBodiesToPlanetArchetypes,
  runRealisticGenerator,
} from './realisticStarGen';
import {
  calculateMSLifetimeGyr,
  calculateStellarEvolution,
} from '../astrophysics/evolution';
import { getStarColorRGB } from '../astrophysics/colors';
import { SectorConfiguration, StarSystem } from '../../types/astrophysics';

/**
 * Generates an entire sector of stars with physical attributes,
 * realistic ages, evolutionary tracks, and Steps 1-6 astrophysical architectures.
 */
export function generateSectorStars(config: SectorConfiguration): StarSystem[] {
  const rng = new PRNG(config.seed);
  const stars: StarSystem[] = [];

  for (let i = 0; i < config.starCount; i++) {
    const id = i + 1;
    const name = `SEC-${String(id).padStart(4, '0')}`;
    const coords = sampleCoordinates(rng, config.morphology, config.radiusLy);
    const progenitorMass = sampleIMF(rng);

    let starAgeGyr = rng.nextGaussian(config.meanAgeGyr, config.ageSigmaGyr);
    starAgeGyr = Math.max(0.02, Math.min(13.2, starAgeGyr));

    // Run Steps 1-6 Astrophysical Hierarchy & Planetary System Engine
    const stargenRes = runRealisticGenerator(
      {
        sysMass: +progenitorMass.toFixed(3),
        age: +starAgeGyr.toFixed(2),
        feh: +config.metallicityDex.toFixed(2),
        forcedMult: 'auto',
      },
      rng
    );

    const primaryMass = Math.max(
      0.08,
      stargenRes.hierarchy.stars[0]?.mass || progenitorMass
    );

    const tMS_Gyr = calculateMSLifetimeGyr(primaryMass);
    let progressPct = (starAgeGyr / tMS_Gyr) * 50.0;
    if (progressPct > 100.0) progressPct = 100.0;

    const starState = calculateStellarEvolution(primaryMass, progressPct);
    const colorData = getStarColorRGB(starState.Teff, starState.phase);

    const primaryZone = stargenRes.zones[0];
    let planets = primaryZone
      ? convertZoneBodiesToPlanetArchetypes(primaryZone, rng)
      : [];

    if (planets.length === 0) {
      planets = synthesizeMultiPlanetSystem(
        rng,
        primaryMass,
        starState.L,
        starState.rInHZ,
        starState.rOutHZ,
        config.metallicityDex,
        starAgeGyr
      );
    }

    const hasHZPlanet = planets.some(
      (p) =>
        (p.a0 >= starState.rInHZ && p.a0 <= starState.rOutHZ) ||
        p.type.includes('Habitable')
    );

    stars.push({
      id,
      name,
      x: coords.x,
      y: coords.y,
      z: coords.z,
      progenitorMass: primaryMass,
      starAgeGyr,
      progressPct,
      starState,
      colorData,
      planets,
      hasHZPlanet,
      metallicityDex: config.metallicityDex,
      systemArchName: stargenRes.hierarchy.archName,
      zoneArchetype: primaryZone?.archetype || 'A',
      diskMassEarth: primaryZone?.diskMassEarth || 0,
      companionStars: stargenRes.hierarchy.stars.slice(1),
      binarySplits: stargenRes.hierarchy.splits,
    });
  }

  return stars;
}

