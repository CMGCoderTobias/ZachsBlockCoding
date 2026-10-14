import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FileStore } from "../electron/fileStore.cjs";
import { FileWatcher } from "../electron/fileWatcher.cjs";

test("external reads do not advance the save baseline; acknowledged versions can be saved", () => {
  const directory = fs.mkdtempSync(path.resolve("test/.tmp-storage-"));
  try {
    const file = path.join(directory, "shared.js");
    fs.writeFileSync(file, 'const original = 1;');
    const store = new FileStore();
    const opened = store.open(file);
    fs.writeFileSync(file, 'const external = 2;');
    const update = store.readExternal(opened.token);
    assert.equal(store.current.hash, opened.hash);
    assert.throws(() => store.save({ token: opened.token, baseHash: opened.hash, source: 'const mine = 3;' }), /outside/);
    assert.throws(() => store.save({ token: null, baseHash: opened.hash, source: 'const mine = 3;' }, file), /different Save As/);
    store.save({ token: opened.token, baseHash: update.hash, source: 'const combined = 4;' });
    assert.equal(fs.readFileSync(file, 'utf8'), 'const combined = 4;');
    assert.throws(() => store.readExternal('wrong'), /no longer active/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("one-file watcher reports changes and deletion, deduplicates, and releases its listener", async () => {
  const directory = fs.mkdtempSync(path.resolve("test/.tmp-storage-"));
  const store = new FileStore();
  const updates = [];
  const watcher = new FileWatcher(store, update => updates.push(update));
  try {
    const file = path.join(directory, "shared.js");
    fs.writeFileSync(file, 'one();');
    store.open(file);
    watcher.start();
    fs.writeFileSync(file, 'externalChange();');
    for (let attempt = 0; attempt < 40 && !updates.length; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(updates[0]?.source, 'externalChange();');
    watcher.listener();
    assert.equal(updates.length, 1);
    fs.unlinkSync(file);
    watcher.listener();
    assert.ok(updates[1].error);
    fs.writeFileSync(file, 'externalChange();');
    watcher.listener();
    assert.equal(updates[2].source, 'externalChange();');
    watcher.stop();
    assert.equal(watcher.file, null);
    assert.equal(watcher.listener, null);
  } finally { watcher.stop(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test("disk round-trip, bounded backup, stale sidecar and external edit protection", () => {
  const directory = fs.mkdtempSync(path.resolve("test/.tmp-storage-"));
  try {
    const file = path.join(directory, "example.js");
    const original = '\uFEFF// comment\r\nconsole.log("Hi");\r\n';
    fs.writeFileSync(file, original);
    const store = new FileStore();
    const opened = store.open(file);
    assert.equal(opened.source, original);
    store.save({ token: opened.token, source: original, layout: { 0: { x: 40, y: 30 } } });
    assert.equal(fs.readFileSync(file, "utf8"), original);
    assert.equal(fs.readFileSync(file + ".zbc.backup", "utf8"), original);
    const again = store.open(file);
    assert.deepEqual(again.layout, { 0: { x: 40, y: 30 } });
    fs.writeFileSync(file, "// external edit\n");
    assert.throws(() => store.save({ token: again.token, source: "overwritten" }), /outside/);
    assert.equal(fs.readFileSync(file, "utf8"), "// external edit\n");
    assert.deepEqual(store.open(file).layout, {});
    assert.throws(() => store.save({ token: "invalid", source: "" }), /no longer active/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
