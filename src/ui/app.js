import * as Blockly from "blockly";
import { parseSource, parseEditableSource, printModel, replaceSourceRange, visitNodes } from "../core/sourceModel.js";
import { registerSourceBlocks, renderSource, separateRoots, showBlockHelpers, workspaceModel, blockPositions, selectedSource } from "./sourceBlocks.js";
import { createAuthoringTools } from "./authoringTools.js";
import { createToolbox } from "./blockTemplates.js";
import { createFileBrowser } from "./fileBrowser.js";
import { editorText, savedText } from "../core/documentText.js";
import { runJavaScript } from "./runner.js";

const SAMPLE = `function greet(name) {\n  if (name) {\n    console.log("Hello, " + name);\n  } else {\n    console.log("Hello!");\n  }\n}\n\nfunction total(values) {\n  return values.reduce((sum, value) => sum + value, 0);\n}\n\ngreet("Zach");\nconsole.log(total([1, 2, 3]));\n`;
const SNIPPETS = { log: 'console.log("Hello");', variable: 'const value = 1;', condition: 'if (true) {\n  console.log("Inside if");\n}', function: 'function example() {\n  return 1;\n}' };
Object.assign(SNIPPETS, {
  for: 'for (let index = 0; index < 10; index++) {\n  console.log(index);\n}',
  forOf: 'for (const item of items) {\n  console.log(item);\n}',
  while: 'while (false) {\n  break;\n}',
  ifElse: 'if (true) {\n  console.log("Yes");\n} else {\n  console.log("No");\n}',
  tryCatch: 'try {\n  console.log("Try");\n} catch (error) {\n  console.error(error);\n}',
  asyncFunction: 'async function exampleAsync() {\n  return await Promise.resolve(1);\n}',
  class: 'class Example {\n  constructor() {\n    this.value = 1;\n  }\n}',
});

