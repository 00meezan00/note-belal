// مكونات مشتركة بين الشاشات: المهام، الخطوات، الربط، التسجيل السريع
import { list, ins, upd, del, archive, unarchive, linksOf, link, rpc, single } from './db.js';
import { esc, ic, fd, today, addDays, dueText, empty, openSheet, closeSheet, sheetEl, formOf, toast, fail, dictate, opts, sw, n } from './ui.js';

export const AREAS = ['المبيعات والمحلات','التسويق','خدمة العملاء','خدمة ما بعد البيع والإرجاع','المحاسبة والتحصيل','الموردين وقطع الغيار','التسعير والصفقات','الموارد البشرية','الهيكل والنظام','متابعة الفنيين','التوسع','تطويري الشخصي'];
export const KIND = { task: ['مهمة','cal'], goal: ['هدف','goal'], idea: ['فكرة','spark'], problem: ['مشكلة','alert'], member: ['فرد','user'],
  project: ['مشروع','layers'], project_dev: ['تطوير في مشروع','layers'], course: ['كورس','book'], sop: ['إجراء','doc'], position: ['وظيفة','user'],
  candidate: ['متقدم','user'], metric: ['مؤشر','co'] };
export const hrefOf = (type, id) => ({ goal: `#/goal/${id}`, idea: `#/idea/${id}`, member: `#/member/${id}`, problem: `#/problems?open=${id}`,
  metric: '#/company', project: `#/project/${id}`, project_dev: `#/dev/${id}`, course: '#/courses', sop: '#/structure', position: '#/hiring', candidate: '#/hiring' }[type]);

let refresh = () => {};
export const setRefresh = fn => (refresh = fn);
export const doRefresh = () => refresh();

// ---------------- المهام ----------------
export function taskRow(t, { linkLabel = '', showStar = true } = {}) {
  const late = !t.done && t.due_on < today();
  const meta = [
    late ? `<span class="late">متأخرة من ${fd(t.due_on)}</span>` : '',
    t.recurring_id ? `<span class="mut row" style="gap:4px">${ic('repeat', 14)}متكررة</span>` : '',
    t.reminder_time ? `<span class="mut row" style="gap:4px">${ic('bell', 14)}${t.reminder_time.slice(0, 5)}</span>` : '',
    linkLabel ? `<span class="chip">${esc(linkLabel)}</span>` : '',
  ].join('');
  return `<div class="task${t.done ? ' done' : ''}">
    <button class="chk${t.done ? ' on' : ''}" data-act="task-toggle" data-id="${t.id}" aria-label="${t.done ? 'رجّعها' : 'خلصت'}">${t.done ? ic('check', 16) : ''}</button>
    <div class="body" data-act="task-open" data-id="${t.id}" role="button" tabindex="0"><div class="name">${esc(t.title)}</div>${meta ? `<div class="meta">${meta}</div>` : ''}</div>
    ${showStar && !t.done ? `<button class="star${t.top3_on === today() ? ' on' : ''}" data-act="task-star" data-id="${t.id}" aria-label="من أهم 3 النهاردة">${ic('star', 20)}</button>` : ''}
  </div>`;
}

