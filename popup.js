(function () {
  "use strict";

  var sw = document.getElementById("sw");
  var swlab = document.getElementById("swlab");
  var swsub = document.getElementById("swsub");
  var open = document.getElementById("open");
  var cnt = document.getElementById("cnt");

  function paint(on) {
    sw.setAttribute("aria-checked", on ? "true" : "false");
    swlab.textContent = on ? "点击关闭" : "点击开启";
    swsub.textContent = on
      ? "总是使用该扩展打开 PDF"
      : "总是使用原生查看器打开 PDF";
  }

  chrome.storage.local.get("nativeMode").then(function (r) {
    paint(!(r && r.nativeMode));
  });

  chrome.storage.local.get("vocab").then(function (r) {
    var n = (r && r.vocab && r.vocab.length) || 0;
    cnt.textContent = n ? n + " 条" : "空";
  });

  sw.onclick = function () {
    var nowOn = sw.getAttribute("aria-checked") !== "true";
    paint(nowOn);
    chrome.storage.local.set({ nativeMode: !nowOn }).then(function () {
      chrome.tabs.query({}, function (tabs) {
        for (var i = 0; i < tabs.length; i++) {
          if ((tabs[i].url || "").indexOf("viewer.html") > -1) chrome.tabs.reload(tabs[i].id);
        }
      });
    });
  };

  open.onclick = function () {
    chrome.tabs.create({ url: chrome.runtime.getURL("vocab.html") });
    window.close();
  };
})();
