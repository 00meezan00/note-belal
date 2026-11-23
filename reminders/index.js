// نوتة بلال — Worker التذكيرات على Cloudflare
// بيصحى كل 5 دقايق، يشوف إيه اللي ميعاده جه، ويبعت إشعار للآيفون.
//
// المتغيرات المطلوبة (Settings → Variables and Secrets):
//   SUPABASE_URL          لينك مشروع Supabase
//   SUPABASE_SERVICE_KEY  المفتاح السري (sb_secret_...) — Secret
//   VAPID_PUBLIC          المفتاح العام للإشعارات
//   VAPID_PRIVATE         المفتاح الخاص للإشعارات — Secret
//   VAPID_SUBJECT         mailto:إيميلك
//   YOUTUBE_KEY           مفتاح YouTube Data API (اختياري) — عشان "هات المدة" يشتغل مع يوتيوب — Secret
//   GEMINI_KEY            مفتاح Gemini من Google AI Studio (اختياري) — عشان "✦ اسأل" في المشغّل — Secret
//   GEMINI_MODEL          (اختياري) اسم موديل Gemini لو عايز تغيّره

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(runReminders(env)); },

  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    // اختصار سيري: بيبعت الكلام هنا بالمفتاح بتاعك، وبيتحط في صندوق الوارد
    if (url.pathname === '/inbox' && req.method === 'POST') {
      try {
        const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
        if (!/^[a-f0-9]{20,}$/.test(tok)) return json({ error: 'المفتاح مش مظبوط' }, 401);
        const raw = await req.text(); let text = raw;
        try { const j = JSON.parse(raw); text = j.text ?? j['النص'] ?? Object.values(j)[0]; } catch (_) {}
        text = String(text || '').trim().slice(0, 4000);
        if (!text) return json({ error: 'مفيش كلام' }, 400);
        const [p] = await db(env, `profiles?select=user_id&shortcut_token=eq.${tok}`);
        if (!p) return json({ error: 'المفتاح ده مش شغال. اعمل مفتاح جديد من الإعدادات' }, 401);
        const r = await fetch(`${env.SUPABASE_URL}/rest/v1/inbox`, { method: 'POST', headers: { ...auth(env), 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: p.user_id, text }) });
        if (!r.ok) return json({ error: 'ما اتحفظش: ' + (await r.text()).slice(0, 200) }, 500);
        return json({ ok: true, saved: text });
      } catch (e) { return json({ error: String(e && e.message || e) }, 500); }
    }
    // تعلّمي: بتبعت لينك كورس أو بودكاست، والـ Worker يفتحه ويرجّع مدته (ولو قايمة يوتيوب: عدد الفيديوهات)
    if (url.pathname === '/duration' && req.method === 'POST') {
      try {
        const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` } });
        if (!u.ok) return json({ error: 'لازم تكون داخل على النوتة' }, 401);
        const { url: link } = await req.json();
        return json(await linkDuration(String(link || '').trim(), env));
      } catch (e) { return json({ error: 'ما قدرتش أفتح اللينك: ' + String(e && e.message || e).slice(0, 120) }, 500); }
    }
    // ✦ اسأل: Gemini بيتفرج على فيديو يوتيوب ويلخّصه أو يجاوب سؤال
    if (url.pathname === '/ai' && req.method === 'POST') {
      try {
        const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` } });
        if (!u.ok) return json({ error: 'لازم تكون داخل على النوتة' }, 401);
        if (!env.GEMINI_KEY) return json({ error: 'محتاج مفتاح GEMINI_KEY في الـ Worker (Settings ← Variables and Secrets)' }, 400);
        return json(await aiRun(env, await req.json()));
      } catch (e) { return json({ error: String(e && e.message || e).slice(0, 220) }, 500); }
    }
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
        // "شوف ملخص الصبح": بيبعت الملخص دلوقتي بدل ما تستنى للصبح
        if (url.searchParams.get('morning')) {
          const [p] = await db(env, `profiles?select=user_id,display_name,timezone&user_id=eq.${user.id}`);
          const m = await morningSummary(env, p || { user_id: user.id });
          const sent = await sendToUser(env, user.id, m, log);
          if (!sent) return json({ error: log.join('\n') || 'ما اتبعتش' }, 404);
          return json({ sent, morning: m.body });
        }
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
      await sendToUser(env, uid, await morningSummary(env, p, open));
    }
    if (p.evening_enabled && due(p.evening_reminder) && await claim(env, uid, `evening:${date}`)) {
      const all = await db(env, `tasks?select=done&user_id=eq.${uid}&archived_at=is.null&due_on=eq.${date}`);
      const done = all.filter(t => t.done).length;
      await sendToUser(env, uid, { title: 'راجع يومك', body: `خلصت ${done} من ${all.length} مهام النهاردة. اكتب يومك كان عامل إزاي.`, url: './#/day?tab=lines' });
    }
    });
    // المناسبات: قبلها بيومين، ويومها (الساعة 9 الصبح أو بعدها أول ما الـ Worker يصحى)
    await safe('occasions', async () => {
      if (minutes < 9 * 60) return;
      const occ = await db(env, `occasions?select=id,title,person,on_date,yearly,remind_days&user_id=eq.${uid}&archived_at=is.null`);
      for (const o of occ) {
        const nx = occNext(o, date); if (!nx) continue;
        const left = Math.round((Date.parse(nx) - Date.parse(date)) / 864e5), before = o.remind_days ?? 2;
        if ((left === 0 || left === before) && await claim(env, uid, `occ:${o.id}:${nx}:${left}`)) {
          await sendToUser(env, uid, { title: left === 0 ? 'النهاردة مناسبة 🎉' : `بعد ${before === 2 ? 'يومين' : before + ' أيام'}: مناسبة`, body: o.title + (o.person ? ` (${o.person})` : ''), url: './#/life' });
        }
      }
    });
    // ميزان الحياة: آخر يوم في الشهر الساعة 9 بالليل
    await safe('wheel', async () => {
      const lastDay = new Date(Date.parse(date + 'T12:00:00Z') + 864e5).toISOString().slice(8, 10) === '01';
      if (lastDay && minutes >= 21 * 60 && await claim(env, uid, `wheel:${date.slice(0, 7)}`))
        await sendToUser(env, uid, { title: 'ميزان حياتك', body: 'الشهر خلص. قيّم كل مسار من 1 لـ 10 في دقيقة، وشوف أنهي ناحية محتاجة اهتمام.', url: './#/life?wheel=1' });
    });
    // النسخة الاحتياطية: كل جمعة الساعة 8 بالليل (لو التذكير شغال)
    await safe('backup', async () => {
      if (dow !== 5 || minutes < 20 * 60) return;
      const [b] = await db(env, `profiles?select=backup_enabled&user_id=eq.${uid}`);
      if (b && b.backup_enabled === false) return;
      if (await claim(env, uid, `backup:${date}`)) await sendToUser(env, uid, { title: 'نسخة الأسبوع', body: 'دوس هنا وانزّل نسخة احتياطية من النوتة في ثانية.', url: './#/backup' });
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

    // تذكير الأفكار: الأفكار العادية + أفكار التطوير في المشاريع. كل فكرة ليها يوم + ساعة.
    // لو الـ Worker فوّت الميعاد لأي سبب، بيبعته أول ما يصحى (لحد يوم بعده)، ومفيش تكرار
    const since = prevDate(date);
    for (const [table, kind, title, link] of [['ideas', 'idea', 'تذكير بفكرة', id => `./#/idea/${id}`], ['project_devs', 'dev', 'تذكير بفكرة في مشروع', id => `./#/dev/${id}`]]) {
      await safe(table, async () => {
        const rows = await db(env, `${table}?select=id,title,remind_on,remind_time${table === 'project_devs' ? ',project_id' : ''}&user_id=eq.${uid}&archived_at=is.null&remind_on=gte.${since}&remind_on=lte.${date}`);
        if (!rows.length) return;
        const names = table === 'project_devs' ? Object.fromEntries((await db(env, `projects?select=id,name&user_id=eq.${uid}`).catch(() => [])).map(x => [x.id, x.name])) : {};
        for (const r of rows) {
          const t = (r.remind_time || '10:00').slice(0, 5);
          const [h, m] = t.split(':').map(Number);
          if (r.remind_on === date && h * 60 + m > minutes) continue;   // لسه ميعاده مجاش
          if (await claim(env, uid, `${kind}:${r.id}:${r.remind_on}:${t}`)) {
            await sendToUser(env, uid, { title: names[r.project_id] ? `${title} · ${names[r.project_id]}` : title, body: r.title, url: link(r.id) });
          }
        }
      });
    }
  }
}

