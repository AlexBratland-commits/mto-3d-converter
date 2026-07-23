/**
 * Trygt parser JSON fra AI-responser, selvom AI-en legger til 
 * introduksjonstekst, markdown eller har manglende klammer.
 */
export function safeParseJSON(str) {
  if (!str) return null;

  try {
    let cleaned = str.trim();

    // 1. Hvis AI-en brukte ```json ... ```, hent ut det som er inni blokken
    const markdownMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (markdownMatch && markdownMatch[1]) {
      cleaned = markdownMatch[1].trim();
    }

    // 2. ISOLER KUN JSON-ARRAYET: Finn første '[' og siste ']' og kast alt annet
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');

    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      cleaned = cleaned.substring(firstBracket, lastBracket + 1);
    } else {
      // Hvis det er et enkelt objekt { ... } i stedet for et array
      const firstCurly = cleaned.indexOf('{');
      const lastCurly = cleaned.lastIndexOf('}');
      if (firstCurly !== -1 && lastCurly !== -1 && lastCurly > firstCurly) {
        cleaned = cleaned.substring(firstCurly, lastCurly + 1);
      }
    }

    // 3. Håndter linje-separerte objekter hvis AI-en glemte komma mellom objektene
    if (/}\s*{/.test(cleaned)) {
      let wrapped = cleaned.replace(/}\s*{/g, '},{');
      if (!wrapped.startsWith('[')) wrapped = '[' + wrapped;
      if (!wrapped.endsWith(']')) wrapped = wrapped + ']';
      return JSON.parse(wrapped);
    }

    // 4. Standard parsing av den uthentede JSON-strengen
    return JSON.parse(cleaned);

  } catch (e) {
    console.warn("Standard parsing feilet. Forsøker nød-reparasjon på uthentet utsnitt...", e);

    try {
      // 5. Nød-reparasjon hvis teksten ble avkuttet (trunkert) midt i responset
      let repaired = str.trim();
      
      const firstBracket = repaired.indexOf('[');
      if (firstBracket !== -1) {
        repaired = repaired.substring(firstBracket);
      }

      const lastCloseBrace = repaired.lastIndexOf('}');
      if (lastCloseBrace !== -1) {
        repaired = repaired.substring(0, lastCloseBrace + 1);
      }

      if (/}\s*{/.test(repaired)) {
        repaired = repaired.replace(/}\s*{/g, '},{');
      }

      if (!repaired.startsWith('[')) repaired = '[' + repaired;
      if (!repaired.endsWith(']')) repaired = repaired + ']';

      return JSON.parse(repaired);
    } catch (err2) {
      console.error("Nød-reparasjon mislyktes. Rådata fra AI var:", str);
      return null;
    }
  }
}

/**
 * Vasker typiske OCR- og skriftfeil på håndskrevne/gamle ISO-tegninger
 */
export function sanitizeMTOData(items) {
  if (!items) return items;

  const isArray = Array.isArray(items);
  const dataList = isArray ? items : [items];

  const cleanedList = dataList.map((item) => {
    if (!item || typeof item !== 'object') return item;

    const sizeKey =
      Object.keys(item).find(
        (k) => k.toLowerCase() === 'size' || k.toLowerCase() === 'size_dn_nps'
      ) || 'size';

    const schedKey =
      Object.keys(item).find(
        (k) => k.toLowerCase() === 'schedule' || k.toLowerCase() === 'sch'
      ) || 'schedule';

    let size = String(item[sizeKey] || '');
    let schedule = String(item[schedKey] || '');

    size = size
      .replace(/DN380/gi, 'DN80')
      .replace(/DN320/gi, 'DN20')
      .replace(/DN30\b/gi, 'DN80');

    schedule = schedule.replace(/BOS/gi, '80S');

    return {
      ...item,
      [sizeKey]: size,
      [schedKey]: schedule,
    };
  });

  return isArray ? cleanedList : cleanedList[0];
}

/* ================================================================
   NYTT: Rørdata og oppslagslogikk (ASME B36.10)
   ================================================================ */

