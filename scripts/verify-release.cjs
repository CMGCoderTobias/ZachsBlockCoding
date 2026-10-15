const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { listPackage, extractFile } = require("@electron/asar");
const root = path.resolve(__dirname, "..");
const version = require("../package.json").version;
const output = path.join(root, "release-output", version);
const unpacked = path.join(root, ".release-build", version, "win-unpacked");
const manifestText = fs.readFileSync(path.join(output, "reborn-update-manifest.json"), "utf8");
const manifest = JSON.parse(manifestText);
const publicKey = fs.readFileSync(path.join(root, "..", "RebornUpdateAgent", "keys", "release-public.pem"));
const envelope = manifestText.match(/^\s*\{"signed":(\{[\s\S]*\}),"signature":"[^"\r\n]*"\}\s*$/);
assert.ok(envelope, "Unexpected signer envelope format");
assert.deepEqual(JSON.parse(envelope[1]), manifest.signed);
assert.ok(crypto.verify("sha256", Buffer.from(envelope[1]), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(manifest.signature, "base64")), "Manifest signature failed");
assert.equal(manifest.signed.appId, "zachsblockcoding");
assert.equal(manifest.signed.version, version);
assert.equal(manifest.signed.packages.length, 1);
const artifact = manifest.signed.packages[0];
assert.equal(artifact.rid, "win-x64");
assert.equal(new URL(artifact.url).origin, "https://kosradio.com");
assert.ok(new URL(artifact.url).pathname.startsWith("/security/v1/updates/zachsblockcoding/"));
const checksum = filename => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
for (const descriptor of [artifact, artifact.blockMap]) {
  const filename = path.join(output, path.basename(new URL(descriptor.url).pathname));
  assert.equal(fs.statSync(filename).size, descriptor.size);
  assert.equal(checksum(filename), descriptor.sha256);
}
const files = listPackage(path.join(unpacked, "resources", "app.asar")).map(name => name.replaceAll("\\", "/"));
for (const name of [...fs.readdirSync(path.join(root, "electron")).filter(name => name.endsWith(".cjs")).map(name => "electron/" + name), "vscode-extension/protocol.cjs"]) {
  assert.ok(extractFile(path.join(unpacked, "resources", "app.asar"), name).equals(fs.readFileSync(path.join(root, name))), `Packaged code differs from source: ${name}`);
}
assert.ok(files.includes("/electron/main.cjs"));
assert.ok(files.includes("/vscode-extension/protocol.cjs"), "Shared editor bridge protocol missing from payload");
assert.ok(!files.some(name => /^\/(test|scripts|src|\.git|\.zbc-runtime)(\/|$)/.test(name)));
assert.ok(!files.some(name => /private-keys|release-private\.pem|editor-pairing\.bin/.test(name)));
assert.ok(!files.some(name => /^\/node_modules\/(electron-builder|@resvg|vite)(\/|$)/.test(name)));
const connector = require("../vscode-extension/package.json");
const bundled = path.join(unpacked, "resources", "connector", `${connector.name}-${connector.version}.vsix`);
assert.equal(checksum(bundled), checksum(path.join(root, "releases", path.basename(bundled))));
assert.ok(fs.existsSync(path.join(unpacked, "resources", "licenses", "Blockly-LICENSE.txt")));
console.log("Verified signed manifest, package/blockmap hashes, kosradio origin, payload exclusions, license and identical bundled VSIX.");