// ---------------- ملخص الصبح ----------------
// إشعار واحد فيه كل اللي محتاج تعرفه عن يومك: المهام، المتأخر، كورسات النهاردة، الكورسات اللي فاتتك، وتذكيرات الأفكار.
// كل جزء لوحده: لو جدول فيه مشكلة، الباقي بيظهر عادي
async function morningSummary(env, p, open) {
  const { date, dow } = localNow(p.timezone || 'Africa/Cairo');
  const uid = p.user_id, name = p.display_name || 'بلال', L = [];
  open = open || await db(env, `tasks?select=id,title,top3_on,due_on&user_id=eq.${uid}&done=eq.false&archived_at=is.null&due_on=lte.${date}`).catch(() => []);
  const todayT = open.filter(t => t.due_on === date), lateT = open.filter(t => t.due_on < date);
  const top = open.filter(t => t.top3_on === date).map(t => t.title);
  L.push(todayT.length ? `• عندك ${tasksWord(todayT.length)} النهاردة${top.length ? '. أهمهم: ' + top.join('، ') : ''}` : '• مفيش مهام النهاردة لسه. سجّل أهم حاجة.');
  if (lateT.length) L.push(`• ${tasksWord(lateT.length)} متأخر${lateT.length === 1 ? 'ة' : 'ين'} من أيام فاتت`);

  const courses = await db(env, `courses?select=id,title,schedule,sessions,track_from,schedule_until&user_id=eq.${uid}&status=eq.active&archived_at=is.null`)
    .catch(() => db(env, `courses?select=id,title,schedule,schedule_until&user_id=eq.${uid}&status=eq.active&archived_at=is.null`)).catch(() => []);
  const todayC = [], lateC = [];
  for (const c of courses) {
    const S = Array.isArray(c.schedule) ? c.schedule : [];
    if (!(c.schedule_until && c.schedule_until < date)) for (const s of S) if (s && s.time && Number(s.day) === dow) todayC.push({ t: s.time, title: c.title });
    const m = courseMissed(c, date);
    if (m.n) lateC.push({ ...m, title: c.title });
  }
  todayC.sort((a, b) => a.t.localeCompare(b.t));
  if (todayC.length) L.push(`• كورسات النهاردة: ${todayC.map(x => `${x.title} ${fmtTime(x.t)}`).join('، ')}`);
  lateC.sort((a, b) => b.days - a.days);
  for (const c of lateC.slice(0, 3)) L.push(`• متأخر ${daysWord(c.days)} على ${c.title} (فاتك ${sessWord(c.n)})`);

  // العادات اللي عليك النهاردة
  const habits = await db(env, `habits?select=title,days,active&user_id=eq.${uid}&archived_at=is.null`).catch(() => []);
  const todayH = habits.filter(h => h.active !== false && (!Array.isArray(h.days) || !h.days.length || h.days.map(Number).includes(dow)));
  if (todayH.length) L.push(`• عادات النهاردة: ${todayH.map(h => h.title).join('، ')}`);

  // مستني من حد وميعاده جه، وصندوق الوارد
  const waits = await db(env, `waiting_for?select=who,text,due_on&user_id=eq.${uid}&done=eq.false&archived_at=is.null&due_on=lte.${date}`).catch(() => []);
  if (waits.length === 1) L.push(`• مستني من ${waits[0].who}: ${waits[0].text}`);
  else if (waits.length) L.push(`• مستني ${waits.length} حاجات من ناس وميعادها جه (${[...new Set(waits.map(w => w.who))].slice(0, 3).join('، ')})`);
  const inbox = await db(env, `inbox?select=id&user_id=eq.${uid}&archived_at=is.null`).catch(() => []);
  if (inbox.length >= 3) L.push(`• في صندوق الوارد ${inbox.length} حاجات مستنية ترتّبها`);

  let ideas = [];
  for (const t of ['ideas', 'project_devs']) ideas = ideas.concat(await db(env, `${t}?select=title,remind_time&user_id=eq.${uid}&archived_at=is.null&remind_on=eq.${date}`).catch(() => []));
  if (ideas.length === 1) L.push(`• فكرة هتفكّرك بيها النهاردة: ${ideas[0].title}`);
  else if (ideas.length) L.push(`• ${ideas.length} أفكار هتفكّرك بيها النهاردة`);

  // قرارات جه ميعاد مراجعتها، ومناسبات قريبة (خلال 3 أيام)
  const decs = await db(env, `decisions?select=title&user_id=eq.${uid}&archived_at=is.null&outcome=is.null&review_on=lte.${date}`).catch(() => []);
  if (decs.length === 1) L.push(`• قرار جه ميعاد مراجعته: ${decs[0].title}`);
  else if (decs.length) L.push(`• ${decs.length} قرارات جه ميعاد مراجعتها`);
  const occ = (await db(env, `occasions?select=title,person,on_date,yearly&user_id=eq.${uid}&archived_at=is.null`).catch(() => []))
    .map(o => ({ o, nx: occNext(o, date) })).filter(x => x.nx).map(x => ({ ...x, left: Math.round((Date.parse(x.nx) - Date.parse(date)) / 864e5) })).filter(x => x.left <= 3).sort((a, b) => a.left - b.left);
  for (const x of occ.slice(0, 3)) L.push(`• ${x.left === 0 ? 'النهاردة' : x.left === 1 ? 'بكرة' : x.left === 2 ? 'بعد بكرة' : 'بعد 3 أيام'}: ${x.o.title}${x.o.person ? ` (${x.o.person})` : ''}`);

  return { title: `صباح الخير يا ${name}`, body: L.join('\n'), url: lateC.length ? './#/courses' : './#/today' };
}

