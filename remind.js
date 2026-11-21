// تذكير لأي فكرة: الأفكار العادية (ideas) وأفكار التطوير في المشاريع (project_devs)
// بنحفظ على الفكرة يوم (remind_on) وساعة (remind_time)،
// والـ Worker بتاع Cloudflare بيبعت إشعار للموبايل أول ما الميعاد يجي.
import { upd } from './db.js';
import { ic, fd, iso, today, addDays, toast, fail, sheetEl } from './ui.js';
import { doRefresh } from './comps.js';

const TABLE = { idea: 'ideas', dev: 'project_devs' };
const DEF_TIME = '10:00';
const QUICK = [['h1', 'بعد ساعة'], ['1', 'بكرة'], ['3', 'بعد 3 أيام'], ['7', 'بعد أسبوع']];

const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const fmtTime = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`; };
const dayWord = d => d === today() ? 'النهاردة' : d === addDays(today(), 1) ? 'بكرة' : fd(d);
const isPast = r => r.remind_on < today() || (r.remind_on === today() && (r.remind_time || DEF_TIME).slice(0, 5) <= hm(new Date()));
// الاختيارات السريعة: "بعد ساعة" = الساعة دلوقتي + ساعة، والباقي = اليوم ده الساعة 10 الصبح
function when(v) {
  if (v === 'h1') { const d = new Date(Date.now() + 36e5); return [iso(d), hm(d)]; }
  return [addDays(today(), Number(v) || 1), DEF_TIME];
}

// علامة الجرس الصغيرة على كارت الفكرة في القايمة
export function remindChip(r) {
  if (!r.remind_on || isPast(r)) return '';
  return `<span class="mut row" style="gap:4px">${ic('bell', 14)}${dayWord(r.remind_on)} ${fmtTime(r.remind_time)}</span>`;
}

// ---------- جوه شيت "فكرة جديدة" ----------
export function remindField() {
  return `<div class="field"><span>ذكّرني بيها (اختياري)</span>
    <div class="pills" data-group="rq"><button type="button" data-v="" class="on" data-act="rq">من غير</button>${QUICK.map(([k, l]) => `<button type="button" data-v="${k}" data-act="rq">${l}</button>`).join('')}<button type="button" data-v="x" data-act="rq">ميعاد تاني</button></div>
    <div class="grid2" data-box="rq" hidden><label class="field"><span>اليوم</span><input type="date" name="remind_on"></label><label class="field"><span>الساعة</span><input type="time" name="remind_time" value="${DEF_TIME}"></label></div></div>`;
}
// بيرجع التذكير اللي اتختار، أو {} لو "من غير" (عشان منبعتش حاجة زيادة لـ Supabase)
export function readRemind() {
  const s = sheetEl();
  if (!s.querySelector('[data-group=rq] .on')?.dataset.v) return {};
  const d = s.querySelector('[name=remind_on]')?.value;
  return d ? { remind_on: d, remind_time: s.querySelector('[name=remind_time]').value || DEF_TIME } : {};
}
export const remindSheetActions = {
  rq(el) {
    el.closest('[data-group]').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
    const box = sheetEl().querySelector('[data-box=rq]'), v = el.dataset.v;
    box.hidden = !v;
    const d = box.querySelector('[name=remind_on]'), t = box.querySelector('[name=remind_time]');
    if (v && v !== 'x') [d.value, t.value] = when(v);
    if (v === 'x' && !d.value) d.value = addDays(today(), 1);
  },
};

// ---------- كارت التذكير في صفحة الفكرة ----------
export function remindCard(type, r) {
  const set = !!r.remind_on, past = set && isPast(r);
  const status = !set ? 'اختار إمتى، وهيوصلك إشعار على الموبايل'
    : past ? `ميعاده كان ${dayWord(r.remind_on)} ${fmtTime(r.remind_time)}. اختار ميعاد جديد لو عايز`
    : `هيوصلك إشعار ${dayWord(r.remind_on)} الساعة ${fmtTime(r.remind_time)}`;
  const at = `data-t="${type}" data-id="${r.id}"`;
  return `<div class="card stack" style="gap:10px">
    <div class="row">${ic('bell', 22)}<div style="flex:1;line-height:1.4"><div style="font-weight:500">ذكّرني بيها</div><div class="mut">${status}</div></div>${set ? `<button class="btn sm" data-act="rm-clear" ${at}>${ic('x', 16)}شيل</button>` : ''}</div>
    <div class="pills">${QUICK.map(([k, l]) => `<button type="button" data-act="rm-quick" data-v="${k}" ${at}>${l}</button>`).join('')}</div>
    <div class="grid2"><input type="date" class="inp" value="${set ? r.remind_on : ''}" data-change="rm-date" ${at} aria-label="اليوم"><input type="time" class="inp" value="${(r.remind_time || DEF_TIME).slice(0, 5)}" data-change="rm-time" ${at} aria-label="الساعة"></div>
  </div>`;
}
async function save(el, patch, msg) {
  try { await upd(TABLE[el.dataset.t], el.dataset.id, patch); toast(msg); doRefresh(); } catch (e) { fail(e); }
}
const okMsg = (d, t) => `هفكّرك ${dayWord(d)} الساعة ${fmtTime(t)}`;
export const remindActions = {
  async 'rm-quick'(el) { const [d, t] = when(el.dataset.v); await save(el, { remind_on: d, remind_time: t }, okMsg(d, t)); },
  async 'rm-date'(el) {
    const t = el.closest('.card').querySelector('[data-change=rm-time]').value || DEF_TIME;
    if (!el.value) return save(el, { remind_on: null, remind_time: null }, 'التذكير اتشال');
    await save(el, { remind_on: el.value, remind_time: t }, okMsg(el.value, t));
  },
  async 'rm-time'(el) {
    if (!el.value) return;
    const d = el.closest('.card').querySelector('[data-change=rm-date]').value || today();
    await save(el, { remind_on: d, remind_time: el.value }, okMsg(d, el.value));
  },
  async 'rm-clear'(el) { await save(el, { remind_on: null, remind_time: null }, 'التذكير اتشال'); },
};
