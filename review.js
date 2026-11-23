// المراجعة الأسبوعية، التقويم، التقرير للمالك
import { list, single, ins, upd, upsert, currentCompany } from './db.js';
import { esc, ic, fd, fMonth, today, addDays, weekStart, monthStart, n, empty, toast, fail, formOf, LOC } from './ui.js';
import { doRefresh, openTask, archiveWithUndo } from './comps.js';
import { link } from './db.js';
import { dormantDays, SLEEP_DAYS } from './goals.js';
import { courseLate } from './more.js';
import { habitStats } from './habits.js';
import { smartCheck } from './goalwiz.js';
import { lateWaiting, daysAgo } from './people.js';
import { inboxCard } from './inbox.js';
import { monthNumbers } from './compare.js';
import { decisionsDue } from './lessons.js';
import { applyDue } from './learn.js';

// "حاجات مستنياك": كل اللي محتاج منك قرار أو متابعة، في كارت واحد، وكل سطر بيوديك للحاجة نفسها
async function waitingForYou(ws) {
  const t = today(), ms = monthStart();
  const [tasks, waits, courses, goals, members, ratings, notes, problems] = await Promise.all([list('tasks'), list('waiting_for'), list('courses'), list('goals', { eq: { status: 'active' } }),
    list('team_members'), list('member_ratings', { eq: { month: ms } }), list('member_notes'), list('problems')]);
  const lateT = tasks.filter(x => !x.done && x.due_on < t), lateW = lateWaiting(waits);
  const lateC = courses.map(c => ({ c, lt: courseLate(c) })).filter(x => x.lt.missed.length);
  const hb = await habitStats(ws, t);
  const badG = goals.filter(g => (g.due_on && g.due_on < t) || !smartCheck(g).ok);
  const team = members.filter(m => m.active && !m.is_owner);
  const unrated = team.filter(m => !ratings.some(r => r.member_id === m.id && Object.values(r.scores || {}).some(Number)));
  const quiet = team.filter(m => { const last = notes.filter(x => x.member_id === m.id && !x.month).map(x => x.noted_on).sort().pop(); return !last || daysAgo(last) >= 14; });
  const oldP = problems.filter(p => p.status !== 'solved' && daysAgo(p.created_at) > 14);
  const [decs, learns] = await Promise.all([decisionsDue(), applyDue()]);
  const names = (L, k = 'name') => esc(L.slice(0, 3).map(x => x[k]).join('، ') + (L.length > 3 ? '…' : ''));
  const row = (n, icon, text, sub, href, act = '') => n ? `<${href ? `a href="${href}"` : `button data-act="${act}"`} class="lnk"><span class="k">${ic(icon, 18)}</span><span class="t">${text}<small>${sub}</small></span><b class="num">${n}</b></${href ? 'a' : 'button'}>` : '';
  const rows = [
    row(lateT.length, 'cal', 'مهام متأخرة', names(lateT, 'title'), '#/today'),
    row(lateW.length, 'user', 'مستني من حد وميعاده عدّى', esc(lateW.slice(0, 3).map(w => w.who).join('، ')), '', 'wait-all'),
    row(lateC.length, 'book', 'كورسات فاتتك', esc(lateC.map(x => `${x.c.title} (${x.lt.days} يوم)`).slice(0, 2).join('، ')), '#/courses'),
    hb.planned ? row(`${hb.pct}%`, 'repeat', 'التزامك بعاداتك الأسبوع ده', `${hb.done} من ${hb.planned}`, '#/habits') : '',
    row(badG.length, 'goal', 'أهداف متأخرة أو ناقصة', names(badG, 'title'), '#/goals'),
    row(unrated.length, 'star', 'لسه ماقيّمتهمش الشهر ده', names(unrated), '#/team'),
    row(quiet.length, 'review', 'بقالك أسبوعين مكتبتش عنهم', names(quiet), '#/team'),
    row(decs.length, 'check', 'قرارات جه ميعاد مراجعتها', names(decs, 'title'), '#/lessons'),
    row(learns.length, 'book', 'حاجات اتعلمتها: طبّقتها؟', names(learns, 'text'), '#/courses'),
    row(oldP.length, 'alert', 'مشاكل مفتوحة بقالها أكتر من أسبوعين', names(oldP, 'title'), '#/problems'),
  ].filter(Boolean);
  return `<div class="card" style="padding:10px 14px"><b style="font-weight:600">حاجات مستنياك</b>${rows.length ? `<div class="list">${rows.join('')}</div>` : '<div class="mut" style="padding:8px 0">مفيش حاجة مستنياك. أسبوع نضيف.</div>'}</div>`;
}
// الأسبوع ده قصاد اللي فات (نفس عدد الأيام)
async function weekVsLast(ws) {
  const t = today(), n = Math.round((Date.parse(t) - Date.parse(ws)) / 864e5), pws = addDays(ws, -7);
  const [A, B] = await Promise.all([monthNumbers([ws, t]), monthNumbers([pws, addDays(pws, n)])]);
  const R = [['tasks', 'مهام خلصت'], ['goals', 'أهداف اتحققت'], ['solved', 'مشاكل اتحلت'], ['work', 'ساعات شغل', 'س'], ['habits', 'العادات', '%']].filter(([k]) => A[k] || B[k]);
  if (!R.length) return '';
  return `<div class="card" style="padding:10px 14px"><div class="between"><b style="font-weight:600">الأسبوع ده قصاد اللي فات</b><a href="#/numbers?tab=months" class="mut" style="font-size:13px">أرقامي</a></div>
    <div class="list">${R.map(([k, l, u = '']) => { const a = A[k], b = B[k], c = a > b ? 'ok' : a < b ? 'bad' : ''; return `<div class="row" style="gap:8px;padding:7px 0"><span style="flex:1">${l}</span><b class="num">${n0(a)}${u}</b><span class="mut num" style="font-size:13px">قصاد ${n0(b)}${u}</span><span class="tag ${c}" style="min-width:22px;text-align:center">${a > b ? '▲' : a < b ? '▼' : '='}</span></div>`; }).join('')}</div></div>`;
}
const n0 = v => n(v);
// أهم 3 حاجات + الهدف اللي كل واحدة بتخدمه (بنفس الترتيب)
const top3Of = f => { const P = [0, 1, 2].map(i => [f['t' + i], f['g' + i] || '']).filter(x => x[0]); return { next_top3: P.map(x => x[0]), top3_goals: P.map(x => x[1]) }; };
import { companyProgress, progressReport } from './insights.js';

