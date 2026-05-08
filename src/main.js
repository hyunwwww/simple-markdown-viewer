const { app, BrowserWindow, dialog, ipcMain, clipboard, shell } = require("electron");
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
const exportFiltersByType = {
  md: [{ name: "Markdown", extensions: ["md"] }],
  html: [{ name: "HTML", extensions: ["html"] }],
  pdf: [{ name: "PDF", extensions: ["pdf"] }],
};
let mainWindow = null;
let pendingFilePath = getOpenFilePathFromArgv(process.argv);
let currentDocumentPath = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1160,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    show: false,
    backgroundColor: "#fffbe8",
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
          const statusMessage = document.querySelector('#statusMessage');
          const wordCount = document.querySelector('#wordCount');
          const searchBar = document.querySelector('#searchBar');
          const searchInput = document.querySelector('#searchInput');
          const searchResultCount = document.querySelector('#searchResultCount');
          const searchPreviousButton = document.querySelector('#searchPreviousButton');
          const searchNextButton = document.querySelector('#searchNextButton');
          const outlineButton = document.querySelector('#outlineButton');
          const exportPdfButton = document.querySelector('#exportPdfButton');
          const workspace = document.querySelector('.workspace');
          const splitter = document.querySelector('#splitter');
          const outlinePanel = document.querySelector('#outlinePanel');
          const outlineList = document.querySelector('#outlineList');
          const outlineSplitter = document.querySelector('#outlineSplitter');
          const startupFileName = ${JSON.stringify(startupPayload?.fileName || null)};
          const startupFileLoaded = !startupFileName || fileLabel.textContent === startupFileName;
          document.documentElement.dataset.theme = 'light';

          editor.value = Array.from({ length: 80 }, (_, index) =>
            index === 0
              ? "## Section 0\\n\\n[Jump](#section-40)"
              : index === 5
              ? "'''javascript\\nconst value = index + 1;\\nconsole.log(value);\\n'''"
              : "## Section " + index + "\\n\\n''accent'' text with \`inline code\`.\\n\\n> quoted accent"
          ).join("\\n\\n");
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          editor.scrollTop = editor.scrollHeight;
          editor.dispatchEvent(new Event('scroll', { bubbles: true }));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const linkedScrollAfterEditorScroll = preview.scrollTop > 0;

          preview.scrollTop = 0;
          preview.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const internalLinkClickScroll = preview.scrollTop > 0;

          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }));
          searchInput.value = "'''javascript";
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 150));
          const editorOnlySyntaxExcluded = searchResultCount.textContent === '0/0' &&
            preview.querySelectorAll('mark.search-highlight').length === 0;

          searchInput.value = 'Section';
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          for (let attempt = 0; attempt < 10 && preview.querySelectorAll('mark.search-highlight').length === 0; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const initialSearchCount = searchResultCount.textContent;
          searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          for (let attempt = 0; attempt < 10 && searchResultCount.textContent === initialSearchCount; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const enterSearchCount = searchResultCount.textContent;
          searchNextButton.click();
          for (let attempt = 0; attempt < 10 && searchResultCount.textContent === enterSearchCount; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const nextSearchCount = searchResultCount.textContent;
          searchPreviousButton.click();
          for (let attempt = 0; attempt < 10 && searchResultCount.textContent === nextSearchCount; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const previousSearchCount = searchResultCount.textContent;
          const searchInputFocused = document.activeElement === searchInput;

          splitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
          const splitMinValue = Number(splitter.getAttribute('aria-valuenow'));
          splitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
          const splitAdjustedValue = Number(splitter.getAttribute('aria-valuenow'));

          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true }));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const outlineOpenByShortcut = !outlinePanel.hidden && outlineButton.getAttribute('aria-pressed') === 'true';
          const outlineItems = outlineList.querySelectorAll('.outline-item');
          const lastOutlineItem = outlineItems[outlineItems.length - 1];
          const outlineTarget = lastOutlineItem ? document.getElementById(lastOutlineItem.dataset.targetId) : null;
          preview.scrollTop = 0;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const outlineTargetTopBefore = outlineTarget?.getBoundingClientRect().top ?? 0;
          lastOutlineItem?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const outlineTargetTopAfter = outlineTarget?.getBoundingClientRect().top ?? outlineTargetTopBefore;
          const outlineClickStatus = statusMessage.textContent;
          const outlineClickScroll = outlineTargetTopAfter < outlineTargetTopBefore;
          outlineSplitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
          const outlineInitialWidth = Number(outlineSplitter.getAttribute('aria-valuenow'));
          outlineSplitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
          const outlineAdjustedWidth = Number(outlineSplitter.getAttribute('aria-valuenow'));
          document.querySelector('#copyMarkdownButton')?.click();
          for (let attempt = 0; attempt < 10 && !statusMessage.textContent.includes('복사'); attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const copyMarkdownWorks = statusMessage.textContent.includes('원문을 복사');
          const codeCopyButton = document.querySelector('.code-copy-button');
          codeCopyButton?.click();
          for (let attempt = 0; attempt < 10 && !statusMessage.textContent.includes('코드 블록'); attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const copyCodeBlockWorks = statusMessage.textContent.includes('코드 블록을 복사');

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
          const codeBlockWrapDefault = lightCodeBlockStyle?.whiteSpace === 'pre-wrap' &&
            lightCodeBlockStyle?.overflowWrap === 'anywhere';

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
            lightBackground: lightBackgroundColor === 'rgb(255, 251, 232)',
            lightInlineCodeDefault: lightInlineCodeColor === lightTextColor &&
              lightInlineCodeBackground === 'rgb(255, 251, 232)',
            lightQuoteDefault: lightQuoteColor === lightTextColor &&
              lightQuoteBackground === 'rgb(255, 251, 232)',
            darkQuoteStyle: darkQuoteColor === 'rgb(212, 51, 131)' &&
              darkQuoteBackground === 'rgb(22, 27, 34)' &&
              darkBlockquoteColor === 'rgb(112, 146, 190)' &&
            darkBlockquoteBackground === 'rgb(22, 27, 34)',
            darkCodeBlockStyle: darkCodeBlockBackground === 'rgb(22, 27, 34)',
            linkedScrollReady: linkedScrollAfterEditorScroll,
            internalLinkClick: internalLinkClickScroll,
            panelBarsRemoved: document.querySelectorAll('.panel-heading').length === 0,
            wordCountInHeader: Boolean(wordCount) &&
              document.querySelector('.toolbar #wordCount') === wordCount &&
              wordCount.textContent.includes('자'),
            copyTextButtonRemoved: !document.querySelector('#copyTextButton'),
            copyMarkdownWorks,
            codeCopyButtonPresent: codeCopyButton?.textContent === 'Copy',
            codeBlockWrapDefault,
            copyCodeBlockWorks,
            pdfExportButtonPresent: Boolean(exportPdfButton),
            outlineOpenByShortcut,
            outlineItemsReady: outlineItems.length >= 70,
            outlineClickScroll,
            outlineClickStatusUpdated: outlineClickStatus.includes('인덱스 이동'),
            outlineWidthResize: outlineAdjustedWidth > outlineInitialWidth,
            searchBarVisible: !searchBar.hidden,
            searchInputFocused,
            searchCountFormat: /^\\d+\\/\\d+$/.test(searchResultCount.textContent),
            searchCountNonZero: previousSearchCount !== '0/0',
            searchMarkPresent: preview.querySelectorAll('mark.search-highlight').length > 0,
            searchActiveMarkSingle: preview.querySelectorAll('mark.search-highlight-active').length === 1,
            searchNavigation: initialSearchCount !== enterSearchCount &&
              enterSearchCount !== nextSearchCount &&
              nextSearchCount !== previousSearchCount,
            previewOnlySearch: editorOnlySyntaxExcluded,
            splitterReady: splitter?.getAttribute('role') === 'separator' &&
              getComputedStyle(workspace).gridTemplateColumns.split(' ').length >= 3 &&
              splitMinValue === 25 &&
              splitAdjustedValue > splitMinValue,
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
        console.error(JSON.stringify(checks, null, 2));
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

  const file = await readMarkdownFile(result.filePaths[0]);
  currentDocumentPath = file.filePath;
  return file;
});

ipcMain.handle("file:save-current", async (_event, payload) => {
  const { content, defaultPath, filePath } = validateCurrentSavePayload(payload);

  if (filePath && currentDocumentPath && path.resolve(filePath) === currentDocumentPath) {
    await fs.writeFile(currentDocumentPath, content, "utf8");
    return {
      filePath: currentDocumentPath,
      fileName: path.basename(currentDocumentPath),
    };
  }

  const result = await dialog.showSaveDialog({
    title: "문서 저장",
    defaultPath,
    filters: markdownFilters,
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  const normalizedPath = validateWritableMarkdownPath(result.filePath);
  await fs.writeFile(normalizedPath, content, "utf8");
  currentDocumentPath = normalizedPath;
  return {
    filePath: normalizedPath,
    fileName: path.basename(normalizedPath),
  };
});

ipcMain.handle("file:export", async (_event, payload) => {
  const { content, defaultPath, type } = validateExportPayload(payload);
  const result = await dialog.showSaveDialog({
    title: "문서 내보내기",
    defaultPath,
    filters: exportFiltersByType[type] || exportFilters,
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

ipcMain.handle("file:export-pdf", async (_event, payload) => {
  const { html, defaultPath } = validatePdfPayload(payload);
  const result = await dialog.showSaveDialog({
    title: "PDF 내보내기",
    defaultPath,
    filters: exportFiltersByType.pdf,
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await writePdfFile(html, result.filePath);
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

ipcMain.handle("shell:openExternal", async (_event, href) => {
  const url = validateExternalUrl(href);
  await shell.openExternal(url);
  return true;
});

function validateSavePayload(payload, fallbackName = "document.md") {
  if (!payload || typeof payload !== "object") {
    throw new Error("저장할 데이터가 없습니다.");
  }

  if (typeof payload.content !== "string") {
    throw new Error("저장할 문서 내용이 올바르지 않습니다.");
  }

  const defaultPath =
    typeof payload.defaultPath === "string" && payload.defaultPath.trim()
      ? path.basename(payload.defaultPath)
      : fallbackName;

  return {
    content: payload.content,
    defaultPath,
  };
}

function validateCurrentSavePayload(payload) {
  const result = validateSavePayload(payload);
  const filePath = typeof payload.filePath === "string" ? path.resolve(payload.filePath) : null;

  if (filePath) {
    validateWritableMarkdownPath(filePath);
  }

  return {
    ...result,
    filePath,
  };
}

function validateExportPayload(payload) {
  const type = typeof payload?.type === "string" ? payload.type.toLowerCase() : "md";
  if (!Object.hasOwn(exportFiltersByType, type) || type === "pdf") {
    throw new Error("지원하지 않는 내보내기 형식입니다.");
  }

  return {
    ...validateSavePayload(payload, `document.${type}`),
    type,
  };
}

function validatePdfPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("PDF 내보내기 데이터가 없습니다.");
  }

  if (typeof payload.html !== "string") {
    throw new Error("PDF로 내보낼 문서가 올바르지 않습니다.");
  }

  return {
    html: payload.html,
    defaultPath:
      typeof payload.defaultPath === "string" && payload.defaultPath.trim()
        ? path.basename(payload.defaultPath)
        : "document.pdf",
  };
}

function validateWritableMarkdownPath(filePath) {
  const normalizedPath = path.resolve(filePath);
  const extension = path.extname(normalizedPath).toLowerCase();
  if (!supportedOpenExtensions.has(extension)) {
    throw new Error("Markdown 파일 형식으로만 저장할 수 있습니다.");
  }

  return normalizedPath;
}

function validateExternalUrl(href) {
  if (typeof href !== "string" || !href.trim()) {
    throw new Error("열 링크가 올바르지 않습니다.");
  }

  const url = new URL(href);
  if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
    throw new Error("외부 링크는 http, https, mailto만 열 수 있습니다.");
  }

  return url.toString();
}

async function writePdfFile(html, filePath) {
  const pdfWindow = new BrowserWindow({
    width: 900,
    height: 1200,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await pdfWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    const pdf = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      marginsType: 0,
    });
    await fs.writeFile(filePath, pdf);
  } finally {
    if (!pdfWindow.isDestroyed()) {
      pdfWindow.destroy();
    }
  }
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
    currentDocumentPath = payload.filePath;
    mainWindow.webContents.send("file:loaded", payload);
    return payload;
  } catch (error) {
    mainWindow.webContents.send("file:error", error.message);
    return null;
  }
}
