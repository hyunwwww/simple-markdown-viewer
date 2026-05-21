const { app, BrowserWindow, dialog, ipcMain, clipboard, shell, net } = require("electron");
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const { fileURLToPath } = require("node:url");

const isSmokeTest = process.argv.includes("--smoke-test");
const isSecondInstanceSmoke = process.argv.includes("--second-instance-smoke");
const secondInstanceSmokeUserDataPath = getSecondInstanceSmokeUserDataPath(process.argv);
if (secondInstanceSmokeUserDataPath) {
  app.setPath("userData", secondInstanceSmokeUserDataPath);
}
const translateEndpoint = "https://translate.googleapis.com/translate_a/single";
const maxTranslateChunkLength = 3500;
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
const initialOpenFilePath = getOpenFilePathFromArgv(process.argv);
const pendingFilePaths = initialOpenFilePath ? [initialOpenFilePath] : [];
let isFlushingOpenFiles = false;
let currentDocumentPath = null;
const knownDocumentPaths = new Set();

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
    const startupPayloads = await flushPendingOpenFiles();
    const startupPayload = startupPayloads[0] || null;

    if (isSecondInstanceSmoke) {
      try {
        await runSecondInstanceSmoke();
      } catch (error) {
        console.error(`second-instance smoke failed: ${error.message}`);
        app.exit(1);
      }
      return;
    }

    if (!isSmokeTest) {
      return;
    }

    let linkedSmokeRoot = null;
    try {
      linkedSmokeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-viewer-link-smoke-"));
      const linkedSmokeSourceDir = path.join(linkedSmokeRoot, "docs");
      const linkedSmokeSourcePath = path.join(linkedSmokeSourceDir, "source.md");
      const linkedSmokeTargetPath = path.join(linkedSmokeRoot, "target.md");
      const refreshSmokePath = path.join(linkedSmokeRoot, "refresh.md");
      await fs.mkdir(linkedSmokeSourceDir, { recursive: true });
      await fs.writeFile(linkedSmokeSourcePath, "[Target](../target.md#target-heading)", "utf8");
      await fs.writeFile(linkedSmokeTargetPath, "# Target\n\n## Target Heading\n\nLocal link opened.", "utf8");
      await fs.writeFile(refreshSmokePath, "# Refresh before\n\nBefore disk reload.", "utf8");

      const checks = await mainWindow.webContents.executeJavaScript(
        `(async () => {
          await document.fonts.ready;
          const editor = document.querySelector('#markdownInput');
          const preview = document.querySelector('#preview');
          const fileLabel = document.querySelector('#fileLabel');
          const statusMessage = document.querySelector('#statusMessage');
          const wordCount = document.querySelector('#wordCount');
          const tabsFrame = document.querySelector('.tabs-frame');
          const documentTabs = document.querySelector('#documentTabs');
          const closeAllTabsButton = document.querySelector('#closeAllTabsButton');
          const searchBar = document.querySelector('#searchBar');
          const searchInput = document.querySelector('#searchInput');
          const searchResultCount = document.querySelector('#searchResultCount');
          const searchPreviousButton = document.querySelector('#searchPreviousButton');
          const searchNextButton = document.querySelector('#searchNextButton');
          const pathInput = document.querySelector('#pathInput');
          const openPathButton = document.querySelector('#openPathButton');
          const basePathSelect = document.querySelector('#basePathSelect');
          const basePathInput = document.querySelector('#basePathInput');
          const saveBasePathButton = document.querySelector('#saveBasePathButton');
          const deleteBasePathButton = document.querySelector('#deleteBasePathButton');
          const outlineButton = document.querySelector('#outlineButton');
          const sourceToggleButton = document.querySelector('#sourceToggleButton');
          const exportPdfButton = document.querySelector('#exportPdfButton');
          const copyMarkdownButton = document.querySelector('#copyMarkdownButton');
          const translateButton = document.querySelector('#translateButton');
          const themeButton = document.querySelector('#themeButton');
          const workspace = document.querySelector('.workspace');
          const editorPanel = document.querySelector('#editorPanel');
          const zoomIndicator = document.querySelector('#zoomIndicator');
          const splitter = document.querySelector('#splitter');
          const outlinePanel = document.querySelector('#outlinePanel');
          const outlineList = document.querySelector('#outlineList');
          const outlineSplitter = document.querySelector('#outlineSplitter');
          const startupFileExpected = ${JSON.stringify(Boolean(initialOpenFilePath))};
          const startupFileName = ${JSON.stringify(startupPayload?.fileName || null)};
          const startupFileLoaded = !startupFileExpected ||
            (Boolean(startupFileName) && fileLabel.textContent === startupFileName);
          const linkedSmokeSourcePath = ${JSON.stringify(linkedSmokeSourcePath)};
          const refreshSmokePath = ${JSON.stringify(refreshSmokePath)};
          const linkedSmokeRoot = ${JSON.stringify(linkedSmokeRoot)};
          document.documentElement.dataset.theme = 'light';

          closeAllTabsButton.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          window.loadDocument({ fileName: 'alpha.md', filePath: 'C:\\\\smoke\\\\alpha.md', content: '# Alpha' }, 'Smoke');
          window.loadDocument({ fileName: 'beta.md', filePath: 'C:\\\\smoke\\\\beta.md', content: '# Beta' }, 'Smoke');
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          let tabNodes = [...documentTabs.querySelectorAll('.document-tab')];
          const tabBoxLimit = tabsFrame.getBoundingClientRect().width <= window.innerWidth * 0.5 + 1;
          const tabDefaultSize = tabNodes.length >= 2 &&
            Math.round(tabNodes[0].getBoundingClientRect().height) === 35 &&
            tabNodes[0].getBoundingClientRect().width <= 140;
          const tabsCreated = tabNodes.length === 2 &&
            tabNodes[0].textContent.includes('alpha.md') &&
            tabNodes[1].textContent.includes('beta.md') &&
            closeAllTabsButton.textContent === '전체닫기';
          tabNodes[0]?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const tabSelectWorks = editor.value.includes('# Alpha');
          tabNodes = [...documentTabs.querySelectorAll('.document-tab')];
          tabNodes[1]?.querySelector('.document-tab-close')?.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const tabCloseWorks = documentTabs.querySelectorAll('.document-tab').length === 1 &&
            editor.value.includes('# Alpha');
          closeAllTabsButton.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const closeAllTabsWorks = documentTabs.querySelectorAll('.document-tab').length === 1 &&
            editor.value === '';

          window.loadDocument({
            fileName: 'source.md',
            filePath: linkedSmokeSourcePath,
            content: '[Target](../target.md#target-heading)'
          }, 'Smoke');
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          preview.querySelector('a[href^="../"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          for (let attempt = 0; attempt < 20 && !editor.value.includes('Local link opened.'); attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          for (let attempt = 0; attempt < 20 && !statusMessage.textContent.includes('Target Heading'); attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const relativeLocalLinkClick = editor.value.includes('Local link opened.') &&
            fileLabel.textContent === 'target.md';
          const relativeLocalLinkHash = statusMessage.textContent.includes('Target Heading');

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

          sourceToggleButton.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const sourceCollapsed = workspace.classList.contains('editor-collapsed') &&
            editorPanel.hidden &&
            splitter.hidden &&
            sourceToggleButton.textContent === '원문 펼치기' &&
            sourceToggleButton.getAttribute('aria-expanded') === 'false' &&
            localStorage.getItem('sourcePanelCollapsed') === 'true';
          sourceToggleButton.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const sourceExpanded = !workspace.classList.contains('editor-collapsed') &&
            !editorPanel.hidden &&
            !splitter.hidden &&
            sourceToggleButton.textContent === '원문 접기' &&
            sourceToggleButton.getAttribute('aria-expanded') === 'true' &&
            localStorage.getItem('sourcePanelCollapsed') === 'false';

          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true, cancelable: true }));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const f5RefreshWorks = preview.innerText.includes('Section 79');

          preview.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
          const previewSelectionText = window.getSelection()?.toString() || '';
          const ctrlASelectsPreview = previewSelectionText.includes('Section 79') &&
            !previewSelectionText.includes(fileLabel.textContent);
          window.getSelection()?.removeAllRanges();
          editor.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
          const ctrlASelectsEditor = editor.selectionStart === 0 &&
            editor.selectionEnd === editor.value.length &&
            editor.value.includes('Section 79');
          editor.setSelectionRange(0, 0);

          localStorage.setItem('contentZoomPercent', '100');
          document.documentElement.style.setProperty('--content-zoom', '100%');
          const initialEditorFontSize = Number.parseFloat(getComputedStyle(editor).fontSize);
          const initialPreviewFontSize = Number.parseFloat(getComputedStyle(preview).fontSize);
          preview.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -120, bubbles: true, cancelable: true }));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const zoomedEditorFontSize = Number.parseFloat(getComputedStyle(editor).fontSize);
          const zoomedPreviewFontSize = Number.parseFloat(getComputedStyle(preview).fontSize);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const contentZoomStored = localStorage.getItem('contentZoomPercent') === '110';
          const contentZoomWorks = zoomedEditorFontSize > initialEditorFontSize &&
            zoomedPreviewFontSize > initialPreviewFontSize &&
            zoomIndicator.textContent === '110%' &&
            contentZoomStored;
          localStorage.setItem('contentZoomPercent', '100');
          document.documentElement.style.setProperty('--content-zoom', '100%');

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
          copyMarkdownButton?.click();
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
          const previewShowsSection79 = preview?.innerText.includes('Section 79');
          const highlightedCodePresent = Boolean(document.querySelector('pre code.hljs'));
          const searchBarVisibleBeforeReload = !searchBar.hidden;
          const searchCountFormatBeforeReload = /^\\d+\\/\\d+$/.test(searchResultCount.textContent);
          const searchMarkPresentBeforeReload = preview.querySelectorAll('mark.search-highlight').length > 0;
          const searchActiveMarkSingleBeforeReload =
            preview.querySelectorAll('mark.search-highlight-active').length === 1;

          basePathInput.value = linkedSmokeRoot;
          saveBasePathButton.click();
          for (let attempt = 0; attempt < 20 && !statusMessage.textContent.includes('기본 경로를 저장'); attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const pathBaseSaveWorks = Boolean(basePathSelect.value) &&
            basePathSelect.value === basePathInput.value &&
            !deleteBasePathButton.disabled;
          pathInput.value = 'refresh.md';
          openPathButton.click();
          for (let attempt = 0; attempt < 20 && !editor.value.includes('Before disk reload.'); attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const pathInputOpenWorks = editor.value.includes('Before disk reload.') &&
            fileLabel.textContent === 'refresh.md' &&
            pathInput.value.includes('refresh.md');
          await window.markdownViewer.saveCurrentFile({
            content: '# Refresh after\\n\\nAfter disk reload.',
            filePath: refreshSmokePath,
            defaultPath: 'refresh.md'
          });
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true, cancelable: true }));
          for (let attempt = 0; attempt < 20 && !editor.value.includes('After disk reload.'); attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const f5DiskReloadWorks = editor.value.includes('After disk reload.') &&
            preview.innerText.includes('After disk reload.') &&
            statusMessage.textContent.includes('새로고침: refresh.md');

          return {
            ready: Boolean(window.__markdownViewerReady),
            startupFileLoaded,
            preview: previewShowsSection79,
            quoteAccent: Boolean(quoteAccent),
            highlightedCode: highlightedCodePresent,
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
            relativeLocalLinkClick,
            relativeLocalLinkHash,
            pathControlsPresent: Boolean(pathInput) &&
              Boolean(openPathButton) &&
              Boolean(basePathSelect) &&
              Boolean(basePathInput) &&
              Boolean(saveBasePathButton) &&
              Boolean(deleteBasePathButton),
            pathBaseSaveWorks,
            pathInputOpenWorks,
            panelBarsRemoved: document.querySelectorAll('.panel-heading').length === 0,
            wordCountInStatusbar: Boolean(wordCount) &&
              document.querySelector('.statusbar #wordCount') === wordCount &&
              wordCount.textContent.includes('자'),
            tabsInHeader: Boolean(documentTabs) &&
              document.querySelector('.toolbar #documentTabs') === documentTabs &&
              tabBoxLimit &&
              tabDefaultSize &&
              tabsCreated,
            tabNavigationAndClose: tabSelectWorks && tabCloseWorks && closeAllTabsWorks,
            copyTextButtonRemoved: !document.querySelector('#copyTextButton'),
            copyMarkdownWorks,
            translateButtonPresent: Boolean(translateButton) &&
              translateButton.textContent === '번역' &&
              translateButton.previousElementSibling === copyMarkdownButton &&
              translateButton.nextElementSibling === themeButton &&
              translateButton.getAttribute('aria-pressed') === 'false',
            translateApiAvailable: typeof window.markdownViewer.translateToKorean === 'function',
            codeCopyButtonPresent: codeCopyButton?.textContent === 'Copy',
            codeBlockWrapDefault,
            copyCodeBlockWorks,
            pdfExportButtonPresent: Boolean(exportPdfButton),
            sourceToggleButtonPresent: Boolean(sourceToggleButton) &&
              sourceToggleButton.previousElementSibling === outlineButton &&
              sourceToggleButton.nextElementSibling === document.querySelector('#importButton'),
            sourceCollapsePersists: sourceCollapsed && sourceExpanded,
            f5RefreshWorks,
            f5DiskReloadWorks,
            ctrlASelectsActivePane: ctrlASelectsPreview && ctrlASelectsEditor,
            contentZoomWorks,
            outlineOpenByShortcut,
            outlineItemsReady: outlineItems.length >= 70,
            outlineClickScroll,
            outlineClickStatusUpdated: outlineClickStatus.includes('인덱스 이동'),
            outlineWidthResize: outlineAdjustedWidth > outlineInitialWidth,
            searchBarVisible: searchBarVisibleBeforeReload,
            searchInputFocused,
            searchCountFormat: searchCountFormatBeforeReload,
            searchCountNonZero: previousSearchCount !== '0/0',
            searchMarkPresent: searchMarkPresentBeforeReload,
            searchActiveMarkSingle: searchActiveMarkSingleBeforeReload,
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
      await fs.rm(linkedSmokeRoot, { recursive: true, force: true }).catch(() => {});
      console.log("smoke ok: renderer loaded");
      app.quit();
    } catch (error) {
      if (linkedSmokeRoot) {
        await fs.rm(linkedSmokeRoot, { recursive: true, force: true }).catch(() => {});
      }
      console.error(`smoke failed: ${error.message}`);
      app.exit(1);
    }
  });

  if (!isSmokeTest) {
    mainWindow.once("ready-to-show", () => mainWindow.show());
  }
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock({
  openFilePath: initialOpenFilePath,
});

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv, _workingDirectory, additionalData) => {
    const filePath = getOpenFilePathFromSecondInstance(argv, additionalData);
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
    if (filePath) {
      enqueueOpenFile(filePath);
    }
  });

  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    enqueueOpenFile(filePath);
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
  rememberDocumentPath(file.filePath);
  return file;
});

ipcMain.handle("file:open-linked", async (_event, payload) => {
  const { filePath, hash } = validateLinkedFilePayload(payload);
  const file = await readMarkdownFile(filePath);
  currentDocumentPath = file.filePath;
  rememberDocumentPath(file.filePath);
  return {
    ...file,
    hash,
  };
});

ipcMain.handle("file:open-path", async (_event, payload) => {
  const filePath = validateOpenPathPayload(payload);
  const file = await readMarkdownFile(filePath);
  currentDocumentPath = file.filePath;
  rememberDocumentPath(file.filePath);
  return file;
});

ipcMain.handle("file:reload-current", async (_event, filePath) => {
  const file = await readMarkdownFile(filePath);
  currentDocumentPath = file.filePath;
  rememberDocumentPath(file.filePath);
  return file;
});

ipcMain.handle("path:normalize-base", async (_event, basePath) => {
  const normalizedPath = validateBasePathArg(basePath);
  let stat = null;

  try {
    stat = await fs.stat(normalizedPath);
  } catch {
    throw new Error("기본 경로 폴더를 찾을 수 없습니다.");
  }

  if (!stat.isDirectory()) {
    throw new Error("기본 경로는 폴더여야 합니다.");
  }

  return normalizedPath;
});

ipcMain.handle("file:save-current", async (_event, payload) => {
  const { content, defaultPath, filePath } = validateCurrentSavePayload(payload);

  if (filePath && isKnownDocumentPath(filePath)) {
    await fs.writeFile(filePath, content, "utf8");
    currentDocumentPath = filePath;
    rememberDocumentPath(filePath);
    return {
      filePath,
      fileName: path.basename(filePath),
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
  rememberDocumentPath(normalizedPath);
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

ipcMain.handle("translate:ko", async (_event, payload) => {
  const texts = validateTranslatePayload(payload);
  const translatedTexts = [];

  for (const text of texts) {
    translatedTexts.push(await translateTextToKorean(text));
  }

  return translatedTexts;
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

function validateLinkedFilePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Local link payload is invalid.");
  }

  const href = typeof payload.href === "string" ? payload.href.trim() : "";
  if (!href) {
    throw new Error("Local link is empty.");
  }

  const sourceFilePath =
    typeof payload.sourceFilePath === "string" && payload.sourceFilePath.trim()
      ? normalizeFilePathArg(payload.sourceFilePath)
      : null;
  const basePath =
    typeof payload.basePath === "string" && payload.basePath.trim()
      ? validateBasePathArg(payload.basePath)
      : null;
  const { linkPath, hash } = parseLocalLinkHref(href);
  const filePath = path.isAbsolute(linkPath) || isWindowsAbsolutePath(linkPath)
    ? path.resolve(linkPath)
    : resolveRelativeLocalLinkPath(sourceFilePath, basePath, linkPath);

  const extension = path.extname(filePath).toLowerCase();
  if (!supportedOpenExtensions.has(extension)) {
    throw new Error("Local links can open Markdown or text files only.");
  }

  return {
    filePath,
    hash,
  };
}

function validateOpenPathPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("열 경로가 올바르지 않습니다.");
  }

  const inputPath = typeof payload.inputPath === "string" ? payload.inputPath : "";
  const basePath =
    typeof payload.basePath === "string" && payload.basePath.trim()
      ? validateBasePathArg(payload.basePath)
      : null;
  const filePath = resolveInputFilePath(inputPath, basePath);

  if (!filePath) {
    throw new Error("절대 경로 또는 기본 경로 기준 상대 경로가 필요합니다.");
  }

  const extension = path.extname(filePath).toLowerCase();
  if (!supportedOpenExtensions.has(extension)) {
    throw new Error("Markdown 또는 text 파일만 열 수 있습니다.");
  }

  return filePath;
}

function parseLocalLinkHref(href) {
  if (/^file:/i.test(href)) {
    try {
      const fileUrl = new URL(href);
      return {
        linkPath: fileURLToPath(fileUrl),
        hash: fileUrl.hash || "",
      };
    } catch {
      throw new Error("Local file URL is invalid.");
    }
  }

  const hashIndex = href.indexOf("#");
  const rawPath = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : href.slice(hashIndex);
  const linkPath = decodeLocalLinkPath(rawPath.trim());

  if (!linkPath) {
    throw new Error("Local link path is empty.");
  }

  if (hasUnsupportedLocalLinkScheme(linkPath)) {
    throw new Error("Unsupported link protocol.");
  }

  return {
    linkPath,
    hash,
  };
}

function decodeLocalLinkPath(value) {
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.includes("\0")) {
      throw new Error("Local link path contains an invalid character.");
    }
    return decoded;
  } catch (error) {
    if (error.message === "Local link path contains an invalid character.") {
      throw error;
    }
    throw new Error("Local link path is invalid.");
  }
}

function hasUnsupportedLocalLinkScheme(value) {
  return /^[a-z][a-z\d+.-]*:/i.test(value) && !isWindowsAbsolutePath(value);
}

function isWindowsAbsolutePath(value) {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\[^\\]/.test(value);
}

function resolveRelativeLocalLinkPath(sourceFilePath, basePath, linkPath) {
  if (sourceFilePath) {
    return path.resolve(path.dirname(sourceFilePath), linkPath);
  }

  if (basePath) {
    return path.resolve(basePath, linkPath);
  }

  throw new Error("상대 링크는 열린/저장된 문서 또는 기본 경로가 필요합니다.");
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

function validateTranslatePayload(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("번역할 텍스트 목록이 올바르지 않습니다.");
  }

  return payload.map((text) => {
    if (typeof text !== "string") {
      throw new Error("번역할 텍스트가 올바르지 않습니다.");
    }

    return text;
  });
}

async function translateTextToKorean(text) {
  if (!text.trim()) {
    return text;
  }

  const chunks = splitTextForTranslation(text);
  const translatedChunks = [];

  for (const chunk of chunks) {
    translatedChunks.push(await requestKoreanTranslation(chunk));
  }

  return translatedChunks.join("");
}

function splitTextForTranslation(text) {
  if (text.length <= maxTranslateChunkLength) {
    return [text];
  }

  const chunks = [];
  let rest = text;

  while (rest.length > maxTranslateChunkLength) {
    const windowText = rest.slice(0, maxTranslateChunkLength);
    const splitAt = findTranslationSplitIndex(windowText);
    chunks.push(rest.slice(0, splitAt));
    rest = rest.slice(splitAt);
  }

  if (rest) {
    chunks.push(rest);
  }

  return chunks;
}

function findTranslationSplitIndex(text) {
  const preferredBoundaries = ["\n\n", "\n", ". ", "! ", "? ", "; ", ", "];
  const minimumSplit = Math.floor(maxTranslateChunkLength * 0.55);

  for (const boundary of preferredBoundaries) {
    const index = text.lastIndexOf(boundary);
    if (index >= minimumSplit) {
      return index + boundary.length;
    }
  }

  return maxTranslateChunkLength;
}

async function requestKoreanTranslation(text) {
  const url = new URL(translateEndpoint);
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "auto");
  url.searchParams.set("tl", "ko");
  url.searchParams.append("dt", "t");
  url.searchParams.set("q", text);

  const response = await net.fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    throw new Error(`번역 서비스 오류 (${response.status})`);
  }

  const payload = await response.json();
  return parseTranslationResponse(payload);
}

function parseTranslationResponse(payload) {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    throw new Error("번역 서비스 응답 형식이 올바르지 않습니다.");
  }

  return payload[0]
    .map((part) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : ""))
    .join("");
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

async function runSecondInstanceSmoke() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error("main window is not available");
  }

  const marker = `second-instance-smoke-${process.pid}-${Date.now()}`;
  const smokeFilePath = path.join(app.getPath("temp"), `${marker}.md`);
  await fs.writeFile(smokeFilePath, `# ${marker}\n\nOpened from a second app instance.`, "utf8");

  const smokeUserDataArg = `--second-instance-smoke-user-data=${secondInstanceSmokeUserDataPath}`;
  const openThroughSecondInstance = (filePath) => {
    const childArgs = app.isPackaged
      ? [smokeUserDataArg, filePath]
      : [app.getAppPath(), smokeUserDataArg, filePath];
    const child = spawn(process.execPath, childArgs, {
      stdio: "ignore",
      windowsHide: true,
    });

    child.on("error", (error) => {
      console.error(`second-instance child launch failed: ${error.message}`);
    });
    child.unref();
  };

  openThroughSecondInstance(smokeFilePath);

  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const opened = await mainWindow.webContents.executeJavaScript(
      `(() => {
        const editor = document.querySelector('#markdownInput');
        const fileLabel = document.querySelector('#fileLabel');
        return Boolean(
          window.__markdownViewerReady &&
          editor?.value.includes(${JSON.stringify(marker)}) &&
          fileLabel?.textContent === ${JSON.stringify(path.basename(smokeFilePath))}
        );
      })()`,
      true,
    );

    if (opened) {
      break;
    }

    await delay(100);
  }

  const opened = await mainWindow.webContents.executeJavaScript(
    `(() => {
      const editor = document.querySelector('#markdownInput');
      const fileLabel = document.querySelector('#fileLabel');
      return Boolean(
        window.__markdownViewerReady &&
        editor?.value.includes(${JSON.stringify(marker)}) &&
        fileLabel?.textContent === ${JSON.stringify(path.basename(smokeFilePath))}
      );
    })()`,
    true,
  );
  if (!opened) {
    throw new Error("second-instance file was not opened in the existing window");
  }

  const updatedMarker = `${marker}-updated`;
  await fs.writeFile(smokeFilePath, `# ${updatedMarker}\n\nUpdated from a second app instance.`, "utf8");
  openThroughSecondInstance(smokeFilePath);

  const updateDeadline = Date.now() + 6000;
  while (Date.now() < updateDeadline) {
    const updated = await mainWindow.webContents.executeJavaScript(
      `(() => {
        const editor = document.querySelector('#markdownInput');
        const fileLabel = document.querySelector('#fileLabel');
        return Boolean(
          window.__markdownViewerReady &&
          editor?.value.includes(${JSON.stringify(updatedMarker)}) &&
          fileLabel?.textContent === ${JSON.stringify(path.basename(smokeFilePath))}
        );
      })()`,
      true,
    );

    if (updated) {
      console.log("second-instance smoke ok: file opened and updated in existing window");
      app.quit();
      return;
    }

    await delay(100);
  }

  throw new Error("second-instance file update was not shown in the existing window");
}

