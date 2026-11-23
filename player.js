// المشغّل: بتتفرج على فيديو أو قايمة يوتيوب جوه النوتة، وهي بتحسب اتفرجت قد إيه لوحدها
// - بتعدّ الثواني اللي اتفرجتها فعلًا (لو قدّمت الفيديو، الجزء اللي فوّته مش بيتحسب)
// - الفيديو اللي اتفرجت على 90% منه = درس خلص
// - بتفتكر وقفت فين، وتكمّلك من نفس المكان
// - الوقت اللي اتفرجته بيدخل "يومي" كوقت كورسات، ولو عندك ميعاد كورس النهاردة بيتعلّم "أخدته" لوحده
import { list, one, ins, upd, sb } from './db.js';
import * as CFG from './config.js';
import { esc, ic, bat, today, toast, openSheet, closeSheet, sheetEl, opts } from './ui.js';
import { mountNotes } from './notes.js';
import { aiPanel, aiGlobal, aiReset } from './ask.js';
import { ytOf, durWords, openLink } from './learn.js';
import { courseLate } from './more.js';

const WORKER = (CFG.WORKER_URL || '').replace(/\/$/, '');
const SPEEDS = [1, 1.25, 1.5, 2];
const DONE_AT = 0.9;
let P = null;   // المشغّل الشغال دلوقتي

const kindOf = id => (id || '').startsWith('m_') ? 'media' : 'course';
const tableOf = k => k === 'media' ? 'media' : 'courses';
const mmss = s => { s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };

// مكتبة يوتيوب الرسمية للمشغّل
let apiP;
function ytApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  return apiP ||= new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev && prev(); res(window.YT); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => { apiP = null; rej(new Error('net')); };
    document.head.appendChild(s);
  });
}

