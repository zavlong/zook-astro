import React from 'react';

export interface BlackHoleIconProps {
  /**
   * If true, renders the Supermassive Black Hole variant with larger event horizon and broader accretion disk.
   * If false, renders the Stellar Black Hole variant (same iconic design, but smaller event horizon and accretion disk).
   */
  isSupermassive?: boolean;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Procedural vector icon for Black Holes (Supermassive Black Hole vs Stellar Black Hole).
 * Depicts the pure black singularity / event horizon framed by a relativistic purple-violet accretion disk and photon ring.
 * Stellar black holes have the exact same design as supermassive black holes, but smaller.
 */
export const BlackHoleIcon: React.FC<BlackHoleIconProps> = ({
  isSupermassive = false,
  size = 36,
  className = '',
  style = {},
}) => {
  const center = size / 2;

  // Proportions: Supermassive has larger event horizon & expansive disk, Stellar has compact horizon & disk
  const rHorizon = isSupermassive ? size * 0.26 : size * 0.15;
  const rxDisk1 = isSupermassive ? size * 0.46 : size * 0.32;
  const ryDisk1 = isSupermassive ? size * 0.19 : size * 0.13;

  const rxDisk2 = isSupermassive ? size * 0.38 : size * 0.25;
  const ryDisk2 = isSupermassive ? size * 0.14 : size * 0.09;

  const glowRadius = isSupermassive ? size * 0.44 : size * 0.32;

  // Unique ID prefix for gradients
  const idSuffix = React.useId().replace(/:/g, '');

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 overflow-visible ${className}`}
      style={style}
    >
      <defs>
        <radialGradient id={`bh-glow-${idSuffix}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c084fc" stopOpacity={isSupermassive ? '0.55' : '0.40'} />
          <stop offset="60%" stopColor="#9333ea" stopOpacity={isSupermassive ? '0.30' : '0.20'} />
          <stop offset="100%" stopColor="#7e22ce" stopOpacity="0" />
        </radialGradient>

        <linearGradient id={`bh-disk-${idSuffix}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f3e8ff" />
          <stop offset="35%" stopColor="#c084fc" />
          <stop offset="70%" stopColor="#9333ea" />
          <stop offset="100%" stopColor="#581c87" />
        </linearGradient>

        <filter id={`bh-shadow-${idSuffix}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={isSupermassive ? '2.5' : '1.5'} result="blur" />
        </filter>
      </defs>

      {/* Atmospheric Accretion Glow */}
      <circle
        cx={center}
        cy={center}
        r={glowRadius}
        fill={`url(#bh-glow-${idSuffix})`}
      />

      {/* Relativistic Accretion Ring (Tilted Torus) - Outer */}
      <ellipse
        cx={center}
        cy={center}
        rx={rxDisk1}
        ry={ryDisk1}
        stroke={`url(#bh-disk-${idSuffix})`}
        strokeWidth={isSupermassive ? 2.2 : 1.4}
        opacity={0.88}
        transform={`rotate(-18, ${center}, ${center})`}
      />

      {/* Secondary Inner Photon Torus */}
      <ellipse
        cx={center}
        cy={center}
        rx={rxDisk2}
        ry={ryDisk2}
        stroke="#f3e8ff"
        strokeWidth={isSupermassive ? 1.4 : 0.9}
        opacity={0.75}
        transform={`rotate(-18, ${center}, ${center})`}
      />

      {/* Relativistic Jet / Doppler Beaming Accent */}
      <circle
        cx={center - (isSupermassive ? 4.5 : 2.8)}
        cy={center - (isSupermassive ? 3.0 : 1.8)}
        r={isSupermassive ? 2.2 : 1.4}
        fill="#ffffff"
        opacity={0.7}
        filter={`url(#bh-shadow-${idSuffix})`}
      />

      {/* Event Horizon (Pure Black Void with Relativistic Photon Sphere Border) */}
      <circle
        cx={center}
        cy={center}
        r={rHorizon}
        fill="#000000"
        stroke="#c084fc"
        strokeWidth={isSupermassive ? 1.6 : 1.1}
      />
    </svg>
  );
};
