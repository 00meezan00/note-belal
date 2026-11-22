// حياتي: مسارات حياتك (الدواليب الكبيرة) وجوه كل مسار مجالاته (الأدراج)
// أي حاجة في النوتة (هدف، فكرة، مشكلة، كورس، عادة، مشروع) بتتحط في مسار، ولو حبيت في مجال جوّاه
import { list, ins, upd, archive } from './db.js';
import { esc, ic, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, opts, today, fd, daysBetween } from './ui.js';
import { upsert } from './db.js';
import { doRefresh } from './comps.js';

export const DEFAULT_TRACKS = ['شغلي في Fix Team', 'شغلي الخاص', 'فلوسي', 'تطويري', 'صحتي', 'عيلتي', 'ديني'];
export const FIX_AREAS = ['المبيعات والمحلات', 'التسويق', 'خدمة العملاء', 'خدمة ما بعد البيع والإرجاع', 'المحاسبة', 'الموردين وقطع الغيار', 'التسعير والصفقات', 'الموارد البشرية', 'الهيكل والنظام', 'متابعة الفنيين', 'التوسع'];

// الجداول اللي حاجاتها بتاخد مسار ومجال، والخانة اللي بتتكتب فيها اسم المجال عشان يظهر في الشاشات القديمة
const ITEMS = [['goals', 'area', 'هدف'], ['ideas', 'area', 'فكرة'], ['problems', 'category', 'مشكلة'], ['courses', null, 'كورس'], ['habits', null, 'عادة'], ['projects', null, 'مشروع']];

export async function lifeData() {
  const [tracks, areas] = await Promise.all([list('life_tracks', { order: 'sort' }), list('life_areas', { order: 'sort' })]);
  return { tracks, areas, T: Object.fromEntries(tracks.map(t => [t.id, t])), A: Object.fromEntries(areas.map(a => [a.id, a])) };
}
export const trackByName = (d, name) => d.tracks.find(t => t.name === name);

// قيمة الاختيار: "t:رقم المسار" (المسار كله) أو "a:رقم المجال"
export const taValue = r => r?.area_id ? 'a:' + r.area_id : r?.track_id ? 't:' + r.track_id : '';
// بيحوّل الاختيار لخانات تتحفظ: track_id و area_id، واسم يظهر (اسم المجال، أو اسم المسار لو من غير مجال)
export function taRow(v, d, labelField) {
  let track_id = null, area_id = null, label = null;
  if (v?.startsWith('a:')) { const a = d.A[v.slice(2)]; if (a) { area_id = a.id; track_id = a.track_id; label = a.name; } }
  else if (v?.startsWith('t:')) { const t = d.T[v.slice(2)]; if (t) { track_id = t.id; label = t.name; } }
  const o = { track_id, area_id }; if (labelField) o[labelField] = label;
  return o;
}
export const taLabel = (r, d) => (r?.area_id && d.A[r.area_id]?.name) || (r?.track_id && d.T[r.track_id]?.name) || r?.area || r?.category || '';
export const inTA = (r, v) => !v || (v.startsWith('a:') ? r.area_id === v.slice(2) : r.track_id === v.slice(2));

// خانة اختيار المسار والمجال (واحدة بتستخدمها كل الشاشات)
export function taOptions(d, cur) {
  return d.tracks.map(t => {
    const A = d.areas.filter(a => a.track_id === t.id);
    return `<optgroup label="${esc(t.name)}"><option value="t:${t.id}"${cur === 't:' + t.id ? ' selected' : ''}>${esc(t.name)}${A.length ? ' (من غير مجال)' : ''}</option>${A.map(a => `<option value="a:${a.id}"${cur === 'a:' + a.id ? ' selected' : ''}>${esc(t.name)} ← ${esc(a.name)}</option>`).join('')}</optgroup>`;
  }).join('');
}
export function taPicker(d, cur, { name = 'ta', label = 'المسار والمجال', none = 'من غير مسار', attrs = '' } = {}) {
  if (!d.tracks.length) return `<div class="mut" style="font-size:13px">لسه مفيش مسارات. اعملها من "حياتي" في القايمة.</div>`;
  return `<label class="field"><span>${label}</span><select name="${name}" ${attrs}>${none ? `<option value="">${none}</option>` : ''}${taOptions(d, cur)}</select></label>`;
}

