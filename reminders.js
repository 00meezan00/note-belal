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
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    if (url.pathname === '/test' && req.method === 'POST') {
      const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
      const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` } });
      if (!u.ok) return new Response('unauthorized', { status: 401, headers: cors });
      const user = await u.json();
      const n = await sendToUser(env, user.id, { title: 'نوتة بلال', body: 'الإشعارات شغالة. هتوصلك التذكيرات في مواعيدها.', url: './#/settings' });
      return new Response(JSON.stringify({ sent: n }), { status: n ? 200 : 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    return new Response('نوتة بلال: Worker التذكيرات شغال', { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};

// ---------------- التذكيرات ----------------
async function runReminders(env) {
  const profiles = await db(env, 'profiles?select=user_id,display_name,timezone,morning_reminder,morning_enabled,evening_reminder,evening_enabled');
  for (const p of profiles) {
    const { date, minutes } = localNow(p.timezone || 'Africa/Cairo');
    const due = t => { if (!t) return false; const [h, m] = t.split(':').map(Number); const tm = h * 60 + m; return tm <= minutes && tm > minutes - 15; };
    const uid = p.user_id, name = p.display_name || 'بلال';
    const open = await db(env, `tasks?select=id,title,top3_on,reminder_time,due_on&user_id=eq.${uid}&done=eq.false&archived_at=is.null&due_on=lte.${date}`);

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
    const goals = await db(env, `goals?select=id,title,due_on,reminder_time&user_id=eq.${uid}&status=eq.active&archived_at=is.null&reminder_enabled=is.true`);
    for (const g of goals) {
      if (due(g.reminder_time) && await claim(env, uid, `goal:${g.id}:${date}`)) {
        const left = g.due_on ? Math.round((Date.parse(g.due_on) - Date.parse(date)) / 864e5) : null;
        await sendToUser(env, uid, { title: 'تذكير بهدف', body: g.title + (left === null ? '' : left < 0 ? ' — متأخر' : left === 0 ? ' — موعده النهاردة' : ` — باقي ${left} أيام`), url: `./#/goal/${g.id}` });
      }
    }
    for (const t of open) {
      if (t.due_on === date && due(t.reminder_time) && await claim(env, uid, `task:${t.id}:${date}`)) {
        await sendToUser(env, uid, { title: 'تذكير', body: t.title, url: './#/today' });
      }
    }
  }
}

const tasksWord = n => n === 1 ? 'مهمة واحدة' : n === 2 ? 'مهمتين' : n <= 10 ? `${n} مهام` : `${n} مهمة`;

function localNow(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
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

async function sendToUser(env, userId, msg) {
  const subs = await db(env, `push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${userId}`);
  let sent = 0;
  for (const s of subs) {
    const res = await webPush(env, s, JSON.stringify(msg));
    if (res.status === 404 || res.status === 410) await fetch(`${env.SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE', headers: auth(env) });
    else if (res.ok) sent++;
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
  const pub = unb64u(env.VAPID_PUBLIC);
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:admin@example.com' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
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
