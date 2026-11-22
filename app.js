// نوتة بلال — الهيكل الأساسي: الدخول، التنقل، الشريط اللي تحت، القائمة
import { sb, configured, auth, single, rpc, upd, upsert, openLocal, pull, startSync, onSync, syncStatus } from './db.js';
import { esc, ic, closeSheet, toast, fail, formOf, lockScroll, unlockScroll } from './ui.js';
import { setRefresh, taskActions, stepActions, linkActions, captureActions, openCapture, fillLinks } from './comps.js';
import today from './today.js';
import goals, { goalGlobal } from './goals.js';
import team, { teamGlobal } from './team.js';
import company from './company.js';
import misc from './misc.js';
import projects, { projectGlobal } from './projects.js';
import money, { moneyGlobal } from './money.js';
import more, { moreGlobal } from './more.js';
import review from './review.js';
import insights, { insightGlobal } from './insights.js';
import habits, { habitGlobal } from './habits.js';
import compare from './compare.js';
import life, { lifeGlobal } from './life.js';
import { peopleGlobal } from './people.js';
import { inboxGlobal } from './inbox.js';
import { tplGlobal } from './templates.js';
import './mentions.js';

const SCREENS = { ...today, ...goals, ...team, ...company, ...misc, ...projects, ...money, ...more, ...review, ...insights, ...habits, ...compare, ...life };
const GLOBAL = { ...goalGlobal, ...teamGlobal, ...projectGlobal, ...moneyGlobal, ...moreGlobal, ...insightGlobal, ...habitGlobal, ...lifeGlobal, ...peopleGlobal, ...inboxGlobal, ...tplGlobal, ...taskActions, ...stepActions, ...linkActions, ...captureActions,
  'close-sheet': closeSheet, capture: openCapture, menu: openMenu, 'close-menu': closeMenu };

