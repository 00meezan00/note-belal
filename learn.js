// تعلّمي: الكتب والكتب المسموعة والبودكاست + "اتعلمت إيه" + "طبّقت اللي اتعلمته؟"
import { list, one, ins, upd, del, link } from './db.js';
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
export const parseHM = v => { v = String(v ?? '').trim(); if (!v) return null; if (v.includes(':')) { const [h, m] = v.split(':').map(x => parseInt(x) || 0); return h * 60 + m; } return parseInt(v) || 0; };
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
    <div class="field"><span>الحالة</span>${pills('mstat', MSTAT, m.status || 'active')}</div>
    <div class="grid2" data-for="book" ${kind === 'book' ? '' : 'hidden'}><label class="field"><span>عدد صفحات الكتاب</span><input name="total_pages" inputmode="numeric" value="${m.total_pages ?? ''}"></label>
      <label class="field"><span>إنت في صفحة كام؟</span><input name="current_page" inputmode="numeric" value="${m.current_page ?? 0}"></label></div>
    <div class="stack" data-for="audio" style="gap:6px" ${kind === 'book' ? 'hidden' : ''}><div class="grid2"><label class="field"><span>مدته كلها (ساعات:دقايق)</span><input name="total_minutes" inputmode="numeric" value="${m.total_minutes ? hmText(m.total_minutes) : ''}" placeholder="مثلًا 5:30"></label>
      <label class="field"><span>سمعت قد إيه؟</span><input name="current_minutes" inputmode="numeric" value="${m.current_minutes ? hmText(m.current_minutes) : ''}" placeholder="مثلًا 1:15"></label></div>
      <small class="mut">اكتب الوقت كده: 1:15 يعني ساعة وربع، أو 45 يعني 45 دقيقة.</small></div>
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
      ${m.status === 'active' ? `<label class="row" style="gap:8px"><span class="mut" style="font-size:13px;flex:1">${m.kind === 'book' ? 'وصلت صفحة كام؟' : 'سمعت لحد فين؟ (ساعات:دقايق)'}</span><input class="inp num" inputmode="numeric" style="width:100px;min-height:38px" value="${m.kind === 'book' ? (m.current_page || '') : (m.current_minutes ? hmText(m.current_minutes) : '')}" data-change="media-pos" data-id="${m.id}"></label>` : ''}</div>`; }).join('')
    : empty(status === 'active' ? 'سجّل الكتب اللي بتقراها، والكتب المسموعة والبودكاست اللي بتسمعها، وإنت وصلت فين.' : 'مفيش حاجة هنا لسه.') };
}

// بيتحسب التقدّم ولو خلص بيتقفل لوحده
function finish(m, row) {
  const done = m.kind === 'book' ? row.total_pages && row.current_page >= row.total_pages : row.total_minutes && row.current_minutes >= row.total_minutes;
  if (done && row.status !== 'done') { row.status = 'done'; row.finished_on = today(); toast('مبروك! خلصته. اكتب جواه اتعلمت منه إيه'); }
  if (row.status === 'active' && !m.started_on) row.started_on = today();
  return row;
}

export const learnGlobal = {
  'media-new': () => mediaSheet(),
  async 'media-open'(el) { const m = await one('media', el.dataset.id); m && mediaSheet(m); },
  async 'media-save'(el) {
    const s = sheetEl(), f = formOf(s); if (!f.title) return toast('اكتب الاسم');
    const kind = picked('mkind') || 'book', old = el.dataset.id ? await one('media', el.dataset.id) : {};
    let row = { kind, title: f.title, author: f.author || null, status: picked('mstat') || 'active', ...taRow(f.ta, await lifeData()) };
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
