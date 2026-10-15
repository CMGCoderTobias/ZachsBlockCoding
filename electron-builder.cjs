const path = require("node:path");
const fs = require("node:fs");

module.exports = {
  appId: "com.rebornentertainment.zachsblockcoding",
  productName: "ZachsBlockCoding",
  directories: { output: ".release-build/${version}", buildResources: "assets" },
  electronDist: path.join(__dirname, "node_modules", "electron", "dist"),
  electronVersion: require("electron/package.json").version,
  asar: true,
  npmRebuild: false,
  afterPack: async context => {
    fs.rmSync(path.join(context.appOutDir, "resources", "default_app.asar"), { force: true });
  },
  files: ["dist/**/*", "electron/**/*.cjs", "vscode-extension/protocol.cjs", "assets/logo.png", "package.json", "LICENSE", "THIRD_PARTY_NOTICES.md"],
  extraResources: [
    { from: "releases", to: "connector", filter: [`zachsblockcoding-connector-${require("./vscode-extension/package.json").version}.vsix`] },
    { from: "EXTENSION_INSTALL.txt", to: "connector/INSTALL.txt" },
    { from: ".zbc-runtime/release-notices", to: "licenses" }
  ],
  win: { target: "dir", icon: "assets/icon.ico", executableName: "ZachsBlockCoding", signExecutable: false },
  publish: null
};
