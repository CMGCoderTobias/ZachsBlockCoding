import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { EditorBridge } from "../electron/editorBridge.cjs";
import { PairingStore } from "../electron/pairingStore.cjs";
import { channel } from "../vscode-extension/protocol.cjs";

test("remembered pairing resumes on the same endpoint and authenticates without transmitting the secret", async () => {
  let saved;
  const store = { load: () => saved, save: value => { saved = value; return true; } };
  const bridge = new EditorBridge(() => {}, store);
  let socket;
  async function authenticate(code, wrong = false) {
    const [, port, token] = code.split(":");
    socket = net.createConnection({ host: "127.0.0.1", port: Number(port) });
    const nonce = crypto.randomBytes(32).toString("hex");
    const proof = text => crypto.createHmac("sha256", token).update(text).digest("hex");
    let accept;
    const completion = new Promise(resolve => { accept = resolve; });
    const send = channel(socket, message => {
      assert.ok(!JSON.stringify(message).includes(token));
      if (message.type === "challenge") {
        assert.equal(message.proof, proof(`server:${nonce}:${message.nonce}`));
        send({ type: "authenticate", proof: wrong ? "0".repeat(64) : proof(`client:${nonce}:${message.nonce}`) });
      }
      if (message.type === "ready") accept(message);
    });
    socket.on("close", () => accept(null));
    await once(socket, "connect");
    send({ type: "hello", protocol: 2, nonce });
    return completion;
  }
  try {
    const { code } = await bridge.start();
    assert.equal(await authenticate(code, true), null);
    assert.equal(saved, undefined);
    assert.equal((await authenticate(code)).remember, true);
    const closing = once(socket, "close"); socket.destroy(); await closing;
    bridge.stop();
    assert.equal((await bridge.start()).code, code);
    assert.equal((await authenticate(code)).protocol, 2);
  } finally { socket?.destroy(); bridge.stop(); }
});

test("pairing persistence requires secure storage and forget removes its file", () => {
  const file = path.resolve('.zbc-runtime', `pairing-test-${crypto.randomUUID()}.bin`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let secure = true;
  const key = crypto.randomBytes(32);
  const encryption = {
    isEncryptionAvailable: () => secure,
    getSelectedStorageBackend: () => secure ? "test_encryption" : "basic_text",
    encryptString: value => {
      const nonce = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
      const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
    },
    decryptString: value => {
      const cipher = crypto.createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
      cipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString();
    },
  };
  const store = new PairingStore(file, encryption);
  const pairing = { port: 12345, token: crypto.randomBytes(32).toString("hex") };
  try {
    assert.equal(store.save(pairing), true);
    assert.ok(!fs.readFileSync(file).includes(pairing.token));
    assert.deepEqual(store.load(), pairing);
    secure = false;
    assert.throws(() => store.load(), /Secure credential/);
    assert.equal(store.save(pairing), false);
    store.forget();
    assert.equal(fs.existsSync(file), false);
  } finally { store.forget(); }
});
