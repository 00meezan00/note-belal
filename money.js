// فلوسي: مقفولة بـ Face ID، ومش بتظهر في التقرير ولا البحث
import { list, one, ins, upd, del, rpc, single, auth } from './db.js';
import { esc, ic, bat, fd, fMonth, today, addDays, monthStart, n, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, opts, sw } from './ui.js';
import { archiveWithUndo, doRefresh } from './comps.js';

// ---------------- القفل ----------------
const CRED = 'nota.cred';
let unlockedAt = 0, lockPref = null;
const unlocked = () => unlockedAt && Date.now() - unlockedAt < 15 * 60 * 1000;
document.addEventListener('visibilitychange', () => { if (document.hidden) unlockedAt = 0; });
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const bioSupported = () => !!(window.PublicKeyCredential && navigator.credentials);

async function bioUnlock(fresh = false) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  let id = fresh ? null : localStorage.getItem(CRED);
  if (!id) {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge, rp: { name: 'نوتة بلال' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'bilal', displayName: 'بلال' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000 } });
    localStorage.setItem(CRED, b64(cred.rawId));
    return true;
  }
  await navigator.credentials.get({ publicKey: { challenge, allowCredentials: [{ type: 'public-key', id: unb64(id) }], userVerification: 'required', timeout: 60000 } });
  return true;
}

function lockScreen() {
  const has = !!localStorage.getItem(CRED);
  return { title: 'فلوسي', back: '#/today', noSearch: true, html: `<div class="stack" style="align-items:center;text-align:center;padding-top:8vh;gap:18px">
    <div class="mut" style="font-size:15px">القسم ده مقفول، محدش يشوفه غيرك</div>
    ${bioSupported() ? `<button class="rb" data-act="unlock-bio" aria-label="افتح بـ Face ID" style="width:128px;height:128px;border-radius:64px;border:2px solid var(--ink);box-shadow:0 4px 0 var(--ink)"><svg class="ic" width="60" height="60" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9v1M15 9v1M12 9v4h-1M9 16c1.7 1.3 4.3 1.3 6 0"/></svg></button>
    <div style="font-weight:600">${has ? 'افتح بـ Face ID' : 'دوس عشان تفعّل Face ID لفلوسي'}</div>` : ''}
    <button class="btn ghost" data-act="unlock-pass">افتح بالباسورد بدلها</button>
  </div>` };
}
function guard(render) {
  return async p => {
    const pr = await single('profiles'); lockPref = pr?.money_lock_enabled !== false;
    if (lockPref && !unlocked()) return lockScreen();
    return render(p);
  };
}
const lockActions = {
  async 'unlock-bio'() {
    try { await bioUnlock(); unlockedAt = Date.now(); doRefresh(); }
    catch (e) {
      if (e.name === 'NotAllowedError') return toast('ما اتفتحش. جرب تاني أو افتح بالباسورد');
      try { await bioUnlock(true); unlockedAt = Date.now(); doRefresh(); } catch (e2) { toast('Face ID مش متاح هنا. افتح بالباسورد'); }
    }
  },
  'unlock-pass'() {
    openSheet('افتح بالباسورد', `<input class="inp" type="password" name="password" autocomplete="current-password" placeholder="باسورد التطبيق" autofocus><button class="btn pri" data-act="unlock-pass-go">افتح</button>`);
  },
  async 'unlock-pass-go'() {
    const pw = formOf(sheetEl()).password; if (!pw) return;
    try { const s = await auth.session(); await auth.signIn(s.user.email, pw); unlockedAt = Date.now(); closeSheet(); doRefresh(); } catch (e) { toast('الباسورد مش صح'); }
  },
};

// ---------------- إخفاء الأرقام ----------------
const hidden = () => { try { return localStorage.getItem('nota.hide') === '1'; } catch (e) { return false; } };
const m = v => hidden() ? '•••' : n(Math.round(Number(v) || 0));
const eye = () => `<button class="rb" data-act="hide-toggle" aria-label="${hidden() ? 'اظهر الأرقام' : 'اخفي الأرقام'}" style="${hidden() ? 'background:var(--ink);color:var(--paper)' : ''}"><svg class="ic" width="21" height="21" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>${hidden() ? '<path d="M3 3l18 18"/>' : ''}</svg></button>`;

