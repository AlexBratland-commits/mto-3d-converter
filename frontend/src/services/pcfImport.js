import { parsePrimaryDN } from "./parseUtils";
import { ASME_OD, estimateComponentLength } from "./geometryEngine";

/* ================================================================
   [FASE 2c] PCF-import (ISOGEN) — 100% deterministisk, null AI-kall.

   KOORDINAT-KONVENSJON (beslutning A, samme som Fase 2b): PCF-koordinater er
   ekte komponent-endepunkter, men /BEND-linjer beskriver rørets tangentpunkter
   (inn/ut), ikke skjæringspunktet motoren bruker internt. Vi konverterer HVER
   bend til skjæringspunktkonvensjon (start == end == hjørnepunkt) i stedet for
   å beholde korden, for konsistens med placeBend/geometryEngine (Fase 2b).
   Hjørnet velges som FØRSTE punkt på /BEND-linjen: for fixture-data der begge
   punktene er identiske er dette eksakt riktig; for ekte ISOGEN-filer (der
   punktene kan avvike, siden de er reelle tangentpunkter) er dette en kjent,
   uverifisert tilnærming – se advarselen i buildComponentFromBlock.
   ================================================================ */

export const MAX_PCF_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const COMPONENT_KEYS = {
  "/PI": "Pipe",
  "/STRAIGHT": "Pipe",
  "/BEND": "Bend",
  "/FLANGE": "Flange",
  "/REDUCER": "Reducer",
  "/TEE": "Tee",
  "/OT": "Weldlet",
  "/OLET": "Weldlet",
  "/VALVE": "Valve",
  "/SV": "Valve",
  "/GV": "Valve",
};

// Attributt-linjer som hører til forrige komponent-linje. /BW (bend-radius) og
// /MAT/SI1/SI2/SIZE2/SIZE3/SIZE4 leses inn (unngår "ukjent nøkkel"-varsel) men
// brukes ikke til geometri her – kun /SIZE1, /LENGTH og /TYPE konsumeres.
const ATTRIBUTE_KEYS = new Set(["MAT", "SIZE1", "SIZE2", "SIZE3", "SIZE4", "SI1", "SI2", "LENGTH", "BW", "TYPE"]);

// Strukturelle header-/metadata-nøkler uten geometrisk betydning – ignoreres
// stille (ikke "ukjent nøkkel", de er gyldige ISOGEN-nøkler, bare ikke geometri).
const IGNORED_STRUCTURAL_KEYS = new Set(["/PRJ", "/ISOGEN-AT-VERSION", "/UNITS-MM", "/BOR"]);

const COORD_EPSILON_MM = 1.0;

function odToNominalDN(diameterMm) {
  if (!Number.isFinite(diameterMm)) return null;
  let bestDn = null, bestDiff = Infinity;
  Object.entries(ASME_OD).forEach(([dn, od]) => {
    const diff = Math.abs(od - diameterMm);
    if (diff < bestDiff) { bestDiff = diff; bestDn = Number(dn); }
  });
  return bestDn;
}

function resolvePrimaryDN(sizeRaw, fallbackDn) {
  if (sizeRaw === undefined) return fallbackDn;
  const num = parsePrimaryDN(sizeRaw);
  if (num === null) return fallbackDn;
  return odToNominalDN(num);
}

function euclidean(x1, y1, z1, x2, y2, z2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
}

function findEndpointMatch(components, point) {
  return components.find((c) =>
    Math.abs(c.end_x - point.x) <= COORD_EPSILON_MM &&
    Math.abs(c.end_y - point.y) <= COORD_EPSILON_MM &&
    Math.abs(c.end_z - point.z) <= COORD_EPSILON_MM
  ) || null;
}

function buildComponentFromBlock(block, fallbackDn, warnings) {
  const type = COMPONENT_KEYS[block.key];
  const [x1, y1, z1, x2, y2, z2] = block.coords;
  if (![x1, y1, z1, x2, y2, z2].every(Number.isFinite)) {
    warnings.push(`${block.key}: ugyldige koordinater – hoppet over.`);
    return null;
  }

  const nominalDn = resolvePrimaryDN(block.attrs.SIZE1, fallbackDn);
  const comp = {
    component: type,
    size_dn_nps: nominalDn !== null ? `DN${nominalDn}` : "",
    _lengthSource: "pcf",
  };
  if (block.attrs.TYPE) comp.sub_type = block.attrs.TYPE;

  if (type === "Bend") {
    // Skjæringspunktkonvensjon: hjørnet = FØRSTE punkt på /BEND-linjen.
    comp.start_x = x1; comp.start_y = y1; comp.start_z = z1;
    comp.end_x = x1; comp.end_y = y1; comp.end_z = z1;
    comp.length_mm = null;
    comp._lengthSource = "bend_zero_length";
    if (euclidean(x1, y1, z1, x2, y2, z2) >= COORD_EPSILON_MM) {
      warnings.push(`${block.key} ved (${x1},${y1},${z1}): bend-tangent-konvensjon uverifisert – kalibreres mot ekte fil.`);
    }
    return comp;
  }

  comp.start_x = x1; comp.start_y = y1; comp.start_z = z1;
  comp.end_x = x2; comp.end_y = y2; comp.end_z = z2;
  const dist = euclidean(x1, y1, z1, x2, y2, z2);

  if (type === "Reducer") {
    const explicitLen = Number(block.attrs.LENGTH);
    comp.length_mm = Number.isFinite(explicitLen) && explicitLen > 0
      ? explicitLen
      : estimateComponentLength("Reducer", nominalDn || 100);
    return comp;
  }

  if (type === "Weldlet" && dist < COORD_EPSILON_MM) {
    // Zero-length OT (kollapset start/end) → markør-atferd, ingen fabrikkert lengde.
    comp.length_mm = null;
    comp._lengthSource = "marker";
    return comp;
  }

  comp.length_mm = dist;
  return comp;
}

