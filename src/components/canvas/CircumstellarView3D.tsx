import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { StarSystem, PlanetArchetype } from '../../types/astrophysics';
import { computePlanetPhysics } from '../../core/generation/planets';
import { createPlanetShaderMaterial } from './PlanetShaderMaterial';
import { createStarShaderMaterial } from './StarShaderMaterial';
import { generateProceduralPlanetTextures } from '../../core/generation/planetTextures';
import {
  CircumstellarControlsOverlay,
  CircumstellarCameraPresets,
  createCoronaTexture,
} from './circumstellar';

interface CircumstellarView3DProps {
  selectedStar: StarSystem | null;
  selectedPlanetIndex: number;
  onSelectPlanet: (index: number) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

// 1. Central Host Star with Shader Photosphere, Granulation & Glowing Corona
const CentralStar: React.FC<{
  selectedStar: StarSystem;
  scaleAU: number;
  isPlaying: boolean;
  speed: number;
  onSelectSun: () => void;
}> = ({ selectedStar, scaleAU, isPlaying, speed, onSelectSun }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Sprite>(null);
  const state = selectedStar.starState;
  const timeRef = useRef(0);

  const starVisualRadius = useMemo(() => {
    let r = Math.max(0.65, state.radiusAU * scaleAU);
    return Math.min(8.0, r);
  }, [state.radiusAU, scaleAU]);

  const starColor = useMemo(() => new THREE.Color(selectedStar.colorData.hex), [selectedStar.colorData.hex]);

  const starMaterial = useMemo(() => {
    return createStarShaderMaterial({
      teff: state.Teff,
      phase: state.phase,
      spectralCat: selectedStar.colorData.cat,
      spectralMK: state.spectralMK,
      baseHex: selectedStar.colorData.hex,
    });
  }, [state.Teff, state.phase, selectedStar.colorData.cat, state.spectralMK, selectedStar.colorData.hex]);

  const coronaTexture = useMemo(() => createCoronaTexture(starColor), [starColor]);

  useFrame((_, delta) => {
    if (!isPlaying) return;
    timeRef.current += delta * 60 * speed;
    const curTime = timeRef.current;

    if (meshRef.current) {
      if (starMaterial.uniforms?.uTime) {
        starMaterial.uniforms.uTime.value = curTime * 0.025;
      }
      meshRef.current.rotation.y += 0.002 * speed;

      if (state.isPulsating) {
        const pulse = 1.0 + 0.18 * Math.sin(curTime * 0.12);
        meshRef.current.scale.set(pulse, pulse, pulse);
        if (glowRef.current) {
          glowRef.current.scale.set(pulse * starVisualRadius * 3.8, pulse * starVisualRadius * 3.8, 1);
        }
      } else if (glowRef.current) {
        const shimmer = 1.0 + 0.025 * Math.sin(curTime * 0.08);
        const baseScale = starVisualRadius * 3.8;
        glowRef.current.scale.set(baseScale * shimmer, baseScale * shimmer, 1);
      }
    }
  });

  return (
    <group onClick={(e) => { e.stopPropagation(); onSelectSun(); }}>
      <mesh ref={meshRef} material={starMaterial}>
        <sphereGeometry args={[starVisualRadius, 48, 48]} />
      </mesh>
      <sprite ref={glowRef} scale={[starVisualRadius * 3.8, starVisualRadius * 3.8, 1]}>
        <spriteMaterial
          map={coronaTexture}
          color={starColor}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
};

// 2. Habitable Zone Annulus Mesh
const HabitableZoneAnnulus: React.FC<{
  selectedStar: StarSystem;
  scaleAU: number;
}> = ({ selectedStar, scaleAU }) => {
  const state = selectedStar.starState;
  const geom = useMemo(() => {
    if (state.isSupernova || state.rOutHZ <= 0) return null;
    const innerR = Math.max(0.25, state.rInHZ * scaleAU);
    const outerR = Math.max(innerR + 0.25, state.rOutHZ * scaleAU);
    return new THREE.RingGeometry(innerR, outerR, 64);
  }, [state.isSupernova, state.rInHZ, state.rOutHZ, scaleAU]);

  if (!geom) return null;

  return (
    <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]}>
      <meshBasicMaterial
        color={0x10b981}
        side={THREE.DoubleSide}
        transparent
        opacity={0.22}
      />
    </mesh>
  );
};

