// مساعد كتابة الهدف: بيسألك سؤال سؤال عشان الهدف يطلع فيه المواصفات الخمسة
// (محدد، بيتقاس، ممكن، مهم وليه، وليه ميعاد). وفيه كمان "هدف سريع" لما تبقى مستعجل.
import { list, one, ins, upd, link } from './db.js';
import { esc, ic, fd, today, addDays, n, openSheet, closeSheet, sheetEl, toast, fail, opts } from './ui.js';
import { doRefresh } from './comps.js';
import { lifeData, taPicker, taRow, taValue, taLabel } from './life.js';

export const MAX_PER_TRACK = 3;   // أكتر من كده في نفس المسار = تنبيه
const VAGUE = /(أحسن|احسن|أكتر|اكتر|أكثر|اكثر|تطوير|أطور|اطور|تحسين|أحسّن|احسن|كويس|أفضل|افضل|شوية|زيادة)/;
export const vagueWord = s => (String(s || '').match(VAGUE) || [])[0] || '';

// المواصفات الخمسة: كل واحدة بتقول هي في أنهي خطوة من المساعد
export function smartCheck(g) {
  const t = String(g.title || '').trim(), hasNum = g.metric_target != null && (g.metric_id || g.kpi_label);
  const items = [
    { k: 'specific', label: 'محدد', ok: t.length >= 6 && (!vagueWord(t) || /\d/.test(t) || hasNum), step: 1, tip: 'الهدف فيه كلمة مطاطة. حط رقم أو حاجة واضحة' },
    { k: 'measurable', label: 'بيتقاس برقم', ok: !!hasNum, step: 2, tip: 'مفيش رقم توصله' },
    { k: 'achievable', label: 'ممكن تحققه', ok: !!(g.resources || g.needs), step: 3, tip: 'مكتبتش عندك إيه يساعدك وإيه ناقصك' },
    { k: 'relevant', label: 'مهم وليه', ok: !!(g.why && g.track_id), step: g.track_id ? 4 : 1, tip: g.track_id ? 'مكتبتش ليه الهدف ده مهم' : 'مختارتش المسار' },
    { k: 'time', label: 'ليه ميعاد', ok: !!g.due_on, step: 5, tip: 'مفيش ميعاد' },
  ];
  const score = items.filter(i => i.ok).length;
  return { items, score, ok: score === 5, first: (items.find(i => !i.ok) || {}).step || 7 };
}
export const missingTag = g => g.status !== 'done' && !smartCheck(g).ok ? '<span class="tag amb">ناقص</span>' : '';

// ---------------- الهدف السريع ----------------
export async function quickGoal() {
  const d = await lifeData();
  openSheet('هدف سريع', `
    <label class="field"><span>الهدف</span><input name="title" autofocus placeholder="اكتبه زي ما هو، هتكمّله بعدين"></label>
    ${taPicker(d, '', { none: '' })}
    <label class="field"><span>الميعاد (اختياري)</span><input type="date" name="due_on"></label>
    <p class="mut" style="margin:0;font-size:13px">هيتحفظ وعليه علامة "ناقص"، ومن جوّاه تدوس "كمّل المواصفات".</p>
    <button class="btn pri" data-act="qgoal-save">حفظ</button>`);
}
export function goalChooser() {
  openSheet('هدف جديد', `
    <button class="card row" style="gap:12px;text-align:start" data-act="wiz-new">${ic('goal', 24)}<div style="flex:1;line-height:1.5"><b>هدف كامل</b><div class="mut" style="font-size:13px">7 أسئلة صغيرة، والهدف يطلع مظبوط</div></div>${ic('chev', 18)}</button>
    <button class="card row" style="gap:12px;text-align:start" data-act="qgoal-new">${ic('spark', 24)}<div style="flex:1;line-height:1.5"><b>هدف سريع</b><div class="mut" style="font-size:13px">سطر واحد ومسار، وتكمّله بعدين</div></div>${ic('chev', 18)}</button>`);
}

// ---------------- المساعد ----------------
let W = null, D = null, M = [], G = [];
const STEPS = 7;
const isFix = () => /fix/i.test(D.T[taRow(W.ta, D).track_id]?.name || '');

