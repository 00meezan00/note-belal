// صفحتين بالأرقام والرسومات: "يومي" (وقتي ومهامي) و"تقدّم الشركة" (روحنا فين وقدامنا قد إيه)
import { list, single, ins, upd, upsert, auth } from './db.js';
import { esc, ic, bat, fd, today, addDays, n, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, LOC } from './ui.js';
import { archiveWithUndo, doRefresh, AREAS } from './comps.js';
import { moneyOpen, lockedRow } from './money.js';

const st = { day: today(), tab: 'now' };

// ---------------- أدوات الوقت ----------------
const pad = x => String(x).padStart(2, '0');
const hm = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const tsOf = (date, t) => new Date(`${date}T${t.slice(0, 5)}:00`).getTime();
const localDate = iso => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtTime = t => { const [h, m] = t.slice(0, 5).split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'ص' : 'م'}`; };
const fmtHour = h => `${h % 12 || 12}${h < 12 ? 'ص' : 'م'}`;
// 390 دقيقة ← "6س 30د"
const dur = mins => { mins = Math.max(0, Math.round(mins)); const h = Math.floor(mins / 60), m = mins % 60; return h && m ? `${h}س ${m}د` : h ? `${h}س` : `${m}د`; };
const elapsed = since => { const s = Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 1000)); return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const SHORT = ['حد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة', 'سبت'];
const dayName = d => new Date(d + 'T12:00').toLocaleDateString(LOC, { weekday: 'long' });

// عداد "شغال دلوقتي" بيتحدث كل ثانية لوحده
setInterval(() => document.querySelectorAll('[data-since]').forEach(el => (el.textContent = elapsed(el.dataset.since))), 1000);

// أنواع الوقت وألوانها
export const KINDS = { co: ['شغل الشركة', 'var(--ink)'], proj: ['مشاريعي', 'var(--amb)'], course: ['كورسات', '#4C8BD6'], personal: ['شخصي', '#9B6BCB'], rest: ['راحة', 'var(--line)'] };
const kc = k => (KINDS[k] || KINDS.co)[1];

// ---------------- الرسومات (من غير أي مكتبة، وبتشتغل من غير نت) ----------------
// دايرة مقسومة ألوان
function donut(segs, center = '', size = 116) {
  const tot = segs.reduce((s, x) => s + x.v, 0), r = 38, C = 2 * Math.PI * r; let off = 0;
  const arcs = tot ? segs.filter(x => x.v > 0).map(x => { const len = x.v / tot * C; const a = `<circle r="${r}" cx="50" cy="50" fill="none" stroke="${x.color}" stroke-width="15" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 50 50)"/>`; off += len; return a; }).join('') : '';
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${esc(segs.map(s => `${s.label} ${pct(s.v, tot)}%`).join('، '))}" style="flex:none"><circle r="${r}" cx="50" cy="50" fill="none" stroke="var(--empty)" stroke-width="15"/>${arcs}<text x="50" y="56" text-anchor="middle" font-size="17" font-weight="600" fill="var(--ink)" font-family="IBM Plex Mono, monospace">${center}</text></svg>`;
}
const legend = (segs, tot) => `<div class="stack" style="gap:5px;flex:1">${segs.filter(s => s.v > 0).map(s => `<div class="row" style="gap:6px;font-size:13px"><i style="width:10px;height:10px;border-radius:3px;background:${s.color};flex:none"></i><span style="flex:1">${s.label}</span><span class="num">${s.text ?? pct(s.v, tot) + '%'}</span></div>`).join('') || '<span class="mut">لسه مفيش</span>'}</div>`;
// أعمدة رأسية: أقدم حاجة على اليمين (زي القراية بالعربي)
function vbars(items, { h = 130, max } = {}) {
  const mx = max || Math.max(1, ...items.map(i => i.v));
  return `<div class="row" style="gap:6px;height:${h}px;align-items:flex-end" role="img" aria-label="${esc(items.map(i => `${i.label} ${i.text ?? i.v}`).join('، '))}">${items.map(i => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;height:100%">
    <span class="num" style="font-size:11px">${i.text ?? i.v}</span>
    <span style="width:100%;max-width:30px;border-radius:6px 6px 2px 2px;height:${Math.max(i.v > 0 ? 4 : 2, Math.round(i.v / mx * (h - 42)))}px;background:${i.v > 0 ? (i.color || 'var(--ink)') : 'var(--empty)'}"></span>
    <span style="font-size:11px;color:var(--mut);white-space:nowrap">${i.label}</span></div>`).join('')}</div>`;
}
// أعمدة مزدوجة (جديد واتحل مثلًا)
function vbars2(items, colors, { h = 130 } = {}) {
  const mx = Math.max(1, ...items.flatMap(i => [i.a, i.b]));
  const bar = (v, c) => `<span style="flex:1;max-width:14px;border-radius:4px 4px 1px 1px;height:${Math.max(v > 0 ? 4 : 2, Math.round(v / mx * (h - 42)))}px;background:${v > 0 ? c : 'var(--empty)'}"></span>`;
  return `<div class="row" style="gap:6px;height:${h}px;align-items:flex-end">${items.map(i => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;height:100%">
    <span class="num" style="font-size:10px">${i.a}·${i.b}</span><div class="row" style="gap:2px;align-items:flex-end;width:100%;justify-content:center">${bar(i.a, colors[0])}${bar(i.b, colors[1])}</div>
    <span style="font-size:11px;color:var(--mut);white-space:nowrap">${i.label}</span></div>`).join('')}</div>`;
}
// شريط أفقي بنسبة
const hbar = (label, p, color = 'var(--ink)', right = `${p}%`) => `<div class="stack" style="gap:4px"><div class="between" style="font-size:14px"><span>${label}</span><span class="num">${right}</span></div><div style="height:10px;border-radius:5px;background:var(--empty);overflow:hidden"><i style="display:block;height:100%;width:${Math.min(100, Math.max(0, p))}%;background:${color};border-radius:5px"></i></div></div>`;
const statBox = (v, l, sub = '') => `<div class="card" style="padding:12px"><div class="num" style="font-size:24px;line-height:1.2">${v}</div><div class="mut">${l}</div>${sub ? `<div style="font-size:12px;color:var(--mut)">${sub}</div>` : ''}</div>`;
const sec = (t, right = '') => `<div class="between"><span class="sec">${t}</span>${right}</div>`;

// ================= يومي =================
function winOf(date, prof, plans) {
  const p = plans.find(x => x.on_date === date);
  const s = (p?.day_start || prof?.day_start || '09:00').slice(0, 5), e = (p?.day_end || prof?.day_end || '23:00').slice(0, 5);
  const start = tsOf(date, s); let end = tsOf(date, e); if (end <= start) end += 864e5;   // يومك بيخلص بعد نص الليل
  return { s, e, start, end, own: !!p };
}
const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1)) / 6e4;
function dayStats(date, logs, w, now = Date.now()) {
  const L = logs.filter(l => l.on_date === date);
  const by = {}; let busy = 0, total = 0, rest = 0;
  for (const l of L) {
    const s = Date.parse(l.started_at), e = l.ended_at ? Date.parse(l.ended_at) : Math.max(s, now);
    const m = (e - s) / 6e4;
    by[l.kind] = (by[l.kind] || 0) + m;
    if (l.kind === 'rest') rest += m; else { total += m; busy += overlap(s, e, w.start, w.end); }
  }
  const winMin = (w.end - w.start) / 6e4;
  return { L, by, busy, total, rest, winMin, busyPct: Math.min(100, pct(busy, winMin)) };
}

