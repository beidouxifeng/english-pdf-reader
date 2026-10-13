(function () {
  "use strict";

  var sw = document.getElementById("sw");
  var swstate = document.getElementById("swstate");
  var open = document.getElementById("open");
  var cnt = document.getElementById("cnt");

  function paint(on) {
    sw.setAttribute("aria-checked", on ? "true" : "false");
    swstate.textContent = on
      ? "用本扩展打开，可划词查词 · 点击关闭"
      : "用 Chrome 自带查看器打开 · 点击开启";
  }

  chrome.storage.local.get("nativeMode").then(function (r) {
    paint(!(r && r.nativeMode));
  });

  chrome.storage.local.get("vocab").then(function (r) {
    var n = (r && r.vocab && r.vocab.length) || 0;
    cnt.textContent = n ? n + " 条" : "空";
  });

  function toggle() {
    var nowOn = sw.getAttribute("aria-checked") !== "true";
    paint(nowOn);
    chrome.storage.local.set({ nativeMode: !nowOn }).then(function () {
      chrome.tabs.query({}, function (tabs) {
        for (var i = 0; i < tabs.length; i++) {
          if ((tabs[i].url || "").indexOf("viewer.html") > -1) chrome.tabs.reload(tabs[i].id);
        }
      });
    });
  }

  sw.onclick = toggle;

  open.onclick = function () {
    chrome.tabs.create({ url: chrome.runtime.getURL("vocab.html") });
    window.close();
  };
})();
