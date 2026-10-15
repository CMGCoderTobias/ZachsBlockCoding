const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const destination = path.join(root, ".zbc-runtime", "release-notices");
fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(path.join(root, "licenses", "Blockly-LICENSE.txt"), path.join(destination, "Blockly-LICENSE.txt"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const inventory = [];
for (const [relative, metadata] of Object.entries(lock.packages)) {
  if (!relative || metadata.dev) continue;
  const directory = path.join(root, relative);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  const licenses = fs.readdirSync(directory).filter(name => /^(licen[sc]e|notice|copying)(\.|$)/i.test(name) && fs.statSync(path.join(directory, name)).isFile());
  const label = relative.replace(/[^a-zA-Z0-9._-]/g, "_");
  for (const filename of licenses) fs.copyFileSync(path.join(directory, filename), path.join(destination, label + "-" + filename));
  inventory.push(`${manifest.name}@${manifest.version}: ${manifest.license || metadata.license || "see package"}${licenses.length ? "" : " (see THIRD_PARTY_NOTICES and upstream source)"}`);
}
fs.copyFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), path.join(destination, "THIRD_PARTY_NOTICES.md"));
fs.writeFileSync(path.join(destination, "DEPENDENCIES.txt"), inventory.sort().join("\n") + "\n");