// المواعيد اللي فاتتك في كورس (يومها خلص ومأكدتش إنك أخدتها). نفس حسبة صفحة الكورسات
function courseMissed(c, date) {
  const L = Array.isArray(c.schedule) ? c.schedule : [], S = c.sessions || {};
  if (!L.length || !c.track_from) return { n: 0, days: 0 };
  const yest = prevDate(date), end = c.schedule_until && c.schedule_until < yest ? c.schedule_until : yest;
  let d = c.track_from, n = 0, first = null;
  const min = new Date(Date.parse(date + 'T12:00:00Z') - 180 * 864e5).toISOString().slice(0, 10);
  if (d < min) d = min;
  for (; d <= end; d = new Date(Date.parse(d + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10)) {
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    for (const s of L) if (s && s.time && Number(s.day) === dow && !S[`${d} ${s.time}`]) { n++; first = first || d; }
  }
  return { n, days: first ? Math.round((Date.parse(date) - Date.parse(first)) / 864e5) : 0 };
}
const daysWord = d => d === 1 ? 'يوم واحد' : d === 2 ? 'يومين' : d <= 10 ? `${d} أيام` : `${d} يوم`;
const sessWord = k => k === 1 ? 'ميعاد واحد' : k === 2 ? 'ميعادين' : k <= 10 ? `${k} مواعيد` : `${k} ميعاد`;

// ---------------- الفحص (لزرار "جرّب") ----------------
async function beat(env, userId) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/reminder_log?on_conflict=user_id,key`, {
    method: 'POST', headers: { ...auth(env), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: userId, key: 'cron:last', created_at: new Date().toISOString() }) });
}
async function checkUser(env, uid) {
  // كل جزء في الفحص لوحده: لو واحد وقع، الباقي بيكمل
  const out = { now: null, lastRun: null, lastRunKnown: true, tasks: [], tasksKnown: true, errors: [] };
  let date = null;
  try {
    const [p] = await db(env, `profiles?select=timezone&user_id=eq.${uid}`);
    const t = localNow(p?.timezone || 'Africa/Cairo'); date = t.date;
    out.now = `${String(Math.floor(t.minutes / 60)).padStart(2, '0')}:${String(t.minutes % 60).padStart(2, '0')}`;
  } catch (e) { out.errors.push('الساعة: ' + String(e.message || e).slice(0, 200)); date = localNow('Africa/Cairo').date; }
  try {
    const [b] = await db(env, `reminder_log?select=created_at&user_id=eq.${uid}&key=eq.cron:last`);
    out.lastRun = b ? b.created_at : null;
  } catch (e) { out.lastRunKnown = false; out.errors.push('سجل التذكيرات: ' + String(e.message || e).slice(0, 200)); }
  try {
    const ts = await db(env, `tasks?select=id,title,reminder_time&user_id=eq.${uid}&done=eq.false&archived_at=is.null&due_on=eq.${date}&reminder_time=not.is.null&order=reminder_time`);
    const sent = new Set((await db(env, `reminder_log?select=key&user_id=eq.${uid}&key=like.task:*`).catch(() => [])).map(x => x.key));
    out.tasks = ts.map(t => ({ title: t.title, time: t.reminder_time.slice(0, 5), sent: sent.has(`task:${t.id}:${date}:${t.reminder_time.slice(0, 5)}`) }));
  } catch (e) { out.tasksKnown = false; out.errors.push('المهام: ' + String(e.message || e).slice(0, 200)); }
  for (const [label, path] of [['الأهداف', `goals?select=id,reminder_time,reminder_enabled&user_id=eq.${uid}&limit=1`], ['الكورسات', `courses?select=id,schedule,remind_before,schedule_until&user_id=eq.${uid}&limit=1`],
    ['تذكير الأفكار', `ideas?select=id,remind_on,remind_time&user_id=eq.${uid}&limit=1`], ['تذكير أفكار المشاريع', `project_devs?select=id,remind_on,remind_time&user_id=eq.${uid}&limit=1`]]) {
    try { await db(env, path); } catch (e) { out.errors.push(`${label}: ${String(e.message || e).slice(0, 200)}`); }
  }
  return out;
}

const tasksWord = n => n === 1 ? 'مهمة واحدة' : n === 2 ? 'مهمتين' : n <= 10 ? `${n} مهام` : `${n} مهمة`;
const beforeWord = m => m === 15 ? 'ربع ساعة' : m === 30 ? 'نص ساعة' : m === 60 ? 'ساعة' : `${m} دقيقة`;
const fmtTime = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`; };
const prevDate = d => new Date(Date.parse(d + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);

function localNow(tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, minutes: Number(parts.hour) * 60 + Number(parts.minute), dow: new Date(date + 'T12:00:00Z').getUTCDay() };
}

