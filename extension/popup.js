document.querySelector("#openViewerButton").addEventListener("click", async () => {
  const viewerUrl = chrome.runtime.getURL("viewer.html");
  await chrome.tabs.create({ url: viewerUrl });
  window.close();
});
