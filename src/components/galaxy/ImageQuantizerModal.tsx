import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  X,
  Sliders,
  Sparkles,
  Layers,
  Check,
  RefreshCw,
  ImageIcon,
  Eye,
} from 'lucide-react';
import {
  ImageQuantizeOptions,
  DEFAULT_QUANTIZE_OPTIONS,
  quantizeImageToGalaxy,
} from '../../core/generation/imageQuantizer';
import { GalaxyGridData } from '../../core/generation/galaxyGen';

interface ImageQuantizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyQuantizedGalaxy: (data: GalaxyGridData, imageUrl: string) => void;
  currentRadiusKpc?: number;
}

export const ImageQuantizerModal: React.FC<ImageQuantizerModalProps> = ({
  isOpen,
  onClose,
  onApplyQuantizedGalaxy,
  currentRadiusKpc = 35,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>('Uploaded Galaxy');
  const [options, setOptions] = useState<ImageQuantizeOptions>(() => ({
    ...DEFAULT_QUANTIZE_OPTIONS,
    radiusKpc: currentRadiusKpc,
  }));
  const [showHexOverlay, setShowHexOverlay] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadedImgRef = useRef<HTMLImageElement | null>(null);

  // Generate a procedural Hubble-style galaxy on canvas if no image has been uploaded yet
  const generateSampleGalaxyImage = useCallback((): string => {
    const c = document.createElement('canvas');
    c.width = 500;
    c.height = 500;
    const ctx = c.getContext('2d');
    if (!ctx) return '';

    // Black space background with faint distant stars
    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, 500, 500);

    for (let i = 0; i < 200; i++) {
      const sx = Math.random() * 500;
      const sy = Math.random() * 500;
      const sr = Math.random() * 1.2;
      ctx.fillStyle = Math.random() > 0.8 ? '#93c5fd' : '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Outer faint diffuse halo
    const haloGrad = ctx.createRadialGradient(250, 250, 20, 250, 250, 220);
    haloGrad.addColorStop(0, 'rgba(253, 230, 138, 0.85)');
    haloGrad.addColorStop(0.25, 'rgba(147, 197, 253, 0.45)');
    haloGrad.addColorStop(0.65, 'rgba(59, 130, 246, 0.18)');
    haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(250, 250, 220, 0, Math.PI * 2);
    ctx.fill();

    // Spiral arms
    const numArms = 2;
    for (let arm = 0; arm < numArms; arm++) {
      const armOffset = arm * Math.PI;
      for (let t = 0.1; t < 3.2; t += 0.015) {
        const r = 25 + Math.pow(t, 1.45) * 45;
        const angle = t * 1.35 + armOffset;
        const x = 250 + r * Math.cos(angle);
        const y = 250 + r * Math.sin(angle);

        const pointGrad = ctx.createRadialGradient(x, y, 0, x, y, 16 + t * 4);
        pointGrad.addColorStop(0, t < 1.2 ? 'rgba(254, 243, 199, 0.65)' : 'rgba(56, 189, 248, 0.55)');
        pointGrad.addColorStop(0.5, 'rgba(96, 165, 250, 0.25)');
        pointGrad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = pointGrad;
        ctx.beginPath();
        ctx.arc(x, y, 16 + t * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Brilliant golden core
    const coreGrad = ctx.createRadialGradient(250, 250, 0, 250, 250, 45);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.35, '#fef08a');
    coreGrad.addColorStop(0.7, '#f59e0b');
    coreGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(250, 250, 45, 0, Math.PI * 2);
    ctx.fill();

    return c.toDataURL('image/png');
  }, []);

  // Initialize with sample galaxy if empty
  useEffect(() => {
    if (!imageSrc) {
      const sample = generateSampleGalaxyImage();
      setImageSrc(sample);
      setImageName('Sample Grand Design Spiral (M51)');
    }
  }, [imageSrc, generateSampleGalaxyImage]);

  // Load image element when imageSrc updates
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      loadedImgRef.current = img;
      renderPreview();
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Render preview canvas with image and optional overlaid hex grid
  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const img = loadedImgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    // Draw background
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, size, size);

    // Draw image centered in square
    const aspect = img.naturalWidth / img.naturalHeight;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    let sx = 0;
    let sy = 0;

    if (aspect > 1) {
      sw = img.naturalHeight;
      sx = (img.naturalWidth - sw) / 2;
    } else {
      sh = img.naturalWidth;
      sy = (img.naturalHeight - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);

    // Draw hex grid overlay if enabled
    if (showHexOverlay) {
      const columns = 50;
      const rows = 50;
      const pad = 12;
      const usableW = size - pad * 2;
      const usableH = size - pad * 2;
      const colSpacing = usableW / (columns + 0.5);
      const rowSpacing = usableH / rows;
      const hexRad = colSpacing * 0.52;

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 0.8;

      for (let r = 1; r <= rows; r += 2) {
        for (let c = 1; c <= columns; c += 2) {
          const xOffset = r % 2 === 1 ? colSpacing * 0.5 : 0;
          const cx = pad + (c - 1) * colSpacing + xOffset + colSpacing * 0.5;
          const cy = pad + (r - 1) * rowSpacing + rowSpacing * 0.5;

          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i - 30);
            const hx = cx + hexRad * Math.cos(angle);
            const hy = cy + hexRad * Math.sin(angle);
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
    }
  }, [showHexOverlay]);

  useEffect(() => {
    renderPreview();
  }, [renderPreview, options]);

  // Handle local image file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageName(file.name.replace(/\.[^/.]+$/, ''));
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setImageSrc(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  // Drag and drop handlers
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    setImageName(file.name.replace(/\.[^/.]+$/, ''));
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setImageSrc(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  // Perform quantization and apply to main galaxy map
  const handleQuantize = () => {
    if (!loadedImgRef.current || !imageSrc) return;

    setIsProcessing(true);
    setTimeout(() => {
      try {
        const quantizedData = quantizeImageToGalaxy(loadedImgRef.current!, {
          ...options,
          name: imageName,
        });
        onApplyQuantizedGalaxy(quantizedData, imageSrc);
        onClose();
      } catch (err) {
        console.error('Quantization error:', err);
      } finally {
        setIsProcessing(false);
      }
    }, 50);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl text-slate-100 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-fuchsia-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
              <ImageIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                <span>IMAGE TO GALAXY QUANTIZER</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-fuchsia-950 text-fuchsia-300 border border-fuchsia-800">
                  50&times;50 Hex Grid
                </span>
              </h3>
              <p className="text-[10.5px] text-slate-400">
                Overlay a galaxy photograph and convert pixel color &amp; brightness into astrophysical sector data.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto flex flex-col md:flex-row gap-5">
          {/* Left Column: Canvas Preview & Upload Zone */}
          <div className="flex-1 flex flex-col items-center gap-3">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="w-full max-w-[340px] aspect-square rounded-xl bg-slate-900/80 border border-slate-800 relative overflow-hidden flex items-center justify-center group shadow-xl"
            >
              <canvas
                ref={canvasRef}
                width={400}
                height={400}
                className="w-full h-full object-cover"
              />

              {/* Floating Toggle: Overlaid Hex Grid Lines */}
              <button
                onClick={() => setShowHexOverlay((v) => !v)}
                className="absolute top-2.5 right-2.5 px-2 py-1 rounded-lg bg-slate-950/85 backdrop-blur-md border border-slate-700/80 text-[10px] font-mono text-cyan-300 hover:text-white flex items-center gap-1.5 shadow transition cursor-pointer"
                title="Toggle Hex Grid Overlay"
              >
                {showHexOverlay ? <Eye className="w-3 h-3 text-cyan-400" /> : <Layers className="w-3 h-3 text-slate-400" />}
                <span>{showHexOverlay ? 'Grid ON' : 'Grid OFF'}</span>
              </button>
            </div>

            {/* Upload File Button */}
            <div className="w-full max-w-[340px] flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 hover:border-fuchsia-500 font-mono text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow"
              >
                <Upload className="w-3.5 h-3.5 text-fuchsia-400" />
                <span>Upload Galaxy Image (PNG/JPG)</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => {
                  const sample = generateSampleGalaxyImage();
                  setImageSrc(sample);
                  setImageName('Procedural Spiral Model');
                }}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
                title="Generate Sample Spiral Galaxy"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="text-[10px] text-slate-500 font-mono text-center">
              Active: <span className="text-slate-300 font-bold">{imageName}</span>
            </div>
          </div>

          {/* Right Column: Quantization Astrophysics Sliders */}
          <div className="flex-1 flex flex-col gap-3 font-mono text-xs">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                <span>Pixel to Astrophysics Mapping</span>
              </div>

              {/* Black Point Cutoff (Void Threshold) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-400">Void Cutoff (Black Point):</span>
                  <strong className="text-cyan-300">{Math.round((options.blackPoint ?? 0.08) * 100)}%</strong>
                </div>
                <input
                  type="range"
                  min={0.01}
                  max={0.35}
                  step={0.01}
                  value={options.blackPoint ?? 0.08}
                  onChange={(e) =>
                    setOptions((prev) => ({ ...prev, blackPoint: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <div className="text-[9.5px] text-slate-500 mt-0.5">
                  Pixels below this threshold become sparse intergalactic void (&le;1% density).
                </div>
              </div>

              {/* Density Scale Multiplier */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-400">Density Scale Multiplier:</span>
                  <strong className="text-amber-300">{(options.densityScale ?? 1.15).toFixed(2)}x</strong>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  value={options.densityScale ?? 1.15}
                  onChange={(e) =>
                    setOptions((prev) => ({ ...prev, densityScale: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="text-[9.5px] text-slate-500 mt-0.5">
                  Scales core &amp; spiral arm brightness into stellar system densities up to 300%+.
                </div>
              </div>

              {/* Contrast / Gamma Curve */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-400">Image Contrast Curve:</span>
                  <strong className="text-purple-300">{(options.contrast ?? 1.1).toFixed(2)}</strong>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.2}
                  step={0.05}
                  value={options.contrast ?? 1.1}
                  onChange={(e) =>
                    setOptions((prev) => ({ ...prev, contrast: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-purple-500 cursor-pointer"
                />
                <div className="text-[9.5px] text-slate-500 mt-0.5">
                  Sharpens spiral arms and dark dust lane separation.
                </div>
              </div>

              {/* Physical Radius Scale */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-400">Physical Radius:</span>
                  <strong className="text-emerald-400">{options.radiusKpc ?? 35} kpc</strong>
                </div>
                <input
                  type="range"
                  min={15}
                  max={50}
                  step={1}
                  value={options.radiusKpc ?? 35}
                  onChange={(e) =>
                    setOptions((prev) => ({ ...prev, radiusKpc: parseInt(e.target.value) }))
                  }
                  className="w-full accent-emerald-500 cursor-pointer"
                />
              </div>

              {/* Invert Brightness */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                <input
                  type="checkbox"
                  id="invertCheck"
                  checked={options.invertBrightness ?? false}
                  onChange={(e) =>
                    setOptions((prev) => ({ ...prev, invertBrightness: e.target.checked }))
                  }
                  className="accent-fuchsia-500 rounded cursor-pointer"
                />
                <label htmlFor="invertCheck" className="text-slate-300 text-[11px] cursor-pointer">
                  Invert Brightness (for negative astrophotography film plates)
                </label>
              </div>
            </div>

            {/* Astrophysical Color Conversion Explanation */}
            <div className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800 text-[10px] text-slate-400 space-y-1">
              <div className="text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>Astrophysical Synthesis</span>
              </div>
              <div>&bull; <strong className="text-blue-400">Blue Pixels</strong> &rarr; Young starburst OB associations (0.5–2.5 Gyr).</div>
              <div>&bull; <strong className="text-amber-400">Golden/Red Pixels</strong> &rarr; Population II halo &amp; mature disk stars (6–12 Gyr).</div>
              <div>&bull; <strong className="text-white">White Nucleus</strong> &rarr; Galactic Bulge with uniform age distribution across all epochs.</div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between gap-3">
          <div className="text-[11px] font-mono text-slate-400 hidden sm:block">
            Processes 2,500 hexagons (50&times;50 grid)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleQuantize}
              disabled={isProcessing}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-fuchsia-600 via-indigo-600 to-blue-600 hover:from-fuchsia-500 hover:to-blue-500 text-white font-mono text-xs font-bold transition shadow-lg shadow-fuchsia-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isProcessing ? 'Quantizing Pixels...' : 'Quantize into Sector Map'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
