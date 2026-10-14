import { definePack } from "../../../core/packTypes.js";
import { registerBlocks } from "./registerBlocks.js";
import { toolboxXml } from "./toolbox.js";

export default definePack({
  name: "Base JavaScript",
  version: "0.1.0",
  description: "Core JavaScript blocks (no external libraries).",
  supportedLanguages: ["js"],

  register({ Blockly, generators }) {
    registerBlocks({ Blockly, generators });
  },

  toolboxXml(language) {
    if (language !== "js") return "";
    return toolboxXml();
  },
});