// بيسجل إن التذكير ده اتبعت. لو كان متسجل قبل كده بيرجع false، فمفيش إشعار بيتكرر
// أقرب مرة جاية للمناسبة (لو بتتكرر كل سنة)
function occNext(o, t) {
  if (!o.on_date) return null;
  if (!o.yearly) return o.on_date >= t ? o.on_date : null;
  const md = o.on_date.slice(5), y = Number(t.slice(0, 4));
  const fix = yy => md === '02-29' && !(yy % 4 === 0 && (yy % 100 !== 0 || yy % 400 === 0)) ? `${yy}-02-28` : `${yy}-${md}`;
  return fix(y) >= t ? fix(y) : fix(y + 1);
}
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


// ======================= مدة الكورس أو البودكاست من اللينك =======================
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.8,ar;q=0.6', Cookie: 'CONSENT=YES+cb; SOCS=CAI' };
// "PT1H30M" أو "P1DT2H" ← ثواني
function isoSecs(v) {
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(String(v || '').trim());
  if (!m || !(m[1] || m[2] || m[3] || m[4])) return null;
  return Math.round((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0));
}
// "1:02:03" أو "45:10" أو "2700" ← ثواني
function clockSecs(v) {
  v = String(v || '').trim(); if (!v) return null;
  if (/^P/i.test(v)) return isoSecs(v);
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(+v);
  const p = v.split(':').map(Number); if (p.some(isNaN)) return null;
  return p.reduce((s, x) => s * 60 + x, 0);
}
const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const titleOf = h => decode((/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.exec(h) || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title/i.exec(h) || /<title[^>]*>([^<]+)/i.exec(h) || [])[1]).replace(/\s*-\s*YouTube$/, '') || null;
const result = (secs, title, extra = {}) => secs > 0 ? { minutes: Math.max(1, Math.round(secs / 60)), title, ...extra } : null;

async function getText(u) {
  const r = await fetch(u, { headers: UA, redirect: 'follow', cf: { cacheTtl: 3600 } });
  if (r.status === 429 || r.status === 403) throw new Error(/youtu/.test(u) ? 'يوتيوب رافض يفتح لـ Cloudflare. حط مفتاح YOUTUBE_KEY في الـ Worker' : 'الموقع رافض يفتح لـ Cloudflare (' + r.status + ')');
  if (!r.ok) throw new Error('الموقع رجّع ' + r.status);
  return { text: (await r.text()).slice(0, 6_000_000), type: r.headers.get('content-type') || '' };
}

