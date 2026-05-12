const sourceInput = document.querySelector("#sourceInput");
const previewFrame = document.querySelector("#previewFrame");
const fileInput = document.querySelector("#fileInput");
const openFileButton = document.querySelector("#openFileButton");
const openUrlButton = document.querySelector("#openUrlButton");
const urlInput = document.querySelector("#urlInput");
const basePathSelect = document.querySelector("#basePathSelect");
const basePathInput = document.querySelector("#basePathInput");
const saveBasePathButton = document.querySelector("#saveBasePathButton");
const deleteBasePathButton = document.querySelector("#deleteBasePathButton");
const downloadMarkdownButton = document.querySelector("#downloadMarkdownButton");
const downloadHtmlButton = document.querySelector("#downloadHtmlButton");
const copySourceButton = document.querySelector("#copySourceButton");
const outlineButton = document.querySelector("#outlineButton");
const modeButton = document.querySelector("#modeButton");
const themeSelect = document.querySelector("#themeSelect");
const fileLabel = document.querySelector("#fileLabel");
const statusLabel = document.querySelector("#statusLabel");
const countLabel = document.querySelector("#countLabel");
const outlinePanel = document.querySelector("#outlinePanel");
const outlineList = document.querySelector("#outlineList");
const workspace = document.querySelector(".workspace");

const markdownExtensions = [".md", ".markdown", ".txt"];
const settingsKey = "simpleMarkdownViewerExtensionSettings";
const defaultMarkdown = `# Simple Markdown Viewer

## Outline

- Source
- Viewer
- Themes

## Absolute link

[Debug index](file:///C:/My%20Projects/agent_orchestrator/debug/index.html)
`;

const themes = {
  "local-dark": {
    label: "Local Dark",
    stylesheet: "themes/local/dark.css",
    highlight: "vendor/highlight-github-dark.min.css",
    mode: "dark",
    background: "#0d1117",
  },
  "local-light": {
    label: "Local Light",
    stylesheet: "themes/local/light.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#ffffff",
  },
  "css-avenir-white": {
    label: "Avenir White",
    stylesheet: "themes/markdown-css-themes/avenir-white.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#fefefe",
  },
  "css-foghorn": {
    label: "Foghorn",
    stylesheet: "themes/markdown-css-themes/foghorn.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#fefefe",
  },
  "css-markdown": {
    label: "Markdown",
    stylesheet: "themes/markdown-css-themes/markdown.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#fefefe",
  },
  "css-markdown-alt": {
    label: "Markdown Alt",
    stylesheet: "themes/markdown-css-themes/markdown-alt.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#ffffff",
  },
  "css-markdown1": {
    label: "Markdown 1 Dark",
    stylesheet: "themes/markdown-css-themes/markdown1.css",
    highlight: "vendor/highlight-github-dark.min.css",
    mode: "dark",
    background: "#000000",
  },
  "css-markdown2": {
    label: "Markdown 2",
    stylesheet: "themes/markdown-css-themes/markdown2.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#fefefe",
  },
  "css-markdown3": {
    label: "Markdown 3",
    stylesheet: "themes/markdown-css-themes/markdown3.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#fefefe",
  },
  "css-swiss": {
    label: "Swiss",
    stylesheet: "themes/markdown-css-themes/swiss.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#fefefe",
  },
  "css-markdown4": {
    label: "Markdown CSS",
    stylesheet: "themes/markdown-css-themes/markdown4.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#fefefe",
  },
  "css-markdown5": {
    label: "Markdown 5",
    stylesheet: "themes/markdown-css-themes/markdown5.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#ffffff",
  },
  "css-markdown6": {
    label: "Markdown 6",
    stylesheet: "themes/markdown-css-themes/markdown6.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#ffffff",
  },
  "css-markdown7": {
    label: "Markdown 7",
    stylesheet: "themes/markdown-css-themes/markdown7.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#ffffff",
  },
  "css-markdown8": {
    label: "Markdown 8",
    stylesheet: "themes/markdown-css-themes/markdown8.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#ffffff",
  },
  "css-markdown9": {
    label: "Markdown 9 Dark",
    stylesheet: "themes/markdown-css-themes/markdown9.css",
    highlight: "vendor/highlight-github-dark.min.css",
    mode: "dark",
    background: "#110f14",
  },
  "css-markdown10": {
    label: "Markdown 10",
    stylesheet: "themes/markdown-css-themes/markdown10.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#f8f8f8",
  },
  "css-screen": {
    label: "Screen",
    stylesheet: "themes/markdown-css-themes/screen.css",
    highlight: "vendor/highlight-github.min.css",
    mode: "light",
    background: "#ffffff",
  },
};
const themeAliases = {
  "jasonm23-swiss": "css-swiss",
  "jasonm23-markdown4": "css-markdown4",
};
const themeGroups = [
  {
    label: "Local",
    keys: ["local-dark", "local-light"],
  },
  {
    label: "Markdown CSS Themes",
    keys: [
      "css-avenir-white",
      "css-foghorn",
      "css-markdown",
      "css-markdown-alt",
      "css-markdown1",
      "css-markdown2",
      "css-markdown3",
      "css-markdown4",
      "css-markdown5",
      "css-markdown6",
      "css-markdown7",
      "css-markdown8",
      "css-markdown9",
      "css-markdown10",
      "css-screen",
      "css-swiss",
    ],
  },
];

