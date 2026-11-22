// طبقة البيانات — نسخة كاملة على الموبايل (أوفلاين) بتتزامن مع Supabase
// كل القراءة من النسخة اللي على الجهاز (فورية وشغالة من غير نت)،
// وكل تعديل بيتحفظ على الجهاز الأول، وبيتبعت لـ Supabase أول ما النت يبقى موجود.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR-ANON');
export const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null;

const TABLES = ['profiles','company','company_metrics','company_log','ideas','goals','plan_steps','recurring_tasks','tasks','links','problems','role_criteria','team_members','member_ratings','member_notes','weekly_reviews','courses','org_units','sops','job_roles','positions','candidates','projects','project_clients','project_devs','project_dev_notes','wallets','assets','investments','investment_returns','debts','debt_payments','commitments','budget_categories','expenses','incomes','financial_goals','net_worth_snapshots','push_subscriptions','day_logs','day_plans','habits','habit_logs','life_tracks','life_areas','departments','waiting_for','owner_points','inbox','templates','day_journal','media','learnings','decisions','lessons','occasions'];
const ARCH = new Set(['company_metrics','company_log','ideas','goals','recurring_tasks','tasks','problems','team_members','courses','sops','positions','candidates','projects','project_clients','project_devs','wallets','assets','investments','debts','commitments','budget_categories','expenses','incomes','financial_goals','day_logs','habits','life_tracks','life_areas','departments','waiting_for','owner_points','inbox','templates','media','learnings','decisions','lessons','occasions']);
const KEY = { profiles: 'user_id', company: 'user_id' };
const NO_UPDATED = new Set(['links','member_notes','project_dev_notes','investment_returns','debt_payments','expenses','incomes','net_worth_snapshots','push_subscriptions','role_criteria','budget_categories','habit_logs']);
const todayStr = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const DEFAULTS = {
  profiles: () => ({ display_name: 'بلال', theme: 'system', timezone: 'Africa/Cairo', morning_reminder: '08:30:00', morning_enabled: true, evening_reminder: '22:00:00', evening_enabled: false, money_lock_enabled: true, onboarded: false }),
  company: () => ({ name: 'Fix Team' }), company_metrics: () => ({ sort: 0 }), company_log: () => ({ happened_on: todayStr(), kind: 'manual' }),
  ideas: () => ({ stage: 'raw', source: 'manual' }), goals: () => ({ area: 'المبيعات والمحلات', status: 'active', reminder_enabled: false }),
  plan_steps: () => ({ done: false, sort: 0 }), recurring_tasks: () => ({ active: true }), tasks: () => ({ due_on: todayStr(), done: false, source: 'manual' }),
  problems: () => ({ status: 'open', occurrences: 1 }), team_members: () => ({ role: 'فني', active: true }), member_ratings: () => ({ scores: {} }),
  member_notes: () => ({ noted_on: todayStr() }), weekly_reviews: () => ({ next_top3: [] }), courses: () => ({ status: 'active', lessons_done: 0 }),
  org_units: () => ({ sort: 0 }), sops: () => ({ version: 1 }), positions: () => ({ role: 'أخرى', status: 'open' }), candidates: () => ({ stage: 'applied' }),
  projects: () => ({ kind: 'system', is_personal: false }), project_clients: () => ({ status: 'target' }), project_devs: () => ({ stage: 'idea' }),
  project_dev_notes: () => ({ noted_on: todayStr() }), wallets: () => ({ kind: 'cash', balance: 0 }), investment_returns: () => ({ received_on: todayStr() }),
  debt_payments: () => ({ paid_on: todayStr() }), commitments: () => ({ active: true }), budget_categories: () => ({ sort: 0 }),
  expenses: () => ({ spent_on: todayStr(), source: 'manual' }), incomes: () => ({ received_on: todayStr(), expected: false }), financial_goals: () => ({ saved: 0 }),
  day_logs: () => ({ on_date: todayStr(), kind: 'co' }),
  habits: () => ({ active: true, days: [0, 1, 2, 3, 4, 5, 6], sort: 0 }), habit_logs: () => ({ on_date: todayStr() }),
  life_tracks: () => ({ sort: 0 }), life_areas: () => ({ sort: 0 }), departments: () => ({ sort: 0 }),
  waiting_for: () => ({ done: false }), owner_points: () => ({ status: 'open' }), templates: () => ({ items: [] }),
  media: () => ({ kind: 'book', status: 'active', current_page: 0, current_minutes: 0 }), learnings: () => ({ status: 'new' }),
  decisions: () => ({ decided_on: todayStr() }), lessons: () => ({ source: 'other' }), occasions: () => ({ yearly: true, remind_days: 2 }),
};

