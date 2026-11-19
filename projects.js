// مشاريعي: سيستمات وتطبيقات وبرامج وألعاب ومشاريع شخصية
import { list, one, ins, upd, del, rpc } from './db.js';
import { esc, ic, bat, fd, today, n, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, opts } from './ui.js';
import { stepsBlock, linksSlot, archiveWithUndo, doRefresh, openTask } from './comps.js';

export const PKIND = { system: 'سيستم', app: 'تطبيق', program: 'برنامج', game: 'لعبة', other: 'حاجة تانية' };
export const DSTAGE = [['idea', 'فكرة'], ['plan', 'خطة'], ['building', 'بيتنفذ'], ['applied', 'اتطبق']];
const DTAG = { idea: 'out', plan: '', building: 'amb', applied: 'ok' };
const TSTAGE = { to_contact: ['هتواصل', 'out'], offer_sent: ['عرض اتبعت', 'amb'], thinking: ['بيفكر', ''] };
const st = { kind: '', tab: 'devs', stage: '' };

function pipe(devs) {
  const cols = { idea: 'background:var(--paper);border:1px dashed var(--mut)', plan: 'background:var(--mat)', building: 'background:var(--amb);color:#15202B', applied: 'background:var(--ok);color:#fff' };
  return `<div class="row" style="gap:6px">${DSTAGE.map(([k, l]) => `<div style="flex:1;border-radius:10px;padding:6px 4px;text-align:center;${cols[k]}"><div class="num" style="font-size:17px;line-height:1.2">${devs.filter(d => d.stage === k).length}</div><div style="font-size:11px">${l}</div></div>`).join('')}</div>`;
}

function projectSheet(p = {}) {
  openSheet(p.id ? 'تعديل المشروع' : 'مشروع جديد', `
    <label class="field"><span>الاسم</span><input name="name" value="${esc(p.name)}" autofocus placeholder="مثلًا: سيستم مبيعات ومخزن للمحلات"></label>
    <div class="grid2"><label class="field"><span>النوع</span><select name="kind">${opts(Object.entries(PKIND), p.kind || 'system')}</select></label>
    <label class="field"><span>لمين؟</span><input name="audience" value="${esc(p.audience)}" placeholder="للمحلات، للشركات…"></label></div>
    <label class="row card" style="padding:12px 14px"><input type="checkbox" name="is_personal" ${p.is_personal ? 'checked' : ''} style="width:22px;height:22px"><span style="flex:1">مشروع شخصي ليا أنا (من غير عملاء)</span></label>
    <label class="field"><span>بدأته إمتى</span><input type="date" name="started_on" value="${p.started_on || ''}"></label>
    <label class="field"><span>وصف مختصر</span><textarea name="description" rows="3">${esc(p.description)}</textarea></label>
    <button class="btn pri" data-act="proj-save" data-id="${p.id || ''}">حفظ</button>`);
}
function devSheet(projectId) {
  openSheet('فكرة تطوير', `<label class="field"><span>التطوير</span><input name="title" autofocus placeholder="مثلًا: تقرير أرباح يومي على الواتساب"></label>
    <label class="field"><span>تفاصيل (اختياري)</span><textarea name="details" rows="3"></textarea></label>
    <button class="btn pri" data-act="dev-create" data-pid="${projectId}">حفظ</button>`);
}
function clientSheet(projectId, c = {}) {
  const status = c.status || 'target';
  openSheet(c.id ? esc(c.name) : 'عميل جديد', `
    <label class="field"><span>الاسم</span><input name="name" value="${esc(c.name)}" ${c.id ? '' : 'autofocus'} placeholder="مثلًا: محل النور للموبايلات"></label>
    <div class="field"><span>الحالة</span><div class="pills" data-group="cstatus">${[['active', 'عميل شغال'], ['target', 'مستهدف'], ['ended', 'وقف'], ['lost', 'رفض']].map(([k, l]) => `<button type="button" data-v="${k}" class="${status === k ? 'on' : ''}" data-act="pick">${l}</button>`).join('')}</div></div>
    <label class="field"><span>لو مستهدف: وصلت لفين؟</span><select name="target_stage"><option value="">—</option>${opts(Object.entries(TSTAGE).map(([k, v]) => [k, v[0]]), c.target_stage)}</select></label>
    <div class="grid2"><label class="field"><span>الاشتراك الشهري</span><input name="monthly_fee" inputmode="decimal" value="${c.monthly_fee ?? ''}" placeholder="جنيه"></label>
    <label class="field"><span>من إمتى</span><input type="date" name="since_on" value="${c.since_on || ''}"></label></div>
    <label class="field"><span>ملاحظات</span><textarea name="notes" rows="2">${esc(c.notes)}</textarea></label>
    ${c.id && status === 'active' ? `<div class="card row" style="padding:10px 14px">${ic('wallet', 20)}<span style="flex:1">استلمت دفعة؟ بتدخل فلوسي كدخل</span><button class="btn sm amb" data-act="client-pay" data-id="${c.id}" data-fee="${c.monthly_fee ?? ''}">سجّل دفعة</button></div>` : ''}
    <div class="btns">${c.id ? `<button class="btn" data-act="client-archive" data-id="${c.id}">${ic('archive', 18)}أرشيف</button>` : ''}<button class="btn pri" data-act="client-save" data-id="${c.id || ''}" data-pid="${projectId}">حفظ</button></div>`);
}

