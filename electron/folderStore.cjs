const fs = require("fs");
const path = require("path");

class FolderStore {
  constructor() { this.root = null; }
  open(directory) {
    const root = fs.realpathSync(directory);
    if (!fs.statSync(root).isDirectory()) throw new Error("Choose a folder.");
    this.root = root;
    return { name: root, ...this.list("") };
  }
  resolve(relative) {
    if (!this.root || typeof relative !== "string" || path.isAbsolute(relative)) throw new Error("Choose a project folder first and use a relative path.");
    const resolved = fs.realpathSync(path.resolve(this.root, relative));
    const checked = path.relative(this.root, resolved);
    if (checked === ".." || checked.startsWith(".." + path.sep) || path.isAbsolute(checked)) throw new Error("Path is outside the selected folder.");
    return resolved;
  }
  list(relative) {
    const directory = this.resolve(relative);
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .filter(entry => !entry.isSymbolicLink() && ![".git", "node_modules", ".zbc-runtime"].includes(entry.name))
      .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name));
    return { entries: entries.slice(0, 2000).map(entry => ({ name: entry.name, directory: entry.isDirectory(), relative: path.join(relative, entry.name) })), truncated: entries.length > 2000 };
  }
}

module.exports = { FolderStore };