export async function goalWizard(g = null, step = 1) {
  [D, M, G] = await Promise.all([lifeData(), list('company_metrics', { order: 'sort' }), list('goals', { eq: { status: 'active' } })]);
  const mode = g?.metric_id ? 'company' : g?.kpi_label ? 'new' : g?.id ? 'none' : '';
  W = { id: g?.id || null, title: g?.title || '', ta: taValue(g), mode, metric_id: g?.metric_id || '', metric_start: g?.metric_start ?? '', metric_target: g?.metric_target ?? '',
    kpi_label: g?.kpi_label || '', kpi_unit: g?.kpi_unit || '', kpi_current: g?.kpi_current ?? '', inCompany: null, resources: g?.resources || '', needs: g?.needs || '', why: g?.why || '',
    due_on: g?.due_on || '', steps: ['', '', ''], task: '', task_on: today(), step };
  openSheet(g?.id ? 'راجع هدفك' : 'هدف جديد', `<div id="wiz" class="stack"></div>`);
  draw();
}
const box = () => sheetEl().querySelector('#wiz');
const val = name => box()?.querySelector(`[name="${name}"]`);
function grab() {
  const b = box(); if (!b) return;
  b.querySelectorAll('[name]').forEach(f => {
    const k = f.name;
    if (k.startsWith('st')) W.steps[Number(k.slice(2))] = f.value.trim();
    else if (k === 'inCompany') W.inCompany = f.checked;
    else W[k] = f.value.trim();
  });
}
const dots = () => `<div class="row" style="gap:4px">${Array.from({ length: STEPS }, (_, i) => `<span style="flex:1;height:5px;border-radius:3px;background:${i < W.step ? 'var(--ink)' : 'var(--line)'}"></span>`).join('')}</div><div class="mut" style="font-size:12px">خطوة ${W.step} من ${STEPS}</div>`;
const nav = (next = 'التالي') => `<div class="btns">${W.step > 1 ? `<button class="btn" data-act="wiz-go" data-v="${W.step - 1}">رجوع</button>` : ''}<button class="btn pri" data-act="wiz-go" data-v="${W.step + 1}">${next}</button></div>
  ${W.step < STEPS ? `<button class="btn sm" style="align-self:center;border:0;background:none" data-act="wiz-go" data-v="${STEPS}">روح للخلاصة على طول</button>` : ''}`;
const ask = (q, sub = '') => `<div><div class="disp" style="font-size:20px;line-height:1.4">${q}</div>${sub ? `<div class="mut" style="font-size:13px;margin-top:2px">${sub}</div>` : ''}</div>`;

function measureText(w = W) {
  if (w.mode === 'company') { const m = M.find(x => x.id === w.metric_id); return m ? `${m.label}: من ${n(w.metric_start)} لـ ${n(w.metric_target)}${m.unit ? ' ' + m.unit : ''}` : ''; }
  if (w.mode === 'new' && w.kpi_label) return `${w.kpi_label}: من ${n(w.kpi_current)} لـ ${n(w.metric_target)}${w.kpi_unit ? ' ' + w.kpi_unit : ''}`;
  return '';
}
// شكل الهدف لو اتحفظ دلوقتي (عشان نفحص المواصفات)
function asGoal() {
  const ta = taRow(W.ta, D);
  const num = v => v === '' || v == null ? null : Number(v);
  return { title: W.title, track_id: ta.track_id, why: W.why, due_on: W.due_on || null, resources: W.resources, needs: W.needs,
    metric_target: W.mode === 'company' || W.mode === 'new' ? num(W.metric_target) : null, metric_id: W.mode === 'company' ? W.metric_id || null : null, kpi_label: W.mode === 'new' ? W.kpi_label : null };
}

