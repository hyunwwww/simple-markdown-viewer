const markdownInput = document.querySelector("#markdownInput");
const preview = document.querySelector("#preview");
const fileLabel = document.querySelector("#fileLabel");
const statusMessage = document.querySelector("#statusMessage");
const wordCount = document.querySelector("#wordCount");
const saveState = document.querySelector("#saveState");
const documentTabs = document.querySelector("#documentTabs");
const closeAllTabsButton = document.querySelector("#closeAllTabsButton");
const outlineButton = document.querySelector("#outlineButton");
const sourceToggleButton = document.querySelector("#sourceToggleButton");
const importButton = document.querySelector("#importButton");
const exportMarkdownButton = document.querySelector("#exportMarkdownButton");
const exportHtmlButton = document.querySelector("#exportHtmlButton");
const exportPdfButton = document.querySelector("#exportPdfButton");
const copyMarkdownButton = document.querySelector("#copyMarkdownButton");
const translateButton = document.querySelector("#translateButton");
const themeButton = document.querySelector("#themeButton");
const searchBar = document.querySelector("#searchBar");
const searchInput = document.querySelector("#searchInput");
const searchResultCount = document.querySelector("#searchResultCount");
const searchPreviousButton = document.querySelector("#searchPreviousButton");
const searchNextButton = document.querySelector("#searchNextButton");
const closeSearchButton = document.querySelector("#closeSearchButton");
const pathOpenForm = document.querySelector("#pathOpenForm");
const pathInput = document.querySelector("#pathInput");
const basePathSelect = document.querySelector("#basePathSelect");
const basePathInput = document.querySelector("#basePathInput");
const saveBasePathButton = document.querySelector("#saveBasePathButton");
const deleteBasePathButton = document.querySelector("#deleteBasePathButton");
const workspace = document.querySelector(".workspace");
const editorPanel = document.querySelector("#editorPanel");
const zoomIndicator = document.querySelector("#zoomIndicator");
const splitter = document.querySelector("#splitter");
const outlinePanel = document.querySelector("#outlinePanel");
const outlineList = document.querySelector("#outlineList");
const outlineSplitter = document.querySelector("#outlineSplitter");

let currentFileName = "document.md";
let currentFilePath = null;
let isDirty = false;
let documents = [];
let activeDocumentId = null;
let nextDocumentId = 1;
let isSyncingScroll = false;
let isSearchOpen = false;
let searchDebounceId = null;
let searchResults = [];
let activeSearchIndex = -1;
let isResizingSplit = false;
let isEditorCollapsed = false;
let activeContentArea = "editor";
let zoomIndicatorTimeoutId = null;
let isOutlineOpen = false;
let isResizingOutline = false;
let isTranslationEnabled = false;
let translationDebounceId = null;
let translationRunId = 0;
let basePaths = [];
let activeBasePath = "";

const splitRatioStorageKey = "editorPreviewSplitRatio";
const sourceCollapsedStorageKey = "sourcePanelCollapsed";
const contentZoomStorageKey = "contentZoomPercent";
const outlineWidthStorageKey = "outlineWidth";
const pathSettingsStorageKey = "pathOpenSettings";
const translationBatchSize = 40;
const groupedTranslationMaxLength = 2800;
const maxTranslationCacheEntries = 1200;
const minEditorRatio = 25;
const maxEditorRatio = 75;
const minContentZoom = 70;
const maxContentZoom = 220;
const contentZoomStep = 10;
const defaultContentZoom = 100;
const defaultOutlineWidth = 250;
const minOutlineWidth = 120;
const maxOutlineWidth = 360;
const translationCache = new Map();

marked.setOptions({
  breaks: true,
  gfm: true,
  mangle: false,
  headerIds: false,
});

function renderMarkdown() {
  const markdown = markdownInput.value;
  syncActiveDocumentFromEditor({ includeScroll: false });
  const unsafeHtml = marked.parse(normalizeMarkdownFences(markdown));
  const cleanHtml = DOMPurify.sanitize(unsafeHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed"],
    FORBID_ATTR: ["style", "onerror", "onclick", "onload"],
  });

  preview.innerHTML = cleanHtml;
  const outlineItems = assignHeadingIds(preview);
  decorateQuoteAccent(preview);
  highlightCodeBlocks(preview);
  resolveImages(preview);
  renderOutline(outlineItems);
  syncScrollPosition(markdownInput, preview);
  wordCount.textContent = `${markdown.length.toLocaleString("ko-KR")}자`;
  updateSaveState();
  renderDocumentTabs();
  if (isTranslationEnabled) {
    queuePreviewTranslation();
  } else {
    refreshSearchAfterRender();
  }
}

function normalizeMarkdownFences(markdown) {
  let inApostropheFence = false;

  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      const openMatch = trimmed.match(/^'''([\w#+.-]+)?\s*$/);

      if (!inApostropheFence && openMatch) {
        inApostropheFence = true;
        return `\`\`\`${openMatch[1] || ""}`;
      }

      if (inApostropheFence && trimmed === "'''") {
        inApostropheFence = false;
        return "```";
      }

      return line;
    })
    .join("\n");
}

function decorateQuoteAccent(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.includes("''") || hasCodeAncestor(node)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  nodes.forEach(replaceQuoteTextNode);
}

function hasCodeAncestor(node) {
  let parent = node.parentElement;
  while (parent) {
    if (parent.matches("code, pre")) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

function replaceQuoteTextNode(node) {
  const regex = /''([^'\n]+?)''/g;
  const text = node.nodeValue;
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let match = regex.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    const span = document.createElement("span");
    span.className = "quote-accent";
    span.textContent = match[1];
    fragment.append(span);
    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    fragment.append(document.createTextNode(text.slice(lastIndex)));
  }

  node.parentNode.replaceChild(fragment, node);
}

function highlightCodeBlocks(root) {
  root.querySelectorAll("pre code").forEach((block) => {
    const languageClass = [...block.classList].find((className) => className.startsWith("language-"));
    if (!languageClass) {
      const highlighted = hljs.highlightAuto(block.textContent);
      block.innerHTML = highlighted.value;
      block.classList.add("hljs");
      attachCodeCopyButton(block);
      return;
    }

    hljs.highlightElement(block);
    attachCodeCopyButton(block);
  });
}

async function resolveImages(root) {
  if (!currentFilePath) return;
  const imgs = [...root.querySelectorAll("img[src]")];
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:") || src.startsWith("http://") || src.startsWith("https://")) return;
      try {
        const dataUrl = await window.markdownViewer.loadImage({ src, filePath: currentFilePath });
        img.src = dataUrl;
      } catch {
        // leave broken image as-is
      }
    })
  );
}

function attachCodeCopyButton(block) {
  const pre = block.closest("pre");
  if (!pre || pre.parentElement?.classList.contains("code-block")) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "code-block";
  pre.parentNode.insertBefore(wrapper, pre);
  wrapper.append(pre);

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "code-copy-button";
  copyButton.textContent = "Copy";
  copyButton.setAttribute("aria-label", "코드 블록 복사");
  copyButton.addEventListener("click", () => copyCodeBlock(block));
  wrapper.append(copyButton);
}

