import * as Blockly from "blockly";
import { printNode } from "../core/sourceModel.js";
import { WrappedInput, WrappedLabel } from "./wrappedFields.js";

const titles = { FunctionDeclaration: "Function", VariableDeclaration: "Variable", IfStatement: "If / else", ExpressionStatement: "Expression / call", ReturnStatement: "Return", ClassDeclaration: "Class", ClassMethod: "Method", ForStatement: "For", ForOfStatement: "For each", WhileStatement: "While", ExportNamedDeclaration: "Export", TryStatement: "Try / catch" };

export function registerSourceBlocks() {
  Blockly.Blocks.zbc_source = {
    init() {
      this.appendDummyInput("LABEL").appendField("Source", "TITLE");
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(215);
    },
    saveExtraState() { return this.sourceNode; },
    loadExtraState(node) {
      this.sourceNode = node;
      this.setFieldValue(node.diagnostic ? "⚠ Incomplete / invalid code" : titles[node.kind] || node.kind, "TITLE");
      this.setColour(node.diagnostic ? 0 : node.slots.length ? 265 : titles[node.kind] ? 210 : 35);
      if (node.diagnostic) this.setWarningText(node.diagnostic);
      this.helperInputs = [];
      node.parts.forEach((part, index) => {
        let input = this.appendDummyInput();
        let rowWidth = 0;
        const newRow = () => { input = this.appendDummyInput(); rowWidth = 0; };
        const appendLabel = text => {
          text.split(/\r?\n/).forEach((line, lineIndex) => {
            if (lineIndex || rowWidth > 72) newRow();
            if (line) { input.appendField(new WrappedLabel(line)); rowWidth += Math.min(line.length, 58); }
          });
        };
        let cursor = 0;
        (node.fields || []).map((field, fieldIndex) => ({ ...field, fieldIndex })).sort((left, right) => left.start - right.start || left.end - right.end).forEach(field => {
          const fieldIndex = field.fieldIndex;
          if (field.part !== index) return;
          appendLabel(part.slice(cursor, field.start));
          const modifier = field.label === "async modifier" ? "async" : field.label === "await modifier" ? "await" : null;
          const editor = modifier
            ? new Blockly.FieldDropdown([[modifier === "async" ? "sync" : "no await", ""], [modifier, part.slice(field.start, field.end) || `${modifier} `]])
            : new WrappedInput(part.slice(field.start, field.end), null, { spellcheck: false });
          if (modifier) editor.setValue(part.slice(field.start, field.end));
          editor.setTooltip(field.label + " · click to edit, Enter to apply");
          if (modifier) {
            if (part.slice(field.start, field.end).trim()) appendLabel(modifier);
            const helper = this.appendDummyInput(`HELPER${fieldIndex}`).appendField(modifier).appendField(editor, `EDIT${fieldIndex}`);
            this.helperInputs.push(helper);
          } else {
            const width = Math.min(field.end - field.start, 58);
            if (rowWidth && rowWidth + width > 72) newRow();
            input.appendField(editor, `EDIT${fieldIndex}`);
            rowWidth += width;
          }
          if (field.label === "call") {
            const suggestions = new Blockly.FieldDropdown(() => [["Change function…", ""], ...(this.workspace.callSuggestions || []).map(name => [name, name])], value => {
              if (value) this.setFieldValue(value, `EDIT${fieldIndex}`);
              return "";
            });
            suggestions.setTooltip("Suggestions from this file, not scope/type validation. Type any other callable in the adjacent field.");
            const helper = this.appendDummyInput(`PICK_HELPER${fieldIndex}`).appendField(suggestions, `PICK${fieldIndex}`);
            this.helperInputs.push(helper);
          }
          cursor = field.end;
        });
        appendLabel(part.slice(cursor) || " ");
        if (index < node.slots.length) this.appendStatementInput(`BODY${index}`).appendField("body");
      });
      this.helperInputs.forEach(input => input.setVisible(false));
      this.setTooltip("Click a white field to edit; Enter applies it. Drag premade blocks from a toolbox category and connect them to a body. Use the source inspector for unrestricted edits.");
    },
  };
}

export function showBlockHelpers(block, visible) {
  if (!block) return;
  block.helperInputs?.forEach(input => input.setVisible(visible));
  block.render?.();
}

