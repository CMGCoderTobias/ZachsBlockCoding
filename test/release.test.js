import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { installationRoot, runtimeDirectory } from "../electron/runtimePaths.cjs";
import { reportHealth } from "../electron/updateHealth.cjs";

test("packaged storage stays outside install and managed versions on the same drive", () => {
  const base = path.resolve("test-install", "ZachsBlockCoding");
  const options = { packaged: true, projectRoot: "unused", username: "Zach" };
  const original = runtimeDirectory({ ...options, executable: path.join(base, "ZachsBlockCoding.exe") });
  const managed = runtimeDirectory({ ...options, executable: path.join(base, ".reborn", "versions", "0.1.1", "ZachsBlockCoding.exe") });
  assert.equal(original, managed);
  assert.equal(path.parse(original).root, path.parse(base).root);
  assert.ok(!original.startsWith(base + path.sep));
  assert.equal(installationRoot(path.join(base, "ZachsBlockCoding.exe")), base);
});

test("development and explicit data paths remain unchanged", () => {
  const projectRoot = path.resolve("test-project");
  assert.equal(runtimeDirectory({ packaged: false, projectRoot }), path.join(projectRoot, ".zbc-runtime"));
  assert.equal(runtimeDirectory({ packaged: true, override: "custom-data" }), path.resolve("custom-data"));
});

test("health reporting uses exact managed identity and is nonfatal", async () => {
  const environment = { REBORN_APP_ID: "zachsblockcoding", REBORN_APP_VERSION: "0.1.0", REBORN_UPDATE_AGENT_EXE: path.resolve("agent.exe") };
  let calls = 0;
  const execute = (file, args, options, done) => {
    calls++;
    assert.equal(file, environment.REBORN_UPDATE_AGENT_EXE);
    assert.deepEqual(args, ["health", "--app", "zachsblockcoding", "--version", "0.1.0"]);
    assert.equal(options.windowsHide, true);
    assert.equal(options.timeout, 15000);
    done(new Error("offline"));
  };
  assert.equal((await reportHealth({}, execute)).managed, false);
  assert.equal((await reportHealth({ ...environment, REBORN_APP_ID: "another-app" }, execute)).managed, false);
  assert.equal((await reportHealth(environment, execute)).error, "offline");
  assert.equal(calls, 1);
});
