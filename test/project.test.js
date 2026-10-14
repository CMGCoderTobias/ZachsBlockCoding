import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FolderStore } from "../electron/folderStore.cjs";
import { FileStore } from "../electron/fileStore.cjs";

test("folder listing is lazy, bounded to the selected real root, and skips dependency folders", () => {
  const directory = fs.mkdtempSync(path.resolve("test/.tmp-project-"));
  try {
    const root = path.join(directory, "project");
    fs.mkdirSync(root);
    for (const name of ["src", "node_modules", ".git"]) fs.mkdirSync(path.join(root, name));
    fs.writeFileSync(path.join(root, "src", "one.js"), 'one();');
    fs.writeFileSync(path.join(directory, "outside.js"), 'secret();');
    const folders = new FolderStore();
    assert.deepEqual(folders.open(root).entries.map(entry => entry.name), ["src"]);
    assert.deepEqual(folders.list("src").entries.map(entry => entry.name), ["one.js"]);
    assert.throws(() => folders.resolve("../outside.js"), /outside/);
    assert.throws(() => folders.resolve(path.join(directory, "outside.js")), /relative/);
    fs.symlinkSync(directory, path.join(root, "escape"), "junction");
    assert.throws(() => folders.resolve("escape/outside.js"), /outside/);
    assert.ok(!folders.list("").entries.some(entry => entry.name === "escape"));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("multiple file capabilities survive activation and independent conflict checks", () => {
  const directory = fs.mkdtempSync(path.resolve("test/.tmp-project-"));
  try {
    const first = path.join(directory, "one.js");
    const second = path.join(directory, "two.js");
    fs.writeFileSync(first, 'one();'); fs.writeFileSync(second, 'two();');
    const store = new FileStore();
    const one = store.open(first);
    const two = store.open(second);
    assert.throws(() => store.save({ token: null, source: 'overwriteOne();' }, first), /another tab/);
    assert.equal(store.open(first).token, one.token);
    assert.equal(store.activate(two.token).source, 'two();');
    store.save({ token: one.token, source: 'changedOne();', baseHash: one.hash });
    fs.writeFileSync(second, 'external();');
    assert.throws(() => store.save({ token: two.token, source: 'badOverwrite();', baseHash: two.hash }), /outside/);
    assert.equal(store.readExternal(one.token).source, 'changedOne();');
    store.close(one.token);
    assert.throws(() => store.readExternal(one.token), /no longer active/);
    assert.equal(store.readExternal(two.token).source, 'external();');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
