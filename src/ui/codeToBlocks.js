let _babelParserPromise = null;

async function getBabelParse() {
  if (!_babelParserPromise) {
    _babelParserPromise = import("@babel/parser");
  }
  const mod = await _babelParserPromise;
  return mod.parse;
}

export async function splitJsToTopLevelStatements(code) {
  const src = code || "";
  const parse = await getBabelParse();
  const ast = parse(src, {
    sourceType: "unambiguous",
    allowReturnOutsideFunction: true,
    ranges: true,
    plugins: [
      "jsx",
      "typescript",
      "classProperties",
      "classPrivateProperties",
      "classPrivateMethods",
      "dynamicImport",
      "importMeta",
      "topLevelAwait",
      "optionalChaining",
      "nullishCoalescingOperator",
      "objectRestSpread",
    ],
  });

  const body = ast?.program?.body || [];
  const chunks = [];

  for (const node of body) {
    if (!node || !Array.isArray(node.range)) continue;
    const [start, end] = node.range;
    const text = src.slice(start, end);
    if (text.trim().length) chunks.push(text);
  }

  return chunks;
}

export async function createRawBlocksFromCode({ Blockly, workspace, code, x = 40, y = 40 }) {
  const statements = await splitJsToTopLevelStatements(code);
  if (statements.length === 0) return { created: 0 };

  let offsetY = 0;
  for (const stmt of statements) {
    const raw = workspace.newBlock("zbc_raw_js");
    raw.setFieldValue(stmt.trimEnd(), "CODE");
    raw.initSvg();
    raw.render();
    raw.moveBy(x, y + offsetY);
    offsetY += 80;
  }

  return { created: statements.length };
}