let currentDocument = {
  fileName: "document.md",
  sourceUrl: null,
  content: defaultMarkdown,
};
let appMode = "dark";
let currentTheme = "local-dark";
let isOutlineOpen = true;
let basePaths = [];
let activeBasePath = "";

marked.setOptions({
  breaks: true,
  gfm: true,
  mangle: false,
  headerIds: false,
});

function getExtensionUrl(path) {
  if (globalThis.chrome?.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }

  return new URL(path, window.location.href).href;
}

async function loadSettings() {
  const fallback = readLocalSettings();
  if (!globalThis.chrome?.storage?.local) {
    return fallback;
  }

  try {
    const result = await chrome.storage.local.get(settingsKey);
    return result[settingsKey] || fallback;
  } catch {
    return fallback;
  }
}

async function saveSettings() {
  const settings = {
    appMode,
    currentTheme,
    isOutlineOpen,
    basePaths,
    activeBasePath,
  };
  localStorage.setItem(settingsKey, JSON.stringify(settings));

  if (!globalThis.chrome?.storage?.local) {
    return;
  }

  await chrome.storage.local.set({ [settingsKey]: settings });
}

function readLocalSettings() {
  try {
    return JSON.parse(localStorage.getItem(settingsKey)) || {};
  } catch {
    return {};
  }
}

function setStatus(message) {
  statusLabel.textContent = message;
}

function normalizeThemeName(themeName) {
  if (themes[themeName]) {
    return themeName;
  }

  return themeAliases[themeName] || "local-dark";
}

function getTheme(themeName = currentTheme) {
  return themes[normalizeThemeName(themeName)] || themes["local-dark"];
}

function getDefaultThemeForMode(mode) {
  return mode === "dark" ? "local-dark" : "local-light";
}

function renderThemeOptions() {
  themeSelect.replaceChildren();

  themeGroups.forEach((group) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;

    group.keys.forEach((themeName) => {
      const theme = themes[themeName];
      if (!theme) {
        return;
      }

      const option = document.createElement("option");
      option.value = themeName;
      option.textContent = theme.label;
      optgroup.append(option);
    });

    themeSelect.append(optgroup);
  });
}

