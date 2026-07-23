import { downloadStepFile } from "./services/stepExport";
import { useState, useEffect, useRef, useCallback } from "react";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import DrawingUploader from "./components/DrawingUploader";
import EditableTable from "./components/EditableTable";
import Viewer3D from "./components/Viewer3D";
import PCFEksport from "./components/PCFEksport";
import DiffComparison from "./components/DiffComparison";
import ResultsPanel from "./components/ResultsPanel";
import LOMTabellUploader from "./components/LOMTabellUploader";
import ProjectManager from "./components/ProjectManager";
import {
  getActiveProject,
  getActiveProjectId,
  saveProjectData,
  saveProjectSetting,
  updateProject,
  exportProject,
  importProject as importProjectFromStore,
} from "./services/projectStore";
import { IconMTO, IconPCF, IconAI, IconDiff, IconProjects, IconExport, IconImport, IconKey, IconLogo } from "./components/Icons";

const EMPTY_DIAGNOSTICS = { 
  lomIssues: [], extraIssues: [], topologyWarnings: [], 
  ruleWarnings: [], continuityIssues: [], reconciliationStatus: 'unknown' 
};

function App() {
  const [activeTab, setActiveTab] = useState("ai");
  const [aiComponents, setAiComponents] = useState(null);
  const [pcfComponents, setPcfComponents] = useState(null);
  const [mtoComponents, setMtoComponents] = useState(null);
  const [lomData, setLomData] = useState(null);
  const [externalStandards, setExternalStandards] = useState(null);
  const [diffComponentsA, setDiffComponentsA] = useState(null);
  const [diffComponentsB, setDiffComponentsB] = useState(null);
  const [asmeOn, setAsmeOn] = useState(true);
  const [showDimensions, setShowDimensions] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem("mto3d_openrouter_key") || "");
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [storageInfo, setStorageInfo] = useState("");
  const [diagnostics, setDiagnostics] = useState(EMPTY_DIAGNOSTICS);

  /* ── NEW: Project state ────────────────────────────────────────── */
  const [activeProject, setActiveProject] = useState(null);

  const navRef = useRef(null);
  const indicatorRef = useRef(null);

  /* ── Load active project on mount ──────────────────────────────── */

  useEffect(() => {
    const proj = getActiveProject();
    if (proj) loadProjectIntoState(proj);
  }, []);

  /* ── Storage info ──────────────────────────────────────────────── */

  useEffect(() => {
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(est => {
        const usedMB = ((est.usage || 0) / 1024 / 1024).toFixed(1);
        const quotaMB = ((est.quota || 0) / 1024 / 1024).toFixed(0);
        setStorageInfo(`${usedMB} MB / ${quotaMB} MB`);
      }).catch(() => setStorageInfo(""));
    }
  }, []);

  /* ── Tab indicator animation ───────────────────────────────────── */

  useEffect(() => {
    if (!navRef.current || !indicatorRef.current) return;
    const activeBtn = navRef.current.querySelector('.segmented-tab.is-active');
    if (activeBtn) {
      const navRect = navRef.current.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      indicatorRef.current.style.left = (btnRect.left - navRect.left) + 'px';
      indicatorRef.current.style.width = btnRect.width + 'px';
      const colors = {
        ai: 'linear-gradient(135deg, #a855f7, #6366f1)',
        pcf: 'linear-gradient(135deg, #14b8a6, #06b6d4)',
        lom: 'linear-gradient(135deg, #10b981, #22c55e)',
        diff: 'linear-gradient(135deg, #10b981, #84cc16)'
      };
      indicatorRef.current.style.background = colors[activeTab] || colors.ai;
    }
  }, [activeTab]);

  /* ── NEW: Auto-save to project when data changes ──────────────── */

  useEffect(() => {
    if (!getActiveProjectId()) return;
    if (aiComponents) saveProjectData('aiComponents', aiComponents);
  }, [aiComponents]);

  useEffect(() => {
    if (!getActiveProjectId()) return;
    if (lomData) saveProjectData('mtoComponents', lomData);
  }, [lomData]);

  useEffect(() => {
    if (!getActiveProjectId()) return;
    if (pcfComponents) saveProjectData('pcfComponents', pcfComponents);
  }, [pcfComponents]);

  useEffect(() => {
    if (!getActiveProjectId()) return;
    if (diffComponentsA) saveProjectData('diffA', diffComponentsA);
  }, [diffComponentsA]);

  useEffect(() => {
    if (!getActiveProjectId()) return;
    if (diffComponentsB) saveProjectData('diffB', diffComponentsB);
  }, [diffComponentsB]);

  useEffect(() => {
    if (!getActiveProjectId()) return;
    saveProjectSetting('asmeOn', asmeOn);
  }, [asmeOn]);

  useEffect(() => {
    if (!getActiveProjectId()) return;
    saveProjectSetting('showDimensions', showDimensions);
  }, [showDimensions]);

  /* ── NEW: Load project data into state ─────────────────────────── */

  const loadProjectIntoState = (proj) => {
    setActiveProject(proj);
    setAiComponents(proj.data?.aiComponents || null);
    setLomData(proj.data?.mtoComponents || null);
    setPcfComponents(proj.data?.pcfComponents || null);
    setDiffComponentsA(proj.data?.diffA || null);
    setDiffComponentsB(proj.data?.diffB || null);
    setDiagnostics(proj.data?.diagnostics || EMPTY_DIAGNOSTICS);
    setAsmeOn(proj.settings?.asmeOn ?? true);
    setShowDimensions(proj.settings?.showDimensions ?? false);
  };

  /* ── NEW: Handle project switch ────────────────────────────────── */

  const handleProjectChange = useCallback((proj) => {
    if (proj) {
      loadProjectIntoState(proj);
    } else {
      // No project — reset all state
      setActiveProject(null);
      setAiComponents(null);
      setLomData(null);
      setPcfComponents(null);
      setDiffComponentsA(null);
      setDiffComponentsB(null);
      setDiagnostics(EMPTY_DIAGNOSTICS);
      setAsmeOn(true);
      setShowDimensions(false);
    }
  }, []);

  /* ── Existing handlers ─────────────────────────────────────────── */

  const handleApiKeyChange = (e) => {
    setApiKey(e.target.value);
    localStorage.setItem("mto3d_openrouter_key", e.target.value.trim());
  };

  const updateComponents = (newData, setter) => setter(newData);

  const exportToJSON = (data) => {
    if (!data?.length) return alert("Ingen data å eksportere!");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "MTO_Export.json";
    a.click();
  };

  const exportToCSV = (data) => {
    if (!data?.length) return alert("Ingen data å eksportere!");
    const headers = Object.keys(data[0]);
    const csv = [headers.join(','), ...data.map(r => headers.map(h => r[h] ?? '').join(','))].join('\n');
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "MTO_Export.csv";
    a.click();
  };

  const exportToXLSX = (data) => {
    if (!data?.length) return alert("Ingen data å eksportere!");
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MTO");
    XLSX.writeFile(wb, "MTO_Export.xlsx");
  };

  const exportSTEP = (data) => {
    const ok = downloadStepFile(data, "MTO_Export.stp");
    if (!ok) alert("Ingen brukbare koordinater funnet – ingenting å eksportere.");
  };

  const exportToZIP = async (data) => {
    if (!data?.length) return alert("Ingen data å eksportere!");
    try {
      const zip = new JSZip();
      zip.file("MTO_Export.json", JSON.stringify(data, null, 2));
      const headers = Object.keys(data[0]);
      const csv = [headers.join(','), ...data.map(r => headers.map(h => r[h] ?? '').join(','))].join('\n');
      zip.file("MTO_Export.csv", csv);
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "MTO_Pipeline_Package.zip";
      a.click();
    } catch (err) {
      console.error("Feil ved opprettelse av ZIP:", err);
      alert("Kunne ikke generere ZIP-fil.");
    }
  };

  /* ── NEW: Real save screenshot (uses canvas snapshot) ──────────── */
  /* Kept as placeholder for now — can be implemented later */
  const handleSaveScreenshot = () => {
    alert("Skjermbilde-funksjon kommer i neste versjon.");
  };

  /* ── NEW: Real save project ────────────────────────────────────── */
  const handleSaveProject = () => {
    if (!getActiveProjectId()) {
      alert("Opprett et prosjekt først!");
      return;
    }
    // Auto-save already happens via useEffect, but force an update with timestamp
    updateProject(getActiveProjectId(), { updatedAt: new Date().toISOString() });
    alert("✅ Prosjekt lagret!");
  };

  const handleResetView = () => {
    // This is handled inside Viewer3D via a ref or event — placeholder
    window.dispatchEvent(new CustomEvent('reset-view'));
  };

  const resultsProps = (data) => ({
    components: data,
    asmeOn,
    onToggleAsme: () => setAsmeOn(p => !p),
    showDimensions,
    onToggleDimensions: () => setShowDimensions(p => !p),
    onResetView: handleResetView,
    onSaveScreenshot: handleSaveScreenshot,
    onSaveProject: handleSaveProject,
    onExportJSON: () => exportToJSON(data),
    onExportCSV: () => exportToCSV(data),
    onExportSTEP: () => exportSTEP(data),
    onExportZIP: () => exportToZIP(data),
    onExportXLSX: () => exportToXLSX(data),
  });

  /* ── Diagnostics UI (unchanged) ────────────────────────────────── */

  const ReconciliationBadge = ({ status }) => {
    if (status === 'safe') {
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--green)', fontWeight: 700, fontSize: '0.85rem' }}>🟢 Trygg</span>;
    }
    if (status === 'deviation') {
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#f87171', fontWeight: 700, fontSize: '0.85rem' }}>🔴 Avvik</span>;
    }
    return null;
  };

  const DiagnosticsPanel = ({ diagnostics }) => {
    const { lomIssues = [], extraIssues = [], topologyWarnings = [], ruleWarnings = [], continuityIssues = [], reconciliationStatus } = diagnostics || {};
    const hasAnyIssue = lomIssues.length || extraIssues.length || topologyWarnings.length || ruleWarnings.length || continuityIssues.length;

    if (!hasAnyIssue) {
      return (
        <div className="card slim" style={{ marginBottom: '1rem', borderColor: 'var(--green-dk)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ color: 'var(--green)', margin: 0 }}>MTO- og topologisjekk: ingen avvik funnet.</p>
          <ReconciliationBadge status={reconciliationStatus} />
        </div>
      );
    }

    return (
      <div className="card slim" style={{ marginBottom: '1rem', borderColor: 'var(--amber)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
          <p style={{ color: 'var(--amber)', margin: 0, fontWeight: 600 }}>Avviksrapport</p>
          <ReconciliationBadge status={reconciliationStatus} />
        </div>
        {lomIssues.length > 0 && (
          <div style={{ marginBottom: (extraIssues.length || topologyWarnings.length || ruleWarnings.length || continuityIssues.length) ? '0.75rem' : 0 }}>
            <p style={{ color: '#f97316', margin: 0, fontWeight: 600, marginBottom: '0.4rem' }}>🟠 Mangler i tegning ({lomIssues.length})</p>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              {lomIssues.map((issue, i) => (
                <li key={i}>Mangler {issue.missing}x <strong>{issue.component} {issue.size}</strong> (MTO: {issue.expected}, funnet i rute: {issue.found})</li>
              ))}
            </ul>
          </div>
        )}
        {extraIssues.length > 0 && (
          <div style={{ marginBottom: (topologyWarnings.length || ruleWarnings.length || continuityIssues.length) ? '0.75rem' : 0 }}>
            <p style={{ color: '#eab308', margin: 0, fontWeight: 600, marginBottom: '0.4rem' }}>🟡 Udefinert/ekstra i tegning ({extraIssues.length})</p>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              {extraIssues.map((issue, i) => (
                <li key={i}>{issue.extra} flere enn MTO for <strong>{issue.component} {issue.size}</strong> (MTO: {issue.expected}, funnet i rute: {issue.found}) — sjekk for dobbelttelling eller ekte tillegg</li>
              ))}
            </ul>
          </div>
        )}
        {topologyWarnings.length > 0 && (
          <div style={{ marginBottom: (ruleWarnings.length || continuityIssues.length) ? '0.75rem' : 0 }}>
            <p style={{ color: '#f59e0b', margin: 0, fontWeight: 600, marginBottom: '0.4rem' }}>Topologi ({topologyWarnings.length})</p>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              {topologyWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
        {ruleWarnings.length > 0 && (
          <div style={{ marginBottom: continuityIssues.length ? '0.75rem' : 0 }}>
            <p style={{ color: '#f59e0b', margin: 0, fontWeight: 600, marginBottom: '0.4rem' }}>Regelsjekk ({ruleWarnings.length})</p>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              {ruleWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
        {continuityIssues.length > 0 && (
          <div>
            <p style={{ color: '#f59e0b', margin: 0, fontWeight: 600, marginBottom: '0.4rem' }}>Kontinuitet – avvik før auto-korrigering ({continuityIssues.length})</p>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              {continuityIssues.map((iss, i) => (
                <li key={i}>Mellom <strong>{iss.currComp}</strong> og <strong>{iss.nextComp}</strong>: gap = {iss.gap} mm — {iss.suggestion}</li>
              ))}
            </ul>
          </div>
        )}
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.6rem', fontStyle: 'italic' }}>
          Tips: bruk EditableTable til å legge til manglende komponenter manuelt, eller juster retning/lengde på eksisterende.
        </p>
      </div>
    );
  };

  /* ── RENDER ────────────────────────────────────────────────────── */

  return (
    <div className="container">
      <nav className="app-nav">
        <div className="app-nav-brand">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
            <IconLogo className="w-5 h-5 text-white" />
          </div>
          <div className="brand-text">
            <span className="brand-title">MTO<em>.flow</em></span>
            <span className="brand-subtitle">Pipeline Suite</span>
          </div>
        </div>
        <div className="app-nav-actions">
          {/* ── CHANGED: real export/import project buttons ── */}
          <button className="nav-icon-btn" title="Exporter prosjekt" onClick={() => {
            const id = getActiveProjectId();
            if (!id) return alert("Ingen aktiv prosjekt å eksportere.");
            const json = exportProject(id);
            if (!json) return;
            const blob = new Blob([json], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "Prosjekt_backup.json";
            a.click();
          }}>
            <IconExport className="w-4 h-4" />
          </button>
          <label className="nav-icon-btn" title="Importer prosjekt" style={{ cursor: "pointer" }}>
            <IconImport className="w-4 h-4" />
            <input type="file" accept=".json" style={{ display: "none" }} onChange={(e) => {
              const file = e.target.files[0];
              if (!file) return;
              file.text().then(text => {
                const proj = importProjectFromStore(text);
                if (proj) handleProjectChange(proj);
                else alert("Ugyldig fil.");
              });
              e.target.value = "";
            }} />
          </label>
          <span className="nav-divider" />
          <span className="storage-pill">💾 {storageInfo}</span>
          <div className="api-key-wrap">
            <button className={`nav-icon-btn ${apiKeyOpen ? 'is-active' : ''}`} title="API-nøkkel" onClick={() => setApiKeyOpen(!apiKeyOpen)}>
              <IconKey className="w-4 h-4" />
            </button>
            {apiKeyOpen && (
              <div className="api-key-popover" style={{ position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0, width: '300px', padding: '1rem', background: 'var(--glass-bg-2)', border: '1px solid var(--glass-border)', borderRadius: '12px', backdropFilter: 'blur(20px)', zIndex: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.75rem' }}>
                  <IconKey className="w-4 h-4" /> OpenRouter API
                </div>
                <input type="password" placeholder="sk-or-v1-..." value={apiKey} onChange={handleApiKeyChange} style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }} />
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>Lagres kun lokalt i nettleseren.</div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <header className="hero-copy">
        <h1 className="hero-title">
          <span className="hero-title-accent">Pipeline Intelligence</span><br />
          Konvertert til 3D på minutter
        </h1>
        <div className="hero-badges">
          <span className="hero-badge">ASME B36.10</span>
          <span className="hero-badge">PCF ↔ STEP</span>
          <span className="hero-badge">AI + OCR</span>
          <span className="hero-badge">Prosjekt-lagring</span>
        </div>
      </header>

      {/* ── NEW: ProjectManager renders here ──────────────────────── */}
      <ProjectManager onProjectChange={handleProjectChange} />

      {/* ── Show tab content only when a project is active ────────── */}
      {activeProject && (
        <>
          <nav className="segmented-tabs" ref={navRef} style={{ display: "flex", justifyContent: "center", marginBottom: "2.5rem", flexWrap: "wrap" }}>
            <div className="segmented-indicator" ref={indicatorRef} />
            <button className={`segmented-tab ${activeTab === "lom" ? "is-active" : ""}`} onClick={() => setActiveTab("lom")}>
              📋 MTO Tabell{lomData ? " ✓" : ""}
            </button>
            <button className={`segmented-tab ${activeTab === "ai" ? "is-active" : ""}`} onClick={() => setActiveTab("ai")}>
              <span className="ai-icon-premium"><IconAI className="w-4 h-4" /></span> AI Tegning
            </button>
            <button className={`segmented-tab ${activeTab === "pcf" ? "is-active" : ""}`} onClick={() => setActiveTab("pcf")}>
              <IconPCF className="w-4 h-4" /> PCF Eksport
            </button>
            <button className={`segmented-tab ${activeTab === "diff" ? "is-active" : ""}`} onClick={() => setActiveTab("diff")}>
              <IconDiff className="w-4 h-4" /> Avvikssjekk
            </button>
          </nav>

          {activeTab === "lom" && (
            <section>
              <LOMTabellUploader
                apiKey={apiKey}
                model={activeProject.settings?.model || "google/gemini-2.5-flash-lite"}
                onLOMReady={(items) => setLomData(items)}
              />
              {lomData && (
                <div className="mt-8">
                  <div className="card slim" style={{ marginBottom: '1rem', borderColor: 'var(--green-dk)' }}>
                    <p style={{ color: 'var(--green)', margin: 0, fontWeight: 600 }}>
                      MTO-tabell lest ({lomData.length} komponenter)
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>
                      Denne listen brukes automatisk som Steg 1 når du går til AI-fanen — ingen ny MTO-lesing der.
                    </p>
                  </div>
                  <EditableTable data={lomData} onDataChange={(newData) => setLomData(newData)} />
                  <div className="export-btns" style={{ marginTop: '1rem' }}>
                    <button className="btn btn-green" onClick={() => exportToJSON(lomData)}>📥 JSON</button>
                    <button className="btn btn-blue" onClick={() => exportToCSV(lomData)}>📊 CSV</button>
                    <button className="btn btn-teal" onClick={() => exportToXLSX(lomData)}>📋 Excel</button>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeTab === "ai" && (
            <section>
              {/* ── CHANGED: pass project settings to DrawingUploader ── */}
              <DrawingUploader
                onComponentsReady={(components) => setAiComponents(components)}
                onDiagnostics={(d) => setDiagnostics(d || EMPTY_DIAGNOSTICS)}
                apiKey={apiKey}
                externalLomItems={lomData}
                externalStandards={externalStandards}
                projectSettings={{
                  model: activeProject.settings?.model,
                  orientation: activeProject.settings?.orientation,
                  customStandards: activeProject.settings?.customStandards || '',
                }}
                onSettingsChange={(key, value) => saveProjectSetting(key, value)}
              />
              {aiComponents && (
                <>
                  <DiagnosticsPanel diagnostics={diagnostics} />
                  <EditableTable data={aiComponents} onDataChange={(newData) => updateComponents(newData, setAiComponents)} />
                  <Viewer3D components={aiComponents} asmeOn={asmeOn} onToggleAsme={() => setAsmeOn(p => !p)} />
                  <ResultsPanel {...resultsProps(aiComponents)} aiMessage={`✅ AI fant ${aiComponents.length} komponenter fra tegningen!`} />
                </>
              )}
            </section>
          )}

          {activeTab === "pcf" && (
            <section>
              <PCFEksport components={pcfComponents || aiComponents || mtoComponents} />
              {(pcfComponents || aiComponents || mtoComponents) && (
                <div className="mt-8">
                  <EditableTable data={pcfComponents || aiComponents || mtoComponents} onDataChange={(newData) => updateComponents(newData, setPcfComponents)} />
                  <Viewer3D components={pcfComponents || aiComponents || mtoComponents} asmeOn={asmeOn} onToggleAsme={() => setAsmeOn(p => !p)} />
                  <ResultsPanel {...resultsProps(pcfComponents || aiComponents || mtoComponents)} />
                </div>
              )}
            </section>
          )}

          {activeTab === "diff" && (
            <section>
              <DiffComparison onDataA={setDiffComponentsA} onDataB={setDiffComponentsB} />
              {diffComponentsA && diffComponentsB && (
                <div className="mt-8 space-y-6">
                  <p className="text-green-400 mb-4">✅ Begge datasett lastet.</p>
                  <EditableTable data={diffComponentsA} onDataChange={(newData) => updateComponents(newData, setDiffComponentsA)} />
                  <EditableTable data={diffComponentsB} onDataChange={(newData) => updateComponents(newData, setDiffComponentsB)} />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default App;