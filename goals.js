// الأهداف والأفكار
import { list, one, ins, upd, rpc, link, linksOf, goalNumber } from './db.js';
import { esc, ic, bat, fd, today, dueText, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, opts, sw, n } from './ui.js';
import { taskRow, openTask, stepsBlock, linksSlot, archiveWithUndo, doRefresh } from './comps.js';
import { goalCard } from './today.js';
import { remindField, readRemind, remindSheetActions, remindCard, remindActions, remindChip } from './remind.js';
import { lifeData, taPicker, taRow, taValue, taLabel, taOptions, inTA } from './life.js';
import { goalWizard, smartCheck, missingTag, wizGlobal } from './goalwiz.js';
import { courseLate } from './more.js';
import { habitStats } from './habits.js';

const STAGES = [['raw', 'خام'], ['developing', 'بتتطور'], ['ready', 'جاهزة']];
// فكرة نايمة: بقالها 30 يوم أو أكتر محدش لمسها (لا اتعدلت ولا اتغيرت مرحلتها). بيرجع عدد الأيام، أو 0 لو صاحية
export const SLEEP_DAYS = 30;
export function dormantDays(r, doneStages = ['converted', 'applied']) {
  if (!r || doneStages.includes(r.stage)) return 0;
  const last = Date.parse(r.updated_at || r.created_at); if (!last) return 0;
  const d = Math.floor((Date.now() - last) / 864e5);
  return d >= SLEEP_DAYS ? d : 0;
}
const tabState = { tab: 'active', area: '' };

// ---------- اللي بيخدم الهدف: كورسات، عادات، مشاريع، مشاكل ----------
const SERVE = { course: 'كورس', habit: 'عادة', project: 'مشروع', problem: 'مشكلة' };
async function servedCard(g) {
  const ls = (await linksOf('goal', g.id)).filter(l => SERVE[l.type]);
  const t = today(), ms = t.slice(0, 7) + '-01', issues = [];
  const rows = [];
  for (const l of ls) {
    let info = '', bad = false;
    if (l.type === 'course') {
      const lt = courseLate(l.row), took = Object.values(l.row.sessions || {}).filter(v => v === 'done').length;
      info = lt.days ? `متأخر ${lt.days} يوم` : l.row.status === 'done' ? 'خلص' : took ? `أخدت ${took} ميعاد` : 'لسه مبدأتش'; bad = !!lt.days;
      if (bad) issues.push(`متأخر ${lt.days} يوم على كورس «${l.title}»`);
    } else if (l.type === 'habit') {
      const h = await habitStats(ms, t, [l.id]); info = h.planned ? `التزامك الشهر ده ${h.pct}%` : 'لسه مفيش أيام عليها'; bad = h.planned >= 3 && h.pct < 50;
      if (bad) issues.push(`العادة «${l.title}» نازلة (${h.pct}%)`);
    } else if (l.type === 'project') {
      const devs = await list('project_devs', { eq: { project_id: l.id } }); info = devs.length ? `اتطبق ${devs.filter(x => x.stage === 'applied').length} من ${devs.length} تطوير` : 'لسه مفيش تطويرات';
    } else {
      info = l.row.status === 'solved' ? 'اتحلت' : l.row.status === 'solving' ? 'بتتحل' : 'لسه مفتوحة'; bad = l.row.status === 'open';
      if (bad) issues.push(`المشكلة «${l.title}» لسه مفتوحة`);
    }
    rows.push(`<div class="row" style="gap:8px;padding:8px 0"><span class="chip">${SERVE[l.type]}</span><span style="flex:1;line-height:1.4">${esc(l.title)}<br><small class="${bad ? 'late' : 'mut'}">${info}</small></span><button class="star" data-act="link-del" data-id="${l.link}" aria-label="شيل الربط">${ic('x', 16)}</button></div>`);
  }
  const sum = !ls.length ? '' : issues.length ? `<div class="late" style="font-size:14px;line-height:1.6">${issues.slice(0, 2).map(esc).join('<br>')}</div>` : '<div style="color:var(--ok);font-size:14px">كل اللي بيخدم الهدف ماشي كويس</div>';
  return `<div class="card" style="padding:10px 14px"><div class="between"><b style="font-weight:600">بيخدم الهدف</b><button class="btn sm" data-act="serve-pick">${ic('plus', 16)}اربط</button></div>
    ${sum}<div class="list">${rows.join('') || '<div class="mut" style="padding:8px 0;font-size:14px">اربط بالهدف الكورسات والعادات والمشاريع اللي بتخدمه، والمشاكل اللي بيحلها.</div>'}</div></div>`;
}

