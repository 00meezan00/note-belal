// التصدير: ملف Excel حقيقي (xlsx) من غير أي مكتبة، وPDF عن طريق صفحة الطباعة
// Excel = شوية ملفات XML جوه ملف zip. بنعمل الـ zip بإيدينا (من غير ضغط) عشان يشتغل أوفلاين.

const enc = new TextEncoder();
const xe = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

// ---------- الـ zip ----------
let CRC;
function crc32(b) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zip(files) {   // files: [[name, text]]
  const parts = [], central = []; let off = 0;
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [name, text] of files) {
    const nm = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, nm.length, 2], [28, 0, 2]]
      .forEach(([o, v, s]) => s === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true));
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, nm.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4]]
      .forEach(([o, v, s]) => s === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true));
    parts.push(new Uint8Array(h.buffer), nm, data); central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((s, x) => s + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, cdSize, 4], [16, off, 4], [20, 0, 2]]
    .forEach(([o, v, s]) => s === 4 ? e.setUint32(o, v, true) : e.setUint16(o, v, true));
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------- ملف Excel ----------
// rows: أول صف هو العناوين. widths: عرض كل عمود. الشيت من اليمين للشمال.
export function xlsx(rows, { sheet = 'السجل', widths = [] } = {}) {
  const col = i => String.fromCharCode(65 + i);
  const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => `<c r="${col(ci)}${ri + 1}" t="inlineStr" s="${ri === 0 ? 1 : 2}"><is><t xml:space="preserve">${xe(v)}</t></is></c>`).join('')}</row>`).join('');
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const M = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${M}" xmlns:r="${R}"><sheets><sheet name="${xe(sheet.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${R}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${M}"><fonts count="2"><font><sz val="12"/><name val="Arial"/></font><font><b/><sz val="12"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDE5E0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${M}" xmlns:r="${R}"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${body}</sheetData></worksheet>`],
  ]);
}

// ---------- مشاركة / تنزيل ملف ----------
// على الآيفون بتفتح قايمة المشاركة (احفظ في الملفات، واتساب، ...). لو مش متاحة، بينزل على طول.
export async function shareFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- PDF ----------
// بنحط الورقة في #print-area (ده الجزء الوحيد اللي بيظهر في الطباعة) وبنفتح صفحة الطباعة.
export function printHtml(html) {
  document.querySelectorAll('.print-tmp').forEach(x => x.remove());
  const d = document.createElement('div'); d.id = 'print-area'; d.className = 'print-tmp'; d.innerHTML = html;
  document.body.appendChild(d);
  const clean = () => { d.remove(); window.removeEventListener('afterprint', clean); window.removeEventListener('hashchange', clean); };
  window.addEventListener('afterprint', clean); window.addEventListener('hashchange', clean);
  setTimeout(() => window.print(), 50);
}

// جدول جاهز للطباعة
export const printTable = (heads, rows) => `<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12pt">
  <thead><tr>${heads.map(h => `<th style="text-align:right;border-bottom:2px solid #000;padding:6px 8px;white-space:nowrap">${xe(h)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${r.map((v, i) => `<td style="vertical-align:top;border-bottom:1px solid #bbb;padding:6px 8px;${i < r.length - 1 ? 'white-space:nowrap;' : 'white-space:pre-wrap;'}">${xe(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
