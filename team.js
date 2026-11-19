// التيم وصفحة كل فرد
import { list, one, ins, upd, del, upsert } from './db.js';
import { esc, ic, fd, fMonth, today, monthStart, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, opts, dictate } from './ui.js';
import { stepsBlock, linksSlot, archiveWithUndo, doRefresh, openTask } from './comps.js';

const st = { former: false, role: '' };
const avg = r => { const v = Object.values(r?.scores || {}).map(Number).filter(Boolean); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null; };

async function criteria() { return Object.fromEntries((await list('role_criteria')).map(r => [r.role, r.criteria])); }

async function memberSheet(m = {}) {
  const C = await criteria();
  openSheet(m.id ? 'تعديل' : 'فرد جديد', `
    <label class="field"><span>الاسم</span><input name="name" value="${esc(m.name)}" autofocus></label>
    <div class="grid2"><label class="field"><span>الوظيفة</span><select name="role">${opts(Object.keys(C), m.role || 'فني')}</select></label>
    <label class="field"><span>بدأ معانا</span><input type="date" name="started_on" value="${m.started_on || ''}"></label></div>
    <label class="field"><span>نقط القوة وملاحظات عامة</span><textarea name="strengths" rows="3">${esc(m.strengths)}</textarea></label>
    <button class="btn pri" data-act="member-save" data-id="${m.id || ''}">حفظ</button>`);
}

