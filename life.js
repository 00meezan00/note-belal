// حياتي: مسارات حياتك (الدواليب الكبيرة) وجوه كل مسار مجالاته (الأدراج)
// أي حاجة في النوتة (هدف، فكرة، مشكلة، كورس، عادة، مشروع) بتتحط في مسار، ولو حبيت في مجال جوّاه
import { list, ins, upd, archive } from './db.js';
import { esc, ic, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, opts, today, fd, daysBetween } from './ui.js';
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

export default {
  life: {
    async render() {
      const d = await lifeData();
      if (!d.tracks.length) return { title: 'حياتي', back: '#/today', html: `<div class="stack">${empty('هنا بتتقسم حياتك مسارات: الشغل، شغلك الخاص، فلوسك، تطويرك، صحتك، عيلتك، دينك.<br>وكل حاجة في النوتة بتبقى تبع مسار.')}<button class="btn pri" data-act="life-seed">ابدأ بالمسارات</button></div>` };
      const I = await itemsOf();
      const live = { goals: r => r.status === 'active', problems: r => r.status !== 'solved', courses: r => r.status === 'active', habits: r => r.active !== false, ideas: r => r.stage !== 'converted', projects: () => true };
      const countLine = tid => ITEMS.map(([t, , l]) => { const k = I[t].filter(r => r.track_id === tid && live[t](r)).length; return k ? `${k} ${l}` : ''; }).filter(Boolean).join(' · ');
      const none = ITEMS.reduce((s, [t]) => s + I[t].filter(r => !r.track_id && live[t](r)).length, 0);
      const famId = trackByName(d, 'عيلتي')?.id, occ = await occBlock();
      return {
        title: 'حياتي', sub: `${d.tracks.length} مسارات`, back: '#/today',
        fab: { label: 'مسار', act: 'track-new' },
        html: `<div class="stack">
          ${d.tracks.map(t => { const A = d.areas.filter(a => a.track_id === t.id), cl = countLine(t.id);
            return `<div class="card stack" style="gap:10px">
              <div class="row" style="gap:8px"><b class="disp" style="font-size:19px;flex:1;cursor:pointer" data-act="track-open" data-id="${t.id}" role="button" tabindex="0">${esc(t.name)}</b><button class="star" data-act="track-open" data-id="${t.id}" aria-label="عدّل">${ic('edit', 16)}</button></div>
              <div class="mut" style="font-size:13px">${cl || 'لسه مفيش حاجة في المسار ده'}</div>
              <div class="row" style="flex-wrap:wrap;gap:6px">${A.map(a => `<button class="chip" style="padding:6px 10px" data-act="area-open" data-id="${a.id}">${esc(a.name)}</button>`).join('')}<button class="chip out" style="padding:6px 10px" data-act="area-new" data-track="${t.id}">+ مجال</button></div>
              ${t.id === famId ? occ : ''}
            </div>`; }).join('')}
          ${famId ? '' : `<div class="card stack" style="gap:6px"><b class="disp" style="font-size:19px">المناسبات</b>${occ}</div>`}
          ${none ? `<div class="mut" style="font-size:13px;text-align:center">فيه ${none} حاجة من غير مسار. افتحها واختارلها مسار.</div>` : ''}
          <p class="mut" style="margin:0;text-align:center;font-size:13px">دوس على اسم المسار أو المجال عشان تغيّر اسمه أو تشيله.</p>
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
  },
};

export const lifeGlobal = {
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
