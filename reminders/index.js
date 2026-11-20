// نوتة بلال — Worker التذكيرات على Cloudflare
// بيصحى كل 5 دقايق، يشوف إيه اللي ميعاده جه، ويبعت إشعار للآيفون.
//
// المتغيرات المطلوبة (Settings → Variables and Secrets):
//   SUPABASE_URL          لينك مشروع Supabase
//   SUPABASE_SERVICE_KEY  المفتاح السري (sb_secret_...) — Secret
//   VAPID_PUBLIC          المفتاح العام للإشعارات
//   VAPID_PRIVATE         المفتاح الخاص للإشعارات — Secret
//   VAPID_SUBJECT         mailto:إيميلك

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(runReminders(env)); },

  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    if (url.pathname === '/test' && req.method === 'POST') {
      // أي خطأ هنا بيرجع للتطبيق بسببه، بدل ما الـ Worker يقع ساكت
      try {
        const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'VAPID_PUBLIC', 'VAPID_PRIVATE'].filter(k => !env[k]);
        if (missing.length) return json({ error: 'ناقص في Cloudflare (Variables and Secrets): ' + missing.join('، ') }, 500);
        const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
        const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` } });
        if (!u.ok) return json({ error: 'unauthorized: ' + await u.text() }, 401);
        const user = await u.json();
        const log = [];
        const n = await sendToUser(env, user.id, { title: 'نوتة بلال', body: 'الإشعارات شغالة. هتوصلك التذكيرات في مواعيدها.', url: './#/settings' }, log);
        if (!n) return json({ error: log.join('\n') || 'ما اتبعتش' }, 404);
        return json({ sent: n, check: await checkUser(env, user.id) });
      } catch (e) {
        return json({ error: String(e && e.message || e) }, 500);
      }
    }
    return new Response('نوتة بلال: Worker التذكيرات شغال', { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};

// ---------------- التذكيرات ----------------
async function runReminders(env) {
  const profiles = await db(env, 'profiles?select=user_id,display_name,timezone,morning_reminder,morning_enabled,evening_reminder,evening_enabled');
  for (const p of profiles) {
    await beat(env, p.user_id).catch(() => {});   // بنسجل إن الـ Worker صحي لوحده (زرار "جرّب" بيعرضها)
    try { await remindUser(env, p); } catch (e) { console.error('reminders', p.user_id, e); }
  }
}

// كل نوع تذكير لوحده: لو واحد وقع، الباقي يكمل عادي
async function safe(label, fn) { try { await fn(); } catch (e) { console.error(label, e); } }

async function remindUser(env, p) {
  {
    const { date, minutes, dow } = localNow(p.timezone || 'Africa/Cairo');
    const dueMin = tm => tm <= minutes && tm > minutes - 15;
    const due = t => { if (!t) return false; const [h, m] = t.split(':').map(Number); return dueMin(h * 60 + m); };
    const uid = p.user_id, name = p.display_name || 'بلال';
    const open = await db(env, `tasks?select=id,title,top3_on,reminder_time,due_on&user_id=eq.${uid}&done=eq.false&archived_at=is.null&due_on=lte.${date}`);

    // المهام الأول، لأنها أهم حاجة. ولو غيّرت الساعة، المفتاح بيتغير فالتذكير الجديد بيتبعت
    await safe('tasks', async () => {
      for (const t of open) {
        if (t.due_on === date && due(t.reminder_time) && await claim(env, uid, `task:${t.id}:${date}:${t.reminder_time.slice(0, 5)}`)) {
          await sendToUser(env, uid, { title: 'تذكير', body: t.title, url: './#/today' });
        }
      }
    });

    await safe('morning-evening', async () => {
    if (p.morning_enabled && due(p.morning_reminder) && await claim(env, uid, `morning:${date}`)) {
      const top = open.filter(t => t.top3_on === date).map(t => t.title);
      const body = open.length ? `عندك ${tasksWord(open.length)} النهاردة${top.length ? '. أهمهم: ' + top.join('، ') : ''}` : 'مفيش مهام لسه. سجّل أهم حاجة النهاردة.';
      await sendToUser(env, uid, { title: `صباح الخير يا ${name}`, body, url: './#/today' });
    }
    if (p.evening_enabled && due(p.evening_reminder) && await claim(env, uid, `evening:${date}`)) {
      const all = await db(env, `tasks?select=done&user_id=eq.${uid}&archived_at=is.null&due_on=eq.${date}`);
      const done = all.filter(t => t.done).length;
      await sendToUser(env, uid, { title: 'راجع يومك', body: `خلصت ${done} من ${all.length} مهام النهاردة. سجّل رأيك في التيم واللي اتعمل.`, url: './#/today' });
    }
    });
    await safe('goals', async () => {
    const goals = await db(env, `goals?select=id,title,due_on,reminder_time&user_id=eq.${uid}&status=eq.active&archived_at=is.null&reminder_enabled=is.true`);
    for (const g of goals) {
      if (due(g.reminder_time) && await claim(env, uid, `goal:${g.id}:${date}`)) {
        const left = g.due_on ? Math.round((Date.parse(g.due_on) - Date.parse(date)) / 864e5) : null;
        await sendToUser(env, uid, { title: 'تذكير بهدف', body: g.title + (left === null ? '' : left < 0 ? ' — متأخر' : left === 0 ? ' — موعده النهاردة' : ` — باقي ${left} أيام`), url: `./#/goal/${g.id}` });
      }
    }
    });

    await safe('courses', async () => {
    // مواعيد الكورسات: كل ميعاد = يوم في الأسبوع + ساعة، والتذكير قبله بالوقت اللي اخترته
    const courses = await db(env, `courses?select=id,title,schedule,remind_before,schedule_until&user_id=eq.${uid}&status=eq.active&archived_at=is.null`).catch(() => []);
    for (const c of courses) {
      if (c.schedule_until && c.schedule_until < date) continue;
      const before = Number(c.remind_before) || 0;
      for (const s of Array.isArray(c.schedule) ? c.schedule : []) {
        if (!s || !s.time) continue;
        const [h, m] = s.time.split(':').map(Number);
        let tm = h * 60 + m - before, day = Number(s.day);
        if (tm < 0) { tm += 1440; day = (day + 6) % 7; }   // كورس بعد نص الليل بشوية: التذكير في اليوم اللي قبله
        if (day !== dow || !dueMin(tm)) continue;
        if (await claim(env, uid, `course:${c.id}:${date}:${s.day}:${s.time}`)) {
          await sendToUser(env, uid, { title: 'عندك كورس', body: `${c.title} — ${before ? `كمان ${beforeWord(before)} (الساعة ${fmtTime(s.time)})` : `دلوقتي، الساعة ${fmtTime(s.time)}`}`, url: './#/courses' });
        }
      }
    }
    });
  }
}

