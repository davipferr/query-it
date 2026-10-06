// Markdown das células de nota. Um subconjunto pequeno, convertido em árvore e montado com h():
// nunca vira HTML, então o texto de um notebook importado não consegue injetar markup.
// Blocos: # títulos, parágrafos, listas (- * 1.), > citação, ``` código, --- linha.
// Inline: `código`, **negrito**, *itálico* / _itálico_, [texto](url).
import { h } from './lib/dom.js';

// Link só para destinos que não executam nada: javascript:, data: etc. viram texto puro.
export function safeHref(url) {
  const trimmed = url.trim();
  return /^(https?:|mailto:)/i.test(trimmed) ? trimmed : null;
}

// `_` só marca ênfase fora de palavras: nomes como order_items_total ficam intactos.
const INLINE =
  /`([^`]+)`|\*\*(.+?)\*\*|(?<!\w)__(.+?)__(?!\w)|\*([^*\s][^*]*)\*|(?<!\w)_([^_\s][^_]*)_(?!\w)|\[([^\]]+)\]\(([^)\s]+)\)/;

export function parseInline(text) {
  const nodes = [];
  let rest = text;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      nodes.push({ type: 'text', text: rest });
      break;
    }
    if (m.index > 0) nodes.push({ type: 'text', text: rest.slice(0, m.index) });
    const [whole, code, strong1, strong2, em1, em2, label, href] = m;
    if (code !== undefined) nodes.push({ type: 'code', text: code });
    else if (strong1 !== undefined || strong2 !== undefined) {
      nodes.push({ type: 'strong', children: parseInline(strong1 ?? strong2) });
    } else if (em1 !== undefined || em2 !== undefined) {
      nodes.push({ type: 'em', children: parseInline(em1 ?? em2) });
    } else {
      const safe = safeHref(href);
      nodes.push(safe ? { type: 'link', href: safe, children: parseInline(label) } : { type: 'text', text: whole });
    }
    rest = rest.slice(m.index + whole.length);
  }
  return nodes;
}

const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;

export function parse(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      const code = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i += 1;
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2].trim()) });
      i += 1;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: 'rule' });
      i += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', children: parseInline(quoted.join(' ')) });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = item[2] !== undefined;
      const items = [];
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i]);
        if (!m || (m[2] !== undefined) !== ordered) break;
        items.push(parseInline(m[3]));
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    // Parágrafo: linhas seguidas até uma em branco ou o início de outro bloco.
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|\s*```|\s*>)/.test(lines[i]) &&
      !LIST_ITEM.test(lines[i])
    ) {
      para.push(lines[i++].trim());
    }
    blocks.push({ type: 'paragraph', children: parseInline(para.join(' ')) });
  }
  return blocks;
}

function renderInline(nodes) {
  return nodes.map((node) => {
    if (node.type === 'text') return node.text;
    if (node.type === 'code') return h('code', {}, node.text);
    if (node.type === 'strong') return h('strong', {}, renderInline(node.children));
    if (node.type === 'em') return h('em', {}, renderInline(node.children));
    return h('a', { href: node.href, target: '_blank', rel: 'noopener noreferrer' }, renderInline(node.children));
  });
}

// Elementos prontos para show(); todo texto entra como nó de texto via h().
export function render(source) {
  return parse(source).map((block) => {
    switch (block.type) {
      case 'heading':
        return h(`h${block.level}`, {}, renderInline(block.children));
      case 'code':
        return h('pre', {}, h('code', {}, block.text));
      case 'rule':
        return h('hr');
      case 'quote':
        return h('blockquote', {}, renderInline(block.children));
      case 'list':
        return h(block.ordered ? 'ol' : 'ul', {}, block.items.map((item) => h('li', {}, renderInline(item))));
      default:
        return h('p', {}, renderInline(block.children));
    }
  });
}
