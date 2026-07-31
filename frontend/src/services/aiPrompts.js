import { buildExpectedCountsChecklist } from "./geometryEngine";

export const getSystemPrompt = () => {
  return `Du er en ekstremt presis visuell data-ekstraksjonsmaskin for isometriske rørtegninger (ISO).
Returner KUN gyldig JSON: {"components": [...]}
Hvis ingen data: {"components": []}

═══ 3 ABSOLUTTE REGLER (ALDRI BRYT) ═══
1. X-FAKTOREN ER HELLIG: "6x4", "2x1.1/2", "DN50xDN25" → BEHOLD HELE STRENGEN.
2. ISOMETRISK: 30° diagonal = HORISONTAL (N/S/E/W). KUN sann vertikal linje = Z (UP/DOWN).
3. ALDRI gjett lengder. ALDRI bruk 1000, 500, eller 2000 som placeholder.

═══ OUTPUT-FELT ═══
{
  "id": "1",
  "connects_from": "START | <forrige id> | BRANCH:<parent_id>",
  "component": "Pipe | Elbow | Tee | Reducer | Olet | Flange | Valve | PSV | Support | DeckPenetration | Instrument",
  "size_dn_nps": "<FULL størrelse med x>",
  "direction": "N|S|E|W|UP|DOWN|E-to-N|N-to-UP",
  "length_mm": <tall eller null>,
  "dimension_text": "<eksakt tall du leste fra dimensjonslinjen, f.eks '707' eller null>",
  "confidence": 0.0-1.0,
  "source": "dimension_line|MTO_table|symbol"
}

═══ LENGDER – KRITISK PROSEDYRE ═══
For HVER Pipe:
1. Finn dimensjonslinjen (tynn linje med pilspisser).
2. Les tallet NØYAKTIG slik det står på bildet.
3. Skriv tallet i "dimension_text".
4. Konverter til heltall i "length_mm".
5. Hvis du ikke kan lese tallet, sett BOTH "length_mm": null og "dimension_text": null. IKKE FINN PÅ ET TALL.

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

  return `Analyser denne ISO-tegningen. Følg denne prosedyren NØYAKTIG:

STEG 1: Les title block.
STEG 2: Spor hovedrøret fra START til slutt. For HVER Pipe, MÅ du lese dimensjonslinjen og fylle ut "dimension_text" og "length_mm".
STEG 3: Gå tilbake og finn ALLE synlige avgreninger.
STEG 4: Finn ALLE supports og Deck Penetrations.
STEG 5: Kryssjekk lengdene mot MTO-lengdene nedenfor.

DATAHIERARKI (høyeste til laveste tillit):
1. Det du SER på bildet (pikslene)
2. MTO-tabellen (fasit)
3. OCR-teksten (kan inneholde feil – bruk KUN som støtte)
4. Aldri gjetning

ORIENTERING: ${orientationInfo[orientation] || orientationInfo.elevation}
 ${detectedSizes ? `FORVENTEDE STØRRELSER: [${detectedSizes}]\n` : ""}
 ${customStandards ? `PROSJEKTREGLER:\n${customStandards}\n` : ""}
 ${ocrTexts && ocrTexts.length > 0 ? `OCR-REFERANSE (bruk som hjelp, men prioritér visuell lesing av dimensjonslinjer):\n${ocrTexts.map(ot => ot.text).join("\n")}\n` : ""}
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