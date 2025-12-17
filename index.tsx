import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import GUI from "lil-gui";

// --- Audio System (Synthesizer) ---
class MusicBox {
  ctx: AudioContext | null = null;
  isPlaying: boolean = false;
  nodes: AudioNode[] = [];
  timeoutIds: number[] = [];

  // Happy Birthday Melody (Key of C)
  private melody: { freq: number; duration: number; time: number }[] = [
    // Happy Birthday to You
    { freq: 392.00, duration: 0.4, time: 0.0 }, { freq: 392.00, duration: 0.4, time: 0.5 },
    { freq: 440.00, duration: 0.8, time: 1.0 }, { freq: 392.00, duration: 0.8, time: 2.0 },
    { freq: 523.25, duration: 0.8, time: 3.0 }, { freq: 493.88, duration: 1.5, time: 4.0 },
    
    // Happy Birthday to You
    { freq: 392.00, duration: 0.4, time: 6.0 }, { freq: 392.00, duration: 0.4, time: 6.5 },
    { freq: 440.00, duration: 0.8, time: 7.0 }, { freq: 392.00, duration: 0.8, time: 8.0 },
    { freq: 587.33, duration: 0.8, time: 9.0 }, { freq: 523.25, duration: 1.5, time: 10.0 },

    // Happy Birthday Dear [User]
    { freq: 392.00, duration: 0.4, time: 12.0 }, { freq: 392.00, duration: 0.4, time: 12.5 },
    { freq: 783.99, duration: 0.8, time: 13.0 }, { freq: 659.25, duration: 0.8, time: 14.0 },
    { freq: 523.25, duration: 0.8, time: 15.0 }, { freq: 493.88, duration: 0.8, time: 16.0 },
    { freq: 440.00, duration: 1.5, time: 17.0 },

    // Happy Birthday to You
    { freq: 698.46, duration: 0.4, time: 19.0 }, { freq: 698.46, duration: 0.4, time: 19.5 },
    { freq: 659.25, duration: 0.8, time: 20.0 }, { freq: 523.25, duration: 0.8, time: 21.0 },
    { freq: 587.33, duration: 0.8, time: 22.0 }, { freq: 523.25, duration: 2.0, time: 23.0 },
  ];

  init() {
    if (!this.ctx) {
      // @ts-ignore
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      } else {
        console.error("Web Audio API not supported");
      }
    }
  }

  async play() {
    this.init();
    if (!this.ctx) return;
    
    if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
    }
    
    this.stop(); // Clear previous
    this.isPlaying = true;

    // Loop logic: Play sequence then schedule next loop
    const scheduleLoop = () => {
      if (!this.isPlaying || !this.ctx) return;
      
      const startTime = this.ctx.currentTime + 0.1;
      
      this.melody.forEach(note => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        
        osc.type = 'sine'; // Smooth tone
        osc.frequency.value = note.freq;
        
        // Envelope for bell-like sound
        gain.gain.setValueAtTime(0, startTime + note.time);
        gain.gain.linearRampToValueAtTime(0.3, startTime + note.time + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + note.time + note.duration);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(startTime + note.time);
        osc.stop(startTime + note.time + note.duration);

        this.nodes.push(osc, gain);
      });

      // Schedule loop repeat (song length approx 26s)
      const loopId = window.setTimeout(scheduleLoop, 26000);
      this.timeoutIds.push(loopId);
    };

    scheduleLoop();
  }

  stop() {
    this.isPlaying = false;
    try {
      this.nodes.forEach(n => {
        try { n.disconnect(); } catch (e) {}
      });
    } catch(e) {}
    this.nodes = [];
    this.timeoutIds.forEach(id => clearTimeout(id));
    this.timeoutIds = [];
  }
}

// --- GLSL Shaders for Luxury Sparkles ---

const vertexShader = `
  uniform float time;
  uniform float size;
  attribute float scale;
  attribute vec3 customColor;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = customColor;
    vec3 pos = position;
    
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = size * scale * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform float time;
  varying vec3 vColor;
  
  void main() {
    // Circular particle
    vec2 xy = gl_PointCoord.xy - vec2(0.5);
    float ll = length(xy);
    if (ll > 0.5) discard;

    // Sparkle effect
    float strength = 1.0 - (ll * 2.0);
    strength = pow(strength, 1.5);

    // Twinkle animation
    float twinkle = sin(time * 5.0 + gl_FragCoord.x * 0.1 + gl_FragCoord.y * 0.1) * 0.5 + 0.5;
    vec3 finalColor = vColor * mix(0.8, 1.2, twinkle);

    gl_FragColor = vec4(finalColor, strength);
  }
`;