// ---------------- الفحص (لزرار "جرّب") ----------------
async function beat(env, userId) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/reminder_log?on_conflict=user_id,key`, {
    method: 'POST', headers: { ...auth(env), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: userId, key: 'cron:last', created_at: new Date().toISOString() }) });
}
async function checkUser(env, uid) {
  const out = { now: null, lastRun: null, tasks: [], errors: [] };
  try {
    const [p] = await db(env, `profiles?select=timezone&user_id=eq.${uid}`);
    const { date, minutes } = localNow(p?.timezone || 'Africa/Cairo');
    out.now = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const [b] = await db(env, `reminder_log?select=created_at&user_id=eq.${uid}&key=eq.cron:last`);
    out.lastRun = b ? b.created_at : null;
    const ts = await db(env, `tasks?select=id,title,reminder_time&user_id=eq.${uid}&done=eq.false&archived_at=is.null&due_on=eq.${date}&reminder_time=not.is.null&order=reminder_time`);
    const sent = new Set((await db(env, `reminder_log?select=key&user_id=eq.${uid}&key=like.task:*`)).map(x => x.key));
    out.tasks = ts.map(t => ({ title: t.title, time: t.reminder_time.slice(0, 5), sent: sent.has(`task:${t.id}:${date}:${t.reminder_time.slice(0, 5)}`) }));
  } catch (e) { out.errors.push(String(e.message || e)); }
  for (const [label, path] of [['الأهداف', `goals?select=id,reminder_time,reminder_enabled&user_id=eq.${uid}&limit=1`], ['الكورسات', `courses?select=id,schedule,remind_before,schedule_until&user_id=eq.${uid}&limit=1`]]) {
    try { await db(env, path); } catch (e) { out.errors.push(`${label}: ${String(e.message || e).slice(0, 200)}`); }
  }
  return out;
}

const tasksWord = n => n === 1 ? 'مهمة واحدة' : n === 2 ? 'مهمتين' : n <= 10 ? `${n} مهام` : `${n} مهمة`;
const beforeWord = m => m === 15 ? 'ربع ساعة' : m === 30 ? 'نص ساعة' : m === 60 ? 'ساعة' : `${m} دقيقة`;
const fmtTime = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`; };

