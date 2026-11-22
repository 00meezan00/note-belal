// خطة سنتي: حلم كبير للسنة، وتحته حلم لكل مسار، وتحت كل حلم أهداف الربع (كل 3 شهور)
// وأهم 3 حاجات كل أسبوع بتتربط بالأهداف دي من المراجعة الأسبوعية، ومنها للمهام
import { list, one, ins, upd } from './db.js';
import { esc, ic, bat, fd, today, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail } from './ui.js';
import { archiveWithUndo, doRefresh } from './comps.js';
import { lifeData } from './life.js';

const thisYear = () => Number(today().slice(0, 4));
const qOf = d => Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1;
const st = { year: thisYear(), q: qOf(today()) };
const qRange = (y, q) => [`${y}-${String(q * 3 - 2).padStart(2, '0')}-01`, `${y}-${String(q * 3).padStart(2, '0')}-${q === 1 || q === 4 ? 31 : 30}`];
const QN = ['', 'الربع الأول (يناير–مارس)', 'الربع التاني (أبريل–يونيو)', 'الربع التالت (يوليو–سبتمبر)', 'الربع الرابع (أكتوبر–ديسمبر)'];

function dreamSheet(d = {}, trackName = '') {
  const big = !d.track_id;
  openSheet(d.id ? 'الحلم' : big ? `حلمك الكبير لسنة ${d.year || st.year}` : `حلمك في «${trackName}»`, `
    <label class="field"><span>${big ? 'لو السنة دي خلصت وكانت أحسن سنة في حياتك، إيه اللي يكون حصل؟' : 'آخر السنة، عايز تكون وصلت لإيه في المسار ده؟'}</span><textarea name="title" rows="3" ${d.id ? '' : 'autofocus'} placeholder="${big ? 'مثلًا: Fix Team بقت أكبر مركز صيانة في دمياط، وأنا بقيت مدير شاطر وعيلتي مبسوطة' : 'مثلًا: الشركة بقى عندها فرعين'}">${esc(d.title)}</textarea></label>
    <label class="field"><span>ليه ده مهم ليك؟ (اختياري)</span><textarea name="why" rows="2">${esc(d.why)}</textarea></label>
    <div class="btns">${d.id ? `<button class="btn" data-act="dream-archive" data-id="${d.id}">${ic('archive', 18)}شيله</button>` : ''}<button class="btn pri" data-act="dream-save" data-id="${d.id || ''}" data-track="${d.track_id || ''}" data-year="${d.year || st.year}">حفظ</button></div>`);
}
function qGoalSheet(trackId, dreamId, trackName) {
  const [, end] = qRange(st.year, st.q);
  openSheet(`هدف لـ ${QN[st.q].split(' (')[0]}`, `<div class="mut" style="font-size:13px">في «${esc(trackName)}»${dreamId ? '، وبيخدم حلمك فيه' : ''}</div>
    <label class="field"><span>الهدف</span><input name="title" autofocus placeholder="حاجة تقدر تخلّصها في 3 شهور"></label>
    <label class="field"><span>الميعاد</span><input type="date" name="due_on" value="${end < today() ? today() : end}"></label>
    <p class="mut" style="margin:0;font-size:13px">هيتحفظ وعليه علامة "ناقص"، ومن جوّاه تكمّل مواصفاته.</p>
    <button class="btn pri" data-act="qg-save" data-track="${trackId}" data-dream="${dreamId || ''}">حفظ</button>`);
}

