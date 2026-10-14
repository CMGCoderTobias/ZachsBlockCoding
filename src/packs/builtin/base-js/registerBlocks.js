export function registerBlocks({ Blockly, generators }) {
  // For the initial built-in JS pack we rely on Blockly's built-in blocks
  // (logic, loops, math, text, lists, variables, procedures).
  //
  // We also provide a "raw code" block for anything that doesn't have a
  // structured converter yet. This supports the "code is source-of-truth"
  // workflow: blocks can visualize/reuse typed code without trying to infer
  // semantics.

  Blockly.Blocks["zbc_raw_js"] = {
    init() {
      this.appendDummyInput()
        .appendField("Raw JS");
      this.appendDummyInput()
        .appendField(new Blockly.FieldMultilineInput(""), "CODE");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(15);
      this.setTooltip("Paste/type JavaScript that will be emitted verbatim.");
      this.setHelpUrl("");
    },
  };

  if (generators?.js) {
    generators.js.forBlock["zbc_raw_js"] = (block) => {
      const code = block.getFieldValue("CODE") || "";
      return code.trimEnd() + "\n";
    };
  }
}
