import { useState, useEffect } from "react";
import { scoreExtraction } from "../services/scoreEngine";

// Oppdatert ASME-valideringsfunksjon
function validateComponent(c) {
  const dn = c.size_dn_nps ? parseInt(String(c.size_dn_nps).replace(/DN\s*/i, '')) : null;
  const len = Math.sqrt((c.end_x - c.start_x) ** 2 + (c.end_y - c.start_y) ** 2 + (c.end_z - c.start_z) ** 2);
  const hasSchedule = c.schedule;

  if (!dn || dn <= 0) return { status: 'yellow', msg: 'Mangler gyldig DN/NPS.' };
  
  // FIX: Definer compName før den brukes
  const compName = (c.component || '').toLowerCase();
  
  const isPointComponent = 
    compName.includes('tee') || 
    compName.includes('flange') || 
    compName.includes('elbow') || 
    compName.includes('bend') ||  
    compName.includes('plug') || 
    compName.includes('penetration') || 
    compName.includes('element') || 
    compName.includes('weldlet') || 
    compName.includes('olet') || 
    compName.includes('spectacle') || 
    compName.includes('blind') || 
    compName.includes('gasket') || 
    compName.includes('support') || 
    compName.includes('stud') || 
    compName.includes('bolt') || 
    compName.includes('nut');

  // Hvis den har null lengde, men ikke er en godkjent punkt-komponent -> RØD
  if (len < 0.01 && !isPointComponent) return { status: 'red', msg: 'Ugyldig geometri (start/slutt er lik).' };
  
  // Hvis den mangler schedule -> GUL
  if (!hasSchedule) return { status: 'yellow', msg: 'Mangler Schedule (antatt SCH40).' };
  
  // Hvis alt er bra (inkludert punkt-komponenter med riktig type) -> GRØNN
  return { status: 'green', msg: 'ASME Standard validert.' };
}

function Legend() {
  const items = [
    { color: "#6b7280", label: "Pipe" },
    { color: "#ef4444", label: "Bend" },
    { color: "#3b82f6", label: "Flange" },
    { color: "#f59e0b", label: "Valve" },
    { color: "#8b5cf6", label: "Reducer" },
    { color: "#14b8a6", label: "Tee" },
    { color: "rgba(255,165,0,0.5)", label: "Insulation" },
    { color: "#ff4d4d", label: "X-akse" },
    { color: "#4dff4d", label: "Y-akse" },
    { color: "#4d94ff", label: "Z-akse" }
  ];
  return (
    <div className="legend">
      {items.map((item, i) => (
        <div key={i} className="legend-item">
          <div className="legend-color" style={{ background: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function ResultsPanel({
  components,
  asmeOn,
  onToggleAsme,
  showDimensions,
  onToggleDimensions,
  onResetView,
  onSaveScreenshot,
  onSaveProject,
  onExportJSON,
  onExportCSV,
  onExportSTEP,
  onExportZIP,
  aiMessage = null,
}) {
  const [stats, setStats] = useState({ green: 0, yellow: 0, orange: 0, red: 0 });
  const scores = scoreExtraction(components, lomItems || [], continuityIssues || []);

  useEffect(() => {
    const newStats = { green: 0, yellow: 0, orange: 0, red: 0 };
    components.forEach(c => {
      const val = validateComponent(c);
      newStats[val.status]++;
      c.__validation = val;
    });
    setStats(newStats);
  }, [components]);

  return (
    <div className="mt-8 space-y-6">
      {/* AI resultatmelding */}
      {aiMessage && (
        <div className="message success">{aiMessage}</div>
      )}

      {/* Valideringsboks */}
      <div className="summary-box" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
  <div className="summary-tile ok" style={{ borderColor: "rgba(16,185,129,0.3)" }}>
    <div className="num" style={{ color: "#6ee7b7" }}>{scores.componentScore}%</div>
    <div className="lbl" style={{ color: "var(--text-dim)", marginTop: "0.5rem" }}>Komponenter vs MTO</div>
  </div>
  <div className="summary-tile warn" style={{ borderColor: "rgba(250,204,21,0.3)" }}>
    <div className="num" style={{ color: "#fcd34d" }}>{scores.lengthScore}%</div>
    <div className="lbl" style={{ color: "var(--text-dim)", marginTop: "0.5rem" }}>Lengder vs MTO</div>
  </div>
  <div className="summary-tile orange" style={{ borderColor: "rgba(251,146,60,0.3)" }}>
    <div className="num" style={{ color: "#fb923c" }}>{scores.topologyScore}%</div>
    <div className="lbl" style={{ color: "var(--text-dim)", marginTop: "0.5rem" }}>Topologi (Ingen brudd)</div>
  </div>
  <div className="summary-tile bad" style={{ borderColor: "rgba(59,130,246,0.3)" }}>
    <div className="num" style={{ color: "#93c5fd" }}>{scores.directionScore}%</div>
    <div className="lbl" style={{ color: "var(--text-dim)", marginTop: "0.5rem" }}>Retninger (Logisk)</div>
  </div>
</div>

      {/* Toolbar */}
      <div className="viewer-toolbar">
        <h2>🔧 3D Rørtrase</h2>
        <div className="toolbar-btns">
          <button className="reset-btn" onClick={onResetView}>🎯 Reset view</button>
          <button className={`dim-btn ${asmeOn ? 'on' : 'off'}`} onClick={onToggleAsme}>
            🧬 ASME {asmeOn ? 'PÅ' : 'AV'}
          </button>
          <button className={`dim-btn ${showDimensions ? 'on' : 'off'}`} onClick={onToggleDimensions}>
            📏 Mål {showDimensions ? 'PÅ' : 'AV'}
          </button>
          <button className="reset-btn" onClick={onSaveScreenshot}>📸 Skjermbilde</button>
          <button className="reset-btn" onClick={onSaveProject}>💾 Lagre prosjekt</button>
        </div>
      </div>

      <Legend />

      <p style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: "0.5rem" }}>
        💡 I målmodus: hold musen over komponent for info, klikk for å låse (🔒). Fargene representerer automatisk ASME-validering.
      </p>

      {/* Eksportknapper */}
      <div className="export-btns">
        <button className="btn btn-green" onClick={onExportJSON}>📥 JSON</button>
        <button className="btn btn-blue" onClick={onExportCSV}>📊 CSV</button>
        <button className="btn btn-teal" onClick={onExportSTEP}>🔧 STEP</button>
        <button className="btn btn-outline" onClick={onExportZIP}>📦 ZIP</button>
      </div>
    </div>
  );
}