const VV = window.visualViewport;
const sv = d => `<svg viewBox="0 0 24 24" class="ic" width="20" height="20" aria-hidden="true">${d}</svg>`;
const G = {
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  shrink: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  grow: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  back: '<path d="M9 5l7 7-7 7"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};

// ---------------- الشاشة ----------------
// الفيديو عايش في "برواز" ثابت فوق الشاشة (#wshell) برّه الصفحة نفسها، عشان:
// 1) يفضل ظاهر وإنت بتكتب أو بتسأل  2) لو سبت الصفحة وهو شغال، يصغر في الركن ويكمّل وإنت بتتنقل في النوتة
function shell() {
  let s = document.getElementById('wshell');
  if (!s) { s = document.createElement('div'); s.id = 'wshell'; s.hidden = true; document.body.appendChild(s); }
  return s;
}
function buildShell() {
  const s = shell(), yt = P.yt;
  s.className = ''; s.hidden = false;
  s.innerHTML = `
    <div class="ws-bar">
      <button type="button" class="ws-ic" data-act="w-back" aria-label="رجوع">${sv(G.back)}</button>
      <div class="ws-t"><small>${P.kind === 'media' ? 'بتسمع' : 'بتتفرج'}</small><b>${esc(P.row.title)}</b></div>
      <button type="button" class="ws-ic" data-act="w-menu" aria-label="خيارات الفيديو">${sv(G.more)}</button>
    </div>
    <div class="ws-vid"><div id="ytp"></div><div class="vid-msg" id="vmsg">بيحمّل الفيديو…</div></div>
    <div class="ws-meter" id="wmeter"></div>
    <div class="ws-tabs" id="wtabs" role="tablist">
      ${yt.list ? `<button type="button" role="tab" data-act="w-tab" data-v="list">الفيديوهات <span class="ws-n" id="wcount"></span></button>` : ''}
      <button type="button" role="tab" data-act="w-tab" data-v="notes">${ic('edit', 15)}الدفتر</button>
      <button type="button" role="tab" data-act="w-tab" data-v="ask"><span class="ai-spark">✦</span>اسأل</button>
    </div>
    <div class="ws-away">
      <button type="button" data-act="w-pp" aria-label="شغّل أو وقّف" id="wpp">${sv(G.pause)}</button>
      <button type="button" data-act="w-return" aria-label="ارجع للكورس">${sv(G.grow)}</button>
      <button type="button" data-act="w-close" aria-label="اقفل الفيديو">${sv(G.x)}</button>
    </div>`;
  document.body.classList.add('w-on');
  measure();
}
// المسافة اللي المحتوى بيسيبها فوق عشان البرواز. مش بنقيسها لما يصغر عشان الكيبورد، عشان الكلام اللي بتكتبه ميتنططش
function measure() {
  const s = shell();
  if (s.hidden || s.classList.contains('away') || (P && P.kbMini)) return;
  document.body.style.setProperty('--wsh', s.offsetHeight + 'px');
}
// صغير ولا كبير؟ اختيارك بيكسب. لو مختارتش: الفيديوهات = كبير، الدفتر واسأل = صغير، والكيبورد مفتوح = صغير
const baseMini = () => P.size ? P.size === 'mini' : P.tab !== 'list';
const kbOpen = () => !!VV && innerHeight - VV.height > 140;
// البرواز بيمشي مع الشاشة الظاهرة (لما الكيبورد يفتح آيفون بيزق الصفحة)، وبيصغر لوحده وإنت بتكتب
function place() {
  const s = document.getElementById('wshell'); if (!s || s.hidden || !P) return;
  if (s.classList.contains('away')) { s.style.transform = ''; return; }
  s.style.transform = VV && VV.offsetTop ? `translateY(${VV.offsetTop}px)` : '';
  const base = baseMini(), mini = base || (kbOpen() && P.size !== 'big');
  P.kbMini = mini && !base;
  if (s.classList.contains('mini') !== mini) { s.classList.toggle('mini', mini); paintAll(); }
  measure();
}
let burst = 0;
function placeSoon() { cancelAnimationFrame(burst); const t0 = performance.now(); const go = () => { place(); if (performance.now() - t0 < 700) burst = requestAnimationFrame(go); }; go(); }
VV?.addEventListener('resize', placeSoon); VV?.addEventListener('scroll', place);
window.addEventListener('scroll', place, { passive: true });
document.addEventListener('focusin', placeSoon); document.addEventListener('focusout', () => setTimeout(placeSoon, 50));
window.addEventListener('resize', () => { measure(); place(); });

function setTab(v) {
  if (!P) return;
  if (v === 'list' && !P.yt.list) v = 'notes';
  P.tab = v;
  document.querySelectorAll('#wtabs button').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  const L = document.getElementById('wlist'), N = document.getElementById('wnotes'), A = document.getElementById('wask');
  if (!L) return;
  L.hidden = v !== 'list'; N.hidden = v !== 'notes'; A.hidden = v !== 'ask';
  if (v === 'notes') { if (P.notes && P.notes.show) P.notes.show(true); else openNotes(); } else P.notes?.show?.(false);
  if (v === 'ask') aiPanel(A, aiCtx());
  window.scrollTo({ top: 0 });
  place();
}

export default {
  watch: {
    keep: true,
    async render(p) {
      const k = kindOf(p.id), id = (p.id || '').slice(2), row = await one(tableOf(k), id);
      if (!row) return { title: 'المشغّل', back: '#/courses', html: '<div class="empty">الكورس ده مش موجود.</div>' };
      const yt = ytOf(row.url);
      // الصفحة نفسها فاضية تقريبًا: الفيديو والتبويبات في البرواز اللي فوق، وهنا المحتوى بس
      return {
        title: row.title, sub: k === 'media' ? 'بتسمع' : 'بتتفرج', back: '#/courses', noSearch: true,
        html: yt ? `<div class="watch" data-wid="${esc(p.id)}"><div id="wlist" hidden></div><div id="wnotes" hidden></div><div id="wask" hidden></div></div>`
          : `<div class="empty">اللينك ده مش يوتيوب، فمش هينفع يشتغل جوه النوتة.<br><br>${openLink(row.url) || 'ضيف لينك يوتيوب للكورس الأول.'}</div>`,
      };
    },
    async after(main, p) {
      const box = main.querySelector('.watch'); if (!box) return;
      // نفس الكورس شغال (يمكن كان صغير في الركن): نرجّعه مكانه من غير ما الفيديو يقف
      if (P && P.wid === p.id && P.player) {
        if (P.box === box && box.isConnected) { paintAll(); return; }
        P.box = box; P.notes = null;
        shell().classList.remove('away'); document.body.classList.add('w-on');
        paintAll(); setTab(P.tab || (P.yt.list ? 'list' : 'notes')); placeSoon();
        return;
      }
      await stop();
      const k = kindOf(p.id), id = p.id.slice(2), row = await one(tableOf(k), id);
      const yt = ytOf(row.url);
      P = { box, wid: p.id, kind: k, id, row, yt, watch: JSON.parse(JSON.stringify(row.watch || {})), lastPos: {}, wall: 0, sessStart: null, dirty: false, timer: null, player: null, tab: yt.list ? 'list' : 'notes', size: '' };
      P.watch.v ||= {};
      const sp = Number(localStorage.getItem('nota.speed')) || 1; P.speed = sp;
      buildShell(); paintAll(); setTab(P.tab);
      if (yt.list && !(P.watch.items || []).length) fetchItems();   // أسامي فيديوهات القايمة (من الـ Worker)
      let YT;
      try { YT = await ytApi(); } catch (e) { msg('محتاج نت عشان الفيديو يشتغل.'); return; }
      if (!P || P.wid !== p.id) return;
      const last = P.watch.last && P.watch.v[P.watch.last], startSeconds = last && last.p > 5 && last.p < (last.d || 1e9) - 10 ? Math.floor(last.p) : 0;
      const items = P.watch.items || [], idx = yt.list && P.watch.last ? Math.max(0, items.findIndex(x => x.id === P.watch.last)) : 0;
      P.player = new YT.Player('ytp', {
        width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, hl: 'ar' },
        events: {
          onReady: () => {
            msg('');
            if (yt.list) P.player.cuePlaylist({ listType: 'playlist', list: yt.list, index: idx, startSeconds });
            else P.player.cueVideoById({ videoId: yt.v, startSeconds });
            try { P.player.setPlaybackRate(sp); } catch (e) {}
          },
          onStateChange: e => {
            if (e.data === 1) {
              P.sessStart ||= new Date(); const v = vidNow();
              if (P.pendingSeek && (!P.pendingSeek.v || P.pendingSeek.v === v)) { P.player.seekTo(P.pendingSeek.t, true); P.pendingSeek = null; }
              if (v) P.lastPos[v] = P.player.getCurrentTime();
              try { P.player.setPlaybackRate(P.speed); } catch (_) {}
            }
            if (e.data === 2 || e.data === 0) save();
            if (e.data === 0) flushDay();
            paintPP();
          },
          onError: e => msg([101, 150, 153].includes(e.data) ? 'صاحب الفيديو قافل إنه يشتغل برّه يوتيوب. افتحه على يوتيوب من ⋯ فوق.' : 'الفيديو ده مش راضي يشتغل. افتحه على يوتيوب من ⋯ فوق.'),
        },
      });
      P.timer = setInterval(tick, 1000);
    },
    actions: {
      'w-tab'(el) { setTab(el.dataset.v); },
      'w-speed'() {   // زرار واحد بيلف على السرعات
        if (!P) return;
        const s = SPEEDS[(SPEEDS.indexOf(P.speed) + 1) % SPEEDS.length] || 1;
        P.speed = s; try { P.player?.setPlaybackRate(s); } catch (e) {}
        localStorage.setItem('nota.speed', s); paintAll();
      },
      'w-size'() { if (!P) return; P.size = shell().classList.contains('mini') ? 'big' : 'mini'; if (P.size === 'big' && kbOpen()) document.activeElement?.blur(); place(); },
      'w-back'() { if (history.length > 1) history.back(); else location.hash = '#/courses'; },
      'w-menu'() {
        if (!P) return;
        openSheet('الفيديو', `<div class="stack" style="gap:8px">
          <button class="btn" data-act="w-start">🏁 خلصت جزء قبل كده؟ حدد نقطة البداية</button>
          ${P.row.url ? `<a class="btn" href="${esc(/^https?:/i.test(P.row.url) ? P.row.url : 'https://' + P.row.url)}" target="_blank" rel="noopener">${sv(G.open)} افتحه على يوتيوب</a>` : ''}
          <p class="mut" style="margin:6px 2px 0;line-height:1.7">النوتة بتحسب الوقت اللي اتفرجته فعلًا: لو قدّمت الفيديو، الجزء اللي فوّته مش بيتحسب. والفيديو اللي تخلص 90% منه بيتعلّم إنه خلص.</p>
          <p class="mut" style="margin:0 2px;line-height:1.7">لو سبت الصفحة والفيديو شغال، هيصغر في الركن ويكمّل وإنت بتتنقل في النوتة.</p>
        </div>`);
      },
      ...aiGlobal,
      'w-done'(el) {   // علّم الفيديو إنه خلص (أو رجّعه)
        if (!P) return; const v = el.dataset.v, rec = P.watch.v[v] ||= { d: 0, w: 0, p: 0 };
        const d = rec.d || ((P.watch.items || []).find(x => x.id === v) || {}).s || 0;
        if (isDone(v)) { rec.done = false; if (d && rec.w >= DONE_AT * d) rec.w = Math.floor(DONE_AT * d) - 1; }
        else { rec.done = true; if (d) { rec.d = d; rec.w = d; } }
        P.dirty = true; save(); paintAll();
      },
      'w-start'() {
        if (!P) return;
        const items = itemsNow();
        openSheet('نقطة البداية', `<p class="mut" style="margin:0;line-height:1.7">لو اتفرجت على جزء من الكورس قبل كده، قولّي وصلت لحد فين. اللي قبله هيتحسب إنك خلصته، والفيديو هيبدأ من عندك.</p>
          ${P.yt.list ? `<label class="field"><span>خلصت الفيديوهات لحد</span><select name="upto"><option value="0">ولا فيديو لسه</option>${opts(items.map((x, i) => [i + 1, `${i + 1}. ${x.t || 'فيديو ' + (i + 1)}`]), doneUpTo(items))}</select></label>
          <label class="field"><span>وفي الفيديو اللي بعده وقفت عند (اختياري)</span><input name="pos" inputmode="text" placeholder="مثلًا 12:30 (دقايق:ثواني)"></label>`
          : `<label class="field"><span>وقفت عند</span><input name="pos" inputmode="text" autofocus placeholder="مثلًا 1:05:30 أو 12:30"></label>`}
          <small class="mut">الوقت يتكتب زي ما هو مكتوب على يوتيوب: 12:30 يعني 12 دقيقة و30 ثانية، و1:05:30 يعني ساعة و5 دقايق.</small>
          <button class="btn pri" data-act="w-start-save">ابدأ من هنا</button>`);
      },
      async 'w-start-save'() {
        if (!P) return;
        const f = sheetEl(), upto = Number(f.querySelector('[name=upto]')?.value || 0), pos = clockSecs(f.querySelector('[name=pos]').value);
        const items = itemsNow(), V = P.watch.v;
        if (P.yt.list) {
          if (upto > items.length) return toast('الرقم أكبر من عدد الفيديوهات');
          items.slice(0, upto).forEach(x => { const rec = V[x.id] ||= { d: 0, w: 0, p: 0 }; const d = rec.d || x.s || 0; rec.done = true; if (d) { rec.d = d; rec.w = Math.max(rec.w || 0, d); rec.p = d; } });
          const next = items[upto];
          if (next) { const rec = V[next.id] ||= { d: next.s || 0, w: 0, p: 0 }; if (pos) { rec.w = Math.max(rec.w || 0, pos); rec.p = pos; } P.watch.last = next.id; }
          P.dirty = true; await save(); closeSheet(); paintAll();
          try { if (next) P.player.cuePlaylist({ listType: 'playlist', list: P.yt.list, index: upto, startSeconds: pos || 0 }); } catch (e) {}
          toast(next ? `هتبدأ من فيديو ${upto + 1}${pos ? ' عند ' + mmss(pos) : ''}` : 'اتعلّموا كلهم إنك خلصتهم');
        } else {
          if (pos == null) return toast('اكتب وقفت عند كام');
          const v = P.yt.v, rec = V[v] ||= { d: 0, w: 0, p: 0 }; rec.w = Math.max(rec.w || 0, pos); rec.p = pos; P.watch.last = v;
          P.dirty = true; await save(); closeSheet(); paintAll();
          try { P.player.seekTo(pos, true); P.player.pauseVideo(); } catch (e) {}
          toast('هتبدأ من ' + mmss(pos));
        }
      },
      'w-play'(el) {
        if (!P?.player) return;
        const items = P.watch.items || [], i = items.findIndex(x => x.id === el.dataset.v);
        try { if (P.yt.list && i >= 0) P.player.playVideoAt(i); else P.player.loadVideoById(el.dataset.v); } catch (e) {}
      },
    },
  },
};