function getSecondInstanceSmokeUserDataPath(argv) {
  const prefix = "--second-instance-smoke-user-data=";
  const explicitArg = argv.find((arg) => typeof arg === "string" && arg.startsWith(prefix));
  if (explicitArg) {
    return path.resolve(stripMatchingQuotes(explicitArg.slice(prefix.length)));
  }

  if (!argv.includes("--second-instance-smoke")) {
    return null;
  }

  return path.join(os.tmpdir(), `markdown-viewer-second-instance-smoke-${process.pid}`);
}

function getOpenFilePathFromArgv(argv) {
  const args = argv.filter((arg) => typeof arg === "string" && arg.trim() && arg !== "--");

  for (let index = args.length - 1; index >= 0; index -= 1) {
    const filePath = normalizeSupportedOpenFilePath(args[index], { requireFile: true });
    if (filePath) {
      return filePath;
    }
  }

  const splitFilePath = getOpenFilePathFromSplitArgv(args);
  if (splitFilePath) {
    return splitFilePath;
  }

  for (let index = args.length - 1; index >= 0; index -= 1) {
    const filePath = normalizeSupportedOpenFilePath(args[index]);
    if (filePath) {
      return filePath;
    }
  }

  return null;
}

function getOpenFilePathFromSplitArgv(args) {
  for (let endIndex = args.length - 1; endIndex >= 0; endIndex -= 1) {
    for (let startIndex = endIndex - 1; startIndex >= 0; startIndex -= 1) {
      const filePath = normalizeSupportedOpenFilePath(args.slice(startIndex, endIndex + 1).join(" "), {
        requireFile: true,
      });
      if (filePath) {
        return filePath;
      }
    }
  }

  return null;
}

