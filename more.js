// الكورسات، الهيكل والنظام، التوظيف، المهام المتكررة
import { list, one, ins, upd, del, rpc, link } from './db.js';
import { esc, ic, bat, fd, today, addDays, n, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, opts, sw } from './ui.js';
import { linksSlot, fillLinks, archiveWithUndo, doRefresh } from './comps.js';

const st = { course: 'active', org: 'tree', hire: '' };
const CSTAT = [['active', 'شغال فيها'], ['done', 'خلصت'], ['wishlist', 'عايز آخدها']];
const STAGE = [['applied', 'اتقدم', ''], ['interview', 'مقابلة', 'amb'], ['trial', 'تجربة', ''], ['hired', 'اتعين', 'ok'], ['rejected', 'اترفض', 'out']];
const DAYS = [[6, 'س'], [0, 'ح'], [1, 'ن'], [2, 'ث'], [3, 'ر'], [4, 'خ'], [5, 'ج']];
const DAYNAME = { 0: 'الأحد', 1: 'الاتنين', 2: 'التلات', 3: 'الأربع', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت' };
const pills = (group, items, cur) => `<div class="pills" data-group="${group}">${items.map(([k, l]) => `<button type="button" data-v="${k}" class="${String(cur) === String(k) ? 'on' : ''}" data-act="pick">${l}</button>`).join('')}</div>`;
const picked = group => sheetEl().querySelector(`[data-group=${group}] .on`)?.dataset.v;

// ---------------- الكورسات ----------------
function courseSheet(c = {}) {
  openSheet(c.id ? 'الكورس' : 'كورس جديد', `
    <label class="field"><span>اسم الكورس</span><input name="title" value="${esc(c.title)}" ${c.id ? '' : 'autofocus'} placeholder="مثلًا: الإدارة المالية"></label>
    <div class="field"><span>الحالة</span>${pills('cstat', CSTAT, c.status || 'active')}</div>
    <div class="grid2"><label class="field"><span>عدد الدروس</span><input name="lessons_total" inputmode="numeric" value="${c.lessons_total ?? ''}"></label>
    <label class="field"><span>خلصت كام</span><div class="row"><input name="lessons_done" inputmode="numeric" value="${c.lessons_done ?? 0}"><button type="button" class="btn sm" data-act="lesson-plus" aria-label="درس كمان">+1</button></div></label></div>
    <label class="field"><span>أهم حاجة اتعلمتها</span><textarea name="learned" rows="3">${esc(c.learned)}</textarea></label>
    <label class="field"><span>طبقته في إيه في الشغل؟</span><input name="applied_in" value="${esc(c.applied_in)}" placeholder="مثلًا: نظام التحصيل الجديد"></label>
    ${c.id ? linksSlot('course', c.id) : ''}
    <div class="btns">${c.id ? `<button class="btn" data-act="course-archive" data-id="${c.id}">${ic('archive', 18)}أرشيف</button>` : ''}<button class="btn pri" data-act="course-save" data-id="${c.id || ''}">حفظ</button></div>`);
  if (c.id) fillLinks(sheetEl());
}

// ---------------- الهيكل ----------------
function unitSheet(units, u = {}) {
  openSheet(u.id ? 'تعديل' : 'منصب أو قسم جديد', `
    <label class="field"><span>المنصب أو القسم</span><input name="title" value="${esc(u.title)}" autofocus placeholder="مثلًا: كول سنتر"></label>
    <div class="grid2"><label class="field"><span>مين ماسكه</span><input name="holder" value="${esc(u.holder)}"></label><label class="field"><span>عدد الأفراد</span><input name="headcount" inputmode="numeric" value="${u.headcount ?? ''}"></label></div>
    <label class="field"><span>تابع لـ</span><select name="parent_id"><option value="">مفيش (أعلى الهيكل)</option>${opts(units.filter(x => x.id !== u.id).map(x => [x.id, x.title]), u.parent_id)}</select></label>
    <div class="btns">${u.id ? `<button class="btn bad" data-act="unit-del" data-id="${u.id}">${ic('trash', 18)}امسح</button>` : ''}<button class="btn pri" data-act="unit-save" data-id="${u.id || ''}">حفظ</button></div>`);
}
function sopSheet(s = {}) {
  openSheet(s.id ? 'الإجراء' : 'إجراء جديد', `
    <label class="field"><span>اسم الإجراء</span><input name="title" value="${esc(s.title)}" ${s.id ? '' : 'autofocus'} placeholder="مثلًا: استلام جهاز من عميل"></label>
    <label class="field"><span>الخطوات (كل خطوة في سطر)</span><textarea name="body" rows="9">${esc(s.body)}</textarea></label>
    ${s.id ? `<label class="row card" style="padding:12px 14px"><input type="checkbox" name="bump" style="width:22px;height:22px"><span style="flex:1">ده تعديل كبير، احفظه كنسخة ${s.version + 1}</span></label>${linksSlot('sop', s.id)}` : ''}
    <div class="btns">${s.id ? `<button class="btn" data-act="sop-archive" data-id="${s.id}">${ic('archive', 18)}أرشيف</button>` : ''}<button class="btn pri" data-act="sop-save" data-id="${s.id || ''}">حفظ</button></div>`);
  if (s.id) fillLinks(sheetEl());
}
function roleSheet(r = {}) {
  openSheet(r.id ? esc(r.title) : 'وظيفة جديدة', `<label class="field"><span>الوظيفة</span><input name="title" value="${esc(r.title)}" autofocus></label>
    <label class="field"><span>الوصف الوظيفي والمسؤوليات</span><textarea name="description" rows="8">${esc(r.description)}</textarea></label>
    <button class="btn pri" data-act="role-save" data-id="${r.id || ''}">حفظ</button>`);
}
function tree(units, parent = null, depth = 0) {
  return units.filter(u => (u.parent_id || null) === parent).map(u => `
    <div style="margin-inline-start:${depth ? 18 : 0}px;${depth ? 'border-inline-start:2px solid var(--ink);padding-inline-start:10px' : ''}">
      <button class="card" data-act="unit-open" data-id="${u.id}" style="padding:10px 12px;margin:6px 0;${depth === 0 ? 'background:var(--dock);color:#fff;border-color:var(--dock)' : ''}">
        <div class="between"><b style="font-weight:600">${esc(u.title)}</b>${u.headcount ? `<span class="num" style="font-size:13px">${u.headcount}</span>` : ''}</div>${u.holder ? `<div style="font-size:12px;opacity:.75">${esc(u.holder)}</div>` : ''}</button>
      ${tree(units, u.id, depth + 1)}
    </div>`).join('');
}

// ---------------- التوظيف ----------------
async function candSheet(c = {}) {
  const positions = await list('positions', { order: 'created_at' });
  const nx = c.next_at ? new Date(c.next_at) : null;
  const local = nx ? new Date(nx.getTime() - nx.getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
  openSheet(c.id ? esc(c.name) : 'متقدم جديد', `
    <label class="field"><span>الاسم</span><input name="name" value="${esc(c.name)}" ${c.id ? '' : 'autofocus'}></label>
    <div class="grid2"><label class="field"><span>الموبايل</span><input name="phone" inputmode="tel" value="${esc(c.phone)}"></label>
    <label class="field"><span>على وظيفة</span><select name="position_id"><option value="">—</option>${opts(positions.filter(p => p.status === 'open' || p.id === c.position_id).map(p => [p.id, p.title]), c.position_id)}</select></label></div>
    <div class="field"><span>المرحلة</span>${pills('cstage', STAGE.map(s => [s[0], s[1]]), c.stage || 'applied')}</div>
    <label class="field"><span>الميعاد الجاي (مقابلة أو تجربة)</span><input type="datetime-local" name="next_at" value="${local}"></label>
    <p class="mut" style="margin:-6px 0 0">لو حطيت ميعاد، هيتعمل مهمة في يومها بتذكير.</p>
    <label class="field"><span>ملاحظات</span><textarea name="notes" rows="2">${esc(c.notes)}</textarea></label>
    <p class="mut" style="margin:0">لما تخليه "اتعين"، بيتضاف للتيم لوحده.</p>
    <div class="btns">${c.id ? `<button class="btn" data-act="cand-archive" data-id="${c.id}">${ic('archive', 18)}أرشيف</button>` : ''}<button class="btn pri" data-act="cand-save" data-id="${c.id || ''}">حفظ</button></div>`);
}
async function posSheet(p = {}) {
  const roles = (await list('role_criteria')).map(r => r.role);
  openSheet(p.id ? esc(p.title) : 'مكان فاضي جديد', `
    <label class="field"><span>المكان الفاضي</span><input name="title" value="${esc(p.title)}" autofocus placeholder="مثلًا: كول سنتر وردية مسائية"></label>
    <label class="field"><span>الوظيفة (بتحدد معايير التقييم بعد التعيين)</span><select name="role">${opts(roles, p.role || 'أخرى')}</select></label>
    ${p.id ? `<div class="field"><span>الحالة</span>${pills('pstat', [['open', 'مفتوح'], ['filled', 'اتملى'], ['closed', 'اتقفل']], p.status)}</div>${linksSlot('position', p.id)}` : ''}
    <div class="btns">${p.id ? `<button class="btn" data-act="pos-archive" data-id="${p.id}">${ic('archive', 18)}أرشيف</button>` : ''}<button class="btn pri" data-act="pos-save" data-id="${p.id || ''}">حفظ</button></div>`);
  if (p.id) fillLinks(sheetEl());
}

// ---------------- المتكرر ----------------
function recSheet(r = {}) {
  const rule = r.rule || 'weekly';
  const wd = r.weekdays || [new Date().getDay()];
  openSheet(r.id ? 'مهمة متكررة' : 'مهمة متكررة جديدة', `
    <label class="field"><span>المهمة</span><input name="title" value="${esc(r.title)}" ${r.id ? '' : 'autofocus'} placeholder="مثلًا: متابعة تحصيل حسابات المحلات"></label>
    <div class="field"><span>بتتكرر</span>${pills('rule', [['daily', 'كل يوم'], ['weekly', 'أيام معينة'], ['monthly', 'كل شهر']], rule)}</div>
    <div class="field" data-show="weekly" ${rule === 'weekly' ? '' : 'hidden'}><span>الأيام</span><div class="row" style="gap:5px" data-multi="days">${DAYS.map(([v, l]) => `<button type="button" class="btn sm${wd.includes(v) ? ' pri' : ''}" style="flex:1;padding:0" data-act="day-toggle" data-v="${v}" aria-label="${DAYNAME[v]}">${l}</button>`).join('')}</div></div>
    <label class="field" data-show="monthly" ${rule === 'monthly' ? '' : 'hidden'}><span>يوم كام في الشهر</span><input name="month_day" inputmode="numeric" value="${r.month_day ?? 1}"></label>
    <label class="field"><span>ذكّرني الساعة (اختياري)</span><input type="time" name="reminder_time" value="${r.reminder_time ? r.reminder_time.slice(0, 5) : ''}"></label>
    ${r.id ? `<div class="row card" style="padding:10px 14px"><span style="flex:1">شغالة</span>${sw(r.active, `data-act="rec-active" data-id="${r.id}"`)}</div>` : ''}
    <div class="btns">${r.id ? `<button class="btn" data-act="rec-archive" data-id="${r.id}">${ic('archive', 18)}شيلها</button>` : ''}<button class="btn pri" data-act="rec-save" data-id="${r.id || ''}">حفظ</button></div>`);
}
const recText = r => r.rule === 'daily' ? 'كل يوم' : r.rule === 'monthly' ? `يوم ${r.month_day} كل شهر` : 'كل ' + DAYS.filter(([v]) => (r.weekdays || []).includes(v)).map(([v]) => DAYNAME[v]).join(' و');

export default {
  courses: {
    async render() {
      const all = await list('courses', { order: 'created_at', asc: false });
      const L = all.filter(c => c.status === st.course);
      return {
        title: 'الكورسات', sub: `${all.filter(c => c.status === 'active').length} شغال فيهم · ${all.filter(c => c.status === 'done').length} خلصوا`, back: '#/today',
        fab: { label: 'كورس', act: 'course-new' },
        html: `<div class="stack"><div class="seg">${CSTAT.map(([k, l]) => `<button class="${st.course === k ? 'on' : ''}" data-act="ctab" data-v="${k}">${l} <span class="num">${all.filter(c => c.status === k).length}</span></button>`).join('')}</div>
          ${L.length ? L.map(c => { const p = c.lessons_total ? c.lessons_done / c.lessons_total * 100 : (c.status === 'done' ? 100 : 0);
            return `<button class="card stack" style="gap:8px" data-act="course-open" data-id="${c.id}"><div class="between"><span class="title">${esc(c.title)}</span><span class="mut">${c.lessons_total ? `${c.lessons_done} من ${c.lessons_total} دروس` : ''}</span></div>
              ${c.status !== 'wishlist' ? bat(p, c.status === 'done' ? 'done' : 'run') : ''}
              ${c.learned ? `<div class="mut" style="line-height:1.6">اتعلمت: <span style="color:var(--ink)">${esc(c.learned)}</span></div>` : ''}
              ${c.applied_in ? `<span class="chip" style="align-self:flex-start">${ic('link', 13)}طبقته في: ${esc(c.applied_in)}</span>` : (c.status === 'done' ? '<span class="late" style="font-size:13px">لسه ما اتطبقش في الشغل</span>' : '')}</button>`; }).join('')
            : empty(st.course === 'active' ? 'سجّل الكورسات اللي بتاخدها، وكام درس خلصت، وطبقت إيه منها.' : 'مفيش حاجة هنا لسه.')}</div>`,
      };
    },
    actions: { ctab(el) { st.course = el.dataset.v; doRefresh(); }, 'course-new': () => courseSheet(), async 'course-open'(el) { courseSheet(await one('courses', el.dataset.id)); } },
  },

  structure: {
    async render() {
      const [units, sops, roles] = await Promise.all([list('org_units', { order: 'sort' }), list('sops', { order: 'updated_at', asc: false }), list('job_roles', { order: 'title' })]);
      let body;
      if (st.org === 'tree') body = units.length ? `<div class="card" style="padding:8px 12px">${tree(units)}</div>` : empty('ابدأ بمالك الشركة، وبعدين ضيف المناصب والأقسام تحته.');
      else if (st.org === 'sops') body = sops.length ? `<div class="card list" style="padding:4px 14px">${sops.map(s => `<button class="lnk" data-act="sop-open" data-id="${s.id}"><span class="t">${esc(s.title)}<small>نسخة ${s.version} · آخر تعديل ${fd(s.updated_at)}</small></span>${ic('chev', 18)}</button>`).join('')}</div>` : empty('اكتب إجراءات الشغل: استلام جهاز، الإرجاع، التحصيل… واربط كل إجراء بالمشكلة اللي خلّتك تعمله.');
      else body = roles.length ? `<div class="card list" style="padding:4px 14px">${roles.map(r => `<button class="lnk" data-act="role-open" data-id="${r.id}"><span class="t">${esc(r.title)}<small>${esc((r.description || 'من غير وصف').slice(0, 70))}</small></span>${ic('chev', 18)}</button>`).join('')}</div>` : empty('اكتب الوصف الوظيفي لكل وظيفة في الشركة.');
      const fab = { tree: ['منصب', 'unit-new'], sops: ['إجراء', 'sop-new'], roles: ['وظيفة', 'role-new'] }[st.org];
      return {
        title: 'الهيكل والنظام', back: '#/today', fab: { label: fab[0], act: fab[1] },
        html: `<div class="stack"><div class="seg">${[['tree', 'الهيكل', units.length], ['sops', 'الإجراءات', sops.length], ['roles', 'الوظايف', roles.length]].map(([k, l, c]) => `<button class="${st.org === k ? 'on' : ''}" data-act="otab" data-v="${k}">${l} <span class="num">${c}</span></button>`).join('')}</div>${body}</div>`,
      };
    },
    actions: {
      otab(el) { st.org = el.dataset.v; doRefresh(); },
      async 'unit-new'() { unitSheet(await list('org_units', { order: 'sort' })); },
      async 'unit-open'(el) { const units = await list('org_units', { order: 'sort' }); unitSheet(units, units.find(u => u.id === el.dataset.id)); },
      'sop-new': () => sopSheet(), async 'sop-open'(el) { sopSheet(await one('sops', el.dataset.id)); },
      'role-new': () => roleSheet(), async 'role-open'(el) { roleSheet(await one('job_roles', el.dataset.id)); },
    },
  },

  hiring: {
    async render() {
      const [positions, cands] = await Promise.all([list('positions', { order: 'created_at', asc: false }), list('candidates', { order: 'created_at', asc: false })]);
      const open = positions.filter(p => p.status === 'open');
      const P = Object.fromEntries(positions.map(p => [p.id, p.title]));
      const active = cands.filter(c => !['hired', 'rejected'].includes(c.stage) && (!st.hire || c.position_id === st.hire));
      const past = cands.filter(c => ['hired', 'rejected'].includes(c.stage));
      const cRow = c => { const s = STAGE.find(x => x[0] === c.stage); return `<button class="lnk" data-act="cand-open" data-id="${c.id}"><span class="k disp" style="font-size:16px">${esc(c.name.trim()[0] || '؟')}</span><span class="t">${esc(c.name)}<small>${c.next_at ? (c.stage === 'trial' ? 'تجربة ' : 'ميعاد ') + fd(c.next_at) + ' ' + new Date(c.next_at).toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' }) : P[c.position_id] ? esc(P[c.position_id]) : ''}</small></span><span class="tag ${s[2]}">${s[1]}</span></button>`; };
      return {
        title: 'التوظيف', sub: `${open.length} مكان فاضي · ${active.length} متقدم`, back: '#/today',
        fab: { label: 'متقدم', act: 'cand-new' },
        html: `<div class="stack">
          <div class="between"><span class="sec" style="margin:0">أماكن فاضية</span><button class="btn sm" data-act="pos-new">${ic('plus', 16)}مكان</button></div>
          ${open.length ? open.map(p => { const pc = cands.filter(c => c.position_id === p.id);
            return `<button class="card stack" style="gap:10px" data-act="pos-open" data-id="${p.id}"><div class="disp" style="font-size:19px">${esc(p.title)}</div><div class="row" style="gap:6px">${STAGE.slice(0, 4).map(([k, l, cls]) => `<div style="flex:1;text-align:center;border-radius:10px;padding:6px 2px;${cls === 'amb' ? 'background:var(--amb);color:#15202B' : cls === 'ok' ? 'background:var(--ok);color:#fff' : 'background:var(--mat)'}"><div class="num" style="font-size:17px">${pc.filter(c => c.stage === k).length}</div><div style="font-size:11px">${l}</div></div>`).join('')}</div></button>`; }).join('')
            : '<div class="mut">مفيش أماكن فاضية دلوقتي.</div>'}
          ${open.length > 1 ? `<div class="pills"><button class="${st.hire ? '' : 'on'}" data-act="hf" data-v="">كل المتقدمين</button>${open.map(p => `<button class="${st.hire === p.id ? 'on' : ''}" data-act="hf" data-v="${p.id}">${esc(p.title)}</button>`).join('')}</div>` : ''}
          <div class="card" style="padding:8px 14px"><div class="between" style="padding-top:4px"><b style="font-weight:600">المتقدمين</b><span class="num mut">${active.length}</span></div><div class="list">${active.map(cRow).join('') || '<div class="mut" style="padding:8px 0">ضيف أي حد اتقدم، وتابعه من مقابلة لتجربة لتعيين.</div>'}</div></div>
          ${past.length ? `<details><summary class="mut" style="min-height:44px;cursor:pointer">اتعينوا أو اترفضوا (${past.length})</summary><div class="card list" style="padding:4px 14px">${past.map(cRow).join('')}</div></details>` : ''}
        </div>`,
      };
    },
    actions: { hf(el) { st.hire = el.dataset.v; doRefresh(); }, 'cand-new': () => candSheet(), async 'cand-open'(el) { candSheet(await one('candidates', el.dataset.id)); }, 'pos-new': () => posSheet(), async 'pos-open'(el) { posSheet(await one('positions', el.dataset.id)); } },
  },

  recurring: {
    async render() {
      const L = await list('recurring_tasks', { order: 'created_at' });
      return {
        title: 'المهام المتكررة', sub: 'بتنزل لوحدها في "النهاردة" في يومها', back: '#/today',
        fab: { label: 'مهمة متكررة', act: 'rec-new' },
        html: `<div class="stack">${L.length ? `<div class="card list" style="padding:4px 14px">${L.map(r => `<button class="lnk" data-act="rec-open" data-id="${r.id}" style="${r.active ? '' : 'opacity:.5'}"><span class="k">${ic('repeat', 18)}</span><span class="t">${esc(r.title)}<small>${recText(r)}${r.reminder_time ? ' · ' + r.reminder_time.slice(0, 5) : ''}${r.active ? '' : ' · واقفة'}</small></span>${ic('chev', 18)}</button>`).join('')}</div>` : empty('الحاجات اللي بتتعمل كل يوم أو كل أسبوع أو كل شهر، زي متابعة التحصيل أو مراجعة المرتجعات.')}</div>`,
      };
    },
    actions: { 'rec-new': () => recSheet(), async 'rec-open'(el) { recSheet(await one('recurring_tasks', el.dataset.id)); } },
  },
};

// actions الشيتات
const num = v => v === '' || v == null ? null : Number(v);
export const moreGlobal = {
  'lesson-plus'() { const i = sheetEl().querySelector('[name=lessons_done]'); i.value = (parseInt(i.value) || 0) + 1; },
  async 'course-save'(el) {
    const f = formOf(sheetEl()); if (!f.title) return toast('اكتب اسم الكورس');
    let status = picked('cstat') || 'active'; const tot = num(f.lessons_total), done = num(f.lessons_done) || 0;
    if (tot && done >= tot && status === 'active') { status = 'done'; toast('مبروك! الكورس خلص. متنساش تكتب طبقته في إيه'); }
    const row = { title: f.title, status, lessons_total: tot, lessons_done: done, learned: f.learned || null, applied_in: f.applied_in || null };
    try { if (el.dataset.id) await upd('courses', el.dataset.id, row); else await ins('courses', row); closeSheet(); doRefresh(); } catch (e) { fail(e); }
  },
  async 'course-archive'(el) { closeSheet(); await archiveWithUndo('courses', el.dataset.id, 'الكورس اتنقل للأرشيف'); },
  async 'unit-save'(el) {
    const f = formOf(sheetEl()); if (!f.title) return toast('اكتب المنصب');
    const row = { title: f.title, holder: f.holder || null, headcount: num(f.headcount), parent_id: f.parent_id || null };
    try { if (el.dataset.id) await upd('org_units', el.dataset.id, row); else await ins('org_units', { ...row, sort: Date.now() % 1e9 }); closeSheet(); doRefresh(); } catch (e) { fail(e); }
  },
  async 'unit-del'(el) { try { await del('org_units', el.dataset.id); closeSheet(); toast('اتمسح'); doRefresh(); } catch (e) { fail(e); } },
  async 'sop-save'(el) {
    const f = formOf(sheetEl()); if (!f.title) return toast('اكتب اسم الإجراء');
    try {
      if (el.dataset.id) { const s = await one('sops', el.dataset.id); await upd('sops', s.id, { title: f.title, body: f.body || null, version: f.bump ? s.version + 1 : s.version }); }
      else await ins('sops', { title: f.title, body: f.body || null });
      closeSheet(); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'sop-archive'(el) { closeSheet(); await archiveWithUndo('sops', el.dataset.id, 'الإجراء اتنقل للأرشيف'); },
  async 'role-save'(el) {
    const f = formOf(sheetEl()); if (!f.title) return toast('اكتب الوظيفة');
    try { if (el.dataset.id) await upd('job_roles', el.dataset.id, { title: f.title, description: f.description || null }); else await ins('job_roles', { title: f.title, description: f.description || null }); closeSheet(); doRefresh(); } catch (e) { fail(e); }
  },
  async 'pos-save'(el) {
    const f = formOf(sheetEl()); if (!f.title) return toast('اكتب المكان الفاضي');
    const row = { title: f.title, role: f.role, ...(el.dataset.id ? { status: picked('pstat') || 'open' } : {}) };
    try { if (el.dataset.id) await upd('positions', el.dataset.id, row); else await ins('positions', row); closeSheet(); doRefresh(); } catch (e) { fail(e); }
  },
  async 'pos-archive'(el) { closeSheet(); await archiveWithUndo('positions', el.dataset.id, 'اتنقل للأرشيف'); },
  async 'cand-save'(el) {
    const f = formOf(sheetEl()); if (!f.name) return toast('اكتب الاسم');
    const stage = picked('cstage') || 'applied';
    const next = f.next_at ? new Date(f.next_at).toISOString() : null;
    const row = { name: f.name, phone: f.phone || null, position_id: f.position_id || null, notes: f.notes || null, next_at: next };
    try {
      let c;
      if (el.dataset.id) {
        const old = await one('candidates', el.dataset.id);
        c = await upd('candidates', el.dataset.id, row);
        if (stage !== old.stage) c = await upd('candidates', el.dataset.id, { stage });
        if (next && next !== old.next_at) await meetingTask(c);
      } else {
        c = await ins('candidates', { ...row, stage });
        if (next) await meetingTask(c);
      }
      closeSheet(); toast(stage === 'hired' ? `${f.name} اتضاف للتيم` : 'اتحفظ'); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'cand-archive'(el) { closeSheet(); await archiveWithUndo('candidates', el.dataset.id, 'اتنقل للأرشيف'); },
  'day-toggle'(el) { el.classList.toggle('pri'); },
  async 'rec-active'(el) { try { await upd('recurring_tasks', el.dataset.id, { active: !el.classList.contains('on') }); el.classList.toggle('on'); doRefresh(); } catch (e) { fail(e); } },
  async 'rec-save'(el) {
    const s = sheetEl(); const f = formOf(s); if (!f.title) return toast('اكتب المهمة');
    const rule = picked('rule') || 'weekly';
    const weekdays = [...s.querySelectorAll('[data-multi=days] .pri')].map(b => Number(b.dataset.v));
    if (rule === 'weekly' && !weekdays.length) return toast('اختار يوم واحد على الأقل');
    const md = parseInt(f.month_day);
    const row = { title: f.title, rule, weekdays: rule === 'weekly' ? weekdays : null, month_day: rule === 'monthly' ? Math.min(Math.max(md || 1, 1), 31) : null, reminder_time: f.reminder_time || null };
    try { if (el.dataset.id) await upd('recurring_tasks', el.dataset.id, row); else await ins('recurring_tasks', row); await rpc('spawn_recurring'); closeSheet(); toast('اتحفظت'); doRefresh(); } catch (e) { fail(e); }
  },
  async 'rec-archive'(el) { closeSheet(); await archiveWithUndo('recurring_tasks', el.dataset.id, 'اتشالت'); },
};
// لما تختار نوع التكرار، اظهر الخانات المناسبة
document.addEventListener('click', e => {
  const b = e.target.closest('[data-group=rule] button'); if (!b) return;
  setTimeout(() => sheetEl().querySelectorAll('[data-show]').forEach(x => (x.hidden = x.dataset.show !== b.dataset.v)), 0);
});

async function meetingTask(c) {
  const d = new Date(c.next_at);
  const day = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 5);
  const label = c.stage === 'trial' ? 'تجربة' : 'مقابلة';
  const t = await ins('tasks', { title: `${label}: ${c.name}`, due_on: day, reminder_time: time });
  await link('task', t.id, 'candidate', c.id);
}