// ---------------- أدوات ----------------
const assetValue = a => (a.kind === 'gold' || a.kind === 'usd') ? (Number(a.quantity) || 0) * (Number(a.unit_price) || 0) : Number(a.manual_value) || 0;
const ASSET = { gold: 'دهب', usd: 'دولار', property: 'ممتلكات', other: 'حاجة تانية' };
const WALLET = { cash: 'كاش', bank: 'بنك', ewallet: 'محفظة موبايل' };
function nextDue(day) {
  if (!day) return null;
  const t = today(), y = +t.slice(0, 4), mo = +t.slice(5, 7);
  const mk = (yy, mm) => { const last = new Date(yy, mm, 0).getDate(); return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`; };
  const a = mk(y, mo); if (a >= t) return a;
  return mo === 12 ? mk(y + 1, 1) : mk(y, mo + 1);
}
const row = (label, sub, amount, attrs = '', color = '') => `<div class="row" style="padding:10px 0;${attrs ? 'cursor:pointer' : ''}" ${attrs}><div style="flex:1;line-height:1.4"><div style="font-weight:500">${label}</div>${sub ? `<div class="mut">${sub}</div>` : ''}</div><span class="num" style="font-size:15px${color ? ';color:' + color : ''}">${m(amount)}</span></div>`;
const tile = (href, label, amount, sub = '', dark = false) => `<a href="${href}" class="card" style="padding:12px;${dark ? 'background:var(--dock);border-color:var(--dock);color:#fff' : ''}"><div style="font-size:13px;color:${dark ? '#C9D2D9' : 'var(--mut)'}">${label}</div><div class="num" style="font-size:20px;line-height:1.3">${m(amount)}</div><div style="font-size:12px;color:${dark ? '#C9D2D9' : 'var(--mut)'}">${sub}</div></a>`;
const seg3 = on => `<div class="seg">${[['out', 'المصاريف'], ['in', 'الدخل'], ['fixed', 'الالتزامات']].map(([k, l]) => `<button class="${on === k ? 'on' : ''}" data-act="flow-tab" data-v="${k}">${l}</button>`).join('')}</div>`;
const st = { flow: 'out', debt: 'owe' };
let snapDone = false;

// ---------------- الشيتات ----------------
function expenseSheet(cats, e = {}) {
  openSheet(e.id ? 'مصروف' : 'مصروف جديد', `<div class="grid2"><label class="field"><span>المبلغ</span><input name="amount" inputmode="decimal" value="${e.amount ?? ''}" autofocus></label>
    <label class="field"><span>البند</span><select name="category_id"><option value="">من غير</option>${opts(cats.map(c => [c.id, c.name]), e.category_id)}</select></label></div>
    <label class="field"><span>على إيه؟</span><input name="note" value="${esc(e.note)}" placeholder="بنزين، غدا…"></label>
    <label class="field"><span>اليوم</span><input type="date" name="spent_on" value="${e.spent_on || today()}"></label>
    <div class="btns">${e.id ? `<button class="btn" data-act="exp-archive" data-id="${e.id}">${ic('archive', 18)}شيله</button>` : ''}<button class="btn pri" data-act="exp-save" data-id="${e.id || ''}">حفظ</button></div>`);
}
function incomeSheet(i = {}) {
  openSheet(i.id ? 'دخل' : 'دخل جديد', `<div class="grid2"><label class="field"><span>المبلغ</span><input name="amount" inputmode="decimal" value="${i.amount ?? ''}" autofocus></label>
    <label class="field"><span>اليوم</span><input type="date" name="received_on" value="${i.received_on || today()}"></label></div>
    <label class="field"><span>منين؟</span><input name="source" value="${esc(i.source)}" placeholder="المرتب، شغل جانبي…"></label>
    <label class="row card" style="padding:12px 14px"><input type="checkbox" name="expected" ${i.expected ? 'checked' : ''} style="width:22px;height:22px"><span style="flex:1">لسه مستنيه (مدخلش لسه)</span></label>
    <div class="btns">${i.id ? `<button class="btn" data-act="inc-archive" data-id="${i.id}">${ic('archive', 18)}شيله</button>` : ''}<button class="btn pri" data-act="inc-save" data-id="${i.id || ''}">حفظ</button></div>`);
}
function commitSheet(c = {}) {
  openSheet(c.id ? 'التزام' : 'التزام شهري جديد', `<label class="field"><span>الاسم</span><input name="name" value="${esc(c.name)}" autofocus placeholder="إيجار، قسط، نت…"></label>
    <div class="grid2"><label class="field"><span>المبلغ في الشهر</span><input name="amount" inputmode="decimal" value="${c.amount ?? ''}"></label>
    <label class="field"><span>يوم الدفع في الشهر</span><input name="due_day" inputmode="numeric" value="${c.due_day ?? ''}" placeholder="1 – 31"></label></div>
    <div class="btns">${c.id ? `<button class="btn" data-act="com-archive" data-id="${c.id}">${ic('archive', 18)}شيله</button>` : ''}<button class="btn pri" data-act="com-save" data-id="${c.id || ''}">حفظ</button></div>`);
}
function catSheet(c = {}) {
  openSheet(c.id ? 'البند' : 'بند جديد', `<label class="field"><span>اسم البند</span><input name="name" value="${esc(c.name)}" autofocus></label>
    <label class="field"><span>الميزانية في الشهر (اختياري)</span><input name="monthly_budget" inputmode="decimal" value="${c.monthly_budget ?? ''}"></label>
    <div class="btns">${c.id ? `<button class="btn" data-act="cat-archive" data-id="${c.id}">${ic('archive', 18)}شيله</button>` : ''}<button class="btn pri" data-act="cat-save" data-id="${c.id || ''}">حفظ</button></div>`);
}
function goalSheet(g = {}) {
  openSheet(g.id ? 'هدف مالي' : 'هدف مالي جديد', `<label class="field"><span>الهدف</span><input name="title" value="${esc(g.title)}" autofocus placeholder="فلوس طوارئ تكفي 3 شهور"></label>
    <div class="grid2"><label class="field"><span>المبلغ المطلوب</span><input name="target" inputmode="decimal" value="${g.target ?? ''}"></label>
    <label class="field"><span>اللي اتجمع</span><input name="saved" inputmode="decimal" value="${g.saved ?? 0}"></label></div>
    ${g.id ? `<form class="row" data-act-submit="fgoal-add" data-id="${g.id}"><input class="inp" name="add" inputmode="decimal" placeholder="زوّد مبلغ"><button class="btn sm amb">زوّد</button></form>` : ''}
    <div class="btns">${g.id ? `<button class="btn" data-act="fgoal-archive" data-id="${g.id}">${ic('archive', 18)}شيله</button>` : ''}<button class="btn pri" data-act="fgoal-save" data-id="${g.id || ''}">حفظ</button></div>`);
}
function walletSheet(w = {}) {
  openSheet(w.id ? 'الفلوس اللي هنا' : 'مكان فلوس جديد', `<label class="field"><span>الاسم</span><input name="name" value="${esc(w.name)}" autofocus placeholder="كاش، بنك مصر، فودافون كاش…"></label>
    <div class="grid2"><label class="field"><span>النوع</span><select name="kind">${opts(Object.entries(WALLET), w.kind || 'cash')}</select></label>
    <label class="field"><span>الرصيد</span><input name="balance" inputmode="decimal" value="${w.balance ?? ''}"></label></div>
    <div class="btns">${w.id ? `<button class="btn" data-act="wal-archive" data-id="${w.id}">${ic('archive', 18)}شيله</button>` : ''}<button class="btn pri" data-act="wal-save" data-id="${w.id || ''}">حفظ</button></div>`);
}
function assetSheet(kind, a = {}) {
  const k = a.kind || kind;
  const qty = k === 'gold' ? ['الجرامات', 'سعر الجرام النهاردة'] : ['عدد الدولارات', 'سعر الدولار بالجنيه'];
  openSheet(a.id ? esc(a.name) : 'أضف ' + ASSET[k], `<label class="field"><span>الاسم</span><input name="name" value="${esc(a.name || (k === 'gold' ? 'دهب' : k === 'usd' ? 'دولار' : ''))}" ${k === 'property' || k === 'other' ? 'autofocus' : ''} placeholder="موتوسيكل، لابتوب…"></label>
    ${k === 'gold' || k === 'usd' ? `<div class="grid2"><label class="field"><span>${qty[0]}</span><input name="quantity" inputmode="decimal" value="${a.quantity ?? ''}"></label><label class="field"><span>${qty[1]}</span><input name="unit_price" inputmode="decimal" value="${a.unit_price ?? ''}"></label></div>
      ${a.price_updated_on ? `<p class="mut" style="margin:0">آخر سعر كتبته: ${fd(a.price_updated_on)}</p>` : ''}`
    : `<label class="field"><span>قيمته التقريبية</span><input name="manual_value" inputmode="decimal" value="${a.manual_value ?? ''}"></label>`}
    <div class="btns">${a.id ? `<button class="btn" data-act="asset-archive" data-id="${a.id}">${ic('archive', 18)}شيله</button>` : ''}<button class="btn pri" data-act="asset-save" data-id="${a.id || ''}" data-kind="${k}">حفظ</button></div>`);
}
async function debtSheet(d) {
  const pays = d.id ? await list('debt_payments', { eq: { debt_id: d.id }, order: 'paid_on', asc: false }) : [];
  const dir = d.direction || st.debt;
  openSheet(d.id ? esc(d.person) : dir === 'owe' ? 'دين عليا' : 'فلوس ليا عند حد', `
    ${d.id ? `<div class="card stack" style="gap:8px">${bat(d.total ? (Number(d.paid) / Number(d.total)) * 100 : 0, 'done')}<div class="between mut"><span>اتدفع ${m(d.paid)} من ${m(d.total)}</span><span>باقي <b class="num" style="color:var(--ink)">${m(d.remaining)}</b></span></div></div>
      <form class="row" data-act-submit="pay-add" data-id="${d.id}"><input class="inp" name="amount" inputmode="decimal" placeholder="${dir === 'owe' ? 'دفعت كام؟' : 'استلمت كام؟'}" value="${d.installment_amount ?? ''}"><button class="btn amb">${dir === 'owe' ? 'سجّل دفعة' : 'سجّل استلام'}</button></form>
      ${pays.length ? `<div class="list">${pays.map(p => `<div class="row" style="padding:8px 0"><span style="flex:1" class="mut">${fd(p.paid_on)}</span><span class="num">${m(p.amount)}</span><button class="star" data-act="pay-del" data-id="${p.id}" aria-label="امسح الدفعة">${ic('x', 16)}</button></div>`).join('')}</div>` : ''}` : ''}
    <label class="field"><span>${dir === 'owe' ? 'لمين؟' : 'عند مين؟'}</span><input name="person" value="${esc(d.person)}" ${d.id ? '' : 'autofocus'}></label>
    <div class="grid2"><label class="field"><span>المبلغ كله</span><input name="total" inputmode="decimal" value="${d.total ?? ''}"></label>
    <label class="field"><span>القسط (لو فيه)</span><input name="installment_amount" inputmode="decimal" value="${d.installment_amount ?? ''}"></label></div>
    <label class="field"><span>يوم القسط في الشهر (اختياري)</span><input name="due_day" inputmode="numeric" value="${d.due_day ?? ''}"></label>
    <label class="field"><span>ملاحظات</span><input name="notes" value="${esc(d.notes)}"></label>
    <div class="btns">${d.id ? `<button class="btn" data-act="debt-archive" data-id="${d.id}">${ic('archive', 18)}شيله</button>` : ''}<button class="btn pri" data-act="debt-save" data-id="${d.id || ''}" data-dir="${dir}">حفظ</button></div>`);
}
async function invSheet(i = {}) {
  const rets = i.id ? await list('investment_returns', { eq: { investment_id: i.id }, order: 'received_on', asc: false }) : [];
  openSheet(i.id ? esc(i.name) : 'استثمار جديد', `
    ${i.id ? `<form class="row" data-act-submit="ret-add" data-id="${i.id}"><input class="inp" name="amount" inputmode="decimal" placeholder="أرباح استلمتها" value="${i.expected_monthly ?? ''}"><button class="btn amb">سجّل أرباح</button></form>
      ${rets.length ? `<div class="list">${rets.map(r => `<div class="row" style="padding:8px 0"><span style="flex:1" class="mut">${fd(r.received_on)}${r.note ? ' · ' + esc(r.note) : ''}</span><span class="num">${m(r.amount)}</span><button class="star" data-act="ret-del" data-id="${r.id}" aria-label="امسح">${ic('x', 16)}</button></div>`).join('')}</div>` : ''}` : ''}
    <label class="field"><span>الاستثمار</span><input name="name" value="${esc(i.name)}" ${i.id ? '' : 'autofocus'} placeholder="شراكة في محل، شهادة بنك…"></label>
    <div class="grid2"><label class="field"><span>المبلغ اللي حطيته</span><input name="amount" inputmode="decimal" value="${i.amount ?? ''}"></label>
    <label class="field"><span>من إمتى</span><input type="date" name="started_on" value="${i.started_on || ''}"></label></div>
    <label class="field"><span>الربح المتوقع في الشهر</span><input name="expected_monthly" inputmode="decimal" value="${i.expected_monthly ?? ''}"></label>
    <div class="btns">${i.id ? `<button class="btn" data-act="inv-archive" data-id="${i.id}">${ic('archive', 18)}شيله</button>` : ''}<button class="btn pri" data-act="inv-save" data-id="${i.id || ''}">حفظ</button></div>`);
}
const num = v => v === '' || v == null ? null : Number(v);

// ---------------- الشاشات ----------------
export default {
  money: {
    render: guard(async () => {
      if (!snapDone) { snapDone = true; rpc('snapshot_net_worth').catch(() => {}); }
      const t = today();
      const [sumRows, wallets, invs, debts, assets, nw, goals, cal] = await Promise.all([
        list('v_month_summary'), list('wallets'), list('v_investments'), list('v_debts'), list('assets'), list('v_net_worth'), list('financial_goals', { order: 'created_at' }),
        list('v_calendar', { in: ['kind', ['commitment', 'installment']], lte: ['on_date', addDays(t, 10)], order: 'on_date' })]);
      const S = sumRows[0] || { income: 0, commitments: 0, spent: 0, left_to_spend: 0 };
      const N = nw[0] || { assets: 0, liabilities: 0 };
      const inc = Number(S.income) || 0, com = Number(S.commitments) || 0, sp = Number(S.spent) || 0, left = Number(S.left_to_spend) || 0;
      const base = Math.max(inc, com + sp, 1);
      const owe = debts.filter(d => d.direction === 'owe'), owed = debts.filter(d => d.direction === 'owed');
      const sum = (a, k) => a.reduce((s, x) => s + (Number(x[k]) || 0), 0);
      return {
        title: 'فلوسي', sub: fMonth(t), back: '#/today', right: eye(), noSearch: true,
        html: `<div class="stack">
          <div class="card stack" style="background:var(--dock);border-color:var(--dock);color:#fff;gap:10px;padding:18px 16px">
            <div style="font-size:14px;color:#C9D2D9">باقي للصرف لآخر الشهر</div>
            <div class="row" style="align-items:baseline;gap:8px"><span class="num" style="font-size:44px;line-height:1${left < 0 ? ';color:#FF8A95' : ''}">${m(left)}</span><span style="color:#C9D2D9">جنيه</span></div>
            <div style="display:flex;height:12px;border-radius:6px;overflow:hidden;gap:2px;background:#26313A" role="img" aria-label="الدخل والالتزامات والمصاريف">
              <span style="width:${com / base * 100}%;background:#7D8B96"></span><span style="width:${sp / base * 100}%;background:var(--amb)"></span><span style="width:${Math.max(left, 0) / base * 100}%;background:#4CC38A"></span></div>
            <div class="row" style="flex-wrap:wrap;gap:4px 14px;font-size:13px;color:#C9D2D9"><span>الدخل <b class="num" style="color:#fff">${m(inc)}</b></span><span>التزامات <b class="num" style="color:#fff">${m(com)}</b></span><span>صرفت <b class="num" style="color:#fff">${m(sp)}</b></span></div>
          </div>
          <div class="btns"><a class="btn pri" href="#/flow">مصاريف ودخل الشهر</a></div>
          ${cal.length ? `<div class="card" style="padding:10px 14px"><b style="font-weight:600">مواعيد دفع قريبة</b><div class="list">${cal.map(c => row(esc(c.title), (c.kind === 'installment' ? 'قسط · ' : '') + (c.on_date === t ? 'النهاردة' : fd(c.on_date)), c.amount)).join('')}</div></div>` : ''}
          <div class="grid2">
            ${tile('#/networth', 'صافي الثروة', Number(N.assets) - Number(N.liabilities), 'كل اللي ليك ناقص اللي عليك', true)}
            ${tile('#/networth', 'معايا كاش وبنك', sum(wallets, 'balance'), `${wallets.length} أماكن`)}
            ${tile('#/investments', 'استثمارات', sum(invs, 'amount'), `جالي ${m(sum(invs, 'returns_total'))} أرباح`)}
            ${tile('#/debts', 'ديون عليا', sum(owe, 'remaining'), owe.length ? `من ${m(sum(owe, 'total'))}` : 'مفيش')}
            ${tile('#/debts?tab=owed', 'ليا عند الناس', sum(owed, 'remaining'), owed.length ? `${owed.length} ${owed.length === 1 ? 'شخص' : 'أشخاص'}` : 'مفيش')}
            ${tile('#/networth', 'أصول وممتلكات', assets.reduce((s, a) => s + assetValue(a), 0), 'دهب ودولار وحاجات')}
          </div>
          <div class="card" style="padding:12px 14px"><div class="between"><b style="font-weight:600">أهداف مالية</b><button class="btn sm" data-act="fgoal-new">${ic('plus', 16)}هدف</button></div>
            ${goals.length ? goals.map(g => `<button class="lnk" data-act="fgoal-open" data-id="${g.id}" style="flex-direction:column;align-items:stretch;gap:6px"><span style="font-weight:500">${esc(g.title)}</span>${bat(g.target ? g.saved / g.target * 100 : 0, Number(g.saved) >= Number(g.target) ? 'done' : 'run')}<span class="mut">${m(g.saved)} من ${m(g.target)}</span></button>`).join('') : '<div class="mut" style="padding:8px 0">زي "فلوس طوارئ تكفي 3 شهور".</div>'}</div>
        </div>`,
      };
    }),
    actions: { 'fgoal-new': () => goalSheet(), async 'fgoal-open'(el) { goalSheet(await one('financial_goals', el.dataset.id)); } },
  },

  flow: {
    render: guard(async () => {
      const ms = monthStart(); const tab = st.flow;
      let body = '';
      if (tab === 'out') {
        const [bud, exps, cats] = await Promise.all([list('v_budget_month', { order: 'sort' }), list('expenses', { gte: ['spent_on', ms], order: 'spent_on', asc: false }), list('budget_categories', { order: 'sort' })]);
        const C = Object.fromEntries(cats.map(c => [c.id, c.name]));
        const total = exps.reduce((s, e) => s + Number(e.amount), 0);
        body = `<div class="card" style="padding:10px 14px"><div class="between"><b style="font-weight:600">الميزانية لكل بند</b><span class="mut">صرفت <b class="num" style="color:var(--ink)">${m(total)}</b></span></div>
          ${bud.map(b => { const p = b.monthly_budget ? Number(b.spent) / Number(b.monthly_budget) * 100 : 0; const over = b.monthly_budget && Number(b.spent) > Number(b.monthly_budget);
            return `<button class="lnk" data-act="cat-open" data-id="${b.id}" style="flex-direction:column;align-items:stretch;gap:6px;border-bottom:1px dashed var(--line)"><span class="between"><span style="font-weight:500">${esc(b.name)}</span><span class="mut"><b class="num" style="color:var(--ink)">${m(b.spent)}</b>${b.monthly_budget ? ` من <span class="num">${m(b.monthly_budget)}</span>` : ''}${over ? '<b class="late"> · عدّيت الميزانية</b>' : ''}</span></span>${b.monthly_budget ? bat(p, p >= 90 ? 'late' : 'run', { pct: false }) : '<span class="mut" style="font-size:12px">من غير ميزانية، دوس عشان تحدد</span>'}</button>`; }).join('')}
          <button class="btn dash sm" style="margin-top:8px" data-act="cat-new">+ بند جديد</button></div>
          <div class="card" style="padding:10px 14px"><b style="font-weight:600">صرفت إيه الشهر ده</b><div class="list">${exps.map(e => row(esc(e.note || C[e.category_id] || 'مصروف'), `${C[e.category_id] || 'من غير بند'} · ${fd(e.spent_on)}${e.source === 'voice' ? ' · بصوتك' : ''}`, e.amount, `data-act="exp-open" data-id="${e.id}" role="button" tabindex="0"`)).join('') || '<div class="mut" style="padding:8px 0">سجّل مصاريفك من المايك: قول "صرفت 150 بنزين".</div>'}</div></div>`;
      } else if (tab === 'in') {
        const incs = await list('incomes', { gte: ['received_on', ms], order: 'received_on', asc: false });
        const exp = await list('incomes', { eq: { expected: true }, order: 'received_on' });
        const got = incs.filter(i => !i.expected);
        body = `<div class="card"><div class="mut">دخل الشهر لحد النهاردة</div><div class="row" style="align-items:baseline;gap:6px"><span class="num" style="font-size:32px;line-height:1.2">${m(got.reduce((s, i) => s + Number(i.amount), 0))}</span><span class="mut">جنيه</span></div></div>
          <div class="card" style="padding:10px 14px"><b style="font-weight:600">الدخل</b><div class="list">${got.map(i => row(esc(i.source), `${fd(i.received_on)}${i.project_client_id ? ' · اتسجل من مشاريعي' : ''}`, i.amount, `data-act="inc-open" data-id="${i.id}" role="button" tabindex="0"`)).join('') || '<div class="mut" style="padding:8px 0">سجّل مرتبك وأي دخل تاني. دفعات عملاء مشاريعي بتدخل هنا لوحدها.</div>'}</div></div>
          ${exp.length ? `<div class="card" style="padding:10px 14px"><b style="font-weight:600">مستني يدخل</b><div class="list">${exp.map(i => row(esc(i.source), fd(i.received_on), i.amount, `data-act="inc-open" data-id="${i.id}" role="button" tabindex="0"`, 'var(--mut)')).join('')}</div></div>` : ''}`;
      } else {
        const coms = await list('commitments', { order: 'due_day' });
        body = `<div class="card" style="padding:10px 14px"><div class="between"><b style="font-weight:600">الالتزامات الشهرية</b><span class="mut">المجموع <b class="num" style="color:var(--ink)">${m(coms.filter(c => c.active).reduce((s, c) => s + Number(c.amount), 0))}</b></span></div>
          <div class="list">${coms.map(c => row(esc(c.name), c.due_day ? `يوم ${c.due_day} · الجاي ${fd(nextDue(c.due_day))}` : 'من غير ميعاد', c.amount, `data-act="com-open" data-id="${c.id}" role="button" tabindex="0"`)).join('') || '<div class="mut" style="padding:8px 0">الإيجار، الأقساط، الاشتراكات… كل حاجة ثابتة كل شهر.</div>'}</div></div>`;
      }
      return {
        title: 'الشهر ده', sub: fMonth(today()), back: '#/money', right: eye(), noSearch: true,
        fab: tab === 'out' ? { label: 'مصروف', act: 'exp-new' } : tab === 'in' ? { label: 'دخل', act: 'inc-new' } : { label: 'التزام', act: 'com-new' },
        html: `<div class="stack">${seg3(tab)}${body}</div>`,
      };
    }),
    actions: {
      'flow-tab'(el) { st.flow = el.dataset.v; doRefresh(); },
      async 'exp-new'() { expenseSheet(await list('budget_categories', { order: 'sort' })); },
      async 'exp-open'(el) { const [e, cats] = await Promise.all([one('expenses', el.dataset.id), list('budget_categories', { order: 'sort' })]); e && expenseSheet(cats, e); },
      'inc-new': () => incomeSheet(), async 'inc-open'(el) { const i = await one('incomes', el.dataset.id); i && incomeSheet(i); },
      'com-new': () => commitSheet(), async 'com-open'(el) { const c = await one('commitments', el.dataset.id); c && commitSheet(c); },
      'cat-new': () => catSheet(), async 'cat-open'(el) { const c = await one('budget_categories', el.dataset.id); c && catSheet(c); },
    },
  },

  debts: {
    render: guard(async p => {
      if (p.query.tab) st.debt = p.query.tab;
      const debts = await list('v_debts', { order: 'created_at' });
      const L = debts.filter(d => d.direction === st.debt);
      const tot = dir => debts.filter(d => d.direction === dir).reduce((s, d) => s + Number(d.remaining), 0);
      return {
        title: 'الديون', sub: `عليا ${m(tot('owe'))} · ليا ${m(tot('owed'))}`, back: '#/money', right: eye(), noSearch: true,
        fab: { label: st.debt === 'owe' ? 'دين' : 'فلوس ليا', act: 'debt-new' },
        html: `<div class="stack"><div class="seg"><button class="${st.debt === 'owe' ? 'on' : ''}" data-act="debt-tab" data-v="owe">عليا</button><button class="${st.debt === 'owed' ? 'on' : ''}" data-act="debt-tab" data-v="owed">ليا عند الناس</button></div>
          ${L.length ? L.map(d => { const pct = d.total ? Number(d.paid) / Number(d.total) * 100 : 0; const nd = nextDue(d.due_day);
            return `<button class="card stack" style="gap:10px" data-act="debt-open" data-id="${d.id}"><div class="between" style="align-items:flex-start"><div><div style="font-weight:600">${esc(d.person)}</div><div class="mut">${d.installment_amount ? `قسط ${m(d.installment_amount)}` : 'من غير قسط ثابت'}${d.notes ? ' · ' + esc(d.notes) : ''}</div></div><div style="text-align:left"><div class="num" style="font-size:18px">${m(d.remaining)}</div><div class="mut">باقي</div></div></div>
              ${bat(pct, 'done')}<div class="between mut"><span>${st.debt === 'owe' ? 'سددت' : 'استلمت'} ${m(d.paid)} من ${m(d.total)}</span><span>${Number(d.remaining) <= 0 ? 'خلص' : nd ? 'الجاي ' + fd(nd) : ''}</span></div></button>`; }).join('')
            : empty(st.debt === 'owe' ? 'مفيش ديون عليك متسجلة.' : 'مفيش فلوس ليك عند حد متسجلة.')}</div>`,
      };
    }),
    actions: {
      'debt-tab'(el) { st.debt = el.dataset.v; doRefresh(); },
      'debt-new': () => debtSheet({}),
      async 'debt-open'(el) { const d = (await list('v_debts', { eq: { id: el.dataset.id } }))[0]; d && debtSheet(d); },
    },
  },

  investments: {
    render: guard(async () => {
      const invs = await list('v_investments', { order: 'created_at' });
      const total = invs.reduce((s, i) => s + Number(i.amount), 0), rets = invs.reduce((s, i) => s + Number(i.returns_total), 0);
      return {
        title: 'استثمارات', sub: `${m(total)} · جالي ${m(rets)} أرباح`, back: '#/money', right: eye(), noSearch: true,
        fab: { label: 'استثمار', act: 'inv-new' },
        html: `<div class="stack">${invs.length ? invs.map(i => {
          const months = i.started_on ? Math.max(1, Math.round((new Date(today()) - new Date(i.started_on)) / (30.44 * 864e5))) : 1;
          const avg = Number(i.returns_total) / months;
          const diff = i.expected_monthly ? Math.round((avg - i.expected_monthly) / i.expected_monthly * 100) : null;
          const box = (v, l) => `<div style="background:var(--mat);border-radius:10px;padding:8px 4px;text-align:center"><div class="num" style="font-size:16px">${v}</div><div class="mut" style="font-size:11px">${l}</div></div>`;
          return `<button class="card stack" style="gap:10px" data-act="inv-open" data-id="${i.id}"><div class="between" style="align-items:flex-start"><div><div style="font-weight:600">${esc(i.name)}</div><div class="mut">${i.started_on ? 'من ' + fd(i.started_on) : ''}</div></div><div class="num" style="font-size:18px">${m(i.amount)}</div></div>
            <div class="grid3">${box(m(i.returns_total), 'أرباح جاتلي')}${box(m(avg), 'متوسط الشهر')}${box(hidden() ? '•••' : (i.roi_pct ?? 0) + '%', 'عائد لحد دلوقتي')}</div>
            ${i.expected_monthly ? `<div class="mut">المتوقع ${m(i.expected_monthly)} في الشهر · ${diff < 0 ? `<b class="late">أقل من المتوقع ${Math.abs(diff)}%</b>` : `<b style="color:var(--ok)">${diff > 0 ? `أعلى من المتوقع ${diff}%` : 'زي المتوقع'}</b>`}</div>` : ''}</button>`;
        }).join('') : empty('سجّل استثماراتك: المبلغ، والربح المتوقع، وكل أرباح تستلمها. هتشوف العائد الحقيقي.')}</div>`,
      };
    }),
    actions: { 'inv-new': () => invSheet(), async 'inv-open'(el) { const i = await one('investments', el.dataset.id); i && invSheet(i); } },
  },

  networth: {
    render: guard(async () => {
      const [nw, snaps, wallets, assets, invs, debts] = await Promise.all([list('v_net_worth'), list('net_worth_snapshots', { order: 'month', asc: false, limit: 6 }), list('wallets', { order: 'created_at' }), list('assets', { order: 'created_at' }), list('v_investments'), list('v_debts')]);
      const N = nw[0] || { assets: 0, liabilities: 0 }; const net = Number(N.assets) - Number(N.liabilities);
      const hist = [...snaps].reverse().map(s => ({ m: s.month, v: Number(s.assets) - Number(s.liabilities) }));
      const prev = hist.length > 1 ? hist[hist.length - 2].v : null;
      const mx = Math.max(...hist.map(h => h.v), 1), mn = Math.min(...hist.map(h => h.v), 0);
      const bars = hist.map((h, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%"><span style="width:100%;max-width:30px;border-radius:6px 6px 2px 2px;height:${Math.round(((h.v - mn) / ((mx - mn) || 1)) * 78) + 12}%;background:${i === hist.length - 1 ? 'var(--amb)' : 'var(--ink)'}"></span><span style="font-size:11px;color:var(--mut)">${fMonth(h.m).split(' ')[0]}</span></div>`).join('');
      const owed = debts.filter(d => d.direction === 'owed'), owe = debts.filter(d => d.direction === 'owe');
      return {
        title: 'صافي الثروة', sub: 'بيتسجل كل شهر', back: '#/money', right: eye(), noSearch: true,
        fab: { label: 'أضف', act: 'nw-add' },
        html: `<div class="stack">
          <div class="card stack" style="gap:10px"><div class="row" style="align-items:baseline;gap:8px"><span class="num" style="font-size:36px;line-height:1.1">${m(net)}</span><span class="mut">جنيه</span></div>
            ${prev !== null && !hidden() ? `<div style="font-weight:600;font-size:14px;color:${net >= prev ? 'var(--ok)' : 'var(--bad)'}">${net >= prev ? 'زاد' : 'قل'} ${n(Math.abs(Math.round(net - prev)))} عن الشهر اللي فات</div>` : ''}
            ${hist.length > 1 && !hidden() ? `<div class="row" style="gap:8px;height:110px;align-items:flex-end" role="img" aria-label="صافي الثروة آخر شهور">${bars}</div>` : '<div class="mut">الرسم هيظهر من الشهر الجاي، لما يبقى فيه شهرين أو أكتر.</div>'}</div>
          <div class="card" style="padding:10px 14px"><div class="between"><b style="font-weight:600">اللي ليك</b><span class="num mut">${m(N.assets)}</span></div><div class="list">
            ${wallets.map(w => row(esc(w.name), WALLET[w.kind], w.balance, `data-act="wal-open" data-id="${w.id}" role="button" tabindex="0"`)).join('')}
            ${assets.map(a => row(esc(a.name), a.kind === 'gold' ? `${n(a.quantity)} جرام × ${m(a.unit_price)}${a.price_updated_on ? ' · السعر من ' + fd(a.price_updated_on) : ''}` : a.kind === 'usd' ? `${n(a.quantity)} دولار × ${m(a.unit_price)}` : ASSET[a.kind], assetValue(a), `data-act="asset-open" data-id="${a.id}" role="button" tabindex="0"`)).join('')}
            ${invs.length ? `<a href="#/investments" style="text-decoration:none">${row('استثمارات', `${invs.length} استثمار`, invs.reduce((s, i) => s + Number(i.amount), 0))}</a>` : ''}
            ${owed.length ? `<a href="#/debts?tab=owed" style="text-decoration:none">${row('ليك عند الناس', `${owed.length}`, owed.reduce((s, d) => s + Number(d.remaining), 0))}</a>` : ''}
            ${!wallets.length && !assets.length ? '<div class="mut" style="padding:8px 0">دوس "أضف" وسجّل الكاش والبنك والدهب والدولار والممتلكات.</div>' : ''}
          </div></div>
          <div class="card" style="padding:10px 14px"><div class="between"><b style="font-weight:600">اللي عليك</b><span class="num mut">${m(N.liabilities)}</span></div><div class="list">
            ${owe.filter(d => Number(d.remaining) > 0).map(d => `<a href="#/debts" style="text-decoration:none">${row(esc(d.person), '', d.remaining)}</a>`).join('') || '<div class="mut" style="padding:8px 0">مفيش.</div>'}</div></div>
        </div>`,
      };
    }),
    actions: {
      'nw-add'() {
        openSheet('أضف', `<div class="stack" style="gap:8px">${[['wal', 'كاش أو بنك أو محفظة موبايل'], ['gold', 'دهب بالجرام'], ['usd', 'دولار'], ['property', 'ممتلكات (موتوسيكل، أجهزة…)']].map(([k, l]) => `<button class="btn" style="justify-content:flex-start" data-act="nw-pick" data-v="${k}">${l}</button>`).join('')}</div>`);
      },
      'nw-pick'(el) { el.dataset.v === 'wal' ? walletSheet() : assetSheet(el.dataset.v); },
      async 'wal-open'(el) { const w = await one('wallets', el.dataset.id); w && walletSheet(w); },
      async 'asset-open'(el) { const a = await one('assets', el.dataset.id); a && assetSheet(a.kind, a); },
    },
  },
};

