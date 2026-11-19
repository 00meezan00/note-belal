// الأهداف والأفكار
import { list, one, ins, upd, rpc, link } from './db.js';
import { esc, ic, bat, fd, today, dueText, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, opts, sw, n } from './ui.js';
import { AREAS, taskRow, openTask, stepsBlock, linksSlot, archiveWithUndo, doRefresh } from './comps.js';
import { goalCard } from './today.js';

const STAGES = [['raw', 'خام'], ['developing', 'بتتطور'], ['ready', 'جاهزة']];
const tabState = { tab: 'active', area: '' };

function goalSheet(g = {}) {
  openSheet(g.id ? 'تعديل الهدف' : 'هدف جديد', `
    <label class="field"><span>الهدف</span><input name="title" value="${esc(g.title)}" placeholder="مثلًا: تقليل وقت التسليم لـ 24 ساعة" autofocus></label>
    <div class="grid2"><label class="field"><span>المجال</span><select name="area">${opts(AREAS, g.area || AREAS[0])}</select></label>
    <label class="field"><span>الموعد</span><input type="date" name="due_on" value="${g.due_on || ''}"></label></div>
    <label class="field"><span>ليه الهدف ده؟ وهتقيسه إزاي؟</span><textarea name="why" rows="3">${esc(g.why)}</textarea></label>
    <button class="btn pri" data-act="goal-save" data-id="${g.id || ''}">حفظ</button>`);
}
function ideaSheet() {
  openSheet('فكرة جديدة', `<label class="field"><span>الفكرة</span><input name="title" autofocus placeholder="اكتبها زي ما هي، هتوسعها بعدين"></label>
    <label class="field"><span>المجال (اختياري)</span><select name="area"><option value="">من غير</option>${opts(AREAS)}</select></label>
    <button class="btn pri" data-act="idea-create">حفظ</button>`);
}

