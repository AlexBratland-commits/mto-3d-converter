import { canonicalSizeKey, parsePrimaryDN } from "./parseUtils";

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

// FIX 1: Utvidet normalisering med alle varianter fra Hydro/DVALIN-tegningene
export function normalizeComponentName(name) {
  const n = (name || '').toUpperCase().replace(/\s+/g, ' ');

  if (n.includes('ELBOW') || n.includes('BEND') || n.includes('ELB ')) return 'Bend';
  if (n.includes('SPECT') || n.includes('BLIND')) return 'Spectacle Blind';
  if (n.includes('FLANGE') || n.includes('FLG')) return 'Flange';

  // FIX: Alle ventilvarianter fra DVALIN-tegningene
  if (
    n.includes('VALVE') || n.includes('BLOCK') ||
    n.includes('PSV') || n.includes('PRV') || n.includes('SRV') ||
    n.includes('SAFETY RELIEF') || n.includes('RELIEF') ||
    n.includes('ESDV') || n.includes('VDS') ||
    n.includes('GVGD') || n.includes('GVAS') || n.includes('GVFD') ||
    n.includes('BNFD') || n.includes('CNFD') || n.includes('MGFD') ||
    n.includes('LSGD') || n.includes('BOFD') || n.includes('CPFD') ||
    n.includes('BALL') || n.includes('GATE') || n.includes('GLOBE') ||
    n.includes('CHECK') || n.includes('BUTTERFLY') || n.includes('NEEDLE')
  ) return 'Valve';

  if (n.includes('PIPE') || n.includes('PIP ') || n.includes('PIP\n')) return 'Pipe';
  if (n.includes('WELDLET') || n.includes('OLET') || n.includes('WOL')) return 'Weldlet';
  if (n.includes('REDUCER') || n.includes('SWAGE') || n.includes('RED CON') || n.includes('RED ECC')) return 'Reducer';
  if (n.includes('TEE')) return 'Tee';
  if (n.includes('NIPPLE')) return 'Nipple';
  if (n.includes('DRIP')) return 'Drip Ring';
  // [FASE 2b.1-FIKS] 3: 'FASTENER' lagt til for idempotens – normalizeComponentName('Fastener')
  // skal returnere 'Fastener', ikke falle gjennom til rå streng ved dobbel normalisering.
  if (n.includes('GASKET') || n.includes('GSK') || n.includes('STUD') || n.includes('STB') || n.includes('BOLT') || n.includes('NUT') || n.includes('FASTENER')) return 'Fastener';
  // [FASE 2a.5-FIKS] B2: OCR-varianter av STUD/N-MUTS («STUPKIN-MATS», «N-MUTS») er fasteners.
  // B3: samme MTO-rad leses som «INSULATING STRIP» eller bare «STRIP» – begge er admin-rader
  // (ikke modellert i 3D). 'Fastener' er admin-klassen isMtoAdminItem/mergeAndCalculate kjenner.
  if (n.includes('MUTS') || n.includes('STUPKIN') || n.includes('STRIP')) return 'Fastener';

  // Støtter og strukturelle elementer
  if (n.includes('SUPPORT') || n.includes('SHOE') || n.includes('HANGER') || n.includes('GUIDE') || n.includes('CLAMP') || n.includes('TRUNNION') || n.includes('PR0SH')) return 'Support';
  if (n.includes('DECK') || n.includes('PENETRATION')) return 'DeckPenetration';
  if (n.includes('REINFORC') || n.includes('REP PAD') || n.includes('PD0RP')) return 'ReinforcingPad';
  if (n.includes('BRACING') || n.includes('BRACE')) return 'Bracing';
  // [FASE 2b.1-FIKS] 3: 'WEARPLATE' (uten mellomrom) lagt til for idempotens – andre
  // normaliseringspass produserer 'WearPlate' → toUpperCase() gir 'WEARPLATE' uten mellomrom.
  if (n.includes('WEAR PLATE') || n.includes('WEARPLATE')) return 'WearPlate';
  if (n.includes('INSTRUMENT') || n.includes('TRANSMITTER') || n.includes('GAUGE') || n.includes('THERMOWELL') || n.includes('ELEMENT') || n.includes('ORIFICE') || n.includes('FO ') || n.includes('RO ')) return 'Instrument';
  if (n.includes('PLUG') || n.includes('BLEED')) return 'Plug';
  if (n.includes('CAP')) return 'Cap';

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
  // [FASE 2b-FIKS] 1d: delt parsePrimaryDN i stedet for lokal regex – se parseUtils.js.
  const dn = parsePrimaryDN(comp.size_dn_nps) || 100;
  const dist = estimateComponentLength(comp.component, dn);
  const isHorizontal = HORIZONTAL_DIRS.includes(normalizeDirKey(dir));
  const startZ = isHorizontal ? incomingZ : oz;
  const endZ = isHorizontal ? incomingZ : oz + vec[2]*dist;
  return { start:{x:ox,y:oy,z:startZ}, end:{x:ox+vec[0]*dist,y:oy+vec[1]*dist,z:endZ}, direction: dir, outZ: endZ };
}

