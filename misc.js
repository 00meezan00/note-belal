// سجل المشاكل، البحث، الأرشيف، الإعدادات
import { list, one, ins, upd, upsert, single, unarchive, link, auth, sb } from './db.js';
import { esc, ic, fd, today, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, opts, sw } from './ui.js';
import { KIND, hrefOf, linksSlot, fillLinks, archiveWithUndo, doRefresh, openTask } from './comps.js';

const ps = { tab: 'open', cat: '' };
const CATS = ['إرجاع','كول سنتر','موردين','فنيين','تحصيل','عملاء','تسويق','أخرى'];
const PSTAT = { open: ['مفتوحة', 'amb'], solving: ['بتتحل', ''], solved: ['اتحلت', 'ok'] };

async function problemSheet(p = {}) {
  openSheet(p.id ? 'المشكلة' : 'مشكلة جديدة', `
    <label class="field"><span>المشكلة</span><input name="title" value="${esc(p.title)}" autofocus></label>
    <div class="grid2"><label class="field"><span>النوع</span><select name="category"><option value="">من غير</option>${opts(CATS, p.category)}</select></label>
    <label class="field"><span>الحالة</span><select name="status">${opts(Object.entries(PSTAT).map(([k, v]) => [k, v[0]]), p.status || 'open')}</select></label></div>
    <label class="field"><span>السبب</span><textarea name="cause" rows="2">${esc(p.cause)}</textarea></label>
    <label class="field"><span>الحل</span><textarea name="solution" rows="2">${esc(p.solution)}</textarea></label>
    ${p.id ? `<div class="between card" style="padding:10px 14px"><span>اتكررت <b class="num">${p.occurrences}</b> مرة</span><button class="btn sm" data-act="prob-again" data-id="${p.id}">اتكررت تاني</button></div>
    ${linksSlot('problem', p.id)}
    <div class="btns"><button class="btn sm" data-act="prob-task" data-id="${p.id}">${ic('plus', 16)}اعمل منها مهمة</button><button class="btn sm" data-act="prob-goal" data-id="${p.id}">${ic('goal', 16)}اعمل منها هدف</button></div>` : ''}
    <div class="btns">${p.id ? `<button class="btn" data-act="prob-archive" data-id="${p.id}">${ic('archive', 18)}أرشيف</button>` : ''}<button class="btn pri" data-act="prob-save" data-id="${p.id || ''}">حفظ</button></div>`);
  if (p.id) fillLinks(sheetEl());
}