function draw() {
  const b = box(); if (!b) return;
  let h = dots();
  if (W.step === 1) {
    const vw = vagueWord(W.title);
    h += ask('هدفك إيه؟', 'اكتبه بكلامك، زي ما بتقوله لنفسك')
      + `<textarea class="inp" name="title" rows="3" data-input="wiz-title" placeholder="مثلًا: نقلل المرتجعات لـ 4% من الأجهزة" style="font-size:16px;line-height:1.7">${esc(W.title)}</textarea>
        <div id="wiz-hint" class="card" style="padding:10px 12px;background:var(--amb-soft);border-color:var(--amb);font-size:14px" ${vw ? '' : 'hidden'}>${vw ? `كلمة <b>«${esc(vw)}»</b> مطاطة. ${esc(vw)} قد إيه بالظبط؟ حط رقم، أو هتحدده في الخطوة الجاية.` : ''}</div>
        ${taPicker(D, W.ta, { label: 'تبع أنهي مسار؟', none: '' })}` + nav();
  } else if (W.step === 2) {
    const modes = [...(M.length ? [['company', 'رقم من أرقام الشركة']] : []), ['new', 'رقم جديد'], ['none', 'من غير رقم']];
    if (!W.mode) W.mode = M.length ? 'company' : 'new';
    if (W.inCompany === null) W.inCompany = isFix();
    const m = M.find(x => x.id === W.metric_id);
    h += ask('هتعرف إنك وصلت إزاي؟', 'الرقم بيخلّي الهدف واضح، ونسبة الهدف بتتحسب منه')
      + `<div class="pills">${modes.map(([k, l]) => `<button type="button" class="${W.mode === k ? 'on' : ''}" data-act="wiz-mode" data-v="${k}">${l}</button>`).join('')}</div>`;
    if (W.mode === 'company') h += `<label class="field"><span>أنهي رقم؟</span><select name="metric_id" data-change="wiz-metric"><option value="">اختار</option>${opts(M.map(x => [x.id, `${x.label} (دلوقتي ${n(x.value)}${x.unit ? ' ' + x.unit : ''})`]), W.metric_id)}</select></label>
        ${m ? `<div class="grid2"><label class="field"><span>إنت فين دلوقتي</span><input name="metric_start" inputmode="decimal" value="${esc(W.metric_start === '' ? m.value ?? '' : W.metric_start)}"></label><label class="field"><span>عايز توصل لكام</span><input name="metric_target" inputmode="decimal" value="${esc(W.metric_target)}" placeholder="${esc(m.unit || '')}"></label></div>` : ''}`;
    else if (W.mode === 'new') h += `<div class="grid2"><label class="field"><span>هتقيس إيه؟</span><input name="kpi_label" value="${esc(W.kpi_label)}" placeholder="نسبة المرتجعات"></label><label class="field"><span>الوحدة</span><input name="kpi_unit" value="${esc(W.kpi_unit)}" placeholder="% أو جهاز أو جنيه"></label></div>
        <div class="grid2"><label class="field"><span>إنت فين دلوقتي</span><input name="kpi_current" inputmode="decimal" value="${esc(W.kpi_current)}" placeholder="8"></label><label class="field"><span>عايز توصل لكام</span><input name="metric_target" inputmode="decimal" value="${esc(W.metric_target)}" placeholder="4"></label></div>
        ${W.id ? '' : `<label class="row card" style="padding:10px 12px;gap:8px"><input type="checkbox" name="inCompany" ${W.inCompany ? 'checked' : ''} style="width:20px;height:20px"><span style="flex:1;font-size:14px">يظهر في أرقام الشركة وتقرير المالك</span></label>`}`;
    else h += `<div class="card mut" style="font-size:14px">تمام. نسبة الهدف هتتحسب من الخطوات اللي بتخلص.</div>`;
    h += nav();
  } else if (W.step === 3) {
    const tid = taRow(W.ta, D).track_id, same = G.filter(g => g.track_id === tid && g.id !== W.id);
    h += ask('تقدر تحققه؟', 'فكّر في اللي معاك واللي ناقصك')
      + (tid && same.length >= MAX_PER_TRACK ? `<div class="card" style="padding:10px 12px;background:var(--amb-soft);border-color:var(--amb);font-size:14px;line-height:1.6">عندك <b>${same.length}</b> أهداف شغالة في «${esc(D.T[tid]?.name || '')}». متأكد إنك هتقدر تشتغل على هدف كمان؟
          <div class="row" style="gap:6px;margin-top:8px"><button class="btn sm" data-act="wiz-go" data-v="4">أيوه، كمّل</button><button class="btn sm" data-act="wiz-later">لأ، هأجله</button></div></div>` : '')
      + `<label class="field"><span>عندك إيه يساعدك؟</span><textarea name="resources" rows="2" placeholder="ناس، وقت، فلوس، خبرة…">${esc(W.resources)}</textarea></label>
        <label class="field"><span>ناقصك إيه؟</span><textarea name="needs" rows="2" placeholder="محتاج إيه عشان توصل؟">${esc(W.needs)}</textarea></label>` + nav();
  } else if (W.step === 4) {
    h += ask('ليه الهدف ده مهم؟', 'لو حققته، إيه اللي هيتغير؟') + `<textarea class="inp" name="why" rows="4" placeholder="مثلًا: المرتجعات بتاكل من المكسب وبتزعّل المحلات">${esc(W.why)}</textarea>` + nav();
  } else if (W.step === 5) {
    const far = W.due_on && W.due_on > addDays(today(), 183);
    h += ask('هتحققه إمتى؟') + `<div class="pills">${[[30, 'شهر'], [91, '3 شهور'], [182, '6 شهور']].map(([k, l]) => `<button type="button" data-act="wiz-due" data-v="${k}">${l}</button>`).join('')}</div>
        <input class="inp" type="date" name="due_on" value="${esc(W.due_on)}" data-change="wiz-due-in">
        ${far ? `<div class="card" style="padding:10px 12px;background:var(--amb-soft);border-color:var(--amb);font-size:14px">الميعاد بعيد (أكتر من 6 شهور). جرّب تقسّمه: هدف أصغر توصله في 3 شهور، وبعده هدف تاني.</div>` : ''}` + nav();
  } else if (W.step === 6) {
    h += ask('هتبدأ إزاي؟', W.id ? 'خطوات جديدة تتضاف للخطة (اختياري)' : 'أول 3 خطوات، وأول مهمة تعملها')
      + `<div class="stack" style="gap:6px">${[0, 1, 2].map(i => `<input class="inp" name="st${i}" value="${esc(W.steps[i])}" placeholder="خطوة ${i + 1}">`).join('')}</div>
        <div class="grid2"><label class="field"><span>أول مهمة</span><input name="task" value="${esc(W.task)}" placeholder="مثلًا: أحصر مرتجعات الشهر"></label><label class="field"><span>يوم</span><input type="date" name="task_on" value="${esc(W.task_on)}"></label></div>` + nav();
  } else {
    const c = smartCheck(asGoal()), mt = measureText();
    h += ask(c.ok ? 'هدفك جاهز' : `هدفك فيه ${c.score} من 5 مواصفات`, c.ok ? 'فيه كل المواصفات' : 'تقدر تحفظه، وهيفضل عليه علامة "ناقص" لحد ما تكمّله')
      + `<div class="card stack" style="gap:6px"><b style="font-size:16px">${esc(W.title || 'من غير اسم')}</b>
          <div class="mut" style="font-size:13px">${esc(taLabel(taRow(W.ta, D), D) || 'من غير مسار')}${W.due_on ? ' · لحد ' + fd(W.due_on) : ''}</div>${mt ? `<div style="font-size:14px">${esc(mt)}</div>` : ''}</div>
        <div class="card list" style="padding:4px 14px">${c.items.map(i => `<div class="row" style="gap:8px;padding:8px 0"><span style="width:22px;height:22px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:${i.ok ? 'var(--ok)' : 'var(--line)'};color:#fff">${i.ok ? ic('check', 14) : ''}</span><span style="flex:1">${i.label}${i.ok ? '' : `<br><small class="mut">${i.tip}</small>`}</span>${i.ok ? '' : `<button class="btn sm" data-act="wiz-go" data-v="${i.step}">كمّلها</button>`}</div>`).join('')}</div>
        <div class="btns"><button class="btn" data-act="wiz-go" data-v="6">رجوع</button><button class="btn pri" data-act="wiz-save">حفظ</button></div>`;
  }
  b.innerHTML = h;
}

