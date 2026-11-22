// الناس: مستني من حد، حاجات أكلم فيها المالك، الخط الزمني لكل شخص، رسمة تقييمه، والأقسام
import { list, one, ins, upd, del, link, linksOf } from './db.js';
import { esc, ic, fd, fMonth, today, addDays, monthStart, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, opts } from './ui.js';
import { doRefresh, openTask } from './comps.js';

const avgOf = r => { const v = Object.values(r?.scores || {}).map(Number).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
export const daysAgo = d => d ? Math.round((Date.parse(today()) - Date.parse(String(d).slice(0, 10))) / 864e5) : null;

// ---------------- الأقسام ----------------
export async function deptData() {
  const [depts, roles] = await Promise.all([list('departments', { order: 'sort' }), list('role_criteria')]);
  const D = Object.fromEntries(depts.map(d => [d.id, d]));
  const roleDept = Object.fromEntries(roles.map(r => [r.role, D[r.department_id] || null]));
  return { depts, roles, D, roleDept };
}

// ---------------- مستني من حد ----------------
const dueTxt = w => !w.due_on ? '' : w.due_on < today() ? `متأخر من ${fd(w.due_on)}` : w.due_on === today() ? 'النهاردة' : w.due_on === addDays(today(), 1) ? 'بكرة' : `لحد ${fd(w.due_on)}`;
export const lateWaiting = L => L.filter(w => !w.done && w.due_on && w.due_on <= today());

export async function waitSheet(w = {}, extra = {}) {
  const members = (await list('team_members', { order: 'name' })).filter(m => m.active);
  openSheet(w.id ? 'مستني من حد' : 'مستني من حد', `
    <label class="field"><span>من مين؟</span><input name="who" list="wait-who" value="${esc(w.who || extra.who || '')}" ${w.id || extra.who ? '' : 'autofocus'} placeholder="اسم من التيم، أو محل، أو مورد"><datalist id="wait-who">${members.map(m => `<option value="${esc(m.name)}">`).join('')}</datalist></label>
    <label class="field"><span>مستني منه إيه؟</span><textarea name="text" rows="2" placeholder="مثلًا: حساب الشهر، أو رد على العرض">${esc(w.text || extra.text || '')}</textarea></label>
    <div class="field"><span>لحد إمتى؟</span><div class="pills">${[[1, 'بكرة'], [3, 'بعد 3 أيام'], [7, 'بعد أسبوع']].map(([k, l]) => `<button type="button" data-act="wait-due" data-v="${k}">${l}</button>`).join('')}</div>
      <input class="inp" type="date" name="due_on" value="${w.due_on || addDays(today(), 3)}"></div>
    <div class="btns">${w.id ? `<button class="btn" data-act="wait-del" data-id="${w.id}">${ic('trash', 18)}امسح</button>` : ''}<button class="btn pri" data-act="wait-save" data-id="${w.id || ''}" data-inbox="${extra.inboxId || ''}">حفظ</button></div>`);
}
const waitRow = (w, showWho = true) => `<div class="task${w.done ? ' done' : ''}"><button class="chk${w.done ? ' on' : ''}" data-act="wait-done" data-id="${w.id}" aria-label="وصلت">${w.done ? ic('check', 16) : ''}</button>
  <div class="body" data-act="wait-open" data-id="${w.id}" role="button" tabindex="0"><div class="name">${showWho ? `<b style="font-weight:600">${esc(w.who)}:</b> ` : ''}${esc(w.text)}</div>
  <div class="meta">${w.done ? `<span class="mut">وصلت ${fd(w.done_on)}</span>` : w.due_on ? `<span class="${w.due_on <= today() ? 'late' : 'mut'}">${dueTxt(w)}</span>` : ''}</div></div></div>`;

// كارت "مستني منه إيه" في صفحة الشخص
export async function waitingCard(m) {
  const L = (await list('waiting_for', { order: 'due_on' })).filter(w => w.member_id === m.id || (!w.member_id && w.who === m.name));
  const open = L.filter(w => !w.done), done = L.filter(w => w.done).slice(-3).reverse();
  return `<div class="card" style="padding:10px 14px"><div class="between"><b style="font-weight:600">مستني منه إيه</b><button class="btn sm" data-act="wait-new" data-who="${esc(m.name)}">${ic('plus', 16)}ضيف</button></div>
    <div class="list">${open.map(w => waitRow(w, false)).join('') || '<div class="mut" style="padding:8px 0;font-size:14px">مش مستني منه حاجة دلوقتي.</div>'}${done.map(w => waitRow(w, false)).join('')}</div></div>`;
}
// كارت في "النهاردة": اللي ميعاده جه أو عدّى
export async function todayWaitingCard() {
  const all = (await list('waiting_for', { order: 'due_on' })).filter(w => !w.done);
  const late = lateWaiting(all);
  if (!late.length) return all.length ? `<button class="card row" style="gap:10px;padding:10px 14px" data-act="wait-all">${ic('user', 18)}<span style="flex:1">مستني من حد: ${all.length} ${all.length === 1 ? 'حاجة' : 'حاجات'}، ولا حاجة ميعادها عدّى</span>${ic('chev', 16)}</button>` : '';
  return `<div class="between"><span class="sec">مستني من حد <span class="mut num">${late.length}</span></span><button class="btn sm" data-act="wait-all">الكل (${all.length})</button></div>
    <div class="card list" style="padding:4px 14px;border-color:var(--bad)">${late.map(w => waitRow(w)).join('')}</div>`;
}

// ---------------- حاجات أكلم فيها المالك ----------------
export async function ownerPointsCard(m) {
  const L = await list('owner_points', { eq: { member_id: m.id }, order: 'created_at' });
  const open = L.filter(x => x.status !== 'discussed'), past = L.filter(x => x.status === 'discussed').sort((a, b) => (b.discussed_on || '').localeCompare(a.discussed_on || ''));
  return `<div class="card" style="padding:10px 14px;border-color:var(--amb);border-width:1.5px"><div class="between"><b style="font-weight:600">حاجات أكلم فيها ${esc(m.name)}</b><span class="num mut">${open.length}</span></div>
    <div class="list">${open.map(x => `<div class="row" style="gap:8px;padding:8px 0"><span style="flex:1;line-height:1.5">${esc(x.text)}<br><small class="mut">من ${fd(x.created_at)}</small></span><button class="btn sm pri" data-act="op-talk" data-id="${x.id}">اتكلمنا</button><button class="star" data-act="op-del" data-id="${x.id}" aria-label="امسح">${ic('x', 16)}</button></div>`).join('') || '<div class="mut" style="padding:8px 0;font-size:14px">اكتب أي حاجة عايز تقولها، ولما تقعد معاه تلاقيها هنا.</div>'}</div>
    <form class="row" data-act-submit="op-add" data-member="${m.id}" style="margin-top:8px"><input class="inp" name="text" placeholder="+ حاجة عايز أكلمه فيها" autocomplete="off" data-mention><button class="btn sm">ضيف</button></form>
    ${past.length ? `<details style="margin-top:8px"><summary class="mut" style="cursor:pointer;min-height:36px">اتكلمنا فيها (${past.length})</summary><div class="list">${past.map(x => `<div style="padding:8px 0;line-height:1.6"><span class="mut">${fd(x.discussed_on)}</span> · ${esc(x.text)}${x.decision ? `<br><b style="font-weight:500">القرار:</b> ${esc(x.decision)}` : ''}${x.task_id ? ` <span class="chip">${ic('cal', 12)}مهمة</span>` : ''}</div>`).join('')}</div></details>` : ''}
  </div>`;
}

// ---------------- رسمة التقييم شهر بشهر ----------------
export async function trendCard(m, crit) {
  const R = (await list('member_ratings', { eq: { member_id: m.id }, order: 'month' })).filter(r => avgOf(r)).slice(-6);
  if (R.length < 2) return '';
  const bars = R.map(r => { const a = avgOf(r); return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;height:100%"><span class="num" style="font-size:11px">${a.toFixed(1)}</span><span style="width:100%;max-width:28px;border-radius:6px 6px 2px 2px;height:${Math.round(a / 5 * 80)}px;background:var(--ink)"></span><span style="font-size:11px;color:var(--mut)">${esc(fMonth(r.month).split(' ')[0])}</span></div>`; }).join('');
  const last = R[R.length - 1], prev = R[R.length - 2];
  const moves = crit.map(c => { const a = Number(last.scores?.[c]) || 0, b = Number(prev.scores?.[c]) || 0; return a && b && a !== b ? `<span class="tag ${a > b ? 'ok' : 'bad'}">${esc(c)} ${a > b ? '▲' : '▼'}</span>` : ''; }).join('');
  return `<div class="card stack" style="gap:8px"><div class="between"><b style="font-weight:600">تقييمه شهر بشهر</b><span class="mut" style="font-size:12px">المتوسط من 5</span></div>
    <div class="row" style="gap:6px;height:118px;align-items:flex-end">${bars}</div>${moves ? `<div class="row" style="flex-wrap:wrap;gap:6px">${moves}</div>` : ''}</div>`;
}

// ---------------- الخط الزمني ----------------
export async function timelineCard(m) {
  const [ratings, notes, links, waits, points] = await Promise.all([list('member_ratings', { eq: { member_id: m.id } }), list('member_notes', { eq: { member_id: m.id } }),
    linksOf('member', m.id), list('waiting_for'), list('owner_points', { eq: { member_id: m.id } })]);
  const E = [];
  if (m.started_on) E.push([m.started_on, 'user', `اتعيّن ${m.role ? '(' + m.role + ')' : ''}`]);
  if (!m.active && m.left_on) E.push([m.left_on, 'archive', 'مشي من الشركة']);
  for (const r of ratings) { const a = avgOf(r); if (a) E.push([r.month, 'star', `تقييم ${fMonth(r.month)}: ${a.toFixed(1)} من 5`]); }
  for (const x of notes) E.push([x.noted_on, 'review', (x.month ? 'تعليق الشهر: ' : 'رأيك: ') + x.text]);
  for (const l of links) {
    if (l.type === 'task' && l.row.done && l.row.done_at) E.push([l.row.done_at.slice(0, 10), 'check', 'خلصت مهمة: ' + l.title]);
    else if (l.type === 'problem') E.push([String(l.row.created_at || '').slice(0, 10), 'alert', 'مشكلة: ' + l.title]);
  }
  for (const w of waits.filter(w => w.member_id === m.id || (!w.member_id && w.who === m.name))) {
    E.push([String(w.created_at).slice(0, 10), 'user', 'طلبت منه: ' + w.text]);
    if (w.done && w.done_on) E.push([w.done_on, 'check', 'وصلت منه: ' + w.text]);
  }
  for (const p of points.filter(p => p.status === 'discussed')) E.push([p.discussed_on, 'review', 'اتكلمنا: ' + p.text + (p.decision ? ' ← ' + p.decision : '')]);
  E.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  if (!E.length) return '';
  const row = ([d, icn, t]) => `<div class="row" style="gap:10px;padding:7px 0;align-items:flex-start"><span class="mut num" style="width:52px;flex:none;font-size:12px;padding-top:2px">${fd(d)}</span>${ic(icn, 16)}<span style="flex:1;line-height:1.5;font-size:14px">${esc(String(t).slice(0, 140))}</span></div>`;
  return `<div class="card" style="padding:10px 14px"><b style="font-weight:600">اللي حصل معاه</b><div class="list">${E.slice(0, 8).map(row).join('')}</div>
    ${E.length > 8 ? `<details><summary class="mut" style="cursor:pointer;min-height:36px">الباقي (${E.length - 8})</summary><div class="list">${E.slice(8).map(row).join('')}</div></details>` : ''}</div>`;
}

export const peopleGlobal = {
  async 'wait-new'(el) { await waitSheet({}, { who: el.dataset.who || '' }); },
  async 'wait-open'(el) { const w = await one('waiting_for', el.dataset.id); w && waitSheet(w); },
  'wait-due'(el) { sheetEl().querySelector('[name=due_on]').value = addDays(today(), Number(el.dataset.v)); },
  async 'wait-save'(el) {
    const f = formOf(sheetEl()); if (!f.who) return toast('اكتب من مين'); if (!f.text) return toast('اكتب مستني منه إيه');
    const m = (await list('team_members')).find(x => x.name.trim() === f.who.trim());
    const row = { who: f.who, member_id: m?.id || null, text: f.text, due_on: f.due_on || null };
    try {
      if (el.dataset.id) await upd('waiting_for', el.dataset.id, row); else await ins('waiting_for', row);
      if (el.dataset.inbox) await upd('inbox', el.dataset.inbox, { archived_at: new Date().toISOString() });
      closeSheet(); toast(`اتسجل. هفكّرك ${row.due_on ? 'يوم ' + fd(row.due_on) : ''} لو موصلتش`); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'wait-done'(el) {
    const w = await one('waiting_for', el.dataset.id); if (!w) return;
    try { await upd('waiting_for', w.id, { done: !w.done, done_on: w.done ? null : today() }); if (!w.done) toast('تمام، وصلت'); doRefresh(); } catch (e) { fail(e); }
  },
  async 'wait-del'(el) { try { await del('waiting_for', el.dataset.id); closeSheet(); doRefresh(); } catch (e) { fail(e); } },
  async 'wait-all'() {
    const L = (await list('waiting_for', { order: 'due_on' })).filter(w => !w.done);
    openSheet('مستني من حد', `<div class="list">${L.map(w => waitRow(w)).join('') || '<div class="mut">مش مستني حاجة من حد.</div>'}</div><button class="btn pri" data-act="wait-new">${ic('plus', 18)}ضيف</button>`);
  },
  async 'op-add'(form) {
    const t = form.querySelector('[name=text]').value.trim(); if (!t) return;
    try { await ins('owner_points', { member_id: form.dataset.member, text: t }); doRefresh(); } catch (e) { fail(e); }
  },
  async 'op-talk'(el) {
    const x = await one('owner_points', el.dataset.id); if (!x) return;
    openSheet('اتكلمنا', `<div class="card" style="padding:10px 14px">${esc(x.text)}</div>
      <label class="field"><span>اتقرر إيه؟</span><textarea name="decision" rows="3" autofocus placeholder="مثلًا: وافق نغيّر المورد من أول الشهر"></textarea></label>
      <label class="row card" style="padding:10px 12px;gap:8px"><input type="checkbox" name="task" style="width:20px;height:20px"><span style="flex:1">اعمل القرار مهمة</span></label>
      <label class="field"><span>يوم المهمة</span><input type="date" name="due" value="${today()}"></label>
      <button class="btn pri" data-act="op-save" data-id="${x.id}">حفظ</button>`);
  },
  async 'op-save'(el) {
    const x = await one('owner_points', el.dataset.id), f = formOf(sheetEl());
    try {
      let task_id = null;
      if (f.task) { const t = await ins('tasks', { title: f.decision || x.text, due_on: f.due || today() }); task_id = t.id; if (x.member_id) await link('task', t.id, 'member', x.member_id); }
      await upd('owner_points', x.id, { status: 'discussed', decision: f.decision || null, discussed_on: today(), task_id });
      closeSheet(); toast(task_id ? 'اتسجل، واتعملت مهمة' : 'اتسجل'); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'op-del'(el) { try { await del('owner_points', el.dataset.id); doRefresh(); } catch (e) { fail(e); } },
};