// يوتيوب: فيديو واحد أو قايمة تشغيل (كورس)
function ytPlaylistFrom(h) {
  const seen = new Map();
  const re = /"playlistVideoRenderer":\{"videoId":"([\w-]{11})"/g; let m;
  while ((m = re.exec(h))) {
    const chunk = h.slice(m.index, m.index + 12000);
    const end = chunk.indexOf('"playlistVideoRenderer"', 30);
    const own = end > 0 ? chunk.slice(0, end) : chunk;
    const l = /"lengthSeconds":"(\d+)"/.exec(own);
    if (l && !seen.has(m[1])) seen.set(m[1], +l[1]);
  }
  const secs = [...seen.values()].reduce((a, b) => a + b, 0);
  const total = +((/"numVideosText":\{"runs":\[\{"text":"([\d,]+)"/.exec(h) || /"stats":\[\{"runs":\[\{"text":"([\d,]+)"/.exec(h) || [])[1] || '0').replace(/,/g, '');
  return { secs, count: seen.size, total: total || seen.size };
}
// الباب الرسمي بتاع يوتيوب (YouTube Data API): مجاني، ومحتاج مفتاح YOUTUBE_KEY في الـ Worker
async function ytApi(env, path) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${encodeURIComponent(env.YOUTUBE_KEY)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('مفتاح يوتيوب: ' + ((j.error && j.error.message) || r.status));
  return j;
}
async function youtubeApi(env, v, list) {
  if (list) {
    const ids = [], names = {}; let page = '', total = 0;
    for (let i = 0; i < 8; i++) {   // لحد 400 فيديو (الخطة المجانية بتسمح بـ 50 طلب في المرة)
      const j = await ytApi(env, `playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(list)}${page ? '&pageToken=' + page : ''}`);
      total = (j.pageInfo && j.pageInfo.totalResults) || total;
      for (const x of j.items || []) { const id = x.contentDetails && x.contentDetails.videoId; if (id) { ids.push(id); names[id] = x.snippet && x.snippet.title; } }
      if (!j.nextPageToken) break; page = j.nextPageToken;
    }
    let secs = 0; const dur = {};
    for (let i = 0; i < ids.length; i += 50) {
      const j = await ytApi(env, `videos?part=contentDetails&id=${ids.slice(i, i + 50).join(',')}`);
      for (const x of j.items || []) { const d = isoSecs(x.contentDetails.duration) || 0; dur[x.id] = d; secs += d; }
    }
    // قايمة الفيديوهات بأساميها ومددها (المشغّل اللي في النوتة بيعرضها تحت الفيديو)
    const items = ids.filter(id => dur[id] != null).map(id => ({ id, t: (names[id] || '').slice(0, 140), s: dur[id] }));
    const t = await ytApi(env, `playlists?part=snippet&id=${encodeURIComponent(list)}`).catch(() => ({}));
    const title = t.items && t.items[0] ? t.items[0].snippet.title : null;
    if (secs) return result(secs, title, { count: total || ids.length, partial: total > ids.length, source: 'قايمة يوتيوب', items });
    if (!v) return null;
  }
  if (!v) return null;
  const j = await ytApi(env, `videos?part=contentDetails,snippet&id=${v}`);
  const x = (j.items || [])[0];
  return x ? result(isoSecs(x.contentDetails.duration), x.snippet.title, { source: 'فيديو يوتيوب' }) : null;
}
// من غير مفتاح: بنجرب الطريقة اللي تطبيق يوتيوب نفسه بيستخدمها (ساعات بتنجح)
async function youtubePlayer(v) {
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId: v, context: { client: { clientName: 'WEB', clientVersion: '2.20241120.01.00', hl: 'en' } } }) });
  if (!r.ok) return null;
  const j = await r.json().catch(() => ({}));
  const d = j.videoDetails || {};
  return result(+d.lengthSeconds, d.title || null, { source: 'فيديو يوتيوب' });
}
async function youtube(u, env) {
  let list = u.searchParams.get('list');
  let v = u.searchParams.get('v');
  if (u.hostname.endsWith('youtu.be')) v = u.pathname.slice(1, 12);
  const sm = /^\/(?:shorts|live|embed)\/([\w-]{11})/.exec(u.pathname); if (sm) v = sm[1];
  if (list && /^(RD|UL|LL|WL)/.test(list)) list = null;   // دي قوايم يوتيوب العشوائية، مش كورس
  if (env && env.YOUTUBE_KEY) return youtubeApi(env, v, list);
  if (v && !list) { const p = await youtubePlayer(v).catch(() => null); if (p) return p; }
  if (list) {
    const { text } = await getText(`https://www.youtube.com/playlist?list=${encodeURIComponent(list)}&hl=en`);
    const p = ytPlaylistFrom(text);
    if (p.secs) return result(p.secs, titleOf(text), { count: p.total, partial: p.total > p.count, source: 'قايمة يوتيوب' });
    if (!v) return null;
  }
  if (!v) return null;
  const { text } = await getText(`https://www.youtube.com/watch?v=${v}&hl=en`);
  const l = /"lengthSeconds":"(\d+)"/.exec(text) || [];
  const secs = +l[1] || isoSecs((/itemprop="duration" content="([^"]+)"/.exec(text) || [])[1]);
  return result(secs, titleOf(text), { source: 'فيديو يوتيوب' });
}

// RSS بتاع بودكاست: مجموع مدد الحلقات
function rssFrom(x) {
  const items = x.split(/<item[\s>]/i).slice(1);
  let secs = 0, n = 0;
  for (const it of items) { const d = /<itunes:duration>\s*([^<]+?)\s*<\/itunes:duration>/i.exec(it); if (d) { const s = clockSecs(d[1]); if (s) { secs += s; n++; } } }
  const title = decode((/<channel[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(x) || [])[1]);
  return { secs, count: n, title: title || null };
}

// أي صفحة تانية: JSON-LD، meta، سبوتيفاي، يوديمي…
function pageFrom(h) {
  const cands = [];
  for (const m of h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1].trim()); } catch (_) { continue; }
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 6) return;
      if (Array.isArray(o)) return o.forEach(x => walk(x, depth + 1));
      for (const k of ['duration', 'timeRequired', 'courseWorkload']) if (typeof o[k] === 'string') { const s = isoSecs(o[k]); if (s) cands.push([depth, s]); }
      for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') walk(o[k], depth + 1);
    };
    walk(j, 0);
  }
  if (cands.length) return cands.sort((a, b) => a[0] - b[0])[0][1];
  const meta = /<meta[^>]+(?:property|name|itemprop)=["'](?:og:video:duration|video:duration|music:duration|og:audio:duration|duration)["'][^>]+content=["']([^"']+)/i.exec(h)
    || /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["'](?:og:video:duration|video:duration|music:duration|duration)["']/i.exec(h);
  if (meta) { const s = clockSecs(meta[1]); if (s) return s; }
  const ms = /"totalMilliseconds"\s*:\s*(\d+)/.exec(h) || /"duration_ms"\s*:\s*(\d+)/.exec(h);   // سبوتيفاي
  if (ms) return Math.round(+ms[1] / 1000);
  const ec = /"estimated_content_length"\s*:\s*(\d+)/.exec(h);   // يوديمي (بالدقايق)
  if (ec) return +ec[1] * 60;
  const iso = /"duration"\s*:\s*"(P[T\d][^"]*)"/.exec(h);
  if (iso) { const s = isoSecs(iso[1]); if (s) return s; }
  const hrs = /(\d+(?:\.\d+)?)\s*(?:total hours|hours? on-demand video|hours of video)/i.exec(h);
  if (hrs) return Math.round(+hrs[1] * 3600);
  return null;
}

async function linkDuration(link, env) {
  if (/^[a-z][\w+.-]*:/i.test(link) && !/^https?:\/\//i.test(link)) return { error: 'اللينك مش مظبوط' };
  let u; try { u = new URL(/^https?:\/\//i.test(link) ? link : 'https://' + link); } catch (_) { return { error: 'اللينك مش مظبوط' }; }
  if (!/^https?:$/.test(u.protocol)) return { error: 'اللينك مش مظبوط' };
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) return (await youtube(u, env)) || { error: 'ملقيتش مدة الفيديو. اكتبها بإيدك' };
  const { text, type } = await getText(u.href);
  if (/xml|rss/i.test(type) || /^\s*<\?xml|<rss[\s>]/i.test(text.slice(0, 500))) {
    const r = rssFrom(text);
    return result(r.secs, r.title, { count: r.count, source: 'بودكاست (كل الحلقات)' }) || { error: 'ملقيتش مدد الحلقات في الـ RSS' };
  }
  const secs = pageFrom(text);
  return result(secs, titleOf(text), { source: host }) || { error: 'الموقع ده مش بيقول المدة، اكتبها بإيدك' };
}


// ======================= ✦ اسأل (Gemini) =======================
// الترتيب من الأقوى للأخف: بيبدأ بالـ Pro، ولو مشغول أو مش متاح بينزل للي بعده
const GEMINI_MODELS = ['gemini-pro-latest', 'gemini-3.1-pro-preview', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-flash'];
// للملخص: الموديلات السريعة الأول، والـ Pro آخر حاجة لو كله مشغول
const GEMINI_FAST = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-pro-latest', 'gemini-3.1-pro-preview'];
const AI_STYLE = 'إنت مساعد تعليمي جوه تطبيق اسمه "نوتة بلال". اتكلم بالعامية المصرية البسيطة، وخلي الكلام قصير وواضح ومنظم (نقط لو ينفع). لو ذكرت وقت في الفيديو اكتبه كده [دقايق:ثواني] مثلًا [12:30].';
const secsStr = s => `${Math.max(0, Math.floor(s))}s`;
const mmssW = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };

async function gemini(env, parts, { json: asJson = false, video = false, fast = false } = {}) {
  const list = fast ? GEMINI_FAST : GEMINI_MODELS;
  const models = env.GEMINI_MODEL ? [env.GEMINI_MODEL, ...list.filter(m => m !== env.GEMINI_MODEL)] : list;
  const body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.4, ...(asJson ? { responseMimeType: 'application/json' } : {}), ...(video ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}) } });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const TRIES = 3, WAITS = [2000, 4000];          // كل موديل لحد 3 مرات: يستنى ثانيتين، وبعدين 4 ثواني
  const stopAt = Date.now() + 110000;             // مانستناش أكتر من دقيقتين إلا شوية في المجموع
  let busy = 0, quota = 0, other = 0, lastErr = '';
  outer: for (const model of models) {
    for (let attempt = 0; attempt < TRIES; attempt++) {
      if (Date.now() > stopAt) break outer;
      let r, j;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_KEY, 'Content-Type': 'application/json' }, body });
        j = await r.json().catch(() => ({}));
      } catch (e) { busy++; lastErr = String(e && e.message || e); if (attempt < TRIES - 1) { await wait(WAITS[attempt]); continue; } break; }   // النت وقع في النص: زي المشغول
      if (r.ok) {
        const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('').trim();
        if (text) return text;
        if (j.promptFeedback && j.promptFeedback.blockReason) throw new Error('Gemini رفض يجاوب على ده');
        other++; lastErr = 'رد فاضي'; break;      // رد فاضي: نجرب الموديل اللي بعده
      }
      lastErr = (j.error && j.error.message) || ('Gemini رجّع ' + r.status);
      if (r.status === 404 || (r.status === 400 && /not found|not supported|unknown name|invalid.*model/i.test(lastErr))) break;   // الموديل مش موجود: اللي بعده
      if (r.status === 503 || r.status === 500 || r.status === 504 || /high demand|overloaded|unavailable|try again later/i.test(lastErr)) { busy++; if (attempt < TRIES - 1) { await wait(WAITS[attempt]); continue; } break; }   // مشغول: نستنى ونجرب تاني
      if (r.status === 429) { quota++; break; }   // حصة الموديل ده خلصت (أو الـ Pro مش في الخطة المجانية): اللي بعده
      if (/private|unlisted|not accessible|could not.*video|unable to process/i.test(lastErr)) throw new Error('Gemini مقدرش يفتح الفيديو ده (لازم يكون عام على يوتيوب)');
      if (/api key|unauthenticated|API_KEY/i.test(lastErr)) throw new Error('مفتاح GEMINI_KEY مش شغال. اتأكد إنك نسخته صح في Cloudflare');
      other++; break;                              // أي غلط تاني: نجرب الموديل اللي بعده بدل ما نقف
    }
  }
  if (busy) throw new Error('جوجل عليها ضغط كبير دلوقتي من ناس كتير في العالم، وجرّبت كل الموديلات كذا مرة. ده بيبقى مؤقت، جرّب كمان دقيقة أو اتنين');
  if (quota) throw new Error('خلصت حصة Gemini المجانية النهاردة (أو طلبات كتير ورا بعض). جرّب بعد شوية أو بكرة');
  throw new Error('المساعد مش عارف يوصل لأي موديل دلوقتي. جرّب كمان شوية' + (other && lastErr ? ` (السبب من جوجل: ${lastErr.slice(0, 120)})` : ''));
}