function setDocument({ fileName, sourceUrl = null, content }) {
  currentDocument = {
    fileName: fileName || "document.md",
    sourceUrl,
    content: content || "",
  };
  sourceInput.value = currentDocument.content;
  fileLabel.textContent = currentDocument.fileName;
  urlInput.value = currentDocument.sourceUrl || "";
  renderMarkdown();
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

function renderMarkdown() {
  const markdown = sourceInput.value;
  currentDocument.content = markdown;
  countLabel.textContent = `${markdown.length.toLocaleString("ko-KR")}자`;

  const unsafeHtml = marked.parse(normalizeMarkdownFences(markdown));
  const cleanHtml = DOMPurify.sanitize(unsafeHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed"],
    FORBID_ATTR: ["style", "onerror", "onclick", "onload"],
  });

  const previewDocument = document.implementation.createHTMLDocument("preview");
  previewDocument.body.innerHTML = cleanHtml;
  const outlineItems = assignHeadingIds(previewDocument.body);
  highlightCode(previewDocument.body);
  renderOutline(outlineItems);
  writePreviewFrame(previewDocument.body.innerHTML);
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

function highlightCode(root) {
  root.querySelectorAll("pre code").forEach((block) => {
    try {
      const languageClass = [...block.classList].find((className) => className.startsWith("language-"));
      if (languageClass) {
        hljs.highlightElement(block);
      } else {
        const highlighted = hljs.highlightAuto(block.textContent);
        block.innerHTML = highlighted.value;
      }
      block.classList.add("hljs");
    } catch {
      block.textContent = block.textContent;
    }
  });
}

function writePreviewFrame(bodyHtml) {
  const theme = getTheme();
  applyPreviewChrome(theme);
  const frameHtml = `<!doctype html>
<html lang="ko" data-preview-theme="${escapeAttribute(currentTheme)}" data-preview-mode="${escapeAttribute(theme.mode)}">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${escapeAttribute(getExtensionUrl(theme.stylesheet))}">
    <link rel="stylesheet" href="${escapeAttribute(getExtensionUrl(theme.highlight))}">
    <link rel="stylesheet" href="${escapeAttribute(getExtensionUrl("preview-safety.css"))}">
  </head>
  <body>${bodyHtml}</body>
</html>`;

  previewFrame.srcdoc = frameHtml;
  previewFrame.addEventListener("load", bindPreviewLinks, { once: true });
}

function applyPreviewChrome(theme) {
  document.documentElement.style.setProperty("--preview-bg", theme.background || "#ffffff");
}

function bindPreviewLinks() {
  const frameDocument = previewFrame.contentDocument;
  if (!frameDocument) {
    return;
  }

  frameDocument.addEventListener("click", handlePreviewClick);
}

async function handlePreviewClick(event) {
  const link = event.target.closest("a[href]");
  if (!link) {
    return;
  }

  event.preventDefault();
  const href = link.getAttribute("href");
  if (!href) {
    return;
  }

  if (href.startsWith("#")) {
    scrollFrameToHash(href);
    return;
  }

  const resolvedUrl = resolveLinkUrl(href);
  if (!resolvedUrl) {
    setStatus("상대 링크는 절대 경로 문서에서만 열 수 있습니다.");
    return;
  }

  if (isMarkdownUrl(resolvedUrl)) {
    await loadFromUrl(resolvedUrl);
    return;
  }

  openExternalUrl(resolvedUrl);
}

function resolveLinkUrl(href) {
  const pathUrl = toFileUrl(href);
  if (pathUrl) {
    return pathUrl;
  }

  if (/^(https?:|mailto:|file:)/i.test(href)) {
    return href;
  }

  if (!currentDocument.sourceUrl) {
    return resolveAgainstBasePath(href);
  }

  try {
    return new URL(href, currentDocument.sourceUrl).href;
  } catch {
    return resolveAgainstBasePath(href);
  }
}

function resolveInputUrl(value) {
  if (!value) {
    return null;
  }

  const pathUrl = toFileUrl(value);
  if (pathUrl) {
    return pathUrl;
  }

  if (/^(https?:|file:)/i.test(value)) {
    return value;
  }

  return resolveAgainstBasePath(value);
}

function resolveAgainstBasePath(relativePath) {
  if (!activeBasePath) {
    return null;
  }

  try {
    return new URL(relativePath.replaceAll("\\", "/"), activeBasePath).href;
  } catch {
    return null;
  }
}

function toFileUrl(value) {
  const trimmed = value.trim();
  if (/^file:/i.test(trimmed)) {
    try {
      return new URL(trimmed).href;
    } catch {
      return null;
    }
  }

  if (!/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return null;
  }

  const normalized = trimmed.replaceAll("\\", "/");
  return `file:///${encodeURI(normalized).replaceAll("#", "%23")}`;
}

function normalizeBasePath(value) {
  const fileUrl = toFileUrl(value) || value.trim();
  if (!fileUrl) {
    return null;
  }

  try {
    const url = new URL(fileUrl);
    if (url.protocol !== "file:") {
      return null;
    }

    if (!url.pathname.endsWith("/")) {
      url.pathname = `${url.pathname}/`;
    }

    return url.href;
  } catch {
    return null;
  }
}

function isMarkdownUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.toLowerCase();
    return markdownExtensions.some((extension) => path.endsWith(extension));
  } catch {
    return false;
  }
}

