import { parseSource } from "../core/sourceModel.js";

export const templates = [
  { name: "Function", category: "Functions", source: 'function example(name) {\n  return name;\n}' },
  { name: "Async function", category: "Functions", source: 'async function exampleAsync(value) {\n  return await Promise.resolve(value);\n}' },
  { name: "Call", category: "Functions", source: 'example("Hello");' },
  { name: "Return", category: "Functions", source: 'return value;', wrapper: true },
  { name: "Variable", category: "Values", source: 'let value = 1;' },
  { name: "Console log", category: "Values", source: 'console.log("Hello");' },
  { name: "Assignment", category: "Values", source: 'value = 2;' },
  { name: "If", category: "Conditions", source: 'if (true) {\n}' },
  { name: "If / else", category: "Conditions", source: 'if (true) {\n} else {\n}' },
  { name: "For loop", category: "Loops", source: 'for (let index = 0; index < 10; index++) {\n}' },
  { name: "For each", category: "Loops", source: 'for (const item of items) {\n}' },
  { name: "While", category: "Loops", source: 'while (false) {\n}' },
  { name: "Try / catch", category: "Other", source: 'try {\n} catch (error) {\n  console.error(error);\n}' },
  { name: "Class", category: "Other", source: 'class Example {\n  constructor() {\n    this.value = 1;\n  }\n}' },
];

export async function createToolbox() {
  const categories = new Map();
  function serialize(node, root = false) {
    const extraState = { ...node, leading: root ? "\n" : node.leading };
    const inputs = {};
    node.slots.forEach((slot, index) => {
      let next;
      for (const child of [...slot.nodes].reverse()) {
        const block = serialize(child);
        if (next) block.next = { block: next };
        next = block;
      }
      if (next) inputs[`BODY${index}`] = { block: next };
    });
    return { type: "zbc_source", extraState, inputs };
  }
  for (const template of templates) {
    const model = await parseSource(template.wrapper ? `function wrapper() { ${template.source} }` : template.source);
    const node = template.wrapper ? model.nodes[0].slots[0].nodes[0] : model.nodes[0];
    if (!categories.has(template.category)) categories.set(template.category, { kind: "category", name: template.category, colour: "215", contents: [] });
    categories.get(template.category).contents.push({ kind: "label", text: template.name }, { kind: "block", ...serialize(node, true) });
  }
  return { kind: "categoryToolbox", contents: [...categories.values()] };
}
