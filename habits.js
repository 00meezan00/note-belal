// عاداتي: حاجات عايز تعملها كل يوم (أو أيام معينة)، وتعلّم عليها، والتطبيق يعدّلك كام يوم ورا بعض
import { list, one, ins, upd, del } from './db.js';
import { esc, ic, bat, fd, today, addDays, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail } from './ui.js';
import { archiveWithUndo, doRefresh } from './comps.js';
import { lifeData, taPicker, taRow, taValue } from './life.js';

const DAYS = [[6, 'س'], [0, 'ح'], [1, 'ن'], [2, 'ث'], [3, 'ر'], [4, 'خ'], [5, 'ج']];
const DAYNAME = { 0: 'الأحد', 1: 'الاتنين', 2: 'التلات', 3: 'الأربع', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت' };
const ALL = [0, 1, 2, 3, 4, 5, 6];
const dowOf = d => new Date(d + 'T12:00').getDay();
const daysOf = h => Array.isArray(h.days) && h.days.length ? h.days.map(Number) : ALL;
const onDay = (h, d) => daysOf(h).includes(dowOf(d)) && d >= (h.created_at || '').slice(0, 10);
const daysText = h => { const D = daysOf(h); return D.length === 7 ? 'كل يوم' : DAYS.filter(([v]) => D.includes(v)).map(([v]) => DAYNAME[v]).join(' و'); };
const streakWord = k => k === 1 ? 'يوم واحد' : k === 2 ? 'يومين' : k <= 10 ? `${k} أيام` : `${k} يوم`;

// كام يوم ورا بعض عملتها (الأيام اللي مش عليها العادة مش بتقطع العدّ، والنهاردة لو لسه معملتهاش مش بيقطعه)
export function streak(h, done) {
  let d = today(), k = 0;
  if (onDay(h, d) && !done.has(d)) d = addDays(d, -1);
  for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
    if (d < (h.created_at || '').slice(0, 10)) break;
    if (!onDay(h, d)) continue;
    if (!done.has(d)) break;
    k++;
  }
  return k;
}

async function load() {
  const [habits, logs] = await Promise.all([list('habits', { order: 'sort' }), list('habit_logs')]);
  const by = {}; logs.forEach(l => (by[l.habit_id] ||= new Set()).add(l.on_date));
  return { habits: habits.filter(h => h.active !== false), all: habits, by, logs };
}

// نسبة الالتزام في فترة (بتستخدمها صفحة مقارنة الشهور). ولو ids: العادات دي بس (زي العادات اللي بتخدم هدف)
export async function habitStats(from, to, ids = null) {
  let { all, by } = await load(); if (ids) all = all.filter(h => ids.includes(h.id));
  let planned = 0, done = 0; const end = to > today() ? today() : to;
  for (const h of all) for (let d = from; d <= end; d = addDays(d, 1)) if (onDay(h, d)) { planned++; if (by[h.id]?.has(d)) done++; }
  return { planned, done, pct: planned ? Math.round(done / planned * 100) : 0 };
}

const checkBtn = (h, on, d = today()) => `<button class="chk${on ? ' on' : ''}" data-act="habit-toggle" data-id="${h.id}" data-d="${d}" aria-label="${on ? 'رجّعها' : 'عملتها'}">${on ? ic('check', 16) : ''}</button>`;

// كارت صغير في صفحة "النهاردة"
export async function habitsTodayCard() {
  const { habits, by } = await load();
  const t = today(), L = habits.filter(h => onDay(h, t));
  if (!L.length) return '';
  const done = L.filter(h => by[h.id]?.has(t)).length;
  return `<div class="between"><span class="sec">عادات النهاردة <span class="mut num">${done}/${L.length}</span></span><a href="#/habits" class="mut" style="font-weight:500">عاداتي</a></div>
    <div class="card list" style="padding:4px 14px">${L.map(h => { const on = by[h.id]?.has(t), s = streak(h, by[h.id] || new Set());
      return `<div class="task${on ? ' done' : ''}">${checkBtn(h, on)}<div class="body"><div class="name">${esc(h.title)}</div>${s ? `<div class="meta"><span class="mut">${streakWord(s)} ورا بعض</span></div>` : ''}</div></div>`; }).join('')}</div>`;
}

async function habitSheet(h = {}) {
  const D = h.id ? daysOf(h) : ALL, d = await lifeData();
  openSheet(h.id ? 'العادة' : 'عادة جديدة', `
    <label class="field"><span>العادة</span><input name="title" value="${esc(h.title)}" ${h.id ? '' : 'autofocus'} placeholder="مثلًا: أقرا 10 صفحات"></label>
    <div class="field"><span>الأيام</span><div class="row" style="gap:5px" data-multi="hdays">${DAYS.map(([v, l]) => `<button type="button" class="btn sm${D.includes(v) ? ' pri' : ''}" style="flex:1;padding:0" data-act="hday" data-v="${v}" aria-label="${DAYNAME[v]}">${l}</button>`).join('')}</div></div>
    ${taPicker(d, taValue(h), { label: 'المسار (اختياري)' })}
    <div class="btns">${h.id ? `<button class="btn" data-act="habit-archive" data-id="${h.id}">${ic('archive', 18)}شيلها</button>` : ''}<button class="btn pri" data-act="habit-save" data-id="${h.id || ''}">حفظ</button></div>`);
}