// FIX 2: Ingen 500mm fallback. Returner _missingLength hvis AI feilet.
export function placePipe(comp, origin, direction, incomingZ) {
  const { x: ox, y: oy, z: oz } = origin;
  const dir = comp.direction || direction;
  const vec = getVector(dir) || [0, 0, 0];

  const len = Number(comp.length_mm);
  if (!Number.isFinite(len) || len <= 0) {
    console.warn(`placePipe: Mangler lengde for ${comp.component} ${comp.size_dn_nps} (id: ${comp.id})`);
    return {
      start: { x: ox, y: oy, z: incomingZ },
      end: { x: ox, y: oy, z: incomingZ },
      direction: normalizeDirKey(dir) || dir,
      outZ: incomingZ,
      _missingLength: true
    };
  }

  const isHorizontal = HORIZONTAL_DIRS.includes(normalizeDirKey(dir));
  const startZ = isHorizontal ? incomingZ : oz;
  const endZ = isHorizontal ? incomingZ : oz + vec[2] * len;
  return {
    start: { x: ox, y: oy, z: startZ },
    end: { x: ox + vec[0] * len, y: oy + vec[1] * len, z: endZ },
    direction: normalizeDirKey(dir) || dir,
    outZ: endZ
  };
}

// [FASE 2b-FIKS] 1b: skjæringspunktkonvensjon (beslutning A) – en bend forbruker null
// aksial lengde i denne modellen; start og end er begge rørets skjæringspunkt (origin).
// Den gamle T = R·tan(θ/2)-tangentmodellen ga en falsk forskyvning fordi AI-en aldri
// leverer de innkommende/utgående tangentpunktene modellen forutsatte. Bend-radius er
// nå ren visuell metadata som PipeComponent.jsx allerede beregner selv ved rendering.
// [FASE 2b.1-FIKS] 2: KJENT BEGRENSNING (fase 3): null-lengde bends renderes som
// punkt-markører (PipeComponent tidlig-retur) og eksporteres til STEP som 1mm-stubber
// (computeArcPoints L<1e-6 → DEGEN_STUB). Visuell torus-rendering og STEP-bue-geometri
// fra hjørnetangenter er planlagt oppfølging.
export function placeBend(comp, origin, direction, incomingZ) {
  const { x: ox, y: oy, z: oz } = origin;
  const parts = parseBendParts(comp.direction);
  const to = parts ? parts[1] : (normalizeDirKey(direction) || direction);
  return { start: { x: ox, y: oy, z: oz }, end: { x: ox, y: oy, z: oz }, direction: to, outZ: incomingZ };
}

