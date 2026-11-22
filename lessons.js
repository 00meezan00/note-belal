// الدروس والقرارات: كل قرار مهم بسببه والمتوقع منه وميعاد نراجعه فيه، وكل درس اتعلمته من مشكلة أو موقف
import { list, one, ins, upd } from './db.js';
import { esc, ic, fd, today, addDays, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, dueText } from './ui.js';
import { linksSlot, fillLinks, archiveWithUndo, doRefresh } from './comps.js';
import { lifeData, taPicker, taRow, taValue, taLabel } from './life.js';
import { withMentions } from './mentions.js';

const st = { tab: 'decisions' };
const OUT = { yes: ['أيوه، طلع صح', 'ok', '✓'], partly: ['نص نص', 'amb', '≈'], no: ['لأ، طلع غلط', 'bad', '✗'] };
const REVIEW = [[30, 'بعد شهر'], [90, 'بعد 3 شهور'], [180, 'بعد 6 شهور']];
const pills = (group, items, cur) => `<div class="pills" data-group="${group}">${items.map(([k, l]) => `<button type="button" data-v="${k}" class="${String(cur) === String(k) ? 'on' : ''}" data-act="pick">${l}</button>`).join('')}</div>`;
const picked = g => sheetEl()?.querySelector(`[data-group="${g}"] .on`)?.dataset.v;

// قرارات جه ميعاد مراجعتها ولسه ما اتراجعتش (بتظهر في الملخص الصبح والمراجعة الأسبوعية)
export const decisionsDue = async () => (await list('decisions')).filter(x => !x.outcome && x.review_on && x.review_on <= today());

