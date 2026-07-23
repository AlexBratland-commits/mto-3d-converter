import { useState, useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import PipeComponent from "./PipeComponent";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  Prosedural bakke-tekstur (metallisk grid)                         */
/* ------------------------------------------------------------------ */
function useGridTexture(planeSize) {
  return useMemo(() => {
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, size, size);

    const step = 32;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(140,170,210,0.20)";
    for (let i = 0; i <= size; i += step) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(180,205,235,0.45)";
    for (let i = 0; i <= size; i += step * 4) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(4, planeSize / 80), Math.max(4, planeSize / 80));
    tex.anisotropy = 8;
    return tex;
  }, [planeSize]);
}

/* ------------------------------------------------------------------ */
/*  Proseduralt miljøkart                                             */
/* ------------------------------------------------------------------ */
function useProceduralEnvMap() {
  return useMemo(() => {
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const sky = ctx.createLinearGradient(0, 0, 0, size);
    sky.addColorStop(0, "#f5f9ff");
    sky.addColorStop(0.22, "#dfe9f7");
    sky.addColorStop(0.42, "#a9c0de");
    sky.addColorStop(0.62, "#5b7ca8");
    sky.addColorStop(0.8, "#1c2c47");
    sky.addColorStop(1, "#060a14");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, size, size);

    const sun = ctx.createRadialGradient(size * 0.62, size * 0.28, 10, size * 0.62, size * 0.28, size * 0.35);
    sun.addColorStop(0, "rgba(255,255,255,0.9)");
    sun.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Svevende støvpartikler                                            */
/* ------------------------------------------------------------------ */
function DustParticles({ center, maxDim, count = 220 }) {
  const pointsRef = useRef();

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = center.x + (Math.random() - 0.5) * maxDim * 3;
      arr[i * 3 + 1] = center.y + Math.random() * maxDim * 1.6 - maxDim * 0.2;
      arr[i * 3 + 2] = center.z + (Math.random() - 0.5) * maxDim * 3;
    }
    return arr;
  }, [center.x, center.y, center.z, maxDim, count]);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position;
    const arr = posAttr.array;
    const top = center.y + maxDim * 1.4;
    const bottom = center.y - maxDim * 0.2;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += delta * 3.2;
      arr[i * 3] += Math.sin(state.clock.elapsedTime * 0.15 + i) * delta * 0.6;
      if (arr[i * 3 + 1] > top) arr[i * 3 + 1] = bottom;
    }
    posAttr.needsUpdate = true;
    pointsRef.current.rotation.y += delta * 0.008;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={Math.max(2, maxDim * 0.003)} color="#bcd4f5" transparent opacity={0.32} depthWrite={false} sizeAttenuation />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/*  Kamera-intro (Kun auto-fit) & OrbitControls                       */