function getOpenFilePathFromSecondInstance(argv, additionalData) {
  const filePathFromData =
    additionalData && typeof additionalData.openFilePath === "string"
      ? normalizeSupportedOpenFilePath(additionalData.openFilePath)
      : null;

  return filePathFromData || getOpenFilePathFromArgv(argv);
}

function resolveInputFilePath(inputPath, basePath = null) {
  const normalizedInput = normalizeFilePathInput(inputPath);
  if (!normalizedInput) {
    return null;
  }

  if (isAbsoluteFilePathInput(normalizedInput)) {
    return normalizeFilePathArg(normalizedInput);
  }

  if (!basePath) {
    return null;
  }

  return path.resolve(basePath, normalizedInput);
}

function validateBasePathArg(basePath) {
  const normalizedBasePath = normalizeFilePathInput(basePath);
  if (!normalizedBasePath || !isAbsoluteFilePathInput(normalizedBasePath)) {
    throw new Error("기본 경로는 file:/// 또는 절대 폴더 경로여야 합니다.");
  }

  const basePathValue = normalizeFilePathArg(normalizedBasePath);
  if (!basePathValue) {
    throw new Error("기본 경로는 file:/// 또는 절대 폴더 경로여야 합니다.");
  }

  return path.resolve(basePathValue);
}

