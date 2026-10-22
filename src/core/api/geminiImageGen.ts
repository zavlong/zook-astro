/**
 * Gemini / Imagen 3 API Service & Planetary Prompt Synthesizer
 * 
 * Generates scientifically grounded image generation prompts from:
 * - Planetary surface telemetry, biome composition, sky color, and host star lighting
 * - Xenobiology species taxonomy, pigments, morphology, and adaptations
 * 
 * Connects directly to Google's Imagen 3 API (imagen-3.0-generate-002) via Google AI Studio.
 */

import { SpecimenSpecies } from '../xenobiology/botanicalArtGen';

export type SpeciesImageStyle = 'botanical-plate' | 'photorealistic-field';
export type SurfaceImageStyle = 'landscape-16-9' | 'first-person-4-3' | 'orbital-panoramic';

export interface GeminiImageGenOptions {
  apiKey?: string;
  aspectRatio?: '1:1' | '16:9' | '4:3' | '3:4' | '9:16';
  sampleCount?: number;
  outputMimeType?: 'image/jpeg' | 'image/png';
}

export interface GeminiImageResult {
  imageUrl: string; // Base64 data URL
  mimeType: string;
  prompt: string;
  durationMs: number;
}

const API_KEY_STORAGE_KEY = 'zook_gemini_api_key';

/**
 * Retrieves the currently saved Gemini API Key.
 * Checks localStorage first, then Vite environment variable VITE_GEMINI_API_KEY.
 */
export function getStoredApiKey(): string {
  try {
    const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored && stored.trim().length > 0) {
      return stored.trim();
    }
  } catch {
    // LocalStorage might be disabled or unavailable
  }

  // Fallback to Vite env variable if provided during build/runtime
  return (import.meta.env.VITE_GEMINI_API_KEY as string) || '';
}

/**
 * Saves or updates the user's Gemini API key in browser local storage.
 */
export function setStoredApiKey(key: string): void {
  try {
    if (!key || key.trim().length === 0) {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    } else {
      localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
    }
  } catch (err) {
    console.warn('Failed to save Gemini API key to localStorage', err);
  }
}

/**
 * Clears the stored Gemini API key.
 */
export function clearStoredApiKey(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear Gemini API key from localStorage', err);
  }
}

/**
 * In-memory image cache to prevent redundant API charges for identical prompts.
 */
const imageResultCache = new Map<string, GeminiImageResult>();

/**
 * Calls Google's Imagen 3 model via Google AI Studio's Gemini REST API.
 */