const $ = s => document.querySelector(s);
let current = null;   // { screen, params }

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'today';
  const [path, qs] = h.split('?');
  const [name, id] = path.split('/');
  return { name, id, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

const DOCK = [['today', 'النهاردة', 'cal'], ['goals', 'الأهداف', 'goal'], null, ['team', 'التيم', 'team'], ['company', 'الشركة', 'co']];
function renderDock(active) {
  const d = $('#dock');
  if (!active) { d.hidden = true; document.body.classList.add('no-dock'); return; }
  document.body.classList.remove('no-dock');
  d.hidden = false;
  d.innerHTML = DOCK.map(x => x ? `<a href="#/${x[0]}" class="${x[0] === active ? 'on' : ''}">${ic(x[2])}${x[1]}</a>`
    : `<div class="mic"><button data-act="capture" aria-label="سجّل بسرعة">${ic('mic', 26)}</button></div>`).join('');
}

function renderTop(v) {
  const left = v.back
    ? `<a href="${v.back}" class="rb" aria-label="رجوع">${ic('back')}</a>`
    : `<button class="rb" data-act="menu" aria-label="القائمة">${ic('menu')}</button>`;
  $('#top').innerHTML = `${left}<div class="t">${v.sub ? `<div class="s">${esc(v.sub)}</div>` : ''}<h1${(v.title || '').length > 14 ? ' class="long"' : ''}>${esc(v.title || '')}</h1></div>
    ${v.right || ''}${v.noSearch ? '' : `<a href="#/search" class="rb" aria-label="بحث">${ic('search', 21)}</a>`}`;
}

// ---------- التنقل السريع: بنعرض آخر نسخة من الصفحة فورًا، وبنجيب الجديد في الخلفية ----------
const viewCache = new Map();
const NOCACHE = new Set(['money', 'flow', 'debts', 'investments', 'networth', 'search']);   // فلوسي مش بتتخزن
const TABS = ['today', 'goals', 'team', 'company'];
const scrollPos = new Map();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const keyOf = () => location.hash && location.hash !== '#' ? location.hash : '#/today';
const depthOf = p => p.id ? 2 : TABS.includes(p.name) ? 0 : 1;
let lastDepth = 0, renderSeq = 0, progT;

function progress(on) {
  const b = document.getElementById('progress');
  clearTimeout(progT);
  if (on) progT = setTimeout(() => { b.className = 'on'; }, 120);
  else if (b.className === 'on') { b.className = 'done'; progT = setTimeout(() => (b.className = ''), 250); }
}
function paint(v, screen, dir, animate) {
  const main = $('#main');
  const apply = () => {
    renderTop(v);
    main.innerHTML = v.html + (v.fab ? `<button class="fab" data-act="${v.fab.act}" ${v.fab.attrs || ''}>${ic('plus', 20)}${esc(v.fab.label)}</button>` : '');
    renderDock(screen.dock);
    const y = dir === 'back' ? scrollPos.get(keyOf()) || 0 : animate ? 0 : null;
    if (y !== null) window.scrollTo(0, y);
  };
  if (!animate || reduced) { apply(); return Promise.resolve(); }
  if (document.startViewTransition) {
    document.documentElement.dataset.nav = dir;
    const t = document.startViewTransition(apply);
    t.ready.catch(() => {}); t.finished.catch(() => {});
    return t.updateCallbackDone.catch(() => {});
  }
  apply();
  main.classList.remove('enter-forward', 'enter-back', 'enter-tab'); void main.offsetWidth; main.classList.add('enter-' + dir);
  return Promise.resolve();
}

async function render({ refresh = false } = {}) {
  const p = parseHash();
  const screen = SCREENS[p.name] || SCREENS.today;
  current = { screen, params: p };
  const key = keyOf(), seq = ++renderSeq;
  const d = depthOf(p), dir = refresh ? 'none' : d > lastDepth ? 'forward' : d < lastDepth ? 'back' : 'tab';
  if (!refresh) lastDepth = d;
  const canCache = !NOCACHE.has(p.name);
  const cached = !refresh && canCache && viewCache.get(key);
  if (cached) await paint(cached, screen, dir, true);
  else if (!refresh) progress(true);
  try {
    const v = await screen.render(p);
    if (seq !== renderSeq) return;
    progress(false);
    if (canCache) viewCache.set(key, v);
    const same = cached && cached.html === v.html && cached.title === v.title && cached.sub === v.sub && cached.fab?.label === v.fab?.label;
    if (!same) {
      const a = document.activeElement, main = $('#main');
      const typing = cached && a && main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
      if (!typing) await paint(v, screen, dir, !cached && !refresh);
    }
    screen.after && screen.after($('#main'), p);
    fillLinks($('#main'));
  } catch (e) {
    console.error(e); progress(false);
    if (!cached) $('#main').innerHTML = `<div class="empty" style="margin-top:20px">ما قدرتش أحمّل الصفحة. اتأكد من النت وجرّب تاني.<br><button class="btn sm" style="margin-top:10px" onclick="location.reload()">حمّل تاني</button></div>`;
  }
}
setRefresh(() => render({ refresh: true }));

// بنجهز التبويبات الأساسية في الخلفية عشان تفتح على طول
async function prefetchTabs() {
  for (const name of TABS) {
    const key = '#/' + name;
    if (viewCache.has(key) || keyOf() === key) continue;
    try { viewCache.set(key, await SCREENS[name].render({ name, id: undefined, query: {} })); } catch (e) {}
  }
}

// ---------- التعامل مع الضغطات ----------
function findAction(name) { return current?.screen.actions?.[name] || GLOBAL[name]; }
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = findAction(el.dataset.act);
  if (fn) { e.preventDefault(); fn(el, current?.params); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('[role=button][data-act]')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape') { closeSheet(); closeMenu(); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-act-submit]');
  if (!f) return;
  e.preventDefault();
  const fn = findAction(f.dataset.actSubmit); fn && fn(f, current?.params);
});
let inputT;
document.addEventListener('input', e => {
  const el = e.target.closest('[data-input]'); if (!el) return;
  clearTimeout(inputT); inputT = setTimeout(() => { const fn = findAction(el.dataset.input); fn && fn(el, current?.params); }, 250);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]'); if (!el) return;
  const fn = findAction(el.dataset.change); fn && fn(el, current?.params);
});
window.addEventListener('hashchange', e => {
  try { scrollPos.set(new URL(e.oldURL).hash || '#/today', window.scrollY); } catch (_) {}
  closeSheet(); closeMenu(); render();
});

