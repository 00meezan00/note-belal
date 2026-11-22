// سجل المشاكل، البحث، الأرشيف، الإعدادات
import { list, one, ins, upd, upsert, single, unarchive, link, auth, sb, exportAll, syncNow, syncStatus } from './db.js';
import * as CFG from './config.js';
const VAPID_PUBLIC_KEY = CFG.VAPID_PUBLIC_KEY || '', WORKER_URL = CFG.WORKER_URL || '';
import { esc, ic, fd, today, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, opts, sw } from './ui.js';
import { KIND, hrefOf, linksSlot, fillLinks, archiveWithUndo, doRefresh, openTask } from './comps.js';
import { lifeData, taPicker, taRow, taValue, trackByName } from './life.js';

const ps = { tab: 'open', cat: '' };
const PSTAT = { open: ['مفتوحة', 'amb'], solving: ['بتتحل', ''], solved: ['اتحلت', 'ok'] };

async function problemSheet(p = {}) {
  const d = await lifeData(), fix = d.tracks.find(t => /fix/i.test(t.name));
  openSheet(p.id ? 'المشكلة' : 'مشكلة جديدة', `
    <label class="field"><span>المشكلة</span><input name="title" value="${esc(p.title)}" autofocus></label>
    ${taPicker(d, p.id ? taValue(p) : fix ? 't:' + fix.id : '', { label: 'المجال' })}
    <label class="field"><span>الحالة</span><select name="status">${opts(Object.entries(PSTAT).map(([k, v]) => [k, v[0]]), p.status || 'open')}</select></label>
    <label class="field"><span>السبب</span><textarea name="cause" rows="2">${esc(p.cause)}</textarea></label>
    <label class="field"><span>الحل</span><textarea name="solution" rows="2">${esc(p.solution)}</textarea></label>
    ${p.id ? `<div class="between card" style="padding:10px 14px"><span>اتكررت <b class="num">${p.occurrences}</b> مرة</span><button class="btn sm" data-act="prob-again" data-id="${p.id}">اتكررت تاني</button></div>
    ${linksSlot('problem', p.id)}
    <div class="btns"><button class="btn sm" data-act="prob-task" data-id="${p.id}">${ic('plus', 16)}اعمل منها مهمة</button><button class="btn sm" data-act="prob-goal" data-id="${p.id}">${ic('goal', 16)}اعمل منها هدف</button></div>` : ''}
    <div class="btns">${p.id ? `<button class="btn" data-act="prob-archive" data-id="${p.id}">${ic('archive', 18)}أرشيف</button>` : ''}<button class="btn pri" data-act="prob-save" data-id="${p.id || ''}">حفظ</button></div>`);
  if (p.id) fillLinks(sheetEl());
}

const ARCH_TABLES = [['tasks', 'title', 'مهمة'], ['goals', 'title', 'هدف'], ['ideas', 'title', 'فكرة'], ['problems', 'title', 'مشكلة'], ['team_members', 'name', 'فرد'], ['company_metrics', 'label', 'مؤشر'], ['company_log', 'text', 'تطور'], ['projects', 'name', 'مشروع'], ['project_devs', 'title', 'تطوير في مشروع'], ['project_clients', 'name', 'عميل مشروع'], ['courses', 'title', 'كورس'], ['sops', 'title', 'إجراء'], ['positions', 'title', 'مكان فاضي'], ['candidates', 'name', 'متقدم'], ['recurring_tasks', 'title', 'مهمة متكررة'], ['habits', 'title', 'عادة'], ['life_tracks', 'name', 'مسار'], ['life_areas', 'name', 'مجال']];