// actions بتشتغل من الشيتات في أي شاشة فلوس
const save = async (table, id, row, msg) => { try { if (id) await upd(table, id, row); else await ins(table, row); closeSheet(); if (msg) toast(msg); doRefresh(); } catch (e) { fail(e); } };
export const moneyGlobal = {
  ...lockActions,
  'hide-toggle'() { try { localStorage.setItem('nota.hide', hidden() ? '0' : '1'); } catch (e) {} doRefresh(); },
  async 'exp-save'(el) { const f = formOf(sheetEl()); const a = num(f.amount); if (!a) return toast('اكتب المبلغ'); await save('expenses', el.dataset.id, { amount: a, category_id: f.category_id || null, note: f.note || null, spent_on: f.spent_on || today() }); },
  async 'exp-archive'(el) { closeSheet(); await archiveWithUndo('expenses', el.dataset.id, 'المصروف اتشال'); },
  async 'inc-save'(el) { const f = formOf(sheetEl()); const a = num(f.amount); if (!a) return toast('اكتب المبلغ'); await save('incomes', el.dataset.id, { amount: a, source: f.source || 'دخل', received_on: f.received_on || today(), expected: !!f.expected }); },
  async 'inc-archive'(el) { closeSheet(); await archiveWithUndo('incomes', el.dataset.id, 'الدخل اتشال'); },
  async 'com-save'(el) { const f = formOf(sheetEl()); if (!f.name || !num(f.amount)) return toast('اكتب الاسم والمبلغ'); const d = parseInt(f.due_day); await save('commitments', el.dataset.id, { name: f.name, amount: num(f.amount), due_day: d >= 1 && d <= 31 ? d : null }); },
  async 'com-archive'(el) { closeSheet(); await archiveWithUndo('commitments', el.dataset.id, 'الالتزام اتشال'); },
  async 'cat-save'(el) { const f = formOf(sheetEl()); if (!f.name) return toast('اكتب اسم البند'); await save('budget_categories', el.dataset.id, { name: f.name, monthly_budget: num(f.monthly_budget), ...(el.dataset.id ? {} : { sort: Date.now() % 1e6 }) }); },
  async 'cat-archive'(el) { closeSheet(); await archiveWithUndo('budget_categories', el.dataset.id, 'البند اتشال'); },
  async 'fgoal-save'(el) { const f = formOf(sheetEl()); if (!f.title || !num(f.target)) return toast('اكتب الهدف والمبلغ'); await save('financial_goals', el.dataset.id, { title: f.title, target: num(f.target), saved: num(f.saved) || 0 }); },
  async 'fgoal-add'(form) { const a = num(form.querySelector('[name=add]').value); if (!a) return; const g = await one('financial_goals', form.dataset.id); await save('financial_goals', g.id, { saved: Number(g.saved) + a }, 'اتزود'); },
  async 'fgoal-archive'(el) { closeSheet(); await archiveWithUndo('financial_goals', el.dataset.id, 'الهدف اتشال'); },
  async 'wal-save'(el) { const f = formOf(sheetEl()); if (!f.name) return toast('اكتب الاسم'); await save('wallets', el.dataset.id, { name: f.name, kind: f.kind, balance: num(f.balance) || 0 }); },
  async 'wal-archive'(el) { closeSheet(); await archiveWithUndo('wallets', el.dataset.id, 'اتشال'); },
  async 'asset-save'(el) {
    const f = formOf(sheetEl()); const k = el.dataset.kind; if (!f.name) return toast('اكتب الاسم');
    const row = { name: f.name, kind: k };
    if (k === 'gold' || k === 'usd') {
      row.quantity = num(f.quantity); row.unit_price = num(f.unit_price);
      const old = el.dataset.id ? await one('assets', el.dataset.id) : null;
      if (!old || Number(old.unit_price) !== row.unit_price) row.price_updated_on = today();
    } else row.manual_value = num(f.manual_value);
    await save('assets', el.dataset.id, row);
  },
  async 'asset-archive'(el) { closeSheet(); await archiveWithUndo('assets', el.dataset.id, 'اتشال'); },
  async 'debt-save'(el) {
    const f = formOf(sheetEl()); if (!f.person || !num(f.total)) return toast('اكتب الاسم والمبلغ');
    const d = parseInt(f.due_day);
    await save('debts', el.dataset.id, { direction: el.dataset.dir, person: f.person, total: num(f.total), installment_amount: num(f.installment_amount), due_day: d >= 1 && d <= 31 ? d : null, notes: f.notes || null });
  },
  async 'debt-archive'(el) { closeSheet(); await archiveWithUndo('debts', el.dataset.id, 'اتشال'); },
  async 'pay-add'(form) {
    const a = num(form.querySelector('[name=amount]').value); if (!a) return toast('اكتب المبلغ');
    try { await ins('debt_payments', { debt_id: form.dataset.id, amount: a }); const d = (await list('v_debts', { eq: { id: form.dataset.id } }))[0]; toast('اتسجلت'); debtSheet(d); doRefresh(); } catch (e) { fail(e); }
  },
  async 'pay-del'(el) { try { await del('debt_payments', el.dataset.id); closeSheet(); doRefresh(); } catch (e) { fail(e); } },
  async 'inv-save'(el) { const f = formOf(sheetEl()); if (!f.name || !num(f.amount)) return toast('اكتب الاسم والمبلغ'); await save('investments', el.dataset.id, { name: f.name, amount: num(f.amount), started_on: f.started_on || null, expected_monthly: num(f.expected_monthly) }); },
  async 'inv-archive'(el) { closeSheet(); await archiveWithUndo('investments', el.dataset.id, 'اتشال'); },
  async 'ret-add'(form) {
    const a = num(form.querySelector('[name=amount]').value); if (!a) return toast('اكتب المبلغ');
    try { await ins('investment_returns', { investment_id: form.dataset.id, amount: a }); toast('الأرباح اتسجلت'); invSheet(await one('investments', form.dataset.id)); doRefresh(); } catch (e) { fail(e); }
  },
  async 'ret-del'(el) { try { await del('investment_returns', el.dataset.id); closeSheet(); doRefresh(); } catch (e) { fail(e); } },
};
