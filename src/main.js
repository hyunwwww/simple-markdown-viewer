const { app, BrowserWindow, dialog, ipcMain, clipboard } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");

const isSmokeTest = process.argv.includes("--smoke-test");
const markdownFilters = [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }];
const exportFilters = [
  { name: "Markdown", extensions: ["md"] },
  { name: "HTML", extensions: ["html"] },
  { name: "Text", extensions: ["txt"] },
];

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1160,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    show: false,
    backgroundColor: "#f7f7f3",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl !== mainWindow.webContents.getURL()) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  mainWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
    if (isSmokeTest) {
      console.error(`smoke failed: ${errorCode} ${errorDescription}`);
      app.exit(1);
    }
  });
  mainWindow.webContents.once("did-finish-load", async () => {
    if (!isSmokeTest) {
      return;
    }

    try {
      const isReady = await mainWindow.webContents.executeJavaScript(
        "Boolean(window.__markdownViewerReady && document.querySelector('#preview')?.innerText.includes('Simple Markdown Viewer'))",
        true,
      );
      if (!isReady) {
        throw new Error("renderer ready marker was not found");
      }
      console.log("smoke ok: renderer loaded");
      app.quit();
    } catch (error) {
      console.error(`smoke failed: ${error.message}`);
      app.exit(1);
    }
  });

  if (!isSmokeTest) {
    mainWindow.once("ready-to-show", () => mainWindow.show());
  }
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("file:open", async () => {
  const result = await dialog.showOpenDialog({
    title: "Markdown 파일 가져오기",
    filters: markdownFilters,
    properties: ["openFile"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error("선택한 경로가 파일이 아닙니다.");
  }

  const content = await fs.readFile(filePath, "utf8");
  return {
    filePath,
    fileName: path.basename(filePath),
    content,
  };
});

ipcMain.handle("file:save", async (_event, payload) => {
  const { content, defaultPath } = validateSavePayload(payload);
  const result = await dialog.showSaveDialog({
    title: "문서 내보내기",
    defaultPath,
    filters: exportFilters,
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await fs.writeFile(result.filePath, content, "utf8");
  return {
    filePath: result.filePath,
    fileName: path.basename(result.filePath),
  };
});

ipcMain.handle("clipboard:write", (_event, text) => {
  if (typeof text !== "string") {
    throw new Error("복사할 텍스트가 올바르지 않습니다.");
  }

  clipboard.writeText(text);
  return true;
});

function validateSavePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("내보내기 데이터가 없습니다.");
  }

  if (typeof payload.content !== "string") {
    throw new Error("내보낼 문서 내용이 올바르지 않습니다.");
  }

  const defaultPath =
    typeof payload.defaultPath === "string" && payload.defaultPath.trim()
      ? path.basename(payload.defaultPath)
      : "document.md";

  return {
    content: payload.content,
    defaultPath,
  };
}