export const PIPE_STANDARDS = [
  { nps: '1/8"', dn: '6', od_mm: 10.3, od_inch: 0.405, wall_t_mm: 1.73, wall_t_inch: 0.068, id_mm: 6.84, id_inch: 0.269, vekt_kg_m: 0.37 },
  { nps: '1/4"', dn: '8', od_mm: 13.7, od_inch: 0.540, wall_t_mm: 2.24, wall_t_inch: 0.088, id_mm: 9.22, id_inch: 0.363, vekt_kg_m: 0.63 },
  { nps: '3/8"', dn: '10', od_mm: 17.1, od_inch: 0.675, wall_t_mm: 2.31, wall_t_inch: 0.091, id_mm: 12.48, id_inch: 0.491, vekt_kg_m: 0.84 },
  { nps: '1/2"', dn: '15', od_mm: 21.3, od_inch: 0.840, wall_t_mm: 2.77, wall_t_inch: 0.109, id_mm: 15.76, id_inch: 0.620, vekt_kg_m: 1.27 },
  { nps: '3/4"', dn: '20', od_mm: 26.7, od_inch: 1.050, wall_t_mm: 2.87, wall_t_inch: 0.113, id_mm: 20.96, id_inch: 0.825, vekt_kg_m: 1.69 },
  { nps: '1"', dn: '25', od_mm: 33.4, od_inch: 1.315, wall_t_mm: 3.38, wall_t_inch: 0.133, id_mm: 26.64, id_inch: 1.049, vekt_kg_m: 2.50 },
  { nps: '1-1/4"', dn: '32', od_mm: 42.2, od_inch: 1.660, wall_t_mm: 3.56, wall_t_inch: 0.140, id_mm: 35.08, id_inch: 1.381, vekt_kg_m: 3.39 },
  { nps: '1-1/2"', dn: '40', od_mm: 48.3, od_inch: 1.900, wall_t_mm: 3.68, wall_t_inch: 0.145, id_mm: 40.94, id_inch: 1.612, vekt_kg_m: 4.05 },
  { nps: '2"', dn: '50', od_mm: 60.3, od_inch: 2.375, wall_t_mm: 3.91, wall_t_inch: 0.154, id_mm: 52.48, id_inch: 2.066, vekt_kg_m: 5.44 },
  { nps: '2-1/2"', dn: '65', od_mm: 73.0, od_inch: 2.875, wall_t_mm: 5.16, wall_t_inch: 0.203, id_mm: 62.68, id_inch: 2.468, vekt_kg_m: 8.63 },
  { nps: '3"', dn: '80', od_mm: 88.9, od_inch: 3.500, wall_t_mm: 5.49, wall_t_inch: 0.216, id_mm: 77.92, id_inch: 3.068, vekt_kg_m: 11.29 },
  { nps: '3-1/2"', dn: '90', od_mm: 101.6, od_inch: 4.000, wall_t_mm: 5.74, wall_t_inch: 0.226, id_mm: 90.12, id_inch: 3.548, vekt_kg_m: 13.57 },
  { nps: '4"', dn: '100', od_mm: 114.3, od_inch: 4.500, wall_t_mm: 6.02, wall_t_inch: 0.237, id_mm: 102.26, id_inch: 4.026, vekt_kg_m: 16.07 },
  { nps: '5"', dn: '125', od_mm: 141.3, od_inch: 5.563, wall_t_mm: 6.55, wall_t_inch: 0.258, id_mm: 128.20, id_inch: 5.047, vekt_kg_m: 21.77 },
  { nps: '6"', dn: '150', od_mm: 168.3, od_inch: 6.625, wall_t_mm: 7.11, wall_t_inch: 0.280, id_mm: 154.08, id_inch: 6.066, vekt_kg_m: 28.26 },
  { nps: '8"', dn: '200', od_mm: 219.1, od_inch: 8.625, wall_t_mm: 8.18, wall_t_inch: 0.322, id_mm: 202.74, id_inch: 7.982, vekt_kg_m: 42.55 },
  { nps: '10"', dn: '250', od_mm: 273.0, od_inch: 10.750, wall_t_mm: 9.27, wall_t_inch: 0.365, id_mm: 254.46, id_inch: 10.018, vekt_kg_m: 60.29 },
  { nps: '12"', dn: '300', od_mm: 323.8, od_inch: 12.750, wall_t_mm: 10.31, wall_t_inch: 0.406, id_mm: 303.18, id_inch: 11.936, vekt_kg_m: 79.70 },
  { nps: '14"', dn: '350', od_mm: 355.6, od_inch: 14.000, wall_t_mm: 11.13, wall_t_inch: 0.438, id_mm: 333.34, id_inch: 13.124, vekt_kg_m: 94.55 },
  { nps: '16"', dn: '400', od_mm: 406.4, od_inch: 16.000, wall_t_mm: 12.70, wall_t_inch: 0.500, id_mm: 381.00, id_inch: 15.000, vekt_kg_m: 123.30 },
  { nps: '18"', dn: '450', od_mm: 457.2, od_inch: 18.000, wall_t_mm: 14.27, wall_t_inch: 0.562, id_mm: 428.66, id_inch: 16.876, vekt_kg_m: 155.87 },
  { nps: '20"', dn: '500', od_mm: 508.0, od_inch: 20.000, wall_t_mm: 15.09, wall_t_inch: 0.594, id_mm: 477.82, id_inch: 18.812, vekt_kg_m: 183.42 },
  { nps: '22"', dn: '550', od_mm: 559.0, od_inch: 22.000, wall_t_mm: 9.53, wall_t_inch: 0.375, id_mm: 539.94, id_inch: 21.257, vekt_kg_m: 129.13 },
  { nps: '24"', dn: '600', od_mm: 610.0, od_inch: 24.000, wall_t_mm: 17.48, wall_t_inch: 0.688, id_mm: 575.04, id_inch: 22.639, vekt_kg_m: 255.41 },
  { nps: '26"', dn: '650', od_mm: 660.0, od_inch: 26.000, wall_t_mm: 9.53, wall_t_inch: 0.375, id_mm: 640.94, id_inch: 25.234, vekt_kg_m: 152.87 },
  { nps: '28"', dn: '700', od_mm: 711.0, od_inch: 28.000, wall_t_mm: 9.53, wall_t_inch: 0.375, id_mm: 691.94, id_inch: 27.242, vekt_kg_m: 164.85 },
  { nps: '30"', dn: '750', od_mm: 762.0, od_inch: 30.000, wall_t_mm: 9.53, wall_t_inch: 0.375, id_mm: 742.94, id_inch: 29.250, vekt_kg_m: 176.84 },
  { nps: '32"', dn: '800', od_mm: 813.0, od_inch: 32.000, wall_t_mm: 9.53, wall_t_inch: 0.375, id_mm: 793.94, id_inch: 31.257, vekt_kg_m: 188.82 },
  { nps: '34"', dn: '850', od_mm: 864.0, od_inch: 34.000, wall_t_mm: 9.53, wall_t_inch: 0.375, id_mm: 844.94, id_inch: 33.265, vekt_kg_m: 200.81 },
  { nps: '36"', dn: '900', od_mm: 914.0, od_inch: 36.000, wall_t_mm: 19.05, wall_t_inch: 0.750, id_mm: 875.90, id_inch: 34.484, vekt_kg_m: 420.42 },
  { nps: '40"', dn: '1000', od_mm: 1016.0, od_inch: 40.000, wall_t_mm: 9.53, wall_t_inch: 0.375, id_mm: 996.94, id_inch: 39.250, vekt_kg_m: 236.53 },
  { nps: '42"', dn: '1050', od_mm: 1067.0, od_inch: 42.000, wall_t_mm: 9.53, wall_t_inch: 0.375, id_mm: 1047.94, id_inch: 41.257, vekt_kg_m: 248.52 },
  { nps: '44"', dn: '1100', od_mm: 1118.0, od_inch: 44.000, wall_t_mm: 9.53, wall_t_inch: 0.375, id_mm: 1098.94, id_inch: 43.265, vekt_kg_m: 260.50 },
  { nps: '48"', dn: '1200', od_mm: 1219.0, od_inch: 48.000, wall_t_mm: 9.53, wall_t_inch: 0.375, id_mm: 1199.94, id_inch: 47.242, vekt_kg_m: 284.24 }
];

/**
 * Finner rørdata basert på en størrelsesstreng (f.eks. "DN150" eller '6"')
 */
export function getPipeDimensions(sizeStr) {
  if (!sizeStr) return null;
  const str = String(sizeStr).toUpperCase().trim();

  // Prøv å matche DN (f.eks. "DN150" eller "150")
  const dnMatch = str.match(/DN\s*(\d+)/);
  if (dnMatch) {
    const match = PIPE_STANDARDS.find(p => p.dn === dnMatch[1]);
    if (match) return match;
  }

  // Prøv å matche NPS (f.eks. '6"', '6"', '1-1/2"')
  const npsMatch = str.match(/(\d+(?:-\d+)?\/\d+)"/);
  if (npsMatch) {
    const match = PIPE_STANDARDS.find(p => p.nps === npsMatch[1] + '"');
    if (match) return match;
  }

  // Fallback: Sjekk om bare tallet er der (antar DN)
  const numMatch = str.match(/^(\d+)$/);
  if (numMatch) {
    const match = PIPE_STANDARDS.find(p => p.dn === numMatch[1]);
    if (match) return match;
  }

  return null;
}