const st = { month: today().slice(0, 7), day: today(), rep: 'month', from: '', to: '' };
const SECTIONS = [['status', 'الوضع الحالي ومؤشرات الشركة'], ['progress', 'تقدّم الشركة نحو الأهداف (بالنسب)'], ['log', 'الإنجازات وسجل التطورات'], ['goals', 'الأهداف الجارية'], ['team', 'تقييم التيم'], ['problems', 'المشاكل والحلول'], ['plan', 'الخطة الجاية']];
const secPrefs = () => { try { return JSON.parse(localStorage.getItem('nota.repsec')) || {}; } catch (e) { return {}; } };
const secOn = k => secPrefs()[k] !== false;

// ---------------- التقرير ----------------
function period() {
  const t = today();
  if (st.rep === 'week') return [addDays(t, -6), t];
  if (st.rep === 'last') { const d = new Date(); d.setDate(0); const to = d.toISOString().slice(0, 10); return [to.slice(0, 7) + '-01', to]; }
  if (st.rep === 'custom' && st.from && st.to) return [st.from, st.to];
  return [monthStart(), t];
}
async function buildReport() {
  const [from, to] = period();
  const inR = d => d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
  const [co, metrics, log, goals, prog, members, ratings, crit, problems, ideas, positions] = await Promise.all([
    currentCompany().then(c => c || single('company')), list('company_metrics', { order: 'sort' }), list('company_log', { gte: ['happened_on', from], lte: ['happened_on', to], order: 'happened_on' }),
    list('goals', { order: 'due_on' }), list('v_goal_progress'), list('team_members', { eq: { active: true }, order: 'name' }),
    list('member_ratings', { eq: { month: to.slice(0, 7) + '-01' } }), list('role_criteria'), list('problems'), list('ideas', { eq: { stage: 'ready' } }), list('positions', { eq: { status: 'open' } })]);
  const P = Object.fromEntries(prog.map(p => [p.id, p.progress]));
  const C = Object.fromEntries(crit.map(c => [c.role, c.criteria]));
  const R = Object.fromEntries(ratings.map(r => [r.member_id, r]));
  const S = []; const b = '• ';
  S.push({ h: null, lines: [`تقرير تطوير الأعمال — ${co?.name || ''}`, `الفترة: من ${fd(from)} إلى ${fd(to)}`] });
  if (secOn('status')) S.push({ h: 'الوضع الحالي للشركة', lines: [...(co?.status_text ? [co.status_text] : []), ...metrics.map(m => b + `${m.label}: ${n(m.value)}${m.unit ? ' ' + m.unit : ''}`), b + `عدد أفراد التيم: ${members.length}`] });
  if (secOn('progress')) { const pr = progressReport(await companyProgress()); S.push({ h: 'تقدّم الشركة نحو الأهداف', lines: pr.lines, svg: pr.svg }); }
  if (secOn('log')) { const dn = goals.filter(g => g.status === 'done' && inR(g.done_on)).length; S.push({ h: `الإنجازات والتطورات (${dn} هدف اتحقق)`, lines: log.length ? log.map(x => b + `${fd(x.happened_on)}: ${x.text}`) : ['لا يوجد في الفترة دي.'] }); }
  if (secOn('goals')) { const act = goals.filter(g => g.status === 'active'); S.push({ h: 'الأهداف الجارية', lines: act.length ? act.map(g => b + `${g.title} — ${P[g.id] || 0}%${g.due_on ? ' — الموعد ' + fd(g.due_on) + (g.due_on < today() ? ' (متأخر)' : '') : ''}`) : ['لا يوجد.'] }); }
  if (secOn('team')) S.push({ h: `تقييم التيم — ${fMonth(to)}`, lines: members.length ? members.map(m => { const r = R[m.id]; const cr = C[m.role] || Object.keys(r?.scores || {}); const sc = r ? cr.filter(c => r.scores?.[c]).map(c => `${c} ${r.scores[c]}/5`).join('، ') : ''; return b + `${m.name} (${m.role}): ${sc || 'لم يُقيَّم'}${r?.comment ? ' — ' + r.comment : ''}`; }) : ['لا يوجد.'] });
  if (secOn('problems')) { const solved = problems.filter(p => p.status === 'solved' && inR(p.solved_on)), opened = problems.filter(p => inR(p.created_at)), open = problems.filter(p => p.status !== 'solved');
    S.push({ h: `المشاكل (${opened.length} جديدة · ${solved.length} اتحلت · ${open.length} مفتوحة)`, lines: [...solved.map(p => b + `اتحلت: ${p.title}${p.solution ? ' — الحل: ' + p.solution : ''}`), ...open.map(p => b + `مفتوحة: ${p.title}${p.occurrences > 1 ? ` (اتكررت ${p.occurrences} مرات)` : ''}`)].slice(0, 15) });
    if (!S[S.length - 1].lines.length) S[S.length - 1].lines.push('لا يوجد.'); }
  if (secOn('plan')) { const nxt = goals.filter(g => g.status === 'active' && g.due_on && g.due_on > to && g.due_on <= addDays(to, 30));
    const lines = [...nxt.map(g => b + `${g.title} — قبل ${fd(g.due_on)}`), ...ideas.map(i => b + `مقترح: ${i.title}`), ...positions.map(p => b + `توظيف: ${p.title}`)];
    S.push({ h: 'الخطة الجاية', lines: lines.length ? lines : ['لا يوجد.'] }); }
  const text = S.map(s => (s.h ? s.h + '\n' : '') + s.lines.join('\n')).join('\n\n');
  const html = S.map((s, i) => i === 0 ? `<h1>${esc(s.lines[0])}</h1><p class="per">${esc(s.lines[1])}</p>` : `<h2>${esc(s.h)}</h2>${s.lines.map(l => `<p>${esc(l)}</p>`).join('')}${s.svg || ''}`).join('');
  return { text, html, from, to };
}

