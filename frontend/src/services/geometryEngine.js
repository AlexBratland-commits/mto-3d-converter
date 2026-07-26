export const ASME_OD = { 50:60.3, 80:88.9, 100:114.3, 150:168.3, 200:219.1, 250:273.0, 300:323.9, 350:355.6, 400:406.4, 450:457.2, 500:508.0, 600:609.6 };
export const ASME_BEND_RADIUS_LR = { 50:76, 80:114, 100:152, 150:229, 200:305, 250:381, 300:457, 350:533, 400:610, 450:686, 500:762, 600:914 };
export const ASME_WALL_SCH40 = { 50:3.9, 80:5.5, 100:6.0, 150:7.1, 200:8.2, 250:9.3, 300:10.3, 350:11.1, 400:12.7, 450:14.3, 500:15.1, 600:17.5 };

export const ASME_LENGTHS = {
  Flange: { 50: 20, 80: 22, 100: 24, 150: 26, 200: 30, 250: 32, 300: 34 },
  Valve: { 50: 178, 80: 203, 100: 229, 150: 267, 200: 292, 250: 330, 300: 356 },
  Reducer: { 50: 76, 80: 86, 100: 102, 150: 146, 200: 178, 250: 216, 300: 254 },
  Tee: { 50: 76, 80: 86, 100: 105, 150: 143, 200: 178, 250: 216, 300: 254 },
  Weldlet: { 50: 30, 80: 35, 100: 40, 150: 50, 200: 60, 250: 70, 300: 80 },
  Nipple: { 50: 100, 80: 100, 100: 100, 150: 150, 200: 150 },
  'Drip Ring': { 50: 40, 80: 40, 100: 40, 150: 40, 200: 40 },
  'Spectacle Blind': { 50: 30, 80: 30, 100: 30, 150: 30, 200: 30 }
};

export function estimateComponentLength(type, dn) {
  const table = ASME_LENGTHS[type];
  if (!table) return 50;
  if (table[dn] !== undefined) return table[dn];

  const knownDns = Object.keys(table).map(Number).filter((n) => !isNaN(n));
  if (knownDns.length === 0) return 50;

  const nearestDn = knownDns.reduce((best, d) => (Math.abs(d - dn) < Math.abs(best - dn) ? d : best), knownDns[0]);
  const odNearest = ASME_OD[nearestDn] || Math.round(nearestDn * 1.15 * 10) / 10;
  const odTarget = ASME_OD[dn] || Math.round(dn * 1.15 * 10) / 10;
  
  if (odNearest && odTarget) {
    return Math.round(table[nearestDn] * (odTarget / odNearest));
  }
  return table[nearestDn] || 50;
}

export function normalizeComponentName(name) {
  const n = (name || '').toUpperCase();
  if (n.includes('ELBOW') || n.includes('BEND')) return 'Bend';
  if (n.includes('FLANGE')) return 'Flange';
  if (n.includes('VALVE') || n.includes('BLOCK')) return 'Valve';
  if (n.includes('PIPE')) return 'Pipe';
  if (n.includes('WELDLET') || n.includes('OLET')) return 'Weldlet';
  if (n.includes('REDUCER') || n.includes('SWAGE')) return 'Reducer';
  if (n.includes('TEE')) return 'Tee';
  if (n.includes('NIPPLE')) return 'Nipple';
  if (n.includes('DRIP')) return 'Drip Ring';
  if (n.includes('SPECT') || n.includes('BLIND')) return 'Spectacle Blind';
  if (n.includes('GASKET') || n.includes('STUD') || n.includes('BOLT') || n.includes('NUT')) return 'Fastener';
  return n.trim();
}

export function normalizeDirKey(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase().replace(/[\s->_]+/g, '-');
  const map = { 'N':'N','NORTH':'N','S':'S','SOUTH':'S','E':'E','EAST':'E','W':'W','WEST':'W','NE':'NE','NORTHEAST':'NE','NW':'NW','NORTHWEST':'NW','SE':'SE','SOUTHEAST':'SE','SW':'SW','SOUTHWEST':'SW','UP':'UP','UPWARD':'UP','U':'UP','DOWN':'DOWN','DOWNWARD':'DOWN','DN':'DOWN','D':'DOWN' };
  return map[s] || s;
}

const ROUTE_KEY_ALIASES = {
  cf: 'connects_from', comp: 'component', dn: 'size_dn_nps',
  dir: 'direction', len: 'length_mm', ins: 'insulation_thickness_mm',
  sch: 'schedule', conf: 'confidence', src: 'source',
};

export function normalizeRouteItem(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const out = {};
  Object.entries(raw).forEach(([k, v]) => { out[ROUTE_KEY_ALIASES[k] || k] = v; });
  return out;
}

