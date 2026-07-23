/* ================================================================
   ProjectManager.jsx — Project selection / creation / deletion UI
   ================================================================
   
   Renders a top-bar section with:
     - Current project name + stats
     - "Nytt prosjekt" button
     - Dropdown to switch between projects
     - Rename / delete options
     - Import / export for backup
   ================================================================ */

import { useState, useEffect, useRef } from "react";
import {
  createProject,
  deleteProject,
  listProjects,
  setActiveProject,
  getActiveProject,
  getActiveProjectId,
  updateProject,
  exportProject,
  importProject,
  getProjectStorageStats,
} from "../services/projectStore";

export default function ProjectManager({ onProjectChange }) {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActive] = useState(null);
  const [showList, setShowList] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [stats, setStats] = useState(null);
  const listRef = useRef(null);

  /* ── Load data on mount & after changes ──────────────────────── */

  function refresh() {
    setProjects(listProjects());
    setActive(getActiveProject());
    setStats(getProjectStorageStats());
  }

  useEffect(() => { refresh(); }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (listRef.current && !listRef.current.contains(e.target)) setShowList(false);
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, []);

  /* ── Handlers ──────────────────────────────────────────────────── */

  const handleCreate = () => {
    const name = newName.trim() || "Nytt prosjekt";
    const proj = createProject(name);
    setNewName("");
    setShowNewForm(false);
    refresh();
    if (onProjectChange) onProjectChange(proj);
  };

  const handleSwitch = (id) => {
    setActiveProject(id);
    setShowList(false);
    refresh();
    const proj = getProject(id);
    if (onProjectChange) onProjectChange(proj);
  };

  const handleDelete = (id) => {
    const proj = getProject(id);
    const confirmed = window.confirm(`Slette prosjekt "${proj?.name || id}"? All data fjernes permanent.`);
    if (!confirmed) return;
    deleteProject(id);
    refresh();
    const nextActive = getActiveProject();
    if (onProjectChange) onProjectChange(nextActive);
  };

  const handleRename = () => {
    if (!activeProject) return;
    const name = renameValue.trim();
    if (!name) { setRenaming(false); return; }
    updateProject(activeProject.id, { name });
    setRenaming(false);
    refresh();
  };

  const handleExport = () => {
    if (!activeProject) return;
    const json = exportProject(activeProject.id);
    if (!json) return;
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${activeProject.name.replace(/[^a-zA-Z0-9]/g, "_")}_backup.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const proj = importProject(text);
      if (!proj) { alert("Kunne ikke importere – ugyldig fil."); return; }
      refresh();
      if (onProjectChange) onProjectChange(proj);
      alert(`Importert prosjekt: "${proj.name}"`);
    } catch (err) {
      alert("Import-feil: " + err.message);
    }
    e.target.value = "";
  };

  const handleNewProjectShortcut = () => {
    setShowNewForm(true);
    setNewName("");
  };

  /* ── Computed ──────────────────────────────────────────────────── */

  const componentCount = activeProject?.data
    ? (
      (activeProject.data.aiComponents?.length || 0) +
      (activeProject.data.mtoComponents?.length || 0) +
      (activeProject.data.pcfComponents?.length || 0)
    )
    : 0;

  const lastEdited = activeProject?.updatedAt
    ? new Date(activeProject.updatedAt).toLocaleString("no-NO", { dateStyle: "short", timeStyle: "short" })
    : "—";

  /* ── Render ──────────────────────────────────────────────────── */

  if (!activeProject && projects.length === 0) {
    // No projects exist yet — show welcome
    return (
      <div style={{
        padding: "1.5rem 2rem",
        background: "var(--glass-bg-2)",
        border: "1px solid var(--glass-border)",
        borderRadius: "16px",
        backdropFilter: "blur(20px)",
        textAlign: "center",
        marginBottom: "2rem",
      }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.75rem" }}>
          📁 Start et nytt prosjekt
        </p>
        <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "1.25rem" }}>
          Prosjekter lagrer MTO-data, AI-analyser, standarder og innstillinger – alt huskes mellom sesjoner.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Prosjektnavn (f.eks. Rørtrase F11)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            style={{
              padding: "0.65rem 1rem",
              borderRadius: "10px",
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              minWidth: "220px",
              outline: "none",
            }}
          />
          <button onClick={handleCreate} className="btn btn-green">
            ✨ Opprett prosjekt
          </button>
        </div>
        <div style={{ marginTop: "1rem" }}>
          <label className="btn-outline btn-sm" style={{ cursor: "pointer" }}>
            📂 Importer prosjekt fra fil
            <input type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />
          </label>
        </div>
      </div>
    );
  }

  // Active project exists — show project bar
  return (
    <div style={{
      padding: "0.75rem 1.25rem",
      background: "var(--glass-bg-2)",
      border: "1px solid var(--glass-border)",
      borderRadius: "12px",
      backdropFilter: "blur(20px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "1rem",
      marginBottom: "1.5rem",
      flexWrap: "wrap",
    }}>
      {/* ── Project name + info ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: "1 1 auto", minWidth: "200px" }}>
        <span style={{ fontSize: "1.25rem" }}>📁</span>

        {renaming ? (
          <input
            type="text"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(false); }}
            onBlur={handleRename}
            autoFocus
            style={{
              padding: "0.3rem 0.5rem",
              borderRadius: "6px",
              background: "var(--panel-2)",
              border: "1px solid var(--accent-purple)",
              color: "var(--text)",
              fontSize: "0.95rem",
              fontWeight: 600,
              outline: "none",
              width: "200px",
            }}
          />
        ) : (
          <span
            style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text)", cursor: "pointer" }}
            onDoubleClick={() => { setRenaming(true); setRenameValue(activeProject?.name || ""); }}
            title="Dobbeltklikk for å endre navn"
          >
            {activeProject?.name || "Ingen prosjekt"}
          </span>
        )}

        {activeProject && (
          <span style={{ fontSize: "0.72rem", color: "var(--text-dim)", whiteSpace: "nowrap" }}>
            {componentCount > 0 ? `${componentCount} komponenter` : "Tomt"} • {lastEdited}
          </span>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>

        {/* Switch project dropdown */}
        <div ref={listRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowList(!showList)}
            className="btn-outline btn-sm"
            title="Bytt prosjekt"
          >
            🔄 Bytt
          </button>

          {showList && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 0.5rem)",
              right: 0,
              minWidth: "260px",
              background: "var(--glass-bg-2)",
              border: "1px solid var(--glass-border)",
              borderRadius: "12px",
              backdropFilter: "blur(20px)",
              padding: "0.75rem",
              zIndex: 50,
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            }}>
              {projects.length === 0 ? (
                <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", textAlign: "center" }}>Ingen prosjekter</p>
              ) : (
                projects.map(p => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "8px",
                      cursor: "pointer",
                      background: p.id === activeProject?.id ? "rgba(168,85,247,0.15)" : "transparent",
                      border: p.id === activeProject?.id ? "1px solid rgba(168,85,247,0.3)" : "1px solid transparent",
                      marginBottom: "0.25rem",
                      transition: "0.15s",
                    }}
                    onClick={() => handleSwitch(p.id)}
                  >
                    <div>
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
                        {p.id === activeProject?.id ? "● " : ""}{p.name}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginLeft: "0.5rem" }}>
                        {new Date(p.updatedAt).toLocaleDateString("no-NO")}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                      style={{ fontSize: "0.75rem", color: "#f87171", background: "none", border: "none", cursor: "pointer", padding: "0.2rem" }}
                      title="Slett prosjekt"
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* New project */}
        <button onClick={handleNewProjectShortcut} className="btn-outline btn-sm" title="Nytt prosjekt">
          ✨ Nytt
        </button>

        {/* Rename */}
        {activeProject && (
          <button
            onClick={() => { setRenaming(true); setRenameValue(activeProject.name); }}
            className="btn-outline btn-sm"
            title="Endre navn (eller dobbeltklikk navnet)"
          >
            ✏️
          </button>
        )}

        {/* Export */}
        {activeProject && (
          <button onClick={handleExport} className="btn-outline btn-sm" title="Exporter prosjekt som backup">
            💾
          </button>
        )}

        {/* Import */}
        <label className="btn-outline btn-sm" style={{ cursor: "pointer" }} title="Importer prosjekt fra backup-fil">
          📂
          <input type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />
        </label>

        {/* Storage stats */}
        {stats && stats.projectCount > 0 && (
          <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", padding: "0.2rem 0.5rem", background: "var(--panel)", borderRadius: "6px" }}>
            💾 {stats.projectCount} proj • {stats.estimatedKB} KB
          </span>
        )}
      </div>

      {/* ── New project modal ── */}
      {showNewForm && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(8px)",
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div style={{
            background: "var(--glass-bg-2)",
            border: "1px solid var(--glass-border)",
            borderRadius: "16px",
            padding: "2rem",
            minWidth: "360px",
            maxWidth: "500px",
          }}>
            <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", marginBottom: "1rem" }}>
              ✨ Nytt prosjekt
            </p>
            <input
              type="text"
              placeholder="Prosjektnavn..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowNewForm(false); }}
              autoFocus
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                borderRadius: "10px",
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                fontSize: "1rem",
                outline: "none",
                marginBottom: "1rem",
              }}
            />
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button onClick={() => setShowNewForm(false)} className="btn-outline">
                Avbryt
              </button>
              <button onClick={handleCreate} className="btn btn-green">
                Opprett
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}