async function saveGoal(extra = {}) {
  grab();
  if (!W.title) { W.step = 1; draw(); return toast('اكتب الهدف'); }
  const ta = taRow(W.ta, D, 'area');
  if (!ta.track_id) { W.step = 1; draw(); return toast('اختار المسار'); }
  const num = v => v === '' || v == null || isNaN(Number(v)) ? null : Number(v);
  const row = { title: W.title, track_id: ta.track_id, area_id: ta.area_id, area: ta.area, why: W.why || null, due_on: W.due_on || null, resources: W.resources || null, needs: W.needs || null,
    metric_id: null, metric_start: null, metric_target: null, kpi_label: null, kpi_unit: null, ...extra };
  if (W.mode === 'company' && W.metric_id) {
    const m = M.find(x => x.id === W.metric_id);
    Object.assign(row, { metric_id: W.metric_id, metric_start: num(W.metric_start) ?? num(m?.value), metric_target: num(W.metric_target) });
  } else if (W.mode === 'new' && W.kpi_label) {
    if (!W.id && W.inCompany) {   // الرقم يتضاف لأرقام الشركة، والهدف بيتحدّث لما تحدّثه هناك
      const met = await ins('company_metrics', { label: W.kpi_label, unit: W.kpi_unit || null, value: num(W.kpi_current), sort: Date.now() % 1e9 });
      Object.assign(row, { metric_id: met.id, metric_start: num(W.kpi_current), metric_target: num(W.metric_target) });
    } else Object.assign(row, { kpi_label: W.kpi_label, kpi_unit: W.kpi_unit || null, kpi_current: num(W.kpi_current), metric_start: num(W.metric_start) ?? num(W.kpi_current), metric_target: num(W.metric_target) });
  }
  let g;
  if (W.id) { const old = await one('goals', W.id); if (W.mode === 'new' && old?.kpi_label) { row.metric_start = old.metric_start ?? row.metric_start; row.kpi_current = old.kpi_current ?? row.kpi_current; } g = await upd('goals', W.id, row); }
  else g = await ins('goals', row);
  for (const s of W.steps.filter(Boolean)) await ins('plan_steps', { parent_type: 'goal', parent_id: g.id, text: s, sort: Date.now() % 1e9 });
  if (W.task) { const t = await ins('tasks', { title: W.task, due_on: W.task_on || today() }); await link('task', t.id, 'goal', g.id); }
  return g;
}

