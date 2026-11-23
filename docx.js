// تصدير الدفتر ملف Word (.docx) حقيقي، من غير أي مكتبة برّه
// ملف الـ docx = ملف zip جواه شوية ملفات XML. بنبنيه بإيدنا: الكلام، العناوين، النقط، الجداول (بالدمج والمجموع)، والصور
const enc = new TextEncoder();
const x = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const COL = { red: 'C42B3B', orange: 'C2560C', amber: 'A86E00', green: '2B7A4B', teal: '0E7C86', blue: '2559C4', purple: '7A3DC4', pink: 'C0337A' };
const TINT = { red: 'F8DCDF', orange: 'FBE3D2', amber: 'FBEBC7', green: 'D9EFE2', teal: 'D3EEF0', blue: 'DCE5F8', purple: 'E9DDF8', pink: 'F7DBE9' };
const NOTE = { warn: ['⚠️', 'FFF4DB', 'F0A202'], q: ['❓', 'E3ECFB', '2559C4'], ex: ['💡', 'E2F4E9', '2B7A4B'] };
const mmss = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), q = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(q).padStart(2, '0')}` : `${m}:${String(q).padStart(2, '0')}`; };

// ---------- zip (من غير ضغط، وده كفاية) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) {
  const parts = [], central = []; let off = 0;
  const u16 = v => [v & 255, (v >>> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const head = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    parts.push(head, name, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
    off += head.length + name.length + data.length;
  }
  const cLen = central.reduce((n, p) => n + p.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cLen), ...u32(off), ...u16(0)]);
  return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ---------- الكلام ----------
// run = حتة كلام بشكل واحد (عريض/مائل/...)
function run(text, o = {}) {
  if (!text) return '';
  const pr = [`<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>`, o.b ? '<w:b/><w:bCs/>' : '', o.i ? '<w:i/><w:iCs/>' : '', o.s ? '<w:strike/>' : '',
    o.color ? `<w:color w:val="${o.color}"/>` : '', `<w:sz w:val="${o.sz || 24}"/><w:szCs w:val="${o.sz || 24}"/>`, o.mark ? '<w:highlight w:val="yellow"/>' : '', o.u ? '<w:u w:val="single"/>' : '', o.mono ? '' : '<w:rtl/>'].join('');
  return text.split('\n').map((t, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr>${pr}</w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`).join('');
}
// الكلام المنسق (b/i/u/s/mark) ← runs
function runsOf(b, base) {
  if (b.html == null) return run(b.text || '', base);
  const d = document.createElement('div'); d.innerHTML = b.html; let out = '';
  (function walk(n, st) {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) out += run(c.nodeValue, st);
      else if (c.nodeType === 1) {
        if (c.tagName === 'BR') { out += '<w:r><w:br/></w:r>'; continue; }
        const t = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', MARK: 'mark' }[c.tagName];
        walk(c, t ? { ...st, [t]: true } : st);
      }
    }
  })(d, base);
  return out;
}
const para = (inner, o = {}) => `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}<w:bidi/>${o.ind ? `<w:ind w:start="${o.ind}"/>` : ''}${o.shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shd}"/>` : ''}${o.bdr ? `<w:pBdr>${o.bdr}</w:pBdr>` : ''}<w:spacing w:before="${o.before ?? 40}" w:after="${o.after ?? 80}"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${inner}</w:p>`;

// ---------- الجدول ----------
const numOf = v => { const s = String(v || '').replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776).replace(/[,،\s]/g, ''); const m = s.match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
function tableXml(b) {
  const R = b.rows, nc = R[0].length, mg = b.mg || [], sum = new Set(b.sum || []);
  const own = {}; for (const m of mg) for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) own[`${r},${c}`] = m;
  const W = Math.floor(9000 / nc);
  const cell = (inner, o = {}) => `<w:tc><w:tcPr><w:tcW w:w="${W * (o.cs || 1)}" w:type="dxa"/>${o.cs > 1 ? `<w:gridSpan w:val="${o.cs}"/>` : ''}${o.vm ? `<w:vMerge${o.vm === 'start' ? ' w:val="restart"' : ''}/>` : ''}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}</w:tcPr>${inner || '<w:p/>'}</w:tc>`;
  let rows = '';
  R.forEach((r, ri) => {
    const fill = ri === 0 ? 'EEF1EF' : TINT[(b.rc || [])[ri]] || '';
    let tcs = '';
    for (let c = 0; c < nc; c++) {
      const m = own[`${ri},${c}`];
      if (m && c !== m.c) continue;                       // مدموجة مع اللي جنبها
      const txt = m && ri !== m.r ? '' : r[c];
      const p = para(run(txt, { b: ri === 0, mono: sum.has(c) && ri > 0, sz: 21 }), { before: 0, after: 0, jc: sum.has(c) && ri > 0 ? 'left' : undefined });
      tcs += cell(m && ri !== m.r ? '<w:p/>' : p, { cs: m ? m.cs : 1, vm: m && m.rs > 1 ? (ri === m.r ? 'start' : 'cont') : null, fill });
    }
    rows += `<w:tr>${tcs}</w:tr>`;
  });
  if (sum.size) {
    let tcs = ''; const lab = [...Array(nc).keys()].find(k => !sum.has(k));
    for (let c = 0; c < nc; c++) {
      const t = sum.has(c) ? R.slice(1).reduce((n, r) => n + (numOf(r[c]) || 0), 0) : null;
      tcs += cell(para(run(t != null ? t.toLocaleString('en-US', { maximumFractionDigits: 2 }) : c === lab ? 'المجموع' : '', { b: true, sz: 21, mono: t != null }), { before: 0, after: 0 }), { fill: 'FBE7B5' });
    }
    rows += `<w:tr>${tcs}</w:tr>`;
  }
  const bd = 'w:val="single" w:sz="4" w:space="0" w:color="B8C2BC"';
  return `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top ${bd}/><w:start ${bd}/><w:bottom ${bd}/><w:end ${bd}/><w:insideH ${bd}/><w:insideV ${bd}/></w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:start w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:end w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array(nc).fill(`<w:gridCol w:w="${W}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>${para('', { after: 60 })}`;
}