function localNow(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, minutes: Number(parts.hour) * 60 + Number(parts.minute), dow: new Date(date + 'T12:00:00Z').getUTCDay() };
}

// بيسجل إن التذكير ده اتبعت. لو كان متسجل قبل كده بيرجع false، فمفيش إشعار بيتكرر
async function claim(env, userId, key) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/reminder_log?on_conflict=user_id,key`, {
    method: 'POST', headers: { ...auth(env), 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ user_id: userId, key }) });
  if (!r.ok) return false;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}

// log (اختياري): بيتكتب فيه سبب أي إشعار ما وصلش، عشان زرار "جرّب" يعرضه
async function sendToUser(env, userId, msg, log) {
  const subs = await db(env, `push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${userId}`);
  if (!subs.length && log) log.push('مفيش موبايل متسجل في push_subscriptions. دوس "فعّل" في التطبيق الأول.');
  let sent = 0;
  for (const s of subs) {
    const res = await webPush(env, s, JSON.stringify(msg));
    if (res.ok) { sent++; continue; }
    if (log) log.push(`Apple رد بـ ${res.status}: ${(await res.text()).slice(0, 300)}`);
    if (res.status === 404 || res.status === 410) await fetch(`${env.SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE', headers: auth(env) });
  }
  return sent;
}

// ---------------- Supabase ----------------
function auth(env) {
  const k = env.SUPABASE_SERVICE_KEY;
  return k.startsWith('eyJ') ? { apikey: k, Authorization: `Bearer ${k}` } : { apikey: k };
}
async function db(env, path) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: auth(env) });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

// ---------------- Web Push (VAPID + aes128gcm) ----------------
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
const concat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length; } return out; };
async function hmac(key, data) { const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', k, data)); }

async function vapidAuth(env, endpoint) {
  const pubKey = env.VAPID_PUBLIC.trim(), priv = env.VAPID_PRIVATE.trim();
  const pub = unb64u(pubKey);
  let key;
  try { key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: priv, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']); }
  catch (e) { throw new Error('VAPID_PRIVATE أو VAPID_PUBLIC في Cloudflare مش مظبوطين: ' + e.message); }
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: (env.VAPID_SUBJECT || 'mailto:admin@example.com').trim() })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${pubKey}`;
}

async function encryptPayload(p256dh, authSecret, plaintext) {
  const uaPub = unb64u(p256dh), secret = unb64u(authSecret);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const prkKey = await hmac(secret, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(plaintext), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);   // 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

async function webPush(env, sub, payload) {
  const body = await encryptPayload(sub.p256dh, sub.auth, payload);
  return fetch(sub.endpoint, { method: 'POST', body, headers: {
    Authorization: await vapidAuth(env, sub.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' } });
}