// ---------- القائمة الجانبية ----------
function openMenu() {
  closeMenu();
  const d = document.createElement('div');
  d.className = 'drawer'; d.id = 'drawer';
  const item = (href, icon, label, meta = '', soon = false) => soon
    ? `<a class="soon" aria-disabled="true">${ic(icon, 21)}<span>${label}</span><span class="mut">في المرحلة الجاية</span></a>`
    : `<a href="${href}">${ic(icon, 21)}<span>${label}</span>${meta ? `<span class="mut">${meta}</span>` : ''}</a>`;
  d.innerHTML = `<div class="back" data-act="close-menu"></div><nav class="panel" aria-label="القائمة">
    <div style="padding:22px 20px 14px;border-bottom:1px dashed var(--line)"><div class="disp" style="font-size:26px">نوتة بلال</div><div class="mut">Fix Team</div></div>
    <div class="gh">حياتي</div>${item('#/life', 'star', 'حياتي', 'المسارات والمجالات')}${item('#/habits', 'repeat', 'عاداتي')}${item('#/courses', 'book', 'الكورسات')}${item('#/compare', 'chart', 'مقارنة الشهور')}
    <div class="gh">الشغل</div>${item('#/problems', 'alert', 'سجل المشاكل')}${item('#/structure', 'tree', 'الهيكل والنظام')}${item('#/hiring', 'user', 'التوظيف')}
    <div class="gh">متابعة</div>${item('#/day', 'clock', 'يومي', 'وقتي ونسبي')}${item('#/weekly', 'review', 'المراجعات الأسبوعية')}${item('#/recurring', 'repeat', 'مهام جاهزة', 'متكررة وقوالب')}${item('#/calendar', 'cal', 'التقويم')}
    <div class="gh">شغلي الخاص</div>${item('#/projects', 'layers', 'مشاريعي')}${item('#/money', 'wallet', 'فلوسي', 'مقفول')}
    <div class="gh">تقارير</div>${item('#/progress', 'chart', 'تقدّم الشركة')}${item('#/report', 'doc', 'تقرير للمالك')}
    <div style="margin-top:auto;border-top:1px dashed var(--line);padding:8px 0 18px">${item('#/archive', 'archive', 'الأرشيف')}${item('#/settings', 'cog', 'الإعدادات')}</div>
  </nav>`;
  d.addEventListener('click', e => { if (e.target.closest('a[href]')) closeMenu(); });
  document.body.appendChild(d);
  lockScroll();
}
function closeMenu() { const d = document.getElementById('drawer'); if (!d) return; d.remove(); unlockScroll(); }

// ---------- الدخول ----------
function authScreen() {
  $('#top').innerHTML = ''; renderDock(null);
  $('#main').innerHTML = `<div class="auth">
    <h1>نوتة بلال</h1>
    <p class="mut" style="font-size:15px;margin:0">ادخل بالإيميل والباسورد اللي عملتهم في Supabase.</p>
    <form class="stack" id="f-login">
      <input class="inp" name="email" type="email" inputmode="email" autocomplete="username" placeholder="الإيميل" required>
      <input class="inp" name="password" type="password" autocomplete="current-password" placeholder="الباسورد" required>
      <button class="btn pri">دخول</button>
    </form>
    <p class="mut" style="margin:0">نسيت الباسورد؟ غيّره من Supabase: Authentication ثم Users.</p>
  </div>`;
  const f = document.getElementById('f-login');
  f.onsubmit = async e => {
    e.preventDefault(); const v = formOf(f);
    try { await auth.signIn(v.email, v.password); start(); }
    catch (err) { toast('الإيميل أو الباسورد مش صح'); }
  };
}

