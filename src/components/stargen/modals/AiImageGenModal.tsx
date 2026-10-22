import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  Key,
  Copy,
  Check,
  Download,
  ExternalLink,
  RefreshCw,
  Maximize2,
  AlertTriangle,
  Eye,
  EyeOff,
  Image as ImageIcon,
} from 'lucide-react';
import {
  buildSpeciesImagePrompt,
  buildPlanetSurfaceImagePrompt,
  generateGeminiImage,
  getStoredApiKey,
  setStoredApiKey,
  copyToClipboard,
  downloadDataUrlAsFile,
  SpeciesImageStyle,
  SurfaceImageStyle,
  GeminiImageResult,
} from '../../../core/api/geminiImageGen';
import { SpecimenSpecies } from '../../../core/xenobiology/botanicalArtGen';
import { BotanicalSpecimenPlate } from '../surface/BotanicalSpecimenPlate';

export type AiImageTarget =
  | {
      type: 'species';
      species: SpecimenSpecies;
      planetName?: string;
      starTeff?: number;
      gravityG?: number;
      pressureBar?: number | null;
      solventKey?: string;
    }
  | {
      type: 'surface';
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
    };

interface AiImageGenModalProps {
  target: AiImageTarget | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AiImageGenModal: React.FC<AiImageGenModalProps> = ({
  target,
  isOpen,
  onClose,
}) => {
  const [apiKey, setApiKey] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>('');
  const [speciesStyle, setSpeciesStyle] = useState<SpeciesImageStyle>('botanical-plate');
  const [surfaceStyle, setSurfaceStyle] = useState<SurfaceImageStyle>('landscape-16-9');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '4:3' | '3:4' | '9:16'>('1:1');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<GeminiImageResult | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Initialize API key from storage on mount
  useEffect(() => {
    const saved = getStoredApiKey();
    if (saved) setApiKey(saved);
  }, []);

  // Sync prompt whenever target or style changes
  useEffect(() => {
    if (!target) return;

    if (target.type === 'species') {
      const p = buildSpeciesImagePrompt({
        species: target.species,
        planetName: target.planetName,
        starTeff: target.starTeff,
        gravityG: target.gravityG,
        pressureBar: target.pressureBar,
        solventKey: target.solventKey,
        style: speciesStyle,
      });
      setPrompt(p);
      setAspectRatio(speciesStyle === 'botanical-plate' ? '1:1' : '3:4');
    } else {
      const p = buildPlanetSurfaceImagePrompt({
        planetName: target.planetName,
        planetClass: target.planetClass,
        biomeName: target.biomeName,
        secondaryBiomeName: target.secondaryBiomeName,
        elevationMeters: target.elevationMeters,
        temperatureK: target.temperatureK,
        pressureBar: target.pressureBar,
        solventKey: target.solventKey,
        liquidCoveragePct: target.liquidCoveragePct,
        cloudCoveragePct: target.cloudCoveragePct,
        hasBiosphere: target.hasBiosphere,
        biosphereSummary: target.biosphereSummary,
        hostStarTeff: target.hostStarTeff,
        starColorHex: target.starColorHex,
        timeOfDay: target.timeOfDay,
        isTidallyLocked: target.isTidallyLocked,
        style: surfaceStyle,
      });
      setPrompt(p);
      setAspectRatio(surfaceStyle === 'landscape-16-9' ? '16:9' : '4:3');
    }

    setResult(null);
    setErrorMsg(null);
  }, [target, speciesStyle, surfaceStyle]);

  if (!isOpen || !target) return null;

  const isSpecies = target.type === 'species';
  const modalTitle = isSpecies
    ? `AI Specimen Portrait: ${target.species.commonName}`
    : `AI Surface Generation: ${target.planetName}`;

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    setStoredApiKey(val);
  };