// ---------------- التقويم ----------------
const KC = { task: ['مهمة', 'var(--ink)'], goal: ['موعد هدف', 'var(--amb)'], interview: ['مقابلة', 'var(--ok)'], commitment: ['ميعاد دفع', 'var(--mut)'], installment: ['ميعاد دفع', 'var(--mut)'] };

export default {
  weekly: {
    async render() {
      const ws = weekStart(), we = addDays(ws, 6), t = today();
      // الأفكار النايمة: عادية وأفكار تطوير في المشاريع، بقالها شهر محدش لمسها
      const [allIdeas, allDevs, projects] = await Promise.all([list('ideas'), list('project_devs'), list('projects')]);
      const PN = Object.fromEntries(projects.map(p => [p.id, p.name]));
      const sleepy = [...allIdeas.map(i => ({ t: 'idea', r: i, d: dormantDays(i), where: 'فكرة' })), ...allDevs.map(x => ({ t: 'dev', r: x, d: dormantDays(x), where: PN[x.project_id] ? 'مشروع ' + PN[x.project_id] : 'مشروع' }))]
        .filter(x => x.d).sort((a, b) => b.d - a.d);
      const [rev, tasks, goals, probs, devs, past] = await Promise.all([
        list('weekly_reviews', { eq: { week_start: ws } }), list('tasks', { gte: ['due_on', ws], lte: ['due_on', we] }),
        list('goals', { eq: { status: 'done' }, gte: ['done_on', ws] }), list('problems', { eq: { status: 'solved' }, gte: ['solved_on', ws] }),
        list('project_devs', { eq: { stage: 'applied' }, gte: ['applied_on', ws] }), list('weekly_reviews', { lt: ['week_start', ws], order: 'week_start', asc: false, limit: 8 })]);
      const r = rev[0] || { went_well: '', blocked: '', next_top3: [] };
      const [hub, ibx, wvl] = await Promise.all([waitingForYou(ws), inboxCard(), weekVsLast(ws)]);
      const top = [0, 1, 2].map(i => r.next_top3?.[i] || ''), topG = [0, 1, 2].map(i => (r.top3_goals || [])[i] || '');
      const actG = await list('goals', { eq: { status: 'active' }, order: 'title' });
      const gSel = i => actG.length ? `<select class="inp" name="g${i}" style="min-height:38px;font-size:13px" aria-label="بيخدم أنهي هدف"><option value="">بيخدم أنهي هدف؟ (اختياري)</option>${actG.map(g => `<option value="${g.id}"${g.id === topG[i] ? ' selected' : ''}>${esc(g.title)}</option>`).join('')}</select>` : '';
      const stat = (v, l) => `<div><div class="num" style="font-size:22px">${v}</div><div style="font-size:12px;color:#C9D2D9">${l}</div></div>`;
      return {
        title: 'مراجعة الأسبوع', sub: `${fd(ws)} – ${fd(we)}`, back: '#/today',
        html: `<div class="stack" style="padding-bottom:20px">
          <div class="card" style="background:var(--dock);border-color:var(--dock);color:#fff;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
            ${stat(`${tasks.filter(x => x.done).length}/${tasks.length}`, 'مهام خلصت')}${stat(goals.length, 'هدف اتحقق')}${stat(probs.length, 'مشاكل اتحلت')}${stat(devs.length, 'تطوير اتطبق في مشاريعي')}</div>
          ${hub}
          ${ibx}
          ${wvl}
          ${sleepy.length ? `<div class="card stack" style="gap:8px"><div class="row" style="gap:6px">${ic('moon', 20)}<b style="font-weight:600;flex:1">أفكار نايمة</b><span class="num mut">${sleepy.length}</span></div>
            <div class="mut" style="font-size:13px">بقالها ${SLEEP_DAYS} يوم أو أكتر محدش لمسها. قرّر: تطوّرها ولا تشيلها؟</div>
            <div class="list">${sleepy.slice(0, 6).map(x => `<div style="padding:8px 0"><a href="${x.t === 'idea' ? '#/idea/' : '#/dev/'}${x.r.id}" style="display:block;line-height:1.4"><b style="font-weight:500">${esc(x.r.title)}</b><br><small class="mut">${esc(x.where)} · نايمة من ${x.d} يوم</small></a>
              <div class="row" style="gap:6px;margin-top:6px"><button class="btn sm pri" data-act="wake" data-t="${x.t}" data-id="${x.r.id}">هطوّرها</button><button class="btn sm" data-act="sleep-archive" data-t="${x.t}" data-id="${x.r.id}">${ic('archive', 16)}شيلها</button></div></div>`).join('')}</div>
            ${sleepy.length > 6 ? `<div class="mut" style="font-size:13px">وكمان ${sleepy.length - 6} أفكار نايمة</div>` : ''}</div>` : ''}
          <form class="stack" data-act-submit="review-save" data-ws="${ws}">
            <label class="card field"><span>إيه اللي مشي كويس؟</span><textarea name="went_well" rows="3">${esc(r.went_well)}</textarea></label>
            <label class="card field"><span>إيه اللي اتعطل، وليه؟</span><textarea name="blocked" rows="3">${esc(r.blocked)}</textarea></label>
            <div class="card field"><span>أهم 3 حاجات الأسبوع الجاي</span>${top.map((v, i) => `<div class="stack" style="gap:4px"><input class="inp" name="t${i}" value="${esc(v)}" placeholder="${i + 1}">${gSel(i)}</div>`).join('')}
              <button type="button" class="btn sm" data-act="review-tasks" data-day="${addDays(ws, 7)}">حوّلهم لمهام أول يوم في الأسبوع الجاي</button></div>
            <button class="btn pri">حفظ المراجعة</button>
          </form>
          ${past.length ? `<details><summary class="mut" style="min-height:44px;cursor:pointer">المراجعات اللي فاتت (${past.length})</summary><div class="stack">${past.map(p => `<div class="card"><b style="font-weight:600">أسبوع ${fd(p.week_start)}</b>${p.went_well ? `<div class="mut" style="margin-top:6px">مشي كويس:</div><div style="white-space:pre-wrap">${esc(p.went_well)}</div>` : ''}${p.blocked ? `<div class="mut" style="margin-top:6px">اتعطل:</div><div style="white-space:pre-wrap">${esc(p.blocked)}</div>` : ''}${p.next_top3?.length ? `<div class="mut" style="margin-top:6px">كان ناوي:</div>${p.next_top3.map(x => `<div>• ${esc(x)}</div>`).join('')}` : ''}</div>`).join('')}</div></details>` : ''}
        </div>`,
      };
    },
    actions: {
      // "هطوّرها": الفكرة بتصحى (بتتنقل لمرحلة بعدها لو لسه في الأول) وبتفتح صفحتها
      async wake(el) {
        const idea = el.dataset.t === 'idea', table = idea ? 'ideas' : 'project_devs';
        const r = (await list(table, { eq: { id: el.dataset.id } }))[0]; if (!r) return;
        const stage = idea ? (r.stage === 'raw' ? 'developing' : r.stage) : (r.stage === 'idea' ? 'plan' : r.stage);
        try { await upd(table, r.id, { stage, updated_at: new Date().toISOString() }); toast('صحيت. كمّل عليها'); location.hash = `${idea ? '#/idea/' : '#/dev/'}${r.id}`; } catch (e) { fail(e); }
      },
      async 'sleep-archive'(el) { await archiveWithUndo(el.dataset.t === 'idea' ? 'ideas' : 'project_devs', el.dataset.id, 'اتشالت للأرشيف'); },
      async 'review-save'(form) {
        const f = formOf(form);
        try { await upsert('weekly_reviews', { week_start: form.dataset.ws, went_well: f.went_well || null, blocked: f.blocked || null, ...top3Of(f) }, 'user_id,week_start'); toast('المراجعة اتحفظت'); doRefresh(); } catch (e) { fail(e); }
      },
      async 'review-tasks'(el) {
        const f = formOf(el.closest('form')); const items = [f.t0, f.t1, f.t2].filter(Boolean);
        if (!items.length) return toast('اكتب الحاجات الأول');
        const T3 = top3Of(f);
        try { for (let i = 0; i < T3.next_top3.length; i++) { const t = await ins('tasks', { title: T3.next_top3[i], due_on: el.dataset.day, top3_on: el.dataset.day, source: 'review' }); if (T3.top3_goals[i]) await link('task', t.id, 'goal', T3.top3_goals[i]); } toast(`اتعملوا ${items.length} مهام يوم ${fd(el.dataset.day)}، ومتعلّمين كأهم حاجات`); } catch (e) { fail(e); }
      },
    },
  },

  calendar: {
    async render() {
      const [y, mo] = st.month.split('-').map(Number);
      const first = `${st.month}-01`, days = new Date(y, mo, 0).getDate(), last = `${st.month}-${String(days).padStart(2, '0')}`;
      const items = await list('v_calendar', { gte: ['on_date', first], lte: ['on_date', last], order: 'on_date' });
      const by = {}; items.forEach(i => (by[i.on_date] ||= []).push(i));
      const lead = (new Date(y, mo - 1, 1).getDay() + 1) % 7;   // السبت أول الأسبوع
      const cells = [...Array(lead).fill(''), ...Array.from({ length: days }, (_, i) => `${st.month}-${String(i + 1).padStart(2, '0')}`)];
      const t = today();
      const sel = by[st.day] || [];
      return {
        title: 'التقويم', sub: fMonth(first), back: '#/today',
        html: `<div class="stack">
          <div class="between"><button class="rb" data-act="cal-move" data-v="-1" aria-label="الشهر اللي فات">${ic('back', 20)}</button><b class="disp" style="font-size:20px">${fMonth(first)}</b><button class="rb" data-act="cal-move" data-v="1" aria-label="الشهر الجاي">${ic('chev', 20)}</button></div>
          <div class="card" style="padding:10px 8px">
            <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));text-align:center;font-size:12px;color:var(--mut);margin-bottom:6px">${['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'].map(d => `<span>${d}</span>`).join('')}</div>
            <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px">${cells.map(d => d ? `<button data-act="cal-day" data-v="${d}" aria-label="${fd(d)}" style="min-height:48px;border-radius:10px;border:${d === st.day ? '2px solid var(--ink)' : '1px solid transparent'};background:${d === t ? 'var(--amb)' : 'transparent'};color:${d === t ? '#15202B' : 'var(--ink)'};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;padding:0"><span class="num" style="font-size:14px">${+d.slice(8)}</span><span style="display:flex;gap:2px;height:6px">${(by[d] || []).slice(0, 4).map(i => `<i style="width:5px;height:5px;border-radius:3px;background:${KC[i.kind]?.[1]}"></i>`).join('')}</span></button>` : '<span></span>').join('')}</div>
          </div>
          <div class="row mut" style="flex-wrap:wrap;gap:4px 12px;font-size:12px">${[['task', 'مهام'], ['goal', 'مواعيد أهداف'], ['interview', 'مقابلات'], ['commitment', 'مواعيد دفع']].map(([k, l]) => `<span class="row" style="gap:4px"><i style="width:8px;height:8px;border-radius:4px;background:${KC[k][1]}"></i>${l}</span>`).join('')}</div>
          <div class="card" style="padding:8px 14px"><div class="between" style="padding-top:4px"><b style="font-weight:600">${st.day === t ? 'النهاردة' : fd(st.day)}</b><button class="btn sm" data-act="cal-task">${ic('plus', 16)}مهمة في اليوم ده</button></div>
            <div class="list">${sel.map(i => {
              const label = KC[i.kind]?.[0] || '';
              const title = i.kind === 'commitment' || i.kind === 'installment' ? 'ميعاد دفع (التفاصيل في فلوسي)' : esc(i.title);
              const inner = `<span class="k"><i style="width:10px;height:10px;border-radius:5px;background:${KC[i.kind]?.[1]}"></i></span><span class="t"><small>${label}</small>${title}</span>`;
              return i.kind === 'task' ? `<button class="lnk" data-act="task-open" data-id="${i.ref_id}">${inner}</button>` : `<a class="lnk" href="${i.kind === 'goal' ? '#/goal/' + i.ref_id : i.kind === 'interview' ? '#/hiring' : '#/money'}">${inner}</a>`;
            }).join('') || '<div class="mut" style="padding:8px 0">مفيش حاجة في اليوم ده.</div>'}</div></div>
        </div>`,
      };
    },
    actions: {
      'cal-move'(el) { const [y, m] = st.month.split('-').map(Number); const d = new Date(y, m - 1 + Number(el.dataset.v), 1); st.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; st.day = st.month === today().slice(0, 7) ? today() : st.month + '-01'; doRefresh(); },
      'cal-day'(el) { st.day = el.dataset.v; doRefresh(); },
      'cal-task'() { openTask(null, { due_on: st.day }); },
    },
  },

  report: {
    async render() {
      const r = await buildReport();
      return {
        title: 'تقرير للمالك', sub: 'إنت بتختار الفترة والمحتوى', back: '#/today',
        html: `<div class="stack" style="padding-bottom:20px">
          <a class="card row" href="#/progress" style="gap:12px">${ic('chart', 22)}<div style="flex:1;line-height:1.5"><div style="font-weight:600">تقدّم الشركة بالرسومات</div><div class="mut">روحنا فين، قدامنا قد إيه، ومشاكلنا</div></div>${ic('chev', 18)}</a>
          <div class="pills">${[['week', 'آخر 7 أيام'], ['month', 'الشهر ده'], ['last', 'الشهر اللي فات'], ['custom', 'من يوم لـ يوم']].map(([k, l]) => `<button class="${st.rep === k ? 'on' : ''}" data-act="rep-period" data-v="${k}">${l}</button>`).join('')}</div>
          ${st.rep === 'custom' ? `<div class="grid2"><label class="field"><span>من</span><input type="date" value="${st.from}" data-change="rep-from"></label><label class="field"><span>إلى</span><input type="date" value="${st.to}" data-change="rep-to"></label></div>` : `<div class="mut">${fd(r.from)} – ${fd(r.to)}</div>`}
          <div class="card list" style="padding:4px 14px"><b style="font-weight:600;display:block;padding:8px 0 4px">يحتوي على</b>
            ${SECTIONS.map(([k, l]) => `<div class="row" style="padding:7px 0"><span style="flex:1;font-weight:500">${l}</span><button class="switch${secOn(k) ? ' on' : ''}" role="switch" aria-checked="${secOn(k)}" data-act="rep-sec" data-k="${k}" aria-label="${l}"></button></div>`).join('')}
            ${['فلوسي', 'مشاريعي', 'رأيك اليومي في التيم', 'يومي (وقتك الشخصي)'].map(l => `<div class="row mut" style="padding:9px 0">${ic('archive', 18)}<span style="flex:1">${l}</span><span style="font-size:12px">مش بيدخل</span></div>`).join('')}</div>
          <pre class="card" id="rep-text" style="white-space:pre-wrap;font:14px/1.8 'Readex Pro',system-ui,sans-serif;margin:0;max-height:50vh;overflow:auto">${esc(r.text)}</pre>
          <div class="btns"><a class="btn amb" href="https://wa.me/?text=${encodeURIComponent(r.text)}" target="_blank" rel="noopener">ابعته على الواتساب</a></div>
          <div class="btns"><button class="btn" data-act="rep-copy">انسخ</button><button class="btn" data-act="rep-pdf">ملف PDF</button></div>
          <p class="mut" style="margin:0">PDF: هتفتحلك صفحة الطباعة، اختار منها مشاركة أو "حفظ في الملفات". وفيه رسمة لتقدم كل هدف.</p>
          <div id="print-area">${r.html}</div>
        </div>`,
      };
    },
    actions: {
      'rep-period'(el) { st.rep = el.dataset.v; if (st.rep === 'custom' && !st.from) { st.from = monthStart(); st.to = today(); } doRefresh(); },
      'rep-from'(el) { st.from = el.value; doRefresh(); }, 'rep-to'(el) { st.to = el.value; doRefresh(); },
      'rep-sec'(el) { const p = secPrefs(); p[el.dataset.k] = !el.classList.contains('on'); try { localStorage.setItem('nota.repsec', JSON.stringify(p)); } catch (e) {} doRefresh(); },
      async 'rep-copy'() { const t = document.getElementById('rep-text').textContent; try { await navigator.clipboard.writeText(t); toast('اتنسخ'); } catch (e) { toast('ما اتنسخش. علّم على النص وانسخه'); } },
      'rep-pdf'() { window.print(); },
    },
  },
};
