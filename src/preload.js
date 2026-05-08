const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("markdownViewer", {
  openFile: () => ipcRenderer.invoke("file:open"),
  saveCurrentFile: (payload) => ipcRenderer.invoke("file:save-current", payload),
  exportFile: (payload) => ipcRenderer.invoke("file:export", payload),
  exportPdf: (payload) => ipcRenderer.invoke("file:export-pdf", payload),
  copyText: (text) => ipcRenderer.invoke("clipboard:write", text),
  openExternal: (href) => ipcRenderer.invoke("shell:openExternal", href),
  onFileLoaded: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("file:loaded", listener);
    return () => ipcRenderer.removeListener("file:loaded", listener);
  },
  onFileError: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("file:error", listener);
    return () => ipcRenderer.removeListener("file:error", listener);
  },
});
