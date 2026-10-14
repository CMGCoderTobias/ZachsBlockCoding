const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MAX_BYTES = 1024 * 1024;
const hash = text => crypto.createHash("sha256").update(text).digest("hex");

function readSource(file) {
  if (fs.statSync(file).size > MAX_BYTES) throw new Error("This prototype supports files up to 1 MB.");
  const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(file));
  if (source.includes("\0")) throw new Error("Binary files cannot be opened as text.");
  return source;
}

function atomicWrite(file, text) {
  const temporary = file + ".zbc-tmp-" + crypto.randomUUID();
  try {
    fs.writeFileSync(temporary, text, { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function cleanLayout(layout) {
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) return {};
  return Object.fromEntries(Object.entries(layout).slice(0, 5000).filter(([key, point]) => /^\d+$/.test(key) && point && Number.isFinite(point.x) && Number.isFinite(point.y) && Math.abs(point.x) < 1e7 && Math.abs(point.y) < 1e7).map(([key, point]) => [key, { x: point.x, y: point.y }]));
}

class FileStore {
  constructor() { this.current = null; this.files = new Map(); }
  open(file) {
    file = fs.realpathSync(file);
    const source = readSource(file);
    const existing = [...this.files.values()].find(entry => entry.file === file);
    if (!existing && this.files.size >= 20) throw new Error("Close a file before opening more than 20 files.");
    const token = existing?.token || crypto.randomUUID();
    this.current = { file, token, hash: hash(source) };
    this.files.set(token, this.current);
    let layout = {};
    try {
      const sidecar = JSON.parse(readSource(file + ".zbc.json"));
      if (sidecar.schemaVersion === 1 && sidecar.sourceHash === this.current.hash) layout = cleanLayout(sidecar.layout);
    } catch {}
    return { token, name: file, source, layout, hash: this.current.hash };
  }
  readExternal(token) {
    const file = this.files.get(token);
    if (!file) throw new Error("This file is no longer active.");
    const source = readSource(file.file);
    return { token, name: file.file, source, hash: hash(source) };
  }
  activate(token) {
    if (token && !this.files.has(token)) throw new Error("This file is no longer open.");
    this.current = token ? this.files.get(token) : null;
    return token ? this.readExternal(token) : null;
  }
  close(token) {
    this.files.delete(token);
    if (this.current?.token === token) this.current = null;
  }
  save({ token, source, layout, baseHash }, destination) {
    if (typeof source !== "string" || Buffer.byteLength(source) > MAX_BYTES) throw new Error("Source must be UTF-8 text up to 1 MB.");
    const current = token ? this.files.get(token) : this.current;
    if (token && (!current || current.token !== token)) throw new Error("This file is no longer active. Reopen it or use Save As.");
    const file = token ? current.file : destination;
    if (!file || !path.isAbsolute(file)) throw new Error("Choose a save destination.");
    const normalize = value => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
    const alreadyOpen = [...this.files.values()].find(entry => normalize(entry.file) === normalize(file));
    if (!token && alreadyOpen && alreadyOpen.token !== current?.token) throw new Error("That destination is already open in another tab. Close it or choose a different Save As destination.");
    if (!token && current && normalize(file) === normalize(current.file)
      && (!fs.existsSync(file) || hash(readSource(file)) !== (baseHash || current.hash))) {
      throw new Error("The file changed outside this app. Choose a different Save As destination to preserve both versions.");
    }
    if (token && (!fs.existsSync(file) || hash(readSource(file)) !== (baseHash || current.hash))) throw new Error("The file changed outside this app. Reload from disk or use Save As to preserve both versions.");
    if (fs.existsSync(file)) atomicWrite(file + ".zbc.backup", readSource(file));
    atomicWrite(file, source);
    const newToken = token || alreadyOpen?.token || crypto.randomUUID();
    this.current = { token: newToken, file, hash: hash(source) };
    this.files.set(newToken, this.current);
    let warning;
    try { atomicWrite(file + ".zbc.json", JSON.stringify({ schemaVersion: 1, sourceHash: this.current.hash, layout: cleanLayout(layout) })); }
    catch (error) { warning = `Source saved; layout could not be saved: ${error.message}`; }
    return { token: newToken, name: file, warning, hash: this.current.hash };
  }
}

module.exports = { FileStore, atomicWrite, readSource };
