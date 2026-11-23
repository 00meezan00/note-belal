// شركاتي: بيانات كل شركة، الاستقالة، شركة جديدة بتيم وهيكل جديد، والبايو اللي في القايمة
import { list, single, ins, upd, upsert, auth, currentCompanyId, currentCompany } from './db.js';
import { esc, ic, fd, fMonth, today, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail } from './ui.js';
import { doRefresh } from './comps.js';

const CO_TABLES = ['team_members', 'departments', 'company_metrics', 'company_log'];
const allCos = async () => (await list('companies')).sort((a, b) => String(a.started_on || a.created_at).localeCompare(String(b.started_on || b.created_at)));
const freshViews = () => { try { window.__clearViews && window.__clearViews(); } catch (e) {} };
const myUid = async () => (await auth.session()).user.id;

// المدة: "سنة و3 شهور" / "5 شهور" / "أقل من شهر"
function span(from, to) {
  if (!from) return '';
  const a = new Date(from), b = new Date(to || today());
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); if (b.getDate() < a.getDate()) m--;
  if (m < 1) return 'أقل من شهر';
  const y = Math.floor(m / 12), r = m % 12;
  const yy = y === 1 ? 'سنة' : y === 2 ? 'سنتين' : y ? `${y} سنين` : '', mm = r === 1 ? 'شهر' : r === 2 ? 'شهرين' : r ? `${r} شهور` : '';
  return [yy, mm].filter(Boolean).join(' و');
}
const period = c => `${c.started_on ? fMonth(c.started_on) : 'من الأول'} ← ${c.left_on ? fMonth(c.left_on) : 'دلوقتي'}`;

// عدد حاجات شركة معينة (التيم، الأقسام…) حتى لو مش هي الحالية
async function countsOf(id, firstId) {
  const own = r => r.company_id ? r.company_id === id : id === firstId;
  const [m, d, k, l] = await Promise.all(CO_TABLES.map(t => list(t, { allCompanies: true })));
  return { team: m.filter(r => own(r) && r.active !== false).length, depts: d.filter(own).length, metrics: k.filter(own).length, log: l.filter(own).length };
}

export default {
  companies: {
    async render(p) {
      const cos = await allCos();
      if (!cos.length) return { title: 'شركاتي', html: empty('شغّل ملف <b>supabase-batch5.sql</b> في Supabase الأول، وبعدين افتح الصفحة دي تاني.') };
      const curId = currentCompanyId();
      const c = cos.find(x => x.id === (p.id || curId)) || cos[0];
      const first = [...cos].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0].id;
      const k = await countsOf(c.id, first);
      const isCur = c.id === curId;
      const state = c.left_on ? `<span class="tag out">استقلت منها · ${fd(c.left_on)}</span>` : isCur ? '<span class="tag ok">شغال فيها دلوقتي</span>' : '<span class="tag">مش مفتوحة دلوقتي</span>';
      const spec = (l, v) => v ? `<div class="spec"><dt>${l}</dt><dd>${v}</dd></div>` : '';
      const career = cos.slice().reverse().map(x => `<a class="it${x.left_on ? ' gone' : ''}${x.id === c.id ? ' here' : ''}" href="#/companies/${x.id}">
          <div class="mut">${period(x)}</div>
          <div class="row" style="gap:6px"><b style="font-weight:600">${esc(x.name)}</b>${x.id === curId ? '<span class="tag ok" style="font-size:11px">الحالية</span>' : ''}</div>
          ${x.my_title ? `<div class="mut">${esc(x.my_title)}${x.started_on ? ' · ' + span(x.started_on, x.left_on) : ''}</div>` : ''}</a>`).join('');
      return {
        title: c.name, sub: 'بيانات الشركة',
        html: `<div class="stack">
          <div class="card co-badge">
            <div class="between">${state}<button class="btn sm" data-act="co-prof-edit" data-id="${c.id}">${ic('edit', 16)}تعديل</button></div>
            <div class="disp co-name">${esc(c.name)}</div>
            ${c.field ? `<div class="mut" style="font-size:14px;margin-top:-4px">${esc(c.field)}</div>` : ''}
            <dl class="specs">
              ${spec('مسمايا الوظيفي', esc(c.my_title || ''))}
              ${spec('صاحب الشركة', esc(c.owner_name || ''))}
              ${spec('الفروع', esc(c.branches || ''))}
              ${spec('بدأت فيها', c.started_on ? `${fd(c.started_on)} ${new Date(c.started_on).getFullYear()} · ${span(c.started_on, c.left_on)}` : '')}
              ${spec('استقلت', c.left_on ? `${fd(c.left_on)} ${new Date(c.left_on).getFullYear()}${c.left_reason ? ' · ' + esc(c.left_reason) : ''}` : '')}
            </dl>
            ${c.about ? `<div style="line-height:1.7;white-space:pre-wrap;border-top:1px dashed var(--line);padding-top:10px">${esc(c.about)}</div>` : ''}
            ${!c.my_title && !c.field && !c.started_on ? '<button class="btn dash" data-act="co-prof-edit" data-id="' + c.id + '">كمّل بيانات الشركة: مسماك، مجالها، بدأت فيها إمتى</button>' : ''}
          </div>
          <div class="grid3">
            <div class="card" style="padding:12px"><div class="num" style="font-size:24px;line-height:1.2">${k.team}</div><div class="mut">في التيم</div></div>
            <div class="card" style="padding:12px"><div class="num" style="font-size:24px;line-height:1.2">${k.depts}</div><div class="mut">قسم</div></div>
            <div class="card" style="padding:12px"><div class="num" style="font-size:24px;line-height:1.2">${k.log}</div><div class="mut">تطور متسجل</div></div>
          </div>
          <div class="btns">
            ${isCur ? '' : `<button class="btn pri" data-act="co-switch" data-id="${c.id}">${ic('swap', 18)}${c.left_on ? 'افتح بياناتها القديمة' : 'افتح الشركة دي'}</button>`}
            ${c.left_on ? `<button class="btn" data-act="co-unleave" data-id="${c.id}">رجعت للشركة دي</button>` : `<button class="btn bad" data-act="co-leave" data-id="${c.id}">${ic('door', 18)}استقلت من الشركة دي</button>`}
          </div>
          <div class="between"><span class="sec">شركاتي</span><button class="btn sm" data-act="co-new">${ic('plus', 16)}شركة جديدة</button></div>
          <div class="card"><div class="tl career">${career}</div>
            <div class="mut" style="padding-top:4px">كل شركة ليها تيم وأقسام وأرقام وسجل تطورات لوحدها. اللي بتفتحها هي اللي بتظهر في التيم والشركة والتقرير.</div></div>
        </div>`,
      };
    },
  },
};

