// Única forma de montar DOM no app. Texto sempre vira nó de texto, nunca HTML:
// com isso, dado do banco (nomes, valores, mensagens de erro) não consegue injetar markup.
// innerHTML/outerHTML/insertAdjacentHTML são proibidos pelo ESLint.

// Exemplo: h('button', { className: 'run-btn', type: 'button', onClick: fn }, '▶ Run')
// Props: className, style (objeto), on<Evento> (listener), demais viram propriedade
// do elemento quando ela existe (value, type, title...) ou atributo.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'style') Object.assign(el.style, value);
    else if (/^on[A-Z]/.test(key)) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false).map(toNode));
  return el;
}

function toNode(child) {
  return child instanceof Node ? child : document.createTextNode(String(child));
}

// Troca todo o conteúdo do elemento (sem argumentos, só limpa).
export function show(el, ...children) {
  el.replaceChildren(...children.flat().filter((c) => c !== null && c !== undefined).map(toNode));
}

// Mensagem curta de status/erro dentro de um container.
export function showMessage(el, text, className = 'hint') {
  show(el, h('p', { className }, text));
}
