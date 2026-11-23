// المشغّل: بتتفرج على فيديو أو قايمة يوتيوب جوه النوتة، وهي بتحسب اتفرجت قد إيه لوحدها
// - بتعدّ الثواني اللي اتفرجتها فعلًا (لو قدّمت الفيديو، الجزء اللي فوّته مش بيتحسب)
// - الفيديو اللي اتفرجت على 90% منه = درس خلص
// - بتفتكر وقفت فين، وتكمّلك من نفس المكان
// - الوقت اللي اتفرجته بيدخل "يومي" كوقت كورسات، ولو عندك ميعاد كورس النهاردة بيتعلّم "أخدته" لوحده
import { list, one, ins, upd, sb } from './db.js';
import * as CFG from './config.js';
import { esc, ic, bat, today, toast } from './ui.js';
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
          </div>
          <div id="wlist"></div>
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
            if (e.data === 1) { P.sessStart ||= new Date(); const v = vidNow(); if (v) P.lastPos[v] = P.player.getCurrentTime(); }
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
  const done = ids.filter(id => dOf(id) && (V[id]?.w || 0) >= DONE_AT * dOf(id)).length;
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

async function stop() {
  if (!P) return;
  clearInterval(P.timer);
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
    const r = V[x.id] || {}, d = r.d || x.s || 0, p = d ? Math.min(1, (r.w || 0) / d) : 0, done = p >= DONE_AT;
    return `<button type="button" class="wl-it${x.id === cur ? ' here' : ''}" data-act="w-play" data-v="${x.id}">
      <span class="wl-n${done ? ' ok' : ''}">${done ? ic('check', 14) : i + 1}</span>
      <span style="flex:1;min-width:0;text-align:start"><span class="wl-t">${esc(x.t || 'فيديو ' + (i + 1))}</span>
        <span class="mut" style="font-size:12px">${mmss(d)}${p > 0.02 && !done ? ` · اتفرجت ${Math.round(p * 100)}%` : ''}</span></span>
      ${x.id === cur ? `<span class="tag amb">هنا</span>` : ''}</button>`; }).join('')}</div>`;
}
