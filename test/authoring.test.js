import test from "node:test";
import assert from "node:assert/strict";
import { inspectLists, editList } from "../src/core/listEditing.js";
import { parseSource } from "../src/core/sourceModel.js";
import { wrapText } from "../src/ui/wrappedFields.js";
import { expressionReference } from "../src/ui/expressionReference.js";

test("list editing adds, removes and updates imports without losing comments or multiline formatting", async () => {
  let source = 'import primary, {\n  first, // keep this note\n  second as alias,\n} from "package";';
  let list = (await inspectLists(source))[0];
  source = editList(source, list, "add", null, "third");
  assert.ok(source.includes("  third,\n}"));
  assert.ok(source.includes("// keep this note"));
  await parseSource(source);
  list = (await inspectLists(source))[0];
  source = editList(source, list, "remove", 1);
  assert.ok(!source.includes("second as alias"));
  assert.ok(source.includes("// keep this note"));
  await parseSource(source);
  list = (await inspectLists(source))[0];
  source = editList(source, list, "replace", 0, "first as renamed");
  await parseSource(source);
  assert.ok(source.includes("first as renamed"));
});

test("list punctuation handles empty, single, trailing-comma and nested syntax", async () => {
  for (const initial of ['fn();', 'fn(one);', 'fn(one,);', 'fn(one, two);', 'fn({ nested: [1, 2] }, "comma,inside");', 'fn(one // comment\n);', 'fn(/* keep */);', 'import {} from "pkg";', 'import "pkg";', 'import primary from "pkg";']) {
    const first = (await inspectLists(initial))[0];
    const added = editList(initial, first, "add", null, "extra");
    await parseSource(added);
    assert.ok(added.includes("extra"));
    let source = added;
    while ((await inspectLists(source))[0].items.length) {
      const list = (await inspectLists(source))[0];
      source = editList(source, list, "remove", 0);
      await parseSource(source);
    }
  }
});

test("function parameters, arrays and objects expose lists; examples parse", async () => {
  for (const source of ['function sample(one, two) {}', 'const value = [1, 2];', 'const value = { first: 1, second: 2 };']) {
    const lists = await inspectLists(source);
    assert.ok(lists.length);
    const value = lists[0].label === "Object properties" ? "third: 3" : "extra";
    await parseSource(editList(source, lists[0], "add", null, value));
  }
  for (const entry of expressionReference) await parseSource(entry.code);
  const arrow = 'const fn = value => value + 1;';
  const parameters = (await inspectLists(arrow)).find(list => list.label === "Parameters");
  const expanded = editList(arrow, parameters, "add", null, "index");
  assert.equal(expanded, 'const fn = (value, index) => value + 1;');
  await parseSource(expanded);
});

test("display wrapping does not truncate long literal content", () => {
  const value = "Quoted value " + "very long content ".repeat(30);
  const lines = wrapText(value);
  assert.ok(lines.length > 2);
  assert.equal(lines.join(""), value);
  assert.ok(lines.every(line => line.length <= 59));
});