// أول مرة: المسارات السبعة ومجالات Fix Team (لو ملف الـ SQL ما عملهاش)
async function seedDefaults() {
  for (let i = 0; i < DEFAULT_TRACKS.length; i++) {
    const t = await ins('life_tracks', { name: DEFAULT_TRACKS[i], sort: i });
    if (i === 0) for (let j = 0; j < FIX_AREAS.length; j++) await ins('life_areas', { track_id: t.id, name: FIX_AREAS[j], sort: j });
  }
}

async function itemsOf() {
  const sets = await Promise.all(ITEMS.map(([t]) => list(t)));
  return Object.fromEntries(ITEMS.map(([t], i) => [t, sets[i]]));
}
// لما تغيّر اسم مسار أو مجال، الاسم المكتوب على الحاجات القديمة بيتغير معاه
async function relabel(d, pick) {
  for (const [t, f] of ITEMS) if (f) for (const r of await list(t)) if (pick(r)) { const lab = taLabel(r, d); if (lab && r[f] !== lab) await upd(t, r.id, { [f]: lab }); }
}

function trackSheet(t = {}) {
  openSheet(t.id ? 'المسار' : 'مسار جديد', `
    <label class="field"><span>اسم المسار</span><input name="name" value="${esc(t.name)}" ${t.id ? '' : 'autofocus'} placeholder="مثلًا: هواياتي"></label>
    <div class="btns">${t.id ? `<button class="btn" data-act="track-del" data-id="${t.id}">${ic('archive', 18)}شيله</button>` : ''}<button class="btn pri" data-act="track-save" data-id="${t.id || ''}">حفظ</button></div>`);
}
function areaSheet(d, a = {}, trackId) {
  openSheet(a.id ? 'المجال' : 'مجال جديد', `
    <label class="field"><span>اسم المجال</span><input name="name" value="${esc(a.name)}" ${a.id ? '' : 'autofocus'} placeholder="مثلًا: الاستلام والتسليم"></label>
    <label class="field"><span>تبع أنهي مسار؟</span><select name="track_id">${opts(d.tracks.map(t => [t.id, t.name]), a.track_id || trackId)}</select></label>
    <div class="btns">${a.id ? `<button class="btn" data-act="area-del" data-id="${a.id}">${ic('archive', 18)}شيله</button>` : ''}<button class="btn pri" data-act="area-save" data-id="${a.id || ''}">حفظ</button></div>`);
}

