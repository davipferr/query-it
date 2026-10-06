import { runSqlCell } from './sql-cell.js';
import { runJsCell } from './js-cell.js';
import { createEditor, LANGUAGES } from './editor.js';
import { h } from '../lib/dom.js';

let counter = 0;

// Evento que sobe do .cell quando o código muda; o resto (nome, linguagem, ordem) já gera
// eventos nativos ou mutações no DOM que o app observa.
export const CELL_CHANGE_EVENT = 'cell-change';

const cellsByElement = new WeakMap();

// Chamado antes de restaurar células salvas, para um id novo nunca repetir um id restaurado.
export function reserveCellIds(n) {
  counter = Math.max(counter, n);
}

// `saved` vem de persistence.js: { id, name, language, source }, já validado.
export function createCell(type, saved = null) {
  let id = saved?.id;
  if (!id) {
    counter += 1;
    id = `cell_${counter}`;
  }
  // hasOwn, não LANGUAGES[x]: "constructor" ou "__proto__" vindos do storage existiriam via protótipo.
  const language = saved && Object.hasOwn(LANGUAGES, saved.language) ? saved.language : type;

  const outputEl = h('div', { className: 'cell-output' });
  const statusEl = h('span', { className: 'cell-status' });
  const runBtn = h('button', { type: 'button', className: 'run-btn' }, '▶ Run');
  const moveUpBtn = h('button', { type: 'button', className: 'move-up-btn', title: 'Mover célula para cima' }, '▲');
  const moveDownBtn = h('button', { type: 'button', className: 'move-down-btn', title: 'Mover célula para baixo' }, '▼');
  const removeBtn = h('button', { type: 'button', className: 'remove-btn', title: 'Remover célula' }, '✕');
  const nameInput =
    type === 'sql'
      ? h('input', { className: 'cell-name', placeholder: 'nome da variável (opcional)', value: saved ? saved.name : id })
      : null;
  const languageSelect = h(
    'select',
    { className: 'cell-language', title: 'Linguagem do destaque de sintaxe' },
    Object.entries(LANGUAGES).map(([key, { label }]) => h('option', { value: key, selected: key === language }, label)),
  );
  const sourceEl = h('div', { className: 'cell-source' });

  const el = h(
    'div',
    { className: 'cell' },
    h(
      'div',
      { className: 'cell-header' },
      h('span', { className: 'cell-type' }, type.toUpperCase()),
      nameInput ?? h('span', { style: { flex: '1' } }),
      languageSelect,
      runBtn,
      statusEl,
      moveUpBtn,
      moveDownBtn,
      removeBtn,
    ),
    sourceEl,
    outputEl,
  );

  // A linguagem do editor muda só o destaque de sintaxe; a execução segue o tipo da célula.
  const editor = createEditor({
    parent: sourceEl,
    language,
    doc: saved?.source ?? '',
    onChange: () => el.dispatchEvent(new CustomEvent(CELL_CHANGE_EVENT, { bubbles: true })),
    placeholderText:
      type === 'sql'
        ? 'SELECT * FROM ...'
        : '// use as variáveis das células SQL/JS anteriores, ex: charts.createBarChart(el, minhaTabela.rows, {x:"nome", y:"total"})',
    onRun: () => runBtn.click(),
  });

  languageSelect.addEventListener('change', () => editor.setLanguage(languageSelect.value));

  runBtn.addEventListener('click', () => {
    if (type === 'sql') {
      runSqlCell({ sql: editor.getValue(), outputEl, statusEl, nameInput, id });
    } else {
      runJsCell({ code: editor.getValue(), outputEl, statusEl });
    }
  });

  // Mover só reordena o DOM: as variáveis do kernel seguem a ordem de execução, não a posição.
  moveUpBtn.addEventListener('click', () => {
    const prev = el.previousElementSibling;
    if (prev) prev.before(el);
  });

  moveDownBtn.addEventListener('click', () => {
    const next = el.nextElementSibling;
    if (next) next.after(el);
  });

  removeBtn.addEventListener('click', () => {
    editor.destroy();
    el.remove();
  });

  // Célula restaurada não roda sozinha: isso consultaria o banco sem o usuário pedir.
  if (saved) statusEl.textContent = 'Não executada';

  const serialize = () => ({
    id,
    type,
    ...(nameInput ? { name: nameInput.value } : {}),
    language: languageSelect.value,
    source: editor.getValue(),
  });

  const cell = { id, type, el, editor, outputEl, statusEl, nameInput, serialize };
  cellsByElement.set(el, cell);
  return cell;
}

// A ordem salva é a ordem no DOM, então mover células não precisa de controle à parte.
export function serializeCells(container) {
  return [...container.children]
    .map((el) => cellsByElement.get(el))
    .filter(Boolean)
    .map((cell) => cell.serialize());
}

export function insertSqlPreset(container, sqlText) {
  const cell = createCell('sql');
  cell.editor.setValue(sqlText);
  container.appendChild(cell.el);
  cell.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
