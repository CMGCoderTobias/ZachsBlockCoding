import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as Blockly from "blockly";
import { parseSource, parseEditableSource, printModel, printNode, visitNodes, replaceSourceRange } from "../src/core/sourceModel.js";
import { registerSourceBlocks, renderSource, separateRoots, workspaceSource, workspaceModel } from "../src/ui/sourceBlocks.js";
import { createToolbox, templates } from "../src/ui/blockTemplates.js";

registerSourceBlocks();

test("nested callback headers, string arguments and async modifiers are editable", async () => {
  const text = 'import("./maintenance.js").then(async ({ runHealthCheckReport }) => {\n  const apps = Array.from(registry.values())\n    .map(entry => entry.config);\n  console.log("health");\n});\nfunction customReport() {}';
  const model = await parseSource(text);
  const workspace = new Blockly.Workspace();
  try {
    renderSource(workspace, model);
    const callback = workspace.getBlockById(model.nodes[0].id);
    const parameter = callback.sourceNode.fields.findIndex(field => field.label === 'parameter 1');
    assert.ok(parameter >= 0);
    callback.setFieldValue('{ customReport }', `EDIT${parameter}`);
    const modifier = callback.sourceNode.fields.findIndex(field => field.label === 'async modifier');
    assert.ok(modifier >= 0);
    callback.setFieldValue('', `EDIT${modifier}`);
    const log = workspace.getBlockById(model.nodes[0].slots[0].nodes[1].id);
    log.setFieldValue('"changed text"', 'EDIT1');
    assert.equal(workspaceSource(workspace, model), text.replace('async ', ' ').replace('{ runHealthCheckReport }', '{ customReport }').replace('"health"', '"changed text"'));
    assert.ok(workspace.callSuggestions.includes('console.log'));
    const awaitField = log.sourceNode.fields.findIndex(field => field.label === 'await modifier');
    log.setFieldValue('await ', `EDIT${awaitField}`);
    assert.ok(workspaceSource(workspace, model).includes('await console.log("changed text")'));
    log.setFieldValue('customReport', 'PICK0');
    assert.ok(workspaceSource(workspace, model).includes('await customReport("changed text")'));
    const value = workspace.getBlockById(model.nodes[0].slots[0].nodes[0].id);
    assert.ok(value.sourceNode.fields.some(field => field.label === 'call'));
  } finally { workspace.dispose(); }
});

test("visual moves and collision repair never reorder declarations or calls", async () => {
  const text = 'const value = 1;\nfunction run() {\n  console.log(value);\n}\nrun();\n';
  const model = await parseSource(text);
  const workspace = new Blockly.Workspace();
  try {
    renderSource(workspace, model);
    for (const block of workspace.getTopBlocks(false)) {
      const point = block.getRelativeToSurfaceXY();
      block.moveBy(30 - point.x, 25 - point.y);
      block.getHeightWidth = () => ({ width: 300, height: 400 });
    }
    separateRoots(workspace);
    const roots = workspace.getTopBlocks(false);
    const heights = roots.map(block => block.getRelativeToSurfaceXY().y).sort((left, right) => left - right);
    assert.ok(heights[1] - heights[0] >= 435);
    assert.ok(heights[2] - heights[1] >= 435);
    roots[0].moveBy(900, 5000);
    assert.equal(workspaceSource(workspace, model), text);
  } finally { workspace.dispose(); }
});

test("editable fields change exact source slices without rewriting comments or nested bodies", async () => {
  const text = 'function greet(name) {\r\n  if (name /* keep */) {\r\n    console.log("Hi", name);\r\n  }\r\n}\r\n';
  const model = await parseSource(text);
  const workspace = new Blockly.Workspace();
  try {
    renderSource(workspace, model);
    const root = workspace.getBlockById(model.nodes[0].id);
    root.setFieldValue("welcome", "EDIT0");
    root.setFieldValue("person", "EDIT1");
    const condition = root.getInputTargetBlock("BODY0");
    condition.setFieldValue("person", "EDIT0");
    const expected = text.replace('greet(name)', 'welcome(person)').replace('if (name', 'if (person');
    assert.equal(workspaceSource(workspace, model), expected);
    const changed = await parseSource(expected, workspaceModel(workspace, model));
    assert.equal(changed.nodes[0].id, root.id);
    renderSource(workspace, changed);
    assert.equal(workspaceSource(workspace, changed), expected);
    assert.equal(workspace.getBlockById(root.id).getFieldValue("EDIT0"), "welcome");
  } finally { workspace.dispose(); }
});

