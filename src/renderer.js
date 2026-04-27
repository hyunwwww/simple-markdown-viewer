const markdownInput = document.querySelector("#markdownInput");
const preview = document.querySelector("#preview");
const fileLabel = document.querySelector("#fileLabel");
const statusMessage = document.querySelector("#statusMessage");
const wordCount = document.querySelector("#wordCount");
const saveState = document.querySelector("#saveState");
const importButton = document.querySelector("#importButton");
const exportMarkdownButton = document.querySelector("#exportMarkdownButton");
const exportHtmlButton = document.querySelector("#exportHtmlButton");
const copyMarkdownButton = document.querySelector("#copyMarkdownButton");
const copyTextButton = document.querySelector("#copyTextButton");
const themeButton = document.querySelector("#themeButton");

let currentFileName = "document.md";
let currentFilePath = null;
let isSyncingScroll = false;

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
  decorateQuoteAccent(preview);
  highlightCodeBlocks(preview);
  syncScrollPosition(markdownInput, preview);
  wordCount.textContent = `${markdown.length.toLocaleString("ko-KR")}자`;
  saveState.textContent = currentFilePath ? "수정 가능" : "새 문서";
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
  fileLabel.textContent = currentFilePath ? currentFileName : "새 문서";
}

function getPreviewText() {
  return preview.innerText.trim();
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
${preview.innerHTML}
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
  const baseName = currentFileName.replace(/\.(md|markdown|txt|html)$/i, "") || "document";
  return `${baseName}.${extension}`;
}

async function handleImport() {
  try {
    const file = await window.markdownViewer.openFile();
    if (!file) {
      setStatus("가져오기를 취소했습니다.");
      return;
    }

    markdownInput.value = file.content;
    setFile(file.fileName, file.filePath);
    renderMarkdown();
    setStatus(`${file.fileName} 파일을 가져왔습니다.`);
  } catch (error) {
    setStatus(`가져오기 실패: ${error.message}`);
  }
}

async function handleExportMarkdown() {
  await exportContent(markdownInput.value, defaultExportName("md"));
}

async function handleExportHtml() {
  await exportContent(makeHtmlDocument(), defaultExportName("html"));
}

async function exportContent(content, defaultPath) {
  try {
    const saved = await window.markdownViewer.saveFile({ content, defaultPath });
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
  await copyText(markdownInput.value, "Markdown 원문을 복사했습니다.");
}

async function copyPreviewText() {
  await copyText(getPreviewText(), "렌더링된 텍스트를 복사했습니다.");
}

async function copyText(text, successMessage) {
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

markdownInput.addEventListener("input", renderMarkdown);
markdownInput.addEventListener("scroll", () => handleLinkedScroll(markdownInput, preview));
preview.addEventListener("scroll", () => handleLinkedScroll(preview, markdownInput));
importButton.addEventListener("click", handleImport);
exportMarkdownButton.addEventListener("click", handleExportMarkdown);
exportHtmlButton.addEventListener("click", handleExportHtml);
copyMarkdownButton.addEventListener("click", copyMarkdown);
copyTextButton.addEventListener("click", copyPreviewText);
themeButton.addEventListener("click", toggleTheme);

restoreTheme();
renderMarkdown();
window.__markdownViewerReady = true;