// ---------------- الأزرار (شغالة من أي صفحة، ومن القايمة) ----------------
export const companyGlobal = {
  async 'co-prof-edit'(el) {
    const c = (await list('companies')).find(x => x.id === el.dataset.id); if (!c) return;
    openSheet('بيانات الشركة', `<label class="field"><span>اسم الشركة</span><input name="name" value="${esc(c.name)}"></label>
      <label class="field"><span>بتشتغل في إيه؟</span><input name="field" value="${esc(c.field)}" placeholder="مثلًا: صيانة موبايلات"></label>
      <label class="field"><span>مسمايا الوظيفي فيها</span><input name="my_title" value="${esc(c.my_title)}" placeholder="مثلًا: مطور أعمال"></label>
      <div class="grid2"><label class="field"><span>صاحب الشركة</span><input name="owner_name" value="${esc(c.owner_name)}"></label><label class="field"><span>بدأت فيها</span><input type="date" name="started_on" value="${c.started_on || ''}"></label></div>
      <label class="field"><span>الفروع</span><input name="branches" value="${esc(c.branches)}"></label>
      <label class="field"><span>نبذة عنها</span><textarea name="about" rows="4" placeholder="بتقدّم إيه، لمين، حجمها قد إيه">${esc(c.about)}</textarea></label>
      ${c.left_on ? `<div class="grid2"><label class="field"><span>استقلت يوم</span><input type="date" name="left_on" value="${c.left_on}"></label><label class="field"><span>السبب</span><input name="left_reason" value="${esc(c.left_reason)}"></label></div>` : ''}
      <button class="btn pri" data-act="co-prof-save" data-id="${c.id}">حفظ</button>`);
  },
  async 'co-prof-save'(el) {
    const f = formOf(sheetEl()); if (!f.name) return toast('اكتب اسم الشركة');
    const row = { name: f.name, field: f.field || null, my_title: f.my_title || null, owner_name: f.owner_name || null, started_on: f.started_on || null, branches: f.branches || null, about: f.about || null };
    if ('left_on' in f) Object.assign(row, { left_on: f.left_on || null, left_reason: f.left_reason || null });
    try { await upd('companies', el.dataset.id, row); closeSheet(); freshViews(); toast('اتحفظ'); doRefresh(); } catch (e) { fail(e); }
  },

  async 'co-switch'(el) {
    try { await upsert('profiles', { user_id: await myUid(), current_company_id: el.dataset.id }, 'user_id'); freshViews(); closeSheet(); toast('اتفتحت'); location.hash = '#/company'; } catch (e) { fail(e); }
  },

  async 'co-leave'(el) {
    const c = (await list('companies')).find(x => x.id === el.dataset.id); if (!c) return;
    openSheet('استقلت من ' + esc(c.name) + '؟', `<label class="field"><span>آخر يوم</span><input type="date" name="left_on" value="${today()}"></label>
      <label class="field"><span>السبب (لو حابب)</span><textarea name="left_reason" rows="3" placeholder="فرصة أحسن، اختلاف في الرؤية…"></textarea></label>
      <p class="mut" style="margin:0;line-height:1.7">التيم والأقسام والأرقام وسجل التطورات بتوع الشركة دي هيفضلوا محفوظين زي ما هم، وتقدر تفتحهم من "شركاتي" في أي وقت.</p>
      <button class="btn pri" data-act="co-leave-save" data-id="${c.id}">أيوه، استقلت</button>`);
  },
  async 'co-leave-save'(el) {
    const f = formOf(sheetEl()), id = el.dataset.id, on = f.left_on || today();
    try {
      await upd('companies', id, { left_on: on, left_reason: f.left_reason || null });
      await ins('company_log', { company_id: id, happened_on: on, text: 'استقلت من الشركة' + (f.left_reason ? ' — ' + f.left_reason : '') });
      // لو كانت هي المفتوحة، بنفتح شركة تانية شغال فيها (لو فيه)
      if ((await single('profiles'))?.current_company_id === id || currentCompanyId() === id) {
        const next = (await allCos()).find(x => !x.left_on && x.id !== id);
        await upsert('profiles', { user_id: await myUid(), current_company_id: next ? next.id : null }, 'user_id');
      }
      closeSheet(); freshViews(); toast('اتسجلت الاستقالة'); doRefresh();
    } catch (e) { fail(e); }
  },
  async 'co-unleave'(el) {
    try { await upd('companies', el.dataset.id, { left_on: null, left_reason: null }); freshViews(); toast('رجعت شغال فيها'); doRefresh(); } catch (e) { fail(e); }
  },

  async 'co-new'() {
    const cur = await currentCompany();
    const [depts, tracks] = await Promise.all([list('departments'), list('life_tracks')]);
    const tr = cur && tracks.find(t => t.name && t.name.includes(cur.name));
    openSheet('شركة جديدة', `<label class="field"><span>اسم الشركة</span><input name="name" autofocus></label>
      <label class="field"><span>بتشتغل في إيه؟</span><input name="field" placeholder="مثلًا: توزيع إكسسوارات"></label>
      <div class="grid2"><label class="field"><span>مسمايا الوظيفي</span><input name="my_title" placeholder="مطور أعمال"></label><label class="field"><span>بدأت فيها</span><input type="date" name="started_on" value="${today()}"></label></div>
      <div class="grid2"><label class="field"><span>صاحب الشركة</span><input name="owner_name"></label><label class="field"><span>الفروع</span><input name="branches"></label></div>
      <div class="field"><span>الهيكل (الأقسام والوظايف)</span>
        <div class="seg" id="co-struct">
          <button type="button" class="on" data-v="empty" onclick="this.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===this))">أبدأه من الأول</button>
          ${cur && depts.length ? `<button type="button" data-v="copy" onclick="this.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===this))">انسخه من ${esc(cur.name)}</button>` : ''}
        </div>
        <span class="mut">التيم بيبدأ فاضي، والنسخ بياخد الأقسام والوظايف ومعايير التقييم بس.</span></div>
      <label class="row" style="gap:10px;padding:4px 0"><input type="checkbox" name="make_current" checked style="width:22px;height:22px"><span>افتحها دلوقتي (تبقى الشركة اللي بتظهر في التيم والشركة)</span></label>
      ${tr ? `<label class="row" style="gap:10px;padding:4px 0"><input type="checkbox" name="rename_track" checked style="width:22px;height:22px" data-track="${tr.id}" data-old="${esc(cur.name)}"><span>غيّر مسار «${esc(tr.name)}» في حياتي لاسم الشركة الجديدة</span></label>` : ''}
      <button class="btn pri" data-act="co-new-save" data-src="${cur ? cur.id : ''}">ضيف الشركة</button>`);
  },
  async 'co-new-save'(el) {
    const s = sheetEl(), f = formOf(s); if (!f.name) return toast('اكتب اسم الشركة');
    const copy = s.querySelector('#co-struct .on')?.dataset.v === 'copy';
    try {
      const c = await ins('companies', { name: f.name, field: f.field || null, my_title: f.my_title || null, started_on: f.started_on || null, owner_name: f.owner_name || null, branches: f.branches || null });
      if (copy) {
        const [D, R] = await Promise.all([list('departments', { order: 'sort' }), list('role_criteria')]);
        const map = {};
        for (const d of D) map[d.id] = (await ins('departments', { company_id: c.id, name: d.name, sort: d.sort })).id;
        for (const r of R) await ins('role_criteria', { company_id: c.id, role: r.role, criteria: r.criteria, department_id: map[r.department_id] || null });
      }
      await ins('company_log', { company_id: c.id, happened_on: f.started_on || today(), text: 'بدأت الشغل في ' + f.name + (f.my_title ? ' (' + f.my_title + ')' : '') });
      const t = s.querySelector('[name=rename_track]');
      if (t && t.checked && f.make_current) { const tr = (await list('life_tracks')).find(x => x.id === t.dataset.track); if (tr) await upd('life_tracks', tr.id, { name: tr.name.replace(t.dataset.old, f.name) }); }
      if (f.make_current) await upsert('profiles', { user_id: await myUid(), current_company_id: c.id }, 'user_id');
      closeSheet(); freshViews(); toast('الشركة اتضافت');
      location.hash = f.make_current ? '#/company' : '#/companies/' + c.id;
    } catch (e) { fail(e); }
  },

  // ---------------- البايو اللي تحت "نوتة بلال" في القايمة ----------------
  async 'bio-edit'() {
    const [p, cur, projects] = await Promise.all([single('profiles'), currentCompany(), list('projects', { order: 'updated_at', asc: false })]);
    const picked = new Set(p?.bio_projects || []);
    window.__closeMenu && window.__closeMenu();
    openSheet('البايو', `<p class="mut" style="margin:0">ده اللي بيظهر تحت "نوتة بلال" في القايمة.</p>
      <label class="field"><span>المسمى الوظيفي${cur ? ' في ' + esc(cur.name) : ''}</span><input name="title" value="${esc(cur ? cur.my_title : p?.bio_title)}" placeholder="مثلًا: مطور أعمال"></label>
      <div class="field"><span>أبرز مشاريعي (لحد 3)</span>
        ${projects.length ? `<div class="list">${projects.map(x => `<label class="row" style="gap:10px;padding:9px 0"><input type="checkbox" data-proj="${x.id}"${picked.has(x.id) ? ' checked' : ''} style="width:22px;height:22px"><span style="flex:1">${esc(x.name)}</span></label>`).join('')}</div>`
          : '<span class="mut">لسه مفيش مشاريع. ضيفها من "مشاريعي".</span>'}
        <span class="mut">لو مختارتش، بيظهر آخر مشروعين اشتغلت عليهم.</span></div>
      <label class="field"><span>سطر عنك (لو حابب)</span><input name="line" value="${esc(p?.bio_line)}" placeholder="مثلًا: بكبّر الشركة خطوة بخطوة"></label>
      <button class="btn pri" data-act="bio-save" data-co="${cur ? cur.id : ''}">حفظ</button>`);
  },
  async 'bio-save'(el) {
    const s = sheetEl(), f = formOf(s);
    const proj = [...s.querySelectorAll('[data-proj]:checked')].map(x => x.dataset.proj);
    if (proj.length > 3) return toast('اختار 3 مشاريع بالكتير');
    try {
      if (el.dataset.co) await upd('companies', el.dataset.co, { my_title: f.title || null });
      await upsert('profiles', { user_id: await myUid(), bio_projects: proj, bio_line: f.line || null, ...(el.dataset.co ? {} : { bio_title: f.title || null }) }, 'user_id');
      closeSheet(); toast('البايو اتحفظ');
    } catch (e) { fail(e); }
  },
};