async function ideaSheet() {
  const d = await lifeData();
  openSheet('فكرة جديدة', `<label class="field"><span>الفكرة</span><input name="title" autofocus placeholder="اكتبها زي ما هي، هتوسعها بعدين"></label>
    ${taPicker(d, '', { label: 'المسار والمجال (اختياري)' })}
    ${remindField()}
    <button class="btn pri" data-act="idea-create">حفظ</button>`);
}

export default {
  goals: {
    dock: 'goals',
    async render(p) {
      if (p.query.tab) tabState.tab = p.query.tab;
      const [goals, prog, ideas, d] = await Promise.all([list('goals', { order: 'due_on' }), list('v_goal_progress'), list('ideas', { order: 'created_at', asc: false }), lifeData()]);
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
        let L = goals.filter(g => g.status === tab && inTA(g, tabState.area));
        if (tab === 'done') L.sort((a, b) => (b.done_on || '').localeCompare(a.done_on || ''));
        body = `<select class="inp" data-change="goal-area" aria-label="المسار"><option value="">كل المسارات</option>${taOptions(d, tabState.area)}</select>`
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
      const d = await lifeData(), sc = smartCheck(g), num = goalNumber(g), served = await servedCard(g);
      const pr = prog[0] || {}; const late = g.status === 'active' && g.due_on && g.due_on < today();
      const metric = metrics.find(m => m.id === g.metric_id);
      return {
        title: 'هدف', sub: taLabel(g, d) || g.area, back: '#/goals',
        html: `<div class="stack" style="padding-bottom:20px">
          <div class="row" style="gap:8px;align-items:flex-start"><div class="disp" style="font-size:24px;line-height:1.4;flex:1">${esc(g.title)}</div>${missingTag(g)}</div>
          ${g.status !== 'done' && !sc.ok ? `<div class="card stack" style="gap:8px;border-color:var(--amb);border-width:1.5px"><div class="row" style="gap:6px"><b style="flex:1">الهدف فيه ${sc.score} من 5 مواصفات بس</b></div>
            <div class="row" style="flex-wrap:wrap;gap:6px">${sc.items.map(i => `<span class="tag ${i.ok ? 'ok' : ''}">${i.ok ? '✓' : '✗'} ${i.label}</span>`).join('')}</div>
            <button class="btn amb sm" data-act="goal-fix" data-step="${sc.first}">كمّل المواصفات</button></div>` : ''}
          <div class="card stack" style="gap:8px">${bat(pr.progress || 0, g.status === 'done' ? 'done' : late ? 'late' : 'run')}
            ${num ? `<div class="row" style="gap:8px;flex-wrap:wrap"><span style="flex:1;line-height:1.5"><b>${esc(num.label)}</b>: <span class="num">${n(num.now)}</span>${esc(num.unit ? ' ' + num.unit : '')}<br><small class="mut">بدأت ${n(num.start)} · الهدف ${n(num.target)} · النسبة محسوبة من الرقم</small></span>
              ${g.status === 'done' ? '' : `<label class="row" style="gap:6px"><span class="mut" style="font-size:13px">وصلت لكام؟</span><input class="inp num" inputmode="decimal" style="width:90px;min-height:38px" value="${num.now}" data-change="goal-num"></label>`}</div>` : ''}
            <div class="between mut"><span>${num ? '' : pr.steps_total ? `${pr.steps_done} من ${pr.steps_total} خطوات` : 'ضيف خطوات تحت'}</span><span class="${late ? 'late' : ''}">${g.status === 'done' ? 'اتحقق ' + fd(g.done_on) : g.status === 'paused' ? 'متوقف' : g.due_on ? 'الموعد ' + fd(g.due_on) + ' · ' + dueText(g.due_on) : 'من غير موعد'}</span></div></div>
          ${g.status === 'done' ? `<div class="card" style="border-color:var(--ok)"><b>اتحقق في ${fd(g.done_on)}</b>${g.impact ? `<div>${esc(g.impact)}</div>` : ''}</div>` : `
          <div class="card row">${ic('bell', 22)}<div style="flex:1;line-height:1.4"><div style="font-weight:500">تذكير يومي</div><div class="mut">لحد ما الهدف يتحقق</div></div>
            <input type="time" class="inp" style="width:auto;min-height:40px" value="${g.reminder_time ? g.reminder_time.slice(0, 5) : '09:00'}" data-change="goal-remind-time" aria-label="الساعة">
            ${sw(g.reminder_enabled, 'data-act="goal-remind"')}</div>`}
          ${g.why ? `<div class="card"><div class="mut" style="font-weight:600">ليه؟</div><div style="white-space:pre-wrap">${esc(g.why)}</div></div>` : ''}
          ${stepsBlock('goal', g.id, steps)}
          <div class="card" style="padding:4px 14px"><div class="between" style="padding-top:8px"><span style="font-weight:600">مهام الهدف</span><button class="btn sm" data-act="goal-task">${ic('plus', 16)}مهمة</button></div>
            <div class="list">${tasks.map(t => taskRow(t, { showStar: false })).join('') || '<div class="mut" style="padding:10px 0">مفيش مهام مربوطة. اعمل مهمة للنهاردة من هنا.</div>'}</div></div>
          ${served}
          ${linksSlot('goal', g.id, Object.keys(SERVE))}
          <div class="btns">${g.status === 'done' ? `<button class="btn" data-act="goal-reopen">رجّعه نشط</button>` : `<button class="btn amb" data-act="goal-done-ask">اتحقق الهدف</button><button class="btn" data-act="goal-pause">${g.status === 'paused' ? 'كمّل' : 'وقّف'}</button>`}</div>
          <div class="btns"><button class="btn sm" data-act="goal-edit">${ic('edit', 16)}تعديل</button><button class="btn sm" data-act="goal-archive">${ic('archive', 16)}أرشيف</button></div>
        </div>`,
        _g: g, _metrics: metrics,
      };
    },
    after(main, p) { main._goalId = p.id; },
    actions: {
      async 'goal-edit'(el, p) { goalWizard(await one('goals', p.id), 1); },
      async 'goal-fix'(el, p) { goalWizard(await one('goals', p.id), Number(el.dataset.step) || 1); },
      // "وصلت لكام؟": لو الرقم من أرقام الشركة بيتحدّث هناك (ويتسجل في تطورات الشركة)، ولو رقم خاص بالهدف بيتحدّث في الهدف
      async 'goal-num'(el, p) {
        const v = Number(el.value); if (el.value.trim() === '' || isNaN(v)) return;
        const g = await one('goals', p.id);
        try { if (g.metric_id) await upd('company_metrics', g.metric_id, { value: v }); else await upd('goals', p.id, { kpi_current: v }); toast('اتحدّث'); doRefresh(); } catch (e) { fail(e); }
      },
      async 'serve-pick'(el, p) {
        const [courses, habits, projects, problems, have] = await Promise.all([list('courses', { order: 'title' }), list('habits', { order: 'sort' }), list('projects', { order: 'name' }), list('problems', { order: 'created_at', asc: false }), linksOf('goal', p.id)]);
        const got = new Set(have.map(l => l.type + l.id));
        const grp = (type, L, name) => { L = L.filter(r => !got.has(type + r.id)); return L.length ? `<div class="sec" style="margin:8px 0 2px">${SERVE[type]}</div>${L.map(r => `<button class="lnk" data-act="serve-link" data-t="${type}" data-id="${r.id}"><span class="t">${esc(r[name])}</span>${ic('plus', 16)}</button>`).join('')}` : ''; };
        const body = grp('course', courses.filter(c => c.status !== 'wishlist'), 'title') + grp('habit', habits.filter(h => h.active !== false), 'title') + grp('project', projects, 'name') + grp('problem', problems.filter(x => x.status !== 'solved'), 'title');
        openSheet('اربط بالهدف', `<div class="list">${body || '<div class="mut" style="padding:8px 0">مفيش حاجة تتربط. اعمل كورس أو عادة أو مشروع الأول.</div>'}</div>`);
      },
      async 'serve-link'(el, p) { try { await link('goal', p.id, el.dataset.t, el.dataset.id); closeSheet(); toast('اتربط'); doRefresh(); } catch (e) { fail(e); } },
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
      const D = await lifeData();
      const idx = STAGES.findIndex(s => s[0] === i.stage);
      return {
        title: 'فكرة', sub: (i.source === 'voice' ? 'من تسجيل صوتي · ' : '') + fd(i.created_at), back: '#/goals?tab=ideas',
        html: `<div class="stack" style="padding-bottom:20px">
          <input class="disp" value="${esc(i.title)}" data-change="idea-title" aria-label="عنوان الفكرة" style="font-size:23px;border:0;background:transparent;padding:0;line-height:1.4">
          ${i.stage === 'converted' ? `<a class="card row" href="#/goal/${i.converted_goal_id}" style="border-color:var(--ok)">${ic('goal', 20)}<span style="flex:1">الفكرة دي بقت هدف</span>${ic('chev', 18)}</a>` : `
          <div class="steps-line">${STAGES.map(([k, l], j) => `${j ? `<span class="ln${j <= idx ? ' on' : ''}"></span>` : ''}<button class="stg${j < idx ? ' past' : j === idx ? ' on' : ''}" data-act="idea-stage" data-v="${k}">${l}</button>`).join('')}</div>`}
          ${i.stage === 'converted' ? '' : remindCard('idea', i)}
          <label class="card field"><span class="mut">التفاصيل: ليه؟ هتفيد بإيه؟</span><textarea data-change="idea-body" rows="4" style="border:0;padding:0;min-height:80px;background:transparent">${esc(i.body)}</textarea></label>
          <label class="card field"><span class="mut">محتاجة إيه؟ وإيه المخاطر؟</span><textarea data-change="idea-risks" rows="3" style="border:0;padding:0;min-height:60px;background:transparent">${esc(i.needs_risks)}</textarea></label>
          ${stepsBlock('idea', i.id, steps, 'الخطة المبدئية')}
          ${taPicker(D, taValue(i), { attrs: 'data-change="idea-area"' })}
          ${linksSlot('idea', i.id)}
          <div class="btns">${i.stage !== 'converted' ? `<button class="btn pri" data-act="idea-convert">حوّلها لهدف</button>` : ''}<button class="btn" data-act="idea-archive">${ic('archive', 18)}أرشيف</button></div>
          <p class="mut" style="text-align:center;margin:0">الكلام بيتحفظ لوحده أول ما تخلص كتابة.</p>
        </div>`,
      };
    },
    actions: {
      ...remindActions,
      async 'idea-stage'(el, p) { try { await upd('ideas', p.id, { stage: el.dataset.v }); doRefresh(); } catch (e) { fail(e); } },
      async 'idea-title'(el, p) { if (el.value.trim()) try { await upd('ideas', p.id, { title: el.value.trim() }); toast('اتحفظ'); } catch (e) { fail(e); } },
      async 'idea-body'(el, p) { try { await upd('ideas', p.id, { body: el.value.trim() || null }); toast('اتحفظ'); } catch (e) { fail(e); } },
      async 'idea-risks'(el, p) { try { await upd('ideas', p.id, { needs_risks: el.value.trim() || null }); toast('اتحفظ'); } catch (e) { fail(e); } },
      async 'idea-area'(el, p) { try { await upd('ideas', p.id, taRow(el.value, await lifeData(), 'area')); toast('اتحفظ'); } catch (e) { fail(e); } },
      async 'idea-convert'(el, p) { try { const gid = await rpc('convert_idea_to_goal', { p_idea: p.id }); toast('بقت هدف. حدد الموعد'); location.hash = `#/goal/${gid}`; } catch (e) { fail(e); } },
      async 'idea-archive'(el, p) { await archiveWithUndo('ideas', p.id, 'الفكرة اتنقلت للأرشيف', () => (location.hash = '#/goals?tab=ideas')); },
    },
  },
};

