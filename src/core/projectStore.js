const STORAGE_KEY = "zbc_project_v1";

function hasBridge() {
  return typeof window !== "undefined" && window.zbc && typeof window.zbc.saveProject === "function";
}

export function loadProject() {
  const text = localStorage.getItem(STORAGE_KEY);
  if (!text) return null;
  return JSON.parse(text);
}

export function saveProject(project) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project, null, 2));
}

export function newProject() {
  return {
    schemaVersion: 1,
    language: "js",
    enabledPacks: ["builtin:base-js"],
    workspace: null,
    manualCode: "// Write/paste JavaScript here.\n// Use blocks to generate snippets, or convert selected code into a Raw JS block.\n\nconsole.log(\"Hello from ZachsBlockCoding!\");\n",
    // Sidecar region metadata (no visible markers required)
    regions: {
      blocks: null, // { start:number, end:number }
    },
  };
}

export async function saveProjectToDisk(project) {
  if (!hasBridge()) return { ok: false, error: "Electron bridge unavailable" };
  const jsonText = JSON.stringify(project, null, 2);
  return window.zbc.saveProject(jsonText);
}

export async function loadProjectFromDisk() {
  if (!hasBridge()) return { ok: false, error: "Electron bridge unavailable", project: null };
  const res = await window.zbc.loadProject();
  if (!res || !res.ok) return { ok: false, error: res?.error || "Load failed", project: null };
  if (!res.jsonText) return { ok: true, project: null };
  return { ok: true, project: JSON.parse(res.jsonText) };
}
