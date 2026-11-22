// مشاريعي: سيستمات وتطبيقات وبرامج وألعاب ومشاريع شخصية
import { list, one, ins, upd, del } from './db.js';
import { esc, ic, bat, fd, today, addDays, iso, n, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, opts } from './ui.js';
import { stepsBlock, linksSlot, archiveWithUndo, doRefresh, openTask } from './comps.js';
import { lifeData, taPicker, taRow, taValue, trackByName } from './life.js';
import { remindField, readRemind, remindCard, remindActions, remindChip } from './remind.js';

export const PKIND = { system: 'سيستم', app: 'تطبيق', program: 'برنامج', game: 'لعبة', other: 'حاجة تانية' };
export const DSTAGE = [['idea', 'فكرة'], ['plan', 'خطة'], ['building', 'بيتنفذ'], ['applied', 'اتطبق']];
const DTAG = { idea: 'out', plan: '', building: 'amb', applied: 'ok' };
const TSTAGE = { to_contact: ['هتواصل', 'out'], offer_sent: ['عرض اتبعت', 'amb'], thinking: ['بيفكر', ''] };
const st = { kind: '', tab: 'devs', stage: '' };

// ---------- الفلوس اللي بتيجي من العملاء ----------
// كل دفعة بتتحفظ في "فلوسي" كدخل، ومعاها: نوعها (اشتراك / بيع كامل / حاجة تانية)، ولو اشتراك: كام شهر ومن إمتى لإمتى
const PAYK = { sub: 'اشتراك', sale: 'بيع التطبيق بالكامل', other: 'حاجة تانية' };
const DUR = [[1, 'شهري'], [3, '3 شهور'], [6, '6 شهور'], [12, 'سنوي'], ['x', 'عدد تاني']];
const num = v => Number(v) || 0;
const sum = L => L.reduce((s, x) => s + num(x.amount), 0);
const durLabel = m => m === 1 ? 'شهري' : m === 2 ? 'شهرين' : m === 12 ? 'سنوي' : m === 24 ? 'سنتين' : m >= 3 && m <= 10 ? `${m} شهور` : `${m} شهر`;
const payLabel = i => i.pay_kind === 'sub' ? `اشتراك ${durLabel(num(i.months) || 1)}` : PAYK[i.pay_kind] || 'دفعة';
function addMonths(s, m) {
  const d = new Date(s + 'T12:00'), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + m);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return iso(d);
}
const coversTo = (from, m) => addDays(addMonths(from, m), -1);   // شهر من 1 يناير = لحد 31 يناير

// حالة العميل من دفعاته: دفع كام، اشترى بالكامل؟، مشترك لحد إمتى؟
function clientMoney(c, incs) {
  const L = incs.filter(i => i.project_client_id === c.id);
  const sale = L.some(i => i.pay_kind === 'sale');
  const until = L.filter(i => i.pay_kind === 'sub' && i.covers_to).map(i => i.covers_to).sort().pop() || null;
  let text = '', tag = '';
  if (sale) text = 'اشترى التطبيق بالكامل';
  else if (until) {
    if (until < today()) { text = `الاشتراك خلص ${fd(until)}`; tag = '<span class="tag bad">خلص</span>'; }
    else { text = `مشترك لحد ${fd(until)}`; if (until <= addDays(today(), 7)) tag = '<span class="tag amb">قرّب يخلص</span>'; }
  }
  return { L, total: sum(L), sale, until, text, tag };
}

function pipe(devs) {
  const cols = { idea: 'background:var(--paper);border:1px dashed var(--mut)', plan: 'background:var(--mat)', building: 'background:var(--amb);color:#15202B', applied: 'background:var(--ok);color:#fff' };
  return `<div class="row" style="gap:6px">${DSTAGE.map(([k, l]) => `<div style="flex:1;border-radius:10px;padding:6px 4px;text-align:center;${cols[k]}"><div class="num" style="font-size:17px;line-height:1.2">${devs.filter(d => d.stage === k).length}</div><div style="font-size:11px">${l}</div></div>`).join('')}</div>`;
}

