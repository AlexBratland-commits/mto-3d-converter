import { useState, useEffect } from "react";
import Tesseract from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import { safeParseJSON } from "../services/parseUtils";

// Sett opp worker for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export function isPdfFile(file) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
}

/**
 * Usynlig konvertering av PDF til høyoppløselige PNG-bilder i minnet
 */
export async function convertPdfToImageFiles(pdfFile, { maxWidthPx = 2200 } = {}) {
  const buffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const imageFiles = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(4, maxWidthPx / baseViewport.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 1.0));
    const baseName = (pdfFile.name || "tegning").replace(/\.pdf$/i, "");
    const suffix = pdf.numPages > 1 ? `_side${pageNum}` : "";
    imageFiles.push(new File([blob], `${baseName}${suffix}.png`, { type: "image/png" }));
  }

  return imageFiles;
}

const ASME_OD = { 50:60.3, 80:88.9, 100:114.3, 150:168.3, 200:219.1, 250:273.0, 300:323.9, 350:355.6, 400:406.4, 450:457.2, 500:508.0, 600:609.6 };
const ASME_BEND_RADIUS_LR = { 50:76, 80:114, 100:152, 150:229, 200:305, 250:381, 300:457, 350:533, 400:610, 450:686, 500:762, 600:914 };
const ASME_WALL_SCH40 = { 50:3.9, 80:5.5, 100:6.0, 150:7.1, 200:8.2, 250:9.3, 300:10.3, 350:11.1, 400:12.7, 450:14.3, 500:15.1, 600:17.5 };

const ASME_LENGTHS = {
  Flange: { 50: 20, 80: 22, 100: 24, 150: 26, 200: 30, 250: 32, 300: 34 },
  Valve: { 50: 178, 80: 203, 100: 229, 150: 267, 200: 292, 250: 330, 300: 356 },
  Reducer: { 50: 76, 80: 86, 100: 102, 150: 146, 200: 178, 250: 216, 300: 254 },
  Tee: { 50: 76, 80: 86, 100: 105, 150: 143, 200: 178, 250: 216, 300: 254 },
  Weldlet: { 50: 30, 80: 35, 100: 40, 150: 50, 200: 60, 250: 70, 300: 80 },
  Nipple: { 50: 100, 80: 100, 100: 100, 150: 150, 200: 150 },
  'Drip Ring': { 50: 40, 80: 40, 100: 40, 150: 40, 200: 40 },
  'Spectacle Blind': { 50: 30, 80: 30, 100: 30, 150: 30, 200: 30 }
};

function estimateComponentLength(type, dn) {
  const table = ASME_LENGTHS[type];
  if (!table) return 50;
  if (table[dn] !== undefined) return table[dn];

  const knownDns = Object.keys(table).map(Number).filter((n) => !isNaN(n));
  if (knownDns.length === 0) return 50;

  const nearestDn = knownDns.reduce(
    (best, d) => (Math.abs(d - dn) < Math.abs(best - dn) ? d : best),
    knownDns[0]
  );

  const odNearest = ASME_OD[nearestDn];
  const odTarget = ASME_OD[dn];
  if (odNearest && odTarget) {
    const estimated = Math.round(table[nearestDn] * (odTarget / odNearest));
    console.warn(
      `ASME_LENGTHS: ingen tabellverdi for ${type} DN${dn} – estimerer ${estimated}mm ut fra OD-forhold mot DN${nearestDn}. Bør verifiseres manuelt.`
    );
    return estimated;
  }
  return table[nearestDn] || 50;
}

function buildASMETable() {
  let table = "ASME B36.10 ytre diameter (mm): ";
  table += Object.entries(ASME_OD).map(([dn, od]) => `DN${dn}=${od}`).join(", ");
  table += "\nASME B16.9 bend-radius LR (mm): ";
  table += Object.entries(ASME_BEND_RADIUS_LR).map(([dn, r]) => `DN${dn}=${r}`).join(", ");
  table += "\nGodstykkelse SCH40 (mm): ";
  table += Object.entries(ASME_WALL_SCH40).map(([dn, w]) => `DN${dn}=${w}`).join(", ");
  return table;
}

function normalizeComponentName(name) {
  const n = (name || '').toUpperCase();
  if (n.includes('ELBOW') || n.includes('BEND')) return 'Bend';
  if (n.includes('FLANGE')) return 'Flange';
  if (n.includes('VALVE') || n.includes('BLOCK')) return 'Valve';
  if (n.includes('PIPE')) return 'Pipe';
  if (n.includes('WELDLET') || n.includes('OLET')) return 'Weldlet';
  if (n.includes('REDUCER')) return 'Reducer';
  if (n.includes('TEE')) return 'Tee';
  if (n.includes('NIPPLE')) return 'Nipple';
  if (n.includes('DRIP')) return 'Drip Ring';
  if (n.includes('SPECT') || n.includes('BLIND')) return 'Spectacle Blind';
  if (n.includes('GASKET') || n.includes('STUD') || n.includes('BOLT') || n.includes('NUT')) return 'Fastener';
  return name;
}