/**
 * Parser rå ISOGEN PCF-tekst til interne komponentobjekter (samme schema som
 * extractRoute produserer: id, component, size_dn_nps, start/end-koordinater,
 * length_mm). Rent tekst-parsing – ingen evaluering av filinnhold.
 */
export function parsePCF(text) {
  if (!text || !text.trim()) {
    throw new Error("Tom PCF-fil.");
  }

  const warnings = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const allComponents = [];
  const pipelineInfo = {};
  let pipelineIndex = -1;
  let fallbackDn = null;
  let pendingBP1 = null;
  let currentBlock = null;
  let prevIdInPipeline = null;
  let isFirstElementOfPipeline = true;

  const finalizeBlock = () => {
    if (!currentBlock) return;
    const built = buildComponentFromBlock(currentBlock, fallbackDn, warnings);
    currentBlock = null;
    if (!built) return;

    const id = String(allComponents.length + 1);
    built.id = id;

    if (isFirstElementOfPipeline) {
      isFirstElementOfPipeline = false;
      if (pipelineIndex === 0) {
        built.connects_from = "START";
      } else if (pendingBP1) {
        const parent = findEndpointMatch(allComponents, pendingBP1);
        if (parent) {
          built.connects_from = `BRANCH:${parent.id}`;
        } else {
          // [FASE 2c-FIKS] Tillegg: ingen match på /BP1 → eget rørløp (rot) + warning.
          // "ORPHAN" (ikke "START"/falsy) slik at sanitizeRouteGeometry sin
          // connects_from-fallback (kjeder løse rader på forrige rad) ikke kjeder
          // denne feilaktig til forrige pipelines siste komponent.
          built.connects_from = "ORPHAN";
          warnings.push(`/BP1 (${pendingBP1.x},${pendingBP1.y},${pendingBP1.z}) matcher ingen eksisterende endepunkt – behandlet som eget rørløp.`);
        }
      } else {
        built.connects_from = "ORPHAN";
      }
    } else {
      built.connects_from = prevIdInPipeline;
    }
    prevIdInPipeline = id;
    allComponents.push(built);
  };

  lines.forEach((line) => {
    const spaceIdx = line.indexOf(" ");
    const key = (spaceIdx === -1 ? line : line.slice(0, spaceIdx)).toUpperCase();
    const rest = spaceIdx === -1 ? "" : line.slice(spaceIdx + 1).trim();

    if (key === "/PIPELINE") {
      finalizeBlock();
      pipelineIndex++;
      isFirstElementOfPipeline = true;
      prevIdInPipeline = null;
      pendingBP1 = null;
      const parts = rest.split(",").map((s) => s.trim());
      const diameter = Number(parts[2]);
      pipelineInfo[pipelineIndex] = { name: parts[0] || `PL${pipelineIndex + 1}`, spec: parts[1] || "", diameter: Number.isFinite(diameter) ? diameter : null, wall: Number(parts[3]) || null };
      fallbackDn = Number.isFinite(diameter) ? odToNominalDN(diameter) : null;
      return;
    }
    if (key === "/BP1") {
      const nums = rest.split(",").map(Number);
      if (nums.length >= 3 && nums.slice(0, 3).every(Number.isFinite)) {
        pendingBP1 = { x: nums[0], y: nums[1], z: nums[2] };
      }
      return;
    }
    if (IGNORED_STRUCTURAL_KEYS.has(key)) return;
    if (key === "/INSUL") {
      warnings.push(`Hoppet over ${key} – isolasjonskomponenter/attributter representerer ikke rørgeometri.`);
      return;
    }
    if (COMPONENT_KEYS[key]) {
      finalizeBlock();
      currentBlock = { key, coords: rest.split(",").map(Number), attrs: {} };
      return;
    }
    if (ATTRIBUTE_KEYS.has(key.slice(1))) {
      if (currentBlock) currentBlock.attrs[key.slice(1)] = rest;
      return;
    }

    warnings.push(`Ukjent PCF-nøkkel "${key}" – hoppet over.`);
  });

  finalizeBlock();

  return { components: allComponents, pipelineInfo, warnings };
}

/**
 * Bekvemmelighetsomslag som leser en File, håndhever 10 MB-grensen, og parser.
 */
export async function parsePCFFile(file) {
  if (file.size > MAX_PCF_FILE_SIZE_BYTES) {
    throw new Error(`PCF-filen er for stor (${(file.size / (1024 * 1024)).toFixed(1)} MB) – maks ${MAX_PCF_FILE_SIZE_BYTES / (1024 * 1024)} MB.`);
  }
  const text = await file.text();
  return parsePCF(text);
}