async function copyCodeBlock(block) {
  try {
    await window.markdownViewer.copyText(block.textContent);
    setStatus("코드 블록을 복사했습니다.");
  } catch (error) {
    setStatus(`코드 블록 복사 실패: ${error.message}`);
  }
}

function syncScrollPosition(source, target) {
  const sourceScrollable = source.scrollHeight - source.clientHeight;
  const targetScrollable = target.scrollHeight - target.clientHeight;
  if (sourceScrollable <= 0 || targetScrollable <= 0) {
    return;
  }

  const ratio = source.scrollTop / sourceScrollable;
  target.scrollTop = ratio * targetScrollable;
}

function handleLinkedScroll(source, target) {
  if (isSyncingScroll) {
    return;
  }

  isSyncingScroll = true;
  requestAnimationFrame(() => {
    syncScrollPosition(source, target);
    isSyncingScroll = false;
  });
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function createDocument({
  fileName = "document.md",
  filePath = null,
  content = "",
  dirty = false,
  editorScrollTop = 0,
  previewScrollTop = 0,
} = {}) {
  return {
    id: `document-${nextDocumentId}`,
    fileName: fileName || "document.md",
    filePath: filePath || null,
    content,
    isDirty: dirty,
    editorScrollTop,
    previewScrollTop,
  };
}

function addDocument(documentState) {
  nextDocumentId += 1;
  documents.push(documentState);
  return documentState;
}

function initializeDocuments() {
  if (documents.length > 0) {
    return;
  }

  const initialDocument = addDocument(
    createDocument({
      fileName: currentFileName,
      filePath: currentFilePath,
      content: markdownInput.value,
      dirty: isDirty,
    }),
  );
  activeDocumentId = initialDocument.id;
}

function getActiveDocument() {
  return documents.find((documentState) => documentState.id === activeDocumentId) || null;
}

function normalizeDocumentPath(filePath) {
  return typeof filePath === "string" ? filePath.toLocaleLowerCase("en-US") : "";
}

function findDocumentByFilePath(filePath) {
  const normalizedPath = normalizeDocumentPath(filePath);
  if (!normalizedPath) {
    return null;
  }

  return documents.find((documentState) => normalizeDocumentPath(documentState.filePath) === normalizedPath) || null;
}

function getDocumentDisplayName(documentState) {
  if (!documentState.filePath && documentState.fileName === "document.md") {
    return "새 문서";
  }

  return documentState.fileName || "새 문서";
}

function updateFileLabel() {
  fileLabel.textContent = currentFilePath ? currentFileName : "새 문서";
}

function updatePathInput() {
  pathInput.value = currentFilePath || "";
}

function syncActiveDocumentFromEditor({ includeScroll = true } = {}) {
  const activeDocument = getActiveDocument();
  if (!activeDocument) {
    return;
  }

  activeDocument.fileName = currentFileName;
  activeDocument.filePath = currentFilePath;
  activeDocument.content = markdownInput.value;
  activeDocument.isDirty = isDirty;

  if (includeScroll) {
    activeDocument.editorScrollTop = markdownInput.scrollTop;
    activeDocument.previewScrollTop = preview.scrollTop;
  }
}

function selectDocument(documentId, { skipSync = false, status = null } = {}) {
  const nextDocument = documents.find((documentState) => documentState.id === documentId);
  if (!nextDocument) {
    return;
  }

  if (!skipSync) {
    syncActiveDocumentFromEditor();
  }

  activeDocumentId = nextDocument.id;
  currentFileName = nextDocument.fileName || "document.md";
  currentFilePath = nextDocument.filePath || null;
  isDirty = Boolean(nextDocument.isDirty);
  markdownInput.value = nextDocument.content || "";
  updateFileLabel();
  updatePathInput();
  renderMarkdown();
  markdownInput.scrollTop = nextDocument.editorScrollTop || 0;
  preview.scrollTop = nextDocument.previewScrollTop || 0;
  renderDocumentTabs();

  if (status) {
    setStatus(status);
  }
}

function renderDocumentTabs() {
  documentTabs.replaceChildren();

  documents.forEach((documentState) => {
    const tab = document.createElement("div");
    const isActive = documentState.id === activeDocumentId;
    const displayName = getDocumentDisplayName(documentState);
    tab.className = `document-tab${isActive ? " is-active" : ""}`;
    tab.dataset.documentId = documentState.id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(isActive));
    tab.setAttribute("tabindex", isActive ? "0" : "-1");
    tab.setAttribute("title", displayName);

    const title = document.createElement("span");
    title.className = "document-tab-title";
    title.textContent = displayName;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "document-tab-close";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", `${displayName} 닫기`);
    closeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      closeDocument(documentState.id);
    });

    tab.append(title, closeButton);
    tab.addEventListener("click", () => selectDocument(documentState.id));
    tab.addEventListener("keydown", handleDocumentTabKeydown);
    documentTabs.append(tab);
  });

  closeAllTabsButton.disabled = documents.length === 0;
}

function handleDocumentTabKeydown(event) {
  const currentIndex = documents.findIndex((documentState) => documentState.id === event.currentTarget.dataset.documentId);
  if (currentIndex === -1) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectDocument(documents[currentIndex].id);
    return;
  }

  if (event.key === "Delete") {
    event.preventDefault();
    closeDocument(documents[currentIndex].id);
    return;
  }

  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }

  event.preventDefault();
  const direction = event.key === "ArrowRight" ? 1 : -1;
  const nextIndex = (currentIndex + direction + documents.length) % documents.length;
  selectDocument(documents[nextIndex].id);
  documentTabs.querySelector(`[data-document-id="${documents[nextIndex].id}"]`)?.focus();
}

function confirmCloseDocuments(targetDocuments) {
  const dirtyCount = targetDocuments.filter((documentState) => documentState.isDirty).length;
  if (dirtyCount === 0) {
    return true;
  }

  return window.confirm(`${dirtyCount}개의 수정 중인 문서가 있습니다. 저장하지 않고 닫을까요?`);
}

function closeDocument(documentId) {
  syncActiveDocumentFromEditor();
  const closeIndex = documents.findIndex((documentState) => documentState.id === documentId);
  if (closeIndex === -1) {
    return;
  }

  const closingDocument = documents[closeIndex];
  if (!confirmCloseDocuments([closingDocument])) {
    return;
  }

  const wasActive = closingDocument.id === activeDocumentId;
  const closingName = getDocumentDisplayName(closingDocument);
  documents.splice(closeIndex, 1);

  if (documents.length === 0) {
    const emptyDocument = addDocument(createDocument());
    selectDocument(emptyDocument.id, { skipSync: true, status: `${closingName} 문서를 닫았습니다` });
    return;
  }

  if (wasActive) {
    const nextDocument = documents[Math.min(closeIndex, documents.length - 1)];
    selectDocument(nextDocument.id, { skipSync: true, status: `${closingName} 문서를 닫았습니다` });
    return;
  }

  renderDocumentTabs();
  setStatus(`${closingName} 문서를 닫았습니다`);
}

