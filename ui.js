// أدوات العرض المشتركة
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const LOC = 'ar-EG-u-nu-latn';
export const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const today = () => iso(new Date());
export const addDays = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); };
export const monthStart = (s = today()) => s.slice(0, 7) + '-01';
const asDate = s => new Date(s.length > 10 ? s : s + 'T12:00');
export const fd = s => s ? asDate(s).toLocaleDateString(LOC, { day: 'numeric', month: 'short' }) : '';
export const fdLong = (s = today()) => asDate(s).toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long' });
export const fMonth = s => asDate(s.slice(0, 7) + '-15').toLocaleDateString(LOC, { month: 'long', year: 'numeric' });
export const n = v => v == null || v === '' ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const daysBetween = (a, b) => Math.round((asDate(b) - asDate(a)) / 864e5);
export function dueText(due) {
  if (!due) return '';
  const d = daysBetween(today(), due);
  if (d < 0) return `متأخر من ${fd(due)}`;
  if (d === 0) return 'النهاردة';
  if (d === 1) return 'بكرة';
  if (d <= 10) return `باقي ${d} أيام`;
  return fd(due);
}
// بداية الأسبوع = السبت
export function weekStart(s = today()) { const d = asDate(s); const back = (d.getDay() + 1) % 7; d.setDate(d.getDate() - back); return iso(d); }

const I = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M9 5l7 7-7 7"/>', chev: '<path d="M15 6l-6 6 6 6"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>', goal: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  team: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c2.8 0 5 2.2 5 5"/>',
  co: '<path d="M4 20V8l8-4 8 4v12M9 20v-6h6v6M3 20h18"/>', check: '<path d="M5 12l5 5 9-10"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>', book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/>',
  tree: '<rect x="9" y="3" width="6" height="4" rx="1"/><rect x="3" y="16" width="6" height="4" rx="1"/><rect x="15" y="16" width="6" height="4" rx="1"/><path d="M12 7v5M6 16v-4h12v4"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>', doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  review: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>', cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>', layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  wallet: '<path d="M5 7V6a2 2 0 0 1 2-2h11v3"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13.5h2"/>', star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11h14V8M10 12h4"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
};
export const ic = (name, s = 22) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${I[name] || ''}</svg>`;

// البطارية: التقدم في كل التطبيق
export function bat(p, state = 'run', { seg = 10, big = false, pct = true } = {}) {
  p = Math.max(0, Math.min(100, Math.round(p || 0)));
  const on = Math.round(p / 100 * seg);
  return `<div class="bat ${state}${big ? ' big' : ''}" role="img" aria-label="التقدم ${p}%"><div class="body">${Array.from({ length: seg }, (_, i) => `<i class="${i < on ? 'f' : ''}"></i>`).join('')}</div><span class="tip"></span>${pct ? `<span class="num pct">${p}%</span>` : ''}</div>`;
}

export const empty = t => `<div class="empty">${t}</div>`;
export const sw = (on, attrs = '') => `<button class="switch${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" ${attrs}></button>`;
export const opts = (arr, v) => arr.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${String(val) === String(v ?? '') ? ' selected' : ''}>${esc(lab)}</option>`; }).join('');

// ---------- قفل حركة الصفحة اللي ورا (الآيفون محتاج position:fixed) ----------
let locks = 0, savedY = 0;
export function lockScroll() {
  if (locks++ > 0) return;
  savedY = window.scrollY;
  Object.assign(document.body.style, { position: 'fixed', top: `-${savedY}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' });
}
export function unlockScroll() {
  if (locks === 0) return;
  if (--locks > 0) return;
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '', width: '', overflow: '' });
  window.scrollTo(0, savedY);
}

// ---------- الشيت (النافذة اللي بتطلع من تحت) ----------
const root = () => document.getElementById('sheet-root');
export function openSheet(title, body) {
  const r = root();
  clearTimeout(closeT); r.classList.remove('closing');
  r.querySelector('.sheet').innerHTML = `<div class="hd"><h2>${title}</h2><button class="rb" data-act="close-sheet" aria-label="قفل">${ic('x', 20)}</button></div>${body}`;
  if (r.hidden) lockScroll();
  r.hidden = false;
  const f = r.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 50);
  return r.querySelector('.sheet');
}
let closeT;
export function closeSheet() {
  const r = root(); if (r.hidden || r.classList.contains('closing')) return;
  r.classList.add('closing');
  closeT = setTimeout(() => { r.hidden = true; r.classList.remove('closing'); unlockScroll(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 190);
}
export const sheetEl = () => root().querySelector('.sheet');
export function formOf(el) {
  const o = {};
  el.querySelectorAll('[name]').forEach(f => { o[f.name] = f.type === 'checkbox' ? f.checked : f.value.trim(); });
  return o;
}

// ---------- التوست مع زرار تراجع ----------
let tt;
export function toast(msg, undo) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">تراجع</button>' : ''}`;
  t.hidden = false;
  if (undo) t.querySelector('button').onclick = async () => { t.hidden = true; await undo(); };
  clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), undo ? 6000 : 2600);
}
export function fail(e) { console.error(e); toast('ما اتحفظش: ' + (e?.message || 'حصلت مشكلة، جرب تاني')); }

