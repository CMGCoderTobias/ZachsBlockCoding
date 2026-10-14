const { safeStorage } = require("electron");
const { PairingStore } = require("../electron/pairingStore.cjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

module.exports = runtime => {
  const file = path.join(runtime, `pairing-smoke-${crypto.randomUUID()}.bin`);
  const store = new PairingStore(file, safeStorage);
  const value = { port: 12345, token: crypto.randomBytes(32).toString("hex") };
  try {
    if (!store.save(value)) throw new Error("OS-backed pairing encryption unavailable on this test host.");
    if (fs.readFileSync(file).includes(value.token) || store.load().token !== value.token) throw new Error("Pairing credential encryption failed.");
    store.forget();
    if (fs.existsSync(file)) throw new Error("Forget pairing did not remove saved credential.");
    return ["actual Electron secure storage encrypts, restores and forgets a pairing credential"];
  } finally { store.forget(); }
};