// أزرار البرواز الصغير (بتشتغل من أي صفحة في النوتة)
export const playerGlobal = {
  'w-pp'() { if (!P?.player) return; try { P.player.getPlayerState() === 1 ? P.player.pauseVideo() : P.player.playVideo(); } catch (e) {} },
  'w-return'() { if (P) location.hash = '#/watch/' + P.wid; },
  'w-close'() { stop(); },
};

// ---------------- الحساب ----------------
const isDone = id => { const r = P.watch.v[id]; if (!r) return false; if (r.done) return true; const d = r.d || ((P.watch.items || []).find(x => x.id === id) || {}).s || 0; return !!d && (r.w || 0) >= DONE_AT * d; };
// قايمة الفيديوهات: من الـ Worker (بأساميها) أو من المشغّل نفسه
const itemsNow = () => { const it = P.watch.items || []; if (it.length) return it; try { return (P.player.getPlaylist() || []).map(id => ({ id, t: '', s: (P.watch.v[id] || {}).d || 0 })); } catch (e) { return []; } };
const doneUpTo = items => { let k = 0; while (k < items.length && isDone(items[k].id)) k++; return k; };
// "1:05:30" / "12:30" / "١٢:٣٠" / "45" (دقايق) ← ثواني
function clockSecs(v) {
  v = String(v || '').replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776).trim();
  if (!v) return null;
  const p = v.split(/[:：.]/).map(x => parseInt(x)); if (p.some(isNaN)) return null;
  return p.length === 1 ? p[0] * 60 : p.reduce((s, x) => s * 60 + x, 0);
}
const vidNow = () => { try { return P.player.getVideoData().video_id || null; } catch (e) { return null; } };
function tick() {
  if (!P?.player || typeof P.player.getPlayerState !== 'function') return;
  if (P.player.getPlayerState() !== 1) return;
  const v = vidNow(); if (!v) return;
  const cur = P.player.getCurrentTime(), d = P.player.getDuration() || 0;
  const rec = P.watch.v[v] ||= { d: 0, w: 0, p: 0 };
  if (d) rec.d = Math.round(d);
  const prev = P.lastPos[v];
  const delta = prev == null ? 0 : cur - prev;
  if (delta > 0 && delta <= 4.5) rec.w = Math.min(rec.d || Infinity, (rec.w || 0) + delta);   // تفرّج عادي (حتى بسرعة 2x)، مش تقديم
  P.lastPos[v] = cur; rec.p = Math.round(cur); P.watch.last = v;
  P.wall++; P.dirty = true;
  if (P.wall % 15 === 0) save();
  if (P.wall % 5 === 0) paintAll();
}