// ---------- الكلام المكتوب (الكابشن) ----------
// بدل ما Gemini يتفرج على الفيديو كله (بطيء)، بنجيب الكلام اللي اتقال مكتوب بأوقاته ونبعته (ثواني)
// لو الفيديو مفيهوش كابشن أو يوتيوب رفض، بيرجع null وبنرجع للطريقة القديمة (يتفرج على الفيديو)
const YT_CLIENTS = [
  { ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip', client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'en' } },
  { ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3 like Mac OS X)', client: { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2', hl: 'en' } },
  { ua: UA['User-Agent'], client: { clientName: 'WEB', clientVersion: '2.20250312.04.00', hl: 'en' } },
];
async function captionTracks(v) {
  for (const c of YT_CLIENTS) {
    try {
      const r = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', { method: 'POST', headers: { 'User-Agent': c.ua, 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId: v, context: { client: c.client } }) });
      if (!r.ok) continue;
      const j = await r.json().catch(() => ({}));
      const t = j.captions && j.captions.playerCaptionsTracklistRenderer && j.captions.playerCaptionsTracklistRenderer.captionTracks;
      if (Array.isArray(t) && t.length) return { tracks: t, ua: c.ua };
    } catch (_) {}
  }
  try {   // آخر محاولة: صفحة الفيديو نفسها
    const { text } = await getText(`https://www.youtube.com/watch?v=${v}&hl=en`);
    const m = /"captionTracks":(\[.*?\])/.exec(text);
    if (m) return { tracks: JSON.parse(m[1]), ua: UA['User-Agent'] };
  } catch (_) {}
  return null;
}
async function transcript(v) {
  const cache = caches.default, key = new Request(`https://nota-cache.local/tr/${v}`);
  const hit = await cache.match(key).catch(() => null);
  if (hit) { const j = await hit.json().catch(() => null); if (j) return j.lines ? j : null; }
  let out = null;
  const got = await captionTracks(v);
  if (got) {
    // الكابشن اللي حد كتبه أحسن من اللي اتعمل أوتوماتيك
    const tr = got.tracks.find(x => x.kind !== 'asr') || got.tracks[0];
    try {
      const base = String(tr.baseUrl || '').replace(/&fmt=[^&]*/, '');
      const r = await fetch(base + '&fmt=json3', { headers: { 'User-Agent': got.ua } });
      const j = r.ok ? await r.json().catch(() => null) : null;
      const lines = [];
      for (const e of (j && j.events) || []) {
        const txt = (e.segs || []).map(x => x.utf8 || '').join('').replace(/\s+/g, ' ').trim();
        if (txt) lines.push({ t: Math.floor((e.tStartMs || 0) / 1000), x: txt });
      }
      if (lines.length > 5) out = { lines, lang: tr.languageCode || '' };
    } catch (_) {}
  }
  // بنحفظه يوم (وحتى لو مفيش، بنفتكر إن مفيش 6 ساعات عشان مانضيّعش وقت كل مرة)
  await cache.put(key, new Response(JSON.stringify(out || { none: true }), { headers: { 'Cache-Control': `max-age=${out ? 86400 : 21600}` } })).catch(() => {});
  return out;
}
// السطور ← نص فيه وقت كل 20 ثانية تقريبًا: "[1:20] الكلام..."
function trText(lines, from = 0, to = Infinity, max = 150000) {
  let out = '', mark = -999;
  for (const l of lines) {
    if (l.t < from || l.t > to) continue;
    if (l.t - mark >= 20) { out += `\n[${mmssW(l.t)}] `; mark = l.t; }
    out += l.x + ' ';
    if (out.length > max) break;
  }
  return out.trim();
}