const ROUTE_KEY_ALIASES = {
  cf: 'connects_from', comp: 'component', dn: 'size_dn_nps',
  dir: 'direction', len: 'length_mm', ins: 'insulation_thickness_mm',
  sch: 'schedule', conf: 'confidence', src: 'source',
};
function normalizeRouteItem(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const out = {};
  Object.entries(raw).forEach(([k, v]) => { out[ROUTE_KEY_ALIASES[k] || k] = v; });
  return out;
}

function normalizeDirKey(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase().replace(/[\s->_]+/g, '-');
  const map = { 'N':'N','NORTH':'N','S':'S','SOUTH':'S','E':'E','EAST':'E','W':'W','WEST':'W','NE':'NE','NORTHEAST':'NE','NW':'NW','NORTHWEST':'NW','SE':'SE','SOUTHEAST':'SE','SW':'SW','SOUTHWEST':'SW','UP':'UP','UPWARD':'UP','U':'UP','DOWN':'DOWN','DOWNWARD':'DOWN','DN':'DOWN','D':'DOWN' };
  return map[s] || s;
}

const DIRECTION_VECTORS = {
  "N":[0,1,0], "NE":[0.707,0.707,0], "E":[1,0,0], "SE":[0.707,-0.707,0],
  "S":[0,-1,0], "SW":[-0.707,-0.707,0], "W":[-1,0,0], "NW":[-0.707,0.707,0],
  "UP":[0,0,1], "DOWN":[0,0,-1]
};

const HORIZONTAL_DIRS = ["N", "S", "E", "W", "NE", "NW", "SE", "SW"];

function getVector(dir) { const key = normalizeDirKey(dir); return DIRECTION_VECTORS[key] || null; }

function parseBendParts(directionStr) {
  const s = String(directionStr || '').trim().toUpperCase().replace(/[\s->_]+/g, '-');
  const parts = s.split('-TO-'); if (parts.length === 2) return [parts[0], parts[1]];
  const short = s.split('-'); if (short.length === 2) return [short[0], short[1]];
  return null;
}

function placeShortOffset(comp, origin, direction, incomingZ) {
  const { x:ox, y:oy, z:oz } = origin;
  const dir = comp.direction || direction;
  const vec = getVector(dir) || [1,0,0];

  const dn = parseInt(String(comp.size_dn_nps||'').replace(/DN/i,''))||100;
  const dist = estimateComponentLength(comp.component, dn);

  const isHorizontal = HORIZONTAL_DIRS.includes(normalizeDirKey(dir));
  const startZ = isHorizontal ? incomingZ : oz;
  const endZ = isHorizontal ? incomingZ : oz + vec[2]*dist;

  return { 
      start:{x:ox,y:oy,z:startZ}, 
      end:{x:ox+vec[0]*dist,y:oy+vec[1]*dist,z:endZ}, 
      direction: dir,
      outZ: endZ 
  };
}

function placePipe(comp, origin, direction, incomingZ) {
  const { x:ox, y:oy, z:oz } = origin;
  const dir = comp.direction || direction;
  const vec = getVector(dir) || [0,0,0];
  const len = comp.length_mm || 500;

  const isHorizontal = HORIZONTAL_DIRS.includes(normalizeDirKey(dir));
  const startZ = isHorizontal ? incomingZ : oz;
  const endZ = isHorizontal ? incomingZ : oz + vec[2]*len;

  return { 
      start:{x:ox,y:oy,z:startZ}, 
      end:{x:ox+vec[0]*len,y:oy+vec[1]*len,z:endZ}, 
      direction:normalizeDirKey(dir)||dir,
      outZ: endZ
  };
}

function placeBend(comp, origin, direction, incomingZ) {
  const { x:ox, y:oy, z:oz } = origin;
  if (!comp.direction) return { start:{x:ox,y:oy,z:oz}, end:{x:ox,y:oy,z:oz}, direction, outZ: incomingZ };
  
  const dn = parseInt(String(comp.size_dn_nps||'').replace(/DN/i,''))||100;
  const bendR = ASME_BEND_RADIUS_LR[dn]||150;
  const parts = parseBendParts(comp.direction);
  const from = parts?parts[0]:normalizeDirKey(direction)||direction;
  const to = parts?parts[1]:normalizeDirKey(direction)||direction;
  
  const fv = getVector(from)||[0,0,0], tv = getVector(to)||[0,0,0];
  
  const dot = fv[0]*tv[0] + fv[1]*tv[1] + fv[2]*tv[2];
  const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
  let T = bendR * Math.tan(angle / 2);
  if (isNaN(T) || !isFinite(T)) T = bendR;

  const isOutHorizontal = HORIZONTAL_DIRS.includes(normalizeDirKey(to));
  const startZ = isOutHorizontal ? incomingZ : oz;
  const endZ = isOutHorizontal ? incomingZ : oz + (fv[2]+tv[2])*T;
  
  return { 
      start: {x:ox, y:oy, z:startZ}, 
      end: {x:ox+(fv[0]+tv[0])*T, y:oy+(fv[1]+tv[1])*T, z:endZ}, 
      direction: to,
      outZ: endZ
  };
}