function closeAllDocuments() {
  syncActiveDocumentFromEditor();
  if (!confirmCloseDocuments(documents)) {
    return;
  }

  documents = [];
  const emptyDocument = addDocument(createDocument());
  selectDocument(emptyDocument.id, { skipSync: true, status: "모든 문서를 닫았습니다" });
}

function shouldReuseActiveDocumentForImport() {
  const activeDocument = getActiveDocument();
  return (
    documents.length === 1 &&
    activeDocument &&
    !activeDocument.filePath &&
    !activeDocument.isDirty
  );
}

function setFile(fileName, filePath) {
  currentFileName = fileName || "document.md";
  currentFilePath = filePath || null;
  isDirty = false;
  syncActiveDocumentFromEditor();
  updateFileLabel();
  updatePathInput();
  updateSaveState();
  renderDocumentTabs();
}

function updateSaveState() {
  if (isDirty) {
    saveState.textContent = "수정됨";
    return;
  }

  saveState.textContent = currentFilePath ? "저장됨" : "새 문서";
}

function getPreviewHtml() {
  const previewClone = preview.cloneNode(true);
  previewClone.querySelectorAll("button.code-copy-button").forEach((button) => button.remove());
  previewClone.querySelectorAll("mark.search-highlight").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent));
  });
  previewClone.normalize();
  return previewClone.innerHTML;
}

function assignHeadingIds(root) {
  const usedIds = new Map();
  return [...root.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((heading) => {
    const text = heading.textContent.trim();
    const baseId = heading.id || makeHeadingSlug(text);
    const id = makeUniqueHeadingId(baseId, usedIds);
    heading.id = id;
    return {
      id,
      text: text || "Untitled",
      level: Number(heading.tagName.slice(1)),
    };
  });
}

function makeHeadingSlug(text) {
  const slug = text
    .trim()
    .toLocaleLowerCase("ko-KR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  return slug.replaceAll("-", "") ? slug : "section";
}

function makeUniqueHeadingId(baseId, usedIds) {
  const normalizedId = String(baseId).trim() || "section";
  const count = usedIds.get(normalizedId) || 0;
  usedIds.set(normalizedId, count + 1);
  return count === 0 ? normalizedId : `${normalizedId}-${count}`;
}

function renderOutline(items) {
  outlineList.replaceChildren();

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "outline-empty";
    empty.textContent = "헤딩 없음";
    outlineList.append(empty);
    return;
  }

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `outline-item outline-level-${item.level}`;
    button.dataset.targetId = item.id;
    button.textContent = item.text;
    button.addEventListener("click", () => scrollToHeading(item.id, item.text));
    outlineList.append(button);
  });
}

function scrollToHeading(id, text) {
  const heading = document.getElementById(id);
  if (!heading) {
    setStatus("인덱스 항목을 찾을 수 없습니다.");
    return;
  }

  scrollPreviewTarget(heading);
  setStatus(`인덱스 이동: ${text}`);
}

function scrollPreviewTarget(target) {
  const targetRect = target.getBoundingClientRect();
  const previewRect = preview.getBoundingClientRect();
  preview.scrollTop += targetRect.top - previewRect.top - 8;
}

function setOutlineOpen(open) {
  isOutlineOpen = open;
  workspace.classList.toggle("outline-open", open);
  outlinePanel.hidden = !open;
  outlineSplitter.hidden = !open;
  outlineButton.setAttribute("aria-pressed", String(open));
  setStatus(open ? "Outline을 열었습니다." : "Outline을 닫았습니다.");
}

function toggleOutline() {
  setOutlineOpen(!isOutlineOpen);
}

function setEditorCollapsed(collapsed, { persist = true, announce = true } = {}) {
  isEditorCollapsed = collapsed;
  workspace.classList.toggle("editor-collapsed", collapsed);
  editorPanel.hidden = collapsed;
  splitter.hidden = collapsed;
  sourceToggleButton.textContent = "원문";
  sourceToggleButton.title = collapsed ? "왼쪽 원문 프레임 펼치기" : "왼쪽 원문 프레임 접기";
  sourceToggleButton.setAttribute("aria-label", sourceToggleButton.title);
  sourceToggleButton.setAttribute("aria-expanded", String(!collapsed));
  sourceToggleButton.setAttribute("aria-pressed", String(collapsed));

  if (collapsed && editorPanel.contains(document.activeElement)) {
    preview.focus({ preventScroll: true });
  }

  if (persist) {
    localStorage.setItem(sourceCollapsedStorageKey, collapsed ? "true" : "false");
  }

  if (announce) {
    setStatus(collapsed ? "원문 프레임을 접었습니다." : "원문 프레임을 펼쳤습니다.");
  }
}

function toggleEditorPanel() {
  setEditorCollapsed(!isEditorCollapsed);
}

function restoreEditorCollapsedState() {
  setEditorCollapsed(localStorage.getItem(sourceCollapsedStorageKey) === "true", {
    persist: false,
    announce: false,
  });
}

function refreshCurrentView() {
  if (!currentFilePath) {
    renderMarkdown();
    setStatus("새로고침했습니다.");
    return;
  }

  if (isDirty) {
    renderMarkdown();
    setStatus("새로고침했습니다. 저장하지 않은 변경사항이 있어 파일 재읽기는 건너뛰었습니다.");
    return;
  }

  window.markdownViewer.reloadCurrentFile(currentFilePath)
    .then((file) => loadDocument(file, "새로고침"))
    .catch((error) => setStatus(`새로고침 실패: ${error.message}`));
}

function loadPathSettings() {
  let settings = {};

  try {
    settings = JSON.parse(localStorage.getItem(pathSettingsStorageKey)) || {};
  } catch {
    settings = {};
  }

  basePaths = Array.isArray(settings.basePaths)
    ? settings.basePaths.filter((basePath) => typeof basePath === "string" && basePath.trim())
    : [];
  activeBasePath =
    typeof settings.activeBasePath === "string" && basePaths.includes(settings.activeBasePath)
      ? settings.activeBasePath
      : basePaths[0] || "";
  renderBasePaths();
}

function savePathSettings() {
  localStorage.setItem(
    pathSettingsStorageKey,
    JSON.stringify({
      basePaths,
      activeBasePath,
    }),
  );
}

function renderBasePaths() {
  basePathSelect.replaceChildren();

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "기본 경로 없음";
  basePathSelect.append(emptyOption);

  basePaths.forEach((basePath) => {
    const option = document.createElement("option");
    option.value = basePath;
    option.textContent = basePath;
    basePathSelect.append(option);
  });

  basePathSelect.value = basePaths.includes(activeBasePath) ? activeBasePath : "";
  activeBasePath = basePathSelect.value;
  basePathInput.value = activeBasePath;
  deleteBasePathButton.disabled = !activeBasePath;
}

