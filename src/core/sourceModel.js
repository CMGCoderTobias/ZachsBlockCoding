import { sourceFields } from "./sourceFields.js";

let parserPromise;
let nextId = 1;

export function visitNodes(model, callback) {
  function visit(nodes) {
    for (const node of nodes) {
      callback(node);
      for (const slot of node.slots) visit(slot.nodes);
    }
  }
  visit(model.nodes);
}

export function printNode(node) {
  let text = node.parts[0];
  node.slots.forEach((slot, index) => {
    text += slot.nodes.map(printNode).join("") + slot.trailing + node.parts[index + 1];
  });
  return node.leading + text;
}

export function printModel(model) {
  return model.nodes.map(printNode).join("") + model.trailing;
}

export async function parseSource(source, previous = null) {
  parserPromise ||= import("@babel/parser");
  const { parse } = await parserPromise;
  const ast = parse(source, { sourceType: "unambiguous", plugins: ["jsx"], tokens: false });
  const available = new Map();
  if (previous) visitNodes(previous, node => {
    const key = node.kind + "\0" + printNode(node).slice(node.leading.length);
    const list = available.get(key) || [];
    list.push(node.id);
    available.set(key, list);
  });

  function containers(node) {
    const found = [];
    function walk(value) {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (value !== node && (value.type === "BlockStatement" || value.type === "ClassBody")) {
        found.push(value);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (!["loc", "extra", "leadingComments", "trailingComments", "innerComments", "comments", "tokens"].includes(key)) walk(child);
      }
    }
    walk(node);
    return found.sort((left, right) => left.start - right.start);
  }

  function sequence(body, start, end) {
    let cursor = start;
    const nodes = body.map(item => {
      const text = source.slice(item.start, item.end);
      const key = item.type + "\0" + text;
      const id = available.get(key)?.shift() || `source-${nextId++}`;
      const node = { id, kind: item.type, start: item.start, end: item.end, leading: source.slice(cursor, item.start), parts: [], slots: [] };
      let innerCursor = item.start;
      const partStarts = [];
      for (const container of containers(item)) {
        partStarts.push(innerCursor);
        node.parts.push(source.slice(innerCursor, container.start + 1));
        const children = [...(container.directives || []), ...container.body].sort((left, right) => left.start - right.start);
        node.slots.push(sequence(children, container.start + 1, container.end - 1));
        innerCursor = container.end - 1;
      }
      node.parts.push(source.slice(innerCursor, item.end));
      partStarts.push(innerCursor);
      node.fields = sourceFields(item, source, partStarts, node.parts);
      cursor = item.end;
      return node;
    });
    return { nodes, trailing: source.slice(cursor, end) };
  }
  const body = [...ast.program.directives, ...ast.program.body].sort((left, right) => left.start - right.start);
  const model = sequence(body, 0, source.length);
  model.source = source;
  return model;
}

export function replaceSourceRange(source, start, end, replacement) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length) throw new Error("Invalid source range");
  return source.slice(0, start) + replacement + source.slice(end);
}

export async function parseEditableSource(source, previous = null) {
  try { return await parseSource(source, previous); }
  catch (error) {
    const original = previous?.source || "";
    let start = 0;
    while (start < original.length && start < source.length && original[start] === source[start]) start++;
    let end = original.length;
    let newEnd = source.length;
    while (end > start && newEnd > start && original[end - 1] === source[newEnd - 1]) { end--; newEnd--; }
    const delta = source.length - original.length;
    const diagnostic = error.message;
    function shifted(node, offset) {
      return { ...node, start: node.start + offset, end: node.end + offset,
        slots: node.slots.map(slot => ({ ...slot, nodes: slot.nodes.map(child => shifted(child, offset)) })) };
    }
    function warning(begin, finish) {
      return { id: `source-${nextId++}`, kind: "InvalidSource", start: begin, end: finish,
        leading: "", parts: [source.slice(begin, finish)], slots: [], diagnostic };
    }
    function recover(sequence, begin, finish) {
      const enclosing = sequence.nodes.find(node => node.start <= start && node.end >= end);
      if (enclosing) {
        let cursor = enclosing.start + enclosing.parts[0].length;
        for (let index = 0; index < enclosing.slots.length; index++) {
          const slot = enclosing.slots[index];
          const slotEnd = cursor + slot.nodes.map(printNode).join("").length + slot.trailing.length;
          if (start >= cursor && end <= slotEnd) {
            return { ...sequence, nodes: sequence.nodes.map(node => {
              if (node !== enclosing) return shifted(node, node.start >= end ? delta : 0);
              return { ...node, id: `source-${nextId++}`, end: node.end + delta,
                slots: node.slots.map((child, childIndex) => childIndex === index ? recover(child, cursor, slotEnd)
                  : { ...child, nodes: child.nodes.map(item => shifted(item, childIndex > index ? delta : 0)) }) };
            }) };
          }
          cursor = slotEnd + enclosing.parts[index + 1].length;
        }
      }
      const before = sequence.nodes.filter(node => node.end <= start);
      const after = sequence.nodes.filter(node => node.start - node.leading.length >= end && !before.includes(node));
      const rangeStart = before.at(-1)?.end ?? begin;
      const rangeEnd = after.length ? after[0].start - after[0].leading.length : finish;
      return { nodes: [...before.map(node => shifted(node, 0)), warning(rangeStart, rangeEnd + delta), ...after.map(node => shifted(node, delta))], trailing: after.length ? sequence.trailing : "" };
    }
    let recovered = recover(previous || { nodes: [], trailing: "" }, 0, original.length);
    recovered = { ...recovered, source, diagnostic };
    if (printModel(recovered) !== source) recovered = { nodes: [warning(0, source.length)], trailing: "", source, diagnostic };
    return recovered;
  }
}
