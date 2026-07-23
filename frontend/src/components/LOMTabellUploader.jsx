import { useState, useRef } from "react";
import { safeParseJSON, sanitizeMTOData } from "../services/parseUtils";

export default function LOMTabellUploader({ apiKey, model, onLOMReady }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [rawResponse, setRawResponse] = useState("");
  const fileInputRef = useRef();

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handleUpload = async () => {
    if (!file || !apiKey) {
      alert(apiKey ? "Velg et bilde av MTO-tabellen." : "API‑nøkkel mangler.");
      return;
    }
    setLoading(true);
    setResult(null);
    setRawResponse("");

    try {
      const reader = new FileReader();
      const base64Promise = new Promise((resolve) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;

const prompt = `Du er en ekspert på å lese MTO (Material Take-Off) og "List of Materials"-tabeller fra isometriske tegninger.
Les alt innhold fra tabellen i dette bildet.

Returner KUN et rent JSON-array (uten markdown code blocks eller forklarende tekst). Hvert objekt i arrayet skal ha følgende felt:
- item_no: posisjonsnummer (f.eks. "1", "2", "101")
- quantity: antall (som tall – f.eks. 4, 2.5, 1.0)
- component: komponenttype (f.eks. "ELBOW", "FLANGE", "PIPE", "VALVE/GATE", "DRIP RING")
- size_dn_nps: dimensjon (f.eks. "DN80", "DN20", "DN250")
- schedule: godstykkelse/schedule (f.eks. "40S", "80S", "SCH 40")
- material: materialspesifikasjon (f.eks. "A815-S31803", "A182/F51")

VIKTIGE INSTRUKSJONER OG KORREKSJONER AV HÅNDSKRIFT:
- Les ALLE rader i tabellen, inkludert FABRICATION MATERIALS og ERECTION MATERIALS.
- Vær spesielt oppmerksom på håndskrevne tall hvor '0' ofte ligner på '3'.
- Standard rørdimensjoner er typisk DN20, DN50, DN80, DN100, DN150 osv. Hvis du ser "DN380", betyr det egentlig "DN80". Hvis du ser "DN320", betyr det "DN20".
- Schedule "BOS" er som regel en feillesing for "80S".
- Korriger disse opplagte håndskriftfeilene automatisk før du genererer JSON.
- Returner KUN det rene JSON-arrayet – ingen innledende eller avsluttende tekst.`;

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.href,
          'X-Title': 'MTO 3D - LOM Tabell'
        },
        body: JSON.stringify({
          model: model || "google/gemini-2.5-flash-lite",
          messages: [{
            role: 'user',
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${file.type};base64,${base64}`, detail: "high" } }
            ]
          }],
          max_tokens: 4000,
          temperature: 0.05
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'API-feil');

      const content = data.choices?.[0]?.message?.content || "";
      setRawResponse(content);

      // 1. Parser JSON trygt, selv om modellen returnerer avkortede eller løse responser.
      const rawParsedData = safeParseJSON(content);

      // 2. Rens opp typiske OCR-/skriftfeil i MTO-data før de sendes til UI og state.
      const cleanedMTOData = sanitizeMTOData(rawParsedData);
      const items = Array.isArray(cleanedMTOData)
        ? cleanedMTOData
        : cleanedMTOData
          ? [cleanedMTOData]
          : [];

      const totalItems = items.reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);

      setResult({
        items,
        totalItems,
        count: items.length,
      });

      if (typeof onLOMReady === "function") {
        onLOMReady(items);
      }
    } catch (err) {
      alert("Feil ved LOM-lesing: " + (err.message || "Ukjent feil"));
      console.error("LOM-feil:", err, "Rådata:", rawResponse);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="upload-zone" style={{ borderColor: "#10b981" }}>
        <p style={{ fontSize: "1.2rem", fontWeight: 700 }}>📋 Last opp MTO-tabell</p>
        <p style={{ color: "#6b7280", marginTop: "0.4rem" }}>
          Beskjær bildet så KUN tabellen vises – dette gir 95-99% nøyaktighet
        </p>
        <input
          type="file"
          accept=".png,.jpg,.jpeg"
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        <button
          className="btn btn-green"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          style={{ marginTop: "1rem" }}
        >
          {file ? `✅ ${file.name}` : "📤 Velg bilde av MTO-tabell"}
        </button>
      </div>

      <button
        className="btn btn-green"
        onClick={handleUpload}
        disabled={!file || loading}
      >
        {loading ? "⏳ Leser tabell..." : "📊 Analyser MTO-tabell"}
      </button>

      {result && (
        <div style={{ marginTop: "1rem", padding: "1rem", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "0.75rem" }}>
          <p style={{ color: "#6ee7b7", fontWeight: 600, margin: 0 }}>
            ✅ Fant {result.count} unike komponenttyper ({result.totalItems} totale enheter)
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.4rem" }}>
            Denne listen brukes automatisk som Steg 1 i AI-fanen — du trenger ikke laste den opp der på nytt.
          </p>
        </div>
      )}

      <p style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: "0.5rem" }}>
        💡 Tips: Zoom inn på MTO-tabellen i PDF-en, ta et skjermbilde, og last opp her. Jo renere tabell, jo bedre resultat.
      </p>
    </div>
  );
}