async function projectSheet(p = {}) {
  const d = await lifeData(), side = trackByName(d, 'شغلي الخاص');
  openSheet(p.id ? 'تعديل المشروع' : 'مشروع جديد', `
    <label class="field"><span>الاسم</span><input name="name" value="${esc(p.name)}" autofocus placeholder="مثلًا: سيستم مبيعات ومخزن للمحلات"></label>
    <div class="grid2"><label class="field"><span>النوع</span><select name="kind">${opts(Object.entries(PKIND), p.kind || 'system')}</select></label>
    <label class="field"><span>لمين؟</span><input name="audience" value="${esc(p.audience)}" placeholder="للمحلات، للشركات…"></label></div>
    <label class="row card" style="padding:12px 14px"><input type="checkbox" name="is_personal" ${p.is_personal ? 'checked' : ''} style="width:22px;height:22px"><span style="flex:1">مشروع شخصي ليا أنا (من غير عملاء)</span></label>
    ${taPicker(d, p.id ? taValue(p) : side ? 't:' + side.id : '')}
    <label class="field"><span>بدأته إمتى</span><input type="date" name="started_on" value="${p.started_on || ''}"></label>
    <label class="field"><span>وصف مختصر</span><textarea name="description" rows="3">${esc(p.description)}</textarea></label>
    <button class="btn pri" data-act="proj-save" data-id="${p.id || ''}">حفظ</button>`);
}
function devSheet(projectId) {
  openSheet('فكرة تطوير', `<label class="field"><span>التطوير</span><input name="title" autofocus placeholder="مثلًا: تقرير أرباح يومي على الواتساب"></label>
    <label class="field"><span>تفاصيل (اختياري)</span><textarea name="details" rows="3"></textarea></label>
    ${remindField()}
    <button class="btn pri" data-act="dev-create" data-pid="${projectId}">حفظ</button>`);
}
async function clientSheet(projectId, c = {}) {
  const status = c.status || 'target';
  const m = c.id ? clientMoney(c, await list('incomes', { eq: { project_client_id: c.id }, order: 'received_on', asc: false })) : null;
  openSheet(c.id ? esc(c.name) : 'عميل جديد', `
    <label class="field"><span>الاسم</span><input name="name" value="${esc(c.name)}" ${c.id ? '' : 'autofocus'} placeholder="مثلًا: محل النور للموبايلات"></label>
    <div class="field"><span>الحالة</span><div class="pills" data-group="cstatus">${[['active', 'عميل شغال'], ['target', 'مستهدف'], ['ended', 'وقف'], ['lost', 'رفض']].map(([k, l]) => `<button type="button" data-v="${k}" class="${status === k ? 'on' : ''}" data-act="pick">${l}</button>`).join('')}</div></div>
    <label class="field"><span>لو مستهدف: وصلت لفين؟</span><select name="target_stage"><option value="">—</option>${opts(Object.entries(TSTAGE).map(([k, v]) => [k, v[0]]), c.target_stage)}</select></label>
    <div class="grid2"><label class="field"><span>سعر الاشتراك في الشهر</span><input name="monthly_fee" inputmode="decimal" value="${c.monthly_fee ?? ''}" placeholder="جنيه"></label>
    <label class="field"><span>عميل من إمتى</span><input type="date" name="since_on" value="${c.since_on || ''}"></label></div>
    <label class="field"><span>ملاحظات</span><textarea name="notes" rows="2">${esc(c.notes)}</textarea></label>
    ${m ? `<div class="card" style="padding:10px 14px">
      <div class="between"><b style="font-weight:600">الفلوس</b><span class="num">${n(m.total)} ج</span></div>
      ${m.text ? `<div class="row" style="margin-top:4px"><span class="mut" style="flex:1">${m.text}</span>${m.tag}</div>` : ''}
      <div class="list" style="margin-top:6px">${m.L.slice(0, 5).map(i => `<div class="between" style="padding:6px 0"><span>${payLabel(i)}<br><small class="mut">${fd(i.received_on)}</small></span><span class="num">${n(i.amount)}</span></div>`).join('')}</div>
      <button class="btn sm amb" style="width:100%;margin-top:8px" data-act="pay-new" data-cid="${c.id}">${ic('wallet', 18)}سجّل دفعة من العميل ده</button></div>` : ''}
    <div class="btns">${c.id ? `<button class="btn" data-act="client-archive" data-id="${c.id}">${ic('archive', 18)}أرشيف</button>` : ''}<button class="btn pri" data-act="client-save" data-id="${c.id || ''}" data-pid="${projectId}">حفظ</button></div>`);
}