export default {
  team: {
    dock: 'team',
    async render() {
      const mon = monthStart();
      const [members, ratings, notes] = await Promise.all([
        list('team_members', { order: 'name' }), list('member_ratings', { eq: { month: mon } }), list('member_notes', { order: 'noted_on', asc: false, limit: 200 })]);
      const R = Object.fromEntries(ratings.map(r => [r.member_id, r]));
      const lastNote = {}; notes.forEach(x => { if (!lastNote[x.member_id]) lastNote[x.member_id] = x; });
      const cur = members.filter(m => m.active), former = members.filter(m => !m.active);
      const roles = [...new Set(cur.map(m => m.role))];
      const L = (st.former ? former : cur).filter(m => !st.role || m.role === st.role);
      const rated = cur.filter(m => avg(R[m.id])).length;
      return {
        title: 'التيم', sub: `${cur.length} فرد · ${rated} اتقيموا في ${fMonth(mon).split(' ')[0]}`,
        fab: { label: 'فرد', act: 'member-new' },
        html: `<div class="stack">
          <div class="seg"><button class="${st.former ? '' : 'on'}" data-act="team-former" data-v="0">الحاليين <span class="num">${cur.length}</span></button><button class="${st.former ? 'on' : ''}" data-act="team-former" data-v="1">اللي مشيوا <span class="num">${former.length}</span></button></div>
          ${roles.length > 1 && !st.former ? `<div class="pills"><button class="${st.role ? '' : 'on'}" data-act="team-role" data-v="">الكل</button>${roles.map(r => `<button class="${st.role === r ? 'on' : ''}" data-act="team-role" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div>` : ''}
          ${L.length ? L.map(m => {
            const r = R[m.id]; const sc = r ? Object.entries(r.scores || {}).filter(([, v]) => v) : [];
            const ln = lastNote[m.id];
            return `<div class="card row" style="align-items:flex-start;gap:12px">
              <a href="#/member/${m.id}" class="disp" style="width:46px;height:46px;border-radius:14px;background:var(--ink);color:var(--paper);display:flex;align-items:center;justify-content:center;font-size:21px;flex:none;text-decoration:none">${esc(m.name.trim()[0] || '؟')}</a>
              <a href="#/member/${m.id}" style="flex:1;text-decoration:none;display:flex;flex-direction:column;gap:3px">
                <span class="row" style="gap:8px"><b style="font-weight:600">${esc(m.name)}</b><span class="chip">${esc(m.role)}</span></span>
                ${sc.length ? `<span class="row mut" style="flex-wrap:wrap;gap:4px 12px">${sc.map(([k, v]) => `<span>${esc(k)} <b class="num" style="color:var(--ink)">${v}</b></span>`).join('')}</span>` : (m.active ? `<span class="late" style="font-size:12px">لسه ماتقيمش الشهر ده</span>` : `<span class="mut">مشي ${fd(m.left_on)}</span>`)}
                ${ln ? `<span class="mut" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fd(ln.noted_on)}: ${esc(ln.text)}</span>` : ''}
              </a>
              ${m.active ? `<button class="rb" style="width:40px;height:40px" data-act="note-quick" data-id="${m.id}" data-name="${esc(m.name)}" aria-label="رأيك في ${esc(m.name)} النهاردة">${ic('plus', 18)}</button>` : ''}
            </div>`;
          }).join('') : empty(st.former ? 'مفيش حد هنا.' : 'ضيف أفراد التيم من زرار "فرد".')}
        </div>`,
      };
    },
    actions: {
      'team-former'(el) { st.former = el.dataset.v === '1'; doRefresh(); },
      'team-role'(el) { st.role = el.dataset.v; doRefresh(); },
      'member-new': () => memberSheet(),
      'note-quick'(el) {
        openSheet(`رأيك في ${esc(el.dataset.name)}`, `<textarea class="inp" name="text" rows="3" autofocus placeholder="اكتب أو استخدم مايك الكيبورد…"></textarea><p class="mut" style="margin:0">رأيك خاص بيك، ومش بيظهر في التقرير.</p><button class="btn pri" data-act="note-save" data-id="${el.dataset.id}">سجّل</button>`);
      },
    },
  },

  member: {
    async render(p) {
      const m = await one('team_members', p.id);
      if (!m) return { title: 'فرد', back: '#/team', html: empty('الفرد ده مش موجود.') };
      const mon = st.month && st.memberId === m.id ? st.month : monthStart();
      const [C, rate, prev, notes, steps] = await Promise.all([
        criteria(), list('member_ratings', { eq: { member_id: m.id, month: mon } }),
        list('member_ratings', { eq: { member_id: m.id }, lt: ['month', mon], order: 'month', asc: false, limit: 1 }),
        list('member_notes', { eq: { member_id: m.id }, order: 'noted_on', asc: false, limit: 15 }),
        list('plan_steps', { eq: { parent_type: 'member', parent_id: m.id }, order: 'sort' })]);
      const crit = C[m.role] || C['أخرى'] || ['الالتزام'];
      const r = rate[0] || { scores: {}, comment: '' };
      const pa = avg(prev[0]);
      return {
        title: m.name, sub: `${m.role}${m.started_on ? ' · معانا من ' + fd(m.started_on) : ''}${m.active ? '' : ' · مشي'}`, back: '#/team',
        html: `<div class="stack" style="padding-bottom:20px">
          <div class="card"><div class="between"><span style="font-weight:600">التقييم الشهري</span><input type="month" class="inp" style="width:auto;min-height:38px" value="${mon.slice(0, 7)}" data-change="rate-month" aria-label="الشهر"></div>
            ${crit.map(c => `<div class="rate"><span>${esc(c)}</span>${[1, 2, 3, 4, 5].map(i => `<button class="${Number(r.scores?.[c]) === i ? 'on' : ''}" data-act="rate" data-c="${esc(c)}" data-v="${i}" data-month="${mon}" aria-label="${esc(c)} ${i}">${i}</button>`).join('')}</div>`).join('')}
            <textarea class="inp" rows="2" placeholder="تعليق على الشهر (اختياري)" data-change="rate-comment" data-month="${mon}" style="margin-top:6px">${esc(r.comment)}</textarea>
            ${pa ? `<div class="mut" style="margin-top:6px">متوسط ${fMonth(prev[0].month)}: <b class="num" style="color:var(--ink)">${pa}</b></div>` : ''}</div>
          <div class="card"><div style="font-weight:600;margin-bottom:8px">رأيك فيه النهاردة <span class="mut">(اختياري، خاص بيك)</span></div>
            <form class="row" data-act-submit="note-add"><input class="inp" name="text" placeholder="اكتب أو اتكلم…" autocomplete="off"><button type="button" class="rb amb" data-act="note-mic" aria-label="سجّل بصوتك">${ic('mic', 20)}</button></form>
            <div class="list" style="margin-top:6px">${notes.map(x => `<div class="row" style="padding:8px 0;align-items:flex-start"><div style="flex:1;line-height:1.6"><span class="mut">${fd(x.noted_on)}</span><br>${esc(x.text)}</div><button class="star" data-act="note-del" data-id="${x.id}" aria-label="امسح">${ic('x', 16)}</button></div>`).join('')}</div></div>
          ${stepsBlock('member', m.id, steps, 'خطة تطويره')}
          ${m.strengths ? `<div class="card"><div class="mut" style="font-weight:600">نقط القوة وملاحظات</div><div style="white-space:pre-wrap">${esc(m.strengths)}</div></div>` : ''}
          ${linksSlot('member', m.id)}
          <div class="btns"><button class="btn sm" data-act="member-task">${ic('plus', 16)}مهمة عنه</button><button class="btn sm" data-act="member-edit">${ic('edit', 16)}تعديل</button></div>
          <div class="btns"><button class="btn sm" data-act="member-leave">${m.active ? 'مشي من الشركة' : 'رجع الشغل'}</button><button class="btn sm" data-act="member-archive">${ic('archive', 16)}أرشيف</button></div>
        </div>`,
      };
    },
    after(main, p) { st.memberId = p.id; },
    actions: {
      async rate(el, p) {
        try {
          const cur = (await list('member_ratings', { eq: { member_id: p.id, month: el.dataset.month } }))[0];
          const scores = { ...(cur?.scores || {}) }; const v = Number(el.dataset.v);
          scores[el.dataset.c] = scores[el.dataset.c] === v ? 0 : v;
          if (cur) await upd('member_ratings', cur.id, { scores }); else await ins('member_ratings', { member_id: p.id, month: el.dataset.month, scores });
          doRefresh();
        } catch (e) { fail(e); }
      },
      async 'rate-comment'(el, p) {
        try {
          const cur = (await list('member_ratings', { eq: { member_id: p.id, month: el.dataset.month } }))[0];
          if (cur) await upd('member_ratings', cur.id, { comment: el.value.trim() || null }); else await ins('member_ratings', { member_id: p.id, month: el.dataset.month, scores: {}, comment: el.value.trim() || null });
          toast('اتحفظ');
        } catch (e) { fail(e); }
      },
      'rate-month'(el) { if (el.value) { st.month = el.value + '-01'; doRefresh(); } },
      async 'note-add'(form, p) { const t = form.querySelector('[name=text]').value.trim(); if (!t) return; try { await ins('member_notes', { member_id: p.id, text: t }); doRefresh(); } catch (e) { fail(e); } },
      'note-mic'(el) {
        const inp = el.closest('form').querySelector('[name=text]');
        const r = dictate(t => (inp.value = t), live => el.classList.toggle('live', live));
        if (!r) { inp.focus(); toast('دوس على مايك الكيبورد واتكلم'); }
      },
      async 'note-del'(el) { try { await del('member_notes', el.dataset.id); doRefresh(); } catch (e) { fail(e); } },
      async 'member-edit'(el, p) { memberSheet(await one('team_members', p.id)); },
      async 'member-task'(el, p) { const m = await one('team_members', p.id); openTask(null, { _link: { type: 'member', id: m.id, title: m.name } }); },
      async 'member-leave'(el, p) { const m = await one('team_members', p.id); try { await upd('team_members', p.id, { active: !m.active }); doRefresh(); } catch (e) { fail(e); } },
      async 'member-archive'(el, p) { await archiveWithUndo('team_members', p.id, 'اتنقل للأرشيف', () => (location.hash = '#/team')); },
    },
  },
};

// actions اللي بتشتغل من الشيت في أي شاشة
export const teamGlobal = {
  async 'member-save'(el) {
    const f = formOf(sheetEl()); if (!f.name) return toast('اكتب الاسم');
    const row = { name: f.name, role: f.role, started_on: f.started_on || null, strengths: f.strengths || null };
    try { if (el.dataset.id) await upd('team_members', el.dataset.id, row); else await ins('team_members', row); closeSheet(); doRefresh(); } catch (e) { fail(e); }
  },
  async 'note-save'(el) {
    const f = formOf(sheetEl()); if (!f.text) return toast('اكتب رأيك');
    try { await ins('member_notes', { member_id: el.dataset.id, text: f.text }); closeSheet(); toast('رأيك اتسجل'); doRefresh(); } catch (e) { fail(e); }
  },
};
