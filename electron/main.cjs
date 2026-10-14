const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, ipcMain, dialog, clipboard, safeStorage } = require("electron");
const { PairingStore } = require("./pairingStore.cjs");
const { FileStore } = require("./fileStore.cjs");
const { FileWatcher } = require("./fileWatcher.cjs");
const { FolderStore } = require("./folderStore.cjs");
const { EditorBridge } = require("./editorBridge.cjs");

const runtime = process.env.ZBC_DATA_DIR || path.resolve(__dirname, "..", ".zbc-runtime");
for (const name of ["userData", "sessionData", "temp", "crashDumps"]) {
  const directory = path.join(runtime, name);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
app.commandLine.appendSwitch("disk-cache-size", "16777216");
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
const store = new FileStore();
const smoke = process.argv.includes("--smoke-test");
const previousClipboard = smoke ? clipboard.readText() : null;
let smokePairingCode;
const devUrl = process.env.VITE_DEV_SERVER_URL;
let win;
const folders = new FolderStore();
const pairingStore = smoke ? null : new PairingStore(path.join(runtime, "userData", "editor-pairing.bin"), safeStorage);
const bridge = new EditorBridge(update => {
  if (win && !win.isDestroyed()) win.webContents.send("zbc:editor-event", update);
}, pairingStore);
const watcher = new FileWatcher(store, update => {
  if (win && !win.isDestroyed()) win.webContents.send("zbc:external-source", update);
});

if (smoke) {
  const input = path.join(runtime, "smoke-input.js");
  fs.writeFileSync(input, fs.readFileSync(path.join(__dirname, "..", "src", "core", "sourceModel.js")));
  const project = path.join(runtime, "smoke-project");
  fs.mkdirSync(path.join(project, "nested"), { recursive: true });
  fs.writeFileSync(path.join(project, "one.js"), "const first = 1;");
  fs.writeFileSync(path.join(project, "two.js"), "const second = 2;");
  fs.writeFileSync(path.join(project, "notes.txt"), "Project notes");
  fs.writeFileSync(path.join(project, "windows.js"), '\uFEFFconst windows = 1;\r\nconst untouched = 2;\r\n');
  fs.writeFileSync(path.join(project, "nested", "nested.js"), "const nested = true;");
  dialog.showOpenDialog = async (_window, options) => ({ canceled: false, filePaths: [options?.properties?.includes("openDirectory") ? project : input] });
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(runtime, "smoke-saved.js") });
}

function trusted(event) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error("Unknown editor window");
}

ipcMain.handle("zbc:open-source", async event => {
  try {
    trusted(event);
    const choice = await dialog.showOpenDialog(win, { defaultPath: path.resolve(__dirname, ".."), properties: ["openFile"], filters: [{ name: "JavaScript", extensions: ["js", "mjs", "cjs", "jsx"] }] });
    if (choice.canceled) return { canceled: true };
    const result = store.open(choice.filePaths[0]);
    watcher.start();
    try {
      const { parseFile } = require("@zachscodingstream/engine/core/fileParser");
      result.symbols = parseFile(choice.filePaths[0], result.source).symbols;
    } catch {}
    return result;
  } catch (error) { return { error: error.message }; }
});

ipcMain.handle("zbc:save-source", async (event, payload) => {
  try {
    trusted(event);
    if (!payload || typeof payload !== "object") throw new Error("Invalid save request");
    let destination;
    if (!payload.token) {
      const choice = await dialog.showSaveDialog(win, { defaultPath: path.resolve(__dirname, "..", "untitled.js"), filters: [{ name: "JavaScript", extensions: ["js", "mjs", "cjs", "jsx"] }] });
      if (choice.canceled) return { canceled: true };
      destination = choice.filePath;
    }
    const result = store.save(payload, destination);
    watcher.start();
    return result;
  } catch (error) { return { error: error.message }; }
});

ipcMain.handle("zbc:read-external", (event, token) => {
  try { trusted(event); return store.readExternal(token); }
  catch (error) { return { error: error.message }; }
});