export async function openTask(id, defaults = {}) {
  const t = id ? (await list('tasks', { eq: { id } }))[0] : { title: '', due_on: today(), reminder_time: null, ...defaults };
  if (!t) return;
  const links = id ? await linksOf('task', id) : [];
  const day = t.due_on === today() ? 'today' : t.due_on === addDays(today(), 1) ? 'tomorrow' : 'date';
  openSheet(id ? 'مهمة' : 'مهمة جديدة', `
    <label class="field"><span>المهمة</span><input name="title" value="${esc(t.title)}" autofocus placeholder="مثلًا: متابعة تحصيل المحلات"></label>
    <div class="field"><span>إمتى</span>
      <div class="pills" data-group="day">
        <button type="button" data-v="today" class="${day === 'today' ? 'on' : ''}" data-act="pick">النهاردة</button>
        <button type="button" data-v="tomorrow" class="${day === 'tomorrow' ? 'on' : ''}" data-act="pick">بكرة</button>
        <button type="button" data-v="date" class="${day === 'date' ? 'on' : ''}" data-act="pick">يوم تاني</button>
      </div>
      <input type="date" name="due_on" value="${t.due_on}" class="inp" ${day === 'date' ? '' : 'hidden'}>
    </div>
    <label class="field"><span>ذكّرني الساعة (اختياري)</span><input type="time" name="reminder_time" value="${t.reminder_time ? t.reminder_time.slice(0, 5) : ''}"></label>
    ${!id && defaults._link ? `<div class="chip" style="align-self:flex-start;padding:5px 10px">${ic('link', 14)}${esc(defaults._link.title)}</div>` : ''}
    ${id ? `<div class="field"><span>مرتبطة بـ</span><div class="row" style="flex-wrap:wrap;gap:6px">${links.map(l => `<span class="chip" style="padding:5px 10px">${ic(KIND[l.type]?.[1] || 'link', 14)}${esc(l.title)}</span>`).join('')}<button class="chip out" style="padding:5px 10px" data-act="link-pick" data-type="task" data-id="${id}">+ ربط</button></div></div>` : ''}
    <div class="btns">${id ? `<button class="btn" data-act="task-archive" data-id="${id}">${ic('archive', 18)}أرشيف</button><button class="btn" data-act="task-postpone" data-id="${id}">أجّلها لبكرة</button>` : ''}<button class="btn pri" data-act="task-save" data-id="${id || ''}">حفظ</button></div>`);
  sheetEl()._defaults = defaults;
}

export const taskActions = {
  pick(el) {
    const g = el.closest('[data-group]'); g.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
    if (g.dataset.group === 'day') {
      const inp = sheetEl().querySelector('[name=due_on]');
      inp.hidden = el.dataset.v !== 'date';
      if (el.dataset.v === 'today') inp.value = today();
      if (el.dataset.v === 'tomorrow') inp.value = addDays(today(), 1);
    }
  },
  async 'task-save'(el) {
    const f = formOf(sheetEl());
    if (!f.title) return toast('اكتب المهمة');
    const row = { title: f.title, due_on: f.due_on || today(), reminder_time: f.reminder_time || null };
    try {
      if (el.dataset.id) await upd('tasks', el.dataset.id, row);
      else {
        const t = await ins('tasks', row);
        const d = sheetEl()._defaults || {};
        if (d._link) await link('task', t.id, d._link.type, d._link.id);
      }
      closeSheet(); refresh();
    } catch (e) { fail(e); }
  },
  async 'task-toggle'(el) {
    const btn = el; const on = !btn.classList.contains('on');
    try { await upd('tasks', btn.dataset.id, { done: on }); refresh(); } catch (e) { fail(e); }
  },
  'task-open'(el) { openTask(el.dataset.id); },
  async 'task-star'(el) {
    const on = !el.classList.contains('on');
    try {
      if (on) {
        const cur = await list('tasks', { eq: { top3_on: today() } });
        if (cur.length >= 3) return toast('عندك 3 حاجات مهمة النهاردة. شيل واحدة الأول');
      }
      await upd('tasks', el.dataset.id, { top3_on: on ? today() : null }); refresh();
    } catch (e) { fail(e); }
  },
  async 'task-postpone'(el) { try { await upd('tasks', el.dataset.id, { due_on: addDays(today(), 1), top3_on: null }); closeSheet(); toast('اتأجلت لبكرة'); refresh(); } catch (e) { fail(e); } },
  async 'task-archive'(el) { await archiveWithUndo('tasks', el.dataset.id, 'المهمة اتنقلت للأرشيف'); closeSheet(); },
};

export async function archiveWithUndo(table, id, msg = 'اتنقلت للأرشيف', after) {
  try {
    await archive(table, id); refresh(); after && after();
    toast(msg, async () => { try { await unarchive(table, id); refresh(); } catch (e) { fail(e); } });
  } catch (e) { fail(e); }
}

