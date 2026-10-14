const vscode = require("vscode");
const net = require("net");
const crypto = require("crypto");
const { channel, MAX_SOURCE } = require("./protocol.cjs");

let disconnect = () => {};

function activate(context) {
  let socket;
  let send;
  let ready = false;
  let applying = null;
  let queue = Promise.resolve();
  let reconnectTimer;
  let retry = 0;
  let rememberedCode;
  let paused = false;
  const pairingKey = "pairing:" + crypto.createHash("sha256").update(vscode.workspace.workspaceFile?.toString() || vscode.workspace.workspaceFolders?.map(folder => folder.uri.toString()).join("|") || "empty-window").digest("hex");
  const documents = new Map();
  const timers = new Map();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10);
  status.text = "$(debug-disconnect) ZachsBlocks";
  status.command = "zachsblockcoding.connect";
  status.tooltip = "Connect to the standalone block editor";
  status.show();

  function snapshot(document) {
    return { uri: document.uri.toString(), name: document.fileName, languageId: document.languageId,
      version: document.version, text: document.getText(), dirty: document.isDirty };
  }
  function eligible(document) {
    return document && !document.isClosed && ["file", "untitled"].includes(document.uri.scheme)
      && ["javascript", "javascriptreact"].includes(document.languageId) && Buffer.byteLength(document.getText()) <= MAX_SOURCE;
  }
  function share(document, active = false) {
    if (!ready) return;
    if (!document) { if (active) send({ type: "unavailable", message: "No active text editor in VS Code. Select a JavaScript/JSX file." }); return; }
    if (!eligible(document)) {
      if (active) send({ type: "unavailable", message: `No blocks for ${document.languageId}: supported files are local JavaScript/JSX up to 1 MB.` });
      if (documents.delete(document.uri.toString())) send({ type: "closed", uri: document.uri.toString() });
      return;
    }
    const uri = document.uri.toString();
    if (!documents.has(uri) && documents.size >= 20) {
      void vscode.window.showWarningMessage("ZachsBlockCoding supports 20 shared files. Disconnect and reconnect to start a new set.");
      return;
    }
    documents.set(uri, document);
    if (applying !== uri) send({ type: "snapshot", ...snapshot(document), active });
  }
  function closeConnection() {
    clearTimeout(reconnectTimer);
    ready = false;
    socket?.destroy();
    socket = null;
    send = null;
    documents.clear();
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    status.text = "$(debug-disconnect) ZachsBlocks";
    status.command = "zachsblockcoding.connect";
  }
  disconnect = () => { paused = true; closeConnection(); };
  function retryConnection() {
    if (paused || !rememberedCode || !vscode.workspace.isTrusted || vscode.env.remoteName) return;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(retry++, 5));
    status.text = "$(sync) ZachsBlocks waiting";
    status.tooltip = "Waiting for the paired standalone app. Reconnect retries are limited to once every 30 seconds.";
    reconnectTimer = setTimeout(() => connect(rememberedCode, true), delay);
  }
  function connect(code, automatic = false) {
    const match = /^zbc1:(\d{1,5}):([a-f0-9]{64})$/.exec(code.trim());
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) {
      if (!automatic) void vscode.window.showErrorMessage("Invalid ZachsBlockCoding pairing code.");
      return;
    }
    closeConnection();
    paused = false;
    const activeSocket = net.createConnection({ host: "127.0.0.1", port: Number(match[1]) });
    socket = activeSocket;
    const nonce = crypto.randomBytes(32).toString("hex");
    const proof = text => crypto.createHmac("sha256", match[2]).update(text).digest("hex");
    let verified = false;
    status.text = "$(sync~spin) ZachsBlocks connecting";
    const transmit = channel(activeSocket, message => {
      if (socket !== activeSocket) return;
      if (message.type === "challenge" && /^[a-f0-9]{64}$/.test(message.nonce)) {
        const expected = proof(`server:${nonce}:${message.nonce}`);
        if (typeof message.proof !== "string" || !/^[a-f0-9]{64}$/.test(message.proof)
          || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(message.proof))) {
          paused = true;
          activeSocket.destroy(new Error("Pairing identity changed. Pair again; no document was shared."));
          return;
        }
        verified = true;
        transmit({ type: "authenticate", proof: proof(`client:${nonce}:${message.nonce}`) });
      } else if (message.type === "ready" && message.protocol === 2 && verified) {
        ready = true;
        retry = 0;
        activeSocket.setTimeout(0);
        status.text = "$(plug) ZachsBlocks connected";
        status.command = "zachsblockcoding.disconnect";
        if (message.remember) {
          rememberedCode = code.trim();
          void context.secrets.store(pairingKey, rememberedCode).catch(() => {
            rememberedCode = null;
            void vscode.window.showWarningMessage("Connected, but VS Code could not securely remember the pairing.");
          });
        } else { rememberedCode = null; void context.secrets.delete(pairingKey); }
        share(vscode.window.activeTextEditor?.document, true);
      } else queue = queue.then(() => handle(message, activeSocket, transmit)).catch(() => activeSocket.destroy());
    });
    send = transmit;
    activeSocket.setTimeout(5000, () => activeSocket.destroy(new Error("Pairing timed out.")));
    activeSocket.on("connect", () => transmit({ type: "hello", protocol: 2, nonce }));
    activeSocket.on("error", error => { if (!automatic || paused) void vscode.window.showWarningMessage(`ZachsBlockCoding: ${error.message}`); });
    activeSocket.on("close", () => {
      if (socket !== activeSocket) return;
      closeConnection();
      retryConnection();
    });
  }
  async function handle(message, activeSocket, transmit) {
    if (socket !== activeSocket || !ready || !["edit", "save", "focus"].includes(message.type)) return;
    const document = documents.get(message.uri);
    if (!eligible(document)) { transmit({ type: "result", requestId: message.requestId, ok: false, error: "Share this open JavaScript document first." }); return; }
    clearTimeout(timers.get(message.uri));
    timers.delete(message.uri);
    applying = message.uri;
    try {
      let ok = true;
      if (message.type === "edit") {
        if (document.version !== message.baseVersion) throw new Error("Document changed while the block edit was in flight.");
        const original = document.getText();
        if (!Number.isInteger(message.start) || !Number.isInteger(message.end) || message.start < 0 || message.end < message.start || message.end > original.length || typeof message.text !== "string"
          || Buffer.byteLength(original.slice(0, message.start) + message.text + original.slice(message.end)) > MAX_SOURCE) throw new Error("Invalid text edit.");
        const editor = await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });
        if (document.version !== message.baseVersion) throw new Error("Document changed before the edit could be applied.");
        ok = await editor.edit(builder => builder.replace(new vscode.Range(document.positionAt(message.start), document.positionAt(message.end)), message.text), { undoStopBefore: true, undoStopAfter: true });
      } else if (message.type === "save") ok = await document.save();
      else await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });
      transmit({ type: "result", requestId: message.requestId, ok, error: ok ? undefined : "VS Code could not apply this operation.", document: snapshot(document) });
    } catch (error) {
      transmit({ type: "result", requestId: message.requestId, ok: false, error: error.message, document: snapshot(document) });
    } finally { applying = null; }
  }
  context.subscriptions.push(status,
    vscode.commands.registerCommand("zachsblockcoding.connect", async suppliedCode => {
      if (!vscode.workspace.isTrusted || vscode.env.remoteName) { void vscode.window.showWarningMessage("Use a trusted, local VS Code window. Remote/WSL connections are not supported yet."); return; }
      if (!suppliedCode && rememberedCode) { connect(rememberedCode); return; }
      const code = typeof suppliedCode === "string" ? suppliedCode : await vscode.window.showInputBox({ title: "Connect to ZachsBlockCoding", prompt: "Paste the app pairing code. This trusted local pairing will be remembered securely for this workspace. Use Forget Pairing to revoke it.", password: true, ignoreFocusOut: true });
      if (!code) return;
      connect(code);
    }),
    vscode.commands.registerCommand("zachsblockcoding.share", () => {
      if (!ready) { void vscode.window.showWarningMessage("Connect to ZachsBlockCoding first."); return; }
      const document = vscode.window.activeTextEditor?.document;
      if (!eligible(document)) { void vscode.window.showWarningMessage("Select a JavaScript file up to 1 MB."); return; }
      share(document, true);
    }),
    vscode.commands.registerCommand("zachsblockcoding.disconnect", () => disconnect()),
    vscode.commands.registerCommand("zachsblockcoding.forget", async () => {
      disconnect();
      rememberedCode = null;
      await context.secrets.delete(pairingKey);
      void vscode.window.showInformationMessage("VS Code forgot this pairing. Use Forget Pairing in the standalone app too to revoke its credential.");
    }),
    vscode.window.onDidChangeActiveTextEditor(editor => share(editor?.document, true)),
    vscode.workspace.onDidChangeTextDocument(event => {
      const uri = event.document.uri.toString();
      if (!ready || !documents.has(uri) || applying === uri) return;
      clearTimeout(timers.get(uri));
      timers.set(uri, setTimeout(() => { timers.delete(uri); share(event.document); }, 120));
    }),
    vscode.workspace.onDidSaveTextDocument(document => { if (documents.has(document.uri.toString())) share(document); }),
    vscode.workspace.onDidCloseTextDocument(document => {
      const uri = document.uri.toString();
      clearTimeout(timers.get(uri)); timers.delete(uri);
      if (documents.delete(uri) && ready) send({ type: "closed", uri });
    }),
    { dispose: () => disconnect() });
  void context.secrets.get(pairingKey).then(code => {
    if (socket || paused || !code || !vscode.workspace.isTrusted || vscode.env.remoteName) return;
    rememberedCode = code;
    connect(code, true);
  }).catch(() => { status.tooltip = "Saved pairing could not be read. Connect manually or use Forget Pairing."; });
}

function deactivate() { disconnect(); }
module.exports = { activate, deactivate };
