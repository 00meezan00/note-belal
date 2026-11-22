// أرقامي: مقارنة الشهور + خريطة السنة + سنتك في أرقام + إنجازاتي
import { list } from './db.js';
import { esc, ic, fd, today, n, empty } from './ui.js';
import { doRefresh } from './comps.js';
import compare from './compare.js';
import { habitStats } from './habits.js';

const st = { tab: 'year', year: Number(today().slice(0, 4)), map: 'tasks' };
const pad = x => String(x).padStart(2, '0');
const localDate = iso => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const MOOD_C = ['', '#E5484D', '#F0A202', '#B8C2CC', '#7CCB98', '#2E8B57'];
const logMin = l => l.started_at ? Math.max(0, ((l.ended_at ? Date.parse(l.ended_at) : Date.parse(l.started_at)) - Date.parse(l.started_at)) / 6e4) : 0;

// بيانات السنة كلها مرة واحدة
async function yearData(y) {
  const from = `${y}-01-01`, to = `${y}-12-31`;
  const [tasks, logs, journal, goals, problems, courses, media, learnings, decisions, lessons] = await Promise.all([
    list('tasks', { notNull: 'done_at' }), list('day_logs', { gte: ['on_date', from], lte: ['on_date', to] }), list('day_journal', { gte: ['on_date', from], lte: ['on_date', to] }),
    list('goals'), list('problems'), list('courses'), list('media'), list('learnings'), list('decisions'), list('lessons')]);
  const inY = d => d && d.slice(0, 4) === String(y);
  const T = {}, H = {}, M = {};
  for (const t of tasks) if (t.done) { const d = localDate(t.done_at); if (inY(d)) T[d] = (T[d] || 0) + 1; }
  for (const l of logs) if (l.kind !== 'rest') H[l.on_date] = (H[l.on_date] || 0) + logMin(l) / 60;
  for (const j of journal) if (j.mood) M[j.on_date] = j.mood;
  return { y, T, H, M, goals, problems, courses, media, learnings, decisions, lessons, logs, inY };
}

// خريطة السنة: 12 شهر، كل يوم مربع لونه بيغمق كل ما عملت أكتر
function yearMap(D) {
  const val = st.map === 'tasks' ? D.T : st.map === 'hours' ? D.H : D.M;
  const max = st.map === 'mood' ? 5 : Math.max(1, ...Object.values(val));
  // لون المربع: فاضي رمادي، والمزاج بألوانه، والمهام والساعات أخضر بيغمق
  const cs = v => !v ? 'background:var(--empty)' : st.map === 'mood' ? `background:${MOOD_C[v]}` : `background:var(--ok);opacity:${(0.3 + 0.7 * Math.min(1, v / max)).toFixed(2)}`;
  const t = today();
  const month = m => {
    const first = new Date(D.y, m, 1), days = new Date(D.y, m + 1, 0).getDate(), lead = (first.getDay() + 1) % 7;   // السبت أول عمود
    const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${D.y}-${pad(m + 1)}-${pad(i + 1)}`)];
    return `<div class="stack" style="gap:4px"><span style="font-size:11px;color:var(--mut)">${MONTHS[m]}</span><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">${cells.map(d => d ? `<i title="${d}" style="aspect-ratio:1;border-radius:2px;${d > t ? 'background:transparent' : cs(val[d])};${d === t ? 'outline:1.5px solid var(--ink)' : ''}"></i>` : '<i></i>').join('')}</div></div>`;
  };
  const legend = st.map === 'mood' ? MOOD_C.slice(1).map((c, i) => `<span class="row" style="gap:3px"><i style="width:10px;height:10px;border-radius:2px;background:${c}"></i>${['وحش', '', 'عادي', '', 'حلو'][i]}</span>`).join('')
    : `<span>أقل</span>${[0, .25, .5, .75, 1].map(f => `<i style="width:10px;height:10px;border-radius:2px;${f ? cs(f * max) : 'background:var(--empty)'}"></i>`).join('')}<span>أكتر</span>`;
  return `<div class="card stack" style="gap:10px">
    <div class="between"><b style="font-weight:600">خريطة سنتك</b><span class="mut" style="font-size:12px">${Object.keys(val).length} يوم متسجل</span></div>
    <div class="pills">${[['tasks', 'المهام'], ['hours', 'ساعات الشغل'], ['mood', 'المزاج']].map(([k, l]) => `<button class="${st.map === k ? 'on' : ''}" data-act="ym-mode" data-v="${k}">${l}</button>`).join('')}</div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 10px">${[...Array(12)].map((_, m) => month(m)).join('')}</div>
    <div class="row mut" style="gap:5px;font-size:11px;justify-content:center;flex-wrap:wrap">${legend}</div></div>`;
}