export const wizGlobal = {
  'goal-new': () => goalChooser(),
  'wiz-new'() { goalWizard(); },
  'qgoal-new'() { quickGoal(); },
  async 'qgoal-save'() {
    const s = sheetEl(), f = Object.fromEntries([...s.querySelectorAll('[name]')].map(x => [x.name, x.value.trim()]));
    if (!f.title) return toast('اكتب الهدف');
    const d = await lifeData(), ta = taRow(f.ta, d, 'area'); if (!ta.track_id) return toast('اختار المسار');
    try { const g = await ins('goals', { title: f.title, ...ta, due_on: f.due_on || null }); closeSheet(); toast('اتحفظ. كمّل مواصفاته وقت ما تفضى'); location.hash = `#/goal/${g.id}`; } catch (e) { fail(e); }
  },
  'wiz-go'(el) { grab(); W.step = Math.max(1, Math.min(STEPS, Number(el.dataset.v))); draw(); box()?.scrollIntoView({ block: 'start' }); },
  'wiz-title'(el) {
    const h = document.getElementById('wiz-hint'), vw = vagueWord(el.value); if (!h) return;
    h.hidden = !vw; if (vw) h.innerHTML = `كلمة <b>«${esc(vw)}»</b> مطاطة. ${esc(vw)} قد إيه بالظبط؟ حط رقم، أو هتحدده في الخطوة الجاية.`;
  },
  'wiz-mode'(el) { grab(); W.mode = el.dataset.v; draw(); },
  'wiz-metric'(el) { grab(); W.metric_start = ''; draw(); },
  'wiz-due'(el) { grab(); W.due_on = addDays(today(), Number(el.dataset.v)); draw(); },
  'wiz-due-in'() { grab(); draw(); },
  async 'wiz-later'() { try { const g = await saveGoal({ status: 'paused' }); if (!g) return; closeSheet(); toast('اتحفظ في الأهداف المتوقفة. رجّعه لما تخلص حاجة من اللي شغالة'); doRefresh(); } catch (e) { fail(e); } },
  async 'wiz-save'() {
    try {
      const g = await saveGoal(); if (!g) return;
      const wasNew = !W.id; closeSheet(); toast(smartCheck(g).ok ? 'الهدف اتحفظ كامل' : 'اتحفظ، وعليه علامة "ناقص"');
      if (wasNew) location.hash = `#/goal/${g.id}`; else doRefresh();
    } catch (e) { fail(e); }
  },
};