function normalizePathKey(filePath) {
  return filePath.toLocaleLowerCase("en-US");
}

function handleBasePathSelect() {
  activeBasePath = basePathSelect.value;
  basePathInput.value = activeBasePath;
  deleteBasePathButton.disabled = !activeBasePath;
  savePathSettings();
}

async function saveBasePath() {
  try {
    const normalizedPath = await window.markdownViewer.normalizeBasePath(basePathInput.value);
    const previousPath = basePathSelect.value;
    const normalizedKey = normalizePathKey(normalizedPath);
    const previousKey = previousPath ? normalizePathKey(previousPath) : "";
    basePaths = basePaths.filter((basePath) => {
      const key = normalizePathKey(basePath);
      return key !== normalizedKey && key !== previousKey;
    });
    basePaths.push(normalizedPath);
    activeBasePath = normalizedPath;
    renderBasePaths();
    savePathSettings();
    setStatus("기본 경로를 저장했습니다.");
  } catch (error) {
    setStatus(`기본 경로 저장 실패: ${error.message}`);
  }
}

function deleteBasePath() {
  const selectedPath = basePathSelect.value;
  if (!selectedPath) {
    return;
  }

  const selectedKey = normalizePathKey(selectedPath);
  basePaths = basePaths.filter((basePath) => normalizePathKey(basePath) !== selectedKey);
  activeBasePath = basePaths[0] || "";
  renderBasePaths();
  savePathSettings();
  setStatus("기본 경로를 삭제했습니다.");
}

async function handleOpenPath(event) {
  event.preventDefault();
  const inputPath = pathInput.value.trim();
  if (!inputPath) {
    setStatus("열 경로를 입력하세요.");
    return;
  }

  try {
    const file = await window.markdownViewer.openPath({
      inputPath,
      basePath: activeBasePath,
    });
    if (file && file.external) {
      setStatus(`외부 앱에서 열었습니다: ${file.fileName}`);
      return;
    }
    loadDocument(file, "경로 열기 완료");
  } catch (error) {
    setStatus(`경로 열기 실패: ${error.message}`);
  }
}

function rememberContentArea(area) {
  activeContentArea = area;
}

function shouldKeepNativeSelectAll(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement ||
    target?.isContentEditable
  );
}

function selectActiveContentArea() {
  const area = isEditorCollapsed && activeContentArea === "editor" ? "preview" : activeContentArea;
  if (area === "preview") {
    selectPreviewContent();
    return;
  }

  selectEditorContent();
}

function selectEditorContent() {
  markdownInput.focus({ preventScroll: true });
  markdownInput.select();
  setStatus("원문 영역을 선택했습니다.");
}

function selectPreviewContent() {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(preview);
  selection.removeAllRanges();
  selection.addRange(range);
  preview.focus({ preventScroll: true });
  setStatus("뷰어 영역을 선택했습니다.");
}

function isContentSurface(target) {
  return target instanceof Element && (editorPanel.contains(target) || preview.contains(target));
}

function restoreContentZoom() {
  const storedZoom = Number.parseInt(localStorage.getItem(contentZoomStorageKey), 10);
  setContentZoom(Number.isFinite(storedZoom) ? storedZoom : defaultContentZoom, {
    persist: false,
    announce: false,
  });
}

function setContentZoom(zoom, { persist = true, announce = true } = {}) {
  const clampedZoom = Math.min(maxContentZoom, Math.max(minContentZoom, zoom));
  const roundedZoom = Math.round(clampedZoom);
  document.documentElement.style.setProperty("--content-zoom", `${roundedZoom}%`);

  if (persist) {
    localStorage.setItem(contentZoomStorageKey, String(roundedZoom));
  }

  if (announce) {
    showZoomIndicator(roundedZoom);
  }
}

function getContentZoom() {
  const currentZoom = Number.parseInt(localStorage.getItem(contentZoomStorageKey), 10);
  return Number.isFinite(currentZoom) ? currentZoom : defaultContentZoom;
}

function showZoomIndicator(zoom) {
  zoomIndicator.textContent = `${zoom}%`;
  zoomIndicator.hidden = false;

  if (zoomIndicatorTimeoutId) {
    window.clearTimeout(zoomIndicatorTimeoutId);
  }

  zoomIndicatorTimeoutId = window.setTimeout(() => {
    zoomIndicator.hidden = true;
    zoomIndicatorTimeoutId = null;
  }, 900);
}

function handleContentWheel(event) {
  if (!event.ctrlKey || !isContentSurface(event.target)) {
    return;
  }

  event.preventDefault();
  const direction = event.deltaY < 0 ? 1 : -1;
  setContentZoom(getContentZoom() + direction * contentZoomStep);
}

