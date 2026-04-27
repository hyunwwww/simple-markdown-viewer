const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("markdownViewer", {
  openFile: () => ipcRenderer.invoke("file:open"),
  saveFile: (payload) => ipcRenderer.invoke("file:save", payload),
  copyText: (text) => ipcRenderer.invoke("clipboard:write", text),
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