// 3. Orbit Line Component
const OrbitRing: React.FC<{
  r: number;
  incRad: number;
  isEngulfed: boolean;
  isSelected: boolean;
}> = ({ r, incRad, isEngulfed, isSelected }) => {
  const lineObj = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const segs = 64;
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(
          Math.cos(a) * r,
          Math.sin(a) * r * Math.sin(incRad),
          Math.sin(a) * r
        )
      );
    }
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: isEngulfed ? 0xef4444 : isSelected ? 0x38bdf8 : 0x334155,
      transparent: true,
      opacity: isSelected ? 0.85 : 0.35,
    });
    return new THREE.Line(geom, mat);
  }, [r, incRad, isEngulfed, isSelected]);

  return <primitive object={lineObj} />;
};

// 4. Individual Planet with Procedural Textures & Orbital Motion
const PlanetBody: React.FC<{
  planet: PlanetArchetype;
  index: number;
  selectedStar: StarSystem;
  scaleAU: number;
  isExpanded: boolean;
  isSelected: boolean;
  isPlaying: boolean;
  speed: number;
  onSelect: () => void;
  onPositionUpdate: (index: number, pos: THREE.Vector3) => void;
}> = ({
  planet,
  index,
  selectedStar,
  scaleAU,
  isExpanded,
  isSelected,
  isPlaying,
  speed,
  onSelect,
  onPositionUpdate,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const state = selectedStar.starState;
  const phys = useMemo(
    () => computePlanetPhysics(planet, state, selectedStar.progenitorMass),
    [planet, state, selectedStar.progenitorMass]
  );

  const r = phys.currentA * scaleAU;
  const incRad = (planet.incDeg * Math.PI) / 180;
  const pRadius = Math.max(0.32, Math.min(1.3, planet.radiusEarth * (isExpanded ? 0.24 : 0.20)));

  const texturePack = useMemo(() => {
    return generateProceduralPlanetTextures(
      planet.id,
      selectedStar.id * 1000 + planet.id,
      planet.type,
      phys.currentA,
      state.rInHZ,
      state.rOutHZ
    );
  }, [planet.id, selectedStar.id, planet.type, phys.currentA, state.rInHZ, state.rOutHZ]);

  const material = useMemo(() => {
    return createPlanetShaderMaterial({
      diffuseTexture: texturePack.diffuseTexture,
      specularTexture: texturePack.specularTexture,
      nightTexture: texturePack.nightTexture,
      starColorHex: selectedStar.colorData.hex,
      planetType: planet.type,
      isEngulfed: phys.isEngulfed,
    });
  }, [texturePack, selectedStar.colorData.hex, planet.type, phys.isEngulfed]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    if (phys.isEngulfed) {
      meshRef.current.visible = false;
      return;
    }
    meshRef.current.visible = true;

    if (isPlaying) {
      // Keplerian velocity
      planet.angle +=
        0.015 *
        speed *
        (delta * 60) *
        Math.sqrt(Math.max(0.1, state.currentMass) / Math.pow(phys.currentA, 3));

      meshRef.current.position.set(
        Math.cos(planet.angle) * r,
        Math.sin(planet.angle) * r * Math.sin(incRad),
        Math.sin(planet.angle) * r
      );

      if (phys.isTidallyLocked) {
        meshRef.current.rotation.y = -planet.angle;
      } else {
        meshRef.current.rotation.y += 0.018 * speed * (delta * 60);
      }
    }

    onPositionUpdate(index, meshRef.current.position);
  });

  return (
    <group>
      <OrbitRing r={r} incRad={incRad} isEngulfed={phys.isEngulfed} isSelected={isSelected} />
      <mesh
        ref={meshRef}
        material={material}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <sphereGeometry args={[pRadius, 32, 32]} />
      </mesh>
    </group>
  );
};

// 5. Camera Tracking & Animation Controller
const CameraController: React.FC<{
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  selectedPlanetIndex: number;
  planetPositionsRef: React.RefObject<Map<number, THREE.Vector3>>;
}> = ({ controlsRef, selectedPlanetIndex, planetPositionsRef }) => {
  useFrame(() => {
    if (!controlsRef.current) return;
    if (selectedPlanetIndex >= 0 && planetPositionsRef.current) {
      const pPos = planetPositionsRef.current.get(selectedPlanetIndex);
      if (pPos) {
        controlsRef.current.target.lerp(pPos, 0.15);
        controlsRef.current.update();
      }
    }
  });

  return null;
};