function makeHtmlDocument() {
  const title = escapeHtml(currentFileName.replace(/\.(md|markdown|txt)$/i, ""));
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
  </head>
  <body>
${getPreviewHtml()}
  </body>
</html>
`;
}

function makePdfDocument() {
  const title = escapeHtml(currentFileName.replace(/\.(md|markdown|txt)$/i, ""));
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
      body {
        margin: 32px;
        color: #111827;
        background: #ffffff;
        font-family: "Noto Sans KR", "Malgun Gothic", "Segoe UI", Arial, sans-serif;
        line-height: 1.65;
      }
      a { color: #16595a; }
      pre {
        overflow: visible;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        padding: 14px;
        background: #f8fafc;
        white-space: pre-wrap;
        word-break: break-word;
      }
      code {
        border: 1px solid #d1d5db;
        border-radius: 4px;
        padding: 2px 5px;
        background: #f8fafc;
        font-family: Consolas, "Courier New", monospace;
      }
      pre code {
        border: 0;
        padding: 0;
      }
      blockquote {
        margin-left: 0;
        padding: 12px 14px;
        border-left: 4px solid #7092be;
        background: #f8fafc;
      }
      table {
        border-collapse: collapse;
        width: 100%;
      }
      th,
      td {
        border: 1px solid #d1d5db;
        padding: 8px 10px;
      }
      img {
        max-width: 100%;
      }
    </style>
  </head>
  <body>
${getPreviewHtml()}
  </body>
</html>
`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function defaultExportName(extension) {
  const baseName = currentFileName.replace(/\.(md|markdown|txt|html|pdf)$/i, "") || "document";
  return `${baseName}.${extension}`;
}

function loadDocument(file, statusPrefix = "파일을 열었습니다") {
  const linkedHash = typeof file.hash === "string" ? file.hash : "";
  const existingDocument = findDocumentByFilePath(file.filePath);
  if (existingDocument) {
    const isExistingActive = existingDocument.id === activeDocumentId;
    if (!existingDocument.isDirty) {
      existingDocument.fileName = file.fileName;
      existingDocument.filePath = file.filePath;
      existingDocument.content = file.content;
      existingDocument.editorScrollTop = 0;
      existingDocument.previewScrollTop = 0;
    }
    selectDocument(existingDocument.id, {
      skipSync: isExistingActive,
      status: `${statusPrefix}: ${file.fileName}`,
    });
    scrollToLinkedHash(linkedHash);
    return;
  }

  if (shouldReuseActiveDocumentForImport()) {
    const activeDocument = getActiveDocument();
    activeDocument.fileName = file.fileName;
    activeDocument.filePath = file.filePath;
    activeDocument.content = file.content;
    activeDocument.isDirty = false;
    activeDocument.editorScrollTop = 0;
    activeDocument.previewScrollTop = 0;
    selectDocument(activeDocument.id, { skipSync: true, status: `${statusPrefix}: ${file.fileName}` });
    scrollToLinkedHash(linkedHash);
    return;
  }

  syncActiveDocumentFromEditor();
  const importedDocument = addDocument(
    createDocument({
      fileName: file.fileName,
      filePath: file.filePath,
      content: file.content,
      dirty: false,
    }),
  );
  selectDocument(importedDocument.id, { skipSync: true, status: `${statusPrefix}: ${file.fileName}` });
  scrollToLinkedHash(linkedHash);
}

function scrollToLinkedHash(hash) {
  if (!hash) {
    return;
  }

  const normalizedHash = hash.startsWith("#") ? hash : `#${hash}`;
  window.requestAnimationFrame(() => {
    const target = findHashTarget(normalizedHash);
    if (!target) {
      setStatus("Local file opened, but the linked heading was not found.");
      return;
    }

    scrollPreviewTarget(target);
    setStatus(`Local link target: ${target.textContent.trim() || target.id}`);
  });
}

async function handleSaveCurrent() {
  try {
    const saved = await window.markdownViewer.saveCurrentFile({
      content: markdownInput.value,
      filePath: currentFilePath,
      defaultPath: currentFileName,
    });

    if (!saved) {
      setStatus("저장을 취소했습니다.");
      return;
    }

    setFile(saved.fileName, saved.filePath);
    setStatus(`${saved.fileName} 파일을 저장했습니다.`);
  } catch (error) {
    setStatus(`저장 실패: ${error.message}`);
  }
}

async function handleImport() {
  try {
    const file = await window.markdownViewer.openFile();
    if (!file) {
      setStatus("가져오기를 취소했습니다.");
      return;
    }

    loadDocument(file, "가져오기 완료");
  } catch (error) {
    setStatus(`가져오기 실패: ${error.message}`);
  }
}

async function handleExportMarkdown() {
  await exportContent(markdownInput.value, defaultExportName("md"), "md");
}

async function handleExportHtml() {
  await exportContent(makeHtmlDocument(), defaultExportName("html"), "html");
}

async function handleExportPdf() {
  try {
    const saved = await window.markdownViewer.exportPdf({
      html: makePdfDocument(),
      defaultPath: defaultExportName("pdf"),
    });

    if (!saved) {
      setStatus("PDF 내보내기를 취소했습니다.");
      return;
    }

    setStatus(`${saved.fileName} 파일로 내보냈습니다.`);
  } catch (error) {
    setStatus(`PDF 내보내기 실패: ${error.message}`);
  }
}

async function exportContent(content, defaultPath, type) {
  try {
    const saved = await window.markdownViewer.exportFile({ content, defaultPath, type });
    if (!saved) {
      setStatus("내보내기를 취소했습니다.");
      return;
    }

    setStatus(`${saved.fileName} 파일로 내보냈습니다.`);
  } catch (error) {
    setStatus(`내보내기 실패: ${error.message}`);
  }
}

async function copyMarkdown() {
  await writeClipboard(markdownInput.value, "Markdown 원문을 복사했습니다.");
}

async function writeClipboard(text, successMessage) {
  try {
    await window.markdownViewer.copyText(text);
    setStatus(successMessage);
  } catch (error) {
    setStatus(`복사 실패: ${error.message}`);
  }
}

function toggleTranslation() {
  isTranslationEnabled = !isTranslationEnabled;
  translationRunId += 1;
  clearPendingTranslation();
  updateTranslateButton();

  if (!isTranslationEnabled) {
    renderMarkdown();
    setStatus("우측 뷰어를 원문으로 되돌렸습니다.");
    return;
  }

  renderMarkdown();
}

function updateTranslateButton() {
  translateButton.textContent = isTranslationEnabled ? "원문" : "번역";
  translateButton.setAttribute("aria-pressed", String(isTranslationEnabled));
  translateButton.title = isTranslationEnabled
    ? "우측 뷰어를 원문으로 되돌리기"
    : "우측 뷰어를 한국어로 번역";
}

function clearPendingTranslation() {
  if (translationDebounceId) {
    window.clearTimeout(translationDebounceId);
    translationDebounceId = null;
  }

  translateButton.removeAttribute("aria-busy");
}

function queuePreviewTranslation() {
  clearPendingTranslation();
  const runId = ++translationRunId;
  translateButton.setAttribute("aria-busy", "true");
  setStatus("우측 뷰어를 한국어로 번역 중입니다. 문서 텍스트가 번역 서비스로 전송됩니다.");

  translationDebounceId = window.setTimeout(() => {
    translationDebounceId = null;
    translatePreviewToKorean(runId).finally(() => {
      if (runId === translationRunId) {
        translateButton.removeAttribute("aria-busy");
      }
    });
  }, 160);
}

async function translatePreviewToKorean(runId) {
  const entries = getTranslatablePreviewEntries();
  if (runId !== translationRunId || !isTranslationEnabled) {
    return;
  }

  if (entries.length === 0) {
    refreshSearchAfterRender();
    setStatus("번역할 텍스트가 없습니다.");
    return;
  }

  let translatedCount = 0;

  try {
    for (let start = 0; start < entries.length; start += translationBatchSize) {
      if (runId !== translationRunId || !isTranslationEnabled) {
        return;
      }

      const batch = entries.slice(start, start + translationBatchSize);
      const uncachedEntries = [];

      batch.forEach((entry) => {
        const cachedTranslation = translationCache.get(entry.text);
        if (typeof cachedTranslation === "string") {
          entry.node.nodeValue = `${entry.leading}${cachedTranslation}${entry.trailing}`;
          translatedCount += 1;
          return;
        }

        uncachedEntries.push(entry);
      });

      if (uncachedEntries.length === 0) {
        continue;
      }

      const translatedTexts = await translateEntryBatch(uncachedEntries);
      if (runId !== translationRunId || !isTranslationEnabled) {
        return;
      }

      if (!Array.isArray(translatedTexts) || translatedTexts.length !== uncachedEntries.length) {
        throw new Error("번역 결과 개수가 맞지 않습니다.");
      }

      uncachedEntries.forEach((entry, index) => {
        const translatedText = typeof translatedTexts[index] === "string" ? translatedTexts[index] : entry.text;
        rememberCachedTranslation(entry.text, translatedText);
        entry.node.nodeValue = `${entry.leading}${translatedText}${entry.trailing}`;
        translatedCount += 1;
      });
    }

    if (runId !== translationRunId || !isTranslationEnabled) {
      return;
    }

    preview.normalize();
    renderOutlineFromCurrentPreview();
    refreshSearchAfterRender();
    setStatus(`우측 뷰어를 한국어로 번역했습니다. (${translatedCount.toLocaleString("ko-KR")}개 텍스트)`);
  } catch (error) {
    if (runId !== translationRunId) {
      return;
    }

    isTranslationEnabled = false;
    translationRunId += 1;
    clearPendingTranslation();
    updateTranslateButton();
    renderMarkdown();
    setStatus(`번역 실패: ${error.message}`);
  }
}

function getTranslatablePreviewEntries() {
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.nodeValue || "";
      if (!text.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentElement;
      if (
        !parent ||
        parent.closest("pre, code, kbd, samp, .code-copy-button, .search-highlight, script, style")
      ) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const entries = [];

  while (walker.nextNode()) {
    const entry = makeTranslationEntry(walker.currentNode);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function makeTranslationEntry(node) {
  const rawText = node.nodeValue || "";
  const leading = rawText.match(/^\s*/)?.[0] || "";
  const trailing = rawText.match(/\s*$/)?.[0] || "";
  const text = rawText.slice(leading.length, rawText.length - trailing.length);

  if (!/[\p{Letter}\p{Number}]/u.test(text)) {
    return null;
  }

  return {
    node,
    leading,
    text,
    trailing,
  };
}

async function translateEntryBatch(entries) {
  const chunks = createGroupedTranslationChunks(entries);
  const translatedChunks = await window.markdownViewer.translateToKorean(chunks.map((chunk) => chunk.text));
  if (!Array.isArray(translatedChunks) || translatedChunks.length !== chunks.length) {
    throw new Error("번역 결과 개수가 맞지 않습니다.");
  }

  const translatedTexts = [];
  let shouldFallback = false;

  chunks.forEach((chunk, index) => {
    const parts = splitGroupedTranslation(translatedChunks[index], chunk.id);
    if (parts.length !== chunk.entries.length) {
      shouldFallback = true;
      return;
    }

    translatedTexts.push(...parts);
  });

  if (!shouldFallback && translatedTexts.length === entries.length) {
    return translatedTexts;
  }

  return window.markdownViewer.translateToKorean(entries.map((entry) => entry.text));
}

function createGroupedTranslationChunks(entries) {
  const chunks = [];
  let currentEntries = [];
  let currentText = "";

  entries.forEach((entry) => {
    const separator = currentEntries.length > 0 ? makeGroupedTranslationMarker(chunks.length, currentEntries.length) : "";
    const nextText = currentEntries.length > 0 ? `${currentText}\n${separator}\n${entry.text}` : entry.text;

    if (currentEntries.length > 0 && nextText.length > groupedTranslationMaxLength) {
      chunks.push({
        id: chunks.length,
        entries: currentEntries,
        text: currentText,
      });
      currentEntries = [entry];
      currentText = entry.text;
      return;
    }

    currentEntries.push(entry);
    currentText = nextText;
  });

  if (currentEntries.length > 0) {
    chunks.push({
      id: chunks.length,
      entries: currentEntries,
      text: currentText,
    });
  }

  return chunks;
}

function makeGroupedTranslationMarker(chunkId, segmentIndex) {
  return `[[[SMV_SEG_${chunkId}_${segmentIndex}]]]`;
}

function splitGroupedTranslation(translatedText, chunkId) {
  if (typeof translatedText !== "string") {
    return [];
  }

  const markerPattern = new RegExp(`\\s*\\[\\[\\[SMV_SEG_${chunkId}_\\d+\\]\\]\\]\\s*`, "g");
  return translatedText.split(markerPattern);
}

function rememberCachedTranslation(sourceText, translatedText) {
  if (translationCache.size >= maxTranslationCacheEntries) {
    translationCache.clear();
  }

  translationCache.set(sourceText, translatedText);
}

function renderOutlineFromCurrentPreview() {
  const items = [...preview.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((heading) => ({
    id: heading.id,
    text: heading.textContent.trim() || "Untitled",
    level: Number(heading.tagName.slice(1)),
  }));

  renderOutline(items);
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  setThemeButtonState(nextTheme);
  localStorage.setItem("theme", nextTheme);
}

function setThemeButtonState(theme) {
  const buttonLabel = theme === "dark" ? "라이트 모드" : "다크 모드";
  themeButton.textContent = theme === "dark" ? "☀" : "☾";
  themeButton.title = buttonLabel;
  themeButton.setAttribute("aria-label", buttonLabel);
  themeButton.setAttribute("aria-pressed", String(theme === "dark"));
}

function restoreTheme() {
  const storedTheme = localStorage.getItem("theme");
  const theme = storedTheme || "dark";
  document.documentElement.dataset.theme = theme;
  setThemeButtonState(theme);
}

function openSearch({ runExistingSearch = true } = {}) {
  isSearchOpen = true;
  searchBar.hidden = false;
  searchInput.focus();
  searchInput.select();

  if (searchInput.value.trim()) {
    if (runExistingSearch) {
      queueSearch({ direction: 0, preserveIndex: true });
    }
    return;
  }

  searchResultCount.textContent = "0/0";
}

function closeSearch() {
  isSearchOpen = false;
  clearPendingSearch();
  searchInput.value = "";
  searchBar.hidden = true;
  clearSearchHighlights();
  resetSearchState();
  markdownInput.focus();
  setStatus("검색을 닫았습니다.");
}

function clearPendingSearch() {
  if (!searchDebounceId) {
    return;
  }

  window.clearTimeout(searchDebounceId);
  searchDebounceId = null;
}

function queueSearch(options = {}) {
  clearPendingSearch();
  searchDebounceId = window.setTimeout(() => {
    searchDebounceId = null;
    runPreviewSearch(options);
  }, 80);
}

function runPreviewSearch({ direction = 0, preserveIndex = false } = {}) {
  const query = searchInput.value.trim();
  if (!query) {
    clearSearchHighlights();
    resetSearchState();
    setStatus("검색어를 입력하세요.");
    return;
  }

  const previousIndex = activeSearchIndex;
  clearSearchHighlights();
  searchResults = highlightPreviewMatches(query);

  if (searchResults.length === 0) {
    activeSearchIndex = -1;
    updateSearchCount();
    setStatus("검색 결과가 없습니다.");
    searchInput.focus({ preventScroll: true });
    return;
  }

  if (direction !== 0) {
    const startIndex = previousIndex === -1 ? (direction > 0 ? -1 : 0) : previousIndex;
    activeSearchIndex = wrapSearchIndex(startIndex + direction);
  } else if (preserveIndex && previousIndex !== -1) {
    activeSearchIndex = Math.min(previousIndex, searchResults.length - 1);
  } else {
    activeSearchIndex = 0;
  }

  activateSearchResult(activeSearchIndex);
}

function refreshSearchAfterRender() {
  if (!isSearchOpen || !searchInput.value.trim()) {
    return;
  }

  queueSearch({ direction: 0, preserveIndex: true });
}

function highlightPreviewMatches(query) {
  const matches = [];
  const normalizedQuery = query.toLocaleLowerCase("ko-KR");
  const textNodes = getPreviewTextNodes();

  textNodes.forEach((node) => {
    const text = node.nodeValue;
    const normalizedText = text.toLocaleLowerCase("ko-KR");
    const matchRanges = [];
    let index = normalizedText.indexOf(normalizedQuery);

    while (index !== -1) {
      matchRanges.push([index, index + query.length]);
      index = normalizedText.indexOf(normalizedQuery, index + normalizedQuery.length);
    }

    if (matchRanges.length === 0) {
      return;
    }

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    matchRanges.forEach(([start, end]) => {
      if (start > lastIndex) {
        fragment.append(document.createTextNode(text.slice(lastIndex, start)));
      }

      const mark = document.createElement("mark");
      mark.className = "search-highlight";
      mark.textContent = text.slice(start, end);
      fragment.append(mark);
      matches.push(mark);
      lastIndex = end;
    });

    if (lastIndex < text.length) {
      fragment.append(document.createTextNode(text.slice(lastIndex)));
    }

    node.parentNode.replaceChild(fragment, node);
  });

  return matches;
}

function getPreviewTextNodes() {
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      if (node.parentElement?.closest("mark.search-highlight")) {
        return NodeFilter.FILTER_REJECT;
      }

      if (node.parentElement?.closest(".code-copy-button")) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }
  return nodes;
}

function clearSearchHighlights() {
  preview.querySelectorAll("mark.search-highlight").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent));
  });
  preview.normalize();
}

