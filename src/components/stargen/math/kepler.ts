import {
  RealisticBinarySplit,
  RealisticStarSystemResult,
  SelectedMapEntity,
  Vec2AU,
  clamp,
} from '../types';

export interface System2DLayout {
  starPos: Record<string, Vec2AU>;
  baryPos: Record<string, Vec2AU>;
  binaryLinks: Array<{
    splitIdx: number;
    split: RealisticBinarySplit;
    center: Vec2AU;
    pos1: Vec2AU;
    pos2: Vec2AU;
    r1: number;
    r2: number;
  }>;
  zoneCenters: Vec2AU[];
  maxExtentAU: number;
}

/**
 * Computes exact 2D physical coordinates (in AU) for all stars, binary/trinary/quadruple
 * barycenters, and planetary zones so all zones around all stars can be plotted
 * simultaneously with proportional orbital radii.
 */
export function computeSystem2DLayout(
  res: RealisticStarSystemResult,
  timeYr = 0
): System2DLayout {
  const stars = res.hierarchy.stars;
  const splits = res.hierarchy.splits;
  const starPos: Record<string, Vec2AU> = {};
  const baryPos: Record<string, Vec2AU> = {};
  const binaryLinks: System2DLayout['binaryLinks'] = [];

  const getStarMass = (label: string) =>
    stars.find((s) => s.label === label)?.mass || 1.0;

  // Keplerian angular velocity (rad/yr) with smooth visual damping so both close and wide binaries visibly orbit
  const getSplitAngularVel = (a_AU: number, mTot: number) =>
    clamp(
      (0.85 * Math.sqrt(Math.max(0.1, mTot))) /
        Math.pow(Math.max(0.08, a_AU), 0.65),
      0.14,
      6.5
    ) *
    Math.PI *
    2;

  if (stars.length === 1) {
    starPos['A'] = { x: 0, y: 0 };
  } else if (stars.length === 2 && splits[0]) {
    const sp = splits[0];
    const mA = getStarMass('A');
    const mB = getStarMass('B');
    const mTot = Math.max(0.05, mA + mB);
    const rA = sp.a_AU * (mB / mTot);
    const rB = sp.a_AU * (mA / mTot);
    const angle = -0.28 + timeYr * getSplitAngularVel(sp.a_AU, mTot);
    baryPos['AB'] = { x: 0, y: 0 };
    starPos['A'] = { x: -rA * Math.cos(angle), y: -rA * Math.sin(angle) };
    starPos['B'] = { x: rB * Math.cos(angle), y: rB * Math.sin(angle) };
    binaryLinks.push({
      splitIdx: 0,
      split: sp,
      center: baryPos['AB'],
      pos1: starPos['A'],
      pos2: starPos['B'],
      r1: rA,
      r2: rB,
    });
  } else if (stars.length === 3 && splits.length >= 2) {
    const outerSp = splits[0];
    const innerSp = splits[1];
    const mA = getStarMass('A');
    const mB = getStarMass('B');
    const mC = getStarMass('C');

    if (outerSp.pair === 'AB + C') {
      const mAB = mA + mB;
      const mTot = Math.max(0.05, mAB + mC);
      const rAB = outerSp.a_AU * (mC / mTot);
      const rC = outerSp.a_AU * (mAB / mTot);
      const outerAngle =
        -0.18 + timeYr * getSplitAngularVel(outerSp.a_AU, mTot);
      baryPos['AB + C'] = { x: 0, y: 0 };
      baryPos['AB'] = {
        x: -rAB * Math.cos(outerAngle),
        y: -rAB * Math.sin(outerAngle),
      };
      starPos['C'] = {
        x: rC * Math.cos(outerAngle),
        y: rC * Math.sin(outerAngle),
      };
      binaryLinks.push({
        splitIdx: 0,
        split: outerSp,
        center: baryPos['AB + C'],
        pos1: baryPos['AB'],
        pos2: starPos['C'],
        r1: rAB,
        r2: rC,
      });

      const rA = innerSp.a_AU * (mB / Math.max(0.05, mAB));
      const rB = innerSp.a_AU * (mA / Math.max(0.05, mAB));
      const innerAngle =
        1.15 + timeYr * getSplitAngularVel(innerSp.a_AU, mAB);
      starPos['A'] = {
        x: baryPos['AB'].x - rA * Math.cos(innerAngle),
        y: baryPos['AB'].y - rA * Math.sin(innerAngle),
      };
      starPos['B'] = {
        x: baryPos['AB'].x + rB * Math.cos(innerAngle),
        y: baryPos['AB'].y + rB * Math.sin(innerAngle),
      };
      binaryLinks.push({
        splitIdx: 1,
        split: innerSp,
        center: baryPos['AB'],
        pos1: starPos['A'],
        pos2: starPos['B'],
        r1: rA,
        r2: rB,
      });
    } else {
      // A + (B+C)
      const mBC = mB + mC;
      const mTot = Math.max(0.05, mA + mBC);
      const rA = outerSp.a_AU * (mBC / mTot);
      const rBC = outerSp.a_AU * (mA / mTot);
      const outerAngle =
        -0.18 + timeYr * getSplitAngularVel(outerSp.a_AU, mTot);
      baryPos['A + BC'] = { x: 0, y: 0 };
      starPos['A'] = {
        x: -rA * Math.cos(outerAngle),
        y: -rA * Math.sin(outerAngle),
      };
      baryPos['BC'] = {
        x: rBC * Math.cos(outerAngle),
        y: rBC * Math.sin(outerAngle),
      };
      binaryLinks.push({
        splitIdx: 0,
        split: outerSp,
        center: baryPos['A + BC'],
        pos1: starPos['A'],
        pos2: baryPos['BC'],
        r1: rA,
        r2: rBC,
      });

      const rB = innerSp.a_AU * (mC / Math.max(0.05, mBC));
      const rC = innerSp.a_AU * (mB / Math.max(0.05, mBC));
      const innerAngle =
        1.15 + timeYr * getSplitAngularVel(innerSp.a_AU, mBC);
      starPos['B'] = {
        x: baryPos['BC'].x - rB * Math.cos(innerAngle),
        y: baryPos['BC'].y - rB * Math.sin(innerAngle),
      };
      starPos['C'] = {
        x: baryPos['BC'].x + rC * Math.cos(innerAngle),
        y: baryPos['BC'].y + rC * Math.sin(innerAngle),
      };
      binaryLinks.push({
        splitIdx: 1,
        split: innerSp,
        center: baryPos['BC'],
        pos1: starPos['B'],
        pos2: starPos['C'],
        r1: rB,
        r2: rC,
      });
    }
  } else if (stars.length >= 4 && splits.length >= 3) {
    const outerSp = splits[0];
    const spAB = splits[1];
    const spCD = splits[2];
    const mA = getStarMass('A');
    const mB = getStarMass('B');
    const mC = getStarMass('C');
    const mD = getStarMass('D');
    const mAB = mA + mB;
    const mCD = mC + mD;
    const mTot = Math.max(0.05, mAB + mCD);

    const rAB = outerSp.a_AU * (mCD / mTot);
    const rCD = outerSp.a_AU * (mAB / mTot);
    const outerAngle =
      -0.15 + timeYr * getSplitAngularVel(outerSp.a_AU, mTot);
    baryPos['AB + CD'] = { x: 0, y: 0 };
    baryPos['AB'] = {
      x: -rAB * Math.cos(outerAngle),
      y: -rAB * Math.sin(outerAngle),
    };
    baryPos['CD'] = {
      x: rCD * Math.cos(outerAngle),
      y: rCD * Math.sin(outerAngle),
    };
    binaryLinks.push({
      splitIdx: 0,
      split: outerSp,
      center: baryPos['AB + CD'],
      pos1: baryPos['AB'],
      pos2: baryPos['CD'],
      r1: rAB,
      r2: rCD,
    });

    const rA = spAB.a_AU * (mB / Math.max(0.05, mAB));
    const rB = spAB.a_AU * (mA / Math.max(0.05, mAB));
    const angleAB = 1.1 + timeYr * getSplitAngularVel(spAB.a_AU, mAB);
    starPos['A'] = {
      x: baryPos['AB'].x - rA * Math.cos(angleAB),
      y: baryPos['AB'].y - rA * Math.sin(angleAB),
    };
    starPos['B'] = {
      x: baryPos['AB'].x + rB * Math.cos(angleAB),
      y: baryPos['AB'].y + rB * Math.sin(angleAB),
    };
    binaryLinks.push({
      splitIdx: 1,
      split: spAB,
      center: baryPos['AB'],
      pos1: starPos['A'],
      pos2: starPos['B'],
      r1: rA,
      r2: rB,
    });

    const rC = spCD.a_AU * (mD / Math.max(0.05, mCD));
    const rD = spCD.a_AU * (mC / Math.max(0.05, mCD));
    const angleCD = -1.1 + timeYr * getSplitAngularVel(spCD.a_AU, mCD);
    starPos['C'] = {
      x: baryPos['CD'].x - rC * Math.cos(angleCD),
      y: baryPos['CD'].y - rC * Math.sin(angleCD),
    };
    starPos['D'] = {
      x: baryPos['CD'].x + rD * Math.cos(angleCD),
      y: baryPos['CD'].y + rD * Math.sin(angleCD),
    };
    binaryLinks.push({
      splitIdx: 2,
      split: spCD,
      center: baryPos['CD'],
      pos1: starPos['C'],
      pos2: starPos['D'],
      r1: rC,
      r2: rD,
    });
  }

  stars.forEach((s, idx) => {
    if (!starPos[s.label]) {
      starPos[s.label] = { x: idx * 10, y: 0 };
    }
  });

  const zoneCenters: Vec2AU[] = res.zones.map((z) => {
    if (z.title.startsWith('Star ')) {
      const lbl = z.title.charAt(5);
      return starPos[lbl] || { x: 0, y: 0 };
    }
    if (z.title.startsWith('Circumbinary ')) {
      const pairName = z.title
        .replace('Circumbinary ', '')
        .replace(' (P-Type)', '')
        .trim();
      return baryPos[pairName] || { x: 0, y: 0 };
    }
    return { x: 0, y: 0 };
  });

  let maxExtentAU = 2.0;
  Object.values(starPos).forEach((p) => {
    maxExtentAU = Math.max(maxExtentAU, Math.hypot(p.x, p.y) * 1.25);
  });
  res.zones.forEach((z, idx) => {
    const c = zoneCenters[idx] || { x: 0, y: 0 };
    const distCenter = Math.hypot(c.x, c.y);
    const furthestBodyAU = z.bodies.reduce(
      (mx, b) => Math.max(mx, b.kind === 'planet' ? b.a * (1 + b.e) : b.a + b.beltWidth),
      z.a_in * 2
    );
    maxExtentAU = Math.max(maxExtentAU, distCenter + furthestBodyAU * 1.18);
  });

  return {
    starPos,
    baryPos,
    binaryLinks,
    zoneCenters,
    maxExtentAU,
  };
}