const PLACERS = {
  Pipe: (c,o,d,z) => placePipe(c,o,d,z),
  Bend: (c,o,d,z) => placeBend(c,o,d,z),
  // [FASE 2b-FIKS] 1c: Elbow manglet i PLACERS – falt tilbake til pass-through
  // (origin uendret) i stedet for placeBend. Fungerte kun ved flaks fordi
  // sanitizeRouteGeometry nå persisterer normalisert navn (component=type) FØR
  // oppslag her, men vi dekker begge nøklene defensivt.
  Elbow: (c,o,d,z) => placeBend(c,o,d,z),
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

// [FASE 2b-FIKS] 1a: AI-en emitterer "connects_from": "BRANCH:<id>" ved grener fra
// weldlets/tees (avstikk). Uten oppløsning matcher dette ingen id i byId, komponenten
// tolkes som en uløselig rot, og får kunstig chainIndex*3000-forskyvning + falsk
// topologyWarning selv om grenen semantisk er koblet korrekt. Ekte uløselige verdier
// (START, ukjente id-er, manglende felt) returneres uendret – de skal fortsatt
// klassifiseres som røtter.
export function resolveParent(connectsFrom, byId) {
  const raw = String(connectsFrom ?? '');
  if (raw.startsWith('BRANCH:')) {
    const stripped = raw.slice('BRANCH:'.length);
    if (byId.has(stripped)) return stripped;
  }
  return connectsFrom;
}

export function buildRouteFromGraph(components, originOffset = { x:0, y:0, z:0 }) {
  const topologyWarnings = [];

  // [FASE 2c-FIKS] 3: PCF-importerte komponenter har allerede ekte start/end-koordinater
  // (PCF-filen ER koordinatene) – AI-veiens komponenter har det ALDRI på dette punktet
  // (kun connects_from+retning+lengde; koordinater er BFS-plasseringens output, ikke input).
  // Denne finite-sjekken skiller derfor de to kildene presist. Bruk koordinatene direkte
  // i stedet for å la BFS/placeComponent overskrive dem, men kjør likevel samme
  // rot-telling (for "frittstående rørløp"-varsel) og kontinuitets-validering mot
  // connects_from/BRANCH: som graf-veien – uten å SNAPPE (mutere) koordinatene ved gap,
  // siden PCF-data er grunnsannheten og et gap her indikerer en feil i importen selv.
  if (components.length > 0 && components.every(c =>
    Number.isFinite(c.start_x) && Number.isFinite(c.start_y) && Number.isFinite(c.start_z) &&
    Number.isFinite(c.end_x) && Number.isFinite(c.end_y) && Number.isFinite(c.end_z)
  )) {
    const byId = new Map();
    components.forEach(c => { if (c.id !== undefined && c.id !== null) byId.set(String(c.id), c); });
    const isRootExplicit = (c) => {
      const parent = resolveParent(c.connects_from, byId);
      return !parent || parent === "START" || !byId.has(String(parent));
    };
    const rootCount = components.filter(isRootExplicit).length;
    if (rootCount > 1) topologyWarnings.push(`Fant ${rootCount} frittstående rørløp uten forbindelse til hverandre. Sjekk om det mangler en kobling.`);

    const continuityIssues = [];
    components.forEach((curr, i) => {
      if (curr.connects_from && curr.connects_from !== "START") {
        const parent = byId.get(String(resolveParent(curr.connects_from, byId)));
        if (parent) {
          const dx = curr.start_x - parent.end_x, dy = curr.start_y - parent.end_y, dz = curr.start_z - parent.end_z;
          const gap = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (gap > 5) {
            continuityIssues.push({ index: i, gap: Math.round(gap), currComp: parent.component || '?', nextComp: curr.component || '?', suggestion: "Importert PCF har hull mellom komponenter – sjekk BP1-kobling/filen." });
          }
        }
      }
    });

    return { components, topologyWarnings, continuityIssues, usedGraphSchema: true };
  }

  const hasGraphSchema = components.some(c => c.id !== undefined && c.id !== null && c.id !== "");
  if (!hasGraphSchema) {
    return { components: calculateAbsoluteCoordinatesLinear(components, originOffset), topologyWarnings, continuityIssues: [], usedGraphSchema: false };
  }

  const byId = new Map();
  components.forEach(c => { if (c.id !== undefined && c.id !== null) byId.set(String(c.id), c); });

  const isRoot = (c) => {
    const parent = resolveParent(c.connects_from, byId);
    return !parent || parent === "START" || !byId.has(String(parent));
  };
  const roots = components.filter(isRoot);

  if (roots.length > 1) topologyWarnings.push(`Fant ${roots.length} frittstående rørløp uten forbindelse til hverandre. Sjekk om det mangler en kobling.`);
  if (roots.length === 0 && components.length > 0) {
    return { components: calculateAbsoluteCoordinatesLinear(components, originOffset), topologyWarnings: ["Ingen gyldig startpunkt – fallback til lineær."], continuityIssues: [], usedGraphSchema: false };
  }

  const childrenOf = new Map();
  components.forEach(c => { if (!isRoot(c)) { const pk = String(resolveParent(c.connects_from, byId)); if (!childrenOf.has(pk)) childrenOf.set(pk, []); childrenOf.get(pk).push(c); } });

  const resolved = new Map(), visited = new Set();
  roots.forEach((root, chainIndex) => {
    // [FASE 2b-FIKS] 1a: offset er KUN et visuelt separasjonsmiddel for genuint
    // frittstående rørløp (flere ekte røtter) – ikke en geometrisk sannhet. Med
    // resolveParent() ovenfor rammer dette nå kun ekte røtter, ikke BRANCH:-
    // referanser til eksisterende id-er.
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
      // [FASE 2b-FIKS] 1a: samme BRANCH:-oppløsning som isRoot/childrenOf, ellers
      // ville grenkomponenter aldri fått en gyldig parent her og dermed heller
      // aldri blitt korrigert/kontinuitetssjekket mot sitt faktiske forbindelsespunkt.
      const parentId = resolveParent(curr.connects_from, byIdWithCoords);
      const parent = byIdWithCoords.get(String(parentId));
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
  // [FASE 2b.1-FIKS] 5: samme resolveParent som buildRouteFromGraph, slik at
  // Reducer-regelen også ser BRANCH:-barn (ellers ble grener aldri sjekket her).
  const byId = new Map();
  components.forEach(c => { if (c.id !== undefined && c.id !== null) byId.set(String(c.id), c); });
  const warnings = [], childrenOf = new Map();
  components.forEach(c => { if (c.connects_from && c.connects_from !== "START") { const k = String(resolveParent(c.connects_from, byId)); if (!childrenOf.has(k)) childrenOf.set(k, []); childrenOf.get(k).push(c); } });
  components.forEach((c, i) => {
    if (c.component === 'Bend' && c.direction) { const p = parseBendParts(c.direction); if (p && p[0] === p[1]) warnings.push(`Bend #${i + 1}: retning endrer seg ikke.`); }
    if (c.component === 'Reducer' && c.id !== undefined) { const kids = childrenOf.get(String(c.id)) || []; kids.forEach(n => { if (n && n.size_dn_nps && c.size_dn_nps && n.size_dn_nps === c.size_dn_nps) warnings.push(`Reducer #${i + 1}: samme DN før og etter.`); }); }
  });
  return warnings;
}

// FIX 4: Inkluder rørlengder i sjekklisten til AI-en
export function buildExpectedCountsChecklist(lomItems) {
  if (!lomItems || !lomItems.length) return "";
  const counts = {};
  const pipeLengths = [];

  lomItems.forEach(i => {
    const type = normalizeComponentName(i.component);
    if (type === 'Fastener') return;
    if (type === 'Pipe') {
      const len = Number(i.length_mm);
      if (len && len > 0) {
        pipeLengths.push({ size: i.size_dn_nps || i.size || '', length_mm: len });
      }
      return;
    }
    const key = `${type} ${i.size_dn_nps || ''}`.trim();
    counts[key] = (counts[key] || 0) + (Number(i.quantity) || 1);
  });

  const lines = [];
  if (pipeLengths.length > 0) {
    // [FASE 1-FIKS] P7: MTO-lengder er TOTALER per rad/rørløp, ikke segmentlengder.
    // Tidligere tekst ("BRUK DISSE") kunne tolkes av AI-en som segmentlengder.
    lines.push("TOTAL RØRLENGDE I MTO (kun referanse – IKKE segmentlengder):");
    pipeLengths.forEach(p => lines.push(`  Pipe ${p.size}: ${p.length_mm}mm`));
    lines.push("  → Disse totalene gjelder hele raden/rørløpet, ikke enkeltsegmenter.");
    lines.push("  → Lengden på HVERT segment skal ALLTID leses fra dimensjonslinjene på tegningen.");
  }
  const compLines = Object.entries(counts).map(([k, v]) => `  ${k}: ${v} stk`);
  if (compLines.length > 0) {
    lines.push("\nKOMPONENTER SOM SKAL FINNES:");
    lines.push(...compLines);
  }
  return lines.length > 0 ? `\n${lines.join("\n")}\n` : "";
}

// FIX 3: Sanitizer som flagger mistenkelige runda tall og kryssjekker MTO
export function sanitizeRouteGeometry(routeItems, lomItems = null) {
  if (!routeItems || routeItems.length === 0) return [];

  // [FASE 2a-FIKS] B1: canonicalSizeKey på MTO-siden, slik at _mtoSuggestion_mm også
  // fungerer på tvers av multi-size-formater (MTO "DN250" vs AI "DN250XDN80").
  const mtoPipeLengths = [];
  if (lomItems && Array.isArray(lomItems)) {
    lomItems.forEach(i => {
      if (normalizeComponentName(i.component) === 'Pipe' && Number(i.length_mm) > 0) {
        mtoPipeLengths.push({
          size: canonicalSizeKey(i.size_dn_nps || i.size),
          length_mm: Number(i.length_mm),
          used: false
        });
      }
    });
  }

  const SUSPICIOUS = new Set([100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000]);
  const sanitized = [];
  let prevValidDir = "E";

  routeItems.forEach((comp, index) => {
    let cleanComp = { ...comp };
    const type = normalizeComponentName(cleanComp.component || '');
    // [FASE 2b-FIKS] 1c: persister normalisert navn slik at PLACERS-oppslag
    // (geometryEngine) og senere forbrukere (stepExport/PCFEksport) ser ett
    // konsistent navn i stedet for den rå AI-strengen («ELBOW», «WOL», …).
    cleanComp.component = type;
    // [FASE 2b-FIKS] 1d: delt parsePrimaryDN i stedet for replace(/[^0-9]/g,''), som på
    // multi-size-strenger som "DN250xDN80" slo sammen sifrene til 25080 og ga en
    // fabrikkert lengde via estimateComponentLength sin nærmeste-DN-interpolasjon.
    const dn = parsePrimaryDN(cleanComp.size_dn_nps) || 100;
    const asmeLen = estimateComponentLength(type, dn);

    if (cleanComp.direction) {
      prevValidDir = cleanComp.direction;
    } else {
      cleanComp.direction = prevValidDir;
    }

    if (type === 'Pipe') {
      let aiLen = Number(cleanComp.length_mm) || 0;
      // [FASE 2a-FIKS] B1: canonicalSizeKey også på AI-siden ved MTO-oppslag.
      const compSize = canonicalSizeKey(cleanComp.size_dn_nps);

      if (aiLen < 10 || aiLen > 10000) {
        cleanComp.length_mm = null;
        cleanComp._needsLengthReview = true;
        cleanComp.confidence = Math.min(cleanComp.confidence || 1, 0.1);
      } else if (SUSPICIOUS.has(aiLen)) {
        const mtoMatch = mtoPipeLengths.find(l => l.size === compSize && !l.used);
        if (mtoMatch) {
          // [FASE 1-FIKS] P6: MTO-lengder er TOTALER per rad, ikke enkeltsegmenter.
          // Overskriving her ville mutert AI-observasjonen, brukt en radtotal som
          // segmentlengde, og gjort lengthScore sirkulær (MTO sammenlignet med MTO).
          // Flagg i stedet – ALDRI overskriv.
          mtoMatch.used = true;
          console.warn(`⚠️ Mistenkelig lengde ${aiLen}mm for ${cleanComp.size_dn_nps} – MTO-total for denne størrelsen er ${mtoMatch.length_mm}mm. Flagget for manuell gjennomgang.`);
          cleanComp._suspiciousLength = true;
          cleanComp._mtoSuggestion_mm = mtoMatch.length_mm;
          cleanComp._lengthSource = 'AI_vision';
          cleanComp.confidence = Math.min(cleanComp.confidence || 1, 0.3);
        } else {
          cleanComp._suspiciousLength = true;
          cleanComp.confidence = Math.min(cleanComp.confidence || 1, 0.3);
        }
      }
    } else {
      const aiLen = Number(cleanComp.length_mm);
      if (aiLen && aiLen > 0 && !SUSPICIOUS.has(aiLen)) {
        cleanComp._lengthSource = 'AI_vision';
      } else if (ASME_LENGTHS[type]) {
        cleanComp.length_mm = asmeLen;
        cleanComp._lengthSource = 'ASME_estimate';
      } else if (type === 'Bend') {
        // [FASE 2b.1-FIKS] 1: length_mm=null er KORREKT for Bend under
        // skjæringspunktkonvensjonen (placeBend forbruker null aksial lengde) – dette
        // er ikke en manglende måling som for markører, så egen kilde-etikett skiller dem.
        cleanComp.length_mm = null;
        cleanComp._lengthSource = 'bend_zero_length';
      } else {
        // [FASE 2b-FIKS] 1e: typer uten egen ASME-lengdetabell (Support, Instrument,
        // DeckPenetration m.fl. markørtyper) har ingen fysisk "lengde" å fabrikere –
        // estimateComponentLength sin 50mm-fallback ville vært et diktet tall.
        // length_mm=null + _lengthSource='marker' gjør at forbrukere (f.eks.
        // scoreEngine) aldri kan forveksle dette med en reell målt/estimert lengde.
        cleanComp.length_mm = null;
        cleanComp._lengthSource = 'marker';
      }
    }

    if (!cleanComp.id) cleanComp.id = String(index + 1);
    if (index === 0) {
      cleanComp.connects_from = "START";
    } else if (!cleanComp.connects_from || cleanComp.connects_from === "START") {
      cleanComp.connects_from = sanitized[index - 1]?.id || "START";
    }

    sanitized.push(cleanComp);
  });

  return sanitized;
}

// NY FUNKSJON: Validering av dimension_text
export function validateDimensionText(components) {
  return components.map(comp => {
    if (comp.dimension_text && comp.length_mm) {
      const parsed = parseInt(comp.dimension_text);
      if (!isNaN(parsed) && Math.abs(parsed - Number(comp.length_mm)) > 1) {
        console.warn(`⚠️ MISMATCH: dimension_text="${comp.dimension_text}" (${parsed}) ≠ length_mm=${comp.length_mm} på ${comp.component} ${comp.size_dn_nps}`);
        return {
          ...comp,
          length_mm: parsed, // Stol på det AI-en faktisk leste
          _dimensionMismatch: true,
          confidence: Math.min(comp.confidence || 1, 0.5)
        };
      }
    }
    return comp;
  });
}