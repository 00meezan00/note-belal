// الدفتر: دفتر أفكار للكورس أو البودكاست، بيفتح جنب الفيديو، وسهل زي تطبيق الملاحظات بتاع أبل
// كل سطر "حتة" لوحده (عنوان، قسم، فقرة، نص، نقط، أرقام، مهام، فرع، صندوق ملحوظة، خط فاصل، جدول).
// - شريط الأدوات تحت، وبيطلع فوق الكيبورد على طول
// - Aa: شكل السطر + عريض/مائل/تحته خط/هايلايتر + لون + حجم الخط
// - ↘ فرع: سهم مايل لبرّه تكتب فيه، وإنتر ينزّله تحت السطر بلون مختلف
// - 🔗 اربط: السطر يتربط بمهمة، هدف، فكرة، فرد… أي حاجة في السيستم
// - ☐ مهمة تبقى مهمة في "النهاردة"، و"ده درس" يروح لـ"اتعلمت إيه"
// - ↶ تراجع ↷ إعادة، فهرس، بحث، طي الأقسام، قالب ملخص، خريطة ذهنية، PDF
import { one, upd, ins, list, link, onSync, sb } from './db.js';
import { esc, ic, toast, today, openSheet, closeSheet } from './ui.js';
import { KIND, hrefOf } from './comps.js';
import { printHtml } from './export.js';

const PH = { h1: 'العنوان', h2: 'عنوان القسم', h3: 'عنوان الفقرة', p: 'اكتب…', li: 'نقطة', ol: 'نقطة', todo: 'حاجة هتعملها', arrow: 'فرع', note: 'ملحوظة' };
const STYLES = [['h1', 'عنوان'], ['h2', 'قسم'], ['h3', 'فقرة'], ['p', 'نص']];
const NOTE = { warn: ['⚠️', 'مهم'], q: ['❓', 'سؤال'], ex: ['💡', 'مثال'] };
export const NCOLORS = [['', 'من غير لون'], ['red', 'أحمر'], ['orange', 'برتقالي'], ['amber', 'أصفر'], ['green', 'أخضر'], ['teal', 'تركواز'], ['blue', 'أزرق'], ['purple', 'بنفسجي'], ['pink', 'بمبي']];
const PRINTC = { red: '#C42B3B', orange: '#C2560C', amber: '#A86E00', green: '#2B7A4B', teal: '#0E7C86', blue: '#2559C4', purple: '#7A3DC4', pink: '#C0337A' };
const BRANCH = ['blue', 'green', 'purple', 'orange', 'teal', 'pink'];
const LV = { h1: 1, h2: 2, h3: 3 };
const NOTXT = ['table', 'hr', 'img'];   // حتت مش كلام (مفيهاش كتابة)
const IMGW = [[35, 'صغيرة'], [60, 'وسط'], [100, 'بعرض الصفحة']];
const MAXI = 6, COLW = 130, MINW = 60, MINH = 34;
const nid = () => Math.random().toString(36).slice(2, 10);
const mmss = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const clean = el => (el.innerText || '').replace(/ /g, ' ').replace(/\n$/, '');
const dots = (act, cur) => NCOLORS.map(([k, l]) => `<button type="button" class="nt-dot${k ? ' nt-c-' + k : ' none'}${(cur || '') === k ? ' on' : ''}" data-a="${act}" data-col="${k}" aria-label="${l}"></button>`).join('');
const svg = d => `<svg viewBox="0 0 24 24" class="ic" width="22" height="22" aria-hidden="true">${d}</svg>`;
const I = {
  todo: '<rect x="3.5" y="4" width="6" height="6" rx="1.5"/><path d="M5 7l1 1 2-2"/><path d="M13 7h8M3.5 14h6v6h-6zM13 17h8"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 4v16"/>',
  fork: '<path d="M7 4v6a4 4 0 0 0 4 4h8"/><path d="M15 10l4 4-4 4"/>',
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h3"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  kb: '<rect x="3" y="5" width="18" height="11" rx="2"/><path d="M7 9h1M11 9h1M15 9h1M8 12.5h8M9 19l3 2 3-2"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><path d="M16.75 14v5.5M14 16.75h5.5"/>',
};

// ---------- النص المنسق (عريض، مائل…) ----------
const OK = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', MARK: 'mark', BR: 'br' };
export function sanitize(html) {
  const t = document.createElement('template'); t.innerHTML = html || '';
  const out = document.createElement('div');
  (function walk(src, dst) {
    for (const n of src.childNodes) {
      if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      const own = OK[n.tagName];
      if (own === 'br') { dst.appendChild(document.createElement('br')); continue; }
      // التنسيق ممكن ييجي من اسم العنصر أو من الـ style بتاعه (سفاري وكروم بيعملوا الاتنين)
      const st = (n.getAttribute && n.getAttribute('style')) || '', tags = own ? [own] : [];
      if (/background(-color)?:\s*(?!transparent|rgba\(0,\s*0,\s*0,\s*0\)|initial|inherit)[^;]+/i.test(st)) tags.push('mark');
      if (/font-weight:\s*(bold|[6-9]00)/i.test(st)) tags.push('b');
      if (/font-style:\s*italic/i.test(st)) tags.push('i');
      if (/text-decoration[^;]*underline/i.test(st)) tags.push('u');
      if (/text-decoration[^;]*line-through/i.test(st)) tags.push('s');
      const uniq = [...new Set(tags)];
      if (!uniq.length) { walk(n, dst); continue; }
      const top = document.createElement(uniq[0]); let inner2 = top;
      for (const t of uniq.slice(1)) { const e = document.createElement(t); inner2.appendChild(e); inner2 = e; }
      walk(n, inner2); if (top.textContent) dst.appendChild(top);
    }
  })(t.content, out);
  return out.innerHTML.replace(/(<br>)+$/, '');
}
const inner = b => b.html != null ? sanitize(b.html) : esc(b.text || '');

// ---------- المؤشر ----------
function caretOffset(el) {
  const s = getSelection(); if (!s.rangeCount || !el.contains(s.anchorNode)) return clean(el).length;
  const r = s.getRangeAt(0), pre = r.cloneRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}
const hasSelection = () => { const s = getSelection(); return s.rangeCount && !s.getRangeAt(0).collapsed; };
function placeCaret(el, pos) {
  if (!el) return;
  el.focus({ preventScroll: true });
  const s = getSelection(), r = document.createRange(), w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n = 0, node, ok = false;
  if (pos != null) while ((node = w.nextNode())) { if (n + node.length >= pos) { r.setStart(node, pos - n); ok = true; break; } n += node.length; }
  if (!ok) { r.selectNodeContents(el); r.collapse(false); } else r.collapse(true);
  s.removeAllRanges(); s.addRange(r);
  const box = el.getBoundingClientRect(), vh = window.visualViewport ? visualViewport.height : innerHeight;
  if (box.bottom > vh - 90 || box.top < 70) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ---------- عمليات الجدول: إضافة/مسح صف أو عمود، الدمج، الترتيب، والمجموع ----------
// b.mg = الخانات المدموجة [{r, c, rs, cs}]، b.sum = الأعمدة اللي بتتجمع
export const numOf = v => { const t = String(v ?? '').replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776).replace(/[,،\s]/g, ''); const m = t.match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const fmtNum = n => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const TB = {
  rowIns(b, k, col = '') { b.rows.splice(k, 0, Array(b.rows[0].length).fill('')); (b.rh ||= []).splice(k, 0, null); (b.rc ||= []).splice(k, 0, col); for (const m of b.mg || []) { if (m.r >= k) m.r++; else if (m.r + m.rs > k) m.rs++; } },
  rowDel(b, k) {
    if (b.rows.length <= 1) return false;
    b.rows.splice(k, 1); (b.rh || []).splice(k, 1); (b.rc || []).splice(k, 1);
    b.mg = (b.mg || []).filter(m => { if (m.r > k) m.r--; else if (m.r + m.rs > k) m.rs--; return m.rs > 1 || m.cs > 1; });
    return true;
  },
  colIns(b, k) { b.rows.forEach(x => x.splice(k, 0, '')); (b.cw ||= []).splice(k, 0, COLW); for (const m of b.mg || []) { if (m.c >= k) m.c++; else if (m.c + m.cs > k) m.cs++; } b.sum = (b.sum || []).map(c => c >= k ? c + 1 : c); },
  colDel(b, k) {
    if (b.rows[0].length <= 1) return false;
    b.rows.forEach(x => x.splice(k, 1)); (b.cw || []).splice(k, 1);
    b.mg = (b.mg || []).filter(m => { if (m.c > k) m.c--; else if (m.c + m.cs > k) m.cs--; return m.rs > 1 || m.cs > 1; });
    b.sum = (b.sum || []).filter(c => c !== k).map(c => c > k ? c - 1 : c);
    return true;
  },
  own(b) { const o = {}; for (const m of b.mg || []) for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) o[`${r},${c}`] = m; return o; },
  owner(b, r, c) { const m = (b.mg || []).find(m => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs); return m ? [m.r, m.c] : [r, c]; },
  // ادمج الخانة مع اللي جنبها (h) أو اللي تحتها (v). الكلام اللي في الخانات بيتجمع في الأولى
  merge(b, r, c, dir) {
    const R = b.rows, nr = R.length, nc = R[0].length; [r, c] = TB.owner(b, r, c);
    const m0 = (b.mg || []).find(m => m.r === r && m.c === c) || { r, c, rs: 1, cs: 1 };
    const n = { ...m0 }; if (dir === 'h') n.cs++; else n.rs++;
    if (n.c + n.cs > nc || n.r + n.rs > nr) return 'مفيش خانة ' + (dir === 'h' ? 'جنبها' : 'تحتها');
    const inside = m => m.r >= n.r && m.c >= n.c && m.r + m.rs <= n.r + n.rs && m.c + m.cs <= n.c + n.cs;
    const hits = m => m.r < n.r + n.rs && n.r < m.r + m.rs && m.c < n.c + n.cs && n.c < m.c + m.cs;
    if ((b.mg || []).some(m => m !== m0 && hits(m) && !inside(m))) return 'فيه خانات مدموجة في الطريق، افصلها الأول';
    const txt = [];
    for (let i = n.r; i < n.r + n.rs; i++) for (let j = n.c; j < n.c + n.cs; j++) { if ((R[i][j] || '').trim()) txt.push(R[i][j].trim()); if (i !== n.r || j !== n.c) R[i][j] = ''; }
    R[n.r][n.c] = txt.join(' ');
    b.mg = (b.mg || []).filter(m => m !== m0 && !inside(m)); b.mg.push(n);
    return null;
  },
  split(b, r, c) { const k = (b.mg || []).findIndex(m => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs); if (k < 0) return 'الخانة دي مش مدموجة'; b.mg.splice(k, 1); return null; },
  // رتّب الصفوف (من غير صف العناوين) حسب العمود ده. الأرقام بتترتب كأرقام
  sort(b, c, desc) {
    if ((b.mg || []).length) return 'افصل الخانات المدموجة الأول عشان الترتيب';
    const rows = b.rows.slice(1).map((x, i) => ({ x, h: (b.rh || [])[i + 1] ?? null, k: (b.rc || [])[i + 1] || '' }));
    rows.sort((p, q) => {
      const a = (p.x[c] || '').trim(), z = (q.x[c] || '').trim();
      if (!a !== !z) return a ? -1 : 1;   // الفاضي آخر حاجة دايمًا
      const na = numOf(a), nz = numOf(z), d = na != null && nz != null ? na - nz : a.localeCompare(z, 'ar');
      return desc ? -d : d;
    });
    b.rows = [b.rows[0], ...rows.map(o => o.x)]; b.rh = [(b.rh || [])[0] ?? null, ...rows.map(o => o.h)]; b.rc = [(b.rc || [])[0] || '', ...rows.map(o => o.k)];
    return null;
  },
  sum(b, c) { const S = new Set(b.sum || []); S.has(c) ? S.delete(c) : S.add(c); b.sum = [...S].sort((p, q) => p - q); },
  total(b, c) { return b.rows.slice(1).reduce((n, x) => n + (numOf(x[c]) || 0), 0); },
};

// دمج 3 نسخ: الأصل اللي بدأنا منه، ونسخة الجهاز التاني، ونسختك. لو نفس السطر اتعدّل في الاتنين: نسختك بتكسب
export function mergeBlocks(base, theirs, mine) {
  const S = x => JSON.stringify(x), bm = new Map(base.map(b => [b.id, b])), mm = new Map(mine.map(b => [b.id, b])), tm = new Map(theirs.map(b => [b.id, b]));
  const out = [];
  for (const t of theirs) {
    const b = bm.get(t.id), m = mm.get(t.id);
    if (m) out.push(b && S(m) === S(b) ? t : m);          // اتعدّل عندك = نسختك، متعدّلش = نسختهم
    else if (!b) out.push(t);                              // جديد عندهم
    else if (S(t) !== S(b)) out.push(t);                   // إنت مسحته بس هم عدّلوه: نسيبه
  }
  // اللي إنت ضفته أو اللي هم مسحوه وإنت عدّلته: نحطه بعد السطر اللي كان قبله عندك
  mine.forEach((m, i) => {
    if (out.some(x => x.id === m.id)) return;
    const b = bm.get(m.id); if (b && !tm.has(m.id) && S(b) === S(m)) return;   // هم مسحوه وإنت متعدّلتهوش: يتمسح
    let at = 0; for (let k = i - 1; k >= 0; k--) { const j = out.findIndex(x => x.id === mine[k].id); if (j >= 0) { at = j + 1; break; } }
    out.splice(at, 0, m);
  });
  return out.length ? out : mine;
}