// ---------- المناسبات (تحت مسار "عيلتي"): أعياد ميلاد، جواز، أي يوم مهم ----------
// لو بتتكرر كل سنة: بنجيب أقرب مرة جاية لنفس اليوم والشهر
export function occNext(o, t = today()) {
  if (!o.on_date) return null;
  if (!o.yearly) return o.on_date >= t ? o.on_date : null;
  const md = o.on_date.slice(5), y = Number(t.slice(0, 4));
  const fix = yy => md === '02-29' && !(yy % 4 === 0 && (yy % 100 !== 0 || yy % 400 === 0)) ? `${yy}-02-28` : `${yy}-${md}`;
  return fix(y) >= t ? fix(y) : fix(y + 1);
}
const inDays = d => d === 0 ? 'النهاردة' : d === 1 ? 'بكرة' : d === 2 ? 'بعد بكرة' : `بعد ${d} يوم`;
export async function nextOccasions(max = 3) {
  const t = today();
  return (await list('occasions')).map(o => ({ o, next: occNext(o, t) })).filter(x => x.next).sort((a, b) => a.next.localeCompare(b.next)).slice(0, max).map(x => ({ ...x, days: daysBetween(t, x.next) }));
}
async function occBlock() {
  const N = await nextOccasions(3), all = await list('occasions');
  return `<div class="stack" style="gap:6px;padding-top:6px;border-top:1px solid var(--line)"><div class="between"><span style="font-weight:600;font-size:15px">${ic('cal', 16)} أقرب المناسبات</span>${all.length > N.length ? `<button class="btn sm" data-act="occ-all" style="border:0;background:none">كلهم (${all.length})</button>` : ''}</div>
    ${N.map(({ o, next, days }) => `<button class="row" data-act="occ-open" data-id="${o.id}" style="gap:8px;text-align:start;padding:6px 0;background:none;border:0;width:100%;cursor:pointer"><span style="flex:1;line-height:1.4">${esc(o.title)}${o.person ? ` <span class="mut">· ${esc(o.person)}</span>` : ''}<br><small class="mut">${fd(next)}</small></span><span class="tag ${days <= 2 ? 'amb' : ''}">${inDays(days)}</span></button>`).join('') || '<div class="mut" style="font-size:14px">سجّل أعياد الميلاد والمناسبات المهمة، وهفكّرك قبلها بيومين ويومها.</div>'}
    <button class="btn dash sm" data-act="occ-new">+ مناسبة</button></div>`;
}
function occSheet(o = {}) {
  openSheet(o.id ? 'المناسبة' : 'مناسبة جديدة', `<label class="field"><span>المناسبة</span><input name="title" value="${esc(o.title)}" ${o.id ? '' : 'autofocus'} placeholder="مثلًا: عيد ميلاد ماما"></label>
    <label class="field"><span>تبع مين؟ (اختياري)</span><input name="person" value="${esc(o.person)}"></label>
    <label class="field"><span>التاريخ</span><input type="date" name="on_date" value="${o.on_date || today()}"></label>
    <label class="row card" style="padding:12px 14px"><input type="checkbox" name="yearly" ${o.yearly === false ? '' : 'checked'} style="width:22px;height:22px"><span style="flex:1">بتتكرر كل سنة</span></label>
    <p class="mut" style="margin:0;font-size:13px">هيوصلك إشعار قبلها بيومين، ويومها الصبح، وهتظهر في ملخص الصبح.</p>
    <div class="btns">${o.id ? `<button class="btn" data-act="occ-del" data-id="${o.id}">${ic('archive', 18)}شيلها</button>` : ''}<button class="btn pri" data-act="occ-save" data-id="${o.id || ''}">حفظ</button></div>`);
}
async function occAll() {
  const t = today(), L = (await list('occasions')).map(o => ({ o, next: occNext(o, t) })).sort((a, b) => (a.next || '9').localeCompare(b.next || '9'));
  openSheet('كل المناسبات', `<div class="list">${L.map(({ o, next }) => `<button class="row" data-act="occ-open" data-id="${o.id}" style="gap:8px;text-align:start;padding:8px 0;background:none;border:0;width:100%"><span style="flex:1">${esc(o.title)}${o.person ? ` <span class="mut">· ${esc(o.person)}</span>` : ''}</span><span class="mut" style="font-size:13px">${next ? fd(next) : 'عدّت'}</span></button>`).join('')}</div>`);
}