function resetSearchState() {
  searchResults = [];
  activeSearchIndex = -1;
  searchResultCount.textContent = "0/0";
}

function wrapSearchIndex(index) {
  if (searchResults.length === 0) {
    return -1;
  }

  return (index + searchResults.length) % searchResults.length;
}

function activateSearchResult(index) {
  searchResults.forEach((mark) => mark.classList.remove("search-highlight-active"));
  activeSearchIndex = wrapSearchIndex(index);

  const activeMark = searchResults[activeSearchIndex];
  if (!activeMark) {
    updateSearchCount();
    return;
  }

  activeMark.classList.add("search-highlight-active");
  activeMark.scrollIntoView({ block: "center", inline: "nearest" });
  searchInput.focus({ preventScroll: true });
  updateSearchCount();
  setStatus(`검색 결과 ${activeSearchIndex + 1}/${searchResults.length}`);
}

function updateSearchCount() {
  searchResultCount.textContent =
    searchResults.length > 0 ? `${activeSearchIndex + 1}/${searchResults.length}` : "0/0";
}

function moveSearch(direction) {
  openSearch({ runExistingSearch: false });

  if (!searchInput.value.trim()) {
    searchInput.focus();
    return;
  }

  queueSearch({ direction });
}

function handleSearchSubmit(event) {
  event.preventDefault();
  moveSearch(1);
}