const PLACERS = { 
  Pipe: (c,o,d,z) => placePipe(c,o,d,z), 
  Bend: (c,o,d,z) => placeBend(c,o,d,z), 
  Flange: (c,o,d,z) => placeShortOffset(c,o,d,z), 
  Weldlet: (c,o,d,z) => placeShortOffset(c,o,d,z), 
  Reducer: (c,o,d,z) => placeShortOffset(c,o,d,z), 
  Tee: (c,o,d,z) => placeShortOffset(c,o,d,z), 
  Valve: (c,o,d,z) => placeShortOffset(c,o,d,z),
  Nipple: (c,o,d,z) => placeShortOffset(c,o,d,z),
  'Drip Ring': (c,o,d,z) => placeShortOffset(c,o,d,z),
  'Spectacle Blind': (c,o,d,z) => placeShortOffset(c,o,d,z)
};

function placeComponent(comp, origin, incomingDirection, incomingZ) {
  const placer = PLACERS[comp.component];
  if (!placer) { 
      const {x,y,z} = origin; 
      return {start:{x,y,z}, end:{x,y,z}, direction:incomingDirection, outZ: incomingZ}; 
  }
  return placer(comp, origin, incomingDirection, incomingZ);
}

function calculateAbsoluteCoordinatesLinear(components, originOffset = { x:0, y:0, z:0 }) {
  let x = originOffset.x, y = originOffset.y, z = originOffset.z;
  let currentDirection = null;
  let currentZ = z;
  
  return components.map((comp) => {
    const placed = placeComponent(comp, { x, y, z }, currentDirection, currentZ);
    x = placed.end.x; 
    y = placed.end.y; 
    z = placed.end.z; 
    currentDirection = placed.direction;
    currentZ = placed.outZ !== undefined ? placed.outZ : currentZ;
    
    return { ...comp, start_x: placed.start.x, start_y: placed.start.y, start_z: placed.start.z, end_x: x, end_y: y, end_z: z };
  });
}

function validateContinuityLinear(components) {
  if (!components || components.length < 2) return [];
  const issues = [];
  for (let i = 0; i < components.length - 1; i++) {
    const c = components[i], n = components[i + 1];
    if (!c || !n) continue;
    const dx = (n.start_x || 0) - (c.end_x || 0), dy = (n.start_y || 0) - (c.end_y || 0), dz = (n.start_z || 0) - (c.end_z || 0);
    const gap = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (gap > 5) issues.push({ index: i, gap: Math.round(gap), currComp: c.component || '?', nextComp: n.component || '?', suggestion: gap > 100 ? "Manglende rør" : "Lite gap" });
  }
  return issues;
}