async function logSheet(l = {}) {
  const date = l.on_date || st.day, gopt = await goalOptions(l.goal_id);
  const f = l.started_at ? hm(l.started_at) : '', t = l.ended_at ? hm(l.ended_at) : '';
  openSheet(l.id ? 'اللي عملته' : 'سجّل حاجة عملتها', `
    <label class="field"><span>عملت إيه؟</span><input name="text" value="${esc(l.text)}" ${l.id ? '' : 'autofocus'} placeholder="مثلًا: اجتماع مع الفنيين"></label>
    <div class="field"><span>النوع</span>${kindPills(l.kind || 'co')}</div>
    ${gopt}
    <div class="grid2"><label class="field"><span>من</span><input type="time" name="from" value="${f || l._from || ''}"></label>
    <label class="field"><span>لحد</span><input type="time" name="to" value="${t || l._to || ''}"></label></div>
    ${l.id && !l.ended_at ? '<p class="mut" style="margin:0">لسه شغال. سيب "لحد" فاضية لو لسه مخلصتش.</p>' : ''}
    <div class="btns">${l.id ? `<button class="btn" data-act="log-del" data-id="${l.id}">${ic('archive', 18)}امسح</button>` : ''}<button class="btn pri" data-act="dlog-save" data-id="${l.id || ''}" data-date="${date}">حفظ</button></div>`);
}
const kindPills = cur => `<div class="pills" data-group="dkind">${Object.entries(KINDS).map(([k, [l, c]]) => `<button type="button" data-v="${k}" class="${cur === k ? 'on' : ''}" data-act="pick"><i style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${c};margin-inline-end:5px;vertical-align:middle"></i>${l}</button>`).join('')}</div>`;

async function startSheet() {
  const t = today();
  const open = (await list('tasks', { eq: { done: false }, lte: ['due_on', t], order: 'created_at' })).slice(0, 6);
  openSheet('ابدأ حاجة', `
    <label class="field"><span>بتعمل إيه دلوقتي؟</span><input name="text" autofocus placeholder="مثلًا: زيارة محلات"></label>
    ${open.length ? `<div class="field"><span class="mut" style="font-weight:500">أو اختار من مهامك</span><div class="pills" style="flex-wrap:wrap">${open.map(x => `<button type="button" data-act="start-fill" data-v="${esc(x.title)}">${esc(x.title.slice(0, 40))}</button>`).join('')}</div></div>` : ''}
    <div class="field"><span>النوع</span>${kindPills('co')}</div>
    ${await goalOptions()}
    <p class="mut" style="margin:0">العداد هيشتغل، ولما تخلص دوس "خلصت". لو كان فيه حاجة شغالة، هتقف لوحدها.</p>
    <button class="btn amb" data-act="start-go">ابدأ العداد</button>`);
}
async function windowSheet(w) {
  openSheet('يومك بيبدأ وبيخلص إمتى', `
    <div class="grid2"><label class="field"><span>بيبدأ</span><input type="time" name="s" value="${w.s}"></label>
    <label class="field"><span>بيخلص</span><input type="time" name="e" value="${w.e}"></label></div>
    <label class="row card" style="padding:12px 14px"><input type="checkbox" name="all" ${w.own ? '' : 'checked'} style="width:22px;height:22px"><span style="flex:1">ده ميعادي الثابت لكل الأيام</span></label>
    <p class="mut" style="margin:0">لو شلت العلامة، الميعاد ده هيبقى ليوم ${fd(st.day)} بس.</p>
    <button class="btn pri" data-act="win-save">حفظ</button>`);
}