export function buildASMETable() {
  let table = "ASME B36.10 ytre diameter (mm): ";
  table += Object.entries(ASME_OD).map(([dn, od]) => `DN${dn}=${od}`).join(", ");
  table += "\nASME B16.9 bend-radius LR (mm): ";
  table += Object.entries(ASME_BEND_RADIUS_LR).map(([dn, r]) => `DN${dn}=${r}`).join(", ");
  table += "\nGodstykkelse SCH40 (mm): ";
  table += Object.entries(ASME_WALL_SCH40).map(([dn, w]) => `DN${dn}=${w}`).join(", ");
  return table;
}

const DIRECTION_VECTORS = {
  "N":[0,1,0], "NE":[0.707,0.707,0], "E":[1,0,0], "SE":[0.707,-0.707,0],
  "S":[0,-1,0], "SW":[-0.707,-0.707,0], "W":[-1,0,0], "NW":[-0.707,0.707,0],
  "UP":[0,0,1], "DOWN":[0,0,-1]
};
const HORIZONTAL_DIRS = ["N", "S", "E", "W", "NE", "NW", "SE", "SW"];

export function getVector(dir) { const key = normalizeDirKey(dir); return DIRECTION_VECTORS[key] || null; }
export function parseBendParts(directionStr) {
  const s = String(directionStr || '').trim().toUpperCase().replace(/[\s->_]+/g, '-');
  const parts = s.split('-TO-'); if (parts.length === 2) return [parts[0], parts[1]];
  const short = s.split('-'); if (short.length === 2) return [short[0], short[1]];
  return null;
}

export function placeShortOffset(comp, origin, direction, incomingZ) {
  const { x:ox, y:oy, z:oz } = origin;
  const dir = comp.direction || direction;
  const vec = getVector(dir) || [1,0,0];
  const dn = parseInt(String(comp.size_dn_nps||'').replace(/DN/i,''))||100;
  const dist = estimateComponentLength(comp.component, dn);
  const isHorizontal = HORIZONTAL_DIRS.includes(normalizeDirKey(dir));
  const startZ = isHorizontal ? incomingZ : oz;
  const endZ = isHorizontal ? incomingZ : oz + vec[2]*dist;
  return { start:{x:ox,y:oy,z:startZ}, end:{x:ox+vec[0]*dist,y:oy+vec[1]*dist,z:endZ}, direction: dir, outZ: endZ };
}

export function placePipe(comp, origin, direction, incomingZ) {
  const { x:ox, y:oy, z:oz } = origin;
  const dir = comp.direction || direction;
  const vec = getVector(dir) || [0,0,0];
  const len = comp.length_mm || 500;
  const isHorizontal = HORIZONTAL_DIRS.includes(normalizeDirKey(dir));
  const startZ = isHorizontal ? incomingZ : oz;
  const endZ = isHorizontal ? incomingZ : oz + vec[2]*len;
  return { start:{x:ox,y:oy,z:startZ}, end:{x:ox+vec[0]*len,y:oy+vec[1]*len,z:endZ}, direction:normalizeDirKey(dir)||dir, outZ: endZ };
}

export function placeBend(comp, origin, direction, incomingZ) {
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
  return { start: {x:ox, y:oy, z:startZ}, end: {x:ox+(fv[0]+tv[0])*T, y:oy+(fv[1]+tv[1])*T, z:endZ}, direction: to, outZ: endZ };
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

export function placeComponent(comp, origin, incomingDirection, incomingZ) {
  const placer = PLACERS[comp.component];
  if (!placer) { 
      const {x,y,z} = origin; 
      return {start:{x,y,z}, end:{x,y,z}, direction:incomingDirection, outZ: incomingZ}; 
  }
  return placer(comp, origin, incomingDirection, incomingZ);
}

export function calculateAbsoluteCoordinatesLinear(components, originOffset = { x:0, y:0, z:0 }) {
  let x = originOffset.x, y = originOffset.y, z = originOffset.z;
  let currentDirection = null;
  let currentZ = z;
  return components.map((comp) => {
    const placed = placeComponent(comp, { x, y, z }, currentDirection, currentZ);
    x = placed.end.x; y = placed.end.y; z = placed.end.z; 
    currentDirection = placed.direction;
    currentZ = placed.outZ !== undefined ? placed.outZ : currentZ;
    return { ...comp, start_x: placed.start.x, start_y: placed.start.y, start_z: placed.start.z, end_x: x, end_y: y, end_z: z };
  });
}

export function buildRouteFromGraph(components, originOffset = { x:0, y:0, z:0 }) {
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
          continuityIssues.push({ index: i, gap: Math.round(gap), currComp: parent.component || '?', nextComp: curr.component || '?', suggestion: gap > 100 ? "AI bommet betydelig før auto-korrigering – sjekk manuelt" : "Lite gap – trolig avrunding" });
        }
        curr.start_x = parent.end_x; curr.start_y = parent.end_y; curr.start_z = parent.end_z;
      }
    }
  });

  const unplacedCount = withCoords.filter(c => c._unplaced).length;
  if (unplacedCount > 0) topologyWarnings.push(`${unplacedCount} komponenter manglet gyldig id/connects_from og ble ikke plassert.`);
  return { components: withCoords, topologyWarnings, continuityIssues, usedGraphSchema: true };
}

