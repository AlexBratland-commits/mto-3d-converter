import { useState, useEffect } from "react";
import Tesseract from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";
import { safeParseJSON } from "../services/parseUtils";
import { calculateAbsoluteCoordinatesLinear, buildRouteFromGraph, validateTopologyRules, validateContinuityLinear, normalizeComponentName, normalizeRouteItem, sanitizeRouteGeometry, validateDimensionText } from "../services/geometryEngine";
import { getSystemPrompt, getUserPrompt, getLomPrompt, getTargetedRescanPrompt } from "../services/aiPrompts";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export function isPdfFile(file) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
}

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

const correctionMap = {
  'SPECTACLE BLIND': 'FLANGE',
  'BLIND FLANGE': 'FLANGE',
  'BLIND': 'FLANGE',
  'WELDLET': 'NIPPLE',
  'SOCKOLET': 'NIPPLE',
  'THREDOLET': 'NIPPLE'
};

const mergeAndCalculate = (lomItems, routeItems, originPoint) => {
  const cleanSize = (s) => String(s || 'ANY').toUpperCase().replace(/\s+/g, '');

  const lomNormalized = lomItems
    .map(i => ({ ...i, normalizedType: normalizeComponentName(i.component), normalizedSize: cleanSize(i.size_dn_nps || i.size) }))
    .filter(i => i.normalizedType !== 'Fastener');

  const lomMap = {};
  lomNormalized.forEach(i => { 
    const k = `${i.normalizedType}_${i.normalizedSize}`; 
    if (!lomMap[k]) lomMap[k] = { expected: 0, found: 0, component: i.normalizedType, size: i.normalizedSize }; 
    lomMap[k].expected += Number(i.quantity) || 1; 
  });

  const routeNormalized = routeItems.map(i => ({ ...i, normalizedType: normalizeComponentName(i.component || ''), normalizedSize: cleanSize(i.size_dn_nps || i.size) }));

  let lomIssues = [];
  let extraIssues = [];

  const routeMap = {};
  routeNormalized.forEach(i => { 
    const k = `${i.normalizedType}_${i.normalizedSize}`;
    if (!routeMap[k]) routeMap[k] = { found: 0, component: i.normalizedType, size: i.normalizedSize };
    routeMap[k].found++;
  });

  Object.keys(lomMap).forEach(k => {
    if (routeMap[k]) lomMap[k].found = routeMap[k].found;
  });

  Object.entries(lomMap).forEach(([k, v]) => {
    if (v.component === 'Pipe') return;
    if (v.found < v.expected) lomIssues.push({ key: k, component: v.component, size: v.size, expected: v.expected, found: v.found, missing: v.expected - v.found });
  });

  Object.entries(routeMap).forEach(([k, v]) => {
    if (v.component === 'Pipe') return;
    if (!lomMap[k]) {
      extraIssues.push({ key: k, component: v.component, size: v.size, found: v.found, extra: v.found });
    }
  });

  if (extraIssues.length > 0 && lomIssues.length > 0) {
    extraIssues.forEach((extra) => {
      const targetComponent = correctionMap[extra.component];
      if (targetComponent) {
        const missingIndex = lomIssues.findIndex(m => m.component === targetComponent && m.size === extra.size && m.missing > 0);
        if (missingIndex !== -1) {
          const missing = lomIssues[missingIndex];
          const compToFix = routeNormalized.find(c => 
            normalizeComponentName(c.component) === extra.component && 
            cleanSize(c.size_dn_nps || c.size) === extra.size
          );

          if (compToFix) {
            compToFix.component = targetComponent.charAt(0) + targetComponent.slice(1).toLowerCase();
            compToFix._autoFixed = true;
            missing.missing--;
            missing.found++;
            if (missing.missing === 0) lomIssues.splice(missingIndex, 1);
            extra.fixed = true;
          }
        }
      }
    });
    extraIssues = extraIssues.filter(e => !e.fixed);
  }

  const { components: withCoords, topologyWarnings, continuityIssues: graphContinuityIssues, usedGraphSchema } = buildRouteFromGraph(routeNormalized, originPoint);
  const ruleWarnings = validateTopologyRules(routeNormalized);
  const continuityIssues = usedGraphSchema ? graphContinuityIssues : validateContinuityLinear(withCoords);
  const reconciliationStatus = (lomIssues.length === 0 && extraIssues.length === 0 && continuityIssues.length === 0) ? 'safe' : 'deviation';

  return { components: withCoords, lomIssues, extraIssues, topologyWarnings, ruleWarnings, continuityIssues, usedGraphSchema, reconciliationStatus };
};

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

  const extractLOM = async (bases, ocrTexts, fetchFn = fetch) => {
    const lomPrompt = getLomPrompt(customStandards, ocrTexts);
    const res = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': window.location.href, 'X-Title': 'MTO 3D' },
      body: JSON.stringify({ 
        model, 
        messages: [{ role: 'user', content: [{ type: "text", text: lomPrompt }, ...bases.map(b => ({ type: "image_url", image_url: { url: `data:${b.mime};base64,${b.base64}`, detail: "high" } }))] }], 
        max_tokens: 4096, temperature: 0.05, response_format: { type: "json_object" }
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

  const extractRoute = async (bases, ocrTexts, lomItems, fetchFn = fetch, retryCount = 0) => {
    const systemPrompt = getSystemPrompt();
    const userPrompt = getUserPrompt(orientation, customStandards, ocrTexts, lomItems);

    // FIX: response_format kan feile på OpenRouter for visse modeller
    const supportsJsonMode = !model.includes('gemini-2.5-flash-image');

    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [
          { type: "text", text: userPrompt },
          ...bases.map(b => ({
            type: "image_url",
            image_url: { url: `data:${b.mime};base64,${b.base64}`, detail: "high" }
          }))
        ]}
      ],
      max_tokens: retryCount > 0 ? 12000 : 8192,
      temperature: 0.05,
    };

    if (supportsJsonMode) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.href,
        'X-Title': 'MTO 3D'
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Rute-feil');

    if (data.choices[0].finish_reason === 'length' && retryCount < 1) {
      console.warn("ADVARSEL: AI-responsen ble trunkert – prøver på nytt med høyere max_tokens.");
      return extractRoute(bases, ocrTexts, lomItems, fetchFn, retryCount + 1);
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

    // NY: Kjør dimension_text-validering ETTER parsing
    items = validateDimensionText(items);

    return items.map(normalizeRouteItem);
  };

  const handleUpload = async () => {
    if (files.length === 0 || !apiKey) { alert(apiKey ? "Velg minst én fil." : "API‑nøkkel mangler."); return; }
    setLoading(true); setOcrProgress("");
    setGlobalOrigin({ x: 0, y: 0, z: 0 });

    const fetchWithTimeout = async (url, options, timeoutMs = 90000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return res;
      } catch (err) {
        clearTimeout(timeoutId);
        throw new Error("AI-kallet tok for lang tid (timeout) eller nettverket feilet.");
      }
    };

    try {
      console.log("1/5: Forbereder filer...");
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
      
      console.log("2/5: Sjekker MTO-tabell...");
      if (Array.isArray(externalLomItems) && externalLomItems.length > 0) {
        lomItems = externalLomItems;
      } else {
        try {
          const lomResult = await extractLOM(bases, ocrTexts, fetchWithTimeout);
          lomItems = Array.isArray(lomResult.lomItems) ? lomResult.lomItems : [];
          referencePoint = lomResult.referencePoint || referencePoint;
        } catch (err) {
          console.warn("MTO-ekstraksjon feilet, fortsetter uten MTO-sjekkliste:", err);
        }
      }
      setGlobalOrigin(referencePoint);

      console.log("3/5: Analyserer rørgeometri (Dette kan ta 30-60 sekunder)...");
      setOcrProgress("AI analyserer rørtraséen...");
      const routeItems = await extractRoute(bases, ocrTexts, lomItems, fetchWithTimeout);
      
      if (!routeItems || !Array.isArray(routeItems)) {
        alert("Rute-analysen returnerte ikke gyldige data. Prøv igjen, evt. med en annen modell.");
        return;
      }

      console.log("4/5: Bygger geometri og sjekker avvik...");
      setOcrProgress("Bygger 3D-grunnlag...");
      
      // FIX: Send lomItems for kryssjekk av lengder
      const sanitizedRouteItems = sanitizeRouteGeometry(routeItems, lomItems);

      let mergeResult;
      try {
        mergeResult = mergeAndCalculate(lomItems, sanitizedRouteItems, referencePoint);
      } catch (err) {
        console.warn("mergeAndCalculate feilet, tvinger lineær geometri:", err);
        const fallbackComponents = calculateAbsoluteCoordinatesLinear(sanitizedRouteItems, referencePoint);
        mergeResult = { 
          components: fallbackComponents.map(c => ({ ...c, schedule: c.schedule || "40" })), 
          lomIssues: [], extraIssues: [], topologyWarnings: ["Kunne ikke bygge graf-struktur, bruker lineær plassering."], 
          ruleWarnings: [], continuityIssues: [], reconciliationStatus: 'unknown' 
        };
      }

      console.log("5/5: Sjekker om vi mangler komponenter (Pass 4)...");
      if (mergeResult.lomIssues && mergeResult.lomIssues.length > 0 && mergeResult.lomIssues.length <= 8) {
        try {
          setOcrProgress("Sjekker manglende komponenter...");
          const rescanPrompt = getTargetedRescanPrompt(mergeResult.lomIssues);
          
          const rescanRes = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': window.location.href, 'X-Title': 'MTO 3D' },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: "Du er en assistent som kun leter etter spesifikke manglende komponenter på en ISO-tegning. Returner KUN JSON." },
                { role: 'user', content: [{ type: "text", text: rescanPrompt }, ...bases.map(b => ({ type: "image_url", image_url: { url: `data:${b.mime};base64,${b.base64}`, detail: "high" } }))] }
              ],
              max_tokens: 2000,
              temperature: 0.05,
            })
          });

          const rescanData = await rescanRes.json();
          if (rescanRes.ok) {
            const rescanParsed = safeParseJSON(rescanData.choices?.[0]?.message?.content);
            if (rescanParsed && Array.isArray(rescanParsed.components) && rescanParsed.components.length > 0) {
              console.log("PASS 4: Fant ekstra komponenter!", rescanParsed.components);
              
              const maxId = sanitizedRouteItems.reduce((max, c) => Math.max(max, parseInt(c.id) || 0), 0);
              
              const existingKeys = new Set(sanitizedRouteItems.map(c => `${c.component}-${c.size_dn_nps}`));
              const newItems = rescanParsed.components
                .filter(c => !existingKeys.has(`${c.component}-${c.size_dn_nps}`))
                .map((c, i) => ({
                  ...c,
                  id: String(maxId + i + 1),
                  connects_from: c.connects_from || "", 
                  schedule: c.schedule || "40"
                }));
                
              if (newItems.length > 0) {
                const combinedRoute = [...sanitizedRouteItems, ...newItems];
                const sanitizedCombined = sanitizeRouteGeometry(combinedRoute, lomItems);
                mergeResult = mergeAndCalculate(lomItems, sanitizedCombined, referencePoint);
              }
            }
          }
        } catch (rescanErr) {
          console.warn("Pass 4 (Re-scan) feilet, fortsetter med opprinnelig resultat.", rescanErr);
        }
      }

      const { components, lomIssues, extraIssues, topologyWarnings, ruleWarnings, continuityIssues, reconciliationStatus } = mergeResult;
      const diagnostics = { lomIssues, extraIssues, topologyWarnings, ruleWarnings, continuityIssues, reconciliationStatus };
      
      if (typeof onDiagnostics === "function") onDiagnostics(diagnostics);
      onComponentsReady(components);
      console.log("Fullført!");

    } catch (e) { 
      console.error("AI‑feil:", e); 
      alert('AI‑feil: ' + (e.message || 'Ukjent feil')); 
    } finally { 
      setLoading(false); 
      setOcrProgress(""); 
    }
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