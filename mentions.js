// @ و #: وإنت بتكتب، @ بتطلّعلك أسامي التيم والمالك، و# بتطلّعلك المجالات.
// لما تحفظ، الحاجة بتتربط بالشخص (فتظهر في صفحته) وبالمجال.
// أي خانة عليها data-mention بتشتغل فيها الحكاية دي لوحدها.
import { list, link, upd } from './db.js';
import { esc } from './ui.js';

const norm = s => String(s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
let pop = null, field = null, from = 0;

async function choices(sym) {
  if (sym === '@') return (await list('team_members', { order: 'name' })).filter(m => m.active).map(m => m.name);
  const [areas, tracks] = await Promise.all([list('life_areas', { order: 'sort' }), list('life_tracks', { order: 'sort' })]);
  return [...areas.map(a => a.name), ...tracks.map(t => t.name)];
}
function hide() { pop?.remove(); pop = null; field = null; }
function pick(name) {
  if (!field) return;
  const el = field, pos = el.selectionStart ?? el.value.length, sym = el.value[from];
  el.value = el.value.slice(0, from) + sym + name + ' ' + el.value.slice(pos);
  const c = from + name.length + 2; el.focus(); el.setSelectionRange?.(c, c);
  hide(); el.dispatchEvent(new Event('input', { bubbles: true }));
}
async function check(el) {
  const pos = el.selectionStart ?? el.value.length, before = el.value.slice(0, pos);
  const m = before.match(/(^|\s)([@#])([^\s@#]{0,24})$/);
  if (!m) return hide();
  const sym = m[2], q = norm(m[3]);
  const L = (await choices(sym)).filter(n => norm(n).includes(q)).slice(0, 6);
  if (!L.length || document.activeElement !== el) return hide();
  from = pos - m[3].length - 1; field = el;
  if (!pop) { pop = document.createElement('div'); pop.className = 'card'; pop.setAttribute('role', 'listbox'); pop.style.cssText = 'padding:4px;display:flex;flex-wrap:wrap;gap:6px;margin-top:6px'; }
  pop.innerHTML = `<span class="mut" style="font-size:12px;width:100%;padding:2px 4px">${sym === '@' ? 'تربطه بمين؟' : 'أنهي مجال؟'}</span>` + L.map(n => `<button type="button" class="chip" style="padding:6px 10px" data-mpick="${esc(n)}">${sym}${esc(n)}</button>`).join('');
  el.insertAdjacentElement('afterend', pop);
}
document.addEventListener('input', e => { const el = e.target; if (el?.matches?.('[data-mention]')) check(el); });
document.addEventListener('pointerdown', e => { const b = e.target.closest?.('[data-mpick]'); if (b) { e.preventDefault(); pick(b.dataset.mpick); } });
document.addEventListener('focusout', e => { if (e.target === field) setTimeout(() => { if (document.activeElement !== field) hide(); }, 200); });

// بعد الحفظ: بيربط الحاجة بالناس والمجالات اللي اتكتبت بـ @ و #.
// ولو الحاجة (فكرة أو مشكلة) لسه ملهاش مجال، بياخد أول مجال اتكتب
export async function withMentions(table, type, row, text, labelField = null) {
  text = String(text || '');
  if (!row?.id || (!text.includes('@') && !text.includes('#'))) return row;
  const has = (sym, name) => text.includes(sym + name) || text.includes(sym + name.replace(/\s+/g, '_'));
  const longFirst = (a, b, k) => String(b[k]).length - String(a[k]).length;
  const [members, areas, tracks] = await Promise.all([list('team_members'), list('life_areas'), list('life_tracks')]);
  for (const m of members.sort((a, b) => longFirst(a, b, 'name'))) if (has('@', m.name)) await link(type, row.id, 'member', m.id);
  const area = areas.sort((a, b) => longFirst(a, b, 'name')).find(a => has('#', a.name));
  if (area) await link(type, row.id, 'area', area.id);
  const track = !area && tracks.find(t => has('#', t.name));
  if (labelField && !row.area_id && (area || track)) {
    const patch = area ? { track_id: area.track_id, area_id: area.id, [labelField]: area.name } : { track_id: track.id, [labelField]: track.name };
    return upd(table, row.id, patch);
  }
  return row;
}
