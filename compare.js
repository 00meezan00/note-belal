// مقارنة الشهور: الشهر ده عملت قد إيه مقارنة باللي قبله
// بنقارن "الشهر ده لحد النهاردة" بـ "نفس الأيام من الشهر اللي فات" عشان المقارنة تبقى عادلة،
// أو شهر كامل بشهر كامل (الشهر اللي فات بالشهر اللي قبله).
import { list } from './db.js';
import { esc, ic, fd, fMonth, today, addDays, monthStart, n, empty } from './ui.js';
import { doRefresh } from './comps.js';
import { habitStats } from './habits.js';

const st = { mode: 'mtd' };
const day10 = s => (s || '').slice(0, 10);
const inR = (d, [a, b]) => { d = day10(d); return !!d && d >= a && d <= b; };
const lastDay = s => { const [y, m] = s.split('-').map(Number); return `${s.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
const prevMonth = s => addDays(monthStart(s), -1).slice(0, 7) + '-01';

// الفترتين اللي هنقارن بينهم
function ranges() {
  const t = today();
  if (st.mode === 'full') { const a = prevMonth(t), b = prevMonth(a); return { cur: [a, lastDay(a)], old: [b, lastDay(b)], curName: fMonth(a), oldName: fMonth(b) }; }
  const a = monthStart(t), b = prevMonth(t), dayN = Number(t.slice(8));
  const bEnd = `${b.slice(0, 8)}${String(Math.min(dayN, Number(lastDay(b).slice(8)))).padStart(2, '0')}`;
  return { cur: [a, t], old: [b, bEnd], curName: 'الشهر ده', oldName: `نفس الأيام من ${fMonth(b)}` };
}

// ساعات من سجل "يومي" (الراحة مش بتتحسب شغل)
function hours(logs, R, pick) {
  let mins = 0;
  for (const l of logs) {
    if (!inR(l.on_date, R) || !pick(l) || !l.started_at) continue;
    const end = l.ended_at ? Date.parse(l.ended_at) : (l.on_date === today() ? Date.now() : Date.parse(l.started_at));
    mins += Math.max(0, (end - Date.parse(l.started_at)) / 6e4);
  }
  return Math.round(mins / 6) / 10;
}

export async function monthNumbers(R) {
  const [tasks, goals, problems, ideas, devs, logs, courses] = await Promise.all([
    list('tasks'), list('goals'), list('problems'), list('ideas'), list('project_devs'), list('day_logs'), list('courses')]);
  const sessions = courses.reduce((s, c) => s + Object.entries(c.sessions || {}).filter(([k, v]) => v === 'done' && inR(k, R)).length, 0);
  const hb = await habitStats(R[0], R[1]);
  return {
    tasks: tasks.filter(x => x.done && inR(x.done_at, R)).length,
    goals: goals.filter(x => x.status === 'done' && inR(x.done_on, R)).length,
    solved: problems.filter(x => x.status === 'solved' && inR(x.solved_on, R)).length,
    newProblems: problems.filter(x => inR(x.created_at, R)).length,
    ideas: ideas.filter(x => inR(x.created_at, R)).length,
    applied: devs.filter(x => inR(x.applied_on, R)).length,
    work: hours(logs, R, l => l.kind !== 'rest'),
    course: hours(logs, R, l => l.kind === 'course'),
    sessions,
    habits: hb.pct,
  };
}

const ROWS = [
  ['tasks', 'مهام خلصت', 'cal'], ['goals', 'أهداف اتحققت', 'goal'], ['solved', 'مشاكل اتحلت', 'check'], ['newProblems', 'مشاكل جديدة ظهرت', 'alert', true],
  ['work', 'ساعات شغل في "يومي"', 'clock', false, 'س'], ['course', 'ساعات كورسات', 'book', false, 'س'], ['sessions', 'مواعيد كورسات أخدتها', 'book'],
  ['habits', 'التزامك بعاداتك', 'repeat', false, '%'], ['ideas', 'أفكار جديدة', 'spark'], ['applied', 'تطويرات اتطبقت في مشاريعي', 'layers'],
];

// السهم واللون: أخضر لو أحسن، أحمر لو أقل (والمشاكل الجديدة بالعكس: الأقل أحسن)
function delta(a, b, lowerBetter) {
  if (a === b) return { cls: '', txt: 'زي ما هو', better: 0 };
  const up = a > b, better = (up !== !!lowerBetter) ? 1 : -1;
  const pct = b ? Math.round(Math.abs(a - b) / b * 100) : null;
  return { cls: better > 0 ? 'ok' : 'bad', txt: `${up ? '▲' : '▼'} ${pct === null ? 'جديد' : pct + '%'}`, better };
}

export default {
  compare: {
    async render() {
      const R = ranges();
      const [A, B] = await Promise.all([monthNumbers(R.cur), monthNumbers(R.old)]);
      const rows = ROWS.filter(([k]) => A[k] || B[k]).map(([k, label, icon, lower, unit = '']) => ({ k, label, icon, unit, a: A[k], b: B[k], d: delta(A[k], B[k], lower) }));
      const better = rows.filter(r => r.d.better > 0), worse = rows.filter(r => r.d.better < 0);
      const max = r => Math.max(r.a, r.b, 1);
      return {
        title: 'مقارنة الشهور', sub: `${R.curName} قصاد ${R.oldName}`, back: '#/today',
        html: `<div class="stack" style="padding-bottom:20px">
          <div class="pills">${[['mtd', 'الشهر ده لحد النهاردة'], ['full', 'الشهر اللي فات كامل']].map(([k, l]) => `<button class="${st.mode === k ? 'on' : ''}" data-act="cmp-mode" data-v="${k}">${l}</button>`).join('')}</div>
          <div class="mut" style="font-size:13px">${fd(R.cur[0])} – ${fd(R.cur[1])} قصاد ${fd(R.old[0])} – ${fd(R.old[1])}</div>
          ${rows.length ? `
          <div class="card stack" style="background:var(--dock);border-color:var(--dock);color:#fff;gap:6px;padding:16px">
            <div style="font-size:14px;color:#C9D2D9">اتحسنت في</div>
            <div class="row" style="align-items:baseline;gap:6px"><span class="num" style="font-size:42px;line-height:1">${better.length}</span><span style="color:#C9D2D9">من ${rows.length} حاجة</span></div>
            ${better.length ? `<div style="font-size:13px;color:#4CC38A">أحسن: ${better.slice(0, 3).map(r => r.label).join('، ')}</div>` : ''}
            ${worse.length ? `<div style="font-size:13px;color:#FF8A95">محتاج تبص عليه: ${worse.slice(0, 3).map(r => r.label).join('، ')}</div>` : ''}
          </div>
          <div class="card list" style="padding:4px 14px">${rows.map(r => `<div style="padding:10px 0">
            <div class="row" style="gap:8px">${ic(r.icon, 18)}<span style="flex:1;font-weight:500">${esc(r.label)}</span><span class="tag ${r.d.cls}">${r.d.txt}</span></div>
            <div class="row" style="gap:8px;margin-top:6px;font-size:13px"><span style="width:62px" class="mut">${st.mode === 'full' ? 'الشهر ده' : 'دلوقتي'}</span><span style="flex:1;height:8px;border-radius:4px;background:var(--mat);overflow:hidden"><i style="display:block;height:100%;width:${r.a / max(r) * 100}%;background:var(--ink)"></i></span><b class="num" style="width:52px;text-align:left">${n(r.a)}${r.unit}</b></div>
            <div class="row" style="gap:8px;margin-top:4px;font-size:13px"><span style="width:62px" class="mut">اللي فات</span><span style="flex:1;height:8px;border-radius:4px;background:var(--mat);overflow:hidden"><i style="display:block;height:100%;width:${r.b / max(r) * 100}%;background:var(--mut)"></i></span><span class="num mut" style="width:52px;text-align:left">${n(r.b)}${r.unit}</span></div>
          </div>`).join('')}</div>
          <p class="mut" style="margin:0;text-align:center;font-size:13px">الأخضر = أحسن من الشهر اللي فات، والأحمر = أقل. المشاكل الجديدة بالعكس: الأقل أحسن.</p>`
          : empty('لسه مفيش أرقام كفاية للمقارنة. كمّل استخدام النوتة والأرقام هتظهر هنا.')}
        </div>`,
      };
    },
    actions: { 'cmp-mode'(el) { st.mode = el.dataset.v; doRefresh(); } },
  },
};