function ideaCard(i) {
  const bell = i.stage === 'converted' ? '' : remindChip(i), zz = dormantDays(i);
  return `<a class="card stack" style="gap:6px" href="#/idea/${i.id}"><div class="between"><span class="chip">${esc(i.area || 'من غير مجال')}</span><span class="row" style="gap:6px">${zz ? `<span class="tag">نايمة من ${zz} يوم</span>` : ''}<span class="mut">${fd(i.created_at)}</span></span></div>
    <div class="title">${esc(i.title)}</div>${i.body ? `<div class="mut">${esc(i.body.slice(0, 110))}${i.body.length > 110 ? '…' : ''}</div>` : ''}${bell}</a>`;
}

// actions الشيتات (بتشتغل من أي شاشة)
export const goalGlobal = {
  ...remindSheetActions,
  ...remindActions,
  ...wizGlobal,
  async 'idea-create'() {
    const f = formOf(sheetEl()); if (!f.title) return toast('اكتب الفكرة');
    const r = readRemind();
    try { await ins('ideas', { title: f.title, ...taRow(f.ta, await lifeData(), 'area'), ...r }); closeSheet(); toast(r.remind_on ? 'اتحفظت، وهيوصلك تذكير' : 'اتحفظت'); doRefresh(); } catch (e) { fail(e); }
  },
};
