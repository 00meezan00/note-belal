// طبقة البيانات: كل الكلام مع Supabase بيعدي من هنا
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR-ANON');
export const sb = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null;

// الجداول اللي فيها أرشيف بدل المسح
const ARCH = new Set(['company_metrics','company_log','ideas','goals','recurring_tasks','tasks','problems','team_members','courses','sops','positions','candidates','projects','project_clients','project_devs','wallets','assets','investments','debts','commitments','budget_categories','expenses','incomes','financial_goals']);

async function run(p) {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

// list('goals', { eq:{status:'active'}, order:'due_on', in:['id',[...]], gte:['due_on','2026-11-01'], or:'title.ilike.%x%' })
export function list(table, o = {}) {
  let q = sb.from(table).select(o.select || '*');
  for (const [k, v] of Object.entries(o.eq || {})) q = v === null ? q.is(k, null) : q.eq(k, v);
  if (o.neq) q = q.neq(o.neq[0], o.neq[1]);
  if (o.in) q = q.in(o.in[0], o.in[1]);
  if (o.gte) q = q.gte(o.gte[0], o.gte[1]);
  if (o.lte) q = q.lte(o.lte[0], o.lte[1]);
  if (o.lt) q = q.lt(o.lt[0], o.lt[1]);
  if (o.notNull) q = q.not(o.notNull, 'is', null);
  if (o.or) q = q.or(o.or);
  if (ARCH.has(table)) q = o.archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null);
  if (o.order) q = q.order(o.order, { ascending: o.asc !== false, nullsFirst: false });
  if (o.limit) q = q.limit(o.limit);
  return run(q);
}
export const one = (table, id) => run(sb.from(table).select('*').eq('id', id).maybeSingle());
export const single = table => run(sb.from(table).select('*').maybeSingle());
export const ins = (table, obj) => run(sb.from(table).insert(obj).select().single());
export const insMany = (table, arr) => run(sb.from(table).insert(arr).select());
export const upd = (table, id, obj) => run(sb.from(table).update(obj).eq('id', id).select().single());
export const updWhere = (table, eq, obj) => { let q = sb.from(table).update(obj); for (const [k, v] of Object.entries(eq)) q = q.eq(k, v); return run(q.select()); };
export const upsert = (table, obj, onConflict) => run(sb.from(table).upsert(obj, onConflict ? { onConflict } : undefined).select());
export const del = (table, id) => run(sb.from(table).delete().eq('id', id));
export const rpc = (fn, args = {}) => run(sb.rpc(fn, args));
export const archive = (table, id) => upd(table, id, { archived_at: new Date().toISOString() });
export const unarchive = (table, id) => upd(table, id, { archived_at: null });

// ---------- الدخول بالإيميل والباسورد ----------
export const auth = {
  session: async () => (await sb.auth.getSession()).data.session,
  signIn: (email, password) => run(sb.auth.signInWithPassword({ email, password })),
  signOut: () => sb.auth.signOut(),
  onChange: fn => sb.auth.onAuthStateChange((_e, s) => fn(s)),
};

// ---------- الربط بين أي حاجتين ----------
export const LINK_TABLE = { task: ['tasks','title'], goal: ['goals','title'], idea: ['ideas','title'], problem: ['problems','title'],
  member: ['team_members','name'], project: ['projects','name'], project_dev: ['project_devs','title'], course: ['courses','title'],
  sop: ['sops','title'], position: ['positions','title'], candidate: ['candidates','name'], metric: ['company_metrics','label'] };

export async function linksOf(type, id) {
  const [a, b] = await Promise.all([
    list('links', { eq: { from_type: type, from_id: id } }),
    list('links', { eq: { to_type: type, to_id: id } }),
  ]);
  const items = [...a.map(l => ({ link: l.id, type: l.to_type, id: l.to_id })), ...b.map(l => ({ link: l.id, type: l.from_type, id: l.from_id }))];
  const byType = {};
  items.forEach(i => (byType[i.type] ||= []).push(i.id));
  const titles = {}, extra = {};
  await Promise.all(Object.entries(byType).map(async ([t, ids]) => {
    const [table, col] = LINK_TABLE[t] || [];
    if (!table) return;
    const rows = await list(table, { in: ['id', ids], archived: undefined }).catch(() => []);
    rows.forEach(r => { titles[r.id] = r[col]; extra[r.id] = r; });
  }));
  return items.filter(i => titles[i.id] !== undefined).map(i => ({ ...i, title: titles[i.id], row: extra[i.id] }));
}
export async function link(fromType, fromId, toType, toId) {
  if (fromType === toType && fromId === toId) return;
  try { await ins('links', { from_type: fromType, from_id: fromId, to_type: toType, to_id: toId }); }
  catch (e) { if (!String(e.message || e.code).includes('duplicate') && e.code !== '23505') throw e; }
}