function totals() {
  const items = P.watch.items || [], V = P.watch.v;
  const ids = items.length ? items.map(x => x.id) : Object.keys(V);
  const dOf = id => (V[id] && V[id].d) || (items.find(x => x.id === id) || {}).s || 0;
  const w = ids.reduce((s, id) => s + Math.min(dOf(id) || Infinity, (V[id] && V[id].w) || 0), 0);
  const d = ids.reduce((s, id) => s + dOf(id), 0);
  const done = ids.filter(isDone).length;
  return { w, d, done, count: P.yt.list ? (items.length || ids.length) : 1, ids, dOf };
}

async function save() {
  if (!P || !P.dirty) return; P.dirty = false;
  const t = totals(), r = P.row;
  const patch = { watch: P.watch, current_minutes: Math.round(t.w / 60) };
  if (t.d && (!r.total_minutes || P.yt.list || Math.abs(r.total_minutes - t.d / 60) > 1)) patch.total_minutes = Math.round(t.d / 60);
  if (P.kind === 'course' && P.yt.list) { patch.lessons_done = t.done; if (t.count) patch.lessons_total = t.count; }
  const finished = P.yt.list ? t.count && t.done >= t.count : t.d && t.w >= DONE_AT * t.d;
  if (finished && r.status !== 'done') { patch.status = 'done'; if (P.kind === 'media') patch.finished_on = today(); toast(P.kind === 'media' ? 'مبروك! خلصته. اكتب جواه اتعلمت منه إيه' : 'مبروك! الكورس خلص. متنساش تكتب طبقته في إيه'); }
  if (P.kind === 'media' && r.status === 'wishlist') patch.status = 'active';
  try { Object.assign(P.row, patch); await upd(tableOf(P.kind), P.id, patch); } catch (e) { console.error(e); }
}

