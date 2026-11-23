// تعلّمي: الكتب والكتب المسموعة والبودكاست + "اتعلمت إيه" + "طبّقت اللي اتعلمته؟"
import { list, one, ins, upd, del, link, sb } from './db.js';
import * as CFG from './config.js';
import { esc, ic, bat, fd, today, addDays, n, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail } from './ui.js';
import { linksSlot, fillLinks, archiveWithUndo, doRefresh } from './comps.js';
import { lifeData, taPicker, taRow, taValue, trackByName } from './life.js';
import { moneyOpen, lockedRow } from './money.js';

export const MKIND = [['book', 'كتاب'], ['audiobook', 'كتاب مسموع'], ['podcast', 'بودكاست']];
const MSTAT = [['active', 'شغال فيه'], ['done', 'خلصته'], ['wishlist', 'عايزه']];
const kindName = k => (MKIND.find(x => x[0] === k) || MKIND[0])[1];
const pills = (group, items, cur) => `<div class="pills" data-group="${group}">${items.map(([k, l]) => `<button type="button" data-v="${k}" class="${String(cur) === String(k) ? 'on' : ''}" data-act="pick">${l}</button>`).join('')}</div>`;
const picked = g => sheetEl()?.querySelector(`[data-group="${g}"] .on`)?.dataset.v;
const num = v => { const x = parseFloat(String(v ?? '').replace(/[^\d.]/g, '')); return isNaN(x) ? null : x; };

// الوقت بيتكتب "ساعات:دقايق" (مثلًا 2:30) أو دقايق بس (90)
export const hmText = m => { m = Math.round(Number(m) || 0); const h = Math.floor(m / 60), r = m % 60; return h ? `${h}:${String(r).padStart(2, '0')}` : String(r); };
// بيفهم: 1:30 / ١:٣٠ / 1.30 (ساعة ونص) / 1.5 (ساعة ونص) / 2س 15د / 45 (دقايق)
const enDigits = v => String(v ?? '').replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776);
export const parseHM = v => {
  v = enDigits(v).trim().replace(/[：﹕]/g, ':'); if (!v) return null;
  if (v.includes(':')) { const [a, b] = v.split(':').map(x => parseInt(x) || 0); return a * 60 + b; }
  const h = /(\d+(?:[.٫,]\d+)?)\s*(?:س|ساع|h)/i.exec(v), m = /(\d+)\s*(?:د|دق|m)/i.exec(v);
  if (h || m) return Math.round((h ? parseFloat(h[1].replace(/[٫,]/, '.')) * 60 : 0) + (m ? +m[1] : 0));
  let x = /^(\d+)[.٫,](\d{2})$/.exec(v); if (x) return +x[1] * 60 + +x[2];
  x = /^(\d+)[.٫,](\d)$/.exec(v); if (x) return Math.round(parseFloat(x[1] + '.' + x[2]) * 60);
  return parseInt(v.replace(/[^\d]/g, '')) || 0;
};
// المدة بالكلام: "ساعة ونص"، "ساعتين و10 دقايق"، "45 دقيقة"
export function durWords(t) {
  t = Math.round(t || 0); if (!t) return '';
  const h = Math.floor(t / 60), m = t % 60;
  const hw = h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h <= 10 ? `${h} ساعات` : `${h} ساعة`;
  const mw = m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : m <= 10 ? `${m} دقايق` : `${m} دقيقة`;
  if (!h) return m === 30 ? 'نص ساعة' : m === 15 ? 'ربع ساعة' : mw;
  if (!m) return hw;
  return hw + (m === 30 ? ' ونص' : m === 15 ? ' وربع' : m === 45 ? ' و45 دقيقة' : ' و' + mw);
}
// خانة مدة: بتكتب 1:30 وتحتها بيظهر "= ساعة ونص" عشان تتأكد إنها اتفهمت صح
export const durField = (name, label, minutes, ph = 'مثلًا 1:30') => `<label class="field"><span>${label}</span><input name="${name}" inputmode="text" autocomplete="off" enterkeyhint="done" value="${minutes ? hmText(minutes) : ''}" placeholder="${ph}" data-input="dur-preview"><small class="mut dur-prev">${minutes ? '= ' + durWords(minutes) : 'ساعات:دقايق'}</small></label>`;
// خانة اللينك: تلزق اللينك والنوتة تجيب المدة لوحدها
export const linkField = (url, hidden = false) => `<div class="field"><span>اللينك (يوتيوب، بودكاست، كورس)</span>
  <div class="row" style="gap:6px"><input name="url" type="url" inputmode="url" autocomplete="off" value="${esc(url)}" placeholder="الصق اللينك هنا" data-change="dur-fetch" style="flex:1;min-width:0">
  <button type="button" class="btn sm" data-act="dur-fetch" data-for="audio" ${hidden ? 'hidden' : ''}>${ic('clock', 16)}هات المدة</button></div>
  <small class="mut" id="dur-msg">${url ? '' : 'لما تلزق لينك، هجيب مدته وأكتبها لوحدها'}</small></div>`;
