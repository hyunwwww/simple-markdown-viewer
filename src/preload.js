const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("markdownViewer", {
  openFile: () => ipcRenderer.invoke("file:open"),
  saveFile: (payload) => ipcRenderer.invoke("file:save", payload),
  copyText: (text) => ipcRenderer.invoke("clipboard:write", text),
});
