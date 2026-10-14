import * as Blockly from "blockly";
import { javascriptGenerator } from "blockly/javascript";

import baseJsPack from "../packs/builtin/base-js/pack.js";

const BUILTIN_PACKS = {
  "builtin:base-js": baseJsPack,
};

export function listBuiltinPacks() {
  return Object.entries(BUILTIN_PACKS).map(([id, pack]) => ({
    id,
    name: pack.name,
    version: pack.version,
    supportedLanguages: pack.supportedLanguages,
    description: pack.description,
  }));
}

export function resolvePack(id) {
  return BUILTIN_PACKS[id] || null;
}

export function applyEnabledPacks({ workspace, enabledPackIds }) {
  const enabled = enabledPackIds.map(resolvePack).filter(Boolean);

  const toolboxXml = buildToolboxXml(enabled);

  for (const pack of enabled) {
    pack.register?.({
      Blockly,
      generators: { js: javascriptGenerator },
    });
  }

  return { toolboxXml, packs: enabled };
}

function buildToolboxXml(packs) {
  const categories = [];
  for (const pack of packs) {
    const xml = pack.toolboxXml?.("js");
    if (xml) categories.push(xml);
  }

  return `<xml id="toolbox" style="display:none">\n${categories.join("\n")}\n</xml>`;
}