// لينك يوتيوب؟ بيرجع رقم الفيديو و/أو القايمة
export function ytOf(url) {
  if (!url) return null;
  let u; try { u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url); } catch (e) { return null; }
  const h = u.hostname.replace(/^(www|m|music)\./, '');
  if (!/^(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(h)) return null;
  let v = u.searchParams.get('v'), list = u.searchParams.get('list');
  if (h === 'youtu.be') v = u.pathname.slice(1, 12);
  const m = /^\/(?:shorts|live|embed)\/([\w-]{11})/.exec(u.pathname); if (m) v = m[1];
  if (list && /^(RD|UL|LL|WL)/.test(list)) list = null;
  return v || list ? { v: v || null, list: list || null } : null;
}
// زرار "اتفرج في النوتة" لو اللينك يوتيوب، وإلا "افتح اللينك"
export const watchLink = (kind, id, url, label) => ytOf(url) ? `<a class="btn sm amb" href="#/watch/${kind === 'media' ? 'm' : 'c'}_${id}" style="align-self:flex-start;text-decoration:none">${ic('play', 16)}${label || (kind === 'media' ? 'شغّل في النوتة' : 'اتفرج في النوتة')}</a>` : openLink(url);
export const openLink = url => url ? `<a class="chip" href="${esc(/^https?:/i.test(url) ? url : 'https://' + url)}" target="_blank" rel="noopener" style="align-self:flex-start;text-decoration:none">${ic('link', 13)}افتح اللينك</a>` : '';
const longTime = m => { m = Math.round(m || 0); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} س${r ? ` ${r} د` : ''}` : `${r} د`; };

// التقدّم: الكتاب بالصفحات، والمسموع بالوقت
export function mediaProgress(m) {
  if (m.kind === 'book') return m.total_pages ? { p: Math.min(100, (m.current_page || 0) / m.total_pages * 100), text: `صفحة ${m.current_page || 0} من ${m.total_pages}` } : { p: m.status === 'done' ? 100 : 0, text: m.current_page ? `وصلت صفحة ${m.current_page}` : '' };
  return m.total_minutes ? { p: Math.min(100, (m.current_minutes || 0) / m.total_minutes * 100), text: `سمعت ${longTime(m.current_minutes)} من ${longTime(m.total_minutes)}` } : { p: m.status === 'done' ? 100 : 0, text: m.current_minutes ? `سمعت ${longTime(m.current_minutes)}` : '' };
}

// ---------- "اتعلمت إيه": قايمة جوه شاشة الكورس أو الكتاب ----------
const ST = { new: ['', 'لسه'], applied: ['ok', 'طبّقتها'], skipped: ['out', 'مش هطبّقها'] };
function learnItems(L) {
  return L.map(x => { const [cls, lab] = x.task_id && x.status === 'new' ? ['amb', 'بقت مهمة'] : ST[x.status] || ST.new;
    return `<div class="row" style="gap:8px;padding:7px 0;align-items:flex-start"><span style="flex:1;line-height:1.5;font-size:14px">${esc(x.text)}${x.applied_note ? `<br><small class="mut">طبّقتها في: ${esc(x.applied_note)}</small>` : ''}</span><span class="tag ${cls}">${lab}</span><button type="button" class="star" data-act="learn-del" data-id="${x.id}" aria-label="امسح">${ic('x', 16)}</button></div>`; }).join('')
    || '<div class="mut" style="padding:6px 0;font-size:14px">لسه مكتبتش حاجة اتعلمتها.</div>';
}
export async function learnBlock(type, id) {
  const L = await list('learnings', { eq: { source_type: type, source_id: id }, order: 'created_at' });
  return `<div class="card stack" style="gap:6px;padding:12px 14px"><div class="row" style="gap:6px;font-weight:600">${ic('book', 18)}اتعلمت إيه؟</div>
    <div class="list" id="learnbox">${learnItems(L)}</div>
    <div class="row" style="gap:6px"><input class="inp" id="learnnew" placeholder="حاجة اتعلمتها وعايز تطبّقها" style="flex:1"><button type="button" class="btn sm pri" data-act="learn-add" data-type="${type}" data-id="${id}">ضيف</button></div>
    <p class="mut" style="margin:0;font-size:12px">بعد أسبوعين هسألك: طبّقتها ولا لأ؟</p></div>`;
}
// صرفت كام على الكورس أو الكتاب (مقفولة بالبصمة)
export async function spendBlock(type, id) {
  const E = await list('expenses', { eq: { learn_type: type, learn_id: id } });
  const add = `<button type="button" class="btn sm dash" data-act="exp-for" data-v="${type}:${id}">+ مصروف عليه</button>`;
  if (!E.length) return `<div class="row" style="gap:8px">${add}</div>`;
  if (!(await moneyOpen())) return lockedRow('صرفت عليه كام');
  return `<div class="card row" style="gap:10px;padding:10px 14px">${ic('wallet', 20)}<span style="flex:1">صرفت عليه <b class="num">${n(E.reduce((s, e) => s + (Number(e.amount) || 0), 0))}</b> ج <span class="mut">(${E.length} مرة)</span></span>${add}</div>`;
}

// ---------- "طبّقت اللي اتعلمته؟" بعد أسبوعين ----------
export async function applyDue() {
  const cut = addDays(today(), -14);
  return (await list('learnings', { eq: { status: 'new' } })).filter(x => !x.task_id && (x.created_at || '').slice(0, 10) <= cut);
}
export async function applyCards(max = 3) {
  const due = await applyDue(); if (!due.length) return '';
  const [C, M] = await Promise.all([list('courses'), list('media')]);
  const src = x => (x.source_type === 'course' ? C : M).find(s => s.id === x.source_id)?.title || '';
  return due.slice(0, max).map(x => `<div class="card stack" style="gap:8px;border-color:var(--amb);border-width:1.5px">
    <div class="mut" style="font-size:13px">من أسبوعين اتعلمت${src(x) ? ` من «${esc(src(x))}»` : ''}:</div>
    <b style="line-height:1.5;font-weight:600">${esc(x.text)}</b>
    <div style="font-size:14px">طبّقت اللي اتعلمته؟</div>
    <div class="btns" style="flex-wrap:wrap"><button class="btn sm pri" data-act="learn-applied" data-id="${x.id}">${ic('check', 16)}طبّقتها</button><button class="btn sm" data-act="learn-task" data-id="${x.id}">اعملها مهمة</button><button class="btn sm" data-act="learn-skip" data-id="${x.id}" style="border:0;background:none">مش هطبّقها</button></div></div>`).join('')
    + (due.length > max ? `<div class="mut" style="text-align:center;font-size:13px">وفيه ${due.length - max} كمان مستنيين ردك</div>` : '');
}

// ---------- الكتب والبودكاست ----------
async function mediaSheet(m = {}) {
  const d = await lifeData(), dev = trackByName(d, 'تطويري'), kind = m.kind || 'book';
  openSheet(m.id ? kindName(kind) : 'كتاب أو بودكاست جديد', `
    <div class="field"><span>النوع</span>${pills('mkind', MKIND, kind)}</div>
    <label class="field"><span>الاسم</span><input name="title" value="${esc(m.title)}" ${m.id ? '' : 'autofocus'} placeholder="مثلًا: العادات الذرية"></label>
    <label class="field"><span>الكاتب أو المقدّم (اختياري)</span><input name="author" value="${esc(m.author)}"></label>
    ${linkField(m.url, kind === 'book')}
    <div class="field"><span>الحالة</span>${pills('mstat', MSTAT, m.status || 'active')}</div>
    <div class="grid2" data-for="book" ${kind === 'book' ? '' : 'hidden'}><label class="field"><span>عدد صفحات الكتاب</span><input name="total_pages" inputmode="numeric" value="${m.total_pages ?? ''}"></label>
      <label class="field"><span>إنت في صفحة كام؟</span><input name="current_page" inputmode="numeric" value="${m.current_page ?? 0}"></label></div>
    <div class="stack" data-for="audio" style="gap:6px" ${kind === 'book' ? 'hidden' : ''}><div class="grid2">${durField('total_minutes', 'مدته كلها', m.total_minutes, 'مثلًا 5:30')}
      ${durField('current_minutes', 'سمعت قد إيه؟', m.current_minutes, 'مثلًا 1:15')}</div>
      <small class="mut">اكتب 1:30 يعني ساعة ونص، أو 45 يعني 45 دقيقة.</small></div>
    ${taPicker(d, m.id ? taValue(m) : dev ? 't:' + dev.id : '')}
    ${m.id ? await learnBlock('media', m.id) : '<p class="mut" style="margin:0;font-size:13px">بعد ما تحفظ، تقدر تكتب جواه اللي اتعلمته.</p>'}
    ${m.id ? await spendBlock('media', m.id) : ''}
    ${m.id ? linksSlot('media', m.id) : ''}
    <div class="btns">${m.id ? `<button class="btn" data-act="media-archive" data-id="${m.id}">${ic('archive', 18)}أرشيف</button>` : ''}<button class="btn pri" data-act="media-save" data-id="${m.id || ''}">حفظ</button></div>`);
  if (m.id) fillLinks(sheetEl());
}

export async function mediaView(status) {
  const all = await list('media', { order: 'created_at', asc: false });
  const L = all.filter(m => m.status === status);
  return { count: s => all.filter(m => m.status === s).length, total: all.length, html: L.length ? L.map(m => { const pr = mediaProgress(m);
    return `<div class="card stack" style="gap:8px"><div class="stack" style="gap:8px;cursor:pointer" data-act="media-open" data-id="${m.id}" role="button" tabindex="0">
      <div class="between"><span class="title">${esc(m.title)}</span><span class="tag">${kindName(m.kind)}</span></div>
      ${m.author ? `<div class="mut" style="font-size:13px">${esc(m.author)}</div>` : ''}
      ${m.status !== 'wishlist' ? bat(pr.p, m.status === 'done' ? 'done' : 'run') : ''}
      ${pr.text ? `<div class="mut" style="font-size:13px">${pr.text}${m.status === 'done' && m.finished_on ? ' · خلص ' + fd(m.finished_on) : ''}</div>` : ''}</div>
      ${watchLink('media', m.id, m.url)}
      ${m.status === 'active' ? `<label class="row" style="gap:8px"><span class="mut" style="font-size:13px;flex:1">${m.kind === 'book' ? 'وصلت صفحة كام؟' : 'سمعت لحد فين؟ (ساعات:دقايق)'}</span><input class="inp num" inputmode="${m.kind === 'book' ? 'numeric' : 'text'}" style="width:100px;min-height:38px" value="${m.kind === 'book' ? (m.current_page || '') : (m.current_minutes ? hmText(m.current_minutes) : '')}" data-change="media-pos" data-id="${m.id}"></label>` : ''}</div>`; }).join('')
    : empty(status === 'active' ? 'سجّل الكتب اللي بتقراها، والكتب المسموعة والبودكاست اللي بتسمعها، وإنت وصلت فين.' : 'مفيش حاجة هنا لسه.') };
}

// بيتحسب التقدّم ولو خلص بيتقفل لوحده
function finish(m, row) {
  const done = m.kind === 'book' ? row.total_pages && row.current_page >= row.total_pages : row.total_minutes && row.current_minutes >= row.total_minutes;
  if (done && row.status !== 'done') { row.status = 'done'; row.finished_on = today(); toast('مبروك! خلصته. اكتب جواه اتعلمت منه إيه'); }
  if (row.status === 'active' && !m.started_on) row.started_on = today();
  return row;
}

// ---------- هات المدة من اللينك (عن طريق الـ Worker) ----------
const WORKER = (CFG.WORKER_URL || '').replace(/\/$/, '');
let durBusy = '';
export const learnGlobal = {
  'dur-preview'(el) { const p = el.parentNode.querySelector('.dur-prev'); if (!p) return; const v = el.value.trim(), t = parseHM(v); p.textContent = !v ? 'ساعات:دقايق' : t ? '= ' + durWords(t) : 'مش فاهمها، اكتبها كده 1:30'; p.classList.toggle('late', !!v && !t); },
  async 'dur-fetch'(el) {
    const s = sheetEl(), inp = s.querySelector('[name=url]'), msg = s.querySelector('#dur-msg'), url = inp?.value.trim();
    if (!url) { inp?.focus(); return toast('الصق اللينك الأول'); }
    if (s.querySelector('[data-group=mkind] .on')?.dataset.v === 'book') return;   // الكتاب الورق بالصفحات
    if (durBusy === url) return;
    if (!WORKER) return toast('محتاج الـ Worker على Cloudflare عشان أجيب المدة');
    if (!navigator.onLine) return toast('محتاج نت عشان أفتح اللينك');
    durBusy = url; msg.className = 'mut'; msg.textContent = 'بفتح اللينك وبدوّر على المدة…';
    try {
      const { data } = await sb.auth.getSession();
      const r = await fetch(WORKER + '/duration', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const j = await r.json().catch(() => ({ error: r.status === 404 ? 'الـ Worker محتاج يتحدّث' : 'رد غريب من الـ Worker' }));
      if (!r.ok || j.error || !j.minutes) throw new Error(j.error || (r.status === 404 ? 'الـ Worker محتاج يتحدّث' : 'ملقيتش المدة'));
      const tot = s.querySelector('[name=total_minutes]');
      if (tot) { tot.value = hmText(j.minutes); learnGlobal['dur-preview'](tot); }
      const title = s.querySelector('[name=title]'); if (title && !title.value.trim() && j.title) title.value = j.title.slice(0, 120);
      const les = s.querySelector('[name=lessons_total]'); if (les && !les.value.trim() && j.count) les.value = j.count;
      msg.textContent = `لقيتها: ${durWords(j.minutes)}${j.count ? ` · ${j.count} ${j.count <= 10 ? 'فيديوهات' : 'فيديو'}` : ''}${j.source ? ` (${j.source})` : ''}${j.partial ? ' · حسبت أول 100 بس' : ''}`;
      msg.className = 'mut'; msg.style.color = 'var(--ok)';
    } catch (e) {
      msg.style.color = ''; msg.className = 'late'; msg.textContent = (e.message === 'Failed to fetch' ? 'ما قدرتش أوصل للـ Worker' : e.message) + '. اكتب المدة بإيدك تحت.';
    } finally { setTimeout(() => { durBusy = ''; }, 1500); }
  },
  'media-new': () => mediaSheet(),
  async 'media-open'(el) { const m = await one('media', el.dataset.id); m && mediaSheet(m); },
  async 'media-save'(el) {
    const s = sheetEl(), f = formOf(s); if (!f.title) return toast('اكتب الاسم');
    const kind = picked('mkind') || 'book', old = el.dataset.id ? await one('media', el.dataset.id) : {};
    let row = { kind, title: f.title, author: f.author || null, url: f.url || null, status: picked('mstat') || 'active', ...taRow(f.ta, await lifeData()) };
    if (kind === 'book') Object.assign(row, { total_pages: num(f.total_pages), current_page: num(f.current_page) || 0 });
    else Object.assign(row, { total_minutes: parseHM(f.total_minutes), current_minutes: parseHM(f.current_minutes) || 0 });
    if (row.status === 'done' && old.status !== 'done') row.finished_on = today();
    row = finish({ ...old, kind }, row);
    try { if (old.id) await upd('media', old.id, row); else await ins('media', row); closeSheet(); doRefresh(); } catch (e) { fail(e); }
  },
  async 'media-pos'(el) {
    const m = await one('media', el.dataset.id); if (!m) return;
    const v = m.kind === 'book' ? num(el.value) : parseHM(el.value); if (v == null) return;
    const row = finish(m, { status: m.status, total_pages: m.total_pages, total_minutes: m.total_minutes, ...(m.kind === 'book' ? { current_page: v } : { current_minutes: v }) });
    delete row.total_pages; delete row.total_minutes;
    try { await upd('media', m.id, row); if (row.status !== 'done') toast('اتسجل'); doRefresh(); } catch (e) { fail(e); }
  },
  async 'media-archive'(el) { closeSheet(); await archiveWithUndo('media', el.dataset.id, 'اتنقل للأرشيف'); },

  async 'learn-add'(el) {
    const inp = sheetEl().querySelector('#learnnew'), text = inp.value.trim(); if (!text) return toast('اكتب اللي اتعلمته');
    try {
      await ins('learnings', { source_type: el.dataset.type, source_id: el.dataset.id, text, status: 'new' });
      inp.value = '';
      sheetEl().querySelector('#learnbox').innerHTML = learnItems(await list('learnings', { eq: { source_type: el.dataset.type, source_id: el.dataset.id }, order: 'created_at' }));
      toast('اتسجل. بعد أسبوعين هسألك طبّقتها ولا لأ');
    } catch (e) { fail(e); }
  },
  async 'learn-del'(el) {
    const x = await one('learnings', el.dataset.id); if (!x) return;
    try { await del('learnings', x.id); el.closest('.row').remove(); } catch (e) { fail(e); }
  },
  async 'learn-applied'(el) {
    const x = await one('learnings', el.dataset.id); if (!x) return;
    openSheet('طبّقتها 👏', `<div style="line-height:1.6">${esc(x.text)}</div>
      <label class="field"><span>طبّقتها في إيه؟ (اختياري)</span><input name="note" autofocus placeholder="مثلًا: نظام التحصيل الجديد"></label>
      <button class="btn pri" data-act="learn-applied-save" data-id="${x.id}">حفظ</button>`);
  },
  async 'learn-applied-save'(el) {
    const f = formOf(sheetEl());
    try { await upd('learnings', el.dataset.id, { status: 'applied', applied_note: f.note || null, decided_on: today() }); closeSheet(); toast('برافو! كده الكورس جاب نتيجة'); doRefresh(); } catch (e) { fail(e); }
  },
  async 'learn-task'(el) {
    const x = await one('learnings', el.dataset.id); if (!x) return;
    try {
      const t = await ins('tasks', { title: 'طبّق: ' + x.text, due_on: today() });
      await upd('learnings', x.id, { task_id: t.id });
      await link('task', t.id, x.source_type, x.source_id).catch(() => {});
      toast('اتعملت مهمة للنهاردة'); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'learn-skip'(el) {
    try { await upd('learnings', el.dataset.id, { status: 'skipped', decided_on: today() }); toast('تمام، مش هسألك عليها تاني'); doRefresh(); } catch (e) { fail(e); }
  },
};