// الوقت اللي اتفرجته بيدخل "يومي"، ولو عندك ميعاد كورس النهاردة ولسه مأكدتهوش، بيتعلّم "أخدته" بعد ربع ساعة تفرّج
async function flushDay() {
  if (!P || !P.sessStart || P.wall < 60) return;
  const start = P.sessStart, end = new Date(), secs = P.wall, text = (P.kind === 'media' ? 'سمعت: ' : 'كورس: ') + P.row.title;
  P.sessStart = null; P.wall = 0;
  try {
    await ins('day_logs', { on_date: today(), started_at: start.toISOString(), ended_at: new Date(Math.min(+end, +start + secs * 1000 + 6e4)).toISOString(), text, kind: 'course' });
    if (P.kind !== 'course') return;
    const c = await one('courses', P.id), lt = c && courseLate(c);
    if (!lt?.today) return;
    const logs = await list('day_logs', { eq: { on_date: today(), text } });
    const mins = logs.reduce((s, l) => s + (l.started_at && l.ended_at ? (Date.parse(l.ended_at) - Date.parse(l.started_at)) / 6e4 : 0), 0);
    if (mins >= 15) { await upd('courses', c.id, { sessions: { ...(c.sessions || {}), [lt.today.key]: 'done' } }); toast('ميعاد الكورس بتاع النهاردة اتعلّم "أخدته"'); }
  } catch (e) { console.error(e); }
}