async function loadFromUrl(rawUrl) {
  const resolvedUrl = resolveInputUrl(rawUrl);
  if (!resolvedUrl) {
    setStatus("절대 경로 또는 기본 경로 기준 상대 경로가 필요합니다.");
    return;
  }

  try {
    const response = await fetch(resolvedUrl, { cache: "no-store" });
    if (!response.ok && response.status !== 0) {
      throw new Error(`HTTP ${response.status}`);
    }

    const content = await response.text();
    setDocument({
      fileName: getFileNameFromUrl(resolvedUrl),
      sourceUrl: resolvedUrl,
      content,
    });
    setStatus(`${getFileNameFromUrl(resolvedUrl)} 열기 완료`);
  } catch (error) {
    setStatus(`열기 실패: ${error.message}. 파일 URL 접근 허용을 확인하세요.`);
  }
}

function getFileNameFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const path = decodeURIComponent(url.pathname);
    return path.split(/[\\/]/).filter(Boolean).pop() || "document.md";
  } catch {
    return "document.md";
  }
}

function handleBasePathSelect() {
  activeBasePath = basePathSelect.value;
  basePathInput.value = activeBasePath;
  deleteBasePathButton.disabled = !activeBasePath;
  saveSettings();
}

function saveBasePath() {
  const normalizedPath = normalizeBasePath(basePathInput.value);
  if (!normalizedPath) {
    setStatus("기본 경로는 file:/// 또는 Windows 절대 경로여야 합니다.");
    return;
  }

  const previousPath = basePathSelect.value;
  basePaths = basePaths.filter((basePath) => basePath !== previousPath && basePath !== normalizedPath);
  basePaths.push(normalizedPath);
  activeBasePath = normalizedPath;
  renderBasePaths();
  saveSettings();
  setStatus("기본 경로를 저장했습니다.");
}

function deleteBasePath() {
  const selectedPath = basePathSelect.value;
  if (!selectedPath) {
    return;
  }

  basePaths = basePaths.filter((basePath) => basePath !== selectedPath);
  activeBasePath = basePaths[0] || "";
  renderBasePaths();
  saveSettings();
  setStatus("기본 경로를 삭제했습니다.");
}

function openExternalUrl(url) {
  if (globalThis.chrome?.tabs?.create && /^https?:|^file:/i.test(url)) {
    chrome.tabs.create({ url });
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

function scrollFrameToHash(hash) {
  const frameDocument = previewFrame.contentDocument;
  if (!frameDocument) {
    return;
  }

  const id = decodeHash(hash);
  const candidates = [id, id.replace(/^-+/, ""), makeHeadingSlug(id)];
  const target = candidates.map((candidate) => frameDocument.getElementById(candidate)).find(Boolean);
  if (!target) {
    setStatus("문서 내부 링크 대상을 찾을 수 없습니다.");
    return;
  }

  target.scrollIntoView({ block: "start" });
  setStatus(`문서 내부 링크 이동: ${target.textContent.trim() || target.id}`);
}

function decodeHash(hash) {
  const rawId = hash.slice(1);
  try {
    return decodeURIComponent(rawId);
  } catch {
    return rawId;
  }
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
    button.textContent = item.text;
    button.addEventListener("click", () => scrollFrameToHash(`#${encodeURIComponent(item.id)}`));
    outlineList.append(button);
  });
}

function toggleOutline() {
  isOutlineOpen = !isOutlineOpen;
  workspace.classList.toggle("outline-open", isOutlineOpen);
  outlinePanel.hidden = !isOutlineOpen;
  outlineButton.setAttribute("aria-pressed", String(isOutlineOpen));
  saveSettings();
}

function toggleMode() {
  appMode = appMode === "dark" ? "light" : "dark";
  currentTheme = getDefaultThemeForMode(appMode);
  applyMode();
  themeSelect.value = currentTheme;
  renderMarkdown();
  saveSettings();
}