  const handleResetPrompt = () => {
    if (isSpecies) {
      setPrompt(
        buildSpeciesImagePrompt({
          species: target.species,
          planetName: target.planetName,
          starTeff: target.starTeff,
          gravityG: target.gravityG,
          pressureBar: target.pressureBar,
          solventKey: target.solventKey,
          style: speciesStyle,
        })
      );
    } else {
      setPrompt(
        buildPlanetSurfaceImagePrompt({
          planetName: target.planetName,
          planetClass: target.planetClass,
          biomeName: target.biomeName,
          secondaryBiomeName: target.secondaryBiomeName,
          elevationMeters: target.elevationMeters,
          temperatureK: target.temperatureK,
          pressureBar: target.pressureBar,
          solventKey: target.solventKey,
          liquidCoveragePct: target.liquidCoveragePct,
          cloudCoveragePct: target.cloudCoveragePct,
          hasBiosphere: target.hasBiosphere,
          biosphereSummary: target.biosphereSummary,
          hostStarTeff: target.hostStarTeff,
          starColorHex: target.starColorHex,
          timeOfDay: target.timeOfDay,
          isTidallyLocked: target.isTidallyLocked,
          style: surfaceStyle,
        })
      );
    }
  };

  const handleCopyPrompt = async () => {
    const success = await copyToClipboard(prompt);
    if (success) {
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const handleGenerate = async () => {
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const imgRes = await generateGeminiImage(prompt, {
        apiKey,
        aspectRatio,
      });
      setResult(imgRes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const cleanName = isSpecies
      ? `${target.species.scientificName.replace(/\s+/g, '_')}_imagen3.jpg`
      : `${target.planetName.replace(/\s+/g, '_')}_surface_imagen3.jpg`;
    downloadDataUrlAsFile(result.imageUrl, cleanName);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 md:p-6 font-mono text-xs text-slate-200"
      onClick={onClose}
    >
      <div
        className="bg-[#0b101b] border border-sky-500/50 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#0f1524]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-400 p-[1px] flex items-center justify-center shadow-md shadow-sky-500/20">
              <div className="w-full h-full bg-[#0b101b] rounded-[7px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-sky-400 animate-pulse" />
              </div>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>{modalTitle}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950/80 border border-indigo-500/60 text-indigo-300">
                  Google Imagen 3
                </span>
              </h2>
              <span className="text-[10px] text-slate-400">
                Procedural prompt construction &amp; direct Google AI Studio image synthesis
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {/* Top Options & Key Bar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-[#111726] p-3 rounded-xl border border-slate-800">
            {/* Style Selector */}
            <div>
              <label className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-1.5">
                Rendering Aesthetic &amp; Framing
              </label>
              {isSpecies ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSpeciesStyle('botanical-plate')}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold border transition text-left cursor-pointer ${
                      speciesStyle === 'botanical-plate'
                        ? 'bg-sky-950/80 border-sky-400 text-sky-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    📜 Botanical Plate
                    <span className="block text-[9px] text-slate-500 font-normal">Archival Monograph (1:1)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpeciesStyle('photorealistic-field')}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold border transition text-left cursor-pointer ${
                      speciesStyle === 'photorealistic-field'
                        ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    📷 Nature Macro Photo
                    <span className="block text-[9px] text-slate-500 font-normal">Field Macro Lens (3:4)</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSurfaceStyle('landscape-16-9')}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold border transition text-left cursor-pointer ${
                      surfaceStyle === 'landscape-16-9'
                        ? 'bg-sky-950/80 border-sky-400 text-sky-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🌄 Wide Vista (16:9)
                    <span className="block text-[9px] text-slate-500 font-normal">Cinematic Horizon Vista</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSurfaceStyle('first-person-4-3')}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold border transition text-left cursor-pointer ${
                      surfaceStyle === 'first-person-4-3'
                        ? 'bg-amber-950/80 border-amber-400 text-amber-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🔭 Rover Field View (4:3)
                    <span className="block text-[9px] text-slate-500 font-normal">First-Person Surface Ground</span>
                  </button>
                </div>
              )}
            </div>

            {/* API Key Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-slate-400 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1">
                  <Key className="w-3 h-3 text-amber-400" />
                  Google Gemini / AI Studio Key
                </label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 hover:underline"
                >
                  <span>Get Free Key</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-slate-950 border border-slate-700/80 focus:border-sky-400 rounded-lg px-3 py-1.5 text-xs text-white font-mono pr-8 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  title={showKey ? 'Hide Key' : 'Show Key'}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <span className="text-[9px] text-slate-500 block mt-1">
                Stored safely in browser localStorage · Free tier available with Google AI Studio
              </span>
            </div>
          </div>

          {/* Aspect Ratio Selector */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mr-1">
              Aspect Ratio:
            </span>
            {(['1:1', '16:9', '4:3', '3:4', '9:16'] as const).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAspectRatio(ratio)}
                className={`px-2 py-1 rounded text-xs font-bold border transition cursor-pointer ${
                  aspectRatio === ratio
                    ? 'bg-sky-600 border-sky-400 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>

          {/* Prompt Construction Box */}
          <div className="bg-[#111726] p-3 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-sky-400" />
                Synthesized Prompt (Editable)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetPrompt}
                  className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1 hover:underline cursor-pointer"
                  title="Reset prompt to procedural default"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-bold hover:underline cursor-pointer"
                  title="Copy prompt for use in Midjourney, Gemini Web, or ChatGPT"
                >
                  {copiedPrompt ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedPrompt ? 'Copied!' : 'Copy Prompt'}
                </button>
              </div>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full bg-slate-950 border border-slate-700/80 focus:border-sky-400 rounded-lg p-2.5 text-[11px] leading-relaxed text-slate-200 font-mono resize-y focus:outline-none custom-scrollbar"
            />
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="bg-rose-950/40 border border-rose-600/70 p-3 rounded-xl flex items-start gap-2.5 text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <b className="font-bold block">Generation Error</b>
                <p className="text-[11px] leading-relaxed text-rose-200/90">{errorMsg}</p>
                {!apiKey && (
                  <p className="text-[10px] text-amber-300">
                    Tip: Enter your Google AI Studio API key above to generate images directly.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Center Stage: Image Display Area */}
          <div className="relative min-h-[300px] max-h-[500px] bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center overflow-hidden group">
            {isLoading ? (
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-2 border-sky-500/20 animate-ping" />
                  <div className="w-12 h-12 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
                </div>
                <div className="space-y-1">
                  <b className="text-white text-sm block">Synthesizing with Imagen 3...</b>
                  <p className="text-[11px] text-slate-400">
                    Querying Google's neural network with planetary astrophysics parameters
                  </p>
                </div>
              </div>
            ) : result ? (
              <div className="relative w-full h-full flex items-center justify-center p-2 bg-black/40">
                <img
                  src={result.imageUrl}
                  alt={prompt}
                  className="max-h-[460px] max-w-full rounded-lg object-contain shadow-2xl border border-slate-800"
                />

                {/* Floating Image Actions */}
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="p-2 rounded-lg bg-black/70 hover:bg-black/90 border border-white/20 text-white backdrop-blur transition cursor-pointer shadow-lg flex items-center gap-1.5 text-xs font-bold"
                    title="Download Generated Image"
                  >
                    <Download className="w-3.5 h-3.5 text-sky-400" />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFullscreen(true)}
                    className="p-2 rounded-lg bg-black/70 hover:bg-black/90 border border-white/20 text-white backdrop-blur transition cursor-pointer shadow-lg"
                    title="View Fullscreen"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="absolute bottom-4 left-4 px-2.5 py-1 rounded bg-black/75 backdrop-blur border border-white/10 text-[10px] text-slate-300">
                  ✨ Generated in {(result.durationMs / 1000).toFixed(1)}s via Imagen 3
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                {isSpecies ? (
                  <div className="w-28 h-28 opacity-60">
                    <BotanicalSpecimenPlate
                      species={target.species}
                      size="card"
                      interactive={false}
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-sky-950/40 border border-sky-500/30 flex items-center justify-center text-sky-400">
                    <ImageIcon className="w-8 h-8 opacity-60" />
                  </div>
                )}
                <div className="space-y-1 max-w-sm">
                  <b className="text-white text-xs block">Ready to Synthesize</b>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Click below to generate high-fidelity artwork of this{' '}
                    {isSpecies ? 'alien specimen' : 'planetary landscape'} using Google's Imagen 3.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Action Bar */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-[#0f1524]">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            {apiKey ? (
              <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                <Check className="w-3.5 h-3.5" />
                API Key Active
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Key required for generation
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:text-white font-semibold transition cursor-pointer"
            >
              Close
            </button>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isLoading || !prompt.trim()}
              className="px-4 py-1.5 rounded-lg font-bold text-white shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-600 hover:brightness-110 active:scale-95 shadow-sky-600/20"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Generate with Imagen 3</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen Overlay */}
      {isFullscreen && result && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setIsFullscreen(false)}
        >
          <img
            src={result.imageUrl}
            alt={prompt}
            className="max-h-[96vh] max-w-[96vw] object-contain rounded-lg shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setIsFullscreen(false)}
            className="absolute top-6 right-6 p-2 rounded-full bg-black/60 border border-white/20 text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
