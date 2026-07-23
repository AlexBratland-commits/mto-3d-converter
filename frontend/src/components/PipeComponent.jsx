import { useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";

const ASME_OD = { 50:60.3, 80:88.9, 100:114.3, 150:168.3, 200:219.1, 250:273.0, 300:323.9, 350:355.6, 400:406.4, 450:457.2, 500:508.0, 600:609.6 };
const ASME_BEND_RADIUS_LR = { 50:76, 80:114, 100:152, 150:229, 200:305, 250:381, 300:457, 350:533, 400:610, 450:686, 500:762, 600:914 };

function parseDN(s) { if (!s) return null; const m = String(s).match(/DN\s*(\d+)/i); return m ? parseInt(m[1]) : null; }
function getOD(dn) { if (!dn) return 114.3; return ASME_OD[dn] || +(dn * 1.15).toFixed(1); }
function getBendRadius(dn) { if (!dn) return 150; return ASME_BEND_RADIUS_LR[dn] || Math.round(dn * 1.52); }
function classifyType(n) { const x = (n || '').toLowerCase(); if (x.includes('bend') || x.includes('elbow')) return 'bend'; if (x.includes('flange') || /\bwn\b/.test(x)) return 'flange'; if (x.includes('valve') || x.includes('gate')) return 'valve'; if (x.includes('reducer')) return 'reducer'; if (x.includes('tee')) return 'tee'; if (x.includes('weldlet') || x.includes('olet')) return 'weldlet'; return 'pipe'; }
function getCol(n) { switch (classifyType(n)) { case 'bend': return '#ef4444'; case 'flange': return '#3b82f6'; case 'valve': return '#f59e0b'; case 'reducer': return '#a855f7'; case 'tee': return '#14b8a6'; case 'weldlet': return '#f97316'; default: return '#9ca3af'; } }

function createMaterial(color, isMetal = true) {
  return new THREE.MeshPhysicalMaterial({
    color, metalness: isMetal ? 0.95 : 0.1, roughness: isMetal ? 0.25 : 0.6,
    clearcoat: 0.4, clearcoatRoughness: 0.1, envMapIntensity: 1.5,
  });
}
function createInsulationMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: '#ff7b00', transmission: 0.7, opacity: 0.35, transparent: true,
    roughness: 0.1, metalness: 0, thickness: 2.0, side: THREE.DoubleSide,
    depthWrite: false, ior: 1.4,
  });
}

function buildBendGeometry(comp, tubeRadius, bendRadius, idx, components) {
  const s = new THREE.Vector3(comp.start_x || 0, comp.start_y || 0, comp.start_z || 0);
  const e = new THREE.Vector3(comp.end_x || 0, comp.end_y || 0, comp.end_z || 0);
  const chord = e.clone().sub(s); const chordLen = chord.length();
  if (chordLen < 0.01 || (chordLen / 2) >= bendRadius) return null;

  let inDir = new THREE.Vector3(1, 0, 0);
  if (idx > 0) {
    const prev = components[idx - 1];
    inDir.set(prev.end_x - prev.start_x, prev.end_y - prev.start_y, prev.end_z - prev.start_z).normalize();
  }
  if (inDir.lengthSq() < 0.1) inDir.copy(chord).normalize();

  let normal = inDir.clone().cross(chord);
  if (normal.lengthSq() < 0.01) {
    let aux = new THREE.Vector3(0, 1, 0);
    if (Math.abs(inDir.y) > 0.9) aux.set(1, 0, 0);
    normal = inDir.clone().cross(aux);
  }
  normal.normalize();

  const bisect = chord.clone().cross(normal).normalize();
  const distToCenter = Math.sqrt(Math.max(0, bendRadius * bendRadius - (chordLen / 2) ** 2));
  const mid = s.clone().add(e).multiplyScalar(0.5);
  const C1 = mid.clone().add(bisect.clone().multiplyScalar(distToCenter));
  const C2 = mid.clone().sub(bisect.clone().multiplyScalar(distToCenter));
  const expectedDir = normal.clone().cross(inDir).normalize();
  const v1 = C1.clone().sub(s).normalize();
  const v2 = C2.clone().sub(s).normalize();
  const center = (v1.dot(expectedDir) > v2.dot(expectedDir)) ? C1 : C2;

  const vStart = s.clone().sub(center); const vEnd = e.clone().sub(center);
  const arcAngle = vStart.angleTo(vEnd);
  const localX = vStart.clone().normalize();
  let localZ = vStart.clone().cross(vEnd);
  if (localZ.lengthSq() < 1e-6) localZ = normal.clone();
  localZ.normalize(); const localY = localZ.clone().cross(localX).normalize();
  const basis = new THREE.Matrix4().makeBasis(localX, localY, localZ);
  const geom = new THREE.TorusGeometry(bendRadius, tubeRadius, 20, 48, arcAngle);
  return { geometry: geom, position: center, basis };
}

