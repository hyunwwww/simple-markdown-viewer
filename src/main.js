const { app, BrowserWindow, dialog, ipcMain, clipboard } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { fileURLToPath } = require("node:url");

const isSmokeTest = process.argv.includes("--smoke-test");
const markdownFilters = [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }];
const supportedOpenExtensions = new Set([".md", ".markdown", ".txt"]);
const exportFilters = [
  { name: "Markdown", extensions: ["md"] },
  { name: "HTML", extensions: ["html"] },
  { name: "Text", extensions: ["txt"] },
];
let mainWindow = null;
let pendingFilePath = getOpenFilePathFromArgv(process.argv);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1160,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    show: false,
    backgroundColor: "#f9fcf8",
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
    let startupPayload = null;
    if (pendingFilePath) {
      startupPayload = await loadFileInWindow(pendingFilePath);
      pendingFilePath = null;
    }

    if (!isSmokeTest) {
      return;
    }

    try {
      const checks = await mainWindow.webContents.executeJavaScript(
        `(async () => {
          await document.fonts.ready;
          const editor = document.querySelector('#markdownInput');
          const preview = document.querySelector('#preview');
          const fileLabel = document.querySelector('#fileLabel');
          const startupFileName = ${JSON.stringify(startupPayload?.fileName || null)};
          const startupFileLoaded = !startupFileName || fileLabel.textContent === startupFileName;
          document.documentElement.dataset.theme = 'light';

          editor.value = Array.from({ length: 80 }, (_, index) =>
            index === 5
              ? "'''javascript\\nconst value = index + 1;\\nconsole.log(value);\\n'''"
              : "## Section " + index + "\\n\\n''accent'' text with \`inline code\`.\\n\\n> quoted accent"
          ).join("\\n\\n");
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          editor.scrollTop = editor.scrollHeight;
          editor.dispatchEvent(new Event('scroll', { bubbles: true }));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

          const lightBodyStyle = getComputedStyle(document.body);
          const lightTextColor = lightBodyStyle.color;
          const inlineCode = document.querySelector('.markdown-body p code');
          const quoteAccent = document.querySelector('.quote-accent');
          const blockquote = document.querySelector('.markdown-body blockquote');
          const codeBlock = document.querySelector('.markdown-body pre');
          const lightInlineCodeStyle = inlineCode ? getComputedStyle(inlineCode) : null;
          const lightQuoteStyle = quoteAccent ? getComputedStyle(quoteAccent) : null;
          const lightCodeBlockStyle = codeBlock ? getComputedStyle(codeBlock) : null;
          const lightBackgroundColor = lightBodyStyle.backgroundColor;
          const lightInlineCodeColor = lightInlineCodeStyle?.color;
          const lightInlineCodeBackground = lightInlineCodeStyle?.backgroundColor;
          const lightQuoteColor = lightQuoteStyle?.color;
          const lightQuoteBackground = lightQuoteStyle?.backgroundColor;

          document.documentElement.dataset.theme = 'dark';
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const darkQuoteStyle = quoteAccent ? getComputedStyle(quoteAccent) : null;
          const darkBlockquoteStyle = blockquote ? getComputedStyle(blockquote) : null;
          const darkCodeBlockStyle = codeBlock ? getComputedStyle(codeBlock) : null;
          const darkQuoteColor = darkQuoteStyle?.color;
          const darkQuoteBackground = darkQuoteStyle?.backgroundColor;
          const darkBlockquoteColor = darkBlockquoteStyle?.color;
          const darkBlockquoteBackground = darkBlockquoteStyle?.backgroundColor;
          const darkCodeBlockBackground = darkCodeBlockStyle?.backgroundColor;

          return {
            ready: Boolean(window.__markdownViewerReady),
            startupFileLoaded,
            preview: preview?.innerText.includes('Section 79'),
            quoteAccent: Boolean(quoteAccent),
            highlightedCode: Boolean(document.querySelector('pre code.hljs')),
            fixedFrame: getComputedStyle(document.body).overflow === 'hidden',
            lightBackground: lightBackgroundColor === 'rgb(249, 252, 248)',
            lightInlineCodeDefault: lightInlineCodeColor === lightTextColor &&
              lightInlineCodeBackground === 'rgb(249, 252, 248)',
            lightQuoteDefault: lightQuoteColor === lightTextColor &&
              lightQuoteBackground === 'rgb(249, 252, 248)',
            darkQuoteStyle: darkQuoteColor === 'rgb(212, 51, 131)' &&
              darkQuoteBackground === 'rgb(22, 27, 34)' &&
              darkBlockquoteColor === 'rgb(112, 146, 190)' &&
              darkBlockquoteBackground === 'rgb(22, 27, 34)',
            darkCodeBlockStyle: darkCodeBlockBackground === 'rgb(22, 27, 34)',
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

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const filePath = getOpenFilePathFromArgv(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
    if (filePath) {
      pendingFilePath = filePath;
      if (mainWindow?.webContents.isLoading()) {
        return;
      }
      loadFileInWindow(filePath);
      pendingFilePath = null;
    }
  });

  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    pendingFilePath = filePath;
    if (app.isReady() && mainWindow && !mainWindow.webContents.isLoading()) {
      loadFileInWindow(filePath);
      pendingFilePath = null;
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

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

  return readMarkdownFile(result.filePaths[0]);
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

function getOpenFilePathFromArgv(argv) {
  for (let index = argv.length - 1; index >= 0; index -= 1) {
    const arg = argv[index];
    if (!arg || arg.startsWith("--")) {
      continue;
    }

    const filePath = normalizeFilePathArg(arg);
    if (filePath && supportedOpenExtensions.has(path.extname(filePath).toLowerCase())) {
      return filePath;
    }
  }

  return null;
}

function normalizeFilePathArg(arg) {
  if (arg.startsWith("file://")) {
    try {
      return fileURLToPath(arg);
    } catch {
      return null;
    }
  }

  return path.resolve(arg);
}

async function readMarkdownFile(filePath) {
  const normalizedPath = normalizeFilePathArg(filePath);
  if (!normalizedPath || !supportedOpenExtensions.has(path.extname(normalizedPath).toLowerCase())) {
    throw new Error("Markdown 파일만 열 수 있습니다.");
  }

  const stat = await fs.stat(normalizedPath);
  if (!stat.isFile()) {
    throw new Error("선택한 경로가 파일이 아닙니다.");
  }

  const content = await fs.readFile(normalizedPath, "utf8");
  return {
    filePath: normalizedPath,
    fileName: path.basename(normalizedPath),
    content,
  };
}

async function loadFileInWindow(filePath) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }

  try {
    const payload = await readMarkdownFile(filePath);
    mainWindow.webContents.send("file:loaded", payload);
    return payload;
  } catch (error) {
    mainWindow.webContents.send("file:error", error.message);
    return null;
  }
}