// شيت الدفعة: جديدة (من مشروع أو من عميل) أو تعديل دفعة قديمة
async function paySheet({ pid, cid, incId }) {
  const inc = incId ? (await one('incomes', incId)) || {} : {};
  cid = inc.project_client_id || cid;
  if (!pid) { const c = await one('project_clients', cid); pid = c?.project_id; }
  const clients = pid ? await list('project_clients', { eq: { project_id: pid }, order: 'name' }) : [];
  if (!clients.length) return toast('ضيف عميل الأول من تبويب العملاء');
  cid = cid || (clients.find(c => c.status === 'active') || clients[0]).id;
  // الاشتراك الجديد بيبدأ بعد ما القديم يخلص على طول، ولو القديم خلص من زمان يبدأ النهاردة
  const incs = await list('incomes', { notNull: 'project_client_id' });
  const starts = {}, fees = {};
  for (const c of clients) {
    const u = incs.filter(i => i.project_client_id === c.id && i.pay_kind === 'sub' && i.covers_to && i.id !== inc.id).map(i => i.covers_to).sort().pop();
    starts[c.id] = u && u >= addDays(today(), -1) ? addDays(u, 1) : today();
    fees[c.id] = num(c.monthly_fee);
  }
  const kind = inc.pay_kind || 'sub', m = num(inc.months) || 1, dv = [1, 3, 6, 12].includes(m) ? m : 'x';
  const s = openSheet(inc.id ? 'تعديل الدفعة' : 'سجّل دفعة', `
    <label class="field"><span>من مين؟</span><select name="client" data-change="pay-client">${opts(clients.map(c => [c.id, c.name]), cid)}</select></label>
    <div class="field"><span>الفلوس دي إيه؟</span><div class="pills" data-group="paykind">${Object.entries(PAYK).map(([k, l]) => `<button type="button" data-v="${k}" class="${kind === k ? 'on' : ''}" data-act="pay-kind">${l}</button>`).join('')}</div></div>
    <div class="stack" data-box="sub" ${kind === 'sub' ? '' : 'hidden'}>
      <div class="field"><span>الاشتراك لمدة قد إيه؟</span><div class="pills" data-group="paydur">${DUR.map(([k, l]) => `<button type="button" data-v="${k}" class="${String(dv) === String(k) ? 'on' : ''}" data-act="pay-dur">${l}</button>`).join('')}</div></div>
      <label class="field" data-box="months" ${dv === 'x' ? '' : 'hidden'}><span>عدد الشهور</span><input name="months" inputmode="numeric" value="${m}" data-input="pay-calc"></label>
      <label class="field"><span>الاشتراك بيبدأ من</span><input type="date" name="covers_from" value="${inc.covers_from || starts[cid]}" data-change="pay-calc"></label>
      <div class="card" style="padding:10px 14px" data-out="until"></div>
    </div>
    <label class="field"><span>المبلغ</span><input name="amount" inputmode="decimal" value="${inc.amount ?? ''}" placeholder="جنيه" data-input="pay-amt"></label>
    <label class="field"><span>استلمته يوم</span><input type="date" name="received_on" value="${inc.received_on || today()}"></label>
    <label class="field"><span>ملاحظة (اختياري)</span><input name="pay_note" value="${esc(inc.pay_note)}" placeholder="مثلًا: دفع نص المبلغ والباقي الشهر الجاي"></label>
    <p class="mut" style="margin:0">الدفعة هتدخل "فلوسي" كدخل، ومكتوب عليها اسم العميل والمشروع.</p>
    <div class="btns">${inc.id ? `<button class="btn" data-act="pay-archive" data-id="${inc.id}">${ic('archive', 18)}امسح</button>` : ''}<button class="btn amb" data-act="pay-save" data-id="${inc.id || ''}">حفظ</button></div>`);
  s._pay = { starts, fees, clients, auto: !inc.id };
  payCalc();
}
const picked = g => sheetEl().querySelector(`[data-group=${g}] .on`)?.dataset.v;
const payMonths = () => { const d = picked('paydur'); return d === 'x' ? Math.max(1, parseInt(sheetEl().querySelector('[name=months]').value) || 1) : Number(d) || 1; };
// بيحسب "مشترك لحد إمتى" ويكتب المبلغ لوحده من سعر الشهر (لو المبلغ لسه متكتبش بإيدك)
function payCalc() {
  const s = sheetEl(), P = s._pay; if (!P) return;
  const out = s.querySelector('[data-out=until]'), from = s.querySelector('[name=covers_from]').value, m = payMonths();
  if (out) out.innerHTML = from ? `هيبقى مشترك من <b>${fd(from)}</b> لحد <b>${fd(coversTo(from, m))}</b>` : 'اختار الاشتراك بيبدأ من إمتى';
  const amt = s.querySelector('[name=amount]'), fee = P.fees[s.querySelector('[name=client]').value];
  if (P.auto && picked('paykind') === 'sub' && fee) amt.value = fee * m;
}