function isAbsoluteFilePathInput(filePath) {
  return /^file:\/\//i.test(filePath) || path.isAbsolute(filePath) || isWindowsAbsolutePath(filePath);
}

function normalizeSupportedOpenFilePath(filePath, { requireFile = false } = {}) {
  const normalizedPath = normalizeFilePathArg(filePath);
  if (!normalizedPath || !supportedOpenExtensions.has(path.extname(normalizedPath).toLowerCase())) {
    return null;
  }

  if (requireFile && !isFile(normalizedPath)) {
    return null;
  }

  return normalizedPath;
}

function isFile(filePath) {
  try {
    return fsSync.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function normalizeFilePathArg(arg) {
  const normalizedArg = normalizeFilePathInput(arg);
  if (!normalizedArg) {
    return null;
  }

  if (/^file:\/\//i.test(normalizedArg)) {
    try {
      return fileURLToPath(normalizedArg);
    } catch {
      return null;
    }
  }

  return path.resolve(normalizedArg);
}

function normalizeFilePathInput(arg) {
  if (typeof arg !== "string") {
    return null;
  }

  const normalizedArg = stripMatchingQuotes(arg.trim());
  if (!normalizedArg || normalizedArg.includes("\0")) {
    return null;
  }

  return normalizedArg;
}

function stripMatchingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDocumentPathKey(filePath) {
  const normalizedPath = path.resolve(filePath);
  return process.platform === "win32" ? normalizedPath.toLocaleLowerCase("en-US") : normalizedPath;
}

function rememberDocumentPath(filePath) {
  if (filePath) {
    knownDocumentPaths.add(getDocumentPathKey(filePath));
  }
}

function isKnownDocumentPath(filePath) {
  return filePath ? knownDocumentPaths.has(getDocumentPathKey(filePath)) : false;
}

function enqueueOpenFile(filePath) {
  const normalizedPath = normalizeSupportedOpenFilePath(filePath);
  if (!normalizedPath) {
    return false;
  }

  pendingFilePaths.push(normalizedPath);
  void flushPendingOpenFiles();
  return true;
}

async function flushPendingOpenFiles() {
  if (
    isFlushingOpenFiles ||
    pendingFilePaths.length === 0 ||
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    return [];
  }

  isFlushingOpenFiles = true;
  const loadedPayloads = [];

  try {
    const rendererReady = await waitForRendererReady();
    if (!rendererReady) {
      return loadedPayloads;
    }

    while (pendingFilePaths.length > 0) {
      const filePath = pendingFilePaths.shift();
      const payload = await loadFileInWindow(filePath);
      if (payload) {
        loadedPayloads.push(payload);
      }
    }
  } finally {
    isFlushingOpenFiles = false;
  }

  return loadedPayloads;
}

async function waitForRendererReady(timeoutMs = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return false;
    }

    if (mainWindow.webContents.isLoading()) {
      await delay(50);
      continue;
    }

    try {
      const isReady = await mainWindow.webContents.executeJavaScript(
        "Boolean(window.__markdownViewerReady && window.loadDocument)",
        true,
      );
      if (isReady) {
        return true;
      }
    } catch {
      return false;
    }

    await delay(50);
  }

  return false;
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
    rememberDocumentPath(payload.filePath);
    await deliverFileToRenderer(payload);
    return payload;
  } catch (error) {
    await deliverFileErrorToRenderer(error.message);
    return null;
  }
}

async function deliverFileToRenderer(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  await mainWindow.webContents.executeJavaScript(
    `window.loadDocument(${JSON.stringify(payload)}, "파일을 열었습니다");`,
    true,
  );
}

async function deliverFileErrorToRenderer(message) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
    return;
  }

  const statusMessage = `파일 열기 실패: ${message}`;
  try {
    const rendererReady = await waitForRendererReady(1000);
    if (!rendererReady) {
      return;
    }

    await mainWindow.webContents.executeJavaScript(
      `window.setMarkdownViewerStatus(${JSON.stringify(statusMessage)});`,
      true,
    );
  } catch {
    mainWindow.webContents.send("file:error", message);
  }
}
