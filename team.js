// التيم وصفحة كل فرد
import { list, one, ins, upd, del, upsert, linksOf } from './db.js';
import { esc, ic, fd, fMonth, today, monthStart, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, opts, dictate, LOC } from './ui.js';
import { stepsBlock, linksSlot, archiveWithUndo, doRefresh, openTask, taskRow } from './comps.js';
import { deptData, waitingCard, ownerPointsCard, trendCard, timelineCard, daysAgo } from './people.js';
import { xlsx, shareFile, printHtml, printTable } from './export.js';

const st = { former: false, dept: '' };
const lg = { kind: 'day', month: '' };   // سجل الآراء: نوعه (يومي/شهري) والشهر المختار
let noteRec = null;
const avg = r => { const v = Object.values(r?.scores || {}).map(Number).filter(Boolean); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null; };

// التواريخ بالشكل الكامل للسجل
const D = s => new Date(s.slice(0, 10) + 'T12:00');
const dayName = s => D(s).toLocaleDateString(LOC, { weekday: 'long' });
const fullDate = s => D(s).toLocaleDateString(LOC, { day: 'numeric', month: 'long', year: 'numeric' });
const timeOf = ts => { try { return new Date(ts).toLocaleTimeString(LOC, { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
const newest = (a, b) => (b.month || '').localeCompare(a.month || '') || (b.noted_on || '').localeCompare(a.noted_on || '') || (b.created_at || '').localeCompare(a.created_at || '');

// آراء الفرد: اليومية (من غير شهر) أو تعليقات الشهور (ليها شهر)
async function notesOf(memberId, kind) {
  const all = await list('member_notes', { eq: { member_id: memberId } });
  return all.filter(x => (kind === 'month' ? !!x.month : !x.month)).sort(newest);
}

// تعليق الشهر اللي بيدخل التقرير = كل تعليقات الشهر ده ورا بعض
async function syncComment(memberId, month) {
  const L = (await list('member_notes', { eq: { member_id: memberId, month } })).sort((a, b) => -newest(a, b));
  const comment = L.map(x => x.text).join(' · ') || null;
  const cur = (await list('member_ratings', { eq: { member_id: memberId, month } }))[0];
  if (cur) await upd('member_ratings', cur.id, { comment }); else if (comment) await ins('member_ratings', { member_id: memberId, month, scores: {}, comment });
}

async function criteria() { return Object.fromEntries((await list('role_criteria')).map(r => [r.role, r.criteria])); }

// اختيار الوظيفة متقسم بالأقسام
function roleOptions(dd, cur) {
  const byDept = dd.depts.map(d => [d, dd.roles.filter(r => r.department_id === d.id && r.role !== 'مالك')]).filter(([, L]) => L.length);
  const none = dd.roles.filter(r => !dd.D[r.department_id] && r.role !== 'مالك');
  const o = r => `<option value="${esc(r.role)}"${r.role === cur ? ' selected' : ''}>${esc(r.role)}</option>`;
  return byDept.map(([d, L]) => `<optgroup label="${esc(d.name)}">${L.map(o).join('')}</optgroup>`).join('') + (none.length ? `<optgroup label="من غير قسم">${none.map(o).join('')}</optgroup>` : '');
}
async function memberSheet(m = {}) {
  const dd = await deptData(), owner = !!m.is_owner;
  openSheet(owner ? (m.id ? 'المالك' : 'ضيف المالك') : m.id ? 'تعديل' : 'فرد جديد', `
    <label class="field"><span>الاسم</span><input name="name" value="${esc(m.name)}" autofocus></label>
    <div class="grid2">${owner ? `<input type="hidden" name="role" value="مالك"><input type="hidden" name="is_owner" value="1">` : `<label class="field"><span>الوظيفة</span><select name="role">${roleOptions(dd, m.role || 'فني')}</select></label>`}
    <label class="field"><span>بدأ معانا</span><input type="date" name="started_on" value="${m.started_on || ''}"></label></div>
    <label class="field"><span>نقط القوة وملاحظات عامة</span><textarea name="strengths" rows="3">${esc(m.strengths)}</textarea></label>
    <button class="btn pri" data-act="member-save" data-id="${m.id || ''}">حفظ</button>`);
}

// ---------------- سجل الآراء (ورقة فيها كل رأي وجمبه التاريخ) ----------------
async function logData(memberId) {
  const m = await one('team_members', memberId);
  const all = await notesOf(memberId, lg.kind);
  const keyOf = x => (lg.kind === 'month' ? x.month : x.noted_on).slice(0, 7);
  const months = [...new Set(all.map(keyOf))];
  if (lg.month && !months.includes(lg.month)) lg.month = '';
  const L = lg.month ? all.filter(x => keyOf(x) === lg.month) : all;
  const what = lg.kind === 'month' ? 'تعليقاتي الشهرية على' : 'رأيي في';
  const span = lg.month ? fMonth(lg.month + '-01') : 'كل الأيام';
  return { m, all, L, months, what, span };
}
function exportRows(L) {
  const asc = [...L].reverse();   // في الملف: من الأقدم للأحدث
  return lg.kind === 'month'
    ? { heads: ['الشهر', 'اتكتب يوم', 'التعليق'], rows: asc.map(x => [fMonth(x.month), `${dayName(x.noted_on)} ${fullDate(x.noted_on)}`, x.text]), widths: [16, 26, 70] }
    : { heads: ['التاريخ', 'اليوم', 'الرأي'], rows: asc.map(x => [fullDate(x.noted_on), dayName(x.noted_on), x.text]), widths: [18, 12, 70] };
}
async function logSheet(memberId) {
  const { m, all, L, months } = await logData(memberId);
  if (!m) return;
  const row = x => `<div class="row" style="padding:10px 0;align-items:flex-start;gap:12px">
      <div style="width:76px;flex:none;line-height:1.4">${lg.kind === 'month'
        ? `<b style="font-weight:600">${esc(fMonth(x.month).split(' ')[0])}</b><div class="mut" style="font-size:12px">اتكتب ${esc(fd(x.noted_on))}</div>`
        : `<b style="font-weight:600">${esc(fd(x.noted_on))}</b><div class="mut" style="font-size:12px">${esc(dayName(x.noted_on))}</div>`}</div>
      <div style="flex:1;line-height:1.6;white-space:pre-wrap">${esc(x.text)}</div></div>`;
  openSheet(`${lg.kind === 'month' ? 'سجل تعليقات الشهور' : 'سجل آرائي'}: ${esc(m.name)}`, `
    <div class="seg"><button class="${lg.kind === 'day' ? 'on' : ''}" data-act="log-kind" data-v="day" data-id="${m.id}">رأيي اليومي</button><button class="${lg.kind === 'month' ? 'on' : ''}" data-act="log-kind" data-v="month" data-id="${m.id}">تعليقات الشهور</button></div>
    ${months.length > 1 ? `<label class="field"><span>الفترة</span><select data-change="log-month" data-id="${m.id}"><option value="">كل الشهور (${all.length})</option>${months.map(k => `<option value="${k}" ${lg.month === k ? 'selected' : ''}>${esc(fMonth(k + '-01'))}</option>`).join('')}</select></label>` : ''}
    ${L.length ? `<div class="list" style="max-height:46vh;overflow:auto">${L.map(row).join('')}</div>
      <div class="btns"><button class="btn" data-act="log-pdf" data-id="${m.id}">${ic('doc', 18)}ملف PDF</button><button class="btn" data-act="log-xlsx" data-id="${m.id}">${ic('doc', 18)}ملف Excel</button></div>
      <p class="mut" style="margin:0">PDF: هتفتح صفحة الطباعة، اختار منها مشاركة أو "حفظ في الملفات". Excel: هتفتح قايمة المشاركة.</p>`
    : empty(lg.kind === 'month' ? 'لسه مفيش تعليقات على الشهور.' : 'لسه ماسجلتش رأي فيه.')}`);
}

export default {
  team: {
    dock: 'team',
    async render() {
      const mon = monthStart();
      const [members, ratings, notes] = await Promise.all([
        list('team_members', { order: 'name' }), list('member_ratings', { eq: { month: mon } }), list('member_notes', { order: 'noted_on', asc: false })]);
      const R = Object.fromEntries(ratings.map(r => [r.member_id, r]));
      const lastNote = {}; notes.filter(x => !x.month).sort(newest).forEach(x => { if (!lastNote[x.member_id]) lastNote[x.member_id] = x; });
      const dd = await deptData(), deptOf = m => dd.roleDept[m.role]?.id || '';
      const owners = members.filter(m => m.is_owner && m.active);
      const cur = members.filter(m => m.active && !m.is_owner), former = members.filter(m => !m.active && !m.is_owner);
      const depts = dd.depts.filter(d => cur.some(m => deptOf(m) === d.id));
      const L = (st.former ? former : cur).filter(m => !st.dept || deptOf(m) === st.dept);
      const deptAvg = d => { const A = cur.filter(m => deptOf(m) === d.id).map(m => Number(avg(R[m.id]))).filter(Boolean); return A.length ? (A.reduce((a, b) => a + b, 0) / A.length).toFixed(1) : null; };
      const rated = cur.filter(m => avg(R[m.id])).length;
      return {
        title: 'التيم', sub: `${cur.length} فرد · ${rated} اتقيموا في ${fMonth(mon).split(' ')[0]}`,
        fab: { label: 'فرد', act: 'member-new' },
        html: `<div class="stack">
          <div class="seg"><button class="${st.former ? '' : 'on'}" data-act="team-former" data-v="0">الحاليين <span class="num">${cur.length}</span></button><button class="${st.former ? 'on' : ''}" data-act="team-former" data-v="1">اللي مشيوا <span class="num">${former.length}</span></button></div>
          ${!st.former ? (owners.length ? owners.map(o => `<a class="card row" href="#/member/${o.id}" style="gap:12px;background:var(--dock);border-color:var(--dock);color:#fff"><span class="disp" style="width:46px;height:46px;border-radius:14px;background:var(--amb);color:#15202B;display:flex;align-items:center;justify-content:center;font-size:21px;flex:none">${esc(o.name.trim()[0] || '؟')}</span><span style="flex:1;line-height:1.4"><b>${esc(o.name)}</b><br><small style="color:#C9D2D9">المالك · حاجات أكلمه فيها، ومستني منه إيه</small></span>${ic('chev', 18)}</a>`).join('')
            : `<button class="card row" style="gap:10px;border-style:dashed" data-act="owner-new">${ic('user', 20)}<span style="flex:1">ضيف المالك (من غير تقييم)</span>${ic('plus', 18)}</button>`) : ''}
          ${depts.length > 1 && !st.former ? `<div class="pills"><button class="${st.dept ? '' : 'on'}" data-act="team-dept" data-v="">الكل <span class="num">${cur.length}</span></button>${depts.map(d => { const a = deptAvg(d); return `<button class="${st.dept === d.id ? 'on' : ''}" data-act="team-dept" data-v="${d.id}">${esc(d.name)} <span class="num">${cur.filter(m => deptOf(m) === d.id).length}</span>${a ? ` · ${a}` : ''}</button>`; }).join('')}</div>` : ''}
          ${L.length ? L.map(m => {
            const r = R[m.id]; const sc = r ? Object.entries(r.scores || {}).filter(([, v]) => v) : [];
            const ln = lastNote[m.id];
            return `<div class="card row" style="align-items:flex-start;gap:12px">
              <a href="#/member/${m.id}" class="disp" style="width:46px;height:46px;border-radius:14px;background:var(--ink);color:var(--paper);display:flex;align-items:center;justify-content:center;font-size:21px;flex:none;text-decoration:none">${esc(m.name.trim()[0] || '؟')}</a>
              <a href="#/member/${m.id}" style="flex:1;text-decoration:none;display:flex;flex-direction:column;gap:3px">
                <span class="row" style="gap:8px"><b style="font-weight:600">${esc(m.name)}</b><span class="chip">${esc(m.role)}</span></span>
                ${sc.length ? `<span class="row mut" style="flex-wrap:wrap;gap:4px 12px">${sc.map(([k, v]) => `<span>${esc(k)} <b class="num" style="color:var(--ink)">${v}</b></span>`).join('')}</span>` : (m.active ? `<span class="late" style="font-size:12px">لسه ماتقيمش الشهر ده</span>` : `<span class="mut">مشي ${fd(m.left_on)}</span>`)}
                ${ln ? `<span class="mut" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ln.noted_on === today() ? 'النهاردة' : fd(ln.noted_on)}: ${esc(ln.text)}</span>` : ''}
              </a>
              ${m.active ? `<button class="rb" style="width:40px;height:40px" data-act="note-quick" data-id="${m.id}" data-name="${esc(m.name)}" aria-label="رأيك في ${esc(m.name)} النهاردة">${ic('plus', 18)}</button>` : ''}
            </div>`;
          }).join('') : empty(st.former ? 'مفيش حد هنا.' : 'ضيف أفراد التيم من زرار "فرد".')}
        </div>`,
      };
    },
    actions: {
      'team-former'(el) { st.former = el.dataset.v === '1'; doRefresh(); },
      'team-dept'(el) { st.dept = el.dataset.v; doRefresh(); },
      'owner-new': () => memberSheet({ is_owner: true, role: 'مالك' }),
      'member-new': () => memberSheet(),
      'note-quick'(el) {
        openSheet(`رأيك في ${esc(el.dataset.name)} النهاردة`, `<div class="mut" style="margin:0">هيتسجل على يوم ${esc(fullDate(today()))}</div><textarea class="inp" name="text" rows="3" autofocus placeholder="اكتب أو استخدم مايك الكيبورد…"></textarea><p class="mut" style="margin:0">رأيك خاص بيك، ومش بيظهر في التقرير.</p><button class="btn pri" data-act="note-save" data-id="${el.dataset.id}">سجّل رأيي النهاردة</button>`);
      },
    },
  },

  member: {
    async render(p) {
      const m = await one('team_members', p.id);
      if (!m) return { title: 'فرد', back: '#/team', html: empty('الفرد ده مش موجود.') };
      const mon = st.month && st.memberId === m.id ? st.month : monthStart();
      const t = today();
      const [C, rate, prev, notes, mnotes, steps] = await Promise.all([
        criteria(), list('member_ratings', { eq: { member_id: m.id, month: mon } }),
        list('member_ratings', { eq: { member_id: m.id }, lt: ['month', mon], order: 'month', asc: false, limit: 1 }),
        notesOf(m.id, 'day'), notesOf(m.id, 'month'),
        list('plan_steps', { eq: { parent_type: 'member', parent_id: m.id }, order: 'sort' })]);
      const crit = C[m.role] || C['أخرى'] || ['الالتزام'];
      const r = rate[0] || { scores: {}, comment: '' };
      const pa = avg(prev[0]);
      const todays = notes.filter(x => x.noted_on === t);
      const monNotes = mnotes.filter(x => x.month === mon);
      const legacy = !monNotes.length && r.comment;   // تعليق قديم من قبل السجل
      const item = (label, x, act, extra = '') => `<div class="row" style="padding:8px 0;align-items:flex-start"><div style="flex:1;line-height:1.6"><span class="mut">${label}</span><br><span style="white-space:pre-wrap">${esc(x.text)}</span></div><button class="star" data-act="${act}" data-id="${x.id}" ${extra} aria-label="امسح">${ic('x', 16)}</button></div>`;
      // بيانات صفحة الشخص: مهامه، وآخر رأي، وكارت مستني منه، والخط الزمني
      const owner = !!m.is_owner;
      const tlinks = (await linksOf('member', m.id)).filter(l => l.type === 'task').map(l => l.row);
      const openT = tlinks.filter(x => !x.done).sort((a, b) => (a.due_on || '').localeCompare(b.due_on || '')), doneT = tlinks.filter(x => x.done);
      const lastNoteDays = notes.length ? daysAgo(notes[0].noted_on) : null;
      const ra = avg(r);
      const [waitC, trendC, timeC, ownerC] = await Promise.all([waitingCard(m), owner ? '' : trendCard(m, crit), timelineCard(m), owner ? ownerPointsCard(m) : '']);
      const alerts = owner || !m.active ? [] : [
        mon === monthStart() && !ra ? 'لسه مقيّمتوش الشهر ده' : '',
        lastNoteDays == null ? 'لسه مكتبتش عنه أي رأي' : lastNoteDays >= 14 ? `بقالك ${lastNoteDays} يوم مكتبتش عنه حاجة` : '',
      ].filter(Boolean);
      const stat = (v, l) => `<div style="flex:1;text-align:center"><div class="num" style="font-size:22px;line-height:1.2">${v}</div><div class="mut" style="font-size:12px">${l}</div></div>`;
      const noteCard = `<div class="card"><div class="between"><span style="font-weight:600">${owner ? 'ملاحظاتك عنه النهاردة' : 'رأيك فيه النهاردة'}</span><span class="chip">${esc(dayName(t))} ${esc(fd(t))}</span></div>
            <div class="mut" style="margin:2px 0 8px">خاص بيك، ومش بيدخل التقرير. وبيتسجل على تاريخ النهاردة.</div>
            <form class="stack" style="gap:8px" data-act-submit="note-add">
              <div class="row" style="align-items:flex-end"><textarea class="inp" name="text" rows="2" style="flex:1" placeholder="اكتب أو اتكلم…"></textarea><button type="button" class="rb amb" data-act="note-mic" aria-label="سجّل بصوتك">${ic('mic', 20)}</button></div>
              <button class="btn pri">${ic('check', 18)}سجّل ${owner ? 'الملاحظة' : 'رأيي النهاردة'}</button>
            </form>
            ${todays.length ? `<div class="list" style="margin-top:6px">${todays.map(x => item('النهاردة ' + timeOf(x.created_at), x, 'note-del')).join('')}</div>` : ''}
            <button class="btn sm" style="margin-top:10px;width:100%" data-act="log-open" data-kind="day">${ic('doc', 16)}سجل ${owner ? 'ملاحظاتي' : 'آرائي فيه'} <span class="num">(${notes.length})</span> · PDF أو Excel</button></div>`;
      const rateCard = `<div class="card"><div class="between"><span style="font-weight:600">التقييم الشهري</span><input type="month" class="inp" style="width:auto;min-height:38px" value="${mon.slice(0, 7)}" data-change="rate-month" aria-label="الشهر"></div>
            ${crit.map(c => `<div class="rate"><span>${esc(c)}</span>${[1, 2, 3, 4, 5].map(i => `<button class="${Number(r.scores?.[c]) === i ? 'on' : ''}" data-act="rate" data-c="${esc(c)}" data-v="${i}" data-month="${mon}" aria-label="${esc(c)} ${i}">${i}</button>`).join('')}</div>`).join('')}
            ${pa ? `<div class="mut" style="margin-top:6px">متوسط ${fMonth(prev[0].month)}: <b class="num" style="color:var(--ink)">${pa}</b></div>` : ''}
            <div style="border-top:1px dashed var(--line);margin-top:12px;padding-top:12px">
              <div style="font-weight:600;margin-bottom:8px">تعليقك على ${esc(fMonth(mon))}</div>
              <form class="stack" style="gap:8px" data-act-submit="mnote-add" data-month="${mon}">
                <textarea class="inp" name="text" rows="2" placeholder="اكتب تعليقك على الشهر…"></textarea>
                <button class="btn">${ic('check', 18)}سجّل التعليق</button>
              </form>
              ${monNotes.length ? `<div class="list" style="margin-top:6px">${monNotes.map(x => item('اتكتب ' + fd(x.noted_on), x, 'mnote-del', `data-month="${mon}"`)).join('')}</div>` : ''}
              ${legacy ? `<div class="mut" style="margin-top:8px;white-space:pre-wrap">${esc(r.comment)}</div>` : ''}
              <button class="btn sm" style="margin-top:10px;width:100%" data-act="log-open" data-kind="month">${ic('doc', 16)}سجل تعليقات الشهور <span class="num">(${mnotes.length})</span> · PDF أو Excel</button>
            </div></div>`;
      const tasksCard = `<div class="card" style="padding:4px 14px"><div class="between" style="padding-top:8px"><span style="font-weight:600">مهامه</span><button class="btn sm" data-act="member-task">${ic('plus', 16)}مهمة</button></div>
            <div class="list">${openT.map(x => taskRow(x, { showStar: false })).join('') || '<div class="mut" style="padding:10px 0;font-size:14px">مفيش مهام مفتوحة مربوطة بيه.</div>'}</div>
            ${doneT.length ? `<details><summary class="mut" style="cursor:pointer;min-height:36px">خلصت (${doneT.length})</summary><div class="list">${doneT.slice(-10).reverse().map(x => taskRow(x, { showStar: false })).join('')}</div></details>` : ''}</div>`;
      return {
        title: m.name, sub: `${owner ? 'المالك' : m.role}${m.started_on ? ' · معانا من ' + fd(m.started_on) : ''}${m.active ? '' : ' · مشي'}`, back: '#/team',
        html: `<div class="stack" style="padding-bottom:20px">
          <div class="card row" style="padding:12px 6px">${owner ? '' : stat(ra ? ra : '—', 'تقييمه الشهر ده')}${stat(openT.length, 'مهام مفتوحة')}${stat(lastNoteDays == null ? '—' : lastNoteDays === 0 ? 'النهاردة' : lastNoteDays, lastNoteDays && lastNoteDays > 0 ? 'يوم من آخر رأي' : 'آخر رأي')}</div>
          ${alerts.map(a => `<div class="card row" style="gap:8px;padding:10px 14px;background:var(--amb-soft);border-color:var(--amb)">${ic('bell', 18)}<span style="flex:1;font-size:14px">${a}</span></div>`).join('')}
          ${ownerC}
          ${waitC}
          ${owner ? '' : trendC + rateCard}
          ${noteCard}
          ${tasksCard}
          ${owner ? '' : stepsBlock('member', m.id, steps, 'خطة تطويره')}
          ${m.strengths ? `<div class="card"><div class="mut" style="font-weight:600">${owner ? 'ملاحظات عامة' : 'نقط القوة وملاحظات'}</div><div style="white-space:pre-wrap">${esc(m.strengths)}</div></div>` : ''}
          ${timeC}
          ${linksSlot('member', m.id, ['task'])}
          <div class="btns"><button class="btn sm" data-act="member-edit">${ic('edit', 16)}تعديل</button>${owner ? '' : `<button class="btn sm" data-act="member-leave">${m.active ? 'مشي من الشركة' : 'رجع الشغل'}</button>`}<button class="btn sm" data-act="member-archive">${ic('archive', 16)}أرشيف</button></div>
        </div>`,
      };
    },
    after(main, p) { st.memberId = p.id; },
    actions: {
      async rate(el, p) {
        try {
          const cur = (await list('member_ratings', { eq: { member_id: p.id, month: el.dataset.month } }))[0];
          const scores = { ...(cur?.scores || {}) }; const v = Number(el.dataset.v);
          scores[el.dataset.c] = scores[el.dataset.c] === v ? 0 : v;
          if (cur) await upd('member_ratings', cur.id, { scores }); else await ins('member_ratings', { member_id: p.id, month: el.dataset.month, scores });
          doRefresh();
        } catch (e) { fail(e); }
      },
      'rate-month'(el) { if (el.value) { st.month = el.value + '-01'; doRefresh(); } },
      // رأي النهاردة: بيتسجل على تاريخ النهاردة
      async 'note-add'(form, p) {
        const t = form.querySelector('[name=text]').value.trim(); if (!t) return toast('اكتب رأيك الأول');
        if (noteRec) noteRec.stop();
        try { await ins('member_notes', { member_id: p.id, text: t, noted_on: today() }); toast('رأيك اتسجل على النهاردة'); doRefresh(); } catch (e) { fail(e); }
      },
      'note-mic'(el) {
        const inp = el.closest('form').querySelector('[name=text]');
        if (noteRec) { noteRec.stop(); return; }
        const pre = inp.value.trim() ? inp.value.trim() + ' ' : '';
        noteRec = dictate(t => (inp.value = pre + t), live => { el.classList.toggle('live', live); if (!live) noteRec = null; });
        if (!noteRec) { inp.focus(); toast('دوس على مايك الكيبورد واتكلم'); }
      },
      async 'note-del'(el) { try { await del('member_notes', el.dataset.id); doRefresh(); } catch (e) { fail(e); } },
      // تعليق الشهر: كل تعليق بيتسجل لوحده وجمبه يوم ما اتكتب
      async 'mnote-add'(form, p) {
        const t = form.querySelector('[name=text]').value.trim(); if (!t) return toast('اكتب التعليق الأول');
        try { await ins('member_notes', { member_id: p.id, text: t, noted_on: today(), month: form.dataset.month }); await syncComment(p.id, form.dataset.month); toast('التعليق اتسجل'); doRefresh(); } catch (e) { fail(e); }
      },
      async 'mnote-del'(el, p) { try { await del('member_notes', el.dataset.id); await syncComment(p.id, el.dataset.month); doRefresh(); } catch (e) { fail(e); } },
      'log-open'(el, p) { lg.kind = el.dataset.kind; lg.month = ''; logSheet(p.id); },
      async 'member-edit'(el, p) { memberSheet(await one('team_members', p.id)); },
      async 'member-task'(el, p) { const m = await one('team_members', p.id); openTask(null, { _link: { type: 'member', id: m.id, title: m.name } }); },
      async 'member-leave'(el, p) { const m = await one('team_members', p.id); try { await upd('team_members', p.id, { active: !m.active }); doRefresh(); } catch (e) { fail(e); } },
      async 'member-archive'(el, p) { await archiveWithUndo('team_members', p.id, 'اتنقل للأرشيف', () => (location.hash = '#/team')); },
    },
  },
};

// actions اللي بتشتغل من الشيت في أي شاشة
export const teamGlobal = {
  async 'member-save'(el) {
    const f = formOf(sheetEl()); if (!f.name) return toast('اكتب الاسم');
    const row = { name: f.name, role: f.role, started_on: f.started_on || null, strengths: f.strengths || null };
    if (f.is_owner) row.is_owner = true;
    try { if (el.dataset.id) await upd('team_members', el.dataset.id, row); else await ins('team_members', row); closeSheet(); doRefresh(); } catch (e) { fail(e); }
  },
  async 'note-save'(el) {
    const f = formOf(sheetEl()); if (!f.text) return toast('اكتب رأيك');
    try { await ins('member_notes', { member_id: el.dataset.id, text: f.text, noted_on: today() }); closeSheet(); toast('رأيك اتسجل على النهاردة'); doRefresh(); } catch (e) { fail(e); }
  },
  // سجل الآراء
  'log-kind'(el) { lg.kind = el.dataset.v; lg.month = ''; logSheet(el.dataset.id); },
  'log-month'(el) { lg.month = el.value; logSheet(el.dataset.id); },
  async 'log-pdf'(el) {
    const { m, L, what, span } = await logData(el.dataset.id); if (!L.length) return;
    const x = exportRows(L);
    printHtml(`<h1>سجل ${what} ${esc(m.name)}</h1><p class="per">${esc(m.role)} · ${esc(span)} · ${L.length} ${lg.kind === 'month' ? 'تعليق' : 'رأي'} · اتطبع ${esc(fullDate(today()))}</p>${printTable(x.heads, x.rows)}`);
  },
  async 'log-xlsx'(el) {
    const { m, L } = await logData(el.dataset.id); if (!L.length) return;
    const x = exportRows(L);
    const name = `${lg.kind === 'month' ? 'تعليقات الشهور' : 'رأيي'} - ${m.name}${lg.month ? ' - ' + lg.month : ''}.xlsx`.replace(/[\\/:*?"<>|]/g, '');
    try { await shareFile(xlsx([x.heads, ...x.rows], { sheet: lg.kind === 'month' ? 'تعليقات الشهور' : 'رأيي اليومي', widths: x.widths }), name); } catch (e) { fail(e); }
  },
};