export function renderSource(workspace, model, positions = {}) {
  const names = new Set();
  function collect(nodes) {
    for (const node of nodes) {
      for (const field of node.fields || []) if (field.label === "call" || field.label === "name" && /Function/.test(node.kind)) {
        const value = node.parts[field.part].slice(field.start, field.end);
        if (/^[\w$.]+$/.test(value)) names.add(value);
      }
      node.slots.forEach(slot => collect(slot.nodes));
    }
  }
  collect(model.nodes);
  workspace.callSuggestions = [...names].sort().slice(0, 100);
  Blockly.Events.disable();
  try {
    function matches(block, node) {
      if (!block || block.id !== node.id || block.sourceNode.parts.join("\0") !== node.parts.join("\0")) return false;
      return node.slots.every((slot, index) => {
        let child = block.getInputTargetBlock(`BODY${index}`);
        for (const expected of slot.nodes) {
          if (!matches(child, expected)) return false;
          child = child.getNextBlock();
        }
        return !child;
      });
    }
    const reusable = new Map();
    for (const node of model.nodes) {
      const block = workspace.getBlockById(node.id);
      if (block && !block.getParent() && !block.getNextBlock() && matches(block, node)) reusable.set(node.id, block);
    }
    for (const block of workspace.getTopBlocks(false)) {
      if (!reusable.has(block.id)) block.dispose(false);
    }
    function updateMetadata(block, node) {
      block.sourceNode = node;
      node.slots.forEach((slot, index) => {
        let child = block.getInputTargetBlock(`BODY${index}`);
        for (const childNode of slot.nodes) {
          updateMetadata(child, childNode);
          child = child.getNextBlock();
        }
      });
    }
    function make(node) {
      const block = workspace.newBlock("zbc_source", node.id);
      block.loadExtraState(node);
      node.slots.forEach((slot, index) => {
        let connection = block.getInput(`BODY${index}`).connection;
        for (const child of slot.nodes) {
          const childBlock = make(child);
          connection.connect(childBlock.previousConnection);
          connection = childBlock.nextConnection;
        }
      });
      block.initSvg?.();
      block.render?.();
      return block;
    }
    let offset = 25;
    model.nodes.forEach(node => {
      const existing = reusable.get(node.id);
      const block = existing || make(node);
      if (existing) updateMetadata(block, node);
      const position = positions[node.id];
      if (!existing) block.moveBy(position?.x ?? 30, position?.y ?? offset);
      offset += (block.getHeightWidth?.().height || 100) + 35;
    });
    if (workspace.rendered) Blockly.renderManagement.triggerQueuedRenders(workspace);
    separateRoots(workspace);
  } finally { Blockly.Events.enable(); }
}

export function separateRoots(workspace) {
  const occupied = [];
  Blockly.Events.disable();
  try {
    for (const block of workspace.getTopBlocks(false)) {
      const point = block.getRelativeToSurfaceXY();
      const size = block.getHeightWidth?.() || { width: 200, height: 100 };
      const rectangle = { x: point.x, y: point.y, width: size.width, height: size.height };
      let collision;
      while ((collision = occupied.find(other => rectangle.x < other.x + other.width + 35
        && rectangle.x + rectangle.width + 35 > other.x && rectangle.y < other.y + other.height + 35
        && rectangle.y + rectangle.height + 35 > other.y))) rectangle.y = collision.y + collision.height + 35;
      if (rectangle.y !== point.y) block.moveBy(0, rectangle.y - point.y);
      occupied.push(rectangle);
    }
  } finally { Blockly.Events.enable(); }
}

export function blockParts(block) {
  return block.sourceNode.parts.map((part, partIndex) => {
    let result = part;
    const fields = (block.sourceNode.fields || []).map((field, index) => ({ ...field, name: `EDIT${index}` })).filter(field => field.part === partIndex).sort((left, right) => left.start - right.start || left.end - right.end);
    for (const field of fields.reverse()) result = result.slice(0, field.start) + block.getFieldValue(field.name) + result.slice(field.end);
    return result;
  });
}

export function workspaceModel(workspace, model) {
  const seen = new Set();
  let cursor = 0;
  function chain(first) {
    const nodes = [];
    for (let block = first; block; block = block.getNextBlock()) {
      if (seen.has(block.id)) throw new Error("Repeated block in source tree");
      seen.add(block.id);
      const node = block.sourceNode;
      if (!node) throw new Error("Unsupported block");
      const parts = blockParts(block);
      cursor += node.leading.length;
      const start = cursor;
      cursor += parts[0].length;
      const slots = node.slots.map((slot, index) => {
        const children = chain(block.getInputTargetBlock(`BODY${index}`));
        cursor += slot.trailing.length + parts[index + 1].length;
        return { nodes: children, trailing: slot.trailing };
      });
      nodes.push({ ...node, id: block.id, start, end: cursor, parts, slots });
    }
    return nodes;
  }
  const order = new Map(model.nodes.map((node, index) => [node.id, index]));
  const roots = workspace.getTopBlocks(false).sort((left, right) => (order.get(left.id) ?? Infinity) - (order.get(right.id) ?? Infinity));
  return { nodes: roots.flatMap(chain), trailing: model.trailing };
}

export function workspaceSource(workspace, model) {
  const current = workspaceModel(workspace, model);
  return current.nodes.map(printNode).join("") + current.trailing;
}

export function blockPositions(workspace) {
  return Object.fromEntries(workspace.getTopBlocks(false).map(block => {
    const point = block.getRelativeToSurfaceXY();
    return [block.id, { x: point.x, y: point.y }];
  }));
}

export function selectedSource(block) {
  return block?.sourceNode ? printNode(block.sourceNode).slice(block.sourceNode.leading.length) : "";
}
