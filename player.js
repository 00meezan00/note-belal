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

export default {
  watch: {
    keep: true,
    async render(p) {
      const k = kindOf(p.id), id = (p.id || '').slice(2), row = await one(tableOf(k), id);
      if (!row) return { title: 'المشغّل', back: '#/courses', html: '<div class="empty">الكورس ده مش موجود.</div>' };
      const yt = ytOf(row.url);
      // الصفحة ثابتة (الأرقام بتتملا بعدين)، عشان المزامنة متعيدش رسم الصفحة وتقفل الفيديو
      return {
        title: row.title, sub: k === 'media' ? 'بتسمع' : 'بتتفرج', back: '#/courses',
        html: yt ? `<div class="stack watch" data-wid="${esc(p.id)}">
          <div class="vid"><div id="ytp"></div><div class="vid-msg" id="vmsg">بيحمّل الفيديو…</div></div>
          <div class="card stack" style="gap:10px">
            <div id="wprog"></div>
            <div class="between"><span class="mut">السرعة</span><div class="seg" id="wspeed" style="flex:1;max-width:260px">${SPEEDS.map(s => `<button type="button" data-act="w-speed" data-v="${s}">${s}x</button>`).join('')}</div></div>
            <button type="button" class="btn sm dash" data-act="w-start">🏁 خلصت جزء قبل كده؟ حدد نقطة البداية</button>
          </div>
          <div class="seg wtabs" id="wtabs">${yt.list ? `<button type="button" class="on" data-act="w-tab" data-v="list">الفيديوهات</button>` : ''}<button type="button"${yt.list ? '' : ' class="on"'} data-act="w-tab" data-v="notes">${ic('edit', 15)}الدفتر</button><button type="button" data-act="w-tab" data-v="ask"><span class="ai-spark">✦</span>اسأل</button></div>
          <div id="wlist"${yt.list ? '' : ' hidden'}></div>
          <div id="wnotes"${yt.list ? ' hidden' : ''}></div>
          <div id="wask" hidden></div>
          <p class="mut" style="margin:0;line-height:1.7">النوتة بتحسب الوقت اللي اتفرجته فعلًا. لو قدّمت الفيديو، الجزء اللي فوّته مش بيتحسب. والفيديو اللي تخلص 90% منه بيتعلّم إنه خلص.</p>
          ${openLink(row.url)}
        </div>` : `<div class="empty">اللينك ده مش يوتيوب، فمش هينفع يشتغل جوه النوتة.<br><br>${openLink(row.url) || 'ضيف لينك يوتيوب للكورس الأول.'}</div>`,
      };
    },
    async after(main, p) {
      const box = main.querySelector('.watch'); if (!box) return;
      if (P && P.wid === p.id && P.box === box && box.isConnected) { paintAll(); return; }   // نفس الصفحة اترسمت تاني: المشغّل شغال زي ما هو
      await stop();
      const k = kindOf(p.id), id = p.id.slice(2), row = await one(tableOf(k), id);
      const yt = ytOf(row.url);
      P = { box, wid: p.id, kind: k, id, row, yt, elId: 'ytp', watch: JSON.parse(JSON.stringify(row.watch || {})), lastPos: {}, wall: 0, sessStart: null, dirty: false, timer: null, player: null };
      P.watch.v ||= {};
      const sp = Number(localStorage.getItem('nota.speed')) || 1;
      paintAll();
      if (!yt.list) openNotes();
      box.classList.toggle('noting', !yt.list);
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
            markSpeed(sp);
          },
          onStateChange: e => {
            if (e.data === 1) {
              P.sessStart ||= new Date(); const v = vidNow();
              if (P.pendingSeek && (!P.pendingSeek.v || P.pendingSeek.v === v)) { P.player.seekTo(P.pendingSeek.t, true); P.pendingSeek = null; }
              if (v) P.lastPos[v] = P.player.getCurrentTime();
            }
            if (e.data === 2 || e.data === 0) save();
            if (e.data === 0) flushDay();
          },
          onError: e => msg([101, 150, 153].includes(e.data) ? 'صاحب الفيديو قافل إنه يشتغل برّه يوتيوب. افتحه من اللينك تحت.' : 'الفيديو ده مش راضي يشتغل. افتحه من اللينك تحت.'),
        },
      });
      P.timer = setInterval(tick, 1000);
    },
    actions: {
      'w-speed'(el) { const s = Number(el.dataset.v); try { P?.player?.setPlaybackRate(s); } catch (e) {} localStorage.setItem('nota.speed', s); markSpeed(s); },
      'w-tab'(el) {
        const v = el.dataset.v;
        document.querySelectorAll('#wtabs button').forEach(b => b.classList.toggle('on', b === el));
        document.getElementById('wlist').hidden = v !== 'list'; document.getElementById('wnotes').hidden = v !== 'notes'; document.getElementById('wask').hidden = v !== 'ask';
        if (v === 'notes') openNotes(); else P?.notes?.show?.(false);
        if (v === 'notes' && P?.notes?.show) P.notes.show(true);
        if (v === 'ask') aiPanel(document.getElementById('wask'), aiCtx());
        P?.box.classList.toggle('noting', v !== 'list');
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
          ${P.yt.list ? `<label class="field"><span>خلصت الفيديوهات لحد</span><select name="upto"><option value="0">ولا فيديو لسه</option>${opts(items.map((x, i) => [i + 1, `${i + 1}. ${x.t || 'فيديو ' + (i + 1)}`]), P.yt.list ? doneUpTo(items) : 0)}</select></label>
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
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    },
  },
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
    seek: t => { try { P.player.seekTo(t, true); P.player.playVideo(); } catch (e) {} window.scrollTo({ top: 0, behavior: 'smooth' }); },
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });
}

async function stop() {
  if (!P) return;
  clearInterval(P.timer);
  try { P.notes && P.notes.destroy && P.notes.destroy(); } catch (e) {}
  aiReset();
  await save(); await flushDay();
  try { P.player && P.player.destroy(); } catch (e) {}
  P = null;
}
// لما تسيب الصفحة أو تقفل التطبيق: بنحفظ على طول
window.addEventListener('hashchange', () => { if (P && !location.hash.startsWith('#/watch/' + P.wid)) stop(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && P) { try { P.player?.pauseVideo(); } catch (e) {} save(); flushDay(); } });
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
function markSpeed(s) { document.querySelectorAll('#wspeed button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === s)); }
function paintAll() {
  if (!P) return;
  const t = totals(), pct = t.d ? Math.min(100, t.w / t.d * 100) : 0;
  const pe = document.getElementById('wprog');
  if (pe) pe.innerHTML = `${bat(pct, pct >= 99 ? 'done' : 'run')}
    <div class="mut" style="font-size:14px;line-height:1.6">${t.w >= 60 ? `اتفرجت ${durWords(t.w / 60)}` : t.w > 5 ? 'اتفرجت أقل من دقيقة' : 'لسه مبدأتش'}${t.d ? ` من ${durWords(t.d / 60)}` : ''}${P.yt.list && t.count ? ` · خلصت ${t.done} من ${t.count} فيديو` : ''}</div>`;
  const le = document.getElementById('wlist'); if (!le || !P.yt.list) return;
  const items = P.watch.items || [], V = P.watch.v, cur = P.watch.last;
  if (!items.length) { le.innerHTML = `<div class="mut" style="font-size:13px">${WORKER ? 'أسامي فيديوهات القايمة بتظهر هنا لما مفتاح يوتيوب يبقى في الـ Worker.' : ''}</div>`; return; }
  le.innerHTML = `<div class="card list wl">${items.map((x, i) => {
    const r = V[x.id] || {}, d = r.d || x.s || 0, p = d ? Math.min(1, (r.w || 0) / d) : 0, done = isDone(x.id);
    return `<div class="wl-it${x.id === cur ? ' here' : ''}">
      <button type="button" class="wl-n${done ? ' ok' : ''}" data-act="w-done" data-v="${x.id}" aria-label="${done ? 'رجّعه مش متفرّج عليه' : 'علّمه إنه خلص'}">${done ? ic('check', 14) : i + 1}</button>
      <button type="button" class="wl-go" data-act="w-play" data-v="${x.id}"><span class="wl-t">${esc(x.t || 'فيديو ' + (i + 1))}</span>
        <span class="mut" style="font-size:12px">${mmss(d)}${p > 0.02 && !done ? ` · اتفرجت ${Math.round(p * 100)}%` : ''}</span></button>
      ${x.id === cur ? `<span class="tag amb">هنا</span>` : ''}</div>`; }).join('')}</div>
    <div class="mut" style="font-size:12px;padding:6px 2px">دوس على الرقم عشان تعلّم الفيديو إنه خلص (أو ترجّعه).</div>`;
}