function handleSearchKeydown(event) {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  moveSearch(event.shiftKey ? -1 : 1);
}

async function handlePreviewClick(event) {
  const link = event.target.closest("a[href]");
  if (!link || !preview.contains(link)) {
    return;
  }

  event.preventDefault();
  const href = link.getAttribute("href");
  if (!href) {
    return;
  }

  if (href.startsWith("#")) {
    const target = findHashTarget(href);
    if (!target) {
      setStatus("문서 안에서 링크 대상을 찾을 수 없습니다.");
      return;
    }

    scrollPreviewTarget(target);
    setStatus(`문서 내부 링크 이동: ${target.textContent.trim() || target.id}`);
    return;
  }

  if (!/^(https?:|mailto:)/i.test(href)) {
    await openLocalPreviewLink(href);
    return;
  }

  try {
    await window.markdownViewer.openExternal(href);
    setStatus("외부 링크를 열었습니다.");
  } catch (error) {
    setStatus(`링크 열기 실패: ${error.message}`);
  }
}

async function openLocalPreviewLink(href) {
  try {
    const file = await window.markdownViewer.openLinkedFile({
      href,
      sourceFilePath: currentFilePath,
      basePath: activeBasePath,
    });
    if (file && file.external) {
      setStatus(`외부 앱에서 열었습니다: ${file.fileName}`);
      return;
    }
    loadDocument(file, "Local link opened");
  } catch (error) {
    setStatus(`Local link open failed: ${error.message}`);
  }
}

function findHashTarget(hash) {
  const id = decodeHash(hash);
  const candidates = [id, id.replace(/^-+/, ""), makeHeadingSlug(id)];
  for (const candidate of candidates) {
    const target = document.getElementById(candidate);
    if (target) {
      return target;
    }
  }

  return null;
}

function decodeHash(hash) {
  const rawId = hash.slice(1);
  try {
    return decodeURIComponent(rawId);
  } catch {
    return rawId;
  }
}

function handleGlobalKeydown(event) {
  const key = event.key.toLowerCase();
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "F5") {
    event.preventDefault();
    refreshCurrentView();
    return;
  }

  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "F4") {
    event.preventDefault();
    toggleOutline();
    return;
  }

  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "F3") {
    event.preventDefault();
    toggleEditorPanel();
    return;
  }

  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "F2") {
    event.preventDefault();
    toggleTranslation();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && key === "a" && !event.altKey && !shouldKeepNativeSelectAll(event.target)) {
    event.preventDefault();
    selectActiveContentArea();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && key === "f") {
    event.preventDefault();
    openSearch();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && key === "s") {
    event.preventDefault();
    handleSaveCurrent();
    return;
  }

  if (event.key === "Escape" && isSearchOpen) {
    event.preventDefault();
    closeSearch();
  }
}

function restoreEditorRatio() {
  const storedRatio = Number.parseFloat(localStorage.getItem(splitRatioStorageKey));
  if (Number.isFinite(storedRatio)) {
    setEditorRatio(storedRatio);
  }
}

function setEditorRatio(ratio) {
  const clampedRatio = Math.min(maxEditorRatio, Math.max(minEditorRatio, ratio));
  workspace.style.setProperty("--editor-ratio", `${clampedRatio}%`);
  splitter.setAttribute("aria-valuenow", String(Math.round(clampedRatio)));
  localStorage.setItem(splitRatioStorageKey, clampedRatio.toFixed(2));
}

function setEditorRatioFromPointer(clientX) {
  const rect = workspace.getBoundingClientRect();
  if (rect.width <= 0) {
    return;
  }

  setEditorRatio(((clientX - rect.left) / rect.width) * 100);
}

