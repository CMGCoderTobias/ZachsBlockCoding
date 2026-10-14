const net = require("net");
const fs = require("fs");
const path = require("path");
const { clipboard } = require("electron");
const { channel } = require("../vscode-extension/protocol.cjs");

module.exports = async function checkWorkspace(win, runtime) {
  const checks = [];
  const evaluate = code => win.webContents.executeJavaScript(code);
  async function until(code, label) {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await evaluate(code)) { checks.push(label); return; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`${label}: timed out: ${await evaluate("document.querySelector('#status').textContent")}`);
  }
  const click = action => evaluate(`document.querySelector('[data-action="${action}"]').click()`);
  const file = name => evaluate(`[...document.querySelectorAll('.fileEntry')].find(element => element.textContent === ${JSON.stringify(name)}).click()`);
  await click("folder");
  await until(`!!document.querySelector('.fileEntry[data-file="one.js"]')`, "folder explorer lists project files");
  await file("one.js");
  await until(`document.querySelector('#source').value === 'const first = 1;'`, "first folder file opens in a tab");
  await evaluate(`document.querySelector('#source').value='const first = 11;'; document.querySelector('#source').dispatchEvent(new Event('input',{bubbles:true}));`);
  await until(`document.querySelector('#status').textContent.includes('synchronized')`, "first tab edited");
  await file("two.js");
  await until(`document.querySelector('#source').value === 'const second = 2;'`, "second file opens without discarding first");
  await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(button => button.title.endsWith('one.js')).click()`);
  await until(`document.querySelector('#source').value === 'const first = 11;'`, "switching tabs preserves unsaved text");
  await click("undo");
  await until(`document.querySelector('#source').value === 'const first = 1;'`, "undo history belongs to each file");
  await click("redo");
  await until(`document.querySelector('#source').value === 'const first = 11;'`, "redo history survives file switches");
  await file("notes.txt");
  await until(`document.querySelector('.workbench').classList.contains('text-only') && document.querySelector('#source').value === 'Project notes'`, "non-JavaScript file opens as text without fake blocks");
  await evaluate(`document.querySelector('.fileTree details').open=true`);
  await until(`!![...document.querySelectorAll('.fileEntry')].find(element=>element.textContent === 'nested.js')`, "nested directory loads on expansion");
  await file("windows.js");
  await until(`document.querySelector('#filename').textContent.endsWith('windows.js') && document.querySelector('#status').textContent.includes('synchronized')`, "Windows CRLF file produces working blocks");
  await click("save");
  await until(`document.querySelector('#status').textContent.includes('Saved ordinary')`, "unchanged Windows file saved");
  const windowsFile = path.join(runtime, 'smoke-project', 'windows.js');
  if (fs.readFileSync(windowsFile, 'utf8') !== '\uFEFFconst windows = 1;\r\nconst untouched = 2;\r\n') throw new Error('Opening/saving changed BOM or line endings');
  await evaluate(`document.querySelector('#source').value=document.querySelector('#source').value.replace('windows = 1','windows = 11');document.querySelector('#source').dispatchEvent(new Event('input',{bubbles:true}));`);
  await until(`document.querySelector('#status').textContent.includes('synchronized')`, "Windows file edited");
  await click("save");
  await until(`document.querySelector('#status').textContent.includes('Saved ordinary')`, "edited Windows file saved");
  if (fs.readFileSync(windowsFile, 'utf8') !== '\uFEFFconst windows = 11;\r\nconst untouched = 2;\r\n') throw new Error('Editing normalized unaffected line endings');
  await click("connect");
  await until(`document.querySelector('#connectionStatus').textContent.includes('Pairing code copied')`, "live connection pairing is explicit");
  const [, port, token] = clipboard.readText().split(":");
  const socket = net.createConnection({ host: "127.0.0.1", port: Number(port) });
  let document = { uri: "file:///D:/remote-smoke.js", name: "remote-smoke.js", languageId: "javascript", text: "const value = 1;", version: 1, dirty: true };
  let edits = 0;
  const send = channel(socket, message => {
    if (message.type === "ready") send({ type: "snapshot", ...document, active: true });
    if (message.type === "edit") {
      if (message.baseVersion !== document.version) throw new Error("Test client received stale edit");
      document = { ...document, text: document.text.slice(0, message.start) + message.text + document.text.slice(message.end), version: document.version + 1 };
      edits++;
      send({ type: "result", requestId: message.requestId, ok: true, document });
    }
    if (message.type === "focus" || message.type === "save") send({ type: "result", requestId: message.requestId, ok: true, document });
  });
  socket.on("connect", () => send({ type: "hello", protocol: 1, token }));
  socket.on("error", () => {});
  try {
    await until(`document.querySelector('#source').value === 'const value = 1;' && document.querySelector('#source').readOnly`, "unsaved editor snapshot opens a connected tab");
    await until(`getComputedStyle(document.querySelector('.sourcePanel')).display === 'none' && getComputedStyle(document.querySelector('.inspector')).display === 'none'`, "connected blocks-only mode hides both typing panes");
    await until(`document.querySelector('[data-action="saveAs"]').disabled && document.querySelector('[data-action="open"]').disabled`, "connected mode pauses independent disk operations");
    send({ type: "unavailable", message: "No blocks for python: JavaScript/JSX only." });
    await until(`document.querySelector('#blockly').hidden && document.querySelector('#status').textContent.includes('python') && document.querySelector('[data-action="apply"]').disabled`, "unsupported active language hides stale blocks and warns");
    send({ type: "snapshot", ...document, active: true });
    await until(`!document.querySelector('#blockly').hidden && !document.querySelector('#blockly').inert`, "returning to supported editor restores blocks");
    await evaluate(`(() => {
      const field=[...document.querySelectorAll('.blocklyEditableField')].find(element=>element.textContent==='1');
      const box=field.getBoundingClientRect();
      const props={bubbles:true,pointerId:9,pointerType:'mouse',button:0,clientX:box.x+5,clientY:box.y+5};
      field.dispatchEvent(new PointerEvent('pointerdown',{...props,buttons:1}));
      document.dispatchEvent(new PointerEvent('pointerup',{...props,buttons:0}));
    })()`);
    await until(`!!document.querySelector('.blocklyHtmlInput')`, "connected block field opens");
    await evaluate(`(() => {const input=document.querySelector('.blocklyHtmlInput');input.value='2';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}));})()`);
    await until(`document.querySelector('#source').value === 'const value = 2;' && document.querySelector('#status').textContent.includes('synchronized')`, "block edit is acknowledged by live editor");
    if (edits !== 1 || document.text !== "const value = 2;") throw new Error("Live block edit did not reach editor exactly once");
    document = { ...document, version: 3, text: "const value = 3;" };
    send({ type: "snapshot", ...document });
    await until(`document.querySelector('#source').value === 'const value = 3;' && [...document.querySelectorAll('.blocklyEditableField')].some(element=>element.textContent==='3')`, "unsaved editor change updates existing blocks without echo");
    await evaluate(`(() => {
      const field=[...document.querySelectorAll('.blocklyEditableField')].find(element=>element.textContent==='3');
      const box=field.getBoundingClientRect();
      const props={bubbles:true,pointerId:10,pointerType:'mouse',button:0,clientX:box.x+5,clientY:box.y+5};
      field.dispatchEvent(new PointerEvent('pointerdown',{...props,buttons:1}));
      document.dispatchEvent(new PointerEvent('pointerup',{...props,buttons:0}));
    })()`);
    await until(`!!document.querySelector('.blocklyHtmlInput')`, "field draft opens before concurrent editor change");
    await evaluate(`document.querySelector('.blocklyHtmlInput').value='33';document.querySelector('.blocklyHtmlInput').dispatchEvent(new Event('input',{bubbles:true}));`);
    await new Promise(resolve => setTimeout(resolve, 200));
    document = { ...document, version: 4, text: "const value = 4;" };
    send({ type: "snapshot", ...document });
    await until(`!document.querySelector('#externalNotice').hidden`, "concurrent live edit shows conflict instead of replacing draft");
    await evaluate(`document.querySelector('.blocklyHtmlInput').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}));`);
    await until(`document.querySelector('#source').value === 'const value = 33;'`, "local field draft remains available during conflict");
    if (edits !== 1 || document.text !== 'const value = 4;') throw new Error("Concurrent local draft overwrote live editor");
    await click("reload");
    await until(`document.querySelector('#source').value === 'const value = 4;' && document.querySelector('#externalNotice').hidden`, "explicit reload resolves live version conflict");
    socket.destroy();
    await until(`!document.querySelector('#source').readOnly && !document.querySelector('.app').classList.contains('blocks-only') && document.querySelector('#source').value === 'const value = 4;'`, "disconnect restores standalone typing and preserves text");
    return checks;
  } finally { socket.destroy(); }
};
