const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// NOTE: @zachscodingstream/engine's default export/main is broken in 0.0.1
// (package.json points to core/index.js which doesn't exist). We import internal
// modules directly.
const { parseFile } = require("@zachscodingstream/engine/core/fileParser");

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

class Indexer {
  constructor({ dataDir }) {
    this.dataDir = dataDir;
    this.indexPath = path.join(dataDir, "zbc-index.json");
    this.index = { version: 1, files: {} }; // filePath -> { hash, parsed }
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(this.indexPath)) return;
      this.index = JSON.parse(fs.readFileSync(this.indexPath, "utf-8"));
      if (!this.index || this.index.version !== 1) this.index = { version: 1, files: {} };
    } catch {
      this.index = { version: 1, files: {} };
    }
  }

  _save() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2), "utf-8");
  }

  indexFile(filePath) {
    const full = path.resolve(filePath);
    const content = fs.readFileSync(full, "utf-8");
    const hash = sha256(content);

    const prev = this.index.files[full];
    if (prev && prev.hash === hash) {
      return { ok: true, changed: false, parsed: prev.parsed };
    }

    const parsed = parseFile(full, content);
    this.index.files[full] = { hash, parsed };
    this._save();
    return { ok: true, changed: true, parsed };
  }

  removeFile(filePath) {
    const full = path.resolve(filePath);
    if (this.index.files[full]) {
      delete this.index.files[full];
      this._save();
      return { ok: true, removed: true };
    }
    return { ok: true, removed: false };
  }

  // Very simple query helpers (can expand later)
  searchSymbols(query) {
    const lower = String(query || "").toLowerCase();
    const out = [];
    for (const [filePath, meta] of Object.entries(this.index.files)) {
      const syms = meta.parsed?.symbols || [];
      for (const s of syms) {
        if (String(s.name || "").toLowerCase().includes(lower)) {
          out.push({ ...s, filePath });
        }
      }
    }
    return out;
  }
}

module.exports = { Indexer };

