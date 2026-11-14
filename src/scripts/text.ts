/* Masked line rise for headlines: words are split into lines, each line rises behind its own mask.
   One italic phrase per headline survives the split. Run again after fonts load or the width changes. */

interface Piece { t: string; it: boolean }
type Word = Piece[];

/** Words as runs of { t, it } pieces, so "press" + "." stay one word with only the first piece in italic. */
function wordsOf(node: Node, it = false, out: Word[] = [], st = { open: false }): Word[] {
  node.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) (n.textContent ?? '').split(/(\s+)/).forEach((t) => {
      if (!t) return;
      if (/^\s+$/.test(t)) { st.open = false; return; }
      const last = out.at(-1);
      if (st.open && last) last.push({ t, it }); else out.push([{ t, it }]);
      st.open = true;
    });
    else if (n.nodeType === Node.ELEMENT_NODE) wordsOf(n, it || (n as Element).tagName === 'EM', out, st);
  });
  return out;
}

const putWord = (parent: HTMLElement, word: Word, space: boolean) => word.forEach(({ t, it }, i) => {
  const s = t + (space && i === word.length - 1 ? ' ' : '');
  if (it) { const e = document.createElement('em'); e.textContent = s; parent.append(e); } else parent.append(s);
});

export function split(groups: HTMLElement[]): void {
  groups.forEach((g) => {
    let n = 0;
    g.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
      const tpl = document.createElement('template');
      tpl.innerHTML = el.dataset.html ?? (el.dataset.html = el.innerHTML.trim());
      const words = wordsOf(tpl.content);
      el.textContent = '';
      const spans = words.map((w) => { const s = document.createElement('span'); putWord(s, w, true); el.append(s); return s; });
      const lines: { top: number; w: Word[] }[] = [];
      spans.forEach((s, i) => { const top = s.offsetTop, L = lines.at(-1), w = words[i]!; if (L && Math.abs(L.top - top) < 4) L.w.push(w); else lines.push({ top, w: [w] }); });
      el.textContent = '';
      el.setAttribute('aria-label', words.map((w) => w.map((x) => x.t).join('')).join(' '));
      lines.forEach((L) => {
        const m = document.createElement('span'); m.className = 'mask'; m.setAttribute('aria-hidden', 'true');
        const l = document.createElement('span'); l.className = 'line'; l.style.setProperty('--i', String(n++));
        L.w.forEach((w, k) => putWord(l, w, k < L.w.length - 1));
        m.append(l); el.append(m);
      });
    });
  });
}