export async function generateGeminiImage(
  prompt: string,
  options: GeminiImageGenOptions = {}
): Promise<GeminiImageResult> {
  const apiKey = (options.apiKey || getStoredApiKey()).trim();

  if (!apiKey) {
    throw new Error(
      'Missing Gemini API key. Please provide your Google AI Studio API key in the settings field.'
    );
  }

  const aspectRatio = options.aspectRatio || '1:1';
  const sampleCount = options.sampleCount || 1;
  const outputMimeType = options.outputMimeType || 'image/jpeg';

  const cacheKey = `${prompt.trim()}_${aspectRatio}_${outputMimeType}`;
  if (imageResultCache.has(cacheKey)) {
    return imageResultCache.get(cacheKey)!;
  }

  const startTime = Date.now();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${encodeURIComponent(
    apiKey
  )}`;

  const requestPayload = {
    instances: [
      {
        prompt: prompt.trim(),
      },
    ],
    parameters: {
      sampleCount,
      aspectRatio,
      outputMimeType,
      personGeneration: 'ALLOW_ADULT',
    },
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });
  } catch (netErr: unknown) {
    const msg = netErr instanceof Error ? netErr.message : String(netErr);
    throw new Error(`Network failure connecting to Gemini Imagen API: ${msg}`);
  }

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.message) {
        errorDetail = errJson.error.message;
      }
    } catch {
      // Body not JSON
    }

    if (response.status === 400 && errorDetail.toLowerCase().includes('api_key')) {
      throw new Error('Invalid Gemini API Key. Verify your key from Google AI Studio.');
    }
    if (response.status === 429) {
      throw new Error('Gemini API rate limit or quota exceeded. Please wait a moment or check your quota.');
    }
    if (errorDetail.toLowerCase().includes('safety')) {
      throw new Error(`Image blocked by Gemini safety filters: ${errorDetail}`);
    }

    throw new Error(`Imagen 3 generation failed: ${errorDetail}`);
  }

  const data = await response.json();
  const prediction = data?.predictions?.[0];

  if (!prediction?.bytesBase64Encoded) {
    throw new Error('Imagen 3 API did not return image data. Check prompt content and safety policies.');
  }

  const mime = prediction.mimeType || outputMimeType;
  const imageUrl = `data:${mime};base64,${prediction.bytesBase64Encoded}`;
  const durationMs = Date.now() - startTime;

  const result: GeminiImageResult = {
    imageUrl,
    mimeType: mime,
    prompt,
    durationMs,
  };

  // Cache in memory
  imageResultCache.set(cacheKey, result);

  return result;
}

/**
 * Constructs a prompt for a Xenoflora or Xenofungi species specimen.
 */
export function buildSpeciesImagePrompt(params: {
  species: SpecimenSpecies;
  planetName?: string;
  starTeff?: number;
  gravityG?: number;
  pressureBar?: number | null;
  solventKey?: string;
  style?: SpeciesImageStyle;
}): string {
  const {
    species,
    planetName = 'an alien exoplanet',
    starTeff = 5778,
    gravityG = 1.0,
    pressureBar = 1.0,
    solventKey = 'H2O',
    style = 'botanical-plate',
  } = params;

  const isFungi = 'kingdom' in species && species.kingdom === 'Fungi';
  const kingdomLabel = isFungi ? 'extraterrestrial fungus (Xenomycota)' : 'extraterrestrial plant (Xenoflora)';

  // Determine star illumination description
  let stellarLight = 'warm sunlight';
  if (starTeff < 3500) {
    stellarLight = 'deep dim-red infrared illumination from an M-dwarf star';
  } else if (starTeff < 4800) {
    stellarLight = 'soft golden-amber light from an orange K-dwarf star';
  } else if (starTeff > 7500) {
    stellarLight = 'brilliant, crisp cyan-white rays from a hot F-type star';
  }

  // Format dimensions
  const heightDesc = species.averageHeightM < 0.01
    ? `${(species.averageHeightM * 1000).toFixed(1)} millimeters tall`
    : species.averageHeightM < 0.1
    ? `${(species.averageHeightM * 100).toFixed(1)} centimeters tall`
    : `${species.averageHeightM.toFixed(2)} meters tall`;

  const spreadDesc = `${species.averageSpreadM.toFixed(1)} meters wide`;

  // Biome habitat list
  const habitats = species.nativeBiomeNames?.length > 0
    ? species.nativeBiomeNames.join(' and ')
    : 'alien planetary terrain';

  // Adaptations
  const adaptationsText = species.adaptations?.length > 0
    ? species.adaptations.slice(0, 3).join(', ')
    : '';

  const solventNote = solventKey && solventKey !== 'H2O' ? ` adapted to exotic ${solventKey} biochemistry` : '';

  if (style === 'botanical-plate') {
    return [
      `A masterwork archival botanical monograph plate illustrating ${species.commonName} (${species.scientificName}), an indigenous ${kingdomLabel} discovered on ${planetName}${solventNote}.`,
      `Morphology & Growth Form: ${species.growthForm}, measuring approximately ${heightDesc} with a spread of ${spreadDesc}.`,
      `Coloration & Pigments: Characterized by ${species.pigmentName} with exact chromatic palette (${species.pigmentColorHex}), showing delicate gradient transitions and luster.`,
      `Structural Anatomy: Form category "${species.formCategory}" structured from ${species.structuralPolymer}.`,
      `Reproductive Apparatus: ${species.reproductionMethod}.`,
      adaptationsText ? `Evolutionary Traits: ${adaptationsText}.` : '',
      `Native Substrate: Endemic to ${habitats} under ${gravityG.toFixed(2)}g gravity and ${pressureBar ?? 1.0} bar atmosphere.`,
      `Artistic Style: Highly detailed scientific expedition illustration on vintage aged cream parchment paper, clean orthographic anatomical cross-sections, fine-line ink engraving with watercolor washes, labeled botanical callouts, high scientific plausibility, 8k resolution, crisp focus.`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  // Photorealistic Field Macro
  return [
    `National Geographic high-detail macro nature photograph of ${species.commonName} (${species.scientificName}), a living ${kingdomLabel}${solventNote} thriving in its native biome (${habitats}) on ${planetName}.`,
    `Physical Structure: ${species.growthForm}, standing ${heightDesc} high, constructed of biological ${species.structuralPolymer}.`,
    `Chromatic Texture: Glowing with vivid ${species.pigmentName} (${species.pigmentColorHex}), capturing subsurface scattering, translucency, and natural surface moisture.`,
    `Reproduction & Spores: Showing ${species.reproductionMethod}.`,
    `Lighting & Environment: Bathed in ${stellarLight}, casting soft atmospheric shadows across alien soil and rock formations.`,
    `Cinematic Composition: Extreme shallow depth of field, tactile organic textures, crisp focus on intricate biological membranes, volumetric atmospheric mist, realistic 8k nature photography, photorealistic, uncompressed.`,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Constructs a prompt for a Planetary Surface landscape or first-person view.
 */
export function buildPlanetSurfaceImagePrompt(params: {
  planetName: string;
  planetClass: string;
  biomeName?: string;
  secondaryBiomeName?: string;
  elevationMeters?: number;
  temperatureK?: number;
  pressureBar?: number | null;
  solventKey?: string;
  liquidCoveragePct?: number;
  cloudCoveragePct?: number;
  hasBiosphere?: boolean;
  biosphereSummary?: string;
  hostStarTeff?: number;
  starColorHex?: string;
  timeOfDay?: string;
  isTidallyLocked?: boolean;
  style?: SurfaceImageStyle;
}): string {
  const {
    planetName,
    planetClass,
    biomeName = 'Alien Plains',
    secondaryBiomeName,
    elevationMeters = 100,
    temperatureK = 288,
    pressureBar = 1.0,
    solventKey = 'H2O',
    liquidCoveragePct = 70,
    cloudCoveragePct = 40,
    hasBiosphere = false,
    biosphereSummary,
    hostStarTeff = 5778,
    timeOfDay = 'afternoon',
    isTidallyLocked = false,
    style = 'landscape-16-9',
  } = params;

  // Star lighting and color
  let skyAndSun = 'a bright yellow-white sun in a soft blue sky';
  if (hostStarTeff < 3500) {
    skyAndSun = 'a massive, brooding crimson-red dwarf sun hanging low on the horizon casting deep scarlet and purplish twilight across an obsidian-tinted sky';
  } else if (hostStarTeff < 4800) {
    skyAndSun = 'a vibrant orange K-dwarf sun illuminating the alien sky with warm amber and peach hues';
  } else if (hostStarTeff > 7500) {
    skyAndSun = 'a brilliant, harsh blue-white star casting razor-sharp shadows under a vibrant indigo sky';
  }

  // Temperature atmosphere feeling
  const tempC = Math.round(temperatureK - 273.15);
  let climateDesc = `${tempC}°C`;
  if (tempC < -40) {
    climateDesc = `frigid cryogenic temperature (${tempC}°C) with frost-covered rocks and crystal vapor`;
  } else if (tempC > 60) {
    climateDesc = `scorching hyperthermal conditions (${tempC}°C) with heat ripples and shimmering haze`;
  } else {
    climateDesc = `temperate climate (${tempC}°C)`;
  }

  // Solvents
  let liquidDesc = '';
  if (liquidCoveragePct > 0) {
    if (solventKey === 'H2O') {
      liquidDesc = 'shorelines with clear alien water bodies reflecting the horizon';
    } else if (solventKey.toLowerCase().includes('methane')) {
      liquidDesc = 'mirror-sheened lakes and rivers of liquid cryogenic hydrocarbons (methane-ethane)';
    } else if (solventKey.toLowerCase().includes('ammonia')) {
      liquidDesc = 'calm turquoise basins of dense liquid ammonia-water brine';
    } else if (solventKey.toLowerCase().includes('supercritical')) {
      liquidDesc = 'dense supercritical hydrothermal vapors and shimmering hyper-dense mist';
    }
  }

  // Biosphere vegetation
  let bioDesc = 'a barren, primordial geological landscape devoid of visible macroscopic life';
  if (hasBiosphere) {
    bioDesc = biosphereSummary
      ? `flourishing with indigenous alien ecosystem: ${biosphereSummary}`
      : 'carpeted with exotic alien microbial mats, alien vegetation, and bizarre otherworldly fungal growths';
  }

  const biomeText = secondaryBiomeName ? `${biomeName} transitioning into ${secondaryBiomeName}` : biomeName;

  const elevationDesc = elevationMeters > 2000
    ? `high mountainous plateau at +${elevationMeters}m altitude`
    : elevationMeters < -100
    ? `deep continental rift valley below sea level (${elevationMeters}m)`
    : `coastal lowlands (+${elevationMeters}m elevation)`;

  const tidallyLockedNote = isTidallyLocked
    ? 'Tidally locked world with an eternal, stationary sun frozen forever at the exact same point in the sky.'
    : '';

  if (style === 'first-person-4-3') {
    return [
      `First-person ground-level exploration view looking outward across the surface of ${planetName}, a ${planetClass}.`,
      `Local Terrain: Standing directly in ${biomeText} (${elevationDesc}), showing detailed ground textures of alien soil, mineral gravel, and rock formations.`,
      `Atmosphere & Sky: ${pressureBar ? `${pressureBar} bar pressure` : 'thin atmosphere'}, illuminated by ${skyAndSun} during ${timeOfDay}.`,
      cloudCoveragePct > 0 ? `Cloud Deck: ${cloudCoveragePct}% atmospheric cloud cover drifting overhead.` : 'Clear cloudless alien skies.',
      liquidDesc ? `Hydrology: ${liquidDesc}.` : '',
      `Biosphere: ${bioDesc}.`,
      climateDesc,
      tidallyLockedNote,
      `Cinematic aesthetic: Photorealistic surface rover / astronaut field view, natural wide-angle perspective, authentic planetary geology, cinematic volumetric lighting, 8k resolution, ultra-detailed textures.`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  // Default Landscape 16:9
  return [
    `A breathtaking cinematic wide-angle landscape photograph captured on the surface of ${planetName} (${planetClass}).`,
    `Geological Setting: Sweeping vista of ${biomeText} across ${elevationDesc}, featuring dramatic alien topography, eroded mineral bluffs, and sweeping geological formations.`,
    `Celestial Lighting: Lit by ${skyAndSun}, casting long cinematic shadows during ${timeOfDay}.`,
    cloudCoveragePct > 0 ? `Atmosphere: ${cloudCoveragePct}% alien cloud decks with atmospheric light-scattering.` : '',
    liquidDesc ? `Liquid Features: Glistening ${liquidDesc}.` : '',
    `Ecosystem & Flora: ${bioDesc}.`,
    `Planetary Conditions: ${climateDesc}, atmospheric density ${pressureBar ?? 1.0} bar.`,
    tidallyLockedNote,
    `Style: Ultra-high-resolution landscape photography, Hasselblad medium format camera clarity, breathtaking depth of field, realistic atmospheric perspective, 8k, Unreal Engine 5 nature render aesthetic.`,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Downloads a data URL to the user's filesystem as a file.
 */
export function downloadDataUrlAsFile(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Copies plain text to the user's clipboard.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older environments
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  }
}