export function evalKepler3D(
  centerAU: Vec2AU,
  a: number,
  e: number,
  incRad: number,
  omegaNode: number,
  argPeri: number,
  trueAnomaly: number
) {
  const eSafe = clamp(e, 0, 0.92);
  const r = (a * (1 - eSafe * eSafe)) / (1 + eSafe * Math.cos(trueAnomaly));
  const u = argPeri + trueAnomaly;
  const cosO = Math.cos(omegaNode);
  const sinO = Math.sin(omegaNode);
  const cosU = Math.cos(u);
  const sinU = Math.sin(u);
  const cosI = Math.cos(incRad);
  const sinI = Math.sin(incRad);

  const wx = centerAU.x + r * (cosO * cosU - sinO * sinU * cosI);
  const wy = centerAU.y + r * (sinO * cosU + cosO * sinU * cosI);
  const wz = r * (sinU * sinI);
  return { wx, wy, wz, r };
}

export function buildKepler3DPath(
  centerAU: Vec2AU,
  a: number,
  e: number,
  incRad: number,
  omegaNode: number,
  argPeri: number,
  steps = 64,
  project3D: (wx: number, wy: number, wz?: number) => { x: number; y: number }
): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const nu = (i / steps) * Math.PI * 2;
    const pos3 = evalKepler3D(centerAU, a, e, incRad, omegaNode, argPeri, nu);
    const p = project3D(pos3.wx, pos3.wy, pos3.wz);
    pts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  return pts.join(' ') + ' Z';
}

