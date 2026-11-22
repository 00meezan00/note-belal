// القوالب: لستة مهام بتتكرر (زي تعيين موظف جديد). تدوس "استخدمه" فكل مهامه بتتعمل بمواعيدها مرة واحدة
import { list, one, ins, upd, link } from './db.js';
import { esc, ic, fd, today, addDays, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, opts } from './ui.js';
import { archiveWithUndo, doRefresh } from './comps.js';

const items = t => (Array.isArray(t.items) ? t.items : []).filter(x => x && x.text).sort((a, b) => (Number(a.day) || 0) - (Number(b.day) || 0));
const dayTxt = d => (d = Number(d) || 0) === 0 ? 'يوم البداية' : d === 1 ? 'بعده بيوم' : d === 2 ? 'بعده بيومين' : d <= 10 ? `بعده بـ ${d} أيام` : `بعده بـ ${d} يوم`;

export async function tplBody() {
  const L = await list('templates', { order: 'title' });
  return L.length ? L.map(t => { const I = items(t), span = I.length ? Number(I[I.length - 1].day) || 0 : 0;
    return `<div class="card stack" style="gap:8px"><div class="row" style="gap:8px"><b style="flex:1;font-weight:600;cursor:pointer" data-act="tpl-open" data-id="${t.id}" role="button" tabindex="0">${esc(t.title)}</b><button class="star" data-act="tpl-open" data-id="${t.id}" aria-label="عدّل">${ic('edit', 16)}</button></div>
      <div class="mut" style="font-size:13px">${I.length} مهام${span ? ` على ${span} يوم` : ''}: ${esc(I.slice(0, 3).map(x => x.text).join('، '))}${I.length > 3 ? '…' : ''}</div>
      <button class="btn sm pri" data-act="tpl-use" data-id="${t.id}">${ic('check', 16)}استخدمه</button></div>`; }).join('')
    : empty('القالب = مهام بتعملها كل مرة بنفس الترتيب، زي تعيين موظف جديد. اعمله مرة واستخدمه كل مرة.');
}

const rowHtml = (x = {}) => `<div class="row" data-trow style="gap:6px"><input class="inp" data-k="day" inputmode="numeric" value="${esc(x.day ?? 0)}" style="width:64px" aria-label="بعد كام يوم"><input class="inp" data-k="text" value="${esc(x.text || '')}" placeholder="المهمة" style="flex:1"><button type="button" class="star" data-act="trow-del" aria-label="شيلها">${ic('x', 16)}</button></div>`;
export function tplSheet(t = {}) {
  openSheet(t.id ? 'القالب' : 'قالب جديد', `
    <label class="field"><span>اسم القالب</span><input name="title" value="${esc(t.title)}" ${t.id ? '' : 'autofocus'} placeholder="مثلًا: تعيين موظف جديد"></label>
    <div class="field"><span>المهام (الرقم = بعد كام يوم من البداية)</span><div class="stack" style="gap:6px" id="trows">${(items(t).length ? items(t) : [{ day: 0 }]).map(rowHtml).join('')}</div>
      <button type="button" class="btn dash sm" data-act="trow-add">+ مهمة</button></div>
    <div class="btns">${t.id ? `<button class="btn" data-act="tpl-del" data-id="${t.id}">${ic('archive', 18)}شيله</button>` : ''}<button class="btn pri" data-act="tpl-save" data-id="${t.id || ''}">حفظ</button></div>`);
}

export const tplGlobal = {
  async 'tpl-open'(el) { tplSheet(await one('templates', el.dataset.id)); },
  'tpl-new': () => tplSheet(),
  'trow-add'() { const box = sheetEl().querySelector('#trows'), last = box.querySelector('[data-trow]:last-child [data-k=day]')?.value; box.insertAdjacentHTML('beforeend', rowHtml({ day: last || 0 })); box.querySelector('[data-trow]:last-child [data-k=text]').focus(); },
  'trow-del'(el) { el.closest('[data-trow]').remove(); },
  async 'tpl-save'(el) {
    const s = sheetEl(), f = formOf(s); if (!f.title) return toast('اكتب اسم القالب');
    const L = [...s.querySelectorAll('[data-trow]')].map(r => ({ day: Math.max(0, parseInt(r.querySelector('[data-k=day]').value) || 0), text: r.querySelector('[data-k=text]').value.trim() })).filter(x => x.text);
    if (!L.length) return toast('ضيف مهمة واحدة على الأقل');
    try { if (el.dataset.id) await upd('templates', el.dataset.id, { title: f.title, items: L }); else await ins('templates', { title: f.title, items: L }); closeSheet(); doRefresh(); } catch (e) { fail(e); }
  },
  async 'tpl-del'(el) { closeSheet(); await archiveWithUndo('templates', el.dataset.id, 'القالب اتشال'); },
  async 'tpl-use'(el) {
    const [t, members, goals] = await Promise.all([one('templates', el.dataset.id), list('team_members', { order: 'name' }), list('goals', { eq: { status: 'active' } })]);
    if (!t) return;
    openSheet(esc(t.title), `
      <label class="field"><span>هتبدأ يوم</span><input type="date" name="start" value="${today()}" data-change="tpl-preview"></label>
      <label class="field"><span>اربط المهام بـ (اختياري)</span><select name="to"><option value="">من غير</option>
        ${members.filter(m => m.active).length ? `<optgroup label="شخص">${opts(members.filter(m => m.active).map(m => ['member:' + m.id, m.name]))}</optgroup>` : ''}
        ${goals.length ? `<optgroup label="هدف">${opts(goals.map(g => ['goal:' + g.id, g.title]))}</optgroup>` : ''}</select></label>
      <div class="card list" style="padding:4px 14px" id="tpl-prev"></div>
      <button class="btn pri" data-act="tpl-go" data-id="${t.id}">اعمل ${items(t).length} مهام</button>`);
    sheetEl()._tpl = t; tplGlobal['tpl-preview']();
  },
  'tpl-preview'() {
    const s = sheetEl(), t = s._tpl, start = s.querySelector('[name=start]').value || today(), box = s.querySelector('#tpl-prev'); if (!t || !box) return;
    box.innerHTML = items(t).map(x => `<div class="row" style="gap:8px;padding:7px 0"><span class="num mut" style="width:58px;font-size:13px">${fd(addDays(start, Number(x.day) || 0))}</span><span style="flex:1">${esc(x.text)}</span></div>`).join('');
  },
  async 'tpl-go'(el) {
    const s = sheetEl(), t = s._tpl, f = formOf(s), start = f.start || today(); if (!t) return;
    const [type, id] = (f.to || '').split(':');
    try {
      for (const x of items(t)) { const k = await ins('tasks', { title: x.text, due_on: addDays(start, Number(x.day) || 0) }); if (type && id) await link('task', k.id, type, id); }
      closeSheet(); toast(`اتعملت ${items(t).length} مهام، أولها يوم ${fd(start)}`); doRefresh();
    } catch (e) { fail(e); }
  },
};