test("every toolbox block deserializes with editable fields and intact nested bodies", async () => {
  const toolbox = await createToolbox();
  let count = 0;
  for (const category of toolbox.contents) for (const entry of category.contents) {
    if (entry.kind !== "block") continue;
    const workspace = new Blockly.Workspace();
    try {
      Blockly.serialization.blocks.append(entry, workspace);
      const text = workspaceSource(workspace, { nodes: [], trailing: "" });
      await parseSource(category.name === "Functions" && text.trim().startsWith("return") ? `function wrapper() {${text}}` : text);
      assert.ok(workspace.getAllBlocks(false).some(block => block.getField("EDIT0")));
      count++;
    } finally { workspace.dispose(); }
  }
  assert.equal(count, templates.length);
});

test("a new toolbox statement connects inside an existing function and preserves its siblings", async () => {
  const model = await parseSource('function run() {\n  first();\n}\nlast();\n');
  const toolbox = await createToolbox();
  const template = toolbox.contents.find(category => category.name === "Values").contents.find(entry => entry.kind === "block");
  const workspace = new Blockly.Workspace();
  try {
    renderSource(workspace, model);
    const added = Blockly.serialization.blocks.append(template, workspace);
    const first = workspace.getBlockById(model.nodes[0].slots[0].nodes[0].id);
    first.nextConnection.connect(added.previousConnection);
    const text = workspaceSource(workspace, model);
    const parsed = await parseSource(text, workspaceModel(workspace, model));
    assert.equal(parsed.nodes[0].slots[0].nodes[1].id, added.id);
    assert.equal(parsed.nodes[1].id, model.nodes[1].id);
    assert.ok(text.includes('first();\nlet value = 1;'));
    renderSource(workspace, parsed);
    assert.equal(workspaceSource(workspace, parsed), text);
  } finally { workspace.dispose(); }
});

test("duplicate templates stay independent when one field changes", async () => {
  const toolbox = await createToolbox();
  const entry = toolbox.contents.find(category => category.name === "Values").contents.find(item => item.kind === "block");
  const workspace = new Blockly.Workspace();
  try {
    const first = Blockly.serialization.blocks.append(entry, workspace);
    const second = Blockly.serialization.blocks.append(entry, workspace);
    assert.notEqual(first.id, second.id);
    first.setFieldValue("firstValue", "EDIT0");
    second.setFieldValue("secondValue", "EDIT0");
    const model = workspaceModel(workspace, { nodes: [], trailing: "" });
    const text = printModel(model);
    assert.equal((text.match(/let /g) || []).length, 2);
    const parsed = await parseSource(text, model);
    assert.equal(parsed.nodes[0].id, first.id);
    assert.equal(parsed.nodes[1].id, second.id);
    renderSource(workspace, parsed);
    assert.equal(workspaceSource(workspace, parsed), text);
  } finally { workspace.dispose(); }
});

test("invalid nested edits preserve siblings, exact text and recover on repair", async () => {
  const source = 'function run() {\n  one();\n  const value = 1;\n  two();\n}\nother();\n';
  const original = await parseSource(source);
  const invalid = source.replace('value = 1', 'value =');
  const recovered = await parseEditableSource(invalid, original);
  assert.ok(recovered.diagnostic);
  assert.equal(printModel(recovered), invalid);
  assert.equal(recovered.nodes[1].id, original.nodes[1].id);
  assert.equal(recovered.nodes[0].slots[0].nodes[0].id, original.nodes[0].slots[0].nodes[0].id);
  assert.ok(recovered.nodes[0].slots[0].nodes.some(node => node.kind === 'InvalidSource'));
  const workspace = new Blockly.Workspace();
  try {
    renderSource(workspace, recovered);
    assert.equal(workspaceSource(workspace, recovered), invalid);
  } finally { workspace.dispose(); }
  const repeated = await parseEditableSource(invalid.replace('value =', 'value = ('), recovered);
  assert.equal(printModel(repeated), invalid.replace('value =', 'value = ('));
  const repaired = await parseEditableSource(source, repeated);
  assert.equal(repaired.diagnostic, undefined);
  assert.equal(printModel(repaired), source);
});

