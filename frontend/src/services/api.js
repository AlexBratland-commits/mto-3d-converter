/* ================================================================
   api.js — Frontend API service for backend communication
   ================================================================
   
   Base URL: configurable via VITE_API_URL env var
   Default: http://localhost:8000/api
   
   All functions throw on non-OK responses with parsed error messages.
   ================================================================ */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });

  if (!resp.ok) {
    let errorMsg = `API error ${resp.status}`;
    try {
      const body = await resp.json();
      errorMsg = body.detail || body.error || errorMsg;
    } catch {
      errorMsg = resp.statusText || errorMsg;
    }
    throw new Error(errorMsg);
  }

  // Some endpoints return no body
  const contentType = resp.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return resp.json();
  }
  return null;
}

/* ── Health check ──────────────────────────────────────────────── */

export async function healthCheck() {
  return apiFetch("/health");
}

/* ── Upload Excel file ──────────────────────────────────────────── */

export async function uploadExcel(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch("/upload/excel", {
    method: "POST",
    body: formData,
  });
}

/* ── Upload drawing image ───────────────────────────────────────── */

export async function uploadDrawing(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch("/upload/drawing", {
    method: "POST",
    body: formData,
  });
}

/* ── AI drawing analysis (server-side — API key stays on server) ── */

export async function analyzeDrawing(file, { model = null, lomItems = null } = {}) {
  const formData = new FormData();
  formData.append("file", file);
  if (model) formData.append("model", model);
  if (lomItems) formData.append("lom_items", JSON.stringify(lomItems));
  return apiFetch("/analyze", {
    method: "POST",
    body: formData,
  });
}

/* ── Analyze previously uploaded drawing ─────────────────────────── */

export async function analyzeByPath(storedPath, { model = null, lomItems = null } = {}) {
  return apiFetch("/analyze-by-path", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stored_path: storedPath,
      model: model || undefined,
      lom_items: lomItems || undefined,
    }),
  });
}

/* ── List output files ───────────────────────────────────────────── */

export async function listOutputs() {
  return apiFetch("/outputs");
}

/* ── Legacy: direct OpenRouter call (fallback if backend unavailable) ── */

export async function openrouterDirect(payload) {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(payload.headers || {}),
    },
    body: JSON.stringify(payload.body),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: { message: resp.statusText } }));
    throw new Error(data.error?.message || `OpenRouter error ${resp.status}`);
  }

  return resp.json();
}