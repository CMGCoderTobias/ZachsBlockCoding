const fs = require("fs");

class FileWatcher {
  constructor(store, notify) {
    this.store = store;
    this.notify = notify;
    this.file = null;
    this.listener = null;
  }
  start() {
    this.stop();
    const current = this.store.current;
    if (!current) return;
    const { file, token, hash } = current;
    this.file = file;
    let lastHash = hash;
    let lastError = null;
    this.listener = () => {
      if (this.store.current?.token !== token) return;
      try {
        const update = this.store.readExternal(token);
        if (update.hash !== lastHash || lastError) {
          lastHash = update.hash;
          lastError = null;
          this.notify(update);
        }
      } catch (error) {
        if (lastError !== error.message) {
          lastError = error.message;
          this.notify({ token, error: `Cannot read the shared file: ${error.message}. Your editor buffer is preserved.` });
        }
      }
    };
    fs.watchFile(file, { interval: 1000, persistent: false }, this.listener);
  }
  stop() {
    if (this.file && this.listener) fs.unwatchFile(this.file, this.listener);
    this.file = null;
    this.listener = null;
  }
}

module.exports = { FileWatcher };
