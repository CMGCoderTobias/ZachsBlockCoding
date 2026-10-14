import test from "node:test";
import assert from "node:assert/strict";
import { editorText, savedText } from "../src/core/documentText.js";

test("textarea normalization preserves untouched CRLF/BOM and mixed line endings on save", () => {
  const original = '\uFEFFconst one = 1;\r\nconst two = 2;\nconst three = 3;\r';
  assert.equal(savedText(original, editorText(original)), original);
  assert.equal(savedText(original, editorText(original).replace('two = 2', 'two = 22')), original.replace('two = 2', 'two = 22'));
  const added = editorText(original) + 'const four = 4;\n';
  assert.equal(savedText(original, added), original + 'const four = 4;\r\n');
  for (let offset = 0; offset <= editorText(original).length; offset++) {
    const edited = editorText(original).slice(0, offset) + '\nadded();\n' + editorText(original).slice(offset);
    assert.equal(editorText(savedText(original, edited)), edited);
  }
});
