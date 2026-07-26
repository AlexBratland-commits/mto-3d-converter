import { buildASMETable, buildExpectedCountsChecklist } from "./geometryEngine";

export const getSystemPrompt = () => {
  return `Du er en ren data-ekstraksjons-maskin for isometriske rørtegninger (ISO).
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
- Les av avstanden fra dimensjonslinjene på tegningen i mm og legg inn i "length_mm".

KRITISK FOR STØRRELSER (size_dn_nps):
- Les ALLTID hele størrelsen fra tegningen/MTO. 
- Hvis en ventil eller reduksjon har to dimensjoner (f.eks. DN50xDN25), MÅ du skrive "DN50xDN25". IKKE kutt den til kun "DN50".

KRITISK FOR AVGRENINGER:
- ISO-tegninger har ofte små avgreninger for ventilasjon, drenering eller instrumenter (f.eks. Temperature Element, Plug, Spectacle Blind).
- Selv om avgreningen er kort, MÅ den inkluderes.
- Følg linjen fra hovedrøret og ut. Hvis det er en Weldlet/Nipple som starter grenen, sett connects_from til hovedrørets ID.`;
};

export const getUserPrompt = (orientation, customStandards, ocrTexts, lomItems) => {
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
    ? `Bruk KUN dimensjoner som finnes i MTO-listen: [${detectedSizes}]. Husk å ta med hele størrelsen (f.eks. DN50xDN25).`
    : "Ingen MTO-liste er tilgjengelig for kryssjekk denne gangen – les dimensjonen direkte fra tegningens dimensjonslinjer/merkinger, uten å begrense deg til noen forhåndsdefinert liste.";

  return `Følg HELE rørtraséen på denne ISO-tegningen fra start til slutt. 

VIKTIG: Inkluder ALLE komponenter: rør, bend, flenser, ventiler, weldlets, reduksjoner, T-rør, drip rings, blindflenser, plugger, instrumenter og avgreninger.

For hvert segment, returner:
- id: unik id (f.eks. "1", "2", "3"...).
- connects_from: id-en til forrige komponent, eller "START".
- component: "Pipe", "Bend", "Flange", "Valve", "Weldlet", "Reducer", "Tee", "Drip Ring", "Spectacle Blind", "Nipple", "Plug", "Temperature Element", "Pipe Support", "Deck Penetration".
- size_dn_nps: ${sizeInstruction}
- direction: "N"/"NE"/"E"/"SE"/"S"/"SW"/"W"/"NW"/"UP"/"DOWN". For bend: "N-to-E" etc.
- length_mm: KUN for Pipe – les fra dimensjonslinjen i mm.
- insulation_thickness_mm: 0 eller les fra notat.
- schedule: les fra MTO/notat eller "40" som standard.
- confidence: 0.0-1.0.
- source: "dimension_line", "material_table", "inferred", eller "field_marking".

IKKE begrens deg til hovedrøret! Gå systematisk gjennom hele tegningen. Bruk MTO-sjekklisten under som kontrolliste: hvis en komponent står i MTO og er synlig på tegningen, SKAL den være med i JSON!

VIKTIG ORIENTERINGS-REGLER:
 ${orientationInfo[orientation] || orientationInfo.elevation}

 ${buildASMETable()}
 ${customStandards ? `\nEGENDERFINERTE STANDARDER OG SPESIFIKASJONER:\n${customStandards}\n` : ""}
 ${ocrTexts && ocrTexts.length > 0 ? `OCR-tekst (bruk dette som FASIT for tall, bokstaver og linjenumre der det er lesbart – bruk BILDET for geometri, plassering og retning):\n` + ocrTexts.map(ot => ot.text).join("\n") : ""}
 ${buildExpectedCountsChecklist(lomItems)}

Returner et JSON-objekt på formen {"components": [...]}. DU SKAL IKKE REGNE UT ABSOLUTTE KOORDINATER – kun relative retninger og lengder.`;
};

export const getLomPrompt = (customStandards, ocrTexts) => {
  return `Les "List of Materials" / MTO-tabellen fra denne ISO-tegningen.

VIKTIG: Finn også referansepunktet (Tie-in Point / Origin Coordinate) fra tegningshodet.
Returner dette som et eget felt "reference_point":
"reference_point": { "point_name": "F11", "east_X": 360142, "north_Y": 171879, "elevation_Z": 530337 }

Returner et JSON-objekt:
{
  "reference_point": { "point_name": "F11", "east_X": 360142, "north_Y": 171879, "elevation_Z": 530337 },
  "mto_items": [
     { "item_no": "1", "quantity": 4, "component": "PIPE", "size_dn_nps": "DN250", "schedule": "40S", "material": "A106-B" }
  ]
}

KRITISK FOR "quantity": Du MÅ lese tallet som står i "QTY" eller "QUANT"-kolonnen i tabellen på bildet. 
- Hvis tabellen viser 4 for en komponent, MÅ du sette "quantity": 4.
- Hvis tabellen viser 16, setter du "quantity": 16.
- Bruk KUN "quantity": 1 hvis tabellen faktisk viser 1, eller hvis kolonnen mangler helt.
- IKKE kopier eksempelet over (hvor det står 4), men bruk de faktiske tallene fra bildet/OCR-teksten!

KRITISK FOR "size_dn_nps": Behold hele størrelsen (f.eks. "DN50xDN25" hvis det står det).

 ${customStandards ? `\nEGENDERFINERTE STANDARDER OG SPESIFIKASJONER:\n${customStandards}\n` : ""}${ocrTexts.length > 0 ? "OCR-tekst:\n" + ocrTexts.map(ot => ot.text).join("\n") : ""}`;
};