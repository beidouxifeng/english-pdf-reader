(function () {
"use strict";

var $ = function (id) { return document.getElementById(id); };
var viewer = $("viewer"), pop = $("pop"), side = $("side"), vl = $("vl");

var pdfDoc = null, pageEls = [], rendered = {}, queue = [], running = 0, io = null;
var baseW = 0, fitScale = 1, zoom = 1, curPage = 1, total = 0, fileName = "";

var IRREG = { went: "go", gone: "go", was: "be", were: "be", been: "be", had: "have", did: "do", done: "do",
  got: "get", gotten: "get", made: "make", took: "take", taken: "take", came: "come", saw: "see", seen: "see",
  knew: "know", known: "know", thought: "think", said: "say", found: "find", gave: "give", given: "give",
  told: "tell", became: "become", felt: "feel", left: "leave", brought: "bring", began: "begin", begun: "begin",
  kept: "keep", held: "hold", wrote: "write", written: "write", stood: "stand", heard: "hear", meant: "mean",
  met: "meet", ran: "run", paid: "pay", sat: "sit", spoke: "speak", spoken: "speak", led: "lead", grew: "grow",
  grown: "grow", lost: "lose", fell: "fall", fallen: "fall", sent: "send", built: "build",
  understood: "understand", drew: "draw", drawn: "draw", broke: "break", broken: "break", spent: "spend",
  rose: "rise", risen: "rise", drove: "drive", driven: "drive", bought: "buy", wore: "wear", worn: "wear",
  chose: "choose", chosen: "choose", sought: "seek", threw: "throw", thrown: "throw", caught: "catch",
  dealt: "deal", won: "win", forgot: "forget", forgotten: "forget", laid: "lay", sold: "sell",
  fought: "fight", bore: "bear", borne: "bear", taught: "teach", ate: "eat", eaten: "eat", sang: "sing",
  sung: "sing", struck: "strike", hung: "hang", shook: "shake", shaken: "shake", rode: "ride",
  ridden: "ride", fed: "feed", shot: "shoot", drank: "drink", drunk: "drink", hid: "hide", hidden: "hide",
  swam: "swim", swum: "swim", flew: "fly", flown: "fly", slept: "sleep", stole: "steal", stolen: "steal",
  swept: "sweep", froze: "freeze", frozen: "freeze", woke: "wake", woken: "wake", arose: "arise",
  arisen: "arise", bent: "bend", bit: "bite", bitten: "bite", blew: "blow", blown: "blow", burnt: "burn",
  dug: "dig", lent: "lend", lit: "light", rang: "ring", rung: "ring", sank: "sink", sunk: "sink",
  slid: "slide", split: "split", spread: "spread", sprang: "spring", stuck: "stick", stung: "sting",
  swore: "swear", sworn: "swear", tore: "tear", torn: "tear", wound: "wind" };

var DICT = (typeof ECDICT !== "undefined" ? ECDICT : null);

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

function candidates(w) {
  var c = [w];
  if (IRREG[w]) c.push(IRREG[w]);
  if (w.length > 4) {
    if (/ies$/.test(w)) c.push(w.slice(0, -3) + "y");
    if (/(ches|shes|sses|xes|zes)$/.test(w)) c.push(w.slice(0, -2));
    if (/es$/.test(w)) c.push(w.slice(0, -2));
    if (/s$/.test(w)) c.push(w.slice(0, -1));
    if (/ied$/.test(w)) c.push(w.slice(0, -3) + "y");
    if (/ed$/.test(w)) { c.push(w.slice(0, -2)); c.push(w.slice(0, -1)); c.push(w.slice(0, -2) + "e"); }
    if (/ing$/.test(w)) { c.push(w.slice(0, -3)); c.push(w.slice(0, -3) + "e"); }
    if (/ly$/.test(w)) c.push(w.slice(0, -2));
    if (/est$/.test(w)) { c.push(w.slice(0, -3)); c.push(w.slice(0, -3) + "e"); }
    if (/er$/.test(w)) { c.push(w.slice(0, -2)); c.push(w.slice(0, -1)); }
    var m = w.match(/^(.+?)([a-z])\2(ed|ing|er|est)$/);
    if (m) c.push(m[1] + m[2]);
  }
  return c;
}

function lookup(word) {
  if (!DICT) return null;
  var w = word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (!w) return null;
  var c = candidates(w);
  for (var i = 0; i < c.length; i++) {
    if (DICT[c[i]]) return { key: c[i], e: DICT[c[i]] };
  }
  return null;
}

var vocab = [], storageBroken = false;

function hasStorage() {
  return typeof chrome !== "undefined" && !!(chrome.storage && chrome.storage.local);
}

function storageErr(e) {
  if (!storageBroken) console.error("生词存储不可用:", e || 'chrome.storage 未定义(manifest.json 缺少 "storage" 权限)');
  storageBroken = true;
}

function loadVocab() {
  if (!hasStorage()) { storageErr(); renderVocab(); return Promise.resolve(); }
  return chrome.storage.local.get("vocab").then(function (r) {
    vocab = (r && r.vocab) || [];
    renderVocab();
  }).catch(function (e) { storageErr(e); renderVocab(); });
}
function saveVocab() {
  if (!hasStorage()) return Promise.reject(new Error('chrome.storage 不可用(manifest.json 缺少 "storage" 权限)'));
  return chrome.storage.local.set({ vocab: vocab }).catch(function (e) { storageErr(e); throw e; });
}

function renderVocab() {
  $("vc").textContent = vocab.length;
  var warn = storageBroken ? '<div id="vemp">本地存储不可用，生词无法保存或读取。请检查 manifest.json 是否声明了 "storage" 权限，再重新加载扩展。</div>' : "";
  if (!vocab.length) { vl.innerHTML = warn || '<div id="vemp">还没有生词</div>'; return; }
  vl.innerHTML = warn + vocab.slice().reverse().map(function (v, i) {
    var idx = vocab.length - 1 - i;
    var long = /\s/.test(v.w) || v.w.length > 24;
    var src = [v.f, v.m].filter(function (x) { return !!x; }).join(" · ");
    return '<li' + (long ? ' class="long"' : '') + '><button class="x" data-i="' + idx + '">×</button><div class="w">' + esc(v.w) + '</div>' +
      (v.p ? '<div class="p">/' + esc(v.p) + '/</div>' : '') +
      '<div class="t">' + esc(v.t || "") + '</div>' +
      '<div class="m" title="' + esc(src) + '">' + esc(src) + '</div></li>';
  }).join("");
}

vl.addEventListener("click", function (e) {
  var b = e.target.closest(".x");
  if (!b) return;
  vocab.splice(+b.dataset.i, 1);
  saveVocab().then(renderVocab, renderVocab);
});

function setSt(r) {
  var st = $("ps");
  if (st) st.textContent = r === "ok" ? "已加入" : (r === "err" ? "保存失败" : "已存在");
}

function addVocab(w, ph, tr, meta) {
  for (var i = 0; i < vocab.length; i++) {
    if (vocab[i].w.toLowerCase() === w.toLowerCase()) return Promise.resolve("dup");
  }
  vocab.push({ w: w, p: ph || "", t: tr || "", m: meta || "", d: Date.now(), f: fileName });
  renderVocab();
  return saveVocab().then(function () { return "ok"; }, function () { storageBroken = true; renderVocab(); return "err"; });
}

/* ==== xlsx export: self-contained minimal writer ==== */
var CRC_T = null;
function crc32(b) {
  if (!CRC_T) {
    CRC_T = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_T[n] = c;
    }
  }
  var r = -1;
  for (var i = 0; i < b.length; i++) r = (r >>> 8) ^ CRC_T[(r ^ b[i]) & 0xFF];
  return (r ^ -1) >>> 0;
}

function zipStore(files) {
  var enc = new TextEncoder();
  var items = files.map(function (f) {
    return { name: enc.encode(f.name), data: f.data, crc: crc32(f.data) };
  });
  var now = new Date();
  var tm = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  var dt = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  var localLen = 0, centralLen = 0;
  items.forEach(function (f) {
    f.off = localLen;
    localLen += 30 + f.name.length + f.data.length;
    centralLen += 46 + f.name.length;
  });
  var out = new Uint8Array(localLen + centralLen + 22);
  var dv = new DataView(out.buffer), p = 0;
  function u16(v) { dv.setUint16(p, v, true); p += 2; }
  function u32(v) { dv.setUint32(p, v >>> 0, true); p += 4; }
  function raw(b) { out.set(b, p); p += b.length; }
  items.forEach(function (f) {
    u32(0x04034b50); u16(20); u16(0); u16(0); u16(tm); u16(dt);
    u32(f.crc); u32(f.data.length); u32(f.data.length); u16(f.name.length); u16(0);
    raw(f.name); raw(f.data);
  });
  var cd = p;
  items.forEach(function (f) {
    u32(0x02014b50); u16(20); u16(20); u16(0); u16(0); u16(tm); u16(dt);
    u32(f.crc); u32(f.data.length); u32(f.data.length);
    u16(f.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(f.off);
    raw(f.name);
  });
  var cdSize = p - cd;
  u32(0x06054b50); u16(0); u16(0); u16(items.length); u16(items.length);
  u32(cdSize); u32(cd); u16(0);
  return out;
}

function xmlEsc(v) {
  var s = String(v == null ? "" : v), out = "";
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) continue;
    var ch = s.charAt(i);
    out += ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch;
  }
  return out;
}

