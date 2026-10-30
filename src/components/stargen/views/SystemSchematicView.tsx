import React from 'react';
import {
  RealisticPlanetBody,
  RealisticPlanetaryZone,
  RealisticStarSystemResult,
} from '../../../core/generation/realisticStarGen';
import {
  RealisticBinarySplit,
  RealisticStarNode,
} from '../../../types/astrophysics';
import {
  SelectedMapEntity,
  clamp,
  log10,
} from '../types';
import { getProceduralStarSpriteDataUrl } from '../../../core/generation/starAssets';
import { getProceduralPlanetIconDataUrl } from '../ProceduralPlanetPortrait';
import {
  SectorEmpire,
  ColonyDesignation,
} from '../../../core/generation/empireGen';

export interface PlanetClaimInfo {
  empire: SectorEmpire | { name: string; color: string; [key: string]: any };
  key?: string;
  designation: ColonyDesignation | string;
  [key: string]: any;
}

export interface SystemSchematicViewProps {
  /** The realistic star system generation result containing hierarchy, stars, and zones */
  systemResult: RealisticStarSystemResult;
  /** Zoom scale multiplier for the SVG schematic (default: 1) */
  mapZoom?: number;
  /** Currently selected entity in the system view (star, split, planet, moon, belt) */
  selectedEntity?: SelectedMapEntity | null;
  /** Callback when an entity is selected */
  setSelectedEntity?: (entity: SelectedMapEntity | null) => void;
  /** Optional alias for setSelectedEntity */
  onSelectEntity?: (entity: SelectedMapEntity | null) => void;
  /** Switch map mode (e.g. to 'orrery2d' on Shift+Click) */
  setMapMode?: (mode: 'schematic' | 'orrery2d' | 'surface') => void;
  /** Optional alias for setMapMode */
  onSetMapMode?: (mode: 'schematic' | 'orrery2d' | 'surface') => void;
  /** Track entity in the 2D orrery view (triggered by Shift+Click) */
  handleTrackBody?: (entity: SelectedMapEntity) => void;
  /** Optional alias for handleTrackBody */
  onTrackBody?: (entity: SelectedMapEntity) => void;
  /** Sovereignty/claim lookup for a planet */
  getPlanetClaimInfo?: (
    b: RealisticPlanetBody,
    zoneIdx: number,
    bIdx: number
  ) => PlanetClaimInfo | null;
  /** Active player or inspector empire */
  currentEmpire?: SectorEmpire | null;
  /** Callback to send a planetary zone to the system architect */
  sendZoneToArchitect?: (zoneIdx: number) => void;
  /** Colonization readiness score / evaluation for an empire */
  getEmpireColonizationReadiness?: (b: RealisticPlanetBody) => any;
}

type LinearRow =
  | {
      rowKind: 'star';
      starIdx: number;
      star: RealisticStarNode;
      zoneIdx: number | null;
      zone: RealisticPlanetaryZone | null;
      height: number;
    }
  | {
      rowKind: 'circumbinary';
      pairName: string;
      splitIdx: number;
      split: RealisticBinarySplit | null;
      zoneIdx: number;
      zone: RealisticPlanetaryZone;
      height: number;
    };