// دروس قديمة شبه المشكلة دي: نفس المجال، أو فيها كلمات مشتركة
const norm = s => String(s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
const words = s => new Set(norm(s).split(/[^\p{L}\p{N}]+/u).map(w => w.replace(/^(وال|بال|فال|لل|ال)/, '')).filter(w => w.length >= 3));   // "المرتجعات" = "مرتجعات"
export async function relatedLessons(p) {
  if (!p?.title) return [];
  const W = words(p.title + ' ' + (p.cause || ''));
  return (await list('lessons')).map(l => {
    let score = 0; for (const w of words(l.text)) if (W.has(w)) score += 2;
    if (p.area_id && l.area_id === p.area_id) score += 1;
    if (l.problem_id === p.id) score = 0;   // درس المشكلة نفسها مش "قديم"
    return { l, score };
  }).filter(x => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.l);
}
export const relatedBox = L => L.length ? `<div class="card stack" style="gap:6px;padding:12px 14px;border-color:var(--amb)"><div class="row" style="gap:6px;font-weight:600">${ic('book', 18)}دروس قديمة شبه المشكلة دي</div>
  ${L.map(l => `<div style="font-size:14px;line-height:1.6">• ${esc(l.text)}</div>`).join('')}</div>` : '';

// ---------- القرار ----------
async function decisionSheet(x = {}) {
  const d = await lifeData(), base = x.decided_on || today();
  const gap = x.review_on ? Math.round((Date.parse(x.review_on) - Date.parse(base)) / 864e5) : 90;
  openSheet(x.id ? 'القرار' : 'قرار جديد', `
    <label class="field"><span>القرار</span><input name="title" value="${esc(x.title)}" ${x.id ? '' : 'autofocus'} placeholder="مثلًا: نزود سعر تغيير الشاشة 10%. @ لشخص، # لمجال" data-mention></label>
    <label class="field"><span>ليه أخدته؟</span><textarea name="why" rows="2" data-mention>${esc(x.why)}</textarea></label>
    <label class="field"><span>متوقع يحصل إيه؟</span><textarea name="expected" rows="2" placeholder="مثلًا: الربح يزيد من غير ما الشغل يقل">${esc(x.expected)}</textarea></label>
    <label class="field"><span>أخدته يوم</span><input type="date" name="decided_on" value="${base}"></label>
    <div class="field"><span>نراجعه إمتى؟</span>${pills('rev', REVIEW, REVIEW.some(r => r[0] === gap) ? gap : 90)}</div>
    ${taPicker(d, x.id ? taValue(x) : '', { label: 'المجال' })}
    ${x.outcome ? `<div class="card stack" style="gap:4px"><b>اتراجع ${fd(x.reviewed_on)}: <span class="tag ${OUT[x.outcome][1]}">${OUT[x.outcome][0]}</span></b>${x.result ? `<div style="line-height:1.6">${esc(x.result)}</div>` : ''}</div>` : ''}
    ${x.id ? linksSlot('decision', x.id) : ''}
    <div class="btns">${x.id ? `<button class="btn" data-act="dec-archive" data-id="${x.id}">${ic('archive', 18)}أرشيف</button>${x.outcome ? '' : `<button class="btn" data-act="dec-review" data-id="${x.id}">راجعه دلوقتي</button>`}` : ''}<button class="btn pri" data-act="dec-save" data-id="${x.id || ''}">حفظ</button></div>`);
  if (x.id) fillLinks(sheetEl());
}
function reviewSheet(x) {
  openSheet('مراجعة القرار', `<div class="stack" style="gap:6px"><b style="font-size:17px;line-height:1.5">${esc(x.title)}</b>
    ${x.expected ? `<div class="mut" style="line-height:1.6">كنت متوقع: <span style="color:var(--ink)">${esc(x.expected)}</span></div>` : ''}
    <div class="mut" style="font-size:13px">أخدته ${fd(x.decided_on)}</div></div>
    <div class="field"><span>طلع صح؟</span>${pills('out', Object.entries(OUT).map(([k, v]) => [k, v[0]]), '')}</div>
    <label class="field"><span>حصل إيه فعلًا؟</span><textarea name="result" rows="3" autofocus></textarea></label>
    <label class="row card" style="padding:12px 14px"><input type="checkbox" name="lesson" style="width:22px;height:22px"><span style="flex:1">طلعت منه بدرس؟ (هيفتحلك تكتبه)</span></label>
    <button class="btn pri" data-act="dec-review-save" data-id="${x.id}">حفظ المراجعة</button>`);
}

// ---------- الدرس ----------
async function lessonSheet(l = {}, title) {
  const d = await lifeData();
  openSheet(title || (l.id ? 'الدرس' : 'درس جديد'), `
    <label class="field"><span>الدرس</span><textarea name="text" rows="3" ${l.id ? '' : 'autofocus'} placeholder="مثلًا: أي مورد جديد نجرّبه بكمية صغيرة الأول. @ لشخص، # لمجال" data-mention>${esc(l.text)}</textarea></label>
    ${taPicker(d, taValue(l), { label: 'المجال' })}
    ${l.id ? linksSlot('lesson', l.id) : ''}
    <div class="btns">${l.id ? `<button class="btn" data-act="les-archive" data-id="${l.id}">${ic('archive', 18)}أرشيف</button>` : ''}<button class="btn pri" data-act="les-save" data-id="${l.id || ''}" data-source="${l.source || 'other'}" data-problem="${l.problem_id || ''}">حفظ</button></div>`);
  if (l.id) fillLinks(sheetEl());
}
// بعد ما مشكلة تتحل: "اتعلمت إيه؟"
export async function lessonFromProblem(p) { await lessonSheet({ source: 'problem', problem_id: p.id, track_id: p.track_id, area_id: p.area_id }, 'المشكلة اتحلت 👏 اتعلمت منها إيه؟'); }

const SRC = { problem: 'من مشكلة', decision: 'من قرار', other: '' };

export default {
  lessons: {
    async render(p) {
      if (p.query.tab) st.tab = p.query.tab === 'lessons' ? 'lessons' : 'decisions';
      const [D, L, d, P] = await Promise.all([list('decisions', { order: 'decided_on', asc: false }), list('lessons', { order: 'created_at', asc: false }), lifeData(), list('problems')]);
      const t = today(), due = D.filter(x => !x.outcome && x.review_on && x.review_on <= t), wait = D.filter(x => !x.outcome && !due.includes(x)), done = D.filter(x => x.outcome);
      const seg = `<div class="seg"><button class="${st.tab === 'decisions' ? 'on' : ''}" data-act="les-tab" data-v="decisions">قرارات <span class="num">${D.length}</span></button><button class="${st.tab === 'lessons' ? 'on' : ''}" data-act="les-tab" data-v="lessons">دروس <span class="num">${L.length}</span></button></div>`;
      const dcard = x => `<button class="card stack" style="gap:6px;text-align:start${due.includes(x) ? ';border-color:var(--amb);border-width:1.5px' : ''}" data-act="dec-open" data-id="${x.id}">
        <div class="between" style="gap:8px"><b style="font-weight:600;line-height:1.5">${esc(x.title)}</b>${x.outcome ? `<span class="tag ${OUT[x.outcome][1]}">${OUT[x.outcome][2]} ${OUT[x.outcome][0]}</span>` : ''}</div>
        ${x.expected ? `<div class="mut" style="font-size:13px;line-height:1.5">متوقع: ${esc(x.expected)}</div>` : ''}
        <div class="mut" style="font-size:12px">${fd(x.decided_on)}${taLabel(x, d) ? ' · ' + esc(taLabel(x, d)) : ''}${!x.outcome && x.review_on ? ' · المراجعة ' + (due.includes(x) ? '<b class="late">جه ميعادها</b>' : dueText(x.review_on)) : ''}</div></button>`;
      const PN = Object.fromEntries(P.map(x => [x.id, x.title]));
      const html = st.tab === 'decisions'
        ? (D.length ? `${due.length ? `<div class="sec">جه ميعاد مراجعتهم</div>${due.map(x => `<div class="stack" style="gap:6px">${dcard(x)}<button class="btn amb sm" data-act="dec-review" data-id="${x.id}">راجعه: طلع صح؟</button></div>`).join('')}` : ''}
            ${wait.length ? `<div class="sec">مستنيين المراجعة</div>${wait.map(dcard).join('')}` : ''}
            ${done.length ? `<div class="sec">اتراجعوا</div>${done.map(dcard).join('')}` : ''}`
          : empty('سجّل أي قرار مهم: أخدته ليه، ومستني منه إيه. وبعد 3 شهور هسألك: طلع صح؟'))
        : (L.length ? L.map(l => `<button class="card stack" style="gap:6px;text-align:start" data-act="les-open" data-id="${l.id}"><div style="line-height:1.6">${esc(l.text)}</div>
            <div class="mut" style="font-size:12px">${fd((l.created_at || '').slice(0, 10))}${SRC[l.source] ? ' · ' + SRC[l.source] : ''}${l.problem_id && PN[l.problem_id] ? ': ' + esc(PN[l.problem_id]) : ''}${taLabel(l, d) ? ' · ' + esc(taLabel(l, d)) : ''}</div></button>`).join('')
          : empty('لما تحل مشكلة هسألك: اتعلمت منها إيه؟ والدرس ده هيظهرلك تاني لو مشكلة شبهها حصلت.'));
      return {
        title: 'الدروس والقرارات', sub: `${D.length} قرار${due.length ? ` · ${due.length} محتاج مراجعة` : ''} · ${L.length} درس`, back: '#/today',
        fab: st.tab === 'decisions' ? { label: 'قرار', act: 'dec-new' } : { label: 'درس', act: 'les-new' },
        html: `<div class="stack">${seg}${html}</div>`,
      };
    },
    actions: { 'les-tab'(el) { st.tab = el.dataset.v; doRefresh(); } },
  },
};

export const lessonGlobal = {
  'dec-new': () => decisionSheet(),
  async 'dec-open'(el) { const x = await one('decisions', el.dataset.id); x && decisionSheet(x); },
  async 'dec-save'(el) {
    const f = formOf(sheetEl()); if (!f.title) return toast('اكتب القرار');
    const on = f.decided_on || today();
    const row = { title: f.title, why: f.why || null, expected: f.expected || null, decided_on: on, review_on: addDays(on, Number(picked('rev') || 90)), ...taRow(f.ta, await lifeData()) };
    try {
      const x = el.dataset.id ? await upd('decisions', el.dataset.id, row) : await ins('decisions', row);
      await withMentions('decisions', 'decision', x, f.title + ' ' + (f.why || ''), true);
      closeSheet(); if (!el.dataset.id) toast(`هفكّرك تراجعه يوم ${fd(row.review_on)}`); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'dec-review'(el) { const x = await one('decisions', el.dataset.id); x && reviewSheet(x); },
  async 'dec-review-save'(el) {
    const s = sheetEl(), f = formOf(s), out = picked('out'); if (!out) return toast('اختار: طلع صح ولا لأ');
    try {
      const x = await upd('decisions', el.dataset.id, { outcome: out, result: f.result || null, reviewed_on: today() });
      closeSheet(); doRefresh();
      if (f.lesson) lessonSheet({ source: 'decision', track_id: x?.track_id, area_id: x?.area_id }, 'اتعلمت إيه من القرار ده؟');
      else toast('اتراجع');
    } catch (e) { fail(e); }
  },
  async 'dec-archive'(el) { closeSheet(); await archiveWithUndo('decisions', el.dataset.id, 'القرار اتنقل للأرشيف'); },

  'les-new': () => lessonSheet(),
  async 'les-open'(el) { const l = await one('lessons', el.dataset.id); l && lessonSheet(l); },
  async 'les-save'(el) {
    const f = formOf(sheetEl()); if (!f.text) return toast('اكتب الدرس');
    const row = { text: f.text, ...taRow(f.ta, await lifeData()) };
    if (!el.dataset.id) Object.assign(row, { source: el.dataset.source || 'other', problem_id: el.dataset.problem || null });
    try {
      const l = el.dataset.id ? await upd('lessons', el.dataset.id, row) : await ins('lessons', row);
      await withMentions('lessons', 'lesson', l, f.text, true);
      closeSheet(); if (!el.dataset.id) toast('الدرس اتسجل. هيظهرلك لو حصلت مشكلة شبهها'); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'les-archive'(el) { closeSheet(); await archiveWithUndo('lessons', el.dataset.id, 'الدرس اتنقل للأرشيف'); },
};