export default {
  dreams: {
    async render() {
      const y = st.year, [from, to] = qRange(y, st.q);
      const [d, dreams, goals, prog] = await Promise.all([lifeData(), list('dreams', { eq: { year: y } }), list('goals'), list('v_goal_progress')]);
      const P = Object.fromEntries(prog.map(p => [p.id, p.progress || 0]));
      const big = dreams.find(x => !x.track_id);
      const inQ = g => g.status !== 'paused' && ((g.due_on && g.due_on >= from && g.due_on <= to) || (g.status === 'done' && g.done_on >= from && g.done_on <= to));
      const avg = L => L.length ? Math.round(L.reduce((s, g) => s + P[g.id], 0) / L.length) : 0;
      const allQ = goals.filter(inQ);
      const cards = d.tracks.map(t => {
        const dr = dreams.find(x => x.track_id === t.id);
        const G = goals.filter(g => g.track_id === t.id && (inQ(g) || (dr && g.dream_id === dr.id && g.status === 'active' && !g.due_on)));
        return `<div class="card stack" style="gap:8px">
          <div class="between"><a href="#/track/${t.id}" class="disp" style="font-size:18px">${esc(t.name)}</a>${G.length ? `<span class="num mut" style="font-size:13px">${avg(G)}%</span>` : ''}</div>
          ${dr ? `<button class="row" data-act="dream-open" data-id="${dr.id}" style="gap:8px;text-align:start;background:var(--mat);border:0;border-radius:12px;padding:10px 12px;cursor:pointer">${ic('star', 18)}<span style="flex:1;line-height:1.5">${esc(dr.title)}</span></button>`
            : `<button class="btn dash sm" data-act="dream-new" data-track="${t.id}" data-name="${esc(t.name)}">+ حلمك في المسار ده للسنة</button>`}
          ${G.length ? `<div class="list">${G.map(g => `<a class="lnk" href="#/goal/${g.id}"><span class="k">${ic(g.status === 'done' ? 'check' : 'goal', 16)}</span><span class="t">${esc(g.title)}<small>${g.status === 'done' ? 'اتحقق' : g.due_on ? 'الموعد ' + fd(g.due_on) : 'من غير موعد'}${dr && g.dream_id === dr.id ? ' · بيخدم الحلم' : ''}</small></span><span class="num mut" style="font-size:13px">${P[g.id]}%</span></a>`).join('')}</div>` : '<div class="mut" style="font-size:13px">مفيش أهداف للربع ده في المسار ده.</div>'}
          <button class="btn sm" data-act="qg-new" data-track="${t.id}" data-dream="${dr?.id || ''}" data-name="${esc(t.name)}">${ic('plus', 16)}هدف للربع ده</button></div>`;
      }).join('');
      return {
        title: 'خطة سنتي', sub: `سنة ${y} · ${QN[st.q].split(' (')[0]}`, back: '#/life',
        html: `<div class="stack" style="padding-bottom:20px">
          <div class="between"><button class="rb" data-act="dy-move" data-v="-1" aria-label="السنة اللي فاتت">${ic('back', 20)}</button><b class="disp" style="font-size:20px">${y}</b><button class="rb" data-act="dy-move" data-v="1" aria-label="السنة الجاية">${ic('chev', 20)}</button></div>
          ${big ? `<button class="card stack" data-act="dream-open" data-id="${big.id}" style="gap:8px;text-align:start;background:var(--dock);border-color:var(--dock);color:#fff;padding:16px">
              <div style="font-size:13px;color:#C9D2D9">حلمك الكبير للسنة</div><div class="disp" style="font-size:20px;line-height:1.5">${esc(big.title)}</div>
              ${big.why ? `<div style="font-size:13px;color:#C9D2D9;line-height:1.6">${esc(big.why)}</div>` : ''}
              ${allQ.length ? `<div style="font-size:13px;color:#C9D2D9">أهداف الربع ده كلها: <b class="num" style="color:#fff">${avg(allQ)}%</b> (${allQ.length} هدف)</div>` : ''}</button>`
            : `<div class="card stack" style="gap:8px;border-color:var(--amb);border-width:1.5px"><b style="font-weight:600">ابدأ بحلمك الكبير</b><div class="mut" style="font-size:14px;line-height:1.6">جملة واحدة: السنة دي لو خلصت وكانت أحسن سنة، إيه اللي يكون حصل؟ وتحته حلم لكل مسار، وتحت كل حلم أهداف كل 3 شهور.</div><button class="btn amb" data-act="dream-new" data-track="">اكتب حلمك الكبير</button></div>`}
          <div class="seg">${[1, 2, 3, 4].map(q => `<button class="${st.q === q ? 'on' : ''}" data-act="dq" data-v="${q}">ر${q}</button>`).join('')}</div>
          <div class="mut" style="font-size:13px;text-align:center">${QN[st.q]}</div>
          ${d.tracks.length ? cards : empty('اعمل مساراتك الأول من صفحة "حياتي".')}
          <p class="mut" style="margin:0;text-align:center;font-size:13px">في المراجعة الأسبوعية، اربط أهم 3 حاجات للأسبوع بالأهداف دي، وحوّلهم لمهام.</p>
        </div>`,
      };
    },
    actions: {
      'dy-move'(el) { st.year += Number(el.dataset.v); doRefresh(); },
      dq(el) { st.q = Number(el.dataset.v); doRefresh(); },
      'dream-new'(el) { dreamSheet({ track_id: el.dataset.track || null, year: st.year }, el.dataset.name || ''); },
      async 'dream-open'(el) { const x = await one('dreams', el.dataset.id); if (!x) return; const d = await lifeData(); dreamSheet(x, d.T[x.track_id]?.name || ''); },
      'qg-new'(el) { qGoalSheet(el.dataset.track, el.dataset.dream, el.dataset.name); },
    },
  },
};

