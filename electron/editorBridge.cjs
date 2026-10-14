const net = require("net");
const crypto = require("crypto");
const { channel, validateSnapshot, textEdit, MAX_SOURCE } = require("../vscode-extension/protocol.cjs");

class EditorBridge {
  constructor(notify, pairingStore = null) {
    this.pairingStore = pairingStore;
    this.notify = notify;
    this.server = null;
    this.sockets = new Set();
    this.documents = new Map();
    this.pending = new Map();
    this.send = null;
  }
  async start() {
    if (this.server?.listening) return { code: `zbc1:${this.server.address().port}:${this.token}` };
    this.stop();
    const remembered = this.pairingStore?.load();
    const token = remembered?.token || crypto.randomBytes(32).toString("hex");
    this.token = token;
    const server = net.createServer(socket => {
      if (this.sockets.size >= 4 || this.send) { socket.destroy(); return; }
      this.sockets.add(socket);
      let authenticated = false;
      let clientNonce;
      let serverNonce;
      const proof = text => crypto.createHmac("sha256", token).update(text).digest("hex");
      const equal = (left, right) => typeof left === "string" && /^[a-f0-9]{64}$/.test(left) && crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
      const timeout = setTimeout(() => socket.destroy(), 5000);
      const send = channel(socket, message => {
        if (!authenticated) {
          if (this.send) { socket.destroy(); return; }
          if (message.type === "hello" && message.protocol === 2 && /^[a-f0-9]{64}$/.test(message.nonce)) {
            clientNonce = message.nonce;
            serverNonce = crypto.randomBytes(32).toString("hex");
            send({ type: "challenge", nonce: serverNonce, proof: proof(`server:${clientNonce}:${serverNonce}`) });
            return;
          }
          const modern = message.type === "authenticate" && clientNonce && equal(message.proof, proof(`client:${clientNonce}:${serverNonce}`));
          const legacy = !this.pairingStore && message.type === "hello" && message.protocol === 1 && equal(message.token, token);
          if (!modern && !legacy) { socket.destroy(); return; }
          authenticated = true;
          clearTimeout(timeout);
          clearTimeout(this.expiry);
          this.send = send;
          let remember = false;
          try { remember = !!this.pairingStore?.save({ port: server.address().port, token }); }
          catch { this.notify({ type: "pairing-warning", message: "Connected for this session, but secure pairing could not be saved." }); }
          if (this.pairingStore && !remember) this.notify({ type: "pairing-warning", message: "Connected for this session only; secure pairing storage is unavailable." });
          send({ type: "ready", protocol: modern ? 2 : 1, remember });
          this.notify({ type: "connected" });
          return;
        }
        if (message.type === "snapshot") {
          const document = validateSnapshot(message);
          if (!this.documents.has(document.uri) && this.documents.size >= 20) throw new Error("Document limit exceeded");
          const previous = this.documents.get(document.uri);
          if (previous && document.version < previous.version) return;
          this.documents.set(document.uri, document);
          this.notify({ type: "snapshot", document, active: !!message.active });
        } else if (message.type === "unavailable") {
          this.notify({ type: "unavailable", message: String(message.message || "No supported active editor").slice(0, 500) });
        } else if (message.type === "closed") {
          this.documents.delete(message.uri);
          this.notify({ type: "closed", uri: message.uri });
        } else if (message.type === "result") {
          const request = this.pending.get(message.requestId);
          if (!request) return;
          clearTimeout(request.timer);
          this.pending.delete(message.requestId);
          if (message.document) {
            const document = validateSnapshot(message.document);
            if (document.uri !== request.uri) throw new Error("Unexpected reply document");
            this.documents.set(document.uri, document);
            this.notify({ type: "snapshot", document });
          }
          request.resolve({ ok: message.ok === true, error: message.error, document: message.document });
        }
      });
      socket.on("error", () => {});
      socket.on("close", () => {
        clearTimeout(timeout);
        this.sockets.delete(socket);
        if (authenticated && this.send === send) {
          this.send = null;
          if (!this.pairingStore) { this.server?.close(); this.server = null; }
          clearTimeout(this.expiry);
          for (const peer of this.sockets) peer.destroy();
          this.sockets.clear();
          this.documents.clear();
          for (const request of this.pending.values()) { clearTimeout(request.timer); request.resolve({ ok: false, error: "VS Code disconnected. Your local text is preserved." }); }
          this.pending.clear();
          this.notify({ type: "disconnected" });
        }
      });
    });
    this.server = server;
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(remembered?.port || 0, "127.0.0.1", resolve);
    });
    if (!remembered) {
      this.expiry = setTimeout(() => { if (!this.send) this.stop(); }, 10 * 60 * 1000);
      this.expiry.unref();
    }
    return { code: `zbc1:${server.address().port}:${token}` };
  }
  request(message) {
    if (!this.send || !this.documents.has(message.uri)) return Promise.resolve({ ok: false, error: "This document is not connected to VS Code." });
    if ([...this.pending.values()].some(request => request.uri === message.uri)) return Promise.resolve({ ok: false, error: "Wait for the previous VS Code edit to finish." });
    const requestId = crypto.randomUUID();
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ ok: false, error: "VS Code did not acknowledge the edit. Reload the VS Code version before retrying." });
      }, 10000);
      this.pending.set(requestId, { resolve, timer, uri: message.uri });
      this.send({ ...message, requestId });
    });
  }
  edit({ uri, version, text }) {
    const document = this.documents.get(uri);
    if (!document || document.version !== version) return Promise.resolve({ ok: false, error: "VS Code changed. Reload its version before applying this edit.", document });
    if (typeof text !== "string" || Buffer.byteLength(text) > MAX_SOURCE) throw new Error("Document exceeds the 1 MB limit.");
    return this.request({ type: "edit", uri, baseVersion: version, ...textEdit(document.text, text) });
  }
  stop() {
    clearTimeout(this.expiry);
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    this.server?.close();
    this.server = null;
    this.send = null;
    this.documents.clear();
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.resolve({ ok: false, error: "VS Code connection closed. Local text was kept." }); }
    this.pending.clear();
    this.notify({ type: "disconnected" });
  }
}

module.exports = { EditorBridge };