// المساعد محتاج يعرف: الفيديو اللي شغال، وقفت فين، ويقدر يروح لوقت، ويحط في الدفتر
function aiCtx() {
  return {
    wid: P.wid, title: P.row.title,
    video: () => { const v = vidNow() || P.yt.v || P.watch.last; const it = itemsNow().find(x => x.id === v); return v ? { v, url: `https://www.youtube.com/watch?v=${v}`, title: (it && it.t) || P.row.title } : null; },
    now: () => { try { return P.player.getCurrentTime(); } catch (e) { return 0; } },
    seek: t => { try { P.player.seekTo(t, true); P.player.playVideo(); } catch (e) {} },
    cache: () => (P.watch.ai ||= {}),
    keep: () => { const A = P.watch.ai || {}, ks = Object.keys(A); if (ks.length > 20) for (const k of ks.slice(0, ks.length - 20)) delete A[k]; P.dirty = true; save(); },
    toNotes: async blocks => { await openNotes(); P.notes?.show?.(false); P.notes?.append?.(blocks); },
  };
}

async function openNotes() {
  if (!P || P.notes) return;
  const host = document.getElementById('wnotes'); if (!host) return;
  P.notes = true;
  const table = tableOf(P.kind);
  P.notes = await mountNotes(host, {
    table, id: P.id, label: 'بتتحفظ لوحدها. ⏱ بيحط وقت الفيديو دلوقتي، تدوس عليه بعدين والفيديو يرجع للحظة دي.',
    now: () => { try { const v = vidNow(), it = itemsNow(), i = it.findIndex(x => x.id === v); return { t: P.player.getCurrentTime(), v, vn: P.yt.list && i >= 0 ? i + 1 : null }; } catch (e) { return null; } },
    seek: (t, v) => {
      try {
        if (v && v !== vidNow() && P.yt.list) { const i = itemsNow().findIndex(x => x.id === v); if (i >= 0) { P.pendingSeek = { t, v }; P.player.playVideoAt(i); return; } }
        P.player.seekTo(t, true); P.player.playVideo();
      } catch (e) {}
    },
  });
}