async function aiRun(env, b) {
  const url = String(b.url || '');
  if (!/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(url)) return { error: 'المساعد بيشتغل مع فيديوهات يوتيوب بس' };
  const title = String(b.title || '').slice(0, 200);
  if (b.mode === 'digest') {
    const prompt = `${AI_STYLE}
اتفرج على الفيديو ده${title ? ` ("${title}")` : ''} كله، ورجّع JSON بس بالشكل ده:
{"summary": "ملخص الفيديو في 5 لـ 8 سطور بالعامية المصرية",
 "points": [{"t": الوقت بالثواني (رقم), "text": "أهم نقطة في الجزء ده في سطر"}],
 "terms": [{"word": "كلمة أو مصطلح صعب اتقال", "meaning": "معناه ببساطة في سياق الفيديو"}],
 "outline": "شرح مفصّل للفيديو جزء جزء بالترتيب، وقبل كل جزء وقته كده [دقايق:ثواني]. لحد 1200 كلمة"}
خلي points من 6 لـ 15 نقطة بترتيب الفيديو، و terms لحد 15 كلمة (لو مفيش كلمات صعبة رجّع ليستة فاضية).`;
    // الأول: من الكلام المكتوب بموديل سريع (ثواني). لو مفيش كابشن: يتفرج على الفيديو
    const tr = await transcript(url.slice(-11)).catch(() => null);
    const raw = tr
      ? await gemini(env, [{ text: `${prompt}\n\nده الكلام اللي اتقال في الفيديو مكتوب بأوقاته (ممكن يكون فيه أخطاء كتابة بسيطة لو اتعمل أوتوماتيك):\n${trText(tr.lines)}` }], { json: true, fast: true })
      : await gemini(env, [{ fileData: { fileUri: url } }, { text: prompt }], { json: true, video: true, fast: true });
    let d; try { d = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim()); } catch (e) { d = { summary: raw, points: [], terms: [], outline: '' }; }
    return { summary: String(d.summary || ''), points: (Array.isArray(d.points) ? d.points : []).map(p => ({ t: Number(p.t) || 0, text: String(p.text || '') })), terms: (Array.isArray(d.terms) ? d.terms : []).map(x => ({ word: String(x.word || ''), meaning: String(x.meaning || '') })), outline: String(d.outline || '') };
  }
  // سؤال
  const q = String(b.q || '').slice(0, 1500);
  if (!q) return { error: 'اكتب السؤال' };
  const t = Number(b.t) || 0;
  if (b.deep) {   // بيتفرج على الدقيقتين اللي حوالين مكانك بس
    const from = Math.max(0, t - 90), to = t + 30;
    const tr = await transcript(url.slice(-11)).catch(() => null);
    const part = tr ? trText(tr.lines, from, to) : '';
    if (part.length > 40) return { text: await gemini(env, [{ text: `${AI_STYLE}\nده الكلام اللي اتقال في الفيديو${title ? ` "${title}"` : ''} من [${mmssW(from)}] لـ [${mmssW(to)}]:\n${part}\n\nالمستخدم واقف عند [${mmssW(t)}]. ${q}` }]) };
    const text = await gemini(env, [{ fileData: { fileUri: url }, videoMetadata: { startOffset: secsStr(from), endOffset: secsStr(to) } }, { text: `${AI_STYLE}\nالمستخدم واقف عند [${mmssW(t)}] في الفيديو${title ? ` "${title}"` : ''}. ${q}` }], { video: true });
    return { text };
  }
  const d = b.digest || {};
  const ctx = `ملخص الفيديو${title ? ` "${title}"` : ''}:\n${String(d.summary || '').slice(0, 2000)}\n\nأهم النقط:\n${(d.points || []).slice(0, 30).map(p => `[${mmssW(p.t)}] ${p.text}`).join('\n').slice(0, 3000)}\n\nالكلمات الصعبة:\n${(d.terms || []).slice(0, 30).map(x => `${x.word}: ${x.meaning}`).join('\n').slice(0, 2000)}\n\nشرح مفصّل:\n${String(d.outline || '').slice(0, 9000)}`;
  const hist = (Array.isArray(b.history) ? b.history : []).slice(-6).map(m => `${m.who === 'me' ? 'المستخدم' : 'المساعد'}: ${String(m.text || '').slice(0, 1200)}`).join('\n');
  const prompt = `${AI_STYLE}
${ctx}

${hist ? `الكلام اللي فات:\n${hist}\n\n` : ''}المستخدم واقف دلوقتي عند [${mmssW(t)}].
السؤال: ${q}
جاوب من الفيديو. لو سأل عن معنى كلمة: اشرح معناها ببساطة وفي سياق الفيديو ومثال قصير. لو الإجابة مش موجودة في الفيديو قول كده في أول سطر، وبعدين جاوب من معلوماتك العامة.`;
  return { text: await gemini(env, [{ text: prompt }]) };
}