export const SystemSchematicView: React.FC<SystemSchematicViewProps> = React.memo(({
  systemResult,
  mapZoom = 1,
  selectedEntity = null,
  setSelectedEntity,
  onSelectEntity,
  setMapMode,
  onSetMapMode,
  handleTrackBody,
  onTrackBody,
  getPlanetClaimInfo,
  currentEmpire: _currentEmpire,
  sendZoneToArchitect: _sendZoneToArchitect,
  getEmpireColonizationReadiness: _getEmpireColonizationReadiness,
}) => {
  const selectEntity = setSelectedEntity || onSelectEntity || (() => {});
  const changeMapMode = setMapMode || onSetMapMode || (() => {});
  const trackBody = handleTrackBody || onTrackBody || (() => {});

  if (!systemResult?.hierarchy || !systemResult?.zones) {
    return null;
  }

  const res = systemResult;
  const h = res.hierarchy;
  const zones = res.zones;

  // Determine global logarithmic AU bounds across all zones and binary splits
  let minAU = 0.012;
  let maxAU = 80;
  zones.forEach((z) => {
    minAU = Math.min(minAU, z.a_in * 0.65);
    maxAU = Math.max(maxAU, z.a_out * 1.35);
  });
  h.splits.forEach((sp) => {
    minAU = Math.min(minAU, sp.a_AU * 0.45);
    maxAU = Math.max(maxAU, sp.a_AU * 1.6, sp.pMin * 1.3);
  });
  minAU = clamp(minAU, 0.004, 0.05);
  maxAU = clamp(maxAU, 30, 5000);

  const lMin = log10(minAU);
  const lMax = log10(maxAU);

  const findStarZoneIdx = (label: string) =>
    zones.findIndex((z) => z.title.startsWith(`Star ${label} `));
  const findPZoneIdx = (pairName: string) =>
    zones.findIndex((z) => z.title.startsWith(`Circumbinary ${pairName}`));
  const findSplitIdx = (pairName: string) =>
    h.splits.findIndex((s) => s.pair === pairName);

  const addStarRow = (rows: LinearRow[], sIdx: number) => {
    const st = h.stars[sIdx];
    if (!st) return;
    const zIdx = findStarZoneIdx(st.label);
    const z = zIdx >= 0 ? zones[zIdx] : null;
    rows.push({
      rowKind: 'star',
      starIdx: sIdx,
      star: st,
      zoneIdx: zIdx >= 0 ? zIdx : null,
      zone: z,
      height: z ? 236 : 96,
    });
  };

  const addCircumbinaryRowIfPresent = (rows: LinearRow[], pairName: string) => {
    const zIdx = findPZoneIdx(pairName);
    if (zIdx < 0) return;
    const spIdx = findSplitIdx(pairName);
    rows.push({
      rowKind: 'circumbinary',
      pairName,
      splitIdx: spIdx >= 0 ? spIdx : 0,
      split: spIdx >= 0 ? h.splits[spIdx] : null,
      zoneIdx: zIdx,
      zone: zones[zIdx],
      height: 236,
    });
  };

  const linearRows: LinearRow[] = [];
  if (h.stars.length === 1) {
    addStarRow(linearRows, 0);
  } else if (h.stars.length === 2) {
    addStarRow(linearRows, 0);
    addCircumbinaryRowIfPresent(linearRows, 'AB');
    addStarRow(linearRows, 1);
  } else if (h.stars.length === 3) {
    const isAB_C = h.splits[0]?.pair === 'AB + C';
    if (isAB_C) {
      addStarRow(linearRows, 0);
      addCircumbinaryRowIfPresent(linearRows, 'AB');
      addStarRow(linearRows, 1);
      addCircumbinaryRowIfPresent(linearRows, 'AB + C');
      addStarRow(linearRows, 2);
    } else {
      addStarRow(linearRows, 0);
      addCircumbinaryRowIfPresent(linearRows, 'A + BC');
      addStarRow(linearRows, 1);
      addCircumbinaryRowIfPresent(linearRows, 'BC');
      addStarRow(linearRows, 2);
    }
  } else {
    addStarRow(linearRows, 0);
    addCircumbinaryRowIfPresent(linearRows, 'AB');
    addStarRow(linearRows, 1);
    addCircumbinaryRowIfPresent(linearRows, 'AB + CD');
    addStarRow(linearRows, 2);
    addCircumbinaryRowIfPresent(linearRows, 'CD');
    addStarRow(linearRows, 3);
  }

  const topHeaderH = 52;
  const bottomAxisH = 54;
  const W = 1520;
  const totalRowsH = linearRows.reduce((acc, r) => acc + r.height, 0);
  const H = topHeaderH + totalRowsH + bottomAxisH;

  const treeColW = 310;
  const padR = 45;
  const trackX1 = treeColW + 25;
  const trackX2 = W - padR;

  const mx = (au: number) =>
    trackX1 +
    ((log10(Math.max(minAU, Math.min(maxAU, au))) - lMin) / (lMax - lMin)) *
      (trackX2 - trackX1);

  const auTicks = [
    0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2500,
  ].filter((t) => t >= minAU * 1.05 && t <= maxAU * 0.95);

  // Precompute vertical top & center Y for each row
  let curY = topHeaderH;
  const rowYInfo = linearRows.map((r) => {
    const top = curY;
    const mid = curY + r.height * 0.52;
    curY += r.height;
    return { top, mid, height: r.height };
  });

  // Find vertical centers of each star row for drawing binary connector brackets
  const starRowMidY: Record<string, number> = {};
  linearRows.forEach((r, idx) => {
    if (r.rowKind === 'star') {
      starRowMidY[r.star.label] = rowYInfo[idx].mid;
    }
  });

  return (
    <div className="w-full overflow-x-auto custom-scrollbar bg-[#04070e] rounded-xl border border-slate-800/90 shadow-inner">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: `${Math.round(100 * mapZoom)}%`,
          minWidth: '1080px',
          height: 'auto',
          display: 'block',
        }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="starGlowGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <pattern
            id="beltPattern"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1.5" cy="1.5" r="0.9" fill="#94a3b8" fillOpacity="0.45" />
            <circle cx="4.5" cy="4.2" r="0.7" fill="#cbd5e1" fillOpacity="0.35" />
          </pattern>
        </defs>

        {/* Background Starfield Grid */}
        <rect x={0} y={0} width={W} height={H} fill="#04070e" />

        {/* Left Hierarchy Sidebar Column Background */}
        <rect
          x={10}
          y={10}
          width={treeColW}
          height={H - 20}
          rx={12}
          fill="#0a0f1a"
          stroke="#1e293b"
          strokeWidth={1.5}
        />
        <text
          x={26}
          y={34}
          fill="#38bdf8"
          fontSize={12}
          fontWeight="bold"
          fontFamily="monospace"
        >
          {h.stars.length === 1 ? 'STELLAR SYSTEM' : 'STELLAR HIERARCHY'}
        </text>

        {/* Vertical AU Grid Lines across all orbital lanes */}
        {auTicks.map((tk) => {
          const x = mx(tk);
          return (
            <g key={tk}>
              <line
                x1={x}
                y1={topHeaderH - 12}
                x2={x}
                y2={H - bottomAxisH + 8}
                stroke="#131c2e"
                strokeWidth={1}
              />
              <text
                x={x}
                y={H - 22}
                fill="#64748b"
                fontSize={10.5}
                fontFamily="monospace"
                textAnchor="middle"
              >
                {tk >= 100 ? `${tk}` : tk} AU
              </text>
            </g>
          );
        })}

        {/* Left Column Binary Connector Line & Separation Badges in Gaps */}
        {h.stars.length >= 2 && (
          <g>
            {/* Main vertical spine joining all stars */}
            <line
              x1={26}
              y1={starRowMidY[h.stars[0].label] || topHeaderH + 40}
              x2={26}
              y2={starRowMidY[h.stars[h.stars.length - 1].label] || H - 80}
              stroke="#38bdf8"
              strokeWidth={2}
              strokeDasharray="4,3"
            />

            {/* Horizontal connector branches to each star card */}
            {h.stars.map((st) => {
              const y = starRowMidY[st.label];
              if (y == null) return null;
              return (
                <line
                  key={`branch-${st.label}`}
                  x1={26}
                  y1={y}
                  x2={42}
                  y2={y}
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                />
              );
            })}

            {/* Split distance badges in the gaps between adjacent stars */}
            {h.stars.slice(0, -1).map((st1, i) => {
              const st2 = h.stars[i + 1];
              const y1 = starRowMidY[st1.label];
              const y2 = starRowMidY[st2.label];
              if (y1 == null || y2 == null) return null;
              const yMid = (y1 + y2) / 2;

              let split: RealisticBinarySplit | undefined;
              if (h.stars.length === 2) {
                split = h.splits.find((s) => s.pair === 'AB') || h.splits[0];
              } else if (h.stars.length === 3) {
                split =
                  i === 0
                    ? h.splits.find((s) => s.pair === 'AB' || s.pair === 'A + BC') || h.splits[0]
                    : h.splits.find((s) => s.pair === 'BC' || s.pair === 'AB + C') || h.splits[1];
              } else if (h.stars.length === 4) {
                split =
                  i === 0
                    ? h.splits.find((s) => s.pair === 'AB')
                    : i === 1
                    ? h.splits.find((s) => s.pair === 'AB + CD')
                    : h.splits.find((s) => s.pair === 'CD');
              }

              if (!split) return null;
              const distLabel =
                split.a_AU >= 100
                  ? `${Math.round(split.a_AU)} AU`
                  : split.a_AU < 1
                  ? `${split.a_AU.toFixed(2)} AU`
                  : `${split.a_AU.toFixed(1)} AU`;

              const spIdx = h.splits.findIndex((s) => s === split);

              return (
                <g
                  key={`split-gap-${i}`}
                  className="cursor-pointer"
                  onClick={() => {
                    if (spIdx >= 0) selectEntity({ kind: 'split', splitIdx: spIdx });
                  }}
                >
                  <circle cx={26} cy={yMid} r={3} fill="#38bdf8" />
                  <line x1={26} y1={yMid} x2={44} y2={yMid} stroke="#38bdf8" strokeWidth={1.5} />
                  <rect
                    x={44}
                    y={yMid - 11}
                    width={80}
                    height={22}
                    rx={5}
                    fill="#0b1322"
                    stroke="#38bdf8"
                    strokeWidth={1.2}
                  />
                  <text
                    x={84}
                    y={yMid + 4}
                    fill="#38bdf8"
                    fontSize={10}
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {distLabel}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* Render Ordered Linear Rows (Stars + Circumbinary Zones Between Binaries) */}
        {linearRows.map((row, rIdx) => {
          const { top: laneTop, mid: midY, height: laneHeight } = rowYInfo[rIdx];

          const leftNode =
            row.rowKind === 'star' ? (
              (() => {
                const st = row.star;
                const sIdx = row.starIdx;
                const sRad = clamp(12 + 4 * log10(Math.max(0.08, st.mass)), 9, 20);
                const isSelected =
                  selectedEntity?.kind === 'star' && selectedEntity.starIdx === sIdx;

                return (
                  <g
                    className="cursor-pointer"
                    onClick={(e) => {
                      if (e.shiftKey) {
                        changeMapMode('orrery2d');
                        trackBody({ kind: 'star', starIdx: sIdx });
                      } else {
                        selectEntity({ kind: 'star', starIdx: sIdx });
                      }
                    }}
                  >
                    <rect
                      x={42}
                      y={midY - 34}
                      width={262}
                      height={68}
                      rx={10}
                      fill={isSelected ? '#172554' : '#111827'}
                      stroke={isSelected ? '#38bdf8' : '#2a3852'}
                      strokeWidth={isSelected ? 2 : 1.2}
                    />
                    {(() => {
                      const catLower = (st.category || '').toLowerCase();
                      const spLower = (st.spectralType || '').toLowerCase();
                      const isSMBH = catLower.includes('supermassive') || spLower.includes('smbh') || st.mass > 999999;
                      const isBH = isSMBH || catLower.includes('black hole') || spLower.includes('black hole') || spLower === 'bh' || spLower.startsWith('bh ');
                      if (isBH) {
                        const rH = isSMBH ? 8.0 : 4.2;
                        const rxD = isSMBH ? 15 : 9.5;
                        const ryD = isSMBH ? 5.5 : 3.5;
                        return (
                          <g>
                            <circle cx={74} cy={midY} r={rxD * 1.3} fill="#a855f7" opacity={0.25} />
                            <ellipse cx={74} cy={midY} rx={rxD} ry={ryD} stroke="#c084fc" strokeWidth={1.2} fill="none" transform={`rotate(-18, 74, ${midY})`} />
                            <ellipse cx={74} cy={midY} rx={rxD * 0.75} ry={ryD * 0.75} stroke="#f3e8ff" strokeWidth={0.8} fill="none" transform={`rotate(-18, 74, ${midY})`} />
                            <circle cx={74} cy={midY} r={rH} fill="#000000" stroke="#c084fc" strokeWidth={1} />
                          </g>
                        );
                      }
                      const starSpriteSize = (sRad / 0.42) * 2;
                      const starSpriteUrl = getProceduralStarSpriteDataUrl(st, 96);
                      return (
                        <g>
                          <circle
                            cx={74}
                            cy={midY}
                            r={sRad * 1.55}
                            fill={st.colorHex}
                            fillOpacity={0.22}
                          />
                          <image
                            href={starSpriteUrl}
                            x={74 - starSpriteSize / 2}
                            y={midY - starSpriteSize / 2}
                            width={starSpriteSize}
                            height={starSpriteSize}
                            preserveAspectRatio="xMidYMid meet"
                          />
                        </g>
                      );
                    })()}
                    <text
                      x={104}
                      y={midY - 4}
                      fill="#ffffff"
                      fontSize={13}
                      fontWeight="bold"
                      fontFamily="sans-serif"
                    >
                      Star {st.label} · {st.spectralType}
                    </text>
                    <text
                      x={104}
                      y={midY + 14}
                      fill="#94a3b8"
                      fontSize={10.5}
                      fontFamily="monospace"
                    >
                      {st.mass} M☉ · {st.lum} L☉ · {st.Teff}K
                    </text>
                  </g>
                );
              })()
            ) : (
              <g
                className="cursor-pointer"
                onClick={() =>
                  selectEntity({ kind: 'split', splitIdx: row.splitIdx })
                }
              >
                <line
                  x1={26}
                  y1={midY}
                  x2={42}
                  y2={midY}
                  stroke="#fbbf24"
                  strokeWidth={2}
                />
                <rect
                  x={42}
                  y={midY - 28}
                  width={262}
                  height={56}
                  rx={10}
                  fill="#17130a"
                  stroke="#fbbf24"
                  strokeWidth={1.5}
                  strokeDasharray="5,3"
                />
                <text
                  x={173}
                  y={midY - 6}
                  fill="#fde68a"
                  fontSize={11.5}
                  fontWeight="bold"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  ⚡ Circumbinary [{row.pairName}]
                </text>
                <text
                  x={173}
                  y={midY + 12}
                  fill="#fbbf24"
                  fontSize={9.5}
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {row.split
                    ? `Binary a = ${row.split.a_AU} AU (e=${row.split.e}) · P-Type`
                    : 'P-Type Circumbinary Zone'}
                </text>
              </g>
            );

          if (row.rowKind === 'star' && (!row.zone || row.zoneIdx === null)) {
            return (
              <g key={`row-${rIdx}`}>
                {leftNode}
                <rect
                  x={trackX1 - 8}
                  y={laneTop + 10}
                  width={trackX2 - trackX1 + 16}
                  height={laneHeight - 20}
                  rx={10}
                  fill="#080c15"
                  stroke="#1e293b"
                  strokeDasharray="4,4"
                />
                <text
                  x={(trackX1 + trackX2) / 2}
                  y={midY + 4}
                  fill="#64748b"
                  fontSize={11}
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  Star {row.star.label} Circumstellar (S-Type) Zone Cleared by Close Binary Companion — Orbits Form in Circumbinary Zone
                </text>
              </g>
            );
          }

          const z = row.zone!;
          const zIdx = row.zoneIdx!;
          const xIn = mx(z.a_in);
          const xOut = mx(z.a_out);
          const isCircumbinary = row.rowKind === 'circumbinary' || z.title.includes('Circumbinary');

          const hzInAU = 0.75 * Math.sqrt(z.lum);
          const hzOutAU = 1.7 * Math.sqrt(z.lum);
          // For a circumbinary system, do NOT show Habitable Zone or Snow Line if they fall inside the binary pair's orbit / inner stability limit (z.a_in)
          const showHZ = isCircumbinary
            ? hzInAU >= z.a_in && hzInAU < z.a_out
            : hzInAU < z.a_out;
          const showSnow = isCircumbinary
            ? z.a_snow >= z.a_in && z.a_snow <= z.a_out
            : z.a_snow <= z.a_out;

          const xH1 = mx(Math.max(z.a_in, hzInAU));
          const xH2 = mx(Math.min(z.a_out, hzOutAU));
          const xSnow = mx(z.a_snow);

          return (
            <g key={`row-${rIdx}`}>
              {leftNode}

              {/* Zone Lane Container */}
              <rect
                x={trackX1 - 8}
                y={laneTop + 6}
                width={trackX2 - trackX1 + 16}
                height={laneHeight - 12}
                rx={10}
                fill="#080d18"
                stroke={isCircumbinary ? '#fbbf2444' : '#1e293b'}
                strokeWidth={1.2}
              />

              {/* Zone Header Telemetry */}
              <text
                x={trackX1 + 8}
                y={laneTop + 26}
                fill="#38bdf8"
                fontSize={10.5}
                fontFamily="monospace"
              >
                {isCircumbinary ? (
                  <tspan fill="#fde68a" fontWeight="bold">
                    {z.title} &bull;{' '}
                  </tspan>
                ) : null}
                Disk: {z.diskMassEarth} M⊕
                {showHZ && xH2 > xH1
                  ? ` · Habitable Zone: ${hzInAU.toFixed(2)} – ${hzOutAU.toFixed(2)} AU`
                  : ''}
                {showSnow ? ` · Snow Line: ${z.a_snow.toFixed(2)} AU` : ''} · Stable Zone: [
                {z.a_in.toFixed(2)} – {z.a_out.toFixed(2)} AU]
              </text>

              {/* Habitable Zone Shaded Band (hidden if inside circumbinary orbit) */}
              {showHZ && xH2 > xH1 && (
                <g>
                  <rect
                    x={xH1}
                    y={laneTop + 48}
                    width={Math.max(4, xH2 - xH1)}
                    height={laneHeight - 66}
                    fill="rgba(16, 185, 129, 0.11)"
                    stroke="rgba(16, 185, 129, 0.32)"
                    strokeWidth={1}
                    rx={4}
                  />
                  <text
                    x={(xH1 + xH2) / 2}
                    y={laneTop + 60}
                    fill="#34d399"
                    fontSize={9}
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    HABITABLE ZONE
                  </text>
                </g>
              )}

              {/* Snow Line Vertical Marker (hidden if inside circumbinary orbit) */}
              {showSnow && (
                <g>
                  <line
                    x1={xSnow}
                    y1={laneTop + 48}
                    x2={xSnow}
                    y2={laneTop + laneHeight - 18}
                    stroke="#38bdf8"
                    strokeWidth={1.5}
                    strokeDasharray="5,4"
                  />
                </g>
              )}

              {/* Forbidden Inner / Outer Truncation Boundaries */}
              {xIn > trackX1 + 4 && (
                <rect
                  x={trackX1}
                  y={midY - 12}
                  width={xIn - trackX1}
                  height={24}
                  fill="rgba(239,68,68,0.08)"
                />
              )}
              {xOut < trackX2 - 4 && (
                <rect
                  x={xOut}
                  y={midY - 12}
                  width={trackX2 - xOut}
                  height={24}
                  fill="rgba(239,68,68,0.08)"
                />
              )}

              {/* Active Dynamical Zone Spine Line */}
              <line
                x1={xIn}
                y1={midY}
                x2={xOut}
                y2={midY}
                stroke="#334155"
                strokeWidth={2.5}
              />

              {/* Host Star(s) Anchor Icon at Left of Zone Spine */}
              {isCircumbinary && h.stars.length >= 2 ? (
                <g
                  className="cursor-pointer"
                  onClick={() => selectEntity({ kind: 'star', starIdx: 0 })}
                >
                  <circle
                    cx={Math.max(trackX1 + 14, xIn - 18)}
                    cy={midY - 6}
                    r={7}
                    fill={h.stars[0].colorHex}
                    stroke="#fff"
                    strokeWidth={1}
                  />
                  <circle
                    cx={Math.max(trackX1 + 22, xIn - 10)}
                    cy={midY + 6}
                    r={5.5}
                    fill={h.stars[1].colorHex}
                    stroke="#fff"
                    strokeWidth={1}
                  />
                </g>
              ) : (
                <circle
                  cx={Math.max(trackX1 + 12, xIn - 12)}
                  cy={midY}
                  r={8}
                  fill={
                    h.stars.find((s) => z.title.includes(`Star ${s.label}`))?.colorHex ||
                    h.stars[0].colorHex
                  }
                  stroke="#fff"
                  strokeWidth={1}
                  className="cursor-pointer"
                  onClick={() => selectEntity({ kind: 'star', starIdx: 0 })}
                />
              )}

              {/* Planets, Belts & Clickable Moons */}
              {z.bodies.map((b, bIdx) => {
                const bx = mx(b.a);
                const num = bIdx + 1;
                const labelAbove = bIdx % 2 === 1;

                if (b.kind === 'belt') {
                  const b1 = mx(Math.max(minAU, b.a - b.beltWidth));
                  const b2 = mx(Math.min(maxAU, b.a + b.beltWidth));
                  const isSel =
                    selectedEntity?.kind === 'belt' &&
                    selectedEntity.zoneIdx === zIdx &&
                    selectedEntity.bodyIdx === bIdx;

                  return (
                    <g
                      key={bIdx}
                      className="cursor-pointer group"
                      onClick={() =>
                        selectEntity({
                          kind: 'belt',
                          zoneIdx: zIdx,
                          bodyIdx: bIdx,
                        })
                      }
                    >
                      <rect
                        x={b1}
                        y={midY - 26}
                        width={Math.max(8, b2 - b1)}
                        height={52}
                        fill="url(#beltPattern)"
                        stroke={isSel ? '#38bdf8' : '#64748b'}
                        strokeWidth={isSel ? 2 : 1}
                        strokeDasharray="3,2"
                        rx={5}
                      />
                      <text
                        x={bx}
                        y={midY + 38}
                        fill="#94a3b8"
                        fontSize={9.5}
                        fontFamily="monospace"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        #{num} ({b.a.toFixed(2)} AU)
                      </text>
                    </g>
                  );
                }

                // Planet Node
                const rP = clamp(
                  6.5 + (4.2 * Math.log(Math.max(0.4, b.radiusEarth))) / Math.LN2,
                  6.5,
                  21
                );
                const zoneStar =
                  h.stars.find((s) => z.title.includes(`Star ${s.label}`)) ||
                  h.stars[0];
                const planetIconUrl = getProceduralPlanetIconDataUrl(
                  b,
                  null,
                  zoneStar?.colorHex || '#fff4e6',
                  zoneStar?.Teff || 5778,
                  0,
                  56
                );
                const planetImgSize = b.rings ? rP * 3.85 : rP * 2.75;
                const isPlanetSel =
                  selectedEntity?.kind === 'planet' &&
                  selectedEntity.zoneIdx === zIdx &&
                  selectedEntity.bodyIdx === bIdx;

                const moonDir = labelAbove ? 1 : -1;
                const labelY1 = labelAbove ? midY - rP - 19 : midY + rP + 14;
                const labelY2 = labelAbove ? midY - rP - 7 : midY + rP + 25;

                return (
                  <g key={bIdx}>
                    {/* Eccentricity Perihelion-Aphelion Whisker */}
                    <line
                      x1={mx(b.a * (1 - b.e))}
                      y1={midY}
                      x2={mx(b.a * (1 + b.e))}
                      y2={midY}
                      stroke="#94a3b8"
                      strokeWidth={2.5}
                    />

                    {/* Vertical Moon Chain Spine */}
                    {b.moons.length > 0 && (
                      <line
                        x1={bx}
                        y1={midY + moonDir * rP}
                        x2={bx}
                        y2={midY + moonDir * (rP + b.moons.length * 15 + 4)}
                        stroke="#475569"
                        strokeWidth={1.2}
                        strokeDasharray="2,2"
                      />
                    )}

                    {/* Clickable Moon Nodes (Low-Res Procedural Moon Icons on Overview) */}
                    {b.moons.map((m, mIdx) => {
                      const my = midY + moonDir * (rP + 13 + mIdx * 15);
                      const mRad = clamp(
                        3.4 + 0.9 * log10(Math.max(0.01, m.massLunar * 10)),
                        3.4,
                        6.2
                      );
                      const moonIconUrl = getProceduralPlanetIconDataUrl(
                        b,
                        m,
                        zoneStar?.colorHex || '#fff4e6',
                        zoneStar?.Teff || 5778,
                        mIdx,
                        36
                      );
                      const moonImgSize = mRad * 2.75;
                      const isMoonSel =
                        selectedEntity?.kind === 'moon' &&
                        selectedEntity.zoneIdx === zIdx &&
                        selectedEntity.bodyIdx === bIdx &&
                        selectedEntity.moonIdx === mIdx;

                      return (
                        <g
                          key={m.id || mIdx}
                          className="cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (e.shiftKey) {
                              changeMapMode('orrery2d');
                              trackBody({
                                kind: 'moon',
                                zoneIdx: zIdx,
                                bodyIdx: bIdx,
                                moonIdx: mIdx,
                              });
                            } else {
                              selectEntity({
                                kind: 'moon',
                                zoneIdx: zIdx,
                                bodyIdx: bIdx,
                                moonIdx: mIdx,
                              });
                            }
                          }}
                        >
                          <title>
                            {m.name} ({m.moonClass}) — Click for details · Shift+Click to track in Orrery
                          </title>
                          <circle cx={bx} cy={my} r={mRad + 3} fill="transparent" />
                          {isMoonSel && (
                            <circle
                              cx={bx}
                              cy={my}
                              r={mRad + 2}
                              fill="none"
                              stroke="#ffffff"
                              strokeWidth={1.5}
                            />
                          )}
                          <image
                            href={moonIconUrl}
                            x={bx - moonImgSize / 2}
                            y={my - moonImgSize / 2}
                            width={moonImgSize}
                            height={moonImgSize}
                          />
                        </g>
                      );
                    })}

                    {/* Clickable Planet Group */}
                    {(() => {
                      const claimInfo = getPlanetClaimInfo ? getPlanetClaimInfo(b, zIdx, bIdx) : null;
                      return (
                        <g
                          className="cursor-pointer"
                          onClick={(e) => {
                            if (e.shiftKey) {
                              changeMapMode('orrery2d');
                              trackBody({
                                kind: 'planet',
                                zoneIdx: zIdx,
                                bodyIdx: bIdx,
                              });
                            } else {
                              selectEntity({
                                kind: 'planet',
                                zoneIdx: zIdx,
                                bodyIdx: bIdx,
                              });
                            }
                          }}
                        >
                          <title>{`${claimInfo ? `[${claimInfo.empire.name} — ${claimInfo.designation}] ` : ''}Planet #${bIdx + 1}: ${b.planetClass.replace(/\s*\([^)]*\)/g, '')} — Click for details · Shift+Click to track in Orrery`}</title>
                          {/* Selection / Habitable Halo */}
                          {(isPlanetSel || b.planetClass.includes('Habitable')) && (
                            <circle
                              cx={bx}
                              cy={midY}
                              r={rP + 4.5}
                              fill="none"
                              stroke={isPlanetSel ? '#38bdf8' : '#10b981'}
                              strokeWidth={isPlanetSel ? 2.2 : 1.5}
                              strokeDasharray={isPlanetSel ? undefined : '3,2'}
                            />
                          )}

                          {/* Imperial Sovereignty Halo */}
                          {claimInfo && (
                            <circle
                              cx={bx}
                              cy={midY}
                              r={rP + (isPlanetSel ? 6.5 : 4.5)}
                              fill="none"
                              stroke={claimInfo.empire.color}
                              strokeWidth={2.0}
                              strokeDasharray={claimInfo.designation === 'Capital' ? undefined : '4,2'}
                            />
                          )}

                          {/* Low-Res Procedural Planet Portrait Icon (includes 3D rings, eyeball oceans, magma, bands) */}
                          <image
                            href={planetIconUrl}
                            x={bx - planetImgSize / 2}
                            y={midY - planetImgSize / 2}
                            width={planetImgSize}
                            height={planetImgSize}
                          />

                          {/* Minimal Label: ONLY Planet Number & Semi-Major Axis to 2 Decimal Places */}
                          <text
                            x={bx}
                            y={labelY1}
                            fill={claimInfo ? claimInfo.empire.color : '#f8fafc'}
                            fontSize={10}
                            fontWeight="bold"
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {claimInfo ? (claimInfo.designation === 'Capital' ? '👑 ' : '🚩 ') : ''}#{num}
                          </text>
                          <text
                            x={bx}
                            y={labelY2}
                            fill="#94a3b8"
                            fontSize={9}
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {b.a.toFixed(2)} AU
                          </text>
                        </g>
                      );
                    })()}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
});

SystemSchematicView.displayName = 'SystemSchematicView';

export default SystemSchematicView;
