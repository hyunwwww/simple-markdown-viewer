const markdownLinkExtensions = [".md", ".markdown", ".txt"];

redirectCurrentMarkdownFile();

document.addEventListener(
  "click",
  (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) {
      return;
    }

    const href = link.href;
    if (!isFileMarkdownUrl(href)) {
      return;
    }

    event.preventDefault();
    openInViewer(href);
  },
  true,
);

function redirectCurrentMarkdownFile() {
  if (!isFileMarkdownUrl(window.location.href)) {
    return;
  }

  openInViewer(window.location.href);
}

function openInViewer(url) {
  chrome.runtime.sendMessage({ type: "openMarkdownUrl", url });
}

function isFileMarkdownUrl(href) {
  try {
    const url = new URL(href);
    if (url.protocol !== "file:") {
      return false;
    }

    const path = url.pathname.toLowerCase();
    return markdownLinkExtensions.some((extension) => path.endsWith(extension));
  } catch {
    return false;
  }
}
