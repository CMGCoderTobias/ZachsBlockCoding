const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { extractFile } = require("@electron/asar");
const root = path.resolve(__dirname, "..");
const version = require("../package.json").version;
const resources = path.join(root, ".release-build", version, "win-unpacked", "resources");
assert.ok(!fs.existsSync(path.join(resources, "default_app.asar")), "Electron default shell must not be shipped");
for (const name of [...fs.readdirSync(path.join(root, "electron")).filter(name => name.endsWith(".cjs")).map(name => "electron/" + name), "vscode-extension/protocol.cjs"]) {
  assert.ok(extractFile(path.join(resources, "app.asar"), name).equals(fs.readFileSync(path.join(root, name))), `Packaged file differs: ${name}`);
}
assert.equal(JSON.parse(extractFile(path.join(resources, "app.asar"), "package.json")).main, "electron/main.cjs");
console.log("Packaged main process and shared protocol match source; no Electron default shell.");
