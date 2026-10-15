import React, { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { FilterCategory, StarSystem } from '../../types/astrophysics';
import { SectorControlsOverlay, SectorTooltip } from './sector';

interface SectorView3DProps {
  stars: StarSystem[];
  selectedStar: StarSystem | null;
  onSelectStar: (star: StarSystem) => void;
  activeFilter: FilterCategory;
  radiusLy: number;
}

// Concentric Metric Range Rings (Light-Years Metric)
const RangeRings: React.FC<{ radiusLy: number }> = ({ radiusLy }) => {
  const lineObjects = useMemo(() => {
    return [0.25, 0.5, 0.75, 1.0, 1.25].map((rf) => {
      const segs = 64;
      const r = radiusLy * rf;
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      }
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.18 });
      return new THREE.Line(geom, mat);
    });
  }, [radiusLy]);

  return (
    <group>
      {lineObjects.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
    </group>
  );
};

// Selection Indicator Ring facing camera
const SelectionMarker: React.FC<{ selectedStar: StarSystem | null }> = ({ selectedStar }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (meshRef.current && selectedStar) {
      meshRef.current.quaternion.copy(camera.quaternion);
    }
  });

  if (!selectedStar) return null;

  return (
    <mesh
      ref={meshRef}
      position={[selectedStar.x, selectedStar.z, selectedStar.y]}
    >
      <ringGeometry args={[2.5, 3.2, 32]} />
      <meshBasicMaterial color={0x38bdf8} side={THREE.DoubleSide} transparent opacity={0.85} />
    </mesh>
  );
};

// Procedural star texture for points
function createStarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
    grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.25)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Starfield Points in R3F with Native Raycasting
const StarPoints: React.FC<{
  stars: StarSystem[];
  activeFilter: FilterCategory;
  onHoverStar: (star: StarSystem | null, event?: any) => void;
  onSelectStar: (star: StarSystem) => void;
}> = ({ stars, activeFilter, onHoverStar, onSelectStar }) => {
  const { geometry, starTexture } = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];

    stars.forEach((star) => {
      let matches = true;
      if (activeFilter === 'ob') matches = star.colorData.cat === 'ob';
      else if (activeFilter === 'g') matches = star.colorData.cat === 'g';
      else if (activeFilter === 'km') matches = star.colorData.cat === 'km';
      else if (activeFilter === 'remnant') matches = star.starState.isRemnant;
      else if (activeFilter === 'hz') matches = star.hasHZPlanet;

      positions.push(star.x, star.z, star.y);

      if (!matches) {
        colors.push(0.2, 0.25, 0.35);
      } else {
        colors.push(star.colorData.r / 255, star.colorData.g / 255, star.colorData.b / 255);
      }
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return { geometry: geom, starTexture: createStarTexture() };
  }, [stars, activeFilter]);

  return (
    <points
      geometry={geometry}
      onPointerMove={(e) => {
        if (e.index !== undefined && stars[e.index]) {
          onHoverStar(stars[e.index], e);
        }
      }}
      onPointerOut={() => onHoverStar(null)}
      onClick={(e) => {
        if (e.index !== undefined && stars[e.index]) {
          onSelectStar(stars[e.index]);
        }
      }}
    >
      <pointsMaterial
        size={8}
        vertexColors
        map={starTexture}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};

export const SectorView3D: React.FC<SectorView3DProps> = ({
  stars,
  selectedStar,
  onSelectStar,
  activeFilter,
  radiusLy,
}) => {
  const [hoveredStar, setHoveredStar] = useState<StarSystem | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleHover = (star: StarSystem | null, e?: any) => {
    setHoveredStar(star);
    if (star && e && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({
        x: e.clientX - rect.left + 12,
        y: e.clientY - rect.top + 12,
      });
    } else {
      setTooltipPos(null);
    }
  };

  const handleResetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.object.position.set(
        radiusLy * 1.5,
        radiusLy * 1.8,
        radiusLy * 1.5
      );
      controlsRef.current.update();
    }
  };

  const handleZoom = (factor: number) => {
    if (controlsRef.current) {
      const cam = controlsRef.current.object;
      cam.position.multiplyScalar(factor);
      controlsRef.current.update();
    }
  };

  return (
    <div
      ref={containerRef}
      id="section-03-galactic-sector-3d"
      data-section="3D Galactic Sector Viewport"
      className="w-full h-full relative overflow-hidden"
    >
      <Canvas
        camera={{
          fov: 45,
          near: 0.1,
          far: radiusLy * 25,
          position: [radiusLy * 1.5, radiusLy * 1.8, radiusLy * 1.5],
        }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#02040b' }}
      >
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.06}
          minDistance={8}
          maxDistance={radiusLy * 12}
        />
        <RangeRings radiusLy={radiusLy} />
        <SelectionMarker selectedStar={selectedStar} />
        <StarPoints
          stars={stars}
          activeFilter={activeFilter}
          onHoverStar={handleHover}
          onSelectStar={onSelectStar}
        />
      </Canvas>

      {/* 3D Navigation Controls HUD */}
      <SectorControlsOverlay
        radiusLy={radiusLy}
        onZoomIn={() => handleZoom(0.8)}
        onZoomOut={() => handleZoom(1.25)}
        onResetCamera={handleResetCamera}
      />

      {/* Hover Tooltip */}
      {hoveredStar && tooltipPos && (
        <SectorTooltip
          hoveredStar={hoveredStar}
          position={tooltipPos}
        />
      )}

      {/* Bottom Footer Info */}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-400 pointer-events-none">
        <span className="text-slate-500">Left-Drag: Rotate 3D &bull; Right-Drag: Pan &bull; Wheel: Zoom</span>
        <span className="text-slate-400">Click Star to Inspect</span>
      </div>
    </div>
  );
};
