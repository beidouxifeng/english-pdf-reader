chrome.action.onClicked.addListener(function (tab) {
  if (!tab || !tab.id || !tab.url) return;
  chrome.tabs.update(tab.id, { url: tab.url });
});