ipcMain.handle("zbc:close-source", (event, token) => {
  trusted(event);
  if (!token || store.current?.token === token) watcher.stop();
  if (token) store.close(token);
  else store.current = null;
});

function handler(name, callback) {
  ipcMain.handle(name, async (event, ...args) => {
    try { trusted(event); return await callback(...args); }
    catch (error) { return { error: error.message }; }
  });
}
handler("zbc:activate-source", token => {
  watcher.stop();
  const result = store.activate(token);
  watcher.start();
  return result;
});
handler("zbc:open-folder", async () => {
  const choice = await dialog.showOpenDialog(win, { defaultPath: path.resolve(__dirname, ".."), properties: ["openDirectory"] });
  return choice.canceled ? { canceled: true } : folders.open(choice.filePaths[0]);
});
handler("zbc:list-folder", relative => folders.list(relative));
handler("zbc:open-project-source", relative => {
  const result = store.open(folders.resolve(relative));
  watcher.start();
  return result;
});
handler("zbc:editor-start", async () => {
  const result = await bridge.start();
  clipboard.writeText(result.code);
  if (smoke) smokePairingCode = result.code;
  return result;
});
handler("zbc:editor-stop", () => bridge.stop());
handler("zbc:editor-resume", async () => {
  if (!pairingStore?.load()) return { remembered: false };
  await bridge.start();
  return { remembered: true };
});
handler("zbc:editor-forget", () => { bridge.stop(); pairingStore?.forget(); });
handler("zbc:editor-edit", payload => bridge.edit(payload));
handler("zbc:editor-request", payload => {
  if (!payload || !["save", "focus"].includes(payload.type)) throw new Error("Unsupported editor operation.");
  return bridge.request({ type: payload.type, uri: payload.uri });
});

app.whenReady().then(async () => {
  win = new BrowserWindow({ show: !smoke, width: 1500, height: 1000, backgroundColor: "#0b0f17", webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: !smoke, offscreen: smoke } });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.on("will-prevent-unload", event => {
    const choice = dialog.showMessageBoxSync(win, { type: "question", buttons: ["Keep editing", "Discard and close"], defaultId: 0, cancelId: 0, message: "There are unsaved edits." });
    if (choice === 1) event.preventDefault();
  });
  if (devUrl) await win.loadURL(devUrl);
  else await win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  if (smoke) {
    try {
      const result = await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, "..", "test", "renderer-smoke.js"), "utf8"));
      if (result.ok) {
          result.checks.push(...require("../test/pairing-smoke.cjs")(runtime));
        const syncChecks = await require("../test/editor-sync-smoke.cjs")(win, runtime);
        result.checks.push(...syncChecks);
        const expected = fs.readFileSync(path.join(runtime, "smoke-input.js"), "utf8");
        if (fs.readFileSync(path.join(runtime, "smoke-saved.js"), "utf8") !== expected) throw new Error("Saved source differs from opened source");
        result.checks.push("actual saved file matches original source exactly");
        result.checks.push(...await require("../test/workspace-smoke.cjs")(win, runtime));
      }
      fs.writeFileSync(path.join(runtime, "smoke-result.json"), JSON.stringify(result, null, 2));
      await new Promise(resolve => setTimeout(resolve, 300));
      const screenshot = await win.webContents.capturePage();
      fs.writeFileSync(path.join(runtime, "smoke.png"), screenshot.toPNG());
      if (smokePairingCode && clipboard.readText() === smokePairingCode) clipboard.writeText(previousClipboard);
      app.exit(result.ok ? 0 : 1);
    } catch (error) {
      fs.writeFileSync(path.join(runtime, "smoke-result.json"), JSON.stringify({ ok: false, error: error.stack }));
      if (smokePairingCode && clipboard.readText() === smokePairingCode) clipboard.writeText(previousClipboard);
      app.exit(1);
    }
  }
}).catch(error => { console.error(error); app.exit(1); });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => { watcher.stop(); bridge.stop(); });
