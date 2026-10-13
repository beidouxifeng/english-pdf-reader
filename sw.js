// 工具栏图标现在点击后弹出面板(popup.html),不再走这里。
// 保留 service worker 以便后续扩展。
chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get("nativeMode").then(function (r) {
    if (r && typeof r.nativeMode === "undefined") {
      chrome.storage.local.set({ nativeMode: false });
    }
  });
});