export default {
  projects: {
    async render() {
      const [projects, devs, clients, incs] = await Promise.all([list('projects', { order: 'created_at', asc: false }), list('project_devs'), list('project_clients'), list('incomes', { notNull: 'project_client_id' })]);
      const active = clients.filter(c => c.status === 'active').length, targets = clients.filter(c => c.status === 'target').length;
      const kinds = [...new Set(projects.map(p => p.kind))];
      const L = projects.filter(p => !st.kind || (st.kind === 'personal' ? p.is_personal : p.kind === st.kind));
      const total = sum(incs);
      return {
        title: 'مشاريعي', sub: 'سيستمات وتطبيقات وبرامج وألعاب', back: '#/today',
        fab: { label: 'مشروع', act: 'proj-new' },
        html: `<div class="stack">
          <div class="grid3">${[[projects.length, 'مشاريع'], [active, 'عملاء شغالين'], [targets, 'مستهدفين']].map(([v, l]) => `<div class="card" style="padding:12px"><div class="num" style="font-size:26px;line-height:1.2">${v}</div><div class="mut">${l}</div></div>`).join('')}</div>
          ${total ? `<div class="card between" style="padding:12px 14px"><span class="row">${ic('wallet', 20)}اتحصّل من المشاريع</span><b class="num">${n(total)} ج</b></div>` : ''}
          ${projects.length > 1 ? `<div class="pills"><button class="${st.kind ? '' : 'on'}" data-act="pk" data-v="">الكل</button>${kinds.map(k => `<button class="${st.kind === k ? 'on' : ''}" data-act="pk" data-v="${k}">${PKIND[k]}</button>`).join('')}${projects.some(p => p.is_personal) ? `<button class="${st.kind === 'personal' ? 'on' : ''}" data-act="pk" data-v="personal">شخصي</button>` : ''}</div>` : ''}
          ${L.length ? L.map(p => {
            const pc = clients.filter(c => c.project_id === p.id);
            const meta = p.is_personal ? 'ليا أنا' : `عملاء <b class="num" style="color:var(--ink)">${pc.filter(c => c.status === 'active').length}</b> · مستهدفين <b class="num" style="color:var(--ink)">${pc.filter(c => c.status === 'target').length}</b>`;
            return `<a class="card stack" style="gap:10px" href="#/project/${p.id}"><div class="between"><span class="chip">${PKIND[p.kind]}${p.audience ? ' · ' + esc(p.audience) : p.is_personal ? ' · شخصي' : ''}</span><span class="mut">${meta}</span></div>
              <div class="disp" style="font-size:20px;line-height:1.35">${esc(p.name)}</div>${pipe(devs.filter(d => d.project_id === p.id))}</a>`;
          }).join('') : empty('ضيف أول مشروع: سيستم عملته لمحل، أو تطبيق، أو برنامج، أو لعبة، أو حاجة ليك إنت.')}
        </div>`,
      };
    },
    actions: { pk(el) { st.kind = el.dataset.v; doRefresh(); }, 'proj-new': () => projectSheet() },
  },

  project: {
    async render(p) {
      const pr = await one('projects', p.id);
      if (!pr) return { title: 'مشروع', back: '#/projects', html: empty('المشروع ده مش موجود.') };
      if (st.pid !== pr.id) { st.pid = pr.id; st.tab = 'devs'; st.stage = ''; }
      const [devs, clients, allInc] = await Promise.all([list('project_devs', { eq: { project_id: pr.id }, order: 'created_at', asc: false }), list('project_clients', { eq: { project_id: pr.id }, order: 'name' }), list('incomes', { notNull: 'project_client_id', order: 'received_on', asc: false })]);
      const C = Object.fromEntries(clients.map(c => [c.id, c]));
      const incs = allInc.filter(i => C[i.project_client_id]);
      const act = clients.filter(c => c.status === 'active'), tgt = clients.filter(c => c.status === 'target'), other = clients.filter(c => c.status === 'ended' || c.status === 'lost');
      const tab = pr.is_personal ? 'devs' : st.tab;   // المشروع الشخصي: تطويرات بس، من غير عملاء ولا فلوس
      let body = '';
      if (tab === 'devs') {
        const L = devs.filter(d => !st.stage || d.stage === st.stage);
        body = `<div class="pills"><button class="${st.stage ? '' : 'on'}" data-act="ds" data-v="">الكل ${devs.length}</button>${DSTAGE.map(([k, l]) => `<button class="${st.stage === k ? 'on' : ''}" data-act="ds" data-v="${k}">${l} ${devs.filter(d => d.stage === k).length}</button>`).join('')}</div>`
          + (L.length ? L.map(d => `<a class="card stack" style="gap:8px" href="#/dev/${d.id}"><div class="between" style="align-items:flex-start"><div class="title" style="font-size:15px">${esc(d.title)}</div><span class="tag ${DTAG[d.stage]}">${DSTAGE.find(s => s[0] === d.stage)[1]}</span></div>${d.details ? `<div class="mut">${esc(d.details.slice(0, 100))}</div>` : ''}${d.stage === 'applied' && d.applied_on ? `<div class="mut">اتطبق ${fd(d.applied_on)}</div>` : ''}${remindChip(d)}</a>`).join('')
            : empty('سجّل أي فكرة تطوير للمشروع ده. هتمشي فكرة، بعدين خطة، بعدين بيتنفذ، بعدين اتطبق.'));
      } else if (tab === 'clients') {
        const row = c => {
          const m = clientMoney(c, incs);
          const sub = c.status === 'active'
            ? [m.text || (c.since_on ? 'من ' + fd(c.since_on) : 'عميل شغال'), c.monthly_fee && !m.sale ? `${n(c.monthly_fee)} ج في الشهر` : '', m.total ? `دفع ${n(m.total)} ج` : ''].filter(Boolean).join(' · ')
            : esc(c.notes || '');
          return `<button class="lnk" data-act="client-open" data-id="${c.id}"><span class="k disp" style="font-size:16px">${esc(c.name.trim()[0] || '؟')}</span><span class="t">${esc(c.name)}<small>${sub}</small></span>${c.status === 'target' && c.target_stage ? `<span class="tag ${TSTAGE[c.target_stage][1]}">${TSTAGE[c.target_stage][0]}</span>` : c.status === 'active' ? m.tag : ''}</button>`;
        };
        const box = (t, L, hint) => `<div class="card" style="padding:8px 14px"><div class="between" style="padding-top:4px"><b style="font-weight:600">${t}</b><span class="num mut">${L.length}</span></div><div class="list">${L.map(row).join('') || `<div class="mut" style="padding:8px 0">${hint}</div>`}</div></div>`;
        body = box('العملاء الحاليين', act, 'لسه مفيش عملاء. دوس "+ عميل" تحت.') + box('المستهدفين', tgt, 'ضيف المحلات أو الشركات اللي ناوي تعرض عليهم.') + (other.length ? box('وقفوا أو رفضوا', other, '') : '');
      } else {
        const subs = incs.filter(i => i.pay_kind === 'sub'), sales = incs.filter(i => i.pay_kind === 'sale');
        const ys = today().slice(0, 4) + '-01-01';
        body = `<div class="card stack" style="gap:8px"><div class="between"><span class="mut">إجمالي اللي اتحصّل</span><b class="num" style="font-size:22px">${n(sum(incs))} ج</b></div>
            <div class="hr"></div>
            <div class="between"><span>اشتراكات</span><span class="num">${n(sum(subs))}</span></div>
            <div class="between"><span>بيع التطبيق بالكامل</span><span class="num">${n(sum(sales))}</span></div>
            ${incs.length > subs.length + sales.length ? `<div class="between"><span>حاجات تانية</span><span class="num">${n(sum(incs) - sum(subs) - sum(sales))}</span></div>` : ''}
            <div class="between"><span class="mut">السنة دي</span><span class="num">${n(sum(incs.filter(i => i.received_on >= ys)))}</span></div></div>`
          + (incs.length ? `<div class="card" style="padding:8px 14px"><div class="list">${incs.map(i => `<button class="lnk" data-act="pay-open" data-id="${i.id}"><span class="k">${ic('wallet', 18)}</span><span class="t">${esc(C[i.project_client_id].name)}<small>${payLabel(i)} · ${fd(i.received_on)}${i.pay_kind === 'sub' && i.covers_from && i.covers_to ? ` · من ${fd(i.covers_from)} لـ ${fd(i.covers_to)}` : ''}</small></span><b class="num">${n(i.amount)}</b></button>`).join('')}</div></div>`
            : empty(clients.length ? 'لسه مفيش فلوس متسجلة. دوس "+ دفعة" لما تاخد فلوس من عميل.' : 'ضيف عميل الأول من تبويب "العملاء"، وبعدين سجّل الفلوس اللي بتاخدها منه هنا.'));
      }
      const fab = tab === 'devs' ? { label: 'فكرة تطوير', act: 'dev-new' } : tab === 'clients' ? { label: 'عميل', act: 'client-new' } : { label: 'دفعة', act: 'pay-new' };
      return {
        title: pr.name, sub: `${PKIND[pr.kind]}${pr.audience ? ' · ' + pr.audience : ''}${pr.started_on ? ' · من ' + fd(pr.started_on) : ''}`, back: '#/projects',
        fab,
        html: `<div class="stack">
          ${pr.description ? `<div class="mut" style="font-size:14px;line-height:1.7">${esc(pr.description)}</div>` : ''}
          <div class="card row" style="padding:12px 6px">${(pr.is_personal ? [[devs.length, 'تطوير'], [devs.filter(d => d.stage === 'applied').length, 'اتطبق']] : [[act.length, 'عملاء'], [devs.length, 'تطوير'], [n(sum(incs)), 'اتحصّل']]).map(([v, l]) => `<div style="flex:1;text-align:center"><div class="num" style="font-size:22px;line-height:1.2">${v}</div><div class="mut">${l}</div></div>`).join('')}</div>
          ${pr.is_personal ? '' : `<div class="seg">${[['devs', 'التطويرات'], ['clients', 'العملاء'], ['money', 'الفلوس']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="pt" data-v="${k}">${l}</button>`).join('')}</div>`}
          ${body}
          ${linksSlot('project', pr.id)}
          <div class="btns"><button class="btn sm" data-act="proj-edit">${ic('edit', 16)}تعديل</button><button class="btn sm" data-act="proj-archive">${ic('archive', 16)}أرشيف</button></div>
        </div>`,
      };
    },
    actions: {
      pt(el) { st.tab = el.dataset.v; doRefresh(); },
      ds(el) { st.stage = el.dataset.v; doRefresh(); },
      'dev-new'(el, p) { devSheet(p.id); },
      'client-new'(el, p) { clientSheet(p.id); },
      'pay-new'(el, p) { paySheet({ pid: p.id, cid: el.dataset.cid }); },
      async 'client-open'(el, p) { const c = await one('project_clients', el.dataset.id); c && clientSheet(p.id, c); },
      async 'proj-edit'(el, p) { projectSheet(await one('projects', p.id)); },
      async 'proj-archive'(el, p) { await archiveWithUndo('projects', p.id, 'المشروع اتنقل للأرشيف', () => (location.hash = '#/projects')); },
    },
  },

  dev: {
    async render(p) {
      const d = await one('project_devs', p.id);
      if (!d) return { title: 'تطوير', back: '#/projects', html: empty('التطوير ده مش موجود.') };
      const [pr, steps, notes, clients] = await Promise.all([one('projects', d.project_id), list('plan_steps', { eq: { parent_type: 'project_dev', parent_id: d.id }, order: 'sort' }),
        list('project_dev_notes', { eq: { dev_id: d.id }, order: 'noted_on', asc: false }), list('project_clients', { eq: { project_id: d.project_id } })]);
      const idx = DSTAGE.findIndex(s => s[0] === d.stage);
      const done = steps.filter(s => s.done).length;
      const C = Object.fromEntries(clients.map(c => [c.id, c.name]));
      return {
        title: 'تطوير', sub: pr ? pr.name : '', back: `#/project/${d.project_id}`,
        html: `<div class="stack" style="padding-bottom:20px">
          <input class="disp" value="${esc(d.title)}" data-change="dev-title" aria-label="اسم التطوير" style="font-size:23px;border:0;background:transparent;padding:0;line-height:1.4">
          <div class="steps-line">${DSTAGE.map(([k, l], j) => `${j ? `<span class="ln${j <= idx ? ' on' : ''}"></span>` : ''}<button class="stg${j < idx ? ' past' : j === idx ? ' on' : ''}" data-act="dev-stage" data-v="${k}">${l}</button>`).join('')}</div>
          ${steps.length ? `<div class="card">${bat(done / steps.length * 100, d.stage === 'applied' ? 'done' : 'run')}</div>` : ''}
          ${remindCard('dev', d)}
          <label class="card field"><span class="mut">التفاصيل</span><textarea data-change="dev-details" rows="3" style="border:0;padding:0;min-height:60px;background:transparent">${esc(d.details)}</textarea></label>
          ${stepsBlock('project_dev', d.id, steps, 'الخطة')}
          <div class="card"><div class="between"><b style="font-weight:600">ملاحظات وتعديلات من التجربة</b></div>
            <form class="stack" data-act-submit="devnote-add" style="gap:8px;margin-top:8px">
              ${clients.length ? `<select class="inp" name="client"><option value="">من غير عميل</option>${opts(clients.map(c => [c.id, c.name]))}</select>` : ''}
              <div class="row"><input class="inp" name="text" placeholder="العميل قال إيه؟ محتاج تعديل إيه؟" autocomplete="off"><button class="btn sm">ضيف</button></div></form>
            <div class="list" style="margin-top:6px">${notes.map(x => `<div class="row" style="padding:8px 0;align-items:flex-start"><div style="flex:1;line-height:1.6"><span class="mut">${x.client_id && C[x.client_id] ? esc(C[x.client_id]) + ' · ' : ''}${fd(x.noted_on)}</span><br>${esc(x.text)}</div><button class="star" data-act="devnote-del" data-id="${x.id}" aria-label="امسح">${ic('x', 16)}</button></div>`).join('')}</div></div>
          ${linksSlot('project_dev', d.id)}
          <div class="btns">${idx < 3 ? `<button class="btn pri" data-act="dev-stage" data-v="${DSTAGE[idx + 1][0]}">انقله لـ"${DSTAGE[idx + 1][1]}"</button>` : ''}<button class="btn" data-act="dev-task">${ic('plus', 18)}مهمة</button></div>
          <div class="btns"><button class="btn sm" data-act="dev-archive">${ic('archive', 16)}أرشيف</button></div>
        </div>`,
      };
    },
    actions: {
      ...remindActions,
      async 'dev-stage'(el, p) { try { await upd('project_devs', p.id, { stage: el.dataset.v }); if (el.dataset.v === 'applied') toast('اتطبق. سجّل ملاحظات العملاء تحت عشان تعدّل عليه'); doRefresh(); } catch (e) { fail(e); } },
      async 'dev-title'(el, p) { if (el.value.trim()) try { await upd('project_devs', p.id, { title: el.value.trim() }); toast('اتحفظ'); } catch (e) { fail(e); } },
      async 'dev-details'(el, p) { try { await upd('project_devs', p.id, { details: el.value.trim() || null }); toast('اتحفظ'); } catch (e) { fail(e); } },
      async 'devnote-add'(form, p) {
        const f = formOf(form); if (!f.text) return;
        try { await ins('project_dev_notes', { dev_id: p.id, client_id: f.client || null, text: f.text }); doRefresh(); } catch (e) { fail(e); }
      },
      async 'devnote-del'(el) { try { await del('project_dev_notes', el.dataset.id); doRefresh(); } catch (e) { fail(e); } },
      async 'dev-task'(el, p) { const d = await one('project_devs', p.id); openTask(null, { _link: { type: 'project_dev', id: d.id, title: d.title } }); },
      async 'dev-archive'(el, p) { const d = await one('project_devs', p.id); await archiveWithUndo('project_devs', p.id, 'التطوير اتنقل للأرشيف', () => (location.hash = `#/project/${d.project_id}`)); },
    },
  },
};

// actions الشيتات
export const projectGlobal = {
  async 'proj-save'(el) {
    const f = formOf(sheetEl()); if (!f.name) return toast('اكتب اسم المشروع');
    const row = { name: f.name, kind: f.kind, audience: f.audience || null, is_personal: !!f.is_personal, started_on: f.started_on || null, description: f.description || null, ...taRow(f.ta, await lifeData()) };
    try {
      if (el.dataset.id) { await upd('projects', el.dataset.id, row); closeSheet(); doRefresh(); }
      else { const p = await ins('projects', row); closeSheet(); location.hash = `#/project/${p.id}`; }
    } catch (e) { fail(e); }
  },
  async 'dev-create'(el) {
    const f = formOf(sheetEl()); if (!f.title) return toast('اكتب التطوير');
    const r = readRemind();
    try { await ins('project_devs', { project_id: el.dataset.pid, title: f.title, details: f.details || null, ...r }); closeSheet(); if (r.remind_on) toast('اتحفظت، وهيوصلك تذكير'); doRefresh(); } catch (e) { fail(e); }
  },
  async 'client-save'(el) {
    const s = sheetEl(); const f = formOf(s); if (!f.name) return toast('اكتب اسم العميل');
    const status = s.querySelector('[data-group=cstatus] .on')?.dataset.v || 'target';
    const row = { name: f.name, status, target_stage: status === 'target' ? (f.target_stage || null) : null, monthly_fee: f.monthly_fee === '' ? null : Number(f.monthly_fee), since_on: f.since_on || (status === 'active' ? today() : null), notes: f.notes || null };
    try { if (el.dataset.id) await upd('project_clients', el.dataset.id, row); else await ins('project_clients', { ...row, project_id: el.dataset.pid }); closeSheet(); doRefresh(); } catch (e) { fail(e); }
  },
  async 'client-archive'(el) { closeSheet(); await archiveWithUndo('project_clients', el.dataset.id, 'العميل اتنقل للأرشيف'); },

  // ---- الدفعات ----
  'pay-new'(el) { paySheet({ cid: el.dataset.cid }); },
  'pay-open'(el) { paySheet({ incId: el.dataset.id }); },
  'pay-kind'(el) {
    el.closest('[data-group]').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
    sheetEl().querySelector('[data-box=sub]').hidden = el.dataset.v !== 'sub';
    payCalc();
  },
  'pay-dur'(el) {
    el.closest('[data-group]').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
    const box = sheetEl().querySelector('[data-box=months]'); box.hidden = el.dataset.v !== 'x';
    if (el.dataset.v === 'x') box.querySelector('input').focus();
    payCalc();
  },
  'pay-client'(el) { const s = sheetEl(); if (s._pay?.auto) s.querySelector('[name=covers_from]').value = s._pay.starts[el.value]; payCalc(); },
  'pay-calc'() { payCalc(); },
  'pay-amt'() { const P = sheetEl()._pay; if (P) P.auto = false; },   // كتبت المبلغ بإيدك؟ خلاص مش هنغيّره
  async 'pay-save'(el) {
    const s = sheetEl(), P = s._pay, f = formOf(s);
    const amount = parseFloat(f.amount); if (!amount) return toast('اكتب المبلغ');
    const kind = picked('paykind') || 'sub';
    const c = P.clients.find(x => x.id === f.client); if (!c) return toast('اختار العميل');
    let months = null, from = null, to = null;
    if (kind === 'sub') { months = payMonths(); from = f.covers_from || today(); to = coversTo(from, months); }
    const p = await one('projects', c.project_id);
    const label = kind === 'sub' ? `اشتراك ${durLabel(months)}` : PAYK[kind];
    const row = { amount, received_on: f.received_on || today(), source: `${label} · ${c.name}${p ? ' · ' + p.name : ''}`, project_client_id: c.id,
      pay_kind: kind, months, covers_from: from, covers_to: to, pay_note: f.pay_note || null };
    try {
      if (el.dataset.id) await upd('incomes', el.dataset.id, row);
      else {
        await ins('incomes', row);
        if (c.status !== 'active') await upd('project_clients', c.id, { status: 'active', target_stage: null, since_on: c.since_on || row.received_on });   // دفع = بقى عميل شغال
      }
      closeSheet(); toast(el.dataset.id ? 'اتعدلت' : kind === 'sub' ? `اتسجلت. مشترك لحد ${fd(to)}` : 'الدفعة دخلت فلوسي'); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'pay-archive'(el) { closeSheet(); await archiveWithUndo('incomes', el.dataset.id, 'الدفعة اتشالت'); },
};