// ================= يومي: الأزرار التلاتة فوق =================
const daySeg = () => `<div class="seg">${[['now', 'النهاردة'], ['lines', 'يومك في سطور'], ['hours', 'أحسن ساعاتك']].map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-act="day-tab" data-v="${k}">${l}</button>`).join('')}</div>`;
const dayNav = isToday => `<div class="between"><button class="rb" data-act="day-move" data-v="-1" aria-label="اليوم اللي قبله">${ic('back', 20)}</button>
  ${isToday ? `<b class="disp" style="font-size:19px">النهاردة</b>` : `<button class="btn sm" data-act="day-today">ارجع للنهاردة</button>`}
  <button class="rb" data-act="day-move" data-v="1" aria-label="اليوم اللي بعده" ${isToday ? 'disabled style="opacity:.35"' : ''}>${ic('chev', 20)}</button></div>`;
const MOODS = [[1, '😞', 'وحش'], [2, '🙁', 'مش أحسن حاجة'], [3, '😐', 'عادي'], [4, '🙂', 'كويس'], [5, '😄', 'حلو جدًا']];

// اختيار الهدف اللي الوقت ده بيخدمه
async function goalOptions(cur) {
  const G = await list('goals', { eq: { status: 'active' }, order: 'title' });
  return G.length ? `<label class="field"><span>بيخدم أنهي هدف؟ (اختياري)</span><select name="goal"><option value="">من غير</option>${G.map(g => `<option value="${g.id}"${g.id === cur ? ' selected' : ''}>${esc(g.title)}</option>`).join('')}</select></label>` : '';
}
// ساعات اشتغلتها على هدف (صفحة الهدف بتستخدمها)
export async function goalMinutes(goalId) {
  return (await list('day_logs', { eq: { goal_id: goalId } })).reduce((s, l) => s + Math.max(0, ((l.ended_at ? Date.parse(l.ended_at) : Date.now()) - Date.parse(l.started_at)) / 6e4), 0);
}
export const durText = m => dur(m);

// ---------- يومك في سطور: كل اللي حصل في اليوم مترتب بالساعة ----------
async function linesView(d, isToday) {
  const ld = x => x ? localDate(x) : '';
  const [tasks, logs, ideas, problems, goals, notes, members, waits, habits, hlogs, points, learns, decs, lessons, journal, exps, incs, open] = await Promise.all([
    list('tasks'), list('day_logs', { eq: { on_date: d } }), list('ideas'), list('problems'), list('goals'), list('member_notes', { eq: { noted_on: d } }), list('team_members'),
    list('waiting_for'), list('habits'), list('habit_logs', { eq: { on_date: d } }), list('owner_points'), list('learnings'), list('decisions'), list('lessons'),
    list('day_journal', { eq: { on_date: d } }), list('expenses', { eq: { spent_on: d } }), list('incomes', { eq: { received_on: d } }), moneyOpen()]);
  const M = Object.fromEntries(members.map(m => [m.id, m.name])), G = Object.fromEntries(goals.map(g => [g.id, g.title]));
  const timed = [], untimed = [];
  const at = (ts, icon, text, color) => timed.push({ ts: Date.parse(ts), icon, text, color });
  for (const x of tasks) if (x.done && ld(x.done_at) === d) at(x.done_at, 'check', 'خلصت: ' + x.title, 'var(--ok)');
  for (const l of logs) at(l.started_at, 'clock', `${l.text} · ${l.ended_at ? dur((Date.parse(l.ended_at) - Date.parse(l.started_at)) / 6e4) : 'لسه شغال'}${l.goal_id && G[l.goal_id] ? ' · لهدف ' + G[l.goal_id] : ''}`, kc(l.kind));
  for (const x of ideas) if (ld(x.created_at) === d) at(x.created_at, 'spark', 'فكرة: ' + x.title);
  for (const x of problems) { if (ld(x.created_at) === d) at(x.created_at, 'alert', 'مشكلة جديدة: ' + x.title, 'var(--bad)'); if (x.solved_on === d) untimed.push(['check', 'اتحلت مشكلة: ' + x.title]); }
  for (const g of goals) if (g.done_on === d) untimed.push(['goal', 'اتحقق هدف: ' + g.title]);
  for (const x of notes) at(x.created_at, 'review', `${x.month ? 'تعليق الشهر على' : 'رأيك في'} ${M[x.member_id] || ''}: ${x.text}`);
  for (const w of waits) { if (ld(w.created_at) === d) at(w.created_at, 'user', `طلبت من ${w.who}: ${w.text}`); if (w.done && w.done_on === d) untimed.push(['check', `وصلت من ${w.who}: ${w.text}`]); }
  for (const x of points) if (x.discussed_on === d) untimed.push(['review', `اتكلمت مع ${M[x.member_id] || 'المالك'}: ${x.text}${x.decision ? ' ← ' + x.decision : ''}`]);
  for (const x of learns) if (ld(x.created_at) === d) at(x.created_at, 'book', 'اتعلمت: ' + x.text);
  for (const x of decs) if (x.decided_on === d) untimed.push(['check', 'قرار: ' + x.title]);
  for (const x of lessons) if (ld(x.created_at) === d) at(x.created_at, 'book', 'درس: ' + x.text);
  timed.sort((a, b) => a.ts - b.ts);
  const H = Object.fromEntries(habits.map(h => [h.id, h.title])), hd = hlogs.map(l => H[l.habit_id]).filter(Boolean);
  const j = journal[0] || {}, money = exps.length || incs.length;
  const sum = L => L.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const row = (when, icon, text, color) => `<div class="row" style="gap:10px;padding:8px 0;align-items:flex-start"><span class="num mut" style="width:56px;flex:none;font-size:12px;padding-top:2px">${when}</span><span class="k" style="width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex:none;${color ? `background:${color};color:#fff` : 'background:var(--mat)'}">${ic(icon, 15)}</span><span style="flex:1;line-height:1.5;font-size:14px">${esc(text)}</span></div>`;
  return `<div class="stack">${daySeg()}${dayNav(isToday)}
    <div class="card" style="padding:8px 14px"><div class="between" style="padding-top:4px"><b style="font-weight:600">${isToday ? 'النهاردة' : dayName(d) + ' ' + fd(d)}</b><span class="num mut">${timed.length + untimed.length}</span></div>
      <div class="list">${timed.map(e => row(fmtTime(hm(new Date(e.ts).toISOString())), e.icon, e.text, e.color)).join('') || (untimed.length ? '' : `<div class="mut" style="padding:8px 0">${isToday ? 'لسه محصلش حاجة متسجلة النهاردة.' : 'متسجلش حاجة في اليوم ده.'}</div>`)}
      ${untimed.map(([i, t]) => row('خلال اليوم', i, t)).join('')}</div></div>
    ${hd.length ? `<div class="card row" style="gap:10px;padding:10px 14px">${ic('repeat', 18)}<span style="flex:1">عملت عاداتك: ${esc(hd.join('، '))}</span></div>` : ''}
    ${money ? (open ? `<div class="card" style="padding:10px 14px"><div class="between"><b style="font-weight:600">فلوس اليوم</b><a href="#/money" class="mut" style="font-size:13px">فلوسي</a></div>
        <div class="row" style="gap:16px;margin-top:6px">${exps.length ? `<span>صرفت <b class="num">${n(sum(exps))}</b> ج <span class="mut">(${exps.length})</span></span>` : ''}${incs.length ? `<span>دخل <b class="num">${n(sum(incs))}</b> ج</span>` : ''}</div>
        <div class="list" style="margin-top:4px">${exps.map(e => `<div class="between" style="padding:5px 0;font-size:14px"><span>${esc(e.note || 'مصروف')}</span><span class="num">${n(e.amount)}</span></div>`).join('')}</div></div>` : lockedRow('فلوس اليوم')) : ''}
    <div class="card stack" style="gap:10px"><b style="font-weight:600">${isToday ? 'يومك كان عامل إزاي؟' : 'اليوم ده كان عامل إزاي؟'}</b>
      <div class="row" style="gap:6px">${MOODS.map(([v, e, l]) => `<button data-act="mood-set" data-v="${v}" aria-label="${l}" style="flex:1;min-height:52px;border-radius:12px;font-size:26px;border:${j.mood === v ? '2px solid var(--ink)' : '1px solid var(--line)'};background:${j.mood === v ? 'var(--amb-soft)' : 'transparent'};cursor:pointer">${e}</button>`).join('')}</div>
      <textarea class="inp" rows="3" data-change="journal-text" placeholder="رأيك في يومك: إيه اللي مشي كويس؟ وإيه اللي ضايقك؟">${esc(j.text)}</textarea></div>
  </div>`;
}

// ---------- أحسن ساعاتك: من آخر 30 يوم ----------
async function hoursView() {
  const t = today(), from = addDays(t, -29);
  const [logs, journal, hlogs] = await Promise.all([list('day_logs', { gte: ['on_date', from], lte: ['on_date', t] }), list('day_journal', { gte: ['on_date', from] }), list('habit_logs', { gte: ['on_date', from] })]);
  const work = logs.filter(l => l.kind !== 'rest' && l.started_at);
  const byHour = Array(24).fill(0), byDow = Array(7).fill(0), perDay = {};
  for (const l of work) {
    let s = Date.parse(l.started_at); const e = l.ended_at ? Date.parse(l.ended_at) : Date.now();
    perDay[l.on_date] = (perDay[l.on_date] || 0) + Math.max(0, e - s) / 6e4;
    byDow[new Date(l.on_date + 'T12:00').getDay()] += Math.max(0, e - s) / 6e4;
    while (s < e) { const d = new Date(s), nx = Math.min(e, new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime()); byHour[d.getHours()] += (nx - s) / 6e4; s = nx; }
  }
  const days = Object.keys(perDay).length, total = Object.values(perDay).reduce((a, b) => a + b, 0);
  if (days < 3) return `<div class="stack">${daySeg()}${empty('محتاج تسجّل وقتك في "يومي" كام يوم الأول (أسبوعين أحسن)، وبعدها هقولك إنت بتشتغل أحسن إمتى.')}</div>`;
  let best = 0, bestAt = 0; for (let h = 0; h <= 21; h++) { const v = byHour[h] + byHour[h + 1] + byHour[h + 2]; if (v > best) { best = v; bestAt = h; } }
  const DN = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
  const topDow = byDow.indexOf(Math.max(...byDow));
  const used = byHour.map((v, h) => [h, v]).filter(([, v]) => v > 0), h0 = Math.min(...used.map(x => x[0])), h1 = Math.max(...used.map(x => x[0]));
  const bars = vbars(byHour.slice(h0, h1 + 1).map((v, i) => ({ label: fmtHour(h0 + i), v: Math.round(v / 60 * 10) / 10, text: v >= 60 ? Math.round(v / 60) + 'س' : '', color: h0 + i >= bestAt && h0 + i < bestAt + 3 ? 'var(--amb)' : 'var(--ink)' })), { h: 150 });
  // المزاج: بيتقارن بأيام الشغل الكتير وأيام العادات
  const moods = journal.filter(x => x.mood);
  let moodHtml = '';
  if (moods.length >= 5) {
    const avgOf = L => L.length ? (L.reduce((s, x) => s + x.mood, 0) / L.length).toFixed(1) : null;
    const habitDays = new Set(hlogs.map(l => l.on_date));
    const heavy = moods.filter(x => (perDay[x.on_date] || 0) >= 600), light = moods.filter(x => (perDay[x.on_date] || 0) < 600);
    const withH = moods.filter(x => habitDays.has(x.on_date)), noH = moods.filter(x => !habitDays.has(x.on_date));
    const lines = [`متوسط مزاجك: <b class="num">${avgOf(moods)}</b> من 5`];
    if (withH.length >= 2 && noH.length >= 2) lines.push(`الأيام اللي عملت فيها عاداتك: <b class="num">${avgOf(withH)}</b> · من غيرها: <b class="num">${avgOf(noH)}</b>`);
    if (heavy.length >= 2 && light.length >= 2) lines.push(`أيام الشغل أكتر من 10 ساعات: <b class="num">${avgOf(heavy)}</b> · الأقل: <b class="num">${avgOf(light)}</b>`);
    moodHtml = `<div class="card stack" style="gap:6px"><b style="font-weight:600">مزاجك بيبقى أحسن إمتى؟</b>${lines.map(x => `<div style="font-size:14px;line-height:1.6">${x}</div>`).join('')}</div>`;
  } else moodHtml = `<div class="card mut" style="font-size:14px">سجّل مزاجك في "يومك في سطور" ${5 - moods.length} أيام كمان، وهقولك مزاجك بيبقى أحسن إمتى.</div>`;
  return `<div class="stack">${daySeg()}
    <div class="card stack" style="background:var(--dock);border-color:var(--dock);color:#fff;gap:6px;padding:16px">
      <div style="font-size:14px;color:#C9D2D9">أكتر وقت بتشتغل فيه</div>
      <div class="disp" style="font-size:26px">من ${fmtHour(bestAt)} لـ ${fmtHour((bestAt + 3) % 24)}</div>
      <div style="font-size:13px;color:#C9D2D9">حط فيه أهم حاجاتك. ومتوسط شغلك ${dur(total / days)} في اليوم (${days} يوم متسجل)</div></div>
    <div class="card stack" style="gap:8px"><div class="between"><b style="font-weight:600">شغلك في كل ساعة</b><span class="mut" style="font-size:12px">آخر 30 يوم</span></div>${bars}</div>
    <div class="grid2">${statBox(DN[topDow], 'أنشط يوم في الأسبوع')}${statBox(dur(total), 'شغل في آخر 30 يوم')}</div>
    ${moodHtml}
  </div>`;
}

// ================= تقدّم الشركة =================
// الحسبة دي بتستخدمها صفحة "تقدّم الشركة" وتقرير المالك
export async function companyProgress() {
  const t = today();
  const [goals, prog, metrics, problems, log, tasks] = await Promise.all([
    list('goals', { order: 'due_on' }), list('v_goal_progress'), list('company_metrics', { order: 'sort' }),
    list('problems'), list('company_log', { order: 'happened_on' }), list('tasks', { notNull: 'done_at' })]);
  const P = Object.fromEntries(prog.map(p => [p.id, p]));
  const M = Object.fromEntries(metrics.map(m => [m.id, m]));
  const active = goals.filter(g => g.status === 'active').map(g => {
    const p = P[g.id] || {}, progress = p.progress || 0;
    const created = (g.created_at || t).slice(0, 10);
    let expected = null, state = 'ok';
    if (g.due_on) {
      const span = Math.max(1, (Date.parse(g.due_on) - Date.parse(created)) / 864e5), gone = (Date.parse(t) - Date.parse(created)) / 864e5;
      expected = Math.round(Math.min(1, Math.max(0, gone / span)) * 100);
      state = g.due_on < t ? 'late' : progress + 15 < expected ? 'behind' : 'ok';
    }
    const m = g.metric_id && M[g.metric_id];
    const target = m && g.metric_target != null ? { label: m.label, unit: m.unit, value: Number(m.value) || 0, target: Number(g.metric_target), pct: Number(g.metric_target) ? Math.min(100, pct(Number(m.value) || 0, Number(g.metric_target))) : 0 } : null;
    const left = g.due_on ? Math.round((Date.parse(g.due_on) - Date.parse(t)) / 864e5) : null;
    return { ...g, progress, steps_done: p.steps_done || 0, steps_total: p.steps_total || 0, expected, state, target, left };
  });
  const done = goals.filter(g => g.status === 'done');
  const months = [...Array(6)].map((_, i) => { const d = new Date(t.slice(0, 7) + '-15'); d.setMonth(d.getMonth() - 5 + i); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; });
  const mLabel = m => new Date(m + '-15').toLocaleDateString(LOC, { month: 'short' });
  const weeks = [...Array(8)].map((_, i) => addDays(t, -7 * (7 - i) - 6));   // بداية كل أسبوع من آخر 8
  const solved = problems.filter(p => p.status === 'solved');
  const solveDays = solved.filter(p => p.solved_on && p.created_at).map(p => Math.max(0, (Date.parse(p.solved_on) - Date.parse(p.created_at.slice(0, 10))) / 864e5));
  const cats = {}; problems.filter(p => p.status !== 'solved').forEach(p => { const c = p.category || 'من غير مجال'; cats[c] = (cats[c] || 0) + 1; });
  const areas = {}; active.forEach(g => { (areas[g.area] ||= []).push(g.progress); });
  return {
    t, active, metrics,
    avg: active.length ? Math.round(active.reduce((s, g) => s + g.progress, 0) / active.length) : 0,
    onTrack: active.filter(g => g.state === 'ok').length, behind: active.filter(g => g.state === 'behind').length, late: active.filter(g => g.state === 'late').length,
    doneAll: done.length, doneMonth: done.filter(g => (g.done_on || '') >= t.slice(0, 7) + '-01').length,
    doneByMonth: months.map(m => ({ label: mLabel(m), v: done.filter(g => (g.done_on || '').slice(0, 7) === m).length })),
    stepsDone: active.reduce((s, g) => s + g.steps_done, 0), stepsTotal: active.reduce((s, g) => s + g.steps_total, 0),
    targets: active.filter(g => g.target),
    tasksByWeek: weeks.map((w, i) => ({ label: i === 7 ? 'الأسبوع ده' : fd(w), v: tasks.filter(x => x.done && localDate(x.done_at) >= w && localDate(x.done_at) <= addDays(w, 6)).length })),
    tasks30: tasks.filter(x => x.done && localDate(x.done_at) > addDays(t, -30)).length,
    log30: log.filter(x => !x.archived_at && x.happened_on > addDays(t, -30)).length,
    recentLog: log.filter(x => !x.archived_at).slice(-5).reverse(),
    since: [log[0]?.happened_on, goals[0] && goals.map(g => (g.created_at || '').slice(0, 10)).filter(Boolean).sort()[0]].filter(Boolean).sort()[0] || null,
    prob: {
      open: problems.filter(p => p.status === 'open').length, solving: problems.filter(p => p.status === 'solving').length, solved: solved.length, total: problems.length,
      rate: pct(solved.length, problems.length), avgDays: solveDays.length ? Math.round(solveDays.reduce((s, x) => s + x, 0) / solveDays.length) : null,
      repeated: problems.filter(p => p.status !== 'solved' && p.occurrences > 1).sort((a, b) => b.occurrences - a.occurrences).slice(0, 3),
      cats: Object.entries(cats).sort((a, b) => b[1] - a[1]),
      byMonth: months.map(m => ({ label: mLabel(m), a: problems.filter(p => (p.created_at || '').slice(0, 7) === m).length, b: solved.filter(p => (p.solved_on || '').slice(0, 7) === m).length })),
    },
    areas: Object.entries(areas).map(([a, L]) => ({ area: a, n: L.length, avg: Math.round(L.reduce((s, x) => s + x, 0) / L.length) })).sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area)),
  };
}
const STATE = { ok: ['في الميعاد', 'ok'], behind: ['متأخر عن الخطة', 'amb'], late: ['فات ميعاده', 'bad'] };

// للتقرير: سطور كلام + رسمة SVG تنفع في الـ PDF
export function progressReport(c) {
  const b = '• ';
  const lines = [
    `الشركة ماشية ناحية أهدافها بنسبة ${c.avg}% (${c.active.length} هدف شغال: ${c.onTrack} في الميعاد، ${c.behind} متأخر عن الخطة، ${c.late} فات ميعاده)`,
    ...c.targets.map(g => b + `${g.target.label}: ${n(g.target.value)} من ${n(g.target.target)}${g.target.unit ? ' ' + g.target.unit : ''} (${g.target.pct}%) — هدف: ${g.title}`),
    b + `خطوات خطط الأهداف: اتعمل ${c.stepsDone} من ${c.stepsTotal}${c.stepsTotal ? ` (${pct(c.stepsDone, c.stepsTotal)}%)` : ''}`,
    b + `أهداف اتحققت: ${c.doneAll} من البداية، منهم ${c.doneMonth} الشهر ده`,
    b + `المشاكل: ${c.prob.open + c.prob.solving} مفتوحة، ${c.prob.solved} اتحلت (نسبة الحل ${c.prob.rate}%)${c.prob.avgDays != null ? `، ومتوسط وقت الحل ${c.prob.avgDays} يوم` : ''}`,
    ...c.areas.map(a => b + `${a.area}: ${a.avg}% (${a.n} ${a.n === 1 ? 'هدف' : 'أهداف'})`),
  ];
  // رسمة أعمدة أفقية لكل هدف (SVG عشان تطلع في الطباعة)
  const G = c.active.slice(0, 10), rowH = 26, W = 600;
  const svg = G.length ? `<svg viewBox="0 0 ${W} ${G.length * rowH + 10}" width="100%" direction="ltr" style="max-width:600px;margin:6px 0;direction:ltr" xmlns="http://www.w3.org/2000/svg">${G.map((g, i) => {
    const y = i * rowH + 4, w = Math.round(g.progress / 100 * 260), col = g.state === 'late' ? '#C42B3B' : g.state === 'behind' ? '#F0A202' : '#2E8B57';
    return `<text x="${W}" y="${y + 15}" text-anchor="end" font-size="12" font-family="sans-serif" fill="#000">${esc(g.title.slice(0, 38))}</text><rect x="40" y="${y + 4}" width="260" height="13" rx="4" fill="#E4EAE6"/><rect x="${300 - w}" y="${y + 4}" width="${w}" height="13" rx="4" fill="${col}"/><text x="34" y="${y + 15}" text-anchor="end" font-size="12" font-family="monospace" fill="#000">${g.progress}%</text>`;
  }).join('')}</svg>` : '';
  return { lines, svg };
}

export default {
  day: {
    async render(p) {
      if (p?.query?.tab) st.tab = p.query.tab;
      const d = st.day, t = today(), isToday = d === t;
      const from7 = addDays(d, -6);
      const [prof, plans, logs, tasks] = await Promise.all([single('profiles'), list('day_plans', { gte: ['on_date', from7], lte: ['on_date', d] }),
        list('day_logs', { gte: ['on_date', from7], lte: ['on_date', d], order: 'started_at' }), list('tasks')]);
      const w = winOf(d, prof, plans), S = dayStats(d, logs, w);
      const runAny = (await list('day_logs', { order: 'started_at', asc: false, limit: 5 })).find(l => !l.ended_at);
      // المهام
      const dayTasks = tasks.filter(x => x.due_on === d || (isToday && !x.done && x.due_on < d));
      const doneT = dayTasks.filter(x => x.done).length;
      const lateT = dayTasks.filter(x => !x.done && x.due_on < d).length;
      const doneAt = tasks.filter(x => x.done && x.done_at && localDate(x.done_at) === d);
      // آخر 7 أيام
      const days7 = [...Array(7)].map((_, i) => addDays(from7, i));
      const week = days7.map(x => { const ww = winOf(x, prof, plans), s = dayStats(x, logs, ww); return { label: x === t ? 'النهاردة' : SHORT[new Date(x + 'T12:00').getDay()], v: s.busyPct, text: s.busyPct + '%', color: x === d ? 'var(--amb)' : 'var(--ink)', tasks: tasks.filter(k => k.done && k.done_at && localDate(k.done_at) === x).length }; });
      // شريط اليوم
      const span = w.end - w.start, now = Date.now();
      const xr = ts => Math.max(0, Math.min(1, (ts - w.start) / span));
      const blocks = S.L.map(l => { const s = Date.parse(l.started_at), e = l.ended_at ? Date.parse(l.ended_at) : now; if (e <= w.start || s >= w.end) return ''; const a = xr(s), b = xr(e); return `<rect x="${((1 - b) * 1000).toFixed(1)}" y="4" width="${Math.max(4, (b - a) * 1000).toFixed(1)}" height="40" rx="6" fill="${kc(l.kind)}"/>`; }).join('');
      const sh = new Date(w.start).getHours(), hours = Math.round(span / 36e5), step = hours > 12 ? 3 : 2;
      const ticks = [...Array(Math.floor(hours / step) + 1)].map((_, i) => { const f = (i * step * 36e5) / span; return f <= 1 ? `<span style="position:absolute;right:${(f * 100).toFixed(1)}%;transform:translateX(50%);font-size:11px;color:var(--mut)">${fmtHour((sh + i * step) % 24)}</span>` : ''; }).join('');
      const nowLine = isToday && now > w.start && now < w.end ? `<rect x="${((1 - xr(now)) * 1000 - 1.5).toFixed(1)}" y="0" width="3" height="48" fill="var(--bad)"/>` : '';
      const segs = Object.entries(KINDS).map(([k, [l, c]]) => ({ label: l, color: c, v: S.by[k] || 0, text: dur(S.by[k] || 0) }));
      const allMin = segs.reduce((s, x) => s + x.v, 0);
      // السجل: اللي عملته + المهام اللي خلصت
      const items = [...S.L.map(l => ({ at: Date.parse(l.started_at), html: `<button class="lnk" data-act="log-open" data-id="${l.id}"><span class="k" style="background:${kc(l.kind)}"></span><span class="t">${esc(l.text)}<small>${fmtTime(hm(l.started_at))} – ${l.ended_at ? fmtTime(hm(l.ended_at)) : 'لسه شغال'} · ${KINDS[l.kind]?.[0] || ''}</small></span><span class="num mut" style="font-size:13px">${l.ended_at ? dur((Date.parse(l.ended_at) - Date.parse(l.started_at)) / 6e4) : '<span data-since="' + l.started_at + '">' + elapsed(l.started_at) + '</span>'}</span></button>` })),
        ...doneAt.map(x => ({ at: Date.parse(x.done_at), html: `<button class="lnk" data-act="task-open" data-id="${x.id}"><span class="k" style="background:var(--ok);color:#fff">${ic('check', 16)}</span><span class="t">${esc(x.title)}<small>خلصت المهمة · ${fmtTime(hm(x.done_at))}</small></span></button>` }))].sort((a, b) => a.at - b.at);
      return {
        title: 'يومي', sub: isToday ? 'النهاردة · ' + fd(d) : dayName(d) + ' · ' + fd(d), back: '#/today',
        fab: st.tab === 'now' ? { label: 'سجّل حاجة', act: 'log-new' } : null,
        html: st.tab === 'now' ? `<div class="stack">${daySeg()}
          <div class="between"><button class="rb" data-act="day-move" data-v="-1" aria-label="اليوم اللي قبله">${ic('back', 20)}</button>
            ${isToday ? `<b class="disp" style="font-size:19px">النهاردة</b>` : `<button class="btn sm" data-act="day-today">ارجع للنهاردة</button>`}
            <button class="rb" data-act="day-move" data-v="1" aria-label="اليوم اللي بعده" ${isToday ? 'disabled style="opacity:.35"' : ''}>${ic('chev', 20)}</button></div>
          ${runAny ? `<div class="card row" style="background:var(--amb);border-color:var(--amb);color:#15202B;gap:10px"><div style="flex:1;line-height:1.4"><div style="font-size:13px">شغال دلوقتي</div><div style="font-weight:600">${esc(runAny.text)}</div></div><span class="num" style="font-size:20px" data-since="${runAny.started_at}">${elapsed(runAny.started_at)}</span><button class="btn pri sm" data-act="stop-go" data-id="${runAny.id}">خلصت</button></div>`
            : isToday ? `<div class="btns"><button class="btn amb" data-act="start-new">${ic('clock', 20)}ابدأ حاجة</button><button class="btn" data-act="log-new">${ic('plus', 18)}سجّل بإيدك</button></div>` : ''}
          <button class="card row" data-act="win-edit" style="padding:10px 14px">${ic('clock', 18)}<span style="flex:1">يومك من <b>${fmtTime(w.s)}</b> لـ <b>${fmtTime(w.e)}</b> <span class="mut">(${dur(S.winMin)})</span></span>${ic('edit', 16)}</button>
          <div class="card stack" style="gap:10px;padding:16px">
            <div class="between" style="align-items:baseline"><span style="font-weight:600">الوقت المشغول</span><span><span class="num" style="font-size:36px;line-height:1">${S.busyPct}</span><span class="mut"> %</span></span></div>
            ${bat(S.busyPct, S.busyPct >= 60 ? 'done' : 'run', { big: true, pct: false })}
            <div class="row mut" style="gap:6px 16px;flex-wrap:wrap"><span>مشغول <b class="num" style="color:var(--ink)">${dur(S.busy)}</b></span><span>فاضي <b class="num" style="color:var(--ink)">${dur(Math.max(0, S.winMin - S.busy))}</b></span>${S.rest ? `<span>راحة <b class="num" style="color:var(--ink)">${dur(S.rest)}</b></span>` : ''}${S.total - S.busy > 1 ? `<span>برا يومك <b class="num" style="color:var(--ink)">${dur(S.total - S.busy)}</b></span>` : ''}</div>
            <div style="margin-top:4px"><svg viewBox="0 0 1000 48" width="100%" height="44" preserveAspectRatio="none" role="img" aria-label="شريط اليوم"><rect x="0" y="4" width="1000" height="40" rx="8" fill="var(--empty)"/>${blocks}${nowLine}</svg>
              <div style="position:relative;height:18px;margin-top:2px">${ticks}</div></div>
          </div>
          <div class="grid2">
            <div class="card stack" style="gap:8px;padding:12px"><span style="font-weight:600">المهام</span><div><span class="num" style="font-size:28px">${doneT}</span><span class="mut"> من ${dayTasks.length}</span></div>${bat(pct(doneT, dayTasks.length), doneT && doneT === dayTasks.length ? 'done' : 'run', { seg: 8, pct: true })}${lateT ? `<span class="late" style="font-size:13px">${lateT} متأخرة</span>` : `<span class="mut">${dayTasks.length ? 'مفيش متأخر' : 'مفيش مهام'}</span>`}</div>
            <div class="card stack" style="gap:8px;padding:12px;align-items:center"><span style="font-weight:600;align-self:flex-start">وقتي راح فين</span>${donut(segs, allMin ? dur(allMin) : '0', 104)}</div>
          </div>
          ${allMin ? `<div class="card" style="padding:12px 14px">${legend(segs, allMin)}</div>` : ''}
          <div class="card stack" style="gap:8px"><div class="between"><b style="font-weight:600">آخر 7 أيام</b><span class="mut" style="font-size:12px">الوقت المشغول</span></div>${vbars(week, { max: 100 })}
            <div class="row mut" style="gap:6px;font-size:11px;justify-content:space-around">${week.map(x => `<span style="flex:1;text-align:center">${x.tasks ? '✓' + x.tasks : '·'}</span>`).join('')}</div><div class="mut" style="font-size:12px">✓ = مهام خلصت في اليوم</div></div>
          <div class="card" style="padding:8px 14px"><div class="between" style="padding-top:4px"><b style="font-weight:600">عملت إيه ${isToday ? 'النهاردة' : 'اليوم ده'}</b><span class="num mut">${items.length}</span></div>
            <div class="list">${items.map(i => i.html).join('') || `<div class="mut" style="padding:8px 0">${isToday ? 'دوس "ابدأ حاجة" لما تبدأ شغلانة، أو سجّل اللي عملته بإيدك. والمهام اللي بتخلصها بتظهر هنا لوحدها.' : 'متسجلش حاجة في اليوم ده.'}</div>`}</div></div>
        </div>` : st.tab === 'lines' ? await linesView(d, isToday) : await hoursView(),
      };
    },
    actions: {
      'day-tab'(el) { st.tab = el.dataset.v; doRefresh(); },
      'day-move'(el) { const nx = addDays(st.day, Number(el.dataset.v)); if (nx <= today()) { st.day = nx; doRefresh(); } },
      'day-today'() { st.day = today(); doRefresh(); },
      'start-new': () => startSheet(),
      'log-new'() { const now = new Date(); logSheet({ on_date: st.day, _from: st.day === today() ? `${pad(Math.max(0, now.getHours() - 1))}:${pad(now.getMinutes())}` : '', _to: st.day === today() ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : '' }); },
      async 'log-open'(el) { const l = (await list('day_logs', { eq: { id: el.dataset.id } }))[0]; l && logSheet(l); },
      async 'win-edit'() { const [prof, plans] = await Promise.all([single('profiles'), list('day_plans', { eq: { on_date: st.day } })]); windowSheet(winOf(st.day, prof, plans)); },
    },
  },

  progress: {
    async render() {
      const c = await companyProgress();
      const P = c.prob;
      const probSegs = [{ label: 'مفتوحة', v: P.open, color: 'var(--bad)' }, { label: 'بتتحل', v: P.solving, color: 'var(--amb)' }, { label: 'اتحلت', v: P.solved, color: 'var(--ok)' }];
      return {
        title: 'تقدّم الشركة', sub: c.since ? `من ${fd(c.since)} لحد النهاردة` : 'روحنا فين وقدامنا قد إيه', back: '#/company',
        html: `<div class="stack" style="padding-bottom:20px">
          <div class="card stack" style="background:var(--dock);border-color:var(--dock);color:#fff;gap:10px;padding:18px 16px">
            <div style="font-size:14px;color:#C9D2D9">ماشيين ناحية أهدافنا</div>
            <div class="row" style="align-items:baseline;gap:6px"><span class="num" style="font-size:46px;line-height:1">${c.avg}</span><span style="color:#C9D2D9">% متوسط تقدم الأهداف الشغالة</span></div>
            <div style="display:flex;height:12px;border-radius:6px;overflow:hidden;gap:2px;background:#26313A" role="img" aria-label="حالة الأهداف">${c.active.length ? `<span style="width:${pct(c.onTrack, c.active.length)}%;background:#4CC38A"></span><span style="width:${pct(c.behind, c.active.length)}%;background:var(--amb)"></span><span style="width:${pct(c.late, c.active.length)}%;background:#FF8A95"></span>` : ''}</div>
            <div class="row" style="flex-wrap:wrap;gap:4px 14px;font-size:13px;color:#C9D2D9"><span><b class="num" style="color:#fff">${c.active.length}</b> هدف شغال</span><span><b class="num" style="color:#4CC38A">${c.onTrack}</b> في الميعاد</span><span><b class="num" style="color:var(--amb)">${c.behind}</b> متأخر عن الخطة</span><span><b class="num" style="color:#FF8A95">${c.late}</b> فات ميعاده</span></div>
          </div>

          ${sec('روحنا فين')}
          <div class="grid2">${statBox(c.doneAll, 'أهداف اتحققت', `منهم ${c.doneMonth} الشهر ده`)}${statBox(c.log30, 'تطورات في السجل', 'آخر 30 يوم')}${statBox(c.tasks30, 'مهام خلصت', 'آخر 30 يوم')}${statBox(c.stepsTotal ? pct(c.stepsDone, c.stepsTotal) + '%' : '—', 'من خطوات الخطط اتعمل', `${c.stepsDone} من ${c.stepsTotal} خطوة`)}</div>
          <div class="card stack" style="gap:8px"><b style="font-weight:600">أهداف اتحققت كل شهر</b>${vbars(c.doneByMonth.map(x => ({ ...x, color: 'var(--ok)' })))}</div>
          ${c.recentLog.length ? `<div class="card" style="padding:10px 14px"><div class="between"><b style="font-weight:600">آخر التطورات</b><a href="#/company" class="mut" style="font-size:13px">السجل كله</a></div><div class="list">${c.recentLog.map(x => `<div style="padding:8px 0;line-height:1.5"><span class="mut">${fd(x.happened_on)}</span> · ${esc(x.text)}</div>`).join('')}</div></div>` : ''}

          ${sec('قدامنا قد إيه')}
          ${c.targets.length ? `<div class="card stack" style="gap:14px">${c.targets.map(g => hbar(`${esc(g.target.label)}`, g.target.pct, g.state === 'late' ? 'var(--bad)' : 'var(--ok)', `${n(g.target.value)} من ${n(g.target.target)}${g.target.unit ? ' ' + esc(g.target.unit) : ''}`) + `<div class="mut" style="font-size:12px;margin-top:-8px">باقي ${n(Math.max(0, g.target.target - g.target.value))}${g.target.unit ? ' ' + esc(g.target.unit) : ''} · هدف: ${esc(g.title)}</div>`).join('')}</div>`
            : `<div class="empty">اربط أهدافك بمؤشر ورقم مستهدف (من جوه الهدف: "حدّث مؤشر")، وهتشوف هنا قدامك قد إيه بالأرقام.</div>`}
          <div class="card" style="padding:12px 14px">${hbar('خطوات الخطط', c.stepsTotal ? pct(c.stepsDone, c.stepsTotal) : 0, 'var(--amb)', `باقي ${c.stepsTotal - c.stepsDone} خطوة`)}</div>

          ${sec('الأهداف الشغالة', '<a href="#/goals" class="mut" style="font-weight:500">كل الأهداف</a>')}
          ${c.active.length ? c.active.map(g => `<a class="card stack" style="gap:8px" href="#/goal/${g.id}"><div class="between"><span class="chip">${esc(g.area)}</span><span class="tag ${STATE[g.state][1]}">${STATE[g.state][0]}</span></div>
            <div class="title">${esc(g.title)}</div>${bat(g.progress, g.state === 'late' ? 'late' : 'run')}
            <div class="row mut" style="gap:4px 14px;flex-wrap:wrap;font-size:13px"><span>${g.steps_total ? `${g.steps_done} من ${g.steps_total} خطوات` : 'لسه مفيش خطة'}</span>${g.expected != null ? `<span>المفروض نكون ${g.expected}% دلوقتي</span>` : ''}${g.left != null ? `<span>${g.left < 0 ? `متأخر ${-g.left} يوم` : g.left === 0 ? 'ميعاده النهاردة' : `باقي ${g.left} يوم`}</span>` : ''}</div></a>`).join('') : empty('مفيش أهداف شغالة دلوقتي.')}
          ${c.areas.length > 1 ? `<div class="card stack" style="gap:12px"><b style="font-weight:600">التقدم حسب كل جزء في الشغل</b>${c.areas.map(a => hbar(`${esc(a.area)} <span class="mut">(${a.n})</span>`, a.avg)).join('')}</div>` : ''}

          ${sec('بنتقدم بخطوات قد إيه')}
          <div class="card stack" style="gap:8px"><div class="between"><b style="font-weight:600">مهام خلصت كل أسبوع</b><span class="mut" style="font-size:12px">آخر 8 أسابيع</span></div>${vbars(c.tasksByWeek, { h: 140 })}</div>

          ${sec('مشاكلنا قد إيه', '<a href="#/problems" class="mut" style="font-weight:500">سجل المشاكل</a>')}
          <div class="card row" style="gap:14px">${donut(probSegs, P.total ? P.rate + '%' : '—', 108)}<div class="stack" style="gap:6px;flex:1">${legend(probSegs.map(s => ({ ...s, text: String(s.v) })), P.total)}<div class="mut" style="font-size:12px">الرقم في النص = نسبة المشاكل اللي اتحلت</div></div></div>
          <div class="grid2">${statBox(P.avgDays != null ? P.avgDays : '—', 'يوم متوسط حل المشكلة')}${statBox(P.repeated.length, 'مشاكل بتتكرر', 'ولسه متحلتش')}</div>
          ${P.repeated.length ? `<div class="card" style="padding:10px 14px"><b style="font-weight:600">أكتر حاجة بتتكرر</b><div class="list">${P.repeated.map(p => `<a class="lnk" href="#/problems?open=${p.id}"><span class="k" style="background:var(--bad);color:#fff">${ic('repeat', 16)}</span><span class="t">${esc(p.title)}<small>اتكررت ${p.occurrences} مرات</small></span></a>`).join('')}</div></div>` : ''}
          <div class="card stack" style="gap:8px"><div class="between"><b style="font-weight:600">مشاكل جديدة واتحلت كل شهر</b></div>${vbars2(P.byMonth, ['var(--bad)', 'var(--ok)'])}
            <div class="row mut" style="gap:12px;font-size:12px"><span class="row" style="gap:4px"><i style="width:9px;height:9px;border-radius:3px;background:var(--bad)"></i>جديدة</span><span class="row" style="gap:4px"><i style="width:9px;height:9px;border-radius:3px;background:var(--ok)"></i>اتحلت</span></div></div>
          ${P.cats.length ? `<div class="card stack" style="gap:12px"><b style="font-weight:600">المشاكل المفتوحة حسب النوع</b>${P.cats.map(([k, v]) => hbar(esc(k), pct(v, P.open + P.solving), 'var(--bad)', String(v))).join('')}</div>` : ''}

          <a class="btn pri" href="#/report">${ic('doc', 18)}اعمل تقرير للمالك</a>
          <p class="mut" style="margin:0;text-align:center">الأرقام دي بتدخل في تقرير المالك تحت "تقدّم الشركة".</p>
        </div>`,
      };
    },
  },
};

// actions الشيتات
export const insightGlobal = {
  async 'mood-set'(el) { try { await upsert('day_journal', { on_date: st.day, mood: Number(el.dataset.v) }, 'user_id,on_date'); doRefresh(); } catch (e) { fail(e); } },
  async 'journal-text'(el) { try { await upsert('day_journal', { on_date: st.day, text: el.value.trim() || null }, 'user_id,on_date'); toast('اتحفظ'); } catch (e) { fail(e); } },
  'start-fill'(el) { const i = sheetEl().querySelector('[name=text]'); i.value = el.dataset.v; },
  async 'start-go'() {
    const s = sheetEl(), f = formOf(s); if (!f.text) return toast('اكتب بتعمل إيه');
    const kind = s.querySelector('[data-group=dkind] .on')?.dataset.v || 'co';
    try {
      const now = new Date().toISOString();
      for (const l of (await list('day_logs', { order: 'started_at', asc: false, limit: 10 })).filter(l => !l.ended_at)) await upd('day_logs', l.id, { ended_at: now });
      await ins('day_logs', { on_date: today(), started_at: now, ended_at: null, text: f.text, kind, ...(f.goal ? { goal_id: f.goal } : {}) });
      st.day = today(); closeSheet(); toast('العداد شغال'); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'stop-go'(el) {
    try {
      const l = (await list('day_logs', { eq: { id: el.dataset.id } }))[0]; if (!l) return;
      await upd('day_logs', l.id, { ended_at: new Date().toISOString() });
      toast(`خلصت: ${l.text} · ${dur((Date.now() - Date.parse(l.started_at)) / 6e4)}`); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'dlog-save'(el) {
    const s = sheetEl(), f = formOf(s); if (!f.text) return toast('اكتب عملت إيه');
    if (!f.from) return toast('اكتب بدأت الساعة كام');
    const date = el.dataset.date, kind = s.querySelector('[data-group=dkind] .on')?.dataset.v || 'co';
    const start = tsOf(date, f.from); let end = f.to ? tsOf(date, f.to) : null;
    if (end != null && end <= start) end += 864e5;   // خلص بعد نص الليل
    if (end == null && !el.dataset.id && date !== today()) return toast('اكتب خلصت الساعة كام');
    const row = { on_date: date, started_at: new Date(start).toISOString(), ended_at: end == null ? (el.dataset.id ? null : new Date(Math.max(start, Date.now())).toISOString()) : new Date(end).toISOString(), text: f.text, kind };
    if (f.goal !== undefined) row.goal_id = f.goal || null;
    try { if (el.dataset.id) await upd('day_logs', el.dataset.id, row); else await ins('day_logs', row); closeSheet(); doRefresh(); } catch (e) { fail(e); }
  },
  async 'log-del'(el) { closeSheet(); await archiveWithUndo('day_logs', el.dataset.id, 'اتشال من يومك'); },
  async 'win-save'() {
    const f = formOf(sheetEl()); if (!f.s || !f.e) return toast('اكتب الميعادين');
    try {
      if (f.all) {
        const ses = await auth.session();
        await upsert('profiles', { user_id: ses.user.id, day_start: f.s, day_end: f.e }, 'user_id');
        const own = (await list('day_plans', { eq: { on_date: st.day } }))[0];
        if (own) await upd('day_plans', own.id, { day_start: f.s, day_end: f.e });
      } else await upsert('day_plans', { on_date: st.day, day_start: f.s, day_end: f.e }, 'user_id,on_date');
      closeSheet(); toast('اتحفظ'); doRefresh();
    } catch (e) { fail(e); }
  },
};
