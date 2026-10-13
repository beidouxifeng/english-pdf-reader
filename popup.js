(function () {
  "use strict";

  var sw = document.getElementById("sw");
  var hint = document.getElementById("hint");
  var cnt = document.getElementById("cnt");

  function paint(on) {
    sw.setAttribute("aria-checked", on ? "true" : "false");
    hint.textContent = on
      ? "打开 PDF 时由本扩展接管，可划词查词。"
      : "打开 PDF 时使用 Chrome 自带的查看器，不划词。";
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
    var nativeMode = !nowOn;
    paint(nowOn);
    chrome.storage.local.set({ nativeMode: nativeMode }).then(function () {
      chrome.tabs.query({}, function (tabs) {
        for (var i = 0; i < tabs.length; i++) {
          var u = tabs[i].url || "";
          if (u.indexOf("viewer.html") > -1) chrome.tabs.reload(tabs[i].id);
        }
      });
    });
  };
})();