async function stop() {
  if (!P) return;
  clearInterval(P.timer);
  try { P.notes && P.notes.destroy && P.notes.destroy(); } catch (e) {}
  aiReset();
  await save(); await flushDay();
  try { P && P.player && P.player.destroy(); } catch (e) {}
  P = null;
  const s = document.getElementById('wshell'); if (s) { s.hidden = true; s.innerHTML = ''; s.className = ''; s.style.transform = ''; }
  document.body.classList.remove('w-on');
}
// سبت صفحة الفيديو: لو شغال يصغر في الركن ويكمّل، ولو واقف يتقفل ويتحفظ
function leave() {
  if (!P) return;
  let playing = false; try { playing = P.player && P.player.getPlayerState() === 1; } catch (e) {}
  if (!playing) return stop();
  try { P.notes && P.notes.destroy && P.notes.destroy(); } catch (e) {}
  P.notes = null; aiReset(); save();
  document.body.classList.remove('w-on');
  const s = shell(); s.classList.remove('mini'); s.classList.add('away'); s.style.transform = '';
  paintPP();
}
window.addEventListener('hashchange', () => { if (P && !location.hash.startsWith('#/watch/' + P.wid)) leave(); });
// لما تقفل التطبيق: بنحفظ بس، ومش بنوقّف الفيديو بنفسنا (آيفون هو اللي بيقرر يكمّله ولا لأ)
document.addEventListener('visibilitychange', () => { if (document.hidden && P) { save(); flushDay(); } });
window.addEventListener('pagehide', () => { if (P) { save(); flushDay(); } });

async function fetchItems() {
  if (!WORKER || !navigator.onLine) return;
  const wid = P.wid;
  try {
    const { data } = await sb.auth.getSession();
    const r = await fetch(WORKER + '/duration', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: P.row.url }) });
    const j = await r.json();
    if (!P || P.wid !== wid || !Array.isArray(j.items) || !j.items.length) return;
    P.watch.items = j.items; P.dirty = true; save(); paintAll();
  } catch (e) {}
}

