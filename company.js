// الشركة: الوضع الحالي، المؤشرات، سجل التطورات
import { list, single, ins, upd, upsert } from './db.js';
import { esc, ic, fd, fMonth, today, n, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail } from './ui.js';
import { archiveWithUndo, doRefresh } from './comps.js';

export default {
  company: {
    dock: 'company',
    async render() {
      const [c, metrics, log, team, done, active, prog] = await Promise.all([
        single('company'), list('company_metrics', { order: 'sort' }), list('company_log', { order: 'happened_on', asc: false, limit: 120 }),
        list('team_members', { eq: { active: true } }), list('goals', { eq: { status: 'done' } }), list('goals', { eq: { status: 'active' } }), list('v_goal_progress')]);
      const P = Object.fromEntries(prog.map(p => [p.id, p.progress]));
      const avg = active.length ? Math.round(active.reduce((s, g) => s + (P[g.id] || 0), 0) / active.length) : 0;
      let cur = '', tl = '';
      log.forEach(x => {
        const m = x.happened_on.slice(0, 7);
        if (m !== cur) { if (cur) tl += '</div>'; cur = m; tl += `<div class="mut" style="font-weight:600;margin:10px 0 8px">${fMonth(x.happened_on)}</div><div class="tl">`; }
        const auto = x.kind !== 'manual';
        tl += `<div class="it${auto ? ' auto' : ''}" data-act="log-open" data-id="${x.id}" role="button" tabindex="0"><div class="mut">${fd(x.happened_on)}${x.kind === 'goal' ? ' · من هدف' : x.kind === 'hire' ? ' · تعيين' : x.kind === 'metric' ? ' · مؤشر' : ''}</div><div style="line-height:1.55">${esc(x.text)}</div></div>`;
      });
      if (cur) tl += '</div>';
      return {
        title: c?.name || 'الشركة', sub: c?.branches || '',
        html: `<div class="stack">
          <a class="card row" href="#/progress" style="gap:12px;background:var(--dock);border-color:var(--dock);color:#fff">${ic('chart', 24)}<div style="flex:1;line-height:1.45"><div style="font-weight:600">تقدّم الشركة</div><div style="font-size:13px;color:#C9D2D9">${active.length ? `ماشيين ناحية أهدافنا <b class="num" style="color:#fff">${avg}%</b> · ${active.length} هدف شغال` : 'روحنا فين وقدامنا قد إيه'}</div></div>${ic('chev', 18)}</a>
          <div class="card"><div class="between"><span class="sec" style="margin:0">الوضع الحالي</span><button class="btn sm" data-act="co-edit">تعديل</button></div>
            <div style="margin-top:6px;line-height:1.75;white-space:pre-wrap">${c?.status_text ? esc(c.status_text) : '<span class="mut">اكتب صورة الشركة النهاردة: الأجهزة، العملاء، الفريق.</span>'}</div></div>
          <div class="between"><span class="sec">المؤشرات</span><button class="btn sm" data-act="metric-new">${ic('plus', 16)}مؤشر</button></div>
          <div class="grid2">
            ${metrics.map(m => `<button class="card" style="padding:12px" data-act="metric-open" data-id="${m.id}"><div class="num" style="font-size:26px;line-height:1.2">${n(m.value)}</div><div class="mut">${esc(m.label)}${m.unit ? ' · ' + esc(m.unit) : ''}</div></button>`).join('')}
            <div class="card" style="padding:12px"><div class="num" style="font-size:26px;line-height:1.2">${team.length}</div><div class="mut">أفراد التيم · تلقائي</div></div>
            <div class="card" style="padding:12px"><div class="num" style="font-size:26px;line-height:1.2">${done.length}</div><div class="mut">أهداف اتحققت · تلقائي</div></div>
          </div>
          <div class="card"><div class="between"><span class="sec" style="margin:0">سجل التطورات</span><button class="btn sm" data-act="log-new">${ic('plus', 16)}تطور</button></div>
            ${tl || '<div class="mut" style="padding:10px 0">كل هدف يتحقق، أو مؤشر يتغير، أو حد يتعيّن، بيتسجل هنا لوحده بتاريخه.</div>'}</div>
        </div>`,
      };
    },
    actions: {
      async 'co-edit'() {
        const c = await single('company') || {};
        openSheet('بيانات الشركة', `<label class="field"><span>الاسم</span><input name="name" value="${esc(c.name || 'Fix Team')}"></label>
          <label class="field"><span>الفروع</span><input name="branches" value="${esc(c.branches)}"></label>
          <label class="field"><span>الوضع الحالي</span><textarea name="status_text" rows="7" autofocus>${esc(c.status_text)}</textarea></label>
          <button class="btn pri" data-act="co-save">حفظ</button>`);
      },
      async 'co-save'() {
        const f = formOf(sheetEl());
        try { await upsert('company', { name: f.name || 'Fix Team', branches: f.branches || null, status_text: f.status_text || null }, 'user_id'); closeSheet(); doRefresh(); } catch (e) { fail(e); }
      },
      'metric-new'() { metricSheet({}); },
      async 'metric-open'(el) { const m = (await list('company_metrics', { eq: { id: el.dataset.id } }))[0]; m && metricSheet(m); },
      async 'metric-save'(el) {
        const f = formOf(sheetEl()); if (!f.label) return toast('اكتب اسم المؤشر');
        const row = { label: f.label, value: f.value === '' ? null : Number(f.value), unit: f.unit || null };
        try { if (el.dataset.id) await upd('company_metrics', el.dataset.id, row); else await ins('company_metrics', { ...row, sort: Date.now() % 1e9 }); closeSheet(); doRefresh(); } catch (e) { fail(e); }
      },
      async 'metric-archive'(el) { closeSheet(); await archiveWithUndo('company_metrics', el.dataset.id, 'المؤشر اتنقل للأرشيف'); },
      'log-new'() { logSheet({ happened_on: today() }); },
      async 'log-open'(el) { const x = (await list('company_log', { eq: { id: el.dataset.id } }))[0]; x && logSheet(x); },
      async 'log-save'(el) {
        const f = formOf(sheetEl()); if (!f.text) return toast('اكتب التطور');
        try { const row = { happened_on: f.happened_on || today(), text: f.text }; if (el.dataset.id) await upd('company_log', el.dataset.id, row); else await ins('company_log', row); closeSheet(); doRefresh(); } catch (e) { fail(e); }
      },
      async 'log-archive'(el) { closeSheet(); await archiveWithUndo('company_log', el.dataset.id, 'اتشال من السجل'); },
    },
  },
};