export const dreamGlobal = {
  async 'dream-save'(el) {
    const f = formOf(sheetEl()); if (!f.title) return toast('اكتب الحلم');
    const row = { title: f.title, why: f.why || null };
    try {
      if (el.dataset.id) await upd('dreams', el.dataset.id, row);
      else await ins('dreams', { ...row, year: Number(el.dataset.year) || thisYear(), track_id: el.dataset.track || null });
      closeSheet(); toast('اتحفظ'); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'dream-archive'(el) { closeSheet(); await archiveWithUndo('dreams', el.dataset.id, 'الحلم اتشال'); },
  async 'qg-save'(el) {
    const f = formOf(sheetEl()); if (!f.title) return toast('اكتب الهدف');
    const d = await lifeData(), t = d.T[el.dataset.track];
    try {
      const g = await ins('goals', { title: f.title, track_id: t?.id || null, area: t?.name || 'من غير مجال', due_on: f.due_on || null, dream_id: el.dataset.dream || null });
      closeSheet(); toast('اتحفظ. كمّل مواصفاته وقت ما تفضى'); location.hash = `#/goal/${g.id}`;
    } catch (e) { fail(e); }
  },
};

// في صفحة الهدف: الهدف ده بيخدم أنهي حلم؟
export async function dreamPicker(g) {
  const y = Number((g.due_on || today()).slice(0, 4));
  const D = (await list('dreams', { eq: { year: y } })).filter(x => !x.track_id || x.track_id === g.track_id || x.id === g.dream_id);
  if (!D.length) return `<a class="card row" href="#/dreams" style="gap:10px;padding:10px 14px">${ic('star', 18)}<span style="flex:1;font-size:14px">اكتب أحلامك لسنة ${y} واربط الهدف بيها</span>${ic('chev', 16)}</a>`;
  return `<label class="card row" style="gap:10px;padding:10px 14px">${ic('star', 18)}<span style="font-size:14px;flex:none">بيخدم حلم</span><select class="inp" data-change="goal-dream" style="flex:1;min-height:38px;font-size:13px"><option value="">مش مربوط</option>${D.map(x => `<option value="${x.id}"${x.id === g.dream_id ? ' selected' : ''}>${x.track_id ? '' : '★ '}${esc(x.title.slice(0, 60))}</option>`).join('')}</select></label>`;
}
