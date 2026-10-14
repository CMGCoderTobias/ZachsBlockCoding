const fs = require("fs");

class PairingStore {
  constructor(file, encryption) { this.file = file; this.encryption = encryption; }
  available() {
    return this.encryption.isEncryptionAvailable() && this.encryption.getSelectedStorageBackend?.() !== "basic_text";
  }
  load() {
    if (!fs.existsSync(this.file)) return null;
    if (!this.available()) throw new Error("Secure credential storage is unavailable. Forget pairing to reconnect manually.");
    const value = JSON.parse(this.encryption.decryptString(fs.readFileSync(this.file)));
    if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535 || !/^[a-f0-9]{64}$/.test(value.token)) throw new Error("Invalid saved pairing. Forget pairing and pair again.");
    return value;
  }
  save(value) {
    if (!this.available()) return false;
    fs.writeFileSync(this.file, this.encryption.encryptString(JSON.stringify(value)), { mode: 0o600 });
    return true;
  }
  forget() { fs.rmSync(this.file, { force: true }); }
}

module.exports = { PairingStore };
