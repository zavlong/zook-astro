import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { ActiveAppMode } from '../../types/astrophysics';
import {
  Rocket,
  Wrench,
  Activity,
  Globe,
  Sun,
  Layers,
  Sparkles,
  ArrowRight,
  Volume2,
  VolumeX,
  Radio
} from 'lucide-react';

interface Props {
  onSelectApp: (mode: ActiveAppMode) => void;
}

export const ShowcaseHome: React.FC<Props> = ({ onSelectApp }) => {
  const mainCanvasRef = useRef<HTMLDivElement>(null);
  const sectorMiniCanvasRef = useRef<HTMLDivElement>(null);
  const architectMiniCanvasRef = useRef<HTMLDivElement>(null);

  const [hoveredCard, setHoveredCard] = useState<'sector' | 'architect' | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'instruments' | 'specs'>('overview');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioIntervalRef = useRef<any>(null);
  const audioNodesRef = useRef<any>(null);

  // Cleanup ambient soundscape on component unmount
  useEffect(() => {
    return () => {
      if (audioIntervalRef.current) {
        clearTimeout(audioIntervalRef.current);
      }
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch {}
      }
    };
  }, []);

  // 1. High-Precision Background 3D Deep Space Galactic Canvas
  useEffect(() => {
    const container = mainCanvasRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020409, 0.0006);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2500);
    camera.position.set(0, 35, 180);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Create soft circular star sprite texture programmatically with crisp optical core
    const createStarTexture = () => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d')!;
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.25, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.45, 'rgba(240, 248, 255, 0.9)');
      grad.addColorStop(0.7, 'rgba(180, 220, 255, 0.4)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(c);
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      return tex;
    };

    // Create subtle, ethereal organic fractal nebula cloud texture
    const createNebulaCloudTexture = (centerHex: string, midHex: string, edgeHex: string) => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d')!;

      // Background transparent
      ctx.clearRect(0, 0, 256, 256);

      // Render 24 overlapping soft organic gas lobes with random offsets
      const seedRng = [
        { x: 128, y: 128, r: 100, a: 0.30 },
        { x: 105, y: 110, r: 80, a: 0.22 },
        { x: 155, y: 120, r: 85, a: 0.22 },
        { x: 120, y: 150, r: 75, a: 0.18 },
        { x: 145, y: 145, r: 70, a: 0.18 },
        { x: 90, y: 140, r: 65, a: 0.15 },
        { x: 165, y: 105, r: 60, a: 0.15 },
        { x: 130, y: 85, r: 60, a: 0.12 },
        { x: 80, y: 95, r: 50, a: 0.12 },
        { x: 175, y: 145, r: 55, a: 0.12 },
      ];

      seedRng.forEach(lobe => {
        const grad = ctx.createRadialGradient(lobe.x, lobe.y, 0, lobe.x, lobe.y, lobe.r);
        grad.addColorStop(0, centerHex);
        grad.addColorStop(0.4, midHex);
        grad.addColorStop(0.8, edgeHex);
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.globalAlpha = lobe.a;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lobe.x, lobe.y, lobe.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Ensure outer perimeter feathers seamlessly to 100% transparent zero alpha
      const borderVignette = ctx.createRadialGradient(128, 128, 65, 128, 128, 128);
      borderVignette.addColorStop(0, 'rgba(0,0,0,1)');
      borderVignette.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = borderVignette;
      ctx.fillRect(0, 0, 256, 256);
      ctx.globalCompositeOperation = 'source-over';

      const texture = new THREE.CanvasTexture(c);
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      return texture;
    };

    const starTexture = createStarTexture();
    const cyanNebulaTex = createNebulaCloudTexture('rgba(56, 189, 248, 0.28)', 'rgba(14, 116, 144, 0.12)', 'rgba(3, 105, 161, 0.02)');
    const magentaNebulaTex = createNebulaCloudTexture('rgba(244, 63, 94, 0.28)', 'rgba(168, 85, 247, 0.12)', 'rgba(91, 33, 182, 0.02)');
    const goldNebulaTex = createNebulaCloudTexture('rgba(251, 191, 36, 0.25)', 'rgba(217, 119, 6, 0.10)', 'rgba(180, 83, 9, 0.02)');
    const violetNebulaTex = createNebulaCloudTexture('rgba(192, 132, 252, 0.24)', 'rgba(126, 34, 206, 0.09)', 'rgba(59, 7, 100, 0.02)');

    // 1.1 Galactic Disk Coordinate Frame (tilted 0.45 rad for authentic astronomical edge-on perspective)
    const galaxyDiskGroup = new THREE.Group();
    galaxyDiskGroup.rotation.x = 0.45;
    scene.add(galaxyDiskGroup);

    // Volumetric 3D Nebular Cloud System - Delicate, translucent celestial gas filaments
    const nebulaGroup = new THREE.Group();
    galaxyDiskGroup.add(nebulaGroup);

    interface NebulaCloud {
      mesh: THREE.Mesh;
      baseRotSpeed: number;
      orbitSpeed: number;
      orbitRadius: number;
      orbitAngle: number;
    }
    const nebulaClouds: NebulaCloud[] = [];

    const cloudDefs = [
      // Core Supermassive Accretion Nebula (Warm Gold & Violet) - Soft, ethereal core glow
      { tex: goldNebulaTex, scale: 200, dist: 25, color: 0xffd28a, opacity: 0.11 },
      { tex: violetNebulaTex, scale: 220, dist: 45, color: 0xc084fc, opacity: 0.09 },
      { tex: goldNebulaTex, scale: 180, dist: 70, color: 0xf59e0b, opacity: 0.08 },

      // Arm 1: Carina/Rosette Ionized Hydrogen (Magenta / Deep Crimson)
      { tex: magentaNebulaTex, scale: 250, dist: 110, color: 0xf43f5e, opacity: 0.10 },
      { tex: magentaNebulaTex, scale: 230, dist: 150, color: 0xe11d48, opacity: 0.09 },
      { tex: violetNebulaTex, scale: 260, dist: 190, color: 0x9333ea, opacity: 0.08 },
      { tex: magentaNebulaTex, scale: 240, dist: 240, color: 0xfb7185, opacity: 0.07 },

      // Arm 2: Cygnus/Orion Reflection Complex (Cyan / Aquamarine / Sky Blue)
      { tex: cyanNebulaTex, scale: 250, dist: 120, color: 0x38bdf8, opacity: 0.10 },
      { tex: cyanNebulaTex, scale: 230, dist: 170, color: 0x06b6d4, opacity: 0.09 },
      { tex: cyanNebulaTex, scale: 260, dist: 220, color: 0x0284c7, opacity: 0.08 },
      { tex: violetNebulaTex, scale: 250, dist: 260, color: 0x7c3aed, opacity: 0.07 },

      // Diffuse Interstellar Bridges & Veil Filaments
      { tex: cyanNebulaTex, scale: 270, dist: 85, color: 0x22d3ee, opacity: 0.08 },
      { tex: magentaNebulaTex, scale: 250, dist: 140, color: 0xf43f5e, opacity: 0.07 },
      { tex: goldNebulaTex, scale: 220, dist: 125, color: 0xfbbf24, opacity: 0.08 },
      { tex: violetNebulaTex, scale: 240, dist: 200, color: 0xa855f7, opacity: 0.06 },
    ];

    cloudDefs.forEach((def, idx) => {
      const mat = new THREE.MeshBasicMaterial({
        map: def.tex,
        color: new THREE.Color(def.color),
        transparent: true,
        opacity: def.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      const plane = new THREE.Mesh(new THREE.PlaneGeometry(def.scale, def.scale), mat);
      const angle = (idx / cloudDefs.length) * Math.PI * 2 + (idx % 2 ? 0.35 : 0);
      const x = Math.cos(angle) * def.dist;
      const z = Math.sin(angle) * def.dist;
      const y = (Math.random() - 0.5) * 16;

      plane.position.set(x, y, z);
      plane.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.15;
      plane.rotation.z = Math.random() * Math.PI * 2;
      nebulaGroup.add(plane);

      nebulaClouds.push({
        mesh: plane,
        baseRotSpeed: (Math.random() - 0.5) * 0.003,
        orbitSpeed: 0.008 / (1 + def.dist * 0.01),
        orbitRadius: def.dist,
        orbitAngle: angle
      });
    });

    // 1.2 Ultra-Dense High-Fidelity Milky Way Starfield (180,000 particles)
    // Features 14 dense star clusters (open clusters, globulars, and H-II starburst nurseries)
    // plus dense galactic bulge and tightly focused spiral arm spines
    const starCount = 180000;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    const starAlphas = new Float32Array(starCount);

    // 14 Dense Stellar Clusters (Globular clusters, Pleiades-style open clusters, and Carina/Orion nurseries)
    const denseClusters = [
      // Core & Near-Bulge Globular Clusters & Sagittarius Star Clouds
      { x: 18, z: 12, r: 14, col: 0xffedd5 },
      { x: -18, z: -14, r: 12, col: 0xfef08a },
      { x: 28, z: -22, r: 15, col: 0xfcd34d },
      { x: -25, z: 20, r: 14, col: 0xffedd5 },
      // Carina & Orion Open Clusters / Bright Blue Supergiant swarms
      { x: 78, z: 58, r: 18, col: 0x38bdf8 },
      { x: -82, z: -62, r: 17, col: 0x60a5fa },
      { x: 128, z: -88, r: 20, col: 0x38bdf8 },
      { x: -122, z: 102, r: 19, col: 0x93c5fd },
      // Perseus Double Cluster & H-II Nursery Knots
      { x: 62, z: -118, r: 15, col: 0xf43f5e },
      { x: -68, z: 128, r: 16, col: 0xf43f5e },
      { x: 158, z: 78, r: 22, col: 0xffffff },
      { x: -162, z: -72, r: 20, col: 0xfef08a },
      { x: 192, z: -32, r: 22, col: 0x38bdf8 },
      { x: -188, z: 42, r: 20, col: 0x60a5fa }
    ];

    for (let i = 0; i < starCount; i++) {
      let x = 0, y = 0, z = 0;
      let col = new THREE.Color();
      let isBulge = false;

      const sectorRoll = Math.random();

      if (sectorRoll < 0.25) {
        // [ZONE 0] Dense Star Clusters & Stellar Nurseries (~25% of stars / 45,000 particles)
        // High localized density with Gaussian falloff, creating visible clusters
        const cl = denseClusters[i % denseClusters.length];
        const offset = Math.pow(Math.random(), 1.7) * cl.r;
        const angle = Math.random() * Math.PI * 2;

        x = cl.x + Math.cos(angle) * offset;
        z = cl.z + Math.sin(angle) * offset;
        y = (Math.random() - 0.5) * (cl.r * 0.45 * Math.exp(-offset / cl.r));

        col.setHex(cl.col);
        if (Math.random() < 0.25) {
          col.lerp(new THREE.Color(0xffffff), 0.5);
        }
      } else if (sectorRoll < 0.50) {
        // [ZONE A] Galactic Bulge & Central Sgr A* Nucleus (~25% of stars / 45,000 particles)
        // Packed central stellar core with warm Population II golden/amber stars
        isBulge = true;
        const dist = Math.pow(Math.random(), 1.7) * 48;
        const angle = Math.random() * Math.PI * 2;
        const barStretch = 1.35;

        x = (Math.cos(angle) * dist) * barStretch;
        z = Math.sin(angle) * dist;
        y = (Math.random() - 0.5) * (15 * Math.exp(-dist / 28));

        const rType = Math.random();
        if (rType < 0.42) {
          col.setHex(0xfef08a); // G-Class Warm Solar
        } else if (rType < 0.75) {
          col.setHex(0xfcd34d); // Amber Gold
        } else {
          col.setHex(0xfb923c); // K-Class Orange Giant
        }

        if (dist < 16) {
          col.lerp(new THREE.Color(0xfff7ed), 0.75); // Radiant central core
        }
      } else if (sectorRoll < 0.88) {
        // [ZONE B] The 4 Logarithmic Spiral Arm Spines of the Milky Way (~38% of stars / ~68,000 particles)
        // Tightly focused stellar arms (Perseus, Scutum-Centaurus, Sagittarius-Carina, Outer)
        const armIdx = i % 4;
        const armBase = armIdx * (Math.PI / 2);
        const dist = 18 + Math.pow(Math.random(), 0.65) * 360;

        // Logarithmic spiral pitch with tight Gaussian arm spine
        const spiralAngle = Math.log(dist / 16) * 2.1 + armBase;
        const dispersion = (Math.random() - 0.5) * (0.16 + dist * 0.0004);
        const angle = spiralAngle + dispersion;

        const rScatter = (Math.random() - 0.5) * (6 + dist * 0.06);
        const r = Math.max(8, dist + rScatter);

        x = Math.cos(angle) * r;
        z = Math.sin(angle) * r;

        // Milky Way Thin Disk exponential scale height
        const scaleHeight = 3.8 * Math.exp(-r / 200) + 1.4;
        y = (Math.random() - 0.5) * scaleHeight * 2;

        // Spiral arm stellar photometry (OBAFGKM + H-II Starbursts)
        const pType = Math.random();
        if (pType < 0.10) {
          col.setHex(0xf43f5e); // H-II Ionization nursery (Magenta/Crimson)
        } else if (pType < 0.40) {
          col.setHex(0x38bdf8); // Hot O/B Supergiants (Electric Cyan)
        } else if (pType < 0.70) {
          col.setHex(0xffffff); // Brilliant A/F Stars (Pure White)
        } else if (pType < 0.88) {
          col.setHex(0xfef08a); // Solar Analogs (Warm Yellow)
        } else {
          col.setHex(0xfb923c); // K/M Dwarfs (Warm Orange)
        }
      } else {
        // [ZONE C] Diffuse Inter-Arm Disk & Outer Galactic River (~12% of stars / ~22,000 particles)
        // Bridges between the arms to complete the continuous milky sheen
        const dist = 10 + Math.pow(Math.random(), 0.70) * 380;
        const angle = Math.random() * Math.PI * 2;

        x = Math.cos(angle) * dist;
        z = Math.sin(angle) * dist;
        y = (Math.random() - 0.5) * (7.5 * Math.exp(-dist / 220) + 2.2);

        const dType = Math.random();
        if (dType < 0.55) {
          col.setHex(0xffffff);
        } else if (dType < 0.82) {
          col.setHex(0xbae6fd);
        } else {
          col.setHex(0xfef08a);
        }
      }

      starPositions[i * 3] = x;
      starPositions[i * 3 + 1] = y;
      starPositions[i * 3 + 2] = z;

      starColors[i * 3] = col.r;
      starColors[i * 3 + 1] = col.g;
      starColors[i * 3 + 2] = col.b;

      // Multi-Tier Depth Hierarchy:
      // - 78% Pinpoint Micro-Stars (0.8px - 1.4px delicate diamond dust for dense milky river)
      // - 17% Intermediate Field Stars (1.5px - 2.5px distinct stellar points)
      // - 5% Luminous Foreground Beacons (2.8px - 4.2px bright gems)
      const tierRoll = Math.random();
      let baseSize: number;
      let alpha: number;

      if (tierRoll < 0.78) {
        baseSize = 0.85 + Math.random() * 0.50;
        alpha = 0.75 + Math.random() * 0.25;
      } else if (tierRoll < 0.95) {
        baseSize = 1.5 + Math.random() * 0.8;
        alpha = 0.88 + Math.random() * 0.12;
      } else {
        baseSize = 2.6 + Math.random() * 1.3;
        alpha = 1.0;
      }

      if (isBulge) {
        alpha = 1.0;
        baseSize *= 1.12;
      }

      starSizes[i] = baseSize;
      starAlphas[i] = alpha;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(starColors, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
    starGeo.setAttribute('aAlpha', new THREE.BufferAttribute(starAlphas, 1));

    // Custom WebGL Points Shader Material with per-star size attenuation and alpha modulation
    const starShaderMat = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: starTexture }
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (220.0 / -mvPosition.z);
          // Realistic astronomical point sizes: pinpoint 0.8px to crisp beacon 4.2px
          gl_PointSize = clamp(gl_PointSize, 0.8, 4.2);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(pointTexture, gl_PointCoord);
          gl_FragColor = vec4(vColor, 1.0) * tex.a * vAlpha;
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const galaxyPoints = new THREE.Points(starGeo, starShaderMat);
    galaxyDiskGroup.add(galaxyPoints);

    // Interactive mouse parallax
    let mouse = { x: 0, y: 0 };
    let targetCamera = { x: 0, y: 35, z: 180 };

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      targetCamera.x = mouse.x * 35;
      targetCamera.y = 35 + mouse.y * 22;
      targetCamera.z = 180 + Math.abs(mouse.x) * 15;
    };

    window.addEventListener('mousemove', onMouseMove);

    const onResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', onResize);

    // Animation Loop
    let animId = 0;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth galaxy rotation
      galaxyPoints.rotation.y = elapsed * 0.02;

      // Organic drift and rotation for volumetric nebulae
      nebulaClouds.forEach((cloud) => {
        cloud.orbitAngle += cloud.orbitSpeed * 0.02;
        cloud.mesh.position.x = Math.cos(cloud.orbitAngle) * cloud.orbitRadius;
        cloud.mesh.position.z = Math.sin(cloud.orbitAngle) * cloud.orbitRadius;
        cloud.mesh.rotation.z += cloud.baseRotSpeed;
      });

      // Smooth camera interpolation
      camera.position.x += (targetCamera.x - camera.position.x) * 0.04;
      camera.position.y += (targetCamera.y - camera.position.y) * 0.04;
      camera.position.z += (targetCamera.z - camera.position.z) * 0.04;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      starGeo.dispose();
      starShaderMat.dispose();
      starTexture.dispose();
      cyanNebulaTex.dispose();
      magentaNebulaTex.dispose();
      goldNebulaTex.dispose();
      violetNebulaTex.dispose();
    };
  }, []);

  // 2. Mini Live 3D Preview: 3D Sector Simulator (Raymarched Star & Orbiting Planet)
  useEffect(() => {
    const container = sectorMiniCanvasRef.current;
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 8, 22);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Star
    const starGeo = new THREE.SphereGeometry(3.6, 32, 32);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xfff099 });
    const star = new THREE.Mesh(starGeo, starMat);
    scene.add(star);

    // Corona halo
    const haloGeo = new THREE.SphereGeometry(4.8, 32, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    scene.add(halo);

    // Orbit Ring
    const orbitGeo = new THREE.RingGeometry(11.8, 12.0, 64);
    const orbitMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
    const orbitRing = new THREE.Mesh(orbitGeo, orbitMat);
    orbitRing.rotation.x = Math.PI / 2;
    scene.add(orbitRing);

    // Orbiting Planet
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.6, metalness: 0.2 })
    );
    scene.add(planet);

    const light = new THREE.PointLight(0xfff5cc, 2.5, 50);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));

    let animId = 0;
    let t = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      t += 0.02;
      planet.position.x = Math.cos(t) * 12;
      planet.position.z = Math.sin(t) * 12;
      star.rotation.y = t * 0.5;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // 3. Mini Live 3D Preview: 3D Astro-Architect (Galactic Hyperlane Cluster)
  useEffect(() => {
    const container = architectMiniCanvasRef.current;
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 10, 22);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const clusterGroup = new THREE.Group();
    scene.add(clusterGroup);

    // Nodes
    const nodes = [
      { x: 0, y: 0, z: 0, col: 0xf59e0b, size: 2.2 },
      { x: -7, y: 2, z: 4, col: 0x38bdf8, size: 1.4 },
      { x: 6, y: -2, z: 5, col: 0x10b981, size: 1.6 },
      { x: 5, y: 3, z: -6, col: 0xa855f7, size: 1.5 },
      { x: -6, y: -2, z: -5, col: 0xf43f5e, size: 1.3 },
    ];

    nodes.forEach(n => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(n.size, 16, 16),
        new THREE.MeshBasicMaterial({ color: n.col })
      );
      mesh.position.set(n.x, n.y, n.z);
      clusterGroup.add(mesh);
    });

    // Hyperlanes
    const lines = [
      [0, 1], [0, 2], [0, 3], [0, 4], [1, 4], [2, 3]
    ];
    lines.forEach(([a, b]) => {
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(nodes[a].x, nodes[a].y, nodes[a].z),
        new THREE.Vector3(nodes[b].x, nodes[b].y, nodes[b].z)
      ]);
      const mat = new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.5 });
      clusterGroup.add(new THREE.Line(geom, mat));
    });

    let animId = 0;
    let t = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      t += 0.015;
      clusterGroup.rotation.y = t * 0.6;
      clusterGroup.rotation.x = Math.sin(t * 0.4) * 0.2;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Celestial Generative Ambient Soundscape Engine (Web Audio API)
  const toggleAmbientAudio = () => {
    if (isAudioMuted) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioCtxRef.current = ctx;

        // 1. Master Compression & Soft Limiter
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, ctx.currentTime);
        compressor.knee.setValueAtTime(30, ctx.currentTime);
        compressor.ratio.setValueAtTime(12, ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        compressor.release.setValueAtTime(0.25, ctx.currentTime);
        compressor.connect(ctx.destination);

        // 2. Master Gain with Smooth Cinematic Fade-In
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
        masterGain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 2.0);
        masterGain.connect(compressor);

        // 3. Deep Space Spatial Delay / Reverb Network
        const delay = ctx.createDelay(2.0);
        delay.delayTime.setValueAtTime(0.52, ctx.currentTime);

        const delayFeedback = ctx.createGain();
        delayFeedback.gain.setValueAtTime(0.44, ctx.currentTime);

        const delayFilter = ctx.createBiquadFilter();
        delayFilter.type = 'lowpass';
        delayFilter.frequency.setValueAtTime(1200, ctx.currentTime);

        delay.connect(delayFilter);
        delayFilter.connect(delayFeedback);
        delayFeedback.connect(delay);
        delayFilter.connect(masterGain);

        // 4. Warm Celestial Drone Pad (D Minor / D Lydian Shimmer)
        const padFilter = ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.frequency.setValueAtTime(260, ctx.currentTime);
        padFilter.Q.setValueAtTime(2.0, ctx.currentTime);
        padFilter.connect(masterGain);
        padFilter.connect(delay);

        // LFO: Slow cosmic breathing filter modulation (~12s cycle)
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.08, ctx.currentTime);
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(160, ctx.currentTime);
        lfo.connect(lfoGain);
        lfoGain.connect(padFilter.frequency);
        lfo.start();

        // 4-voice polyphonic interstellar chord: D2 (73.4Hz), A2 (110Hz), E3 (164.8Hz), A3 (220Hz)
        const chordPitches = [73.42, 110.00, 164.81, 220.00];
        chordPitches.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          osc.type = idx === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          osc.detune.setValueAtTime((Math.random() - 0.5) * 8, ctx.currentTime);

          const voiceGain = ctx.createGain();
          voiceGain.gain.setValueAtTime(idx === 0 ? 0.32 : 0.16, ctx.currentTime);

          osc.connect(voiceGain);
          voiceGain.connect(padFilter);
          osc.start();
        });

        // 5. Interstellar Cosmic Wind (Pink-filtered noise shimmer)
        const bufLen = ctx.sampleRate * 2;
        const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const noiseOut = noiseBuf.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufLen; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          noiseOut[i] = (b0 + b1 + b2 + white * 0.05) * 0.08;
        }
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noiseBuf;
        noiseSrc.loop = true;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(750, ctx.currentTime);
        noiseFilter.Q.setValueAtTime(1.6, ctx.currentTime);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.012, ctx.currentTime);

        noiseSrc.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);
        noiseSrc.start();

        // 6. Generative Pulsar / Starlight Crystal Chimes
        const playStarlightChime = () => {
          if (!ctx || ctx.state === 'closed') return;
          const now = ctx.currentTime;
          // Celestial D Lydian pentatonic scale
          const chimeFreqs = [293.66, 369.99, 440.00, 554.37, 587.33, 659.25, 880.00, 987.77, 1108.73];
          const freq = chimeFreqs[Math.floor(Math.random() * chimeFreqs.length)];

          const chimeOsc = ctx.createOscillator();
          chimeOsc.type = 'sine';
          chimeOsc.frequency.setValueAtTime(freq, now);

          const chimeGain = ctx.createGain();
          chimeGain.gain.setValueAtTime(0.0001, now);
          chimeGain.gain.linearRampToValueAtTime(0.028, now + 0.06);
          chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);

          chimeOsc.connect(chimeGain);
          chimeGain.connect(masterGain);
          chimeGain.connect(delay); // Drenched in deep space echo

          chimeOsc.start(now);
          chimeOsc.stop(now + 4.5);
        };

        // Schedule periodic celestial chimes every 2.6 - 4.8 seconds
        const triggerChimeLoop = () => {
          playStarlightChime();
          const nextInterval = 2600 + Math.random() * 2200;
          audioIntervalRef.current = setTimeout(triggerChimeLoop, nextInterval);
        };
        // Initial chime after 1.5s
        audioIntervalRef.current = setTimeout(triggerChimeLoop, 1500);

        audioNodesRef.current = { ctx, masterGain };
        setIsAudioMuted(false);
      } catch (e) {
        console.error('Audio soundscape error', e);
      }
    } else {
      if (audioIntervalRef.current) {
        clearTimeout(audioIntervalRef.current);
        audioIntervalRef.current = null;
      }
      if (audioNodesRef.current) {
        const { ctx, masterGain } = audioNodesRef.current;
        if (ctx && ctx.state !== 'closed' && masterGain) {
          const now = ctx.currentTime;
          masterGain.gain.setValueAtTime(masterGain.gain.value, now);
          masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
          setTimeout(() => {
            try {
              ctx.close();
            } catch {}
          }, 1300);
        }
      }
      setIsAudioMuted(true);
    }
  };

  return (
    <div className="w-full h-full relative overflow-y-auto overflow-x-hidden bg-[#020409] text-slate-100 flex flex-col justify-between select-none">
      {/* 3D Deep Space Canvas */}
      <div ref={mainCanvasRef} className="absolute inset-0 pointer-events-none z-0" />

      {/* Optical Vignette */}
      <div className="absolute inset-0 pointer-events-none z-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(2,4,9,0.85)_100%)]" />

      {/* High-Precision Scientific HUD Crosshair Overlays */}
      <div className="absolute top-4 left-6 pointer-events-none z-10 flex items-center gap-2 font-mono text-[10px] text-cyan-500/60 uppercase tracking-widest">
        <span>+ RA 17h 45m 40s</span>
        <span>|</span>
        <span>DEC -29° 00′ 28″</span>
        <span>|</span>
        <span>GALACTIC CORE SGR A*</span>
      </div>

      <div className="absolute top-4 right-6 pointer-events-none z-10 hidden sm:flex items-center gap-3 font-mono text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          INSTRUMENTS CALIBRATED
        </span>
        <span>•</span>
        <span>OPTICAL APERTURE: 6.5M</span>
      </div>

      {/* Top Floating Control Deck */}
      <div className="relative z-10 w-full px-6 pt-4 pb-2 max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 rounded text-[10px] font-mono bg-cyan-950/80 text-cyan-400 border border-cyan-800/80 font-bold uppercase tracking-widest">
            ✦ ASTROPHYSICAL OBSERVATORY & CARTOGRAPHY
          </span>
        </div>

        {/* Ambient Synthesizer Button */}
        <button
          onClick={toggleAmbientAudio}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-xs font-mono text-slate-300 transition-all shadow-md hover:border-cyan-500/50"
          title="Toggle Deep Space Ambient Soundscape"
        >
          {isAudioMuted ? <VolumeX className="w-3.5 h-3.5 text-slate-500" /> : <Volume2 className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />}
          <span>{isAudioMuted ? 'Cosmic Soundscape: Muted' : 'Cosmic Ambient: Live'}</span>
        </button>
      </div>

      {/* Hero Section */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex flex-col items-center text-center">
        {/* Observatory Mission Sub-heading */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 text-slate-300 font-mono text-xs mb-4 backdrop-blur-md shadow-inner">
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="tracking-wide">MISSION CONTROL // DUAL DIGITAL ASTROPHYSICS DOMAINS</span>
        </div>

        {/* Cinematic Headline */}
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white font-sans leading-tight mb-3">
          EXPLORE. MODEL. <br className="hidden sm:inline" />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-sky-200 to-amber-300">
            CHART THE UNIVERSE.
          </span>
        </h1>

        <p className="max-w-2xl text-slate-400 text-xs sm:text-sm leading-relaxed mb-6 font-sans font-normal">
          Designed after real NASA deep-space observatories and citizen astrophysics initiatives. 
          Step into relativistic circumstellar evolution or construct custom 3D star clusters and Stellaris mod initializers.
        </p>

        {/* Sensational Living Dual Portal Cards */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mb-8">
          {/* PORTAL CARD 1: 3D SECTOR SIMULATOR */}
          <div
            onMouseEnter={() => setHoveredCard('sector')}
            onMouseLeave={() => setHoveredCard(null)}
            className={`group relative rounded-2xl bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-[#040711] border transition-all duration-300 flex flex-col justify-between text-left backdrop-blur-xl shadow-2xl overflow-hidden ${
              hoveredCard === 'sector'
                ? 'border-cyan-400 shadow-cyan-500/20 scale-[1.015]'
                : 'border-slate-800/80 hover:border-cyan-500/50'
            }`}
          >
            {/* Top Interactive Mini 3D Preview */}
            <div className="w-full h-36 relative bg-gradient-to-b from-slate-950 to-slate-900/50 border-b border-slate-800/80 overflow-hidden">
              <div ref={sectorMiniCanvasRef} className="w-full h-full" />
              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm border border-cyan-500/30 text-[10px] font-mono text-cyan-300">
                <Sun className="w-3 h-3 text-amber-400 animate-spin-slow" />
                <span>3D Circumstellar Raytracing Engine</span>
              </div>
              <div className="absolute bottom-2 right-2.5 text-[9px] font-mono text-slate-500">
                LIVE 3D SIMULATION
              </div>
            </div>

            {/* Card Content */}
            <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                    DOMAIN 01 // OBSERVATORY
                  </span>
                  <Rocket className="w-4 h-4 text-cyan-400" />
                </div>

                <h2 className="text-xl font-extrabold text-white mb-1.5 group-hover:text-cyan-300 transition-colors">
                  3D Sector Simulator
                </h2>
                <p className="text-slate-400 text-xs leading-relaxed mb-4">
                  Deep circumstellar simulation with procedural raymarched sunspots, dynamic stellar evolution from main sequence to white dwarfs/black holes, habitable zone thermodynamics, and click-to-focus planetary orbits.
                </p>

                {/* Key Spec Pills */}
                <div className="flex flex-wrap gap-1.5 mb-5 text-[10px] font-mono text-slate-300">
                  <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">☀️ Dynamic Sunspots</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">🪐 Habitable Zones</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">⏳ Gravitational Warp</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">📊 HR Diagram</span>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => onSelectApp('sector-3d')}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono text-xs font-bold tracking-wider uppercase transition-all shadow-lg shadow-cyan-600/30 flex items-center justify-center gap-2 group-hover:gap-3"
              >
                <span>Launch 3D Sector Simulator</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* PORTAL CARD 2: 3D ASTRO-ARCHITECT */}
          <div
            onMouseEnter={() => setHoveredCard('architect')}
            onMouseLeave={() => setHoveredCard(null)}
            className={`group relative rounded-2xl bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-[#040711] border transition-all duration-300 flex flex-col justify-between text-left backdrop-blur-xl shadow-2xl overflow-hidden ${
              hoveredCard === 'architect'
                ? 'border-amber-400 shadow-amber-500/20 scale-[1.015]'
                : 'border-slate-800/80 hover:border-amber-500/50'
            }`}
          >
            {/* Top Interactive Mini 3D Preview */}
            <div className="w-full h-36 relative bg-gradient-to-b from-slate-950 to-slate-900/50 border-b border-slate-800/80 overflow-hidden">
              <div ref={architectMiniCanvasRef} className="w-full h-full" />
              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm border border-amber-500/30 text-[10px] font-mono text-amber-300">
                <Globe className="w-3 h-3 text-amber-400 animate-pulse" />
                <span>3D Galactic Hyperlane Cartographer</span>
              </div>
              <div className="absolute bottom-2 right-2.5 text-[9px] font-mono text-slate-500">
                INTERSTELLAR TOPOLOGY
              </div>
            </div>

            {/* Card Content */}
            <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                    DOMAIN 02 // CARTOGRAPHER & MODDER
                  </span>
                  <Wrench className="w-4 h-4 text-amber-400" />
                </div>

                <h2 className="text-xl font-extrabold text-white mb-1.5 group-hover:text-amber-300 transition-colors">
                  3D Astro-Architect
                </h2>
                <p className="text-slate-400 text-xs leading-relaxed mb-4">
                  Full 3D interstellar cartographer with interactive hyperlanes, multi-star cluster dynamics (binary to sextuple systems), 4-tier celestial hierarchy editor (Stars → Planets → Moons → Sub-Moons), and Stellaris mod initializer script engine.
                </p>

                {/* Key Spec Pills */}
                <div className="flex flex-wrap gap-1.5 mb-5 text-[10px] font-mono text-slate-300">
                  <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">🌐 3D Hyperlanes</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">🌳 4-Tier Hierarchy</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">📜 Stellaris Exporter</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">📐 Resizable Workspace</span>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => onSelectApp('astro-architect')}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-mono text-xs font-bold tracking-wider uppercase transition-all shadow-lg shadow-amber-600/30 flex items-center justify-center gap-2 group-hover:gap-3"
              >
                <span>Launch 3D Astro-Architect</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* PORTAL CARD 3: STEPS 1-6 ASTROPHYSICAL STARGEN WORKBENCH */}
        <div className="w-full max-w-5xl mb-8 rounded-2xl bg-gradient-to-r from-emerald-950/60 via-slate-900/90 to-sky-950/60 border border-emerald-500/40 hover:border-emerald-400 transition-all duration-300 p-5 flex flex-col md:flex-row items-center justify-between gap-5 text-left backdrop-blur-xl shadow-xl">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60">
                DOMAIN 03 // STEPS 1–6 ASTROPHYSICS ENGINE
              </span>
              <span className="text-[10px] font-mono text-sky-300">
                Vogt-Russell &bull; 1–2% Disk Split &bull; Migration &bull; Water Worlds &amp; Moons
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-white mb-1">
              Astrophysical Star System Generator Workbench
            </h2>
            <p className="text-slate-300 text-xs leading-relaxed">
              Generate complete unary to quadruple star hierarchies from cloud mass, age, and metallicity [Fe/H]. Simulates Holman-Wiegert binary stability zones, 1–2% protoplanetary disk partitioning across 3 snow lines, Type I/II resonant migration convoys, supercritical/Hycean water worlds, and moon systems — with 1-click export to 3D Raytraced Theater and Stellaris!
            </p>
          </div>
          <button
            onClick={() => onSelectApp('stargen-lab')}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono text-xs font-bold tracking-wider uppercase transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-2 flex-shrink-0 cursor-pointer"
          >
            <span>Launch StarGen Lab (Steps 1–6)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Scientific Observational Overview & Specs Drawer */}
        <section className="w-full max-w-5xl bg-slate-950/80 rounded-2xl border border-slate-800/80 backdrop-blur-md p-6 mb-8 text-left">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-2 font-mono text-xs">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span className="text-white font-bold uppercase tracking-wider">Scientific Telemetry & Pipeline</span>
            </div>

            <div className="flex items-center gap-1 font-mono text-xs bg-slate-900 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1 rounded transition-colors ${activeTab === 'overview' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
              >
                Mission Overview
              </button>
              <button
                onClick={() => setActiveTab('instruments')}
                className={`px-3 py-1 rounded transition-colors ${activeTab === 'instruments' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
              >
                Astrophysical Core
              </button>
              <button
                onClick={() => setActiveTab('specs')}
                className={`px-3 py-1 rounded transition-colors ${activeTab === 'specs' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
              >
                System Specs
              </button>
            </div>
          </div>

          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs text-slate-300 font-sans">
              <div>
                <h3 className="font-mono text-cyan-400 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Stellar Nucleosynthesis
                </h3>
                <p className="text-slate-400 leading-relaxed">
                  Real-time mass-luminosity calculations ($L \propto M^{3.5}$) and effective temperature curves mapping directly to the Morgan-Keenan spectral classification system (O, B, A, F, G, K, M, and Degenerate Remnants).
                </p>
              </div>

              <div>
                <h3 className="font-mono text-cyan-400 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5" /> Circumstellar Habitable Zone
                </h3>
                <p className="text-slate-400 leading-relaxed">
                  Kopparapu et al. stellar flux modeling tracking runaway greenhouse thresholds, water loss limits, and maximum greenhouse boundaries across billions of simulated planetary years.
                </p>
              </div>

              <div>
                <h3 className="font-mono text-cyan-400 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Stellaris Mod Synthesis
                </h3>
                <p className="text-slate-400 leading-relaxed">
                  Automated procedural compiler translating hierarchical star systems into valid Paradox Clausewitz script initializers with customizable orbital distance scaling models.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'instruments' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Photosphere Shader</span>
                <span className="text-cyan-300 font-bold">Simplex Noise + Solar Convection</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Orbital Engine</span>
                <span className="text-cyan-300 font-bold">Keplerian 3-Body Dynamics</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Galaxy Projection</span>
                <span className="text-cyan-300 font-bold">3D Logarithmic Spiral Field</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Precision Scaling</span>
                <span className="text-cyan-300 font-bold">Power-Law Radius Conversion</span>
              </div>
            </div>
          )}

          {activeTab === 'specs' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Max Sector Stars</span>
                <span className="text-emerald-400 font-bold">5,000+ Procedural Systems</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Hierarchy Depth</span>
                <span className="text-emerald-400 font-bold">4-Tier (Star→P→M→SM)</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Graphics Pipeline</span>
                <span className="text-emerald-400 font-bold">WebGL 2.0 / Three.js</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Code Quality</span>
                <span className="text-emerald-400 font-bold">100% Strict TypeScript</span>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full px-6 py-4 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-500">
          <div className="flex items-center gap-4">
            <span className="text-slate-400">ZOOK ASTRO SCIENTIFIC OBSERVATORY</span>
            <span>•</span>
            <span>DATA COURTESY OF NASA, ESA & KEPLER ARCHIVES</span>
          </div>

          <div className="text-slate-400">
            Engineered with Precision © 2026 • Pair-Programmed with Antigravity
          </div>
        </div>
      </footer>
    </div>
  );
};
