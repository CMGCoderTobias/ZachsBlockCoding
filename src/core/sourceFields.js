export function sourceFields(item, source, partStarts, parts) {
  const candidates = [];
  function add(label, value) {
    if (!value || !Number.isInteger(value.start) || !Number.isInteger(value.end)) return;
    const part = partStarts.findIndex((start, index) => value.start >= start && value.end <= start + parts[index].length);
    if (part < 0 || /[\r\n]/.test(source.slice(value.start, value.end))) return;
    if (label === "async modifier" && value.start === value.end && candidates.some(existing => /^(argument|value|expression)/.test(existing.label)
      && existing.start <= value.start && existing.end > value.start)) return;
    if (candidates.some(existing => value.start < existing.end && value.end > existing.start
      || value.start === existing.start && value.end === existing.end)) return;
    candidates.push({ label, start: value.start, end: value.end });
  }
  if (/Function|Method/.test(item.type)) {
    add("name", item.id || item.key);
    for (const [index, param] of (item.params || []).entries()) add(`parameter ${index + 1}`, param);
  }
  if (item.type === "ClassDeclaration") add("name", item.id);
  if (item.type === "VariableDeclaration") for (const declaration of item.declarations) {
    add("name", declaration.id);
    add("value", declaration.init);
  }
  add("condition", item.test);
  if (item.type === "ForStatement") {
    add("initialize", item.init);
    add("step", item.update);
  }
  if (item.type === "ForOfStatement" || item.type === "ForInStatement") {
    add("item", item.left);
    add("collection", item.right);
  }
  if (item.type === "ReturnStatement" || item.type === "ThrowStatement") add("value", item.argument);
  if (item.type === "ExpressionStatement") {
    const expression = item.expression.type === "AwaitExpression" ? item.expression.argument : item.expression;
    if (expression.type === "CallExpression") {
      add("call", expression.callee);
      expression.arguments.forEach((argument, index) => add(`argument ${index + 1}`, argument));
      if (expression === item.expression || /^await\s+$/.test(source.slice(item.expression.start, expression.start))) {
        add("await modifier", { start: item.expression.start, end: expression.start });
      }
    } else add("expression", item.expression);
  }
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value !== item && ["BlockStatement", "ClassBody"].includes(value.type)) return;
    if (["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(value.type)) {
      if (!value.async || /^async\b/.test(source.slice(value.start))) {
        add("async modifier", { start: value.start, end: value.start + (value.async ? 5 : 0) });
      }
      add("name", value.id);
      (value.params || []).forEach((param, index) => add(`parameter ${index + 1}`, param));
    }
    if (["CallExpression", "OptionalCallExpression", "NewExpression"].includes(value.type)) {
      add("call", value.callee);
      (value.arguments || []).forEach((argument, index) => add(`argument ${index + 1}`, argument));
    }
    if (["StringLiteral", "NumericLiteral", "BooleanLiteral", "TemplateLiteral"].includes(value.type)) add("value", value);
    if (value.type === "Identifier") add("identifier", value);
    for (const [key, child] of Object.entries(value)) {
      if (!["loc", "extra", "leadingComments", "trailingComments", "innerComments", "comments", "tokens"].includes(key)) visit(child);
    }
  }
  visit(item);
  return candidates.flatMap(candidate => {
    const part = partStarts.findIndex((start, index) => candidate.start >= start && candidate.end <= start + parts[index].length);
    if (part < 0 || /[\r\n]/.test(source.slice(candidate.start, candidate.end))) return [];
    return [{ label: candidate.label, part, start: candidate.start - partStarts[part], end: candidate.end - partStarts[part] }];
  });
}