// البايو نفسه (بيتعرض في القايمة)
export async function bioHtml() {
  const [p, cur, projects] = await Promise.all([single('profiles'), currentCompany(), list('projects', { order: 'updated_at', asc: false })]);
  const title = cur ? cur.my_title : p?.bio_title;
  const ids = p?.bio_projects || [];
  const top = ids.length ? ids.map(id => projects.find(x => x.id === id)).filter(Boolean) : projects.slice(0, 2);
  const role = title && cur ? `${esc(title)} <span class="at">في</span> <b>${esc(cur.name)}</b>` : title ? esc(title) : cur ? `<b>${esc(cur.name)}</b>` : '<span class="mut">دوس هنا واكتب مسماك الوظيفي</span>';
  return `<button class="bio" data-act="bio-edit" aria-label="عدّل البايو">
    <span class="bio-edit">${ic('edit', 15)}</span>
    <span class="disp bio-name">نوتة ${esc(p?.display_name || 'بلال')}</span>
    <span class="bio-role">${role}</span>
    ${top.length ? `<span class="bio-proj"><span class="mut">أبرز مشاريعي</span>${top.map(x => `<span class="chip">${esc(x.name)}</span>`).join('')}</span>` : ''}
    ${p?.bio_line ? `<span class="bio-line">${esc(p.bio_line)}</span>` : ''}
  </button>`;
}
