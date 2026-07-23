/* ================================================================
   projectStore.js — localStorage-based project persistence
   ================================================================ */

const PROJECTS_KEY = "mto3d_projects";
const PROJECT_PREFIX = "mto3d_proj_";
const ACTIVE_KEY = "mto3d_active_project";

/* ── Helpers ────────────────────────────────────────────────────── */

function _genId() {
  return "proj_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function _read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (e) {
    return null;
  }
}

function _write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function _now() {
  return new Date().toISOString();
}

function _defaultSettings() {
  return {
    asmeOn: true,
    showDimensions: false,
    model: localStorage.getItem("mto3d_model") || "google/gemini-2.5-flash-image",
    orientation: localStorage.getItem("mto3d_orientation") || "elevation",
    customStandards: localStorage.getItem("mto3d_custom_standards") || "",
  };
}

function _defaultData() {
  return {
    mtoComponents: null,
    aiComponents: null,
    pcfComponents: null,
    diffA: null,
    diffB: null,
    diagnostics: null,
  };
}

/* ── Core API ───────────────────────────────────────────────────── */

export function createProject(name) {
  const id = _genId();
  const project = {
    id,
    name: name || "Nytt prosjekt",
    createdAt: _now(),
    updatedAt: _now(),
    settings: _defaultSettings(),
    data: _defaultData(),
  };

  _write(PROJECT_PREFIX + id, project);

  const list = _read(PROJECTS_KEY) || [];
  list.push({ id, name: project.name, updatedAt: project.updatedAt });
  _write(PROJECTS_KEY, list);

  setActiveProject(id);
  return project;
}

export function deleteProject(id) {
  localStorage.removeItem(PROJECT_PREFIX + id);

  let list = _read(PROJECTS_KEY) || [];
  list = list.filter(p => p.id !== id);
  _write(PROJECTS_KEY, list);

  if (_read(ACTIVE_KEY) === id) {
    localStorage.removeItem(ACTIVE_KEY);
  }

  return true;
}

export function updateProject(id, patch) {
  const project = getProject(id);
  if (!project) return null;

  if (patch.settings) {
    project.settings = { ...project.settings, ...patch.settings };
  }
  if (patch.data) {
    project.data = { ...project.data, ...patch.data };
  }
  
  Object.keys(patch).forEach(k => {
    if (k !== "settings" && k !== "data") project[k] = patch[k];
  });

  project.updatedAt = _now();
  _write(PROJECT_PREFIX + id, project);

  let list = _read(PROJECTS_KEY) || [];
  const entry = list.find(p => p.id === id);
  if (entry) {
    entry.name = project.name;
    entry.updatedAt = project.updatedAt;
    _write(PROJECTS_KEY, list);
  }

  return project;
}

export function getProject(id) {
  if (!id) return null;
  return _read(PROJECT_PREFIX + id);
}

export function listProjects() {
  return (_read(PROJECTS_KEY) || [])
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function setActiveProject(id) {
  _write(ACTIVE_KEY, id);
  return true;
}

export function getActiveProject() {
  const id = _read(ACTIVE_KEY);
  if (!id) return null;
  const project = getProject(id);
  if (!project) {
    localStorage.removeItem(ACTIVE_KEY);
    return null;
  }
  return project;
}

export function getActiveProjectId() {
  return _read(ACTIVE_KEY) || null;
}

export function clearActiveProject() {
  localStorage.removeItem(ACTIVE_KEY);
  return true;
}

/* ── Convenience: save data field ────────────────────────────────── */

export function saveProjectData(field, value) {
  const id = getActiveProjectId();
  if (!id) return null;
  return updateProject(id, { data: { [field]: value } });
}

export function saveProjectSetting(key, value) {
  const id = getActiveProjectId();
  if (!id) return null;
  return updateProject(id, { settings: { [key]: value } });
}

/* ── Import/Export for backup ────────────────────────────────────── */

export function exportProject(id) {
  const project = getProject(id);
  if (!project) return null;
  return JSON.stringify({ mto3d_project_export: project }, null, 2);
}

export function importProject(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    const source = parsed.mto3d_project_export || parsed;

    const id = _genId();
    const project = {
      id,
      name: (source.name || "Importert prosjekt") + " (import)",
      createdAt: source.createdAt || _now(),
      updatedAt: _now(),
      settings: { ..._defaultSettings(), ...(source.settings || {}) },
      data: { ..._defaultData(), ...(source.data || {}) },
    };

    _write(PROJECT_PREFIX + id, project);

    const list = _read(PROJECTS_KEY) || [];
    list.push({ id, name: project.name, updatedAt: project.updatedAt });
    _write(PROJECTS_KEY, list);

    setActiveProject(id);
    return project;
  } catch (e) {
    console.error("Import failed:", e);
    return null;
  }
}

/* ── Storage info ────────────────────────────────────────────────── */

export function getProjectStorageStats() {
  const list = listProjects();
  let totalBytes = 0;
  list.forEach(p => {
    const raw = localStorage.getItem(PROJECT_PREFIX + p.id);
    if (raw) totalBytes += raw.length * 2;
  });
  return {
    projectCount: list.length,
    estimatedBytes: totalBytes,
    estimatedKB: Math.round(totalBytes / 1024),
  };
}