export default {
  goals: {
    dock: 'goals',
    async render(p) {
      if (p.query.tab) tabState.tab = p.query.tab;
      const [goals, prog, ideas] = await Promise.all([list('goals', { order: 'due_on' }), list('v_goal_progress'), list('ideas', { order: 'created_at', asc: false })]);
      const P = Object.fromEntries(prog.map(x => [x.id, x]));
      const cnt = s => goals.filter(g => g.status === s).length;
      const openIdeas = ideas.filter(i => i.stage !== 'converted');
      const tab = tabState.tab;
      let body;
      if (tab === 'ideas') {
        const byStage = k => openIdeas.filter(i => i.stage === k);
        body = STAGES.map(([k, l]) => { const L = byStage(k); return `<div class="sec">${l} <span class="mut num">${L.length}</span></div>${L.length ? L.map(i => ideaCard(i)).join('') : empty(k === 'raw' ? 'سجّل أي فكرة من المايك تحت، أو من زرار "فكرة".' : k === 'developing' ? 'لما تبدأ توسّع فكرة، غيّر مرحلتها لـ"بتتطور".' : 'الفكرة الجاهزة بتتحول لهدف بضغطة.')}`; }).join('')
          + (ideas.length > openIdeas.length ? `<details><summary class="mut" style="min-height:44px;cursor:pointer">اتحولت لأهداف (${ideas.length - openIdeas.length})</summary><div class="stack">${ideas.filter(i => i.stage === 'converted').map(i => ideaCard(i)).join('')}</div></details>` : '');
      } else {
        let L = goals.filter(g => g.status === tab && (!tabState.area || g.area === tabState.area));
        if (tab === 'done') L.sort((a, b) => (b.done_on || '').localeCompare(a.done_on || ''));
        body = `<select class="inp" data-change="goal-area" aria-label="المجال"><option value="">كل المجالات</option>${opts(AREAS, tabState.area)}</select>`
          + (L.length ? L.map(g => goalCard(g, P[g.id])).join('') : empty(tab === 'active' ? 'مفيش أهداف نشطة. اعمل هدف جديد، أو حوّل فكرة جاهزة لهدف.' : 'مفيش حاجة هنا لسه.'));
      }
      return {
        title: 'الأهداف', sub: `${cnt('active')} نشطة · ${cnt('done')} اتحققت`,
        fab: tab === 'ideas' ? { label: 'فكرة', act: 'idea-new' } : { label: 'هدف', act: 'goal-new' },
        html: `<div class="stack"><div class="seg">
          ${[['ideas', 'أفكار', openIdeas.length], ['active', 'نشطة', cnt('active')], ['done', 'اتحققت', cnt('done')], ['paused', 'متوقفة', cnt('paused')]].map(([k, l, c]) => `<button class="${tab === k ? 'on' : ''}" data-act="goal-tab" data-v="${k}">${l} <span class="num">${c}</span></button>`).join('')}
        </div>${body}</div>`,
      };
    },
    actions: {
      'goal-tab'(el) { tabState.tab = el.dataset.v; doRefresh(); },
      'goal-area'(el) { tabState.area = el.value; doRefresh(); },
      'goal-new': () => goalSheet(),
      'idea-new': () => ideaSheet(),
    },
  },

  goal: {
    async render(p) {
      const g = await one('goals', p.id);
      if (!g) return { title: 'الهدف', back: '#/goals', html: empty('الهدف ده مش موجود، يمكن اتنقل للأرشيف.') };
      const [steps, prog, metrics, tl] = await Promise.all([
        list('plan_steps', { eq: { parent_type: 'goal', parent_id: g.id }, order: 'sort' }),
        list('v_goal_progress', { eq: { id: g.id } }),
        list('company_metrics', { order: 'sort' }),
        list('links', { eq: { to_type: 'goal', to_id: g.id, from_type: 'task' } }),
      ]);
      const tasks = tl.length ? await list('tasks', { in: ['id', tl.map(l => l.from_id)], order: 'due_on' }) : [];
      const pr = prog[0] || {}; const late = g.status === 'active' && g.due_on && g.due_on < today();
      const metric = metrics.find(m => m.id === g.metric_id);
      return {
        title: 'هدف', sub: g.area, back: '#/goals',
        html: `<div class="stack" style="padding-bottom:20px">
          <div class="disp" style="font-size:24px;line-height:1.4">${esc(g.title)}</div>
          <div class="card stack" style="gap:8px">${bat(pr.progress || 0, g.status === 'done' ? 'done' : late ? 'late' : 'run')}
            <div class="between mut"><span>${pr.steps_total ? `${pr.steps_done} من ${pr.steps_total} خطوات` : 'ضيف خطوات تحت'}</span><span class="${late ? 'late' : ''}">${g.status === 'done' ? 'اتحقق ' + fd(g.done_on) : g.status === 'paused' ? 'متوقف' : g.due_on ? 'الموعد ' + fd(g.due_on) + ' · ' + dueText(g.due_on) : 'من غير موعد'}</span></div></div>
          ${g.status === 'done' ? `<div class="card" style="border-color:var(--ok)"><b>اتحقق في ${fd(g.done_on)}</b>${g.impact ? `<div>${esc(g.impact)}</div>` : ''}</div>` : `
          <div class="card row">${ic('bell', 22)}<div style="flex:1;line-height:1.4"><div style="font-weight:500">تذكير يومي</div><div class="mut">لحد ما الهدف يتحقق</div></div>
            <input type="time" class="inp" style="width:auto;min-height:40px" value="${g.reminder_time ? g.reminder_time.slice(0, 5) : '09:00'}" data-change="goal-remind-time" aria-label="الساعة">
            ${sw(g.reminder_enabled, 'data-act="goal-remind"')}</div>`}
          ${g.why ? `<div class="card"><div class="mut" style="font-weight:600">ليه؟</div><div style="white-space:pre-wrap">${esc(g.why)}</div></div>` : ''}
          ${stepsBlock('goal', g.id, steps)}
          <div class="card" style="padding:4px 14px"><div class="between" style="padding-top:8px"><span style="font-weight:600">مهام الهدف</span><button class="btn sm" data-act="goal-task">${ic('plus', 16)}مهمة</button></div>
            <div class="list">${tasks.map(t => taskRow(t, { showStar: false })).join('') || '<div class="mut" style="padding:10px 0">مفيش مهام مربوطة. اعمل مهمة للنهاردة من هنا.</div>'}</div></div>
          ${metric ? `<div class="card row">${ic('co', 20)}<div class="mut" style="flex:1">لما يتحقق: <b style="color:var(--ink)">${esc(metric.label)}</b> هيبقى <b class="num" style="color:var(--ink)">${n(g.metric_target)}</b></div></div>` : ''}
          ${linksSlot('goal', g.id)}
          <div class="btns">${g.status === 'done' ? `<button class="btn" data-act="goal-reopen">رجّعه نشط</button>` : `<button class="btn amb" data-act="goal-done-ask">اتحقق الهدف</button><button class="btn" data-act="goal-pause">${g.status === 'paused' ? 'كمّل' : 'وقّف'}</button>`}</div>
          <div class="btns"><button class="btn sm" data-act="goal-edit">${ic('edit', 16)}تعديل</button><button class="btn sm" data-act="goal-archive">${ic('archive', 16)}أرشيف</button></div>
        </div>`,
        _g: g, _metrics: metrics,
      };
    },
    after(main, p) { main._goalId = p.id; },
    actions: {
      async 'goal-edit'(el, p) { goalSheet(await one('goals', p.id)); },
      async 'goal-remind'(el, p) { try { await upd('goals', p.id, { reminder_enabled: !el.classList.contains('on'), reminder_time: document.querySelector('[data-change=goal-remind-time]')?.value || '09:00' }); doRefresh(); } catch (e) { fail(e); } },
      async 'goal-remind-time'(el, p) { try { await upd('goals', p.id, { reminder_time: el.value }); toast('ميعاد التذكير اتغير'); } catch (e) { fail(e); } },
      async 'goal-task'(el, p) { const g = await one('goals', p.id); openTask(null, { _link: { type: 'goal', id: g.id, title: g.title } }); },
      async 'goal-pause'(el, p) { const g = await one('goals', p.id); try { await upd('goals', p.id, { status: g.status === 'paused' ? 'active' : 'paused' }); doRefresh(); } catch (e) { fail(e); } },
      async 'goal-reopen'(el, p) { try { await upd('goals', p.id, { status: 'active' }); doRefresh(); } catch (e) { fail(e); } },
      async 'goal-archive'(el, p) { await archiveWithUndo('goals', p.id, 'الهدف اتنقل للأرشيف', () => (location.hash = '#/goals')); },
      async 'goal-done-ask'(el, p) {
        const [g, metrics] = await Promise.all([one('goals', p.id), list('company_metrics', { order: 'sort' })]);
        openSheet('مبروك! اتحقق', `
          <label class="field"><span>إيه اللي اتغير في الشركة بعد الهدف ده؟</span><textarea name="impact" rows="3" autofocus>${esc(g.impact)}</textarea></label>
          <div class="grid2"><label class="field"><span>حدّث مؤشر (اختياري)</span><select name="metric_id"><option value="">من غير</option>${opts(metrics.map(m => [m.id, `${m.label} (${n(m.value)})`]), g.metric_id)}</select></label>
          <label class="field"><span>القيمة الجديدة</span><input name="metric_target" inputmode="decimal" value="${g.metric_target ?? ''}"></label></div>
          <p class="mut" style="margin:0">هيتسجل في سجل تطورات الشركة لوحده.</p>
          <button class="btn amb" data-act="goal-done">تأكيد</button>`);
      },
      async 'goal-done'(el, p) {
        const f = formOf(sheetEl());
        try {
          await upd('goals', p.id, { impact: f.impact || null, metric_id: f.metric_id || null, metric_target: f.metric_target === '' ? null : Number(f.metric_target) });
          await upd('goals', p.id, { status: 'done' });
          closeSheet(); toast('اتسجل في تطورات الشركة'); doRefresh();
        } catch (e) { fail(e); }
      },
    },
  },

  idea: {
    async render(p) {
      const i = await one('ideas', p.id);
      if (!i) return { title: 'فكرة', back: '#/goals?tab=ideas', html: empty('الفكرة دي مش موجودة.') };
      const steps = await list('plan_steps', { eq: { parent_type: 'idea', parent_id: i.id }, order: 'sort' });
      const idx = STAGES.findIndex(s => s[0] === i.stage);
      return {
        title: 'فكرة', sub: (i.source === 'voice' ? 'من تسجيل صوتي · ' : '') + fd(i.created_at), back: '#/goals?tab=ideas',
        html: `<div class="stack" style="padding-bottom:20px">
          <input class="disp" value="${esc(i.title)}" data-change="idea-title" aria-label="عنوان الفكرة" style="font-size:23px;border:0;background:transparent;padding:0;line-height:1.4">
          ${i.stage === 'converted' ? `<a class="card row" href="#/goal/${i.converted_goal_id}" style="border-color:var(--ok)">${ic('goal', 20)}<span style="flex:1">الفكرة دي بقت هدف</span>${ic('chev', 18)}</a>` : `
          <div class="steps-line">${STAGES.map(([k, l], j) => `${j ? `<span class="ln${j <= idx ? ' on' : ''}"></span>` : ''}<button class="stg${j < idx ? ' past' : j === idx ? ' on' : ''}" data-act="idea-stage" data-v="${k}">${l}</button>`).join('')}</div>`}
          <label class="card field"><span class="mut">التفاصيل: ليه؟ هتفيد بإيه؟</span><textarea data-change="idea-body" rows="4" style="border:0;padding:0;min-height:80px;background:transparent">${esc(i.body)}</textarea></label>
          <label class="card field"><span class="mut">محتاجة إيه؟ وإيه المخاطر؟</span><textarea data-change="idea-risks" rows="3" style="border:0;padding:0;min-height:60px;background:transparent">${esc(i.needs_risks)}</textarea></label>
          ${stepsBlock('idea', i.id, steps, 'الخطة المبدئية')}
          <label class="field"><span>المجال</span><select data-change="idea-area"><option value="">من غير</option>${opts(AREAS, i.area)}</select></label>
          ${linksSlot('idea', i.id)}
          <div class="btns">${i.stage !== 'converted' ? `<button class="btn pri" data-act="idea-convert">حوّلها لهدف</button>` : ''}<button class="btn" data-act="idea-archive">${ic('archive', 18)}أرشيف</button></div>
          <p class="mut" style="text-align:center;margin:0">الكلام بيتحفظ لوحده أول ما تخلص كتابة.</p>
        </div>`,
      };
    },
    actions: {
      async 'idea-stage'(el, p) { try { await upd('ideas', p.id, { stage: el.dataset.v }); doRefresh(); } catch (e) { fail(e); } },
      async 'idea-title'(el, p) { if (el.value.trim()) try { await upd('ideas', p.id, { title: el.value.trim() }); toast('اتحفظ'); } catch (e) { fail(e); } },
      async 'idea-body'(el, p) { try { await upd('ideas', p.id, { body: el.value.trim() || null }); toast('اتحفظ'); } catch (e) { fail(e); } },
      async 'idea-risks'(el, p) { try { await upd('ideas', p.id, { needs_risks: el.value.trim() || null }); toast('اتحفظ'); } catch (e) { fail(e); } },
      async 'idea-area'(el, p) { try { await upd('ideas', p.id, { area: el.value || null }); } catch (e) { fail(e); } },
      async 'idea-convert'(el, p) { try { const gid = await rpc('convert_idea_to_goal', { p_idea: p.id }); toast('بقت هدف. حدد الموعد'); location.hash = `#/goal/${gid}`; } catch (e) { fail(e); } },
      async 'idea-archive'(el, p) { await archiveWithUndo('ideas', p.id, 'الفكرة اتنقلت للأرشيف', () => (location.hash = '#/goals?tab=ideas')); },
    },
  },
};