// ---------- أول مرة ----------
function welcome(company) {
  $('#top').innerHTML = ''; renderDock(null);
  $('#main').innerHTML = `<div class="auth" style="justify-content:flex-start;padding-top:48px">
    <h1>أهلًا يا بلال</h1>
    <p class="mut" style="font-size:15px;margin:0">نبدأ ببيانات الشركة، وده اللي هيتبني عليه سجل التطورات والتقرير.</p>
    <form class="stack" id="f-welcome">
      <label class="field"><span>اسم الشركة</span><input name="name" value="${esc(company?.name || 'Fix Team')}"></label>
      <label class="field"><span>الفروع</span><input name="branches" value="${esc(company?.branches || 'دمياط، ميدان سرور')}"></label>
      <label class="field"><span>الشركة عاملة إزاي النهاردة؟</span><textarea name="status_text" rows="4" placeholder="عدد الأجهزة، العملاء، الفريق…"></textarea></label>
      <button class="btn pri">ابدأ</button>
    </form></div>`;
  const f = document.getElementById('f-welcome');
  f.onsubmit = async e => {
    e.preventDefault(); const v = formOf(f);
    try {
      await upsert('company', { name: v.name || 'Fix Team', branches: v.branches || null, status_text: v.status_text || null }, 'user_id');
      const s = await auth.session();
      await upsert('profiles', { user_id: s.user.id, onboarded: true }, 'user_id');
      location.hash = '#/today'; await render(); setTimeout(prefetchTabs, 600);
    } catch (err) { fail(err); }
  };
}

let syncing = false;
async function start() {
  if (!configured) {
    $('#main').innerHTML = `<div class="auth"><h1>نوتة بلال</h1><p>لسه محتاج تحط بيانات Supabase في ملف <b>config.js</b>.</p></div>`;
    return;
  }
  const s = await auth.session();
  if (!s) return authScreen();
  try {
    const has = await openLocal(s.user.id);
    if (!has) {
      if (!navigator.onLine) { $('#main').innerHTML = `<div class="auth"><h1>نوتة بلال</h1><p>أول مرة محتاج نت عشان ننزّل نسختك على الموبايل. بعد كده هيشتغل من غير نت.</p></div>`; return; }
      $('#main').innerHTML = '<div class="boot">بننزّل نسختك على الموبايل…</div>';
      await pull(true);
    }
    let prof = await single('profiles');
    if (!prof && navigator.onLine) { await rpc('seed_my_defaults'); prof = await single('profiles'); }
    applyTheme(prof?.theme);
    if (!syncing) { syncing = true; startSync(); }
    if (!prof?.onboarded) return welcome(await single('company'));
    rpc('spawn_recurring').catch(() => {});
    await render();
    setTimeout(prefetchTabs, 600);
  } catch (e) { fail(e); render(); }
}

// ---------- حالة المزامنة ----------
let pendingRefresh = false;
function busy() {
  const a = document.activeElement;
  return !document.getElementById('sheet-root').hidden || document.getElementById('drawer') || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}
function showSync() {
  const el = document.getElementById('syncpill'); if (!el) return;
  const s = syncStatus();
  let t = '';
  if (!s.online) t = s.pending ? `أوفلاين · ${edits(s.pending)} مستنية النت` : 'أوفلاين · شغال من الموبايل';
  else if (s.pending) t = 'بيحفظ على Supabase…';
  el.textContent = t; el.hidden = !t; el.classList.toggle('off', !s.online);
}
onSync(type => {
  showSync();
  if (type === 'data') { viewCache.clear(); if (busy()) pendingRefresh = true; else if (current) render({ refresh: true }); }
});
setInterval(() => { if (pendingRefresh && !busy()) { pendingRefresh = false; render({ refresh: true }); } }, 1500);

export function applyTheme(t = 'system') {
  try { localStorage.setItem('nota.theme', t); } catch (e) {}
  if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
}
window.__applyTheme = applyTheme;

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
if (sb) auth.onChange(s => { if (!s && navigator.onLine) authScreen(); });
start();

function edits(n) { return n === 1 ? 'تعديل واحد' : n === 2 ? 'تعديلين' : n <= 10 ? `${n} تعديلات` : `${n} تعديل`; }
