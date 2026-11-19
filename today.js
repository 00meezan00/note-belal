// النهاردة
import { list, single } from './db.js';
import { esc, ic, bat, fd, fdLong, today, addDays, dueText, empty, weekStart } from './ui.js';
import { taskRow, openTask } from './comps.js';

async function linkLabels(taskIds) {
  if (!taskIds.length) return {};
  const ls = await list('links', { eq: { from_type: 'task' }, in: ['from_id', taskIds] });
  const goalIds = ls.filter(l => l.to_type === 'goal').map(l => l.to_id);
  const probIds = ls.filter(l => l.to_type === 'problem').map(l => l.to_id);
  const memIds = ls.filter(l => l.to_type === 'member').map(l => l.to_id);
  const [g, p, m] = await Promise.all([
    goalIds.length ? list('goals', { in: ['id', goalIds] }) : [], probIds.length ? list('problems', { in: ['id', probIds] }) : [],
    memIds.length ? list('team_members', { in: ['id', memIds] }) : []]);
  const name = Object.fromEntries([...g.map(x => [x.id, x.title]), ...p.map(x => [x.id, 'مشكلة: ' + x.title]), ...m.map(x => [x.id, x.name])]);
  const out = {};
  ls.forEach(l => { if (!out[l.from_id] && name[l.to_id]) out[l.from_id] = name[l.to_id]; });
  return out;
}

export default {
  today: {
    dock: 'today',
    async render() {
      const t = today();
      const [tasks, goals, prog, company, review, pays] = await Promise.all([
        list('tasks', { lte: ['due_on', t], order: 'created_at' }),
        list('goals', { eq: { status: 'active' }, order: 'due_on' }),
        list('v_goal_progress'),
        single('company'),
        list('weekly_reviews', { eq: { week_start: weekStart() } }),
        list('v_calendar', { in: ['kind', ['commitment', 'installment']], lte: ['on_date', addDays(t, 1)], order: 'on_date' }).catch(() => []),
      ]);
      const day = tasks.filter(x => x.due_on === t || !x.done).sort((a, b) => (a.done - b.done) || (a.due_on < b.due_on ? -1 : 1));
      const labels = await linkLabels(day.map(x => x.id));
      const top = day.filter(x => x.top3_on === t && !x.done);
      const rest = day.filter(x => !(x.top3_on === t && !x.done));
      const done = day.filter(x => x.done).length;
      const P = Object.fromEntries(prog.map(p => [p.id, p]));
      const avg = goals.length ? Math.round(goals.reduce((s, g) => s + (P[g.id]?.progress || 0), 0) / goals.length) : 0;
      const doneMonth = (await list('goals', { eq: { status: 'done' }, gte: ['done_on', t.slice(0, 7) + '-01'] })).length;
      const near = goals.filter(g => g.due_on && g.due_on <= addDays(t, 14)).slice(0, 3);
      const isThu = new Date().getDay() === 4;
      const segs = Math.min(Math.max(day.length, 1), 12);

      return {
        title: 'النهاردة', sub: fdLong(),
        html: `<div class="stack">
          <div class="card stack" style="gap:12px;padding:16px">
            <div class="between" style="align-items:baseline"><span style="font-weight:600">شحن يومك</span><span><span class="num" style="font-size:34px;line-height:1">${done}</span><span class="mut"> من ${day.length} مهام</span></span></div>
            ${bat(day.length ? done / day.length * 100 : 0, done && done === day.length ? 'done' : 'run', { seg: segs, big: true, pct: false })}
            <div class="row mut" style="gap:16px;flex-wrap:wrap"><span>اتحقق الشهر ده: <b class="num" style="color:var(--ink)">${doneMonth}</b> هدف</span><span>متوسط الأهداف: <b class="num" style="color:var(--ink)">${avg}%</b></span></div>
          </div>
          ${isThu && !review.length ? `<div class="card row" style="background:var(--amb);border-color:var(--amb);color:#15202B;gap:12px">${ic('review', 24)}<div style="flex:1;line-height:1.4"><div style="font-weight:600">مراجعة الأسبوع</div><div style="font-size:13px">3 أسئلة في دقيقتين</div></div><a class="btn pri sm" href="#/weekly">ابدأ</a></div>` : ''}
          ${top.length ? `<div class="sec">أهم ${top.length === 3 ? '3 حاجات' : 'حاجات'} النهاردة</div><div class="card list" style="padding:4px 14px;border-color:var(--amb);border-width:1.5px">${top.map(x => taskRow(x, { linkLabel: labels[x.id] })).join('')}</div>` : ''}
          <div class="between"><span class="sec">${top.length ? 'باقي المهام' : 'مهام النهاردة'}</span><button class="btn sm" data-act="new-task">${ic('plus', 16)}مهمة</button></div>
          ${rest.length ? `<div class="card list" style="padding:4px 14px">${rest.map(x => taskRow(x, { linkLabel: labels[x.id] })).join('')}</div>` : (top.length ? '' : empty('مفيش مهام النهاردة. دوس المايك تحت وسجّل أول مهمة.<br><span class="mut">علّم على النجمة جنب أهم 3 حاجات عشان يطلعوا فوق.</span>'))}
          ${pays.length ? `<a class="card row" href="#/money" style="gap:12px">${ic('wallet', 22)}<div style="flex:1;line-height:1.5"><div style="font-weight:600">مواعيد دفع</div><div class="mut">${pays.map(x => `${esc(x.title)} · ${x.on_date === t ? 'النهاردة' : 'بكرة'}`).join('، ')}</div></div>${ic('chev', 18)}</a>` : ''}
          ${near.length ? `<div class="between"><span class="sec">قرّب موعدها</span><a href="#/goals" class="mut" style="font-weight:500">كل الأهداف</a></div>${near.map(g => goalCard(g, P[g.id])).join('')}` : ''}
        </div>`,
      };
    },
    actions: { 'new-task': () => openTask(null) },
  },
};

export function goalCard(g, p = {}) {
  const late = g.status === 'active' && g.due_on && g.due_on < today();
  const st = g.status === 'done' ? 'done' : late ? 'late' : 'run';
  const right = g.status === 'done' ? `اتحقق ${fd(g.done_on)}` : g.status === 'paused' ? 'متوقف' : dueText(g.due_on);
  return `<a class="card stack" style="gap:10px" href="#/goal/${g.id}">
    <div class="between"><span class="chip">${esc(g.area)}</span><span class="${late ? 'late' : 'mut'}" style="font-size:13px">${esc(right)}</span></div>
    <div class="title">${esc(g.title)}</div>
    ${bat(p.progress || 0, st)}
    <div class="mut">${p.steps_total ? `${p.steps_done} من ${p.steps_total} خطوات` : 'لسه مفيش خطة'}</div>
  </a>`;
}