function colRef(i) {
  var s = "";
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
  return s;
}

function numOrText(s) { return (s !== "" && String(+s) === s) ? +s : s; }

function excelDate(t) {
  var d = new Date(t);
  return Math.round(((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000 + 25569) * 86400) / 86400;
}

function xlsxBlob(rows, sheetName, widths) {
  var enc = new TextEncoder();
  var last = colRef(rows[0].length - 1) + rows.length;
  var body = rows.map(function (r, ri) {
    var cells = "";
    for (var ci = 0; ci < r.length; ci++) {
      var v = r[ci];
      if (v === null || v === undefined || v === "") continue;
      var ref = colRef(ci) + (ri + 1);
      if (ri === 0) {
        cells += '<c r="' + ref + '" s="1" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(v) + "</t></is></c>";
      } else if (typeof v === "number") {
        cells += '<c r="' + ref + '"' + (ci === 4 ? ' s="3"' : "") + "><v>" + v + "</v></c>";
      } else {
        cells += '<c r="' + ref + '" s="2" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(v) + "</t></is></c>";
      }
    }
    return '<row r="' + (ri + 1) + '">' + cells + "</row>";
  }).join("");
  var cols = (widths || []).map(function (w, i) {
    return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
  }).join("");
  var parts = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      "</Types>",
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>",
    "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="' + xmlEsc(sheetName) + '" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>",
    "xl/styles.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts>' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border/></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="4">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      "</cellXfs>" +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>",
    "xl/worksheets/sheet1.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:' + last + '"/>' +
      '<sheetViews><sheetView tabSelected="1" workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      (cols ? "<cols>" + cols + "</cols>" : "") +
      "<sheetData>" + body + "</sheetData>" +
      '<autoFilter ref="A1:' + last + '"/>' +
      "</worksheet>"
  };
  var files = Object.keys(parts).map(function (k) { return { name: k, data: enc.encode(parts[k]) }; });
  return new Blob([zipStore(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function exportXLSX() {
  if (!vocab.length) return;
  var rows = [["原文", "译文", "PDF文件", "页码", "时间"]];
  vocab.forEach(function (v) {
    var pg = String(v.m || "").replace(/^p[.]/, "");
    rows.push([v.w, v.t || "", v.f || "", numOrText(pg), v.d ? excelDate(v.d) : ""]);
  });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(xlsxBlob(rows, "生词本", [24, 60, 34, 8, 20]));
  a.download = "生词本_" + new Date().toISOString().slice(0, 10) + ".xlsx";
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
}
/* ==== end xlsx export ==== */

function xlate(text) {
  return fetch("https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text.slice(0, 480)) + "&langpair=en%7Czh-CN")
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var t = j && j.responseData && j.responseData.translatedText;
      if (!t || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) throw new Error("quota");
      return t;
    });
}

function pageOf(el) {
  var p = el && el.closest ? el.closest(".pg") : null;
  return p ? (+p.dataset.p) : curPage;
}

function hidePop() { pop.hidden = true; }
document.addEventListener("mousedown", function (e) { if (!pop.contains(e.target)) hidePop(); });
viewer.addEventListener("scroll", hidePop);

document.addEventListener("mouseup", function (e) {
  if (pop.contains(e.target)) return;
  setTimeout(function () {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    var text = sel.toString().replace(/\s+/g, " ").trim();
    if (!text || text.length > 600) return;
    var node = sel.anchorNode;
    if (!node || !viewer.contains(node)) return;
    var r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r.width && !r.height) return;
    showPop(text, r, pageOf(node.nodeType === 1 ? node : node.parentNode));
  }, 10);
});

function showPop(text, rect, page) {
  var isWord = /^[A-Za-z][A-Za-z'\u2019-]{0,28}$/.test(text);
  var hit = isWord ? lookup(text) : null;
  var html = "";
  if (isWord) {
    html += '<div class="w">' + esc(hit ? hit.key : text) + "</div>";
    if (hit && hit.e[0]) html += '<div class="p">/' + esc(hit.e[0]) + "</div>";
    html += '<div class="t">' + esc(hit ? hit.e[1] : "词库中未收录") + "</div>";
    html += '<div class="bar"><button class="pri" id="pw">加入生词本</button><span class="st" id="ps"></span></div>';
  } else {
    html += '<div class="w" style="font-weight:400;font-size:13px;color:#666">' + esc(text.length > 140 ? text.slice(0, 140) + "…" : text) + "</div>";
    html += '<div class="t" id="ptx">翻译中…</div>';
    html += '<div class="bar"><button class="pri" id="pw">加入生词本</button><button id="op" hidden>必应翻译</button><span class="st" id="ps"></span></div>';
  }
  pop.innerHTML = html;
  pop.hidden = false;
  var w = pop.offsetWidth || 290, h = pop.offsetHeight || 120;
  var x = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - 8);
  var y = rect.top - h - 10;
  if (y < 8) y = rect.bottom + 10;
  pop.style.left = x + "px";
  pop.style.top = y + "px";

  if (isWord) {
    $("pw").onclick = function () {
      addVocab(hit ? hit.key : text, hit ? hit.e[0] : "", hit ? hit.e[1] : "", "p." + page).then(setSt);
    };
  } else {
    var trans = null;
    xlate(text).then(function (t) {
      trans = t;
      var el = $("ptx"); if (el) el.textContent = t;
    }).catch(function () {
      var el = $("ptx"); if (el) el.textContent = "翻译失败";
      var op = $("op"); if (op) op.hidden = false;
    });
    $("pw").onclick = function () {
      var st = $("ps");
      function put() {
        addVocab(text, "", trans, "p." + page).then(setSt);
      }
      if (trans) return put();
      st.textContent = "翻译中…";
      xlate(text).then(function (t) {
        trans = t;
        var el = $("ptx"); if (el) el.textContent = t;
        put();
      }).catch(function () {
        st.textContent = "翻译失败";
        var op = $("op"); if (op) op.hidden = false;
      });
    };
    $("op").onclick = function () {
      window.open("https://www.bing.com/translator?ref=TThis&text=" + encodeURIComponent(text) + "&from=en&to=zh-Hans", "_blank");
    };
  }
}

function scaleNow() { return fitScale * zoom; }

function computeFit() {
  if (!baseW) return 1;
  var avail = viewer.clientWidth - 34;
  if (avail < 120) avail = 120;
  return avail / baseW;
}

function pump() {
  while (running < 2 && queue.length) {
    var i = queue.shift();
    running++;
    renderPage(i).catch(function (err) { console.error("page " + i, err); })
      .then(function () { running--; pump(); });
  }
}

function enqueue(i) {
  if (rendered[i] || rendered["q" + i]) return;
  rendered["q" + i] = 1;
  queue.push(i);
  pump();
}

function textFallback(page, tl, vp, n) {
  return page.getTextContent().then(function (tc) {
    var frag = document.createDocumentFragment();
    tc.items.forEach(function (it) {
      if (!it.str || !/\S/.test(it.str)) return;
      var t = pdfjsLib.Util.transform(vp.transform, it.transform);
      var h = Math.hypot(t[2], t[3]);
      if (!(h > 1)) return;
      var sp = document.createElement("span");
      sp.textContent = it.str;
      sp.style.left = t[4] + "px";
      sp.style.top = (t[5] - h) + "px";
      sp.style.fontSize = h + "px";
      sp.style.fontFamily = "sans-serif";
      sp.style.lineHeight = "1";
      sp.dataset.tw = (it.width * vp.scale);
      frag.appendChild(sp);
    });
    tl.appendChild(frag);
    Array.prototype.forEach.call(tl.children, function (sp) {
      var w = parseFloat(sp.dataset.tw);
      if (!w) return;
      var m = sp.getBoundingClientRect().width;
      if (m > 0) sp.style.transform = "scaleX(" + (w / m) + ")";
    });
    rendered[n] = 1;
    delete rendered["q" + n];
  });
}

function renderPage(n) {
  return pdfDoc.getPage(n).then(function (page) {
    var s = scaleNow();
    var vp = page.getViewport({ scale: s });
    var d = pageEls[n - 1];
    if (!d) return;
    d.style.width = vp.width + "px";
    d.style.height = vp.height + "px";
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var cv = document.createElement("canvas");
    cv.width = Math.floor(vp.width * dpr);
    cv.height = Math.floor(vp.height * dpr);
    cv.style.width = vp.width + "px";
    cv.style.height = vp.height + "px";
    var ctx = cv.getContext("2d");
    return page.render({
      canvasContext: ctx, viewport: vp,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
    }).promise.then(function () {
      d.innerHTML = "";
      d.appendChild(cv);
      var tl = document.createElement("div");
      tl.className = "textLayer";
      tl.style.setProperty("--scale-factor", s);
      d.appendChild(tl);
      var task = null;
      try {
        if (pdfjsLib.TextLayer) {
          task = new pdfjsLib.TextLayer({
            textContentSource: page.streamTextContent(), container: tl, viewport: vp
          });
        }
      } catch (err) { console.error("TextLayer ctor", err); }
      if (!task || !task.render) return textFallback(page, tl, vp, n);
      return Promise.resolve(task.render()).then(function () {
        rendered[n] = 1; delete rendered["q" + n];
      }).catch(function (err) {
        console.error("TextLayer render", err);
        tl.innerHTML = "";
        return textFallback(page, tl, vp, n);
      });
    });
  });
}

function build() {
  if (io) { io.disconnect(); io = null; }
  viewer.innerHTML = "";
  pageEls = []; rendered = {}; queue = []; running = 0;
  for (var i = 1; i <= total; i++) {
    var d = document.createElement("div");
    d.className = "pg";
    d.dataset.p = i;
    d.style.width = "600px";
    d.style.height = "800px";
    viewer.appendChild(d);
    pageEls.push(d);
  }
  pdfDoc.getPage(1).then(function (p) {
    var vp = p.getViewport({ scale: scaleNow() });
    pageEls.forEach(function (d) { d.style.width = vp.width + "px"; d.style.height = vp.height + "px"; });
    enqueue(1);
  });
  io = new IntersectionObserver(function (ents) {
    ents.forEach(function (en) {
      if (en.isIntersecting) {
        var n = +en.target.dataset.p;
        enqueue(n);
        if (n < total) enqueue(n + 1);
      }
    });
  }, { root: viewer, rootMargin: "800px 0px" });
  pageEls.forEach(function (d) { io.observe(d); });
  updatePage();
}

function updatePage() {
  if (!pageEls.length) return;
  var top = viewer.scrollTop + 8;
  for (var i = 0; i < pageEls.length; i++) {
    var el = pageEls[i];
    if (el.offsetTop + el.offsetHeight > top) {
      if (curPage !== i + 1) {
        curPage = i + 1;
        $("pi").textContent = curPage + " / " + total;
      }
      break;
    }
  }
}
viewer.addEventListener("scroll", updatePage);

function updateZoomUI() { $("zi").textContent = Math.round(zoom * 100) + "%"; }

function setZoom(z) {
  z = Math.min(5, Math.max(0.25, z));
  if (Math.abs(z - zoom) < 0.001) return;
  zoom = z;
  updateZoomUI();
  build();
}

var rt = null, lastW = 0;
new ResizeObserver(function () {
  var w = viewer.clientWidth;
  if (Math.abs(w - lastW) < 2) return;
  lastW = w;
  clearTimeout(rt);
  rt = setTimeout(function () {
    if (!pdfDoc) return;
    var f = computeFit();
    if (Math.abs(f - fitScale) > 0.005) { fitScale = f; build(); }
  }, 200);
}).observe(viewer);

$("zo").onclick = function () { setZoom(zoom / 1.15); };
$("zi2").onclick = function () { setZoom(zoom * 1.15); };
$("fit").onclick = function () {
  zoom = 1; fitScale = computeFit(); updateZoomUI(); build();
};
var sideTimer = null;
function openSide() { clearTimeout(sideTimer); side.hidden = false; }
function closeSide() {
  clearTimeout(sideTimer);
  sideTimer = setTimeout(function () { side.hidden = true; }, 250);
}
$("vb").addEventListener("mouseenter", openSide);
$("vb").addEventListener("mouseleave", closeSide);
side.addEventListener("mouseenter", function () { clearTimeout(sideTimer); });
side.addEventListener("mouseleave", closeSide);
$("ex").onclick = exportXLSX;
$("nat").onclick = function () {
  try {
    chrome.mimeHandler.abortAndFallbackToNativeHandler();
  } catch (e) {
    alert("切换失败:" + (e && e.message ? e.message : e));
  }
};

(async function () {
  try {
    if (typeof chrome === "undefined" || !chrome.mimeHandler) {
      $("empty").textContent = "需要在 Chrome 中作为扩展使用";
      return;
    }
    var info = await chrome.mimeHandler.getStreamInfo();
    var name = "";
    try {
      name = decodeURIComponent((info.originalUrl || "").split("/").pop().split("?")[0]);
    } catch (e) {}
    if (name) { $("fn").textContent = name; fileName = name; }
    var res = await fetch(info.streamUrl);
    var buf = await res.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";
    pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    total = pdfDoc.numPages;
    var p1 = await pdfDoc.getPage(1);
    baseW = p1.getViewport({ scale: 1 }).width;
    fitScale = computeFit();
    updateZoomUI();
    build();
    $("pi").textContent = "1 / " + total;
  } catch (e) {
    $("empty").textContent = "PDF 打不开:" + (e && e.message ? e.message : e);
    try {
      if (chrome.mimeHandler && chrome.mimeHandler.abortAndFallbackToNativeHandler) {
        chrome.mimeHandler.abortAndFallbackToNativeHandler();
      }
    } catch (_) {}
  }
})();

loadVocab();
})();
