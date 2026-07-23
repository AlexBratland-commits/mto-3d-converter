/**
 * Trygt parser JSON fra AI-responser, selv om AI-en legger til 
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

    // 2. ISOLER KUN JSON-ARRAYET: Finn første '[' og siste ']' og kast alt annet (f.eks. "Pipe DN350: 1 stk...")
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

    // Finn relevante nøkler uavhengig av om de er store/små bokstaver
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

    // Retter opp typiske feillesinger av håndskrevne tall (0 blir ofte til 3)
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