const markdownInput = document.querySelector("#markdownInput");
const preview = document.querySelector("#preview");
const fileLabel = document.querySelector("#fileLabel");
const statusMessage = document.querySelector("#statusMessage");
const wordCount = document.querySelector("#wordCount");
const saveState = document.querySelector("#saveState");
const outlineButton = document.querySelector("#outlineButton");
const importButton = document.querySelector("#importButton");
const exportMarkdownButton = document.querySelector("#exportMarkdownButton");
const exportHtmlButton = document.querySelector("#exportHtmlButton");
const exportPdfButton = document.querySelector("#exportPdfButton");
const copyMarkdownButton = document.querySelector("#copyMarkdownButton");
const themeButton = document.querySelector("#themeButton");
const searchBar = document.querySelector("#searchBar");
const searchInput = document.querySelector("#searchInput");
const searchResultCount = document.querySelector("#searchResultCount");
const searchPreviousButton = document.querySelector("#searchPreviousButton");
const searchNextButton = document.querySelector("#searchNextButton");
const closeSearchButton = document.querySelector("#closeSearchButton");
const workspace = document.querySelector(".workspace");
const splitter = document.querySelector("#splitter");
const outlinePanel = document.querySelector("#outlinePanel");
const outlineList = document.querySelector("#outlineList");
const outlineSplitter = document.querySelector("#outlineSplitter");

let currentFileName = "document.md";
let currentFilePath = null;
let isDirty = false;
let isSyncingScroll = false;
let isSearchOpen = false;
let searchDebounceId = null;
let searchResults = [];
let activeSearchIndex = -1;
let isResizingSplit = false;
let isOutlineOpen = false;
let isResizingOutline = false;

const splitRatioStorageKey = "editorPreviewSplitRatio";
const outlineWidthStorageKey = "outlineWidth";
const minEditorRatio = 25;
const maxEditorRatio = 75;
const defaultOutlineWidth = 150;
const minOutlineWidth = 120;
const maxOutlineWidth = 360;

marked.setOptions({
  breaks: true,
  gfm: true,
  mangle: false,
  headerIds: false,
});

function renderMarkdown() {
  const markdown = markdownInput.value;
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
  renderOutline(outlineItems);
  syncScrollPosition(markdownInput, preview);
  wordCount.textContent = `${markdown.length.toLocaleString("ko-KR")}자`;
  updateSaveState();
  refreshSearchAfterRender();
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
      return;
    }

    hljs.highlightElement(block);
  });
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

function setFile(fileName, filePath) {
  currentFileName = fileName || "document.md";
  currentFilePath = filePath || null;
  isDirty = false;
  fileLabel.textContent = currentFilePath ? currentFileName : "새 문서";
  updateSaveState();
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
  markdownInput.value = file.content;
  setFile(file.fileName, file.filePath);
  markdownInput.scrollTop = 0;
  preview.scrollTop = 0;
  renderMarkdown();
  setStatus(`${statusPrefix}: ${file.fileName}`);
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

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  themeButton.textContent = nextTheme === "dark" ? "라이트 모드" : "다크 모드";
  themeButton.setAttribute("aria-pressed", String(nextTheme === "dark"));
  localStorage.setItem("theme", nextTheme);
}

function restoreTheme() {
  const storedTheme = localStorage.getItem("theme");
  const theme = storedTheme || "dark";
  document.documentElement.dataset.theme = theme;
  themeButton.textContent = theme === "dark" ? "라이트 모드" : "다크 모드";
  themeButton.setAttribute("aria-pressed", String(theme === "dark"));
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
    setStatus("지원하지 않는 링크 형식입니다.");
    return;
  }

  try {
    await window.markdownViewer.openExternal(href);
    setStatus("외부 링크를 열었습니다.");
  } catch (error) {
    setStatus(`링크 열기 실패: ${error.message}`);
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
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "F4") {
    event.preventDefault();
    toggleOutline();
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

markdownInput.addEventListener("input", handleMarkdownInput);
markdownInput.addEventListener("scroll", () => handleLinkedScroll(markdownInput, preview));
preview.addEventListener("scroll", () => handleLinkedScroll(preview, markdownInput));
preview.addEventListener("click", handlePreviewClick);
outlineButton.addEventListener("click", toggleOutline);
importButton.addEventListener("click", handleImport);
exportMarkdownButton.addEventListener("click", handleExportMarkdown);
exportHtmlButton.addEventListener("click", handleExportHtml);
exportPdfButton.addEventListener("click", handleExportPdf);
copyMarkdownButton.addEventListener("click", copyMarkdown);
themeButton.addEventListener("click", toggleTheme);
searchBar.addEventListener("submit", handleSearchSubmit);
searchInput.addEventListener("input", () => queueSearch({ direction: 0 }));
searchInput.addEventListener("keydown", handleSearchKeydown);
searchPreviousButton.addEventListener("click", () => moveSearch(-1));
searchNextButton.addEventListener("click", () => moveSearch(1));
closeSearchButton.addEventListener("click", closeSearch);
document.addEventListener("keydown", handleGlobalKeydown);
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
restoreEditorRatio();
restoreOutlineWidth();
renderMarkdown();
window.__markdownViewerReady = true;