// ---------- ميزان الحياة: كل شهر تدّي كل مسار درجة من 1 لـ 10 ----------
const monthOf = (d = today()) => d.slice(0, 7) + '-01';
const prevMonthOf = m => { const d = new Date(m + 'T12:00'); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const monthName = m => MONTHS[Number(m.slice(5, 7)) - 1];
function radar(tracks, cur, old) {
  const n = tracks.length, cx = 130, cy = 112, R = 72;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n, r = R * v / 10; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const poly = (S, attrs) => `<polygon points="${tracks.map((t, i) => pt(i, S[t.id] || 0).map(x => x.toFixed(1)).join(',')).join(' ')}" ${attrs}/>`;
  const rings = [2.5, 5, 7.5, 10].map(v => `<polygon points="${tracks.map((t, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="var(--line)" stroke-width="1"/>`).join('');
  const axes = tracks.map((t, i) => { const [x, y] = pt(i, 10); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)"/>`; }).join('');
  const labels = tracks.map((t, i) => { const [x, y] = pt(i, 12.6); const anc = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end';
    return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anc}" font-size="10" fill="var(--ink)">${esc(t.name.replace('شغلي في ', ''))}${cur[t.id] ? ` ${cur[t.id]}` : ''}</text>`; }).join('');
  return `<svg viewBox="0 0 260 224" width="100%" style="max-width:340px;align-self:center;direction:ltr" role="img" aria-label="ميزان الحياة">${rings}${axes}${old ? poly(old, 'fill="none" stroke="var(--mut)" stroke-width="1.5" stroke-dasharray="4 3"') : ''}${poly(cur, 'fill="var(--amb)" fill-opacity=".35" stroke="var(--amb)" stroke-width="2"')}${labels}</svg>`;
}
async function wheelCard(d) {
  const m = monthOf(), pm = prevMonthOf(m);
  const S = await list('life_scores', { in: ['month', [m, pm]] });
  const of = mm => Object.fromEntries(S.filter(x => x.month === mm).map(x => [x.track_id, x.score]));
  let cur = of(m), old = of(pm), curM = m;
  if (!Object.keys(cur).length && Object.keys(old).length) { cur = old; old = null; curM = pm; }
  if (!Object.keys(cur).length) return `<div class="card stack" style="gap:8px"><b style="font-weight:600">ميزان حياتك</b><div class="mut" style="font-size:14px;line-height:1.6">كل شهر تدّي كل مسار درجة من 1 لـ 10، وتشوف بعينك أنهي ناحية في حياتك محتاجة اهتمام. وآخر كل شهر هفكّرك.</div><button class="btn amb" data-act="wheel-open">قيّم الشهر ده</button></div>`;
  const low = d.tracks.filter(t => cur[t.id]).sort((a, b) => cur[a.id] - cur[b.id])[0];
  const avg = (Object.values(cur).reduce((a, b) => a + b, 0) / Object.values(cur).length).toFixed(1);
  return `<div class="card stack" style="gap:8px"><div class="between"><b style="font-weight:600">ميزان حياتك · ${monthName(curM)}</b><button class="btn sm" data-act="wheel-open">${curM === m ? 'عدّل' : 'قيّم الشهر ده'}</button></div>
    ${radar(d.tracks, cur, old && Object.keys(old).length ? old : null)}
    <div class="row mut" style="gap:6px 14px;flex-wrap:wrap;font-size:13px"><span>المتوسط <b class="num" style="color:var(--ink)">${avg}</b> من 10</span>${low ? `<span>أقل مسار: <b style="color:var(--ink)">${esc(low.name)}</b></span>` : ''}${old && Object.keys(old).length ? '<span>المتقطع = الشهر اللي فات</span>' : ''}</div></div>`;
}
async function wheelSheet() {
  const d = await lifeData(), m = monthOf();
  const S = Object.fromEntries((await list('life_scores', { eq: { month: m } })).map(x => [x.track_id, x]));
  openSheet(`ميزان ${monthName(m)}`, `<p class="mut" style="margin:0;font-size:14px">كل مسار ماشي إزاي الشهر ده؟ 1 = وحش خالص، 10 = ممتاز</p>
    ${d.tracks.map(t => `<div class="stack" style="gap:4px"><div class="between"><span style="font-weight:500">${esc(t.name)}</span><b class="num" data-out="${t.id}">${S[t.id]?.score || 5}</b></div>
      <input type="range" min="1" max="10" step="1" value="${S[t.id]?.score || 5}" data-track="${t.id}" data-input="wheel-num" style="width:100%;accent-color:var(--amb)"></div>`).join('')}
    <button class="btn pri" data-act="wheel-save">حفظ</button>`);
}

// ---------- صفحة المسار: كل حاجة في المسار في مكان واحد ----------
const rowL = (href, icon, text, sub = '', right = '') => `<a class="lnk" href="${href}"><span class="k">${ic(icon, 16)}</span><span class="t">${esc(text)}${sub ? `<small>${sub}</small>` : ''}</span>${right}</a>`;
const block = (title, rows, more = '') => rows.length ? `<div class="card" style="padding:10px 14px"><div class="between"><b style="font-weight:600">${title}</b><span class="num mut">${rows.length}</span></div><div class="list">${rows.join('')}</div>${more}</div>` : '';

export default {
  life: {
    async render() {
      const d = await lifeData();
      if (!d.tracks.length) return { title: 'حياتي', back: '#/today', html: `<div class="stack">${empty('هنا بتتقسم حياتك مسارات: الشغل، شغلك الخاص، فلوسك، تطويرك، صحتك، عيلتك، دينك.<br>وكل حاجة في النوتة بتبقى تبع مسار.')}<button class="btn pri" data-act="life-seed">ابدأ بالمسارات</button></div>` };
      const I = await itemsOf();
      const live = { goals: r => r.status === 'active', problems: r => r.status !== 'solved', courses: r => r.status === 'active', habits: r => r.active !== false, ideas: r => r.stage !== 'converted', projects: () => true };
      const countLine = tid => ITEMS.map(([t, , l]) => { const k = I[t].filter(r => r.track_id === tid && live[t](r)).length; return k ? `${k} ${l}` : ''; }).filter(Boolean).join(' · ');
      const none = ITEMS.reduce((s, [t]) => s + I[t].filter(r => !r.track_id && live[t](r)).length, 0);
      const famId = trackByName(d, 'عيلتي')?.id, occ = await occBlock(), wheel = await wheelCard(d);
      return {
        title: 'حياتي', sub: `${d.tracks.length} مسارات`, back: '#/today',
        fab: { label: 'مسار', act: 'track-new' },
        html: `<div class="stack">
          <a class="card row" href="#/dreams" style="gap:12px">${ic('star', 22)}<div style="flex:1;line-height:1.5"><div style="font-weight:600">خطة سنتي</div><div class="mut" style="font-size:13px">الحلم الكبير ← حلم كل مسار ← أهداف كل 3 شهور</div></div>${ic('chev', 18)}</a>
          ${wheel}
          ${d.tracks.map(t => { const A = d.areas.filter(a => a.track_id === t.id), cl = countLine(t.id);
            return `<div class="card stack" style="gap:10px">
              <div class="row" style="gap:8px"><a class="disp" style="font-size:19px;flex:1" href="#/track/${t.id}">${esc(t.name)} <span class="mut" style="font-size:14px">‹</span></a><button class="star" data-act="track-open" data-id="${t.id}" aria-label="عدّل">${ic('edit', 16)}</button></div>
              <div class="mut" style="font-size:13px">${cl || 'لسه مفيش حاجة في المسار ده'}</div>
              <div class="row" style="flex-wrap:wrap;gap:6px">${A.map(a => `<a class="chip" style="padding:6px 10px;text-decoration:none;color:inherit" href="#/track/${t.id}?area=${a.id}">${esc(a.name)}</a>`).join('')}<button class="chip out" style="padding:6px 10px" data-act="area-new" data-track="${t.id}">+ مجال</button></div>
              ${t.id === famId ? occ : ''}
            </div>`; }).join('')}
          ${famId ? '' : `<div class="card stack" style="gap:6px"><b class="disp" style="font-size:19px">المناسبات</b>${occ}</div>`}
          ${none ? `<div class="mut" style="font-size:13px;text-align:center">فيه ${none} حاجة من غير مسار. افتحها واختارلها مسار.</div>` : ''}
          <p class="mut" style="margin:0;text-align:center;font-size:13px">دوس على اسم المسار أو المجال عشان تشوف كل حاجاته، وعلى القلم عشان تغيّر اسمه.</p>
        </div>`,
      };
    },
    actions: {
      async 'life-seed'() { try { await seedDefaults(); toast('المسارات اتعملت'); doRefresh(); } catch (e) { fail(e); } },
      'track-new': () => trackSheet(),
      async 'track-open'(el) { const d = await lifeData(); trackSheet(d.T[el.dataset.id]); },
      async 'area-new'(el) { areaSheet(await lifeData(), {}, el.dataset.track); },
      async 'area-open'(el) { const d = await lifeData(); areaSheet(d, d.A[el.dataset.id]); },
    },
    async after(main, p) { if (p.query.wheel) { history.replaceState(null, '', '#/life'); wheelSheet(); } },
  },

  track: {
    async render(p) {
      const d = await lifeData(), t = d.T[p.id];
      if (!t) return { title: 'المسار', back: '#/life', html: empty('المسار ده مش موجود.') };
      const A = d.areas.filter(a => a.track_id === t.id), area = p.query.area && d.A[p.query.area] ? p.query.area : '';
      const ok = r => r.track_id === t.id && (!area || r.area_id === area);
      const y = Number(today().slice(0, 4));
      const [goals, prog, ideas, problems, courses, media, habits, projects, decisions, lessons, dreams, scores] = await Promise.all([
        list('goals', { order: 'due_on' }), list('v_goal_progress'), list('ideas', { order: 'created_at', asc: false }), list('problems', { order: 'created_at', asc: false }),
        list('courses'), list('media'), list('habits'), list('projects'), list('decisions', { order: 'decided_on', asc: false }), list('lessons', { order: 'created_at', asc: false }),
        list('dreams', { eq: { year: y } }), list('life_scores', { eq: { track_id: t.id }, order: 'month' })]);
      const P = Object.fromEntries(prog.map(x => [x.id, x.progress || 0]));
      const dream = dreams.find(x => x.track_id === t.id);
      const G = goals.filter(g => ok(g) && g.status !== 'done'), Gd = goals.filter(g => ok(g) && g.status === 'done');
      const sc = scores.slice(-6);
      const occ = t.name === 'عيلتي' && !area ? `<div class="card stack" style="gap:6px">${await occBlock()}</div>` : '';
      const html = [
        dream && !area ? `<a class="card row" href="#/dreams" style="gap:10px;background:var(--dock);border-color:var(--dock);color:#fff">${ic('star', 20)}<div style="flex:1;line-height:1.5"><div style="font-size:12px;color:#C9D2D9">حلمك في المسار ده لسنة ${y}</div>${esc(dream.title)}</div></a>` : '',
        sc.length && !area ? `<div class="card stack" style="gap:6px"><div class="between"><b style="font-weight:600">درجته في ميزان حياتك</b><b class="num">${sc[sc.length - 1].score}/10</b></div><div class="row" style="gap:6px;height:70px;align-items:flex-end">${sc.map(x => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;justify-content:flex-end"><span style="width:100%;max-width:26px;height:${x.score * 5}px;border-radius:5px 5px 2px 2px;background:var(--amb)"></span><span style="font-size:10px;color:var(--mut)">${monthName(x.month).slice(0, 4)}</span></div>`).join('')}</div></div>` : '',
        block('أهداف شغالة', G.map(g => rowL('#/goal/' + g.id, 'goal', g.title, g.status === 'paused' ? 'متوقف' : g.due_on ? 'الموعد ' + fd(g.due_on) : '', `<span class="num mut" style="font-size:13px">${P[g.id]}%</span>`))),
        block('مشاكل مفتوحة', problems.filter(x => ok(x) && x.status !== 'solved').map(x => rowL('#/problems?open=' + x.id, 'alert', x.title, x.occurrences > 1 ? `اتكررت ${x.occurrences} مرات` : ''))),
        block('أفكار', ideas.filter(x => ok(x) && x.stage !== 'converted').map(x => rowL('#/idea/' + x.id, 'spark', x.title))),
        block('عادات', habits.filter(x => ok(x) && x.active !== false).map(x => rowL('#/habits', 'repeat', x.title))),
        block('بتتعلم', [...courses.filter(x => ok(x) && x.status === 'active').map(x => rowL('#/courses?tab=courses', 'book', x.title, 'كورس')), ...media.filter(x => ok(x) && x.status === 'active').map(x => rowL('#/courses?tab=media', 'book', x.title, x.kind === 'book' ? 'كتاب' : x.kind === 'podcast' ? 'بودكاست' : 'كتاب مسموع'))]),
        block('مشاريع', projects.filter(ok).map(x => rowL('#/project/' + x.id, 'layers', x.name))),
        block('قرارات', decisions.filter(ok).slice(0, 8).map(x => rowL('#/lessons?tab=decisions', 'check', x.title, x.outcome ? 'اتراجع' : 'المراجعة ' + fd(x.review_on)))),
        block('دروس', lessons.filter(ok).slice(0, 8).map(x => rowL('#/lessons?tab=lessons', 'book', x.text))),
        block('اتحققت', Gd.slice(-5).reverse().map(g => rowL('#/goal/' + g.id, 'check', g.title, 'اتحقق ' + fd(g.done_on)))),
        occ,
      ].filter(Boolean).join('');
      return {
        title: t.name, sub: area ? 'مجال: ' + d.A[area].name : `${A.length} مجالات`, back: '#/life',
        html: `<div class="stack" style="padding-bottom:20px">
          ${A.length ? `<div class="pills" style="flex-wrap:wrap"><button class="${area ? '' : 'on'}" data-act="trk-area" data-v="#/track/${t.id}">الكل</button>${A.map(a => `<button class="${area === a.id ? 'on' : ''}" data-act="trk-area" data-v="#/track/${t.id}?area=${a.id}">${esc(a.name)}</button>`).join('')}</div>` : ''}
          ${html || empty(area ? 'مفيش حاجة في المجال ده لسه.' : 'لسه مفيش حاجة في المسار ده. أي هدف أو فكرة أو مشكلة تختارلها المسار ده هتظهر هنا.')}
          <div class="btns"><button class="btn sm" data-act="${area ? 'area-open' : 'track-open'}" data-id="${area || t.id}">${ic('edit', 16)}${area ? 'عدّل المجال' : 'عدّل اسم المسار'}</button><button class="btn sm" data-act="area-new" data-track="${t.id}">+ مجال</button></div>
        </div>`,
      };
    },
    actions: {
      'trk-area'(el) { history.replaceState(null, '', el.dataset.v); doRefresh(); },
      async 'track-open'(el) { const d = await lifeData(); trackSheet(d.T[el.dataset.id]); },
      async 'area-new'(el) { areaSheet(await lifeData(), {}, el.dataset.track); },
      async 'area-open'(el) { const d = await lifeData(); areaSheet(d, d.A[el.dataset.id]); },
    },
  },
};

export const lifeGlobal = {
  'wheel-open': () => wheelSheet(),
  'wheel-num'(el) { const o = sheetEl().querySelector(`[data-out="${el.dataset.track}"]`); if (o) o.textContent = el.value; },
  async 'wheel-save'() {
    const m = monthOf();
    try { for (const r of sheetEl().querySelectorAll('[data-track]')) await upsert('life_scores', { month: m, track_id: r.dataset.track, score: Number(r.value) }, 'user_id,month,track_id'); closeSheet(); toast('ميزان الشهر اتحفظ'); doRefresh(); } catch (e) { fail(e); }
  },
  'occ-new': () => occSheet(),
  async 'occ-open'(el) { const o = (await list('occasions')).find(x => x.id === el.dataset.id); o && occSheet(o); },
  'occ-all': () => occAll(),
  async 'occ-save'(el) {
    const f = formOf(sheetEl()); if (!f.title || !f.on_date) return toast('اكتب المناسبة وتاريخها');
    const row = { title: f.title, person: f.person || null, on_date: f.on_date, yearly: !!f.yearly };
    try { if (el.dataset.id) await upd('occasions', el.dataset.id, row); else await ins('occasions', row); closeSheet(); doRefresh(); } catch (e) { fail(e); }
  },
  async 'occ-del'(el) { try { await archive('occasions', el.dataset.id); closeSheet(); toast('اتشالت'); doRefresh(); } catch (e) { fail(e); } },
  async 'track-save'(el) {
    const f = formOf(sheetEl()); if (!f.name) return toast('اكتب اسم المسار');
    try {
      if (el.dataset.id) { await upd('life_tracks', el.dataset.id, { name: f.name }); await relabel(await lifeData(), r => r.track_id === el.dataset.id && !r.area_id); }
      else { const d = await lifeData(); await ins('life_tracks', { name: f.name, sort: d.tracks.length }); }
      closeSheet(); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'track-del'(el) {
    const id = el.dataset.id, I = await itemsOf(), n = ITEMS.reduce((s, [t]) => s + I[t].filter(r => r.track_id === id).length, 0);
    if (n && !el.dataset.sure) { el.dataset.sure = '1'; el.innerHTML = `متأكد؟ ${n} حاجة هتبقى من غير مسار`; el.classList.add('bad'); return; }
    try {
      for (const [t] of ITEMS) for (const r of I[t].filter(r => r.track_id === id)) await upd(t, r.id, { track_id: null, area_id: null });
      for (const a of (await lifeData()).areas.filter(a => a.track_id === id)) await archive('life_areas', a.id);
      await archive('life_tracks', id); closeSheet(); toast('المسار اتشال'); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'area-save'(el) {
    const f = formOf(sheetEl()); if (!f.name) return toast('اكتب اسم المجال');
    try {
      if (el.dataset.id) {
        const id = el.dataset.id; await upd('life_areas', id, { name: f.name, track_id: f.track_id });
        for (const [t] of ITEMS) for (const r of await list(t)) if (r.area_id === id && r.track_id !== f.track_id) await upd(t, r.id, { track_id: f.track_id });   // نقلت المجال لمسار تاني؟ حاجاته بتتنقل معاه
        await relabel(await lifeData(), r => r.area_id === id);
      } else { const d = await lifeData(); await ins('life_areas', { name: f.name, track_id: f.track_id, sort: d.areas.length }); }
      closeSheet(); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'area-del'(el) {
    const id = el.dataset.id;
    try {
      await archive('life_areas', id);
      const d = await lifeData();
      for (const [t, f] of ITEMS) for (const r of await list(t)) if (r.area_id === id) { const o = { area_id: null }; if (f) o[f] = d.T[r.track_id]?.name || null; await upd(t, r.id, o); }
      closeSheet(); toast('المجال اتشال، وحاجاته فضلت في المسار'); doRefresh();
    } catch (e) { fail(e); }
  },
};
