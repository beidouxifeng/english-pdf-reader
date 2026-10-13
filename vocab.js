(function () {
  "use strict";

  var vocab = [];
  var filter = "all";
  var query = "";

  var $ = function (id) { return document.getElementById(id); };
  var list = $("list"), stat = $("stat"), empty = $("empty"), headRow = $("head");
  var tpl = $("row");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function isSentence(v) {
    return /\s/.test(v.w) || v.w.length > 24;
  }

  function meta(v) {
    var bits = [];
    if (v.f) bits.push(v.f);
    if (v.m) bits.push(String(v.m).replace(/^p[.]/, "第 ") + " 页");
    return bits.join(" · ");
  }

  function timeAgo(t) {
    if (!t) return "";
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return "刚刚";
    if (s < 3600) return Math.floor(s / 60) + " 分钟前";
    if (s < 86400) return Math.floor(s / 3600) + " 小时前";
    if (s < 86400 * 30) return Math.floor(s / 86400) + " 天前";
    var d = new Date(t);
    return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate();
  }

  function visible() {
    var q = query.trim().toLowerCase();
    return vocab.map(function (v, i) { return { v: v, i: i }; }).filter(function (o) {
      var v = o.v;
      if (filter === "word" && isSentence(v)) return false;
      if (filter === "phrase" && !isSentence(v)) return false;
      if (!q) return true;
      return (v.w + " " + (v.t || "") + " " + (v.f || "")).toLowerCase().indexOf(q) > -1;
    });
  }

  function render() {
    var rows = visible();
    var words = vocab.filter(function (v) { return !isSentence(v); }).length;
    var sents = vocab.length - words;

    if (!vocab.length) {
      stat.innerHTML = "";
      list.innerHTML = "";
      headRow.hidden = true;
      empty.hidden = false;
      empty.textContent = "生词本还是空的。在阅读器里划选单词或句子，即可收录。";
      return;
    }

    if (!rows.length) {
      stat.innerHTML = "共 <b>" + vocab.length + "</b> 条";
      list.innerHTML = "";
      headRow.hidden = true;
      empty.hidden = false;
      empty.textContent = "没有匹配的条目。";
      return;
    }

    empty.hidden = true;
    headRow.hidden = false;
    stat.innerHTML = "共 <b>" + vocab.length + "</b> 条 · 单词 <b>" + words +
      "</b> · 句子 <b>" + sents + "</b>" +
      (rows.length !== vocab.length ? " · 当前显示 <b>" + rows.length + "</b> 条" : "");

    list.innerHTML = "";
    rows.slice().reverse().forEach(function (o) {
      var v = o.v;
      var node = tpl.content.firstElementChild.cloneNode(true);
      var sent = isSentence(v);

      node.classList.add("fade");
      node.dataset.i = o.i;

      var kind = node.querySelector(".kind");
      kind.textContent = sent ? "句子" : "单词";
      if (sent) kind.classList.add("sent");

      var w = node.querySelector(".w");
      w.textContent = v.w;
      w.title = v.w;
      if (sent) w.classList.add("sent");

      var phon = node.querySelector(".phon");
      phon.textContent = v.p ? "/" + v.p + "/" : "";

      var tr = node.querySelector(".tr");
      tr.textContent = v.t || "";
      tr.title = v.t || "";

      var from = node.querySelector(".from");
      var m = meta(v);
      from.textContent = m;
      from.title = m;

      node.querySelector(".time").textContent = timeAgo(v.d);

      list.appendChild(node);
    });
  }

  function load() {
    return chrome.storage.local.get("vocab").then(function (r) {
      vocab = (r && r.vocab) || [];
      render();
    }).catch(function () {
      empty.hidden = false;
      empty.textContent = "读取生词失败：无法访问本地存储。";
    });
  }

  function save() {
    return chrome.storage.local.set({ vocab: vocab }).then(render);
  }

  list.addEventListener("click", function (e) {
    var b = e.target.closest(".del");
    if (!b) return;
    var i = +b.closest(".row").dataset.i;
    vocab.splice(i, 1);
    save();
  });

  $("q").addEventListener("input", function () {
    query = this.value;
    render();
  });

  $("seg").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    filter = b.dataset.f;
    Array.prototype.forEach.call(this.children, function (x) {
      x.classList.toggle("on", x === b);
    });
    render();
  });

  $("ex").onclick = function () {
    if (!vocab.length) return;
    var rows = [["原文", "译文", "PDF文件", "页码", "时间"]];
    vocab.forEach(function (v) {
      var pg = String(v.m || "").replace(/^p[.]/, "");
      rows.push([v.w, v.t || "", v.f || "", XLSX.numOrText(pg), v.d ? XLSX.excelDate(v.d) : ""]);
    });
    XLSX.download(rows, "生词本", [24, 60, 34, 8, 20],
      "生词本_" + new Date().toISOString().slice(0, 10) + ".xlsx");
  };

  $("all").onclick = function () {
    if (!vocab.length) return;
    if (!confirm("确定清空生词本？共 " + vocab.length + " 条，删除后无法恢复。")) return;
    vocab = [];
    save();
  };

  load();
})();