function buildRouteFromGraph(components, originOffset = { x:0, y:0, z:0 }) {
  const topologyWarnings = [];
  const hasGraphSchema = components.some(c => c.id !== undefined && c.id !== null && c.id !== "");
  if (!hasGraphSchema) {
    return { components: calculateAbsoluteCoordinatesLinear(components, originOffset), topologyWarnings, continuityIssues: [], usedGraphSchema: false };
  }

  const byId = new Map();
  components.forEach(c => { if (c.id !== undefined && c.id !== null) byId.set(String(c.id), c); });

  const isRoot = (c) => !c.connects_from || c.connects_from === "START" || !byId.has(String(c.connects_from));
  const roots = components.filter(isRoot);

  if (roots.length > 1) topologyWarnings.push(`Fant ${roots.length} frittstående rørløp uten forbindelse til hverandre. Sjekk om det mangler en kobling.`);
  if (roots.length === 0 && components.length > 0) {
    return { components: calculateAbsoluteCoordinatesLinear(components, originOffset), topologyWarnings: ["Ingen gyldig startpunkt – fallback til lineær."], continuityIssues: [], usedGraphSchema: false };
  }

  const childrenOf = new Map();
  components.forEach(c => { if (!isRoot(c)) { const pk = String(c.connects_from); if (!childrenOf.has(pk)) childrenOf.set(pk, []); childrenOf.get(pk).push(c); } });

  const resolved = new Map(), visited = new Set();
  
  roots.forEach((root, chainIndex) => {
    const offset = { x: originOffset.x + chainIndex * 3000, y: originOffset.y, z: originOffset.z };
    const queue = [{ comp: root, origin: offset, direction: null, z: offset.z }];
    
    while (queue.length) {
      const { comp, origin, direction, z } = queue.shift();
      const ik = comp.id !== undefined ? String(comp.id) : null;
      if (ik && visited.has(ik)) continue;
      if (ik) visited.add(ik);
      
      const placed = placeComponent(comp, origin, direction, z);
      if (ik) resolved.set(ik, placed);
      
      const kids = ik ? (childrenOf.get(ik) || []) : [];
      kids.forEach(k => queue.push({ comp: k, origin: placed.end, direction: placed.direction, z: placed.outZ }));
    }
  });

  const withCoords = components.map(c => {
    const ik = c.id !== undefined ? String(c.id) : null;
    if (ik && resolved.has(ik)) {
      const r = resolved.get(ik);
      return { ...c, start_x: r.start.x, start_y: r.start.y, start_z: r.start.z, end_x: r.end.x, end_y: r.end.y, end_z: r.end.z };
    }
    return { ...c, start_x: 0, start_y: 0, start_z: 0, end_x: 0, end_y: 0, end_z: 0, _unplaced: true };
  });

  const byIdWithCoords = new Map();
  withCoords.forEach(c => { if (c.id !== undefined) byIdWithCoords.set(String(c.id), c); });

  const continuityIssues = [];
  withCoords.forEach((curr, i) => {
    if (curr.connects_from && curr.connects_from !== "START") {
      const parent = byIdWithCoords.get(String(curr.connects_from));
      if (parent && !curr._unplaced && !parent._unplaced) {
        const dx = curr.start_x - parent.end_x, dy = curr.start_y - parent.end_y, dz = curr.start_z - parent.end_z;
        const gap = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (gap > 5) {
          continuityIssues.push({
            index: i, gap: Math.round(gap), currComp: parent.component || '?', nextComp: curr.component || '?',
            suggestion: gap > 100 ? "AI bommet betydelig før auto-korrigering – sjekk manuelt" : "Lite gap – trolig avrunding",
          });
        }
        curr.start_x = parent.end_x; curr.start_y = parent.end_y; curr.start_z = parent.end_z;
      }
    }
  });

  const unplacedCount = withCoords.filter(c => c._unplaced).length;
  if (unplacedCount > 0) topologyWarnings.push(`${unplacedCount} komponenter manglet gyldig id/connects_from og ble ikke plassert.`);

  return { components: withCoords, topologyWarnings, continuityIssues, usedGraphSchema: true };
}

function validateTopologyRules(components) {
  const warnings = [], childrenOf = new Map();
  components.forEach(c => { if (c.connects_from && c.connects_from !== "START") { const k = String(c.connects_from); if (!childrenOf.has(k)) childrenOf.set(k, []); childrenOf.get(k).push(c); } });
  components.forEach((c, i) => {
    if (c.component === 'Bend' && c.direction) { const p = parseBendParts(c.direction); if (p && p[0] === p[1]) warnings.push(`Bend #${i + 1}: retning endrer seg ikke.`); }
    if (c.component === 'Reducer' && c.id !== undefined) { const kids = childrenOf.get(String(c.id)) || []; kids.forEach(n => { if (n && n.size_dn_nps && c.size_dn_nps && n.size_dn_nps === c.size_dn_nps) warnings.push(`Reducer #${i + 1}: samme DN før og etter.`); }); }
  });
  return warnings;
}

function buildExpectedCountsChecklist(lomItems) {
  if (!lomItems || !lomItems.length) return "";
  const counts = {};
  lomItems.forEach(i => {
    const type = normalizeComponentName(i.component);
    if (type === 'Fastener') return;
    const key = `${type} ${i.size_dn_nps || ''}`.trim();
    counts[key] = (counts[key] || 0) + (Number(i.quantity) || 1);
  });
  const lines = Object.entries(counts).map(([k, v]) => `- ${k}: ${v} stk`).join("\n");
  if (!lines) return "";
  return `\nFØR du svarer: materiallisten sier at rørtraséen skal inneholde omtrent:\n${lines}\nVIKTIG: dette er en kontrolliste over synlige komponenter. Hvis du ser komponenter fra denne listen på tegningen, skal de være med i JSON selv om de er små, ligger på avgreninger eller ikke er på hovedrøret.\n`;
}