function ideaCard(i) {
  return `<a class="card stack" style="gap:6px" href="#/idea/${i.id}"><div class="between"><span class="chip">${esc(i.area || 'من غير مجال')}</span><span class="mut">${fd(i.created_at)}</span></div>
    <div class="title">${esc(i.title)}</div>${i.body ? `<div class="mut">${esc(i.body.slice(0, 110))}${i.body.length > 110 ? '…' : ''}</div>` : ''}</a>`;
}

// actions الشيتات (بتشتغل من أي شاشة)
export const goalGlobal = {
  async 'goal-save'(el) {
    const f = formOf(sheetEl()); if (!f.title) return toast('اكتب الهدف');
    try {
      const row = { title: f.title, area: f.area, due_on: f.due_on || null, why: f.why || null };
      if (el.dataset.id) { await upd('goals', el.dataset.id, row); closeSheet(); doRefresh(); }
      else { const g = await ins('goals', row); closeSheet(); location.hash = `#/goal/${g.id}`; }
    } catch (e) { fail(e); }
  },
  async 'idea-create'() {
    const f = formOf(sheetEl()); if (!f.title) return toast('اكتب الفكرة');
    try { await ins('ideas', { title: f.title, area: f.area || null }); closeSheet(); doRefresh(); } catch (e) { fail(e); }
  },
};