async function yearView() {
  const D = await yearData(st.year), y = st.year;
  const goalsDone = D.goals.filter(g => g.status === 'done' && D.inY(g.done_on));
  const solved = D.problems.filter(p => p.status === 'solved' && D.inY(p.solved_on));
  const mediaDone = D.media.filter(m => m.status === 'done' && D.inY(m.finished_on));
  const coursesDone = D.courses.filter(c => c.status === 'done' && D.inY(c.updated_at || c.created_at));
  const applied = D.learnings.filter(l => l.status === 'applied' && D.inY(l.decided_on));
  const decs = D.decisions.filter(x => D.inY(x.decided_on)), less = D.lessons.filter(x => D.inY(x.created_at));
  const tasksN = Object.values(D.T).reduce((a, b) => a + b, 0), hoursN = Math.round(Object.values(D.H).reduce((a, b) => a + b, 0));
  const moods = Object.values(D.M), moodAvg = moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : null;
  const hb = await habitStats(`${y}-01-01`, y === Number(today().slice(0, 4)) ? today() : `${y}-12-31`).catch(() => ({ planned: 0 }));
  const byMonth = [...Array(12)].map((_, m) => Object.entries(D.T).filter(([d]) => Number(d.slice(5, 7)) === m + 1).reduce((s, [, v]) => s + v, 0));
  const bestM = byMonth.some(Boolean) ? byMonth.indexOf(Math.max(...byMonth)) : -1;
  const box = (v, l) => `<div class="card" style="padding:12px"><div class="num" style="font-size:24px;line-height:1.2">${v}</div><div class="mut" style="font-size:13px">${l}</div></div>`;
  // إنجازاتي: كل حاجة كبيرة خلصت، الأحدث فوق
  const ach = [
    ...goalsDone.map(g => ({ d: g.done_on, icon: 'goal', t: 'اتحقق هدف: ' + g.title, s: g.impact || '', href: '#/goal/' + g.id })),
    ...mediaDone.map(m => ({ d: m.finished_on, icon: 'book', t: (m.kind === 'book' ? 'خلصت كتاب: ' : m.kind === 'podcast' ? 'خلصت بودكاست: ' : 'خلصت كتاب مسموع: ') + m.title, s: m.author || '', href: '#/courses?tab=media' })),
    ...coursesDone.map(c => ({ d: (c.updated_at || c.created_at).slice(0, 10), icon: 'book', t: 'خلصت كورس: ' + c.title, s: c.applied_in ? 'طبّقته في: ' + c.applied_in : '', href: '#/courses?tab=courses' })),
    ...applied.map(l => ({ d: l.decided_on, icon: 'check', t: 'طبّقت: ' + l.text, s: l.applied_note || '', href: '#/courses' })),
    ...D.decisions.filter(x => x.outcome === 'yes' && D.inY(x.reviewed_on)).map(x => ({ d: x.reviewed_on, icon: 'check', t: 'قرار طلع صح: ' + x.title, s: x.result || '', href: '#/lessons?tab=decisions' })),
  ].sort((a, b) => b.d.localeCompare(a.d));
  return `${yearMap(D)}
    <div class="sec">سنة ${y} في أرقام</div>
    <div class="grid2">${box(n(tasksN), 'مهمة خلصت')}${box(goalsDone.length, 'هدف اتحقق')}${box(solved.length, 'مشكلة اتحلت')}${box(n(hoursN), 'ساعة شغل')}${box(coursesDone.length + mediaDone.length, 'كورس وكتاب خلصوا')}${box(applied.length, 'حاجة اتعلمتها وطبّقتها')}${box(decs.length, 'قرار أخدته')}${box(less.length, 'درس اتعلمته')}${hb.planned ? box(hb.pct + '%', 'التزامك بعاداتك') : ''}${moodAvg ? box(moodAvg, 'متوسط مزاجك من 5') : ''}</div>
    ${bestM >= 0 ? `<div class="card row" style="gap:10px">${ic('star', 20)}<span style="flex:1">أنشط شهر: <b>${MONTHS[bestM]}</b> (${byMonth[bestM]} مهمة)</span></div>` : ''}
    <div class="sec">إنجازاتي</div>
    ${ach.length ? `<div class="card" style="padding:6px 14px"><div class="list">${ach.slice(0, 40).map(a => `<a class="lnk" href="${a.href}"><span class="k">${ic(a.icon, 16)}</span><span class="t">${esc(a.t)}<small>${fd(a.d)}${a.s ? ' · ' + esc(a.s.slice(0, 80)) : ''}</small></span></a>`).join('')}</div></div>` : empty('لما تحقق هدف، أو تخلّص كورس أو كتاب، أو تطبّق حاجة اتعلمتها، هتتسجل هنا.')}`;
}

export default {
  numbers: {
    async render(p) {
      if (p.query.tab) st.tab = p.query.tab === 'months' ? 'months' : 'year';
      const seg = `<div class="seg">${[['year', 'السنة'], ['months', 'مقارنة الشهور']].map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-act="num-tab" data-v="${k}">${l}</button>`).join('')}</div>`;
      if (st.tab === 'months') { const v = await compare.compare.render(); return { title: 'أرقامي', sub: v.sub, back: '#/today', html: `<div class="stack">${seg}${v.html}</div>` }; }
      return {
        title: 'أرقامي', sub: `سنة ${st.year}`, back: '#/today',
        html: `<div class="stack" style="padding-bottom:20px">${seg}
          <div class="between"><button class="rb" data-act="ny-move" data-v="-1" aria-label="السنة اللي فاتت">${ic('back', 20)}</button><b class="disp" style="font-size:20px">${st.year}</b><button class="rb" data-act="ny-move" data-v="1" aria-label="السنة الجاية" ${st.year >= Number(today().slice(0, 4)) ? 'disabled style="opacity:.35"' : ''}>${ic('chev', 20)}</button></div>
          ${await yearView()}</div>`,
      };
    },
    actions: {
      ...compare.compare.actions,
      'num-tab'(el) { st.tab = el.dataset.v; doRefresh(); },
      'ym-mode'(el) { st.map = el.dataset.v; doRefresh(); },
      'ny-move'(el) { const y = st.year + Number(el.dataset.v); if (y <= Number(today().slice(0, 4))) { st.year = y; doRefresh(); } },
    },
  },
};
