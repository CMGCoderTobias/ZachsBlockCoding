export async function inspectLists(source) {
  const { parse } = await import("@babel/parser");
  const ast = parse(source, { sourceType: "unambiguous", plugins: ["jsx"], tokens: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true });
  const tokens = ast.tokens.filter(token => typeof token.type !== "string");
  const lists = [];
  const root = ast.program.body[0];
  function add(label, items, open, close) {
    if (!open || !close || open.end > close.start) return;
    lists.push({ label, start: open.end, end: close.start, items: items.map(item => ({ start: item.start, end: item.end, text: source.slice(item.start, item.end) })), commas: tokens.filter(token => token.type.label === "," && token.start >= open.end && token.end <= close.start).map(token => token.start) });
  }
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node !== root && ["BlockStatement", "ClassBody"].includes(node.type)) return;
    if (node.type === "ImportDeclaration") {
      const named = node.specifiers.filter(specifier => specifier.type === "ImportSpecifier");
      const open = tokens.find(token => token.type.label === "{" && token.start >= node.start && token.end <= node.source.start);
      const close = tokens.findLast(token => token.type.label === "}" && token.start >= node.start && token.end <= node.source.start);
      if (open && close) add("Named imports", named, open, close);
      else if (!node.specifiers.some(specifier => specifier.type === "ImportNamespaceSpecifier")) lists.push({ label: "Named imports", mode: "import-new", anchor: node.specifiers.at(-1)?.end ?? node.source.start, defaultImport: !!node.specifiers.length, items: [] });
    }
    if (["CallExpression", "OptionalCallExpression", "NewExpression"].includes(node.type)) {
      const open = tokens.find(token => token.type.label === "(" && token.start >= node.callee.end && token.end <= node.end);
      const close = tokens.findLast(token => token.type.label === ")" && token.end === node.end);
      add(`Arguments: ${source.slice(node.callee.start, node.callee.end).replace(/\s+/g, " ")}`, node.arguments, open, close);
    }
    if (["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type)) {
      const open = tokens.find(token => token.type.label === "(" && token.start >= node.start && token.end <= (node.params[0]?.start ?? node.body.start));
      const close = tokens.findLast(token => token.type.label === ")" && token.start >= (node.params.at(-1)?.end ?? node.start) && token.end <= node.body.start);
      add("Parameters", node.params, open, close);
      if (!open && node.type === "ArrowFunctionExpression" && node.params.length === 1) {
        const param = node.params[0];
        lists.push({ label: "Parameters", mode: "bare-parameters", start: param.start, end: param.end, items: [{ start: param.start, end: param.end, text: source.slice(param.start, param.end) }] });
      }
    }
    if (node.type === "ArrayExpression" && node.elements.every(Boolean)) {
      add("Array items", node.elements, tokens.find(token => token.start === node.start), tokens.find(token => token.end === node.end));
    }
    if (node.type === "ObjectExpression") {
      add("Object properties", node.properties, tokens.find(token => token.start === node.start), tokens.find(token => token.end === node.end));
    }
    for (const [key, child] of Object.entries(node)) if (!["loc", "extra", "leadingComments", "trailingComments", "innerComments"].includes(key)) visit(child);
  }
  visit(root);
  return lists;
}

export function editList(source, list, operation, index, value = "") {
  const edits = [];
  if (operation !== "remove" && !value.trim()) throw new Error("Enter an item first.");
  if (list.mode === "bare-parameters") {
    const text = operation === "add" ? `${list.items[0].text}, ${value}` : operation === "remove" ? "" : value;
    edits.push({ start: list.start, end: list.end, text: `(${text})` });
  } else if (list.mode === "import-new") {
    if (operation !== "add") throw new Error("Add a named import first.");
    edits.push({ start: list.anchor, end: list.anchor, text: list.defaultImport ? `, { ${value} }` : `{ ${value} } from ` });
  } else if (operation === "add") {
    const last = list.items.at(-1);
    const interior = source.slice(list.start, list.end);
    const newline = interior.includes("\r\n") ? "\r\n" : "\n";
    const multiline = /[\r\n]/.test(interior) || /\/\//.test(interior);
    const indent = last ? source.slice(source.lastIndexOf("\n", last.start - 1) + 1, last.start).match(/^\s*/)[0] : "  ";
    const trailingComma = last && list.commas.some(comma => comma >= last.end);
    if (last && !trailingComma) edits.push({ start: last.end, end: last.end, text: "," });
    const insertion = list.end - (interior.match(/\s*$/)?.[0].length || 0);
    const text = (multiline ? newline + indent : last ? " " : "") + value + (trailingComma ? "," : "");
    edits.push({ start: insertion, end: insertion, text });
  } else {
    const item = list.items[index];
    if (!item) throw new Error("List item no longer exists.");
    edits.push({ start: item.start, end: item.end, text: operation === "remove" ? "" : value });
    if (operation === "remove") {
      const next = list.items[index + 1];
      const previous = list.items[index - 1];
      const comma = list.commas.find(position => position >= item.end && position < (next?.start ?? list.end))
        ?? list.commas.findLast(position => position < item.start && position >= (previous?.end ?? list.start));
      if (comma !== undefined) edits.push({ start: comma, end: comma + 1, text: "" });
    }
  }
  for (const edit of edits.map((edit, order) => ({ ...edit, order })).sort((left, right) => right.start - left.start || right.end - left.end || right.order - left.order)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
