import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import { EditorBridge } from "../electron/editorBridge.cjs";
import { channel, textEdit } from "../vscode-extension/protocol.cjs";

test("live bridge authenticates, sends minimal versioned edits, rejects stale writes and releases pending work", async () => {
  const events = [];
  const bridge = new EditorBridge(event => events.push(event));
  let socket;
  try {
    const { code } = await bridge.start();
    const [, port, token] = code.split(":");
    const bad = net.createConnection({ host: '127.0.0.1', port: Number(port) });
    await once(bad, 'connect');
    bad.write(JSON.stringify({ type: 'hello', protocol: 1, token: '0'.repeat(64) }) + '\n');
    await once(bad, 'close');
    assert.equal(bridge.send, null);
    socket = net.createConnection({ host: '127.0.0.1', port: Number(port) });
    const messages = [];
    const send = channel(socket, message => messages.push(message));
    await once(socket, 'connect');
    send({ type: 'hello', protocol: 1, token });
    async function until(check) {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (check()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.fail('Bridge condition timed out');
    }
    await until(() => messages.some(message => message.type === 'ready'));
    const document = { uri: 'file:///D:/example.js', name: 'D:/example.js', languageId: 'javascript', version: 1, text: 'const value = 1;', dirty: false };
    send({ type: 'snapshot', ...document });
    await until(() => bridge.documents.has(document.uri));
    assert.equal((await bridge.edit({ uri: document.uri, version: 0, text: 'wrong();' })).ok, false);
    const edit = bridge.edit({ uri: document.uri, version: 1, text: 'const value = 2;' });
    await until(() => messages.some(message => message.type === 'edit'));
    const request = messages.find(message => message.type === 'edit');
    assert.equal(request.text, '2');
    assert.equal(request.start, 14);
    assert.equal(request.baseVersion, 1);
    send({ type: 'result', requestId: request.requestId, ok: true, document: { ...document, version: 2, text: 'const value = 2;', dirty: true } });
    assert.equal((await edit).ok, true);
    const waiting = bridge.request({ type: 'save', uri: document.uri });
    socket.destroy();
    assert.equal((await waiting).ok, false);
    await until(() => events.some(event => event.type === 'disconnected'));
    assert.equal(bridge.documents.size, 0);
  } finally { socket?.destroy(); bridge.stop(); }
});

test("minimal text edits preserve UTF-16 offsets and unchanged suffixes", () => {
  for (const [before, after] of [['abc', 'axc'], ['', 'hello'], ['hello', ''], ['😀value', '😀other'], ['😀', '😁'], ['😀😀', '😀😁'], ['same', 'same']]) {
    const edit = textEdit(before, after);
    assert.equal(before.slice(0, edit.start) + edit.text + before.slice(edit.end), after);
  }
});
