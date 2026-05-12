const markdownExtensions = new Set([".md", ".markdown", ".txt"]);

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "openMarkdownUrl") {
    return;
  }

  if (!isMarkdownUrl(message.url)) {
    return;
  }

  const viewerUrl = chrome.runtime.getURL(`viewer.html?url=${encodeURIComponent(message.url)}`);
  if (sender.tab?.id) {
    chrome.tabs.update(sender.tab.id, { url: viewerUrl });
    return;
  }

  chrome.tabs.create({ url: viewerUrl });
});

function isMarkdownUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.toLowerCase();
    return [...markdownExtensions].some((extension) => path.endsWith(extension));
  } catch {
    return false;
  }
}