export default function PipeComponent({ component, asmeOn, showDimensions, components, index }) {
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);

  const type = classifyType(component.component);
  const color = getCol(component.component);
  const dn = parseDN(component.size_dn_nps);
  
  // 🔧 Fiks 1: Redusert skaleringsfaktor for tynnere rør (0.35 i stedet for 0.75)
  const radius = asmeOn && dn ? (getOD(dn) / 2) * 0.35 : (dn ? (dn / 2) * 1.0 : 30);
  
  const insulationThickness = (component.insulation_thickness_mm || 0) / 2;

  const start = new THREE.Vector3(component.start_x || 0, component.start_y || 0, component.start_z || 0);
  const end = new THREE.Vector3(component.end_x || 0, component.end_y || 0, component.end_z || 0);
  const length = start.distanceTo(end);
  const midPoint = start.clone().add(end).multiplyScalar(0.5);

  let geometry, position, quaternion;
  let skipInsulation = false;

  // 🔧 Fiks 2: Håndter "bombe"-komponenter (lengde 0) som punktmarkører, ikke kuler
  if (length < 1.0 && !component.component?.toLowerCase().includes('tee') && !component.component?.toLowerCase().includes('flange')) {
    // Dette er en feilaktig komponent – vis som en liten advarselsmarkør
    return (
      <Html position={[start.x, start.y + 20, start.z]} center style={{ pointerEvents: "none" }}>
        <div style={{ background: "rgba(239,68,68,0.8)", color: "white", padding: "4px 8px", borderRadius: "6px", fontSize: "10px", whiteSpace: "nowrap" }}>
          ⚠️ {component.component || '?'} (ugyldig)
        </div>
      </Html>
    );
  }

  if (asmeOn && type === 'bend' && length > 0.01 && dn) {
    const bendData = buildBendGeometry(component, radius, getBendRadius(dn), index, components);
    if (bendData) {
      geometry = <torusGeometry args={[getBendRadius(dn), radius, 20, 48, Math.PI / 2]} />;
      position = bendData.position;
      quaternion = new THREE.Quaternion().setFromRotationMatrix(bendData.basis);
      skipInsulation = true;
    }
  }

  if (!geometry) {
    if (type === 'bend' && !asmeOn) {
      const capLen = Math.max(0.1, length - radius * 2);
      geometry = <capsuleGeometry args={[radius, capLen, 16, 32]} />;
      position = midPoint;
      quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    } else if (asmeOn && type === 'flange') {
      const h = Math.min(length, Math.max(radius * 0.6, 10));
      geometry = <cylinderGeometry args={[radius * 1.35, radius * 1.35, h, 32]} />;
      position = midPoint;
      quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    } else if (asmeOn && type === 'valve') {
      const size = radius * 2.2;
      geometry = <boxGeometry args={[size, size, Math.max(length, size)]} />;
      position = midPoint;
      quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), end.clone().sub(start).normalize());
    } else if (asmeOn && type === 'reducer') {
      geometry = <cylinderGeometry args={[radius * 0.65, radius * 1.3, length, 32]} />;
      position = midPoint;
      quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    } else if (asmeOn && type === 'weldlet') {
      geometry = <sphereGeometry args={[radius * 0.8, 16, 16]} />;
      position = start;
    } else {
      const capLen = Math.max(0.1, length - radius * 2);
      geometry = <capsuleGeometry args={[radius, capLen, 16, 32]} />;
      position = midPoint;
      quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    }
  }

  const material = createMaterial(color, type !== 'valve');
  const insulationMat = createInsulationMaterial();
  const showInfo = (hovered || clicked) && showDimensions;

  return (
    <group>
      <mesh
        ref={meshRef}
        position={position}
        quaternion={quaternion}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
        onClick={(e) => { e.stopPropagation(); setClicked(!clicked); }}
        castShadow
        receiveShadow
      >
        {geometry}
        <primitive object={material} attach="material" />
      </mesh>

      {insulationThickness > 0 && !skipInsulation && (
        <mesh position={position} quaternion={quaternion}>
          {length < 0.01 ? <sphereGeometry args={[radius + insulationThickness, 20, 20]} /> :
            <capsuleGeometry args={[radius + insulationThickness, Math.max(0.1, length - (radius + insulationThickness) * 2), 12, 24]} />}
          <primitive object={insulationMat} attach="material" />
        </mesh>
      )}

      {showInfo && (
        <Html position={[midPoint.x, midPoint.y + radius + 100, midPoint.z]} center style={{ pointerEvents: "none" }}>
          <div style={{ background: "rgba(10,16,30,0.92)", color: "#f0f4fa", padding: "10px 14px", borderRadius: "12px", fontSize: "12px", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", backdropFilter: "blur(12px)", lineHeight: "1.5" }}>
            <strong style={{ color: "#fff" }}>{component.component}</strong>
            {component.size_dn_nps && <div style={{ color: "#94a3b8" }}>📏 {component.size_dn_nps}</div>}
            {dn && <div style={{ color: "#94a3b8" }}>⌀ UD {getOD(dn).toFixed(1)} mm</div>}
            {type === 'bend' && dn && <div style={{ color: "#94a3b8" }}>↩ Bend-radius {getBendRadius(dn)} mm (LR)</div>}
            {length > 0 && <div style={{ color: "#94a3b8" }}>📐 {Math.round(length)} mm</div>}
            {component.pressure_bar > 0 && <div>🔴 {component.pressure_bar} bar</div>}
            {component.temperature_c > 0 && <div>🌡 {component.temperature_c}°C</div>}
            {component.line_no && <div>🔗 {component.line_no}</div>}
            {component.direction && <div>🧭 {component.direction}</div>}
          </div>
        </Html>
      )}
    </group>
  );
}