/* ------------------------------------------------------------------ */
function CameraRig({ center, maxDim }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef();
  const startTimeRef = useRef(null);
  const doneRef = useRef(false);
  const userInteractedRef = useRef(false);

  useEffect(() => {
    const handleInteraction = () => { userInteractedRef.current = true; };
    const dom = gl.domElement;
    dom.addEventListener('pointerdown', handleInteraction);
    dom.addEventListener('wheel', handleInteraction, { passive: true });
    return () => {
      dom.removeEventListener('pointerdown', handleInteraction);
      dom.removeEventListener('wheel', handleInteraction);
    };
  }, [gl]);

  const wide = useMemo(
    () => new THREE.Vector3(center.x + maxDim * 3.4, center.y + maxDim * 2.6, center.z + maxDim * 3.4),
    [center.x, center.y, center.z, maxDim]
  );
  const close = useMemo(
    () => new THREE.Vector3(center.x + maxDim * 0.8, center.y + maxDim * 1.2, center.z + maxDim * 0.6),
    [center.x, center.y, center.z, maxDim]
  );

  useFrame((state) => {
    if (doneRef.current || userInteractedRef.current) {
      if (controlsRef.current) controlsRef.current.update();
      return;
    }
    if (startTimeRef.current === null) startTimeRef.current = state.clock.elapsedTime;
    const elapsed = state.clock.elapsedTime - startTimeRef.current;
    const t = Math.min(1, elapsed / 2);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(wide, close, eased);
    camera.lookAt(center);
    if (controlsRef.current) {
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
    if (t >= 1) doneRef.current = true;
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan
      screenSpacePanning
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.7}
      zoomSpeed={1.0}
      panSpeed={0.9}
      minDistance={Math.max(0.1, maxDim * 0.02)}
      maxDistance={Math.max(50000, maxDim * 20)}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Hovedkomponent                                                    */
/* ------------------------------------------------------------------ */
export default function Viewer3D({ components, asmeOn, onToggleAsme }) {
  const [showDimensions, setShowDimensions] = useState(false);

  const { bounds, center, maxDim } = useMemo(() => {
    const box = new THREE.Box3();
    if (components && components.length > 0) {
      components.forEach((c) => {
        box.expandByPoint(new THREE.Vector3(c.start_x || 0, c.start_y || 0, c.start_z || 0));
        box.expandByPoint(new THREE.Vector3(c.end_x || 0, c.end_y || 0, c.end_z || 0));
      });
    } else {
      box.set(new THREE.Vector3(-100, -100, -100), new THREE.Vector3(100, 100, 100));
    }
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const m = Math.max(s.x, s.y, s.z, 500);
    return { bounds: box, center: c, maxDim: m };
  }, [components]);

  const gridTexture = useGridTexture(maxDim);
  const envMap = useProceduralEnvMap();

  // Dynamisk far-plan som skalerer trygt med modellens størrelse
  const cameraNear = 0.1; 
  const cameraFar = Math.max(100000, maxDim * 25); 
  const cameraStart = [center.x + maxDim * 3.4, center.y + maxDim * 2.6, center.z + maxDim * 3.4];

  if (!components || components.length === 0) {
    return (
      <div className="mt-8 p-8 bg-gray-800 rounded-lg text-center text-gray-400">
        Ingen komponenter å visualisere
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">🔧 3D Rørtrase</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDimensions(!showDimensions)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 ${
              showDimensions ? "bg-yellow-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"
            }`}
          >
            📏 Mål {showDimensions ? "PÅ" : "AV"}
          </button>
          {onToggleAsme && (
            <button
              onClick={onToggleAsme}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 ${
                asmeOn ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"
              }`}
            >
              🧬 ASME {asmeOn ? "PÅ" : "AV"}
            </button>
          )}
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg overflow-hidden" style={{ height: "600px" }}>
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, logarithmicDepthBuffer: true }}
          camera={{ fov: 50, near: cameraNear, far: cameraFar, position: cameraStart }}
        >
          <CameraRig center={center} maxDim={maxDim} />

          <ambientLight intensity={0.25} />
          <hemisphereLight args={[0x1e293b, 0x000000, 0.4]} />
          
          {/* Eksplisitt Shadow Frustum for å unngå klipping av skygger på store modeller */}
          <directionalLight
            position={[center.x + maxDim * 0.8, center.y + maxDim * 1.2, center.z + maxDim * 0.6]}
            intensity={3}
            castShadow
            shadow-mapSize={[4096, 4096]}
            shadow-camera-left={-maxDim}
            shadow-camera-right={maxDim}
            shadow-camera-top={maxDim}
            shadow-camera-bottom={-maxDim}
            shadow-camera-near={0.1}
            shadow-camera-far={maxDim * 4}
          />
          <directionalLight
            position={[center.x - maxDim * 0.8, center.y + maxDim * 0.3, center.z - maxDim * 0.8]}
            intensity={0.6}
            color="#88aaff"
          />
          <directionalLight
            position={[center.x, center.y + maxDim * 0.8, center.z - maxDim * 1.2]}
            intensity={2}
          />

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, bounds.min.y - 25, center.z]} receiveShadow>
            <planeGeometry args={[maxDim * 15, maxDim * 15]} />
            <shadowMaterial opacity={0.3} />
          </mesh>

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, bounds.min.y - 24.5, center.z]} receiveShadow>
            <planeGeometry args={[maxDim * 6, maxDim * 6]} />
            <meshStandardMaterial map={gridTexture} metalness={0.7} roughness={0.35} color="#93add0" />
          </mesh>

          <Grid
            args={[maxDim * 2.5, maxDim * 2.5, 50, 50]}
            position={[center.x, bounds.min.y - 24, center.z]}
            cellColor="#1e293b"
            sectionColor="#1e293b"
            fadeDistance={maxDim * 6}
            fadeStrength={1}
            infiniteGrid
          />

          <Environment map={envMap} />
          <DustParticles center={center} maxDim={maxDim} />

          {components.map((comp, idx) => (
            <PipeComponent key={comp.id ?? idx} index={idx} component={comp} asmeOn={asmeOn} showDimensions={showDimensions} components={components} />
          ))}

          <EffectComposer multisampling={0}>
            <Bloom luminanceThreshold={0.8} luminanceSmoothing={0.25} intensity={0.45} mipmapBlur radius={0.5} />
            <Vignette eskil={false} offset={0.15} darkness={0.5} />
          </EffectComposer>
        </Canvas>
      </div>
    </div>
  );
}