export default {
  problems: {
    async render(p) {
      const all = await list('problems', { order: 'created_at', asc: false });
      const open = all.filter(x => x.status !== 'solved'), solved = all.filter(x => x.status === 'solved');
      const L = (ps.tab === 'open' ? open : solved).filter(x => !ps.cat || x.category === ps.cat);
      const cats = [...new Set(all.map(x => x.category).filter(Boolean))];
      return {
        title: 'المشاكل', sub: `${open.length} مفتوحة · ${solved.length} اتحلت`, back: '#/today',
        fab: { label: 'مشكلة', act: 'prob-new' },
        html: `<div class="stack">
          <div class="seg"><button class="${ps.tab === 'open' ? 'on' : ''}" data-act="prob-tab" data-v="open">مفتوحة <span class="num">${open.length}</span></button><button class="${ps.tab === 'solved' ? 'on' : ''}" data-act="prob-tab" data-v="solved">اتحلت <span class="num">${solved.length}</span></button></div>
          ${cats.length ? `<div class="pills"><button class="${ps.cat ? '' : 'on'}" data-act="prob-cat" data-v="">الكل</button>${cats.map(c => `<button class="${ps.cat === c ? 'on' : ''}" data-act="prob-cat" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
          ${L.length ? L.map(x => `<button class="card stack" style="gap:6px" data-act="prob-open" data-id="${x.id}">
            <div class="between"><span class="chip">${esc(x.category || 'من غير مجال')}</span><span class="tag ${PSTAT[x.status][1]}">${PSTAT[x.status][0]}</span></div>
            <div class="title">${esc(x.title)}</div>
            ${x.cause ? `<div class="mut" style="font-size:14px">السبب: <span style="color:var(--ink)">${esc(x.cause)}</span></div>` : ''}
            ${x.occurrences > 1 ? `<div class="late row" style="gap:4px;font-size:13px">${ic('repeat', 15)}اتكررت <span class="num">${x.occurrences}</span> مرات</div>` : ''}
          </button>`).join('') : empty(ps.tab === 'open' ? 'مفيش مشاكل مفتوحة. سجّل أي مشكلة من المايك أو من زرار "مشكلة".' : 'لسه مفيش مشاكل اتحلت.')}
        </div>`,
      };
    },
    async after(main, p) { if (p.query.open) { const x = await one('problems', p.query.open); if (x) problemSheet(x); history.replaceState(null, '', '#/problems'); } },
    actions: {
      'prob-tab'(el) { ps.tab = el.dataset.v; doRefresh(); },
      'prob-cat'(el) { ps.cat = el.dataset.v; doRefresh(); },
      'prob-new': () => problemSheet(),
      async 'prob-open'(el) { problemSheet(await one('problems', el.dataset.id)); },
      async 'prob-save'(el) {
        const f = formOf(sheetEl()); if (!f.title) return toast('اكتب المشكلة');
        const row = { title: f.title, ...taRow(f.ta, await lifeData(), 'category'), status: f.status, cause: f.cause || null, solution: f.solution || null, solved_on: f.status === 'solved' ? today() : null };
        try { if (el.dataset.id) await upd('problems', el.dataset.id, row); else await ins('problems', row); closeSheet(); doRefresh(); } catch (e) { fail(e); }
      },
      async 'prob-again'(el) { const x = await one('problems', el.dataset.id); try { await upd('problems', x.id, { occurrences: x.occurrences + 1, status: x.status === 'solved' ? 'open' : x.status }); problemSheet(await one('problems', x.id)); doRefresh(); } catch (e) { fail(e); } },
      async 'prob-task'(el) { const x = await one('problems', el.dataset.id); openTask(null, { title: 'حل: ' + x.title, _link: { type: 'problem', id: x.id, title: x.title } }); },
      async 'prob-goal'(el) {
        const x = await one('problems', el.dataset.id);
        try { const g = await ins('goals', { title: 'حل مشكلة: ' + x.title, why: x.cause, track_id: x.track_id || null, area_id: x.area_id || null, area: x.category || 'من غير مجال' }); await link('goal', g.id, 'problem', x.id); closeSheet(); location.hash = `#/goal/${g.id}`; } catch (e) { fail(e); }
      },
      async 'prob-archive'(el) { closeSheet(); await archiveWithUndo('problems', el.dataset.id, 'المشكلة اتنقلت للأرشيف'); },
    },
  },

  search: {
    async render(p) {
      return { title: 'البحث', back: '#/today', noSearch: true, html: `<div class="stack"><input class="inp" type="search" placeholder="دوّر في كل النوتة…" data-input="do-search" autofocus value="${esc(p.query.q || '')}" style="border:1.5px solid var(--ink);border-radius:22px"><div id="sres" class="stack"></div></div>` };
    },
    after(main) { const i = main.querySelector('input'); i.focus(); if (i.value) this.actions['do-search'](i); },
    actions: {
      async 'do-search'(inp) {
        const q = inp.value.trim(); const box = document.getElementById('sres'); if (!box) return;
        if (q.length < 2) { box.innerHTML = ''; return; }
        const safe = q.replace(/[%,()]/g, ' ');
        const rows = await list('v_search', { or: `title.ilike.%${safe}%,body.ilike.%${safe}%`, limit: 80 });
        const NAMES = { ...Object.fromEntries(Object.entries(KIND).map(([k, v]) => [k, v[0]])), member_note: 'رأي في فرد', log: 'تطور في الشركة' };
        const groups = {}; rows.forEach(r => (groups[r.kind] ||= []).push(r));
        box.innerHTML = Object.entries(groups).map(([k, L]) => `<div class="card" style="padding:10px 14px"><div class="between"><b style="font-weight:600">${NAMES[k] || k}</b><span class="mut num">${L.length}</span></div><div class="list">${L.map(r => {
          const href = k === 'member_note' ? null : k === 'log' ? '#/company' : hrefOf(k, r.id);
          const inner = `<span class="t">${esc(r.title)}${r.body ? `<small>${esc(String(r.body).slice(0, 90))}</small>` : ''}</span>`;
          return href ? `<a class="lnk" href="${href}">${inner}</a>` : k === 'task' ? `<button class="lnk" data-act="task-open" data-id="${r.id}">${inner}</button>` : `<div class="lnk">${inner}</div>`;
        }).join('')}</div></div>`).join('') || empty('مفيش نتايج.');
      },
    },
  },

  archive: {
    async render() {
      const sets = await Promise.all(ARCH_TABLES.map(([t]) => list(t, { archived: true, order: 'archived_at', asc: false, limit: 50 })));
      const html = ARCH_TABLES.map(([t, col, lab], i) => sets[i].length ? `<div class="card" style="padding:10px 14px"><b style="font-weight:600">${lab}</b><div class="list">${sets[i].map(r => `<div class="row" style="padding:8px 0"><div style="flex:1">${esc(r[col])}<div class="mut">اتأرشف ${fd(r.archived_at)}</div></div><button class="btn sm" data-act="restore" data-t="${t}" data-id="${r.id}">رجّعه</button></div>`).join('')}</div></div>` : '').join('');
      return { title: 'الأرشيف', sub: 'أي حاجة اتشالت بترجع من هنا', back: '#/today', html: `<div class="stack">${html || empty('الأرشيف فاضي.')}</div>` };
    },
    actions: { async restore(el) { try { await unarchive(el.dataset.t, el.dataset.id); toast('رجعت مكانها'); doRefresh(); } catch (e) { fail(e); } } },
  },

  settings: {
    async render() {
      const [p, crit] = await Promise.all([single('profiles'), list('role_criteria')]);
      const t = p?.theme || 'system';
      const row = (l, sub, right) => `<div class="row" style="padding:10px 0"><div style="flex:1;line-height:1.4"><div style="font-weight:500">${l}</div>${sub ? `<div class="mut">${sub}</div>` : ''}</div>${right}</div>`;
      const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      const pushState = await pushStatus();
      return {
        title: 'الإعدادات', back: '#/today',
        html: `<div class="stack">
          ${standalone ? '' : `<div class="card" style="background:var(--amb);border-color:var(--amb);color:#15202B;line-height:1.7"><b>عشان التطبيق يتسطب والتذكيرات توصلك</b><br>افتحه من Safari، دوس زرار المشاركة، وبعدين "إضافة إلى الشاشة الرئيسية"، وافتحه من الأيقونة.</div>`}
          <div class="card"><b style="font-weight:600">الشكل</b>
            <div class="seg" style="margin-top:8px">${[['system', 'زي الموبايل'], ['light', 'فاتح'], ['dark', 'ليلي']].map(([k, l]) => `<button class="${t === k ? 'on' : ''}" data-act="theme" data-v="${k}">${l}</button>`).join('')}</div></div>
          <div class="card list"><b style="font-weight:600;display:block;padding-bottom:4px">التذكيرات</b>
            ${row('الإشعارات على الموبايل', pushState === 'on' ? 'شغالة على الموبايل ده' : pushState === 'denied' ? 'مقفولة من إعدادات الآيفون: الإعدادات ← الإشعارات ← نوتة بلال' : pushState === 'unsupported' ? 'افتح التطبيق من أيقونة الشاشة الرئيسية الأول' : 'لسه مش متفعلة', pushState === 'on' ? (WORKER_URL ? '<button class="btn sm" data-act="push-test">جرّب</button>' : '') : pushState === 'unsupported' || pushState === 'denied' ? '' : '<button class="btn sm amb" data-act="push-enable">فعّل</button>')}
            ${row('ملخص الصبح', `<div class="mut" style="font-size:13px">مهامك، والمتأخر، وكورسات النهاردة، والكورسات اللي فاتتك، وتذكيرات الأفكار</div><div class="row" style="gap:6px;margin-top:4px"><input type="time" class="inp" style="width:auto;min-height:36px" value="${(p?.morning_reminder || '08:30').slice(0, 5)}" data-change="pref-time" data-k="morning_reminder">${pushState === 'on' && WORKER_URL ? '<button class="btn sm" data-act="push-test" data-morning="1">ابعته دلوقتي</button>' : ''}</div>`, sw(p?.morning_enabled, 'data-act="pref" data-k="morning_enabled"'))}
            ${row('تذكير بالليل تراجع يومك', `<input type="time" class="inp" style="width:auto;min-height:36px;margin-top:4px" value="${(p?.evening_reminder || '22:00').slice(0, 5)}" data-change="pref-time" data-k="evening_reminder">`, sw(p?.evening_enabled, 'data-act="pref" data-k="evening_enabled"'))}
            <div class="mut" style="padding-top:8px">تذكير كل هدف أو مهمة بيتظبط من جوّاه.${WORKER_URL ? '' : ' الإشعارات هتوصل بعد ما تعمل الـ Worker على Cloudflare.'}</div></div>
          <div class="card"><b style="font-weight:600">معايير التقييم لكل وظيفة</b><div class="mut">افصل بين المعايير بفاصلة</div>
            ${crit.map(c => `<label class="field" style="margin-top:10px"><span>${esc(c.role)}</span><input value="${esc(c.criteria.join('، '))}" data-change="crit" data-id="${c.id}"></label>`).join('')}
            <form class="row" data-act-submit="crit-add" style="margin-top:10px"><input class="inp" name="role" placeholder="وظيفة جديدة"><button class="btn sm">ضيف</button></form></div>
          <div class="card list"><b style="font-weight:600;display:block;padding-bottom:4px">الأمان</b>
            ${row('قفل فلوسي بـ Face ID', 'لو قفلته، فلوسي هتفتح من غير بصمة', sw(p?.money_lock_enabled !== false, 'data-act="pref" data-k="money_lock_enabled"'))}</div>
          <div class="card list"><b style="font-weight:600;display:block;padding-bottom:4px">البيانات</b>
            ${row('نسخة على الموبايل', syncLine(), '<button class="btn sm" data-act="sync-now">زامن دلوقتي</button>')}
            ${row('نسخة احتياطية', 'ملف فيه كل بياناتك، احتفظ بيه على الموبايل', '<button class="btn sm" data-act="backup">نزّل نسخة</button>')}
            ${row('الأرشيف', 'الحاجات اللي شيلتها', '<a class="btn sm" href="#/archive">افتح</a>')}
            ${row('تسجيل الخروج', '', '<button class="btn sm bad" data-act="signout">خروج</button>')}</div>
        </div>`,
      };
    },
    actions: {
      async theme(el) { try { const s = await auth.session(); await upsert('profiles', { user_id: s.user.id, theme: el.dataset.v }, 'user_id'); window.__applyTheme(el.dataset.v); doRefresh(); } catch (e) { fail(e); } },
      async pref(el) { try { const s = await auth.session(); await upsert('profiles', { user_id: s.user.id, [el.dataset.k]: !el.classList.contains('on') }, 'user_id'); doRefresh(); } catch (e) { fail(e); } },
      async 'pref-time'(el) { try { const s = await auth.session(); await upsert('profiles', { user_id: s.user.id, [el.dataset.k]: el.value }, 'user_id'); toast('اتحفظ'); } catch (e) { fail(e); } },
      async crit(el) { const arr = el.value.split(/[،,]/).map(s => s.trim()).filter(Boolean); if (!arr.length) return; try { await upd('role_criteria', el.dataset.id, { criteria: arr }); toast('اتحفظ'); } catch (e) { fail(e); } },
      async 'crit-add'(form) { const r = form.querySelector('[name=role]').value.trim(); if (!r) return; try { await ins('role_criteria', { role: r, criteria: ['الالتزام'] }); doRefresh(); } catch (e) { fail(e); } },
      // زرار "فعّل": بيطلب الإذن من الآيفون، ويعمل اشتراك، ويحفظه في Supabase
      async 'push-enable'(el) {
        if (!VAPID_PUBLIC_KEY) return toast('مفتاح الإشعارات مش موجود في config.js');
        el.disabled = true;
        try {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') { toast(perm === 'denied' ? 'الإشعارات اتقفلت. افتحها من إعدادات الآيفون ← الإشعارات ← نوتة بلال' : 'لازم توافق على الإشعارات'); return doRefresh(); }
          const reg = await navigator.serviceWorker.ready;
          let sub = await reg.pushManager.getSubscription();
          // لو الاشتراك القديم معمول بمفتاح تاني، بنلغيه ونعمل واحد جديد بالمفتاح اللي في config.js
          if (sub && !sameKey(sub, VAPID_PUBLIC_KEY)) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); sub = null; }
          if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLIC_KEY) });
          await saveSub(sub);
          toast('الإشعارات اتفعلت. دوس "جرّب"'); doRefresh();
        } catch (e) { toast(e.message || 'ما قدرتش أفعّل الإشعارات'); } finally { el.disabled = false; }
      },
      // زرار "جرّب": بيطلب من الـ Worker يبعت إشعار تجربة. ولو data-morning: بيبعت ملخص الصبح دلوقتي
      async 'push-test'(el) {
        el.disabled = true;
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (!sub) { toast('الإشعارات مش متفعلة. دوس "فعّل"'); return doRefresh(); }
          if (!sameKey(sub, VAPID_PUBLIC_KEY)) { await sub.unsubscribe(); toast('المفتاح اتغير. دوس "فعّل" تاني'); return doRefresh(); }
          await saveSub(sub);
          const { data } = await sb.auth.getSession();
          let r;
          try { r = await fetch(WORKER_URL.replace(/\/$/, '') + '/test' + (el.dataset.morning ? '?morning=1' : ''), { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}` } }); }
          catch (_) { return alertBox('ما قدرتش أوصل للـ Worker', 'الأغلب إن الـ Worker القديم لسه على Cloudflare. حط كود reminders.js الجديد فيه ودوس Deploy.'); }
          if (r.ok) { const res = await r.json().catch(() => ({})); if (res.morning) return alertBox('ملخص الصبح اتبعت', res.morning, true); if (el.dataset.morning) return alertBox('الـ Worker قديم', 'حط كود الـ Worker الجديد في Cloudflare ودوس Deploy، وبعدين جرّب تاني.', true); return res.check ? alertBox('إشعار التجربة اتبعت', checkText(res.check), true) : toast('اتبعت. هيوصلك إشعار كمان ثواني'); }
          const why = await r.json().then(x => x.error).catch(() => '');
          if (r.status === 401) toast('الـ Worker مش عارف حسابك. اتأكد من SUPABASE_URL و SUPABASE_SERVICE_KEY في Cloudflare');
          else alertBox(`الإشعار ما وصلش (${r.status})`, why || 'مفيش تفاصيل');
        } catch (e) { toast(e.message || 'حصل خطأ'); } finally { el.disabled = false; }
      },
      async backup() {
        try {
          const out = { app: 'nota-bilal', exported_at: new Date().toISOString(), ...exportAll() };
          const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `nota-bilal-${today()}.json`;
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        } catch (e) { fail(e); }
      },
      async 'sync-now'() {
        if (!navigator.onLine) return toast('مفيش نت. تعديلاتك محفوظة على الموبايل، وهتتبعت أول ما النت يرجع');
        toast('بيزامن…'); const ok = await syncNow(); const s = syncStatus();
        toast(ok ? 'اتزامن' : s.pending ? `فاضل ${edits(s.pending)}، هتتبعت لوحدها` : 'ما اتزامنش دلوقتي، هيحاول تاني لوحده'); doRefresh();
      },
      async signout() { await auth.signOut(); location.hash = ''; location.reload(); },
    },
  },
};

function b64u(s) { const p = '='.repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); }

// رسالة فيها السبب بالتفصيل، بتفضل ظاهرة لحد ما تقفلها (عشان تقدر تصوّرها)
// نتيجة الفحص اللي بيرجعها الـ Worker: هو بيصحى لوحده؟ وإيه مهام النهاردة اللي ليها تذكير؟
function checkText(c) {
  const L = ['✓ إشعار التجربة اتبعت، يعني الموبايل والمفاتيح مظبوطين.'];
  const ago = c.lastRun ? Math.round((Date.now() - Date.parse(c.lastRun)) / 60000) : null;
  if (c.lastRunKnown === false) L.push('؟ مش عارف أشوف الـ Worker بيصحى لوحده ولا لأ، لأن جدول reminder_log فيه مشكلة (تحت). شغّل ملف supabase-reminder-log-fix.sql في Supabase، واستنى 5 دقايق، وجرّب تاني.');
  else if (ago === null) L.push('✗ الـ Worker عمره ما صحي لوحده. عشان كده تذكيرات المهام مش بتوصل.', 'الحل: Cloudflare ← Workers ← nota-reminders ← Settings ← Trigger Events ← Add ← Cron Triggers ← اكتب */5 * * * * ← Add. (لو لسه حاطه، استنى 5 دقايق وجرّب تاني)');
  else if (ago > 15) L.push(`✗ آخر مرة الـ Worker صحي لوحده كان من ${ago} دقيقة، وده كتير (المفروض كل 5 دقايق). اتأكد من الـ Cron Trigger في Cloudflare.`);
  else L.push(`✓ الـ Worker بيصحى لوحده (آخر مرة من ${ago < 1 ? 'أقل من دقيقة' : ago + ' دقيقة'}).`);
  if (c.now) L.push(`الساعة عند الـ Worker دلوقتي: ${c.now}`);
  if (c.tasksKnown !== false) L.push(c.tasks?.length ? 'مهام النهاردة اللي ليها تذكير:\n' + c.tasks.map(t => `${t.sent ? '✓ اتبعت' : '… مستني'} ${t.time} — ${t.title}`).join('\n') : 'مفيش مهام النهاردة ليها تذكير متسجلة على Supabase. لو لسه عاملها، استنى المزامنة شوية وجرّب تاني.');
  if (c.errors?.length) L.push('مشاكل:\n' + c.errors.join('\n'));
  return L.join('\n\n');
}

function alertBox(title, msg, rtl = false) {
  openSheet(title, `<div class="card" style="${rtl ? 'line-height:1.7;font-size:14px;' : 'direction:ltr;text-align:left;font-size:13px;'}white-space:pre-wrap;word-break:break-word">${esc(msg)}</div>
    <div class="btns"><button class="btn pri" data-act="close-sheet">تمام</button></div>`);
}

// بيشوف الاشتراك ده معمول بنفس المفتاح العام اللي في config.js ولا لأ
function sameKey(sub, key) {
  const k = sub.options && sub.options.applicationServerKey; if (!k) return true;
  const a = new Uint8Array(k), b = b64u(key);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

// بيحفظ اشتراك الموبايل ده في Supabase عشان الـ Worker يعرف يبعتله
async function saveSub(sub) {
  const j = sub.toJSON();
  const { data } = await sb.auth.getSession();
  const uid = data?.session?.user?.id; if (!uid) throw new Error('سجّل دخول الأول');
  await sb.from('push_subscriptions').delete().eq('endpoint', j.endpoint);
  const { error } = await sb.from('push_subscriptions').insert({ user_id: uid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
  if (error) throw new Error(/does not exist|schema cache|42P01/.test(error.message + error.code) ? 'جدول push_subscriptions مش موجود. شغّل supabase-push.sql في Supabase الأول' : 'Supabase: ' + error.message);
}

async function pushStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); return sub ? 'on' : 'off'; } catch (e) { return 'off'; }
}

function syncLine() {
  const s = syncStatus();
  const when = s.lastSync ? new Date(s.lastSync).toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' }) : '';
  if (!s.online) return `التطبيق شغال من غير نت${s.pending ? ` · ${edits(s.pending)} مستنية النت` : ''}`;
  if (s.pending) return `بيتبعت ${edits(s.pending)}…`;
  return when ? `كل بياناتك على الموبايل · آخر مزامنة ${when}` : 'كل بياناتك على الموبايل';
}

function edits(n) { return n === 1 ? 'تعديل واحد' : n === 2 ? 'تعديلين' : n <= 10 ? `${n} تعديلات` : `${n} تعديل`; }
