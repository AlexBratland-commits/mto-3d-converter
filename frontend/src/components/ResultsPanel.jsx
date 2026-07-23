import { useState, useEffect } from "react";

// ASME-valideringsfunksjon (du kan også importere fra utils/asmeEngine.js hvis du har den der)
function validateComponent(c) {
  const dn = c.size_dn_nps ? parseInt(c.size_dn_nps.replace(/DN\s*/i, '')) : null;
  const len = Math.sqrt((c.end_x - c.start_x) ** 2 + (c.end_y - c.start_y) ** 2 + (c.end_z - c.start_z) ** 2);
  const hasMaterial = c.material_grade || c.spec_material;
  const hasSchedule = c.schedule;

  if (!dn || dn <= 0) return { status: 'red', msg: 'Mangler gyldig DN/NPS.' };
  if (len < 0.01 && !c.component?.toLowerCase().includes('tee') && !c.component?.toLowerCase().includes('flange')) return { status: 'red', msg: 'Ugyldig geometri (start/slutt er lik).' };
  if (!hasMaterial) return { status: 'yellow', msg: 'Mangler materialspesifikasjon.' };
  if (!hasSchedule) return { status: 'yellow', msg: 'Mangler Schedule (antatt SCH40).' };
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
        <div className="summary-tile ok" style={{ borderColor: "rgba(16,185,129,0.3)", boxShadow: "0 0 30px -12px rgba(16,185,129,0.4)" }}>
          <div className="num" style={{ color: "#6ee7b7" }}>{stats.green}</div>
          <div className="lbl" style={{ color: "var(--text-dim)", marginTop: "0.5rem" }}>🟢 Trygg standard</div>
        </div>
        <div className="summary-tile warn" style={{ borderColor: "rgba(250,204,21,0.3)", boxShadow: "0 0 30px -12px rgba(250,204,21,0.4)" }}>
          <div className="num" style={{ color: "#fcd34d" }}>{stats.yellow}</div>
          <div className="lbl" style={{ color: "var(--text-dim)", marginTop: "0.5rem" }}>🟡 Usikker</div>
        </div>
        <div className="summary-tile orange" style={{ borderColor: "rgba(251,146,60,0.3)", boxShadow: "0 0 30px -12px rgba(251,146,60,0.4)" }}>
          <div className="num" style={{ color: "#fb923c" }}>{stats.orange}</div>
          <div className="lbl" style={{ color: "var(--text-dim)", marginTop: "0.5rem" }}>🟠 Nærliggende</div>
        </div>
        <div className="summary-tile bad" style={{ borderColor: "rgba(239,68,68,0.3)", boxShadow: "0 0 30px -12px rgba(239,68,68,0.4)" }}>
          <div className="num" style={{ color: "#fca5a5" }}>{stats.red}</div>
          <div className="lbl" style={{ color: "var(--text-dim)", marginTop: "0.5rem" }}>🔴 Feil/Ugyldig</div>
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