function metricSheet(m) {
  openSheet(m.id ? 'المؤشر' : 'مؤشر جديد', `<label class="field"><span>اسم المؤشر</span><input name="label" value="${esc(m.label)}" placeholder="مثلًا: محلات جملة متعاقدة" autofocus></label>
    <div class="grid2"><label class="field"><span>القيمة الحالية</span><input name="value" inputmode="decimal" value="${m.value ?? ''}"></label><label class="field"><span>الوحدة</span><input name="unit" value="${esc(m.unit)}" placeholder="جهاز / محل"></label></div>
    ${m.id ? '<p class="mut" style="margin:0">لو غيّرت القيمة، التغيير هيتسجل في سجل التطورات لوحده.</p>' : ''}
    <div class="btns">${m.id ? `<button class="btn" data-act="metric-archive" data-id="${m.id}">${ic('archive', 18)}أرشيف</button>` : ''}<button class="btn pri" data-act="metric-save" data-id="${m.id || ''}">حفظ</button></div>`);
}
function logSheet(x) {
  openSheet(x.id ? 'تطور' : 'تطور جديد', `<label class="field"><span>التاريخ</span><input type="date" name="happened_on" value="${x.happened_on}"></label>
    <label class="field"><span>إيه اللي حصل؟</span><textarea name="text" rows="4" autofocus>${esc(x.text)}</textarea></label>
    <div class="btns">${x.id ? `<button class="btn" data-act="log-archive" data-id="${x.id}">${ic('archive', 18)}شيله</button>` : ''}<button class="btn pri" data-act="log-save" data-id="${x.id || ''}">حفظ</button></div>`);
}
