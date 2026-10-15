const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zbc", {
  appInfo: () => ipcRenderer.invoke("zbc:app-info"),
  startupReady: () => ipcRenderer.invoke("zbc:startup-ready"),
  showConnector: () => ipcRenderer.invoke("zbc:connector"),
  openSource: () => ipcRenderer.invoke("zbc:open-source"),
  saveSource: payload => ipcRenderer.invoke("zbc:save-source", payload),
  readExternal: token => ipcRenderer.invoke("zbc:read-external", token),
  closeSource: token => ipcRenderer.invoke("zbc:close-source", token),
  activateSource: token => ipcRenderer.invoke("zbc:activate-source", token),
  openFolder: () => ipcRenderer.invoke("zbc:open-folder"),
  listFolder: relative => ipcRenderer.invoke("zbc:list-folder", relative),
  openProjectSource: relative => ipcRenderer.invoke("zbc:open-project-source", relative),
  startEditor: () => ipcRenderer.invoke("zbc:editor-start"),
  resumeEditor: () => ipcRenderer.invoke("zbc:editor-resume"),
  forgetEditor: () => ipcRenderer.invoke("zbc:editor-forget"),
  stopEditor: () => ipcRenderer.invoke("zbc:editor-stop"),
  editEditor: payload => ipcRenderer.invoke("zbc:editor-edit", payload),
  requestEditor: payload => ipcRenderer.invoke("zbc:editor-request", payload),
  onEditorEvent: callback => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on("zbc:editor-event", listener);
    return () => ipcRenderer.removeListener("zbc:editor-event", listener);
  },
  onExternalSource: callback => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on("zbc:external-source", listener);
    return () => ipcRenderer.removeListener("zbc:external-source", listener);
  },
});