export default {
  habits: {
    async render() {
      const { habits, by } = await load();
      const t = today(), todayL = habits.filter(h => onDay(h, t)), doneT = todayL.filter(h => by[h.id]?.has(t)).length;
      const week = Array.from({ length: 7 }, (_, i) => addDays(t, i - 6));
      const m = await habitStats(t.slice(0, 7) + '-01', t);
      return {
        title: 'عاداتي', sub: todayL.length ? `النهاردة ${doneT} من ${todayL.length}` : 'حاجات بتعملها كل يوم', back: '#/today',
        fab: { label: 'عادة', act: 'habit-new' },
        html: `<div class="stack">
          ${habits.length ? `<div class="card stack" style="gap:10px">
            <div class="between" style="align-items:baseline"><b style="font-weight:600">النهاردة</b><span><span class="num" style="font-size:28px">${doneT}</span><span class="mut"> من ${todayL.length}</span></span></div>
            ${bat(todayL.length ? doneT / todayL.length * 100 : 0, doneT && doneT === todayL.length ? 'done' : 'run')}
            <div class="mut">التزامك الشهر ده: <b class="num" style="color:var(--ink)">${m.pct}%</b> (${m.done} من ${m.planned})</div></div>
          ${habits.map(h => { const S = by[h.id] || new Set(), on = S.has(t), s = streak(h, S), sched = onDay(h, t);
            return `<div class="card stack" style="gap:10px">
              <div class="row" style="gap:10px">${sched ? checkBtn(h, on) : `<span class="chk" style="opacity:.35" aria-hidden="true"></span>`}
                <div style="flex:1;line-height:1.4;cursor:pointer" data-act="habit-open" data-id="${h.id}" role="button" tabindex="0"><div style="font-weight:600">${esc(h.title)}</div><div class="mut" style="font-size:13px">${daysText(h)}${sched ? '' : ' · مش النهاردة'}</div></div>
                ${s ? `<span class="tag ${s >= 7 ? 'ok' : 'amb'}">${streakWord(s)} ورا بعض</span>` : ''}</div>
              <div class="row" style="gap:4px">${week.map(d => { const sc = onDay(h, d), dn = S.has(d);
                return `<button data-act="habit-toggle" data-id="${h.id}" data-d="${d}" ${sc ? '' : 'disabled'} aria-label="${fd(d)}" style="flex:1;min-height:40px;border-radius:9px;border:${d === t ? '2px solid var(--ink)' : '1px solid var(--line)'};background:${dn ? 'var(--ok)' : sc && d < t ? 'color-mix(in srgb,var(--bad) 18%,transparent)' : 'transparent'};color:${dn ? '#fff' : 'var(--ink)'};opacity:${sc ? 1 : .35};display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px;padding:0;cursor:${sc ? 'pointer' : 'default'}"><span>${DAYS.find(x => x[0] === dowOf(d))[1]}</span><span class="num">${+d.slice(8)}</span></button>`; }).join('')}</div>
            </div>`; }).join('')}
          <p class="mut" style="margin:0;text-align:center;font-size:13px">دوس على أي يوم من آخر أسبوع لو نسيت تعلّم عليه.</p>`
          : empty('ضيف حاجة عايز تعملها كل يوم، زي القراية أو الرياضة أو مراجعة أرقام الشركة.<br>علّم عليها كل يوم، والتطبيق هيعدّلك كام يوم ورا بعض.')}
        </div>`,
      };
    },
    actions: { 'habit-new': () => habitSheet(), async 'habit-open'(el) { habitSheet(await one('habits', el.dataset.id)); } },
  },
};

export const habitGlobal = {
  hday(el) { el.classList.toggle('pri'); },
  async 'habit-toggle'(el) {
    const id = el.dataset.id, d = el.dataset.d || today();
    try {
      const hit = (await list('habit_logs', { eq: { habit_id: id, on_date: d } }))[0];
      if (hit) await del('habit_logs', hit.id);
      else { await ins('habit_logs', { habit_id: id, on_date: d }); if (d === today()) toast('برافو'); }
      doRefresh();
    } catch (e) { fail(e); }
  },
  async 'habit-save'(el) {
    const s = sheetEl(), f = formOf(s); if (!f.title) return toast('اكتب العادة');
    const days = [...s.querySelectorAll('[data-multi=hdays] .pri')].map(b => Number(b.dataset.v));
    if (!days.length) return toast('اختار يوم واحد على الأقل');
    try {
      const ta = taRow(f.ta, await lifeData());
      if (el.dataset.id) await upd('habits', el.dataset.id, { title: f.title, days, ...ta });
      else await ins('habits', { title: f.title, days, sort: Date.now() % 1e9, ...ta });
      closeSheet(); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'habit-archive'(el) { closeSheet(); await archiveWithUndo('habits', el.dataset.id, 'العادة اتشالت'); },
};