// ---------------- التخزين على الجهاز (IndexedDB) ----------------
let L = {}, outbox = [], uid = null, writeSeq = 0;
let dbp;
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('nota-bilal', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function kv(mode, key, val) {
  const d = await (dbp ||= idb());
  return new Promise((res, rej) => {
    const tx = d.transaction('kv', mode), st = tx.objectStore('kv');
    const q = mode === 'readonly' ? st.get(key) : val === undefined ? st.delete(key) : st.put(val, key);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
let saveT;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { kv('readwrite', 'tables:' + uid, L).catch(() => {}); kv('readwrite', 'outbox:' + uid, outbox).catch(() => {}); }, 200);
}
export async function openLocal(userId) {
  uid = userId;
  try { localStorage.setItem('nota.uid', userId); } catch (e) {}
  const [t, o] = await Promise.all([kv('readonly', 'tables:' + uid).catch(() => null), kv('readonly', 'outbox:' + uid).catch(() => null)]);
  L = t || {}; outbox = o || [];
  return !!t;
}
export async function clearLocal() {
  if (!uid) return;
  await Promise.all([kv('readwrite', 'tables:' + uid), kv('readwrite', 'outbox:' + uid)]).catch(() => {});
  L = {}; outbox = [];
  try { localStorage.removeItem('nota.uid'); } catch (e) {}
}
export const exportAll = () => JSON.parse(JSON.stringify(Object.fromEntries(TABLES.map(t => [t, (L[t] || []).filter(r => !r._tmp)]))));

// ---------------- محرك الاستعلام على الجهاز ----------------
const T = t => (L[t] ||= []);
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
const A = r => r.archived_at == null;
const num = v => Number(v) || 0;
const sum = (a, k) => a.reduce((s, x) => s + num(x[k]), 0);
const monthStartStr = () => todayStr().slice(0, 7) + '-01';
const localDate = ts => { const d = new Date(ts); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
function nextDue(day) {
  if (!day) return null;
  const t = todayStr(), y = +t.slice(0, 4), m = +t.slice(5, 7);
  const mk = (yy, mm) => `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(day, new Date(yy, mm, 0).getDate())).padStart(2, '0')}`;
  const a = mk(y, m); return a >= t ? a : (m === 12 ? mk(y + 1, 1) : mk(y, m + 1));
}
// رقم الهدف: لو الهدف ليه رقم (من كام لكام)، النسبة بتتحسب منه. مثلًا المرتجعات من 8 لـ 4، ووصلت 6 = 50%
export function goalNumber(g) {
  if (!g || g.metric_start == null || g.metric_target == null || Number(g.metric_start) === Number(g.metric_target)) return null;
  const m = g.metric_id ? T('company_metrics').find(x => x.id === g.metric_id && A(x)) : null;
  if (g.metric_id && !m) return null;
  const cur = m ? m.value : g.kpi_current;
  if (cur == null || cur === '') return null;
  const start = Number(g.metric_start), target = Number(g.metric_target), now = Number(cur);
  const pct = Math.max(0, Math.min(100, Math.round((now - start) / (target - start) * 100)));
  return { pct, start, target, now, label: m ? m.label : g.kpi_label, unit: (m ? m.unit : g.kpi_unit) || '', company: !!m };
}
function view(name) {
  if (name === 'v_goal_progress') return T('goals').map(g => {
    const s = T('plan_steps').filter(x => x.parent_type === 'goal' && x.parent_id === g.id); const d = s.filter(x => x.done).length;
    const num = g.status === 'done' ? null : goalNumber(g);
    return { id: g.id, user_id: g.user_id, progress: g.status === 'done' ? 100 : num ? num.pct : s.length ? Math.round(100 * d / s.length) : 0, steps_total: s.length, steps_done: d, by: num ? 'number' : 'steps' };
  });
  if (name === 'v_debts') return T('debts').filter(A).map(d => { const paid = sum(T('debt_payments').filter(p => p.debt_id === d.id), 'amount'); return { ...d, paid, remaining: num(d.total) - paid }; });
  if (name === 'v_investments') return T('investments').filter(A).map(i => { const r = sum(T('investment_returns').filter(x => x.investment_id === i.id), 'amount'); return { ...i, returns_total: r, roi_pct: num(i.amount) > 0 ? Math.round(1000 * r / num(i.amount)) / 10 : null }; });
  if (name === 'v_month_summary') {
    const ms = monthStartStr();
    const inc = sum(T('incomes').filter(i => A(i) && !i.expected && i.received_on >= ms), 'amount');
    const com = sum(T('commitments').filter(c => A(c) && c.active), 'amount');
    const sp = sum(T('expenses').filter(e => A(e) && e.spent_on >= ms), 'amount');
    return [{ income: inc, commitments: com, spent: sp, left_to_spend: inc - com - sp }];
  }
  if (name === 'v_budget_month') { const ms = monthStartStr(); return T('budget_categories').filter(A).map(b => ({ ...b, spent: sum(T('expenses').filter(e => A(e) && e.category_id === b.id && e.spent_on >= ms), 'amount') })); }
  if (name === 'v_net_worth') {
    const debts = view('v_debts');
    const assets = sum(T('wallets').filter(A), 'balance')
      + T('assets').filter(A).reduce((s, a) => s + (a.kind === 'gold' || a.kind === 'usd' ? num(a.quantity) * num(a.unit_price) : num(a.manual_value)), 0)
      + sum(T('investments').filter(A), 'amount') + sum(debts.filter(d => d.direction === 'owed'), 'remaining');
    return [{ assets, liabilities: sum(debts.filter(d => d.direction === 'owe'), 'remaining') }];
  }
  if (name === 'v_calendar') return [
    ...T('tasks').filter(t => A(t) && !t.done).map(t => ({ kind: 'task', ref_id: t.id, title: t.title, on_date: t.due_on, amount: null })),
    ...T('goals').filter(g => A(g) && g.status === 'active' && g.due_on).map(g => ({ kind: 'goal', ref_id: g.id, title: g.title, on_date: g.due_on, amount: null })),
    ...T('candidates').filter(c => A(c) && c.next_at && ['applied', 'interview', 'trial'].includes(c.stage)).map(c => ({ kind: 'interview', ref_id: c.id, title: c.name, on_date: localDate(c.next_at), amount: null })),
    ...T('commitments').filter(c => A(c) && c.active && c.due_day).map(c => ({ kind: 'commitment', ref_id: c.id, title: c.name, on_date: nextDue(c.due_day), amount: c.amount })),
    ...view('v_debts').filter(d => d.direction === 'owe' && d.remaining > 0 && d.due_day).map(d => ({ kind: 'installment', ref_id: d.id, title: d.person, on_date: nextDue(d.due_day), amount: d.installment_amount })),
  ];
  if (name === 'v_search') {
    const M = Object.fromEntries(T('team_members').map(m => [m.id, m.name]));
    return [
      ...T('tasks').filter(A).map(r => ({ kind: 'task', id: r.id, title: r.title, body: null, meta: r.due_on })),
      ...T('goals').filter(A).map(r => ({ kind: 'goal', id: r.id, title: r.title, body: r.why, meta: r.status })),
      ...T('ideas').filter(A).map(r => ({ kind: 'idea', id: r.id, title: r.title, body: r.body, meta: r.stage })),
      ...T('problems').filter(A).map(r => ({ kind: 'problem', id: r.id, title: r.title, body: `${r.cause || ''} ${r.solution || ''}`, meta: r.status })),
      ...T('team_members').filter(A).map(r => ({ kind: 'member', id: r.id, title: r.name, body: r.strengths, meta: r.role })),
      ...T('member_notes').map(r => ({ kind: 'member_note', id: r.id, title: M[r.member_id], body: r.text, meta: r.noted_on })),
      ...T('projects').filter(A).map(r => ({ kind: 'project', id: r.id, title: r.name, body: r.description, meta: r.kind })),
      ...T('project_devs').filter(A).map(r => ({ kind: 'project_dev', id: r.id, title: r.title, body: r.details, meta: r.stage })),
      ...T('courses').filter(A).map(r => ({ kind: 'course', id: r.id, title: r.title, body: r.learned, meta: r.status })),
      ...T('sops').filter(A).map(r => ({ kind: 'sop', id: r.id, title: r.title, body: r.body, meta: String(r.version) })),
      ...T('company_log').filter(A).map(r => ({ kind: 'log', id: r.id, title: r.text, body: null, meta: r.happened_on })),
      ...T('decisions').filter(A).map(r => ({ kind: 'decision', id: r.id, title: r.title, body: [r.why, r.expected, r.result].filter(Boolean).join(' '), meta: r.decided_on })),
      ...T('lessons').filter(A).map(r => ({ kind: 'lesson', id: r.id, title: r.text, body: null, meta: r.source })),
      ...T('media').filter(A).map(r => ({ kind: 'media', id: r.id, title: r.title, body: r.author, meta: r.kind })),
    ];
  }
  return T(name);
}

export function list(table, o = {}) {
  let rows = view(table);
  const f = [];
  for (const [k, v] of Object.entries(o.eq || {})) f.push(v === null ? r => (r[k] ?? null) === null : r => r[k] === v);
  if (o.neq) f.push(r => r[o.neq[0]] !== o.neq[1]);
  if (o.in) f.push(r => o.in[1].includes(r[o.in[0]]));
  if (o.gte) f.push(r => r[o.gte[0]] != null && String(r[o.gte[0]]) >= String(o.gte[1]));
  if (o.lte) f.push(r => r[o.lte[0]] != null && String(r[o.lte[0]]) <= String(o.lte[1]));
  if (o.lt) f.push(r => r[o.lt[0]] != null && String(r[o.lt[0]]) < String(o.lt[1]));
  if (o.notNull) f.push(r => r[o.notNull] != null);
  if (o.or) {
    const parts = o.or.split(',').map(p => { const [col, , ...rest] = p.split('.'); return { col, val: rest.join('.').replace(/%/g, '').trim().toLowerCase() }; });
    f.push(r => parts.some(p => String(r[p.col] ?? '').toLowerCase().includes(p.val)));
  }
  if (ARCH.has(table)) f.push(o.archived ? r => r.archived_at != null : A);
  rows = rows.filter(r => f.every(fn => fn(r)));
  if (o.order) {
    const k = o.order, asc = o.asc !== false;
    rows = [...rows].sort((a, b) => { const x = a[k], y = b[k]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1); });
  }
  if (o.limit) rows = rows.slice(0, o.limit);
  return Promise.resolve(clone(rows));
}
export const one = (table, id) => Promise.resolve(clone(T(table).find(r => r[KEY[table] || 'id'] === id) || null));
export const single = table => Promise.resolve(clone(T(table)[0] || null));

// ---------------- الكتابة: على الجهاز الأول، وبعدين لـ Supabase ----------------
const newId = () => crypto.randomUUID();
function makeRow(table, obj) {
  const now = new Date().toISOString();
  const r = { ...(KEY[table] ? {} : { id: newId() }), user_id: uid, created_at: now, ...(NO_UPDATED.has(table) ? {} : { updated_at: now }), ...(ARCH.has(table) ? { archived_at: null } : {}), ...(DEFAULTS[table]?.() || {}), ...obj };
  return r;
}
function queue(op) { outbox.push(op); writeSeq++; persist(); emit('status'); kickPush(); }

export function ins(table, obj) {
  const row = makeRow(table, obj);
  T(table).push(row); triggers(table, null, row);
  queue({ op: 'insert', table, data: { ...obj, ...(KEY[table] ? {} : { id: row.id }) } });
  return Promise.resolve(clone(row));
}
export async function insMany(table, arr) { const out = []; for (const o of arr) out.push(await ins(table, o)); return out; }
export function upd(table, id, patch) {
  const k = KEY[table] || 'id';
  const row = T(table).find(r => r[k] === id);
  if (!row) return Promise.reject(new Error('الحاجة دي مش موجودة'));
  const old = clone(row);
  Object.assign(row, patch); if (!NO_UPDATED.has(table)) row.updated_at = new Date().toISOString();
  triggers(table, old, row);
  queue({ op: 'update', table, key: k, id, data: patch });
  return Promise.resolve(clone(row));
}
export async function updWhere(table, eq, patch) {
  const rows = T(table).filter(r => Object.entries(eq).every(([k, v]) => r[k] === v));
  const out = []; for (const r of rows) out.push(await upd(table, r[KEY[table] || 'id'], patch)); return out;
}
export function upsert(table, obj, onConflict) {
  const keys = (onConflict || KEY[table] || 'id').split(',');
  const full = { user_id: uid, ...obj };
  let row = T(table).find(r => keys.every(k => r[k] === full[k]));
  if (row) { const old = clone(row); Object.assign(row, obj); if (!NO_UPDATED.has(table)) row.updated_at = new Date().toISOString(); triggers(table, old, row); }
  else { row = makeRow(table, full); T(table).push(row); triggers(table, null, row); }
  const data = { ...obj }; if (keys.includes('user_id') && KEY[table]) data.user_id = uid;
  queue({ op: 'upsert', table, data, onConflict: onConflict || KEY[table] || null });
  return Promise.resolve([clone(row)]);
}
export function del(table, id) {
  L[table] = T(table).filter(r => r.id !== id);
  queue({ op: 'delete', table, id });
  return Promise.resolve(null);
}
export const archive = (table, id) => upd(table, id, { archived_at: new Date().toISOString() });
export const unarchive = (table, id) => upd(table, id, { archived_at: null });

// نفس اللي Supabase بيعمله لوحده، بيتعمل على الجهاز عشان تشوفه على طول (وبيتبدل بنسخة Supabase بعد المزامنة)
function tmp(table, obj) { const r = makeRow(table, obj); r._tmp = true; T(table).push(r); return r; }
function triggers(table, old, r) {
  if (table === 'tasks' && (!old || old.done !== r.done)) r.done_at = r.done ? new Date().toISOString() : null;
  if (table === 'team_members' && old && old.active !== r.active) r.left_on = r.active ? null : (r.left_on || todayStr());
  if (table === 'project_devs' && old && r.stage === 'applied' && old.stage !== 'applied') r.applied_on = r.applied_on || todayStr();
  if (table === 'goals' && old && r.status === 'done' && old.status !== 'done') {
    r.done_on = r.done_on || todayStr(); let extra = '';
    const m = T('company_metrics').find(x => x.id === r.metric_id);
    if (m && r.metric_target != null) { extra = ` (${m.label}: من ${m.value ?? '—'} إلى ${r.metric_target}${m.unit ? ' ' + m.unit : ''})`; m.value = r.metric_target; }
    tmp('company_log', { happened_on: r.done_on, text: 'اتحقق هدف: ' + r.title + extra + (r.impact ? ' — ' + r.impact : ''), kind: 'goal', source_type: 'goal', source_id: r.id });
  }
  if (table === 'goals' && old && r.status !== 'done' && old.status === 'done') r.done_on = null;
  if (table === 'company_metrics' && old && r.value !== old.value)
    tmp('company_log', { text: `تحديث: ${r.label} من ${old.value ?? '—'} إلى ${r.value ?? '—'}${r.unit ? ' ' + r.unit : ''}`, kind: 'metric', source_type: 'metric', source_id: r.id });
  if (table === 'candidates' && old && r.stage === 'hired' && old.stage !== 'hired' && !r.hired_member_id) {
    const pos = T('positions').find(p => p.id === r.position_id);
    const m = tmp('team_members', { name: r.name, role: pos ? pos.role : 'أخرى', started_on: todayStr() });
    r.hired_member_id = m.id; if (pos) pos.status = 'filled';
    tmp('company_log', { text: 'تعيين: ' + r.name + ' (' + (pos ? pos.role : 'أخرى') + ')', kind: 'hire', source_type: 'member', source_id: m.id });
  }
}

// ---------------- الدوال (بتتعمل على الجهاز كمان) ----------------
function stableId(s) {   // نفس المهمة المتكررة في نفس اليوم = نفس الـ id على أي جهاز
  let h = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h = h.map((x, j) => Math.imul(x ^ (c + j * 31), 16777619 + j * 2) >>> 0); }
  const hex = h.map(x => x.toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export async function rpc(fn, args = {}) {
  if (fn === 'seed_my_defaults') {   // أول مرة بس، ومحتاجة نت
    const { error } = await sb.rpc('seed_my_defaults'); if (error) throw error;
    await pull(true); return null;
  }
  if (fn === 'spawn_recurring') {
    const t = todayStr(), dow = new Date(t + 'T12:00').getDay(), dom = +t.slice(8), last = new Date(+t.slice(0, 4), +t.slice(5, 7), 0).getDate();
    let n = 0;
    for (const r of T('recurring_tasks').filter(r => r.active && A(r))) {
      const due = r.rule === 'daily' || (r.rule === 'weekly' && (r.weekdays || []).includes(dow)) || (r.rule === 'monthly' && Math.min(r.month_day, last) === dom);
      if (!due || T('tasks').some(x => x.recurring_id === r.id && x.due_on === t)) continue;
      await ins('tasks', { id: stableId(r.id + t), title: r.title, due_on: t, reminder_time: r.reminder_time, recurring_id: r.id, source: 'recurring' }); n++;
    }
    return n;
  }
  if (fn === 'convert_idea_to_goal') {
    const i = T('ideas').find(x => x.id === args.p_idea); if (!i) throw new Error('الفكرة مش موجودة');
    if (i.converted_goal_id) return i.converted_goal_id;
    const g = await ins('goals', { title: i.title, area: i.area || 'من غير مجال', track_id: i.track_id || null, area_id: i.area_id || null, why: i.body, idea_id: i.id });
    for (const s of T('plan_steps').filter(s => s.parent_type === 'idea' && s.parent_id === i.id)) await ins('plan_steps', { parent_type: 'goal', parent_id: g.id, text: s.text, sort: s.sort });
    await upd('ideas', i.id, { stage: 'converted', converted_goal_id: g.id });
    await link('goal', g.id, 'idea', i.id);
    return g.id;
  }
  if (fn === 'record_client_payment') {
    const c = T('project_clients').find(x => x.id === args.p_client); if (!c) throw new Error('العميل مش موجود');
    const p = T('projects').find(x => x.id === c.project_id);
    const r = await ins('incomes', { received_on: args.p_on || todayStr(), amount: args.p_amount, source: `${c.name} · ${p ? p.name : ''}`, project_client_id: c.id });
    return r.id;
  }
  if (fn === 'snapshot_net_worth') {
    const v = view('v_net_worth')[0];
    await upsert('net_worth_snapshots', { month: monthStartStr(), assets: v.assets, liabilities: v.liabilities }, 'user_id,month');
    return null;
  }
  throw new Error('دالة مش معروفة: ' + fn);
}

// ---------------- المزامنة ----------------
const listeners = new Set();
export const onSync = fn => listeners.add(fn);
function emit(type) { listeners.forEach(fn => { try { fn(type); } catch (e) {} }); }
let pushing = false, pulling = false, pushT, pullT, lastSync = 0, lastError = null;
export const syncStatus = () => ({ online: navigator.onLine, pending: outbox.length, syncing: pushing || pulling, lastSync, error: lastError });
const isNet = e => !navigator.onLine || /fetch|network|load failed|timed? ?out|abort/i.test(String(e?.message || e || '')) || /^PGRST3/.test(e?.code || '') || e?.status >= 500;
function kickPush(delay = 250) { clearTimeout(pushT); pushT = setTimeout(push, delay); }
function kickPull(delay = 800) { clearTimeout(pullT); pullT = setTimeout(() => pull(), delay); }

async function sendOp(op) {
  const t = op.table ? sb.from(op.table) : null;
  let q;
  if (op.op === 'insert') q = t.insert(op.data);
  else if (op.op === 'update') q = t.update(op.data).eq(op.key || 'id', op.id);
  else if (op.op === 'upsert') q = t.upsert(op.data, op.onConflict ? { onConflict: op.onConflict } : undefined);
  else if (op.op === 'delete') q = t.delete().eq('id', op.id);
  const { error } = await q;
  if (!error) return 'ok';
  if (isNet(error)) return 'net';
  if (error.code === '23505') return 'ok';       // موجودة قبل كده (من جهاز تاني مثلًا)
  console.warn('اتشال تعديل اترفض من Supabase', op, error);
  lastError = error.message;
  return 'drop';
}
async function push() {
  if (!sb || pushing || !outbox.length || !uid) return;
  pushing = true; emit('status');
  try {
    while (outbox.length) {
      const r = await sendOp(outbox[0]).catch(e => (isNet(e) ? 'net' : 'drop'));
      if (r === 'net') break;
      outbox.shift(); persist();
    }
  } finally { pushing = false; emit('status'); }
  if (!outbox.length) kickPull(600);
}
export async function pull(force = false) {
  if (!sb || !uid || pulling || (outbox.length && !force)) return false;
  pulling = true; emit('status');
  const seq = writeSeq;
  try {
    const entries = await Promise.all(TABLES.map(async t => {
      let rows = [], from = 0;
      for (;;) {
        const { data, error } = await sb.from(t).select('*').range(from, from + 999);
        // جدول لسه متعملش في Supabase (نسيت ملف SQL)؟ منوقفش المزامنة كلها عشانه
        if (error && /PGRST205|42P01|does not exist|Could not find the table/i.test(`${error.code} ${error.message}`)) return [t, (L[t] || []).filter(r => !r._tmp)];
        if (error) throw error;
        rows = rows.concat(data); if (data.length < 1000) break; from += 1000;
      }
      return [t, rows];
    }));
    if (seq !== writeSeq || outbox.length) return false;   // اتعملت تعديلات وقت التحميل، هنحمّل تاني بعدين
    const next = Object.fromEntries(entries);
    const changed = TABLES.some(t => JSON.stringify(next[t]) !== JSON.stringify((L[t] || []).filter(r => !r._tmp)) || (L[t] || []).some(r => r._tmp));
    L = next; persist(); lastSync = Date.now(); lastError = null;
    if (changed) emit('data');
    return true;
  } catch (e) { if (!isNet(e)) lastError = e.message; return false; }
  finally { pulling = false; emit('status'); }
}
export async function syncNow() { await push(); return pull(); }
export function startSync() {
  window.addEventListener('online', () => { emit('status'); syncNow(); });
  window.addEventListener('offline', () => emit('status'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
  setInterval(() => { if (!document.hidden) syncNow(); }, 60000);
  syncNow();
}

// ---------------- الدخول ----------------
export const auth = {
  session: async () => {
    const s = sb ? (await sb.auth.getSession()).data.session : null;
    if (s) return s;
    let id = null; try { id = localStorage.getItem('nota.uid'); } catch (e) {}
    return id && !navigator.onLine ? { user: { id }, offline: true } : null;   // من غير نت: بنكمل بالنسخة اللي على الجهاز
  },
  signIn: async (email, password) => { const { data, error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; return data; },
  signOut: async () => { await clearLocal(); return sb.auth.signOut(); },
  onChange: fn => sb.auth.onAuthStateChange((_e, s) => fn(s)),
};

// ---------------- الربط بين أي حاجتين ----------------
export const LINK_TABLE = { task: ['tasks','title'], goal: ['goals','title'], idea: ['ideas','title'], problem: ['problems','title'],
  member: ['team_members','name'], project: ['projects','name'], project_dev: ['project_devs','title'], course: ['courses','title'],
  sop: ['sops','title'], position: ['positions','title'], candidate: ['candidates','name'], metric: ['company_metrics','label'], habit: ['habits','title'], area: ['life_areas','name'], decision: ['decisions','title'], lesson: ['lessons','text'], media: ['media','title'] };

export async function linksOf(type, id) {
  const [a, b] = await Promise.all([list('links', { eq: { from_type: type, from_id: id } }), list('links', { eq: { to_type: type, to_id: id } })]);
  const items = [...a.map(l => ({ link: l.id, type: l.to_type, id: l.to_id })), ...b.map(l => ({ link: l.id, type: l.from_type, id: l.from_id }))];
  const out = [];
  for (const i of items) {
    const [table, col] = LINK_TABLE[i.type] || [];
    const row = table && T(table).find(r => r.id === i.id && A(r));
    if (row) out.push({ ...i, title: row[col], row: clone(row) });
  }
  return out;
}
export async function link(fromType, fromId, toType, toId) {
  if (fromType === toType && fromId === toId) return;
  if (T('links').some(l => l.from_type === fromType && l.from_id === fromId && l.to_type === toType && l.to_id === toId)) return;
  await ins('links', { from_type: fromType, from_id: fromId, to_type: toType, to_id: toId });
}