export const CircumstellarView3D: React.FC<CircumstellarView3DProps> = ({
  selectedStar,
  selectedPlanetIndex,
  onSelectPlanet,
  isExpanded = false,
  onToggleExpand,
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const planetPositionsRef = useRef<Map<number, THREE.Vector3>>(new Map());

  const scaleAU = 6.0;

  const togglePlay = () => setIsPlaying((p: boolean) => !p);

  // Keyboard shortcut: Space toggles play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handlePositionUpdate = (idx: number, pos: THREE.Vector3) => {
    planetPositionsRef.current.set(idx, pos.clone());
  };

  const focusOnSun = () => {
    onSelectPlanet(-1);
    if (controlsRef.current && selectedStar) {
      controlsRef.current.target.set(0, 0, 0);
      const lastPlanet = selectedStar.planets[selectedStar.planets.length - 1];
      const maxAU = Math.max(lastPlanet?.currentA || 3, selectedStar.starState.rOutHZ, 3.5);
      const sysRad = maxAU * scaleAU * (isExpanded ? 1.4 : 1.7);
      controlsRef.current.object.position.set(sysRad * 0.7, sysRad * 0.8, sysRad * 0.7);
      controlsRef.current.update();
    }
  };

  const setCameraPreset = (preset: 'top' | 'inclined' | 'edge' | 'planet') => {
    if (!selectedStar || !controlsRef.current) return;
    if (preset === 'planet') {
      if (selectedPlanetIndex >= 0) return;
      onSelectPlanet(0);
      return;
    }

    onSelectPlanet(-1);
    controlsRef.current.target.set(0, 0, 0);
    const lastPlanet = selectedStar.planets[selectedStar.planets.length - 1];
    const maxAU = Math.max(lastPlanet?.currentA || 3, selectedStar.starState.rOutHZ, 3.5);
    const baseRadius = maxAU * scaleAU * (isExpanded ? 1.4 : 1.7);

    if (preset === 'top') {
      controlsRef.current.object.position.set(0, baseRadius, 0.01);
    } else if (preset === 'inclined') {
      controlsRef.current.object.position.set(baseRadius * 0.7, baseRadius * 0.8, baseRadius * 0.7);
    } else if (preset === 'edge') {
      controlsRef.current.object.position.set(baseRadius, 0.01, 0);
    }
    controlsRef.current.update();
  };

  if (!selectedStar) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#02040b] text-slate-500 font-mono text-xs">
        No star selected
      </div>
    );
  }

  const lastPlanet = selectedStar.planets[selectedStar.planets.length - 1];
  const maxAU = Math.max(lastPlanet?.currentA || 3, selectedStar.starState.rOutHZ, 3.5);
  const defaultRadius = maxAU * scaleAU * (isExpanded ? 1.4 : 1.7);

  return (
    <div
      id="section-06-circumstellar-view-3d"
      data-section="3D Circumstellar Habitable Zone & Solar System"
      className="w-full h-full relative overflow-hidden select-none"
    >
      <Canvas
        camera={{
          fov: 45,
          near: 0.01,
          far: 3000,
          position: [defaultRadius * 0.7, defaultRadius * 0.8, defaultRadius * 0.7],
        }}
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
        style={{ background: '#02040b' }}
      >
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.06}
          minDistance={1.2}
          maxDistance={defaultRadius * 4}
        />
        <ambientLight intensity={0.04} />
        <pointLight position={[0, 0, 0]} intensity={4.0} color={selectedStar.colorData.hex} />

        <CentralStar
          selectedStar={selectedStar}
          scaleAU={scaleAU}
          isPlaying={isPlaying}
          speed={speed}
          onSelectSun={focusOnSun}
        />

        <HabitableZoneAnnulus selectedStar={selectedStar} scaleAU={scaleAU} />

        {selectedStar.planets.map((p, idx) => (
          <PlanetBody
            key={p.id}
            planet={p}
            index={idx}
            selectedStar={selectedStar}
            scaleAU={scaleAU}
            isExpanded={isExpanded}
            isSelected={idx === selectedPlanetIndex}
            isPlaying={isPlaying}
            speed={speed}
            onSelect={() => onSelectPlanet(idx)}
            onPositionUpdate={handlePositionUpdate}
          />
        ))}

        <CameraController
          controlsRef={controlsRef}
          selectedPlanetIndex={selectedPlanetIndex}
          planetPositionsRef={planetPositionsRef}
        />
      </Canvas>

      {/* Floating Controls Overlay: Play/Pause, Speed Slider, Expand */}
      <CircumstellarControlsOverlay
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        speed={speed}
        onSpeedChange={setSpeed}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
      />

      {/* 3D Camera Angles Bar */}
      <CircumstellarCameraPresets
        onSetCameraPreset={setCameraPreset}
        onFocusSun={focusOnSun}
        onToggleActivePlanetFocus={() => {
          if (selectedPlanetIndex >= 0) {
            focusOnSun();
          } else if (selectedStar.planets.length > 0) {
            onSelectPlanet(0);
          }
        }}
        focusedPlanet={selectedPlanetIndex}
        selectedStar={selectedStar}
      />
    </div>
  );
};