// ---------- الكتابة بالصوت ----------
// الآيفون فيه عيب معروف: المايك بتاع المواقع ساعات يشتغل أول مرة بس، والمرات اللي بعدها يفتح ومايسمعش.
// اللي بنعمله: "ودن" جديدة خالص كل مرة، وبتفضل تسمع الجملة كلها لحد ما تدوس وقف.
// ولو مسمعش حاجة في أول 6 ثواني، بنقولك تصلّح المايك أو تستخدم مايك الكيبورد (ده دايمًا شغال).
let current = null;
function kill(r) {
  if (!r) return;
  r.onstart = r.onresult = r.onerror = r.onend = null;
  try { r.abort(); } catch (_) {}
}
// الآيفون ساعات بيرجّع نفس الجملة وهي بتكبر ("أكلت" ثم "أكلت ب 300")، فبناخد آخر نسخة بس
function textOf(results) {
  const parts = [];
  for (let i = 0; i < results.length; i++) {
    const t = results[i][0].transcript.trim(); if (!t) continue;
    const prev = parts[parts.length - 1];
    if (prev && t.startsWith(prev)) parts[parts.length - 1] = t;
    else if (!prev || !prev.startsWith(t)) parts.push(t);
  }
  return parts.join(' ');
}
export function dictate(onText, onState, onDeaf) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) return null;
  if (current) current.finish();   // لو في تسجيل قديم لسه شغال، بنقفله الأول
  let want = true, base = '', cur = '', heard = false, done = false, r = null, restarts = 0, watchdog;
  const text = () => (base + ' ' + cur).trim();
  const me = {
    finish() {
      if (done) return; done = true; want = false; clearTimeout(watchdog);
      kill(r); r = null;
      if (current === me) current = null;
      onState(false, text());
    },
  };
  const go = () => {
    kill(r);
    r = new R(); r.lang = 'ar-EG'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    r.onresult = e => { heard = true; clearTimeout(watchdog); cur = textOf(e.results); restarts = 0; onText(text()); };
    r.onerror = ev => {
      if (['not-allowed', 'service-not-allowed'].includes(ev.error)) { want = false; toast('اسمح للتطبيق يستخدم المايك من الإعدادات'); }
      if (ev.error === 'audio-capture') want = false;
    };
    r.onend = () => {   // الموبايل قفل لوحده بعد سكتة طويلة؟ نفتح ودن جديدة ونكمّل على الكلام اللي فات
      if (!want || current !== me) return me.finish();
      base = text(); cur = '';
      if (restarts++ < 30) setTimeout(() => { if (want && current === me) go(); }, 120);
      else me.finish();
    };
    try { r.start(); } catch (e) { me.finish(); toast('المايك مش راضي يفتح، جرب تاني'); }
  };
  current = me;
  go();
  onState(true);
  watchdog = setTimeout(() => {
    if (heard || done) return;
    me.finish();
    if (onDeaf) onDeaf(); else toast('المايك مش سامع حاجة. دوس مايك الكيبورد واتكلم');
  }, 6000);
  return {
    stop() {
      want = false;
      try { r && r.stop(); } catch (_) {}
      setTimeout(() => me.finish(), 1200);   // لو الموبايل منسيش يقول "خلصت"، بنقفل احنا
    },
  };
}