// ---------------- الرسم ----------------
function msg(t) { const m = document.getElementById('vmsg'); if (m) { m.textContent = t; m.hidden = !t; } }
function paintPP() {
  const b = document.getElementById('wpp'); if (!b || !P) return;
  let on = false; try { on = P.player.getPlayerState() === 1; } catch (e) {}
  b.innerHTML = sv(on ? G.pause : G.play); b.setAttribute('aria-label', on ? 'وقّف' : 'شغّل');
}
// العدّاد تحت الفيديو: خانة لكل فيديو في القايمة (أو 20 خانة للفيديو الواحد) بتتملي بالكهرمان وإنت بتتفرج
function meterCells(t) {
  const V = P.watch.v, items = P.watch.items || [], cur = vidNow() || P.watch.last;
  if (P.yt.list && t.ids.length) {
    const ids = t.ids, n = ids.length, per = Math.ceil(n / 48);   // قايمة طويلة: كل خانة كذا فيديو
    const cells = [];
    for (let i = 0; i < n; i += per) {
      const grp = ids.slice(i, i + per);
      const d = grp.reduce((x, id) => x + (t.dOf(id) || 0), 0), w = grp.reduce((x, id) => x + Math.min(t.dOf(id) || Infinity, (V[id] && V[id].w) || 0), 0);
      const done = grp.every(isDone), f = done ? 100 : d ? Math.min(100, w / d * 100) : 0;
      cells.push(`<i class="${done ? 'ok' : ''}${grp.includes(cur) ? ' here' : ''}" style="--f:${f.toFixed(1)}%"></i>`);
    }
    return cells.join('');
  }
  const pct = t.d ? t.w / t.d * 100 : 0;
  return Array.from({ length: 20 }, (_, i) => { const f = Math.max(0, Math.min(100, (pct - i * 5) * 20)); return `<i class="${pct >= 99 ? 'ok' : ''}" style="--f:${f.toFixed(1)}%"></i>`; }).join('');
}
function paintAll() {
  if (!P) return;
  const t = totals(), pct = t.d ? Math.min(100, t.w / t.d * 100) : 0, mini = shell().classList.contains('mini');
  const me = document.getElementById('wmeter');
  if (me) me.innerHTML = `<div class="wm-cells" role="img" aria-label="اتفرجت ${Math.round(pct)}%">${meterCells(t)}</div>
    <div class="wm-row">
      <span class="wm-txt"><b class="num">${Math.round(pct)}%</b>${P.yt.list && t.count ? ` · <span class="num">${t.done}/${t.count}</span> فيديو` : ''}${!mini && t.w >= 60 ? ` · اتفرجت ${durWords(t.w / 60)}${t.d ? ` من ${durWords(t.d / 60)}` : ''}` : ''}</span>
      <button type="button" class="wm-chip num" data-act="w-speed" aria-label="السرعة ${P.speed}x، دوس تغيّرها">${P.speed}x</button>
      <button type="button" class="wm-chip wm-ic" data-act="w-size" aria-label="${mini ? 'كبّر الفيديو' : 'صغّر الفيديو'}">${sv(mini ? G.grow : G.shrink)}</button>
    </div>`;
  const cn = document.getElementById('wcount'); if (cn) cn.textContent = t.count ? `${t.done}/${t.count}` : '';
  const le = document.getElementById('wlist'); if (!le || !P.yt.list) return;
  const items = P.watch.items || [], V = P.watch.v, cur = P.watch.last;
  if (!items.length) { le.innerHTML = `<div class="empty" style="padding:30px 10px">${WORKER ? 'أسامي فيديوهات القايمة بتظهر هنا لما مفتاح يوتيوب يبقى في الـ Worker.' : 'مفيش قايمة.'}</div>`; return; }
  le.innerHTML = `<ol class="wl">${items.map((x, i) => {
    const r = V[x.id] || {}, d = r.d || x.s || 0, p = d ? Math.min(1, (r.w || 0) / d) : 0, done = isDone(x.id), here = x.id === cur;
    return `<li class="wl-it${here ? ' here' : ''}${done ? ' ok' : ''}">
      <button type="button" class="wl-n" data-act="w-done" data-v="${x.id}" aria-label="${done ? 'رجّعه مش متفرّج عليه' : 'علّمه إنه خلص'}">${done ? ic('check', 14) : `<span class="num">${i + 1}</span>`}</button>
      <button type="button" class="wl-go" data-act="w-play" data-v="${x.id}"><span class="wl-t">${esc(x.t || 'فيديو ' + (i + 1))}</span>
        <span class="wl-m"><span class="num">${mmss(d)}</span>${here ? '<b>هنا</b>' : ''}${p > 0.02 && !done ? `<span class="wl-bar"><i style="width:${Math.round(p * 100)}%"></i></span>` : ''}</span></button></li>`; }).join('')}</ol>
    <p class="mut" style="font-size:12px;padding:8px 4px 0;margin:0">دوس على الرقم عشان تعلّم الفيديو إنه خلص أو ترجّعه.</p>`;
}
