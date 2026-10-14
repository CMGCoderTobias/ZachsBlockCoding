const vscode = require("vscode");
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { EditorBridge } = require("../electron/editorBridge.cjs");

exports.run = async () => {
  const directory = process.env.ZBC_TEST_DIR;
  if (!directory || !path.isAbsolute(directory)) throw new Error("Set an absolute ZBC_TEST_DIR for isolated extension testing.");
  const checks = [];
  let pairing;
  const bridge = new EditorBridge(() => {}, { load: () => pairing, save: value => { pairing = value; return true; } });
  async function until(condition, label) {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (condition()) { checks.push(label); return; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(label + " timed out");
  }
  try {
    const extension = vscode.extensions.getExtension("zachsblockcoding.zachsblockcoding-connector");
    assert.ok(extension, "Connector is registered in the extension host");
    await extension.activate();
    checks.push("connector activates in real VS Code extension host");
    const file = path.join(directory, "connected.js");
    fs.writeFileSync(file, "const value = 1;\n");
    const document = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(document);
    const uri = document.uri.toString();
    const { code } = await bridge.start();
    await vscode.commands.executeCommand("zachsblockcoding.connect", code);
    await until(() => bridge.documents.has(uri), "actual VS Code shares selected document after authentication");
    const originalVersion = document.version;
    const result = await bridge.edit({ uri, version: originalVersion, text: "const value = 2;\n" });
    assert.equal(result.ok, true, result.error);
    assert.equal(document.getText(), "const value = 2;\n");
    assert.equal(document.isDirty, true);
    assert.equal(fs.readFileSync(file, "utf8"), "const value = 1;\n");
    checks.push("bridge edit changes unsaved VS Code buffer without writing disk");
    await vscode.commands.executeCommand("undo");
    await until(() => document.getText() === "const value = 1;\n" && bridge.documents.get(uri)?.text === document.getText(), "VS Code undo is reflected back through connector");
    assert.equal((await bridge.edit({ uri, version: originalVersion, text: "stale();" })).ok, false);
    checks.push("stale block edit is rejected after VS Code undo");
    await editor.edit(builder => builder.replace(new vscode.Range(document.positionAt(14), document.positionAt(15)), "3"));
    await until(() => bridge.documents.get(uri)?.text === "const value = 3;\n", "manual editor buffer change is shared before saving");
    assert.equal((await bridge.request({ type: "save", uri })).ok, true);
    assert.equal(fs.readFileSync(file, "utf8"), "const value = 3;\n");
    checks.push("Save is delegated to actual VS Code");
    const second = path.join(directory, "second.js");
    fs.writeFileSync(second, "const second = true;\n");
    const secondDocument = await vscode.workspace.openTextDocument(second);
    await vscode.window.showTextDocument(secondDocument);
    await until(() => bridge.documents.has(secondDocument.uri.toString()), "switching VS Code files shares a second document");
    assert.equal((await bridge.request({ type: "focus", uri })).ok, true);
    checks.push("standalone tab can request focus of an already shared VS Code document");
    bridge.stop();
    await new Promise(resolve => setTimeout(resolve, 250));
    await bridge.start();
    await until(() => bridge.documents.has(uri), "paired connector reconnects automatically after app listener restarts");
    await vscode.commands.executeCommand("zachsblockcoding.disconnect");
    await until(() => bridge.documents.size === 0, "disconnect releases bridge state without closing documents");
    assert.equal(document.isClosed, false);
    await vscode.commands.executeCommand("zachsblockcoding.forget");
    fs.writeFileSync(path.join(directory, "vscode-result.json"), JSON.stringify({ ok: true, checks }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(directory, "vscode-result.json"), JSON.stringify({ ok: false, checks, error: error.stack }, null, 2));
    throw error;
  } finally { bridge.stop(); }
};