export function getBodyWorldPosAU(
  res: RealisticStarSystemResult,
  entity: SelectedMapEntity,
  timeYr: number,
  incScale: number,
  pitch = 0.94,
  yaw = -0.42,
  pxPerAU = 35
): Vec2AU | null {
  const layout = computeSystem2DLayout(res, timeYr);
  if (entity.kind === 'star') {
    const st = res.hierarchy.stars[entity.starIdx];
    if (!st) return null;
    const pos = layout.starPos[st.label] || { x: 0, y: 0 };
    return { x: pos.x, y: pos.y, z: 0 };
  }
  if (entity.kind === 'split') {
    const sp = res.hierarchy.splits[entity.splitIdx];
    if (!sp) return null;
    const pos = layout.baryPos[sp.pair] || { x: 0, y: 0 };
    return { x: pos.x, y: pos.y, z: 0 };
  }
  const z = res.zones[entity.zoneIdx];
  if (!z) return null;
  const b = z.bodies[entity.bodyIdx];
  if (!b) return null;
  const centerAU = layout.zoneCenters[entity.zoneIdx] || { x: 0, y: 0 };
  const meanMotion = 1.0 / Math.max(0.02, Math.pow(b.a, 1.5));
  const theta =
    -Math.PI / 3 +
    entity.bodyIdx * 2.39996 +
    entity.zoneIdx * 0.85 +
    timeYr * meanMotion * Math.PI * 2;
  const rawIncDeg = b.incDeg ?? (1.2 + (b.kind === 'planet' ? b.e : 0) * 8);
  const incRad = (clamp(rawIncDeg * incScale, 0, 75) * Math.PI) / 180;
  const omegaNode = ((b.omegaNodeDeg ?? (entity.bodyIdx * 15)) * Math.PI) / 180;
  const argPeri = (b.kind === 'planet' && b.argPeriDeg != null)
    ? (b.argPeriDeg * Math.PI) / 180
    : 0;
  const pos3 = evalKepler3D(
    centerAU,
    b.a,
    b.kind === 'planet' ? b.e : 0,
    incRad,
    omegaNode,
    argPeri,
    theta
  );

  if (entity.kind === 'moon' && b.kind === 'planet' && b.moons && b.moons.length > 0) {
    const mIdx = clamp(entity.moonIdx, 0, b.moons.length - 1);
    const mSpeed = 12 + mIdx * 5;
    const mAngle =
      theta +
      (mIdx * Math.PI * 2) / Math.max(1, b.moons.length) +
      timeYr * mSpeed;

    const closestPlanet = z.bodies.find((body) => body.kind === 'planet');
    const closestPeriAU = closestPlanet
      ? closestPlanet.a * (1 - closestPlanet.e)
      : z.a_in;
    const baselineRadAU = Math.min(0.08, Math.max(0.012, 0.04 * closestPeriAU));
    const closestPhysRad = closestPlanet ? closestPlanet.radiusEarth : 1.0;
    const physRad = b.radiusEarth || 1.0;
    const relRad = Math.max(0.0001, physRad / closestPhysRad);
    const rawRadAU = baselineRadAU * Math.sqrt(relRad);
    const pRad = Math.min(130, Math.max(8, rawRadAU * pxPerAU));
    const mDist = pRad + Math.max(4, pRad * (0.55 + mIdx * 0.38));

    const dxScreen = mDist * Math.cos(mAngle);
    const dyScreen =
      mDist * Math.sin(mAngle) * Math.max(0.32, Math.cos(pitch * 0.78));

    // Convert screen offset into camera focal offset in AU
    const xCam = -dxScreen / Math.max(1, pxPerAU);
    const yCam = -dyScreen / Math.max(1, pxPerAU);
    const cosP = Math.max(0.2, Math.cos(pitch));
    const x1 = xCam;
    const y1 = yCam / cosP;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const dAU_x = x1 * cosY + y1 * sinY;
    const dAU_y = -x1 * sinY + y1 * cosY;

    return {
      x: pos3.wx - dAU_x,
      y: pos3.wy - dAU_y,
      z: pos3.wz,
    };
  }

  return { x: pos3.wx, y: pos3.wy, z: pos3.wz };
}