// ---------------- الخطوات (خطة أي حاجة) ----------------
export function stepsBlock(parentType, parentId, steps, title = 'الخطة') {
  return `<div class="card" style="padding:10px 14px"><div class="between"><span style="font-weight:600">${title}</span><span class="mut num">${steps.filter(s => s.done).length}/${steps.length}</span></div>
    <div class="list">${steps.map(s => `<div class="task"><button class="chk${s.done ? ' on' : ''}" data-act="step-toggle" data-id="${s.id}" aria-label="خلصت">${s.done ? ic('check', 16) : ''}</button><div class="body"><div class="name"${s.done ? ' style="text-decoration:line-through;color:var(--mut)"' : ''}>${esc(s.text)}</div></div><button class="star" data-act="step-del" data-id="${s.id}" aria-label="شيل الخطوة">${ic('x', 18)}</button></div>`).join('')}</div>
    <form class="row" data-act-submit="step-add" data-pt="${parentType}" data-pid="${parentId}" style="margin-top:8px"><input class="inp" name="step" placeholder="+ خطوة جديدة" autocomplete="off"><button class="btn sm" type="submit">ضيف</button></form></div>`;
}
export const stepActions = {
  async 'step-toggle'(el) { try { await upd('plan_steps', el.dataset.id, { done: !el.classList.contains('on') }); refresh(); } catch (e) { fail(e); } },
  async 'step-del'(el) { try { await del('plan_steps', el.dataset.id); refresh(); } catch (e) { fail(e); } },
  async 'step-add'(form) {
    const v = form.querySelector('[name=step]').value.trim(); if (!v) return;
    try { await ins('plan_steps', { parent_type: form.dataset.pt, parent_id: form.dataset.pid, text: v, sort: Date.now() % 1e9 }); refresh(); } catch (e) { fail(e); }
  },
};

// ---------------- كارت "مرتبط بـ" ----------------
export const linksSlot = (type, id) => `<div data-links="${type}:${id}"><div class="card mut">بيحمّل الحاجات المرتبطة…</div></div>`;
export async function fillLinks(root) {
  for (const slot of root.querySelectorAll('[data-links]')) {
    const [type, id] = slot.dataset.links.split(':');
    try {
      const items = await linksOf(type, id);
      slot.innerHTML = `<div class="card" style="padding:12px 14px"><div class="row" style="gap:6px;font-weight:600">${ic('link', 18)}مرتبط بـ</div>
        <div class="list">${items.map(l => {
          const href = hrefOf(l.type, l.id);
          const inner = `<span class="k">${ic(KIND[l.type]?.[1] || 'link', 18)}</span><span class="t"><small>${KIND[l.type]?.[0] || ''}</small>${esc(l.title)}</span>`;
          return `<div class="row">${href ? `<a class="lnk" href="${href}">${inner}</a>` : `<button class="lnk" data-act="task-open" data-id="${l.id}">${inner}</button>`}<button class="star" data-act="link-del" data-id="${l.link}" aria-label="شيل الربط">${ic('x', 16)}</button></div>`;
        }).join('') || '<div class="mut" style="padding:8px 0">مش مربوط بحاجة لسه.</div>'}</div>
        <button class="btn dash sm" style="margin-top:8px" data-act="link-pick" data-type="${type}" data-id="${id}">+ اربط بحاجة تانية</button></div>`;
    } catch (e) { slot.innerHTML = ''; console.error(e); }
  }
}
export const linkActions = {
  async 'link-del'(el) { try { await del('links', el.dataset.id); refresh(); } catch (e) { fail(e); } },
  'link-pick'(el) {
    const { type, id } = el.dataset;
    openSheet('اربط بـ', `<input class="inp" name="q" placeholder="دوّر على هدف، مهمة، فرد، مشكلة، مشروع…" autofocus data-input="link-search" data-type="${type}" data-id="${id}"><div class="list" id="link-res"><div class="mut" style="padding:8px 0">اكتب كلمة وهتظهر النتايج.</div></div>`);
  },
  async 'link-search'(inp) {
    const q = inp.value.trim(); const box = document.getElementById('link-res'); if (!box) return;
    if (q.length < 2) { box.innerHTML = '<div class="mut" style="padding:8px 0">اكتب كلمة وهتظهر النتايج.</div>'; return; }
    const safe = q.replace(/[%,()]/g, ' ');
    const rows = (await list('v_search', { or: `title.ilike.%${safe}%,body.ilike.%${safe}%`, limit: 30 })).filter(r => KIND[r.kind] && !(r.kind === inp.dataset.type && r.id === inp.dataset.id));
    box.innerHTML = rows.map(r => `<button class="lnk" data-act="link-make" data-type="${inp.dataset.type}" data-id="${inp.dataset.id}" data-tt="${r.kind}" data-tid="${r.id}"><span class="k">${ic(KIND[r.kind][1], 18)}</span><span class="t"><small>${KIND[r.kind][0]}</small>${esc(r.title)}</span></button>`).join('') || '<div class="mut" style="padding:8px 0">مفيش نتايج.</div>';
  },
  async 'link-make'(el) {
    try { await link(el.dataset.type, el.dataset.id, el.dataset.tt, el.dataset.tid); closeSheet(); toast('اتربطوا'); refresh(); } catch (e) { fail(e); }
  },
};