const ARCH_TABLES = [['tasks', 'title', 'مهمة'], ['goals', 'title', 'هدف'], ['ideas', 'title', 'فكرة'], ['problems', 'title', 'مشكلة'], ['team_members', 'name', 'فرد'], ['company_metrics', 'label', 'مؤشر'], ['company_log', 'text', 'تطور']];

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
            <div class="between"><span class="chip">${esc(x.category || 'من غير نوع')}</span><span class="tag ${PSTAT[x.status][1]}">${PSTAT[x.status][0]}</span></div>
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
        const row = { title: f.title, category: f.category || null, status: f.status, cause: f.cause || null, solution: f.solution || null, solved_on: f.status === 'solved' ? today() : null };
        try { if (el.dataset.id) await upd('problems', el.dataset.id, row); else await ins('problems', row); closeSheet(); doRefresh(); } catch (e) { fail(e); }
      },
      async 'prob-again'(el) { const x = await one('problems', el.dataset.id); try { await upd('problems', x.id, { occurrences: x.occurrences + 1, status: x.status === 'solved' ? 'open' : x.status }); problemSheet(await one('problems', x.id)); doRefresh(); } catch (e) { fail(e); } },
      async 'prob-task'(el) { const x = await one('problems', el.dataset.id); openTask(null, { title: 'حل: ' + x.title, _link: { type: 'problem', id: x.id, title: x.title } }); },
      async 'prob-goal'(el) {
        const x = await one('problems', el.dataset.id);
        try { const g = await ins('goals', { title: 'حل مشكلة: ' + x.title, why: x.cause }); await link('goal', g.id, 'problem', x.id); closeSheet(); location.hash = `#/goal/${g.id}`; } catch (e) { fail(e); }
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
      return {
        title: 'الإعدادات', back: '#/today',
        html: `<div class="stack">
          ${standalone ? '' : `<div class="card" style="background:var(--amb);border-color:var(--amb);color:#15202B;line-height:1.7"><b>عشان التطبيق يتسطب والتذكيرات توصلك</b><br>افتحه من Safari، دوس زرار المشاركة، وبعدين "إضافة إلى الشاشة الرئيسية"، وافتحه من الأيقونة.</div>`}
          <div class="card"><b style="font-weight:600">الشكل</b>
            <div class="seg" style="margin-top:8px">${[['system', 'زي الموبايل'], ['light', 'فاتح'], ['dark', 'ليلي']].map(([k, l]) => `<button class="${t === k ? 'on' : ''}" data-act="theme" data-v="${k}">${l}</button>`).join('')}</div></div>
          <div class="card list"><b style="font-weight:600;display:block;padding-bottom:4px">التذكيرات</b>
            ${row('تذكير الصبح بمهام النهاردة', `<input type="time" class="inp" style="width:auto;min-height:36px;margin-top:4px" value="${(p?.morning_reminder || '08:30').slice(0, 5)}" data-change="pref-time" data-k="morning_reminder">`, sw(p?.morning_enabled, 'data-act="pref" data-k="morning_enabled"'))}
            ${row('تذكير بالليل تراجع يومك', `<input type="time" class="inp" style="width:auto;min-height:36px;margin-top:4px" value="${(p?.evening_reminder || '22:00').slice(0, 5)}" data-change="pref-time" data-k="evening_reminder">`, sw(p?.evening_enabled, 'data-act="pref" data-k="evening_enabled"'))}
            <div class="mut" style="padding-top:8px">تذكير كل هدف بيتظبط من جوّاه. الإشعارات هتشتغل في المرحلة الجاية.</div></div>
          <div class="card"><b style="font-weight:600">معايير التقييم لكل وظيفة</b><div class="mut">افصل بين المعايير بفاصلة</div>
            ${crit.map(c => `<label class="field" style="margin-top:10px"><span>${esc(c.role)}</span><input value="${esc(c.criteria.join('، '))}" data-change="crit" data-id="${c.id}"></label>`).join('')}
            <form class="row" data-act-submit="crit-add" style="margin-top:10px"><input class="inp" name="role" placeholder="وظيفة جديدة"><button class="btn sm">ضيف</button></form></div>
          <div class="card list"><b style="font-weight:600;display:block;padding-bottom:4px">الأمان</b>
            ${row('قفل فلوسي بـ Face ID', 'لو قفلته، فلوسي هتفتح من غير بصمة', sw(p?.money_lock_enabled !== false, 'data-act="pref" data-k="money_lock_enabled"'))}</div>
          <div class="card list"><b style="font-weight:600;display:block;padding-bottom:4px">البيانات</b>
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
      async backup() {
        const tables = ['profiles','company','company_metrics','company_log','ideas','goals','plan_steps','recurring_tasks','tasks','links','problems','role_criteria','team_members','member_ratings','member_notes','weekly_reviews','courses','org_units','sops','job_roles','positions','candidates','projects','project_clients','project_devs','project_dev_notes','wallets','assets','investments','investment_returns','debts','debt_payments','commitments','budget_categories','expenses','incomes','financial_goals','net_worth_snapshots'];
        try {
          toast('بيجهز النسخة…');
          const out = { app: 'nota-bilal', exported_at: new Date().toISOString() };
          for (const t of tables) { const { data, error } = await sb.from(t).select('*'); if (error) throw error; out[t] = data; }
          const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `nota-bilal-${today()}.json`;
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        } catch (e) { fail(e); }
      },
      async signout() { await auth.signOut(); location.hash = ''; location.reload(); },
    },
  },
};