export default function DrawingUploader({ onComponentsReady, onDiagnostics, apiKey, externalLomItems, projectSettings, onSettingsChange }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [customStandards, setCustomStandards] = useState(() => projectSettings?.customStandards || "");
  const [showCustom, setShowCustom] = useState(false);
  const [model, setModel] = useState(() => projectSettings?.model || localStorage.getItem("mto3d_model") || "google/gemini-2.5-flash-image");
  const [useOCR, setUseOCR] = useState(true);
  const [ocrProgress, setOcrProgress] = useState("");
  const [orientation, setOrientation] = useState(() => projectSettings?.orientation || localStorage.getItem("mto3d_orientation") || "elevation");
  const [globalOrigin, setGlobalOrigin] = useState({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    const saved = projectSettings?.customStandards || localStorage.getItem("mto3d_custom_standards");
    if (saved) setCustomStandards(saved);
  }, [projectSettings?.customStandards]);

  const handleCustomChange = (e) => {
    setCustomStandards(e.target.value);
    localStorage.setItem("mto3d_custom_standards", e.target.value);
    if (onSettingsChange) onSettingsChange('customStandards', e.target.value);
  };
  const handleModelChange = (e) => {
    setModel(e.target.value);
    localStorage.setItem("mto3d_model", e.target.value);
    if (onSettingsChange) onSettingsChange('model', e.target.value);
  };
  const handleOrientationChange = (e) => {
    setOrientation(e.target.value);
    localStorage.setItem("mto3d_orientation", e.target.value);
    if (onSettingsChange) onSettingsChange('orientation', e.target.value);
  };
  const handleFileChange = (e) => { const selected = Array.from(e.target.files); if (selected.length > 3) { alert("Maksimalt 3 filer om gangen."); return; } setFiles(selected); };
  const handleImportStandards = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const text = await file.text();
      const imported = file.name.endsWith('.json') ? JSON.stringify(JSON.parse(text), null, 2) : text;
      setCustomStandards(imported);
      localStorage.setItem("mto3d_custom_standards", imported);
      if (onSettingsChange) onSettingsChange('customStandards', imported);
      alert("Standarder importert!");
    } catch (err) { alert("Kunne ikke lese filen. Bruk .json eller .txt."); }
  };
  const runOCR = async (file) => { const { data } = await Tesseract.recognize(file, "eng", { logger: (m) => { if (m.status === "recognizing text") setOcrProgress(`OCR: ${Math.round(m.progress * 100)}% på ${file.name}`); } }); return data.text; };

  const extractLOM = async (bases, ocrTexts) => {
    const customStandardsSection = customStandards ? `\nEGENDERFINERTE STANDARDER OG SPESIFIKASJONER:\n${customStandards}\n` : "";

    const lomPrompt = `Les "List of Materials" / MTO-tabellen fra denne ISO-tegningen.

VIKTIG: Finn også referansepunktet (Tie-in Point / Origin Coordinate) fra tegningshodet.
Returner dette som et eget felt "reference_point":
"reference_point": { "point_name": "F11", "east_X": 360142, "north_Y": 171879, "elevation_Z": 530337 }

Returner et JSON-objekt:
{
  "reference_point": { "point_name": "F11", "east_X": 360142, "north_Y": 171879, "elevation_Z": 530337 },
  "mto_items": [
     { "item_no": "1", "quantity": 1, "component": "PIPE", "size_dn_nps": "DN250", "schedule": "40S", "material": "A106-B" }
  ]
}

 ${customStandardsSection}${ocrTexts.length > 0 ? "OCR-tekst:\n" + ocrTexts.map(ot => ot.text).join("\n") : ""}`;

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': window.location.href, 'X-Title': 'MTO 3D' },
      body: JSON.stringify({ 
        model, 
        messages: [{ role: 'user', content: [{ type: "text", text: lomPrompt }, ...bases.map(b => ({ type: "image_url", image_url: { url: `data:${b.mime};base64,${b.base64}`, detail: "high" } }))] }], 
        max_tokens: 4096, 
        temperature: 0.05,
        response_format: { type: "json_object" }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'LOM-feil');

    const parsed = safeParseJSON(data.choices?.[0]?.message?.content);

    let refPoint = { x: 0, y: 0, z: 0 };
    let items = [];

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (parsed.reference_point) {
        refPoint = {
          x: Number(parsed.reference_point.east_X) || 0,
          y: Number(parsed.reference_point.north_Y) || 0,
          z: Number(parsed.reference_point.elevation_Z) || 0
        };
      }
      items = parsed.mto_items || parsed.components || [];
    } else if (Array.isArray(parsed)) {
      items = parsed;
    }

    return { lomItems: items, referencePoint: refPoint };
  };

  const extractRoute = async (bases, ocrTexts, lomItems, retryCount = 0) => {
    const orientationInfo = {
      elevation: "Tegningen er en isometrisk tegning. Opp på papiret er normalt HØYDE (Z-akse), men DIAGONALE skrålinjer er X/Y.",
      north: "Opp = geografisk nord (Y+).",
      east: "Opp = geografisk øst.",
      south: "Opp = geografisk sør.",
      west: "Opp = geografisk vest."
    };

    const detectedSizes = lomItems && lomItems.length > 0
      ? Array.from(new Set(lomItems.map(item => item.size || item.size_dn_nps).filter(Boolean))).join(", ")
      : null;

    const sizeInstruction = detectedSizes
      ? `Bruk KUN dimensjoner som finnes i MTO-listen: [${detectedSizes}].`
      : "Ingen MTO-liste er tilgjengelig for kryssjekk denne gangen – les dimensjonen direkte fra tegningens dimensjonslinjer/merkinger, uten å begrense deg til noen forhåndsdefinert liste.";

    const systemPrompt = `Du er en ren data-ekstraksjons-maskin for isometriske rørtegninger (ISO).
Du må kun returnere gyldig JSON på formen: {"components": [...]}.

Format-eksempel:
{"components": [
  {"id":"1","connects_from":"START","component":"Pipe","size_dn_nps":"DN80","direction":"E","length_mm":2000,"confidence":0.9,"source":"dimension_line"}
]}

Hvis du overhodet ikke finner data, returner {"components": []}

ISOMETRIC DRAWING INTERPRETATION RULES:
This drawing is an isometric projection.
Projection on paper is NOT elevation.
Rules:
1. A 30° diagonal line on paper NEVER represents elevation. It only represents horizontal pipe routing.
2. Only TRUE vertical lines on the page represent Z-axis movement.
3. Keep the current Z elevation unless one of these exists:
   - a vertical pipe
   - a vertical elbow
   - explicit elevation annotation
   - explicit UP or DOWN direction
4. Do NOT infer elevation from perspective.
5. Main pipeline shall remain at constant elevation unless explicit evidence indicates otherwise.
If uncertain, keep Z unchanged.

BEND OG RETNINGSENDRINGER:
- For bend: sett direction til "FraRetning-to-TilRetning". F.eks. "E-to-N", "N-to-UP", "UP-to-W".

LENGDER:
- Les av avstanden fra dimensjonslinjene på tegningen i mm og legg inn i "length_mm".`;

    const userPrompt = `Følg HELE rørtraséen på denne ISO-tegningen fra start til slutt. Inkluder ALLE komponenter: rør, bend, flenser, ventiler, weldlets, reduksjoner, T-rør, drip rings og blindflenser.

For hvert segment, returner:
- id: unik id (f.eks. "1", "2", "3"...).
- connects_from: id-en til forrige komponent, eller "START".
- component: "Pipe", "Bend", "Flange", "Valve", "Weldlet", "Reducer", "Tee", "Drip Ring", "Spectacle Blind", "Nipple".
- size_dn_nps: ${sizeInstruction}
- direction: "N"/"NE"/"E"/"SE"/"S"/"SW"/"W"/"NW"/"UP"/"DOWN". For bend: "N-to-E" etc.
- length_mm: KUN for Pipe – les fra dimensjonslinjen i mm.
- insulation_thickness_mm: 0 eller les fra notat.
- schedule: les fra MTO/notat eller "40" som standard.
- confidence: 0.0-1.0.
- source: "dimension_line", "material_table", "inferred", eller "field_marking".

VIKTIG: IKKE begrens deg til hovedrøret. Inkluder også alle synlige avgreninger (f.eks. drenering/lufting), korte komponenter og tilbehør på tegningen. Bruk MTO-sjekklisten under som kontrolliste: hvis en komponent står i MTO og er synlig på tegningen, SKAL den være med i JSON!

VIKTIG ORIENTERINGS-REGLER:
 ${orientationInfo[orientation] || orientationInfo.elevation}

 ${buildASMETable()}
 ${customStandards ? `\nEGENDERFINERTE STANDARDER OG SPESIFIKASJONER:\n${customStandards}\n` : ""}
 ${ocrTexts && ocrTexts.length > 0 ? `OCR-tekst (bruk dette som FASIT for tall, bokstaver og linjenumre der det er lesbart – bruk BILDET for geometri, plassering og retning):\n` + ocrTexts.map(ot => ot.text).join("\n") : ""}
 ${buildExpectedCountsChecklist(lomItems)}

Returner et JSON-objekt på formen {"components": [...]}. DU SKAL IKKE REGNE UT ABSOLUTTE KOORDINATER – kun relative retninger og lengder.`;

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': window.location.href, 'X-Title': 'MTO 3D' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: [{ type: "text", text: userPrompt }, ...bases.map(b => ({ type: "image_url", image_url: { url: `data:${b.mime};base64,${b.base64}`, detail: "high" } }))] }
        ],
        max_tokens: retryCount > 0 ? 12000 : 8192,
        temperature: 0.05,
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Rute-feil');

    if (data.choices[0].finish_reason === 'length' && retryCount < 1) {
      console.warn("ADVARSEL: AI-responsen ble trunkert – prøver på nytt med høyere max_tokens.");
      return extractRoute(bases, ocrTexts, lomItems, retryCount + 1);
    }

    const parsed = safeParseJSON(data.choices?.[0]?.message?.content);

    let items;
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.components)) {
      items = parsed.components;
    } else {
      items = [];
    }

    return items.map(normalizeRouteItem);
  };

  const mergeAndCalculate = (lomItems, routeItems, originPoint) => {
    const cleanSize = (s) => String(s || 'ANY').toUpperCase().replace(/\s+/g, '');

    const lomNormalized = lomItems
      .map(i => ({ 
        ...i, 
        normalizedType: normalizeComponentName(i.component),
        normalizedSize: cleanSize(i.size_dn_nps || i.size)
      }))
      .filter(i => i.normalizedType !== 'Fastener');

    const lomMap = {};
    lomNormalized.forEach(i => { 
      const k = `${i.normalizedType}_${i.normalizedSize}`; 
      if (!lomMap[k]) lomMap[k] = { expected: 0, found: 0, component: i.normalizedType, size: i.normalizedSize }; 
      lomMap[k].expected += Number(i.quantity) || 1; 
    });

    const routeNormalized = routeItems.map(i => ({ 
      ...i, 
      normalizedType: normalizeComponentName(i.component || ''),
      normalizedSize: cleanSize(i.size_dn_nps || i.size)
    }));

    routeNormalized.forEach(i => { 
      const k = `${i.normalizedType}_${i.normalizedSize}`; 
      if (lomMap[k]) lomMap[k].found++; 
    });

    const { components: withCoords, topologyWarnings, continuityIssues: graphContinuityIssues, usedGraphSchema } = buildRouteFromGraph(routeNormalized, originPoint);
    
    const ruleWarnings = validateTopologyRules(routeNormalized);
    const continuityIssues = usedGraphSchema ? graphContinuityIssues : validateContinuityLinear(withCoords);

    const lomIssues = [];
    const extraIssues = [];
    Object.entries(lomMap).forEach(([k, v]) => {
      if (v.found < v.expected) lomIssues.push({ component: v.component, size: v.size, expected: v.expected, found: v.found, missing: v.expected - v.found });
      if (v.found > v.expected) extraIssues.push({ component: v.component, size: v.size, expected: v.expected, found: v.found, extra: v.found - v.expected });
    });

    const reconciliationStatus = (lomIssues.length === 0 && extraIssues.length === 0 && continuityIssues.length === 0) ? 'safe' : 'deviation';

    return { components: withCoords, lomIssues, extraIssues, topologyWarnings, ruleWarnings, continuityIssues, usedGraphSchema, reconciliationStatus };
  };

  const handleUpload = async () => {
    if (files.length === 0 || !apiKey) { alert(apiKey ? "Velg minst én fil." : "API‑nøkkel mangler."); return; }
    setLoading(true); setOcrProgress("");
    setGlobalOrigin({ x: 0, y: 0, z: 0 });

    try {
      setOcrProgress("Forbereder filer...");
      let processedFiles = [];
      for (const file of files) {
        if (isPdfFile(file)) {
          setOcrProgress(`Konverterer PDF: ${file.name}...`);
          const imageFiles = await convertPdfToImageFiles(file);
          processedFiles.push(...imageFiles);
        } else {
          processedFiles.push(file);
        }
      }

      let ocrTexts = [];
      if (useOCR) { 
        for (const file of processedFiles) { 
          const text = await runOCR(file); 
          ocrTexts.push({ fileName: file.name, text }); 
        } 
      }

      const bases = await Promise.all(processedFiles.map(f => new Promise((resolve) => { 
        const reader = new FileReader(); 
        reader.onload = () => resolve({ base64: reader.result.split(',')[1], mime: f.type }); 
        reader.readAsDataURL(f); 
      })));

      let lomItems = [];
      let referencePoint = { x: 0, y: 0, z: 0 };
      if (Array.isArray(externalLomItems) && externalLomItems.length > 0) {
        lomItems = externalLomItems;
      } else {
        try {
          const lomResult = await extractLOM(bases, ocrTexts);
          lomItems = Array.isArray(lomResult.lomItems) ? lomResult.lomItems : [];
          referencePoint = lomResult.referencePoint || referencePoint;
        } catch (err) {
          console.warn("LOM-ekstraksjon feilet, fortsetter uten MTO-sjekkliste:", err);
        }
      }
      setGlobalOrigin(referencePoint);

      const routeItems = await extractRoute(bases, ocrTexts, lomItems);
      if (!routeItems || !Array.isArray(routeItems)) {
        alert("Rute-analysen returnerte ikke gyldige data. Prøv igjen, evt. med en annen modell.");
        return;
      }

      let mergeResult;
      try {
        mergeResult = mergeAndCalculate(lomItems, routeItems, referencePoint);
      } catch (err) {
        console.warn("mergeAndCalculate feilet:", err);
        mergeResult = { components: routeItems.map(c => ({ ...c, schedule: c.schedule || "40" })), lomIssues: [], extraIssues: [], topologyWarnings: [], ruleWarnings: [], continuityIssues: [], reconciliationStatus: 'unknown' };
      }
      const { components, lomIssues, extraIssues, topologyWarnings, ruleWarnings, continuityIssues, reconciliationStatus } = mergeResult;

      const diagnostics = { lomIssues, extraIssues, topologyWarnings, ruleWarnings, continuityIssues, reconciliationStatus };
      if (typeof onDiagnostics === "function") onDiagnostics(diagnostics);

      onComponentsReady(components);
    } catch (e) { console.error("AI‑feil:", e); alert('AI‑feil: ' + (e.message || 'Ukjent feil')); } finally { setLoading(false); setOcrProgress(""); }
  };

  return (
    <div className="card">
      <div className="upload-zone" style={{ borderColor: "#a855f7" }}>
        <p style={{ fontSize: "1.2rem", fontWeight: 700 }}>🤖 Slipp ISO/P&ID‑tegning her</p>
        <p style={{ color: "#6b7280", marginTop: "0.4rem" }}>eller klikk (.pdf, .png, .jpg, .jpeg) – opptil 3 filer (original oppløsning)</p>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg" multiple onChange={handleFileChange} style={{ display: "none" }} id="aiFileInput" />
        <label htmlFor="aiFileInput" className="btn btn-purple" style={{ marginTop: "1rem" }}>📤 Velg fil(er)</label>
        {files.length > 0 && (<div style={{ marginTop: "0.5rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>{files.map((f, i) => <div key={i}>✅ {f.name}</div>)}</div>)}
      </div>

      {Array.isArray(externalLomItems) && externalLomItems.length > 0 && (
        <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "rgba(20,184,166,0.1)", border: "1px solid rgba(20,184,166,0.3)", borderRadius: "0.5rem", fontSize: "0.8rem", color: "#5eead4" }}>
          Bruker {externalLomItems.length} komponenter fra MTO-tabellen (Steg 1) — leser ikke materiallisten på nytt her.
        </div>
      )}

      <div style={{ marginTop: "1rem" }}>
        <label style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginRight: "0.5rem" }}>🧭 Tegningens "opp" er:</label>
        <select value={orientation} onChange={handleOrientationChange} style={{ padding: "0.4rem", borderRadius: "0.4rem", background: "var(--panel-2)", color: "var(--text)", border: "1px solid var(--border)" }}>
          <option value="elevation">Opp = Høyde (Z+) – ISO standard</option>
          <option value="north">Opp = Nord (Y+)</option>
          <option value="east">Opp = Øst (X+)</option>
        </select>
        <span style={{ fontSize: "0.72rem", color: "#6b7280", marginLeft: "0.5rem" }}>Bruk "Høyde" for riktig Z-akse</span>
      </div>

      <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <label style={{ color: "var(--text-dim)", fontSize: "0.85rem", cursor: "pointer" }}><input type="checkbox" checked={useOCR} onChange={e => setUseOCR(e.target.checked)} style={{ marginRight: "0.4rem" }} />🔍 Bruk OCR</label>
        {ocrProgress && <span style={{ color: "var(--text-dim)", fontSize: "0.75rem" }}>{ocrProgress}</span>}
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginRight: "0.5rem" }}>AI‑modell:</label>
        <select value={model} onChange={handleModelChange} style={{ padding: "0.4rem", borderRadius: "0.4rem", background: "var(--panel-2)", color: "var(--text)", border: "1px solid var(--border)" }}>
          <option value="google/gemini-2.5-flash-image">Gemini 2.5 Flash (anbefalt)</option>
          <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
          <option value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
          <option value="openai/gpt-4o">GPT‑4o</option>
          <option value="qwen/qwen2.5-vl-72b-instruct">Qwen VL 72B</option>
        </select>
      </div>

      <div className="collapse-toggle" onClick={() => setShowCustom(!showCustom)} style={{ marginTop: "1rem" }}>
        <span className="label-row" style={{ fontSize: "0.9rem", color: "var(--text-dim)", cursor: "pointer" }}>📋 Egendefinerte standarder</span>
        <span className="chevron" style={{ transform: showCustom ? "rotate(180deg)" : "none", transition: "0.2s" }}>▾</span>
      </div>
      {showCustom && (
        <div style={{ marginTop: "0.5rem" }}>
          <textarea value={customStandards} onChange={handleCustomChange} placeholder="Lim inn ekstra standarder her..." style={{ width: "100%", minHeight: "100px", padding: "0.75rem", borderRadius: "0.65rem", border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--text)", fontFamily: "monospace", fontSize: "0.8rem", resize: "vertical" }} />
          <div style={{ marginTop: "0.5rem" }}><label className="btn-outline btn-sm" style={{ cursor: "pointer" }}>📂 Importer standarder fra fil<input type="file" accept=".json,.txt" onChange={handleImportStandards} style={{ display: "none" }} /></label></div>
        </div>
      )}

      {globalOrigin.x !== 0 || globalOrigin.y !== 0 || globalOrigin.z !== 0 ? (
        <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "0.5rem", fontSize: "0.8rem", color: "#6ee7b7" }}>
          📍 Anleggskoordinater: E: {globalOrigin.x}, N: {globalOrigin.y}, EL: {globalOrigin.z} mm
        </div>
      ) : null}

      <p style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: "0.5rem" }}>
        💡 Gemini Flash anbefalt • PDF konverteres automatisk til skarpe bilder • Opp = Høyde for riktig Z‑akse • Auto‑Snap måler avvik før det rettes
      </p>

      <button className="btn btn-purple" onClick={handleUpload} disabled={files.length === 0 || loading}>{loading ? "⏳ Analyserer (PDF/Bilde → AI)..." : "🤖 Analyser med AI"}</button>
    </div>
  );
}