export function initApp(root) {
  root.innerHTML = `<div class="app">
    <header class="topbar"><div class="brand"><h1>ZachsBlockCoding</h1><span class="pill">JavaScript prototype</span></div>
    <div class="actions"><button class="btn" data-action="blank">New JS</button><button class="btn" data-action="new">Example</button><button class="btn" data-action="open">Open JS</button><button class="btn primary" data-action="save">Save</button><button class="btn" data-action="saveAs">Save As</button><button class="btn" data-action="undo">Undo</button><button class="btn" data-action="redo">Redo</button><button class="btn" data-action="run">Run JS</button><button class="btn" data-action="stop">Stop</button></div></header>
    <div class="statusArea"><div class="documentTools"><button class="btn" data-action="folder">Open Folder</button><button class="btn" data-action="connect">Connect VS Code</button><button class="btn" data-action="disconnect">Disconnect</button><button class="btn" data-action="toggleMode" id="toggleMode" disabled>Blocks only</button><span id="connectionStatus">Standalone</span></div><div id="tabs" role="tablist" aria-label="Open files"></div><div class="status"><span id="filename">Untitled.js</span><span id="status" role="status">Loading parser…</span><span id="syncState"></span><button class="btn" data-action="reload">Reload from disk</button></div><div id="externalNotice" class="syntaxWarning" role="alert" hidden></div></div>
    <main class="workbench"><aside class="panel explorer" hidden><div class="panelHeader"><span class="folderName">Folder</span><button class="btn" data-action="refreshFolder">↻</button></div><div class="fileTree"></div></aside><section class="panel blocksPanel"><div class="panelHeader"><span class="title">Blocks · drag from categories · click white fields to edit</span><button class="btn" data-action="fit">Fit</button></div><div id="blockly" class="blocklyHost"></div></section>
    <section class="panel sourcePanel"><div class="panelHeader"><label class="title" for="source">JavaScript · source of truth</label></div><textarea id="source" class="editor" spellcheck="false" aria-label="JavaScript source"></textarea></section></main>
    <section class="panel inspector"><div class="panelHeader"><label for="blockText" id="selection" class="title">Select a block to edit its code</label><div class="actions"><select id="snippet" aria-label="Snippet"><option value="log">Console log</option><option value="variable">Variable</option><option value="condition">If statement</option><option value="function">Function</option></select><button class="btn" data-action="insert">Insert at code cursor</button><button class="btn primary" data-action="apply">Apply block edit</button></div></div><textarea id="blockText" class="editor" spellcheck="false" aria-label="Selected block source" disabled></textarea></section>
    <pre id="output" class="output" aria-label="Run output">Run executes browser JavaScript in a disposable worker. Node imports and DOM APIs are not supported yet.</pre></div>`;
  const source = root.querySelector("#source");
  for (const [action, label, selector] of [["forget", "Forget pairing", ".documentTools"], ["lists", "Edit list…", ".blocksPanel .panelHeader"], ["reference", "Expression reference", ".blocksPanel .panelHeader"]]) {
    const button = document.createElement("button");
    button.className = "btn"; button.dataset.action = action; button.textContent = label;
    root.querySelector(selector).append(button);
  }
  const snippetSelect = root.querySelector("#snippet");
  for (const [value, label] of Object.entries({ for: "For loop", forOf: "For each item", while: "While loop", ifElse: "If / else", tryCatch: "Try / catch", asyncFunction: "Async function", class: "Class" })) {
    snippetSelect.add(new Option(label, value));
  }
  const detail = root.querySelector("#blockText");
  const status = root.querySelector("#status");
  const filename = root.querySelector("#filename");
  const output = root.querySelector("#output");
  const host = root.querySelector("#blockly");
  registerSourceBlocks();
  const workspace = Blockly.inject(host, { toolbox: { kind: "categoryToolbox", contents: [{ kind: "category", name: "Loading…", contents: [] }] }, trashcan: true, scrollbars: true, zoom: { controls: true, wheel: true }, grid: { spacing: 20, length: 2, colour: "#52647e", snap: false } });
  let model = null;
  let selectedId = null;
  let revision = 0;
  let debounce;
  let fileToken = null;
  let savedSource = "";
  let currentName = "Untitled.js";
  let runController = null;
  let runRevision = 0;
  let positions = {};
  let history = [];
  let historyIndex = -1;
  let disposed = false;
  let blockDebounce;
  let blocksPending = false;
  let baseHash = null;
  let externalConflict = false;
  const tabs = new Map();
  const closedRemoteViews = new Set();
  let activeTab = null;
  let remote = null;
  let blocksOnly = false;
  let switching = false;
  let switchChain = Promise.resolve();
  let editorConnected = false;
  let remoteUnavailable = false;
  let unavailableMessage = "";
  let editorQueue = Promise.resolve();
  const fileBrowser = createFileBrowser(root.querySelector(".explorer"), async relative => {
    if (editorConnected) throw new Error("Select files in VS Code while connected; disconnect to browse standalone files.");
    if (tabs.size >= 20) throw new Error("Close a tab before opening more files (20-tab limit).");
    const result = await window.zbc.openProjectSource(relative);
    if (result.error) throw new Error(result.error);
    await openResult(result);
  }, message => { status.textContent = message; });
  const externalNotice = root.querySelector("#externalNotice");
  const authoring = createAuthoringTools(root, () => {
    if (host.inert || blocksPending || Blockly.WidgetDiv.isVisible()) throw new Error("Finish the current edit and wait for synchronization first.");
    const block = workspace.getBlockById(selectedId);
    return block ? { text: selectedSource(block), start: block.sourceNode.start, end: block.sourceNode.end, revision, tab: activeTab.id } : null;
  }, async (selection, replacement) => {
    if (selection.tab !== activeTab.id || selection.revision !== revision || source.value.slice(selection.start, selection.end) !== selection.text) throw new Error("Code changed while this list was open. Close and reopen the list to use the latest version.");
    if (externalConflict || remote?.pending) throw new Error("Resolve the connection conflict or pending edit first.");
    await commit(replaceSourceRange(source.value, selection.start, selection.end, replacement));
    if (remote?.connected) await submitRemote();
    let block;
    visitNodes(model, node => { if (node.start === selection.start) block = workspace.getBlockById(node.id); });
    select(block);
  }, async code => {
    if (host.inert || blocksPending || externalConflict || remote?.pending) throw new Error("Finish pending edits or resolve the conflict before inserting an example.");
    const block = workspace.getBlockById(selectedId);
    const offset = block?.sourceNode.end ?? source.value.length;
    await commit(replaceSourceRange(source.value, offset, offset, `\n${code}\n`));
    if (remote?.connected) await submitRemote();
  });
  function clearExternalNotice() {
    externalConflict = false;
    externalNotice.hidden = true;
    externalNotice.textContent = "";
  }
  function pendingEdits() {
    return source.value !== savedSource || blocksPending || Blockly.WidgetDiv.isVisible() || workspace.isDragging()
      || (!detail.disabled && detail.value !== selectedSource(workspace.getBlockById(selectedId)));
  }
  function renderTabs() {
    const bar = root.querySelector("#tabs");
    bar.replaceChildren();
    for (const tab of tabs.values()) {
      const item = document.createElement("div");
      item.className = "fileTab";
      const button = document.createElement("button");
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(tab.id === activeTab?.id));
      const text = tab.id === activeTab?.id ? source.value : tab.source;
      const baseline = tab.id === activeTab?.id ? savedSource : tab.savedSource;
      button.textContent = tab.name.split(/[\\/]/).at(-1) + (tab.remote ? " [VS Code]" : "") + (text !== baseline || tab.remote?.dirty ? " •" : "");
      button.title = tab.name;
      button.dataset.tab = tab.id;
      button.addEventListener("click", () => { void activateTab(tab).catch(error => { status.textContent = error.message; }); });
      const close = document.createElement("button");
      close.textContent = "×";
      close.className = "closeTab";
      close.setAttribute("aria-label", `Close ${tab.name}`);
      close.addEventListener("click", () => { void closeTab(tab).catch(error => { status.textContent = error.message; }); });
      item.append(button, close);
      bar.append(item);
    }
  }
  function stashActive() {
    if (!activeTab) return;
    remember(source.value);
    Object.assign(activeTab, { source: source.value, savedSource, name: currentName, token: fileToken, baseHash, model, selectedId,
      positions: blockPositions(workspace), history, historyIndex, externalConflict, externalMessage: externalNotice.textContent,
      detailDraft: detail.disabled ? null : detail.value, detailDirty: !detail.disabled && detail.value !== selectedSource(workspace.getBlockById(selectedId)), selection: [source.selectionStart, source.selectionEnd], output: output.textContent, remote });
    let size = [...tabs.values()].reduce((total, tab) => total + tab.history.reduce((count, text) => count + text.length, 0), 0);
    for (const tab of tabs.values()) while (size > 8_000_000 && tab !== activeTab && tab.history.length > 1) {
      size -= tab.history.shift().length;
      tab.historyIndex = Math.max(0, tab.historyIndex - 1);
    }
  }
  function newTab(result) {
    if (tabs.size >= 20) throw new Error("Close a tab before opening more files (20-tab limit).");
    const tab = { id: crypto.randomUUID(), name: result.name || "Untitled.js", token: result.token || null,
      source: editorText(result.source || ""), savedSource: editorText(result.savedSource ?? result.source ?? ""), rawSource: result.source || "", baseHash: result.hash || null,
      model: null, selectedId: null, positions: {}, history: [editorText(result.source || "")], historyIndex: 0, externalConflict: false,
      externalMessage: "", detailDraft: null, selection: [0, 0], output: "", remote: result.remote || null, layout: result.layout };
    tabs.set(tab.id, tab);
    return tab;
  }
  async function flushBlocks() {
    Blockly.WidgetDiv.hide();
    if (workspace.isDragging()) throw new Error("Finish dragging before switching files.");
    if (model?.source === source.value && !host.inert && !remote?.pending) {
      const edited = workspaceModel(workspace, model);
      if (printModel(edited) !== source.value) {
        await commit(printModel(edited), false, edited);
        if (remote?.connected) await submitRemote();
      }
    }
  }
  function activateTab(tab, focusEditor = true) {
    const operation = switchChain.then(() => performActivateTab(tab, focusEditor));
    switchChain = operation.catch(() => {});
    return operation;
  }
  async function performActivateTab(tab, focusEditor) {
    if (editorConnected && !tab.remote?.connected) throw new Error("Disconnect VS Code to resume standalone files. While connected, select files in VS Code.");
    if (activeTab === tab) return;
    if (!tabs.has(tab.id)) return;
    switching = true;
    try {
      await flushBlocks();
      stashActive();
      clearTimeout(debounce); clearTimeout(blockDebounce); revision++;
      runController?.abort(); runRevision++;
      Blockly.Events.disable();
      try { workspace.clear(); } finally { Blockly.Events.enable(); }
      activeTab = tab;
      source.value = tab.source; savedSource = tab.savedSource; currentName = tab.name; fileToken = tab.token;
      baseHash = tab.baseHash; model = tab.model; selectedId = tab.selectedId; positions = tab.positions;
      history = tab.history; historyIndex = tab.historyIndex; remote = tab.remote;
      externalConflict = tab.externalConflict;
      externalNotice.hidden = !externalConflict; externalNotice.textContent = tab.externalMessage;
      output.textContent = tab.output;
      await schedule(tab.source, true);
      if (tab.layout && model) {
        for (const node of model.nodes) if (tab.layout[node.start]) positions[node.id] = tab.layout[node.start];
        renderSource(workspace, model, positions);
        tab.layout = null;
      }
      if (tab.detailDraft !== null && !detail.disabled) detail.value = tab.detailDraft;
      source.setSelectionRange(...tab.selection);
      const disk = await window.zbc?.activateSource?.(fileToken);
      if (disk?.error) showConflict(disk.error);
      else if (disk) receiveExternal(disk);
      if (remote?.connected && focusEditor) await window.zbc.requestEditor({ type: "focus", uri: remote.uri });
      updateTitle();
    } finally { switching = false; }
  }
  async function openResult(result) {
    const existing = [...tabs.values()].find(tab => tab.token === result.token && !tab.remote);
    const tab = existing || newTab(result);
    await activateTab(tab);
    if (existing) receiveExternal(result);
  }
  async function closeTab(tab) {
    if (tab === activeTab) { await flushBlocks(); stashActive(); }
    if ((tab.source !== tab.savedSource || tab.externalConflict || tab.detailDirty)
      && !confirm(`Close ${tab.name} and discard local drafts? VS Code-owned text is not closed or discarded.`)) return;
    if (tab === activeTab) {
      const next = [...tabs.values()].find(item => item !== tab) || newTab({ source: "" });
      await activateTab(next);
    }
    tabs.delete(tab.id);
    if (tab.remote) closedRemoteViews.add(tab.remote.uri);
    if (tab.token) await window.zbc?.closeSource?.(tab.token);
    renderTabs();
  }
  function showConflict(message) {
    externalConflict = true;
    externalNotice.hidden = false;
    externalNotice.textContent = message;
  }
  async function applyExternal(update) {
    baseHash = update.hash;
    savedSource = editorText(update.source);
    activeTab.rawSource = update.source;
    clearExternalNotice();
    await commit(editorText(update.source), false);
  }
  function receiveExternal(update) {
    if (disposed || editorConnected || update.token !== fileToken) return;
    if (!update.error && update.hash === baseHash) return;
    if (!update.error && !pendingEdits() && !externalConflict) {
      void applyExternal(update);
      return;
    }
    externalConflict = true;
    externalNotice.hidden = false;
    externalNotice.textContent = update.error || "The file was saved in another editor while you have local edits. Nothing was overwritten. Use Save As to keep your version separately, or Reload from disk to discard local edits and use the disk version.";
  }
  const stopExternalListener = window.zbc?.onExternalSource?.(receiveExternal);
  async function acceptRemote(tab, document) {
    Object.assign(tab.remote, document, { connected: true, latest: document });
    tab.source = editorText(document.text);
    tab.savedSource = editorText(document.text);
    tab.rawSource = document.text;
    tab.name = document.name;
    tab.externalConflict = false;
    tab.externalMessage = "";
    if (tab === activeTab) {
      currentName = tab.name;
      savedSource = tab.savedSource;
      clearExternalNotice();
      await commit(tab.source, false);
    }
    renderTabs();
  }
  async function receiveEditor(event) {
    if (disposed) return;
    if (event.type === "pairing-warning") {
      status.textContent = event.message;
    } else if (event.type === "connected") {
      editorConnected = true;
      await window.zbc?.activateSource?.(null);
      blocksOnly = true;
      root.querySelector("#connectionStatus").textContent = "VS Code connected · loading active editor…";
    } else if (event.type === "unavailable") {
      remoteUnavailable = true;
      unavailableMessage = event.message;
      host.inert = true;
      host.hidden = true;
      status.classList.add("syntaxWarning");
      status.textContent = event.message;
      root.querySelector("#connectionStatus").textContent = "VS Code active file has no block view";
    } else if (event.type === "disconnected" || event.type === "closed") {
      if (event.type === "disconnected") { editorConnected = false; remoteUnavailable = false; host.hidden = false; host.inert = false; }
      for (const tab of tabs.values()) if (tab.remote && (event.type === "disconnected" || tab.remote.uri === event.uri)) {
        tab.remote.connected = false;
        tab.savedSource = "";
        if (tab === activeTab) {
          savedSource = "";
          showConflict("VS Code disconnected or closed this document. Local text is preserved. Use Save As for a standalone copy, or reconnect and Reload from disk / VS Code.");
        }
      }
      root.querySelector("#connectionStatus").textContent = editorConnected ? "VS Code connected" : "Standalone · disconnected";
    } else if (event.type === "snapshot") {
      const document = event.document;
      if (event.active) { remoteUnavailable = false; host.hidden = false; host.inert = false; }
      root.querySelector("#connectionStatus").textContent = "VS Code connected · active files followed automatically";
      if (closedRemoteViews.has(document.uri)) {
        if (!event.active) return;
        closedRemoteViews.delete(document.uri);
      }
      let tab = [...tabs.values()].find(item => item.remote?.uri === document.uri);
      if (!tab) {
        tab = newTab({ name: document.name, source: document.text, remote: { ...document, connected: true, latest: document, pending: false } });
        await activateTab(tab, false);
      } else {
        const link = tab.remote;
        if (document.version < link.version && link.connected) return;
        link.latest = document;
        if (link.pending) return;
        if (!link.connected) {
          const local = tab === activeTab ? source.value : tab.source;
          const draft = tab === activeTab ? blocksPending || Blockly.WidgetDiv.isVisible() || (!detail.disabled && detail.value !== selectedSource(workspace.getBlockById(selectedId))) : tab.detailDirty;
          if (local === editorText(link.text) && !draft) await acceptRemote(tab, document);
          else {
            tab.externalConflict = true;
            tab.externalMessage = "Reconnected with a local draft. Reload from VS Code to accept its buffer, or disconnect and save your copy.";
            if (tab === activeTab) showConflict(tab.externalMessage);
          }
        }
        if (document.text === link.text) {
          link.version = document.version;
          link.dirty = document.dirty;
          link.connected = true;
          if (event.active && activeTab !== tab) await activateTab(tab, false);
          else if (event.active && activeTab === tab) status.textContent = model?.diagnostic || "Code and blocks synchronized · visual placement does not change source order";
          updateTitle();
          return;
        }
        const localText = tab === activeTab ? source.value : tab.source;
        const dirty = tab === activeTab ? blocksPending || Blockly.WidgetDiv.isVisible() || workspace.isDragging()
          || (!detail.disabled && detail.value !== selectedSource(workspace.getBlockById(selectedId))) : tab.detailDirty;
        if (!dirty && ((localText === editorText(link.text) && !tab.externalConflict && !(tab === activeTab && externalConflict)) || localText === editorText(document.text))) {
          await acceptRemote(tab, document);
        } else {
          link.connected = true;
          tab.externalConflict = true;
          tab.externalMessage = "VS Code changed while a local block edit was pending. Both versions are preserved. Reload from disk / VS Code to accept VS Code, or Save As to keep the local version.";
          if (tab === activeTab) showConflict(tab.externalMessage);
        }
        if (event.active && activeTab !== tab && !switching) await activateTab(tab, false);
      }
    }
    updateTitle();
  }
  const stopEditorListener = window.zbc?.onEditorEvent?.(event => {
    editorQueue = editorQueue.then(() => receiveEditor(event)).catch(error => { status.textContent = error.message; });
  });
  async function submitRemote() {
    const tab = activeTab;
    const link = remote;
    if (!link?.connected) return;
    if (externalConflict) throw new Error("Resolve the VS Code conflict before sending more edits.");
    if (link.pending) throw new Error("Wait for VS Code to acknowledge the previous block edit.");
    const text = savedText(link.text, source.value);
    if (text === link.text) return;
    link.pending = true;
    host.inert = true;
    status.textContent = "Applying version-checked edit in VS Code…";
    try {
      const result = await window.zbc.editEditor({ uri: link.uri, version: link.version, text });
      if (result.document && (!link.latest || result.document.version >= link.latest.version)) link.latest = result.document;
      if (!result.ok) throw new Error(result.error || "VS Code rejected the edit.");
      await acceptRemote(tab, link.latest);
    } catch (error) {
      tab.externalConflict = true;
      tab.externalMessage = error.message + " Local text kept. Reload from disk / VS Code, or Save As to keep a copy.";
      if (tab === activeTab) showConflict(tab.externalMessage);
    } finally {
      link.pending = false;
      if (tab === activeTab) { host.inert = false; updateTitle(); }
    }
  }
  void createToolbox().then(toolbox => {
    if (!disposed) workspace.updateToolbox(toolbox);
  }).catch(error => { if (!disposed) status.textContent = `Toolbox could not load: ${error.message}`; });

  function updateTitle() {
    filename.textContent = currentName + (source.value !== savedSource || remote?.dirty ? " • unsaved" : "");
    root.querySelector("#syncState").textContent = remote?.connected ? "VS Code owns text and Save · live unsaved-buffer sync" : fileToken ? "Saved-file sync active · checks every 1s" : "Open/save a file to share it with another editor";
    source.readOnly = editorConnected || !!remote?.connected;
    const unavailable = editorConnected && (remoteUnavailable || !remote?.connected);
    if (editorConnected && remoteUnavailable) { status.textContent = unavailableMessage; status.classList.add("syntaxWarning"); }
    if (unavailable) host.inert = true;
    for (const action of ["blank", "new", "open", "folder", "refreshFolder", "saveAs"]) root.querySelector(`[data-action="${action}"]`).disabled = editorConnected;
    for (const action of ["save", "apply", "insert", "undo", "redo", "run", "reload"]) root.querySelector(`[data-action="${action}"]`).disabled = unavailable;
    root.querySelector("#toggleMode").disabled = !remote?.connected;
    root.querySelector("#toggleMode").textContent = blocksOnly ? "Show code preview" : "Blocks only";
    root.querySelector(".app").classList.toggle("blocks-only", editorConnected && blocksOnly);
    root.querySelector('[data-action="reload"]').textContent = remote ? "Reload from VS Code" : "Reload from disk";
    renderTabs();
  }
  function remember(text) {
    if (history[historyIndex] === text) return;
    history = history.slice(0, historyIndex + 1);
    history.push(text);
    while (history.length > 40 || (history.length > 1 && history.reduce((size, item) => size + item.length, 0) > 4_000_000)) history.shift();
    historyIndex = history.length - 1;
  }
  function select(block) {
    showBlockHelpers(workspace.getBlockById(selectedId), false);
    selectedId = block?.id || null;
    showBlockHelpers(block, true);
    root.querySelector('[data-action="lists"]').disabled = !block;
    void Blockly.renderManagement.finishQueuedRenders().then(() => {
      if (!disposed && !workspace.isDragging()) { separateRoots(workspace); positions = blockPositions(workspace); }
    });
    detail.disabled = !block;
    detail.value = selectedSource(block);
    root.querySelector("#selection").textContent = block ? `${block.sourceNode.kind} · edit and Apply` : "Select a block to edit its code";
  }
  async function synchronize(text, expected, editedModel = null) {
    try {
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (disposed || expected !== revision) return false;
      const textOnly = !/\.(js|mjs|cjs|jsx)$/i.test(currentName) && !remote;
      root.querySelector(".workbench").classList.toggle("text-only", textOnly);
      if (textOnly) {
        Blockly.Events.disable();
        try { workspace.clear(); } finally { Blockly.Events.enable(); }
        model = null;
        select(null);
        host.inert = true;
        status.classList.remove("syntaxWarning");
        status.textContent = "Text-only file · blocks currently support JavaScript/JSX";
        return true;
      }
      let parsed;
      if (editedModel) {
        try { parsed = await parseSource(text, editedModel); }
        catch { parsed = await parseEditableSource(text, model); }
      } else parsed = await parseEditableSource(text, model);
      if (disposed || expected !== revision || source.value !== text) return false;
      if (printModel(parsed) !== text) throw new Error("Round-trip check failed; source preserved");
      positions = { ...positions, ...blockPositions(workspace) };
      model = parsed;
      renderSource(workspace, model, positions);
      positions = blockPositions(workspace);
      select(workspace.getBlockById(selectedId));
      host.inert = false;
      host.classList.remove("pending");
      status.classList.toggle("syntaxWarning", !!model.diagnostic);
      status.textContent = model.diagnostic
        ? `⚠ ${model.diagnostic} — incomplete code is in a warning block. Unchanged blocks retain their last known structure; select the warning block to repair it.`
        : `${model.nodes.length} independent sections · code and blocks synchronized`;
      return true;
    } catch (error) {
      if (expected === revision) status.textContent = `Incomplete or invalid JavaScript: ${error.message}. Source kept; block editing paused.`;
      return false;
    }
  }
  function schedule(text, immediate = false, editedModel = null) {
    clearTimeout(debounce);
    clearTimeout(blockDebounce);
    blocksPending = false;
    Blockly.WidgetDiv.hide();
    revision++;
    const expected = revision;
    host.inert = true;
    host.classList.add("pending");
    status.textContent = "Code active · updating blocks…";
    updateTitle();
    if (immediate) return synchronize(text, expected, editedModel);
    debounce = setTimeout(() => { remember(text); void synchronize(text, expected); }, 300);
  }
  async function commit(text, validate = true, editedModel = null) {
    const expected = revision;
    if (validate && !model?.diagnostic) await parseSource(text);
    if (expected !== revision) throw new Error("Code changed during this edit. Try again with the latest source.");
    remember(source.value);
    source.value = text;
    remember(text);
    return schedule(text, true, editedModel);
  }
  source.addEventListener("input", () => schedule(source.value));
  source.addEventListener("keydown", event => {
    if (source.readOnly) return;
    if (event.key === "Tab") {
      event.preventDefault();
      source.setRangeText("  ", source.selectionStart, source.selectionEnd, "end");
      schedule(source.value);
    }
  });
  function queueBlockEdit() {
    clearTimeout(blockDebounce);
    blocksPending = true;
    const expected = revision;
    blockDebounce = setTimeout(async () => {
      if (disposed || expected !== revision || host.inert || model.source !== source.value) return;
      if (workspace.isDragging() || Blockly.WidgetDiv.isVisible()) { queueBlockEdit(); return; }
      try {
        const editedModel = workspaceModel(workspace, model);
        await commit(printModel(editedModel), false, editedModel);
        if (remote?.connected) await submitRemote();
      } catch (error) {
        blocksPending = false;
        renderSource(workspace, model, positions);
        status.textContent = `Block edit rejected: ${error.message}. Code preserved.`;
      }
    }, 150);
  }
  workspace.addChangeListener(event => {
    if (event.type === Blockly.Events.BLOCK_DRAG && !event.isStart) {
      requestAnimationFrame(() => {
        if (!disposed && !workspace.isDragging() && !blocksPending && !host.inert) {
          separateRoots(workspace);
          positions = blockPositions(workspace);
        }
      });
    }
    if (event.type === Blockly.Events.SELECTED) { select(workspace.getBlockById(event.newElementId)); return; }
    if (event.isUiEvent || !model || host.inert) return;
    if (event.type === Blockly.Events.BLOCK_MOVE && event.oldParentId === event.newParentId && event.oldInputName === event.newInputName) {
      positions = blockPositions(workspace);
      return;
    }
    if (![Blockly.Events.BLOCK_MOVE, Blockly.Events.BLOCK_DELETE, Blockly.Events.BLOCK_CREATE, Blockly.Events.BLOCK_CHANGE].includes(event.type)) return;
    if (event.type === Blockly.Events.BLOCK_CHANGE && (event.element !== "field" || !event.name?.startsWith("EDIT"))) return;
    queueBlockEdit();
  });

  const actions = {
    async lists() { await authoring.lists(); },
    reference() { authoring.reference(); },
    async forget() {
      if (!confirm("Forget the saved VS Code pairing? You will need to pair again.")) return;
      await window.zbc.forgetEditor();
      root.querySelector("#connectionStatus").textContent = "Pairing revoked. Run Forget Pairing in VS Code too, then pair again when needed.";
    },
    async blank() {
      await activateTab(newTab({ source: "" }));
    },
    async new() {
      await activateTab(newTab({ source: SAMPLE, savedSource: "" }));
    },
    async open() {
      if (!window.zbc?.openSource) throw new Error("Open files from the Electron desktop app.");
      if (tabs.size >= 20) throw new Error("Close a tab before opening more files.");
      const result = await window.zbc.openSource();
      if (!result || result.canceled) return;
      if (result.error) throw new Error(result.error);
      await openResult(result);
      if (result.symbols) output.textContent = `ZachCodingStream: ${result.symbols.length} symbols indexed. Analysis is advisory; editor parsing is independent.`;
    },
    async save(saveAs = false) {
      if (editorConnected && (saveAs || !remote?.connected)) throw new Error("Use VS Code to save while connected; disconnect for a standalone copy.");
      if (!window.zbc?.saveSource) throw new Error("Save files from the Electron desktop app.");
      if (remote?.connected && !saveAs) {
        if (externalConflict || remote.pending || blocksPending) throw new Error("Resolve pending edits or conflicts before saving in VS Code.");
        const result = await window.zbc.requestEditor({ type: "save", uri: remote.uri });
        if (!result.ok) throw new Error(result.error || "VS Code could not save the document.");
        status.textContent = "Saved through VS Code.";
        return;
      }
      if (blocksPending || Blockly.WidgetDiv.isVisible()) throw new Error("Finish the block field edit with Enter, then save.");
      if (externalConflict && !saveAs) throw new Error("External edits are waiting. Reload from disk or Save As to a different file.");
      const text = source.value;
      const owner = activeTab;
      const oldToken = fileToken;
      const diskText = savedText(owner.rawSource, text);
      const layout = {};
      if (model?.source === text) for (const block of workspace.getTopBlocks(false)) {
        const point = block.getRelativeToSurfaceXY();
        layout[block.sourceNode.start] = { x: point.x, y: point.y };
      }
      const result = await window.zbc.saveSource({ token: saveAs ? null : fileToken, source: diskText, layout, baseHash });
      if (!result || result.canceled) return;
      if (result.error) throw new Error(result.error);
      if (oldToken && oldToken !== result.token) await window.zbc.closeSource(oldToken);
      if (owner !== activeTab) {
        Object.assign(owner, { token: result.token, name: result.name, savedSource: text, rawSource: diskText, baseHash: result.hash, remote: null });
        await window.zbc.activateSource(fileToken);
        renderTabs();
        return;
      }
      fileToken = result.token; currentName = result.name; savedSource = text; updateTitle();
      remote = null; activeTab.remote = null;
      Object.assign(activeTab, { token: fileToken, name: currentName, savedSource, rawSource: diskText, baseHash: result.hash });
      baseHash = result.hash; clearExternalNotice();
      updateTitle();
      status.textContent = result.warning || "Saved ordinary JavaScript and optional layout sidecar.";
    },
    async reload() {
      if (remote) {
        if (!remote.connected) throw new Error("Reconnect VS Code first, or use Save As for a standalone copy.");
        if (remote.pending) throw new Error("Wait for VS Code to acknowledge the pending edit.");
        if ((pendingEdits() || externalConflict) && !confirm("Discard the local draft and use the latest VS Code buffer?")) return;
        await acceptRemote(activeTab, remote.latest);
        return;
      }
      if (!fileToken || !window.zbc?.readExternal) throw new Error("Open or save a file first.");
      if (pendingEdits() && !confirm("Discard local edits and reload the latest saved file? Use Save As first to keep a separate copy.")) return;
      const token = fileToken;
      const expected = revision;
      const result = await window.zbc.readExternal(token);
      if (token !== fileToken || expected !== revision) throw new Error("The active code changed while reloading. Try again.");
      if (result.error) throw new Error(result.error);
      await applyExternal(result);
    },
    async saveAs() { await actions.save(true); },
    async apply() {
      if (host.inert || model?.source !== source.value) throw new Error("Wait for the block view to update before applying a block edit.");
      const block = workspace.getBlockById(selectedId);
      if (!block) throw new Error("Select a block first.");
      await commit(replaceSourceRange(source.value, block.sourceNode.start, block.sourceNode.end, detail.value));
      if (remote?.connected) await submitRemote();
    },
    async insert() {
      const snippet = SNIPPETS[root.querySelector("#snippet").value];
      const start = source.selectionStart;
      await commit(replaceSourceRange(source.value, start, source.selectionEnd, "\n" + snippet + "\n"));
      if (remote?.connected) await submitRemote();
      source.focus(); source.setSelectionRange(start + snippet.length + 2, start + snippet.length + 2);
    },
    async undo() {
      remember(source.value);
      if (historyIndex > 0) { source.value = history[--historyIndex]; await schedule(source.value, true); if (remote?.connected) await submitRemote(); }
    },
    async redo() {
      if (historyIndex + 1 < history.length) { source.value = history[++historyIndex]; await schedule(source.value, true); if (remote?.connected) await submitRemote(); }
    },
    async folder() { await fileBrowser.open(); },
    async refreshFolder() { await fileBrowser.refresh(); },
    async connect() {
      const result = await window.zbc.startEditor();
      if (result.error) throw new Error(result.error);
      root.querySelector("#connectionStatus").textContent = "Pairing code copied. In VS Code run ‘ZachsBlockCoding: Connect to Standalone App’ and paste it (expires in 10 minutes).";
    },
    async disconnect() { await window.zbc.stopEditor(); },
    toggleMode() { if (remote?.connected) { blocksOnly = !blocksOnly; updateTitle(); } },
    fit() { workspace.zoomToFit(); },
    stop() { runController?.abort(); },
    async run() {
      runController?.abort();
      const expected = ++runRevision;
      runController = new AbortController();
      output.textContent = "Running…";
      const result = await runJavaScript(source.value, { signal: runController.signal });
      if (expected === runRevision) output.textContent = [...result.logs, result.error ? `Error: ${result.error}` : "Finished."].join("\n");
    },
  };
  root.addEventListener("click", async event => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (actions[action]) try { await actions[action](); } catch (error) { status.textContent = error.message; }
  });
  const resize = new ResizeObserver(() => Blockly.svgResize(workspace));
  resize.observe(host);
  function beforeUnload(event) {
    if (pendingEdits() || [...tabs.values()].some(tab => tab !== activeTab && (tab.source !== tab.savedSource || tab.externalConflict || tab.detailDirty))) { event.preventDefault(); event.returnValue = ""; }
  }
  window.addEventListener("beforeunload", beforeUnload);
  function dispose() {
    authoring.dispose();
    disposed = true; clearTimeout(debounce); clearTimeout(blockDebounce); stopExternalListener?.(); stopEditorListener?.(); runController?.abort(); resize.disconnect(); workspace.dispose(); window.removeEventListener("beforeunload", beforeUnload);
  }
  window.addEventListener("pagehide", dispose, { once: true });
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  source.value = SAMPLE;
  activeTab = newTab({ source: SAMPLE, savedSource: "" });
  remember(SAMPLE);
  void schedule(SAMPLE, true);
  void window.zbc?.resumeEditor?.().then(result => {
    if (result.error) status.textContent = `Automatic connection unavailable: ${result.error}`;
    else if (result.remembered && !editorConnected) root.querySelector("#connectionStatus").textContent = "Remembered pairing · waiting for VS Code to reconnect…";
  }).catch(error => { status.textContent = error.message; });
}
