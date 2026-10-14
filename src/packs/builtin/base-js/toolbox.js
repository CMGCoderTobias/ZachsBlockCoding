export function toolboxXml() {
  // Keep this minimal for now. We can grow categories as we build.
  return `
    <category name="Raw" colour="#4a90e2">
      <block type="zbc_raw_js"></block>
    </category>
    <category name="Logic" categorystyle="logic_category">
      <block type="controls_if"></block>
      <block type="logic_compare"></block>
      <block type="logic_operation"></block>
      <block type="logic_boolean"></block>
      <block type="logic_null"></block>
      <block type="logic_ternary"></block>
    </category>
    <category name="Loops" categorystyle="loop_category">
      <block type="controls_repeat_ext">
        <value name="TIMES">
          <shadow type="math_number">
            <field name="NUM">10</field>
          </shadow>
        </value>
      </block>
      <block type="controls_whileUntil"></block>
      <block type="controls_for">
        <value name="FROM">
          <shadow type="math_number">
            <field name="NUM">1</field>
          </shadow>
        </value>
        <value name="TO">
          <shadow type="math_number">
            <field name="NUM">10</field>
          </shadow>
        </value>
        <value name="BY">
          <shadow type="math_number">
            <field name="NUM">1</field>
          </shadow>
        </value>
      </block>
    </category>
    <category name="Math" categorystyle="math_category">
      <block type="math_number"></block>
      <block type="math_arithmetic"></block>
      <block type="math_round"></block>
      <block type="math_random_int"></block>
    </category>
    <category name="Text" categorystyle="text_category">
      <block type="text"></block>
      <block type="text_join"></block>
      <block type="text_length"></block>
      <block type="text_print"></block>
    </category>
    <category name="Lists" categorystyle="list_category">
      <block type="lists_create_with"></block>
      <block type="lists_length"></block>
      <block type="lists_getIndex"></block>
    </category>
    <category name="Variables" categorystyle="variable_category" custom="VARIABLE"></category>
    <category name="Functions" categorystyle="procedure_category" custom="PROCEDURE"></category>
  `;
}