// ---------- الصورة ----------
async function imageOf(src) {
  const r = await fetch(src, { mode: 'cors' }); if (!r.ok) throw new Error('img');
  const bytes = new Uint8Array(await r.arrayBuffer());
  const url = URL.createObjectURL(new Blob([bytes]));
  try { const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); return { bytes, w: im.naturalWidth, h: im.naturalHeight }; }
  finally { URL.revokeObjectURL(url); }
}
const drawing = (rid, n, cx, cy) => `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="صورة ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="img${n}.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

export async function buildDocx(title, blocks, tasks = {}) {
  const media = [], olc = {};
  let body = para(run(title, { b: true, sz: 22, color: '6B7680' }), { after: 120 });
  for (const b of blocks) {
    const k = b.indent || 0, ind = k ? k * 360 : 0, color = COL[b.c];
    if (b.type !== 'ol') for (const q of Object.keys(olc)) if (+q >= k) delete olc[q];
    const ts = b.t != null ? run(`[${b.vn ? 'فيديو ' + b.vn + ' · ' : ''}${mmss(b.t)}] `, { sz: 18, color: 'A86E00', mono: true }) : '';
    if (b.type === 'hr') { body += para('', { bdr: '<w:bottom w:val="single" w:sz="6" w:space="1" w:color="AAAAAA"/>' }); continue; }
    if (b.type === 'table') { body += tableXml(b); continue; }
    if (b.type === 'img') {
      try {
        const im = await imageOf(b.src), n = media.length + 1, rid = 'rIdImg' + n;
        media.push({ n, bytes: im.bytes, rid });
        const cx = Math.round(5900000 * (b.w || 60) / 100), cy = Math.round(cx * im.h / im.w);
        body += para(ts + drawing(rid, n, cx, cy), { jc: 'center' });
      } catch (e) { body += para(run('[صورة: ' + b.src + ']', { sz: 18, color: '888888', mono: true })); }
      continue;
    }
    if (b.type === 'h1') { body += para(ts + runsOf(b, { b: true, sz: 40, color }), { style: 'Heading1', before: 120, after: 160 }); continue; }
    if (b.type === 'h2') { body += para(ts + runsOf(b, { b: true, sz: 30, color }), { style: 'Heading2', before: 240, after: 100, bdr: '<w:bottom w:val="single" w:sz="6" w:space="2" w:color="CBD5CF"/>' }); continue; }
    if (b.type === 'h3') { body += para(ts + runsOf(b, { b: true, sz: 26, color }), { style: 'Heading3', before: 180, after: 60 }); continue; }
    if (b.type === 'note') { const n = NOTE[b.kind] || NOTE.warn; body += para(run(n[0] + ' ') + ts + runsOf(b, { color }), { ind, shd: n[1], bdr: `<w:end w:val="single" w:sz="18" w:space="6" w:color="${n[2]}"/>` }); continue; }
    const done = b.type === 'todo' && (b.task && tasks[b.task] ? tasks[b.task].done : b.done);
    const mark = b.type === 'li' ? '• ' : b.type === 'ol' ? `${(olc[k] = (olc[k] || 0) + 1)}. ` : b.type === 'todo' ? (done ? '☑ ' : '☐ ') : b.type === 'arrow' ? '↲ ' : '';
    body += para(ts + run(mark, { color }) + runsOf(b, { color, s: done }), { ind });
  }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/><w:bidi/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl/><w:lang w:val="ar-EG" w:bidi="ar-EG"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style></w:styles>`;
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map(m => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/img${m.n}.jpg"/>`).join('')}</Relationships>` },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: styles },
    ...media.map(m => ({ name: `word/media/img${m.n}.jpg`, data: m.bytes })),
  ];
  return zip(files);
}

// بنعمل الملف ونديه للمستخدم: على الآيفون بيفتح قايمة المشاركة (احفظه في الملفات، ابعته، افتحه في Word)
export async function saveDocx(title, blocks, tasks) {
  const blob = await buildDocx(title, blocks, tasks);
  const name = (String(title || 'الدفتر').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'الدفتر') + '.docx';
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