function startSplitResize(event) {
  if (event.button !== 0) {
    return;
  }

  isResizingSplit = true;
  workspace.classList.add("is-resizing");
  splitter.setPointerCapture(event.pointerId);
  setEditorRatioFromPointer(event.clientX);
}

function resizeSplit(event) {
  if (!isResizingSplit) {
    return;
  }

  setEditorRatioFromPointer(event.clientX);
}

function stopSplitResize(event) {
  if (!isResizingSplit) {
    return;
  }

  isResizingSplit = false;
  workspace.classList.remove("is-resizing");
  if (splitter.hasPointerCapture(event.pointerId)) {
    splitter.releasePointerCapture(event.pointerId);
  }
}

function handleSplitterKeydown(event) {
  const currentRatio = Number.parseFloat(splitter.getAttribute("aria-valuenow")) || 50;
  const step = event.shiftKey ? 10 : 2;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    setEditorRatio(currentRatio - step);
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    setEditorRatio(currentRatio + step);
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    setEditorRatio(minEditorRatio);
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    setEditorRatio(maxEditorRatio);
  }
}

function restoreOutlineWidth() {
  const storedWidth = Number.parseFloat(localStorage.getItem(outlineWidthStorageKey));
  setOutlineWidth(Number.isFinite(storedWidth) ? storedWidth : defaultOutlineWidth);
}

function setOutlineWidth(width) {
  const clampedWidth = Math.min(maxOutlineWidth, Math.max(minOutlineWidth, width));
  workspace.style.setProperty("--outline-width", `${clampedWidth}px`);
  outlineSplitter.setAttribute("aria-valuenow", String(Math.round(clampedWidth)));
  localStorage.setItem(outlineWidthStorageKey, clampedWidth.toFixed(0));
}

function setOutlineWidthFromPointer(clientX) {
  const rect = workspace.getBoundingClientRect();
  const style = getComputedStyle(workspace);
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  setOutlineWidth(rect.right - paddingRight - clientX);
}

function startOutlineResize(event) {
  if (event.button !== 0) {
    return;
  }

  isResizingOutline = true;
  workspace.classList.add("is-resizing-outline");
  outlineSplitter.setPointerCapture(event.pointerId);
  setOutlineWidthFromPointer(event.clientX);
}

function resizeOutline(event) {
  if (!isResizingOutline) {
    return;
  }

  setOutlineWidthFromPointer(event.clientX);
}

function stopOutlineResize(event) {
  if (!isResizingOutline) {
    return;
  }

  isResizingOutline = false;
  workspace.classList.remove("is-resizing-outline");
  if (outlineSplitter.hasPointerCapture(event.pointerId)) {
    outlineSplitter.releasePointerCapture(event.pointerId);
  }
}

function handleOutlineSplitterKeydown(event) {
  const currentWidth = Number.parseFloat(outlineSplitter.getAttribute("aria-valuenow")) || defaultOutlineWidth;
  const step = event.shiftKey ? 40 : 10;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    setOutlineWidth(currentWidth + step);
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    setOutlineWidth(currentWidth - step);
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    setOutlineWidth(minOutlineWidth);
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    setOutlineWidth(maxOutlineWidth);
  }
}

function handleMarkdownInput() {
  isDirty = true;
  renderMarkdown();
}

editorPanel.addEventListener("pointerenter", () => rememberContentArea("editor"));
editorPanel.addEventListener("pointerdown", () => rememberContentArea("editor"));
preview.addEventListener("pointerenter", () => rememberContentArea("preview"));
preview.addEventListener("pointerdown", () => rememberContentArea("preview"));
markdownInput.addEventListener("focus", () => rememberContentArea("editor"));
preview.addEventListener("focus", () => rememberContentArea("preview"));
markdownInput.addEventListener("input", handleMarkdownInput);
markdownInput.addEventListener("scroll", () => {
  const activeDocument = getActiveDocument();
  if (activeDocument) {
    activeDocument.editorScrollTop = markdownInput.scrollTop;
  }
  handleLinkedScroll(markdownInput, preview);
});
preview.addEventListener("scroll", () => {
  const activeDocument = getActiveDocument();
  if (activeDocument) {
    activeDocument.previewScrollTop = preview.scrollTop;
  }
  handleLinkedScroll(preview, markdownInput);
});
preview.addEventListener("click", handlePreviewClick);
outlineButton.addEventListener("click", toggleOutline);
sourceToggleButton.addEventListener("click", toggleEditorPanel);
importButton.addEventListener("click", handleImport);
exportMarkdownButton.addEventListener("click", handleExportMarkdown);
exportHtmlButton.addEventListener("click", handleExportHtml);
exportPdfButton.addEventListener("click", handleExportPdf);
copyMarkdownButton.addEventListener("click", copyMarkdown);
translateButton.addEventListener("click", toggleTranslation);
themeButton.addEventListener("click", toggleTheme);
closeAllTabsButton.addEventListener("click", closeAllDocuments);
searchBar.addEventListener("submit", handleSearchSubmit);
searchInput.addEventListener("input", () => queueSearch({ direction: 0 }));
searchInput.addEventListener("keydown", handleSearchKeydown);
searchPreviousButton.addEventListener("click", () => moveSearch(-1));
searchNextButton.addEventListener("click", () => moveSearch(1));
closeSearchButton.addEventListener("click", closeSearch);
pathOpenForm.addEventListener("submit", handleOpenPath);
basePathSelect.addEventListener("change", handleBasePathSelect);
saveBasePathButton.addEventListener("click", saveBasePath);
deleteBasePathButton.addEventListener("click", deleteBasePath);
document.addEventListener("keydown", handleGlobalKeydown);
document.addEventListener("wheel", handleContentWheel, { passive: false });
splitter.addEventListener("pointerdown", startSplitResize);
splitter.addEventListener("pointermove", resizeSplit);
splitter.addEventListener("pointerup", stopSplitResize);
splitter.addEventListener("pointercancel", stopSplitResize);
splitter.addEventListener("keydown", handleSplitterKeydown);
outlineSplitter.addEventListener("pointerdown", startOutlineResize);
outlineSplitter.addEventListener("pointermove", resizeOutline);
outlineSplitter.addEventListener("pointerup", stopOutlineResize);
outlineSplitter.addEventListener("pointercancel", stopOutlineResize);
outlineSplitter.addEventListener("keydown", handleOutlineSplitterKeydown);
window.markdownViewer.onFileLoaded((file) => loadDocument(file));
window.markdownViewer.onFileError((message) => setStatus(`파일 열기 실패: ${message}`));

restoreTheme();
updateTranslateButton();
restoreEditorRatio();
restoreEditorCollapsedState();
restoreContentZoom();
restoreOutlineWidth();
loadPathSettings();
initializeDocuments();
updatePathInput();
renderMarkdown();
window.loadDocument = loadDocument;
window.setMarkdownViewerStatus = setStatus;
window.__markdownViewerReady = true;
