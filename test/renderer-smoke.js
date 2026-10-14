(async () => {
  const checks = [];
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  async function until(condition, label) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (condition()) { checks.push(label); return; }
      await pause(100);
    }
    throw new Error(label + ": timed out. " + document.querySelector("#status")?.textContent);
  }
  const source = document.querySelector("#source");
  const status = document.querySelector("#status");
  const click = action => document.querySelector(`[data-action="${action}"]`).click();
  const setSource = text => { source.value = text; source.dispatchEvent(new Event("input", { bubbles: true })); };
  try {
    await until(() => status.textContent.includes("synchronized"), "initial synchronization");
    if (document.querySelectorAll(".blocklyDraggable").length < 8) throw new Error("Nested blocks did not render");
    checks.push("nested blocks rendered");
    const rectangles = [...document.querySelectorAll('#blockly .blocklyBlockCanvas > .blocklyDraggable')].filter(block => !block.closest('.blocklyFlyout')).map(block => block.getBoundingClientRect());
    if (rectangles.length < 2) throw new Error("Could not measure independent rendered blocks");
    for (let index = 0; index < rectangles.length; index++) for (const other of rectangles.slice(index + 1)) {
      const rectangle = rectangles[index];
      if (rectangle.left < other.right && rectangle.right > other.left && rectangle.top < other.bottom && rectangle.bottom > other.top) throw new Error("Rendered independent blocks overlap");
    }
    checks.push("measured independent SVG block trees do not overlap");
    click("run");
    await until(() => document.querySelector("#output").textContent.includes("[log] 6"), "example runtime output");
    const original = source.value;
    function pointer(target, type, point, buttons = 0) {
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: "mouse", button: 0, buttons, clientX: point.x, clientY: point.y }));
    }
    const field = [...document.querySelectorAll('.blocklyEditableField')].find(element => element.textContent === 'greet');
    if (!field) throw new Error("Function name is not an editable field");
    const fieldBox = field.getBoundingClientRect();
    const fieldPoint = { x: fieldBox.x + fieldBox.width / 2, y: fieldBox.y + fieldBox.height / 2 };
    pointer(field, "pointerdown", fieldPoint, 1);
    pointer(document, "pointerup", fieldPoint);
    await until(() => document.querySelector('.blocklyHtmlInput'), "on-block field opens input");
    const fieldInput = document.querySelector('.blocklyHtmlInput');
    fieldInput.value = 'welcome';
    fieldInput.dispatchEvent(new Event('input', { bubbles: true }));
    await pause(350);
    if (source.value !== original) throw new Error("Field reparsed before editing finished");
    fieldInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    await until(() => source.value.includes('function welcome(name)'), "direct field edit updates authoritative code");
    click('undo');
    await until(() => source.value === original && !document.querySelector('#blockly').inert, "undo direct field edit");
    await until(() => [...document.querySelectorAll('.blocklyToolboxCategory')].some(element => element.textContent.includes('Loops')), "premade toolbox categories loaded");
    const loops = [...document.querySelectorAll('.blocklyToolboxCategory')].find(element => element.textContent.includes('Loops'));
    const loopBox = loops.getBoundingClientRect();
    pointer(loops, 'pointerdown', { x: loopBox.x + 10, y: loopBox.y + 10 }, 1);
    pointer(document, 'pointerup', { x: loopBox.x + 10, y: loopBox.y + 10 });
    await until(() => document.querySelector('.blocklyFlyout .blocklyDraggable'), 'loop blocks visible in flyout');
    const premade = document.querySelector('.blocklyFlyout .blocklyDraggable .blocklyPath');
    const premadeBox = premade.getBoundingClientRect();
    const hostBox = document.querySelector('#blockly').getBoundingClientRect();
    const from = { x: premadeBox.x + 20, y: premadeBox.y + 15 };
    const to = { x: hostBox.right - 175, y: hostBox.y + hostBox.height * 0.65 };
    pointer(premade, 'pointerdown', from, 1);
    for (let step = 1; step <= 8; step++) {
      pointer(document, 'pointermove', { x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8 }, 1);
      await pause(35);
    }
    pointer(document, 'pointerup', to);
    await until(() => source.value.includes('for (let index = 0; index < 10; index++)'), 'dragged premade loop generates code');
    click('undo');
    await until(() => source.value === original, 'undo toolbox insertion');
    window.confirm = () => true;
    click('blank');
    await until(() => source.value === '' && status.textContent.includes('0 independent'), 'New JS creates empty authoring canvas');
    click('new');
    await until(() => source.value === original && status.textContent.includes('synchronized'), 'example restores after empty file');
    setSource(original + '\nconsole.log("new statement");\n');
    await until(() => status.textContent.includes("5 independent"), "manual edit adds a new section");
    setSource("function unfinished(");
    await until(() => status.textContent.includes("warning block"), "invalid source renders warning fallback");
    if (document.querySelector("#blockly").inert) throw new Error("Fallback blocks are still disabled");
    if (!document.querySelector(".syntaxWarning")) throw new Error("Missing prominent syntax warning");
    if (source.value !== "function unfinished(") throw new Error("Invalid source was overwritten");
    setSource(original);
    await until(() => status.textContent.includes("synchronized"), "valid source restores blocks");
    const shape = document.querySelector("g.blocklyDraggable .blocklyPath");
    const box = shape.getBoundingClientRect();
    shape.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: box.x + 20, clientY: box.y + 15 }));
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, pointerType: "mouse", button: 0, clientX: box.x + 20, clientY: box.y + 15 }));
    await until(() => !document.querySelector("#blockText").disabled, "select block opens source inspector");
    const detail = document.querySelector("#blockText");
    detail.value = detail.value.replace('"Hello, "', '"Welcome, "');
    click("apply");
    await until(() => source.value.includes('"Welcome, "'), "block edit updates source");
    click("undo");
    await until(() => source.value === original, "undo block edit");
    click("redo");
    await until(() => source.value.includes('"Welcome, "'), "redo block edit");
    setSource("while (true) {}");
    await until(() => status.textContent.includes("synchronized"), "loop source synchronized");
    click("run");
    await until(() => document.querySelector("#output").textContent.includes("Stopped after"), "infinite loop terminated without freezing UI");
    setSource('import {\n  first,\n  second,\n} from "pkg";');
    await until(() => status.textContent.includes("synchronized"), "import ready for list authoring");
    function selectFirstRoot() {
      const block = [...document.querySelectorAll('#blockly .blocklyBlockCanvas > .blocklyDraggable')].find(element => !element.closest('.blocklyFlyout'));
      const shape = block.querySelector('.blocklyPath');
      const rectangle = shape.getBoundingClientRect();
      const point = { x: rectangle.x + 18, y: rectangle.y + 12 };
      pointer(shape, 'pointerdown', point, 1); pointer(document, 'pointerup', point);
    }
    selectFirstRoot();
    await until(() => !document.querySelector('[data-action="lists"]').disabled, "selected import exposes list editor");
    click('lists');
    await until(() => document.querySelector('dialog[open] [aria-label="New list item"]'), "structured list editor opens");
    document.querySelector('[aria-label="New list item"]').value = 'third as alias';
    [...document.querySelectorAll('dialog button')].find(button => button.textContent === 'Add item').click();
    await until(() => source.value.includes('  third as alias,\n}') && document.querySelectorAll('dialog .listItem').length === 3, "add import manages comma and multiline layout");
    [...document.querySelectorAll('dialog .listItem button')].find(button => button.textContent === 'Remove').click();
    await until(() => !source.value.includes('first') && document.querySelectorAll('dialog .listItem').length === 2, "remove import repairs commas");
    document.querySelector('dialog').close();
    const literal = 'paragraph content '.repeat(22) + 'COMPLETE_END';
    setSource(`console.log(${JSON.stringify(literal)});`);
    await until(() => status.textContent.includes('synchronized'), "long literal synchronized");
    const wrapped = [...document.querySelectorAll('#blockly .blocklyEditableField')].find(field => field.textContent.includes('COMPLETE_END'));
    if (!wrapped || wrapped.querySelectorAll('tspan').length < 2 || !wrapped.textContent.includes(literal)) throw new Error('Long editable literal was truncated instead of wrapped');
    checks.push('long literal renders complete across multiple SVG lines');
    const visibleHelpers = () => [...document.querySelectorAll('#blockly text')].filter(field => /no\sawait|Change\sfunction/.test(field.textContent) && getComputedStyle(field).visibility !== 'hidden' && field.getBoundingClientRect().width > 0);
    if (visibleHelpers().length) throw new Error('Unselected helper controls clutter the block view');
    checks.push('unselected optional helpers are hidden');
    selectFirstRoot();
    await until(() => visibleHelpers().length >= 2, "selecting call reveals optional helper controls");
    click('reference');
    await until(() => document.querySelector('dialog[open] [aria-label="Search expressions"]'), "expression reference opens");
    const search = document.querySelector('[aria-label="Search expressions"]'); search.value = 'process.chdir'; search.dispatchEvent(new Event('input'));
    if (document.querySelectorAll('.referenceCard').length !== 1) throw new Error('Expression search did not filter reference');
    document.querySelector('.referenceCard button').click();
    await until(() => source.value.includes('process.chdir("./project");') && !document.querySelector('dialog').open, "reference inserts selected example without running it");
    window.confirm = () => true;
    click("open");
    await until(() => document.querySelector("#filename").textContent.includes("smoke-input.js") && status.textContent.includes("synchronized"), "open an existing app file through Electron bridge");
    click("saveAs");
    await until(() => document.querySelector("#filename").textContent.includes("smoke-saved.js") && status.textContent.includes("Saved ordinary"), "save source and layout through Electron bridge");
    setSource(original);
    await until(() => status.textContent.includes("4 independent"), "restored example");
    click("fit");
    click("run");
    await until(() => document.querySelector("#output").textContent.includes("[log] 6"), "final example run");
    await pause(400);
    return { ok: true, checks };
  } catch (error) { return { ok: false, checks, error: error.stack }; }
})()
