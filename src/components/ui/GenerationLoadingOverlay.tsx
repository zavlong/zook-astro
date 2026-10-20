import React from 'react';
import { Compass, Sparkles } from 'lucide-react';

export interface GenerationLoadingOverlayProps {
  title: string;
  subtitle?: string;
  detail?: string;
  accentColor?: string;
}

/**
 * Helper to yield control back to the browser main thread so the loading screen
 * can paint before heavy synchronous astrophysical generation runs.
 * Uses scheduler.yield() where supported, with a requestAnimationFrame + setTimeout fallback.
 */
export async function yieldToMainThread(): Promise<void> {
  // First wait for the next animation frame so React's loading state is painted to screen
  await new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
      window.requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });

  // Then yield to the browser scheduler (with setTimeout fallback) per modern-web-guidance `break-up-long-tasks`
  const win = typeof window !== 'undefined' ? (window as unknown as { scheduler?: { yield?: () => Promise<void> } }) : null;
  if (win && win.scheduler && typeof win.scheduler.yield === 'function') {
    await win.scheduler.yield();
  } else {
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
}

export const GenerationLoadingOverlay: React.FC<GenerationLoadingOverlayProps> = ({
  title,
  subtitle,
  detail,
  accentColor = '#38bdf8',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#030611]/92 backdrop-blur-md transition-opacity duration-200 select-none pointer-events-auto"
    >
      <div className="relative flex items-center justify-center">
        <div
          className="w-40 h-40 rounded-full border-2 animate-ping opacity-40 absolute"
          style={{ borderColor: accentColor }}
        />
        <div
          className="w-28 h-28 rounded-full border animate-pulse opacity-60 absolute"
          style={{ borderColor: accentColor }}
        />
        <div
          className="w-20 h-20 rounded-full border border-cyan-400/80 flex items-center justify-center shadow-2xl relative bg-[#050918]/90"
          style={{
            boxShadow: `0 0 45px ${accentColor}66`,
          }}
        >
          <Compass
            className="w-9 h-9 text-cyan-300 animate-spin"
            style={{ animationDuration: '2.4s' }}
          />
        </div>
      </div>

      <div className="mt-7 text-center space-y-1.5 font-mono px-4 max-w-lg">
        <div className="text-[11px] uppercase tracking-widest text-cyan-400 font-bold flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 animate-bounce" />
          <span>ASTROPHYSICAL SYNTHESIS IN PROGRESS</span>
        </div>
        <h3 className="text-lg sm:text-xl font-extrabold text-white tracking-wide">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-sky-200/90 font-medium">
            {subtitle}
          </p>
        )}
        {detail && (
          <p className="text-[11px] text-slate-400">
            {detail}
          </p>
        )}

        {/* Indeterminate sleek progress bar */}
        <div className="w-56 h-1.5 bg-slate-900/90 border border-slate-800 rounded-full overflow-hidden mx-auto mt-3">
          <div
            className="h-full w-1/2 rounded-full animate-pulse"
            style={{
              background: `linear-gradient(90deg, transparent, ${accentColor}, #818cf8, transparent)`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
