// ✦ اسأل: مساعد بيتفرج على الفيديو ويلخّصه ويجاوب أسئلتك (زي زرار Ask في يوتيوب)
// - أول مرة بيتفرج على الفيديو كله ويعمل "ملف" (ملخص + نقط بالأوقات + كلمات صعبة + شرح مفصّل) وبيتحفظ
// - بعد كده الأسئلة بتتجاوب من الملف ده (سريع وما بيصرفش من حصة الفيديوهات اليومية)
// - "اشرح اللي بيتقال دلوقتي" بيتفرج على الدقيقتين اللي حوالين مكانك بس
// - أي إجابة تقدر تحطها في الدفتر بضغطة
import { sb } from './db.js';
import * as CFG from './config.js';
import { esc, ic, toast } from './ui.js';

const WORKER = (CFG.WORKER_URL || '').replace(/\/$/, '');
const mmss = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
let S = null;   // { ctx, host, msgs: [{who, text, label, t}], busy }

// الكلام بتاع المساعد: **عريض**، نقط، أرقام، وأوقات [12:30] بتبقى زراير
function md(text) {
  const lines = esc(text || '').split('\n');
  let out = '', list = '';
  const close = () => { if (list) { out += `</${list}>`; list = ''; } };
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (m, t) => `<button type="button" class="ai-ts" data-act="ai-seek" data-t="${t}">${t}</button>`);
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) { close(); continue; }
    let m;
    if ((m = /^[-•*]\s+(.*)/.exec(l))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = /^(\d+)[.)]\s+(.*)/.exec(l))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[2])}</li>`; }
    else if ((m = /^#{1,4}\s+(.*)/.exec(l))) { close(); out += `<h4>${inline(m[1])}</h4>`; }
    else { close(); out += `<p>${inline(l)}</p>`; }
  }
  close(); return out;
}
// نفس الكلام بس سطور للدفتر
function toBlocks(text, label, t) {
  const B = [{ type: 'h3', text: '✦ ' + label, c: 'purple', ...(t != null ? { t: Math.floor(t) } : {}) }];
  for (const raw of String(text || '').split('\n')) {
    const l = raw.trim().replace(/\*\*(.+?)\*\*/g, '$1'); if (!l) continue;
    let m;
    if ((m = /^[-•*]\s+(.*)/.exec(l))) B.push({ type: 'li', text: m[1] });
    else if ((m = /^(\d+)[.)]\s+(.*)/.exec(l))) B.push({ type: 'ol', text: m[2] });
    else if ((m = /^#{1,4}\s+(.*)/.exec(l))) B.push({ type: 'h3', text: m[1] });
    else B.push({ type: 'p', text: l });
  }
  return B;
}
const toSec = t => t.split(':').map(Number).reduce((s, x) => s * 60 + x, 0);

async function callAI(body) {
  if (!WORKER) throw new Error('محتاج الـ Worker على Cloudflare');
  if (!navigator.onLine) throw new Error('محتاج نت');
  const { data } = await sb.auth.getSession();
  const r = await fetch(WORKER + '/ai', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: r.status === 404 ? 'الـ Worker محتاج يتحدّث بالكود الجديد' : 'رد غريب من الـ Worker' }));
  if (!r.ok || j.error) throw new Error(j.error || 'المساعد مردّش');
  return j;
}

// "ملف" الفيديو: بيتعمل مرة واحدة لكل فيديو وبيتحفظ في الكورس
async function digestOf(vid) {
  const C = S.ctx.cache();
  if (C[vid.v]?.summary) return C[vid.v];
  say('bot', 'بتفرّج على الفيديو كله وبعمل ملخص… ممكن ياخد دقيقة لو الفيديو طويل.', '', null, true);
  const j = await callAI({ mode: 'digest', url: vid.url, title: vid.title });
  dropWait();
  C[vid.v] = { summary: j.summary || '', points: Array.isArray(j.points) ? j.points.slice(0, 30) : [], terms: Array.isArray(j.terms) ? j.terms.slice(0, 30) : [], outline: String(j.outline || '').slice(0, 12000), at: Date.now() };
  S.ctx.keep();
  return C[vid.v];
}

function say(who, text, label, t, wait) { S.msgs.push({ who, text, label, t, wait }); paint(); }
function dropWait() { S.msgs = S.msgs.filter(m => !m.wait); }

function paint() {
  const box = S.host.querySelector('#aichat'); if (!box) return;
  box.innerHTML = S.msgs.length ? S.msgs.map((m, i) => m.who === 'me'
    ? `<div class="ai-me">${esc(m.text)}</div>`
    : `<div class="ai-bot${m.wait ? ' wait' : ''}${m.err ? ' err' : ''}"><div class="ai-who"><span class="ai-spark">✦</span>${m.wait ? '<span class="ai-dots"><i></i><i></i><i></i></span>' : esc(m.label || 'المساعد')}</div><div class="ai-txt">${m.wait || m.err ? esc(m.text) : md(m.text)}</div>
      ${!m.wait && !m.err ? `<div class="ai-acts"><button type="button" data-act="ai-tonotes" data-i="${i}">${ic('edit', 14)}حطها في الدفتر</button><button type="button" data-act="ai-copy" data-i="${i}">انسخ</button></div>` : ''}</div>`).join('')
    : `<div class="ai-empty"><span class="ai-spark big">✦</span><b>اسأل عن الفيديو</b><span class="mut">لخّصه، طلّع أهم النقط، اسأل عن معنى كلمة، أو خليه يشرحلك الجزء اللي إنت فيه.</span></div>`;
  S.host.querySelectorAll('.ai-chips button, .ai-in button').forEach(b => { b.disabled = S.busy; });
  const last = box.lastElementChild; if (last && S.msgs.length) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function aiReset() { S = null; }
export function aiPanel(host, ctx) {
  if (S && S.host === host) { S.ctx = ctx; return; }
  S = { ctx, host, msgs: [], busy: false };
  host.innerHTML = `<div class="ai">
    <div class="ai-chips">
      <button type="button" data-act="ai-go" data-m="summary">📝 لخّص الفيديو</button>
      <button type="button" data-act="ai-go" data-m="points">📍 أهم النقط بالأوقات</button>
      <button type="button" data-act="ai-go" data-m="terms">📖 الكلمات الصعبة ومعناها</button>
      <button type="button" data-act="ai-go" data-m="now">🎯 اشرح اللي بيتقال دلوقتي</button>
      <button type="button" data-act="ai-go" data-m="quiz">✅ اختبرني</button>
      <button type="button" data-act="ai-go" data-m="apply">🛠 أطبّقه إزاي في شغلي؟</button>
    </div>
    <div class="ai-chat" id="aichat" aria-live="polite"></div>
    <form class="ai-in" data-act-submit="ai-ask"><input name="q" class="inp" placeholder="اسأل عن أي كلمة أو حاجة في الفيديو…" autocomplete="off" enterkeyhint="send"><button type="submit" class="btn pri" aria-label="ابعت">${ic('back', 18)}</button></form>
    <p class="mut ai-note">المساعد بيتفرج على الفيديو مرة واحدة ويفتكره، فالأسئلة اللي بعدها بتبقى أسرع. ممكن يغلط، فلو حاجة مهمة راجعها في الفيديو.</p>
  </div>`;
  paint();
}

async function run(kind, q) {
  if (!S || S.busy) return;
  const vid = S.ctx.video(); if (!vid) return toast('شغّل الفيديو الأول');
  S.busy = true; paint();
  const labels = { summary: 'ملخص الفيديو', points: 'أهم النقط', terms: 'الكلمات الصعبة', now: 'اللي بيتقال دلوقتي', quiz: 'اختبار سريع', apply: 'أطبّقه إزاي', ask: 'المساعد' };
  try {
    if (kind === 'ask') say('me', q);
    if (kind === 'now') {
      const t = S.ctx.now();
      say('bot', `بتفرّج على الجزء اللي حوالين ${mmss(t)}…`, '', null, true);
      const j = await callAI({ mode: 'ask', deep: true, url: vid.url, title: vid.title, t, q: 'اشرحلي ببساطة اللي بيتقال في الجزء ده، وأي كلمة صعبة فيه معناها إيه.' });
      dropWait(); say('bot', j.text, `${labels.now} (${mmss(t)})`, t);
    } else {
      const d = await digestOf(vid);
      if (kind === 'summary') say('bot', d.summary, labels.summary);
      else if (kind === 'points') say('bot', d.points.map(p => `- [${mmss(p.t)}] ${p.text}`).join('\n') || 'ملقيتش نقط واضحة.', labels.points);
      else if (kind === 'terms') say('bot', d.terms.map(x => `- **${x.word}**: ${x.meaning}`).join('\n') || 'مفيش كلمات صعبة في الفيديو ده.', labels.terms);
      else {
        const qs = { quiz: 'اعملي 5 أسئلة اختيار من متعدد عن الفيديو ده (كل سؤال 3 اختيارات)، وبعدهم الإجابات الصح تحت عنوان "الإجابات".', apply: 'أنا مطور أعمال في شركة صيانة موبايلات. إزاي أطبّق أهم 3 أفكار في الفيديو ده في شغلي؟ خطوات عملية قصيرة.' };
        const hist = S.msgs.filter(m => !m.wait && !m.err).slice(-6).map(m => ({ who: m.who, text: String(m.text).slice(0, 1500) }));
        say('bot', 'بفكّر…', '', null, true);
        const j = await callAI({ mode: 'ask', url: vid.url, title: vid.title, t: S.ctx.now(), q: q || qs[kind], digest: d, history: hist });
        dropWait(); say('bot', j.text, labels[kind]);
      }
    }
  } catch (e) {
    dropWait(); S.msgs.push({ who: 'bot', err: true, text: e.message === 'Failed to fetch' ? 'ما قدرتش أوصل للـ Worker. اتأكد من النت.' : e.message }); paint();
  } finally { if (S) { S.busy = false; paint(); } }
}

export const aiGlobal = {
  'ai-go'(el) { run(el.dataset.m); },
  'ai-ask'(form) { const inp = form.querySelector('[name=q]'), q = inp.value.trim(); if (!q) return; inp.value = ''; run('ask', q); },
  'ai-seek'(el) { S?.ctx.seek(toSec(el.dataset.t)); },
  async 'ai-tonotes'(el) { const m = S?.msgs[+el.dataset.i]; if (!m) return; await S.ctx.toNotes(toBlocks(m.text, m.label || 'من المساعد', m.t)); toast('اتحطت في آخر الدفتر'); },
  async 'ai-copy'(el) { const m = S?.msgs[+el.dataset.i]; if (!m) return; try { await navigator.clipboard.writeText(m.text); toast('اتنسخت'); } catch (e) { toast('ما اتنسختش'); } },
};