test("fallback preserves every character across malformed edits and fresh invalid files", async () => {
  const source = 'function run() {\n  one();\n}\nother();\n';
  const model = await parseSource(source);
  for (let offset = 0; offset <= source.length; offset++) {
    for (const inserted of ['"', '(', 'const broken = ;', '}']) {
      const text = source.slice(0, offset) + inserted + source.slice(offset);
      assert.equal(printModel(await parseEditableSource(text, model)), text);
    }
  }
  const fresh = await parseEditableSource('function unfinished(');
  assert.equal(fresh.nodes[0].kind, 'InvalidSource');
  assert.equal(printModel(fresh), 'function unfinished(');
});
const fixture = '#!/usr/bin/env node\r\n"use strict";\r\n// Keep this\r\nexport function first(name) {\r\n  if (name) {\r\n    packageApi.run(`value: ${name} } ] ;`);\r\n  } else {\r\n    return /[};]/.test(name);\r\n  }\r\n}\r\n\r\nconst second = async () => { /* keep */ await first("x"); };\r\nclass Thing { method() { return 1; } }\r\n';

test("nested AST and actual Blockly workspace round-trip exactly", async () => {
  const model = await parseSource(fixture);
  assert.equal(printModel(model), fixture);
  const nodes = [];
  visitNodes(model, node => nodes.push(node));
  assert.ok(nodes.some(node => node.kind === "IfStatement" && node.slots.length === 2));
  assert.ok(nodes.some(node => node.kind === "ClassMethod" && node.slots.length === 1));
  const workspace = new Blockly.Workspace();
  try {
    renderSource(workspace, model);
    assert.equal(workspaceSource(workspace, model), fixture);
    assert.equal(workspace.getTopBlocks(false).length, model.nodes.length);
    assert.equal(workspace.getAllBlocks(false).length, nodes.length);
  } finally { workspace.dispose(); }
});

test("inserting code preserves IDs of unaffected nested statements", async () => {
  const original = await parseSource(fixture);
  const changed = await parseSource(fixture.replace('return 1;', 'const extra = 2; return 1;'), original);
  const ids = new Map();
  visitNodes(original, node => ids.set(node.kind + printNode(node).slice(node.leading.length), node.id));
  visitNodes(changed, node => {
    const id = ids.get(node.kind + printNode(node).slice(node.leading.length));
    if (id) assert.equal(node.id, id);
  });
});

test("editing a nested block touches only its source range", async () => {
  const model = await parseSource(fixture);
  let target;
  visitNodes(model, node => { if (node.parts[0] === 'return 1;') target = node; });
  const edited = replaceSourceRange(fixture, target.start, target.end, "return 42;");
  assert.equal(edited, fixture.replace("return 1;", "return 42;"));
  assert.equal(printModel(await parseSource(edited)), edited);
  await assert.rejects(parseSource("function unfinished("));
});

test("unchanged section reuses block objects and shifts nested source ranges", async () => {
  const before = await parseSource('function stable() { return 1; }\n');
  const workspace = new Blockly.Workspace();
  try {
    renderSource(workspace, before);
    const original = workspace.getBlockById(before.nodes[0].id);
    const after = await parseSource('const added = 2;\nfunction stable() { return 1; }\n', before);
    renderSource(workspace, after);
    assert.equal(workspace.getBlockById(after.nodes[1].id), original);
    assert.equal(original.getInputTargetBlock("BODY0").sourceNode.start, after.nodes[1].slots[0].nodes[0].start);
    assert.equal(workspaceSource(workspace, after), after.source);
  } finally { workspace.dispose(); }
});

test("connect and delete nested blocks updates source without duplicates", async () => {
  const model = await parseSource('function run() {\n  one();\n  two();\n}\nthree();\n');
  const workspace = new Blockly.Workspace();
  try {
    renderSource(workspace, model);
    const first = workspace.getBlockById(model.nodes[0].slots[0].nodes[0].id);
    first.dispose(true);
    const text = workspaceSource(workspace, model);
    assert.ok(!text.includes("one();"));
    assert.equal(text.match(/two\(\)/g).length, 1);
    await parseSource(text);
  } finally { workspace.dispose(); }
});

test("all current application JS files round-trip through real blocks", async () => {
  let count = 0;
  function files(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : /\.(js|cjs)$/.test(entry.name) ? [path.join(directory, entry.name)] : []);
  }
  for (const file of [...files("src"), ...files("electron")]) {
    const source = fs.readFileSync(file, "utf8");
    const model = await parseSource(source);
    const workspace = new Blockly.Workspace();
    try {
      renderSource(workspace, model);
      assert.equal(workspaceSource(workspace, model), source, file);
      count++;
    } finally { workspace.dispose(); }
  }
  assert.ok(count > 10);
});