export default {
  projects: {
    async render() {
      const [projects, devs, clients] = await Promise.all([list('projects', { order: 'created_at', asc: false }), list('project_devs'), list('project_clients')]);
      const active = clients.filter(c => c.status === 'active').length, targets = clients.filter(c => c.status === 'target').length;
      const kinds = [...new Set(projects.map(p => p.kind))];
      const L = projects.filter(p => !st.kind || (st.kind === 'personal' ? p.is_personal : p.kind === st.kind));
      return {
        title: 'مشاريعي', sub: 'سيستمات وتطبيقات وبرامج وألعاب', back: '#/today',
        fab: { label: 'مشروع', act: 'proj-new' },
        html: `<div class="stack">
          <div class="grid3">${[[projects.length, 'مشاريع'], [active, 'عملاء شغالين'], [targets, 'مستهدفين']].map(([v, l]) => `<div class="card" style="padding:12px"><div class="num" style="font-size:26px;line-height:1.2">${v}</div><div class="mut">${l}</div></div>`).join('')}</div>
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
      const [devs, clients] = await Promise.all([list('project_devs', { eq: { project_id: pr.id }, order: 'created_at', asc: false }), list('project_clients', { eq: { project_id: pr.id }, order: 'name' })]);
      const act = clients.filter(c => c.status === 'active'), tgt = clients.filter(c => c.status === 'target'), other = clients.filter(c => c.status === 'ended' || c.status === 'lost');
      const tab = pr.is_personal ? 'devs' : st.tab;
      let body = '';
      if (tab === 'devs') {
        const L = devs.filter(d => !st.stage || d.stage === st.stage);
        body = `<div class="pills"><button class="${st.stage ? '' : 'on'}" data-act="ds" data-v="">الكل ${devs.length}</button>${DSTAGE.map(([k, l]) => `<button class="${st.stage === k ? 'on' : ''}" data-act="ds" data-v="${k}">${l} ${devs.filter(d => d.stage === k).length}</button>`).join('')}</div>`
          + (L.length ? L.map(d => `<a class="card stack" style="gap:8px" href="#/dev/${d.id}"><div class="between" style="align-items:flex-start"><div class="title" style="font-size:15px">${esc(d.title)}</div><span class="tag ${DTAG[d.stage]}">${DSTAGE.find(s => s[0] === d.stage)[1]}</span></div>${d.details ? `<div class="mut">${esc(d.details.slice(0, 100))}</div>` : ''}${d.stage === 'applied' && d.applied_on ? `<div class="mut">اتطبق ${fd(d.applied_on)}</div>` : ''}</a>`).join('')
            : empty('سجّل أي فكرة تطوير للمشروع ده. هتمشي فكرة، بعدين خطة، بعدين بيتنفذ، بعدين اتطبق.'));
      } else {
        const row = c => `<button class="lnk" data-act="client-open" data-id="${c.id}"><span class="k disp" style="font-size:16px">${esc(c.name.trim()[0] || '؟')}</span><span class="t">${esc(c.name)}<small>${c.status === 'active' ? (c.since_on ? 'من ' + fd(c.since_on) : 'عميل شغال') + (c.monthly_fee ? ` · ${n(c.monthly_fee)} ج في الشهر` : '') : esc(c.notes || '')}</small></span>${c.status === 'target' && c.target_stage ? `<span class="tag ${TSTAGE[c.target_stage][1]}">${TSTAGE[c.target_stage][0]}</span>` : ''}</button>`;
        const box = (t, L, hint) => `<div class="card" style="padding:8px 14px"><div class="between" style="padding-top:4px"><b style="font-weight:600">${t}</b><span class="num mut">${L.length}</span></div><div class="list">${L.map(row).join('') || `<div class="mut" style="padding:8px 0">${hint}</div>`}</div></div>`;
        body = box('العملاء الحاليين', act, 'لسه مفيش عملاء.') + box('المستهدفين', tgt, 'ضيف المحلات أو الشركات اللي ناوي تعرض عليهم.') + (other.length ? box('وقفوا أو رفضوا', other, '') : '');
      }
      return {
        title: pr.name, sub: `${PKIND[pr.kind]}${pr.audience ? ' · ' + pr.audience : ''}${pr.started_on ? ' · من ' + fd(pr.started_on) : ''}`, back: '#/projects',
        fab: tab === 'devs' ? { label: 'فكرة تطوير', act: 'dev-new' } : { label: 'عميل', act: 'client-new' },
        html: `<div class="stack">
          ${pr.description ? `<div class="mut" style="font-size:14px;line-height:1.7">${esc(pr.description)}</div>` : ''}
          <div class="card row" style="padding:12px 6px">${(pr.is_personal ? [[devs.length, 'تطوير'], [devs.filter(d => d.stage === 'applied').length, 'اتطبق']] : [[act.length, 'عملاء'], [tgt.length, 'مستهدفين'], [devs.length, 'تطوير']]).map(([v, l]) => `<div style="flex:1;text-align:center"><div class="num" style="font-size:22px;line-height:1.2">${v}</div><div class="mut">${l}</div></div>`).join('')}</div>
          ${pr.is_personal ? '' : `<div class="seg"><button class="${tab === 'devs' ? 'on' : ''}" data-act="pt" data-v="devs">التطويرات</button><button class="${tab === 'clients' ? 'on' : ''}" data-act="pt" data-v="clients">العملاء والمستهدفين</button></div>`}
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
    const row = { name: f.name, kind: f.kind, audience: f.audience || null, is_personal: !!f.is_personal, started_on: f.started_on || null, description: f.description || null };
    try {
      if (el.dataset.id) { await upd('projects', el.dataset.id, row); closeSheet(); doRefresh(); }
      else { const p = await ins('projects', row); closeSheet(); location.hash = `#/project/${p.id}`; }
    } catch (e) { fail(e); }
  },
  async 'dev-create'(el) {
    const f = formOf(sheetEl()); if (!f.title) return toast('اكتب التطوير');
    try { await ins('project_devs', { project_id: el.dataset.pid, title: f.title, details: f.details || null }); closeSheet(); doRefresh(); } catch (e) { fail(e); }
  },
  async 'client-save'(el) {
    const s = sheetEl(); const f = formOf(s); if (!f.name) return toast('اكتب اسم العميل');
    const status = s.querySelector('[data-group=cstatus] .on')?.dataset.v || 'target';
    const row = { name: f.name, status, target_stage: status === 'target' ? (f.target_stage || null) : null, monthly_fee: f.monthly_fee === '' ? null : Number(f.monthly_fee), since_on: f.since_on || (status === 'active' ? today() : null), notes: f.notes || null };
    try { if (el.dataset.id) await upd('project_clients', el.dataset.id, row); else await ins('project_clients', { ...row, project_id: el.dataset.pid }); closeSheet(); doRefresh(); } catch (e) { fail(e); }
  },
  'client-pay'(el) {
    openSheet('سجّل دفعة', `<label class="field"><span>المبلغ</span><input name="amount" inputmode="decimal" value="${el.dataset.fee}" autofocus></label>
      <label class="field"><span>التاريخ</span><input type="date" name="on" value="${today()}"></label>
      <p class="mut" style="margin:0">هتدخل فلوسي كدخل، ومكتوب عليها اسم العميل والمشروع.</p>
      <button class="btn amb" data-act="client-pay-save" data-id="${el.dataset.id}">سجّل</button>`);
  },
  async 'client-pay-save'(el) {
    const f = formOf(sheetEl()); const a = parseFloat(f.amount); if (!a) return toast('اكتب المبلغ');
    try { await rpc('record_client_payment', { p_client: el.dataset.id, p_amount: a, p_on: f.on || today() }); closeSheet(); toast('الدفعة دخلت فلوسي'); doRefresh(); } catch (e) { fail(e); }
  },
  async 'client-archive'(el) { closeSheet(); await archiveWithUndo('project_clients', el.dataset.id, 'العميل اتنقل للأرشيف'); },
};