export function validateContinuityLinear(components) {
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

export function validateTopologyRules(components) {
  const warnings = [], childrenOf = new Map();
  components.forEach(c => { if (c.connects_from && c.connects_from !== "START") { const k = String(c.connects_from); if (!childrenOf.has(k)) childrenOf.set(k, []); childrenOf.get(k).push(c); } });
  components.forEach((c, i) => {
    if (c.component === 'Bend' && c.direction) { const p = parseBendParts(c.direction); if (p && p[0] === p[1]) warnings.push(`Bend #${i + 1}: retning endrer seg ikke.`); }
    if (c.component === 'Reducer' && c.id !== undefined) { const kids = childrenOf.get(String(c.id)) || []; kids.forEach(n => { if (n && n.size_dn_nps && c.size_dn_nps && n.size_dn_nps === c.size_dn_nps) warnings.push(`Reducer #${i + 1}: samme DN før og etter.`); }); }
  });
  return warnings;
}

export function buildExpectedCountsChecklist(lomItems) {
  if (!lomItems || !lomItems.length) return "";
  const counts = {};
  lomItems.forEach(i => {
    const type = normalizeComponentName(i.component);
    if (type === 'Fastener' || type === 'Pipe') return;
    const key = `${type} ${i.size_dn_nps || ''}`.trim();
    counts[key] = (counts[key] || 0) + (Number(i.quantity) || 1);
  });
  const lines = Object.entries(counts).map(([k, v]) => `- ${k}: ${v} stk`).join("\n");
  if (!lines) return "";
  return `\nFØR du svarer: materiallisten sier at rørtraséen skal inneholde omtrent:\n${lines}\nVIKTIG: dette er en kontrolliste over synlige komponenter. Hvis du ser komponenter fra denne listen på tegningen, skal de være med i JSON selv om de er små, ligger på avgreninger eller ikke er på hovedrøret.\n`;
}

/**
 * GEOMETRISK VALIDERINGSMOTOR (Pre-processor)
 * Rydder opp i AI-ens rådata FØR 3D-koordinatene beregnes.
 * Tvinger frem ASME-standardlengder og sikrer sammenhengende graf.
 */
export function sanitizeRouteGeometry(routeItems) {
  if (!routeItems || routeItems.length === 0) return [];

  const sanitized = [];
  let prevValidDir = "E"; // Standard retning hvis AI-en mangler en

  routeItems.forEach((comp, index) => {
    let cleanComp = { ...comp };
    const type = normalizeComponentName(cleanComp.component || '');
    const dn = parseInt(String(cleanComp.size_dn_nps || '').replace(/DN/i, '')) || 100;
    const asmeLen = estimateComponentLength(type, dn);

    // 1. Riktig retning
    if (cleanComp.direction) {
      prevValidDir = cleanComp.direction;
    } else {
      cleanComp.direction = prevValidDir; // Arv forrige retning
    }

    // 2. Tvunget ASME-lengde for alt unntatt Pipe
    if (type !== 'Pipe') {
      cleanComp.length_mm = asmeLen;
    } else {
      // For Pipe: Hvis AI-en ga en urimelig lengde (f.eks. > 10m eller < 10mm), gi den en standardlengde
      let aiLen = Number(cleanComp.length_mm) || 0;
      if (aiLen < 10 || aiLen > 10000) {
        console.warn(`Geometri-sjekk: Urimeleg lengde (${aiLen}mm) på rad ${index}. Setter til 500mm.`);
        cleanComp.length_mm = 500; 
      }
    }

    // 3. Sikre gyldig ID og graf-struktur
    if (!cleanComp.id) {
      cleanComp.id = String(index + 1);
    }
    
    // Hvis det er den første komponenten, tving connects_from til START
    if (index === 0) {
      cleanComp.connects_from = "START";
    } else if (!cleanComp.connects_from || cleanComp.connects_from === "START") {
      // Hvis den mangler kobling, koble til forrige sanitized komponent
      cleanComp.connects_from = sanitized[index - 1].id;
    }

    sanitized.push(cleanComp);
  });

  return sanitized;
}