import { buildExpectedCountsChecklist } from "./geometryEngine";

export const getSystemPrompt = () => {
  return `Du er en presis data-ekstraksjonsmaskin for isometriske rørtegninger (ISO) for olje/gass.
Returner KUN gyldig JSON: {"components": [...]}
Hvis ingen data: {"components": []}

═══ 3 ABSOLUTTE REGLER (ALDRI BRYT) ═══
1. X-FAKTOREN ER HELLIG: "6x4", "2x1.1/2", "8x2", "6x3/4", "DN50xDN25" → BEHOLD HELE STRENGEN. Aldri kutt.
2. ISOMETRISK: 30° diagonal = HORISONTAL (N/S/E/W). KUN sann vertikal linje = Z (UP/DOWN). "FALL 0.57" er gradient, IKKE høydesteg.
3. INGEN OVERSUELG: Inkluder ALLE avgreninger, olets, instrumenter (0.50", 0.75", 1"), supports, Deck Penetrations, Welded Shoes, Reinforcing Pads, Bracing.

═══ KOMPONENTTYPER (bruk eksakt disse) ═══
Pipe | Elbow | Tee | Reducer | Olet | Flange | Valve | PSV | BleedPlug | DripRing | Instrument | Support | ReinforcingPad | WeldedShoe | DeckPenetration | Nipple | Cap | Plug

═══ OUTPUT-FELT ═══
{
  "id": "1",
  "connects_from": "START | <forrige id> | BRANCH:<parent_id>",
  "component": "<type fra listen over>",
  "size_dn_nps": "<FULL størrelse med x>",
  "direction": "N|S|E|W|UP|DOWN|E-to-N|N-to-UP",
  "length_mm": <tall eller null>,
  "schedule": "<f.eks. 40, 80S, STD>",
  "confidence": 0.0-1.0,
  "source": "dimension_line|MTO_table|symbol|annotation"
}

═══ 5 FORBUD ═══
❌ Aldri kutt x-dimensjoner ("6x4" → "6" er FORBUDT)
❌ Aldri bland Prefab og Erection
❌ Aldri tolk 30° diagonal som høydeendring
❌ Aldri forveksl Deck Penetration med Pipe Support
❌ Aldri hopp over små avgreninger (< 2")

Du er ikke en forklarings-AI. Returner kun JSON.`;
};

export const getUserPrompt = (orientation, customStandards, ocrTexts, lomItems) => {
  const detectedSizes = lomItems && lomItems.length > 0
    ? Array.from(new Set(lomItems.map(i => i.size || i.size_dn_nps).filter(Boolean))).join(", ")
    : null;

  const orientationInfo = {
    elevation: "Opp på papiret = Høyde (Z+).",
    north: "Opp = Nord (Y+).",
    east: "Opp = Øst (X+)."
  };

  return `Analyser denne ISO-tegningen. Følg denne prosedyren:

STEG 1: Les title block (Line Number, Material class).
STEG 2: Spor hovedrøret fra START/CONT'D FROM til C.O.I./slutt.
STEG 3: Gå tilbake og finn ALLE avgreninger (olets, tees, instrument-taps).
STEG 4: Finn ALLE supports (Welded Shoe, Reinforcing Pad, Bracing, DP).
STEG 5: Kryssjekk mot MTO nedenfor.

ORIENTERING: ${orientationInfo[orientation] || orientationInfo.elevation}
 ${detectedSizes ? `FORVENTEDE STØRRELSER (fra MTO): [${detectedSizes}] – bruk KUN disse.\n` : ""}
 ${customStandards ? `PROSJEKTREGLER:\n${customStandards}\n` : ""}
 ${ocrTexts && ocrTexts.length > 0 ? `OCR-REFERANSE:\n${ocrTexts.map(ot => ot.text).join("\n")}\n` : ""}
 ${buildExpectedCountsChecklist(lomItems)}

Returner KUN JSON: {"components": [...]}`;
};

export const getLomPrompt = (customStandards, ocrTexts) => {
  return `Les "List of Materials" / MTO-tabellen fra denne ISO-tegningen.

VIKTIG: Finn referansepunktet (Tie-in Point) og returner det som "reference_point".
Returner et JSON-objekt:
{
  "reference_point": { "point_name": "F11", "east_X": 360142, "north_Y": 171879, "elevation_Z": 530337 },
  "mto_items": [ { "item_no": "1", "quantity": 4, "component": "PIPE", "size_dn_nps": "DN250", "schedule": "40S" } ]
}

KRITISK FOR "quantity": Les tallet i "QTY"-kolonnen. Ikke kopier eksempelet over.
KRITISK FOR "size_dn_nps": Behold hele størrelsen (f.eks. "DN50xDN25" eller "8x4\"ND").

 ${customStandards ? `PROSJEKTSTANDARDER:\n${customStandards}\n` : ""}
 ${ocrTexts && ocrTexts.length > 0 ? `OCR-TEKST:\n${ocrTexts.map(ot => ot.text).join("\n")}` : ""}`;
};

export const getTargetedRescanPrompt = (missingItems) => {
  const missingList = missingItems.map(m => `- ${m.quantity}x ${m.component} (Størrelse: ${m.size})`).join('\n');

  return `Se på dette bildet av en ISO-tegning. Jeg mangler følgende komponenter i min 3D-modell. 

FINN KUN DISSE KOMPONENTENE:
 ${missingList}

Regler:
- Følg linjen fra hovedrøret og ut for å finne avgreningene.
- Hvis det er en Valve eller Nipple, finn retningen (N, S, E, W, UP, DOWN) og dens plassering.
- Returner KUN gyldig JSON på formen: {"components": [...]} med feltene: id, connects_from, component, size_dn_nps, direction, length_mm.
- Hvis du absolutt ikke finner dem, returner {"components": []}.`;
};