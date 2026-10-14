const fs = require("fs");
const path = require("path");

module.exports = async function checkEditorSync(win, runtime) {
  const checks = [];
  const evaluate = code => win.webContents.executeJavaScript(code);
  async function until(code, label) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(code)) { checks.push(label); return; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`${label}: timed out`);
  }
  const input = path.join(runtime, "smoke-input.js");
  const original = fs.readFileSync(input, "utf8");
  try {
    await evaluate(`(() => { const tab=[...document.querySelectorAll('[role="tab"]')].find(element => element.title.endsWith('smoke-saved.js')); if(tab) tab.parentElement.querySelector('.closeTab').click(); })()`);
    await until(`![...document.querySelectorAll('[role="tab"]')].some(element => element.title.endsWith('smoke-saved.js'))`, "previous saved tab closes before separate sync test");
    await evaluate(`document.querySelector('[data-action="open"]').click()`);
    await until(`document.querySelector('#filename').textContent.includes('smoke-input.js') && document.querySelector('#source').value === ${JSON.stringify(original)}`, "shared file opened for sync test");
    fs.writeFileSync(input, 'const externalValue = 10;\n');
    await until(`document.querySelector('#source').value === 'const externalValue = 10;\\n' && document.querySelector('#status').textContent.includes('synchronized')`, "external save reloads clean source and blocks");
    await evaluate(`document.querySelector('#source').value = 'const localValue = 20;'; document.querySelector('#source').dispatchEvent(new Event('input', {bubbles:true}));`);
    await until(`document.querySelector('#status').textContent.includes('synchronized')`, "local edit before external conflict");
    fs.writeFileSync(input, 'const externalValue = 30;\n');
    await until(`!document.querySelector('#externalNotice').hidden`, "external save shows persistent conflict warning");
    if (!await evaluate(`document.querySelector('#source').value === 'const localValue = 20;'`)) throw new Error("External save overwrote unsaved local edits");
    await evaluate(`document.querySelector('[data-action="save"]').click()`);
    await until(`document.querySelector('#status').textContent.includes('External edits are waiting')`, "conflicted save blocked");
    if (fs.readFileSync(input, 'utf8') !== 'const externalValue = 30;\n') throw new Error("Local save overwrote external edits");
    await evaluate(`document.querySelector('[data-action="reload"]').click()`);
    await until(`document.querySelector('#source').value === 'const externalValue = 30;\\n' && document.querySelector('#externalNotice').hidden`, "explicit reload resolves conflict");
    fs.writeFileSync(input, original);
    await until(`document.querySelector('#source').value === ${JSON.stringify(original)}`, "shared source restored");
    await evaluate(`document.querySelector('[data-action="saveAs"]').click()`);
    await until(`document.querySelector('#filename').textContent.includes('smoke-saved.js') && document.querySelector('#status').textContent.includes('Saved ordinary')`, "shared file saved normally after reload");
    return checks;
  } finally { fs.writeFileSync(input, original); }
};