const CandleShader = {
  vertex: `
    uniform float time;
    attribute float size;
    varying float vLife;
    
    void main() {
      vLife = position.y; // Assume 0-1 range for life in flame
      vec3 pos = position;
      
      // Wind/Flicker effect
      float wind = sin(time * 10.0 + pos.y * 10.0) * 0.05 * pos.y;
      pos.x += wind;

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = size * (1.0 - pos.y * 0.5) * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragment: `
    uniform vec3 color;
    varying float vLife;
    
    void main() {
      vec2 xy = gl_PointCoord.xy - vec2(0.5);
      if (length(xy) > 0.5) discard;
      
      float alpha = 1.0 - vLife; // Fade out at top
      vec3 flameColor = mix(vec3(1.0, 0.8, 0.2), vec3(1.0, 0.2, 0.0), vLife);
      
      gl_FragColor = vec4(flameColor, alpha);
    }
  `
}

// --- Main Application ---

const App = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const musicBoxRef = useRef(new MusicBox());
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505); // Dark luxury background
    scene.fog = new THREE.FogExp2(0x050505, 0.02);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 5, 12);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.0;

    // Post Processing (Bloom)
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.1;
    bloomPass.strength = 1.5; // High cinematic bloom
    bloomPass.radius = 0.5;

    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // --- Object Generation ---

    const cakeParams = {
      baseColor: "#D4AF37", // Gold
      topColor: "#F7E7CE",  // Champagne
      icingColor: "#FFFFFF", // Diamond
      flameColor: "#FF5722",
      particleSize: 0.15,
      rotationSpeed: 1.0,
      bloomStrength: 1.5,
      candleCount: 8
    };

    let particleSystem: THREE.Points;
    let flameSystem: THREE.Points;
    
    // Geometry generator
    const generateCake = () => {
      if (particleSystem) scene.remove(particleSystem);
      if (flameSystem) scene.remove(flameSystem);

      const positions = [];
      const colors = [];
      const scales = [];
      const flamePositions = [];
      const flameSizes = [];

      const baseColorObj = new THREE.Color(cakeParams.baseColor);
      const topColorObj = new THREE.Color(cakeParams.topColor);
      const icingColorObj = new THREE.Color(cakeParams.icingColor);

      // Helper to add a particle
      const addParticle = (x: number, y: number, z: number, color: THREE.Color, scale = 1.0) => {
        positions.push(x, y, z);
        colors.push(color.r, color.g, color.b);
        scales.push(scale);
      };

      // 1. Bottom Tier (Large Cylinder)
      const radius1 = 3.5;
      const height1 = 2.0;
      for (let i = 0; i < 4000; i++) {
        const r = Math.random() * radius1;
        const theta = Math.random() * Math.PI * 2;
        const y = (Math.random() - 0.5) * height1;
        
        // Concentrate particles on surface for shape definition
        const rFinal = Math.random() > 0.3 ? radius1 : r;
        
        addParticle(
          rFinal * Math.cos(theta), 
          y, 
          rFinal * Math.sin(theta), 
          baseColorObj, 
          Math.random() * 0.5 + 0.5
        );
      }

      // 2. Top Tier (Smaller Cylinder)
      const radius2 = 2.0;
      const height2 = 1.5;
      const yOffset2 = height1 / 2 + height2 / 2;
      for (let i = 0; i < 2500; i++) {
        const r = Math.random() * radius2;
        const theta = Math.random() * Math.PI * 2;
        const y = (Math.random() - 0.5) * height2 + yOffset2;
        const rFinal = Math.random() > 0.3 ? radius2 : r;

        addParticle(
          rFinal * Math.cos(theta),
          y,
          rFinal * Math.sin(theta),
          topColorObj,
          Math.random() * 0.5 + 0.5
        );
      }

      // 3. Icing / Decoration (Spirals/Rings)
      // Ring between tiers
      for (let i = 0; i < 500; i++) {
        const theta = (i / 500) * Math.PI * 2;
        const r = radius1 + 0.1 + Math.sin(theta * 20) * 0.1;
        addParticle(
          r * Math.cos(theta),
          height1 / 2,
          r * Math.sin(theta),
          icingColorObj,
          2.0 // Larger sparkling diamonds
        );
      }
      
      // 4. Candles
      const candleRadius = 1.5;
      const candleHeight = 0.8;
      const candleYBase = yOffset2 + height2 / 2;
      
      for (let c = 0; c < cakeParams.candleCount; c++) {
        const angle = (c / cakeParams.candleCount) * Math.PI * 2;
        const cx = Math.cos(angle) * candleRadius;
        const cz = Math.sin(angle) * candleRadius;

        // Candle Stick
        for (let j = 0; j < 50; j++) {
           addParticle(
             cx, 
             candleYBase + (j / 50) * candleHeight, 
             cz, 
             new THREE.Color(0xffffff), 
             0.8
           );
        }

        // Flame (Different System)
        const flameY = candleYBase + candleHeight + 0.1;
        for (let k = 0; k < 20; k++) {
          // Add some randomness for flickering volume
          flamePositions.push(cx + (Math.random()-0.5)*0.1, flameY + Math.random()*0.3, cz + (Math.random()-0.5)*0.1);
          flameSizes.push(Math.random());
        }
      }

      // Create BufferGeometries
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('customColor', new THREE.Float32BufferAttribute(colors, 3));
      geometry.setAttribute('scale', new THREE.Float32BufferAttribute(scales, 1));

      const material = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          size: { value: cakeParams.particleSize * 40.0 } // Scale up for visual impact
        },
        vertexShader,
        fragmentShader,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true
      });

      particleSystem = new THREE.Points(geometry, material);
      scene.add(particleSystem);

      // Flame System
      const flameGeo = new THREE.BufferGeometry();
      flameGeo.setAttribute('position', new THREE.Float32BufferAttribute(flamePositions, 3));
      flameGeo.setAttribute('size', new THREE.Float32BufferAttribute(flameSizes, 1));
      
      const flameMat = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          color: { value: new THREE.Color(cakeParams.flameColor) }
        },
        vertexShader: CandleShader.vertex,
        fragmentShader: CandleShader.fragment,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true
      });

      flameSystem = new THREE.Points(flameGeo, flameMat);
      scene.add(flameSystem);
    };

    generateCake();

    // --- GUI Setup ---
    const gui = new GUI({ title: "Birthday Settings" });
    
    gui.addColor(cakeParams, 'baseColor').name('Cake Base').onChange(generateCake);
    gui.addColor(cakeParams, 'topColor').name('Cake Top').onChange(generateCake);
    gui.addColor(cakeParams, 'icingColor').name('Icing (Diamonds)').onChange(generateCake);
    gui.addColor(cakeParams, 'flameColor').name('Flame Color').onChange(() => {
       if (flameSystem) (flameSystem.material as THREE.ShaderMaterial).uniforms.color.value.set(cakeParams.flameColor);
    });
    
    gui.add(cakeParams, 'rotationSpeed', 0, 5).name('Rotation Speed').onChange((v: number) => {
      controls.autoRotateSpeed = v;
    });
    
    gui.add(cakeParams, 'bloomStrength', 0, 3).name('Glow Intensity').onChange((v: number) => {
      bloomPass.strength = v;
    });

    // --- Animation Loop ---
    const clock = new THREE.Clock();
    let animationId: number;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();

      controls.update();

      if (particleSystem) {
        (particleSystem.material as THREE.ShaderMaterial).uniforms.time.value = time;
      }
      if (flameSystem) {
        (flameSystem.material as THREE.ShaderMaterial).uniforms.time.value = time;
      }

      composer.render();
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      gui.destroy();
      renderer.dispose();
      musicBoxRef.current.stop();
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, []);

  // Play/Stop Audio Handler
  const toggleAudio = async () => {
    if (isPlaying) {
      musicBoxRef.current.stop();
      setIsPlaying(false);
    } else {
      await musicBoxRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', background: '#000' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {/* HUD UI */}
      <div style={{
        position: 'absolute',
        bottom: '30px',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
        color: '#F7E7CE',
        fontFamily: "'Cinzel', 'Times New Roman', serif",
        textShadow: '0 0 10px rgba(247, 231, 206, 0.8)',
        zIndex: 10,
        pointerEvents: 'none',
        userSelect: 'none'
      }}>
        <h1 style={{ fontSize: '2.5rem', margin: 0, fontWeight: 300, letterSpacing: '2px' }}>HAPPY BIRTHDAY</h1>
        <p style={{ fontSize: '1rem', opacity: 0.8, letterSpacing: '1px' }}>Make a wish & enjoy the music</p>
      </div>

      <button 
        onClick={toggleAudio}
        style={{
          position: 'absolute',
          bottom: '120px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: isPlaying ? 'rgba(255, 87, 34, 0.2)' : 'rgba(212, 175, 55, 0.2)',
          border: '1px solid ' + (isPlaying ? '#FF5722' : '#D4AF37'),
          color: isPlaying ? '#FF5722' : '#D4AF37',
          padding: '12px 30px',
          borderRadius: '30px',
          cursor: 'pointer',
          fontFamily: 'sans-serif',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          transition: 'all 0.3s ease',
          backdropFilter: 'blur(4px)',
          zIndex: 20
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = isPlaying ? 'rgba(255, 87, 34, 0.4)' : 'rgba(212, 175, 55, 0.4)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = isPlaying ? 'rgba(255, 87, 34, 0.2)' : 'rgba(212, 175, 55, 0.2)'; }}
      >
        {isPlaying ? "Stop Music" : "Play Song ♫"}
      </button>
    </div>
  );
};

const rootElement = document.getElementById("root");
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<App />);
}
