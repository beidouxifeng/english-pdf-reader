(function (root) {
"use strict";

/* ==== xlsx: 自包含的极简 xlsx 写入器(viewer.js 与 vocab.html 共用) ==== */
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


function downloadXLSX(rows, sheetName, widths, fileName) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(xlsxBlob(rows, sheetName, widths));
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
}

root.XLSX = {
  build: xlsxBlob,
  download: downloadXLSX,
  excelDate: excelDate,
  numOrText: numOrText
};
})(typeof window !== "undefined" ? window : this);