let ACTIVE = null;   // الدفتر المفتوح دلوقتي (عشان شيت "اربط" يوصله)

// host = المكان اللي الدفتر هيتحط فيه. now() = الوقت في الفيديو، seek(t, v) = روح للحظة دي
export async function mountNotes(host, { table, id, now, seek, label }) {
  const owner = table === 'media' ? 'media' : table === 'courses' ? 'course' : null;   // الدفتر العام مش تبع كورس
  const row = await one(table, id);
  let B = row?.notes?.blocks?.length ? JSON.parse(JSON.stringify(row.notes.blocks)) : [{ id: nid(), type: 'h1', text: '', indent: 0 }];
  let FS = Number(row?.notes?.fs) || 16;
  let cur = B[0].id, cell = null, saveT = null, dirty = false, fork = null, panel = '', visible = true, dead = false;
  let TASKS = {};
  let base = JSON.parse(JSON.stringify(B)), stamp = row?.notes?.updated_at || null;   // آخر نسخة متحفظة (للدمج)
  const loadTasks = async () => { const ids = B.filter(b => b.task).map(b => b.task); if (!ids.length) return; TASKS = Object.fromEntries((await list('tasks', { in: ['id', ids] })).map(t => [t.id, t])); };
  await loadTasks();

  // ---------- تراجع / إعادة ----------
  // الخطوات بتتحفظ على الموبايل نفسه، فلو قفلت التطبيق ورجعت تقدر ترجّع برضه
  const HK = `nota.hist.${table}.${id}`;
  let hist = null, hi = 0, histT = null, keepT = null;
  try {
    const h = JSON.parse(localStorage.getItem(HK) || 'null');
    if (h && Array.isArray(h.s) && h.s.length) { hist = h.s; hi = Math.max(0, Math.min(h.i, hist.length - 1)); const now0 = JSON.stringify(B); if (hist[hi] !== now0) { hist = hist.slice(0, hi + 1); hist.push(now0); hi = hist.length - 1; } }
  } catch (e) { hist = null; }
  if (!hist) { hist = [JSON.stringify(B)]; hi = 0; }
  const keepHist = () => {
    clearTimeout(keepT);
    keepT = setTimeout(() => {
      while (hist.length > 2 && hist.reduce((n, x) => n + x.length, 0) > 1.2e6) { hist.shift(); hi = Math.max(0, hi - 1); }
      try { localStorage.setItem(HK, JSON.stringify({ s: hist, i: hi })); }
      catch (e) { try { const k = Math.max(0, hist.length - 8); localStorage.setItem(HK, JSON.stringify({ s: hist.slice(k), i: Math.max(0, hi - k) })); } catch (_) {} }
    }, 300);
  };
  const remember = () => { clearTimeout(histT); histT = null; const s = JSON.stringify(B); if (s === hist[hi]) return; hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 100) hist.shift(); hi = hist.length - 1; paintUndo(); keepHist(); };
  const rememberSoon = () => { clearTimeout(histT); histT = setTimeout(remember, 700); };

  host.innerHTML = `<div class="nt"><div class="nt-doc" style="--ntfs:${FS}px"></div>
    <button type="button" class="nt-add" data-a="add">+ سطر جديد</button>
    <div class="mut nt-st" aria-live="polite">${label || ''}</div></div>`;
  const doc = host.querySelector('.nt-doc'), st = host.querySelector('.nt-st');

  // شريط الأدوات: بيتحط تحت خالص، ولما الكيبورد يفتح بيطلع فوقه
  const dock = document.createElement('div');
  dock.className = 'nt-dock'; dock.setAttribute('role', 'toolbar'); dock.setAttribute('aria-label', 'أدوات الدفتر');
  dock.innerHTML = `<div class="nt-dk">
    <div class="nt-pan" data-p="fmt" hidden>
      <div class="nt-row nt-styles">${STYLES.map(([k, l]) => `<button type="button" data-t="${k}" class="nt-st-${k}">${l}</button>`).join('')}</div>
      <div class="nt-row"><button type="button" data-cmd="bold" class="nt-ib" aria-label="عريض"><b>B</b></button><button type="button" data-cmd="italic" class="nt-ib" aria-label="مائل"><i>I</i></button><button type="button" data-cmd="underline" class="nt-ib" aria-label="تحته خط"><u>U</u></button><button type="button" data-cmd="strikeThrough" class="nt-ib" aria-label="عليه خط"><s>S</s></button><button type="button" data-cmd="hilite" class="nt-ib nt-hl" aria-label="هايلايتر">🖍</button>
        <span class="nt-sep"></span><button type="button" data-t="li" aria-label="نقط">• نقط</button><button type="button" data-t="ol" aria-label="أرقام">١. أرقام</button></div>
      <div class="nt-row"><button type="button" data-a="note" data-k="warn">⚠️ مهم</button><button type="button" data-a="note" data-k="q">❓ سؤال</button><button type="button" data-a="note" data-k="ex">💡 مثال</button><span class="nt-sep"></span><button type="button" data-a="in">بادئة +</button><button type="button" data-a="out">بادئة −</button></div>
      <div class="nt-row nt-dots"><span class="mut nt-plab">اللون</span>${dots('color', '')}</div>
      <div class="nt-row"><span class="mut nt-plab">حجم الخط</span><button type="button" data-a="fs" data-d="-1" aria-label="صغّر الخط">أ−</button><span class="nt-fsv">${FS}</span><button type="button" data-a="fs" data-d="1" aria-label="كبّر الخط">أ+</button></div>
    </div>
    <div class="nt-pan nt-menu" data-p="more" hidden>
      <div class="nt-mg"><span class="nt-mgl">ضيف</span><div class="nt-row">
        <button type="button" data-a="panel" data-p="grid">${svg(I.table)} جدول</button><button type="button" data-a="fork">${svg(I.fork)} فرع</button><button type="button" data-a="link">${ic('link', 18)} اربط</button><button type="button" data-a="hr">➖ خط فاصل</button><button type="button" data-a="tpl">🧩 قالب ملخص</button></div></div>
      <div class="nt-mg"><span class="nt-mgl">السطر ده</span><div class="nt-row">
        <button type="button" data-a="tasknow">☑️ مهمة النهاردة</button><button type="button" data-a="lesson">📘 درس اتعلمته</button>
        <button type="button" data-a="up" aria-label="طلّع السطر">↑</button><button type="button" data-a="down" aria-label="نزّل السطر">↓</button><button type="button" data-a="del" class="bad">امسح السطر</button><button type="button" data-a="delsec" class="bad">امسح القسم كله</button></div></div>

      <div class="nt-mg"><span class="nt-mgl">الدفتر</span><div class="nt-row">
        <button type="button" data-a="panel" data-p="toc">📑 الفهرس</button><button type="button" data-a="panel" data-p="find">🔎 دوّر</button>
        <button type="button" data-a="foldall">🗂 اطوي الأقسام</button><button type="button" data-a="map">🧠 خريطة</button><button type="button" data-a="pdf">📄 PDF</button><button type="button" data-a="docx">📝 Word</button></div></div>
    </div>
    <div class="nt-pan nt-gpan" data-p="grid" hidden>
      <div class="nt-gsz"><b class="nt-glab">اسحب صباعك على المربعات</b><span class="mut">أول صف هيبقى العناوين</span></div>
      <div class="nt-gwrap"><div class="nt-gp" style="--gr:10;--gc:8">${Array.from({ length: 10 }, (_, r) => Array.from({ length: 8 }, (_, c) => `<span data-gr="${r + 1}" data-gc="${c + 1}"></span>`).join('')).join('')}</div></div>
      <button type="button" class="nt-gok" data-a="mktable" data-r="3" data-c="3" disabled>اختار المقاس الأول</button>
    </div>
    <div class="nt-pan" data-p="toc" hidden><div class="nt-toc"></div></div>
    <div class="nt-pan nt-tpan" data-p="table" hidden><div class="nt-row"><span class="nt-pad"><button type="button" data-a="go" data-d="r" aria-label="الخانة اللي على اليمين">→</button><button type="button" data-a="go" data-d="u" aria-label="الخانة اللي فوق">↑</button><button type="button" data-a="go" data-d="d" aria-label="الخانة اللي تحت">↓</button><button type="button" data-a="go" data-d="l" aria-label="الخانة اللي على الشمال">←</button></span><span class="nt-sep"></span><button type="button" data-a="row+">+ صف</button><button type="button" data-a="col+">+ عمود</button><button type="button" data-a="tmore" class="nt-tmb" aria-label="أدوات الجدول">⋯</button></div>
      <div class="nt-tm" hidden><div class="nt-row"><button type="button" data-a="mh">⇠ ادمج مع اللي جنبها</button><button type="button" data-a="mv">⇣ ادمج مع اللي تحتها</button><button type="button" data-a="split">افصل</button><button type="button" data-a="sum">Σ اجمع العمود</button></div>
      <div class="nt-row"><button type="button" data-a="sortA">رتّب ↑</button><button type="button" data-a="sortD">رتّب ↓</button><button type="button" data-a="row-" class="bad">− صف</button><button type="button" data-a="col-" class="bad">− عمود</button><button type="button" data-a="topen" data-bid="">⤢ كبّر</button></div>
      <div class="nt-row nt-dots"><span class="mut nt-plab">لون الصف</span>${dots('color', '')}</div></div></div>
    <div class="nt-pan" data-p="img" hidden><div class="nt-row"><span class="mut nt-plab">الصورة</span>${IMGW.map(([w, l]) => `<button type="button" data-a="imgw" data-w="${w}">${l}</button>`).join('')}<span class="nt-sep"></span><button type="button" data-a="del" class="bad">امسحها</button></div></div>
    <div class="nt-pan" data-p="find" hidden><div class="nt-row"><input class="inp nt-q" placeholder="دوّر على كلمة…" enterkeyhint="search"><span class="mut nt-qn"></span><button type="button" data-a="qprev" aria-label="اللي قبله">↑</button><button type="button" data-a="qnext" aria-label="اللي بعده">↓</button></div></div>
    <div class="nt-main">
      <button type="button" data-a="panel" data-p="fmt" aria-label="شكل الكلام"><span class="nt-aa" dir="ltr">Aa</span></button>
      <button type="button" data-t="todo" aria-label="مهام">${svg(I.todo)}</button>
      <button type="button" data-a="photo" aria-label="ضيف صورة">${svg(I.photo)}</button>
      ${now ? `<button type="button" data-a="time" class="nt-time" aria-label="وقت الفيديو دلوقتي">${ic('clock', 21)}</button>` : ''}
      <button type="button" data-a="undo" aria-label="تراجع">${svg(I.undo)}</button>
      <button type="button" data-a="redo" aria-label="إعادة">${svg(I.redo)}</button>
      <button type="button" data-a="panel" data-p="more" class="nt-allb" aria-label="كل الأدوات">${svg(I.grid)}</button>
      <button type="button" data-a="kb" class="nt-kb" aria-label="اقفل الكيبورد">${svg(I.kb)}</button>
    </div></div>`;
  document.body.appendChild(dock);
  document.body.classList.add('nt-open');

  const idx = bid => B.findIndex(b => b.id === bid), get = bid => B[idx(bid)];
  const forkBtn = document.createElement('button');
  forkBtn.type = 'button'; forkBtn.className = 'nt-forkbtn'; forkBtn.dataset.a = 'fork'; forkBtn.setAttribute('aria-label', 'اعمل فرع من السطر ده'); forkBtn.textContent = '↘';

  // ---------- الرسم ----------
  // ed = true: جوه محرر الجدول (خانات بتتكتب + أزرار + وشد المقاسات). من غيرها: معاينة في الدفتر تدوس عليها تفتح المحرر
  function tableHtml(b, ed) {
    const R = b.rows, nc = R[0].length;
    b.cw = Array.from({ length: nc }, (_, i) => (b.cw || [])[i] || COLW);
    // في الدفتر: الجدول بيتكتب فيه على طول زي أي سطر (والشاشة مبتتغيرش). "⤢ كبّر" بيفتحه على الشاشة كلها لو عايز
    const own = TB.own(b), S = new Set(b.sum || []), lab = [...Array(nc).keys()].find(k => !S.has(k));
    const span = (ri, ci) => { const m = own[`${ri},${ci}`]; if (!m) return ''; if (m.r !== ri || m.c !== ci) return null; return `${m.rs > 1 ? ` rowspan="${m.rs}"` : ''}${m.cs > 1 ? ` colspan="${m.cs}"` : ''}`; };
    const cellsOf = (r, ri, minW) => r.map((x, ci) => { const sp = span(ri, ci); if (sp === null) return ''; const tg = ri ? 'td' : 'th'; return `<${tg} contenteditable="true" data-r="${ri}" data-c="${ci}"${sp}${S.has(ci) && ri ? ' class="nt-numc"' : ''}${minW ? ` style="min-width:${Math.max(70, Math.min(b.cw[ci], 220))}px"` : ''}>${esc(x)}</${tg}>`; }).join('');
    const sumRow = lead => S.size ? `<tr class="nt-sumr">${lead}${b.cw.map((_, ci) => `<td class="${S.has(ci) ? 'nt-numc' : ''}" data-sc="${ci}">${S.has(ci) ? `<b>${fmtNum(TB.total(b, ci))}</b>` : ci === lab ? 'المجموع' : ''}</td>`).join('')}</tr>` : '';
    // في الدفتر: الجدول بيتكتب فيه على طول زي أي سطر (والشاشة مبتتغيرش). "⤢ كبّر" بيفتحه على الشاشة كلها لو عايز
    if (!ed) return `<div class="nt-tw nt-inl"><table><tbody>
      ${R.map((r, ri) => `<tr class="${(b.rc || [])[ri] ? 'nt-c-' + b.rc[ri] : ''}">${cellsOf(r, ri, true)}</tr>`).join('')}${sumRow('')}
      </tbody></table></div><div class="nt-tft" contenteditable="false"><span class="mut">${R.length} صف · ${nc} عمود</span><button type="button" class="nt-topen" data-a="topen" data-bid="${b.id}">⤢ كبّر الجدول</button></div>`;
    const W = 30 + b.cw.reduce((s, w) => s + w, 0);
    return `<table class="nt-et" style="width:${W}px;--tw:${W}px"><colgroup><col style="width:30px">${b.cw.map(w => `<col style="width:${w}px">`).join('')}</colgroup>
      <tr class="nt-hrow"><td class="nt-rh nt-corner"></td>${b.cw.map((_, ci) => `<td class="nt-ch"><span class="nt-cl">${S.has(ci) ? 'Σ ' : ''}${ci + 1}</span><span class="nt-cgrip" data-cg="${ci}" aria-hidden="true"></span></td>`).join('')}</tr>
      ${R.map((r, ri) => { const h = (b.rh || [])[ri], c = (b.rc || [])[ri]; return `<tr class="nt-row-t${c ? ' nt-c-' + c : ''}"${h ? ` style="height:${h}px"` : ''}><td class="nt-rh"><span class="nt-rl">${ri ? ri : '★'}</span><span class="nt-rgrip" data-rg="${ri}" aria-hidden="true"></span></td>${cellsOf(r, ri, false)}</tr>`; }).join('')}
      ${sumRow('<td class="nt-rh"><span class="nt-rl">Σ</span></td>')}
    </table>`;
  }
  function refsHtml(b) {
    const chips = [];
    if (b.task) { const t = TASKS[b.task]; chips.push(`<span class="nt-ref"><span class="k">☑️</span>${t ? (t.done ? 'المهمة خلصت' : 'مهمة في ' + (t.due_on === today() ? 'النهاردة' : t.due_on)) : 'مهمة'}</span>`); }
    if (b.lesson) chips.push('<span class="nt-ref"><span class="k">📘</span>في "اتعلمت إيه"</span>');
    for (const [i, r] of (b.refs || []).entries()) {
      const href = hrefOf(r.type, r.id), k = KIND[r.type];
      chips.push(`<span class="nt-ref">${href ? `<a href="${href}">` : '<span>'}<span class="k">${ic(k ? k[1] : 'link', 13)}</span>${esc(r.title || (k ? k[0] : ''))}${href ? '</a>' : '</span>'}<button type="button" class="nt-refx" data-a="unref" data-i="${i}" data-bid="${b.id}" aria-label="شيل الربط">×</button></span>`);
    }
    return chips.length ? `<div class="nt-refs" contenteditable="false">${chips.join('')}</div>` : '';
  }
  function blockHtml(b, num, hid) {
    const ts = b.t != null ? `<button type="button" class="nt-ts" data-ts="${b.t}" data-v="${esc(b.v || '')}" contenteditable="false">⏱ ${b.vn ? `فيديو ${b.vn} · ` : ''}<span dir="ltr">${mmss(b.t)}</span></button>` : '';
    const ind = Math.min(MAXI, b.indent || 0), col = b.c ? ' nt-c-' + b.c : '', h = hid ? ' nt-hid' : '';
    if (b.type === 'img') return `<div class="nt-b nt-img${h}${b.id === cur ? ' nt-sel' : ''}" data-id="${b.id}" tabindex="0" aria-label="صورة">${ts}<figure style="width:${b.w || 60}%"><img src="${esc(b.src)}" alt="" loading="lazy" decoding="async"></figure>${refsHtml(b)}</div>`;
    if (b.type === 'hr') return `<div class="nt-b nt-hr${h}" data-id="${b.id}" tabindex="0" aria-label="خط فاصل"><hr></div>`;
    if (b.type === 'table') return `<div class="nt-b nt-table${h}" data-id="${b.id}" style="--ind:${ind}">${ts}${tableHtml(b, false)}${refsHtml(b)}</div>`;
    const done = b.type === 'todo' && (b.task && TASKS[b.task] ? TASKS[b.task].done : b.done);
    const pre = LV[b.type] ? `<button type="button" class="nt-fold" data-a="fold" data-bid="${b.id}" contenteditable="false" aria-label="${b.fold ? 'افتح القسم' : 'اطوي القسم'}" aria-expanded="${!b.fold}">${b.fold ? '‹' : '⌄'}</button>`
      : b.type === 'todo' ? `<button type="button" class="nt-chk${done ? ' on' : ''}" data-a="check" data-bid="${b.id}" contenteditable="false" aria-label="${done ? 'رجّعها' : 'خلصت'}">${done ? ic('check', 14) : ''}</button>`
      : b.type === 'ol' ? `<span class="nt-num" contenteditable="false">${num}.</span>`
      : b.type === 'note' ? `<span class="nt-nico" contenteditable="false">${(NOTE[b.kind] || NOTE.warn)[0]}</span>` : '';
    return `<div class="nt-b nt-${b.type}${b.type === 'note' ? ' nt-n-' + (b.kind || 'warn') : ''}${col}${done ? ' nt-done' : ''}${b.fold ? ' nt-folded' : ''}${h}" data-id="${b.id}" style="--ind:${ind}">${ts}<div class="nt-line">${pre}<div class="nt-tx" contenteditable="true" data-ph="${PH[b.type] || ''}">${inner(b)}</div></div>${refsHtml(b)}</div>`;
  }
  function draw(focusId, pos, cellRC, fresh) {
    closeFork(true);
    const olc = {}; let hideLv = 0;
    doc.innerHTML = B.map(b => {
      const lv = LV[b.type], k = b.indent || 0;
      let hid = false;
      if (hideLv) { if (lv && lv <= hideLv) hideLv = 0; else hid = true; }
      if (!hid && lv && b.fold) hideLv = lv;
      let num = 0;
      if (b.type === 'ol') { olc[k] = (olc[k] || 0) + 1; num = olc[k]; for (const x of Object.keys(olc)) if (+x > k) delete olc[x]; }
      else for (const x of Object.keys(olc)) if (+x >= k) delete olc[x];
      return blockHtml(b, num, hid);
    }).join('');
    doc.appendChild(forkBtn);
    if (fresh) for (const fid of fresh) doc.querySelector(`[data-id="${fid}"]`)?.classList.add('nt-new');
    if (focusId) {
      const h = doc.querySelector(`[data-id="${focusId}"]`);
      if (cellRC) placeCaret(h?.querySelector(`[data-r="${cellRC[0]}"][data-c="${cellRC[1]}"]`) || h?.querySelector('th,td'), null);
      else if (h?.querySelector('.nt-tx')) placeCaret(h.querySelector('.nt-tx'), pos);
    }
    paintBar(); if (panel === 'toc') paintToc(); if (panel === 'find') runFind(false);
  }
  function paintUndo() { dock.querySelector('[data-a=undo]').disabled = hi <= 0; dock.querySelector('[data-a=redo]').disabled = hi >= hist.length - 1; }
  function paintBar() {
    const b = get(cur), isT = b && b.type === 'table';
    dock.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', !!b && b.type === x.dataset.t));
    dock.querySelector('[data-a=fork]').classList.toggle('on', !!b && b.type === 'arrow');
    const colNow = isT ? (b.rc || [])[cell ? cell[0] : -1] : b?.c;
    const isImg = b && b.type === 'img';
    if (!isImg && panel === 'img') showPanel('', true);
    if (isImg) dock.querySelectorAll('[data-a=imgw]').forEach(x => x.classList.toggle('on', +x.dataset.w === (b.w || 60)));
    const inCell = isT && cell && doc.contains(document.activeElement) && document.activeElement.matches('th,td');
    if (inCell && !panel) showPanel('table', true);
    if (!inCell && panel === 'table') showPanel('', true);
    dock.querySelectorAll('[data-a=color]').forEach(d => d.classList.toggle('on', (colNow || '') === d.dataset.col));
    const el = b && !isT && b.type !== 'hr' && doc.querySelector(`[data-id="${b.id}"]`);
    if (el && !fork && !el.classList.contains('nt-hid') && doc.contains(document.activeElement)) { forkBtn.hidden = false; forkBtn.style.top = `${el.offsetTop + Math.min(el.offsetHeight, 40) / 2 - 15}px`; } else forkBtn.hidden = true;
    paintUndo(); paintCmds();
  }
  function paintCmds() {
    for (const x of dock.querySelectorAll('[data-cmd]')) { let on = false; try { on = x.dataset.cmd !== 'hilite' && document.queryCommandState(x.dataset.cmd); } catch (e) {} x.classList.toggle('on', on); }
  }
  function showPanel(p, quiet) {
    panel = p === panel && !quiet ? '' : p;
    dock.querySelectorAll('.nt-pan').forEach(x => { x.hidden = x.dataset.p !== panel; });
    dock.querySelectorAll('.nt-main [data-a=panel]').forEach(x => x.classList.toggle('on', x.dataset.p === panel || (x.dataset.p === 'more' && ['grid', 'toc', 'find'].includes(panel))));
    if (panel === 'toc') paintToc();
    if (panel === 'find') setTimeout(() => dock.querySelector('.nt-q').focus(), 30);
    place();
  }

  // ---------- الحفظ ----------
  function save(now2) { dirty = true; st.textContent = 'بيحفظ…'; clearTimeout(saveT); saveT = setTimeout(flush, now2 ? 0 : 700); rememberSoon(); }
  // لو الدفتر اتعدّل من جهاز تاني وإنت بتكتب: بندمج الاتنين بدل ما واحد يمسح التاني
  async function remoteIn(force) {
    const fresh = await one(table, id).catch(() => null), rn = fresh && fresh.notes;
    if (!rn || !Array.isArray(rn.blocks) || !rn.updated_at || rn.updated_at === stamp) return false;
    const merged = mergeBlocks(base, rn.blocks, B);
    stamp = rn.updated_at; base = JSON.parse(JSON.stringify(rn.blocks));
    if (JSON.stringify(merged) === JSON.stringify(B)) return false;
    B = merged; if (!get(cur)) cur = B[0].id;
    if (force || !doc.contains(document.activeElement)) draw(); else draw(cur, null);
    remember(); return true;
  }
  async function flush() {
    clearTimeout(saveT); if (!dirty) return; dirty = false;
    for (const b of B) if (b.html != null) b.html = sanitize(b.html);
    try {
      syncText(); await remoteIn(false);
      const at = new Date().toISOString();
      await upd(table, id, { notes: { blocks: B, fs: FS, updated_at: at } });
      stamp = at; base = JSON.parse(JSON.stringify(B));
      if (!dead) st.textContent = 'اتحفظ';
    } catch (e) { st.textContent = 'ما اتحفظش، جرّب تاني'; dirty = true; }
  }
  const after = (b, nb) => { B.splice(idx(b.id) + 1, 0, nb); return nb; };
  const syncLine = b => { const el = b && doc.querySelector(`[data-id="${b.id}"] .nt-tx`); if (el) { b.text = clean(el); b.html = el.innerHTML; } };
  const syncText = () => syncLine(get(cur));
  const branchAt = pid => { const i = idx(pid), base = B[i].indent || 0; let j = i + 1; while (j < B.length && !NOTXT.includes(B[j].type) && !LV[B[j].type] && (B[j].indent || 0) > base) j++; return j; };

  // ---------- الفرع ----------
  function openFork(pid) {
    const p = get(pid); if (!p || NOTXT.includes(p.type)) return;
    syncText(); closeFork(true); showPanel('', true);
    const depth = Math.min(MAXI, (p.indent || 0) + 1), j = branchAt(pid);
    const anchor = j < B.length ? doc.querySelector(`[data-id="${B[j].id}"]`) : forkBtn;
    const col = BRANCH[(p.indent || 0) % BRANCH.length];
    const box = document.createElement('div');
    box.className = `nt-fork nt-c-${col}`; box.style.setProperty('--ind', depth);
    box.innerHTML = `<svg class="nt-fork-ar" viewBox="0 0 56 40" aria-hidden="true"><path d="M52 2 L10 34" /><path d="M10 34 l3 -11 M10 34 l11 -3" /></svg>
      <div class="nt-fork-in" contenteditable="true" data-ph="اكتب الفرع… وبعدين إنتر"></div>
      <div class="nt-fork-ft">${dots('forkcol', col).replace(/data-col=""[^>]*><\/button>/, 'data-col="" hidden></button>')}<span></span><button type="button" class="nt-fork-x" data-a="forkx">إلغاء</button><button type="button" class="nt-fork-ok" data-a="forkok">نزّله ↵</button></div>`;
    doc.insertBefore(box, anchor);
    fork = { pid, box, col, depth }; forkBtn.hidden = true;
    requestAnimationFrame(() => box.classList.add('in'));
    placeCaret(box.querySelector('.nt-fork-in'), null);
  }
  function closeFork(silent) { if (!fork) return; fork.box.remove(); fork = null; if (!silent) paintBar(); }
  function commitFork() {
    if (!fork) return;
    const text = clean(fork.box.querySelector('.nt-fork-in')).trim();
    if (!text) return closeFork();
    const at = branchAt(fork.pid), made = text.split(/\n+/).map(t => t.trim()).filter(Boolean).map(t => ({ id: nid(), type: 'arrow', text: t, indent: fork.depth, c: fork.col }));
    B.splice(at, 0, ...made);
    const last = made[made.length - 1]; cur = last.id; fork = null;
    draw(last.id, null, null, made.map(m => m.id)); save();
  }

  // ---------- الكتابة ----------
  doc.addEventListener('input', e => {
    const el = e.target; if (el.closest('.nt-fork')) return;
    const blk = el.closest('.nt-b'); if (!blk) return;
    const b = get(blk.dataset.id); if (!b) return;
    if (el.matches('th,td')) { b.rows[+el.dataset.r][+el.dataset.c] = clean(el); liveSum(blk, b, +el.dataset.c); } else { b.text = clean(el); b.html = el.innerHTML; }
    if (b.task && TASKS[b.task]) upd('tasks', b.task, { title: b.text || TASKS[b.task].title }).catch(() => {});
    save();
  });
  doc.addEventListener('focusin', e => {
    if (e.target.closest('.nt-fork')) return;
    const blk = e.target.closest('.nt-b'); if (!blk) return;
    if (fork) closeFork(true);
    cur = blk.dataset.id; cell = e.target.matches('th,td') ? [+e.target.dataset.r, +e.target.dataset.c] : null; paintBar();
  });
  const onSel = () => { if (!dead && visible && doc.contains(document.activeElement)) paintCmds(); };
  document.addEventListener('selectionchange', onSel);
  doc.addEventListener('paste', e => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); });
  doc.addEventListener('click', e => {
    const ts = e.target.closest('.nt-ts'); if (ts && seek) { e.preventDefault(); seek(Number(ts.dataset.ts), ts.dataset.v || null); return; }
    const hr = e.target.closest('.nt-hr'); if (hr) { cur = hr.dataset.id; hr.focus(); paintBar(); }
    const im = e.target.closest('.nt-img'); if (im && !e.target.closest('.nt-ts,.nt-refs')) { cur = im.dataset.id; doc.querySelectorAll('.nt-sel').forEach(x => x.classList.remove('nt-sel')); im.classList.add('nt-sel'); im.focus({ preventScroll: true }); showPanel('img', true); paintBar(); return; }
  });
  doc.addEventListener('keydown', e => {
    const el = e.target;
    if (el.matches('.nt-fork-in')) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); commitFork(); }
      else if (e.key === 'Escape') { e.preventDefault(); const p = fork.pid; closeFork(); placeCaret(doc.querySelector(`[data-id="${p}"] .nt-tx`), null); }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && /^[zZ]$/.test(e.key)) { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
    if (el.matches('th,td') && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {   // إنتر = الخانة اللي جنبها، ولو آخر الصف: أول خانة في الصف اللي تحته (أو صف جديد)
      e.preventDefault(); return goCell(el, 'next');
    }
    if (!el.matches('.nt-tx')) return;
    const b = get(el.closest('.nt-b').dataset.id); if (!b) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const text = clean(el);
      if (['li', 'ol', 'todo', 'arrow', 'note'].includes(b.type) && !text) { b.type = 'p'; b.indent = Math.max(0, (b.indent || 0) - (b.type === 'arrow' ? 1 : 0)); delete b.c; delete b.kind; b.html = ''; draw(b.id, 0); return save(); }
      // بنقسم السطر عند المؤشر (والتنسيق بيتقسم معاه)
      const s = getSelection(); let tailHtml = '';
      if (s.rangeCount) {
        const r = s.getRangeAt(0); r.deleteContents();
        const tail = document.createRange(); tail.setStart(r.endContainer, r.endOffset); tail.setEnd(el, el.childNodes.length);
        const box = document.createElement('div'); box.appendChild(tail.extractContents()); tailHtml = sanitize(box.innerHTML);
      }
      b.html = sanitize(el.innerHTML); b.text = clean(el);
      const tmp = document.createElement('div'); tmp.innerHTML = tailHtml;
      const nb = after(b, { id: nid(), type: LV[b.type] || b.type === 'note' ? 'p' : b.type, text: tmp.innerText || '', html: tailHtml, indent: LV[b.type] && b.type !== 'h3' ? 0 : b.indent || 0, ...(b.type === 'arrow' && b.c ? { c: b.c } : {}) });
      cur = nb.id; remember(); draw(nb.id, 0); save();
    } else if (e.key === 'Backspace' && !hasSelection() && caretOffset(el) === 0) {
      const i = idx(b.id), text = clean(el);
      if ((b.indent || 0) > 0) { e.preventDefault(); b.indent--; if (b.type === 'arrow' && !b.indent) { b.type = 'p'; delete b.c; } syncLine(b); draw(b.id, 0); return save(); }
      if (['li', 'ol', 'todo', 'note'].includes(b.type)) { e.preventDefault(); syncLine(b); b.type = 'p'; delete b.kind; draw(b.id, 0); return save(); }
      if (i === 0) { if (b.type !== 'p' && !text) { e.preventDefault(); b.type = 'p'; draw(b.id, 0); save(); } return; }
      e.preventDefault();
      const prev = B[i - 1];
      if (prev.type === 'hr') { B.splice(i - 1, 1); draw(b.id, 0); return save(); }
      if (prev.type === 'img') { if (!text) { B.splice(i, 1); cur = prev.id; draw(); save(); } return; }
      if (prev.type === 'table') { if (!text) { B.splice(i, 1); cur = prev.id; draw(prev.id, null, [prev.rows.length - 1, prev.rows[0].length - 1]); save(); } return; }
      syncLine(b);
      const L = (prev.text || '').length;
      prev.html = (prev.html != null ? sanitize(prev.html) : esc(prev.text || '')) + (b.html != null ? sanitize(b.html) : esc(b.text || ''));
      prev.text = (prev.text || '') + (b.text || '');
      if (prev.t == null && b.t != null) { prev.t = b.t; prev.v = b.v; prev.vn = b.vn; }
      if (b.refs?.length) prev.refs = [...(prev.refs || []), ...b.refs];
      B.splice(i, 1); cur = prev.id; remember(); draw(prev.id, L); save();
    }
  });

  // التنقل بين خانات الجدول (الأسهم وإنتر). الجدول RTL: أول عمود على اليمين
  function goCell(el, d) {
    const tb = get(el.closest('.nt-b').dataset.id); if (!tb) return;
    syncCell(el);
    const R = tb.rows, nr = R.length, nc = R[0].length; let r = +el.dataset.r, c = +el.dataset.c;
    if (d === 'next') { if (c + 1 < nc) c++; else { r++; c = 0; } }
    else if (d === 'l') c = Math.min(nc - 1, c + 1);
    else if (d === 'r') c = Math.max(0, c - 1);
    else if (d === 'u') r = Math.max(0, r - 1);
    else if (d === 'd') r++;
    if (r >= nr) {   // مفيش صف تحت: بنعمل واحد جديد
      remember(); TB.rowIns(tb, nr);
      cur = tb.id; cell = [r, c]; draw(tb.id, null, [r, c]); save(); remember(); return;
    }
    // خانة مدموجة: بنعدّيها أو بنروح لأولها
    const [r0, c0] = TB.owner(tb, +el.dataset.r, +el.dataset.c), [ro, co] = TB.owner(tb, r, c);
    if (ro === r0 && co === c0 && (r !== r0 || c !== c0)) { const m = (tb.mg || []).find(m => m.r === r0 && m.c === c0); if (d === 'next' || d === 'l') { c = m.c + m.cs; if (c >= nc) { if (d === 'l') return; r = m.r + m.rs; c = 0; } } else if (d === 'd') r = m.r + m.rs; if (r >= nr) return goCell(el.closest('table').querySelector(`[data-r="${r0}"][data-c="${c0}"]`), 'd'); }
    [r, c] = TB.owner(tb, r, c);
    cell = [r, c];
    placeCaret(el.closest('table').querySelector(`[data-r="${r}"][data-c="${c}"]`), null);
  }
  // المجموع بيتحدّث وإنت بتكتب الرقم
  function liveSum(root, b, c) { if (!(b.sum || []).includes(c)) return; const x = root.querySelector(`.nt-sumr [data-sc="${c}"] b`); if (x) x.textContent = fmtNum(TB.total(b, c)); }
  function tableOp(b, a, r, c) {
    if (a === 'mh') return TB.merge(b, r, c, 'h');
    if (a === 'mv') return TB.merge(b, r, c, 'v');
    if (a === 'split') return TB.split(b, r, c);
    if (a === 'sortA' || a === 'sortD') { const e = TB.sort(b, c, a === 'sortD'); if (!e) toast(a === 'sortA' ? 'اترتّب من الصغير للكبير' : 'اترتّب من الكبير للصغير'); return e; }
    if (a === 'sum') { TB.sum(b, c); toast((b.sum || []).includes(c) ? 'العمود ده بيتجمع تحت' : 'شلت المجموع'); return null; }
  }
  const syncCell = el => { const tb = get(el.closest('.nt-b')?.dataset.id); if (tb && tb.rows) tb.rows[+el.dataset.r][+el.dataset.c] = clean(el); };
  // دوسة برّه الجدول (تحته أو جنبه) أو في الفاضي تحت الدفتر: بتكتب سطر عادي
  function textAfter(bid) {
    const i = idx(bid); let nx = B[i + 1];
    if (!nx || NOTXT.includes(nx.type)) { nx = { id: nid(), type: 'p', text: '', indent: 0 }; B.splice(i + 1, 0, nx); cur = nx.id; draw(nx.id, 0); save(); remember(); return; }
    cur = nx.id; placeCaret(doc.querySelector(`[data-id="${nx.id}"] .nt-tx`), null);
  }
  doc.addEventListener('click', e => {
    if (e.target.closest('button, a, th, td, .nt-tx, .nt-fork, .nt-ts, .nt-img')) return;
    const tbl = e.target.closest('.nt-table');
    if (tbl) return textAfter(tbl.dataset.id);
    if (e.target === doc) {   // الفاضي تحت آخر سطر
      const last = B[B.length - 1], box = doc.lastElementChild === forkBtn ? doc.children[doc.children.length - 2] : doc.lastElementChild;
      if (box && e.clientY > box.getBoundingClientRect().bottom) { if (NOTXT.includes(last.type)) return textAfter(last.id); cur = last.id; placeCaret(doc.querySelector(`[data-id="${last.id}"] .nt-tx`), null); }
    }
  });

  // ---------- تكبير الصف أو العمود بإيدك ----------
  doc.addEventListener('pointerdown', e => { if (e.target.closest('button[data-a]')) e.preventDefault(); });
  function onGrip(e) {
    if (e.target.closest('button[data-ta]')) { e.preventDefault(); return; }
    const g = e.target.closest('.nt-rgrip, .nt-cgrip'); if (!g) return;
    e.preventDefault();
    const blk = g.closest('[data-id]'), b = get(blk.dataset.id), tableEl = blk.querySelector('table');
    const isRow = g.classList.contains('nt-rgrip'), k = +(isRow ? g.dataset.rg : g.dataset.cg);
    const tr = isRow ? g.closest('tr') : null, colEl = isRow ? null : tableEl.querySelectorAll('col')[k + 1];
    const start = isRow ? tr.offsetHeight : b.cw[k], x0 = e.clientX, y0 = e.clientY, rtl = getComputedStyle(blk).direction === 'rtl';
    g.classList.add('drag'); try { g.setPointerCapture(e.pointerId); } catch (_) {}
    const move = ev => {
      if (isRow) { const h = Math.max(MINH, Math.round(start + ev.clientY - y0)); tr.style.height = h + 'px'; (b.rh ||= [])[k] = h; }
      else { const w = Math.max(MINW, Math.round(start + (rtl ? x0 - ev.clientX : ev.clientX - x0))); colEl.style.width = w + 'px'; b.cw[k] = w; const W = 30 + b.cw.reduce((s, v) => s + v, 0); tableEl.style.width = W + 'px'; tableEl.style.setProperty('--tw', W + 'px'); }
    };
    const up = () => { g.classList.remove('drag'); g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); save(); };
    g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
  }

  // ---------- محرر الجدول: بيفتح على الشاشة كلها، الصف الأول وعمود الأرقام ثابتين وإنت بتتحرك ----------
  let TE = null;
  function openTable(bid, rc) {
    const b = get(bid); if (!b) return;
    syncText(); closeTable(true); showPanel('', true); remember();
    cur = bid;
    const ov = document.createElement('div');
    ov.className = 'nt-ted'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'تعديل الجدول');
    ov.innerHTML = `<div class="nt-ted-hd"><button type="button" class="nt-ted-x" data-ta="del" aria-label="امسح الجدول">🗑</button><b>الجدول</b><span class="mut nt-ted-sz"></span><span style="flex:1"></span><button type="button" class="nt-ted-x" data-ta="undo" aria-label="تراجع">${svg(I.undo)}</button><button type="button" class="nt-ted-x" data-ta="redo" aria-label="إعادة">${svg(I.redo)}</button><button type="button" class="nt-ted-ok" data-ta="done">تم</button></div>
      <div class="nt-ted-sc" data-id="${b.id}"></div>
      <div class="nt-ted-bar">
        <div class="nt-row nt-dots nt-ted-cols" hidden><span class="mut nt-plab">لون الصف</span>${dots('color', '').replace(/data-a="color"/g, 'data-ta="color"')}</div>
        <div class="nt-row">
          <button type="button" data-ta="row+">+ صف</button><button type="button" data-ta="col+">+ عمود</button>
          <button type="button" data-ta="row-">− صف</button><button type="button" data-ta="col-">− عمود</button>
          <button type="button" data-ta="mh">⇠ ادمج مع اللي جنبها</button><button type="button" data-ta="mv">⇣ ادمج مع اللي تحتها</button><button type="button" data-ta="split">افصل</button>
          <button type="button" data-ta="sortA">رتّب ↑</button><button type="button" data-ta="sortD">رتّب ↓</button><button type="button" data-ta="sum">Σ اجمع العمود</button>
          <button type="button" data-ta="pal">🎨 لون</button><button type="button" data-ta="fit">رجّع المقاسات</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    dock.hidden = true;
    TE = { b, ov, sc: ov.querySelector('.nt-ted-sc'), cell: rc || [0, 0] };
    ov.addEventListener('pointerdown', e => { if (e.target.closest('button')) e.preventDefault(); onGrip(e); });
    ov.addEventListener('input', e => { const el = e.target; if (!el.matches('th,td')) return; b.rows[+el.dataset.r][+el.dataset.c] = clean(el); liveSum(ov, b, +el.dataset.c); save(); });
    ov.addEventListener('focusin', e => { const el = e.target; if (!el.matches('th,td')) return; TE.cell = [+el.dataset.r, +el.dataset.c]; markCell(); });
    ov.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); return closeTable(); }
      const el = e.target; if (!el.matches('th,td')) return;
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {   // إنتر = الخانة اللي تحتها (ولو آخر صف: صف جديد)
        e.preventDefault(); const [r, c] = TE.cell, nc = b.rows[0].length;
        if (c + 1 < nc) focusCell(r, c + 1);
        else if (r + 1 < b.rows.length) focusCell(r + 1, 0);
        else { remember(); TB.rowIns(b, b.rows.length); paintT([r + 1, 0]); save(); remember(); }
      }
    });
    ov.addEventListener('click', e => { const btn = e.target.closest('button[data-ta]'); if (btn) { e.preventDefault(); tAct(btn.dataset.ta, btn); } });
    paintT(TE.cell);
    requestAnimationFrame(() => ov.classList.add('in'));
    fitTE();
  }
  function paintT(rc) {
    if (!TE) return;
    TE.sc.innerHTML = tableHtml(TE.b, true);
    TE.ov.querySelector('.nt-ted-sz').textContent = `${TE.b.rows.length} صف · ${TE.b.rows[0].length} عمود`;
    if (rc) focusCell(rc[0], rc[1]);
  }
  function focusCell(r, c) {
    if (!TE) return;
    const el = TE.sc.querySelector(`[data-r="${r}"][data-c="${c}"]`); if (!el) return;
    TE.cell = [r, c]; placeCaret(el, null); markCell();
    const box = el.getBoundingClientRect(), sb = TE.sc.getBoundingClientRect();
    if (box.bottom > sb.bottom - 10 || box.top < sb.top + 40) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function markCell() {
    if (!TE) return; const [r, c] = TE.cell;
    TE.sc.querySelectorAll('.nt-on-r,.nt-on-c').forEach(x => x.classList.remove('nt-on-r', 'nt-on-c'));
    TE.sc.querySelectorAll(`tr.nt-row-t`)[r]?.classList.add('nt-on-r');
    TE.sc.querySelectorAll(`[data-c="${c}"]`).forEach(x => x.classList.add('nt-on-c'));
    const col = (TE.b.rc || [])[r] || '';
    TE.ov.querySelectorAll('[data-ta=color]').forEach(d => d.classList.toggle('on', d.dataset.col === col));
  }
  function tAct(a, btn) {
    if (!TE) return;
    const b = TE.b, R = b.rows, cols = R[0].length; let [r, c] = TE.cell;
    if (a === 'done') return closeTable();
    if (a === 'undo' || a === 'redo') {
      remember(); const bid = b.id;
      if (a === 'undo' ? hi <= 0 : hi >= hist.length - 1) return;
      hi += a === 'undo' ? -1 : 1; B = JSON.parse(hist[hi]); paintUndo(); keepHist();
      const nb = get(bid); if (!nb) { closeTable(true); draw(); save(); return; }
      TE.b = nb; const rr = Math.min(r, nb.rows.length - 1), cc = Math.min(c, nb.rows[0].length - 1);
      paintT([rr, cc]); dirty = true; clearTimeout(saveT); saveT = setTimeout(flush, 700); return;
    }
    if (a === 'pal') { const p = TE.ov.querySelector('.nt-ted-cols'); p.hidden = !p.hidden; btn.classList.toggle('on', !p.hidden); fitTE(); return; }
    if (a === 'del') { const i = idx(b.id); closeTable(true); B.splice(i, 1); if (!B.length) B.push({ id: nid(), type: 'p', text: '', indent: 0 }); cur = B[Math.max(0, i - 1)].id; draw(); save(); return toast('الجدول اتمسح', () => undo()); }
    remember();
    if (a === 'row+') { TB.rowIns(b, r + 1); r++; }
    else if (a === 'col+') { TB.colIns(b, c + 1); c++; }
    else if (a === 'row-') { if (!TB.rowDel(b, r)) return; r = Math.max(0, r - 1); }
    else if (a === 'col-') { if (!TB.colDel(b, c)) return; c = Math.max(0, c - 1); }
    else if (['mh', 'mv', 'split', 'sortA', 'sortD', 'sum'].includes(a)) { const err = tableOp(b, a, r, c); if (err) return toast(err); [r, c] = TB.owner(b, r, c); }
    else if (a === 'color') { (b.rc ||= [])[r] = btn.dataset.col || ''; }
    else if (a === 'fit') { b.cw = Array(cols).fill(COLW); b.rh = []; }
    paintT([r, c]); save(); remember();
  }
  function closeTable(silent) {
    if (!TE) return;
    const bid = TE.b.id; TE.ov.remove(); TE = null;
    if (!dead && visible) dock.hidden = false;
    if (!silent) { document.activeElement?.blur(); draw(); save(); setTimeout(() => doc.querySelector(`[data-id="${bid}"]`)?.scrollIntoView({ block: 'center' }), 30); }
  }
  // المحرر بياخد الجزء الظاهر من الشاشة بس (فوق الكيبورد)
  function fitTE() { if (!TE) return; const v = window.visualViewport; TE.ov.style.top = (v ? v.offsetTop : 0) + 'px'; TE.ov.style.height = (v ? v.height : innerHeight) + 'px'; }

  // ---------- الفهرس والبحث ----------
  function paintToc() {
    const box = dock.querySelector('.nt-toc'), hs = B.filter(b => LV[b.type] && (b.text || '').trim());
    box.innerHTML = hs.length ? hs.map(b => `<button type="button" class="nt-toc-${b.type}" data-a="goto" data-bid="${b.id}">${esc(b.text)}</button>`).join('') : '<div class="mut" style="padding:6px">لما تكتب عناوين وأقسام، هتظهر هنا.</div>';
  }
  let hits = [], hitI = 0;
  function runFind(jump) {
    const q = dock.querySelector('.nt-q').value.trim().toLowerCase();
    doc.querySelectorAll('.nt-hit').forEach(x => x.classList.remove('nt-hit', 'nt-hit-on'));
    hits = q ? B.filter(b => ((b.text || '') + ' ' + (b.rows ? b.rows.flat().join(' ') : '')).toLowerCase().includes(q)).map(b => b.id) : [];
    dock.querySelector('.nt-qn').textContent = q ? (hits.length ? `${Math.min(hitI + 1, hits.length)} من ${hits.length}` : 'مفيش') : '';
    for (const h of hits) doc.querySelector(`[data-id="${h}"]`)?.classList.add('nt-hit');
    if (jump && hits.length) goHit();
  }
  function goHit() {
    hitI = (hitI + hits.length) % hits.length;
    const bid = hits[hitI];
    // لو جوه قسم مطوي، نفتحه
    let k = idx(bid), opened = false; for (let i = k - 1; i >= 0; i--) if (LV[B[i].type] && B[i].fold) { B[i].fold = false; opened = true; }
    if (opened) draw();
    doc.querySelectorAll('.nt-hit-on').forEach(x => x.classList.remove('nt-hit-on'));
    const el = doc.querySelector(`[data-id="${bid}"]`); if (!el) return;
    el.classList.add('nt-hit', 'nt-hit-on'); el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    dock.querySelector('.nt-qn').textContent = `${hitI + 1} من ${hits.length}`;
  }
  dock.querySelector('.nt-q').addEventListener('input', () => { hitI = 0; runFind(true); });
  dock.querySelector('.nt-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); hitI++; goHit(); } });

  // ---------- الخريطة الذهنية ----------
  // الخريطة الذهنية: بتتبني من الدفتر، ودوسة على أي فرع بتعدّل اسمه أو تضيف تحته أو تمسحه (والدفتر بيتعدّل معاها)
  function mapTree() {
    const h1 = B.find(b => b.type === 'h1' && (b.text || '').trim());
    const title = (h1 || {}).text || row?.title || 'الدفتر';
    const root = { text: title, kids: [], lv: 0, bid: h1 ? h1.id : null }, stack = [root];
    const nodeOf = b => ({ text: b.type === 'table' ? `جدول (${b.rows.length - 1} صف)` : b.type === 'img' ? '📷 صورة' : (b.text || '').trim(), c: b.c, kind: b.type, kids: [], lv: LV[b.type] || 9, ind: b.indent || 0, bid: b.id });
    let lastHead = root;
    for (const b of B) {
      if (b.type === 'hr' || (b.type !== 'table' && b.type !== 'img' && !(b.text || '').trim()) || (h1 && b.id === h1.id)) continue;
      if (LV[b.type]) { while (stack.length > 1 && stack[stack.length - 1].lv >= LV[b.type]) stack.pop(); const n = nodeOf(b); stack[stack.length - 1].kids.push(n); stack.push(n); lastHead = n; }
      else {
        const n = nodeOf(b); let parent = lastHead;
        const under = parent.kids.filter(x => x.lv === 9);
        for (let d = n.ind; d > 0 && under.length; d--) { const p = [...under].reverse().find(x => x.ind < n.ind); if (p) { parent = p; break; } }
        parent.kids.push(n);
      }
    }
    return root;
  }
  // نهاية "حتة" السطر: العنوان لحد العنوان اللي بعده من نفس المستوى، والسطر لحد آخر فروعه
  const spanEnd = i => { const t = B[i]; let e = i + 1; if (LV[t.type]) { while (e < B.length && !(LV[B[e].type] && LV[B[e].type] <= LV[t.type])) e++; } else { const k = t.indent || 0; while (e < B.length && !LV[B[e].type] && !NOTXT.includes(B[e].type) && (B[e].indent || 0) > k) e++; } return e; };
  function openMap() {
    syncText();
    const short = t => t.length > 60 ? t.slice(0, 58) + '…' : t;
    const tree = n => `<li><button type="button" class="mm-n mm-${n.kind || 'root'}${n.c ? ' nt-c-' + n.c : ''}" data-bid="${n.bid || ''}">${esc(short(n.text))}</button>${n.kids.length ? `<ul>${n.kids.map(tree).join('')}</ul>` : ''}</li>`;
    const ov = document.createElement('div');
    ov.className = 'nt-map';
    ov.innerHTML = `<div class="nt-map-hd"><b>🧠 خريطة الدفتر</b><span class="mut nt-map-tip">دوس على أي فرع عشان تعدّله</span><button type="button" class="rb" data-m="close" aria-label="اقفل">${ic('x', 20)}</button></div>
      <div class="nt-map-sc"><ul class="mm"></ul></div>
      <div class="nt-map-ed" hidden><input class="inp" aria-label="اسم الفرع"><div class="nt-row"><button type="button" data-m="save" class="nt-map-ok">احفظ الاسم</button><button type="button" data-m="kid">+ فرع تحته</button><button type="button" data-m="del" class="bad">امسحه</button><button type="button" data-m="x">إلغاء</button></div></div>`;
    const ul = ov.querySelector('.mm'), ed = ov.querySelector('.nt-map-ed'), inp = ed.querySelector('input');
    let sel = null;
    const paint = () => { ul.innerHTML = tree(mapTree()); if (sel) ul.querySelector(`[data-bid="${sel}"]`)?.classList.add('on'); };
    const pick = bid => { sel = bid; const t = get(bid); ed.hidden = !t; if (!t) return; inp.value = t.type === 'table' || t.type === 'img' ? '' : t.text || ''; inp.disabled = t.type === 'table' || t.type === 'img'; paint(); };
    const commit = () => { draw(); save(); remember(); paint(); };
    ov.addEventListener('click', e => {
      const n = e.target.closest('.mm-n'); if (n) { if (n.dataset.bid) pick(n.dataset.bid); else toast('اكتب عنوان (العنوان الكبير) في أول الدفتر عشان تعدّله من هنا'); return; }
      const m = e.target.closest('[data-m]'); if (!m) return;
      const act = m.dataset.m;
      if (act === 'close') { ov.remove(); return; }
      if (act === 'x') { sel = null; ed.hidden = true; paint(); return; }
      const t = get(sel); if (!t) return;
      remember();
      if (act === 'save') { const v = inp.value.trim(); if (!v || inp.disabled) return; t.text = v; t.html = esc(v); commit(); toast('اتعدّل'); }
      else if (act === 'kid') {
        const i = idx(t.id), e2 = spanEnd(i), v = 'فرع جديد';
        let nb;
        if (LV[t.type]) { let j = i + 1; while (j < e2 && !LV[B[j].type]) j++; nb = { id: nid(), type: 'li', text: v, indent: 0 }; B.splice(j, 0, nb); }
        else { nb = { id: nid(), type: 'arrow', text: v, indent: Math.min(MAXI, (t.indent || 0) + 1), c: BRANCH[(t.indent || 0) % BRANCH.length] }; B.splice(e2, 0, nb); }
        commit(); pick(nb.id); inp.select();
      } else if (act === 'del') {
        const i = idx(t.id), n2 = spanEnd(i) - i; B.splice(i, n2); if (!B.length) B.push({ id: nid(), type: 'h1', text: '', indent: 0 });
        sel = null; ed.hidden = true; commit(); toast(n2 > 1 ? `اتمسح هو واللي تحته (${n2})` : 'اتمسح', () => { undo(); paint(); });
      }
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ed.querySelector('[data-m=save]').click(); } });
    paint();
    document.body.appendChild(ov);
  }


  // ---------- PDF ----------
  function pdf() {
    syncText();
    const olc = {};
    const body = B.map(b => {
      const k = b.indent || 0, pad = `padding-right:${k * 18}px;`, colr = b.c ? `color:${PRINTC[b.c]};` : '';
      if (b.type !== 'ol') for (const x of Object.keys(olc)) if (+x >= k) delete olc[x];
      const t = b.html != null ? sanitize(b.html) : esc(b.text || ''), ts = b.t != null ? `<span style="font:10pt monospace;background:#FBE7B5;padding:0 5px;border-radius:4px;margin-left:6px">${b.vn ? 'فيديو ' + b.vn + ' · ' : ''}${mmss(b.t)}</span>` : '';
      if (b.type === 'hr') return '<hr style="border:0;border-top:1px solid #999;margin:12px 0">';
      if (b.type === 'img') return `<div style="margin:8px 0">${ts}<img src="${esc(b.src)}" style="width:${b.w || 60}%;border-radius:6px"></div>`;
      if (b.type === 'table') return `<table style="border-collapse:collapse;margin:8px 0;width:100%">${b.rows.map((r, ri) => `<tr style="${(b.rc || [])[ri] ? 'background:' + PRINTC[b.rc[ri]] + '22' : ''}">${r.map(c => `<${ri ? 'td' : 'th'} style="border:1px solid #999;padding:5px 7px;text-align:right;vertical-align:top">${esc(c)}</${ri ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>`;
      if (b.type === 'h1') return `<h1 style="font:700 20pt 'Reem Kufi',sans-serif;margin:4px 0 10px;${colr}">${t}</h1>`;
      if (b.type === 'h2') return `<h2 style="font:600 15pt 'Reem Kufi',sans-serif;margin:16px 0 6px;border-bottom:1px solid #ccc;${colr}">${t}</h2>`;
      if (b.type === 'h3') return `<h3 style="font-size:12.5pt;margin:12px 0 4px;${colr}">${t}</h3>`;
      if (b.type === 'note') return `<div style="${pad}margin:6px 0;padding:6px 10px;border-right:3px solid #F0A202;background:#FFF8E5">${(NOTE[b.kind] || NOTE.warn)[0]} ${ts}${t}</div>`;
      const mark = b.type === 'li' ? '• ' : b.type === 'ol' ? `${(olc[k] = (olc[k] || 0) + 1)}. ` : b.type === 'todo' ? (b.done || (b.task && TASKS[b.task]?.done) ? '☑ ' : '☐ ') : b.type === 'arrow' ? '↲ ' : '';
      return `<p style="margin:3px 0;${pad}${colr}">${ts}${mark}${t}</p>`;
    }).join('');
    printHtml(`<h1 style="font-size:11pt;color:#666;font-weight:400;margin:0 0 6px">دفتر: ${esc(row?.title || '')}</h1>${body}`);
  }

  // ---------- تراجع / إعادة ----------
  function undo() { syncText(); remember(); if (hi <= 0) return; hi--; B = JSON.parse(hist[hi]); if (!get(cur)) cur = B[0].id; draw(cur, null); save(); hi = Math.min(hi, hist.length - 1); clearTimeout(histT); paintUndo(); keepHist(); }
  function redo() { if (hi >= hist.length - 1) return; hi++; B = JSON.parse(hist[hi]); if (!get(cur)) cur = B[0].id; draw(cur, null); dirty = true; clearTimeout(saveT); saveT = setTimeout(flush, 700); paintUndo(); keepHist(); }

  // ---------- الأزرار ----------
  dock.addEventListener('pointerdown', e => { if (e.target.closest('button')) e.preventDefault(); });
  forkBtn.addEventListener('pointerdown', e => e.preventDefault());
  host.querySelector('.nt-add').addEventListener('pointerdown', e => e.preventDefault());
  // اختيار مقاس الجدول: تدوس أو تسحب صباعك على المربعات، والمقاس مكتوب كبير فوق، وبعدين "اعمل الجدول"
  const gp = dock.querySelector('.nt-gp'), glab = dock.querySelector('.nt-glab'), gok = dock.querySelector('.nt-gok');
  const word = (k, one, two, few, many) => k === 1 ? one : k === 2 ? two : k <= 10 ? `${k} ${few}` : `${k} ${many}`;
  const markGrid = (r, c) => {
    gp.querySelectorAll('span').forEach(x => x.classList.toggle('on', +x.dataset.gr <= r && +x.dataset.gc <= c));
    glab.textContent = r ? `${word(r, 'صف واحد', 'صفين', 'صفوف', 'صف')} × ${word(c, 'عمود واحد', 'عمودين', 'أعمدة', 'عمود')}` : 'اسحب صباعك على المربعات';
    gok.disabled = !r; gok.dataset.r = r; gok.dataset.c = c; gok.textContent = r ? `اعمل الجدول (${r} × ${c})` : 'اختار المقاس الأول';
  };
  const cellAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest && el.closest('.nt-gp span'); };
  gp.addEventListener('pointerdown', e => {
    e.preventDefault(); try { gp.setPointerCapture(e.pointerId); } catch (_) {}
    const pick = ev => { const x = cellAt(ev); if (x) markGrid(+x.dataset.gr, +x.dataset.gc); };
    pick(e);
    const up = () => { gp.removeEventListener('pointermove', pick); gp.removeEventListener('pointerup', up); gp.removeEventListener('pointercancel', up); };
    gp.addEventListener('pointermove', pick); gp.addEventListener('pointerup', up); gp.addEventListener('pointercancel', up);
  });

  async function onAct(btn) {
    const a = btn.dataset.a, cmd = btn.dataset.cmd;
    if (fork && a === 'forkok') return commitFork();
    if (fork && a === 'forkx') { const p = fork.pid; closeFork(); return placeCaret(doc.querySelector(`[data-id="${p}"] .nt-tx`), null); }
    if (fork && a === 'forkcol') { fork.col = btn.dataset.col; fork.box.className = `nt-fork in nt-c-${fork.col}`; fork.box.querySelectorAll('.nt-dot').forEach(d => d.classList.toggle('on', d === btn)); return placeCaret(fork.box.querySelector('.nt-fork-in'), null); }
    if (a === 'panel') return showPanel(btn.dataset.p);
    if (a === 'tmore') { const m = dock.querySelector('.nt-tm'); m.hidden = !m.hidden; btn.classList.toggle('on', !m.hidden); return place(); }
    if (a === 'topen') { const tid = btn.dataset.bid || (get(cur)?.type === 'table' ? cur : null); if (tid) openTable(tid, btn.dataset.bid ? [0, 0] : cell || [0, 0]); return; }
    if (a === 'photo') { showPanel('', true); return pickPhoto(); }
    if (a === 'docx') { showPanel('', true); syncText(); try { const { saveDocx } = await import('./docx.js'); await saveDocx(row?.title || 'الدفتر', B, TASKS); } catch (e) { console.error(e); toast('ما اتعملش الملف، جرّب تاني'); } return; }
    if (a === 'go') { const el = document.activeElement; if (el && el.matches('th,td') && doc.contains(el)) goCell(el, btn.dataset.d); return; }
    if (a === 'kb') { document.activeElement?.blur(); return showPanel('', true); }
    if (a === 'undo') return undo();
    if (a === 'redo') return redo();
    if (cmd) {   // عريض، مائل، تحته خط، عليه خط، هايلايتر
      const b = get(cur); if (!b || b.type === 'table' || b.type === 'hr') return;
      const el = doc.querySelector(`[data-id="${b.id}"] .nt-tx`); if (!el) return;
      if (document.activeElement !== el) placeCaret(el, null);
      if (cmd === 'hilite') {
        const sel = getSelection(); let inMark = false; let n = sel.anchorNode; while (n && n !== el) { if (n.nodeName === 'MARK' || (n.style && /background/.test(n.getAttribute?.('style') || ''))) inMark = true; n = n.parentNode; }
        document.execCommand('styleWithCSS', false, true); document.execCommand('hiliteColor', false, inMark ? 'transparent' : '#FBE7B5'); document.execCommand('styleWithCSS', false, false);
      } else document.execCommand(cmd, false, null);
      b.html = el.innerHTML; b.text = clean(el); paintCmds(); return save();
    }
    syncText();
    let b = get(cur) || B[B.length - 1]; const i = idx(b.id);
    const el = doc.querySelector(`[data-id="${b.id}"] .nt-tx`), pos = el && document.activeElement === el ? caretOffset(el) : null;
    const keepCell = b.type === 'table' ? cell : null;
    remember();
    if (btn.dataset.t) {
      if (NOTXT.includes(b.type)) { b = after(b, { id: nid(), type: 'p', text: '', indent: 0 }); cur = b.id; }
      const t = btn.dataset.t;
      if (b.type === t && ['li', 'ol', 'todo'].includes(t)) b.type = 'p';   // نفس الزرار تاني = يرجع نص
      else { if (['h1', 'h2'].includes(t)) b.indent = 0; if (b.type === 'arrow') delete b.c; delete b.kind; b.type = t; }
      draw(b.id, pos); return save();
    }
    if (a === 'fork') { if (NOTXT.includes(b.type)) return toast('الفرع بيبقى من سطر كلام'); return openFork(b.id); }
    if (a === 'color') {
      const c = btn.dataset.col || '';
      if (b.type === 'table') { const r = cell ? cell[0] : b.rows.length - 1; (b.rc ||= [])[r] = c; draw(b.id, null, cell || [r, 0]); }
      else { if (c) b.c = c; else delete b.c; draw(b.id, pos); }
      return save();
    }
    if (a === 'imgw') { if (b.type !== 'img') return; b.w = +btn.dataset.w; draw(); doc.querySelector(`[data-id="${b.id}"]`)?.classList.add('nt-sel'); save(); remember(); return paintBar(); }
    if (a === 'note') { if (NOTXT.includes(b.type)) return; b.type = 'note'; b.kind = btn.dataset.k; draw(b.id, pos); return save(); }
    if (a === 'fs') { FS = Math.max(13, Math.min(24, FS + Number(btn.dataset.d))); doc.style.setProperty('--ntfs', FS + 'px'); dock.querySelector('.nt-fsv').textContent = FS; dirty = true; return save(); }
    if (a === 'in') { b.indent = Math.min(MAXI, (b.indent || 0) + 1); draw(b.id, pos, keepCell); }
    else if (a === 'out') { b.indent = Math.max(0, (b.indent || 0) - 1); if (b.type === 'arrow' && !b.indent) { b.type = 'p'; delete b.c; } draw(b.id, pos, keepCell); }
    else if (a === 'add') { const nb = { id: nid(), type: 'p', text: '', indent: 0 }; B.push(nb); cur = nb.id; draw(nb.id, 0); }
    else if (a === 'hr') { after(b, { id: nid(), type: 'hr' }); const nb = { id: nid(), type: 'p', text: '', indent: 0 }; B.splice(idx(b.id) + 2, 0, nb); cur = nb.id; showPanel('', true); draw(nb.id, 0); }
    else if (a === 'mktable') {
      const r = +btn.dataset.r, c = +btn.dataset.c;
      const tb = after(b, { id: nid(), type: 'table', indent: 0, rows: Array.from({ length: r }, () => Array(c).fill('')), cw: Array(c).fill(COLW), rh: [], rc: [] });
      if (idx(tb.id) === B.length - 1) B.push({ id: nid(), type: 'p', text: '', indent: 0 });
      markGrid(0, 0); cur = tb.id; showPanel('', true); draw(); save(); remember(); return openTable(tb.id, [0, 0]);
    } else if (a === 'time') {
      const tm = now && now(); if (tm == null) return;
      const v = tm.v || null, vn = tm.vn || null;
      if (!NOTXT.includes(b.type) && !(b.text || '').trim()) Object.assign(b, { t: Math.floor(tm.t), v, vn });
      else b = after(b, { id: nid(), type: 'p', text: '', indent: NOTXT.includes(b.type) ? 0 : b.indent || 0, t: Math.floor(tm.t), v, vn });
      cur = b.id; draw(b.id, 0);
    } else if (a === 'fold' || a === 'check' || a === 'goto' || a === 'unref') {
      const t = get(btn.dataset.bid);
      if (a === 'fold' && t) { t.fold = !t.fold; draw(t.fold ? null : t.id, t.fold ? null : (t.text || '').length); }
      if (a === 'check' && t) {
        const now2 = !(t.task && TASKS[t.task] ? TASKS[t.task].done : t.done); t.done = now2;
        if (t.task && TASKS[t.task]) { TASKS[t.task].done = now2; upd('tasks', t.task, { done: now2 }).catch(() => {}); }
        draw();
      }
      if (a === 'goto' && t) { let k = idx(t.id); for (let x = k - 1; x >= 0; x--) if (LV[B[x].type] && B[x].fold) B[x].fold = false; showPanel('', true); draw(t.id, null); doc.querySelector(`[data-id="${t.id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      if (a === 'unref' && t) { t.refs.splice(+btn.dataset.i, 1); draw(); }
    } else if (a === 'link') {
      if (b.type === 'hr') return;
      showPanel('', true); openLinkSheet();
      return;
    } else if (a === 'tasknow') {
      if (NOTXT.includes(b.type) || !(b.text || '').trim()) return toast('اكتب السطر الأول');
      if (b.task) return toast('السطر ده مهمة بالفعل');
      try {
        const t = await ins('tasks', { title: b.text.trim(), due_on: today() });
        await link('task', t.id, owner, id).catch(() => {});
        TASKS[t.id] = t; b.task = t.id; b.type = 'todo'; showPanel('', true); draw(b.id, pos); toast('اتعملت مهمة في النهاردة');
      } catch (e) { return toast('ما اتعملتش، جرّب تاني'); }
    } else if (a === 'lesson') {
      if (NOTXT.includes(b.type) || !(b.text || '').trim()) return toast('اكتب السطر الأول');
      if (b.lesson) return toast('السطر ده في "اتعلمت إيه" بالفعل');
      try { const L = await ins('learnings', { source_type: owner, source_id: id, text: b.text.trim(), status: 'new' }); b.lesson = L.id; showPanel('', true); draw(b.id, pos); toast('اتحط في "اتعلمت إيه". بعد أسبوعين هسألك طبّقته ولا لأ'); }
      catch (e) { return toast('ما اتحطش، جرّب تاني'); }
    } else if (a === 'tpl') {
      const T = [['h2', 'الفكرة الرئيسية'], ['p', ''], ['h2', 'أهم 3 دروس'], ['ol', ''], ['ol', ''], ['ol', ''], ['h2', 'هطبّق إيه في الشغل'], ['todo', ''], ['h2', 'أسئلة عايز أدوّر عليها'], ['note', '', 'q']];
      const made = T.map(([t, x, k]) => ({ id: nid(), type: t, text: x, indent: 0, ...(k ? { kind: k } : {}) }));
      B.splice(i + 1, 0, ...made); cur = made[1].id; showPanel('', true); draw(made[1].id, 0, null, made.map(m => m.id));
    } else if (a === 'foldall') {
      const hs = B.filter(x => x.type === 'h2'); const anyOpen = hs.some(x => !x.fold); hs.forEach(x => { x.fold = anyOpen; }); showPanel('', true); draw(); toast(anyOpen ? 'الأقسام اتطوت' : 'الأقسام اتفتحت');
    } else if (a === 'map') { showPanel('', true); return openMap(); }
    else if (a === 'pdf') { showPanel('', true); return pdf(); }
    else if (a === 'qprev' || a === 'qnext') { if (!hits.length) return; hitI += a === 'qnext' ? 1 : -1; return goHit(); }
    else if (a === 'up' && i > 0) { [B[i - 1], B[i]] = [B[i], B[i - 1]]; draw(b.id, pos, keepCell); }
    else if (a === 'down' && i < B.length - 1) { [B[i + 1], B[i]] = [B[i], B[i + 1]]; draw(b.id, pos, keepCell); }
    else if (a === 'del') {
      if (B.length === 1) { B[0] = { id: nid(), type: 'h1', text: '', indent: 0 }; cur = B[0].id; draw(cur, 0); }
      else { B.splice(i, 1); const p = B[Math.max(0, i - 1)]; cur = p.id; draw(p.id, null, p.type === 'table' ? [0, 0] : null); }
      toast('السطر اتمسح', () => undo());
    } else if (a === 'delsec') {
      // القسم = العنوان اللي إنت تحته + كل اللي تحته لحد العنوان اللي بعده من نفس المستوى أو أكبر
      let h = i; while (h >= 0 && !LV[B[h].type]) h--;
      if (h < 0) return toast('السطر ده مش تحت أي عنوان أو قسم');
      const lv = LV[B[h].type]; let e = h + 1; while (e < B.length && !(LV[B[e].type] && LV[B[e].type] <= lv)) e++;
      const n = e - h; B.splice(h, n); if (!B.length) B.push({ id: nid(), type: 'h1', text: '', indent: 0 });
      const p = B[Math.max(0, h - 1)]; cur = p.id; showPanel('', true); draw(p.id, null);
      toast(`اتمسح ${n === 1 ? 'سطر' : n === 2 ? 'سطرين' : n + ' سطور'}`, () => undo());
    } else if (a === 'rowat' || a === 'colat') {
      const tb = get(btn.closest('.nt-b').dataset.id), R = tb.rows, nc = R[0].length; cur = tb.id;
      if (a === 'rowat') { const r = +btn.dataset.r + 1; R.splice(r, 0, Array(nc).fill('')); (tb.rh ||= []).splice(r, 0, null); (tb.rc ||= []).splice(r, 0, (tb.rc || [])[r - 1] || ''); draw(tb.id, null, [r, 0]); }
      else { const c = +btn.dataset.c + 1; R.forEach(x => x.splice(c, 0, '')); tb.cw.splice(c, 0, COLW); draw(tb.id, null, [0, c]); }
    } else if (b.type === 'table') {
      const R = b.rows, cols = R[0].length; let [r, c] = cell || [R.length - 1, cols - 1];
      if (a === 'row+') { TB.rowIns(b, r + 1); draw(b.id, null, [r + 1, c]); }
      else if (a === 'col+') { TB.colIns(b, c + 1); draw(b.id, null, [r, c + 1]); }
      else if (a === 'row-') { if (TB.rowDel(b, r)) draw(b.id, null, [Math.max(0, r - 1), Math.min(c, b.rows[0].length - 1)]); }
      else if (a === 'col-') { if (TB.colDel(b, c)) draw(b.id, null, [r, Math.max(0, c - 1)]); }
      else if (a === 'fit') { b.cw = Array(cols).fill(COLW); b.rh = []; draw(b.id, null, [r, c]); }
      else if (['mh', 'mv', 'split', 'sortA', 'sortD', 'sum'].includes(a)) { const err = tableOp(b, a, r, c); if (err) return toast(err); [r, c] = TB.owner(b, r, c); cell = [r, c]; draw(b.id, null, [r, c]); }
    }
    save(); remember();   // كل خطوة لوحدها في "تراجع"
  }
  dock.addEventListener('click', e => { const btn = e.target.closest('button[data-a], button[data-t], button[data-cmd]'); if (btn) { e.preventDefault(); onAct(btn); } });
  host.addEventListener('click', e => { const btn = e.target.closest('button[data-a], .nt-add'); if (btn && host.contains(btn)) { e.preventDefault(); onAct(btn); } });

  // ---------- 📷 الصور: تختار صورة، تحدد حجمها، وبتترفع مصغّرة (عشان المساحة المجانية تكفي) ----------
  function pickPhoto() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) photoSheet(f); };
    inp.click();
  }
  async function shrink(file) {
    const url = URL.createObjectURL(file);
    try {
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      return await new Promise(res => c.toBlob(res, 'image/jpeg', 0.78));
    } finally { URL.revokeObjectURL(url); }
  }
  function photoSheet(file) {
    const at = now && now();
    let w = 60;
    const ov = document.createElement('div'); ov.className = 'nt-ph'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'ضيف صورة');
    const url = URL.createObjectURL(file);
    ov.innerHTML = `<div class="nt-ph-box"><div class="nt-ph-hd"><b>الصورة هتبقى قد إيه؟</b></div>
      <div class="nt-ph-pv"><div class="nt-ph-paper"><figure style="width:${w}%"><img src="${url}" alt=""></figure></div></div>
      <div class="nt-row nt-ph-sz">${IMGW.map(([x, l]) => `<button type="button" data-w="${x}"${x === w ? ' class="on"' : ''}>${l}</button>`).join('')}</div>
      ${at ? `<div class="mut nt-ph-t">⏱ هتتحط عند <span dir="ltr">${mmss(at.t)}</span>${at.vn ? ` في فيديو ${at.vn}` : ''}</div>` : ''}
      <div class="nt-ph-ft"><button type="button" data-x="no">إلغاء</button><button type="button" data-x="ok" class="nt-ph-ok">ضيفها</button></div></div>`;
    document.body.appendChild(ov);
    const close = () => { URL.revokeObjectURL(url); ov.remove(); };
    ov.addEventListener('click', async e => {
      if (e.target === ov) return close();
      const sz = e.target.closest('[data-w]');
      if (sz) { w = +sz.dataset.w; ov.querySelector('figure').style.width = w + '%'; ov.querySelectorAll('[data-w]').forEach(x => x.classList.toggle('on', x === sz)); return; }
      const x = e.target.closest('[data-x]'); if (!x) return;
      if (x.dataset.x === 'no') return close();
      const ok = ov.querySelector('.nt-ph-ok'); ok.disabled = true; ok.textContent = 'بترفع…';
      try {
        if (!sb) throw new Error('Supabase مش متوصّل');
        if (!navigator.onLine) throw new Error('محتاج نت عشان الصورة تترفع');
        const blob = await shrink(file);
        const { data } = await sb.auth.getSession(); const uid = data.session?.user?.id; if (!uid) throw new Error('لازم تكون داخل على النوتة');
        const path = `${uid}/${Date.now().toString(36)}-${nid()}${nid()}.jpg`;
        const up = await sb.storage.from('notes').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
        if (up.error) throw new Error(/bucket|not found/i.test(up.error.message) ? 'شغّل ملف SQL بتاع الدفعة دي الأول (مكان الصور)' : up.error.message);
        const src = sb.storage.from('notes').getPublicUrl(path).data.publicUrl;
        syncText(); remember();
        const b0 = get(cur) || B[B.length - 1];
        const ib = after(b0, { id: nid(), type: 'img', src, w, ...(at ? { t: Math.floor(at.t), v: at.v || null, vn: at.vn || null } : {}) });
        if (idx(ib.id) === B.length - 1) B.push({ id: nid(), type: 'p', text: '', indent: 0 });
        cur = ib.id; close(); draw(null, null, null, [ib.id]); save(); remember();
        doc.querySelector(`[data-id="${ib.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (err) { ok.disabled = false; ok.textContent = 'ضيفها'; toast('ما اترفعتش: ' + (err.message || 'جرّب تاني')); }
    });
  }

  // ---------- 🔗 اربط بحاجة في السيستم ----------
  function openLinkSheet() {
    openSheet('اربط السطر ده بـ', `<input class="inp" placeholder="دوّر على مهمة، هدف، فكرة، فرد، مشكلة، مشروع…" autofocus data-input="nt-lsearch"><div class="list" id="nt-lres"><div class="mut" style="padding:8px 0">اكتب كلمة وهتظهر النتايج.</div></div>`);
  }
  async function addRef(type, rid, title) {
    const b = get(cur); if (!b) return;
    (b.refs ||= []); if (b.refs.some(r => r.type === type && r.id === rid)) return toast('مربوط بالفعل');
    remember(); b.refs.push({ type, id: rid, title });
    await link(owner, id, type, rid).catch(() => {});   // والحاجة دي هيظهر فيها إنها مربوطة بالكورس
    draw(b.id, null); save(); toast('اتربط');
  }

  // ---------- الشريط فوق الكيبورد ----------
  // الشريط عايش جوه "إطار" قد الجزء الظاهر من الشاشة بالظبط، ولازق في آخره. لما الكيبورد يفتح الإطار بيقصر، فالشريط يطلع فوقه
  function place() {
    if (dead) return;
    const v = window.visualViewport;
    const top = v ? v.offsetTop : 0, h = v ? v.height : innerHeight;
    dock.style.top = top + 'px'; dock.style.height = h + 'px';
    dock.classList.toggle('kb', innerHeight - h > 140);
    fitTE();
  }
  let pb = 0;
  const placeSoon = () => { cancelAnimationFrame(pb); const t0 = performance.now(); const go = () => { place(); if (performance.now() - t0 < 800) pb = requestAnimationFrame(go); }; go(); };
  const vv = window.visualViewport;
  vv?.addEventListener('resize', placeSoon); vv?.addEventListener('scroll', place);
  window.addEventListener('scroll', place, { passive: true });
  document.addEventListener('focusin', placeSoon); document.addEventListener('focusout', placeSoon);
  place();

  draw(B.length === 1 && !B[0].text ? B[0].id : null);
  const onHide = () => { if (document.hidden) flush(); };
  onSync(t => { if (t === 'data' && !dead && !dirty) remoteIn(false).catch(() => {}); });
  document.addEventListener('visibilitychange', onHide);
  const inst = {
    flush, addRef,
    // من بره (المساعد): حط سطور في آخر الدفتر
    append(blocks) { remember(); const made = blocks.map(x => ({ id: nid(), indent: 0, ...x })); B.push(...made); cur = made[made.length - 1].id; draw(null, null, null, made.map(m => m.id)); doc.querySelector(`[data-id="${made[0].id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); save(); },
    show(on) { visible = on; dock.hidden = !on || !!TE; document.body.classList.toggle('nt-open', on); if (on) { ACTIVE = inst; place(); } },
    destroy() {
      dead = true; flush(); dock.remove(); document.body.classList.remove('nt-open');
      document.removeEventListener('visibilitychange', onHide); document.removeEventListener('selectionchange', onSel);
      vv?.removeEventListener('resize', placeSoon); vv?.removeEventListener('scroll', place);
      window.removeEventListener('scroll', place); document.removeEventListener('focusin', placeSoon); document.removeEventListener('focusout', placeSoon);
      closeTable(true);
      if (ACTIVE === inst) ACTIVE = null;
    },
  };
  ACTIVE = inst;
  return inst;
}

// شيت "اربط": بيدوّر في السيستم كله
export const notesGlobal = {
  async 'nt-lsearch'(inp) {
    const q = inp.value.trim(), box = document.getElementById('nt-lres'); if (!box) return;
    if (q.length < 2) { box.innerHTML = '<div class="mut" style="padding:8px 0">اكتب كلمة وهتظهر النتايج.</div>'; return; }
    const safe = q.replace(/[%,()]/g, ' ');
    const rows = (await list('v_search', { or: `title.ilike.%${safe}%,body.ilike.%${safe}%`, limit: 30 })).filter(r => KIND[r.kind]);
    box.innerHTML = rows.map(r => `<button class="lnk" data-act="nt-lmake" data-tt="${r.kind}" data-tid="${r.id}" data-title="${esc(r.title || '')}"><span class="k">${ic(KIND[r.kind][1], 18)}</span><span class="t"><small>${KIND[r.kind][0]}</small>${esc(r.title)}</span></button>`).join('') || '<div class="mut" style="padding:8px 0">مفيش نتايج.</div>';
  },
  async 'nt-lmake'(el) { closeSheet(); if (ACTIVE) await ACTIVE.addRef(el.dataset.tt, el.dataset.tid, el.dataset.title); },
};

// شكل الدفتر للقراية بس (في الدفتر العام): نفس الشكل من غير كتابة
const MM = s => mmss(s);
export function staticHtml(blocks, link) {
  const olc = {}; let out = '';
  for (const b of blocks || []) {
    const k = b.indent || 0, col = b.c ? ' nt-c-' + b.c : '';
    if (b.type !== 'ol') for (const q of Object.keys(olc)) if (+q >= k) delete olc[q];
    const ts = b.t != null && link ? `<a class="nt-ts" href="${link}${link.includes('?') ? '&' : '?'}t=${b.t}${b.v ? '&v=' + esc(b.v) : ''}">⏱ ${b.vn ? `فيديو ${b.vn} · ` : ''}<span dir="ltr">${MM(b.t)}</span></a>` : b.t != null ? `<span class="nt-ts">⏱ <span dir="ltr">${MM(b.t)}</span></span>` : '';
    if (b.type === 'hr') { out += '<div class="nt-b nt-hr"><hr></div>'; continue; }
    if (b.type === 'img') { out += `<div class="nt-b nt-img">${ts}<figure style="width:${b.w || 60}%"><img src="${esc(b.src)}" alt="" loading="lazy"></figure></div>`; continue; }
    if (b.type === 'table') {
      const own = TB.own(b), S = new Set(b.sum || []);
      out += `<div class="nt-b nt-table">${ts}<div class="nt-tw nt-inl"><table><tbody>${b.rows.map((r, ri) => `<tr class="${(b.rc || [])[ri] ? 'nt-c-' + b.rc[ri] : ''}">${r.map((x, ci) => { const m = own[`${ri},${ci}`]; if (m && (m.r !== ri || m.c !== ci)) return ''; const tg = ri ? 'td' : 'th'; return `<${tg}${m ? ` rowspan="${m.rs}" colspan="${m.cs}"` : ''}${S.has(ci) && ri ? ' class="nt-numc"' : ''}>${esc(x)}</${tg}>`; }).join('')}</tr>`).join('')}${S.size ? `<tr class="nt-sumr">${b.rows[0].map((_, ci) => `<td class="${S.has(ci) ? 'nt-numc' : ''}">${S.has(ci) ? `<b>${fmtNum(TB.total(b, ci))}</b>` : ''}</td>`).join('')}</tr>` : ''}</tbody></table></div></div>`;
      continue;
    }
    const pre = b.type === 'ol' ? `<span class="nt-num">${(olc[k] = (olc[k] || 0) + 1)}.</span>` : b.type === 'todo' ? `<span class="nt-chk${b.done ? ' on' : ''}">${b.done ? ic('check', 14) : ''}</span>` : b.type === 'note' ? `<span class="nt-nico">${(NOTE[b.kind] || NOTE.warn)[0]}</span>` : '';
    if (!(b.text || '').trim() && !pre) continue;
    out += `<div class="nt-b nt-${b.type}${b.type === 'note' ? ' nt-n-' + (b.kind || 'warn') : ''}${col}${b.type === 'todo' && b.done ? ' nt-done' : ''}" style="--ind:${Math.min(MAXI, k)}">${ts}<div class="nt-line">${pre}<div class="nt-tx">${inner(b)}</div></div></div>`;
  }
  return out;
}
const textOf = b => (b.text || '') + (b.rows ? ' ' + b.rows.flat().join(' ') : '');

// الدفتر العام: #/notebook — "دفتري" تكتب فيه على طول، و"من الكورسات" فيه كل اللي كتبته في دفاتر الكورسات والبودكاست
let gen = null, page = null;
async function generalRow() {
  let r = (await list('notebooks')).filter(x => !x.archived_at).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
  if (!r) r = await ins('notebooks', { title: 'دفتري', notes: { blocks: [{ id: nid(), type: 'h1', text: 'دفتري', indent: 0 }], fs: 16 } });
  return r;
}
async function sources() {
  const [cs, ms] = await Promise.all([list('courses').catch(() => []), list('media').catch(() => [])]);
  return [...cs.map(r => ({ r, k: 'c', kind: 'كورس' })), ...ms.map(r => ({ r, k: 'm', kind: r.kind === 'podcast' ? 'بودكاست' : 'كتاب/حلقة' }))]
    .filter(x => !x.r.archived_at && x.r.notes && (x.r.notes.blocks || []).some(b => (textOf(b) || '').trim() || b.type === 'img'))
    .sort((a, b) => String(b.r.notes.updated_at || '').localeCompare(String(a.r.notes.updated_at || '')));
}
const ago = iso => { if (!iso) return ''; const d = Math.round((Date.now() - Date.parse(iso)) / 864e5); return d <= 0 ? 'النهاردة' : d === 1 ? 'إمبارح' : d < 30 ? `من ${d} يوم` : new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' }); };
function allHtml(list2) {
  if (!list2.length) return '<div class="empty">لما تكتب في دفتر أي كورس أو بودكاست، هيظهر هنا.</div>';
  return list2.map(({ r, k, kind }) => {
    const bl = r.notes.blocks, n = bl.filter(b => (textOf(b) || '').trim()).length, wid = `${k}_${r.id}`;
    return `<details class="nb-src"><summary><span class="nb-k">${kind}</span><b>${esc(r.title)}</b><span class="mut">${n} سطر${r.notes.updated_at ? ' · ' + ago(r.notes.updated_at) : ''}</span></summary>
      <div class="nb-body"><div class="nt-doc nb-ro">${staticHtml(bl, null)}</div>
      <div class="nb-acts"><a class="btn sm" href="#/notes/${wid}">${ic('edit', 15)} اكتب في دفتره</a>${r.url ? `<a class="btn sm" href="#/watch/${wid}">▶ افتح الفيديو</a>` : ''}</div></div></details>`;
  }).join('');
}

export default {
  notebook: {
    keep: true,
    async render() {
      const src = await sources();
      return {
        title: 'الدفتر العام', sub: 'كل اللي بتكتبه في مكان واحد', noSearch: true,
        html: `<div class="nb">
          <div class="seg nb-tabs" role="tablist"><button type="button" class="on" data-act="nb-tab" data-v="mine">${ic('edit', 16)} دفتري</button><button type="button" data-act="nb-tab" data-v="all">من الكورسات <span class="nb-c">${src.length}</span></button></div>
          <input class="inp nb-q" type="search" placeholder="دوّر في كل الدفاتر…" data-input="nb-find" enterkeyhint="search">
          <div id="nbres" hidden></div>
          <div id="nbmine" class="nt-page"></div>
          <div id="nball" hidden>${allHtml(src)}</div>
        </div>`,
      };
    },
    async after(main) {
      const host = main.querySelector('#nbmine'); if (!host) return;
      if (gen && gen.host === host) return;
      if (gen) gen.inst.destroy();
      const r = await generalRow();
      gen = { host, id: r.id, inst: await mountNotes(host, { table: 'notebooks', id: r.id, label: 'دفترك العام: اكتب فيه أي حاجة على طول، وبيتحفظ لوحده' }) };
    },
    actions: {
      'nb-tab'(el) {
        const v = el.dataset.v;
        document.querySelectorAll('.nb-tabs button').forEach(b => b.classList.toggle('on', b === el));
        document.getElementById('nbmine').hidden = v !== 'mine'; document.getElementById('nball').hidden = v !== 'all';
        gen?.inst?.show?.(v === 'mine');
      },
      async 'nb-find'(inp) {
        const q = inp.value.trim().toLowerCase(), box = document.getElementById('nbres');
        if (q.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
        await gen?.inst?.flush?.();
        const mine = gen ? await one('notebooks', gen.id) : null;
        const all = [...(mine ? [{ r: mine, k: 'nb', kind: 'دفتري' }] : []), ...(await sources())];
        const hits = [];
        for (const { r, k, kind } of all) for (const b of (r.notes && r.notes.blocks) || []) { const t = textOf(b); if (t.toLowerCase().includes(q)) hits.push({ r, k, kind, t }); if (hits.length > 60) break; }
        const mark = t => { const i = t.toLowerCase().indexOf(q), a = Math.max(0, i - 40); return (a ? '…' : '') + esc(t.slice(a, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length, i + q.length + 60)) + '…'; };
        box.hidden = false;
        box.innerHTML = hits.length ? `<div class="mut nb-rn">${hits.length > 60 ? 'أكتر من 60' : hits.length} نتيجة</div>` + hits.map(h => `<a class="nb-hit" href="${h.k === 'nb' ? '#/notebook' : `#/notes/${h.k}_${h.r.id}`}"><span class="nb-k">${h.kind}</span><b>${esc(h.r.title || '')}</b><span>${mark(h.t)}</span></a>`).join('') : '<div class="empty">مفيش نتايج.</div>';
      },
    },
  },
  // صفحة الدفتر لوحدها (من غير فيديو): #/notes/c_<id> أو m_<id>
  notes: {
    keep: true,
    async render(p) {
      const k = (p.id || '').startsWith('m_') ? 'media' : 'courses', row = await one(k, (p.id || '').slice(2));
      return { title: row ? row.title : 'الدفتر', sub: 'الدفتر', back: '#/courses', noSearch: true, html: row ? `<div class="nt-page" data-nid="${esc(p.id)}"></div>` : '<div class="empty">مش موجود.</div>' };
    },
    async after(main, p) {
      const host = main.querySelector('.nt-page'); if (!host) return;
      if (page && page.host === host) return;
      if (page) page.inst.destroy();
      const k = p.id.startsWith('m_') ? 'media' : 'courses';
      page = { host, inst: await mountNotes(host, { table: k, id: p.id.slice(2), label: 'بيتحفظ لوحده وإنت بتكتب' }) };
    },
  },
};
window.addEventListener('hashchange', () => {
  if (page && !location.hash.startsWith('#/notes/')) { page.inst.destroy(); page = null; }
  if (gen && !location.hash.startsWith('#/notebook')) { gen.inst.destroy(); gen = null; }
});
