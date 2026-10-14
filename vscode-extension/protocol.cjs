const MAX_SOURCE = 1024 * 1024;
const MAX_FRAME = 8 * MAX_SOURCE;

function channel(socket, receive) {
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", chunk => {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > MAX_FRAME) { socket.destroy(); return; }
    let boundary;
    while ((boundary = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 1);
      try { receive(JSON.parse(line)); } catch { socket.destroy(); return; }
    }
  });
  return message => {
    const encoded = JSON.stringify(message) + "\n";
    if (Buffer.byteLength(encoded) > MAX_FRAME || socket.writableLength > MAX_FRAME) { socket.destroy(); return false; }
    if (socket.destroyed) return false;
    socket.write(encoded);
    return true;
  };
}

function validateSnapshot(message) {
  if (!message || typeof message.uri !== "string" || message.uri.length > 4096
    || !/^(file|untitled):/.test(message.uri) || typeof message.text !== "string"
    || Buffer.byteLength(message.text) > MAX_SOURCE || !Number.isSafeInteger(message.version) || message.version < 1
    || !["javascript", "javascriptreact"].includes(message.languageId)) throw new Error("Invalid document snapshot");
  return { uri: message.uri, name: typeof message.name === "string" ? message.name.slice(0, 4096) : message.uri,
    text: message.text, version: message.version, dirty: !!message.dirty, languageId: message.languageId };
}

function textEdit(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = before.length;
  let tail = after.length;
  while (end > start && tail > start && before[end - 1] === after[tail - 1]) { end--; tail--; }
  if (start > 0 && /[\uDC00-\uDFFF]/.test(before[start] || after[start] || "")) start--;
  if (end < before.length && /[\uDC00-\uDFFF]/.test(before[end])) { end++; tail++; }
  return { start, end, text: after.slice(start, tail) };
}

module.exports = { channel, validateSnapshot, textEdit, MAX_SOURCE };