function applyMode() {
  document.documentElement.dataset.mode = appMode;
  modeButton.textContent = appMode === "dark" ? "라이트" : "다크";
  modeButton.setAttribute("aria-pressed", String(appMode === "dark"));
}

function applyTheme(themeName) {
  currentTheme = normalizeThemeName(themeName);
  appMode = getTheme(currentTheme).mode;
  applyMode();
  themeSelect.value = currentTheme;
  renderMarkdown();
  saveSettings();
}

function makeHtmlDocument() {
  const theme = getTheme();
  const title = escapeHtml(currentDocument.fileName.replace(/\.(md|markdown|txt)$/i, ""));
  return `<!doctype html>
<html lang="ko" data-preview-theme="${escapeAttribute(currentTheme)}" data-preview-mode="${escapeAttribute(theme.mode)}">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="${theme.stylesheet}">
    <link rel="stylesheet" href="preview-safety.css">
  </head>
  <body>
${previewFrame.contentDocument?.body?.innerHTML || ""}
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

function escapeAttribute(value) {
  return escapeHtml(value);
}

async function downloadText(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  try {
    if (globalThis.chrome?.downloads?.download) {
      await chrome.downloads.download({
        url,
        filename: sanitizeDownloadName(filename),
        saveAs: true,
      });
      return;
    }

    const link = document.createElement("a");
    link.href = url;
    link.download = sanitizeDownloadName(filename);
    link.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function sanitizeDownloadName(filename) {
  return filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") || "document.md";
}

function getExportName(extension) {
  const baseName = currentDocument.fileName.replace(/\.(md|markdown|txt|html)$/i, "") || "document";
  return `${baseName}.${extension}`;
}

async function openSelectedFile() {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }

  const content = await file.text();
  setDocument({
    fileName: file.name || "document.md",
    sourceUrl: null,
    content,
  });
  setStatus(`${file.name} 열기 완료`);
  fileInput.value = "";
}

async function copySource() {
  try {
    await navigator.clipboard.writeText(sourceInput.value);
    setStatus("원문 복사 완료");
  } catch (error) {
    setStatus(`복사 실패: ${error.message}`);
  }
}

async function initialize() {
  const settings = await loadSettings();
  appMode = settings.appMode === "light" ? "light" : "dark";
  currentTheme = normalizeThemeName(settings.currentTheme);
  appMode = getTheme(currentTheme).mode;
  isOutlineOpen = settings.isOutlineOpen !== false;
  basePaths = Array.isArray(settings.basePaths)
    ? settings.basePaths.map(normalizeBasePath).filter(Boolean)
    : [];
  activeBasePath = normalizeBasePath(settings.activeBasePath || "") || basePaths[0] || "";

  renderThemeOptions();
  applyMode();
  themeSelect.value = currentTheme;
  renderBasePaths();
  workspace.classList.toggle("outline-open", isOutlineOpen);
  outlinePanel.hidden = !isOutlineOpen;
  outlineButton.setAttribute("aria-pressed", String(isOutlineOpen));

  const params = new URLSearchParams(window.location.search);
  const initialUrl = params.get("url");
  if (initialUrl) {
    await loadFromUrl(initialUrl);
    return;
  }

  setDocument(currentDocument);
}

sourceInput.addEventListener("input", renderMarkdown);
openFileButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", openSelectedFile);
openUrlButton.addEventListener("click", () => loadFromUrl(urlInput.value.trim()));
urlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    loadFromUrl(urlInput.value.trim());
  }
});
basePathSelect.addEventListener("change", handleBasePathSelect);
saveBasePathButton.addEventListener("click", saveBasePath);
deleteBasePathButton.addEventListener("click", deleteBasePath);
downloadMarkdownButton.addEventListener("click", () =>
  downloadText(sourceInput.value, getExportName("md"), "text/markdown;charset=utf-8"),
);
downloadHtmlButton.addEventListener("click", () =>
  downloadText(makeHtmlDocument(), getExportName("html"), "text/html;charset=utf-8"),
);
copySourceButton.addEventListener("click", copySource);
outlineButton.addEventListener("click", toggleOutline);
modeButton.addEventListener("click", toggleMode);
themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));

initialize();
