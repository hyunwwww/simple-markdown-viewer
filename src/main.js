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
      const checks = await mainWindow.webContents.executeJavaScript(
        `(async () => {
          await document.fonts.ready;
          const editor = document.querySelector('#markdownInput');
          const preview = document.querySelector('#preview');
          document.documentElement.dataset.theme = 'light';
          const inlineCode = document.querySelector('.markdown-body p code');
          const baseTextColor = getComputedStyle(document.body).color;
          const inlineCodeColor = inlineCode ? getComputedStyle(inlineCode).color : '';

          editor.value = Array.from({ length: 80 }, (_, index) =>
            index === 5
              ? "'''javascript\\nconst value = index + 1;\\nconsole.log(value);\\n'''"
              : "## Section " + index + "\\n\\n''accent'' text with \`inline code\`."
          ).join("\\n\\n").replaceAll("'''", "\`\`\`");
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          editor.scrollTop = editor.scrollHeight;
          editor.dispatchEvent(new Event('scroll', { bubbles: true }));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          return {
            ready: Boolean(window.__markdownViewerReady),
            preview: preview?.innerText.includes('Section 79'),
            quoteAccent: Boolean(document.querySelector('.quote-accent')),
            highlightedCode: Boolean(document.querySelector('pre code.hljs')),
            fixedFrame: getComputedStyle(document.body).overflow === 'hidden',
            lightInlineCodeVisible: inlineCodeColor !== '' && inlineCodeColor !== baseTextColor,
            linkedScrollReady: preview.scrollTop > 0,
            fontStack: getComputedStyle(document.body).fontFamily.includes('Inter') &&
              getComputedStyle(document.body).fontFamily.includes('Noto Sans KR')
          };
        })()`,
        true,
      );
      const failedChecks = Object.entries(checks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name);
      if (failedChecks.length > 0) {
        throw new Error(`renderer checks failed: ${failedChecks.join(", ")}`);
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