// ---------------- فهم الفلوس من الكلام ----------------
// "أكلت بـ 300 جنيه" ← مصروف 300 على بند الأكل. "قبضت 5000" ← دخل 5000.
const norm = s => String(s || '')
  .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  .replace(/٫/g, '.').replace(/(\d)[,٬](\d{3})/g, '$1$2')
  .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
const NUMW = {
  واحد: 1, اتنين: 2, اثنين: 2, تلاته: 3, ثلاثه: 3, اربعه: 4, خمسه: 5, سته: 6, سبعه: 7, تمانيه: 8, ثمانيه: 8, تسعه: 9, عشره: 10,
  حداشر: 11, اتناشر: 12, تلتاشر: 13, تلاتاشر: 13, اربعتاشر: 14, خمستاشر: 15, ستاشر: 16, سبعتاشر: 17, تمنتاشر: 18, تسعتاشر: 19,
  عشرين: 20, تلاتين: 30, ثلاثين: 30, اربعين: 40, خمسين: 50, ستين: 60, سبعين: 70, تمانين: 80, ثمانين: 80, تسعين: 90,
  ميه: 100, مايه: 100, مئه: 100, مائه: 100, ميت: 100, ميتين: 200, مئتين: 200, ميتان: 200,
  تلتميه: 300, تلاتميه: 300, ثلاثمائه: 300, ثلاثميه: 300, ربعميه: 400, اربعميه: 400, اربعمائه: 400, خمسميه: 500, خمسمائه: 500,
  ستميه: 600, ستمائه: 600, سبعميه: 700, سبعمائه: 700, تمنميه: 800, تمانميه: 800, ثمانمائه: 800, تسعميه: 900, تسعمائه: 900,
  الف: 1000, الاف: 1000, الفين: 2000,
};
const numOf = w => { if (/^\d+(\.\d+)?$/.test(w)) return parseFloat(w); if (NUMW[w] != null) return NUMW[w]; const s = w.replace(/^[وب]/, ''); return NUMW[s] ?? (/^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null); };
const MONEY_WORD = /^(جنيه|جنيهات|جنية|جنيها|ج|ج\.م|pound|egp)$/;
// بيلاقي أول مبلغ في الكلام، ويرجّع المبلغ والكلام من غيره
function findAmount(text) {
  const words = norm(text).replace(/(\d)([^\d\s.])/g, '$1 $2').replace(/([^\d\s.])(\d)/g, '$1 $2').split(/\s+/).filter(Boolean);
  let best = null;
  for (let i = 0; i < words.length; i++) {
    if (numOf(words[i]) == null || words[i] === 'و' || words[i] === 'ب') continue;
    let total = 0, cur = 0, last = 0, j = i, used = [];
    for (; j < words.length; j++) {
      const w = words[j], v = numOf(w);
      if (w === 'و' || w === 'ب') { used.push(j); continue; }
      if (/^و?نص$/.test(w) && last) { cur += last / 2; used.push(j); continue; }
      if (v == null) break;
      if (v === 1000 && /^(و?الف|و?الاف)$/.test(w)) { total += (cur || 1) * 1000; cur = 0; last = 1000; }
      else if (v >= 1000) { total += v; last = 1000; }
      else { cur += v; last = v >= 100 ? 100 : v >= 10 ? 10 : 1; }
      used.push(j);
    }
    const amount = total + cur;
    while (used.length && /^[وب]$/.test(words[used[used.length - 1]])) used.pop();
    const money = MONEY_WORD.test(words[j] || '');
    if (money) used.push(j);
    if (amount > 0 && (!best || (money && !best.money))) best = { amount, money, used: new Set(used) };
    if (best?.money) break;
    i = j;
  }
  if (!best) return null;
  const rest = words.filter((_, k) => !best.used.has(k)).join(' ').replace(/(^|\s)[بو](\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  return { amount: Math.round(best.amount * 100) / 100, money: best.money, rest };
}
const INCOME_RE = /(قبضت|استلمت|جالي|جاتلي|جالى|دخلي|دخللي|المرتب|مرتبي|كسبت|اتحولي|حولولي|بعت لي|بعتلي|مكسب|عمولتي|عموله)/;
const SPEND_RE = /(صرفت|دفعت|اشتريت|جبت|اكلت|شربت|اتغديت|اتعشيت|فطرت|حطيت|ركبت|خلصت علي|راحوا علي|دفعنا|اشترينا|مصروف|مصاريف)/;
// كلمات لكل بند: بنقارن بيها اسم البند عندك
const CAT_HINTS = [
  [/اكل|شرب|طعام|مطاعم/, /(اكل|اكلت|غدا|غدي|اتغديت|فطار|فطرت|عشا|اتعشيت|شربت|قهوه|شاي|نسكافيه|مطعم|سندوتش|ساندوتش|كشري|فول|طعميه|عصير|حلويات|بيتزا|فراخ|برجر|شاورما|سوبر ماركت|بقاله|مياه)/],
  [/مواصلات|بنزين|عربيه|انتقال/, /(بنزين|مواصلات|تاكسي|اوبر|كريم|ميكروباص|توكتوك|توك توك|اتوبيس|مترو|ركبت|موتوسيكل|جاز|سولار|عربيه|جراج|غسيل العربيه)/],
  [/كورس|تعليم|كتب/, /(كورس|كورسات|دوره|كتاب|كتب|محاضره|ورشه)/],
  [/فواتير|كهربا|نت|موبايل/, /(كهربا|كهرباء|فاتوره|نت|انترنت|رصيد|كارت شحن|باقه|مياه|غاز)/],
  [/لبس|هدوم/, /(لبس|هدوم|قميص|بنطلون|جزمه|كوتشي)/],
  [/صحه|علاج|دكتور/, /(دكتور|دوا|علاج|صيدليه|تحاليل)/],
];
function findCat(t, cats) {
  for (const c of cats) {   // لو اسم البند نفسه في الكلام
    const words = norm(c.name).split(/\s+/).filter(w => w.length >= 3 && !/^(و|في|من)$/.test(w));
    if (words.some(w => t.includes(w.replace(/^و/, '')))) return c;
  }
  for (const [nameRe, wordRe] of CAT_HINTS) {
    if (!wordRe.test(t)) continue;
    const c = cats.find(c => nameRe.test(norm(c.name))); if (c) return c;
  }
  return null;
}
export function parseMoney(text, cats = []) {
  const a = findAmount(text); if (!a) return null;
  const t = norm(text);
  const sure = a.money || SPEND_RE.test(t);
  if (!SPEND_RE.test(t) && !INCOME_RE.test(t) && /(لازم|محتاج|عايز|هدفع|هادفع|هشتري|هاشتري|تابع|اتابع|كلم|اكلم|تحصيل|حصل|فكر|مهمه|فكره|مشكله|المورد|العميل)/.test(t)) return null;   // كلام عن شغل جاي، مش فلوس اتصرفت
  if (!a.money && /(الساعه|ساعه|ساعات|دقيقه|دقايق|بكره|يوم|ايام|اسبوع|شهور|مره|مرات|محلات|جهاز|اجهزه)/.test(t)) return null;   // "كلم المحل الساعة 3" دي مهمة مش فلوس
  if (INCOME_RE.test(t)) return { type: 'income', amount: a.amount, note: a.rest };
  const cat = findCat(t, cats);
  if (sure || (cat && a.rest.split(' ').length <= 3)) return { type: 'expense', amount: a.amount, cat, note: a.rest };
  return null;
}

// ---------------- التسجيل السريع (زرار المايك) ----------------
let rec = null;
export async function openCapture() {
  const [members, cats] = await Promise.all([
    list('team_members', { eq: { active: true }, order: 'name' }).catch(() => []),
    list('budget_categories', { order: 'sort' }).catch(() => []),
  ]);
  const canVoice = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  openSheet('سجّل بسرعة', `
    <button class="mic-big" data-act="cap-mic" aria-label="${canVoice ? 'اتكلم' : 'اكتب بصوتك من الكيبورد'}">${ic('mic', 42)}</button>
    <div class="mut" style="text-align:center;margin-top:-4px" id="cap-hint">${canVoice ? 'دوس واتكلم. قول مثلًا: أكلت بـ 300 جنيه' : 'اكتب، أو دوس مايك الكيبورد واتكلم'}</div>
    <textarea class="inp" name="text" rows="3" placeholder="اكتب أو اتكلم…" style="font-size:17px;line-height:1.7" data-input="cap-text"></textarea>
    <div class="card" id="cap-got" hidden style="padding:10px 14px;background:var(--amb-soft);border-color:var(--amb)"></div>
    <div><div style="font-size:14px;font-weight:600;margin-bottom:8px">تتسجل كـ</div>
      <div class="types" data-group="ctype">
        ${[['task','مهمة'],['idea','فكرة'],['problem','مشكلة'],['note','رأي في فرد'],['expense','مصروف'],['income','دخل']].map(([v, l], i) => `<button type="button" data-v="${v}" class="${i === 0 ? 'on' : ''}" data-act="cap-type">${l}</button>`).join('')}
      </div></div>
    <div data-extra="note" hidden><label class="field"><span>عن مين؟</span><select name="member">${opts(members.map(m => [m.id, m.name]))}</select></label></div>
    <div data-extra="expense" hidden class="grid2"><label class="field"><span>المبلغ</span><input name="amount" inputmode="decimal" placeholder="150"></label><label class="field"><span>البند</span><select name="cat"><option value="">من غير بند</option>${opts(cats.map(c => [c.id, c.name]))}</select></label></div>
    <div data-extra="income" hidden><label class="field"><span>المبلغ</span><input name="in_amount" inputmode="decimal" placeholder="2500"></label></div>
    <button class="btn amb" data-act="cap-save">حفظ</button>`);
  sheetEl()._cats = cats;
}
function setType(v) {
  const s = sheetEl();
  s.querySelectorAll('[data-group=ctype] button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  s.querySelectorAll('[data-extra]').forEach(x => (x.hidden = x.dataset.extra !== v));
}
// بيقرا الكلام: لو فيه فلوس بيختار "مصروف" أو "دخل" لوحده ويكتب المبلغ والبند
function readMoney() {
  const s = sheetEl(); if (!s || !s.querySelector('[data-group=ctype]')) return null;
  const got = s.querySelector('#cap-got');
  const m = parseMoney(s.querySelector('[name=text]').value, s._cats || []);
  if (!m) { got.hidden = true; return null; }
  setType(m.type);
  if (m.type === 'expense') { s.querySelector('[name=amount]').value = m.amount; s.querySelector('[name=cat]').value = m.cat?.id || ''; }
  else s.querySelector('[name=in_amount]').value = m.amount;
  got.hidden = false;
  got.innerHTML = `فهمت: <b>${m.type === 'expense' ? 'مصروف' : 'دخل'} <span class="num">${n(m.amount)}</span> جنيه</b>${m.cat ? ` على "${esc(m.cat.name)}"` : m.type === 'expense' ? ' (من غير بند)' : ''}`;
  return m;
}
async function saveMoney(type, f, text) {
  if (type === 'expense') {
    const a = parseFloat(f.amount); if (!a) { toast('اكتب المبلغ'); return false; }
    const r = await ins('expenses', { amount: a, category_id: f.cat || null, note: text || null, source: 'voice' });
    const cat = (sheetEl()._cats || []).find(c => c.id === f.cat);
    toast(`اتسجل مصروف ${n(a)} جنيه${cat ? ' · ' + cat.name : ''}`, async () => { try { await del('expenses', r.id); refresh(); toast('اتشال'); } catch (e) { fail(e); } });
  } else {
    const a = parseFloat(f.in_amount); if (!a) { toast('اكتب المبلغ'); return false; }
    const r = await ins('incomes', { amount: a, source: text || 'دخل' });
    toast(`اتسجل دخل ${n(a)} جنيه`, async () => { try { await del('incomes', r.id); refresh(); toast('اتشال'); } catch (e) { fail(e); } });
  }
  return true;
}
export const captureActions = {
  'cap-type'(el) { setType(el.dataset.v); },
  'cap-text'() { readMoney(); },
  'cap-mic'(el) {
    const ta = sheetEl().querySelector('[name=text]');
    if (rec) { rec.stop(); return; }
    const pre = ta.value.trim() ? ta.value.trim() + ' ' : '';
    rec = dictate(t => { ta.value = pre + t; readMoney(); }, async live => {
      el.classList.toggle('live', live);
      const h = document.getElementById('cap-hint');
      if (h) h.textContent = live ? 'بسمعك… دوس على المايك تاني لما تخلص' : 'تمام، راجع الكلام واحفظ';
      if (live) return;
      rec = null;
      // قلت مبلغ؟ بيتسجل على طول في فلوسي، ولو غلط دوس "تراجع"
      const m = readMoney();
      if (m && sheetEl().querySelector('[name=text]')) {
        try { if (await saveMoney(m.type, formOf(sheetEl()), m.note || ta.value.trim())) { closeSheet(); refresh(); } } catch (e) { fail(e); }
      }
    });
    if (!rec) { ta.focus(); toast('دوس على مايك الكيبورد واتكلم'); }
  },
  async 'cap-save'() {
    const s = sheetEl(); const f = formOf(s);
    const type = s.querySelector('[data-group=ctype] .on').dataset.v;
    const text = f.text; const src = 'voice';
    try {
      if (type === 'task') { if (!text) return toast('اكتب المهمة'); await ins('tasks', { title: text, source: 'manual' }); toast('اتسجلت في مهام النهاردة'); }
      if (type === 'idea') { if (!text) return toast('اكتب الفكرة'); await ins('ideas', { title: text.split('\n')[0].slice(0, 120), body: text.length > 120 ? text : null, source: src }); toast('اتسجلت في الأفكار'); }
      if (type === 'problem') { if (!text) return toast('اكتب المشكلة'); await ins('problems', { title: text }); toast('اتسجلت في سجل المشاكل'); }
      if (type === 'note') { if (!text || !f.member) return toast('اكتب رأيك واختار الفرد'); await ins('member_notes', { member_id: f.member, text }); toast('رأيك اتسجل'); }
      if (type === 'expense' || type === 'income') {
        const m = parseMoney(text, s._cats || []);
        if (!(await saveMoney(type, f, (m && m.note) || text))) return;
      }
      closeSheet(); refresh();
    } catch (e) { fail(e); }
  },
};
