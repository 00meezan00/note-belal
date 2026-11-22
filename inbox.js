// صندوق الوارد: أي حاجة سجلتها بسرعة ومش عارف هي إيه. في المراجعة الأسبوعية بترتّبها
import { list, one, ins, archive } from './db.js';
import { esc, ic, fd, toast, fail } from './ui.js';
import { doRefresh } from './comps.js';
import { waitSheet } from './people.js';
import { withMentions } from './mentions.js';
import { lifeData } from './life.js';

export const inboxItems = () => list('inbox', { order: 'created_at' });

// سطر صغير في "النهاردة"
export async function inboxLine() {
  const n = (await inboxItems()).length;
  return n ? `<a class="card row" href="#/weekly" style="gap:10px;padding:10px 14px">${ic('archive', 18)}<span style="flex:1">في صندوق الوارد <b class="num">${n}</b> ${n === 1 ? 'حاجة' : n === 2 ? 'حاجتين' : 'حاجات'} مستنية ترتّبها</span>${ic('chev', 16)}</a>` : '';
}

// كارت الترتيب في المراجعة الأسبوعية: كل حاجة تحوّلها بضغطة
export async function inboxCard() {
  const L = await inboxItems();
  if (!L.length) return '';
  const btn = (x, to, l) => `<button class="btn sm" data-act="ibx" data-to="${to}" data-id="${x.id}">${l}</button>`;
  return `<div class="card stack" style="gap:8px" id="inbox"><div class="row" style="gap:6px">${ic('archive', 20)}<b style="font-weight:600;flex:1">صندوق الوارد</b><span class="num mut">${L.length}</span></div>
    <div class="mut" style="font-size:13px">كل حاجة: دي إيه؟</div>
    <div class="list">${L.map(x => `<div style="padding:8px 0"><div style="line-height:1.6">${esc(x.text)}</div><small class="mut">${fd(x.created_at)}</small>
      <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">${btn(x, 'task', 'مهمة')}${btn(x, 'idea', 'فكرة')}${btn(x, 'problem', 'مشكلة')}${btn(x, 'wait', 'مستني من حد')}<button class="btn sm" data-act="ibx" data-to="del" data-id="${x.id}">${ic('trash', 16)}</button></div></div>`).join('')}</div></div>`;
}

export const inboxGlobal = {
  async ibx(el) {
    const x = await one('inbox', el.dataset.id); if (!x) return;
    const to = el.dataset.to, t = x.text;
    try {
      if (to === 'wait') return waitSheet({}, { text: t, inboxId: x.id });
      if (to === 'task') await withMentions('tasks', 'task', await ins('tasks', { title: t }), t);
      if (to === 'idea') await withMentions('ideas', 'idea', await ins('ideas', { title: t.split('\n')[0].slice(0, 120), body: t.length > 120 ? t : null, source: 'voice' }), t, 'area');
      if (to === 'problem') { const fix = (await lifeData()).tracks.find(k => /fix/i.test(k.name)); await withMentions('problems', 'problem', await ins('problems', { title: t, ...(fix ? { track_id: fix.id, category: fix.name } : {}) }), t, 'category'); }
      await archive('inbox', x.id);
      toast(to === 'del' ? 'اتمسحت' : `بقت ${({ task: 'مهمة', idea: 'فكرة', problem: 'مشكلة' })[to]}`); doRefresh();
    } catch (e) { fail(e); }
  },
};
